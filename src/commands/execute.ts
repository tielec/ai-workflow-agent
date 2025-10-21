import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';

import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { ClaudeAgentClient } from '../core/claude-agent-client.js';
import { CodexAgentClient } from '../core/codex-agent-client.js';
import { GitHubClient } from '../core/github-client.js';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  validateExternalDocument,
} from '../core/phase-dependencies.js';
import { ResumeManager } from '../utils/resume.js';
import { PhaseName } from '../types.js';
import { findWorkflowMetadata, getRepoRoot } from '../core/repository-utils.js';
import type { PhaseContext, ExecutionSummary, PhaseResultMap } from '../types/commands.js';

import { PlanningPhase } from '../phases/planning.js';
import { RequirementsPhase } from '../phases/requirements.js';
import { DesignPhase } from '../phases/design.js';
import { TestScenarioPhase } from '../phases/test-scenario.js';
import { ImplementationPhase } from '../phases/implementation.js';
import { TestImplementationPhase } from '../phases/test-implementation.js';
import { TestingPhase } from '../phases/testing.js';
import { DocumentationPhase } from '../phases/documentation.js';
import { ReportPhase } from '../phases/report.js';
import { EvaluationPhase } from '../phases/evaluation.js';

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

/**
 * フェーズ実行コマンドハンドラ
 * @param options - CLI オプション
 */
