import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';

import { logger } from '../../utils/logger.js';
import { config } from '../../core/config.js';
import { CodexAgentClient } from '../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../core/claude-agent-client.js';

/**
 * API キーの最小文字数
 * OpenAI/Codex API キーは通常 40 文字以上
 */
const MIN_API_KEY_LENGTH = 20;

/**
 * API キーが有効かどうかを判定
 *
 * 以下の条件をすべて満たす場合に有効と判定:
 * - null または undefined でない
 * - トリム後の長さが MIN_API_KEY_LENGTH 以上
 *
 * @param apiKey - 検証する API キー
 * @returns 有効な場合は true
 */
function isValidApiKey(apiKey: string | null | undefined): apiKey is string {
  if (!apiKey) {
    return false;
  }
  const trimmed = apiKey.trim();
  return trimmed.length >= MIN_API_KEY_LENGTH;
}

/**
 * エージェント初期化結果
 */
export interface AgentSetupResult {
  /**
   * Codex エージェントクライアント（未初期化時は null）
   */
  codexClient: CodexAgentClient | null;

  /**
   * Claude エージェントクライアント（未初期化時は null）
   */
  claudeClient: ClaudeAgentClient | null;
}

/**
 * 認証情報解決結果
 */
export interface CredentialsResult {
  /**
   * Codex API キー（未設定時は null）
   */
  codexApiKey: string | null;

  /**
   * Claude Code トークン（未設定時は null）
   * CLAUDE_CODE_OAUTH_TOKEN または CLAUDE_CODE_API_KEY
   */
  claudeCodeToken: string | null;

  /**
   * Claude 認証情報ファイルパス（未設定時は null）
   * @deprecated credentials.json は非推奨。CLAUDE_CODE_OAUTH_TOKEN または CLAUDE_CODE_API_KEY を使用してください。
   */
  claudeCredentialsPath: string | null;
}

/**
 * 認証情報を解決（フォールバック処理）
 *
 * Codex API キーと Claude 認証情報を以下の優先順位で探索します:
 *
 * **Codex API キー**:
 * 1. CODEX_API_KEY 環境変数
 *
 * **Claude 認証情報**:
 * 1. CLAUDE_CODE_OAUTH_TOKEN 環境変数（推奨）
 * 2. CLAUDE_CODE_API_KEY 環境変数（フォールバック）
 * 3. credentials.json ファイル（レガシー、非推奨）
 *    - CLAUDE_CODE_CREDENTIALS_PATH 環境変数
 *    - ~/.claude-code/credentials.json
 *    - <repo>/.claude-code/credentials.json
 *
 * @param homeDir - ホームディレクトリ
 * @param repoRoot - リポジトリルート
 * @returns 認証情報解決結果
 */
export function resolveAgentCredentials(homeDir: string, repoRoot: string): CredentialsResult {
  // Codex API キーの解決
  const codexApiKey = config.getCodexApiKey();

  // デバッグログ: API キーの長さを出力（値自体は出力しない）
  if (codexApiKey !== null) {
    const trimmedLength = codexApiKey.trim().length;
    logger.debug(`CODEX_API_KEY detected (length=${trimmedLength}, valid=${isValidApiKey(codexApiKey)})`);
    if (!isValidApiKey(codexApiKey)) {
      logger.warn(
        `CODEX_API_KEY is set but appears invalid (length=${trimmedLength}, expected>=${MIN_API_KEY_LENGTH}). ` +
          'It will be ignored.',
      );
    }
  }

  // Claude Code トークンの解決（OAUTH_TOKEN → API_KEY）
  const claudeCodeToken = config.getClaudeCodeToken();

  // Claude 認証情報ファイルパスの候補を探索（レガシー、非推奨）
  let claudeCredentialsPath: string | null = null;

  if (!claudeCodeToken) {
    const claudeCandidatePaths: string[] = [];

    // 優先度1: CLAUDE_CODE_CREDENTIALS_PATH 環境変数
    const claudeCredentialsEnv = config.getClaudeCredentialsPath();
    if (claudeCredentialsEnv) {
      claudeCandidatePaths.push(claudeCredentialsEnv);
    }

    // 優先度2: ~/.claude-code/credentials.json
    claudeCandidatePaths.push(path.join(homeDir, '.claude-code', 'credentials.json'));

    // 優先度3: <repo>/.claude-code/credentials.json
    claudeCandidatePaths.push(path.join(repoRoot, '.claude-code', 'credentials.json'));

    // 最初に存在するファイルパスを採用
    claudeCredentialsPath =
      claudeCandidatePaths.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;

    if (claudeCredentialsPath) {
      logger.warn(
        'Using credentials.json for Claude Code authentication. This is deprecated. ' +
          'Please set CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY environment variable instead.',
      );
    }
  }

  return {
    codexApiKey,
    claudeCodeToken,
    claudeCredentialsPath,
  };
}

