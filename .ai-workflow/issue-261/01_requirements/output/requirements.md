# 要件定義書 - Issue #261: feat(cli): Add finalize command for workflow completion

**作成日**: 2025-01-30
**Issue番号**: #261
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/261

---

## 0. Planning Documentの確認

Planning Phase（Issue #261）で策定された開発計画を確認しました：

### 開発計画の全体像
- **複雑度**: 中程度
- **総工数**: 12~16時間
- **実装戦略**: CREATE（新規コマンド作成、既存モジュール再利用）
- **テスト戦略**: UNIT_INTEGRATION（ユニット + 統合テスト）
- **リスク**: 中（GraphQL API実装、PhaseContext依存解消）

### Planning Documentで策定された主要戦略
1. **既存モジュールの最大活用**: `MetadataManager`、`ArtifactCleaner`、`PullRequestClient`、`SquashManager` を組み合わせて実装
2. **段階的な実装**: 7フェーズに分割し、各フェーズで明確な成果物を生成
3. **リスク軽減**: GraphQL API実装困難時の `gh` コマンドフォールバック、既存機能への影響最小化
4. **Job DSL変更**: `SQUASH_ON_COMPLETE` デフォルト値を `false` に変更（スカッシュ責務を finalize に移行）

本要件定義書は、上記の開発計画に基づいて詳細な機能要件・非機能要件を定義します。

---

## 1. 概要

### 背景
現在の AI Workflow Agent では、ワークフロー完了後の後処理（クリーンアップ、コミットスカッシュ、PR更新、ドラフト解除）を個別に実行する必要があり、オペレーション負荷が高い。また、`execute` コマンドの `--squash-on-complete` オプションがスカッシュ処理を担当しているが、これはワークフロー完了時の最終処理として finalize コマンドに統合すべき責務である。

### 目的
ワークフロー完了時の最終処理を統合した `finalize` コマンドを新規追加し、以下を実現する：
1. **作業自動化**: 5つの後処理ステップを1コマンドで実行
2. **責務の明確化**: スカッシュ処理を execute コマンドから分離し、finalize コマンドに集約
3. **オペレーション効率化**: 手動実行によるヒューマンエラーを削減
4. **PR準備の自動化**: ドラフト解除とマージ先ブランチ変更を自動化し、レビュー準備を完了

### ビジネス価値
- **開発生産性向上**: ワークフロー完了後の手作業を90%削減
- **品質向上**: 自動化により手順ミスを防止
- **レビュー効率化**: PR準備が自動化され、レビュアーの待ち時間を削減

### 技術的価値
- **責務分離**: execute コマンドと finalize コマンドの責務を明確化
- **既存資産の活用**: 既存の `MetadataManager`、`ArtifactCleaner`、`SquashManager`、`PullRequestClient` を最大限再利用
- **拡張性**: 将来的な最終処理ステップの追加が容易

---

## 2. 機能要件

### FR-1: finalize コマンドの新規追加（優先度: 高）

#### FR-1.1: 5ステップの順次実行
- **要件**: finalize コマンドは以下の5つのステップを順次実行する
  1. **Step 1**: `base_commit` をメタデータから取得し、メモリに一時保存
  2. **Step 2**: `.ai-workflow/issue-{NUM}/` ディレクトリ全体を削除し、Git コミット＆プッシュ
  3. **Step 3**: `base_commit` から `HEAD` までのコミットをスカッシュし、AI生成のコミットメッセージを付与
  4. **Step 4**: PR 本文を最終版に更新し、マージ先ブランチを変更（オプション）
  5. **Step 5**: PR ドラフトを解除し、Ready for Review 状態に変更

#### FR-1.2: CLI オプション
- `--issue <number>`: 対象のIssue番号（必須）
- `--dry-run`: プレビューモード（実際には実行せず、実行内容を表示）
- `--skip-squash`: Step 3（コミットスカッシュ）をスキップ
- `--skip-pr-update`: Step 4-5（PR更新・ドラフト解除）をスキップ
- `--base-branch <branch>`: PRのマージ先ブランチ（デフォルト: `main`）

