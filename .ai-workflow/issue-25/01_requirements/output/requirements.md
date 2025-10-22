# 要件定義書 - Issue #25: Git Manager の操作別分割

## 0. Planning Document の確認

Planning Phase（`.ai-workflow/issue-25/00_planning/output/planning.md`）において、以下の開発計画が策定されました：

### 実装戦略
- **REFACTOR**: 既存の `git-manager.ts` (548行) を操作種別で分割するリファクタリング
- **ファサードパターン**: 後方互換性100%維持のため、既存のpublicメソッドを専門マネージャーに委譲
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 既存統合テストの継続実行）
- **テストコード戦略**: EXTEND_TEST（既存テスト拡張 + 新規テスト作成）

### 見積もり工数
- **14~22時間**（最小17h、最大27h）
- **リスク評価**: 中（Git操作は開発ワークフローの中核機能であり、不具合が全フェーズに影響）

### 成功基準
1. 各専門マネージャーが200行以下である
2. GitManager ファサードが約150行である（約73%削減）
3. 既存テスト27個が全て通過している（後方互換性100%維持）
4. 統合テスト16個が全て通過している
5. テストカバレッジが80%以上である

この計画に基づき、以下の要件定義を実施します。

---

## 1. 概要

### 背景
現在の `git-manager.ts` は548行あり、コミット操作、ブランチ操作、リモート操作という異なる責務が1つのクラスに集中しています。これにより、以下の課題が発生しています：

- **可読性の低下**: 複数の責務が混在し、コードの理解が困難
- **保守性の低下**: 変更時の影響範囲が不明確
- **テストの複雑化**: 単一クラスのテストケースが肥大化

Issue #23（BasePhase: 1420行→676行、52.4%削減）およびIssue #24（GitHubClient: 702行→402行、42.7%削減）において、ファサードパターンによるリファクタリングの実績があり、同様のアプローチを適用します。

### 目的
Git操作の責務を明確化し、以下の3つの専門マネージャーに分割することで、コードの可読性・保守性・テスト容易性を向上させます：

1. **CommitManager**: コミット操作（作成、メッセージ生成、SecretMasker統合）
2. **BranchManager**: ブランチ操作（作成、切り替え、存在チェック）
3. **RemoteManager**: リモート操作（push、pull、GitHub認証設定）

### ビジネス価値・技術的価値
- **開発効率向上**: モジュール単位での修正が容易になり、開発速度が向上
- **品質向上**: 単一責任原則（SRP）に基づく設計により、バグ混入リスクを低減
- **テスト効率向上**: 各マネージャーの独立したテストが可能になり、テストカバレッジが向上
- **後方互換性維持**: ファサードパターンにより既存の呼び出し元は無変更で動作

---

## 2. 機能要件

### FR-1: CommitManager の実装 【優先度: 高】

**説明**: コミット操作を専門に扱うマネージャーを実装する。

**詳細要件**:
- FR-1.1: `commitPhaseOutput()` メソッドの移行
  - Phase完了時のコミット作成（既存機能の完全移行）
  - 変更ファイルの自動検出とフィルタリング
  - SecretMasker との統合（Issue #12対応）
  - コミットメッセージ生成（`createCommitMessage()` の呼び出し）

- FR-1.2: `commitStepOutput()` メソッドの移行
  - ステップ単位のコミット作成（Issue #10対応）
  - ステップ用コミットメッセージ生成（`buildStepCommitMessage()` の呼び出し）

- FR-1.3: `commitWorkflowInit()` メソッドの移行
  - ワークフロー初期化用のコミット作成（Issue #16対応）
  - 初期化用コミットメッセージ生成（`createInitCommitMessage()` の呼び出し）

- FR-1.4: `commitCleanupLogs()` メソッドの移行
  - ログクリーンアップ用のコミット作成（Issue #16対応）
  - クリーンアップ用コミットメッセージ生成（`createCleanupCommitMessage()` の呼び出し）

