# テストシナリオ: Issue #51

**Issue番号**: #51
**タイトル**: 機能追加: 環境変数アクセスを一元化する設定管理を追加
**重要度**: MEDIUM
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/51
**作成日**: 2025-01-29

---

## 0. Planning Documentの確認

Planning Phase で策定されたテスト戦略を確認しました：

### テスト戦略
- **戦略**: UNIT_ONLY（ユニットテストのみ）
- **判断根拠**:
  - Config クラスは純粋な環境変数アクセスロジックで外部依存がなく、`process.env` のみにアクセス
  - 既存の統合テストは Config モックにより動作継続
  - BDD 不要（エンドユーザー向け機能ではなく、内部アーキテクチャの改善）
  - ユニットテストのみで以下を保証可能:
    - 必須環境変数が未設定の場合の例外スロー
    - オプション環境変数が未設定の場合の `null` 返却
    - フォールバックロジックの正常動作（`CODEX_API_KEY` → `OPENAI_API_KEY`）
    - CI環境判定ロジック（`CI=true`, `JENKINS_HOME`）

### テストカバレッジ目標
- **90%以上**（Planning Document の品質ゲートより）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_ONLY**

### テスト対象の範囲
- **Config クラス**: `src/core/config.ts`
  - 14個のpublicメソッド
  - 2個のprivateヘルパーメソッド（間接的にテスト）

### テストの目的
1. **必須環境変数の検証**: 必須環境変数が未設定の場合、明確なエラーメッセージとともに例外をスローすることを保証
2. **オプション環境変数の取得**: オプション環境変数が未設定の場合、`null` を返し、例外をスローしないことを保証
3. **フォールバックロジックの動作**: 複数の環境変数からフォールバックするロジックが正しく動作することを保証
4. **CI環境判定**: CI環境かどうかを正しく判定することを保証
5. **値のトリム処理**: 環境変数の値の前後の空白が正しく除去されることを保証
6. **型安全性**: 必須環境変数は `string` 型、オプション環境変数は `string | null` 型を返すことを保証

---

## 2. Unitテストシナリオ

### 2.1 GitHub関連メソッド

#### 2.1.1 getGitHubToken() - 正常系

**テストケース名**: `getGitHubToken_正常系_トークンが設定されている場合`

- **目的**: `GITHUB_TOKEN` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.GITHUB_TOKEN` が設定されている
- **入力**: `process.env.GITHUB_TOKEN = 'ghp_test_token_123'`
- **期待結果**: `'ghp_test_token_123'` が返される
- **テストデータ**:
  ```typescript
  process.env.GITHUB_TOKEN = 'ghp_test_token_123';
  ```

**テストケース名**: `getGitHubToken_正常系_トークンの前後に空白がある場合`

- **目的**: `GITHUB_TOKEN` の値がトリムされて返されることを検証
- **前提条件**: `process.env.GITHUB_TOKEN` が設定されている（前後に空白あり）
- **入力**: `process.env.GITHUB_TOKEN = '  ghp_test_token_123  '`
- **期待結果**: `'ghp_test_token_123'` が返される（空白除去済み）
- **テストデータ**:
  ```typescript
  process.env.GITHUB_TOKEN = '  ghp_test_token_123  ';
  ```

#### 2.1.2 getGitHubToken() - 異常系

**テストケース名**: `getGitHubToken_異常系_トークンが未設定の場合`

- **目的**: `GITHUB_TOKEN` が未設定の場合、例外がスローされることを検証
- **前提条件**: `process.env.GITHUB_TOKEN` が未設定（undefined）
- **入力**: `delete process.env.GITHUB_TOKEN;`
- **期待結果**: `Error` がスローされる
- **エラーメッセージ**: `'GITHUB_TOKEN environment variable is required. Please set your GitHub personal access token with repo, workflow, and read:org scopes.'`
- **テストデータ**: なし

**テストケース名**: `getGitHubToken_異常系_トークンが空文字列の場合`

- **目的**: `GITHUB_TOKEN` が空文字列の場合、例外がスローされることを検証
- **前提条件**: `process.env.GITHUB_TOKEN` が空文字列
- **入力**: `process.env.GITHUB_TOKEN = '';`
- **期待結果**: `Error` がスローされる
- **テストデータ**:
  ```typescript
  process.env.GITHUB_TOKEN = '';
  ```

**テストケース名**: `getGitHubToken_異常系_トークンが空白のみの場合`

- **目的**: `GITHUB_TOKEN` が空白のみの場合、例外がスローされることを検証
- **前提条件**: `process.env.GITHUB_TOKEN` が空白のみ
- **入力**: `process.env.GITHUB_TOKEN = '   ';`
- **期待結果**: `Error` がスローされる
- **テストデータ**:
  ```typescript
  process.env.GITHUB_TOKEN = '   ';
  ```

#### 2.1.3 getGitHubRepository() - 正常系

**テストケース名**: `getGitHubRepository_正常系_リポジトリ名が設定されている場合`

- **目的**: `GITHUB_REPOSITORY` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.GITHUB_REPOSITORY` が設定されている
- **入力**: `process.env.GITHUB_REPOSITORY = 'owner/repo'`
- **期待結果**: `'owner/repo'` が返される
- **テストデータ**:
  ```typescript
  process.env.GITHUB_REPOSITORY = 'owner/repo';
  ```

