import * as fs from 'node:fs';
import * as path from 'node:path';
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
  model?: string | null;
}

const DEFAULT_MAX_TURNS = 50;

/**
 * Default Claude model for agent execution.
 * Opus 4.5 provides the highest capability for complex tasks.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-5-20251101';

/**
 * Claude model aliases for user-friendly model selection.
 */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-3-5-20241022',
};

/**
 * Resolve a model alias or ID to the actual model ID.
 *
 * @param modelOrAlias - Model alias (opus, sonnet, haiku) or full model ID
 * @returns Resolved model ID
 */
export function resolveClaudeModel(modelOrAlias: string | undefined | null): string {
  if (!modelOrAlias || !modelOrAlias.trim()) {
    return DEFAULT_CLAUDE_MODEL;
  }

  const normalized = modelOrAlias.toLowerCase().trim();

  // Check if it's an alias
  if (CLAUDE_MODEL_ALIASES[normalized]) {
    return CLAUDE_MODEL_ALIASES[normalized];
  }

  // Return as-is (assume it's a full model ID)
  return modelOrAlias;
}

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

    // Issue #494: cwd が存在しない場合は process.cwd() にフォールバック
    // Docker 環境で workingDir の解決に失敗した場合の対策
    if (!fs.existsSync(cwd)) {
      logger.warn(`Working directory does not exist: ${cwd}. Falling back to process.cwd(): ${process.cwd()}`);
      return this.executeTask({ ...options, workingDirectory: process.cwd() });
    }

    // 環境変数でBashコマンド承認スキップを確認（Docker環境内で安全）
    // CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 の場合、すべての操作を自動承認
    const skipPermissions = config.getClaudeDangerouslySkipPermissions();
    const permissionMode = skipPermissions ? 'bypassPermissions' : 'acceptEdits';

    // Issue #494: Docker 環境で node が PATH にない場合に備えて、
    // process.execPath のディレクトリを PATH に追加
    // Claude Agent SDK は内部で node を spawn するため、PATH に node が必要
    const nodeDir = path.dirname(process.execPath);
    const currentPath = process.env.PATH || '';
    const pathParts = currentPath.split(path.delimiter).filter(Boolean);

    if (!pathParts.includes(nodeDir)) {
      process.env.PATH = `${nodeDir}${path.delimiter}${currentPath}`;
    }

    const stream = query({
      prompt,
      options: {
        cwd,
        permissionMode,
        maxTurns,
        model: options.model ?? this.model,
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
    model?: string,
  ): Promise<string[]> {
    const template = fs.readFileSync(promptFile, 'utf-8');
    const prompt = this.fillTemplate(template, templateVars ?? {});
    return this.executeTask({ prompt, systemPrompt, maxTurns, verbose, model });
  }

  /**
   * Fills template placeholders with provided variables.
   *
   * Security: Uses replaceAll() instead of RegExp to prevent ReDoS attacks.
   * The replaceAll() method treats the search string as a literal, not a regex pattern.
   *
   * @param template - Template string with {key} placeholders
   * @param variables - Key-value pairs to replace in template
   * @returns Template string with placeholders replaced
   */
  private fillTemplate(template: string, variables: Record<string, string>): string {
    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      // Security: Use replaceAll() instead of RegExp to prevent ReDoS attacks
      // replaceAll() treats the search string as a literal, not a regex pattern
      content = content.replaceAll(`{${key}}`, value);
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
    // 1. CLAUDE_CODE_OAUTH_TOKEN が設定されていればそれを使用（最優先）
    const oauthToken = config.getClaudeOAuthToken();
    if (oauthToken && oauthToken.trim()) {
      logger.info('Using CLAUDE_CODE_OAUTH_TOKEN for Claude Code authentication.');
      return;
    }

    // 2. CLAUDE_CODE_API_KEY が設定されていればそれを使用（フォールバック）
    const apiKey = config.getClaudeCodeApiKey();
    if (apiKey && apiKey.trim()) {
      logger.info('Using CLAUDE_CODE_API_KEY for Claude Code authentication (fallback).');
      process.env.CLAUDE_CODE_OAUTH_TOKEN = apiKey;
      return;
    }

    // 3. credentials.json ファイルから読み込み（レガシー、非推奨）
    const resolvedPath = credentialsPath ?? config.getClaudeCredentialsPath() ?? null;
    if (resolvedPath) {
      const token = this.readTokenFromCredentials(resolvedPath);
      logger.info(`Loaded Claude Code credentials from ${resolvedPath} (token length=${token.length}) [DEPRECATED]`);
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      return;
    }

    // 認証情報が見つからない
    throw new Error(
      [
        'Claude Code credentials are not configured.',
        'Set CLAUDE_CODE_OAUTH_TOKEN (preferred) or CLAUDE_CODE_API_KEY environment variable.',
        'CLAUDE_CODE_CREDENTIALS_PATH is deprecated and will be removed in a future version.',
      ].join('\n'),
    );
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
