# テストシナリオ書 - Issue #25: Git Manager の操作別分割

## 0. Planning Document の確認

Planning Phase（`.ai-workflow/issue-25/00_planning/output/planning.md`）において、以下のテスト戦略が策定されました：

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
1. **ユニットテスト**: 各専門マネージャーの独立した動作を検証
   - コミットメッセージ生成の正確性（各メソッドの正確性）
   - ブランチ操作の正常系・エラー系
   - リモート操作のリトライロジック
   - SecretMasker との統合（モック使用）

2. **統合テスト**: 既存の統合テストが27個のテストケースでGit操作全体を検証済み
   - `tests/unit/git-manager-issue16.test.ts` (27テスト)
   - `tests/integration/workflow-init-cleanup.test.ts` (16テスト)
   - ファサード経由で既存テストがそのまま動作することで、後方互換性を保証

3. **BDDは不要**: Git操作はインフラ層であり、ユーザーストーリーベースのテストは不適切

### テストコード戦略: EXTEND_TEST

**判断根拠**:
- **既存テスト拡張**: `tests/unit/git-manager-issue16.test.ts` を拡張し、ファサードパターンの動作を検証
- **新規テスト作成**: 各専門マネージャーの単体テストファイルを作成
  - `tests/unit/git/commit-manager.test.ts`
  - `tests/unit/git/branch-manager.test.ts`
  - `tests/unit/git/remote-manager.test.ts`

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION** - ユニットテストと統合テストの組み合わせ

### テスト対象の範囲
1. **CommitManager** (約200行)
   - コミット操作（commitPhaseOutput, commitStepOutput, commitWorkflowInit, commitCleanupLogs）
   - コミットメッセージ生成（createCommitMessage, buildStepCommitMessage, createInitCommitMessage, createCleanupCommitMessage）
   - ファイル操作ヘルパー（getChangedFiles, filterPhaseFiles, ensureGitConfig）
   - SecretMasker 統合

2. **BranchManager** (約180行)
   - ブランチ操作（createBranch, branchExists, getCurrentBranch, switchBranch）
   - ローカル/リモートブランチの存在チェック

3. **RemoteManager** (約150行)
   - リモート操作（pushToRemote, pullLatest）
   - リトライロジック（isRetriableError）
   - GitHub認証設定（setupGithubCredentials）

4. **GitManager ファサード** (約150行)
   - 各専門マネージャーへの委譲
   - 後方互換性の維持

### テストの目的
1. **機能正確性**: 各マネージャーが要件定義書の機能要件を満たすことを検証
2. **後方互換性**: 既存テスト27個が全て通過することで、ファサードパターンの正しさを検証
3. **統合動作**: 既存の統合テスト16個が通過することで、マルチリポジトリワークフローの正常動作を確認
4. **エラーハンドリング**: 異常系・境界値ケースで適切なエラーハンドリングが行われることを検証
5. **リトライロジック**: ネットワークエラー時のリトライが正しく動作することを検証

---

## 2. Unitテストシナリオ

### 2.1. CommitManager のテストシナリオ

**テストファイル**: `tests/unit/git/commit-manager.test.ts`

---

#### 2.1.1. コミットメッセージ生成のテスト

**テストスイート**: `CommitManager - Message Generation`

---

**テストケース名**: `createCommitMessage_正常系_Phase完了時のメッセージ生成`

- **目的**: Phase完了時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - Phase番号: `01_requirements`
  - Status: `completed`
  - Review result: `PASS`
  - Issue番号: `25`
