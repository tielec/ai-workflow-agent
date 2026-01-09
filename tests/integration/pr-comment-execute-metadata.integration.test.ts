import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../../src/utils/logger.js';
import type { CommentResolutionStatus, ReviewComment } from '../../src/types/pr-comment.js';

const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));
const resolveRepoPathFromPrUrlMock = jest.fn();
const getRepoRootMock = jest.fn<() => Promise<string>>();
const githubReplyMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const simpleGitAddConfigMock = jest.fn();
const simpleGitPushMock = jest.fn();
const codeChangeApplyMock = jest.fn();

let handlePRCommentExecuteCommand: typeof import('../../src/commands/pr-comment/execute.js')['handlePRCommentExecuteCommand'];
let PRCommentMetadataManager: typeof import('../../src/core/pr-comment/metadata-manager.js')['PRCommentMetadataManager'];
let workspace: string;
let processExitSpy: jest.SpyInstance;

const prNumber = 123;
const prUrl = 'https://github.com/owner/repo/pull/123';

const buildReviewComment = (id: number): ReviewComment => ({
  id,
  node_id: `node-${id}`,
  path: 'src/example.ts',
  line: 10,
  body: `Comment ${id}`,
  user: 'reviewer',
  created_at: '2025-01-20T00:00:00Z',
  updated_at: '2025-01-20T00:00:00Z',
  diff_hunk: '@@ -1,1 +1,1 @@',
});

const writeResponsePlan = async (commentIds: number[]): Promise<void> => {
  const planPath = path.join(workspace, '.ai-workflow', `pr-${prNumber}`, 'output', 'response-plan.json');
  await fs.ensureDir(path.dirname(planPath));
  await fs.writeJson(
    planPath,
    {
      pr_number: prNumber,
      analyzed_at: '2025-01-21T00:00:00Z',
      analyzer_agent: 'test-agent',
      comments: commentIds.map((id) => ({
        comment_id: String(id),
        type: 'reply',
        confidence: 'high',
        reply_message: `reply for ${id}`,
      })),
    },
    { spaces: 2 },
  );
};

const prepareMetadata = async (
  comments: Array<{
    id: number;
    status?: CommentResolutionStatus;
    replyCommentId?: number | null;
  }>,
): Promise<string> => {
  const manager = new PRCommentMetadataManager(workspace, prNumber);
  await manager.initialize(
    {
      number: prNumber,
      url: prUrl,
      title: 'Integration PR',
      branch: 'feature/integration',
      base_branch: 'main',
      state: 'open',
    },
    {
      owner: 'owner',
      repo: 'repo',
      path: workspace,
      remote_url: 'git@github.com:owner/repo.git',
    },
    comments.map((comment) => buildReviewComment(comment.id)),
  );

  const metadataPath = path.join(workspace, '.ai-workflow', `pr-${prNumber}`, 'comment-resolution-metadata.json');
  const metadata = await fs.readJson(metadataPath);

  for (const comment of comments) {
    const key = String(comment.id);
    if (comment.replyCommentId !== undefined) {
      metadata.comments[key].reply_comment_id = comment.replyCommentId;
    }
    if (comment.status) {
      metadata.comments[key].status = comment.status;
    }
  }

  await fs.writeJson(metadataPath, metadata, { spaces: 2 });
  return metadataPath;
};

const spyOnPendingCommentsToReturnAll = () =>
  jest
    .spyOn(PRCommentMetadataManager.prototype, 'getPendingComments')
    .mockImplementation(async function () {
      const meta = await this.getMetadata();
      return Object.values(meta.comments);
    });

beforeAll(async () => {
  await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
      getRepositoryInfo: () => ({ repositoryName: 'owner/repo' }),
    })),
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: codeChangeApplyMock,
    })),
  }));

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      getGitCommitUserName: jest.fn(() => 'CI User'),
      getGitCommitUserEmail: jest.fn(() => 'ci@example.com'),
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

  const executeModule = await import('../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = executeModule.handlePRCommentExecuteCommand;
  ({ PRCommentMetadataManager } = await import('../../src/core/pr-comment/metadata-manager.js'));
});

