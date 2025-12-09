import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { RequestError } from '@octokit/request-error';
import { CommentClient, ProgressCommentResult } from '../../../src/core/github/comment-client.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { createMockOctokit } from '../../helpers/mock-octokit.js';

type SyncMock<TReturn = any, TArgs extends any[] = any[]> = jest.Mock<
  (...args: TArgs) => TReturn
>;

type MockMetadataManager = {
  getProgressCommentId: SyncMock<number | null, []>;
  saveProgressCommentId: SyncMock<void, [number, string]>;
};

describe('CommentClient', () => {
  let commentClient: CommentClient;
  let mockOctokit: ReturnType<typeof createMockOctokit>;
  let mockMetadataManager: MockMetadataManager;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    mockMetadataManager = {
      getProgressCommentId: jest.fn<() => number | null>(),
      saveProgressCommentId: jest.fn<(id: number, url: string) => void>(),
    };

    commentClient = new CommentClient(mockOctokit.client, 'owner', 'repo');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('postWorkflowProgress', () => {
    it('posts workflow progress comment with details', async () => {
      const mockComment = {
        id: 123,
        body: 'body',
        html_url: 'https://example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      const result = await commentClient.postWorkflowProgress(
        24,
        'requirements',
        'in_progress',
        '要件定義書を作成中です。',
      );

      expect(mockOctokit.issues.createComment).toHaveBeenCalledTimes(1);
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0] as { body: string };
      expect(callArgs.body).toContain('🔄 AI Workflow - 要件定義フェーズ');
      expect(callArgs.body).toContain('**ステータス**: IN_PROGRESS');
      expect(callArgs.body).toContain('要件定義書を作成中です。');
      expect(result).toEqual(mockComment);
    });

    it('uses correct emoji when status is completed', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      await commentClient.postWorkflowProgress(10, 'requirements', 'completed');

      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0] as { body: string };
      expect(callArgs.body).toContain('✅');
    });

    it('falls back to raw phase name when unknown', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      await commentClient.postWorkflowProgress(11, 'unknown_phase', 'in_progress');

      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0] as { body: string };
      expect(callArgs.body).toContain('unknown_phase');
    });

    it('does not include details when omitted', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      await commentClient.postWorkflowProgress(12, 'requirements', 'in_progress');

      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0] as { body: string };
      expect(callArgs.body).not.toContain('詳細');
      expect(callArgs.body).toMatch(/ステータス/);
    });
  });

  describe('createOrUpdateProgressComment', () => {
    it('creates new comment when no stored comment id', async () => {
      mockMetadataManager.getProgressCommentId.mockReturnValue(null);
      const mockComment = { id: 456, html_url: 'https://example.com/comment/456' };
      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      const result: ProgressCommentResult = await commentClient.createOrUpdateProgressComment(
        24,
        '## Phase 1: Requirements - 完了',
        mockMetadataManager as unknown as MetadataManager,
      );

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: '## Phase 1: Requirements - 完了',
      });
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenCalledWith(
        456,
        'https://example.com/comment/456',
      );
      expect(result).toEqual({
        comment_id: 456,
        comment_url: 'https://example.com/comment/456',
      });
    });

    it('updates existing comment when metadata has id', async () => {
      mockMetadataManager.getProgressCommentId.mockReturnValue(789);
      const mockComment = { id: 789, html_url: 'https://example.com/comment/789' };
      mockOctokit.issues.updateComment.mockResolvedValue({ data: mockComment } as any);

      const result = await commentClient.createOrUpdateProgressComment(
        30,
        '## Phase 2: Design - 完了',
        mockMetadataManager as unknown as MetadataManager,
      );

      expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 789,
        body: '## Phase 2: Design - 完了',
      });
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenCalledWith(
        789,
        'https://example.com/comment/789',
      );
      expect(result).toEqual({
        comment_id: 789,
        comment_url: 'https://example.com/comment/789',
      });
    });

    it('falls back to create when update fails with RequestError', async () => {
      mockMetadataManager.getProgressCommentId.mockReturnValue(123);

      const updateError = new RequestError('Not Found', 404, {
        request: { method: 'PATCH', url: 'https://api.github.com/comments/123', headers: {} },
        response: { status: 404, url: '', headers: {}, data: {} },
      });
      mockOctokit.issues.updateComment.mockRejectedValue(updateError);

      const createdComment = { id: 555, html_url: 'https://example.com/comment/555' };
      mockOctokit.issues.createComment.mockResolvedValue({ data: createdComment } as any);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await commentClient.createOrUpdateProgressComment(
        45,
        '## Phase 3: Test Scenario - 完了',
        mockMetadataManager as unknown as MetadataManager,
      );

      expect(mockOctokit.issues.updateComment).toHaveBeenCalledTimes(1);
      expect(mockOctokit.issues.createComment).toHaveBeenCalledTimes(1);
      expect(mockMetadataManager.saveProgressCommentId).toHaveBeenLastCalledWith(
        555,
        'https://example.com/comment/555',
      );
      expect(result).toEqual({
        comment_id: 555,
        comment_url: 'https://example.com/comment/555',
      });
      consoleWarnSpy.mockRestore();
    });

    it('throws when create also fails', async () => {
      mockMetadataManager.getProgressCommentId.mockReturnValue(null);

      const createError = new RequestError('Unauthorized', 401, {
        request: { method: 'POST', url: 'https://api.github.com/issues/24/comments', headers: {} },
        response: { status: 401, url: '', headers: {}, data: {} },
      });
      mockOctokit.issues.createComment.mockRejectedValue(createError);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(
        commentClient.createOrUpdateProgressComment(
          24,
          '## Phase 4: Implementation - 完了',
          mockMetadataManager as unknown as MetadataManager,
        ),
      ).rejects.toThrow('Failed to create or update progress comment');

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
