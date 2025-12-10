import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Define mock objects first
const metadataManagerMock = {
  initialize: jest.fn(),
  exists: jest.fn(),
  load: jest.fn(),
  getPendingComments: jest.fn(),
  updateCommentStatus: jest.fn(),
  incrementRetryCount: jest.fn(),
  updateCostTracking: jest.fn(),
  setReplyCommentId: jest.fn(),
  getSummary: jest.fn(),
  getCompletedComments: jest.fn(),
  setResolved: jest.fn(),
  cleanup: jest.fn(),
  getMetadataPath: jest.fn(),
};

const analyzerMock = { analyze: jest.fn() };
const applierMock = { apply: jest.fn() };
const githubClientMock = {
  getPullRequestNumber: jest.fn(),
  getPullRequestInfo: jest.fn(),
  getRepositoryInfo: jest.fn(),
  commentClient: {
    replyToPRReviewComment: jest.fn(),
    resolveReviewThread: jest.fn(),
    getUnresolvedPRReviewComments: jest.fn(),
    getPRReviewComments: jest.fn(),
  },
};
const simpleGitMock = jest.fn();
const mockGetRepoRoot = jest.fn();

// Use unstable_mockModule for ESM compatibility
jest.unstable_mockModule('../../src/core/pr-comment/metadata-manager.js', () => ({
  PRCommentMetadataManager: jest.fn().mockImplementation(() => metadataManagerMock),
}));

jest.unstable_mockModule('../../src/core/pr-comment/comment-analyzer.js', () => ({
  ReviewCommentAnalyzer: jest.fn().mockImplementation(() => analyzerMock),
}));

jest.unstable_mockModule('../../src/core/pr-comment/change-applier.js', () => ({
  CodeChangeApplier: jest.fn().mockImplementation(() => applierMock),
}));

jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  GitHubClient: jest.fn().mockImplementation(() => githubClientMock),
}));

jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  getRepoRoot: () => mockGetRepoRoot(),
}));

jest.unstable_mockModule('simple-git', () => ({
  default: (...args: any[]) => simpleGitMock(...args),
}));

// Dynamic imports after mock setup
const { handlePRCommentExecuteCommand } = await import('../../src/commands/pr-comment/execute.js');
const { handlePRCommentFinalizeCommand } = await import('../../src/commands/pr-comment/finalize.js');
const { handlePRCommentInitCommand } = await import('../../src/commands/pr-comment/init.js');

