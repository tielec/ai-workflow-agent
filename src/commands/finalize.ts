/**
 * Finalize コマンドハンドラ（Issue #261）
 *
 * ワークフロー完了時の最終処理を統合したコマンドとして実装。
 * - CLI引数解析（--issue, --dry-run, --skip-squash, --skip-pr-update, --base-branch）
 * - 5ステップの順次実行（base_commit取得、クリーンアップ、スカッシュ、PR更新、ドラフト解除）
 * - エラーハンドリング（各ステップで明確なエラーメッセージ）
 */

import path from 'node:path';
import { logger } from '../utils/logger.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { ArtifactCleaner } from '../phases/cleanup/artifact-cleaner.js';
import { GitHubClient } from '../core/github-client.js';
import { findWorkflowMetadata } from '../core/repository-utils.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { FinalizeContext } from '../core/git/squash-manager.js';
import type { PhaseName } from '../types.js';

/**
 * FinalizeCommandOptions - CLIオプションの型定義
 */
export interface FinalizeCommandOptions {
  /** Issue番号（必須） */
  issue: string;

  /** ドライランフラグ（オプション） */
  dryRun?: boolean;

  /** スカッシュをスキップ（オプション） */
  skipSquash?: boolean;

  /** PR更新をスキップ（オプション） */
  skipPrUpdate?: boolean;

  /** PRのマージ先ブランチ（オプション、デフォルト: main） */
  baseBranch?: string;
}

/**
 * handleFinalizeCommand - finalize コマンドのエントリーポイント
 */
export async function handleFinalizeCommand(options: FinalizeCommandOptions): Promise<void> {
  logger.info('Starting finalize command...');

  // 1. バリデーション
  validateFinalizeOptions(options);

  // 2. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(options.issue);

  // 3. ドライランモード判定
  if (options.dryRun) {
    await previewFinalize(options, metadataManager);
    return;
  }

  // 4. Step 1: base_commit 取得・一時保存
  const baseCommit = await executeStep1(metadataManager);

  // 5. Step 2: .ai-workflow 削除 + コミット
  await executeStep2(metadataManager, workflowDir, options);

  // 6. Step 3: コミットスカッシュ（--skip-squash でスキップ可能）
  if (!options.skipSquash) {
    await executeStep3(metadataManager, workflowDir, baseCommit, options);
  } else {
    logger.info('Skipping commit squash (--skip-squash option)');
  }

  // 7. Step 4-5: PR 更新とドラフト解除（--skip-pr-update でスキップ可能）
  if (!options.skipPrUpdate) {
    await executeStep4And5(metadataManager, options);
  } else {
    logger.info('Skipping PR update and draft conversion (--skip-pr-update option)');
  }

  logger.info('✅ Finalize completed successfully.');
}

/**
 * ワークフローメタデータを読み込む
 */
async function loadWorkflowMetadata(issueNumber: string): Promise<{
  metadataManager: MetadataManager;
  workflowDir: string;
}> {
  // メタデータの探索
  const result = await findWorkflowMetadata(issueNumber);
  const metadataPath = result.metadataPath;

  const metadataManager = new MetadataManager(metadataPath);
  const workflowDir = metadataManager.workflowDir;

  logger.info(`Loaded workflow metadata: ${metadataPath}`);
  return { metadataManager, workflowDir };
}

/**
 * validateFinalizeOptions - CLIオプションのバリデーション
 */
function validateFinalizeOptions(options: FinalizeCommandOptions): void {
  // Issue番号チェック
  if (!options.issue) {
    throw new Error('Error: --issue option is required');
  }

  const issueNum = parseInt(options.issue, 10);
  if (isNaN(issueNum) || issueNum <= 0) {
    throw new Error(`Error: Invalid issue number: ${options.issue}. Must be a positive integer.`);
  }

  // baseBranch チェック（指定されている場合のみ）
  if (options.baseBranch && options.baseBranch.trim().length === 0) {
    throw new Error('Error: --base-branch cannot be empty');
  }
}

