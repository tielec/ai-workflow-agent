/**
 * ユニットテスト: credential-validator と validate-credentials コマンド補助関数
 *
 * 対象:
 * - CredentialValidator クラスによるカテゴリ別チェック
 * - マスキング/サマリー生成
 * - コマンド用の parseOptions/format/determineExitCode
 *
 * テスト戦略: UNIT_INTEGRATION（外部依存はすべてモック）
 */

import { jest } from '@jest/globals';
import type { ValidationResult } from '../../src/types/validation.js';

// --------------- モック関数定義 --------------- //
const mockGitHubGetAuthenticated = jest.fn<any>();
const mockGitHubRateLimitGet = jest.fn<any>();
const mockOpenAiModelsList = jest.fn<any>();
const mockAnthropicModelsList = jest.fn<any>();
const mockAnthropicMessagesCreate = jest.fn<any>();

const mockGetCodexApiKey = jest.fn<any>();
const mockGetClaudeOAuthToken = jest.fn<any>();
const mockGetClaudeCodeApiKey = jest.fn<any>();
const mockGetOpenAiApiKey = jest.fn<any>();
const mockGetAnthropicApiKey = jest.fn<any>();

const mockFsExistsSync = jest.fn<any>();
const mockFsReadFileSync = jest.fn<any>();

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

// --------------- 依存モジュールのESMモック --------------- //
await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      users: { getAuthenticated: mockGitHubGetAuthenticated },
      rateLimit: { get: mockGitHubRateLimitGet },
    },
  })),
}));

await jest.unstable_mockModule('openai', () => ({
  __esModule: true,
  OpenAI: jest.fn().mockImplementation(() => ({
    models: { list: mockOpenAiModelsList },
  })),
}));

await jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { list: mockAnthropicModelsList },
    messages: { create: mockAnthropicMessagesCreate },
  })),
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getCodexApiKey: mockGetCodexApiKey,
    getClaudeOAuthToken: mockGetClaudeOAuthToken,
    getClaudeCodeApiKey: mockGetClaudeCodeApiKey,
    getOpenAiApiKey: mockGetOpenAiApiKey,
    getAnthropicApiKey: mockGetAnthropicApiKey,
  },
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn(),
  },
}));

await jest.unstable_mockModule('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
  },
  existsSync: mockFsExistsSync,
  readFileSync: mockFsReadFileSync,
}));

// --------------- テスト対象モジュールの動的インポート --------------- //
const { CredentialValidator } = await import('../../src/core/credential-validator.js');
const {
  parseOptions,
  formatTextOutput,
  formatJsonOutput,
  determineExitCode,
} = await import('../../src/commands/validate-credentials.js');

