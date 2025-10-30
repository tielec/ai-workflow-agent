import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { GitManager } from '../../core/git-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { validatePhaseDependencies } from '../../core/phase-dependencies.js';
import { PhaseName, PhaseStatus, PhaseExecutionResult } from '../../types.js';
import { StepExecutor } from './step-executor.js';
import { ProgressFormatter } from '../formatters/progress-formatter.js';
import { getErrorMessage } from '../../utils/error-utils.js';

// PhaseRunOptions は BasePhase から import（Issue #49）
import type { PhaseRunOptions } from '../base-phase.js';

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
  private readonly presetPhases: PhaseName[] | undefined;
  private readonly reviseFn: ((feedback: string) => Promise<PhaseExecutionResult>) | null;

  /**
   * @param phaseName - フェーズ名
   * @param metadata - メタデータマネージャー
   * @param github - GitHub クライアント
   * @param stepExecutor - ステップ実行マネージャー
   * @param skipDependencyCheck - 依存関係検証をスキップするか
   * @param ignoreDependencies - 依存関係違反を無視するか
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
    this.presetPhases = presetPhases;
    this.reviseFn = reviseFn;
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

    // 依存関係検証
    const dependencyResult = this.validateDependencies();
    if (!dependencyResult.valid) {
      const error =
        dependencyResult.error ??
        'Dependency validation failed. Use --skip-dependency-check to bypass.';
      logger.error(`${error}`);
      await this.handleFailure(error);
      return false;
    }

    if (dependencyResult.warning) {
      logger.warn(`${dependencyResult.warning}`);
    }

    // ステータス更新: pending → in_progress
    this.updatePhaseStatus('in_progress');
    await this.postProgress('in_progress', `${this.phaseName} フェーズを開始します。`);

    try {
      // Execute Step
      const executeResult = await this.stepExecutor.executeStep(gitManager);
      if (!executeResult.success) {
        await this.handleFailure(executeResult.error ?? 'Unknown execute error');
        return false;
      }

      // Review Step（if enabled）
      if (!options.skipReview) {
        const reviewResult = await this.stepExecutor.reviewStep(gitManager, false);
        if (!reviewResult.success) {
          // Revise Step（if review failed）
          if (!this.reviseFn) {
            logger.error(`Phase ${this.phaseName}: revise() method not implemented.`);
            await this.handleFailure('revise() method not implemented');
            return false;
          }

          await this.stepExecutor.reviseStep(
            gitManager,
            reviewResult,
            this.reviseFn,
            async (status: PhaseStatus, details?: string) => this.postProgress(status, details)
          );
        }
      }

      // フェーズ完了
      this.updatePhaseStatus('completed');
      await this.postProgress('completed', `${this.phaseName} フェーズが完了しました。`);

      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      await this.handleFailure(message);
      return false;
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
      presetPhases: this.presetPhases,
    });
  }

  /**
   * フェーズ失敗時の処理
   *
   * @param reason - 失敗理由
   *
   * @example
   * ```typescript
   * await phaseRunner.handleFailure('Execute step failed: some error');
   * ```
   */
  private async handleFailure(reason: string): Promise<void> {
    this.updatePhaseStatus('failed');
    await this.postProgress(
      'failed',
      `${this.phaseName} フェーズでエラーが発生しました: ${reason}`
    );
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
}
