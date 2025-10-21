# テストシナリオ書 - Issue #22

**Issue番号**: #22
**タイトル**: [REFACTOR] CLI コマンド処理の分離 (main.ts リファクタリング)
**作成日**: 2025-01-20
**ステータス**: Test Scenario Phase

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**

Planning Phase（Phase 0）で決定された通り、本リファクタリングでは**ユニットテスト**と**統合テスト**の両方を実施します。

#### 判断根拠（Phase 2から引用）

1. **ユニットテストの必要性**
   - モジュール分割後の各コマンドハンドラは独立してテスト可能
   - 新規ユニットテスト:
     - `tests/unit/commands/init.test.ts` - 初期化ロジックの単体テスト
     - `tests/unit/commands/execute.test.ts` - 実行ロジックの単体テスト
     - `tests/unit/commands/list-presets.test.ts` - プリセット一覧表示の単体テスト
   - 既存ユニットテストの継続利用:
     - `tests/unit/branch-validation.test.ts` - ブランチバリデーション
     - `tests/unit/repository-resolution.test.ts` - リポジトリ解決
     - `tests/unit/main-preset-resolution.test.ts` - プリセット解決

2. **統合テストの必要性**
   - CLI全体の動作検証が必須
   - 既存の統合テスト（18件）を再利用:
     - `tests/integration/workflow-init-cleanup.test.ts` - ワークフロー初期化とクリーンアップ
     - `tests/integration/custom-branch-workflow.test.ts` - カスタムブランチ名のワークフロー
     - `tests/integration/multi-repo-workflow.test.ts` - マルチリポジトリワークフロー
     - `tests/integration/preset-execution.test.ts` - プリセット実行の統合テスト
   - リファクタリング前後で動作が同一であることを保証

3. **BDD不要の理由**
   - エンドユーザー向けの機能追加ではない
   - ユーザーストーリーの追加なし
   - 内部リファクタリングのみ

### 1.2 テスト対象の範囲

#### 新規作成モジュール

1. **src/commands/init.ts** (約250~300行)
   - `handleInitCommand()` - Issue初期化コマンドハンドラ
   - `validateBranchName()` - ブランチ名バリデーション
   - `resolveBranchName()` - ブランチ名解決

2. **src/commands/execute.ts** (約450~500行)
   - `handleExecuteCommand()` - フェーズ実行コマンドハンドラ
   - `executePhasesSequential()` - フェーズ順次実行
   - `executePhasesFrom()` - 特定フェーズから実行
   - `createPhaseInstance()` - フェーズインスタンス作成
   - `resolvePresetName()` - プリセット名解決
   - `getPresetPhases()` - プリセットフェーズ取得
   - `canResumeWorkflow()` - ワークフロー再開可否判定
   - `loadExternalDocuments()` - 外部ドキュメント読み込み
   - `resetMetadata()` - メタデータリセット

3. **src/commands/review.ts** (約50行)
   - `handleReviewCommand()` - フェーズレビューコマンドハンドラ

4. **src/commands/list-presets.ts** (約50~80行)
   - `listPresets()` - プリセット一覧表示

5. **src/core/repository-utils.ts** (約200行)
   - `parseIssueUrl()` - Issue URL解析
   - `resolveLocalRepoPath()` - ローカルリポジトリパス解決
   - `findWorkflowMetadata()` - ワークフローメタデータ探索
   - `getRepoRoot()` - リポジトリルート取得

6. **src/types/commands.ts** (約100行)
   - 型定義（PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult）

#### 変更モジュール

1. **src/main.ts** (1309行 → 200行以下)
   - コマンドルーターとしての役割のみ残す
   - 既存のコマンドハンドラを削除し、新規モジュールからimport

### 1.3 テストの目的

1. **既存動作の完全な維持**
   - リファクタリング前後でCLI動作が完全に一致することを保証
   - 既存のユニットテスト18件 + 統合テスト18件がすべてパス

2. **新規モジュールの品質保証**
   - 各コマンドモジュールが独立して正しく動作することを検証
   - 共有ユーティリティモジュールが期待通りに機能することを検証

3. **破壊的変更の検出**
   - CLIインターフェースの互換性維持を検証
   - エージェントモード（auto/codex/claude）の動作維持を検証
   - メタデータ構造の変更がないことを検証

---

## 2. Unitテストシナリオ

### 2.1 src/core/repository-utils.ts のテスト

#### 2.1.1 parseIssueUrl() のテスト

##### テストケース: parseIssueUrl_正常系_標準URL

- **目的**: 標準的なGitHub Issue URLから正しくリポジトリ情報を抽出できることを検証
- **前提条件**: なし
- **入力**: `https://github.com/tielec/ai-workflow-agent/issues/22`
- **期待結果**:
  ```typescript
  {
    owner: "tielec",
    repo: "ai-workflow-agent",
    issueNumber: 22,
    repositoryName: "tielec/ai-workflow-agent"
  }
  ```
- **テストデータ**: 上記URL

##### テストケース: parseIssueUrl_正常系_HTTPSなしURL

- **目的**: `https://` プロトコルなしのURLでも正しく解析できることを検証
- **前提条件**: なし
- **入力**: `github.com/tielec/ai-workflow-agent/issues/123`
- **期待結果**:
  ```typescript
  {
    owner: "tielec",
    repo: "ai-workflow-agent",
    issueNumber: 123,
    repositoryName: "tielec/ai-workflow-agent"
  }
  ```
- **テストデータ**: 上記URL

##### テストケース: parseIssueUrl_異常系_不正なURL

- **目的**: 不正なURLでエラーがスローされることを検証
- **前提条件**: なし
- **入力**: `https://example.com/invalid`
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid GitHub Issue URL` が含まれる
- **テストデータ**: 上記URL

##### テストケース: parseIssueUrl_異常系_Issue番号なし

- **目的**: Issue番号が含まれないURLでエラーがスローされることを検証
- **前提条件**: なし
- **入力**: `https://github.com/tielec/ai-workflow-agent`
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid GitHub Issue URL` が含まれる
- **テストデータ**: 上記URL

##### テストケース: parseIssueUrl_境界値_Issue番号が1

- **目的**: Issue番号が最小値（1）でも正しく解析できることを検証
- **前提条件**: なし
- **入力**: `https://github.com/tielec/ai-workflow-agent/issues/1`
- **期待結果**:
  ```typescript
  {
    owner: "tielec",
    repo: "ai-workflow-agent",
    issueNumber: 1,
    repositoryName: "tielec/ai-workflow-agent"
  }
  ```
- **テストデータ**: 上記URL

