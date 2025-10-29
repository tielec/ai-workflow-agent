# テストシナリオ - Issue #58

## 0. Planning Document・Requirements Document・Design Documentの確認

Planning Phase（`.ai-workflow/issue-58/00_planning/output/planning.md`）、Requirements Phase（`.ai-workflow/issue-58/01_requirements/output/requirements.md`）、Design Phase（`.ai-workflow/issue-58/02_design/output/design.md`）で策定された開発計画、要件、設計を確認しました。

### 開発戦略サマリー
- **実装戦略**: EXTEND（既存実装の軽微な改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト修正 + 新規テスト作成）
- **複雑度**: 簡単
- **見積もり工数**: 4~8時間
- **リスク評価**: 低

### スコープ確認
- **Task 1**: 正規表現パターンの改善（`sanitizeGitUrl()`） → **ユニットテスト**
- **Task 2**: トークン検出モニタリングスクリプト作成 → **テストコード不要**（手動検証）
- **Task 3**: マイグレーションコマンド実装 → **ユニットテスト + 統合テスト**

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2 Design Documentで決定）

### テスト対象の範囲

#### テストコードを作成する対象
1. **Task 1（正規表現パターン改善）**: ユニットテストのみ
   - 対象ファイル: `src/utils/git-url-utils.ts` の `sanitizeGitUrl()` 関数
   - テストファイル: `tests/unit/utils/git-url-utils.test.ts`（既存テスト修正）

2. **Task 3（マイグレーションコマンド）**: ユニットテスト + 統合テスト
   - 対象ファイル: `src/commands/migrate.ts`
   - テストファイル:
     - `tests/unit/commands/migrate.test.ts`（新規作成）
     - `tests/integration/migrate-sanitize-tokens.test.ts`（新規作成）

#### テストコードを作成しない対象
- **Task 2（モニタリングスクリプト）**: テストコード不要
  - 理由: 1回限りの実行スクリプトであり、集計ロジックは単純
  - 検証方法: スクリプト実行後、レポートを手動で確認

### テストの目的

1. **正確性の担保**: 正規表現パターン変更により、エッジケース（パスワードに`@`を含む）が正しく処理されることを検証
2. **回帰防止**: 既存テストケース（パスワードに`@`を含まないケース）がすべてパスすることを検証
3. **安全性の担保**: マイグレーションコマンドが既存メタデータを破壊しないことを検証（バックアップ機能、ドライラン機能）
4. **エラーハンドリングの検証**: ファイル読み込み失敗、書き込み失敗等の異常系が適切に処理されることを検証
5. **統合動作の確認**: マイグレーションコマンドのE2Eフロー（探索 → 検出 → サニタイズ → バックアップ → 保存）が正しく動作することを検証

---

## 2. ユニットテストシナリオ

### 2.1. Task 1: 正規表現パターン改善（`sanitizeGitUrl()`）

**テスト対象**: `src/utils/git-url-utils.ts` の `sanitizeGitUrl()` 関数

**テストファイル**: `tests/unit/utils/git-url-utils.test.ts`

#### 2.1.1. 正常系テストケース

---

**テストケース名**: `sanitizeGitUrl_正常系_パスワードに@を1つ含む`

- **目的**: パスワードに `@` を1つ含むケースで、トークンが正しく除去されることを検証
- **前提条件**: 新しい正規表現パターン `/^(https?:\/\/)(.+)@([^@]+)$/` が適用されている
- **入力**: `https://user:p@ssword@github.com/owner/repo.git`
- **期待結果**: `https://github.com/owner/repo.git`
- **テストデータ**: 上記入力
- **備考**: Issue #58で対応するエッジケース

---

**テストケース名**: `sanitizeGitUrl_正常系_パスワードに@を複数含む`

- **目的**: パスワードに `@` を複数含むケースで、トークンが正しく除去されることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://user:p@ss@word@github.com/owner/repo.git`
- **期待結果**: `https://github.com/owner/repo.git`
- **テストデータ**: 上記入力
- **備考**: Issue #58で対応するエッジケース

---

**テストケース名**: `sanitizeGitUrl_正常系_トークンのみ（ユーザー名なし）`

- **目的**: トークンのみ（ユーザー名なし）のケースで、トークンが正しく除去されることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://ghp_token123@github.com/owner/repo.git`
- **期待結果**: `https://github.com/owner/repo.git`
- **テストデータ**: 上記入力
- **備考**: 一般的なPersonal Access Tokenの形式

---

**テストケース名**: `sanitizeGitUrl_正常系_ユーザー名とパスワードの両方に@を含む`

- **目的**: ユーザー名とパスワードの両方に `@` を含むケースで、トークンが正しく除去されることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://user@domain:p@ss@word@github.com/owner/repo.git`
- **期待結果**: `https://github.com/owner/repo.git`
- **テストデータ**: 上記入力
- **備考**: 最も複雑なエッジケース

---

**テストケース名**: `sanitizeGitUrl_正常系_HTTP（HTTPSではない）`

- **目的**: HTTPプロトコルでもトークンが正しく除去されることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `http://token@github.com/owner/repo.git`
- **期待結果**: `http://github.com/owner/repo.git`
- **テストデータ**: 上記入力
- **備考**: 正規表現パターンは `https?` でHTTPもサポート

---

#### 2.1.2. 回帰テストケース（既存動作の維持）

---

**テストケース名**: `sanitizeGitUrl_回帰_SSH形式（変更なし）`

