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

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import type {
  AgentSetupResult,
  CredentialsResult,
  AgentPriority,
} from '../../../../src/commands/execute/agent-setup.js';
import { PhaseName } from '../../../../src/types.js';

// =============================================================================
// テストダブル定義
// =============================================================================

const CodexAgentClientMock = jest.fn().mockImplementation(() => ({
  executeTask: jest.fn(),
}));

const ClaudeAgentClientMock = jest.fn().mockImplementation(() => ({
  executeTask: jest.fn(),
}));

const mockDetectCodexCliAuth = jest.fn(() => ({
  authFilePath: null,
  candidates: [],
}));

let resolveAgentCredentials!: typeof import('../../../../src/commands/execute/agent-setup.js')['resolveAgentCredentials'];
let setupAgentClients!: typeof import('../../../../src/commands/execute/agent-setup.js')['setupAgentClients'];
let PHASE_AGENT_PRIORITY!: typeof import('../../../../src/commands/execute/agent-setup.js')['PHASE_AGENT_PRIORITY'];

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../src/core/codex-agent-client.js', async () => {
    const CODEX_MODEL_ALIASES = {
      max: 'gpt-5.1-codex-max',
      mini: 'gpt-5.1-codex-mini',
      '5.1': 'gpt-5.1',
      legacy: 'gpt-5-codex',
    };
    const DEFAULT_CODEX_MODEL = 'gpt-5.1-codex-max';

    function resolveCodexModel(modelOrAlias: string | undefined | null): string {
      if (!modelOrAlias || !modelOrAlias.trim()) {
        return DEFAULT_CODEX_MODEL;
      }
      const normalized = modelOrAlias.toLowerCase().trim();
      if (CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES]) {
        return CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES];
      }
      return modelOrAlias;
    }

    return {
      __esModule: true,
      CODEX_MODEL_ALIASES,
      DEFAULT_CODEX_MODEL,
      resolveCodexModel,
      CodexAgentClient: CodexAgentClientMock,
    };
  });

  await jest.unstable_mockModule('../../../../src/core/claude-agent-client.js', async () => {
    const CLAUDE_MODEL_ALIASES = {
      opus: 'claude-opus-4-5-20251101',
      sonnet: 'claude-sonnet-4-20250514',
      haiku: 'claude-haiku-3-5-20241022',
    };
    const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-5-20251101';

    function resolveClaudeModel(modelOrAlias: string | undefined | null): string {
      if (!modelOrAlias || !modelOrAlias.trim()) {
        return DEFAULT_CLAUDE_MODEL;
      }
      const normalized = modelOrAlias.toLowerCase().trim();
      if (CLAUDE_MODEL_ALIASES[normalized as keyof typeof CLAUDE_MODEL_ALIASES]) {
        return CLAUDE_MODEL_ALIASES[normalized as keyof typeof CLAUDE_MODEL_ALIASES];
      }
      return modelOrAlias;
    }

    return {
      __esModule: true,
      CLAUDE_MODEL_ALIASES,
      DEFAULT_CLAUDE_MODEL,
      resolveClaudeModel,
      ClaudeAgentClient: ClaudeAgentClientMock,
    };
  });

  await jest.unstable_mockModule('../../../../src/core/helpers/codex-credentials.js', async () => {
    const CODEX_MIN_API_KEY_LENGTH = 20;
    const isValidCodexApiKey = (apiKey: string | null | undefined): apiKey is string => {
      if (!apiKey) {
        return false;
      }
      return apiKey.trim().length >= CODEX_MIN_API_KEY_LENGTH;
    };

    return {
      __esModule: true,
      CODEX_MIN_API_KEY_LENGTH,
      isValidCodexApiKey,
      detectCodexCliAuth: mockDetectCodexCliAuth,
    };
  });

  const module = await import('../../../../src/commands/execute/agent-setup.js');
  resolveAgentCredentials = module.resolveAgentCredentials;
  setupAgentClients = module.setupAgentClients;
  PHASE_AGENT_PRIORITY = module.PHASE_AGENT_PRIORITY;
});

