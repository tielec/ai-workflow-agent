/**
 * ユニットテスト: review-cycle-manager.ts
 *
 * テスト対象:
 * - ReviewCycleManager.performReviseStepWithRetry()
 * - レビューサイクルリトライ処理
 * - 最大リトライ到達時の例外スロー
 * - completed_steps 管理
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { ReviewCycleManager } from '../../../../src/phases/core/review-cycle-manager.js';
import { PhaseName, PhaseExecutionResult, PhaseStatus, WorkflowMetadata, StepName } from '../../../../src/types.js';

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(completedSteps: StepName[] = [], retryCount = 0): any {
  const phaseName: PhaseName = 'requirements';
  const metadata: WorkflowMetadata = {
    issue_number: '999',
    issue_url: 'https://github.com/test/repo/issues/999',
    issue_title: 'Test Issue',
    workflow_version: '0.3.0',
    current_phase: 'requirements',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    phases: {
      planning: { status: 'completed', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      requirements: { status: 'in_progress', started_at: null, completed_at: null, retry_count: retryCount, review_result: null, output_files: [], completed_steps: [...completedSteps], current_step: null },
      design: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      test_scenario: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      implementation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      test_implementation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      testing: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      documentation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      report: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
      evaluation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null, decision: null, failed_phase: null, remaining_tasks: [], created_issue_url: null, abort_reason: null },
    },
    cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
    design_decisions: { implementation_strategy: null, test_strategy: null, test_code_strategy: null },
  };

  let currentRetryCount = retryCount;

  return {
    data: metadata,
    getCompletedSteps: jest.fn<any>((phase: PhaseName) => metadata.phases[phase]?.completed_steps ?? []),
    addCompletedStep: jest.fn<any>((phase: PhaseName, step: string) => {
      const stepName = step as StepName;
      if (metadata.phases[phase] && !metadata.phases[phase]?.completed_steps?.includes(stepName)) {
        metadata.phases[phase]?.completed_steps?.push(stepName);
      }
    }),
    updateCurrentStep: jest.fn<any>((phase: PhaseName, step: string | null) => {
      const stepName = step as StepName | null;
      if (metadata.phases[phase]) {
        metadata.phases[phase]!.current_step = stepName;
      }
    }),
    incrementRetryCount: jest.fn<any>((phase: PhaseName) => {
      currentRetryCount++;
      metadata.phases[phase].retry_count = currentRetryCount;
      return currentRetryCount;
    }),
    // Issue #90: rollback関連メソッドを追加
    getRollbackContext: jest.fn<any>((phase: PhaseName) => null),
    clearRollbackContext: jest.fn<any>((phase: PhaseName) => undefined),
    updatePhaseStatus: jest.fn<any>((phase: PhaseName, status: PhaseStatus) => {
      if (metadata.phases[phase]) {
        metadata.phases[phase].status = status;
      }
    }),
  };
}

/**
 * モック MetadataManager を作成（updatePhaseStatus を上書き）
 */
function createMockMetadataManagerWithStatusUpdate(completedSteps: StepName[] = [], retryCount = 0): any {
  const baseMock = createMockMetadataManager(completedSteps, retryCount);
  return {
    ...baseMock,
    updatePhaseStatus: jest.fn<any>(),
  };
}