- **目的**: SSH形式のURLが変更されないことを検証（後方互換性）
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `git@github.com:owner/repo.git`
- **期待結果**: `git@github.com:owner/repo.git`（変更なし）
- **テストデータ**: 上記入力
- **備考**: Issue #54で実装済みの動作を維持

---

**テストケース名**: `sanitizeGitUrl_回帰_HTTPS形式でトークンなし（変更なし）`

- **目的**: HTTPS形式でトークンが含まれていない場合、URLが変更されないことを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://github.com/owner/repo.git`
- **期待結果**: `https://github.com/owner/repo.git`（変更なし）
- **テストデータ**: 上記入力
- **備考**: Issue #54で実装済みの動作を維持

---

**テストケース名**: `sanitizeGitUrl_回帰_空文字列（変更なし）`

- **目的**: 空文字列が入力された場合、空文字列が返されることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `""`
- **期待結果**: `""`（変更なし）
- **テストデータ**: 上記入力
- **備考**: エッジケース

---

**テストケース名**: `sanitizeGitUrl_回帰_不正なURL形式（変更なし）`

- **目的**: 不正なURL形式（プロトコルなし等）が入力された場合、変更されないことを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `invalid-url-format`
- **期待結果**: `invalid-url-format`（変更なし）
- **テストデータ**: 上記入力
- **備考**: エッジケース

---

#### 2.1.3. パフォーマンステスト（ReDoS脆弱性評価）

---

**テストケース名**: `sanitizeGitUrl_パフォーマンス_大量の@を含む入力`

- **目的**: ReDoS脆弱性がないことを検証（悪意のある入力でも処理時間が許容範囲内）
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://` + `@`.repeat(10000) + `@github.com/owner/repo.git`
- **期待結果**: 10ms以内に処理が完了すること（Issue #54の基準を維持）
- **テストデータ**: 上記入力（`@` を10,000個繰り返す）
- **備考**: ReDoS脆弱性評価の一環として実施

---

**テストケース名**: `sanitizeGitUrl_パフォーマンス_1000回実行`

- **目的**: 通常の入力で1000回実行しても許容範囲内の処理時間であることを検証
- **前提条件**: 新しい正規表現パターンが適用されている
- **入力**: `https://token@github.com/owner/repo.git`（1000回実行）
- **期待結果**: 合計10ms以内に処理が完了すること（Issue #54の基準を維持）
- **テストデータ**: 上記入力を1000回繰り返す
- **備考**: パフォーマンス回帰テスト

---

### 2.2. Task 3: マイグレーションコマンド（ユニットテスト）

**テスト対象**: `src/commands/migrate.ts`

**テストファイル**: `tests/unit/commands/migrate.test.ts`

#### 2.2.1. `findAllMetadataFiles()` のテストケース

---

**テストケース名**: `findAllMetadataFiles_正常系_複数ファイル検出`

- **目的**: メタデータファイルが複数存在する場合、すべて検出されることを検証
- **前提条件**: `.ai-workflow/issue-{1,2,3}/metadata.json` が存在する
- **入力**: `{ repo: '/tmp/test-repo', issue: undefined }`
- **期待結果**: 3つのファイルパスが返される
- **テストデータ**: テスト用のメタデータファイル3つを作成
- **備考**: `glob` パッケージのモックを使用

---

**テストケース名**: `findAllMetadataFiles_正常系_特定Issue指定`

- **目的**: `--issue` オプションで特定Issueのみ対象にする場合、1つのファイルのみ検出されることを検証
- **前提条件**: `.ai-workflow/issue-{1,2,3}/metadata.json` が存在する
- **入力**: `{ repo: '/tmp/test-repo', issue: '2' }`
- **期待結果**: 1つのファイルパス（`issue-2/metadata.json`）が返される
- **テストデータ**: テスト用のメタデータファイル3つを作成
- **備考**: `glob` パッケージのモックを使用

---

**テストケース名**: `findAllMetadataFiles_異常系_メタデータファイル不在`

- **目的**: メタデータファイルが存在しない場合、空配列が返されることを検証
- **前提条件**: `.ai-workflow/` ディレクトリが存在しない
- **入力**: `{ repo: '/tmp/test-repo', issue: undefined }`
- **期待結果**: 空配列 `[]` が返される
- **テストデータ**: 空のディレクトリ
- **備考**: エラーで終了しないこと

---

**テストケース名**: `findAllMetadataFiles_セキュリティ_パストラバーサル攻撃防止`

- **目的**: パストラバーサル攻撃（`../../etc/passwd` 等）が防止されることを検証
- **前提条件**: 悪意のあるパスが `glob` で検出される（モック）
- **入力**: `{ repo: '/tmp/test-repo', issue: undefined }`
- **期待結果**: 不正なパスはフィルタリングされ、空配列が返される
- **テストデータ**: `glob` のモックで `../../etc/passwd` を返す
- **備考**: 正規表現 `/\.ai-workflow[\/\\]issue-\d+[\/\\]metadata\.json$/` でフィルタリング

---

#### 2.2.2. `loadMetadataFile()` のテストケース

---

**テストケース名**: `loadMetadataFile_正常系_トークンあり`

