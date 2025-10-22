/**
 * ユニットテスト: secret-masker.ts
 *
 * テスト対象:
 * - SecretMasker.getSecretList()
 * - SecretMasker.maskSecretsInWorkflowDir()
 * - 環境変数ベースのシークレット検出
 * - ファイル内のシークレット置換
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { SecretMasker } from '../../src/core/secret-masker.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'secret-masker-test');

describe('SecretMasker環境変数検出テスト', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
  });

  afterAll(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  test('2.1.1: 環境変数が設定されている場合、シークレットを検出する', () => {
    // Given: 環境変数にシークレットが設定されている
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';
    process.env.OPENAI_API_KEY = 'sk-proj-test1234567890abcdefghij';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: 2つのシークレットが検出される
    expect(secrets.length).toBe(2);
    expect(secrets.some((s) => s.name === 'GITHUB_TOKEN' && s.value === 'ghp_test1234567890abcdefghij')).toBeTruthy();
    expect(secrets.some((s) => s.name === 'OPENAI_API_KEY' && s.value === 'sk-proj-test1234567890abcdefghij')).toBeTruthy();
  });

  test('2.1.2: 環境変数が空の場合、シークレットを検出しない', () => {
    // Given: 環境変数が未設定
    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: シークレットが検出されない
    expect(secrets.length).toBe(0);
  });

  test('2.1.3: 短い値(10文字以下)は無視される', () => {
    // Given: 短いシークレット値
    process.env.GITHUB_TOKEN = 'short123';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: シークレットが検出されない
    expect(secrets.length).toBe(0);
  });

  test('2.1.4: AWS認証情報を含む複数のシークレットを検出', () => {
    // Given: 複数の環境変数が設定されている
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: 3つのシークレットが検出される
    expect(secrets.length).toBe(3);
    expect(secrets.some((s) => s.name === 'GITHUB_TOKEN')).toBeTruthy();
    expect(secrets.some((s) => s.name === 'AWS_ACCESS_KEY_ID')).toBeTruthy();
    expect(secrets.some((s) => s.name === 'AWS_SECRET_ACCESS_KEY')).toBeTruthy();
  });
});

describe('SecretMaskerファイル処理テスト', () => {
  const originalEnv = { ...process.env };
  let workflowDir: string;

  beforeAll(async () => {
    // テスト用ディレクトリを作成
    workflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-999');
    await fs.ensureDir(workflowDir);
  });

  beforeEach(async () => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    // シークレット環境変数を明示的に削除
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
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

  test('2.2.1: agent_log_raw.txt内のシークレットをマスキング', async () => {
    // Given: シークレットを含むファイル
    process.env.GITHUB_TOKEN = 'ghp_secret123456789';
    const testFile = path.join(workflowDir, '01_requirements', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(
      testFile,
      'Using GitHub token: ghp_secret123456789\nAnother line\nghp_secret123456789 appears again',
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: シークレットがマスキングされる
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBe(2); // 2回出現

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(!content.includes('ghp_secret123456789')).toBeTruthy();
  });

  test('2.2.2: 複数ファイルの複数シークレットをマスキング', async () => {
    // Given: 複数のシークレットと複数のファイル
    process.env.GITHUB_TOKEN = 'ghp_abc1234567890';
    process.env.OPENAI_API_KEY = 'sk-proj-xyz789';

    const file1 = path.join(workflowDir, '02_design', 'execute', 'agent_log_raw.txt');
    const file2 = path.join(workflowDir, '02_design', 'review', 'agent_log.md');

    await fs.ensureDir(path.dirname(file1));
    await fs.ensureDir(path.dirname(file2));

    await fs.writeFile(file1, 'GitHub token: ghp_abc1234567890\nOpenAI key: sk-proj-xyz789');
    await fs.writeFile(file2, '# Review\nAPI key is sk-proj-xyz789');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: 両方のファイルがマスキングされる
    expect(result.filesProcessed).toBe(2);
    expect(result.secretsMasked).toBe(3); // file1に2回、file2に1回

    const content1 = await fs.readFile(file1, 'utf-8');
    expect(content1.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(content1.includes('[REDACTED_OPENAI_API_KEY]')).toBeTruthy();

    const content2 = await fs.readFile(file2, 'utf-8');
    expect(content2.includes('[REDACTED_OPENAI_API_KEY]')).toBeTruthy();
  });

  test('2.2.3: シークレットが含まれていない場合、ファイルを変更しない', async () => {
    // Given: シークレットを含まないファイル
    process.env.GITHUB_TOKEN = 'ghp_secret999';

    const testFile = path.join(workflowDir, '03_implementation', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    const originalContent = 'No secrets here\nJust normal log content';
    await fs.writeFile(testFile, originalContent);

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: ファイルは処理されない
    expect(result.filesProcessed).toBe(0);
    expect(result.secretsMasked).toBe(0);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe(originalContent);
  });

  test('2.2.4: 環境変数が未設定の場合、何もマスキングしない', async () => {
    // Given: 環境変数が未設定
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;

    const testFile = path.join(workflowDir, '04_testing', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(testFile, 'Some content here');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: 何も処理されない
    expect(result.filesProcessed).toBe(0);
    expect(result.secretsMasked).toBe(0);
  });

  test('2.2.5: ファイルが存在しない場合、エラーを返さない', async () => {
    // Given: ファイルが存在しないディレクトリ
    process.env.GITHUB_TOKEN = 'ghp_test123456';
    const emptyDir = path.join(TEST_DIR, '.ai-workflow', 'issue-888');
    await fs.ensureDir(emptyDir);

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(emptyDir);

    // Then: エラーなく完了
    expect(result.filesProcessed).toBe(0);
    expect(result.secretsMasked).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test('2.2.6: prompt.txtファイルもマスキング対象', async () => {
    // Given: prompt.txtにシークレットが含まれる
    process.env.OPENAI_API_KEY = 'sk-test-key-12345678';

    const testFile = path.join(workflowDir, '05_documentation', 'execute', 'prompt.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(testFile, 'Prompt with API key: sk-test-key-12345678');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: prompt.txtがマスキングされる
    expect(result.filesProcessed).toBe(1);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content.includes('[REDACTED_OPENAI_API_KEY]')).toBeTruthy();
    expect(!content.includes('sk-test-key-12345678')).toBeTruthy();
  });

  // Issue #54: metadata.json スキャン対応のテスト
  test('2.2.7: metadata.json内のGitHub Personal Access Tokenをマスキング', async () => {
    // Given: トークンを含むmetadata.json
    process.env.GITHUB_TOKEN = 'ghp_secret123456789';
    const metadataFile = path.join(workflowDir, 'metadata.json');
    await fs.ensureDir(path.dirname(metadataFile));
    await fs.writeFile(
      metadataFile,
      JSON.stringify({
        target_repository: {
          remote_url: 'https://ghp_secret123456789@github.com/owner/repo.git',
          path: '/path/to/repo',
          github_name: 'owner/repo',
          owner: 'owner',
          repo: 'repo',
        },
      }),
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: metadata.json内のトークンがマスキングされる
    expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.secretsMasked).toBeGreaterThan(0);

    const content = await fs.readFile(metadataFile, 'utf-8');
    expect(content.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(!content.includes('ghp_secret123456789')).toBeTruthy();
  });

  test('2.2.8: metadata.jsonにトークンが含まれない場合、ファイルを変更しない', async () => {
    // Given: トークンを含まないmetadata.json
    process.env.GITHUB_TOKEN = 'ghp_secret999';
    const metadataFile = path.join(workflowDir, 'metadata.json');
    await fs.ensureDir(path.dirname(metadataFile));
    const originalContent = JSON.stringify({
      target_repository: {
        remote_url: 'https://github.com/owner/repo.git',
        path: '/path/to/repo',
        github_name: 'owner/repo',
        owner: 'owner',
        repo: 'repo',
      },
    });
    await fs.writeFile(metadataFile, originalContent);

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: metadata.jsonは変更されない
    const content = await fs.readFile(metadataFile, 'utf-8');
    expect(content).toBe(originalContent);
  });

  test('2.2.9: metadata.jsonが存在しない場合、エラーを発生させない', async () => {
    // Given: metadata.jsonが存在しない
    process.env.GITHUB_TOKEN = 'ghp_test123';

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: エラーなく完了
    expect(result.errors.length).toBe(0);
  });
});

describe('SecretMaskerエラーハンドリングテスト', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('2.3.1: 読み取り専用ファイルの場合、エラーを記録', async () => {
    // Given: 読み取り専用ファイル (Windowsではfs.chmodが効かない場合があるのでスキップ)
    // このテストはLinux/Mac環境でのみ有効
    if (process.platform === 'win32') {
      console.log('[INFO] Skipping read-only test on Windows');
      return;
    }

    process.env.GITHUB_TOKEN = 'ghp_readonly123';
    const workflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-777');
    const testFile = path.join(workflowDir, '06_report', 'execute', 'agent_log_raw.txt');

    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(testFile, 'Token: ghp_readonly123');
    await fs.chmod(testFile, 0o444); // 読み取り専用

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: エラーが記録される
    expect(result.errors.length > 0).toBeTruthy();

    // Cleanup
    await fs.chmod(testFile, 0o644);
    await fs.remove(workflowDir);
  });

  test('2.3.2: 存在しないディレクトリでもエラーを発生させない', async () => {
    // Given: 存在しないディレクトリ
    process.env.GITHUB_TOKEN = 'ghp_nonexistent';
    const nonExistentDir = path.join(TEST_DIR, 'nonexistent-dir');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(nonExistentDir);

    // Then: エラーなく完了
    expect(result.filesProcessed).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});
