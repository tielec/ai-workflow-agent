import type { SupportedLanguage } from '../types.js';

/**
 * CLI入力の生データ型（commander からの直接入力）
 */
export interface RawCreateSubIssueOptions {
  /** 親Issue番号（文字列または数値） */
  parentIssue?: string | number;
  /** 不具合内容・タスク概要 */
  description?: string;
  /** Issue種別 */
  type?: string;
  /** 出力言語 */
  language?: string;
  /** 使用エージェント */
  agent?: string;
  /** 実際にIssueを作成するフラグ */
  apply?: boolean;
  /** dry-runモード */
  dryRun?: boolean;
  /** カンマ区切りのラベル */
  labels?: string;
  /** AIへの追加指示 */
  customInstruction?: string;
}

/**
 * パース済み・バリデーション済みオプション
 */
export interface CreateSubIssueOptions {
  /** 親Issue番号 */
  parentIssueNumber: number;
  /** 不具合内容・タスク概要 */
  description: string;
  /** Issue種別 */
  type: 'bug' | 'task' | 'enhancement';
  /** 出力言語 */
  language: SupportedLanguage;
  /** 使用エージェント */
  agent: 'auto' | 'codex' | 'claude';
  /** 実際にIssueを作成するかどうか（false = dry-run） */
  apply: boolean;
  /** ユーザー指定ラベル */
  labels?: string[];
  /** AIへの追加指示 */
  customInstruction?: string;
}

/**
 * エージェント出力のJSON型
 */
export interface SubIssueAgentResponse {
  /** サブIssueのタイトル（80文字以内） */
  title: string;
  /** サブIssueの本文（Markdown形式） */
  body: string;
  /** 提案ラベル */
  labels: string[];
  /** 品質メトリクス */
  metrics?: {
    /** 完全性スコア（0-100） */
    completeness: number;
    /** 具体性スコア（0-100） */
    specificity: number;
  };
}

/**
 * コマンド実行結果型
 */
export interface CreateSubIssueResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 親Issue番号 */
  parentIssueNumber: number;
  /** 親Issueタイトル */
  parentIssueTitle: string;
  /** サブIssue情報（エージェント生成） */
  subIssue: SubIssueAgentResponse;
  /** 作成されたIssueのURL（apply時のみ） */
  createdIssueUrl?: string;
  /** 作成されたIssue番号（apply時のみ） */
  createdIssueNumber?: number;
  /** Sub-Issue紐づけ成功フラグ（apply時のみ） */
  subIssueLinkSuccess?: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}
