/**
 * auto-issue コマンドハンドラ
 *
 * エージェント（Codex/Claude）を使用してリポジトリのバグを検出し、
 * GitHub Issueを自動作成します。
 *
 * @module auto-issue-command
 */

import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { resolveAgentCredentials, setupAgentClients } from './execute/agent-setup.js';
import { RepositoryAnalyzer } from '../core/repository-analyzer.js';
import { IssueDeduplicator, type ExistingIssue } from '../core/issue-deduplicator.js';
import { IssueGenerator } from '../core/issue-generator.js';
import { resolveLocalRepoPath } from '../core/repository-utils.js';
import type { CodexAgentClient } from '../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../core/claude-agent-client.js';
import type { AutoIssueOptions, IssueCreationResult } from '../types/auto-issue.js';

/**
 * CLIオプションパース結果（生の入力）
 */
interface RawAutoIssueOptions {
  category?: string;
  limit?: string;
  dryRun?: boolean;
  similarityThreshold?: string;
  agent?: 'auto' | 'codex' | 'claude';
  creativeMode?: boolean;
}

/**
 * auto-issue コマンドのメインハンドラ
 *
 * @param rawOptions - CLIオプション（生の入力）
 * @throws 必須環境変数が未設定の場合、またはエージェントが利用不可の場合
 */
