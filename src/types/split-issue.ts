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
  /** 分割数の上限 */
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
  /** 分割数の上限 */
  maxSplits: number;
}

/**
 * 分割された各子 Issue の情報
 */
export interface SplitIssueItem {
  title: string;
  body: string;
  labels: string[];
  priority: string;
  relatedFeatures: string[];
}

/**
 * エージェントからの応答
 */
export interface SplitAgentResponse {
  summary: string;
  issues: SplitIssueItem[];
  metrics?: SplitMetrics;
}

/**
 * 採点指標
 */
export interface SplitMetrics {
  /** 完全性スコア（0-100） */
  completenessScore: number;
  /** 具体性スコア（0-100） */
  specificityScore: number;
}

/**
 * split-issue コマンドの実行結果
 */
export interface SplitIssueResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 既存タイトル */
  originalTitle: string;
  /** 既存本文 */
  originalBody: string;
  /** 分割概要 */
  splitSummary: string;
  /** 分割されたIssue一覧 */
  splitIssues: SplitIssueItem[];
  /** 採点指標 */
  metrics: SplitMetrics;
  /** 作成されたIssue URL一覧（apply時のみ） */
  createdIssueUrls?: string[];
  /** エラーメッセージ（失敗時） */
  error?: string;
}