- FR-1.5: コミットメッセージ生成ロジックの移行
  - `createCommitMessage()` - Phase完了時のメッセージ
  - `buildStepCommitMessage()` - ステップ完了時のメッセージ
  - `createInitCommitMessage()` - ワークフロー初期化時のメッセージ
  - `createCleanupCommitMessage()` - ログクリーンアップ時のメッセージ

- FR-1.6: ファイル操作ヘルパーの移行
  - `getChangedFiles()` - Git statusから変更ファイルを取得
  - `filterPhaseFiles()` - Issue番号に基づいてファイルをフィルタリング
  - `getPhaseSpecificFiles()` - Phase種別に応じたファイルパターン抽出
  - `scanDirectories()` - 特定ディレクトリのファイルスキャン
  - `scanByPatterns()` - Globパターンによるファイルスキャン

- FR-1.7: Git設定管理の移行
  - `ensureGitConfig()` - user.name/user.email の自動設定

**受け入れ基準**:
- Given: Phase完了時に変更ファイルが存在する
- When: `commitPhaseOutput()` を呼び出す
- Then: SecretMaskerによるマスキングが実行され、適切なコミットメッセージでコミットが作成される

- Given: ステップ完了時に変更ファイルが存在する
- When: `commitStepOutput()` を呼び出す
- Then: ステップ情報を含むコミットメッセージでコミットが作成される

- Given: ワークフロー初期化時にmetadata.jsonが作成される
- When: `commitWorkflowInit()` を呼び出す
- Then: 初期化用コミットメッセージでコミットが作成される

- Given: ログクリーンアップ後に削除ファイルが存在する
- When: `commitCleanupLogs()` を呼び出す
- Then: クリーンアップ用コミットメッセージでコミットが作成される

---

### FR-2: BranchManager の実装 【優先度: 高】

**説明**: ブランチ操作を専門に扱うマネージャーを実装する。

**詳細要件**:
- FR-2.1: `createBranch()` メソッドの移行
  - ブランチ作成（`checkoutLocalBranch()`）
  - ベースブランチからの分岐サポート
  - 既存ブランチチェック（`branchExists()` の呼び出し）

- FR-2.2: `branchExists()` メソッドの移行
  - ローカルブランチの存在チェック（`branchLocal()`）
  - リモートブランチの存在チェック（`branch(['--remotes', ...])`）

- FR-2.3: `getCurrentBranch()` メソッドの移行
  - 現在のブランチ名取得（`rev-parse --abbrev-ref HEAD`）

- FR-2.4: `switchBranch()` メソッドの移行
  - ブランチ切り替え（`checkout()`）

**受け入れ基準**:
- Given: ブランチが存在しない
- When: `createBranch()` を呼び出す
- Then: 新しいブランチが作成され、チェックアウトされる

- Given: ブランチが既に存在する
- When: `createBranch()` を呼び出す
- Then: エラーメッセージを含む `BranchResult` が返される

- Given: ローカルまたはリモートにブランチが存在する
- When: `branchExists()` を呼び出す
- Then: `true` が返される

- Given: 有効なブランチ名が指定される
- When: `switchBranch()` を呼び出す
- Then: 指定されたブランチにチェックアウトされる

---

### FR-3: RemoteManager の実装 【優先度: 高】

**説明**: リモート操作を専門に扱うマネージャーを実装する。

**詳細要件**:
- FR-3.1: `pushToRemote()` メソッドの移行
  - upstream設定（`--set-upstream` フラグ）
  - non-fast-forwardエラー時の自動pullとリトライ
  - リトライロジック（最大3回、デフォルト2秒間隔）
  - リトライ可能エラーの判定（`isRetriableError()` の呼び出し）

- FR-3.2: `pullLatest()` メソッドの移行
  - リモートブランチからのpull（`--no-rebase` 戦略）
  - divergent branches対応

- FR-3.3: `setupGithubCredentials()` メソッドの移行
  - HTTPS URLへのGITHUB_TOKENの埋め込み
  - SSH URLのスキップ（HTTPSのみ対応）