##### テストケース: parseIssueUrl_境界値_Issue番号が大きい

- **目的**: Issue番号が大きい値でも正しく解析できることを検証
- **前提条件**: なし
- **入力**: `https://github.com/tielec/ai-workflow-agent/issues/999999`
- **期待結果**:
  ```typescript
  {
    owner: "tielec",
    repo: "ai-workflow-agent",
    issueNumber: 999999,
    repositoryName: "tielec/ai-workflow-agent"
  }
  ```
- **テストデータ**: 上記URL

#### 2.1.2 resolveLocalRepoPath() のテスト

##### テストケース: resolveLocalRepoPath_正常系_REPOS_ROOT設定あり

- **目的**: `REPOS_ROOT` 環境変数が設定されている場合、正しくリポジトリパスを解決できることを検証
- **前提条件**:
  - `process.env.REPOS_ROOT` が `/path/to/repos` に設定されている
  - `/path/to/repos/my-app/.git` が存在する
- **入力**: `my-app`
- **期待結果**: `/path/to/repos/my-app` が返される
- **テストデータ**: 上記リポジトリ名

##### テストケース: resolveLocalRepoPath_正常系_カレントディレクトリ

- **目的**: `REPOS_ROOT` 環境変数がない場合、カレントディレクトリからリポジトリを解決できることを検証
- **前提条件**:
  - `process.env.REPOS_ROOT` が未設定
  - カレントディレクトリが `/current/my-app` で、`.git` が存在する
- **入力**: `my-app`
- **期待結果**: `/current/my-app` が返される
- **テストデータ**: 上記リポジトリ名

##### テストケース: resolveLocalRepoPath_異常系_リポジトリ不在

- **目的**: リポジトリが見つからない場合、エラーがスローされることを検証
- **前提条件**:
  - `process.env.REPOS_ROOT` が設定されているが、リポジトリディレクトリが存在しない
- **入力**: `non-existent-repo`
- **期待結果**: エラーがスローされ、エラーメッセージに `Repository 'non-existent-repo' not found` が含まれる
- **テストデータ**: 上記リポジトリ名

#### 2.1.3 findWorkflowMetadata() のテスト

##### テストケース: findWorkflowMetadata_正常系_メタデータ存在

- **目的**: Issue番号からメタデータを正しく探索できることを検証
- **前提条件**:
  - `/repo-root/.ai-workflow/issue-22/metadata.json` が存在する
- **入力**: `22`
- **期待結果**:
  ```typescript
  {
    repoRoot: "/repo-root",
    metadataPath: "/repo-root/.ai-workflow/issue-22/metadata.json"
  }
  ```
- **テストデータ**: 上記Issue番号

##### テストケース: findWorkflowMetadata_異常系_メタデータ不在

- **目的**: メタデータが見つからない場合、エラーがスローされることを検証
- **前提条件**:
  - `.ai-workflow/issue-999/metadata.json` が存在しない
- **入力**: `999`
- **期待結果**: エラーがスローされ、エラーメッセージに `Workflow not found` が含まれる
- **テストデータ**: 上記Issue番号

#### 2.1.4 getRepoRoot() のテスト

##### テストケース: getRepoRoot_正常系_Gitリポジトリ内

- **目的**: Gitリポジトリのルートパスを正しく取得できることを検証
- **前提条件**:
  - カレントディレクトリがGitリポジトリ内
- **入力**: なし
- **期待結果**: リポジトリルートパス（絶対パス）が返される
- **テストデータ**: なし

##### テストケース: getRepoRoot_異常系_Gitリポジトリ外

- **目的**: Gitリポジトリ外で実行した場合、エラーがスローされることを検証
- **前提条件**:
  - カレントディレクトリがGitリポジトリ外
- **入力**: なし
- **期待結果**: エラーがスローされる
- **テストデータ**: なし

---

### 2.2 src/commands/init.ts のテスト

#### 2.2.1 validateBranchName() のテスト

##### テストケース: validateBranchName_正常系_有効なブランチ名

- **目的**: 有効なブランチ名がバリデーションを通過することを検証
- **前提条件**: なし
- **入力**: `feature/issue-22`
- **期待結果**:
  ```typescript
  { valid: true }
  ```
- **テストデータ**: 上記ブランチ名

##### テストケース: validateBranchName_正常系_デフォルトブランチ名

- **目的**: デフォルトのブランチ名（ai-workflow/issue-X）がバリデーションを通過することを検証
- **前提条件**: なし
- **入力**: `ai-workflow/issue-123`
- **期待結果**:
  ```typescript
  { valid: true }
  ```
- **テストデータ**: 上記ブランチ名

##### テストケース: validateBranchName_異常系_スペース含む

- **目的**: スペースを含むブランチ名がバリデーションエラーになることを検証
- **前提条件**: なし
- **入力**: `invalid branch`
- **期待結果**:
  ```typescript
  {
    valid: false,
    error: "Branch name contains invalid characters (spaces, ...)"
  }
  ```
- **テストデータ**: 上記ブランチ名

##### テストケース: validateBranchName_異常系_ドット始まり

- **目的**: `.` で始まるブランチ名がバリデーションエラーになることを検証
- **前提条件**: なし
- **入力**: `.invalid`
- **期待結果**:
  ```typescript
  {
    valid: false,
    error: "Branch name cannot start with '.'"
  }
  ```
- **テストデータ**: 上記ブランチ名

##### テストケース: validateBranchName_異常系_特殊文字含む

- **目的**: 特殊文字（`^`, `~`, `:` 等）を含むブランチ名がバリデーションエラーになることを検証
- **前提条件**: なし
- **入力**: `feature^123`
- **期待結果**:
  ```typescript
  {
    valid: false,
    error: "Branch name contains invalid characters (^, ~, :, ...)"
  }
  ```
- **テストデータ**: 上記ブランチ名

##### テストケース: validateBranchName_異常系_スラッシュ終わり

- **目的**: `/` で終わるブランチ名がバリデーションエラーになることを検証
- **前提条件**: なし
- **入力**: `feature/`
- **期待結果**:
  ```typescript
  {
    valid: false,
    error: "Branch name cannot end with '/'"
  }
  ```
- **テストデータ**: 上記ブランチ名

#### 2.2.2 resolveBranchName() のテスト

##### テストケース: resolveBranchName_正常系_カスタムブランチ指定

- **目的**: カスタムブランチ名が指定された場合、そのブランチ名が返されることを検証
- **前提条件**: なし
- **入力**:
  - `customBranch`: `feature/custom-work`
  - `issueNumber`: 22
- **期待結果**: `feature/custom-work` が返される
- **テストデータ**: 上記パラメータ

