/**
 * split-issue コマンドハンドラ
 *
 * 複雑なGitHub Issueを複数の子Issueに分割し、
 * dry-runではプレビュー、applyでは実際にIssueを作成する。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { resolveAgentCredentials, setupAgentClients } from './execute/agent-setup.js';
import { RepositoryAnalyzer } from '../core/repository-analyzer.js';
import { PromptLoader } from '../core/prompt-loader.js';
import { GitHubClient } from '../core/github-client.js';
import { resolveLocalRepoPath } from '../core/repository-utils.js';
import type { CodexAgentClient } from '../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../core/claude-agent-client.js';
import type { SupportedLanguage } from '../types.js';
import type {
  RawSplitIssueOptions,
  SplitIssueOptions,
  SplitIssueItem,
  SplitAgentResponse,
  SplitIssueResult,
  SplitMetrics,
  BulkIssueResult,
} from '../types/split-issue.js';

const COLOR_RESET = '\x1b[0m';
const COLOR_BOLD = '\x1b[1m';
const COLOR_CYAN = '\x1b[36m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_RED = '\x1b[31m';

/**
 * メインハンドラ
 */
export async function handleSplitIssueCommand(rawOptions: RawSplitIssueOptions): Promise<void> {
  try {
    logger.info('Starting split-issue command...');

    // 1. オプションパース
    const options = parseOptions(rawOptions);
    logger.info(
      `Options: issue=${options.issueNumber}, language=${options.language}, agent=${options.agent}, apply=${options.apply}, maxSplits=${options.maxSplits}`,
    );

    // 2. 環境変数の検証とリポジトリ名取得
    const githubRepository = validateEnvironment();
    logger.info(`GitHub repository: ${githubRepository}`);
    const [, repo] = githubRepository.split('/');

    // 3. GitHubクライアント初期化
    const githubClient = new GitHubClient(undefined, githubRepository);

    // 4. Issue情報取得
    const issueInfo = await githubClient.getIssueInfo(options.issueNumber);
    logger.info(`Fetched issue #${issueInfo.number}: ${issueInfo.title}`);
    if (issueInfo.state === 'closed') {
      logger.warn(`Issue #${issueInfo.number} is closed. Continuing split anyway.`);
    }

    // 5. リポジトリパス解決
    let repoPath: string;
    try {
      repoPath = resolveLocalRepoPath(repo);
      logger.info(`Resolved repository path: ${repoPath}`);
    } catch (error) {
      logger.warn(`Failed to resolve repository path, fallback to CWD: ${getErrorMessage(error)}`);
      repoPath = process.cwd();
    }

    // 6. エージェントクライアント準備
    const credentials = resolveAgentCredentials(config.getHomeDir(), repoPath);
    const { codexClient, claudeClient } = setupAgentClients(options.agent, repoPath, credentials, {
      agentPriority: options.agent === 'codex' ? 'codex-first' : 'claude-first',
    });
    if (!codexClient && !claudeClient) {
      throw new Error('No valid agent configuration available. Set CODEX/CLAUDE credentials.');
    }

    // 7. リポジトリコンテキスト取得
    const repositoryContext = await getRepositoryContext(
      new RepositoryAnalyzer(codexClient, claudeClient),
      repoPath,
    );
    if (repositoryContext.startsWith('Repository path:')) {
      logger.warn('Failed to get repository context. Using fallback repository path.');
    }

    // 8. エージェント実行（JSON出力ファイル経由）
    const agentResponse = await executeSplitWithAgent(
      issueInfo.title,
      issueInfo.body,
      repositoryContext,
      codexClient,
      claudeClient,
      options.language,
      options.agent,
      repoPath,
      options.issueNumber,
      options.maxSplits,
    );

    // 9. バリデーション
    const validatedResponse = validateSplitResponse(agentResponse, options.maxSplits);

    // 10. 結果組み立て
    const metrics = validatedResponse.metrics ?? calculateDefaultMetrics(validatedResponse.issues);
    const result: SplitIssueResult = {
      success: true,
      originalTitle: issueInfo.title,
      originalBody: issueInfo.body,
      splitSummary: validatedResponse.summary,
      splitIssues: validatedResponse.issues,
      metrics,
    };

    // 11. apply/dry-run
    if (options.apply) {
      logger.info('Creating split issues on GitHub...');
      const createdUrls = await createSplitIssues(githubClient, options.issueNumber, result);
      result.createdIssueUrls = createdUrls;
    } else {
      displaySplitPreview(result);
    }

    logger.info('split-issue command completed successfully.');
  } catch (error) {
    logger.error(`split-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * CLIオプションをパース
 */
export function parseOptions(rawOptions: RawSplitIssueOptions): SplitIssueOptions {
  const issueRaw = rawOptions.issue;
  if (issueRaw === undefined || issueRaw === null) {
    throw new Error('--issue option is required.');
  }
  const issueNumber = typeof issueRaw === 'number' ? issueRaw : Number.parseInt(String(issueRaw), 10);
  if (!Number.isFinite(issueNumber) || issueNumber < 1) {
    throw new Error(`Invalid issue number: "${issueRaw}"`);
  }

  const languageRaw = rawOptions.language ?? 'ja';
  if (!['ja', 'en'].includes(languageRaw)) {
    throw new Error(`Invalid language: "${languageRaw}". Allowed values: ja, en`);
  }
  const language = languageRaw as SupportedLanguage;

  const agentRaw = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agentRaw)) {
    throw new Error(`Invalid agent: "${agentRaw}". Allowed values: auto, codex, claude`);
  }
  const agent = agentRaw as 'auto' | 'codex' | 'claude';

  if (rawOptions.apply && rawOptions.dryRun) {
    logger.warn('Both --apply and --dry-run specified. --apply will take precedence.');
  }

  const apply = rawOptions.apply === true;

  const maxSplitsRaw = rawOptions.maxSplits ?? '10';
  const maxSplits = typeof maxSplitsRaw === 'number'
    ? maxSplitsRaw
    : Number.parseInt(String(maxSplitsRaw), 10);
  if (!Number.isFinite(maxSplits) || maxSplits < 1 || maxSplits > 20) {
    throw new Error(`Invalid max-splits: "${maxSplitsRaw}". Allowed range: 1-20`);
  }

  return {
    issueNumber,
    language,
    agent,
    apply,
    maxSplits,
  };
}

/**
 * 環境変数を検証
 */
function validateEnvironment(): string {
  const githubRepository = config.getGitHubRepository();
  if (!githubRepository) {
    throw new Error('GITHUB_REPOSITORY environment variable is required.');
  }

  const [owner, repo] = githubRepository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY format: "${githubRepository}"`);
  }

  return githubRepository;
}

