import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { config } from '../../core/config.js';
import { PRCommentFinalizeOptions } from '../../types/commands.js';
import { ResolutionSummary } from '../../types/pr-comment.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';

/**
 * pr-comment finalize コマンドハンドラ
 */
export async function handlePRCommentFinalizeCommand(
  options: PRCommentFinalizeOptions,
): Promise<void> {
  try {
    // PR URLまたはPR番号からリポジトリ情報とPR番号を解決
    const { repositoryName, prNumber, prUrl } = resolvePrInfo(options);

    const repoRoot = prUrl
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

    const completedComments = await metadataManager.getCompletedComments();
    if (completedComments.length === 0) {
      logger.info('No completed comments to finalize.');
      return;
    }

    const githubClient = new GitHubClient(null, repositoryName);
    const dryRun = options.dryRun ?? false;
    const skipCleanup = options.skipCleanup ?? false;
    const shouldSquash = options.squash ?? false;
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

    const squashResult = shouldSquash
      ? await squashCommitsIfRequested(repoRoot, prNumber, metadataManager, {
          dryRun,
          skipCleanup,
        })
      : { squashed: false, metadataCleaned: false };

    if (!skipCleanup && !dryRun && !squashResult.metadataCleaned) {
      await metadataManager.cleanup();
      logger.info('Metadata cleaned up.');
    }

    logger.info(`Finalization completed. Resolved: ${resolvedCount} threads.`);

    if (dryRun) {
      logger.info('[DRY RUN COMPLETE] No actual changes were made.');
    }

    // Git コミット & プッシュ（dry-runでない場合）
    if (!dryRun && resolvedCount > 0 && !squashResult.squashed) {
      const git = simpleGit(repoRoot);

      // Git設定
      const gitUserName = config.getGitCommitUserName() || 'AI Workflow Bot';
      const gitUserEmail = config.getGitCommitUserEmail() || 'ai-workflow@example.com';

      logger.debug(`Configuring Git user: ${gitUserName} <${gitUserEmail}>`);
      await git.addConfig('user.name', gitUserName);
      await git.addConfig('user.email', gitUserEmail);

      logger.info('Committing PR comment finalization...');
      // すべての変更をステージ（削除されたファイルを含む）
      await git.add('.');
      const status = await git.status();
      logger.debug(`Git status reports ${status.files.length} tracked changes.`);
      if (status.files.length > 0) {
        await git.commit(
          `[pr-comment] Finalize PR #${prNumber}: Clean up workflow artifacts (${resolvedCount} threads resolved)`,
        );

        // PRのheadブランチにプッシュ
        const metadata = await metadataManager.load();
        const prBranch = metadata.pr.branch;

        if (!prBranch) {
          logger.error('PR branch information is missing; cannot push finalized changes.');
          return;
        }

        logger.debug(`Pushing to PR branch: ${prBranch}`);
        // 現在のHEADをリモートのprBranchにpush
        await git.push('origin', `HEAD:${prBranch}`);
        logger.info('Finalization committed and pushed to remote.');
      } else {
        logger.info('No changes to commit.');
      }
    }
  } catch (error) {
    logger.error(`Failed to finalize: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * コミットスカッシュ処理（オプション）
 *
 * --squash オプション指定時に、ワークフローで作成されたコミットを1つにまとめる。
 *
 * @param repoRoot - リポジトリルートパス
 * @param prNumber - PR番号
 * @param metadataManager - メタデータマネージャー
 * @param options - スカッシュオプション
 */
async function squashCommitsIfRequested(
  repoRoot: string,
  prNumber: number,
  metadataManager: PRCommentMetadataManager,
  options: { dryRun: boolean; skipCleanup: boolean },
): Promise<{ squashed: boolean; metadataCleaned: boolean }> {
  const baseCommit = metadataManager.getBaseCommit();
  if (!baseCommit) {
    logger.warn('base_commit not found in metadata. Skipping squash.');
    logger.warn('Run "pr-comment init" with the latest version to enable squash.');
    return { squashed: false, metadataCleaned: false };
  }

  const metadata = await metadataManager.getMetadata();
  const summary = metadata.summary;
  const prBranch = metadata.pr.branch;

  if (!prBranch) {
    logger.warn('PR branch information is missing; skipping squash.');
    return { squashed: false, metadataCleaned: false };
  }

  logger.info(`Squashing commits from ${baseCommit.substring(0, 8)} to HEAD...`);

  if (options.dryRun) {
    logger.info('[DRY-RUN] Would squash commits into a single commit.');
    return { squashed: false, metadataCleaned: false };
  }

  const git = simpleGit(repoRoot);

  const currentBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  if (currentBranch === 'main' || currentBranch === 'master') {
    throw new Error(
      `Cannot squash commits on protected branch: ${currentBranch}. ` +
        'Squashing is only allowed on feature branches.',
    );
  }

  const commits = await git.log({ from: baseCommit, to: 'HEAD' });
  if (commits.all.length <= 1) {
    logger.info(`Only ${commits.all.length} commit(s) found. Skipping squash.`);
    return { squashed: false, metadataCleaned: false };
  }

  const gitUserName = config.getGitCommitUserName() || 'AI Workflow Bot';
  const gitUserEmail = config.getGitCommitUserEmail() || 'ai-workflow@example.com';

  logger.debug(`Configuring Git user: ${gitUserName} <${gitUserEmail}>`);
  await git.addConfig('user.name', gitUserName);
  await git.addConfig('user.email', gitUserEmail);

  logger.debug(`Resetting to ${baseCommit}...`);
  await git.reset(['--soft', baseCommit]);

  const message = generateSquashCommitMessage(prNumber, summary);

  logger.debug('Creating squashed commit...');
  await git.commit(message);

  logger.info(`Force pushing to branch: ${prBranch}...`);
  await git.push(['--force-with-lease', 'origin', `HEAD:${prBranch}`]);

  if (!options.skipCleanup) {
    await metadataManager.cleanup();
    logger.info('Metadata cleaned up after successful squash.');
  }

  logger.info('✓ Squashed commits and pushed to remote.');

  return { squashed: true, metadataCleaned: !options.skipCleanup };
}

/**
 * スカッシュ用コミットメッセージを生成
 *
 * @param prNumber - PR番号
 * @param summary - 処理サマリー
 * @returns フォーマットされたコミットメッセージ
 */
function generateSquashCommitMessage(prNumber: number, summary: ResolutionSummary): string {
  const totalComments = summary.total ?? 0;
  const completedCount = summary.by_status?.completed ?? 0;
  const codeChangeCount = summary.by_type?.code_change ?? 0;
  const replyCount = summary.by_type?.reply ?? 0;

  return `[pr-comment] Resolve PR #${prNumber} review comments (${totalComments} comments)

- Addressed ${completedCount} review comments
- Applied ${codeChangeCount} code changes
- Posted ${replyCount} replies

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>`;
}

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
function resolvePrInfo(options: PRCommentFinalizeOptions): {
  repositoryName: string;
  prNumber: number;
  prUrl?: string;
} {
  // --pr-url オプションが指定されている場合
  if (options.prUrl) {
    const prInfo = parsePullRequestUrl(options.prUrl);
    logger.info(`Resolved from PR URL: ${prInfo.repositoryName}#${prInfo.prNumber}`);
    return {
      repositoryName: prInfo.repositoryName,
      prNumber: prInfo.prNumber,
      prUrl: options.prUrl,
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
