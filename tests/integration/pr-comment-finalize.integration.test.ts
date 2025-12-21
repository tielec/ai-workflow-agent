import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import simpleGit from 'simple-git';
import { logger } from '../../src/utils/logger.js';
import { PRCommentMetadataManager } from '../../src/core/pr-comment/metadata-manager.js';
import type { ReviewComment } from '../../src/types/pr-comment.js';
import type { PRCommentFinalizeOptions } from '../../src/types/commands.js';

const TEST_BASE_DIR = path.join(process.cwd(), 'tests', 'temp', 'pr-comment-finalize-integration');
const REPOS_ROOT = path.join(TEST_BASE_DIR, 'repos');
const REMOTES_ROOT = path.join(TEST_BASE_DIR, 'remotes');
const CLONES_ROOT = path.join(TEST_BASE_DIR, 'clones');

const resolveReviewThreadMock = jest.fn();
const mockGitHubClient = {
  commentClient: {
    resolveReviewThread: resolveReviewThreadMock,
  },
};

let handlePRCommentFinalizeCommand: (options: PRCommentFinalizeOptions) => Promise<void>;
let originalReposRoot: string | undefined;

const buildComments = (count: number, prNumber: number): ReviewComment[] =>
  Array.from({ length: count }, (_, index) => {
    const commentId = 2000 + index;
    const timestamp = new Date().toISOString();
    return {
      id: commentId,
      node_id: `node-${commentId}`,
      thread_id: `thread-${commentId}`,
      path: '.ai-workflow/pr-123/sample.txt',
      line: 1,
      body: `Resolved comment ${index + 1}`,
      user: 'integration-bot',
      created_at: timestamp,
      updated_at: timestamp,
      pr_number: prNumber,
    } as ReviewComment;
  });

