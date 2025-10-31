/**
 * Rollback コマンドハンドラ（Issue #90）
 *
 * フェーズ差し戻し機能を実装するコマンドハンドラ。
 * - 差し戻し理由の読み込み（--reason、--reason-file、--interactive）
 * - メタデータ更新（rollback_context、rollback_history、フェーズステータス）
 * - ROLLBACK_REASON.md の生成
 * - 後続フェーズのリセット
 */

import fs from 'fs-extra';
import path from 'node:path';
import readline from 'node:readline';
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import { MetadataManager } from '../core/metadata-manager.js';
import { findWorkflowMetadata } from '../core/repository-utils.js';
import { PhaseName, StepName } from '../types.js';
import type { RollbackCommandOptions, RollbackContext, RollbackHistoryEntry } from '../types/commands.js';
import { getErrorMessage } from '../utils/error-utils.js';

/**
 * Rollback コマンドのエントリーポイント
 */
export async function handleRollbackCommand(options: RollbackCommandOptions): Promise<void> {
  logger.info('Starting rollback command...');

  // 1. メタデータ読み込み
  const { metadataManager, workflowDir } = await loadWorkflowMetadata(options.issue);

  // 2. バリデーション
  validateRollbackOptions(options, metadataManager);

  // 3. 差し戻し理由の読み込み
  const reason = await loadRollbackReason(options, workflowDir);

  // 4. 確認プロンプト（--force でスキップ）
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmRollback(
      options.toPhase,
      reason,
      metadataManager
    );

    if (!confirmed) {
      logger.info('Rollback cancelled.');
      return;
    }
  }

  // 5. ドライランモードの処理
  if (options.dryRun) {
    previewRollback(options, metadataManager, reason);
    return;
  }

  // 6. 差し戻し実行
  await executeRollback(
    options,
    metadataManager,
    workflowDir,
    reason
  );

  logger.info('Rollback completed successfully.');
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
 * Rollback オプションをバリデーション
 */
function validateRollbackOptions(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager
): void {
  // 1. to-phase の有効性チェック
  const validPhases: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];

  const toPhase = options.toPhase as PhaseName;
  if (!validPhases.includes(toPhase)) {
    throw new Error(
      `Invalid phase name: ${options.toPhase}. ` +
      `Use 'list-presets' command to see valid phase names.`
    );
  }

  // 2. to-step の有効性チェック
  const validSteps: StepName[] = ['execute', 'review', 'revise'];
  const toStep = (options.toStep ?? 'revise') as StepName;
  if (!validSteps.includes(toStep)) {
    throw new Error(
      `Invalid step: ${options.toStep}. ` +
      `Valid steps are: execute, review, revise.`
    );
  }

  // 3. 対象フェーズの状態チェック
  const phaseStatus = metadataManager.getPhaseStatus(toPhase);
  if (phaseStatus === 'pending') {
    throw new Error(
      `Cannot rollback to phase '${options.toPhase}' ` +
      `because it has not been started yet.`
    );
  }

  // 4. 差し戻し理由の提供チェック
  if (!options.reason && !options.reasonFile && !options.interactive) {
    throw new Error(
      'Rollback reason is required. ' +
      'Use --reason, --reason-file, or --interactive option.'
    );
  }
}

/**
 * 差し戻し理由を読み込む
 */
async function loadRollbackReason(
  options: RollbackCommandOptions,
  workflowDir: string
): Promise<string> {
  // 1. --reason オプション（直接指定）
  if (options.reason) {
    if (options.reason.trim().length === 0) {
      throw new Error('Rollback reason cannot be empty.');
    }

    if (options.reason.length > 1000) {
      throw new Error('Rollback reason must be 1000 characters or less.');
    }

    logger.info('Using rollback reason from --reason option');
    return options.reason.trim();
  }

  // 2. --reason-file オプション（ファイル読み込み）
  if (options.reasonFile) {
    const reasonFilePath = path.resolve(options.reasonFile);

    if (!fs.existsSync(reasonFilePath)) {
      throw new Error(`Reason file not found: ${reasonFilePath}`);
    }

    // ファイルサイズ上限チェック（100KB）
    const stats = fs.statSync(reasonFilePath);
    if (stats.size > 100 * 1024) {
      throw new Error('Reason file must be 100KB or less.');
    }

    const reason = fs.readFileSync(reasonFilePath, 'utf-8').trim();

    if (reason.length === 0) {
      throw new Error('Reason file is empty.');
    }

    logger.info(`Loaded rollback reason from file: ${reasonFilePath}`);
    return reason;
  }

  // 3. --interactive オプション（対話的入力）
  if (options.interactive) {
    return await promptUserForReason();
  }

  throw new Error('Rollback reason is required.');
}

