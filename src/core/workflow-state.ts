import { getFsExtra } from '../utils/fs-proxy.js';
import {
  existsSync as nodeExistsSync,
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  mkdirSync as nodeMkdirSync,
  copyFileSync as nodeCopyFileSync,
} from 'node:fs';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { basename, dirname, join } from 'node:path';
import { resolveProjectPath } from './path-utils.js';
import {
  PhaseMetadata,
  PhaseName,
  PhaseStatus,
  WorkflowMetadata,
  PhasesMetadata,
  EvaluationPhaseMetadata,
} from '../types.js';

const fs = getFsExtra();

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
const DEFAULT_METADATA_TEMPLATE: WorkflowMetadata = {
  issue_number: '',
  issue_url: '',
  issue_title: '',
  repository: null,
  target_repository: null,
  workflow_version: '1.0.0',
  current_phase: 'planning',
  design_decisions: {
    implementation_strategy: null,
    test_strategy: null,
    test_code_strategy: null,
  },
  cost_tracking: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
  },
  difficulty_analysis: null,
  model_config: null,
  phases: {
    planning: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    requirements: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    design: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_scenario: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    testing: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    documentation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    report: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    evaluation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
      decision: null,
      failed_phase: null,
      remaining_tasks: [],
      created_issue_url: null,
      abort_reason: null,
    },
  },
  created_at: '',
  updated_at: '',
};

const safeExistsSync = (filePath: string): boolean => {
  if (typeof fs.existsSync === 'function') {
    return fs.existsSync(filePath);
  }
  if (typeof (fs as any).pathExistsSync === 'function') {
    return (fs as any).pathExistsSync(filePath);
  }
  return nodeExistsSync(filePath);
};

const safeReadFileSync = (filePath: string): string => {
  if (typeof fs.readFileSync === 'function') {
    const result = fs.readFileSync(filePath, 'utf-8') as string | undefined;
    if (result === undefined || result === null) {
      return '{}';
    }
    return result;
  }
  return nodeReadFileSync(filePath, 'utf-8');
};

const safeWriteFileSync = (filePath: string, data: string): void => {
  if (typeof (fs as any).writeFileSync === 'function') {
    (fs as any).writeFileSync(filePath, data);
    return;
  }
  nodeWriteFileSync(filePath, data);
};

const safeEnsureDirSync = (dirPath: string): void => {
  if (typeof (fs as any).ensureDirSync === 'function') {
    (fs as any).ensureDirSync(dirPath);
    return;
  }
  if (!safeExistsSync(dirPath)) {
    nodeMkdirSync(dirPath, { recursive: true });
  }
};

const safeCopyFileSync = (src: string, dest: string): void => {
  if (typeof (fs as any).copyFileSync === 'function') {
    (fs as any).copyFileSync(src, dest);
    return;
  }
  nodeCopyFileSync(src, dest);
};

