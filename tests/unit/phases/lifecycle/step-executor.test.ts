/**
 * ユニットテスト: step-executor.ts
 *
 * テスト対象:
 * - StepExecutor.executeStep()
 * - StepExecutor.reviewStep()
 * - StepExecutor.reviseStep()
 * - completed_steps 管理
 * - Git コミット＆プッシュ
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { StepExecutor } from '../../../../src/phases/lifecycle/step-executor.js';
import { PhaseName, PhaseExecutionResult } from '../../../../src/types.js';

jest.setTimeout(60000);

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'step-executor-test');

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(issueNumber: string = '1'): any {
  const completedSteps: string[] = [];
  return {
    data: {
      issue_number: issueNumber,
      target_repository: {
        path: '/path/to/repo'
      }
    },
    getCompletedSteps: jest.fn<any>().mockReturnValue(completedSteps),
    addCompletedStep: jest.fn<any>().mockImplementation((phase: PhaseName, step: string) => {
      completedSteps.push(step);
    }),
    updateCurrentStep: jest.fn<any>(),
    _completedSteps: completedSteps,
  };
}

/**
 * モック GitManager を作成
 */
function createMockGitManager(): any {
  return {
    commitStepStart: jest.fn<any>().mockResolvedValue({ success: true }),
    commitStepOutput: jest.fn<any>().mockResolvedValue({ success: true }),
    pushToRemote: jest.fn<any>().mockResolvedValue({ success: true }),
  };
}

/**
 * モック ReviewCycleManager を作成
 */
function createMockReviewCycleManager(): any {
  return {
    performReviseStepWithRetry: jest.fn<any>().mockResolvedValue(undefined),
  };
}

describe('StepExecutor - executeStep() 正常系', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-step-executor');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-SE-01: executeStep() が正常に実行され、completed_steps に "execute" が追加される', async () => {
    // Given: StepExecutor インスタンス、execute が未完了
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'planning',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: execute が実行され、completed_steps に追加される
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('planning', 'execute');
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('planning', 'execute'); // 実行中
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('planning', null); // 完了後
  });

  test('UC-SE-02: executeStep() - 既に execute が完了している場合（スキップ）', async () => {
    // Given: execute が既に完了している
    const mockMetadata = createMockMetadataManager();
    mockMetadata._completedSteps.push('execute'); // execute 完了済み
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'planning',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: スキップされ、execute は呼び出されない
    expect(result.success).toBe(true);
    expect(executeFn).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepStart).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled();
    expect(mockGitManager.pushToRemote).not.toHaveBeenCalled();
  });

  test('UC-SE-03: executeStep() - execute 失敗時のエラーハンドリング', async () => {
    // Given: execute が失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Execute failed: some error' });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'requirements',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: { success: false, error } が返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Execute failed');
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1); // 開始時のみ
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled(); // Git コミットは実行されない
  });
});

describe('StepExecutor - reviewStep() 正常系', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-review-step');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-SE-04: reviewStep() が正常に実行され、completed_steps に "review" が追加される', async () => {
    // Given: review が未完了、skipReview=false
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true, approved: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'design',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す（skipReview=false）
    const result = await stepExecutor.reviewStep(mockGitManager, false);

    // Then: review が実行され、completed_steps に追加される
    expect(result.success).toBe(true);
    expect(shouldRunReviewFn).toHaveBeenCalledTimes(1);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('design', 'review');
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('design', 'review'); // 実行中
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('design', null); // 完了後
  });

  test('UC-SE-05: reviewStep() - skipReview が true の場合（スキップ）', async () => {
    // Given: skipReview=true
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す（skipReview=true）
    const result = await stepExecutor.reviewStep(mockGitManager, true);

    // Then: スキップされ、review は呼び出されない
    expect(result.success).toBe(true);
    expect(shouldRunReviewFn).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepStart).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled();
    expect(mockGitManager.pushToRemote).not.toHaveBeenCalled();
  });

  test('UC-SE-06: reviewStep() - レビュー失敗時（revise が必要）', async () => {
    // Given: review が失敗する（approved=false）
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({
      success: false,
      approved: false,
      feedback: 'Needs revision: XYZ issue found'
    });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'test_scenario',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す
    const result = await stepExecutor.reviewStep(mockGitManager, false);

    // Then: review が失敗し、エラーが返される
    expect(result.success).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.feedback).toContain('Needs revision');
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled(); // Git コミットは実行されない
  });
});