##### テストケース: resolveBranchName_正常系_カスタムブランチ未指定

- **目的**: カスタムブランチ名が未指定の場合、デフォルトブランチ名が返されることを検証
- **前提条件**: なし
- **入力**:
  - `customBranch`: `undefined`
  - `issueNumber`: 22
- **期待結果**: `ai-workflow/issue-22` が返される
- **テストデータ**: 上記パラメータ

##### テストケース: resolveBranchName_異常系_不正なカスタムブランチ

- **目的**: 不正なカスタムブランチ名が指定された場合、エラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `customBranch`: `invalid branch`
  - `issueNumber`: 22
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid branch name` が含まれる
- **テストデータ**: 上記パラメータ

#### 2.2.3 handleInitCommand() のテスト

##### テストケース: handleInitCommand_正常系_新規Issue初期化

- **目的**: 新規Issueのワークフロー初期化が正常に完了することを検証
- **前提条件**:
  - GitHub Issue URLが有効
  - リポジトリが存在する
  - ブランチが未作成
- **入力**:
  - `issueUrl`: `https://github.com/tielec/ai-workflow-agent/issues/999`
  - `customBranch`: `undefined`
- **期待結果**:
  - メタデータファイル `.ai-workflow/issue-999/metadata.json` が作成される
  - ブランチ `ai-workflow/issue-999` が作成される
  - Draft PRが作成される（GITHUB_TOKENが設定されている場合）
  - エラーがスローされない
- **テストデータ**: 上記パラメータ

##### テストケース: handleInitCommand_正常系_カスタムブランチ名指定

- **目的**: カスタムブランチ名を指定した場合、正しくワークフロー初期化できることを検証
- **前提条件**:
  - GitHub Issue URLが有効
  - リポジトリが存在する
- **入力**:
  - `issueUrl`: `https://github.com/tielec/ai-workflow-agent/issues/999`
  - `customBranch`: `feature/custom-work`
- **期待結果**:
  - メタデータファイル `.ai-workflow/issue-999/metadata.json` が作成される
  - ブランチ `feature/custom-work` が作成される
  - メタデータに `branch_name: "feature/custom-work"` が記録される
- **テストデータ**: 上記パラメータ

##### テストケース: handleInitCommand_異常系_不正なIssue URL

- **目的**: 不正なIssue URLでエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `issueUrl`: `https://example.com/invalid`
  - `customBranch`: `undefined`
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid GitHub Issue URL` が含まれる
- **テストデータ**: 上記パラメータ

##### テストケース: handleInitCommand_異常系_不正なブランチ名

- **目的**: 不正なカスタムブランチ名でエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `issueUrl`: `https://github.com/tielec/ai-workflow-agent/issues/999`
  - `customBranch`: `invalid branch`
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid branch name` が含まれる
- **テストデータ**: 上記パラメータ

---

### 2.3 src/commands/execute.ts のテスト

#### 2.3.1 resolvePresetName() のテスト

##### テストケース: resolvePresetName_正常系_標準プリセット

- **目的**: 標準プリセット名が正しく解決されることを検証
- **前提条件**: なし
- **入力**: `quick-fix`
- **期待結果**:
  ```typescript
  { resolvedName: "quick-fix" }
  ```
- **テストデータ**: 上記プリセット名

##### テストケース: resolvePresetName_正常系_後方互換性_deprecated

- **目的**: 非推奨プリセット名が新しいプリセット名に自動変換され、警告が返されることを検証
- **前提条件**: なし
- **入力**: `requirements-only`（非推奨）
- **期待結果**:
  ```typescript
  {
    resolvedName: "review-requirements",
    warning: "[WARNING] Preset 'requirements-only' is deprecated. Use 'review-requirements' instead."
  }
  ```
- **テストデータ**: 上記プリセット名

##### テストケース: resolvePresetName_正常系_すべてのプリセット

- **目的**: すべての有効なプリセット名が正しく解決されることを検証
- **前提条件**: なし
- **入力**: `full-workflow`, `review-requirements`, `review-design`, `implementation`, `evaluation`, `quick-fix`, `analysis-design`, `full-test`
- **期待結果**: 各プリセット名がそのまま返される（警告なし）
- **テストデータ**: 上記プリセット名リスト

#### 2.3.2 getPresetPhases() のテスト

##### テストケース: getPresetPhases_正常系_quick-fix

- **目的**: `quick-fix` プリセットのフェーズリストが正しく取得できることを検証
- **前提条件**: なし
- **入力**: `quick-fix`
- **期待結果**: `["implementation", "documentation", "report"]`
- **テストデータ**: 上記プリセット名

##### テストケース: getPresetPhases_正常系_full-workflow

- **目的**: `full-workflow` プリセットのフェーズリストが正しく取得できることを検証
- **前提条件**: なし
- **入力**: `full-workflow`
- **期待結果**: `["planning", "requirements", "design", "test_scenario", "implementation", "test_code", "documentation", "report", "evaluation"]`
- **テストデータ**: 上記プリセット名

##### テストケース: getPresetPhases_異常系_不正なプリセット名

- **目的**: 存在しないプリセット名でエラーがスローされることを検証
- **前提条件**: なし
- **入力**: `non-existent-preset`
- **期待結果**: エラーがスローされる、または空配列が返される
- **テストデータ**: 上記プリセット名

#### 2.3.3 canResumeWorkflow() のテスト

##### テストケース: canResumeWorkflow_正常系_レジューム可能

- **目的**: レジューム可能な状態でtrueが返されることを検証
- **前提条件**:
  - ResumeManagerに中断されたフェーズ情報がある
- **入力**: `resumeManager`（モック）
- **期待結果**: `true`
- **テストデータ**: 上記ResumeManager

##### テストケース: canResumeWorkflow_正常系_レジューム不可

- **目的**: レジューム不可能な状態でfalseが返されることを検証
- **前提条件**:
  - ResumeManagerに中断されたフェーズ情報がない
- **入力**: `resumeManager`（モック）
- **期待結果**: `false`
- **テストデータ**: 上記ResumeManager

#### 2.3.4 loadExternalDocuments() のテスト

##### テストケース: loadExternalDocuments_正常系_requirements指定

- **目的**: 外部要件ドキュメントが正しく読み込まれ、メタデータに反映されることを検証
- **前提条件**:
  - `/path/to/requirements.md` ファイルが存在する
- **入力**:
  - `docs`: `{ requirements: "/path/to/requirements.md" }`
  - `metadataManager`: モック
  - `repoRoot`: `/repo-root`
- **期待結果**:
  - ファイルが読み込まれる
  - メタデータに外部ドキュメント情報が保存される
  - エラーがスローされない
- **テストデータ**: 上記パラメータ

##### テストケース: loadExternalDocuments_異常系_ファイル不在

- **目的**: 存在しない外部ドキュメントパスでエラーがスローされることを検証
- **前提条件**:
  - `/path/to/non-existent.md` ファイルが存在しない
- **入力**:
  - `docs`: `{ requirements: "/path/to/non-existent.md" }`
  - `metadataManager`: モック
  - `repoRoot`: `/repo-root`
- **期待結果**: エラーがスローされる
- **テストデータ**: 上記パラメータ

#### 2.3.5 resetMetadata() のテスト

##### テストケース: resetMetadata_正常系_メタデータリセット

- **目的**: メタデータが正しくリセットされ、新しいMetadataManagerインスタンスが返されることを検証
- **前提条件**:
  - メタデータファイルが存在する
- **入力**:
  - `metadataManager`: 既存のMetadataManagerインスタンス
  - `metadataPath`: `/repo-root/.ai-workflow/issue-22/metadata.json`
  - `issueNumber`: `22`
- **期待結果**:
  - メタデータがバックアップされる
  - メタデータが初期状態にリセットされる
  - 新しいMetadataManagerインスタンスが返される
- **テストデータ**: 上記パラメータ

#### 2.3.6 createPhaseInstance() のテスト

##### テストケース: createPhaseInstance_正常系_各フェーズインスタンス作成

- **目的**: 各フェーズ名から正しいフェーズインスタンスが作成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName`: `planning`, `requirements`, `design`, `test_scenario`, `implementation`, `test_code`, `documentation`, `report`, `evaluation`
  - `context`: PhaseContextモック
