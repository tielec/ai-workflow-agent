import { SquashManager } from '../../src/core/git/squash-manager.js';
import { jest } from '@jest/globals';
import type { SimpleGit } from 'simple-git';
import type { MetadataManager } from '../../src/core/metadata-manager.js';
import type { CommitManager } from '../../src/core/git/commit-manager.js';
import type { RemoteManager } from '../../src/core/git/remote-manager.js';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import type { PhaseContext } from '../../src/types/commands.js';

// Mock fs module before importing
const mockMkdir = jest.fn<() => Promise<void>>();
const mockReadFile = jest.fn<() => Promise<string>>();
const mockRm = jest.fn<() => Promise<void>>();
const mockAccess = jest.fn<() => Promise<void>>();

jest.mock('node:fs', () => ({
  promises: {
    mkdir: mockMkdir,
    readFile: mockReadFile,
    rm: mockRm,
    access: mockAccess,
  },
}));

describe('SquashManager', () => {
  let squashManager: SquashManager;
  let mockGit: any;
  let mockMetadataManager: any;
  let mockCommitManager: any;
  let mockRemoteManager: any;
  let mockCodexAgent: any;
  let mockClaudeAgent: any;
  const testWorkingDir = '/test/working-dir';

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

    mockMetadataManager = {
      getBaseCommit: jest.fn(),
      setPreSquashCommits: jest.fn(),
      setSquashedAt: jest.fn(),
    } as any;

    mockCommitManager = {} as any;

    mockRemoteManager = {
      pushToRemote: jest.fn(),
      forcePushToRemote: jest.fn(),
    } as any;

    mockCodexAgent = {
      executeTask: jest.fn<any>().mockResolvedValue(undefined),
    };

    mockClaudeAgent = {
      executeTask: jest.fn<any>().mockResolvedValue(undefined),
    };

    squashManager = new SquashManager(
      mockGit,
      mockMetadataManager,
      mockCommitManager,
      mockRemoteManager,
      mockCodexAgent,
      mockClaudeAgent,
      testWorkingDir,
    );
  });

  describe('getCommitsToSquash', () => {
    // テストケース 2.1.1: 正常系_複数コミット
    it('should return multiple commits from base_commit to HEAD', async () => {
      // Given: base_commit以降に3つのコミットが存在する
      const baseCommit = 'abc123def456789012345678901234567890abcd';
      const commits = [
        { hash: 'commit1hash000000000000000000000000000' },
        { hash: 'commit2hash000000000000000000000000000' },
        { hash: 'commit3hash000000000000000000000000000' },
      ];
      mockGit.log.mockResolvedValue({ all: commits } as any);

      // When: getCommitsToSquash を呼び出す
      const result = await (squashManager as any).getCommitsToSquash(baseCommit);

      // Then: 3つのコミットハッシュが配列で返される
      expect(result).toEqual([
        'commit1hash000000000000000000000000000',
        'commit2hash000000000000000000000000000',
        'commit3hash000000000000000000000000000',
      ]);
      expect(mockGit.log).toHaveBeenCalledWith({
        from: baseCommit,
        to: 'HEAD',
        format: { hash: '%H' },
      });
    });

    // テストケース 2.1.2: 正常系_1つのコミット
    it('should return single commit when only one commit exists after base_commit', async () => {
      // Given: base_commit以降に1つのコミットが存在する
      const baseCommit = 'abc123def456';
      const commits = [{ hash: 'commit1hash000000000000000000000000000' }];
      mockGit.log.mockResolvedValue({ all: commits } as any);

      // When: getCommitsToSquash を呼び出す
      const result = await (squashManager as any).getCommitsToSquash(baseCommit);

      // Then: 1つのコミットハッシュが配列で返される
      expect(result).toEqual(['commit1hash000000000000000000000000000']);
    });

    // テストケース 2.1.3: 異常系_無効なbase_commit
    it('should throw error when base_commit is invalid', async () => {
      // Given: 無効なbase_commitが指定される
      const invalidCommit = 'invalid_commit_hash';
      mockGit.log.mockRejectedValue(new Error('invalid revision'));

      // When/Then: エラーがスローされる
      await expect((squashManager as any).getCommitsToSquash(invalidCommit)).rejects.toThrow(
        'Failed to get commits to squash',
      );
    });

    // テストケース 2.1.4: 境界値_0コミット
    it('should return empty array when base_commit equals HEAD', async () => {
      // Given: base_commitとHEADが同じ
      const baseCommit = 'currentHEAD000000000000000000000000';
      mockGit.log.mockResolvedValue({ all: [] } as any);

      // When: getCommitsToSquash を呼び出す
      const result = await (squashManager as any).getCommitsToSquash(baseCommit);

      // Then: 空配列が返される
      expect(result).toEqual([]);
    });
  });

  describe('validateBranchProtection', () => {
    // テストケース 2.2.1: 正常系_featureブランチ
    it('should pass branch protection check for feature branch', async () => {
      // Given: 現在のブランチが feature/issue-194
      mockGit.revparse.mockResolvedValue('feature/issue-194\n');

      // When: validateBranchProtection を呼び出す
      // Then: エラーがスローされない
      await expect((squashManager as any).validateBranchProtection()).resolves.not.toThrow();
    });

    // テストケース 2.2.2: 異常系_mainブランチ
    it('should throw error for main branch', async () => {
      // Given: 現在のブランチが main
      mockGit.revparse.mockResolvedValue('main\n');

      // When/Then: エラーがスローされる
      await expect((squashManager as any).validateBranchProtection()).rejects.toThrow(
        'Cannot squash commits on protected branch: main',
      );
    });

    // テストケース 2.2.3: 異常系_masterブランチ
    it('should throw error for master branch', async () => {
      // Given: 現在のブランチが master
      mockGit.revparse.mockResolvedValue('master\n');

      // When/Then: エラーがスローされる
      await expect((squashManager as any).validateBranchProtection()).rejects.toThrow(
        'Cannot squash commits on protected branch: master',
      );
    });

    // テストケース 2.2.4: 異常系_Git操作失敗
    it('should throw error when git operation fails', async () => {
      // Given: git revparse がエラーを返す
      mockGit.revparse.mockRejectedValue(new Error('git command failed'));

      // When/Then: エラーがスローされる
      await expect((squashManager as any).validateBranchProtection()).rejects.toThrow(
        'Failed to check branch protection',
      );
    });
  });

  describe('isValidCommitMessage', () => {
    // テストケース 2.3.1: 正常系_Conventional Commits形式
    it('should validate correct Conventional Commits format', () => {
      // Given: 有効なConventional Commits形式のメッセージ
      const message = `feat(squash): add commit squashing feature

This feature allows squashing workflow commits into one.

Fixes #194`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: true が返される
      expect(result).toBe(true);
    });

    // テストケース 2.3.2: 正常系_scopeなし
    it('should validate message without scope', () => {
      // Given: scope省略形式のメッセージ
      const message = `fix: resolve squash error

Fixes #194`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: true が返される
      expect(result).toBe(true);
    });

    // テストケース 2.3.3: 異常系_無効なtype
    it('should reject message with invalid type', () => {
      // Given: 無効なtypeのメッセージ
      const message = `invalid: bad commit message

Fixes #194`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: false が返される
      expect(result).toBe(false);
    });

    // テストケース 2.3.4: 異常系_subjectが長すぎる
    it('should reject message with subject exceeding 50 characters', () => {
      // Given: 50文字を超えるsubject
      const message = `feat: this is a very long subject line that exceeds fifty characters limit

Fixes #194`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: false が返される
      expect(result).toBe(false);
    });

    // テストケース 2.3.5: 異常系_Issue参照なし
    it('should reject message without issue reference', () => {
      // Given: Issue参照がないメッセージ
      const message = `feat: add squashing feature

This feature allows squashing workflow commits.`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: false が返される
      expect(result).toBe(false);
    });

    // テストケース 2.3.6: 境界値_subject50文字ちょうど
    it('should validate message with subject exactly 50 characters', () => {
      // Given: 50文字ちょうどのsubject
      const message = `feat: add squash feature for workflow commits

Fixes #194`;

      // When: isValidCommitMessage を呼び出す
      const result = (squashManager as any).isValidCommitMessage(message);

      // Then: true が返される
      expect(result).toBe(true);
    });
  });

  describe('generateFallbackMessage', () => {
    // テストケース 2.4.1: 正常系_完全なIssue情報
    it('should generate fallback message with complete issue info', () => {
      // Given: Issue情報が完全な場合
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
      } as any;

      // When: generateFallbackMessage を呼び出す
      const result = (squashManager as any).generateFallbackMessage(context);

      // Then: 適切なフォールバックメッセージが生成される
      expect(result).toContain('feat: Complete workflow for Issue #194');
      expect(result).toContain('feat: Squash commits after workflow completion');
      expect(result).toContain('Fixes #194');
    });

    // テストケース 2.4.2: 正常系_Issue情報なし
    it('should generate default fallback message without issue info', () => {
      // Given: Issue情報がない場合
      const context: PhaseContext = {
        issueNumber: 194,
        issueInfo: null,
      } as any;

      // When: generateFallbackMessage を呼び出す
      const result = (squashManager as any).generateFallbackMessage(context);

      // Then: デフォルトメッセージが生成される
      expect(result).toContain('feat: Complete workflow for Issue #194');
      expect(result).toContain('AI Workflow completion');
      expect(result).toContain('Fixes #194');
    });
  });

  describe('squashCommits', () => {
    let context: PhaseContext;

    beforeEach(() => {
      context = {
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
        metadataManager: mockMetadataManager,
      } as any;
    });

    // 統合テスト: base_commit未記録時のスキップ
    it('should skip squash when base_commit is not found', async () => {
      // Given: base_commitが未記録
      mockMetadataManager.getBaseCommit.mockReturnValue(null);

      // When: squashCommits を呼び出す
      await squashManager.squashCommits(context);

      // Then: スカッシュがスキップされる
      expect(mockMetadataManager.getBaseCommit).toHaveBeenCalled();
      expect(mockGit.log).not.toHaveBeenCalled();
    });

    // 統合テスト: コミット数1以下の場合のスキップ
    it('should skip squash when only one commit exists', async () => {
      // Given: コミットが1つのみ
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'commit1' }] } as any);

      // When: squashCommits を呼び出す
      await squashManager.squashCommits(context);

      // Then: スカッシュがスキップされる
      expect(mockGit.log).toHaveBeenCalled();
      expect(mockGit.revparse).not.toHaveBeenCalled();
    });

    // 統合テスト: ブランチ保護チェック失敗
    it('should throw error when on protected branch', async () => {
      // Given: mainブランチでコミットが複数
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] } as any);
      mockGit.revparse.mockResolvedValue('main\n');

      // When/Then: エラーがスローされる
      await expect(squashManager.squashCommits(context)).rejects.toThrow('protected branch');
    });

    // 統合テスト: エージェント失敗時のフォールバック
    it('should use fallback message when agent fails', async () => {
      // Given: エージェントが失敗
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] } as any);
      mockGit.revparse.mockResolvedValue('feature/test\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockCodexAgent.executeTask.mockRejectedValue(new Error('Agent failed'));
      mockMkdir.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue(new Error('File not found'));
      mockRm.mockResolvedValue(undefined);

      // When: squashCommits を呼び出す
      await squashManager.squashCommits(context);

      // Then: フォールバックメッセージが使用される
      expect(mockGit.commit).toHaveBeenCalled();
      const commitMessage = (mockGit.commit as jest.Mock).mock.calls[0][0];
      expect(commitMessage).toContain('feat: Complete workflow for Issue #194');
    });
  });

  // Issue #216: ESM互換のパス解決とforcePushToRemote呼び出しのテスト
  describe('Issue #216: ESM compatibility and forcePushToRemote', () => {
    let context: PhaseContext;

    beforeEach(() => {
      context = {
        issueNumber: 216,
        issueInfo: {
          title: 'bug: --squash-on-complete が正常に動作しない(複数の問題)',
          body: 'Test body',
          number: 216,
          html_url: 'https://github.com/test/repo/issues/216',
          state: 'open',
          created_at: '2025-01-30',
          updated_at: '2025-01-30',
          labels: [],
          assignees: [],
        },
        workingDir: testWorkingDir,
        metadataManager: mockMetadataManager,
      } as any;
    });

    // テストケース 2.1.1: ESM互換のパス解決_正常系
    it('should load prompt template without __dirname error in ESM environment', async () => {
      // Given: スカッシュに必要な条件が整っている
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] } as any);
      mockGit.revparse.mockResolvedValue('feature/issue-216\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'new-commit' } as any);
      mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true, retries: 0 });

      // プロンプトテンプレートの読み込みをモック
      mockMkdir.mockResolvedValue(undefined);
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        `feat(squash): fix squash issues\n\nFixes #216`,
      );
      mockRm.mockResolvedValue(undefined);
      mockCodexAgent.executeTask.mockResolvedValue(undefined);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: プロンプトテンプレートが正常に読み込まれる（__dirname エラーが発生しない）
      expect(mockReadFile).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalled();
    });

    // テストケース 2.3.1: forcePushToRemote呼び出し確認_正常系
    it('should call forcePushToRemote instead of pushToRemote after squash', async () => {
      // Given: スカッシュコミット作成後の状態
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] } as any);
      mockGit.revparse.mockResolvedValue('feature/issue-216\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockResolvedValue(undefined as any);
      mockGit.commit.mockResolvedValue({ commit: 'squashed-commit' } as any);
      mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true, retries: 0 });

      mockMkdir.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue(new Error('File not found'));
      mockRm.mockResolvedValue(undefined);

      // When: スカッシュ処理を実行
      await squashManager.squashCommits(context);

      // Then: forcePushToRemote が呼び出される
      expect(mockRemoteManager.forcePushToRemote).toHaveBeenCalled();

      // Then: pushToRemote は呼び出されない
      expect(mockRemoteManager.pushToRemote).not.toHaveBeenCalled();
    });

    // テストケース: Git reset失敗時のエラー伝播_異常系
    it('should throw error when git reset fails', async () => {
      // Given: git reset がエラーを返す
      const baseCommit = 'abc123';
      mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
      mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }, { hash: 'c2' }] } as any);
      mockGit.revparse.mockResolvedValue('feature/issue-216\n');
      mockGit.diff.mockResolvedValue('test diff');
      mockGit.reset.mockRejectedValue(new Error('fatal: ambiguous argument'));

      mockMkdir.mockResolvedValue(undefined);
      mockAccess.mockRejectedValue(new Error('File not found'));
      mockRm.mockResolvedValue(undefined);

      // When/Then: エラーがスローされる
      await expect(squashManager.squashCommits(context)).rejects.toThrow(
        'Failed to execute squash',
      );

      // forcePushToRemote は呼び出されない
      expect(mockRemoteManager.forcePushToRemote).not.toHaveBeenCalled();
    });
  });
});