- FR-3.4: `isRetriableError()` メソッドの移行
  - 再試行不可エラーの判定（認証失敗、権限エラー等）
  - 再試行可能エラーの判定（タイムアウト、接続エラー等）

**受け入れ基準**:
- Given: upstream設定が未完了のブランチ
- When: `pushToRemote()` を呼び出す
- Then: `--set-upstream` フラグでリモートにpushされる

- Given: non-fast-forwardエラーが発生する
- When: `pushToRemote()` を呼び出す
- Then: 自動的にpullが実行され、再度pushが試行される

- Given: リトライ可能なネットワークエラーが発生する
- When: `pushToRemote()` を呼び出す
- Then: 最大3回までリトライが実行される

- Given: GITHUB_TOKENが設定されている
- When: `setupGithubCredentials()` を呼び出す
- Then: リモートURLにトークンが埋め込まれる

---

### FR-4: GitManager ファサードの実装 【優先度: 高】

**説明**: 既存のpublicメソッドを専門マネージャーに委譲するファサードクラスを実装する。

**詳細要件**:
- FR-4.1: コンストラクタで専門マネージャーをインスタンス化
  - `simple-git` インスタンスを生成し、各マネージャーに共有
  - `MetadataManager` と `SecretMasker` を CommitManager に注入

- FR-4.2: コミット操作の委譲
  - `commitPhaseOutput()` → `CommitManager.commitPhaseOutput()`
  - `commitStepOutput()` → `CommitManager.commitStepOutput()`
  - `commitWorkflowInit()` → `CommitManager.commitWorkflowInit()`
  - `commitCleanupLogs()` → `CommitManager.commitCleanupLogs()`
  - `createCommitMessage()` → `CommitManager.createCommitMessage()`

- FR-4.3: ブランチ操作の委譲
  - `createBranch()` → `BranchManager.createBranch()`
  - `branchExists()` → `BranchManager.branchExists()`
  - `getCurrentBranch()` → `BranchManager.getCurrentBranch()`
  - `switchBranch()` → `BranchManager.switchBranch()`

- FR-4.4: リモート操作の委譲
  - `pushToRemote()` → `RemoteManager.pushToRemote()`
  - `pullLatest()` → `RemoteManager.pullLatest()`

- FR-4.5: 共通操作の維持
  - `getStatus()` - GitManagerで実装（ステータス取得は複数の責務にまたがるため）

- FR-4.6: インターフェース型の維持
  - `CommitResult`
  - `PushSummary`
  - `BranchResult`
  - `StatusSummary`

**受け入れ基準**:
- Given: 既存の呼び出し元が `GitManager` を使用している
- When: ファサードの任意のメソッドを呼び出す
- Then: 既存の動作が100%維持される（後方互換性）

- Given: 専門マネージャーが正しくインスタンス化されている
- When: ファサードのメソッドを呼び出す
- Then: 対応する専門マネージャーのメソッドが呼び出される

---

### FR-5: 既存テストの後方互換性検証 【優先度: 高】

**説明**: 既存の統合テストが全て通過することを確認する。

**詳細要件**:
- FR-5.1: ユニットテストの実行
  - `tests/unit/git-manager-issue16.test.ts` (27テスト)
  - ファサード経由で既存テストが全て通過することを確認

- FR-5.2: 統合テストの実行
  - `tests/integration/workflow-init-cleanup.test.ts` (16テスト)
  - マルチリポジトリワークフローが正常動作することを確認

**受け入れ基準**:
- Given: 既存のユニットテストが存在する
- When: `npm run test:unit` を実行する
- Then: 全27テストが通過する

- Given: 既存の統合テストが存在する
- When: `npm run test:integration` を実行する
- Then: 全16テストが通過する

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- NFR-1.1: Git操作のレスポンス時間は、リファクタリング前後で5%以内の差に収める
- NFR-1.2: `simple-git` インスタンスの共有により、初期化オーバーヘッドを最小化する
- NFR-1.3: ファサードパターンの委譲オーバーヘッドは1ms未満とする

