import fs from 'fs-extra';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { ReviewCommentAnalyzer } from '../../core/pr-comment/comment-analyzer.js';
import { CodeChangeApplier } from '../../core/pr-comment/change-applier.js';
import { GitHubClient } from '../../core/github-client.js';
import { PRCommentExecuteOptions } from '../../types/commands.js';
import {
  CommentMetadata,
  CommentResolution,
  ExecutionResult,
  ExecutionResultComment,
  FileChange,
  ProposedChange,
  ResolutionSummary,
  ResponsePlan,
  ResponsePlanComment,
} from '../../types/pr-comment.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import { config } from '../../core/config.js';
import { getRepoRoot } from '../../core/repository-utils.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';

const MAX_RETRY_COUNT = 3;
const RESPONSE_PLAN_FILE = 'response-plan.md';
const EXECUTION_RESULT_FILE = 'execution-result.md';

/**
 * pr-comment execute コマンドハンドラ
 */
export async function handlePRCommentExecuteCommand(
  options: PRCommentExecuteOptions,
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
    const planPath = path.join(
      repoRoot,
      '.ai-workflow',
      `pr-${prNumber}`,
      'output',
      RESPONSE_PLAN_FILE,
    );

    const planExists = await fs.pathExists(planPath);
    if (!planExists) {
      logger.warn("Run 'pr-comment analyze' first for optimized processing. Falling back to legacy flow.");
      await runLegacyFlow(options, metadataManager, repoRoot, prNumber);
      return;
    }

    await runPlannedFlow(options, metadataManager, repoRoot, prNumber, planPath);
  } catch (error) {
    logger.error(`Failed to execute: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * 新フロー（response-plan.md 参照）
 */
async function runPlannedFlow(
  options: PRCommentExecuteOptions,
  metadataManager: PRCommentMetadataManager,
  repoRoot: string,
  prNumber: number,
  planPath: string,
): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const targetIds = parseCommentIds(options.commentIds);
  const plan = await loadResponsePlan(planPath, prNumber, targetIds);
  if (plan.comments.length === 0) {
    logger.info('No plan entries to execute after filtering comment ids.');
    return;
  }

  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  if (!agent) {
    throw new Error('No agent client available for execute phase.');
  }

  const executeDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'execute');
  const outputDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'output');
  const promptPath = path.join(executeDir, 'prompt.txt');
  const logPath = path.join(executeDir, 'agent_log.md');
  const outputJsonPath = path.join(executeDir, 'execution-result.json');
  const resultMdPath = path.join(outputDir, EXECUTION_RESULT_FILE);

  const prompt = await buildExecutePrompt(plan, repoRoot, outputJsonPath);
  if (!dryRun) {
    await fs.ensureDir(executeDir);
    await fs.writeFile(promptPath, prompt, 'utf-8');
  }

  const messages = await agent.executeTask({
    prompt,
    maxTurns: 1,
    verbose: false,
    workingDirectory: repoRoot,
  });

  const rawOutput = messages.join('\n');
  if (!dryRun) {
    await fs.writeFile(logPath, rawOutput, 'utf-8');
  }

  const parsedResult = parseExecutionResult(rawOutput, plan);
  const finalResult = await applyExecutionResult(
    parsedResult,
    plan,
    repoRoot,
    prNumber,
    metadataManager,
    dryRun,
  );

  const markdown = buildExecutionResultMarkdown(finalResult);

  if (dryRun) {
    logger.info('[DRY-RUN] execution-result.md preview:\n' + markdown);
    return;
  }

  await fs.ensureDir(outputDir);
  await fs.writeFile(resultMdPath, markdown, 'utf-8');
  await metadataManager.setExecuteCompletedAt(finalResult.executed_at);
  await metadataManager.setExecutionResultPath(resultMdPath);

  await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Execute completed');
  displayPlannedExecutionSummary(finalResult);
}

/**
 * 旧フロー（response-plan.md 不在時のフォールバック）
 */
async function runLegacyFlow(
  options: PRCommentExecuteOptions,
  metadataManager: PRCommentMetadataManager,
  repoRoot: string,
  prNumber: number,
): Promise<void> {
  let pendingComments = await metadataManager.getPendingComments();
  const targetIds = parseCommentIds(options.commentIds);
  if (targetIds.size > 0) {
    pendingComments = pendingComments.filter((c) => targetIds.has(c.comment.id));
  }

  const inProgress = pendingComments.filter((c) => c.status === 'in_progress');
  if (inProgress.length > 0) {
    logger.warn(`Found ${inProgress.length} in_progress comment(s). Resuming...`);
  }

  if (pendingComments.length === 0) {
    logger.info('No pending comments to process.');
    return;
  }

  const githubClient = new GitHubClient();
  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  const analyzer = new ReviewCommentAnalyzer(
    path.join(repoRoot, 'src', 'prompts'),
    path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analysis'),
  );
  const applier = new CodeChangeApplier(repoRoot);
  const dryRun = options.dryRun ?? false;
  const batchSize = Number.parseInt(options.batchSize ?? '3', 10);

  for (let i = 0; i < pendingComments.length; i += batchSize) {
    const batch = pendingComments.slice(i, i + batchSize);
    for (const comment of batch) {
      await processCommentLegacy(
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
      await commitIfNeeded(
        repoRoot,
        `[ai-workflow] PR Comment: Resolve batch ${Math.floor(i / batchSize) + 1}`,
      );
    }
  }

  const summary = await metadataManager.getSummary();
  displayExecutionSummary(summary, dryRun);

  if (dryRun) {
    logger.info('[DRY RUN COMPLETE] No metadata changes were saved.');
  }
}

async function applyExecutionResult(
  executionResult: ExecutionResult,
  plan: ResponsePlan,
  repoRoot: string,
  prNumber: number,
  metadataManager: PRCommentMetadataManager,
  dryRun: boolean,
): Promise<ExecutionResult> {
  const applier = new CodeChangeApplier(repoRoot);
  const githubClient = new GitHubClient();
  const finalComments: ExecutionResultComment[] = [];

  const planMap = new Map<string, ResponsePlanComment>();
  for (const comment of plan.comments) {
    planMap.set(comment.comment_id, comment);
  }

  for (const comment of executionResult.comments) {
    const planComment = planMap.get(comment.comment_id);
    if (!planComment) {
      continue;
    }

    const actions: string[] = [...(comment.actions ?? [])];
    let status = comment.status;
    let error = comment.error ?? null;
    const replyMessage = comment.reply_message ?? planComment.reply_message;
    const resolution = toResolution(planComment, comment.changes);

    if (planComment.type === 'code_change' && status !== 'failed') {
      const changes = comment.changes ?? convertProposedChanges(planComment.proposed_changes ?? []);
      const applyResult = await applier.apply(changes, dryRun);
      if (!applyResult.success) {
        status = 'failed';
        error = applyResult.error ?? 'Failed to apply changes';
      } else {
        if (applyResult.applied_files.length > 0) {
          actions.push(`Applied ${applyResult.applied_files.length} file(s)`);
        }
        for (const skipped of applyResult.skipped_files) {
          actions.push(`Skipped ${skipped.path}: ${skipped.reason}`);
        }
      }
      comment.changes = changes;
    }

    if (status !== 'failed' && replyMessage) {
      if (dryRun) {
        actions.push(`[dry-run] Would reply to comment #${comment.comment_id}`);
      } else {
        const reply = await githubClient.commentClient.replyToPRReviewComment(
          prNumber,
          Number.parseInt(comment.comment_id, 10),
          replyMessage,
        );
        comment.reply_comment_id = reply.id;
        actions.push(`Posted reply (id: ${reply.id})`);
      }
    }

    if (!dryRun) {
      const finalStatus = status === 'skipped' ? 'skipped' : status === 'failed' ? 'failed' : 'completed';
      await metadataManager.updateCommentStatus(
        comment.comment_id,
        finalStatus,
        resolution,
        error ?? undefined,
      );
    }

    finalComments.push({
      ...comment,
      status,
      actions,
      error,
      reply_message: replyMessage,
      changes: comment.changes,
    });
  }

  return {
    pr_number: executionResult.pr_number,
    executed_at: executionResult.executed_at,
    source_plan: executionResult.source_plan,
    comments: finalComments,
  };
}

