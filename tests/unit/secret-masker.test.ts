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
import { logger } from '../../src/utils/logger.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'secret-masker-test');

describe('SecretMasker汎用パターンマスキング (maskObject)', () => {
  const baseEnv = { ...process.env };
  let masker: SecretMasker;

  beforeEach(() => {
    process.env = { ...baseEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    masker = new SecretMasker();
  });

  afterAll(() => {
    process.env = baseEnv;
  });

  test('2.1.x: GitHubトークンは汎用トークンより優先してマスキングされる', () => {
    // Given: ghp_ と github_pat_ を含む文字列
    const input =
      'Push tokens ghp_1234567890123456789012345 and github_pat_1234567890123456789012345';

    // When: オブジェクトマスキングを実行
    const masked = masker.maskObject(input);

    // Then: 両方とも [REDACTED_GITHUB_TOKEN] でマスクされ、汎用トークン扱いされない
    const matches = masked.match(/\[REDACTED_GITHUB_TOKEN\]/g) ?? [];
    expect(matches.length).toBe(2);
    expect(masked).not.toContain('ghp_1234567890123456789012345');
    expect(masked).not.toContain('github_pat_1234567890123456789012345');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('2.1.x: メールアドレスはマスクされ、無効な形式は保持される', () => {
    // Given: 有効と無効のメールアドレスを含む文字列
    const input = 'Contact user@example.com or admin@localhost for access';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: 有効なメールのみマスキングされる
    expect(masked).toContain('[REDACTED_EMAIL]');
    expect(masked).toContain('admin@localhost');
  });

  test('2.1.x: 20文字以上の汎用トークンのみマスキングされる', () => {
    // Given: 長さ違いのトークンを含む文字列
    const input = 'Valid AKIAIOSFODNN7EXAMPLE vs short_token_12345';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: 20文字以上のみマスキングされる
    expect(masked).toContain('[REDACTED_TOKEN]');
    expect(masked).toContain('short_token_12345');
  });

  test('2.1.x: Bearerトークンは大文字小文字を問わずマスキングされる', () => {
    // Given: 大文字・小文字混在のBearerトークン
    const input = 'Authorization: BEARER Jwt.Token.Value';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: トークン部分のみマスキングされる
    expect(masked).toContain('BEARER [REDACTED_TOKEN]');
    expect(masked).not.toContain('Jwt.Token.Value');
  });

  test('2.1.x: token= 形式のトークンをマスキングする', () => {
    // Given: token= 形式を含む文字列
    const input = 'URL param token=abc123def456 and access_token=value';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: token= とそのバリアントがマスキングされる
    expect(masked).toContain('token=[REDACTED_TOKEN]');
    expect(masked).toContain('access_token=[REDACTED_TOKEN]');
  });

  test('2.1.x: 複数パターンを含んでもすべてマスキングされる', () => {
    // Given: GitHubトークン、メール、Bearerが混在する文字列
    const input =
      'ghp_12345678901234567890 user@example.com Bearer abc123 should all be hidden';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: 全てのパターンがマスキングされる
    expect(masked).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(masked).toContain('[REDACTED_EMAIL]');
    expect(masked).toContain('Bearer [REDACTED_TOKEN]');
  });

  test('2.1.x: マッチしない場合は文字列が変更されない', () => {
    // Given: マスキング対象を含まない文字列
    const input = 'Hello, World! This is a normal message.';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: 文字列はそのまま
    expect(masked).toBe(input);
  });

  test('Issue #514: GitHubリポジトリ名（owner/repo形式）は汎用トークンマスキングから除外される', () => {
    // Given: GitHubリポジトリ名を含むメタデータJSON風の文字列
    const input = `{
      "target_repository": {
        "github_name": "tielec/infrastructure-as-code",
        "owner": "tielec",
        "repo": "infrastructure-as-code"
      }
    }`;

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: リポジトリ名は保持され、[REDACTED_TOKEN]に置換されない
    expect(masked).toContain('"github_name": "tielec/infrastructure-as-code"');
  });

  test('Issue #514: 複数のGitHubリポジトリ名が混在しても正しく保持される', () => {
    // Given: 複数のリポジトリ名を含む文字列
    const input = 'Repositories: tielec/ai-workflow-agent, tielec/infrastructure-as-code, owner/very-long-repository-name-that-exceeds-20-chars';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: すべてのリポジトリ名が保持される
    expect(masked).toContain('tielec/ai-workflow-agent');
    expect(masked).toContain('tielec/infrastructure-as-code');
    expect(masked).toContain('owner/very-long-repository-name-that-exceeds-20-chars');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('Issue #514: GitHub URLに含まれるリポジトリ名も保持される', () => {
    // Given: GitHub URLを含む文字列
    const input = 'Remote URL: https://github.com/tielec/infrastructure-as-code.git';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: リポジトリ名が保持される
    expect(masked).toContain('tielec/infrastructure-as-code');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('Issue #514: リポジトリ名とは無関係な20文字以上のトークンは依然としてマスキングされる', () => {
    // Given: リポジトリ名と汎用トークンが混在する文字列
    const input = 'Repository: tielec/infrastructure-as-code, Token: AKIAIOSFODNN7EXAMPLE1234567890';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: リポジトリ名は保持され、トークンのみマスキングされる
    expect(masked).toContain('tielec/infrastructure-as-code');
    expect(masked).toContain('[REDACTED_TOKEN]');
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE1234567890');
  });

  test('Issue #564: Git commit hash（40文字の16進数）は汎用トークンマスキングから除外される', () => {
    // Given: Git commit hash を含むメタデータJSON風の文字列
    const input = `{
      "base_commit": "a3ce4e2453521cca16c96dfe00176b3013c9dd34",
      "current_commit": "8bffa731a963a121b29b53349567bfa72ca1da36"
    }`;

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: Git commit hash は保持され、[REDACTED_TOKEN]に置換されない
    expect(masked).toContain('a3ce4e2453521cca16c96dfe00176b3013c9dd34');
    expect(masked).toContain('8bffa731a963a121b29b53349567bfa72ca1da36');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('Issue #564: Git commit hash と汎用トークンが混在する場合、commit hash のみ保持される', () => {
    // Given: Git commit hash と AWS トークンが混在する文字列
    const input = 'base_commit: a3ce4e2453521cca16c96dfe00176b3013c9dd34, AWS Key: AKIAIOSFODNN7EXAMPLE1234567890';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: Git commit hash は保持され、AWS トークンのみマスキングされる
    expect(masked).toContain('a3ce4e2453521cca16c96dfe00176b3013c9dd34');
    expect(masked).toContain('[REDACTED_TOKEN]');
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE1234567890');
  });

  test('Issue #564: 40文字でも16進数以外（A-Fを含む）の文字列は汎用トークンとしてマスキングされる', () => {
    // Given: 40文字だが16進数ではない文字列（Gを含む）
    const input = 'Invalid hash: G3ce4e2453521cca16c96dfe00176b3013c9dd34';

    // When: マスキングを実行
    const masked = masker.maskObject(input);

    // Then: 汎用トークンとしてマスキングされる
    expect(masked).toContain('[REDACTED_TOKEN]');
    expect(masked).not.toContain('G3ce4e2453521cca16c96dfe00176b3013c9dd34');
  });
});

describe('Issue #558 metadata preservation', () => {
  const metadataMasker = new SecretMasker();

  test('GitHub issue/pr URLs are kept intact after masking', () => {
    const input =
      'issue_url: https://github.com/tielec/ai-code-companion/issues/49, pr_url: https://github.com/tielec/ai-code-companion/pull/51';
    const masked = metadataMasker.maskObject(input);

    expect(masked).toContain('issue_url: https://');
    expect(masked).toContain('pr_url: https://');
    expect(masked).toContain('/issues/49');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('長い owner/repo パターンも復元され、プレースホルダーは残らない', () => {
    const longOwner = 'verylongorganizationname';
    const longRepo = 'extremely-long-repository-name-that-exceeds-limits';
    const input = `Repository: https://github.com/${longOwner}/${longRepo}/issues/123`;
    const masked = metadataMasker.maskObject(input);

    expect(masked).toContain('https://__GITHUB_URL_');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
    expect(masked).toContain('/issues/123');
  });

  test('implementation_strategyキーは colon 付きであればマスキングされない', () => {
    const input = 'implementation_strategy: null, very_long_implementation_strategy_name_over_twenty_chars: true';
    const masked = metadataMasker.maskObject(input);

    expect(masked).toContain('implementation_strategy: null');
    expect(masked).toContain('very_long_implementation_strategy_name_over_twenty_chars: true');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('ignoredPaths を使うと metadata の重要フィールドだけマスク対象外になる', () => {
    const metadata = {
      issue_url: 'https://github.com/tielec/ai-code-companion/issues/49',
      pr_url: 'https://github.com/tielec/ai-code-companion/pull/51',
      secret_token: 'AKIAIOSFODNN7EXAMPLE1234567890',
      base_commit: 'a1b2c3d4e5f6789012345678901234567890abcd',
      design_decisions: {
        implementation_strategy: null,
      },
    };

    const masked = metadataMasker.maskObject(metadata, {
      ignoredPaths: ['issue_url', 'pr_url', 'design_decisions.implementation_strategy'],
    }) as typeof metadata;

    expect(masked.issue_url).toBe(metadata.issue_url);
    expect(masked.pr_url).toBe(metadata.pr_url);
    expect(masked.design_decisions.implementation_strategy).toBeNull();
    expect(masked.secret_token).toBe('[REDACTED_TOKEN]');
    // Issue #564: Git commit hashes (40-char hex) are not masked
    expect(masked.base_commit).toBe('a1b2c3d4e5f6789012345678901234567890abcd');
  });
});

describe('SecretMasker環境変数検出テスト', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
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

  test('2.2.10: 汎用パターンでGitHubトークンをファイル内マスキング', async () => {
    // Given: ghp_ と github_pat_ が含まれるファイル（環境変数値とは異なる）
    process.env.OPENAI_API_KEY = 'sk-proj-dummy-1234567890abcdef';
    const testFile = path.join(workflowDir, '07_generic', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(
      testFile,
      'Found ghp_abcdef123456789012345678 and github_pat_1234567890abcdefghij in logs',
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: 汎用パターンでマスキングされ、ファイルが処理されたと判定される
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBe(0); // 環境変数一致はない

    const content = await fs.readFile(testFile, 'utf-8');
    const matches = content.match(/\[REDACTED_GITHUB_TOKEN]/g) ?? [];
    expect(matches.length).toBe(2);
    expect(content).not.toContain('ghp_abcdef123456789012345678');
    expect(content).not.toContain('github_pat_1234567890abcdefghij');
  });

  test('2.2.11: 環境変数マッチと汎用パターンを併用してマスキング', async () => {
    // Given: 環境変数と別の汎用パターンを含むファイル
    process.env.GITHUB_TOKEN = 'ghp_envvar1234567890abc';
    const testFile = path.join(workflowDir, '08_combined', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(
      testFile,
      `
Using env token: ghp_envvar1234567890abc
Another token: ghp_different9876543210xyz
Email: test@example.com
`,
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: 環境変数一致と汎用パターンの両方がマスクされる
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBe(1);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(content.includes('[REDACTED_EMAIL]')).toBeTruthy();
    expect(content).not.toContain('ghp_envvar1234567890abc');
    expect(content).not.toContain('ghp_different9876543210xyz');
    expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
  });

  test('2.2.12: Email と 20文字以上のトークンをファイルでマスキング', async () => {
    // Given: メールと汎用トークンを含むファイル
    process.env.OPENAI_API_KEY = 'sk-proj-dummy-1234567890abcdef';
    const testFile = path.join(workflowDir, '09_email_token', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(
      testFile,
      'Contact user@example.com with key AKIAIOSFODNN7EXAMPLE and short short_token_12345',
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: メールと長いトークンのみマスキングされる
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBe(0);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toContain('[REDACTED_EMAIL]');
    expect(content).toContain('[REDACTED_TOKEN]');
    expect(content).toContain('short_token_12345');
  });

  test('2.2.13: Bearer と token= 形式をファイル内でマスキング', async () => {
    // Given: Bearer と token= 形式を含むファイル
    process.env.OPENAI_API_KEY = 'sk-proj-dummy-1234567890abcdef';
    const testFile = path.join(workflowDir, '10_bearer_token', 'execute', 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(testFile));
    await fs.writeFile(
      testFile,
      'Authorization: Bearer abc123\nURL: https://api.example.com?token=XYZ789',
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: 両方の形式がマスキングされる
    expect(result.filesProcessed).toBe(1);
    expect(result.secretsMasked).toBe(0);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toContain('Bearer [REDACTED_TOKEN]');
    expect(content).toContain('token=[REDACTED_TOKEN]');
  });
});

describe('SecretMasker.maskObject 再帰コピー', () => {
  const baseEnv = { ...process.env };
  let originalClaudeToken: string | undefined;

  beforeEach(() => {
    originalClaudeToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-proj-verylongsecretvalue-1234567890ABCDE';
  });

  afterEach(() => {
    if (originalClaudeToken === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalClaudeToken;
    }

    if (baseEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = baseEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test('secret_masker_mask_object_正常系', () => {
    // Given: シークレットと循環参照を含むオブジェクト
    const masker = new SecretMasker();
    const source: any = {
      issueNumber: 119,
      tasks: [
        {
          description: 'token=XYZ987654321 をクリアし、owner@example.com へ共有する',
          meta: {
            apiKey: 'sk-proj-verylongsecretvalue-1234567890ABCDE',
            note: 'Bearer sk-test-abc12345 を含むログは除外する',
          },
        },
        {
          description: 'この項目はマスク対象外',
          meta: {
            raw: 'OPENAI KEY: sk-proj-verylongsecretvalue-1234567890ABCDE',
          },
        },
      ],
      context: {
        summary: 'owner@example.com と調整済み',
      },
    };
    source.self = source; // 循環参照

    const masked = masker.maskObject(source, { ignoredPaths: ['tasks.1.meta'] });

    // Then: 元オブジェクトは変更されない
    expect(source.tasks[0].meta.apiKey).toBe('sk-proj-verylongsecretvalue-1234567890ABCDE');
    expect(source.tasks[1].meta.raw).toContain('sk-proj-verylongsecretvalue');

    // And: マスキング結果が期待通り
    expect(masked).not.toBe(source);
    expect(masked.tasks[0].description).toContain('[REDACTED_TOKEN]');
    // apiKey は環境変数と一致するため [REDACTED_OPENAI_API_KEY] でマスクされる
    expect(masked.tasks[0].meta.apiKey).toContain('[REDACTED_OPENAI_API_KEY]');
    expect(masked.tasks[0].meta.note).toContain('Bearer [REDACTED_TOKEN]');

    // ignoredPaths に指定した箇所はマスクされない
    expect(masked.tasks[1].meta.raw).toContain('sk-proj-verylongsecretvalue');

    // メールアドレスはマスクされる
    expect(masked.context.summary).toContain('[REDACTED_EMAIL]');

    // 循環参照が保持される（self が存在する）
    expect(masked.self).toBe(masked);
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
      logger.info('Skipping read-only test on Windows');
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
