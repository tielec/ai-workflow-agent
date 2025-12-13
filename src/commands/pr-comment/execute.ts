import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { ReviewCommentAnalyzer } from '../../core/pr-comment/comment-analyzer.js';
import { CodeChangeApplier } from '../../core/pr-comment/change-applier.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentExecuteOptions } from '../../types/commands.js';
import { CommentMetadata, CommentResolution, ResolutionSummary } from '../../types/pr-comment.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import { config } from '../../core/config.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';

let gitConfigured = false; // Git設定済みフラグ

const MAX_RETRY_COUNT = 3;

/**
 * pr-comment execute コマンドハンドラ
 */
export async function handlePRCommentExecuteCommand(
  options: PRCommentExecuteOptions,
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

    const metadata = await metadataManager.load();

    // PRブランチ名を取得
    const prBranch = metadata.pr.branch;

    const githubClient = new GitHubClient(null, repositoryName);
    const promptsDir = path.join(process.cwd(), 'dist', 'prompts');
    const analysisDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analysis');
    const agent = await setupAgent(options.agent ?? 'auto', repoRoot);

    const dryRun = options.dryRun ?? false;
    let pendingComments = await metadataManager.getPendingComments();
    logger.debug(`Initial pending comments count: ${pendingComments.length}`);
    const workflowRoot = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`);
    const responsePlanPath = path.join(workflowRoot, 'analysis', 'response-plan.md');
    const outputDir = path.join(workflowRoot, 'output');
    const executeDir = path.join(workflowRoot, 'execute');
    const outputJsonPath = path.join(executeDir, 'execution-result.json');
    const outputMarkdownPath = path.join(outputDir, 'execution-result.md');
    const planExists = await fs.pathExists(responsePlanPath);

    if (planExists) {
      await runPlannedExecution({
        metadataManager,
        githubClient,
        pendingComments,
        promptsDir,
        repoRoot,
        prNumber,
        prBranch,
        dryRun,
        responsePlanPath,
        outputJsonPath,
        outputMarkdownPath,
        agent,
      });
      return;
    }

    logger.warn("Run 'pr-comment analyze' first for optimized processing. Falling back to legacy flow.");

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
      return;
    }

    logger.info(`Processing ${pendingComments.length} pending comment(s)...`);

    logger.debug(`Prompts directory: ${promptsDir}`);
    logger.debug(`Analysis directory: ${analysisDir}`);

    const analyzer = new ReviewCommentAnalyzer(promptsDir, analysisDir);
    const applier = new CodeChangeApplier(repoRoot);
    const batchSize = Number.parseInt(options.batchSize ?? '3', 10);

    for (let i = 0; i < pendingComments.length; i += batchSize) {
      const batch = pendingComments.slice(i, i + batchSize);
      logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pendingComments.length / batchSize)}: ${batch.length} comment(s)`);

      for (const comment of batch) {
        logger.debug(`Processing comment #${comment.comment.id}...`);
        await processComment(
          comment,
          metadataManager,
          analyzer,
          applier,
          githubClient,
          agent,
          dryRun,
          prNumber,
          repoRoot,
        );
      }

      if (!dryRun) {
        logger.debug(`Committing batch ${Math.floor(i / batchSize) + 1}...`);
        await commitIfNeeded(repoRoot, `[ai-workflow] PR Comment: Resolve batch ${Math.floor(i / batchSize) + 1}`, prBranch);
      }
    }

    const summary = await metadataManager.getSummary();
    displayExecutionSummary(summary, dryRun);

    if (dryRun) {
      logger.info('[DRY RUN COMPLETE] No metadata changes were saved.');
    }
  } catch (error) {
    if (process.env.JEST_WORKER_ID) {
      throw error;
    }
    logger.error(`Failed to execute: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

async function processComment(
  commentMeta: CommentMetadata,
  metadataManager: PRCommentMetadataManager,
  analyzer: ReviewCommentAnalyzer,
  applier: CodeChangeApplier,
  githubClient: GitHubClient,
  agent: CodexAgentClient | ClaudeAgentClient | null,
  dryRun: boolean,
  prNumber: number,
  repoRoot: string,
): Promise<void> {
  const commentId = String(commentMeta.comment.id);

  try {
    if (!dryRun) {
      await metadataManager.updateCommentStatus(commentId, 'in_progress');
    }

    logger.debug(`Analyzing comment #${commentId}...`);
    const analysisResult = await analyzer.analyze(commentMeta, { repoPath: repoRoot }, agent);
    logger.debug(`Analysis result for comment #${commentId}: success=${analysisResult.success}, hasResolution=${!!analysisResult.resolution}, error=${analysisResult.error || 'none'}`);

    if (!analysisResult.success || !analysisResult.resolution) {
      logger.warn(`Analysis failed for comment #${commentId}: ${analysisResult.error ?? 'No resolution returned'}`);
      if (!dryRun) {
        const retryCount = await metadataManager.incrementRetryCount(commentId);
        logger.debug(`Retry count for comment #${commentId}: ${retryCount}/${MAX_RETRY_COUNT}`);
        if (retryCount >= MAX_RETRY_COUNT) {
          await metadataManager.updateCommentStatus(
            commentId,
            'failed',
            undefined,
            analysisResult.error ?? 'Analysis failed',
          );
          logger.info(`Comment #${commentId} marked as failed after ${MAX_RETRY_COUNT} retries`);
        }
      }
      return;
    }

    logger.debug(`Resolution type for comment #${commentId}: ${analysisResult.resolution.type}`);

    const resolution = analysisResult.resolution;

    if (analysisResult.inputTokens && analysisResult.outputTokens && !dryRun) {
      await metadataManager.updateCostTracking(
        analysisResult.inputTokens,
        analysisResult.outputTokens,
        calculateCost(analysisResult.inputTokens, analysisResult.outputTokens),
      );
    }

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
        return;
      }
      logger.debug(`Code changes applied successfully for comment #${commentId}`);
    }

    if (dryRun) {
      logger.info(
        `[DRY-RUN] Comment #${commentMeta.comment.id}: ${resolution.type} — ${resolution.reply.slice(0, 80)}`,
      );
      return;
    }

    logger.debug(`Posting reply to comment #${commentId}...`);
    const reply = await githubClient.commentClient.replyToPRReviewComment(
      prNumber,
      commentMeta.comment.id,
      formatReply(resolution),
    );
    await metadataManager.setReplyCommentId(commentId, reply.id);
    logger.debug(`Reply posted for comment #${commentId}: reply ID ${reply.id}`);

    await metadataManager.updateCommentStatus(
      commentId,
      resolution.type === 'skip' ? 'skipped' : 'completed',
      resolution,
    );
    logger.info(`Comment #${commentId} marked as ${resolution.type === 'skip' ? 'skipped' : 'completed'}`);
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
  }
}