- **目的**: メタデータファイルにトークンが含まれる場合、正しく検出されることを検証
- **前提条件**: メタデータファイルに `target_repository.remote_url = "https://token@github.com/owner/repo.git"` が含まれる
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`
- **期待結果**:
  ```typescript
  {
    filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json',
    content: { target_repository: { remote_url: 'https://token@github.com/owner/repo.git' } },
    hasToken: true,
    originalUrl: 'https://token@github.com/owner/repo.git',
    sanitizedUrl: 'https://github.com/owner/repo.git'
  }
  ```
- **テストデータ**: テスト用のメタデータファイルを作成
- **備考**: `sanitizeGitUrl()` が呼び出されること

---

**テストケース名**: `loadMetadataFile_正常系_トークンなし（SSH形式）`

- **目的**: メタデータファイルにトークンが含まれない場合（SSH形式）、`hasToken: false` が返されることを検証
- **前提条件**: メタデータファイルに `target_repository.remote_url = "git@github.com:owner/repo.git"` が含まれる
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`
- **期待結果**:
  ```typescript
  {
    filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json',
    content: { target_repository: { remote_url: 'git@github.com:owner/repo.git' } },
    hasToken: false
  }
  ```
- **テストデータ**: テスト用のメタデータファイルを作成
- **備考**: SSH形式はサニタイズ対象外

---

**テストケース名**: `loadMetadataFile_正常系_remote_urlフィールドなし`

- **目的**: `remote_url` フィールドが存在しない場合、`hasToken: false` が返されることを検証
- **前提条件**: メタデータファイルに `target_repository.remote_url` が含まれない
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`
- **期待結果**:
  ```typescript
  {
    filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json',
    content: { target_repository: {} },
    hasToken: false
  }
  ```
- **テストデータ**: テスト用のメタデータファイルを作成（`remote_url` なし）
- **備考**: エッジケース

---

**テストケース名**: `loadMetadataFile_異常系_ファイル読み込み失敗`

- **目的**: ファイル読み込みが失敗した場合、`null` が返されることを検証
- **前提条件**: ファイルが存在しない、または読み込み権限がない
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`（存在しない）
- **期待結果**: `null`
- **テストデータ**: 存在しないファイルパス
- **備考**: エラーログが出力されること

---

**テストケース名**: `loadMetadataFile_異常系_JSON解析失敗`

