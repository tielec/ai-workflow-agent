/**
 * ユニットテスト: workflow-executor モジュール
 *
 * テスト対象:
 * - executePhasesSequential(): フェーズの順次実行
 * - executePhasesFrom(): 特定フェーズからの実行
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  executePhasesSequential,
  executePhasesFrom,
} from '../../../../src/commands/execute/workflow-executor.js';
import type { PhaseName } from '../../../../src/types.js';
import type { PhaseContext, ExecutionSummary } from '../../../../src/types/commands.js';
import type { GitManager } from '../../../../src/core/git-manager.js';

// モジュールのモック
jest.mock('../../../../src/core/phase-factory.js');

import { createPhaseInstance } from '../../../../src/core/phase-factory.js';

// =============================================================================
// テストフィクスチャ
// =============================================================================

/**
 * モック PhaseContext を作成
 */
function createMockContext(): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: {} as any,
    codexClient: null,
    claudeClient: null,
    githubClient: null,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
  };
}

/**
 * モック GitManager を作成
 */
function createMockGitManager(): GitManager {
  return {} as GitManager;
}

/**
 * モック PhaseInstance を作成
 */
function createMockPhaseInstance(runResult: boolean) {
  return {
    run: jest.fn().mockResolvedValue(runResult),
  };
}

// =============================================================================
// テストセットアップ
// =============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// executePhasesSequential() - 正常系
// =============================================================================

describe('executePhasesSequential - 正常系', () => {
  test('単一フェーズ実行成功', async () => {
    // Given: 単一フェーズリスト
    const phases: PhaseName[] = ['planning'];
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesSequential(phases, context, gitManager);

    // Then: ExecutionSummary が success: true を返す
    expect(result.success).toBe(true);
    expect(result.results.planning).toEqual({ success: true });
    expect(createPhaseInstance).toHaveBeenCalledWith('planning', context);
    expect(mockPhase.run).toHaveBeenCalledWith({
      gitManager,
      cleanupOnComplete: undefined,
      cleanupOnCompleteForce: undefined,
    });
  });

  test('複数フェーズ順次実行成功', async () => {
    // Given: 複数フェーズリスト
    const phases: PhaseName[] = ['planning', 'requirements', 'design'];
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesSequential(phases, context, gitManager);

    // Then: ExecutionSummary が success: true を返す
    expect(result.success).toBe(true);
    expect(result.results.planning).toEqual({ success: true });
    expect(result.results.requirements).toEqual({ success: true });
    expect(result.results.design).toEqual({ success: true });
    expect(createPhaseInstance).toHaveBeenCalledTimes(3);
    expect(mockPhase.run).toHaveBeenCalledTimes(3);
  });

  test('cleanupOnComplete フラグが正しく渡される', async () => {
    // Given: cleanupOnComplete = true
    const phases: PhaseName[] = ['planning'];
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行（cleanupOnComplete = true）
    const result: ExecutionSummary = await executePhasesSequential(
      phases,
      context,
      gitManager,
      true,
      false,
    );

    // Then: run() に cleanupOnComplete が渡される
    expect(result.success).toBe(true);
    expect(mockPhase.run).toHaveBeenCalledWith({
      gitManager,
      cleanupOnComplete: true,
      cleanupOnCompleteForce: false,
    });
  });

  test('cleanupOnCompleteForce フラグが正しく渡される', async () => {
    // Given: cleanupOnCompleteForce = true
    const phases: PhaseName[] = ['planning'];
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行（cleanupOnCompleteForce = true）
    const result: ExecutionSummary = await executePhasesSequential(
      phases,
      context,
      gitManager,
      false,
      true,
    );

    // Then: run() に cleanupOnCompleteForce が渡される
    expect(result.success).toBe(true);
    expect(mockPhase.run).toHaveBeenCalledWith({
      gitManager,
      cleanupOnComplete: false,
      cleanupOnCompleteForce: true,
    });
  });
});

// =============================================================================
// executePhasesSequential() - 異常系
// =============================================================================

