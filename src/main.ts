import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import fs from 'fs-extra';
import { Command, Option } from 'commander';
import simpleGit from 'simple-git';

import { WorkflowState } from './core/workflow-state.js';
import { MetadataManager } from './core/metadata-manager.js';
import { GitManager } from './core/git-manager.js';
import { ClaudeAgentClient } from './core/claude-agent-client.js';
import { CodexAgentClient } from './core/codex-agent-client.js';
import { GitHubClient } from './core/github-client.js';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
  validateExternalDocument,
} from './core/phase-dependencies.js';
import { ResumeManager } from './utils/resume.js';
import { PhaseExecutionResult, PhaseName } from './types.js';

import { PlanningPhase } from './phases/planning.js';
import { RequirementsPhase } from './phases/requirements.js';
import { DesignPhase } from './phases/design.js';
import { TestScenarioPhase } from './phases/test-scenario.js';
import { ImplementationPhase } from './phases/implementation.js';
import { TestImplementationPhase } from './phases/test-implementation.js';
import { TestingPhase } from './phases/testing.js';
import { DocumentationPhase } from './phases/documentation.js';
import { ReportPhase } from './phases/report.js';
import { EvaluationPhase } from './phases/evaluation.js';

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

type PhaseContext = {
  workingDir: string;
  metadataManager: MetadataManager;
  codexClient: CodexAgentClient | null;
  claudeClient: ClaudeAgentClient | null;
  githubClient: GitHubClient;
  skipDependencyCheck: boolean;
  ignoreDependencies: boolean;
  presetPhases?: PhaseName[]; // プリセット実行時のフェーズリスト（Issue #396）
};

type PhaseResultMap = Record<PhaseName, PhaseExecutionResult>;

type ExecutionSummary = {
  success: boolean;
  failedPhase?: PhaseName;
  error?: string;
  results: PhaseResultMap;
};

