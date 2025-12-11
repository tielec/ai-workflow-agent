import fs from 'fs-extra';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { config } from '../../core/config.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';
import type { PRCommentAnalyzeOptions } from '../../types/commands.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type {
  CommentMetadata,
  ProposedChange,
  ResponsePlan,
  ResponsePlanComment,
} from '../../types/pr-comment.js';

/**
 * pr-comment analyze コマンドハンドラ
 */
export async function handlePRCommentAnalyzeCommand(options: PRCommentAnalyzeOptions): Promise<void> {
  let prNumber: number | undefined;
  let repoRoot: string | undefined;

  try {
    // PR URLまたはPR番号からリポジトリ情報とPR番号を解決
    const prInfo = resolvePrInfo(options);
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

    const plan = await analyzeComments(prNumber, repoRoot, metadataManager, pendingComments, options);
    const markdown = buildResponsePlanMarkdown(plan);

    if (options.dryRun) {
      logger.info('[DRY-RUN] response-plan.md preview:\n' + markdown);
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

    await commitIfNeeded(repoRoot, '[ai-workflow] PR Comment: Analyze completed');
  } catch (error) {
    logger.error(`Failed to analyze PR comments: ${getErrorMessage(error)}`);
    if (error instanceof Error && error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }

    // Check if agent log was saved for debugging
    if (repoRoot && prNumber) {
      const baseDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`);
      const logPath = path.join(baseDir, 'analyze', 'agent_log.md');
      if (await fs.pathExists(logPath)) {
        logger.info(`Agent log saved to: ${logPath}`);
        logger.info('Please check the agent log for detailed error information.');
      }
    }

    process.exit(1);
  }
}

async function analyzeComments(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  options: PRCommentAnalyzeOptions,
): Promise<ResponsePlan> {
  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  const analyzeDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analyze');
  const prompt = await buildAnalyzePrompt(prNumber, repoRoot, metadataManager, comments);

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

  if (rawOutput.trim().length === 0) {
    logger.warn('Agent returned empty output. Using fallback plan.');
    const fallbackPlan = buildFallbackPlan(prNumber, comments);
    return {
      ...fallbackPlan,
      analyzed_at: new Date().toISOString(),
      analyzer_agent: options.agent ?? 'auto',
    };
  }

  logger.debug(`Agent output length: ${rawOutput.length} chars`);
  logger.debug(`Agent output preview (first 200 chars): ${rawOutput.substring(0, 200)}`);

  try {
    const plan = parseResponsePlan(rawOutput, prNumber);
    return {
      ...plan,
      analyzed_at: plan.analyzed_at ?? new Date().toISOString(),
      analyzer_agent: plan.analyzer_agent ?? (options.agent ?? 'auto'),
    };
  } catch (error) {
    logger.error(`Failed to parse agent output, using fallback plan: ${getErrorMessage(error)}`);
    const fallbackPlan = buildFallbackPlan(prNumber, comments);
    return {
      ...fallbackPlan,
      analyzed_at: new Date().toISOString(),
      analyzer_agent: 'fallback',
    };
  }
}

async function buildAnalyzePrompt(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
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
    .replace('{all_comments}', commentBlocks.join('\n\n'));
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
  try {
    // Step 1: Extract JSON from markdown code block
    const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1] : rawOutput;

    logger.debug(`Attempting to parse response plan (${jsonString.length} chars)`);

    // Step 2: Parse JSON
    const parsed = JSON.parse(jsonString) as ResponsePlan;

    if (!parsed.pr_number) {
      parsed.pr_number = prNumber;
    }

    parsed.comments = (parsed.comments ?? []).map((c) => normalizePlanComment(c));
    return parsed;
  } catch (error) {
    logger.error(`Failed to parse response plan: ${getErrorMessage(error)}`);
    logger.debug(`Raw output preview (first 500 chars): ${rawOutput.substring(0, 500)}`);

    // Try alternative parsing strategies
    logger.warn('Attempting alternative JSON extraction strategies...');

    // Strategy 1: Extract from JSON Lines format (Codex event stream)
    // Look for the last complete JSON object that contains "comments" field
    try {
      logger.debug('Strategy 1: Searching for JSON in event stream...');
      const lines = rawOutput.split('\n');

      // Search backwards for a line containing valid JSON with "comments" field
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.length === 0) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.comments && Array.isArray(parsed.comments)) {
            logger.debug(`Found valid response plan JSON at line ${i + 1}`);
            if (!parsed.pr_number) {
              parsed.pr_number = prNumber;
            }
            parsed.comments = (parsed.comments ?? []).map((c: ResponsePlanComment) => normalizePlanComment(c));
            return parsed;
          }
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      logger.debug('Strategy 1 failed: No valid JSON with "comments" field found in lines');
    } catch (altError) {
      logger.debug(`Strategy 1 failed: ${getErrorMessage(altError)}`);
    }

    // Strategy 2: Search for plain JSON object (no code block)
    try {
      logger.debug('Strategy 2: Searching for plain JSON object...');
      const plainJsonMatch = rawOutput.match(/\{[\s\S]*"comments"[\s\S]*\}/);
      if (plainJsonMatch) {
        logger.debug('Found plain JSON pattern');
        const parsed = JSON.parse(plainJsonMatch[0]) as ResponsePlan;
        if (!parsed.pr_number) {
          parsed.pr_number = prNumber;
        }
        parsed.comments = (parsed.comments ?? []).map((c) => normalizePlanComment(c));
        return parsed;
      }
      logger.debug('Strategy 2 failed: No plain JSON pattern found');
    } catch (altError) {
      logger.debug(`Strategy 2 failed: ${getErrorMessage(altError)}`);
    }

    // All strategies failed
    logger.error('All parsing strategies failed. Using fallback plan.');
    throw new Error(`Failed to parse agent response: ${getErrorMessage(error)}`);
  }
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

/**
 * PR URLまたはPR番号からリポジトリ情報とPR番号を解決
 */
function resolvePrInfo(options: PRCommentAnalyzeOptions): {
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

export const __testables = {
  parseResponsePlan,
  buildResponsePlanMarkdown,
};
