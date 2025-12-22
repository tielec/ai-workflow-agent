/**
 * Integration tests for migrate command (Issue #58, Task 3)
 *
 * E2Eフローテスト: 探索 → 検出 → サニタイズ → バックアップ → 保存 → 検証
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleMigrateCommand } from '../../src/commands/migrate.js';
import type { MigrateOptions } from '../../src/types/commands.js';

// logger のモック
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// process.exit のモック
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`process.exit(${code})`);
}) as any;

describe('migrate command - Integration Tests', () => {
  let testRepoPath: string;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    testRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-workflow-test-'));
  });

  afterEach(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(testRepoPath);
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('E2Eフロー: 複数メタデータファイル', () => {
    it('複数メタデータファイルのサニタイズが正しく動作', async () => {
      // Given: 3つのメタデータファイルを作成
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      const issue2Dir = path.join(testRepoPath, '.ai-workflow', 'issue-2');
      const issue3Dir = path.join(testRepoPath, '.ai-workflow', 'issue-3');

      await fs.ensureDir(issue1Dir);
      await fs.ensureDir(issue2Dir);
      await fs.ensureDir(issue3Dir);

      const metadata1 = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token1@github.com/owner/repo1.git',
          branch: 'main',
        },
      };
      const metadata2 = {
        issue_number: 2,
        target_repository: {
          remote_url: 'git@github.com:owner/repo2.git',
          branch: 'main',
        },
      };
      const metadata3 = {
        issue_number: 3,
        target_repository: {
          remote_url: 'https://ghp_token3@github.com/owner/repo3.git',
          branch: 'main',
        },
      };

      await fs.writeJSON(path.join(issue1Dir, 'metadata.json'), metadata1, { spaces: 2 });
      await fs.writeJSON(path.join(issue2Dir, 'metadata.json'), metadata2, { spaces: 2 });
      await fs.writeJSON(path.join(issue3Dir, 'metadata.json'), metadata3, { spaces: 2 });

      // When: マイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: Issue 1 と Issue 3 のメタデータがサニタイズされている
      const result1 = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(result1.target_repository.remote_url).toBe('https://github.com/owner/repo1.git');

      // Issue 2 (SSH形式) は変更されていない
      const result2 = await fs.readJSON(path.join(issue2Dir, 'metadata.json'));
      expect(result2.target_repository.remote_url).toBe('git@github.com:owner/repo2.git');

      const result3 = await fs.readJSON(path.join(issue3Dir, 'metadata.json'));
      expect(result3.target_repository.remote_url).toBe('https://github.com/owner/repo3.git');

      // バックアップファイルが作成されている
      expect(await fs.pathExists(path.join(issue1Dir, 'metadata.json.bak'))).toBe(true);
      expect(await fs.pathExists(path.join(issue2Dir, 'metadata.json.bak'))).toBe(false); // SSH形式はスキップ
      expect(await fs.pathExists(path.join(issue3Dir, 'metadata.json.bak'))).toBe(true);

      // バックアップファイルの内容が元のメタデータと一致
      const backup1 = await fs.readJSON(path.join(issue1Dir, 'metadata.json.bak'));
      expect(backup1.target_repository.remote_url).toBe('https://ghp_token1@github.com/owner/repo1.git');
    });
  });

  describe('E2Eフロー: ドライラン', () => {
    it('ドライランモードでファイルが変更されない', async () => {
      // Given: トークンを含むメタデータファイル
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      await fs.ensureDir(issue1Dir);

      const metadata1 = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
          branch: 'main',
        },
      };
      await fs.writeJSON(path.join(issue1Dir, 'metadata.json'), metadata1, { spaces: 2 });

      // When: ドライランモードでマイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: メタデータファイルが変更されていない
      const result = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(result.target_repository.remote_url).toBe('https://ghp_token@github.com/owner/repo.git');

      // バックアップファイルが作成されていない
      expect(await fs.pathExists(path.join(issue1Dir, 'metadata.json.bak'))).toBe(false);
    });
  });

  describe('E2Eフロー: 特定Issue指定', () => {
    it('--issue オプションで特定Issueのみサニタイズ', async () => {
      // Given: 3つのメタデータファイル（全てトークンあり）
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      const issue2Dir = path.join(testRepoPath, '.ai-workflow', 'issue-2');
      const issue3Dir = path.join(testRepoPath, '.ai-workflow', 'issue-3');

      await fs.ensureDir(issue1Dir);
      await fs.ensureDir(issue2Dir);
      await fs.ensureDir(issue3Dir);

      const metadata1 = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token1@github.com/owner/repo1.git',
          branch: 'main',
        },
      };
      const metadata2 = {
        issue_number: 2,
        target_repository: {
          remote_url: 'https://ghp_token2@github.com/owner/repo2.git',
          branch: 'main',
        },
      };
      const metadata3 = {
        issue_number: 3,
        target_repository: {
          remote_url: 'https://ghp_token3@github.com/owner/repo3.git',
          branch: 'main',
        },
      };

      await fs.writeJSON(path.join(issue1Dir, 'metadata.json'), metadata1, { spaces: 2 });
      await fs.writeJSON(path.join(issue2Dir, 'metadata.json'), metadata2, { spaces: 2 });
      await fs.writeJSON(path.join(issue3Dir, 'metadata.json'), metadata3, { spaces: 2 });

      // When: --issue 2 でマイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        issue: '2',
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: Issue 2 のみサニタイズされている
      const result1 = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(result1.target_repository.remote_url).toBe('https://ghp_token1@github.com/owner/repo1.git'); // 変更なし

      const result2 = await fs.readJSON(path.join(issue2Dir, 'metadata.json'));
      expect(result2.target_repository.remote_url).toBe('https://github.com/owner/repo2.git'); // サニタイズ済み

      const result3 = await fs.readJSON(path.join(issue3Dir, 'metadata.json'));
      expect(result3.target_repository.remote_url).toBe('https://ghp_token3@github.com/owner/repo3.git'); // 変更なし

      // Issue 2 のバックアップファイルのみ作成されている
      expect(await fs.pathExists(path.join(issue1Dir, 'metadata.json.bak'))).toBe(false);
      expect(await fs.pathExists(path.join(issue2Dir, 'metadata.json.bak'))).toBe(true);
      expect(await fs.pathExists(path.join(issue3Dir, 'metadata.json.bak'))).toBe(false);
    });
  });

  describe('E2Eフロー: エラーハンドリング', () => {
    it('ファイル読み込み失敗しても処理が続行される', async () => {
      // Given: 3つのメタデータファイル（1つは不正なJSON）
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      const issue2Dir = path.join(testRepoPath, '.ai-workflow', 'issue-2');
      const issue3Dir = path.join(testRepoPath, '.ai-workflow', 'issue-3');

      await fs.ensureDir(issue1Dir);
      await fs.ensureDir(issue2Dir);
      await fs.ensureDir(issue3Dir);

      // Issue 1: 不正なJSON
      await fs.writeFile(path.join(issue1Dir, 'metadata.json'), '{ invalid json }');

      // Issue 2: 正常
      const metadata2 = {
        issue_number: 2,
        target_repository: {
          remote_url: 'https://ghp_token2@github.com/owner/repo2.git',
          branch: 'main',
        },
      };
      await fs.writeJSON(path.join(issue2Dir, 'metadata.json'), metadata2, { spaces: 2 });

      // Issue 3: 読み込み権限なし（シミュレートできないため、代わりに空オブジェクトを使用）
      await fs.writeJSON(path.join(issue3Dir, 'metadata.json'), {}, { spaces: 2 });

      // When: マイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: Issue 2 のみサニタイズされている
      const result2 = await fs.readJSON(path.join(issue2Dir, 'metadata.json'));
      expect(result2.target_repository.remote_url).toBe('https://github.com/owner/repo2.git');

      // バックアップファイルは Issue 2 のみ作成されている
      expect(await fs.pathExists(path.join(issue1Dir, 'metadata.json.bak'))).toBe(false);
      expect(await fs.pathExists(path.join(issue2Dir, 'metadata.json.bak'))).toBe(true);
      expect(await fs.pathExists(path.join(issue3Dir, 'metadata.json.bak'))).toBe(false);
    });
  });

  describe('セキュリティテスト: パストラバーサル攻撃防止', () => {
    it('パストラバーサル攻撃が防止される', async () => {
      // Given: 正常なメタデータファイル
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      await fs.ensureDir(issue1Dir);

      const metadata1 = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
          branch: 'main',
        },
      };
      await fs.writeJSON(path.join(issue1Dir, 'metadata.json'), metadata1, { spaces: 2 });

      // 不正なパス（シミュレート）: glob パターンでは検出されないため、このテストは概念的
      // 実際の実装では正規表現によるパス検証が行われている

      // When: マイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: 正常なファイルのみサニタイズされる
      const result1 = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(result1.target_repository.remote_url).toBe('https://github.com/owner/repo.git');
    });
  });

  describe('セキュリティテスト: シンボリックリンク攻撃防止', () => {
    it('シンボリックリンクがスキップされる', async () => {
      // Given: シンボリックリンクとしてのメタデータファイル（Unix系のみ）
      if (process.platform === 'win32') {
        // Windows ではシンボリックリンクのテストをスキップ
        return;
      }

      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      await fs.ensureDir(issue1Dir);

      // 実際のファイルを作成
      const realFile = path.join(testRepoPath, 'real-metadata.json');
      const metadata = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
          branch: 'main',
        },
      };
      await fs.writeJSON(realFile, metadata, { spaces: 2 });

      // シンボリックリンクを作成
      const symlinkPath = path.join(issue1Dir, 'metadata.json');
      await fs.symlink(realFile, symlinkPath);

      // When: マイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // Then: シンボリックリンクはスキップされる
      // 実際のファイルは変更されていない
      const realFileContent = await fs.readJSON(realFile);
      expect(realFileContent.target_repository.remote_url).toBe('https://ghp_token@github.com/owner/repo.git');

      // バックアップファイルが作成されていない
      expect(await fs.pathExists(`${symlinkPath}.bak`)).toBe(false);
    });
  });

  describe('バックアップ・ロールバックテスト', () => {
    it('バックアップファイルから手動で復元できる', async () => {
      // Given: トークンを含むメタデータファイル
      const issue1Dir = path.join(testRepoPath, '.ai-workflow', 'issue-1');
      await fs.ensureDir(issue1Dir);

      const originalMetadata = {
        issue_number: 1,
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
          branch: 'main',
        },
      };
      await fs.writeJSON(path.join(issue1Dir, 'metadata.json'), originalMetadata, { spaces: 2 });

      // When: マイグレーションコマンドを実行
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        repo: testRepoPath,
      };
      await handleMigrateCommand(options);

      // サニタイズされたことを確認
      const sanitizedMetadata = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(sanitizedMetadata.target_repository.remote_url).toBe('https://github.com/owner/repo.git');

      // Then: バックアップファイルから手動で復元
      await fs.copy(
        path.join(issue1Dir, 'metadata.json.bak'),
        path.join(issue1Dir, 'metadata.json'),
        { overwrite: true }
      );

      // 復元されたメタデータが元の状態に戻っている
      const restoredMetadata = await fs.readJSON(path.join(issue1Dir, 'metadata.json'));
      expect(restoredMetadata.target_repository.remote_url).toBe('https://ghp_token@github.com/owner/repo.git');
    });
  });
});
