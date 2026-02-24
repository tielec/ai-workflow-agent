import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { ensureGitConfig } from '../../core/git/git-config-helper.js';
import { GitHubClient } from '../../core/github-client.js';
import { ConflictMetadataManager } from '../../core/conflict/metadata-manager.js';
import { parsePullRequestUrl, resolveRepoPathFromPrUrl } from '../../core/repository-utils.js';
import type { ResolveConflictFinalizeOptions } from '../../types/commands.js';

function buildCommentBody(resultSummary: string | null): string {
  const lines = [
    '## ✅ マージコンフリクト解消レポート',
    '',
    resultSummary ?? '解消結果の詳細はローカルのレポートをご確認ください。',
    '',
    '---',
    '*AI Workflow resolve-conflict*',
  ];

  return lines.join('\n');
}

export async function handleResolveConflictFinalizeCommand(options: ResolveConflictFinalizeOptions): Promise<void> {
  try {
    const prInfo = parsePullRequestUrl(options.prUrl);
    const repoRoot = resolveRepoPathFromPrUrl(options.prUrl);
    const metadataManager = new ConflictMetadataManager(repoRoot, prInfo.prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'resolve-conflict init' first.");
      process.exit(1);
    }

    const metadata = await metadataManager.getMetadata();

    if (options.squash) {
      logger.info('Squash option requested. No additional squash action required for single-resolution commit.');
    }

    // Step 1: Read summary before cleanup deletes the file
    let summary: string | null = null;
    if (metadata.resolutionResultPath) {
      try {
        summary = await fsp.readFile(metadata.resolutionResultPath, 'utf-8');
      } catch (error) {
        logger.warn(`Failed to load resolution result: ${getErrorMessage(error)}`);
      }
    }

    // Step 2: Cleanup artifacts, commit, and push
    const git = simpleGit(repoRoot);
    await ensureGitConfig(git);

    const workflowPath = `.ai-workflow/conflict-${prInfo.prNumber}`;
    await metadataManager.cleanup();

    try {
      await git.raw(['add', '--all', workflowPath]);
      const status = await git.status();
      const stagedFiles = status.files.filter((f) => f.path.startsWith(workflowPath));
      if (stagedFiles.length > 0) {
        await git.commit(`resolve-conflict: cleanup artifacts for PR #${prInfo.prNumber}`);
        logger.info(`Committed cleanup of ${stagedFiles.length} artifact file(s).`);
      } else {
        logger.info('No artifact files to clean up.');
      }
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit artifact cleanup: ${getErrorMessage(commitError)}`);
    }

    // Step 3: Push (includes both merge commit and cleanup commit)
    if (options.push) {
      const branchStatus = await git.status();
      const branchName = branchStatus.current ?? metadata.headBranch;
      if (!branchName) {
        throw new Error('Unable to determine branch name for push.');
      }
      await git.push('origin', branchName);
      logger.info(`Pushed resolved changes to origin/${branchName}`);
    }

    // Step 4: Post PR comment
    const githubClient = new GitHubClient(undefined, prInfo.repositoryName);
    await githubClient.postComment(prInfo.prNumber, buildCommentBody(summary));

    logger.info('Finalize completed. Metadata cleaned up.');
  } catch (error) {
    logger.error(`Failed to finalize resolve-conflict: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
