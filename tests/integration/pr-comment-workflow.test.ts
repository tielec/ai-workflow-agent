import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import type { ResponsePlan } from '../../src/types/pr-comment.js';
import { logger } from '../../src/utils/logger.js';

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
const metadataManagerConstructorMock = jest.fn().mockImplementation(() => metadataManagerMock);

const analyzerMock = { analyze: jest.fn() };
const analyzerConstructorMock = jest.fn().mockImplementation(() => analyzerMock);
const applierMock = { apply: jest.fn() };
const applierConstructorMock = jest.fn().mockImplementation(() => applierMock);
const githubClientMock = {
  getPullRequestNumber: jest.fn(),
  getPullRequestInfo: jest.fn(),
  getRepositoryInfo: jest.fn(),
  commentClient: {
    replyToPRReviewComment: jest.fn(),
    resolveReviewThread: jest.fn(),
    getUnresolvedPRReviewComments: jest.fn(),
    getPRReviewComments: jest.fn(),
    getPendingReviewComments: jest.fn(),
  },
};
const simpleGitMock = jest.fn();
const mockGetRepoRoot = jest.fn();
const resolveRepoPathFromPrUrlMock = jest.fn();
const parsePullRequestUrlMock = jest.fn();
let responsePlan: ResponsePlan;
let readFileSpy: jest.SpyInstance;

// Use unstable_mockModule for ESM compatibility
jest.unstable_mockModule('../../src/core/pr-comment/metadata-manager.js', () => ({
  PRCommentMetadataManager: metadataManagerConstructorMock,
}));

jest.unstable_mockModule('../../src/core/pr-comment/comment-analyzer.js', () => ({
  ReviewCommentAnalyzer: analyzerConstructorMock,
}));

jest.unstable_mockModule('../../src/core/pr-comment/change-applier.js', () => ({
  CodeChangeApplier: applierConstructorMock,
}));

jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  GitHubClient: jest.fn().mockImplementation(() => githubClientMock),
}));

jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  getRepoRoot: () => mockGetRepoRoot(),
  resolveRepoPathFromPrUrl: (...args: any[]) => resolveRepoPathFromPrUrlMock(...args),
  parsePullRequestUrl: (...args: any[]) => parsePullRequestUrlMock(...args),
}));

jest.unstable_mockModule('simple-git', () => ({
  default: (...args: any[]) => simpleGitMock(...args),
}));

// Dynamic imports after mock setup
const { handlePRCommentExecuteCommand } = await import('../../src/commands/pr-comment/execute.js');
const { handlePRCommentFinalizeCommand } = await import('../../src/commands/pr-comment/finalize.js');
const { handlePRCommentInitCommand } = await import('../../src/commands/pr-comment/init.js');