function parseExecutionResult(output: string, plan: ResponsePlan): ExecutionResult {
  const planTypeById = new Map<string, ResponsePlanComment>();
  for (const comment of plan.comments) {
    planTypeById.set(String(comment.comment_id), comment);
  }

  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1] : output;
  const parsed = JSON.parse(jsonString) as ExecutionResult;

  if (!parsed.comments || !Array.isArray(parsed.comments)) {
    throw new Error('Invalid execution result: comments missing');
  }

  return {
    pr_number: parsed.pr_number ?? plan.pr_number,
    executed_at: parsed.executed_at ?? new Date().toISOString(),
    source_plan: parsed.source_plan ?? RESPONSE_PLAN_FILE,
    comments: parsed.comments.map((c) => ({
      comment_id: String(c.comment_id),
      status:
        c.status ??
        (planTypeById.get(String(c.comment_id))?.type === 'skip' ? 'skipped' : 'completed'),
      type: c.type ?? planTypeById.get(String(c.comment_id))?.type ?? 'reply',
      actions: c.actions ?? [],
      error: c.error ?? null,
      reply_comment_id: c.reply_comment_id ?? null,
      reply_message: c.reply_message,
      changes: c.changes,
    })),
  };
}

async function loadResponsePlan(
  planPath: string,
  prNumber: number,
  targetIds: Set<number>,
): Promise<ResponsePlan> {
  const content = await fs.readFile(planPath, 'utf-8');
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1] : content;
  const parsed = JSON.parse(jsonString) as ResponsePlan;

  if (!parsed.pr_number || parsed.pr_number !== prNumber) {
    logger.warn(`Plan PR number (${parsed.pr_number}) does not match target PR ${prNumber}. Using target PR.`);
    parsed.pr_number = prNumber;
  }

  parsed.comments = (parsed.comments ?? [])
    .map((c) => normalizePlanComment(c))
    .filter((c) => targetIds.size === 0 || targetIds.has(Number.parseInt(c.comment_id, 10)));

  return parsed;
}