import fs from 'fs-extra';
import { logger } from '../../../../src/utils/logger.js';

const existsSyncSpy = jest.spyOn(fs, 'existsSync');
jest.spyOn(logger, 'debug').mockImplementation(() => {});
jest.spyOn(logger, 'info').mockImplementation(() => {});
jest.spyOn(logger, 'warn').mockImplementation(() => {});
jest.spyOn(logger, 'error').mockImplementation(() => {});

// =============================================================================
// テストセットアップ
// =============================================================================

beforeEach(() => {
  // 環境変数をクリア
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_CODE_API_KEY;
  delete process.env.CODEX_MODEL;
  delete process.env.CLAUDE_MODEL;

  // モックをリセット
  jest.clearAllMocks();
  existsSyncSpy.mockReset();
  existsSyncSpy.mockReturnValue(false);
  mockDetectCodexCliAuth.mockReturnValue({ authFilePath: null, candidates: [] });
});

afterEach(() => {
  // 環境変数をクリア
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_CODE_API_KEY;
  delete process.env.CODEX_MODEL;
  delete process.env.CLAUDE_MODEL;
});

// =============================================================================
// resolveAgentCredentials() - 正常系
// =============================================================================

describe('resolveAgentCredentials - 正常系', () => {
  test('CODEX_API_KEY 環境変数が存在する場合、正しく解決される', () => {
    // Given: CODEX_API_KEY が設定されている
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    process.env.CODEX_API_KEY = 'test-codex-key';
    existsSyncSpy.mockReturnValue(false);

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
    process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
    existsSyncSpy.mockImplementation((path: unknown) => {
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
    existsSyncSpy.mockImplementation((path: unknown) => {
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
    existsSyncSpy.mockImplementation((path: unknown) => {
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
    process.env.CODEX_API_KEY = 'test-codex-key';
    process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
    existsSyncSpy.mockReturnValue(true);

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
    existsSyncSpy.mockReturnValue(false);

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: 両方 null
    expect(result.codexApiKey).toBeNull();
    expect(result.claudeCredentialsPath).toBeNull();
  });

  test('短すぎる CODEX_API_KEY が検出された場合、警告ログが出力される', () => {
    // Given: 短すぎる CODEX_API_KEY が設定されている
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const shortApiKey = 'short-key'; // 20文字未満
    process.env.CODEX_API_KEY = shortApiKey;
    existsSyncSpy.mockReturnValue(false);

    // When: 認証情報を解決
    const result: CredentialsResult = resolveAgentCredentials(homeDir, repoRoot);

    // Then: codexApiKey は返されるが、警告ログが出力される
    expect(result.codexApiKey).toBe(shortApiKey);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('CODEX_API_KEY is set but appears invalid'),
    );
  });
});

// =============================================================================
// setupAgentClients() - 正常系: codex モード
// =============================================================================

describe('setupAgentClients - codex モード', () => {
  test('codex モード時、CodexAgentClient のみ初期化される', () => {
    // Given: codex モード、有効な Codex API キーが存在（20文字以上）
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: CodexAgentClient のみ初期化される（デフォルトモデル gpt-5.1-codex-max - Issue #302）
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-max' });
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeNull();
    expect(process.env.CODEX_API_KEY).toBe(credentials.codexApiKey);
  });

  test('codex モード時、Codex API キーが存在しない場合エラーをスロー', () => {
    // Given: codex モード、Codex API キーが存在しない
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, credentials);
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY (>=20 characters) or CODEX_AUTH_JSON (Codex CLI auth file).');
  });

  test('codex モード時、空文字の Codex API キーでエラーをスロー', () => {
    // Given: codex モード、Codex API キーが空文字
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: '   ', // 空白のみ
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, credentials);
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY (>=20 characters) or CODEX_AUTH_JSON (Codex CLI auth file).');
  });

  test('codex モード時、短すぎる Codex API キーでエラーをスロー', () => {
    // Given: codex モード、Codex API キーが短すぎる（20文字未満）
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'short-key', // 20文字未満
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, credentials);
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY (>=20 characters) or CODEX_AUTH_JSON (Codex CLI auth file).');
  });
});

// =============================================================================
// setupAgentClients() - 正常系: claude モード
// =============================================================================

describe('setupAgentClients - claude モード', () => {
  test('claude モード時、ClaudeAgentClient のみ初期化される（claudeCodeToken）', () => {
    // Given: claude モード、Claude Code トークンが存在
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: ClaudeAgentClient のみ初期化される
    expect(ClaudeAgentClientMock).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: undefined,
      model: 'claude-opus-4-5-20251101',
    });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
  });

  test('claude モード時、ClaudeAgentClient のみ初期化される（credentialsPath）', () => {
    // Given: claude モード、Claude 認証情報パスが存在
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: null,
      claudeCredentialsPath: '/home/user/.claude-code/credentials.json',
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: ClaudeAgentClient のみ初期化される
    expect(ClaudeAgentClientMock).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: '/home/user/.claude-code/credentials.json',
      model: 'claude-opus-4-5-20251101',
    });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
  });

  test('claude モード時、Claude 認証情報が存在しない場合エラーをスロー', () => {
    // Given: claude モード、Claude 認証情報が存在しない
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When & Then: エラーがスローされる
    expect(() => {
      setupAgentClients(agentMode, workingDir, credentials);
    }).toThrow('Agent mode "claude" requires Claude Code credentials.');
  });
});