**テストケース名**: `getGitHubRepository_正常系_リポジトリ名が未設定の場合`

- **目的**: `GITHUB_REPOSITORY` が未設定の場合、`null` が返されることを検証
- **前提条件**: `process.env.GITHUB_REPOSITORY` が未設定
- **入力**: `delete process.env.GITHUB_REPOSITORY;`
- **期待結果**: `null` が返される（例外をスローしない）
- **テストデータ**: なし

**テストケース名**: `getGitHubRepository_正常系_リポジトリ名の前後に空白がある場合`

- **目的**: `GITHUB_REPOSITORY` の値がトリムされて返されることを検証
- **前提条件**: `process.env.GITHUB_REPOSITORY` が設定されている（前後に空白あり）
- **入力**: `process.env.GITHUB_REPOSITORY = '  owner/repo  '`
- **期待結果**: `'owner/repo'` が返される（空白除去済み）
- **テストデータ**:
  ```typescript
  process.env.GITHUB_REPOSITORY = '  owner/repo  ';
  ```

#### 2.1.4 getGitHubRepository() - エッジケース

**テストケース名**: `getGitHubRepository_エッジケース_空文字列の場合`

- **目的**: `GITHUB_REPOSITORY` が空文字列の場合、`null` が返されることを検証
- **前提条件**: `process.env.GITHUB_REPOSITORY` が空文字列
- **入力**: `process.env.GITHUB_REPOSITORY = '';`
- **期待結果**: `null` が返される
- **テストデータ**:
  ```typescript
  process.env.GITHUB_REPOSITORY = '';
  ```

**テストケース名**: `getGitHubRepository_エッジケース_空白のみの場合`

- **目的**: `GITHUB_REPOSITORY` が空白のみの場合、`null` が返されることを検証
- **前提条件**: `process.env.GITHUB_REPOSITORY` が空白のみ
- **入力**: `process.env.GITHUB_REPOSITORY = '   ';`
- **期待結果**: `null` が返される
- **テストデータ**:
  ```typescript
  process.env.GITHUB_REPOSITORY = '   ';
  ```

---

### 2.2 エージェント関連メソッド

#### 2.2.1 getCodexApiKey() - 正常系（フォールバックロジック）

**テストケース名**: `getCodexApiKey_正常系_CODEX_API_KEYが設定されている場合`

- **目的**: `CODEX_API_KEY` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.CODEX_API_KEY` が設定されている
- **入力**: `process.env.CODEX_API_KEY = 'codex_key_123'`
- **期待結果**: `'codex_key_123'` が返される
- **テストデータ**:
  ```typescript
  process.env.CODEX_API_KEY = 'codex_key_123';
  ```

**テストケース名**: `getCodexApiKey_正常系_CODEX_API_KEY未設定でOPENAI_API_KEYが設定されている場合`

- **目的**: `CODEX_API_KEY` が未設定で `OPENAI_API_KEY` が設定されている場合、`OPENAI_API_KEY` の値が返されることを検証（フォールバック）
- **前提条件**: `process.env.CODEX_API_KEY` が未設定、`process.env.OPENAI_API_KEY` が設定されている
- **入力**:
  ```typescript
  delete process.env.CODEX_API_KEY;
  process.env.OPENAI_API_KEY = 'openai_key_456';
  ```
- **期待結果**: `'openai_key_456'` が返される
- **テストデータ**: 上記

**テストケース名**: `getCodexApiKey_正常系_両方が設定されている場合はCODEX_API_KEYが優先される`

- **目的**: `CODEX_API_KEY` と `OPENAI_API_KEY` の両方が設定されている場合、`CODEX_API_KEY` が優先されることを検証
- **前提条件**: 両方の環境変数が設定されている
- **入力**:
  ```typescript
  process.env.CODEX_API_KEY = 'codex_key_123';
  process.env.OPENAI_API_KEY = 'openai_key_456';
  ```
- **期待結果**: `'codex_key_123'` が返される（`CODEX_API_KEY` が優先）
- **テストデータ**: 上記

**テストケース名**: `getCodexApiKey_正常系_両方が未設定の場合`

- **目的**: `CODEX_API_KEY` と `OPENAI_API_KEY` の両方が未設定の場合、`null` が返されることを検証
- **前提条件**: 両方の環境変数が未設定
- **入力**:
  ```typescript
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_API_KEY;
  ```
- **期待結果**: `null` が返される（例外をスローしない）
- **テストデータ**: なし

#### 2.2.2 getClaudeCredentialsPath() - 正常系

**テストケース名**: `getClaudeCredentialsPath_正常系_パスが設定されている場合`

- **目的**: `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- **入力**: `process.env.CLAUDE_CODE_CREDENTIALS_PATH = '/path/to/credentials'`
- **期待結果**: `'/path/to/credentials'` が返される
- **テストデータ**:
  ```typescript
  process.env.CLAUDE_CODE_CREDENTIALS_PATH = '/path/to/credentials';
  ```

