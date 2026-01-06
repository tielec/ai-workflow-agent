/**
 * 認証情報バリデーション関連の型定義
 *
 * バリデーションコマンドで使用するチェックカテゴリ、チェック結果、CLIオプションを定義します。
 *
 * @module validation-types
 */

/**
 * チェックカテゴリ
 */
export type CheckCategory = 'git' | 'github' | 'codex' | 'claude' | 'openai' | 'anthropic';

/**
 * チェック結果のステータス
 */
export type CheckStatus = 'passed' | 'failed' | 'warning' | 'skipped';

/**
 * カテゴリのステータス
 */
export type CategoryStatus = 'passed' | 'failed' | 'warning';

/**
 * 個別チェック結果
 */
export interface ValidationCheck {
  /** チェック項目名 */
  name: string;
  /** ステータス */
  status: CheckStatus;
  /** 値（マスキング済み） */
  value?: string;
  /** メッセージ（詳細情報） */
  message?: string;
}

/**
 * カテゴリ単位の結果
 */
export interface CategoryResult {
  /** カテゴリのステータス */
  status: CategoryStatus;
  /** 個別チェック結果のリスト */
  checks: ValidationCheck[];
}

/**
 * バリデーションサマリー
 */
export interface ValidationSummary {
  /** 総チェック数 */
  total: number;
  /** 成功数 */
  passed: number;
  /** 失敗数 */
  failed: number;
  /** 警告数 */
  warnings: number;
  /** スキップ数 */
  skipped: number;
}

/**
 * 全体のバリデーション結果（JSON出力用）
 */
export interface ValidationResult {
  /** タイムスタンプ（ISO8601 UTC） */
  timestamp: string;
  /** カテゴリごとの結果 */
  results: {
    git?: CategoryResult;
    github?: CategoryResult;
    codex?: CategoryResult;
    claude?: CategoryResult;
    openai?: CategoryResult;
    anthropic?: CategoryResult;
  };
  /** サマリー */
  summary: ValidationSummary;
}

/**
 * CLIオプション（生の入力）
 */
export interface RawValidateCredentialsOptions {
  check?: string;
  verbose?: boolean;
  output?: string;
  exitOnError?: boolean;
}

/**
 * CLIオプション（パース済み）
 */
export interface ValidateCredentialsOptions {
  /** チェックするカテゴリ */
  check: CheckCategory | 'all';
  /** 詳細出力モード */
  verbose: boolean;
  /** 出力フォーマット */
  output: 'text' | 'json';
  /** 失敗時に exit code 1 を返すか */
  exitOnError: boolean;
}

/**
 * チェッカーインターフェース
 */
export interface Checker {
  /** カテゴリ名 */
  category: CheckCategory;
  /** チェック実行 */
  check(verbose: boolean): Promise<CategoryResult>;
}
