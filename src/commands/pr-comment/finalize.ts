import process from 'node:process';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentFinalizeOptions } from '../../types/commands.js';
import { getRepoRoot } from '../../core/repository-utils.js';

/**
 * pr-comment finalize コマンドハンドラ
 */
export async function handlePRCommentFinalizeCommand(
  options: PRCommentFinalizeOptions,
): Promise<void> {
  try {
    const prNumber = Number.parseInt(options.pr, 10);
    const repoRoot = await getRepoRoot();
    const metadataManager = new PRCommentMetadataManager(repoRoot, prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'pr-comment init' first.");
      process.exit(1);
    }

    await metadataManager.load();

    const completedComments = await metadataManager.getCompletedComments();
    if (completedComments.length === 0) {
      logger.info('No completed comments to finalize.');
      return;
    }

    const githubClient = new GitHubClient();
    const dryRun = options.dryRun ?? false;
    let resolvedCount = 0;

    for (const comment of completedComments) {
      const threadId = comment.comment.thread_id;
      if (!threadId) {
        logger.warn(`No thread_id for comment #${comment.comment.id}, skipping...`);
        continue;
      }

      if (dryRun) {
        logger.info(`[DRY-RUN] Would resolve thread: ${threadId}`);
        resolvedCount += 1;
        continue;
      }

      try {
        await githubClient.commentClient.resolveReviewThread(threadId);
        await metadataManager.setResolved(String(comment.comment.id));
        resolvedCount += 1;
        logger.info(`Resolved thread for comment #${comment.comment.id}`);
      } catch (error) {
        logger.warn(
          `Failed to resolve thread for comment #${comment.comment.id}: ${getErrorMessage(error)}`,
        );
      }
    }

    if (!options.skipCleanup && !dryRun) {
      await metadataManager.cleanup();
      logger.info('Metadata cleaned up.');
    }

    logger.info(`Finalization completed. Resolved: ${resolvedCount} threads.`);

    if (dryRun) {
      logger.info('[DRY RUN COMPLETE] No actual changes were made.');
    }
  } catch (error) {
    logger.error(`Failed to finalize: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
