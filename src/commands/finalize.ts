/**
 * Finalize コマンドハンドラ（Issue #261, #888）
 *
 * ワークフロー完了時の最終処理を統合したコマンドとして実装。
 * - CLI引数解析（--issue, --dry-run, --skip-squash, --skip-pr-update, --base-branch, --ai-rewrite, --agent）
 * - 5ステップの順次実行（base_commit取得、クリーンアップ、スカッシュ、PR更新、ドラフト解除）
 * - エラーハンドリング（各ステップで明確なエラーメッセージ）
 * - AIリライト機能（--ai-rewrite 指定時、レビュアー向けPRボディを自動生成）
 */

import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import simpleGit from 'simple-git';
import { logger } from '../utils/logger.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { ArtifactCleaner } from '../phases/cleanup/artifact-cleaner.js';
import { GitHubClient } from '../core/github-client.js';
import { findWorkflowMetadata } from '../core/repository-utils.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from '../core/config.js';
import { PromptLoader } from '../core/prompt-loader.js';
import { resolveAgentCredentials, setupAgentClients, type AgentPriority } from './execute/agent-setup.js';
import type { ClaudeAgentClient } from '../core/claude-agent-client.js';
import type { CodexAgentClient } from '../core/codex-agent-client.js';
import type { FinalizeContext } from '../core/git/squash-manager.js';
import type { PhaseName, SupportedLanguage } from '../types.js';

/**
 * 言語別テキストマッピング（Issue #587）
 */
const FINALIZE_TEXT: Record<
  SupportedLanguage,
  {
    changeSummary: string;
    issueNumber: string;
    title: string;
    completionStatus: string;
    allPhasesCompleted: string;
    phaseStatus: string;
    testResult: string;
    testPassed: string;
    testPending: string;
    cleanupStatus: string;
    workflowDirectoryDeleted: string;
    commitSquashed: string;
    footer: string;
  }
> = {
  ja: {
    changeSummary: '変更サマリー',
    issueNumber: 'Issue番号',
    title: 'タイトル',
    completionStatus: '完了ステータス',
    allPhasesCompleted: 'All phases completed',
    phaseStatus: 'フェーズステータス',
    testResult: 'テスト結果',
    testPassed: 'Passed',
    testPending: 'Pending',
    cleanupStatus: 'クリーンアップ状況',
    workflowDirectoryDeleted: 'ワークフローディレクトリ削除済み',
    commitSquashed: 'コミットスカッシュ完了',
    footer: 'AI Workflow Agent - Finalize Command',
  },
  en: {
    changeSummary: 'Change Summary',
    issueNumber: 'Issue Number',
    title: 'Title',
    completionStatus: 'Completion Status',
    allPhasesCompleted: 'All phases completed',
    phaseStatus: 'Phase Status',
    testResult: 'Test Result',
    testPassed: 'Passed',
    testPending: 'Pending',
    cleanupStatus: 'Cleanup Status',
    workflowDirectoryDeleted: 'Workflow directory deleted',
    commitSquashed: 'Commits squashed',
    footer: 'AI Workflow Agent - Finalize Command',
  },
};

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

  /** AIリライト有効化フラグ（オプション、デフォルト: false）
   *  FR-001: --ai-rewrite オプション（Issue #888） */
  aiRewrite?: boolean;

  /** エージェントモード（オプション、デフォルト: 'auto'）
   *  FR-002: --agent オプション（Issue #888）
   *  --ai-rewrite が有効な場合のみ使用される */
  agent?: 'auto' | 'codex' | 'claude';
}

// =========================================================================
// AI Rewrite 関連の型定義（Issue #888）
// =========================================================================

/**
 * 収集されたフェーズ成果物のコンテキスト情報
 */
export interface CollectedPhaseOutputs {
  /** フェーズ名をキー、成果物テキストを値とするマップ
   *  ファイル不在の場合はフォールバックテキストが設定される */
  outputs: Record<string, string>;

  /** 収集されたフェーズの数（ファイルが実在したもの） */
  collectedCount: number;

