/**
 * ユニットテスト: AgentExecutor - Codex CLI 可用性チェック詳細 (Issue #706)
 *
 * テスト対象:
 * - AgentExecutor の Codex 不可時フォールバック動作
 * - Codex 実行時の CODEX_CLI_NOT_FOUND エラーからのフォールバック
 * - agentPriority と Codex 不可の連携
 *
 * テストシナリオ参照:
 * - 2.2 AgentExecutor.executeWithAgent
 *   - executeWithAgent_Codex不可_フォールバック選択_正常系
 *   - executeWithAgent_Codex可_通常実行_正常系
 *
 * 注意: ESM 環境では node:child_process の spawnSync を直接 spy できないため、
 * jest.unstable_mockModule を使用して node:child_process をモック化する。
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';

// ESM read-only プロパティ問題を回避: node:child_process をモック化
const mockSpawnSync = jest.fn();
const mockSpawn = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  spawn: mockSpawn,
}));

// jest.unstable_mockModule の後に動的インポートでモジュールをロード
const { AgentExecutor } = await import('../../../../src/phases/core/agent-executor.js');

const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'agent-executor-codex-avail-test');

/**
 * モック AgentClient を作成
 */
function createMockAgentClient(
  executeResult: string[],
  shouldThrow?: Error,
): any {
  return {
    executeTask: jest.fn<any>().mockImplementation(async () => {
      if (shouldThrow) {
        throw shouldThrow;
      }
      return executeResult;
    }),
    getBinaryPath: jest.fn<any>().mockReturnValue('/usr/bin/codex'),
  };
}

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(workflowDir: string): any {
  return {
    workflowDir,
    addCost: jest.fn<any>(),
  };
}

describe('AgentExecutor - Codex実行エラーからのフォールバック（Issue #706）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-codex-error-fallback');
    await fs.ensureDir(testWorkflowDir);
    mockSpawnSync.mockReset();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  // テストケース: CODEX_CLI_NOT_FOUND エラーで Claude にフォールバック
  test('Codex実行でCODEX_CLI_NOT_FOUNDエラー時にClaudeへフォールバックする', async () => {
    // Given: Codex CLI は --version チェックを通過するが、実行時に CODEX_CLI_NOT_FOUND エラー
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const codexError: any = new Error('Missing optional dependency @openai/codex-linux-arm64');
    codexError.code = 'CODEX_CLI_NOT_FOUND';

    const mockCodex = createMockAgentClient([], codexError);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude fallback result' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Codexが試行されて失敗し、Claudeにフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude fallback result');
  });

  // テストケース: 一般エラーでもフォールバックが機能する
  test('Codex実行で一般エラー時にもClaudeへフォールバックする', async () => {
    // Given: Codex CLI は --version チェック通過、実行時に一般エラー
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([], new Error('Codex execution timeout'));
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude general fallback' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Claude にフォールバック
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude general fallback');
  });

  // テストケース: Codex のみでフォールバック先がない場合、エラーがスローされる
  test('Codex失敗でClaudeがnullの場合、エラーがスローされる', async () => {
    // Given: Codex CLI は --version チェック通過、実行時に CODEX_CLI_NOT_FOUND エラー
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const codexError: any = new Error('CODEX_CLI_NOT_FOUND');
    codexError.code = 'CODEX_CLI_NOT_FOUND';
    const mockCodex = createMockAgentClient([], codexError);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'testing', process.cwd());

    // When/Then: エラーがスローされる
    await expect(
      executor.executeWithAgent('Test prompt', {
        logDir: path.join(testWorkflowDir, 'testing-execute'),
      })
    ).rejects.toThrow();
  });

  // テストケース: Codex 空出力 → Claude フォールバック
  test('Codex空出力時にClaudeへフォールバックする', async () => {
    // Given: Codex CLI は --version チェック通過、空出力を返す
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude empty output fallback' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Codex が実行され、空出力を検知して Claude にフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude empty output fallback');
  });

  // テストケース: 認証エラー → Claude フォールバック
  test('Codex認証エラー時にClaudeへフォールバックする', async () => {
    // Given: Codex CLI は --version チェック通過、認証エラーメッセージを返す
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([
      'Error: invalid bearer token',
    ]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude auth error fallback' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: 認証エラーを検知して Claude にフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude auth error fallback');
  });

  // テストケース: Codex CLI が --version で不可 → 自動的に Claude にフォールバック
  test('Codex CLIが--versionで不可の場合、自動的にClaudeへフォールバックする', async () => {
    // Given: Codex CLI が --version チェックで ENOENT エラー
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('spawn ENOENT'),
      stdout: '',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed', content: 'Codex result (should not appear)' }),
    ]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude auto-selected result' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Codex は実行されず、Claude が自動選択される
    expect(mockCodex.executeTask).not.toHaveBeenCalled();
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude auto-selected result');
  });
});

