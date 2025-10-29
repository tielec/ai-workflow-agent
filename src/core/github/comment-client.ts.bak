import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { MetadataManager } from '../metadata-manager.js';

export interface ProgressCommentResult {
  comment_id: number;
  comment_url: string | null;
}

/**
 * CommentClient handles comment-related operations with GitHub API.
 * Responsibilities:
 * - Workflow progress comment posting (postWorkflowProgress)
 * - Progress comment creation/update (createOrUpdateProgressComment)
 */
export class CommentClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Posts a formatted workflow progress comment to an issue.
   */
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

    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });

    return data;
  }

  /**
   * Creates or updates a progress comment on an issue.
   * Uses MetadataManager to track the comment ID and update existing comments.
   * Falls back to creating a new comment if update fails.
   */
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
          console.warn(`[WARNING] Failed to update progress comment: ${this.encodeWarning(message)}`);
          // Fall through to create a new comment
        }
      }

      // Create new comment (either no existing ID or update failed)
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
      console.error(`[ERROR] Failed to create/update progress comment: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to create or update progress comment: ${message}`);
    }
  }

  /**
   * Helper method to encode warning messages for safe logging.
   */
  private encodeWarning(message: string): string {
    return Buffer.from(message, 'utf-8').toString();
  }
}
