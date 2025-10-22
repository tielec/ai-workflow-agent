/**
 * Validation
 *
 * 共通バリデーション処理を提供するヘルパーモジュール
 */

import { PHASE_DEPENDENCIES } from '../phase-dependencies.js';
import type { PhaseName } from '../../types.js';

/**
 * フェーズ名を検証
 *
 * @param phase - フェーズ名候補
 * @returns 有効なフェーズ名ならtrue、無効ならfalse
 */
export function validatePhaseName(phase: string): boolean {
  return phase in PHASE_DEPENDENCIES;
}

/**
 * ステップ名を検証
 *
 * @param step - ステップ名候補
 * @returns 有効なステップ名ならtrue、無効ならfalse
 */
export function validateStepName(step: string): boolean {
  return ['execute', 'review', 'revise'].includes(step);
}

/**
 * Issue番号を検証
 *
 * @param issue - Issue番号候補（数値または文字列）
 * @returns 有効なIssue番号ならtrue、無効ならfalse
 */
export function validateIssueNumber(issue: number | string): boolean {
  if (typeof issue === 'number') {
    return issue > 0;
  }

  if (typeof issue === 'string') {
    const parsed = parseInt(issue, 10);
    return !isNaN(parsed) && parsed > 0;
  }

  return false;
}
