import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { CodeChangeApplier } from '../../core/pr-comment/change-applier.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentExecuteOptions } from '../../types/commands.js';
import {
  CommentMetadata,
  CommentResolution,
  ExecutionResult,
  ExecutionResultComment,
  ResponsePlan,
  ResolutionSummary,
} from '../../types/pr-comment.js';
import { config } from '../../core/config.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';
import { LogFormatter } from '../../phases/formatters/log-formatter.js';

let gitConfigured = false; // Git設定済みフラグ

/**
 * pr-comment execute コマンドハンドラ
 */
export async function handlePRCommentExecuteCommand(
  options: PRCommentExecuteOptions,
): Promise<void> {
  const startTime = Date.now();
  const messages: string[] = [];
  let error: Error | null = null;
  let prNumber: number | undefined;
  let repoRoot: string | undefined;

  try {
    // PR URLまたはPR番号からリポジトリ情報とPR番号を解決
    const prInfo = resolvePrInfo(options);
    const repositoryName = prInfo.repositoryName;
    prNumber = prInfo.prNumber;
    const prUrl = prInfo.prUrl;

    repoRoot = prUrl
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

    const metadata = await metadataManager.load();

    // PRブランチ名を取得
    const prBranch = metadata.pr.branch;

    let pendingComments = await metadataManager.getPendingComments();
    logger.debug(`Initial pending comments count: ${pendingComments.length}`);

    const targetIds = parseCommentIds(options.commentIds);
    if (targetIds.size > 0) {
      logger.debug(`Filtering by comment IDs: ${Array.from(targetIds).join(', ')}`);
      pendingComments = pendingComments.filter((c) => targetIds.has(c.comment.id));
      logger.debug(`Filtered pending comments count: ${pendingComments.length}`);
    }

    const inProgress = pendingComments.filter((c) => c.status === 'in_progress');
    if (inProgress.length > 0) {
      logger.warn(`Found ${inProgress.length} in_progress comment(s). Resuming...`);
    }

    if (pendingComments.length === 0) {
      logger.info('No pending comments to process.');
      messages.push('system: No pending comments to process.');
      await persistExecuteLog({ messages, startTime, endTime: Date.now(), prNumber, repoRoot, options, error: null });
      return;
    }

    logger.info(`Processing ${pendingComments.length} pending comment(s)...`);
    messages.push(`system: Processing ${pendingComments.length} pending comment(s)...`);

    const githubClient = new GitHubClient(undefined, repositoryName);
    const responsePlanPath = path.join(
      repoRoot,
      '.ai-workflow',
      `pr-${prNumber}`,
      'output',
      'response-plan.json',
    );

    let responsePlan: ResponsePlan;
    try {
      const responsePlanContent = await fsp.readFile(responsePlanPath, 'utf-8');
      responsePlan = JSON.parse(responsePlanContent);
      logger.info(`Loaded response plan with ${responsePlan.comments.length} comment(s)`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.error('response-plan.json not found. Run "pr-comment analyze" first.');
      } else {
        logger.error(`Failed to parse response-plan.json: ${getErrorMessage(error)}`);
      }
      process.exit(1);
    }

    const applier = new CodeChangeApplier(repoRoot);
    const dryRun = options.dryRun ?? false;
    const batchSize = Number.parseInt(options.batchSize ?? '3', 10);

    for (let i = 0; i < pendingComments.length; i += batchSize) {
      const batch = pendingComments.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(pendingComments.length / batchSize);

      logger.debug(`Processing batch ${batchNum}/${totalBatches}: ${batch.length} comment(s)`);
      messages.push(`system: Processing batch ${batchNum}/${totalBatches}: ${batch.length} comment(s)`);

      for (const comment of batch) {
        logger.debug(`Processing comment #${comment.comment.id}...`);
        messages.push(`system: Processing comment #${comment.comment.id}...`);

        const result = await processComment(
          comment,
          metadataManager,
          applier,
          githubClient,
          responsePlan,
          dryRun,
          prNumber,
          repoRoot,
        );

        messages.push(`system: Comment #${comment.comment.id} ${result.status}`);
      }

      if (!dryRun) {
        logger.debug(`Committing batch ${batchNum}...`);
        messages.push(`system: Committing batch ${batchNum}...`);
        await commitIfNeeded(repoRoot, `[ai-workflow] PR Comment: Resolve batch ${batchNum}`, prBranch);
        messages.push(`system: Batch ${batchNum} committed successfully`);
      }
    }

    const summary = await metadataManager.getSummary();
    displayExecutionSummary(summary, dryRun);
    messages.push(`system: Execution summary: completed=${summary.by_status.completed}, skipped=${summary.by_status.skipped}, failed=${summary.by_status.failed}`);

    if (dryRun) {
      logger.info('[DRY RUN COMPLETE] No metadata changes were saved.');
      messages.push('system: [DRY RUN COMPLETE] No metadata changes were saved.');
    }

    const endTime = Date.now();
    await persistExecuteLog({ messages, startTime, endTime, prNumber, repoRoot, options, error: null });
  } catch (error) {
    const endTime = Date.now();
    const execError = error instanceof Error ? error : new Error(String(error));
    logger.error(`Failed to execute: ${getErrorMessage(error)}`);
    messages.push(`system: Failed to execute: ${getErrorMessage(error)}`);

    // prNumber と repoRoot が初期化されている場合のみログを永続化
    if (prNumber !== undefined && repoRoot !== undefined) {
      await persistExecuteLog({ messages, startTime, endTime, prNumber, repoRoot, options, error: execError });
    }
    process.exit(1);
  }
}