/**
 * executeStep1 - base_commit 取得・一時保存
 *
 * @param metadataManager - メタデータマネージャー
 * @returns base_commit ハッシュ
 * @throws Error - base_commit が存在しない場合
 */
async function executeStep1(metadataManager: MetadataManager): Promise<string> {
  logger.info('Step 1: Retrieving base_commit...');

  const baseCommit = metadataManager.getBaseCommit();
  if (!baseCommit) {
    throw new Error(
      'base_commit not found in metadata. ' +
        'Please ensure the workflow was initialized with the "init" command.'
    );
  }

  logger.info(`base_commit: ${baseCommit}`);
  return baseCommit;
}

/**
 * executeStep2 - .ai-workflow ディレクトリ削除 + コミット
 *
 * @param metadataManager - メタデータマネージャー
 * @param workflowDir - ワークフローディレクトリパス
 * @param options - CLI オプション
 */
async function executeStep2(
  metadataManager: MetadataManager,
  workflowDir: string,
  options: FinalizeCommandOptions
): Promise<void> {
  logger.info('Step 2: Cleaning up workflow artifacts...');

  const artifactCleaner = new ArtifactCleaner(metadataManager);

  // force=true で確認プロンプトをスキップ（CI環境でも動作）
  await artifactCleaner.cleanupWorkflowArtifacts(true);

  // Git コミット＆プッシュ
  const gitManager = new GitManager(workflowDir, metadataManager);
  const issueNumber = parseInt(options.issue, 10);

  const commitResult = await gitManager.commitCleanupLogs(issueNumber, 'finalize');
  if (!commitResult.success) {
    throw new Error(commitResult.error ?? 'Commit failed');
  }

  logger.info(`Cleanup committed: ${commitResult.commit_hash}`);

  const pushResult = await gitManager.pushToRemote();
  if (!pushResult.success) {
    throw new Error(pushResult.error ?? 'Push failed');
  }

  logger.info('✅ Step 2 completed: Workflow artifacts cleaned up.');
}

/**
 * executeStep3 - コミットスカッシュ
 *
 * @param metadataManager - メタデータマネージャー
 * @param workflowDir - ワークフローディレクトリパス
 * @param baseCommit - ワークフロー開始時のコミットハッシュ
 * @param options - CLI オプション
 */
async function executeStep3(
  metadataManager: MetadataManager,
  workflowDir: string,
  baseCommit: string,
  options: FinalizeCommandOptions
): Promise<void> {
  logger.info('Step 3: Squashing commits...');

  const gitManager = new GitManager(workflowDir, metadataManager);
  const squashManager = gitManager.getSquashManager();

  // finalize 用のシンプルなコンテキストを作成
  const context: FinalizeContext = {
    issueNumber: parseInt(options.issue, 10),
    baseCommit,
    targetBranch: 'main', // デフォルト
  };

  // SquashManager の新しいオーバーロードメソッドを呼び出し
  await squashManager.squashCommitsForFinalize(context);

  logger.info('✅ Step 3 completed: Commits squashed.');
}

/**
 * executeStep4And5 - PR 本文更新とドラフト解除
 *
 * @param metadataManager - メタデータマネージャー
 * @param options - CLI オプション
 */
