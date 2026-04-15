/**
 * ユニットテスト: PullRequestClient (diff取得・コメント投稿)
 *
 * テスト対象: src/core/github/pull-request-client.ts
 * テストシナリオ: test-scenario.md の TC-DIFF-001〜, TC-COMMENT-001〜
 */

import { describe, expect, it, jest } from '@jest/globals';
import { RequestError } from '@octokit/request-error';
import { createMockOctokit } from '../../../helpers/mock-octokit.js';
import { PullRequestClient } from '../../../../src/core/github/pull-request-client.js';

const createRequestError = (message: string, status: number, method: 'GET' | 'POST') =>
  new RequestError(message, status, {
    request: { method, url: '', headers: { authorization: 'token' } },
  });

describe('PullRequestClient', () => {
  it('TC-DIFF-001: diffを取得して返す', async () => {
    const mockOctokit = createMockOctokit();
    mockOctokit.pulls.get
      .mockResolvedValueOnce({ data: 'diff --git a/file b/file' } as any)
      .mockResolvedValueOnce({ data: { changed_files: 2 } } as any);

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.getPullRequestDiff(123);

    expect(result.diff).toContain('diff --git');
    expect(result.truncated).toBe(false);
    expect(result.filesChanged).toBe(2);
  });

  it('TC-DIFF-002: 404は対象PRが見つからないエラー', async () => {
    const mockOctokit = createMockOctokit({
      pulls: {
        get: jest.fn().mockRejectedValue(createRequestError('Not Found', 404, 'GET')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    await expect(client.getPullRequestDiff(999)).rejects.toThrow('PR #999 が見つかりません');
  });

  it('TC-DIFF-003: 401/403は認証エラー', async () => {
    const mockOctokit = createMockOctokit({
      pulls: {
        get: jest.fn().mockRejectedValue(createRequestError('Forbidden', 403, 'GET')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    await expect(client.getPullRequestDiff(123)).rejects.toThrow('認証エラー');
  });

  it('TC-DIFF-004: 422はバリデーションエラー', async () => {
    const mockOctokit = createMockOctokit({
      pulls: {
        get: jest.fn().mockRejectedValue(createRequestError('Validation Failed', 422, 'GET')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    await expect(client.getPullRequestDiff(123)).rejects.toThrow('バリデーションエラー');
  });

  it('TC-DIFF-005: その他ステータスはGitHub APIエラー', async () => {
    const mockOctokit = createMockOctokit({
      pulls: {
        get: jest.fn().mockRejectedValue(createRequestError('Internal Error', 500, 'GET')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    await expect(client.getPullRequestDiff(123)).rejects.toThrow('GitHub API エラー: 500');
  });

  it('TC-COMMENT-001: 正常にコメント投稿できる', async () => {
    const mockOctokit = createMockOctokit();
    mockOctokit.issues.createComment.mockResolvedValue({ data: { id: 10, html_url: 'https://example.com' } } as any);

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, 'テスト');

    expect(result.success).toBe(true);
    expect(result.commentId).toBe(10);
    expect(result.commentUrl).toBe('https://example.com');
  });

  it('TC-COMMENT-002: 空本文はエラーを返す', async () => {
    const mockOctokit = createMockOctokit();
    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, '');

    expect(result.success).toBe(false);
    expect(result.error).toContain('コメント本文が空');
  });

  it('TC-COMMENT-003: 404は対象PRが見つからない', async () => {
    const mockOctokit = createMockOctokit({
      issues: {
        createComment: jest.fn().mockRejectedValue(createRequestError('Not Found', 404, 'POST')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(999, 'テスト');
    expect(result.success).toBe(false);
    expect(result.error).toContain('PR #999 が見つかりません');
  });

  it('TC-COMMENT-004: 401/403は認証エラー', async () => {
    const mockOctokit = createMockOctokit({
      issues: {
        createComment: jest.fn().mockRejectedValue(createRequestError('Forbidden', 403, 'POST')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, 'テスト');
    expect(result.success).toBe(false);
    expect(result.error).toContain('認証エラー');
  });

  it('TC-COMMENT-005: 422はバリデーションエラー', async () => {
    const mockOctokit = createMockOctokit({
      issues: {
        createComment: jest.fn().mockRejectedValue(createRequestError('Validation Failed', 422, 'POST')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, 'テスト');
    expect(result.success).toBe(false);
    expect(result.error).toContain('バリデーションエラー');
  });

  it('TC-COMMENT-006: その他ステータスはGitHub APIエラー', async () => {
    const mockOctokit = createMockOctokit({
      issues: {
        createComment: jest.fn().mockRejectedValue(createRequestError('Internal Error', 500, 'POST')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, 'テスト');
    expect(result.success).toBe(false);
    expect(result.error).toContain('GitHub API エラー: 500');
  });

  it('TC-COMMENT-007: 予期しないエラーはラップされる', async () => {
    const mockOctokit = createMockOctokit({
      issues: {
        createComment: jest.fn().mockRejectedValue(new Error('Connection refused')),
      },
    });

    const client = new PullRequestClient(mockOctokit.client, 'owner', 'repo', 'owner/repo');
    const result = await client.postPRComment(123, 'テスト');
    expect(result.success).toBe(false);
    expect(result.error).toContain('予期しないエラー');
  });
});
