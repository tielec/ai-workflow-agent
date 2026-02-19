/**
 * rewrite-issue コマンドハンドラ
 *
 * リポジトリコンテキストを踏まえて既存Issue本文を再設計し、
 * 差分プレビューを表示する。--apply オプションで実際に更新。
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
  RawRewriteIssueOptions,
  RewriteIssueOptions,
  RewriteIssueResult,
  RewriteAgentResponse,
  RewriteMetrics,
} from '../types/rewrite-issue.js';

const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_RESET = '\x1b[0m';
const MAX_CUSTOM_INSTRUCTION_LENGTH = 500;

/**
 * メインハンドラ
 */
export async function handleRewriteIssueCommand(rawOptions: RawRewriteIssueOptions): Promise<void> {
  try {
    logger.info('Starting rewrite-issue command...');

    // 1. オプションパース
    const options = parseOptions(rawOptions);
    logger.info(
      `Options: issue=${options.issueNumber}, language=${options.language}, agent=${options.agent}, apply=${options.apply}, customInstruction=${options.customInstruction ? 'provided' : 'not provided'}`,
    );
    if (options.customInstruction) {
      logger.info(`Custom instruction: ${options.customInstruction}`);
    }

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

    // 7. リポジトリコンテキスト取得（ベーシック概要）
    const repositoryContext = await getRepositoryContext(new RepositoryAnalyzer(codexClient, claudeClient), repoPath);

    // 8. エージェント実行（JSON出力ファイル経由）
    const agentResponse = await executeRewriteWithAgent(
      issueInfo.title,
      issueInfo.body,
      repositoryContext,
      codexClient,
      claudeClient,
      options.language,
      options.agent,
      repoPath,
      options.customInstruction,
    );

    // 9. 差分生成
    const diff = generateUnifiedDiff(
      issueInfo.title,
      issueInfo.body,
      agentResponse.newTitle,
      agentResponse.newBody,
    );

    // 10. 結果組み立て
    const result: RewriteIssueResult = {
      success: true,
      originalTitle: issueInfo.title,
      originalBody: issueInfo.body,
      newTitle: agentResponse.newTitle,
      newBody: agentResponse.newBody,
      metrics: agentResponse.metrics ?? calculateDefaultMetrics(agentResponse.newBody),
      diff,
    };

    // 11. apply/dry-run
    if (options.apply) {
      logger.info('Applying changes to GitHub issue...');
      const updateResult = await githubClient.updateIssue(options.issueNumber, {
        title: agentResponse.newTitle,
        body: agentResponse.newBody,
      });

      if (updateResult.success) {
        logger.info(`Successfully updated issue #${options.issueNumber}`);
        logger.info(`Issue URL: ${issueInfo.url}`);
      } else {
        throw new Error(`Failed to update issue: ${updateResult.error}`);
      }
    } else {
      displayDiffPreview(result);
    }

    logger.info('rewrite-issue command completed successfully.');
  } catch (error) {
    logger.error(`rewrite-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * CLIオプションをパース
 */
function parseOptions(rawOptions: RawRewriteIssueOptions): RewriteIssueOptions {
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

  const apply = rawOptions.apply === true;

  const customInstructionRaw = rawOptions.customInstruction;
  let customInstruction: string | undefined;
  if (typeof customInstructionRaw === 'string') {
    const trimmed = customInstructionRaw.trim();
    if (!trimmed) {
      throw new Error('custom-instruction must not be empty.');
    }
    if (trimmed.length > MAX_CUSTOM_INSTRUCTION_LENGTH) {
      throw new Error(
        `Custom instruction exceeds maximum length (${MAX_CUSTOM_INSTRUCTION_LENGTH} characters).`,
      );
    }
    customInstruction = trimmed;
  }

  return {
    issueNumber,
    language,
    agent,
    apply,
    customInstruction,
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
 * RepositoryAnalyzer に依存しすぎず、トップレベル構造と主要ファイルをまとめる
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

    // 追加でAnalyzerのコード収集を軽量に試みる（失敗しても継続）
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
  const filename = `rewrite-issue-${Date.now()}.json`;

  // repoPath 配下に .ai-workflow/tmp/ を使用（エージェントのcwdからアクセスしやすい）
  // 失敗時はシステムtmpディレクトリにフォールバック
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
 * エージェントでIssueを再設計
 */
async function executeRewriteWithAgent(
  originalTitle: string,
  originalBody: string,
  repoContext: string,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  language: SupportedLanguage,
  agentMode: 'auto' | 'codex' | 'claude',
  repoPath: string,
  customInstruction?: string,
): Promise<RewriteAgentResponse> {
  const outputFilePath = createOutputFilePath(repoPath);
  logger.info(`Agent output file: ${outputFilePath}`);

  const promptTemplate = PromptLoader.loadPrompt('rewrite-issue', 'rewrite-issue', language);
  let customInstructionBlock = '';
  if (customInstruction) {
    if (language === 'ja') {
      customInstructionBlock =
        `\n## 追加の指示\n\n` +
        `以下のユーザーからの追加指示に従ってリライトしてください:\n\n` +
        `${customInstruction}\n`;
    } else {
      customInstructionBlock =
        `\n## Additional Instructions\n\n` +
        `Please follow these additional instructions when rewriting:\n\n` +
        `${customInstruction}\n`;
    }
  }
  const prompt = promptTemplate
    .replaceAll('{ORIGINAL_TITLE}', originalTitle)
    .replaceAll('{ORIGINAL_BODY}', originalBody)
    .replaceAll('{REPOSITORY_CONTEXT}', repoContext)
    .replaceAll('{OUTPUT_FILE_PATH}', outputFilePath)
    .replaceAll('{CUSTOM_INSTRUCTION}', customInstructionBlock);

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
    throw new Error('All agents failed to generate rewritten issue content.');
  }

  // 1. ファイルからJSON読み込みを優先
  const fileResult = readOutputFile(outputFilePath, originalTitle, originalBody);
  if (fileResult) {
    logger.info('Successfully parsed agent response from output file.');
    return fileResult;
  }

  // 2. フォールバック: エージェントのテキスト応答からパース
  logger.warn('Output file not found or invalid, falling back to text response parsing.');
  return parseAgentResponseText(response, originalTitle, originalBody);
}