export async function handleExecuteCommand(options: any): Promise<void> {
  const issueNumber = String(options.issue);
  const phaseOption: string = (options.phase ?? 'all').toLowerCase();
  const presetOption: string | undefined = options.preset;
  const skipDependencyCheck = Boolean(options.skipDependencyCheck);
  const ignoreDependencies = Boolean(options.ignoreDependencies);
  const forceReset = Boolean(options.forceReset);
  const cleanupOnComplete = Boolean(options.cleanupOnComplete);
  const cleanupOnCompleteForce = Boolean(options.cleanupOnCompleteForce);

  if (presetOption && phaseOption !== 'all') {
    console.error("[ERROR] Options '--preset' and '--phase' are mutually exclusive.");
    process.exit(1);
  }

  if (!phaseOption && !presetOption) {
    console.error("[ERROR] Either '--phase' or '--preset' must be specified.");
    process.exit(1);
  }

  if (skipDependencyCheck && ignoreDependencies) {
    console.error(
      "[ERROR] Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive.",
    );
    process.exit(1);
  }

  // メタデータからリポジトリ情報を取得
  let repoRoot: string;
  let metadataPath: string;

  try {
    const result = await findWorkflowMetadata(issueNumber);
    repoRoot = result.repoRoot;
    metadataPath = result.metadataPath;
  } catch (error) {
    // フォールバック: 現在のリポジトリルートで試す
    const currentRepoRoot = await getRepoRoot();
    const fallbackMetadataPath = path.join(
      currentRepoRoot,
      '.ai-workflow',
      `issue-${issueNumber}`,
      'metadata.json',
    );

    if (fs.existsSync(fallbackMetadataPath)) {
      console.warn('[WARNING] Metadata found in current repository (legacy behavior).');
      repoRoot = currentRepoRoot;
      metadataPath = fallbackMetadataPath;
    } else {
      console.error('Error: Workflow not found. Run init first.');
      process.exit(1);
    }
  }

  let metadataManager = new MetadataManager(metadataPath);

  // メタデータから対象リポジトリ情報を取得
  const targetRepo = metadataManager.data.target_repository;
  if (targetRepo) {
    console.info(`[INFO] Target repository: ${targetRepo.github_name}`);
    console.info(`[INFO] Local path: ${targetRepo.path}`);
  } else {
    // 後方互換性: target_repositoryが存在しない場合は現在のリポジトリを使用
    console.warn('[WARNING] target_repository not found in metadata. Using current repository.');
  }

  if (options.gitUser) {
    process.env.GIT_COMMIT_USER_NAME = options.gitUser;
  }
  if (options.gitEmail) {
    process.env.GIT_COMMIT_USER_EMAIL = options.gitEmail;
  }

  if (options.requirementsDoc || options.designDoc || options.testScenarioDoc) {
    await loadExternalDocuments(
      {
        requirements: options.requirementsDoc,
        design: options.designDoc,
        test_scenario: options.testScenarioDoc,
      },
      metadataManager,
      repoRoot,
    );
  }

  if (forceReset) {
    console.info('[INFO] --force-reset specified. Restarting from Phase 1...');
    metadataManager = await resetMetadata(metadataManager, metadataPath, issueNumber);
  }

  // workingDirは対象リポジトリのパスを使用
  const workingDir = targetRepo?.path ?? repoRoot;
  const homeDir = process.env.HOME ?? null;

  const agentModeRaw = typeof options.agent === 'string' ? options.agent.toLowerCase() : 'auto';
  const agentMode: 'auto' | 'codex' | 'claude' =
    agentModeRaw === 'codex' || agentModeRaw === 'claude' ? agentModeRaw : 'auto';

  console.info(`[INFO] Agent mode: ${agentMode}`);

  const claudeCandidatePaths: string[] = [];
  if (process.env.CLAUDE_CODE_CREDENTIALS_PATH) {
    claudeCandidatePaths.push(process.env.CLAUDE_CODE_CREDENTIALS_PATH);
  }
  if (homeDir) {
    claudeCandidatePaths.push(path.join(homeDir, '.claude-code', 'credentials.json'));
  }
  claudeCandidatePaths.push(path.join(repoRoot, '.claude-code', 'credentials.json'));

  const claudeCredentialsPath =
    claudeCandidatePaths.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;

  let codexClient: CodexAgentClient | null = null;
  let claudeClient: ClaudeAgentClient | null = null;

  const codexApiKey = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY ?? null;

  switch (agentMode) {
    case 'codex': {
      if (!codexApiKey || !codexApiKey.trim()) {
        throw new Error(
          'Agent mode "codex" requires CODEX_API_KEY or OPENAI_API_KEY to be set with a valid Codex API key.',
        );
      }
      const trimmed = codexApiKey.trim();
      process.env.CODEX_API_KEY = trimmed;
      if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
        process.env.OPENAI_API_KEY = trimmed;
      }
      delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
      codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
      console.info('[INFO] Codex agent enabled (codex mode).');
      break;
    }
    case 'claude': {
      if (!claudeCredentialsPath) {
        throw new Error(
          'Agent mode "claude" requires Claude Code credentials.json to be available.',
        );
      }
      claudeClient = new ClaudeAgentClient({ workingDir, credentialsPath: claudeCredentialsPath });
      process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
      console.info('[INFO] Claude Code agent enabled (claude mode).');
      break;
    }
    case 'auto':
    default: {
      if (codexApiKey && codexApiKey.trim().length > 0) {
        const trimmed = codexApiKey.trim();
        process.env.CODEX_API_KEY = trimmed;
        if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
          process.env.OPENAI_API_KEY = trimmed;
        }
        codexClient = new CodexAgentClient({ workingDir, model: 'gpt-5-codex' });
        console.info('[INFO] Codex API key detected. Codex agent enabled (model=gpt-5-codex).');
      }

      if (claudeCredentialsPath) {
        if (!codexClient) {
          console.info('[INFO] Codex agent unavailable. Using Claude Code.');
        } else {
          console.info('[INFO] Claude Code credentials detected. Fallback available.');
        }
        claudeClient = new ClaudeAgentClient({ workingDir, credentialsPath: claudeCredentialsPath });
        process.env.CLAUDE_CODE_CREDENTIALS_PATH = claudeCredentialsPath;
      }
      break;
    }
  }

  if (!codexClient && !claudeClient) {
    console.error(
      `[ERROR] Agent mode "${agentMode}" requires a valid agent configuration, but neither Codex API key nor Claude Code credentials are available.`,
    );
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN ?? null;
  const repoName = metadataManager.data.repository ?? process.env.GITHUB_REPOSITORY ?? null;
  if (repoName) {
    metadataManager.data.repository = repoName;
  }
  const branchName = metadataManager.data.branch_name ?? `ai-workflow/issue-${issueNumber}`;
  if (!metadataManager.data.branch_name) {
    metadataManager.data.branch_name = branchName;
  }
  metadataManager.save();

  if (!githubToken || !repoName) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required.');
  }

  const githubClient = new GitHubClient(githubToken, repoName);

  const gitManager = new GitManager(repoRoot, metadataManager);

  const branchExists = await gitManager.branchExists(branchName);
  if (!branchExists) {
    console.error(`[ERROR] Branch not found: ${branchName}. Please run init first.`);
    process.exit(1);
  }

  const currentBranch = await gitManager.getCurrentBranch();
  if (currentBranch !== branchName) {
    const switchResult = await gitManager.switchBranch(branchName);
    if (!switchResult.success) {
      console.error(`[ERROR] ${switchResult.error ?? 'Failed to switch branch.'}`);
      process.exit(1);
    }
    console.info(`[INFO] Switched to branch: ${switchResult.branch_name}`);
  } else {
    console.info(`[INFO] Already on branch: ${branchName}`);
  }

  // uncommitted changesがある場合はpullをスキップ
  const status = await gitManager.getStatus();
  if (status.is_dirty) {
    console.info('[INFO] Uncommitted changes detected. Skipping git pull to avoid conflicts.');
  } else {
    const pullResult = await gitManager.pullLatest(branchName);
    if (!pullResult.success) {
      console.warn(
        `[WARNING] Failed to pull latest changes: ${pullResult.error ?? 'unknown error'}`,
      );
      console.warn('[WARNING] Continuing workflow execution...');
    } else {
      console.info('[OK] Successfully pulled latest changes.');
    }
  }

  const context: PhaseContext = {
    workingDir,
    metadataManager,
    codexClient,
    claudeClient,
    githubClient,
    skipDependencyCheck,
    ignoreDependencies,
  };

  if (presetOption !== undefined) {
    const resolved = resolvePresetName(presetOption);

    if (resolved.warning) {
      console.warn(resolved.warning);
    }

    if (!resolved.resolvedName) {
      // full-workflowの特殊ケース
      console.error('[ERROR] Please use --phase all instead.');
      process.exit(1);
    }

    const targetPhases = getPresetPhases(resolved.resolvedName);
    console.info(`[INFO] Running preset "${resolved.resolvedName}": ${targetPhases.join(', ')}`);

    // プリセット実行時はpresetPhasesをcontextに追加（Issue #396）
    const presetContext: PhaseContext = {
      ...context,
      presetPhases: targetPhases,
    };

    const summary = await executePhasesSequential(
      targetPhases,
      presetContext,
      gitManager,
      cleanupOnComplete,
      cleanupOnCompleteForce,
    );
    reportExecutionSummary(summary);
    process.exit(summary.success ? 0 : 1);
  }

  if (phaseOption === 'all') {
    const resumeManager = new ResumeManager(metadataManager);

    if (forceReset) {
      const summary = await executePhasesSequential(
        PHASE_ORDER,
        context,
        gitManager,
        cleanupOnComplete,
        cleanupOnCompleteForce,
      );
      reportExecutionSummary(summary);
      process.exit(summary.success ? 0 : 1);
    }

    if (canResumeWorkflow(resumeManager)) {
      const resumePhase = resumeManager.getResumePhase();
      if (!resumePhase) {
        console.info('[INFO] All phases are already completed.');
        console.info('[INFO] To re-run, use --force-reset flag.');
        process.exit(0);
      }

      const statusSummary = resumeManager.getStatusSummary();
      if (statusSummary.completed.length) {
        console.info(`[INFO] Completed phases: ${statusSummary.completed.join(', ')}`);
      }
      if (statusSummary.failed.length) {
        console.info(`[INFO] Failed phases: ${statusSummary.failed.join(', ')}`);
      }
      if (statusSummary.in_progress.length) {
        console.info(`[INFO] In-progress phases: ${statusSummary.in_progress.join(', ')}`);
      }
      console.info(`[INFO] Resuming from phase: ${resumePhase}`);

      const summary = await executePhasesFrom(
        resumePhase,
        context,
        gitManager,
        cleanupOnComplete,
        cleanupOnCompleteForce,
      );
      reportExecutionSummary(summary);
      process.exit(summary.success ? 0 : 1);
    }

    console.info('[INFO] Starting all phases execution.');
    const summary = await executePhasesSequential(
      PHASE_ORDER,
      context,
      gitManager,
      cleanupOnComplete,
      cleanupOnCompleteForce,
    );
    reportExecutionSummary(summary);
    process.exit(summary.success ? 0 : 1);
  }

  if (!isValidPhaseName(phaseOption)) {
    console.error(`Error: Unknown phase "${phaseOption}".`);
    process.exit(1);
  }

  const phaseName = phaseOption as PhaseName;
  const summary = await executePhasesSequential(
    [phaseName],
    context,
    gitManager,
    cleanupOnComplete,
    cleanupOnCompleteForce,
  );
  reportExecutionSummary(summary);
  process.exit(summary.success ? 0 : 1);
}

