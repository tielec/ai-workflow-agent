/**
 * Unit tests for RemoteManager
 * Tests remote operations (push, pull, retry logic, GitHub credentials)
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RemoteManager } from '../../../src/core/git/remote-manager';
import { MetadataManager } from '../../../src/core/metadata-manager';
import { SimpleGit } from 'simple-git';

describe('RemoteManager - Push Operations', () => {
  let remoteManager: RemoteManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
      push: jest.fn(),
      raw: jest.fn(),
      remote: jest.fn(),
      pull: jest.fn(),
    } as any;

    mockMetadata = {
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    // Mock setupGithubCredentials to avoid actual execution
    jest.spyOn(RemoteManager.prototype as any, 'setupGithubCredentials').mockResolvedValue(undefined);

    remoteManager = new RemoteManager(mockGit, mockMetadata);
  });

  describe('pushToRemote', () => {
    test('pushToRemote_正常系_upstream設定', async () => {
      // Given: upstreamが未設定のブランチ
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        tracking: null,
        ahead: 0,
        behind: 0,
        files: [],
      } as any);

      mockGit.raw.mockResolvedValue('');

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote();

      // Then: --set-upstreamフラグでpushされる
      expect(result.success).toBe(true);
      expect(result.retries).toBe(0);
      expect(result.error).toBeUndefined();
      expect(mockGit.raw).toHaveBeenCalledWith([
        'push',
        '--set-upstream',
        'origin',
        'feature/issue-25',
      ]);
    });

    test('pushToRemote_正常系_通常push', async () => {
      // Given: upstreamが設定済みのブランチ
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        tracking: 'origin/feature/issue-25',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      mockGit.push.mockResolvedValue({
        pushed: [{ local: 'feature/issue-25', remote: 'feature/issue-25' }],
        remoteMessages: { all: [] },
      } as any);

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote();

      // Then: 通常pushが実行される
      expect(result.success).toBe(true);
      expect(result.retries).toBe(0);
      expect(mockGit.push).toHaveBeenCalledWith('origin', 'feature/issue-25');
    });

    test('pushToRemote_リトライ_non-fast-forward時に自動pull', async () => {
      // Given: リモートブランチが進んでいる（non-fast-forward）
      mockGit.status
        .mockResolvedValueOnce({
          current: 'feature/issue-25',
          tracking: 'origin/feature/issue-25',
          ahead: 1,
          behind: 0,
          files: [],
        } as any)
        .mockResolvedValueOnce({
          current: 'feature/issue-25',
          tracking: 'origin/feature/issue-25',
          ahead: 1,
          behind: 0,
          files: [],
        } as any);

      // 1回目のpushで rejected エラー
      mockGit.push
        .mockRejectedValueOnce(new Error('rejected - non-fast-forward'))
        .mockResolvedValueOnce({
          pushed: [{ local: 'feature/issue-25', remote: 'feature/issue-25' }],
          remoteMessages: { all: [] },
        } as any);

      // pullLatest のモック（rawを使用）
      (mockGit.raw as jest.Mock).mockResolvedValue('');

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote(3, 100);

      // Then: pullしてから再pushが実行される
      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
      // pullLatest は raw を使用するので raw の呼び出しを確認（pull コマンド）
      expect(mockGit.raw).toHaveBeenCalledWith(
        expect.arrayContaining(['pull', '--no-rebase', 'origin', 'feature/issue-25'])
      );
    });

    test('pushToRemote_リトライ_ネットワークエラー時のリトライ', async () => {
      // Given: 一時的なネットワークエラーが発生
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        tracking: 'origin/feature/issue-25',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      // 1回目: timeout エラー、2回目: 成功
      mockGit.push
        .mockRejectedValueOnce(new Error('timeout exceeded'))
        .mockResolvedValueOnce({
          pushed: [{ local: 'feature/issue-25', remote: 'feature/issue-25' }],
          remoteMessages: { all: [] },
        } as any);

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote(3, 100);

      // Then: リトライが実行され、成功する
      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
    });

    test('pushToRemote_異常系_最大リトライ回数到達', async () => {
      // Given: pushが3回連続で失敗する
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        tracking: 'origin/feature/issue-25',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      mockGit.push.mockRejectedValue(new Error('timeout exceeded'));

      // When: pushToRemote を呼び出す（最大3回）
      const result = await remoteManager.pushToRemote(3, 100);

      // Then: 最大リトライ回数到達でエラーが返される
      expect(result.success).toBe(false);
      expect(result.retries).toBe(3);
      expect(result.error).toContain('timeout exceeded');
    });

    test('pushToRemote_異常系_再試行不可エラー', async () => {
      // Given: 認証失敗エラーが発生
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        tracking: 'origin/feature/issue-25',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      mockGit.push.mockRejectedValue(new Error('authentication failed'));

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote(3, 100);

      // Then: 即座に失敗する（リトライされない）
      expect(result.success).toBe(false);
      expect(result.retries).toBe(0);
      expect(result.error).toContain('authentication failed');
    });
  });
});

describe('RemoteManager - Pull Operations', () => {
  let remoteManager: RemoteManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    mockGit = {
      pull: jest.fn(),
      remote: jest.fn(),
      raw: jest.fn(),
    } as any;

    mockMetadata = {
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    jest.spyOn(RemoteManager.prototype as any, 'setupGithubCredentials').mockResolvedValue(undefined);

    remoteManager = new RemoteManager(mockGit, mockMetadata);
  });

  describe('pullLatest', () => {
    test('pullLatest_正常系_リモートからpull', async () => {
      // Given: リモートブランチが存在する
      (mockGit.raw as jest.Mock).mockResolvedValue('');

      // When: pullLatest を呼び出す
      const result = await remoteManager.pullLatest('feature/issue-25');

      // Then: pullが正常に実行される
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockGit.raw).toHaveBeenCalledWith(['pull', '--no-rebase', 'origin', 'feature/issue-25']);
    });

    test('pullLatest_正常系_ブランチ名省略', async () => {
      // Given: metadata.jsonにブランチ名が記載されている
      (mockGit.raw as jest.Mock).mockResolvedValue('feature/issue-25\n');

      // When: pullLatest を呼び出す（ブランチ名省略）
      const result = await remoteManager.pullLatest();

      // Then: metadata.jsonのブランチ名でpullが実行される
      expect(result.success).toBe(true);
      // raw が2回呼ばれる: 1回目はgetCurrentBranch、2回目はpull
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD']);
      expect(mockGit.raw).toHaveBeenCalledWith(['pull', '--no-rebase', 'origin', 'feature/issue-25']);
    });

    test('pullLatest_異常系_Git操作失敗', async () => {
      // Given: Git pull操作が失敗する
      (mockGit.raw as jest.Mock).mockRejectedValue(
        new Error('Git command failed: fatal: unable to access...')
      );

      // When: pullLatest を呼び出す
      const result = await remoteManager.pullLatest('feature/issue-25');

      // Then: エラーが適切にハンドリングされる
      expect(result.success).toBe(false);
      expect(result.error).toContain('Git command failed');
    });
  });
});

describe('RemoteManager - GitHub Credentials', () => {
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    // Clean environment
    delete process.env.GITHUB_TOKEN;

    mockGit = {
      remote: jest.fn(),
    } as any;

    mockMetadata = {
      data: {
        issue_number: '25',
        branch_name: 'feature/issue-25',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  describe('setupGithubCredentials', () => {
    test('setupGithubCredentials_正常系_HTTPS URLにトークン埋め込み', async () => {
      // Given: GITHUB_TOKENが設定されている
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      // Spy on console BEFORE creating RemoteManager
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      mockGit.remote.mockImplementation((args: any) => {
        if (Array.isArray(args) && args[0] === 'get-url') {
          return Promise.resolve('https://github.com/tielec/ai-workflow-agent.git');
        }
        return Promise.resolve(undefined);
      });

      // When: RemoteManager をインスタンス化（setupGithubCredentials が実行される）
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup (増加したタイムアウト)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then: トークンが埋め込まれたURLが設定される
      expect(mockGit.remote).toHaveBeenCalledWith([
        'set-url',
        'origin',
        'https://ghp_xxxxxxxxxxxxx@github.com/tielec/ai-workflow-agent.git',
      ]);

      // Cleanup
      consoleInfoSpy.mockRestore();
      delete process.env.GITHUB_TOKEN;
    });

    test('setupGithubCredentials_境界値_SSH URLはスキップ', async () => {
      // Given: GITHUB_TOKENが設定されているが、リモートURLがSSH
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      // Spy on console.info BEFORE creating RemoteManager
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      mockGit.remote.mockImplementation((args: any) => {
        if (Array.isArray(args) && args[0] === 'get-url') {
          return Promise.resolve('git@github.com:tielec/ai-workflow-agent.git');
        }
        return Promise.resolve(undefined);
      });

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup (増加したタイムアウト)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then: set-url は呼び出されない（スキップされる）
      expect(mockGit.remote).not.toHaveBeenCalledWith(
        expect.arrayContaining(['set-url'])
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Git remote URL is not HTTPS')
      );

      consoleInfoSpy.mockRestore();
      delete process.env.GITHUB_TOKEN;
    });

    test('setupGithubCredentials_境界値_トークンなし', async () => {
      // Given: GITHUB_TOKENが未設定
      delete process.env.GITHUB_TOKEN;

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup (増加したタイムアウト)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then: remote操作は実行されない
      expect(mockGit.remote).not.toHaveBeenCalled();
    });

    test('setupGithubCredentials_異常系_ベストエフォート実行', async () => {
      // Given: GITHUB_TOKENが設定されているが、Git操作が失敗する
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      // Spy on console.warn BEFORE creating RemoteManager
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      mockGit.remote.mockRejectedValue(new Error('Git command failed'));

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup (増加したタイムアウト)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then: 警告ログが出力される（例外はthrowされない）
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARNING] Failed to setup GitHub credentials')
      );

      consoleWarnSpy.mockRestore();
      delete process.env.GITHUB_TOKEN;
    });
  });
});

describe('RemoteManager - Retry Logic', () => {
  let remoteManager: RemoteManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    mockGit = {
      remote: jest.fn(),
    } as any;

    mockMetadata = {
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        branch_name: 'feature/issue-25',
      }),
    } as any;

    jest.spyOn(RemoteManager.prototype as any, 'setupGithubCredentials').mockResolvedValue(undefined);

    remoteManager = new RemoteManager(mockGit, mockMetadata);
  });

  describe('isRetriableError', () => {
    test('isRetriableError_正常系_再試行可能エラー', () => {
      // Given: 再試行可能なエラー
      const error = new Error('timeout exceeded');

      // When: isRetriableError を呼び出す
      const isRetriable = (remoteManager as any).isRetriableError(error);

      // Then: true が返される
      expect(isRetriable).toBe(true);
    });

    test('isRetriableError_正常系_再試行不可エラー', () => {
      // Given: 再試行不可エラー
      const error = new Error('authentication failed');

      // When: isRetriableError を呼び出す
      const isRetriable = (remoteManager as any).isRetriableError(error);

      // Then: false が返される
      expect(isRetriable).toBe(false);
    });

    test('isRetriableError_境界値_大文字小文字を区別しない', () => {
      // Given: 大文字のエラーメッセージ
      const error = new Error('TIMEOUT EXCEEDED');

      // When: isRetriableError を呼び出す
      const isRetriable = (remoteManager as any).isRetriableError(error);

      // Then: true が返される（大文字小文字を区別しない）
      expect(isRetriable).toBe(true);
    });

    test('isRetriableError_境界値_connection refusedエラー', () => {
      // Given: connection refused エラー
      const error = new Error('connection refused');

      // When: isRetriableError を呼び出す
      const isRetriable = (remoteManager as any).isRetriableError(error);

      // Then: true が返される
      expect(isRetriable).toBe(true);
    });

    test('isRetriableError_境界値_permission deniedエラー', () => {
      // Given: permission denied エラー
      const error = new Error('permission denied');

      // When: isRetriableError を呼び出す
      const isRetriable = (remoteManager as any).isRetriableError(error);

      // Then: false が返される
      expect(isRetriable).toBe(false);
    });
  });
});

// Issue #216: forcePushToRemote メソッドのテスト
describe('RemoteManager - Force Push Operations (Issue #216)', () => {
  let remoteManager: RemoteManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
      push: jest.fn(),
      raw: jest.fn(),
      remote: jest.fn(),
      pull: jest.fn(),
    } as any;

    mockMetadata = {
      data: {
        issue_number: '216',
        branch_name: 'ai-workflow/issue-216',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '216',
        branch_name: 'ai-workflow/issue-216',
      }),
      getIssueNumber: jest.fn().mockReturnValue('216'),
    } as any;

    jest.spyOn(RemoteManager.prototype as any, 'setupGithubCredentials').mockResolvedValue(undefined);

    remoteManager = new RemoteManager(mockGit, mockMetadata);
  });

  describe('forcePushToRemote', () => {
    // テストケース 2.2.1: Force push成功_正常系
    test('forcePushToRemote_正常系_--force-with-lease使用', async () => {
      // Given: ブランチ名が取得可能
      mockGit.status.mockResolvedValue({
        current: 'ai-workflow/issue-216',
        tracking: 'origin/ai-workflow/issue-216',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      // git raw で force-with-lease push を実行
      mockGit.raw.mockResolvedValue('success');

      // When: forcePushToRemote を呼び出す
      const result = await remoteManager.forcePushToRemote();

      // Then: --force-with-lease が使用される
      expect(result.success).toBe(true);
      expect(result.retries).toBe(0);
      expect(mockGit.raw).toHaveBeenCalledWith([
        'push',
        '--force-with-lease',
        'origin',
        'ai-workflow/issue-216',
      ]);
    });

    // テストケース 2.2.2: Non-fast-forward エラー時のpull禁止_異常系
    test('forcePushToRemote_異常系_rejected時にpullを実行しない', async () => {
      // Given: リモートブランチが先に進んでいる状態
      mockGit.status.mockResolvedValue({
        current: 'ai-workflow/issue-216',
        tracking: 'origin/ai-workflow/issue-216',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      // Force push が rejected される
      mockGit.raw.mockRejectedValue(new Error('rejected - non-fast-forward'));

      // When: forcePushToRemote を呼び出す
      const result = await remoteManager.forcePushToRemote();

      // Then: pull を実行しない
      expect(result.success).toBe(false);
      expect(result.error).toContain('Remote branch has diverged');

      // pull は呼び出されない（raw の呼び出しは push のみ）
      expect(mockGit.raw).toHaveBeenCalledTimes(1);
      expect(mockGit.raw).toHaveBeenCalledWith([
        'push',
        '--force-with-lease',
        'origin',
        'ai-workflow/issue-216',
      ]);
    });

    // テストケース 2.2.3: ブランチ名取得失敗_異常系
    test('forcePushToRemote_異常系_ブランチ名取得失敗', async () => {
      // Given: ブランチ名が取得できない
      mockGit.status.mockResolvedValue({
        current: null,
        tracking: null,
        ahead: 0,
        behind: 0,
        files: [],
      } as any);

      mockMetadata.data.branch_name = null as any;

      // When/Then: エラーがスローされる
      await expect(remoteManager.forcePushToRemote()).rejects.toThrow(
        'Unable to determine current branch name',
      );
    });

    // テストケース 2.2.4: リトライ可能エラーのリトライロジック_境界値
    test('forcePushToRemote_リトライ_ネットワークエラー時', async () => {
      // Given: 初回pushでネットワークエラー、2回目で成功
      mockGit.status.mockResolvedValue({
        current: 'ai-workflow/issue-216',
        tracking: 'origin/ai-workflow/issue-216',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      // 1回目: timeout エラー、2回目: 成功
      mockGit.raw
        .mockRejectedValueOnce(new Error('timeout exceeded'))
        .mockResolvedValueOnce('success');

      // When: forcePushToRemote を呼び出す
      const result = await remoteManager.forcePushToRemote(3, 100);

      // Then: 1回リトライされる
      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
      expect(mockGit.raw).toHaveBeenCalledTimes(2);
    });

    // テストケース 2.2.5: 認証エラー時のリトライ禁止_異常系
    test('forcePushToRemote_異常系_認証エラー時即座に失敗', async () => {
      // Given: 認証エラーが発生
      mockGit.status.mockResolvedValue({
        current: 'ai-workflow/issue-216',
        tracking: 'origin/ai-workflow/issue-216',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      mockGit.raw.mockRejectedValue(new Error('authentication failed'));

      // When: forcePushToRemote を呼び出す
      const result = await remoteManager.forcePushToRemote(3, 100);

      // Then: リトライせずに即座に失敗
      expect(result.success).toBe(false);
      expect(result.retries).toBe(0);
      expect(result.error).toContain('authentication failed');
      expect(mockGit.raw).toHaveBeenCalledTimes(1);
    });

    // テストケース 2.4.1: 既存の通常push機能が影響を受けていない_正常系
    test('pushToRemote_正常系_forcePushToRemote追加後も動作', async () => {
      // Given: 通常のpush環境
      mockGit.status.mockResolvedValue({
        current: 'ai-workflow/issue-216',
        tracking: 'origin/ai-workflow/issue-216',
        ahead: 1,
        behind: 0,
        files: [],
      } as any);

      mockGit.push.mockResolvedValue({
        pushed: [{ local: 'ai-workflow/issue-216', remote: 'ai-workflow/issue-216' }],
        remoteMessages: { all: [] },
      } as any);

      // When: pushToRemote を呼び出す（通常push）
      const result = await remoteManager.pushToRemote();

      // Then: 通常pushが正常に動作する
      expect(result.success).toBe(true);
      expect(result.retries).toBe(0);
      expect(mockGit.push).toHaveBeenCalledWith('origin', 'ai-workflow/issue-216');

      // --force-with-lease は使用されない
      expect(mockGit.raw).not.toHaveBeenCalledWith(
        expect.arrayContaining(['push', '--force-with-lease'])
      );
    });
  });
});