function readJsonSafe(filePath: string): any {
  const readJson = (fs as any).readJsonSync as ((path: string) => unknown) | undefined;
  if (typeof readJson === 'function') {
    try {
      const result = readJson(filePath);
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      logger.warn(`readJsonSync failed for ${filePath}: ${getErrorMessage(error)}`);
    }
  }
  const raw = safeReadFileSync(filePath);
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeJsonSafe(filePath: string, data: unknown): void {
  const writeFile =
    (fs as any).writeFileSync as
    | ((path: string, value: string, options?: any) => void)
    | undefined;
  const writeJson =
    (fs as any).writeJsonSync as
    | ((path: string, value: unknown, options?: any) => void)
    | undefined;

  if (typeof writeFile === 'function') {
    try {
      writeFile(filePath, JSON.stringify(data, null, 2));
      return;
    } catch {
      // fallback below
    }
  }

  if (typeof writeJson === 'function') {
    writeJson(filePath, data, { spaces: 2 });
    return;
  }

  safeWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadTemplateData(): WorkflowMetadata {
  try {
    if (safeExistsSync(METADATA_TEMPLATE_PATH)) {
      return readJsonSafe(METADATA_TEMPLATE_PATH) as WorkflowMetadata;
    }
  } catch (error) {
    logger.warn(`Failed to read metadata template: ${getErrorMessage(error)}`);
  }

  logger.warn(`Template file not found: ${METADATA_TEMPLATE_PATH}. Using built-in defaults.`);
  return JSON.parse(JSON.stringify(DEFAULT_METADATA_TEMPLATE)) as WorkflowMetadata;
}

function normalizeMetadata(
  template: WorkflowMetadata,
  issueNumber: string,
  issueUrl: string,
  issueTitle: string,
): WorkflowMetadata {
  const parsedIssueNumber = Number(issueNumber);
  const issueNumberCompat = Number.isNaN(parsedIssueNumber) ? issueNumber : parsedIssueNumber;

  const mergedPhases = {
    ...DEFAULT_METADATA_TEMPLATE.phases,
    ...(template.phases ?? {}),
  } as PhasesMetadata;

  const normalized: WorkflowMetadata = {
    ...DEFAULT_METADATA_TEMPLATE,
    ...template,
    phases: mergedPhases,
    issue_number: issueNumber,
    issue_url: issueUrl,
    issue_title: issueTitle,
  };

  // Backward compatibility for camelCase consumers
  (normalized as any).issueNumber = issueNumberCompat;
  (normalized as any).issueUrl = issueUrl;
  (normalized as any).issueTitle = issueTitle;

  return normalized;
}

/**
 * メタデータパスからIssue情報を推測する（ファイルが存在しない場合のフォールバック用）
 */
function deriveIssueInfo(metadataPath: string): { issueNumber: string; issueUrl: string; issueTitle: string } {
  const match = metadataPath.match(/issue-(\d+)/);
  const issueNumber = match ? match[1] : 'unknown';
  return {
    issueNumber,
    issueUrl: issueNumber !== 'unknown' ? `https://github.com/unknown/unknown/issues/${issueNumber}` : '',
    issueTitle: issueNumber !== 'unknown' ? `Issue #${issueNumber}` : 'Unknown Issue',
  };
}

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
    const template = loadTemplateData();
    const initialData = normalizeMetadata(template, issueNumber, issueUrl, issueTitle);

    const nowIso = new Date().toISOString();
    initialData.created_at = nowIso;
    initialData.updated_at = nowIso;

    safeEnsureDirSync(dirname(metadataPath));
    writeJsonSafe(metadataPath, initialData);

    return new WorkflowState(metadataPath, initialData);
  }

  public static load(metadataPath: string): WorkflowState {
    if (!safeExistsSync(metadataPath)) {
      logger.warn(`metadata.json not found: ${metadataPath}. Creating from template for compatibility.`);
      const { issueNumber, issueUrl, issueTitle } = deriveIssueInfo(metadataPath);
      return WorkflowState.createNew(
        metadataPath,
        issueNumber,
        issueUrl,
        issueTitle,
      );
    }

    const data = readJsonSafe(metadataPath) as WorkflowMetadata;
    const normalized = normalizeMetadata(
      data,
      data.issue_number ?? deriveIssueInfo(metadataPath).issueNumber,
      data.issue_url ?? deriveIssueInfo(metadataPath).issueUrl,
      data.issue_title ?? deriveIssueInfo(metadataPath).issueTitle,
    );
    return new WorkflowState(metadataPath, normalized);
  }

  public save(): void {
    this.data.updated_at = new Date().toISOString();
    writeJsonSafe(this.metadataPath, this.data);
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
    const template = loadTemplateData();
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
        logger.info(`Migrating metadata.json: Adding ${phaseName} phase`);
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
      logger.info('Migrating metadata.json: Adding design_decisions');
      this.data.design_decisions = { ...template.design_decisions };
      migrated = true;
    } else {
      for (const key of Object.keys(template.design_decisions)) {
        if (!(key in this.data.design_decisions)) {
          logger.info(
            `Migrating metadata.json: Adding design_decisions.${key}`,
          );
          this.data.design_decisions[key] = null;
          migrated = true;
        }
      }
    }

    // Cost tracking
    if (!this.data.cost_tracking) {
      logger.info('Migrating metadata.json: Adding cost_tracking');
      this.data.cost_tracking = { ...template.cost_tracking };
      migrated = true;
    }

    // Workflow version
    if (!this.data.workflow_version) {
      logger.info('Migrating metadata.json: Adding workflow_version');
      this.data.workflow_version = template.workflow_version;
      migrated = true;
    }

    // Target repository (Issue #369)
    if (!('target_repository' in this.data)) {
      logger.info('Migrating metadata.json: Adding target_repository');
      this.data.target_repository = null;
      migrated = true;
    }

    // Difficulty analysis / model config (Issue #363)
    if (!('difficulty_analysis' in this.data)) {
      logger.info('Migrating metadata.json: Adding difficulty_analysis');
      (this.data as WorkflowMetadata).difficulty_analysis = null;
      migrated = true;
    }
    if (!('model_config' in this.data)) {
      logger.info('Migrating metadata.json: Adding model_config');
      (this.data as WorkflowMetadata).model_config = null;
      migrated = true;
    }

    // Issue #10: ステップ管理フィールドのマイグレーション
    for (const [phaseName, phaseData] of Object.entries(phases)) {
      let phaseChanged = false;

      // current_stepフィールドの追加
      if (!('current_step' in phaseData)) {
        logger.info(`Migrating metadata.json: Adding current_step to ${phaseName}`);
        phaseData.current_step = null;
        phaseChanged = true;
      }

      // completed_stepsフィールドの追加
      if (!('completed_steps' in phaseData)) {
        logger.info(`Migrating metadata.json: Adding completed_steps to ${phaseName}`);

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
      const metadataFileName = basename(this.metadataPath);
      const backupPath = join(
        dirname(this.metadataPath),
        `${metadataFileName}.backup_${timestamp}`,
      );
      safeCopyFileSync(this.metadataPath, backupPath);
      logger.info(`Metadata backup created: ${backupPath}`);

      this.save();
      logger.info('metadata.json migrated successfully');
    }

    return migrated;
  }
}
