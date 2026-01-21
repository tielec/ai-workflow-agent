import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';
import type { PRCommentAnalyzeOptions } from '../../types/commands.js';
import type { CommentMetadata, ResponsePlan } from '../../types/pr-comment.js';
import { refreshComments } from './analyze/comment-fetcher.js';
import { buildResponsePlanMarkdown } from './analyze/markdown-builder.js';
import { commitIfNeeded } from './analyze/git-operations.js';
import { analyzeComments } from './analyze/analyze-runner.js';
import { persistAgentLog } from './analyze/agent-utils.js';
import { __testables as analyzeTestables } from './analyze/index.js';
export async function handlePRCommentAnalyzeCommand(options: PRCommentAnalyzeOptions): Promise<void> {
  let prNumber: number | undefined;
  let repoRoot: string | undefined;
  try {
    const prInfo = resolvePrInfo(options);
    prNumber = prInfo.prNumber;
    const prUrl = prInfo.prUrl;
    repoRoot = prUrl
      ? resolveRepoPathFromPrUrl(prUrl)
      : await getRepoRoot();
    logger.debug(
      prUrl
        ? `Resolved repository path from PR URL: ${repoRoot}`
        : `Using current repository path: ${repoRoot}`,
    );
    const metadataManager = new PRCommentMetadataManager(repoRoot, prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'pr-comment init' first.");
      process.exit(1);
    }
    await metadataManager.load();
    await refreshComments(prNumber, prInfo.repositoryName, metadataManager);
    let pendingComments = await metadataManager.getPendingComments();
    const targetIds = parseCommentIds(options.commentIds);
    if (targetIds.size > 0) {
      pendingComments = pendingComments.filter((c) => targetIds.has(c.comment.id));
    }

    if (pendingComments.length === 0) {
      logger.info('No pending comments to analyze.');
      return;
    }

    const plan = await analyzeComments(prNumber, repoRoot, metadataManager, pendingComments, options);
    const markdown = buildResponsePlanMarkdown(plan);

    if (options.dryRun) {
      logger.info('[DRY-RUN] response-plan.md preview:\n' + markdown);
      return;
    }

    const baseDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`);
    const analyzeDir = path.join(baseDir, 'analyze');
    const outputDir = path.join(baseDir, 'output');
    await fsp.mkdir(analyzeDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });

    await fsp.writeFile(path.join(outputDir, 'response-plan.md'), markdown, 'utf-8');
    if (plan.analyzer_agent !== 'fallback') {
      await metadataManager.clearAnalyzerError();
    }
    await metadataManager.setAnalyzerAgent(plan.analyzer_agent);
    await metadataManager.setAnalyzeCompletedAt(plan.analyzed_at);
    await metadataManager.setResponsePlanPath(path.join(outputDir, 'response-plan.md'));

    await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Analyze completed');
  } catch (error) {
    logger.error(`Failed to analyze PR comments: ${getErrorMessage(error)}`);
    if (error instanceof Error && error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }

    if (repoRoot && prNumber) {
      const baseDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`);
      const logPath = path.join(baseDir, 'analyze', 'agent_log.md');
      try {
        await fsp.access(logPath);
        logger.info(`Agent log saved to: ${logPath}`);
        logger.info('Please check the agent log for detailed error information.');
      } catch {
        // Log file doesn't exist, skip
      }
    }

    process.exit(1);
  }
}

function parseCommentIds(value?: string): Set<number> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => Number.parseInt(v, 10)),
  );
}

function resolvePrInfo(options: PRCommentAnalyzeOptions): {
  repositoryName: string;
  prNumber: number;
  prUrl?: string;
} {
  if (options.prUrl) {
    const prInfo = parsePullRequestUrl(options.prUrl);
    logger.info(`Resolved from PR URL: ${prInfo.repositoryName}#${prInfo.prNumber}`);
    return {
      repositoryName: prInfo.repositoryName,
      prNumber: prInfo.prNumber,
      prUrl: options.prUrl,
    };
  }

  if (options.pr) {
    const githubClient = new GitHubClient();
    const repoInfo = githubClient.getRepositoryInfo();
    const repositoryName = repoInfo.repositoryName;
    const prNumber = Number.parseInt(options.pr, 10);
    logger.info(`Resolved from --pr option: ${repositoryName}#${prNumber}`);
    return {
      repositoryName,
      prNumber,
    };
  }

  throw new Error('Either --pr-url or --pr option is required.');
}

export const __testables = {
  ...analyzeTestables,
  persistAgentLog,
};
