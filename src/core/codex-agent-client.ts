import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { spawn } from 'node:child_process';
import { parseCodexEvent, determineCodexEventType } from './helpers/agent-event-parser.js';
import { formatCodexLog } from './helpers/log-formatter.js';
import { setupCodexEnvironment } from './helpers/env-setup.js';

interface ExecuteTaskOptions {
  prompt: string;
  systemPrompt?: string | null;
  maxTurns?: number;
  workingDirectory?: string;
  verbose?: boolean;
  model?: string | null;
}

const DEFAULT_MAX_TURNS = 50;

export class CodexAgentClient {
  private readonly workingDir: string;
  private readonly binaryPath: string;
  private readonly defaultModel?: string;

  constructor(options: { workingDir?: string; binaryPath?: string; model?: string } = {}) {
    this.workingDir = options.workingDir ?? process.cwd();
    this.binaryPath = options.binaryPath ?? config.getCodexCliPath();
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
      const childEnv = setupCodexEnvironment(process.env);

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
    const payload = parseCodexEvent(raw);
    if (!payload) {
      logger.info(`[CODEX RAW] ${raw}`);
      return;
    }

    const eventType = determineCodexEventType(payload);
    const formattedLog = formatCodexLog(eventType, payload);

    if (formattedLog) {
      logger.info(formattedLog);
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
