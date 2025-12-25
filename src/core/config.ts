import { VALID_WORKFLOW_LANGUAGES, type WorkflowLanguage } from '../types.js';
/**
 * 環境変数アクセスを一元化する設定管理クラス
 *
 * このモジュールは、AI Workflowプロジェクト全体で使用される環境変数への
 * 型安全なアクセスを提供します。process.envへの直接アクセスを隠蔽し、
 * 一元化された検証とフォールバックロジックを実現します。
 *
 * @module config
 */

/**
 * 環境変数アクセスのインターフェース
 *
 * このインターフェースは、アプリケーション全体で使用される環境変数への
 * 型安全なアクセスを提供します。必須環境変数は string 型、オプション
 * 環境変数は string | null 型を返します。
 */
export interface IConfig {
  // ========== GitHub関連 ==========

  /**
   * GitHub パーソナルアクセストークンを取得
   * @throws {Error} GITHUB_TOKEN が未設定の場合
   * @returns GitHub トークン
   */
  getGitHubToken(): string;

  /**
   * GitHub リポジトリ名を取得（owner/repo 形式）
   * @returns リポジトリ名、または未設定の場合は null
   */
  getGitHubRepository(): string | null;

  // ========== エージェント関連 ==========

  /**
   * Codex API キーを取得（Codex エージェント専用）
   * @returns API キー、または未設定の場合は null
   */
  getCodexApiKey(): string | null;

  /**
   * Claude Code 認証ファイルパスを取得（レガシー、非推奨）
   * @returns 認証ファイルパス、または未設定の場合は null
   * @deprecated CLAUDE_CODE_OAUTH_TOKEN または CLAUDE_CODE_API_KEY を使用してください
   */
  getClaudeCredentialsPath(): string | null;

  /**
   * Claude Code OAuth トークンを取得
   * @returns OAuth トークン、または未設定の場合は null
   */
  getClaudeOAuthToken(): string | null;

  /**
   * Claude Code API キーを取得（OAuth トークンがない場合のフォールバック）
   * @returns API キー、または未設定の場合は null
   */
  getClaudeCodeApiKey(): string | null;

  /**
   * Claude Code 認証トークンを取得（OAUTH_TOKEN → API_KEY のフォールバック）
   * @returns 認証トークン、または未設定の場合は null
   */
  getClaudeCodeToken(): string | null;

  /**
   * Claude の権限スキップフラグを取得
   * @returns true: スキップする、false: スキップしない
   */
  getClaudeDangerouslySkipPermissions(): boolean;

  /**
   * OpenAI APIキーを取得（OpenAI API 専用、テキスト生成用）
   * @returns OpenAI APIキー、または未設定の場合は null
   */
  getOpenAiApiKey(): string | null;

  /**
   * Anthropic APIキーを取得（Anthropic API 専用、テキスト生成用）
   * @returns Anthropic APIキー、または未設定の場合は null
   */
  getAnthropicApiKey(): string | null;

  /**
   * Claude モデルを取得（Claude エージェント実行用）
   * @returns モデル名またはエイリアス、または未設定の場合は null
   */
  getClaudeModel(): string | null;

  /**
   * Codex モデルを取得（Codex エージェント実行用）
   * @returns モデル名またはエイリアス、または未設定の場合は null
   */
  getCodexModel(): string | null;

  /**
   * ワークフロー言語設定を取得
   * @returns 'ja' | 'en' | null（未設定または無効値の場合は null）
   */
  getWorkflowLanguage(): WorkflowLanguage | null;

  // ========== Git関連 ==========

  /**
   * Git コミット作成者名を取得（GIT_COMMIT_USER_NAME → GIT_AUTHOR_NAME のフォールバック）
   * @returns ユーザー名、または未設定の場合は null
   */
  getGitCommitUserName(): string | null;

  /**
   * Git コミット作成者メールを取得（GIT_COMMIT_USER_EMAIL → GIT_AUTHOR_EMAIL のフォールバック）
   * @returns メールアドレス、または未設定の場合は null
   */
  getGitCommitUserEmail(): string | null;

