# テストシナリオ - Issue #2

## 0. Planning Document の確認

Planning Phase で策定された開発計画を確認しました：

- **実装戦略**: EXTEND（既存クラスの拡張中心）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **複雑度**: 中程度
- **見積もり工数**: 8~12時間
- **リスク評価**: 低

本テストシナリオは、Planning Phase で決定された **UNIT_INTEGRATION** テスト戦略に基づき、Phase 2（設計）で詳細化されたテスト方針を実装レベルに落とし込みます。

---

## 1. テスト戦略サマリー

### 1.1. 選択されたテスト戦略

**UNIT_INTEGRATION** - ユニットテストとインテグレーションテストの組み合わせ

### 1.2. テスト対象の範囲

#### ユニットテスト対象
- `BasePhase.cleanupWorkflowArtifacts()` メソッド
- `BasePhase.isCIEnvironment()` メソッド
- `BasePhase.promptUserConfirmation()` メソッド
- CLI オプション解析ロジック（`main.ts`）

#### インテグレーションテスト対象
- Evaluation Phase 完了後のクリーンアップ実行フロー全体
- CLI オプション指定時のエンドツーエンド動作
- Git コミット & プッシュとの統合
- ファイルシステム操作との統合

### 1.3. テストの目的

1. **機能正確性の保証**: クリーンアップ機能が要件通り動作することを検証
2. **エラーハンドリングの検証**: 異常系で適切にエラーが処理されることを確認
3. **後方互換性の保証**: 既存ワークフローに影響がないことを確認
4. **CI/CD 統合の検証**: Jenkins 等の CI 環境で問題なく動作することを確認

### 1.4. テストファイル構成

```
tests/
├── unit/
│   └── cleanup-workflow-artifacts.test.ts  # 新規作成
└── integration/
    └── evaluation-phase-cleanup.test.ts    # 新規作成
```

---

## 2. ユニットテストシナリオ

### 2.1. cleanupWorkflowArtifacts() メソッドのテスト

#### テストケース 2.1.1: 正常系 - ディレクトリ削除成功（CI環境）

**テストケース名**: `cleanupWorkflowArtifacts_正常系_CI環境`

- **目的**: CI環境でディレクトリが正常に削除されることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true` が設定されている
  - `force=false`
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - `fs.removeSync()` が `.ai-workflow/issue-123/` で呼び出される
  - INFO ログ `[INFO] Deleting workflow artifacts: .ai-workflow/issue-123` が出力される
  - INFO ログ `[OK] Workflow artifacts deleted successfully.` が出力される
  - 確認プロンプトは表示されない
  - 例外がスローされない
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = 'true';
  ```
- **モック**:
  - `fs.existsSync()` → `true`
  - `fs.lstatSync()` → `{ isSymbolicLink: () => false }`
  - `fs.removeSync()` → spy（呼び出しを記録）
  - `console.info()` → spy

---

#### テストケース 2.1.2: 正常系 - force フラグで確認スキップ

**テストケース名**: `cleanupWorkflowArtifacts_正常系_forceフラグ`

- **目的**: `force=true` で確認プロンプトがスキップされることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI` が未設定（対話的環境）
  - `force=true`
- **入力**: `cleanupWorkflowArtifacts(true)`
- **期待結果**:
  - 確認プロンプトが表示されない
  - `fs.removeSync()` が呼び出される
  - INFO ログが出力される
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = undefined;
  ```
- **モック**:
  - `fs.existsSync()` → `true`
  - `fs.lstatSync()` → `{ isSymbolicLink: () => false }`
  - `fs.removeSync()` → spy
  - `promptUserConfirmation()` → spy（呼び出されないことを検証）

---

#### テストケース 2.1.3: 正常系 - 対話的環境で確認プロンプト表示

**テストケース名**: `cleanupWorkflowArtifacts_正常系_確認プロンプト表示`

- **目的**: 対話的環境で確認プロンプトが表示されることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI` が未設定
  - `force=false`
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - `promptUserConfirmation()` が呼び出される
  - ユーザーが "yes" を入力した場合、削除が実行される
  - WARNING ログ `[WARNING] About to delete workflow directory: ...` が出力される
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = undefined;
  userInput = 'yes';
  ```
