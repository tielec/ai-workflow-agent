import { Octokit } from '@octokit/rest';
import { ReviewClient } from '../../../src/core/github/review-client.js';

describe('ReviewClient', () => {
  let reviewClient: ReviewClient;
  let mockOctokit: jest.Mocked<Octokit>;

  beforeEach(() => {
    // Create mock Octokit instance
    mockOctokit = {
      issues: {
        createComment: jest.fn(),
      },
    } as unknown as jest.Mocked<Octokit>;

    reviewClient = new ReviewClient(mockOctokit, 'owner', 'repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postReviewResult', () => {
    it('should post PASS review result successfully', async () => {
      // Given: Mock comment creation response
      const mockComment = {
        id: 123456,
        body: '## ✅ レビュー結果 - 要件定義フェーズ...',
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Post PASS review result
      const result = await reviewClient.postReviewResult(
        24,
        'requirements',
        'PASS',
        '要件定義書は完璧です。',
        []
      );

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('✅ レビュー結果 - 要件定義フェーズ'),
      });

      // And: Body should include judgment
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('**判定**: PASS');

      // And: Body should include feedback
      expect(callArgs.body).toContain('### フィードバック');
      expect(callArgs.body).toContain('要件定義書は完璧です。');

      // And: Body should NOT include suggestions (empty array)
      expect(callArgs.body).not.toContain('### 改善提案');

      // And: Result should match mock data
      expect(result).toEqual(mockComment);
    });

    it('should post PASS_WITH_SUGGESTIONS review result with suggestions', async () => {
      // Given: Mock comment creation response
      const mockComment = {
        id: 123456,
        body: '## ⚠️ レビュー結果...',
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Post PASS_WITH_SUGGESTIONS with suggestions
      const result = await reviewClient.postReviewResult(
        24,
        'design',
        'PASS_WITH_SUGGESTIONS',
        '設計書は良好ですが、改善提案があります。',
        ['エラーハンドリングの詳細を追記してください。', 'パフォーマンス要件を明確化してください。']
      );

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('⚠️ レビュー結果 - 設計フェーズ'),
      });

      // And: Body should include judgment
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('**判定**: PASS_WITH_SUGGESTIONS');

      // And: Body should include feedback
      expect(callArgs.body).toContain('### フィードバック');
      expect(callArgs.body).toContain('設計書は良好ですが、改善提案があります。');

      // And: Body should include suggestions list
      expect(callArgs.body).toContain('### 改善提案');
      expect(callArgs.body).toContain('1. エラーハンドリングの詳細を追記してください。');
      expect(callArgs.body).toContain('2. パフォーマンス要件を明確化してください。');

      // And: Result should match mock data
      expect(result).toEqual(mockComment);
    });

    it('should post FAIL review result successfully', async () => {
      // Given: Mock comment creation response
      const mockComment = {
        id: 123456,
        body: '## ❌ レビュー結果...',
        html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
      };

      mockOctokit.issues.createComment.mockResolvedValue({ data: mockComment } as any);

      // When: Post FAIL review result
      const result = await reviewClient.postReviewResult(
        24,
        'implementation',
        'FAIL',
        '実装に重大な問題があります。',
        ['セキュリティ脆弱性を修正してください。', 'テストカバレッジが不足しています。']
      );

      // Then: Verify Octokit was called correctly
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('❌ レビュー結果 - 実装フェーズ'),
      });

      // And: Body should include judgment
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('**判定**: FAIL');

      // And: Body should include feedback
      expect(callArgs.body).toContain('実装に重大な問題があります。');

      // And: Body should include suggestions
      expect(callArgs.body).toContain('### 改善提案');
      expect(callArgs.body).toContain('1. セキュリティ脆弱性を修正してください。');
      expect(callArgs.body).toContain('2. テストカバレッジが不足しています。');

      // And: Result should match mock data
      expect(result).toEqual(mockComment);
    });

    it('should handle empty suggestions array', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post review with empty suggestions
      await reviewClient.postReviewResult(
        24,
        'testing',
        'PASS',
        'テストは完璧です。',
        []
      );

      // Then: Body should NOT include suggestions section
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).not.toContain('### 改善提案');
    });

    it('should handle unknown phase gracefully', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post with unknown phase
      await reviewClient.postReviewResult(
        24,
        'unknown_phase',
        'PASS',
        'フィードバック',
        []
      );

      // Then: Should use phase name as-is
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('unknown_phase');
    });

    it('should handle unknown result gracefully', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post with unknown result
      await reviewClient.postReviewResult(
        24,
        'requirements',
        'UNKNOWN_RESULT',
        'フィードバック',
        []
      );

      // Then: Should use default emoji
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).toContain('📝');
      expect(callArgs.body).toContain('**判定**: UNKNOWN_RESULT');
    });

    it('should not include feedback section when feedback is empty', async () => {
      // Given: Mock response
      mockOctokit.issues.createComment.mockResolvedValue({ data: {} } as any);

      // When: Post with empty feedback
      await reviewClient.postReviewResult(24, 'requirements', 'PASS', '', []);

      // Then: Body should not include feedback section (empty string is falsy)
      const callArgs = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(callArgs.body).not.toContain('### フィードバック');
    });
  });
});
