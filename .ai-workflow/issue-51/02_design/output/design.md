# 詳細設計書: Issue #51

**Issue番号**: #51
**タイトル**: 機能追加: 環境変数アクセスを一元化する設定管理を追加
**重要度**: MEDIUM
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/51
**作成日**: 2025-01-29

---

## 0. Planning Documentの確認

Planning Phase で策定された開発計画を確認しました：

### 実装戦略
- **戦略**: CREATE（新規モジュール作成中心）
- **判断根拠**: 新規モジュール `src/core/config.ts` の作成が中心で、既存コードへの変更はインポート文の追加とメソッド呼び出しの置き換えのみ

### テスト戦略
- **戦略**: UNIT_ONLY（ユニットテストのみ）
- **判断根拠**: Config クラスは純粋な環境変数アクセスロジックで外部依存がなく、既存の統合テストは Config モックにより動作継続

### 見積もり工数
- **総工数**: 16～24時間（2～3日）

### リスク評価
- **総合リスク**: 中（Medium）
- **主要リスク**: 後方互換性リスク（Medium）、置き換え漏れによる不整合（Medium）

### 影響範囲
- **変更対象ファイル**: 12ファイル（実際に `process.env` アクセスを使用しているファイル）
- **依存関係変更**: なし（標準ライブラリのみ使用）
- **マイグレーション**: 不要（環境変数の名前や形式は変更なし）

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  (commands/, phases/, core/*-client.ts, core/git/*.ts)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ import { config }
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Config Module                             │
│                  (src/core/config.ts)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  IConfig Interface                                    │  │
│  │  - getGitHubToken(): string                          │  │
│  │  - getGitHubRepository(): string | null              │  │
│  │  - getCodexApiKey(): string | null                   │  │
│  │  - getClaudeCredentialsPath(): string | null         │  │
│  │  - getClaudeOAuthToken(): string | null              │  │
│  │  - getClaudeDangerouslySkipPermissions(): boolean    │  │
│  │  - getGitCommitUserName(): string | null             │  │
│  │  - getGitCommitUserEmail(): string | null            │  │
│  │  - getHomeDir(): string                              │  │
│  │  - getReposRoot(): string | null                     │  │
│  │  - getCodexCliPath(): string                         │  │
│  │  - getLogLevel(): string                             │  │
│  │  - getLogNoColor(): boolean                          │  │
│  │  - isCI(): boolean                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▲                                  │
│                           │                                  │
│                           │ implements                       │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Config Class (Singleton)                            │  │
│  │  - private constructor()                             │  │
│  │  - private getEnv(key, required): string | null      │  │
│  │  - private getEnvWithFallback(...keys): string|null  │  │
│  │  - 14個のpublicメソッド（IConfigを実装）             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  export const config = new Config(); // Singletonインスタンス│
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ direct access (private only)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    process.env                               │
│              (Node.js Environment Variables)                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

**依存関係フロー**:
1. アプリケーション層（commands/, phases/, core/）が Config モジュールをインポート
2. Config モジュールが `process.env` へ唯一のアクセスポイントを提供
3. アプリケーション層は `process.env` へ直接アクセスしない（例外: `src/core/helpers/env-setup.ts` は引数として `process.env` を受け取る）

**設計パターン**:
- **Singleton パターン**: Config クラスは単一のインスタンス `config` を提供
- **Facade パターン**: `process.env` への複雑なアクセスロジックを単純なメソッドで隠蔽
- **Fail-Fast 原則**: 必須環境変数が未設定の場合は即座に例外をスロー

### 1.3 データフロー

```
┌──────────────┐
│ User/CI      │
│ Environment  │
│ Variables    │
└──────┬───────┘
       │
       │ process.env.GITHUB_TOKEN
       │ process.env.CODEX_API_KEY
       │ process.env.HOME
       │ ...
       │
       ▼
┌──────────────────────────┐
│ Config.getGitHubToken()  │──┐
│ Config.getCodexApiKey()  │  │ 検証・フォールバック
│ Config.getHomeDir()      │◄─┘ 処理
└──────────┬───────────────┘
           │
           │ 型安全な値（string | string | null）
           │
           ▼
┌──────────────────────────┐
│ Application Code         │
│ - CodexAgentClient       │
│ - ClaudeAgentClient      │
│ - GitManager             │
│ - GitHubClient           │
│ - execute.ts             │
│ - logger.ts              │
└──────────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: CREATE

**判断根拠**:
1. **新規モジュールの作成**: `src/core/config.ts` を新規作成し、完全に独立したモジュールとして実装
2. **既存コードへの影響は最小限**: 既存ファイルへの変更は以下のみ:
   - インポート文の追加（`import { config } from '@/core/config';`）
   - メソッド呼び出しへの置き換え（`process.env.GITHUB_TOKEN` → `config.getGitHubToken()`）
3. **アーキテクチャ変更ではない**: 既存のクラス構造やデータフローは変更せず、環境変数アクセスのみを抽象化
4. **既存機能の保持**: デフォルト値、フォールバックロジック、エラーハンドリングは既存のまま Config クラス内に集約

**CREATE パターンの理由**:
- 新規クラス・インターフェースの作成が中心（`IConfig`, `Config`）
- 既存コードのロジック変更なし（呼び出し元の変更のみ）
- 設計パターン: Singleton + Facade
- 後方互換性100%維持（環境変数の名前・形式・デフォルト値を変更しない）

---

## 3. テスト戦略判断

### テスト戦略: UNIT_ONLY

**判断根拠**:
1. **純粋な環境変数アクセスロジック**: Config クラスは外部システム（DB、API、ファイルシステム等）に依存せず、`process.env` のみにアクセス
2. **既存統合テストの継続性**: Config モックにより既存の統合テストが無変更で動作し続ける
3. **BDD 不要**: エンドユーザー向け機能ではなく、内部アーキテクチャの改善（ユーザーストーリーが存在しない）
4. **テスト効率**: ユニットテストのみで以下を保証可能:
   - 必須環境変数が未設定の場合の例外スロー
   - オプション環境変数が未設定の場合の `null` 返却
   - フォールバックロジックの正常動作（`CODEX_API_KEY` → `OPENAI_API_KEY`）
   - CI環境判定ロジック（`CI=true`, `JENKINS_HOME`）

**UNIT_ONLY パターンの理由**:
- 単一モジュールのロジックテスト
- モック化が容易（環境変数の設定/削除のみ）
- 既存の統合テストで間接的にカバー済み（Config モック経由）
- テストの実行速度を維持（統合テストやBDDテストは不要）

---

## 4. テストコード戦略判断

### テストコード戦略: CREATE_TEST

**判断根拠**:
1. **新規モジュールのため専用テストファイルが必要**: `tests/unit/core/config.test.ts` を新規作成
2. **既存テストへの影響は最小限**: 既存テストは Config モックの追加のみで対応（例: `jest.mock('@/core/config')`）
3. **独立したテストスイート**: Config クラスの全メソッドを網羅する専用テストが必要（14個のpublicメソッド）
4. **既存テストパターンとの整合性**: プロジェクトの既存テスト構造（`tests/unit/core/` ディレクトリ）に従う

**CREATE_TEST パターンの理由**:
- 新規モジュールのため、専用テストファイルが必要
- 既存テストへの影響は最小限（モック戦略の追加のみ、既存テストコードは無変更）
- テストカバレッジ目標: 90%以上（Planning Document の品質ゲートより）

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

以下の12ファイルで `process.env` への直接アクセスが確認されました：

#### 変更が必要なファイル（11ファイル）

| ファイルパス | 環境変数 | 箇所数 | 変更内容 |
|------------|---------|-------|---------|
| `src/commands/execute.ts` | `GIT_COMMIT_USER_NAME`, `GIT_COMMIT_USER_EMAIL`, `HOME`, `CLAUDE_CODE_CREDENTIALS_PATH`, `CODEX_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY` | 約17箇所 | Config メソッド呼び出しに置き換え |
| `src/commands/init.ts` | （確認が必要） | 約1箇所 | Config メソッド呼び出しに置き換え |
| `src/phases/base-phase.ts` | `CI` | 1箇所 | `config.isCI()` に置き換え |
| `src/utils/logger.ts` | `LOG_LEVEL`, `LOG_NO_COLOR` | 2箇所 | `config.getLogLevel()`, `config.getLogNoColor()` に置き換え |
| `src/core/claude-agent-client.ts` | `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, `CLAUDE_CODE_CREDENTIALS_PATH`, `CLAUDE_CODE_OAUTH_TOKEN` | 5箇所 | Config メソッド呼び出しに置き換え |
| `src/core/codex-agent-client.ts` | `CODEX_CLI_PATH` | 1箇所 | `config.getCodexCliPath()` に置き換え |
| `src/core/content-parser.ts` | `OPENAI_API_KEY` | 1箇所 | `config.getCodexApiKey()` に置き換え（CODEX_API_KEY || OPENAI_API_KEY のフォールバック） |
| `src/core/git/commit-manager.ts` | `GIT_COMMIT_USER_NAME`, `GIT_COMMIT_USER_EMAIL`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` | 4箇所 | Config メソッド呼び出しに置き換え |
| `src/core/git/remote-manager.ts` | `GITHUB_TOKEN` | 1箇所 | `config.getGitHubToken()` に置き換え |
| `src/core/github-client.ts` | `GITHUB_TOKEN`, `GITHUB_REPOSITORY` | 2箇所 | Config メソッド呼び出しに置き換え |
| `src/core/repository-utils.ts` | `REPOS_ROOT`, `HOME`, `USERPROFILE` | 3箇所 | `config.getReposRoot()`, `config.getHomeDir()` に置き換え |

#### 変更不要なファイル（1ファイル）

| ファイルパス | 理由 |
|------------|------|
| `src/core/logger.ts` | 既にログレベルの抽象化済み（`parseLogLevelFromEnv()`）。ただし、`process.env.LOG_LEVEL` へのアクセスは Config クラス経由に変更推奨 |

#### 特殊ケース

| ファイルパス | 扱い |
|------------|------|
| `src/core/helpers/env-setup.ts` | `process.env` を引数として受け取るため、**影響なし**。`setupCodexEnvironment(process.env)` のように呼び出し元から渡される |
| `src/core/secret-masker.ts` | 環境変数名のスキャンで `process.env[name]` をループするため、**影響最小**。ただし、環境変数リストは Config クラスと同期すべき |

### 5.2 依存関係の変更

**新規依存の追加**:
- なし（標準ライブラリのみ使用）

**既存依存の変更**:
- なし

**パッケージ変更**:
- `package.json`: 変更不要
- `tsconfig.json`: 変更不要

### 5.3 マイグレーション要否

**マイグレーション不要**

**理由**:
- 環境変数の名前や形式は変更なし
- データベーススキーマ変更なし
- 設定ファイル形式変更なし
- Docker / Jenkins 環境設定は変更不要（既存の環境変数をそのまま利用）

**後方互換性**:
- Config クラスは既存の環境変数をそのまま読み取る
- ユーザー（開発者、CI環境）は既存の環境変数設定を変更する必要なし

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

| ファイルパス | 説明 | 行数（見積もり） |
|------------|------|----------------|
| `src/core/config.ts` | Config クラスと IConfig インターフェース | 約300行 |
| `tests/unit/core/config.test.ts` | Config クラスのユニットテスト | 約400行 |

### 6.2 修正が必要な既存ファイル

| ファイルパス | 変更内容 | 変更規模 |
|------------|---------|---------|
| `src/commands/execute.ts` | インポート追加、`process.env` アクセスを Config メソッドに置き換え | 中（約17箇所） |
| `src/commands/init.ts` | インポート追加、`process.env` アクセスを Config メソッドに置き換え | 小（約1箇所） |
| `src/phases/base-phase.ts` | インポート追加、CI環境判定を `config.isCI()` に置き換え | 小（1箇所） |
| `src/utils/logger.ts` | インポート追加、LOG_LEVEL/LOG_NO_COLOR アクセスを Config メソッドに置き換え | 小（2箇所） |
| `src/core/claude-agent-client.ts` | インポート追加、Claude関連環境変数アクセスを Config メソッドに置き換え | 中（5箇所） |
| `src/core/codex-agent-client.ts` | インポート追加、CODEX_CLI_PATH アクセスを Config メソッドに置き換え | 小（1箇所） |
| `src/core/content-parser.ts` | インポート追加、OPENAI_API_KEY アクセスを Config メソッドに置き換え | 小（1箇所） |
| `src/core/git/commit-manager.ts` | インポート追加、Git関連環境変数アクセスを Config メソッドに置き換え | 小（4箇所） |
| `src/core/git/remote-manager.ts` | インポート追加、GITHUB_TOKEN アクセスを Config メソッドに置き換え | 小（1箇所） |
| `src/core/github-client.ts` | インポート追加、GitHub関連環境変数アクセスを Config メソッドに置き換え | 小（2箇所） |
| `src/core/repository-utils.ts` | インポート追加、REPOS_ROOT/HOME/USERPROFILE アクセスを Config メソッドに置き換え | 小（3箇所） |
| `src/core/logger.ts` | インポート追加、LOG_LEVEL アクセスを Config メソッドに置き換え（推奨） | 小（1箇所） |

### 6.3 削除が必要なファイル

なし

---

## 7. 詳細設計

### 7.1 Config クラス設計

#### 7.1.1 IConfig インターフェース

```typescript
/**
 * 環境変数アクセスのインターフェース
 *
 * このインターフェースは、アプリケーション全体で使用される環境変数への
 * 型安全なアクセスを提供します。必須環境変数は string 型、オプション
 * 環境変数は string | null 型を返します。
 */
export interface IConfig {
  // GitHub関連
  /**
   * GitHub パーソナルアクセストークンを取得
   * @throws {Error} GITHUB_TOKEN が未設定の場合
   */
  getGitHubToken(): string;

  /**
   * GitHub リポジトリ名を取得（owner/repo 形式）
   * @returns リポジトリ名、または未設定の場合は null
   */
  getGitHubRepository(): string | null;

  // エージェント関連
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

  // Git関連
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

  // パス関連
  /**
   * ホームディレクトリパスを取得（HOME → USERPROFILE のフォールバック）
   * @throws {Error} HOME と USERPROFILE の両方が未設定の場合
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

  // ロギング関連
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

  // 動作環境判定
  /**
   * CI環境かどうかを判定
   * @returns true: CI環境、false: ローカル環境
   */
  isCI(): boolean;
}
```

#### 7.1.2 Config クラス実装

```typescript
/**
 * 環境変数アクセスを一元化する設定管理クラス
 *
 * このクラスは Singleton パターンで実装され、アプリケーション全体で
 * 単一のインスタンスを共有します。process.env への直接アクセスを
 * 隠蔽し、型安全なアクセスと一元化された検証を提供します。
 */
export class Config implements IConfig {
  /**
   * プライベートコンストラクタ（Singleton パターン）
   */
  private constructor() {}

  // ========== GitHub関連 ==========

  public getGitHubToken(): string {
    const token = this.getEnv('GITHUB_TOKEN', true);
    if (!token) {
      throw new Error(
        'GITHUB_TOKEN environment variable is required. ' +
        'Please set your GitHub personal access token with repo, workflow, and read:org scopes.'
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
        'Please ensure your system has a valid home directory.'
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
```

### 7.2 主要メソッドの設計

#### 7.2.1 必須環境変数の検証メソッド

**メソッド名**: `getGitHubToken()`, `getHomeDir()`

**目的**: 必須環境変数が未設定の場合、明確なエラーメッセージとともに例外をスロー

**実装パターン**:
```typescript
public getGitHubToken(): string {
  const token = this.getEnv('GITHUB_TOKEN', true);
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN environment variable is required. ' +
      'Please set your GitHub personal access token with repo, workflow, and read:org scopes.'
    );
  }
  return token;
}
```

**エラーハンドリング**:
- 未設定時: `Error` をスロー
- エラーメッセージに含まれる情報:
  - 変数名
  - 設定方法の説明
  - 必要なスコープ（GitHub トークンの場合）

#### 7.2.2 オプション環境変数のアクセスメソッド

**メソッド名**: `getGitHubRepository()`, `getReposRoot()`, 他

**目的**: オプション環境変数を取得し、未設定時は `null` を返す

**実装パターン**:
```typescript
public getGitHubRepository(): string | null {
  return this.getEnv('GITHUB_REPOSITORY', false);
}
```

**エラーハンドリング**:
- 未設定時: `null` を返す（例外をスローしない）
- 値のトリム処理: 前後の空白を除去

#### 7.2.3 フォールバックロジックメソッド

**メソッド名**: `getCodexApiKey()`, `getGitCommitUserName()`, `getGitCommitUserEmail()`, `getHomeDir()`

**目的**: 複数の環境変数からフォールバックする

**実装パターン**:
```typescript
public getCodexApiKey(): string | null {
  // CODEX_API_KEY → OPENAI_API_KEY のフォールバック
  return this.getEnvWithFallback('CODEX_API_KEY', 'OPENAI_API_KEY');
}

public getHomeDir(): string {
  // HOME → USERPROFILE のフォールバック（必須）
  const home = this.getEnvWithFallback('HOME', 'USERPROFILE');
  if (!home) {
    throw new Error(
      'HOME or USERPROFILE environment variable is required. ' +
      'Please ensure your system has a valid home directory.'
    );
  }
  return home;
}
```

**フォールバック優先順位**:
1. Codex API キー: `CODEX_API_KEY` → `OPENAI_API_KEY`
2. ホームディレクトリ: `HOME` → `USERPROFILE`
3. Git ユーザー名: `GIT_COMMIT_USER_NAME` → `GIT_AUTHOR_NAME`
4. Git メール: `GIT_COMMIT_USER_EMAIL` → `GIT_AUTHOR_EMAIL`

#### 7.2.4 CI環境判定メソッド

**メソッド名**: `isCI()`

**目的**: CI環境かどうかを判定

**実装パターン**:
```typescript
public isCI(): boolean {
  const ci = this.getEnv('CI', false);
  const jenkinsHome = this.getEnv('JENKINS_HOME', false);
  return ci === 'true' || ci === '1' || !!jenkinsHome;
}
```

**判定ロジック**:
- `CI=true` または `CI=1` が設定されている場合: `true`
- `JENKINS_HOME` が設定されている場合: `true`
- それ以外: `false`

### 7.3 データ構造設計

該当なし（環境変数アクセスのみ）

### 7.4 インターフェース設計

#### 7.4.1 公開API

**エクスポートされる要素**:
```typescript
export interface IConfig { ... }  // インターフェース
export class Config { ... }       // クラス
export const config: Config;      // Singletonインスタンス
```

**使用方法**:
```typescript
// アプリケーションコード
import { config } from '@/core/config';

// 必須環境変数（未設定時は例外）
const token = config.getGitHubToken();

// オプション環境変数（未設定時は null）
const reposRoot = config.getReposRoot();
if (reposRoot) {
  // 使用
}

// フォールバック
const apiKey = config.getCodexApiKey(); // CODEX_API_KEY || OPENAI_API_KEY

// CI環境判定
if (config.isCI()) {
  // CI環境での処理
}
```

#### 7.4.2 テスト用モック

**モックパターン**:
```typescript
// テストファイル
import { config } from '@/core/config';

jest.mock('@/core/config', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'mock-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getCodexApiKey: jest.fn(() => 'mock-api-key'),
    getHomeDir: jest.fn(() => '/home/user'),
    isCI: jest.fn(() => false),
    // 他のメソッドも同様
  },
}));

