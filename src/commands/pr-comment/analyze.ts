import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { config } from '../../core/config.js';
import { PromptLoader } from '../../core/prompt-loader.js';
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';
import type { PRCommentAnalyzeOptions } from '../../types/commands.js';
import { CodexAgentClient } from '../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import { LogFormatter } from '../../phases/formatters/log-formatter.js';
import type {
  CommentMetadata,
  CommentResolutionMetadata,
  ProposedChange,
  ResponsePlan,
  ResponsePlanComment,
  AnalyzerErrorType,
  ReviewComment,
} from '../../types/pr-comment.js';

let gitConfigured = false; // Git設定済みフラグ

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
    await refreshComments(prNumber, prInfo.repositoryName, metadataManager);
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
    await fsp.mkdir(analyzeDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });

    await fsp.writeFile(path.join(outputDir, 'response-plan.md'), markdown, 'utf-8');
    if (plan.analyzer_agent !== 'fallback') {
      await metadataManager.clearAnalyzerError();
    }
    await metadataManager.setAnalyzerAgent(plan.analyzer_agent);
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
      try {
        await fsp.access(logPath);
        logger.info(`Agent log saved to: ${logPath}`);
        logger.info('Please check the agent log for detailed error information.');
      } catch {
        // Log file doesn't exist, skip
      }
    }

    process.exit(1);
  }
}

async function refreshComments(
  prNumber: number,
  repositoryName: string,
  metadataManager: PRCommentMetadataManager,
): Promise<void> {
  try {
    const githubClient = new GitHubClient(undefined, repositoryName);
    const latestComments = await fetchLatestUnresolvedComments(githubClient, prNumber);
    const metadata = await metadataManager.getMetadata();
    const existingIds = new Set(Object.keys(metadata.comments));
    const replyIds = new Set(
      Object.values(metadata.comments)
        .map((comment) => comment.reply_comment_id)
        .filter((id): id is number => id !== null && id !== undefined),
    );
    const excludedCount = latestComments.filter((comment) => replyIds.has(comment.id)).length;
    if (excludedCount > 0) {
      logger.debug(`Excluded ${excludedCount} AI reply comment(s)`);
    }

    const newComments = latestComments.filter(
      (comment) => !existingIds.has(String(comment.id)) && !replyIds.has(comment.id),
    );

    if (newComments.length === 0) {
      logger.debug('No new comments found.');
      return;
    }

    logger.info(`Found ${newComments.length} new comment(s). Adding to metadata...`);
    await metadataManager.addComments(newComments);
  } catch (error) {
    logger.warn(`Failed to fetch latest comments: ${getErrorMessage(error)}`);
    logger.warn('Proceeding with existing metadata.');
  }
}

async function fetchLatestUnresolvedComments(
  githubClient: GitHubClient,
  prNumber: number,
): Promise<ReviewComment[]> {
  const unresolvedThreads = await githubClient.commentClient.getUnresolvedPRReviewComments(prNumber);
  logger.debug(`Found ${unresolvedThreads.length} unresolved threads from API`);

  const comments: ReviewComment[] = [];

  for (const thread of unresolvedThreads) {
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId === undefined || comment.databaseId === null) {
        continue;
      }

      comments.push({
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
        diff_hunk: '',
        in_reply_to_id: undefined,
        thread_id: thread.id,
        pr_number: prNumber,
      });
    }
  }

  if (comments.length === 0) {
    logger.debug('No unresolved threads from GraphQL, falling back to REST API');
    const restComments = await githubClient.commentClient.getPRReviewComments(prNumber);

    return restComments.map((c) => ({
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
      thread_id: undefined,
      pr_number: prNumber,
    }));
  }

  return comments;
}

