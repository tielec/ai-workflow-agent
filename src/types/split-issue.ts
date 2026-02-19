import type { SupportedLanguage } from '../types.js';

/**
 * split-issue コマンドのCLIオプション（生の入力）
 */
export interface RawSplitIssueOptions {
  /** Issue番号（文字列または数値） */
  issue?: string | number;
  /** 出力言語 */
  language?: string;
  /** 使用エージェント */
  agent?: string;
  /** dry-runモード（明示的に指定された場合） */
  dryRun?: boolean;
  /** 実際にIssueを作成するフラグ */
  apply?: boolean;
  /** 分割Issueの最大数 */
  maxSplits?: string | number;
}

/**
 * パース済み split-issue オプション
 */
export interface SplitIssueOptions {
  /** Issue番号 */
  issueNumber: number;
  /** 出力言語 */
  language: SupportedLanguage;
  /** 使用エージェント */
  agent: 'auto' | 'codex' | 'claude';
  /** 実際にIssueを作成するかどうか（false = dry-run） */
  apply: boolean;
  /** 分割Issueの最大数（1〜20、デフォルト: 10） */
  maxSplits: number;
}

/**
 * 分割された子Issue 1件分の情報
 */
export interface SplitIssueItem {
  /** 子Issueタイトル（80文字以内） */
  title: string;
  /** 子Issue本文（Markdown形式） */
  body: string;
  /** ラベル配列 */
  labels: string[];
  /** 優先度（high/medium/low） */
  priority: string;
  /** 依存する他の分割Issueのインデックス（0始まり） */
  dependencies: number[];
}

/**
 * エージェント出力のパース結果
 */
export interface SplitAgentResponse {
  /** 分割の概要説明 */
  summary: string;
  /** 分割されたIssue一覧 */
  issues: SplitIssueItem[];
  /** 品質メトリクス（オプショナル） */
  metrics?: SplitMetrics;
}

/**
 * 分割品質メトリクス
 */
export interface SplitMetrics {
  /**
   * 完全性スコア（0-100）
   * 元Issueの要件がどの程度カバーされているか
   */
  completenessScore: number;
  /**
   * 具体性スコア（0-100）
   * 各子Issueの記述がどの程度具体的か
   */
  specificityScore: number;
}

/**
 * split-issue コマンド全体の実行結果
 */
export interface SplitIssueResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 元Issueタイトル */
  originalTitle: string;
  /** 元Issue本文 */
  originalBody: string;
  /** 分割概要 */
  splitSummary: string;
  /** 分割されたIssue一覧 */
  splitIssues: SplitIssueItem[];
  /** 品質メトリクス */
  metrics: SplitMetrics;
  /** 作成されたIssueのURL一覧（apply時のみ） */
  createdIssueUrls?: string[];
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * 複数Issue一括作成の結果
 */
export interface BulkIssueResult {
  /** 全件成功なら true */
  success: boolean;
  /** 作成に成功したIssue情報 */
  created: Array<{
    issueNumber: number;
    issueUrl: string;
    title: string;
  }>;
  /** 作成に失敗したIssue情報 */
  failed: Array<{
    index: number;
    title: string;
    error: string;
  }>;
}
