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
 * リファクタリング候補
 *
 * エージェント（Codex/Claude）がリポジトリのコード解析で検出した
 * リファクタリングが必要な箇所の候補情報を表します。
 */
export interface RefactorCandidate {
  /**
   * リファクタリングの種類
   * - large-file: 大きすぎるファイル（500行以上）
   * - large-function: 大きすぎる関数（50行以上）
   * - high-complexity: 複雑な条件分岐（ネスト深さ4以上）
   * - duplication: コード重複
   * - unused-code: 未使用コード
   * - missing-docs: ドキュメント欠落
   */
  type:
    | 'large-file'
    | 'large-function'
    | 'high-complexity'
    | 'duplication'
    | 'unused-code'
    | 'missing-docs';

  /**
   * 対象ファイルの相対パス
   */
  filePath: string;

  /**
   * 該当する行範囲（オプショナル）
   */
  lineRange?: {
    start: number;
    end: number;
  };

  /**
   * 問題の詳細説明（最小20文字）
   */
  description: string;

  /**
   * 推奨される改善策（最小20文字）
   */
  suggestion: string;

  /**
   * 優先度
   * - low: 低（可読性向上）
   * - medium: 中（保守性向上）
   * - high: 高（技術的負債の削減）
   */
  priority: 'low' | 'medium' | 'high';
}

/**
 * 機能拡張提案
 *
 * エージェント（Codex/Claude）がリポジトリの特性を分析し、
 * 創造的な機能拡張の提案を生成した情報を表します。
 */
export interface EnhancementProposal {
  /**
   * 提案のタイプ
   * - improvement: 既存機能の改善
   * - integration: 他ツール連携
   * - automation: ワークフロー自動化
   * - dx: 開発者体験向上
   * - quality: 品質保証強化
   * - ecosystem: エコシステム拡張
   */
  type: 'improvement' | 'integration' | 'automation' | 'dx' | 'quality' | 'ecosystem';

  /**
   * 提案タイトル（50〜100文字）
   */
  title: string;

  /**
   * 提案の詳細説明（100文字以上）
   */
  description: string;

  /**
   * なぜこの提案が有用か（50文字以上）
   */
  rationale: string;

  /**
   * 実装のヒント（配列、最低1つ）
   */
  implementation_hints: string[];

  /**
   * 期待される効果
   */
  expected_impact: 'low' | 'medium' | 'high';

  /**
   * 実装の難易度
   */
  effort_estimate: 'small' | 'medium' | 'large';

  /**
   * 関連するファイル・モジュール（配列、最低1つ）
   */
  related_files: string[];
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
   * JSON結果を出力するファイルパス
   * 指定されていない場合はファイル出力しない
   */
  outputFile?: string;

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

  /**
   * 創造的モード（デフォルト: false）
   * true の場合、より実験的・創造的な提案を含める
   * enhancement カテゴリでのみ有効
   */
 creativeMode?: boolean;

  /**
   * カスタム指示（解析の重点を示す任意入力、最大500文字）
   */
  customInstruction?: string;
}

/**
 * CLIオプション（生の入力）
 *
 * commander から受け取る文字列中心のオプションを表します。
 */
export interface RawAutoIssueOptions {
  category?: string;
  limit?: string;
  outputFile?: string;
  dryRun?: boolean;
  similarityThreshold?: string;
  agent?: 'auto' | 'codex' | 'claude';
  creativeMode?: boolean;

  /**
   * カスタム指示（オプション）
   * エージェントへ追加の検出指示を伝えるための文字列
   */
  customInstruction?: string;
}

/**
 * カスタム指示の検証結果
 */
export interface ValidationResult {
  /** 安全な指示かどうか */
  isValid: boolean;

  /** 判定の信頼度 */
  confidence: 'high' | 'medium' | 'low';

  /** 判定理由（具体的） */
  reason: string;

  /** 指示の分類 */
  category: 'analysis' | 'execution';

  /** isValid=false の場合のエラーメッセージ */
  errorMessage?: string;

  /** フォールバック時の検出パターン */
  detectedPattern?: string;

  /** 検証方法 */
  validationMethod: 'llm' | 'pattern';

  /** 検証日時（ISO8601形式） */
  validatedAt: string;
}

/**
 * LLMからの検証応答
 */
export interface LLMValidationResponse {
  /** 安全な指示かどうか（LLM判定） */
  isSafe: boolean;

  /** 判定理由 */
  reason: string;

  /** 指示の分類 */
  category: 'analysis' | 'execution';

  /** 判定の信頼度 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 検証結果のキャッシュエントリ
 */
export interface ValidationCacheEntry {
  /** キャッシュされた検証結果 */
  result: ValidationResult;

  /** キャッシュ作成時刻（Unix timestamp） */
  timestamp: number;

  /** 最終アクセス時刻（LRU用） */
  lastAccessed: number;
}

/**
 * JSON出力用の実行情報
 */
export interface AutoIssueExecutionInfo {
  /**
   * 実行タイムスタンプ（ISO8601 UTC）
   */
  timestamp: string;

  /**
   * 対象リポジトリ (owner/repo)
   */
  repository: string;

  /**
   * 検出カテゴリ
   */
  category: AutoIssueOptions['category'];

  /**
   * dry-runでの実行かどうか
   */
  dryRun: boolean;
}

/**
 * JSON出力用のサマリー
 */
export interface AutoIssueSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

/**
 * JSON出力用のIssue詳細
 */
export interface AutoIssueIssueEntry {
  success: boolean;
  title: string;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
  skippedReason?: string;
}

/**
 * auto-issueコマンドのJSON出力スキーマ
 */
export interface AutoIssueJsonOutput {
  execution: AutoIssueExecutionInfo;
  summary: AutoIssueSummary;
  issues: AutoIssueIssueEntry[];
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
   * Issueタイトル（成功/失敗を問わず表示用）
   */
  title?: string;

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