beforeEach(async () => {
  jest.clearAllMocks();
  githubReplyMock.mockResolvedValue({ id: 9999 });
  simpleGitStatusMock.mockResolvedValue({ files: [] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  codeChangeApplyMock.mockResolvedValue({ success: true });
  parsePullRequestUrlMock.mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    prNumber,
    repositoryName: 'owner/repo',
  });

  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-comment-execute-int-'));
  resolveRepoPathFromPrUrlMock.mockReturnValue(workspace);
  getRepoRootMock.mockResolvedValue(workspace);

  processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(async () => {
  if (workspace) {
    await fs.remove(workspace);
  }
  if (processExitSpy) {
    processExitSpy.mockRestore();
  }
  jest.restoreAllMocks();
});

describe('handlePRCommentExecuteCommand integration for replied comments', () => {
  it('IT-001: 返信済みコメントを含むメタデータでskipし、ステータスとサマリーを更新する', async () => {
    const metadataPath = await prepareMetadata([
      { id: 100, replyCommentId: 101, status: 'pending' },
      { id: 102, replyCommentId: null, status: 'pending' },
    ]);
    await writeResponsePlan([100, 102]);

    const pendingSpy = spyOnPendingCommentsToReturnAll();
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

    await handlePRCommentExecuteCommand({ prUrl });

    const metadata = await fs.readJson(metadataPath);

    expect(infoSpy).toHaveBeenCalledWith(
      'Comment #100 already has a reply (reply ID: 101). Skipping.',
    );
    expect(metadata.comments['100'].status).toBe('skipped');
    expect(metadata.comments['100'].error).toBe('Already replied');
    expect(metadata.comments['102'].status).toBe('completed');
    expect(metadata.comments['102'].reply_comment_id).toBe(9999);
    expect(metadata.summary.by_status.skipped).toBe(1);
    expect(githubReplyMock).toHaveBeenCalledTimes(1);
    expect(processExitSpy).not.toHaveBeenCalled();

    pendingSpy.mockRestore();
  });

  it('IT-002: スキップされた件数がsummaryに反映される', async () => {
    const metadataPath = await prepareMetadata([
      { id: 200, replyCommentId: 201, status: 'pending' },
      { id: 201, replyCommentId: 202, status: 'pending' },
      { id: 202, replyCommentId: 203, status: 'pending' },
      { id: 203, replyCommentId: null, status: 'pending' },
      { id: 204, replyCommentId: null, status: 'pending' },
    ]);
    await writeResponsePlan([200, 201, 202, 203, 204]);

    const pendingSpy = spyOnPendingCommentsToReturnAll();
    jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);

    await handlePRCommentExecuteCommand({ prUrl });

    const metadata = await fs.readJson(metadataPath);

    expect(metadata.summary.by_status).toEqual({
      pending: 0,
      in_progress: 0,
      completed: 2,
      skipped: 3,
      failed: 0,
    });
    expect(metadata.comments['200'].status).toBe('skipped');
    expect(metadata.comments['201'].status).toBe('skipped');
    expect(metadata.comments['202'].status).toBe('skipped');
    expect(metadata.comments['203'].status).toBe('completed');
    expect(metadata.comments['204'].status).toBe('completed');
    expect(githubReplyMock).toHaveBeenCalledTimes(2);
    expect(processExitSpy).not.toHaveBeenCalled();

    pendingSpy.mockRestore();
  });

  it('IT-003: getPendingCommentsをバイパスしてもprocessComment内で返信済みが防御される', async () => {
    const metadataPath = await prepareMetadata([
      { id: 300, replyCommentId: 301, status: 'pending' },
    ]);
    await writeResponsePlan([300]);

    const pendingSpy = jest
      .spyOn(PRCommentMetadataManager.prototype, 'getPendingComments')
      .mockImplementation(async function () {
        const meta = await this.getMetadata();
        return [meta.comments['300']];
      });
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

    await handlePRCommentExecuteCommand({ prUrl });

    const metadata = await fs.readJson(metadataPath);

    expect(infoSpy).toHaveBeenCalledWith(
      'Comment #300 already has a reply (reply ID: 301). Skipping.',
    );
    expect(metadata.comments['300'].status).toBe('skipped');
    expect(metadata.comments['300'].error).toBe('Already replied');
    expect(metadata.summary.by_status.skipped).toBe(1);
    expect(githubReplyMock).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();

    pendingSpy.mockRestore();
  });
});
