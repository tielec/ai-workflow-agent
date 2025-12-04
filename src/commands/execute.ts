import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';

import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { GitHubClient } from '../core/github-client.js';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  validateExternalDocument,
} from '../core/phase-dependencies.js';
import { ResumeManager } from '../utils/resume.js';
import { PhaseName, type IssueGenerationOptions } from '../types.js';
import { findWorkflowMetadata, getRepoRoot } from '../core/repository-utils.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { PhaseContext, ExecuteCommandOptions } from '../types/commands.js';

// 新規モジュールからインポート
import { validateExecuteOptions, parseExecuteOptions } from './execute/options-parser.js';
import { resolveAgentCredentials, setupAgentClients } from './execute/agent-setup.js';
import {
  executePhasesSequential,
  executePhasesFrom,
} from './execute/workflow-executor.js';

// phase-factory から createPhaseInstance を再エクスポート
export { createPhaseInstance } from '../core/phase-factory.js';
// workflow-executor から executePhasesSequential, executePhasesFrom を再エクスポート
export { executePhasesSequential, executePhasesFrom } from './execute/workflow-executor.js';

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

const DEFAULT_FOLLOWUP_LLM_OPTIONS: IssueGenerationOptions = {
  enabled: false,
  provider: 'auto',
  temperature: 0.2,
  maxOutputTokens: 1500,
  timeoutMs: 25000,
  maxRetries: 3,
  maxTasks: 5,
  appendMetadata: false,
};

/**
 * フェーズ実行コマンドハンドラ
 * @param options - CLI オプション
 */