**テストケース名**: `getClaudeCredentialsPath_正常系_パスが未設定の場合`

- **目的**: `CLAUDE_CODE_CREDENTIALS_PATH` が未設定の場合、`null` が返されることを検証
- **前提条件**: `process.env.CLAUDE_CODE_CREDENTIALS_PATH` が未設定
- **入力**: `delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;`
- **期待結果**: `null` が返される
- **テストデータ**: なし

#### 2.2.3 getClaudeOAuthToken() - 正常系

**テストケース名**: `getClaudeOAuthToken_正常系_トークンが設定されている場合`

- **目的**: `CLAUDE_CODE_OAUTH_TOKEN` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.CLAUDE_CODE_OAUTH_TOKEN` が設定されている
- **入力**: `process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth_token_789'`
- **期待結果**: `'oauth_token_789'` が返される
- **テストデータ**:
  ```typescript
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth_token_789';
  ```

**テストケース名**: `getClaudeOAuthToken_正常系_トークンが未設定の場合`

- **目的**: `CLAUDE_CODE_OAUTH_TOKEN` が未設定の場合、`null` が返されることを検証
- **前提条件**: `process.env.CLAUDE_CODE_OAUTH_TOKEN` が未設定
- **入力**: `delete process.env.CLAUDE_CODE_OAUTH_TOKEN;`
- **期待結果**: `null` が返される
- **テストデータ**: なし

#### 2.2.4 getClaudeDangerouslySkipPermissions() - 正常系

**テストケース名**: `getClaudeDangerouslySkipPermissions_正常系_フラグが1の場合`

- **目的**: `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'1'` の場合、`true` が返されることを検証
- **前提条件**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'1'`
- **入力**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'`
- **期待結果**: `true` が返される
- **テストデータ**:
  ```typescript
  process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1';
  ```

**テストケース名**: `getClaudeDangerouslySkipPermissions_正常系_フラグが0の場合`

- **目的**: `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'0'` の場合、`false` が返されることを検証
- **前提条件**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'0'`
- **入力**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '0'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '0';
  ```

**テストケース名**: `getClaudeDangerouslySkipPermissions_正常系_フラグが未設定の場合`

- **目的**: `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が未設定の場合、`false` が返されることを検証
- **前提条件**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が未設定
- **入力**: `delete process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS;`
- **期待結果**: `false` が返される
- **テストデータ**: なし

**テストケース名**: `getClaudeDangerouslySkipPermissions_エッジケース_フラグがtrueの文字列の場合`

- **目的**: `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'true'` の場合、`false` が返されることを検証（`'1'` のみが `true`）
- **前提条件**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` が `'true'`
- **入力**: `process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = 'true'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = 'true';
  ```

---

### 2.3 Git関連メソッド

#### 2.3.1 getGitCommitUserName() - 正常系（フォールバックロジック）

**テストケース名**: `getGitCommitUserName_正常系_GIT_COMMIT_USER_NAMEが設定されている場合`

- **目的**: `GIT_COMMIT_USER_NAME` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.GIT_COMMIT_USER_NAME` が設定されている
- **入力**: `process.env.GIT_COMMIT_USER_NAME = 'John Doe'`
- **期待結果**: `'John Doe'` が返される
- **テストデータ**:
  ```typescript
  process.env.GIT_COMMIT_USER_NAME = 'John Doe';
  ```

**テストケース名**: `getGitCommitUserName_正常系_GIT_COMMIT_USER_NAME未設定でGIT_AUTHOR_NAMEが設定されている場合`

- **目的**: `GIT_COMMIT_USER_NAME` が未設定で `GIT_AUTHOR_NAME` が設定されている場合、`GIT_AUTHOR_NAME` の値が返されることを検証（フォールバック）
- **前提条件**: `process.env.GIT_COMMIT_USER_NAME` が未設定、`process.env.GIT_AUTHOR_NAME` が設定されている
- **入力**:
  ```typescript
  delete process.env.GIT_COMMIT_USER_NAME;
  process.env.GIT_AUTHOR_NAME = 'Jane Smith';
  ```
- **期待結果**: `'Jane Smith'` が返される
- **テストデータ**: 上記

**テストケース名**: `getGitCommitUserName_正常系_両方が未設定の場合`

- **目的**: `GIT_COMMIT_USER_NAME` と `GIT_AUTHOR_NAME` の両方が未設定の場合、`null` が返されることを検証
- **前提条件**: 両方の環境変数が未設定
- **入力**:
  ```typescript
  delete process.env.GIT_COMMIT_USER_NAME;
  delete process.env.GIT_AUTHOR_NAME;
  ```
- **期待結果**: `null` が返される
- **テストデータ**: なし

#### 2.3.2 getGitCommitUserEmail() - 正常系（フォールバックロジック）

**テストケース名**: `getGitCommitUserEmail_正常系_GIT_COMMIT_USER_EMAILが設定されている場合`

- **目的**: `GIT_COMMIT_USER_EMAIL` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.GIT_COMMIT_USER_EMAIL` が設定されている
- **入力**: `process.env.GIT_COMMIT_USER_EMAIL = 'john@example.com'`
- **期待結果**: `'john@example.com'` が返される
- **テストデータ**:
  ```typescript
  process.env.GIT_COMMIT_USER_EMAIL = 'john@example.com';
  ```