- **モック**:
  - `promptUserConfirmation()` → `Promise.resolve(true)`
  - `fs.existsSync()` → `true`
  - `fs.lstatSync()` → `{ isSymbolicLink: () => false }`
  - `fs.removeSync()` → spy
  - `console.warn()` → spy

---

#### テストケース 2.1.4: 正常系 - ユーザーがキャンセル

**テストケース名**: `cleanupWorkflowArtifacts_正常系_ユーザーキャンセル`

- **目的**: ユーザーが "no" を入力した場合、削除がキャンセルされることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI` が未設定
  - `force=false`
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - `promptUserConfirmation()` が呼び出される
  - ユーザーが "no" を入力した場合、削除が実行されない
  - INFO ログ `[INFO] Cleanup cancelled by user.` が出力される
  - `fs.removeSync()` が呼び出されない
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = undefined;
  userInput = 'no';
  ```
- **モック**:
  - `promptUserConfirmation()` → `Promise.resolve(false)`
  - `fs.removeSync()` → spy（呼び出されないことを検証）

---

#### テストケース 2.1.5: 異常系 - ディレクトリが存在しない

**テストケース名**: `cleanupWorkflowArtifacts_異常系_ディレクトリ不在`

- **目的**: 削除対象ディレクトリが存在しない場合、エラーが適切に処理されることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在しない
  - 環境変数 `CI=true`
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - WARNING ログ `[WARNING] Workflow directory does not exist: ...` が出力される
  - `fs.removeSync()` が呼び出されない
  - 例外がスローされない（正常終了）
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = 'true';
  ```
- **モック**:
  - `fs.existsSync()` → `false`
  - `fs.removeSync()` → spy（呼び出されないことを検証）
  - `console.warn()` → spy

---

#### テストケース 2.1.6: 異常系 - 削除権限がない

**テストケース名**: `cleanupWorkflowArtifacts_異常系_削除権限なし`

- **目的**: 削除権限がない場合、エラーログが出力され、ワークフローが継続することを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - ディレクトリへの削除権限がない
  - 環境変数 `CI=true`
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - `fs.removeSync()` が `EACCES` エラーをスローする
  - ERROR ログ `[ERROR] Failed to delete workflow artifacts: EACCES: permission denied` が出力される
  - 例外がスローされない（エラーを握りつぶす）
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  process.env.CI = 'true';
  error = new Error('EACCES: permission denied');
  ```
- **モック**:
  - `fs.existsSync()` → `true`
  - `fs.lstatSync()` → `{ isSymbolicLink: () => false }`
  - `fs.removeSync()` → `throw new Error('EACCES: permission denied')`
  - `console.error()` → spy

---

#### テストケース 2.1.7: セキュリティ - パストラバーサル攻撃

**テストケース名**: `cleanupWorkflowArtifacts_セキュリティ_パストラバーサル`

