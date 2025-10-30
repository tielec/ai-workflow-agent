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

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { PhaseRunner } from '../../../../src/phases/lifecycle/phase-runner.js';
import { PhaseName, PhaseStatus, PhaseExecutionResult } from '../../../../src/types.js';
import { logger } from '../../../../src/utils/logger.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'phase-runner-test');

// validatePhaseDependencies のモック
jest.mock('../../../../src/core/phase-dependencies.js', () => ({
  validatePhaseDependencies: jest.fn<any>()
}));

import { validatePhaseDependencies } from '../../../../src/core/phase-dependencies.js';

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(): any {
  return {
    data: {
      issue_number: '1',
      planning: { status: 'completed' },
      requirements: { status: 'completed' }
    },
    updatePhaseStatus: jest.fn<any>(),
    getAllPhasesStatus: jest.fn<any>().mockReturnValue([]),
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });

    const loggerInfoSpy = jest.spyOn(logger, 'info');

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
    expect(validatePhaseDependencies).toHaveBeenCalledTimes(1);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'in_progress', {});
    expect(mockGitHub.createOrUpdateProgressComment).toHaveBeenCalledTimes(2); // 開始時、完了時
    expect(mockStepExecutor.executeStep).toHaveBeenCalledTimes(1);
    expect(mockStepExecutor.reviewStep).toHaveBeenCalledTimes(1);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('design', 'completed', {});
    expect(loggerInfoSpy).toHaveBeenCalled();
    loggerInfoSpy.mockRestore();
  });

  test('UC-PR-02: run() - レビュー失敗時に revise ステップが実行される', async () => {
    // Given: review が失敗する（approved=false）
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
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

    const loggerInfoSpy = jest.spyOn(logger, 'info');

    const phaseRunner = new PhaseRunner(
      'implementation',
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
    expect(loggerInfoSpy).toHaveBeenCalled();
    loggerInfoSpy.mockRestore();
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: false,
      violations: ['Requirements phase is not completed'],
      warnings: [],
      error: 'Dependency validation failed.'
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: [],
      warning: 'Planning phase output may be incomplete'
    }));

    const mockMetadata = createMockMetadataManager();
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
    expect(validatePhaseDependencies).toHaveBeenCalledWith('test_scenario', mockMetadata, {
      skipCheck: true,
      ignoreViolations: false,
      presetPhases: undefined
    });
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

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
      false,
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

    const mockMetadata = createMockMetadataManager();
    const mockGitHub = createMockGitHubClient();
    const mockStepExecutor = createMockStepExecutor();
    const reviseFn = jest.fn<any>();

    const phaseRunner = new PhaseRunner(
      'documentation',
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

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
      false,
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

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
      false,
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
    (validatePhaseDependencies as jest.Mock).mockImplementation(() => ({
      valid: true,
      violations: [],
      warnings: []
    }));

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
      false,
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