describe('ReviewCycleManager - 基本的なレビューサイクル', () => {
  test('1-1: 1回目のreviseで成功した場合、リトライせずに終了', async () => {
    // Given: revise成功、review成功
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Missing documentation' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise→review が1回ずつ実行される
    expect(reviseFn).toHaveBeenCalledTimes(1);
    expect(reviseFn).toHaveBeenCalledWith('Missing documentation');
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(commitAndPushStepFn).toHaveBeenCalledTimes(2);
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(1, 'revise');
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(2, 'review');
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'revise');
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'review');
  });

  test('1-2: 2回目のreviseで成功した場合、2回リトライ', async () => {
    // Given: 1回目のreview失敗、2回目のreview成功
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false, error: 'Still issues' })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise→review が2回実行される
    expect(reviseFn).toHaveBeenCalledTimes(2);
    expect(reviewFn).toHaveBeenCalledTimes(2);
    expect(commitAndPushStepFn).toHaveBeenCalledTimes(3); // revise×2 + review×1
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(1, 'revise');
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(2, 'revise');
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(3, 'review');
  });

  test('1-3: 3回目のreviseで成功した場合、3回リトライ', async () => {
    // Given: 1回目・2回目のreview失敗、3回目のreview成功
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false, error: 'Still issues' })
      .mockResolvedValueOnce({ success: false, error: 'Still issues' })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise→review が3回実行される
    expect(reviseFn).toHaveBeenCalledTimes(3);
    expect(reviewFn).toHaveBeenCalledTimes(3);
    expect(commitAndPushStepFn).toHaveBeenCalledTimes(4); // revise×3 + review×1
  });
});

describe('ReviewCycleManager - 最大リトライ到達', () => {
  test('2-1: 3回すべて失敗した場合、例外がスローされる', async () => {
    // Given: すべてのreviewが失敗
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Still issues' });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Review failed after 3 revise attempts');

    // Then: revise→review が3回実行される
    expect(reviseFn).toHaveBeenCalledTimes(3);
    expect(reviewFn).toHaveBeenCalledTimes(3);
  });

  test('2-2: revise自体が失敗した場合、例外がスローされる', async () => {
    // Given: reviseが失敗
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: false });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Revise failed' });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Revise failed');

    // Then: reviseが1回実行され、reviewは実行されない
    expect(reviseFn).toHaveBeenCalledTimes(1);
    expect(reviewFn).not.toHaveBeenCalled();
  });
});

describe('ReviewCycleManager - completed_steps 管理', () => {
  test('3-1: reviseステップが既に完了している場合、スキップされる', async () => {
    // Given: reviseステップが既に完了
    const mockMetadata = createMockMetadataManager(['execute', 'revise', 'review']);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: reviseもreviewも実行されない
    expect(reviseFn).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();
  });

  test('3-2: reviseステップが完了後、completed_stepsに追加される', async () => {
    // Given: reviseステップが未完了
    const mockMetadata = createMockMetadataManager(['execute']);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise と review が completed_steps に追加される
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'revise');
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'review');
  });

  test('3-3: review失敗時、reviseがcompleted_stepsから削除される', async () => {
    // Given: 1回目のreview失敗
    const mockMetadata = createMockMetadataManager(['execute']);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false, error: 'Still issues' })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: 2回目の試行時に revise が completed_steps から削除されている
    // mockMetadata.data.phases.requirements.completed_steps に revise が含まれていない状態で再実行
    expect(reviseFn).toHaveBeenCalledTimes(2);
  });
});

describe('ReviewCycleManager - リトライカウント管理', () => {
  test('4-1: リトライカウントが正しく更新される', async () => {
    // Given: リトライカウント0
    const mockMetadata = createMockMetadataManager([], 0);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: リトライカウントが1に更新される
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledWith('requirements');
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledTimes(1);
  });

  test('4-2: 複数回リトライ時、リトライカウントが正しく更新される', async () => {
    // Given: 2回リトライ
    const mockMetadata = createMockMetadataManager([], 0);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false, error: 'Still issues' })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: リトライカウントが2回更新される
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledTimes(2);
  });
});

