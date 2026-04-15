/**
 * impact-analysis コマンドハンドラ
 */

import path from 'node:path';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { resolveAgentCredentials, setupAgentClients, type AgentPriority } from './execute/agent-setup.js';
import { resolveLocalRepoPath, parsePullRequestUrl } from '../core/repository-utils.js';
import { PromptLoader } from '../core/prompt-loader.js';
import { GitHubClient } from '../core/github-client.js';
import type { RawImpactAnalysisOptions, ImpactAnalysisOptions } from '../types/impact-analysis.js';
import type { InvestigationResult, PipelineContext } from './impact-analysis/types.js';
import { executeScoper } from './impact-analysis/scoper.js';
import { executeInvestigator } from './impact-analysis/investigator.js';
import { executeReporter } from './impact-analysis/reporter.js';
import {
  createDefaultGuardrailsConfig,
  createInitialGuardrailsState,
  updateElapsedSeconds,
} from './impact-analysis/guardrails.js';
import { LogManager } from './impact-analysis/log-manager.js';

const MAX_CUSTOM_INSTRUCTION_LENGTH = 500;

/**
 * impact-analysis コマンドのメインハンドラ
 */
export async function handleImpactAnalysisCommand(
  rawOptions: RawImpactAnalysisOptions,
): Promise<void> {
  logger.info('Starting impact-analysis command...');

  const options = parseOptions(rawOptions);

  let repoPath: string;
  try {
    repoPath = resolveLocalRepoPath(options.repo);
    logger.info(`Resolved repository path: ${repoPath}`);
  } catch (error) {
    logger.error(`Failed to resolve repository path: ${getErrorMessage(error)}`);
    throw new Error(
      `Repository '${options.repo}' not found locally. ` +
        `Please ensure REPOS_ROOT is set correctly or run from repository root. ` +
        `Original error: ${getErrorMessage(error)}`,
    );
  }

  const homeDir = config.getHomeDir();
  const credentials = resolveAgentCredentials(homeDir, repoPath);
  const agentPriority: AgentPriority = 'claude-first';

  const { codexClient, claudeClient } = setupAgentClients(options.agent, repoPath, credentials, {
    agentPriority,
  });

  if (!codexClient && !claudeClient) {
    throw new Error('Agent mode requires a valid agent configuration.');
  }

  const githubClient = new GitHubClient(undefined, `${options.owner}/${options.repo}`);
  const diff = await githubClient.getPullRequestDiff(options.prNumber);

  const playbook = PromptLoader.loadPrompt(
    'impact-analysis',
    'playbook',
    options.language,
  );

  const guardrailsConfig = createDefaultGuardrailsConfig();
  const guardrailsState = createInitialGuardrailsState();
  const logDir = path.resolve(process.cwd(), 'logs', `pr-${options.prNumber}`);
  const logManager = new LogManager(logDir);

  const context: PipelineContext = {
    options,
    diff,
    playbook,
    guardrails: guardrailsConfig,
    guardrailsState,
    logDir,
  };

  const startedAt = Date.now();
  updateElapsedSeconds(context.guardrailsState, startedAt);

  const scopeResult = await executeScoper(context, codexClient, claudeClient);
  logManager.saveScoperReasoning(scopeResult.reasoning);

  let investigationResult: InvestigationResult;
  if (scopeResult.investigationPoints.length > 0) {
    investigationResult = await executeInvestigator(
      context,
      scopeResult,
      codexClient,
      claudeClient,
      startedAt,
    );
    logManager.saveInvestigatorLog(investigationResult.reasoning);
  } else {
    investigationResult = createEmptyInvestigationResult(context.guardrailsState.reached);
  }

  const report = await executeReporter(context, investigationResult, codexClient, claudeClient);
  logManager.saveReporterOutput(report.markdown);

  if (!options.dryRun) {
    const commentResult = await githubClient.postPRComment(options.prNumber, report.markdown);
    report.commentResult = commentResult;

    if (commentResult.success) {
      logger.info(`PRコメント投稿完了: ${commentResult.commentUrl}`);
    } else {
      logger.warn(`PRコメント投稿失敗: ${commentResult.error}`);
      const localPath = logManager.saveReportFallback(report.markdown);
      report.localFilePath = localPath;
    }
  } else {
    const localPath = logManager.saveDryRunReport(report.markdown);
    report.localFilePath = localPath;
    logger.info(`Dry-runモード: レポートをローカルに保存しました: ${localPath}`);
  }

  logManager.savePipelineSummary({
    prNumber: options.prNumber,
    findingsCount: report.findingsCount,
    patternsMatched: report.patternsMatched,
    guardrailsReached: report.guardrailsReached,
    tokenUsage: investigationResult.tokenUsage,
    toolCallCount: investigationResult.toolCallCount,
    dryRun: options.dryRun,
    diffTruncated: diff.truncated,
    filesChanged: diff.filesChanged,
  });

  logger.info('impact-analysis コマンド完了');
}

