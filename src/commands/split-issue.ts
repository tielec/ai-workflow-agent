/**
 * split-issue コマンドハンドラ
 *
 * 既存Issueを機能単位で複数のIssueに分割し、dry-runでプレビューを表示する。
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
  RawSplitIssueOptions,
  SplitIssueOptions,
  SplitIssueItem,
  SplitAgentResponse,
  SplitMetrics,
  SplitIssueResult,
} from '../types/split-issue.js';

const BODY_PREVIEW_LENGTH = 200;

/**
 * メインハンドラ
 */
export async function handleSplitIssueCommand(
  rawOptions: RawSplitIssueOptions,
): Promise<void> {
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
    const [owner, repo] = githubRepository.split('/');

    // 3. GitHubクライアント初期化
    const githubClient = new GitHubClient(undefined, githubRepository);

    // 4. Issue情報取得
    const issueInfo = await githubClient.getIssueInfo(options.issueNumber);
    logger.info(`Fetched issue #${issueInfo.number}: ${issueInfo.title}`);

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
    const repositoryContext = await getRepositoryContext(new RepositoryAnalyzer(codexClient, claudeClient), repoPath);

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
      options.maxSplits,
    );

    // 9. 結果組み立て
    const metrics = agentResponse.metrics ?? calculateDefaultMetrics(agentResponse.issues);
    const result: SplitIssueResult = {
      success: true,
      originalTitle: issueInfo.title,
      originalBody: issueInfo.body,
      splitSummary: agentResponse.summary,
      splitIssues: agentResponse.issues,
      metrics,
    };

    // 10. apply/dry-run
    if (options.apply) {
      logger.info('Creating split issues on GitHub...');
      const createdIssueUrls = await applySplitIssues(
        githubClient,
        options.issueNumber,
        agentResponse.issues,
      );
      result.createdIssueUrls = createdIssueUrls;
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
function parseOptions(rawOptions: RawSplitIssueOptions): SplitIssueOptions {
  const issueRaw = rawOptions.issue;
  if (issueRaw === undefined || issueRaw === null) {
    throw new Error('--issue option is required');
  }
  const issueNumber = Number(issueRaw);
  if (!Number.isFinite(issueNumber) || issueNumber < 1 || !Number.isInteger(issueNumber)) {
    throw new Error(`Invalid issue number: ${issueRaw}`);
  }

  const languageRaw = rawOptions.language ?? 'ja';
  if (!['ja', 'en'].includes(languageRaw)) {
    throw new Error(`Invalid language: ${languageRaw}. Allowed: ja, en`);
  }
  const language = languageRaw as SupportedLanguage;

  const agentRaw = rawOptions.agent ?? 'auto';
  if (!['auto', 'codex', 'claude'].includes(agentRaw)) {
    throw new Error(`Invalid agent mode: ${agentRaw}. Allowed: auto, codex, claude`);
  }
  const agent = agentRaw as 'auto' | 'codex' | 'claude';

  const applyFlag = rawOptions.apply === true;
  const dryRunFlag = rawOptions.dryRun === true;
  if (applyFlag && dryRunFlag) {
    throw new Error('Cannot specify both --apply and --dry-run.');
  }
  const apply = applyFlag;

  let maxSplits = 10;
  if (rawOptions.maxSplits !== undefined && rawOptions.maxSplits !== null) {
    maxSplits = Number(rawOptions.maxSplits);
    if (!Number.isFinite(maxSplits) || !Number.isInteger(maxSplits) || maxSplits < 1 || maxSplits > 20) {
      throw new Error(
        `Invalid max-splits: ${rawOptions.maxSplits}. Must be integer between 1 and 20`,
      );
    }
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
    throw new Error(`Invalid GITHUB_REPOSITORY format: ${githubRepository}`);
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
  const filename = `split-issue-${Date.now()}.json`;

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
 * エージェントでIssueを分割
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
  maxSplits: number,
): Promise<SplitAgentResponse> {
  const outputFilePath = createOutputFilePath(repoPath);
  logger.info(`Agent output file: ${outputFilePath}`);

  const promptTemplate = PromptLoader.loadPrompt('split-issue', 'split-issue', language);
  const prompt = promptTemplate
    .replaceAll('{ORIGINAL_TITLE}', originalTitle)
    .replaceAll('{ORIGINAL_BODY}', originalBody)
    .replaceAll('{REPOSITORY_CONTEXT}', repoContext)
    .replaceAll('{OUTPUT_FILE_PATH}', outputFilePath)
    .replaceAll('{MAX_SPLITS}', maxSplits.toString());

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
    throw new Error('All agents failed to generate split issues.');
  }

  const fileResult = readOutputFile(outputFilePath, maxSplits);
  if (fileResult) {
    logger.info('Successfully parsed agent response from output file.');
    return fileResult;
  }

  logger.warn('Output file not found or invalid, falling back to text response parsing.');
  return parseAgentResponseText(response, maxSplits);
}

/**
 * エージェントが書き出したJSONファイルを読み込んでパース
 */
function readOutputFile(
  outputFilePath: string,
  maxSplits: number,
): SplitAgentResponse | null {
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
    const result = buildSplitResponseFromParsed(parsed, maxSplits);

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
function parseAgentResponseText(
  response: string,
  maxSplits: number,
): SplitAgentResponse {
  const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return buildSplitResponseFromParsed(parsed, maxSplits);
    } catch (error) {
      logger.debug(`Failed to parse code block JSON: ${getErrorMessage(error)}`);
    }
  }

  const jsonStr = extractJsonObject(response);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return buildSplitResponseFromParsed(parsed, maxSplits);
    } catch (error) {
      logger.debug(`Failed to parse extracted JSON: ${getErrorMessage(error)}`);
    }
  }

  logger.warn('Failed to parse agent response in any format: using empty split result.');
  return {
    summary: '',
    issues: [],
  };
}