- **目的**: JSON解析が失敗した場合、`null` が返されることを検証
- **前提条件**: ファイルが不正なJSON形式
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`
- **期待結果**: `null`
- **テストデータ**: 不正なJSON（例: `{ invalid json }`）
- **備考**: エラーログが出力されること

---

**テストケース名**: `loadMetadataFile_セキュリティ_シンボリックリンク攻撃防止`

- **目的**: シンボリックリンクが検出された場合、`null` が返されることを検証
- **前提条件**: メタデータファイルパスがシンボリックリンク
- **入力**: `/tmp/test-repo/.ai-workflow/issue-1/metadata.json`（シンボリックリンク）
- **期待結果**: `null`
- **テストデータ**: シンボリックリンクを作成
- **備考**: `fs.lstat()` でシンボリックリンクチェック

---

#### 2.2.3. `sanitizeMetadataFile()` のテストケース

---

**テストケース名**: `sanitizeMetadataFile_正常系_トークンサニタイズ成功`

- **目的**: トークンが検出された場合、メタデータファイルが正しくサニタイズされることを検証
- **前提条件**: メタデータファイルに `hasToken: true` のデータが存在
- **入力**:
  ```typescript
  {
    filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json',
    content: { target_repository: { remote_url: 'https://token@github.com/owner/repo.git' } },
    hasToken: true,
    originalUrl: 'https://token@github.com/owner/repo.git',
    sanitizedUrl: 'https://github.com/owner/repo.git'
  }
  dryRun: false
  ```
- **期待結果**:
  - バックアップファイル（`.bak`）が作成される
  - メタデータファイルがサニタイズされたURLで上書きされる
  - `true` が返される
- **テストデータ**: 上記入力
- **備考**: `fs.copy()` と `fs.writeJSON()` のモックを使用

---

**テストケース名**: `sanitizeMetadataFile_正常系_ドライラン（ファイル変更なし）`

- **目的**: `--dry-run` フラグが指定された場合、ファイルが変更されないことを検証
- **前提条件**: メタデータファイルに `hasToken: true` のデータが存在
- **入力**: 上記と同じ、`dryRun: true`
- **期待結果**:
  - バックアップファイルが作成されない
  - メタデータファイルが変更されない
  - `true` が返される
- **テストデータ**: 上記入力
- **備考**: `fs.copy()` と `fs.writeJSON()` が呼び出されないこと

---

**テストケース名**: `sanitizeMetadataFile_正常系_トークンなし（スキップ）`

- **目的**: トークンが検出されなかった場合、処理がスキップされることを検証
- **前提条件**: メタデータファイルに `hasToken: false` のデータが存在
- **入力**:
  ```typescript
  {
    filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json',
    content: { target_repository: { remote_url: 'git@github.com:owner/repo.git' } },
    hasToken: false
  }
  dryRun: false
  ```
- **期待結果**:
  - バックアップファイルが作成されない
  - メタデータファイルが変更されない
  - `false` が返される
- **テストデータ**: 上記入力
- **備考**: SSH形式はスキップされる

---

**テストケース名**: `sanitizeMetadataFile_異常系_バックアップ作成失敗`

- **目的**: バックアップ作成が失敗した場合、エラーログが出力されることを検証
- **前提条件**: `fs.copy()` がエラーをスロー
- **入力**: 上記正常系と同じ
- **期待結果**:
  - エラーログが出力される
  - `false` が返される
- **テストデータ**: 上記入力
- **備考**: `fs.copy()` のモックでエラーをスロー

---

**テストケース名**: `sanitizeMetadataFile_異常系_ファイル書き込み失敗`

- **目的**: ファイル書き込みが失敗した場合、エラーログが出力されることを検証
- **前提条件**: `fs.writeJSON()` がエラーをスロー
- **入力**: 上記正常系と同じ
- **期待結果**:
  - エラーログが出力される
  - `false` が返される
- **テストデータ**: 上記入力
- **備考**: `fs.writeJSON()` のモックでエラーをスロー

---

#### 2.2.4. `sanitizeTokensInMetadata()` のテストケース

---

**テストケース名**: `sanitizeTokensInMetadata_正常系_複数ファイル処理`

- **目的**: 複数のメタデータファイルが正しく処理されることを検証
- **前提条件**: 3つのメタデータファイルが存在（うち2つにトークンあり）
- **入力**: `{ sanitizeTokens: true, dryRun: false, issue: undefined, repo: '/tmp/test-repo' }`
- **期待結果**:
  ```typescript
  {
    processedCount: 3,
    detectedCount: 2,
    sanitizedCount: 2,
    errorCount: 0,
    errors: []
  }
  ```
- **テストデータ**: テスト用のメタデータファイル3つを作成
- **備考**: `findAllMetadataFiles()`, `loadMetadataFile()`, `sanitizeMetadataFile()` のモックを使用

---

**テストケース名**: `sanitizeTokensInMetadata_正常系_トークンなし（スキップ）`

- **目的**: トークンが含まれないメタデータファイルがスキップされることを検証
- **前提条件**: 3つのメタデータファイルが存在（すべてSSH形式）
- **入力**: 上記と同じ
- **期待結果**:
  ```typescript
  {
    processedCount: 3,
    detectedCount: 0,
    sanitizedCount: 0,
    errorCount: 0,
    errors: []
  }
  ```
- **テストデータ**: テスト用のメタデータファイル3つを作成（すべてSSH形式）
- **備考**: サニタイズ処理がスキップされること

---

**テストケース名**: `sanitizeTokensInMetadata_異常系_一部ファイルでエラー`

- **目的**: 一部のファイルでエラーが発生しても、処理が続行されることを検証
- **前提条件**: 3つのメタデータファイルが存在（1つでエラー発生）
- **入力**: 上記と同じ
- **期待結果**:
  ```typescript
  {
    processedCount: 3,
    detectedCount: 2,
    sanitizedCount: 1,
    errorCount: 2,
    errors: [
      { filePath: '/tmp/test-repo/.ai-workflow/issue-1/metadata.json', error: 'Failed to load metadata file' },
      { filePath: '/tmp/test-repo/.ai-workflow/issue-2/metadata.json', error: 'Failed to sanitize metadata file' }
    ]
  }
  ```
- **テストデータ**: テスト用のメタデータファイル3つを作成
- **備考**: `loadMetadataFile()` または `sanitizeMetadataFile()` のモックでエラーを返す

---

**テストケース名**: `sanitizeTokensInMetadata_正常系_ドライラン`

- **目的**: `--dry-run` フラグが指定された場合、ファイルが変更されないことを検証
- **前提条件**: 3つのメタデータファイルが存在（うち2つにトークンあり）
- **入力**: `{ sanitizeTokens: true, dryRun: true, issue: undefined, repo: '/tmp/test-repo' }`
- **期待結果**:
  ```typescript
  {
    processedCount: 3,
    detectedCount: 2,
    sanitizedCount: 2,
    errorCount: 0,
    errors: []
  }
  ```
- **テストデータ**: テスト用のメタデータファイル3つを作成
- **備考**: `fs.writeJSON()` が呼び出されないこと

---

#### 2.2.5. `handleMigrateCommand()` のテストケース

---

**テストケース名**: `handleMigrateCommand_正常系_sanitize-tokensフラグ指定`

- **目的**: `--sanitize-tokens` フラグが指定された場合、マイグレーションが実行されることを検証
- **前提条件**: メタデータファイルが存在
- **入力**: `{ sanitizeTokens: true, dryRun: false, issue: undefined, repo: '/tmp/test-repo' }`
- **期待結果**:
  - `sanitizeTokensInMetadata()` が呼び出される
  - `printMigrationSummary()` が呼び出される
  - 正常終了（`process.exit()` が呼び出されない）
- **テストデータ**: テスト用のメタデータファイル
- **備考**: `sanitizeTokensInMetadata()` のモックを使用

---

**テストケース名**: `handleMigrateCommand_異常系_フラグ未指定`

- **目的**: `--sanitize-tokens` フラグが指定されていない場合、エラーメッセージが表示されることを検証
- **前提条件**: なし
- **入力**: `{ sanitizeTokens: false, dryRun: false, issue: undefined, repo: '/tmp/test-repo' }`
- **期待結果**:
  - エラーログ「No migration option specified. Use --sanitize-tokens.」が出力される
  - `process.exit(1)` が呼び出される
- **テストデータ**: なし
- **備考**: `process.exit()` のモックを使用

---

**テストケース名**: `handleMigrateCommand_異常系_マイグレーション失敗`

- **目的**: マイグレーション処理が失敗した場合、エラーメッセージが表示されることを検証
- **前提条件**: `sanitizeTokensInMetadata()` がエラーをスロー
- **入力**: `{ sanitizeTokens: true, dryRun: false, issue: undefined, repo: '/tmp/test-repo' }`
- **期待結果**:
  - エラーログ「Migration failed:」が出力される
  - `process.exit(1)` が呼び出される
- **テストデータ**: なし
- **備考**: `sanitizeTokensInMetadata()` のモックでエラーをスロー

---

---

## 3. 統合テストシナリオ

### 3.1. Task 3: マイグレーションコマンド（統合テスト）

**テスト対象**: `src/commands/migrate.ts` のE2Eフロー

**テストファイル**: `tests/integration/migrate-sanitize-tokens.test.ts`

#### 3.1.1. E2Eフローテスト

---

**シナリオ名**: `マイグレーションコマンドE2E_複数メタデータファイル`

- **目的**: マイグレーションコマンドのE2Eフロー（探索 → 検出 → サニタイズ → バックアップ → 保存 → 検証）が正しく動作することを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-{1,2,3}/metadata.json` を作成
    - Issue 1: `https://token1@github.com/owner/repo1.git`（トークンあり）
    - Issue 2: `git@github.com:owner/repo2.git`（SSH形式、トークンなし）
    - Issue 3: `https://token3@github.com/owner/repo3.git`（トークンあり）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成（`/tmp/test-repo-integration`）
  2. 上記のメタデータファイルを作成
  3. マイグレーションコマンド実行（`handleMigrateCommand({ sanitizeTokens: true, dryRun: false })`）
  4. 結果検証:
     - Issue 1のメタデータが `https://github.com/owner/repo1.git` に変更されているか
     - Issue 1のバックアップファイル（`.bak`）が作成されているか
     - Issue 2のメタデータが変更されていないか（SSH形式）
     - Issue 3のメタデータが `https://github.com/owner/repo3.git` に変更されているか
     - Issue 3のバックアップファイル（`.bak`）が作成されているか
  5. クリーンアップ（テスト用ディレクトリ削除）
