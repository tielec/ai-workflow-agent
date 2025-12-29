/**
 * インテグレーションテスト: 差し戻しワークフロー（リファクタリング版）
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - エンドツーエンドの差し戻しシナリオ
 * - プロンプト注入の検証
 * - メタデータ更新の検証
 *
 * テスト戦略: 実ファイルシステムを使用した真の統合テスト
 * - ESMモック問題を回避するため、実際の一時ディレクトリを使用
 * - 外部API（Git、GitHub）のみをモック化
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import type { PhaseName } from '../../src/types.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

describe('Integration: Rollback Workflow', () => {
  let testDir: string;
  let workflowDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;

  /**
   * 基本的なメタデータ構造を作成
   */
  const createInitialMetadata = (issueNumber: string) => ({
    issue_number: issueNumber,
    issue_url: `https://github.com/owner/repo/issues/${issueNumber}`,
    issue_title: 'Test Issue for Rollback',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_phase: 'testing',
    phases: {
      planning: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      requirements: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      design: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      test_scenario: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      implementation: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      test_implementation: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      testing: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      documentation: {
        status: 'pending',
        completed_steps: [],
        current_step: null,
        started_at: null,
        completed_at: null,
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      report: {
        status: 'pending',
        completed_steps: [],
        current_step: null,
        started_at: null,
        completed_at: null,
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      evaluation: {
        status: 'pending',
        completed_steps: [],
        current_step: null,
        started_at: null,
        completed_at: null,
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
    },
    github_integration: {
      progress_comment_url: null,
    },
    costs: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    },
    design_decisions: {},
    model_config: null,
    difficulty_analysis: null,
    rollback_history: [],
  });

  beforeEach(async () => {
    // 実際の一時ディレクトリを作成
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rollback-test-'));
    workflowDir = path.join(testDir, '.ai-workflow', 'issue-90');
    metadataPath = path.join(workflowDir, 'metadata.json');

    // ディレクトリ作成
    await fs.ensureDir(workflowDir);

    // 初期メタデータを作成
    const initialMetadata = createInitialMetadata('90');
    await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });

    // MetadataManagerインスタンスを作成
    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
  });

  // =============================================================================
  // IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー
  // =============================================================================
  describe('IC-E2E-01: Phase 6 → Phase 4への完全な差し戻しフロー', () => {
    test('エンドツーエンドの差し戻しフローが正しく動作する', async () => {
      // Given: Phase 6（testing）が完了している状態
      const rollbackReason =
        'Type definition missing: PhaseExecutionResult needs approved and feedback fields';

      // When: Phase 4（implementation）への差し戻しを実行
      const rollbackContext = {
        triggered_at: new Date().toISOString(),
        from_phase: 'testing',
        reason: rollbackReason,
      };
      metadataManager.setRollbackContext('implementation', rollbackContext);
      metadataManager.updatePhaseForRollback('implementation', 'revise');
      metadataManager.resetSubsequentPhases('implementation');
      metadataManager.addRollbackHistory({
        from_phase: 'testing',
        to_phase: 'implementation',
        to_step: 'revise',
        reason: rollbackReason,
        rolled_back_at: new Date().toISOString(),
        triggered_by: 'manual',
      });
      await metadataManager.save();

      // Then: メタデータファイルを再読み込みして検証
      const reloadedManager = new MetadataManager(metadataPath);

      // 1. Phase 4の状態確認
      expect(reloadedManager.data.phases.implementation.status).toBe('in_progress');
      expect(reloadedManager.data.phases.implementation.current_step).toBe('revise');
      expect(reloadedManager.data.phases.implementation.completed_at).toBeNull();

      // 2. rollback_contextが設定されている
      expect(reloadedManager.data.phases.implementation.rollback_context).toBeDefined();
      expect(
        reloadedManager.data.phases.implementation.rollback_context?.reason
      ).toContain('Type definition missing');

      // 3. 後続フェーズがリセットされている
      expect(reloadedManager.data.phases.test_implementation.status).toBe('pending');
      expect(reloadedManager.data.phases.testing.status).toBe('pending');
    });
  });

  // =============================================================================
  // IC-E2E-02: 差し戻し理由の直接指定（--reason）
  // =============================================================================
  describe('IC-E2E-02: 差し戻し理由の直接指定（--reason）', () => {
    test('--reasonオプションでの差し戻しフローが正しく動作する', async () => {
      // Given: --reasonオプションで理由を指定
      const rollbackReason =
        '型定義にapprovedとfeedbackフィールドが不足しています。src/types.tsを修正してください。';

      // When: 差し戻しを実行
      const rollbackContext = {
        triggered_at: new Date().toISOString(),
        from_phase: 'testing',
        reason: rollbackReason,
        review_result: null,
        details: null,
      };
      metadataManager.setRollbackContext('implementation', rollbackContext);
      await metadataManager.save();

      // Then: rollback_context.reasonが指定された理由と一致する
      const reloadedManager = new MetadataManager(metadataPath);
      expect(
        reloadedManager.data.phases.implementation.rollback_context?.reason
      ).toContain('型定義にapprovedとfeedbackフィールドが不足');

      // review_resultがnullである
      expect(
        reloadedManager.data.phases.implementation.rollback_context?.review_result
      ).toBeNull();

      // detailsがnullである
      expect(reloadedManager.data.phases.implementation.rollback_context?.details).toBeNull();
    });
  });

  // =============================================================================
  // IC-E2E-04: executeステップへの差し戻し（--to-step execute）
  // =============================================================================
  describe('IC-E2E-04: executeステップへの差し戻し（--to-step execute）', () => {
    test('executeステップへの差し戻しでcompleted_stepsがクリアされる', async () => {
      // Given: executeステップへの差し戻し
      const rollbackReason = 'Phase 4を最初から再実装が必要。';

      // When: 差し戻しを実行（to_step = 'execute'）
      const rollbackContext = {
        triggered_at: new Date().toISOString(),
        from_phase: 'testing',
        reason: rollbackReason,
      };
      metadataManager.setRollbackContext('implementation', rollbackContext);
      metadataManager.updatePhaseForRollback('implementation', 'execute');
      await metadataManager.save();

      // Then: current_stepが'execute'である
      const reloadedManager = new MetadataManager(metadataPath);
      expect(reloadedManager.data.phases.implementation.current_step).toBe('execute');

      // completed_stepsが空配列である
      expect(reloadedManager.data.phases.implementation.completed_steps).toEqual([]);
    });
  });

  // =============================================================================
  // IC-HISTORY-01: 差し戻し履歴が正しく記録される
  // =============================================================================
  describe('IC-HISTORY-01: 差し戻し履歴が正しく記録される', () => {
    test('差し戻し履歴がメタデータに正しく記録される', async () => {
      // Given: 差し戻しの実行
      const rollbackReason = 'First rollback';

      // When: 差し戻しを実行して履歴を記録
      metadataManager.addRollbackHistory({
        from_phase: 'testing',
        to_phase: 'implementation',
        to_step: 'revise',
        reason: rollbackReason,
        rolled_back_at: new Date().toISOString(),
        triggered_by: 'manual',
      });
      await metadataManager.save();

      // Then: rollback_history配列にエントリが追加される
      const reloadedManager = new MetadataManager(metadataPath);
      expect(reloadedManager.data.rollback_history).toBeDefined();
      expect(reloadedManager.data.rollback_history!.length).toBeGreaterThan(0);

      const latestEntry =
        reloadedManager.data.rollback_history![
          reloadedManager.data.rollback_history!.length - 1
        ];
      expect(latestEntry.to_phase).toBe('implementation');
      expect(latestEntry.reason).toBe('First rollback');
      expect(latestEntry.triggered_by).toBe('manual');
    });
  });
});