- **期待結果**: 各フェーズ名に対応するBasePhaseサブクラスのインスタンスが返される
- **テストデータ**: 上記フェーズ名リスト

##### テストケース: createPhaseInstance_異常系_不正なフェーズ名

- **目的**: 不正なフェーズ名でエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName`: `invalid_phase`
  - `context`: PhaseContextモック
- **期待結果**: エラーがスローされる
- **テストデータ**: 上記フェーズ名

#### 2.3.7 executePhasesSequential() のテスト

##### テストケース: executePhasesSequential_正常系_全フェーズ成功

- **目的**: すべてのフェーズが順次実行され、ExecutionSummaryが返されることを検証
- **前提条件**:
  - 各フェーズのモックが成功を返す
- **入力**:
  - `phases`: `["planning", "requirements"]`
  - `context`: PhaseContextモック
  - `gitManager`: GitManagerモック
- **期待結果**:
  ```typescript
  {
    success: true,
    results: {
      planning: { success: true, ... },
      requirements: { success: true, ... }
    }
  }
  ```
- **テストデータ**: 上記パラメータ

##### テストケース: executePhasesSequential_異常系_フェーズ失敗

- **目的**: フェーズが失敗した場合、ExecutionSummaryに失敗情報が含まれることを検証
- **前提条件**:
  - `planning` フェーズが失敗を返す
- **入力**:
  - `phases`: `["planning", "requirements"]`
  - `context`: PhaseContextモック
  - `gitManager`: GitManagerモック
- **期待結果**:
  ```typescript
  {
    success: false,
    failedPhase: "planning",
    error: "Phase execution failed",
    results: {
      planning: { success: false, ... }
    }
  }
  ```
- **テストデータ**: 上記パラメータ

#### 2.3.8 executePhasesFrom() のテスト

##### テストケース: executePhasesFrom_正常系_特定フェーズから実行

- **目的**: 特定フェーズから残りのフェーズが順次実行されることを検証
- **前提条件**: なし
- **入力**:
  - `startPhase`: `requirements`
  - `context`: PhaseContextモック
  - `gitManager`: GitManagerモック
- **期待結果**:
  - `requirements` フェーズから後続のフェーズが実行される
  - ExecutionSummaryが返される
- **テストデータ**: 上記パラメータ

##### テストケース: executePhasesFrom_異常系_不正な開始フェーズ

- **目的**: 不正な開始フェーズ名でエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `startPhase`: `invalid_phase`
  - `context`: PhaseContextモック
  - `gitManager`: GitManagerモック
- **期待結果**: エラーがスローされる
- **テストデータ**: 上記パラメータ

#### 2.3.9 handleExecuteCommand() のテスト

##### テストケース: handleExecuteCommand_正常系_フェーズ指定

- **目的**: フェーズ指定でコマンドが正常に完了することを検証
- **前提条件**:
  - ワークフローが初期化されている
  - メタデータが存在する
- **入力**:
  - `options`: `{ issue: "22", phase: "planning", agent: "auto" }`
- **期待結果**:
  - Planning Phaseが実行される
  - 実行サマリーが表示される
  - エラーがスローされない
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_正常系_プリセット指定

- **目的**: プリセット指定でコマンドが正常に完了することを検証
- **前提条件**:
  - ワークフローが初期化されている
  - メタデータが存在する
- **入力**:
  - `options`: `{ issue: "22", preset: "quick-fix", ignoreDependencies: true }`
- **期待結果**:
  - `quick-fix` プリセットのフェーズ（implementation, documentation, report）が実行される
  - 実行サマリーが表示される
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_正常系_エージェントモード_auto

- **目的**: エージェントモード `auto` で正しくエージェントが選択されることを検証
- **前提条件**:
  - CODEX_API_KEY環境変数が設定されている
- **入力**:
  - `options`: `{ issue: "22", phase: "planning", agent: "auto" }`
- **期待結果**:
  - Codex エージェントが選択される
  - ログに `[INFO] Agent mode: auto (using Codex)` が含まれる
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_正常系_エージェントモード_codex

- **目的**: エージェントモード `codex` でCodexが使用されることを検証
- **前提条件**:
  - CODEX_API_KEY環境変数が設定されている
- **入力**:
  - `options`: `{ issue: "22", phase: "planning", agent: "codex" }`
- **期待結果**:
  - Codex エージェントが使用される
  - ログに `[INFO] Agent mode: codex` が含まれる
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_正常系_エージェントモード_claude

- **目的**: エージェントモード `claude` でClaudeが使用されることを検証
- **前提条件**:
  - Claude認証情報ファイルが存在する
- **入力**:
  - `options`: `{ issue: "22", phase: "planning", agent: "claude" }`
- **期待結果**:
  - Claude エージェントが使用される
  - ログに `[INFO] Agent mode: claude` が含まれる
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_異常系_ワークフロー未初期化

- **目的**: ワークフロー未初期化時にエラーがスローされることを検証
- **前提条件**:
  - メタデータファイルが存在しない
- **入力**:
  - `options`: `{ issue: "888", phase: "planning" }`
- **期待結果**: エラーがスローされ、エラーメッセージに `Workflow not found` が含まれる
- **テストデータ**: 上記オプション

##### テストケース: handleExecuteCommand_異常系_エージェント認証情報なし

- **目的**: エージェント認証情報がない場合にエラーがスローされることを検証
- **前提条件**:
  - CODEX_API_KEY環境変数が未設定
  - Claude認証情報ファイルが存在しない
- **入力**:
  - `options`: `{ issue: "22", phase: "planning", agent: "auto" }`
- **期待結果**: エラーがスローされ、エラーメッセージに `Agent mode "auto" requires a valid agent configuration` が含まれる
- **テストデータ**: 上記オプション

---

### 2.4 src/commands/review.ts のテスト

#### 2.4.1 handleReviewCommand() のテスト

##### テストケース: handleReviewCommand_正常系_フェーズ完了

- **目的**: 完了したフェーズのステータスが正しく表示されることを検証
- **前提条件**:
  - Planning Phaseが完了している
- **入力**:
  - `options`: `{ phase: "planning", issue: "22" }`
- **期待結果**:
  - ログに `[OK] Phase planning status: completed` が含まれる
  - エラーがスローされない
- **テストデータ**: 上記オプション

##### テストケース: handleReviewCommand_正常系_フェーズ未完了

- **目的**: 未完了フェーズのステータスが正しく表示されることを検証
- **前提条件**:
  - Requirements Phaseが未完了
- **入力**:
  - `options`: `{ phase: "requirements", issue: "22" }`
- **期待結果**:
  - ログに `[OK] Phase requirements status: pending` が含まれる
  - エラーがスローされない
- **テストデータ**: 上記オプション

##### テストケース: handleReviewCommand_異常系_不正なフェーズ名

- **目的**: 不正なフェーズ名でエラーがスローされることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ phase: "invalid_phase", issue: "22" }`
- **期待結果**: エラーがスローされ、エラーメッセージに `Invalid phase name` が含まれる
- **テストデータ**: 上記オプション