- **期待結果**:
  - `processedCount: 3`
  - `detectedCount: 2`
  - `sanitizedCount: 2`
  - `errorCount: 0`
  - メタデータファイルが正しくサニタイズされている
  - バックアップファイルが作成されている
- **確認項目**:
  - [ ] メタデータファイル探索が正しく動作しているか
  - [ ] トークン検出が正しく動作しているか
  - [ ] `sanitizeGitUrl()` が正しく呼び出されているか
  - [ ] バックアップファイル（`.bak`）が作成されているか
  - [ ] メタデータファイルが正しく上書きされているか
  - [ ] SSH形式のURLが変更されていないか
  - [ ] コンソール出力が正しく表示されているか

---

**シナリオ名**: `マイグレーションコマンドE2E_ドライラン`

- **目的**: `--dry-run` フラグが指定された場合、ファイルが変更されないことを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-1/metadata.json` を作成（`https://token@github.com/owner/repo.git`）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. メタデータファイルを作成
  3. マイグレーションコマンド実行（`handleMigrateCommand({ sanitizeTokens: true, dryRun: true })`）
  4. 結果検証:
     - メタデータファイルが変更されていないか（元のURLのまま）
     - バックアップファイル（`.bak`）が作成されていないか
  5. クリーンアップ
- **期待結果**:
  - `processedCount: 1`
  - `detectedCount: 1`
  - `sanitizedCount: 1`
  - `errorCount: 0`
  - メタデータファイルが変更されていない
  - バックアップファイルが作成されていない
- **確認項目**:
  - [ ] ドライランフラグが正しく機能しているか
  - [ ] メタデータファイルが変更されていないか
  - [ ] バックアップファイルが作成されていないか
  - [ ] コンソール出力に「[DRY RUN]」が表示されているか

---

**シナリオ名**: `マイグレーションコマンドE2E_特定Issue指定`

- **目的**: `--issue` オプションで特定Issueのみを対象にする場合、正しく動作することを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-{1,2,3}/metadata.json` を作成（すべてトークンあり）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. メタデータファイルを作成
  3. マイグレーションコマンド実行（`handleMigrateCommand({ sanitizeTokens: true, dryRun: false, issue: '2' })`）
  4. 結果検証:
     - Issue 2のメタデータのみサニタイズされているか
     - Issue 1とIssue 3のメタデータが変更されていないか
  5. クリーンアップ
- **期待結果**:
  - `processedCount: 1`
  - `detectedCount: 1`
  - `sanitizedCount: 1`
  - `errorCount: 0`
  - Issue 2のみサニタイズされている
- **確認項目**:
  - [ ] `--issue` オプションが正しく機能しているか
  - [ ] 指定されたIssueのみ処理されているか
  - [ ] 他のIssueが変更されていないか

---

**シナリオ名**: `マイグレーションコマンドE2E_エラーハンドリング`

- **目的**: ファイル読み込み失敗、書き込み失敗等のエラーが発生しても、処理が続行されることを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-{1,2,3}/metadata.json` を作成
    - Issue 1: 不正なJSON形式（読み込み失敗）
    - Issue 2: トークンあり（正常）
    - Issue 3: 読み込み権限なし（読み込み失敗）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. メタデータファイルを作成（Issue 1は不正なJSON、Issue 3は読み込み権限削除）
  3. マイグレーションコマンド実行（`handleMigrateCommand({ sanitizeTokens: true, dryRun: false })`）
  4. 結果検証:
     - Issue 2のみサニタイズされているか
     - エラーログが2件出力されているか
  5. クリーンアップ
