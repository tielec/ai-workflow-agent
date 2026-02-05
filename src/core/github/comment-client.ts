import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';
import { RequestError } from '@octokit/request-error';
import { getErrorMessage } from '../../utils/error-utils.js';
import { fixMojibake, isMojibake } from '../../utils/encoding-utils.js';
import { MetadataManager } from '../metadata-manager.js';
import { SupportedLanguage } from '../../types.js';

/**
 * 言語別テキストマッピング（Issue #587）
 */
const WORKFLOW_PROGRESS_TEXT: Record<
  SupportedLanguage,
  {
    workflow: string;
    phase: string;
    status: string;
    footer: string;
    phaseNames: Record<string, string>;
  }
> = {
  ja: {
    workflow: 'AI Workflow',
    phase: 'フェーズ',
    status: 'ステータス',
    footer: 'AI駆動開発自動化ワークフロー',
    phaseNames: {
      planning: '企画',
      requirements: '要件定義',
      design: '設計',
      test_scenario: 'テストシナリオ',
      implementation: '実装',
      testing: 'テスト',
      documentation: 'ドキュメント',
    },
  },
  en: {
    workflow: 'AI Workflow',
    phase: 'Phase',
    status: 'Status',
    footer: 'AI-driven development automation workflow',
    phaseNames: {
      planning: 'Planning',
      requirements: 'Requirements',
      design: 'Design',
      test_scenario: 'Test Scenario',
      implementation: 'Implementation',
      testing: 'Testing',
      documentation: 'Documentation',
    },
  },
};

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
    metadata: MetadataManager,
    details?: string,
  ) {
    const statusEmoji: Record<string, string> = {
      pending: '⏸️',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
    };

    // 言語取得（Issue #587）
    const language = metadata.getLanguage() || 'ja';
    const text = WORKFLOW_PROGRESS_TEXT[language];

    const emoji = statusEmoji[status] ?? '📝';
    const phaseLabel = text.phaseNames[phase] ?? phase;

    let body = `## ${emoji} ${text.workflow} - ${phaseLabel}${text.phase}\n\n`;
    body += `**${text.status}**: ${status.toUpperCase()}\n\n`;

    if (details) {
      body += `${details}\n\n`;
    }

    body += '---\n';
    body += `*${text.footer}*`;

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
   * Pending reviewのコメントを取得（REST API）
   *
   * 注意: GitHub APIの制限により、**認証済みユーザー自身のPending reviewのみ**取得可能。
   * 他のユーザーのPending reviewは取得できません（セキュリティ上の理由）。
   */
  public async getPendingReviewComments(prNumber: number): Promise<PRReviewComment[]> {
    try {
      // Step 1: Pending reviewsを取得
      const { data: reviews } = await this.octokit.pulls.listReviews({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const pendingReviews = reviews.filter((r) => r.state === 'PENDING');
      logger.debug(`Found ${pendingReviews.length} pending review(s)`);

      if (pendingReviews.length === 0) {
        return [];
      }

      // Step 2: 各Pending reviewのコメントを取得
      const allComments: PRReviewComment[] = [];

      for (const review of pendingReviews) {
        logger.debug(`Fetching comments for pending review #${review.id} by ${review.user?.login ?? 'unknown'}`);
        const { data: comments } = await this.octokit.pulls.listCommentsForReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          review_id: review.id,
        });

        logger.debug(`  Found ${comments.length} comment(s) in pending review #${review.id}`);

        allComments.push(
          ...comments.map((c) => ({
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
      }

      logger.info(`Total pending review comments: ${allComments.length}`);
      return allComments;
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.warn(`Failed to get pending review comments: ${this.encodeWarning(message)}`);
      // Pending review取得失敗は致命的エラーではないため、空配列を返す
      return [];
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
      const sanitizedBody = this.sanitizeBody(body);
      const { data } = await this.octokit.pulls.createReplyForReviewComment({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        comment_id: commentId,
        body: sanitizedBody,
      });

      return {
        id: data.id ?? 0,
        html_url: data.html_url ?? '',
      };
    } catch (error) {
      // 422エラー（pending review制限）の場合、通常のissue commentにフォールバック
      if (error instanceof RequestError && error.status === 422) {
        logger.warn(`Failed to create review comment reply (422), falling back to issue comment`);
        return this.createIssueComment(prNumber, this.sanitizeBody(body));
      }

      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to reply to comment: ${this.encodeWarning(message)}`);
      throw new Error(`Failed to reply to comment: ${message}`);
    }
  }

  /**
   * 通常のissue commentを作成（PR commentへの返信のフォールバック用）
   */
  private async createIssueComment(
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; html_url: string }> {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });

    return {
      id: data.id ?? 0,
      html_url: data.html_url ?? '',
    };
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

  private sanitizeBody(body: string): string {
    if (isMojibake(body)) {
      logger.warn('Detected mojibake in comment body, attempting to fix');
      return fixMojibake(body);
    }
    return body;
  }
}
