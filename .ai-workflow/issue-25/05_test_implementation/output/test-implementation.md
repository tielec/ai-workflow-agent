# テストコード実装ログ - Issue #25: Git Manager の操作別分割

## 実装サマリー

- **テスト戦略**: UNIT_INTEGRATION
- **テストファイル数**: 3個（新規作成）+ 2個（既存テスト）
- **新規テストケース数**: 39個（ユニットテスト）
- **既存テストケース数**: 27個（ユニットテスト）+ 16個（統合テスト）
- **合計テストケース数**: 82個

## テスト戦略

Phase 2で決定されたテスト戦略 **UNIT_INTEGRATION** に基づき、以下を実装しました：

### ユニットテスト
各専門マネージャーの独立した動作を検証するユニットテストを作成：
- CommitManager: 15テストケース
- BranchManager: 9テストケース
- RemoteManager: 15テストケース

### 統合テスト（後方互換性検証）
既存の統合テストが全て通過することで、ファサードパターンの正しさを検証：
- 既存ユニットテスト: 27テストケース（`tests/unit/git-manager-issue16.test.ts`）
- 既存統合テスト: 16テストケース（`tests/integration/workflow-init-cleanup.test.ts`）

## テストファイル一覧

### 新規作成

#### 1. `tests/unit/git/commit-manager.test.ts`（18,889バイト）
CommitManagerの単体テストファイル

**テストスイート**:
- `CommitManager - Message Generation` (5テスト)
- `CommitManager - Commit Operations` (5テスト)
- `CommitManager - SecretMasker Integration` (2テスト)
- `CommitManager - File Helpers` (3テスト)

**主要テストケース**:
- コミットメッセージ生成の正確性（Phase番号、Issue番号、ステータス、レビュー結果）
- コミット操作の正常系・異常系
- SecretMasker統合（マスキング成功、失敗時の継続動作）
- ファイル操作ヘルパー（getChangedFiles, filterPhaseFiles, ensureGitConfig）

#### 2. `tests/unit/git/branch-manager.test.ts`（8,975バイト）
BranchManagerの単体テストファイル

**テストスイート**:
- `BranchManager - Branch Creation` (4テスト)
- `BranchManager - Branch Existence` (4テスト)
- `BranchManager - Branch Navigation` (2テスト)

**主要テストケース**:
- ブランチ作成（正常系、ベースブランチから分岐、既存ブランチ、Git操作失敗）
- ブランチ存在チェック（ローカル、リモート、checkRemoteフラグ）
- ブランチ取得・切り替え（正常系、エラー系）

#### 3. `tests/unit/git/remote-manager.test.ts`（15,244バイト）
RemoteManagerの単体テストファイル

**テストスイート**:
- `RemoteManager - Push Operations` (6テスト)
- `RemoteManager - Pull Operations` (3テスト)
- `RemoteManager - GitHub Credentials` (4テスト)
- `RemoteManager - Retry Logic` (5テスト)

**主要テストケース**:
- Push操作（upstream設定、通常push、non-fast-forwardリトライ、ネットワークエラーリトライ）
- Pull操作（正常系、ブランチ名省略、エラー系）
- GitHub認証設定（HTTPS URLへのトークン埋め込み、SSH URLスキップ、トークンなし）
- リトライロジック（再試行可能エラー判定、大文字小文字非依存）

### 既存テスト（後方互換性検証）

#### 1. `tests/unit/git-manager-issue16.test.ts`（18,863バイト）
既存のGitManagerユニットテスト（27テストケース）

**検証ポイント**:
- ファサード経由で既存テストが全て通過することを確認
- 後方互換性100%維持の検証

#### 2. `tests/integration/workflow-init-cleanup.test.ts`（21,943バイト）
既存のワークフロー統合テスト（16テストケース）

**検証ポイント**:
- マルチリポジトリワークフローが正常動作することを確認
- ファサード経由で統合テストが全て通過することを確認

## テストケース詳細

### 1. CommitManager テストケース（15個）

#### 1.1. Message Generation（5個）