export async function handleAutoIssueCommand(rawOptions: RawAutoIssueOptions): Promise<void> {
  try {
    logger.info('Starting auto-issue command...');

    // 1. オプションパース（デフォルト値適用、バリデーション）
    const options = parseOptions(rawOptions);

    logger.info(`Options: category=${options.category}, limit=${options.limit}, dryRun=${options.dryRun}, similarityThreshold=${options.similarityThreshold}, agent=${options.agent}`);

    // 2. GITHUB_REPOSITORY から owner/repo を取得
    const githubRepository = config.getGitHubRepository();
    if (!githubRepository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required.');
    }
    logger.info(`GitHub repository: ${githubRepository}`);

    // 3. リポジトリ名を抽出（例: "tielec/reflection-cloud-api" → "reflection-cloud-api"）
    const [owner, repo] = githubRepository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${githubRepository}`);
    }

    // 4. ローカルリポジトリパスを解決
    let repoPath: string;
    try {
      repoPath = resolveLocalRepoPath(repo);
      logger.info(`Resolved repository path: ${repoPath}`);
    } catch (error) {
      logger.error(`Failed to resolve repository path: ${getErrorMessage(error)}`);
      throw new Error(
        `Repository '${repo}' not found locally.\n` +
        `Please ensure REPOS_ROOT is set correctly in Jenkins environment,\n` +
        `or run the command from the repository root in local environment.\n` +
        `Original error: ${getErrorMessage(error)}`
      );
    }

    // 5. REPOS_ROOT の値をログ出力
    const reposRoot = config.getReposRoot();
    logger.info(`REPOS_ROOT: ${reposRoot || '(not set)'}`);

    // 6. エージェント認証情報を解決（既存の resolveAgentCredentials を活用）
    const homeDir = config.getHomeDir();
    const credentials = resolveAgentCredentials(homeDir, repoPath);

    // 7. エージェントクライアントを初期化（既存の setupAgentClients を活用）
    const { codexClient, claudeClient } = setupAgentClients(
      options.agent,
      repoPath,
      credentials.codexApiKey,
      credentials.claudeCredentialsPath,
    );

    if (!codexClient && !claudeClient) {
      throw new Error('Agent mode requires a valid agent configuration.');
    }

    // 8. GitHubクライアントを初期化
    const githubToken = config.getGitHubToken();
    const octokit = new Octokit({ auth: githubToken });

    // 9. リポジトリ探索エンジンで候補を検出（カテゴリに応じて分岐）
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);

    if (options.category === 'bug') {
      logger.info('Analyzing repository for bugs...');
      logger.info(`Analyzing repository: ${repoPath}`);
      const bugCandidates = await analyzer.analyze(repoPath, options.agent);
      logger.info(`Found ${bugCandidates.length} bug candidates.`);

      if (bugCandidates.length === 0) {
        logger.info('No bug candidates found. Exiting.');
        return;
      }

      // バグ候補の処理を継続
      await processBugCandidates(
        bugCandidates,
        octokit,
        githubRepository,
        codexClient,
        claudeClient,
        options,
      );
    } else if (options.category === 'refactor') {
      logger.info('Analyzing repository for refactoring...');
      logger.info(`Analyzing repository: ${repoPath}`);
      const refactorCandidates = await analyzer.analyzeForRefactoring(repoPath, options.agent);
      logger.info(`Found ${refactorCandidates.length} refactoring candidates.`);

      if (refactorCandidates.length === 0) {
        logger.info('No refactoring candidates found. Exiting.');
        return;
      }

      // リファクタリング候補の処理を継続
      await processRefactorCandidates(
        refactorCandidates,
        octokit,
        githubRepository,
        codexClient,
        claudeClient,
        options,
      );
    } else if (options.category === 'enhancement') {
      logger.info('Analyzing repository for enhancement proposals...');
      logger.info(`Analyzing repository: ${repoPath}`);
      logger.info(`Creative mode: ${options.creativeMode ?? false}`);
      const enhancementProposals = await analyzer.analyzeForEnhancements(
        repoPath,
        options.agent,
        { creativeMode: options.creativeMode },
      );
      logger.info(`Found ${enhancementProposals.length} enhancement proposals.`);

      if (enhancementProposals.length === 0) {
        logger.info('No enhancement proposals found. Exiting.');
        return;
      }

      // 機能拡張提案の処理を継続
      await processEnhancementCandidates(
        enhancementProposals,
        octokit,
        githubRepository,
        codexClient,
        claudeClient,
        options,
      );
    } else {
      // 'all' は Phase 4 以降で実装予定
      throw new Error(
        `Category "${options.category}" is not yet supported. Please use "bug", "refactor", or "enhancement".`,
      );
    }

    logger.info('auto-issue command completed successfully.');
  } catch (error) {
    logger.error(`auto-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * バグ候補を処理してIssueを作成
 *
 * @param candidates - バグ候補のリスト
 * @param octokit - GitHub API クライアント
 * @param repoName - リポジトリ名（owner/repo 形式）
 * @param codexClient - Codex エージェントクライアント
 * @param claudeClient - Claude エージェントクライアント
 * @param options - auto-issue オプション
 */
async function processBugCandidates(
  candidates: import('../types/auto-issue.js').BugCandidate[],
  octokit: Octokit,
  repoName: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  options: AutoIssueOptions,
): Promise<void> {
  // 既存Issueを取得（リポジトリ情報から）
  const [owner, repo] = repoName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${repoName}`);
  }

  logger.info('Fetching existing issues...');
  const existingIssuesResponse = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100, // 最大100件取得
  });

  const existingIssues: ExistingIssue[] = existingIssuesResponse.data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
  }));

  logger.info(`Fetched ${existingIssues.length} existing open issues.`);

  // 重複検出でフィルタリング
  const deduplicator = new IssueDeduplicator();
  logger.info('Filtering duplicate issues...');
  const filteredCandidates = await deduplicator.filterDuplicates(
    candidates,
    existingIssues,
    options.similarityThreshold,
  );
  logger.info(`After deduplication: ${filteredCandidates.length} candidates.`);

  if (filteredCandidates.length === 0) {
    logger.info('No non-duplicate candidates found. Exiting.');
    return;
  }

  // limitオプションで制限
  const limitedCandidates = filteredCandidates.slice(0, options.limit);
  logger.info(`Limiting to ${limitedCandidates.length} candidates (limit: ${options.limit}).`);

  // Issue生成
  const generator = new IssueGenerator(codexClient, claudeClient, octokit, repoName);
  const results: IssueCreationResult[] = [];

  for (const candidate of limitedCandidates) {
    logger.info(`Generating issue for: "${candidate.title}"`);
    const result = await generator.generate(candidate, options.agent, options.dryRun);
    results.push(result);
  }

  // 結果サマリーを表示
  reportResults(results, options.dryRun);
}

/**
 * リファクタリング候補を処理してIssueを作成
 *
 * @param candidates - リファクタリング候補のリスト
 * @param octokit - GitHub API クライアント
 * @param repoName - リポジトリ名（owner/repo 形式）
 * @param codexClient - Codex エージェントクライアント
 * @param claudeClient - Claude エージェントクライアント
 * @param options - auto-issue オプション
 */
async function processRefactorCandidates(
  candidates: import('../types/auto-issue.js').RefactorCandidate[],
  octokit: Octokit,
  repoName: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  options: AutoIssueOptions,
): Promise<void> {
  // 優先度でソート（high → medium → low）
  const sortedCandidates = candidates.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });

  // limitオプションで制限
  const limitedCandidates = sortedCandidates.slice(0, options.limit);
  logger.info(`Limiting to ${limitedCandidates.length} candidates (limit: ${options.limit}).`);

  // Issue生成
  const generator = new IssueGenerator(codexClient, claudeClient, octokit, repoName);
  const results: IssueCreationResult[] = [];

  for (const candidate of limitedCandidates) {
    logger.info(
      `Generating refactoring issue for: "${candidate.type}" in "${candidate.filePath}"`,
    );
    const result = await generator.generateRefactorIssue(candidate, options.agent, options.dryRun);
    results.push(result);
  }

  // 結果サマリーを表示
  reportResults(results, options.dryRun);
}

/**
 * 機能拡張提案を処理してIssueを作成
 *
 * @param proposals - 機能拡張提案のリスト
 * @param octokit - GitHub API クライアント
 * @param repoName - リポジトリ名（owner/repo 形式）
 * @param codexClient - Codex エージェントクライアント
 * @param claudeClient - Claude エージェントクライアント
 * @param options - auto-issue オプション
 */
async function processEnhancementCandidates(
  proposals: import('../types/auto-issue.js').EnhancementProposal[],
  octokit: Octokit,
  repoName: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  options: AutoIssueOptions,
): Promise<void> {
  // 期待される効果でソート（high → medium → low）
  const sortedProposals = proposals.sort((a, b) => {
    const impactOrder = { high: 3, medium: 2, low: 1 };
    return impactOrder[b.expected_impact] - impactOrder[a.expected_impact];
  });

  // limitオプションで制限
  const limitedProposals = sortedProposals.slice(0, options.limit);
  logger.info(`Limiting to ${limitedProposals.length} proposals (limit: ${options.limit}).`);

  // Issue生成
  const generator = new IssueGenerator(codexClient, claudeClient, octokit, repoName);
  const results: IssueCreationResult[] = [];

  for (const proposal of limitedProposals) {
    logger.info(`Generating enhancement issue for: "${proposal.type}" - "${proposal.title}"`);
    const result = await generator.generateEnhancementIssue(
      proposal,
      options.agent,
      options.dryRun,
    );
    results.push(result);
  }

  // 結果サマリーを表示
  reportResults(results, options.dryRun);
}

/**
 * バグ候補を処理してIssueを作成（旧バージョン - 削除予定）
 *
 * この関数は既存のコードとの互換性のために残していますが、
 * 新しいコードでは processBugCandidates を使用してください。
 *
 * @deprecated Use processBugCandidates instead
 */
async function processLegacyBugFlow(
  candidates: import('../types/auto-issue.js').BugCandidate[],
  octokit: Octokit,
  repoName: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  options: AutoIssueOptions,
): Promise<void> {
  // 7. 既存Issueを取得（リポジトリ情報から）
  const [owner, repo] = repoName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${repoName}`);
  }

  logger.info('Fetching existing issues...');
  const existingIssuesResponse = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100, // 最大100件取得
  });

  const existingIssues: ExistingIssue[] = existingIssuesResponse.data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
  }));

  logger.info(`Fetched ${existingIssues.length} existing open issues.`);

  // 8. 重複検出でフィルタリング
  const deduplicator = new IssueDeduplicator();
  logger.info('Filtering duplicate issues...');
  const filteredCandidates = await deduplicator.filterDuplicates(
    candidates,
    existingIssues,
    options.similarityThreshold,
  );
  logger.info(`After deduplication: ${filteredCandidates.length} candidates.`);

  if (filteredCandidates.length === 0) {
    logger.info('No non-duplicate candidates found. Exiting.');
    return;
  }

  // 9. limitオプションで制限
  const limitedCandidates = filteredCandidates.slice(0, options.limit);
  logger.info(`Limiting to ${limitedCandidates.length} candidates (limit: ${options.limit}).`);

  // 10. Issue生成
  const generator = new IssueGenerator(codexClient, claudeClient, octokit, repoName);
  const results: IssueCreationResult[] = [];

  for (const candidate of limitedCandidates) {
    logger.info(`Generating issue for: "${candidate.title}"`);
    const result = await generator.generate(candidate, options.agent, options.dryRun);
    results.push(result);
  }

  // 11. 結果サマリーを表示
  reportResults(results, options.dryRun);
}

