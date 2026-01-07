import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { GitManager } from '../../core/git-manager.js';
import { PhaseExecutionResult, PhaseName, PhaseStatus } from '../../types.js';
import { ReviewCycleManager } from '../core/review-cycle-manager.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { ArtifactValidator } from '../helpers/artifact-validator.js';
import { config } from '../../core/config.js';

/**
 * StepExecutor - ステップ実行ロジックを担当
 *
 * 各ステップ（execute/review/revise）の実行、completed_steps 管理、
 * Git コミット＆プッシュ（Issue #10）を担当するモジュール。
 *
 * 責務:
 * - executeStep: execute ステップの実行
 * - reviewStep: review ステップの実行
 * - reviseStep: revise ステップの実行（ReviewCycleManager に委譲）
 * - commitAndPushStep: ステップ完了後の Git コミット＆プッシュ
 * - completed_steps 管理
 * - current_step 管理
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */
export class StepExecutor {
  private readonly phaseName: PhaseName;
  private readonly metadata: MetadataManager;
  private readonly reviewCycleManager: ReviewCycleManager;
  private readonly artifactValidator: ArtifactValidator;
  private readonly executeFn: () => Promise<PhaseExecutionResult>;
  private readonly reviewFn: () => Promise<PhaseExecutionResult>;
  private readonly shouldRunReviewFn: () => Promise<boolean>;

  /**
   * @param phaseName - フェーズ名
   * @param metadata - メタデータマネージャー
   * @param reviewCycleManager - レビューサイクルマネージャー
   * @param executeFn - execute メソッドを実行する関数
   * @param reviewFn - review メソッドを実行する関数
   * @param shouldRunReviewFn - レビュー実行要否を判定する関数
   */
  constructor(
    phaseName: PhaseName,
    metadata: MetadataManager,
    reviewCycleManager: ReviewCycleManager,
    executeFn: () => Promise<PhaseExecutionResult>,
    reviewFn: () => Promise<PhaseExecutionResult>,
    shouldRunReviewFn: () => Promise<boolean>
  ) {
    this.phaseName = phaseName;
    this.metadata = metadata;
    this.reviewCycleManager = reviewCycleManager;
    this.artifactValidator = new ArtifactValidator();
    this.executeFn = executeFn;
    this.reviewFn = reviewFn;
    this.shouldRunReviewFn = shouldRunReviewFn;
  }

