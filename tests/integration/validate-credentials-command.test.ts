/**
 * インテグレーションテスト: validate-credentials コマンド
 *
 * テスト戦略: UNIT_INTEGRATION（外部APIとファイルアクセスはモック）
 * 主なシナリオ: TC-INT-001〜005 相当
 */

import { jest } from '@jest/globals';

// ---------------- モック定義 ---------------- //
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

await jest.unstable_mockModule('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
  },
  existsSync: mockFsExistsSync,
  readFileSync: mockFsReadFileSync,
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

const { handleValidateCredentialsCommand } = await import(
  '../../src/commands/validate-credentials.js'
);

describe('validate-credentials コマンド (統合)', () => {
  let consoleSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    // デフォルトの成功モック
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

    mockGetCodexApiKey.mockReturnValue('codex_api_key_value');
    mockGetClaudeOAuthToken.mockReturnValue(null);
    mockGetClaudeCodeApiKey.mockReturnValue('sk-ant-api_key_123456');
    mockGetOpenAiApiKey.mockReturnValue('sk-valid-openai');
    mockGetAnthropicApiKey.mockReturnValue('sk-ant-valid');

    process.env.GIT_COMMIT_USER_NAME = 'Tester';
    process.env.GIT_COMMIT_USER_EMAIL = 'tester@example.com';
    process.env.GITHUB_TOKEN = 'ghp_validtoken123456';
    process.env.CODEX_API_KEY = 'codex_api_key_value';
    process.env.CODEX_AUTH_JSON = '';
    process.env.CLAUDE_CODE_API_KEY = 'sk-ant-api_key_123456';
    process.env.OPENAI_API_KEY = 'sk-valid-openai';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-valid';
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
    process.exitCode = undefined;
  });

  it('デフォルトオプションで全カテゴリを検証し、テキスト出力を行う (TC-INT-001)', async () => {
    await handleValidateCredentialsCommand({});

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Git Configuration');
    expect(output).toContain('GitHub Authentication');
    expect(output).toContain('OpenAI API');
    expect(output).toContain('Summary:');
    expect(output).toContain('ghp_****');
    expect(output).toContain('sk-v****');
    expect(output).toContain('sk-a****');
    expect(process.exitCode).toBeUndefined();
  });

  it('特定カテゴリのみをチェックする (TC-INT-002)', async () => {
    await handleValidateCredentialsCommand({ check: 'github' });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('GitHub Authentication');
    expect(output).not.toContain('Git Configuration');
    expect(output).not.toContain('OpenAI API');
  });

  it('JSON 出力オプションで構造化結果を返す (TC-INT-003)', async () => {
    await handleValidateCredentialsCommand({ output: 'json' });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    const parsed = JSON.parse(output);

    expect(parsed.results.github.checks.some((c: any) => c.value === 'ghp_****')).toBe(true);
    expect(parsed.summary.failed).toBe(0);
    expect(parsed.summary.passed).toBeGreaterThan(0);
  });

  it('exit-on-error 指定時に失敗があれば exitCode=1 を設定する (TC-INT-004)', async () => {
    // Anthropic キーをあえて未設定にして失敗を誘発
    mockGetAnthropicApiKey.mockReturnValue(null);
    delete process.env.ANTHROPIC_API_KEY;

    await handleValidateCredentialsCommand({ exitOnError: true });

    expect(process.exitCode).toBe(1);
  });

  it('verbose 指定時はカテゴリステータスも出力する (TC-INT-005)', async () => {
    await handleValidateCredentialsCommand({ check: 'github', verbose: true });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('Status:');
    expect(output).toContain('GitHub Authentication');
  });

  it('GitHub API タイムアウト時にエラーを出力する (TC-INT-006)', async () => {
    process.env.GITHUB_TOKEN = 'ghp_timeout_token';
    mockGitHubGetAuthenticated.mockRejectedValue(new Error('timeout exceeded'));

    await handleValidateCredentialsCommand({ check: 'github' });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('GitHub API');
    expect(output.toLowerCase()).toContain('timeout');
  });

  it('一部カテゴリが失敗しても他のチェックを継続する (TC-INT-007)', async () => {
    mockGitHubGetAuthenticated.mockRejectedValue(new Error('server error'));

    await handleValidateCredentialsCommand({});

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('GitHub API');
    expect(output).toContain('server error');
    expect(output).toContain('Git Configuration');
    expect(output).toContain('OpenAI API');
  });

  it('テキスト出力でトークンをマスクする (TC-INT-008)', async () => {
    process.env.GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz123456';

    await handleValidateCredentialsCommand({});

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(output).toContain('ghp_****');
  });

  it('JSON 出力でもトークンをマスクする (TC-INT-009)', async () => {
    const rawOpenAiKey = 'sk-1234567890abcdefghijklmnopqrstuv';
    mockGetOpenAiApiKey.mockReturnValue(rawOpenAiKey);
    process.env.OPENAI_API_KEY = rawOpenAiKey;

    await handleValidateCredentialsCommand({ output: 'json' });

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    const parsed = JSON.parse(output);
    const openaiValue = parsed.results.openai.checks.find(
      (c: any) => c.name === 'OPENAI_API_KEY',
    )?.value;

    expect(openaiValue).toBe('sk-1****');
    expect(output).not.toContain(rawOpenAiKey);
  });
});
