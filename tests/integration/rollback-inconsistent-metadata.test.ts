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

const fsMock = {
  existsSync: jest.fn<any>(),
  ensureDirSync: jest.fn<any>(),
  writeFileSync: jest.fn<any>(),
  readFileSync: jest.fn<any>(),
  statSync: jest.fn<any>(),
  copyFileSync: jest.fn<any>(),
  readJsonSync: jest.fn<any>(),
  writeJsonSync: jest.fn<any>(),
};

// fs-extraのモック
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: fsMock,
  ...fsMock,
}));

import fs from 'fs-extra';

describe('Integration: Rollback with Inconsistent Metadata (Issue #208)', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-208';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // 統合テスト: 実ファイルシステムを使用（モック不要）
    // WorkflowState.load()が実際のfs-extraを呼び出すため、実ファイルを作成
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const basePhase = {
      status: 'pending',
      completed_steps: [],
      current_step: null,
      started_at: null,
      completed_at: null,
      review_result: null,
      retry_count: 0,
      rollback_context: null,
    };

    const metadataData = {
      issue_number: '208',
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'planning',
      phases: {
        planning: { ...basePhase },
        requirements: { ...basePhase },
        design: { ...basePhase },
        test_scenario: { ...basePhase },
        implementation: { ...basePhase },
        test_implementation: { ...basePhase },
        testing: { ...basePhase },
        documentation: { ...basePhase },
        report: { ...basePhase },
        evaluation: { ...basePhase },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成（統合テスト）
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
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
        issue: '208',
        toPhase: 'test_implementation',
        toStep: 'revise',
        reason: 'Fix inconsistent metadata',
        force: true // 確認プロンプトをスキップ
      };

      // メタデータをファイルに保存（統合テスト: 実ファイルシステム使用）
      fs.writeJsonSync(testMetadataPath, metadataManager.data, { spaces: 2 });

      // When: rollbackコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollbackが成功する（エラーで失敗しない）
      // メタデータを再読み込みして検証（統合テスト）
      const updatedMetadata = fs.readJsonSync(testMetadataPath);

      // 1. test_implementation の状態確認
      expect(updatedMetadata.phases.test_implementation.status).toBe('in_progress');
      expect(updatedMetadata.phases.test_implementation.current_step).toBe('revise');

      // 2. rollback_contextが設定されている
      expect(updatedMetadata.phases.test_implementation.rollback_context).toBeDefined();
      expect(updatedMetadata.phases.test_implementation.rollback_context?.reason)
        .toContain('Fix inconsistent metadata');

      // 3. ROLLBACK_REASON.mdが生成される
      const rollbackReasonPath = path.join(testWorkflowDir, '05_test_implementation', 'ROLLBACK_REASON.md');
      expect(fs.existsSync(rollbackReasonPath)).toBe(true);
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

      // メタデータをファイルに保存（統合テスト）
      fs.writeJsonSync(testMetadataPath, metadataManager.data, { spaces: 2 });

      // When: rollbackコマンドを実行
      await handleRollbackCommand(options);

      // Then: rollbackが正常に動作する
      // メタデータを再読み込みして検証
      const updatedMetadata = fs.readJsonSync(testMetadataPath);

      expect(updatedMetadata.phases.requirements.status).toBe('in_progress');
      expect(updatedMetadata.phases.requirements.current_step).toBe('revise');

      // 後続フェーズがリセットされる
      expect(updatedMetadata.phases.design.status).toBe('pending');
      expect(updatedMetadata.phases.design.completed_steps).toEqual([]);

      // メタデータの整合性が維持される
      // MetadataManagerを再作成して検証
      const reloadedManager = new MetadataManager(testMetadataPath);
      const validationResult = reloadedManager.validatePhaseConsistency('requirements');
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

      // メタデータをファイルに保存（統合テスト）
      fs.writeJsonSync(testMetadataPath, metadataManager.data, { spaces: 2 });

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
      let updatedMetadata = fs.readJsonSync(testMetadataPath);
      expect(updatedMetadata.phases.implementation.status).toBe('in_progress');
      expect(updatedMetadata.phases.implementation.current_step).toBe('revise');

      // シミュレート: implementation を再完了
      updatedMetadata.phases.implementation.status = 'completed';
      updatedMetadata.phases.implementation.completed_steps = ['execute', 'review', 'revise'];
      updatedMetadata.phases.implementation.completed_at = '2025-01-30T13:00:00Z';
      fs.writeJsonSync(testMetadataPath, updatedMetadata, { spaces: 2 });

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
      updatedMetadata = fs.readJsonSync(testMetadataPath);
      expect(updatedMetadata.phases.implementation.status).toBe('in_progress');
      expect(updatedMetadata.phases.implementation.current_step).toBe('execute');

      // 整合性が維持される
      const reloadedManager = new MetadataManager(testMetadataPath);
      const validationResult = reloadedManager.validatePhaseConsistency('implementation');
      expect(validationResult.valid).toBe(true);
    });
  });
});
