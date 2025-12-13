import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger.js';

let handlePRCommentInitCommand: (options: any) => Promise<void>;

const metadataManagerMock = {
  exists: jest.fn(),
  initialize: jest.fn(),
  getSummary: jest.fn(),
  getMetadataPath: jest.fn(),
};
const metadataManagerConstructorMock = jest.fn(() => metadataManagerMock);

const githubClientMock = {
  getRepositoryInfo: jest.fn(),
  getPullRequestInfo: jest.fn(),
  commentClient: {
    getUnresolvedPRReviewComments: jest.fn(),
    getPRReviewComments: jest.fn(),
  },
};

const parsePullRequestUrlMock = jest.fn();
const resolveRepoPathFromPrUrlMock = jest.fn();
const getRepoRootMock = jest.fn();

const gitAddConfigMock = jest.fn();
const gitAddMock = jest.fn();
const gitCommitMock = jest.fn();
const gitPushMock = jest.fn();
const gitRemoteMock = jest.fn();
const simpleGitMock = jest.fn(() => ({
  addConfig: gitAddConfigMock,
  add: gitAddMock,
  commit: gitCommitMock,
  push: gitPushMock,
  remote: gitRemoteMock,
}));

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: metadataManagerConstructorMock,
  }));
  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => githubClientMock),
  }));
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    parsePullRequestUrl: (...args: any[]) => parsePullRequestUrlMock(...args),
    resolveRepoPathFromPrUrl: (...args: any[]) => resolveRepoPathFromPrUrlMock(...args),
    getRepoRoot: (...args: any[]) => getRepoRootMock(...args),
  }));
  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: (...args: any[]) => simpleGitMock(...args),
  }));
  await jest.unstable_mockModule('../../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getGitCommitUserName: jest.fn(() => 'AI Workflow Bot'),
      getGitCommitUserEmail: jest.fn(() => 'ai-workflow@example.com'),
    },
  }));

  const module = await import('../../../src/commands/pr-comment/init.js');
  handlePRCommentInitCommand = module.handlePRCommentInitCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  parsePullRequestUrlMock.mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    prNumber: 123,
    repositoryName: 'owner/repo',
  });
  resolveRepoPathFromPrUrlMock.mockReturnValue('/repo');
  getRepoRootMock.mockResolvedValue('/repo');

  githubClientMock.getRepositoryInfo.mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    repositoryName: 'owner/repo',
  });
  githubClientMock.getPullRequestInfo.mockResolvedValue({
    number: 123,
    url: 'https://github.com/owner/repo/pull/123',
    title: 'Add PR comment handler',
    head: 'feature/pr-comment',
    base: 'main',
    state: 'open',
    node_id: 'PR123',
  });
  githubClientMock.commentClient.getUnresolvedPRReviewComments.mockResolvedValue([]);
  githubClientMock.commentClient.getPRReviewComments.mockResolvedValue([]);

  metadataManagerMock.exists.mockResolvedValue(false);
  metadataManagerMock.initialize.mockResolvedValue(undefined);
  metadataManagerMock.getSummary.mockResolvedValue({
    total: 0,
    by_status: { pending: 0, in_progress: 0, completed: 0, skipped: 0, failed: 0 },
    by_type: { code_change: 0, reply: 0, discussion: 0, skip: 0 },
  });
  metadataManagerMock.getMetadataPath.mockReturnValue(
    '/repo/.ai-workflow/pr-123/comment-resolution-metadata.json',
  );

  gitAddConfigMock.mockResolvedValue(undefined);
  gitAddMock.mockResolvedValue(undefined);
  gitCommitMock.mockResolvedValue(undefined);
  gitPushMock.mockResolvedValue(undefined);
  gitRemoteMock.mockResolvedValue('https://github.com/owner/repo.git');

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit called: ${code}`);
  }) as any);
});

describe('handlePRCommentInitCommand resume behavior', () => {
  it('initializes metadata when none exists', async () => {
    metadataManagerMock.exists.mockResolvedValue(false);

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(metadataManagerConstructorMock).toHaveBeenCalledWith('/repo', 123);
    expect(metadataManagerMock.initialize).toHaveBeenCalledTimes(1);
    expect(gitAddMock).toHaveBeenCalledWith('.ai-workflow/pr-123/comment-resolution-metadata.json');
    expect(gitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Initialize PR #123 comment resolution metadata',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Initialization completed'),
    );
  });

  it('skips initialization when metadata exists and force is not provided', async () => {
    metadataManagerMock.exists.mockResolvedValue(true);

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(metadataManagerMock.initialize).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Metadata already exists for PR #123. Skipping initialization.',
    );
    expect(logger.info).toHaveBeenCalledWith('Use --force to reinitialize.');
    expect(gitCommitMock).not.toHaveBeenCalled();
    expect(gitPushMock).not.toHaveBeenCalled();
  });

  it('reinitializes when force flag is provided even if metadata exists', async () => {
    metadataManagerMock.exists.mockResolvedValue(true);

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123', force: true });

    expect(logger.info).toHaveBeenCalledWith(
      'Metadata exists for PR #123. Reinitializing with --force.',
    );
    expect(metadataManagerMock.initialize).toHaveBeenCalledTimes(1);
    expect(gitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Initialize PR #123 comment resolution metadata',
    );
  });

  it('avoids git operations when initialization is skipped', async () => {
    metadataManagerMock.exists.mockResolvedValue(true);

    await handlePRCommentInitCommand({ prUrl: 'https://github.com/owner/repo/pull/123' });

    expect(gitAddMock).not.toHaveBeenCalled();
    expect(gitCommitMock).not.toHaveBeenCalled();
    expect(gitPushMock).not.toHaveBeenCalled();
  });
});