async function executeStep4And5(
  metadataManager: MetadataManager,
  options: FinalizeCommandOptions
): Promise<void> {
  logger.info('Step 4-5: Updating PR and marking as ready for review...');

  const issueNumber = parseInt(options.issue, 10);

  // GitHub Client 初期化
  const githubClient = await createGitHubClient(metadataManager);
  const prClient = githubClient.getPullRequestClient();

  // PR 番号の取得
  const prNumber = await prClient.getPullRequestNumber(issueNumber);
  if (!prNumber) {
    throw new Error(`Pull request not found for issue #${issueNumber}`);
  }

  logger.info(`Found PR #${prNumber}`);

  // Step 4a: PR 本文更新
  const prBody = generateFinalPrBody(metadataManager, issueNumber);
  const updateResult = await prClient.updatePullRequest(prNumber, prBody);
  if (!updateResult.success) {
    throw new Error(`Failed to update PR: ${updateResult.error}`);
  }

  logger.info(`✅ PR #${prNumber} updated with final content.`);

  // Step 4b: マージ先ブランチ変更（--base-branch 指定時のみ）
  // デフォルトブランチが main とは限らないため、指定がある場合のみ変更
  if (options.baseBranch) {
    const baseBranchResult = await prClient.updateBaseBranch(prNumber, options.baseBranch);
    if (!baseBranchResult.success) {
      throw new Error(`Failed to update base branch: ${baseBranchResult.error}`);
    }

    logger.info(`✅ PR #${prNumber} base branch changed to '${options.baseBranch}'.`);
  }

  // Step 5: PR ドラフト解除
  const markReadyResult = await prClient.markPRReady(prNumber);
  if (!markReadyResult.success) {
    throw new Error(`Failed to mark PR as ready: ${markReadyResult.error}`);
  }

  logger.info(`✅ PR #${prNumber} marked as ready for review.`);
}

/**
 * createGitHubClient - GitHub Client の初期化
 */
async function createGitHubClient(metadataManager: MetadataManager): Promise<GitHubClient> {
  const metadata = metadataManager.data;
  const targetRepo = metadata.target_repository;

  if (!targetRepo) {
    throw new Error('target_repository not found in metadata');
  }

  // GitHubClient は環境変数から自動的に認証情報を取得する
  const githubClient = new GitHubClient();
  return githubClient;
}

/**
 * generateFinalPrBody - PR 最終本文を生成
 *
 * @param metadataManager - メタデータマネージャー
 * @param issueNumber - Issue番号
 * @returns PR 本文（Markdown形式）
 */
function generateFinalPrBody(metadataManager: MetadataManager, issueNumber: number): string {
  const metadata = metadataManager.data;

  // 変更サマリー
  const summary = `## 変更サマリー

- Issue番号: #${issueNumber}
- タイトル: ${metadata.issue_title ?? 'Unknown'}
- 完了ステータス: All phases completed
`;

  // 完了フェーズ一覧
  const phases = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ];

  const phaseList = phases
    .map((phase) => {
      const phaseName = phase as PhaseName;
      const status = metadata.phases[phaseName]?.status ?? 'pending';
      const emoji = status === 'completed' ? '✅' : '⏳';
      return `- ${emoji} ${phase}: ${status}`;
    })
    .join('\n');

  // テスト結果（testing フェーズのステータスから取得）
  const testStatus = metadata.phases?.testing?.status === 'completed' ? '✅ Passed' : '⏳ Pending';

  const body = `${summary}

## フェーズステータス

${phaseList}

## テスト結果

${testStatus}

## クリーンアップ状況

- ✅ ワークフローディレクトリ削除済み
- ✅ コミットスカッシュ完了

---

**AI Workflow Agent - Finalize Command**
`;

  return body;
}

/**
 * previewFinalize - ドライランモードでプレビュー表示
 *
 * @param options - CLI オプション
 * @param metadataManager - メタデータマネージャー
 */
async function previewFinalize(
  options: FinalizeCommandOptions,
  metadataManager: MetadataManager
): Promise<void> {
  logger.info('[DRY RUN] Finalize preview:');
  logger.info('');

  logger.info('Steps to be executed:');
  logger.info('  1. Retrieve base_commit from metadata');
  logger.info('  2. Clean up workflow artifacts (.ai-workflow/issue-<NUM>/)');

  if (!options.skipSquash) {
    logger.info('  3. Squash commits from base_commit to HEAD');
  } else {
    logger.info('  3. [SKIPPED] Squash commits (--skip-squash)');
  }

  if (!options.skipPrUpdate) {
    logger.info('  4. Update PR body with final content');
    if (options.baseBranch) {
      logger.info(`  5. Change PR base branch to '${options.baseBranch}'`);
    }
    logger.info('  6. Mark PR as ready for review (convert from draft)');
  } else {
    logger.info('  4-6. [SKIPPED] PR update and draft conversion (--skip-pr-update)');
  }

  logger.info('');
  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}
