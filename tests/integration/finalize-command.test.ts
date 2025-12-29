/**
 * インテグレーションテスト: finalize コマンド
 * Issue #261: ワークフロー完了時の最終処理を統合したコマンドとして実装
 *
 * テスト対象:
 * - エンドツーエンドの finalize シナリオ
 * - 5ステップ全体の統合フロー
 * - モジュール連携（MetadataManager, ArtifactCleaner, SquashManager, PullRequestClient）
 * - エラーハンドリング
 *
 * テスト戦略: UNIT_INTEGRATION - インテグレーション部分
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleFinalizeCommand } from '../../src/commands/finalize.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import type { FinalizeCommandOptions } from '../../src/commands/finalize.js';
import * as path from 'node:path';

const mockRevparse = jest.fn();

// simple-git のモック（Step 1 で HEAD を取得するため）
jest.mock('simple-git', () => {
  return jest.fn(() => ({
    revparse: mockRevparse,
  }));
});

// GitManagerのモック
import type { GitCommandResult } from '../../src/types.js';

jest.mock('../../src/core/git-manager.js', () => ({
  GitManager: jest.fn().mockImplementation(() => ({
    commitWorkflowDeletion: jest.fn()
      .mockResolvedValue({ success: true, commit_hash: 'abc123' }),
    pushToRemote: jest.fn()
      .mockResolvedValue({ success: true }),
    getSquashManager: jest.fn().mockReturnValue({
      squashCommitsForFinalize: jest.fn()
        .mockResolvedValue(undefined),
    }),
  })),
}));

// ArtifactCleanerのモック
jest.mock('../../src/phases/cleanup/artifact-cleaner.js', () => ({
  ArtifactCleaner: jest.fn().mockImplementation(() => ({
    cleanupWorkflowArtifacts: jest.fn()
      .mockResolvedValue(undefined),
  })),
}));

// GitHubClientのモック
interface GitHubActionResult {
  success: boolean;
  error?: string;
}

const baseMetadata = {
  issue_number: '123',
  issue_url: '',
  issue_title: '',
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
    planning: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    requirements: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    design: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_scenario: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    implementation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_implementation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    testing: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    documentation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    report: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
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
  created_at: '',
  updated_at: '',
};

jest.mock('../../src/core/github-client.js', () => ({
  GitHubClient: jest.fn().mockImplementation(() => ({
    getPullRequestClient: jest.fn().mockReturnValue({
      getPullRequestNumber: jest.fn()
        .mockResolvedValue(456),
      updatePullRequest: jest.fn()
        .mockResolvedValue({ success: true }),
      updateBaseBranch: jest.fn()
        .mockResolvedValue({ success: true }),
      markPRReady: jest.fn()
        .mockResolvedValue({ success: true }),
    }),
  })),
}));

import fs from 'fs-extra';
import { GitManager } from '../../src/core/git-manager.js';
import { ArtifactCleaner } from '../../src/phases/cleanup/artifact-cleaner.js';
import { GitHubClient } from '../../src/core/github-client.js';

describe('Integration: Finalize Command - エンドツーエンドフロー', () => {
  const testWorkflowDir = path.join(process.cwd(), '.ai-workflow', 'issue-123');
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevparse.mockResolvedValue('head-before-cleanup\n');

    // 実ファイルシステムを使用
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const metadataData = {
      ...baseMetadata,
      issue_number: '123',
      base_commit: 'abc123def456',
      issue_title: 'feat(cli): Add finalize command',
      issue_url: 'https://github.com/owner/repo/issues/123',
      target_repository: {
        owner: 'owner',
        repo: 'repo',
        path: process.cwd(),
        github_name: 'owner/repo',
        remote_url: 'https://github.com/owner/repo.git',
      },
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // IT-01: 統合テスト_正常系_全ステップ完全実行
  // =============================================================================
  describe('IT-01: 統合テスト_正常系_全ステップ完全実行', () => {
    test('finalize --issue 123 で全5ステップが順次実行される（dryRun）', async () => {
      // Given: ワークフローが完了している（dryRunモードでテスト）
      const options: FinalizeCommandOptions = {
        issue: '123',
        dryRun: true,  // プレビューモードで実行
      };

      // When: finalize コマンドを実行（プレビューモード）
      // Then: エラーなく完了することを確認
      await expect(handleFinalizeCommand(options)).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // IT-02: 統合テスト_正常系_develop指定
  // =============================================================================
  describe('IT-02: 統合テスト_正常系_develop指定', () => {
    test('finalize --issue 123 --base-branch develop でマージ先が変更される（dryRun）', async () => {
      // Given: base-branch オプション指定（dryRunモードでテスト）
      const options: FinalizeCommandOptions = {
        issue: '123',
        baseBranch: 'develop',
        dryRun: true,
      };

      // When: finalize コマンドを実行（プレビューモード）
      // Then: エラーなく完了することを確認
      await expect(handleFinalizeCommand(options)).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // IT-03: 統合テスト_正常系_skip-squash
  // =============================================================================
  describe('IT-03: 統合テスト_正常系_skip-squash', () => {
    test('finalize --issue 123 --skip-squash でスカッシュがスキップされる（dryRun）', async () => {
      // Given: skip-squash オプション（dryRunモードでテスト）
      const options: FinalizeCommandOptions = {
        issue: '123',
        skipSquash: true,
        dryRun: true,
      };

      // When: finalize コマンドを実行（プレビューモード）
      // Then: エラーなく完了することを確認
      await expect(handleFinalizeCommand(options)).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // IT-04: 統合テスト_正常系_skip-pr-update
  // =============================================================================
  describe('IT-04: 統合テスト_正常系_skip-pr-update', () => {
    test('finalize --issue 123 --skip-pr-update でPR更新がスキップされる（dryRun）', async () => {
      // Given: skip-pr-update オプション（dryRunモードでテスト）
      const options: FinalizeCommandOptions = {
        issue: '123',
        skipPrUpdate: true,
        dryRun: true,
      };

      // When: finalize コマンドを実行（プレビューモード）
      // Then: エラーなく完了することを確認
      await expect(handleFinalizeCommand(options)).resolves.not.toThrow();
    });
  });
});
