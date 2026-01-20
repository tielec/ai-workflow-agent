import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { GitManager } from '../../core/git-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { validatePhaseDependencies } from '../../core/phase-dependencies.js';
import {
  PhaseName,
  PhaseStatus,
  PhaseExecutionResult,
  SupportedLanguage,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from '../../types.js';
import { StepExecutor } from './step-executor.js';
import { ProgressFormatter } from '../formatters/progress-formatter.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import {
  hasWorkflowChecklist,
  updatePhaseChecklistInPrBody,
} from '../../utils/pr-body-checklist-utils.js';

// PhaseRunOptions は BasePhase から import（Issue #49）
import type { PhaseRunOptions } from '../base-phase.js';

/**
 * PhaseRunner用の多言語メッセージマッピング定数
 *
 * フェーズの実行ライフサイクルにおける進捗メッセージを、ユーザーの指定言語
 * （日本語/英語）に基づいて動的に生成するために使用される。
 *
 * @see {@link https://github.com/tielec/ai-workflow-agent/issues/590|Issue #590}
 * @since v0.5.0 - Issue #590: i18n: phase-runner.ts 進捗メッセージの多言語対応を完了
 *
 * @example
 * ```typescript
 * const language = metadata.getLanguage() || 'ja';
 * const messages = PHASE_RUNNER_MESSAGES[language];
 * const startMessage = messages.phaseStarted('planning');
 * // 日本語: "planning フェーズを開始します。"
 * // 英語: "Starting planning phase."
 * ```
 */
const PHASE_RUNNER_MESSAGES: Record<
  SupportedLanguage,
  {
    phaseStarted: (phaseName: string) => string;
    phaseResumed: (phaseName: string, step: string) => string;
    phaseCompleted: (phaseName: string) => string;
    phaseFailed: (phaseName: string, reason: string) => string;
  }
> = {
  ja: {
    phaseStarted: (phaseName) => `${phaseName} フェーズを開始します。`,
    phaseResumed: (phaseName, step) => `${phaseName} フェーズを再開します (step: ${step})。`,
    phaseCompleted: (phaseName) => `${phaseName} フェーズが完了しました。`,
    phaseFailed: (phaseName, reason) => `${phaseName} フェーズでエラーが発生しました: ${reason}`,
  },
  en: {
    phaseStarted: (phaseName) => `Starting ${phaseName} phase.`,
    phaseResumed: (phaseName, step) => `Resuming ${phaseName} phase (step: ${step}).`,
    phaseCompleted: (phaseName) => `${phaseName} phase completed.`,
    phaseFailed: (phaseName, reason) => `${phaseName} phase failed: ${reason}`,
  },
};

/**
 * PhaseRunner - フェーズライフサイクル管理を担当
 *
 * フェーズ全体のライフサイクル（run、依存関係検証、エラーハンドリング）を担当するモジュール。
 *
 * 責務:
 * - run: フェーズ全体の実行
 * - validateDependencies: 依存関係検証
 * - handleFailure: フェーズ失敗時の処理
 * - postProgress: 進捗状況の GitHub Issue への投稿
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */
export class PhaseRunner {
  private readonly phaseName: PhaseName;
  private readonly metadata: MetadataManager;
  private readonly github: GitHubClient;
  private readonly stepExecutor: StepExecutor;
  private readonly progressFormatter: ProgressFormatter;
  private readonly skipDependencyCheck: boolean;
  private readonly ignoreDependencies: boolean;
  private readonly skipPhases: PhaseName[] | undefined;
  private readonly presetPhases: PhaseName[] | undefined;
  private readonly reviseFn: ((feedback: string) => Promise<PhaseExecutionResult>) | null;