// テストケース
test('should use mocked config', () => {
  expect(config.getGitHubToken()).toBe('mock-token');
});
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

**該当なし**（環境変数の読み取りのみ、認証情報の生成・検証は行わない）

### 8.2 データ保護

#### 8.2.1 環境変数の値をログに出力しない

**方針**: エラーメッセージには変数名のみを含め、値は含めない

**実装例**:
```typescript
public getGitHubToken(): string {
  const token = this.getEnv('GITHUB_TOKEN', true);
  if (!token) {
    // ❌ 悪い例: throw new Error(`Token not found: ${token}`);
    // ✅ 良い例: throw new Error('GITHUB_TOKEN environment variable is required');
    throw new Error('GITHUB_TOKEN environment variable is required. ...');
  }
  return token;
}
```

#### 8.2.2 SecretMasker との統合

**現状の問題**:
- `src/core/secret-masker.ts` は環境変数名を直接ハードコードしている
- Config クラスと重複した環境変数リストが存在

**推奨対応**（本Issueのスコープ外、将来的な改善として記録）:
1. SecretMasker が Config クラスから環境変数リストを取得するように変更
2. または、Config クラスに `getSecretEnvVarNames(): string[]` メソッドを追加

### 8.3 セキュリティリスクと対策

| リスク | 対策 |
|--------|------|
| 環境変数の値がログに漏洩 | エラーメッセージに値を含めない |
| 環境変数の値がエージェントログに漏洩 | SecretMasker により自動的にマスキング（既存機能） |
| 不正な環境変数の設定 | 必須環境変数の検証により早期検出 |
| 環境変数の値の改ざん | `process.env` は読み取り専用として扱う（値の上書きは最小限に） |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**要件**: Config クラスのメソッド呼び出しが既存の `process.env` アクセスと同等以上のパフォーマンスを持つ