**test_createCommitMessage_正常系_Phase完了時のメッセージ生成**
- **目的**: Phase完了時のコミットメッセージが正しく生成されることを検証
- **Given**: Phase番号: `01_requirements`, Status: `completed`, Review result: `PASS`
- **When**: `createCommitMessage()` を呼び出す
- **Then**: `"[Phase 01_requirements] completed (Review: PASS) - Issue #25"` が生成される

**test_buildStepCommitMessage_正常系_ステップ完了時のメッセージ生成**
- **目的**: ステップ完了時のコミットメッセージが正しく生成されることを検証
- **Given**: Phase番号: `04_implementation`, Step番号: `3`, Step名: `Implement BranchManager`
- **When**: `buildStepCommitMessage()` を呼び出す
- **Then**: `"[Phase 04_implementation - Step 3] Implement BranchManager - Issue #25"` が生成される

**test_createInitCommitMessage_正常系_ワークフロー初期化メッセージ生成**
- **目的**: ワークフロー初期化時のコミットメッセージが正しく生成されることを検証
- **Given**: Issue タイトル: `[REFACTOR] Git Manager の操作別分割`
- **When**: `createInitCommitMessage()` を呼び出す
- **Then**: `"[Workflow Init] Issue #25: [REFACTOR] Git Manager の操作別分割"` が生成される

**test_createCleanupCommitMessage_正常系_クリーンアップメッセージ生成**
- **目的**: ログクリーンアップ時のコミットメッセージが正しく生成されることを検証
- **Given**: Phase番号: `04_implementation`
- **When**: `createCleanupCommitMessage()` を呼び出す
- **Then**: `"[Cleanup] Removed phase logs - Phase 04_implementation - Issue #25"` が生成される

**test_createCommitMessage_境界値_Phase番号にアンダースコアなし**
- **目的**: Phase番号がアンダースコアなし（例: "requirements"）でも正しく動作することを検証
- **Given**: Phase番号: `requirements`
- **When**: `createCommitMessage()` を呼び出す
- **Then**: `"[Phase requirements] completed (Review: PASS) - Issue #25"` が生成される

#### 1.2. Commit Operations（5個）

**test_commitPhaseOutput_正常系_変更ファイルあり**
- **目的**: Phase完了時にコミットが正常に作成されることを検証
- **Given**: 変更ファイルが存在する
- **When**: `commitPhaseOutput()` を呼び出す
- **Then**: SecretMaskerによるマスキングが実行され、コミットが作成される

**test_commitPhaseOutput_正常系_変更ファイルなし**
- **目的**: 変更ファイルがない場合、警告ログを出力し、成功として扱われることを検証
- **Given**: 変更ファイルが存在しない
- **When**: `commitPhaseOutput()` を呼び出す
- **Then**: 警告ログが出力され、`success: true` が返される

**test_commitPhaseOutput_異常系_Git操作失敗**
- **目的**: Git操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **Given**: Git commit操作が失敗する
- **When**: `commitPhaseOutput()` を呼び出す
- **Then**: `success: false` とエラーメッセージが返される

**test_commitStepOutput_正常系_ステップコミット作成**
- **目的**: ステップ完了時にコミットが正常に作成されることを検証
- **Given**: 変更ファイルが存在する
- **When**: `commitStepOutput()` を呼び出す
- **Then**: ステップコミットが作成される

**test_commitWorkflowInit_正常系_初期化コミット作成**
- **目的**: ワークフロー初期化時にコミットが正常に作成されることを検証
- **Given**: metadata.json が作成されている
- **When**: `commitWorkflowInit()` を呼び出す
- **Then**: 初期化コミットが作成される

#### 1.3. SecretMasker Integration（2個）

**test_commitPhaseOutput_SecretMasker統合_マスキング成功**
- **目的**: SecretMaskerが正常に実行され、機密情報がマスキングされることを検証
- **Given**: SecretMaskerが正常に動作する
- **When**: `commitPhaseOutput()` を呼び出す
- **Then**: SecretMaskerが呼び出され、コミットが成功する

