/**
 * PRコメント自動対応機能の型定義
 * Issue #383
 */

/**
 * コメント対応ステータス
 */
export type CommentResolutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'failed';

/**
 * 対応タイプ
 */
export type ResolutionType = 'code_change' | 'reply' | 'discussion' | 'skip';

/**
 * 信頼度レベル
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Analyzerエラー種別
 */
export type AnalyzerErrorType =
  | 'agent_execution_error'
  | 'agent_empty_output'
  | 'json_parse_error'
  | 'validation_error';

/**
 * ファイル変更タイプ
 */
export type FileChangeType = 'modify' | 'create' | 'delete';

/**
 * ファイル変更内容
 */
export interface FileChange {
  /** ファイルパス（リポジトリルートからの相対パス） */
  path: string;

  /** 変更タイプ */
  change_type: FileChangeType;

  /** 新しい内容（create/modify の場合） */
  content?: string;

  /** 差分（modify の場合、オプション） */
  diff?: string;

  /** 変更開始行（modify の場合、オプション） */
  start_line?: number;

  /** 変更終了行（modify の場合、オプション） */
  end_line?: number;
}

/**
 * 対応内容
 */
export interface CommentResolution {
  /** 対応タイプ */
  type: ResolutionType;

  /** 信頼度 */
  confidence: ConfidenceLevel;

  /** ファイル変更リスト（type === 'code_change' の場合） */
  changes?: FileChange[];

  /** 返信コメント */
  reply: string;

  /** スキップ理由（type === 'skip' の場合） */
  skip_reason?: string;

  /** 分析メモ（内部用） */
  analysis_notes?: string;
}

/**
 * レビューコメント情報
 */
export interface ReviewComment {
  /** コメントID（REST API） */
  id: number;

  /** コメントノードID（GraphQL用） */
  node_id: string;

  /** スレッドID（GraphQL用、解決時に必要） */
  thread_id?: string;

  /** 対象ファイルパス */
  path: string;

  /** 対象行番号（単一行の場合） */
  line?: number | null;

  /** 対象開始行（範囲の場合） */
  start_line?: number | null;

  /** 対象終了行（範囲の場合） */
  end_line?: number | null;

  /** コメント本文 */
  body: string;

  /** コメント投稿者 */
  user: string;

  /** 作成日時 */
  created_at: string;

  /** 更新日時 */
  updated_at: string;

  /** PR内での差分コンテキスト（オプション） */
  diff_hunk?: string;

  /** 返信先コメントID（返信の場合） */
  in_reply_to_id?: number;

  /** PR番号（返信投稿時に使用） */
  pr_number?: number;
}

/**
 * コメントメタデータ（個別コメントの処理状態）
 */
export interface CommentMetadata {
  /** コメント情報 */
  comment: ReviewComment;

  /** 処理ステータス */
  status: CommentResolutionStatus;

  /** 処理開始日時 */
  started_at: string | null;

  /** 処理完了日時 */
  completed_at: string | null;

  /** リトライ回数 */
  retry_count: number;

  /** 対応内容（処理完了後） */
  resolution: CommentResolution | null;

  /** 投稿した返信コメントID */
  reply_comment_id: number | null;

  /** 解決日時（finalize後） */
  resolved_at: string | null;

  /** エラーメッセージ（失敗時） */
  error: string | null;
}

/**
 * PR情報
 */
export interface PRInfo {
  /** PR番号 */
  number: number;

  /** PR URL */
  url: string;

  /** PRタイトル */
  title: string;

  /** PRブランチ（head） */
  branch: string;

  /** ベースブランチ */
  base_branch: string;

  /** PR状態 */
  state: 'open' | 'closed' | 'merged';
}

/**
 * リポジトリ情報
 */
export interface RepositoryInfo {
  /** オーナー */
  owner: string;

  /** リポジトリ名 */
  repo: string;

  /** ローカルパス */
  path: string;

  /** リモートURL */
  remote_url: string;
}

/**
 * コスト追跡情報
 */
export interface CostTracking {
  /** 入力トークン総数 */
  total_input_tokens: number;