export async function handleExecuteCommand(options: ExecuteCommandOptions): Promise<void> {
  // 1. オプション検証（options-parser に委譲）
  const validationResult = validateExecuteOptions(options);
  if (!validationResult.valid) {
    for (const error of validationResult.errors) {
      logger.error(error);
    }
    process.exit(1);
  }

  // 2. オプション解析（options-parser に委譲）
  const parsedOptions = parseExecuteOptions(options);
  const {
    issueNumber,
    phaseOption,
    presetOption,
    agentMode,
    skipDependencyCheck,
    ignoreDependencies,
    forceReset,
    cleanupOnComplete,
    cleanupOnCompleteForce,
    followupLlmMode,
    followupLlmModel,
    followupLlmTimeout,
    followupLlmMaxRetries,
    followupLlmAppendMetadata,
    squashOnComplete,
  } = parsedOptions;

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
      logger.warn('Metadata found in current repository (legacy behavior).');
      repoRoot = currentRepoRoot;
      metadataPath = fallbackMetadataPath;
    } else {
      logger.error('Workflow not found. Run init first.');
      process.exit(1);
    }
  }

  let metadataManager = new MetadataManager(metadataPath);

  // メタデータから対象リポジトリ情報を取得
  const targetRepo = metadataManager.data.target_repository;
  if (targetRepo) {
    logger.info(`Target repository: ${targetRepo.github_name}`);
    logger.info(`Local path: ${targetRepo.path}`);
  } else {
    // 後方互換性: target_repositoryが存在しない場合は現在のリポジトリを使用
    logger.warn('target_repository not found in metadata. Using current repository.');
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
    logger.info('--force-reset specified. Restarting from Phase 1...');
    metadataManager = await resetMetadata(metadataManager, metadataPath, issueNumber);
  }

  // workingDirは対象リポジトリのパスを使用
  const workingDir = targetRepo?.path ?? repoRoot;
  const homeDir = config.getHomeDir();

  logger.info(`Agent mode: ${agentMode}`);

  // 4. 認証情報解決（agent-setup に委譲）
  const credentials = resolveAgentCredentials(homeDir, repoRoot);

  // 5. エージェント初期化（agent-setup に委譲）
  const { codexClient, claudeClient } = setupAgentClients(agentMode, workingDir, credentials);

  if (!codexClient && !claudeClient) {
    logger.error(
      `Agent mode "${agentMode}" requires a valid agent configuration, but neither Codex API key nor Claude Code credentials are available.`,
    );
    process.exit(1);
  }

  const githubToken = config.getGitHubToken();
  const repoName = metadataManager.data.repository ?? config.getGitHubRepository() ?? null;
  if (repoName) {
    metadataManager.data.repository = repoName;
  }
  const branchName = metadataManager.data.branch_name ?? `ai-workflow/issue-${issueNumber}`;
  if (!metadataManager.data.branch_name) {
    metadataManager.data.branch_name = branchName;
  }
  metadataManager.save();

  if (!repoName) {
    throw new Error('GITHUB_REPOSITORY environment variable is required.');
  }

  // Issue #174: Pass agent clients to GitHubClient for agent-based FOLLOW-UP Issue generation
  const githubClient = new GitHubClient(githubToken, repoName, codexClient, claudeClient);

  // Issue #194: Pass agent clients to GitManager for squash commit message generation
  const gitManager = new GitManager(repoRoot, metadataManager, {}, codexClient, claudeClient);

  const branchExists = await gitManager.branchExists(branchName);
  if (!branchExists) {
    logger.error(`Branch not found: ${branchName}. Please run init first.`);
    process.exit(1);
  }

  const currentBranch = await gitManager.getCurrentBranch();
  if (currentBranch !== branchName) {
    const switchResult = await gitManager.switchBranch(branchName);
    if (!switchResult.success) {
      logger.error(`${switchResult.error ?? 'Failed to switch branch.'}`);
      process.exit(1);
    }
    logger.info(`Switched to branch: ${switchResult.branch_name}`);
  } else {
    logger.info(`Already on branch: ${branchName}`);
  }

  // uncommitted changesがある場合はpullをスキップ
  const status = await gitManager.getStatus();
  if (status.is_dirty) {
    logger.info('Uncommitted changes detected. Skipping git pull to avoid conflicts.');
  } else {
    const pullResult = await gitManager.pullLatest(branchName);
    if (!pullResult.success) {
      logger.warn(`Failed to pull latest changes: ${pullResult.error ?? 'unknown error'}`);
      logger.warn('Continuing workflow execution...');
    } else {
      logger.info('Successfully pulled latest changes.');
    }
  }

  const issueGenerationOptions = resolveIssueGenerationOptions({
    cliMode: followupLlmMode,
    cliModel: followupLlmModel,
    cliTimeout: followupLlmTimeout,
    cliMaxRetries: followupLlmMaxRetries,
    cliAppendMetadata: followupLlmAppendMetadata,
  });

  // 6. PhaseContext 構築
  const context: PhaseContext = {
    workingDir,
    metadataManager,
    codexClient,
    claudeClient,
    githubClient,
    skipDependencyCheck,
    ignoreDependencies,
    issueGenerationOptions,
    squashOnComplete,
    issueNumber: Number(issueNumber),
    issueInfo: {
      title: metadataManager.data.issue_title,
      body: metadataManager.data.issue_body,
    },
  };

  // 7. プリセット実行（workflow-executor に委譲）
  if (presetOption !== undefined) {
    const resolved = resolvePresetName(presetOption);

    if (resolved.warning) {
      logger.warn(resolved.warning);
    }

    if (!resolved.resolvedName) {
      // full-workflowの特殊ケース
      logger.error('Please use --phase all instead.');
      process.exit(1);
    }

    const targetPhases = getPresetPhases(resolved.resolvedName);
    logger.info(`Running preset "${resolved.resolvedName}": ${targetPhases.join(', ')}`);

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

  // 8. 全フェーズ実行またはレジューム（workflow-executor に委譲）
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
        logger.info('All phases are already completed.');
        logger.info('To re-run, use --force-reset flag.');
        process.exit(0);
      }

      const statusSummary = resumeManager.getStatusSummary();
      if (statusSummary.completed.length) {
        logger.info(`Completed phases: ${statusSummary.completed.join(', ')}`);
      }
      if (statusSummary.failed.length) {
        logger.info(`Failed phases: ${statusSummary.failed.join(', ')}`);
      }
      if (statusSummary.in_progress.length) {
        logger.info(`In-progress phases: ${statusSummary.in_progress.join(', ')}`);
      }
      logger.info(`Resuming from phase: ${resumePhase}`);

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

    logger.info('Starting all phases execution.');
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

  // 9. 単一フェーズ実行（workflow-executor に委譲）
  if (!isValidPhaseName(phaseOption)) {
    logger.error(`Unknown phase "${phaseOption}".`);
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

type FollowupCliOverrides = {
  cliMode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off';
  cliModel?: string;
  cliTimeout?: number;
  cliMaxRetries?: number;
  cliAppendMetadata?: boolean;
};

function resolveIssueGenerationOptions(overrides: FollowupCliOverrides): IssueGenerationOptions {
  const options: IssueGenerationOptions = { ...DEFAULT_FOLLOWUP_LLM_OPTIONS };

  const applyMode = (mode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off') => {
    if (!mode) {
      return;
    }
    if (mode === 'off') {
      options.enabled = false;
      options.provider = 'auto';
      return;
    }
    options.enabled = true;
    options.provider = mode;
  };

  applyMode(config.getFollowupLlmMode() ?? undefined);
  applyMode(overrides.cliMode);

  const envModel = config.getFollowupLlmModel();
  if (envModel) {
    options.model = envModel;
  }
  if (overrides.cliModel) {
    options.model = overrides.cliModel;
  }

  const envTimeout = config.getFollowupLlmTimeoutMs();
  if (typeof envTimeout === 'number') {
    options.timeoutMs = envTimeout;
  }
  if (typeof overrides.cliTimeout === 'number' && Number.isFinite(overrides.cliTimeout)) {
    options.timeoutMs = overrides.cliTimeout;
  }

  const envMaxRetries = config.getFollowupLlmMaxRetries();
  if (typeof envMaxRetries === 'number') {
    options.maxRetries = envMaxRetries;
  }
  if (typeof overrides.cliMaxRetries === 'number' && Number.isFinite(overrides.cliMaxRetries)) {
    options.maxRetries = overrides.cliMaxRetries;
  }

  const envAppendMetadata = config.getFollowupLlmAppendMetadata();
  if (typeof envAppendMetadata === 'boolean') {
    options.appendMetadata = envAppendMetadata;
  }
  if (typeof overrides.cliAppendMetadata === 'boolean') {
    options.appendMetadata = overrides.cliAppendMetadata;
  }

  const envTemperature = config.getFollowupLlmTemperature();
  if (typeof envTemperature === 'number') {
    options.temperature = envTemperature;
  }

  const envMaxOutputTokens = config.getFollowupLlmMaxOutputTokens();
  if (typeof envMaxOutputTokens === 'number') {
    options.maxOutputTokens = envMaxOutputTokens;
  }

  const envMaxTasks = config.getFollowupLlmMaxTasks();
  if (typeof envMaxTasks === 'number') {
    options.maxTasks = envMaxTasks;
  }

  const openAiKey = config.getOpenAiApiKey();
  const anthropicKey = config.getAnthropicApiKey();

  if (options.enabled) {
    if (options.provider === 'openai' && !openAiKey) {
      logger.warn(
        '[FOLLOWUP_LLM] OpenAI provider requested but OPENAI_API_KEY is not configured. Falling back to legacy template.',
      );
      options.enabled = false;
    } else if (options.provider === 'claude' && !anthropicKey) {
      logger.warn(
        '[FOLLOWUP_LLM] Claude provider requested but ANTHROPIC_API_KEY is not configured. Falling back to legacy template.',
      );
      options.enabled = false;
    } else if (options.provider === 'auto' && !openAiKey && !anthropicKey) {
      logger.warn(
        '[FOLLOWUP_LLM] Follow-up LLM mode is "auto" but no provider credentials were detected. Using legacy template.',
      );
      options.enabled = false;
    }
  }

  return options;
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
    logger.warn(
      `Failed to assess resume status: ${getErrorMessage(error)}. Starting new workflow.`,
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
 *
 * フェーズ実行完了後、成功または失敗をログに出力します。
 *
 * @param summary - 実行サマリー
 */
function reportExecutionSummary(summary: import('../types/commands.js').ExecutionSummary): void {
  if (summary.success) {
    logger.info('All phases completed successfully.');
    return;
  }

  logger.error(`Workflow failed at phase: ${summary.failedPhase ?? 'unknown phase'}`);
  if (summary.error) {
    logger.error(`Reason: ${summary.error}`);
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