/**
 * Codex/Claude クライアントを初期化
 *
 * エージェントモードに基づいて、Codex および Claude エージェントクライアントを初期化します。
 *
 * **エージェントモード動作**:
 * - 'codex': Codex のみ使用（codexApiKey 必須、なければエラー）
 * - 'claude': Claude のみ使用（claudeCodeToken または claudeCredentialsPath 必須、なければエラー）
 * - 'auto': Codex 優先、Claude にフォールバック（いずれかが必須）
 *
 * @param agentMode - エージェントモード ('auto' | 'codex' | 'claude')
 * @param workingDir - 作業ディレクトリ
 * @param credentials - 認証情報（codexApiKey, claudeCodeToken, claudeCredentialsPath）
 * @returns エージェント初期化結果
 * @throws {Error} 必須の認証情報が存在しない場合
 */
export function setupAgentClients(
  agentMode: 'auto' | 'codex' | 'claude',
  workingDir: string,
  credentials: CredentialsResult,
): AgentSetupResult {
  const { codexApiKey, claudeCodeToken, claudeCredentialsPath } = credentials;
  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  // Claude の認証情報が利用可能かどうか
  const hasClaudeCredentials = !!(claudeCodeToken || claudeCredentialsPath);
  const codexHome = process.env.CODEX_HOME;
  const codexAuthFile = codexHome ? path.join(codexHome, 'auth.json') : null;
  const hasCodexCliAuth = !!(codexAuthFile && fs.existsSync(codexAuthFile));
  const hasCodexCredentials = isValidApiKey(codexApiKey) || hasCodexCliAuth;
  const codexCredentialHints: string[] = [];
  if (!isValidApiKey(codexApiKey)) {
    codexCredentialHints.push('CODEX_API_KEY missing or invalid');
  }
  if (!hasCodexCliAuth) {
    if (codexAuthFile) {
      codexCredentialHints.push(`Codex auth file not found at ${codexAuthFile}`);
    } else {
      codexCredentialHints.push('CODEX_HOME not set or auth.json missing');
    }
  }
  const codexUnavailableReason =
    codexCredentialHints.join('; ') || 'no Codex credentials detected';

  switch (agentMode) {
    case 'codex': {
      if (!hasCodexCredentials) {
        throw new Error(
          `Agent mode "codex" requires CODEX_API_KEY (>=${MIN_API_KEY_LENGTH} characters) ` +
            'or CODEX_AUTH_JSON (Codex CLI auth file).',
        );
      }
      if (isValidApiKey(codexApiKey)) {
        const trimmed = codexApiKey.trim();
        process.env.CODEX_API_KEY = trimmed;
        if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
          process.env.OPENAI_API_KEY = trimmed;
        }
      } else {
        logger.info('Using Codex auth.json (CODEX_HOME) for codex agent mode.');
      }

      codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
      logger.info('Codex agent enabled (codex mode).');
      break;
    }
    case 'claude': {
      // Claude 専用モード: claudeCodeToken もしくは claudeCredentialsPath 必須
      if (!hasClaudeCredentials) {
        throw new Error(
          'Agent mode "claude" requires Claude Code credentials. ' +
            'Set CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY environment variable.',
        );
      }

      // ClaudeAgentClient には認証パスを渡す（なければ OAuth / API key を使用）
      claudeClient = new ClaudeAgentClient({
        workingDir,
        credentialsPath: claudeCredentialsPath ?? undefined,
      });
      logger.info('Claude Code agent enabled (claude mode).');
      break;
    }
    case 'auto':
    default: {
      // Auto モード: Codex を優先、Claude にフォールバック
      if (hasCodexCredentials) {
        if (isValidApiKey(codexApiKey)) {
          const trimmed = codexApiKey.trim();
          process.env.CODEX_API_KEY = trimmed;
          if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
            process.env.OPENAI_API_KEY = trimmed;
          }
          logger.info('Codex API key detected. Codex agent enabled (model=gpt-5-codex).');
        } else {
          logger.info('CODEX_AUTH_JSON detected. Codex agent enabled via Codex CLI credentials.');
        }
        codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
      }

      if (hasClaudeCredentials) {
        if (!codexClient) {
          logger.info(`Codex agent unavailable (${codexUnavailableReason}). Using Claude Code.`);
        } else {
          logger.info('Claude Code credentials detected. Fallback available.');
        }
        claudeClient = new ClaudeAgentClient({
          workingDir,
          credentialsPath: claudeCredentialsPath ?? undefined,
        });
      } else if (!codexClient) {
        logger.warn(
          `Codex agent unavailable (${codexUnavailableReason}) and no Claude credentials configured.`,
        );
      }
      break;
    }
  }

  return {
    codexClient,
    claudeClient,
  };
}