  /** 全フェーズ数 */
  totalCount: number;
}

/**
 * プロンプト用に整形されたdiff情報
 */
export interface DiffContext {
  /** プロンプトに含めるdiffテキスト */
  content: string;

  /** トランケーションが行われたかどうか */
  wasTruncated: boolean;

  /** 変更ファイル数 */
  filesChanged: number;
}

// =========================================================================
// AI Rewrite 定数（Issue #888）
// =========================================================================

/** 成果物ファイルの最大文字数（FR-004） */
export const MAX_PHASE_OUTPUT_LENGTH = 10_000;

/** diff テキストの最大文字数（FR-003） */
export const MAX_DIFF_LENGTH = 50_000;

/** diff ファイル数の上限閾値 */
export const MAX_DIFF_FILES_THRESHOLD = 300;

// =========================================================================
// AI Rewrite ファイルベース出力（Issue #894）
// =========================================================================

/**
 * generatePrBodyOutputFilePath - AIリライト用の一時出力ファイルパスを生成する
 *
 * FR-001 に基づき、os.tmpdir() 配下に一意なファイルパスを生成する。
 * issue-generator.ts の generateOutputFilePath() と同一パターンを採用。
 *
 * @returns 一時ディレクトリ内のユニークなファイルパス（絶対パス）
 */
export function generatePrBodyOutputFilePath(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `pr-body-rewrite-${timestamp}-${random}.md`);
}

// =========================================================================
// メインフロー
// =========================================================================

/**
 * handleFinalizeCommand - finalize コマンドのエントリーポイント
 */
