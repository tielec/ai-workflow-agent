/**
 * Dependency Messages
 *
 * 依存関係エラー/警告メッセージの生成を提供するヘルパーモジュール
 */

import type { PhaseName } from '../../types.js';

/**
 * エラーメッセージを構築
 *
 * @param phaseName - フェーズ名
 * @param missingDependencies - 未完了依存フェーズリスト
 * @param missingFiles - ファイル不在リスト
 * @returns ユーザーに分かりやすいエラーメッセージ
 */
export function buildErrorMessage(
  phaseName: PhaseName,
  missingDependencies: PhaseName[],
  missingFiles: Array<{ phase: PhaseName; file: string }>,
): string {
  let message = `[ERROR] Phase "${phaseName}" requires the following phases to be completed:\n`;

  // 未完了Phaseのリスト
  for (const dep of missingDependencies) {
    message += `  ✗ ${dep} - NOT COMPLETED\n`;
  }

  // ファイル不在のリスト
  for (const { phase, file } of missingFiles) {
    message += `  ✗ ${phase} - ${file} NOT FOUND\n`;
  }

  message += `\nOptions:\n`;
  message += `  1. Complete the missing phases first\n`;
  message += `  2. Use --phase all to run all phases\n`;
  message += `  3. Use --ignore-dependencies to proceed anyway (not recommended)\n`;

  return message;
}

/**
 * 警告メッセージを構築
 *
 * @param phaseName - フェーズ名
 * @param missingDependencies - 未完了依存フェーズリスト
 * @param missingFiles - ファイル不在リスト
 * @returns ユーザーに分かりやすい警告メッセージ
 */
export function buildWarningMessage(
  phaseName: PhaseName,
  missingDependencies: PhaseName[],
  missingFiles: Array<{ phase: PhaseName; file: string }>,
): string {
  let message = `[WARNING] Phase "${phaseName}" has unmet dependencies, but proceeding anyway...\n`;

  // 未完了Phaseのリスト
  for (const dep of missingDependencies) {
    message += `  ⚠ ${dep} - NOT COMPLETED\n`;
  }

  // ファイル不在のリスト
  for (const { phase, file } of missingFiles) {
    message += `  ⚠ ${phase} - ${file} NOT FOUND\n`;
  }

  return message;
}
