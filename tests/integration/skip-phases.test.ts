/**
 * インテグレーションテスト: --skip-phases オプション
 *
 * テスト対象:
 * - スキップ指定されたフェーズの非実行
 * - メタデータへの skipped ステータス記録
 * - 依存関係・オプショナルコンテキストとの連携
 * - Evaluation スキップ時の警告出力
 *
 * テスト戦略: UNIT_INTEGRATION
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import type { PhaseName } from '../../src/types.js';
import type { PhaseContext } from '../../src/types/commands.js';
import type { PhaseStatus } from '../../src/types.js';

const mockPhaseRuns = new Map<PhaseName, jest.Mock>();
const mockCreatePhaseInstance = jest.fn();

// createPhaseInstance をモックしてフェーズ実装への依存を排除
jest.unstable_mockModule('../../src/core/phase-factory.js', () => ({
  createPhaseInstance: mockCreatePhaseInstance,
}));

const { MetadataManager } = await import('../../src/core/metadata-manager.js');
const { WorkflowState } = await import('../../src/core/workflow-state.js');
const { logger } = await import('../../src/utils/logger.js');
const { executePhasesSequential } = await import('../../src/commands/execute/workflow-executor.js');
const { validatePhaseDependencies } = await import('../../src/core/phase-dependencies.js');
const { ContextBuilder } = await import('../../src/phases/context/context-builder.js');

const TEMP_ROOT_PREFIX = path.join(os.tmpdir(), 'skip-phases-integration-');

/**
 * テスト用コンテキストを生成
 */
function createTestContext(skipPhases?: PhaseName[]): {
  context: PhaseContext;
  metadataManager: MetadataManager;
  gitManager: any;
} {
  const tempRoot = fs.mkdtempSync(TEMP_ROOT_PREFIX);
  const metadataPath = path.join(tempRoot, 'metadata.json');
  WorkflowState.createNew(
    metadataPath,
    '636',
    'https://example.com/issues/636',
    'Skip phases integration test',
  );
  const metadataManager = new MetadataManager(metadataPath);

  const context: PhaseContext = {
    workingDir: tempRoot,
    metadataManager,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    skipPhases,
  };

  const gitManager = {
    squashCommits: jest.fn(),
  } as any;

  return { context, metadataManager, gitManager };
}