- **目的**: パストラバーサル攻撃（`../../etc/passwd` など）が防止されることを検証
- **前提条件**:
  - `metadata.workflowDir` が `../../etc/passwd` など不正なパス
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - ERROR ログ `[ERROR] Invalid workflow directory path: ...` が出力される
  - 例外がスローされる（`throw new Error(...)`）
  - `fs.removeSync()` が呼び出されない
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '../../etc/passwd',
    issueNumber: 123,
  };
  ```
- **モック**:
  - `fs.removeSync()` → spy（呼び出されないことを検証）
  - `console.error()` → spy

---

#### テストケース 2.1.8: セキュリティ - シンボリックリンク攻撃

**テストケース名**: `cleanupWorkflowArtifacts_セキュリティ_シンボリックリンク`

- **目的**: シンボリックリンク攻撃が防止されることを検証
- **前提条件**:
  - `.ai-workflow/issue-123/` がシンボリックリンク
- **入力**: `cleanupWorkflowArtifacts(false)`
- **期待結果**:
  - ERROR ログ `[ERROR] Workflow directory is a symbolic link: ...` が出力される
  - 例外がスローされる
  - `fs.removeSync()` が呼び出されない
- **テストデータ**:
  ```typescript
  metadata = {
    workflowDir: '/tmp/test/.ai-workflow/issue-123',
    issueNumber: 123,
  };
  ```
- **モック**:
  - `fs.existsSync()` → `true`
  - `fs.lstatSync()` → `{ isSymbolicLink: () => true }`
  - `fs.removeSync()` → spy（呼び出されないことを検証）
  - `console.error()` → spy

---

### 2.2. isCIEnvironment() メソッドのテスト

#### テストケース 2.2.1: CI環境判定 - CI=true

**テストケース名**: `isCIEnvironment_CI環境_true`

- **目的**: 環境変数 `CI=true` の場合、CI環境と判定されることを検証
- **前提条件**: `process.env.CI = 'true'`
- **入力**: `isCIEnvironment()`
- **期待結果**: `true` が返される
- **テストデータ**: `process.env.CI = 'true'`

---

#### テストケース 2.2.2: CI環境判定 - CI=1

**テストケース名**: `isCIEnvironment_CI環境_1`

- **目的**: 環境変数 `CI=1` の場合、CI環境と判定されることを検証
- **前提条件**: `process.env.CI = '1'`
- **入力**: `isCIEnvironment()`
- **期待結果**: `true` が返される
- **テストデータ**: `process.env.CI = '1'`

---

#### テストケース 2.2.3: CI環境判定 - CI未設定

**テストケース名**: `isCIEnvironment_非CI環境_未設定`

- **目的**: 環境変数 `CI` が未設定の場合、非CI環境と判定されることを検証
- **前提条件**: `process.env.CI = undefined`
- **入力**: `isCIEnvironment()`
- **期待結果**: `false` が返される
- **テストデータ**: `process.env.CI = undefined`

---

#### テストケース 2.2.4: CI環境判定 - CI=false

**テストケース名**: `isCIEnvironment_非CI環境_false`

- **目的**: 環境変数 `CI=false` の場合、非CI環境と判定されることを検証
- **前提条件**: `process.env.CI = 'false'`
- **入力**: `isCIEnvironment()`
- **期待結果**: `false` が返される
- **テストデータ**: `process.env.CI = 'false'`

---

### 2.3. promptUserConfirmation() メソッドのテスト

#### テストケース 2.3.1: ユーザー確認 - "yes" 入力

**テストケース名**: `promptUserConfirmation_ユーザー確認_yes入力`

- **目的**: ユーザーが "yes" を入力した場合、`true` が返されることを検証
- **前提条件**: 標準入力で "yes" が入力される
- **入力**: `promptUserConfirmation('/tmp/.ai-workflow/issue-123')`
- **期待結果**:
  - `true` が返される
  - WARNING ログ `[WARNING] About to delete workflow directory: ...` が出力される
- **テストデータ**: `userInput = 'yes\n'`
- **モック**:
  - `readline.createInterface()` → モックInterface
  - `rl.question()` → コールバックに "yes" を渡す

---

#### テストケース 2.3.2: ユーザー確認 - "y" 入力

**テストケース名**: `promptUserConfirmation_ユーザー確認_y入力`

- **目的**: ユーザーが "y" を入力した場合、`true` が返されることを検証
- **前提条件**: 標準入力で "y" が入力される
- **入力**: `promptUserConfirmation('/tmp/.ai-workflow/issue-123')`
- **期待結果**: `true` が返される
- **テストデータ**: `userInput = 'y\n'`

---

#### テストケース 2.3.3: ユーザー確認 - "no" 入力

**テストケース名**: `promptUserConfirmation_ユーザー確認_no入力`

- **目的**: ユーザーが "no" を入力した場合、`false` が返されることを検証
- **前提条件**: 標準入力で "no" が入力される
- **入力**: `promptUserConfirmation('/tmp/.ai-workflow/issue-123')`
- **期待結果**: `false` が返される
- **テストデータ**: `userInput = 'no\n'`

---

#### テストケース 2.3.4: ユーザー確認 - 空文字入力

**テストケース名**: `promptUserConfirmation_ユーザー確認_空文字入力`

- **目的**: ユーザーが空文字を入力した場合、`false` が返されることを検証
- **前提条件**: 標準入力で空文字が入力される
- **入力**: `promptUserConfirmation('/tmp/.ai-workflow/issue-123')`
- **期待結果**: `false` が返される
- **テストデータ**: `userInput = '\n'`

---

### 2.4. CLI オプション解析のテスト

#### テストケース 2.4.1: CLI オプション - cleanup-on-complete 指定

**テストケース名**: `CLIオプション_cleanup-on-complete_指定`

- **目的**: `--cleanup-on-complete` オプションが正しく解析されることを検証
- **前提条件**: なし
- **入力**: `['--cleanup-on-complete']`
- **期待結果**:
  - `options.cleanupOnComplete === true`
  - `options.cleanupOnCompleteForce === false`
- **テストデータ**: CLI引数 `--cleanup-on-complete`

---

#### テストケース 2.4.2: CLI オプション - cleanup-on-complete-force 指定

**テストケース名**: `CLIオプション_cleanup-on-complete-force_指定`

- **目的**: `--cleanup-on-complete-force` オプションが正しく解析されることを検証
- **前提条件**: なし
- **入力**: `['--cleanup-on-complete', '--cleanup-on-complete-force']`
- **期待結果**:
  - `options.cleanupOnComplete === true`
  - `options.cleanupOnCompleteForce === true`
- **テストデータ**: CLI引数 `--cleanup-on-complete --cleanup-on-complete-force`

---

#### テストケース 2.4.3: CLI オプション - デフォルト値

**テストケース名**: `CLIオプション_デフォルト値`

- **目的**: オプション未指定時のデフォルト値が正しいことを検証
- **前提条件**: なし
- **入力**: `[]`（オプションなし）
- **期待結果**:
  - `options.cleanupOnComplete === false`
  - `options.cleanupOnCompleteForce === false`
- **テストデータ**: CLI引数なし

---

## 3. インテグレーションテストシナリオ

### 3.1. エンドツーエンドフロー

#### シナリオ 3.1.1: エンドツーエンド - クリーンアップ成功（CI環境）

**シナリオ名**: `E2E_クリーンアップ成功_CI環境`

- **目的**: CI環境でEvaluation Phase完了後にクリーンアップが実行されることを検証
- **前提条件**:
  - Issue #123 のワークフローが存在する
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
  - Git リポジトリが初期化されている
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成（`.ai-workflow/issue-123/`）
  2. メタデータファイルを配置（`metadata.json`）
  3. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
  4. Evaluation Phase が完了するのを待機
  5. ディレクトリ削除を確認
  6. Git コミットを確認
- **期待結果**:
  - Evaluation Phase が `completed` ステータスで終了
  - `.ai-workflow/issue-123/` ディレクトリが削除されている
  - Git コミットが作成されている（コミットメッセージ: `chore: update evaluation (completed)`）
  - 標準出力に `[INFO] Deleting workflow artifacts: ...` が表示される
  - 標準出力に `[OK] Workflow artifacts deleted successfully.` が表示される
- **確認項目**:
  - [ ] ディレクトリが削除されている（`!fs.existsSync('.ai-workflow/issue-123/')`）
  - [ ] Git コミットが作成されている（`git log -1` で確認）
  - [ ] 標準出力に INFO ログが表示されている
  - [ ] プロセスが正常終了している（exit code 0）

---

#### シナリオ 3.1.2: エンドツーエンド - デフォルト動作（クリーンアップなし）

**シナリオ名**: `E2E_デフォルト動作_クリーンアップなし`

- **目的**: オプション未指定時は成果物が保持されることを検証
- **前提条件**:
  - Issue #123 のワークフローが存在する
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成
  2. `node dist/index.js execute --issue 123 --phase evaluation` を実行（オプションなし）
  3. Evaluation Phase が完了するのを待機
  4. ディレクトリが保持されていることを確認
- **期待結果**:
  - Evaluation Phase が `completed` ステータスで終了
  - `.ai-workflow/issue-123/` ディレクトリが保持されている（削除されない）
  - クリーンアップ関連のログメッセージが出力されない
- **確認項目**:
  - [ ] ディレクトリが保持されている（`fs.existsSync('.ai-workflow/issue-123/')`）
  - [ ] クリーンアップログが出力されていない
  - [ ] プロセスが正常終了している

---

#### シナリオ 3.1.3: エンドツーエンド - force フラグでプロンプトスキップ

**シナリオ名**: `E2E_forceフラグ_プロンプトスキップ`

- **目的**: `--cleanup-on-complete-force` フラグで確認プロンプトがスキップされることを検証
- **前提条件**:
  - Issue #123 のワークフローが存在する
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI` が未設定（対話的環境）
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成
  2. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete --cleanup-on-complete-force` を実行
  3. Evaluation Phase が完了するのを待機
  4. ディレクトリ削除を確認
- **期待結果**:
  - 確認プロンプトが表示されない（`Proceed? (yes/no)` が出力されない）
  - `.ai-workflow/issue-123/` ディレクトリが削除されている
  - Git コミットが作成されている
- **確認項目**:
  - [ ] 確認プロンプトが表示されていない
  - [ ] ディレクトリが削除されている
  - [ ] プロセスが正常終了している

---

#### シナリオ 3.1.4: エンドツーエンド - 全フェーズ実行時のクリーンアップ

**シナリオ名**: `E2E_全フェーズ実行_クリーンアップ`

- **目的**: `--phase all` でも Evaluation Phase 完了後にクリーンアップが実行されることを検証
- **前提条件**:
  - Issue #123 が存在する
  - 環境変数 `CI=true`
- **テスト手順**:
  1. `node dist/index.js execute --issue 123 --phase all --cleanup-on-complete` を実行
  2. 全フェーズが完了するのを待機
  3. Evaluation Phase 完了後にクリーンアップが実行されることを確認
- **期待結果**:
  - 全フェーズが正常に完了
  - Evaluation Phase 完了後に `.ai-workflow/issue-123/` が削除される
  - Git コミットが作成される
- **確認項目**:
  - [ ] 全フェーズが completed ステータスで終了
  - [ ] ディレクトリが削除されている
  - [ ] プロセスが正常終了している

---

### 3.2. Git 統合テスト

#### シナリオ 3.2.1: Git 統合 - コミット成功

**シナリオ名**: `Git統合_コミット成功`

- **目的**: クリーンアップ後に Git コミットが正常に作成されることを検証
- **前提条件**:
  - Git リポジトリが初期化されている
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
  - `GITHUB_TOKEN` が設定されている
- **テスト手順**:
  1. テスト用ワークフローディレクトリを作成
  2. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
  3. クリーンアップ実行後、Git コミットを確認
- **期待結果**:
  - Git コミットが作成されている
  - コミットメッセージが `chore: update evaluation (completed)` である
  - コミットに `.ai-workflow/issue-123/` の削除が含まれている
- **確認項目**:
  - [ ] `git log -1 --oneline` でコミットメッセージを確認
  - [ ] `git show --name-status` で削除ファイルを確認
  - [ ] コミットハッシュが取得できる

---

#### シナリオ 3.2.2: Git 統合 - プッシュ成功

**シナリオ名**: `Git統合_プッシュ成功`

- **目的**: クリーンアップ後に Git プッシュが正常に実行されることを検証
- **前提条件**:
  - Git リモートリポジトリが設定されている
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
  - `GITHUB_TOKEN` が設定されている
- **テスト手順**:
  1. テスト用リモートリポジトリを作成（テンポラリ）
  2. テスト用ワークフローディレクトリを作成
  3. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
  4. プッシュ実行後、リモートリポジトリを確認
- **期待結果**:
  - リモートリポジトリにコミットがプッシュされている
  - リモートブランチにコミットが存在する
- **確認項目**:
  - [ ] `git log origin/HEAD -1` でリモートコミットを確認
  - [ ] リモートリポジトリに削除コミットが存在する

---

#### シナリオ 3.2.3: Git 統合 - コミット失敗時のエラーハンドリング

**シナリオ名**: `Git統合_コミット失敗_エラーハンドリング`

- **目的**: Git コミット失敗時にエラーログが出力され、ワークフローが継続することを検証
- **前提条件**:
  - Git リポジトリが初期化されていない（コミット失敗を誘発）
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
- **テスト手順**:
  1. Git リポジトリ未初期化の状態でテストを実行
  2. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
  3. コミット失敗時のログを確認
- **期待結果**:
  - WARNING ログ `[WARNING] Failed to cleanup workflow artifacts: ...` が出力される
  - Evaluation Phase は `completed` ステータスで終了（失敗しない）
  - プロセスは正常終了（exit code 0）
- **確認項目**:
  - [ ] WARNING ログが出力されている
  - [ ] プロセスが正常終了している（exit code 0）
  - [ ] Evaluation Phase ステータスが completed

---

### 3.3. ファイルシステム統合テスト

#### シナリオ 3.3.1: ファイルシステム - 実際のディレクトリ削除

**シナリオ名**: `FS統合_実際のディレクトリ削除`

- **目的**: 実際のファイルシステムでディレクトリが削除されることを検証
- **前提条件**:
  - テンポラリディレクトリに `.ai-workflow/issue-123/` を作成
  - サブディレクトリとファイルを配置（`metadata.json`, `00_planning/`, `output/*.md`）
  - 環境変数 `CI=true`
- **テスト手順**:
  1. テンポラリディレクトリに複数のファイル・ディレクトリを作成
  2. `cleanupWorkflowArtifacts(false)` を実行
  3. ディレクトリとすべてのファイルが削除されることを確認
- **期待結果**:
  - `.ai-workflow/issue-123/` ディレクトリが完全に削除される
  - サブディレクトリとファイルもすべて削除される
  - `fs.existsSync('.ai-workflow/issue-123/')` が `false` を返す
- **確認項目**:
  - [ ] ディレクトリが削除されている
  - [ ] サブディレクトリが削除されている
  - [ ] ファイルが削除されている

---

#### シナリオ 3.3.2: ファイルシステム - 削除失敗時のエラーハンドリング

**シナリオ名**: `FS統合_削除失敗_エラーハンドリング`

- **目的**: 削除権限がない場合にエラーが適切に処理されることを検証
- **前提条件**:
  - テンポラリディレクトリに `.ai-workflow/issue-123/` を作成
  - ディレクトリの権限を読み取り専用に変更（`chmod 444`）
  - 環境変数 `CI=true`
- **テスト手順**:
  1. テンポラリディレクトリを作成し、読み取り専用に設定
  2. `cleanupWorkflowArtifacts(false)` を実行
  3. エラーログが出力されることを確認
- **期待結果**:
  - ERROR ログ `[ERROR] Failed to delete workflow artifacts: ...` が出力される
  - 例外がスローされない（正常終了）
  - ディレクトリは削除されない
- **確認項目**:
  - [ ] ERROR ログが出力されている
  - [ ] 例外がスローされていない
  - [ ] ディレクトリが保持されている

---

### 3.4. エラーシナリオ統合テスト

#### シナリオ 3.4.1: エラーシナリオ - Evaluation Phase 失敗時はクリーンアップしない

**シナリオ名**: `エラーシナリオ_Phase失敗_クリーンアップスキップ`

- **目的**: Evaluation Phase が失敗した場合、クリーンアップが実行されないことを検証
- **前提条件**:
  - Evaluation Phase が失敗する条件を作成（エージェント実行失敗など）
  - `.ai-workflow/issue-123/` ディレクトリが存在する
  - 環境変数 `CI=true`
- **テスト手順**:
  1. Evaluation Phase が失敗する条件を設定（モックエージェントでエラーを返す）
  2. `node dist/index.js execute --issue 123 --phase evaluation --cleanup-on-complete` を実行
  3. クリーンアップが実行されないことを確認
- **期待結果**:
  - Evaluation Phase が `failed` ステータスで終了
  - クリーンアップが実行されない
  - `.ai-workflow/issue-123/` ディレクトリが保持されている
- **確認項目**:
  - [ ] Evaluation Phase ステータスが failed
  - [ ] ディレクトリが保持されている
  - [ ] クリーンアップログが出力されていない

---

## 4. テストデータ

### 4.1. ユニットテスト用モックデータ

#### 4.1.1. メタデータオブジェクト

```typescript
const mockMetadata = {
  workflowDir: '/tmp/test/.ai-workflow/issue-123',
  issueNumber: 123,
  issueTitle: 'Test Issue',
  phases: {
    evaluation: {
      status: 'completed',
      completedAt: '2025-01-01T00:00:00Z',
    },
  },
};
```

#### 4.1.2. 環境変数

```typescript
// CI環境
process.env.CI = 'true';

// 非CI環境
delete process.env.CI;

// Git設定
process.env.GITHUB_TOKEN = 'test-token';
process.env.GIT_COMMIT_USER_NAME = 'Test User';
process.env.GIT_COMMIT_USER_EMAIL = 'test@example.com';
```

### 4.2. インテグレーションテスト用テストデータ

#### 4.2.1. テスト用ワークフローディレクトリ構造

```
/tmp/test/.ai-workflow/issue-123/
├── metadata.json
├── 00_planning/
│   └── output/
│       └── planning.md
├── 01_requirements/
│   └── output/
│       └── requirements.md
├── 02_design/
│   └── output/
│       └── design.md
└── 09_evaluation/
    └── output/
        └── evaluation.md
```

#### 4.2.2. テスト用 metadata.json

```json
{
  "issueNumber": 123,
  "issueTitle": "Test Issue",
  "workflowDir": "/tmp/test/.ai-workflow/issue-123",
  "phases": {
    "planning": {
      "status": "completed",
      "completedAt": "2025-01-01T00:00:00Z"
    },
    "requirements": {
      "status": "completed",
      "completedAt": "2025-01-01T01:00:00Z"
    },
    "design": {
      "status": "completed",
      "completedAt": "2025-01-01T02:00:00Z"
    },
    "evaluation": {
      "status": "in_progress",
      "startedAt": "2025-01-01T09:00:00Z"
    }
  }
}
```

---

## 5. テスト環境要件

### 5.1. ローカル開発環境

- **Node.js**: 20 以上
- **npm**: 10 以上
- **OS**: Linux / macOS / Windows
- **必要なツール**:
  - Jest（テストフレームワーク）
  - ts-jest（TypeScript対応）
  - Git（2.x以上）

### 5.2. CI/CD 環境

- **Jenkins**: Docker コンテナ内で実行
- **環境変数**:
  - `CI=true`
  - `GITHUB_TOKEN`
  - `GIT_COMMIT_USER_NAME`
  - `GIT_COMMIT_USER_EMAIL`
- **必要なツール**:
  - Docker
  - Git

### 5.3. モック/スタブの必要性

#### ユニットテストでモックが必要なもの
- `fs-extra` モジュール（`existsSync`, `removeSync`, `lstatSync`）
- `readline` モジュール（`createInterface`, `question`）
- `console` オブジェクト（`info`, `warn`, `error`）
- `GitManager` クラス（`commit`, `push`）
- `process.env` オブジェクト（環境変数）

#### インテグレーションテストでモックが不要なもの
- ファイルシステム操作（実際のテンポラリディレクトリを使用）
- Git 操作（テスト用リポジトリを使用）

---

## 6. テスト実行計画

### 6.1. ユニットテスト実行

```bash
# すべてのユニットテストを実行
npm run test:unit

# 特定のテストファイルのみ実行
npm run test tests/unit/cleanup-workflow-artifacts.test.ts

# カバレッジレポート付きで実行
npm run test:unit -- --coverage
```

### 6.2. インテグレーションテスト実行

```bash
# すべてのインテグレーションテストを実行
npm run test:integration

# 特定のテストファイルのみ実行
npm run test tests/integration/evaluation-phase-cleanup.test.ts

# カバレッジレポート付きで実行
npm run test:integration -- --coverage
```

### 6.3. すべてのテスト実行

```bash
# ユニット + インテグレーションテストを実行
npm test

# カバレッジレポート付きで実行
npm run test -- --coverage
```

### 6.4. カバレッジ目標

- **ユニットテスト**: 80% 以上
- **インテグレーションテスト**: 主要なエンドツーエンドフローをカバー
- **全体**: 75% 以上

---

## 7. 品質ゲートチェック

### 7.1. Phase 3 品質ゲート

- ✅ **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテスト（15ケース）とインテグレーションテスト（10ケース）を作成
- ✅ **主要な正常系がカバーされている**:
  - ユニットテスト: ディレクトリ削除成功、CI環境判定、確認プロンプト
  - インテグレーションテスト: E2Eフロー、Git統合、ファイルシステム統合
- ✅ **主要な異常系がカバーされている**:
  - ユニットテスト: ディレクトリ不在、削除権限なし、パストラバーサル、シンボリックリンク
  - インテグレーションテスト: Git失敗、ファイルシステムエラー、Phase失敗時
- ✅ **期待結果が明確である**: 各テストケースで具体的な期待結果（ログメッセージ、戻り値、ファイルシステム状態）を記載

### 7.2. 追加確認項目

- ✅ **要件定義書の受け入れ基準との対応**: 要件定義書のAC-1〜AC-10がテストシナリオでカバーされている
- ✅ **設計書のエラーハンドリング戦略との対応**: 設計書のエラーケース一覧（11.1節）がテストシナリオに反映されている
- ✅ **実行可能性**: 具体的なテストデータ、モック設定、確認項目を記載し、実装可能なシナリオとなっている
- ✅ **テストファイル構成の明確化**: 新規作成する2つのテストファイル（ユニット、インテグレーション）を明示

---

## 8. まとめ

本テストシナリオは、Planning Phase で決定された **UNIT_INTEGRATION** テスト戦略に基づき、以下のテストケースを定義しました：

### 8.1. テストケース数

- **ユニットテスト**: 15ケース
  - `cleanupWorkflowArtifacts()`: 8ケース
  - `isCIEnvironment()`: 4ケース
  - `promptUserConfirmation()`: 4ケース
  - CLI オプション解析: 3ケース

- **インテグレーションテスト**: 10ケース
  - エンドツーエンドフロー: 4ケース
  - Git 統合: 3ケース
  - ファイルシステム統合: 2ケース
  - エラーシナリオ: 1ケース

### 8.2. カバレッジ範囲

- **正常系**: CI環境、force フラグ、確認プロンプト、ユーザーキャンセル、E2Eフロー、Git統合
- **異常系**: ディレクトリ不在、削除権限なし、Git失敗、ファイルシステムエラー、Phase失敗
- **セキュリティ**: パストラバーサル、シンボリックリンク攻撃

### 8.3. 要件定義書との対応

| 受け入れ基準 | 対応するテストケース |
|------------|-------------------|
| AC-1: CLI オプション動作確認 | 3.1.1, 2.4.1, 2.4.2 |
| AC-2: デフォルト動作確認 | 3.1.2, 2.4.3 |
| AC-3: 確認プロンプト（対話的環境） | 2.1.3, 2.3.1, 2.3.2, 2.3.3 |
| AC-4: 確認プロンプトスキップ（CI環境） | 2.1.1, 2.2.1, 2.2.2 |
| AC-5: 確認プロンプトスキップ（force） | 2.1.2, 3.1.3 |
| AC-6: エラーハンドリング（ディレクトリ不在） | 2.1.5 |
| AC-7: エラーハンドリング（削除権限なし） | 2.1.6, 3.3.2 |
| AC-8: Git コミット & プッシュ成功 | 3.2.1, 3.2.2 |
| AC-9: ログ出力確認 | 2.1.1, 2.1.5, 2.1.6 |
| AC-10: 全フェーズ実行時の動作確認 | 3.1.4 |

### 8.4. 次フェーズへの準備

本テストシナリオは、Phase 3 の品質ゲートを満たしており、次の Phase 4（実装）に進む準備が整っています。Phase 4 では、本シナリオに基づいてテストコードを実装し、実装コードとテストコードを並行して開発します。
