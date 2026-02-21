/**
 * インテグレーションテスト: workflow-executor × network-health-checker（Issue #721）
 *
 * テスト対象:
 * - executePhasesSequential(): ネットワークヘルスチェック統合フロー
 * - executePhasesFrom(): レジューム時のヘルスチェック適用
 *
 * テスト戦略: UNIT_INTEGRATION
 * - ESM環境のため jest.unstable_mockModule + 動的 import で依存モジュールをモック
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PhaseName } from '../../../../src/types.js';
import type { PhaseContext } from '../../../../src/types/commands.js';
import type { GitManager } from '../../../../src/core/git-manager.js';

type CheckNetworkHealthMock = jest.Mock;
type CreatePhaseInstanceMock = jest.Mock;

async function loadExecutor() {
  const checkNetworkHealthMock: CheckNetworkHealthMock = jest.fn();
  const createPhaseInstanceMock: CreatePhaseInstanceMock = jest.fn();

  await jest.unstable_mockModule('../../../../src/core/network-health-checker.js', () => ({
    __esModule: true,
    checkNetworkHealth: checkNetworkHealthMock,
  }));

  await jest.unstable_mockModule('../../../../src/core/phase-factory.js', () => ({
    __esModule: true,
    createPhaseInstance: createPhaseInstanceMock,
  }));

  const module = await import('../../../../src/commands/execute/workflow-executor.js');
  return {
    executePhasesSequential: module.executePhasesSequential,
    executePhasesFrom: module.executePhasesFrom,
    checkNetworkHealthMock,
    createPhaseInstanceMock,
  };
}

function createMockGitManager(): GitManager {
  return {
    squashCommits: jest.fn(),
  } as unknown as GitManager;
}

function createMockContextWithHealthCheck(
  overrides?: Partial<PhaseContext>,
): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: { updatePhaseStatus: jest.fn() } as any,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
    networkHealthCheck: true,
    networkThroughputDropThreshold: 70,
    ...overrides,
  };
}

function createMockContextWithoutHealthCheck(): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: { updatePhaseStatus: jest.fn() } as any,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
  };
}

describe('workflow-executor - ネットワークヘルスチェック統合', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('INT-001: ヘルスチェック有効・shouldStop:true時にExecutionSummaryがsuccess:falseで返却される', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: true,
      dropPercentage: 85,
      networkPacketsOutCurrent: 100,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 100000,
      networkOutPeak: 1000000,
    });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(false);
    expect(summary.failedPhase).toBe('planning');
    expect(summary.error).toContain('Network throughput degraded');
    expect(summary.stoppedReason).toBe('network_throughput_degraded');
    expect(summary.results).toEqual({});
    expect(createPhaseInstanceMock).not.toHaveBeenCalled();
  });

  test('INT-002: ヘルスチェック有効・2番目フェーズ開始前にshouldStop:trueで停止する', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock
      .mockResolvedValueOnce({
        available: true,
        shouldStop: false,
        dropPercentage: 10,
        networkPacketsOutCurrent: 900,
        networkPacketsOutPeak: 1000,
        networkOutCurrent: 900000,
        networkOutPeak: 1000000,
      })
      .mockResolvedValueOnce({
        available: true,
        shouldStop: true,
        dropPercentage: 80,
        networkPacketsOutCurrent: 200,
        networkPacketsOutPeak: 1000,
        networkOutCurrent: 200000,
        networkOutPeak: 1000000,
      });

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(false);
    expect(summary.failedPhase).toBe('requirements');
    expect(summary.stoppedReason).toBe('network_throughput_degraded');
    expect(summary.results?.planning).toEqual({ success: true });
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  test('INT-003: ヘルスチェック有効・shouldStop:false時にフェーズ実行が続行される', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: false,
      dropPercentage: 5,
      networkPacketsOutCurrent: 950,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 950000,
      networkOutPeak: 1000000,
    });

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(true);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  test('INT-004: ヘルスチェック有効・available:false時にフェーズ実行が続行される', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: false,
      shouldStop: false,
      dropPercentage: 0,
      networkPacketsOutCurrent: 0,
      networkPacketsOutPeak: 0,
      networkOutCurrent: 0,
      networkOutPeak: 0,
    });

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(true);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  test('INT-005: ヘルスチェック無効時にcheckNetworkHealthが一切呼ばれない', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithoutHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(true);
    expect(checkNetworkHealthMock).not.toHaveBeenCalled();
  });

  test('INT-006: ヘルスチェック無効・networkHealthCheckがundefined時にスキップされる', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithoutHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(true);
    expect(checkNetworkHealthMock).not.toHaveBeenCalled();
  });

  test('INT-007: グレースフル停止時のExecutionSummaryにstoppedReasonフィールドが含まれる', async () => {
    const { executePhasesSequential, checkNetworkHealthMock } = await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: true,
      dropPercentage: 90,
      networkPacketsOutCurrent: 100,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 100000,
      networkOutPeak: 1000000,
    });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary).toMatchObject({
      success: false,
      stoppedReason: 'network_throughput_degraded',
      failedPhase: expect.any(String),
      error: expect.stringContaining('Network throughput degraded'),
      results: expect.any(Object),
    });
  });

  test('INT-008: 通常の全フェーズ成功時のExecutionSummaryにstoppedReasonが含まれない', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: false,
      dropPercentage: 0,
      networkPacketsOutCurrent: 1000,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 1000000,
      networkOutPeak: 1000000,
    });

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary).toMatchObject({
      success: true,
      results: expect.any(Object),
    });
    expect(summary.stoppedReason).toBeUndefined();
  });

  test('INT-009: ヘルスチェックとskipPhasesの併用時にスキップフェーズは実行されない', async () => {
    const { executePhasesSequential, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: false,
      dropPercentage: 0,
      networkPacketsOutCurrent: 1000,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 1000000,
      networkOutPeak: 1000000,
    });

    const runMock = jest.fn().mockResolvedValue(true);
    createPhaseInstanceMock.mockReturnValue({ run: runMock });

    const context = createMockContextWithHealthCheck({
      skipPhases: ['requirements'],
    });
    const gitManager = createMockGitManager();
    const phases: PhaseName[] = ['planning', 'requirements'];

    const summary = await executePhasesSequential(phases, context, gitManager);

    expect(summary.success).toBe(true);
    expect(checkNetworkHealthMock).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  test('INT-010: executePhasesFromを通じてもネットワークヘルスチェックが適用される', async () => {
    const { executePhasesFrom, checkNetworkHealthMock, createPhaseInstanceMock } =
      await loadExecutor();

    checkNetworkHealthMock.mockResolvedValue({
      available: true,
      shouldStop: true,
      dropPercentage: 85,
      networkPacketsOutCurrent: 100,
      networkPacketsOutPeak: 1000,
      networkOutCurrent: 100000,
      networkOutPeak: 1000000,
    });

    const context = createMockContextWithHealthCheck();
    const gitManager = createMockGitManager();

    const summary = await executePhasesFrom('implementation', context, gitManager);

    expect(summary.success).toBe(false);
    expect(summary.stoppedReason).toBe('network_throughput_degraded');
    expect(summary.failedPhase).toBe('implementation');
    expect(createPhaseInstanceMock).not.toHaveBeenCalled();
  });
});
