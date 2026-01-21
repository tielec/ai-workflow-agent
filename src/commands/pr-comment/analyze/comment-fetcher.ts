import { logger } from '../../../utils/logger.js';
import { getErrorMessage } from '../../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../../core/github-client.js';
import type { ReviewComment } from '../../../types/pr-comment.js';

export async function refreshComments(
  prNumber: number,
  repositoryName: string,
  metadataManager: PRCommentMetadataManager,
): Promise<void> {
  try {
    const githubClient = new GitHubClient(undefined, repositoryName);
    const latestComments = await fetchLatestUnresolvedComments(githubClient, prNumber);
    const metadata = await metadataManager.getMetadata();
    const existingIds = new Set(Object.keys(metadata.comments));
    const replyIds = new Set(
      Object.values(metadata.comments)
        .map((comment) => comment.reply_comment_id)
        .filter((id): id is number => id !== null && id !== undefined),
    );
    const excludedCount = latestComments.filter((comment) => replyIds.has(comment.id)).length;
    if (excludedCount > 0) {
      logger.debug(`Excluded ${excludedCount} AI reply comment(s)`);
    }

    const newComments = latestComments.filter(
      (comment) => !existingIds.has(String(comment.id)) && !replyIds.has(comment.id),
    );

    if (newComments.length === 0) {
      logger.debug('No new comments found.');
      return;
    }

    logger.info(`Found ${newComments.length} new comment(s). Adding to metadata...`);
    await metadataManager.addComments(newComments);
  } catch (error) {
    logger.warn(`Failed to fetch latest comments: ${getErrorMessage(error)}`);
    logger.warn('Proceeding with existing metadata.');
  }
}

export async function fetchLatestUnresolvedComments(
  githubClient: GitHubClient,
  prNumber: number,
): Promise<ReviewComment[]> {
  const unresolvedThreads = await githubClient.commentClient.getUnresolvedPRReviewComments(prNumber);
  logger.debug(`Found ${unresolvedThreads.length} unresolved threads from API`);

  const comments: ReviewComment[] = [];

  for (const thread of unresolvedThreads) {
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId === undefined || comment.databaseId === null) {
        continue;
      }

      comments.push({
        id: comment.databaseId,
        node_id: comment.id,
        path: comment.path ?? '',
        line: comment.line ?? null,
        start_line: comment.startLine ?? null,
        end_line: null,
        body: comment.body ?? '',
        user: comment.author.login ?? 'unknown',
        created_at: comment.createdAt ?? '',
        updated_at: comment.updatedAt ?? '',
        diff_hunk: '',
        in_reply_to_id: undefined,
        thread_id: thread.id,
        pr_number: prNumber,
      });
    }
  }

  if (comments.length === 0) {
    logger.debug('No unresolved threads from GraphQL, falling back to REST API');
    const restComments = await githubClient.commentClient.getPRReviewComments(prNumber);

    return restComments.map((c) => ({
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
      thread_id: undefined,
      pr_number: prNumber,
    }));
  }

  return comments;
}