- **期待結果**:
  - `processedCount: 3`
  - `detectedCount: 1`
  - `sanitizedCount: 1`
  - `errorCount: 2`
  - `errors: [{ filePath: 'issue-1/metadata.json', error: '...' }, { filePath: 'issue-3/metadata.json', error: '...' }]`
- **確認項目**:
  - [ ] エラーが発生しても処理が続行されているか
  - [ ] エラーログが正しく出力されているか
  - [ ] 正常なファイルは処理されているか

---

#### 3.1.2. バックアップ・ロールバックテスト

---

**シナリオ名**: `バックアップファイル作成_複数メタデータ`

- **目的**: マイグレーション実行時、バックアップファイル（`.bak`）が正しく作成されることを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-{1,2}/metadata.json` を作成（トークンあり）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. メタデータファイルを作成
  3. マイグレーションコマンド実行
  4. 結果検証:
     - `.ai-workflow/issue-1/metadata.json.bak` が作成されているか
     - `.ai-workflow/issue-2/metadata.json.bak` が作成されているか
     - バックアップファイルの内容が元のメタデータと一致するか
  5. クリーンアップ
- **期待結果**:
  - バックアップファイルが2つ作成されている
  - バックアップファイルの内容が元のメタデータと一致する
- **確認項目**:
  - [ ] バックアップファイルが作成されているか
  - [ ] バックアップファイルの内容が正しいか
  - [ ] バックアップファイルのパーミッションが正しいか

---

**シナリオ名**: `ロールバック手順検証_手動復元`

- **目的**: バックアップファイルから手動でロールバックできることを検証（マニュアル検証）
- **前提条件**:
  - マイグレーションが実行済み（バックアップファイルが作成されている）
- **テスト手順**:
  1. マイグレーション実行後のディレクトリを準備
  2. バックアップファイル（`.bak`）を元のファイル名に手動でコピー
  3. 結果検証:
     - メタデータファイルが元の状態に戻っているか（トークンが含まれる）
- **期待結果**:
  - メタデータファイルが元の状態に戻る
- **確認項目**:
  - [ ] バックアップファイルから復元できるか
  - [ ] ロールバック手順がドキュメント（`docs/MIGRATION.md`）に記載されているか

---

#### 3.1.3. セキュリティテスト

---

**シナリオ名**: `パストラバーサル攻撃防止_統合テスト`

- **目的**: パストラバーサル攻撃（`../../etc/passwd` 等）が防止されることを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - 悪意のあるシンボリックリンク（`../../etc/passwd` へのリンク）を作成
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. `.ai-workflow/issue-1/metadata.json` として、システムファイルへのシンボリックリンクを作成
  3. マイグレーションコマンド実行
  4. 結果検証:
     - システムファイル（`/etc/passwd`）が変更されていないか
     - エラーログが出力されているか
  5. クリーンアップ
- **期待結果**:
  - システムファイルが変更されない
  - エラーログ「Skipping symbolic link: ...」が出力される
- **確認項目**:
  - [ ] シンボリックリンクが検出されているか
  - [ ] シンボリックリンクがスキップされているか
  - [ ] システムファイルが変更されていないか

---

**シナリオ名**: `トークン漏洩防止_ログ出力検証`

- **目的**: ログ出力でトークン文字列が露出しないことを検証
- **前提条件**:
  - テスト用のリポジトリ構造を作成
  - `.ai-workflow/issue-1/metadata.json` を作成（`https://ghp_secret_token_12345@github.com/owner/repo.git`）
- **テスト手順**:
  1. テスト用のリポジトリディレクトリ作成
  2. メタデータファイルを作成
  3. マイグレーションコマンド実行（ログ出力をキャプチャ）
  4. 結果検証:
     - ログ出力に `ghp_secret_token_12345` が含まれていないか
     - ログ出力に `***` が含まれているか
  5. クリーンアップ
- **期待結果**:
  - ログ出力に「Original URL: ***」が表示される
  - トークン文字列が露出しない
- **確認項目**:
  - [ ] トークン文字列がログに出力されていないか
  - [ ] マスキング（`***`）が正しく機能しているか

---

---

## 4. テストデータ

### 4.1. Task 1: 正規表現パターン改善のテストデータ

#### 正常系テストデータ

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| パスワードに`@`を1つ含む | `https://user:p@ssword@github.com/owner/repo.git` | `https://github.com/owner/repo.git` |
| パスワードに`@`を複数含む | `https://user:p@ss@word@github.com/owner/repo.git` | `https://github.com/owner/repo.git` |
| トークンのみ | `https://ghp_token123@github.com/owner/repo.git` | `https://github.com/owner/repo.git` |
| ユーザー名とパスワードの両方に`@` | `https://user@domain:p@ss@word@github.com/owner/repo.git` | `https://github.com/owner/repo.git` |
| HTTP（HTTPSではない） | `http://token@github.com/owner/repo.git` | `http://github.com/owner/repo.git` |

#### 回帰テストデータ

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| SSH形式 | `git@github.com:owner/repo.git` | `git@github.com:owner/repo.git`（変更なし） |
| HTTPS形式でトークンなし | `https://github.com/owner/repo.git` | `https://github.com/owner/repo.git`（変更なし） |
| 空文字列 | `""` | `""`（変更なし） |
| 不正なURL形式 | `invalid-url-format` | `invalid-url-format`（変更なし） |

