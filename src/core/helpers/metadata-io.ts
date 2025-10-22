/**
 * Metadata I/O
 *
 * メタデータファイルI/O操作を提供するヘルパーモジュール
 */

import fs from 'fs-extra';
import { resolve as resolvePath } from 'node:path';
import type { PhaseName } from '../../types.js';

/**
 * タイムスタンプをファイル名用にフォーマット
 *
 * @param date - Dateオブジェクト（オプション、デフォルトは現在時刻）
 * @returns YYYYMMDD_HHMMSS 形式の文字列
 */
export function formatTimestampForFilename(date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('') +
    '_' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('')
  );
}

/**
 * メタデータファイルをバックアップ
 *
 * @param metadataPath - metadata.jsonのパス
 * @returns バックアップファイルのパス
 * @throws ファイルが存在しない場合、fs-extraの例外をスロー
 */
export function backupMetadataFile(metadataPath: string): string {
  const timestamp = formatTimestampForFilename();
  const dirname = metadataPath.substring(0, metadataPath.lastIndexOf('/'));
  const backupPath = `${dirname}/metadata.json.backup_${timestamp}`;

  fs.copyFileSync(metadataPath, backupPath);
  console.info(`[INFO] metadata.json backup created: ${backupPath}`);

  return backupPath;
}

/**
 * ワークフローディレクトリを削除
 *
 * @param workflowDir - ワークフローディレクトリパス
 */
export function removeWorkflowDirectory(workflowDir: string): void {
  if (fs.existsSync(workflowDir)) {
    console.info(`[INFO] Removing workflow directory: ${workflowDir}`);
    fs.removeSync(workflowDir);
  }
}

/**
 * フェーズ出力ファイルのパスを取得
 *
 * @param phaseName - フェーズ名
 * @param workflowDir - ワークフローディレクトリパス
 * @returns 出力ファイルの絶対パス、または見つからない場合はnull
 */
export function getPhaseOutputFilePath(phaseName: PhaseName, workflowDir: string): string | null {
  const phaseNumberMap: Record<PhaseName, string> = {
    planning: '00_planning',
    requirements: '01_requirements',
    design: '02_design',
    test_scenario: '03_test_scenario',
    implementation: '04_implementation',
    test_implementation: '05_test_implementation',
    testing: '06_testing',
    documentation: '07_documentation',
    report: '08_report',
    evaluation: '09_evaluation',
  };

  const fileNameMap: Record<PhaseName, string> = {
    planning: 'planning.md',
    requirements: 'requirements.md',
    design: 'design.md',
    test_scenario: 'test-scenario.md',
    implementation: 'implementation.md',
    test_implementation: 'test-implementation.md',
    testing: 'test-result.md',
    documentation: 'documentation-update-log.md',
    report: 'report.md',
    evaluation: 'evaluation.md',
  };

  const phaseDir = phaseNumberMap[phaseName];
  const fileName = fileNameMap[phaseName];

  if (!phaseDir || !fileName) {
    return null;
  }

  return resolvePath(workflowDir, phaseDir, 'output', fileName);
}
