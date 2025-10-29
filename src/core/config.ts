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
   * Codex API キーを取得（CODEX_API_KEY → OPENAI_API_KEY のフォールバック）
   * @returns API キー、または未設定の場合は null
   */
  getCodexApiKey(): string | null;

  /**
   * Claude Code 認証ファイルパスを取得
   * @returns 認証ファイルパス、または未設定の場合は null
   */
  getClaudeCredentialsPath(): string | null;

  /**
   * Claude Code OAuth トークンを取得
   * @returns OAuth トークン、または未設定の場合は null
   */
  getClaudeOAuthToken(): string | null;

  /**
   * Claude の権限スキップフラグを取得
   * @returns true: スキップする、false: スキップしない
   */
  getClaudeDangerouslySkipPermissions(): boolean;

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

  // ========== 動作環境判定 ==========

  /**
   * CI環境かどうかを判定
   * @returns true: CI環境、false: ローカル環境
   */
  isCI(): boolean;
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
    // CODEX_API_KEY → OPENAI_API_KEY のフォールバック
    return this.getEnvWithFallback('CODEX_API_KEY', 'OPENAI_API_KEY');
  }

  public getClaudeCredentialsPath(): string | null {
    return this.getEnv('CLAUDE_CODE_CREDENTIALS_PATH', false);
  }

  public getClaudeOAuthToken(): string | null {
    return this.getEnv('CLAUDE_CODE_OAUTH_TOKEN', false);
  }

  public getClaudeDangerouslySkipPermissions(): boolean {
    return this.getEnv('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false) === '1';
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

  // ========== 動作環境判定 ==========

  public isCI(): boolean {
    const ci = this.getEnv('CI', false);
    const jenkinsHome = this.getEnv('JENKINS_HOME', false);
    return ci === 'true' || ci === '1' || !!jenkinsHome;
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