**例**:
```bash
# 基本的な使用方法
ai-workflow finalize --issue 123

# ドライラン
ai-workflow finalize --issue 123 --dry-run

# スカッシュをスキップ
ai-workflow finalize --issue 123 --skip-squash

# マージ先をdevelopに変更
ai-workflow finalize --issue 123 --base-branch develop
```

---

### FR-2: 既存モジュールの再利用（優先度: 高）

#### FR-2.1: MetadataManager による base_commit 取得
- `MetadataManager.getBaseCommit()` を使用して `base_commit` を取得
- 取得した `base_commit` をメモリに保持し、Step 3（スカッシュ）で使用

#### FR-2.2: ArtifactCleaner によるワークフローディレクトリ削除
- `ArtifactCleaner.cleanupWorkflowArtifacts()` を使用して `.ai-workflow/issue-{NUM}/` を削除
- 削除後、`GitManager.commitCleanupLogs()` で自動コミット＆プッシュ

#### FR-2.3: PullRequestClient による PR 番号取得・更新
- `PullRequestClient.checkExistingPr()` を使用してPR番号を取得
- `PullRequestClient.updatePullRequest()` を使用してPR本文を更新

---

### FR-3: 新規機能の追加（優先度: 高）

#### FR-3.1: PullRequestClient.markPRReady() の実装
- **要件**: PR ドラフトを解除し、Ready for Review 状態に変更する
- **実装方式**:
  - **優先**: GitHub GraphQL API の `markPullRequestReadyForReview` mutation を使用
  - **フォールバック**: `gh pr ready <PR_NUMBER>` コマンドを subprocess で実行
- **入力**: PR番号（number）
- **出力**: `GenericResult`（success, message）
- **エラーハンドリング**: PR がドラフトでない場合は警告を表示し、成功として扱う

**GraphQL mutation 例**:
```graphql
mutation MarkPRReady($pullRequestId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
    pullRequest {
      isDraft
    }
  }
}
```

#### FR-3.2: PullRequestClient.updateBaseBranch() の実装
- **要件**: PR のマージ先ブランチを変更する
- **実装方式**: GitHub REST API の `PATCH /repos/{owner}/{repo}/pulls/{pull_number}` を使用
- **入力**: PR番号（number）、マージ先ブランチ名（baseBranch）
- **出力**: `GenericResult`（success, message）
- **エラーハンドリング**: ブランチが存在しない場合はエラーを返す

**REST API 例**:
```
PATCH /repos/{owner}/{repo}/pulls/{pull_number}
{
  "base": "develop"
}
```

#### FR-3.3: PR 最終本文の生成
- **要件**: ワークフロー完了時の最終状態を反映したPR本文を生成する
- **含まれる情報**:
  - Issue番号とタイトル
  - 変更サマリー（実装内容、変更ファイル数、追加/削除行数）
  - 完了ステータス（Phase 0-9のステータス）
  - テスト結果（成功数、失敗数、カバレッジ）
  - クリーンアップ状況（ワークフローディレクトリ削除済み）
  - コミットスカッシュ状況（AI生成コミットメッセージ）
- **フォーマット**: Markdown形式

---

### FR-4: SquashManager の PhaseContext 依存解消（優先度: 中）

#### FR-4.1: finalize 用のシンプルなコンテキスト作成
- **要件**: `SquashManager` が `PhaseContext` に依存せず動作するようにする
- **実装方式**:
  - `FinalizeContext` インターフェースを新規作成（必要最小限のフィールドのみ）
  - `SquashManager.squashCommits()` に `PhaseContext` 以外のコンテキストを受け入れるオーバーロードを追加
  - フォールバックメッセージ生成ロジックを `SquashManager` 内部に実装

**FinalizeContext 例**:
```typescript
interface FinalizeContext {
  issueNumber: string;
  baseCommit: string;
  targetBranch: string;
}
```

---

### FR-5: Job DSL のデフォルト値変更（優先度: 高）

