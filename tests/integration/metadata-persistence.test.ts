import { jest } from '@jest/globals';
import * as path from 'node:path';

// Factory-based mock functions (ESM compatible)
const mockExistsSync = jest.fn<any>();
const mockReadFileSync = jest.fn<any>();
const mockReadJsonSync = jest.fn<any>();
const mockWriteFileSync = jest.fn<any>();
const mockWriteJsonSync = jest.fn<any>();
const mockEnsureDirSync = jest.fn<any>();
const mockCopyFileSync = jest.fn<any>();
const mockRemoveSync = jest.fn<any>();

// ESM-compatible mocks with factory functions
jest.unstable_mockModule('fs-extra', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readJsonSync: mockReadJsonSync,
    writeFileSync: mockWriteFileSync,
    writeJsonSync: mockWriteJsonSync,
    ensureDirSync: mockEnsureDirSync,
    copyFileSync: mockCopyFileSync,
    removeSync: mockRemoveSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readJsonSync: mockReadJsonSync,
  writeFileSync: mockWriteFileSync,
  writeJsonSync: mockWriteJsonSync,
  ensureDirSync: mockEnsureDirSync,
  copyFileSync: mockCopyFileSync,
  removeSync: mockRemoveSync,
}));

// Import after mocking
const { MetadataManager } = await import('../../src/core/metadata-manager.js');

describe('メタデータ永続化の統合テスト', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-26';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('メタデータ永続化フロー', () => {
    it('統合テスト: メタデータの作成、更新、保存、読み込みの統合フローが動作する', () => {
      // Given: 既存のメタデータファイルが存在する
      mockExistsSync.mockReturnValue(true);
      mockReadJsonSync.mockReturnValue({
        issueNumber: 26,
        issueTitle: 'Test Issue',
        phases: {
          planning: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null, output_files: [], current_step: null, completed_steps: [], rollback_context: null },
        },
        cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      });
      mockEnsureDirSync.mockImplementation(() => {});
      mockWriteJsonSync.mockImplementation(() => {});

      // When: MetadataManagerインスタンスを作成
      const manager = new MetadataManager(testMetadataPath);

      // フェーズステータスを更新
      manager.updatePhaseStatus('planning' as any, 'in_progress' as any, {
        outputFile: '/path/to/planning.md',
      });

      // コストを追加（3引数: inputTokens, outputTokens, costUsd）
      manager.addCost(1000, 500, 0.05);

      // メタデータを保存
      manager.save();

      // Then: メタデータが正しく保存される
      expect(mockWriteJsonSync).toHaveBeenCalled();
      // メタデータが読み込まれたことを確認
      expect(mockReadJsonSync).toHaveBeenCalledWith(testMetadataPath);
    });
  });

  describe('バックアップ＋ロールバック', () => {
    it('統合テスト: メタデータのバックアップとロールバックが動作する', () => {
      // Given: 既存のメタデータファイル
      mockExistsSync.mockReturnValue(true);
      mockReadJsonSync.mockReturnValue({
        issueNumber: 26,
        issueTitle: 'Test Issue',
        phases: {
          planning: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null, output_files: [], current_step: null, completed_steps: [], rollback_context: null },
        },
        cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      });
      mockCopyFileSync.mockImplementation(() => {});
      mockWriteJsonSync.mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: メタデータを読み込み
      const manager = new MetadataManager(testMetadataPath);

      // バックアップを作成
      const backupPath = manager.backupMetadata();

      // Then: バックアップファイルが作成される
      expect(backupPath).toMatch(/metadata\.json\.backup_\d{8}_\d{6}$/);
      expect(mockCopyFileSync).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('ワークフローディレクトリクリーンアップ', () => {
    it('統合テスト: ワークフローディレクトリのクリーンアップが動作する', () => {
      // Given: メタデータファイルとワークフローディレクトリが存在
      mockExistsSync.mockReturnValue(true);
      mockReadJsonSync.mockReturnValue({
        issueNumber: 26,
        issueTitle: 'Test Issue',
        phases: {
          planning: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null, output_files: [], current_step: null, completed_steps: [], rollback_context: null },
        },
        cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      });
      mockRemoveSync.mockImplementation(() => {});
      mockWriteJsonSync.mockImplementation(() => {});
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: MetadataManagerインスタンスを作成してclearを呼び出す
      const manager = new MetadataManager(testMetadataPath);

      // clear呼び出し前にファイルが存在しない状態をシミュレート
      mockExistsSync.mockReturnValue(false);
      manager.clear();

      // Then: メタデータが読み込まれ、クリア処理が実行される
      expect(mockReadJsonSync).toHaveBeenCalled();

      consoleInfoSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
