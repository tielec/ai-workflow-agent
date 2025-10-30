/**
 * ユニットテスト: agent-setup モジュール
 *
 * テスト対象:
 * - resolveAgentCredentials(): 認証情報の解決（フォールバック処理）
 * - setupAgentClients(): Codex/Claude クライアントの初期化
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  resolveAgentCredentials,
  setupAgentClients,
  type AgentSetupResult,
  type CredentialsResult,
} from '../../../../src/commands/execute/agent-setup.js';

// モジュールのモック
jest.mock('fs-extra');
jest.mock('../../../../src/core/config.js');
jest.mock('../../../../src/core/codex-agent-client.js');
jest.mock('../../../../src/core/claude-agent-client.js');
jest.mock('../../../../src/utils/logger.js');

import fs from 'fs-extra';
import { config } from '../../../../src/core/config.js';
import { CodexAgentClient } from '../../../../src/core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../../../src/core/claude-agent-client.js';

// =============================================================================
// テストセットアップ
// =============================================================================

beforeEach(() => {
  // 環境変数をクリア
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;

  // モックをリセット
  jest.clearAllMocks();
});

afterEach(() => {
  // 環境変数をクリア
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
});

// =============================================================================
// resolveAgentCredentials() - 正常系
// =============================================================================

describe('resolveAgentCredentials - 正常系', () => {
  test('CODEX_API_KEY 環境変数が存在する場合、正しく解決される', () => {
    // Given: CODEX_API_KEY が設定されている
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    (config.getCodexApiKey as jest.Mock).mockReturnValue('test-codex-key');
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(null);
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: Codex API キーが解決される
    expect(result.codexApiKey).toBe('test-codex-key');
    expect(result.claudeCredentialsPath).toBeNull();
  });

  test('CLAUDE_CODE_CREDENTIALS_PATH 環境変数が存在する場合、正しく解決される', () => {
    // Given: CLAUDE_CODE_CREDENTIALS_PATH が設定されている
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const claudeCredentialsPath = '/custom/path/credentials.json';
    (config.getCodexApiKey as jest.Mock).mockReturnValue(null);
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(claudeCredentialsPath);
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return path === claudeCredentialsPath;
    });

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: Claude 認証情報パスが解決される
    expect(result.codexApiKey).toBeNull();
    expect(result.claudeCredentialsPath).toBe(claudeCredentialsPath);
  });

  test('~/.claude-code/credentials.json にフォールバックする', () => {
    // Given: CLAUDE_CODE_CREDENTIALS_PATH 未設定、~/.claude-code/credentials.json が存在
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const expectedPath = `${homeDir}/.claude-code/credentials.json`;
    (config.getCodexApiKey as jest.Mock).mockReturnValue(null);
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(null);
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return path === expectedPath;
    });

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: ~/.claude-code/credentials.json が選択される
    expect(result.claudeCredentialsPath).toBe(expectedPath);
  });

  test('<repo>/.claude-code/credentials.json にフォールバックする', () => {
    // Given: 上記2つが存在しない、<repo>/.claude-code/credentials.json が存在
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const expectedPath = `${repoRoot}/.claude-code/credentials.json`;
    (config.getCodexApiKey as jest.Mock).mockReturnValue(null);
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(null);
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return path === expectedPath;
    });

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: <repo>/.claude-code/credentials.json が選択される
    expect(result.claudeCredentialsPath).toBe(expectedPath);
  });

  test('Codex と Claude 両方の認証情報が存在する場合、両方返される', () => {
    // Given: 両方の認証情報が存在
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const claudeCredentialsPath = '/custom/path/credentials.json';
    (config.getCodexApiKey as jest.Mock).mockReturnValue('test-codex-key');
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(claudeCredentialsPath);
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: 両方が解決される
    expect(result.codexApiKey).toBe('test-codex-key');
    expect(result.claudeCredentialsPath).toBe(claudeCredentialsPath);
  });
});

// =============================================================================
// resolveAgentCredentials() - 異常系
// =============================================================================

describe('resolveAgentCredentials - 異常系', () => {
  test('認証情報がすべて存在しない場合、null を返す', () => {
    // Given: すべての認証情報が存在しない
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    (config.getCodexApiKey as jest.Mock).mockReturnValue(null);
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(null);
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: 両方 null
    expect(result.codexApiKey).toBeNull();
    expect(result.claudeCredentialsPath).toBeNull();
  });
});

// =============================================================================
// setupAgentClients() - 正常系: codex モード
// =============================================================================

describe('setupAgentClients - codex モード', () => {
  test('codex モード時、CodexAgentClient のみ初期化される', () => {
    // Given: codex モード、Codex API キーが存在
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const codexApiKey = 'test-codex-key';
    const claudeCredentialsPath = null;

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: CodexAgentClient のみ初期化される
    expect(CodexAgentClient).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeNull();
    expect(process.env.CODEX_API_KEY).toBe(codexApiKey);
  });

  test('codex モード時、Codex API キーが存在しない場合エラーをスロー', () => {
    // Given: codex モード、Codex API キーが存在しない
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = null;

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, codexApiKey, claudeCredentialsPath);
    }).toThrow(
      'Agent mode "codex" requires CODEX_API_KEY or OPENAI_API_KEY to be set with a valid Codex API key.',
    );
  });

  test('codex モード時、空文字の Codex API キーでエラーをスロー', () => {
    // Given: codex モード、Codex API キーが空文字
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const codexApiKey = '   '; // 空白のみ
    const claudeCredentialsPath = null;

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, codexApiKey, claudeCredentialsPath);
    }).toThrow(
      'Agent mode "codex" requires CODEX_API_KEY or OPENAI_API_KEY to be set with a valid Codex API key.',
    );
  });
});

// =============================================================================
// setupAgentClients() - 正常系: claude モード
// =============================================================================

describe('setupAgentClients - claude モード', () => {
  test('claude モード時、ClaudeAgentClient のみ初期化される', () => {
    // Given: claude モード、Claude 認証情報が存在
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: ClaudeAgentClient のみ初期化される
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: claudeCredentialsPath });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
    expect(process.env.CLAUDE_CODE_CREDENTIALS_PATH).toBe(claudeCredentialsPath);
  });

  test('claude モード時、Claude 認証情報が存在しない場合エラーをスロー', () => {
    // Given: claude モード、Claude 認証情報が存在しない
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = null;

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, codexApiKey, claudeCredentialsPath);
    }).toThrow('Agent mode "claude" requires Claude Code credentials.json to be available.');
  });
});

// =============================================================================
// setupAgentClients() - 正常系: auto モード
// =============================================================================

describe('setupAgentClients - auto モード', () => {
  test('auto モード時、Codex API キー優先で両方初期化される', () => {
    // Given: auto モード、両方の認証情報が存在
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const codexApiKey = 'test-codex-key';
    const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: 両方初期化される
    expect(CodexAgentClient).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: claudeCredentialsPath });
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeDefined();
    expect(process.env.CODEX_API_KEY).toBe(codexApiKey);
    expect(process.env.CLAUDE_CODE_CREDENTIALS_PATH).toBe(claudeCredentialsPath);
  });

  test('auto モード時、Codex API キーが存在しない場合 Claude にフォールバック', () => {
    // Given: auto モード、Codex API キーが存在しない、Claude 認証情報が存在
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: Claude のみ初期化される
    expect(CodexAgentClient).not.toHaveBeenCalled();
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: claudeCredentialsPath });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
  });

  test('auto モード時、両方の認証情報が存在しない場合、両方 null', () => {
    // Given: auto モード、両方の認証情報が存在しない
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = null;

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: 両方 null（エラーなし）
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeNull();
  });

  test('auto モード時、Codex API キーのみ存在する場合、Codex のみ初期化', () => {
    // Given: auto モード、Codex API キーのみ存在
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const codexApiKey = 'test-codex-key';
    const claudeCredentialsPath = null;

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(
      agentMode,
      workingDir,
      codexApiKey,
      claudeCredentialsPath,
    );

    // Then: Codex のみ初期化される
    expect(CodexAgentClient).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
    expect(ClaudeAgentClient).not.toHaveBeenCalled();
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeNull();
  });
});

// =============================================================================
// 環境変数設定の検証
// =============================================================================

describe('環境変数設定の検証', () => {
  test('codex モード時、CODEX_API_KEY と OPENAI_API_KEY が設定される', () => {
    // Given: codex モード
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const codexApiKey = 'test-codex-key';
    const claudeCredentialsPath = null;

    // When: エージェントを初期化
    setupAgentClients(agentMode, workingDir, codexApiKey, claudeCredentialsPath);

    // Then: 環境変数が設定される
    expect(process.env.CODEX_API_KEY).toBe(codexApiKey);
    expect(process.env.OPENAI_API_KEY).toBe(codexApiKey);
    expect(process.env.CLAUDE_CODE_CREDENTIALS_PATH).toBeUndefined();
  });

  test('claude モード時、CLAUDE_CODE_CREDENTIALS_PATH が設定される', () => {
    // Given: claude モード
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const codexApiKey = null;
    const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';

    // When: エージェントを初期化
    setupAgentClients(agentMode, workingDir, codexApiKey, claudeCredentialsPath);

    // Then: 環境変数が設定される
    expect(process.env.CLAUDE_CODE_CREDENTIALS_PATH).toBe(claudeCredentialsPath);
  });
});
