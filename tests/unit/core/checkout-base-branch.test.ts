/**
 * ユニットテスト: checkoutBaseBranch()
 *
 * テスト対象: src/core/repository-utils.ts
 * シナリオ出典: test-scenario.md の TC-CB-001〜006
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

const gitMock = {
  fetch: jest.fn(),
  branchLocal: jest.fn(),
  branch: jest.fn(),
  checkout: jest.fn(),
  checkoutBranch: jest.fn(),
};

await jest.unstable_mockModule('simple-git', () => ({
  __esModule: true,
  default: jest.fn(() => gitMock),
}));

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

const { checkoutBaseBranch } = await import('../../../src/core/repository-utils.js');

describe('checkoutBaseBranch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gitMock.fetch.mockResolvedValue(undefined);
    gitMock.branchLocal.mockResolvedValue({ all: [] });
    gitMock.branch.mockResolvedValue({ all: [] });
    gitMock.checkout.mockResolvedValue(undefined);
    gitMock.checkoutBranch.mockResolvedValue(undefined);
  });

  it('ローカルブランチが存在する場合に checkout が成功する (TC-CB-001)', async () => {
    gitMock.branchLocal.mockResolvedValue({ all: ['main', 'develop'] });
    gitMock.branch.mockResolvedValue({ all: ['origin/main', 'origin/develop'] });

    await checkoutBaseBranch('/tmp/test-repo', 'develop');

    expect(gitMock.fetch).toHaveBeenCalledWith('origin');
    expect(gitMock.checkout).toHaveBeenCalledWith('develop');
    expect(gitMock.checkoutBranch).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith('Fetching and checking out base branch: develop');
    expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully checked out base branch: develop');
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('リモートブランチのみ存在する場合に checkoutBranch が成功する (TC-CB-002)', async () => {
    gitMock.branchLocal.mockResolvedValue({ all: ['main'] });
    gitMock.branch.mockResolvedValue({ all: ['origin/main', 'origin/release/v2.0'] });

    await checkoutBaseBranch('/tmp/test-repo', 'release/v2.0');

    expect(gitMock.fetch).toHaveBeenCalledWith('origin');
    expect(gitMock.checkout).not.toHaveBeenCalled();
    expect(gitMock.checkoutBranch).toHaveBeenCalledWith('release/v2.0', 'origin/release/v2.0');
  });

  it('ローカル/リモートどちらにも存在しない場合にエラーになる (TC-CB-003)', async () => {
    gitMock.branchLocal.mockResolvedValue({ all: ['main'] });
    gitMock.branch.mockResolvedValue({ all: ['origin/main'] });

    await expect(checkoutBaseBranch('/tmp/test-repo', 'nonexistent-branch')).rejects.toThrow(
      "Base branch 'nonexistent-branch' not found in local or remote branches.",
    );

    expect(gitMock.checkout).not.toHaveBeenCalled();
    expect(gitMock.checkoutBranch).not.toHaveBeenCalled();
  });

  it('git fetch 失敗時にネットワークエラーのメッセージを含む (TC-CB-004)', async () => {
    gitMock.fetch.mockRejectedValueOnce(new Error('Connection timed out'));

    let error: Error | null = null;
    try {
      await checkoutBaseBranch('/tmp/test-repo', 'develop');
    } catch (err) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain('Failed to fetch from remote:');
    expect(error?.message).toContain('Please check network connectivity and authentication.');
  });

  it('git checkout 失敗時にエラーが伝播する (TC-CB-005)', async () => {
    gitMock.branchLocal.mockResolvedValue({ all: ['main', 'develop'] });
    gitMock.branch.mockResolvedValue({ all: ['origin/main', 'origin/develop'] });
    gitMock.checkout.mockRejectedValueOnce(new Error('checkout failed: working tree dirty'));

    await expect(checkoutBaseBranch('/tmp/test-repo', 'develop')).rejects.toThrow(
      'checkout failed: working tree dirty',
    );
  });

  it('ログ出力が仕様通りに呼ばれる (TC-CB-006)', async () => {
    gitMock.branchLocal.mockResolvedValue({ all: ['main', 'develop'] });
    gitMock.branch.mockResolvedValue({ all: ['origin/main', 'origin/develop'] });

    await checkoutBaseBranch('/tmp/test-repo', 'develop');

    expect(mockLoggerInfo).toHaveBeenCalledWith('Fetching and checking out base branch: develop');
    expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully checked out base branch: develop');
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
