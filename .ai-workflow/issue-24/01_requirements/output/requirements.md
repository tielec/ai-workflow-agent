# 要件定義書 - Issue #24: GitHub Client の機能別分割

**作成日**: 2025-01-21
**Issue番号**: #24
**実装戦略**: REFACTOR
**テスト戦略**: UNIT_INTEGRATION
**見積もり工数**: 12~16時間

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました。本要件定義書は、以下の戦略に基づいて作成します：

### 開発計画の概要
- **実装戦略**: REFACTOR（既存コードの構造改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **複雑度**: 中程度
- **リスク評価**: 中（Octokitインスタンス共有、privateメソッド配置先）

### 主要な設計方針
1. ファサードパターンによる既存API の後方互換性維持
2. 各モジュールを200行以下に分割
3. 独立したテスト可能性の確保
4. Octokitインスタンスのコンストラクタ注入による共有

---

## 1. 概要

### 1.1 背景

現在の `src/core/github-client.ts` は702行に及び、以下の複数の責務を担っています：

- Issue操作（取得、作成、更新、クローズ）: 約200行
- PR操作（作成、更新、検索、クローズ）: 約150行
- コメント操作（進捗コメント、レビュー結果投稿）: 約150行
- ドキュメント抽出・テンプレート処理: 約200行

このモノリシックな構造は、以下の問題を引き起こしています：

1. **可読性の低下**: 700行を超えるファイルは、コードレビューや保守において認知負荷が高い
2. **テストの困難性**: 複数の責務が混在しているため、ユニットテストの作成が困難
3. **変更の影響範囲の拡大**: 一つの機能修正が、無関係な機能に影響を及ぼすリスク
4. **単一責任原則の違反**: 1つのクラスが複数の責務を持つことで、変更理由が複数存在

### 1.2 目的

本リファクタリングの目的は、以下の3点です：

1. **責務の分離**: GitHub API操作を機能別（Issue/PR/Comment/Review）に分割し、各モジュールの責務を明確化
2. **コードの可読性向上**: 各モジュールを200行以下に制限し、認知負荷を軽減
3. **テスト容易性の向上**: 各クライアントを独立してテスト可能にし、テストカバレッジを向上（目標: 80%以上）

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- **開発速度の向上**: モジュール化により、並行開発が容易になり、新機能追加のリードタイムが短縮
- **品質向上**: テストカバレッジの向上により、本番環境でのバグ発生率が低下
- **保守コストの削減**: コードの可読性向上により、新規メンバーのオンボーディング時間が短縮

**技術的価値**:
- **アーキテクチャの健全性**: 単一責任原則（SRP）とオープン・クローズド原則（OCP）の遵守
- **拡張性の向上**: 新しいGitHub API機能の追加が容易（例: GitHub Discussions、GitHub Projects連携）
- **リファクタリングのベストプラクティス**: ファサードパターンの適用により、他のモノリシックモジュールへのリファクタリングのリファレンス実装となる

---

## 2. 機能要件

### 2.1 モジュール分割

**優先度**: 高

#### FR-001: IssueClient の作成

**説明**: Issue操作を担当するクライアントモジュールを作成します。

**詳細要件**:
- ファイルパス: `src/core/github/issue-client.ts`
- 行数制約: 200行以下
- 提供メソッド:
  - `getIssue(issueNumber: number)` - Issue詳細取得
  - `getIssueInfo(issueNumber: number)` - Issue情報の簡易取得
  - `getIssueComments(issueNumber: number)` - Issueコメント一覧取得
  - `getIssueCommentsDict(issueNumber: number)` - コメント情報の辞書形式取得
  - `postComment(issueNumber: number, body: string)` - コメント投稿
  - `closeIssueWithReason(issueNumber: number, reason: string)` - Issue クローズ（理由付き）
  - `createIssueFromEvaluation(issueNumber: number, remainingTasks: RemainingTask[], evaluationReportPath: string)` - 残タスクIssue作成

**受け入れ基準**:
- Given: IssueClient がインスタンス化されている
- When: `getIssue(24)` を呼び出す
- Then: GitHub API から Issue #24 の詳細情報が返される
- And: レスポンス形式が既存の `GitHubClient.getIssue()` と同一である