  /**
   * @param phaseName - フェーズ名
   * @param metadata - メタデータマネージャー
   * @param github - GitHub クライアント
   * @param stepExecutor - ステップ実行マネージャー
   * @param skipDependencyCheck - 依存関係検証をスキップするか
   * @param ignoreDependencies - 依存関係違反を無視するか
   * @param skipPhases - スキップ対象フェーズリスト
   * @param presetPhases - プリセット実行時のフェーズリスト（Issue #396）
   * @param reviseFn - revise メソッドを実行する関数
   */
  constructor(
    phaseName: PhaseName,
    metadata: MetadataManager,
    github: GitHubClient,
    stepExecutor: StepExecutor,
    skipDependencyCheck: boolean,
    ignoreDependencies: boolean,
    skipPhases: PhaseName[] | undefined,
    presetPhases: PhaseName[] | undefined,
    reviseFn: ((feedback: string) => Promise<PhaseExecutionResult>) | null
  ) {
    this.phaseName = phaseName;
    this.metadata = metadata;
    this.github = github;
    this.stepExecutor = stepExecutor;
    this.progressFormatter = new ProgressFormatter();
    this.skipDependencyCheck = skipDependencyCheck;
    this.ignoreDependencies = ignoreDependencies;
    // 引数の型ずれによる実行時エラーを避けるため、配列と null を正規化する
    this.skipPhases = Array.isArray(skipPhases) ? skipPhases : undefined;
    this.presetPhases = Array.isArray(presetPhases) ? presetPhases : undefined;
    this.reviseFn = reviseFn ?? null;
  }