**対応**:
1. **メソッド呼び出しのオーバーヘッドは無視できるレベル**:
   - `getEnv()` メソッドは `process.env[key]` へのアクセスと `trim()` のみ
   - オーバーヘッド: 1回あたり 1μs 未満（無視できる）
2. **環境変数の値をキャッシュしない**:
   - 実行時の動的変更に対応（例: `process.env.GIT_COMMIT_USER_NAME = 'new-value'`）
   - CI環境でのテスト時に環境変数を動的に変更可能

**ベンチマーク目標**:
- 100回連続呼び出し: 合計実行時間 10ms 未満

### 9.2 スケーラビリティ

**該当なし**（環境変数アクセスはスケーリング不要）

### 9.3 保守性

**要件**: 新規環境変数の追加が Config クラスの1箇所で完結し、全コードベースで即座に利用可能

**対応**:
1. **新規環境変数の追加手順**:
   - IConfig インターフェースにメソッドを追加
   - Config クラスに実装を追加
   - JSDoc コメントを追加
   - 既存メソッドの変更不要
2. **既存メソッドへの影響なし**:
   - 新規メソッドは既存メソッドと独立
3. **型安全性**:
   - TypeScript コンパイラが未実装メソッドを検出

**例**:
```typescript
// IConfig インターフェースに追加
export interface IConfig {
  // ...既存メソッド

  /**
   * 新規環境変数 NEW_VAR を取得
   * @returns 値、または未設定の場合は null
   */
  getNewVar(): string | null;
}

// Config クラスに実装を追加
export class Config implements IConfig {
  // ...既存メソッド

  public getNewVar(): string | null {
    return this.getEnv('NEW_VAR', false);
  }
}
```