#### FR-002: PullRequestClient の作成

**説明**: PR操作を担当するクライアントモジュールを作成します。

**詳細要件**:
- ファイルパス: `src/core/github/pull-request-client.ts`
- 行数制約: 200行以下
- 提供メソッド:
  - `createPullRequest(title, body, head, base, draft)` - PR作成
  - `checkExistingPr(head, base)` - 既存PR検索
  - `updatePullRequest(prNumber, body)` - PR本文更新
  - `closePullRequest(prNumber, reason?)` - PRクローズ
  - `getPullRequestNumber(issueNumber)` - Issue番号からPR番号を取得

**受け入れ基準**:
- Given: PullRequestClient がインスタンス化されている
- When: `createPullRequest("feat: add feature", "body", "feature/test", "main", true)` を呼び出す
- Then: GitHub API 経由でドラフトPRが作成される
- And: 戻り値が `PullRequestResult` 型で、`success: true` を含む
- And: 422エラー（既存PR存在）が適切にハンドリングされる

#### FR-003: CommentClient の作成

**説明**: コメント操作を担当するクライアントモジュールを作成します。

**詳細要件**:
- ファイルパス: `src/core/github/comment-client.ts`
- 行数制約: 150行以下
- 提供メソッド:
  - `postWorkflowProgress(issueNumber, phase, status, details?)` - ワークフロー進捗コメント投稿
  - `createOrUpdateProgressComment(issueNumber, content, metadataManager)` - 進捗コメント作成/更新

**受け入れ基準**:
- Given: CommentClient がインスタンス化されている
- When: `postWorkflowProgress(24, "requirements", "in_progress", "詳細情報")` を呼び出す
- Then: フォーマットされた進捗コメントが Issue #24 に投稿される
- And: コメント本文に絵文字（🔄）とフェーズ名（要件定義）が含まれる
- And: 既存の進捗コメントが存在する場合、更新（新規作成ではない）される

#### FR-004: ReviewClient の作成

**説明**: レビュー結果投稿を担当するクライアントモジュールを作成します。

**詳細要件**:
- ファイルパス: `src/core/github/review-client.ts`
- 行数制約: 180行以下
- 提供メソッド:
  - `postReviewResult(issueNumber, phase, result, feedback, suggestions)` - レビュー結果投稿

**受け入れ基準**:
- Given: ReviewClient がインスタンス化されている
- When: `postReviewResult(24, "requirements", "PASS_WITH_SUGGESTIONS", "フィードバック", ["提案1", "提案2"])` を呼び出す
- Then: レビュー結果コメントが Issue #24 に投稿される
- And: コメント本文に判定（⚠️ PASS_WITH_SUGGESTIONS）とサジェスションリストが含まれる

#### FR-005: ファサードパターンによる統合

**説明**: 既存の `GitHubClient` をファサードとして、各専門クライアントを統合します。

**詳細要件**:
- ファイルパス: `src/core/github-client.ts`
- 行数制約: 150行以下（約78.6%削減）
- 設計方針:
  - 各クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）をプライベートフィールドとして保持
  - コンストラクタで各クライアントをインスタンス化し、Octokitインスタンスを注入
  - 既存のpublicメソッドは、対応するクライアントのメソッドに委譲
  - `extractPhaseOutputs()`, `generatePrBodyTemplate()`, `generatePrBodyDetailed()` などのドキュメント関連メソッドは `GitHubClient` 内部に保持（ファサードが持つユーティリティ機能として）

**受け入れ基準**:
- Given: 既存のコード（`src/commands/init.ts`, `src/commands/execute.ts`, `src/phases/base-phase.ts`）が `GitHubClient` をインポートしている
- When: リファクタリング後のコードを実行する
- Then: すべての既存メソッドが正常に動作する
- And: 既存のコード（呼び出し元）に **一切の変更が不要** である（後方互換性）
- And: 各クライアントへの委譲が正しく機能している

### 2.2 Octokitインスタンス共有

**優先度**: 高

#### FR-006: 依存性注入パターンの実装

**説明**: 各クライアントが Octokit インスタンスをコンストラクタ注入により共有します。

