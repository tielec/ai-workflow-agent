import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';
import { RequestError } from '@octokit/request-error';
import { getErrorMessage } from '../../utils/error-utils.js';

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

export interface GenericResult {
  success: boolean;
  error?: string | null;
}

/**
 * PullRequestClient handles all Pull Request operations with GitHub API.
 * Responsibilities:
 * - PR creation (createPullRequest)
 * - PR search (checkExistingPr)
 * - PR update (updatePullRequest)
 * - PR closing (closePullRequest)
 * - PR number lookup (getPullRequestNumber)
 */
export class PullRequestClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly repositoryName: string;

  constructor(octokit: Octokit, owner: string, repo: string, repositoryName: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
    this.repositoryName = repositoryName;
  }

  /**
   * Creates a new pull request.
   * Returns error for 401/403 (permission issues) and 422 (existing PR).
   */
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
        error: `Unexpected error: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Checks if a pull request already exists for the given head and base branches.
   */
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
      const message = getErrorMessage(error);
      console.warn(`[WARNING] Failed to check existing PR: ${message}`);
      logger.warn(
        `Failed to check existing PR: ${this.encodeWarning(message)}`,
      );
      return null;
    }
  }

  /**
   * Updates the body of an existing pull request.
   */
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
          : getErrorMessage(error);
      logger.error(`Failed to update PR: ${this.encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  /**
   * Closes a pull request with an optional reason comment.
   */
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
      logger.info(`Closed pull request #${prNumber}`);
      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to close PR: ${this.encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  /**
   * Looks up a PR number by searching for an issue number in PR bodies.
   */
  public async getPullRequestNumber(issueNumber: number): Promise<number | null> {
    try {
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: `repo:${this.repositoryName} type:pr state:open in:body ${issueNumber}`,
        per_page: 5,
      });

      const match = data.items.find((item) => item.pull_request);
      return match?.number ?? null;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to lookup PR number: ${this.encodeWarning(message)}`);
      return null;
    }
  }

  /**
   * Marks a pull request as ready for review (converts from draft).
   *
   * Uses GitHub GraphQL API's markPullRequestReadyForReview mutation.
   * If GraphQL approach fails, falls back to `gh pr ready` command.
   *
   * @param prNumber - Pull request number
   * @returns GenericResult (success/error)
   */
  public async markPRReady(prNumber: number): Promise<GenericResult> {
    try {
      // 1. PR の node_id を取得（GraphQL mutation に必要）
      const { data: prData } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const nodeId = prData.node_id;
      if (!nodeId) {
        return {
          success: false,
          error: 'PR node_id not found',
        };
      }

      // 2. GraphQL mutation 実行
      const mutation = `
        mutation MarkPRReady($pullRequestId: ID!) {
          markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
            pullRequest {
              isDraft
            }
          }
        }
      `;

      const variables = {
        pullRequestId: nodeId,
      };

      const response = await this.octokit.graphql<{
        markPullRequestReadyForReview: {
          pullRequest: {
            isDraft: boolean;
          };
        };
      }>(mutation, variables);

      const isDraft = response.markPullRequestReadyForReview.pullRequest.isDraft;

      if (isDraft) {
        return {
          success: false,
          error: 'PR is still in draft state after mutation',
        };
      }

      logger.info(`PR #${prNumber} marked as ready for review.`);
      return { success: true, error: null };
    } catch (error) {
      // GraphQL失敗時はフォールバック（gh pr ready コマンド）
      logger.warn(`GraphQL mutation failed, attempting fallback: ${getErrorMessage(error)}`);

      try {
        // gh コマンドによるフォールバック
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        await execAsync(`gh pr ready ${prNumber}`);

        logger.info(`PR #${prNumber} marked as ready via gh command.`);
        return { success: true, error: null };
      } catch (ghError) {
        const message = getErrorMessage(ghError);
        logger.error(`Failed to mark PR as ready: ${this.encodeWarning(message)}`);
        return { success: false, error: message };
      }
    }
  }

  /**
   * Updates the base branch of a pull request.
   *
   * Uses GitHub REST API's PATCH /repos/{owner}/{repo}/pulls/{pull_number} endpoint.
   *
   * @param prNumber - Pull request number
   * @param baseBranch - Target base branch (e.g., "develop", "main")
   * @returns GenericResult (success/error)
   */
  public async updateBaseBranch(prNumber: number, baseBranch: string): Promise<GenericResult> {
    try {
      await this.octokit.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        base: baseBranch,
      });

      logger.info(`PR #${prNumber} base branch changed to '${baseBranch}'.`);
      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to update base branch: ${this.encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  /**
   * Helper method to encode warning messages for safe logging.
   */
  private encodeWarning(message: string): string {
    return Buffer.from(message, 'utf-8').toString();
  }
}
