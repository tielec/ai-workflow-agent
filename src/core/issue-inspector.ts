import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { PromptLoader } from './prompt-loader.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { IssueClient, IssueInfo } from './github/issue-client.js';
import type {
  CloseIssueResult,
  CommentInfo,
  FilterOptions,
  InspectionResult,
  IssueCandidate,
  IssueCategory,
  IssueRecommendation,
  ParentIssueInfo,
} from '../types/auto-close-issue.js';

const RECENT_UPDATE_DAYS = 7;

/**
 * Issue検品を行うクラス
 */
export class IssueInspector {
  constructor(
    private readonly codexClient: CodexAgentClient | null,
    private readonly claudeClient: ClaudeAgentClient | null,
    private readonly issueClient: IssueClient,
  ) {}

  /**
   * 指定カテゴリのIssue候補を取得
   */
  public async getCandidates(
    category: IssueCategory,
    options: FilterOptions,
  ): Promise<IssueCandidate[]> {
    const issues = await this.issueClient.listOpenIssues();
    const now = new Date();

    const candidates: IssueCandidate[] = [];
    for (const issue of issues) {
      if (this.hasExcludedLabel(issue.labels, options.excludeLabels)) {
        continue;
      }

      if (this.isRecentlyUpdated(issue.updated_at, RECENT_UPDATE_DAYS, now)) {
        continue;
      }

      if (!this.matchesCategory(issue, category, options, now)) {
        continue;
      }

      const candidate: IssueCandidate = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        url: issue.url,
      };

      if (category === 'followup') {
        const parentInfo = await this.resolveParentIssue(issue.title);
        if (parentInfo) {
          candidate.parentIssue = parentInfo;
        }
      }

      const comments = await this.fetchLatestComments(issue.number);
      if (comments.length > 0) {
        candidate.comments = comments;
      }

      candidates.push(candidate);

      if (candidates.length >= options.limit) {
        break;
      }
    }