### NFR-2: セキュリティ要件
- NFR-2.1: SecretMasker 統合により、コミット前に機密情報を自動マスキングする
- NFR-2.2: GITHUB_TOKEN は環境変数から取得し、コード内にハードコードしない
- NFR-2.3: setupGithubCredentials() はベストエフォートで実行し、失敗時もワークフローを継続する

### NFR-3: 可用性・信頼性要件
- NFR-3.1: リトライロジックにより、一時的なネットワークエラーに対応する（最大3回）
- NFR-3.2: non-fast-forwardエラー時の自動pullとリトライにより、並行開発環境での衝突を解決する
- NFR-3.3: Git操作失敗時は詳細なエラーメッセージをログに出力し、デバッグを容易にする

### NFR-4: 保守性・拡張性要件
- NFR-4.1: 各専門マネージャーは200行以下とする（単一責任原則）
- NFR-4.2: 各専門マネージャーは独立してテスト可能な設計とする
- NFR-4.3: ファサードパターンにより、将来的な拡張時も既存コードの変更を最小化する
- NFR-4.4: 依存性注入パターンにより、テスト時のモック化を容易にする

---

## 4. 制約事項

### TC-1: 技術的制約
- TC-1.1: **使用技術**: `simple-git` ライブラリを継続使用（バージョン3.x）
- TC-1.2: **TypeScript**: 既存のTypeScript設定（ES modules、strict mode）を維持
- TC-1.3: **Node.js**: Node.js 20以上をサポート
- TC-1.4: **既存依存関係**: `fs-extra`, `minimatch` を継続使用

### TC-2: リソース制約
- TC-2.1: **工数**: 14~22時間（Planning Phaseの見積もりに基づく）
- TC-2.2: **並行開発**: Issue #23、#24のリファクタリング実績を参考にする