**詳細要件**:
- 各クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）のコンストラクタは、以下のシグネチャを持つ:
  ```typescript
  constructor(octokit: Octokit, owner: string, repo: string)
  ```
- `GitHubClient` のコンストラクタで Octokit インスタンスを作成し、各クライアントに注入
- 各クライアント内で Octokit インスタンスの再作成は **禁止**

**受け入れ基準**:
- Given: GitHubClient がインスタンス化されている
- When: 内部の各クライアントが Octokit を使用する
- Then: すべてのクライアントが **同一の Octokit インスタンス** を使用している
- And: GitHub API の認証情報が正しく共有されている（401/403エラーが発生しない）

### 2.3 エラーハンドリング

**優先度**: 高

#### FR-007: エラーハンドリングの統一

**説明**: すべてのクライアントで一貫したエラーハンドリングを実装します。

**詳細要件**:
- 401/403エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
- 422エラー（PR作成時）: 「A pull request already exists for this branch」エラーメッセージを返す
- RequestErrorの場合: `GitHub API error: {status} - {message}` 形式でエラーメッセージを構築
- その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを構築
- エラー発生時も例外をスローせず、Result型（`{ success: boolean, error?: string }`）を返す

**受け入れ基準**:
- Given: GitHub APIがエラーを返す状態（例: 無効なトークン）
- When: 各クライアントのメソッドを呼び出す
- Then: 例外がスローされず、Result型のオブジェクトが返される
- And: `success: false` かつ `error` フィールドに適切なエラーメッセージが設定されている
- And: エラーメッセージが既存の形式と一致している

### 2.4 ドキュメント抽出機能の配置

**優先度**: 中

#### FR-008: ドキュメント関連メソッドの配置

**説明**: `extractPhaseOutputs()`, `generatePrBodyTemplate()`, `generatePrBodyDetailed()` などのprivateメソッドを適切な場所に配置します。

**詳細要件**:
- **配置先**: `GitHubClient` 内部に保持（ファサードが持つユーティリティ機能として）
- **代替案（Phase 2で検討）**: 別クラス `DocumentExtractor` を作成し、単一責任原則に従う
- privateメソッド（`extractSectionFromFile`, `extractSectionWithCandidates`, `extractSection`, `extractSummaryFromIssue`）も同様に配置

**受け入れ基準**:
- Given: `GitHubClient.extractPhaseOutputs()` が呼び出される
- When: 各フェーズの成果物ファイルが存在する
- Then: 正しくセクションが抽出され、`Record<string, string>` 形式で返される
- And: ファイルが存在しない場合、フォールバックメッセージ（例: 「（実装詳細の記載なし）」）が返される

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

**NFR-001: API呼び出し回数の維持**

- **要件**: リファクタリング後も、GitHub API呼び出し回数は変更前と同一であること
- **測定方法**: 統合テストで API呼び出し回数をカウントし、変更前と比較
- **目標値**: 変更前と同一（増加なし）

**NFR-002: レスポンスタイムの維持**

- **要件**: 各メソッドのレスポンスタイムは、変更前と比較して **10%以内の差異** に収めること
- **測定方法**: ベンチマークテストで各メソッドの実行時間を測定
- **目標値**: 変更前の ±10%以内

### 3.2 セキュリティ要件

**NFR-003: 認証情報の保護**

- **要件**: GitHub トークンは、各クライアント内で平文保存されないこと
- **実装方法**: Octokit インスタンスを通じてのみ認証情報を使用
- **検証方法**: コードレビューで、トークンの直接保存がないことを確認

**NFR-004: エラーメッセージの安全性**

- **要件**: エラーメッセージに GitHub トークンや機密情報が含まれないこと
- **実装方法**: エラーメッセージ構築時、トークンや機密情報をマスキング
- **検証方法**: エラーケースのユニットテストで、エラーメッセージに機密情報が含まれないことを確認

### 3.3 可用性・信頼性要件

**NFR-005: 後方互換性の保証**

- **要件**: 既存のコード（`src/commands/init.ts`, `src/commands/execute.ts`, `src/phases/base-phase.ts`）が **無変更** で動作すること
- **測定方法**: 統合テストで既存のワークフロー全体を実行し、成功することを確認
- **目標値**: 100%の互換性（すべての既存テストがパス）