**テストケース名**: `getGitCommitUserEmail_正常系_GIT_COMMIT_USER_EMAIL未設定でGIT_AUTHOR_EMAILが設定されている場合`

- **目的**: `GIT_COMMIT_USER_EMAIL` が未設定で `GIT_AUTHOR_EMAIL` が設定されている場合、`GIT_AUTHOR_EMAIL` の値が返されることを検証（フォールバック）
- **前提条件**: `process.env.GIT_COMMIT_USER_EMAIL` が未設定、`process.env.GIT_AUTHOR_EMAIL` が設定されている
- **入力**:
  ```typescript
  delete process.env.GIT_COMMIT_USER_EMAIL;
  process.env.GIT_AUTHOR_EMAIL = 'jane@example.com';
  ```
- **期待結果**: `'jane@example.com'` が返される
- **テストデータ**: 上記

**テストケース名**: `getGitCommitUserEmail_正常系_両方が未設定の場合`

- **目的**: `GIT_COMMIT_USER_EMAIL` と `GIT_AUTHOR_EMAIL` の両方が未設定の場合、`null` が返されることを検証
- **前提条件**: 両方の環境変数が未設定
- **入力**:
  ```typescript
  delete process.env.GIT_COMMIT_USER_EMAIL;
  delete process.env.GIT_AUTHOR_EMAIL;
  ```
- **期待結果**: `null` が返される
- **テストデータ**: なし

---

### 2.4 パス関連メソッド

#### 2.4.1 getHomeDir() - 正常系（フォールバックロジック、必須）

**テストケース名**: `getHomeDir_正常系_HOMEが設定されている場合`

- **目的**: `HOME` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.HOME` が設定されている
- **入力**: `process.env.HOME = '/home/user'`
- **期待結果**: `'/home/user'` が返される
- **テストデータ**:
  ```typescript
  process.env.HOME = '/home/user';
  ```

**テストケース名**: `getHomeDir_正常系_HOME未設定でUSERPROFILEが設定されている場合`

- **目的**: `HOME` が未設定で `USERPROFILE` が設定されている場合、`USERPROFILE` の値が返されることを検証（フォールバック）
- **前提条件**: `process.env.HOME` が未設定、`process.env.USERPROFILE` が設定されている
- **入力**:
  ```typescript
  delete process.env.HOME;
  process.env.USERPROFILE = 'C:\\Users\\User';
  ```
- **期待結果**: `'C:\\Users\\User'` が返される
- **テストデータ**: 上記

**テストケース名**: `getHomeDir_正常系_両方が設定されている場合はHOMEが優先される`

- **目的**: `HOME` と `USERPROFILE` の両方が設定されている場合、`HOME` が優先されることを検証
- **前提条件**: 両方の環境変数が設定されている
- **入力**:
  ```typescript
  process.env.HOME = '/home/user';
  process.env.USERPROFILE = 'C:\\Users\\User';
  ```
- **期待結果**: `'/home/user'` が返される（`HOME` が優先）
- **テストデータ**: 上記

#### 2.4.2 getHomeDir() - 異常系

**テストケース名**: `getHomeDir_異常系_両方が未設定の場合`

- **目的**: `HOME` と `USERPROFILE` の両方が未設定の場合、例外がスローされることを検証
- **前提条件**: 両方の環境変数が未設定
- **入力**:
  ```typescript
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  ```
- **期待結果**: `Error` がスローされる
- **エラーメッセージ**: `'HOME or USERPROFILE environment variable is required. Please ensure your system has a valid home directory.'`
- **テストデータ**: なし

**テストケース名**: `getHomeDir_異常系_HOMEが空文字列でUSERPROFILEも未設定の場合`

- **目的**: `HOME` が空文字列で `USERPROFILE` が未設定の場合、例外がスローされることを検証
- **前提条件**: `process.env.HOME` が空文字列、`process.env.USERPROFILE` が未設定
- **入力**:
  ```typescript
  process.env.HOME = '';
  delete process.env.USERPROFILE;
  ```
- **期待結果**: `Error` がスローされる
- **テストデータ**: 上記

#### 2.4.3 getReposRoot() - 正常系

**テストケース名**: `getReposRoot_正常系_パスが設定されている場合`

- **目的**: `REPOS_ROOT` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.REPOS_ROOT` が設定されている
- **入力**: `process.env.REPOS_ROOT = '/path/to/repos'`
- **期待結果**: `'/path/to/repos'` が返される
- **テストデータ**:
  ```typescript
  process.env.REPOS_ROOT = '/path/to/repos';
  ```

