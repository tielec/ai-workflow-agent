import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import { promises as nodeFsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../../src/utils/logger.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';
import type { PRCommentExecuteOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));
const resolveRepoPathFromPrUrlMock = jest.fn(() => '/repo');
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const simpleGitAddConfigMock = jest.fn();
const simpleGitPushMock = jest.fn();
const codeChangeApplyMock = jest.fn();
const githubReplyMock = jest.fn();

let handlePRCommentExecuteCommand: (options: PRCommentExecuteOptions) => Promise<void>;
let pendingComments: CommentMetadata[] = [];
let currentMetadataManager: any;
let processExitSpy: jest.SpyInstance;
let responsePlan: any;
const repoRoot = path.join(process.cwd(), '.tmp', 'execute-command-tests');

const buildComment = (
  id: number,
  type: 'code_change' | 'reply' | 'discussion' | 'skip' = 'reply',
  body = 'Please address this',
): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    path: type === 'code_change' ? 'src/a.ts' : undefined,
    line: 10,
    body,
    user: 'reviewer',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    diff_hunk: '@@ -1,1 +1,1 @@',
  },
  status: 'pending',
  started_at: null,
  completed_at: null,
  retry_count: 0,
  resolution: null,
  reply_comment_id: null,
  resolved_at: null,
  error: null,
});

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      currentMetadataManager = {
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue({ pr: { branch: 'feature/mock-branch' } }),
        getPendingComments: jest.fn(async () => pendingComments),
        getSummary: jest.fn().mockResolvedValue({
          by_status: { completed: 0, skipped: 0, failed: 0 },
        }),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        setReplyCommentId: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        incrementRetryCount: jest.fn().mockResolvedValue(0),
        updateCostTracking: jest.fn().mockResolvedValue(undefined),
      };
      return currentMetadataManager;
    }),
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: codeChangeApplyMock,
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
      getRepositoryInfo: () => ({ repositoryName: 'owner/repo' }),
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      getGitCommitUserName: jest.fn(() => 'Test User'),
      getGitCommitUserEmail: jest.fn(() => 'test@example.com'),
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
      addConfig: simpleGitAddConfigMock,
      push: simpleGitPushMock,
    })),
  }));

  const module = await import('../../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = module.handlePRCommentExecuteCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'code_change'), buildComment(101, 'reply')];
  currentMetadataManager = null;
  codeChangeApplyMock.mockReset();
  githubReplyMock.mockReset();
  githubReplyMock.mockResolvedValue({ id: 9999 });

  getRepoRootMock.mockResolvedValue(repoRoot);
  resolveRepoPathFromPrUrlMock.mockReturnValue(repoRoot);
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: 'src/a.ts' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as any);

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

  jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fs, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.endsWith(path.join('output', 'response-plan.json'))) {
      return JSON.stringify(responsePlan ?? {});
    }
    return 'file content';
  });

  jest.spyOn(nodeFsp, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.endsWith(path.join('output', 'response-plan.json'))) {
      return JSON.stringify(responsePlan ?? {});
    }
    return 'file content';
  });
  jest.spyOn(nodeFsp, 'writeFile').mockResolvedValue(undefined as any);
  jest.spyOn(nodeFsp, 'mkdir').mockResolvedValue(undefined as any);

  responsePlan = {
    pr_number: 123,
    comments: [],
  };
});

describe('handlePRCommentExecuteCommand', () => {
  it('mock setup is valid', () => {
    // Placeholder test to satisfy Jest requirement
    expect(handlePRCommentExecuteCommand).toBeDefined();
    expect(buildComment).toBeDefined();
  });

  it('should skip comments that already have a reply', async () => {
    const commentWithReply = { ...buildComment(100, 'reply'), reply_comment_id: 101 };
    pendingComments = [commentWithReply];
    responsePlan = {
      pr_number: 123,
      comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Test reply' }],
    };

    await handlePRCommentExecuteCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'skipped',
      undefined,
      'Already replied',
    );
    expect(githubReplyMock).not.toHaveBeenCalled();
  });

  it('should process comments without a reply normally', async () => {
    const commentWithoutReply = { ...buildComment(102, 'reply'), reply_comment_id: null };
    pendingComments = [commentWithoutReply];
    responsePlan = {
      pr_number: 123,
      comments: [{ comment_id: '102', type: 'reply', confidence: 'high', reply_message: 'Test reply' }],
    };

    await handlePRCommentExecuteCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(githubReplyMock).toHaveBeenCalledTimes(1);
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '102',
      'completed',
      expect.any(Object),
    );
  });

  it('should log skip but not update metadata in dry-run mode', async () => {
    const commentWithReply = { ...buildComment(103, 'reply'), reply_comment_id: 104 };
    pendingComments = [commentWithReply];
    responsePlan = { pr_number: 123, comments: [] };

    await handlePRCommentExecuteCommand({
      prUrl: 'https://github.com/owner/repo/pull/123',
      dryRun: true,
    });

    expect(logger.info).toHaveBeenCalledWith(
      'Comment #103 already has a reply (reply ID: 104). Skipping.',
    );
    expect(currentMetadataManager.updateCommentStatus).not.toHaveBeenCalled();
    expect(githubReplyMock).not.toHaveBeenCalled();
  });

  it('should log correct message format when skipping replied comment', async () => {
    const commentWithReply = { ...buildComment(200, 'reply'), reply_comment_id: 201 };
    pendingComments = [commentWithReply];
    responsePlan = { pr_number: 123, comments: [] };

    await handlePRCommentExecuteCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(logger.info).toHaveBeenCalledWith(
      'Comment #200 already has a reply (reply ID: 201). Skipping.',
    );
  });

  it('should process only unreplied comments when mixed with replied ones', async () => {
    const repliedComment = { ...buildComment(300, 'reply'), reply_comment_id: 301 };
    const unrepliedComment = { ...buildComment(302, 'reply'), reply_comment_id: null };
    pendingComments = [repliedComment, unrepliedComment];
    responsePlan = {
      pr_number: 123,
      comments: [{ comment_id: '302', type: 'reply', confidence: 'high', reply_message: 'Reply' }],
    };

    await handlePRCommentExecuteCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '300',
      'skipped',
      undefined,
      'Already replied',
    );
    expect(githubReplyMock).toHaveBeenCalledTimes(1);
  });
});