async function setupAgent(
  agentMode: 'auto' | 'codex' | 'claude',
  repoRoot: string,
): Promise<CodexAgentClient | ClaudeAgentClient | null> {
  const homeDir = config.getHomeDir();
  const credentials = resolveAgentCredentials(homeDir, repoRoot);
  const { codexClient, claudeClient } = setupAgentClients(agentMode, repoRoot, credentials);

  if (!codexClient && !claudeClient) {
    logger.warn('No agent client available. Continuing with heuristic responses.');
  }

  return codexClient ?? claudeClient;
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

function calculateCost(inputTokens: number, outputTokens: number): number {
  const rate = 0.000002;
  return (inputTokens + outputTokens) * rate;
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

type PlannedExecutionResult = {
  pr_number: number;
  comments: Array<{
    comment_id: string;
    status?: 'completed' | 'failed' | 'skipped';
    actions?: string[];
    reply_comment_id?: number;
    error?: string;
  }>;
};

const parsePlanContent = (content: string): any => {
  const match = content.match(/```json\s*([\s\S]*?)```/);
  const jsonText = match ? match[1] : content;
  return JSON.parse(jsonText.trim());
};

const parseExecutionOutput = (outputs: string[] | undefined): PlannedExecutionResult => {
  const text = outputs?.filter(Boolean).join('\n') ?? '';
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const jsonText = blocks.length ? blocks[blocks.length - 1][1] : text;
  try {
    const parsed = JSON.parse(jsonText.trim());
    return parsed as PlannedExecutionResult;
  } catch {
    return { pr_number: 0, comments: [] };
  }
};

const buildExecutionSummaryMarkdown = (
  result: PlannedExecutionResult,
  planLookup?: Map<string, any>,
): string => {
  const counts = result.comments.reduce(
    (acc, cur) => {
      const status = cur.status ?? 'completed';
      if (status === 'failed') acc.failed += 1;
      else if (status === 'skipped') acc.skipped += 1;
      else acc.completed += 1;
      return acc;
    },
    { completed: 0, skipped: 0, failed: 0 },
  );

  const lines = [
    '# Execution Result',
    '',
    '| Status | Count |',
    '| --- | --- |',
    `| Completed | ${counts.completed} |`,
    `| Skipped | ${counts.skipped} |`,
    `| Failed | ${counts.failed} |`,
    '',
  ];

  const details: string[] = [];
  for (const comment of result.comments) {
    const type = planLookup?.get(String(comment.comment_id))?.type;
    const label = type ? `Comment #${comment.comment_id} (${type})` : `Comment #${comment.comment_id}`;
    if (comment.status === 'failed') {
      details.push(`- ${label}: ${comment.error ?? 'failed'}`);
    } else if (comment.status === 'skipped') {
      details.push(`- ${label}: skipped`);
    }
  }

  if (details.length > 0) {
    lines.push('## Details', '', ...details, '');
  }

  return lines.join('\n');
};

async function runPlannedExecution(params: {
  metadataManager: PRCommentMetadataManager;
  githubClient: GitHubClient;
  pendingComments: CommentMetadata[];
  promptsDir: string;
  repoRoot: string;
  prNumber: number;
  prBranch: string;
  dryRun: boolean;
  responsePlanPath: string;
  outputJsonPath: string;
  outputMarkdownPath: string;
  agent: CodexAgentClient | ClaudeAgentClient | null;
}): Promise<void> {
  const {
    metadataManager,
    githubClient,
    pendingComments,
    promptsDir,
    repoRoot,
    prNumber,
    prBranch,
    dryRun,
    responsePlanPath,
    outputJsonPath,
    outputMarkdownPath,
    agent,
  } = params;

  try {
    const planContent = await fs.readFile(responsePlanPath, 'utf-8');
    const plan = parsePlanContent(planContent);
    const promptTemplate = await fs.readFile(
      path.join(promptsDir, 'pr-comment', 'execute.txt'),
      'utf-8',
    );
    const planJson = JSON.stringify(plan, null, 2);
    const prompt = promptTemplate
      .replace('{pr_number}', String(prNumber))
      .replace('{repo_path}', repoRoot)
      .replace('{response_plan}', planJson)
      .replace('{output_file_path}', outputJsonPath);

    const agentClient = agent as unknown as { executeTask?: (args: { prompt: string }) => Promise<string[]> };
    if (!agentClient?.executeTask) {
      throw new Error('Agent client not available for execute');
    }

    const agentOutputs = await agentClient.executeTask({ prompt });
    const executionResult = parseExecutionOutput(agentOutputs);

    const planById = new Map<string, any>(
      Array.isArray(plan?.comments)
        ? plan.comments.map((c: any) => [String(c.comment_id), c])
        : [],
    );
    const pendingById = new Map<string, CommentMetadata>(
      pendingComments.map((c) => [String(c.comment.id), c]),
    );
    const resultById = new Map<string, PlannedExecutionResult['comments'][number]>(
      executionResult.comments?.map((c) => [String(c.comment_id), c]) ?? [],
    );

    for (const [commentId, planComment] of planById) {
      const pending = pendingById.get(commentId);

      const execResult = resultById.get(commentId);
      let status = execResult?.status ?? 'completed';

      const changes =
        planComment.type === 'code_change'
          ? (planComment.proposed_changes ?? []).map((c: any) => ({
              path: c.file,
              change_type: c.action,
              content: c.changes,
            }))
          : [];

      if (planComment.type === 'code_change' && changes.length > 0) {
        const applyResult = await new CodeChangeApplier(repoRoot).apply(changes, dryRun);
        if (!applyResult.success) {
          if (!dryRun) {
            status = 'failed';
            if (execResult) {
              execResult.status = 'failed';
              execResult.error = applyResult.error ?? 'Failed to apply changes';
              resultById.set(commentId, execResult);
            } else {
              executionResult.comments.push({
                comment_id: commentId,
                status: 'failed',
                error: applyResult.error ?? 'Failed to apply changes',
              });
              resultById.set(commentId, executionResult.comments[executionResult.comments.length - 1]);
            }
            await metadataManager.updateCommentStatus(
              commentId,
              'failed',
              { type: 'code_change', reply: planComment.reply_message, changes },
              applyResult.error ?? 'Failed to apply changes',
            );
          }
          continue;
        }
      }

      if (dryRun) {
        continue;
      }

      const reply = await githubClient.commentClient.replyToPRReviewComment(
        prNumber,
        pending?.comment.id ?? Number.parseInt(commentId, 10),
        planComment.reply_message ?? '',
      );
      await metadataManager.setReplyCommentId(commentId, reply.id);

      await metadataManager.updateCommentStatus(
        commentId,
        status === 'failed' ? 'failed' : status === 'skipped' ? 'skipped' : 'completed',
        {
          type: planComment.type,
          reply: planComment.reply_message,
          changes,
        } as unknown as CommentResolution,
        execResult?.error,
      );
    }

    if (dryRun) {
      return;
    }

    await fs.ensureDir(path.dirname(outputJsonPath));
    await fs.ensureDir(path.dirname(outputMarkdownPath));
    await fs.writeFile(outputJsonPath, JSON.stringify(executionResult, null, 2));
    await fs.writeFile(outputMarkdownPath, buildExecutionSummaryMarkdown(executionResult, planById));
    await metadataManager.setExecuteCompletedAt();
    await metadataManager.setExecutionResultPath(outputMarkdownPath);
    await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Execute completed', prBranch);
  } catch (error) {
    if (process.env.JEST_WORKER_ID) {
      console.error('[pr-comment execute] planned flow error', error);
    }
    logger.error(`Failed to execute: ${getErrorMessage(error)}`);
    process.exit(1);
  }
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
