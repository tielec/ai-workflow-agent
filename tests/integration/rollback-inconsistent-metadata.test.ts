/**
 * インテグレーションテスト: 不整合メタデータでのrollback
 * Issue #208: metadata.json の不整合によるrollback失敗の修正
 *
 * テスト対象:
 * - 不整合状態（status: 'pending' + completed_steps: [...]) でのrollback成功
 * - Evaluation Phase → フェーズリセット → Rollbackの完全フロー
 * - 既存ワークフローへの影響なし（後方互換性）
 *
 * テスト戦略: UNIT_INTEGRATION - インテグレーション部分
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { handleRollbackCommand } from '../../src/commands/rollback.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import type { RollbackCommandOptions } from '../../src/types/commands.js';
import * as path from 'node:path';

// fs-extraのモック
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  copyFileSync: jest.fn(),
}));

import * as fs from 'fs-extra';

describe('Integration: Rollback with Inconsistent Metadata (Issue #208)', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-208';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined as any);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
    (fs.copyFileSync as jest.Mock).mockImplementation(() => undefined);

    metadataManager = new MetadataManager(testMetadataPath);
  });

  // =============================================================================
  // IT-E2E-001 (Issue #208): 不整合状態でのrollback成功（End-to-End）
  // =============================================================================
  describe('IT-E2E-001: Issue #208の再現と修正確認', () => {
    test('不整合状態（status: pending + completed_steps: [...]）からrollbackが成功する', async () => {
      // Given: 不整合状態のメタデータ
      // test_implementation: status='pending' だが completed_steps=['execute', 'review']
      metadataManager.data.phases.planning.status = 'completed';
      metadataManager.data.phases.planning.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.requirements.status = 'completed';
      metadataManager.data.phases.requirements.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.design.status = 'completed';
      metadataManager.data.phases.design.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.test_scenario.status = 'completed';
      metadataManager.data.phases.test_scenario.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_steps = ['execute', 'review'];

      // 不整合状態
      metadataManager.data.phases.test_implementation.status = 'pending';
      metadataManager.data.phases.test_implementation.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.test_implementation.started_at = null;

      metadataManager.data.phases.testing.status = 'pending';
      metadataManager.data.phases.testing.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.testing.started_at = null;

      metadataManager.data.phases.evaluation.status = 'in_progress';
      metadataManager.data.phases.evaluation.completed_steps = ['execute'];
      metadataManager.data.phases.evaluation.current_step = 'review';

      const options: RollbackCommandOptions = {
        issue: '194',
        toPhase: 'test_implementation',
        toStep: 'revise',
        reason: 'Fix inconsistent metadata',
        force: true // 確認プロンプトをスキップ
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: rollbackコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollbackが成功する（エラーで失敗しない）
      // 1. test_implementation の状態確認
      expect(metadataManager.data.phases.test_implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.test_implementation.current_step).toBe('revise');

      // 2. rollback_contextが設定されている
      expect(metadataManager.data.phases.test_implementation.rollback_context).toBeDefined();
      expect(metadataManager.data.phases.test_implementation.rollback_context?.reason)
        .toContain('Fix inconsistent metadata');

      // 3. ROLLBACK_REASON.mdが生成される
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IT-EVAL-001: Evaluation Phase → フェーズリセット → Rollback
  // =============================================================================
  describe('IT-EVAL-001: Evaluation PhaseでのFAIL判定後のrollback', () => {
    test('Evaluation Phaseでのフェーズリセット後、rollbackが正常に動作する', () => {
      // Given: Evaluation Phaseで後続フェーズがリセットされた状態をシミュレート
      metadataManager.data.phases.test_implementation.status = 'completed';
      metadataManager.data.phases.test_implementation.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.test_implementation.started_at = '2025-01-30T10:00:00Z';
      metadataManager.data.phases.test_implementation.completed_at = '2025-01-30T11:00:00Z';

      // When: rollbackToPhase() を呼び出してフェーズをリセット
      const result = metadataManager.rollbackToPhase('test_implementation');

      // Then: 後続フェーズが完全にリセットされる
      expect(result.success).toBe(true);

      // testing フェーズがリセットされている
      expect(metadataManager.data.phases.testing.status).toBe('pending');
      expect(metadataManager.data.phases.testing.completed_steps).toEqual([]);
      expect(metadataManager.data.phases.testing.started_at).toBeNull();
      expect(metadataManager.data.phases.testing.current_step).toBeNull();

      // documentation フェーズもリセットされている
      expect(metadataManager.data.phases.documentation.status).toBe('pending');
      expect(metadataManager.data.phases.documentation.completed_steps).toEqual([]);
      expect(metadataManager.data.phases.documentation.started_at).toBeNull();
      expect(metadataManager.data.phases.documentation.current_step).toBeNull();

      // report フェーズもリセットされている
      expect(metadataManager.data.phases.report.status).toBe('pending');
      expect(metadataManager.data.phases.report.completed_steps).toEqual([]);
      expect(metadataManager.data.phases.report.started_at).toBeNull();
      expect(metadataManager.data.phases.report.current_step).toBeNull();
    });

    test('フェーズリセット後、不整合が発生しない', () => {
      // Given: Phase を rollbackToPhase() でリセット
      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_steps = ['execute', 'review'];

      // When: rollbackToPhase() を呼び出す
      metadataManager.rollbackToPhase('implementation');

      // Then: 後続フェーズで validatePhaseConsistency() が警告を出さない
      const validationResult = metadataManager.validatePhaseConsistency('test_implementation');
      expect(validationResult.valid).toBe(true);
      expect(validationResult.warnings).toEqual([]);
    });
  });

  // =============================================================================
  // IT-COMPAT-001: 既存ワークフローへの影響なし（後方互換性）
  // =============================================================================
  describe('IT-COMPAT-001: 正常なワークフローでのrollback', () => {
    test('整合性のある正常なメタデータに対して、既存の動作が変更されない', async () => {
      // Given: 正常なワークフロー（status と completed_steps が整合している）
      metadataManager.data.phases.planning.status = 'completed';
      metadataManager.data.phases.planning.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.planning.started_at = '2025-01-30T09:00:00Z';
      metadataManager.data.phases.planning.completed_at = '2025-01-30T09:30:00Z';

      metadataManager.data.phases.requirements.status = 'completed';
      metadataManager.data.phases.requirements.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.requirements.started_at = '2025-01-30T09:35:00Z';
      metadataManager.data.phases.requirements.completed_at = '2025-01-30T10:00:00Z';

      metadataManager.data.phases.design.status = 'in_progress';
      metadataManager.data.phases.design.completed_steps = ['execute'];
      metadataManager.data.phases.design.started_at = '2025-01-30T10:05:00Z';
      metadataManager.data.phases.design.current_step = 'review';

      // test_scenario は未開始（整合している）
      metadataManager.data.phases.test_scenario.status = 'pending';
      metadataManager.data.phases.test_scenario.completed_steps = [];
      metadataManager.data.phases.test_scenario.started_at = null;
      metadataManager.data.phases.test_scenario.current_step = null;

      const options: RollbackCommandOptions = {
        issue: '208',
        toPhase: 'requirements',
        toStep: 'revise',
        reason: 'Testing backward compatibility',
        force: true
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: rollbackコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollbackが正常に動作する
      expect(metadataManager.data.phases.requirements.status).toBe('in_progress');
      expect(metadataManager.data.phases.requirements.current_step).toBe('revise');

      // 後続フェーズがリセットされる
      expect(metadataManager.data.phases.design.status).toBe('pending');
      expect(metadataManager.data.phases.design.completed_steps).toEqual([]);

      // メタデータの整合性が維持される
      const validationResult = metadataManager.validatePhaseConsistency('requirements');
      expect(validationResult.valid).toBe(true);
    });
  });

  // =============================================================================
  // IT-COMPAT-002: 複数回のrollbackとresume
  // =============================================================================
  describe('IT-COMPAT-002: 複数回のrollback/resumeサイクル', () => {
    test('複数回のrollback/resumeでメタデータの整合性が維持される', async () => {
      // Given: implementation フェーズまで進行
      metadataManager.data.phases.planning.status = 'completed';
      metadataManager.data.phases.planning.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.requirements.status = 'completed';
      metadataManager.data.phases.requirements.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.design.status = 'completed';
      metadataManager.data.phases.design.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.test_scenario.status = 'completed';
      metadataManager.data.phases.test_scenario.completed_steps = ['execute', 'review'];

      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_steps = ['execute', 'review'];

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      // When: 1回目のrollback
      const options1: RollbackCommandOptions = {
        issue: '208',
        toPhase: 'implementation',
        toStep: 'revise',
        reason: 'First rollback',
        force: true
      };
      await handleRollbackCommand(options1);

      // Then: implementation がリセットされる
      expect(metadataManager.data.phases.implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.implementation.current_step).toBe('revise');

      // シミュレート: implementation を再完了
      metadataManager.data.phases.implementation.status = 'completed';
      metadataManager.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];
      metadataManager.data.phases.implementation.completed_at = '2025-01-30T13:00:00Z';

      // When: 2回目のrollback
      const options2: RollbackCommandOptions = {
        issue: '208',
        toPhase: 'implementation',
        toStep: 'execute',
        reason: 'Second rollback',
        force: true
      };
      await handleRollbackCommand(options2);

      // Then: implementation が再度リセットされる
      expect(metadataManager.data.phases.implementation.status).toBe('in_progress');
      expect(metadataManager.data.phases.implementation.current_step).toBe('execute');

      // 整合性が維持される
      const validationResult = metadataManager.validatePhaseConsistency('implementation');
      expect(validationResult.valid).toBe(true);
    });
  });
});