/**
 * リポジトリコンテキストを取得（簡易版）
 */
async function getRepositoryContext(
  analyzer: RepositoryAnalyzer,
  repoPath: string,
): Promise<string> {
  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).slice(0, 10);
    const files = entries.filter((e) => e.isFile()).map((e) => e.name).slice(0, 10);

    const packageJsonPath = path.join(repoPath, 'package.json');
    let packageName = '';
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName = pkg.name ?? '';
      } catch {
        // ignore
      }
    }

    const summary = [
      packageName ? `package: ${packageName}` : '',
      dirs.length ? `dirs: ${dirs.join(', ')}` : '',
      files.length ? `files: ${files.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await (analyzer as any).collectRepositoryCode?.(repoPath);
      if (typeof raw === 'string' && raw.length > 0) {
        return `${summary}\n\n# Code Snippets (truncated)\n${raw.slice(0, 4000)}`;
      }
    } catch {
      // ignore analyzer private method access
    }

    return summary || `Repository path: ${repoPath}`;
  } catch (error) {
    logger.warn(`Failed to get repository context: ${getErrorMessage(error)}`);
    return `Repository path: ${repoPath}`;
  }
}

/**
 * エージェント出力用の一時ファイルパスを生成
 */
export function createOutputFilePath(repoPath: string, issueNumber: number): string {
  const filename = `split-issue-${issueNumber}-${Date.now()}.json`;

  try {
    const tmpDir = path.join(repoPath, '.ai-workflow', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    return path.join(tmpDir, filename);
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'ai-workflow');
    fs.mkdirSync(tmpDir, { recursive: true });
    return path.join(tmpDir, filename);
  }
}

/**
 * エージェントでIssue分割案を生成
 */
