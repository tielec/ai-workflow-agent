import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockListConfig = jest.fn<any>();
const mockAddConfig = jest.fn<any>();

const mockGit = {
  listConfig: mockListConfig,
  addConfig: mockAddConfig,
} as any;

const mockGetGitCommitUserName = jest.fn<any>();
const mockGetGitCommitUserEmail = jest.fn<any>();

await jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitCommitUserName: mockGetGitCommitUserName,
    getGitCommitUserEmail: mockGetGitCommitUserEmail,
    getLogLevel: jest.fn().mockReturnValue('info'),
    getLogNoColor: jest.fn().mockReturnValue(false),
  },
}));

const { ensureGitConfig } = await import('../../../src/core/git/git-config-helper.js');

describe('ensureGitConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddConfig.mockResolvedValue(undefined);
    mockGetGitCommitUserName.mockReturnValue(null);
    mockGetGitCommitUserEmail.mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('既存設定なし＆環境変数なし → デフォルト値が適用される', async () => {
    mockListConfig.mockResolvedValue({
      all: {},
    });

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'AI Workflow', false, 'local');
    expect(mockAddConfig).toHaveBeenCalledWith('user.email', 'ai-workflow@tielec.local', false, 'local');
  });

  it('既存 Git config がある場合 → その値が保持される', async () => {
    mockListConfig.mockResolvedValue({
      all: {
        'user.name': 'Existing User',
        'user.email': 'existing@example.com',
      },
    });

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'Existing User', false, 'local');
    expect(mockAddConfig).toHaveBeenCalledWith('user.email', 'existing@example.com', false, 'local');
  });

  it('環境変数設定時 → デフォルトより優先される', async () => {
    mockListConfig.mockResolvedValue({
      all: {},
    });
    mockGetGitCommitUserName.mockReturnValue('Env User');
    mockGetGitCommitUserEmail.mockReturnValue('env@example.com');

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'Env User', false, 'local');
    expect(mockAddConfig).toHaveBeenCalledWith('user.email', 'env@example.com', false, 'local');
  });

  it('user.name が無効（長さ0）→ デフォルトにフォールバック', async () => {
    mockListConfig.mockResolvedValue({
      all: {
        'user.name': '',
        'user.email': 'valid@example.com',
      },
    });

    await ensureGitConfig(mockGit);

    // 空文字列は falsy なので config/default にフォールバックし、最終的にデフォルト値になる
    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'AI Workflow', false, 'local');
  });

  it('user.name が無効（長さ>100）→ デフォルトにフォールバック', async () => {
    const longName = 'A'.repeat(101);
    mockListConfig.mockResolvedValue({
      all: {
        'user.name': longName,
        'user.email': 'valid@example.com',
      },
    });

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'AI Workflow', false, 'local');
  });

  it('user.email が無効（@ なし）→ デフォルトにフォールバック', async () => {
    mockListConfig.mockResolvedValue({
      all: {
        'user.name': 'Valid User',
        'user.email': 'invalid-email',
      },
    });

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.email', 'ai-workflow@tielec.local', false, 'local');
  });

  it('addConfig の第4引数が常に local であること', async () => {
    mockListConfig.mockResolvedValue({
      all: {},
    });

    await ensureGitConfig(mockGit);

    for (const call of mockAddConfig.mock.calls) {
      expect(call[3]).toBe('local');
    }
  });

  it('既存 Git config が環境変数より優先される', async () => {
    mockListConfig.mockResolvedValue({
      all: {
        'user.name': 'Git Config User',
        'user.email': 'gitconfig@example.com',
      },
    });
    mockGetGitCommitUserName.mockReturnValue('Env User');
    mockGetGitCommitUserEmail.mockReturnValue('env@example.com');

    await ensureGitConfig(mockGit);

    expect(mockAddConfig).toHaveBeenCalledWith('user.name', 'Git Config User', false, 'local');
    expect(mockAddConfig).toHaveBeenCalledWith('user.email', 'gitconfig@example.com', false, 'local');
  });
});
