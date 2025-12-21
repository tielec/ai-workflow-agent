import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { Octokit } from '@octokit/rest';
import { MetadataManager } from './metadata-manager.js';
import { RemainingTask, IssueContext, type IssueGenerationOptions } from '../types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IssueClient, type IssueCreationResult } from './github/issue-client.js';
import { PullRequestClient, type PullRequestSummary, type PullRequestResult } from './github/pull-request-client.js';
import { CommentClient, type ProgressCommentResult } from './github/comment-client.js';
import { ReviewClient } from './github/review-client.js';
import { getErrorMessage } from '../utils/error-utils.js';
import {
  IssueAIGenerator,
  OpenAIAdapter,
  AnthropicAdapter,
} from './github/issue-ai-generator.js';
import { IssueAgentGenerator } from './github/issue-agent-generator.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';

// Re-export types for backward compatibility
export type {
  IssueInfo,
  CommentDict,
  IssueCreationResult,
  GenericResult as IssueGenericResult,
} from './github/issue-client.js';
export type {
  PullRequestSummary,
  PullRequestResult,
  GenericResult as PullRequestGenericResult,
} from './github/pull-request-client.js';
export type { ProgressCommentResult } from './github/comment-client.js';

// Unified GenericResult type for backward compatibility
export interface GenericResult {
  success: boolean;
  error?: string | null;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PR_TEMPLATE_PATH = path.resolve(moduleDir, '..', 'templates', 'pr_body_template.md');
const PR_DETAILED_TEMPLATE_PATH = path.resolve(
  moduleDir,
  '..',
  'templates',
  'pr_body_detailed_template.md',
);

/**
 * GitHubClient - Facade pattern for GitHub API operations
 *
 * This class provides a unified interface to specialized GitHub clients:
 * - IssueClient: Issue operations (getIssue, postComment, closeIssue, etc.)
 * - PullRequestClient: PR operations (createPR, updatePR, closePR, etc.)
 * - CommentClient: Comment operations (postWorkflowProgress, createOrUpdateProgressComment)
 * - ReviewClient: Review result posting (postReviewResult)
 *
 * All clients share a single Octokit instance for authentication.
 * Document extraction methods remain in GitHubClient as utility functions.
 */
export class GitHubClient {
  private readonly token: string;
  private readonly repositoryName: string;
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  // Specialized clients
  private readonly issueClient: IssueClient;
  private readonly pullRequestClient: PullRequestClient;
  public readonly commentClient: CommentClient;
  private readonly reviewClient: ReviewClient;

  constructor(
    token?: string | null,
    repository?: string | null,
    codexClient?: CodexAgentClient | null,
    claudeClient?: ClaudeAgentClient | null,
  ) {
    // フォールバック: 引数が指定されていない場合はConfigクラスから取得
    if (token === undefined || token === null) {
      this.token = config.getGitHubToken();
    } else {
      this.token = token;
    }
    if (!this.token) {
      throw new Error(
        'GitHub token is required. Please set the GITHUB_TOKEN environment variable.',
      );
    }

    // フォールバック: 引数が指定されていない場合はConfigクラスから取得
    if (repository === undefined || repository === null) {
      this.repositoryName = config.getGitHubRepository() ?? '';
    } else {
      this.repositoryName = repository;
    }
    if (!this.repositoryName) {
      throw new Error(
        'Repository name is required. Please set the GITHUB_REPOSITORY environment variable.',
      );
    }

    const [owner, repo] = this.repositoryName.split('/');
    if (!owner || !repo) {
      throw new Error(
        `Invalid repository name: ${this.repositoryName}. Expected owner/repo format.`,
      );
    }

    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: this.token });

    // Initialize specialized clients with dependency injection
    const openAiAdapter = new OpenAIAdapter(config.getOpenAiApiKey());
    const anthropicAdapter = new AnthropicAdapter(config.getAnthropicApiKey());
    const issueAIGenerator = new IssueAIGenerator({
      openai: openAiAdapter,
      claude: anthropicAdapter,
    });

    // Issue #174: Initialize IssueAgentGenerator for agent-based FOLLOW-UP Issue generation
    const issueAgentGenerator = new IssueAgentGenerator(
      codexClient ?? null,
      claudeClient ?? null,
    );