  // ========== パス関連 ==========

  /**
   * ホームディレクトリパスを取得（HOME → USERPROFILE のフォールバック）
   * @throws {Error} HOME と USERPROFILE の両方が未設定の場合
   * @returns ホームディレクトリパス
   */
  getHomeDir(): string;

  /**
   * リポジトリの親ディレクトリパスを取得
   * @returns ディレクトリパス、または未設定の場合は null
   */
  getReposRoot(): string | null;

  /**
   * Codex CLI バイナリパスを取得
   * @returns バイナリパス（デフォルト: 'codex'）
   */
  getCodexCliPath(): string;

  // ========== ロギング関連 ==========

  /**
   * ログレベルを取得
   * @returns ログレベル（'debug' | 'info' | 'warn' | 'error'、デフォルト: 'info'）
   */
  getLogLevel(): string;

  /**
   * カラーリング無効化フラグを取得
   * @returns true: カラーリング無効、false: カラーリング有効
   */
  getLogNoColor(): boolean;

  // ========== Follow-up LLM 設定 ==========

  /**
   * フォローアップ Issue 生成に使用する LLM モードを取得
   */
  getFollowupLlmMode(): 'auto' | 'openai' | 'claude' | 'agent' | 'off' | null;

  /**
   * フォローアップ Issue 生成に使用する LLM モデル名を取得
   */
  getFollowupLlmModel(): string | null;

  /**
   * フォローアップ Issue 生成時のタイムアウト（ミリ秒）を取得
   */
  getFollowupLlmTimeoutMs(): number | null;

  /**
   * フォローアップ Issue 生成時の最大リトライ回数を取得
   */
  getFollowupLlmMaxRetries(): number | null;

  /**
   * フォローアップ Issue 生成結果にメタデータを追記するかどうか
   */
  getFollowupLlmAppendMetadata(): boolean | null;

  /**
   * フォローアップ Issue 生成時の温度パラメータを取得
   */
  getFollowupLlmTemperature(): number | null;

  /**
   * フォローアップ Issue 生成時の最大出力トークンを取得
   */
  getFollowupLlmMaxOutputTokens(): number | null;

  /**
   * フォローアップ Issue 生成時に LLM へ渡す最大タスク数を取得
   */
  getFollowupLlmMaxTasks(): number | null;

  // ========== 動作環境判定 ==========

  /**
   * CI環境かどうかを判定
   * @returns true: CI環境、false: ローカル環境
   */
  isCI(): boolean;

  // ========== パッケージインストール設定（Issue #177） ==========

  /**
   * エージェントがパッケージをインストール可能かどうかを返す
   *
   * 環境変数 AGENT_CAN_INSTALL_PACKAGES の値を解析:
   * - "true" または "1" の場合: true を返す
   * - "false"、"0"、未設定、空文字列の場合: false を返す
   *
   * @returns パッケージインストールが許可されている場合 true、それ以外は false
   */
  canAgentInstallPackages(): boolean;
}

/**
 * 環境変数アクセスを一元化する設定管理クラス
 *
 * このクラスはアプリケーション全体で単一のインスタンス（config）を
 * 共有します。process.env への直接アクセスを隠蔽し、型安全なアクセスと
 * 一元化された検証を提供します。
 */
export class Config implements IConfig {
  /**
   * コンストラクタ
   * 通常は直接インスタンス化せず、エクスポートされた config インスタンスを使用してください。
   */
  constructor() {}

  // ========== GitHub関連 ==========

  public getGitHubToken(): string {
    const token = this.getEnv('GITHUB_TOKEN', false);
    if (!token) {
      throw new Error(
        'GITHUB_TOKEN environment variable is required. ' +
          'Please set your GitHub personal access token with repo, workflow, and read:org scopes.',
      );
    }
    return token;
  }

  public getGitHubRepository(): string | null {
    return this.getEnv('GITHUB_REPOSITORY', false);
  }

  // ========== エージェント関連 ==========

  public getCodexApiKey(): string | null {
    // CODEX_API_KEY のみを使用（OPENAI_API_KEY へのフォールバックなし）
    return this.getEnv('CODEX_API_KEY', false);
  }

