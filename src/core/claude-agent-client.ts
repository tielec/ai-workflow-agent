import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { parseClaudeEvent, determineClaudeEventType } from './helpers/agent-event-parser.js';
import { formatClaudeLog } from './helpers/log-formatter.js';

interface ExecuteTaskOptions {
  prompt: string;
  systemPrompt?: string | null;
  maxTurns?: number;
  workingDirectory?: string;
  verbose?: boolean;
}

const DEFAULT_MAX_TURNS = 50;

export class ClaudeAgentClient {
  private readonly workingDir: string;
  private readonly model?: string;

  constructor(options: { workingDir?: string; model?: string; credentialsPath?: string } = {}) {
    this.workingDir = options.workingDir ?? process.cwd();
    this.model = options.model;

    this.ensureAuthToken(options.credentialsPath);

    // 環境変数の設定を確認
    const skipPermissions = config.getClaudeDangerouslySkipPermissions();
    if (skipPermissions) {
      logger.info('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 detected. Using permissionMode="bypassPermissions".');
    } else {
      logger.info('Using permissionMode="acceptEdits" (default).');
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
    const skipPermissions = config.getClaudeDangerouslySkipPermissions();
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
    const event = parseClaudeEvent(message);
    if (!event) {
      return;
    }

    const formattedLog = formatClaudeLog(event);
    if (formattedLog) {
      logger.info(formattedLog);
    }
  }

  private ensureAuthToken(credentialsPath?: string): void {
    const resolvedPath = credentialsPath ?? config.getClaudeCredentialsPath() ?? null;

    if (resolvedPath) {
      const token = this.readTokenFromCredentials(resolvedPath);
      logger.info(`Loaded Claude Code credentials from ${resolvedPath} (token length=${token.length})`);
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      return;
    }

    const token = config.getClaudeOAuthToken();
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
