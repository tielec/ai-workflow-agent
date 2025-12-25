import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';

const fileExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

describe('メタデータ永続化の統合テスト', () => {
  let tempDir: string;
  let testWorkflowDir: string;
  let testMetadataPath: string;

  const setupMetadata = async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-persistence-'));
    testWorkflowDir = path.join(tempDir, '.ai-workflow', 'issue-26');
    testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

    await WorkflowState.createNew(
      testMetadataPath,
      '26',
      'https://example.com/issues/26',
      'Metadata persistence integration test',
    );
  };

  beforeEach(async () => {
    await setupMetadata();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('メタデータ永続化フロー', () => {
    it('統合テスト: メタデータの作成、更新、保存、読み込みの統合フローが動作する', async () => {
      // Given: テンプレートから生成したメタデータファイル
      const manager = new MetadataManager(testMetadataPath);

      // When: フェーズ更新とコスト追加を実行
      manager.updatePhaseStatus('planning', 'completed', {
        outputFile: '/path/to/planning.md',
      });
      manager.addCost(1000, 500, 0.05);

      // Then: 保存されたメタデータに更新内容が反映されている
      const savedData = JSON.parse(await fs.readFile(testMetadataPath, 'utf-8'));
      expect(savedData.issue_number).toBe('26');
      expect(savedData.phases.planning.status).toBe('completed');
      expect(savedData.phases.planning.output_files).toContain('/path/to/planning.md');
      expect(savedData.cost_tracking.total_input_tokens).toBe(1000);
      expect(savedData.cost_tracking.total_output_tokens).toBe(500);
      expect(savedData.cost_tracking.total_cost_usd).toBeCloseTo(0.05);
    });
  });

  describe('バックアップ＋ロールバック', () => {
    it('統合テスト: メタデータのバックアップとロールバックが動作する', async () => {
      // Given: 既存のメタデータファイル
      const manager = new MetadataManager(testMetadataPath);

      // When: バックアップを作成し、ロールバックを実行
      const backupPath = manager.backupMetadata();
      manager.updatePhaseStatus('design', 'completed');
      const result = manager.rollbackToPhase('requirements');

      // Then: バックアップが存在し、対象フェーズ以降が初期化される
      expect(await fileExists(backupPath)).toBe(true);
      expect(result.success).toBe(true);
      const rolledData = JSON.parse(await fs.readFile(testMetadataPath, 'utf-8'));
      expect(rolledData.phases.requirements.status).toBe('pending');
      expect(rolledData.phases.design.status).toBe('pending');
    });
  });

  describe('ワークフローディレクトリクリーンアップ', () => {
    it('統合テスト: ワークフローディレクトリのクリーンアップが動作する', async () => {
      // Given: メタデータファイルとワークフローディレクトリが存在
      const manager = new MetadataManager(testMetadataPath);
      expect(await fileExists(testMetadataPath)).toBe(true);

      // When: clear を実行
      manager.clear();

      // Then: メタデータファイルとワークフローディレクトリが削除される
      expect(await fileExists(testMetadataPath)).toBe(false);
      expect(await fileExists(testWorkflowDir)).toBe(false);
    });
  });
});
