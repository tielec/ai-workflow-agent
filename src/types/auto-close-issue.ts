/**
 * auto-close-issue コマンドの型定義
 */

/**
 * フィルタカテゴリ型
 */
export type IssueCategory = 'followup' | 'stale' | 'old' | 'all';

/**
 * CLIオプション型
 */
export interface AutoCloseIssueOptions {
  /**
   * フィルタカテゴリ
   * - followup: タイトルが [FOLLOW-UP] で始まる
   * - stale: 最終更新から90日以上経過
   * - old: 作成から180日以上経過
   * - all: 全てのオープンIssue
   */
  category: IssueCategory;

  /**
   * 処理するIssue上限（1-50）
   */
  limit: number;

  /**
   * dry-runモード（実際にはクローズしない）
   */
  dryRun: boolean;

  /**
   * クローズ判定の信頼度閾値（0.0-1.0）
   */
  confidenceThreshold: number;

  /**
   * stale/old判定の日数閾値
   */
  daysThreshold: number;

  /**
   * 対話的確認を要求
   */
  requireApproval: boolean;

  /**
   * 除外するラベル（カンマ区切り）
   */
  excludeLabels: string[];

  /**
   * 使用エージェント（auto|codex|claude）
   */
  agent: 'auto' | 'codex' | 'claude';
}

/**
 * エージェント出力型（検品結果）
 */
export interface InspectionResult {
  /**
   * Issue番号
   */
  issue_number: number;

  /**
   * 推奨アクション
   * - close: クローズ推奨
   * - keep: 継続推奨
   * - needs_discussion: 議論が必要
   */
  recommendation: 'close' | 'keep' | 'needs_discussion';

  /**
   * 信頼度スコア（0.0-1.0）
   */
  confidence: number;

  /**
   * 判定理由の詳細説明
   */
  reasoning: string;

  /**
   * クローズ時に投稿するコメント（推奨の場合）
   */
  close_comment: string;

  /**
   * 代替アクションの提案（あれば）
   */
  suggested_actions: string[];
}

/**
 * 検品オプション型
 */
export interface InspectionOptions {
  /**
   * クローズ判定の信頼度閾値（0.0-1.0）
   */
  confidenceThreshold: number;

  /**
   * 除外するラベル
   */
  excludeLabels: string[];

  /**
   * エージェント選択（auto|codex|claude）
   */
  agent: 'auto' | 'codex' | 'claude';
}

/**
 * Issue詳細情報型
 */
export interface IssueDetails {
  /**
   * Issue基本情報
   */
  issue: Issue;

  /**
   * コメント履歴
   */
  comments: IssueComment[];

  /**
   * 関連PR情報（Phase 2で実装予定）
   */
  relatedPRs?: PullRequest[];
}

/**
 * Issueコメント型
 */
export interface IssueComment {
  /**
   * コメントID
   */
  id: number;

  /**
   * 作者
   */
  author: string;

  /**
   * 作成日時
   */
  created_at: string;

  /**
   * コメント本文
   */
  body: string;
}

/**
 * Issue型（簡易版）
 */
export interface Issue {
  /**
   * Issue番号
   */
  number: number;

  /**
   * タイトル
   */
  title: string;

  /**
   * 本文
   */
  body: string | null;

  /**
   * ラベル
   */
  labels: Array<{ name: string }>;

  /**
   * 作成日時
   */
  created_at: string;

  /**
   * 最終更新日時
   */
  updated_at: string;

  /**
   * ステータス
   */
  state: 'open' | 'closed';
}

/**
 * PullRequest型（簡易版、Phase 2で実装予定）
 */
export interface PullRequest {
  /**
   * PR番号
   */
  number: number;

  /**
   * タイトル
   */
  title: string;

  /**
   * ステータス
   */
  state: 'open' | 'closed' | 'merged';

  /**
   * 作成日時
   */
  created_at: string;

  /**
   * マージ日時
   */
  merged_at: string | null;
}

/**
 * プロンプト変数型
 */
export interface PromptVariables {
  /**
   * Issue情報（フォーマット済み）
   */
  issue_info: string;

  /**
   * 関連情報（フォーマット済み）
   */
  related_info: string;

  /**
   * コードベース情報（フォーマット済み）
   */
  codebase_info: string;
}

/**
 * クローズ履歴エントリ型
 */
export interface CloseHistoryEntry {
  /**
   * クローズ日時
   */
  timestamp: string;

  /**
   * Issue番号
   */
  issue_number: number;

  /**
   * Issueタイトル
   */
  issue_title: string;

  /**
   * 検品カテゴリ
   */
  category: IssueCategory;

  /**
   * エージェント推奨
   */
  recommendation: 'close' | 'keep' | 'needs_discussion';

  /**
   * 信頼度スコア
   */
  confidence: number;

  /**
   * 判定理由
   */
  reasoning: string;

  /**
   * クローズコメント
   */
  close_comment: string;
}
