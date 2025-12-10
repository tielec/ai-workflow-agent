import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentInitOptions } from '../../types/commands.js';
import { PRInfo, RepositoryInfo, ReviewComment, ResolutionSummary } from '../../types/pr-comment.js';
import { getRepoRoot, parsePullRequestUrl } from '../../core/repository-utils.js';

/**
 * pr-comment init コマンドハンドラ
 */
export async function handlePRCommentInitCommand(options: PRCommentInitOptions): Promise<void> {
  try {
    // PR URLまたはPR番号からリポジトリ情報とPR番号を解決
    const { repositoryName, prNumber } = await resolvePrInfo(options);

    const githubClient = new GitHubClient(null, repositoryName);

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

    // Git コミット & プッシュ
    const git = simpleGit(repoInfo.path);
    const metadataPath = metadataManager.getMetadataPath();
    const relativePath = metadataPath.replace(`${repoInfo.path}/`, '').replace(/\\/g, '/');

    logger.info('Committing PR comment metadata...');
    await git.add(relativePath);
    await git.commit(`[pr-comment] Initialize PR #${prNumber} comment resolution metadata`);

    logger.info('Pushing to remote...');
    await git.push();
    logger.info('Metadata committed and pushed to remote.');
  } catch (error) {
    logger.error(`Failed to initialize: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
async function resolvePrInfo(options: PRCommentInitOptions): Promise<{ repositoryName: string; prNumber: number }> {
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

  // --issue オプションが指定されている場合（後方互換性）
  if (options.issue) {
    const githubClient = new GitHubClient();
    const repoInfo = githubClient.getRepositoryInfo();
    const repositoryName = repoInfo.repositoryName;
    const issueNumber = Number.parseInt(options.issue, 10);
    const prNumber = await githubClient.getPullRequestNumber(issueNumber);
    if (prNumber) {
      logger.info(`Resolved from --issue option: ${repositoryName}#${prNumber}`);
      return {
        repositoryName,
        prNumber,
      };
    }
    throw new Error(`Pull request not found for issue #${options.issue}`);
  }

  throw new Error('Either --pr-url, --pr, or --issue option is required.');
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

  logger.debug(`Found ${unresolvedThreads.length} unresolved threads`);

  for (const thread of unresolvedThreads) {
    logger.debug(`Thread ${thread.id}: isResolved=${thread.isResolved}, comments=${thread.comments.nodes.length}`);
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId !== undefined && comment.databaseId !== null) {
        unresolvedIds.add(comment.databaseId);
        threadMap.set(comment.databaseId, thread.id);
        logger.debug(`  Comment #${comment.databaseId} by ${comment.author.login}: ${comment.body.substring(0, 50)}...`);
      }
    }
  }

  // GraphQLで未解決スレッドが見つかった場合は、そのまま使用
  if (unresolvedIds.size > 0) {
    logger.debug(`Using GraphQL unresolved threads directly (${unresolvedIds.size} comments)`);

    const targetIds = parseCommentIds(commentIds);
    const commentsToProcess: ReviewComment[] = [];

    for (const thread of unresolvedThreads) {
      for (const comment of thread.comments.nodes) {
        if (comment.databaseId !== undefined && comment.databaseId !== null) {
          // --comment-ids フィルタリング
          if (targetIds.size > 0 && !targetIds.has(comment.databaseId)) {
            continue;
          }

          commentsToProcess.push({
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
            diff_hunk: '',  // GraphQLにはdiff_hunkがないため空文字
            in_reply_to_id: undefined,
            thread_id: thread.id,
            pr_number: prNumber,
          });
        }
      }
    }

    logger.debug(`Processed ${commentsToProcess.length} comments from GraphQL threads`);
    return commentsToProcess;
  }

  // GraphQLで未解決スレッドが見つからない場合は、REST APIから全コメントを取得
  const allComments = await githubClient.commentClient.getPRReviewComments(prNumber);
  logger.debug(`Total PR review comments (REST API): ${allComments.length}`);

  const targetIds = parseCommentIds(commentIds);
  let filtered = allComments;
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
