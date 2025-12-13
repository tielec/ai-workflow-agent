import {
  formatTimestampForFilename,
  backupMetadataFile,
  removeWorkflowDirectory,
  getPhaseOutputFilePath,
} from '../../../src/core/helpers/metadata-io.js';
import { jest } from '@jest/globals';
import { createFsExtraMock } from '../../helpers/fs-extra-mock.js';
import { setFsExtra } from '../../../src/utils/fs-proxy.js';

describe('metadata-io', () => {
  let fsMockModule: ReturnType<typeof createFsExtraMock>;
  let fsMock: jest.Mocked<typeof import('fs-extra')>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    fsMockModule = createFsExtraMock();
    fsMock = fsMockModule.default as jest.Mocked<typeof import('fs-extra')>;
    setFsExtra(fsMock as any);
    fsMock.existsSync.mockReturnValue(false);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setFsExtra(null);
    jest.restoreAllMocks();
  });

  describe('formatTimestampForFilename', () => {
    // REQ-009: タイムスタンプフォーマット処理の抽出
    it('正常系: デフォルト（現在時刻）でYYYYMMDD_HHMMSS形式になる', () => {
      // Given: デフォルト引数（現在時刻）
      // When: formatTimestampForFilename関数を呼び出す
      const result = formatTimestampForFilename();

      // Then: YYYYMMDD_HHMMSSパターンにマッチする文字列が返される
      expect(result).toMatch(/^\d{8}_\d{6}$/);
    });

    it('正常系: カスタムDateが正しくフォーマットされる', () => {
      // Given: カスタムDateオブジェクト
      const customDate = new Date('2025-01-20T15:30:45');

      // When: formatTimestampForFilename関数を呼び出す
      const result = formatTimestampForFilename(customDate);

      // Then: '20250120_153045'が返される
      expect(result).toBe('20250120_153045');
    });

    it('正常系: 1桁の月・日・時・分・秒が2桁にパディングされる', () => {
      // Given: 1桁の値を含むDateオブジェクト
      const customDate = new Date('2025-01-05T09:08:07');

      // When: formatTimestampForFilename関数を呼び出す
      const result = formatTimestampForFilename(customDate);

      // Then: '20250105_090807'が返される（すべて2桁）
      expect(result).toBe('20250105_090807');
    });
  });

  describe('backupMetadataFile', () => {
    // REQ-007: ファイルI/O操作の共通化
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('正常系: バックアップファイルが作成される', () => {
      // Given: テスト用metadata.jsonファイルパス
      const metadataPath = '/path/to/metadata.json';
      fsMock.copyFileSync.mockImplementation(() => undefined);
      const consoleInfoSpy = jest.spyOn(console, 'info');

      // When: backupMetadataFile関数を呼び出す
      const result = backupMetadataFile(metadataPath);

      // Then: fs.copyFileSync()が呼ばれる
      expect(fsMock.copyFileSync).toHaveBeenCalled();
      // バックアップファイルパスが返される
      expect(result).toMatch(/metadata\.json\.backup_\d{8}_\d{6}$/);
      // コンソールログ出力がある
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Metadata backup created:')
      );

      consoleInfoSpy.mockRestore();
    });

    it('正常系: 元のファイル名を維持したバックアップが作成される', () => {
      const metadataPath = '/path/to/custom-metadata.json';
      fsMock.copyFileSync.mockImplementation(() => undefined);

      const result = backupMetadataFile(metadataPath);

      expect(result).toMatch(/custom-metadata\.json\.backup_\d{8}_\d{6}$/);
    });

    it('異常系: ファイルが存在しない場合、例外がスローされる', () => {
      // Given: 存在しないファイルパス
      const nonexistentPath = '/path/to/nonexistent.json';
      fsMock.copyFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      // When/Then: backupMetadataFile関数を呼び出すと例外がスローされる
      expect(() => backupMetadataFile(nonexistentPath)).toThrow(
        'ENOENT: no such file or directory'
      );
    });
  });

  describe('removeWorkflowDirectory', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('正常系: ディレクトリが削除される', () => {
      // Given: テスト用ディレクトリパス
      const workflowDir = '/path/to/.ai-workflow/issue-26';
      fsMock.existsSync.mockReturnValue(true);
      fsMock.removeSync.mockImplementation(() => undefined);
      const consoleInfoSpy = jest.spyOn(console, 'info');

      // When: removeWorkflowDirectory関数を呼び出す
      removeWorkflowDirectory(workflowDir);

      // Then: fs.existsSync()が呼ばれる
      expect(fsMock.existsSync).toHaveBeenCalledWith(workflowDir);
      // fs.removeSync()が呼ばれる
      expect(fsMock.removeSync).toHaveBeenCalledWith(workflowDir);
      // コンソールログ出力がある
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Removing workflow directory:')
      );

      consoleInfoSpy.mockRestore();
    });

    it('正常系: ディレクトリが存在しない場合、削除処理がスキップされる', () => {
      // Given: 存在しないディレクトリパス
      const nonexistentDir = '/path/to/.ai-workflow/issue-99';
      fsMock.existsSync.mockReturnValue(false);
      fsMock.removeSync.mockImplementation(() => undefined);

      // When: removeWorkflowDirectory関数を呼び出す
      removeWorkflowDirectory(nonexistentDir);

      // Then: fs.existsSync()が呼ばれる
      expect(fsMock.existsSync).toHaveBeenCalledWith(nonexistentDir);
      // fs.removeSync()は呼ばれない
      expect(fsMock.removeSync).not.toHaveBeenCalled();
    });
  });

  describe('getPhaseOutputFilePath', () => {
    it('正常系: planningフェーズの出力ファイルパスが取得される', () => {
      // Given: planningフェーズとワークフローディレクトリ（プレフィックス付き）
      const phaseName = '00_planning';
      const workflowDir = '/path/to/.ai-workflow/issue-26';

      // When: getPhaseOutputFilePath関数を呼び出す
      const result = getPhaseOutputFilePath(phaseName as any, workflowDir);

      // Then: 正しいパスが返される
      expect(result).toBe(
        '/path/to/.ai-workflow/issue-26/00_planning/output/planning.md'
      );
    });

    it('正常系: requirementsフェーズの出力ファイルパスが取得される', () => {
      // Given: requirementsフェーズとワークフローディレクトリ（プレフィックス付き）
      const phaseName = '01_requirements';
      const workflowDir = '/path/to/.ai-workflow/issue-26';

      // When: getPhaseOutputFilePath関数を呼び出す
      const result = getPhaseOutputFilePath(phaseName as any, workflowDir);

      // Then: 正しいパスが返される
      expect(result).toBe(
        '/path/to/.ai-workflow/issue-26/01_requirements/output/requirements.md'
      );
    });

    it('正常系: testingフェーズでreview/result.mdが存在すればそのパスを返す', () => {
      const workflowDir = '/path/to/.ai-workflow/issue-38';
      const reviewPath = `${workflowDir}/06_testing/review/result.md`;
      fsMock.existsSync.mockImplementation((targetPath) => targetPath === reviewPath);

      const result = getPhaseOutputFilePath('testing' as any, workflowDir);

      expect(result).toBe(reviewPath);
      expect(fsMock.existsSync).toHaveBeenCalledWith(reviewPath);
    });

    it('正常系: testingフェーズでreview/result.mdが無ければ従来パスを返す', () => {
      const workflowDir = '/path/to/.ai-workflow/issue-26';
      const reviewPath = `${workflowDir}/06_testing/review/result.md`;
      const legacyPath = `${workflowDir}/06_testing/output/test-result.md`;
      fsMock.existsSync.mockImplementation(() => false);

      const result = getPhaseOutputFilePath('testing' as any, workflowDir);

      expect(result).toBe(legacyPath);
      expect(fsMock.existsSync).toHaveBeenCalledWith(reviewPath);
    });

    it('異常系: 無効なフェーズ名の場合、nullが返される', () => {
      // Given: 無効なフェーズ名
      const invalidPhaseName = 'invalid';
      const workflowDir = '/path/to/.ai-workflow/issue-26';

      // When: getPhaseOutputFilePath関数を呼び出す
      const result = getPhaseOutputFilePath(invalidPhaseName as any, workflowDir);

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });
});
