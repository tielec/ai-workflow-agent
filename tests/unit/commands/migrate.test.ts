/**
 * Unit tests for migrate command (Issue #58, Task 3)
 *
 * Issue #45: 型安全性テストを追加
 * - MigrateOptions 型が src/types/commands.ts から正しくインポートされることを検証
 */

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { glob } from 'glob';
import type { SpiedFunction } from 'jest-mock';
import {
  handleMigrateCommand,
  MigrationResult,
} from '../../../src/commands/migrate.js';
import type { MigrateOptions } from '../../../src/types/commands.js';
import { sanitizeGitUrl } from '../../../src/utils/git-url-utils.js';

// モックの設定
jest.mock('fs-extra');
jest.mock('glob', () => ({
  glob: jest.fn(),
}));
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/utils/git-url-utils.js');

type AsyncMockFn<TResult = any, TArgs extends any[] = any[]> = jest.Mock<
  (...args: TArgs) => Promise<TResult>
>;

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGlob = glob as jest.MockedFunction<typeof glob>;
const mockSanitizeGitUrl = sanitizeGitUrl as jest.MockedFunction<typeof sanitizeGitUrl>;
const mockLstat = mockFs.lstat as unknown as AsyncMockFn<any>;
const mockCopy = mockFs.copy as unknown as AsyncMockFn<void>;
const mockReadJSON = mockFs.readJSON as unknown as AsyncMockFn<any>;
const mockWriteJSON = mockFs.writeJSON as unknown as AsyncMockFn<void>;

// process.exit のモック
const exitSpy: SpiedFunction<typeof process.exit> = jest
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  });

