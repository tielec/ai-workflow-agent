/**
 * 統合テスト: init コマンド - baseBranch オプション
 *
 * テスト対象:
 * - handleInitCommand(): --base-branch 指定時の分岐元チェックアウト
 * - リモート/ローカル既存ブランチがある場合の baseBranch 無視ロジック
 * - 存在しないベースブランチ指定時のバリデーション
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import simpleGit, { type SimpleGit } from 'simple-git';
import { handleInitCommand } from '../../src/commands/init.js';
import { logger } from '../../src/utils/logger.js';

const mockCommitWorkflowInit = jest.fn<any>().mockResolvedValue({
  success: true,
  commit_hash: 'abc1234',
});
const mockPushToRemote = jest.fn<any>().mockResolvedValue({ success: true });
const mockCommitPhaseOutput = jest.fn<any>().mockResolvedValue({
  success: true,
  commit_hash: 'abc1234',
});

jest.mock('../../src/core/git-manager.js', () => ({
  __esModule: true,
  GitManager: jest.fn().mockImplementation(() => ({
    commitWorkflowInit: mockCommitWorkflowInit,
    pushToRemote: mockPushToRemote,
    commitPhaseOutput: mockCommitPhaseOutput,
  })),
}));

const mockCheckExistingPr = jest.fn<any>().mockResolvedValue(null);
const mockGetIssue = jest.fn<any>().mockResolvedValue({ title: 'Issue title', labels: [] });
const mockCreatePullRequest = jest.fn<any>().mockResolvedValue({ success: true });
const mockGeneratePrBodyTemplate = jest.fn<any>().mockReturnValue('PR body');

jest.mock('../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: jest.fn().mockImplementation(() => ({
    checkExistingPr: mockCheckExistingPr,
    getIssue: mockGetIssue,
    createPullRequest: mockCreatePullRequest,
    generatePrBodyTemplate: mockGeneratePrBodyTemplate,
  })),
}));

async function createBareRepository(bareRepoPath: string): Promise<void> {
  await fs.ensureDir(bareRepoPath);
  const bareGit = simpleGit(bareRepoPath);
  await bareGit.init(true);
}

async function createWorkingRepository(
  rootDir: string,
  repoName: string,
  bareRepoPath: string,
): Promise<{ git: SimpleGit; repoPath: string }> {
  const repoPath = path.join(rootDir, repoName);
  await fs.ensureDir(repoPath);
  const git = simpleGit(repoPath);
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  await git.addRemote('origin', bareRepoPath);

  // 初期コミットを main に作成
  await fs.writeFile(path.join(repoPath, 'README.md'), '# Test Repository\n');
  await git.add('README.md');
  await git.commit('Initial commit');
  await git.checkoutLocalBranch('main');
  await git.push('origin', 'main');

  // develop ブランチを作成し、メインと異なるコミットを積む
  await git.checkoutLocalBranch('develop');
  await fs.writeFile(path.join(repoPath, 'develop.txt'), 'develop work\n');
  await git.add('develop.txt');
  await git.commit('Add develop work');
  await git.push('origin', 'develop');

  await git.checkout('main');
  return { git, repoPath };
}

describe('Integration: init command base branch option', () => {
  let testRoot: string;
  let repoName: string;
  let bareRepoPath: string;
  let git: SimpleGit;
  let repoPath: string;

  beforeEach(async () => {
    repoName = `init-base-branch-repo-${Date.now()}`;
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-workflow-init-base-'));
    bareRepoPath = path.join(testRoot, `${repoName}-bare.git`);
    await createBareRepository(bareRepoPath);
    const repoSetup = await createWorkingRepository(testRoot, repoName, bareRepoPath);
    git = repoSetup.git;
    repoPath = repoSetup.repoPath;

    process.env.REPOS_ROOT = testRoot;
  }, 30000);

  afterEach(async () => {
    delete process.env.REPOS_ROOT;
    jest.clearAllMocks();
    if (testRoot) {
      await fs.remove(testRoot);
    }
  });

  test(
    '指定した baseBranch(main) から新規ブランチを分岐する',
    async () => {
      const issueNumber = 9101;
      const targetBranch = `ai-workflow/issue-${issueNumber}`;
      const baseCommit = (await git.revparse(['main'])).trim();
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

      try {
        await handleInitCommand(
          `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
          undefined,
          false,
          'main',
        );

        const currentBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const branchHead = (await git.revparse([targetBranch])).trim();
        const parentCommit = (await git.revparse([`${targetBranch}^`])).trim();

        expect(currentBranch).toBe(targetBranch);
        expect(branchHead).not.toBe(baseCommit);
        expect(parentCommit).toBe(baseCommit);
        expect(infoSpy).toHaveBeenCalledWith('Branching from: main');
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
        infoSpy.mockRestore();
      }
    },
    30000,
  );

  test(
    '--base-branch 未指定時は現在のブランチから分岐する',
    async () => {
      const issueNumber = 9102;
      const targetBranch = `ai-workflow/issue-${issueNumber}`;

      await git.checkoutLocalBranch('feature/existing');
      await fs.writeFile(path.join(repoPath, 'existing.txt'), 'existing feature\n');
      await git.add('existing.txt');
      await git.commit('Add existing work');
      const currentCommit = (await git.revparse(['HEAD'])).trim();

      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);

      try {
        await handleInitCommand(
          `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
          undefined,
          false,
          undefined,
        );

        const activeBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const branchHead = (await git.revparse([targetBranch])).trim();
        const parentCommit = (await git.revparse([`${targetBranch}^`])).trim();

        expect(activeBranch).toBe(targetBranch);
        expect(parentCommit).toBe(currentCommit);
        expect(branchHead).not.toBe(currentCommit);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    },
    30000,
  );

  test(
    'develop を baseBranch に指定すると develop の HEAD から分岐する',
    async () => {
      const issueNumber = 9103;
      const targetBranch = `ai-workflow/issue-${issueNumber}`;
      const developCommit = (await git.revparse(['develop'])).trim();
      const mainCommit = (await git.revparse(['main'])).trim();
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);

      try {
        await handleInitCommand(
          `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
          undefined,
          false,
          'develop',
        );

        const activeBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const branchHead = (await git.revparse([targetBranch])).trim();
        const parentCommit = (await git.revparse([`${targetBranch}^`])).trim();

        expect(activeBranch).toBe(targetBranch);
        expect(parentCommit).toBe(developCommit);
        expect(branchHead).not.toBe(mainCommit);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    },
    30000,
  );

  test(
    'リモートブランチが既にある場合は baseBranch を無視して既存ブランチをチェックアウトする',
    async () => {
      const issueNumber = 9104;
      const targetBranch = `ai-workflow/issue-${issueNumber}`;

      await git.checkout('develop');
      await git.checkoutLocalBranch(targetBranch);
      await fs.writeFile(path.join(repoPath, 'remote.txt'), 'remote branch content\n');
      await git.add('remote.txt');
      await git.commit('Seed remote branch');
      const remoteCommit = (await git.revparse(['HEAD'])).trim();
      await git.push('origin', targetBranch);
      await git.checkout('main');
      await git.branch(['-D', targetBranch]);

      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);

      try {
        await handleInitCommand(
          `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
          undefined,
          false,
          'main',
        );

        const activeBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const branchHead = (await git.revparse([targetBranch])).trim();
        const parentCommit = (await git.revparse([`${targetBranch}^`])).trim();

        expect(activeBranch).toBe(targetBranch);
        expect(parentCommit).toBe(remoteCommit);
        expect(branchHead).not.toBe(remoteCommit);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    },
    30000,
  );

  test(
    'ローカルブランチが既にある場合は baseBranch を無視して既存ブランチに切り替える',
    async () => {
      const issueNumber = 9105;
      const targetBranch = `ai-workflow/issue-${issueNumber}`;

      await git.checkout('main');
      await git.checkoutLocalBranch(targetBranch);
      await fs.writeFile(path.join(repoPath, 'local.txt'), 'local branch content\n');
      await git.add('local.txt');
      await git.commit('Seed local branch');
      const localCommit = (await git.revparse(['HEAD'])).trim();
      await git.checkout('main');

      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);

      try {
        await handleInitCommand(
          `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
          undefined,
          false,
          'develop',
        );

        const activeBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        const branchHead = (await git.revparse([targetBranch])).trim();
        const parentCommit = (await git.revparse([`${targetBranch}^`])).trim();

        expect(activeBranch).toBe(targetBranch);
        expect(parentCommit).toBe(localCommit);
        expect(branchHead).not.toBe(localCommit);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    },
    30000,
  );

  test(
    '存在しない baseBranch を指定するとエラーを出して終了する',
    async () => {
      const issueNumber = 9106;
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit: ${code}`);
        }) as any);
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

      try {
        await expect(
          handleInitCommand(
            `https://github.com/test-owner/${repoName}/issues/${issueNumber}`,
            undefined,
            false,
            'nonexistent-base',
          ),
        ).rejects.toThrow('process.exit: 1');

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(
          errorSpy,
        ).toHaveBeenCalledWith("Error: Base branch 'nonexistent-base' not found");
      } finally {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
      }
    },
    30000,
  );
});
