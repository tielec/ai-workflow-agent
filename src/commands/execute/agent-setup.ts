import process from 'node:process';

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
   * Claude Code トークン（OAUTH_TOKEN または API_KEY、未設定時は null）
   */
  claudeCodeToken: string | null;
}

/**
 * 認証情報を解決（フォールバック処理）
 *
 * Codex API キーと Claude Code トークンを以下の優先順位で探索します:
 *
 * **Codex API キー**:
 * 1. CODEX_API_KEY 環境変数（フォールバックなし、Issue #188）
 *
 * **Claude Code トークン**:
 * 1. CLAUDE_CODE_OAUTH_TOKEN 環境変数（優先）
 * 2. CLAUDE_CODE_API_KEY 環境変数（フォールバック）
 *
 * @param _homeDir - ホームディレクトリ（未使用、後方互換性のため保持）
 * @param _repoRoot - リポジトリルート（未使用、後方互換性のため保持）
 * @returns 認証情報解決結果
 */
export function resolveAgentCredentials(_homeDir: string, _repoRoot: string): CredentialsResult {
  // Codex API キーの解決（CODEX_API_KEY のみ、フォールバックなし）
  const codexApiKey = config.getCodexApiKey();

  // Claude Code トークンの解決（OAUTH_TOKEN → API_KEY のフォールバック）
  const claudeCodeToken = config.getClaudeCodeToken();

  return {
    codexApiKey,
    claudeCodeToken,
  };
}

/**
 * Codex/Claude クライアントを初期化
 *
 * エージェントモードに基づいて、Codex および Claude エージェントクライアントを初期化します。
 *
 * **エージェントモード動作**:
 * - 'codex': Codex のみ使用（codexApiKey 必須、なければエラー）
 * - 'claude': Claude のみ使用（claudeCodeToken 必須、なければエラー）
 * - 'auto': Codex 優先、Claude にフォールバック（いずれかが必須）
 *
 * @param agentMode - エージェントモード ('auto' | 'codex' | 'claude')
 * @param workingDir - 作業ディレクトリ
 * @param codexApiKey - Codex API キー（オプション）
 * @param claudeCodeToken - Claude Code トークン（オプション）
 * @returns エージェント初期化結果
 * @throws {Error} 必須の認証情報が存在しない場合
 */
export function setupAgentClients(
  agentMode: 'auto' | 'codex' | 'claude',
  workingDir: string,
  codexApiKey: string | null,
  claudeCodeToken: string | null,
): AgentSetupResult {
  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  switch (agentMode) {
    case 'codex': {
      // Codex 強制モード: codexApiKey 必須
      if (!codexApiKey || !codexApiKey.trim()) {
        throw new Error(
          'Agent mode "codex" requires CODEX_API_KEY to be set with a valid Codex API key.',
        );
      }
      const trimmed = codexApiKey.trim();
      // 環境変数設定
      process.env.CODEX_API_KEY = trimmed;

      codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
      logger.info('Codex agent enabled (codex mode).');
      break;
    }
    case 'claude': {
      // Claude 強制モード: claudeCodeToken 必須
      if (!claudeCodeToken || !claudeCodeToken.trim()) {
        throw new Error(
          'Agent mode "claude" requires CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY to be set.',
        );
      }
      claudeClient = new ClaudeAgentClient({ workingDir });
      logger.info('Claude Code agent enabled (claude mode).');
      break;
    }
    case 'auto':
    default: {
      // Auto モード: Codex 優先、Claude にフォールバック
      if (codexApiKey && codexApiKey.trim().length > 0) {
        const trimmed = codexApiKey.trim();
        process.env.CODEX_API_KEY = trimmed;
        codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
        logger.info('Codex API key detected. Codex agent enabled (model=gpt-5-codex).');
      }

      if (claudeCodeToken && claudeCodeToken.trim().length > 0) {
        if (!codexClient) {
          logger.info('Codex agent unavailable. Using Claude Code.');
        } else {
          logger.info('Claude Code token detected. Fallback available.');
        }
        claudeClient = new ClaudeAgentClient({ workingDir });
      }
      break;
    }
  }

  return {
    codexClient,
    claudeClient,
  };
}
