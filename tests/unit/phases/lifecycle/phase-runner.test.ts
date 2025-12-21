/**
 * ユニットテスト: phase-runner.ts
 *
 * テスト対象:
 * - PhaseRunner.run()
 * - PhaseRunner.validateDependencies()
 * - PhaseRunner.handleFailure()
 * - PhaseRunner.postProgress()
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */

// validatePhaseDependencies のモックを先に定義
const mockValidatePhaseDependencies = jest.fn<any>();

// jest.mock() でモジュールを置き換え（importより前に実行される）
jest.mock('../../../../src/core/phase-dependencies.js', () => ({
  validatePhaseDependencies: mockValidatePhaseDependencies,
}));

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import { PhaseRunner } from '../../../../src/phases/lifecycle/phase-runner.js';
import { PhaseName, PhaseStatus, PhaseExecutionResult } from '../../../../src/types.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'phase-runner-test');

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(): any {
  return {
    data: {
      issue_number: '1',
      phases: {
        planning: { status: 'completed' },
        requirements: { status: 'completed' },
        design: { status: 'pending' },
        test_scenario: { status: 'pending' },
        implementation: { status: 'pending' },
        test_implementation: { status: 'pending' },
        testing: { status: 'pending' },
        documentation: { status: 'pending' },
        report: { status: 'pending' },
        evaluation: { status: 'pending' }
      }
    },
    updatePhaseStatus: jest.fn<any>(),
    getPhaseStatus: jest.fn<any>((phaseName: string) => {
      const phases: any = {
        planning: 'completed',
        requirements: 'completed',
        design: 'pending',
        test_scenario: 'pending',
        implementation: 'pending',
        test_implementation: 'pending',
        testing: 'pending',
        documentation: 'pending',
        report: 'pending',
        evaluation: 'pending'
      };
      return phases[phaseName] ?? 'pending';
    }),
    getAllPhasesStatus: jest.fn<any>().mockReturnValue({
      planning: 'completed',
      requirements: 'completed',
      design: 'pending',
      test_scenario: 'pending',
      implementation: 'pending',
      test_implementation: 'pending',
      testing: 'pending',
      documentation: 'pending',
      report: 'pending',
      evaluation: 'pending'
    }),
    getCurrentStep: jest.fn<any>(() => null),
    getCompletedSteps: jest.fn<any>(() => []),
  };
}

/**
 * モック GitHubClient を作成
 */
function createMockGitHubClient(): any {
  return {
    createOrUpdateProgressComment: jest.fn<any>().mockResolvedValue(undefined),
  };
}

/**
 * モック StepExecutor を作成
 */
function createMockStepExecutor(
  executeResult: PhaseExecutionResult = { success: true },
  reviewResult: PhaseExecutionResult = { success: true }
): any {
  return {
    executeStep: jest.fn<any>().mockResolvedValue(executeResult),
    reviewStep: jest.fn<any>().mockResolvedValue(reviewResult),
    reviseStep: jest.fn<any>().mockResolvedValue(undefined),
  };
}

describe('PhaseRunner - run() 正常系（全ステップ成功）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-phase-runner');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-PR-01: run() - 全ステップが正常に実行され、ステータスが completed に更新される', async () => {
    // Given: 依存関係検証が成功、全ステップが成功
    mockValidatePhaseDependencies.mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

    const mockMetadata = createMockMetadataManager();
    // design フェーズの依存関係 (requirements) を完了済みに設定
    mockMetadata.getPhaseStatus = jest.fn<any>((phaseName: string) => {
      if (phaseName === 'requirements') return 'completed';
      return 'pending';
    });
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });

    const phaseRunner = new PhaseRunner(
      'design',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      false, // skipDependencyCheck
      false, // ignoreDependencies
      undefined, // presetPhases
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: 全ステップが実行され、ステータスが completed に更新される
    expect(result).toBe(true);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'in_progress', {});
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalledTimes(2); // 開始時、完了時
    expect(mockStepExecutor.executeStep).toHaveBeenCalledTimes(1);
    expect(mockStepExecutor.reviewStep).toHaveBeenCalledTimes(1);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'completed', {});
  });

  test('UC-PR-02: run() - レビュー失敗時に revise ステップが実行される', async () => {
    // Given: review が失敗する（approved=false）
    mockValidatePhaseDependencies.mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor(
      { success: true }, // execute は成功
      { success: false, approved: false, feedback: 'Needs revision' } // review は失敗
    );
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });

    const phaseRunner = new PhaseRunner(
      'implementation',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: revise ステップが実行される
    expect(result).toBe(true);
    expect(mockStepExecutor.executeStep).toHaveBeenCalledTimes(1);
    expect(mockStepExecutor.reviewStep).toHaveBeenCalledTimes(1);
    expect(mockStepExecutor.reviseStep).toHaveBeenCalledTimes(1);
    expect(mockStepExecutor.reviseStep).toHaveBeenCalledWith(
      null, // gitManager
      { success: false, approved: false, feedback: 'Needs revision' }, // initialReviewResult
      reviseFn,
      expect.any(Function) // postProgressFn
    );
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('implementation', 'completed', {});
  });
});

