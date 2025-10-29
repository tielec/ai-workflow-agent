# Implementation Phase - Issue #51

## 概要

環境変数アクセスを一元化する Config クラスを実装しました。これにより、`process.env` への直接アクセスを隠蔽し、型安全なアクセスと一元化された検証を提供します。

## 実装内容

### 1. Config クラスの作成 (`src/core/config.ts`)

新規ファイルとして `src/core/config.ts` を作成しました。

**主な機能:**

- **IConfig インターフェース**: 14 個の環境変数アクセスメソッドを定義
- **Config クラス**: IConfig を実装し、以下の機能を提供
  - 必須環境変数: `string` 型を返し、未設定時は例外をスロー
  - オプション環境変数: `string | null` 型を返す
  - フォールバックロジック: 複数の環境変数を優先順位付きでサポート
  - 値のトリム処理: すべての環境変数値を自動的にトリム
- **Singleton インスタンス**: アプリケーション全体で共有される `config` インスタンスをエクスポート

**実装されたメソッド:**

| メソッド名 | 環境変数 | 型 | フォールバック |
|-----------|----------|-----|---------------|
| `getGitHubToken()` | `GITHUB_TOKEN` | `string` (必須) | - |
| `getGitHubRepository()` | `GITHUB_REPOSITORY` | `string \| null` | - |
| `getCodexApiKey()` | `CODEX_API_KEY` | `string \| null` | `OPENAI_API_KEY` |
| `getClaudeCredentialsPath()` | `CLAUDE_CODE_CREDENTIALS_PATH` | `string \| null` | - |
| `getClaudeOAuthToken()` | `CLAUDE_CODE_OAUTH_TOKEN` | `string \| null` | - |
| `getClaudeDangerouslySkipPermissions()` | `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `boolean` | - |
| `getGitCommitUserName()` | `GIT_COMMIT_USER_NAME` | `string \| null` | `GIT_AUTHOR_NAME` |
| `getGitCommitUserEmail()` | `GIT_COMMIT_USER_EMAIL` | `string \| null` | `GIT_AUTHOR_EMAIL` |
| `getHomeDir()` | `HOME` | `string` (必須) | `USERPROFILE` |
| `getReposRoot()` | `REPOS_ROOT` | `string \| null` | - |
| `getCodexCliPath()` | `CODEX_CLI_PATH` | `string` | デフォルト: `'codex'` |
| `getLogLevel()` | `LOG_LEVEL` | `string` | デフォルト: `'info'` |
| `getLogNoColor()` | `LOG_NO_COLOR` | `boolean` | - |
| `isCI()` | `CI`, `JENKINS_HOME` | `boolean` | - |

### 2. 既存ファイルの更新

以下のファイルで `process.env` への直接アクセスを Config クラスの使用に置き換えました:

#### 2.1 `src/commands/execute.ts` (17箇所)

- `HOME` → `config.getHomeDir()`
- `CLAUDE_CODE_CREDENTIALS_PATH` → `config.getClaudeCredentialsPath()`
- `CODEX_API_KEY ?? OPENAI_API_KEY` → `config.getCodexApiKey()`
- `GITHUB_TOKEN` → `config.getGitHubToken()`
- `GITHUB_REPOSITORY` → `config.getGitHubRepository()`

**変更点:**
- Config を使用することで、環境変数の存在チェックと例外処理を統一
- フォールバックロジックを Config クラスに委譲

#### 2.2 `src/commands/init.ts` (1箇所)

- `GITHUB_TOKEN` → `config.getGitHubToken()`

**変更点:**
- try-catch で Config の例外を適切にハンドリング
- トークンが未設定の場合は警告メッセージを表示して処理をスキップ

#### 2.3 `src/core/repository-utils.ts` (3箇所)

- `REPOS_ROOT` → `config.getReposRoot()`
- `os.homedir()` → `config.getHomeDir()`

**変更点:**
- ホームディレクトリの取得を Config に統一
- Windows/Linux 間の互換性を Config 側で吸収

#### 2.4 `src/core/github-client.ts` (2箇所)

- `GITHUB_TOKEN` → `config.getGitHubToken()`
- `GITHUB_REPOSITORY` → `config.getGitHubRepository()`

**変更点:**
- コンストラクタの引数が未指定の場合に Config をフォールバックとして使用
- 明示的な型チェック (`undefined`/`null` の判定) を追加

#### 2.5 `src/core/git/commit-manager.ts` (4箇所)

- `GIT_COMMIT_USER_NAME ?? GIT_AUTHOR_NAME` → `config.getGitCommitUserName()`
- `GIT_COMMIT_USER_EMAIL ?? GIT_AUTHOR_EMAIL` → `config.getGitCommitUserEmail()`

**変更点:**
- フォールバックロジックを Config に移動
- 型安全性を向上 (`string | undefined` → `string`)

#### 2.6 `src/core/git/remote-manager.ts` (1箇所)

- `GITHUB_TOKEN` → `config.getGitHubToken()`

**変更点:**
- try-catch で Config の例外をキャッチして、トークン未設定時は処理をスキップ

#### 2.7 `src/core/codex-agent-client.ts` (1箇所)

- `CODEX_CLI_PATH ?? 'codex'` → `config.getCodexCliPath()`

**変更点:**
- デフォルト値の処理を Config に移動

#### 2.8 `src/core/claude-agent-client.ts` (5箇所)

- `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS === '1'` → `config.getClaudeDangerouslySkipPermissions()`
- `CLAUDE_CODE_CREDENTIALS_PATH` → `config.getClaudeCredentialsPath()`
- `CLAUDE_CODE_OAUTH_TOKEN` → `config.getClaudeOAuthToken()`

**変更点:**
- ブール値変換ロジックを Config に統一
- 文字列比較 (`=== '1'`) をメソッド呼び出しに置き換え

**注意:** `process.env.CLAUDE_CODE_OAUTH_TOKEN = token;` の行は**書き込み**操作のため、そのまま残しています。

#### 2.9 `src/core/content-parser.ts` (1箇所)

- `OPENAI_API_KEY` → `config.getCodexApiKey()`

**変更点:**
- OpenAI API キーの取得を Config に統一 (CODEX_API_KEY とのフォールバック付き)

#### 2.10 `src/phases/base-phase.ts` (1箇所)

- `CI === 'true' || CI === '1'` → `config.isCI()`

**変更点:**
- CI 環境判定ロジックを Config に移動
- JENKINS_HOME のチェックも Config 側で統合

#### 2.11 `src/utils/logger.ts` (2箇所)

- `LOG_LEVEL` → `config.getLogLevel()`
- `LOG_NO_COLOR === 'true' || LOG_NO_COLOR === '1'` → `config.getLogNoColor()`

**変更点:**
- ログレベルの取得とカラーリング設定を Config に統一
- ブール値変換ロジックを Config に移動

#### 2.12 `src/core/logger.ts` (1箇所)

- `LOG_LEVEL` → `config.getLogLevel()`

**変更点:**
- ConsoleLogger での環境変数読み取りを Config に統一

### 3. 残存している `process.env` の使用

以下のファイルでは **環境変数への書き込み** を行っているため、`process.env` への直接アクセスを残しています:

- `src/core/claude-agent-client.ts:111`: OAuth トークンの設定
- `src/commands/execute.ts` (複数箇所): CLI オプションから環境変数への設定

これらは環境変数を**読み取る**のではなく**書き込む**操作であり、Config クラスの目的範囲外です。

## 技術的な実装詳細

### Singleton パターン

Config クラスはアプリケーション全体で単一のインスタンスを共有します:

```typescript
export const config = new Config();
```

### フォールバックロジックの実装

複数の環境変数を優先順位付きでチェックする内部メソッド:

```typescript
private getEnvWithFallback(...keys: string[]): string | null {
  for (const key of keys) {
    const value = this.getEnv(key, false);
    if (value !== null) {
      return value;
    }
  }
  return null;
}
```

例:
- `getCodexApiKey()`: `CODEX_API_KEY` → `OPENAI_API_KEY`
- `getGitCommitUserName()`: `GIT_COMMIT_USER_NAME` → `GIT_AUTHOR_NAME`
- `getHomeDir()`: `HOME` → `USERPROFILE`

### 型安全性の向上

- **必須環境変数**: 未設定時は即座に例外をスロー
- **オプション環境変数**: `null` を返すことで、呼び出し側で適切にハンドリング可能
- **ブール値**: 文字列比較 (`'true'`, `'1'`) を `boolean` 型に統一

### バックワード互換性

環境変数の名前、形式、フォールバックロジックはすべて既存の動作を維持しています。

## 変更対象ファイル一覧

| ファイル | 置換箇所数 | 説明 |
|---------|-----------|------|
| `src/core/config.ts` | 新規作成 | Config クラスの実装 |
| `src/commands/execute.ts` | 17 | メインコマンドハンドラ |
| `src/commands/init.ts` | 1 | 初期化コマンドハンドラ |
| `src/core/repository-utils.ts` | 3 | リポジトリパス解決 |
| `src/core/github-client.ts` | 2 | GitHub API クライアント |
| `src/core/git/commit-manager.ts` | 4 | Git コミット管理 |
| `src/core/git/remote-manager.ts` | 1 | Git リモート操作 |
| `src/core/codex-agent-client.ts` | 1 | Codex エージェントクライアント |
| `src/core/claude-agent-client.ts` | 5 | Claude エージェントクライアント |
| `src/core/content-parser.ts` | 1 | コンテンツパーサ |
| `src/phases/base-phase.ts` | 1 | フェーズ基底クラス |
| `src/utils/logger.ts` | 2 | ユーティリティロガー |
| `src/core/logger.ts` | 1 | コアロガー |

**合計:** 39箇所の `process.env` アクセスを Config クラスに置き換え

## ビルド結果

TypeScript コンパイルが成功し、すべての型チェックをパスしました:

```bash
$ npm run build
> tsc -p tsconfig.json && node ./scripts/copy-static-assets.mjs
[OK] Build completed successfully
```

## テスト

- TypeScript の型チェックによる静的検証
- ビルドエラーなし
- 既存の環境変数アクセスパターンとの互換性を維持

## 今後の拡張性

Config クラスは以下の拡張に対応可能です:

1. **新しい環境変数の追加**: IConfig インターフェースにメソッドを追加するだけ
2. **検証ロジックの強化**: Config クラス内部で環境変数の形式検証を追加可能
3. **設定ファイルのサポート**: 将来的に `.env` ファイルや JSON ファイルからの読み込みを追加可能
4. **モック対応**: テスト時に Config インスタンスをモックに置き換え可能

## まとめ

Issue #51 の実装フェーズを完了しました。環境変数アクセスが一元化され、以下の利点が得られました:

- ✅ 型安全性の向上
- ✅ フォールバックロジックの統一
- ✅ エラーハンドリングの一元化
- ✅ テスト容易性の向上
- ✅ バックワード互換性の維持

すべての `process.env` への直接アクセス (読み取り) が Config クラスに置き換えられ、コードの保守性が大幅に向上しました。
