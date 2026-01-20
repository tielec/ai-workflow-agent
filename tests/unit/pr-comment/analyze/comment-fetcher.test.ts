import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PRCommentMetadataManager } from '../../../../src/core/pr-comment/metadata-manager.js';
import type { ReviewComment } from '../../../../src/types/pr-comment.js';

const newComment = (id: number): ReviewComment => ({
  id,
  node_id: `node-${id}`,
  path: 'src/a.ts',
  line: 10,
  start_line: null,
  end_line: null,
  body: 'body',
  user: 'rev',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  diff_hunk: '@@ -1 +1 @@',
  in_reply_to_id: undefined,
  thread_id: 'thread-1',
  pr_number: 1,
});

describe('comment-fetcher', () => {
  const metadataManager = {
    getMetadata: jest.fn(),
    addComments: jest.fn(),
    setAnalyzerError: jest.fn(),
  } as unknown as jest.Mocked<PRCommentMetadataManager>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('新規コメントをメタデータに追加する (TC-UNIT-FCH-001)', async () => {
    const existingMetadata = { comments: {} } as any;
    metadataManager.getMetadata = jest.fn().mockResolvedValue(existingMetadata);
    metadataManager.addComments = jest.fn().mockResolvedValue(undefined);

    const GitHubClient = jest.fn().mockImplementation(() => ({
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 'thread-1',
            comments: { nodes: [{ databaseId: 100, id: 'node-100', path: 'src/a.ts', line: 10, startLine: null, body: 'body', author: { login: 'rev' }, createdAt: '2025-01-01', updatedAt: '2025-01-01' }] },
          },
        ]),
        getPRReviewComments: jest.fn(),
      },
    }));

    await jest.unstable_mockModule('../../../../src/core/github-client.js', () => ({
      GitHubClient,
    }));

    const module = await import('../../../../src/commands/pr-comment/analyze/comment-fetcher.js');

    await module.refreshComments(1, 'owner/repo', metadataManager);

    expect(metadataManager.addComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 100 }),
    ]);
  });

  it('既存コメントやAI返信は追加しない (TC-UNIT-FCH-002, TC-UNIT-FCH-003)', async () => {
    const existingMetadata = {
      comments: {
        '100': { reply_comment_id: null },
        '200': { reply_comment_id: 200 },
      },
    } as any;
    metadataManager.getMetadata = jest.fn().mockResolvedValue(existingMetadata);
    metadataManager.addComments = jest.fn().mockResolvedValue(undefined);

    const GitHubClient = jest.fn().mockImplementation(() => ({
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 'thread-1',
            comments: {
              nodes: [
                {
                  databaseId: 100,
                  id: 'node-100',
                  path: 'src/a.ts',
                  line: 10,
                  startLine: null,
                  body: 'body',
                  author: { login: 'rev' },
                  createdAt: '2025-01-01',
                  updatedAt: '2025-01-01',
                },
                {
                  databaseId: 200,
                  id: 'node-200',
                  path: 'src/a.ts',
                  line: 12,
                  startLine: null,
                  body: 'body2',
                  author: { login: 'rev' },
                  createdAt: '2025-01-01',
                  updatedAt: '2025-01-01',
                },
              ],
            },
          },
        ]),
        getPRReviewComments: jest.fn(),
      },
    }));

    await jest.unstable_mockModule('../../../../src/core/github-client.js', () => ({
      GitHubClient,
    }));

    const module = await import('../../../../src/commands/pr-comment/analyze/comment-fetcher.js');

    await module.refreshComments(1, 'owner/repo', metadataManager);

    expect(metadataManager.addComments).not.toHaveBeenCalled();
  });

  it('API失敗時でも例外を伝播しない (TC-UNIT-FCH-004)', async () => {
    const existingMetadata = { comments: {} } as any;
    metadataManager.getMetadata = jest.fn().mockResolvedValue(existingMetadata);
    metadataManager.addComments = jest.fn();

    const GitHubClient = jest.fn().mockImplementation(() => ({
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockRejectedValue(new Error('network')),
        getPRReviewComments: jest.fn(),
      },
    }));

    await jest.unstable_mockModule('../../../../src/core/github-client.js', () => ({
      GitHubClient,
    }));

    const module = await import('../../../../src/commands/pr-comment/analyze/comment-fetcher.js');

    await expect(module.refreshComments(1, 'owner/repo', metadataManager)).resolves.toBeUndefined();
    expect(metadataManager.addComments).not.toHaveBeenCalled();
  });

  it('GraphQL結果を優先しRESTを呼ばない (TC-UNIT-FCH-005)', async () => {
    const githubClient = {
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 'thread-1',
            comments: {
              nodes: [
                {
                  databaseId: 10,
                  id: 'node-10',
                  path: 'src/a.ts',
                  line: 5,
                  startLine: null,
                  body: 'body',
                  author: { login: 'reviewer' },
                  createdAt: '2025-01-01T00:00:00Z',
                  updatedAt: '2025-01-01T00:00:00Z',
                },
              ],
            },
          },
        ]),
        getPRReviewComments: jest.fn(),
      },
    } as any;

    const module = await import('../../../../src/commands/pr-comment/analyze/comment-fetcher.js');

    const comments = await module.fetchLatestUnresolvedComments(githubClient, 7);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ id: 10, thread_id: 'thread-1', pr_number: 7 });
    expect(githubClient.commentClient.getPRReviewComments).not.toHaveBeenCalled();
  });

  it('GraphQLが空ならRESTにフォールバックする (TC-UNIT-FCH-006)', async () => {
    const githubClient = {
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([]),
        getPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 20,
            node_id: 'node-20',
            path: 'src/b.ts',
            line: 15,
            start_line: null,
            end_line: null,
            body: 'rest body',
            user: { login: 'rest-user' },
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            diff_hunk: '@@',
            in_reply_to_id: null,
          },
        ]),
      },
    } as any;

    const module = await import('../../../../src/commands/pr-comment/analyze/comment-fetcher.js');

    const comments = await module.fetchLatestUnresolvedComments(githubClient, 8);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ id: 20, pr_number: 8, path: 'src/b.ts' });
    expect(githubClient.commentClient.getPRReviewComments).toHaveBeenCalledWith(8);
  });
});
