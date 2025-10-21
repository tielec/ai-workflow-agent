import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { CommentClient, ProgressCommentResult } from '../../../src/core/github/comment-client.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';

describe('CommentClient', () => {
  let commentClient: CommentClient;
  let mockOctokit: jest.Mocked<Octokit>;
  let mockMetadataManager: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    // Create mock Octokit instance
    mockOctokit = {
      issues: {
        createComment: jest.fn(),
        updateComment: jest.fn(),
      },
    } as unknown as jest.Mocked<Octokit>;

    // Create mock MetadataManager
    mockMetadataManager = {
      getProgressCommentId: jest.fn(),
      saveProgressCommentId: jest.fn(),
    } as unknown as jest.Mocked<MetadataManager>;

    commentClient = new CommentClient(mockOctokit, 'owner', 'repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postWorkflowProgress', () => {
    it('should post workflow progress comment successfully', async () => {
      // Given: Mock comment creation response
      const mockComment = {
        id: 123456,
        body: '## 🔄 AI Workflow - 要件定義フェーズ...',
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
        created_at: '2025-01-21T12:00:00Z',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Post workflow progress
      const result = await commentClient.postWorkflowProgress(
        24,
        'requirements',
        'in_progress',
        '要件定義書を作成中です。'
      );

      // Then: Verify Octokit was called with formatted content
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('🔄 AI Workflow - 要件定義フェーズ'),
      });

      // And: Body should include status
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('**ステータス**: IN_PROGRESS');

      // And: Body should include details
      expect(callArgs.body).toContain('要件定義書を作成中です。');

      // And: Result should match mock data
      expect(result).toEqual(mockComment);
    });

    it('should use correct emoji for each status', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post with 'completed' status
      await commentClient.postWorkflowProgress(24, 'requirements', 'completed');

      // Then: Should use checkmark emoji
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('✅');
    });

    it('should handle unknown phase gracefully', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post with unknown phase
      await commentClient.postWorkflowProgress(24, 'unknown_phase', 'in_progress');

      // Then: Should use phase name as-is
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('unknown_phase');
    });

    it('should not include details when not provided', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post without details
      await commentClient.postWorkflowProgress(24, 'requirements', 'in_progress');

      // Then: Should not include details section
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).not.toContain('要件定義書を作成中です。');
    });
  });

  describe('createOrUpdateProgressComment', () => {
    it('should create new comment when no existing ID', async () => {
      // Given: No existing comment ID
      mockMetadataManager.getProgressCommentId.mockReturnValue(null);

      const mockComment = {
        id: 123456,
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Create or update progress comment
      const result: ProgressCommentResult = await commentClient.createOrUpdateProgressComment(
        24,
        '## Phase 1: Requirements - 完了',
        mockMetadataManager
      );

      // Then: Should check for existing ID
      expect(mockMetadataManager.getProgressCommentId).toHaveBeenCalled();

      // And: Should create new comment
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: '## Phase 1: Requirements - 完了',
      });

      // And: Should save new comment ID
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenCalledWith(
        123456,
        'https://github.com/owner/repo/issues/24#issuecomment-123456'
      );

      // And: Result should match
      expect(result).toEqual({
        comment_id: 123456,
        comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      });
    });

    it('should update existing comment when ID exists', async () => {
      // Given: Existing comment ID
      mockMetadataManager.getProgressCommentId.mockReturnValue(123456);

      const mockComment = {
        id: 123456,
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      };

      mockOctokit.issues.updateComment.mockResolvedValue({ data: mockComment } as any);

      // When: Create or update progress comment
      const result = await commentClient.createOrUpdateProgressComment(
        24,
        '## Phase 2: Design - 完了',
        mockMetadataManager
      );

      // Then: Should update existing comment
      expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 123456,
        body: '## Phase 2: Design - 完了',
      });

      // And: Should save comment ID
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenCalledWith(
        123456,
        'https://github.com/owner/repo/issues/24#issuecomment-123456'
      );

      // And: Result should match
      expect(result).toEqual({
        comment_id: 123456,
        comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      });
    });

    it('should fallback to create new comment when update fails', async () => {
      // Given: Existing comment ID but update fails
      mockMetadataManager.getProgressCommentId.mockReturnValue(123456);

      const mockUpdateError = new RequestError('Not Found', 404, {
        request: {
          method: 'PATCH',
          url: 'https://api.github.com/repos/owner/repo/issues/comments/123456',
          headers: {},
        },
        response: {
          status: 404,
          url: 'https://api.github.com/repos/owner/repo/issues/comments/123456',
          headers: {},
          data: {},
        },
      });

      mockOctokit.issues.updateComment.mockRejectedValue(mockUpdateError);

      const mockNewComment = {
        id: 789012,
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-789012',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockNewComment } as any);

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // When: Create or update progress comment
      const result = await commentClient.createOrUpdateProgressComment(
        24,
        '## Phase 3: Test Scenario - 完了',
        mockMetadataManager
      );

      // Then: Should attempt to update
      expect(mockOctokit.issues.updateComment).toHaveBeenCalled();

      // And: Should log warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARNING] Failed to update progress comment')
      );

      // And: Should create new comment (fallback)
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: '## Phase 3: Test Scenario - 完了',
      });

      // And: Should save new comment ID
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenCalledWith(
        789012,
        'https://github.com/owner/repo/issues/24#issuecomment-789012'
      );

      // And: Result should match new comment
      expect(result).toEqual({
        comment_id: 789012,
        comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-789012',
      });

      consoleWarnSpy.mockRestore();
    });

    it('should throw error when create also fails', async () => {
      // Given: No existing ID and create fails
      mockMetadataManager.getProgressCommentId.mockReturnValue(null);

      const mockError = new RequestError('Unauthorized', 401, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
          headers: {},
        },
        response: {
          status: 401,
          url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
          headers: {},
          data: {},
        },
      });

      mockOctokit.issues.createComment.mockRejectedValue(mockError);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // When/Then: Should throw error
      await expect(
        commentClient.createOrUpdateProgressComment(24, 'content', mockMetadataManager)
      ).rejects.toThrow('Failed to create or update progress comment');

      // And: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Failed to create/update progress comment')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