  /**
   * フェーズ全体を実行
   *
   * @param options - 実行オプション
   * @returns 実行結果（成功: true、失敗: false）
   *
   * @example
   * ```typescript
   * const success = await phaseRunner.run({
   *   gitManager: gitManager,
   *   skipReview: false
   * });
   * if (!success) {
   *   logger.error('Phase execution failed');
   * }
   * ```
   */
  async run(options: PhaseRunOptions = {}): Promise<boolean> {
    const gitManager = options.gitManager ?? null;
    let executionSuccess = false;

    // 依存関係検証
    const dependencyResult = this.validateDependencies();
    if (!dependencyResult.valid) {
      const error =
        dependencyResult.error ??
        'Dependency validation failed. Use --skip-dependency-check to bypass.';
      logger.error(`${error}`);
      await this.handlePhaseError(error);
      return false;
    }

    if (dependencyResult.warning) {
      logger.warn(`${dependencyResult.warning}`);
    }

    // Issue #90: current_step と completed_steps を確認してレジューム
    const currentStatus = this.metadata.getPhaseStatus(this.phaseName);
    const currentStep = this.metadata.getCurrentStep(this.phaseName);
    const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
    const messages = this.getMessages();

    // フェーズが pending の場合のみステータス更新
    if (currentStatus === 'pending') {
      this.updatePhaseStatus('in_progress');
      await this.postProgress('in_progress', messages.phaseStarted(this.phaseName));
    } else if (currentStatus === 'in_progress') {
      // ロールバック等で in_progress の場合
      logger.info(`Phase ${this.phaseName} resuming from step: ${currentStep ?? 'execute'}`);
      await this.postProgress(
        'in_progress',
        messages.phaseResumed(this.phaseName, currentStep ?? 'execute')
      );
    }

    try {
      // Execute Step（完了済みならスキップ）
      if (!completedSteps.includes('execute')) {
        logger.info(`Phase ${this.phaseName}: executing 'execute' step`);
        const executeResult = await this.stepExecutor.executeStep(gitManager);
        if (!executeResult.success) {
          await this.handlePhaseError(executeResult.error ?? 'Unknown execute error');
          return false;
        }
      } else {
        logger.info(`Phase ${this.phaseName}: skipping 'execute' step (already completed)`);
      }

      // Review Step（完了済みならスキップ、skipReview フラグでもスキップ）
      if (!options.skipReview) {
        if (!completedSteps.includes('review')) {
          logger.info(`Phase ${this.phaseName}: executing 'review' step`);
          const reviewResult = await this.stepExecutor.reviewStep(gitManager, false);
          if (!reviewResult.success) {
            // Revise Step（if review failed）
            if (!this.reviseFn) {
              logger.error(`Phase ${this.phaseName}: revise() method not implemented.`);
              await this.handlePhaseError('revise() method not implemented');
              return false;
            }

            logger.info(`Phase ${this.phaseName}: executing 'revise' step`);
            await this.stepExecutor.reviseStep(
              gitManager,
              reviewResult,
              this.reviseFn,
              async (status: PhaseStatus, details?: string) => this.postProgress(status, details)
            );
          }
        } else {
          logger.info(`Phase ${this.phaseName}: skipping 'review' step (already completed)`);

          // Review は完了済みだが、current_step が 'revise' の場合（ロールバック）
          if (currentStep === 'revise') {
            if (!this.reviseFn) {
              logger.error(`Phase ${this.phaseName}: revise() method not implemented.`);
              await this.handlePhaseError('revise() method not implemented');
              return false;
            }

            logger.info(`Phase ${this.phaseName}: executing 'revise' step (rollback)`);
            // ロールバック時は review を再実行せず、直接 revise を実行
            const reviewResult = { success: false, review_status: 'FAIL', feedback: 'Rollback triggered', needs_revision: true };
            await this.stepExecutor.reviseStep(
              gitManager,
              reviewResult,
              this.reviseFn,
              async (status: PhaseStatus, details?: string) => this.postProgress(status, details)
            );
          }
        }
      }

      // フェーズ完了
      executionSuccess = true;
      await this.finalizePhase();

      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Execution failed: ${message}`);
      await this.handlePhaseError(message);
      return false;
    } finally {
      // Issue #248: finally ブロックでステータス更新を保証
      await this.ensurePhaseStatusUpdated(executionSuccess);
    }
  }

  /**
   * 依存関係を検証
   *
   * @returns 検証結果
   *
   * @example
   * ```typescript
   * const result = phaseRunner.validateDependencies();
   * if (!result.valid) {
   *   logger.error(result.error);
   * }
   * ```
   */
  private validateDependencies(): { valid: boolean; error?: string; warning?: string } {
    return validatePhaseDependencies(this.phaseName, this.metadata, {
      skipCheck: this.skipDependencyCheck,
      ignoreViolations: this.ignoreDependencies,
      skipPhases: this.skipPhases,
      presetPhases: this.presetPhases,
    });
  }

  /**
   * Issue #248: フェーズ完了処理
   *
   * フェーズが正常に完了した場合、ステータスを 'completed' に更新し、
   * 進捗状況を GitHub Issue に投稿する。
   *
   * @private
   *
   * @example
   * ```typescript
   * await phaseRunner.finalizePhase();
   * ```
   */
  private async finalizePhase(): Promise<void> {
    try {
      this.updatePhaseStatus('completed');
      logger.info(`Phase ${this.phaseName}: Status updated to 'completed'`);

      const messages = this.getMessages();
      await this.postProgress('completed', messages.phaseCompleted(this.phaseName));
      await this.updatePrBodyChecklist();
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Failed to finalize phase: ${message}`);
      // finalizePhase() 自体の例外は握りつぶす（ステータス更新は成功しているはず）
    }
  }

  /**
   * Issue #248: フェーズステータス更新の確実性を保証
   *
   * finally ブロックで呼び出され、ステータスが in_progress のままでないかチェックする。
   * ステータス更新漏れを検出した場合は ERROR ログを出力する。
   *
   * @param executionSuccess - 実行が成功したかどうか
   * @private
   *
   * @example
   * ```typescript
   * await phaseRunner.ensurePhaseStatusUpdated(true);
   * ```
   */
  private async ensurePhaseStatusUpdated(executionSuccess: boolean): Promise<void> {
    try {
      const currentStatus = this.metadata.getPhaseStatus(this.phaseName);

      if (currentStatus === 'in_progress') {
        logger.error(
          `Phase ${this.phaseName}: Status is still 'in_progress' after execution. ` +
          `Expected: ${executionSuccess ? 'completed' : 'failed'}`
        );

        // ステータス更新漏れを自動修正
        if (executionSuccess) {
          this.updatePhaseStatus('completed');
          logger.warn(`Phase ${this.phaseName}: Auto-corrected status to 'completed'`);
        } else {
          this.updatePhaseStatus('failed');
          logger.warn(`Phase ${this.phaseName}: Auto-corrected status to 'failed'`);
        }
      }
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Failed to ensure status updated: ${message}`);
      // finally ブロック内の例外は握りつぶす
    }
  }

  /**
   * Issue #248: フェーズエラー処理
   *
   * フェーズ実行中にエラーが発生した場合、ステータスを 'failed' に更新し、
   * 進捗状況を GitHub Issue に投稿する。
   *
   * @param reason - エラー理由
   * @private
   *
   * @example
   * ```typescript
   * await phaseRunner.handlePhaseError('Execute step failed: some error');
   * ```
   */
  private async handlePhaseError(reason: string): Promise<void> {
    try {
      this.updatePhaseStatus('failed');
      logger.info(`Phase ${this.phaseName}: Status updated to 'failed'`);

      const messages = this.getMessages();
      await this.postProgress(
        'failed',
        messages.phaseFailed(this.phaseName, reason)
      );
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Failed to handle phase error: ${message}`);
      // handlePhaseError() 自体の例外は握りつぶす（ログのみ出力）
    }
  }

  /**
   * 進捗状況を GitHub Issue に投稿
   *
   * @param status - フェーズステータス
   * @param details - 詳細メッセージ
   *
   * @example
   * ```typescript
   * await phaseRunner.postProgress('in_progress', 'フェーズを開始します');
   * ```
   */
  private async postProgress(status: PhaseStatus, details?: string): Promise<void> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    if (Number.isNaN(issueNumber)) {
      return;
    }

    try {
      const content = this.formatProgressComment(status, details);
      await this.github.createOrUpdateProgressComment(
        issueNumber,
        content,
        this.metadata
      );
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to post workflow progress: ${message}`);
    }
  }

  /**
   * 進捗コメントをフォーマット
   *
   * @param status - フェーズステータス
   * @param details - 詳細メッセージ
   * @returns フォーマット済みコメント
   */
  private formatProgressComment(status: PhaseStatus, details?: string): string {
    // ProgressFormatter に委譲（Issue #23）
    return this.progressFormatter.formatProgressComment(
      this.phaseName,
      status,
      this.metadata,
      details
    );
  }

  /**
   * フェーズステータスを更新
   *
   * @param status - フェーズステータス
   * @param options - オプション
   */
  private updatePhaseStatus(
    status: PhaseStatus,
    options: { reviewResult?: string | null; outputFile?: string | null } = {}
  ): void {
    const payload: { reviewResult?: string; outputFile?: string } = {};
    if (options.reviewResult) {
      payload.reviewResult = options.reviewResult;
    }
    if (options.outputFile) {
      payload.outputFile = options.outputFile;
    }

    this.metadata.updatePhaseStatus(this.phaseName, status, payload);
  }

  /**
   * Update the PR body checklist when a phase is completed.
   * Errors are logged and swallowed to avoid blocking phase completion.
   */
  private async updatePrBodyChecklist(): Promise<void> {
    const prNumber = this.metadata.data.pr_number;
    if (prNumber === null || prNumber === undefined) {
      logger.info(`Phase ${this.phaseName}: Skipping PR body update (no PR number)`);
      return;
    }

    try {
      const prBody = await this.github.getPullRequestBody(prNumber);
      if (!prBody) {
        logger.info(`Phase ${this.phaseName}: PR body is empty, skipping checklist update`);
        return;
      }

      if (!hasWorkflowChecklist(prBody)) {
        logger.info(`Phase ${this.phaseName}: Workflow checklist not found in PR body, skipping update`);
        return;
      }

      const updatedBody = updatePhaseChecklistInPrBody(prBody, this.phaseName);
      if (updatedBody === prBody) {
        logger.info(`Phase ${this.phaseName}: PR body checklist already up to date`);
        return;
      }

      const updateResult = await this.github.updatePullRequest(prNumber, updatedBody);
      if (!updateResult.success) {
        logger.warn(
          `Phase ${this.phaseName}: Failed to update PR body checklist: ${updateResult.error ?? 'Unknown error'}`
        );
        return;
      }

      logger.info(`Phase ${this.phaseName}: Updated PR body checklist`);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Phase ${this.phaseName}: Failed to update PR body checklist: ${message}`);
    }
  }

  /**
   * 現在の言語設定に基づいたメッセージ関数を取得する
   */
  private getMessages(): (typeof PHASE_RUNNER_MESSAGES)[SupportedLanguage] {
    const languageCandidate = (
      this.metadata as { getLanguage?: () => SupportedLanguage | string }
    ).getLanguage?.();
    const language: SupportedLanguage = languageCandidate && SUPPORTED_LANGUAGES.includes(languageCandidate as SupportedLanguage)
      ? (languageCandidate as SupportedLanguage)
      : DEFAULT_LANGUAGE;

    return PHASE_RUNNER_MESSAGES[language];
  }
}
