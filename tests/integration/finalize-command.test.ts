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

// fs-extraのモック - モック化してからインポート
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  removeSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// repository-utilsのモック
jest.mock('../../src/core/repository-utils.js', () => ({
  findWorkflowMetadata: jest.fn(),
}));

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
import { findWorkflowMetadata } from '../../src/core/repository-utils.js';
import { GitManager } from '../../src/core/git-manager.js';
import { ArtifactCleaner } from '../../src/phases/cleanup/artifact-cleaner.js';
import { GitHubClient } from '../../src/core/github-client.js';

describe('Integration: Finalize Command - エンドツーエンドフロー', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevparse.mockResolvedValue('head-before-cleanup\n');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined as any);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(baseMetadata));
    (fs.mkdirSync as jest.Mock).mockImplementation(() => undefined as any);

    // findWorkflowMetadataのモック設定
    const mockFindWorkflowMetadata = findWorkflowMetadata as jest.MockedFunction<typeof findWorkflowMetadata>;
    mockFindWorkflowMetadata.mockResolvedValue({
      repoRoot: '/test/repo',
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（全フェーズ完了）
    metadataManager.data.issue_number = '123';  // string型
    metadataManager.data.base_commit = 'abc123def456';
    metadataManager.data.issue_title = 'feat(cli): Add finalize command';
    metadataManager.data.issue_url = 'https://github.com/owner/repo/issues/123';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',  // 必須フィールド
      remote_url: 'https://github.com/owner/repo.git',  // 必須フィールド
    };
    metadataManager.data.phases.planning.status = 'completed';
    metadataManager.data.phases.requirements.status = 'completed';
    metadataManager.data.phases.design.status = 'completed';
    metadataManager.data.phases.test_scenario.status = 'completed';
    metadataManager.data.phases.implementation.status = 'completed';
    metadataManager.data.phases.test_implementation.status = 'completed';
    metadataManager.data.phases.testing.status = 'completed';
    metadataManager.data.phases.documentation.status = 'completed';
    metadataManager.data.phases.report.status = 'completed';
    metadataManager.data.phases.evaluation.status = 'completed';

    // fs.readFileSyncでメタデータを返す
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // IT-01: 統合テスト_正常系_全ステップ完全実行
  // =============================================================================
  describe('IT-01: 統合テスト_正常系_全ステップ完全実行', () => {
    test('finalize --issue 123 で全5ステップが順次実行される', async () => {
      // Given: ワークフローが完了している
      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then:
      // Step 2: ArtifactCleaner.cleanupWorkflowArtifacts()が呼ばれる
      const mockArtifactCleaner = ArtifactCleaner as jest.MockedClass<typeof ArtifactCleaner>;
      const artifactCleanerInstance = mockArtifactCleaner.mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalledWith(true);

      // Git コミット＆プッシュが実行される
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const gitManagerInstance = mockGitManager.mock.results[0]?.value;
      expect(gitManagerInstance?.commitWorkflowDeletion).toHaveBeenCalledWith(123);
      expect(gitManagerInstance?.pushToRemote).toHaveBeenCalled();

      // Step 3: スカッシュが実行される
      expect(gitManagerInstance?.getSquashManager).toHaveBeenCalled();
      const squashManager = gitManagerInstance?.getSquashManager();
      expect(squashManager.squashCommitsForFinalize).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 123,
          baseCommit: 'abc123def456',
          targetBranch: 'main',
          headCommit: 'head-before-cleanup',
        }),
      );

      // Step 4-5: PR更新とドラフト解除が実行される
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      const githubClientInstance = mockGitHubClient.mock.results[0]?.value;
      const prClient = githubClientInstance?.getPullRequestClient();

      expect(prClient.getPullRequestNumber).toHaveBeenCalledWith(123);
      expect(prClient.updatePullRequest).toHaveBeenCalledWith(456, expect.stringContaining('Issue番号: #123'));
      expect(prClient.markPRReady).toHaveBeenCalledWith(456);
    });
  });

  // =============================================================================
  // IT-02: 統合テスト_正常系_develop指定
  // =============================================================================
  describe('IT-02: 統合テスト_正常系_develop指定', () => {
    test('finalize --issue 123 --base-branch develop でマージ先が変更される', async () => {
      // Given: base-branch オプション指定
      const options: FinalizeCommandOptions = {
        issue: '123',
        baseBranch: 'develop',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: updateBaseBranch が develop で呼ばれる
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      const githubClientInstance = mockGitHubClient.mock.results[0]?.value;
      const prClient = githubClientInstance?.getPullRequestClient();

      expect(prClient.updateBaseBranch).toHaveBeenCalledWith(456, 'develop');
    });
  });

  // =============================================================================
  // IT-03: 統合テスト_正常系_skip-squash
  // =============================================================================
  describe('IT-03: 統合テスト_正常系_skip-squash', () => {
    test('finalize --issue 123 --skip-squash でスカッシュがスキップされる', async () => {
      // Given: skip-squash オプション
      const options: FinalizeCommandOptions = {
        issue: '123',
        skipSquash: true,
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: スカッシュが実行されない
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const gitManagerInstance = mockGitManager.mock.results[0]?.value;
      const squashManager = gitManagerInstance?.getSquashManager?.();

      // getSquashManager が呼ばれないか、squashCommitsForFinalize が呼ばれない
      if (squashManager) {
        expect(squashManager.squashCommitsForFinalize).not.toHaveBeenCalled();
      }

      // 他のステップは実行される
      const mockArtifactCleaner = ArtifactCleaner as jest.MockedClass<typeof ArtifactCleaner>;
      const artifactCleanerInstance = mockArtifactCleaner.mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalled();

      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      const githubClientInstance = mockGitHubClient.mock.results[0]?.value;
      const prClient = githubClientInstance?.getPullRequestClient();
      expect(prClient?.markPRReady).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IT-04: 統合テスト_正常系_skip-pr-update
  // =============================================================================
  describe('IT-04: 統合テスト_正常系_skip-pr-update', () => {
    test('finalize --issue 123 --skip-pr-update でPR更新がスキップされる', async () => {
      // Given: skip-pr-update オプション
      const options: FinalizeCommandOptions = {
        issue: '123',
        skipPrUpdate: true,
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: PR更新が実行されない
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      // skipPrUpdateの場合、GitHubClientは初期化されない
      expect(mockGitHubClient).not.toHaveBeenCalled();

      // 他のステップは実行される
      const mockArtifactCleaner = ArtifactCleaner as jest.MockedClass<typeof ArtifactCleaner>;
      const artifactCleanerInstance = mockArtifactCleaner.mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalled();

      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const gitManagerInstance = mockGitManager.mock.results[0]?.value;
      const squashManager = gitManagerInstance?.getSquashManager();
      expect(squashManager.squashCommitsForFinalize).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IT-510: pull による HEAD 更新時もスカッシュ対象が固定される
  // =============================================================================
  describe('IT-510: non-fast-forward で HEAD が更新されてもスカッシュ対象を維持', () => {
    test('IT-510-001: pull を挟んでも headBeforeCleanup でスカッシュする', async () => {
      // Given: push が non-fast-forward で pullLatest が走るケースを再現
      const pullLatest = jest.fn().mockResolvedValue({ success: true });
      const squashSpy = jest.fn().mockResolvedValue(undefined);
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;

      // Step 2 用（cleanup + push）
      mockGitManager.mockImplementationOnce(() => ({
        commitWorkflowDeletion: jest.fn().mockResolvedValue({
          success: true,
          commit_hash: 'cleanup789',
        }),
        pushToRemote: jest.fn().mockImplementation(async () => {
          await pullLatest('feature/issue-510');
          return { success: true };
        }),
        getSquashManager: jest.fn(),
      } as any));

      // Step 3 用（squash）
      mockGitManager.mockImplementationOnce(() => ({
        getSquashManager: jest.fn().mockReturnValue({
          squashCommitsForFinalize: jest.fn().mockImplementation(async (context) => {
            expect(context.headCommit).toBe('head-before-cleanup');
            expect(context.baseCommit).toBe('abc123def456');
            return squashSpy(context);
          }),
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '510',
      };

      // When
      await handleFinalizeCommand(options);

      // Then: pull が実行され、headBeforeCleanup がそのまま終端として使われる
      expect(pullLatest).toHaveBeenCalled();
      expect(squashSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 510,
          headCommit: 'head-before-cleanup',
        }),
      );
    });

    test('IT-510-002: headCommit 未指定時は HEAD を終点にする', async () => {
      // Given: HEAD を明示的に取得できないケースを HEAD リテラルで代用
      mockRevparse.mockResolvedValueOnce('HEAD\n');
      const squashSpy = jest.fn().mockResolvedValue(undefined);
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;

      mockGitManager.mockImplementationOnce(() => ({
        commitWorkflowDeletion: jest.fn().mockResolvedValue({
          success: true,
          commit_hash: 'cleanup789',
        }),
        pushToRemote: jest.fn().mockResolvedValue({ success: true }),
        getSquashManager: jest.fn(),
      } as any));

      mockGitManager.mockImplementationOnce(() => ({
        getSquashManager: jest.fn().mockReturnValue({
          squashCommitsForFinalize: jest.fn().mockImplementation(async (context) => {
            expect(context.headCommit).toBe('HEAD');
            return squashSpy(context);
          }),
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '510',
      };

      // When
      await handleFinalizeCommand(options);

      // Then: HEAD が終点として渡される
      expect(squashSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCommit: 'abc123def456',
          headCommit: 'HEAD',
        }),
      );
    });

    test('IT-510-003: Step 1 の headBeforeCleanup を Step 3 に伝播する', async () => {
      // Given: finalize --issue 510 を実行
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const squashSpy = jest.fn().mockResolvedValue(undefined);

      mockGitManager.mockImplementationOnce(() => ({
        commitWorkflowDeletion: jest.fn().mockResolvedValue({
          success: true,
          commit_hash: 'cleanup789',
        }),
        pushToRemote: jest.fn().mockResolvedValue({ success: true }),
        getSquashManager: jest.fn(),
      } as any));

      mockGitManager.mockImplementationOnce(() => ({
        getSquashManager: jest.fn().mockReturnValue({
          squashCommitsForFinalize: jest.fn().mockImplementation(async (context) => {
            expect(context.headCommit).toBe('head-before-cleanup');
            return squashSpy(context);
          }),
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '510',
      };

      // When
      await handleFinalizeCommand(options);

      // Then: headBeforeCleanup が SquashManager に渡される
      expect(squashSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 510,
          baseCommit: 'abc123def456',
          headCommit: 'head-before-cleanup',
        }),
      );
    });

    test('IT-510-004: 既存 IT-12 相当のコンテキストで後方互換を維持する', async () => {
      // Given: 従来の finalize フロー（issue 123 相当）を再現
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const squashSpy = jest.fn().mockResolvedValue(undefined);

      mockGitManager.mockImplementationOnce(() => ({
        commitWorkflowDeletion: jest.fn().mockResolvedValue({
          success: true,
          commit_hash: 'cleanup789',
        }),
        pushToRemote: jest.fn().mockResolvedValue({ success: true }),
        getSquashManager: jest.fn(),
      } as any));

      mockGitManager.mockImplementationOnce(() => ({
        getSquashManager: jest.fn().mockReturnValue({
          squashCommitsForFinalize: jest.fn().mockImplementation(async (context) => {
            expect(context.issueNumber).toBe(123);
            expect(context.baseCommit).toBe('abc123def456');
            expect(context.targetBranch).toBe('main');
            expect(context.headCommit).toBe('head-before-cleanup');
            return squashSpy(context);
          }),
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When
      await handleFinalizeCommand(options);

      // Then: 既存の FinalizeContext 期待値が維持される
      expect(squashSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 123,
          baseCommit: 'abc123def456',
          targetBranch: 'main',
          headCommit: 'head-before-cleanup',
        }),
      );
    });

    test('IT-510-005: Step 1 で HEAD 取得に失敗した場合はエラーにする', async () => {
      // Given: git.revparse が失敗する
      mockRevparse.mockRejectedValueOnce(new Error('revparse failed'));

      const options: FinalizeCommandOptions = {
        issue: '510',
      };

      // When & Then: エラーで終了する
      await expect(handleFinalizeCommand(options)).rejects.toThrow(/revparse failed/i);
    });
  });
});

describe('Integration: Finalize Command - エラーハンドリング', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevparse.mockResolvedValue('head-before-cleanup\n');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
  });

  // =============================================================================
  // IT-05: 統合テスト_異常系_base_commit不在でエラー終了
  // =============================================================================
  describe('IT-05: 統合テスト_異常系_base_commit不在でエラー終了', () => {
    test('base_commit 不在時にエラーで終了する', async () => {
      // Given: base_commit が存在しない
      (findWorkflowMetadata as jest.Mock).mockResolvedValue({
        repoRoot: '/test/repo',
        metadataPath: testMetadataPath,
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          issue_number: '123',  // string型
          // base_commit が存在しない
          phases: {},
        })
      );

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleFinalizeCommand(options))
        .rejects.toThrow(/base_commit not found in metadata/);
    });
  });

  // =============================================================================
  // IT-06: 統合テスト_異常系_PR不在でエラー終了
  // =============================================================================
  describe('IT-06: 統合テスト_異常系_PR不在でエラー終了', () => {
    test('PR 不在時にエラーで終了する', async () => {
      // Given: PR が存在しない
      (findWorkflowMetadata as jest.Mock).mockResolvedValue({
        repoRoot: '/test/repo',
        metadataPath: testMetadataPath,
      });

      const metadataManager = new MetadataManager(testMetadataPath);
      metadataManager.data.base_commit = 'abc123';
      metadataManager.data.target_repository = {
        owner: 'owner',
        repo: 'repo',
        path: '/test/repo',
        github_name: 'owner/repo',  // 必須フィールド
        remote_url: 'https://github.com/owner/repo.git',  // 必須フィールド
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data) as any
      );

      // GitHubClient のモックで PR が見つからない場合
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      mockGitHubClient.mockImplementation(() => ({
        getPullRequestClient: jest.fn().mockReturnValue({
          getPullRequestNumber: jest.fn()
            .mockResolvedValue(null), // PR が見つからない
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleFinalizeCommand(options))
        .rejects.toThrow(/Pull request not found for issue #123/);
    });
  });

  // =============================================================================
  // IT-07: 統合テスト_異常系_GitHub_API権限不足
  // =============================================================================
  describe('IT-07: 統合テスト_異常系_GitHub_API権限不足', () => {
    test('GitHub API 権限不足時にエラーで終了する', async () => {
      // Given: GitHub API が権限不足で失敗する
      (findWorkflowMetadata as jest.Mock).mockResolvedValue({
        repoRoot: '/test/repo',
        metadataPath: testMetadataPath,
      });

      const metadataManager = new MetadataManager(testMetadataPath);
      metadataManager.data.base_commit = 'abc123';
      metadataManager.data.target_repository = {
        owner: 'owner',
        repo: 'repo',
        path: '/test/repo',
        github_name: 'owner/repo',  // 必須フィールド
        remote_url: 'https://github.com/owner/repo.git',  // 必須フィールド
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(metadataManager.data) as any
      );

      // GitHubClient のモックで権限不足エラー
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      mockGitHubClient.mockImplementation(() => ({
        getPullRequestClient: jest.fn().mockReturnValue({
          getPullRequestNumber: jest.fn()
            .mockResolvedValue(456),
          updatePullRequest: jest.fn()
            .mockResolvedValue({
              success: false,
              error: 'GitHub API error: 403 - Forbidden',
            }),
        }),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleFinalizeCommand(options))
        .rejects.toThrow(/Failed to update PR: GitHub API error: 403/);
    });
  });
});

describe('Integration: Finalize Command - モジュール連携テスト', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevparse.mockResolvedValue('head-before-cleanup\n');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined as any);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);

    const mockFindWorkflowMetadata = findWorkflowMetadata as jest.MockedFunction<typeof findWorkflowMetadata>;
    mockFindWorkflowMetadata.mockResolvedValue({
      repoRoot: '/test/repo',
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.base_commit = 'abc123def456';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',  // 必須フィールド
      remote_url: 'https://github.com/owner/repo.git',  // 必須フィールド
    };
    metadataManager.data.phases.planning.status = 'completed';

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  // =============================================================================
  // IT-10: 統合テスト_モジュール連携_MetadataManager連携
  // =============================================================================
  describe('IT-10: 統合テスト_モジュール連携_MetadataManager連携', () => {
    test('MetadataManager との連携が正常に動作する', async () => {
      // Given: メタデータが準備されている
      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: MetadataManager から base_commit が取得されている
      expect(findWorkflowMetadata).toHaveBeenCalledWith('123');
    });
  });

  // =============================================================================
  // IT-11: 統合テスト_モジュール連携_ArtifactCleaner連携
  // =============================================================================
  describe('IT-11: 統合テスト_モジュール連携_ArtifactCleaner連携', () => {
    test('ArtifactCleaner との連携が正常に動作する', async () => {
      // Given: ワークフローディレクトリが存在する
      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowArtifacts が force=true で呼ばれる
      const mockArtifactCleaner = ArtifactCleaner as jest.MockedClass<typeof ArtifactCleaner>;
      const artifactCleanerInstance = mockArtifactCleaner.mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalledWith(true);
    });
  });

  // =============================================================================
  // IT-12: 統合テスト_モジュール連携_SquashManager連携
  // =============================================================================
  describe('IT-12: 統合テスト_モジュール連携_SquashManager連携', () => {
    test('SquashManager との連携が正常に動作する', async () => {
      // Given: 複数のコミットが存在する
      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: SquashManager.squashCommitsForFinalize が FinalizeContext で呼ばれる
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      const gitManagerInstance = mockGitManager.mock.results[0]?.value;
      const squashManager = gitManagerInstance?.getSquashManager();

      expect(squashManager.squashCommitsForFinalize).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 123,
          baseCommit: 'abc123def456',
          targetBranch: 'main',
          headCommit: 'head-before-cleanup',
        }),
      );
    });
  });

  // =============================================================================
  // IT-13: 統合テスト_モジュール連携_PullRequestClient連携
  // =============================================================================
  describe('IT-13: 統合テスト_モジュール連携_PullRequestClient連携', () => {
    test('PullRequestClient との連携が正常に動作する', async () => {
      // Given: PR が Draft 状態で存在する
      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When: finalize コマンドを実行
      await handleFinalizeCommand(options);

      // Then: PullRequestClient のメソッドが順次呼ばれる
      const mockGitHubClient = GitHubClient as jest.MockedClass<typeof GitHubClient>;
      const githubClientInstance = mockGitHubClient.mock.results[0]?.value;
      const prClient = githubClientInstance?.getPullRequestClient();

      expect(prClient.getPullRequestNumber).toHaveBeenCalledWith(123);
      expect(prClient.updatePullRequest).toHaveBeenCalledWith(
        456,
        expect.stringContaining('変更サマリー')
      );
      expect(prClient.markPRReady).toHaveBeenCalledWith(456);
    });
  });
});

describe('Integration: Finalize Command - Git操作エラーハンドリング', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevparse.mockResolvedValue('head-before-cleanup\n');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.ensureDirSync as jest.Mock).mockImplementation(() => undefined as any);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);

    (findWorkflowMetadata as jest.Mock).mockResolvedValue({
      repoRoot: '/test/repo',
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.base_commit = 'abc123';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',  // 必須フィールド
      remote_url: 'https://github.com/owner/repo.git',  // 必須フィールド
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  // =============================================================================
  // IT-GIT-ERR-01: Git コミット失敗時のエラー
  // =============================================================================
  describe('IT-GIT-ERR-01: Git コミット失敗時のエラー', () => {
    test('Git コミット失敗時にエラーがスローされる', async () => {
      // Given: Git コミットが失敗する
      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      mockGitManager.mockImplementation(() => ({
        commitWorkflowDeletion: jest.fn()
          .mockResolvedValue({
            success: false,
            error: 'Commit failed: Permission denied'
          }),
        pushToRemote: jest.fn(),
        getSquashManager: jest.fn(),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleFinalizeCommand(options))
        .rejects.toThrow(/Commit failed/);
    });
  });

  // =============================================================================
  // IT-GIT-ERR-02: Git プッシュ失敗時のエラー
  // =============================================================================
  describe('IT-GIT-ERR-02: Git プッシュ失敗時のエラー', () => {
    test('Git プッシュ失敗時にエラーがスローされる', async () => {
      // Given: Git プッシュが失敗する
      // Note: metadataManager は beforeEach で初期化済み

      const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
      mockGitManager.mockImplementation(() => ({
        commitWorkflowDeletion: jest.fn()
          .mockResolvedValue({
            success: true,
            commit_hash: 'abc123'
          }),
        pushToRemote: jest.fn()
          .mockResolvedValue({
            success: false,
            error: 'Push failed: Network error'
          }),
        getSquashManager: jest.fn(),
      } as any));

      const options: FinalizeCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleFinalizeCommand(options))
        .rejects.toThrow(/Push failed/);
    });
  });
});