async function analyzeComments(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  options: PRCommentAnalyzeOptions,
): Promise<ResponsePlan> {
  const persistMetadata = !options.dryRun;
  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  const analyzeDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analyze');
  const outputDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'output');
  const outputFilePath = path.join(outputDir, 'response-plan.json');
  const prompt = await buildAnalyzePrompt(
    prNumber,
    repoRoot,
    metadataManager,
    comments,
    outputFilePath,
  );

  if (!options.dryRun) {
    await fsp.mkdir(analyzeDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(analyzeDir, 'prompt.txt'), prompt, 'utf-8');
  }

  if (!agent) {
    const fallbackPlan = await handleAgentError(
      'No agent client available (Codex and Claude both unavailable)',
      'agent_execution_error',
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: agent error handler did not exit or return fallback plan');
  }

  const logFormatter = new LogFormatter();
  const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
  let rawOutput = '';
  let messages: string[] = [];
  const startTime = Date.now();
  let endTime = startTime;

  try {
    messages = await agent.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
      workingDirectory: repoRoot,
    });
    endTime = Date.now();
    rawOutput = messages.join('\n');

    await persistAgentLog(
      {
        messages,
        startTime,
        endTime,
        duration: endTime - startTime,
        agentName,
        error: null,
      },
      analyzeDir,
      options,
      logFormatter,
    );
  } catch (agentError) {
    endTime = Date.now();
    const duration = endTime - startTime;
    const normalizedError =
      agentError instanceof Error ? agentError : new Error(getErrorMessage(agentError));

    await persistAgentLog(
      {
        messages,
        startTime,
        endTime,
        duration,
        agentName,
        error: normalizedError,
      },
      analyzeDir,
      options,
      logFormatter,
    );

    const fallbackPlan = await handleAgentError(
      getErrorMessage(agentError),
      'agent_execution_error',
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: agent error handler did not exit or return fallback plan');
  }

  if (rawOutput.trim().length === 0) {
    const fallbackPlan = await handleEmptyOutputError(
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: empty output handler did not exit or return fallback plan');
  }

  const parseFromRawOutput = async (): Promise<ResponsePlan> => {
    try {
      return parseResponsePlan(rawOutput, prNumber);
    } catch (parseError) {
      const fallbackPlan = await handleParseError(
        parseError as Error,
        metadataManager,
        prNumber,
        comments,
        persistMetadata,
      );

      if (fallbackPlan) {
        return fallbackPlan;
      }

      throw new Error('Unexpected state: parse error handler did not exit or return fallback plan');
    }
  };

  let plan: ResponsePlan;
  let outputFileExists = false;
  try {
    await fsp.access(outputFilePath);
    outputFileExists = true;
  } catch {
    outputFileExists = false;
  }

  if (outputFileExists) {
    try {
      const fileContent = await fsp.readFile(outputFilePath, 'utf-8');
      const parsedPlan = JSON.parse(fileContent) as ResponsePlan;
      const missingPrNumber = parsedPlan.pr_number === undefined || parsedPlan.pr_number === null;
      plan = normalizeResponsePlan(parsedPlan, prNumber);
      if (missingPrNumber) {
        await fsp.writeFile(outputFilePath, JSON.stringify(plan, null, 2), 'utf-8');
      }
      logger.info(`Reading response plan from file: ${outputFilePath}`);
    } catch (fileError) {
      logger.warn(`Failed to parse JSON from file: ${getErrorMessage(fileError)}`);
      logger.warn('Falling back to raw output parsing.');
      plan = await parseFromRawOutput();
    }
  } else {
    logger.warn('Output file not found. Falling back to raw output parsing.');
    plan = await parseFromRawOutput();
  }

  return applyPlanDefaults(plan, options);
}

async function promptUserConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function handleAgentError(
  errorMessage: string,
  errorType: AnalyzerErrorType,
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  logger.error(`Analyze phase failed: ${errorMessage}`);

  if (persistMetadata) {
    await metadataManager.setAnalyzerError(errorMessage, errorType);
  }

  if (config.isCI()) {
    logger.error('CI environment detected. Exiting with error.');
    process.exit(1);
  }

  logger.warn(`[WARNING] Analyze phase failed: ${errorMessage}`);
  logger.warn('');
  logger.warn('A fallback plan has been generated (all comments marked as "discussion").');
  logger.warn('This may result in inaccurate processing.');
  logger.warn('');

  const proceed = await promptUserConfirmation('Do you want to continue with the fallback plan?');

  if (!proceed) {
    logger.info('User cancelled workflow due to analyze failure.');
    process.exit(1);
  }

  logger.info('Continuing with fallback plan...');

  return buildFallbackPlan(prNumber, comments);
}

async function handleEmptyOutputError(
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  return handleAgentError(
    'Agent returned empty output',
    'agent_empty_output',
    metadataManager,
    prNumber,
    comments,
    persistMetadata,
  );
}

async function handleParseError(
  parseError: Error,
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  const errorMessage = `JSON parsing failed: ${parseError.message}`;
  return handleAgentError(
    errorMessage,
    'json_parse_error',
    metadataManager,
    prNumber,
    comments,
    persistMetadata,
  );
}

function applyPlanDefaults(
  plan: ResponsePlan,
  options: PRCommentAnalyzeOptions,
): ResponsePlan {
  return {
    ...plan,
    analyzed_at: plan.analyzed_at ?? new Date().toISOString(),
    analyzer_agent: plan.analyzer_agent ?? (options.agent ?? 'auto'),
  };
}

/**
 * Build analyze prompt with context and output file path instructions.
 */
async function buildAnalyzePrompt(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  outputFilePath: string,
): Promise<string> {
  const template = PromptLoader.loadPrompt('pr-comment', 'analyze');
  const metadata = await metadataManager.getMetadata();

  const threadGroups = groupCommentsByThread(comments);
  const threadBlocks: string[] = [];

  for (const [threadId] of threadGroups) {
    const allThreadComments = getAllThreadComments(metadata, threadId);
    const formatted = await formatThreadBlockWithFiles(
      threadId,
      allThreadComments.length > 0 ? allThreadComments : threadGroups.get(threadId) ?? [],
      repoRoot,
    );
    threadBlocks.push(formatted);
  }

  let commentSection = '';
  if (threadBlocks.length > 0) {
    commentSection = threadBlocks.join('\n\n');
  } else {
    const commentBlocks: string[] = [];
    for (const meta of comments) {
      commentBlocks.push(await formatCommentBlock(meta, repoRoot));
    }
    commentSection = commentBlocks.join('\n\n');
  }

  const metadataSummary = [`PR ${prNumber}: ${metadata.pr.title}`, `Repo: ${repoRoot}`, `Output: ${outputFilePath}`].join('\n');

  const filledTemplate = template
    .replace('{pr_number}', String(prNumber))
    .replace('{pr_title}', metadata.pr.title)
    .replace('{repo_path}', repoRoot)
    .replace('{all_comments}', commentSection)
    .replace('{output_file_path}', outputFilePath);

  return `${metadataSummary}\n\n${filledTemplate}`;
}

function groupCommentsByThread(comments: CommentMetadata[]): Map<string, CommentMetadata[]> {
  const threadGroups = new Map<string, CommentMetadata[]>();

  for (const meta of comments) {
    const threadId = meta.comment.thread_id ?? `unknown-${meta.comment.id}`;
    if (!threadGroups.has(threadId)) {
      threadGroups.set(threadId, []);
    }
    threadGroups.get(threadId)!.push(meta);
  }

  return threadGroups;
}

function getAllThreadComments(
  metadata: CommentResolutionMetadata,
  threadId: string,
): CommentMetadata[] {
  const comments = Object.values(metadata.comments ?? {});
  const toTimestamp = (value: string): number => {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  return comments
    .filter((commentMeta) => {
      const commentThreadId = commentMeta.comment.thread_id ?? `unknown-${commentMeta.comment.id}`;
      return commentThreadId === threadId;
    })
    .sort(
      (a, b) =>
        toTimestamp(a.comment.created_at ?? '') -
        toTimestamp(b.comment.created_at ?? ''),
    );
}

function formatThreadBlock(
  threadId: string,
  comments: CommentMetadata[],
  repoRoot: string,
): string {
  const blocks: string[] = [`### Thread #${threadId}`];

  for (const meta of comments) {
    const comment = meta.comment;
    const isAIReply = meta.reply_comment_id !== null && meta.reply_comment_id !== undefined;
    const label = isAIReply ? '[AI Reply]' : '[User Comment]';
    const lineInfo = comment.line ?? comment.end_line ?? comment.start_line ?? 'N/A';
    const fileInfo = comment.path && comment.path.length > 0 ? comment.path : 'N/A';

    blocks.push(`\n#### Comment #${comment.id} ${label}`);
    blocks.push(`- Author: ${comment.user}`);
    blocks.push(`- Created: ${comment.created_at}`);
    blocks.push(`- File: ${fileInfo}`);
    blocks.push(`- Line: ${lineInfo}`);
    blocks.push('- Body:');
    blocks.push('```');
    blocks.push(comment.body ?? '');
    blocks.push('```');
  }

  return blocks.join('\n');
}

async function formatThreadBlockWithFiles(
  threadId: string,
  comments: CommentMetadata[],
  repoRoot: string,
): Promise<string> {
  const blocks: string[] = [`### Thread #${threadId}`];

  for (const meta of comments) {
    const commentBlock = await formatCommentBlock(meta, repoRoot);
    const isAIReply = meta.reply_comment_id !== null && meta.reply_comment_id !== undefined;
    const label = isAIReply ? '[AI Reply]' : '[User Comment]';
    const labeledBlock = commentBlock.replace(
      /^### Comment #[^\n]+/m,
      `### Comment #${meta.comment.id} ${label}`,
    );
    blocks.push(labeledBlock);
  }

  return blocks.join('\n\n');
}

async function formatCommentBlock(meta: CommentMetadata, repoRoot: string): Promise<string> {
  const comment = meta.comment;
  const filePath = comment.path ? path.join(repoRoot, comment.path) : '';
  let fileContent = '(No file content)';
  if (filePath) {
    try {
      fileContent = await fsp.readFile(filePath, 'utf-8');
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
  logger.debug(`Parsing agent response (${rawOutput.length} chars)`);

  const markdownResult = tryParseMarkdownCodeBlock(rawOutput, prNumber);
  if (markdownResult) {
    logger.debug('Strategy 1 (Markdown Code Block) successful');
    return markdownResult;
  }

  const jsonLinesResult = tryParseJsonLines(rawOutput, prNumber);
  if (jsonLinesResult) {
    logger.debug('Strategy 2 (JSON Lines) successful');
    return jsonLinesResult;
  }

  const plainJsonResult = tryParsePlainJson(rawOutput, prNumber);
  if (plainJsonResult) {
    logger.debug('Strategy 3 (Plain JSON) successful');
    return plainJsonResult;
  }

  logger.error('All parsing strategies failed.');
  logger.debug(`Raw output preview (first 500 chars): ${rawOutput.substring(0, 500)}`);
  throw new Error('Failed to parse agent response: Markdown, JSON Lines, and plain JSON strategies exhausted');
}

function tryParseMarkdownCodeBlock(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 1: Attempting markdown code block extraction...');

  const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    logger.debug('Strategy 1 failed: No markdown code block found');
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as ResponsePlan;
    return normalizeResponsePlan(parsed, prNumber);
  } catch (error) {
    logger.debug(`Strategy 1 failed: JSON parse error - ${getErrorMessage(error)}`);
    return null;
  }
}

function tryParseJsonLines(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 2: Attempting JSON Lines extraction...');

  const lines = rawOutput.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    try {
      const parsed = JSON.parse(line);
      if (isValidResponsePlanCandidate(parsed)) {
        logger.debug(`Strategy 2 successful: Found valid JSON at line ${i + 1}`);
        return normalizeResponsePlan(parsed, prNumber);
      }
    } catch {
      continue;
    }
  }

  const multiLine = parseFromBoundaryCandidates(rawOutput, prNumber, 'Strategy 2 (multi-line)');
  if (multiLine) {
    return multiLine;
  }

  logger.debug('Strategy 2 failed: No valid JSON with "comments" field found');
  return null;
}

function tryParsePlainJson(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 3: Attempting plain JSON extraction...');
  const result = parseFromBoundaryCandidates(rawOutput, prNumber, 'Strategy 3');

  if (!result) {
    logger.debug('Strategy 3 failed: No valid ResponsePlan found in candidates');
  }

  return result;
}

function parseFromBoundaryCandidates(
  rawOutput: string,
  prNumber: number,
  context: string,
): ResponsePlan | null {
  const candidates = findAllJsonObjectBoundaries(rawOutput);
  if (candidates.length === 0) {
    logger.debug(`${context}: No JSON object boundaries found`);
    return null;
  }

  logger.debug(`${context}: Found ${candidates.length} JSON object candidate(s)`);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const { start, end } = candidates[i];
    const candidateStr = rawOutput.substring(start, end + 1);

    try {
      const parsed = JSON.parse(candidateStr);
      if (isValidResponsePlanCandidate(parsed)) {
        logger.debug(`${context}: Valid JSON at position ${start}-${end}`);
        return normalizeResponsePlan(parsed, prNumber);
      }
    } catch (error) {
      logger.debug(`${context}: Candidate at ${start}-${end} parse failed - ${getErrorMessage(error)}`);
    }
  }

  return null;
}

function findAllJsonObjectBoundaries(text: string): Array<{ start: number; end: number }> {
  const boundaries: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
    } else if (char === '}') {
      if (depth > 0) {
        depth--;
      }
      if (depth === 0 && startIndex !== -1) {
        boundaries.push({ start: startIndex, end: i });
        startIndex = -1;
      }
    }
  }

  return boundaries;
}

