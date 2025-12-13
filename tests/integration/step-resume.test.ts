/**
 * インテグレーションテスト: ステップ単位のレジューム機能 (Issue #10)
 *
 * テスト対象:
 * - ステップ単位でのレジューム判定
 * - CI環境でのリモート同期シミュレーション
 * - メタデータマイグレーション
 *
 * 注意: CI環境のワークスペースリセットをシミュレートするため、
 * メタデータの読み込みと状態復元を中心にテストします。
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { ResumeManager } from '../../src/utils/resume.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { logger } from '../../src/utils/logger.js';
import { setFsExtra } from '../../src/utils/fs-proxy.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'step-resume-test');

describe('ステップレジュームの統合テスト', () => {
  let metadataManager: MetadataManager;
  let resumeManager: ResumeManager;
  let testMetadataPath: string;

  beforeAll(async () => {
    // テスト用ディレクトリを作成
    await fs.ensureDir(TEST_DIR);
    testMetadataPath = path.join(TEST_DIR, 'metadata.json');
    setFsExtra(fs as any);
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
    setFsExtra(null);
  });

  test('TC-I-003: executeステップスキップ（レジューム）', async () => {
    // Given: executeステップが完了し、リモートにプッシュ済み（シミュレーション）
    const testMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Test Resume',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: ['execute'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });

    // When: ワークフローを再開
    metadataManager = new MetadataManager(testMetadataPath);
    resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: executeがスキップされ、reviewから再開される
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('review');
    expect(resumeInfo.completedSteps).toEqual(['execute']);

    // ログメッセージ確認（実際のログは実装コードで出力）
    console.info('[INFO] Test: Skipping execute step (already completed)');
    console.info('[INFO] Test: Starting from review step');
  });

  test('TC-I-004: current_step からのレジューム', async () => {
    // Given: current_step='review' が設定されている
    const testMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Test Resume from current_step',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: 'review',
          completed_steps: ['execute'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });

    // When: ワークフローを再開
    metadataManager = new MetadataManager(testMetadataPath);
    resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: current_stepが優先的に使用される
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('review');
    expect(resumeInfo.completedSteps).toEqual(['execute']);

    console.info('[INFO] Test: Resuming phase \'requirements\' from step \'review\'');
  });

  test('TC-I-009: CI環境でのレジューム（execute完了後）- シミュレーション', async () => {
    // Given: Jenkins Build #1でexecuteステップが完了し、リモートにプッシュ済み
    const ciMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'CI Resume Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: ['execute'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, ciMetadata, { spaces: 2 });

    // When: Jenkins Build #2（レジューム）
    // CI環境では、ワークスペースがリセットされるため、
    // リモートブランチから最新状態をpullする必要がある（シミュレーション）
    console.info('[INFO] Test: Simulating CI Build #2');
    console.info('[INFO] Test: Pulling latest changes from remote branch...');
    console.info('[INFO] Test: Loaded metadata from .ai-workflow/issue-123/metadata.json');

    metadataManager = new MetadataManager(testMetadataPath);
    resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: executeがスキップされ、reviewから再開される
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('review');
    expect(resumeInfo.completedSteps).toEqual(['execute']);

    console.info('[INFO] Test: Resuming from step \'review\' (completed steps: ["execute"])');
  });

  test('TC-I-010: CI環境でのリモート同期（複数ステップ）- シミュレーション', async () => {
    // Given: Build #1でexecuteとreviewステップが完了し、リモートにプッシュ済み
    const ciMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'CI Multi-Step Resume',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: ['execute', 'review'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, ciMetadata, { spaces: 2 });

    // When: Jenkins Build #2（レジューム）
    console.info('[INFO] Test: Simulating CI Build #2 with multiple completed steps');
    metadataManager = new MetadataManager(testMetadataPath);
    resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: executeとreviewがスキップされ、reviseから再開される
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('revise');
    expect(resumeInfo.completedSteps).toEqual(['execute', 'review']);

    console.info('[INFO] Test: Skipping execute step (already completed)');
    console.info('[INFO] Test: Skipping review step (already completed)');
    console.info('[INFO] Test: Starting from revise step');
  });

  test('TC-I-011: CI環境でのプッシュ失敗とリカバリー - シミュレーション', async () => {
    // Given: Build #1でexecuteステップが完了したが、プッシュが失敗
    const failedPushMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'CI Push Failed Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'failed',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: 'execute',
          completed_steps: [],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, failedPushMetadata, { spaces: 2 });

    // When: Jenkins Build #2（リカバリー）
    console.info('[INFO] Test: Simulating CI Build #2 after push failure');
    metadataManager = new MetadataManager(testMetadataPath);
    resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: executeステップが最初から再実行される
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('execute');
    expect(resumeInfo.completedSteps).toEqual([]);

    console.info('[INFO] Test: Resuming phase \'requirements\' from step \'execute\'');
    console.info('[INFO] Test: Previous push failed, retrying...');
  });
});

describe('メタデータマイグレーションの統合テスト', () => {
  let testMetadataPath: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
    setFsExtra(fs as any);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
    setFsExtra(null);
  });

  test('TC-I-012: 既存ワークフローのマイグレーション', async () => {
    // Given: 古いスキーマのmetadata.jsonが存在
    testMetadataPath = path.join(TEST_DIR, 'metadata-old.json');

    const oldMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Migration Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        planning: {
          status: 'completed',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
        },
        requirements: {
          status: 'completed',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
        },
        design: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, oldMetadata, { spaces: 2 });

    // When: WorkflowStateをロード（マイグレーション自動実行）
    const state = WorkflowState.load(testMetadataPath);
    const migrated = state.migrate();

    // Then: 各フェーズにステップ管理フィールドが追加される
    expect(migrated).toBeTruthy();

    const updatedMetadata = fs.readJSONSync(testMetadataPath);

    // planningフェーズ（completed）
    expect(updatedMetadata.phases.planning.current_step).toBeNull();
    expect(updatedMetadata.phases.planning.completed_steps).toEqual(['execute', 'review', 'revise']);

    // requirementsフェーズ（completed）
    expect(updatedMetadata.phases.requirements.current_step).toBeNull();
    expect(updatedMetadata.phases.requirements.completed_steps).toEqual(['execute', 'review', 'revise']);

    // designフェーズ（in_progress）
    expect(updatedMetadata.phases.design.current_step).toBe('execute');
    expect(updatedMetadata.phases.design.completed_steps).toEqual([]);

    // バックアップファイルが作成されることを確認
    const backupFiles = fs.readdirSync(TEST_DIR).filter((f) => f.startsWith('metadata-old.json.backup_'));
    expect(backupFiles.length > 0).toBeTruthy();

    console.info('[INFO] Test: metadata.json migrated successfully');
  });

  test('TC-I-013: マイグレーション後のワークフロー実行', async () => {
    // Given: TC-I-012でマイグレーションが完了
    testMetadataPath = path.join(TEST_DIR, 'metadata-migrated.json');

    const migratedMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Post-Migration Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        design: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: 'execute',
          completed_steps: [],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, migratedMetadata, { spaces: 2 });

    // When: レジューム判定を実行
    const metadataManager = new MetadataManager(testMetadataPath);
    const resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('design');

    // Then: ステップ管理機能が正しく動作する
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('execute');
    expect(resumeInfo.completedSteps).toEqual([]);

    console.info('[INFO] Test: Migrated workflow resumed successfully');
  });
});

describe('エッジケースの統合テスト', () => {
  let testMetadataPath: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
    setFsExtra(fs as any);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
    setFsExtra(null);
  });

  test('TC-I-017: メタデータ不整合の検出', async () => {
    // Given: current_stepとcompleted_stepsに矛盾がある
    testMetadataPath = path.join(TEST_DIR, 'metadata-inconsistent.json');

    const inconsistentMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Inconsistent Metadata Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: 'execute',
          completed_steps: ['execute', 'review'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, inconsistentMetadata, { spaces: 2 });

    // When: レジューム判定を実行
    const metadataManager = new MetadataManager(testMetadataPath);
    const resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: current_stepが優先され、executeステップが再実行される
    // （警告は実装コードで出力）
    expect(resumeInfo.shouldResume).toBe(true);
    expect(resumeInfo.resumeStep).toBe('execute');
    expect(resumeInfo.completedSteps).toEqual(['execute', 'review']);

    logger.warn('Test: Metadata inconsistency detected: current_step is \'execute\' but already in completed_steps');
  });

  test('新規フェーズ（pending）でのレジューム判定', async () => {
    // Given: フェーズがpending状態
    testMetadataPath = path.join(TEST_DIR, 'metadata-pending.json');

    const pendingMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Pending Phase Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'pending',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: [],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, pendingMetadata, { spaces: 2 });

    // When: レジューム判定を実行
    const metadataManager = new MetadataManager(testMetadataPath);
    const resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: shouldResume=false が返される
    expect(resumeInfo.shouldResume).toBe(false);
    expect(resumeInfo.resumeStep).toBeNull();
    expect(resumeInfo.completedSteps).toEqual([]);
  });

  test('完了フェーズ（completed）でのレジューム判定', async () => {
    // Given: フェーズがcompleted状態
    testMetadataPath = path.join(TEST_DIR, 'metadata-completed.json');

    const completedMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Completed Phase Test',
      workflow_dir: TEST_DIR,
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'completed',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: ['execute', 'review', 'revise'],
        },
      },
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
    };

    await fs.writeJSON(testMetadataPath, completedMetadata, { spaces: 2 });

    // When: レジューム判定を実行
    const metadataManager = new MetadataManager(testMetadataPath);
    const resumeManager = new ResumeManager(metadataManager);

    const resumeInfo = resumeManager.getResumeStep('requirements');

    // Then: shouldResume=false が返される
    expect(resumeInfo.shouldResume).toBe(false);
    expect(resumeInfo.resumeStep).toBeNull();
    expect(resumeInfo.completedSteps).toEqual(['execute', 'review', 'revise']);
  });
});