/**
 * CLIオプションを解析・バリデーションする。
 */
export function parseOptions(rawOptions: RawImpactAnalysisOptions): ImpactAnalysisOptions {
  const hasPr = typeof rawOptions.pr === 'string';
  const hasPrUrl = typeof rawOptions.prUrl === 'string';

  if (hasPr && hasPrUrl) {
    throw new Error('--pr と --pr-url は同時に指定できません');
  }

  let prNumber: number;
  let owner: string;
  let repo: string;

  if (hasPrUrl && rawOptions.prUrl) {
    const parsed = parsePullRequestUrl(rawOptions.prUrl);
    prNumber = parsed.prNumber;
    owner = parsed.owner;
    repo = parsed.repo;
  } else if (hasPr && rawOptions.pr) {
    prNumber = Number.parseInt(rawOptions.pr, 10);
    if (!Number.isFinite(prNumber) || prNumber < 1) {
      throw new Error(`無効なPR番号: "${rawOptions.pr}"`);
    }
    const repository = config.getGitHubRepository();
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY 環境変数が設定されていません');
    }
    const [o, r] = repository.split('/');
    if (!o || !r) {
      throw new Error(`無効なリポジトリ名: ${repository}`);
    }
    owner = o;
    repo = r;
  } else {
    throw new Error('--pr または --pr-url のいずれかを指定してください');
  }

  const agentMode = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agentMode)) {
    throw new Error(`無効なエージェントモード: "${agentMode}"`);
  }

  const language = (rawOptions.language ?? 'ja').trim().toLowerCase();
  if (!['ja', 'en'].includes(language)) {
    throw new Error(`無効な言語: "${rawOptions.language}"`);
  }

  const dryRun = rawOptions.dryRun ?? false;

  let customInstruction: string | undefined;
  if (typeof rawOptions.customInstruction === 'string') {
    const trimmed = rawOptions.customInstruction.trim();
    if (!trimmed) {
      throw new Error('custom-instruction must not be empty.');
    }
    if (trimmed.length > MAX_CUSTOM_INSTRUCTION_LENGTH) {
      throw new Error(
        `Custom instruction exceeds maximum length (${MAX_CUSTOM_INSTRUCTION_LENGTH} characters).`,
      );
    }
    customInstruction = trimmed;
  }

  return {
    prNumber,
    owner,
    repo,
    customInstruction,
    agent: agentMode as 'auto' | 'codex' | 'claude',
    dryRun,
    language: language as 'ja' | 'en',
  };
}

function createEmptyInvestigationResult(guardrailsReached: boolean): InvestigationResult {
  return {
    findings: [],
    completedPoints: [],
    incompletePoints: [],
    guardrailsReached,
    guardrailDetails: undefined,
    reasoning: '調査観点がないためInvestigatorステージをスキップしました。',
    toolCallCount: 0,
    tokenUsage: 0,
  };
}
