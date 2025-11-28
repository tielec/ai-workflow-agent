/**
 * auto-issue コマンド関連の型定義
 *
 * このモジュールは、自動Issue作成機能で使用されるデータ構造を定義します。
 * バグ候補、CLIオプション、重複検出結果、Issue作成結果などの型を提供します。
 *
 * @module auto-issue-types
 */

/**
 * バグ候補
 *
 * エージェント（Codex/Claude）がリポジトリのコード解析で検出した
 * バグの候補情報を表します。
 */
export interface BugCandidate {
  /**
   * バグタイトル（50〜80文字推奨）
   */
  title: string;

  /**
   * ファイルパス（相対パス）
   */
  file: string;

  /**
   * 行番号
   */
  line: number;

  /**
   * 深刻度
   */
  severity: 'high' | 'medium' | 'low';

  /**
   * 詳細説明（200〜500文字推奨）
   */
  description: string;

  /**
   * 修正案（100〜300文字推奨）
   */
  suggestedFix: string;

  /**
   * カテゴリ（Phase 1では固定）
   */
  category: 'bug';
}

/**
 * CLIオプション
 *
 * auto-issue コマンドで使用されるオプション設定を表します。
 */
export interface AutoIssueOptions {
  /**
   * 検出カテゴリ
   * Phase 1では 'bug' のみサポート
   */
  category: 'bug' | 'refactor' | 'enhancement' | 'all';

  /**
   * 生成する最大Issue数（デフォルト: 5）
   */
  limit: number;

  /**
   * dry-runモード（デフォルト: false）
   * true の場合、Issue作成をスキップし、候補のみ表示
   */
  dryRun: boolean;

  /**
   * 重複判定の閾値（0.0〜1.0、デフォルト: 0.8）
   * コサイン類似度がこの値以上の場合、LLM判定を実行
   */
  similarityThreshold: number;

  /**
   * 使用エージェント（auto/codex/claude、デフォルト: auto）
   */
  agent: 'auto' | 'codex' | 'claude';
}

/**
 * 重複検出結果
 *
 * IssueDeduplicator が既存Issueとの重複をチェックした結果を表します。
 */
export interface DuplicateCheckResult {
  /**
   * 重複判定結果
   */
  isDuplicate: boolean;

  /**
   * 類似度スコア（0.0〜1.0）
   * コサイン類似度またはLLM判定スコア
   */
  similarityScore: number;

  /**
   * 重複している既存Issue（重複の場合のみ）
   */
  existingIssue?: {
    number: number;
    title: string;
    url: string;
  };

  /**
   * 判定理由（ログ記録用）
   */
  reason: string;
}

/**
 * Issue作成結果
 *
 * IssueGenerator が GitHub API でIssueを作成した結果を表します。
 */
export interface IssueCreationResult {
  /**
   * 成功フラグ
   */
  success: boolean;

  /**
   * 作成されたIssue URL（成功時のみ）
   */
  issueUrl?: string;

  /**
   * 作成されたIssue番号（成功時のみ）
   */
  issueNumber?: number;

  /**
   * エラーメッセージ（失敗時のみ）
   */
  error?: string;

  /**
   * スキップ理由（重複等で作成しなかった場合）
   */
  skippedReason?: string;
}