**テストケース名**: `getReposRoot_正常系_パスが未設定の場合`

- **目的**: `REPOS_ROOT` が未設定の場合、`null` が返されることを検証
- **前提条件**: `process.env.REPOS_ROOT` が未設定
- **入力**: `delete process.env.REPOS_ROOT;`
- **期待結果**: `null` が返される
- **テストデータ**: なし

#### 2.4.4 getCodexCliPath() - 正常系（デフォルト値）

**テストケース名**: `getCodexCliPath_正常系_パスが設定されている場合`

- **目的**: `CODEX_CLI_PATH` が設定されている場合、その値が返されることを検証
- **前提条件**: `process.env.CODEX_CLI_PATH` が設定されている
- **入力**: `process.env.CODEX_CLI_PATH = '/usr/local/bin/codex'`
- **期待結果**: `'/usr/local/bin/codex'` が返される
- **テストデータ**:
  ```typescript
  process.env.CODEX_CLI_PATH = '/usr/local/bin/codex';
  ```

**テストケース名**: `getCodexCliPath_正常系_パスが未設定の場合はデフォルト値が返される`

- **目的**: `CODEX_CLI_PATH` が未設定の場合、デフォルト値 `'codex'` が返されることを検証
- **前提条件**: `process.env.CODEX_CLI_PATH` が未設定
- **入力**: `delete process.env.CODEX_CLI_PATH;`
- **期待結果**: `'codex'` が返される（デフォルト値）
- **テストデータ**: なし

---

### 2.5 ロギング関連メソッド

#### 2.5.1 getLogLevel() - 正常系（デフォルト値、バリデーション）

**テストケース名**: `getLogLevel_正常系_有効なログレベルが設定されている場合_debug`

- **目的**: `LOG_LEVEL` が `'debug'` の場合、その値が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'debug'`
- **入力**: `process.env.LOG_LEVEL = 'debug'`
- **期待結果**: `'debug'` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'debug';
  ```

**テストケース名**: `getLogLevel_正常系_有効なログレベルが設定されている場合_info`

- **目的**: `LOG_LEVEL` が `'info'` の場合、その値が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'info'`
- **入力**: `process.env.LOG_LEVEL = 'info'`
- **期待結果**: `'info'` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'info';
  ```

**テストケース名**: `getLogLevel_正常系_有効なログレベルが設定されている場合_warn`

- **目的**: `LOG_LEVEL` が `'warn'` の場合、その値が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'warn'`
- **入力**: `process.env.LOG_LEVEL = 'warn'`
- **期待結果**: `'warn'` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'warn';
  ```

**テストケース名**: `getLogLevel_正常系_有効なログレベルが設定されている場合_error`

- **目的**: `LOG_LEVEL` が `'error'` の場合、その値が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'error'`
- **入力**: `process.env.LOG_LEVEL = 'error'`
- **期待結果**: `'error'` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'error';
  ```

**テストケース名**: `getLogLevel_正常系_大文字小文字が混在している場合は小文字に変換される`

- **目的**: `LOG_LEVEL` が `'DEBUG'` の場合、`'debug'` に変換されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'DEBUG'`
- **入力**: `process.env.LOG_LEVEL = 'DEBUG'`
- **期待結果**: `'debug'` が返される（小文字変換）
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'DEBUG';
  ```

**テストケース名**: `getLogLevel_正常系_無効なログレベルが設定されている場合はデフォルト値が返される`

- **目的**: `LOG_LEVEL` が無効な値（`'invalid'`）の場合、デフォルト値 `'info'` が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が `'invalid'`
- **入力**: `process.env.LOG_LEVEL = 'invalid'`
- **期待結果**: `'info'` が返される（デフォルト値）
- **テストデータ**:
  ```typescript
  process.env.LOG_LEVEL = 'invalid';
  ```

**テストケース名**: `getLogLevel_正常系_未設定の場合はデフォルト値が返される`

- **目的**: `LOG_LEVEL` が未設定の場合、デフォルト値 `'info'` が返されることを検証
- **前提条件**: `process.env.LOG_LEVEL` が未設定
- **入力**: `delete process.env.LOG_LEVEL;`
- **期待結果**: `'info'` が返される（デフォルト値）
- **テストデータ**: なし

#### 2.5.2 getLogNoColor() - 正常系

**テストケース名**: `getLogNoColor_正常系_フラグがtrueの場合`

- **目的**: `LOG_NO_COLOR` が `'true'` の場合、`true` が返されることを検証
- **前提条件**: `process.env.LOG_NO_COLOR` が `'true'`
- **入力**: `process.env.LOG_NO_COLOR = 'true'`
- **期待結果**: `true` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_NO_COLOR = 'true';
  ```

**テストケース名**: `getLogNoColor_正常系_フラグが1の場合`

- **目的**: `LOG_NO_COLOR` が `'1'` の場合、`true` が返されることを検証
- **前提条件**: `process.env.LOG_NO_COLOR` が `'1'`
- **入力**: `process.env.LOG_NO_COLOR = '1'`
- **期待結果**: `true` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_NO_COLOR = '1';
  ```

