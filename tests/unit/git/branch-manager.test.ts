/**
 * Unit tests for BranchManager
 * Tests branch operations (create, exists, switch, getCurrentBranch)
 */

import { BranchManager } from '../../../src/core/git/branch-manager';
import { SimpleGit } from 'simple-git';

describe('BranchManager - Branch Creation', () => {
  let branchManager: BranchManager;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      checkoutLocalBranch: jest.fn(),
      branchLocal: jest.fn(),
      branch: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    branchManager = new BranchManager(mockGit);
  });

  describe('createBranch', () => {
    test('createBranch_正常系_新規ブランチ作成', async () => {
      // Given: ブランチが存在しない
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      mockGit.branch.mockResolvedValue({
        all: ['origin/main'],
        branches: {},
      } as any);

      mockGit.checkoutLocalBranch.mockResolvedValue(undefined as any);

      // When: createBranch を呼び出す
      const result = await branchManager.createBranch('feature/issue-25');

      // Then: 新規ブランチが作成される
      expect(result.success).toBe(true);
      expect(result.branch_name).toBe('feature/issue-25');
      expect(result.error).toBeUndefined();
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature/issue-25');
    });

    test('createBranch_正常系_ベースブランチから分岐', async () => {
      // Given: ベースブランチ 'main' が存在する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      mockGit.branch.mockResolvedValue({
        all: ['origin/main'],
        branches: {},
      } as any);

      mockGit.checkoutLocalBranch.mockResolvedValue(undefined as any);

      // When: createBranch を呼び出す（ベースブランチ指定）
      const result = await branchManager.createBranch('feature/issue-25', 'main');

      // Then: ベースブランチから新規ブランチが作成される
      expect(result.success).toBe(true);
      expect(result.branch_name).toBe('feature/issue-25');
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature/issue-25');
    });

    test('createBranch_異常系_既存ブランチ', async () => {
      // Given: ブランチが既に存在する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'feature/issue-25'],
        branches: {},
        current: 'main',
      } as any);

      // When: createBranch を呼び出す
      const result = await branchManager.createBranch('feature/issue-25');

      // Then: エラーメッセージが返される
      expect(result.success).toBe(false);
      expect(result.branch_name).toBe('feature/issue-25');
      expect(result.error).toContain('already exists');
      expect(mockGit.checkoutLocalBranch).not.toHaveBeenCalled();
    });

    test('createBranch_異常系_Git操作失敗', async () => {
      // Given: ブランチが存在しないが、Git操作が失敗する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      mockGit.branch.mockResolvedValue({
        all: ['origin/main'],
        branches: {},
      } as any);

      mockGit.checkoutLocalBranch.mockRejectedValue(
        new Error('Git command failed: fatal: unable to create branch')
      );

      // When: createBranch を呼び出す
      const result = await branchManager.createBranch('feature/issue-25');

      // Then: エラーが適切にハンドリングされる
      expect(result.success).toBe(false);
      expect(result.branch_name).toBe('feature/issue-25');
      expect(result.error).toContain('Git command failed');
    });
  });
});

describe('BranchManager - Branch Existence', () => {
  let branchManager: BranchManager;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      branchLocal: jest.fn(),
      branch: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    branchManager = new BranchManager(mockGit);
  });

  describe('branchExists', () => {
    test('branchExists_正常系_ローカルブランチ存在', async () => {
      // Given: ローカルブランチが存在する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main', 'feature/issue-25'],
        branches: {},
        current: 'main',
      } as any);

      // When: branchExists を呼び出す
      const exists = await branchManager.branchExists('feature/issue-25');

      // Then: true が返される
      expect(exists).toBe(true);
      expect(mockGit.branchLocal).toHaveBeenCalled();
    });

    test('branchExists_正常系_リモートブランチ存在', async () => {
      // Given: ローカルには存在しないが、リモートに存在する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      mockGit.branch.mockResolvedValue({
        all: ['origin/main', 'origin/feature/issue-25'],
        branches: {},
      } as any);

      // When: branchExists を呼び出す（checkRemote=true）
      const exists = await branchManager.branchExists('feature/issue-25', true);

      // Then: true が返される
      expect(exists).toBe(true);
      expect(mockGit.branchLocal).toHaveBeenCalled();
      expect(mockGit.branch).toHaveBeenCalledWith(['--remotes']);
    });

    test('branchExists_正常系_ブランチ不存在', async () => {
      // Given: ローカル・リモート共にブランチが存在しない
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      mockGit.branch.mockResolvedValue({
        all: ['origin/main'],
        branches: {},
      } as any);

      // When: branchExists を呼び出す（checkRemote=true）
      const exists = await branchManager.branchExists('feature/issue-25', true);

      // Then: false が返される
      expect(exists).toBe(false);
    });

    test('branchExists_境界値_checkRemote=false', async () => {
      // Given: ローカルには存在しないが、リモートに存在する
      mockGit.branchLocal.mockResolvedValue({
        all: ['main'],
        branches: {},
        current: 'main',
      } as any);

      // When: branchExists を呼び出す（checkRemote=false）
      const exists = await branchManager.branchExists('feature/issue-25', false);

      // Then: false が返される（リモートはチェックされない）
      expect(exists).toBe(false);
      expect(mockGit.branchLocal).toHaveBeenCalled();
      expect(mockGit.branch).not.toHaveBeenCalled();
    });
  });
});

describe('BranchManager - Branch Navigation', () => {
  let branchManager: BranchManager;
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      raw: jest.fn(),
      checkout: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    branchManager = new BranchManager(mockGit);
  });

  describe('getCurrentBranch', () => {
    test('getCurrentBranch_正常系_現在のブランチ取得', async () => {
      // Given: 現在のブランチは 'feature/issue-25'
      mockGit.raw.mockResolvedValue('feature/issue-25\n');

      // When: getCurrentBranch を呼び出す
      const branch = await branchManager.getCurrentBranch();

      // Then: ブランチ名が正しく取得される
      expect(branch).toBe('feature/issue-25');
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD']);
    });
  });

  describe('switchBranch', () => {
    test('switchBranch_正常系_ブランチ切り替え', async () => {
      // Given: ブランチ 'main' が存在する
      mockGit.checkout.mockResolvedValue(undefined as any);

      // When: switchBranch を呼び出す
      const result = await branchManager.switchBranch('main');

      // Then: ブランチが正常に切り替えられる
      expect(result.success).toBe(true);
      expect(result.branch_name).toBe('main');
      expect(result.error).toBeUndefined();
      expect(mockGit.checkout).toHaveBeenCalledWith('main');
    });

    test('switchBranch_異常系_存在しないブランチ', async () => {
      // Given: ブランチ 'non-existent' が存在しない
      mockGit.checkout.mockRejectedValue(
        new Error("Git command failed: error: pathspec 'non-existent' did not match")
      );

      // When: switchBranch を呼び出す
      const result = await branchManager.switchBranch('non-existent');

      // Then: エラーが返される
      expect(result.success).toBe(false);
      expect(result.branch_name).toBe('non-existent');
      expect(result.error).toContain('Git command failed');
    });
  });
});
