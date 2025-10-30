import type { PhaseName } from '../../types.js';
import type { PhaseContext, ExecutionSummary, PhaseResultMap } from '../../types/commands.js';
import type { GitManager } from '../../core/git-manager.js';

import { getErrorMessage } from '../../utils/error-utils.js';
import { createPhaseInstance } from '../../core/phase-factory.js';

/**
 * フェーズ順序定義
 */
const PHASE_ORDER: PhaseName[] = [
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

/**
 * フェーズを順次実行
 *
 * 指定されたフェーズリストを依存関係順に順次実行します。
 * フェーズ実行失敗時は即座に ExecutionSummary を返し、後続フェーズは実行されません。
 *
 * @param phases - 実行するフェーズリスト
 * @param context - フェーズ実行コンテキスト
 * @param gitManager - Git管理インスタンス
 * @param cleanupOnComplete - 完了時クリーンアップフラグ
 * @param cleanupOnCompleteForce - クリーンアップ強制フラグ
 * @returns 実行サマリー
 */
export async function executePhasesSequential(
  phases: PhaseName[],
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary> {
  const results: PhaseResultMap = {} as PhaseResultMap;

  for (const phaseName of phases) {
    try {
      // フェーズインスタンス生成
      const phaseInstance = createPhaseInstance(phaseName, context);

      // フェーズ実行
      const success = await phaseInstance.run({
        gitManager,
        cleanupOnComplete,
        cleanupOnCompleteForce,
      });

      results[phaseName] = { success };

      if (!success) {
        // フェーズ実行失敗
        return {
          success: false,
          failedPhase: phaseName,
          error: `Phase ${phaseName} failed.`,
          results,
        };
      }
    } catch (error) {
      // フェーズ実行中に例外スロー
      results[phaseName] = { success: false, error: getErrorMessage(error) };
      return {
        success: false,
        failedPhase: phaseName,
        error: getErrorMessage(error),
        results,
      };
    }
  }

  // 全フェーズ成功
  return { success: true, results };
}

/**
 * 特定フェーズから実行
 *
 * PHASE_ORDER から startPhase 以降のフェーズを抽出し、executePhasesSequential() に委譲します。
 * レジューム機能で使用されます。
 *
 * @param startPhase - 開始フェーズ
 * @param context - フェーズ実行コンテキスト
 * @param gitManager - Git管理インスタンス
 * @param cleanupOnComplete - 完了時クリーンアップフラグ
 * @param cleanupOnCompleteForce - クリーンアップ強制フラグ
 * @returns 実行サマリー
 */
export async function executePhasesFrom(
  startPhase: PhaseName,
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary> {
  const startIndex = PHASE_ORDER.indexOf(startPhase);

  if (startIndex === -1) {
    // 未知のフェーズ名
    return {
      success: false,
      failedPhase: startPhase,
      error: `Unknown phase: ${startPhase}`,
      results: {} as PhaseResultMap,
    };
  }

  // startPhase 以降のフェーズを抽出
  const remainingPhases = PHASE_ORDER.slice(startIndex);

  // executePhasesSequential() に委譲
  return executePhasesSequential(
    remainingPhases,
    context,
    gitManager,
    cleanupOnComplete,
    cleanupOnCompleteForce,
  );
}
