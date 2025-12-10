import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentInitOptions } from '../../types/commands.js';
import { PRInfo, RepositoryInfo, ReviewComment, ResolutionSummary } from '../../types/pr-comment.js';
import { getRepoRoot } from '../../core/repository-utils.js';

/**
 * pr-comment init コマンドハンドラ
 */
export async function handlePRCommentInitCommand(options: PRCommentInitOptions): Promise<void> {
  try {
    const githubClient = new GitHubClient();
    const prNumber = await resolvePrNumber(options, githubClient);

    logger.info(`Initializing PR comment resolution for PR #${prNumber}...`);

    const prInfo = await fetchPrInfo(githubClient, prNumber);
    const repoInfo = await buildRepositoryInfo(githubClient);
    const comments = await fetchReviewComments(githubClient, prNumber, options.commentIds);

    if (comments.length === 0) {
      logger.warn('No unresolved comments found.');
    }

    const metadataManager = new PRCommentMetadataManager(repoInfo.path, prNumber);
    await metadataManager.initialize(
      prInfo,
      repoInfo,
      comments,
      options.issue ? Number.parseInt(options.issue, 10) : undefined,
    );

    const summary = await metadataManager.getSummary();
    displaySummary(summary);

    logger.info(`Initialization completed. Metadata saved to: ${metadataManager.getMetadataPath()}`);
  } catch (error) {
    logger.error(`Failed to initialize: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

async function resolvePrNumber(options: PRCommentInitOptions, githubClient: GitHubClient): Promise<number> {
  if (options.pr) {
    return Number.parseInt(options.pr, 10);
  }

  if (options.issue) {
    const prNumber = await githubClient.getPullRequestNumber(Number.parseInt(options.issue, 10));
    if (prNumber) {
      return prNumber;
    }
    throw new Error(`Pull request not found for issue #${options.issue}`);
  }

  throw new Error('Either --pr or --issue option is required.');
}

async function fetchPrInfo(githubClient: GitHubClient, prNumber: number): Promise<PRInfo> {
  const info = await githubClient.getPullRequestInfo(prNumber);

  return {
    number: info.number,
    url: info.url,
    title: info.title,
    branch: info.head,
    base_branch: info.base,
    state: info.state,
  };
}

async function buildRepositoryInfo(githubClient: GitHubClient): Promise<RepositoryInfo> {
  const repoMeta = githubClient.getRepositoryInfo();
  const repoPath = await getRepoRoot();
  const git = simpleGit(repoPath);

  let remoteUrl = '';
  try {
    const result = await git.remote(['get-url', 'origin']);
    remoteUrl = result ? result.trim() : '';
  } catch {
    remoteUrl = '';
  }

  return {
    owner: repoMeta.owner,
    repo: repoMeta.repo,
    path: repoPath,
    remote_url: remoteUrl,
  };
}

async function fetchReviewComments(
  githubClient: GitHubClient,
  prNumber: number,
  commentIds?: string,
): Promise<ReviewComment[]> {
  const unresolvedThreads = await githubClient.commentClient.getUnresolvedPRReviewComments(prNumber);
  const unresolvedIds = new Set<number>();
  const threadMap = new Map<number, string>();

  for (const thread of unresolvedThreads) {
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId !== undefined && comment.databaseId !== null) {
        unresolvedIds.add(comment.databaseId);
        threadMap.set(comment.databaseId, thread.id);
      }
    }
  }

  const allComments = await githubClient.commentClient.getPRReviewComments(prNumber);

  let filtered = unresolvedIds.size > 0 ? allComments.filter((c) => unresolvedIds.has(c.id)) : allComments;

  const targetIds = parseCommentIds(commentIds);
  if (targetIds.size > 0) {
    filtered = filtered.filter((c) => targetIds.has(c.id));
  }

  return filtered.map((c) => ({
    id: c.id,
    node_id: c.node_id,
    path: c.path ?? '',
    line: c.line ?? null,
    start_line: c.start_line ?? null,
    end_line: null,
    body: c.body ?? '',
    user: c.user?.login ?? 'unknown',
    created_at: c.created_at ?? '',
    updated_at: c.updated_at ?? '',
    diff_hunk: c.diff_hunk ?? '',
    in_reply_to_id: c.in_reply_to_id ?? undefined,
    thread_id: threadMap.get(c.id),
    pr_number: prNumber,
  }));
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

function displaySummary(summary: ResolutionSummary): void {
  logger.info(`Total comments: ${summary.total}`);
  logger.info(
    `Status => pending: ${summary.by_status.pending}, in_progress: ${summary.by_status.in_progress}, completed: ${summary.by_status.completed}, skipped: ${summary.by_status.skipped}, failed: ${summary.by_status.failed}`,
  );
}
