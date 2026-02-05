/**
 * rewrite-issue コマンドハンドラ
 *
 * リポジトリコンテキストを踏まえて既存Issue本文を再設計し、
 * 差分プレビューを表示する。--apply オプションで実際に更新。
 */
import * as fs from 'node:fs';
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

/**
 * メインハンドラ
 */
export async function handleRewriteIssueCommand(rawOptions: RawRewriteIssueOptions): Promise<void> {
  try {
    logger.info('Starting rewrite-issue command...');

    // 1. オプションパース
    const options = parseOptions(rawOptions);
    logger.info(
      `Options: issue=${options.issueNumber}, language=${options.language}, agent=${options.agent}, apply=${options.apply}`,
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

    // 7. リポジトリコンテキスト取得（ベーシック概要）
    const repositoryContext = await getRepositoryContext(new RepositoryAnalyzer(codexClient, claudeClient), repoPath);

    // 8. エージェント実行
    const agentResponse = await executeRewriteWithAgent(
      issueInfo.title,
      issueInfo.body,
      repositoryContext,
      codexClient,
      claudeClient,
      options.language,
      options.agent,
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

  return {
    issueNumber,
    language,
    agent,
    apply,
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
): Promise<RewriteAgentResponse> {
  const promptTemplate = PromptLoader.loadPrompt('rewrite-issue', 'rewrite-issue', language);
  const prompt = promptTemplate
    .replaceAll('{ORIGINAL_TITLE}', originalTitle)
    .replaceAll('{ORIGINAL_BODY}', originalBody)
    .replaceAll('{REPOSITORY_CONTEXT}', repoContext);

  let response: string | null = null;

  const tryClaude = agentMode !== 'codex' && claudeClient;
  const tryCodex = agentMode !== 'claude' && codexClient;

  if (tryClaude) {
    try {
      logger.info('Executing with Claude agent...');
      response = await claudeClient!.execute(prompt);
    } catch (error) {
      logger.warn(`Claude agent failed: ${getErrorMessage(error)}`);
    }
  }

  if (!response && tryCodex) {
    try {
      logger.info('Executing with Codex agent...');
      response = await codexClient!.execute(prompt);
    } catch (error) {
      logger.warn(`Codex agent failed: ${getErrorMessage(error)}`);
    }
  }

  if (!response) {
    throw new Error('All agents failed to generate rewritten issue content.');
  }

  return parseAgentResponse(response, originalTitle, originalBody);
}

/**
 * エージェント応答をパース
 */
function parseAgentResponse(
  response: string,
  fallbackTitle: string,
  fallbackBody: string,
): RewriteAgentResponse {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
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

    const titleMatch = response.match(/##?\\s*(?:タイトル|Title)[:\\s]*\\n?(.+)/i);
    const bodyMatch = response.match(/##?\\s*(?:本文|Body)[:\\s]*\\n([\\s\\S]+?)(?=##|$)/i);

    return {
      newTitle: titleMatch?.[1]?.trim() ?? fallbackTitle,
      newBody: bodyMatch?.[1]?.trim() ?? response.trim(),
    };
  } catch (error) {
    logger.warn(`Failed to parse agent response as JSON: ${getErrorMessage(error)}`);
    return {
      newTitle: fallbackTitle,
      newBody: response.trim(),
    };
  }
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
  const oldLines = oldBody.split('\\n');
  const newLines = newBody.split('\\n');
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

  return lines.join('\\n');
}

/**
 * デフォルトの採点指標を計算
 */
function calculateDefaultMetrics(body: string): RewriteMetrics {
  const sectionCount = (body.match(/^##\\s+/gm) ?? []).length;
  const hasFilePaths = /`[^\\s`]+\\.(ts|js|tsx|jsx|py|go|rs)`/.test(body);
  const hasLineNumbers = /行\\s*\\d+|line\\s*\\d+/i.test(body);
  const hasCodeBlocks = /```[\\s\\S]+?```/.test(body);

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

  for (const line of result.diff.split('\\n')) {
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