/**
 * パース済みJSONオブジェクトからSplitAgentResponseを構築
 */
function buildSplitResponseFromParsed(
  parsed: Record<string, any>,
  maxSplits: number,
): SplitAgentResponse {
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const issuesRaw = Array.isArray(parsed.issues) ? parsed.issues : [];
  const normalizedIssues: SplitIssueItem[] = [];

  for (const issue of issuesRaw) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }
    const title = typeof issue.title === 'string' ? issue.title.trim() : '';
    if (!title) {
      continue;
    }
    const body = typeof issue.body === 'string' ? issue.body.trim() : '';
    const labelsRaw = Array.isArray(issue.labels)
      ? issue.labels.filter((label: unknown) => typeof label === 'string' && label.trim().length > 0)
      : [];
    const labels = labelsRaw.length > 0 ? labelsRaw.map((label: string) => label.trim()) : ['enhancement'];
    const priority =
      typeof issue.priority === 'string' && issue.priority.trim().length > 0
        ? issue.priority.trim()
        : 'medium';
    const relatedFeatures = Array.isArray(issue.relatedFeatures)
      ? issue.relatedFeatures
          .filter((item: unknown) => typeof item === 'string' && item.trim().length > 0)
          .map((item: string) => item.trim())
      : [];

    normalizedIssues.push({
      title,
      body,
      labels,
      priority,
      relatedFeatures,
    });
  }

  let trimmedIssues = normalizedIssues;
  if (normalizedIssues.length > maxSplits) {
    logger.warn(`Split issues exceed max-splits (${maxSplits}). Truncating results.`);
    trimmedIssues = normalizedIssues.slice(0, maxSplits);
  }

  const metrics = parsed.metrics
    ? {
        completenessScore: normalizeMetricValue(
          parsed.metrics.completeness ?? parsed.metrics.completenessScore ?? 50,
          50,
        ),
        specificityScore: normalizeMetricValue(
          parsed.metrics.specificity ?? parsed.metrics.specificityScore ?? 50,
          50,
        ),
      }
    : undefined;

  return {
    summary,
    issues: trimmedIssues,
    metrics,
  };
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
function displaySplitPreview(result: SplitIssueResult): void {
  logger.info('');
  logger.info('========================================');
  logger.info('  SPLIT-ISSUE PREVIEW (dry-run)');
  logger.info('========================================');
  logger.info('');

  logger.info(`Summary: ${result.splitSummary || '(empty)'}`);
  logger.info(`Split count: ${result.splitIssues.length}`);
  logger.info('');

  result.splitIssues.forEach((issue, index) => {
    const preview = issue.body.trim();
    const truncated =
      preview.length > BODY_PREVIEW_LENGTH
        ? `${preview.slice(0, BODY_PREVIEW_LENGTH)}...`
        : preview || '(empty)';

    logger.info('----------------------------------------');
    logger.info(`Issue #${index + 1}: ${issue.title}`);
    logger.info(`  Body: ${truncated}`);
    logger.info(`  Labels: ${issue.labels.join(', ') || '(none)'}`);
    logger.info(`  Priority: ${issue.priority}`);
    if (issue.relatedFeatures.length > 0) {
      logger.info(`  Related: ${issue.relatedFeatures.join(', ')}`);
    }
  });

  logger.info('----------------------------------------');
  logger.info('');
  logger.info('METRICS');
  logger.info(`  Completeness: ${result.metrics.completenessScore}/100`);
  logger.info(`  Specificity:  ${result.metrics.specificityScore}/100`);
  logger.info('');
  logger.info('To apply these changes, run with --apply option.');
  logger.info('');
}

