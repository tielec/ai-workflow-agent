import { jest } from '@jest/globals';
import * as path from 'node:path';

const baseMetadata = {
  issue_number: '26',
  issue_url: 'https://example.com/issues/26',
  issue_title: 'Test Issue 26',
  repository: null,
  target_repository: null,
  workflow_version: '1.0.0',
  current_phase: 'planning',
  design_decisions: {
    implementation_strategy: null,
    test_strategy: null,
    test_code_strategy: null,
  },
  cost_tracking: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
  },
  phases: {
    planning: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    requirements: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    design: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_scenario: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    testing: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    documentation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    report: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    evaluation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
      decision: null,
      failed_phase: null,
      remaining_tasks: [],
      created_issue_url: null,
      abort_reason: null,
    },
  },
  rollback_history: [],
  created_at: '',
  updated_at: '',
};

// fs-extra モジュールをモック化（namespace import問題を回避）
jest.unstable_mockModule('fs-extra', () => ({
  default: {
    existsSync: jest.fn(),
    ensureDirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    copyFileSync: jest.fn(),
    removeSync: jest.fn(),
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
  },
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  removeSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}));

// モジュールをダイナミックインポート
const fs = await import('fs-extra');
const { MetadataManager } = await import('../../src/core/metadata-manager.js');

describe('メタデータ永続化の統合テスト', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-26';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue(
      JSON.stringify(baseMetadata),
    );
    (fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>).mockImplementation(() => {});
    (fs.ensureDirSync as jest.MockedFunction<typeof fs.ensureDirSync>).mockImplementation(
      () => undefined,
    );
  });

  describe('メタデータ永続化フロー', () => {
    it('統合テスト: メタデータの作成、更新、保存、読み込みの統合フローが動作する', () => {
      // When: MetadataManagerインスタンスを作成
      const manager = new MetadataManager(testMetadataPath);

      // フェーズステータスを更新
      manager.updatePhaseStatus('planning', 'completed' as any, {
        outputFile: '/path/to/planning.md',
      });

      // コストを追加（3引数: inputTokens, outputTokens, costUsd）
      manager.addCost(1000, 500, 0.05);

      // メタデータを保存
      manager.save();

      // Then: メタデータが正しく保存される
      expect(fs.writeFileSync).toHaveBeenCalled();
      // 保存された内容を確認（モックの呼び出し引数を確認）
      const writeCall = (fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>).mock.calls[0];
      expect(writeCall[0]).toContain('metadata.json');
      const savedData = JSON.parse(writeCall[1] as string);
      expect(savedData.issue_number).toBe('26');
    });
  });

  describe('バックアップ＋ロールバック', () => {
    it('統合テスト: メタデータのバックアップとロールバックが動作する', () => {
      // Given: 既存のメタデータファイル
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue(
        JSON.stringify({
          issueNumber: 26,
          phaseStatuses: {},
          totalCost: {},
        })
      );
      (fs.copyFileSync as jest.MockedFunction<typeof fs.copyFileSync>).mockImplementation(() => {});
      (fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>).mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

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
      (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.removeSync as jest.MockedFunction<typeof fs.removeSync>).mockImplementation(() => {});
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

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