#### パフォーマンステストデータ

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| 大量の`@`を含む入力 | `https://` + `@`.repeat(10000) + `@github.com/owner/repo.git` | 10ms以内に処理完了 |
| 1000回実行 | `https://token@github.com/owner/repo.git`（1000回） | 合計10ms以内に処理完了 |

### 4.2. Task 3: マイグレーションコマンドのテストデータ

#### メタデータファイル（JSON形式）

**テストケース1: トークンあり（HTTPS形式）**
```json
{
  "issue_number": 1,
  "target_repository": {
    "remote_url": "https://ghp_token123@github.com/owner/repo1.git",
    "branch": "main"
  }
}
```

**テストケース2: トークンなし（SSH形式）**
```json
{
  "issue_number": 2,
  "target_repository": {
    "remote_url": "git@github.com:owner/repo2.git",
    "branch": "main"
  }
}
```

**テストケース3: トークンあり（パスワードに`@`を含む）**
```json
{
  "issue_number": 3,
  "target_repository": {
    "remote_url": "https://user:p@ss@word@github.com/owner/repo3.git",
    "branch": "main"
  }
}
```

**テストケース4: `remote_url` フィールドなし**
```json
{
  "issue_number": 4,
  "target_repository": {
    "branch": "main"
  }
}
```

**テストケース5: 不正なJSON形式**
```
{ invalid json }
```

#### ディレクトリ構造（統合テスト用）

```
/tmp/test-repo-integration/
├── .ai-workflow/
│   ├── issue-1/
│   │   └── metadata.json  (トークンあり)
│   ├── issue-2/
│   │   └── metadata.json  (SSH形式)
│   └── issue-3/
│       └── metadata.json  (トークンあり)
```

---

## 5. テスト環境要件

### 5.1. ユニットテスト環境

#### 必要なソフトウェア
- **Node.js**: 20以上
- **npm**: 9以上
- **Jest**: 29以上（テストランナー）
- **TypeScript**: 5.x

#### 必要なライブラリ
- `@types/jest`: Jest型定義
- `ts-jest`: TypeScriptをJestで実行するための設定
- `fs-extra`: ファイル操作モック用
- `glob`: ファイル探索モック用

#### モック/スタブの必要性
- **`fs-extra`**: ファイル読み込み・書き込み操作をモック
  - `readFile()`, `writeFile()`, `readJSON()`, `writeJSON()`, `copy()`, `lstat()`
- **`glob`**: ファイル探索をモック
  - 特定のパターンで指定されたファイルリストを返す
- **`src/utils/git-url-utils.ts`**: `sanitizeGitUrl()` 関数をモック（一部のテストケース）
- **`src/utils/logger.ts`**: ログ出力をモック（コンソール出力を抑制）
- **`process.exit()`**: プロセス終了をモック（実際に終了しないようにする）

#### テスト実行コマンド
```bash
# すべてのユニットテストを実行
npm run test:unit

# Task 1のユニットテストのみ実行
npm run test:unit -- git-url-utils

# Task 3のユニットテストのみ実行
npm run test:unit -- migrate

# カバレッジレポート生成
npm run test:coverage
```

### 5.2. 統合テスト環境

#### 必要なソフトウェア
- **Node.js**: 20以上
- **npm**: 9以上
- **Jest**: 29以上（テストランナー）
- **TypeScript**: 5.x

#### 必要なディレクトリ
- `/tmp/test-repo-integration/`: 統合テスト用の一時ディレクトリ
  - テスト実行前に作成
  - テスト実行後に削除

#### テストデータの配置
- 統合テスト実行前に、テスト用のメタデータファイルを動的に作成
- `beforeEach()` でセットアップ、`afterEach()` でクリーンアップ

#### 外部サービス
- **不要**: すべてローカルで実行可能（GitHub APIへの依存なし）

#### テスト実行コマンド
```bash
# すべての統合テストを実行
npm run test:integration

# Task 3の統合テストのみ実行
npm run test:integration -- migrate-sanitize-tokens

# カバレッジレポート生成
npm run test:coverage
```

### 5.3. CI/CD環境

#### GitHub Actions（想定）
- **Trigger**: Pull Request作成時、`main` ブランチへのpush時
- **ジョブ**:
  1. ユニットテスト実行（`npm run test:unit`）
  2. 統合テスト実行（`npm run test:integration`）
  3. カバレッジレポート生成（`npm run test:coverage`）
  4. カバレッジ閾値チェック（90%以上）

#### 環境変数
- **不要**: すべてローカルで実行可能（外部サービスへの依存なし）

---

## 6. テストカバレッジ目標

### 6.1. カバレッジ目標

| 対象 | 目標カバレッジ |
|------|--------------|
| Task 1（正規表現パターン改善） | 100% |
| Task 3（マイグレーションコマンド） | 90%以上 |
| 全体 | 90%以上 |

### 6.2. カバレッジ測定項目

- **Statement Coverage（ステートメントカバレッジ）**: すべてのステートメントが実行されたか
- **Branch Coverage（分岐カバレッジ）**: すべての分岐（if文、switch文等）が実行されたか
- **Function Coverage（関数カバレッジ）**: すべての関数が呼び出されたか
- **Line Coverage（行カバレッジ）**: すべてのコード行が実行されたか

### 6.3. カバレッジ測定ツール

- **Jest**: `--coverage` フラグでカバレッジレポート生成
- **出力形式**: HTML、JSON、LCOV

---

## 7. 品質ゲート確認（Phase 3）