### TC-3: ポリシー制約
- TC-3.1: **後方互換性**: 既存の呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts` 等）は無変更で動作する
- TC-3.2: **テストカバレッジ**: 80%以上を維持する
- TC-3.3: **コーディング規約**: ESLint設定に準拠する

---

## 5. 前提条件

### PC-1: システム環境
- PC-1.1: Gitがインストールされている（バージョン2.x以上）
- PC-1.2: Node.js 20以上がインストールされている
- PC-1.3: npm 10以上がインストールされている

### PC-2: 依存コンポーネント
- PC-2.1: `MetadataManager` が正常に動作している
- PC-2.2: `SecretMasker` が正常に動作している（Issue #12の成果物）
- PC-2.3: 既存のユニットテスト・統合テストが全て通過している

### PC-3: 外部システム連携
- PC-3.1: GitHub リモートリポジトリへのアクセス権限がある
- PC-3.2: GITHUB_TOKEN 環境変数が設定されている（HTTPS認証用）
- PC-3.3: Git設定（user.name, user.email）が設定されている（または環境変数で指定可能）

---

## 6. 受け入れ基準（統合）

### AC-1: 機能要件の充足
- AC-1.1: FR-1（CommitManager）の全サブ要件が実装されている
- AC-1.2: FR-2（BranchManager）の全サブ要件が実装されている
- AC-1.3: FR-3（RemoteManager）の全サブ要件が実装されている
- AC-1.4: FR-4（GitManagerファサード）の全サブ要件が実装されている
- AC-1.5: FR-5（既存テストの後方互換性）が検証されている

### AC-2: 非機能要件の充足
- AC-2.1: 各専門マネージャーが200行以下である
- AC-2.2: GitManagerファサードが約150行である（約73%削減）
- AC-2.3: テストカバレッジが80%以上である

### AC-3: テスト実行結果
- AC-3.1: 既存ユニットテスト27個が全て通過している
- AC-3.2: 既存統合テスト16個が全て通過している
- AC-3.3: 新規ユニットテストが作成され、全て通過している
  - `tests/unit/git/commit-manager.test.ts`
  - `tests/unit/git/branch-manager.test.ts`
  - `tests/unit/git/remote-manager.test.ts`

### AC-4: ドキュメント更新
- AC-4.1: `CLAUDE.md` が更新されている（ファサードパターン、行数削減実績）
- AC-4.2: `ARCHITECTURE.md` が更新されている（モジュール一覧、依存関係図）

---

## 7. スコープ外

### OS-1: 明確にスコープ外とする事項
- OS-1.1: **Git操作の機能追加**: 既存機能の移行のみを行い、新規Git操作は追加しない
- OS-1.2: **simple-gitライブラリの変更**: バージョンアップやフォーク版への切り替えは行わない
- OS-1.3: **エラーハンドリングの変更**: 既存のエラーハンドリングロジックをそのまま移行し、改善は行わない
- OS-1.4: **パフォーマンスチューニング**: 機能移行のみを行い、パフォーマンス改善は別Issueで対応

### OS-2: 将来的な拡張候補
- OS-2.1: **Git操作の非同期最適化**: 並列実行可能な操作のバッチ処理
- OS-2.2: **Git操作のキャッシュ機構**: ブランチ存在チェック等の結果キャッシュ
- OS-2.3: **Git操作のメトリクス収集**: 操作時間、リトライ回数等の統計情報収集
- OS-2.4: **ブランチ削除機能**: 不要ブランチの自動削除（現在は未実装）

---

## 8. 設計方針（Planning Documentから引用）

### DP-1: ファサードパターン
- 既存のpublicメソッドを100%維持
- 各専門マネージャーのインスタンスを保持
- publicメソッドを専門マネージャーに委譲
- simple-gitインスタンスはコンストラクタ注入で共有

### DP-2: 依存性注入パターン
- simple-gitインスタンスは各専門マネージャーで共有
- MetadataManager, SecretMasker は CommitManager のみが依存
- コンストラクタで依存関係を明示化

### DP-3: 単一責任原則（SRP）
- CommitManager: コミット操作のみを担当
- BranchManager: ブランチ操作のみを担当
- RemoteManager: リモート操作のみを担当
- GitManager: ファサードとしてオーケストレーションのみを担当

---

## 9. リスクと軽減策（Planning Documentから引用）

### Risk-1: simple-gitインスタンス共有の複雑性
- **影響度**: 中
- **確率**: 中
- **軽減策**: Issue #24 (GitHubClient) でOctokitインスタンスを依存性注入により共有した実績を適用

### Risk-2: 既存テストの後方互換性維持
- **影響度**: 高（テストが失敗するとリリースできない）
- **確率**: 低（ファサードパターンで既存APIを100%維持）
- **軽減策**: Phase 5 Task 5-4 で既存テスト全体を実行して確認

### Risk-3: Git操作エラーのデバッグ困難化
- **影響度**: 中
- **確率**: 低
- **軽減策**: 各専門マネージャーで詳細なログ出力（エラーメッセージにマネージャー名を含める）

### Risk-4: MetadataManager と SecretMasker の依存関係
- **影響度**: 中
- **確率**: 低
- **軽減策**: CommitManager のみが MetadataManager と SecretMasker に依存する設計

---

## 10. 参考情報

### 類似リファクタリング実績
- **Issue #23 (BasePhase)**: 1420行 → 676行（約52.4%削減）
- **Issue #24 (GitHubClient)**: 702行 → 402行（約42.7%削減）

### 関連ドキュメント
- `CLAUDE.md` - プロジェクトの全体方針とコーディングガイドライン
- `ARCHITECTURE.md` - アーキテクチャ設計思想
- `README.md` - プロジェクト概要と使用方法

### 関連Issue
- **親Issue**: #1
- **参考Issue**: #23（BasePhaseリファクタリング）、#24（GitHubClientリファクタリング）
- **依存Issue**: #10（ステップ単位のGitコミット）、#12（SecretMasker統合）、#16（ワークフロー初期化コミット）

---

**作成日**: 2025-01-20
**Issue**: #25
**バージョン**: 1.0
**ステータス**: Draft