/**
 * 確認プロンプトを表示
 */
async function confirmRollback(
  toPhase: string,
  reason: string,
  metadataManager: MetadataManager
): Promise<boolean> {
  // CI環境では自動的にスキップ
  if (config.isCI()) {
    logger.info('CI environment detected. Skipping confirmation prompt.');
    return true;
  }

  // 影響を受けるフェーズをリスト化
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase as PhaseName);
  const affectedPhases = phases.slice(toPhaseIndex);

  // 警告メッセージを表示
  logger.warn(`Rolling back to phase '${toPhase}' will reset the following phases:`);

  for (const phase of affectedPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.warn(`  - ${phase} (status: ${phaseData.status})`);
  }

  logger.warn('All progress in these phases will be lost.');
  logger.warn('');
  logger.warn(`Rollback reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  logger.warn('');

  // ユーザーに確認を求める
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('Do you want to continue? [y/N]: ', (answer: string) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * 対話的に差し戻し理由を入力
 */
async function promptUserForReason(): Promise<string> {
  logger.info('Please enter the rollback reason (press Ctrl+D when finished):');
  logger.info('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  return new Promise<string>((resolve, reject) => {
    rl.on('line', (line: string) => {
      lines.push(line);
    });

    rl.on('close', () => {
      const reason = lines.join('\n').trim();

      if (reason.length === 0) {
        reject(new Error('Rollback reason cannot be empty.'));
        return;
      }

      if (reason.length > 1000) {
        reject(new Error('Rollback reason must be 1000 characters or less.'));
        return;
      }

      resolve(reason);
    });
  });
}

/**
 * ドライランモードでプレビュー表示
 */
function previewRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  reason: string
): void {
  logger.info('[DRY RUN] Rollback preview:');
  logger.info('');

  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 対象フェーズの変更内容
  const phaseData = metadataManager.data.phases[toPhase];
  logger.info(`Target phase: ${toPhase}`);
  logger.info(`  status: ${phaseData.status} → in_progress`);
  logger.info(`  current_step: ${phaseData.current_step ?? 'null'} → ${toStep}`);
  logger.info(`  rollback_context: (new)`);
  logger.info(`    triggered_at: ${new Date().toISOString()}`);
  if (options.fromPhase) {
    logger.info(`    from_phase: ${options.fromPhase}`);
  }
  logger.info(`    reason: ${reason.slice(0, 100)}${reason.length > 100 ? '...' : ''}`);
  logger.info('');

  // 後続フェーズのリセット内容
  const phases = Object.keys(metadataManager.data.phases) as PhaseName[];
  const toPhaseIndex = phases.indexOf(toPhase);
  const subsequentPhases = phases.slice(toPhaseIndex + 1);

  logger.info('Subsequent phases to be reset:');
  for (const phase of subsequentPhases) {
    const phaseData = metadataManager.data.phases[phase];
    logger.info(`  - ${phase}: ${phaseData.status} → pending`);
  }
  logger.info('');

  // ROLLBACK_REASON.md の内容プレビュー
  logger.info('ROLLBACK_REASON.md content:');
  logger.info('---');
  logger.info(generateRollbackReasonMarkdown(options, reason));
  logger.info('---');
  logger.info('');

  logger.info('[DRY RUN] No changes were made. Remove --dry-run to execute.');
}

/**
 * 差し戻しを実行
 */
async function executeRollback(
  options: RollbackCommandOptions,
  metadataManager: MetadataManager,
  workflowDir: string,
  reason: string
): Promise<void> {
  const toPhase = options.toPhase as PhaseName;
  const toStep = (options.toStep ?? 'revise') as StepName;

  // 1. 差し戻しコンテキストを設定
  const rollbackContext: RollbackContext = {
    triggered_at: new Date().toISOString(),
    from_phase: options.fromPhase ?? null,
    from_step: null, // 将来的に自動検出を実装
    reason: reason,
    review_result: options.reasonFile ?? null,
    details: null, // ブロッカー情報抽出はP1機能として省略
  };

  metadataManager.setRollbackContext(toPhase, rollbackContext);
  logger.info(`Rollback context set for phase ${toPhase}`);

  // 2. 対象フェーズを更新
  metadataManager.updatePhaseForRollback(toPhase, toStep);
  logger.info(`Phase ${toPhase} updated: status=in_progress, current_step=${toStep}`);

  // 3. 後続フェーズをリセット
  const resetPhases = metadataManager.resetSubsequentPhases(toPhase);
  logger.info(`Reset subsequent phases: ${resetPhases.join(', ')}`);

  // 4. current_phase を更新
  metadataManager.data.current_phase = toPhase;
  metadataManager.save();

  // 5. ROLLBACK_REASON.md を生成
  const rollbackReasonMd = generateRollbackReasonMarkdown(options, reason);
  const phaseNumber = getPhaseNumber(toPhase);
  const rollbackReasonPath = path.join(
    workflowDir,
    `${phaseNumber}_${toPhase}`,
    'ROLLBACK_REASON.md'
  );

  fs.writeFileSync(rollbackReasonPath, rollbackReasonMd, 'utf-8');
  logger.info(`ROLLBACK_REASON.md generated: ${rollbackReasonPath}`);

  // 6. 差し戻し履歴を追加
  const historyEntry: RollbackHistoryEntry = {
    timestamp: rollbackContext.triggered_at,
    from_phase: options.fromPhase ?? null,
    from_step: null,
    to_phase: toPhase,
    to_step: toStep,
    reason: reason,
    triggered_by: 'manual',
    review_result_path: options.reasonFile ?? null,
  };

  metadataManager.addRollbackHistory(historyEntry);
  logger.info('Rollback history entry added');
}

/**
 * ROLLBACK_REASON.md を生成
 */
function generateRollbackReasonMarkdown(
  options: RollbackCommandOptions,
  reason: string
): string {
  const sections: string[] = [];

  const toPhase = options.toPhase;
  const phaseNumber = getPhaseNumber(toPhase as PhaseName);

  sections.push(`# Phase ${phaseNumber} (${toPhase}) への差し戻し理由`);
  sections.push('');

  if (options.fromPhase) {
    sections.push(`**差し戻し元**: Phase ${options.fromPhase}`);
  }
  sections.push(`**差し戻し日時**: ${new Date().toISOString()}`);
  sections.push('');

  sections.push('## 差し戻しの理由');
  sections.push('');
  sections.push(reason);
  sections.push('');

  if (options.reasonFile) {
    sections.push('### 参照ドキュメント');
    sections.push('');
    sections.push(`- レビュー結果: @${options.reasonFile}`);
    sections.push('');
  }

  sections.push('### 修正後の確認事項');
  sections.push('');
  sections.push('1. 差し戻し理由に記載された問題を修正');
  sections.push('2. ビルドが成功することを確認');
  sections.push('3. テストが成功することを確認（該当する場合）');
  sections.push('');

  return sections.join('\n');
}

/**
 * フェーズ番号を取得
 */
function getPhaseNumber(phase: PhaseName): string {
  const mapping: Record<PhaseName, string> = {
    planning: '00',
    requirements: '01',
    design: '02',
    test_scenario: '03',
    implementation: '04',
    test_implementation: '05',
    testing: '06',
    documentation: '07',
    report: '08',
    evaluation: '09',
  };
  return mapping[phase];
}
