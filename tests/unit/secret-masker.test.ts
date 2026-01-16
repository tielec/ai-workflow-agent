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

  describe('Issue #603: パス保護と環境変数置換の順序確認', () => {
    test('TC-U-603-010/011: トークンにリポジトリ名のサブストリングが含まれてもパスは保持される', () => {
      process.env.GITHUB_TOKEN = 'ghp_development_secret123';
      const message =
        'Working with token ghp_development_secret123 in /tmp/ai-workflow-repos/sd-platform-development';

      const masked = masker.maskObject(message) as string;

      expect(masked).toContain('/tmp/ai-workflow-repos/sd-platform-development');
      expect(masked).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-U-603-012: 複数のシークレットが重なってもパスを保持しつつ全てマスクする', () => {
      process.env.GITHUB_TOKEN = 'ghp_platform_token';
      process.env.API_KEY = 'key_platform_api';
      const message = 'Paths: /tmp/repos/sd-platform-development/src/platform/module.ts token ghp_platform_token and key_platform_api';

      const masked = masker.maskObject(message) as string;

      expect(masked).toContain('/tmp/repos/sd-platform-development/src/platform/module.ts');
      expect(masked).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(masked).toContain('[REDACTED_API_KEY]');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-U-603-013: 短いパスコンポーネントを含むパスも安全に処理する', () => {
      const shortPath = '/tmp/a/b/c/src/dev/test.ts';

      const masked = masker.maskObject(shortPath) as string;

      expect(masked).toBe(shortPath);
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-U-603-014: 空・null・undefined入力を安全に処理する', () => {
      expect(masker.maskObject('')).toBe('');
      expect(masker.maskObject(null as unknown as string | null)).toBeNull();
      expect(masker.maskObject(undefined as unknown as string | undefined)).toBeUndefined();
    });
  });

  describe('Issue #592: ファイルパスコンポーネントの保護', () => {
    test('Unixパス内の長いディレクトリ名は汎用トークンマスキングから除外される', () => {
      const input = '/tmp/ai-workflow-repos-2-4a4ea5b0/sd-platform-development/.ai-workflow/issue-236';

      const masked = masker.maskObject(input) as string;

      expect(masked).toContain('ai-workflow-repos-2-4a4ea5b0');
      expect(masked).toContain('sd-platform-development');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('パス外に出現した同一文字列はマスキングされる', () => {
      const input = 'Token: sd-platform-development';

      const masked = masker.maskObject(input) as string;

      expect(masked).toContain('[REDACTED_TOKEN]');
      expect(masked).not.toContain('sd-platform-development');
    });

    test('複数の長いパスコンポーネントを保持する', () => {
      const input = '/tmp/very-long-directory-name/another-long-dir-name-here/file.txt';

      const masked = masker.maskObject(input) as string;

      expect(masked).toContain('very-long-directory-name');
      expect(masked).toContain('another-long-dir-name-here');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('パス内とパス外が混在する場合でもパスのみ保持する', () => {
      const input = 'Path /sd-platform-development/ with token sd-platform-development outside';

      const masked = masker.maskObject(input) as string;
      const pathOccurrences = masked.match(/sd-platform-development/g)?.length ?? 0;

      expect(pathOccurrences).toBe(1);
      expect(masked).toContain('/sd-platform-development/');
      expect(masked).toContain('[REDACTED_TOKEN]');
    });

    test('長いファイル名も保護対象になる', () => {
      const input = '/tmp/repo/very-long-filename-that-exceeds-20-chars.md';

      const masked = masker.maskObject(input) as string;

      expect(masked).toContain('very-long-filename-that-exceeds-20-chars.md');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('20文字丁度や数字のみのコンポーネントも保持する', () => {
      const input = '/tmp/exactly-20-chars-dir/12345678901234567890/file.txt';

      const masked = masker.maskObject(input) as string;

      expect(masked).toContain('exactly-20-chars-dir');
      expect(masked).toContain('12345678901234567890');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });
  });

  describe('Issue #592 エッジ: ファイルパス保護の追加ケース (TC-2.3)', () => {
    test('TC-2.3.1 連続するスラッシュを含むパスでも長いコンポーネントを保持する', () => {
      // Given: 連続スラッシュを含む長いパス
      const input = '/tmp//sd-platform-development//file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: パス構造とディレクトリ名がそのまま維持される
      expect(masked).toBe(input);
      expect(masked).toContain('sd-platform-development');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.2 ドットを含む長いディレクトリ名を保持する', () => {
      // Given: ドットを含む29文字のディレクトリ名
      const input = '/tmp/some.long.directory.name.here/file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: ディレクトリ名がマスクされずに保持される
      expect(masked).toContain('some.long.directory.name.here');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.3 アンダースコアとハイフン混在の長いディレクトリ名を保持する', () => {
      // Given: 特殊文字を含む32文字のディレクトリ名
      const input = '/tmp/my_project-name_with-mixed_chars/file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: ディレクトリ名がそのまま残る
      expect(masked).toContain('my_project-name_with-mixed_chars');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.4 数字のみ20文字のディレクトリ名を保持する', () => {
      // Given: 数字のみで20文字のディレクトリ名
      const input = '/tmp/12345678901234567890/file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: 数字のみのコンポーネントも保護される
      expect(masked).toContain('12345678901234567890');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.5 ちょうど20文字のディレクトリ名を保持する', () => {
      // Given: 20文字の境界値ディレクトリ名
      const input = '/tmp/exactly-20-chars-dir/file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: 境界値でもマスキングされない
      expect(masked).toContain('exactly-20-chars-dir');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.6 19文字のディレクトリ名は保護対象外だがマスクされない', () => {
      // Given: 19文字のディレクトリ名（保護対象外だがトークン扱いにもならない）
      const input = '/tmp/exactly-19-char-dir/file.txt';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: 変更されずに保持される
      expect(masked).toBe(input);
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-2.3.7 空文字列入力はそのまま返す', () => {
      // Given: 空文字列
      const input = '';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: 空文字列が返りエラーにならない
      expect(masked).toBe('');
    });

    test('TC-2.3.8 パスのみの文字列でもディレクトリ名を保持する', () => {
      // Given: パスのみが含まれる文字列
      const input = '/tmp/ai-workflow-repos-XXX/sd-platform-development/.ai-workflow';

      // When: マスキングを実行
      const masked = masker.maskObject(input) as string;

      // Then: 両方のディレクトリ名が保持される
      expect(masked).toContain('ai-workflow-repos-XXX');
      expect(masked).toContain('sd-platform-development');
      expect(masked).not.toContain('[REDACTED_TOKEN]');
    });
  });

  describe('Issue #592: maskObject のパス保護 (TC-2.4)', () => {
    test('TC-2.4.1 メタデータオブジェクト内のパスを保持する', () => {
      // Given: target_repository.path を含むメタデータ
      const input = {
        target_repository: {
          path: '/tmp/ai-workflow-repos-2-4a4ea5b0/sd-platform-development/.ai-workflow',
          github_name: 'owner/sd-platform-dev',
        },
        issue_number: 236,
      };

      // When: オブジェクトマスキングを実行
      const masked = masker.maskObject(input) as typeof input;

      // Then: パスとリポジトリ名が保持され、元オブジェクトは変化しない
      expect(masked.target_repository.path).toContain('sd-platform-development');
      expect(masked.target_repository.github_name).toBe('owner/sd-platform-dev');
      expect(masked.target_repository.path).not.toContain('[REDACTED_TOKEN]');
      expect(input.target_repository.path).toBe(
        '/tmp/ai-workflow-repos-2-4a4ea5b0/sd-platform-development/.ai-workflow',
      );
    });

    test('TC-2.4.2 ネストされたオブジェクト内のパスを保持する', () => {
      // Given: ネスト構造内にパスを含むオブジェクト
      const input = {
        workflow: {
          phases: [
            {
              execute: {
                working_directory: '/tmp/sd-platform-development/.ai-workflow/issue-236/01_requirements/execute',
              },
            },
          ],
        },
      };

      // When: オブジェクトマスキングを実行
      const masked = masker.maskObject(input) as typeof input;

      // Then: ネスト内のパスが保持され、マスキングされない
      expect(masked.workflow.phases[0].execute.working_directory).toContain('sd-platform-development');
      expect(masked.workflow.phases[0].execute.working_directory).toContain('.ai-workflow/issue-236');
      expect(masked.workflow.phases[0].execute.working_directory).not.toContain('[REDACTED_TOKEN]');
      expect(input.workflow.phases[0].execute.working_directory).toContain('sd-platform-development');
    });

    test('TC-2.4.3 配列内の複数パスを保持する', () => {
      // Given: 配列内に2つのパスがあるオブジェクト
      const input = {
        files: [
          '/tmp/sd-platform-development/file1.txt',
          '/tmp/another-long-directory-name/file2.txt',
        ],
      };

      // When: オブジェクトマスキングを実行
      const masked = masker.maskObject(input) as typeof input;

      // Then: いずれのパスも保持される
      expect(masked.files[0]).toContain('sd-platform-development');
      expect(masked.files[1]).toContain('another-long-directory-name');
      expect(masked.files[0]).not.toContain('[REDACTED_TOKEN]');
      expect(masked.files[1]).not.toContain('[REDACTED_TOKEN]');
      expect(input.files[0]).toBe('/tmp/sd-platform-development/file1.txt');
    });
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

    // Issue #558/#564: URLs should be fully restored (no placeholders)
    expect(masked).toContain('issue_url: https://github.com/tielec/ai-code-companion/issues/49');
    expect(masked).toContain('pr_url: https://github.com/tielec/ai-code-companion/pull/51');
    expect(masked).not.toContain('__GITHUB_URL_');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('長い owner/repo パターンも復元され、プレースホルダーは残らない', () => {
    const longOwner = 'verylongorganizationname';
    const longRepo = 'extremely-long-repository-name-that-exceeds-limits';
    const input = `Repository: https://github.com/${longOwner}/${longRepo}/issues/123`;
    const masked = metadataMasker.maskObject(input);

    // Issue #558/#564: URLs should be fully restored (no placeholders)
    expect(masked).toContain(`https://github.com/${longOwner}/${longRepo}/issues/123`);
    expect(masked).not.toContain('__GITHUB_URL_');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
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
        secret_token: process.env.GITHUB_TOKEN,
      }),
    );

    // When: シークレットマスキングを実行
    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);

    // Then: metadata.json内のトークンがマスキングされる
    expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.secretsMasked).toBeGreaterThan(0);

    const content = await fs.readFile(metadataFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(content.includes('[REDACTED_GITHUB_TOKEN]')).toBeTruthy();
    expect(parsed.secret_token).toBe('[REDACTED_GITHUB_TOKEN]');
    expect(parsed.target_repository.remote_url).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(parsed.target_repository.remote_url).not.toContain('ghp_secret123456789');
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
    const parsed = JSON.parse(content);
    expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.secretsMasked).toBe(0);
    expect(parsed).toEqual(JSON.parse(originalContent));
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

  describe('Issue #622: metadata.json 専用マスキング', () => {
    const defaultRepo = {
      owner: 'plan-b-co-jp',
      repo: 'sd-platform-development',
      remote_url: 'https://github.com/plan-b-co-jp/sd-platform-development.git',
      github_full_name: 'plan-b-co-jp/sd-platform-development',
      local_path: '/tmp/ai-workflow-repos/sd-platform-development',
    };

    const buildMetadataPayload = (overrides: any = {}) => {
      const base = {
        issue_number: 622,
        target_repository: { ...defaultRepo },
        issue_url: 'https://github.com/plan-b-co-jp/sd-platform-development/issues/622',
        pr_url: 'https://github.com/plan-b-co-jp/sd-platform-development/pull/123',
      };

      return {
        ...base,
        ...overrides,
        target_repository: {
          ...base.target_repository,
          ...(overrides.target_repository ?? {}),
        },
      };
    };

    const writeMetadataFile = async (payload: Record<string, unknown>) => {
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(metadataFile, JSON.stringify(payload, null, 2));
      return metadataFile;
    };

    test('TC-U-622-001: 20文字以上のリポジトリ名を保持する', async () => {
      // Given: リポジトリ情報のみを含む metadata.json
      const metadataFile = path.join(workflowDir, 'metadata.json');
      const original = {
        issue_number: 622,
        target_repository: {
          owner: 'plan-b-co-jp',
          repo: 'sd-platform-development',
          remote_url: 'https://github.com/plan-b-co-jp/sd-platform-development.git',
          github_full_name: 'plan-b-co-jp/sd-platform-development',
          local_path: '/tmp/ai-workflow-repos/sd-platform-development',
        },
        issue_url: 'https://github.com/plan-b-co-jp/sd-platform-development/issues/622',
        pr_url: 'https://github.com/plan-b-co-jp/sd-platform-development/pull/123',
      };
      await fs.writeFile(metadataFile, JSON.stringify(original, null, 2));

      // When: metadata.json を専用メソッドで処理
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then: リポジトリ情報やURLが保持され、シークレットカウントは0
      const content = await fs.readFile(metadataFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(parsed.target_repository.repo).toBe('sd-platform-development');
      expect(parsed.target_repository.owner).toBe('plan-b-co-jp');
      expect(parsed.target_repository.remote_url).toBe(
        'https://github.com/plan-b-co-jp/sd-platform-development.git',
      );
      expect(parsed.issue_url).toContain('/issues/622');
      expect(parsed.pr_url).toContain('/pull/123');
    });

    test('TC-U-622-002: metadata.json 内のシークレットをマスクしつつリポジトリ情報を保持する', async () => {
      // Given: 環境変数と同じトークンを含む metadata.json
      process.env.GITHUB_TOKEN = 'ghp_verylongsecrettoken123456789';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      const secretValue = process.env.GITHUB_TOKEN;
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: {
              owner: 'plan-b-co-jp',
              repo: 'sd-platform-development',
              remote_url: 'https://github.com/plan-b-co-jp/sd-platform-development.git',
            },
            issue_url: 'https://github.com/plan-b-co-jp/sd-platform-development/issues/622',
            secret_token: secretValue,
          },
          null,
          2,
        ),
      );

      // When: metadata.json を処理
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then: シークレットがマスクされ、リポジトリ情報は保持される
      const content = await fs.readFile(metadataFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBeGreaterThanOrEqual(1);
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).not.toContain(secretValue ?? '');
      expect(parsed.target_repository.repo).toBe('sd-platform-development');
      expect(parsed.target_repository.owner).toBe('plan-b-co-jp');
      expect(parsed.target_repository.remote_url).toBe(
        'https://github.com/plan-b-co-jp/sd-platform-development.git',
      );
    });

    test('TC-U-622-003: issue_url と pr_url をマスキング対象から除外する', async () => {
      // Given: URL フィールドのみを持つ metadata.json
      const metadataFile = path.join(workflowDir, 'metadata.json');
      const payload = {
        issue_url: 'https://github.com/owner/repo/issues/123',
        pr_url: 'https://github.com/owner/repo/pull/456',
        target_repository: {
          owner: 'owner',
          repo: 'exactly-20-chars-dir',
        },
      };
      await fs.writeFile(metadataFile, JSON.stringify(payload, null, 2));

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(result.secretsMasked).toBe(0);
      expect(parsed.issue_url).toBe(payload.issue_url);
      expect(parsed.pr_url).toBe(payload.pr_url);
      expect(parsed.target_repository.repo).toBe('exactly-20-chars-dir');
    });

    test('TC-U-622-004: マスキング後もJSONフォーマットを維持する', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_formatchecktoken123456';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: {
              owner: 'owner',
              repo: 'exactly-19-char-dir',
            },
            secret_token: process.env.GITHUB_TOKEN,
          },
          null,
          2,
        ),
      );

      // When
      const masker = new SecretMasker();
      await masker.maskMetadataFile(metadataFile);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
      expect(content.startsWith('{\n  "target_repository"')).toBeTruthy();
      expect(content).toContain('\n  "target_repository": {\n    "owner": "owner",');
    });

    test('TC-U-622-005: 不正なJSONはエラーに記録しつつ例外を投げない', async () => {
      // Given
      const metadataFile = path.join(workflowDir, 'metadata.json');
      const invalidContent = '{ invalid json content';
      await fs.writeFile(metadataFile, invalidContent);

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(content).toBe(invalidContent);
    });

    test('TC-U-622-006: 存在しないパス指定でも例外を投げない', async () => {
      // Given
      const missingPath = path.join(workflowDir, 'missing', 'metadata.json');

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(missingPath);

      // Then
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('TC-U-622-007: 空の metadata.json はそのまま保持される', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_dummy_empty_case';
      const metadataFile = await writeMetadataFile({});

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(content.trim()).toBe('{}');
    });

    test('TC-U-622-008: 20文字のリポジトリ名でも汎用トークンに置換されない', async () => {
      // Given
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: {
              owner: 'owner',
              repo: 'exactly-20-chars-dir',
            },
          },
          null,
          2,
        ),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const parsed = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
      expect(result.filesProcessed).toBe(0);
      expect(parsed.target_repository.repo).toBe('exactly-20-chars-dir');
      expect(JSON.stringify(parsed)).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-U-622-009: 19文字のリポジトリ名も変更しない', async () => {
      // Given
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          target_repository: {
            owner: 'owner',
            repo: 'exactly-19-char-dir',
          },
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const parsed = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(parsed.target_repository.repo).toBe('exactly-19-char-dir');
      expect(JSON.stringify(parsed)).not.toContain('[REDACTED_TOKEN]');
    });

    test('TC-U-622-010: 複数種類のシークレットを正しくカウントする', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_testsecretvalue123';
      process.env.OPENAI_API_KEY = 'sk-proj-test456789';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: { owner: 'owner', repo: 'repo' },
            github_token: process.env.GITHUB_TOKEN,
            openai_token: process.env.OPENAI_API_KEY,
            duplicated: `value=${process.env.GITHUB_TOKEN}`,
          },
          null,
          2,
        ),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then: GITHUB_TOKEN 2箇所 + OPENAI_API_KEY 1箇所をカウント
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(3);
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).toContain('[REDACTED_OPENAI_API_KEY]');
    });

    test('TC-U-622-011: 同一シークレットが複数回出現してもカウントできる', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_repeat_secret_1234567890';
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          token_one: process.env.GITHUB_TOKEN,
          token_two: `value=${process.env.GITHUB_TOKEN}`,
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(2);
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).not.toContain(process.env.GITHUB_TOKEN ?? '');
    });

    test('TC-U-622-012: シークレットが存在しない場合はカウント0', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_no_hit_secret_123456789';
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          note: 'このファイルにはシークレットがありません',
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      expect(result.filesProcessed).toBe(0);
      expect(result.secretsMasked).toBe(0);
      expect(result.errors).toHaveLength(0);
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(content).toContain('シークレットがありません');
    });

    test('TC-U-622-013: 異なる種類のシークレットを合算してカウントする', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_multi_secret_123456789';
      process.env.OPENAI_API_KEY = 'sk-proj-multikey-1';
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          target_repository: { repo: 'sd-platform-development' },
          github_token: process.env.GITHUB_TOKEN,
          openai_key: process.env.OPENAI_API_KEY,
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskMetadataFile(metadataFile);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(2);
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).toContain('[REDACTED_OPENAI_API_KEY]');
    });

    test('TC-U-622-014: ignoredPaths を使い選択的にフィールドを保護する', () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_testsecretvalue123';
      const masker = new SecretMasker();
      const input = {
        target_repository: {
          owner: 'owner',
          repo: 'public-repo',
          remote_url: `https://ghp_testsecretvalue123@github.com/owner/public-repo.git`,
        },
        issue_url: 'https://github.com/owner/public-repo/issues/1',
        notes: `Token: ${process.env.GITHUB_TOKEN}`,
      };

      // When
      const masked = masker.maskObject(input, {
        ignoredPaths: ['target_repository.repo', 'issue_url'],
      }) as typeof input;

      // Then
      expect(masked.target_repository.repo).toBe('public-repo');
      expect(masked.issue_url).toBe(input.issue_url);
      expect(masked.target_repository.remote_url).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(masked.notes).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    test('TC-U-622-015: ネストした ignoredPaths で owner/repo を保持する', () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_sampletokendata1234567890';
      const masker = new SecretMasker();
      const input = {
        target_repository: {
          owner: 'plan-b-co-jp',
          repo: 'sd-platform-development',
          remote_url:
            'https://ghp_sampletokendata1234567890@github.com/plan-b-co-jp/sd-platform-development.git',
        },
        maintainer: 'owner@example.com',
      };

      // When
      const masked = masker.maskObject(input, {
        ignoredPaths: ['target_repository.owner', 'target_repository.repo'],
      }) as typeof input;

      // Then
      expect(masked.target_repository.owner).toBe('plan-b-co-jp');
      expect(masked.target_repository.repo).toBe('sd-platform-development');
      expect(masked.target_repository.remote_url).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(masked.maintainer).toContain('[REDACTED_EMAIL]');
    });

    test('TC-I-622-001: metadata.json と agent_log_raw.txt を統合処理する', async () => {
      // Given: 両ファイルに同じトークンが含まれる
      process.env.GITHUB_TOKEN = 'ghp_integrationtoken123456';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      const agentLog = path.join(workflowDir, '01_requirements', 'execute', 'agent_log_raw.txt');
      await fs.ensureDir(path.dirname(agentLog));
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: {
              owner: 'plan-b-co-jp',
              repo: 'sd-platform-development',
              remote_url: 'https://github.com/plan-b-co-jp/sd-platform-development.git',
            },
            secret_token: process.env.GITHUB_TOKEN,
          },
          null,
          2,
        ),
      );
      await fs.writeFile(agentLog, `Using token ${process.env.GITHUB_TOKEN}`);

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      expect(result.filesProcessed).toBe(2);
      expect(result.secretsMasked).toBeGreaterThanOrEqual(2);
      const maskedMetadata = await fs.readFile(metadataFile, 'utf-8');
      const maskedAgentLog = await fs.readFile(agentLog, 'utf-8');
      expect(maskedMetadata).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(maskedMetadata).toContain('"repo": "sd-platform-development"');
      expect(maskedAgentLog).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    test('TC-I-622-002: metadata.json のみでも専用ロジックで処理する', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_metadata_only_1234567890';
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          secret_token: process.env.GITHUB_TOKEN,
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      const content = await fs.readFile(metadataFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(1);
      expect(parsed.target_repository.repo).toBe('sd-platform-development');
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    test('TC-I-622-003: 23文字のリポジトリ名を保持しつつトークンをマスクする', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_secrettoken123456789012345';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(
        metadataFile,
        JSON.stringify(
          {
            target_repository: {
              owner: 'plan-b-co-jp',
              repo: 'sd-platform-development',
              github_full_name: 'plan-b-co-jp/sd-platform-development',
            },
            secret_token: process.env.GITHUB_TOKEN,
            pr_url: 'https://github.com/plan-b-co-jp/sd-platform-development/pull/259',
          },
          null,
          2,
        ),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBeGreaterThan(0);
      const content = await fs.readFile(metadataFile, 'utf-8');
      expect(content).toContain('"repo": "sd-platform-development"');
      expect(content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(content).toContain('"pr_url": "https://github.com/plan-b-co-jp/sd-platform-development/pull/259"');
    });

    test('TC-I-622-004: finalize 相当の metadata.json を安全に処理する', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_finalize_flow_1234567890';
      const metadataFile = await writeMetadataFile(
        buildMetadataPayload({
          target_repository: {
            remote_url:
              'https://github.com/plan-b-co-jp/sd-platform-development.git',
          },
          deployment_token: process.env.GITHUB_TOKEN,
        }),
      );

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      const maskedContent = await fs.readFile(metadataFile, 'utf-8');
      const parsed = JSON.parse(maskedContent);
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(1);
      expect(parsed.target_repository.owner).toBe('plan-b-co-jp');
      expect(parsed.target_repository.repo).toBe('sd-platform-development');
      expect(parsed.pr_url).toContain('/pull/123');
      expect(maskedContent).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    test('TC-I-622-005: agent_log_raw.txt の既存処理への影響なし', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_agentlog_only_1234567890';
      const agentLog = path.join(workflowDir, '04_testing', 'execute', 'agent_log_raw.txt');
      await fs.ensureDir(path.dirname(agentLog));
      await fs.writeFile(agentLog, `Using ${process.env.GITHUB_TOKEN} in logs`);

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      const maskedAgentLog = await fs.readFile(agentLog, 'utf-8');
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(1);
      expect(maskedAgentLog).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(maskedAgentLog).toContain('Using [REDACTED_GITHUB_TOKEN] in logs');
    });

    test('TC-I-622-006: prompt.txt の処理が維持されている', async () => {
      // Given
      process.env.OPENAI_API_KEY = 'sk-proj-prompt-only-1234567890';
      const promptFile = path.join(workflowDir, '05_documentation', 'execute', 'prompt.txt');
      await fs.ensureDir(path.dirname(promptFile));
      await fs.writeFile(promptFile, `API key: ${process.env.OPENAI_API_KEY}`);

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      const maskedPrompt = await fs.readFile(promptFile, 'utf-8');
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(1);
      expect(maskedPrompt).toContain('[REDACTED_OPENAI_API_KEY]');
    });

    test('TC-I-622-007: metadata.json が不正でも他ファイル処理を継続する', async () => {
      // Given
      process.env.GITHUB_TOKEN = 'ghp_invalidjsoncheck123';
      const metadataFile = path.join(workflowDir, 'metadata.json');
      await fs.writeFile(metadataFile, '{ invalid json content');
      const agentLog = path.join(workflowDir, '02_design', 'execute', 'agent_log_raw.txt');
      await fs.ensureDir(path.dirname(agentLog));
      await fs.writeFile(agentLog, `Token: ${process.env.GITHUB_TOKEN}`);

      // When
      const masker = new SecretMasker();
      const result = await masker.maskSecretsInWorkflowDir(workflowDir);

      // Then
      expect(result.filesProcessed).toBe(1);
      expect(result.secretsMasked).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      const maskedAgentLog = await fs.readFile(agentLog, 'utf-8');
      expect(maskedAgentLog).toContain('[REDACTED_GITHUB_TOKEN]');
    });
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
    // Issue #595: maskString() runs first, so apiKey is masked as [REDACTED_TOKEN] by pattern matching
    // before env var replacement has a chance to use [REDACTED_OPENAI_API_KEY]
    // This is expected behavior - the secret is still correctly masked (security maintained)
    expect(masked.tasks[0].meta.apiKey).toContain('[REDACTED_TOKEN]');
    expect(masked.tasks[0].meta.note).toContain('Bearer [REDACTED_TOKEN]');

    // ignoredPaths に指定した箇所はマスクされない
    expect(masked.tasks[1].meta.raw).toContain('sk-proj-verylongsecretvalue');

    // メールアドレスはマスクされる
    expect(masked.context.summary).toContain('[REDACTED_EMAIL]');

    // 循環参照が保持される（self が存在する）
    expect(masked.self).toBe(masked);
  });
});

