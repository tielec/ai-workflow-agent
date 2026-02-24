import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import { promises as fsp } from 'node:fs';
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

  await jest.unstable_mockModule('../../../src/core/git/git-config-helper.js', () => ({
    __esModule: true,
    ensureGitConfig: jest.fn().mockResolvedValue(undefined),
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

  getRepoRootMock.mockResolvedValue('/repo');
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: 'src/a.ts' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit(1)');
  }) as any);

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

  jest.spyOn(fsp, 'mkdir').mockResolvedValue(undefined as any);
  jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);
  jest.spyOn(fsp, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.endsWith(path.join('output', 'response-plan.json'))) {
      return JSON.stringify(responsePlan ?? {});
    }
    return 'file content';
  });

  jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fs, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.endsWith(path.join('output', 'response-plan.json'))) {
      return JSON.stringify(responsePlan ?? {});
    }
    return 'file content';
  });

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

  it('response-planのcomment_id重複を検出して警告し、処理対象を一意にする', async () => {
    pendingComments = [buildComment(100, 'reply')];
    responsePlan = {
      pr_number: 123,
      comments: [
        { comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'first', proposed_changes: [] },
        { comment_id: '100', type: 'code_change', confidence: 'high', reply_message: 'second', proposed_changes: [] },
      ],
    };

    await handlePRCommentExecuteCommand({ pr: '123', agent: 'auto' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate comment_id found in response-plan'),
    );
    expect(githubReplyMock).toHaveBeenCalledTimes(1);
  });

  it('reply_comment_idが既にあるコメントはスキップし、completedに更新する', async () => {
    const alreadyReplied = buildComment(100, 'reply');
    alreadyReplied.reply_comment_id = 555;
    pendingComments = [alreadyReplied];
    responsePlan = {
      pr_number: 123,
      comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'skip me', proposed_changes: [] }],
    };

    await handlePRCommentExecuteCommand({ pr: '123', agent: 'auto' });

    expect(githubReplyMock).not.toHaveBeenCalled();
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith('100', 'completed', undefined);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('already has a reply'),
    );
  });

  it('code_changeでproposed_changesが空の場合は警告しつつ返信のみを投稿する', async () => {
    pendingComments = [buildComment(200, 'code_change')];
    responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '200',
          type: 'code_change',
          confidence: 'high',
          reply_message: 'apply later',
          proposed_changes: [],
        },
      ],
    };

    await handlePRCommentExecuteCommand({ pr: '123', agent: 'auto' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("has type 'code_change' but no proposed_changes"),
    );
    expect(codeChangeApplyMock).not.toHaveBeenCalled();
    expect(githubReplyMock).toHaveBeenCalledTimes(1);
  });
});
