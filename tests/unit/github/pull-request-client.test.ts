import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { RequestError } from '@octokit/request-error';
import {
  PullRequestClient,
  PullRequestSummary,
  PullRequestResult,
  GenericResult,
} from '../../../src/core/github/pull-request-client.js';
import { createMockOctokit } from '../../helpers/mock-octokit.js';

describe('PullRequestClient', () => {
  let pullRequestClient: PullRequestClient;
  let mockOctokit: ReturnType<typeof createMockOctokit>;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    pullRequestClient = new PullRequestClient(
      mockOctokit.client,
      'owner',
      'repo',
      'owner/repo',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPullRequest', () => {
    it('should create a pull request successfully', async () => {
      // Given: Mock PR creation response
      const mockPr = {
        number: 10,
        html_url: 'https://github.com/owner/repo/pull/10',
        state: 'open',
        draft: true,
      };

      mockOctokit.pulls.create.mockResolvedValue({ data: mockPr } as any);

      // When: Create a PR
      const result: PullRequestResult = await pullRequestClient.createPullRequest(
        'feat: GitHub Client の機能別分割',
        '## Summary\n...',
        'feature/issue-24-github-client-refactor',
        'main',
        true
      );

      // Then: Verify Octokit was called with correct parameters
      expect(mockOctokit.pulls.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: 'feat: GitHub Client の機能別分割',
        body: '## Summary\n...',
        head: 'feature/issue-24-github-client-refactor',
        base: 'main',
        draft: true,
      });

      // And: Result should indicate success
      expect(result).toEqual({
        success: true,
        pr_url: 'https://github.com/owner/repo/pull/10',
        pr_number: 10,
        error: null,
      });
    });

    it('should handle 422 error (existing PR)', async () => {
      // Given: Mock 422 error
      const mockError = new RequestError('Validation Failed', 422, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
        },
        response: {
          status: 422,
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
          data: {},
        },
      });

      mockOctokit.pulls.create.mockRejectedValue(mockError);

      // When: Attempt to create PR
      const result = await pullRequestClient.createPullRequest(
        'title',
        'body',
        'feature/test',
        'main',
        true
      );

      // Then: Should return appropriate error message
      expect(result).toEqual({
        success: false,
        pr_url: null,
        pr_number: null,
        error: 'A pull request already exists for this branch.',
      });
    });

    it('should handle 401 error (unauthorized)', async () => {
      // Given: Mock 401 error
      const mockError = new RequestError('Unauthorized', 401, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
        },
        response: {
          status: 401,
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
          data: {},
        },
      });

      mockOctokit.pulls.create.mockRejectedValue(mockError);

      // When: Attempt to create PR
      const result = await pullRequestClient.createPullRequest(
        'title',
        'body',
        'feature/test'
      );

      // Then: Should return token scope error
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub Token lacks required scope');
    });

    it('should handle 403 error (forbidden)', async () => {
      // Given: Mock 403 error
      const mockError = new RequestError('Forbidden', 403, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
        },
        response: {
          status: 403,
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
          data: {},
        },
      });

      mockOctokit.pulls.create.mockRejectedValue(mockError);

      // When: Attempt to create PR
      const result = await pullRequestClient.createPullRequest(
        'title',
        'body',
        'feature/test'
      );

      // Then: Should return token scope error
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub Token lacks required scope');
    });

    it('should handle other RequestError appropriately', async () => {
      // Given: Mock 500 error
      const mockError = new RequestError('Internal Server Error', 500, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
        },
        response: {
          status: 500,
          url: 'https://api.github.com/repos/owner/repo/pulls',
          headers: {},
          data: {},
        },
      });

      mockOctokit.pulls.create.mockRejectedValue(mockError);

      // When: Attempt to create PR
      const result = await pullRequestClient.createPullRequest(
        'title',
        'body',
        'feature/test'
      );

      // Then: Should return formatted error message
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error: 500');
    });

    it('should handle non-RequestError', async () => {
      // Given: Mock generic error
      const mockError = new Error('Network error');
      mockOctokit.pulls.create.mockRejectedValue(mockError);

      // When: Attempt to create PR
      const result = await pullRequestClient.createPullRequest(
        'title',
        'body',
        'feature/test'
      );

      // Then: Should return unexpected error message
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error: Network error');
    });
  });

  describe('checkExistingPr', () => {
    it('should find an existing PR', async () => {
      // Given: Mock PR list response
      const mockPrList = [
        {
          number: 10,
          html_url: 'https://github.com/owner/repo/pull/10',
          state: 'open',
        },
      ];

      mockOctokit.pulls.list.mockResolvedValue({ data: mockPrList } as any);

      // When: Check for existing PR
      const result: PullRequestSummary | null = await pullRequestClient.checkExistingPr(
        'feature/issue-24-github-client-refactor',
        'main'
      );

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        head: 'owner:feature/issue-24-github-client-refactor',
        base: 'main',
        state: 'open',
        per_page: 1,
      });

      // And: Should return PR summary
      expect(result).toEqual({
        pr_number: 10,
        pr_url: 'https://github.com/owner/repo/pull/10',
        state: 'open',
      });
    });

    it('should return null when no PR exists', async () => {
      // Given: Empty PR list
      mockOctokit.pulls.list.mockResolvedValue({ data: [] } as any);

      // When: Check for existing PR
      const result = await pullRequestClient.checkExistingPr('feature/new-branch', 'main');

      // Then: Should return null
      expect(result).toBeNull();
    });

    it('should handle errors gracefully with warning', async () => {
      // Given: Mock error
      const mockError = new Error('API error');
      mockOctokit.pulls.list.mockRejectedValue(mockError);

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      // When: Check for existing PR
      const result = await pullRequestClient.checkExistingPr('feature/test', 'main');

      // Then: Should return null
      expect(result).toBeNull();

      // And: Warning should be logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARNING] Failed to check existing PR')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('updatePullRequest', () => {
    it('should update PR body successfully', async () => {
      // Given: Mock successful update
      mockOctokit.pulls.update.mockResolvedValue({ data: {} } as any);

      // When: Update PR body
      const result: GenericResult = await pullRequestClient.updatePullRequest(
        10,
        '## Summary\n更新された本文'
      );

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 10,
        body: '## Summary\n更新された本文',
      });

      // And: Should indicate success
      expect(result).toEqual({ success: true, error: null });
    });

    it('should handle RequestError appropriately', async () => {
      // Given: Mock RequestError
      const mockError = new RequestError('Not Found', 404, {
        request: {
          method: 'PATCH',
          url: 'https://api.github.com/repos/owner/repo/pulls/10',
          headers: {},
        },
        response: {
          status: 404,
          url: 'https://api.github.com/repos/owner/repo/pulls/10',
          headers: {},
          data: {},
        },
      });

      mockOctokit.pulls.update.mockRejectedValue(mockError);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      // When: Attempt to update PR
      const result = await pullRequestClient.updatePullRequest(10, 'new body');

      // Then: Should return error
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error: 404');

      // And: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('closePullRequest', () => {
    it('should close PR with reason comment', async () => {
      // Given: Mock successful operations
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);
      mockOctokit.pulls.update.mockResolvedValue({ data: {} } as any);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

      // When: Close PR with reason
      const result: GenericResult = await pullRequestClient.closePullRequest(
        10,
        '別のアプローチで実装します。'
      );

      // Then: Comment should be posted
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 10,
        body: expect.stringContaining('別のアプローチで実装します。'),
      });

      // And: PR should be closed
      expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 10,
        state: 'closed',
      });

      // And: Should indicate success
      expect(result).toEqual({ success: true, error: null });

      // And: Info log should be written
      expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO] Closed pull request #10');

      consoleInfoSpy.mockRestore();
    });

    it('should close PR without reason comment', async () => {
      // Given: Mock successful update
      mockOctokit.pulls.update.mockResolvedValue({ data: {} } as any);

      // When: Close PR without reason
      const result = await pullRequestClient.closePullRequest(10);

      // Then: Comment should NOT be posted
      expect(mockOctokit.issues.createComment).not.toHaveBeenCalled();

      // And: PR should be closed
      expect(mockOctokit.pulls.update).toHaveBeenCalled();

      // And: Should indicate success
      expect(result).toEqual({ success: true, error: null });
    });

    it('should handle errors appropriately', async () => {
      // Given: Mock error
      const mockError = new Error('Network error');
      mockOctokit.pulls.update.mockRejectedValue(mockError);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      // When: Attempt to close PR
      const result = await pullRequestClient.closePullRequest(10);

      // Then: Should return error
      expect(result.success).toBe(false);

      // And: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getPullRequestNumber', () => {
    it('should find PR number by issue number', async () => {
      // Given: Mock search response
      const mockSearchResult = {
        items: [
          {
            number: 10,
            pull_request: {},
          },
        ],
      };

      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({ data: mockSearchResult } as any);

      // When: Search for PR by issue number
      const result: number | null = await pullRequestClient.getPullRequestNumber(24);

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'repo:owner/repo type:pr state:open in:body 24',
        per_page: 5,
      });

      // And: Should return PR number
      expect(result).toBe(10);
    });

    it('should return null when no PR found', async () => {
      // Given: Empty search result
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({ data: { items: [] } } as any);

      // When: Search for PR
      const result = await pullRequestClient.getPullRequestNumber(99);

      // Then: Should return null
      expect(result).toBeNull();
    });

    it('should handle errors gracefully with warning', async () => {
      // Given: Mock error
      const mockError = new Error('Search failed');
      mockOctokit.search.issuesAndPullRequests.mockRejectedValue(mockError);

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      // When: Attempt to search
      const result = await pullRequestClient.getPullRequestNumber(24);

      // Then: Should return null
      expect(result).toBeNull();

      // And: Warning should be logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to lookup PR number')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
