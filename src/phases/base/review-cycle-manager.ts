/**
 * Review Cycle Manager
 *
 * レビューサイクル（Review → Revise → Re-review）の管理を提供します。
 * base-phase.tsから分離されたレビューサイクル管理専用クラスです。
 */

import { MetadataManager } from '../../core/metadata-manager.js';
import { GitManager } from '../../core/git-manager.js';
import { PhaseExecutionResult, PhaseName } from '../../types.js';

const MAX_RETRIES = 3;

/**
 * ReviewCycleManager クラス
 *
 * フェーズのレビューサイクル（review → revise → review）を管理し、
 * 最大リトライ回数まで自動的に修正を試みます。
 */
export class ReviewCycleManager {
  constructor(
    private metadata: MetadataManager,
    private phaseName: PhaseName,
    private reviewFn: () => Promise<PhaseExecutionResult>,
    private reviseFn: ((feedback: string) => Promise<PhaseExecutionResult>) | null,
    private postProgressFn: (status: string, details?: string) => Promise<void>,
  ) {}

  /**
   * レビューサイクルを実行
   *
   * レビューを実行し、失敗した場合は最大リトライ回数まで修正（revise）を繰り返します。
   *
   * @param initialOutputFile - 初回の出力ファイルパス
   * @param maxRetries - 最大リトライ回数（デフォルト: 3）
   * @returns レビューサイクルの結果
   */
  async performReviewCycle(
    initialOutputFile: string | null,
    maxRetries: number = MAX_RETRIES,
  ): Promise<{
    success: boolean;
    reviewResult: PhaseExecutionResult | null;
    outputFile: string | null;
    error?: string;
  }> {
    let revisionAttempts = 0;
    let currentOutputFile = initialOutputFile;

    while (true) {
      console.info(`[INFO] Phase ${this.phaseName}: Starting review (attempt ${revisionAttempts + 1})...`);

      let reviewResult: PhaseExecutionResult;
      try {
        reviewResult = await this.reviewFn();
        console.info(`[INFO] Phase ${this.phaseName}: Review method completed. Success: ${reviewResult.success}`);
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        const stack = (error as Error).stack ?? '';
        console.error(`[ERROR] Phase ${this.phaseName}: Review method threw an exception: ${message}`);
        console.error(`[ERROR] Stack trace:\n${stack}`);
        return {
          success: false,
          reviewResult: null,
          outputFile: currentOutputFile,
          error: `Review threw an exception: ${message}`,
        };
      }

      // レビュー合格
      if (reviewResult.success) {
        console.info(`[INFO] Phase ${this.phaseName}: Review passed with result: ${reviewResult.output ?? 'N/A'}`);
        return {
          success: true,
          reviewResult,
          outputFile: currentOutputFile,
        };
      }

      console.warn(`[WARNING] Phase ${this.phaseName}: Review failed: ${reviewResult.error ?? 'Unknown reason'}`);

      // 最大リトライ回数に達した
      if (revisionAttempts >= maxRetries) {
        console.error(`[ERROR] Phase ${this.phaseName}: Max retries (${maxRetries}) reached. Review cycle failed.`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviewResult.error ?? 'Review failed.',
        };
      }

      // revise メソッドが実装されていない
      if (!this.reviseFn) {
        console.error(`[ERROR] Phase ${this.phaseName}: revise() method not implemented. Cannot retry.`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviewResult.error ?? 'Review failed and revise() is not implemented.',
        };
      }

      revisionAttempts += 1;

      let retryCount: number;
      try {
        retryCount = this.metadata.incrementRetryCount(this.phaseName);
      } catch (error) {
        console.error(`[ERROR] Phase ${this.phaseName}: Failed to increment retry count: ${(error as Error).message}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: (error as Error).message,
        };
      }

      console.info(`[INFO] Phase ${this.phaseName}: Starting revise (retry ${retryCount}/${maxRetries})...`);
      await this.postProgressFn(
        'in_progress',
        `レビュー不合格のため修正を実施します（${retryCount}/${maxRetries}回目）。`,
      );

      const feedback =
        reviewResult.error ?? 'レビューで不合格となりました。フィードバックをご確認ください。';

      let reviseResult: PhaseExecutionResult;
      try {
        reviseResult = await this.reviseFn(feedback);
        console.info(`[INFO] Phase ${this.phaseName}: Revise method completed. Success: ${reviseResult.success}`);
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        const stack = (error as Error).stack ?? '';
        console.error(`[ERROR] Phase ${this.phaseName}: Revise method threw an exception: ${message}`);
        console.error(`[ERROR] Stack trace:\n${stack}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: `Revise threw an exception: ${message}`,
        };
      }

      if (!reviseResult.success) {
        console.error(`[ERROR] Phase ${this.phaseName}: Revise failed: ${reviseResult.error ?? 'Unknown error'}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviseResult.error ?? 'Revise failed.',
        };
      }

      console.info(`[INFO] Phase ${this.phaseName}: Revise completed successfully`);

      if (reviseResult.output) {
        currentOutputFile = reviseResult.output;
        console.info(`[INFO] Phase ${this.phaseName}: Updated output file: ${currentOutputFile}`);
      }
    }
  }

  /**
   * Reviseステップをリトライ付きで実行（Issue #10: ステップ単位のコミット対応）
   *
   * @param gitManager - Git Manager（コミット＆プッシュ用）
   * @param initialReviewResult - 初回のレビュー結果
   */
  async performReviseStepWithRetry(
    gitManager: GitManager | null,
    initialReviewResult: PhaseExecutionResult,
  ): Promise<void> {
    const completedSteps = this.metadata.getCompletedSteps(this.phaseName);

    // reviseステップが既に完了している場合はスキップ
    if (completedSteps.includes('revise')) {
      console.info(`[INFO] Phase ${this.phaseName}: Skipping revise step (already completed)`);
      return;
    }

    let retryCount = 0;
    let reviewResult = initialReviewResult;

    while (retryCount < MAX_RETRIES) {
      console.info(`[INFO] Phase ${this.phaseName}: Starting revise step (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      this.metadata.updateCurrentStep(this.phaseName, 'revise');

      // Increment retry count in metadata
      const currentRetryCount = this.metadata.incrementRetryCount(this.phaseName);
      await this.postProgressFn(
        'in_progress',
        `レビュー不合格のため修正を実施します（${currentRetryCount}/${MAX_RETRIES}回目）。`,
      );

      const feedback = reviewResult.error ?? 'レビューで不合格となりました。';

      // revise メソッドが実装されていない
      if (!this.reviseFn) {
        console.error(`[ERROR] Phase ${this.phaseName}: revise() method not implemented.`);
        throw new Error('revise() method not implemented');
      }

      // Execute revise
      const reviseResult = await this.reviseFn(feedback);
      if (!reviseResult.success) {
        console.error(`[ERROR] Phase ${this.phaseName}: Revise failed: ${reviseResult.error ?? 'Unknown error'}`);
        throw new Error(reviseResult.error ?? 'Revise failed');
      }

      console.info(`[INFO] Phase ${this.phaseName}: Revise completed successfully`);

      // Commit & Push after revise (Issue #10)
      if (gitManager) {
        await this.commitAndPushStep(gitManager, 'revise');
      }

      this.metadata.addCompletedStep(this.phaseName, 'revise');

      // Re-run review after revise
      console.info(`[INFO] Phase ${this.phaseName}: Re-running review after revise...`);
      reviewResult = await this.reviewFn();

      if (reviewResult.success) {
        console.info(`[INFO] Phase ${this.phaseName}: Review passed after revise`);

        // Mark review as completed
        this.metadata.addCompletedStep(this.phaseName, 'review');

        // Commit & Push after successful review (Issue #10)
        if (gitManager) {
          await this.commitAndPushStep(gitManager, 'review');
        }

        return;
      }

      console.warn(`[WARNING] Phase ${this.phaseName}: Review still failed after revise (attempt ${retryCount + 1})`);

      // Clear revise from completed steps to allow retry
      const steps = this.metadata.getCompletedSteps(this.phaseName).filter(s => s !== 'revise');
      this.metadata.data.phases[this.phaseName].completed_steps = steps;

      retryCount++;
    }

    // Max retries reached
    console.error(`[ERROR] Phase ${this.phaseName}: Max revise retries (${MAX_RETRIES}) reached`);
    throw new Error(`Review failed after ${MAX_RETRIES} revise attempts`);
  }

  /**
   * ステップ単位のコミット＆プッシュ（Issue #10）
   *
   * @param gitManager - Git Manager
   * @param step - ステップ名
   */
  private async commitAndPushStep(
    gitManager: GitManager,
    step: 'execute' | 'review' | 'revise'
  ): Promise<void> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const phaseNumber = this.getPhaseNumberInt(this.phaseName);

    console.info(`[INFO] Phase ${this.phaseName}: Committing ${step} step...`);

    const commitResult = await gitManager.commitStepOutput(
      this.phaseName,
      phaseNumber,
      step,
      issueNumber,
      this.metadata.workflowDir,
    );

    if (!commitResult.success) {
      throw new Error(`Git commit failed for step ${step}: ${commitResult.error ?? 'unknown error'}`);
    }

    console.info(`[INFO] Phase ${this.phaseName}: Pushing ${step} step to remote...`);

    try {
      const pushResult = await gitManager.pushToRemote(3); // 最大3回リトライ
      if (!pushResult.success) {
        throw new Error(`Git push failed for step ${step}: ${pushResult.error ?? 'unknown error'}`);
      }
      console.info(`[INFO] Phase ${this.phaseName}: Step ${step} pushed successfully`);
    } catch (error) {
      // プッシュ失敗時の処理
      console.error(`[ERROR] Phase ${this.phaseName}: Failed to push step ${step}: ${(error as Error).message}`);

      // current_stepを維持（次回レジューム時に同じステップを再実行）
      this.metadata.updateCurrentStep(this.phaseName, step);

      throw error;
    }
  }

  /**
   * Issue #10: フェーズ番号を整数で取得
   */
  private getPhaseNumberInt(phase: PhaseName): number {
    const phaseOrder: PhaseName[] = [
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
    return phaseOrder.indexOf(phase);
  }
}