export async function handleFinalizeCommand(options: FinalizeCommandOptions): Promise<void> {
  logger.info('Starting finalize command...');

  // 1. バリデーション
  validateFinalizeOptions(options);

  // 2. メタデータ読み込み
  const { metadataManager, workflowDir, repoDir } = await loadWorkflowMetadata(options.issue);

  // 3. ドライランモード判定
  if (options.dryRun) {
    await previewFinalize(options, metadataManager);
    return;
  }

  // ★ 新規（Issue #888）: Step 2 実行前にフェーズ成果物を収集
  // TC-007: .ai-workflow/ 削除前に成果物を保持する必要がある
  let collectedOutputs: CollectedPhaseOutputs | null = null;
  if (options.aiRewrite) {
    collectedOutputs = collectPhaseOutputs(metadataManager);
  }

  // 4. Step 1: base_commit 取得・一時保存
  const { baseCommit, headBeforeCleanup } = await executeStep1(metadataManager, repoDir);

  // 5. Step 2: .ai-workflow 削除 + コミット
  await executeStep2(metadataManager, repoDir, options);

  // 6. Step 3: コミットスカッシュ（--skip-squash でスキップ可能）
  if (!options.skipSquash) {
    await executeStep3(metadataManager, repoDir, baseCommit, headBeforeCleanup, options);
  } else {
    logger.info('Skipping commit squash (--skip-squash option)');
  }

  // 7. Step 4-5: PR 更新とドラフト解除（--skip-pr-update でスキップ可能）
  if (!options.skipPrUpdate) {
    await executeStep4And5(metadataManager, options, collectedOutputs);
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
  repoDir: string;
}> {
  // メタデータの探索
  const result = await findWorkflowMetadata(issueNumber);
  const metadataPath = result.metadataPath;

  const metadataManager = new MetadataManager(metadataPath);
  const workflowDir = metadataManager.workflowDir;
  // リポジトリルートは .ai-workflow の親ディレクトリ
  const repoDir = path.dirname(path.dirname(workflowDir));

  logger.info(`Loaded workflow metadata: ${metadataPath}`);
  return { metadataManager, workflowDir, repoDir };
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
  if (options.baseBranch !== undefined && options.baseBranch.trim().length === 0) {
    throw new Error('Error: --base-branch cannot be empty');
  }
}

/**
 * executeStep1 - base_commit 取得・headBeforeCleanup 保存
 *
 * @param metadataManager - メタデータマネージャー
 * @param repoDir - リポジトリルートディレクトリパス
 * @returns base_commit と headBeforeCleanup
 * @throws Error - base_commit が存在しない場合
 */
async function executeStep1(
  metadataManager: MetadataManager,
  repoDir: string
): Promise<{ baseCommit: string; headBeforeCleanup: string }> {
  logger.info('Step 1: Retrieving base_commit and current HEAD...');

  const baseCommit = metadataManager.getBaseCommit();
  if (!baseCommit) {
    throw new Error(
      'base_commit not found in metadata. ' +
        'Please ensure the workflow was initialized with the "init" command.'
    );
  }

  // pull による HEAD 更新の影響を避けるため、Step 2 実行直前の HEAD を保存
  const git = simpleGit(repoDir);
  const headBeforeCleanup = (await git.revparse(['HEAD'])).trim();

  logger.info(`base_commit: ${baseCommit}`);
  logger.info(`HEAD (before cleanup): ${headBeforeCleanup}`);

  return { baseCommit, headBeforeCleanup };
}

/**
 * executeStep2 - .ai-workflow ディレクトリ削除 + コミット
 *
 * @param metadataManager - メタデータマネージャー
 * @param repoDir - リポジトリルートディレクトリパス
 * @param options - CLI オプション
 */
async function executeStep2(
  metadataManager: MetadataManager,
  repoDir: string,
  options: FinalizeCommandOptions
): Promise<void> {
  logger.info('Step 2: Cleaning up workflow artifacts...');

  const artifactCleaner = new ArtifactCleaner(metadataManager);

  // force=true で確認プロンプトをスキップ（CI環境でも動作）
  await artifactCleaner.cleanupWorkflowArtifacts(true);

  // Git コミット＆プッシュ（リポジトリルートで初期化）
  const gitManager = new GitManager(repoDir, metadataManager);
  const issueNumber = parseInt(options.issue, 10);

  // finalize では削除されたファイルをコミットするため、専用メソッドを使用
  const commitResult = await gitManager.commitWorkflowDeletion(issueNumber);
  if (!commitResult.success) {
    throw new Error(commitResult.error ?? 'Commit failed');
  }

  if (commitResult.commit_hash) {
    logger.info(`Cleanup committed: ${commitResult.commit_hash}`);

    const pushResult = await gitManager.pushToRemote();
    if (!pushResult.success) {
      throw new Error(pushResult.error ?? 'Push failed');
    }
  } else {
    logger.info('No changes to commit (workflow directory already clean)');
  }

  logger.info('✅ Step 2 completed: Workflow artifacts cleaned up.');
}

/**
 * executeStep3 - コミットスカッシュ
 *
 * @param metadataManager - メタデータマネージャー
 * @param repoDir - リポジトリルートディレクトリパス
 * @param baseCommit - ワークフロー開始時のコミットハッシュ
 * @param headBeforeCleanup - Step 2 実行直前の HEAD コミットハッシュ
 * @param options - CLI オプション
 */
async function executeStep3(
  metadataManager: MetadataManager,
  repoDir: string,
  baseCommit: string,
  headBeforeCleanup: string,
  options: FinalizeCommandOptions
): Promise<void> {
  logger.info('Step 3: Squashing commits...');

  // リポジトリルートで初期化（.ai-workflow は削除済み）
  const gitManager = new GitManager(repoDir, metadataManager);
  const squashManager = gitManager.getSquashManager();

  // finalize 用のシンプルなコンテキストを作成
  const context: FinalizeContext = {
    issueNumber: parseInt(options.issue, 10),
    baseCommit,
    targetBranch: 'main', // デフォルト
    headCommit: headBeforeCleanup,
  };

  // SquashManager の新しいオーバーロードメソッドを呼び出し
  await squashManager.squashCommitsForFinalize(context);

  logger.info('✅ Step 3 completed: Commits squashed.');
}

/**
 * executeStep4And5 - PR 本文更新とドラフト解除（拡張版 Issue #888）
 *
 * FR-001, FR-008, FR-009 に基づき、--ai-rewrite フラグに応じて
 * AIリライトまたは従来のPRボディ生成を選択する。
 *
 * @param metadataManager - メタデータマネージャー
 * @param options - CLI オプション
 * @param collectedOutputs - 事前収集されたフェーズ成果物（--ai-rewrite 時のみ非null）
 */
async function executeStep4And5(
  metadataManager: MetadataManager,
  options: FinalizeCommandOptions,
  collectedOutputs: CollectedPhaseOutputs | null = null,
): Promise<void> {
  logger.info('Step 4-5: Updating PR and marking as ready for review...');

  const issueNumber = parseInt(options.issue, 10);

  // GitHub Client 初期化
  const githubClient = await createGitHubClient(metadataManager);
  const prClient = githubClient.getPullRequestClient();

  // デバッグ: 対象リポジトリを出力
  const targetRepo = metadataManager.data.target_repository;
  logger.info(`Target repository: ${targetRepo?.owner}/${targetRepo?.repo}`);

  // PR 番号の取得（メタデータから優先、フォールバックとして検索API）
  let prNumber = metadataManager.data.pr_number;

  if (!prNumber) {
    logger.warn('PR number not found in metadata, searching via GitHub API...');
    prNumber = await prClient.getPullRequestNumber(issueNumber);
    if (!prNumber) {
      throw new Error(
        `Pull request not found for issue #${issueNumber}. ` +
        'Make sure the PR was created during workflow initialization.'
      );
    }
  }

  logger.info(`Found PR #${prNumber} for repository ${targetRepo?.owner}/${targetRepo?.repo}`);

  // ★ 変更（Issue #888）: PRボディ生成の分岐
  let prBody: string;

  // FR-009: --ai-rewrite 未指定時は従来動作を100%保持
  const fallbackBody = generateFinalPrBody(metadataManager, issueNumber);

  if (options.aiRewrite && collectedOutputs) {
    // FR-001: --ai-rewrite 指定時のAIリライトフロー
    prBody = await generateAiRewrittenPrBody(
      metadataManager,
      options,
      prNumber,
      prClient,
      collectedOutputs,
      fallbackBody,
    );
  } else {
    prBody = fallbackBody;
  }

  // Step 4a: PR 本文更新
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

  // owner/repo 形式のリポジトリ名を構築
  const repositoryName = `${targetRepo.owner}/${targetRepo.repo}`;
  logger.debug(`Initializing GitHubClient for repository: ${repositoryName}`);

  // GitHubClient を対象リポジトリで初期化
  // token は環境変数から自動取得、repository を明示的に指定
  const githubClient = new GitHubClient(undefined, repositoryName);
  return githubClient;
}

/**
 * generateFinalPrBody - PR 最終本文を生成
 *
 * @param metadataManager - メタデータマネージャー
 * @param issueNumber - Issue番号
 * @returns PR 本文（Markdown形式）
 */
export function generateFinalPrBody(metadataManager: MetadataManager, issueNumber: number): string {
  const metadata = metadataManager.data;

  // 言語取得（Issue #587）
  const language = metadataManager.getLanguage() || 'ja';
  const text = FINALIZE_TEXT[language];

  // 変更サマリー
  const summary = `## ${text.changeSummary}

- ${text.issueNumber}: #${issueNumber}
- ${text.title}: ${metadata.issue_title ?? 'Unknown'}
- ${text.completionStatus}: ${text.allPhasesCompleted}
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
  const testStatus = metadata.phases?.testing?.status === 'completed' ? `✅ ${text.testPassed}` : `⏳ ${text.testPending}`;

  const body = `${summary}

## ${text.phaseStatus}

${phaseList}

## ${text.testResult}

${testStatus}

## ${text.cleanupStatus}

- ✅ ${text.workflowDirectoryDeleted}
- ✅ ${text.commitSquashed}

---

**${text.footer}**
`;

  return body;
}

/**
 * previewFinalize - ドライランモードでプレビュー表示（拡張版 Issue #888）
 *
 * FR-011 に基づき、--ai-rewrite の状態をプレビューに含める。
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
    // FR-011: --ai-rewrite の状態を表示（Issue #888）
    if (options.aiRewrite) {
      const agentMode = options.agent ?? 'auto';
      const language = metadataManager.getLanguage() || 'ja';
      const text = language === 'ja'
        ? `  4. PR更新: AI リライトが有効（エージェント: ${agentMode}）`
        : `  4. PR Update: AI rewrite enabled (agent: ${agentMode})`;
      logger.info(text);
    } else {
      logger.info('  4. Update PR body with final content');
    }
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

// =========================================================================
// AI Rewrite 関連関数（Issue #888）
// =========================================================================

/**
 * collectPhaseOutputs - フェーズ成果物を収集する
 *
 * FR-004 に基づき、各フェーズの output ファイルを読み込んで
 * CollectedPhaseOutputs として返す。
 *
 * @param metadataManager - メタデータマネージャー
 * @returns 収集されたフェーズ成果物
 */
export function collectPhaseOutputs(
  metadataManager: MetadataManager,
): CollectedPhaseOutputs {
  logger.info('Collecting phase outputs for AI rewrite...');

  const baseDir = metadataManager.workflowDir;

  // FR-004: 収集対象フェーズ成果物の定義
  const phaseFiles: Record<string, string> = {
    planning: path.join(baseDir, '00_planning', 'output', 'planning.md'),
    requirements: path.join(baseDir, '01_requirements', 'output', 'requirements.md'),
    design: path.join(baseDir, '02_design', 'output', 'design.md'),
    test_scenario: path.join(baseDir, '03_test_scenario', 'output', 'test-scenario.md'),
    implementation: path.join(baseDir, '04_implementation', 'output', 'implementation.md'),
    test_result: path.join(baseDir, '06_testing', 'output', 'test-result.md'),
    documentation: path.join(baseDir, '07_documentation', 'output', 'documentation-update-log.md'),
  };

  const outputs: Record<string, string> = {};
  let collectedCount = 0;
  const totalCount = Object.keys(phaseFiles).length;

  for (const [phaseName, filePath] of Object.entries(phaseFiles)) {
    try {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        // FR-004: 各成果物ファイルの内容は最大 10,000 文字に制限
        if (content.length > MAX_PHASE_OUTPUT_LENGTH) {
          content = content.substring(0, MAX_PHASE_OUTPUT_LENGTH)
            + '\n\n... (以降省略)';
          logger.debug(`Phase output '${phaseName}' truncated to ${MAX_PHASE_OUTPUT_LENGTH} chars`);
        }
        outputs[phaseName] = content;
        collectedCount++;
        logger.debug(`Collected phase output: ${phaseName} (${content.length} chars)`);
      } else {
        outputs[phaseName] = '（このフェーズの成果物は利用できません）';
        logger.debug(`Phase output not found: ${phaseName} (${filePath})`);
      }
    } catch (error: unknown) {
      outputs[phaseName] = '（このフェーズの成果物の読み込みに失敗しました）';
      logger.warn(`Failed to read phase output '${phaseName}': ${getErrorMessage(error)}`);
    }
  }

  logger.info(`Phase outputs collected: ${collectedCount}/${totalCount}`);
  return { outputs, collectedCount, totalCount };
}

/**
 * getDiffForPrompt - プロンプト用のdiff情報を取得・整形する
 *
 * FR-003 に基づき、PullRequestClient から diff を取得し、
 * 必要に応じてトランケーションを行う。
 *
 * @param prClient - PullRequestClient インスタンス
 * @param prNumber - PR番号
 * @returns プロンプト用に整形されたdiffコンテキスト
 */
export async function getDiffForPrompt(
  prClient: ReturnType<GitHubClient['getPullRequestClient']>,
  prNumber: number,
): Promise<DiffContext> {
  try {
    const diffResult = await prClient.getPullRequestDiff(prNumber);

    // FR-003: トランケーション戦略
    if (diffResult.filesChanged > MAX_DIFF_FILES_THRESHOLD || diffResult.diff.length > MAX_DIFF_LENGTH) {
      // 大規模diffの場合: ファイル変更リストのサマリーのみ
      const summary = extractDiffFileSummary(diffResult.diff);
      const truncationNote = diffResult.filesChanged > MAX_DIFF_FILES_THRESHOLD
        ? `このPRは ${diffResult.filesChanged} ファイルを変更しています（${MAX_DIFF_FILES_THRESHOLD}ファイル超）。diff全文は省略し、ファイル変更リストのサマリーのみを提供しています。`
        : `diffが大規模（${diffResult.diff.length.toLocaleString()} 文字）なためサマリーのみ提供しています。`;

      return {
        content: `${truncationNote}\n\n${summary}`,
        wasTruncated: true,
        filesChanged: diffResult.filesChanged,
      };
    }

    // 通常サイズの場合: diff全文を返却
    return {
      content: diffResult.diff,
      wasTruncated: false,
      filesChanged: diffResult.filesChanged,
    };
  } catch (error: unknown) {
    // FR-003: diff取得失敗時はdiffなしでプロンプトを構築
    logger.warn(`Failed to get PR diff: ${getErrorMessage(error)}`);
    return {
      content: '（diff情報の取得に失敗しました。フェーズ成果物のみでPRボディを生成します。）',
      wasTruncated: false,
      filesChanged: 0,
    };
  }
}

/**
 * extractDiffFileSummary - diff テキストからファイル変更リストのサマリーを抽出する
 *
 * diff のヘッダー行（'diff --git a/... b/...'）を解析し、
 * 各ファイルの変更概要（追加/削除行数）を生成する。
 *
 * @param diffText - 生のdiffテキスト
 * @returns ファイル変更リストのMarkdownサマリー
 */
export function extractDiffFileSummary(diffText: string): string {
  const lines = diffText.split('\n');
  const fileSummaries: string[] = [];

  let currentFile = '';
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // 前のファイルの集計を保存
      if (currentFile) {
        fileSummaries.push(`- ${currentFile}: +${additions} -${deletions}`);
      }
      // 新しいファイル名を抽出
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      currentFile = match ? match[1] : line;
      additions = 0;
      deletions = 0;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  // 最後のファイル
  if (currentFile) {
    fileSummaries.push(`- ${currentFile}: +${additions} -${deletions}`);
  }

  return `### 変更ファイル一覧（${fileSummaries.length} ファイル）\n\n${fileSummaries.join('\n')}`;
}

/**
 * buildPromptContext - AIリライト用のプロンプトを構築する
 *
 * FR-005 に基づき、プロンプトテンプレートにコンテキスト変数を埋め込む。
 * NFR-002（ReDoS防止）に準拠し、replaceAll() を使用する。
 *
 * @param issueNumber - Issue番号
 * @param issueTitle - Issueタイトル
 * @param diffContext - diff情報
 * @param phaseOutputs - フェーズ成果物
 * @param language - 言語設定
 * @param outputFilePath - エージェント出力先ファイルパス（FR-002追加、Issue #894）
 * @returns 構築されたプロンプト文字列
 */
export function buildPromptContext(
  issueNumber: number,
  issueTitle: string,
  diffContext: DiffContext,
  phaseOutputs: CollectedPhaseOutputs,
  language: SupportedLanguage,
  outputFilePath: string,
): string {
  // プロンプトテンプレートの読み込み
  const promptTemplate = PromptLoader.loadPrompt(
    'finalize',
    'rewrite_pr_body',
    language,
  );

  // PRボディテンプレートの読み込み（出力構造の指示用）
  const bodyTemplate = PromptLoader.loadTemplate(
    'pr_body_finalize_template.md',
    language,
  );

  // フェーズ成果物を結合テキストに変換
  const phaseOutputsText = Object.entries(phaseOutputs.outputs)
    .map(([phase, content]) => `### ${phase}\n\n${content}`)
    .join('\n\n---\n\n');

  // PC-004 準拠: replaceAll() を使用してReDoS防止
  let prompt = promptTemplate;
  prompt = prompt.replaceAll('{issue_number}', String(issueNumber));
  prompt = prompt.replaceAll('{issue_title}', issueTitle);
  prompt = prompt.replaceAll('{diff_content}', diffContext.content);
  prompt = prompt.replaceAll('{phase_outputs}', phaseOutputsText);
  prompt = prompt.replaceAll('{template_structure}', bodyTemplate);
  // Issue #894: ファイルベース出力パス変数の埋め込み
  prompt = prompt.replaceAll('{output_file_path}', outputFilePath);

  return prompt;
}

/**
 * validateRequiredSections - AI生成PRボディに必須セクションが含まれているか検証する
 *
 * FR-008 に基づき、生成されたPRボディに必須のMarkdownヘッダーが
 * 含まれているかを検証する。
 *
 * @param body - AI生成されたPRボディ
 * @param language - 言語設定
 * @returns 必須セクションが含まれていればtrue
 */
export function validateRequiredSections(body: string, language: SupportedLanguage): boolean {
  // 言語別の必須セクション見出し（部分一致で検証）
  const requiredHeaders: Record<SupportedLanguage, string[]> = {
    ja: ['変更概要', '主要な変更点'],
    en: ['Summary', 'Key Changes'],
  };

  const headers = requiredHeaders[language] ?? requiredHeaders.ja;

  // 少なくとも1つの必須ヘッダーが見つかればOK
  // （AIの出力は完全一致しない場合があるため、厳密すぎる検証は避ける）
  const foundCount = headers.filter(header =>
    body.includes(header)
  ).length;

  return foundCount >= 1;
}

/**
 * executeAgentTask - エージェントにタスクを実行させる（プライマリ→セカンダリフォールバック）
 *
 * FR-008 のフォールバックチェーンに従い、
 * プライマリエージェントが失敗した場合はセカンダリにフォールバックする。
 *
 * @param prompt - 実行するプロンプト
 * @param claudeClient - Claude エージェントクライアント（nullable）
 * @param codexClient - Codex エージェントクライアント（nullable）
 * @returns エージェントの出力メッセージ配列
 * @throws Error - 両方のエージェントが失敗した場合
 */
export async function executeAgentTask(
  prompt: string,
  claudeClient: ClaudeAgentClient | null,
  codexClient: CodexAgentClient | null,
): Promise<string[]> {
  // claude-first 優先順位に基づくフォールバック
  // Step 1: Claude で試行
  if (claudeClient) {
    try {
      logger.info('Executing AI rewrite with Claude agent...');
      const messages = await claudeClient.executeTask({
        prompt,
        maxTurns: 30,
      });
      if (messages.length > 0) {
        return messages;
      }
      logger.warn('Claude agent returned empty result. Trying Codex...');
    } catch (error: unknown) {
      logger.warn(`Claude agent failed: ${getErrorMessage(error)}. Trying Codex...`);
    }
  }

  // Step 2: Codex で試行
  if (codexClient) {
    try {
      logger.info('Executing AI rewrite with Codex agent...');
      const messages = await codexClient.executeTask({
        prompt,
        maxTurns: 30,
      });
      if (messages.length > 0) {
        return messages;
      }
      logger.warn('Codex agent returned empty result.');
    } catch (error: unknown) {
      logger.warn(`Codex agent failed: ${getErrorMessage(error)}`);
    }
  }

  throw new Error('Both Claude and Codex agents failed to generate PR body');
}

/**
 * generateAiRewrittenPrBody - AIエージェントを使ってレビュアー向けPRボディを生成する
 *
 * FR-003, FR-004, FR-005 に基づき、エージェントを呼び出してPRボディをファイルベースで生成し、
 * 失敗時はフォールバックチェーンに従って安全にリカバリーする。
 *
 * Issue #894: ファイルベース出力パターンへの変更
 * - エージェントにMarkdownファイルを直接出力させる
 * - ファイルから読み込んでPRボディとして使用する
 * - try-finally パターンで一時ファイルのクリーンアップを保証する
 *
 * @param metadataManager - メタデータマネージャー
 * @param options - CLIオプション
 * @param prNumber - PR番号
 * @param prClient - PullRequestClient インスタンス
 * @param collectedOutputs - 事前収集されたフェーズ成果物
 * @param fallbackBody - フォールバック用PRボディ（既存generateFinalPrBody出力）
 * @returns 生成されたPRボディ文字列
 */
async function generateAiRewrittenPrBody(
  metadataManager: MetadataManager,
  options: FinalizeCommandOptions,
  prNumber: number,
  prClient: ReturnType<GitHubClient['getPullRequestClient']>,
  collectedOutputs: CollectedPhaseOutputs,
  fallbackBody: string,
): Promise<string> {
  logger.info('Starting AI rewrite of PR body...');

  const issueNumber = parseInt(options.issue, 10);
  const language = metadataManager.getLanguage() || 'ja';
  const issueTitle = metadataManager.data.issue_title ?? 'Unknown';
  const repoDir = path.dirname(path.dirname(metadataManager.workflowDir));

  // Issue #894 Step 2: 出力ファイルパス生成
  const outputFilePath = generatePrBodyOutputFilePath();

  try {
    // Step 1: diff取得
    const diffContext = await getDiffForPrompt(prClient, prNumber);

    // Step 3: プロンプト構築（outputFilePath を渡す）
    const prompt = buildPromptContext(
      issueNumber,
      issueTitle,
      diffContext,
      collectedOutputs,
      language,
      outputFilePath,
    );

    // Step 4: エージェント初期化
    const homeDir = config.getHomeDir();
    const credentials = resolveAgentCredentials(homeDir, repoDir);
    const agentMode = options.agent ?? 'auto';
    const agentPriority: AgentPriority = 'claude-first';

    const { codexClient, claudeClient } = setupAgentClients(
      agentMode,
      repoDir,
      credentials,
      { agentPriority },
    );

    if (!codexClient && !claudeClient) {
      logger.warn('No agent credentials available. Falling back to default PR body.');
      return fallbackBody;
    }

    // Step 5: エージェント実行（フォールバック付き）
    // Issue #894: 戻り値の messages は使用しない（ファイルから読み込む）
    await executeAgentTask(
      prompt,
      claudeClient,
      codexClient,
    );

    // Issue #894 Step 6: ファイルからPRボディを読み込む
    let generatedBody = '';
    if (fs.existsSync(outputFilePath)) {
      generatedBody = fs.readFileSync(outputFilePath, 'utf-8').trim();
      logger.info(`Read AI-generated PR body from file: ${outputFilePath}`);
    } else {
      logger.warn(`AI agent output file not found: ${outputFilePath}. Falling back to default PR body.`);
      return fallbackBody;
    }

    // Issue #894 Step 7: 空ファイルチェック
    if (!generatedBody) {
      logger.warn('AI agent output file is empty. Falling back to default PR body.');
      return fallbackBody;
    }

    // Step 8: 必須セクション検証（変更なし）
    if (!validateRequiredSections(generatedBody, language)) {
      logger.warn('AI-generated PR body missing required sections. Falling back to default PR body.');
      return fallbackBody;
    }

    logger.info('AI rewrite of PR body completed successfully.');
    return generatedBody;
  } catch (error: unknown) {
    logger.warn(`AI rewrite failed: ${getErrorMessage(error)}. Falling back to default PR body.`);
    return fallbackBody;
  } finally {
    // Issue #894 Step 9: 一時ファイルのクリーンアップ
    try {
      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
        logger.debug(`Cleaned up output file: ${outputFilePath}`);
      }
    } catch (cleanupError: unknown) {
      logger.debug(`Failed to cleanup output file: ${getErrorMessage(cleanupError)}`);
    }
  }
}