**NFR-006: テストカバレッジ**

- **要件**: 新規作成する各クライアントのテストカバレッジは **80%以上** であること
- **測定方法**: `npm run test:coverage` でカバレッジレポートを生成
- **目標値**: 各クライアント80%以上、全体で85%以上

### 3.4 保守性・拡張性要件

**NFR-007: コードの可読性**

- **要件**: 各モジュールは **200行以下** であること
- **測定方法**: コードレビューで各ファイルの行数を確認
- **目標値**:
  - `IssueClient`: 200行以下
  - `PullRequestClient`: 200行以下
  - `CommentClient`: 150行以下
  - `ReviewClient`: 180行以下
  - `GitHubClient`（ファサード）: 150行以下

**NFR-008: 単一責任原則の遵守**

- **要件**: 各クライアントは、単一の責務のみを持つこと
- **検証方法**: コードレビューで、各クライアントが複数の責務を持っていないことを確認
- **基準**:
  - IssueClient: Issue操作のみ
  - PullRequestClient: PR操作のみ
  - CommentClient: コメント操作のみ
  - ReviewClient: レビュー結果投稿のみ

**NFR-009: 拡張性**

- **要件**: 新しいGitHub API機能の追加時、既存のクライアントに影響を与えないこと
- **実装方法**: 各クライアントを疎結合に設計し、新機能は新規クラスとして追加
- **検証方法**: Phase 2（設計）で、拡張性を考慮したインターフェース設計を実施

---

## 4. 制約事項

### 4.1 技術的制約

**TC-001: TypeScript バージョン**

- TypeScript 5.x を使用すること
- ES Modules（ESM）形式でコードを記述すること

**TC-002: Octokit バージョン**

- 既存の `@octokit/rest` と `@octokit/request-error` パッケージを継続使用すること
- バージョン変更は行わないこと

**TC-003: ファイル配置**

- 新規モジュールは `src/core/github/` ディレクトリに配置すること
- 既存の `src/core/github-client.ts` は削除せず、ファサードとして残すこと

**TC-004: インターフェース互換性**

- 既存の `GitHubClient` のpublicメソッドシグネチャは **一切変更しない** こと
- 戻り値の型（`PullRequestResult`, `IssueCreationResult` 等）も変更しないこと

### 4.2 リソース制約

**RC-001: 見積もり工数**

- 総工数: 12~16時間
- Phase 4（実装）: 4~5時間
- Phase 5（テストコード実装）: 2~3時間
- Phase 6（テスト実行）: 0.5~1時間

**RC-002: スケジュール制約**

- Planning Phaseで策定された依存関係に従うこと:
  - Phase 1（要件定義）→ Phase 2（設計）→ Phase 4（実装）→ Phase 5（テストコード実装）→ Phase 6（テスト実行）

### 4.3 ポリシー制約

**PC-001: コーディング規約**

- CLAUDE.md に記載されたコーディングガイドラインに従うこと
- ESLint ルールに違反しないこと（`npx eslint --ext .ts src` でチェック）

**PC-002: Git コミットポリシー**

- 各フェーズ完了後、自動的に Git コミット＆プッシュされること（既存の動作を維持）
- コミットメッセージ形式: `[ai-workflow] Phase {number} ({name}) - {step} completed`

**PC-003: テストポリシー**

- すべてのユニットテストは Jest を使用すること
- テストファイルは `tests/unit/github/` ディレクトリに配置すること
- 統合テストは `tests/integration/` ディレクトリに配置すること

---

## 5. 前提条件

### 5.1 システム環境

**ENV-001: Node.js バージョン**

- Node.js 20 以上がインストールされていること

**ENV-002: npm バージョン**

- npm 10 以上がインストールされていること

**ENV-003: TypeScript ビルド環境**

- `npm run build` でエラーなくビルドできること
- `dist/` ディレクトリに正しくコンパイルされること

### 5.2 依存コンポーネント

**DEP-001: Octokit パッケージ**

- `@octokit/rest`: GitHub REST API クライアント
- `@octokit/request-error`: GitHub API エラーハンドリング

**DEP-002: 既存モジュール**

