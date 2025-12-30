/**
 * ユニットテスト: config.ts (Issue #51)
 *
 * テスト対象:
 * - IConfig interface
 * - Config class
 * - config singleton instance
 *
 * テスト戦略: UNIT_ONLY
 * - 環境変数アクセスの一元化
 * - 必須環境変数の検証
 * - オプション環境変数の取得
 * - フォールバックロジックの動作
 * - CI環境判定
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Config, config } from '../../../src/core/config.js';

describe('Config - GitHub関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数のバックアップ
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 環境変数の復元
    process.env = originalEnv;
  });

  describe('getGitHubToken()', () => {
    test('2.1.1: getGitHubToken_正常系_トークンが設定されている場合', () => {
      // Given: GITHUB_TOKEN が設定されている
      process.env.GITHUB_TOKEN = 'ghp_test_token_123';
      const testConfig = new Config();

      // When: getGitHubToken()を呼び出す
      const result = testConfig.getGitHubToken();

      // Then: トークンが返される
      expect(result).toBe('ghp_test_token_123');
    });

    test('2.1.2: getGitHubToken_正常系_トークンの前後に空白がある場合', () => {
      // Given: GITHUB_TOKEN が設定されている（前後に空白あり）
      process.env.GITHUB_TOKEN = '  ghp_test_token_123  ';
      const testConfig = new Config();

      // When: getGitHubToken()を呼び出す
      const result = testConfig.getGitHubToken();

      // Then: トークンがトリムされて返される
      expect(result).toBe('ghp_test_token_123');
    });

    test('2.1.3: getGitHubToken_異常系_トークンが未設定の場合', () => {
      // Given: GITHUB_TOKEN が未設定
      delete process.env.GITHUB_TOKEN;
      const testConfig = new Config();

      // When/Then: getGitHubToken()を呼び出すと例外がスローされる
      expect(() => testConfig.getGitHubToken()).toThrow(
        'GITHUB_TOKEN environment variable is required. Please set your GitHub personal access token with repo, workflow, and read:org scopes.',
      );
    });

    test('2.1.4: getGitHubToken_異常系_トークンが空文字列の場合', () => {
      // Given: GITHUB_TOKEN が空文字列
      process.env.GITHUB_TOKEN = '';
      const testConfig = new Config();

      // When/Then: getGitHubToken()を呼び出すと例外がスローされる
      expect(() => testConfig.getGitHubToken()).toThrow(
        'GITHUB_TOKEN environment variable is required',
      );
    });

    test('2.1.5: getGitHubToken_異常系_トークンが空白のみの場合', () => {
      // Given: GITHUB_TOKEN が空白のみ
      process.env.GITHUB_TOKEN = '   ';
      const testConfig = new Config();

      // When/Then: getGitHubToken()を呼び出すと例外がスローされる
      expect(() => testConfig.getGitHubToken()).toThrow(
        'GITHUB_TOKEN environment variable is required',
      );
    });
  });

  describe('getGitHubRepository()', () => {
    test('2.1.6: getGitHubRepository_正常系_リポジトリ名が設定されている場合', () => {
      // Given: GITHUB_REPOSITORY が設定されている
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      const testConfig = new Config();

      // When: getGitHubRepository()を呼び出す
      const result = testConfig.getGitHubRepository();

      // Then: リポジトリ名が返される
      expect(result).toBe('owner/repo');
    });

    test('2.1.7: getGitHubRepository_正常系_リポジトリ名が未設定の場合', () => {
      // Given: GITHUB_REPOSITORY が未設定
      delete process.env.GITHUB_REPOSITORY;
      const testConfig = new Config();

      // When: getGitHubRepository()を呼び出す
      const result = testConfig.getGitHubRepository();

      // Then: nullが返される
      expect(result).toBeNull();
    });

    test('2.1.8: getGitHubRepository_正常系_リポジトリ名の前後に空白がある場合', () => {
      // Given: GITHUB_REPOSITORY が設定されている（前後に空白あり）
      process.env.GITHUB_REPOSITORY = '  owner/repo  ';
      const testConfig = new Config();

      // When: getGitHubRepository()を呼び出す
      const result = testConfig.getGitHubRepository();

      // Then: リポジトリ名がトリムされて返される
      expect(result).toBe('owner/repo');
    });

    test('2.1.9: getGitHubRepository_エッジケース_空文字列の場合', () => {
      // Given: GITHUB_REPOSITORY が空文字列
      process.env.GITHUB_REPOSITORY = '';
      const testConfig = new Config();

      // When: getGitHubRepository()を呼び出す
      const result = testConfig.getGitHubRepository();

      // Then: nullが返される
      expect(result).toBeNull();
    });

    test('2.1.10: getGitHubRepository_エッジケース_空白のみの場合', () => {
      // Given: GITHUB_REPOSITORY が空白のみ
      process.env.GITHUB_REPOSITORY = '   ';
      const testConfig = new Config();

      // When: getGitHubRepository()を呼び出す
      const result = testConfig.getGitHubRepository();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });
});

describe('Config - エージェント関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCodexApiKey() - フォールバックロジック', () => {
    test('2.2.1: getCodexApiKey_正常系_CODEX_API_KEYが設定されている場合', () => {
      // Given: CODEX_API_KEY が設定されている
      process.env.CODEX_API_KEY = 'codex_key_123';
      const testConfig = new Config();

      // When: getCodexApiKey()を呼び出す
      const result = testConfig.getCodexApiKey();

      // Then: CODEX_API_KEYの値が返される
      expect(result).toBe('codex_key_123');
    });

    test('2.2.2: getCodexApiKey_正常系_CODEX_API_KEY未設定でOPENAI_API_KEYが設定されている場合', () => {
      // Given: CODEX_API_KEY が未設定、OPENAI_API_KEY が設定されている
      // Issue #188: CODEX_API_KEY と OPENAI_API_KEY は分離されたため、フォールバックなし
      delete process.env.CODEX_API_KEY;
      process.env.OPENAI_API_KEY = 'openai_key_456';
      const testConfig = new Config();

      // When: getCodexApiKey()を呼び出す
      const result = testConfig.getCodexApiKey();

      // Then: nullが返される（CODEX_API_KEY のみを使用、OPENAI_API_KEY へのフォールバックなし）
      expect(result).toBeNull();
    });

    test('2.2.3: getCodexApiKey_正常系_両方が設定されている場合はCODEX_API_KEYが優先される', () => {
      // Given: 両方の環境変数が設定されている
      process.env.CODEX_API_KEY = 'codex_key_123';
      process.env.OPENAI_API_KEY = 'openai_key_456';
      const testConfig = new Config();

      // When: getCodexApiKey()を呼び出す
      const result = testConfig.getCodexApiKey();

      // Then: CODEX_API_KEYが優先される
      expect(result).toBe('codex_key_123');
    });

    test('2.2.4: getCodexApiKey_正常系_両方が未設定の場合', () => {
      // Given: 両方の環境変数が未設定
      delete process.env.CODEX_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const testConfig = new Config();

      // When: getCodexApiKey()を呼び出す
      const result = testConfig.getCodexApiKey();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('getClaudeCredentialsPath()', () => {
    test('2.2.5: getClaudeCredentialsPath_正常系_パスが設定されている場合', () => {
      // Given: CLAUDE_CODE_CREDENTIALS_PATH が設定されている
      process.env.CLAUDE_CODE_CREDENTIALS_PATH = '/path/to/credentials';
      const testConfig = new Config();

      // When: getClaudeCredentialsPath()を呼び出す
      const result = testConfig.getClaudeCredentialsPath();

      // Then: パスが返される
      expect(result).toBe('/path/to/credentials');
    });

    test('2.2.6: getClaudeCredentialsPath_正常系_パスが未設定の場合', () => {
      // Given: CLAUDE_CODE_CREDENTIALS_PATH が未設定
      delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
      const testConfig = new Config();

      // When: getClaudeCredentialsPath()を呼び出す
      const result = testConfig.getClaudeCredentialsPath();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('getClaudeOAuthToken()', () => {
    test('2.2.7: getClaudeOAuthToken_正常系_トークンが設定されている場合', () => {
      // Given: CLAUDE_CODE_OAUTH_TOKEN が設定されている
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth_token_789';
      const testConfig = new Config();

      // When: getClaudeOAuthToken()を呼び出す
      const result = testConfig.getClaudeOAuthToken();

      // Then: トークンが返される
      expect(result).toBe('oauth_token_789');
    });

    test('2.2.8: getClaudeOAuthToken_正常系_トークンが未設定の場合', () => {
      // Given: CLAUDE_CODE_OAUTH_TOKEN が未設定
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      const testConfig = new Config();

      // When: getClaudeOAuthToken()を呼び出す
      const result = testConfig.getClaudeOAuthToken();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  // Issue #188: 新規追加メソッド
  describe('getClaudeCodeApiKey()', () => {
    test('getClaudeCodeApiKey_正常系_APIキーが設定されている場合', () => {
      // Given: CLAUDE_CODE_API_KEY が設定されている
      process.env.CLAUDE_CODE_API_KEY = 'api_key_123';
      const testConfig = new Config();

      // When: getClaudeCodeApiKey()を呼び出す
      const result = testConfig.getClaudeCodeApiKey();

      // Then: APIキーが返される
      expect(result).toBe('api_key_123');
    });

    test('getClaudeCodeApiKey_正常系_APIキーが未設定の場合', () => {
      // Given: CLAUDE_CODE_API_KEY が未設定
      delete process.env.CLAUDE_CODE_API_KEY;
      const testConfig = new Config();

      // When: getClaudeCodeApiKey()を呼び出す
      const result = testConfig.getClaudeCodeApiKey();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  // Issue #188: 新規追加メソッド（フォールバック付き）
  describe('getClaudeCodeToken()', () => {
    test('getClaudeCodeToken_正常系_OAuthトークンが設定されている場合', () => {
      // Given: CLAUDE_CODE_OAUTH_TOKEN が設定されている
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth_token_456';
      delete process.env.CLAUDE_CODE_API_KEY;
      const testConfig = new Config();

      // When: getClaudeCodeToken()を呼び出す
      const result = testConfig.getClaudeCodeToken();

      // Then: OAuthトークンが返される（優先）
      expect(result).toBe('oauth_token_456');
    });

    test('getClaudeCodeToken_正常系_OAuthトークン未設定でAPIキーが設定されている場合', () => {
      // Given: CLAUDE_CODE_OAUTH_TOKEN が未設定、CLAUDE_CODE_API_KEY が設定されている
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      process.env.CLAUDE_CODE_API_KEY = 'api_key_789';
      const testConfig = new Config();

      // When: getClaudeCodeToken()を呼び出す
      const result = testConfig.getClaudeCodeToken();

      // Then: APIキーが返される（フォールバック）
      expect(result).toBe('api_key_789');
    });

    test('getClaudeCodeToken_正常系_両方が設定されている場合はOAuthトークンが優先される', () => {
      // Given: 両方の環境変数が設定されている
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth_token_456';
      process.env.CLAUDE_CODE_API_KEY = 'api_key_789';
      const testConfig = new Config();

      // When: getClaudeCodeToken()を呼び出す
      const result = testConfig.getClaudeCodeToken();

      // Then: OAuthトークンが優先される
      expect(result).toBe('oauth_token_456');
    });

    test('getClaudeCodeToken_正常系_両方が未設定の場合', () => {
      // Given: 両方の環境変数が未設定
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.CLAUDE_CODE_API_KEY;
      const testConfig = new Config();

      // When: getClaudeCodeToken()を呼び出す
      const result = testConfig.getClaudeCodeToken();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('getClaudeDangerouslySkipPermissions()', () => {
    test('2.2.9: getClaudeDangerouslySkipPermissions_正常系_フラグが1の場合', () => {
      // Given: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS が '1'
      process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1';
      const testConfig = new Config();

      // When: getClaudeDangerouslySkipPermissions()を呼び出す
      const result = testConfig.getClaudeDangerouslySkipPermissions();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    test('2.2.10: getClaudeDangerouslySkipPermissions_正常系_フラグが0の場合', () => {
      // Given: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS が '0'
      process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '0';
      const testConfig = new Config();

      // When: getClaudeDangerouslySkipPermissions()を呼び出す
      const result = testConfig.getClaudeDangerouslySkipPermissions();

      // Then: falseが返される
      expect(result).toBe(false);
    });

    test('2.2.11: getClaudeDangerouslySkipPermissions_正常系_フラグが未設定の場合', () => {
      // Given: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS が未設定
      delete process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS;
      const testConfig = new Config();

      // When: getClaudeDangerouslySkipPermissions()を呼び出す
      const result = testConfig.getClaudeDangerouslySkipPermissions();

      // Then: falseが返される
      expect(result).toBe(false);
    });

    test('2.2.12: getClaudeDangerouslySkipPermissions_エッジケース_フラグがtrueの文字列の場合', () => {
      // Given: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS が 'true'
      process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = 'true';
      const testConfig = new Config();

      // When: getClaudeDangerouslySkipPermissions()を呼び出す
      const result = testConfig.getClaudeDangerouslySkipPermissions();

      // Then: falseが返される（'1'のみがtrue）
      expect(result).toBe(false);
    });
  });
});

describe('Config - Git関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getGitCommitUserName() - フォールバックロジック', () => {
    test('2.3.1: getGitCommitUserName_正常系_GIT_COMMIT_USER_NAMEが設定されている場合', () => {
      // Given: GIT_COMMIT_USER_NAME が設定されている
      process.env.GIT_COMMIT_USER_NAME = 'John Doe';
      const testConfig = new Config();

      // When: getGitCommitUserName()を呼び出す
      const result = testConfig.getGitCommitUserName();

      // Then: GIT_COMMIT_USER_NAMEの値が返される
      expect(result).toBe('John Doe');
    });

    test('2.3.2: getGitCommitUserName_正常系_GIT_COMMIT_USER_NAME未設定でGIT_AUTHOR_NAMEが設定されている場合', () => {
      // Given: GIT_COMMIT_USER_NAME が未設定、GIT_AUTHOR_NAME が設定されている
      delete process.env.GIT_COMMIT_USER_NAME;
      process.env.GIT_AUTHOR_NAME = 'Jane Smith';
      const testConfig = new Config();

      // When: getGitCommitUserName()を呼び出す
      const result = testConfig.getGitCommitUserName();

      // Then: GIT_AUTHOR_NAMEの値が返される（フォールバック）
      expect(result).toBe('Jane Smith');
    });

    test('2.3.3: getGitCommitUserName_正常系_両方が未設定の場合', () => {
      // Given: 両方の環境変数が未設定
      delete process.env.GIT_COMMIT_USER_NAME;
      delete process.env.GIT_AUTHOR_NAME;
      const testConfig = new Config();

      // When: getGitCommitUserName()を呼び出す
      const result = testConfig.getGitCommitUserName();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('getGitCommitUserEmail() - フォールバックロジック', () => {
    test('2.3.4: getGitCommitUserEmail_正常系_GIT_COMMIT_USER_EMAILが設定されている場合', () => {
      // Given: GIT_COMMIT_USER_EMAIL が設定されている
      process.env.GIT_COMMIT_USER_EMAIL = 'john@example.com';
      const testConfig = new Config();

      // When: getGitCommitUserEmail()を呼び出す
      const result = testConfig.getGitCommitUserEmail();

      // Then: GIT_COMMIT_USER_EMAILの値が返される
      expect(result).toBe('john@example.com');
    });

    test('2.3.5: getGitCommitUserEmail_正常系_GIT_COMMIT_USER_EMAIL未設定でGIT_AUTHOR_EMAILが設定されている場合', () => {
      // Given: GIT_COMMIT_USER_EMAIL が未設定、GIT_AUTHOR_EMAIL が設定されている
      delete process.env.GIT_COMMIT_USER_EMAIL;
      process.env.GIT_AUTHOR_EMAIL = 'jane@example.com';
      const testConfig = new Config();

      // When: getGitCommitUserEmail()を呼び出す
      const result = testConfig.getGitCommitUserEmail();

      // Then: GIT_AUTHOR_EMAILの値が返される（フォールバック）
      expect(result).toBe('jane@example.com');
    });

    test('2.3.6: getGitCommitUserEmail_正常系_両方が未設定の場合', () => {
      // Given: 両方の環境変数が未設定
      delete process.env.GIT_COMMIT_USER_EMAIL;
      delete process.env.GIT_AUTHOR_EMAIL;
      const testConfig = new Config();

      // When: getGitCommitUserEmail()を呼び出す
      const result = testConfig.getGitCommitUserEmail();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });
});

describe('Config - パス関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getHomeDir() - フォールバックロジック（必須）', () => {
    test('2.4.1: getHomeDir_正常系_HOMEが設定されている場合', () => {
      // Given: HOME が設定されている
      process.env.HOME = '/home/user';
      const testConfig = new Config();

      // When: getHomeDir()を呼び出す
      const result = testConfig.getHomeDir();

      // Then: HOMEの値が返される
      expect(result).toBe('/home/user');
    });

    test('2.4.2: getHomeDir_正常系_HOME未設定でUSERPROFILEが設定されている場合', () => {
      // Given: HOME が未設定、USERPROFILE が設定されている
      delete process.env.HOME;
      process.env.USERPROFILE = 'C:\\Users\\User';
      const testConfig = new Config();

      // When: getHomeDir()を呼び出す
      const result = testConfig.getHomeDir();

      // Then: USERPROFILEの値が返される（フォールバック）
      expect(result).toBe('C:\\Users\\User');
    });

    test('2.4.3: getHomeDir_正常系_両方が設定されている場合はHOMEが優先される', () => {
      // Given: 両方の環境変数が設定されている
      process.env.HOME = '/home/user';
      process.env.USERPROFILE = 'C:\\Users\\User';
      const testConfig = new Config();

      // When: getHomeDir()を呼び出す
      const result = testConfig.getHomeDir();

      // Then: HOMEが優先される
      expect(result).toBe('/home/user');
    });

    test('2.4.4: getHomeDir_異常系_両方が未設定の場合', () => {
      // Given: 両方の環境変数が未設定
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      const testConfig = new Config();

      // When/Then: getHomeDir()を呼び出すと例外がスローされる
      expect(() => testConfig.getHomeDir()).toThrow(
        'HOME or USERPROFILE environment variable is required. Please ensure your system has a valid home directory.',
      );
    });

    test('2.4.5: getHomeDir_異常系_HOMEが空文字列でUSERPROFILEも未設定の場合', () => {
      // Given: HOME が空文字列、USERPROFILE が未設定
      process.env.HOME = '';
      delete process.env.USERPROFILE;
      const testConfig = new Config();

      // When/Then: getHomeDir()を呼び出すと例外がスローされる
      expect(() => testConfig.getHomeDir()).toThrow(
        'HOME or USERPROFILE environment variable is required',
      );
    });
  });

  describe('getReposRoot()', () => {
    test('2.4.6: getReposRoot_正常系_パスが設定されている場合', () => {
      // Given: REPOS_ROOT が設定されている
      process.env.REPOS_ROOT = '/path/to/repos';
      const testConfig = new Config();

      // When: getReposRoot()を呼び出す
      const result = testConfig.getReposRoot();

      // Then: パスが返される
      expect(result).toBe('/path/to/repos');
    });

    test('2.4.7: getReposRoot_正常系_パスが未設定の場合', () => {
      // Given: REPOS_ROOT が未設定
      delete process.env.REPOS_ROOT;
      const testConfig = new Config();

      // When: getReposRoot()を呼び出す
      const result = testConfig.getReposRoot();

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  describe('getCodexCliPath() - デフォルト値', () => {
    test('2.4.8: getCodexCliPath_正常系_パスが設定されている場合', () => {
      // Given: CODEX_CLI_PATH が設定されている
      process.env.CODEX_CLI_PATH = '/usr/local/bin/codex';
      const testConfig = new Config();

      // When: getCodexCliPath()を呼び出す
      const result = testConfig.getCodexCliPath();

      // Then: パスが返される
      expect(result).toBe('/usr/local/bin/codex');
    });

    test('2.4.9: getCodexCliPath_正常系_パスが未設定の場合はデフォルト値が返される', () => {
      // Given: CODEX_CLI_PATH が未設定
      delete process.env.CODEX_CLI_PATH;
      const testConfig = new Config();

      // When: getCodexCliPath()を呼び出す
      const result = testConfig.getCodexCliPath();

      // Then: デフォルト値'codex'が返される
      expect(result).toBe('codex');
    });
  });
});

describe('Config - ロギング関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLogLevel() - デフォルト値とバリデーション', () => {
    test('2.5.1: getLogLevel_正常系_有効なログレベルが設定されている場合_debug', () => {
      // Given: LOG_LEVEL が 'debug'
      process.env.LOG_LEVEL = 'debug';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: 'debug'が返される
      expect(result).toBe('debug');
    });

    test('2.5.2: getLogLevel_正常系_有効なログレベルが設定されている場合_info', () => {
      // Given: LOG_LEVEL が 'info'
      process.env.LOG_LEVEL = 'info';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: 'info'が返される
      expect(result).toBe('info');
    });

    test('2.5.3: getLogLevel_正常系_有効なログレベルが設定されている場合_warn', () => {
      // Given: LOG_LEVEL が 'warn'
      process.env.LOG_LEVEL = 'warn';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: 'warn'が返される
      expect(result).toBe('warn');
    });

    test('2.5.4: getLogLevel_正常系_有効なログレベルが設定されている場合_error', () => {
      // Given: LOG_LEVEL が 'error'
      process.env.LOG_LEVEL = 'error';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: 'error'が返される
      expect(result).toBe('error');
    });

    test('2.5.5: getLogLevel_正常系_大文字小文字が混在している場合は小文字に変換される', () => {
      // Given: LOG_LEVEL が 'DEBUG'（大文字）
      process.env.LOG_LEVEL = 'DEBUG';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: 'debug'に変換されて返される
      expect(result).toBe('debug');
    });

    test('2.5.6: getLogLevel_正常系_無効なログレベルが設定されている場合はデフォルト値が返される', () => {
      // Given: LOG_LEVEL が無効な値'invalid'
      process.env.LOG_LEVEL = 'invalid';
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: デフォルト値'info'が返される
      expect(result).toBe('info');
    });

    test('2.5.7: getLogLevel_正常系_未設定の場合はデフォルト値が返される', () => {
      // Given: LOG_LEVEL が未設定
      delete process.env.LOG_LEVEL;
      const testConfig = new Config();

      // When: getLogLevel()を呼び出す
      const result = testConfig.getLogLevel();

      // Then: デフォルト値'info'が返される
      expect(result).toBe('info');
    });
  });

  describe('getLogNoColor()', () => {
    test('2.5.8: getLogNoColor_正常系_フラグがtrueの場合', () => {
      // Given: LOG_NO_COLOR が 'true'
      process.env.LOG_NO_COLOR = 'true';
      const testConfig = new Config();

      // When: getLogNoColor()を呼び出す
      const result = testConfig.getLogNoColor();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    test('2.5.9: getLogNoColor_正常系_フラグが1の場合', () => {
      // Given: LOG_NO_COLOR が '1'
      process.env.LOG_NO_COLOR = '1';
      const testConfig = new Config();

      // When: getLogNoColor()を呼び出す
      const result = testConfig.getLogNoColor();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    test('2.5.10: getLogNoColor_正常系_フラグがfalseの場合', () => {
      // Given: LOG_NO_COLOR が 'false'
      process.env.LOG_NO_COLOR = 'false';
      const testConfig = new Config();

      // When: getLogNoColor()を呼び出す
      const result = testConfig.getLogNoColor();

      // Then: falseが返される
      expect(result).toBe(false);
    });

    test('2.5.11: getLogNoColor_正常系_フラグが0の場合', () => {
      // Given: LOG_NO_COLOR が '0'
      process.env.LOG_NO_COLOR = '0';
      const testConfig = new Config();

      // When: getLogNoColor()を呼び出す
      const result = testConfig.getLogNoColor();

      // Then: falseが返される
      expect(result).toBe(false);
    });

    test('2.5.12: getLogNoColor_正常系_フラグが未設定の場合', () => {
      // Given: LOG_NO_COLOR が未設定
      delete process.env.LOG_NO_COLOR;
      const testConfig = new Config();

      // When: getLogNoColor()を呼び出す
      const result = testConfig.getLogNoColor();

      // Then: falseが返される
      expect(result).toBe(false);
    });
  });
});

describe('Config - ワークフロー言語設定 (Issue #526)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLanguage()', () => {
    test('AI_WORKFLOW_LANGUAGE が en のときに en を返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = 'en';
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('en');
    });

    test('AI_WORKFLOW_LANGUAGE が大文字だけでも正規化して返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = 'JA';
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
    });

    test('AI_WORKFLOW_LANGUAGE が ja のときに ja を返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = 'ja';
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
    });

    test('AI_WORKFLOW_LANGUAGE が大文字・空白混在でも正規化して返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = '  EN ';
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('en');
    });

    test('AI_WORKFLOW_LANGUAGE が未設定ならデフォルト ja を返す', () => {
      // Given
      delete process.env.AI_WORKFLOW_LANGUAGE;
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
    });

    test('AI_WORKFLOW_LANGUAGE が無効値なら警告を出しデフォルトにフォールバックする', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = 'fr';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid AI_WORKFLOW_LANGUAGE value 'fr'"),
      );

      warnSpy.mockRestore();
    });

    test('AI_WORKFLOW_LANGUAGE が空文字ならデフォルト ja を返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = '';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('AI_WORKFLOW_LANGUAGE が空白のみならデフォルト ja を返す', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = '   ';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('AI_WORKFLOW_LANGUAGE が数値文字列なら警告を出しデフォルトにフォールバックする', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = '123';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid AI_WORKFLOW_LANGUAGE value '123'"),
      );

      warnSpy.mockRestore();
    });

    test('AI_WORKFLOW_LANGUAGE が特殊文字を含む場合は警告を出しデフォルトにフォールバックする', () => {
      // Given
      process.env.AI_WORKFLOW_LANGUAGE = 'ja;rm -rf';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const testConfig = new Config();

      // When
      const result = testConfig.getLanguage();

      // Then
      expect(result).toBe('ja');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid AI_WORKFLOW_LANGUAGE value 'ja;rm -rf'"),
      );

      warnSpy.mockRestore();
    });
  });
});

describe('Config - 動作環境判定メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isCI()', () => {
    test('2.6.1: isCI_正常系_CIがtrueの場合', () => {
      // Given: CI が 'true'
      process.env.CI = 'true';
      const testConfig = new Config();

      // When: isCI()を呼び出す
      const result = testConfig.isCI();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    test('2.6.2: isCI_正常系_CIが1の場合', () => {
      // Given: CI が '1'
      process.env.CI = '1';
      const testConfig = new Config();

      // When: isCI()を呼び出す
      const result = testConfig.isCI();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    test('2.6.3: isCI_正常系_JENKINS_HOMEが設定されている場合', () => {
      // Given: CI が未設定、JENKINS_HOME が設定されている
      delete process.env.CI;
      process.env.JENKINS_HOME = '/var/jenkins_home';
      const testConfig = new Config();

      // When: isCI()を呼び出す
      const result = testConfig.isCI();

      // Then: trueが返される（JENKINS_HOMEでもCI環境と判定）
      expect(result).toBe(true);
    });

    test('2.6.4: isCI_正常系_CIがtrueでJENKINS_HOMEも設定されている場合', () => {
      // Given: CI が 'true'、JENKINS_HOME も設定されている
      process.env.CI = 'true';
      process.env.JENKINS_HOME = '/var/jenkins_home';
      const testConfig = new Config();

      // When: isCI()を呼び出す
      const result = testConfig.isCI();

      // Then: trueが返される
      expect(result).toBe(true);
    });

    describe('2.6.5: isCI_正常系_CIがfalseの場合', () => {
      let originalJenkinsHome: string | undefined;

      beforeEach(() => {
        // JENKINS_HOME環境変数を保存して削除
        originalJenkinsHome = process.env.JENKINS_HOME;
        delete process.env.JENKINS_HOME;
      });

      afterEach(() => {
        // JENKINS_HOME環境変数を復元
        if (originalJenkinsHome !== undefined) {
          process.env.JENKINS_HOME = originalJenkinsHome;
        } else {
          delete process.env.JENKINS_HOME;
        }
      });

      test('2.6.5: isCI_正常系_CIがfalseの場合', () => {
        // Given: CI が 'false'
        process.env.CI = 'false';
        const testConfig = new Config();

        // When: isCI()を呼び出す
        const result = testConfig.isCI();

        // Then: falseが返される
        expect(result).toBe(false);
      });
    });

    describe('2.6.6: isCI_正常系_CIが0の場合', () => {
      let originalJenkinsHome: string | undefined;

      beforeEach(() => {
        // JENKINS_HOME環境変数を保存して削除
        originalJenkinsHome = process.env.JENKINS_HOME;
        delete process.env.JENKINS_HOME;
      });

      afterEach(() => {
        // JENKINS_HOME環境変数を復元
        if (originalJenkinsHome !== undefined) {
          process.env.JENKINS_HOME = originalJenkinsHome;
        } else {
          delete process.env.JENKINS_HOME;
        }
      });

      test('2.6.6: isCI_正常系_CIが0の場合', () => {
        // Given: CI が '0'
        process.env.CI = '0';
        const testConfig = new Config();

        // When: isCI()を呼び出す
        const result = testConfig.isCI();

        // Then: falseが返される
        expect(result).toBe(false);
      });
    });

    test('2.6.7: isCI_正常系_CIもJENKINS_HOMEも未設定の場合', () => {
      // Given: CI も JENKINS_HOME も未設定
      delete process.env.CI;
      delete process.env.JENKINS_HOME;
      const testConfig = new Config();

      // When: isCI()を呼び出す
      const result = testConfig.isCI();

      // Then: falseが返される
      expect(result).toBe(false);
    });
  });
});

describe('Config - Singletonインスタンス', () => {
  test('2.7.1: config_シングルトンインスタンスが存在する', () => {
    // Given/When: config をインポート
    // Then: config が定義されている
    expect(config).toBeDefined();
    expect(config.getGitHubToken).toBeDefined();
    expect(config.getGitHubRepository).toBeDefined();
    expect(config.getCodexApiKey).toBeDefined();
    expect(config.getClaudeCredentialsPath).toBeDefined();
    expect(config.getClaudeOAuthToken).toBeDefined();
    expect(config.getClaudeDangerouslySkipPermissions).toBeDefined();
    expect(config.getGitCommitUserName).toBeDefined();
    expect(config.getGitCommitUserEmail).toBeDefined();
    expect(config.getHomeDir).toBeDefined();
    expect(config.getReposRoot).toBeDefined();
    expect(config.getCodexCliPath).toBeDefined();
    expect(config.getLogLevel).toBeDefined();
    expect(config.getLogNoColor).toBeDefined();
    expect(config.isCI).toBeDefined();
  });

  test('2.7.2: config_すべてのメソッドが関数である', () => {
    // Given/When: config をインポート
    // Then: すべてのメソッドが関数である
    expect(typeof config.getGitHubToken).toBe('function');
    expect(typeof config.getGitHubRepository).toBe('function');
    expect(typeof config.getCodexApiKey).toBe('function');
    expect(typeof config.getClaudeCredentialsPath).toBe('function');
    expect(typeof config.getClaudeOAuthToken).toBe('function');
    expect(typeof config.getClaudeDangerouslySkipPermissions).toBe('function');
    expect(typeof config.getGitCommitUserName).toBe('function');
    expect(typeof config.getGitCommitUserEmail).toBe('function');
    expect(typeof config.getHomeDir).toBe('function');
    expect(typeof config.getReposRoot).toBe('function');
    expect(typeof config.getCodexCliPath).toBe('function');
    expect(typeof config.getLogLevel).toBe('function');
    expect(typeof config.getLogNoColor).toBe('function');
    expect(typeof config.isCI).toBe('function');
  });
});

/**
 * ユニットテスト: Config.canAgentInstallPackages() (Issue #177)
 *
 * テスト対象:
 * - Config.canAgentInstallPackages() メソッド
 * - 環境変数 AGENT_CAN_INSTALL_PACKAGES の解析ロジック
 *
 * テスト戦略: UNIT_ONLY
 * - 環境変数パターンの網羅的検証
 * - 正常系・境界値・異常系のテスト
 */