async function executeSplitWithAgent(
  originalTitle: string,
  originalBody: string,
  repoContext: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  language: SupportedLanguage,
  agentMode: 'auto' | 'codex' | 'claude',
  repoPath: string,
  issueNumber: number,
  maxSplits: number,
): Promise<SplitAgentResponse> {
  const outputFilePath = createOutputFilePath(repoPath, issueNumber);
  logger.info(`Agent output file: ${outputFilePath}`);

  const promptTemplate = PromptLoader.loadPrompt('split-issue', 'split-issue', language);
  const prompt = promptTemplate
    .replaceAll('{ORIGINAL_TITLE}', originalTitle)
    .replaceAll('{ORIGINAL_BODY}', originalBody)
    .replaceAll('{REPOSITORY_CONTEXT}', repoContext)
    .replaceAll('{OUTPUT_FILE_PATH}', outputFilePath)
    .replaceAll('{MAX_SPLITS}', String(maxSplits));

  let response: string | null = null;

  const tryClaude = agentMode !== 'codex' && claudeClient;
  const tryCodex = agentMode !== 'claude' && codexClient;

  if (tryClaude) {
    try {
      logger.info('Executing with Claude agent...');
      const result = await claudeClient!.executeTask({ prompt });
      response = result.join('\n');
    } catch (error) {
      logger.warn(`Claude agent failed: ${getErrorMessage(error)}`);
    }
  }

  if (!response && tryCodex) {
    try {
      logger.info('Executing with Codex agent...');
      const result = await codexClient!.executeTask({ prompt });
      response = result.join('\n');
    } catch (error) {
      logger.warn(`Codex agent failed: ${getErrorMessage(error)}`);
    }
  }

  if (!response) {
    throw new Error('All agents failed to generate split issue content.');
  }

  const fileResult = readOutputFile(outputFilePath);
  if (fileResult) {
    logger.info('Successfully parsed agent response from output file.');
    return fileResult;
  }

  logger.warn('Output file not found or invalid, falling back to text response parsing.');
  return parseSplitResponseText(response);
}

/**
 * エージェントが書き出したJSONファイルを読み込んでパース
 */
