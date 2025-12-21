import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger.js';
import type { PRCommentFinalizeOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  repositoryName: 'owner/repo',
  prNumber: 123,
}));
const resolveRepoPathFromPrUrlMock = jest.fn(() => '/repo');
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const simpleGitPushMock = jest.fn();
const simpleGitAddConfigMock = jest.fn();
const resolveReviewThreadMock = jest.fn();
const configGetGitCommitUserNameMock = jest.fn(() => 'Configured Bot');
const configGetGitCommitUserEmailMock = jest.fn(() => 'configured@example.com');

const metadataManagerExistsMock = jest.fn();
const metadataManagerLoadMock = jest.fn();
const metadataManagerGetCompletedCommentsMock = jest.fn();
const metadataManagerCleanupMock = jest.fn();
const metadataManagerSetResolvedMock = jest.fn();

let handlePRCommentFinalizeCommand: (options: PRCommentFinalizeOptions) => Promise<void>;
let infoSpy: jest.SpyInstance<unknown, unknown>;
let errorSpy: jest.SpyInstance<unknown, unknown>;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => ({
      exists: metadataManagerExistsMock,
      load: metadataManagerLoadMock,
      getCompletedComments: metadataManagerGetCompletedCommentsMock,
      cleanup: metadataManagerCleanupMock,
      setResolved: metadataManagerSetResolvedMock,
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        resolveReviewThread: resolveReviewThreadMock,
      },
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getGitCommitUserName: configGetGitCommitUserNameMock,
      getGitCommitUserEmail: configGetGitCommitUserEmailMock,
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
      push: simpleGitPushMock,
      addConfig: simpleGitAddConfigMock,
    })),
  }));

  const module = await import('../../../src/commands/pr-comment/finalize.js');
  handlePRCommentFinalizeCommand = module.handlePRCommentFinalizeCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  metadataManagerExistsMock.mockResolvedValue(true);
  metadataManagerLoadMock.mockResolvedValue({ pr: { branch: 'feature/mock-branch' } });
  metadataManagerGetCompletedCommentsMock.mockResolvedValue([
    {
      comment: {
        id: 'comment-1',
        thread_id: 'thread-1',
      },
    },
  ]);
  metadataManagerCleanupMock.mockResolvedValue(undefined);
  metadataManagerSetResolvedMock.mockResolvedValue(undefined);

  resolveReviewThreadMock.mockResolvedValue(undefined);

  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitStatusMock.mockResolvedValue({
    files: [{ path: '.ai-workflow/pr-123/', working_dir: 'D', index: ' ' }],
  });
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);

  parsePullRequestUrlMock.mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    repositoryName: 'owner/repo',
    prNumber: 123,
  });
  resolveRepoPathFromPrUrlMock.mockReturnValue('/repo');

  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  configGetGitCommitUserNameMock.mockImplementation(() => 'Configured Bot');
  configGetGitCommitUserEmailMock.mockImplementation(() => 'configured@example.com');
});

describe('handlePRCommentFinalizeCommand git flow', () => {
  const commandOptions: PRCommentFinalizeOptions = {
    prUrl: 'https://github.com/owner/repo/pull/123',
  };

  // Given tracked changes exist, all modifications should be staged before committing.
  it('stages all changes including deletions before committing', async () => {
    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitAddMock).toHaveBeenCalledWith('.');
  });

  // Given git status reports tracked files, expect a commit and push to the PR branch.
  it('commits and pushes when git status reports files', async () => {
    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Finalize PR #123: Clean up workflow artifacts (1 threads resolved)',
    );
    expect(simpleGitPushMock).toHaveBeenCalledWith('origin', 'HEAD:feature/mock-branch');
  });

  // Given no tracked changes, the command should skip committing and pushing.
  it('skips commit when git status reports no changes', async () => {
    simpleGitStatusMock.mockResolvedValue({ files: [] });

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitCommitMock).not.toHaveBeenCalled();
    expect(simpleGitPushMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('No changes to commit.');
  });

  // Given dry-run mode, expect no git commands to execute and a dry-run message.
  it('skips git commands in dry-run mode', async () => {
    await handlePRCommentFinalizeCommand({ ...commandOptions, dryRun: true });

    expect(simpleGitAddMock).not.toHaveBeenCalled();
    expect(simpleGitStatusMock).not.toHaveBeenCalled();
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
    expect(simpleGitPushMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('[DRY RUN COMPLETE] No actual changes were made.');
  });

  // Given there are no resolved comments, finalization should report the situation and skip git work.
  it('does not perform git operations when there are no resolved comments', async () => {
    metadataManagerGetCompletedCommentsMock.mockResolvedValueOnce([]);

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitAddMock).not.toHaveBeenCalled();
    expect(simpleGitStatusMock).not.toHaveBeenCalled();
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
    expect(simpleGitPushMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('No completed comments to finalize.');
  });

  // Given multiple resolved threads, the commit message should include the resolved count.
  it('includes the resolved count in the commit message when multiple threads are processed', async () => {
    metadataManagerGetCompletedCommentsMock.mockResolvedValueOnce([
      {
        comment: {
          id: 'comment-1',
          thread_id: 'thread-1',
        },
      },
      {
        comment: {
          id: 'comment-2',
          thread_id: 'thread-2',
        },
      },
      {
        comment: {
          id: 'comment-3',
          thread_id: 'thread-3',
        },
      },
    ]);

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(metadataManagerSetResolvedMock).toHaveBeenCalledTimes(3);
    expect(simpleGitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Finalize PR #123: Clean up workflow artifacts (3 threads resolved)',
    );
  });

  // Given configuration provides git user info, those values should be applied before git operations.
  it('configures git user information before staging changes', async () => {
    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.name', 'Configured Bot');
    expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.email', 'configured@example.com');
  });

  // Given metadata lacks PR branch information, pushing should be skipped and an error reported.
  it('logs an error and skips pushing when the PR branch metadata is missing', async () => {
    metadataManagerLoadMock.mockResolvedValueOnce({ pr: { branch: undefined } });
    metadataManagerLoadMock.mockResolvedValueOnce({ pr: { branch: undefined } });

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitPushMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('PR branch information is missing; cannot push finalized changes.');
  });

  // Given git user info is unavailable from config, defaults should be applied.
  it('falls back to default git user values when configuration is absent', async () => {
    configGetGitCommitUserNameMock.mockReturnValueOnce(null);
    configGetGitCommitUserEmailMock.mockReturnValueOnce(null);

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.name', 'AI Workflow Bot');
    expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.email', 'ai-workflow@example.com');
  });
});