export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name('ai-workflow-v2')
    .description('TypeScript rewrite of the AI workflow automation toolkit')
    .version('0.1.0');

  program
    .command('init')
    .requiredOption('--issue-url <url>', 'GitHub Issue URL')
    .option('--branch <name>', 'Custom branch name (default: ai-workflow/issue-{issue_number})')
    .action(async (options) => {
      try {
        await handleInitCommand(options.issueUrl, options.branch);
      } catch (error) {
        reportFatalError(error);
      }
    });

  program
    .command('list-presets')
    .description('List available presets')
    .action(async () => {
      try {
        listPresets();
      } catch (error) {
        reportFatalError(error);
      }
    });

  program
    .command('execute')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--phase <name>', 'Phase name or "all"', 'all')
    .addOption(
      new Option('--preset <preset>', 'Execute preset workflow').choices(
        Object.keys(PHASE_PRESETS),
      ),
    )
    .option('--git-user <name>', 'Git commit user name')
    .option('--git-email <email>', 'Git commit user email')
    .option('--force-reset', 'Clear metadata and restart from Phase 1', false)
    .option('--skip-dependency-check', 'Skip all dependency checks', false)
    .option(
      '--ignore-dependencies',
      'Warn about dependency violations but continue',
      false,
    )
    .addOption(
      new Option('--agent <mode>', 'Agent mode').choices(['auto', 'codex', 'claude']).default('auto'),
    )
    .option('--requirements-doc <path>', 'External requirements document path')
    .option('--design-doc <path>', 'External design document path')
    .option('--test-scenario-doc <path>', 'External test scenario document path')
    .option(
      '--cleanup-on-complete',
      'Delete .ai-workflow directory after evaluation phase completes',
      false,
    )
    .option(
      '--cleanup-on-complete-force',
      'Skip confirmation prompt before cleanup (for CI environments)',
      false,
    )
    .action(async (options) => {
      try {
        await handleExecuteCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  program
    .command('review')
    .requiredOption('--phase <name>', 'Phase name')
    .requiredOption('--issue <number>', 'Issue number')
    .action(async (options) => {
      try {
        await handleReviewCommand(options);
      } catch (error) {
        reportFatalError(error);
      }
    });

  await program.parseAsync(process.argv);
}

/**
 * ブランチ名バリデーション結果
 */
interface BranchValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Gitブランチ名のバリデーション
 * git-check-ref-format の命名規則に基づく
 * @see https://git-scm.com/docs/git-check-ref-format
 * @param branchName - 検証するブランチ名
 * @returns バリデーション結果（valid: boolean, error?: string）
 */
function validateBranchName(branchName: string): BranchValidationResult {
  // 1. 空文字列チェック
  if (!branchName || branchName.trim() === '') {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  // 2. スラッシュの位置チェック
  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot start or end with "/"' };
  }

  // 3. 連続ドットチェック
  if (branchName.includes('..')) {
    return { valid: false, error: 'Branch name cannot contain ".."' };
  }

  // 4. 不正文字チェック（~, ^, :, ?, *, [, \, 空白、@{）
  const invalidChars = /[~^:?*[\\\s]|@\{/;
  if (invalidChars.test(branchName)) {
    return { valid: false, error: 'Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\, @{)' };
  }

  // 5. ドットで終わらないチェック
  if (branchName.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot end with "."' };
  }

  return { valid: true };
}

/**
 * ブランチ名を解決（デフォルト vs カスタム）
 * @param customBranch - CLI の --branch オプション値
 * @param issueNumber - Issue番号
 * @returns 解決されたブランチ名
 * @throws バリデーションエラー時はエラーをスロー
 */
function resolveBranchName(
  customBranch: string | undefined,
  issueNumber: number
): string {
  // 1. カスタムブランチ名が指定された場合
  if (customBranch) {
    // バリデーション
    const validation = validateBranchName(customBranch);
    if (!validation.valid) {
      throw new Error(`[ERROR] Invalid branch name: ${customBranch}. ${validation.error}`);
    }

    console.info(`[INFO] Using custom branch name: ${customBranch}`);
    return customBranch;
  }

  // 2. デフォルトブランチ名
  const defaultBranch = `ai-workflow/issue-${issueNumber}`;
  console.info(`[INFO] Using default branch name: ${defaultBranch}`);
  return defaultBranch;
}

async function handleInitCommand(issueUrl: string, customBranch?: string): Promise<void> {
  // Issue URLをパース
  let issueInfo: IssueInfo;
  try {
    issueInfo = parseIssueUrl(issueUrl);
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }

  const { owner, repo, issueNumber, repositoryName } = issueInfo;

  // ローカルリポジトリパスを解決
  let repoRoot: string;
  try {
    // まず現在のディレクトリがGitリポジトリか確認
    const currentRepoRoot = await getRepoRoot();

    // Gitリモート URL（origin）からリポジトリ名を抽出
    const git = simpleGit(currentRepoRoot);
    let currentRepoName: string | null = null;
    try {
      const remoteUrl = await git.remote(['get-url', 'origin']);
      const urlString = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();

      // URLからリポジトリ名を抽出
      // 例: https://github.com/tielec/infrastructure-as-code.git -> infrastructure-as-code
      // 例: git@github.com:tielec/infrastructure-as-code.git -> infrastructure-as-code
      const match = urlString.match(/\/([^\/]+?)(\.git)?$/);
      if (match) {
        currentRepoName = match[1];
      }
    } catch {
      // リモート URL取得失敗時はディレクトリ名をフォールバック
      currentRepoName = path.basename(currentRepoRoot);
    }

    // 現在のリポジトリ名が対象と一致する場合はそのまま使用
    if (currentRepoName === repo) {
      repoRoot = currentRepoRoot;
      console.info(`[INFO] Using current repository: ${repositoryName}`);
      console.info(`[INFO] Local path: ${repoRoot}`);
    } else {
      // 別のリポジトリを探索
      console.info(`[INFO] Current repository (${currentRepoName}) does not match target (${repo}). Searching...`);
      repoRoot = resolveLocalRepoPath(repo);
      console.info(`[INFO] Target repository: ${repositoryName}`);
      console.info(`[INFO] Local path: ${repoRoot}`);
    }
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }

  // ワークフローディレクトリ作成（対象リポジトリ配下）
  const workflowDir = path.join(repoRoot, '.ai-workflow', `issue-${issueNumber}`);
  const metadataPath = path.join(workflowDir, 'metadata.json');

  // ブランチ名を解決（カスタムまたはデフォルト）
  const branchName = resolveBranchName(customBranch, issueNumber);

  const git = simpleGit(repoRoot);

  // リモートブランチの存在確認
  await git.fetch();
  const remoteBranches = await git.branch(['-r']);
  const remoteBranchExists = remoteBranches.all.some(ref => ref.includes(`origin/${branchName}`));

  if (remoteBranchExists) {
    // リモートブランチが存在する場合: チェックアウト → pull → metadata確認
    console.info(`[INFO] Remote branch '${branchName}' found. Checking out...`);

    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branchName)) {
      await git.checkout(branchName);
      console.info(`[INFO] Switched to existing local branch: ${branchName}`);
    } else {
      await git.checkoutBranch(branchName, `origin/${branchName}`);
      console.info(`[INFO] Created local branch '${branchName}' tracking origin/${branchName}`);
    }

    // リモートの最新状態を取得
    console.info('[INFO] Pulling latest changes from remote...');
    await git.pull('origin', branchName, { '--no-rebase': null });
    console.info('[OK] Successfully pulled latest changes.');

    fs.ensureDirSync(workflowDir);

    if (fs.existsSync(metadataPath)) {
      console.info('[INFO] Workflow already exists. Migrating metadata schema if required...');
      const state = WorkflowState.load(metadataPath);
      const migrated = state.migrate();
      const metadataManager = new MetadataManager(metadataPath);
      metadataManager.data.branch_name = branchName;
      metadataManager.data.repository = repositoryName;

      // target_repository フィールドを設定
      const remoteUrl = await git.remote(['get-url', 'origin']);
      const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
      metadataManager.data.target_repository = {
        path: repoRoot,
        github_name: repositoryName,
        remote_url: remoteUrlStr,
        owner: owner,
        repo: repo,
      };
      metadataManager.save();
      console.info(
        migrated
          ? '[OK] Metadata schema updated successfully.'
          : '[INFO] Metadata schema already up to date.',
      );
      return;
    }

    // metadata.jsonが存在しない場合は作成（リモートブランチはあるが未初期化の状態）
    console.info('[INFO] Creating metadata for existing branch...');
  } else {
    // リモートブランチが存在しない場合: 新規作成
    console.info(`[INFO] Remote branch '${branchName}' not found. Creating new branch...`);

    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branchName)) {
      await git.checkout(branchName);
      console.info(`[INFO] Switched to existing local branch: ${branchName}`);
    } else {
      await git.checkoutLocalBranch(branchName);
      console.info(`[INFO] Created and switched to new branch: ${branchName}`);
    }

    fs.ensureDirSync(workflowDir);
    console.info('[INFO] Creating metadata...');
  }

  // metadata.json作成
  WorkflowState.createNew(
    metadataPath,
    String(issueNumber),
    issueUrl,
    `Issue #${issueNumber}`,
  );

  const metadataManager = new MetadataManager(metadataPath);
  metadataManager.data.branch_name = branchName;
  metadataManager.data.repository = repositoryName;

  // target_repository フィールドを設定
  const remoteUrl = await git.remote(['get-url', 'origin']);
  const remoteUrlStr = typeof remoteUrl === 'string' ? remoteUrl.trim() : String(remoteUrl).trim();
  metadataManager.data.target_repository = {
    path: repoRoot,
    github_name: repositoryName,
    remote_url: remoteUrlStr,
    owner: owner,
    repo: repo,
  };
  metadataManager.save();

  // コミット & プッシュ (Issue #16: commitWorkflowInit を使用)
  const gitManager = new GitManager(repoRoot, metadataManager);
  console.info('[INFO] Committing metadata.json...');
  const commitResult = await gitManager.commitWorkflowInit(issueNumber, branchName);
  if (!commitResult.success) {
    throw new Error(`Git commit failed: ${commitResult.error ?? 'unknown error'}`);
  }
  console.info(
    `[OK] Commit ${commitResult.commit_hash ? commitResult.commit_hash.slice(0, 7) : ''} created.`,
  );

  console.info('[INFO] Pushing to remote...');
  const pushResult = await gitManager.pushToRemote();
  if (!pushResult.success) {
    throw new Error(`Git push failed: ${pushResult.error ?? 'unknown error'}`);
  }
  console.info('[OK] Push successful.');

  // PR作成
  const githubToken = process.env.GITHUB_TOKEN ?? null;
  if (!githubToken || !repositoryName) {
    console.warn(
      '[WARNING] GITHUB_TOKEN or GITHUB_REPOSITORY not set. PR creation skipped.',
    );
    console.info('[INFO] You can create a PR manually (e.g. gh pr create --draft).');
    return;
  }

  try {
    const githubClient = new GitHubClient(githubToken, repositoryName);
    const existingPr = await githubClient.checkExistingPr(branchName);
    if (existingPr) {
      console.warn(`[WARNING] PR already exists: ${existingPr.pr_url}`);
      metadataManager.data.pr_number = existingPr.pr_number;
      metadataManager.data.pr_url = existingPr.pr_url;
      metadataManager.save();
      return;
    }

    console.info('[INFO] Creating draft PR...');
    const prTitle = `[AI-Workflow] Issue #${issueNumber}`;
    const prBody = githubClient.generatePrBodyTemplate(issueNumber, branchName);
    const prResult = await githubClient.createPullRequest(
      prTitle,
      prBody,
      branchName,
      'main',
      true,
    );

    if (prResult.success) {
      console.info(`[OK] Draft PR created: ${prResult.pr_url}`);
      metadataManager.data.pr_number = prResult.pr_number ?? null;
      metadataManager.data.pr_url = prResult.pr_url ?? null;
      metadataManager.save();
    } else {
      console.warn(
        `[WARNING] PR creation failed: ${prResult.error ?? 'unknown error'}. Please create manually.`,
      );
    }
  } catch (error) {
    console.warn(`[WARNING] Failed to create PR automatically: ${(error as Error).message}`);
  }
}

