/**
 * Cleanup コマンドハンドラ（Issue #212）
 *
 * ワークフローログクリーンアップを独立したコマンドとして実装。
 * - CLI引数解析（--issue, --dry-run, --phases, --all）
 * - バリデーション（Issue番号、フェーズ範囲、Evaluation完了チェック）
 * - クリーンアップ実行（ArtifactCleanerへの委譲）
 * - Git コミット＆プッシュ
 */

import * as fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { GitManager } from '../core/git-manager.js';
import { ArtifactCleaner } from '../phases/cleanup/artifact-cleaner.js';
import { findWorkflowMetadata } from '../core/repository-utils.js';
import { PhaseName } from '../types.js';
import { getErrorMessage } from '../utils/error-utils.js';

/**
 * CleanupCommandOptions - CLIオプションの型定義
 */
export interface CleanupCommandOptions {
  /** Issue番号（必須） */
  issue: string;

  /** ドライランフラグ（オプション） */
  dryRun?: boolean;

  /** フェーズ範囲（例: "0-4", "planning,requirements"） */
  phases?: string;

  /** 完全クリーンアップフラグ */
  all?: boolean;
}

/**
 * handleCleanupCommand - クリーンアップコマンドのエントリーポイント
 */
export async function handleCleanupCommand(options: CleanupCommandOptions): Promise<void> {
  logger.info('Starting cleanup command...');

  // 1. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(options.issue);

  // 2. バリデーション
  validateCleanupOptions(options, metadataManager);

  // 3. ドライランモード判定
  if (options.dryRun) {
    await previewCleanup(options, metadataManager);
    return;
  }

  // 4. クリーンアップ実行
  await executeCleanup(options, metadataManager, workflowDir);

  logger.info('Cleanup completed successfully.');
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
 * validateCleanupOptions - CLIオプションのバリデーション
 */
function validateCleanupOptions(
  options: CleanupCommandOptions,
  metadataManager: MetadataManager
): void {
  // 1. Issue番号チェック
  if (!options.issue) {
    throw new Error('Error: --issue option is required');
  }

  const issueNum = parseInt(options.issue, 10);
  if (isNaN(issueNum) || issueNum <= 0) {
    throw new Error(`Error: Invalid issue number: ${options.issue}. Must be a positive integer.`);
  }

  // 2. ワークフロー存在チェック（メタデータ読み込み済みなので省略可能だが、明示的に記載）
  // loadWorkflowMetadata() で既に確認済み

  // 3. フェーズ範囲チェック（--phases 指定時のみ）
  if (options.phases) {
    try {
      parsePhaseRange(options.phases);
    } catch (error) {
      throw new Error(`Error: ${getErrorMessage(error)}`);
    }
  }

  // 4. Evaluation完了チェック（--all 使用時のみ）
  if (options.all) {
    const evaluationStatus = metadataManager.getPhaseStatus('evaluation');

    if (evaluationStatus !== 'completed') {
      throw new Error(
        `Error: --all option requires Evaluation Phase to be completed. Current status: ${evaluationStatus}`
      );
    }
  }

  // 5. 排他制御（--phases と --all は同時に指定できない）
  if (options.phases && options.all) {
    throw new Error('Error: Cannot specify both --phases and --all options');
  }
}

/**
 * parsePhaseRange - フェーズ範囲文字列を解析してPhaseName配列に変換
 *
 * 例:
 * - "0-4" → ['planning', 'requirements', 'design', 'test_scenario', 'implementation']
 * - "planning,requirements" → ['planning', 'requirements']
 * - "planning" → ['planning']
 */
export function parsePhaseRange(rangeStr: string): PhaseName[] {
  if (!rangeStr || rangeStr.trim().length === 0) {
    throw new Error('Phase range cannot be empty');
  }

  const trimmed = rangeStr.trim();

  // フェーズ番号 → PhaseName のマッピング
  const phaseNumberToName: Record<number, PhaseName> = {
    0: 'planning',
    1: 'requirements',
    2: 'design',
    3: 'test_scenario',
    4: 'implementation',
    5: 'test_implementation',
    6: 'testing',
    7: 'documentation',
    8: 'report',
    9: 'evaluation',
  };

  const validPhaseNames: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  // パターン1: 数値範囲（例: "0-4"）
  const rangePattern = /^(\d+)-(\d+)$/;
  const rangeMatch = trimmed.match(rangePattern);

  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);

    // 範囲チェック
    if (start < 0 || start > 9 || end < 0 || end > 9) {
      throw new Error(`Invalid phase range: ${rangeStr}. Valid range is 0-9`);
    }

    // 逆順チェック
    if (start > end) {
      throw new Error(`Invalid phase range: ${rangeStr}. Start must be less than or equal to end.`);
    }

    // フェーズ名配列を生成
    const phaseNames: PhaseName[] = [];
    for (let i = start; i <= end; i++) {
      phaseNames.push(phaseNumberToName[i]);
    }

    return phaseNames;
  }

  // パターン2: フェーズ名リスト（例: "planning,requirements" または "planning"）
  const phaseList = trimmed.split(',').map(p => p.trim());

  const phaseNames: PhaseName[] = [];
  for (const phaseName of phaseList) {
    if (!validPhaseNames.includes(phaseName as PhaseName)) {
      throw new Error(`Invalid phase name: ${phaseName}`);
    }

    phaseNames.push(phaseName as PhaseName);
  }

  return phaseNames;
}