describe('Config - パッケージインストール設定（Issue #177）', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数のバックアップ
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 環境変数の復元
    process.env = originalEnv;
  });

  describe('canAgentInstallPackages()', () => {
    // TC-001: 正常系 - "true" の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="true", When canAgentInstallPackages() is called, Then true is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(true);
    });

    // TC-002: 正常系 - "1" の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="1", When canAgentInstallPackages() is called, Then true is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = '1';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(true);
    });

    // TC-003: 正常系 - "false" の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="false", When canAgentInstallPackages() is called, Then false is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'false';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });

    // TC-004: 正常系 - "0" の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="0", When canAgentInstallPackages() is called, Then false is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = '0';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });

    // TC-005: 正常系（デフォルト動作） - 未設定の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES is not set, When canAgentInstallPackages() is called, Then false is returned (default)', () => {
      // Given
      delete process.env.AGENT_CAN_INSTALL_PACKAGES;
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });

    // TC-006: 境界値テスト - 空文字列の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="", When canAgentInstallPackages() is called, Then false is returned (default)', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = '';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });

    // TC-007: 境界値テスト - 大文字の場合
    test('Given AGENT_CAN_INSTALL_PACKAGES="TRUE" (uppercase), When canAgentInstallPackages() is called, Then true is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'TRUE';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(true);
    });

    // TC-008: 境界値テスト - 前後に空白
    test('Given AGENT_CAN_INSTALL_PACKAGES=" true " (with whitespace), When canAgentInstallPackages() is called, Then true is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = ' true ';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(true);
    });

    // TC-009: 異常系 - "yes" の場合（許可されていない値）
    test('Given AGENT_CAN_INSTALL_PACKAGES="yes" (invalid value), When canAgentInstallPackages() is called, Then false is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'yes';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });

    // TC-010: 異常系 - "2" の場合（許可されていない数値）
    test('Given AGENT_CAN_INSTALL_PACKAGES="2" (invalid value), When canAgentInstallPackages() is called, Then false is returned', () => {
      // Given
      process.env.AGENT_CAN_INSTALL_PACKAGES = '2';
      const testConfig = new Config();

      // When
      const result = testConfig.canAgentInstallPackages();

      // Then
      expect(result).toBe(false);
    });
  });
});