### 品質ゲート1: Phase 2の戦略に沿ったテストシナリオである

✅ **達成**

- **テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）
- **対応**:
  - Task 1: ユニットテストシナリオ（セクション2.1）
  - Task 3: ユニットテストシナリオ（セクション2.2）+ 統合テストシナリオ（セクション3.1）
  - Task 2: テストコード不要（Design Documentと一致）

### 品質ゲート2: 主要な正常系がカバーされている

✅ **達成**

- **Task 1**: 5つの正常系テストケース（パスワードに`@`を含む、トークンのみ、等）
- **Task 3（ユニット）**: 各関数の正常系テストケース（トークン検出、サニタイズ、バックアップ作成）
- **Task 3（統合）**: E2Eフロー（複数メタデータファイル処理、ドライラン、特定Issue指定）

### 品質ゲート3: 主要な異常系がカバーされている

✅ **達成**

- **Task 1**: 回帰テストケース（SSH形式、空文字列、不正なURL形式）
- **Task 3（ユニット）**:
  - ファイル読み込み失敗
  - JSON解析失敗
  - バックアップ作成失敗
  - ファイル書き込み失敗
- **Task 3（統合）**:
  - エラーハンドリング（一部ファイルでエラー発生）
  - セキュリティ（パストラバーサル攻撃、シンボリックリンク攻撃）

### 品質ゲート4: 期待結果が明確である

✅ **達成**

- すべてのテストケースで「期待結果」を明記
- ユニットテスト: 具体的な入力・出力を記載
- 統合テスト: Given-When-Then形式で期待結果を記載
- 確認項目をチェックリスト形式で記載

---

## 8. テストシナリオのレビュー観点

このテストシナリオをレビューする際、以下の観点を重点的に確認してください：

### 8.1. 完全性
- [ ] すべての機能要件（FR-1, FR-3）がテストでカバーされているか
- [ ] すべての非機能要件（NFR-1〜NFR-5）がテストでカバーされているか
- [ ] 受け入れ基準（Requirements Document）がすべてテストシナリオに反映されているか

### 8.2. 実行可能性
- [ ] テストケースが実際に実行可能であるか（曖昧な表現がないか）
- [ ] テストデータが具体的に定義されているか
- [ ] 期待結果が検証可能な形で記述されているか

### 8.3. 優先度
- [ ] クリティカルパスが優先的にカバーされているか
- [ ] 高リスク領域（正規表現パターン変更、バックアップ・ロールバック）が重点的にカバーされているか
- [ ] エッジケースが網羅されているか（80点を目指す）

### 8.4. 戦略整合性
- [ ] Phase 2のテスト戦略（UNIT_INTEGRATION）に沿っているか
- [ ] 戦略に含まれないテスト種別（BDD）が作成されていないか
- [ ] Design Documentの推奨実装順序に沿っているか

### 8.5. セキュリティ
- [ ] セキュリティ要件（NFR-2）がテストでカバーされているか
  - ReDoS脆弱性評価
  - パストラバーサル攻撃防止
  - シンボリックリンク攻撃防止
  - トークン漏洩防止

---

## 9. まとめ

Issue #58のテストシナリオを作成しました。本テストシナリオは、Planning Document、Requirements Document、Design Documentの内容を基に、以下の点を満たしています：

### テストシナリオの完全性

1. **テスト戦略に沿ったシナリオ**:
   - UNIT_INTEGRATION戦略に準拠
   - Task 1: ユニットテスト（正常系5件、回帰4件、パフォーマンス2件）
   - Task 3: ユニットテスト（5関数、計20件以上）+ 統合テスト（E2Eフロー6件、セキュリティ2件）
   - Task 2: テストコード不要（手動検証）

2. **主要な正常系・異常系をカバー**:
   - 正常系: パスワードに`@`を含むエッジケース、E2Eフロー（複数ファイル処理、ドライラン）
   - 異常系: ファイル読み込み失敗、JSON解析失敗、セキュリティ攻撃

3. **期待結果が明確**:
   - すべてのテストケースで具体的な入力・出力を記載
   - 統合テストでは確認項目をチェックリスト形式で記載

4. **実行可能性を担保**:
   - テストデータを具体的に定義
   - モック/スタブの必要性を明記
   - テスト環境要件を明記（Node.js 20以上、Jest 29以上）

5. **カバレッジ目標を設定**:
   - Task 1: 100%
   - Task 3: 90%以上
   - 全体: 90%以上

### 品質ゲート達成状況（Phase 3）

- ✅ **Phase 2の戦略に沿ったテストシナリオである**
- ✅ **主要な正常系がカバーされている**
- ✅ **主要な異常系がカバーされている**
- ✅ **期待結果が明確である**

### 次ステップ

Phase 4（Implementation）へ進み、以下の順序で実装を進めます：

1. **Task 1（正規表現パターン改善）**: 0.5~1h
   - `src/utils/git-url-utils.ts` のパターン変更
   - コメント更新

2. **Task 3（マイグレーションコマンド）**: 1~2h
   - `src/commands/migrate.ts` の作成
   - `src/main.ts` へのコマンド追加

3. **Task 2（モニタリングスクリプト）**: 0.5~1h（並行実行可能）
   - `scripts/monitor-token-detection.ts` の作成

---

**作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Phase 3: Test Scenario)
**承認者**: （レビュー完了後に記載）
**バージョン**: 1.0
**次ステップ**: Phase 4 (Implementation) へ進む