function normalizePlanComment(comment: ResponsePlanComment): ResponsePlanComment {
  const normalized: ResponsePlanComment = {
    comment_id: String(comment.comment_id),
    file: comment.file,
    line: comment.line ?? null,
    author: comment.author,
    body: comment.body,
    type:
      comment.type === 'code_change' && comment.confidence === 'low'
        ? 'discussion'
        : (comment.type ?? 'discussion'),
    confidence: comment.confidence ?? 'medium',
    rationale: comment.rationale,
    proposed_changes: comment.proposed_changes ?? [],
    reply_message: comment.reply_message,
  };

  if (normalized.type === 'code_change' && normalized.confidence === 'low') {
    normalized.type = 'discussion';
    normalized.proposed_changes = [];
  }

  return normalized;
}

async function buildExecutePrompt(
  plan: ResponsePlan,
  repoRoot: string,
  outputFilePath: string,
): Promise<string> {
  const template = await fs.readFile(path.join(repoRoot, 'src', 'prompts', 'pr-comment', 'execute.txt'), 'utf-8');
  const serializedPlan = JSON.stringify(plan, null, 2);

  return template
    .replace('{pr_number}', String(plan.pr_number))
    .replace('{repo_path}', repoRoot)
    .replace('{response_plan}', `\n\`\`\`json\n${serializedPlan}\n\`\`\`\n`)
    .replace('{output_file_path}', outputFilePath);
}

function buildExecutionResultMarkdown(result: ExecutionResult): string {
  const summary = {
    completed: result.comments.filter((c) => c.status === 'completed').length,
    skipped: result.comments.filter((c) => c.status === 'skipped').length,
    failed: result.comments.filter((c) => c.status === 'failed').length,
  };
  const total = result.comments.length;

  let md = '# Execution Result\n\n';
  md += `- PR Number: ${result.pr_number}\n`;
  md += `- Executed At: ${result.executed_at}\n`;
  md += `- Source Plan: ${result.source_plan}\n\n`;

  md += '| Status | Count |\n| --- | --- |\n';
  md += `| Completed | ${summary.completed} |\n`;
  md += `| Skipped | ${summary.skipped} |\n`;
  md += `| Failed | ${summary.failed} |\n`;
  md += `| Total | ${total} |\n\n`;

  const sections: Array<{ title: string; filter: (c: ExecutionResultComment) => boolean }> = [
    { title: 'Completed Comments', filter: (c) => c.status === 'completed' },
    { title: 'Skipped Comments', filter: (c) => c.status === 'skipped' },
    { title: 'Failed Comments', filter: (c) => c.status === 'failed' },
  ];

  for (const section of sections) {
    const items = result.comments.filter(section.filter);
    if (items.length === 0) {
      continue;
    }
    md += `## ${section.title}\n`;
    for (const item of items) {
      md += `- Comment #${item.comment_id} (${item.type})\n`;
      if (item.actions && item.actions.length > 0) {
        md += `  - Actions: ${item.actions.join('; ')}\n`;
      }
      if (item.error) {
        md += `  - Error: ${item.error}\n`;
      }
      if (item.reply_comment_id) {
        md += `  - Reply Comment ID: ${item.reply_comment_id}\n`;
      }
    }
    md += '\n';
  }

  return md;
}

