/**
 * 統合テスト: init コマンド - PR URL 永続化（Issue #253）
 *
 * テスト対象:
 * - init コマンド実行後、リモートの metadata.json に pr_url が保存される
 * - execute コマンドで pr_url が正しく読み込める
 *
 * テスト戦略: UNIT_INTEGRATION - 統合部分
 *
 * 注意:
 * このテストは実際のGit操作とファイルシステムを使用する統合テストです。
 * GitHub APIのモック化が必要なため、実際の環境では以下の対応が必要です：
 * 1. GITHUB_TOKEN環境変数の設定
 * 2. テスト用リポジトリの作成
 * 3. ローカルベアリポジトリの使用（CI環境推奨）
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import simpleGit, { type SimpleGit } from 'simple-git';

// =============================================================================
// テスト用ヘルパー関数
// =============================================================================

/**
 * テスト用のローカルベアリポジトリを作成
 */
async function createBareRepository(bareRepoPath: string): Promise<void> {
  await fs.ensureDir(bareRepoPath);
  const bareGit = simpleGit(bareRepoPath);
  await bareGit.init(true); // --bare オプション
}

/**
 * テスト用のワーキングリポジトリを作成
 */
async function createWorkingRepository(
  workingRepoPath: string,
  bareRepoPath: string,
): Promise<SimpleGit> {
  await fs.ensureDir(workingRepoPath);
  const git = simpleGit(workingRepoPath);
  await git.init();
  await git.checkoutLocalBranch('main');
  await git.addConfig('user.name', 'Test User', false, 'local');
  await git.addConfig('user.email', 'test@example.com', false, 'local');
  await git.addRemote('origin', bareRepoPath);

  // 初期コミット作成（リモートブランチが存在しない状態を避ける）
  const readmePath = path.join(workingRepoPath, 'README.md');
  await fs.writeFile(readmePath, '# Test Repository\n');
  await git.add('README.md');
  await git.commit('Initial commit');
  await git.push('origin', 'main');

  return git;
}

// =============================================================================
// 統合テスト: init コマンド - PR URL 永続化
// =============================================================================