/**
 * CLIオプションをパース
 *
 * @param rawOptions - 生のCLIオプション
 * @returns パース済みオプション
 * @throws オプションバリデーションエラー
 */
function parseOptions(rawOptions: RawAutoIssueOptions): AutoIssueOptions {
  // category（デフォルト: 'bug'）
  const category = rawOptions.category ?? 'bug';
  if (!['bug', 'refactor', 'enhancement', 'all'].includes(category)) {
    throw new Error(
      `Invalid category: "${category}". Allowed values: bug, refactor, enhancement, all`,
    );
  }

  // limit（デフォルト: 5）
  const limitStr = rawOptions.limit ?? '5';
  const limit = parseInt(limitStr, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error(`Invalid limit: "${limitStr}". Must be a positive integer.`);
  }

  // dryRun（デフォルト: false）
  const dryRun = rawOptions.dryRun ?? false;

  // similarityThreshold（デフォルト: 0.8）
  const similarityThresholdStr = rawOptions.similarityThreshold ?? '0.8';
  const similarityThreshold = parseFloat(similarityThresholdStr);
  if (
    !Number.isFinite(similarityThreshold) ||
    similarityThreshold < 0.0 ||
    similarityThreshold > 1.0
  ) {
    throw new Error(
      `Invalid similarity-threshold: "${similarityThresholdStr}". Must be between 0.0 and 1.0.`,
    );
  }

  // agent（デフォルト: 'auto'）
  const agent = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agent)) {
    throw new Error(`Invalid agent: "${agent}". Allowed values: auto, codex, claude`);
  }

  // creativeMode（デフォルト: false）
  const creativeMode = rawOptions.creativeMode ?? false;

  return {
    category: category as 'bug' | 'refactor' | 'enhancement' | 'all',
    limit,
    dryRun,
    similarityThreshold,
    agent: agent as 'auto' | 'codex' | 'claude',
    creativeMode,
  };
}

/**
 * 実行結果サマリーを表示
 *
 * @param results - Issue作成結果のリスト
 * @param dryRun - dry-runモードフラグ
 */
function reportResults(results: IssueCreationResult[], dryRun: boolean): void {
  logger.info('===== auto-issue Results =====');

  if (dryRun) {
    logger.info(`[DRY RUN] ${results.length} issue candidates found.`);
    logger.info('No issues were created (dry-run mode).');
    return;
  }

  const successResults = results.filter((r) => r.success && r.issueUrl);
  const failedResults = results.filter((r) => !r.success);

  logger.info(`Successfully created ${successResults.length} issues:`);
  for (const result of successResults) {
    logger.info(`  - Issue #${result.issueNumber}: ${result.issueUrl}`);
  }

  if (failedResults.length > 0) {
    logger.warn(`Failed to create ${failedResults.length} issues:`);
    for (const result of failedResults) {
      logger.warn(`  - Error: ${result.error}`);
    }
  }

  logger.info('==============================');
}