function toResolution(planComment: ResponsePlanComment, changes?: FileChange[]): CommentResolution {
  return {
    type: planComment.type,
    confidence: planComment.confidence,
    changes: planComment.type === 'code_change' ? changes : undefined,
    reply: planComment.reply_message,
    analysis_notes: planComment.rationale,
  };
}

function convertProposedChanges(proposedChanges: ProposedChange[]): FileChange[] {
  return proposedChanges.map((change) => ({
    path: change.file,
    change_type: change.action === 'delete' ? 'delete' : change.action === 'create' ? 'create' : 'modify',
    content: change.changes,
  }));
}

async function processCommentLegacy(
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

    const analysisResult = await analyzer.analyze(commentMeta, { repoPath: repoRoot }, agent);

    if (!analysisResult.success || !analysisResult.resolution) {
      if (!dryRun) {
        const retryCount = await metadataManager.incrementRetryCount(commentId);
        if (retryCount >= MAX_RETRY_COUNT) {
          await metadataManager.updateCommentStatus(
            commentId,
            'failed',
            undefined,
            analysisResult.error ?? 'Analysis failed',
          );
        }
      }
      return;
    }

    const resolution = analysisResult.resolution;

    if (analysisResult.inputTokens && analysisResult.outputTokens && !dryRun) {
      await metadataManager.updateCostTracking(
        analysisResult.inputTokens,
        analysisResult.outputTokens,
        calculateCost(analysisResult.inputTokens, analysisResult.outputTokens),
      );
    }

    if (resolution.type === 'code_change' && resolution.changes?.length) {
      const applyResult = await applier.apply(resolution.changes, dryRun);
      if (!applyResult.success) {
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
    }

    if (dryRun) {
      logger.info(
        `[DRY-RUN] Comment #${commentMeta.comment.id}: ${resolution.type} — ${resolution.reply.slice(0, 80)}`,
      );
      return;
    }

    const reply = await githubClient.commentClient.replyToPRReviewComment(
      prNumber,
      commentMeta.comment.id,
      formatReply(resolution),
    );
    await metadataManager.setReplyCommentId(commentId, reply.id);

    await metadataManager.updateCommentStatus(
      commentId,
      resolution.type === 'skip' ? 'skipped' : 'completed',
      resolution,
    );
  } catch (error) {
    if (!dryRun) {
      await metadataManager.updateCommentStatus(
        commentId,
        'failed',
        undefined,
        getErrorMessage(error),
      );
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

async function commitIfNeeded(repoRoot: string, message: string): Promise<void> {
  const git = simpleGit(repoRoot);
  const status = await git.status();
  if (status.files.length === 0) {
    return;
  }

  await git.add(status.files.map((f) => f.path));
  await git.commit(message);
  logger.info('Changes committed. (Push not executed)');
}

function displayExecutionSummary(summary: ResolutionSummary, dryRun: boolean): void {
  logger.info(
    `Execution summary${dryRun ? ' (dry-run)' : ''}: completed=${summary.by_status.completed}, skipped=${summary.by_status.skipped}, failed=${summary.by_status.failed}`,
  );
}

function displayPlannedExecutionSummary(result: ExecutionResult): void {
  const completed = result.comments.filter((c) => c.status === 'completed').length;
  const skipped = result.comments.filter((c) => c.status === 'skipped').length;
  const failed = result.comments.filter((c) => c.status === 'failed').length;
  logger.info(
    `Execution summary: completed=${completed}, skipped=${skipped}, failed=${failed}`,
  );
}

export const __testables = {
  parseExecutionResult,
  buildExecutionResultMarkdown,
  loadResponsePlan,
};