---

### 2.5 src/commands/list-presets.ts のテスト

#### 2.5.1 listPresets() のテスト

##### テストケース: listPresets_正常系_プリセット一覧表示

- **目的**: 利用可能なプリセット一覧が正しく表示されることを検証
- **前提条件**: なし
- **入力**: なし
- **期待結果**:
  - コンソールに以下のプリセットが表示される:
    - `full-workflow`
    - `review-requirements`
    - `review-design`
    - `implementation`
    - `evaluation`
    - `quick-fix`
    - `analysis-design`
    - `full-test`
  - 非推奨プリセット一覧も表示される
  - `process.exit(0)` が呼ばれる
- **テストデータ**: なし

##### テストケース: listPresets_正常系_非推奨プリセット表示

- **目的**: 非推奨プリセット一覧が正しく表示されることを検証
- **前提条件**: なし
- **入力**: なし
- **期待結果**:
  - コンソールに以下の非推奨プリセットが表示される:
    - `requirements-only` → `review-requirements`
    - `design-phase` → `review-design`
    - `analysis` → `analysis-design`
  - `process.exit(0)` が呼ばれる
- **テストデータ**: なし

---

### 2.6 src/main.ts のテスト

#### 2.6.1 isValidPhaseName() のテスト

##### テストケース: isValidPhaseName_正常系_有効なフェーズ名

- **目的**: 有効なフェーズ名でtrueが返されることを検証
- **前提条件**: なし
- **入力**: `planning`, `requirements`, `design`, `test_scenario`, `implementation`, `test_code`, `documentation`, `report`, `evaluation`
- **期待結果**: すべてのフェーズ名で `true` が返される
- **テストデータ**: 上記フェーズ名リスト

##### テストケース: isValidPhaseName_異常系_不正なフェーズ名

- **目的**: 不正なフェーズ名でfalseが返されることを検証
- **前提条件**: なし
- **入力**: `invalid_phase`
- **期待結果**: `false` が返される
- **テストデータ**: 上記フェーズ名

#### 2.6.2 reportFatalError() のテスト

##### テストケース: reportFatalError_正常系_エラー表示

- **目的**: エラーメッセージが正しく表示され、process.exit(1)が呼ばれることを検証
- **前提条件**: なし
- **入力**: `new Error("Test error")`
- **期待結果**:
  - コンソールに `[ERROR] Test error` が表示される
  - `process.exit(1)` が呼ばれる
- **テストデータ**: 上記エラー

#### 2.6.3 reportExecutionSummary() のテスト

##### テストケース: reportExecutionSummary_正常系_全フェーズ成功

- **目的**: 全フェーズ成功時に成功メッセージが表示されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    success: true,
    results: {
      planning: { success: true },
      requirements: { success: true }
    }
  }
  ```
- **期待結果**:
  - コンソールに `[OK] All phases completed successfully.` が表示される
- **テストデータ**: 上記ExecutionSummary

##### テストケース: reportExecutionSummary_異常系_フェーズ失敗

- **目的**: フェーズ失敗時にエラーメッセージが表示されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    success: false,
    failedPhase: "planning",
    error: "Phase execution failed",
    results: {
      planning: { success: false }
    }
  }
  ```
- **期待結果**:
  - コンソールに `[ERROR] Phase planning failed: Phase execution failed` が表示される
- **テストデータ**: 上記ExecutionSummary

---

## 3. Integrationテストシナリオ

### 3.1 CLI全体の統合テスト

#### 3.1.1 新規Issueのワークフロー初期化 → フェーズ実行

**シナリオ名**: ワークフロー初期化からフェーズ実行までの統合テスト

