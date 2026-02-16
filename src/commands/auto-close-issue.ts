import readline from 'node:readline';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from '../core/config.js';
import { resolveLocalRepoPath } from '../core/repository-utils.js';
import {
  resolveAgentCredentials,
  setupAgentClients,
  type AgentPriority,
} from './execute/agent-setup.js';
import { IssueInspector } from '../core/issue-inspector.js';
import { IssueClient } from '../core/github/issue-client.js';
import type {
  AutoCloseIssueOptions,
  CloseIssueResult,
  InspectionResult,
  IssueCandidate,
  RawAutoCloseIssueOptions,
} from '../types/auto-close-issue.js';

const DEFAULT_EXCLUDE_LABELS = ['do-not-close', 'pinned'];
const DEFAULT_AGENT_PRIORITY: AgentPriority = 'claude-first';

/**
 * auto-close-issue コマンドのメインハンドラ
 *
 * @param rawOptions - CLIオプション（生の入力）
 * @throws 必須環境変数が未設定の場合、またはエージェントが利用不可の場合
 */
export async function handleAutoCloseIssueCommand(
  rawOptions: RawAutoCloseIssueOptions,
): Promise<void> {
  try {
    logger.info('Starting auto-close-issue command...');

    // 1. オプションパース
    const options = parseOptions(rawOptions);
    logger.info(
      `Options: category=${options.category}, limit=${options.limit}, dryRun=${options.dryRun}, confidenceThreshold=${options.confidenceThreshold}, daysThreshold=${options.daysThreshold}, requireApproval=${options.requireApproval}, agent=${options.agent}`,
    );

    // 2. GitHub関連の必須設定を確認
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is required');
    }

    const githubRepository = process.env.GITHUB_REPOSITORY ?? config.getGitHubRepository();
    if (!githubRepository) {
      throw new Error('GITHUB_REPOSITORY is required');
    }
    const [owner, repo] = githubRepository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${githubRepository}`);
    }

    // 3. ローカルリポジトリパスを解決（エージェントの作業ディレクトリ用）
    let repoPath: string;
    try {
      repoPath = resolveLocalRepoPath(repo);
      logger.info(`Resolved repository path: ${repoPath}`);
    } catch (error) {
      logger.error(`Failed to resolve repository path: ${getErrorMessage(error)}`);
      throw new Error(
        `Repository '${repo}' not found locally. Please ensure REPOS_ROOT is set correctly.\nOriginal error: ${getErrorMessage(error)}`,
      );
    }

    // 4. エージェントセットアップ
    const credentials = resolveAgentCredentials(config.getHomeDir(), repoPath);
    const { codexClient, claudeClient } = setupAgentClients(
      options.agent,
      repoPath,
      credentials,
      { agentPriority: DEFAULT_AGENT_PRIORITY },
    );

    if (!codexClient && !claudeClient) {
      throw new Error(
        'No agent available. Please configure CODEX_API_KEY or CLAUDE_CODE_CREDENTIALS_PATH',
      );
    }

    // 5. クライアント初期化
    const octokit = new Octokit({ auth: githubToken });
    const issueClient = new IssueClient(octokit, owner, repo);
    const inspector = new IssueInspector(codexClient, claudeClient, issueClient);

    // 6. 候補取得
    const candidates = await inspector.getCandidates(options.category, {
      daysThreshold: options.daysThreshold,
      excludeLabels: options.excludeLabels,
      limit: options.limit,
    });

    if (candidates.length === 0) {
      logger.info('No issue candidates matched the criteria. Exiting.');
      return;
    }

    // 7. 検品実行
    const inspectionResults = await inspector.inspect(candidates, options.agent);
    const filteredResults = inspector.filterByConfidence(
      inspectionResults,
      options.confidenceThreshold,
    );

    const results: CloseIssueResult[] = [];

    for (const candidate of candidates) {
      const rawInspection = inspectionResults.find(
        (item) => item.issueNumber === candidate.number,
      );
      const inspection = filteredResults.find(
        (item) => item.issueNumber === candidate.number,
      );

      if (!inspection) {
        if (rawInspection && rawInspection.recommendation === 'close') {
          results.push({
            issueNumber: candidate.number,
            title: candidate.title,
            success: true,
            action: 'skipped',
            skipReason: 'low_confidence',
            inspectionResult: rawInspection,
          });
          continue;
        }

        results.push({
          issueNumber: candidate.number,
          title: candidate.title,
          success: false,
          action: 'error',
          error: 'Inspection result missing or below confidence threshold',
        });
        continue;
      }

      if (inspection.recommendation !== 'close') {
        results.push({
          issueNumber: candidate.number,
          title: candidate.title,
          success: true,
          action: 'skipped',
          skipReason: inspection.recommendation,
          inspectionResult: inspection,
        });
        continue;
      }

      if (options.requireApproval) {
        const approval = await promptForApproval(candidate, inspection);
        if (approval === 'no') {
          results.push({
            issueNumber: candidate.number,
            title: candidate.title,
            success: true,
            action: 'user_rejected',
            skipReason: 'user_rejected',
            inspectionResult: inspection,
          });
          continue;
        }
        if (approval === 'skip') {
          results.push({
            issueNumber: candidate.number,
            title: candidate.title,
            success: true,
            action: 'skipped',
            skipReason: 'user_skipped',
            inspectionResult: inspection,
          });
          continue;
        }
      }

      const closeResult = await inspector.closeIssue(candidate, inspection, options.dryRun);
      results.push(closeResult);
    }

    reportResults(results, options);
    logger.info('auto-close-issue command completed successfully.');
  } catch (error) {
    logger.error(`auto-close-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * CLIオプションをパース・バリデート
 */
function parseOptions(rawOptions: RawAutoCloseIssueOptions): AutoCloseIssueOptions {
  const category = (rawOptions.category ?? 'followup').toLowerCase();
  const validCategories = ['followup', 'stale', 'old', 'all'];
  if (!validCategories.includes(category)) {
    throw new Error('category must be one of: followup, stale, old, all');
  }

  const limit =
    rawOptions.limit === undefined ? 10 : Number.parseInt(String(rawOptions.limit), 10);
  if (Number.isNaN(limit)) {
    throw new Error('limit must be a valid number');
  }
  if (limit < 1 || limit > 50) {
    throw new Error('limit must be between 1 and 50');
  }

  const confidenceThreshold =
    rawOptions.confidenceThreshold === undefined
      ? 0.7
      : Number.parseFloat(String(rawOptions.confidenceThreshold));
  if (Number.isNaN(confidenceThreshold)) {
    throw new Error('confidence-threshold must be a valid number');
  }
  if (confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error('confidence-threshold must be between 0.0 and 1.0');
  }

  const daysThreshold =
    rawOptions.daysThreshold === undefined
      ? 90
      : Number.parseInt(String(rawOptions.daysThreshold), 10);
  if (Number.isNaN(daysThreshold) || daysThreshold < 1) {
    throw new Error('days-threshold must be a positive number');
  }

  const excludeLabels =
    rawOptions.excludeLabels === undefined || rawOptions.excludeLabels === null
      ? DEFAULT_EXCLUDE_LABELS
      : String(rawOptions.excludeLabels)
          .split(',')
          .map((label) => label.trim())
          .filter((label) => label.length > 0);

  const agent = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agent)) {
    throw new Error('agent must be one of: auto, codex, claude');
  }

  return {
    category: category as AutoCloseIssueOptions['category'],
    limit,
    dryRun: rawOptions.dryRun !== undefined ? rawOptions.dryRun : false,
    confidenceThreshold,
    daysThreshold,
    requireApproval: rawOptions.requireApproval ?? false,
    excludeLabels,
    agent,
  };
}

