import {
  describe,
  expect,
  jest,
  beforeEach,
  it,
} from '@jest/globals';
import { logger } from '../../src/utils/logger.js';

const metadataManagerMock = {
  exists: jest.fn(),
  load: jest.fn(),
  getCompletedComments: jest.fn(),
  setResolved: jest.fn(),
  cleanup: jest.fn(),
  getMetadataPath: jest.fn(),
};
const metadataManagerConstructorMock = jest
  .fn()
  .mockImplementation(() => metadataManagerMock);

const githubClientMock = {
  getRepositoryInfo: jest.fn(),
  commentClient: {
    resolveReviewThread: jest.fn(),
  },
};

const simpleGitMock = jest.fn();
const configMock = {
  getGitCommitUserName: jest.fn(),
  getGitCommitUserEmail: jest.fn(),
};
const mockGetRepoRoot = jest.fn();
const mockResolveRepoPathFromPrUrl = jest.fn();
const mockParsePullRequestUrl = jest.fn();

jest.unstable_mockModule(
  '../../src/core/pr-comment/metadata-manager.js',
  () => ({
    PRCommentMetadataManager: metadataManagerConstructorMock,
  }),
);

jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  GitHubClient: jest.fn().mockImplementation(() => githubClientMock),
}));

jest.unstable_mockModule('simple-git', () => ({
  default: (...args: any[]) => simpleGitMock(...args),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: configMock,
}));

jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  getRepoRoot: () => mockGetRepoRoot(),
  resolveRepoPathFromPrUrl: (...args: any[]) => mockResolveRepoPathFromPrUrl(...args),
  parsePullRequestUrl: (...args: any[]) => mockParsePullRequestUrl(...args),
}));

const { handlePRCommentFinalizeCommand } = await import(
  '../../src/commands/pr-comment/finalize.js',
);

let gitAddMock: jest.Mock;
let gitStatusMock: jest.Mock;
let gitCommitMock: jest.Mock;
let gitPushMock: jest.Mock;
let gitAddConfigMock: jest.Mock;

describe('pr-comment finalize command', () => {
  beforeEach(() => {
    metadataManagerConstructorMock.mockReset();
    metadataManagerConstructorMock.mockImplementation(() => metadataManagerMock);
    Object.values(metadataManagerMock).forEach(fn =>
      (fn as jest.Mock).mockReset(),
    );

    metadataManagerMock.exists.mockResolvedValue(true);
    metadataManagerMock.load.mockResolvedValue({
      pr: { branch: 'feature/branch' },
    });
    metadataManagerMock.getCompletedComments.mockResolvedValue([
      {
        comment: {
          id: 200,
          thread_id: 'PRRT_abc',
        },
        status: 'completed',
      },
    ]);
    metadataManagerMock.setResolved.mockResolvedValue(undefined);
    metadataManagerMock.cleanup.mockResolvedValue(undefined);
    metadataManagerMock.getMetadataPath.mockReturnValue(
      '/repo/.ai-workflow/pr-123/metadata.json',
    );

    githubClientMock.getRepositoryInfo.mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      repositoryName: 'owner/repo',
    });
    githubClientMock.commentClient.resolveReviewThread.mockResolvedValue(true);

    configMock.getGitCommitUserName.mockReturnValue('AI Workflow Bot');
    configMock.getGitCommitUserEmail.mockReturnValue('ai-workflow@example.com');

    mockGetRepoRoot.mockResolvedValue('/repo');
    mockResolveRepoPathFromPrUrl.mockReturnValue('/repo/path');
    mockParsePullRequestUrl.mockImplementation((url: string) => ({
      owner: 'owner',
      repo: 'repo',
      prNumber: Number.parseInt(url.match(/(\d+)/)?.[1] ?? '0', 10),
      repositoryName: 'owner/repo',
    }));

    gitAddMock = jest.fn().mockResolvedValue(undefined);
    gitStatusMock = jest.fn().mockResolvedValue({ files: [] });
    gitCommitMock = jest.fn().mockResolvedValue(undefined);
    gitPushMock = jest.fn().mockResolvedValue(undefined);
    gitAddConfigMock = jest.fn().mockResolvedValue(undefined);

    simpleGitMock.mockReset();
    simpleGitMock.mockReturnValue({
      add: gitAddMock,
      status: gitStatusMock,
      commit: gitCommitMock,
      push: gitPushMock,
      addConfig: gitAddConfigMock,
    });
  });

  // Ensures all cleanup artifacts trigger a commit + push while resolving threads.
  it('stages, commits, and pushes when cleanup removes workflow artifacts', async () => {
    gitStatusMock.mockResolvedValue({
      files: [{ path: '.ai-workflow/pr-123/metadata.json', working_dir: 'D' }],
    });

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(simpleGitMock).toHaveBeenCalledWith('/repo');
    expect(gitAddMock).toHaveBeenCalledWith('.');
    expect(gitStatusMock).toHaveBeenCalled();
    expect(gitCommitMock).toHaveBeenCalledWith(
      '[pr-comment] Finalize PR #123: Clean up workflow artifacts (1 threads resolved)',
    );
    expect(gitPushMock).toHaveBeenCalledWith('origin', 'HEAD:feature/branch');
    expect(githubClientMock.commentClient.resolveReviewThread).toHaveBeenCalledWith(
      'PRRT_abc',
    );
    expect(metadataManagerMock.setResolved).toHaveBeenCalledWith('200');
    expect(metadataManagerMock.cleanup).toHaveBeenCalledTimes(1);
  });

  // When git status reports nothing new, the command should skip commit/push and log the lack of changes.
  it('skips git commit when there are no tracked changes', async () => {
    const infoSpy = jest.spyOn(logger, 'info');

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(gitCommitMock).not.toHaveBeenCalled();
    expect(gitPushMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('No changes to commit.');
    infoSpy.mockRestore();
  });

  // Failures during `git add` should surface an error but still let thread resolution finish.
  it('logs an error when git.add fails but continues resolving threads', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const addError = new Error('permission denied');
    gitAddMock.mockRejectedValueOnce(addError);

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: permission denied'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Finalization may be incomplete. Please check Git status manually.',
    );
    expect(gitCommitMock).not.toHaveBeenCalled();
    expect(gitPushMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // Git commit failures need to be surfaced and should prevent any push attempt.
  it('logs an error when git.commit fails and avoids pushing', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    gitStatusMock.mockResolvedValue({
      files: [{ path: '.ai-workflow/pr-123/metadata.json', working_dir: 'D' }],
    });
    gitCommitMock.mockRejectedValueOnce(new Error('commit failed'));

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: commit failed'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Finalization may be incomplete. Please check Git status manually.',
    );
    expect(gitPushMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // Git push failures should also log the failure while keeping previous steps intact.
  it('logs an error when git.push fails after commit', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    gitStatusMock.mockResolvedValue({
      files: [{ path: '.ai-workflow/pr-123/metadata.json', working_dir: 'D' }],
    });
    gitPushMock.mockRejectedValueOnce(new Error('push rejected'));

    await handlePRCommentFinalizeCommand({ pr: '123', skipCleanup: false } as any);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Git operation failed: push rejected'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Finalization may be incomplete. Please check Git status manually.',
    );
    expect(gitPushMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