- **目的**: init → execute → review の一連の流れが正常に動作することを検証
- **前提条件**:
  - GitHub Issue #999 が存在する
  - ブランチが未作成
  - GITHUB_TOKEN環境変数が設定されている
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` を実行
  2. `node dist/index.js execute --issue 999 --phase planning --agent auto` を実行
  3. `node dist/index.js review --phase planning --issue 999` を実行
- **期待結果**:
  - ステップ1: メタデータ作成、ブランチ作成、Draft PR作成が成功
  - ステップ2: Planning Phase完了、`planning.md` 生成
  - ステップ3: `[OK] Phase planning status: completed` が表示される
- **確認項目**:
  - [ ] `.ai-workflow/issue-999/metadata.json` が作成されている
  - [ ] ブランチ `ai-workflow/issue-999` が作成されている
  - [ ] `.ai-workflow/issue-999/00_planning/output/planning.md` が生成されている
  - [ ] メタデータにPlanning Phaseのステータスが `completed` で記録されている

#### 3.1.2 プリセット実行の統合テスト

**シナリオ名**: プリセット指定によるフェーズ実行

- **目的**: プリセット指定で複数フェーズが順次実行されることを検証
- **前提条件**:
  - Issue #999 が初期化されている
- **テスト手順**:
  1. `node dist/index.js list-presets` を実行
  2. `node dist/index.js execute --issue 999 --preset quick-fix --ignore-dependencies --agent auto` を実行
- **期待結果**:
  - ステップ1: プリセット一覧が表示される
  - ステップ2: implementation → documentation → report が順次実行される
- **確認項目**:
  - [ ] `.ai-workflow/issue-999/04_implementation/output/` に成果物が生成される
  - [ ] `.ai-workflow/issue-999/06_documentation/output/` に成果物が生成される
  - [ ] `.ai-workflow/issue-999/07_report/output/report.md` が生成される
  - [ ] メタデータに各フェーズのステータスが `completed` で記録されている

#### 3.1.3 エージェントモードの統合テスト

**シナリオ名**: エージェントモード（auto/codex/claude）の動作検証

- **目的**: 各エージェントモードで正しくエージェントが選択・実行されることを検証
- **前提条件**:
  - Issue #999 が初期化されている
  - CODEX_API_KEY環境変数が設定されている
  - Claude認証情報ファイルが存在する
- **テスト手順**:
  1. `node dist/index.js execute --issue 999 --phase planning --agent auto` を実行
  2. `node dist/index.js execute --issue 999 --phase requirements --agent codex` を実行
  3. `node dist/index.js execute --issue 999 --phase design --agent claude` を実行
- **期待結果**:
  - ステップ1: Codexエージェントが自動選択され、Planning Phase完了
  - ステップ2: Codexエージェントが使用され、Requirements Phase完了
  - ステップ3: Claudeエージェントが使用され、Design Phase完了
- **確認項目**:
  - [ ] ステップ1のログに `[INFO] Agent mode: auto (using Codex)` が含まれる
  - [ ] ステップ2のログに `[INFO] Agent mode: codex` が含まれる
  - [ ] ステップ3のログに `[INFO] Agent mode: claude` が含まれる
  - [ ] 各フェーズが正常に完了している

---

### 3.2 異常系の統合テスト

#### 3.2.1 ワークフロー未初期化時のexecute

**シナリオ名**: ワークフロー未初期化時のexecuteコマンドエラー検証

- **目的**: ワークフロー未初期化時に適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - Issue #888 のメタデータが存在しない
- **テスト手順**:
  1. `node dist/index.js execute --issue 888 --phase planning --agent auto` を実行
- **期待結果**:
  - エラーメッセージ `Error: Workflow not found. Run init first.` が表示される
  - 終了コード 1 で終了する
- **確認項目**:
  - [ ] エラーメッセージが正しく表示される
  - [ ] process.exit(1) が呼ばれる

#### 3.2.2 不正なIssue URLでのinit

**シナリオ名**: 不正なIssue URLでのinitコマンドエラー検証

- **目的**: 不正なIssue URLで適切なエラーメッセージが表示されることを検証
- **前提条件**: なし
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://example.com/invalid` を実行
- **期待結果**:
  - エラーメッセージ `[ERROR] Invalid GitHub Issue URL: ...` が表示される
  - 終了コード 1 で終了する
- **確認項目**:
  - [ ] エラーメッセージが正しく表示される
  - [ ] process.exit(1) が呼ばれる

#### 3.2.3 不正なブランチ名でのinit

**シナリオ名**: 不正なカスタムブランチ名でのinitコマンドエラー検証

- **目的**: 不正なブランチ名で適切なエラーメッセージが表示されることを検証
- **前提条件**: なし
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 --branch "invalid branch"` を実行
- **期待結果**:
  - エラーメッセージ `[ERROR] Invalid branch name: ... Branch name contains invalid characters (spaces, ...)` が表示される
  - 終了コード 1 で終了する
- **確認項目**:
  - [ ] エラーメッセージが正しく表示される
  - [ ] process.exit(1) が呼ばれる

#### 3.2.4 エージェント認証情報なしでのexecute

**シナリオ名**: エージェント認証情報なしでのexecuteコマンドエラー検証

- **目的**: エージェント認証情報がない場合に適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - Issue #999 が初期化されている
  - CODEX_API_KEY環境変数が未設定
  - Claude認証情報ファイルが存在しない
- **テスト手順**:
  1. `node dist/index.js execute --issue 999 --phase planning --agent auto` を実行
- **期待結果**:
  - エラーメッセージ `[ERROR] Agent mode "auto" requires a valid agent configuration, but neither Codex API key nor Claude Code credentials are available.` が表示される
  - 終了コード 1 で終了する
- **確認項目**:
  - [ ] エラーメッセージが正しく表示される
  - [ ] process.exit(1) が呼ばれる

---

### 3.3 エッジケースの統合テスト

#### 3.3.1 マルチリポジトリワークフロー

**シナリオ名**: 複数リポジトリでの同時ワークフロー実行

- **目的**: `REPOS_ROOT` 環境変数設定時に、別リポジトリでワークフローが正しく実行されることを検証
- **前提条件**:
  - `REPOS_ROOT` 環境変数が設定されている
  - 別リポジトリ `my-app` が存在する
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/tielec/my-app/issues/100` を実行
  2. `node dist/index.js execute --issue 100 --phase planning --agent auto` を実行
- **期待結果**:
  - ステップ1: `my-app` リポジトリにメタデータ作成、ブランチ作成
  - ステップ2: Planning Phaseが `my-app` リポジトリで実行される
- **確認項目**:
  - [ ] `my-app/.ai-workflow/issue-100/metadata.json` が作成されている
  - [ ] `my-app` リポジトリでブランチ `ai-workflow/issue-100` が作成されている
  - [ ] `my-app/.ai-workflow/issue-100/00_planning/output/planning.md` が生成されている

#### 3.3.2 カスタムブランチ名での初期化

**シナリオ名**: カスタムブランチ名を指定したワークフロー初期化