/**
 * 対話的確認を行う
 */
async function promptForApproval(
  issue: IssueCandidate,
  result: InspectionResult,
): Promise<'yes' | 'no' | 'skip'> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const message = [
      `Issue #${issue.number}: ${issue.title}`,
      `recommendation=${result.recommendation}, confidence=${result.confidence}`,
      `reasoning=${result.reasoning}`,
      'Close this issue? (y = yes, n = no, s = skip): ',
    ].join('\n');

    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'y' || normalized === 'yes') {
        resolve('yes');
      } else if (normalized === 's' || normalized === 'skip') {
        resolve('skip');
      } else {
        resolve('no');
      }
    });
  });
}

/**
 * 実行結果サマリーを表示
 */
function reportResults(
  results: CloseIssueResult[],
  options: AutoCloseIssueOptions,
): void {
  const summary = {
    totalInspected: results.length,
    recommendedClose: results.filter(
      (result) => result.inspectionResult?.recommendation === 'close',
    ).length,
    actualClosed: results.filter((result) => result.action === 'closed').length,
    skipped: results.filter(
      (result) => result.action === 'skipped' || result.action === 'user_rejected',
    ).length,
    errors: results.filter((result) => result.action === 'error').length,
  };

  logger.info(
    `Summary: inspected=${summary.totalInspected}, close_recommended=${summary.recommendedClose}, closed=${summary.actualClosed}, skipped=${summary.skipped}, errors=${summary.errors}, dryRun=${options.dryRun}`,
  );

  for (const result of results) {
    const base = `#${result.issueNumber} "${result.title}" -> ${result.action}`;
    if (result.error) {
      logger.error(`${base} (error: ${result.error})`);
      continue;
    }
    if (result.skipReason) {
      logger.info(`${base} (reason: ${result.skipReason})`);
      continue;
    }
    logger.info(base);
  }

  if (options.dryRun) {
    logger.info('Dry-run mode: no issues were closed.');
  }
}
