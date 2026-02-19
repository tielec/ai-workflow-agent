/**
 * インテグレーションテスト: Issue #706 - フォールバック連鎖の検証
 *
 * テスト対象:
 * - Codex CLI 不可 → AgentExecutor で Claude にフォールバック
 * - 環境事前チェック → セットアップ通知生成 → プロンプト注入
 * - ContentParser の多段フォールバック (Codex → Claude → Regex)
 *
 * テストシナリオ参照:
 * - 3.1 TestingPhase_環境不足とCodex不可の連鎖回避
 * - 3.2 TestingPhase_通常成功パス
 * - 3.3 ReviewRevise_環境情報注入の有効化
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
const { AgentExecutor } = await import('../../src/phases/core/agent-executor.js');

const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'integration-706-fallback');

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
    getBinaryPath: jest.fn<any>().mockReturnValue('/path/to/codex'),
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

describe('Integration: Issue #706 - Codex不可時のフォールバック連鎖', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-706-integration');
    await fs.ensureDir(testWorkflowDir);
    mockSpawnSync.mockReset();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  // シナリオ: TestingPhase_環境不足とCodex不可の連鎖回避
  // 目的: 失敗連鎖を回避し、testing フェーズ（AgentExecutor）が完走できることを確認
  test('ARM64環境でCodex不可 → Claude自動選択 → 正常実行完了', async () => {
    // Given: ARM64環境でCodex CLIが利用不可（spawn ENOENT）
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
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        content: 'テスト実行完了。すべてのテストが通過しました。',
      }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);

    // AgentExecutor を codex-first で作成（通常のフェーズ設定）
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'testing', process.cwd()
    );

    // When: テストフェーズのエージェント実行を開始
    const result = await executor.executeWithAgent(
      'テストを実行してください',
      { logDir: path.join(testWorkflowDir, 'testing-execute') }
    );

    // Then: フェーズが停止せず完了する
    expect(result.length).toBeGreaterThan(0);
    // Codexは実行されない（可用性チェックで不可と判定）
    expect(mockCodex.executeTask).not.toHaveBeenCalled();
    // Claudeがフォールバックとして使用される
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    // 環境チェック（spawnSync）が実行されている
    expect(mockSpawnSync).toHaveBeenCalled();
  });

  // シナリオ: Codex実行時にCODEX_CLI_NOT_FOUNDエラー → Claudeフォールバック
  test('Codex実行中にCODEX_CLI_NOT_FOUNDエラー → Claudeフォールバック → 正常完了', async () => {
    // Given: Codex CLIは存在するが実行時にARM64依存エラーが発生
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const codexError: any = new Error(
      'Codex CLI optional dependency for this platform is missing.'
    );
    codexError.code = 'CODEX_CLI_NOT_FOUND';

    const mockCodex = createMockAgentClient([], codexError);
    const mockClaude = createMockAgentClient([
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        content: 'Claude: テスト実行完了',
      }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'testing', process.cwd()
    );

    // When: エージェント実行
    const result = await executor.executeWithAgent(
      'テストを実行してください',
      { logDir: path.join(testWorkflowDir, 'testing-execute') }
    );

    // Then: Codexが試行され失敗、Claudeにフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('Claude');
  });

  // シナリオ: TestingPhase_通常成功パス
  // 目的: 通常環境で既存フローが回帰しないことを確認
  test('Codex利用可能時は通常通りCodexがプライマリとして実行される', async () => {
    // Given: Codex CLIが利用可能
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: 'codex 1.0.0',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([
      JSON.stringify({
        type: 'response.completed',
        usage: { input_tokens: 500, output_tokens: 200 },
        total_cost_usd: 0.02,
        content: 'Codex: テスト実行完了',
      }),
    ]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude fallback (should not appear)' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'testing', process.cwd()
    );

    // When: エージェント実行
    const result = await executor.executeWithAgent(
      'テストを実行してください',
      { logDir: path.join(testWorkflowDir, 'testing-execute') }
    );

    // Then: Codexがプライマリとして実行され、Claudeは使われない
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);

    // メトリクスが正しく記録されている
    const metrics = executor.getLastExecutionMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics?.inputTokens).toBe(500);
    expect(metrics?.outputTokens).toBe(200);
  });

  // シナリオ: 複数回の実行でCodex不可キャッシュが正しく機能する
  test('複数回実行でCodex不可キャッシュが機能し、毎回Claudeが使用される', async () => {
    // Given: Codex CLIが利用不可（ENOENT）
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('spawn ENOENT'),
      stdout: '',
      stderr: '',
    });

    const mockCodex = createMockAgentClient([]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', content: 'Claude execution' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockCodex, mockClaude, mockMetadata, 'testing', process.cwd()
    );

    // When: 3回連続で実行
    for (let i = 0; i < 3; i++) {
      mockClaude.executeTask.mockResolvedValueOnce([
        JSON.stringify({ type: 'result', content: `Claude execution ${i + 1}` }),
      ]);
      const result = await executor.executeWithAgent(
        `テスト実行 ${i + 1}`,
        { logDir: path.join(testWorkflowDir, `testing-execute-${i}`) }
      );
      expect(result.length).toBeGreaterThan(0);
    }

    // Then: Codexは一度も実行されない
    expect(mockCodex.executeTask).not.toHaveBeenCalled();
    // Claudeが3回使用された
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(3);
    // Codex CLI可用性チェック（spawnSync --version）は1回のみ（キャッシュされる）
    const codexVersionCalls = mockSpawnSync.mock.calls.filter(
      (call: any[]) => call[0] === '/path/to/codex' && call[1]?.[0] === '--version'
    );
    expect(codexVersionCalls.length).toBe(1);
  });
});

describe('Integration: Issue #706 - 環境チェックとプロンプト生成の連携', () => {
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;

  beforeEach(async () => {
    testRootDir = path.join(TEST_DIR, 'env-check-integration');
    testWorkingDir = path.join(testRootDir, 'workspace');
    testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-706');
    await fs.ensureDir(testWorkflowDir);
    mockSpawnSync.mockReset();

    // ContentParser 初期化エラーを回避
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'dummy-key-for-ci';
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  // シナリオ: 環境チェック → セットアップ通知 → プロンプト注入の一連の流れ
  test('環境チェックからセットアップ通知生成までの一連のフローが正しく動作する', async () => {
    // Given: python3 が未インストール
    mockSpawnSync.mockReturnValue({
      status: 127,
      error: null,
      stdout: '',
      stderr: '',
    });

    const { TestingPhase } = await import('../../src/phases/testing.js');
    const { config } = await import('../../src/core/config.js');
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(true);

    const mockMetadata: any = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '706' },
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      getPhaseStatus: jest.fn<any>(),
      updatePhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      save: jest.fn<any>(),
    };
    const mockGithub: any = {
      postReviewResult: jest.fn<any>(),
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 環境チェックを実行
    const envStatus = (phase as any).checkTestEnvironment();

    // Then: python3 が不足として検出される
    expect(envStatus.ready).toBe(false);
    expect(envStatus.missing).toContain('python3');

    // When: セットアップ通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice(envStatus);

    // Then: 通知にPythonインストール手順が含まれる
    expect(notice).not.toBeNull();
    expect(notice).toContain('テスト環境の事前チェック結果');
    expect(notice).toContain('python3');
    expect(notice).toContain('apt-get update && apt-get install -y python3 python3-pip');
    expect(notice).toContain('インストール後にテストを実行');
  });

  // シナリオ: 環境準備済みの場合、通知なし
  test('環境準備済みの場合、セットアップ通知が生成されない', async () => {
    // Given: python3 が利用可能
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: null,
      stdout: '',
      stderr: '',
    });

    const { TestingPhase } = await import('../../src/phases/testing.js');

    const mockMetadata2: any = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '706' },
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      getPhaseStatus: jest.fn<any>(),
      updatePhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      save: jest.fn<any>(),
    };
    const mockGithub2: any = {
      postReviewResult: jest.fn<any>(),
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata2,
      githubClient: mockGithub2,
      skipDependencyCheck: true,
    });

    // When: 環境チェックを実行
    const envStatus = (phase as any).checkTestEnvironment();

    // Then: ready = true
    expect(envStatus.ready).toBe(true);
    expect(envStatus.missing).toEqual([]);

    // When: セットアップ通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice(envStatus);

    // Then: null（通知なし）
    expect(notice).toBeNull();
  });
});
