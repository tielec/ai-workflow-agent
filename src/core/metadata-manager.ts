import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { dirname, join } from 'node:path';
import { WorkflowState } from './workflow-state.js';
import {
  PhaseName,
  PhaseStatus,
  StepName,
  WorkflowMetadata,
  RemainingTask,
} from '../types.js';
import { formatTimestampForFilename, backupMetadataFile, removeWorkflowDirectory } from './helpers/metadata-io.js';

export class MetadataManager {
  public readonly metadataPath: string;
  public readonly workflowDir: string;
  private readonly state: WorkflowState;

  constructor(metadataPath: string) {
    this.metadataPath = metadataPath;
    this.workflowDir = dirname(metadataPath);
    this.state = WorkflowState.load(metadataPath);
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
    this.state.updatePhaseStatus(phaseName, status);

    if (options.outputFile) {
      const phaseData = this.state.data.phases[phaseName];
      if (!phaseData.output_files) {
        phaseData.output_files = [];
      }
      phaseData.output_files.push(options.outputFile);
    }

    if (options.reviewResult) {
      this.state.data.phases[phaseName].review_result = options.reviewResult;
    }

    this.state.save();
  }

  public addCost(inputTokens: number, outputTokens: number, costUsd: number): void {
    const tracking = this.state.data.cost_tracking;
    tracking.total_input_tokens += inputTokens;
    tracking.total_output_tokens += outputTokens;
    tracking.total_cost_usd += costUsd;
    this.state.save();
  }

  public getPhaseStatus(phaseName: PhaseName): PhaseStatus {
    return this.state.getPhaseStatus(phaseName);
  }

  public setDesignDecision(key: string, value: string): void {
    this.state.setDesignDecision(key, value);
    this.state.save();
  }

  public incrementRetryCount(phaseName: PhaseName): number {
    const count = this.state.incrementRetryCount(phaseName);
    this.state.save();
    return count;
  }

  public clear(): void {
    if (fs.existsSync(this.metadataPath)) {
      logger.info(`Clearing metadata: ${this.metadataPath}`);
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
      const phaseData = this.state.data.phases[phase];
      phaseData.status = 'pending';
      phaseData.started_at = null;
      phaseData.completed_at = null;
      phaseData.review_result = null;
      phaseData.retry_count = 0;
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
    const evaluation = this.state.data.phases.evaluation;
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
    const phaseData = this.state.data.phases[phaseName];
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
    const phaseData = this.state.data.phases[phaseName];
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
    const phaseData = this.state.data.phases[phaseName];
    return phaseData.completed_steps ?? [];
  }

  /**
   * Issue #10: current_stepを取得
   */
  public getCurrentStep(phaseName: PhaseName): StepName | null {
    const phaseData = this.state.data.phases[phaseName];
    return phaseData.current_step ?? null;
  }
}
