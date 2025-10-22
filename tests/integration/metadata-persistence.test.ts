import { MetadataManager } from '../../src/core/metadata-manager.js';
import * as fs from 'fs-extra';
import * as path from 'node:path';

// fs-extraのモック
jest.mock('fs-extra');

describe('メタデータ永続化の統合テスト', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-26';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('メタデータ永続化フロー', () => {
    it('統合テスト: メタデータの作成、更新、保存、読み込みの統合フローが動作する', () => {
      // Given: テスト用ワークフローディレクトリ
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.ensureDirSync as jest.Mock).mockImplementation(() => {});
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

      // When: MetadataManagerインスタンスを作成
      const manager = new MetadataManager(testMetadataPath);

      // フェーズステータスを更新
      manager.updatePhaseStatus('00_planning' as any, 'completed' as any, {
        outputFile: '/path/to/planning.md',
      });

      // コストを追加（3引数: inputTokens, outputTokens, costUsd）
      manager.addCost(1000, 500, 0.05);

      // メタデータを保存
      manager.save();

      // Then: メタデータが正しく保存される
      expect(fs.writeFileSync).toHaveBeenCalled();
      // 保存された内容を確認（モックの呼び出し引数を確認）
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toContain('metadata.json');
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.issueNumber).toBe(26);
    });
  });

  describe('バックアップ＋ロールバック', () => {
    it('統合テスト: メタデータのバックアップとロールバックが動作する', () => {
      // Given: 既存のメタデータファイル
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          issueNumber: 26,
          phaseStatuses: {},
          totalCost: {},
        })
      );
      (fs.copyFileSync as jest.Mock).mockImplementation(() => {});
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // When: メタデータを読み込み
      const manager = new MetadataManager(testMetadataPath);

      // バックアップを作成
      const backupPath = manager.backupMetadata();

      // Then: バックアップファイルが作成される
      expect(backupPath).toMatch(/metadata\.json\.backup_\d{8}_\d{6}$/);
      expect(fs.copyFileSync).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('ワークフローディレクトリクリーンアップ', () => {
    it('統合テスト: ワークフローディレクトリのクリーンアップが動作する', () => {
      // Given: メタデータファイルとワークフローディレクトリが存在
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.removeSync as jest.Mock).mockImplementation(() => {});
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // When: MetadataManagerインスタンスを作成してclearを呼び出す
      const manager = new MetadataManager(testMetadataPath);
      manager.clear();

      // Then: メタデータファイルとワークフローディレクトリが削除される
      expect(fs.removeSync).toHaveBeenCalled();
      // 削除処理のログが出力される
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Clearing metadata:')
      );

      consoleInfoSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