describe('skip-phases 統合動作', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
    jest.clearAllMocks();
    mockPhaseRuns.clear();
    mockCreatePhaseInstance.mockImplementation((phaseName: PhaseName) => {
      const run = jest.fn().mockResolvedValue(true);
      mockPhaseRuns.set(phaseName, run);
      return { run };
    });
  });

  afterEach(async () => {
    // テストで作成した一時ディレクトリを掃除
    await Promise.all(tempDirs.map((dir) => fs.remove(dir)));
  });

  test('IT-001: 単一フェーズスキップ_ワークフロー実行', async () => {
    // Given: documentation をスキップ指定
    const { context, metadataManager, gitManager } = createTestContext(['documentation']);
    tempDirs.push(context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');
    const warnSpy = jest.spyOn(logger, 'warn');

    const phases: PhaseName[] = ['documentation'];

    // When: フェーズを順次実行
    const result = await executePhasesSequential(phases, context, gitManager);

    // Then: documentation はスキップされ、ステータスが記録される
    expect(result.success).toBe(true);
    expect(result.results.documentation?.success).toBe(true);
    expect(metadataManager.getPhaseStatus('documentation')).toBe('skipped');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Phases to skip'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: documentation'));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('IT-002: テスト関連フェーズスキップ_ワークフロー実行', async () => {
    // Given: テスト関連フェーズをまとめてスキップ
    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'test_preparation', 'testing'];
    const { context, metadataManager, gitManager } = createTestContext(skipTargets);
    tempDirs.push(context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');

    const phases: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'test_preparation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    // When: フェーズを順次実行
    const result = await executePhasesSequential(phases, context, gitManager);

    // Then: スキップ対象だけが実行されず、他フェーズは run が呼ばれる
    expect(result.success).toBe(true);
    expect(metadataManager.getPhaseStatus('test_scenario')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('test_implementation')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('test_preparation')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('testing')).toBe('skipped');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('ℹ️  Phases to skip'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: test_scenario'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: test_implementation'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: test_preparation'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: testing'));
    expect(mockPhaseRuns.has('planning')).toBe(true);
    expect(mockPhaseRuns.has('requirements')).toBe(true);
    expect(mockPhaseRuns.has('design')).toBe(true);
    expect(mockPhaseRuns.has('implementation')).toBe(true);
    expect(mockPhaseRuns.has('documentation')).toBe(true);
    expect(mockPhaseRuns.has('report')).toBe(true);
    expect(mockPhaseRuns.has('evaluation')).toBe(true);
    expect(mockPhaseRuns.has('test_scenario')).toBe(false);
    expect(mockPhaseRuns.has('test_implementation')).toBe(false);
    expect(mockPhaseRuns.has('test_preparation')).toBe(false);
    expect(mockPhaseRuns.has('testing')).toBe(false);
  });

  test('IT-003: スキップフェーズ_メタデータ記録', async () => {
    // Given: testing, documentation をスキップ指定
    const { context, metadataManager, gitManager } = createTestContext(['testing', 'documentation']);
    tempDirs.push(context.workingDir);
    const phases: PhaseName[] = ['testing', 'documentation'];

    // When: フェーズを順次実行
    const result = await executePhasesSequential(phases, context, gitManager);
    const metadata = fs.readJsonSync(metadataManager.metadataPath);

    // Then: ステータスが skipped となり、タイムスタンプが記録される
    expect(result.success).toBe(true);
    expect(metadata.phases.testing.status).toBe('skipped');
    expect(metadata.phases.documentation.status).toBe('skipped');
    expect(metadata.phases.testing.completed_at).toBeTruthy();
    expect(metadata.phases.documentation.completed_at).toBeTruthy();
  });

  test('IT-004: 既存メタデータ_整合性維持', async () => {
    // Given: requirements/design は completed、documentation をスキップ
    const { context, metadataManager, gitManager } = createTestContext(['documentation']);
    tempDirs.push(context.workingDir);
    setPhaseStatuses(metadataManager, {
      requirements: 'completed',
      design: 'completed',
    });

    const phases: PhaseName[] = ['requirements', 'design', 'documentation'];

    // When: スキップ付きで実行
    const result = await executePhasesSequential(phases, context, gitManager);

    // Then: 既存 completed は保持され、documentation のみ skipped になる
    expect(result.success).toBe(true);
    expect(metadataManager.getPhaseStatus('requirements')).toBe('completed');
    expect(metadataManager.getPhaseStatus('design')).toBe('completed');
    expect(metadataManager.getPhaseStatus('documentation')).toBe('skipped');
  });

  test('IT-005: Evaluation スキップ時の警告', async () => {
    // Given: evaluation をスキップ指定
    const { context, metadataManager, gitManager } = createTestContext(['evaluation']);
    tempDirs.push(context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');
    const warnSpy = jest.spyOn(logger, 'warn');

    const phases: PhaseName[] = ['evaluation'];

    // When: フェーズを順次実行
    const result = await executePhasesSequential(phases, context, gitManager);

    // Then: 警告ログと skipped ステータスが記録される
    expect(result.success).toBe(true);
    expect(result.results.evaluation?.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '⚠️  WARNING: Skipping Evaluation phase. Follow-up issues will not be generated.',
    );
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped: evaluation'));
    expect(metadataManager.getPhaseStatus('evaluation')).toBe('skipped');
  });

  test('IT-006: 依存関係検証_スキップフェーズ除外', () => {
    // Given: requirements/design は完了、test_scenario をスキップ
    const { context, metadataManager } = createTestContext(['test_scenario']);
    tempDirs.push(context.workingDir);
    setPhaseStatuses(metadataManager, {
      requirements: 'completed',
      design: 'completed',
    });

    // When: implementation の依存関係を検証
    const result = validatePhaseDependencies('implementation', metadataManager, {
      skipPhases: context.skipPhases,
    });

    // Then: test_scenario は依存チェックから除外され、検証成功となる
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length ?? 0).toBe(0);
  });

  test('IT-007: オプショナルコンテキスト_フォールバック', () => {
    // Given: test_scenario の出力が存在しない状態でスキップ指定
    const skipTargets: PhaseName[] = ['test_scenario'];
    const { context, metadataManager } = createTestContext(skipTargets);
    tempDirs.push(context.workingDir);
    const fallbackMessage =
      'テストシナリオは利用できません。実装時に適切なテスト考慮を行ってください。';
    const builder = new ContextBuilder(metadataManager, context.workingDir, () => context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');

    // When: オプショナルコンテキストを構築
    const contextValue = builder.buildOptionalContext(
      'test_scenario',
      'test-scenario.md',
      fallbackMessage,
      metadataManager.data.issue_number,
    );

    // Then: ファイル不在のためフォールバックが返される
    expect(contextValue).toBe(fallbackMessage);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('test_scenario output not found'));
  });
});

/**
 * メタデータのフェーズステータスをまとめて設定
 */
function setPhaseStatuses(
  metadataManager: MetadataManager,
  statuses: Partial<Record<PhaseName, PhaseStatus>>,
): void {
  for (const [phase, status] of Object.entries(statuses)) {
    const phaseName = phase as PhaseName;
    const targetStatus = status as PhaseStatus;
    if (targetStatus === 'completed') {
      // 正常遷移に合わせて in_progress を経由させる
      metadataManager.updatePhaseStatus(phaseName, 'in_progress');
    }
    metadataManager.updatePhaseStatus(phaseName, targetStatus);
  }
  metadataManager.save();
}
