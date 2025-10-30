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

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'step-executor-test');

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(): any {
  const completedSteps: string[] = [];
  return {
    data: {
      issue_number: '1',
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
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1);
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

    // Then: エラーが返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Execute failed');
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled(); // Git コミットは実行されない
    expect(mockGitManager.pushToRemote).not.toHaveBeenCalled();
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
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1);
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
    expect(mockGitManager.commitStepOutput).not.toHaveBeenCalled(); // Git コミットは実行されない
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
      expect.any(Function) // commitAndPushStep のコールバック
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
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledTimes(1);
    expect(mockGitManager.commitStepOutput).toHaveBeenCalledWith(
      'planning',
      0, // フェーズ番号（planning=0）
      'execute',
      1, // issue_number
      '/path/to/repo'
    );
    expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(1);
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

    // Then: エラーが返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Git commit failed');
    expect(mockGitManager.pushToRemote).not.toHaveBeenCalled(); // プッシュは実行されない
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

    // Then: エラーが返される
    expect(result.success).toBe(false);
    expect(result.error).toContain('Git push failed');
    // プッシュ失敗時、current_step が 'execute' に維持される
    expect(mockMetadata.updateCurrentStep).toHaveBeenCalledWith('design', 'execute');
  });
});
