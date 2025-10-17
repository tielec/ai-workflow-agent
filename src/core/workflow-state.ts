import fs from 'fs-extra';
import { dirname, join } from 'node:path';
import { resolveProjectPath } from './path-utils.js';
import {
  PhaseMetadata,
  PhaseName,
  PhaseStatus,
  WorkflowMetadata,
  PhasesMetadata,
  EvaluationPhaseMetadata,
} from '../types.js';

const formatTimestampForFilename = (date = new Date()): string => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') +
    '_' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
};

const METADATA_TEMPLATE_PATH = resolveProjectPath('metadata.json.template');

export class WorkflowState {
  public readonly metadataPath: string;
  public data: WorkflowMetadata;

  private constructor(metadataPath: string, data: WorkflowMetadata) {
    this.metadataPath = metadataPath;
    this.data = data;
  }

  public static createNew(
    metadataPath: string,
    issueNumber: string,
    issueUrl: string,
    issueTitle: string,
  ): WorkflowState {
    if (!fs.existsSync(METADATA_TEMPLATE_PATH)) {
      throw new Error(
        `Template file not found: ${METADATA_TEMPLATE_PATH}`,
      );
    }

    const initialData = fs.readJsonSync(
      METADATA_TEMPLATE_PATH,
    ) as WorkflowMetadata;

    const nowIso = new Date().toISOString();
    initialData.issue_number = issueNumber;
    initialData.issue_url = issueUrl;
    initialData.issue_title = issueTitle;
    initialData.created_at = nowIso;
    initialData.updated_at = nowIso;

    fs.ensureDirSync(dirname(metadataPath));
    fs.writeJsonSync(metadataPath, initialData, { spaces: 2 });

    return new WorkflowState(metadataPath, initialData);
  }

  public static load(metadataPath: string): WorkflowState {
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`metadata.json not found: ${metadataPath}`);
    }

    const data = fs.readJsonSync(metadataPath) as WorkflowMetadata;
    return new WorkflowState(metadataPath, data);
  }

  public save(): void {
    this.data.updated_at = new Date().toISOString();
    fs.writeJsonSync(this.metadataPath, this.data, { spaces: 2 });
  }

  public updatePhaseStatus(phase: PhaseName, status: PhaseStatus): void {
    const phases = this.data.phases;
    if (!(phase in phases)) {
      throw new Error(`Unknown phase: ${phase}`);
    }

    const phaseData = phases[phase];
    phaseData.status = status;

    const nowIso = new Date().toISOString();
    if (status === 'in_progress') {
      phaseData.started_at = nowIso;
    } else if (status === 'completed' || status === 'failed') {
      phaseData.completed_at = nowIso;
    }

    this.data.current_phase = phase;
  }

  public incrementRetryCount(phase: PhaseName): number {
    const phases = this.data.phases;
    if (!(phase in phases)) {
      throw new Error(`Unknown phase: ${phase}`);
    }

    const current = phases[phase].retry_count;
    if (current >= 3) {
      throw new Error(`Max retry count exceeded for phase: ${phase}`);
    }

    phases[phase].retry_count = current + 1;
    return phases[phase].retry_count;
  }

  public setDesignDecision(key: string, value: string): void {
    if (!(key in this.data.design_decisions)) {
      throw new Error(`Unknown design decision key: ${key}`);
    }

    this.data.design_decisions[key] = value;
  }

  public getPhaseStatus(phase: PhaseName): PhaseStatus {
    const phases = this.data.phases;
    if (!(phase in phases)) {
      throw new Error(`Unknown phase: ${phase}`);
    }

    return phases[phase].status;
  }

  public migrate(): boolean {
    if (!fs.existsSync(METADATA_TEMPLATE_PATH)) {
      console.warn(`[WARNING] Template file not found: ${METADATA_TEMPLATE_PATH}`);
      return false;
    }

    const template = fs.readJsonSync(
      METADATA_TEMPLATE_PATH,
    ) as WorkflowMetadata;
    const phases = this.data.phases as PhasesMetadata;
    let migrated = false;

    // Add missing phases preserving template order.
    const newPhases = {} as PhasesMetadata;
    let phasesChanged = false;
    for (const phaseName of Object.keys(template.phases) as PhaseName[]) {
      const templatePhaseData = template.phases[phaseName];

      if (phaseName in phases) {
        const existingPhase = phases[phaseName];
        if (phaseName === 'evaluation') {
          newPhases.evaluation = existingPhase as EvaluationPhaseMetadata;
        } else {
          newPhases[phaseName] = existingPhase as PhaseMetadata;
        }
      } else {
        console.info(`[INFO] Migrating metadata.json: Adding ${phaseName} phase`);
        if (phaseName === 'evaluation') {
          newPhases.evaluation = templatePhaseData as EvaluationPhaseMetadata;
        } else {
          newPhases[phaseName] = templatePhaseData as PhaseMetadata;
        }
        migrated = true;
        phasesChanged = true;
      }
    }

    if (phasesChanged) {
      this.data.phases = newPhases;
    }

    // Design decisions
    if (!this.data.design_decisions) {
      console.info('[INFO] Migrating metadata.json: Adding design_decisions');
      this.data.design_decisions = { ...template.design_decisions };
      migrated = true;
    } else {
      for (const key of Object.keys(template.design_decisions)) {
        if (!(key in this.data.design_decisions)) {
          console.info(
            `[INFO] Migrating metadata.json: Adding design_decisions.${key}`,
          );
          this.data.design_decisions[key] = null;
          migrated = true;
        }
      }
    }

    // Cost tracking
    if (!this.data.cost_tracking) {
      console.info('[INFO] Migrating metadata.json: Adding cost_tracking');
      this.data.cost_tracking = { ...template.cost_tracking };
      migrated = true;
    }

    // Workflow version
    if (!this.data.workflow_version) {
      console.info('[INFO] Migrating metadata.json: Adding workflow_version');
      this.data.workflow_version = template.workflow_version;
      migrated = true;
    }

    // Target repository (Issue #369)
    if (!('target_repository' in this.data)) {
      console.info('[INFO] Migrating metadata.json: Adding target_repository');
      this.data.target_repository = null;
      migrated = true;
    }

    // Issue #10: ステップ管理フィールドのマイグレーション
    for (const [phaseName, phaseData] of Object.entries(phases)) {
      let phaseChanged = false;

      // current_stepフィールドの追加
      if (!('current_step' in phaseData)) {
        console.info(`[INFO] Migrating metadata.json: Adding current_step to ${phaseName}`);
        phaseData.current_step = null;
        phaseChanged = true;
      }

      // completed_stepsフィールドの追加
      if (!('completed_steps' in phaseData)) {
        console.info(`[INFO] Migrating metadata.json: Adding completed_steps to ${phaseName}`);

        // ステータスに応じて初期値を設定
        if (phaseData.status === 'completed') {
          phaseData.completed_steps = ['execute', 'review', 'revise'];
        } else if (phaseData.status === 'in_progress') {
          phaseData.completed_steps = [];
          phaseData.current_step = 'execute';
        } else {
          phaseData.completed_steps = [];
        }

        phaseChanged = true;
      }

      if (phaseChanged) {
        migrated = true;
      }
    }

    if (migrated) {
      // バックアップ作成
      const timestamp = formatTimestampForFilename();
      const backupPath = join(dirname(this.metadataPath), `metadata.json.backup_${timestamp}`);
      fs.copyFileSync(this.metadataPath, backupPath);
      console.info(`[INFO] Metadata backup created: ${backupPath}`);

      this.save();
      console.info('[OK] metadata.json migrated successfully');
    }

    return migrated;
  }
}