/**
 * フェーズを順次実行
 * @param phases - 実行するフェーズリスト
 * @param context - フェーズ実行コンテキスト
 * @param gitManager - Git管理インスタンス
 * @param cleanupOnComplete - 完了時クリーンアップフラグ
 * @param cleanupOnCompleteForce - クリーンアップ強制フラグ
 * @returns 実行サマリー
 */
export async function executePhasesSequential(
  phases: PhaseName[],
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary> {
  const results: PhaseResultMap = {} as PhaseResultMap;

  for (const phaseName of phases) {
    try {
      const phaseInstance = createPhaseInstance(phaseName, context);
      const success = await phaseInstance.run({
        gitManager,
        cleanupOnComplete,
        cleanupOnCompleteForce,
      });
      results[phaseName] = { success };
      if (!success) {
        return {
          success: false,
          failedPhase: phaseName,
          error: `Phase ${phaseName} failed.`,
          results,
        };
      }
    } catch (error) {
      results[phaseName] = { success: false, error: (error as Error).message };
      return {
        success: false,
        failedPhase: phaseName,
        error: (error as Error).message,
        results,
      };
    }
  }

  return { success: true, results };
}

/**
 * 特定フェーズから実行
 * @param startPhase - 開始フェーズ
 * @param context - フェーズ実行コンテキスト
 * @param gitManager - Git管理インスタンス
 * @param cleanupOnComplete - 完了時クリーンアップフラグ
 * @param cleanupOnCompleteForce - クリーンアップ強制フラグ
 * @returns 実行サマリー
 */
export async function executePhasesFrom(
  startPhase: PhaseName,
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary> {
  const startIndex = PHASE_ORDER.indexOf(startPhase);
  if (startIndex === -1) {
    return {
      success: false,
      failedPhase: startPhase,
      error: `Unknown phase: ${startPhase}`,
      results: {} as PhaseResultMap,
    };
  }

  const remainingPhases = PHASE_ORDER.slice(startIndex);
  return executePhasesSequential(
    remainingPhases,
    context,
    gitManager,
    cleanupOnComplete,
    cleanupOnCompleteForce,
  );
}

/**
 * フェーズインスタンスを作成
 * @param phaseName - フェーズ名
 * @param context - フェーズ実行コンテキスト
 * @returns フェーズインスタンス
 */
export function createPhaseInstance(phaseName: PhaseName, context: PhaseContext) {
  const baseParams = {
    workingDir: context.workingDir,
    metadataManager: context.metadataManager,
    codexClient: context.codexClient,
    claudeClient: context.claudeClient,
    githubClient: context.githubClient,
    skipDependencyCheck: context.skipDependencyCheck,
    ignoreDependencies: context.ignoreDependencies,
    presetPhases: context.presetPhases,
  };

  switch (phaseName) {
    case 'planning':
      return new PlanningPhase(baseParams);
    case 'requirements':
      return new RequirementsPhase(baseParams);
    case 'design':
      return new DesignPhase(baseParams);
    case 'test_scenario':
      return new TestScenarioPhase(baseParams);
    case 'implementation':
      return new ImplementationPhase(baseParams);
    case 'test_implementation':
      return new TestImplementationPhase(baseParams);
    case 'testing':
      return new TestingPhase(baseParams);
    case 'documentation':
      return new DocumentationPhase(baseParams);
    case 'report':
      return new ReportPhase(baseParams);
    case 'evaluation':
      return new EvaluationPhase(baseParams);
    default:
      throw new Error(`Unknown phase: ${phaseName}`);
  }
}

/**
 * プリセット名を解決（後方互換性対応）
 * @param presetName - プリセット名
 * @returns 解決結果（resolvedName, warning）
 */
export function resolvePresetName(presetName: string): {
  resolvedName: string;
  warning?: string;
} {
  // 現行プリセット名の場合
  if (PHASE_PRESETS[presetName]) {
    return { resolvedName: presetName };
  }

  // 非推奨プリセット名の場合
  if (DEPRECATED_PRESETS[presetName]) {
    const newName = DEPRECATED_PRESETS[presetName];

    // full-workflowの特殊ケース
    if (presetName === 'full-workflow') {
      return {
        resolvedName: '',
        warning: `[WARNING] Preset "${presetName}" is deprecated. Please use "--phase all" instead.`,
      };
    }

    // 通常の非推奨プリセット
    return {
      resolvedName: newName,
      warning: `[WARNING] Preset "${presetName}" is deprecated. Please use "${newName}" instead. This alias will be removed in 6 months.`,
    };
  }

  // 存在しないプリセット名
  throw new Error(
    `[ERROR] Unknown preset: ${presetName}. Use 'list-presets' command to see available presets.`,
  );
}

/**
 * プリセットのフェーズリストを取得
 * @param presetName - プリセット名
 * @returns フェーズリスト
 */
export function getPresetPhases(presetName: string): PhaseName[] {
  const phases = PHASE_PRESETS[presetName];
  if (!phases) {
    throw new Error(
      `Invalid preset: '${presetName}'. Available presets: ${Object.keys(PHASE_PRESETS).join(', ')}`,
    );
  }
  return phases as PhaseName[];
}

/**
 * ワークフロー再開可否を判定
 * @param resumeManager - レジュームマネージャ
 * @returns 再開可能かどうか
 */
export function canResumeWorkflow(resumeManager: ResumeManager): boolean {
  try {
    return resumeManager.canResume();
  } catch (error) {
    console.warn(
      `[WARNING] Failed to assess resume status: ${(error as Error).message}. Starting new workflow.`,
    );
    return false;
  }
}

/**
 * 外部ドキュメントを読み込み
 * @param docs - ドキュメントパス
 * @param metadataManager - メタデータマネージャ
 * @param repoRoot - リポジトリルート
 */
export async function loadExternalDocuments(
  docs: { requirements?: string; design?: string; test_scenario?: string },
  metadataManager: MetadataManager,
  repoRoot: string,
): Promise<void> {
  const externalDocs = metadataManager.data.external_documents ?? {};
  for (const [phase, docPath] of Object.entries(docs)) {
    if (!docPath) {
      continue;
    }
    const validation = validateExternalDocument(docPath, repoRoot);
    if (!validation.valid) {
      throw new Error(
        `Invalid external document for ${phase}: ${validation.error ?? 'unknown error'}`,
      );
    }
    externalDocs[phase] = validation.absolute_path ?? docPath;
  }
  metadataManager.data.external_documents = externalDocs;
  metadataManager.save();
}

/**
 * メタデータをリセット
 * @param metadataManager - メタデータマネージャ
 * @param metadataPath - メタデータパス
 * @param issueNumber - Issue番号
 * @returns リフレッシュされたメタデータマネージャ
 */
export async function resetMetadata(
  metadataManager: MetadataManager,
  metadataPath: string,
  issueNumber: string,
): Promise<MetadataManager> {
  const snapshot = {
    issueUrl: metadataManager.data.issue_url,
    issueTitle: metadataManager.data.issue_title,
    repository: metadataManager.data.repository ?? null,
  };

  metadataManager.clear();

  const { WorkflowState } = await import('../core/workflow-state.js');
  WorkflowState.createNew(
    metadataPath,
    issueNumber,
    snapshot.issueUrl ?? '',
    snapshot.issueTitle ?? `Issue #${issueNumber}`,
  );

  const refreshedManager = new MetadataManager(metadataPath);
  if (snapshot.repository) {
    refreshedManager.data.repository = snapshot.repository;
    refreshedManager.save();
  }
  return refreshedManager;
}

/**
 * 実行サマリーを報告
 * @param summary - 実行サマリー
 */
function reportExecutionSummary(summary: ExecutionSummary): void {
  if (summary.success) {
    console.info('[OK] All phases completed successfully.');
    return;
  }

  console.error(`[ERROR] Workflow failed at phase: ${summary.failedPhase ?? 'unknown phase'}`);
  if (summary.error) {
    console.error(`[ERROR] Reason: ${summary.error}`);
  }
}

/**
 * フェーズ名が有効かチェック
 * @param value - 検証する値
 * @returns 有効なフェーズ名かどうか
 */
function isValidPhaseName(value: string): value is PhaseName {
  return (PHASE_ORDER as string[]).includes(value);
}
