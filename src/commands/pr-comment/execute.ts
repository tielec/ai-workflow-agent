import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { ReviewCommentAnalyzer } from '../../core/pr-comment/comment-analyzer.js';
import { CodeChangeApplier } from '../../core/pr-comment/change-applier.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentExecuteOptions } from '../../types/commands.js';
import { CommentMetadata, CommentResolution, ResolutionSummary } from '../../types/pr-comment.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import { config } from '../../core/config.js';
import { getRepoRoot, parsePullRequestUrl } from '../../core/repository-utils.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';

let gitConfigured = false; // Git設定済みフラグ

const MAX_RETRY_COUNT = 3;

/**
 * pr-comment execute コマンドハンドラ
 */
export async function handlePRCommentExecuteCommand(
  options: PRCommentExecuteOptions,
): Promise<void> {
  try {
    // PR URLまたはPR番号からリポジトリ情報とPR番号を解決
    const { repositoryName, prNumber } = resolvePrInfo(options);

    const repoRoot = await getRepoRoot();
    const metadataManager = new PRCommentMetadataManager(repoRoot, prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'pr-comment init' first.");
      process.exit(1);
    }

    await metadataManager.load();

    let pendingComments = await metadataManager.getPendingComments();
    const targetIds = parseCommentIds(options.commentIds);
    if (targetIds.size > 0) {
      pendingComments = pendingComments.filter((c) => targetIds.has(c.comment.id));
    }

    const inProgress = pendingComments.filter((c) => c.status === 'in_progress');
    if (inProgress.length > 0) {
      logger.warn(`Found ${inProgress.length} in_progress comment(s). Resuming...`);
    }

    if (pendingComments.length === 0) {
      logger.info('No pending comments to process.');
      return;
    }

    const githubClient = new GitHubClient(null, repositoryName);
    const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
    const analyzer = new ReviewCommentAnalyzer(
      path.join(repoRoot, 'src', 'prompts'),
      path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analysis'),
    );
    const applier = new CodeChangeApplier(repoRoot);
    const dryRun = options.dryRun ?? false;
    const batchSize = Number.parseInt(options.batchSize ?? '3', 10);

    for (let i = 0; i < pendingComments.length; i += batchSize) {
      const batch = pendingComments.slice(i, i + batchSize);
      for (const comment of batch) {
        await processComment(
          comment,
          metadataManager,
          analyzer,
          applier,
          githubClient,
          agent,
          dryRun,
          prNumber,
          repoRoot,
        );
      }

      if (!dryRun) {
        await commitIfNeeded(repoRoot, `[ai-workflow] PR Comment: Resolve batch ${Math.floor(i / batchSize) + 1}`);
      }
    }

    const summary = await metadataManager.getSummary();
    displayExecutionSummary(summary, dryRun);

    if (dryRun) {
      logger.info('[DRY RUN COMPLETE] No metadata changes were saved.');
    }
  } catch (error) {
    logger.error(`Failed to execute: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

async function processComment(
  commentMeta: CommentMetadata,
  metadataManager: PRCommentMetadataManager,
  analyzer: ReviewCommentAnalyzer,
  applier: CodeChangeApplier,
  githubClient: GitHubClient,
  agent: CodexAgentClient | ClaudeAgentClient | null,
  dryRun: boolean,
  prNumber: number,
  repoRoot: string,
): Promise<void> {
  const commentId = String(commentMeta.comment.id);

  try {
    if (!dryRun) {
      await metadataManager.updateCommentStatus(commentId, 'in_progress');
    }

    const analysisResult = await analyzer.analyze(commentMeta, { repoPath: repoRoot }, agent);

    if (!analysisResult.success || !analysisResult.resolution) {
      if (!dryRun) {
        const retryCount = await metadataManager.incrementRetryCount(commentId);
        if (retryCount >= MAX_RETRY_COUNT) {
          await metadataManager.updateCommentStatus(
            commentId,
            'failed',
            undefined,
            analysisResult.error ?? 'Analysis failed',
          );
        }
      }
      return;
    }

    const resolution = analysisResult.resolution;

    if (analysisResult.inputTokens && analysisResult.outputTokens && !dryRun) {
      await metadataManager.updateCostTracking(
        analysisResult.inputTokens,
        analysisResult.outputTokens,
        calculateCost(analysisResult.inputTokens, analysisResult.outputTokens),
      );
    }

    if (resolution.type === 'code_change' && resolution.changes?.length) {
      const applyResult = await applier.apply(resolution.changes, dryRun);
      if (!applyResult.success) {
        if (!dryRun) {
          await metadataManager.updateCommentStatus(
            commentId,
            'failed',
            resolution,
            applyResult.error ?? 'Failed to apply changes',
          );
        }
        return;
      }
    }

    if (dryRun) {
      logger.info(
        `[DRY-RUN] Comment #${commentMeta.comment.id}: ${resolution.type} — ${resolution.reply.slice(0, 80)}`,
      );
      return;
    }

    const reply = await githubClient.commentClient.replyToPRReviewComment(
      prNumber,
      commentMeta.comment.id,
      formatReply(resolution),
    );
    await metadataManager.setReplyCommentId(commentId, reply.id);

    await metadataManager.updateCommentStatus(
      commentId,
      resolution.type === 'skip' ? 'skipped' : 'completed',
      resolution,
    );
  } catch (error) {
    if (!dryRun) {
      await metadataManager.updateCommentStatus(
        commentId,
        'failed',
        undefined,
        getErrorMessage(error),
      );
    } else {
      logger.warn(`[DRY-RUN] Failed to process comment #${commentId}: ${getErrorMessage(error)}`);
    }
  }
}

