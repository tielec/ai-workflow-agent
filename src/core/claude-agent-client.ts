import fs from 'fs-extra';
import { query, type SDKMessage, type SDKAssistantMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

interface ExecuteTaskOptions {
  prompt: string;
  systemPrompt?: string | null;
  maxTurns?: number;
  workingDirectory?: string;
  verbose?: boolean;
}

const DEFAULT_MAX_TURNS = 50;
const MAX_LOG_PARAM_LENGTH = 500;

export class ClaudeAgentClient {
  private readonly workingDir: string;
  private readonly model?: string;

  constructor(options: { workingDir?: string; model?: string; credentialsPath?: string } = {}) {
    this.workingDir = options.workingDir ?? process.cwd();
    this.model = options.model;

    this.ensureAuthToken(options.credentialsPath);

    // 環境変数の設定を確認
    const skipPermissions = process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS === '1';
    if (skipPermissions) {
      console.info('[INFO] CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 detected. Using permissionMode="bypassPermissions".');
    } else {
      console.info('[INFO] Using permissionMode="acceptEdits" (default).');
    }
  }

  public getWorkingDirectory(): string {
    return this.workingDir;
  }

  public async executeTask(options: ExecuteTaskOptions): Promise<string[]> {
    const { prompt, systemPrompt = null, maxTurns = DEFAULT_MAX_TURNS, verbose = true } = options;
    const cwd = options.workingDirectory ?? this.workingDir;

    // 環境変数でBashコマンド承認スキップを確認（Docker環境内で安全）
    // CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 の場合、すべての操作を自動承認
    const skipPermissions = process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS === '1';
    const permissionMode = skipPermissions ? 'bypassPermissions' : 'acceptEdits';

    const stream = query({
      prompt,
      options: {
        cwd,
        permissionMode,
        maxTurns,
        model: this.model,
        systemPrompt: systemPrompt ?? undefined,
      },
    });

    const messages: string[] = [];

    for await (const message of stream) {
      messages.push(JSON.stringify(message));
      if (verbose) {
        this.logMessage(message);
      }
    }

    return messages;
  }

  public async executeTaskFromFile(
    promptFile: string,
    templateVars?: Record<string, string>,
    systemPrompt?: string,
    maxTurns?: number,
    verbose?: boolean,
  ): Promise<string[]> {
    const template = fs.readFileSync(promptFile, 'utf-8');
    const prompt = this.fillTemplate(template, templateVars ?? {});
    return this.executeTask({ prompt, systemPrompt, maxTurns, verbose });
  }

  private fillTemplate(template: string, variables: Record<string, string>): string {
    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return content;
  }

  private logMessage(message: SDKMessage): void {
    switch (message.type) {
      case 'assistant':
        this.logAssistantMessage(message);
        break;
      case 'result':
        this.logResultMessage(message);
        break;
      case 'system': {
        const subtype = 'subtype' in message && message.subtype ? message.subtype : 'system';
        console.log(`[AGENT SYSTEM] ${subtype}`);
        break;
      }
      case 'stream_event':
        this.logStreamEvent(message);
        break;
      default:
        break;
    }
  }

  private logAssistantMessage(message: SDKAssistantMessage): void {
    const contents = message.message.content ?? [];
    for (const block of contents) {
      if (block.type === 'text') {
        const text = block.text?.trim();
        if (text) {
          console.log(`[AGENT THINKING] ${text}`);
        }
      } else if (block.type === 'tool_use') {
        console.log(`[AGENT ACTION] Using tool: ${block.name}`);
        if (block.input && Object.keys(block.input).length > 0) {
          const raw = JSON.stringify(block.input);
          const truncated = raw.length > MAX_LOG_PARAM_LENGTH ? `${raw.slice(0, MAX_LOG_PARAM_LENGTH)}…` : raw;
          console.log(`[AGENT ACTION] Parameters: ${truncated}`);
        }
      }
    }
  }

  private logResultMessage(message: SDKResultMessage): void {
    console.log(
      `[AGENT RESULT] status=${message.subtype ?? 'success'}, turns=${message.num_turns}, duration_ms=${message.duration_ms}`,
    );
    const resultText = (message as Partial<{ result: string }>).result;
    if (typeof resultText === 'string' && resultText.trim().length > 0) {
      console.log(`[AGENT RESULT] ${resultText}`);
    }
  }

  private logStreamEvent(message: SDKMessage): void {
    if (message.type !== 'stream_event') {
      return;
    }

    const event = message.event;
    if (!event || event.type !== 'message_delta') {
      return;
    }

    const delta = event.delta;
    if (!delta || delta.type !== 'message_delta') {
      return;
    }

    for (const block of delta.delta?.content ?? []) {
      if (block.type === 'input_json_delta' && block.partial_input_json) {
        const raw = block.partial_input_json;
        const truncated = raw.length > MAX_LOG_PARAM_LENGTH ? `${raw.slice(0, MAX_LOG_PARAM_LENGTH)}…` : raw;
        console.log(`[AGENT ACTION] Partial parameters: ${truncated}`);
      } else if (block.type === 'text_delta' && block.text_delta?.trim()) {
        console.log(`[AGENT THINKING] ${block.text_delta.trim()}`);
      }
    }
  }

  private ensureAuthToken(credentialsPath?: string): void {
    const resolvedPath = credentialsPath ?? process.env.CLAUDE_CODE_CREDENTIALS_PATH ?? null;

    if (resolvedPath) {
      const token = this.readTokenFromCredentials(resolvedPath);
      console.info(`[INFO] Loaded Claude Code credentials from ${resolvedPath} (token length=${token.length})`);
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      return;
    }

    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!token || !token.trim()) {
      throw new Error(
        [
          'Claude Code credentials are not configured.',
          'Provide a valid credentials file via CLAUDE_CODE_CREDENTIALS_PATH or set CLAUDE_CODE_OAUTH_TOKEN.',
        ].join('\n'),
      );
    }
  }

  private readTokenFromCredentials(credentialsPath: string): string {
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Claude Code credentials file not found: ${credentialsPath}`);
    }

    const raw = fs.readFileSync(credentialsPath, 'utf-8').trim();
    if (!raw) {
      throw new Error(`Claude Code credentials file is empty: ${credentialsPath}`);
    }

    let token: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        token = parsed.trim();
      } else {
        token = this.extractToken(parsed);
      }
    } catch {
      // Not JSON – treat as raw token string.
    }

    if (!token) {
      const trimmed = raw.trim();
      if (trimmed) {
        token = trimmed;
      }
    }

    if (!token) {
      throw new Error(`Unable to extract Claude Code token from credentials file: ${credentialsPath}`);
    }

    return token;
  }

  private extractToken(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed.length > 20 && !trimmed.includes(' ')) {
        return trimmed;
      }
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const token = this.extractToken(item);
        if (token) {
          return token;
        }
      }
      return null;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const directKeys = ['token', 'access_token', 'accesstoken', 'oauth_token'];
      for (const key of Object.keys(obj)) {
        const candidate = obj[key];
        if (typeof candidate === 'string') {
          const lower = key.toLowerCase();
          if (directKeys.includes(lower)) {
            const trimmed = candidate.trim();
            if (trimmed) {
              return trimmed;
            }
          }
        }
      }

      for (const nested of Object.values(obj)) {
        const token = this.extractToken(nested);
        if (token) {
          return token;
        }
      }
    }

    return null;
  }

}
