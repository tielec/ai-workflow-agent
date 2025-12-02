/**
 * auto-close-issue コマンドハンドラ
 *
 * エージェント（Codex/Claude）を使用してIssueを検品し、
 * 安全にクローズする機能を提供します。
 *
 * @module auto-close-issue-command
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { resolveAgentCredentials, setupAgentClients } from './execute/agent-setup.js';
import { IssueInspector } from '../core/issue-inspector.js';
import { IssueClient } from '../core/github/issue-client.js';
import type { CodexAgentClient } from '../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../core/claude-agent-client.js';
import type {
  AutoCloseIssueOptions,
  IssueCategory,
  Issue,
  InspectionResult,
  InspectionOptions,
  CloseHistoryEntry,
} from '../types/auto-close-issue.js';

/**
 * CLIオプションパース結果（生の入力）
 */
interface RawAutoCloseIssueOptions {
  category?: string;
  limit?: string;
  dryRun?: boolean;
  confidenceThreshold?: string;
  daysThreshold?: string;
  requireApproval?: boolean;
  excludeLabels?: string;
  agent?: 'auto' | 'codex' | 'claude';
}

/**
 * auto-close-issue コマンドのメインハンドラ
 *
 * @param rawOptions - CLIオプション（生の入力）
 */
export async function handleAutoCloseIssueCommand(
  rawOptions: RawAutoCloseIssueOptions,
): Promise<void> {
  try {
    logger.info('Starting auto-close-issue command...');

    // 1. オプションパース
    const options = parseOptions(rawOptions);

    logger.info(
      `Options: category=${options.category}, limit=${options.limit}, dryRun=${options.dryRun}, confidence=${options.confidenceThreshold}`,
    );

    // 2. 必須環境変数チェック
    const githubToken = config.getGitHubToken();
    const githubRepository = config.getGitHubRepository();
    if (!githubRepository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required.');
    }

    // 3. リポジトリ情報解析
    const [owner, repo] = githubRepository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${githubRepository}`);
    }
    logger.info(`Target repository: ${owner}/${repo}`);

    // 4. エージェント認証情報解決
    const homeDir = config.getHomeDir();
    const repoPath = process.cwd();
    const credentials = resolveAgentCredentials(homeDir, repoPath);

    // 5. エージェントクライアント初期化
    const { codexClient, claudeClient } = setupAgentClients(
      options.agent,
      repoPath,
      credentials.codexApiKey,
      credentials.claudeCredentialsPath,
    );

    if (!codexClient && !claudeClient) {
      throw new Error('No agent credentials found. Please set CODEX_API_KEY or CLAUDE_CODE_CREDENTIALS_PATH.');
    }

    // 6. GitHubクライアント初期化
    const octokit = new Octokit({ auth: githubToken });
    const issueClient = new IssueClient(octokit, owner, repo);

    // 7. IssueInspector初期化
    const agentExecutor = (codexClient || claudeClient) as CodexAgentClient | ClaudeAgentClient;
    const inspector = new IssueInspector(agentExecutor, issueClient, owner, repo);

    // 8. オープンIssue一覧取得
    logger.info('Fetching open issues...');
    const allIssues = await issueClient.getIssues(100);
    logger.info(`Fetched ${allIssues.length} open issues.`);

    // 9. カテゴリフィルタリング
    const filteredIssues = filterByCategory(
      allIssues.map(convertToSimpleIssue),
      options.category,
      options.daysThreshold,
    );
    logger.info(`After category filter (${options.category}): ${filteredIssues.length} issues.`);

    // 10. limit制限適用
    const limitedIssues = filteredIssues.slice(0, options.limit);
    logger.info(`Processing ${limitedIssues.length} issues (limit: ${options.limit}).`);

    if (limitedIssues.length === 0) {
      logger.info('No issues to process. Exiting.');
      return;
    }

    // 11. 各Issueに対して検品実行
    const candidates: InspectionResult[] = [];
    const inspectionOptions: InspectionOptions = {
      confidenceThreshold: options.confidenceThreshold,
      excludeLabels: options.excludeLabels,
      agent: options.agent,
    };

    for (const issue of limitedIssues) {
      logger.info(`Inspecting issue #${issue.number}: ${issue.title}`);
      const result = await inspector.inspectIssue(issue, inspectionOptions);

      if (result) {
        candidates.push(result);
        logger.info(
          `  → Recommendation: ${result.recommendation}, Confidence: ${result.confidence}`,
        );
      }
    }

    logger.info(`Found ${candidates.length} close candidates.`);

    if (candidates.length === 0) {
      logger.info('No issues passed the inspection. Exiting.');
      return;
    }

    // 12. クローズ候補を表示
    displayCandidates(candidates, options.dryRun);

    // 13. 承認確認（requireApproval の場合）
    if (options.requireApproval && !options.dryRun) {
      const approved = await confirmApproval(candidates.length);
      if (!approved) {
        logger.info('Operation cancelled by user.');
        return;
      }
    }

    // 14. クローズ処理（dry-run=false の場合）
    if (!options.dryRun) {
      await closeCandidates(candidates, issueClient, options.category);
      logger.info('All candidates closed successfully.');
    }

    // 15. サマリー表示
    displaySummary(limitedIssues.length, candidates.length, options.dryRun);

    logger.info('auto-close-issue command completed successfully.');
  } catch (error) {
    logger.error(`auto-close-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * CLIオプションをパース
 */
function parseOptions(rawOptions: RawAutoCloseIssueOptions): AutoCloseIssueOptions {
  // category（デフォルト: 'followup'）
  const category = (rawOptions.category ?? 'followup') as IssueCategory;
  validateOptions({ category } as AutoCloseIssueOptions);

  // limit（デフォルト: 10）
  const limitStr = rawOptions.limit ?? '10';
  const limit = parseInt(limitStr, 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw new Error(`--limit must be between 1 and 50`);
  }

  // dryRun（デフォルト: true）
  const dryRun = rawOptions.dryRun ?? true;

  // confidenceThreshold（デフォルト: 0.7）
  const confidenceThresholdStr = rawOptions.confidenceThreshold ?? '0.7';
  const confidenceThreshold = parseFloat(confidenceThresholdStr);
  if (
    !Number.isFinite(confidenceThreshold) ||
    confidenceThreshold < 0.0 ||
    confidenceThreshold > 1.0
  ) {
    throw new Error(`--confidence-threshold must be between 0.0 and 1.0`);
  }

  // daysThreshold（デフォルト: 90）
  const daysThresholdStr = rawOptions.daysThreshold ?? '90';
  const daysThreshold = parseInt(daysThresholdStr, 10);
  if (!Number.isFinite(daysThreshold) || daysThreshold < 1) {
    throw new Error(`--days-threshold must be a positive integer`);
  }

  // requireApproval（デフォルト: false）
  const requireApproval = rawOptions.requireApproval ?? false;

  // excludeLabels（デフォルト: 'do-not-close,pinned'）
  const excludeLabelsStr = rawOptions.excludeLabels ?? 'do-not-close,pinned';
  const excludeLabels = excludeLabelsStr.split(',').map((s) => s.trim());

  // agent（デフォルト: 'auto'）
  const agent = rawOptions.agent ?? 'auto';

  return {
    category,
    limit,
    dryRun,
    confidenceThreshold,
    daysThreshold,
    requireApproval,
    excludeLabels,
    agent,
  };
}

/**
 * オプションバリデーション
 */
function validateOptions(options: Partial<AutoCloseIssueOptions>): void {
  if (options.category) {
    const validCategories: IssueCategory[] = ['followup', 'stale', 'old', 'all'];
    if (!validCategories.includes(options.category)) {
      throw new Error(
        `Invalid category: "${options.category}". Allowed values: ${validCategories.join(', ')}`,
      );
    }
  }
}

/**
 * カテゴリフィルタリング
 */
export function filterByCategory(
  issues: Issue[],
  category: IssueCategory,
  daysThreshold: number,
): Issue[] {
  switch (category) {
    case 'followup':
      return issues.filter((issue) => issue.title.startsWith('[FOLLOW-UP]'));

    case 'stale':
      return issues.filter((issue) => {
        const daysSinceUpdate = calculateDaysSince(issue.updated_at);
        return daysSinceUpdate >= daysThreshold;
      });

    case 'old':
      return issues.filter((issue) => {
        const daysSinceCreated = calculateDaysSince(issue.created_at);
        return daysSinceCreated >= daysThreshold * 2; // デフォルト180日
      });

    case 'all':
      return issues; // フィルタなし

    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * 日数計算ヘルパー
 */
function calculateDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * GitHub Issue から 簡易Issue型への変換
 */
function convertToSimpleIssue(issue: {
  number: number;
  title: string;
  body?: string | null | undefined;
  labels: Array<string | { name?: string }>;
  created_at: string;
  updated_at: string;
  state: string;
}): Issue {
  return {
    number: issue.number,
    title: issue.title ?? '',
    body: issue.body ?? '',
    labels: (issue.labels ?? []).map((label) => ({
      name: typeof label === 'string' ? label : label.name ?? '',
    })),
    created_at: issue.created_at ?? new Date().toISOString(),
    updated_at: issue.updated_at ?? new Date().toISOString(),
    state: (issue.state as 'open' | 'closed') ?? 'open',
  };
}

/**
 * クローズ候補を表示
 */
function displayCandidates(candidates: InspectionResult[], dryRun: boolean): void {
  logger.info('===== Close Candidates =====');

  if (dryRun) {
    logger.info('[DRY RUN] The following issues would be closed:');
  } else {
    logger.info('The following issues will be closed:');
  }

  for (const candidate of candidates) {
    logger.info(`  - Issue #${candidate.issue_number}`);
    logger.info(`    Recommendation: ${candidate.recommendation}`);
    logger.info(`    Confidence: ${candidate.confidence}`);
    logger.info(`    Reasoning: ${candidate.reasoning.substring(0, 100)}...`);
  }

  logger.info('============================');
}