// =============================================================================
// setupAgentClients() - 正常系: auto モード
// =============================================================================

describe('setupAgentClients - auto モード', () => {
  test('auto モード時、有効な Codex API キー優先で両方初期化される', () => {
    // Given: auto モード、両方の認証情報が存在（Codex キーは20文字以上）
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: 両方初期化される（デフォルトモデル gpt-5.1-codex-max - Issue #302）
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-max' });
    expect(ClaudeAgentClientMock).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: undefined,
      model: 'claude-opus-4-5-20251101',
    });
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeDefined();
    expect(process.env.CODEX_API_KEY).toBe(credentials.codexApiKey);
  });

  test('auto モード時、Codex API キーが存在しない場合 Claude にフォールバック', () => {
    // Given: auto モード、Codex API キーが存在しない、Claude 認証情報が存在
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: Claude のみ初期化される
    expect(CodexAgentClientMock).not.toHaveBeenCalled();
    expect(ClaudeAgentClientMock).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: undefined,
      model: 'claude-opus-4-5-20251101',
    });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
  });

  test('auto モード時、短すぎる Codex API キーの場合 Claude にフォールバック', () => {
    // Given: auto モード、Codex API キーが短すぎる（20文字未満）
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'short-key', // 20文字未満
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: Claude のみ初期化される（Codex キーは無効として無視）
    expect(CodexAgentClientMock).not.toHaveBeenCalled();
    expect(ClaudeAgentClientMock).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: undefined,
      model: 'claude-opus-4-5-20251101',
    });
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeDefined();
  });

  test('auto モード時、両方の認証情報が存在しない場合、両方 null', () => {
    // Given: auto モード、両方の認証情報が存在しない
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: 両方 null（エラーなし）
    expect(result.codexClient).toBeNull();
    expect(result.claudeClient).toBeNull();
  });

  test('auto モード時、有効な Codex API キーのみ存在する場合、Codex のみ初期化', () => {
    // Given: auto モード、有効な Codex API キーのみ存在（20文字以上）
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials);

    // Then: Codex のみ初期化される（デフォルトモデル gpt-5.1-codex-max - Issue #302）
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-max' });
    expect(ClaudeAgentClientMock).not.toHaveBeenCalled();
    expect(result.codexClient).toBeDefined();
    expect(result.claudeClient).toBeNull();
  });
});

// =============================================================================
// setupAgentClients() - codexModel オプション（Issue #302）
// =============================================================================