**テストケース名**: `getLogNoColor_正常系_フラグがfalseの場合`

- **目的**: `LOG_NO_COLOR` が `'false'` の場合、`false` が返されることを検証
- **前提条件**: `process.env.LOG_NO_COLOR` が `'false'`
- **入力**: `process.env.LOG_NO_COLOR = 'false'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_NO_COLOR = 'false';
  ```

**テストケース名**: `getLogNoColor_正常系_フラグが0の場合`

- **目的**: `LOG_NO_COLOR` が `'0'` の場合、`false` が返されることを検証
- **前提条件**: `process.env.LOG_NO_COLOR` が `'0'`
- **入力**: `process.env.LOG_NO_COLOR = '0'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.LOG_NO_COLOR = '0';
  ```

**テストケース名**: `getLogNoColor_正常系_フラグが未設定の場合`

- **目的**: `LOG_NO_COLOR` が未設定の場合、`false` が返されることを検証
- **前提条件**: `process.env.LOG_NO_COLOR` が未設定
- **入力**: `delete process.env.LOG_NO_COLOR;`
- **期待結果**: `false` が返される
- **テストデータ**: なし

---

### 2.6 動作環境判定メソッド

#### 2.6.1 isCI() - 正常系

**テストケース名**: `isCI_正常系_CIがtrueの場合`

- **目的**: `CI` が `'true'` の場合、`true` が返されることを検証
- **前提条件**: `process.env.CI` が `'true'`
- **入力**: `process.env.CI = 'true'`
- **期待結果**: `true` が返される
- **テストデータ**:
  ```typescript
  process.env.CI = 'true';
  ```

**テストケース名**: `isCI_正常系_CIが1の場合`

- **目的**: `CI` が `'1'` の場合、`true` が返されることを検証
- **前提条件**: `process.env.CI` が `'1'`
- **入力**: `process.env.CI = '1'`
- **期待結果**: `true` が返される
- **テストデータ**:
  ```typescript
  process.env.CI = '1';
  ```

**テストケース名**: `isCI_正常系_JENKINS_HOMEが設定されている場合`

- **目的**: `JENKINS_HOME` が設定されている場合、`true` が返されることを検証（`CI` が未設定でも）
- **前提条件**: `process.env.CI` が未設定、`process.env.JENKINS_HOME` が設定されている
- **入力**:
  ```typescript
  delete process.env.CI;
  process.env.JENKINS_HOME = '/var/jenkins_home';
  ```
- **期待結果**: `true` が返される
- **テストデータ**: 上記

**テストケース名**: `isCI_正常系_CIがtrueでJENKINS_HOMEも設定されている場合`

- **目的**: `CI` が `'true'` で `JENKINS_HOME` も設定されている場合、`true` が返されることを検証
- **前提条件**: 両方の環境変数が設定されている
- **入力**:
  ```typescript
  process.env.CI = 'true';
  process.env.JENKINS_HOME = '/var/jenkins_home';
  ```
- **期待結果**: `true` が返される
- **テストデータ**: 上記

**テストケース名**: `isCI_正常系_CIがfalseの場合`

- **目的**: `CI` が `'false'` の場合、`false` が返されることを検証
- **前提条件**: `process.env.CI` が `'false'`
- **入力**: `process.env.CI = 'false'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.CI = 'false';
  ```

**テストケース名**: `isCI_正常系_CIが0の場合`

- **目的**: `CI` が `'0'` の場合、`false` が返されることを検証
- **前提条件**: `process.env.CI` が `'0'`
- **入力**: `process.env.CI = '0'`
- **期待結果**: `false` が返される
- **テストデータ**:
  ```typescript
  process.env.CI = '0';
  ```

**テストケース名**: `isCI_正常系_CIもJENKINS_HOMEも未設定の場合`

- **目的**: `CI` も `JENKINS_HOME` も未設定の場合、`false` が返されることを検証
- **前提条件**: 両方の環境変数が未設定
- **入力**:
  ```typescript
  delete process.env.CI;
  delete process.env.JENKINS_HOME;
  ```
- **期待結果**: `false` が返される
- **テストデータ**: なし

---

## 3. テストデータ

### 3.1 正常データ