---

## 10. 実装の順序

### 10.1 実装順序の推奨

以下の順序で実装を進めることを推奨します：

#### Phase 1: Config クラスの実装（2~3時間）
1. **ファイル作成**: `src/core/config.ts`
2. **インターフェース定義**: `IConfig` インターフェースの実装
3. **クラス実装**: `Config` クラスの実装
   - プライベートヘルパーメソッド（`getEnv()`, `getEnvWithFallback()`）
   - 全14個のpublicメソッド
4. **Singleton インスタンスのエクスポート**: `export const config = new Config();`
5. **JSDoc コメントの追加**: すべてのメソッドにドキュメントコメントを追加
6. **TypeScript コンパイル確認**: `npm run build` でエラーがないことを確認

#### Phase 2: commands/ の置き換え（2~3時間）
1. **`src/commands/execute.ts`** の置き換え（約17箇所）:
   - インポート文の追加
   - `process.env.GIT_COMMIT_USER_NAME` → `config.getGitCommitUserName()`
   - `process.env.GIT_COMMIT_USER_EMAIL` → `config.getGitCommitUserEmail()`
   - `process.env.HOME` → `config.getHomeDir()`
   - `process.env.CLAUDE_CODE_CREDENTIALS_PATH` → `config.getClaudeCredentialsPath()`
   - `process.env.CODEX_API_KEY` / `process.env.OPENAI_API_KEY` → `config.getCodexApiKey()`
   - `process.env.GITHUB_TOKEN` → `config.getGitHubToken()`
   - `process.env.GITHUB_REPOSITORY` → `config.getGitHubRepository()`