describe('setupAgentClients - codexModel オプション（Issue #302）', () => {
  test('codex モードで codexModel オプションが使用される', () => {
    // Given: codex モードで codexModel: 'mini' が指定される
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化（codexModel オプション指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {
      codexModel: 'mini',
    });

    // Then: CodexAgentClient が model: 'gpt-5.1-codex-mini' で初期化される
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-mini' });
    expect(result.codexClient).toBeDefined();
  });

  test('codex モードで codexModel 未指定時にデフォルトモデルが使用される', () => {
    // Given: codex モードで codexModel が指定されていない、環境変数も未設定
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化（codexModel オプション未指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {});

    // Then: CodexAgentClient が model: 'gpt-5.1-codex-max' で初期化される
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-max' });
    expect(result.codexClient).toBeDefined();
  });

  test('codex モードで環境変数 CODEX_MODEL が使用される', () => {
    // Given: codex モードで codexModel 未指定、環境変数 CODEX_MODEL=legacy が設定されている
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    process.env.CODEX_MODEL = 'legacy';

    // When: エージェントを初期化（codexModel オプション未指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {});

    // Then: CodexAgentClient が model: 'gpt-5-codex' で初期化される
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
    expect(result.codexClient).toBeDefined();
  });

  test('codex モードで CLI オプションが環境変数より優先される', () => {
    // Given: codex モードで codexModel: 'max' が指定、環境変数 CODEX_MODEL=mini が設定されている
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    process.env.CODEX_MODEL = 'mini';

    // When: エージェントを初期化（codexModel オプション指定 = 'max'）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {
      codexModel: 'max',
    });

    // Then: CodexAgentClient が model: 'gpt-5.1-codex-max' で初期化される（CLI が優先）
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-max' });
    expect(result.codexClient).toBeDefined();
  });

  test('auto モードで codexModel オプションが使用される', () => {
    // Given: auto モードで codexModel: 'mini' が指定される
    const agentMode = 'auto';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化（codexModel オプション指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {
      codexModel: 'mini',
    });

    // Then: CodexAgentClient が model: 'gpt-5.1-codex-mini' で初期化される
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1-codex-mini' });
    expect(result.codexClient).toBeDefined();
  });

  test('codex モードでフルモデルIDがそのまま使用される', () => {
    // Given: codex モードでフルモデルID 'gpt-6-codex-experimental' が指定される
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化（フルモデルID指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {
      codexModel: 'gpt-6-codex-experimental',
    });

    // Then: CodexAgentClient が model: 'gpt-6-codex-experimental' で初期化される（パススルー）
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-6-codex-experimental' });
    expect(result.codexClient).toBeDefined();
  });

  test('codex モードで 5.1 エイリアスが正しく解決される', () => {
    // Given: codex モードで '5.1' エイリアスが指定される
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化（'5.1' エイリアス指定）
    const result: AgentSetupResult = setupAgentClients(agentMode, workingDir, credentials, {
      codexModel: '5.1',
    });

    // Then: CodexAgentClient が model: 'gpt-5.1' で初期化される
    expect(CodexAgentClientMock).toHaveBeenCalledWith({ workingDir, model: 'gpt-5.1' });
    expect(result.codexClient).toBeDefined();
  });
});

// =============================================================================
// 環境変数設定の検証
// =============================================================================

describe('環境変数設定の検証', () => {
  test('codex モード時、CODEX_API_KEY と OPENAI_API_KEY が設定される', () => {
    // Given: codex モード、有効な API キー（20文字以上）
    const agentMode = 'codex';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: 'test-codex-key-valid-length-12345', // 20文字以上
      claudeCodeToken: null,
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    setupAgentClients(agentMode, workingDir, credentials);

    // Then: 環境変数が設定される
    expect(process.env.CODEX_API_KEY).toBe(credentials.codexApiKey);
    expect(process.env.OPENAI_API_KEY).toBe(credentials.codexApiKey);
  });

  test('claude モード時、環境変数は ClaudeAgentClient 内部で処理される', () => {
    // Given: claude モード
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    setupAgentClients(agentMode, workingDir, credentials);

    // Then: ClaudeAgentClient が初期化される（環境変数は ClaudeAgentClient 内部で処理）
    expect(ClaudeAgentClientMock).toHaveBeenCalled();
  });
});