/**
 * エージェントが書き出したJSONファイルを読み込んでパース
 */
function readOutputFile(
  outputFilePath: string,
  fallbackTitle: string,
  fallbackBody: string,
): RewriteAgentResponse | null {
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
    const result = buildResponseFromParsed(parsed, fallbackTitle, fallbackBody);

    // 一時ファイルをクリーンアップ
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
  fallbackTitle: string,
  fallbackBody: string,
): RewriteAgentResponse {
  // 1. マークダウンコードブロックからJSON抽出を試行
  const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return buildResponseFromParsed(parsed, fallbackTitle, fallbackBody);
    } catch (error) {
      logger.debug(`Failed to parse code block JSON: ${getErrorMessage(error)}`);
    }
  }

  // 2. ブレースのネストを追跡してJSON抽出を試行
  const jsonStr = extractJsonObject(response);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return buildResponseFromParsed(parsed, fallbackTitle, fallbackBody);
    } catch (error) {
      logger.debug(`Failed to parse extracted JSON: ${getErrorMessage(error)}`);
    }
  }

  // 3. 構造化テキスト形式のフォールバック
  const titleMatch = response.match(/##?\s*(?:タイトル|Title)[:\s]*\n?(.+)/i);
  const bodyMatch = response.match(/##?\s*(?:本文|Body)[:\s]*\n([\s\S]+?)(?=##|$)/i);

  if (titleMatch || bodyMatch) {
    return {
      newTitle: titleMatch?.[1]?.trim() ?? fallbackTitle,
      newBody: bodyMatch?.[1]?.trim() ?? response.trim(),
    };
  }

  // 4. 最終フォールバック
  logger.warn('Failed to parse agent response in any format: using raw response as body.');
  return {
    newTitle: fallbackTitle,
    newBody: response.trim(),
  };
}

/**
 * パース済みJSONオブジェクトからRewriteAgentResponseを構築
 */
function buildResponseFromParsed(
  parsed: Record<string, any>,
  fallbackTitle: string,
  fallbackBody: string,
): RewriteAgentResponse {
  return {
    newTitle: parsed.title ?? parsed.newTitle ?? fallbackTitle,
    newBody: parsed.body ?? parsed.newBody ?? fallbackBody,
    metrics: parsed.metrics
      ? {
          completenessScore:
            parsed.metrics.completeness ?? parsed.metrics.completenessScore ?? 50,
          specificityScore: parsed.metrics.specificity ?? parsed.metrics.specificityScore ?? 50,
        }
      : undefined,
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

/**
 * unified diff形式で差分を生成（簡易実装）
 */
function generateUnifiedDiff(
  oldTitle: string,
  oldBody: string,
  newTitle: string,
  newBody: string,
): string {
  const lines: string[] = [];

  lines.push('=== Title ===');
  if (oldTitle !== newTitle) {
    lines.push(`- ${oldTitle}`);
    lines.push(`+ ${newTitle}`);
  } else {
    lines.push('  (no change)');
  }
  lines.push('');

  lines.push('=== Body ===');
  const oldLines = oldBody.split('\n');
  const newLines = newBody.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i += 1) {
    const o = oldLines[i] ?? '';
    const n = newLines[i] ?? '';
    if (o === n) {
      lines.push(`  ${o}`);
    } else {
      if (o) {
        lines.push(`- ${o}`);
      }
      if (n) {
        lines.push(`+ ${n}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * デフォルトの採点指標を計算
 */
function calculateDefaultMetrics(body: string): RewriteMetrics {
  const sectionCount = (body.match(/^##\s+/gm) ?? []).length;
  const hasFilePaths = /`[^\s`]+\.(ts|js|tsx|jsx|py|go|rs)`/.test(body);
  const hasLineNumbers = /行\s*\d+|line\s*\d+/i.test(body);
  const hasCodeBlocks = /```[\s\S]+?```/.test(body);

  const completenessScore = Math.min(100, sectionCount * 20);
  const specificityScore = Math.min(
    100,
    (hasFilePaths ? 30 : 0) + (hasLineNumbers ? 30 : 0) + (hasCodeBlocks ? 40 : 0),
  );

  return {
    completenessScore,
    specificityScore,
  };
}

/**
 * 差分プレビューを表示
 */
function displayDiffPreview(result: RewriteIssueResult): void {
  logger.info('');
  logger.info('========================================');
  logger.info('  REWRITE-ISSUE PREVIEW (dry-run)');
  logger.info('========================================');
  logger.info('');

  for (const line of result.diff.split('\n')) {
    if (line.startsWith('+')) {
      logger.info(`${COLOR_GREEN}${line}${COLOR_RESET}`);
    } else if (line.startsWith('-')) {
      logger.info(`${COLOR_RED}${line}${COLOR_RESET}`);
    } else {
      logger.info(line);
    }
  }

  logger.info('');
  logger.info('========================================');
  logger.info('  METRICS');
  logger.info('========================================');
  logger.info(`  Completeness Score: ${result.metrics.completenessScore}/100`);
  logger.info(`  Specificity Score:  ${result.metrics.specificityScore}/100`);
  logger.info('');
  logger.info('To apply these changes, run with --apply option.');
  logger.info('');
}