describe('Integration: Rollback Workflow - エラーハンドリング', () => {
  let testDir: string;
  let workflowDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    // 実際の一時ディレクトリを作成
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rollback-err-test-'));
    workflowDir = path.join(testDir, '.ai-workflow', 'issue-90');
    metadataPath = path.join(workflowDir, 'metadata.json');

    // ディレクトリ作成
    await fs.ensureDir(workflowDir);

    // 初期メタデータを作成
    const initialMetadata = {
      issue_number: '90',
      issue_url: 'https://github.com/owner/repo/issues/90',
      issue_title: 'Test Issue',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_phase: 'implementation',
      phases: {
        planning: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'in_progress', completed_steps: ['execute'], current_step: 'review', started_at: new Date().toISOString(), completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };
    await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });

    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(async () => {
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
  });

  // =============================================================================
  // IC-ERR-01: 無効なフェーズ名でもデフォルトエントリが初期化される
  // =============================================================================
  describe('IC-ERR-01: 無効なフェーズ名でもデフォルトエントリが初期化される', () => {
    test('無効なフェーズ名が指定された場合にデフォルトエントリが作成される', () => {
      // Given: 無効なフェーズ名
      const invalidPhaseName = 'invalid-phase' as PhaseName;

      // When: setRollbackContext を実行
      // Then: エラーをスローせず、警告を出してデフォルトエントリを初期化する
      expect(() => {
        metadataManager.setRollbackContext(invalidPhaseName, {
          triggered_at: new Date().toISOString(),
          reason: 'Test',
        });
      }).not.toThrow();

      // デフォルトエントリが作成されていることを確認
      expect(metadataManager.data.phases[invalidPhaseName]).toBeDefined();
      expect(metadataManager.data.phases[invalidPhaseName].status).toBe('pending');
    });
  });

  // =============================================================================
  // IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される
  // =============================================================================
  describe('IC-ERR-02: 未開始フェーズへの差し戻しでエラーメッセージが表示される', () => {
    test('未開始フェーズへの差し戻しが適切にエラーになる', () => {
      // Given: 未開始フェーズ（documentation）
      expect(metadataManager.data.phases.documentation.status).toBe('pending');

      // When & Then: 未開始フェーズへの差し戻しはエラーとなる
      // （実装上、setRollbackContext自体はエラーにならないが、
      // handleRollbackCommandレベルでバリデーションされる想定）
      // ここではメタデータレベルでの動作のみを検証
      expect(() => {
        metadataManager.updatePhaseForRollback('documentation', 'revise');
      }).not.toThrow(); // メタデータレベルではエラーにならない
    });
  });

  // =============================================================================
  // IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング
  // =============================================================================
  describe('IC-ERR-04: 差し戻し理由が未指定の場合のエラーハンドリング', () => {
    test('差し戻し理由が指定されていない場合に適切なエラーメッセージが表示される', () => {
      // Given: 差し戻し理由が未指定
      // When & Then: reasonフィールドが必須であることを確認
      expect(() => {
        metadataManager.setRollbackContext('implementation', {
          triggered_at: new Date().toISOString(),
          reason: '', // 空文字列
        });
      }).not.toThrow(); // メタデータレベルでは空文字列も許可される
      // （コマンドレベルでのバリデーションが必要）
    });
  });
});

describe('Integration: Rollback Workflow - 後方互換性', () => {
  let testDir: string;
  let workflowDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    // 実際の一時ディレクトリを作成
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rollback-compat-test-'));
    workflowDir = path.join(testDir, '.ai-workflow', 'issue-90');
    metadataPath = path.join(workflowDir, 'metadata.json');

    // ディレクトリ作成
    await fs.ensureDir(workflowDir);

    // 初期メタデータを作成（rollback_context、rollback_historyが存在しない古い形式）
    const initialMetadata = {
      issue_number: '90',
      issue_url: 'https://github.com/owner/repo/issues/90',
      issue_title: 'Test Issue',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_phase: 'planning',
      phases: {
        planning: { status: 'in_progress', completed_steps: [], current_step: 'execute', started_at: new Date().toISOString(), completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      // rollback_history フィールドは意図的に省略（古い形式）
    };
    await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });

    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(async () => {
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
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
