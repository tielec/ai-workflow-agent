import { SUPPORTED_LANGUAGES, type PhaseName, type SupportedLanguage } from '../../types.js';
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
   * スキップ対象フェーズリスト（未指定時は undefined）
   */
  skipPhases?: PhaseName[];

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

  /**
   * フォローアップ Issue 生成時の LLM モード
   */
  followupLlmMode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off';

  /**
   * フォローアップ Issue 生成時のモデル名
   */
  followupLlmModel?: string;

  /**
   * フォローアップ Issue 生成時のタイムアウト（ミリ秒）
   */
  followupLlmTimeout?: number;

  /**
   * フォローアップ Issue 生成時の最大リトライ回数
   */
  followupLlmMaxRetries?: number;

  /**
   * Issue 本文にメタデータを追記するかどうか
   */
  followupLlmAppendMetadata?: boolean;

  /**
   * ワークフロー完了時にコミットをスカッシュするかどうか（Issue #194）
   */
  squashOnComplete: boolean;

  /**
   * Claude モデル指定（エイリアスまたはフルモデルID）（Issue #301）
   */
  claudeModel?: string;

  /**
   * Codex モデル指定（エイリアスまたはフルモデルID）（Issue #302）
   */
  codexModel?: string;

  /**
   * 言語設定（パース済み）
   */
  language?: SupportedLanguage;
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

const VALID_PHASE_NAMES: readonly PhaseName[] = [
  'planning',
  'requirements',
  'design',
  'test_scenario',
  'implementation',
  'test_implementation',
  'test_preparation',
  'testing',
  'documentation',
  'report',
  'evaluation',
] as const;

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
  const skipPhases = parseSkipPhasesOption(options.skipPhases);
  const forceReset = Boolean(options.forceReset);
  const cleanupOnComplete = Boolean(options.cleanupOnComplete);
  const cleanupOnCompleteForce = Boolean(options.cleanupOnCompleteForce);

  const followupLlmModeRaw =
    typeof options.followupLlmMode === 'string' ? options.followupLlmMode.toLowerCase() : undefined;
  const followupLlmMode =
    followupLlmModeRaw && ['auto', 'openai', 'claude', 'agent', 'off'].includes(followupLlmModeRaw)
      ? (followupLlmModeRaw as 'auto' | 'openai' | 'claude' | 'agent' | 'off')
      : undefined;

  const followupLlmModel =
    typeof options.followupLlmModel === 'string' && options.followupLlmModel.trim().length > 0
      ? options.followupLlmModel.trim()
      : undefined;

  const followupLlmTimeout =
    options.followupLlmTimeout !== undefined && options.followupLlmTimeout !== null
      ? Number(options.followupLlmTimeout)
      : undefined;

  const followupLlmMaxRetries =
    options.followupLlmMaxRetries !== undefined && options.followupLlmMaxRetries !== null
      ? Number(options.followupLlmMaxRetries)
      : undefined;

  const followupLlmAppendMetadata =
    typeof options.followupLlmAppendMetadata === 'boolean'
      ? options.followupLlmAppendMetadata
      : options.followupLlmAppendMetadata !== undefined
      ? String(options.followupLlmAppendMetadata).toLowerCase() === 'true'
      : undefined;

  const squashOnComplete = Boolean(options.squashOnComplete);

  // Claude モデルの解析（Issue #301）
  const claudeModel =
    typeof options.claudeModel === 'string' && options.claudeModel.trim().length > 0
      ? options.claudeModel.trim()
      : undefined;

  // Codex モデルの解析（Issue #302）
  const codexModel =
    typeof options.codexModel === 'string' && options.codexModel.trim().length > 0
      ? options.codexModel.trim()
      : undefined;

  const language = parseLanguageOption(options.language);

  return {
    issueNumber,
    phaseOption,
    presetOption,
    agentMode,
    skipDependencyCheck,
    ignoreDependencies,
    skipPhases,
    forceReset,
    cleanupOnComplete,
    cleanupOnCompleteForce,
    followupLlmMode,
    followupLlmModel,
    followupLlmTimeout: Number.isFinite(followupLlmTimeout ?? NaN) ? followupLlmTimeout : undefined,
    followupLlmMaxRetries: Number.isFinite(followupLlmMaxRetries ?? NaN) ? followupLlmMaxRetries : undefined,
    followupLlmAppendMetadata,
    squashOnComplete,
    claudeModel,
    codexModel,
    language,
  };
}

