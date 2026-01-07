/**
 * ユニットテスト: agent-executor.ts
 *
 * テスト対象:
 * - AgentExecutor.executeWithAgent()
 * - エージェントフォールバック処理（認証エラー、空出力）
 * - 利用量メトリクスの抽出・記録
 * - ログファイル保存
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { AgentExecutor } from '../../../../src/phases/core/agent-executor.js';
import { PhaseName } from '../../../../src/types.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'agent-executor-test');

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
    getBinaryPath: jest.fn<any>().mockReturnValue('/path/to/binary'),
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

describe('AgentExecutor - 基本的なエージェント実行', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-agent-exec');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('1-1: Codex Agent が正常に実行される', async () => {
    // Given: Codex Agent のモック
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed', usage: { input_tokens: 1000, output_tokens: 500 }, total_cost_usd: 0.05 }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'planning', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

    // Then: Codex Agent が実行される
    expect(result.length).toBeGreaterThan(0);
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockCodex.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Test prompt',
        maxTurns: 50,
        workingDirectory: process.cwd(),
      }),
    );
  });

  test('1-2: Claude Agent が正常に実行される', async () => {
    // Given: Claude Agent のモック
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 120000 }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'requirements', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'requirements-execute') });

    // Then: Claude Agent が実行される
    expect(result.length).toBeGreaterThan(0);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
  });

  test('1-3: エージェントが設定されていない場合、例外がスローされる', async () => {
    // Given: エージェントが設定されていない
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, null, mockMetadata, 'design', process.cwd());

    // When/Then: executeWithAgent で例外がスローされる
    await expect(
      executor.executeWithAgent('Test prompt')
    ).rejects.toThrow('No agent client configured for this phase.');
  });
});

describe('AgentExecutor - フォールバック処理（認証エラー）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-fallback');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('2-1: Codex の認証エラー時に Claude へフォールバックする', async () => {
    // Given: Codex は認証エラーを返し、Claude は成功
    const mockCodex = createMockAgentClient([
      'Error: invalid bearer token',
    ]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'planning', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

    // Then: Codex が実行され、認証エラー検出後に Claude へフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });

  test('2-2: Codex の例外時に Claude へフォールバックする', async () => {
    // Given: Codex は例外をスロー、Claude は成功
    const mockCodex = createMockAgentClient([], new Error('Codex CLI not found'));
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'planning', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

    // Then: Claude へフォールバック
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });

  test('2-3: Claude のみの場合、フォールバックは発生しない', async () => {
    // Given: Claude のみで認証エラー
    const mockClaude = createMockAgentClient([
      'Error: authentication_error',
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'requirements', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'requirements-execute') });

    // Then: フォールバックせず、認証エラーメッセージを返す
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result[0]).toContain('authentication_error');
  });
});

describe('AgentExecutor - フォールバック処理（空出力）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-empty-output');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('3-1: Codex が空出力を返した場合、Claude へフォールバックする', async () => {
    // Given: Codex は空配列、Claude は成功
    const mockCodex = createMockAgentClient([]);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'design', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'design-execute') });

    // Then: Claude へフォールバック
    expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });

  test('3-2: Claude のみの場合、空出力でもフォールバックしない', async () => {
    // Given: Claude のみで空出力
    const mockClaude = createMockAgentClient([]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'implementation', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

    // Then: 空配列が返される
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });
});

describe('AgentExecutor - 利用量メトリクス抽出', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-metrics');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('4-1: JSON メッセージから利用量メトリクスが正しく抽出される', async () => {
    // Given: 利用量メトリクスを含むメッセージ
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed', usage: { input_tokens: 1000, output_tokens: 500 }, total_cost_usd: 0.05 }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'planning', process.cwd());

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

    // Then: メトリクスが抽出され、記録される
    const metrics = executor.getLastExecutionMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics?.inputTokens).toBe(1000);
    expect(metrics?.outputTokens).toBe(500);
    expect(metrics?.totalCostUsd).toBe(0.05);
    expect(mockMetadata.addCost).toHaveBeenCalledWith(1000, 500, 0.05);
  });

  test('4-2: 正規表現フォールバックで利用量メトリクスが抽出される', async () => {
    // Given: JSON ではなくテキスト形式の利用量情報
    const mockClaude = createMockAgentClient([
      'Input tokens: 1200\nOutput tokens: 600\ntotal_cost_usd=0.06',
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'requirements', process.cwd());

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'requirements-execute') });

    // Then: 正規表現で抽出される
    const metrics = executor.getLastExecutionMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics?.inputTokens).toBe(1200);
    expect(metrics?.outputTokens).toBe(600);
    expect(metrics?.totalCostUsd).toBe(0.06);
  });

  test('4-3: 利用量メトリクスが含まれない場合、null が返される', async () => {
    // Given: 利用量メトリクスなし
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'design', process.cwd());

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'design-execute') });

    // Then: null が返される
    const metrics = executor.getLastExecutionMetrics();
    expect(metrics).toBeNull();
    expect(mockMetadata.addCost).not.toHaveBeenCalled();
  });

  test('4-4: 利用量メトリクスが0の場合、記録されない', async () => {
    // Given: すべて0のメトリクス
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed', usage: { input_tokens: 0, output_tokens: 0 }, total_cost_usd: 0 }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'planning', process.cwd());

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

    // Then: 記録されない
    expect(mockMetadata.addCost).not.toHaveBeenCalled();
  });
});

describe('AgentExecutor - ログファイル保存', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-log-files');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('5-1: プロンプトファイルが保存される', async () => {
    // Given: エージェント実行
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'planning', process.cwd());
    const logDir = path.join(testWorkflowDir, 'planning-execute');

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('This is a test prompt', { logDir });

    // Then: プロンプトファイルが保存される
    const promptFile = path.join(logDir, 'prompt.txt');
    expect(fs.existsSync(promptFile)).toBeTruthy();
    const promptContent = fs.readFileSync(promptFile, 'utf-8');
    expect(promptContent).toBe('This is a test prompt');
  });

  test('5-2: 生ログファイルが保存される', async () => {
    // Given: エージェント実行
    const mockCodex = createMockAgentClient([
      'Message 1',
      'Message 2',
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'requirements', process.cwd());
    const logDir = path.join(testWorkflowDir, 'requirements-execute');

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir });

    // Then: 生ログファイルが保存される
    const rawLogFile = path.join(logDir, 'agent_log_raw.txt');
    expect(fs.existsSync(rawLogFile)).toBeTruthy();
    const rawLogContent = fs.readFileSync(rawLogFile, 'utf-8');
    expect(rawLogContent).toContain('Message 1');
    expect(rawLogContent).toContain('Message 2');
  });

  test('5-3: フォーマット済みログファイルが保存される', async () => {
    // Given: エージェント実行
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_123' }),
      JSON.stringify({ type: 'response.completed', status: 'completed', duration_ms: 60000, turns: 1 }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'design', process.cwd());
    const logDir = path.join(testWorkflowDir, 'design-execute');

    // When: executeWithAgent を呼び出し
    await executor.executeWithAgent('Test prompt', { logDir });

    // Then: フォーマット済みログファイルが保存される
    const agentLogFile = path.join(logDir, 'agent_log.md');
    expect(fs.existsSync(agentLogFile)).toBeTruthy();
    const agentLogContent = fs.readFileSync(agentLogFile, 'utf-8');
    expect(agentLogContent).toContain('# Codex Agent 実行ログ');
    expect(agentLogContent).toContain('thread_123');
  });
});

describe('AgentExecutor - エラーハンドリング', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-errors');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('6-1: エージェント実行中のエラーが適切に処理される', async () => {
    // Given: エージェントが例外をスロー（フォールバックなし）
    const mockClaude = createMockAgentClient([], new Error('Network timeout'));
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'implementation', process.cwd());

    // When/Then: 例外がスローされる
    await expect(
      executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') })
    ).rejects.toThrow('Network timeout');
  });

  test('6-2: Codex CLI not found エラー時に適切なメッセージが表示される', async () => {
    // Given: Codex CLI not found エラー
    const error: any = new Error('Codex CLI not found');
    error.code = 'CODEX_CLI_NOT_FOUND';
    const mockCodex = createMockAgentClient([], error);
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, mockClaude, mockMetadata, 'testing', process.cwd());

    // When: executeWithAgent を呼び出し
    const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'testing-execute') });

    // Then: Claude へフォールバック（エラーメッセージは console に出力される）
    expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('AgentExecutor - maxTurns オプション', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-maxturns');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('7-1: maxTurns が指定されている場合、エージェントに渡される', async () => {
    // Given: maxTurns オプション指定
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(mockCodex, null, mockMetadata, 'documentation', process.cwd());

    // When: maxTurns=10 で呼び出し
    await executor.executeWithAgent('Test prompt', { maxTurns: 10, logDir: path.join(testWorkflowDir, 'documentation-execute') });

    // Then: maxTurns=10 が渡される
    expect(mockCodex.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTurns: 10,
      }),
    );
  });

  test('7-2: maxTurns が指定されていない場合、デフォルト値50が使用される', async () => {
    // Given: maxTurns オプションなし
    const mockClaude = createMockAgentClient([
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(null, mockClaude, mockMetadata, 'report', process.cwd());

    // When: オプションなしで呼び出し
    await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'report-execute') });

    // Then: maxTurns=50（デフォルト）が渡される
    expect(mockClaude.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTurns: 50,
      }),
    );
  });
});

// =============================================================================
// AgentExecutor - エージェント優先順位（Issue #306）
// =============================================================================

describe('AgentExecutor - エージェント優先順位（Issue #306）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-306-priority');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('claude-first 優先順位', () => {
    test('8-1: Claude と Codex が両方利用可能な場合、Claude がプライマリエージェントになる', async () => {
      // Given: claude-first 優先順位、両方のエージェントが利用可能
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude result' }),
      ]);
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Claude がプライマリエージェントとして使用される
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodex.executeTask).not.toHaveBeenCalled();
      expect(result[0]).toContain('Claude result');
    });

    test('8-2: Claude 失敗時に Codex へフォールバックする', async () => {
      // Given: claude-first 優先順位、Claude が例外をスロー
      const mockClaude = createMockAgentClient([], new Error('Claude execution failed'));
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex fallback result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Codex へフォールバック
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Codex fallback result');
    });

    test('8-3: Claude のみ利用可能な場合、Claude を使用する', async () => {
      // Given: claude-first 優先順位、Codex = null
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude only result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        null, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Claude が使用される
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Claude only result');
    });

    test('8-4: claude-first で Codex のみ利用可能な場合、Codex にフォールバックする', async () => {
      // Given: claude-first 優先順位、Claude = null
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex fallback result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, null, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Codex が使用される（フォールバック）
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Codex fallback result');
    });

    test('8-5: Claude 認証失敗時に Codex へフォールバックする', async () => {
      // Given: claude-first 優先順位、Claude が認証エラーを返す
      const mockClaude = createMockAgentClient([
        'Error: invalid bearer token',
      ]);
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex auth fallback' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Codex へフォールバック
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Codex auth fallback');
    });

    test('8-6: Claude 空出力時に Codex へフォールバックする', async () => {
      // Given: claude-first 優先順位、Claude が空配列を返す
      const mockClaude = createMockAgentClient([]);
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex empty fallback' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });

      // Then: Codex へフォールバック
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Codex empty fallback');
    });
  });

  describe('codex-first 優先順位', () => {
    test('9-1: Codex と Claude が両方利用可能な場合、Codex がプライマリエージェントになる', async () => {
      // Given: codex-first 優先順位、両方のエージェントが利用可能
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex result' }),
      ]);
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Codex がプライマリエージェントとして使用される
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaude.executeTask).not.toHaveBeenCalled();
      expect(result[0]).toContain('Codex result');
    });

    test('9-2: Codex 失敗時に Claude へフォールバックする', async () => {
      // Given: codex-first 優先順位、Codex が例外をスロー
      const mockCodex = createMockAgentClient([], new Error('Codex execution failed'));
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude fallback result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Claude へフォールバック
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Claude fallback result');
    });

    test('9-3: Codex のみ利用可能な場合、Codex を使用する', async () => {
      // Given: codex-first 優先順位、Claude = null
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex only result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, null, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Codex が使用される
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Codex only result');
    });

    test('9-4: Codex 認証失敗時に Claude へフォールバックする', async () => {
      // Given: codex-first 優先順位、Codex が認証エラーを返す
      const mockCodex = createMockAgentClient([
        'Error: invalid bearer token',
      ]);
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude auth fallback' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Claude へフォールバック
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Claude auth fallback');
    });

    test('9-5: Codex 空出力時に Claude へフォールバックする', async () => {
      // Given: codex-first 優先順位、Codex が空配列を返す
      const mockCodex = createMockAgentClient([]);
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude empty fallback' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Claude へフォールバック
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Claude empty fallback');
    });
  });

  describe('デフォルト動作（agentPriority 未指定）', () => {
    test('10-1: agentPriority 未指定時は codex-first として動作する', async () => {
      // Given: agentPriority パラメータを省略
      const mockCodex = createMockAgentClient([
        JSON.stringify({ type: 'response.completed', content: 'Codex default result' }),
      ]);
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude result' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      // agentPriority パラメータを省略（デフォルト動作テスト）
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd()
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Codex がプライマリエージェントとして使用される（従来動作）
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaude.executeTask).not.toHaveBeenCalled();
      expect(result[0]).toContain('Codex default result');
    });

    test('10-2: 既存のフォールバック動作が維持される', async () => {
      // Given: agentPriority 未指定、Codex が失敗
      const mockCodex = createMockAgentClient([], new Error('Codex failed'));
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success', content: 'Claude fallback' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      // agentPriority パラメータを省略
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd()
      );

      // When: executeWithAgent を呼び出し
      const result = await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });

      // Then: Claude へフォールバック（従来動作と同じ）
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
      expect(result[0]).toContain('Claude fallback');
    });
  });

  describe('異常系テスト', () => {
    test('11-1: 両エージェントが null の場合、エラーをスローする', async () => {
      // Given: Codex と Claude の両方が null
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        null, null, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When/Then: 例外がスローされる
      await expect(
        executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') })
      ).rejects.toThrow('No agent client configured for this phase.');
    });

    test('11-2: claude-first で Claude と Codex 両方失敗時、エラーをスローする', async () => {
      // Given: claude-first 優先順位、両方のエージェントが失敗
      const mockClaude = createMockAgentClient([], new Error('Claude failed'));
      const mockCodex = createMockAgentClient([], new Error('Codex failed'));
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When/Then: 例外がスローされる（フォールバック先も失敗）
      await expect(
        executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') })
      ).rejects.toThrow('Codex failed');
    });

    test('11-3: codex-first で Codex と Claude 両方失敗時、エラーをスローする', async () => {
      // Given: codex-first 優先順位、両方のエージェントが失敗
      const mockCodex = createMockAgentClient([], new Error('Codex failed'));
      const mockClaude = createMockAgentClient([], new Error('Claude failed'));
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd(),
        undefined, 'codex-first'
      );

      // When/Then: 例外がスローされる（フォールバック先も失敗）
      await expect(
        executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') })
      ).rejects.toThrow('Claude failed');
    });

    test('11-4: claude-first で Claude のみ利用可能かつ失敗時、エラーをスローする', async () => {
      // Given: claude-first 優先順位、Claude のみ、かつ失敗
      const mockClaude = createMockAgentClient([], new Error('Claude only failed'));
      const mockMetadata = createMockMetadataManager(testWorkflowDir);
      const executor = new AgentExecutor(
        null, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // When/Then: 例外がスローされる（フォールバック先がない）
      await expect(
        executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') })
      ).rejects.toThrow('Claude only failed');
    });
  });

  describe('コンストラクタテスト', () => {
    test('12-1: agentPriority パラメータを受け入れる', async () => {
      // Given: agentPriority = 'claude-first'
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);

      // When: コンストラクタで agentPriority を指定
      const executor = new AgentExecutor(
        null, mockClaude, mockMetadata, 'planning', process.cwd(),
        undefined, 'claude-first'
      );

      // Then: インスタンスが正常に作成される
      expect(executor).toBeDefined();

      // 追加の検証: executeWithAgent が正常に動作することで優先順位が適用されていることを確認
      await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'planning-execute') });
      expect(mockClaude.executeTask).toHaveBeenCalledTimes(1);
    });

  test('12-2: agentPriority 未指定時は codex-first がデフォルト', async () => {
    // Given: agentPriority 未指定
    const mockCodex = createMockAgentClient([
      JSON.stringify({ type: 'response.completed' }),
    ]);
      const mockClaude = createMockAgentClient([
        JSON.stringify({ type: 'result', subtype: 'success' }),
      ]);
      const mockMetadata = createMockMetadataManager(testWorkflowDir);

      // When: コンストラクタで agentPriority を省略
      const executor = new AgentExecutor(
        mockCodex, mockClaude, mockMetadata, 'implementation', process.cwd()
      );

      // Then: Codex がプライマリエージェントになる（codex-first デフォルト）
      await executor.executeWithAgent('Test prompt', { logDir: path.join(testWorkflowDir, 'implementation-execute') });
      expect(mockCodex.executeTask).toHaveBeenCalledTimes(1);
      expect(mockClaude.executeTask).not.toHaveBeenCalled();
    });
  });
});

describe('AgentExecutor - 作業ディレクトリ検証（Issue #603）', () => {
  let testWorkflowDir: string;
  let repoDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-working-dir');
    repoDir = path.join(TEST_DIR, 'sd-platform-development');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('TC-U-603-040: validated working directory is passed to agent client', async () => {
    await fs.ensureDir(repoDir);
    const mockAgent = createMockAgentClient(['run completed']);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockAgent,
      null,
      mockMetadata,
      'requirements',
      path.join(TEST_DIR, 'fallback-working-dir'),
      () => repoDir,
    );

    const logDir = path.join(testWorkflowDir, '01_requirements', 'execute');
    const result = await executor.executeWithAgent('Test prompt', { logDir });

    expect(result.length).toBeGreaterThan(0);
    expect(mockAgent.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDirectory: repoDir,
      }),
    );
  });

  test('TC-U-603-041: invalid working directory throws before agent execution', async () => {
    const missingDir = path.join(TEST_DIR, 'missing-repo');
    const mockAgent = createMockAgentClient(['should not run']);
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const executor = new AgentExecutor(
      mockAgent,
      null,
      mockMetadata,
      'requirements',
      missingDir,
      () => missingDir,
    );

    await expect(
      executor.executeWithAgent('Test prompt', {
        logDir: path.join(testWorkflowDir, '01_requirements', 'execute'),
      }),
    ).rejects.toThrow(/\[Issue #603\] Working directory does not exist/);
    expect(mockAgent.executeTask).not.toHaveBeenCalled();
  });
});
