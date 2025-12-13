import type { PhaseName, PhaseExecutionResult, IssueGenerationOptions } from '../types.js';
import type { MetadataManager } from '../core/metadata-manager.js';
import type { CodexAgentClient } from '../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../core/claude-agent-client.js';
import type { GitHubClient } from '../core/github-client.js';

/**
 * フェーズ実行コンテキスト
 */
export type PhaseContext = {
  workingDir: string;
  metadataManager: MetadataManager;
  codexClient: CodexAgentClient | null;
  claudeClient: ClaudeAgentClient | null;
  githubClient: GitHubClient;
  skipDependencyCheck: boolean;
  ignoreDependencies: boolean;
  presetPhases?: PhaseName[]; // プリセット実行時のフェーズリスト（Issue #396）
  issueGenerationOptions?: IssueGenerationOptions; // Issue #119: Optional for backward compatibility
  modelOptimizer?: import('../core/model-optimizer.js').ModelOptimizer | null;
  modelOverrides?: import('../core/model-optimizer.js').ModelOverrides;
  squashOnComplete?: boolean; // ワークフロー完了時にコミットをスカッシュするかどうか（Issue #194）
  issueNumber?: number; // Issue番号（Issue #194: スカッシュ時のメッセージ生成に使用）
  issueInfo?: { title?: string; body?: string }; // Issue情報（Issue #194: スカッシュ時のメッセージ生成に使用）
};

/**
 * フェーズ実行結果マップ
 */
export type PhaseResultMap = Record<PhaseName, PhaseExecutionResult>;

/**
 * 実行サマリー
 */
export type ExecutionSummary = {
  success: boolean;
  failedPhase?: PhaseName;
  error?: string;
  results: PhaseResultMap;
};

/**
 * Issue URL解析結果
 */
export interface IssueInfo {
  /**
   * リポジトリオーナー
   * 例: "tielec"
   */
  owner: string;

  /**
   * リポジトリ名
   * 例: "my-app"
   */
  repo: string;

  /**
   * Issue番号
   * 例: 123
   */
  issueNumber: number;

  /**
   * リポジトリ名（owner/repo形式）
   * 例: "tielec/my-app"
   */
  repositoryName: string;
}

/**
 * ブランチ名バリデーション結果
 */
export interface BranchValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Execute コマンドのオプション定義
 *
 * CLI の --issue, --phase, --preset 等のオプションを型安全に扱うためのインターフェース
 */
export interface ExecuteCommandOptions {
  /**
   * Issue番号（必須）
   *
   * 例: "123"
   */
  issue: string;

  /**
   * フェーズ名または "all"（オプション）
   *
   * デフォルト: "all"
   * 利用可能な値: "planning", "requirements", "design", "test_scenario",
   *              "implementation", "test_implementation", "testing",
   *              "documentation", "report", "evaluation", "all"
   */
  phase?: string;

  /**
   * プリセット名（オプション）
   *
   * 利用可能なプリセット: "review-requirements", "review-design",
   *                       "review-test-scenario", "quick-fix",
   *                       "implementation", "testing", "finalize"
   */
  preset?: string;

  /**
   * Git コミット作成者名（オプション）
   *
   * 環境変数 GIT_COMMIT_USER_NAME に設定される
   */
  gitUser?: string;

  /**
   * Git コミット作成者メール（オプション）
   *
   * 環境変数 GIT_COMMIT_USER_EMAIL に設定される
   */
  gitEmail?: string;

  /**
   * メタデータリセットフラグ（オプション）
   *
   * デフォルト: false
   * true の場合、メタデータをクリアして Phase 0 から再開
   */
  forceReset?: boolean;

  /**
   * 依存関係チェックスキップフラグ（オプション）
   *
   * デフォルト: false
   * true の場合、すべての依存関係検証をバイパス（慎重に使用）
   */
  skipDependencyCheck?: boolean;

  /**
   * 依存関係警告無視フラグ（オプション）
   *
   * デフォルト: false
   * true の場合、依存関係の警告を表示しつつ処理を続行
   */
  ignoreDependencies?: boolean;

  /**
   * エージェントモード（オプション）
   *
   * デフォルト: 'auto'
   * - 'auto': CODEX_API_KEY が設定されていれば Codex を使用、なければ Claude にフォールバック
   * - 'codex': Codex を強制使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
   * - 'claude': Claude を強制使用（CLAUDE_CODE_CREDENTIALS_PATH が必要）
   */
  agent?: 'auto' | 'codex' | 'claude';

  /**
   * 完了時クリーンアップフラグ（オプション）
   *
   * デフォルト: false
   * true の場合、Evaluation Phase 完了後に .ai-workflow/issue-* ディレクトリを削除
   */
  cleanupOnComplete?: boolean;

  /**
   * クリーンアップ強制フラグ（オプション）
   *
   * デフォルト: false
   * true の場合、確認プロンプトをスキップして強制的にクリーンアップ（CI環境用）
   */
  cleanupOnCompleteForce?: boolean;