function readOutputFile(outputFilePath: string): SplitAgentResponse | null {
  try {
    if (!fs.existsSync(outputFilePath)) {
      logger.debug(`Output file not found: ${outputFilePath}`);
      return null;
    }

    const content = fs.readFileSync(outputFilePath, 'utf-8').trim();
    if (!content) {
      logger.warn('Output file is empty.');
      return null;
    }

    const parsed = JSON.parse(content);
    const result = buildSplitResponseFromParsed(parsed);

    try {
      fs.unlinkSync(outputFilePath);
    } catch {
      // ignore cleanup errors
    }

    return result;
  } catch (error) {
    logger.warn(`Failed to read/parse output file: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * テキスト応答をパース
 */
export function parseSplitResponseText(response: string): SplitAgentResponse {
  const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlockMatch) {
    const parsed = parseJsonWithRecovery(codeBlockMatch[1].trim());
    if (parsed) {
      return buildSplitResponseFromParsed(parsed);
    }
    logger.debug('Failed to parse code block JSON.');
  }

  const jsonStr = extractJsonObject(response);
  if (jsonStr) {
    const parsed = parseJsonWithRecovery(jsonStr);
    if (parsed) {
      return buildSplitResponseFromParsed(parsed);
    }
    logger.debug('Failed to parse extracted JSON.');
  }

  const structured = parseStructuredSplitText(response);
  if (structured) {
    return structured;
  }

  throw new Error('Failed to parse split-issue agent response.');
}

/**
 * パース済みJSONオブジェクトからSplitAgentResponseを構築
 */
export function buildSplitResponseFromParsed(parsed: Record<string, any>): SplitAgentResponse {
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';

  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const issues: SplitIssueItem[] = rawIssues.map((raw, index) => {
    const titleRaw = raw?.title ?? raw?.name ?? `Issue ${index + 1}`;
    const bodyRaw = raw?.body ?? raw?.description ?? '';
    const labelsRaw = Array.isArray(raw?.labels) ? raw.labels : [];
    const priorityRaw = raw?.priority ?? 'medium';
    const dependenciesRaw = Array.isArray(raw?.dependencies) ? raw.dependencies : [];

    return {
      title: String(titleRaw ?? '').trim(),
      body: String(bodyRaw ?? '').trim(),
      labels: labelsRaw
        .filter((label: unknown) => typeof label === 'string')
        .map((l: string) => l.trim())
        .filter(Boolean),
      priority: String(priorityRaw ?? 'medium').trim(),
      dependencies: dependenciesRaw
        .filter((dep: unknown) => {
          if (typeof dep === 'number') {
            return Number.isFinite(dep);
          }
          if (typeof dep === 'string') {
            const trimmed = dep.trim();
            return trimmed.length > 0 && Number.isFinite(Number(trimmed));
          }
          return false;
        })
        .map((dep: number | string) => Number(dep)),
    };
  });

  const metricsRaw = parsed.metrics;
  const metrics = metricsRaw
    ? {
        completenessScore: normalizeScore(metricsRaw.completeness ?? metricsRaw.completenessScore),
        specificityScore: normalizeScore(metricsRaw.specificity ?? metricsRaw.specificityScore),
      }
    : undefined;

  return {
    summary,
    issues,
    metrics,
  };
}

/**
 * SplitAgentResponse をバリデーション
 */
export function validateSplitResponse(
  response: SplitAgentResponse,
  maxSplits: number,
): SplitAgentResponse {
  if (!response.issues || response.issues.length === 0) {
    throw new Error('No issues found in split response.');
  }

  let issues = response.issues;
  if (issues.length > maxSplits) {
    logger.warn(`Split issues exceed max-splits (${maxSplits}). Truncating to first ${maxSplits} issues.`);
    issues = issues.slice(0, maxSplits);
  }

  const normalizedIssues = issues.map((issue, index) => {
    let title = issue.title?.trim() ?? '';
    if (!title) {
      title = `Issue ${index + 1}`;
      logger.warn(`Issue ${index + 1} title is empty. Using fallback title.`);
    }

    if (title.length > 80) {
      title = `${title.slice(0, 77)}...`;
      logger.warn(`Issue ${index + 1} title exceeds 80 chars. Truncated.`);
    }

    let body = issue.body?.trim() ?? '';
    if (!body) {
      body = '(No description provided)';
      logger.warn(`Issue ${index + 1} body is empty. Using fallback description.`);
    }

    const labels = (issue.labels ?? []).filter(Boolean);

    let priority = (issue.priority ?? 'medium').toLowerCase();
    if (!['high', 'medium', 'low'].includes(priority)) {
      logger.warn(`Issue ${index + 1} priority is invalid: ${issue.priority}. Using 'medium'.`);
      priority = 'medium';
    }

    const dependenciesRaw = issue.dependencies ?? [];
    const dependencies = Array.from(
      new Set(
        dependenciesRaw.filter((dep) => Number.isFinite(dep))
          .map((dep) => Number(dep))
          .filter((dep) => dep >= 0 && dep < issues.length && dep !== index),
      ),
    ).sort((a, b) => a - b);

    if (dependencies.length !== dependenciesRaw.length) {
      logger.warn(`Issue ${index + 1} dependencies adjusted due to invalid references.`);
    }

    return {
      title,
      body,
      labels,
      priority,
      dependencies,
    };
  });

  return {
    summary: response.summary ?? '',
    issues: normalizedIssues,
    metrics: response.metrics,
  };
}

/**
 * フォールバック用のメトリクス計算
 */
export function calculateDefaultMetrics(issues: SplitIssueItem[]): SplitMetrics {
  if (!issues.length) {
    return { completenessScore: 0, specificityScore: 0 };
  }

  const completenessScores: number[] = [];
  const specificityScores: number[] = [];

  for (const issue of issues) {
    const body = issue.body ?? '';
    const sectionCount = (body.match(/^##\s+/gm) ?? []).length;
    const hasPriority = Boolean(issue.priority && issue.priority !== 'medium');

    const hasFilePaths = /src\/[^\s)]+/.test(body);
    const hasCodeBlocks = /```[\s\S]+?```/.test(body);
    const hasActionItems = /- \[ \]/.test(body);
    const hasLineNumbers = /行\s*\d+|line\s*\d+/i.test(body);
    const hasSymbols = /`[A-Za-z_][\w\.]*`/.test(body);

    let completenessScore = Math.min(100, sectionCount * 20 + (hasPriority ? 10 : 0));
    let specificityScore = 0;

    if (hasFilePaths) specificityScore += 30;
    if (hasCodeBlocks) specificityScore += 20;
    if (hasActionItems) specificityScore += 20;
    if (hasLineNumbers) specificityScore += 15;
    if (hasSymbols) specificityScore += 15;

    completenessScore = Math.min(100, completenessScore);
    specificityScore = Math.min(100, specificityScore);

    completenessScores.push(completenessScore);
    specificityScores.push(specificityScore);
  }

  const completenessScore = Math.round(
    completenessScores.reduce((sum, value) => sum + value, 0) / completenessScores.length,
  );
  const specificityScore = Math.round(
    specificityScores.reduce((sum, value) => sum + value, 0) / specificityScores.length,
  );

  return { completenessScore, specificityScore };
}

/**
 * 分割プレビューを表示
 */
export function displaySplitPreview(result: SplitIssueResult): void {
  logger.info('');
  logger.info('========================================');
  logger.info('  SPLIT-ISSUE PREVIEW (dry-run)');
  logger.info('========================================');
  logger.info('');

  if (result.splitSummary) {
    logger.info(`Summary: ${result.splitSummary}`);
    logger.info('');
  }

  result.splitIssues.forEach((issue, index) => {
    const titleLine = `${COLOR_BOLD}${issue.title}${COLOR_RESET}`;
    const labelsLine = issue.labels.length
      ? `${COLOR_CYAN}${issue.labels.join(', ')}${COLOR_RESET}`
      : '(none)';
    const priorityLine = formatPriority(issue.priority);
    const dependenciesLine = issue.dependencies.length
      ? issue.dependencies.map((dep) => `Issue ${dep + 1}`).join(', ')
      : '(none)';
    const previewBody = buildBodyPreview(issue.body, 200);

    logger.info(`--- Issue ${index + 1}/${result.splitIssues.length} ---`);
    logger.info(`  Title: ${titleLine}`);
    logger.info(`  Labels: ${labelsLine}`);
    logger.info(`  Priority: ${priorityLine}`);
    logger.info(`  Dependencies: ${dependenciesLine}`);
    logger.info('  Body:');
    logger.info(`    ${previewBody}`);
    logger.info('');
  });

  logger.info('========================================');
  logger.info('  METRICS');
  logger.info('========================================');
  logger.info(`  Completeness Score: ${result.metrics.completenessScore}/100`);
  logger.info(`  Specificity Score:  ${result.metrics.specificityScore}/100`);
  logger.info('');

  logger.info('========================================');
  logger.info('  DEPENDENCY GRAPH');
  logger.info('========================================');
  result.splitIssues.forEach((issue, index) => {
    const deps = issue.dependencies.length
      ? issue.dependencies.map((dep) => `Issue ${dep + 1}`).join(', ')
      : '(no dependencies)';
    logger.info(`  Issue ${index + 1} → ${deps}`);
  });
  logger.info('');

  logger.info('To apply these changes, run with --apply option.');
  logger.info('');
}

/**
 * 子Issueを作成し、元Issueへコメントを投稿
 */
async function createSplitIssues(
  githubClient: GitHubClient,
  parentIssueNumber: number,
  result: SplitIssueResult,
): Promise<string[]> {
  const payloads = result.splitIssues.map((issue) => ({
    title: issue.title,
    body: issue.body,
    labels: issue.labels.length ? issue.labels : undefined,
  }));

  const bulkResult = await githubClient.createMultipleIssues(payloads);

  const createdUrls = bulkResult.created.map((created) => created.issueUrl);
  logger.info('========================================');
  logger.info('  SPLIT-ISSUE RESULT (apply)');
  logger.info('========================================');
  logger.info('');

  if (bulkResult.created.length > 0) {
    logger.info('Created issues:');
    for (const created of bulkResult.created) {
      logger.info(`  ✅ #${created.issueNumber} - ${created.title} (${created.issueUrl})`);
    }
  }

  if (bulkResult.failed.length > 0) {
    for (const failed of bulkResult.failed) {
      logger.error(`  ❌ Issue ${failed.index + 1} - ${failed.title}: ${failed.error}`);
    }
  }

  logger.info('');
  logger.info(`Created: ${bulkResult.created.length}/${payloads.length} issues`);
  logger.info('');

  if (bulkResult.created.length > 0) {
    const comment = buildParentComment(bulkResult, result.splitIssues);
    try {
      await githubClient.postComment(parentIssueNumber, comment);
      logger.info(`Posted split summary comment to issue #${parentIssueNumber}`);
    } catch (error) {
      logger.warn(`Failed to post comment on issue #${parentIssueNumber}: ${getErrorMessage(error)}`);
    }
  } else {
    logger.warn('No issues were created. Skipping parent issue comment.');
  }

  return createdUrls;
}

