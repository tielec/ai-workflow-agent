import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { MetadataManager } from './metadata-manager.js';
import { RemainingTask } from '../types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PullRequestSummary {
  pr_number: number;
  pr_url: string;
  state: string;
}

export interface PullRequestResult {
  success: boolean;
  pr_url: string | null;
  pr_number: number | null;
  error?: string | null;
}

export interface IssueCreationResult {
  success: boolean;
  issue_url: string | null;
  issue_number: number | null;
  error?: string | null;
}

export interface GenericResult {
  success: boolean;
  error?: string | null;
}

export interface ProgressCommentResult {
  comment_id: number;
  comment_url: string | null;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PR_TEMPLATE_PATH = path.resolve(moduleDir, '..', 'templates', 'pr_body_template.md');
const PR_DETAILED_TEMPLATE_PATH = path.resolve(
  moduleDir,
  '..',
  'templates',
  'pr_body_detailed_template.md',
);

const encodeWarning = (message: string): string =>
  Buffer.from(message, 'utf-8').toString();

export class GitHubClient {
  private readonly token: string;
  private readonly repositoryName: string;
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(token?: string | null, repository?: string | null) {
    this.token = token ?? process.env.GITHUB_TOKEN ?? '';
    if (!this.token) {
      throw new Error(
        'GitHub token is required. Please set the GITHUB_TOKEN environment variable.',
      );
    }

    this.repositoryName = repository ?? process.env.GITHUB_REPOSITORY ?? '';
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
  }

  public async getIssue(issueNumber: number) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  public async getIssueInfo(issueNumber: number) {
    const issue = await this.getIssue(issueNumber);
    return {
      number: issue.number,
      title: issue.title ?? '',
      body: issue.body ?? '',
      state: issue.state ?? 'open',
      labels: (issue.labels ?? []).map((label) =>
        typeof label === 'string' ? label : label.name ?? '',
      ),
      url: issue.html_url ?? '',
      created_at: issue.created_at ?? new Date().toISOString(),
      updated_at: issue.updated_at ?? new Date().toISOString(),
    };
  }

  public async getIssueComments(issueNumber: number) {
    const { data } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  public async getIssueCommentsDict(issueNumber: number) {
    const comments = await this.getIssueComments(issueNumber);
    return comments.map((comment) => ({
      id: comment.id,
      user: comment.user?.login ?? 'unknown',
      body: comment.body ?? '',
      created_at: comment.created_at ?? '',
      updated_at: comment.updated_at ?? '',
    }));
  }

  public async postComment(issueNumber: number, body: string) {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return data;
  }

  public async postWorkflowProgress(
    issueNumber: number,
    phase: string,
    status: string,
    details?: string,
  ) {
    const statusEmoji: Record<string, string> = {
      pending: '⏸️',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
    };

    const phaseNames: Record<string, string> = {
      planning: '企画',
      requirements: '要件定義',
      design: '設計',
      test_scenario: 'テストシナリオ',
      implementation: '実装',
      testing: 'テスト',
      documentation: 'ドキュメント',
    };

    const emoji = statusEmoji[status] ?? '📝';
    const phaseLabel = phaseNames[phase] ?? phase;

    let body = `## ${emoji} AI Workflow - ${phaseLabel}フェーズ\n\n`;
    body += `**ステータス**: ${status.toUpperCase()}\n\n`;

    if (details) {
      body += `${details}\n\n`;
    }

    body += '---\n';
    body += '*AI駆動開発自動化ワークフロー (Claude Agent SDK)*';

    return this.postComment(issueNumber, body);
  }

  public async postReviewResult(
    issueNumber: number,
    phase: string,
    result: string,
    feedback: string,
    suggestions: string[],
  ) {
    const emojiMap: Record<string, string> = {
      PASS: '✅',
      PASS_WITH_SUGGESTIONS: '⚠️',
      FAIL: '❌',
    };

    const phaseNames: Record<string, string> = {
      requirements: '要件定義',
      design: '設計',
      test_scenario: 'テストシナリオ',
      implementation: '実装',
      testing: 'テスト',
      documentation: 'ドキュメント',
    };

    const emoji = emojiMap[result] ?? '📝';
    const phaseLabel = phaseNames[phase] ?? phase;

    let body = `## ${emoji} レビュー結果 - ${phaseLabel}フェーズ\n\n`;
    body += `**判定**: ${result}\n\n`;

    if (feedback) {
      body += `### フィードバック\n\n${feedback}\n\n`;
    }

    if (suggestions.length) {
      body += '### 改善提案\n\n';
      suggestions.forEach((item, index) => {
        body += `${index + 1}. ${item}\n`;
      });
      body += '\n';
    }

    body += '---\n';
    body += '*AI駆動開発自動化ワークフロー - クリティカルシンキングレビュー*';

    return this.postComment(issueNumber, body);
  }

  public async createPullRequest(
    title: string,
    body: string,
    head: string,
    base = 'main',
    draft = true,
  ): Promise<PullRequestResult> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        head,
        base,
        draft,
      });

