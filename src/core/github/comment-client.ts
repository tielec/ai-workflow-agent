import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';
import { RequestError } from '@octokit/request-error';
import { getErrorMessage } from '../../utils/error-utils.js';
import { MetadataManager } from '../metadata-manager.js';

export interface ProgressCommentResult {
  comment_id: number;
  comment_url: string | null;
}

export interface PRReviewComment {
  id: number;
  node_id: string;
  path: string;
  line: number | null;
  start_line: number | null;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  diff_hunk: string;
  in_reply_to_id?: number;
}

export interface UnresolvedThread {
  id: string;
  isResolved: boolean;
  comments: {
    nodes: Array<{
      id: string;
      databaseId: number;
      body: string;
      path: string;
      line: number | null;
      startLine: number | null;
      author: {
        login: string;
      };
      createdAt: string;
      updatedAt: string;
    }>;
  };
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
              : getErrorMessage(error);
          logger.warn(`Failed to update progress comment: ${this.encodeWarning(message)}`);
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
          : getErrorMessage(error);
      logger.error(`Failed to create/update progress comment: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to create or update progress comment: ${message}`);
    }
  }

  /**
   * PRのレビューコメントを取得（REST API）
   */
  public async getPRReviewComments(prNumber: number, perPage = 100): Promise<PRReviewComment[]> {
    try {
      const comments: PRReviewComment[] = [];
      let page = 1;

      while (true) {
        const { data } = await this.octokit.pulls.listReviewComments({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          per_page: perPage,
          page,
        });

        if (data.length === 0) {
          break;
        }

        comments.push(
          ...data.map((c) => ({
            id: c.id,
            node_id: c.node_id,
            path: c.path,
            line: c.line ?? null,
            start_line: c.start_line ?? null,
            body: c.body ?? '',
            user: { login: c.user?.login ?? 'unknown' },
            created_at: c.created_at ?? '',
            updated_at: c.updated_at ?? '',
            diff_hunk: c.diff_hunk ?? '',
            in_reply_to_id: c.in_reply_to_id ?? undefined,
          })),
        );

        if (data.length < perPage) {
          break;
        }

        page += 1;
      }

      return comments;
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to get PR review comments: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to get PR review comments: ${message}`);
    }
  }

  /**
   * 未解決のPRレビューコメントを取得（GraphQL API）
   */
  public async getUnresolvedPRReviewComments(prNumber: number): Promise<UnresolvedThread[]> {
    try {
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 100) {
                    nodes {
                      id
                      databaseId
                      body
                      path
                      line
                      startLine
                      author { login }
                      createdAt
                      updatedAt
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.octokit.graphql<{
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: UnresolvedThread[];
            };
          };
        };
      }>(query, {
        owner: this.owner,
        repo: this.repo,
        prNumber,
      });

      return response.repository.pullRequest.reviewThreads.nodes.filter((thread) => !thread.isResolved);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to get unresolved comments: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to get unresolved comments: ${message}`);
    }
  }

  /**
   * レビューコメントに返信を投稿（REST API）
   */
  public async replyToPRReviewComment(
    prNumber: number,
    commentId: number,
    body: string,
  ): Promise<{ id: number; html_url: string }> {
    try {
      const { data } = await this.octokit.pulls.createReplyForReviewComment({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        comment_id: commentId,
        body,
      });

      return {
        id: data.id ?? 0,
        html_url: data.html_url ?? '',
      };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to reply to comment: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to reply to comment: ${message}`);
    }
  }

  /**
   * レビュースレッドを解決済みにマーク（GraphQL mutation）
   */
  public async resolveReviewThread(threadId: string): Promise<boolean> {
    try {
      const mutation = `
        mutation($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread { isResolved }
          }
        }
      `;

      const response = await this.octokit.graphql<{
        resolveReviewThread: { thread: { isResolved: boolean } };
      }>(mutation, { threadId });

      return response.resolveReviewThread.thread.isResolved;
    } catch (error) {
      logger.warn(`GraphQL mutation failed, attempting fallback: ${getErrorMessage(error)}`);

      try {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        await execAsync(
          `gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "${threadId}" }) { thread { isResolved } } }'`,
        );

        return true;
      } catch (ghError) {
        const message = getErrorMessage(ghError);
        logger.error(`Failed to resolve thread: ${this.encodeWarning(message)}`);
        throw new Error(`Failed to resolve thread: ${message}`);
      }
    }
  }

  /**
   * Helper method to encode warning messages for safe logging.
   */
  private encodeWarning(message: string): string {
    return Buffer.from(message, 'utf-8').toString();
  }
}