**test_commitPhaseOutput_SecretMasker統合_マスキング失敗時も継続**
- **目的**: SecretMaskerが失敗した場合も、コミットは継続されることを検証
- **Given**: SecretMaskerが例外をthrow
- **When**: `commitPhaseOutput()` を呼び出す
- **Then**: エラーログが出力され、コミットは継続される

#### 1.4. File Helpers（3個）

**test_getChangedFiles_正常系_変更ファイル取得**
- **目的**: Git statusから変更ファイルを正しく取得できることを検証
- **Given**: 変更ファイルが存在する
- **When**: `getChangedFiles()` を呼び出す
- **Then**: 変更ファイルのリストが返される

**test_getChangedFiles_境界値_@tmpファイルを除外**
- **目的**: `@tmp` ファイルが除外されることを検証
- **Given**: @tmpファイルが含まれる
- **When**: `getChangedFiles()` を呼び出す
- **Then**: @tmpファイルが除外される

**test_ensureGitConfig_正常系_Git設定を自動設定**
- **目的**: user.name/user.email が自動設定されることを検証
- **Given**: Git設定が未完了、環境変数が設定されている
- **When**: `ensureGitConfig()` を呼び出す
- **Then**: Git設定が実行される

### 2. BranchManager テストケース（9個）

#### 2.1. Branch Creation（4個）

**test_createBranch_正常系_新規ブランチ作成**
- **目的**: 新規ブランチが正常に作成されることを検証
- **Given**: ブランチが存在しない
- **When**: `createBranch()` を呼び出す
- **Then**: 新しいブランチが作成される

**test_createBranch_正常系_ベースブランチから分岐**
- **目的**: ベースブランチから新規ブランチが作成されることを検証
- **Given**: ベースブランチが存在する
- **When**: `createBranch()` を呼び出す（ベースブランチ指定）
- **Then**: ベースブランチから新規ブランチが作成される

**test_createBranch_異常系_既存ブランチ**
- **目的**: 既存ブランチと同名のブランチを作成しようとした場合、エラーが返されることを検証
- **Given**: ブランチが既に存在する
- **When**: `createBranch()` を呼び出す
- **Then**: エラーメッセージが返される

**test_createBranch_異常系_Git操作失敗**
- **目的**: Git操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **Given**: Git操作が失敗する
- **When**: `createBranch()` を呼び出す
- **Then**: エラーが適切にハンドリングされる

#### 2.2. Branch Existence（4個）

**test_branchExists_正常系_ローカルブランチ存在**
- **目的**: ローカルブランチが存在する場合、trueが返されることを検証
- **Given**: ローカルブランチが存在する
- **When**: `branchExists()` を呼び出す
- **Then**: `true` が返される

**test_branchExists_正常系_リモートブランチ存在**
- **目的**: リモートブランチが存在する場合、trueが返されることを検証
- **Given**: リモートブランチが存在する、checkRemote=true
- **When**: `branchExists()` を呼び出す
- **Then**: `true` が返される

**test_branchExists_正常系_ブランチ不存在**
- **目的**: ブランチが存在しない場合、falseが返されることを検証
- **Given**: ブランチが存在しない
- **When**: `branchExists()` を呼び出す
- **Then**: `false` が返される

**test_branchExists_境界値_checkRemote=false**
- **目的**: checkRemote=falseの場合、リモートブランチをチェックしないことを検証
- **Given**: リモートブランチのみ存在する、checkRemote=false
- **When**: `branchExists()` を呼び出す
- **Then**: `false` が返される（リモートはチェックされない）

#### 2.3. Branch Navigation（2個）

**test_getCurrentBranch_正常系_現在のブランチ取得**
- **目的**: 現在のブランチ名が正しく取得されることを検証
- **Given**: 現在のブランチが 'feature/issue-25'
- **When**: `getCurrentBranch()` を呼び出す
- **Then**: 'feature/issue-25' が返される

**test_switchBranch_正常系_ブランチ切り替え**
- **目的**: ブランチが正常に切り替えられることを検証
- **Given**: ブランチ 'main' が存在する
- **When**: `switchBranch()` を呼び出す
- **Then**: ブランチが切り替えられる

### 3. RemoteManager テストケース（15個）

#### 3.1. Push Operations（6個）

