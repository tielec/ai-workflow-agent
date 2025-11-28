/**
 * IssueGenerator - Issue生成エンジン
 *
 * エージェント（Codex/Claude）を使用してIssue本文を生成し、
 * GitHub APIでIssueを作成します。
 *
 * @module issue-generator
 */

import path from 'node:path';
import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { BugCandidate, IssueCreationResult } from '../types/auto-issue.js';

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

    // 2. プロンプト変数を置換
    const prompt = template.replace('{bug_candidate_json}', JSON.stringify(candidate, null, 2));

    // 3. エージェントを選択（RepositoryAnalyzer と同じロジック）
    let rawOutput: string;
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
          const events = await this.codexClient.executeTask({ prompt });
          rawOutput = events.join('\n');
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
      const events = await this.claudeClient.executeTask({ prompt });
      rawOutput = events.join('\n');
    }

    // 4. Issue本文を生成
    const issueBody = this.createIssueBody(candidate, rawOutput!);

    // 5. dry-runモードの場合はスキップ
    if (dryRun) {
      logger.info('[DRY RUN] Skipping issue creation.');
      logger.info(`Title: ${candidate.title}`);
      logger.info(`Body:\n${issueBody}`);
      return {
        success: true,
        skippedReason: 'dry-run mode',
      };
    }

    // 6. GitHub APIでIssueを作成
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
   * Issue本文を生成
   *
   * エージェント出力からMarkdownブロックを抽出します。
   *
   * @param candidate - バグ候補
   * @param agentOutput - エージェントの生成結果
   * @returns Markdown形式のIssue本文
   */
  private createIssueBody(candidate: BugCandidate, agentOutput: string): string {
    // エージェント出力から Markdown ブロックを抽出
    const markdownMatch = agentOutput.match(/```markdown\n([\s\S]*?)\n```/);
    if (markdownMatch) {
      return markdownMatch[1];
    }

    // フォールバック: エージェント出力をそのまま使用
    return agentOutput;
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
