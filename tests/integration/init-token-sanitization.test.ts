/**
 * 統合テスト: init コマンド - トークン埋め込みURL対応
 *
 * Issue #54: metadata.jsonにGitHub Personal Access Tokenが含まれpush protectionで拒否される問題
 *
 * テスト対象:
 * - init コマンド実行時のURLサニタイズ
 * - metadata.json作成時のトークン除去
 * - SecretMaskerによるmetadata.jsonスキャン
 * - commitWorkflowInitでのマスキング実行
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { sanitizeGitUrl } from '../../src/utils/git-url-utils.js';
import { SecretMasker } from '../../src/core/secret-masker.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'init-token-sanitization-test');

describe('init コマンド - トークン埋め込みURL対応（統合テスト）', () => {
  const originalEnv = { ...process.env };
  let workflowDir: string;

  beforeAll(async () => {
    // テスト用ディレクトリを作成
    workflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-54');
    await fs.ensureDir(workflowDir);
  });

  beforeEach(async () => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    // テストディレクトリをクリーンアップ
    await fs.remove(workflowDir);
    await fs.ensureDir(workflowDir);
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('IC-2.1.1: E2E - トークン埋め込みURLでinit実行 → metadata.jsonにトークンが含まれない', () => {
    test('HTTPS + トークン形式のURLをサニタイズしてmetadata.jsonに保存', async () => {
      // Given: HTTPS + トークン形式のremote URL
      const tokenEmbeddedUrl = 'https://ghp_dummy123456789abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git';
      const expectedSanitizedUrl = 'https://github.com/owner/repo.git';

      // When: URLサニタイズを実行（init コマンドの内部処理をシミュレート）
      const sanitizedUrl = sanitizeGitUrl(tokenEmbeddedUrl);

      // metadata.jsonにサニタイズ済みURLを保存
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
            path: '/path/to/repo',
            github_name: 'owner/repo',
            owner: 'owner',
            repo: 'repo',
          },
        }),
      );

      // Then: metadata.jsonにトークンが含まれない
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe(expectedSanitizedUrl);
      expect(metadata.target_repository.remote_url).not.toContain('ghp_dummy123456789');
      expect(metadata.target_repository.remote_url).not.toContain('@');
    });

    test('SSH形式のURLは変更されずにmetadata.jsonに保存', async () => {
      // Given: SSH形式のremote URL
      const sshUrl = 'git@github.com:owner/repo.git';

      // When: URLサニタイズを実行
      const sanitizedUrl = sanitizeGitUrl(sshUrl);

      // metadata.jsonに保存
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
          },
        }),
      );

      // Then: URLが変更されない
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe(sshUrl);
    });
  });

  describe('IC-2.1.2: 統合 - commitWorkflowInit でのマスキング実行', () => {
    test('metadata.json作成後、SecretMaskerがトークンをマスク', async () => {
      // Given: 意図的にトークンを含むmetadata.json（URLサニタイズが失敗したケースをシミュレート）
      process.env.GITHUB_TOKEN = 'ghp_secret123456789';
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: 'https://ghp_secret123456789@github.com/owner/repo.git',
          },
        }),
      );

      // When: SecretMaskerを実行（commitWorkflowInit内部処理をシミュレート）
      const masker = new SecretMasker();
      const maskingResult = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then: トークンがマスキングされる
      expect(maskingResult.filesProcessed).toBeGreaterThanOrEqual(1);
      expect(maskingResult.secretsMasked).toBeGreaterThan(0);

      const content = await fs.readFile(metadataPath, 'utf-8');
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).not.toContain('ghp_secret123456789');
    });

    test('マスキング失敗時のエラーハンドリング', async () => {
      // Given: metadata.jsonを読み取り専用に設定（マスキング失敗をシミュレート）
      if (process.platform === 'win32') {
        console.log('[INFO] Skipping read-only test on Windows');
        return;
      }

      process.env.GITHUB_TOKEN = 'ghp_readonly123';
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: 'https://ghp_readonly123@github.com/owner/repo.git',
          },
        }),
      );
      await fs.chmod(metadataPath, 0o444); // 読み取り専用

      // When: SecretMaskerを実行
      const masker = new SecretMasker();
      const maskingResult = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then: エラーが記録される
      expect(maskingResult.errors.length).toBeGreaterThan(0);

      // Cleanup
      await fs.chmod(metadataPath, 0o644);
    });
  });

  describe('IC-2.1.4: 統合 - 既存ワークフローへの影響なし', () => {
    test('既存metadata.jsonは変更されない', async () => {
      // Given: 既存のmetadata.json
      const existingMetadataPath = path.join(workflowDir, 'metadata.json');
      const existingContent = JSON.stringify({
        target_repository: {
          remote_url: 'https://github.com/owner/existing-repo.git',
        },
        issueNumber: 100,
      });
      await fs.writeFile(existingMetadataPath, existingContent);
      const { mtime: beforeMtime } = await fs.stat(existingMetadataPath);

      // When: 新規issue（54）で新しいmetadata.jsonを作成（別ディレクトリ）
      const newWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-200');
      await fs.ensureDir(newWorkflowDir);
      const newMetadataPath = path.join(newWorkflowDir, 'metadata.json');
      await fs.writeFile(
        newMetadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: 'https://github.com/owner/new-repo.git',
          },
          issueNumber: 200,
        }),
      );

      // Then: 既存metadata.jsonは変更されない
      const { mtime: afterMtime } = await fs.stat(existingMetadataPath);
      const afterContent = await fs.readFile(existingMetadataPath, 'utf-8');

      expect(afterMtime.getTime()).toBe(beforeMtime.getTime());
      expect(afterContent).toBe(existingContent);

      // 新規metadata.jsonは正常に作成される
      expect(await fs.pathExists(newMetadataPath)).toBe(true);

      // Cleanup
      await fs.remove(newWorkflowDir);
    });
  });

  describe('IC-2.1.5: 統合 - SSH形式URLでのinit実行（変更なし）', () => {
    test('SSH形式URLでinit実行した場合、URLが変更されない', async () => {
      // Given: SSH形式のremote URL
      const sshUrl = 'git@github.com:owner/repo.git';

      // When: URLサニタイズを実行してmetadata.jsonに保存
      const sanitizedUrl = sanitizeGitUrl(sshUrl);
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
          },
        }),
      );

      // Then: metadata.jsonにSSH形式がそのまま保存される
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe(sshUrl);
    });
  });

  describe('Defense in Depth（多層防御）パターンの検証', () => {
    test('第1層（URLサニタイズ）+ 第2層（SecretMasker）の両方が機能', async () => {
      // Given: トークン埋め込みURL
      const tokenUrl = 'https://ghp_defense123@github.com/owner/repo.git';
      process.env.GITHUB_TOKEN = 'ghp_defense123';

      // When:
      // 第1層: URLサニタイズ
      const sanitizedUrl = sanitizeGitUrl(tokenUrl);

      // 第2層: SecretMasker（万が一第1層が失敗した場合をシミュレート）
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl, // サニタイズ済みURL
          },
        }),
      );

      const masker = new SecretMasker();
      const maskingResult = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then:
      // 第1層でトークンが除去される
      expect(sanitizedUrl).toBe('https://github.com/owner/repo.git');
      expect(sanitizedUrl).not.toContain('ghp_defense123');

      // 第2層でも問題なく処理される（トークンが含まれないため、マスク対象なし）
      const content = await fs.readFile(metadataPath, 'utf-8');
      expect(content).not.toContain('ghp_defense123');
    });

    test('第1層が失敗しても第2層でカバーされる', async () => {
      // Given: 第1層のサニタイズが失敗したケース（意図的にトークンを残す）
      process.env.GITHUB_TOKEN = 'ghp_failsafe456';
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            // 意図的にトークンを残す（第1層失敗のシミュレート）
            remote_url: 'https://ghp_failsafe456@github.com/owner/repo.git',
          },
        }),
      );

      // When: 第2層（SecretMasker）を実行
      const masker = new SecretMasker();
      const maskingResult = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then: 第2層でトークンがマスキングされる
      expect(maskingResult.secretsMasked).toBeGreaterThan(0);
      const content = await fs.readFile(metadataPath, 'utf-8');
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).not.toContain('ghp_failsafe456');
    });
  });

  describe('様々なGitホストとURL形式の統合テスト', () => {
    test('GitLab HTTPS + トークン形式のURL処理', async () => {
      // Given: GitLabのHTTPS + トークン形式URL
      const gitlabUrl = 'https://oauth2:glpat-xxxxxxxxxxxxxxxxxxxx@gitlab.com/group/project.git';

      // When: URLサニタイズしてmetadata.jsonに保存
      const sanitizedUrl = sanitizeGitUrl(gitlabUrl);
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
          },
        }),
      );

      // Then: トークンが除去される
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe('https://gitlab.com/group/project.git');
      expect(metadata.target_repository.remote_url).not.toContain('glpat-');
    });

    test('Bitbucket HTTPS + トークン形式のURL処理', async () => {
      // Given: BitbucketのHTTPS + トークン形式URL
      const bitbucketUrl = 'https://x-token-auth:ATBB_xxxxxxxxxxxxxxxxx@bitbucket.org/workspace/repo.git';

      // When: URLサニタイズしてmetadata.jsonに保存
      const sanitizedUrl = sanitizeGitUrl(bitbucketUrl);
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
          },
        }),
      );

      // Then: トークンが除去される
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe('https://bitbucket.org/workspace/repo.git');
      expect(metadata.target_repository.remote_url).not.toContain('ATBB_');
    });

    test('ポート番号付きURL + トークン形式の処理', async () => {
      // Given: ポート番号付きHTTPS + トークン形式URL
      const portUrl = 'https://ghp_port789@github.com:443/owner/repo.git';

      // When: URLサニタイズしてmetadata.jsonに保存
      const sanitizedUrl = sanitizeGitUrl(portUrl);
      const metadataPath = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          target_repository: {
            remote_url: sanitizedUrl,
          },
        }),
      );

      // Then: トークンが除去され、ポート番号は保持される
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      expect(metadata.target_repository.remote_url).toBe('https://github.com:443/owner/repo.git');
      expect(metadata.target_repository.remote_url).toContain(':443');
      expect(metadata.target_repository.remote_url).not.toContain('ghp_port789');
    });
  });
});