/**
 * 承認確認プロンプト
 */
async function confirmApproval(count: number): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Do you want to close these ${count} issues? (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * クローズ候補を実際にクローズ
 */
async function closeCandidates(
  candidates: InspectionResult[],
  issueClient: IssueClient,
  category: IssueCategory,
): Promise<void> {
  for (const candidate of candidates) {
    try {
      logger.info(`Closing issue #${candidate.issue_number}...`);

      // 1. クローズコメント投稿
      await issueClient.postComment(candidate.issue_number, candidate.close_comment);

      // 2. ラベル付与
      await issueClient.addLabels(candidate.issue_number, ['auto-closed']);

      // 3. Issue クローズ
      await issueClient.closeIssue(candidate.issue_number);

      // 4. クローズ履歴記録
      await recordCloseHistory(candidate, category);

      logger.info(`  → Closed successfully`);
    } catch (error) {
      logger.error(`  → Failed to close: ${getErrorMessage(error)}`);
    }
  }
}

/**
 * クローズ履歴を記録
 */
async function recordCloseHistory(
  candidate: InspectionResult,
  category: IssueCategory,
): Promise<void> {
  const historyDir = path.join(process.cwd(), '.ai-workflow', 'auto-close');
  const historyFile = path.join(historyDir, 'history.log');

  // ディレクトリ作成
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  // エントリ作成
  const entry: CloseHistoryEntry = {
    timestamp: new Date().toISOString(),
    issue_number: candidate.issue_number,
    issue_title: '', // 簡易実装（必要に応じて拡張）
    category,
    recommendation: candidate.recommendation,
    confidence: candidate.confidence,
    reasoning: candidate.reasoning,
    close_comment: candidate.close_comment,
  };

  // JSON Lines形式で追記
  fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * サマリー表示
 */
function displaySummary(totalProcessed: number, closedCount: number, dryRun: boolean): void {
  logger.info('===== Summary =====');
  logger.info(`Processed issues: ${totalProcessed}`);
  logger.info(`Close candidates: ${closedCount}`);
  logger.info(`Skipped: ${totalProcessed - closedCount}`);

  if (dryRun) {
    logger.info('Mode: DRY RUN (no issues were closed)');
  } else {
    logger.info(`Mode: LIVE (${closedCount} issues closed)`);
  }

  logger.info('===================');
}
