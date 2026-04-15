import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { spawn } from 'node:child_process';
import { parseCodexEvent, determineCodexEventType } from './helpers/agent-event-parser.js';
import { formatCodexLog } from './helpers/log-formatter.js';
import { setupCodexEnvironment } from './helpers/env-setup.js';
import { resolveWorkingDirectory } from './helpers/working-directory-resolver.js';

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
 * Default Codex model for agent execution.
 * gpt-5.4 is OpenAI's current mainline recommendation for most coding/reasoning tasks.
 */
export const DEFAULT_CODEX_MODEL = 'gpt-5.4';

/**
 * Codex model aliases for user-friendly model selection.
 */
export const CODEX_MODEL_ALIASES: Record<string, string> = {
  max: 'gpt-5.4', // Default, flagship for complex multi-step projects
  mini: 'gpt-5.4-mini', // Lightweight, cost-effective
  '5.1': 'gpt-5.1', // General-purpose (legacy)
  legacy: 'gpt-5-codex', // Legacy (backward compatibility)
};

/**
 * Resolve a model alias or ID to the actual model ID.
 *
 * Priority: alias resolution → passthrough (full model ID)
 * If input is null/undefined/empty, returns DEFAULT_CODEX_MODEL.
 *
 * @param modelOrAlias - Model alias (max, mini, 5.1, legacy) or full model ID
 * @returns Resolved model ID
 *
 * @example
 * resolveCodexModel('max')           // → 'gpt-5.4'
 * resolveCodexModel('MINI')          // → 'gpt-5.4-mini' (case-insensitive)
 * resolveCodexModel('gpt-5.3-codex') // → 'gpt-5.3-codex' (passthrough)
 * resolveCodexModel(undefined)       // → 'gpt-5.4' (default)
 */
/**
 * Codex CLI の JSON イベント配列から人間可読なエラーメッセージを抽出する。
 * stdout に流れる `type=error` / `type=turn.failed` イベントの error.message を取り出す。
 */
function extractCodexErrorMessage(messages: string[]): string {
  for (const raw of messages) {
    try {
      const parsed = JSON.parse(raw) as {
        type?: string;
        error?: { message?: unknown };
        message?: unknown;
      };
      if (parsed.type !== 'error' && parsed.type !== 'turn.failed') {
        continue;
      }
      const rawMessage = parsed.error?.message ?? parsed.message;
      if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
        continue;
      }
      // message 自体が JSON 文字列のこともあるので、ネストを剥がして error.message まで掘る
      try {
        const nested = JSON.parse(rawMessage) as { error?: { message?: string } };
        if (nested.error?.message) {
          return nested.error.message;
        }
      } catch {
        /* ネストが JSON でなければそのまま使用 */
      }
      return rawMessage;
    } catch {
      /* JSON でない行は無視 */
    }
  }
  return '';
}

export function resolveCodexModel(modelOrAlias: string | undefined | null): string {
  if (!modelOrAlias || !modelOrAlias.trim()) {
    return DEFAULT_CODEX_MODEL;
  }

  const normalized = modelOrAlias.toLowerCase().trim();

  // Check if it's an alias
  if (CODEX_MODEL_ALIASES[normalized]) {
    return CODEX_MODEL_ALIASES[normalized];
  }

  // Return as-is (assume it's a full model ID)
  return modelOrAlias;
}

export class CodexAgentClient {
  private readonly workingDir: string;
  private readonly binaryPath: string;
  private readonly defaultModel?: string;
  private disabled = false;
  private disabledReason = '';

  // セッション全体（プロセス単位）で共有する無効化フラグ。
  // 例: ChatGPT アカウントでモデル非対応など、アカウント起因の恒久的な失敗を
  // 1 回検出したら、別インスタンスでも同じ Codex CLI を再試行しないようにする。
  private static sessionDisabled = false;
  private static sessionDisabledReason = '';

  /** セッション全体で Codex を無効化する（任意のインスタンスから呼び出し可能） */
  public static markSessionDisabled(reason: string): void {
    if (!CodexAgentClient.sessionDisabled) {
      CodexAgentClient.sessionDisabled = true;
      CodexAgentClient.sessionDisabledReason = reason;
      logger.warn(`Codex agent disabled for this session (all instances): ${reason}`);
    }
  }

  public static isSessionDisabled(): boolean {
    return CodexAgentClient.sessionDisabled;
  }

  public static getSessionDisabledReason(): string {
    return CodexAgentClient.sessionDisabledReason;
  }

  /** テスト用: セッションフラグのリセット */
  public static resetSessionDisabled(): void {
    CodexAgentClient.sessionDisabled = false;
    CodexAgentClient.sessionDisabledReason = '';
  }

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

  /**
   * このインスタンスをセッション終了まで無効化する（例: ChatGPT アカウントでモデル非対応）。
   * 無効化後は `executeTask` が即座にエラーを投げ、上位で Claude へのフォールバックが働く。
   * アカウント起因の失敗はセッション全体にも伝播させるため static フラグも立てる。
   */
  public markDisabled(reason: string): void {
    if (!this.disabled) {
      this.disabled = true;
      this.disabledReason = reason;
      logger.warn(`Codex agent disabled for this session: ${reason}`);
    }
    CodexAgentClient.markSessionDisabled(reason);
  }

  public isDisabled(): boolean {
    return this.disabled || CodexAgentClient.sessionDisabled;
  }

  public getDisabledReason(): string {
    return this.disabledReason || CodexAgentClient.sessionDisabledReason;
  }

  public async executeTask(options: ExecuteTaskOptions): Promise<string[]> {
    if (this.isDisabled()) {
      throw new Error(`Codex agent disabled: ${this.getDisabledReason()}`);
    }

    let cwd = options.workingDirectory ?? this.workingDir;

    logger.debug(`[CodexAgent] Original working directory: ${cwd}`);
    logger.debug(`[CodexAgent] Directory exists: ${fs.existsSync(cwd)}`);

    // Issue #507: 作業ディレクトリが存在しない場合のフォールバック処理を改善
    // マルチリポジトリ環境で metadata.target_repository.path を優先的に使用
    if (!fs.existsSync(cwd)) {
      logger.warn(`Working directory does not exist: ${cwd}`);
      cwd = await resolveWorkingDirectory(cwd);
      logger.info(`Resolved working directory: ${cwd}`);
      logger.debug(`[CodexAgent] Resolved directory exists: ${fs.existsSync(cwd)}`);
    }

    const args: string[] = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
    ];

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
      const missingOptionalDependency = message.includes('Missing optional dependency @openai/codex-linux-');

      if (missingBinary || missingOptionalDependency) {
        const helpMessage = [
          missingOptionalDependency
            ? 'Codex CLI optional dependency for this platform is missing.'
            : `Codex CLI binary not found at "${this.binaryPath}".`,
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

      // Explicitly check for stdin availability before writing
      if (!child.stdin) {
        reject(new Error('Failed to open stdin pipe for child process'));
        return;
      }
      child.stdin.write(options.stdinPayload);
      child.stdin.end();

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
          const extractedError = extractCodexErrorMessage(messages);
          const message = [
            `Codex CLI exited with code ${code ?? 'unknown'}.`,
            extractedError ? `error: ${extractedError}` : null,
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
}
