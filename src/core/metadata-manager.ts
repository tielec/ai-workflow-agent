import { getFsExtra } from '../utils/fs-proxy.js';
import { logger } from '../utils/logger.js';
import { dirname, join } from 'node:path';
import { WorkflowState } from './workflow-state.js';
import {
  PhaseName,
  PhaseStatus,
  StepName,
  WorkflowMetadata,
  RemainingTask,
  PhaseMetadata,
  EvaluationPhaseMetadata,
  DifficultyAnalysisResult,
  ModelConfigByPhase,
} from '../types.js';
import { formatTimestampForFilename, backupMetadataFile, removeWorkflowDirectory } from './helpers/metadata-io.js';

/**
 * フェーズの順序を定義
 * Object.keys() の順序は保証されないため、明示的な配列で順序を管理
 */
const PHASE_ORDER: PhaseName[] = [
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

const fs = getFsExtra();

export class MetadataManager {
  public readonly metadataPath: string;
  public readonly workflowDir: string;
  private readonly state: WorkflowState;

  constructor(metadataPath: string) {
    this.metadataPath = metadataPath;
    this.workflowDir = dirname(metadataPath);
    this.state = WorkflowState.load(metadataPath);
  }

  private normalizePhaseName(phaseName: PhaseName | string): PhaseName {
    const mapping: Record<string, PhaseName> = {
      '00_planning': 'planning',
      '01_requirements': 'requirements',
      '02_design': 'design',
      '03_test_scenario': 'test_scenario',
      '04_implementation': 'implementation',
      '05_test_implementation': 'test_implementation',
      '06_testing': 'testing',
      '07_documentation': 'documentation',
      '08_report': 'report',
      '09_evaluation': 'evaluation',
    };
    return (mapping[phaseName] ?? phaseName) as PhaseName;
  }

  private ensurePhaseData(
    phaseName: PhaseName,
  ): PhaseMetadata | EvaluationPhaseMetadata {
    let phaseData = this.state.data.phases[phaseName];
    if (phaseData) {
      return phaseData;
    }

    const migrated = this.state.migrate();
    phaseData = this.state.data.phases[phaseName];
    if (phaseData) {
      return phaseData;
    }

    logger.warn(`Phase ${phaseName} missing from metadata. Initializing default entry.`);
    if (phaseName === 'evaluation') {
      const evaluationData = this.createDefaultEvaluationPhaseMetadata();
      this.state.data.phases.evaluation = evaluationData;
      return evaluationData;
    }

    const defaultData = this.createDefaultPhaseMetadata();
    this.state.data.phases[phaseName] = defaultData;
    return defaultData;
  }

  private createDefaultPhaseMetadata(): PhaseMetadata {
    return {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
      output_files: [],
      current_step: null,
      completed_steps: [],
      rollback_context: null,
    };
  }

  private createDefaultEvaluationPhaseMetadata(): EvaluationPhaseMetadata {
    const base = this.createDefaultPhaseMetadata();
    return {
      ...base,
      decision: null,
      failed_phase: null,
      remaining_tasks: [],
      created_issue_url: null,
      abort_reason: null,
    };
  }

  public get data(): WorkflowMetadata {
    return this.state.data;
  }

  public save(): void {
    this.state.save();
  }

  public updatePhaseStatus(
    phaseName: PhaseName,
    status: PhaseStatus,
    options: {
      outputFile?: string;
      reviewResult?: string;
    } = {},
  ): void {
    const normalizedPhase = this.normalizePhaseName(phaseName);
    const phaseData = this.ensurePhaseData(normalizedPhase);
    const currentStatus = phaseData.status;

    // Issue #248: 冪等性チェック（同じステータスへの重複更新をスキップ）
    if (currentStatus === status) {
      logger.info(`Phase ${normalizedPhase}: Status already set to '${status}', skipping update`);
      return;
    }

    // Issue #248: ステータス遷移バリデーション（不正な遷移を検出）
    this.validateStatusTransition(normalizedPhase, currentStatus, status);

    // 既存のステータス更新処理
    this.state.updatePhaseStatus(normalizedPhase, status);

    if (options.outputFile) {
      if (!phaseData.output_files) {
        phaseData.output_files = [];
      }
      phaseData.output_files.push(options.outputFile);
    }

    if (options.reviewResult) {
      phaseData.review_result = options.reviewResult;
    }

    this.state.save();

    logger.debug(`Phase ${normalizedPhase}: Status updated from '${currentStatus}' to '${status}'`);
  }

  /**
   * Issue #248: ステータス遷移のバリデーション
   *
   * 不正なステータス遷移を検出してログ出力する。
   * 不正な遷移でもステータス更新は実行される（エラーにはしない）。
   *
   * 許可される遷移:
   * - pending → in_progress
   * - in_progress → completed
   * - in_progress → failed
   *
   * 不正な遷移の例:
   * - completed → in_progress
   * - failed → in_progress
   * - pending → completed
   *
   * @param phaseName - フェーズ名
   * @param fromStatus - 遷移元のステータス
   * @param toStatus - 遷移先のステータス
   * @private
   */
  private validateStatusTransition(
    phaseName: PhaseName,
    fromStatus: PhaseStatus,
    toStatus: PhaseStatus
  ): void {
    // 許可される遷移パターン
    const allowedTransitions: Record<PhaseStatus, PhaseStatus[]> = {
      pending: ['in_progress'],
      in_progress: ['completed', 'failed'],
      completed: [],  // completed からの遷移は通常許可されない
      failed: [],     // failed からの遷移は通常許可されない
    };

    const allowed = allowedTransitions[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      logger.warn(
        `Phase ${phaseName}: Invalid status transition detected: ` +
        `${fromStatus} -> ${toStatus}. ` +
        `Allowed transitions from '${fromStatus}': [${(allowed ?? []).join(', ')}]`
      );
    }
  }

  public addCost(inputTokens: number, outputTokens: number, costUsd: number): void {
    const tracking = this.state.data.cost_tracking;
    tracking.total_input_tokens += inputTokens;
    tracking.total_output_tokens += outputTokens;
    tracking.total_cost_usd += costUsd;
    this.state.save();
  }

  public setDifficultyAnalysis(result: DifficultyAnalysisResult | null): void {
    this.state.data.difficulty_analysis = result;
    this.state.save();
  }

  public getDifficultyAnalysis(): DifficultyAnalysisResult | null {
    return this.state.data.difficulty_analysis ?? null;
  }

  public setModelConfig(config: ModelConfigByPhase | null): void {
    this.state.data.model_config = config;
    this.state.save();
  }

  public getModelConfig(): ModelConfigByPhase | null {
    return this.state.data.model_config ?? null;
  }

  public getPhaseStatus(phaseName: PhaseName): PhaseStatus {
    return this.state.getPhaseStatus(this.normalizePhaseName(phaseName));
  }

  public setDesignDecision(key: string, value: string): void {
    this.state.setDesignDecision(key, value);
    this.state.save();
  }

  public incrementRetryCount(phaseName: PhaseName): number {
    const count = this.state.incrementRetryCount(this.normalizePhaseName(phaseName));
    this.state.save();
    return count;
  }

  public clear(): void {
    if (fs.existsSync(this.metadataPath)) {
      logger.info(`Clearing metadata: ${this.metadataPath}`);
      console.info(`[INFO] Clearing metadata: ${this.metadataPath}`);
      fs.removeSync(this.metadataPath);
    }

    removeWorkflowDirectory(this.workflowDir);
    if (!fs.existsSync(this.workflowDir)) {
      logger.info('Workflow directory removed successfully');
    }
  }

  public rollbackToPhase(phaseName: PhaseName) {
    const phases = Object.keys(this.state.data.phases) as PhaseName[];
    if (!phases.includes(phaseName)) {
      return {
        success: false,
        error: `Invalid phase name: ${phaseName}`,
        backup_path: null,
        rolled_back_phases: [] as PhaseName[],
      };
    }

    const backupPath = backupMetadataFile(this.metadataPath);

    const startIndex = phases.indexOf(phaseName);
    const rolledBack = phases.slice(startIndex);

    for (const phase of rolledBack) {
      const phaseData = this.ensurePhaseData(phase);
      phaseData.status = 'pending';
      phaseData.started_at = null;
      phaseData.completed_at = null;
      phaseData.review_result = null;
      phaseData.retry_count = 0;
      // Issue #208: completed_steps と current_step のリセット追加
      phaseData.current_step = null;
      phaseData.completed_steps = [];
      phaseData.rollback_context = null; // Issue #208: consistency確保
    }

    this.state.save();

    logger.info(`metadata.json rolled back to phase ${phaseName}`);
    logger.info(`Phases reset: ${rolledBack.join(', ')}`);

    return {
      success: true,
      backup_path: backupPath,
      rolled_back_phases: rolledBack,
      error: null,
    };
  }

  public getAllPhasesStatus(): Record<PhaseName, PhaseStatus> {
    const result = {} as Record<PhaseName, PhaseStatus>;
    for (const [phase, data] of Object.entries(this.state.data.phases)) {
      result[phase as PhaseName] = data.status;
    }
    return result;
  }

  public backupMetadata(): string {
    return backupMetadataFile(this.metadataPath);
  }

  public setEvaluationDecision(options: {
    decision: string;
    failedPhase?: PhaseName | null;
    remainingTasks?: RemainingTask[] | null;
    createdIssueUrl?: string | null;
    abortReason?: string | null;
  }): void {
    const evaluation = this.ensurePhaseData('evaluation') as EvaluationPhaseMetadata;
    if (!evaluation) {
      throw new Error('Evaluation phase not found in metadata');
    }

    evaluation.decision = options.decision;

    if (options.failedPhase !== undefined) {
      evaluation.failed_phase = options.failedPhase ?? null;
    }

    if (options.remainingTasks !== undefined) {
      evaluation.remaining_tasks = options.remainingTasks ?? [];
    }

    if (options.createdIssueUrl !== undefined) {
      evaluation.created_issue_url = options.createdIssueUrl ?? null;
    }

    if (options.abortReason !== undefined) {
      evaluation.abort_reason = options.abortReason ?? null;
    }

    this.state.save();
  }

  public saveProgressCommentId(commentId: number, commentUrl: string): void {
    if (!this.state.data.github_integration) {
      this.state.data.github_integration = {};
    }

    this.state.data.github_integration.progress_comment_id = commentId;
    this.state.data.github_integration.progress_comment_url = commentUrl;

    this.state.save();
  }

  public getProgressCommentId(): number | null {
    return this.state.data.github_integration?.progress_comment_id ?? null;
  }

  /**
   * Issue #10: ステップ開始時にcurrent_stepを更新
   */
  public updateCurrentStep(
    phaseName: PhaseName,
    step: StepName | null,
  ): void {
    const normalizedPhase = this.normalizePhaseName(phaseName);
    const phaseData = this.ensurePhaseData(normalizedPhase);
    phaseData.current_step = step;
    this.save();
  }

  /**
   * Issue #10: ステップ完了時にcompleted_stepsに追加
   */
  public addCompletedStep(
    phaseName: PhaseName,
    step: StepName,
  ): void {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    if (!phaseData.completed_steps) {
      phaseData.completed_steps = [];
    }

    // 重複チェック（冪等性の確保）
    if (!phaseData.completed_steps.includes(step)) {
      phaseData.completed_steps.push(step);
    }

    // current_stepをnullにリセット
    phaseData.current_step = null;
    this.save();
  }

  /**
   * Issue #10: completed_stepsを取得
   */
  public getCompletedSteps(phaseName: PhaseName): StepName[] {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    return phaseData.completed_steps ?? [];
  }

  /**
   * Issue #10: current_stepを取得
   */
  public getCurrentStep(phaseName: PhaseName): StepName | null {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    return phaseData.current_step ?? null;
  }

  /**
   * Issue #90: 差し戻しコンテキストを設定
   * @param phaseName - 対象フェーズ名
   * @param context - 差し戻しコンテキスト
   */
  public setRollbackContext(
    phaseName: PhaseName,
    context: import('../types/commands.js').RollbackContext,
  ): void {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    phaseData.rollback_context = context;
    this.save();

    logger.info(`Rollback context set for phase ${phaseName}`);
  }

  /**
   * Issue #90: 差し戻しコンテキストを取得
   * @param phaseName - 対象フェーズ名
   * @returns 差し戻しコンテキスト（存在しない場合は null）
   */
  public getRollbackContext(
    phaseName: PhaseName,
  ): import('../types/commands.js').RollbackContext | null {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    return phaseData.rollback_context ?? null;
  }

  /**
   * Issue #90: 差し戻しコンテキストをクリア
   * @param phaseName - 対象フェーズ名
   */
  public clearRollbackContext(phaseName: PhaseName): void {
    const phaseData = this.ensurePhaseData(this.normalizePhaseName(phaseName));
    phaseData.rollback_context = null;
    this.save();

    logger.info(`Rollback context cleared for phase ${phaseName}`);
  }

  /**
   * Issue #90: 差し戻し履歴を追加
   * @param entry - 差し戻し履歴エントリ
   */
  public addRollbackHistory(entry: import('../types/commands.js').RollbackHistoryEntry): void {
    if (!this.state.data.rollback_history) {
      this.state.data.rollback_history = [];
    }

    this.state.data.rollback_history.push(entry);
    this.save();

    logger.info(`Rollback history entry added: ${entry.to_phase} <- ${entry.from_phase ?? 'unknown'}`);
  }

  /**
   * Issue #208: フェーズの整合性チェック
   * @param phaseName - 対象フェーズ名
   * @returns 検証結果（valid: boolean, warnings: string[]）
   *
   * @description
   * - status と completed_steps の整合性をチェック
   * - 不整合検出時は警告ログを出力（エラーで停止しない）
   * - 検証パターン:
   *   1. status === 'pending' かつ completed_steps が存在
   *   2. status === 'completed' かつ completed_steps が空
   *   3. status === 'in_progress' かつ started_at === null
   */
  public validatePhaseConsistency(
    phaseName: PhaseName
  ): {
    valid: boolean;
    warnings: string[];
  } {
    const normalizedPhase = this.normalizePhaseName(phaseName);
    const phaseData = this.ensurePhaseData(normalizedPhase);
    const warnings: string[] = [];

    // パターン1: status === 'pending' かつ completed_steps が存在
    if (
      phaseData.status === 'pending' &&
      (phaseData.completed_steps ?? []).length > 0
    ) {
      warnings.push(
        `Phase ${normalizedPhase}: status is 'pending' but completed_steps is not empty ` +
        `(${JSON.stringify(phaseData.completed_steps)})`
      );
    }

    // パターン2: status === 'completed' かつ completed_steps が空
    if (
      phaseData.status === 'completed' &&
      (phaseData.completed_steps ?? []).length === 0
    ) {
      warnings.push(
        `Phase ${normalizedPhase}: status is 'completed' but completed_steps is empty`
      );
    }

    // パターン3: status === 'in_progress' かつ started_at === null
    if (
      phaseData.status === 'in_progress' &&
      phaseData.started_at === null
    ) {
      warnings.push(
        `Phase ${normalizedPhase}: status is 'in_progress' but started_at is null`
      );
    }

    // 警告ログ出力（エラーで停止しない）
    for (const warning of warnings) {
      logger.warn(warning);
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Issue #90: フェーズを差し戻し用に更新（status, current_step, completed_at, retry_count を変更）
   * @param phaseName - 対象フェーズ名
   * @param toStep - 差し戻し先ステップ（'execute' | 'review' | 'revise'）
   */
  public updatePhaseForRollback(phaseName: PhaseName, toStep: StepName): void {
    const normalizedPhase = this.normalizePhaseName(phaseName);
    // Issue #208: 整合性チェック（警告のみ、処理継続）
    this.validatePhaseConsistency(normalizedPhase);

    const phaseData = this.ensurePhaseData(normalizedPhase);

    phaseData.status = 'in_progress';
    phaseData.current_step = toStep;
    phaseData.completed_at = null;
    phaseData.retry_count = 0; // リトライカウンタをリセット（P1: PR #95レビューコメント対応）

    // completed_steps から toStep 以降のステップを削除
    // これにより、差し戻し先のステップが再実行される
    if (toStep === 'execute') {
      phaseData.completed_steps = [];
    } else if (toStep === 'review') {
      // execute は完了済みとして保持、review と revise を削除
      phaseData.completed_steps = (phaseData.completed_steps ?? []).filter(
        (step) => step === 'execute',
      );
    } else if (toStep === 'revise') {
      // execute と review は完了済みとして保持、revise を削除
      phaseData.completed_steps = (phaseData.completed_steps ?? []).filter(
        (step) => step === 'execute' || step === 'review',
      );
    }

    this.save();

    logger.info(`Phase ${normalizedPhase} updated for rollback: status=in_progress, current_step=${toStep}, completed_steps=${JSON.stringify(phaseData.completed_steps)}`);
  }

  /**
   * Issue #90: 後続フェーズをリセット（指定フェーズより後のすべてのフェーズを pending に戻す）
   * @param fromPhase - 起点となるフェーズ名
   * @returns リセットされたフェーズ名の配列
   */
  public resetSubsequentPhases(fromPhase: PhaseName): PhaseName[] {
    // PHASE_ORDER を使用して順序を保証（Object.keys の順序は保証されない）
    const startIndex = PHASE_ORDER.indexOf(fromPhase);

    if (startIndex === -1) {
      logger.warn(`Phase ${fromPhase} not found in PHASE_ORDER`);
      return [];
    }

    // 指定フェーズより後のフェーズをリセット
    const subsequentPhases = PHASE_ORDER.slice(startIndex + 1);

    for (const phase of subsequentPhases) {
      const phaseData = this.ensurePhaseData(phase);
      phaseData.status = 'pending';
      phaseData.started_at = null;
      phaseData.completed_at = null;
      phaseData.current_step = null;
      phaseData.completed_steps = [];
      phaseData.retry_count = 0;
      phaseData.rollback_context = null; // 既存の差し戻しコンテキストもクリア

      // Issue #208: 整合性チェック（警告のみ、処理継続）
      this.validatePhaseConsistency(phase);
    }

    this.save();

    logger.info(`Reset subsequent phases: ${subsequentPhases.join(', ')}`);
    return subsequentPhases;
  }

  /**
   * Issue #194: ワークフロー開始時のコミットハッシュを記録
   * @param commit - コミットハッシュ（40文字の16進数）
   */
  public setBaseCommit(commit: string): void {
    this.state.data.base_commit = commit;
    this.save();
    logger.debug(`Base commit set: ${commit}`);
  }

  /**
   * Issue #194: ワークフロー開始時のコミットハッシュを取得
   * @returns コミットハッシュ、未記録の場合null
   */
  public getBaseCommit(): string | null {
    return this.state.data.base_commit ?? null;
  }

  /**
   * Issue #194: スカッシュ前のコミットハッシュリストを記録
   * @param commits - コミットハッシュの配列
   */
  public setPreSquashCommits(commits: string[]): void {
    this.state.data.pre_squash_commits = commits;
    this.save();
    logger.debug(`Pre-squash commits set: ${commits.length} commits`);
  }

  /**
   * Issue #194: スカッシュ前のコミットハッシュリストを取得
   * @returns コミットハッシュの配列、未記録の場合null
   */
  public getPreSquashCommits(): string[] | null {
    return this.state.data.pre_squash_commits ?? null;
  }

  /**
   * Issue #194: スカッシュ完了時のタイムスタンプを記録
   * @param timestamp - ISO 8601形式のタイムスタンプ
   */
  public setSquashedAt(timestamp: string): void {
    this.state.data.squashed_at = timestamp;
    this.save();
    logger.debug(`Squashed at set: ${timestamp}`);
  }

  /**
   * Issue #194: スカッシュ完了時のタイムスタンプを取得
   * @returns タイムスタンプ、未記録の場合null
   */
  public getSquashedAt(): string | null {
    return this.state.data.squashed_at ?? null;
  }
}