2. **`src/commands/init.ts`** の置き換え（約1箇所）:
   - 環境変数アクセスを確認し、Config メソッドに置き換え

#### Phase 3: core/ の置き換え（3~4時間）
1. **`src/core/repository-utils.ts`** の置き換え（3箇所）:
   - `process.env.REPOS_ROOT` → `config.getReposRoot()`
   - `process.env.HOME` / `process.env.USERPROFILE` → `config.getHomeDir()`
2. **`src/core/github-client.ts`** の置き換え（2箇所）:
   - `process.env.GITHUB_TOKEN` → `config.getGitHubToken()`
   - `process.env.GITHUB_REPOSITORY` → `config.getGitHubRepository()`
3. **`src/core/codex-agent-client.ts`** の置き換え（1箇所）:
   - `process.env.CODEX_CLI_PATH` → `config.getCodexCliPath()`
4. **`src/core/claude-agent-client.ts`** の置き換え（5箇所）:
   - `process.env.CLAUDE_CODE_CREDENTIALS_PATH` → `config.getClaudeCredentialsPath()`
   - `process.env.CLAUDE_CODE_OAUTH_TOKEN` → `config.getClaudeOAuthToken()`
   - `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` → `config.getClaudeDangerouslySkipPermissions()`
5. **`src/core/content-parser.ts`** の置き換え（1箇所）:
   - `process.env.OPENAI_API_KEY` → `config.getCodexApiKey()` （フォールバック含む）
