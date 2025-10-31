/**
 * ユニットテスト: MetadataManager - 差し戻し機能
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - setRollbackContext()
 * - getRollbackContext()
 * - clearRollbackContext()
 * - addRollbackHistory()
 * - updatePhaseForRollback()
 * - resetSubsequentPhases()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import type { RollbackContext, RollbackHistoryEntry } from '../../../src/types/commands.js';
import type { PhaseName } from '../../../src/types.js';
import * as path from 'node:path';

// fs-extraのモック
jest.mock('fs-extra');

import * as fs from 'fs-extra';
const { existsSync } = fs as jest.Mocked<typeof fs>;

describe('MetadataManager - Rollback機能', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(false);
    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（実装フェーズが完了している状態）
    metadataManager.data.phases.implementation.status = 'completed';
    metadataManager.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];
  });

  // =============================================================================
  // UC-MM-01: setRollbackContext() - 正常系
  // =============================================================================
  describe('UC-MM-01: setRollbackContext() - 正常系', () => {
    test('差し戻しコンテキストが正しく設定される', () => {
      // Given: 差し戻しコンテキスト
      const phaseName: PhaseName = 'implementation';
      const context: RollbackContext = {
        triggered_at: '2025-01-30T12:34:56.789Z',
        from_phase: 'testing',
        from_step: 'review',
        reason: 'Type definition missing: PhaseExecutionResult needs approved and feedback fields',
        review_result: '@.ai-workflow/issue-49/06_testing/review/result.md',
        details: {
          blocker_count: 2,
          suggestion_count: 4,
          affected_tests: ['StepExecutor', 'PhaseRunner']
        }
      };

      // When: setRollbackContext()を呼び出す
      metadataManager.setRollbackContext(phaseName, context);

      // Then: rollback_contextが設定される
      expect(metadataManager.data.phases.implementation.rollback_context).toEqual(context);
    });
  });

  // =============================================================================
  // UC-MM-02: getRollbackContext() - コンテキスト存在時
  // =============================================================================
  describe('UC-MM-02: getRollbackContext() - コンテキスト存在時', () => {
    test('差し戻しコンテキストが正しく取得される', () => {
      // Given: rollback_contextが設定されている
      const phaseName: PhaseName = 'implementation';
      const context: RollbackContext = {
        triggered_at: '2025-01-30T12:34:56.789Z',
        from_phase: 'testing',
        from_step: 'review',
        reason: 'Type definition missing...',
        review_result: null,
        details: null
      };
      metadataManager.data.phases.implementation.rollback_context = context;

      // When: getRollbackContext()を呼び出す
      const result = metadataManager.getRollbackContext(phaseName);

      // Then: 設定されているrollback_contextが返される
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('Type definition missing...');
      expect(result?.from_phase).toBe('testing');
    });
  });

  // =============================================================================
  // UC-MM-03: getRollbackContext() - コンテキスト未設定時
  // =============================================================================
  describe('UC-MM-03: getRollbackContext() - コンテキスト未設定時', () => {
    test('nullが返される', () => {
      // Given: rollback_contextが未設定
      const phaseName: PhaseName = 'implementation';
      metadataManager.data.phases.implementation.rollback_context = undefined;

      // When: getRollbackContext()を呼び出す
      const result = metadataManager.getRollbackContext(phaseName);

      // Then: nullが返される
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // UC-MM-04: clearRollbackContext() - 正常系
  // =============================================================================
  describe('UC-MM-04: clearRollbackContext() - 正常系', () => {
    test('差し戻しコンテキストが正しくクリアされる', () => {
      // Given: rollback_contextが設定されている
      const phaseName: PhaseName = 'implementation';
      metadataManager.data.phases.implementation.rollback_context = {
        triggered_at: '2025-01-30T12:34:56.789Z',
        from_phase: 'testing',
        from_step: 'review',
        reason: 'Test reason',
        review_result: null,
        details: null
      };

      // When: clearRollbackContext()を呼び出す
      metadataManager.clearRollbackContext(phaseName);

      // Then: rollback_contextがnullに設定される
      expect(metadataManager.data.phases.implementation.rollback_context).toBeNull();
    });
  });

  // =============================================================================
  // UC-MM-05: addRollbackHistory() - 正常系
  // =============================================================================
  describe('UC-MM-05: addRollbackHistory() - 正常系', () => {
    test('差し戻し履歴が正しく追加される', () => {
      // Given: 差し戻し履歴エントリ
      const entry: RollbackHistoryEntry = {
        timestamp: '2025-01-30T12:34:56.789Z',
        from_phase: 'testing',
        from_step: 'review',
        to_phase: 'implementation',
        to_step: 'revise',
        reason: 'Type definition missing...',
        triggered_by: 'manual',
        review_result_path: '.ai-workflow/issue-49/06_testing/review/result.md'
      };

      // When: addRollbackHistory()を呼び出す
      metadataManager.addRollbackHistory(entry);

      // Then: rollback_history配列にentryが追加される
      expect(metadataManager.data.rollback_history).toContainEqual(entry);
    });

    test('rollback_history配列が未初期化の場合、自動的に初期化される', () => {
      // Given: rollback_history配列が未初期化
      metadataManager.data.rollback_history = undefined;
      const entry: RollbackHistoryEntry = {
        timestamp: '2025-01-30T12:34:56.789Z',
        from_phase: null,
        from_step: null,
        to_phase: 'implementation',
        to_step: 'revise',
        reason: 'Test reason',
        triggered_by: 'manual',
        review_result_path: null
      };

      // When: addRollbackHistory()を呼び出す
      metadataManager.addRollbackHistory(entry);

      // Then: 配列が初期化され、entryが追加される
      expect(metadataManager.data.rollback_history).toHaveLength(1);
      expect(metadataManager.data.rollback_history![0]).toEqual(entry);
    });
  });

  // =============================================================================
  // UC-MM-06: updatePhaseForRollback() - reviseステップへの差し戻し
  // =============================================================================
  describe('UC-MM-06: updatePhaseForRollback() - reviseステップへの差し戻し', () => {
    test('フェーズが差し戻し用に正しく更新される', () => {
      // Given: フェーズがcompleted状態
      const phaseName: PhaseName = 'implementation';
      const toStep = 'revise';
      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_at = '2025-01-30T12:00:00.000Z';

      // When: updatePhaseForRollback()を呼び出す
      metadataManager.updatePhaseForRollback(phaseName, toStep);

      // Then: statusがin_progressに変更される
      expect(metadataManager.data.phases.implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.implementation.current_step).toBe('revise');
      expect(metadataManager.data.phases.implementation.completed_at).toBeNull();
      // completed_stepsは維持される
      expect(metadataManager.data.phases.implementation.completed_steps).toEqual(['execute', 'review', 'revise']);
    });
  });

  // =============================================================================
  // UC-MM-07: updatePhaseForRollback() - executeステップへの差し戻し
  // =============================================================================
  describe('UC-MM-07: updatePhaseForRollback() - executeステップへの差し戻し', () => {
    test('executeステップへの差し戻し時にcompleted_stepsがクリアされる', () => {
      // Given: フェーズがcompleted状態
      const phaseName: PhaseName = 'implementation';
      const toStep = 'execute';
      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];

      // When: updatePhaseForRollback()を呼び出す
      metadataManager.updatePhaseForRollback(phaseName, toStep);

      // Then: completed_stepsが空配列にクリアされる
      expect(metadataManager.data.phases.implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.implementation.current_step).toBe('execute');
      expect(metadataManager.data.phases.implementation.completed_steps).toEqual([]);
    });
  });

  // =============================================================================
  // UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット
  // =============================================================================
  describe('UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット', () => {
    test('指定フェーズより後のすべてのフェーズが正しくリセットされる', () => {
      // Given: 後続フェーズが存在する
      const fromPhase: PhaseName = 'implementation';
      metadataManager.data.phases.test_implementation.status = 'completed';
      metadataManager.data.phases.testing.status = 'completed';
      metadataManager.data.phases.documentation.status = 'in_progress';

      // When: resetSubsequentPhases()を呼び出す
      const resetPhases = metadataManager.resetSubsequentPhases(fromPhase);

      // Then: 後続フェーズがすべてpendingにリセットされる
      expect(resetPhases).toEqual([
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
      expect(metadataManager.data.phases.test_implementation.status).toBe('pending');
      expect(metadataManager.data.phases.testing.status).toBe('pending');
      expect(metadataManager.data.phases.documentation.status).toBe('pending');

      // タイムスタンプとステップがクリアされる
      expect(metadataManager.data.phases.test_implementation.started_at).toBeNull();
      expect(metadataManager.data.phases.test_implementation.completed_at).toBeNull();
      expect(metadataManager.data.phases.test_implementation.current_step).toBeNull();
      expect(metadataManager.data.phases.test_implementation.completed_steps).toEqual([]);
      expect(metadataManager.data.phases.test_implementation.retry_count).toBe(0);
    });
  });

  // =============================================================================
  // UC-MM-09: resetSubsequentPhases() - 最後のフェーズの場合
  // =============================================================================
  describe('UC-MM-09: resetSubsequentPhases() - 最後のフェーズの場合', () => {
    test('最後のフェーズを指定した場合、空配列が返される', () => {
      // Given: 対象フェーズがevaluation
      const fromPhase: PhaseName = 'evaluation';

      // When: resetSubsequentPhases()を呼び出す
      const resetPhases = metadataManager.resetSubsequentPhases(fromPhase);

      // Then: 空配列が返される
      expect(resetPhases).toEqual([]);
    });
  });
});
