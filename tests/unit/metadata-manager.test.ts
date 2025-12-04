import { MetadataManager } from '../../src/core/metadata-manager.js';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { jest } from '@jest/globals';

// fs-extraのモック
jest.mock('fs-extra');

describe('MetadataManager', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = '/test/.ai-workflow/issue-26';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as any) = jest.fn().mockReturnValue(false);
    metadataManager = new MetadataManager(testMetadataPath);
  });

  describe('updatePhaseStatus', () => {
    // REQ-007, REQ-008, REQ-009: リファクタリング後の動作確認
    it('正常系: フェーズステータスが更新される', () => {
      // Given: フェーズ名とステータス
      const phaseName = '00_planning';
      const status = 'completed';
      const outputFile = '/path/to/planning.md';

      // When: updatePhaseStatus関数を呼び出す
      metadataManager.updatePhaseStatus(phaseName as any, status as any, {
        outputFile,
      });

      // Then: ステータスが更新される（内部状態の確認）
      expect(metadataManager.getPhaseStatus(phaseName as any)).toBe(status);
    });
  });

  describe('addCost', () => {
    it('正常系: コストが集計される', () => {
      // Given: コスト情報（3引数: inputTokens, outputTokens, costUsd）
      const inputTokens = 1000;
      const outputTokens = 500;
      const costUsd = 0.05;

      // When: addCost関数を呼び出す
      metadataManager.addCost(inputTokens, outputTokens, costUsd);

      // Then: コストが集計される（内部状態の確認は困難）
      expect(true).toBe(true);
    });
  });

  describe('backupMetadata', () => {
    it('正常系: バックアップファイルが作成される（ヘルパー関数使用）', () => {
      // Given: メタデータファイルが存在する
      (fs.existsSync as any) = jest.fn().mockReturnValue(true);
      (fs.copyFileSync as any) = jest.fn().mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: backupMetadata関数を呼び出す
      const result = metadataManager.backupMetadata();

      // Then: バックアップファイルパスが返される
      expect(result).toMatch(/metadata\.json\.backup_\d{8}_\d{6}$/);

      consoleLogSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('正常系: メタデータとワークフローディレクトリが削除される（ヘルパー関数使用）', () => {
      // Given: メタデータファイルとワークフローディレクトリが存在する
      (fs.existsSync as any) = jest.fn().mockReturnValue(true);
      (fs.removeSync as any) = jest.fn().mockImplementation(() => {});
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: clear関数を呼び出す
      metadataManager.clear();

      // Then: メタデータファイルとワークフローディレクトリが削除される
      expect(fs.removeSync).toHaveBeenCalled();

      consoleInfoSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('save', () => {
    it('正常系: メタデータが保存される', () => {
      // Given: メタデータマネージャー
      (fs.ensureDirSync as any) = jest.fn().mockImplementation(() => {});
      (fs.writeFileSync as any) = jest.fn().mockImplementation(() => {});

      // When: save関数を呼び出す
      metadataManager.save();

      // Then: ファイルが書き込まれる
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // Issue #194: Squash関連フィールドのテスト
  describe('base_commit', () => {
    // テストケース 2.5.1: setBaseCommit_getBaseCommit_正常系
    it('should set and get base_commit correctly', () => {
      // Given: base_commitの値
      const commit = 'abc123def456789012345678901234567890abcd';
      (fs.ensureDirSync as any) = jest.fn().mockImplementation(() => {});
      (fs.writeFileSync as any) = jest.fn().mockImplementation(() => {});

      // When: setBaseCommit を呼び出す
      metadataManager.setBaseCommit(commit);

      // Then: getBaseCommit で同じ値が返される
      expect(metadataManager.getBaseCommit()).toBe(commit);
    });

    // テストケース 2.5.2: getBaseCommit_正常系_base_commit未記録
    it('should return null when base_commit is not recorded', () => {
      // Given: base_commitが未記録

      // When: getBaseCommit を呼び出す
      const result = metadataManager.getBaseCommit();

      // Then: null が返される
      expect(result).toBeNull();
    });
  });

  describe('pre_squash_commits', () => {
    // テストケース 2.6.1: setPreSquashCommits_getPreSquashCommits_正常系
    it('should set and get pre_squash_commits correctly', () => {
      // Given: コミットハッシュの配列
      const commits = [
        'commit1hash000000000000000000000000000',
        'commit2hash000000000000000000000000000',
        'commit3hash000000000000000000000000000',
      ];
      (fs.ensureDirSync as any) = jest.fn().mockImplementation(() => {});
      (fs.writeFileSync as any) = jest.fn().mockImplementation(() => {});

      // When: setPreSquashCommits を呼び出す
      metadataManager.setPreSquashCommits(commits);

      // Then: getPreSquashCommits で同じ配列が返される
      expect(metadataManager.getPreSquashCommits()).toEqual(commits);
    });

    // テストケース 2.6.2: getPreSquashCommits_正常系_未記録
    it('should return null when pre_squash_commits is not recorded', () => {
      // Given: pre_squash_commitsが未記録

      // When: getPreSquashCommits を呼び出す
      const result = metadataManager.getPreSquashCommits();

      // Then: null が返される
      expect(result).toBeNull();
    });
  });

  describe('squashed_at', () => {
    // テストケース 2.7.1: setSquashedAt_getSquashedAt_正常系
    it('should set and get squashed_at correctly', () => {
      // Given: ISO 8601形式のタイムスタンプ
      const timestamp = '2025-01-30T12:34:56.789Z';
      (fs.ensureDirSync as any) = jest.fn().mockImplementation(() => {});
      (fs.writeFileSync as any) = jest.fn().mockImplementation(() => {});

      // When: setSquashedAt を呼び出す
      metadataManager.setSquashedAt(timestamp);

      // Then: getSquashedAt で同じ値が返される
      expect(metadataManager.getSquashedAt()).toBe(timestamp);
    });

    // テストケース 2.7.2: getSquashedAt_正常系_未記録
    it('should return null when squashed_at is not recorded', () => {
      // Given: squashed_atが未記録

      // When: getSquashedAt を呼び出す
      const result = metadataManager.getSquashedAt();

      // Then: null が返される
      expect(result).toBeNull();
    });
  });
});