| 環境変数名 | テストデータ | 説明 |
|-----------|------------|------|
| `GITHUB_TOKEN` | `'ghp_test_token_123'` | 有効なGitHubトークン形式 |
| `GITHUB_REPOSITORY` | `'owner/repo'` | 有効なリポジトリ名 |
| `CODEX_API_KEY` | `'codex_key_123'` | 有効なCodex APIキー |
| `OPENAI_API_KEY` | `'openai_key_456'` | 有効なOpenAI APIキー |
| `CLAUDE_CODE_CREDENTIALS_PATH` | `'/path/to/credentials'` | 有効なパス |
| `CLAUDE_CODE_OAUTH_TOKEN` | `'oauth_token_789'` | 有効なOAuthトークン |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `'1'` | フラグ有効 |
| `GIT_COMMIT_USER_NAME` | `'John Doe'` | 有効なユーザー名 |
| `GIT_COMMIT_USER_EMAIL` | `'john@example.com'` | 有効なメールアドレス |
| `GIT_AUTHOR_NAME` | `'Jane Smith'` | 有効なAuthor名 |
| `GIT_AUTHOR_EMAIL` | `'jane@example.com'` | 有効なAuthorメール |
| `HOME` | `'/home/user'` | Linux/macOSのホームディレクトリ |
| `USERPROFILE` | `'C:\\Users\\User'` | Windowsのホームディレクトリ |
| `REPOS_ROOT` | `'/path/to/repos'` | リポジトリの親ディレクトリ |
| `CODEX_CLI_PATH` | `'/usr/local/bin/codex'` | Codex CLIバイナリパス |
| `LOG_LEVEL` | `'debug'`, `'info'`, `'warn'`, `'error'` | 有効なログレベル |
| `LOG_NO_COLOR` | `'true'`, `'1'` | カラーリング無効化フラグ |
| `CI` | `'true'`, `'1'` | CI環境フラグ |
| `JENKINS_HOME` | `'/var/jenkins_home'` | Jenkins環境ディレクトリ |

### 3.2 異常データ

| 環境変数名 | テストデータ | 説明 |
|-----------|------------|------|
| `GITHUB_TOKEN` | `undefined` | 未設定（必須環境変数） |
| `GITHUB_TOKEN` | `''` | 空文字列（必須環境変数） |
| `GITHUB_TOKEN` | `'   '` | 空白のみ（必須環境変数） |
| `HOME` | `undefined` | 未設定（USERPROFILEも未設定の場合は例外） |
| `USERPROFILE` | `undefined` | 未設定（HOMEも未設定の場合は例外） |
| `LOG_LEVEL` | `'invalid'` | 無効なログレベル（デフォルト値にフォールバック） |

### 3.3 境界値データ

| 環境変数名 | テストデータ | 説明 |
|-----------|------------|------|
| `GITHUB_TOKEN` | `'  ghp_test_token_123  '` | 前後に空白（トリム処理の検証） |
| `GITHUB_REPOSITORY` | `'  owner/repo  '` | 前後に空白（トリム処理の検証） |
| `LOG_LEVEL` | `'DEBUG'` | 大文字（小文字変換の検証） |
| `LOG_LEVEL` | `'Info'` | 混在大文字小文字（小文字変換の検証） |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `'true'` | 文字列 'true'（'1' のみが有効） |
| `LOG_NO_COLOR` | `'false'` | 文字列 'false'（'true' と '1' のみが有効） |
| `CI` | `'false'` | 文字列 'false'（'true' と '1' のみが有効） |

---

## 4. テスト環境要件

### 4.1 必要なテスト環境
- **ローカル開発環境**: Node.js 20 以上
- **CI環境**: Jenkins（既存のCI/CD環境）
- **テストフレームワーク**: Jest 30.2.0（ES modules 対応）

### 4.2 必要な外部サービス・データベース
- なし（環境変数のみを使用）

### 4.3 モック/スタブの必要性

#### 4.3.1 process.env のモック

**必要性**: Config クラスのユニットテストでは、`process.env` の値を動的に変更する必要があるため、各テストケースで環境変数を設定・削除します。

**モックパターン**:
```typescript
describe('Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数のバックアップ
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 環境変数の復元
    process.env = originalEnv;
  });

  test('getGitHubToken_正常系_トークンが設定されている場合', () => {
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    expect(config.getGitHubToken()).toBe('ghp_test_token_123');
  });

  test('getGitHubToken_異常系_トークンが未設定の場合', () => {
    delete process.env.GITHUB_TOKEN;
    expect(() => config.getGitHubToken()).toThrow(
      'GITHUB_TOKEN environment variable is required'
    );
  });
});
```

#### 4.3.2 Config モジュールのモック（既存テスト用）

**必要性**: 既存のテストコードでは、Config クラスをモックして、特定の環境変数の値を返すようにする必要があります。

**モックパターン**:
```typescript
// 既存テストファイル（例: tests/unit/core/github-client.test.ts）
import { config } from '@/core/config';

jest.mock('@/core/config', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'mock-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    // 他のメソッドも同様
  },
}));

describe('GitHubClient', () => {
  test('should use mocked config', () => {
    expect(config.getGitHubToken()).toBe('mock-token');
  });
});
```

---

## 5. 品質ゲート（Phase 3）

テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_ONLY戦略に基づき、Config クラスのユニットテストシナリオのみを作成
- [x] **主要な正常系がカバーされている**: 14個のpublicメソッドすべてについて、正常系のテストケースを定義（合計45個の正常系テストケース）
- [x] **主要な異常系がカバーされている**: 必須環境変数（getGitHubToken, getHomeDir）の異常系テストケースを定義（合計5個の異常系テストケース）
- [x] **期待結果が明確である**: すべてのテストケースについて、具体的な入力と期待される出力を明記

---

## 6. テストシナリオサマリー

### 6.1 テストケース数