describe('Integration: pr-comment finalize command', () => {
  beforeAll(async () => {
    originalReposRoot = process.env.REPOS_ROOT;
    process.env.REPOS_ROOT = REPOS_ROOT;
    await fs.remove(TEST_BASE_DIR);
    await fs.ensureDir(REPOS_ROOT);
    await fs.ensureDir(REMOTES_ROOT);
    await fs.ensureDir(CLONES_ROOT);

    await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
      GitHubClient: jest.fn().mockImplementation(() => mockGitHubClient),
    }));

    const module = await import('../../src/commands/pr-comment/finalize.js');
    handlePRCommentFinalizeCommand = module.handlePRCommentFinalizeCommand;
  });

  beforeEach(async () => {
    await fs.ensureDir(REPOS_ROOT);
    await fs.ensureDir(REMOTES_ROOT);
    await fs.ensureDir(CLONES_ROOT);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    resolveReviewThreadMock.mockClear();
    await fs.emptyDir(REPOS_ROOT);
    await fs.emptyDir(REMOTES_ROOT);
    await fs.emptyDir(CLONES_ROOT);
  });

  afterAll(async () => {
    if (originalReposRoot === undefined) {
      delete process.env.REPOS_ROOT;
    } else {
      process.env.REPOS_ROOT = originalReposRoot;
    }
    await fs.remove(TEST_BASE_DIR);
  });

  const setupTestRepo = async (
    repoName: string,
    options: { branch?: string; prNumber?: number; commentsCount?: number } = {},
  ) => {
    const branch = options.branch ?? 'feature/pr-comment-finalize';
    const prNumber = options.prNumber ?? 123;
    const repoDir = path.join(REPOS_ROOT, repoName);

    await fs.remove(repoDir);
    await fs.ensureDir(repoDir);

    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig('user.name', 'Integration Tester');
    await git.addConfig('user.email', 'integration@example.com');

    await fs.writeFile(path.join(repoDir, 'README.md'), '# PR Comment Finalize Integration');
    await git.add('README.md');
    await git.commit('Initial commit');
    await git.checkoutLocalBranch(branch);

    const metadataDir = path.join(repoDir, '.ai-workflow', `pr-${prNumber}`);
    await fs.ensureDir(path.join(metadataDir, 'analyze'));
    await fs.ensureDir(path.join(metadataDir, 'output'));
    await fs.writeFile(path.join(metadataDir, 'analyze', 'output.json'), '[]');
    await fs.writeFile(path.join(metadataDir, 'output', 'result.md'), '# Result');

    const metadataManager = new PRCommentMetadataManager(repoDir, prNumber);
    const comments = buildComments(options.commentsCount ?? 2, prNumber);

    await metadataManager.initialize(
      {
        number: prNumber,
        url: `https://github.com/owner/${repoName}/pull/${prNumber}`,
        title: 'Integration PR comment cleanup',
        branch,
        base_branch: 'main',
        state: 'open',
      },
      {
        owner: 'owner',
        repo: repoName,
        path: repoDir,
        remote_url: `https://github.com/owner/${repoName}.git`,
      },
      comments,
      555,
    );

    for (const comment of comments) {
      await metadataManager.updateCommentStatus(String(comment.id), 'completed');
    }

    await git.add('.ai-workflow');
    await git.commit('Add PR comment artifacts');

    const remoteDir = path.join(REMOTES_ROOT, `${repoName}.git`);
    await fs.remove(remoteDir);
    await fs.ensureDir(remoteDir);
    await simpleGit(remoteDir).init(true);

    await git.addRemote('origin', remoteDir);
    await git.push('origin', branch);

    return {
      repoDir,
      remoteDir,
      metadataDir,
      branch,
      prNumber,
      comments,
    };
  };

  test('cleans up artifacts, commits, and pushes resolved changes', async () => {
    const repoName = 'pr-comment-finalize-cleanup';
    const { repoDir, metadataDir, remoteDir, branch, prNumber, comments } = await setupTestRepo(repoName, {
      commentsCount: 2,
    });

    const commandOptions: PRCommentFinalizeOptions = {
      prUrl: `https://github.com/owner/${repoName}/pull/${prNumber}`,
    };

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(await fs.pathExists(metadataDir)).toBe(false);

    const localGit = simpleGit(repoDir);
    const localLog = await localGit.log({ maxCount: 1 });
    expect(localLog.latest?.message).toContain(
      `[pr-comment] Finalize PR #${prNumber}: Clean up workflow artifacts (${comments.length} threads resolved)`,
    );

    const cloneDir = path.join(CLONES_ROOT, `${repoName}-clone`);
    await fs.remove(cloneDir);
    await simpleGit().clone(remoteDir, cloneDir, ['--branch', branch, '--single-branch']);
    const cloneLog = await simpleGit(cloneDir).log({ maxCount: 1 });
    expect(cloneLog.latest?.message).toContain(
      `[pr-comment] Finalize PR #${prNumber}: Clean up workflow artifacts (${comments.length} threads resolved)`,
    );
  });

  test('resolves GitHub threads for completed comments before cleanup', async () => {
    const repoName = 'pr-comment-finalize-github';
    const { prNumber, comments } = await setupTestRepo(repoName, { commentsCount: 3 });
    const commandOptions: PRCommentFinalizeOptions = {
      prUrl: `https://github.com/owner/${repoName}/pull/${prNumber}`,
    };

    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);

    await handlePRCommentFinalizeCommand(commandOptions);

    expect(resolveReviewThreadMock).toHaveBeenCalledTimes(comments.length);
    const calledThreadIds = resolveReviewThreadMock.mock.calls.map((args) => args[0]);
    expect(calledThreadIds).toEqual(comments.map((comment) => comment.thread_id));
    expect(infoSpy).toHaveBeenCalledWith(`Finalization completed. Resolved: ${comments.length} threads.`);

    infoSpy.mockRestore();
  });

  test('logs an error when git push fails after cleanup', async () => {
    const repoName = 'pr-comment-finalize-push-error';
    const { repoDir, metadataDir, prNumber } = await setupTestRepo(repoName, { commentsCount: 2 });
    const commandOptions: PRCommentFinalizeOptions = {
      prUrl: `https://github.com/owner/${repoName}/pull/${prNumber}`,
    };

    const git = simpleGit(repoDir);
    await git.removeRemote('origin');

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: number) => {
        throw new Error(`process.exit:${code}`);
      });
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

    await expect(handlePRCommentFinalizeCommand(commandOptions)).rejects.toThrow('process.exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.some((call) => (call[0] as string).includes('Failed to finalize'))).toBe(true);
    expect(await fs.pathExists(metadataDir)).toBe(false);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
