import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { IssueClient, IssueInfo, CommentDict, IssueCreationResult, GenericResult } from '../../../src/core/github/issue-client.js';
import { RemainingTask } from '../../../src/types.js';

describe('IssueClient', () => {
  let issueClient: IssueClient;
  let mockOctokit: jest.Mocked<Octokit>;

  beforeEach(() => {
    // Create mock Octokit instance
    mockOctokit = {
      issues: {
        get: jest.fn(),
        listComments: jest.fn(),
        createComment: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<Octokit>;

    issueClient = new IssueClient(mockOctokit, 'owner', 'repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getIssue', () => {
    it('should retrieve issue details successfully', async () => {
      // Given: Mock issue response
      const mockIssue = {
        number: 24,
        title: '[REFACTOR] GitHub Client の機能別分割',
        body: '## 概要\n...',
        state: 'open',
        labels: [],
        html_url: 'https://github.com/owner/repo/issues/24',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T12:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: mockIssue } as any);

      // When: Call getIssue
      const result = await issueClient.getIssue(24);

      // Then: Verify Octokit was called with correct parameters
      expect(mockOctokit.issues.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
      });

      // And: Verify result matches mock data
      expect(result).toEqual(mockIssue);
    });
  });

  describe('getIssueInfo', () => {
    it('should retrieve simplified issue information', async () => {
      // Given: Mock issue response
      const mockIssue = {
        number: 24,
        title: '[REFACTOR] GitHub Client の機能別分割',
        body: '## 概要\n...',
        state: 'open',
        labels: [],
        html_url: 'https://github.com/owner/repo/issues/24',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T12:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: mockIssue } as any);

      // When: Call getIssueInfo
      const result: IssueInfo = await issueClient.getIssueInfo(24);

      // Then: Verify result has IssueInfo structure
      expect(result).toEqual({
        number: 24,
        title: '[REFACTOR] GitHub Client の機能別分割',
        body: '## 概要\n...',
        state: 'open',
        labels: [],
        url: 'https://github.com/owner/repo/issues/24',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T12:00:00Z',
      });
    });

    it('should handle labels as objects', async () => {
      // Given: Mock issue with label objects
      const mockIssue = {
        number: 24,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
        html_url: 'https://github.com/owner/repo/issues/24',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T12:00:00Z',
      };

      mockOctokit.issues.get.mockResolvedValue({ data: mockIssue } as any);

      // When: Call getIssueInfo
      const result = await issueClient.getIssueInfo(24);

      // Then: Labels should be extracted as strings
      expect(result.labels).toEqual(['bug', 'enhancement']);
    });
  });

  describe('getIssueComments', () => {
    it('should retrieve all comments for an issue', async () => {
      // Given: Mock comments response
      const mockComments = [
        {
          id: 123456,
          body: '## Phase 1: Requirements - 完了',
          user: { login: 'ai-workflow-agent' },
          html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
          created_at: '2025-01-21T12:00:00Z',
          updated_at: '2025-01-21T12:00:00Z',
        },
      ];

      mockOctokit.issues.listComments.mockResolvedValue({ data: mockComments } as any);

      // When: Call getIssueComments
      const result = await issueClient.getIssueComments(24);

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.issues.listComments).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
      });

      // And: Result matches mock data
      expect(result).toEqual(mockComments);
    });
  });

  describe('getIssueCommentsDict', () => {
    it('should retrieve comments in dictionary format', async () => {
      // Given: Mock comments response
      const mockComments = [
        {
          id: 123456,
          body: 'Comment body',
          user: { login: 'ai-workflow-agent' },
          created_at: '2025-01-21T12:00:00Z',
          updated_at: '2025-01-21T12:00:00Z',
        },
      ];

      mockOctokit.issues.listComments.mockResolvedValue({ data: mockComments } as any);

      // When: Call getIssueCommentsDict
      const result: CommentDict[] = await issueClient.getIssueCommentsDict(24);

      // Then: Result should be in dictionary format
      expect(result).toEqual([
        {
          id: 123456,
          user: 'ai-workflow-agent',
          body: 'Comment body',
          created_at: '2025-01-21T12:00:00Z',
          updated_at: '2025-01-21T12:00:00Z',
        },
      ]);
    });

    it('should handle missing user gracefully', async () => {
      // Given: Comment without user
      const mockComments = [
        {
          id: 123456,
          body: 'Comment body',
          user: null,
          created_at: '2025-01-21T12:00:00Z',
          updated_at: '2025-01-21T12:00:00Z',
        },
      ];

      mockOctokit.issues.listComments.mockResolvedValue({ data: mockComments } as any);

      // When: Call getIssueCommentsDict
      const result = await issueClient.getIssueCommentsDict(24);

      // Then: User should default to 'unknown'
      expect(result[0].user).toBe('unknown');
    });
  });

  describe('postComment', () => {
    it('should post a comment successfully', async () => {
      // Given: Mock comment creation response
      const mockComment = {
        id: 123456,
        body: '## Phase 1: Requirements - 開始',
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
        created_at: '2025-01-21T12:00:00Z',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Post a comment
      const result = await issueClient.postComment(24, '## Phase 1: Requirements - 開始');

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: '## Phase 1: Requirements - 開始',
      });

      // And: Result matches mock data
      expect(result).toEqual(mockComment);
    });
  });

  describe('closeIssueWithReason', () => {
    it('should close issue with reason comment successfully', async () => {
      // Given: Mock successful comment and update
      const mockComment = { id: 123456 };
      const mockUpdate = { data: { state: 'closed' } };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);
      mockOctokit.issues.update.mockResolvedValue(mockUpdate as any);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // When: Close issue with reason
      const result: GenericResult = await issueClient.closeIssueWithReason(24, '実装完了');

      // Then: Comment should be posted
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('## ⚠️ ワークフロー中止'),
      });

      // And: Issue should be closed
      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        state: 'closed',
      });

      // And: Result should indicate success
      expect(result).toEqual({ success: true, error: null });

      // And: Info log should be written
      expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO] Closed issue #24');

      consoleInfoSpy.mockRestore();
    });

    it('should handle RequestError appropriately', async () => {
      // Given: Mock RequestError
      const mockError = new RequestError('Forbidden', 403, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
          headers: {},
        },
        response: {
          status: 403,
          url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
          headers: {},
          data: {},
        },
      });

      mockOctokit.issues.createComment.mockRejectedValue(mockError);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // When: Attempt to close issue
      const result = await issueClient.closeIssueWithReason(24, 'reason');

      // Then: Result should indicate failure
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error: 403');

      // And: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('createIssueFromEvaluation', () => {
    it('should create follow-up issue successfully', async () => {
      // Given: Remaining tasks and mock response
      const remainingTasks: RemainingTask[] = [
        { task: 'ドキュメント更新', phase: 'documentation', priority: '中' },
        { task: 'テスト追加', phase: 'testing', priority: '高' },
      ];

      const mockIssue = {
        number: 25,
        html_url: 'https://github.com/owner/repo/issues/25',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      // When: Create issue from evaluation
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        24,
        remainingTasks,
        '.ai-workflow/issue-24/08_evaluation/output/evaluation.md'
      );

      // Then: Octokit should be called with correct parameters
      expect(mockOctokit.issues.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: '[FOLLOW-UP] Issue #24 - 残タスク',
        body: expect.stringContaining('ドキュメント更新'),
        labels: ['enhancement', 'ai-workflow-follow-up'],
      });

      // And: Result should indicate success
      expect(result).toEqual({
        success: true,
        issue_url: 'https://github.com/owner/repo/issues/25',
        issue_number: 25,
        error: null,
      });
    });

    it('should handle empty remaining tasks', async () => {
      // Given: Empty tasks array
      const remainingTasks: RemainingTask[] = [];

      const mockIssue = {
        number: 25,
        html_url: 'https://github.com/owner/repo/issues/25',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      // When: Create issue with empty tasks
      const result = await issueClient.createIssueFromEvaluation(24, remainingTasks, 'eval.md');

      // Then: Should still create issue successfully
      expect(result.success).toBe(true);
      expect(mockOctokit.issues.create).toHaveBeenCalled();
    });

    it('should handle RequestError appropriately', async () => {
      // Given: Mock RequestError
      const mockError = new RequestError('Validation Failed', 422, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/issues',
          headers: {},
        },
        response: {
          status: 422,
          url: 'https://api.github.com/repos/owner/repo/issues',
          headers: {},
          data: {},
        },
      });

      mockOctokit.issues.create.mockRejectedValue(mockError);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // When: Attempt to create issue
      const result = await issueClient.createIssueFromEvaluation(24, [], 'eval.md');

      // Then: Result should indicate failure
      expect(result).toEqual({
        success: false,
        issue_url: null,
        issue_number: null,
        error: expect.stringContaining('GitHub API error: 422'),
      });

      // And: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
