import { GitHubClient } from '../../src/core/github-client.js';
import { IssueClient } from '../../src/core/github/issue-client.js';
import { PullRequestClient } from '../../src/core/github/pull-request-client.js';
import { CommentClient } from '../../src/core/github/comment-client.js';
import { ReviewClient } from '../../src/core/github/review-client.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';

// Mock environment variables
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_REPOSITORY = 'owner/repo';

describe('GitHubClient Facade Integration', () => {
  let githubClient: GitHubClient;

  beforeEach(() => {
    // Create GitHubClient instance
    githubClient = new GitHubClient('test-token', 'owner/repo');
  });

  describe('Client Initialization', () => {
    it('should initialize all specialized clients', () => {
      // Then: All clients should be initialized
      expect((githubClient as any).issueClient).toBeInstanceOf(IssueClient);
      expect((githubClient as any).pullRequestClient).toBeInstanceOf(PullRequestClient);
      expect((githubClient as any).commentClient).toBeInstanceOf(CommentClient);
      expect((githubClient as any).reviewClient).toBeInstanceOf(ReviewClient);
    });

    it('should share the same Octokit instance across all clients', () => {
      // Given: GitHubClient is initialized
      const octokit = (githubClient as any).octokit;

      // Then: All clients should use the same Octokit instance
      expect((githubClient as any).issueClient['octokit']).toBe(octokit);
      expect((githubClient as any).pullRequestClient['octokit']).toBe(octokit);
      expect((githubClient as any).commentClient['octokit']).toBe(octokit);
      expect((githubClient as any).reviewClient['octokit']).toBe(octokit);
    });

    it('should inject correct owner and repo to all clients', () => {
      // Then: All clients should have correct owner and repo
      expect((githubClient as any).issueClient['owner']).toBe('owner');
      expect((githubClient as any).issueClient['repo']).toBe('repo');

      expect((githubClient as any).pullRequestClient['owner']).toBe('owner');
      expect((githubClient as any).pullRequestClient['repo']).toBe('repo');

      expect((githubClient as any).commentClient['owner']).toBe('owner');
      expect((githubClient as any).commentClient['repo']).toBe('repo');

      expect((githubClient as any).reviewClient['owner']).toBe('owner');
      expect((githubClient as any).reviewClient['repo']).toBe('repo');
    });

    it('should throw error when token is not provided', () => {
      // When/Then: Should throw error when no token
      expect(() => {
        new GitHubClient(null, 'owner/repo');
      }).toThrow('GitHub token is required');
    });

    it('should throw error when repository is not provided', () => {
      // When/Then: Should throw error when no repository
      expect(() => {
        new GitHubClient('test-token', null);
      }).toThrow('Repository name is required');
    });

    it('should throw error when repository format is invalid', () => {
      // When/Then: Should throw error for invalid format
      expect(() => {
        new GitHubClient('test-token', 'invalid-format');
      }).toThrow('Invalid repository name: invalid-format');
    });
  });

  describe('Issue Operations Delegation', () => {
    it('should delegate getIssue to IssueClient', async () => {
      // Given: Mock IssueClient method
      const mockGetIssue = jest.spyOn((githubClient as any).issueClient, 'getIssue').mockResolvedValue({
        number: 24,
        title: 'Test Issue',
      });

      // When: Call GitHubClient.getIssue
      const result = await githubClient.getIssue(24);

      // Then: IssueClient.getIssue should be called
      expect(mockGetIssue).toHaveBeenCalledWith(24);

      // And: Result should match
      expect(result).toEqual({
        number: 24,
        title: 'Test Issue',
      });

      mockGetIssue.mockRestore();
    });

    it('should delegate getIssueInfo to IssueClient', async () => {
      // Given: Mock IssueClient method
      const mockGetIssueInfo = jest.spyOn((githubClient as any).issueClient, 'getIssueInfo').mockResolvedValue({
        number: 24,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        labels: [],
        url: 'https://github.com/owner/repo/issues/24',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T12:00:00Z',
      });

      // When: Call GitHubClient.getIssueInfo
      const result = await githubClient.getIssueInfo(24);

      // Then: IssueClient.getIssueInfo should be called
      expect(mockGetIssueInfo).toHaveBeenCalledWith(24);

      // And: Result should match
      expect(result.number).toBe(24);

      mockGetIssueInfo.mockRestore();
    });

    it('should delegate postComment to IssueClient', async () => {
      // Given: Mock IssueClient method
      const mockPostComment = jest.spyOn((githubClient as any).issueClient, 'postComment').mockResolvedValue({
        id: 123456,
        body: 'Test comment',
      });

      // When: Call GitHubClient.postComment
      const result = await githubClient.postComment(24, 'Test comment');

      // Then: IssueClient.postComment should be called
      expect(mockPostComment).toHaveBeenCalledWith(24, 'Test comment');

      // And: Result should match
      expect(result.id).toBe(123456);

      mockPostComment.mockRestore();
    });

    it('should delegate closeIssueWithReason to IssueClient', async () => {
      // Given: Mock IssueClient method
      const mockCloseIssue = jest.spyOn((githubClient as any).issueClient, 'closeIssueWithReason').mockResolvedValue({
        success: true,
        error: null,
      });

      // When: Call GitHubClient.closeIssueWithReason
      const result = await githubClient.closeIssueWithReason(24, 'Complete');

      // Then: IssueClient.closeIssueWithReason should be called
      expect(mockCloseIssue).toHaveBeenCalledWith(24, 'Complete');

      // And: Result should match
      expect(result.success).toBe(true);

      mockCloseIssue.mockRestore();
    });
  });

  describe('Pull Request Operations Delegation', () => {
    it('should delegate createPullRequest to PullRequestClient', async () => {
      // Given: Mock PullRequestClient method
      const mockCreatePr = jest.spyOn((githubClient as any).pullRequestClient, 'createPullRequest').mockResolvedValue({
        success: true,
        pr_url: 'https://github.com/owner/repo/pull/10',
        pr_number: 10,
        error: null,
      });

      // When: Call GitHubClient.createPullRequest
      const result = await githubClient.createPullRequest('title', 'body', 'feature/test', 'main', true);

      // Then: PullRequestClient.createPullRequest should be called
      expect(mockCreatePr).toHaveBeenCalledWith('title', 'body', 'feature/test', 'main', true);

      // And: Result should match
      expect(result.success).toBe(true);
      expect(result.pr_number).toBe(10);

      mockCreatePr.mockRestore();
    });

    it('should delegate checkExistingPr to PullRequestClient', async () => {
      // Given: Mock PullRequestClient method
      const mockCheckPr = jest.spyOn((githubClient as any).pullRequestClient, 'checkExistingPr').mockResolvedValue({
        pr_number: 10,
        pr_url: 'https://github.com/owner/repo/pull/10',
        state: 'open',
      });

      // When: Call GitHubClient.checkExistingPr
      const result = await githubClient.checkExistingPr('feature/test', 'main');

      // Then: PullRequestClient.checkExistingPr should be called
      expect(mockCheckPr).toHaveBeenCalledWith('feature/test', 'main');

      // And: Result should match
      expect(result?.pr_number).toBe(10);

      mockCheckPr.mockRestore();
    });

    it('should delegate updatePullRequest to PullRequestClient', async () => {
      // Given: Mock PullRequestClient method
      const mockUpdatePr = jest.spyOn((githubClient as any).pullRequestClient, 'updatePullRequest').mockResolvedValue({
        success: true,
        error: null,
      });

      // When: Call GitHubClient.updatePullRequest
      const result = await githubClient.updatePullRequest(10, 'updated body');

      // Then: PullRequestClient.updatePullRequest should be called
      expect(mockUpdatePr).toHaveBeenCalledWith(10, 'updated body');

      // And: Result should match
      expect(result.success).toBe(true);

      mockUpdatePr.mockRestore();
    });

    it('should delegate closePullRequest to PullRequestClient', async () => {
      // Given: Mock PullRequestClient method
      const mockClosePr = jest.spyOn((githubClient as any).pullRequestClient, 'closePullRequest').mockResolvedValue({
        success: true,
        error: null,
      });

      // When: Call GitHubClient.closePullRequest
      const result = await githubClient.closePullRequest(10, 'reason');

      // Then: PullRequestClient.closePullRequest should be called
      expect(mockClosePr).toHaveBeenCalledWith(10, 'reason');

      // And: Result should match
      expect(result.success).toBe(true);

      mockClosePr.mockRestore();
    });
  });

  describe('Comment Operations Delegation', () => {
    it('should delegate postWorkflowProgress to CommentClient', async () => {
      // Given: Mock CommentClient method
      const mockPostProgress = jest.spyOn((githubClient as any).commentClient, 'postWorkflowProgress').mockResolvedValue({
        id: 123456,
      });

      // When: Call GitHubClient.postWorkflowProgress
      const result = await githubClient.postWorkflowProgress(24, 'requirements', 'in_progress', 'details');

      // Then: CommentClient.postWorkflowProgress should be called
      expect(mockPostProgress).toHaveBeenCalledWith(24, 'requirements', 'in_progress', 'details');

      // And: Result should match
      expect(result.id).toBe(123456);

      mockPostProgress.mockRestore();
    });

    it('should delegate createOrUpdateProgressComment to CommentClient', async () => {
      // Given: Mock CommentClient method and MetadataManager
      const mockMetadataManager = {} as MetadataManager;
      const mockCreateOrUpdate = jest.spyOn((githubClient as any).commentClient, 'createOrUpdateProgressComment').mockResolvedValue({
        comment_id: 123456,
        comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      });

      // When: Call GitHubClient.createOrUpdateProgressComment
      const result = await githubClient.createOrUpdateProgressComment(24, 'content', mockMetadataManager);

      // Then: CommentClient.createOrUpdateProgressComment should be called
      expect(mockCreateOrUpdate).toHaveBeenCalledWith(24, 'content', mockMetadataManager);

      // And: Result should match
      expect(result.comment_id).toBe(123456);

      mockCreateOrUpdate.mockRestore();
    });
  });

  describe('Review Operations Delegation', () => {
    it('should delegate postReviewResult to ReviewClient', async () => {
      // Given: Mock ReviewClient method
      const mockPostReview = jest.spyOn((githubClient as any).reviewClient, 'postReviewResult').mockResolvedValue({
        id: 123456,
      });

      // When: Call GitHubClient.postReviewResult
      const result = await githubClient.postReviewResult(24, 'requirements', 'PASS', 'feedback', ['suggestion']);

      // Then: ReviewClient.postReviewResult should be called
      expect(mockPostReview).toHaveBeenCalledWith(24, 'requirements', 'PASS', 'feedback', ['suggestion']);

      // And: Result should match
      expect(result.id).toBe(123456);

      mockPostReview.mockRestore();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain all existing public method signatures', () => {
      // Then: All public methods should exist
      expect(typeof githubClient.getIssue).toBe('function');
      expect(typeof githubClient.getIssueInfo).toBe('function');
      expect(typeof githubClient.getIssueComments).toBe('function');
      expect(typeof githubClient.getIssueCommentsDict).toBe('function');
      expect(typeof githubClient.postComment).toBe('function');
      expect(typeof githubClient.closeIssueWithReason).toBe('function');
      expect(typeof githubClient.createIssueFromEvaluation).toBe('function');

      expect(typeof githubClient.createPullRequest).toBe('function');
      expect(typeof githubClient.checkExistingPr).toBe('function');
      expect(typeof githubClient.updatePullRequest).toBe('function');
      expect(typeof githubClient.closePullRequest).toBe('function');
      expect(typeof githubClient.getPullRequestNumber).toBe('function');

      expect(typeof githubClient.postWorkflowProgress).toBe('function');
      expect(typeof githubClient.createOrUpdateProgressComment).toBe('function');

      expect(typeof githubClient.postReviewResult).toBe('function');

      expect(typeof githubClient.generatePrBodyTemplate).toBe('function');
      expect(typeof githubClient.generatePrBodyDetailed).toBe('function');
      expect(typeof githubClient.extractPhaseOutputs).toBe('function');
      expect(typeof githubClient.close).toBe('function');
    });
  });

  describe('Document Extraction Utilities', () => {
    it('should keep document extraction methods in GitHubClient', () => {
      // Then: Document extraction methods should exist
      expect(typeof githubClient.generatePrBodyTemplate).toBe('function');
      expect(typeof githubClient.generatePrBodyDetailed).toBe('function');
      expect(typeof githubClient.extractPhaseOutputs).toBe('function');
    });
  });
});