- **目的**: カスタムブランチ名が正しくメタデータに記録され、ワークフローが実行されることを検証
- **前提条件**:
  - Issue #999 が存在する
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 --branch feature/custom-work` を実行
  2. `node dist/index.js execute --issue 999 --phase planning --agent auto` を実行
- **期待結果**:
  - ステップ1: ブランチ `feature/custom-work` 作成、メタデータに `branch_name: "feature/custom-work"` 記録
  - ステップ2: `feature/custom-work` ブランチで Planning Phase実行
- **確認項目**:
  - [ ] ブランチ `feature/custom-work` が作成されている
  - [ ] メタデータに `branch_name: "feature/custom-work"` が記録されている
  - [ ] Git履歴に `feature/custom-work` ブランチでのコミットが存在する

#### 3.3.3 非推奨プリセット名の自動変換

**シナリオ名**: 非推奨プリセット名が自動変換されて実行される

- **目的**: 非推奨プリセット名が新しいプリセット名に自動変換され、警告が表示されることを検証
- **前提条件**:
  - Issue #999 が初期化されている
- **テスト手順**:
  1. `node dist/index.js execute --issue 999 --preset requirements-only --ignore-dependencies --agent auto` を実行
- **期待結果**:
  - 警告メッセージ `[WARNING] Preset 'requirements-only' is deprecated. Use 'review-requirements' instead.` が表示される
  - `review-requirements` プリセットのフェーズ（requirements）が実行される
- **確認項目**:
  - [ ] 警告メッセージが正しく表示される
  - [ ] Requirements Phaseが実行される
  - [ ] メタデータにRequirements Phaseのステータスが `completed` で記録されている

---

### 3.4 リファクタリング前後の互換性テスト

#### 3.4.1 CLIインターフェース互換性検証

**シナリオ名**: リファクタリング前後でCLI動作が同一であることを検証

- **目的**: リファクタリング前後でCLIコマンドの出力結果が完全に一致することを検証
- **前提条件**:
  - リファクタリング前のCLIビルドが存在する（`dist-before/`）
  - リファクタリング後のCLIビルドが存在する（`dist-after/`）
- **テスト手順**:
  1. リファクタリング前: `node dist-before/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` を実行し、出力を記録
  2. リファクタリング後: `node dist-after/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` を実行し、出力を記録
  3. 出力を比較
- **期待結果**:
  - ステップ1とステップ2の出力が完全に一致する
  - 生成されるファイル（メタデータ、PR本文等）が完全に一致する
- **確認項目**:
  - [ ] ログメッセージが完全に一致する
  - [ ] メタデータファイルの内容が完全に一致する
  - [ ] Git操作（ブランチ作成、コミット）が完全に一致する

#### 3.4.2 既存ユニットテストの互換性検証

**シナリオ名**: 既存ユニットテスト（18件）がすべてパスすることを検証

- **目的**: リファクタリング後も既存ユニットテストがすべて成功することを検証
- **前提条件**:
  - 既存ユニットテストのimport文が修正されている
- **テスト手順**:
  1. `npm run test:unit` を実行
- **期待結果**:
  - 既存ユニットテスト18件 + 新規ユニットテスト3件 = 合計21件がすべて成功
  - テスト失敗が0件
- **確認項目**:
  - [ ] `tests/unit/main-preset-resolution.test.ts` が成功
  - [ ] `tests/unit/branch-validation.test.ts` が成功
  - [ ] `tests/unit/repository-resolution.test.ts` が成功
  - [ ] その他既存ユニットテストがすべて成功
  - [ ] 新規ユニットテスト（init.test.ts, execute.test.ts, list-presets.test.ts）が成功

#### 3.4.3 既存統合テストの互換性検証

**シナリオ名**: 既存統合テスト（18件）がすべてパスすることを検証

- **目的**: リファクタリング後も既存統合テストがすべて成功することを検証
- **前提条件**:
  - 既存統合テストのimport文が修正されている（必要に応じて）
- **テスト手順**:
  1. `npm run test:integration` を実行
- **期待結果**:
  - 既存統合テスト18件がすべて成功
  - テスト失敗が0件
- **確認項目**:
  - [ ] `tests/integration/workflow-init-cleanup.test.ts` が成功
  - [ ] `tests/integration/custom-branch-workflow.test.ts` が成功
  - [ ] `tests/integration/multi-repo-workflow.test.ts` が成功
  - [ ] `tests/integration/preset-execution.test.ts` が成功
  - [ ] その他既存統合テストがすべて成功

---

## 4. テストデータ

### 4.1 正常データ

#### GitHub Issue URL（正常系）

```
https://github.com/tielec/ai-workflow-agent/issues/22
https://github.com/tielec/ai-workflow-agent/issues/999
https://github.com/tielec/my-app/issues/100
github.com/tielec/ai-workflow-agent/issues/123
```

#### ブランチ名（正常系）

```
feature/issue-22
ai-workflow/issue-999
bugfix/fix-parser
hotfix/critical-bug
release/v1.0.0
```

#### プリセット名（正常系）

```
full-workflow
review-requirements
review-design
implementation
evaluation
quick-fix
analysis-design
full-test
```

#### フェーズ名（正常系）

```
planning
requirements
design
test_scenario
implementation
test_code
documentation
report
evaluation
```

#### エージェントモード（正常系）

```
auto
codex
claude
```

### 4.2 異常データ

#### GitHub Issue URL（異常系）

```
https://example.com/invalid
https://github.com/tielec/ai-workflow-agent
https://github.com/invalid
not-a-url
```

#### ブランチ名（異常系）

```
invalid branch       (スペース含む)
.invalid             (ドット始まり)
feature^123          (特殊文字含む)
feature/             (スラッシュ終わり)
feature..test        (連続ドット)
feature~test         (チルダ含む)
feature:test         (コロン含む)
```

#### プリセット名（異常系）

```
non-existent-preset
invalid_preset
```

#### フェーズ名（異常系）

```
invalid_phase
non_existent_phase
```

#### エージェントモード（異常系）

```
invalid_agent
```

### 4.3 境界値データ

#### Issue番号（境界値）

```
1                    (最小値)
999999               (大きい値)
```

#### ブランチ名（境界値）

```
a                    (1文字)
feature/very-long-branch-name-that-exceeds-typical-length-limits-but-is-still-valid  (長いブランチ名)
```

---

## 5. テスト環境要件

### 5.1 ローカル開発環境

#### 必須ソフトウェア

- **Node.js**: 20以上
- **npm**: 10以上
- **Git**: 2.x以上
- **TypeScript**: 5.x（package.jsonで定義）

#### 環境変数

- `GITHUB_TOKEN`: GitHub API認証トークン（PR作成テスト用）
- `CODEX_API_KEY` または `OPENAI_API_KEY`: Codexエージェント認証（オプション）
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude認証情報ファイルパス（オプション）
- `REPOS_ROOT`: マルチリポジトリテスト用のルートディレクトリ（オプション）

### 5.2 CI/CD環境

#### Jenkins

- **Node.js**: 20以上
- **Git**: 2.x以上
- **環境変数**: 上記ローカル環境と同じ
- **テスト実行コマンド**:
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test:coverage`

