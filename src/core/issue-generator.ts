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
import * as fs from 'node:fs';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type {
  BugCandidate,
  RefactorCandidate,
  EnhancementProposal,
  IssueCreationResult,
} from '../types/auto-issue.js';

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
    const issueTitle = candidate.title;

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/generate-issue-body.txt');
    if (!fs.existsSync(promptPath)) {
      return {
        success: false,
        error: `Prompt template not found: ${promptPath}`,
        title: issueTitle,
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
            title: issueTitle,
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
              title: issueTitle,
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
          title: issueTitle,
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
        title: issueTitle,
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
        title: issueTitle,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
        title: issueTitle,
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
        fs.rmSync(filePath, { force: true });
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
    const title = this.generateRefactorTitle(candidate);

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(
      __dirname,
      '../prompts/auto-issue/generate-refactor-issue-body.txt',
    );
    if (!fs.existsSync(promptPath)) {
      logger.warn(`Prompt template not found: ${promptPath}. Using fallback template.`);
      return this.generateRefactorIssueWithFallback(candidate, dryRun);
    }

    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. 出力ファイルパスを生成
    const outputFilePath = generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    // 3. プロンプト変数を置換
    const prompt = template
      .replace('{refactor_candidate_json}', JSON.stringify(candidate, null, 2))
      .replace(/{output_file_path}/g, outputFilePath);

    // 4. エージェントを選択
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          return {
            success: false,
            error: 'Codex agent is not available.',
            title,
          };
        }
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info('Using Codex agent for refactor issue body generation.');
          await this.codexClient.executeTask({ prompt });
        } catch (error) {
          if (agent === 'codex') {
            return {
              success: false,
              error: `Codex failed: ${getErrorMessage(error)}`,
              title,
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
          title,
        };
      }
      logger.info('Using Claude agent for refactor issue body generation.');
      await this.claudeClient.executeTask({ prompt });
    }

    // 5. 出力ファイルからIssue本文を読み込み
    const issueBody = this.readRefactorOutputFile(outputFilePath, candidate);

    // 6. 一時ファイルをクリーンアップ
    this.cleanupOutputFile(outputFilePath);

    // 7. タイトルとラベルを生成
    const labels = this.generateRefactorLabels(candidate);

    // 8. dry-runモードの場合はスキップ
    if (dryRun) {
      logger.info('[DRY RUN] Skipping refactoring issue creation.');
      logger.info(`Title: ${title}`);
      logger.info(`Labels: ${labels.join(', ')}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
        title,
      };
    }

    // 9. GitHub APIでIssueを作成
    try {
      const result = await this.createIssueOnGitHub(title, issueBody, labels);

      logger.info(`Refactoring issue created: #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
        title,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
        title,
      };
    }
  }

  /**
   * フォールバック用のリファクタリングIssue生成
   *
   * @param candidate - リファクタリング候補
   * @param dryRun - dry-runモード
   * @returns Issue作成結果
   */
  private async generateRefactorIssueWithFallback(
    candidate: RefactorCandidate,
    dryRun: boolean,
  ): Promise<IssueCreationResult> {
    const title = this.generateRefactorTitle(candidate);
    const labels = this.generateRefactorLabels(candidate);
    const issueBody = this.createRefactorFallbackBody(candidate);

    if (dryRun) {
      logger.info('[DRY RUN] Skipping refactoring issue creation (fallback).');
      logger.info(`Title: ${title}`);
      logger.info(`Labels: ${labels.join(', ')}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
        title,
      };
    }

    try {
      const result = await this.createIssueOnGitHub(title, issueBody, labels);
      logger.info(`Refactoring issue created (fallback): #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
        title,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
        title,
      };
    }
  }

  /**
   * 出力ファイルからリファクタリングIssue本文を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @param candidate - リファクタリング候補（フォールバック用）
   * @returns Markdown形式のIssue本文
   */
  private readRefactorOutputFile(filePath: string, candidate: RefactorCandidate): string {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Using fallback template.`);
      return this.createRefactorFallbackBody(candidate);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      if (!content) {
        logger.warn('Output file is empty. Using fallback template.');
        return this.createRefactorFallbackBody(candidate);
      }

      if (!content.includes('##')) {
        logger.warn(
          'Output file does not contain valid Markdown sections. Using fallback template.',
        );
        return this.createRefactorFallbackBody(candidate);
      }

      logger.info('Successfully read refactor issue body from output file.');
      return content;
    } catch (error) {
      logger.error(`Failed to read output file: ${getErrorMessage(error)}`);
      return this.createRefactorFallbackBody(candidate);
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
   * フォールバック用のリファクタリングIssue本文を生成
   *
   * @param candidate - リファクタリング候補
   * @returns Markdown形式のIssue本文
   */
  private createRefactorFallbackBody(candidate: RefactorCandidate): string {
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
   * 機能拡張Issueを生成
   *
   * @param proposal - 機能拡張提案
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param dryRun - dry-runモード（true: Issue作成をスキップ）
   * @returns Issue作成結果
   */
  public async generateEnhancementIssue(
    proposal: EnhancementProposal,
    agent: 'auto' | 'codex' | 'claude',
    dryRun: boolean,
  ): Promise<IssueCreationResult> {
    logger.info(
      `Generating enhancement issue for: "${proposal.type}" - "${proposal.title}"`,
    );
    const title = this.generateEnhancementTitle(proposal);

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(
      __dirname,
      '../prompts/auto-issue/generate-enhancement-issue-body.txt',
    );
    if (!fs.existsSync(promptPath)) {
      logger.warn(`Prompt template not found: ${promptPath}. Using fallback template.`);
      return this.generateEnhancementIssueWithFallback(proposal, dryRun);
    }

    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. 出力ファイルパスを生成
    const outputFilePath = generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    // 3. プロンプト変数を置換
    const prompt = template
      .replace('{enhancement_proposal_json}', JSON.stringify(proposal, null, 2))
      .replace(/{output_file_path}/g, outputFilePath);

    // 4. エージェントを選択
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          return {
            success: false,
            error: 'Codex agent is not available.',
            title,
          };
        }
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info('Using Codex agent for enhancement issue body generation.');
          await this.codexClient.executeTask({ prompt });
        } catch (error) {
          if (agent === 'codex') {
            return {
              success: false,
              error: `Codex failed: ${getErrorMessage(error)}`,
              title,
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
          title,
        };
      }
      logger.info('Using Claude agent for enhancement issue body generation.');
      await this.claudeClient.executeTask({ prompt });
    }

    // 5. 出力ファイルからIssue本文を読み込み
    const issueBody = this.readEnhancementOutputFile(outputFilePath, proposal);

    // 6. 一時ファイルをクリーンアップ
    this.cleanupOutputFile(outputFilePath);

    // 7. タイトルとラベルを生成
    const labels = this.generateEnhancementLabels(proposal);

    // 8. dry-runモードの場合はスキップ
    if (dryRun) {
      logger.info('[DRY RUN] Skipping enhancement issue creation.');
      logger.info(`Title: ${title}`);
      logger.info(`Labels: ${labels.join(', ')}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
        title,
      };
    }

    // 9. GitHub APIでIssueを作成
    try {
      const result = await this.createIssueOnGitHub(title, issueBody, labels);

      logger.info(`Enhancement issue created: #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
        title,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
        title,
      };
    }
  }

  /**
   * フォールバック用の機能拡張Issue生成
   *
   * @param proposal - 機能拡張提案
   * @param dryRun - dry-runモード
   * @returns Issue作成結果
   */
  private async generateEnhancementIssueWithFallback(
    proposal: EnhancementProposal,
    dryRun: boolean,
  ): Promise<IssueCreationResult> {
    const title = this.generateEnhancementTitle(proposal);
    const labels = this.generateEnhancementLabels(proposal);
    const issueBody = this.createEnhancementFallbackBody(proposal);

    if (dryRun) {
      logger.info('[DRY RUN] Skipping enhancement issue creation (fallback).');
      logger.info(`Title: ${title}`);
      logger.info(`Labels: ${labels.join(', ')}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
        title,
      };
    }

    try {
      const result = await this.createIssueOnGitHub(title, issueBody, labels);
      logger.info(`Enhancement issue created (fallback): #${result.number} (${result.url})`);
      return {
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
        title,
      };
    } catch (error) {
      return {
        success: false,
        error: `GitHub API failed: ${getErrorMessage(error)}`,
        title,
      };
    }
  }

  /**
   * 出力ファイルから機能拡張Issue本文を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @param proposal - 機能拡張提案（フォールバック用）
   * @returns Markdown形式のIssue本文
   */
  private readEnhancementOutputFile(filePath: string, proposal: EnhancementProposal): string {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Using fallback template.`);
      return this.createEnhancementFallbackBody(proposal);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      if (!content) {
        logger.warn('Output file is empty. Using fallback template.');
        return this.createEnhancementFallbackBody(proposal);
      }

      if (!content.includes('##')) {
        logger.warn(
          'Output file does not contain valid Markdown sections. Using fallback template.',
        );
        return this.createEnhancementFallbackBody(proposal);
      }

      logger.info('Successfully read enhancement issue body from output file.');
      return content;
    } catch (error) {
      logger.error(`Failed to read output file: ${getErrorMessage(error)}`);
      return this.createEnhancementFallbackBody(proposal);
    }
  }

  /**
   * 機能拡張Issueのタイトルを生成
   *
   * @param proposal - 機能拡張提案
   * @returns Issueタイトル
   */
  private generateEnhancementTitle(proposal: EnhancementProposal): string {
    const typeEmoji: Record<EnhancementProposal['type'], string> = {
      improvement: '⚡',
      integration: '🔗',
      automation: '🤖',
      dx: '✨',
      quality: '🛡️',
      ecosystem: '🌐',
    };

    const emoji = typeEmoji[proposal.type];
    return `[Enhancement] ${emoji} ${proposal.title}`;
  }

  /**
   * 機能拡張Issueのラベルを生成
   *
   * @param proposal - 機能拡張提案
   * @returns ラベルのリスト
   */
  private generateEnhancementLabels(proposal: EnhancementProposal): string[] {
    const labels = ['auto-generated', 'enhancement'];

    // タイプに応じたラベルを追加
    const typeLabels: Record<EnhancementProposal['type'], string> = {
      improvement: 'improvement',
      integration: 'integration',
      automation: 'automation',
      dx: 'developer-experience',
      quality: 'quality',
      ecosystem: 'ecosystem',
    };
    labels.push(typeLabels[proposal.type]);

    // 期待される効果に応じたラベルを追加
    const impactLabels: Record<EnhancementProposal['expected_impact'], string> = {
      high: 'impact:high',
      medium: 'impact:medium',
      low: 'impact:low',
    };
    labels.push(impactLabels[proposal.expected_impact]);

    // 実装の難易度に応じたラベルを追加
    const effortLabels: Record<EnhancementProposal['effort_estimate'], string> = {
      large: 'effort:large',
      medium: 'effort:medium',
      small: 'effort:small',
    };
    labels.push(effortLabels[proposal.effort_estimate]);

    return labels;
  }

  /**
   * フォールバック用の機能拡張Issue本文を生成
   *
   * @param proposal - 機能拡張提案
   * @returns Markdown形式のIssue本文
   */
  private createEnhancementFallbackBody(proposal: EnhancementProposal): string {
    const impactEmoji: Record<EnhancementProposal['expected_impact'], string> = {
      high: '🔥',
      medium: '⚡',
      low: '💡',
    };

    const effortEmoji: Record<EnhancementProposal['effort_estimate'], string> = {
      large: '🏗️',
      medium: '🔧',
      small: '🔨',
    };

    const impactText: Record<EnhancementProposal['expected_impact'], string> = {
      high: '高 - 大きな価値を提供',
      medium: '中 - 中程度の価値を提供',
      low: '低 - 限定的な価値を提供',
    };

    const effortText: Record<EnhancementProposal['effort_estimate'], string> = {
      large: '大 - 長期的な取り組みが必要',
      medium: '中 - 中程度の工数が必要',
      small: '小 - 短期間で実装可能',
    };

    // 実装ヒントをマークダウンリストに変換
    const implementationHintsList = proposal.implementation_hints
      .map((hint) => `- ${hint}`)
      .join('\n');

    // 関連ファイルをマークダウンリストに変換
    const relatedFilesList = proposal.related_files.map((file) => `- \`${file}\``).join('\n');

    return `## 概要

${proposal.description}

## 提案理由

${proposal.rationale}

## 詳細

**提案タイプ**: ${proposal.type}
**期待される効果**: ${impactEmoji[proposal.expected_impact]} ${impactText[proposal.expected_impact]}
**実装の難易度**: ${effortEmoji[proposal.effort_estimate]} ${effortText[proposal.effort_estimate]}

## 実装のヒント

${implementationHintsList}

## 関連ファイル

${relatedFilesList}

## アクションアイテム

- [ ] 要件を詳細化する
- [ ] 技術的な実現可能性を検証する
- [ ] 実装計画を作成する
- [ ] 実装を開始する
- [ ] テストを実施する
- [ ] ドキュメントを更新する

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