- **入力**:
  ```typescript
  createCommitMessage('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  ```
  "[Phase 01_requirements] completed (Review: PASS) - Issue #25"
  ```
- **テストデータ**: 上記パラメータ

---

**テストケース名**: `buildStepCommitMessage_正常系_ステップ完了時のメッセージ生成`

- **目的**: ステップ完了時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - Phase番号: `04_implementation`
  - Step番号: `3`
  - Step名: `Implement BranchManager`
  - Issue番号: `25`
- **入力**:
  ```typescript
  buildStepCommitMessage('04_implementation', 3, 'Implement BranchManager')
  ```
- **期待結果**:
  ```
  "[Phase 04_implementation - Step 3] Implement BranchManager - Issue #25"
  ```
- **テストデータ**: 上記パラメータ

---

**テストケース名**: `createInitCommitMessage_正常系_ワークフロー初期化メッセージ生成`

- **目的**: ワークフロー初期化時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - Issue番号: `25`
  - Issue タイトル: `[REFACTOR] Git Manager の操作別分割`
- **入力**:
  ```typescript
  createInitCommitMessage('[REFACTOR] Git Manager の操作別分割')
  ```
- **期待結果**:
  ```
  "[Workflow Init] Issue #25: [REFACTOR] Git Manager の操作別分割"
  ```
- **テストデータ**: 上記パラメータ

---

**テストケース名**: `createCleanupCommitMessage_正常系_クリーンアップメッセージ生成`

- **目的**: ログクリーンアップ時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - Issue番号: `25`
  - Phase番号: `04_implementation`
- **入力**:
  ```typescript
  createCleanupCommitMessage('04_implementation')
  ```
- **期待結果**:
  ```
  "[Cleanup] Removed phase logs - Phase 04_implementation - Issue #25"
  ```
- **テストデータ**: 上記パラメータ

---

**テストケース名**: `createCommitMessage_境界値_Phase番号にアンダースコアなし`

- **目的**: Phase番号がアンダースコアなし（例: "requirements"）でも正しく動作することを検証
- **前提条件**:
  - Phase番号: `requirements`（番号なし）
  - Status: `completed`
  - Review result: `PASS`
- **入力**:
  ```typescript
  createCommitMessage('requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  ```
  "[Phase requirements] completed (Review: PASS) - Issue #25"
  ```
- **テストデータ**: 上記パラメータ

---

#### 2.1.2. コミット操作のテスト

**テストスイート**: `CommitManager - Commit Operations`

---

**テストケース名**: `commitPhaseOutput_正常系_変更ファイルあり`

- **目的**: Phase完了時にコミットが正常に作成されることを検証
- **前提条件**:
  - 変更ファイルが存在する（`.ai-workflow/issue-25/01_requirements/output/requirements.md`）
  - SecretMasker が正常に動作する
  - Git設定が完了している
- **入力**:
  ```typescript
  commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    commit_hash: '1234567',
    files_committed: ['.ai-workflow/issue-25/01_requirements/output/requirements.md'],
    error: null
  }
  ```
- **テストデータ**: モックGitインスタンス、モックSecretMasker

---

**テストケース名**: `commitPhaseOutput_正常系_変更ファイルなし`

- **目的**: 変更ファイルがない場合、警告ログを出力し、成功として扱われることを検証
- **前提条件**:
  - 変更ファイルが存在しない
- **入力**:
  ```typescript
  commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    commit_hash: null,
    files_committed: [],
    error: null
  }
  ```
  - 警告ログ: `[WARN] No files to commit for phase 01_requirements`
- **テストデータ**: モックGitインスタンス（空のstatus）

---

**テストケース名**: `commitPhaseOutput_異常系_Git操作失敗`

- **目的**: Git操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **前提条件**:
  - 変更ファイルが存在する
  - Git commit操作が失敗する
- **入力**:
  ```typescript
  commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    commit_hash: null,
    files_committed: [],
    error: 'Git command failed: fatal: unable to write new index file'
  }
  ```
- **テストデータ**: モックGitインスタンス（commit時にエラーをthrow）

---

**テストケース名**: `commitStepOutput_正常系_ステップコミット作成`

- **目的**: ステップ完了時にコミットが正常に作成されることを検証
- **前提条件**:
  - 変更ファイルが存在する（`.ai-workflow/issue-25/04_implementation/step-3.md`）
  - SecretMasker が正常に動作する
- **入力**:
  ```typescript
  commitStepOutput('04_implementation', 3, 'Implement BranchManager')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    commit_hash: '2345678',
    files_committed: ['.ai-workflow/issue-25/04_implementation/step-3.md'],
    error: null
  }
  ```
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `commitWorkflowInit_正常系_初期化コミット作成`

- **目的**: ワークフロー初期化時にコミットが正常に作成されることを検証
- **前提条件**:
  - metadata.json が作成されている
- **入力**:
  ```typescript
  commitWorkflowInit('[REFACTOR] Git Manager の操作別分割')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    commit_hash: '3456789',
    files_committed: ['.ai-workflow/issue-25/metadata.json'],
    error: null
  }
  ```
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `commitCleanupLogs_正常系_クリーンアップコミット作成`

- **目的**: ログクリーンアップ時にコミットが正常に作成されることを検証
- **前提条件**:
  - 削除ファイルが存在する（`.ai-workflow/issue-25/04_implementation/logs/`）
- **入力**:
  ```typescript
  commitCleanupLogs('04_implementation')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    commit_hash: '4567890',
    files_committed: ['.ai-workflow/issue-25/04_implementation/logs/'],
    error: null
  }
  ```
- **テストデータ**: モックGitインスタンス

---

#### 2.1.3. SecretMasker 統合のテスト

**テストスイート**: `CommitManager - SecretMasker Integration`

---

**テストケース名**: `commitPhaseOutput_SecretMasker統合_マスキング成功`

- **目的**: SecretMaskerが正常に実行され、機密情報がマスキングされることを検証
- **前提条件**:
  - 変更ファイルに機密情報（APIキー等）が含まれている
  - SecretMasker が正常に動作する
- **入力**:
  ```typescript
  commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  - SecretMasker.maskSecretsInWorkflowDir() が呼び出される
  - マスキング結果: `{ filesProcessed: 1, secretsMasked: 2 }`
  - 情報ログ: `[INFO] Masked 2 secret(s)`
  - コミットは正常に作成される
- **テストデータ**: モックSecretMasker（maskSecretsInWorkflowDir をモック）

---

**テストケース名**: `commitPhaseOutput_SecretMasker統合_マスキング失敗時も継続`

- **目的**: SecretMaskerが失敗した場合も、コミットは継続されることを検証（ベストエフォート）
- **前提条件**:
  - 変更ファイルが存在する
  - SecretMasker が例外をthrow