async function processComment(
  commentMeta: CommentMetadata,
  metadataManager: PRCommentMetadataManager,
  applier: CodeChangeApplier,
  githubClient: GitHubClient,
  responsePlan: ResponsePlan,
  dryRun: boolean,
  prNumber: number,
  _repoRoot: string,
): Promise<{ status: string; error?: string }> {
  const commentId = String(commentMeta.comment.id);

  // 既に返信済みのコメントは冪等性のためスキップ
  if (commentMeta.reply_comment_id) {
    logger.info(
      `Comment #${commentId} already has a reply (reply ID: ${commentMeta.reply_comment_id}). Skipping.`,
    );

    if (!dryRun) {
      await metadataManager.updateCommentStatus(commentId, 'skipped', undefined, 'Already replied');
    }

    return { status: 'skipped' };
  }

  try {
    if (!dryRun) {
      await metadataManager.updateCommentStatus(commentId, 'in_progress');
    }

    // response-plan から該当コメントを検索
    const planComment = responsePlan.comments.find((c) => String(c.comment_id) === commentId);

    if (!planComment) {
      logger.warn(`Comment #${commentId} not found in response-plan`);
      if (!dryRun) {
        await metadataManager.updateCommentStatus(
          commentId,
          'failed',
          undefined,
          'Comment not found in response-plan',
        );
      }
      return { status: 'failed', error: 'Comment not found in response-plan' };
    }

    logger.debug(`Processing comment #${commentId} (type: ${planComment.type})`);

    const costTracking = {
      inputTokens: planComment.input_tokens ?? 0,
      outputTokens: planComment.output_tokens ?? 0,
      costUsd: planComment.cost_usd ?? 0,
    };

    const resolution: CommentResolution = {
      type: planComment.type,
      confidence: planComment.confidence,
      reply: planComment.reply_message,
      changes: planComment.proposed_changes?.map((c) => ({
        path: c.file,
        change_type: c.action,
        content: c.changes,
      })),
      analysis_notes: planComment.rationale,
    };

    if (resolution.type === 'code_change' && resolution.changes?.length) {
      logger.debug(`Applying ${resolution.changes.length} code change(s) for comment #${commentId}...`);
      const applyResult = await applier.apply(resolution.changes, dryRun);
      if (!applyResult.success) {
        logger.warn(`Failed to apply changes for comment #${commentId}: ${applyResult.error}`);
        if (!dryRun) {
          await metadataManager.updateCommentStatus(
            commentId,
            'failed',
            resolution,
            applyResult.error ?? 'Failed to apply changes',
          );
        }
        return { status: 'failed', error: applyResult.error ?? 'Failed to apply changes' };
      }
      logger.debug(`Code changes applied successfully for comment #${commentId}`);
    }

    if (dryRun) {
      logger.info(
        `[DRY-RUN] Comment #${commentMeta.comment.id}: ${resolution.type} — ${resolution.reply.slice(0, 80)}`,
      );
      return { status: 'completed (dry-run)' };
    }

    logger.debug(`Posting reply to comment #${commentId}...`);
    const reply = await githubClient.commentClient.replyToPRReviewComment(
      prNumber,
      commentMeta.comment.id,
      formatReply(resolution),
    );
    if (!dryRun) {
      await metadataManager.updateCostTracking(
        costTracking.inputTokens,
        costTracking.outputTokens,
        costTracking.costUsd,
      );
    }
    await metadataManager.setReplyCommentId(commentId, reply.id);
    logger.debug(`Reply posted for comment #${commentId}: reply ID ${reply.id}`);

    await metadataManager.updateCommentStatus(
      commentId,
      resolution.type === 'skip' ? 'skipped' : 'completed',
      resolution,
    );
    const status = resolution.type === 'skip' ? 'skipped' : 'completed';
    logger.info(`Comment #${commentId} marked as ${status}`);
    return { status };
  } catch (error) {
    logger.error(`Exception while processing comment #${commentId}: ${getErrorMessage(error)}`);
    if (!dryRun) {
      await metadataManager.updateCommentStatus(
        commentId,
        'failed',
        undefined,
        getErrorMessage(error),
      );
      logger.info(`Comment #${commentId} marked as failed due to exception`);
    } else {
      logger.warn(`[DRY-RUN] Failed to process comment #${commentId}: ${getErrorMessage(error)}`);
    }
    return { status: 'failed', error: getErrorMessage(error) };
  }
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

function formatReply(resolution: CommentResolution): string {
  return resolution.reply;
}

async function commitIfNeeded(repoRoot: string, message: string, prBranch: string): Promise<void> {
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

  // PRのheadブランチにプッシュ
  logger.debug(`Pushing to PR branch: ${prBranch}`);
  // 現在のHEADをリモートのprBranchにpush
  await git.push('origin', `HEAD:${prBranch}`);
  logger.info('Changes pushed to remote.');
}

function displayExecutionSummary(summary: ResolutionSummary, dryRun: boolean): void {
  logger.info(
    `Execution summary${dryRun ? ' (dry-run)' : ''}: completed=${summary.by_status.completed}, skipped=${summary.by_status.skipped}, failed=${summary.by_status.failed}`,
  );
}

function extractJsonFromBlock(rawOutput: string): any {
  const match = rawOutput.match(/```json\s*([\s\S]*?)```/i);
  const jsonText = match ? match[1] : rawOutput;
  try {
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

function normalizeExecutionComments(
  parsedComments: any[],
  plan: ResponsePlan,
): ExecutionResultComment[] {
  const planMap = new Map(plan.comments.map((c) => [String(c.comment_id), c]));

  return parsedComments.map((comment) => {
    const commentId = String(comment.comment_id ?? comment.id ?? '');
    const planComment = planMap.get(commentId);

    return {
      comment_id: commentId,
      status: comment.status ?? 'failed',
      type: planComment?.type ?? comment.type ?? 'discussion',
      actions: comment.actions ?? [],
      error: comment.error ?? null,
      reply_comment_id: comment.reply_comment_id ?? null,
      reply_message: comment.reply_message ?? planComment?.reply_message,
      changes: comment.changes ?? planComment?.proposed_changes,
    };
  });
}

function parseExecutionResult(rawOutput: string, plan: ResponsePlan): ExecutionResult {
  const parsed = extractJsonFromBlock(rawOutput);
  const comments = Array.isArray(parsed.comments) ? parsed.comments : [];

  const executedAt = parsed.executed_at || new Date().toISOString();

  return {
    pr_number: parsed.pr_number ?? plan.pr_number,
    executed_at: executedAt,
    source_plan: parsed.source_plan ?? 'response-plan.md',
    comments: normalizeExecutionComments(comments, plan),
  };
}

function buildExecutionResultMarkdown(result: ExecutionResult): string {
  const counts = {
    completed: result.comments.filter((c) => c.status === 'completed').length,
    skipped: result.comments.filter((c) => c.status === 'skipped').length,
    failed: result.comments.filter((c) => c.status === 'failed').length,
  };

  const lines: string[] = [
    '# Execution Result',
    `- PR Number: ${result.pr_number}`,
    `- Executed At: ${result.executed_at}`,
    `- Source Plan: ${result.source_plan}`,
    '',
    '## Summary',
    '| Status | Count |',
    '| --- | --- |',
    `| Completed | ${counts.completed} |`,
    `| Skipped | ${counts.skipped} |`,
    `| Failed | ${counts.failed} |`,
    '',
  ];

  const renderSection = (status: ExecutionResultComment['status'], title: string): void => {
    lines.push(`## ${title} Comments`);
    const byStatus = result.comments.filter((c) => c.status === status);
    if (byStatus.length === 0) {
      lines.push('_None_');
      lines.push('');
      return;
    }

    for (const comment of byStatus) {
      const actions = (comment.actions ?? []).join(', ');
      const detail = comment.error ? ` — ${comment.error}` : actions ? ` — ${actions}` : '';
      lines.push(`- #${comment.comment_id} (${comment.type})${detail}`);
    }
    lines.push('');
  };

  renderSection('completed', 'Completed');
  renderSection('skipped', 'Skipped');
  renderSection('failed', 'Failed');

  return lines.join('\n');
}

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
function resolvePrInfo(options: PRCommentExecuteOptions): {
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

/**
 * Execute Log Context（agent_log.md の記録用）
 */
interface ExecuteLogContext {
  messages: string[];
  startTime: number;
  endTime: number;
  prNumber: number;
  repoRoot: string;
  options: PRCommentExecuteOptions;
  error: Error | null;
}

/**
 * execute フロー用のエージェントログを永続化
 *
 * @param context - 実行コンテキスト
 */
async function persistExecuteLog(context: ExecuteLogContext) {
  if (context.options.dryRun) {
    return;
  }

  const executeDir = path.join(
    context.repoRoot,
    '.ai-workflow',
    `pr-${context.prNumber}`,
    'execute',
  );

  const agentLogPath = path.join(executeDir, 'agent_log.md');

  // ディレクトリを作成
  await fsp.mkdir(executeDir, { recursive: true });

  const logFormatter = new LogFormatter();
  const duration = context.endTime - context.startTime;

  try {
    const content = logFormatter.formatAgentLog(
      context.messages,
      context.startTime,
      context.endTime,
      duration,
      context.error,
      'Execute Agent', // execute フローのため固定
    );
    await fsp.writeFile(agentLogPath, content, 'utf-8');
    logger.info(`Execute log saved to: ${agentLogPath}`);
  } catch (formatError) {
    logger.warn(`LogFormatter failed: ${getErrorMessage(formatError)}. Falling back to raw output.`);
    await fsp.writeFile(agentLogPath, context.messages.join('\n'), 'utf-8');
  }
}

export const __testables = {
  parseExecutionResult,
  buildExecutionResultMarkdown,
};