async function handleExecuteCommand(options: any): Promise<void> {
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
    console.error("[ERROR] Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive.");
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
      'metadata.json'
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
  const branchName =
    metadataManager.data.branch_name ?? `ai-workflow/issue-${issueNumber}`;
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

async function handleReviewCommand(options: any): Promise<void> {
  const repoRoot = await getRepoRoot();
  const metadataPath = path.join(repoRoot, '.ai-workflow', `issue-${options.issue}`, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    console.error('Error: Workflow not found.');
    process.exit(1);
  }

  const metadata = WorkflowState.load(metadataPath);
  const phaseName = options.phase as PhaseName;
  if (!metadata.data.phases[phaseName]) {
    console.error(`Error: Unknown phase "${phaseName}".`);
    process.exit(1);
  }

  console.info(`[OK] Phase ${phaseName} status: ${metadata.getPhaseStatus(phaseName)}`);
}

async function executePhasesSequential(
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

async function executePhasesFrom(
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

function createPhaseInstance(phaseName: PhaseName, context: PhaseContext) {
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

function reportExecutionSummary(summary: ExecutionSummary): void {
  if (summary.success) {
    console.info('[OK] All phases completed successfully.');
    return;
  }

  console.error(
    `[ERROR] Workflow failed at phase: ${summary.failedPhase ?? 'unknown phase'}`,
  );
  if (summary.error) {
    console.error(`[ERROR] Reason: ${summary.error}`);
  }
}

async function getRepoRoot(): Promise<string> {
  const git = simpleGit(process.cwd());
  try {
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch {
    return process.cwd();
  }
}

async function ensureBranch(
  repoRoot: string,
  branchName: string,
  cleanupDir?: string,
): Promise<void> {
  const git = simpleGit(repoRoot);
  const branches = await git.branch();
  if (branches.all.includes(branchName)) {
    try {
      await git.checkout(branchName);
      console.info(`[INFO] Switched to existing branch: ${branchName}`);
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('untracked working tree files would be overwritten')) {
        if (cleanupDir && fs.existsSync(cleanupDir)) {
          console.warn('[WARNING] Untracked workflow files detected. Cleaning up and retrying checkout...');
          fs.removeSync(cleanupDir);
        }
        await git.checkout(branchName);
        console.info(`[INFO] Switched to existing branch after cleanup: ${branchName}`);
      } else {
        throw error;
      }
    }
  } else {
    await git.checkoutLocalBranch(branchName);
    console.info(`[INFO] Created and switched to branch: ${branchName}`);
  }
}

/**
 * Issue URL解析結果
 */
interface IssueInfo {
  /**
   * リポジトリオーナー
   * 例: "tielec"
   */
  owner: string;

  /**
   * リポジトリ名
   * 例: "my-app"
   */
  repo: string;

  /**
   * Issue番号
   * 例: 123
   */
  issueNumber: number;

  /**
   * リポジトリ名（owner/repo形式）
   * 例: "tielec/my-app"
   */
  repositoryName: string;
}

/**
 * GitHub Issue URLからリポジトリ情報を抽出
 * @param issueUrl - GitHub Issue URL（例: https://github.com/tielec/my-app/issues/123）
 * @returns Issue情報（owner, repo, issueNumber, repositoryName）
 * @throws URL形式が不正な場合はエラー
 */
export function parseIssueUrl(issueUrl: string): IssueInfo {
  // 末尾スラッシュの有無を許容する正規表現
  const pattern = /github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)(?:\/)?$/;
  const match = issueUrl.match(pattern);

  if (!match) {
    throw new Error(`Invalid GitHub Issue URL: ${issueUrl}`);
  }

  const owner = match[1];
  const repo = match[2];
  const issueNumber = Number.parseInt(match[3], 10);
  const repositoryName = `${owner}/${repo}`;

  return {
    owner,
    repo,
    issueNumber,
    repositoryName,
  };
}

/**
 * 後方互換性のため、Issue番号のみを抽出する関数を維持
 * @param issueUrl - GitHub Issue URL
 * @returns Issue番号
 */
function parseIssueNumber(issueUrl: string): number {
  const match = issueUrl.match(/(\d+)(?:\/)?$/);
  if (!match) {
    throw new Error(`Could not extract issue number from URL: ${issueUrl}`);
  }
  return Number.parseInt(match[1], 10);
}

/**
 * リポジトリ名からローカルパスを解決
 * @param repoName - リポジトリ名（例: my-app）
 * @returns ローカルリポジトリパス
 * @throws リポジトリが見つからない場合はエラー
 */
export function resolveLocalRepoPath(repoName: string): string {
  const candidatePaths: string[] = [];

  // 1. 環境変数REPOS_ROOTが設定されている場合は優先的に使用
  const reposRoot = process.env.REPOS_ROOT;
  if (reposRoot) {
    candidatePaths.push(path.join(reposRoot, repoName));
  }

  // 2. フォールバック候補パス
  const homeDir = os.homedir();
  candidatePaths.push(
    path.join(homeDir, 'TIELEC', 'development', repoName),
    path.join(homeDir, 'projects', repoName),
    path.join(process.cwd(), '..', repoName),
  );

  // 3. 各候補パスを順番に確認
  for (const candidatePath of candidatePaths) {
    const resolvedPath = path.resolve(candidatePath);
    const gitPath = path.join(resolvedPath, '.git');

    if (fs.existsSync(resolvedPath) && fs.existsSync(gitPath)) {
      return resolvedPath;
    }
  }

  // 4. すべての候補で見つからない場合はエラー
  throw new Error(
    `Repository '${repoName}' not found.\nPlease set REPOS_ROOT environment variable or clone the repository.`
  );
}

/**
 * Issue番号から対応するメタデータを探索
 * @param issueNumber - Issue番号（例: "123"）
 * @returns リポジトリルートパスとメタデータパス
 * @throws メタデータが見つからない場合はエラー
 */
export async function findWorkflowMetadata(
  issueNumber: string,
): Promise<{ repoRoot: string; metadataPath: string }> {
  const searchRoots: string[] = [];

  // 1. 環境変数REPOS_ROOTが設定されている場合
  const reposRoot = process.env.REPOS_ROOT;
  if (reposRoot && fs.existsSync(reposRoot)) {
    searchRoots.push(reposRoot);
  }

  // 2. フォールバック探索ルート
  const homeDir = os.homedir();
  const fallbackRoots = [
    path.join(homeDir, 'TIELEC', 'development'),
    path.join(homeDir, 'projects'),
    path.join(process.cwd(), '..'),
  ];

  for (const root of fallbackRoots) {
    if (fs.existsSync(root)) {
      searchRoots.push(root);
    }
  }

  // 3. 各探索ルート配下のリポジトリを探索
  for (const searchRoot of searchRoots) {
    try {
      const entries = fs.readdirSync(searchRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const repoPath = path.join(searchRoot, entry.name);
        const gitPath = path.join(repoPath, '.git');

        // .gitディレクトリが存在するか確認
        if (!fs.existsSync(gitPath)) {
          continue;
        }

        // メタデータの存在を確認
        const metadataPath = path.join(
          repoPath,
          '.ai-workflow',
          `issue-${issueNumber}`,
          'metadata.json'
        );

        if (fs.existsSync(metadataPath)) {
          return {
            repoRoot: repoPath,
            metadataPath,
          };
        }
      }
    } catch (error) {
      // ディレクトリ読み込みエラーは無視して次へ
      continue;
    }
  }

  // 4. すべての候補で見つからない場合はエラー
  throw new Error(
    `Workflow metadata for issue ${issueNumber} not found.\nPlease run init first or check the issue number.`
  );
}

/**
 * プリセット名を解決（後方互換性対応）
 */
function resolvePresetName(presetName: string): {
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
  throw new Error(`[ERROR] Unknown preset: ${presetName}. Use 'list-presets' command to see available presets.`);
}

/**
 * 利用可能なプリセット一覧を表示
 */
function listPresets(): void {
  console.info('Available Presets:\n');

  // 現行プリセットの一覧表示
  for (const [name, phases] of Object.entries(PHASE_PRESETS)) {
    const description = PRESET_DESCRIPTIONS[name] || '';
    const phaseList = phases.join(' → ');
    console.info(`  ${name.padEnd(25)} - ${description}`);
    console.info(`    Phases: ${phaseList}\n`);
  }

  console.info('\nDeprecated Presets (will be removed in 6 months):\n');

  // 非推奨プリセットの一覧表示
  for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
    console.info(`  ${oldName.padEnd(25)} → Use '${newName}' instead`);
  }

  console.info('\nUsage:');
  console.info('  npm run start -- execute --issue <number> --preset <preset-name>');
  console.info('  npm run start -- execute --issue <number> --phase <phase-name>');
  console.info('  npm run start -- execute --issue <number> --phase all');

  process.exit(0);
}

function getPresetPhases(presetName: string): PhaseName[] {
  const phases = PHASE_PRESETS[presetName];
  if (!phases) {
    throw new Error(
      `Invalid preset: '${presetName}'. Available presets: ${Object.keys(PHASE_PRESETS).join(', ')}`,
    );
  }
  return phases as PhaseName[];
}

async function loadExternalDocuments(
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

async function resetMetadata(
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

function canResumeWorkflow(resumeManager: ResumeManager): boolean {
  try {
    return resumeManager.canResume();
  } catch (error) {
    console.warn(
      `[WARNING] Failed to assess resume status: ${(error as Error).message}. Starting new workflow.`,
    );
    return false;
  }
}

function isValidPhaseName(value: string): value is PhaseName {
  return (PHASE_ORDER as string[]).includes(value);
}

function reportFatalError(error: unknown): never {
  if (error instanceof Error) {
    console.error(`[ERROR] ${error.message}`);
  } else {
    console.error('[ERROR] An unexpected error occurred.');
  }
  process.exit(1);
}