  /** 出力トークン総数 */
  total_output_tokens: number;

  /** 概算コスト（USD） */
  total_cost_usd: number;
}

/**
 * サマリー情報
 */
export interface ResolutionSummary {
  /** 総コメント数 */
  total: number;

  /** 各ステータスの件数 */
  by_status: {
    pending: number;
    in_progress: number;
    completed: number;
    skipped: number;
    failed: number;
  };

  /** 各対応タイプの件数（completed のみ） */
  by_type: {
    code_change: number;
    reply: number;
    discussion: number;
    skip: number;
  };
}

/**
 * コメント対応メタデータ（メインファイル構造）
 */
export interface CommentResolutionMetadata {
  /** メタデータバージョン */
  version: string;

  /** PR情報 */
  pr: PRInfo;

  /** リポジトリ情報 */
  repository: RepositoryInfo;

  /** 関連Issue番号（オプション） */
  issue_number?: number;

  /** コメントメタデータマップ（キー: コメントID） */
  comments: Record<string, CommentMetadata>;

  /** サマリー（自動計算） */
  summary: ResolutionSummary;

  /** コスト追跡 */
  cost_tracking: CostTracking;

  /** 作成日時 */
  created_at: string;

  /** 更新日時 */
  updated_at: string;

  /** analyzeフェーズ完了日時 */
  analyze_completed_at?: string | null;

  /** executeフェーズ完了日時 */
  execute_completed_at?: string | null;

  /** response-plan.md パス */
  response_plan_path?: string | null;

  /** execution-result.md パス */
  execution_result_path?: string | null;

  /** analyzeに使用したエージェント */
  analyzer_agent?: string | null;

  /** analyzerエラーメッセージ（フォールバック使用時など） */
  analyzer_error?: string | null;

  /** analyzerエラー種別（フォールバック使用時など） */
  analyzer_error_type?: AnalyzerErrorType | null;
}

export interface PRCommentAnalyzeOptions {
  pr: string;
  commentIds?: string;
  dryRun?: boolean;
  agent?: 'auto' | 'codex' | 'claude';
}

export interface ProposedChange {
  action: 'modify' | 'create' | 'delete';
  file: string;
  line_range?: string;
  changes: string;
}

export interface ResponsePlanComment {
  comment_id: string;
  file?: string;
  line?: number | null;
  author?: string;
  body?: string;
  type: ResolutionType;
  confidence: ConfidenceLevel;
  rationale?: string;
  proposed_changes?: ProposedChange[];
  reply_message: string;
}

export interface ResponsePlan {
  pr_number: number;
  analyzed_at: string;
  analyzer_agent: string;
  comments: ResponsePlanComment[];
}

export type ExecutionStatus = 'completed' | 'skipped' | 'failed';

export interface ExecutionResultComment {
  comment_id: string;
  status: ExecutionStatus;
  type: ResolutionType;
  actions?: string[];
  error?: string | null;
  reply_comment_id?: number | null;
  reply_message?: string;
  changes?: FileChange[];
}

export interface ExecutionResult {
  pr_number: number;
  executed_at: string;
  source_plan: string;
  comments: ExecutionResultComment[];
}

/**
 * エージェント分析結果（JSONパース用）
 */
export interface AgentAnalysisResult {
  /** 対応タイプ */
  type: ResolutionType;

  /** 信頼度 */
  confidence: ConfidenceLevel;

  /** ファイル変更リスト */
  changes?: Array<{
    path: string;
    change_type: FileChangeType;
    content?: string;
    diff?: string;
    start_line?: number;
    end_line?: number;
  }>;

  /** 返信コメント */
  reply: string;

  /** スキップ理由 */
  skip_reason?: string;

  /** 分析メモ */
  analysis_notes?: string;
}

/**
 * コード変更適用結果
 */
export interface ChangeApplyResult {
  /** 成功フラグ */
  success: boolean;

  /** 適用したファイルリスト */
  applied_files: string[];

  /** スキップしたファイルリスト（セキュリティ上の理由等） */
  skipped_files: Array<{
    path: string;
    reason: string;
  }>;

  /** エラーメッセージ */
  error?: string;
}
