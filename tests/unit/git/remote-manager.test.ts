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

      mockGit.push.mockResolvedValue(undefined as any);

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
        .mockResolvedValueOnce(undefined as any);

      // pullLatest のモック
      (mockGit.pull as jest.Mock).mockResolvedValue(undefined);

      // When: pushToRemote を呼び出す
      const result = await remoteManager.pushToRemote(3, 100);

      // Then: pullしてから再pushが実行される
      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
      expect(mockGit.pull).toHaveBeenCalled();
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
        .mockResolvedValueOnce(undefined as any);

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
      mockGit.pull.mockResolvedValue(undefined as any);

      // When: pullLatest を呼び出す
      const result = await remoteManager.pullLatest('feature/issue-25');

      // Then: pullが正常に実行される
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'feature/issue-25', [
        '--no-rebase',
      ]);
    });

    test('pullLatest_正常系_ブランチ名省略', async () => {
      // Given: metadata.jsonにブランチ名が記載されている
      mockGit.pull.mockResolvedValue(undefined as any);

      // When: pullLatest を呼び出す（ブランチ名省略）
      const result = await remoteManager.pullLatest();

      // Then: metadata.jsonのブランチ名でpullが実行される
      expect(result.success).toBe(true);
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'feature/issue-25', [
        '--no-rebase',
      ]);
    });

    test('pullLatest_異常系_Git操作失敗', async () => {
      // Given: Git pull操作が失敗する
      mockGit.pull.mockRejectedValue(
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
    mockGit = {
      remote: jest.fn(),
    } as any;

    mockMetadata = {
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        branch_name: 'feature/issue-25',
      }),
    } as any;
  });

  describe('setupGithubCredentials', () => {
    test('setupGithubCredentials_正常系_HTTPS URLにトークン埋め込み', async () => {
      // Given: GITHUB_TOKENが設定されている
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      mockGit.remote.mockImplementation(((args: any) => {
        if (args[0] === 'get-url') {
          return Promise.resolve('https://github.com/tielec/ai-workflow-agent.git');
        }
        return Promise.resolve(undefined);
      }) as any);

      // When: RemoteManager をインスタンス化（setupGithubCredentials が実行される）
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then: トークンが埋め込まれたURLが設定される
      expect(mockGit.remote).toHaveBeenCalledWith([
        'set-url',
        'origin',
        'https://ghp_xxxxxxxxxxxxx@github.com/tielec/ai-workflow-agent.git',
      ]);

      // Cleanup
      delete process.env.GITHUB_TOKEN;
    });

    test('setupGithubCredentials_境界値_SSH URLはスキップ', async () => {
      // Given: GITHUB_TOKENが設定されているが、リモートURLがSSH
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      mockGit.remote.mockImplementation(((args: any) => {
        if (args[0] === 'get-url') {
          return Promise.resolve('git@github.com:tielec/ai-workflow-agent.git');
        }
        return Promise.resolve(undefined);
      }) as any);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then: set-url は呼び出されない（スキップされる）
      expect(mockGit.remote).not.toHaveBeenCalledWith(
        expect.arrayContaining(['set-url'])
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Git remote URL is not HTTPS')
      );

      consoleInfoSpy.mockRestore();
      delete process.env.GITHUB_TOKEN;
    });

    test('setupGithubCredentials_境界値_トークンなし', async () => {
      // Given: GITHUB_TOKENが未設定
      delete process.env.GITHUB_TOKEN;

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then: remote操作は実行されない
      expect(mockGit.remote).not.toHaveBeenCalled();
    });

    test('setupGithubCredentials_異常系_ベストエフォート実行', async () => {
      // Given: GITHUB_TOKENが設定されているが、Git操作が失敗する
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxx';

      mockGit.remote.mockRejectedValue(new Error('Git command failed'));

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // When: RemoteManager をインスタンス化
      const remoteManager = new RemoteManager(mockGit, mockMetadata);

      // Wait for async setup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then: 警告ログが出力される（例外はthrowされない）
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Failed to set up GitHub credentials')
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