6. **`src/core/git/commit-manager.ts`** の置き換え（4箇所）:
   - `process.env.GIT_COMMIT_USER_NAME` → `config.getGitCommitUserName()`
   - `process.env.GIT_COMMIT_USER_EMAIL` → `config.getGitCommitUserEmail()`
   - `process.env.GIT_AUTHOR_NAME` → （既にフォールバック済み、変更不要）
   - `process.env.GIT_AUTHOR_EMAIL` → （既にフォールバック済み、変更不要）
7. **`src/core/git/remote-manager.ts`** の置き換え（1箇所）:
   - `process.env.GITHUB_TOKEN` → `config.getGitHubToken()`

#### Phase 4: phases/ と utils/ の置き換え（1~2時間）
1. **`src/phases/base-phase.ts`** の置き換え（1箇所）:
   - `process.env.CI` → `config.isCI()`
2. **`src/utils/logger.ts`** の置き換え（2箇所）:
   - `process.env.LOG_LEVEL` → `config.getLogLevel()`
   - `process.env.LOG_NO_COLOR` → `config.getLogNoColor()`
3. **`src/core/logger.ts`** の置き換え（推奨、1箇所）:
   - `process.env.LOG_LEVEL` → `config.getLogLevel()`

#### Phase 5: テストコード実装（2~2.5時間）
1. **`tests/unit/core/config.test.ts`** の作成:
   - 全メソッドのテストケース実装
   - 必須環境変数が未設定の場合の例外テスト
   - オプション環境変数が未設定の場合の null 返却テスト
   - フォールバックロジックのテスト
   - CI環境判定ロジックのテスト
   - エッジケースのテスト（環境変数未設定、空文字列、トリミング）