describe('ReviewCycleManager - 進捗投稿', () => {
  test('5-1: 進捗投稿が正しく呼び出される', async () => {
    // Given: 正常系
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: 進捗投稿が呼び出される
    expect(postProgressFn).toHaveBeenCalledWith(
      'in_progress',
      expect.stringContaining('レビュー不合格のため修正を実施します')
    );
  });

  test('5-2: リトライ回数が進捗メッセージに含まれる', async () => {
    // Given: 2回リトライ
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: 1回目、2回目のメッセージが含まれる
    expect(postProgressFn).toHaveBeenNthCalledWith(
      1,
      'in_progress',
      expect.stringContaining('1/3回目')
    );
    expect(postProgressFn).toHaveBeenNthCalledWith(
      2,
      'in_progress',
      expect.stringContaining('2/3回目')
    );
  });
});

describe('ReviewCycleManager - Git コミット＆プッシュ', () => {
  test('6-1: revise後とreview後にコミット＆プッシュが実行される', async () => {
    // Given: 正常系
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise後、review後にコミット＆プッシュ
    expect(commitAndPushStepFn).toHaveBeenCalledWith('revise');
    expect(commitAndPushStepFn).toHaveBeenCalledWith('review');
  });

  test('6-2: 複数回リトライ時、revise後に毎回コミット＆プッシュが実行される', async () => {
    // Given: 2回リトライ
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: revise×2、review×1
    expect(commitAndPushStepFn).toHaveBeenCalledTimes(3);
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(1, 'revise');
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(2, 'revise');
    expect(commitAndPushStepFn).toHaveBeenNthCalledWith(3, 'review');
  });
});

describe('ReviewCycleManager - フィードバック伝達', () => {
  test('7-1: initialReviewResultのerrorがreviseFnに渡される', async () => {
    // Given: initialReviewResultにerrorあり
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Specific feedback message' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: reviseFnにfeedbackが渡される
    expect(reviseFn).toHaveBeenCalledWith('Specific feedback message');
  });

  test('7-2: initialReviewResultのerrorがnullの場合、デフォルトメッセージが渡される', async () => {
    // Given: initialReviewResultにerrorなし
    const mockMetadata = createMockMetadataManager();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: null };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: performReviseStepWithRetry を呼び出し
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: デフォルトメッセージが渡される
    expect(reviseFn).toHaveBeenCalledWith('レビューで不合格となりました。');
  });
});