#### FR-5.1: ai_workflow_all_phases_job.groovy の変更
- **要件**: `SQUASH_ON_COMPLETE` パラメータのデフォルト値を `true` → `false` に変更
- **理由**: スカッシュ処理は finalize コマンドの責務に移行するため、execute コマンドでのデフォルト動作を無効化

#### FR-5.2: ai_workflow_preset_job.groovy の変更
- **要件**: `SQUASH_ON_COMPLETE` パラメータのデフォルト値を `true` → `false` に変更
- **理由**: FR-5.1 と同様

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

#### NFR-1.1: 実行時間
- finalize コマンド全体の実行時間は、通常のワークフロー（中規模リポジトリ、100コミット以下）で **5分以内** に完了すること
- 各ステップの実行時間:
  - Step 1（base_commit 取得）: 1秒以内
  - Step 2（ディレクトリ削除）: 10秒以内
  - Step 3（コミットスカッシュ）: 2分以内（AI生成含む）
  - Step 4（PR更新）: 30秒以内
  - Step 5（ドラフト解除）: 30秒以内

#### NFR-1.2: API レート制限対策
- GitHub API 呼び出し時にレート制限を考慮し、リトライロジック（最大3回、指数バックオフ）を実装
- API レート制限エラー発生時は明確なエラーメッセージを表示

---

### NFR-2: セキュリティ要件

#### NFR-2.1: 認証情報の安全な取り扱い
- GitHub Personal Access Token は環境変数（`GITHUB_TOKEN`）から取得し、ログやエラーメッセージに出力しない
- Git URL に埋め込まれたトークンは自動的に除去する（既存の `sanitizeGitUrl()` を使用）

#### NFR-2.2: ブランチ保護
- `main` / `master` ブランチへの強制プッシュを禁止（`SquashManager` の既存ロジックを使用）
- `--force-with-lease` による安全な強制プッシュを使用（他の変更を上書きしない）

---

### NFR-3: 可用性・信頼性要件

#### NFR-3.1: エラーハンドリング
- 各ステップでエラーが発生した場合、明確なエラーメッセージを表示し、処理を中断
- `--dry-run` モードでは、すべてのステップの実行内容をプレビュー表示し、実際には実行しない
- ステップスキップオプション（`--skip-squash`、`--skip-pr-update`）が指定された場合、該当ステップをスキップし、次のステップに進む

#### NFR-3.2: ロールバック可能性
- Step 2（ディレクトリ削除）実行前に、base_commit をメモリに保持（削除後も使用可能）
- Step 3（コミットスカッシュ）実行前に、スカッシュ前のコミット履歴を `metadata.json` の `pre_squash_commits` に保存（既存の `SquashManager` ロジック）

---

### NFR-4: 保守性・拡張性要件

#### NFR-4.1: モジュール分離
- finalize コマンドの実装（`src/commands/finalize.ts`）は、各ステップの処理を専門モジュールに委譲し、単一責任原則（SRP）を遵守
- 新規メソッド（`markPRReady()`、`updateBaseBranch()`）は `PullRequestClient` に追加し、既存のファサードパターンを維持

#### NFR-4.2: テスタビリティ
- 各ステップのロジックは独立してテスト可能な形で実装
- モック可能な依存関係注入（DI）パターンを使用
- ユニットテスト（各ステップのロジック）と統合テスト（5ステップ全体のフロー）を実装

#### NFR-4.3: ログ出力
- 各ステップの開始・完了を明確にログ出力（統一ロガー `src/utils/logger.ts` を使用）
- `--dry-run` モード時は、実行内容を詳細にログ出力
- エラー発生時は、エラー内容とスタックトレースをログ出力

---

## 4. 制約事項

### 技術的制約

#### TC-1: GitHub API の制約
- GraphQL API は認証が必須（`GITHUB_TOKEN` 環境変数）
- REST API のレート制限（認証済み: 5,000リクエスト/時）
- PR の `node_id` 取得に REST API を経由する必要がある（GraphQL mutation 実行のため）

#### TC-2: Git操作の制約
- `--force-with-lease` による強制プッシュは、リモートブランチが先に進んでいる場合は失敗する
- スカッシュ後の強制プッシュは non-fast-forward エラーを引き起こすため、pull を実行しない