- `src/core/metadata-manager.ts`: メタデータ管理（`createOrUpdateProgressComment` で使用）
- `src/types.ts`: 型定義（`RemainingTask` 等）

### 5.3 外部システム連携

**EXT-001: GitHub API**

- GitHub REST API v3 が利用可能であること
- GitHub Token が有効であり、`repo`, `workflow`, `read:org` スコープを持つこと

**EXT-002: テスト環境**

- ユニットテストでは Octokit をモック化すること（実際のGitHub API呼び出しは行わない）
- 統合テストでは、テスト用リポジトリまたはモック環境を使用すること

---

## 6. 受け入れ基準

### 6.1 機能要件の受け入れ基準

**AC-001: IssueClient の動作確認**

- Given: IssueClient がインスタンス化されている
- When: 各メソッド（`getIssue`, `postComment`, `createIssueFromEvaluation` 等）を呼び出す
- Then: 既存の `GitHubClient` と同一の動作をする
- And: Octokit モックを使用したユニットテストがすべてパスする

**AC-002: PullRequestClient の動作確認**

- Given: PullRequestClient がインスタンス化されている
- When: PR作成、更新、クローズ操作を実行する
- Then: GitHub API が正しく呼び出され、期待される戻り値が返される
- And: 422エラー（既存PR存在）が適切にハンドリングされる

**AC-003: CommentClient の動作確認**

- Given: CommentClient がインスタンス化されている
- When: 進捗コメントを投稿・更新する
- Then: フォーマットされたコメントが正しく投稿される
- And: 既存コメントの更新が正しく機能する

**AC-004: ReviewClient の動作確認**

- Given: ReviewClient がインスタンス化されている
- When: レビュー結果を投稿する
- Then: フォーマットされたレビューコメントが正しく投稿される
- And: サジェスションリストが正しく表示される

**AC-005: ファサードの後方互換性**

- Given: 既存のコード（`src/commands/init.ts`, `src/commands/execute.ts`, `src/phases/base-phase.ts`）が変更されていない
- When: リファクタリング後のコードを実行する
- Then: すべての既存機能が正常に動作する
- And: 既存の統合テストがすべてパスする

### 6.2 非機能要件の受け入れ基準

**AC-006: 行数制約の遵守**

- Given: リファクタリングが完了している
- When: 各ファイルの行数を確認する
- Then: 以下の行数制約を満たしている:
  - `IssueClient`: 200行以下
  - `PullRequestClient`: 200行以下
  - `CommentClient`: 150行以下
  - `ReviewClient`: 180行以下
  - `GitHubClient`（ファサード）: 150行以下

**AC-007: テストカバレッジの達成**

- Given: テストコードが実装されている
- When: `npm run test:coverage` を実行する
- Then: 各クライアントのカバレッジが80%以上である
- And: 全体のカバレッジが85%以上である

**AC-008: エラーハンドリングの検証**

- Given: 各クライアントのユニットテストが実装されている
- When: エラーケース（401, 403, 422, RequestError）のテストを実行する
- Then: すべてのエラーケースで適切なエラーメッセージが返される
- And: 例外がスローされない（Result型で返される）

### 6.3 品質ゲートの受け入れ基準

**AC-009: Phase 1 品質ゲートの達成**

- [ ] **機能要件が明確に記載されている**: FR-001 〜 FR-008 がすべて具体的に記述されている
- [ ] **受け入れ基準が定義されている**: AC-001 〜 AC-008 がすべて Given-When-Then 形式で記述されている
- [ ] **スコープが明確である**: 機能要件とスコープ外事項が明確に分離されている
- [ ] **論理的な矛盾がない**: 各セクション間で矛盾がない（例: 非機能要件と制約事項が矛盾していない）

---

## 7. スコープ外

以下の事項は、本Issue（#24）のスコープ外とし、将来的な拡張候補として扱います：

### 7.1 スコープ外機能

**OUT-001: DocumentExtractor クラスの分離**

- `extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed` などのドキュメント関連メソッドを別クラス化することは、Phase 2（設計）で検討するが、Phase 4（実装）では実施しない
- **理由**: 行数制約（GitHubClient を150行以下に収める）が達成可能であれば、ファサード内に保持することで複雑性を抑える

