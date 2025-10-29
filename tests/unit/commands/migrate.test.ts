/**
 * Unit tests for migrate command (Issue #58, Task 3)
 */

import fs from 'fs-extra';
import path from 'node:path';
import { glob } from 'glob';
import {
  handleMigrateCommand,
  MigrateOptions,
  MigrationResult,
} from '../../../src/commands/migrate.js';
import { sanitizeGitUrl } from '../../../src/utils/git-url-utils.js';

// モックの設定
jest.mock('fs-extra');
jest.mock('glob');
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/utils/git-url-utils.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGlob = glob as jest.MockedFunction<typeof glob>;
const mockSanitizeGitUrl = sanitizeGitUrl as jest.MockedFunction<
  typeof sanitizeGitUrl
>;

// process.exit のモック
const mockExit = jest
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as jest.SpyInstance;

describe('migrate command - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('マイグレーション処理が失敗した場合、エラーを表示して終了', async () => {
      // Given: sanitizeTokens フラグが true だが、glob がエラーをスロー
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      (mockGlob as unknown as jest.Mock).mockRejectedValue(new Error('Glob failed'));

      // When/Then: process.exit(1) が呼び出される
      await expect(handleMigrateCommand(options)).rejects.toThrow();
      expect(mockExit).toHaveBeenCalledWith(1);
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      expect(mockExit).not.toHaveBeenCalled();
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockRejectedValue(new Error('File not found'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('JSON解析失敗: null が返される', async () => {
      // Given: JSON解析が失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      (mockFs.readJSON as jest.Mock).mockRejectedValue(new Error('Invalid JSON'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('シンボリックリンク攻撃防止: null が返される', async () => {
      // Given: シンボリックリンク
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: true,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      const mockContent = {
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      };
      mockFs.readJSON.mockResolvedValue(mockContent);
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      (mockFs.copy as unknown as jest.Mock).mockResolvedValue(undefined);
      mockFs.writeJSON.mockResolvedValue(undefined);

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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      (mockFs.copy as unknown as jest.Mock).mockRejectedValue(new Error('Backup failed'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('ファイル書き込み失敗: エラーログ出力', async () => {
      // Given: トークンを含むメタデータファイル、ファイル書き込み失敗
      const options: MigrateOptions = {
        sanitizeTokens: true,
        dryRun: false,
      };
      const mockFiles = ['/tmp/repo/.ai-workflow/issue-1/metadata.json'];
      mockGlob.mockResolvedValue(mockFiles);
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
        target_repository: {
          remote_url: 'https://ghp_token@github.com/owner/repo.git',
        },
      });
      mockSanitizeGitUrl.mockReturnValue('https://github.com/owner/repo.git');
      (mockFs.copy as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.writeJSON as jest.Mock).mockRejectedValue(new Error('Write failed'));

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(mockExit).not.toHaveBeenCalled();
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
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
      (mockFs.copy as unknown as jest.Mock).mockResolvedValue(undefined);
      mockFs.writeJSON.mockResolvedValue(undefined);

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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      mockFs.readJSON.mockResolvedValue({
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
      (mockFs.lstat as unknown as jest.Mock).mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      (mockFs.readJSON as jest.Mock)
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
      (mockFs.copy as unknown as jest.Mock).mockResolvedValue(undefined);
      (mockFs.writeJSON as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed to sanitize metadata file'))
        .mockResolvedValueOnce(undefined);

      // When: マイグレーションコマンドを実行
      await handleMigrateCommand(options);

      // Then: エラーで終了しない（続行）
      expect(mockExit).not.toHaveBeenCalled();
      // 1つのファイルは正常にサニタイズされる
      expect(mockFs.writeJSON).toHaveBeenCalled();
    });
  });
});
