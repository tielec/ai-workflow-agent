/**
 * IssueGenerator - Issue生成エンジン
 *
 * エージェント（Codex/Claude）を使用してIssue本文を生成し、
 * GitHub APIでIssueを作成します。
 *
 * @module issue-generator
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { BugCandidate, RefactorCandidate, IssueCreationResult } from '../types/auto-issue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 出力ファイルパスを生成
 *
 * @returns 一時ディレクトリ内のユニークなファイルパス
 */
function generateOutputFilePath(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `auto-issue-body-${timestamp}-${random}.md`);
}

/**
 * IssueGenerator クラス
 *
 * エージェントベースのIssue本文生成とGitHub API統合により、
 * バグ候補からGitHub Issueを作成します。
 */
export class IssueGenerator {
  private readonly codexClient: CodexAgentClient | null;
  private readonly claudeClient: ClaudeAgentClient | null;
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  /**
   * コンストラクタ
   *
   * @param codexClient - Codexエージェントクライアント（nullの場合は使用不可）
   * @param claudeClient - Claudeエージェントクライアント（nullの場合は使用不可）
   * @param octokit - GitHub APIクライアント
   * @param repositoryName - リポジトリ名（owner/repo形式）
   * @throws リポジトリ名が不正な形式の場合
   */
  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
    octokit: Octokit,
    repositoryName: string,
  ) {
    this.codexClient = codexClient;
    this.claudeClient = claudeClient;
    this.octokit = octokit;

    // リポジトリ名をパース
    const parts = repositoryName.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repository name: ${repositoryName}`);
    }
    this.owner = parts[0];
    this.repo = parts[1];
  }

  /**
   * Issueを生成
   *
   * @param candidate - バグ候補
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param dryRun - dry-runモード（true: Issue作成をスキップ）
   * @returns Issue作成結果
   */
  public async generate(
    candidate: BugCandidate,
    agent: 'auto' | 'codex' | 'claude',
    dryRun: boolean,
  ): Promise<IssueCreationResult> {
    logger.info(`Generating issue for candidate: "${candidate.title}"`);

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/generate-issue-body.txt');
    if (!fs.existsSync(promptPath)) {
      return {
        success: false,
        error: `Prompt template not found: ${promptPath}`,
      };
    }

    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. 出力ファイルパスを生成
    const outputFilePath = generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    // 3. プロンプト変数を置換
    const prompt = template
      .replace('{bug_candidate_json}', JSON.stringify(candidate, null, 2))
      .replace(/{output_file_path}/g, outputFilePath);

    // 4. エージェントを選択（RepositoryAnalyzer と同じロジック）
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          return {
            success: false,
            error: 'Codex agent is not available.',
          };
        }
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info('Using Codex agent for issue body generation.');
          await this.codexClient.executeTask({ prompt });
        } catch (error) {
          if (agent === 'codex') {
            return {
              success: false,
              error: `Codex failed: ${getErrorMessage(error)}`,
            };
          }
          logger.warn(`Codex failed, falling back to Claude.`);
          selectedAgent = 'claude';
        }
      }
    }

    if (selectedAgent === 'claude') {
      if (!this.claudeClient) {
        return {
          success: false,
          error: 'Claude agent is not available.',
        };
      }
      logger.info('Using Claude agent for issue body generation.');
      await this.claudeClient.executeTask({ prompt });
    }

    // 5. 出力ファイルからIssue本文を読み込み
    const issueBody = this.readOutputFile(outputFilePath, candidate);

    // 6. 一時ファイルをクリーンアップ
    this.cleanupOutputFile(outputFilePath);

    // 7. dry-runモードの場合はスキップ
    if (dryRun) {
      logger.info('[DRY RUN] Skipping issue creation.');
      logger.info(`Title: ${candidate.title}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
      };
    }

    // 8. GitHub APIでIssueを作成
    try {
      const result = await this.createIssueOnGitHub(
        candidate.title,
        issueBody,
        ['auto-generated', 'bug'],
      );

      logger.info(`Issue created: #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * 出力ファイルからIssue本文を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @param candidate - バグ候補（フォールバック用）
   * @returns Markdown形式のIssue本文
   */
  private readOutputFile(filePath: string, candidate: BugCandidate): string {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Using fallback template.`);
      return this.createFallbackBody(candidate);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      // 内容が空の場合はフォールバック
      if (!content) {
        logger.warn('Output file is empty. Using fallback template.');
        return this.createFallbackBody(candidate);
      }

      // 最低限の検証: ## セクションが含まれているか
      if (!content.includes('##')) {
        logger.warn('Output file does not contain valid Markdown sections. Using fallback template.');
        return this.createFallbackBody(candidate);
      }

      logger.info('Successfully read issue body from output file.');
      return content;
    } catch (error) {
      logger.error(`Failed to read output file: ${getErrorMessage(error)}`);
      return this.createFallbackBody(candidate);
    }
  }

  /**
   * フォールバック用のIssue本文を生成
   *
   * @param candidate - バグ候補
   * @returns Markdown形式のIssue本文
   */
  private createFallbackBody(candidate: BugCandidate): string {
    return `## 概要

${candidate.description}

## 詳細

**深刻度**: ${candidate.severity}
**カテゴリ**: ${candidate.category}

## 修正案

${candidate.suggestedFix}

## 関連ファイル

- \`${candidate.file}\` (${candidate.line}行目)

---
*このIssueは自動生成されました（フォールバックテンプレート使用）*`;
  }

  /**
   * 一時出力ファイルをクリーンアップ
   *
   * @param filePath - 出力ファイルパス
   */
  private cleanupOutputFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.removeSync(filePath);
        logger.debug(`Cleaned up output file: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup output file: ${getErrorMessage(error)}`);
    }
  }

  /**
   * リファクタリングIssueを生成
   *
   * @param candidate - リファクタリング候補
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param dryRun - dry-runモード（true: Issue作成をスキップ）
   * @returns Issue作成結果
   */
  public async generateRefactorIssue(
    candidate: RefactorCandidate,
    agent: 'auto' | 'codex' | 'claude',
    dryRun: boolean,
  ): Promise<IssueCreationResult> {
    logger.info(
      `Generating refactoring issue for: "${candidate.type}" in "${candidate.filePath}"`,
    );

    // 1. タイトルとラベルを生成
    const title = this.generateRefactorTitle(candidate);
    const labels = this.generateRefactorLabels(candidate);

    // 2. Issue本文を生成
    const issueBody = this.createRefactorBody(candidate);

    // 3. dry-runモードの場合はスキップ
    if (dryRun) {
      logger.info('[DRY RUN] Skipping refactoring issue creation.');
      logger.info(`Title: ${title}`);
      logger.info(`Labels: ${labels.join(', ')}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
      };
    }

    // 4. GitHub APIでIssueを作成
    try {
      const result = await this.createIssueOnGitHub(title, issueBody, labels);

      logger.info(`Refactoring issue created: #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * リファクタリングIssueのタイトルを生成
   *
   * @param candidate - リファクタリング候補
   * @returns Issueタイトル
   */
  private generateRefactorTitle(candidate: RefactorCandidate): string {
    const typeLabels: Record<RefactorCandidate['type'], string> = {
      'large-file': 'ファイルサイズの削減',
      'large-function': '関数の分割',
      'high-complexity': '複雑度の削減',
      'duplication': 'コード重複の削減',
      'unused-code': '未使用コードの削除',
      'missing-docs': 'ドキュメントの追加',
    };

    const typeLabel = typeLabels[candidate.type];
    const fileName = path.basename(candidate.filePath);

    return `[Refactor] ${typeLabel}: ${fileName}`;
  }

  /**
   * リファクタリングIssueのラベルを生成
   *
   * @param candidate - リファクタリング候補
   * @returns ラベルのリスト
   */
  private generateRefactorLabels(candidate: RefactorCandidate): string[] {
    const labels = ['auto-generated', 'refactor'];

    // 優先度に応じたラベルを追加
    const priorityLabels: Record<RefactorCandidate['priority'], string> = {
      high: 'priority:high',
      medium: 'priority:medium',
      low: 'priority:low',
    };
    labels.push(priorityLabels[candidate.priority]);

    // タイプに応じたラベルを追加
    const typeLabels: Record<RefactorCandidate['type'], string> = {
      'large-file': 'code-quality',
      'large-function': 'code-quality',
      'high-complexity': 'code-quality',
      'duplication': 'duplication',
      'unused-code': 'cleanup',
      'missing-docs': 'documentation',
    };
    labels.push(typeLabels[candidate.type]);

    return labels;
  }

  /**
   * リファクタリングIssue本文を生成
   *
   * @param candidate - リファクタリング候補
   * @returns Markdown形式のIssue本文
   */
  private createRefactorBody(candidate: RefactorCandidate): string {
    const lineRangeText = candidate.lineRange
      ? ` (${candidate.lineRange.start}〜${candidate.lineRange.end}行目)`
      : '';

    const priorityEmoji: Record<RefactorCandidate['priority'], string> = {
      high: '🔴',
      medium: '🟡',
      low: '🟢',
    };

    const priorityText: Record<RefactorCandidate['priority'], string> = {
      high: '高 - 技術的負債の削減、保守性への重大な影響',
      medium: '中 - 保守性の向上、中程度の改善効果',
      low: '低 - 可読性の向上、軽微な改善',
    };

    return `## 概要

${candidate.description}

## 詳細

**リファクタリング種別**: ${candidate.type}
**優先度**: ${priorityEmoji[candidate.priority]} ${priorityText[candidate.priority]}

## 推奨される改善策

${candidate.suggestion}

## 対象ファイル

- \`${candidate.filePath}\`${lineRangeText}

## アクションアイテム

- [ ] 影響範囲を調査する
- [ ] リファクタリング計画を作成する
- [ ] コード変更を実施する
- [ ] テストを実施する
- [ ] コードレビューを受ける

---
*このIssueは自動生成されました*`;
  }

  /**
   * GitHub APIでIssueを作成
   *
   * @param title - Issueタイトル
   * @param body - Issue本文
   * @param labels - ラベルのリスト
   * @returns 作成結果（Issue番号とURL）
   */
  private async createIssueOnGitHub(
    title: string,
    body: string,
    labels: string[],
  ): Promise<{ number: number; url: string }> {
    const response = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
    });

    return {
      number: response.data.number,
      url: response.data.html_url,
    };
  }
}