  /**
   * 外部要件ドキュメントパス（オプション）
   *
   * 絶対パスまたは相対パスで指定
   */
  requirementsDoc?: string;

  /**
   * 外部設計ドキュメントパス（オプション）
   *
   * 絶対パスまたは相対パスで指定
   */
  designDoc?: string;

  /**
   * 外部テストシナリオドキュメントパス（オプション）
   *
   * 絶対パスまたは相対パスで指定
   */
  testScenarioDoc?: string;

  /**
   * フォローアップ Issue 生成で利用する LLM のモード
   *
   * - 'off': LLM を使用しない（フォールバックのみ）
   * - 'auto': 利用可能なプロバイダを自動選択
   * - 'openai': OpenAI を強制使用
   * - 'claude': Claude を強制使用
   * - 'agent': エージェントベース生成（Codex/Claude Agent）
   */
  followupLlmMode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off';

  /**
   * フォローアップ Issue 生成で利用する LLM モデル名
   */
  followupLlmModel?: string;

  /**
   * LLM 呼び出しのタイムアウト（ミリ秒）
   */
  followupLlmTimeout?: number;

  /**
   * LLM 呼び出しの最大リトライ回数
   */
  followupLlmMaxRetries?: number;

  /**
   * 生成したメタデータを Issue 本文に追記するかどうか
   */
  followupLlmAppendMetadata?: boolean;

  /**
   * ワークフロー完了時にコミットをスカッシュするかどうか（Issue #194）
   *
   * デフォルト: false
   * true の場合、Evaluation Phase 完了後にワークフロー開始時点からのコミットを1つにスカッシュ
   */
  squashOnComplete?: boolean;

  /**
   * Claude モデル指定（Issue #301）
   *
   * エイリアス（opus, sonnet, haiku）またはフルモデルIDで指定
   * デフォルト: opus（claude-opus-4-5-20251101）
   */
  claudeModel?: string;

  /**
   * Codex モデル指定（Issue #302）
   *
   * エイリアス（max, mini, 5.1, legacy）またはフルモデルIDで指定
   * デフォルト: max（gpt-5.1-codex-max）
   */
  codexModel?: string;
}

/**
 * Review コマンドのオプション定義
 *
 * CLI の --phase, --issue オプションを型安全に扱うためのインターフェース
 */
export interface ReviewCommandOptions {
  /**
   * フェーズ名（必須）
   *
   * 例: "requirements", "design", "implementation"
   * 利用可能な値: "planning", "requirements", "design", "test_scenario",
   *              "implementation", "test_implementation", "testing",
   *              "documentation", "report", "evaluation"
   */
  phase: string;

  /**
   * Issue番号（必須）
   *
   * 例: "123"
   */
  issue: string;
}

/**
 * Migrate コマンドのオプション定義
 *
 * ワークフローメタデータのマイグレーション（Personal Access Token のサニタイズ等）に使用
 */
export interface MigrateOptions {
  /**
   * Personal Access Token サニタイズフラグ（必須）
   *
   * true の場合、metadata.json の Git remote URL から埋め込まれたトークンを除去
   */
  sanitizeTokens: boolean;

  /**
   * ドライランフラグ（必須）
   *
   * true の場合、ファイルを変更せず検出のみ実行
   */
  dryRun: boolean;

  /**
   * 対象Issue番号（オプション）
   *
   * 指定した場合、該当Issueのメタデータのみを対象とする
   */
  issue?: string;

  /**
   * 対象リポジトリパス（オプション）
   *
   * 指定した場合、該当リポジトリ内のメタデータを対象とする
   */
  repo?: string;
}

/**
 * Rollback コマンドのオプション定義（Issue #90）
 */
export interface RollbackCommandOptions {
  /**
   * Issue番号（必須）
   */
  issue: string;

  /**
   * 差し戻し先フェーズ（必須）
   */
  toPhase: string;

  /**
   * 差し戻し理由（--reason で指定された場合）
   */
  reason?: string;

  /**
   * 差し戻し理由ファイルパス（--reason-file で指定された場合）
   */
  reasonFile?: string;

  /**
   * 差し戻し先ステップ（オプション、デフォルト: 'revise'）
   */
  toStep?: string;

  /**
   * 差し戻し元フェーズ（オプション、自動検出可能）
   */
  fromPhase?: string;

  /**
   * 確認プロンプトをスキップ（オプション、デフォルト: false）
   */
  force?: boolean;

  /**
   * ドライランモード（オプション、デフォルト: false）
   */
  dryRun?: boolean;

  /**
   * 対話的入力モード（オプション、デフォルト: false）
   */
  interactive?: boolean;
}

/**
 * 差し戻しコンテキスト（metadata.json の各フェーズに記録）（Issue #90）
 */
export interface RollbackContext {
  /**
   * 差し戻し実行時刻（ISO 8601形式、UTC）
   */
  triggered_at: string;

