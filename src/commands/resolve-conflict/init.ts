import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { GitHubClient } from '../../core/github-client.js';
import { ConflictMetadataManager } from '../../core/conflict/metadata-manager.js';
import { parsePullRequestUrl, resolveRepoPathFromPrUrl } from '../../core/repository-utils.js';
import type { ResolveConflictInitOptions } from '../../types/commands.js';

export async function handleResolveConflictInitCommand(options: ResolveConflictInitOptions): Promise<void> {
  try {
    const prInfo = parsePullRequestUrl(options.prUrl);
    const repoRoot = resolveRepoPathFromPrUrl(options.prUrl);
    const githubClient = new GitHubClient(undefined, prInfo.repositoryName);

    const pr = await githubClient.getPullRequestInfo(prInfo.prNumber);
    const mergeable = await githubClient.getMergeableStatus(prInfo.prNumber);

    const metadataManager = new ConflictMetadataManager(repoRoot, prInfo.prNumber);
    if (await metadataManager.exists()) {
      logger.warn('Metadata already exists. Skipping initialization.');
      return;
    }

    const git = simpleGit(repoRoot);
    if (pr.base) {
      await git.fetch('origin', pr.base);
    }
    if (pr.head) {
      await git.fetch('origin', pr.head);
    }

    await metadataManager.initialize({
      prNumber: prInfo.prNumber,
      owner: prInfo.owner,
      repo: prInfo.repo,
      mergeable: mergeable.mergeable,
      mergeableState: mergeable.mergeableState ?? undefined,
      conflictFiles: [],
      baseBranch: pr.base,
      headBranch: pr.head,
    });

    logger.info(`Initialization completed. Metadata saved to: ${metadataManager.getMetadataPath()}`);
  } catch (error) {
    logger.error(`Failed to initialize resolve-conflict: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
