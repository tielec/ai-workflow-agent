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
  /** JSON出力ファイルパス（オプション） */
  outputFile?: string;
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
  /** JSON出力ファイルパス（オプション、絶対パスに解決済み） */
  outputFile?: string;
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

/**
 * split-issueコマンドのJSON出力スキーマ
 */
export interface SplitIssueJsonOutput {
  /** 実行情報 */
  execution: SplitIssueExecutionInfo;
  /** 分割結果サマリー */
  summary: SplitIssueSummaryInfo;
  /** 分割されたIssue一覧 */
  issues: SplitIssueEntry[];
  /** 分割品質メトリクス */
  metrics: {
    completenessScore: number;
    specificityScore: number;
  };
}

/**
 * JSON出力用の実行情報
 */
export interface SplitIssueExecutionInfo {
  /** 実行タイムスタンプ（ISO8601 UTC形式） */
  timestamp: string;
  /** 対象リポジトリ（owner/repo形式） */
  repository: string;
  /** 分割対象のIssue番号 */
  issueNumber: number;
  /** 出力言語（"ja" | "en"） */
  language: string;
  /** 実際にIssueを作成したかどうか */
  apply: boolean;
  /** dry-runモードかどうか */
  dryRun: boolean;
  /** 分割数の上限設定 */
  maxSplits: number;
}

/**
 * JSON出力用の分割結果サマリー
 */
export interface SplitIssueSummaryInfo {
  /** 元IssueのタイトルText */
  originalTitle: string;
  /** エージェントが生成した分割概要 */
  splitSummary: string;
  /** 分割されたIssueの総数 */
  totalSplitIssues: number;
  /** 実際にGitHub上に作成されたIssue数 */
  createdCount: number;
  /** 作成に失敗したIssue数 */
  failedCount: number;
}

/**
 * JSON出力用の各子Issue詳細
 */
export interface SplitIssueEntry {
  /** 子Issueのタイトル */
  title: string;
  /** 子Issueの本文 */
  body: string;
  /** ラベル一覧 */
  labels: string[];
  /** 優先度 */
  priority: string;
  /** 関連する他の分割Issueタイトル */
  relatedFeatures: string[];
  /** 作成されたIssue番号（apply時のみ） */
  issueNumber?: number;
  /** 作成されたIssue URL（apply時のみ） */
  issueUrl?: string;
}