/**
 * 元Issueへのコメント文を構築
 */
export function buildParentComment(
  bulkResult: BulkIssueResult,
  splitIssues: SplitIssueItem[],
): string {
  const lines: string[] = [];

  lines.push('## Issue分割完了', '');
  lines.push('このIssueは以下のサブIssueに分割されました:', '');

  for (const created of bulkResult.created) {
    lines.push(`- [ ] #${created.issueNumber} - ${created.title}`);
  }

  if (bulkResult.failed.length > 0) {
    lines.push('');
    for (const failed of bulkResult.failed) {
      lines.push(`- ⚠️ 作成失敗: Issue ${failed.index + 1} - ${failed.title} (${failed.error})`);
    }
  }

  const dependencyLines = buildDependencyLines(bulkResult, splitIssues);
  if (dependencyLines.length > 0) {
    lines.push('', '### 依存関係');
    lines.push(...dependencyLines);
  }

  lines.push('', '---', '*自動生成: ai-workflow split-issue*');

  return lines.join('\n');
}

function buildDependencyLines(
  bulkResult: BulkIssueResult,
  splitIssues: SplitIssueItem[],
): string[] {
  const failedIndexSet = new Set(bulkResult.failed.map((failed) => failed.index));
  const issueNumberByIndex = new Map<number, number>();
  let createdIndex = 0;
  for (let i = 0; i < splitIssues.length; i += 1) {
    if (failedIndexSet.has(i)) {
      continue;
    }
    const created = bulkResult.created[createdIndex];
    if (!created) {
      break;
    }
    issueNumberByIndex.set(i, created.issueNumber);
    createdIndex += 1;
  }

  const lines: string[] = [];
  splitIssues.forEach((issue, index) => {
    const issueNumber = issueNumberByIndex.get(index);
    if (!issueNumber || issue.dependencies.length === 0) {
      return;
    }

    const deps = issue.dependencies
      .map((dep) => issueNumberByIndex.get(dep))
      .filter((value): value is number => Boolean(value));

    if (deps.length === 0) {
      return;
    }

    const depsLabel = deps.map((dep) => `#${dep}`).join(', ');
    lines.push(`- #${issueNumber} は ${depsLabel} の完了後に着手`);
  });

  return lines;
}

function normalizeScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 50;
  }
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

function parseJsonWithRecovery(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch (error) {
    const sanitized = sanitizeJsonText(text);
    if (sanitized !== text) {
      try {
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeJsonText(text: string): string {
  let output = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      output += ch;
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      output += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      output += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') {
        output += '\\n';
        continue;
      }
      if (ch === '\r') {
        output += '\\r';
        continue;
      }
      if (ch === '\t') {
        output += '\\t';
        continue;
      }
    }
    output += ch;
  }

  return output;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function parseStructuredSplitText(response: string): SplitAgentResponse | null {
  const issueHeadingRegex = /^##\s*Issue\s*(\d+)[^\n]*$/gim;
  const matches = Array.from(response.matchAll(issueHeadingRegex));
  if (matches.length === 0) {
    return null;
  }

  const summaryMatch = response.match(
    /##\s*(Summary|概要)\s*\n([\s\S]+?)(?=^##\s*Issue|$)/im,
  );
  const summary = summaryMatch ? summaryMatch[2].trim() : '';

  const issues: SplitIssueItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? response.length : response.length;
    const segment = response.slice(start, end);

    const titleMatch = segment.match(/(?:Title|タイトル)[:\s]*\n?(.+)/i);
    const bodyMatch = segment.match(/(?:Body|本文)[:\s]*\n([\s\S]+)/i);

    const title = titleMatch ? titleMatch[1].trim() : `Issue ${i + 1}`;
    const body = bodyMatch ? bodyMatch[1].trim() : segment.trim();

    issues.push({
      title,
      body,
      labels: [],
      priority: 'medium',
      dependencies: [],
    });
  }

  return { summary, issues };
}

function buildBodyPreview(body: string, maxLength: number): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function formatPriority(priority: string): string {
  const normalized = priority.toLowerCase();
  if (normalized === 'high') {
    return `${COLOR_RED}high${COLOR_RESET}`;
  }
  if (normalized === 'low') {
    return `${COLOR_GREEN}low${COLOR_RESET}`;
  }
  if (normalized === 'medium') {
    return `${COLOR_YELLOW}medium${COLOR_RESET}`;
  }
  return `${COLOR_YELLOW}${priority}${COLOR_RESET}`;
}
