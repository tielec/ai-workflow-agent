/**
 * インテグレーションテスト: cleanup コマンド
 * Issue #212: ワークフローログクリーンアップを独立したコマンドとして実装
 *
 * テスト対象:
 * - エンドツーエンドのクリーンアップシナリオ
 * - ドライランモード
 * - フェーズ範囲指定
 * - 完全クリーンアップ（--all）
 * - エラーハンドリング
 *
 * テスト戦略: UNIT_INTEGRATION - インテグレーション部分
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleCleanupCommand } from '../../src/commands/cleanup.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import type { CleanupCommandOptions } from '../../src/commands/cleanup.js';
import * as path from 'node:path';
// fs-extraのモック - 手動モックを使用
jest.mock('fs-extra');

// repository-utilsのモック
jest.mock('../../src/core/repository-utils.js');

// GitManagerのモック
jest.mock('../../src/core/git-manager.js', () => ({
  GitManager: jest.fn().mockImplementation(() => ({
    commitCleanupLogs: jest.fn().mockResolvedValue({ success: true, commit_hash: 'abc123' }),
    pushToRemote: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

// ArtifactCleanerのモック
jest.mock('../../src/phases/cleanup/artifact-cleaner.js', () => ({
  ArtifactCleaner: jest.fn().mockImplementation(() => ({
    cleanupWorkflowLogs: jest.fn().mockResolvedValue(undefined),
    cleanupWorkflowArtifacts: jest.fn().mockResolvedValue(undefined),
  })),
}));

// repository-utilsのモック
jest.mock('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  findWorkflowMetadata: jest.fn(),
}));

import fs from 'fs-extra';
import { GitManager } from '../../src/core/git-manager.js';
import { ArtifactCleaner } from '../../src/phases/cleanup/artifact-cleaner.js';
import { setFsExtra } from '../../src/utils/fs-proxy.js';
const { findWorkflowMetadata } = jest.requireMock('../../src/core/repository-utils.js') as {
  findWorkflowMetadata: jest.Mock;
};
const mockFs = fs as any;
const mockFindWorkflowMetadata = findWorkflowMetadata as jest.MockedFunction<typeof findWorkflowMetadata>;
const resetFsMocks = () => {
  mockFs.existsSync = jest.fn();
  mockFs.ensureDirSync = jest.fn();
  mockFs.writeFileSync = jest.fn();
  mockFs.readFileSync = jest.fn();
  mockFs.readdirSync = jest.fn();
  mockFs.statSync = jest.fn();
  mockFs.removeSync = jest.fn();
};

describe('Integration: Cleanup Command - 基本的なクリーンアップ', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    resetFsMocks();
    setFsExtra(fs as any);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.ensureDirSync.mockImplementation(() => undefined as any);
    mockFs.writeFileSync.mockImplementation(() => undefined);

    // findWorkflowMetadataのモック設定
    mockFindWorkflowMetadata.mockResolvedValue({
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（Phase 0-8が完了している状態）
    metadataManager.data.phases.planning.status = 'completed';
    metadataManager.data.phases.requirements.status = 'completed';
    metadataManager.data.phases.design.status = 'completed';
    metadataManager.data.phases.test_scenario.status = 'completed';
    metadataManager.data.phases.implementation.status = 'completed';
    metadataManager.data.phases.test_implementation.status = 'completed';
    metadataManager.data.phases.testing.status = 'completed';
    metadataManager.data.phases.documentation.status = 'completed';
    metadataManager.data.phases.report.status = 'completed';

    // fs.readFileSyncでメタデータを返す
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    setFsExtra(undefined as any);
  });

  // =============================================================================
  // IC-CLEANUP-01: 基本的なクリーンアップ実行
  // =============================================================================
  describe('IC-CLEANUP-01: 基本的なクリーンアップ実行', () => {
    test('cleanup --issue 123 で通常クリーンアップが実行される', async () => {
      // Given: Issue #123のワークフローが存在する
      const options: CleanupCommandOptions = {
        issue: '123',
      };

      // When: クリーンアップコマンドを実行
      await handleCleanupCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowLogs()が呼ばれる
      const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowLogs).toHaveBeenCalledWith(undefined);

      // Git コミット＆プッシュが実行される
      const gitManagerInstance = (GitManager as jest.Mock).mock.results[0]?.value;
      expect(gitManagerInstance?.commitCleanupLogs).toHaveBeenCalledWith(123, 'report');
      expect(gitManagerInstance?.pushToRemote).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IC-CLEANUP-02: ドライランモード
  // =============================================================================
  describe('IC-CLEANUP-02: ドライランモード', () => {
    test('cleanup --issue 123 --dry-run で削除対象がプレビュー表示される', async () => {
      // Given: ドライランオプション
      const options: CleanupCommandOptions = {
        issue: '123',
        dryRun: true,
      };

      // ファイルスキャンのモック設定
      mockFs.readdirSync.mockReturnValue([]);

      // When: クリーンアップコマンドを実行
      await handleCleanupCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowLogs()は呼ばれない
      const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowLogs).not.toHaveBeenCalled();

      // Git コミット＆プッシュも実行されない
      const gitManagerInstance = (GitManager as jest.Mock).mock.results[0]?.value;
      expect(gitManagerInstance?.commitCleanupLogs).not.toHaveBeenCalled();
      expect(gitManagerInstance?.pushToRemote).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IC-CLEANUP-03: フェーズ範囲指定（0-4）
  // =============================================================================
  describe('IC-CLEANUP-03: フェーズ範囲指定（0-4）', () => {
    test('cleanup --issue 123 --phases 0-4 で部分クリーンアップが実行される', async () => {
      // Given: フェーズ範囲指定
      const options: CleanupCommandOptions = {
        issue: '123',
        phases: '0-4',
      };

      // When: クリーンアップコマンドを実行
      await handleCleanupCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowLogs()が指定されたフェーズ範囲で呼ばれる
      const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowLogs).toHaveBeenCalledWith([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation'
      ]);

      // Git コミット＆プッシュが実行される
      const gitManagerInstance = (GitManager as jest.Mock).mock.results[0]?.value;
      expect(gitManagerInstance?.commitCleanupLogs).toHaveBeenCalledWith(123, 'report');
      expect(gitManagerInstance?.pushToRemote).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IC-CLEANUP-04: フェーズ名指定（planning,requirements）
  // =============================================================================
  describe('IC-CLEANUP-04: フェーズ名指定（planning,requirements）', () => {
    test('cleanup --issue 123 --phases planning,requirements で部分クリーンアップが実行される', async () => {
      // Given: フェーズ名指定
      const options: CleanupCommandOptions = {
        issue: '123',
        phases: 'planning,requirements',
      };

      // When: クリーンアップコマンドを実行
      await handleCleanupCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowLogs()が指定されたフェーズで呼ばれる
      const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowLogs).toHaveBeenCalledWith([
        'planning',
        'requirements'
      ]);
    });
  });
});

describe('Integration: Cleanup Command - 完全クリーンアップ（--all）', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    resetFsMocks();
    mockFs.existsSync.mockReturnValue(true);
    setFsExtra(fs as any);

    // findWorkflowMetadataのモック設定
    mockFindWorkflowMetadata.mockResolvedValue({
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);

    // Evaluation Phaseが完了している状態
    metadataManager.data.phases.evaluation.status = 'completed';

    // fs.readFileSyncでメタデータを返す
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  afterEach(() => {
    setFsExtra(undefined as any);
  });

  // =============================================================================
  // IC-CLEANUP-05: 完全クリーンアップ（Evaluation完了後）
  // =============================================================================
  describe('IC-CLEANUP-05: 完全クリーンアップ（Evaluation完了後）', () => {
    test('cleanup --issue 123 --all でワークフローディレクトリ全体が削除される', async () => {
      // Given: Evaluation Phaseが完了している
      const options: CleanupCommandOptions = {
        issue: '123',
        all: true,
      };

      // When: 完全クリーンアップコマンドを実行
      await handleCleanupCommand(options);

      // Then: ArtifactCleaner.cleanupWorkflowArtifacts()が呼ばれる
      const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
      expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalledWith(false);

      // Git コミット＆プッシュが実行される（evaluationフェーズ用）
      const gitManagerInstance = (GitManager as jest.Mock).mock.results[0]?.value;
      expect(gitManagerInstance?.commitCleanupLogs).toHaveBeenCalledWith(123, 'evaluation');
      expect(gitManagerInstance?.pushToRemote).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // IC-CLEANUP-06: Evaluation未完了時の--allオプションエラー
  // =============================================================================
  describe('IC-CLEANUP-06: Evaluation未完了時の--allオプションエラー', () => {
    test('Evaluation未完了時に--allオプションを指定するとエラーがスローされる', async () => {
      // Given: Evaluation Phaseが未完了
      metadataManager.data.phases.evaluation.status = 'in_progress';
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      const options: CleanupCommandOptions = {
        issue: '123',
        all: true,
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/--all option requires Evaluation Phase to be completed. Current status: in_progress/);
    });
  });
});

describe('Integration: Cleanup Command - エラーハンドリング', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-999';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();
    resetFsMocks();
    setFsExtra(fs as any);
    mockFs.ensureDirSync.mockImplementation(() => {});
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    setFsExtra(undefined as any);
  });

  // =============================================================================
  // IC-CLEANUP-ERR-01: ワークフロー不存在時のエラー
  // =============================================================================
  describe('IC-CLEANUP-ERR-01: ワークフロー不存在時のエラー', () => {
    test('ワークフローが存在しない場合にエラーメッセージが表示される', async () => {
      // Given: ワークフローが存在しない
      mockFindWorkflowMetadata.mockRejectedValue(
        new Error('Workflow for issue #999 not found')
      );

      const options: CleanupCommandOptions = {
        issue: '999',
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Workflow for issue #999 not found/);
    });
  });

  // =============================================================================
  // IC-CLEANUP-ERR-02: 無効なフェーズ範囲のエラー
  // =============================================================================
  describe('IC-CLEANUP-ERR-02: 無効なフェーズ範囲のエラー', () => {
    test('無効なフェーズ範囲が指定された場合にエラーメッセージが表示される', async () => {
      // Given: 無効なフェーズ範囲
      const metadataManager = new MetadataManager(testMetadataPath);
      mockFindWorkflowMetadata.mockResolvedValue({
        metadataPath: testMetadataPath,
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      const options: CleanupCommandOptions = {
        issue: '123',
        phases: '10-12',
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Invalid phase range: 10-12. Valid range is 0-9/);
    });
  });

  // =============================================================================
  // IC-CLEANUP-ERR-03: --phasesと--allの同時指定エラー
  // =============================================================================
  describe('IC-CLEANUP-ERR-03: --phasesと--allの同時指定エラー', () => {
    test('--phasesと--allを同時に指定するとエラーがスローされる', async () => {
      // Given: --phasesと--allを同時に指定
      const metadataManager = new MetadataManager(testMetadataPath);
      metadataManager.data.phases.evaluation.status = 'completed';

      mockFindWorkflowMetadata.mockResolvedValue({
        metadataPath: testMetadataPath,
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      const options: CleanupCommandOptions = {
        issue: '123',
        phases: '0-4',
        all: true,
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Cannot specify both --phases and --all options/);
    });
  });

  // =============================================================================
  // IC-CLEANUP-ERR-04: 無効なIssue番号のエラー
  // =============================================================================
  describe('IC-CLEANUP-ERR-04: 無効なIssue番号のエラー', () => {
    test('無効なIssue番号が指定された場合にエラーがスローされる', async () => {
      // Given: 無効なIssue番号
      const metadataManager = new MetadataManager(testMetadataPath);
      mockFindWorkflowMetadata.mockResolvedValue({
        metadataPath: testMetadataPath,
      });
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify(metadataManager.data)
      );

      const options: CleanupCommandOptions = {
        issue: 'abc',
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Invalid issue number: abc. Must be a positive integer./);
    });
  });
});

describe('Integration: Cleanup Command - Git操作エラーハンドリング', () => {
  const testWorkflowDir = '/test/.ai-workflow/issue-123';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    resetFsMocks();
    setFsExtra(fs as any);
    mockFs.existsSync.mockReturnValue(true);

    // findWorkflowMetadataのモック設定
    mockFindWorkflowMetadata.mockResolvedValue({
      metadataPath: testMetadataPath,
    });

    metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.phases.planning.status = 'completed';

    mockFs.readFileSync.mockReturnValue(
      JSON.stringify(metadataManager.data)
    );
  });

  afterEach(() => {
    setFsExtra(undefined as any);
  });

  // =============================================================================
  // IC-CLEANUP-GIT-ERR-01: Git コミット失敗時のエラー
  // =============================================================================
  describe('IC-CLEANUP-GIT-ERR-01: Git コミット失敗時のエラー', () => {
    test('Git コミット失敗時にエラーがスローされる', async () => {
      // Given: Git コミットが失敗する
      (GitManager as jest.Mock).mockImplementation(() => ({
        commitCleanupLogs: jest.fn().mockResolvedValue({
          success: false,
          error: 'Commit failed: Permission denied'
        }),
        pushToRemote: jest.fn(),
      }));

      const options: CleanupCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Commit failed/);
    });
  });

  // =============================================================================
  // IC-CLEANUP-GIT-ERR-02: Git プッシュ失敗時のエラー
  // =============================================================================
  describe('IC-CLEANUP-GIT-ERR-02: Git プッシュ失敗時のエラー', () => {
    test('Git プッシュ失敗時にエラーがスローされる', async () => {
      // Given: Git プッシュが失敗する
      (GitManager as jest.Mock).mockImplementation(() => ({
        commitCleanupLogs: jest.fn().mockResolvedValue({
          success: true,
          commit_hash: 'abc123'
        }),
        pushToRemote: jest.fn().mockResolvedValue({
          success: false,
          error: 'Push failed: Network error'
        }),
      }));

      const options: CleanupCommandOptions = {
        issue: '123',
      };

      // When & Then: エラーがスローされる
      await expect(handleCleanupCommand(options))
        .rejects.toThrow(/Push failed/);
    });
  });
});