#### TC-3: 既存コードとの整合性
- `SquashManager` の既存インターフェース（`PhaseContext` 依存）を壊さない
- `MetadataManager`、`ArtifactCleaner`、`PullRequestClient` の既存メソッドを変更しない
- 既存の cleanup / execute コマンドに影響を与えない

---

### リソース制約

#### RC-1: 開発期間
- 総工数: 12~16時間（Planning Document に基づく）
- 実装期間: 7フェーズ（Planning → Evaluation）

#### RC-2: 環境要件
- Node.js 20 以上
- GitHub Personal Access Token（`repo`、`workflow` スコープ）
- `gh` CLI（ドラフト解除のフォールバック用、オプション）

---

### ポリシー制約

#### PC-1: コーディング規約
- TypeScript strict モード準拠
- ESLint ルール準拠（`no-console`、環境変数アクセスは `Config` クラス経由）
- エラーハンドリングは `src/utils/error-utils.ts` の `getErrorMessage()` を使用

#### PC-2: ロギング規約
- `console.log/error/warn` の直接使用は禁止
- 統一ロガー（`src/utils/logger.ts`）の `logger.debug/info/warn/error()` を使用

#### PC-3: 環境変数アクセス規約
- `process.env` への直接アクセスは禁止
- `Config` クラス（`src/core/config.ts`）の `config.getXxx()` メソッドを使用

---

## 5. 前提条件

### システム環境
- ワークフローが完了している（Evaluation Phase が `completed` 状態）
- ワークフロー開始時（`init` コマンド実行時）に `base_commit` がメタデータに記録されている
- 現在のブランチが `main` / `master` ブランチでない

### 依存コンポーネント
- `MetadataManager`: `base_commit` の取得に使用
- `ArtifactCleaner`: `.ai-workflow` ディレクトリ削除に使用
- `SquashManager`: コミットスカッシュに使用
- `PullRequestClient`: PR 番号取得・更新・ドラフト解除に使用
- `GitManager`: Git コミット＆プッシュに使用
- `Config`: 環境変数アクセスに使用
- `logger`: ログ出力に使用

### 外部システム連携
- GitHub REST API（PR 更新、マージ先ブランチ変更）
- GitHub GraphQL API（ドラフト解除、オプション）
- `gh` CLI（ドラフト解除のフォールバック、オプション）
- Git（コミット、プッシュ、リセット、スカッシュ）

---

## 6. 受け入れ基準

### AC-1: finalize コマンドの基本動作

**Given**: ワークフローが完了している（Evaluation Phase が `completed`）
**When**: `ai-workflow finalize --issue 123` を実行する
**Then**:
- 5つのステップが順次実行される
- 各ステップの開始・完了がログ出力される
- 最終的に PR がドラフト解除され、Ready for Review 状態になる
- コマンド全体が成功終了する（exit code 0）

---

### AC-2: ドライランモードの動作

**Given**: ワークフローが完了している
**When**: `ai-workflow finalize --issue 123 --dry-run` を実行する
**Then**:
- 各ステップの実行内容がプレビュー表示される
- 実際の削除・コミット・プッシュ・PR更新は実行されない
- コマンド全体が成功終了する（exit code 0）

---

### AC-3: Step 1（base_commit 取得）

**Given**: `metadata.json` に `base_commit` が記録されている
**When**: Step 1 が実行される
**Then**:
- `MetadataManager.getBaseCommit()` が呼び出される
- `base_commit` がメモリに保持される
- Step 2 以降で使用可能になる

---

### AC-4: Step 2（ディレクトリ削除）

**Given**: `.ai-workflow/issue-123/` ディレクトリが存在する
**When**: Step 2 が実行される
**Then**:
- `ArtifactCleaner.cleanupWorkflowArtifacts()` が呼び出される
- `.ai-workflow/issue-123/` ディレクトリが削除される
- 削除が Git コミット＆プッシュされる
- コミットメッセージが `[ai-workflow] Clean up all workflow artifacts` になる

---

### AC-5: Step 3（コミットスカッシュ）