- **入力**:
  ```typescript
  commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  - エラーログ: `[ERROR] Secret masking failed: ...`
  - コミットは継続される
  - 戻り値: `{ success: true, commit_hash: '...', ... }`
- **テストデータ**: モックSecretMasker（例外をthrow）

---

#### 2.1.4. ファイル操作ヘルパーのテスト

**テストスイート**: `CommitManager - File Helpers`

---

**テストケース名**: `getChangedFiles_正常系_変更ファイル取得`

- **目的**: Git statusから変更ファイルを正しく取得できることを検証
- **前提条件**:
  - Git statusで以下のファイルが検出される:
    - modified: `src/core/git-manager.ts`
    - not_added: `src/core/git/commit-manager.ts`
- **入力**:
  ```typescript
  getChangedFiles()
  ```
- **期待結果**:
  ```typescript
  [
    'src/core/git-manager.ts',
    'src/core/git/commit-manager.ts'
  ]
  ```
- **テストデータ**: モックGitインスタンス（status をモック）

---

**テストケース名**: `getChangedFiles_境界値_@tmpファイルを除外`

- **目的**: `@tmp` ファイルが除外されることを検証
- **前提条件**:
  - Git statusで以下のファイルが検出される:
    - modified: `src/core/git-manager.ts`
    - not_added: `output/@tmp-agent-session.log`
- **入力**:
  ```typescript
  getChangedFiles()
  ```
- **期待結果**:
  ```typescript
  [
    'src/core/git-manager.ts'
  ]
  ```
  - `output/@tmp-agent-session.log` は除外される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `filterPhaseFiles_正常系_Issue番号でフィルタリング`

- **目的**: Issue番号に基づいてファイルを正しくフィルタリングできることを検証
- **前提条件**:
  - 全ファイル:
    - `.ai-workflow/issue-25/01_requirements/output/requirements.md`
    - `.ai-workflow/issue-24/01_requirements/output/requirements.md`
    - `src/core/git-manager.ts`
  - Issue番号: `25`
- **入力**:
  ```typescript
  filterPhaseFiles(allFiles, '25')
  ```
- **期待結果**:
  ```typescript
  [
    '.ai-workflow/issue-25/01_requirements/output/requirements.md'
  ]
  ```
- **テストデータ**: 上記ファイルリスト

---

**テストケース名**: `ensureGitConfig_正常系_Git設定を自動設定`

- **目的**: user.name/user.email が自動設定されることを検証
- **前提条件**:
  - Git設定が未完了
  - 環境変数: `GIT_COMMIT_USER_NAME=Claude AI`, `GIT_COMMIT_USER_EMAIL=claude@example.com`
- **入力**:
  ```typescript
  ensureGitConfig()
  ```
- **期待結果**:
  - `git.addConfig('user.name', 'Claude AI')` が呼び出される
  - `git.addConfig('user.email', 'claude@example.com')` が呼び出される
- **テストデータ**: モックGitインスタンス、環境変数

---

### 2.2. BranchManager のテストシナリオ

**テストファイル**: `tests/unit/git/branch-manager.test.ts`

---

#### 2.2.1. ブランチ作成のテスト

**テストスイート**: `BranchManager - Branch Creation`

---

**テストケース名**: `createBranch_正常系_新規ブランチ作成`

- **目的**: 新規ブランチが正常に作成されることを検証
- **前提条件**:
  - ブランチ `feature/issue-25` が存在しない
- **入力**:
  ```typescript
  createBranch('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    branch_name: 'feature/issue-25',
    error: null
  }
  ```
  - `git.checkoutLocalBranch('feature/issue-25')` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `createBranch_正常系_ベースブランチから分岐`

- **目的**: ベースブランチから新規ブランチが作成されることを検証
- **前提条件**:
  - ベースブランチ `main` が存在する
  - ブランチ `feature/issue-25` が存在しない
- **入力**:
  ```typescript
  createBranch('feature/issue-25', 'main')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    branch_name: 'feature/issue-25',
    error: null
  }
  ```
  - `git.checkoutLocalBranch('feature/issue-25')` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `createBranch_異常系_既存ブランチ`

- **目的**: 既存ブランチと同名のブランチを作成しようとした場合、エラーが返されることを検証
- **前提条件**:
  - ブランチ `feature/issue-25` が既に存在する
- **入力**:
  ```typescript
  createBranch('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    branch_name: 'feature/issue-25',
    error: 'Branch feature/issue-25 already exists'
  }
  ```
  - `git.checkoutLocalBranch()` は呼び出されない
- **テストデータ**: モックGitインスタンス（branchExists = true）

---

**テストケース名**: `createBranch_異常系_Git操作失敗`

- **目的**: Git操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **前提条件**:
  - ブランチが存在しない
  - Git操作が失敗する
- **入力**:
  ```typescript
  createBranch('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    branch_name: 'feature/issue-25',
    error: 'Git command failed: fatal: unable to create branch'
  }
  ```
- **テストデータ**: モックGitインスタンス（checkoutLocalBranch でエラーをthrow）

---

#### 2.2.2. ブランチ存在チェックのテスト

**テストスイート**: `BranchManager - Branch Existence`

---

**テストケース名**: `branchExists_正常系_ローカルブランチ存在`

- **目的**: ローカルブランチが存在する場合、trueが返されることを検証
- **前提条件**:
  - ローカルブランチ `feature/issue-25` が存在する
- **入力**:
  ```typescript
  branchExists('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  true
  ```
  - `git.branchLocal()` が呼び出される
- **テストデータ**: モックGitインスタンス（branchLocal に `feature/issue-25` を含める）

---

**テストケース名**: `branchExists_正常系_リモートブランチ存在`

- **目的**: リモートブランチが存在する場合、trueが返されることを検証
- **前提条件**:
  - ローカルブランチ `feature/issue-25` が存在しない
  - リモートブランチ `origin/feature/issue-25` が存在する
  - checkRemote = true
- **入力**:
  ```typescript
  branchExists('feature/issue-25', true)
  ```
- **期待結果**:
  ```typescript
  true
  ```
  - `git.branch(['--remotes'])` が呼び出される
- **テストデータ**: モックGitインスタンス（branch に `origin/feature/issue-25` を含める）

---

**テストケース名**: `branchExists_正常系_ブランチ不存在`

- **目的**: ブランチが存在しない場合、falseが返されることを検証
- **前提条件**:
  - ローカルブランチ `feature/issue-25` が存在しない
  - リモートブランチ `origin/feature/issue-25` が存在しない
- **入力**:
  ```typescript
  branchExists('feature/issue-25', true)
  ```
- **期待結果**:
  ```typescript
  false
  ```
- **テストデータ**: モックGitインスタンス（空のbranch結果）

---

**テストケース名**: `branchExists_境界値_checkRemote=false`

- **目的**: checkRemote=false の場合、リモートブランチをチェックしないことを検証
- **前提条件**:
  - ローカルブランチ `feature/issue-25` が存在しない
  - リモートブランチ `origin/feature/issue-25` が存在する
  - checkRemote = false
- **入力**:
  ```typescript
  branchExists('feature/issue-25', false)
  ```
- **期待結果**:
  ```typescript
  false
  ```
  - `git.branch(['--remotes'])` は呼び出されない
- **テストデータ**: モックGitインスタンス

---

#### 2.2.3. ブランチ取得・切り替えのテスト

**テストスイート**: `BranchManager - Branch Navigation`

---

**テストケース名**: `getCurrentBranch_正常系_現在のブランチ取得`

- **目的**: 現在のブランチ名が正しく取得されることを検証
- **前提条件**:
  - 現在のブランチ: `feature/issue-25`
- **入力**:
  ```typescript
  getCurrentBranch()
  ```
- **期待結果**:
  ```typescript
  'feature/issue-25'
  ```
  - `git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `switchBranch_正常系_ブランチ切り替え`

- **目的**: ブランチが正常に切り替えられることを検証
- **前提条件**:
  - ブランチ `main` が存在する
- **入力**:
  ```typescript
  switchBranch('main')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    branch_name: 'main',
    error: null
  }
  ```
  - `git.checkout('main')` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `switchBranch_異常系_存在しないブランチ`

- **目的**: 存在しないブランチに切り替えようとした場合、エラーが返されることを検証
- **前提条件**:
  - ブランチ `non-existent` が存在しない
- **入力**:
  ```typescript
  switchBranch('non-existent')
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    branch_name: 'non-existent',
    error: 'Git command failed: error: pathspec \'non-existent\' did not match'
  }
  ```
- **テストデータ**: モックGitインスタンス（checkout でエラーをthrow）

---

### 2.3. RemoteManager のテストシナリオ

**テストファイル**: `tests/unit/git/remote-manager.test.ts`

---

#### 2.3.1. Push操作のテスト

**テストスイート**: `RemoteManager - Push Operations`

---

**テストケース名**: `pushToRemote_正常系_upstream設定`

- **目的**: upstreamが未設定のブランチで、--set-upstreamフラグでpushされることを検証
- **前提条件**:
  - ブランチ `feature/issue-25` のupstreamが未設定
  - リモート `origin` が存在する
- **入力**:
  ```typescript
  pushToRemote()
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    retries: 0,
    error: undefined
  }
  ```
  - `git.raw(['push', '--set-upstream', 'origin', 'feature/issue-25'])` が呼び出される
- **テストデータ**: モックGitインスタンス、モックMetadataManager（branch_name='feature/issue-25'）

---

**テストケース名**: `pushToRemote_正常系_通常push`

- **目的**: upstreamが設定済みのブランチで、通常pushされることを検証
- **前提条件**:
  - ブランチ `feature/issue-25` のupstreamが設定済み
  - リモート `origin` が存在する
- **入力**:
  ```typescript
  pushToRemote()
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    retries: 0,
    error: undefined
  }
  ```
  - `git.push('origin', 'feature/issue-25')` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `pushToRemote_リトライ_non-fast-forward時に自動pull`

- **目的**: non-fast-forwardエラー時に、自動的にpullしてから再pushされることを検証
- **前提条件**:
  - リモートブランチが進んでいる（non-fast-forward）
  - 1回目のpushで `rejected` エラー
  - 2回目のpushで成功
- **入力**:
  ```typescript
  pushToRemote(maxRetries=3, retryDelay=100)
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    retries: 1,
    error: undefined
  }
  ```
  - 1回目: `git.push()` でエラー → `pullLatest()` 呼び出し
  - 2回目: `git.push()` で成功
- **テストデータ**: モックGitインスタンス（1回目はreject、2回目は成功）

---

**テストケース名**: `pushToRemote_リトライ_ネットワークエラー時のリトライ`

- **目的**: 一時的なネットワークエラー時に、リトライされることを検証
- **前提条件**:
  - 1回目のpushで `timeout` エラー
  - 2回目のpushで成功
- **入力**:
  ```typescript
  pushToRemote(maxRetries=3, retryDelay=100)
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    retries: 1,
    error: undefined
  }
  ```
  - 1回目: エラー → リトライ待機（100ms）
  - 2回目: 成功
- **テストデータ**: モックGitインスタンス（1回目はtimeout、2回目は成功）

---

**テストケース名**: `pushToRemote_異常系_最大リトライ回数到達`

- **目的**: 最大リトライ回数に到達した場合、エラーが返されることを検証
- **前提条件**:
  - pushが3回連続で失敗する（ネットワークエラー）
- **入力**:
  ```typescript
  pushToRemote(maxRetries=3, retryDelay=100)
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    retries: 3,
    error: 'timeout exceeded'
  }
  ```
- **テストデータ**: モックGitインスタンス（全回エラー）

---

**テストケース名**: `pushToRemote_異常系_再試行不可エラー`

- **目的**: 再試行不可エラー（認証失敗等）の場合、即座に失敗することを検証
- **前提条件**:
  - pushで `authentication failed` エラー
- **入力**:
  ```typescript
  pushToRemote(maxRetries=3, retryDelay=100)
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    retries: 0,
    error: 'authentication failed'
  }
  ```
  - リトライされない
- **テストデータ**: モックGitインスタンス（authentication failedエラー）

---

#### 2.3.2. Pull操作のテスト

**テストスイート**: `RemoteManager - Pull Operations`

---

**テストケース名**: `pullLatest_正常系_リモートからpull`

- **目的**: リモートブランチから正常にpullされることを検証
- **前提条件**:
  - リモートブランチ `origin/feature/issue-25` が存在する
  - ローカルブランチ `feature/issue-25` が存在する
- **入力**:
  ```typescript
  pullLatest('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    error: null
  }
  ```
  - `git.pull('origin', 'feature/issue-25', ['--no-rebase'])` が呼び出される
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `pullLatest_正常系_ブランチ名省略`

- **目的**: ブランチ名を省略した場合、metadata.jsonからブランチ名を取得してpullされることを検証
- **前提条件**:
  - metadata.json に `branch_name: 'feature/issue-25'` が記載されている
  - リモートブランチ `origin/feature/issue-25` が存在する
- **入力**:
  ```typescript
  pullLatest()
  ```
- **期待結果**:
  ```typescript
  {
    success: true,
    error: null
  }
  ```
  - `git.pull('origin', 'feature/issue-25', ['--no-rebase'])` が呼び出される
- **テストデータ**: モックGitインスタンス、モックMetadataManager

---

**テストケース名**: `pullLatest_異常系_Git操作失敗`

- **目的**: Git pull操作が失敗した場合、エラーが適切にハンドリングされることを検証
- **前提条件**:
  - Git pull操作が失敗する
- **入力**:
  ```typescript
  pullLatest('feature/issue-25')
  ```
- **期待結果**:
  ```typescript
  {
    success: false,
    error: 'Git command failed: fatal: unable to access...'
  }
  ```
- **テストデータ**: モックGitインスタンス（pull でエラーをthrow）

---

#### 2.3.3. GitHub認証設定のテスト

**テストスイート**: `RemoteManager - GitHub Credentials`

---

**テストケース名**: `setupGithubCredentials_正常系_HTTPS URLにトークン埋め込み`

- **目的**: HTTPS URLにGITHUB_TOKENが正しく埋め込まれることを検証
- **前提条件**:
  - 環境変数 `GITHUB_TOKEN=ghp_xxxxxxxxxxxxx`
  - リモートURL: `https://github.com/tielec/ai-workflow-agent.git`
- **入力**:
  ```typescript
  setupGithubCredentials()
  ```
- **期待結果**:
  - `git.remote(['set-url', 'origin', 'https://ghp_xxxxxxxxxxxxx@github.com/tielec/ai-workflow-agent.git'])` が呼び出される
- **テストデータ**: モックGitインスタンス、環境変数

---

**テストケース名**: `setupGithubCredentials_境界値_SSH URLはスキップ`

- **目的**: SSH URLの場合、トークン埋め込みがスキップされることを検証
- **前提条件**:
  - 環境変数 `GITHUB_TOKEN=ghp_xxxxxxxxxxxxx`
  - リモートURL: `git@github.com:tielec/ai-workflow-agent.git`
- **入力**:
  ```typescript
  setupGithubCredentials()
  ```
- **期待結果**:
  - 情報ログ: `[INFO] Git remote URL is not HTTPS, skipping token configuration`
  - `git.remote(['set-url', ...])` は呼び出されない
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `setupGithubCredentials_境界値_トークンなし`

- **目的**: GITHUB_TOKENが未設定の場合、設定がスキップされることを検証
- **前提条件**:
  - 環境変数 `GITHUB_TOKEN` が未設定
- **入力**:
  ```typescript
  setupGithubCredentials()
  ```
- **期待結果**:
  - 処理がスキップされる
  - `git.remote(['get-url', ...])` は呼び出されない
- **テストデータ**: 環境変数未設定

---

**テストケース名**: `setupGithubCredentials_異常系_ベストエフォート実行`

- **目的**: 認証設定が失敗しても、ワークフローが継続されることを検証（ベストエフォート）
- **前提条件**:
  - 環境変数 `GITHUB_TOKEN=ghp_xxxxxxxxxxxxx`
  - Git操作が失敗する
- **入力**:
  ```typescript
  setupGithubCredentials()
  ```
- **期待結果**:
  - 警告ログ: `[WARN] Failed to set up GitHub credentials: ...`
  - 例外はthrowされない（catch内で処理）
- **テストデータ**: モックGitインスタンス（remote でエラーをthrow）

---

#### 2.3.4. リトライロジックのテスト

**テストスイート**: `RemoteManager - Retry Logic`

---

**テストケース名**: `isRetriableError_正常系_再試行可能エラー`

- **目的**: 再試行可能なエラー（timeout等）が正しく判定されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  isRetriableError(new Error('timeout exceeded'))
  ```
- **期待結果**:
  ```typescript
  true
  ```
- **テストデータ**: エラーオブジェクト

---

**テストケース名**: `isRetriableError_正常系_再試行不可エラー`

- **目的**: 再試行不可エラー（認証失敗等）が正しく判定されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  isRetriableError(new Error('authentication failed'))
  ```
- **期待結果**:
  ```typescript
  false
  ```
- **テストデータ**: エラーオブジェクト

---

**テストケース名**: `isRetriableError_境界値_大文字小文字を区別しない`

- **目的**: エラーメッセージの大文字小文字を区別せず判定されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  isRetriableError(new Error('TIMEOUT EXCEEDED'))
  ```
- **期待結果**:
  ```typescript
  true
  ```
- **テストデータ**: エラーオブジェクト

---

### 2.4. GitManager ファサードのテストシナリオ

**テストファイル**: `tests/unit/git-manager.test.ts`（既存ファイルの拡張）

---

#### 2.4.1. ファサード委譲のテスト

**テストスイート**: `GitManager - Facade Delegation`

---

**テストケース名**: `GitManager_委譲_CommitManager.commitPhaseOutput`

- **目的**: GitManager.commitPhaseOutput() が CommitManager.commitPhaseOutput() に正しく委譲されることを検証
- **前提条件**:
  - GitManager が正しくインスタンス化されている
- **入力**:
  ```typescript
  gitManager.commitPhaseOutput('01_requirements', 'completed', 'PASS')
  ```
- **期待結果**:
  - `commitManager.commitPhaseOutput('01_requirements', 'completed', 'PASS')` が呼び出される
  - 戻り値が CommitManager から返される
- **テストデータ**: モックCommitManager

---

**テストケース名**: `GitManager_委譲_BranchManager.createBranch`

- **目的**: GitManager.createBranch() が BranchManager.createBranch() に正しく委譲されることを検証
- **前提条件**:
  - GitManager が正しくインスタンス化されている
- **入力**:
  ```typescript
  gitManager.createBranch('feature/issue-25')
  ```
- **期待結果**:
  - `branchManager.createBranch('feature/issue-25')` が呼び出される
  - 戻り値が BranchManager から返される
- **テストデータ**: モックBranchManager

---

**テストケース名**: `GitManager_委譲_RemoteManager.pushToRemote`

- **目的**: GitManager.pushToRemote() が RemoteManager.pushToRemote() に正しく委譲されることを検証
- **前提条件**:
  - GitManager が正しくインスタンス化されている
- **入力**:
  ```typescript
  gitManager.pushToRemote()
  ```
- **期待結果**:
  - `remoteManager.pushToRemote()` が呼び出される
  - 戻り値が RemoteManager から返される
- **テストデータ**: モックRemoteManager

---

#### 2.4.2. 共通操作のテスト

**テストスイート**: `GitManager - Common Operations`

---

**テストケース名**: `getStatus_正常系_ステータス取得`

- **目的**: Git statusが正しく取得されることを検証
- **前提条件**:
  - Git statusで以下が検出される:
    - current: `feature/issue-25`
    - files: [`src/core/git-manager.ts`]
    - not_added: [`src/core/git/commit-manager.ts`]
    - modified: [`src/core/git-manager.ts`]
- **入力**:
  ```typescript
  gitManager.getStatus()
  ```
- **期待結果**:
  ```typescript
  {
    branch: 'feature/issue-25',
    is_dirty: true,
    untracked_files: ['src/core/git/commit-manager.ts'],
    modified_files: ['src/core/git-manager.ts']
  }
  ```
- **テストデータ**: モックGitインスタンス

---

**テストケース名**: `getStatus_境界値_HEADデタッチ状態`

- **目的**: HEADがデタッチ状態の場合、'HEAD'が返されることを検証
- **前提条件**:
  - Git statusで current が null（デタッチ状態）
- **入力**:
  ```typescript
  gitManager.getStatus()
  ```
- **期待結果**:
  ```typescript
  {
    branch: 'HEAD',
    is_dirty: false,
    untracked_files: [],
    modified_files: []
  }
  ```
- **テストデータ**: モックGitインスタンス（current=null）

---

---

## 3. Integrationテストシナリオ

### 3.1. 既存テストの後方互換性検証

**テストファイル**: `tests/unit/git-manager-issue16.test.ts`（既存ファイル、27テスト）

---

#### 3.1.1. 統合シナリオ概要

**シナリオ名**: `既存ユニットテスト27個の継続実行`

- **目的**: ファサードパターンにより、既存の27個のユニットテストが全て通過することで、後方互換性100%を検証する
- **前提条件**:
  - GitManager ファサードが正しく実装されている
  - 各専門マネージャー（CommitManager, BranchManager, RemoteManager）が正しく実装されている
  - 既存テストファイル `tests/unit/git-manager-issue16.test.ts` が存在する
- **テスト手順**:
  1. `npm run test:unit -- tests/unit/git-manager-issue16.test.ts` を実行
  2. 全27テストが通過することを確認
  3. テスト実行時間が前回と同等であることを確認（パフォーマンス劣化がないこと）
- **期待結果**:
  - 全27テストが通過する（Pass率100%）
  - テストカバレッジが80%以上である
  - ファサード委譲オーバーヘッドが1ms未満である（パフォーマンス要件）
- **確認項目**:
  - [x] `GitManager.commitPhaseOutput()` が正常動作する
  - [x] `GitManager.commitStepOutput()` が正常動作する
  - [x] `GitManager.commitWorkflowInit()` が正常動作する
  - [x] `GitManager.commitCleanupLogs()` が正常動作する
  - [x] `GitManager.createBranch()` が正常動作する
  - [x] `GitManager.branchExists()` が正常動作する
  - [x] `GitManager.getCurrentBranch()` が正常動作する
  - [x] `GitManager.switchBranch()` が正常動作する
  - [x] `GitManager.pushToRemote()` が正常動作する
  - [x] `GitManager.pullLatest()` が正常動作する
  - [x] `GitManager.getStatus()` が正常動作する
  - [x] コミットメッセージ生成が正確である
  - [x] SecretMasker 統合が正常動作する
  - [x] Git設定の自動設定が正常動作する
  - [x] リトライロジックが正常動作する

---

#### 3.1.2. 既存テストの詳細

既存テストファイル `tests/unit/git-manager-issue16.test.ts` には、以下のテストスイートが含まれています：

1. **Basic Git operations** (約10テスト)
   - ブランチ作成、切り替え、存在チェック
   - コミット作成
   - ステータス取得

2. **Commit operations** (約10テスト)
   - Phase完了時のコミット
   - ステップ完了時のコミット
   - ワークフロー初期化コミット
   - ログクリーンアップコミット
   - コミットメッセージ生成

3. **Remote operations** (約7テスト)
   - Push操作
   - Pull操作
   - リトライロジック
   - GitHub認証設定

**検証ポイント**:
- これらのテストが**全て変更なしで実行可能**であることを確認
- テストコードの修正が不要であることを確認
- 既存のテストデータ・モックがそのまま使用可能であることを確認

---

### 3.2. マルチリポジトリワークフローの統合テスト

**テストファイル**: `tests/integration/workflow-init-cleanup.test.ts`（既存ファイル、16テスト）

---

#### 3.2.1. 統合シナリオ概要

**シナリオ名**: `マルチリポジトリワークフロー全体の動作検証`

- **目的**: ファサードパターンにより、既存の16個の統合テストが全て通過することで、マルチリポジトリワークフローが正常動作することを検証する
- **前提条件**:
  - GitManager ファサードが正しく実装されている
  - 各専門マネージャーが正しく実装されている
  - 既存テストファイル `tests/integration/workflow-init-cleanup.test.ts` が存在する
  - テスト用リポジトリが利用可能である
- **テスト手順**:
  1. `npm run test:integration -- tests/integration/workflow-init-cleanup.test.ts` を実行
  2. 全16テストが通過することを確認
  3. ワークフローの各フェーズ（init, planning, requirements, design, test_scenario, implementation, testing, documentation, report）が正常動作することを確認
- **期待結果**:
  - 全16テストが通過する（Pass率100%）
  - ワークフロー初期化（init）が正常完了する
  - Phase完了時のコミットが正常作成される
  - リモートへのpushが正常完了する
  - ログクリーンアップが正常完了する
- **確認項目**:
  - [x] ワークフロー初期化コミットが作成される
  - [x] metadata.json が正しく生成される
  - [x] ブランチが正しく作成される
  - [x] Phase完了時にコミットが作成される
  - [x] SecretMasker が正常動作する
  - [x] リモートへのpushが成功する
  - [x] non-fast-forwardエラー時の自動pullとリトライが動作する
  - [x] ログクリーンアップが正常完了する
  - [x] 全フェーズが連続して実行可能である

---

#### 3.2.2. 既存統合テストの詳細

既存統合テストファイル `tests/integration/workflow-init-cleanup.test.ts` には、以下のテストシナリオが含まれています：

1. **Workflow initialization** (約5テスト)
   - ワークフロー初期化コミット作成
   - metadata.json 生成
   - ブランチ作成

2. **Phase execution** (約8テスト)
   - Phase完了時のコミット作成
   - SecretMasker 統合
   - リモートへのpush

3. **Cleanup operations** (約3テスト)
   - ログクリーンアップコミット作成
   - 不要ファイルの削除

**検証ポイント**:
- これらのテストが**全て変更なしで実行可能**であることを確認
- テストコードの修正が不要であることを確認
- 実際のGitリポジトリでの動作が正常であることを確認

---

### 3.3. 新規統合テストシナリオ

**テストファイル**: `tests/integration/git-manager-facade.test.ts`（新規作成）

---

#### 3.3.1. ファサードパターンの統合検証

**シナリオ名**: `GitManagerファサードとマネージャー間の統合動作検証`

- **目的**: GitManagerファサードが各専門マネージャーと正しく統合されていることを検証
- **前提条件**:
  - 実際のGitリポジトリが利用可能である
  - simple-gitインスタンスが正しく共有されている
  - MetadataManager と SecretMasker が正常に動作する
- **テスト手順**:
  1. GitManagerをインスタンス化する
  2. ブランチを作成する（BranchManager）
  3. ファイルを変更し、コミットを作成する（CommitManager）
  4. リモートにpushする（RemoteManager）
  5. リモートからpullする（RemoteManager）
  6. ブランチを切り替える（BranchManager）
- **期待結果**:
  - 全ての操作が正常完了する
  - simple-gitインスタンスが各マネージャー間で共有されている
  - MetadataManager と SecretMasker が正しく統合されている
  - エラーが発生しない
- **確認項目**:
  - [x] simple-gitインスタンスが1つだけ生成される
  - [x] 各マネージャーが同じsimple-gitインスタンスを使用する
  - [x] MetadataManager が CommitManager に正しく注入される
  - [x] SecretMasker が CommitManager に正しく注入される
  - [x] ファサード委譲が正しく動作する
  - [x] エラーハンドリングが正しく動作する

---

#### 3.3.2. エンドツーエンドワークフローの検証

**シナリオ名**: `Phase完了からリモートpushまでのエンドツーエンドワークフロー`

- **目的**: Phase完了時のコミット作成からリモートpushまでの全体フローが正常動作することを検証
- **前提条件**:
  - 実際のGitリポジトリが利用可能である
  - リモートリポジトリが利用可能である
  - GITHUB_TOKEN が設定されている
- **テスト手順**:
  1. Phase完了時のファイルを作成する（例: `.ai-workflow/issue-25/01_requirements/output/requirements.md`）
  2. SecretMaskerを実行する
  3. コミットを作成する（CommitManager.commitPhaseOutput）
  4. リモートにpushする（RemoteManager.pushToRemote）
  5. コミットハッシュを確認する
  6. リモートブランチを確認する
- **期待結果**:
  - SecretMasker が実行される
  - コミットが正常作成される
  - リモートへのpushが成功する
  - コミットハッシュが取得できる
  - リモートブランチにコミットが反映される
- **確認項目**:
  - [x] SecretMasker が実行される
  - [x] 機密情報がマスキングされる
  - [x] コミットメッセージが正確である
  - [x] コミットハッシュが取得できる
  - [x] リモートへのpushが成功する
  - [x] リモートブランチにコミットが反映される

---

## 4. テストデータ

### 4.1. モックGitインスタンス

**使用目的**: simple-gitのモックオブジェクトを作成し、実際のGit操作をシミュレートする

**テストデータ構造**:
```typescript
const mockGit = {
  status: jest.fn(() => ({
    current: 'feature/issue-25',
    files: [
      { path: 'src/core/git-manager.ts', working_dir: 'M' },
      { path: 'src/core/git/commit-manager.ts', working_dir: '?' }
    ],
    not_added: ['src/core/git/commit-manager.ts'],
    modified: ['src/core/git-manager.ts']
  })),

  add: jest.fn(() => Promise.resolve()),

  commit: jest.fn(() => ({
    commit: '1234567890abcdef',
    summary: { changes: 1, insertions: 10, deletions: 2 }
  })),

  push: jest.fn(() => Promise.resolve()),

  pull: jest.fn(() => Promise.resolve()),

  checkoutLocalBranch: jest.fn(() => Promise.resolve()),

  checkout: jest.fn(() => Promise.resolve()),

  branchLocal: jest.fn(() => ({
    all: ['main', 'feature/issue-25']
  })),

  branch: jest.fn((args) => {
    if (args.includes('--remotes')) {
      return { all: ['origin/main', 'origin/feature/issue-25'] };
    }
    return { all: ['main', 'feature/issue-25'] };
  }),

  raw: jest.fn((args) => {
    if (args[0] === 'rev-parse') {
      return 'feature/issue-25';
    }
    if (args[0] === 'remote') {
      return 'https://github.com/tielec/ai-workflow-agent.git';
    }
    return '';
  }),

  remote: jest.fn(() => Promise.resolve()),

  addConfig: jest.fn(() => Promise.resolve())
};
```

**使用例**:
```typescript
const commitManager = new CommitManager(mockGit, mockMetadata, mockSecretMasker, '/repo');
await commitManager.commitPhaseOutput('01_requirements', 'completed', 'PASS');
expect(mockGit.commit).toHaveBeenCalled();
```

---

### 4.2. モックMetadataManager

**使用目的**: MetadataManagerのモックオブジェクトを作成し、metadata.jsonの読み書きをシミュレートする

**テストデータ構造**:
```typescript
const mockMetadata = {
  getData: jest.fn(() => ({
    issue_number: '25',
    issue_title: '[REFACTOR] Git Manager の操作別分割',
    branch_name: 'feature/issue-25',
    repository_path: '/tmp/test-repo'
  })),

  setData: jest.fn((data) => Promise.resolve()),

  getIssueNumber: jest.fn(() => '25'),

  getBranchName: jest.fn(() => 'feature/issue-25')
};
```

**使用例**:
```typescript
const commitManager = new CommitManager(mockGit, mockMetadata, mockSecretMasker, '/repo');
const message = commitManager.createCommitMessage('01_requirements', 'completed', 'PASS');
expect(message).toContain('Issue #25');
```

---

### 4.3. モックSecretMasker

**使用目的**: SecretMaskerのモックオブジェクトを作成し、機密情報のマスキングをシミュレートする

**テストデータ構造**:
```typescript
const mockSecretMasker = {
  maskSecretsInWorkflowDir: jest.fn(() => ({
    filesProcessed: 1,
    secretsMasked: 2,
    errors: []
  }))
};
```

**使用例**:
```typescript
const commitManager = new CommitManager(mockGit, mockMetadata, mockSecretMasker, '/repo');
await commitManager.commitPhaseOutput('01_requirements', 'completed', 'PASS');
expect(mockSecretMasker.maskSecretsInWorkflowDir).toHaveBeenCalled();
```

---

### 4.4. テスト用ファイルパス

**使用目的**: テストで使用するファイルパスのサンプルデータ

**テストデータ**:
```typescript
const testFiles = {
  requirements: '.ai-workflow/issue-25/01_requirements/output/requirements.md',
  design: '.ai-workflow/issue-25/02_design/output/design.md',
  testScenario: '.ai-workflow/issue-25/03_test_scenario/output/test-scenario.md',
  implementation: 'src/core/git-manager.ts',
  commitManager: 'src/core/git/commit-manager.ts',
  branchManager: 'src/core/git/branch-manager.ts',
  remoteManager: 'src/core/git/remote-manager.ts',
  metadata: '.ai-workflow/issue-25/metadata.json',
  tmpFile: 'output/@tmp-agent-session.log'
};
```

---

### 4.5. テスト用エラーメッセージ

**使用目的**: エラーハンドリングテストで使用するエラーメッセージのサンプル

**テストデータ**:
```typescript
const errorMessages = {
  // 再試行可能エラー
  retriable: {
    timeout: 'timeout exceeded',
    connectionRefused: 'connection refused',
    networkUnreachable: 'network is unreachable'
  },

  // 再試行不可エラー
  nonRetriable: {
    authFailed: 'authentication failed',
    permissionDenied: 'permission denied',
    couldNotRead: 'could not read from remote repository'
  },

  // Git操作エラー
  gitErrors: {
    branchExists: 'fatal: A branch named \'feature/issue-25\' already exists',
    commitFailed: 'fatal: unable to write new index file',
    pushRejected: 'rejected - non-fast-forward',
    pullFailed: 'fatal: unable to access...'
  }
};
```

---

## 5. テスト環境要件

### 5.1. ローカル開発環境

**必要なソフトウェア**:
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- TypeScript 5.x以上

**環境変数**:
```bash
# Git設定
GIT_COMMIT_USER_NAME=Claude AI
GIT_COMMIT_USER_EMAIL=claude@example.com

# GitHub認証（統合テスト用）
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx

# テスト用リポジトリパス
TEST_REPO_PATH=/tmp/test-repo
```

**テストコマンド**:
```bash
# ユニットテスト実行
npm run test:unit

# 統合テスト実行
npm run test:integration

# 全テスト実行
npm test

# カバレッジレポート生成
npm run test:coverage
```

---

### 5.2. CI/CD環境（Jenkins）

**必要な設定**:
- Jenkins Pipeline設定
- Git Plugin
- Node.js Plugin
- GitHub認証設定（GITHUB_TOKEN）

**Jenkinsfile設定**:
```groovy
pipeline {
  agent any

  environment {
    GIT_COMMIT_USER_NAME = 'Claude AI'
    GIT_COMMIT_USER_EMAIL = 'claude@example.com'
    GITHUB_TOKEN = credentials('github-token')
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Unit Tests') {
      steps {
        sh 'npm run test:unit'
      }
    }

    stage('Integration Tests') {
      steps {
        sh 'npm run test:integration'
      }
    }

    stage('Coverage') {
      steps {
        sh 'npm run test:coverage'
      }
    }
  }
}
```

---

### 5.3. モック/スタブの必要性

**ユニットテスト**:
- **モック対象**: simple-git, MetadataManager, SecretMasker
- **モックライブラリ**: Jest（jest.fn(), jest.mock()）
- **モック理由**: 実際のGit操作を行わず、動作を高速化し、予測可能なテストを実現

**統合テスト**:
- **モック不要**: 実際のGitリポジトリで動作検証
- **テスト用リポジトリ**: `/tmp/test-repo` に一時リポジトリを作成
- **クリーンアップ**: テスト完了後、一時リポジトリを削除

---

### 5.4. テストカバレッジ目標

**カバレッジ目標**: 80%以上

**カバレッジ測定**:
- **ツール**: Jest Coverage
- **対象**: src/core/git-manager.ts, src/core/git/*.ts
- **レポート形式**: HTML, LCOV

**カバレッジ確認コマンド**:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## 6. 品質ゲート確認

### Phase 3の品質ゲート

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_INTEGRATION に準拠
  - ユニットテストシナリオ: CommitManager, BranchManager, RemoteManager, GitManager ファサード
  - 統合テストシナリオ: 既存テスト27個 + 既存統合テスト16個 + 新規統合テスト

- [x] **主要な正常系がカバーされている**
  - コミット操作（commitPhaseOutput, commitStepOutput, commitWorkflowInit, commitCleanupLogs）
  - ブランチ操作（createBranch, branchExists, getCurrentBranch, switchBranch）
  - リモート操作（pushToRemote, pullLatest）
  - ファサード委譲（全publicメソッド）

- [x] **主要な異常系がカバーされている**
  - Git操作失敗時のエラーハンドリング
  - 再試行不可エラーの即座失敗
  - 最大リトライ回数到達
  - SecretMasker失敗時の継続動作
  - ブランチ既存時のエラー

- [x] **期待結果が明確である**
  - 全テストケースに具体的な期待結果を記載
  - 戻り値の型と内容を明示
  - エラーメッセージの形式を明示
  - ログ出力の内容を明示

---

## 7. テストシナリオのサマリー

### 7.1. テストケース数

| マネージャー | ユニットテストケース数 | 統合テストケース数 | 合計 |
|-------------|---------------------|------------------|------|
| CommitManager | 15 | - | 15 |
| BranchManager | 9 | - | 9 |
| RemoteManager | 11 | - | 11 |
| GitManager ファサード | 4 | - | 4 |
| 既存テスト（後方互換性） | - | 27 | 27 |
| 既存統合テスト | - | 16 | 16 |
| 新規統合テスト | - | 2 | 2 |
| **合計** | **39** | **45** | **84** |

---

### 7.2. カバレッジ見積もり

| マネージャー | 推定行数 | カバレッジ目標 | 期待カバレッジ |
|-------------|---------|--------------|--------------|
| CommitManager | 200 | 80% | 85% |
| BranchManager | 180 | 80% | 90% |
| RemoteManager | 150 | 80% | 85% |
| GitManager ファサード | 150 | 80% | 95% |
| **合計** | **680** | **80%** | **88%** |

---

### 7.3. テスト実行時間見積もり

| テスト種別 | 推定実行時間 |
|-----------|------------|
| ユニットテスト（39ケース） | 5秒 |
| 既存テスト（27ケース） | 10秒 |
| 既存統合テスト（16ケース） | 30秒 |
| 新規統合テスト（2ケース） | 10秒 |
| **合計** | **55秒** |

---

## 8. 次のステップ

1. **Phase 4: Implementation**
   - CommitManager の実装（1.5~2h）
   - BranchManager の実装（1~1.5h）
   - RemoteManager の実装（1~1.5h）
   - GitManager ファサードの実装（0.5~1h）

2. **Phase 5: Test Code Implementation**
   - CommitManager のユニットテスト作成（1~1.5h）
   - BranchManager のユニットテスト作成（0.5~1h）
   - RemoteManager のユニットテスト作成（0.5~1h）
   - 既存テストの後方互換性確認（1~1.5h）

3. **Phase 6: Testing**
   - ユニットテスト実行（0.5~1h）
   - 統合テスト実行（0.5~1h）
   - カバレッジレポート確認

---

**作成日**: 2025-01-20
**Issue**: #25
**バージョン**: 1.0
**ステータス**: Draft
**テスト戦略**: UNIT_INTEGRATION
**テストケース数**: 84（ユニット39 + 統合45）
**期待カバレッジ**: 88%
