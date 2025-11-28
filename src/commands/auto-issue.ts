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

    // 2. 作業ディレクトリとリポジトリルートを取得
    const workingDir = process.cwd();
    logger.info(`Working directory: ${workingDir}`);

    // 3. エージェント認証情報を解決（既存の resolveAgentCredentials を活用）
    const homeDir = config.getHomeDir();
    const credentials = resolveAgentCredentials(homeDir, workingDir);

    // 4. エージェントクライアントを初期化（既存の setupAgentClients を活用）
    const { codexClient, claudeClient } = setupAgentClients(
      options.agent,
      workingDir,
      credentials.codexApiKey,
      credentials.claudeCredentialsPath,
    );

    if (!codexClient && !claudeClient) {
      throw new Error('Agent mode requires a valid agent configuration.');
    }

    // 5. GitHubクライアントを初期化
    const githubToken = config.getGitHubToken();
    const repoName = config.getGitHubRepository();
    if (!repoName) {
      throw new Error('GITHUB_REPOSITORY environment variable is required.');
    }

    const octokit = new Octokit({ auth: githubToken });
    logger.info(`GitHub repository: ${repoName}`);

    // 6. リポジトリ探索エンジンでバグを検出
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);
    logger.info('Analyzing repository for bugs...');
    const candidates = await analyzer.analyze(workingDir, options.agent);
    logger.info(`Found ${candidates.length} bug candidates.`);

    if (candidates.length === 0) {
      logger.info('No bug candidates found. Exiting.');
      return;
    }

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

    logger.info('auto-issue command completed successfully.');
  } catch (error) {
    logger.error(`auto-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
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

  return {
    category: category as 'bug' | 'refactor' | 'enhancement' | 'all',
    limit,
    dryRun,
    similarityThreshold,
    agent: agent as 'auto' | 'codex' | 'claude',
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