  /**
   * 差し戻し元フェーズ（オプション）
   */
  from_phase?: string | null;

  /**
   * 差し戻し元ステップ（オプション）
   */
  from_step?: import('../types.js').StepName | null;

  /**
   * 差し戻し理由（必須、1000文字以内）
   */
  reason: string;

  /**
   * レビュー結果ファイルへの @filepath 形式の参照（オプション）
   */
  review_result?: string | null;

  /**
   * 追加詳細情報（オプション）
   */
  details?: {
    blocker_count?: number;
    suggestion_count?: number;
    affected_tests?: string[];
    [key: string]: unknown;
  } | null;
}

/**
 * 差し戻し履歴エントリ（metadata.json のルートレベルに記録）（Issue #90）
 */
export interface RollbackHistoryEntry {
  /**
   * 差し戻し実行時刻（ISO 8601形式、UTC）
   */
  timestamp: string;

  /**
   * 差し戻し元フェーズ（オプション）
   */
  from_phase?: string | null;

  /**
   * 差し戻し元ステップ（オプション）
   */
  from_step?: import('../types.js').StepName | null;

  /**
   * 差し戻し先フェーズ（必須）
   */
  to_phase: string;

  /**
   * 差し戻し先ステップ（必須）
   */
  to_step: string;

  /**
   * 差し戻し理由（必須、1000文字以内）
   */
  reason: string;

  /**
   * トリガー元（manual | automatic、現在は manual のみ）
   */
  triggered_by: 'manual' | 'automatic';

  /**
   * レビュー結果ファイルのパス（オプション）
   */
  review_result_path?: string | null;
}

/**
 * Rollback Auto コマンドのオプション定義（Issue #271）
 *
 * エージェントベースの自動差し戻し検出に使用
 */
export interface RollbackAutoOptions {
  /**
   * Issue番号（必須）
   *
   * 例: 123
   */
  issueNumber: number;

  /**
   * ドライランモード（オプション、デフォルト: false）
   *
   * true の場合、実際の差し戻しは行わず、分析結果のみ表示
   */
  dryRun?: boolean;

  /**
   * 確認プロンプトをスキップ（オプション、デフォルト: false）
   *
   * true かつ confidence が 'high' の場合、確認なしで差し戻しを実行
   */
  force?: boolean;

  /**
   * エージェントモード（オプション、デフォルト: 'auto'）
   *
   * - 'auto': CODEX_API_KEY が設定されていれば Codex を使用、なければ Claude にフォールバック
   * - 'codex': Codex を強制使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
   * - 'claude': Claude を強制使用（CLAUDE_CODE_CREDENTIALS_PATH が必要）
   */
  agent?: 'auto' | 'codex' | 'claude';
}

/**
 * エージェントによる差し戻し判定結果（Issue #271）
 *
 * エージェントが出力する JSON 形式の分析結果
 */
export interface RollbackDecision {
  /**
   * 差し戻しが必要かどうか（必須）
   */
  needs_rollback: boolean;

  /**
   * 差し戻し先フェーズ（needs_rollback が true の場合は必須）
   *
   * 例: "requirements", "design", "test_scenario"
   */
  to_phase?: import('../types.js').PhaseName;

  /**
   * 差し戻し先ステップ（オプション、デフォルト: 'revise'）
   *
   * 例: "initial", "revise", "approve"
   */
  to_step?: import('../types.js').StepName;

  /**
   * 差し戻し理由（必須、1000文字以内）
   *
   * ユーザーおよび次フェーズのエージェントが理解できる形式で記述
   */
  reason: string;

  /**
   * 判定の確信度（必須）
   *
   * - 'high': エビデンスが明確で判定に確信がある
   * - 'medium': エビデンスはあるが解釈の余地がある
   * - 'low': エビデンスが不十分または曖昧
   */
  confidence: 'high' | 'medium' | 'low';

  /**
   * 分析の詳細（必須）
   *
   * エージェントが判定に至った根拠を記述
   */
  analysis: string;
}

/**
 * pr-comment init コマンドオプション
 */
export interface PRCommentInitOptions {
  pr?: string;
  prUrl?: string;
  issue?: string;
  commentIds?: string;
  force?: boolean;
}

/**
 * pr-comment analyze コマンドオプション
 */
export interface PRCommentAnalyzeOptions {
  pr: string;
  commentIds?: string;
  dryRun?: boolean;
  agent?: 'auto' | 'codex' | 'claude';
}

/**
 * pr-comment execute コマンドオプション
 */
export interface PRCommentExecuteOptions {
  pr?: string;
  prUrl?: string;
  commentIds?: string;
  dryRun?: boolean;
  agent?: 'auto' | 'codex' | 'claude';
  batchSize?: string;
}

/**
 * pr-comment finalize コマンドオプション
 */
export interface PRCommentFinalizeOptions {
  pr?: string;
  prUrl?: string;
  skipCleanup?: boolean;
  dryRun?: boolean;
}
