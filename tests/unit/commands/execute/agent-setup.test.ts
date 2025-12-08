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
    (fs.existsSync as jest.Mock).mockImplementation((path: unknown) => {
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
    (fs.existsSync as jest.Mock).mockImplementation((path: unknown) => {
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
    (fs.existsSync as jest.Mock).mockImplementation((path: unknown) => {
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

  test('短すぎる CODEX_API_KEY が検出された場合、警告ログが出力される', () => {
    // Given: 短すぎる CODEX_API_KEY が設定されている
    const homeDir = '/home/user';
    const repoRoot = '/workspace/repo';
    const shortApiKey = 'short-key'; // 20文字未満
    (config.getCodexApiKey as jest.Mock).mockReturnValue(shortApiKey);
    (config.getClaudeCredentialsPath as jest.Mock).mockReturnValue(null);
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // モックした logger をインポート
    const { logger } = require('../../../../src/utils/logger.js');

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

    // Then: CodexAgentClient のみ初期化される
    expect(CodexAgentClient).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
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
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY to be set with a valid Codex API key');
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
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY to be set with a valid Codex API key');
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
    }).toThrow('Agent mode "codex" requires CODEX_API_KEY to be set with a valid Codex API key');
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
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: undefined });
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
    expect(ClaudeAgentClient).toHaveBeenCalledWith({
      workingDir,
      credentialsPath: '/home/user/.claude-code/credentials.json',
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

    // Then: 両方初期化される
    expect(CodexAgentClient).toHaveBeenCalledWith({ workingDir, model: 'gpt-5-codex' });
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: undefined });
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
    expect(CodexAgentClient).not.toHaveBeenCalled();
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: undefined });
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
    expect(CodexAgentClient).not.toHaveBeenCalled();
    expect(ClaudeAgentClient).toHaveBeenCalledWith({ workingDir, credentialsPath: undefined });
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
    expect(ClaudeAgentClient).toHaveBeenCalled();
  });
});

// =============================================================================
// PHASE_AGENT_PRIORITY マッピング（Issue #306）
// =============================================================================

import { PHASE_AGENT_PRIORITY, type AgentPriority } from '../../../../src/commands/execute/agent-setup.js';
import { PhaseName } from '../../../../src/types.js';

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
