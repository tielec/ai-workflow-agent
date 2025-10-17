/**
 * ユニットテスト: secret-masker.ts
 *
 * テスト対象:
 * - SecretMasker.getSecretList()
 * - SecretMasker.maskSecretsInWorkflowDir()
 * - 環境変数ベースのシークレット検出
 * - ファイル内のシークレット置換
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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

  after(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  it('2.1.1: 環境変数が設定されている場合、シークレットを検出する', () => {
    // Given: 環境変数にシークレットが設定されている
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';
    process.env.OPENAI_API_KEY = 'sk-proj-test1234567890abcdefghij';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: 2つのシークレットが検出される
    assert.equal(secrets.length, 2);
    assert.ok(secrets.some((s) => s.name === 'GITHUB_TOKEN' && s.value === 'ghp_test1234567890abcdefghij'));
    assert.ok(secrets.some((s) => s.name === 'OPENAI_API_KEY' && s.value === 'sk-proj-test1234567890abcdefghij'));
  });

  it('2.1.2: 環境変数が空の場合、シークレットを検出しない', () => {
    // Given: 環境変数が未設定
    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: シークレットが検出されない
    assert.equal(secrets.length, 0);
  });

  it('2.1.3: 短い値(10文字以下)は無視される', () => {
    // Given: 短いシークレット値
    process.env.GITHUB_TOKEN = 'short123';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: シークレットが検出されない
    assert.equal(secrets.length, 0);
  });

  it('2.1.4: AWS認証情報を含む複数のシークレットを検出', () => {
    // Given: 複数の環境変数が設定されている
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

    // When: シークレットリストを取得
    const masker = new SecretMasker();
    const secrets = masker.getSecretList();

    // Then: 3つのシークレットが検出される
    assert.equal(secrets.length, 3);
    assert.ok(secrets.some((s) => s.name === 'GITHUB_TOKEN'));
    assert.ok(secrets.some((s) => s.name === 'AWS_ACCESS_KEY_ID'));
    assert.ok(secrets.some((s) => s.name === 'AWS_SECRET_ACCESS_KEY'));
  });
});

describe('SecretMaskerファイル処理テスト', () => {
  const originalEnv = { ...process.env };
  let workflowDir: string;

  before(async () => {
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

  after(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
    // 環境変数を復元
    process.env = originalEnv;
  });

  it('2.2.1: agent_log_raw.txt内のシークレットをマスキング', async () => {
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
    assert.equal(result.filesProcessed, 1);
    assert.equal(result.secretsMasked, 2); // 2回出現

    const content = await fs.readFile(testFile, 'utf-8');
    assert.ok(content.includes('[REDACTED_GITHUB_TOKEN]'));
    assert.ok(!content.includes('ghp_secret123456789'));
  });

  it('2.2.2: 複数ファイルの複数シークレットをマスキング', async () => {
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
    assert.equal(result.filesProcessed, 2);
    assert.equal(result.secretsMasked, 3); // file1に2回、file2に1回

    const content1 = await fs.readFile(file1, 'utf-8');
    assert.ok(content1.includes('[REDACTED_GITHUB_TOKEN]'));
    assert.ok(content1.includes('[REDACTED_OPENAI_API_KEY]'));

    const content2 = await fs.readFile(file2, 'utf-8');
    assert.ok(content2.includes('[REDACTED_OPENAI_API_KEY]'));
  });

  it('2.2.3: シークレットが含まれていない場合、ファイルを変更しない', async () => {
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
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.secretsMasked, 0);

    const content = await fs.readFile(testFile, 'utf-8');
    assert.equal(content, originalContent);
  });

  it('2.2.4: 環境変数が未設定の場合、何もマスキングしない', async () => {
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
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.secretsMasked, 0);
  });

  it('2.2.5: ファイルが存在しない場合、エラーを返さない', async () => {
    // Given: ファイルが存在しないディレクトリ
    process.env.GITHUB_TOKEN = 'ghp_test123456';
    const emptyDir = path.join(TEST_DIR, '.ai-workflow', 'issue-888');
    await fs.ensureDir(emptyDir);

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(emptyDir);

    // Then: エラーなく完了
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.secretsMasked, 0);
    assert.equal(result.errors.length, 0);
  });

  it('2.2.6: prompt.txtファイルもマスキング対象', async () => {
    // Given: prompt.txtにシークレットが含まれる
    process.env.OPENAI_API_KEY = 'sk-test-key-12345678';

    const testFile = path.join(workflowDir, '05_documentation', 'execute', 'prompt.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(testFile, 'Prompt with API key: sk-test-key-12345678');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: prompt.txtがマスキングされる
    assert.equal(result.filesProcessed, 1);

    const content = await fs.readFile(testFile, 'utf-8');
    assert.ok(content.includes('[REDACTED_OPENAI_API_KEY]'));
    assert.ok(!content.includes('sk-test-key-12345678'));
  });
});

describe('SecretMaskerエラーハンドリングテスト', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  after(() => {
    process.env = originalEnv;
  });

  it('2.3.1: 読み取り専用ファイルの場合、エラーを記録', async () => {
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
    assert.ok(result.errors.length > 0);

    // Cleanup
    await fs.chmod(testFile, 0o644);
    await fs.remove(workflowDir);
  });

  it('2.3.2: 存在しないディレクトリでもエラーを発生させない', async () => {
    // Given: 存在しないディレクトリ
    process.env.GITHUB_TOKEN = 'ghp_nonexistent';
    const nonExistentDir = path.join(TEST_DIR, 'nonexistent-dir');

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(nonExistentDir);

    // Then: エラーなく完了
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.errors.length, 0);
  });
});
