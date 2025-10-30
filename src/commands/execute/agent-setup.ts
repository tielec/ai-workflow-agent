import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';

import { logger } from '../../utils/logger.js';
import { config } from '../../core/config.js';
import { CodexAgentClient } from '../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../core/claude-agent-client.js';

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
   * Claude 認証情報ファイルパス（未設定時は null）
   */
  claudeCredentialsPath: string | null;
}

/**
 * 認証情報を解決（フォールバック処理）
 *
 * Codex API キーと Claude 認証情報ファイルパスを以下の優先順位で探索します:
 *
 * **Codex API キー**:
 * 1. CODEX_API_KEY 環境変数
 * 2. OPENAI_API_KEY 環境変数（フォールバック）
 *
 * **Claude 認証情報**:
 * 1. CLAUDE_CODE_CREDENTIALS_PATH 環境変数
 * 2. ~/.claude-code/credentials.json
 * 3. <repo>/.claude-code/credentials.json
 *
 * @param homeDir - ホームディレクトリ
 * @param repoRoot - リポジトリルート
 * @returns 認証情報解決結果
 */
export function resolveAgentCredentials(homeDir: string, repoRoot: string): CredentialsResult {
  // Codex API キーの解決（CODEX_API_KEY → OPENAI_API_KEY）
  const codexApiKey = config.getCodexApiKey();

  // Claude 認証情報ファイルパスの候補を探索
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
  const claudeCredentialsPath =
    claudeCandidatePaths.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;

  return {
    codexApiKey,
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
 * - 'claude': Claude のみ使用（claudeCredentialsPath 必須、なければエラー）
 * - 'auto': Codex 優先、Claude にフォールバック（いずれかが必須）
 *
 * @param agentMode - エージェントモード ('auto' | 'codex' | 'claude')
 * @param workingDir - 作業ディレクトリ
 * @param codexApiKey - Codex API キー（オプション）
 * @param claudeCredentialsPath - Claude 認証情報パス（オプション）
 * @returns エージェント初期化結果
 * @throws {Error} 必須の認証情報が存在しない場合
 */
export function setupAgentClients(
  agentMode: 'auto' | 'codex' | 'claude',
  workingDir: string,
  codexApiKey: string | null,
  claudeCredentialsPath: string | null,
): AgentSetupResult {
  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  switch (agentMode) {
    case 'codex': {
      // Codex 強制モード: codexApiKey 必須
      if (!codexApiKey || !codexApiKey.trim()) {
        throw new Error(
          'Agent mode "codex" requires CODEX_API_KEY or OPENAI_API_KEY to be set with a valid Codex API key.',
        );
      }
      const trimmed = codexApiKey.trim();
      // 環境変数設定
      process.env.CODEX_API_KEY = trimmed;
      if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
        process.env.OPENAI_API_KEY = trimmed;
      }
      delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;

      codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
      logger.info('Codex agent enabled (codex mode).');
      break;
    }
    case 'claude': {
      // Claude 強制モード: claudeCredentialsPath 必須
      if (!claudeCredentialsPath) {
        throw new Error(
          'Agent mode "claude" requires Claude Code credentials.json to be available.',
        );
      }
      claudeClient = new ClaudeAgentClient({ workingDir, credentialsPath: claudeCredentialsPath });
      process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
      logger.info('Claude Code agent enabled (claude mode).');
      break;
    }
    case 'auto':
    default: {
      // Auto モード: Codex 優先、Claude にフォールバック
      if (codexApiKey && codexApiKey.trim().length > 0) {
        const trimmed = codexApiKey.trim();
        process.env.CODEX_API_KEY = trimmed;
        if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
          process.env.OPENAI_API_KEY = trimmed;
        }
        codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
        logger.info('Codex API key detected. Codex agent enabled (model=gpt-5-codex).');
      }

      if (claudeCredentialsPath) {
        if (!codexClient) {
          logger.info('Codex agent unavailable. Using Claude Code.');
        } else {
          logger.info('Claude Code credentials detected. Fallback available.');
        }
        claudeClient = new ClaudeAgentClient({ workingDir, credentialsPath: claudeCredentialsPath });
        process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
      }
      break;
    }
  }

  return {
    codexClient,
    claudeClient,
  };
}
