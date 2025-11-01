/**
 * インテグレーションテスト: 差し戻しワークフロー
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - エンドツーエンドの差し戻しシナリオ
 * - プロンプト注入の検証
 * - メタデータ更新の検証
 *
 * テスト戦略: UNIT_INTEGRATION - インテグレーション部分
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleRollbackCommand } from '../../src/commands/rollback.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import type { RollbackCommandOptions } from '../../src/types/commands.js';
import type { PhaseName } from '../../src/types.js';
import * as path from 'node:path';

// fs-extraのモック - モック化してからインポート
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
}));

import * as fs from 'fs-extra';

describe('Integration: Rollback Workflow', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined as any);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);

    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（Phase 6が完了している状態）
    metadataManager.data.phases.implementation.status = 'completed';
    metadataManager.data.phases.test_implementation.status = 'completed';
    metadataManager.data.phases.testing.status = 'completed';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー
  // =============================================================================
  describe('IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー', () => {
    test('エンドツーエンドの差し戻しフローが正しく動作する', async () => {
      // Given: Phase 6が完了しており、差し戻しコマンドのオプション
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'Type definition missing: PhaseExecutionResult needs approved and feedback fields',
        force: true // 確認プロンプトをスキップ
      };

      // fs.existsSync のモックを設定（メタデータファイルが存在する）
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: 差し戻しコマンドを実行
      await handleRollbackCommand(options);

      // Then: メタデータが正しく更新される
      // 1. Phase 4の状態確認
      expect(metadataManager.data.phases.implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.implementation.current_step).toBe('revise');
      expect(metadataManager.data.phases.implementation.completed_at).toBeNull();

      // 2. rollback_contextが設定されている
      expect(metadataManager.data.phases.implementation.rollback_context).toBeDefined();
      expect(metadataManager.data.phases.implementation.rollback_context?.reason)
        .toContain('Type definition missing');

      // 3. 後続フェーズがリセットされている
      expect(metadataManager.data.phases.test_implementation.status).toBe('pending');
      expect(metadataManager.data.phases.testing.status).toBe('pending');

      // 4. ROLLBACK_REASON.mdが生成される（fs.writeFileSyncが呼ばれる）
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IC-E2E-02: 差し戻し理由の直接指定（--reason）
  // =============================================================================
  describe('IC-E2E-02: 差し戻し理由の直接指定（--reason）', () => {
    test('--reasonオプションでの差し戻しフローが正しく動作する', async () => {
      // Given: --reasonオプションで理由を指定
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: '型定義にapprovedとfeedbackフィールドが不足しています。src/types.tsを修正してください。',
        force: true
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: 差し戻しコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollback_context.reasonが指定された理由と一致する
      expect(metadataManager.data.phases.implementation.rollback_context?.reason)
        .toContain('型定義にapprovedとfeedbackフィールドが不足');

      // review_resultがnullである
      expect(metadataManager.data.phases.implementation.rollback_context?.review_result).toBeNull();

      // detailsがnullである
      expect(metadataManager.data.phases.implementation.rollback_context?.details).toBeNull();
    });
  });

  // =============================================================================
  // IC-E2E-04: executeステップへの差し戻し（--to-step execute）
  // =============================================================================
  describe('IC-E2E-04: executeステップへの差し戻し（--to-step execute）', () => {
    test('executeステップへの差し戻しでcompleted_stepsがクリアされる', async () => {
      // Given: executeステップへの差し戻し
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        toStep: 'execute',
        reason: 'Phase 4を最初から再実装が必要。',
        force: true
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: 差し戻しコマンドを実行
      await handleRollbackCommand(options);

      // Then: current_stepが'execute'である
      expect(metadataManager.data.phases.implementation.current_step).toBe('execute');

      // completed_stepsが空配列である
      expect(metadataManager.data.phases.implementation.completed_steps).toEqual([]);
    });
  });

  // =============================================================================
  // IC-HISTORY-01: 差し戻し履歴が正しく記録される
  // =============================================================================
  describe('IC-HISTORY-01: 差し戻し履歴が正しく記録される', () => {
    test('差し戻し履歴がメタデータに正しく記録される', async () => {
      // Given: 差し戻しコマンドのオプション
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'First rollback',
        force: true
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: 差し戻しコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollback_history配列にエントリが追加される
      expect(metadataManager.data.rollback_history).toBeDefined();
      expect(metadataManager.data.rollback_history!.length).toBeGreaterThan(0);

      const latestEntry = metadataManager.data.rollback_history![
        metadataManager.data.rollback_history!.length - 1
      ];
      expect(latestEntry.to_phase).toBe('implementation');
      expect(latestEntry.reason).toBe('First rollback');
      expect(latestEntry.triggered_by).toBe('manual');
    });
  });
});

describe('Integration: Rollback Workflow - エラーハンドリング', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as any) = jest.fn().mockReturnValue(false);
    metadataManager = new MetadataManager(testMetadataPath);
  });

  // =============================================================================
  // IC-ERR-01: 無効なフェーズ名でエラーメッセージが表示される
  // =============================================================================
  describe('IC-ERR-01: 無効なフェーズ名でエラーメッセージが表示される', () => {
    test('無効なフェーズ名が指定された場合に適切なエラーメッセージが表示される', async () => {
      // Given: 無効なフェーズ名
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'invalid-phase',
        reason: 'Test'
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When & Then: エラーがスローされる
      await expect(handleRollbackCommand(options))
        .rejects.toThrow(/Invalid phase name/);
    });
  });

  // =============================================================================
  // IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される
  // =============================================================================
  describe('IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される', () => {
    test('未開始フェーズへの差し戻しが適切にエラーになる', async () => {
      // Given: 未開始フェーズ（documentation）
      metadataManager.data.phases.documentation.status = 'pending';
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'documentation',
        reason: 'Test'
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When & Then: エラーがスローされる
      await expect(handleRollbackCommand(options))
        .rejects.toThrow(/has not been started yet/);
    });
  });

  // =============================================================================
  // IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング
  // =============================================================================
  describe('IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング', () => {
    test('差し戻し理由が指定されていない場合に適切なエラーメッセージが表示される', async () => {
      // Given: 差し戻し理由が未指定
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation'
        // reason, reasonFile が未指定
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When & Then: エラーがスローされる
      await expect(handleRollbackCommand(options))
        .rejects.toThrow(/Rollback reason is required/);
    });
  });
});

describe('Integration: Rollback Workflow - 後方互換性', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as any) = jest.fn().mockReturnValue(false);
    metadataManager = new MetadataManager(testMetadataPath);
  });

  // =============================================================================
  // IC-COMPAT-02: 既存のメタデータ構造が変更されないことを確認
  // =============================================================================
  describe('IC-COMPAT-02: 既存のメタデータ構造が変更されないことを確認', () => {
    test('差し戻し機能を使用しない場合、メタデータ構造に変更がない', () => {
      // Given: メタデータを読み込む
      // rollback_context、rollback_historyが存在しない

      // When: getRollbackContext()を呼び出す
      const rollbackContext = metadataManager.getRollbackContext('implementation');

      // Then: nullが返される
      expect(rollbackContext).toBeNull();

      // rollback_historyが存在しないか、空配列である
      expect(metadataManager.data.rollback_history).toBeUndefined();
    });
  });
});
