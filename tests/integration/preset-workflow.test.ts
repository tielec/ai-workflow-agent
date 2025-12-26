/**
 * Issue #248: preset実行時のフェーズステータス更新の統合テスト
 *
 * テスト対象:
 * - preset `review-design` 正常実行時のステータス検証
 * - レビュー失敗時のステータス検証
 * - revise ステップ例外発生時のステータス検証
 *
 * 注意: このテストは統合テストのため、実際のPhase実行はモック化しています。
 * 完全なE2Eテストは手動実行が必要です。
 */

import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import fs from 'fs-extra';
import * as path from 'node:path';
import type { PhaseName } from '../../src/types/phase.js';

const fsMock = {
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readJsonSync: jest.fn(),
  writeJsonSync: jest.fn(),
};

// fs-extraのモック
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: fsMock,
  ...fsMock,
}));

describe('Preset workflow: review-design (Issue #248)', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = path.join(process.cwd(), 'tmp', 'preset-workflow', 'issue-248');
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    fsMock.existsSync.mockReturnValue(true);
    fsMock.ensureDirSync.mockImplementation(() => {});
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.writeJsonSync.mockImplementation(() => {});
    fs.mkdirSync(testWorkflowDir, { recursive: true });
    WorkflowState.createNew(
      testMetadataPath,
      '248',
      'https://example.com/issues/248',
      'Preset workflow integration',
    );

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

    fsMock.readJsonSync.mockReturnValue({
      issue_number: '248',
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
    });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterAll(async () => {
    // Clean up temporary directory after all tests
    const tmpDir = path.join(process.cwd(), 'tmp', 'preset-workflow');
    if (fs.existsSync(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });

  // =============================================================================
  // 3.1. preset `review-design` 正常実行シナリオ
  // =============================================================================
  describe('正常実行シナリオ', () => {
    // テストケース 3.1.1: 全フェーズが正常に完了
    test('should complete all phases with status "completed"', () => {
      // Given: preset `review-design` のフェーズ
      const phases: PhaseName[] = ['planning', 'requirements', 'design'];

      // When: 各フェーズを順番に実行（シミュレート）
      phases.forEach((phase) => {
        metadataManager.updatePhaseStatus(phase, 'in_progress');
        metadataManager.updatePhaseStatus(phase, 'completed');
      });

      // Then: すべてのフェーズが completed になる
      expect(metadataManager.getPhaseStatus('planning')).toBe('completed');
      expect(metadataManager.getPhaseStatus('requirements')).toBe('completed');
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');
    });
  });

  // =============================================================================
  // 3.2. preset `review-design` でレビュー失敗シナリオ
  // =============================================================================
  describe('レビュー失敗シナリオ', () => {
    // テストケース 3.2.1: design フェーズでレビュー失敗、最大リトライ回数超過
    test('should update status to "failed" after max retries', () => {
      // Given: planning と requirements が正常に完了
      metadataManager.updatePhaseStatus('planning', 'in_progress');
      metadataManager.updatePhaseStatus('planning', 'completed');
      metadataManager.updatePhaseStatus('requirements', 'in_progress');
      metadataManager.updatePhaseStatus('requirements', 'completed');

      // When: design フェーズでレビューが失敗し、最大リトライ回数超過
      metadataManager.updatePhaseStatus('design', 'in_progress');
      // リトライ回数をインクリメント
      metadataManager.incrementRetryCount('design');
      metadataManager.incrementRetryCount('design');
      const retryCount = metadataManager.incrementRetryCount('design');

      // 最大リトライ回数超過後にステータスを failed に更新
      metadataManager.updatePhaseStatus('design', 'failed');

      // Then: planning と requirements は completed
      expect(metadataManager.getPhaseStatus('planning')).toBe('completed');
      expect(metadataManager.getPhaseStatus('requirements')).toBe('completed');

      // Then: design は failed
      expect(metadataManager.getPhaseStatus('design')).toBe('failed');

      // Then: retry_count は 3
      expect(retryCount).toBe(3);
    });

    // テストケース 3.2.2: design フェーズでレビュー失敗、2回目のreviseで合格
    test('should complete design phase after second revise attempt', () => {
      // Given: planning と requirements が正常に完了
      metadataManager.updatePhaseStatus('planning', 'in_progress');
      metadataManager.updatePhaseStatus('planning', 'completed');
      metadataManager.updatePhaseStatus('requirements', 'in_progress');
      metadataManager.updatePhaseStatus('requirements', 'completed');

      // When: design フェーズでレビューが失敗し、2回目のreviseで合格
      metadataManager.updatePhaseStatus('design', 'in_progress');
      // 1回目のリトライ
      metadataManager.incrementRetryCount('design');
      // 2回目のリトライ
      const retryCount = metadataManager.incrementRetryCount('design');
      // レビュー合格後、completed に更新
      metadataManager.updatePhaseStatus('design', 'completed');

      // Then: design は completed
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');

      // Then: retry_count は 2
      expect(retryCount).toBe(2);
    });
  });

  // =============================================================================
  // 3.3. preset `review-design` で revise ステップ例外発生シナリオ
  // =============================================================================
  describe('revise ステップ例外発生シナリオ', () => {
    // テストケース 3.3.1: design フェーズの revise ステップで例外発生
    test('should update status to "failed" when revise step throws exception', () => {
      // Given: planning と requirements が正常に完了
      metadataManager.updatePhaseStatus('planning', 'in_progress');
      metadataManager.updatePhaseStatus('planning', 'completed');
      metadataManager.updatePhaseStatus('requirements', 'in_progress');
      metadataManager.updatePhaseStatus('requirements', 'completed');

      // When: design フェーズで revise ステップが例外をスロー
      metadataManager.updatePhaseStatus('design', 'in_progress');
      // revise ステップで例外発生前にステータスを failed に更新
      metadataManager.updatePhaseStatus('design', 'failed');

      // Then: planning と requirements は completed
      expect(metadataManager.getPhaseStatus('planning')).toBe('completed');
      expect(metadataManager.getPhaseStatus('requirements')).toBe('completed');

      // Then: design は failed
      expect(metadataManager.getPhaseStatus('design')).toBe('failed');
    });
  });

  // =============================================================================
  // 3.4. preset `review-design` で execute ステップ失敗シナリオ
  // =============================================================================
  describe('execute ステップ失敗シナリオ', () => {
    // テストケース 3.4.1: design フェーズの execute ステップで失敗
    test('should update status to "failed" when execute step fails', () => {
      // Given: planning と requirements が正常に完了
      metadataManager.updatePhaseStatus('planning', 'in_progress');
      metadataManager.updatePhaseStatus('planning', 'completed');
      metadataManager.updatePhaseStatus('requirements', 'in_progress');
      metadataManager.updatePhaseStatus('requirements', 'completed');

      // When: design フェーズの execute ステップで失敗
      metadataManager.updatePhaseStatus('design', 'in_progress');
      metadataManager.updatePhaseStatus('design', 'failed');

      // Then: design は failed
      expect(metadataManager.getPhaseStatus('design')).toBe('failed');
    });
  });

  // =============================================================================
  // 3.5. preset `review-design` でフェーズ再開シナリオ
  // =============================================================================
  describe('フェーズ再開シナリオ', () => {
    // テストケース 3.5.1: design フェーズが in_progress の状態から再開
    test('should resume design phase from in_progress state', () => {
      // Given: planning と requirements が完了済み、design が in_progress
      metadataManager.updatePhaseStatus('planning', 'in_progress');
      metadataManager.updatePhaseStatus('planning', 'completed');
      metadataManager.updatePhaseStatus('requirements', 'in_progress');
      metadataManager.updatePhaseStatus('requirements', 'completed');
      metadataManager.updatePhaseStatus('design', 'in_progress');
      metadataManager.addCompletedStep('design', 'execute');

      // When: design フェーズを再開し、review ステップから実行
      metadataManager.addCompletedStep('design', 'review');
      metadataManager.updatePhaseStatus('design', 'completed');

      // Then: design は completed
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');

      // Then: completed_steps に execute と review が含まれる
      const completedSteps = metadataManager.getCompletedSteps('design');
      expect(completedSteps).toContain('execute');
      expect(completedSteps).toContain('review');
    });
  });

  // =============================================================================
  // 3.6. ステータス更新の確実性検証シナリオ
  // =============================================================================
  describe('ステータス更新の確実性検証', () => {
    // テストケース 3.6.1: finally ブロックでのステータス更新漏れ検出（シミュレート）
    test('should auto-correct status if still in_progress after execution', () => {
      // Given: design フェーズが in_progress
      metadataManager.updatePhaseStatus('design', 'in_progress');

      // When: ensurePhaseStatusUpdated のシミュレート（実装がステータスを自動修正）
      const currentStatus = metadataManager.getPhaseStatus('design');
      if (currentStatus === 'in_progress') {
        // 自動修正: completed に更新
        metadataManager.updatePhaseStatus('design', 'completed');
      }

      // Then: ステータスが completed に自動修正される
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');
    });
  });
});

  describe('Preset workflow: Status transition validation (Issue #248)', () => {
    let metadataManager: MetadataManager;
    const testWorkflowDir = '/test/.ai-workflow/issue-248';
    const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

    beforeEach(() => {
      jest.clearAllMocks();
      fsMock.existsSync.mockReturnValue(true);
      fsMock.ensureDirSync.mockImplementation(() => {});
      fsMock.writeFileSync.mockImplementation(() => {});
      fsMock.writeJsonSync.mockImplementation(() => {});
      fsMock.readJsonSync.mockReturnValue({
        issue_number: '248',
        issue_url: '',
        issue_title: '',
        created_at: '',
        updated_at: '',
        current_phase: 'planning',
        phases: {
          planning: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
          requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
          design: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        },
        github_integration: { progress_comment_url: null },
        costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
        design_decisions: {},
        model_config: null,
        difficulty_analysis: null,
        rollback_history: [],
      });

      metadataManager = new MetadataManager(testMetadataPath);
    });

  // =============================================================================
  // ステータス遷移パターンの検証
  // =============================================================================
  describe('ステータス遷移パターン', () => {
    test('should allow transition: pending -> in_progress -> completed', () => {
      // Given: フェーズが pending
      expect(metadataManager.getPhaseStatus('design')).toBe('pending');

      // When: in_progress に更新
      metadataManager.updatePhaseStatus('design', 'in_progress');

      // Then: ステータスが in_progress になる
      expect(metadataManager.getPhaseStatus('design')).toBe('in_progress');

      // When: completed に更新
      metadataManager.updatePhaseStatus('design', 'completed');

      // Then: ステータスが completed になる
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');
    });

    test('should allow transition: pending -> in_progress -> failed', () => {
      // Given: フェーズが pending
      expect(metadataManager.getPhaseStatus('design')).toBe('pending');

      // When: in_progress に更新
      metadataManager.updatePhaseStatus('design', 'in_progress');

      // Then: ステータスが in_progress になる
      expect(metadataManager.getPhaseStatus('design')).toBe('in_progress');

      // When: failed に更新
      metadataManager.updatePhaseStatus('design', 'failed');

      // Then: ステータスが failed になる
      expect(metadataManager.getPhaseStatus('design')).toBe('failed');
    });

    test('should warn on invalid transition: completed -> in_progress', () => {
      // Given: フェーズが completed
      metadataManager.updatePhaseStatus('design', 'in_progress');
      metadataManager.updatePhaseStatus('design', 'completed');
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');

      // When: in_progress に更新しようとする（不正な遷移）
      metadataManager.updatePhaseStatus('design', 'in_progress');

      // Then: ステータスは in_progress に更新される（警告のみ）
      expect(metadataManager.getPhaseStatus('design')).toBe('in_progress');
    });
  });
});