function isValidResponsePlanCandidate(obj: unknown): obj is ResponsePlan {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  if (!('comments' in candidate)) {
    return false;
  }

  if (!Array.isArray(candidate.comments)) {
    return false;
  }

  return true;
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
  const confidence = comment.confidence ?? 'medium';
  const userApproved = comment.user_approved ?? false;
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
      comment.type === 'code_change' && confidence === 'low' && !userApproved
        ? 'discussion'
        : (comment.type ?? 'discussion'),
    confidence,
    rationale: comment.rationale,
    proposed_changes: normalizedProposed,
    reply_message: comment.reply_message,
    user_approved: userApproved,
  };

  validateProposedChanges(normalized);

  return normalized;
}

/**
 * type=code_change かつ proposed_changes が空の場合に警告を出力する。
 */
function validateProposedChanges(comment: ResponsePlanComment): void {
  if (comment.type !== 'code_change') {
    return;
  }

  if (!comment.proposed_changes || comment.proposed_changes.length === 0) {
    logger.warn(
      `Comment #${comment.comment_id} has type 'code_change' but no proposed_changes. Reply will be posted without code modifications.`,
    );
  }
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

  // Git設定（初回のみ）
  if (!gitConfigured) {
    const gitUserName =
      (typeof config.getGitCommitUserName === 'function' && config.getGitCommitUserName()) ||
      process.env.GIT_COMMIT_USER_NAME ||
      process.env.GIT_AUTHOR_NAME ||
      'AI Workflow Bot';
    const gitUserEmail =
      (typeof config.getGitCommitUserEmail === 'function' && config.getGitCommitUserEmail()) ||
      process.env.GIT_COMMIT_USER_EMAIL ||
      process.env.GIT_AUTHOR_EMAIL ||
      'ai-workflow@example.com';

    logger.debug(`Configuring Git user: ${gitUserName} <${gitUserEmail}>`);
    await git.addConfig('user.name', gitUserName);
    await git.addConfig('user.email', gitUserEmail);
    gitConfigured = true;
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
    logger.warn('No agent client available. Analyze will use a fallback plan or exit based on environment.');
  }

  return codexClient ?? claudeClient;
}

interface AgentLogContext {
  messages: string[];
  startTime: number;
  endTime: number;
  duration: number;
  agentName: string;
  error: Error | null;
}

async function persistAgentLog(
  context: AgentLogContext,
  analyzeDir: string,
  options: PRCommentAnalyzeOptions,
  logFormatter: LogFormatter,
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const agentLogPath = path.join(analyzeDir, 'agent_log.md');

  try {
    const content = logFormatter.formatAgentLog(
      context.messages,
      context.startTime,
      context.endTime,
      context.duration,
      context.error,
      context.agentName,
    );
    await fsp.writeFile(agentLogPath, content, 'utf-8');
  } catch (formatError) {
    logger.warn(`LogFormatter failed: ${getErrorMessage(formatError)}. Falling back to raw output.`);
    await fsp.writeFile(agentLogPath, context.messages.join('\n'), 'utf-8');
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
  findAllJsonObjectBoundaries,
  isValidResponsePlanCandidate,
  normalizePlanComment,
  persistAgentLog,
  refreshComments,
  fetchLatestUnresolvedComments,
  groupCommentsByThread,
  getAllThreadComments,
  formatThreadBlock,
  validateProposedChanges,
};
