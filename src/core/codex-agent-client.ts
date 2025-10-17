import fs from 'fs-extra';
import { spawn } from 'node:child_process';

interface ExecuteTaskOptions {
  prompt: string;
  systemPrompt?: string | null;
  maxTurns?: number;
  workingDirectory?: string;
  verbose?: boolean;
  model?: string | null;
}

type CodexEvent = {
  type?: string;
  subtype?: string | null;
  message?: {
    role?: string;
    content?: Array<Record<string, unknown>>;
  };
  result?: string | null;
  status?: string | null;
  turns?: number;
  duration_ms?: number;
  [key: string]: unknown;
};

const DEFAULT_MAX_TURNS = 50;
const MAX_LOG_PARAM_LENGTH = 500;

export class CodexAgentClient {
  private readonly workingDir: string;
  private readonly binaryPath: string;
  private readonly defaultModel?: string;

  constructor(options: { workingDir?: string; binaryPath?: string; model?: string } = {}) {
    this.workingDir = options.workingDir ?? process.cwd();
    this.binaryPath = options.binaryPath ?? process.env.CODEX_CLI_PATH ?? 'codex';
    this.defaultModel = options.model ?? undefined;
  }

  public getWorkingDirectory(): string {
    return this.workingDir;
  }

  public getBinaryPath(): string {
    return this.binaryPath;
  }

  public async executeTask(options: ExecuteTaskOptions): Promise<string[]> {
    const cwd = options.workingDirectory ?? this.workingDir;
    const args: string[] = ['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];

    const model = options.model ?? this.defaultModel;
    if (model) {
      args.push('--model', model);
    }

    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    if (Number.isFinite(maxTurns)) {
      args.push('-c', `max_turns=${maxTurns}`);
    }

    if (cwd) {
      args.push('--cd', cwd);
    }

    args.push('-');

    const finalPrompt =
      options.systemPrompt && options.systemPrompt.trim().length > 0
        ? `${options.systemPrompt.trim()}\n\n${options.prompt}`
        : options.prompt;

    try {
      return await this.runCodexProcess(args, {
        cwd,
        verbose: options.verbose ?? true,
        stdinPayload: finalPrompt,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const message = err?.message ?? '';
      const missingBinary =
        err?.code === 'ENOENT' ||
        message.includes('ENOENT') ||
        message.includes('spawn codex ENOENT');

      if (missingBinary) {
        const helpMessage = [
          `Codex CLI binary not found at "${this.binaryPath}".`,
          'Install the Codex CLI or set CODEX_CLI_PATH to the executable path before running the workflow.',
        ].join(' ');
        const wrapped = new Error(helpMessage) as NodeJS.ErrnoException & { cause?: unknown };
        wrapped.code = 'CODEX_CLI_NOT_FOUND';
        wrapped.cause = error;
        throw wrapped;
      }

      throw error;
    }
  }

  public async executeTaskFromFile(
    promptFile: string,
    templateVars?: Record<string, string>,
    systemPrompt?: string,
    maxTurns?: number,
    verbose?: boolean,
    model?: string,
  ): Promise<string[]> {
    const template = fs.readFileSync(promptFile, 'utf-8');
    const prompt = this.fillTemplate(template, templateVars ?? {});
    return this.executeTask({
      prompt,
      systemPrompt,
      maxTurns,
      verbose,
      model,
    });
  }

  private async runCodexProcess(
    args: string[],
    options: { cwd: string; verbose: boolean; stdinPayload: string },
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const messages: string[] = [];
      const childEnv = { ...process.env };

      if (childEnv.CODEX_API_KEY && typeof childEnv.CODEX_API_KEY === 'string') {
        childEnv.OPENAI_API_KEY = childEnv.CODEX_API_KEY.trim();
      }

      // GitHub CLI用の環境変数を設定
      if (childEnv.GITHUB_TOKEN && typeof childEnv.GITHUB_TOKEN === 'string') {
        childEnv.GH_TOKEN = childEnv.GITHUB_TOKEN.trim();
      }

      delete childEnv.CODEX_AUTH_FILE;

      const child = spawn(this.binaryPath, args, {
        cwd: options.cwd,
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdin?.write(options.stdinPayload);
      child.stdin?.end();

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          messages.push(line);
          if (options.verbose) {
            this.logEvent(line);
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          messages.push(stdoutBuffer.trim());
          if (options.verbose) {
            this.logEvent(stdoutBuffer.trim());
          }
        }

        if (code === 0) {
          resolve(messages);
        } else {
          const stderr = stderrBuffer.trim();
          const message = [
            `Codex CLI exited with code ${code ?? 'unknown'}.`,
            stderr ? `stderr: ${stderr}` : null,
          ]
            .filter(Boolean)
            .join(' ');
          reject(new Error(message));
        }
      });
    });
  }

  private logEvent(raw: string): void {
    let payload: CodexEvent | null = null;

    try {
      payload = JSON.parse(raw) as CodexEvent;
    } catch {
      console.log(`[CODEX RAW] ${raw}`);
      return;
    }

    const eventType = payload.type ?? payload.message?.role ?? 'unknown';
    switch (eventType) {
      case 'assistant':
      case 'assistant_message': {
        const content = payload.message?.content ?? [];
        for (const block of content) {
          const blockType = block.type;
          if (blockType === 'text') {
            const text = typeof block.text === 'string' ? block.text.trim() : '';
            if (text) {
              console.log(`[CODEX THINKING] ${text}`);
            }
          } else if (blockType === 'tool_use') {
            const name = typeof block.name === 'string' ? block.name : 'unknown';
            console.log(`[CODEX ACTION] Using tool: ${name}`);
            if (block.input && typeof block.input === 'object') {
              const rawInput = JSON.stringify(block.input);
              const truncated =
                rawInput.length > MAX_LOG_PARAM_LENGTH
                  ? `${rawInput.slice(0, MAX_LOG_PARAM_LENGTH)}…`
                  : rawInput;
              console.log(`[CODEX ACTION] Parameters: ${truncated}`);
            }
          }
        }
        break;
      }
      case 'result':
      case 'session_result': {
        const status = payload.status ?? payload.subtype ?? 'success';
        const turns = payload.turns ?? payload.message?.content?.length ?? 'N/A';
        const duration = payload.duration_ms ?? 'N/A';
        console.log(`[CODEX RESULT] status=${status}, turns=${turns}, duration_ms=${duration}`);
        if (payload.result && typeof payload.result === 'string' && payload.result.trim()) {
          console.log(`[CODEX RESULT] ${payload.result.trim()}`);
        }
        break;
      }
      case 'system': {
        const subtype = payload.subtype ?? 'system';
        console.log(`[CODEX SYSTEM] ${subtype}`);
        break;
      }
      default: {
        console.log(`[CODEX EVENT] ${JSON.stringify(payload)}`);
      }
    }
  }

  private fillTemplate(template: string, variables: Record<string, string>): string {
    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return content;
  }
}
