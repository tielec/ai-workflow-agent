/**
 * create-sub-issue コマンドハンドラ
 *
 * 親Issueの文脈とユーザー入力を基にサブIssueを生成し、dry-runでプレビューを表示する。
 * --apply オプションで実際にGitHub Issueを作成する。
 */
import * as fs from 'node:fs';
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
  RawCreateSubIssueOptions,
  CreateSubIssueOptions,
  SubIssueAgentResponse,
  CreateSubIssueResult,
} from '../types/create-sub-issue.js';

const BODY_PREVIEW_LENGTH = 200;

/**
 * メインハンドラ
 */
export async function handleCreateSubIssueCommand(
  rawOptions: RawCreateSubIssueOptions,
): Promise<void> {
  try {
    logger.info('Starting create-sub-issue command...');

    // Step 1: オプションパース
    const options = parseOptions(rawOptions);
    logger.info(
      `Options: parentIssue=${options.parentIssueNumber}, type=${options.type}, ` +
        `language=${options.language}, agent=${options.agent}, apply=${options.apply}`,
    );

    // Step 2: 環境変数の検証
    const githubRepository = validateEnvironment();
    logger.info(`GitHub repository: ${githubRepository}`);
    const [owner, repo] = githubRepository.split('/');

    // Step 3: GitHubクライアント初期化
    const githubClient = new GitHubClient(undefined, githubRepository);

    // Step 4: 親Issue情報取得
    let issueInfo;
    try {
      issueInfo = await githubClient.getIssueInfo(options.parentIssueNumber);
      logger.info(`Fetched parent issue #${issueInfo.number}: ${issueInfo.title}`);
    } catch (error) {
      const msg = getErrorMessage(error);
      if (msg.includes('404') || msg.includes('Not Found')) {
        throw new Error(`Parent issue #${options.parentIssueNumber} not found`);
      }
      throw new Error(`Failed to fetch parent issue #${options.parentIssueNumber}: ${msg}`);
    }

    // Step 5: リポジトリパス解決
    let repoPath: string;
    try {
      repoPath = resolveLocalRepoPath(repo);
      logger.info(`Resolved repository path: ${repoPath}`);
    } catch (error) {
      logger.warn(`Failed to resolve repository path, fallback to CWD: ${getErrorMessage(error)}`);
      repoPath = process.cwd();
    }

    // Step 6: エージェントクライアント準備
    const credentials = resolveAgentCredentials(config.getHomeDir(), repoPath);
    const { codexClient, claudeClient } = setupAgentClients(options.agent, repoPath, credentials, {
      agentPriority: options.agent === 'codex' ? 'codex-first' : 'claude-first',
    });
    if (!codexClient && !claudeClient) {
      throw new Error('No valid agent configuration available. Set CODEX/CLAUDE credentials.');
    }

    // Step 7: リポジトリコンテキスト取得
    const repositoryContext = await getRepositoryContext(
      new RepositoryAnalyzer(codexClient, claudeClient),
      repoPath,
    );

    // Step 8: エージェント実行
    const agentResponse = await executeCreateSubIssueWithAgent(
      issueInfo.title,
      issueInfo.body,
      options.description,
      options.type,
      repositoryContext,
      codexClient,
      claudeClient,
      options.language,
      options.agent,
      repoPath,
      options.customInstruction,
    );

    // Step 9: 結果組み立て
    const result: CreateSubIssueResult = {
      success: true,
      parentIssueNumber: options.parentIssueNumber,
      parentIssueTitle: issueInfo.title,
      subIssue: agentResponse,
    };

    // Step 10: apply/dry-run 分岐
    if (options.apply) {
      logger.info('Creating sub-issue on GitHub...');
      await applyCreateSubIssue(githubClient, result, options.labels);
    } else {
      displayPreview(result);
    }

    logger.info('create-sub-issue command completed successfully.');
  } catch (error) {
    logger.error(`create-sub-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * CLIオプションをパース
 */
function parseOptions(rawOptions: RawCreateSubIssueOptions): CreateSubIssueOptions {
  const parentIssueRaw = rawOptions.parentIssue;
  if (parentIssueRaw === undefined || parentIssueRaw === null) {
    throw new Error('--parent-issue option is required');
  }
  const parentIssueNumber = Number(parentIssueRaw);
  if (!Number.isFinite(parentIssueNumber) || parentIssueNumber < 1 || !Number.isInteger(parentIssueNumber)) {
    throw new Error(`Invalid parent issue number: ${parentIssueRaw}`);
  }

  const descriptionRaw = rawOptions.description;
  if (!descriptionRaw || typeof descriptionRaw !== 'string' || descriptionRaw.trim().length === 0) {
    throw new Error('Description is required and must be 1-1000 characters');
  }
  const description = descriptionRaw.trim();
  if (description.length > 1000) {
    throw new Error('Description is required and must be 1-1000 characters');
  }

  const typeRaw = rawOptions.type ?? 'bug';
  const validTypes = ['bug', 'task', 'enhancement'];
  if (!validTypes.includes(typeRaw)) {
    throw new Error(`Invalid type: ${typeRaw}. Must be bug, task, or enhancement`);
  }
  const type = typeRaw as 'bug' | 'task' | 'enhancement';

  const languageRaw = rawOptions.language ?? 'ja';
  if (!['ja', 'en'].includes(languageRaw)) {
    throw new Error(`Invalid language: ${languageRaw}. Must be ja or en`);
  }
  const language = languageRaw as SupportedLanguage;

  const agentRaw = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agentRaw)) {
    throw new Error(`Invalid agent mode: ${agentRaw}. Must be auto, codex, or claude`);
  }
  const agent = agentRaw as 'auto' | 'codex' | 'claude';

  const applyFlag = rawOptions.apply === true;
  const dryRunFlag = rawOptions.dryRun === true;
  if (applyFlag && dryRunFlag) {
    throw new Error('Cannot specify both --apply and --dry-run');
  }

  let labels: string[] | undefined;
  if (rawOptions.labels) {
    labels = rawOptions.labels
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
    if (labels.length === 0) {
      labels = undefined;
    }
  }

  const customInstruction = rawOptions.customInstruction?.trim() || undefined;
  if (customInstruction && customInstruction.length > 500) {
    throw new Error('Custom instruction must be 500 characters or less');
  }

  return {
    parentIssueNumber,
    description,
    type,
    language,
    agent,
    apply: applyFlag,
    labels,
    customInstruction,
  };
}

/**
 * 環境変数を検証
 */
function validateEnvironment(): string {
  const githubRepository = config.getGitHubRepository();
  if (!githubRepository) {
    throw new Error('GITHUB_REPOSITORY is not set or invalid format. Expected: owner/repo');
  }

  const [owner, repo] = githubRepository.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY is not set or invalid format. Expected: owner/repo');
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
function createOutputFilePath(repoPath: string): string {
  const filename = `create-sub-issue-${Date.now()}.json`;

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
 * エージェントでサブIssueを生成
 */
async function executeCreateSubIssueWithAgent(
  parentTitle: string,
  parentBody: string,
  description: string,
  issueType: string,
  repoContext: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  language: SupportedLanguage,
  agentMode: 'auto' | 'codex' | 'claude',
  repoPath: string,
  customInstruction?: string,
): Promise<SubIssueAgentResponse> {
  const outputFilePath = createOutputFilePath(repoPath);
  logger.info(`Agent output file: ${outputFilePath}`);

  const promptTemplate = PromptLoader.loadPrompt('create-sub-issue', 'create-sub-issue', language);
  const prompt = promptTemplate
    .replaceAll('{PARENT_ISSUE_TITLE}', parentTitle)
    .replaceAll('{PARENT_ISSUE_BODY}', parentBody)
    .replaceAll('{DESCRIPTION}', description)
    .replaceAll('{ISSUE_TYPE}', issueType)
    .replaceAll('{REPOSITORY_CONTEXT}', repoContext)
    .replaceAll('{OUTPUT_FILE_PATH}', outputFilePath)
    .replaceAll('{CUSTOM_INSTRUCTION}', customInstruction ?? '');

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
    throw new Error('Failed to generate sub-issue content with all available agents');
  }

  const fileResult = readOutputFile(outputFilePath);
  if (fileResult) {
    logger.info('Successfully parsed agent response from output file.');
    return fileResult;
  }

  logger.warn('Output file not found or invalid, falling back to text response parsing.');
  return parseAgentResponseText(response);
}

/**
 * エージェントが書き出したJSONファイルを読み込んでパース
 */
function readOutputFile(outputFilePath: string): SubIssueAgentResponse | null {
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
    const result = buildSubIssueResponseFromParsed(parsed);

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
 * エージェントのテキスト応答からパース（フォールバック）
 */
function parseAgentResponseText(response: string): SubIssueAgentResponse {
  const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return buildSubIssueResponseFromParsed(parsed);
    } catch (error) {
      logger.debug(`Failed to parse code block JSON: ${getErrorMessage(error)}`);
    }
  }

  const jsonStr = extractJsonObject(response);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return buildSubIssueResponseFromParsed(parsed);
    } catch (error) {
      logger.debug(`Failed to parse extracted JSON: ${getErrorMessage(error)}`);
    }
  }

  logger.warn('Failed to parse agent response in any format.');
  throw new Error('Failed to parse agent response as JSON');
}

/**
 * パース済みJSONオブジェクトからSubIssueAgentResponseを構築
 */
function buildSubIssueResponseFromParsed(parsed: Record<string, any>): SubIssueAgentResponse {
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  if (!title) {
    throw new Error('Agent response missing required field: title');
  }

  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';

  const labelsRaw = Array.isArray(parsed.labels)
    ? parsed.labels.filter((label: unknown) => typeof label === 'string' && label.trim().length > 0)
    : [];
  const labels = labelsRaw.length > 0 ? labelsRaw.map((label: string) => label.trim()) : ['bug'];

  const metrics = parsed.metrics
    ? {
        completeness: normalizeMetricValue(parsed.metrics.completeness ?? 50, 50),
        specificity: normalizeMetricValue(parsed.metrics.specificity ?? 50, 50),
      }
    : undefined;

  return { title, body, labels, metrics };
}

/**
 * テキストからブレースのネストを追跡してJSONオブジェクトを抽出
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
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
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * dry-run時のプレビューを表示
 */
function displayPreview(result: CreateSubIssueResult): void {
  logger.info('');
  logger.info('========================================');
  logger.info(`  [Dry-Run] Sub-Issue Preview for Parent Issue #${result.parentIssueNumber}`);
  logger.info('========================================');
  logger.info('');

  logger.info(`Parent Issue: #${result.parentIssueNumber} - ${result.parentIssueTitle}`);
  logger.info('');

  const preview = result.subIssue.body.trim();
  const truncated =
    preview.length > BODY_PREVIEW_LENGTH
      ? `${preview.slice(0, BODY_PREVIEW_LENGTH)}...`
      : preview || '(empty)';

  logger.info('--- Sub-Issue ---');
  logger.info(`Title: ${result.subIssue.title}`);
  logger.info(`Body: ${truncated}`);
  logger.info(`Labels: ${result.subIssue.labels.join(', ') || '(none)'}`);
  logger.info('');

  if (result.subIssue.metrics) {
    logger.info('METRICS');
    logger.info(`  Completeness: ${result.subIssue.metrics.completeness}/100`);
    logger.info(`  Specificity:  ${result.subIssue.metrics.specificity}/100`);
    logger.info('');
  }

  logger.info('Run with --apply to create this sub-issue on GitHub.');
  logger.info('');
}

/**
 * create-sub-issue の結果を GitHub Issue に適用
 */
async function applyCreateSubIssue(
  githubClient: GitHubClient,
  result: CreateSubIssueResult,
  userLabels?: string[],
): Promise<void> {
  const subIssue = result.subIssue;
  const mergedLabels = [...new Set([...subIssue.labels, ...(userLabels ?? [])])];

  const creation = await githubClient.createMultipleIssues([
    {
      title: subIssue.title,
      body: subIssue.body,
      labels: mergedLabels,
    },
  ]);

  if (creation.failureCount > 0 || creation.results.length === 0) {
    throw new Error('Failed to create sub-issue on GitHub.');
  }

  const createdIssue = creation.results[0];
  if (!createdIssue.success || !createdIssue.issue_number || !createdIssue.issue_url) {
    throw new Error(`Failed to create sub-issue: ${createdIssue.error ?? 'unknown error'}`);
  }

  result.createdIssueNumber = createdIssue.issue_number;
  result.createdIssueUrl = createdIssue.issue_url;

  logger.info(`Created sub-issue #${createdIssue.issue_number}: ${createdIssue.issue_url}`);

  let childIssueId: number;
  try {
    const childIssueData = await githubClient.getIssue(createdIssue.issue_number);
    childIssueId = childIssueData.id;
  } catch (error) {
    logger.warn(`Failed to fetch child issue data for Sub-Issue API: ${getErrorMessage(error)}`);
    childIssueId = createdIssue.issue_number;
  }

  const linkResult = await githubClient.addSubIssue(result.parentIssueNumber, childIssueId);

  if (linkResult.success) {
    result.subIssueLinkSuccess = true;
    logger.info(
      `Linked sub-issue #${createdIssue.issue_number} to parent #${result.parentIssueNumber}`,
    );
  } else {
    result.subIssueLinkSuccess = false;
    logger.warn('Sub-Issue API unavailable, using comment-based fallback.');

    const updatedBody = `> Parent issue: #${result.parentIssueNumber}\n\n${subIssue.body}`;
    await githubClient.updateIssue(createdIssue.issue_number, { body: updatedBody });
  }

  const commentBody = buildNotificationComment(
    createdIssue.issue_number,
    subIssue.title,
    result.subIssueLinkSuccess,
  );
  try {
    await githubClient.postComment(result.parentIssueNumber, commentBody);
    logger.info(`Posted notification comment to parent issue #${result.parentIssueNumber}`);
  } catch (error) {
    logger.warn(`Failed to post notification comment: ${getErrorMessage(error)}`);
  }
}

/**
 * 親Issueへの通知コメント本文を生成
 */
function buildNotificationComment(
  childIssueNumber: number,
  title: string,
  subIssueLinkSuccess?: boolean,
): string {
  const lines: string[] = [];

  lines.push(`🔗 Sub-issue #${childIssueNumber} created: ${title}`);

  if (subIssueLinkSuccess === false) {
    lines.push('');
    lines.push('> Note: Sub-Issue API is unavailable. Manual linking may be required.');
  }

  lines.push('', '---', '*Auto-generated: ai-workflow create-sub-issue*');

  return lines.join('\n');
}

function normalizeMetricValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