    this.issueClient = new IssueClient(
      this.octokit,
      this.owner,
      this.repo,
      issueAIGenerator,
      issueAgentGenerator,
    );
    this.pullRequestClient = new PullRequestClient(
      this.octokit,
      this.owner,
      this.repo,
      this.repositoryName,
    );
    this.commentClient = new CommentClient(this.octokit, this.owner, this.repo);
    this.reviewClient = new ReviewClient(this.octokit, this.owner, this.repo);
  }

  // ============================================================================
  // Issue operations (delegated to IssueClient)
  // ============================================================================

  public async getIssue(issueNumber: number) {
    return this.issueClient.getIssue(issueNumber);
  }

  public async getIssueInfo(issueNumber: number) {
    return this.issueClient.getIssueInfo(issueNumber);
  }

  public async getIssueComments(issueNumber: number) {
    return this.issueClient.getIssueComments(issueNumber);
  }

  public async getIssueCommentsDict(issueNumber: number) {
    return this.issueClient.getIssueCommentsDict(issueNumber);
  }

  public async postComment(issueNumber: number, body: string) {
    return this.issueClient.postComment(issueNumber, body);
  }

  public async closeIssueWithReason(issueNumber: number, reason: string): Promise<GenericResult> {
    return this.issueClient.closeIssueWithReason(issueNumber, reason);
  }

  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string,
    issueContext?: IssueContext,
    options?: IssueGenerationOptions,
  ): Promise<IssueCreationResult> {
    return this.issueClient.createIssueFromEvaluation(
      issueNumber,
      remainingTasks,
      evaluationReportPath,
      issueContext,
      options,
    );
  }

  // ============================================================================
  // Comment operations (delegated to CommentClient)
  // ============================================================================

  public async postWorkflowProgress(
    issueNumber: number,
    phase: string,
    status: string,
    details?: string,
  ) {
    return this.commentClient.postWorkflowProgress(issueNumber, phase, status, details);
  }

  public async createOrUpdateProgressComment(
    issueNumber: number,
    content: string,
    metadataManager: MetadataManager,
  ): Promise<ProgressCommentResult> {
    return this.commentClient.createOrUpdateProgressComment(issueNumber, content, metadataManager);
  }

  // ============================================================================
  // Review operations (delegated to ReviewClient)
  // ============================================================================

  public async postReviewResult(
    issueNumber: number,
    phase: string,
    result: string,
    feedback: string,
    suggestions: string[],
  ) {
    return this.reviewClient.postReviewResult(issueNumber, phase, result, feedback, suggestions);
  }

  // ============================================================================
  // Pull Request operations (delegated to PullRequestClient)
  // ============================================================================

  public async createPullRequest(
    title: string,
    body: string,
    head: string,
    base = 'main',
    draft = true,
  ): Promise<PullRequestResult> {
    return this.pullRequestClient.createPullRequest(title, body, head, base, draft);
  }

  public async checkExistingPr(head: string, base = 'main'): Promise<PullRequestSummary | null> {
    return this.pullRequestClient.checkExistingPr(head, base);
  }

  public async updatePullRequest(prNumber: number, body: string): Promise<GenericResult> {
    return this.pullRequestClient.updatePullRequest(prNumber, body);
  }

  public async closePullRequest(prNumber: number, reason?: string): Promise<GenericResult> {
    return this.pullRequestClient.closePullRequest(prNumber, reason);
  }

  public async getPullRequestNumber(issueNumber: number): Promise<number | null> {
    return this.pullRequestClient.getPullRequestNumber(issueNumber);
  }

  /**
   * Issue #261: PullRequestClient への直接アクセスを提供
   */
  public getPullRequestClient(): PullRequestClient {
    return this.pullRequestClient;
  }

  /**
   * リポジトリ情報を返す（owner/repo）
   */
  public getRepositoryInfo(): { owner: string; repo: string; repositoryName: string } {
    return {
      owner: this.owner,
      repo: this.repo,
      repositoryName: this.repositoryName,
    };
  }

  /**
   * PR情報を取得
   */
  public async getPullRequestInfo(prNumber: number): Promise<{
    number: number;
    url: string;
    title: string;
    head: string;
    base: string;
    state: 'open' | 'closed' | 'merged';
    node_id: string;
  }> {
    try {
      const { data } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const merged = Boolean(data.merged_at);
      const state = merged ? 'merged' : ((data.state as 'open' | 'closed') ?? 'open');

      return {
        number: data.number ?? prNumber,
        url: data.html_url ?? '',
        title: data.title ?? '',
        head: data.head?.ref ?? '',
        base: data.base?.ref ?? '',
        state,
        node_id: data.node_id ?? '',
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get pull request info: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to get pull request info: ${message}`);
    }
  }

  // ============================================================================
  // Document extraction utilities (kept in GitHubClient as utility functions)
  // ============================================================================

  public generatePrBodyTemplate(issueNumber: number, branchName: string): string {
    if (!fs.existsSync(PR_TEMPLATE_PATH)) {
      throw new Error(
        `PR template not found: ${PR_TEMPLATE_PATH}. Please ensure the template file exists.`,
      );
    }

    const template = fs.readFileSync(PR_TEMPLATE_PATH, 'utf-8');
    return template
      .replace(/\{issue_number\}/g, issueNumber.toString())
      .replace(/\{branch_name\}/g, branchName);
  }

  public generatePrBodyDetailed(
    issueNumber: number,
    branchName: string,
    extractedInfo: Record<string, string>,
  ): string {
    if (!fs.existsSync(PR_DETAILED_TEMPLATE_PATH)) {
      throw new Error(
        `Detailed PR template not found: ${PR_DETAILED_TEMPLATE_PATH}. Please ensure the template file exists.`,
      );
    }

    const template = fs.readFileSync(PR_DETAILED_TEMPLATE_PATH, 'utf-8');
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      if (key === 'issue_number') {
        return String(issueNumber);
      }
      if (key === 'branch_name') {
        return branchName;
      }
      if (Object.prototype.hasOwnProperty.call(extractedInfo, key)) {
        return extractedInfo[key] ?? '';
      }
      return `{${key}}`;
    });
  }

  public async extractPhaseOutputs(
    issueNumber: number,
    phaseOutputs: Record<string, string | null | undefined>,
  ): Promise<Record<string, string>> {
    try {
      const issue = await this.getIssue(issueNumber);
      const summary = this.extractSummaryFromIssue(issue.body ?? '');
      const implementationDetails = this.extractSectionFromFile(
        phaseOutputs.implementation,
        ['## 実装詳細', '## 実装内容', '## Implementation Details'],
        '（実装詳細の記載なし）',
      );
      const testResults = this.extractSectionFromFile(
        phaseOutputs.test_result,
        ['## テスト結果サマリー', '## テスト結果', '## Test Results'],
        '（テスト結果の記載なし）',
      );
      const documentationUpdates = this.extractSectionFromFile(
        phaseOutputs.documentation,
        ['## 更新したドキュメント', '## ドキュメント更新ログ', '## Documentation Updates'],
        '（ドキュメント更新の記載なし）',
      );
      const reviewPoints = this.extractSectionFromFile(
        phaseOutputs.design,
        ['## レビューポイント', '## Review Points', '## レビュー'],
        '（レビューの記載なし）',
      );

      return {
        summary,
        implementation_details: implementationDetails,
        test_results: testResults,
        documentation_updates: documentationUpdates,
        review_points: reviewPoints,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to extract phase outputs: ${this.encodeWarning(message)}`);
      return {
        summary: '（概要の記載なし）',
        implementation_details: '（実装詳細の記載なし）',
        test_results: '（テスト結果の記載なし）',
        documentation_updates: '（ドキュメント更新の記載なし）',
        review_points: '（レビューの記載なし）',
      };
    }
  }

  public close(): void {
    // Octokit does not require explicit disposal.
  }

  private extractSectionFromFile(
    filePath: string | null | undefined,
    headers: string[],
    fallback: string,
  ): string {
    if (!filePath || !fs.existsSync(filePath)) {
      return fallback;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const section = this.extractSectionWithCandidates(content, headers);
    return section || fallback;
  }

  private extractSectionWithCandidates(content: string, headers: string[]): string {
    for (const header of headers) {
      const result = this.extractSection(content, header);
      if (result) {
        return result;
      }
    }
    return '';
  }

  private extractSection(content: string, header: string): string {
    const normalizedHeader = header.trim();
    const lines = content.split(/\r?\n/);
    const buffer: string[] = [];
    let collecting = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith(normalizedHeader)) {
        collecting = true;
        continue;
      }

      if (collecting && /^##\s+/.test(trimmed)) {
        break;
      }

      if (collecting) {
        buffer.push(line);
      }
    }

    return buffer.join('\n').trim();
  }

  private extractSummaryFromIssue(issueBody: string): string {
    if (!issueBody.trim()) {
      return '（概要の記載なし）';
    }

    const summary = this.extractSectionWithCandidates(issueBody, ['## 概要', '## Summary']);
    if (summary) {
      return summary;
    }

    const firstLine = issueBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));

    return firstLine ?? '（概要の記載なし）';
  }

  /**
   * Helper method to encode warning messages for safe logging.
   */
  private encodeWarning(message: string): string {
    return Buffer.from(message, 'utf-8').toString();
  }
}