| メソッド名 | 正常系 | 異常系 | エッジケース | 合計 |
|-----------|-------|-------|-------------|-----|
| `getGitHubToken()` | 2 | 3 | 0 | 5 |
| `getGitHubRepository()` | 3 | 0 | 2 | 5 |
| `getCodexApiKey()` | 4 | 0 | 0 | 4 |
| `getClaudeCredentialsPath()` | 2 | 0 | 0 | 2 |
| `getClaudeOAuthToken()` | 2 | 0 | 0 | 2 |
| `getClaudeDangerouslySkipPermissions()` | 3 | 0 | 1 | 4 |
| `getGitCommitUserName()` | 3 | 0 | 0 | 3 |
| `getGitCommitUserEmail()` | 3 | 0 | 0 | 3 |
| `getHomeDir()` | 3 | 2 | 0 | 5 |
| `getReposRoot()` | 2 | 0 | 0 | 2 |
| `getCodexCliPath()` | 2 | 0 | 0 | 2 |
| `getLogLevel()` | 7 | 0 | 0 | 7 |
| `getLogNoColor()` | 5 | 0 | 0 | 5 |
| `isCI()` | 7 | 0 | 0 | 7 |
| **合計** | **48** | **5** | **3** | **56** |

### 6.2 カバレッジ予測

- **メソッドカバレッジ**: 100%（14個のpublicメソッドすべてをテスト）
- **分岐カバレッジ**: 95%以上（フォールバックロジック、デフォルト値、バリデーションの全分岐をカバー）
- **ラインカバレッジ**: 90%以上（Planning Document の目標を達成）

### 6.3 テスト実装の優先順位

1. **必須環境変数のテスト（優先度: 高）**:
   - `getGitHubToken()`: 5個
   - `getHomeDir()`: 5個
2. **フォールバックロジックのテスト（優先度: 高）**:
   - `getCodexApiKey()`: 4個
   - `getGitCommitUserName()`: 3個
   - `getGitCommitUserEmail()`: 3個
3. **オプション環境変数のテスト（優先度: 中）**:
   - `getGitHubRepository()`: 5個
   - `getClaudeCredentialsPath()`: 2個
   - `getClaudeOAuthToken()`: 2個
   - `getReposRoot()`: 2個
4. **動作判定・デフォルト値のテスト（優先度: 中）**:
   - `isCI()`: 7個
   - `getLogLevel()`: 7個
   - `getLogNoColor()`: 5個
   - `getClaudeDangerouslySkipPermissions()`: 4個
   - `getCodexCliPath()`: 2個

---

## 7. テスト実装時の注意事項

### 7.1 環境変数の分離
各テストケースは独立して実行される必要があります。以下の手順で環境変数を分離してください：

```typescript
describe('Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // テストケースを記述
});
```

### 7.2 例外メッセージの完全一致
必須環境変数が未設定の場合の例外メッセージは、設計書に記載された完全なメッセージと一致する必要があります：

```typescript
test('getGitHubToken_異常系_トークンが未設定の場合', () => {
  delete process.env.GITHUB_TOKEN;
  expect(() => config.getGitHubToken()).toThrow(
    'GITHUB_TOKEN environment variable is required. ' +
    'Please set your GitHub personal access token with repo, workflow, and read:org scopes.'
  );
});
```

### 7.3 フォールバックロジックの優先順位
フォールバックロジックのテストでは、優先順位が正しく機能することを確認してください：

```typescript
test('getCodexApiKey_正常系_両方が設定されている場合はCODEX_API_KEYが優先される', () => {
  process.env.CODEX_API_KEY = 'codex_key_123';
  process.env.OPENAI_API_KEY = 'openai_key_456';
  expect(config.getCodexApiKey()).toBe('codex_key_123');
});
```

### 7.4 トリム処理の検証
環境変数の値の前後に空白がある場合、トリムされることを確認してください：

```typescript
test('getGitHubToken_正常系_トークンの前後に空白がある場合', () => {
  process.env.GITHUB_TOKEN = '  ghp_test_token_123  ';
  expect(config.getGitHubToken()).toBe('ghp_test_token_123');
});
```

### 7.5 デフォルト値の検証
デフォルト値が設定されているメソッドでは、未設定時にデフォルト値が返されることを確認してください：

```typescript
test('getCodexCliPath_正常系_パスが未設定の場合はデフォルト値が返される', () => {
  delete process.env.CODEX_CLI_PATH;
  expect(config.getCodexCliPath()).toBe('codex');
});
```

---

## 8. 参考資料

### 8.1 プロジェクトドキュメント
- **Planning Document**: `.ai-workflow/issue-51/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-51/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-51/02_design/output/design.md`

### 8.2 関連Issue
- **Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/51

### 8.3 テストフレームワークドキュメント
- **Jest公式ドキュメント**: https://jestjs.io/docs/getting-started
- **Jest モック機能**: https://jestjs.io/docs/mock-functions

---

**テストシナリオバージョン**: 1.0
**作成者**: AI Workflow Agent (Test Scenario Phase)
**作成日**: 2025-01-29
