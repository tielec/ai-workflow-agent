import fs from 'fs-extra';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { config } from '../../core/config.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import { getRepoRoot } from '../../core/repository-utils.js';
import type { PRCommentAnalyzeOptions } from '../../types/commands.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type {
  CommentMetadata,
  ProposedChange,
  ResponsePlan,
  ResponsePlanComment,
} from '../../types/pr-comment.js';

class ParseError extends Error {
  constructor(message: string, public readonly strategy?: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * pr-comment analyze コマンドハンドラ
 */
export async function handlePRCommentAnalyzeCommand(options: PRCommentAnalyzeOptions): Promise<void> {
  try {
    const prNumber = Number.parseInt(options.pr, 10);
    const repoRoot = await getRepoRoot();
    const metadataManager = new PRCommentMetadataManager(repoRoot, prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'pr-comment init' first.");
      process.exit(1);
    }

    await metadataManager.load();
    let pendingComments = await metadataManager.getPendingComments();
    const targetIds = parseCommentIds(options.commentIds);
    if (targetIds.size > 0) {
      pendingComments = pendingComments.filter((c) => targetIds.has(c.comment.id));
    }

    if (pendingComments.length === 0) {
      logger.info('No pending comments to analyze.');
      return;
    }

    const { plan, usedFallback } = await analyzeComments(
      prNumber,
      repoRoot,
      metadataManager,
      pendingComments,
      options,
    );
    const markdown = buildResponsePlanMarkdown(plan);

    if (options.dryRun) {
      logger.info('[DRY-RUN] response-plan.md preview:\n' + markdown);
      if (usedFallback) {
        logger.warn('[DRY-RUN] Fallback plan was used. In actual run, exit code would be 1.');
      }
      return;
    }

    const baseDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`);
    const analyzeDir = path.join(baseDir, 'analyze');
    const outputDir = path.join(baseDir, 'output');
    await fs.ensureDir(analyzeDir);
    await fs.ensureDir(outputDir);

    await fs.writeFile(path.join(outputDir, 'response-plan.md'), markdown, 'utf-8');
    await metadataManager.setAnalyzeCompletedAt(plan.analyzed_at);
    await metadataManager.setResponsePlanPath(path.join(outputDir, 'response-plan.md'));

    if (usedFallback) {
      await metadataManager.setAnalyzeError('Fallback plan used due to parsing failure or empty agent output');
      await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Analyze completed (fallback)');
      logger.error('Analyze completed with fallback plan. Exiting with code 1.');
      process.exit(1);
    }

    await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Analyze completed');
  } catch (error) {
    logger.error(`Failed to analyze PR comments: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

async function analyzeComments(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  options: PRCommentAnalyzeOptions,
): Promise<{ plan: ResponsePlan; usedFallback: boolean }> {
  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  const analyzeDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analyze');
  const outputFilePath = path.join(analyzeDir, 'response-plan.json');
  const prompt = await buildAnalyzePrompt(prNumber, repoRoot, metadataManager, comments, outputFilePath);

  if (!options.dryRun) {
    await fs.ensureDir(analyzeDir);
    await fs.writeFile(path.join(analyzeDir, 'prompt.txt'), prompt, 'utf-8');
  }

  let rawOutput = '';
  if (agent) {
    const messages = await agent.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
      workingDirectory: repoRoot,
    });
    rawOutput = messages.join('\n');

    if (!options.dryRun) {
      await fs.writeFile(path.join(analyzeDir, 'agent_log.md'), rawOutput, 'utf-8');
    }
  }

  let plan: ResponsePlan;
  let usedFallback = false;

  if (rawOutput.trim().length > 0) {
    try {
      plan = parseResponsePlan(rawOutput, prNumber);
    } catch (error) {
      logger.error(`Failed to parse response plan: ${getErrorMessage(error)}`);
      logger.error('All parsing strategies failed. Using fallback plan.');
      plan = buildFallbackPlan(prNumber, comments);
      usedFallback = true;
    }
  } else {
    logger.warn('Agent returned empty output. Using fallback plan.');
    plan = buildFallbackPlan(prNumber, comments);
    usedFallback = true;
  }

  return {
    plan: {
      ...plan,
      analyzed_at: plan.analyzed_at ?? new Date().toISOString(),
      analyzer_agent: usedFallback ? 'fallback' : (plan.analyzer_agent ?? (options.agent ?? 'auto')),
    },
    usedFallback,
  };
}

async function buildAnalyzePrompt(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  outputFilePath: string,
): Promise<string> {
  const template = await fs.readFile(path.join(repoRoot, 'src', 'prompts', 'pr-comment', 'analyze.txt'), 'utf-8');
  const metadata = await metadataManager.getMetadata();

  const commentBlocks: string[] = [];
  for (const meta of comments) {
    commentBlocks.push(await formatCommentBlock(meta, repoRoot));
  }

  return template
    .replace('{pr_number}', String(prNumber))
    .replace('{pr_title}', metadata.pr.title)
    .replace('{repo_path}', repoRoot)
    .replace('{all_comments}', commentBlocks.join('\n\n'))
    .replace('{output_file_path}', outputFilePath);
}

async function formatCommentBlock(meta: CommentMetadata, repoRoot: string): Promise<string> {
  const comment = meta.comment;
  const filePath = comment.path ? path.join(repoRoot, comment.path) : '';
  let fileContent = '(No file content)';
  if (filePath) {
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      fileContent = '(File not found)';
    }
  }

  return [
    `### Comment #${comment.id}`,
    `- File: ${comment.path}`,
    `- Line: ${comment.line ?? comment.end_line ?? 'N/A'}`,
    `- Author: ${comment.user}`,
    '- Body:',
    '```',
    comment.body,
    '```',
    '- Diff:',
    '```diff',
    comment.diff_hunk ?? '(No diff context)',
    '```',
    '- File Content:',
    '```',
    fileContent,
    '```',
  ].join('\n');
}

function parseResponsePlan(rawOutput: string, prNumber: number): ResponsePlan {
  const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB
  if (rawOutput.length > MAX_INPUT_SIZE) {
    throw new ParseError('Input exceeds maximum allowed size (10MB)', 'size_limit');
  }

  const strategies: Array<{ name: string; parse: () => ResponsePlan }> = [
    { name: 'MarkdownCodeBlock', parse: () => parseWithMarkdownCodeBlock(rawOutput, prNumber) },
    { name: 'JSONLines', parse: () => parseWithJSONLines(rawOutput, prNumber) },
    { name: 'PlainJSON', parse: () => parseWithPlainJSON(rawOutput, prNumber) },
  ];

  const errors: string[] = [];
  for (const strategy of strategies) {
    try {
      logger.debug(`Trying parse strategy: ${strategy.name}`);
      const plan = strategy.parse();
      logger.debug(`Parse succeeded with strategy: ${strategy.name}`);
      return plan;
    } catch (error) {
      const message = getErrorMessage(error);
      errors.push(`${strategy.name}: ${message}`);
      logger.debug(`Parse strategy ${strategy.name} failed: ${message}`);
    }
  }

  logger.error('All parsing strategies failed:');
  for (const err of errors) {
    logger.error(`  - ${err}`);
  }
  throw new ParseError('All parsing strategies failed', 'all');
}

function parseWithMarkdownCodeBlock(rawOutput: string, prNumber: number): ResponsePlan {
  const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)```/i);
  if (!jsonMatch) {
    throw new ParseError('No JSON code block found', 'MarkdownCodeBlock');
  }

  const parsed = JSON.parse(jsonMatch[1].trim()) as ResponsePlan;
  return normalizeResponsePlan(parsed, prNumber);
}

function parseWithJSONLines(rawOutput: string, prNumber: number): ResponsePlan {
  const lines = rawOutput.split('\n').filter((line) => line.trim().length > 0);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as ResponsePlan;
      if (parsed.pr_number || line.includes('"pr_number"')) {
        return normalizeResponsePlan(parsed, prNumber);
      }
    } catch {
      // continue to next candidate
    }
  }

  const jsonPattern = /\{[\s\S]*?"pr_number"[\s\S]*?\}(?=\s*$|\s*\{)/g;
  const matches = rawOutput.match(jsonPattern);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const parsed = JSON.parse(lastMatch) as ResponsePlan;
    return normalizeResponsePlan(parsed, prNumber);
  }

  throw new ParseError('No valid JSON Lines format found', 'JSONLines');
}

function parseWithPlainJSON(rawOutput: string, prNumber: number): ResponsePlan {
  const parsed = JSON.parse(rawOutput.trim()) as ResponsePlan;
  return normalizeResponsePlan(parsed, prNumber);
}

function normalizeResponsePlan(parsed: ResponsePlan, prNumber: number): ResponsePlan {
  if (!parsed.pr_number) {
    parsed.pr_number = prNumber;
  }

  parsed.comments = (parsed.comments ?? []).map((c) => normalizePlanComment(c));
  return parsed;
}

function normalizePlanComment(comment: ResponsePlanComment): ResponsePlanComment {
  const proposed = comment.proposed_changes ?? [];
  const normalizedProposed: ProposedChange[] = proposed.map((c) => ({
    action: c.action,
    file: c.file,
    line_range: c.line_range,
    changes: c.changes,
  }));

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
    proposed_changes: normalizedProposed,
    reply_message: comment.reply_message,
  };

  return normalized;
}

function buildFallbackPlan(prNumber: number, comments: CommentMetadata[]): ResponsePlan {
  const now = new Date().toISOString();
  return {
    pr_number: prNumber,
    analyzed_at: now,
    analyzer_agent: 'fallback',
    comments: comments.map((c) => ({
      comment_id: String(c.comment.id),
      file: c.comment.path,
      line: c.comment.line ?? null,
      author: c.comment.user,
      body: c.comment.body,
      type: 'discussion',
      confidence: 'low',
      rationale: 'Fallback plan used because agent output was unavailable.',
      proposed_changes: [],
      reply_message:
        'Thanks for the feedback. This requires manual follow-up. We will review and respond shortly.',
    })),
  };
}

function buildResponsePlanMarkdown(plan: ResponsePlan): string {
  const counts = {
    code_change: plan.comments.filter((c) => c.type === 'code_change').length,
    reply: plan.comments.filter((c) => c.type === 'reply').length,
    discussion: plan.comments.filter((c) => c.type === 'discussion').length,
    skip: plan.comments.filter((c) => c.type === 'skip').length,
  };

  let md = '# Response Plan\n\n';
  md += `- PR Number: ${plan.pr_number}\n`;
  md += `- Analyzed At: ${plan.analyzed_at}\n`;
  md += `- Analyzer Agent: ${plan.analyzer_agent}\n\n`;

  md += '| Type | Count |\n| --- | --- |\n';
  md += `| code_change | ${counts.code_change} |\n`;
  md += `| reply | ${counts.reply} |\n`;
  md += `| discussion | ${counts.discussion} |\n`;
  md += `| skip | ${counts.skip} |\n`;
  md += `| total | ${plan.comments.length} |\n\n`;

  for (const comment of plan.comments) {
    md += `## Comment #${comment.comment_id}\n`;
    md += `- File: ${comment.file ?? 'N/A'}\n`;
    md += `- Line: ${comment.line ?? 'N/A'}\n`;
    md += `- Author: ${comment.author ?? 'N/A'}\n`;
    md += `- Type: ${comment.type} (confidence: ${comment.confidence})\n`;
    md += `- Rationale: ${comment.rationale ?? 'N/A'}\n`;
    md += `- Reply Message: ${comment.reply_message}\n`;
    if (comment.proposed_changes && comment.proposed_changes.length > 0) {
      md += '- Proposed Changes:\n';
      for (const change of comment.proposed_changes) {
        md += `  - [${change.action}] ${change.file} ${change.line_range ?? ''}: ${change.changes}\n`;
      }
    } else {
      md += '- Proposed Changes: (none)\n';
    }
    md += '\n';
  }

  return md;
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

async function setupAgent(
  agentMode: 'auto' | 'codex' | 'claude',
  repoRoot: string,
): Promise<CodexAgentClient | ClaudeAgentClient | null> {
  const homeDir = config.getHomeDir();
  const credentials = resolveAgentCredentials(homeDir, repoRoot);
  const { codexClient, claudeClient } = setupAgentClients(agentMode, repoRoot, credentials);

  if (!codexClient && !claudeClient) {
    logger.warn('No agent client available. Falling back to heuristic plan.');
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

export const __testables = {
  parseResponsePlan,
  parseWithMarkdownCodeBlock,
  parseWithJSONLines,
  parseWithPlainJSON,
  normalizeResponsePlan,
  buildResponsePlanMarkdown,
  ParseError,
};