describe('Integration: pr-comment workflow', () => {
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock process.exit to prevent test termination
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() called');
    });

    // Reset all mocks
    metadataManagerConstructorMock.mockReset();
    metadataManagerConstructorMock.mockImplementation(() => metadataManagerMock);
    Object.values(metadataManagerMock).forEach(fn => (fn as jest.Mock).mockReset());
    analyzerConstructorMock.mockReset();
    analyzerConstructorMock.mockImplementation(() => analyzerMock);
    analyzerMock.analyze.mockReset();
    applierConstructorMock.mockReset();
    applierConstructorMock.mockImplementation(() => applierMock);
    applierMock.apply.mockReset();
    Object.values(githubClientMock).forEach(fn => {
      if (typeof fn === 'function') (fn as jest.Mock).mockReset();
    });
    Object.values(githubClientMock.commentClient).forEach(fn => (fn as jest.Mock).mockReset());
    simpleGitMock.mockReset();
    mockGetRepoRoot.mockReset();
    resolveRepoPathFromPrUrlMock.mockReset();
    parsePullRequestUrlMock.mockReset();

    // Configure default mock implementations
    metadataManagerMock.exists.mockResolvedValue(true);
    metadataManagerMock.load.mockResolvedValue({
      pr: {
        branch: 'feature/branch',
      },
    });
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
      add: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      remote: jest.fn().mockResolvedValue('https://github.com/owner/repo.git'),
      addConfig: jest.fn().mockResolvedValue(undefined),
      branch: jest.fn().mockResolvedValue({ current: 'main' }),
      push: jest.fn().mockResolvedValue(undefined),
    });
    mockGetRepoRoot.mockResolvedValue('/repo');
    resolveRepoPathFromPrUrlMock.mockReturnValue('/repo');
    parsePullRequestUrlMock.mockImplementation((url: string) => ({
      owner: 'owner',
      repo: 'repo',
      prNumber: Number.parseInt(url.match(/(\d+)/)?.[1] ?? '0', 10),
      repositoryName: 'owner/repo',
    }));
    githubClientMock.getRepositoryInfo.mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      repositoryName: 'owner/repo',
    });
    githubClientMock.getPullRequestInfo.mockResolvedValue({
      number: 123,
      url: 'https://github.com/owner/repo/pull/123',
      title: 'PR title',
      head: 'feature/branch',
      base: 'main',
      state: 'open',
      node_id: 'PR123',
    });
    githubClientMock.commentClient.getUnresolvedPRReviewComments.mockResolvedValue([]);
    githubClientMock.commentClient.getPRReviewComments.mockResolvedValue([]);
    githubClientMock.commentClient.getPendingReviewComments.mockResolvedValue([]);

    responsePlan = {
      pr_number: 123,
      analyzed_at: '2025-01-20T00:00:00Z',
      analyzer_agent: 'test-agent',
      comments: [],
    };
    readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation(async (filePath) => {
      const file = String(filePath);
      if (file.endsWith('response-plan.json')) {
        return JSON.stringify(responsePlan);
      }
      throw new Error(`Unexpected fs.readFile call: ${file}`);
    });
  });

  afterEach(() => {
    readFileSpy.mockRestore();
    processExitSpy.mockRestore();
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

    responsePlan = {
      pr_number: 123,
      analyzed_at: '2025-01-20T00:00:00Z',
      analyzer_agent: 'test-agent',
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          input_tokens: 100,
          output_tokens: 50,
          proposed_changes: [
            { action: 'modify', file: 'src/core/config.ts', changes: 'export {}' },
          ],
          reply_message: 'Resolved',
        },
      ],
    };

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
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repo', 123);
    expect(mockGetRepoRoot).toHaveBeenCalledTimes(1);
    expect(resolveRepoPathFromPrUrlMock).not.toHaveBeenCalled();
    expect(applierConstructorMock).toHaveBeenCalledWith('/repo');
  });

  it('resumes in_progress comments during rebuild execute flow', async () => {
    metadataManagerMock.load.mockResolvedValue({
      pr: { branch: 'feature/resume' },
    });
    metadataManagerMock.getPendingComments.mockResolvedValue([
      {
        comment: {
          id: 500,
          node_id: 'N500',
          path: 'src/core/resume.ts',
          line: 15,
          body: 'Resume this comment',
          user: 'dave',
          created_at: '2025-01-20T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z',
        },
        status: 'in_progress',
      },
    ]);
    metadataManagerMock.getSummary.mockResolvedValue({
      total: 1,
      by_status: { pending: 0, in_progress: 0, completed: 1, skipped: 0, failed: 0 },
      by_type: { code_change: 1, reply: 0, discussion: 0, skip: 0 },
    });

    analyzerMock.analyze.mockResolvedValue({
      success: true,
      resolution: {
        type: 'code_change',
        confidence: 'high',
        changes: [{ path: 'src/core/resume.ts', change_type: 'modify', content: 'export {}' }],
        reply: 'Resumed and completed',
      },
      inputTokens: 10,
      outputTokens: 5,
    });
    applierMock.apply.mockResolvedValue({ success: true, applied_files: [], skipped_files: [] });
    githubClientMock.commentClient.replyToPRReviewComment.mockResolvedValue({
      id: 905,
      html_url: 'https://example.com/comment/905',
    });

    responsePlan = {
      pr_number: 123,
      analyzed_at: '2025-01-20T00:00:00Z',
      analyzer_agent: 'test-agent',
      comments: [
        {
          comment_id: '500',
          type: 'code_change',
          confidence: 'high',
          input_tokens: 10,
          output_tokens: 5,
          proposed_changes: [
            { action: 'modify', file: 'src/core/resume.ts', changes: 'export {}' },
          ],
          reply_message: 'Resumed and completed',
        },
      ],
    };

    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await handlePRCommentExecuteCommand({ pr: '123' } as any);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('in_progress'));
    expect(metadataManagerMock.updateCommentStatus).toHaveBeenCalledWith('500', 'in_progress');
    expect(metadataManagerMock.updateCommentStatus).toHaveBeenCalledWith(
      '500',
      'completed',
      expect.objectContaining({
        reply: 'Resumed and completed',
      }),
    );

    warnSpy.mockRestore();
  });

  // Verifies the finalize workflow resolves completed comments and commits/pushes cleanup metadata.
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
    const gitInstance = {
      add: jest.fn().mockResolvedValue(undefined),
      status: jest
        .fn()
        .mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/metadata.json', working_dir: 'D' }] }),
      commit: jest.fn().mockResolvedValue(undefined),
      push: jest.fn().mockResolvedValue(undefined),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };
    simpleGitMock.mockReturnValue(gitInstance);

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(githubClientMock.commentClient.resolveReviewThread).toHaveBeenCalledWith('PRRT_abc');
    expect(metadataManagerMock.setResolved).toHaveBeenCalledWith('200');
    expect(metadataManagerMock.cleanup).toHaveBeenCalledTimes(1);
    expect(gitInstance.add).toHaveBeenCalledWith('.');
    expect(gitInstance.status).toHaveBeenCalled();
    expect(gitInstance.commit).toHaveBeenCalledWith(
      expect.stringContaining('Clean up workflow artifacts'),
    );
    expect(gitInstance.push).toHaveBeenCalledWith('origin', 'HEAD:feature/branch');
    expect(gitInstance.addConfig).toHaveBeenCalledWith('user.name', expect.any(String));
    expect(gitInstance.addConfig).toHaveBeenCalledWith('user.email', expect.any(String));
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repo', 123);
    expect(mockGetRepoRoot).toHaveBeenCalledTimes(1);
    expect(resolveRepoPathFromPrUrlMock).not.toHaveBeenCalled();
  });

  it('initializes metadata for unresolved review comments on a PR', async () => {
    metadataManagerMock.exists.mockResolvedValue(false);
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

  it('skips initialization when metadata already exists', async () => {
    metadataManagerMock.exists.mockResolvedValue(true);
    const loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123' } as any);

    const gitInstance = simpleGitMock.mock.results[0]?.value;

    expect(metadataManagerMock.initialize).not.toHaveBeenCalled();
    expect(metadataManagerMock.getSummary).not.toHaveBeenCalled();
    expect(gitInstance?.add).not.toHaveBeenCalled();
    expect(gitInstance?.commit).not.toHaveBeenCalled();
    expect(gitInstance?.push).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith('Metadata already exists. Skipping initialization.');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Use "pr-comment analyze" or "pr-comment execute" to resume.');

    loggerWarnSpy.mockRestore();
    loggerInfoSpy.mockRestore();
  });

  it('initializes metadata using a repository path resolved from PR URL', async () => {
    metadataManagerMock.exists.mockResolvedValue(false);
    const prUrl = 'https://github.com/owner/target-repo/pull/123';
    parsePullRequestUrlMock.mockReturnValue({
      owner: 'owner',
      repo: 'target-repo',
      prNumber: 123,
      repositoryName: 'owner/target-repo',
    });
    resolveRepoPathFromPrUrlMock.mockReturnValue('/repos/target-repo');
    githubClientMock.getRepositoryInfo.mockReturnValue({
      owner: 'owner',
      repo: 'target-repo',
      repositoryName: 'owner/target-repo',
    });
    metadataManagerMock.getMetadataPath.mockReturnValue(
      '/repos/target-repo/.ai-workflow/pr-123/comment-resolution-metadata.json',
    );
    metadataManagerMock.getSummary.mockResolvedValue({
      total: 0,
      by_status: { pending: 0, in_progress: 0, completed: 0, skipped: 0, failed: 0 },
      by_type: { code_change: 0, reply: 0, discussion: 0, skip: 0 },
    });

    await handlePRCommentInitCommand({ prUrl } as any);

    expect(resolveRepoPathFromPrUrlMock).toHaveBeenCalledWith(prUrl);
    expect(mockGetRepoRoot).not.toHaveBeenCalled();
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repos/target-repo', 123);
    expect(metadataManagerMock.initialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: '/repos/target-repo' }),
      expect.any(Array),
      undefined,
    );
    expect(simpleGitMock).toHaveBeenCalledWith('/repos/target-repo');
  });

  it('uses REPOS_ROOT-based path for execute when prUrl is provided', async () => {
    const prUrl = 'https://github.com/owner/target-repo/pull/123';
    parsePullRequestUrlMock.mockReturnValue({
      owner: 'owner',
      repo: 'target-repo',
      prNumber: 123,
      repositoryName: 'owner/target-repo',
    });
    resolveRepoPathFromPrUrlMock.mockReturnValue('/repos/target-repo');
    metadataManagerMock.getPendingComments.mockResolvedValue([
      {
        comment: {
          id: 300,
          node_id: 'N300',
          path: 'src/core/config.ts',
          line: 5,
          body: 'Fix typo',
          user: 'alice',
          created_at: '2025-01-20T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z',
        },
        status: 'pending',
      },
    ]);
    analyzerMock.analyze.mockResolvedValue({
      success: true,
      resolution: {
        type: 'code_change',
        confidence: 'high',
        changes: [{ path: 'src/core/config.ts', change_type: 'modify', content: 'export {}' }],
        reply: 'Resolved',
      },
      inputTokens: 10,
      outputTokens: 5,
    });
    applierMock.apply.mockResolvedValue({ success: true, applied_files: [], skipped_files: [] });
    githubClientMock.commentClient.replyToPRReviewComment.mockResolvedValue({
      id: 901,
      html_url: 'https://example.com/comment/901',
    });
    metadataManagerMock.getSummary.mockResolvedValue({
      total: 1,
      by_status: { pending: 0, in_progress: 0, completed: 1, skipped: 0, failed: 0 },
      by_type: { code_change: 1, reply: 0, discussion: 0, skip: 0 },
    });

    await handlePRCommentExecuteCommand({ prUrl } as any);

    expect(resolveRepoPathFromPrUrlMock).toHaveBeenCalledWith(prUrl);
    expect(mockGetRepoRoot).not.toHaveBeenCalled();
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repos/target-repo', 123);
    expect(applierConstructorMock).toHaveBeenCalledWith('/repos/target-repo');
    expect(simpleGitMock).toHaveBeenCalledWith('/repos/target-repo');
  });

  it('finalizes using REPOS_ROOT-based path when prUrl is provided', async () => {
    const prUrl = 'https://github.com/owner/finalize-repo/pull/123';
    parsePullRequestUrlMock.mockReturnValue({
      owner: 'owner',
      repo: 'finalize-repo',
      prNumber: 123,
      repositoryName: 'owner/finalize-repo',
    });
    resolveRepoPathFromPrUrlMock.mockReturnValue('/repos/finalize-repo');
    metadataManagerMock.getCompletedComments.mockResolvedValue([
      {
        comment: { id: 400, thread_id: 'PRRT_final' },
        status: 'completed',
      },
    ]);
    metadataManagerMock.getMetadataPath.mockReturnValue(
      '/repos/finalize-repo/.ai-workflow/pr-123/comment-resolution-metadata.json',
    );
    githubClientMock.commentClient.resolveReviewThread.mockResolvedValue(true);

    await handlePRCommentFinalizeCommand({ prUrl, skipCleanup: false } as any);

    expect(resolveRepoPathFromPrUrlMock).toHaveBeenCalledWith(prUrl);
    expect(mockGetRepoRoot).not.toHaveBeenCalled();
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repos/finalize-repo', 123);
    expect(metadataManagerMock.setResolved).toHaveBeenCalledWith('400');
    expect(simpleGitMock).toHaveBeenCalledWith('/repos/finalize-repo');
  });

  it('resolves PR number from issue option and uses current repository path', async () => {
    githubClientMock.getPullRequestNumber.mockResolvedValue(321);
    githubClientMock.getPullRequestInfo.mockImplementation(async (prNumber: number) => ({
      number: prNumber,
      url: `https://github.com/owner/repo/pull/${prNumber}`,
      title: 'Issue-backed PR',
      head: 'feature/issue',
      base: 'main',
      state: 'open',
      node_id: `PR${prNumber}`,
    }));
    metadataManagerMock.getMetadataPath.mockReturnValue(
      '/repo/.ai-workflow/pr-321/comment-resolution-metadata.json',
    );

    await handlePRCommentInitCommand({ issue: '789' } as any);

    expect(githubClientMock.getPullRequestNumber).toHaveBeenCalledWith(789);
    expect(mockGetRepoRoot).toHaveBeenCalledTimes(1);
    expect(resolveRepoPathFromPrUrlMock).not.toHaveBeenCalled();
    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repo', 321);
  });

  it('reports a missing repository under REPOS_ROOT when resolving prUrl', async () => {
    const prUrl = 'https://github.com/owner/nonexistent-repo/pull/123';
    const error = new Error(
      "Repository 'nonexistent-repo' not found under /repos.\nPlease set REPOS_ROOT environment variable or clone the repository.",
    );
    parsePullRequestUrlMock.mockReturnValue({
      owner: 'owner',
      repo: 'nonexistent-repo',
      prNumber: 123,
      repositoryName: 'owner/nonexistent-repo',
    });
    resolveRepoPathFromPrUrlMock.mockImplementation(() => {
      throw error;
    });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    await handlePRCommentInitCommand({ prUrl } as any);

    expect(resolveRepoPathFromPrUrlMock).toHaveBeenCalledWith(prUrl);
    expect(metadataManagerConstructorMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("nonexistent-repo"));
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('/repos'));

    exitSpy.mockRestore();
    loggerSpy.mockRestore();
  });

  it('exits with error when an invalid PR URL is provided', async () => {
    const prUrl = 'https://invalid-url';
    const parseError = new Error(`Invalid GitHub Pull Request URL: ${prUrl}`);
    parsePullRequestUrlMock.mockImplementation(() => {
      throw parseError;
    });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    await handlePRCommentInitCommand({ prUrl } as any);

    expect(parsePullRequestUrlMock).toHaveBeenCalledWith(prUrl);
    expect(resolveRepoPathFromPrUrlMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid GitHub Pull Request URL'));

    exitSpy.mockRestore();
    loggerSpy.mockRestore();
  });

  it('handles I/O error during metadata existence check', async () => {
    const ioError = new Error('EACCES: permission denied');
    metadataManagerMock.exists.mockRejectedValue(ioError);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123' } as any);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'));

    exitSpy.mockRestore();
    loggerSpy.mockRestore();
  });
});