describe('CredentialValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトのモック戻り値
    mockGitHubGetAuthenticated.mockResolvedValue({
      data: { login: 'tester' },
      headers: { 'x-oauth-scopes': 'repo, workflow, read:org' },
    });
    mockGitHubRateLimitGet.mockResolvedValue({ data: { rate: { remaining: 4000, limit: 5000 } } });
    mockOpenAiModelsList.mockResolvedValue({ data: [] });
    mockAnthropicModelsList.mockResolvedValue({ data: [] });
    mockAnthropicMessagesCreate.mockResolvedValue({ id: 'msg' });
    mockFsExistsSync.mockReturnValue(false);
    mockFsReadFileSync.mockReturnValue('{}');

    mockGetCodexApiKey.mockReturnValue(null);
    mockGetClaudeOAuthToken.mockReturnValue(null);
    mockGetClaudeCodeApiKey.mockReturnValue(null);
    mockGetOpenAiApiKey.mockReturnValue(null);
    mockGetAnthropicApiKey.mockReturnValue(null);

    // 環境変数初期化
    delete process.env.GIT_COMMIT_USER_NAME;
    delete process.env.GIT_COMMIT_USER_EMAIL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.CODEX_AUTH_JSON;
    delete process.env.CODEX_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.exitCode = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Git チェック', () => {
    it('環境変数が正しく設定されている場合は成功する (TC-VAL-001)', async () => {
      process.env.GIT_COMMIT_USER_NAME = 'TestUser';
      process.env.GIT_COMMIT_USER_EMAIL = 'test@example.com';

      const validator = new CredentialValidator();
      const result = await validator.validate('git', false);
      const git = result.results.git!;

      expect(git.status).toBe('passed');
      expect(git.checks.find((c) => c.name === 'GIT_COMMIT_USER_NAME')?.status).toBe('passed');
      expect(git.checks.find((c) => c.name === 'GIT_COMMIT_USER_EMAIL')?.status).toBe('passed');
      expect(git.checks.find((c) => c.name === 'Email Format')?.status).toBe('passed');
    });

    it('環境変数が未設定の場合は失敗になる (TC-VAL-002)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('git', false);
      const git = result.results.git!;

      expect(git.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'GIT_COMMIT_USER_NAME')?.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'Email Format')?.status).toBe('skipped');
    });

    it('メール形式が不正な場合はフォーマットチェックが failed になる (TC-VAL-003)', async () => {
      process.env.GIT_COMMIT_USER_NAME = 'TestUser';
      process.env.GIT_COMMIT_USER_EMAIL = 'invalid-email';

      const validator = new CredentialValidator();
      const result = await validator.validate('git', false);
      const git = result.results.git!;

      expect(git.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'Email Format')?.status).toBe('failed');
    });

    it('空文字列は未設定として扱う (TC-VAL-004)', async () => {
      process.env.GIT_COMMIT_USER_NAME = '';
      process.env.GIT_COMMIT_USER_EMAIL = '   ';

      const validator = new CredentialValidator();
      const result = await validator.validate('git', false);
      const git = result.results.git!;

      expect(git.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'GIT_COMMIT_USER_NAME')?.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'GIT_COMMIT_USER_EMAIL')?.status).toBe('failed');
      expect(git.checks.find((c) => c.name === 'Email Format')?.status).toBe('skipped');
    });
  });

  describe('GitHub チェック', () => {
    it('有効なトークンとスコープで成功する (TC-VAL-005)', async () => {
      process.env.GITHUB_TOKEN = 'ghp_validtoken123';

      const validator = new CredentialValidator();
      const result = await validator.validate('github', false);
      const github = result.results.github!;

      expect(github.status).toBe('passed');
      expect(github.checks.find((c) => c.name === 'GITHUB_TOKEN')?.value).toBe('ghp_****');
      expect(github.checks.find((c) => c.name === 'GitHub API')?.status).toBe('passed');
      expect(github.checks.find((c) => c.name === 'Token Scopes')?.status).toBe('passed');
      expect(github.checks.find((c) => c.name === 'Rate Limit')?.message).toContain('4000/5000');
    });

    it('トークン未設定の場合は全て skipped/failed になる (TC-VAL-006)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('github', false);
      const github = result.results.github!;

      expect(github.status).toBe('failed');
      expect(github.checks.find((c) => c.name === 'GITHUB_TOKEN')?.status).toBe('failed');
      expect(github.checks.find((c) => c.name === 'Token Scopes')?.status).toBe('skipped');
      expect(github.checks.find((c) => c.name === 'Rate Limit')?.status).toBe('skipped');
    });

    it('認証失敗時は失敗として扱われる (TC-VAL-007)', async () => {
      process.env.GITHUB_TOKEN = 'ghp_invalid';
      mockGitHubGetAuthenticated.mockRejectedValue(new Error('Bad credentials'));

      const validator = new CredentialValidator();
      const result = await validator.validate('github', false);
      const github = result.results.github!;

      expect(github.status).toBe('failed');
      expect(github.checks.find((c) => c.name === 'GitHub API')?.status).toBe('failed');
      expect(github.checks.find((c) => c.name === 'Token Scopes')?.status).toBe('skipped');
      expect(mockGitHubRateLimitGet).not.toHaveBeenCalled();
    });

    it('スコープ不足やレートリミット逼迫時は warning になる (TC-VAL-008)', async () => {
      process.env.GITHUB_TOKEN = 'ghp_validtoken123';
      mockGitHubGetAuthenticated.mockResolvedValue({
        data: { login: 'tester' },
        headers: { 'x-oauth-scopes': 'repo, read:org' },
      });
      mockGitHubRateLimitGet.mockResolvedValue({ data: { rate: { remaining: 50, limit: 500 } } });

      const validator = new CredentialValidator();
      const result = await validator.validate('github', false);
      const github = result.results.github!;

      expect(github.status).toBe('warning');
      expect(github.checks.find((c) => c.name === 'Token Scopes')?.status).toBe('warning');
      expect(github.checks.find((c) => c.name === 'Rate Limit')?.status).toBe('warning');
    });
  });

  describe('Codex チェック', () => {
    it('auth.json が存在し JSON 形式が正しければ成功する (TC-VAL-009)', async () => {
      process.env.CODEX_AUTH_JSON = '/tmp/auth.json';
      mockFsExistsSync.mockReturnValue(true);
      mockFsReadFileSync.mockReturnValue(JSON.stringify({ token: 'ok' }));

      const validator = new CredentialValidator();
      const result = await validator.validate('codex', false);
      const codex = result.results.codex!;

      expect(codex.status).toBe('passed');
      expect(codex.checks.find((c) => c.name === 'CODEX_AUTH_JSON')?.value).toBe('/tmp/auth.json');
      expect(codex.checks.find((c) => c.name === 'JSON Format')?.status).toBe('passed');
    });

    it('ファイルが存在しない場合は failed になる (TC-VAL-011)', async () => {
      process.env.CODEX_AUTH_JSON = '/tmp/missing.json';
      mockFsExistsSync.mockReturnValue(false);

      const validator = new CredentialValidator();
      const result = await validator.validate('codex', false);
      const codex = result.results.codex!;

      expect(codex.status).toBe('failed');
      expect(codex.checks.find((c) => c.name === 'File Exists')?.status).toBe('failed');
      expect(codex.checks.find((c) => c.name === 'JSON Format')?.status).toBe('skipped');
    });

    it('JSON 形式が不正なら失敗として扱う (TC-VAL-012)', async () => {
      process.env.CODEX_AUTH_JSON = '/tmp/broken.json';
      mockFsExistsSync.mockReturnValue(true);
      mockFsReadFileSync.mockReturnValue('{ invalid json }');

      const validator = new CredentialValidator();
      const result = await validator.validate('codex', false);
      const codex = result.results.codex!;

      expect(codex.status).toBe('failed');
      expect(codex.checks.find((c) => c.name === 'JSON Format')?.status).toBe('failed');
      expect(codex.checks.find((c) => c.name === 'JSON Format')?.message).toContain('Invalid JSON');
    });

    it('APIキーのみでも成功する (TC-VAL-010)', async () => {
      mockGetCodexApiKey.mockReturnValue('codex_api_key_value');
      process.env.CODEX_AUTH_JSON = '';

      const validator = new CredentialValidator();
      const result = await validator.validate('codex', false);
      const codex = result.results.codex!;

      expect(codex.status).toBe('passed');
      expect(codex.checks.find((c) => c.name === 'CODEX_API_KEY')?.value).toBe('code****');
      expect(codex.checks.find((c) => c.name === 'CODEX_AUTH_JSON')?.status).toBe('skipped');
    });

    it('auth.json/APIキーの両方が無い場合は失敗する (TC-VAL-013)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('codex', false);
      const codex = result.results.codex!;

      expect(codex.status).toBe('failed');
      expect(codex.checks[0]?.message).toContain('Neither CODEX_AUTH_JSON nor CODEX_API_KEY is set');
    });
  });

  describe('Claude チェック', () => {
    it('OAuth トークンがあれば成功する (TC-VAL-014)', async () => {
      mockGetClaudeOAuthToken.mockReturnValue('oauth_token_123456');

      const validator = new CredentialValidator();
      const result = await validator.validate('claude', false);
      const claude = result.results.claude!;

      expect(claude.status).toBe('passed');
      expect(claude.checks.find((c) => c.name === 'CLAUDE_CODE_OAUTH_TOKEN')?.value).toBe(
        'oaut****',
      );
      expect(claude.checks.find((c) => c.name === 'CLAUDE_CODE_API_KEY')?.status).toBe('skipped');
    });

    it('APIキーのみでも成功する (TC-VAL-015)', async () => {
      mockGetClaudeCodeApiKey.mockReturnValue('sk-ant-api_key_123456');

      const validator = new CredentialValidator();
      const result = await validator.validate('claude', false);
      const claude = result.results.claude!;

      expect(claude.status).toBe('passed');
      expect(claude.checks.find((c) => c.name === 'CLAUDE_CODE_API_KEY')?.value).toBe('sk-a****');
      expect(claude.checks.find((c) => c.name === 'CLAUDE_CODE_OAUTH_TOKEN')?.status).toBe(
        'skipped',
      );
    });

    it('どちらも無い場合は失敗となる (TC-VAL-016)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('claude', false);
      const claude = result.results.claude!;

      expect(claude.status).toBe('failed');
      expect(claude.checks[0]?.message).toContain(
        'Neither CLAUDE_CODE_OAUTH_TOKEN nor CLAUDE_CODE_API_KEY is set',
      );
    });
  });

  describe('OpenAI チェック', () => {
    it('有効なキーで成功する (TC-VAL-017)', async () => {
      mockGetOpenAiApiKey.mockReturnValue('sk-valid-openai');

      const validator = new CredentialValidator();
      const result = await validator.validate('openai', false);
      const openai = result.results.openai!;

      expect(openai.status).toBe('passed');
      expect(openai.checks.find((c) => c.name === 'OPENAI_API_KEY')?.value).toBe('sk-v****');
      expect(openai.checks.find((c) => c.name === 'OpenAI API')?.status).toBe('passed');
    });

    it('キー未設定なら failed / skipped になる (TC-VAL-018)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('openai', false);
      const openai = result.results.openai!;

      expect(openai.status).toBe('failed');
      expect(openai.checks.find((c) => c.name === 'OpenAI API')?.status).toBe('skipped');
    });

    it('API 呼び出し失敗時は失敗を返す (TC-VAL-019)', async () => {
      mockGetOpenAiApiKey.mockReturnValue('sk-invalid');
      mockOpenAiModelsList.mockRejectedValue(new Error('Invalid API key'));

      const validator = new CredentialValidator();
      const result = await validator.validate('openai', false);
      const openai = result.results.openai!;

      expect(openai.status).toBe('failed');
      expect(openai.checks.find((c) => c.name === 'OpenAI API')?.status).toBe('failed');
      expect(openai.checks.find((c) => c.name === 'OpenAI API')?.message).toContain(
        'Invalid API key',
      );
    });
  });

  describe('Anthropic チェック', () => {
    it('有効なキーなら成功する (TC-VAL-020)', async () => {
      mockGetAnthropicApiKey.mockReturnValue('sk-ant-valid');

      const validator = new CredentialValidator();
      const result = await validator.validate('anthropic', false);
      const anthropic = result.results.anthropic!;

      expect(anthropic.status).toBe('passed');
      expect(anthropic.checks.find((c) => c.name === 'ANTHROPIC_API_KEY')?.value).toBe(
        'sk-a****',
      );
      expect(anthropic.checks.find((c) => c.name === 'Anthropic API')?.status).toBe('passed');
    });

    it('キー未設定なら失敗となる (TC-VAL-021)', async () => {
      const validator = new CredentialValidator();
      const result = await validator.validate('anthropic', false);
      const anthropic = result.results.anthropic!;

      expect(anthropic.status).toBe('failed');
      expect(anthropic.checks.find((c) => c.name === 'Anthropic API')?.status).toBe('skipped');
    });

    it('API エラー時は失敗になる', async () => {
      mockGetAnthropicApiKey.mockReturnValue('sk-ant-error');
      mockAnthropicModelsList.mockRejectedValue(new Error('forbidden'));

      const validator = new CredentialValidator();
      const result = await validator.validate('anthropic', false);
      const anthropic = result.results.anthropic!;

      expect(anthropic.status).toBe('failed');
      expect(anthropic.checks.find((c) => c.name === 'Anthropic API')?.message).toContain(
        'forbidden',
      );
    });
  });

  describe('マスキング処理', () => {
    it('標準的なトークンの先頭4文字だけを残す (TC-VAL-022)', () => {
      const validator = new CredentialValidator();
      const maskValue = (validator as any).maskValue.bind(validator) as (value: string) => string;
      const masked = [
        maskValue('ghp_abcdefghijklmnop'),
        maskValue('sk-1234567890abcdefghij'),
        maskValue('oauth_token_123456789'),
      ];

      expect(masked).toEqual(['ghp_****', 'sk-1****', 'oaut****']);
    });

    it('短いトークンは全て **** にマスクする (TC-VAL-023)', () => {
      const validator = new CredentialValidator();
      const maskValue = (validator as any).maskValue.bind(validator) as (value: string) => string;
      const masked = [maskValue('abc'), maskValue('ab'), maskValue('a'), maskValue('')];

      expect(masked).toEqual(['****', '****', '****', '****']);
    });
  });

  describe('CredentialValidator.validate', () => {
    it('全カテゴリをチェックする (TC-VAL-034)', async () => {
      const validator = new CredentialValidator();
      const checkers = (validator as any).checkers as Map<string, { check: () => Promise<any> }>;
      for (const [category, checker] of checkers) {
        jest.spyOn(checker, 'check').mockResolvedValue({
          status: 'passed',
          checks: [{ name: `${category} check`, status: 'passed' }],
        });
      }

      const result = await validator.validate('all', false);
      const categories = Object.keys(result.results);

      expect(categories).toHaveLength(6);
      expect(categories).toEqual(
        expect.arrayContaining(['git', 'github', 'codex', 'claude', 'openai', 'anthropic']),
      );
      for (const [, checker] of checkers) {
        expect(checker.check).toHaveBeenCalledTimes(1);
      }
    });

    it('単一カテゴリのみをチェックする (TC-VAL-035)', async () => {
      const validator = new CredentialValidator();
      const checkers = (validator as any).checkers as Map<string, { check: () => Promise<any> }>;
      const githubChecker = checkers.get('github')!;
      jest.spyOn(githubChecker, 'check').mockResolvedValue({
        status: 'passed',
        checks: [{ name: 'github check', status: 'passed' }],
      });
      for (const [category, checker] of checkers) {
        if (category === 'github') continue;
        jest.spyOn(checker, 'check').mockImplementation(async () => {
          throw new Error('should not be called');
        });
      }

      const result = await validator.validate('github', false);

      expect(Object.keys(result.results)).toEqual(['github']);
      expect(githubChecker.check).toHaveBeenCalledTimes(1);
      for (const [category, checker] of checkers) {
        if (category === 'github') continue;
        expect(checker.check).not.toHaveBeenCalled();
      }
    });

    it('全カテゴリを並列に実行する (TC-VAL-036)', async () => {
      const validator = new CredentialValidator();
      const checkers = (validator as any).checkers as Map<string, { check: () => Promise<any> }>;
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (const [, checker] of checkers) {
        jest.spyOn(checker, 'check').mockImplementation(async () => {
          await delay(100);
          return { status: 'passed', checks: [{ name: 'ok', status: 'passed' }] };
        });
      }

      const start = Date.now();
      const result = await validator.validate('all', false);
      const duration = Date.now() - start;

      expect(Object.keys(result.results)).toHaveLength(6);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('出力フォーマット/オプション', () => {
    it('formatTextOutput がアイコンとサマリーを含む', () => {
      const result: ValidationResult = {
        timestamp: '2024-01-01T00:00:00Z',
        results: {
          git: {
            status: 'passed',
            checks: [{ name: 'GIT_COMMIT_USER_NAME', status: 'passed', value: 'tester' }],
          },
        },
        summary: { total: 1, passed: 1, failed: 0, warnings: 0, skipped: 0 },
      };

      const text = formatTextOutput(result, false);
      expect(text).toContain('Git Configuration');
      expect(text).toContain('✓ GIT_COMMIT_USER_NAME: tester');
      expect(text).toContain('Summary: 1 passed, 0 failed, 0 warnings, 0 skipped');
    });

    it('formatJsonOutput が JSON を整形する', () => {
      const result: ValidationResult = {
        timestamp: '2024-01-01T00:00:00Z',
        results: {},
        summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
      };

      const json = formatJsonOutput(result);
      expect(JSON.parse(json)).toEqual(result);
    });

    it('parseOptions はデフォルト値と不正値を判定する (TC-VAL-027/029)', () => {
      expect(parseOptions({})).toEqual({
        check: 'all',
        output: 'text',
        verbose: false,
        exitOnError: false,
      });

      expect(() => parseOptions({ check: 'unknown' })).toThrow('Invalid check category');
      expect(() => parseOptions({ output: 'yaml' })).toThrow('Invalid output format');
    });

    it('determineExitCode は --exit-on-error 指定時のみ失敗を 1 とする', () => {
      const success: ValidationResult = {
        timestamp: '',
        results: {},
        summary: { total: 1, passed: 1, failed: 0, warnings: 0, skipped: 0 },
      };
      const failed: ValidationResult = {
        timestamp: '',
        results: {},
        summary: { total: 1, passed: 0, failed: 1, warnings: 0, skipped: 0 },
      };

      expect(determineExitCode(success, true)).toBe(0);
      expect(determineExitCode(failed, false)).toBe(0);
      expect(determineExitCode(failed, true)).toBe(1);
    });
  });
});