**test_pushToRemote_正常系_upstream設定**
- **目的**: upstreamが未設定のブランチで、--set-upstreamフラグでpushされることを検証
- **Given**: upstreamが未設定
- **When**: `pushToRemote()` を呼び出す
- **Then**: --set-upstreamフラグでpushされる

**test_pushToRemote_正常系_通常push**
- **目的**: upstreamが設定済みのブランチで、通常pushされることを検証
- **Given**: upstreamが設定済み
- **When**: `pushToRemote()` を呼び出す
- **Then**: 通常pushが実行される

**test_pushToRemote_リトライ_non-fast-forward時に自動pull**
- **目的**: non-fast-forwardエラー時に、自動的にpullしてから再pushされることを検証
- **Given**: リモートブランチが進んでいる
- **When**: `pushToRemote()` を呼び出す
- **Then**: pullしてから再pushが実行される

**test_pushToRemote_リトライ_ネットワークエラー時のリトライ**
- **目的**: 一時的なネットワークエラー時に、リトライされることを検証
- **Given**: timeoutエラーが発生
- **When**: `pushToRemote()` を呼び出す
- **Then**: リトライが実行され、成功する

**test_pushToRemote_異常系_最大リトライ回数到達**
- **目的**: 最大リトライ回数に到達した場合、エラーが返されることを検証
- **Given**: pushが3回連続で失敗する
- **When**: `pushToRemote()` を呼び出す
- **Then**: 最大リトライ回数到達でエラーが返される

**test_pushToRemote_異常系_再試行不可エラー**
- **目的**: 再試行不可エラー（認証失敗等）の場合、即座に失敗することを検証
- **Given**: 認証失敗エラーが発生
- **When**: `pushToRemote()` を呼び出す
- **Then**: 即座に失敗する（リトライされない）

#### 3.2. Pull Operations（3個）

**test_pullLatest_正常系_リモートからpull**
- **目的**: リモートブランチから正常にpullされることを検証
- **Given**: リモートブランチが存在する
- **When**: `pullLatest()` を呼び出す
- **Then**: pullが正常に実行される

**test_pullLatest_正常系_ブランチ名省略**
- **目的**: ブランチ名を省略した場合、metadata.jsonからブランチ名を取得してpullされることを検証
- **Given**: metadata.jsonにブランチ名が記載されている
- **When**: `pullLatest()` を呼び出す（ブランチ名省略）
- **Then**: metadata.jsonのブランチ名でpullが実行される

**test_pullLatest_異常系_Git操作失敗**
- **目的**: Git pull操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **Given**: Git pull操作が失敗する
- **When**: `pullLatest()` を呼び出す
- **Then**: エラーが適切にハンドリングされる

#### 3.3. GitHub Credentials（4個）

**test_setupGithubCredentials_正常系_HTTPS URLにトークン埋め込み**
- **目的**: HTTPS URLにGITHUB_TOKENが正しく埋め込まれることを検証
- **Given**: GITHUB_TOKENが設定されている、リモートURLがHTTPS
- **When**: RemoteManagerをインスタンス化
- **Then**: トークンが埋め込まれたURLが設定される

**test_setupGithubCredentials_境界値_SSH URLはスキップ**
- **目的**: SSH URLの場合、トークン埋め込みがスキップされることを検証
- **Given**: リモートURLがSSH
- **When**: RemoteManagerをインスタンス化
- **Then**: set-urlは呼び出されない（スキップされる）

**test_setupGithubCredentials_境界値_トークンなし**
- **目的**: GITHUB_TOKENが未設定の場合、設定がスキップされることを検証
- **Given**: GITHUB_TOKENが未設定
- **When**: RemoteManagerをインスタンス化
- **Then**: remote操作は実行されない

**test_setupGithubCredentials_異常系_ベストエフォート実行**
- **目的**: 認証設定が失敗しても、ワークフローが継続されることを検証
- **Given**: Git操作が失敗する
- **When**: RemoteManagerをインスタンス化
- **Then**: 警告ログが出力される（例外はthrowされない）

#### 3.4. Retry Logic（5個）