/**
 * --skip-phases オプションをパース
 *
 * @param value - カンマ区切りのフェーズ名文字列
 * @returns パース済みフェーズ名配列、または undefined
 * @throws Error - 無効なフェーズ名や planning が含まれる場合
 */
function parseSkipPhasesOption(value: string | undefined): PhaseName[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (normalized === '') {
    return undefined;
  }

  const phases = normalized
    .split(',')
    .map((phase) => phase.trim().toLowerCase())
    .filter((phase) => phase.length > 0);

  if (phases.length === 0) {
    return undefined;
  }

  const invalidPhases = phases.filter(
    (phase) => !VALID_PHASE_NAMES.includes(phase as PhaseName),
  );
  if (invalidPhases.length > 0) {
    throw new Error(
      `Invalid phase names in --skip-phases: ${invalidPhases.join(', ')}. ` +
        `Valid phase names are: ${VALID_PHASE_NAMES.join(', ')}`,
    );
  }

  if (phases.includes('planning')) {
    throw new Error(
      'Planning phase cannot be skipped as all other phases depend on it.',
    );
  }

  return phases as PhaseName[];
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

  if (presetOption && typeof options.skipPhases === 'string' && options.skipPhases.trim().length > 0) {
    errors.push("Cannot use --preset and --skip-phases together. Use one or the other.");
  }

  if (options.followupLlmMode) {
    const mode = String(options.followupLlmMode).toLowerCase();
    const allowed = ['auto', 'openai', 'claude', 'agent', 'off'];
    if (!allowed.includes(mode)) {
      errors.push(
        "Option '--followup-llm-mode' must be one of: auto, openai, claude, agent, off.",
      );
    }
  }

  if (options.followupLlmTimeout !== undefined) {
    const timeout = Number(options.followupLlmTimeout);
    if (!Number.isFinite(timeout) || timeout < 0) {
      errors.push("Option '--followup-llm-timeout' must be a non-negative number.");
    }
  }

  if (options.followupLlmMaxRetries !== undefined) {
    const retries = Number(options.followupLlmMaxRetries);
    if (!Number.isInteger(retries) || retries < 0) {
      errors.push("Option '--followup-llm-max-retries' must be a non-negative integer.");
    }
  }

  const languageValidation = validateLanguageOption(options.language);
  if (!languageValidation.valid) {
    errors.push(...languageValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 言語オプションをパースして正規化
 *
 * @param value - CLIオプション --language の値
 * @returns 正規化された SupportedLanguage または未指定時は undefined
 * @throws Error - 許可されていない値が指定された場合
 */
export function parseLanguageOption(value: string | undefined): SupportedLanguage | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).toLowerCase().trim();
  if (normalized === '') {
    return undefined;
  }

  if (!SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) {
    throw new Error(
      `Invalid language option '${value}'. Allowed values: ${SUPPORTED_LANGUAGES.join(', ')}`
    );
  }

  return normalized as SupportedLanguage;
}

/**
 * 言語オプションのバリデーション
 *
 * @param value - 検証対象の値
 * @returns バリデーション結果
 */
export function validateLanguageOption(value: string | undefined): ValidationResult {
  const errors: string[] = [];

  if (value !== undefined && value !== null && value !== '') {
    const normalized = String(value).toLowerCase().trim();
    if (!SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) {
      errors.push(
        `Option '--language' must be one of: ${SUPPORTED_LANGUAGES.join(', ')}. Got: '${value}'`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