      return {
        success: true,
        pr_url: data.html_url ?? null,
        pr_number: data.number ?? null,
        error: null,
      };
    } catch (error) {
      if (error instanceof RequestError) {
        if (error.status === 401 || error.status === 403) {
          return {
            success: false,
            pr_url: null,
            pr_number: null,
            error:
              'GitHub Token lacks required scope. Please ensure the token has the repo scope.',
          };
        }

        if (error.status === 422) {
          return {
            success: false,
            pr_url: null,
            pr_number: null,
            error: 'A pull request already exists for this branch.',
          };
        }

        return {
          success: false,
          pr_url: null,
          pr_number: null,
          error: `GitHub API error: ${error.status} - ${error.message}`,
        };
      }

      return {
        success: false,
        pr_url: null,
        pr_number: null,
        error: `Unexpected error: ${(error as Error).message}`,
      };
    }
  }

  public async checkExistingPr(head: string, base = 'main'): Promise<PullRequestSummary | null> {
    try {
      const fullHead = `${this.owner}:${head}`;
      const { data } = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        head: fullHead,
        base,
        state: 'open',
        per_page: 1,
      });

      const pr = data[0];
      if (!pr) {
        return null;
      }

      return {
        pr_number: pr.number ?? 0,
        pr_url: pr.html_url ?? '',
        state: pr.state ?? 'open',
      };
    } catch (error) {
      console.warn(
        `[WARNING] Failed to check existing PR: ${encodeWarning((error as Error).message)}`,
      );
      return null;
    }
  }

  public generatePrBodyTemplate(issueNumber: number, branchName: string): string {
    if (!fs.existsSync(PR_TEMPLATE_PATH)) {
      throw new Error(
        `PR template not found: ${PR_TEMPLATE_PATH}. Please ensure the template file exists.`,
      );
    }

    const template = fs.readFileSync(PR_TEMPLATE_PATH, 'utf-8');
    return template
      .replace('{issue_number}', issueNumber.toString())
      .replace('{branch_name}', branchName);
  }

  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string,
  ): Promise<IssueCreationResult> {
    try {
      const title = `[FOLLOW-UP] Issue #${issueNumber} - 残タスク`;
      const lines: string[] = [];

      lines.push('## 概要', '');
      lines.push(`AI Workflow Issue #${issueNumber} の評価フェーズで残タスクが見つかりました。`, '');
      lines.push('## 残タスク一覧', '');

      for (const task of remainingTasks) {
        const taskText = String(task.task ?? '');
        const phase = String(task.phase ?? 'unknown');
        const priority = String(task.priority ?? '中');
        lines.push(`- [ ] ${taskText} (Phase: ${phase}, 優先度: ${priority})`);
      }

      lines.push('', '## 参考', '');
      lines.push(`- 元Issue: #${issueNumber}`);
      lines.push(`- Evaluation Report: \`${evaluationReportPath}\``);
      lines.push('', '---', '*自動生成: AI Workflow Phase 9 (Evaluation)*');

      const { data } = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body: lines.join('\n'),
        labels: ['enhancement', 'ai-workflow-follow-up'],
      });

      return {
        success: true,
        issue_url: data.html_url ?? null,
        issue_number: data.number ?? null,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : (error as Error).message;

      console.error(`[ERROR] Failed to create follow-up issue: ${encodeWarning(message)}`);

      return {
        success: false,
        issue_url: null,
        issue_number: null,
        error: message,
      };
    }
  }

  public async closeIssueWithReason(issueNumber: number, reason: string): Promise<GenericResult> {
    try {
      await this.postComment(
        issueNumber,
        [
          '## ⚠️ ワークフロー中止',
          '',
          'プロジェクト評価の結果、致命的な問題が発見されたため、ワークフローを中止します。',
          '',
          '### 中止理由',
          '',
          reason,
          '',
          '### 推奨アクション',
          '',
          '- アーキテクチャの再設計',
          '- スコープの見直し',
          '- 技術選定の再検討',
          '',
          '---',
          '*AI Workflow Phase 9 (Evaluation) - ABORT*',
        ].join('\n'),
      );

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed',
      });

      console.info(`[INFO] Closed issue #${issueNumber}`);

      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : (error as Error).message;
      console.error(`[ERROR] Failed to close issue: ${encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  public async closePullRequest(prNumber: number, reason?: string): Promise<GenericResult> {
    try {
      if (reason) {
        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          body: [
            '## ⚠️ プルリクエストをドラフトに戻しました',
            '',
            reason,
            '',
            '---',
            '*AI Workflow Phase 9 (Evaluation)*',
          ].join('\n'),
        });
      }

      await this.octokit.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        state: 'closed',
      });

      console.info(`[INFO] Closed pull request #${prNumber}`);
      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : (error as Error).message;
      console.error(`[ERROR] Failed to close PR: ${encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  public async getPullRequestNumber(issueNumber: number): Promise<number | null> {
    try {
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: `repo:${this.repositoryName} type:pr state:open in:body ${issueNumber}`,
        per_page: 5,
      });

      const match = data.items.find((item) => item.pull_request);
      return match?.number ?? null;
    } catch (error) {
      const message = (error as Error).message;
      console.warn(`[WARNING] Failed to lookup PR number: ${encodeWarning(message)}`);
      return null;
    }
  }

  public async createOrUpdateProgressComment(
    issueNumber: number,
    content: string,
    metadataManager: MetadataManager,
  ): Promise<ProgressCommentResult> {
    try {
      const existingId = metadataManager.getProgressCommentId();

      if (existingId) {
        try {
          const { data } = await this.octokit.issues.updateComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: existingId,
            body: content,
          });

          const commentId = data.id ?? existingId;
          metadataManager.saveProgressCommentId(commentId, data.html_url ?? '');

          return {
            comment_id: commentId,
            comment_url: data.html_url ?? null,
          };
        } catch (error) {
          const message =
            error instanceof RequestError
              ? `GitHub API error: ${error.status} - ${error.message}`
              : (error as Error).message;
          console.warn(`[WARNING] Failed to update progress comment: ${encodeWarning(message)}`);
        }
      }

      const { data } = await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: content,
      });

      metadataManager.saveProgressCommentId(data.id, data.html_url ?? '');

      return {
        comment_id: data.id ?? 0,
        comment_url: data.html_url ?? null,
      };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : (error as Error).message;
      console.error(`[ERROR] Failed to create/update progress comment: ${encodeWarning(message)}`);
      throw new Error(`Failed to create or update progress comment: ${message}`);
    }
  }

  public async updatePullRequest(prNumber: number, body: string): Promise<GenericResult> {
    try {
      await this.octokit.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        body,
      });

      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : (error as Error).message;
      console.error(`[ERROR] Failed to update PR: ${encodeWarning(message)}`);
      return { success: false, error: message };
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
      const message = (error as Error).message ?? String(error);
      console.warn(`[WARNING] Failed to extract phase outputs: ${encodeWarning(message)}`);
      return {
        summary: '（概要の記載なし）',
        implementation_details: '（実装詳細の記載なし）',
        test_results: '（テスト結果の記載なし）',
        documentation_updates: '（ドキュメント更新の記載なし）',
        review_points: '（レビューの記載なし）',
      };
    }
  }
}