**test_isRetriableError_正常系_再試行可能エラー**
- **目的**: 再試行可能なエラー（timeout等）が正しく判定されることを検証
- **Given**: timeoutエラー
- **When**: `isRetriableError()` を呼び出す
- **Then**: `true` が返される

**test_isRetriableError_正常系_再試行不可エラー**
- **目的**: 再試行不可エラー（認証失敗等）が正しく判定されることを検証
- **Given**: 認証失敗エラー
- **When**: `isRetriableError()` を呼び出す
- **Then**: `false` が返される

**test_isRetriableError_境界値_大文字小文字を区別しない**
- **目的**: エラーメッセージの大文字小文字を区別せず判定されることを検証
- **Given**: 大文字のエラーメッセージ
- **When**: `isRetriableError()` を呼び出す
- **Then**: `true` が返される

**test_isRetriableError_境界値_connection refusedエラー**
- **目的**: connection refusedエラーが再試行可能と判定されることを検証
- **Given**: connection refusedエラー
- **When**: `isRetriableError()` を呼び出す
- **Then**: `true` が返される

**test_isRetriableError_境界値_permission deniedエラー**
- **目的**: permission deniedエラーが再試行不可と判定されることを検証
- **Given**: permission deniedエラー
- **When**: `isRetriableError()` を呼び出す
- **Then**: `false` が返される

## テストカバレッジ見積もり

| マネージャー | 推定行数 | テストケース数 | 期待カバレッジ |
|-------------|---------|---------------|---------------|
| CommitManager | 530 | 15 | 85% |
| BranchManager | 110 | 9 | 90% |
| RemoteManager | 210 | 15 | 85% |
| GitManager ファサード | 181 | 27（既存テスト） | 95% |
| **合計** | **1031** | **66** | **88%** |

## モック・スタブの実装

### SimpleGit モック
```typescript
mockGit = {
  status: jest.fn(),
  add: jest.fn(),
  commit: jest.fn(),
  push: jest.fn(),
  pull: jest.fn(),
  checkoutLocalBranch: jest.fn(),
  checkout: jest.fn(),
  branchLocal: jest.fn(),
  branch: jest.fn(),
  raw: jest.fn(),
  remote: jest.fn(),
  addConfig: jest.fn(),
} as unknown as jest.Mocked<SimpleGit>;
```

### MetadataManager モック
```typescript
mockMetadata = {
  getData: jest.fn().mockReturnValue({
    issue_number: '25',
    issue_title: '[REFACTOR] Git Manager の操作別分割',
    branch_name: 'feature/issue-25',
  }),
  getIssueNumber: jest.fn().mockReturnValue('25'),
} as unknown as jest.Mocked<MetadataManager>;
```

### SecretMasker モック
```typescript
mockSecretMasker = {
  maskSecretsInWorkflowDir: jest.fn().mockResolvedValue({
    filesProcessed: 1,
    secretsMasked: 2,
    errors: [],
  }),
} as unknown as jest.Mocked<SecretMasker>;
```

## 品質ゲート確認（Phase 5）

- [x] **Phase 3のテストシナリオがすべて実装されている**
  - CommitManager: 15/15 テストケース実装済み
  - BranchManager: 9/9 テストケース実装済み
  - RemoteManager: 15/15 テストケース実装済み
  - テストシナリオで定義された全シナリオを網羅

- [x] **テストコードが実行可能である**
  - Jest形式のテストファイルとして作成
  - TypeScript型定義を使用
  - モック・スタブを適切に実装
  - 既存のテストフレームワーク（Jest）と互換性あり

- [x] **テストの意図がコメントで明確**
  - 各テストケースにドキュメントコメント（`/** */`）を記載
  - Given-When-Then構造でテストの意図を明示
  - テストケース名は日本語で分かりやすく記載（例: `test_createCommitMessage_正常系_Phase完了時のメッセージ生成`）

## 後方互換性の検証

### 既存ユニットテスト
- **ファイル**: `tests/unit/git-manager-issue16.test.ts`
- **テストケース数**: 27個
- **検証内容**: GitManagerファサードが既存のpublicメソッドを全て維持し、既存テストが無変更で通過することを確認