2. **カバレッジ100%の達成**:
   - すべてのpublicメソッドをテスト
   - すべてのprivateメソッドを間接的にテスト

#### Phase 6: 既存テストの更新（1~1.5時間）
1. **既存テストの動作確認**:
   - `npm run test:unit` を実行
   - 失敗したテストを特定
2. **Config モックの追加**:
   - `jest.mock('@/core/config')` パターンの適用
   - 各テストファイルに Config モックを追加
3. **統合テストの動作確認**:
   - `npm run test:integration` を実行
   - 環境変数設定の確認
4. **テスト修正**:
   - 失敗したテストの修正

#### Phase 7: ドキュメント更新（0.5~1時間）
1. **CLAUDE.md の更新**:
   - 「環境変数」セクションに Config クラスの使用方法を追記
   - 「重要な制約事項」に Config 使用ルールを追記
2. **README.md の更新**:
   - 環境変数一覧セクションの見直し
   - Config クラスの概要を追記（必要に応じて）

#### Phase 8: 最終確認（0.5~1時間）
1. **TypeScript コンパイル確認**: `npm run build`
2. **ESLint 確認**: `npx eslint --ext .ts src`
3. **全テスト実行**: `npm test`
4. **置き換え漏れチェック**: `grep -r "process\.env\." src/` で Config クラス以外のファイルにヒットしないことを確認
5. **実装完了レポートの作成**:
   - 置き換え済みファイル一覧
   - テスト結果サマリー
   - 後方互換性の確認結果

### 10.2 依存関係の考慮

**並行作業可能なフェーズ**:
- Phase 1（Config クラス実装）完了後、Phase 2～4 は並行可能（ただし、Phase 2 を優先推奨）
- Phase 5（テストコード実装）は Phase 1 完了後に開始可能

**順次実行が必要なフェーズ**:
- Phase 1 → Phase 2～4 → Phase 6 → Phase 7 → Phase 8
- Phase 5 は Phase 1 完了後に開始可能（Phase 2～4 と並行可能）

---

## 11. 品質ゲート（Phase 2）

設計書は以下の品質ゲートを満たしています：

- [x] **実装戦略の判断根拠が明記されている（CREATE）**: セクション2で詳細に記載
- [x] **テスト戦略の判断根拠が明記されている（UNIT_ONLY）**: セクション3で詳細に記載
- [x] **テストコード戦略の判断根拠が明記されている（CREATE_TEST）**: セクション4で詳細に記載
- [x] **既存コードへの影響範囲が分析されている**: セクション5.1で12ファイルの影響を詳細分析
- [x] **変更が必要なファイルがリストアップされている**: セクション6で新規作成・修正・削除ファイルを列挙
- [x] **設計が実装可能である**: セクション7で詳細なクラス設計、メソッド設計、実装パターンを提示

---

## 12. 制約事項と前提条件

### 12.1 技術的制約

1. **使用技術**: TypeScript 5.6.3、Node.js 20 以上
2. **既存アーキテクチャとの整合性**: Singleton パターンで実装し、依存性注入（DI）は不要
3. **外部ライブラリ**: 標準ライブラリのみ使用（新規依存関係の追加なし）
4. **既存テストの互換性**: Config モックにより既存テストが無変更で動作する

### 12.2 リソース制約

1. **時間**: 2～3日（16～24時間）
2. **人員**: 1名（AI Workflow Agent）
3. **予算**: なし（追加コストなし）

### 12.3 ポリシー制約

1. **セキュリティポリシー**: 環境変数の値をログやエラーメッセージに含めない
2. **コーディング規約**: ESLint ルール準拠（`no-console` ルールによる `logger` 使用強制）
3. **テストカバレッジ**: Config クラスのユニットテストカバレッジ 90% 以上
4. **ドキュメント**: CLAUDE.md および README.md の更新必須

---

## 13. リスク管理

### 13.1 主要リスクと軽減策