describe('ReviewCycleManager - Issue #697: レジューム時のリトライ上限処理', () => {
  test('#697-1: retry_countが既に上限（3）の場合、即座にfailedステータスに更新して例外をスロー', async () => {
    // Given: retry_count を 3 に設定（上限到達済み）
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>();
    const reviseFn = jest.fn<any>();
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow(/retry count already at maximum/);

    // Then: ステータスが failed に更新される
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');

    // Then: reviseFn と reviewFn は呼ばれない
    expect(reviseFn).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();

    // Then: incrementRetryCount は呼ばれない
    expect(mockMetadata.incrementRetryCount).not.toHaveBeenCalled();

    // Then: postProgressFn に 'failed' が渡される
    expect(postProgressFn).toHaveBeenCalledWith(
      'failed',
      expect.stringContaining('最大リトライ回数')
    );

    // Then: コミット＆プッシュは実行されない
    expect(commitAndPushStepFn).not.toHaveBeenCalled();
  });

  test('#697-2: updatePhaseStatusがpostProgressFnより先に呼ばれる', async () => {
    // Given: retry_count=3、呼び出し順序を記録
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };

    // When/Then
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        jest.fn<any>(),
        jest.fn<any>(),
        postProgressFn,
        jest.fn<any>().mockResolvedValue(undefined),
      )
    ).rejects.toThrow(/retry count already at maximum/);

    // Then: updatePhaseStatus が postProgressFn より先に呼ばれる
    const updateCallOrder = mockMetadata.updatePhaseStatus.mock.invocationCallOrder[0];
    const postProgressCallOrder = postProgressFn.mock.invocationCallOrder[0];
    expect(updateCallOrder).toBeDefined();
    expect(postProgressCallOrder).toBeDefined();
    expect(updateCallOrder).toBeLessThan(postProgressCallOrder);
  });

  test('#697-3: retry_countが3の場合、reviseFnとreviewFnが呼ばれない', async () => {
    // Given: retry_count=3
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>();
    const reviseFn = jest.fn<any>();
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('retry count already at maximum');

    // Then: リトライループに関連する処理が呼ばれない
    expect(reviseFn).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();
    expect(commitAndPushStepFn).not.toHaveBeenCalled();
  });

  test('#697-4: retry_countが3の場合、incrementRetryCountが呼ばれない', async () => {
    // Given: retry_count=3
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        jest.fn<any>(),
        jest.fn<any>(),
        postProgressFn,
        jest.fn<any>().mockResolvedValue(undefined),
      )
    ).rejects.toThrow('retry count already at maximum');

    // Then: incrementRetryCount は呼ばれない
    expect(mockMetadata.incrementRetryCount).not.toHaveBeenCalled();
  });

  test('#697-5: postProgressFnがエラーをスローしても、ステータス更新は保持される', async () => {
    // Given: retry_count=3、postProgressFnが例外をスロー
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>();
    const reviseFn = jest.fn<any>();
    const postProgressFn = jest.fn<any>().mockRejectedValue(
      new Error('GitHub API error'),
    );
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: retry_count上限の例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow(/retry count already at maximum/);

    // Then: ステータス更新はpostProgressFn呼び出し前に行われている
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
  });

  test('#697-6: 例外メッセージにリトライ上限情報が含まれる', async () => {
    // Given: retry_count=3
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外メッセージを検証（最大リトライ到達の明示）
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        jest.fn<any>(),
        jest.fn<any>(),
        postProgressFn,
        jest.fn<any>().mockResolvedValue(undefined),
      )
    ).rejects.toThrow(/retry count already at maximum/);
  });

  test('#697-7: retry_countが2の場合、1回リトライ後に上限到達してfailedになる', async () => {
    // Given: retry_count=2（残り1回）
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 2);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Still issues' });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Review failed after 3 revise attempts');

    // Then: リトライが1回実行される
    expect(reviseFn).toHaveBeenCalledTimes(1);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledTimes(1);

    // Then: ステータスが failed に更新される
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
  });

  test('#697-8: retry_countが1の場合、2回リトライ後に上限到達してfailedになる', async () => {
    // Given: retry_count=1（残り2回）
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 1);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Still issues' });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Review failed after 3 revise attempts');

    // Then: リトライが2回実行される
    expect(reviseFn).toHaveBeenCalledTimes(2);
    expect(reviewFn).toHaveBeenCalledTimes(2);
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledTimes(2);
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
  });

  test('#697-9: retry_countが2でも、リトライ成功なら正常に完了する', async () => {
    // Given: retry_count=2、リトライ後のレビューが合格
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 2);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: 例外がスローされない
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: リトライが1回実行され成功
    expect(reviseFn).toHaveBeenCalledTimes(1);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'revise');
    expect(mockMetadata.addCompletedStep).toHaveBeenCalledWith('requirements', 'review');

    // Then: failed ステータスへの更新は行われない
    expect(mockMetadata.updatePhaseStatus).not.toHaveBeenCalledWith('requirements', 'failed');
  });

  test('#697-10: incrementRetryCountがretry_count>=3で例外をスローしない（事前チェックで未呼び出し）', async () => {
    // Given: retry_count=3、incrementRetryCountは例外をスローしないモック
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 3);
    mockMetadata.incrementRetryCount = jest.fn<any>().mockReturnValue(3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        jest.fn<any>(),
        jest.fn<any>(),
        postProgressFn,
        jest.fn<any>().mockResolvedValue(undefined),
      )
    ).rejects.toThrow(/retry count already at maximum/);

    // Then: 事前チェックで中断されるため、incrementRetryCount は呼ばれない
    expect(mockMetadata.incrementRetryCount).not.toHaveBeenCalled();
  });

  test('#697-11: retry_countが0の場合、事前チェックに引っかからず正常にリトライ', async () => {
    // Given: retry_count=0（初回実行）
    const mockMetadata = createMockMetadataManager([], 0);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: true });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: 正常に完了する
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: リトライが正常に実行される
    expect(reviseFn).toHaveBeenCalledTimes(1);
    expect(reviewFn).toHaveBeenCalledTimes(1);
    expect(mockMetadata.incrementRetryCount).toHaveBeenCalledTimes(1);
  });

  test('#697-12: retry_countが4以上の異常値でも事前チェックでブロックされる', async () => {
    // Given: retry_count=5（異常値）
    const mockMetadata = createMockMetadataManagerWithStatusUpdate([], 5);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 事前チェックで即座にブロック
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        jest.fn<any>(),
        jest.fn<any>(),
        postProgressFn,
        jest.fn<any>().mockResolvedValue(undefined),
      )
    ).rejects.toThrow(/retry count already at maximum/);

    // Then: ステータスが failed に更新される
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
  });

  test('#697-13: reviseがcompletedStepsに含まれる場合、事前チェックよりスキップが優先', async () => {
    // Given: completedSteps に 'revise' を含む、retry_count=3
    const mockMetadata = createMockMetadataManagerWithStatusUpdate(['revise'], 3);
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>();
    const reviseFn = jest.fn<any>();
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When: スキップされて正常終了
    await manager.performReviseStepWithRetry(
      null,
      initialReviewResult,
      reviewFn,
      reviseFn,
      postProgressFn,
      commitAndPushStepFn,
    );

    // Then: reviseスキップが優先され、事前チェックに到達しない
    expect(reviseFn).not.toHaveBeenCalled();
    expect(reviewFn).not.toHaveBeenCalled();
    expect(mockMetadata.updatePhaseStatus).not.toHaveBeenCalled();
    expect(postProgressFn).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Issue #248: 例外スロー前のステータス更新
// =============================================================================
describe('ReviewCycleManager - Issue #248: ステータス更新の確実性', () => {
  test('Issue #248-1: revise失敗時、例外スロー前にステータスが failed に更新される', async () => {
    // Given: revise が失敗する
    const mockMetadata = createMockMetadataManagerWithStatusUpdate();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>();
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Revise failed' });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Revise failed');

    // Then: 例外スロー前にステータスが failed に更新される（Phase 4の実装）
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
    expect(postProgressFn).toHaveBeenCalledWith(
      'failed',
      expect.stringContaining('修正処理')
    );
  });

  test('Issue #248-2: 最大リトライ回数超過時、例外スロー前にステータスが failed に更新される', async () => {
    // Given: すべてのreviewが失敗
    const mockMetadata = createMockMetadataManagerWithStatusUpdate();
    const manager = new ReviewCycleManager(mockMetadata, 'requirements');

    const initialReviewResult: PhaseExecutionResult = { success: false, error: 'Issues found' };
    const reviewFn = jest.fn<any>().mockResolvedValue({ success: false, error: 'Still issues' });
    const reviseFn = jest.fn<any>().mockResolvedValue({ success: true });
    const postProgressFn = jest.fn<any>().mockResolvedValue(undefined);
    const commitAndPushStepFn = jest.fn<any>().mockResolvedValue(undefined);

    // When/Then: 例外がスローされる
    await expect(
      manager.performReviseStepWithRetry(
        null,
        initialReviewResult,
        reviewFn,
        reviseFn,
        postProgressFn,
        commitAndPushStepFn,
      )
    ).rejects.toThrow('Review failed after 3 revise attempts');

    // Then: 例外スロー前にステータスが failed に更新される（Phase 4の実装）
    expect(mockMetadata.updatePhaseStatus).toHaveBeenCalledWith('requirements', 'failed');
    expect(postProgressFn).toHaveBeenCalledWith(
      'failed',
      expect.stringContaining('最大リトライ回数')
    );
  });
});