describe('executePhasesSequential - 異常系', () => {
  test('フェーズ実行失敗: ExecutionSummary が success: false を返す', async () => {
    // Given: 複数フェーズリスト、途中のフェーズが失敗
    const phases: PhaseName[] = ['planning', 'requirements', 'design'];
    const context = createMockContext();
    const gitManager = createMockGitManager();

    let callCount = 0;
    (createPhaseInstance as jest.Mock).mockImplementation(() => {
      callCount++;
      return createMockPhaseInstance(callCount !== 2); // 2番目のフェーズ（requirements）を失敗させる
    });

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesSequential(phases, context, gitManager);

    // Then: ExecutionSummary が success: false を返す
    expect(result.success).toBe(false);
    expect(result.failedPhase).toBe('requirements');
    expect(result.error).toBe('Phase requirements failed.');
    expect(result.results.planning).toEqual({ success: true });
    expect(result.results.requirements).toEqual({ success: false });
    expect(result.results.design).toBeUndefined(); // 後続フェーズは実行されない
  });

  test('フェーズ実行中に例外スロー: ExecutionSummary が success: false を返す', async () => {
    // Given: 複数フェーズリスト、途中のフェーズで例外
    const phases: PhaseName[] = ['planning', 'requirements', 'design'];
    const context = createMockContext();
    const gitManager = createMockGitManager();

    let callCount = 0;
    (createPhaseInstance as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        // 2番目のフェーズで例外をスロー
        return {
          run: jest.fn().mockRejectedValue(new Error('Test error message')),
        };
      }
      return createMockPhaseInstance(true);
    });

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesSequential(phases, context, gitManager);

    // Then: ExecutionSummary が success: false を返す
    expect(result.success).toBe(false);
    expect(result.failedPhase).toBe('requirements');
    expect(result.error).toBe('Test error message');
    expect(result.results.planning).toEqual({ success: true });
    expect(result.results.requirements).toEqual({ success: false, error: 'Test error message' });
    expect(result.results.design).toBeUndefined(); // 後続フェーズは実行されない
  });

  test('最初のフェーズが失敗した場合、後続フェーズは実行されない', async () => {
    // Given: 複数フェーズリスト、最初のフェーズが失敗
    const phases: PhaseName[] = ['planning', 'requirements', 'design'];
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(false);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesSequential(phases, context, gitManager);

    // Then: 最初のフェーズのみ実行される
    expect(result.success).toBe(false);
    expect(result.failedPhase).toBe('planning');
    expect(createPhaseInstance).toHaveBeenCalledTimes(1);
    expect(mockPhase.run).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// executePhasesFrom() - 正常系
// =============================================================================

describe('executePhasesFrom - 正常系', () => {
  test('特定フェーズから実行: planning から開始', async () => {
    // Given: startPhase = 'planning'
    const startPhase: PhaseName = 'planning';
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: planning 以降のフェーズが実行される
    expect(result.success).toBe(true);
    // planning から evaluation まで10フェーズ
    expect(createPhaseInstance).toHaveBeenCalledTimes(10);
  });

  test('特定フェーズから実行: requirements から開始', async () => {
    // Given: startPhase = 'requirements'
    const startPhase: PhaseName = 'requirements';
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: requirements 以降のフェーズが実行される
    expect(result.success).toBe(true);
    // requirements から evaluation まで9フェーズ
    expect(createPhaseInstance).toHaveBeenCalledTimes(9);
  });

  test('特定フェーズから実行: evaluation から開始（最後のフェーズ）', async () => {
    // Given: startPhase = 'evaluation'
    const startPhase: PhaseName = 'evaluation';
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: evaluation のみ実行される
    expect(result.success).toBe(true);
    expect(createPhaseInstance).toHaveBeenCalledTimes(1);
    expect(createPhaseInstance).toHaveBeenCalledWith('evaluation', context);
  });

  test('cleanupOnComplete フラグが executePhasesSequential に渡される', async () => {
    // Given: startPhase = 'planning', cleanupOnComplete = true
    const startPhase: PhaseName = 'planning';
    const context = createMockContext();
    const gitManager = createMockGitManager();
    const mockPhase = createMockPhaseInstance(true);
    (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);

    // When: フェーズを実行（cleanupOnComplete = true）
    const result: ExecutionSummary = await executePhasesFrom(
      startPhase,
      context,
      gitManager,
      true,
      false,
    );

    // Then: cleanupOnComplete が渡される
    expect(result.success).toBe(true);
    expect(mockPhase.run).toHaveBeenCalledWith({
      gitManager,
      cleanupOnComplete: true,
      cleanupOnCompleteForce: false,
    });
  });
});

// =============================================================================
// executePhasesFrom() - 異常系
// =============================================================================

describe('executePhasesFrom - 異常系', () => {
  test('未知のフェーズ名: ExecutionSummary が success: false を返す', async () => {
    // Given: 未知のフェーズ名
    const startPhase: PhaseName = 'unknown_phase' as PhaseName;
    const context = createMockContext();
    const gitManager = createMockGitManager();

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: ExecutionSummary が success: false を返す
    expect(result.success).toBe(false);
    expect(result.failedPhase).toBe('unknown_phase');
    expect(result.error).toBe('Unknown phase: unknown_phase');
    expect(createPhaseInstance).not.toHaveBeenCalled();
  });

  test('空文字列のフェーズ名: ExecutionSummary が success: false を返す', async () => {
    // Given: 空文字列
    const startPhase: PhaseName = '' as PhaseName;
    const context = createMockContext();
    const gitManager = createMockGitManager();

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: ExecutionSummary が success: false を返す
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown phase');
  });
});

// =============================================================================
// PHASE_ORDER 定義の検証
// =============================================================================

describe('PHASE_ORDER 定義の検証', () => {
  test('すべてのフェーズが PHASE_ORDER に含まれている', async () => {
    // Given: すべてのフェーズ名
    const allPhaseNames: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];
    const context = createMockContext();
    const gitManager = createMockGitManager();

    // When: 各フェーズから実行
    for (const phaseName of allPhaseNames) {
      const mockPhase = createMockPhaseInstance(true);
      (createPhaseInstance as jest.Mock).mockReturnValue(mockPhase);
      const result = await executePhasesFrom(phaseName, context, gitManager);

      // Then: 成功する
      expect(result.success).toBe(true);
      jest.clearAllMocks();
    }
  });
});