async function setupAgent(
  agentMode: 'auto' | 'codex' | 'claude',
  repoRoot: string,
): Promise<CodexAgentClient | ClaudeAgentClient | null> {
  const homeDir = config.getHomeDir();
  const credentials = resolveAgentCredentials(homeDir, repoRoot);
  const { codexClient, claudeClient } = setupAgentClients(agentMode, repoRoot, credentials);

  if (!codexClient && !claudeClient) {
    logger.warn('No agent client available. Continuing with heuristic responses.');
  }

  return codexClient ?? claudeClient;
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

function calculateCost(inputTokens: number, outputTokens: number): number {
  const rate = 0.000002;
  return (inputTokens + outputTokens) * rate;
}

function formatReply(resolution: CommentResolution): string {
  return resolution.reply;
}

async function commitIfNeeded(repoRoot: string, message: string): Promise<void> {
  const git = simpleGit(repoRoot);
  const status = await git.status();
  if (status.files.length === 0) {
    return;
  }

  // Git設定（初回のみ）
  if (!gitConfigured) {
    const gitUserName = config.getGitCommitUserName() || 'AI Workflow Bot';
    const gitUserEmail = config.getGitCommitUserEmail() || 'ai-workflow@example.com';

    logger.debug(`Configuring Git user: ${gitUserName} <${gitUserEmail}>`);
    await git.addConfig('user.name', gitUserName);
    await git.addConfig('user.email', gitUserEmail);
    gitConfigured = true;
  }

  await git.add(status.files.map((f) => f.path));
  await git.commit(message);
  logger.info('Changes committed.');

  // プッシュ
  const branchSummary = await git.branch();
  const currentBranch = branchSummary.current;

  if (!currentBranch) {
    throw new Error('Cannot determine current branch');
  }

  logger.debug(`Pushing branch: ${currentBranch}`);
  await git.push('origin', currentBranch);
  logger.info('Changes pushed to remote.');
}

function displayExecutionSummary(summary: ResolutionSummary, dryRun: boolean): void {
  logger.info(
    `Execution summary${dryRun ? ' (dry-run)' : ''}: completed=${summary.by_status.completed}, skipped=${summary.by_status.skipped}, failed=${summary.by_status.failed}`,
  );
}

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
function resolvePrInfo(options: PRCommentExecuteOptions): { repositoryName: string; prNumber: number } {
  // --pr-url オプションが指定されている場合
  if (options.prUrl) {
    const prInfo = parsePullRequestUrl(options.prUrl);
    logger.info(`Resolved from PR URL: ${prInfo.repositoryName}#${prInfo.prNumber}`);
    return {
      repositoryName: prInfo.repositoryName,
      prNumber: prInfo.prNumber,
    };
  }

  // --pr オプションが指定されている場合（後方互換性）
  if (options.pr) {
    // GITHUB_REPOSITORY 環境変数から取得（従来の動作）
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
