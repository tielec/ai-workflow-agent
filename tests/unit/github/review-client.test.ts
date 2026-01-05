import { Octokit } from '@octokit/rest';
import { jest } from '@jest/globals';
import { ReviewClient } from '../../../src/core/github/review-client.js';
import type { MetadataManager } from '../../../src/core/metadata-manager.js';

describe('ReviewClient', () => {
  type CreateCommentParams = Parameters<Octokit['issues']['createComment']>[0];
  type CreateCommentResponse = Awaited<ReturnType<Octokit['issues']['createComment']>>;

  let reviewClient: ReviewClient;
  let mockOctokit: Octokit;
  let mockMetadata: MetadataManager;
  let createCommentMock: jest.MockedFunction<Octokit['issues']['createComment']>;
  const getCreateCommentArgs = (): Required<CreateCommentParams> => {
    const call = createCommentMock.mock.calls[0];
    const args = call?.[0];
    if (!args) {
      throw new Error('createCommentMock was not called');
    }
    return args as Required<CreateCommentParams>;
  };

  const getCreateCommentBody = (): string => {
    const args = getCreateCommentArgs();
    if (!args) {
      throw new Error('createCommentMock was not called');
    }
    if (!args.body) {
      throw new Error('createCommentMock body was not provided');
    }
    return args.body;
  };

  beforeEach(() => {
    // Create mock Octokit instance
    createCommentMock = jest.fn() as unknown as jest.MockedFunction<Octokit['issues']['createComment']>;
    mockOctokit = {
      issues: {
        createComment: createCommentMock,
      },
    } as unknown as Octokit;

    // Create mock MetadataManager (Issue #587)
    mockMetadata = {
      getLanguage: () => 'ja',
    } as unknown as MetadataManager;

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

      createCommentMock.mockResolvedValue({ data: mockComment } as CreateCommentResponse);

      // When: Post PASS review result
      const result = await reviewClient.postReviewResult(
        24,
        'requirements',
        'PASS',
        '要件定義書は完璧です。',
        [],
        mockMetadata,
      );

      // Then: Verify Octokit was called correctly
      expect(createCommentMock).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('✅ レビュー結果 - 要件定義フェーズ'),
      });

      // And: Body should include judgment
      const body = getCreateCommentBody();
      expect(body).toContain('**判定**: PASS');

      // And: Body should include feedback
      expect(body).toContain('### フィードバック');
      expect(body).toContain('要件定義書は完璧です。');

      // And: Body should NOT include suggestions (empty array)
      expect(body).not.toContain('### 改善提案');

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

      createCommentMock.mockResolvedValue({ data: mockComment } as CreateCommentResponse);

      // When: Post PASS_WITH_SUGGESTIONS with suggestions
      const result = await reviewClient.postReviewResult(
        24,
        'design',
        'PASS_WITH_SUGGESTIONS',
        '設計書は良好ですが、改善提案があります。',
        ['エラーハンドリングの詳細を追記してください。', 'パフォーマンス要件を明確化してください。'],
        mockMetadata,
      );

      // Then: Verify Octokit was called correctly
      expect(createCommentMock).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('⚠️ レビュー結果 - 設計フェーズ'),
      });

      // And: Body should include judgment
      const body = getCreateCommentBody();
      expect(body).toContain('**判定**: PASS_WITH_SUGGESTIONS');

      // And: Body should include feedback
      expect(body).toContain('### フィードバック');
      expect(body).toContain('設計書は良好ですが、改善提案があります。');

      // And: Body should include suggestions list
      expect(body).toContain('### 改善提案');
      expect(body).toContain('1. エラーハンドリングの詳細を追記してください。');
      expect(body).toContain('2. パフォーマンス要件を明確化してください。');

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

      createCommentMock.mockResolvedValue({ data: mockComment } as CreateCommentResponse);

      // When: Post FAIL review result
      const result = await reviewClient.postReviewResult(
        24,
        'implementation',
        'FAIL',
        '実装に重大な問題があります。',
        ['セキュリティ脆弱性を修正してください。', 'テストカバレッジが不足しています。'],
        mockMetadata,
      );

      // Then: Verify Octokit was called correctly
      expect(createCommentMock).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 24,
        body: expect.stringContaining('❌ レビュー結果 - 実装フェーズ'),
      });

      // And: Body should include judgment
      const body = getCreateCommentBody();
      expect(body).toContain('**判定**: FAIL');

      // And: Body should include feedback
      expect(body).toContain('実装に重大な問題があります。');

      // And: Body should include suggestions
      expect(body).toContain('### 改善提案');
      expect(body).toContain('1. セキュリティ脆弱性を修正してください。');
      expect(body).toContain('2. テストカバレッジが不足しています。');

      // And: Result should match mock data
      expect(result).toEqual(mockComment);
    });

    it('should handle empty suggestions array', async () => {
      // Given: Mock response
      createCommentMock.mockResolvedValue({ data: {} } as CreateCommentResponse);

      // When: Post review with empty suggestions
      await reviewClient.postReviewResult(
        24,
        'testing',
        'PASS',
        'テストは完璧です。',
        [],
        mockMetadata,
      );

      // Then: Body should NOT include suggestions section
      const body = getCreateCommentBody();
      expect(body).not.toContain('### 改善提案');
    });

    it('should handle unknown phase gracefully', async () => {
      // Given: Mock response
      createCommentMock.mockResolvedValue({ data: {} } as CreateCommentResponse);

      // When: Post with unknown phase
      await reviewClient.postReviewResult(
        24,
        'unknown_phase',
        'PASS',
        'フィードバック',
        [],
        mockMetadata,
      );

      // Then: Should use phase name as-is
      const body = getCreateCommentBody();
      expect(body).toContain('unknown_phase');
    });

    it('should handle unknown result gracefully', async () => {
      // Given: Mock response
      createCommentMock.mockResolvedValue({ data: {} } as CreateCommentResponse);

      // When: Post with unknown result
      await reviewClient.postReviewResult(
        24,
        'requirements',
        'UNKNOWN_RESULT',
        'フィードバック',
        [],
        mockMetadata,
      );

      // Then: Should use default emoji
      const body = getCreateCommentBody();
      expect(body).toContain('📝');
      expect(body).toContain('**判定**: UNKNOWN_RESULT');
    });

    it('should not include feedback section when feedback is empty', async () => {
      // Given: Mock response
      createCommentMock.mockResolvedValue({ data: {} } as CreateCommentResponse);

      // When: Post with empty feedback
      await reviewClient.postReviewResult(24, 'requirements', 'PASS', '', [], mockMetadata);

      // Then: Body should not include feedback section (empty string is falsy)
      const body = getCreateCommentBody();
      expect(body).not.toContain('### フィードバック');
    });
  });
});
