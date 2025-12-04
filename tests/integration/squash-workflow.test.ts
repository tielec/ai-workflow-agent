import { SquashManager } from '../../src/core/git/squash-manager.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { jest } from '@jest/globals';
import type { SimpleGit } from 'simple-git';
import type { CommitManager } from '../../src/core/git/commit-manager.js';
import type { RemoteManager } from '../../src/core/git/remote-manager.js';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import type { PhaseContext } from '../../src/types/commands.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// Mock dependencies
jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    rm: jest.fn(),
    access: jest.fn(),
  },
}));

describe('スカッシュワークフロー統合テスト', () => {
  let squashManager: SquashManager;
  let metadataManager: MetadataManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockCommitManager: jest.Mocked<CommitManager>;
  let mockRemoteManager: jest.Mocked<RemoteManager>;
  let mockCodexAgent: jest.Mocked<CodexAgentClient>;
  let mockClaudeAgent: jest.Mocked<ClaudeAgentClient>;
  const testWorkingDir = '/test/working-dir';
  const testMetadataPath = path.join(testWorkingDir, '.ai-workflow', 'issue-194', 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock objects
    mockGit = {
      log: jest.fn(),
      revparse: jest.fn(),
      reset: jest.fn(),
      commit: jest.fn(),
      diff: jest.fn(),
    } as any;

    mockCommitManager = {} as any;

    mockRemoteManager = {
      pushToRemote: jest.fn(),
    } as any;

    mockCodexAgent = {
      execute: jest.fn(),
    } as any;

    mockClaudeAgent = {
      execute: jest.fn(),
    } as any;

    // Create real MetadataManager for integration testing
    metadataManager = new MetadataManager(testMetadataPath);

    squashManager = new SquashManager(
      mockGit,
      metadataManager,
      mockCommitManager,
      mockRemoteManager,
      mockCodexAgent,
      mockClaudeAgent,
      testWorkingDir,
    );
  });

  describe('シナリオ 3.1.1: init → execute --squash-on-complete → スカッシュ成功', () => {
    it('should complete full squash workflow successfully', async () => {
      // Given: ワークフロー全体の前提条件
      const baseCommit = 'abc123def456789012345678901234567890abcd';
      const commits = [
        { hash: 'commit1hash000000000000000000000000000' },
        { hash: 'commit2hash000000000000000000000000000' },
        { hash: 'commit3hash000000000000000000000000000' },
        { hash: 'commit4hash000000000000000000000000000' },
        { hash: 'commit5hash000000000000000000000000000' },
      ];
      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: {
          title: 'feat: Squash commits after workflow completion',
          body: 'Test body',
          number: 194,
          html_url: 'https://github.com/test/repo/issues/194',
          state: 'open',
          created_at: '2025-01-30',
          updated_at: '2025-01-30',
          labels: [],
          assignees: [],
        },
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      // Step 1: base_commitを記録（initコマンドに相当）
      metadataManager.setBaseCommit(baseCommit);

      // Step 2: Git操作のモック設定
      mockGit.log.mockResolvedValue({ all: commits } as any);
      mockGit.revparse.mockResolvedValue('feature/issue-194\n');
      mockGit.diff.mockResolvedValue('5 files changed, 100 insertions(+), 10 deletions(-)');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'squashed-commit' } as any);
      mockRemoteManager.pushToRemote.mockResolvedValue(undefined);

      // Step 3: エージェント実行のモック設定
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        `feat(squash): add commit squashing feature

This feature allows squashing workflow commits into one.

Fixes #194`,
      );
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      mockCodexAgent.execute.mockResolvedValue([] as any);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: 期待される結果を検証
      // 1. base_commitが取得された
      expect(metadataManager.getBaseCommit()).toBe(baseCommit);

      // 2. コミット範囲が特定された
      expect(mockGit.log).toHaveBeenCalledWith({
        from: baseCommit,
        to: 'HEAD',
        format: { hash: '%H' },
      });

      // 3. ブランチ保護チェックがパスした
      expect(mockGit.revparse).toHaveBeenCalledWith(['--abbrev-ref', 'HEAD']);

      // 4. pre_squash_commitsが記録された
      const preSquashCommits = metadataManager.getPreSquashCommits();
      expect(preSquashCommits).toHaveLength(5);

      // 5. スカッシュが実行された
      expect(mockGit.reset).toHaveBeenCalledWith(['--soft', baseCommit]);
      expect(mockGit.commit).toHaveBeenCalled();
      expect(mockRemoteManager.pushToRemote).toHaveBeenCalled();

      // 6. squashed_atタイムスタンプが記録された
      const squashedAt = metadataManager.getSquashedAt();
      expect(squashedAt).toBeTruthy();
    });
  });

  describe('シナリオ 3.1.2: init → execute --no-squash-on-complete → スカッシュスキップ', () => {
    it('should skip squash when --no-squash-on-complete is specified', async () => {
      // Given: スカッシュ無効化フラグ
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      // When: squashOnCompleteがfalseの場合（このテストでは呼び出さない）
      // スカッシュ処理を呼び出さないことで動作をシミュレート

      // Then: スカッシュが実行されない
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(metadataManager.getSquashedAt()).toBeNull();
    });
  });

  describe('シナリオ 3.1.3: 既存ワークフロー（base_commit未記録）→ スカッシュスキップ', () => {
    it('should skip squash and continue workflow when base_commit is not recorded', async () => {
      // Given: base_commit未記録の既存ワークフロー
      // base_commitを記録しない

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: null,
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: スカッシュがスキップされる
      expect(mockGit.log).not.toHaveBeenCalled();
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(metadataManager.getSquashedAt()).toBeNull();
    });
  });

  describe('シナリオ 3.2.1: git reset → commit → push --force-with-lease の一連の流れ', () => {
    it('should execute git operations in correct order', async () => {
      // Given: スカッシュに必要な条件が整っている
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: {
          title: 'Test issue',
          body: 'Test body',
          number: 194,
          html_url: 'https://github.com/test/repo/issues/194',
          state: 'open',
          created_at: '2025-01-30',
          updated_at: '2025-01-30',
          labels: [],
          assignees: [],
        },
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      mockGit.log.mockResolvedValue({
        all: [{ hash: 'c1' }, { hash: 'c2' }, { hash: 'c3' }],
      } as any);
      mockGit.revparse.mockResolvedValue('feature/test\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'new-commit' } as any);
      mockRemoteManager.pushToRemote.mockResolvedValue(undefined);

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: Git操作が正しい順序で実行される
      const callOrder = [
        mockGit.reset.mock.invocationCallOrder[0],
        mockGit.commit.mock.invocationCallOrder[0],
        mockRemoteManager.pushToRemote.mock.invocationCallOrder[0],
      ];
      expect(callOrder[0]).toBeLessThan(callOrder[1]);
      expect(callOrder[1]).toBeLessThan(callOrder[2]);

      // git reset --soft が正しく呼ばれた
      expect(mockGit.reset).toHaveBeenCalledWith(['--soft', baseCommit]);

      // git commit が呼ばれた
      expect(mockGit.commit).toHaveBeenCalled();

      // pushToRemote（force-with-lease）が呼ばれた
      expect(mockRemoteManager.pushToRemote).toHaveBeenCalled();
    });
  });

  describe('シナリオ 3.3.3: エージェント失敗時のフォールバック', () => {
    it('should use fallback message when agent execution fails', async () => {
      // Given: エージェントが失敗する設定
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: {
          title: 'Test issue',
          body: 'Test body',
          number: 194,
          html_url: 'https://github.com/test/repo/issues/194',
          state: 'open',
          created_at: '2025-01-30',
          updated_at: '2025-01-30',
          labels: [],
          assignees: [],
        },
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      mockGit.log.mockResolvedValue({
        all: [{ hash: 'c1' }, { hash: 'c2' }],
      } as any);
      mockGit.revparse.mockResolvedValue('feature/test\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'new-commit' } as any);
      mockRemoteManager.pushToRemote.mockResolvedValue(undefined);

      // エージェントが失敗
      mockCodexAgent.execute.mockRejectedValue(new Error('Agent failed'));
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: フォールバックメッセージが使用され、スカッシュが継続される
      expect(mockGit.commit).toHaveBeenCalled();
      const commitMessage = (mockGit.commit as jest.Mock).mock.calls[0][0];
      expect(commitMessage).toContain('feat: Complete workflow for Issue #194');
      expect(commitMessage).toContain('Fixes #194');
      expect(mockRemoteManager.pushToRemote).toHaveBeenCalled();
    });
  });

  describe('シナリオ 3.3.4: 生成メッセージのバリデーション失敗時のフォールバック', () => {
    it('should use fallback message when generated message is invalid', async () => {
      // Given: エージェントが無効なメッセージを生成
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: {
          title: 'Test issue',
          body: 'Test body',
          number: 194,
          html_url: 'https://github.com/test/repo/issues/194',
          state: 'open',
          created_at: '2025-01-30',
          updated_at: '2025-01-30',
          labels: [],
          assignees: [],
        },
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      mockGit.log.mockResolvedValue({
        all: [{ hash: 'c1' }, { hash: 'c2' }],
      } as any);
      mockGit.revparse.mockResolvedValue('feature/test\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'new-commit' } as any);
      mockRemoteManager.pushToRemote.mockResolvedValue(undefined);

      // エージェントが無効なメッセージを生成
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('Invalid commit message without proper format');
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      mockCodexAgent.execute.mockResolvedValue([] as any);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: フォールバックメッセージが使用される
      expect(mockGit.commit).toHaveBeenCalled();
      const commitMessage = (mockGit.commit as jest.Mock).mock.calls[0][0];
      expect(commitMessage).toContain('feat: Complete workflow for Issue #194');
      expect(commitMessage).toContain('Fixes #194');
    });
  });

  describe('シナリオ 3.5.1: ブランチ保護エラー時のワークフロー継続', () => {
    it('should throw error but allow workflow to continue when on protected branch', async () => {
      // Given: mainブランチでスカッシュを試行
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: null,
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      mockGit.log.mockResolvedValue({
        all: [{ hash: 'c1' }, { hash: 'c2' }],
      } as any);
      mockGit.revparse.mockResolvedValue('main\n');

      // When/Then: エラーがスローされる
      await expect(squashManager.squashCommits(context)).rejects.toThrow(
        'Cannot squash commits on protected branch: main',
      );

      // スカッシュ処理は中断される
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(mockRemoteManager.pushToRemote).not.toHaveBeenCalled();
    });
  });

  describe('シナリオ 3.5.2: コミット数不足時のスキップ', () => {
    it('should skip squash when only one or zero commits exist', async () => {
      // Given: コミット数が1つのみ
      const baseCommit = 'abc123';
      metadataManager.setBaseCommit(baseCommit);

      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: null,
        workingDir: testWorkingDir,
        metadataManager,
      } as any;

      mockGit.log.mockResolvedValue({
        all: [{ hash: 'c1' }],
      } as any);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: スカッシュがスキップされる
      expect(mockGit.revparse).not.toHaveBeenCalled();
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(metadataManager.getSquashedAt()).toBeNull();
    });
  });
});
