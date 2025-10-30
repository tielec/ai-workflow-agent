import type { ExecuteCommandOptions } from '../../types/commands.js';

/**
 * 解析済みオプション
 *
 * ExecuteCommandOptions を正規化し、デフォルト値を補完した結果
 */
export interface ParsedExecuteOptions {
  /**
   * Issue番号
   */
  issueNumber: string;

  /**
   * フェーズオプション（"all" または具体的なフェーズ名）
   */
  phaseOption: string;

  /**
   * プリセットオプション（未指定時は undefined）
   */
  presetOption: string | undefined;

  /**
   * エージェントモード（'auto' | 'codex' | 'claude'）
   */
  agentMode: 'auto' | 'codex' | 'claude';

  /**
   * 依存関係チェックスキップフラグ
   */
  skipDependencyCheck: boolean;

  /**
   * 依存関係警告無視フラグ
   */
  ignoreDependencies: boolean;

  /**
   * メタデータリセットフラグ
   */
  forceReset: boolean;

  /**
   * 完了時クリーンアップフラグ
   */
  cleanupOnComplete: boolean;

  /**
   * クリーンアップ強制フラグ
   */
  cleanupOnCompleteForce: boolean;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  /**
   * バリデーション成功フラグ
   */
  valid: boolean;

  /**
   * エラーメッセージリスト（バリデーション失敗時）
   */
  errors: string[];
}

/**
 * ExecuteCommandOptions を正規化
 *
 * デフォルト値を補完し、型変換を行います。
 *
 * @param options - CLI オプション
 * @returns 解析済みオプション
 */
export function parseExecuteOptions(options: ExecuteCommandOptions): ParsedExecuteOptions {
  const issueNumber = String(options.issue);
  const phaseOption: string = (options.phase ?? 'all').toLowerCase();
  const presetOption: string | undefined = options.preset;

  // エージェントモードの正規化
  const agentModeRaw = typeof options.agent === 'string' ? options.agent.toLowerCase() : 'auto';
  const agentMode: 'auto' | 'codex' | 'claude' =
    agentModeRaw === 'codex' || agentModeRaw === 'claude' ? agentModeRaw : 'auto';

  const skipDependencyCheck = Boolean(options.skipDependencyCheck);
  const ignoreDependencies = Boolean(options.ignoreDependencies);
  const forceReset = Boolean(options.forceReset);
  const cleanupOnComplete = Boolean(options.cleanupOnComplete);
  const cleanupOnCompleteForce = Boolean(options.cleanupOnCompleteForce);

  return {
    issueNumber,
    phaseOption,
    presetOption,
    agentMode,
    skipDependencyCheck,
    ignoreDependencies,
    forceReset,
    cleanupOnComplete,
    cleanupOnCompleteForce,
  };
}

/**
 * 相互排他オプションを検証
 *
 * 以下の相互排他制約を検証します:
 * - '--preset' と '--phase' の同時指定禁止
 * - '--skip-dependency-check' と '--ignore-dependencies' の同時指定禁止
 * - '--issue' は必須
 * - '--phase' または '--preset' のいずれかが必須
 *
 * @param options - CLI オプション
 * @returns バリデーション結果
 */
export function validateExecuteOptions(options: ExecuteCommandOptions): ValidationResult {
  const errors: string[] = [];

  // 必須オプション検証: --issue
  if (!options.issue) {
    errors.push("Option '--issue' is required.");
  }

  const phaseOption: string = (options.phase ?? 'all').toLowerCase();
  const presetOption: string | undefined = options.preset;

  // 相互排他検証: --preset vs --phase
  if (presetOption && phaseOption !== 'all') {
    errors.push("Options '--preset' and '--phase' are mutually exclusive.");
  }

  // 必須オプション検証: --phase または --preset のいずれかが必須
  if (!phaseOption && !presetOption) {
    errors.push("Either '--phase' or '--preset' must be specified.");
  }

  // 相互排他検証: --skip-dependency-check vs --ignore-dependencies
  if (options.skipDependencyCheck && options.ignoreDependencies) {
    errors.push(
      "Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