describe('PhaseRunner - validateDependencies() 依存関係検証', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-dependencies');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-PR-03: validateDependencies() - 依存関係違反時のエラー', async () => {
    // Given: 依存関係違反がある
    const mockMetadata = createMockMetadataManager();
    // requirements フェーズを未完了に設定（design の依存関係違反）
    mockMetadata.getPhaseStatus = jest.fn<any>((phaseName: string) => {
      if (phaseName === 'requirements') return 'pending'; // 未完了
      return 'pending';
    });
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'design',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      false, // skipDependencyCheck
      false, // ignoreDependencies
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: 依存関係違反が検出され、フェーズが失敗する
    expect(result).toBe(false);
    expect(mockStepExecutor.executeStep).not.toHaveBeenCalled(); // execute は実行されない
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'failed', {});
  });

  test('UC-PR-04: validateDependencies() - 警告がある場合（継続）', async () => {
    // Given: 依存関係に警告がある
    const mockMetadata = createMockMetadataManager();
    // planning フェーズを完了済みに設定（requirements の依存関係を満たす）
    mockMetadata.getPhaseStatus = jest.fn<any>((phaseName: string) => {
      if (phaseName === 'planning') return 'completed';
      return 'pending';
    });
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'requirements',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      false,
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: 警告ログが出力され、フェーズが継続される
    expect(result).toBe(true);
    expect(mockStepExecutor.executeStep).toHaveBeenCalledTimes(1); // execute が実行される
  });

  test('UC-PR-05: validateDependencies() - skipDependencyCheck フラグ', async () => {
    // Given: skipDependencyCheck=true
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'test_scenario',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: 依存関係検証がスキップされ、フェーズが実行される
    expect(result).toBe(true);
    expect(mockStepExecutor.executeStep).toHaveBeenCalledTimes(1); // execute が実行される
  });
});

describe('PhaseRunner - handleFailure() フェーズ失敗時の処理', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-failure');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-PR-06: handleFailure() - フェーズ失敗時にステータスが failed に更新される', async () => {
    // Given: execute ステップが失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor(
      { success: false, error: 'Execute step failed: some error' }
    );
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'testing',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: ステータスが failed に更新され、GitHub Issue に失敗コメントが投稿される
    expect(result).toBe(false);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('testing', 'failed', {});
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalled(); // 失敗コメント投稿
  });
});

describe('PhaseRunner - postProgress() 進捗投稿', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-progress');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-PR-07: postProgress() - GitHub Issue への進捗投稿', async () => {
    // Given: フェーズが正常に実行される
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'documentation',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: GitHub Issue に進捗コメントが投稿される（開始時、完了時）
    expect(result).toBe(true);
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalledTimes(2);
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalledWith(
      1, // issue_number
      expect.stringContaining('documentation'), // コメント内容
      mockMetadata
    );
  });

  test('UC-PR-07-2: postProgress() - issue_number が NaN の場合、投稿しない', async () => {
    // Given: issue_number が不正
    const mockMetadata = createMockMetadataManager();
    mockMetadata.data.issue_number = 'invalid'; // 不正な issue_number
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'report',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: GitHub Issue への投稿はスキップされる
    expect(result).toBe(true);
    expect(mockGitHub.createOrUpdateProgressComment).not.toHaveBeenCalled();
  });
});

describe('PhaseRunner - エラーハンドリング', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-errors');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-PR-08: run() - revise メソッドが未実装の場合、エラーが返される', async () => {
    // Given: revise メソッドが null、review が失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor(
      { success: true },
      { success: false, approved: false, feedback: 'Needs revision' }
    );

    const phaseRunner = new PhaseRunner(
      'evaluation',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      null // reviseFn が null
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: フェーズが失敗する
    expect(result).toBe(false);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('evaluation', 'failed', {});
  });

  test('UC-PR-09: run() - 例外がスローされた場合、handleFailure() が呼び出される', async () => {
    // Given: execute ステップで例外がスローされる
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    mockStepExecutor.executeStep.mockRejectedValue(new Error('Network error'));
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'planning',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck = true に変更
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: handleFailure() が呼び出され、フェーズが失敗する
    expect(result).toBe(false);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('planning', 'failed', {});
  });
});

// =============================================================================
// Issue #248: preset実行時のフェーズステータス更新
// =============================================================================
describe('PhaseRunner - Issue #248: フェーズステータス更新の確実性', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-248');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('Issue #248-1: finalizePhase() が正常に呼ばれ、ステータスが completed になる', async () => {
    // Given: フェーズが正常に実行される
    mockValidatePhaseDependencies.mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'design',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: ステータスが completed に更新される
    expect(result).toBe(true);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'completed', {});
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalled();
  });

  test('Issue #248-2: handleFailure() が正常に呼ばれ、ステータスが failed になる', async () => {
    // Given: execute ステップが失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor(
      { success: false, error: 'Execute failed' }
    );
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'design',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: ステータスが failed に更新される
    expect(result).toBe(false);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'failed', {});
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalled();
  });

  test('Issue #248-3: 進捗投稿失敗時もステータス更新は成功する', async () => {
    // Given: 進捗投稿が失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    mockGitHub.createOrUpdateProgressComment.mockRejectedValue(new Error('Network error'));
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'design',
      mockMetadata,
      mockGitHub,
      mockStepExecutor,
      true, // skipDependencyCheck
      false,
      undefined,
      reviseFn
    );

    // When: run() を呼び出す
    const result = await phaseRunner.run({ skipReview: false });

    // Then: 進捗投稿は失敗するが、ステータス更新は成功する
    expect(result).toBe(true);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'completed', {});
  });
});
