/**
 * ReviewCycleManager - レビューサイクル管理を担当
 *
 * レビュー失敗時の自動修正（revise）とリトライを管理するモジュール。
 * - レビュー実行（review() メソッド呼び出し）
 * - レビュー失敗時の revise ステップ実行
 * - 最大リトライ回数（3回）のチェック
 * - リトライカウントの更新
 * - Git コミット＆プッシュ（ステップ単位）
 */

import { MetadataManager } from '../../core/metadata-manager.js';
import { GitManager } from '../../core/git-manager.js';
import { PhaseName, PhaseExecutionResult, PhaseStatus } from '../../types.js';

const MAX_RETRIES = 3;

export class ReviewCycleManager {
  private readonly metadata: MetadataManager;
  private readonly phaseName: PhaseName;
  private readonly maxRetries: number = MAX_RETRIES;

  constructor(
    metadata: MetadataManager,
    phaseName: PhaseName,
  ) {
    this.metadata = metadata;
    this.phaseName = phaseName;
  }

  /**
   * Reviseステップの実行（リトライ付き）
   *
   * @param gitManager - Git マネージャー（コミット＆プッシュ用）
   * @param initialReviewResult - 初回レビュー結果
   * @param reviewFn - レビュー関数
   * @param reviseFn - Revise 関数
   * @param postProgressFn - 進捗投稿関数
   * @param commitAndPushStepFn - ステップ単位のコミット＆プッシュ関数
   * @throws エラー時は例外をスロー
   */
  async performReviseStepWithRetry(
    gitManager: GitManager | null,
    initialReviewResult: PhaseExecutionResult,
    reviewFn: () => Promise<PhaseExecutionResult>,
    reviseFn: (feedback: string) => Promise<PhaseExecutionResult>,
    postProgressFn: (status: PhaseStatus, details?: string) => Promise<void>,
    commitAndPushStepFn: (step: 'execute' | 'review' | 'revise') => Promise<void>,
  ): Promise<void> {
    const completedSteps = this.metadata.getCompletedSteps(this.phaseName);

    // reviseステップが既に完了している場合はスキップ
    if (completedSteps.includes('revise')) {
      console.info(`[INFO] Phase ${this.phaseName}: Skipping revise step (already completed)`);
      return;
    }

    let retryCount = 0;
    let reviewResult = initialReviewResult;

    while (retryCount < this.maxRetries) {
      console.info(`[INFO] Phase ${this.phaseName}: Starting revise step (attempt ${retryCount + 1}/${this.maxRetries})...`);
      this.metadata.updateCurrentStep(this.phaseName, 'revise');

      // Increment retry count in metadata
      const currentRetryCount = this.metadata.incrementRetryCount(this.phaseName);
      await postProgressFn(
        'in_progress',
        `レビュー不合格のため修正を実施します（${currentRetryCount}/${this.maxRetries}回目）。`,
      );

      const feedback = reviewResult.error ?? 'レビューで不合格となりました。';

      // Execute revise
      const reviseResult = await reviseFn(feedback);
      if (!reviseResult.success) {
        console.error(`[ERROR] Phase ${this.phaseName}: Revise failed: ${reviseResult.error ?? 'Unknown error'}`);
        throw new Error(reviseResult.error ?? 'Revise failed');
      }

      console.info(`[INFO] Phase ${this.phaseName}: Revise completed successfully`);

      // Commit & Push after revise (Issue #10)
      await commitAndPushStepFn('revise');

      this.metadata.addCompletedStep(this.phaseName, 'revise');

      // Re-run review after revise
      console.info(`[INFO] Phase ${this.phaseName}: Re-running review after revise...`);
      reviewResult = await reviewFn();

      if (reviewResult.success) {
        console.info(`[INFO] Phase ${this.phaseName}: Review passed after revise`);

        // Mark review as completed
        this.metadata.addCompletedStep(this.phaseName, 'review');

        // Commit & Push after successful review (Issue #10)
        await commitAndPushStepFn('review');

        return;
      }

      console.warn(`[WARNING] Phase ${this.phaseName}: Review still failed after revise (attempt ${retryCount + 1})`);

      // Clear revise from completed steps to allow retry
      const steps = this.metadata.getCompletedSteps(this.phaseName).filter(s => s !== 'revise');
      this.metadata.data.phases[this.phaseName].completed_steps = steps;

      retryCount++;
    }

    // Max retries reached
    console.error(`[ERROR] Phase ${this.phaseName}: Max revise retries (${this.maxRetries}) reached`);
    throw new Error(`Review failed after ${this.maxRetries} revise attempts`);
  }
}