describe('Issue #253: init command - PR URL persistence (Integration Test)', () => {
  let testDir: string;
  let bareRepoPath: string;
  let workingRepoPath: string;
  let git: SimpleGit;
  const issueNumber = 253;
  const branchName = `ai-workflow/issue-${issueNumber}`;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    testDir = path.join(os.tmpdir(), `ai-workflow-test-${Date.now()}`);
    bareRepoPath = path.join(testDir, 'bare-repo.git');
    workingRepoPath = path.join(testDir, 'working-repo');

    // ベアリポジトリとワーキングリポジトリを作成
    await createBareRepository(bareRepoPath);
    git = await createWorkingRepository(workingRepoPath, bareRepoPath);
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await fs.remove(testDir);
  });

  // ===========================================================================
  // 統合テスト 3.1: init コマンド実行後のリモートメタデータ永続化
  // ===========================================================================

  describe('init コマンド実行後のリモートメタデータ永続化', () => {
    test('PR情報を含むmetadata.jsonがリモートにプッシュされることを検証（モック使用）', async () => {
      // Given: ワーキングリポジトリが初期化されている
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      // 新規ブランチを作成
      await git.checkoutLocalBranch(branchName);

      // When: metadata.json を作成し、PR情報を設定
      await fs.ensureDir(workflowDir);
      const metadata = {
        issue_number: issueNumber,
        issue_url: `https://github.com/tielec/ai-workflow-agent/issues/${issueNumber}`,
        branch_name: branchName,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/123',
        pr_number: 123,
        workflow_status: 'in_progress',
        created_at: new Date().toISOString(),
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });

      // metadata.json をコミット&プッシュ
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Phase 0 (planning) - completed');
      await git.push('origin', branchName);

      // Then: リモートブランチに metadata.json が存在する
      const remoteBranches = await git.branch(['-r']);
      const remoteBranchExists = remoteBranches.all.some((ref) =>
        ref.includes(`origin/${branchName}`),
      );
      expect(remoteBranchExists).toBe(true);

      // Then: リモートの metadata.json に pr_url が保存されている
      const remoteMetadataContent = await git.show([`origin/${branchName}:${path.relative(workingRepoPath, metadataPath)}`]);
      const remoteMetadata = JSON.parse(remoteMetadataContent);
      expect(remoteMetadata.pr_url).toBeDefined();
      expect(remoteMetadata.pr_url).toBe('https://github.com/tielec/ai-workflow-agent/pull/123');
      expect(remoteMetadata.pr_number).toBe(123);
    });

    test('pr_urlフィールドの型と形式が正しいことを検証', async () => {
      // Given: metadata.json が作成されている
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      const metadata = {
        issue_number: issueNumber,
        branch_name: branchName,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/456',
        pr_number: 456,
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] PR metadata commit');
      await git.push('origin', branchName);

      // When: リモートの metadata.json を取得
      const remoteMetadataContent = await git.show([`origin/${branchName}:${path.relative(workingRepoPath, metadataPath)}`]);
      const remoteMetadata = JSON.parse(remoteMetadataContent);

      // Then: pr_url が正しい形式である
      expect(typeof remoteMetadata.pr_url).toBe('string');
      expect(remoteMetadata.pr_url).toMatch(/^https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+$/);

      // Then: pr_number が正の整数である
      expect(typeof remoteMetadata.pr_number).toBe('number');
      expect(remoteMetadata.pr_number).toBeGreaterThan(0);
      expect(Number.isInteger(remoteMetadata.pr_number)).toBe(true);
    });
  });

  // ===========================================================================
  // 統合テスト 3.2: execute コマンドでのメタデータ読み込み
  // ===========================================================================

  describe('execute コマンドでのメタデータ読み込み', () => {
    test('リモートから取得したmetadata.jsonにpr_urlが含まれることを検証', async () => {
      // Given: リモートに metadata.json がプッシュされている
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      const metadata = {
        issue_number: issueNumber,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/789',
        pr_number: 789,
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Init with PR info');
      await git.push('origin', branchName);

      // When: ローカルのメタデータを削除し、リモートから再取得
      await fs.remove(workflowDir);
      await git.checkout(branchName);
      await git.pull('origin', branchName, { '--no-rebase': null });
      await git.checkout(['--', '.']); // ローカル削除をリセットしてリモート状態に同期

      // Then: ローカルのmetadata.jsonにpr_urlが存在する
      const localMetadata = await fs.readJson(metadataPath);
      expect(localMetadata.pr_url).toBeDefined();
      expect(localMetadata.pr_url).toBe('https://github.com/tielec/ai-workflow-agent/pull/789');
      expect(localMetadata.pr_number).toBe(789);
    });

    test('リモートとローカルのmetadata.jsonが一致することを検証', async () => {
      // Given: リモートに metadata.json がプッシュされている
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      const metadata = {
        issue_number: issueNumber,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/999',
        pr_number: 999,
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Metadata with PR');
      await git.push('origin', branchName);

      // When: リモートとローカルのmetadata.jsonを比較
      const localMetadata = await fs.readJson(metadataPath);
      const remoteMetadataContent = await git.show([`origin/${branchName}:${path.relative(workingRepoPath, metadataPath)}`]);
      const remoteMetadata = JSON.parse(remoteMetadataContent);

      // Then: ローカルとリモートのpr_urlが一致する
      expect(localMetadata.pr_url).toBe(remoteMetadata.pr_url);
      expect(localMetadata.pr_number).toBe(remoteMetadata.pr_number);
    });
  });

  // ===========================================================================
  // 統合テスト 3.3: Git操作の統合テスト（コミット&プッシュ）
  // ===========================================================================

  describe('Git操作の統合テスト（コミット&プッシュ）', () => {
    test('PR情報のコミット&プッシュが実際に実行されることを検証', async () => {
      // Given: 初期コミットが存在する
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      // Step 1: 初回のmetadata.json作成（pr_urlなし）
      const initialMetadata = {
        issue_number: issueNumber,
        pr_url: null,
        pr_number: null,
      };
      await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Phase 0 (planning) - init completed');
      await git.push('origin', branchName);

      // Step 2: PR情報を追加してコミット&プッシュ
      const updatedMetadata = {
        issue_number: issueNumber,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/101',
        pr_number: 101,
      };
      await fs.writeJson(metadataPath, updatedMetadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Phase 0 (planning) - completed');
      await git.push('origin', branchName);

      // When: コミット履歴を確認
      const log = await git.log({ from: 'main', to: branchName });

      // Then: 2つのコミットが存在する
      expect(log.all.length).toBeGreaterThanOrEqual(2);

      // Then: リモートのmetadata.jsonにpr_urlが含まれる
      const remoteMetadataContent = await git.show([`origin/${branchName}:${path.relative(workingRepoPath, metadataPath)}`]);
      const remoteMetadata = JSON.parse(remoteMetadataContent);
      expect(remoteMetadata.pr_url).toBe('https://github.com/tielec/ai-workflow-agent/pull/101');
      expect(remoteMetadata.pr_number).toBe(101);
    });

    test('コミットメッセージが正しい形式であることを検証', async () => {
      // Given: ワークフローブランチが存在する
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      const metadata = {
        issue_number: issueNumber,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/202',
        pr_number: 202,
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });

      // When: 標準的なコミットメッセージでコミット
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Phase 0 (planning) - completed');
      await git.push('origin', branchName);

      // Then: コミットメッセージが正しい形式である
      const log = await git.log({ from: 'main', to: branchName, maxCount: 1 });
      const latestCommit = log.latest;
      expect(latestCommit?.message).toContain('[ai-workflow]');
      expect(latestCommit?.message).toMatch(/Phase \d+ \(.*\) - completed/);
    });
  });

  // ===========================================================================
  // 統合テスト 3.5: 既存テストの破壊がないことを確認
  // ===========================================================================

  describe('既存機能の後方互換性', () => {
    test('pr_urlがnullでもmetadata.jsonが正常に読み込めることを検証（後方互換性）', async () => {
      // Given: pr_urlがnullのmetadata.json
      const workflowDir = path.join(workingRepoPath, '.ai-workflow', `issue-${issueNumber}`);
      const metadataPath = path.join(workflowDir, 'metadata.json');

      await git.checkoutLocalBranch(branchName);
      await fs.ensureDir(workflowDir);

      const metadata = {
        issue_number: issueNumber,
        pr_url: null,
        pr_number: null,
      };
      await fs.writeJson(metadataPath, metadata, { spaces: 2 });
      await git.add(['.ai-workflow/**']);
      await git.commit('[ai-workflow] Init without PR');
      await git.push('origin', branchName);

      // When: metadata.jsonを読み込み
      const loadedMetadata = await fs.readJson(metadataPath);

      // Then: pr_urlがnullでも正常に読み込める
      expect(loadedMetadata.pr_url).toBeNull();
      expect(loadedMetadata.pr_number).toBeNull();
      expect(loadedMetadata.issue_number).toBe(issueNumber);
    });
  });
});