**Given**:
- Step 1 で `base_commit` が取得されている
- `base_commit` から `HEAD` までに複数のコミットが存在する

**When**: Step 3 が実行される
**Then**:
- `SquashManager.squashCommits()` が呼び出される
- AI エージェント（Codex / Claude）がコミット履歴とdiff統計を分析し、Conventional Commits形式のメッセージを生成
- `git reset --soft <base_commit>` でコミットがスカッシュされる
- 生成されたメッセージで新しいコミットが作成される
- `git push --force-with-lease` で強制プッシュされる

---

### AC-6: Step 3 のスキップオプション

**Given**: ワークフローが完了している
**When**: `ai-workflow finalize --issue 123 --skip-squash` を実行する
**Then**:
- Step 1-2 は実行される
- Step 3（コミットスカッシュ）はスキップされる
- Step 4-5 は実行される
- ログに "Skipping commit squash (--skip-squash option)" と出力される

---

### AC-7: Step 4（PR 本文更新）

**Given**:
- PR が存在する
- PR番号が取得可能

**When**: Step 4 が実行される
**Then**:
- `PullRequestClient.checkExistingPr()` でPR番号が取得される
- PR 最終本文が生成される（変更サマリー、完了ステータス、テスト結果等を含む）
- `PullRequestClient.updatePullRequest()` でPR本文が更新される
- ログに "PR #123 updated with final content" と出力される

---

### AC-8: Step 4（マージ先ブランチ変更）

**Given**:
- PR が存在する
- `--base-branch develop` オプションが指定されている

**When**: Step 4 が実行される
**Then**:
- `PullRequestClient.updateBaseBranch()` が呼び出される
- PR のマージ先ブランチが `develop` に変更される
- ログに "PR #123 base branch changed to 'develop'" と出力される

---

### AC-9: Step 5（ドラフト解除）

**Given**:
- PR が Draft 状態
- PR番号が取得可能

**When**: Step 5 が実行される
**Then**:
- `PullRequestClient.markPRReady()` が呼び出される
- PR が Ready for Review 状態に変更される
- ログに "PR #123 marked as ready for review" と出力される

---

### AC-10: PR 更新のスキップオプション

**Given**: ワークフローが完了している
**When**: `ai-workflow finalize --issue 123 --skip-pr-update` を実行する
**Then**:
- Step 1-3 は実行される
- Step 4-5（PR更新・ドラフト解除）はスキップされる
- ログに "Skipping PR update and draft conversion (--skip-pr-update option)" と出力される

---

### AC-11: エラーハンドリング（base_commit 不在）

**Given**: `metadata.json` に `base_commit` が記録されていない
**When**: `ai-workflow finalize --issue 123` を実行する
**Then**:
- Step 1 でエラーが発生する
- エラーメッセージ "base_commit not found in metadata. Please ensure the workflow was initialized with the 'init' command." が表示される
- コマンド全体が失敗終了する（exit code 1）

---

### AC-12: エラーハンドリング（PR 番号取得失敗）

**Given**: PR が存在しない
**When**: `ai-workflow finalize --issue 123` を実行する
**Then**:
- Step 4 でエラーが発生する
- エラーメッセージ "Pull request not found for issue #123" が表示される
- コマンド全体が失敗終了する（exit code 1）

---

### AC-13: Job DSL のデフォルト値変更

**Given**:
- `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy` が存在する
- `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy` が存在する

**When**: 変更が適用される
**Then**:
- 両ファイルの `SQUASH_ON_COMPLETE` パラメータのデフォルト値が `false` になる
- コメントで変更理由が記載される（"Changed to false as squashing is now handled by finalize command"）

---

### AC-14: 既存コマンドへの影響なし

**Given**: 変更が適用されている
**When**: 既存の `cleanup` コマンドまたは `execute` コマンドを実行する
**Then**:
- 既存のコマンドが正常に動作する
- エラーやデグレーションが発生しない

---

### AC-15: ユニットテスト

**Given**: ユニットテストが実装されている
**When**: `npm run test:unit` を実行する
**Then**:
- すべてのユニットテストが成功する
- テストカバレッジが80%以上である
- 各ステップのロジック、オプション挙動、エラーケースがテストされている