**OUT-002: GitHub GraphQL API への移行**

- REST API から GraphQL API への移行は、本Issueのスコープ外
- **理由**: 後方互換性を維持しつつ、段階的にリファクタリングを進めることを優先

**OUT-003: GitHub Discussions, Projects 連携**

- Issue/PR 以外の GitHub 機能（Discussions, Projects, Packages 等）への対応は、本Issueのスコープ外
- **理由**: 現在の AI Workflow では使用していないため、優先度が低い

**OUT-004: リトライロジックの追加**

- GitHub API 呼び出し失敗時の自動リトライ機能は、本Issueのスコープ外
- **理由**: 既存の実装でリトライ機能がないため、新規追加は影響範囲が広い

### 7.2 将来的な拡張候補

**FUTURE-001: DocumentExtractor クラスの分離**

- 優先度: 中
- 条件: GitHubClient の行数が150行を超過する場合、または単一責任原則の観点から分離が望ましい場合
- 見積もり工数: 2~3時間

**FUTURE-002: GitHub GraphQL API への移行**

- 優先度: 低
- 条件: REST API のレート制限が問題になった場合、または複雑なクエリが必要になった場合
- 見積もり工数: 8~10時間

**FUTURE-003: キャッシング機能の追加**

- 優先度: 低
- 条件: GitHub API呼び出し回数が増加し、レート制限に抵触するリスクが高まった場合
- 見積もり工数: 4~6時間

---

## 8. 付録

### 8.1 用語集

| 用語 | 定義 |
|------|------|
| **ファサードパターン** | 複雑なサブシステムへの統一されたインターフェースを提供する設計パターン。本Issueでは、`GitHubClient` が各専門クライアント（IssueClient, PullRequestClient等）への統一インターフェースを提供する。 |
| **依存性注入（DI）** | オブジェクトの依存関係を外部から注入する設計パターン。本Issueでは、Octokitインスタンスをコンストラクタ注入により各クライアントに渡す。 |
| **単一責任原則（SRP）** | 1つのクラスは1つの責務のみを持つべきという原則。本Issueでは、各クライアントが1つの責務（Issue操作、PR操作等）のみを持つ。 |
| **Result型** | 処理結果（成功/失敗）とエラーメッセージを含むオブジェクト型。例: `{ success: boolean, error?: string }` |

### 8.2 参考資料

- **Planning Document**: `.ai-workflow/issue-24/00_planning/output/planning.md`
- **既存実装**: `src/core/github-client.ts` (702行)
- **CLAUDE.md**: プロジェクト全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **親Issue**: #1（AI Workflow 全体の親Issue）

### 8.3 リスク・軽減策マトリクス

| リスクID | リスク内容 | 影響度 | 確率 | 軽減策 |
|---------|----------|--------|------|--------|
| RISK-001 | Octokitインスタンス共有方法の誤り | 高 | 中 | Phase 2で依存性注入パターンを明確に設計。Phase 5でOctokit使用状況をテストで検証。 |
| RISK-002 | privateメソッド配置先の曖昧さ | 中 | 中 | Phase 1で配置先を決定（GitHubClient内部保持 vs DocumentExtractorクラス化）。推奨はGitHubClient内部保持。 |
| RISK-003 | 後方互換性の破壊 | 高 | 低 | Phase 5で既存呼び出し元との統合テストを実施。Phase 6で既存ワークフロー全体を手動実行。 |
| RISK-004 | テストカバレッジ不足 | 中 | 低 | Phase 5でカバレッジ目標（80%以上）を明確化。エラーハンドリングの境界値テストを網羅。 |
| RISK-005 | 行数制約（200行以下）の超過 | 低 | 中 | Phase 1で各クライアントのメソッド数を事前計算。Phase 4で定期的に行数確認。必要に応じてDocumentExtractorを別クラス化。 |

### 8.4 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-21 | 1.0 | 初版作成 | AI Workflow Agent |

---

**承認**:

- [ ] プロダクトオーナー承認
- [ ] テックリード承認
- [ ] QAリード承認

**次フェーズ**: Phase 2 (Design) - 詳細設計の作成

---

*本要件定義書は、AI Workflow Phase 1 (Requirements) で自動生成されました。*