| リスク | 影響度 | 確率 | 軽減策 |
|--------|--------|------|--------|
| **置き換え漏れによる不整合** | 中 | 中 | - 実装開始前に `grep -r "process\.env" src/` で全箇所をリストアップ<br>- Phase 4 各タスク完了後、再度 grep でチェック<br>- PR レビュー時にチェックリストで確認<br>- ESLint ルール追加を検討（`no-process-env` ルール） |
| **既存テストの破壊** | 中 | 低 | - Phase 6 で既存テストを段階的に更新<br>- 各モジュール置き換え後、即座にユニットテストを実行<br>- CI環境でのテスト実行を必須化（PR マージ前） |
| **CI/CD 環境での動作不良** | 高 | 低 | - Jenkins 環境での統合テスト実行<br>- Docker コンテナでの動作確認<br>- 環境変数のバリデーションエラーメッセージを明確に<br>- Config クラスの初期化時にエラーをスローし、早期に問題を検出 |
| **フォールバックロジックの変更による副作用** | 中 | 低 | - 既存のフォールバックロジックを完全に保持<br>- Phase 1 で現状のフォールバック一覧を作成<br>- Phase 5 でフォールバックロジックのテストシナリオを作成<br>- ユニットテストでフォールバックの動作を保証 |
| **型安全性の不整合** | 低 | 低 | - TypeScript の厳格な型チェックを活用<br>- 必須環境変数は `string` 型を返す（null 不可）<br>- オプション環境変数は `string \| null` 型を返す<br>- コンパイルエラーで型の不整合を早期検出 |

### 13.2 コンティンジェンシープラン

**置き換え漏れが発見された場合**:
1. 漏れたファイルを特定
2. Config メソッドに置き換え
3. ユニットテストを実行
4. 追加で grep チェックを実施

**既存テストが失敗した場合**:
1. 失敗したテストを特定
2. Config モックを追加
3. テストを再実行
4. 必要に応じてテストコードを修正

**CI/CD 環境で動作不良が発生した場合**:
1. エラーメッセージを確認
2. 環境変数設定を確認
3. Config クラスのバリデーションロジックを確認
4. 必要に応じて Config クラスを修正

---

## 14. 成功基準（Definition of Done）

### 14.1 機能的成功基準

1. **Config クラスの完成**
   - 全環境変数アクセスメソッドが実装されている（14個）
   - 必須環境変数の検証が動作している
   - フォールバックロジックが正しく動作している
   - Singleton パターンが正しく実装されている

2. **既存コードの置き換え完了**
   - 全ファイルで `process.env` の直接アクセスが `config` 経由に変更されている（11ファイル）
   - TypeScript コンパイルエラーがゼロ
   - ESLint エラーがゼロ

3. **テストの完成**
   - Config クラスのユニットテストカバレッジが90%以上
   - 全ユニットテストが成功
   - 全統合テストが成功

### 14.2 非機能的成功基準

1. **後方互換性**
   - 既存の環境変数設定で動作する
   - Docker / Jenkins 環境で追加設定不要

2. **テスト容易性**
   - Config モジュールをモックすることでテストが容易になる
   - 既存テストの大半が Config モックで動作する

3. **保守性**
   - 環境変数の追加・変更が Config クラスの1箇所で完結する
   - エラーメッセージが明確で、トラブルシューティングが容易

4. **文書化**
   - CLAUDE.md と README.md が更新されている
   - Config クラスの JSDoc が充実している

---

## 15. 参考資料

### 15.1 プロジェクトドキュメント

- **CLAUDE.md**: プロジェクトの全体方針、環境変数一覧、コーディング規約
- **ARCHITECTURE.md**: アーキテクチャ設計思想、モジュール構成、設計パターン
- **README.md**: プロジェクト概要、環境変数一覧、使用方法

### 15.2 Issue 関連ドキュメント

- **Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/51
- **Planning Document**: `.ai-workflow/issue-51/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-51/01_requirements/output/requirements.md`

### 15.3 関連ファイル

- **既存の環境変数アクセスファイル**:
  - `src/commands/execute.ts`
  - `src/core/claude-agent-client.ts`
  - `src/core/codex-agent-client.ts`
  - `src/core/git/commit-manager.ts`
  - `src/core/git/remote-manager.ts`
  - `src/core/github-client.ts`
  - `src/core/repository-utils.ts`
  - `src/utils/logger.ts`
  - `src/phases/base-phase.ts`

- **環境変数セットアップヘルパー**:
  - `src/core/helpers/env-setup.ts`

- **シークレットマスキング**:
  - `src/core/secret-masker.ts`

---

**設計書バージョン**: 1.0
**作成者**: AI Workflow Agent (Design Phase)
**作成日**: 2025-01-29