---

### AC-16: 統合テスト

**Given**: 統合テストが実装されている
**When**: `npm run test:integration` を実行する
**Then**:
- すべての統合テストが成功する
- 5ステップ全体の統合フローがテストされている
- エラーハンドリング（base_commit 不在、PR番号取得失敗）がテストされている

---

## 7. スコープ外

### 明確にスコープ外とする事項
1. **Jenkins パイプラインの実装**: finalize コマンド用の Jenkins パイプライン（Jenkinsfile）は本Issueの範囲外（別Issue #259で実装）
2. **レビューコメント自動投稿**: PR Ready for Review 後のレビューコメント自動投稿機能は含まない
3. **Slack / Email 通知**: ワークフロー完了時の外部通知機能は含まない
4. **コミットスカッシュの手動制御**: スカッシュ時のコミットメッセージ手動編集機能は含まない（AI生成メッセージのみ）
5. **複数PR対応**: 1つのIssueに対して複数のPRが存在する場合の対応は含まない（最初に見つかったPRのみ処理）
6. **ロールバック機能**: finalize コマンド実行後のロールバック機能は含まない（メタデータの `pre_squash_commits` により手動ロールバック可能）

### 将来的な拡張候補
1. **Step 6: マージ自動実行**: PRを自動的にマージする機能（`--auto-merge` オプション）
2. **Step 7: リリースノート生成**: ワークフロー完了時にリリースノートを自動生成する機能
3. **Step 8: Issue 自動クローズ**: PR マージ後に元Issueを自動クローズする機能
4. **カスタムステップ追加**: ユーザー定義のカスタムステップを追加できる機能
5. **複数PR対応**: 1つのIssueに対して複数のPRが存在する場合、すべてのPRに対して処理を実行する機能

---

## 付録: 実装の流れ

```
finalize コマンド
    │
    ├─► Step 1: base_commit 取得・一時保存
    │     └─ MetadataManager.getBaseCommit() ← 既存
    │
    ├─► Step 2: .ai-workflow 削除 + コミット
    │     └─ ArtifactCleaner.cleanupWorkflowArtifacts() ← 既存
    │         └─ GitManager.commitCleanupLogs() ← 既存
    │
    ├─► Step 3: コミットスカッシュ
    │     └─ SquashManager.squashCommits() ← 修正版（PhaseContext依存解消）
    │         └─ RemoteManager.forcePushToRemote() ← 既存
    │
    ├─► Step 4: PR 本文更新 + マージ先変更
    │     ├─ PullRequestClient.checkExistingPr() ← 既存
    │     ├─ generateFinalPrBody() ← 新規（PR最終本文生成）
    │     ├─ PullRequestClient.updatePullRequest() ← 既存
    │     └─ PullRequestClient.updateBaseBranch() ← 新規追加
    │
    └─► Step 5: PR ドラフト解除
          └─ PullRequestClient.markPRReady() ← 新規追加
```

---

## 付録: ファイル構成

```
src/
├── commands/
│   └── finalize.ts              # 新規作成（handleFinalizeCommand, FinalizeCommandOptions）
├── core/
│   ├── git/
│   │   └── squash-manager.ts    # 修正（PhaseContext依存解消、FinalizeContext対応）
│   └── github/
│       └── pull-request-client.ts  # 修正（markPRReady, updateBaseBranch追加）
└── main.ts                      # finalize コマンド追加

jenkins/
└── jobs/
    └── dsl/
        └── ai-workflow/
            ├── ai_workflow_all_phases_job.groovy  # SQUASH_ON_COMPLETE デフォルト変更
            └── ai_workflow_preset_job.groovy      # SQUASH_ON_COMPLETE デフォルト変更

tests/
├── unit/
│   └── commands/
│       └── finalize.test.ts     # 新規作成（ユニットテスト）
└── integration/
    └── commands/
        └── finalize.test.ts     # 新規作成（統合テスト）
```

---

**以上、要件定義書の作成を完了しました。**