/**
 * executeCleanup - クリーンアップ実行
 */
async function executeCleanup(
  options: CleanupCommandOptions,
  metadataManager: MetadataManager,
  workflowDir: string
): Promise<void> {
  const artifactCleaner = new ArtifactCleaner(metadataManager);

  // 1. --all フラグ判定（完全クリーンアップ）
  if (options.all) {
    logger.info('Executing full cleanup (--all flag)...');

    // 確認プロンプト（CI環境ではスキップ）
    const force = false; // 常にプロンプト表示（CI環境は自動スキップ）
    await artifactCleaner.cleanupWorkflowArtifacts(force);

    // Git コミット＆プッシュ
    const gitManager = new GitManager(workflowDir, metadataManager);
    const issueNumber = parseInt(options.issue, 10);

    try {
      const commitResult = await gitManager.commitCleanupLogs(issueNumber, 'evaluation');
      if (!commitResult.success) {
        throw new Error(commitResult.error ?? 'Commit failed');
      }

      logger.info(`Cleanup committed: ${commitResult.commit_hash}`);

      const pushResult = await gitManager.pushToRemote();
      if (!pushResult.success) {
        throw new Error(pushResult.error ?? 'Push failed');
      }

      logger.info('Git commit and push completed');
    } catch (error) {
      logger.error(`Failed to commit and push changes: ${getErrorMessage(error)}`);
      throw error;
    }

    return;
  }

  // 2. 通常クリーンアップ（フェーズ範囲指定またはデフォルト）
  let phaseRange: PhaseName[] | undefined = undefined;

  if (options.phases) {
    phaseRange = parsePhaseRange(options.phases);
    logger.info(`Executing partial cleanup (phases: ${phaseRange.join(', ')})...`);
  } else {
    logger.info('Executing normal cleanup (all phases)...');
  }

  // クリーンアップ実行
  await artifactCleaner.cleanupWorkflowLogs(phaseRange);

  // Git コミット＆プッシュ
  const gitManager = new GitManager(workflowDir, metadataManager);
  const issueNumber = parseInt(options.issue, 10);

  try {
    const commitResult = await gitManager.commitCleanupLogs(issueNumber, 'report');
    if (!commitResult.success) {
      throw new Error(commitResult.error ?? 'Commit failed');
    }

    logger.info(`Cleanup committed: ${commitResult.commit_hash}`);

    const pushResult = await gitManager.pushToRemote();
    if (!pushResult.success) {
      throw new Error(pushResult.error ?? 'Push failed');
    }

    logger.info('Git commit and push completed');

    // 成功メッセージ
    if (phaseRange && phaseRange.length > 0) {
      logger.info(`Cleaned up phases ${phaseRange.join(', ')} successfully`);
    } else {
      logger.info('Workflow logs cleaned up successfully');
    }
  } catch (error) {
    logger.error(`Failed to commit and push changes: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * previewCleanup - ドライランモードでプレビュー表示
 */
async function previewCleanup(
  options: CleanupCommandOptions,
  metadataManager: MetadataManager
): Promise<void> {
  logger.info('[DRY RUN] Cleanup preview:');
  logger.info('');

  const workflowDir = metadataManager.workflowDir;

  // 削除対象フェーズの決定
  let phaseRange: PhaseName[] | undefined = undefined;

  if (options.all) {
    logger.info('Mode: Full cleanup (--all)');
    logger.info(`Target directory: ${workflowDir}`);
    logger.info('');
    logger.info('This will delete the entire workflow directory.');
  } else {
    if (options.phases) {
      phaseRange = parsePhaseRange(options.phases);
      logger.info(`Mode: Partial cleanup (phases: ${phaseRange.join(', ')})`);
    } else {
      logger.info('Mode: Normal cleanup (all phases)');
    }

    // 削除対象ファイルをスキャン
    const { fileCount, totalSize, fileList } = scanTargetFiles(workflowDir, phaseRange);

    logger.info('');
    logger.info('Files to be deleted:');
    logger.info('');

    // ファイル数が多い場合は一部のみ表示
    const maxDisplay = 20;
    const displayFiles = fileList.slice(0, maxDisplay);

    for (const file of displayFiles) {
      const sizeKB = (file.size / 1024).toFixed(2);
      logger.info(`  - ${file.path} (${sizeKB} KB)`);
    }

    if (fileList.length > maxDisplay) {
      logger.info(`  ... and ${fileList.length - maxDisplay} more files`);
    }

    logger.info('');
    logger.info(`Total: ${fileCount} files (${(totalSize / (1024 * 1024)).toFixed(2)} MB)`);
  }

  logger.info('');
  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}

/**
 * scanTargetFiles - 削除対象ファイルをスキャン
 */
function scanTargetFiles(
  workflowDir: string,
  phaseRange?: PhaseName[]
): { fileCount: number; totalSize: number; fileList: { path: string; size: number }[] } {
  const phaseNameToDir: Record<PhaseName, string> = {
    'planning': '00_planning',
    'requirements': '01_requirements',
    'design': '02_design',
    'test_scenario': '03_test_scenario',
    'implementation': '04_implementation',
    'test_implementation': '05_test_implementation',
    'testing': '06_testing',
    'documentation': '07_documentation',
    'report': '08_report',
    'evaluation': '09_evaluation',
  };

  const allPhaseDirs = Object.values(phaseNameToDir);

  let phaseDirs: string[];
  if (phaseRange && phaseRange.length > 0) {
    phaseDirs = phaseRange.map(phase => phaseNameToDir[phase]);
  } else {
    phaseDirs = allPhaseDirs;
  }

  let fileCount = 0;
  let totalSize = 0;
  const fileList: { path: string; size: number }[] = [];

  for (const phaseDir of phaseDirs) {
    const phasePath = path.join(workflowDir, phaseDir);

    if (!fs.existsSync(phasePath)) {
      continue;
    }

    // execute/review/revise ディレクトリをスキャン
    const dirsToRemove = ['execute', 'review', 'revise'];
    for (const dir of dirsToRemove) {
      const dirPath = path.join(phasePath, dir);

      if (!fs.existsSync(dirPath)) {
        continue;
      }

      // ディレクトリ内のファイルを再帰的にスキャン
      const files = scanDirectoryRecursive(dirPath);

      for (const file of files) {
        fileCount++;
        totalSize += file.size;
        fileList.push({
          path: path.relative(workflowDir, file.path),
          size: file.size,
        });
      }
    }
  }

  return { fileCount, totalSize, fileList };
}

/**
 * scanDirectoryRecursive - ディレクトリを再帰的にスキャン
 */
function scanDirectoryRecursive(dirPath: string): { path: string; size: number }[] {
  const files: { path: string; size: number }[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // 再帰的にスキャン
      const subFiles = scanDirectoryRecursive(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const stats = fs.statSync(fullPath);
      files.push({ path: fullPath, size: stats.size });
    }
  }

  return files;
}