describe('Issue #595: Path protection before env var replacement', () => {
  const baseEnv = { ...process.env };
  let masker: SecretMasker;

  beforeEach(() => {
    // Clear all relevant environment variables
    process.env = { ...baseEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.DEV_TOKEN;
    delete process.env.PROD_KEY;
    delete process.env.STAGE_TOKEN;
    delete process.env.SECRET;
    delete process.env.SHORT_VAR;
    delete process.env.EDGE_VAR;
  });

  afterAll(() => {
    process.env = baseEnv;
  });

  // TC-595-U001: Environment variable substring does not mask repository path
  test('should NOT mask repository path when env var contains matching substring', () => {
    // Given: Environment variable containing "development"
    process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxdevelopmentxxxxxxxxx';
    masker = new SecretMasker();

    // When: Processing a path containing "development"
    const input = '/tmp/ai-workflow-repos-5/sd-platform-development/.ai-workflow/issue-236';
    const masked = masker.maskObject(input) as string;

    // Then: Path should be preserved, env var substring should NOT corrupt the path
    expect(masked).toContain('sd-platform-development');
    expect(masked).not.toContain('[REDACTED_GITHUB_TOKEN]');
  });

  // TC-595-U002: Environment variable value outside path context is masked
  test('should mask env var value appearing outside path context', () => {
    // Given: Environment variable with a detectable value
    process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxdevelopmentxxxxxxxxx';
    masker = new SecretMasker();

    // When: Processing text with env var value in non-path context
    const input = 'My token is ghp_xxxxxxxxxxdevelopmentxxxxxxxxx';
    const masked = masker.maskObject(input) as string;

    // Then: Token should be masked
    expect(masked).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(masked).not.toContain('ghp_xxxxxxxxxxdevelopmentxxxxxxxxx');
  });

  // TC-595-U003: Same substring in both path and non-path context
  test('should handle same substring in both path and non-path context', () => {
    // Given: Environment variable (GITHUB_TOKEN) with a value containing "platform" substring
    // The key scenario: env var value contains a substring that matches a path component name
    process.env.GITHUB_TOKEN = 'ghp_platformsecretvalue1234567890';
    masker = new SecretMasker();

    // When: Processing mixed content where:
    // - The full env var value (ghp_platformsecretvalue1234567890) appears outside a path
    // - "platform" substring from env var value appears inside a path component name
    const input = 'Config: ghp_platformsecretvalue1234567890, Path: /repos/sd-platform-development';
    const masked = masker.maskObject(input) as string;

    // Then:
    // - The standalone token outside path context is masked (either as GITHUB_TOKEN or generic token)
    // - The path component "sd-platform-development" is preserved
    expect(masked).toContain('sd-platform-development');
    // Token is masked (either by specific env var name or generic pattern - both are acceptable)
    expect(masked.includes('[REDACTED_GITHUB_TOKEN]') || masked.includes('[REDACTED_TOKEN]')).toBe(true);
    expect(masked).not.toContain('ghp_platformsecretvalue1234567890');
  });

  // TC-595-U004: Multiple repository paths with different matching environment variables
  test('should protect multiple repository paths with different matching env vars', () => {
    // Given: Multiple env vars with common substrings
    process.env.DEV_TOKEN = 'token_with_development_inside';
    process.env.PROD_KEY = 'key_containing_production_value';
    masker = new SecretMasker();

    // When: Processing multiple paths
    const input = `
      Processing: /repos/sd-platform-development/src
      Also: /repos/sd-api-production/config
    `;
    const masked = masker.maskObject(input) as string;

    // Then: Both paths preserved
    expect(masked).toContain('sd-platform-development');
    expect(masked).toContain('sd-api-production');
  });

  // TC-595-U005: Placeholder tokens are not affected by environment variable replacement
  test('should not affect placeholder tokens with env var replacement', () => {
    // Given: Edge case - env var containing placeholder-like text
    process.env.EDGE_VAR = 'value_with_PATH_inside';
    masker = new SecretMasker();

    // When: Processing path with long component
    const input = '/tmp/ai-workflow-repos-2-4a4ea5b0/repo/.ai-workflow';
    const masked = masker.maskObject(input) as string;

    // Then: Path preserved, no placeholder artifacts
    expect(masked).toContain('ai-workflow-repos-2-4a4ea5b0');
    expect(masked).not.toContain('__PATH_COMPONENT_');
  });

  // TC-595-U006: Short path components with environment variable substring match
  test('should preserve short path components even with env var substring match', () => {
    // Given: Short env var that matches short path component
    process.env.SHORT_VAR = 'dev';
    masker = new SecretMasker();

    // When: Processing path with short component
    const input = '/tmp/repos/my-dev-project/src';
    const masked = masker.maskObject(input) as string;

    // Then: Short component preserved (even though <20 chars)
    expect(masked).toContain('my-dev-project');
  });

  // TC-595-U007: Environment variable containing "platform" does not mask path with "platform"
  test('should NOT mask path when env var contains "platform" substring', () => {
    // Given: Environment variable containing "platform"
    process.env.OPENAI_API_KEY = 'sk-platformproductionkey123456789';
    masker = new SecretMasker();

    // When: Processing path containing "platform"
    const input = '/tmp/ai-workflow-repos-5/sd-platform-development';
    const masked = masker.maskObject(input) as string;

    // Then: Full path including sd-platform-development is preserved
    expect(masked).toContain('sd-platform-development');
    expect(masked).not.toContain('[REDACTED_');
  });

  // TC-595-U008: Object with nested paths - path protection in deep structures
  test('should preserve paths in nested objects', () => {
    // Given: Environment variable with matching substring
    process.env.GITHUB_TOKEN = 'ghp_developmenttoken123456789';
    masker = new SecretMasker();

    // When: Processing nested object with paths
    const input = {
      workflow: {
        phases: [{
          execute: {
            working_directory: '/tmp/sd-platform-development/.ai-workflow/issue-236/execute'
          }
        }]
      }
    };
    const masked = masker.maskObject(input) as typeof input;

    // Then: Path in nested structure is preserved
    expect(masked.workflow.phases[0].execute.working_directory).toContain('sd-platform-development');
    expect(masked.workflow.phases[0].execute.working_directory).not.toContain('[REDACTED_');
  });

  // TC-595-U009: Array of paths with different env var substring matches
  test('should preserve all paths in array even with multiple env var substring matches', () => {
    // Given: Multiple environment variables with different substrings
    process.env.DEV_TOKEN = 'dev_token_development_value';
    process.env.PROD_KEY = 'prod_token_production_value';
    process.env.STAGE_TOKEN = 'stage_token_staging_value';
    masker = new SecretMasker();

    // When: Processing array of paths
    const input = {
      paths: [
        '/repos/sd-platform-development/src',
        '/repos/sd-api-production/config',
        '/repos/sd-core-staging/tests'
      ]
    };
    const masked = masker.maskObject(input) as typeof input;

    // Then: All paths in array are preserved
    expect(masked.paths[0]).toContain('sd-platform-development');
    expect(masked.paths[1]).toContain('sd-api-production');
    expect(masked.paths[2]).toContain('sd-core-staging');
  });

  // TC-595-U010: Full environment variable value equals path component (edge case)
  test('should handle case where full env var value equals path component', () => {
    // Given: Environment variable value that exactly equals a path component name
    // Note: SecretMasker only scans predefined env vars, so use GITHUB_TOKEN
    // The value is exactly 23 chars, which is above the 20-char protection threshold
    process.env.GITHUB_TOKEN = 'sd-platform-development';
    masker = new SecretMasker();

    // When: Processing path where component matches env var value exactly
    const input = '/tmp/repos/sd-platform-development/.ai-workflow';
    const masked = masker.maskObject(input) as string;

    // Then: When env var value EXACTLY matches a path component:
    // - The path structure is preserved (/tmp/repos/.../.ai-workflow)
    // - But the env var value is still replaced because after path protection
    //   restores placeholders, the exact env var value exists in the string
    // This is expected behavior - if your env var value IS a path component,
    // it will be masked. The fix prevents PARTIAL substring matches, not exact matches.
    expect(masked).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(masked).toContain('/tmp/repos/');
    expect(masked).toContain('.ai-workflow');
  });

  // TC-595-R001: Existing Issue #592 path protection still works
  test('should preserve existing Issue #592 path protection behavior', () => {
    // Given: Standard path string without special env vars
    masker = new SecretMasker();

    // When: Processing a path with long components
    const input = '/tmp/ai-workflow-repos-2-4a4ea5b0/sd-platform-development/.ai-workflow/issue-236';
    const masked = masker.maskObject(input) as string;

    // Then: Long path components are NOT masked with [REDACTED_TOKEN]
    expect(masked).toContain('ai-workflow-repos-2-4a4ea5b0');
    expect(masked).toContain('sd-platform-development');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  // TC-595-B001: Path component exactly 20 characters with env var substring match
  test('should preserve 20-character path component even with env var substring match', () => {
    // Given: Environment variable containing matching substring
    process.env.GITHUB_TOKEN = 'ghp_exactly-20-chars';
    masker = new SecretMasker();

    // When: Processing path with exactly 20-character component
    const input = '/tmp/exactly-20-chars-dir/file.txt';
    const masked = masker.maskObject(input) as string;

    // Then: 20-character component is preserved
    expect(masked).toContain('exactly-20-chars-dir');
    expect(masked).not.toContain('[REDACTED_');
  });

  // TC-595-B002: Path component 19 characters (below threshold)
  test('should not mask 19-character path component', () => {
    // Given: Path with 19-character component
    masker = new SecretMasker();

    // When: Processing path with short component
    const input = '/tmp/exactly-19-char-dir/file.txt';
    const masked = masker.maskObject(input) as string;

    // Then: Component preserved (short strings not masked)
    expect(masked).toBe(input);
    expect(masked).not.toContain('[REDACTED_');
  });

  // TC-595-B003: Empty string input
  test('should handle empty string input', () => {
    // Given: Environment variable set
    process.env.GITHUB_TOKEN = 'ghp_developmenttest123';
    masker = new SecretMasker();

    // When: Processing empty string
    const input = '';
    const masked = masker.maskObject(input) as string;

    // Then: Empty string returned without error
    expect(masked).toBe('');
  });

  // Issue #595 exact reproduction scenario
  test('should fix Issue #595 - path NOT become sd-platform-[REDACTED_GITHUB_TOKEN]', () => {
    // Given: Exact scenario from issue - env var contains "development"
    process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxdevelopmentxxxxxxxxx';
    masker = new SecretMasker();

    // When: Processing the exact path from the issue
    const input = '/tmp/ai-workflow-repos-5-05c8a277/sd-platform-development/.ai-workflow/issue-236';
    const masked = masker.maskObject(input) as string;

    // Then: Path should NOT be corrupted
    expect(masked).toContain('sd-platform-development');
    expect(masked).not.toContain('sd-platform-[REDACTED_GITHUB_TOKEN]');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  // Test that env var containing multiple path keywords doesn't corrupt multiple paths
  test('should handle env var containing multiple path-like keywords', () => {
    // Given: Environment variable containing multiple common keywords
    process.env.GITHUB_TOKEN = 'ghp_development_production_staging_test';
    masker = new SecretMasker();

    // When: Processing paths with those keywords
    const input = `
      Dev: /repos/sd-platform-development/src
      Prod: /repos/sd-api-production/config
      Stage: /repos/sd-core-staging/tests
    `;
    const masked = masker.maskObject(input) as string;

    // Then: All paths preserved
    expect(masked).toContain('sd-platform-development');
    expect(masked).toContain('sd-api-production');
    expect(masked).toContain('sd-core-staging');
    expect(masked).not.toContain('[REDACTED_GITHUB_TOKEN]');
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