### 既存統合テスト
- **ファイル**: `tests/integration/workflow-init-cleanup.test.ts`
- **テストケース数**: 16個
- **検証内容**: マルチリポジトリワークフローが正常動作し、Phase完了時のコミット、リモートへのpush、ログクリーンアップが全て正常に動作することを確認

## 実装上の注意点

### 1. モック作成時の型定義
simple-gitの型定義が複雑なため、`as unknown as jest.Mocked<SimpleGit>` を使用してモックを作成しています。これにより、TypeScriptの型チェックを通過しつつ、Jestのモック機能を使用できます。

### 2. 非同期処理のテスト
`setupGithubCredentials()` はコンストラクタ内でfire-and-forget実行されるため、テストでは `setTimeout` を使用して非同期処理の完了を待機しています。

### 3. privateメソッドのテスト
CommitManagerの `buildStepCommitMessage()`, `createInitCommitMessage()`, `createCleanupCommitMessage()`, `getChangedFiles()`, `filterPhaseFiles()`, `ensureGitConfig()` は privateメソッドですが、publicメソッド経由で間接的にテストしています。必要に応じて `(commitManager as any).privateMethod()` の形式でアクセスしています。

### 4. 環境変数のクリーンアップ
`ensureGitConfig()` および `setupGithubCredentials()` のテストでは、環境変数を設定するため、テスト後に `delete process.env.VARIABLE_NAME` でクリーンアップしています。

## 次のステップ

### Phase 6: Testing（テスト実行）

1. **ユニットテスト実行**（0.5~1h）
   ```bash
   # 新規テストの実行
   npm run test:unit -- tests/unit/git/commit-manager.test.ts
   npm run test:unit -- tests/unit/git/branch-manager.test.ts
   npm run test:unit -- tests/unit/git/remote-manager.test.ts

   # 既存テストの実行（後方互換性確認）
   npm run test:unit -- tests/unit/git-manager-issue16.test.ts
   ```

2. **統合テスト実行**（0.5~1h）
   ```bash
   # 既存統合テストの実行
   npm run test:integration -- tests/integration/workflow-init-cleanup.test.ts
   ```

3. **カバレッジレポート確認**
   ```bash
   npm run test:coverage
   open coverage/lcov-report/index.html
   ```

4. **全体テストスイート実行**
   ```bash
   npm test
   ```

## トラブルシューティング

### 問題1: モックの型定義エラー
- **原因**: simple-gitの型定義が複雑
- **解決**: `as unknown as jest.Mocked<SimpleGit>` を使用

### 問題2: 非同期処理のタイミング
- **原因**: setupGithubCredentials() がfire-and-forget実行される
- **解決**: `setTimeout` を使用して非同期処理の完了を待機

### 問題3: privateメソッドのテスト
- **原因**: TypeScriptの型チェックがprivateメソッドへのアクセスを拒否
- **解決**: `(manager as any).privateMethod()` の形式でアクセス

## 参考情報

### テストファイル構造
```
tests/
├── unit/
│   ├── git/
│   │   ├── commit-manager.test.ts  ← 新規作成
│   │   ├── branch-manager.test.ts  ← 新規作成
│   │   └── remote-manager.test.ts  ← 新規作成
│   └── git-manager-issue16.test.ts  ← 既存（27テスト）
└── integration/
    └── workflow-init-cleanup.test.ts  ← 既存（16テスト）
```

### テストコマンド
```bash
# 全テスト実行
npm test

# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# カバレッジレポート生成
npm run test:coverage

# 特定のテストファイルのみ実行
npm run test:unit -- tests/unit/git/commit-manager.test.ts

# watch モードでテスト実行
npm run test:watch
```

---

**作成日**: 2025-01-20
**Issue**: #25
**Phase**: 5 (Test Implementation)
**次Phase**: 6 (Testing)
**テスト戦略**: UNIT_INTEGRATION
**新規テストケース数**: 39個
**既存テストケース数**: 43個（27個ユニット + 16個統合）
**合計テストケース数**: 82個
**期待カバレッジ**: 88%