  public getClaudeCredentialsPath(): string | null {
    // レガシー: credentials.json ファイルパス（非推奨）
    return this.getEnv('CLAUDE_CODE_CREDENTIALS_PATH', false);
  }

  public getClaudeOAuthToken(): string | null {
    return this.getEnv('CLAUDE_CODE_OAUTH_TOKEN', false);
  }

  public getClaudeCodeApiKey(): string | null {
    return this.getEnv('CLAUDE_CODE_API_KEY', false);
  }

  public getClaudeCodeToken(): string | null {
    // CLAUDE_CODE_OAUTH_TOKEN を優先、なければ CLAUDE_CODE_API_KEY
    return this.getEnvWithFallback('CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_API_KEY');
  }

  public getClaudeDangerouslySkipPermissions(): boolean {
    return this.getEnv('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false) === '1';
  }

  public getOpenAiApiKey(): string | null {
    // OPENAI_API_KEY のみを使用（テキスト生成用）
    return this.getEnv('OPENAI_API_KEY', false);
  }

  public getAnthropicApiKey(): string | null {
    // ANTHROPIC_API_KEY のみを使用（テキスト生成用）
    return this.getEnv('ANTHROPIC_API_KEY', false);
  }

  public getClaudeModel(): string | null {
    // CLAUDE_MODEL 環境変数（エイリアスまたはフルモデルID）
    return this.getEnv('CLAUDE_MODEL', false);
  }

  public getCodexModel(): string | null {
    // CODEX_MODEL 環境変数（エイリアスまたはフルモデルID）
    return this.getEnv('CODEX_MODEL', false);
  }

  public getWorkflowLanguage(): WorkflowLanguage | null {
    const value = this.getEnv('AI_WORKFLOW_LANGUAGE', false);
    if (!value) {
      return null;
    }

    const normalized = value.toLowerCase().trim() as WorkflowLanguage;
    return VALID_WORKFLOW_LANGUAGES.includes(normalized) ? normalized : null;
  }

  // ========== Git関連 ==========

  public getGitCommitUserName(): string | null {
    // GIT_COMMIT_USER_NAME → GIT_AUTHOR_NAME のフォールバック
    return this.getEnvWithFallback('GIT_COMMIT_USER_NAME', 'GIT_AUTHOR_NAME');
  }

  public getGitCommitUserEmail(): string | null {
    // GIT_COMMIT_USER_EMAIL → GIT_AUTHOR_EMAIL のフォールバック
    return this.getEnvWithFallback('GIT_COMMIT_USER_EMAIL', 'GIT_AUTHOR_EMAIL');
  }

  // ========== パス関連 ==========

  public getHomeDir(): string {
    // HOME → USERPROFILE のフォールバック（必須）
    const home = this.getEnvWithFallback('HOME', 'USERPROFILE');
    if (!home) {
      throw new Error(
        'HOME or USERPROFILE environment variable is required. ' +
          'Please ensure your system has a valid home directory.',
      );
    }
    return home;
  }

  public getReposRoot(): string | null {
    return this.getEnv('REPOS_ROOT', false);
  }

  public getCodexCliPath(): string {
    // デフォルト: 'codex'
    return this.getEnv('CODEX_CLI_PATH', false) ?? 'codex';
  }

  // ========== ロギング関連 ==========

  public getLogLevel(): string {
    const level = this.getEnv('LOG_LEVEL', false)?.toLowerCase();
    const validLevels = ['debug', 'info', 'warn', 'error'];
    return level && validLevels.includes(level) ? level : 'info';
  }

  public getLogNoColor(): boolean {
    const value = this.getEnv('LOG_NO_COLOR', false);
    return value === 'true' || value === '1';
  }

  // ========== Follow-up LLM 設定 ==========

  public getFollowupLlmMode(): 'auto' | 'openai' | 'claude' | 'agent' | 'off' | null {
    const value = this.getEnv('FOLLOWUP_LLM_MODE', false);
    if (!value) {
      return null;
    }
    const normalized = value.toLowerCase();
    return ['auto', 'openai', 'claude', 'agent', 'off'].includes(normalized)
      ? (normalized as 'auto' | 'openai' | 'claude' | 'agent' | 'off')
      : null;
  }

  public getFollowupLlmModel(): string | null {
    return this.getEnv('FOLLOWUP_LLM_MODEL', false);
  }

  public getFollowupLlmTimeoutMs(): number | null {
    return this.parseNumericEnv('FOLLOWUP_LLM_TIMEOUT_MS');
  }

  public getFollowupLlmMaxRetries(): number | null {
    const value = this.parseNumericEnv('FOLLOWUP_LLM_MAX_RETRIES');
    if (value === null) {
      return null;
    }
    return Number.isFinite(value) ? Math.floor(value) : null;
  }

  public getFollowupLlmAppendMetadata(): boolean | null {
    const value = this.getEnv('FOLLOWUP_LLM_APPEND_METADATA', false);
    if (!value) {
      return null;
    }
    const normalized = value.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return null;
  }

  public getFollowupLlmTemperature(): number | null {
    const value = this.parseNumericEnv('FOLLOWUP_LLM_TEMPERATURE');
    if (value === null) {
      return null;
    }
    return Number.isFinite(value) ? value : null;
  }

  public getFollowupLlmMaxOutputTokens(): number | null {
    return this.parseNumericEnv('FOLLOWUP_LLM_MAX_OUTPUT_TOKENS');
  }

  public getFollowupLlmMaxTasks(): number | null {
    const value = this.parseNumericEnv('FOLLOWUP_LLM_MAX_TASKS');
    if (value === null) {
      return null;
    }
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null;
  }

  // ========== 動作環境判定 ==========

  public isCI(): boolean {
    const ci = this.getEnv('CI', false);
    const jenkinsHome = this.getEnv('JENKINS_HOME', false);
    return ci === 'true' || ci === '1' || !!jenkinsHome;
  }

  // ========== パッケージインストール設定（Issue #177） ==========

  public canAgentInstallPackages(): boolean {
    const value = this.getEnv('AGENT_CAN_INSTALL_PACKAGES', false);
    return this.parseBoolean(value, false);
  }

  // ========== プライベートヘルパーメソッド ==========

  /**
   * 環境変数を取得（内部用）
   *
   * @param key - 環境変数名
   * @param required - 必須フラグ（true: 未設定時は例外、false: 未設定時は null）
   * @returns 環境変数の値（トリム済み）、または null
   */
  private getEnv(key: string, required: boolean): string | null {
    const value = process.env[key];

    if (!value || value.trim() === '') {
      if (required) {
        throw new Error(`${key} environment variable is required`);
      }
      return null;
    }

    return value.trim();
  }

  /**
   * フォールバック付き環境変数取得（内部用）
   *
   * @param keys - 環境変数名の配列（優先順位順）
   * @returns 最初に見つかった環境変数の値（トリム済み）、または null
   */
  private getEnvWithFallback(...keys: string[]): string | null {
    for (const key of keys) {
      const value = this.getEnv(key, false);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  private parseNumericEnv(key: string): number | null {
    const raw = this.getEnv(key, false);
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * 文字列を boolean に変換する内部ヘルパーメソッド（Issue #177）
   *
   * @param value - 変換する文字列値
   * @param defaultValue - 値が未設定または空文字列の場合のデフォルト値
   * @returns 変換後の boolean 値
   * @private
   */
  private parseBoolean(value: string | null, defaultValue: boolean): boolean {
    if (value === null || value === '') {
      return defaultValue;
    }

    const normalized = value.toLowerCase().trim();
    return normalized === 'true' || normalized === '1';
  }
}

/**
 * Singleton インスタンス
 *
 * このインスタンスをアプリケーション全体で import して使用します。
 *
 * @example
 * ```typescript
 * import { config } from '@/core/config';
 *
 * const token = config.getGitHubToken(); // 必須環境変数（未設定時は例外）
 * const reposRoot = config.getReposRoot(); // オプション環境変数（未設定時は null）
 * ```
 */
export const config = new Config();