describe('StepExecutor - 開始時コミット＆プッシュ（Issue #720）', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-step-start-commit');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('TC-720-SE-01: executeStep() 開始時にコミット＆プッシュが実行される', async () => {
    // Given: execute ステップ開始時にコミットする
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: 開始時コミットとプッシュが実行される
    expect(result.success).toBe(true);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledWith('implementation', 4, 'execute', 123);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
  });

  test('TC-720-SE-02: reviewStep() 開始時にコミット＆プッシュが実行される', async () => {
    // Given: review ステップ開始時にコミットする
    const mockMetadata = createMockMetadataManager('456');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true, approved: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'design',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す
    const result = await stepExecutor.reviewStep(mockGitManager, false);

    // Then: 開始時コミットとプッシュが実行される
    expect(result.success).toBe(true);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepStart).toHaveBeenCalledWith('design', 2, 'review', 456);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
  });

  test('TC-720-SE-03: 開始時コミット失敗時にワークフローが継続する', async () => {
    // Given: 開始時コミットが失敗する
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    mockGitManager.commitStepStart.mockResolvedValue({ success: false, error: 'Commit failed' });
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: executeFn が実行され、ワークフローが継続する
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1);
  });

  test('TC-720-SE-04: 開始時プッシュ失敗時にワークフローが継続する', async () => {
    // Given: 開始時のプッシュが失敗する
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    mockGitManager.pushToRemote
      .mockResolvedValueOnce({ success: false, error: 'Push failed' })
      .mockResolvedValueOnce({ success: true });
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: ワークフローが継続する
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
  });

  test('TC-720-SE-05: gitManager が null の場合に開始時コミットがスキップされる', async () => {
    // Given: gitManager が null
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(null);

    // Then: 開始時コミットは呼ばれず、execute は実行される
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepStart).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled();
    expect(mockGitManager.pushToRemote).not.toHaveBeenCalled();
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('implementation', 'execute');
  });

  test('TC-720-SE-06: 開始時コミットの呼び出し順序が正しい', async () => {
    // Given: 呼び出し順序を検証する
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    await stepExecutor.executeStep(mockGitManager);

    // Then: updateCurrentStep → commitStepStart → executeFn → commitStepOutput の順で呼ばれる
    const updateOrder = mockMetadata.updateCurrentStep.mock.invocationCallOrder[0];
    const startCommitOrder = mockGitManager.commitStepStart.mock.invocationCallOrder[0];
    const executeOrder = executeFn.mock.invocationCallOrder[0];
    const completeCommitOrder = mockGitManager.commitStepOutput.mock.invocationCallOrder[0];

    expect(updateOrder).toBeLessThan(startCommitOrder);
    expect(startCommitOrder).toBeLessThan(executeOrder);
    expect(executeOrder).toBeLessThan(completeCommitOrder);
  });

  test('TC-720-SE-07: reviseStep() 委譲時に開始時コミットコールバックが渡される', async () => {
    // Given: ReviewCycleManager がモック化されている
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'testing',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    const initialReviewResult: PhaseExecutionResult = {
      success: false,
      approved: false,
      feedback: 'Needs revision'
    };

    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: reviseStep() を呼び出す
    await stepExecutor.reviseStep(
      mockGitManager,
      initialReviewResult,
      reviseFn,
      postProgressFn
    );

    // Then: ReviewCycleManager.performReviseStepWithRetry() に開始時コミット関数が渡される
    expect(mockReviewCycleManager.performReviseStepWithRetry).toHaveBeenCalledTimes(1);
    expect(mockReviewCycleManager.performReviseStepWithRetry).toHaveBeenCalledWith(
      mockGitManager,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      expect.any(Function),
      expect.any(Function)
    );
  });

  test('TC-720-SE-08: 開始時コミットで例外がスローされてもワークフローが継続する', async () => {
    // Given: commitStepStart が例外をスローする
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    mockGitManager.commitStepStart.mockRejectedValue(new Error('Unexpected error'));
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: executeFn が実行され、ワークフローが継続する
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
  });

  test('TC-720-SE-09: reviewStep() で開始時コミット失敗時もレビュー処理が継続する', async () => {
    // Given: commitStepStart が失敗する
    const mockMetadata = createMockMetadataManager('456');
    const mockGitManager = createMockGitManager();
    mockGitManager.commitStepStart.mockResolvedValue({ success: false, error: 'Commit failed' });
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true, approved: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'design',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す
    const result = await stepExecutor.reviewStep(mockGitManager, false);

    // Then: reviewFn が実行され、完了処理も続行する
    expect(result.success).toBe(true);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('design', 'review');
  });

  test('TC-720-SE-10: executeStep() スキップ時は開始時コミットも実行されない', async () => {
    // Given: execute が既に完了している
    const mockMetadata = createMockMetadataManager('123');
    mockMetadata._completedSteps.push('execute');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: 開始時コミットは実行されずスキップされる
    expect(result.success).toBe(true);
    expect(mockGitManager.commitStepStart).not.toHaveBeenCalled();
    expect(executeFn).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled();
  });

  test('TC-720-SE-11: reviewStep() skipReview=true の場合は開始時コミットも実行されない', async () => {
    // Given: skipReview=true
    const mockMetadata = createMockMetadataManager('123');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'implementation',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: reviewStep() を呼び出す（skipReview=true）
    const result = await stepExecutor.reviewStep(mockGitManager, true);

    // Then: 開始時コミットは実行されずスキップされる
    expect(result.success).toBe(true);
    expect(mockGitManager.commitStepStart).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled();
  });

  test('TC-720-SE-12: 既存の完了時コミット処理が変更されていない', async () => {
    // Given: 完了時コミットが成功する
    const mockMetadata = createMockMetadataManager('1');
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'planning',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: 完了時コミットが実行される
    expect(result.success).toBe(true);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledWith(
      'planning',
      0,
      'execute',
      1,
      '/path/to/repo'
    );
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('planning', 'execute');
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('planning', null);
  });
});