/**
 * split-issue の結果を GitHub Issue に適用
 */
async function applySplitIssues(
  githubClient: GitHubClient,
  issueNumber: number,
  splitIssues: SplitIssueItem[],
): Promise<string[]> {
  if (splitIssues.length === 0) {
    logger.warn('No split issues to create.');
    return [];
  }

  const creation = await githubClient.createMultipleIssues(
    splitIssues.map((issue) => ({
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
    })),
  );

  logger.info(
    `Split issue creation completed. success=${creation.successCount}, failure=${creation.failureCount}`,
  );

  const createdIssues: Array<{ issueNumber: number; issueUrl: string; title: string }> = [];
  creation.results.forEach((result, index) => {
    if (result.success && result.issue_number && result.issue_url) {
      createdIssues.push({
        issueNumber: result.issue_number,
        issueUrl: result.issue_url,
        title: splitIssues[index]?.title ?? '',
      });
    }
  });

  if (createdIssues.length > 0) {
    const commentBody = buildSplitComment(createdIssues, splitIssues);
    try {
      await githubClient.postComment(issueNumber, commentBody);
      logger.info(`Posted split summary comment to issue #${issueNumber}`);
    } catch (error) {
      logger.warn(`Failed to post split summary comment: ${getErrorMessage(error)}`);
    }
  } else {
    logger.warn('No issues were created successfully. Skipping comment posting.');
  }

  return createdIssues.map((issue) => issue.issueUrl);
}

/**
 * 元Issueへのコメント本文を生成
 */
function buildSplitComment(
  createdIssues: Array<{ issueNumber: number; issueUrl: string; title: string }>,
  splitIssues: SplitIssueItem[],
): string {
  const lines: string[] = [];

  lines.push('## Issue分割完了', '', 'このIssueは以下の機能Issueに分割されました:', '');

  createdIssues.forEach((issue) => {
    lines.push(`- [ ] #${issue.issueNumber} - ${issue.title}`);
  });

  const titleToNumber = new Map<string, number>();
  createdIssues.forEach((issue) => {
    if (issue.title) {
      titleToNumber.set(issue.title, issue.issueNumber);
    }
  });

  const relatedLines: string[] = [];
  for (const issue of splitIssues) {
    if (!issue.relatedFeatures || issue.relatedFeatures.length === 0) {
      continue;
    }
    const currentNumber = titleToNumber.get(issue.title);
    if (!currentNumber) {
      continue;
    }
    for (const relatedTitle of issue.relatedFeatures) {
      const relatedNumber = titleToNumber.get(relatedTitle);
      if (!relatedNumber) {
        continue;
      }
      relatedLines.push(`- #${currentNumber} は #${relatedNumber} と関連`);
    }
  }

  if (relatedLines.length > 0) {
    lines.push('', '### 関連機能');
    relatedLines.forEach((line) => lines.push(line));
  }

  lines.push('', '---', '*自動生成: ai-workflow split-issue*');

  return lines.join('\n');
}

/**
 * デフォルトの採点指標を計算
 */
function calculateDefaultMetrics(issues: SplitIssueItem[]): SplitMetrics {
  const sectionCounts = issues.map((issue) => (issue.body.match(/^##\\s+/gm) ?? []).length);
  const sectionCountAvg =
    sectionCounts.length > 0
      ? sectionCounts.reduce((sum, count) => sum + count, 0) / sectionCounts.length
      : 0;

  const hasFilePaths = issues.some((issue) =>
    /`[^\\s`]+\\.(ts|js|tsx|jsx|py|go|rs)`/.test(issue.body),
  );
  const hasCodeBlocks = issues.some((issue) => /```[\\s\\S]+?```/.test(issue.body));
  const hasActionItems = issues.some((issue) => /- \\[ \\]/.test(issue.body));

  const completenessScore = Math.min(100, issues.length * 15 + sectionCountAvg * 10);
  const specificityScore = Math.min(
    100,
    (hasFilePaths ? 30 : 0) + (hasCodeBlocks ? 40 : 0) + (hasActionItems ? 30 : 0),
  );

  return {
    completenessScore,
    specificityScore,
  };
}

function normalizeMetricValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
