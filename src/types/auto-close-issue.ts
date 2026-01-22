/**
 * auto-close-issue コマンド関連の型定義
 *
 * Issue検品・自動クローズ機能で使用されるデータ構造を定義します。
 */

/**
 * Issue検品カテゴリ
 */
export type IssueCategory = 'followup' | 'stale' | 'old' | 'all';

/**
 * エージェントの推奨アクション
 */
export type IssueRecommendation = 'close' | 'keep' | 'needs_discussion';

/**
 * auto-close-issue コマンドのCLIオプション（生の入力）
 */
export interface RawAutoCloseIssueOptions {
  /** 検品対象カテゴリ（文字列入力） */
  category?: string;
  /** 検品対象件数の上限（文字列でも可） */
  limit?: string;
  /** ドライラン指定（省略時は true が適用される） */
  dryRun?: boolean;
  /** close 推奨の信頼度しきい値（0.0-1.0） */
  confidenceThreshold?: string;
  /** 日数しきい値（stale/old 判定に使用） */
  daysThreshold?: string;
  /** close 推奨時に対話確認を挟むか */
  requireApproval?: boolean;
  /** 検品から除外するラベル（カンマ区切り） */
  excludeLabels?: string;
  /** 使用するエージェント */
  agent?: 'auto' | 'codex' | 'claude';
}

/**
 * auto-close-issue コマンドのパース済みオプション
 */
export interface AutoCloseIssueOptions {
  /** 検品対象カテゴリ（デフォルト: followup） */
  category: IssueCategory;
  /** 検品するIssue件数の上限（1-50、デフォルト: 10） */
  limit: number;
  /** ドライラン実行フラグ（デフォルト: true） */
  dryRun: boolean;
  /** close 推奨を採用するための信頼度しきい値（デフォルト: 0.7） */
  confidenceThreshold: number;
  /** stale/old 判定に使う経過日数（デフォルト: 90。old は2倍で判定） */
  daysThreshold: number;
  /** close 実行前に対話確認を挟むか（デフォルト: false） */
  requireApproval: boolean;
  /** 検品対象から除外するラベル一覧（デフォルト: do-not-close, pinned） */
  excludeLabels: string[];
  /** 検品・実行で使用するエージェント（auto|codex|claude） */
  agent: 'auto' | 'codex' | 'claude';
}

/**
 * Issue情報（検品対象）
 */
export interface IssueCandidate {
  number: number;
  title: string;
  body: string;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  url: string;
  comments?: CommentInfo[];
  parentIssue?: ParentIssueInfo;
}

/**
 * コメント情報
 */
export interface CommentInfo {
  author: string;
  body: string;
  createdAt: Date;
}

/**
 * 親Issue情報（FOLLOW-UP Issue用）
 */
export interface ParentIssueInfo {
  number: number;
  title: string;
  state: 'open' | 'closed';
}

/**
 * エージェントの検品結果（1件分）
 */
export interface InspectionResult {
  issueNumber: number;
  recommendation: IssueRecommendation;
  confidence: number;
  reasoning: string;
  closeComment?: string;
  suggestedActions?: string[];
}

/**
 * クローズ実行結果
 */
export interface CloseIssueResult {
  issueNumber: number;
  title: string;
  success: boolean;
  action: 'closed' | 'skipped' | 'previewed' | 'user_rejected' | 'error';
  error?: string;
  skipReason?: string;
  inspectionResult?: InspectionResult;
}

/**
 * 実行サマリー
 */
export interface ExecutionSummary {
  totalInspected: number;
  recommendedClose: number;
  actualClosed: number;
  skipped: number;
  errors: number;
}

/**
 * Issueフィルタリング用のオプション
 */
export interface FilterOptions {
  daysThreshold: number;
  excludeLabels: string[];
  limit: number;
}
