import process from 'node:process';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentFinalizeOptions } from '../../types/commands.js';
import { getRepoRoot, parsePullRequestUrl } from '../../core/repository-utils.js';

/**
 * pr-comment finalize コマンドハンドラ
 */
export async function handlePRCommentFinalizeCommand(
  options: PRCommentFinalizeOptions,
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

    const completedComments = await metadataManager.getCompletedComments();
    if (completedComments.length === 0) {
      logger.info('No completed comments to finalize.');
      return;
    }

    const githubClient = new GitHubClient(null, repositoryName);
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

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
function resolvePrInfo(options: PRCommentFinalizeOptions): { repositoryName: string; prNumber: number } {
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
