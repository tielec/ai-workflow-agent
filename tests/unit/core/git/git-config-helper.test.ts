import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

await jest.unstable_mockModule('../../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

const {
  ensureGitUserConfig,
  DEFAULT_GIT_USER_NAME,
  DEFAULT_GIT_USER_EMAIL,
} = await import('../../../../src/core/git/git-config-helper.js');

describe('GitConfigHelper - ensureGitUserConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockLoggerInfo.mockClear();
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
    mockLoggerDebug.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('ローカル設定が存在する場合_最優先で適用される', async () => {
    // Given: リポジトリローカルに user.name / user.email が存在する
    const git = {
      listConfig: jest.fn().mockResolvedValue({
        all: {
          'user.name': 'Existing User',
          'user.email': 'existing@example.com',
        },
      }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Env User';
    process.env.GIT_COMMIT_USER_EMAIL = 'env@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: ローカル設定が優先される
    expect(git.addConfig).toHaveBeenCalledWith('user.name', 'Existing User', false, 'local');
    expect(git.addConfig).toHaveBeenCalledWith('user.email', 'existing@example.com', false, 'local');
  });

  it('環境変数が設定されている場合_ローカル未設定時に適用される', async () => {
    // Given: ローカル設定なし、環境変数が設定済み
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Custom User';
    process.env.GIT_COMMIT_USER_EMAIL = 'custom@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: 環境変数値が適用される
    expect(git.addConfig).toHaveBeenCalledWith('user.name', 'Custom User', false, 'local');
    expect(git.addConfig).toHaveBeenCalledWith('user.email', 'custom@example.com', false, 'local');
  });

  it('フォールバック環境変数が適用される', async () => {
    // Given: commit 環境変数は未設定、author のみ設定
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    delete process.env.GIT_COMMIT_USER_NAME;
    delete process.env.GIT_COMMIT_USER_EMAIL;
    process.env.GIT_AUTHOR_NAME = 'Author User';
    process.env.GIT_AUTHOR_EMAIL = 'author@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: author 環境変数が適用される
    expect(git.addConfig).toHaveBeenCalledWith('user.name', 'Author User', false, 'local');
    expect(git.addConfig).toHaveBeenCalledWith('user.email', 'author@example.com', false, 'local');
  });

  it('環境変数が未設定の場合_デフォルト値が適用される', async () => {
    // Given: ローカル設定なし、環境変数も未設定
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    delete process.env.GIT_COMMIT_USER_NAME;
    delete process.env.GIT_COMMIT_USER_EMAIL;
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: デフォルト値が適用される
    expect(git.addConfig).toHaveBeenCalledWith('user.name', DEFAULT_GIT_USER_NAME, false, 'local');
    expect(git.addConfig).toHaveBeenCalledWith('user.email', DEFAULT_GIT_USER_EMAIL, false, 'local');
  });

  it('ユーザー名が長すぎる場合_警告してデフォルトへフォールバックする', async () => {
    // Given: 101文字のユーザー名
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'a'.repeat(101);
    process.env.GIT_COMMIT_USER_EMAIL = 'valid@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: デフォルト名へフォールバックし、警告が出力される
    expect(git.addConfig).toHaveBeenCalledWith('user.name', DEFAULT_GIT_USER_NAME, false, 'local');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('User name length is invalid'),
    );
  });

  it('メール形式が不正な場合_警告してデフォルトへフォールバックする', async () => {
    // Given: 不正なメール形式
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Valid User';
    process.env.GIT_COMMIT_USER_EMAIL = 'invalid-email';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: デフォルトメールへフォールバックし、警告が出力される
    expect(git.addConfig).toHaveBeenCalledWith('user.email', DEFAULT_GIT_USER_EMAIL, false, 'local');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid email format'),
    );
  });

  it('addConfigの引数がローカル設定になっている', async () => {
    // Given: ローカル設定なし
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Local User';
    process.env.GIT_COMMIT_USER_EMAIL = 'local@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: addConfig の第3/第4引数が固定値
    expect(git.addConfig).toHaveBeenCalledWith('user.name', 'Local User', false, 'local');
    expect(git.addConfig).toHaveBeenCalledWith('user.email', 'local@example.com', false, 'local');
  });

  it('設定完了時にログが出力される', async () => {
    // Given: 正常な設定値
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Logged User';
    process.env.GIT_COMMIT_USER_EMAIL = 'logged@example.com';

    // When: ensureGitUserConfig を実行
    await ensureGitUserConfig(git as any);

    // Then: info ログが出力される
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('Git config ensured: user.name=Logged User, user.email=logged@example.com'),
    );
  });

  it('git.listConfigで例外が発生しても処理が継続する', async () => {
    // Given: listConfig が例外を投げる
    const git = {
      listConfig: jest.fn().mockRejectedValue(new Error('listConfig failed')),
      addConfig: jest.fn().mockResolvedValue(undefined),
    };

    delete process.env.GIT_COMMIT_USER_NAME;
    delete process.env.GIT_COMMIT_USER_EMAIL;

    // When: ensureGitUserConfig を実行
    await expect(ensureGitUserConfig(git as any)).resolves.toBeUndefined();

    // Then: 警告ログが出力され、処理は継続する
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read git config'),
    );
    expect(git.addConfig).toHaveBeenCalled();
  });

  it('git.addConfigで例外が発生しても外部に伝播しない', async () => {
    // Given: addConfig が例外を投げる
    const git = {
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
      addConfig: jest.fn().mockRejectedValue(new Error('addConfig failed')),
    };

    process.env.GIT_COMMIT_USER_NAME = 'Fail User';
    process.env.GIT_COMMIT_USER_EMAIL = 'fail@example.com';

    // When/Then: 例外が伝播しない
    await expect(ensureGitUserConfig(git as any)).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to ensure git config'),
    );
  });
});