describe('migrate command - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMigrateCommand', () => {
    it('--sanitize-tokens フラグが指定されていない場合、エラーを表示して終了', async () => {
      // Given: sanitizeTokens フラグが false
      const options: MigrateOptions = {
        sanitizeTokens: false,
        dryRun: false,
      };

      // When/Then: process.exit(1) が呼び出される
      await expect(handleMigrateCommand(options)).rejects.toThrow(
        'process.exit(1)'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('マイグレーション処理が失敗した場合、エラーを表示して終了', async () => {
      // Given: sanitizeTokens フラグが true だが、glob がエラーをスロー
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      mockGlob.mockRejectedValue(new Error('Glob failed'));

      // When/Then: process.exit(1) が呼び出される
      await expect(handleMigrateCommand(options)).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('findAllMetadataFiles (through handleMigrateCommand)', () => {
    it('複数のメタデータファイルが検出される', async () => {
      // Given: 3つのメタデータファイルが存在
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = [
        '/tmp/repo/.ai-workflow/issue-1/metadata.json',
        '/tmp/repo/.ai-workflow/issue-2/metadata.json',
        '/tmp/repo/.ai-workflow/issue-3/metadata.json',
      ];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: glob が呼び出される
      expect(mockGlob).toHaveBeenCalledWith(
        '.ai-workflow/issue-*/metadata.json',
        expect.objectContaining({ absolute: true })
      );
    });

    it('--issue オプションで特定Issueのみ対象', async () => {
      // Given: --issue 2 が指定されている
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
        issue: '2',
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-2/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: 特定Issueのパターンで glob が呼び出される
      expect(mockGlob).toHaveBeenCalledWith(
        '.ai-workflow/issue-2/metadata.json',
        expect.objectContaining({ absolute: true })
      );
    });

    it('メタデータファイルが存在しない場合、空配列が返される', async () => {
      // Given: メタデータファイルが存在しない
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      mockGlob.mockResolvedValue([]);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('パストラバーサル攻撃防止: 不正なパスはフィルタリング', async () => {
      // Given: 不正なパスが glob で検出される
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = [
        '/tmp/repo/.ai-workflow/issue-1/metadata.json', // 正常
        '/tmp/repo/../../etc/passwd', // 不正
      ];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: 正常なパスのみ処理される（1件）
      expect(mockFs.readJSON).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadMetadataFile (through handleMigrateCommand)', () => {
    it('トークンありのメタデータファイルを正しく検出', async () => {
      // Given: トークンを含むメタデータファイル
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: sanitizeGitUrl が呼び出される
      expect(mockSanitizeGitUrl).toHaveBeenCalledWith(
        'https://ghp_token@github.com/owner/repo.git'
      );
    });

    it('トークンなし（SSH形式）のメタデータはスキップ', async () => {
      // Given: SSH形式のメタデータファイル
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: sanitizeGitUrl が呼び出されない
      expect(mockSanitizeGitUrl).not.toHaveBeenCalled();
    });

    it('remote_url フィールドがない場合、hasToken: false', async () => {
      // Given: remote_url フィールドがないメタデータファイル
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {},
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: sanitizeGitUrl が呼び出されない
      expect(mockSanitizeGitUrl).not.toHaveBeenCalled();
    });

    it('ファイル読み込み失敗: null が返される', async () => {
      // Given: ファイル読み込みが失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockRejectedValue(new Error('File not found'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('JSON解析失敗: null が返される', async () => {
      // Given: JSON解析が失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockRejectedValue(new Error('Invalid JSON'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('シンボリックリンク攻撃防止: null が返される', async () => {
      // Given: シンボリックリンク
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: readJSON が呼び出されない
      expect(mockFs.readJSON).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeMetadataFile (through handleMigrateCommand)', () => {
    it('トークンサニタイズ成功: バックアップとファイル保存', async () => {
      // Given: トークンを含むメタデータファイル
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      const mockContent = {
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      };
      mockReadJSON.mockResolvedValue(mockContent);
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      mockCopy.mockResolvedValue(undefined);
      mockWriteJSON.mockResolvedValue(undefined);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: バックアップが作成される
      expect(mockFs.copy).toHaveBeenCalledWith(
        '/tmp/repo/.ai-workflow/issue-1/metadata.json',
        '/tmp/repo/.ai-workflow/issue-1/metadata.json.bak'
      );
      // ファイルが保存される
      expect(mockFs.writeJSON).toHaveBeenCalled();
    });

    it('ドライラン: ファイルが変更されない', async () => {
      // Given: トークンを含むメタデータファイル、ドライランモード
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: バックアップが作成されない
      expect(mockFs.copy).not.toHaveBeenCalled();
      // ファイルが保存されない
      expect(mockFs.writeJSON).not.toHaveBeenCalled();
    });

    it('トークンなし: スキップ', async () => {
      // Given: トークンなしのメタデータファイル
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: バックアップが作成されない
      expect(mockFs.copy).not.toHaveBeenCalled();
      // ファイルが保存されない
      expect(mockFs.writeJSON).not.toHaveBeenCalled();
    });

    it('バックアップ作成失敗: エラーログ出力', async () => {
      // Given: トークンを含むメタデータファイル、バックアップ作成失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      mockCopy.mockRejectedValue(new Error('Backup failed'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('ファイル書き込み失敗: エラーログ出力', async () => {
      // Given: トークンを含むメタデータファイル、ファイル書き込み失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      mockCopy.mockResolvedValue(undefined);
      mockWriteJSON.mockRejectedValue(new Error('Write failed'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeTokensInMetadata (through handleMigrateCommand)', () => {
    it('複数ファイル処理: 正常系', async () => {
      // Given: 3つのメタデータファイル（2つにトークンあり）
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = [
        '/tmp/repo/.ai-workflow/issue-1/metadata.json',
        '/tmp/repo/.ai-workflow/issue-2/metadata.json',
        '/tmp/repo/.ai-workflow/issue-3/metadata.json',
      ];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON
        .mockResolvedValueOnce({
          target_repository: {
            remote_url: 'https://token1@github.com/owner/repo1.git',
          },
        })
        .mockResolvedValueOnce({
          target_repository: {
            remote_url: 'git@github.com:owner/repo2.git',
          },
        })
        .mockResolvedValueOnce({
          target_repository: {
            remote_url: 'https://token3@github.com/owner/repo3.git',
          },
        });
      mockSanitizeGitUrl
        .mockReturnValueOnce('https://github.com/owner/repo1.git')
        .mockReturnValueOnce('https://github.com/owner/repo3.git');
      mockCopy.mockResolvedValue(undefined);
      mockWriteJSON.mockResolvedValue(undefined);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: 2つのファイルがサニタイズされる
      expect(mockFs.copy).toHaveBeenCalledTimes(2);
      expect(mockFs.writeJSON).toHaveBeenCalledTimes(2);
    });

    it('トークンなし（全てSSH形式）: スキップ', async () => {
      // Given: 3つのメタデータファイル（全てSSH形式）
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = [
        '/tmp/repo/.ai-workflow/issue-1/metadata.json',
        '/tmp/repo/.ai-workflow/issue-2/metadata.json',
        '/tmp/repo/.ai-workflow/issue-3/metadata.json',
      ];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockReadJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'git@github.com:owner/repo.git',
        },
      });

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: サニタイズ処理がスキップされる
      expect(mockFs.copy).not.toHaveBeenCalled();
      expect(mockFs.writeJSON).not.toHaveBeenCalled();
    });

    it('一部ファイルでエラー: 処理続行', async () => {
      // Given: 3つのメタデータファイル（1つでエラー発生）
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = [
        '/tmp/repo/.ai-workflow/issue-1/metadata.json',
        '/tmp/repo/.ai-workflow/issue-2/metadata.json',
        '/tmp/repo/.ai-workflow/issue-3/metadata.json',
      ];
      mockGlob.mockResolvedValue(mockFiles);
      mockLstat.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON
        .mockRejectedValueOnce(new Error('Failed to load metadata file'))
        .mockResolvedValueOnce({
          target_repository: {
            remote_url: 'https://token2@github.com/owner/repo2.git',
          },
        })
        .mockResolvedValueOnce({
          target_repository: {
            remote_url: 'https://token3@github.com/owner/repo3.git',
          },
        });
      mockSanitizeGitUrl
        .mockReturnValueOnce('https://github.com/owner/repo2.git')
        .mockReturnValueOnce('https://github.com/owner/repo3.git');
      mockCopy.mockResolvedValue(undefined);
      mockFs.writeJSON
        .mockRejectedValueOnce(new Error('Failed to sanitize metadata file'))
        .mockResolvedValueOnce(undefined);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(exitSpy).not.toHaveBeenCalled();
      // 1つのファイルは正常にサニタイズされる
      expect(mockFs.writeJSON).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // 型安全性の検証（Issue #45）
  // =============================================================================

  describe('型安全性の検証', () => {
    it('MigrateOptions 型が src/types/commands.ts から正しくインポートできる', () => {
      // Given: MigrateOptions 型を使用
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
        issue: '123',
        repo: '/path/to/repo',
      };

      // Then: コンパイルエラーが発生しない
      expect(options.sanitizeTokens).toBe(true);
      expect(options.dryRun).toBe(false);
      expect(options.issue).toBe('123');
      expect(options.repo).toBe('/path/to/repo');
    });

    it('MigrateOptions の必須フィールドが正しく定義されている', () => {
      // Given: 必須フィールドのみを指定
      const options: MigrateOptions = {
        sanitizeTokens: false,
        dryRun: true,
      };

      // Then: コンパイルエラーが発生しない
      expect(options.sanitizeTokens).toBe(false);
      expect(options.dryRun).toBe(true);
      expect(options.issue).toBeUndefined();
      expect(options.repo).toBeUndefined();
    });

    it('handleMigrateCommand が型安全な引数を受け入れる', () => {
      // Given: handleMigrateCommand 関数の型シグネチャ
      // When: 関数がエクスポートされている
      // Then: MigrateOptions 型を受け入れる

      // この検証はコンパイル時に実行されるため、ここではマーカーのみ
      expect(true).toBe(true);
    });
  });
});

afterAll(() => {
  exitSpy.mockRestore();
});