describe('Integration: pr-comment workflow', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(metadataManagerMock).forEach(fn => (fn as jest.Mock).mockReset());
    analyzerMock.analyze.mockReset();
    applierMock.apply.mockReset();
    Object.values(githubClientMock).forEach(fn => {
      if (typeof fn === 'function') (fn as jest.Mock).mockReset();
    });
    Object.values(githubClientMock.commentClient).forEach(fn => (fn as jest.Mock).mockReset());
    simpleGitMock.mockReset();
    mockGetRepoRoot.mockReset();

    // Configure default mock implementations
    metadataManagerMock.exists.mockResolvedValue(true);
    metadataManagerMock.load.mockResolvedValue(undefined);
    metadataManagerMock.getPendingComments.mockResolvedValue([]);
    metadataManagerMock.updateCommentStatus.mockResolvedValue(undefined);
    metadataManagerMock.incrementRetryCount.mockResolvedValue(0);
    metadataManagerMock.updateCostTracking.mockResolvedValue(undefined);
    metadataManagerMock.setReplyCommentId.mockResolvedValue(undefined);
    metadataManagerMock.getSummary.mockResolvedValue({ total: 0, by_status: {}, by_type: {} });
    metadataManagerMock.getCompletedComments.mockResolvedValue([]);
    metadataManagerMock.setResolved.mockResolvedValue(undefined);
    metadataManagerMock.cleanup.mockResolvedValue(undefined);
    metadataManagerMock.getMetadataPath.mockReturnValue('/repo/.ai-workflow/pr-123/metadata.json');

    simpleGitMock.mockReturnValue({
      status: jest.fn().mockResolvedValue({ files: [] }),
      add: jest.fn(),
      commit: jest.fn(),
      remote: jest.fn().mockResolvedValue('https://github.com/owner/repo.git'),
    });
    mockGetRepoRoot.mockResolvedValue('/repo');
  });

  it('processes pending comments, applies changes, and posts replies', async () => {
    const resolution = {
      type: 'code_change' as const,
      confidence: 'high' as const,
      changes: [{ path: 'src/core/config.ts', change_type: 'modify', content: 'export {}' }],
      reply: 'Resolved',
    };

    metadataManagerMock.getPendingComments.mockResolvedValue([
      {
        comment: {
          id: 100,
          node_id: 'N100',
          path: 'src/core/config.ts',
          line: 10,
          body: 'Fix typo',
          user: 'alice',
          created_at: '2025-01-20T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z',
        },
        status: 'pending',
      },
    ]);
    metadataManagerMock.getSummary.mockResolvedValue({
      total: 1,
      by_status: { pending: 0, in_progress: 0, completed: 1, skipped: 0, failed: 0 },
      by_type: { code_change: 1, reply: 0, discussion: 0, skip: 0 },
    });

    analyzerMock.analyze.mockResolvedValue({
      success: true,
      resolution,
      inputTokens: 100,
      outputTokens: 50,
    });
    applierMock.apply.mockResolvedValue({ success: true, applied_files: [], skipped_files: [] });
    githubClientMock.commentClient.replyToPRReviewComment.mockResolvedValue({
      id: 900,
      html_url: 'https://example.com/comment/900',
    });

    await handlePRCommentExecuteCommand({ pr: '123' } as any);

    expect(metadataManagerMock.updateCommentStatus).toHaveBeenCalledWith('100', 'in_progress');
    expect(applierMock.apply).toHaveBeenCalledWith(resolution.changes, false);
    expect(githubClientMock.commentClient.replyToPRReviewComment).toHaveBeenCalledWith(
      123,
      100,
      'Resolved',
    );
    expect(metadataManagerMock.setReplyCommentId).toHaveBeenCalledWith('100', 900);
    expect(metadataManagerMock.updateCostTracking).toHaveBeenCalledWith(100, 50, expect.any(Number));
    expect(metadataManagerMock.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      resolution,
    );
  });

  it('finalizes completed comments and cleans up metadata', async () => {
    metadataManagerMock.getCompletedComments.mockResolvedValue([
      {
        comment: {
          id: 200,
          thread_id: 'PRRT_abc',
        },
        status: 'completed',
      },
    ]);

    githubClientMock.commentClient.resolveReviewThread.mockResolvedValue(true);

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(githubClientMock.commentClient.resolveReviewThread).toHaveBeenCalledWith('PRRT_abc');
    expect(metadataManagerMock.setResolved).toHaveBeenCalledWith('200');
    expect(metadataManagerMock.cleanup).toHaveBeenCalledTimes(1);
  });

  it('initializes metadata for unresolved review comments on a PR', async () => {
    githubClientMock.getPullRequestInfo.mockResolvedValue({
      number: 123,
      url: 'https://github.com/owner/repo/pull/123',
      title: 'Add PR comment handler',
      head: 'feature/pr-comment',
      base: 'main',
      state: 'open',
      node_id: 'PR123',
    });
    githubClientMock.getRepositoryInfo.mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      repositoryName: 'owner/repo',
    });
    githubClientMock.commentClient.getUnresolvedPRReviewComments.mockResolvedValue([
      {
        id: 'THREAD_1',
        isResolved: false,
        comments: {
          nodes: [
            {
              id: 'C1',
              databaseId: 201,
              body: 'Fix this',
              path: 'src/a.ts',
              line: 10,
              startLine: null,
              author: { login: 'alice' },
              createdAt: '2025-01-20T00:00:00Z',
              updatedAt: '2025-01-20T00:00:00Z',
            },
          ],
        },
      },
      {
        id: 'THREAD_2',
        isResolved: false,
        comments: {
          nodes: [
            {
              id: 'C2',
              databaseId: 202,
              body: 'Why?',
              path: 'src/b.ts',
              line: 20,
              startLine: null,
              author: { login: 'bob' },
              createdAt: '2025-01-20T00:05:00Z',
              updatedAt: '2025-01-20T00:05:00Z',
            },
            {
              id: 'C3',
              databaseId: 203,
              body: 'Another comment',
              path: 'src/c.ts',
              line: 30,
              startLine: null,
              author: { login: 'carol' },
              createdAt: '2025-01-20T00:10:00Z',
              updatedAt: '2025-01-20T00:10:00Z',
            },
          ],
        },
      },
    ]);
    githubClientMock.commentClient.getPRReviewComments.mockResolvedValue([
      {
        id: 201,
        node_id: 'N201',
        path: 'src/a.ts',
        line: 10,
        start_line: null,
        body: 'Fix this',
        user: { login: 'alice' },
        created_at: '2025-01-20T00:00:00Z',
        updated_at: '2025-01-20T00:00:00Z',
        diff_hunk: '@@ -1,1 +1,1 @@',
      },
      {
        id: 202,
        node_id: 'N202',
        path: 'src/b.ts',
        line: 20,
        start_line: null,
        body: 'Why?',
        user: { login: 'bob' },
        created_at: '2025-01-20T00:05:00Z',
        updated_at: '2025-01-20T00:05:00Z',
        diff_hunk: '@@ -2,1 +2,1 @@',
      },
      {
        id: 203,
        node_id: 'N203',
        path: 'src/c.ts',
        line: 30,
        start_line: null,
        body: 'Another comment',
        user: { login: 'carol' },
        created_at: '2025-01-20T00:10:00Z',
        updated_at: '2025-01-20T00:10:00Z',
        diff_hunk: '@@ -3,1 +3,1 @@',
      },
    ]);
    metadataManagerMock.initialize.mockResolvedValue(undefined);
    metadataManagerMock.getSummary.mockResolvedValue({
      total: 3,
      by_status: { pending: 3, in_progress: 0, completed: 0, skipped: 0, failed: 0 },
      by_type: { code_change: 0, reply: 0, discussion: 0, skip: 0 },
    });
    metadataManagerMock.getMetadataPath.mockReturnValue(
      '/repo/.ai-workflow/pr-123/comment-resolution-metadata.json',
    );

    await handlePRCommentInitCommand({ pr: '123' } as any);

    expect(metadataManagerMock.initialize).toHaveBeenCalledWith(
      {
        number: 123,
        url: 'https://github.com/owner/repo/pull/123',
        title: 'Add PR comment handler',
        branch: 'feature/pr-comment',
        base_branch: 'main',
        state: 'open',
      },
      {
        owner: 'owner',
        repo: 'repo',
        path: '/repo',
        remote_url: 'https://github.com/owner/repo.git',
      },
      expect.arrayContaining([
        expect.objectContaining({ id: 201, thread_id: 'THREAD_1' }),
        expect.objectContaining({ id: 202, thread_id: 'THREAD_2' }),
        expect.objectContaining({ id: 203, thread_id: 'THREAD_2' }),
      ]),
      undefined,
    );
    expect(metadataManagerMock.getSummary).toHaveBeenCalledTimes(1);
  });
});
