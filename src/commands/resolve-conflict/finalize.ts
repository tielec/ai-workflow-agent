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

    if (options.push) {
      const git = simpleGit(repoRoot);
      const status = await git.status();
      const branchName = status.current ?? metadata.headBranch;
      if (!branchName) {
        throw new Error('Unable to determine branch name for push.');
      }
      await git.push('origin', branchName);
      logger.info(`Pushed resolved changes to origin/${branchName}`);
    }

    const githubClient = new GitHubClient(undefined, prInfo.repositoryName);
    let summary: string | null = null;
    if (metadata.resolutionResultPath) {
      try {
        summary = await fsp.readFile(metadata.resolutionResultPath, 'utf-8');
      } catch (error) {
        logger.warn(`Failed to load resolution result: ${getErrorMessage(error)}`);
      }
    }

    await githubClient.postComment(prInfo.prNumber, buildCommentBody(summary));
    await metadataManager.updateStatus('finalized');

    // Cleanup: delete .ai-workflow/conflict-<PR_NUMBER>/ and commit deletion
    const workflowPath = path.join('.ai-workflow', `conflict-${prInfo.prNumber}`);
    await metadataManager.cleanup();

    try {
      const git = simpleGit(repoRoot);
      await ensureGitConfig(git);
      await git.add(['-A', workflowPath]);
      const status = await git.status();
      const deletedFiles = status.deleted.filter((f) => f.startsWith(workflowPath));
      if (deletedFiles.length > 0) {
        await git.commit(`resolve-conflict: cleanup artifacts for PR #${prInfo.prNumber}`);
        logger.info(`Committed cleanup of ${deletedFiles.length} artifact file(s).`);
      } else {
        logger.info('No artifact files to clean up.');
      }
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit artifact cleanup: ${getErrorMessage(commitError)}`);
    }

    logger.info('Finalize completed. Metadata cleaned up.');
  } catch (error) {
    logger.error(`Failed to finalize resolve-conflict: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
