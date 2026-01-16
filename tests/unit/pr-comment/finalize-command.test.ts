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
const simpleGitRevparseMock = jest.fn();
const simpleGitLogMock = jest.fn();
const simpleGitResetMock = jest.fn();
const resolveReviewThreadMock = jest.fn();
const configGetGitCommitUserNameMock = jest.fn(() => 'Configured Bot');
const configGetGitCommitUserEmailMock = jest.fn(() => 'configured@example.com');
const fspRmMock = jest.fn<() => Promise<void>>();

const metadataManagerExistsMock = jest.fn();
const metadataManagerLoadMock = jest.fn();
const metadataManagerGetCompletedCommentsMock = jest.fn();
const metadataManagerCleanupMock = jest.fn();
const metadataManagerSetResolvedMock = jest.fn();
const metadataManagerGetBaseCommitMock = jest.fn();
const metadataManagerGetMetadataMock = jest.fn();

let handlePRCommentFinalizeCommand: (options: PRCommentFinalizeOptions) => Promise<void>;
let infoSpy: jest.SpyInstance<unknown, unknown>;
let errorSpy: jest.SpyInstance<unknown, unknown>;
let warnSpy: jest.SpyInstance<unknown, unknown>;

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
      getBaseCommit: metadataManagerGetBaseCommitMock,
      getMetadata: metadataManagerGetMetadataMock,
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

  await jest.unstable_mockModule('node:fs', () => ({
    __esModule: true,
    promises: {
      rm: fspRmMock,
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
      revparse: simpleGitRevparseMock,
      log: simpleGitLogMock,
      reset: simpleGitResetMock,
    })),
  }));

  const module = await import('../../../src/commands/pr-comment/finalize.js');
  handlePRCommentFinalizeCommand = module.handlePRCommentFinalizeCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  fspRmMock.mockReset();
  fspRmMock.mockResolvedValue(undefined);

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
  metadataManagerGetBaseCommitMock.mockReturnValue(undefined);
  metadataManagerGetMetadataMock.mockResolvedValue({
    summary: {
      total: 1,
      by_status: { completed: 1 },
      by_type: { code_change: 0, reply: 1 },
    },
    pr: { branch: 'feature/mock-branch' },
  });

  resolveReviewThreadMock.mockResolvedValue(undefined);

  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitStatusMock.mockResolvedValue({
    files: [{ path: '.ai-workflow/pr-123/', working_dir: 'D', index: ' ' }],
  });
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);
  simpleGitRevparseMock.mockResolvedValue('feature/mock-branch');
  simpleGitLogMock.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] });
  simpleGitResetMock.mockResolvedValue(undefined);

  parsePullRequestUrlMock.mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    repositoryName: 'owner/repo',
    prNumber: 123,
  });
  resolveRepoPathFromPrUrlMock.mockReturnValue('/repo');

  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
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

  it('squashes commits and force-pushes when --squash is enabled', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue('abc123def456789012345678901234567890abcd');
    metadataManagerGetMetadataMock.mockResolvedValue({
      summary: {
        total: 4,
        by_status: { completed: 4 },
        by_type: { code_change: 3, reply: 1 },
      },
      pr: { branch: 'feature/mock-branch' },
    });

    await handlePRCommentFinalizeCommand({ ...commandOptions, squash: true });

    expect(fspRmMock).toHaveBeenCalledWith(
      expect.stringContaining('.ai-workflow/pr-123/analyze'),
      { recursive: true, force: true },
    );
    expect(fspRmMock).toHaveBeenCalledWith(
      expect.stringContaining('.ai-workflow/pr-123/output'),
      { recursive: true, force: true },
    );
    expect(simpleGitAddMock).toHaveBeenCalledWith('.');
    expect(simpleGitResetMock).toHaveBeenCalledWith(['--soft', 'abc123def456789012345678901234567890abcd']);
    expect(simpleGitCommitMock).toHaveBeenCalledWith(
      expect.stringContaining('[pr-comment] Resolve PR #123 review comments'),
    );
    expect(simpleGitPushMock).toHaveBeenCalledWith(['--force-with-lease', 'origin', 'HEAD:feature/mock-branch']);
    expect(metadataManagerCleanupMock).toHaveBeenCalled();
    expect(simpleGitStatusMock).not.toHaveBeenCalled();
  });

  it('warns and falls back to standard finalize flow when base_commit is missing with --squash', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue(undefined);

    await handlePRCommentFinalizeCommand({ ...commandOptions, squash: true });

    expect(warnSpy).toHaveBeenCalledWith('base_commit not found in metadata. Skipping squash.');
    expect(simpleGitAddMock).toHaveBeenCalledWith('.');
    expect(simpleGitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Finalize PR #123: Clean up workflow artifacts (1 threads resolved)',
    );
    expect(simpleGitPushMock).toHaveBeenCalledWith('origin', 'HEAD:feature/mock-branch');
  });

  it('cleans intermediate workflow files and stages deletions before resetting for squash', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue('abc123def456789012345678901234567890abcd');

    await handlePRCommentFinalizeCommand({ ...commandOptions, squash: true });

    expect(fspRmMock).toHaveBeenCalledWith(
      expect.stringContaining('.ai-workflow/pr-123/analyze'),
      { recursive: true, force: true },
    );
    expect(fspRmMock).toHaveBeenCalledWith(
      expect.stringContaining('.ai-workflow/pr-123/output'),
      { recursive: true, force: true },
    );

    const rmCallOrders = fspRmMock.mock.invocationCallOrder;
    const addOrder = simpleGitAddMock.mock.invocationCallOrder[0];
    const resetOrder = simpleGitResetMock.mock.invocationCallOrder[0];

    expect(Math.max(...rmCallOrders)).toBeLessThan(addOrder);
    expect(addOrder).toBeLessThan(resetOrder);
  });

  it('handles missing intermediate directories gracefully during squash', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue('abc123def456789012345678901234567890abcd');

    await expect(handlePRCommentFinalizeCommand({ ...commandOptions, squash: true })).resolves.not.toThrow();
    expect(fspRmMock).toHaveBeenCalledTimes(2);
    expect(fspRmMock).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
  });

  it('builds squash commit message with co-author footer and no marketing text', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue('abc123def456789012345678901234567890abcd');
    metadataManagerGetMetadataMock.mockResolvedValue({
      summary: {
        total: 5,
        by_status: { completed: 4 },
        by_type: { code_change: 2, reply: 2 },
      },
      pr: { branch: 'feature/mock-branch' },
    });

    await handlePRCommentFinalizeCommand({ ...commandOptions, squash: true });

    const commitMessage = simpleGitCommitMock.mock.calls[0][0];
    expect(commitMessage).toContain('[pr-comment] Resolve PR #123 review comments (5 comments)');
    expect(commitMessage).toContain('- Addressed 4 review comments');
    expect(commitMessage).toContain('- Applied 2 code changes');
    expect(commitMessage).toContain('- Posted 2 replies');
    expect(commitMessage).toContain('Co-Authored-By: Claude <noreply@anthropic.com>');
    expect(commitMessage).not.toContain('Generated with Claude Code');
    expect(commitMessage).not.toContain('🤖');
  });

  it('does not clean intermediate files when squash is not requested', async () => {
    await handlePRCommentFinalizeCommand(commandOptions);

    expect(fspRmMock).not.toHaveBeenCalled();
    expect(simpleGitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Finalize PR #123: Clean up workflow artifacts (1 threads resolved)',
    );
  });

  it('skips squash when only a single commit exists after base_commit', async () => {
    metadataManagerGetBaseCommitMock.mockReturnValue('abc123def456789012345678901234567890abcd');
    simpleGitLogMock.mockResolvedValue({ all: [{ hash: 'single-commit' }] });

    await handlePRCommentFinalizeCommand({ ...commandOptions, squash: true });

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Only 1 commit(s) found. Skipping squash.'));
    expect(fspRmMock).not.toHaveBeenCalled();
    expect(simpleGitResetMock).not.toHaveBeenCalled();
    expect(simpleGitCommitMock).not.toHaveBeenCalledWith(expect.stringContaining('Resolve PR #123 review comments'));
  });
});