### 5.3 外部サービス

#### GitHub API

- **用途**: Issue情報取得、PR作成
- **認証**: `GITHUB_TOKEN` 環境変数
- **モック**: ユニットテストではモック使用、統合テストでは実際のAPI使用

#### Codex API

- **用途**: エージェント実行
- **認証**: `CODEX_API_KEY` または `OPENAI_API_KEY` 環境変数
- **モック**: ユニットテストではモック使用、統合テストでは実際のAPI使用

#### Claude Code SDK

- **用途**: エージェント実行
- **認証**: `CLAUDE_CODE_CREDENTIALS_PATH` 環境変数
- **モック**: ユニットテストではモック使用、統合テストでは実際のAPI使用

### 5.4 モック/スタブの必要性

#### ユニットテストでのモック

1. **GitManager**: Git操作（checkout, pull, push等）をモック
2. **GitHubClient**: GitHub API（PR作成、Issue取得等）をモック
3. **CodexAgentClient**: Codex API実行をモック
4. **ClaudeAgentClient**: Claude API実行をモック
5. **MetadataManager**: メタデータ読み書きをモック
6. **fs-extra**: ファイルシステム操作をモック

#### 統合テストでのモック

- 基本的にモックを使用しない（実際のファイルシステム、Git操作を使用）
- 外部API（GitHub, Codex, Claude）は環境変数が未設定の場合のみモック使用

### 5.5 テストデータベース

- **不要**: 本プロジェクトはデータベースを使用しない

---

## 6. テスト実行順序

### 6.1 推奨実行順序

1. **Unitテスト（モジュール単位）**
   - `tests/unit/core/repository-utils.test.ts`
   - `tests/unit/commands/init.test.ts`
   - `tests/unit/commands/execute.test.ts`
   - `tests/unit/commands/review.test.ts`
   - `tests/unit/commands/list-presets.test.ts`
   - `tests/unit/main.test.ts`（既存関数のテスト）

2. **既存Unitテストの互換性検証**
   - `tests/unit/main-preset-resolution.test.ts`
   - `tests/unit/branch-validation.test.ts`
   - `tests/unit/repository-resolution.test.ts`

3. **Integrationテスト（正常系）**
   - `tests/integration/workflow-init-execute-review.test.ts`（新規）
   - `tests/integration/preset-execution.test.ts`（既存）
   - `tests/integration/agent-mode.test.ts`（新規）

4. **Integrationテスト（異常系）**
   - `tests/integration/error-handling.test.ts`（新規）

5. **Integrationテスト（エッジケース）**
   - `tests/integration/multi-repo-workflow.test.ts`（既存）
   - `tests/integration/custom-branch-workflow.test.ts`（既存）
   - `tests/integration/deprecated-preset.test.ts`（新規）

6. **既存Integrationテストの互換性検証**
   - `tests/integration/workflow-init-cleanup.test.ts`（既存）
   - その他既存統合テスト（18件）

### 6.2 テスト実行コマンド

```bash
# すべてのユニットテスト実行
npm run test:unit

# すべての統合テスト実行
npm run test:integration

# カバレッジ計測付きテスト実行
npm run test:coverage

# 特定テストファイルのみ実行
npm test -- tests/unit/commands/init.test.ts
```

---

## 7. 品質ゲート（Phase 3）

本テストシナリオは以下の品質ゲートを満たしています：

### 7.1 Phase 2の戦略に沿ったテストシナリオである

- ✅ **UNIT_INTEGRATION戦略に準拠**
  - ユニットテストシナリオ: セクション2で詳細に定義（6モジュール、35テストケース以上）
  - 統合テストシナリオ: セクション3で詳細に定義（4カテゴリ、12シナリオ以上）
  - BDDシナリオ: 不要（Phase 2の戦略通り）

### 7.2 主要な正常系がカバーされている

- ✅ **正常系の網羅的カバー**
  - **init コマンド**: 標準的なIssue初期化、カスタムブランチ名指定（セクション2.2.3）
  - **execute コマンド**: フェーズ指定、プリセット指定、エージェントモード選択（セクション2.3.9）
  - **review コマンド**: フェーズステータス表示（セクション2.4.1）
  - **list-presets コマンド**: プリセット一覧表示（セクション2.5.1）
  - **統合テスト**: ワークフロー全体の正常フロー（セクション3.1）

### 7.3 主要な異常系がカバーされている

- ✅ **異常系の網羅的カバー**
  - **不正なIssue URL**: セクション2.1.1、セクション3.2.2
  - **不正なブランチ名**: セクション2.2.1、セクション3.2.3
  - **ワークフロー未初期化**: セクション2.3.9、セクション3.2.1
  - **エージェント認証情報なし**: セクション2.3.9、セクション3.2.4
  - **不正なフェーズ名/プリセット名**: セクション2.3.1、セクション2.3.2、セクション2.4.1

### 7.4 期待結果が明確である

- ✅ **すべてのテストケースで期待結果を明記**
  - Unitテスト: 各テストケースに「期待結果」セクションがあり、具体的な出力値・状態変化を記載
  - Integrationテスト: 各シナリオに「期待結果」と「確認項目」チェックリストを記載
  - 異常系テスト: エラーメッセージの具体的な内容を記載

---

## 8. 補足情報

### 8.1 テストカバレッジ目標

- **行カバレッジ**: 80%以上
- **分岐カバレッジ**: 70%以上
- **関数カバレッジ**: 90%以上

### 8.2 テスト自動化

- **CI/CD統合**: Jenkins パイプラインでテスト自動実行
- **プルリクエスト時の自動テスト**: PR作成時にすべてのテストを自動実行
- **カバレッジレポート**: テスト実行後に自動生成

### 8.3 テスト実行時間の目安

- **ユニットテスト**: 5~10秒（全21件）
- **統合テスト**: 2~3分（全18件 + 新規数件）
- **合計**: 3~4分

### 8.4 テストメンテナンス方針

1. **新規コマンド追加時**: 対応するユニットテストと統合テストを追加
2. **機能変更時**: 関連するテストケースを更新
3. **バグ修正時**: バグを再現するテストケースを追加後、修正
4. **リグレッションテスト**: 既存テストがすべてパスすることを常に確認

---

**テストシナリオバージョン**: 1.0
**作成日**: 2025-01-20
**作成者**: AI Workflow Agent
**レビュー状態**: Pending Review