  /**
   * execute ステップを実行
   *
   * @param gitManager - Git マネージャー（コミット＆プッシュ用）
   * @returns ステップ実行結果
   *
   * @example
   * ```typescript
   * const result = await stepExecutor.executeStep(gitManager);
   * if (!result.success) {
   *   logger.error(`Execute failed: ${result.error}`);
   * }
   * ```
   */
  async executeStep(gitManager: GitManager | null): Promise<PhaseExecutionResult> {
    // completed_steps に 'execute' が含まれている場合、スキップ
    const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
    if (completedSteps.includes('execute')) {
      logger.info(`Phase ${this.phaseName}: Skipping execute step (already completed)`);
      return { success: true };
    }

    logger.info(`Phase ${this.phaseName}: Starting execute step...`);
    this.metadata.updateCurrentStep(this.phaseName, 'execute');

    try {
      // BasePhase.execute() を呼び出し
      const executeResult = await this.executeFn();

      if (!executeResult.success) {
        logger.error(`Phase ${this.phaseName}: Execute failed: ${executeResult.error ?? 'Unknown error'}`);
        return executeResult;
      }

      logger.info(`Phase ${this.phaseName}: Execute completed successfully`);

      // Issue #603: Post-execute artifact validation
      if (executeResult.output) {
        logger.debug(`[Issue #603] Phase ${this.phaseName}: Validating artifact at expected path: ${executeResult.output}`);
        const fallbackDirs = this.buildFallbackDirs(executeResult.output);
        logger.debug(`[Issue #603] Phase ${this.phaseName}: Fallback directories for artifact search: ${fallbackDirs.join(', ')}`);

        const validation = this.artifactValidator.validateArtifact(
          executeResult.output,
          fallbackDirs,
          path.basename(executeResult.output),
        );

        if (!validation.valid) {
          const errorMessage =
            validation.error ?? 'Artifact validation failed after execute step.';
          logger.error(`[Issue #603] Phase ${this.phaseName}: ${errorMessage}`);
          logger.error(
            `[Issue #603] Phase ${this.phaseName}: This error halts the workflow before review/revise to prevent downstream issues. ` +
            'Check working directory configuration and agent output paths.'
          );
          return { success: false, error: errorMessage, output: executeResult.output };
        }

        if (validation.relocated) {
          logger.warn(
            `[Issue #603] Phase ${this.phaseName}: Artifact was found at wrong location and relocated. ` +
            `From: ${validation.actualPath} To: ${validation.expectedPath}. ` +
            'Review working directory configuration to prevent future relocations.',
          );
        } else {
          logger.debug(`[Issue #603] Phase ${this.phaseName}: Artifact validated at expected path: ${validation.expectedPath}`);
        }
      } else {
        logger.warn(`[Issue #603] Phase ${this.phaseName}: Execute result missing output path. Skipping artifact validation.`);
      }

      // Git コミット＆プッシュ（Issue #10）
      if (gitManager) {
        await this.commitAndPushStep(gitManager, 'execute');
      }

      // completed_steps に 'execute' を追加
      this.metadata.addCompletedStep(this.phaseName, 'execute');
      this.metadata.updateCurrentStep(this.phaseName, null);

      return executeResult;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Execute step failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * review ステップを実行
   *
   * @param gitManager - Git マネージャー（コミット＾プッシュ用）
   * @param skipReview - レビューをスキップするか
   * @returns ステップ実行結果
   *
   * @example
   * ```typescript
   * const result = await stepExecutor.reviewStep(gitManager, false);
   * if (!result.success) {
   *   // revise ステップに進む
   * }
   * ```
   */
  async reviewStep(
    gitManager: GitManager | null,
    skipReview: boolean
  ): Promise<PhaseExecutionResult> {
    // skipReview が true の場合、スキップ
    if (skipReview) {
      logger.info(`Phase ${this.phaseName}: Skipping review (skipReview=${skipReview})`);
      return { success: true };
    }

    // shouldRunReview() を呼び出してレビュー実行要否を確認
    const shouldRun = await this.shouldRunReviewFn();
    if (!shouldRun) {
      logger.info(`Phase ${this.phaseName}: Skipping review (shouldRunReview=false)`);
      return { success: true };
    }

    // completed_steps に 'review' が含まれている場合、スキップ
    const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
    if (completedSteps.includes('review')) {
      logger.info(`Phase ${this.phaseName}: Skipping review step (already completed)`);
      return { success: true };
    }

    logger.info(`Phase ${this.phaseName}: Starting review step...`);
    this.metadata.updateCurrentStep(this.phaseName, 'review');

    try {
      // BasePhase.review() を呼び出し
      const reviewResult = await this.reviewFn();

      if (!reviewResult.success) {
        logger.warn(`Phase ${this.phaseName}: Review failed: ${reviewResult.error ?? 'Unknown error'}`);
        return reviewResult; // 呼び出し元で reviseStep を実行
      }

      logger.info(`Phase ${this.phaseName}: Review completed successfully`);

      // Git コミット＾プッシュ（Issue #10）
      if (gitManager) {
        await this.commitAndPushStep(gitManager, 'review');
      }

      // completed_steps に 'review' を追加
      this.metadata.addCompletedStep(this.phaseName, 'review');
      this.metadata.updateCurrentStep(this.phaseName, null);

      return reviewResult;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Review step failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * revise ステップを実行（リトライ付き）
   *
   * ReviewCycleManager に委譲してリトライロジックを実行します。
   *
   * @param gitManager - Git マネージャー（コミット＆プッシュ用）
   * @param initialReviewResult - 初回レビュー結果
   * @param reviseFn - Revise 関数
   * @param postProgressFn - 進捗投稿関数
   *
   * @example
   * ```typescript
   * await stepExecutor.reviseStep(
   *   gitManager,
   *   reviewResult,
   *   async (feedback) => this.revise(feedback),
   *   async (status, details) => this.postProgress(status, details)
   * );
   * ```
   */
  async reviseStep(
    gitManager: GitManager | null,
    initialReviewResult: PhaseExecutionResult,
    reviseFn: (feedback: string) => Promise<PhaseExecutionResult>,
    postProgressFn: (status: PhaseStatus, details?: string) => Promise<void>
  ): Promise<void> {
    // ReviewCycleManager に委譲（Issue #23）
    await this.reviewCycleManager.performReviseStepWithRetry(
      gitManager,
      initialReviewResult,
      this.reviewFn,
      reviseFn,
      postProgressFn,
      async (step: 'execute' | 'review' | 'revise') => {
        if (gitManager) {
          await this.commitAndPushStep(gitManager, step);
        }
      }
    );
  }

  private buildFallbackDirs(expectedOutputPath: string): string[] {
    const dirs = new Set<string>();
    const repoRoot = this.extractRepoRoot(expectedOutputPath);
    if (repoRoot) {
      dirs.add(repoRoot);
    }

    const reposRoot = config.getReposRoot();
    if (reposRoot) {
      dirs.add(reposRoot);
    }

    dirs.add(process.cwd());

    return Array.from(dirs);
  }

  private extractRepoRoot(expectedOutputPath: string): string | null {
    const marker = `${path.sep}.ai-workflow${path.sep}`;
    const markerIndex = expectedOutputPath.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }
    return path.resolve(expectedOutputPath.slice(0, markerIndex));
  }

  /**
   * ステップ完了後に Git コミット＆プッシュ（Issue #10）
   *
   * @param gitManager - Git マネージャー
   * @param step - 完了したステップ（'execute' | 'review' | 'revise'）
   *
   * @example
   * ```typescript
   * await stepExecutor.commitAndPushStep(gitManager, 'execute');
   * ```
   */
  private async commitAndPushStep(
    gitManager: GitManager,
    step: 'execute' | 'review' | 'revise'
  ): Promise<void> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const phaseNumber = this.getPhaseNumberInt(this.phaseName);

    logger.info(`Phase ${this.phaseName}: Committing ${step} step...`);

    const commitResult = await gitManager.commitStepOutput(
      this.phaseName,
      phaseNumber,
      step,
      issueNumber,
      this.metadata.data.target_repository?.path ?? ''
    );

    if (!commitResult.success) {
      throw new Error(`Git commit failed for step ${step}: ${commitResult.error ?? 'unknown error'}`);
    }

    logger.info(`Phase ${this.phaseName}: Pushing ${step} step to remote...`);

    try {
      const pushResult = await gitManager.pushToRemote(3); // 最大3回リトライ
      if (!pushResult.success) {
        throw new Error(`Git push failed for step ${step}: ${pushResult.error ?? 'unknown error'}`);
      }
      logger.info(`Phase ${this.phaseName}: Step ${step} pushed successfully`);
    } catch (error) {
      // プッシュ失敗時の処理
      logger.error(`Phase ${this.phaseName}: Failed to push step ${step}: ${getErrorMessage(error)}`);

      // current_step を維持（次回レジューム時に同じステップを再実行）
      this.metadata.updateCurrentStep(this.phaseName, step);

      throw error;
    }
  }

  /**
   * フェーズ番号を整数で取得（Issue #10）
   *
   * @param phase - フェーズ名
   * @returns フェーズ番号（0-9）
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