// =============================================================================
// PHASE_AGENT_PRIORITY マッピング（Issue #306）
// =============================================================================

describe('PHASE_AGENT_PRIORITY - 正常系（Issue #306）', () => {
  test('すべてのフェーズに優先順位が定義されている', () => {
    // Given: 全10フェーズのリスト
    const phaseNames: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    // When & Then: 各フェーズに対して優先順位が定義されている
    for (const phaseName of phaseNames) {
      expect(PHASE_AGENT_PRIORITY[phaseName]).toBeDefined();
      expect(['codex-first', 'claude-first']).toContain(PHASE_AGENT_PRIORITY[phaseName]);
    }
  });

  test('claude-first フェーズが正しく設定されている', () => {
    // Given: Claude Code優先のフェーズリスト
    const claudeFirstPhases: PhaseName[] = [
      'planning',          // 戦略立案、情報整理
      'requirements',      // 要件の構造化、分析
      'design',            // アーキテクチャ設計、ドキュメント作成
      'test_scenario',     // テストシナリオの設計・整理
      'documentation',     // ドキュメント作成
      'report',            // レポート作成、要約
      'evaluation',        // 評価、分析
    ];

    // When & Then: すべてのフェーズで 'claude-first' が返される
    for (const phaseName of claudeFirstPhases) {
      expect(PHASE_AGENT_PRIORITY[phaseName]).toBe('claude-first');
    }
  });

  test('codex-first フェーズが正しく設定されている', () => {
    // Given: Codex優先のフェーズリスト
    const codexFirstPhases: PhaseName[] = [
      'implementation',        // 具体的なコード実装
      'test_implementation',   // テストコード生成
      'testing',               // テスト実行、デバッグ
    ];

    // When & Then: すべてのフェーズで 'codex-first' が返される
    for (const phaseName of codexFirstPhases) {
      expect(PHASE_AGENT_PRIORITY[phaseName]).toBe('codex-first');
    }
  });

  test('claude-first フェーズは7つ、codex-first フェーズは3つ', () => {
    // Given: PHASE_AGENT_PRIORITY マッピング
    const allPhases = Object.entries(PHASE_AGENT_PRIORITY);

    // When: 各優先順位をカウント
    const claudeFirstCount = allPhases.filter(([_, priority]) => priority === 'claude-first').length;
    const codexFirstCount = allPhases.filter(([_, priority]) => priority === 'codex-first').length;

    // Then: 期待どおりのカウント
    expect(claudeFirstCount).toBe(7);
    expect(codexFirstCount).toBe(3);
    expect(allPhases.length).toBe(10); // 全10フェーズ
  });
});

describe('PHASE_AGENT_PRIORITY - 型安全性（Issue #306）', () => {
  test('Record<PhaseName, AgentPriority> 型として定義されている', () => {
    // Given: PHASE_AGENT_PRIORITY 定数
    // When & Then: 型安全性はコンパイル時にチェックされる
    // ランタイムテストとしては、キーの網羅性を確認

    const expectedPhases: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    const actualPhases = Object.keys(PHASE_AGENT_PRIORITY) as PhaseName[];

    // すべてのフェーズがマッピングに含まれている
    expect(actualPhases.sort()).toEqual(expectedPhases.sort());
  });

  test('AgentPriority 型の値のみが含まれている', () => {
    // Given: PHASE_AGENT_PRIORITY マッピング
    const validPriorities: AgentPriority[] = ['codex-first', 'claude-first'];

    // When & Then: すべての値が有効な AgentPriority である
    for (const priority of Object.values(PHASE_AGENT_PRIORITY)) {
      expect(validPriorities).toContain(priority);
    }
  });
});
