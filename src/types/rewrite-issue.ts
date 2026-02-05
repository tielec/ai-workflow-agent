import type { SupportedLanguage } from '../types.js';

/**
 * rewrite-issue コマンドのCLIオプション（生の入力）
 */
export interface RawRewriteIssueOptions {
  /** Issue番号（文字列または数値） */
  issue?: string | number;
  /** 出力言語 */
  language?: string;
  /** 使用エージェント */
  agent?: string;
  /** dry-runモード（明示的に指定された場合） */
  dryRun?: boolean;
  /** 実際にIssueを更新するフラグ */
  apply?: boolean;
}

/**
 * パース済み rewrite-issue オプション
 */
export interface RewriteIssueOptions {
  /** Issue番号 */
  issueNumber: number;
  /** 出力言語 */
  language: SupportedLanguage;
  /** 使用エージェント */
  agent: 'auto' | 'codex' | 'claude';
  /** 実際にIssueを更新するかどうか（false = dry-run） */
  apply: boolean;
}

/**
 * Issue再設計の入力データ
 */
export interface RewriteIssueInput {
  /** 既存のタイトル */
  originalTitle: string;
  /** 既存の本文 */
  originalBody: string;
  /** リポジトリコンテキスト（コード構造、依存関係など） */
  repositoryContext: string;
  /** Issue URL */
  issueUrl: string;
}

/**
 * エージェントからの応答
 */
export interface RewriteAgentResponse {
  /** 新しいタイトル */
  newTitle: string;
  /** 新しい本文 */
  newBody: string;
  /** 採点指標（オプショナル） */
  metrics?: RewriteMetrics;
}

/**
 * 採点指標
 */
export interface RewriteMetrics {
  /**
   * 完全性スコア（0-100）
   * Issue本文に必要なセクション（概要、再現手順、期待結果等）の網羅率
   */
  completenessScore: number;
  /**
   * 具体性スコア（0-100）
   * 具体的な情報（ファイル名、行番号、コード例等）の含有率
   */
  specificityScore: number;
}

/**
 * Issue再設計結果
 */
export interface RewriteIssueResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 既存タイトル */
  originalTitle: string;
  /** 既存本文 */
  originalBody: string;
  /** 新タイトル */
  newTitle: string;
  /** 新本文 */
  newBody: string;
  /** 採点指標 */
  metrics: RewriteMetrics;
  /** unified diff形式の差分 */
  diff: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * Issue更新結果
 */
export interface UpdateIssueResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 更新後のIssue URL */
  issueUrl?: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
}