describe('AgentExecutor - agentPriority連携（Issue #706 + #306）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-codex-priority');
    await fs.ensureDir(testWorkflowDir);
    mockSpawnSync.mockReset();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  // テストケース: claude-first + Codex エラー → Claude がプライマリ
  test('claude-first優先でClaude成功時、Codexエラーは影響しない', async () => {
    // Given: claude-first 優先順位で Claude が正常実行
    // Codex CLI は --version で不可（しかし claude-first なので影響なし）
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('spawn ENOENT'),
      stdout: '',
      stderr: '',
    });

    const codexError: any = new Error('CODEX_CLI_NOT_FOUND');
    codexError.code = 'CODEX_CLI_NOT_FOUND';

    const mockCodex = createMockAgentClient([], codexError);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude primary success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
      undefined, 'claude-first'
    );

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'planning-execute'),
    });

    // Then: Claude がプライマリとして実行成功
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    // Codex は呼ばれない（Claude が成功したため）
    expect(mockCodex.executeTask).not.toHaveBeenCalled();
    expect(result[0]).toContain('Claude primary success');
  });

  // テストケース: claude-first + Claude失敗 + Codex不可 → 両方失敗
  test('claude-first優先でClaude失敗+Codex不可の場合、例外がスローされる', async () => {
    // Given: Codex CLI は --version で不可
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('spawn ENOENT'),
      stdout: '',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([], new Error('Codex CLI not found'));
    const mockClaude = createMockAgentClient([], new Error('Claude auth failed'));
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
      undefined, 'claude-first'
    );

    // When/Then: Claude が失敗、Codex は不可判定されているためフォールバック先なし、例外がスローされる
    await expect(
      executor.executeWithAgent('Test prompt', {
        logDir: path.join(testWorkflowDir, 'planning-execute'),
      })
    ).rejects.toThrow();
  });

  // テストケース: Codex クライアントのみ、Codex可用で成功
  test('Codexクライアントのみで正常実行が成功する', async () => {
    // Given: Codex CLI は --version チェック通過
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed', content: 'Codex only success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Codex が正常実行
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Codex only success');
  });

  // テストケース: Claude クライアントのみ、正常実行
  test('Claudeクライアントのみで正常実行が成功する', async () => {
    // Given: Claude のみ（Codex なし）
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude only success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出す
    const result = await executor.executeWithAgent('Test prompt', {
      logDir: path.join(testWorkflowDir, 'testing-execute'),
    });

    // Then: Claude が正常実行
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('Claude only success');
  });

  // テストケース: 両方 null → エラー
  test('両方nullの場合、エラーがスローされる', async () => {
    // Given: 両方 null
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, null, mockMetadata, 'testing', process.cwd());

    // When/Then: エラーがスローされる
    await expect(
      executor.executeWithAgent('Test prompt', {
        logDir: path.join(testWorkflowDir, 'testing-execute'),
      })
    ).rejects.toThrow('No agent client configured for this phase.');
  });
});