describe('StepExecutor - reviseStep() ReviewCycleManager への委譲', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-revise-step');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-SE-07: reviseStep() が ReviewCycleManager に正しく委譲される', async () => {
    // Given: ReviewCycleManager がモック化されている
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'testing',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    const initialReviewResult: PhaseExecutionResult = {
      success: false,
      approved: false,
      feedback: 'Needs revision'
    };

    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: reviseStep() を呼び出す
    await stepExecutor.reviseStep(
      mockGitManager,
      initialReviewResult,
      reviseFn,
      postProgressFn
    );

    // Then: ReviewCycleManager.performReviseStepWithRetry() が呼び出される
    expect(mockReviewCycleManager.performReviseStepWithRetry).toHaveBeenCalledTimes(1);
    expect(mockReviewCycleManager.performReviseStepWithRetry).toHaveBeenCalledWith(
      mockGitManager,
      initialReviewResult,
      reviewFn, // reviewFn が渡される
      reviseFn,
      postProgressFn,
      expect.any(Function), // commitAndPushStep のコールバック
      expect.any(Function) // commitAndPushStepStart のコールバック
    );
  });
});

describe('StepExecutor - commitAndPushStep() Git コミット＆プッシュ', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-git-commit');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('UC-SE-08: commitAndPushStep() - Git コミット＆プッシュ成功', async () => {
    // Given: GitManager がモック化されている
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'planning',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す（内部で commitAndPushStep が実行される）
    await stepExecutor.executeStep(mockGitManager);

    // Then: Git コミット＆プッシュが実行される
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledWith(
      'planning',
      0, // フェーズ番号（planning=0）
      'execute',
      1, // issue_number
      '/path/to/repo'
    );
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledWith(3); // 最大3回リトライ
  });

  test('UC-SE-09: commitAndPushStep() - Git コミット失敗時のエラーハンドリング', async () => {
    // Given: Git コミットが失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    mockGitManager.commitStepOutput.mockResolvedValue({ success: false, error: 'Commit failed' });
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'requirements',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: { success: false, error } が返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Git commit failed');
    expect(mockGitManager.commitStepStart).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1); // 開始時のみ
  });

  test('UC-SE-09-2: commitAndPushStep() - Git プッシュ失敗時のエラーハンドリング', async () => {
    // Given: Git プッシュが失敗する
    const mockMetadata = createMockMetadataManager();
    const mockGitManager = createMockGitManager();
    mockGitManager.pushToRemote.mockResolvedValue({ success: false, error: 'Push failed' });
    const mockReviewCycleManager = createMockReviewCycleManager();
    const executeFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const shouldRunReviewFn = jest.fn<any>().mockResolvedValue(true);

    const stepExecutor = new StepExecutor(
      'design',
      mockMetadata,
      mockReviewCycleManager,
      executeFn,
      reviewFn,
      shouldRunReviewFn
    );

    // When: executeStep() を呼び出す
    const result = await stepExecutor.executeStep(mockGitManager);

    // Then: { success: false, error } が返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Git push failed');
    // プッシュ失敗時、current_step が 'execute' に維持される
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('design', 'execute');
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
  });
});