    logger.info(`Filtered ${candidates.length} issue candidates for category '${category}'.`);
    return candidates;
  }

  /**
   * Issue候補をエージェントで検品
   */
  public async inspect(
    candidates: IssueCandidate[],
    agentType: 'auto' | 'codex' | 'claude',
  ): Promise<InspectionResult[]> {
    const results: InspectionResult[] = [];

    for (const candidate of candidates) {
      const promptTemplate = PromptLoader.loadPrompt('auto-close', 'inspect-issue');
      const outputFilePath = this.generateOutputFilePath(candidate.number);
      const prompt = this.buildPrompt(promptTemplate, candidate, outputFilePath);

      try {
        await this.executeWithFallback(prompt, outputFilePath, agentType);
        const parsed = this.readInspectionOutput(outputFilePath, candidate.number);
        if (parsed) {
          results.push(parsed);
        } else {
          logger.warn(
            `Inspection result missing or invalid for issue #${candidate.number}. Skipping.`,
          );
        }
      } catch (error) {
        logger.error(
          `Failed to inspect issue #${candidate.number}: ${getErrorMessage(error)}`,
        );
      } finally {
        this.cleanupOutputFile(outputFilePath);
      }
    }

    logger.info(`Inspection finished. Parsed ${results.length} result(s).`);
    return results;
  }

  /**
   * 検品結果を信頼度閾値でフィルタリング
   */
  public filterByConfidence(
    results: InspectionResult[],
    threshold: number,
  ): InspectionResult[] {
    return results.filter((result) => {
      if (result.recommendation !== 'close') {
        return true;
      }
      return result.confidence >= threshold;
    });
  }

  /**
   * Issueをクローズ（dry-run対応）
   */
  public async closeIssue(
    issue: IssueCandidate,
    result: InspectionResult,
    dryRun: boolean,
  ): Promise<CloseIssueResult> {
    if (result.recommendation !== 'close') {
      return {
        issueNumber: issue.number,
        title: issue.title,
        success: true,
        action: 'skipped',
        skipReason: 'recommendation_not_close',
        inspectionResult: result,
      };
    }

    if (dryRun) {
      return {
        issueNumber: issue.number,
        title: issue.title,
        success: true,
        action: 'previewed',
        inspectionResult: result,
      };
    }

    const commentBody =
      (result.closeComment && result.closeComment.trim()) ||
      this.buildDefaultCloseComment(result);

    const closeResult = await this.issueClient.closeIssue(issue.number, commentBody);
    if (!closeResult.success) {
      return {
        issueNumber: issue.number,
        title: issue.title,
        success: false,
        action: 'error',
        error: closeResult.error ?? 'Failed to close issue.',
        inspectionResult: result,
      };
    }

    const labelResult = await this.issueClient.addLabels(issue.number, ['auto-closed']);
    if (!labelResult.success) {
      logger.warn(
        `Issue #${issue.number} was closed but label addition failed: ${labelResult.error}`,
      );
    }

    return {
      issueNumber: issue.number,
      title: issue.title,
      success: true,
      action: 'closed',
      inspectionResult: result,
    };
  }

  private buildPrompt(template: string, candidate: IssueCandidate, outputFilePath: string): string {
    const comments = candidate.comments
      ? candidate.comments
          .slice(-10)
          .map(
            (comment) =>
              `- [${comment.createdAt.toISOString()}] ${comment.author}: ${comment.body}`,
          )
          .join('\n')
      : 'コメントなし';

    const parentInfo = candidate.parentIssue
      ? `親Issue: #${candidate.parentIssue.number} (${candidate.parentIssue.state}) - ${candidate.parentIssue.title}`
      : '親Issue情報なし';

    return template
      .replace(/{issue_number}/g, String(candidate.number))
      .replace('{title}', candidate.title)
      .replace('{created_at}', candidate.createdAt.toISOString())
      .replace('{updated_at}', candidate.updatedAt.toISOString())
      .replace('{labels}', candidate.labels.join(', ') || 'なし')
      .replace('{body}', candidate.body || '(本文なし)')
      .replace('{comments}', comments)
      .replace('{parent_issue_info}', parentInfo)
      .replace('{mentioned_files}', '関連ファイル情報は取得していません')
      .replace('{url}', candidate.url)
      .replace(/{output_file_path}/g, outputFilePath);
  }

  private async executeWithFallback(
    prompt: string,
    outputFilePath: string,
    agent: 'auto' | 'codex' | 'claude',
  ): Promise<void> {
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          throw new Error('Codex agent is not available.');
        }
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info(`Using Codex agent for issue inspection (output: ${outputFilePath}).`);
          await this.codexClient.executeTask({ prompt });
          return;
        } catch (error) {
          if (agent === 'codex') {
            throw error;
          }
          logger.warn(`Codex failed (${getErrorMessage(error)}), falling back to Claude.`);
          selectedAgent = 'claude';
        }
      }
    }

    if (selectedAgent === 'claude') {
      if (!this.claudeClient) {
        throw new Error('Claude agent is not available.');
      }
      logger.info(`Using Claude agent for issue inspection (output: ${outputFilePath}).`);
      await this.claudeClient.executeTask({ prompt });
    }
  }

  private readInspectionOutput(
    filePath: string,
    issueNumber: number,
  ): InspectionResult | null {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Inspection output file not found: ${filePath}`);
      return null;
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to read inspection output file: ${getErrorMessage(error)}`);
      return null;
    }

    try {
      const parsed = JSON.parse(rawContent);
      const payload = Array.isArray(parsed)
        ? parsed.find((item) => Number(item?.issue_number) === issueNumber) ?? parsed[0]
        : parsed;

      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const recommendation = this.normalizeRecommendation(
        (payload as { recommendation?: string }).recommendation,
      );
      const confidence = Number((payload as { confidence?: number }).confidence);
      if (!recommendation || Number.isNaN(confidence)) {
        return null;
      }

      const result: InspectionResult = {
        issueNumber,
        recommendation,
        confidence,
        reasoning: String((payload as { reasoning?: string }).reasoning ?? '').trim(),
        closeComment: (payload as { close_comment?: string }).close_comment ?? undefined,
        suggestedActions:
          (payload as { suggested_actions?: string[] }).suggested_actions ?? undefined,
      };

      return result;
    } catch (error) {
      logger.error(`Failed to parse inspection output: ${getErrorMessage(error)}`);
      logger.error(`File content for debugging: ${rawContent}`);
      return null;
    }
  }

  private cleanupOutputFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    } catch (error) {
      logger.warn(`Failed to cleanup output file: ${getErrorMessage(error)}`);
    }
  }

  private generateOutputFilePath(issueNumber: number): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(os.tmpdir(), `auto-close-${issueNumber}-${timestamp}-${random}.json`);
  }

  private hasExcludedLabel(labels: string[], exclude: string[]): boolean {
    const normalized = labels.map((label) => label.toLowerCase());
    return exclude.some((target) => normalized.includes(target.toLowerCase()));
  }

  private isRecentlyUpdated(
    updatedAt: string,
    days: number,
    now: Date = new Date(),
  ): boolean {
    const updated = new Date(updatedAt);
    const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays < days;
  }

  private matchesCategory(
    issue: IssueInfo,
    category: IssueCategory,
    options: FilterOptions,
    now: Date,
  ): boolean {
    if (category === 'all') {
      return true;
    }

    if (category === 'followup') {
      return issue.title.toLowerCase().startsWith('[follow-up]');
    }

    if (category === 'stale') {
      const updated = new Date(issue.updated_at);
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= options.daysThreshold;
    }

    // old
    const created = new Date(issue.created_at);
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= options.daysThreshold * 2;
  }

  private async resolveParentIssue(title: string): Promise<ParentIssueInfo | null> {
    const match = title.match(/\[follow-up\]\s*#?(\d+)/i);
    if (!match) {
      return null;
    }

    const issueNumber = Number.parseInt(match[1], 10);
    if (Number.isNaN(issueNumber)) {
      return null;
    }

    try {
      const parent = await this.issueClient.getIssueInfo(issueNumber);
      return {
        number: parent.number,
        title: parent.title,
        state: parent.state === 'closed' ? 'closed' : 'open',
      };
    } catch (error) {
      logger.warn(
        `Failed to fetch parent issue #${issueNumber}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async fetchLatestComments(issueNumber: number): Promise<CommentInfo[]> {
    try {
      const comments = await this.issueClient.getIssueComments(issueNumber);
      if (!comments || comments.length === 0) {
        return [];
      }

      const sorted = comments
        .map((comment) => ({
          author: comment.user?.login ?? 'unknown',
          body: comment.body ?? '',
          createdAt: new Date(comment.created_at ?? new Date().toISOString()),
        }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      return sorted.slice(-10);
    } catch (error) {
      logger.warn(
        `Failed to fetch comments for issue #${issueNumber}: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  private normalizeRecommendation(value?: string): IssueRecommendation | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'close' ||
      normalized === 'keep' ||
      normalized === 'needs_discussion'
    ) {
      return normalized as IssueRecommendation;
    }
    return null;
  }

  private buildDefaultCloseComment(result: InspectionResult): string {
    return [
      'このIssueは自動検品の結果、クローズされました。',
      '',
      `推奨アクション: ${result.recommendation}`,
      `信頼度: ${result.confidence}`,
      '',
      result.reasoning || '詳細な理由は記載されていません。',
      '',
      '（auto-close-issue による自動コメント）',
    ].join('\n');
  }
}
