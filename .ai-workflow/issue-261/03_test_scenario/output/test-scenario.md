# テストシナリオ - Issue #261: feat(cli): Add finalize command for workflow completion

**作成日**: 2025-01-30
**Issue番号**: #261
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/261

---

## 目次

1. [テスト戦略サマリー](#1-テスト戦略サマリー)
2. [Unitテストシナリオ](#2-unitテストシナリオ)
3. [Integrationテストシナリオ](#3-integrationテストシナリオ)
4. [テストデータ](#4-テストデータ)
5. [テスト環境要件](#5-テスト環境要件)
6. [品質ゲートチェックリスト](#6-品質ゲートチェックリスト)

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**テスト戦略**: **UNIT_INTEGRATION**

（Phase 2 - 設計書より引用）

### 1.2 テスト対象の範囲

| テスト種別 | 対象範囲 |
|-----------|---------|
| **Unitテスト** | - `handleFinalizeCommand()` の各ステップロジック<br>- `PullRequestClient.markPRReady()` の新規メソッド<br>- `PullRequestClient.updateBaseBranch()` の新規メソッド<br>- `SquashManager.squashCommitsForFinalize()` の新規オーバーロード<br>- CLIオプションの挙動検証<br>- エラーハンドリングの検証 |
| **Integrationテスト** | - 5ステップ全体の統合フロー<br>- `MetadataManager`, `ArtifactCleaner`, `SquashManager`, `PullRequestClient` の統合動作<br>- Git操作とGitHub API呼び出しの統合<br>- エンドツーエンドのワークフロー検証 |

### 1.3 テストの目的

1. **正確性の保証**: finalize コマンドが要件定義通りに動作することを検証
2. **信頼性の確保**: エラーハンドリングが適切に機能することを検証
3. **統合動作の検証**: 既存モジュールとの統合が正常に動作することを検証
4. **リグレッション防止**: 既存の cleanup / execute コマンドへの影響がないことを確認

---

## 2. Unitテストシナリオ

### 2.1 `handleFinalizeCommand()` - メイン関数

#### UC-01: finalize_正常系_全ステップ実行

- **目的**: 全5ステップが順次実行されることを検証
- **前提条件**:
  - metadata.json に base_commit が記録されている
  - .ai-workflow/issue-123/ ディレクトリが存在する
  - PR が存在する（Draft状態）
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - Step 1-5 が順次実行される
  - 各ステップの成功ログが出力される
  - 最終的に "✅ Finalize completed successfully." が出力される
  - exit code 0 で終了する
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-02: finalize_異常系_base_commit不在

- **目的**: base_commit が存在しない場合にエラーが発生することを検証
- **前提条件**: metadata.json に base_commit が存在しない
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - Step 1 でエラーが発生する
  - エラーメッセージ: "base_commit not found in metadata. Please ensure the workflow was initialized with the 'init' command."
  - 処理が中断される
  - exit code 1 で終了する
- **テストデータ**: テストデータセット TD-02（後述）

---

#### UC-03: finalize_異常系_PR番号取得失敗

- **目的**: PR が存在しない場合にエラーが発生することを検証
- **前提条件**:
  - metadata.json に base_commit が記録されている
  - PR が存在しない
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - Step 4 でエラーが発生する
  - エラーメッセージ: "Pull request not found for issue #123"
  - 処理が中断される
  - exit code 1 で終了する
- **テストデータ**: テストデータセット TD-03（後述）

---

### 2.2 CLIオプションの挙動検証

#### UC-04: dryRun_オプション_プレビュー表示

- **目的**: --dry-run オプションでプレビューモードが動作することを検証
- **前提条件**: metadata.json に base_commit が記録されている
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: true,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - プレビューログが出力される:
    - "[DRY RUN] Finalize preview:"
    - "Steps to be executed:"
    - "1. Retrieve base_commit from metadata"
    - "2. Clean up workflow artifacts"
    - "3. Squash commits from base_commit to HEAD"
    - "4. Update PR body with final content"
    - "5. Change PR base branch to 'main'"
    - "6. Mark PR as ready for review"
  - 実際の削除・コミット・プッシュ・PR更新は実行されない
  - exit code 0 で終了する
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-05: skipSquash_オプション_Step3スキップ

- **目的**: --skip-squash オプションで Step 3 がスキップされることを検証
- **前提条件**: metadata.json に base_commit が記録されている
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: true,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - Step 1-2 が実行される
  - Step 3 がスキップされる
  - ログ: "Skipping commit squash (--skip-squash option)"
  - Step 4-5 が実行される
  - exit code 0 で終了する
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-06: skipPrUpdate_オプション_Step4_5スキップ

- **目的**: --skip-pr-update オプションで Step 4-5 がスキップされることを検証
- **前提条件**: metadata.json に base_commit が記録されている
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: true,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - Step 1-3 が実行される
  - Step 4-5 がスキップされる
  - ログ: "Skipping PR update and draft conversion (--skip-pr-update option)"
  - exit code 0 で終了する
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-07: baseBranch_オプション_develop指定

- **目的**: --base-branch オプションでマージ先ブランチが変更されることを検証
- **前提条件**:
  - metadata.json に base_commit が記録されている
  - PR が存在する
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "develop"
  }
  ```
- **期待結果**:
  - Step 4 で `updateBaseBranch("develop")` が呼び出される
  - ログ: "✅ PR #456 base branch changed to 'develop'."
  - exit code 0 で終了する
- **テストデータ**: テストデータセット TD-01（後述）

---

### 2.3 `validateFinalizeOptions()` - バリデーション

#### UC-08: validation_異常系_issue番号なし

- **目的**: --issue オプションが指定されていない場合にエラーが発生することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    issue: "",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - エラーメッセージ: "Error: --issue option is required"
  - exit code 1 で終了する
- **テストデータ**: なし

---

#### UC-09: validation_異常系_issue番号が不正

- **目的**: --issue に不正な値が指定された場合にエラーが発生することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    issue: "abc",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - エラーメッセージ: "Error: Invalid issue number: abc. Must be a positive integer."
  - exit code 1 で終了する
- **テストデータ**: なし

---

#### UC-10: validation_異常系_baseBranchが空文字

- **目的**: --base-branch に空文字が指定された場合にエラーが発生することを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: false,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: ""
  }
  ```
- **期待結果**:
  - エラーメッセージ: "Error: --base-branch cannot be empty"
  - exit code 1 で終了する
- **テストデータ**: なし

---

### 2.4 `executeStep1()` - base_commit取得

#### UC-11: step1_正常系_base_commit取得成功

- **目的**: base_commit が正常に取得されることを検証
- **前提条件**: metadata.json に base_commit が "abc123def456" として記録されている
- **入力**: MetadataManager のモックインスタンス
- **期待結果**:
  - `metadataManager.getBaseCommit()` が呼び出される
  - "abc123def456" が返される
  - ログ: "base_commit: abc123def456"
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-12: step1_異常系_base_commit不在

- **目的**: base_commit が存在しない場合にエラーが発生することを検証
- **前提条件**: metadata.json に base_commit が存在しない
- **入力**: MetadataManager のモックインスタンス（getBaseCommit() が null を返す）
- **期待結果**:
  - エラーがスローされる
  - エラーメッセージ: "base_commit not found in metadata. Please ensure the workflow was initialized with the 'init' command."
- **テストデータ**: テストデータセット TD-02（後述）

---

### 2.5 `executeStep2()` - ディレクトリ削除

#### UC-13: step2_正常系_ディレクトリ削除成功

- **目的**: ワークフローディレクトリが削除され、コミット・プッシュされることを検証
- **前提条件**:
  - .ai-workflow/issue-123/ ディレクトリが存在する
  - Git リポジトリが初期化されている
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - workflowDir: "/path/to/repo"
  - options: { issue: "123", ... }
- **期待結果**:
  - `artifactCleaner.cleanupWorkflowArtifacts(true)` が呼び出される
  - `gitManager.commitCleanupLogs(123, 'finalize')` が呼び出される
  - `gitManager.pushToRemote()` が呼び出される
  - ログ: "Cleanup committed: <commit_hash>"
  - ログ: "✅ Step 2 completed: Workflow artifacts cleaned up."
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-14: step2_異常系_コミット失敗

- **目的**: コミット失敗時にエラーが発生することを検証
- **前提条件**: Git コミットが失敗する状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - workflowDir: "/path/to/repo"
  - options: { issue: "123", ... }
- **期待結果**:
  - `gitManager.commitCleanupLogs()` が失敗を返す
  - エラーがスローされる
  - エラーメッセージ: "Commit failed"
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-15: step2_異常系_プッシュ失敗

- **目的**: プッシュ失敗時にエラーが発生することを検証
- **前提条件**: Git プッシュが失敗する状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - workflowDir: "/path/to/repo"
  - options: { issue: "123", ... }
- **期待結果**:
  - `gitManager.pushToRemote()` が失敗を返す
  - エラーがスローされる
  - エラーメッセージ: "Push failed"
- **テストデータ**: テストデータセット TD-01（後述）

---

### 2.6 `executeStep3()` - コミットスカッシュ

#### UC-16: step3_正常系_スカッシュ成功

- **目的**: コミットスカッシュが正常に実行されることを検証
- **前提条件**:
  - base_commit から HEAD までに複数のコミットが存在する
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - workflowDir: "/path/to/repo"
  - baseCommit: "abc123def456"
  - options: { issue: "123", ... }
- **期待結果**:
  - `squashManager.squashCommitsForFinalize()` が呼び出される
  - FinalizeContext が以下の内容で渡される:
    ```typescript
    {
      issueNumber: 123,
      baseCommit: "abc123def456",
      targetBranch: "main"
    }
    ```
  - ログ: "✅ Step 3 completed: Commits squashed."
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-17: step3_異常系_スカッシュ失敗

- **目的**: スカッシュ失敗時にエラーが発生することを検証
- **前提条件**: スカッシュが失敗する状態（例: ブランチ保護違反）
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - workflowDir: "/path/to/repo"
  - baseCommit: "abc123def456"
  - options: { issue: "123", ... }
- **期待結果**:
  - `squashManager.squashCommitsForFinalize()` がエラーをスローする
  - エラーがハンドラに伝播される
- **テストデータ**: テストデータセット TD-01（後述）

---

### 2.7 `executeStep4And5()` - PR更新とドラフト解除

#### UC-18: step4_5_正常系_PR更新とドラフト解除成功

- **目的**: PR 本文更新、マージ先変更、ドラフト解除が正常に実行されることを検証
- **前提条件**:
  - PR #456 が存在する（Draft状態）
  - Issue #123 に対応する PR が存在する
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - options: { issue: "123", baseBranch: "develop", ... }
- **期待結果**:
  - `prClient.getPullRequestNumber(123)` が 456 を返す
  - `prClient.updatePullRequest(456, <PR本文>)` が呼び出される
  - `prClient.updateBaseBranch(456, "develop")` が呼び出される
  - `prClient.markPRReady(456)` が呼び出される
  - ログ: "✅ PR #456 updated with final content."
  - ログ: "✅ PR #456 base branch changed to 'develop'."
  - ログ: "✅ PR #456 marked as ready for review."
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-19: step4_5_異常系_PR番号取得失敗

- **目的**: PR 番号が取得できない場合にエラーが発生することを検証
- **前提条件**: Issue #123 に対応する PR が存在しない
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - options: { issue: "123", ... }
- **期待結果**:
  - `prClient.getPullRequestNumber(123)` が null を返す
  - エラーがスローされる
  - エラーメッセージ: "Pull request not found for issue #123"
- **テストデータ**: テストデータセット TD-03（後述）

---

#### UC-20: step4_5_異常系_PR更新失敗

- **目的**: PR 更新失敗時にエラーが発生することを検証
- **前提条件**: PR 更新 API が失敗する状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - options: { issue: "123", ... }
- **期待結果**:
  - `prClient.updatePullRequest()` が失敗を返す
  - エラーがスローされる
  - エラーメッセージ: "Failed to update PR: <error>"
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-21: step4_5_異常系_ドラフト解除失敗

- **目的**: ドラフト解除失敗時にエラーが発生することを検証
- **前提条件**: ドラフト解除 API が失敗する状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス
  - options: { issue: "123", ... }
- **期待結果**:
  - `prClient.markPRReady()` が失敗を返す
  - エラーがスローされる
  - エラーメッセージ: "Failed to mark PR as ready: <error>"
- **テストデータ**: テストデータセット TD-01（後述）

---

### 2.8 `PullRequestClient.markPRReady()` - ドラフト解除

#### UC-22: markPRReady_正常系_GraphQL成功

- **目的**: GraphQL mutation によるドラフト解除が成功することを検証
- **前提条件**: PR #456 が Draft 状態
- **入力**: prNumber = 456
- **期待結果**:
  - `octokit.pulls.get()` が呼び出され、node_id が取得される
  - GraphQL mutation が実行される
  - レスポンスの `isDraft` が false になる
  - { success: true, error: null } が返される
  - ログ: "PR #456 marked as ready for review."
- **テストデータ**: テストデータセット TD-04（後述）

---

#### UC-23: markPRReady_正常系_ghコマンドフォールバック

- **目的**: GraphQL 失敗時に gh コマンドへのフォールバックが動作することを検証
- **前提条件**:
  - PR #456 が Draft 状態
  - GraphQL mutation が失敗する
- **入力**: prNumber = 456
- **期待結果**:
  - GraphQL mutation が失敗する
  - ログ: "GraphQL mutation failed, attempting fallback: <error>"
  - `gh pr ready 456` コマンドが実行される
  - { success: true, error: null } が返される
  - ログ: "PR #456 marked as ready via gh command."
- **テストデータ**: テストデータセット TD-04（後述）

---

#### UC-24: markPRReady_異常系_両方失敗

- **目的**: GraphQL と gh コマンドの両方が失敗した場合にエラーが返されることを検証
- **前提条件**:
  - GraphQL mutation が失敗する
  - gh コマンドも失敗する
- **入力**: prNumber = 456
- **期待結果**:
  - GraphQL mutation が失敗する
  - gh コマンドが失敗する
  - { success: false, error: "<error message>" } が返される
  - ログ: "Failed to mark PR as ready: <error>"
- **テストデータ**: テストデータセット TD-04（後述）

---

#### UC-25: markPRReady_異常系_node_id取得失敗

- **目的**: PR の node_id 取得失敗時にエラーが返されることを検証
- **前提条件**: PR が存在するが node_id が null
- **入力**: prNumber = 456
- **期待結果**:
  - `octokit.pulls.get()` が node_id なしのレスポンスを返す
  - { success: false, error: "PR node_id not found" } が返される
- **テストデータ**: テストデータセット TD-05（後述）

---

### 2.9 `PullRequestClient.updateBaseBranch()` - マージ先変更

#### UC-26: updateBaseBranch_正常系_develop変更成功

- **目的**: マージ先ブランチが develop に変更されることを検証
- **前提条件**: PR #456 が存在する
- **入力**: prNumber = 456, baseBranch = "develop"
- **期待結果**:
  - `octokit.pulls.update()` が以下のパラメータで呼び出される:
    ```typescript
    {
      owner: "tielec",
      repo: "ai-workflow-agent",
      pull_number: 456,
      base: "develop"
    }
    ```
  - { success: true, error: null } が返される
  - ログ: "PR #456 base branch changed to 'develop'."
- **テストデータ**: テストデータセット TD-04（後述）

---

#### UC-27: updateBaseBranch_異常系_ブランチ不在

- **目的**: 存在しないブランチが指定された場合にエラーが返されることを検証
- **前提条件**: "nonexistent" ブランチが存在しない
- **入力**: prNumber = 456, baseBranch = "nonexistent"
- **期待結果**:
  - `octokit.pulls.update()` が GitHub API エラーを返す（422 Unprocessable Entity）
  - { success: false, error: "GitHub API error: 422 - ..." } が返される
  - ログ: "Failed to update base branch: ..."
- **テストデータ**: テストデータセット TD-04（後述）

---

#### UC-28: updateBaseBranch_異常系_権限不足

- **目的**: 権限不足時にエラーが返されることを検証
- **前提条件**: GitHub Token に repo 権限がない
- **入力**: prNumber = 456, baseBranch = "develop"
- **期待結果**:
  - `octokit.pulls.update()` が GitHub API エラーを返す（403 Forbidden）
  - { success: false, error: "GitHub API error: 403 - ..." } が返される
  - ログ: "Failed to update base branch: ..."
- **テストデータ**: テストデータセット TD-04（後述）

---

### 2.10 `SquashManager.squashCommitsForFinalize()` - スカッシュ

#### UC-29: squashCommitsForFinalize_正常系_複数コミットスカッシュ

- **目的**: 複数のコミットが正常にスカッシュされることを検証
- **前提条件**:
  - base_commit から HEAD までに 5 つのコミットが存在する
- **入力**:
  ```typescript
  {
    issueNumber: 123,
    baseCommit: "abc123def456",
    targetBranch: "main"
  }
  ```
- **期待結果**:
  - `getCommitsToSquash()` が 5 つのコミットを返す
  - ログ: "Found 5 commits to squash."
  - `validateBranchProtection()` が呼び出される
  - `metadataManager.setPreSquashCommits()` が呼び出される
  - `generateFinalizeMessage()` が呼び出され、以下のメッセージが生成される:
    ```
    feat: Complete workflow for Issue #123

    AI Workflow finalization completed.

    Fixes #123
    ```
  - `executeSquash()` が呼び出される
  - `metadataManager.setSquashedAt()` が呼び出される
  - ログ: "✅ Commit squash completed successfully."
- **テストデータ**: テストデータセット TD-06（後述）

---

#### UC-30: squashCommitsForFinalize_正常系_1コミットのみスキップ

- **目的**: コミット数が 1 以下の場合にスカッシュがスキップされることを検証
- **前提条件**: base_commit から HEAD までに 1 つのコミットのみ存在する
- **入力**:
  ```typescript
  {
    issueNumber: 123,
    baseCommit: "abc123def456",
    targetBranch: "main"
  }
  ```
- **期待結果**:
  - `getCommitsToSquash()` が 1 つのコミットを返す
  - ログ: "Only 1 commit(s) found. Skipping squash."
  - スカッシュ処理がスキップされる
- **テストデータ**: テストデータセット TD-07（後述）

---

#### UC-31: squashCommitsForFinalize_異常系_ブランチ保護違反

- **目的**: ブランチ保護違反時にエラーがスローされることを検証
- **前提条件**: 現在のブランチが main / master
- **入力**:
  ```typescript
  {
    issueNumber: 123,
    baseCommit: "abc123def456",
    targetBranch: "main"
  }
  ```
- **期待結果**:
  - `validateBranchProtection()` がエラーをスローする
  - エラーメッセージ: "Cannot squash commits on protected branch: main"
  - ログ: "❌ Commit squash failed: ..."
- **テストデータ**: テストデータセット TD-06（後述）

---

### 2.11 `generateFinalPrBody()` - PR本文生成

#### UC-32: generateFinalPrBody_正常系_全フェーズ完了

- **目的**: 全フェーズ完了時の PR 本文が正しく生成されることを検証
- **前提条件**: すべてのフェーズ（planning〜evaluation）が completed 状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス（TD-08）
  - issueNumber: 123
- **期待結果**:
  - 以下の内容を含む Markdown 形式の本文が返される:
    - "## 変更サマリー"
    - "- Issue番号: #123"
    - "- タイトル: feat(cli): Add finalize command"
    - "- 完了ステータス: All phases completed"
    - "## フェーズステータス"
    - "- ✅ planning: completed"
    - "- ✅ requirements: completed"
    - （以下、全フェーズの completed ステータス）
    - "## テスト結果"
    - "✅ Passed"
    - "## クリーンアップ状況"
    - "- ✅ ワークフローディレクトリ削除済み"
    - "- ✅ コミットスカッシュ完了"
- **テストデータ**: テストデータセット TD-08（後述）

---

#### UC-33: generateFinalPrBody_正常系_一部フェーズ未完了

- **目的**: 一部フェーズが未完了の場合でも PR 本文が生成されることを検証
- **前提条件**: testing フェーズのみ pending 状態
- **入力**:
  - metadataManager: MetadataManager のモックインスタンス（TD-09）
  - issueNumber: 123
- **期待結果**:
  - 以下の内容を含む Markdown 形式の本文が返される:
    - "- ⏳ testing: pending"
    - "## テスト結果"
    - "⏳ Pending"
- **テストデータ**: テストデータセット TD-09（後述）

---

### 2.12 `previewFinalize()` - プレビューモード

#### UC-34: previewFinalize_正常系_全ステップ表示

- **目的**: ドライランモードで全ステップのプレビューが表示されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: true,
    skipSquash: false,
    skipPrUpdate: false,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - 以下のログが出力される:
    - "[DRY RUN] Finalize preview:"
    - "Steps to be executed:"
    - "  1. Retrieve base_commit from metadata"
    - "  2. Clean up workflow artifacts (.ai-workflow/issue-<NUM>/)"
    - "  3. Squash commits from base_commit to HEAD"
    - "  4. Update PR body with final content"
    - "  6. Mark PR as ready for review (convert from draft)"
    - "[DRY RUN] No changes were made. Remove --dry-run to execute."
- **テストデータ**: テストデータセット TD-01（後述）

---

#### UC-35: previewFinalize_正常系_スキップオプション反映

- **目的**: スキップオプションがプレビューに反映されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  {
    issue: "123",
    dryRun: true,
    skipSquash: true,
    skipPrUpdate: true,
    baseBranch: "main"
  }
  ```
- **期待結果**:
  - 以下のログが出力される:
    - "  3. [SKIPPED] Squash commits (--skip-squash)"
    - "  4-6. [SKIPPED] PR update and draft conversion (--skip-pr-update)"
- **テストデータ**: テストデータセット TD-01（後述）

---

## 3. Integrationテストシナリオ

### 3.1 エンドツーエンドフロー

#### IT-01: 統合テスト_正常系_全ステップ完全実行

- **目的**: finalize コマンド全体が正常に動作することを検証
- **前提条件**:
  - Git リポジトリが初期化されている
  - Issue #123 のワークフローが完了している（Evaluation Phase = completed）
  - metadata.json に base_commit が記録されている
  - .ai-workflow/issue-123/ ディレクトリが存在する
  - PR #456 が Draft 状態で存在する
  - GitHub Token が環境変数 GITHUB_TOKEN に設定されている
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. 各ステップの実行をモニタリング
  3. 最終状態を確認
- **期待結果**:
  - **Step 1**: base_commit が取得される
  - **Step 2**: .ai-workflow/issue-123/ が削除され、コミット・プッシュされる
  - **Step 3**: base_commit から HEAD までのコミットがスカッシュされ、強制プッシュされる
  - **Step 4**: PR #456 の本文が最終版に更新される
  - **Step 5**: PR #456 が Ready for Review 状態になる
  - コマンド全体が成功終了（exit code 0）
- **確認項目**:
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている
  - [ ] Git ログにクリーンアップコミットが存在する
  - [ ] Git ログにスカッシュコミットが存在する（"feat: Complete workflow for Issue #123"）
  - [ ] PR #456 の本文が更新されている
  - [ ] PR #456 が Draft 解除されている
  - [ ] metadata.json の pre_squash_commits にスカッシュ前のコミット履歴が記録されている
  - [ ] metadata.json の squashed_at にタイムスタンプが記録されている

---

#### IT-02: 統合テスト_正常系_develop指定

- **目的**: --base-branch オプションでマージ先ブランチが変更されることを検証
- **前提条件**:
  - Git リポジトリが初期化されている
  - develop ブランチが存在する
  - PR #456 が存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123 --base-branch develop` を実行
  2. PR の base ブランチを確認
- **期待結果**:
  - Step 4 で PR #456 のマージ先ブランチが develop に変更される
  - GitHub API でマージ先が develop になっていることを確認
- **確認項目**:
  - [ ] PR #456 の base ブランチが develop になっている

---

#### IT-03: 統合テスト_正常系_skip-squash

- **目的**: --skip-squash オプションでスカッシュがスキップされることを検証
- **前提条件**:
  - Git リポジトリが初期化されている
  - base_commit から HEAD までに複数のコミットが存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123 --skip-squash` を実行
  2. Git ログを確認
- **期待結果**:
  - Step 1-2 が実行される
  - Step 3 がスキップされる
  - Step 4-5 が実行される
  - Git ログのコミット数が変わらない（スカッシュされていない）
- **確認項目**:
  - [ ] Git ログに複数のコミットが残っている（スカッシュされていない）
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている
  - [ ] PR #456 が Draft 解除されている

---

#### IT-04: 統合テスト_正常系_skip-pr-update

- **目的**: --skip-pr-update オプションで PR 更新がスキップされることを検証
- **前提条件**:
  - Git リポジトリが初期化されている
  - PR #456 が Draft 状態で存在する
- **テスト手順**:
  1. PR #456 の初期状態を記録
  2. `ai-workflow finalize --issue 123 --skip-pr-update` を実行
  3. PR #456 の状態を確認
- **期待結果**:
  - Step 1-3 が実行される
  - Step 4-5 がスキップされる
  - PR #456 の本文・ドラフト状態が変更されていない
- **確認項目**:
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている
  - [ ] コミットがスカッシュされている
  - [ ] PR #456 の本文が更新されていない
  - [ ] PR #456 が Draft のまま（解除されていない）

---

### 3.2 エラーハンドリング統合テスト

#### IT-05: 統合テスト_異常系_base_commit不在でエラー終了

- **目的**: base_commit 不在時にエラーで終了することを検証
- **前提条件**:
  - metadata.json に base_commit が記録されていない
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - Step 1 でエラーが発生
  - エラーメッセージ: "base_commit not found in metadata. Please ensure the workflow was initialized with the 'init' command."
  - exit code 1 で終了
  - 後続の Step 2-5 は実行されない
- **確認項目**:
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されていない
  - [ ] Git ログに変更がない
  - [ ] PR #456 に変更がない

---

#### IT-06: 統合テスト_異常系_PR不在でエラー終了

- **目的**: PR 不在時にエラーで終了することを検証
- **前提条件**:
  - metadata.json に base_commit が記録されている
  - Issue #123 に対応する PR が存在しない
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - Step 1-3 が実行される
  - Step 4 でエラーが発生
  - エラーメッセージ: "Pull request not found for issue #123"
  - exit code 1 で終了
  - Step 5 は実行されない
- **確認項目**:
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている
  - [ ] コミットがスカッシュされている
  - [ ] PR 更新・ドラフト解除は実行されていない

---

#### IT-07: 統合テスト_異常系_GitHub_API権限不足

- **目的**: GitHub API 権限不足時にエラーで終了することを検証
- **前提条件**:
  - GitHub Token に repo 権限がない
  - PR #456 が存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. エラーメッセージを確認
- **期待結果**:
  - Step 4 または Step 5 で GitHub API エラーが発生
  - エラーメッセージに "GitHub API error: 403" が含まれる
  - exit code 1 で終了
- **確認項目**:
  - [ ] エラーログに権限不足のメッセージが含まれている
  - [ ] PR #456 に変更がない（または一部のみ更新）

---

### 3.3 既存コマンドへの影響確認

#### IT-08: 統合テスト_既存影響なし_cleanup正常動作

- **目的**: finalize コマンド追加後も cleanup コマンドが正常動作することを検証
- **前提条件**:
  - finalize コマンドが実装されている
  - .ai-workflow/issue-123/ ディレクトリが存在する
- **テスト手順**:
  1. `ai-workflow cleanup --issue 123 --phase all` を実行
  2. 動作を確認
- **期待結果**:
  - cleanup コマンドが正常に実行される
  - .ai-workflow/issue-123/ ディレクトリが削除される
  - エラーが発生しない
- **確認項目**:
  - [ ] cleanup コマンドがエラーなく実行される
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている

---

#### IT-09: 統合テスト_既存影響なし_execute正常動作

- **目的**: finalize コマンド追加後も execute コマンドが正常動作することを検証
- **前提条件**:
  - finalize コマンドが実装されている
  - Job DSL の SQUASH_ON_COMPLETE デフォルト値が false に変更されている
- **テスト手順**:
  1. `ai-workflow execute --issue 123 --phase planning` を実行
  2. 動作を確認
- **期待結果**:
  - execute コマンドが正常に実行される
  - --squash-on-complete オプションが未指定の場合、スカッシュが実行されない（デフォルト = false）
  - エラーが発生しない
- **確認項目**:
  - [ ] execute コマンドがエラーなく実行される
  - [ ] スカッシュが実行されていない（デフォルト動作）

---

### 3.4 モジュール統合テスト

#### IT-10: 統合テスト_モジュール連携_MetadataManager連携

- **目的**: MetadataManager との連携が正常に動作することを検証
- **前提条件**:
  - metadata.json が存在する
  - base_commit が記録されている
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. metadata.json の変更を確認
- **期待結果**:
  - MetadataManager.getBaseCommit() が正しく呼び出される
  - MetadataManager.setPreSquashCommits() が呼び出され、スカッシュ前のコミット履歴が記録される
  - MetadataManager.setSquashedAt() が呼び出され、タイムスタンプが記録される
- **確認項目**:
  - [ ] metadata.json の pre_squash_commits にコミット履歴が記録されている
  - [ ] metadata.json の squashed_at にタイムスタンプが記録されている

---

#### IT-11: 統合テスト_モジュール連携_ArtifactCleaner連携

- **目的**: ArtifactCleaner との連携が正常に動作することを検証
- **前提条件**:
  - .ai-workflow/issue-123/ ディレクトリが存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. ディレクトリの削除を確認
- **期待結果**:
  - ArtifactCleaner.cleanupWorkflowArtifacts(true) が呼び出される
  - .ai-workflow/issue-123/ ディレクトリが削除される
- **確認項目**:
  - [ ] .ai-workflow/issue-123/ ディレクトリが削除されている
  - [ ] Git ログにクリーンアップコミットが存在する

---

#### IT-12: 統合テスト_モジュール連携_SquashManager連携

- **目的**: SquashManager との連携が正常に動作することを検証
- **前提条件**:
  - base_commit から HEAD までに複数のコミットが存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. スカッシュ結果を確認
- **期待結果**:
  - SquashManager.squashCommitsForFinalize() が呼び出される
  - FinalizeContext が正しく渡される
  - コミットがスカッシュされる
  - "feat: Complete workflow for Issue #123" というメッセージのコミットが作成される
- **確認項目**:
  - [ ] Git ログにスカッシュコミットが存在する
  - [ ] コミットメッセージが "feat: Complete workflow for Issue #123" になっている
  - [ ] コミット数が 1 になっている（スカッシュ成功）

---

#### IT-13: 統合テスト_モジュール連携_PullRequestClient連携

- **目的**: PullRequestClient との連携が正常に動作することを検証
- **前提条件**:
  - PR #456 が Draft 状態で存在する
- **テスト手順**:
  1. `ai-workflow finalize --issue 123` を実行
  2. PR の状態を確認
- **期待結果**:
  - PullRequestClient.getPullRequestNumber() が呼び出される
  - PullRequestClient.updatePullRequest() が呼び出される
  - PullRequestClient.updateBaseBranch() が呼び出される（--base-branch 指定時）
  - PullRequestClient.markPRReady() が呼び出される
  - PR #456 が Ready for Review 状態になる
- **確認項目**:
  - [ ] PR #456 の本文が更新されている
  - [ ] PR #456 が Draft 解除されている
  - [ ] PR #456 のマージ先ブランチが正しい（--base-branch 指定時）

---

## 4. テストデータ

### TD-01: 正常系テストデータ（基本）

**metadata.json**:
```json
{
  "issue_number": 123,
  "base_commit": "abc123def456",
  "issue_info": {
    "title": "feat(cli): Add finalize command",
    "state": "open"
  },
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_implementation": { "status": "completed" },
    "testing": { "status": "completed" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" },
    "evaluation": { "status": "completed" }
  }
}
```

**Git リポジトリ状態**:
- base_commit: abc123def456
- HEAD までに 5 つのコミットが存在
- 現在のブランチ: feature/issue-123
- リモート: origin

**PR 状態**:
- PR番号: 456
- 状態: Draft
- マージ先: main

**ディレクトリ構造**:
```
.ai-workflow/
└── issue-123/
    ├── 00_planning/
    ├── 01_requirements/
    └── ...
```

---

### TD-02: 異常系テストデータ（base_commit不在）

**metadata.json**:
```json
{
  "issue_number": 123,
  "issue_info": {
    "title": "feat(cli): Add finalize command",
    "state": "open"
  },
  "phases": {
    "planning": { "status": "completed" }
  }
}
```

**注意**: base_commit フィールドが存在しない

---

### TD-03: 異常系テストデータ（PR不在）

**metadata.json**: TD-01 と同じ

**PR 状態**: Issue #123 に対応する PR が存在しない

---

### TD-04: PullRequestClient テストデータ

**PR 情報**:
```json
{
  "number": 456,
  "node_id": "PR_kwDOABCD1234",
  "draft": true,
  "base": {
    "ref": "main"
  }
}
```

**GitHub API レスポンス（markPRReady成功）**:
```json
{
  "markPullRequestReadyForReview": {
    "pullRequest": {
      "isDraft": false
    }
  }
}
```

---

### TD-05: 異常系テストデータ（node_id不在）

**PR 情報**:
```json
{
  "number": 456,
  "node_id": null,
  "draft": true
}
```

---

### TD-06: SquashManager テストデータ（複数コミット）

**コミット履歴**:
```
abc123def456 (base_commit) - Initial commit
def456abc123 - Add planning phase
123abc456def - Add requirements phase
456def123abc - Add design phase
789ghi012jkl - Add implementation phase
012jkl345mno (HEAD) - Add testing phase
```

**コミット数**: 5

---

### TD-07: SquashManager テストデータ（1コミット）

**コミット履歴**:
```
abc123def456 (base_commit, HEAD) - Initial commit
```

**コミット数**: 1

---

### TD-08: PR本文生成テストデータ（全完了）

**metadata.json**: TD-01 と同じ（全フェーズ completed）

**期待される PR 本文**:
```markdown
## 変更サマリー

- Issue番号: #123
- タイトル: feat(cli): Add finalize command
- 完了ステータス: All phases completed

## フェーズステータス

- ✅ planning: completed
- ✅ requirements: completed
- ✅ design: completed
- ✅ test_scenario: completed
- ✅ implementation: completed
- ✅ test_implementation: completed
- ✅ testing: completed
- ✅ documentation: completed
- ✅ report: completed
- ✅ evaluation: completed

## テスト結果

✅ Passed

## クリーンアップ状況

- ✅ ワークフローディレクトリ削除済み
- ✅ コミットスカッシュ完了

---

**AI Workflow Agent - Finalize Command**
```

---

### TD-09: PR本文生成テストデータ（一部未完了）

**metadata.json**:
```json
{
  "issue_number": 123,
  "base_commit": "abc123def456",
  "issue_info": {
    "title": "feat(cli): Add finalize command",
    "state": "open"
  },
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_implementation": { "status": "completed" },
    "testing": { "status": "pending" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" },
    "evaluation": { "status": "completed" }
  }
}
```

**期待される PR 本文** (一部抜粋):
```markdown
- ⏳ testing: pending

## テスト結果

⏳ Pending
```

---

## 5. テスト環境要件

### 5.1 Unitテスト環境

| 項目 | 要件 |
|-----|------|
| **Node.js バージョン** | 20 以上 |
| **テストフレームワーク** | Jest または Vitest |
| **モック/スタブ** | - MetadataManager のモック<br>- ArtifactCleaner のモック<br>- SquashManager のモック<br>- PullRequestClient のモック<br>- GitManager のモック<br>- Octokit のモック |
| **カバレッジツール** | c8 または Istanbul |
| **カバレッジ目標** | 80% 以上 |

### 5.2 Integrationテスト環境

| 項目 | 要件 |
|-----|------|
| **Node.js バージョン** | 20 以上 |
| **Git** | 2.0 以上 |
| **GitHub Token** | 環境変数 GITHUB_TOKEN（repo, workflow スコープ） |
| **テストリポジトリ** | テスト専用の GitHub リポジトリ（または sandbox リポジトリ） |
| **テスト用 PR** | テスト実行前に Draft PR を作成 |
| **gh CLI** | オプション（ドラフト解除のフォールバック用） |
| **外部依存** | - GitHub REST API<br>- GitHub GraphQL API<br>- Git リモートリポジトリ |

### 5.3 CI/CD 環境

| 項目 | 要件 |
|-----|------|
| **CI/CD プラットフォーム** | GitHub Actions または Jenkins |
| **シークレット管理** | GITHUB_TOKEN を環境変数として設定 |
| **テスト実行コマンド** | - `npm run test:unit`<br>- `npm run test:integration` |
| **テストタイムアウト** | 各テストケース 30 秒、全体 10 分 |

---

## 6. 品質ゲートチェックリスト

### 6.1 Phase 2の戦略に沿ったテストシナリオである

- [x] **UNIT_INTEGRATION 戦略に基づいている**
  - Unitテストシナリオ（UC-01 〜 UC-35）を作成
  - Integrationテストシナリオ（IT-01 〜 IT-13）を作成
  - BDDシナリオは含まない（戦略に含まれないため）

### 6.2 主要な正常系がカバーされている

- [x] **主要な正常系がカバーされている**
  - UC-01: 全ステップ実行
  - UC-04: ドライランモード
  - UC-05: スカッシュスキップ
  - UC-06: PR更新スキップ
  - UC-07: マージ先ブランチ変更
  - UC-11: base_commit 取得成功
  - UC-13: ディレクトリ削除成功
  - UC-16: スカッシュ成功
  - UC-18: PR更新とドラフト解除成功
  - UC-22: GraphQL によるドラフト解除成功
  - UC-26: マージ先ブランチ変更成功
  - UC-29: 複数コミットスカッシュ成功
  - UC-32: PR本文生成（全完了）
  - UC-34: プレビューモード（全ステップ表示）
  - IT-01: エンドツーエンド（全ステップ完全実行）
  - IT-02: develop 指定
  - IT-03: skip-squash
  - IT-04: skip-pr-update

### 6.3 主要な異常系がカバーされている

- [x] **主要な異常系がカバーされている**
  - UC-02: base_commit 不在
  - UC-03: PR番号取得失敗
  - UC-08: issue番号なし
  - UC-09: issue番号が不正
  - UC-10: baseBranch が空文字
  - UC-12: base_commit 不在（Step 1）
  - UC-14: コミット失敗
  - UC-15: プッシュ失敗
  - UC-17: スカッシュ失敗
  - UC-19: PR番号取得失敗（Step 4-5）
  - UC-20: PR更新失敗
  - UC-21: ドラフト解除失敗
  - UC-24: GraphQL と gh コマンド両方失敗
  - UC-25: node_id 取得失敗
  - UC-27: ブランチ不在
  - UC-28: 権限不足
  - UC-31: ブランチ保護違反
  - IT-05: base_commit 不在でエラー終了
  - IT-06: PR 不在でエラー終了
  - IT-07: GitHub API 権限不足

### 6.4 期待結果が明確である

- [x] **期待結果が明確である**
  - すべてのテストケースで期待結果を明記
  - 具体的なログメッセージ、エラーメッセージ、exit code を記載
  - 確認項目をチェックリスト形式で列挙（Integrationテスト）
  - テストデータを詳細に定義（TD-01 〜 TD-09）

---

## 品質ゲート判定

✅ **すべての品質ゲートを満たしています**

- ✅ Phase 2の戦略（UNIT_INTEGRATION）に沿ったテストシナリオである
- ✅ 主要な正常系がカバーされている（18ケース）
- ✅ 主要な異常系がカバーされている（20ケース）
- ✅ 期待結果が明確である（すべてのケースで詳細記載）

---

**テストシナリオ作成完了日**: 2025-01-30
**レビュー準備完了**: ✅
