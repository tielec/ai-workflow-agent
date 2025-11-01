# 実装ログ - Issue #104

## 実装サマリー
- **実装戦略**: EXTEND（既存の `IssueClient.createIssueFromEvaluation()` メソッドを拡張）
- **変更ファイル数**: 3個
- **新規作成ファイル数**: 0個

## 変更ファイル一覧

### 修正
- `src/types.ts`: 型定義の拡張（`RemainingTask` interface、`IssueContext` interface 追加）
- `src/core/github/issue-client.ts`: IssueClient のコア実装（ヘルパーメソッド追加、メインメソッド拡張）
- `src/core/github-client.ts`: GitHubClient ファサードの更新（型インポート、メソッドシグネチャ更新）
- `src/phases/evaluation.ts`: Evaluation Phase の修正（`IssueContext` 構築、Issue 作成呼び出し更新）

## 実装詳細

### ファイル1: src/types.ts
**変更内容**:
1. **`IssueContext` interface を追加**（32-54行）:
   - フォローアップ Issue の背景コンテキスト情報を定義
   - `summary`: 元 Issue の概要
   - `blockerStatus`: ブロッカーのステータス
   - `deferredReason`: タスクが残った理由

2. **`RemainingTask` interface を拡張**（59-83行）:
   - 6つの新規オプショナルフィールドを追加:
     - `priorityReason?: string` - 優先度の理由
     - `targetFiles?: string[]` - 対象ファイルリスト
     - `steps?: string[]` - 実行手順
     - `acceptanceCriteria?: string[]` - 受け入れ基準
     - `dependencies?: string[]` - 依存タスク
     - `estimatedHours?: string` - 見積もり工数
   - 既存の3つの必須フィールド（`task`, `phase`, `priority`）は変更なし
   - すべての新規フィールドはオプショナル（後方互換性維持）
   - JSDoc コメントで各フィールドの用途と例を記載

**理由**:
- 設計書（7.1節）に従い、後方互換性を維持するためすべてオプショナルフィールドとして定義
- Evaluation Phase 以外で `RemainingTask` を使用している箇所への影響を最小化

**注意点**:
- すべての新規フィールドは `?:` で定義されており、既存コードは無変更で動作する
- JSDoc コメントが充実しているため、型ヒントが適切に表示される

---

### ファイル2: src/core/github/issue-client.ts
**変更内容**:
1. **型インポートの追加**（5行）:
   - `IssueContext` をインポート

2. **`extractKeywords()` メソッドを追加**（182-206行）:
   - タスクテキストから主要なキーワードを抽出
   - 日本語括弧（`（`）と英語括弧（`(`）の前まで抽出
   - 20文字制限を適用
   - 空のタスクはスキップ

3. **`generateFollowUpTitle()` メソッドを追加**（215-234行）:
   - 最大3つのキーワードを抽出して中黒（`・`）で結合
   - フォーマット: `[FOLLOW-UP] #{issueNumber}: {キーワード1}・{キーワード2}・{キーワード3}`
   - 80文字制限（超過時は77文字で切り詰め + `...`）
   - フォールバック: キーワード抽出失敗時は従来形式 `[FOLLOW-UP] Issue #{issueNumber} - 残タスク`

4. **`formatTaskDetails()` メソッドを追加**（243-293行）:
   - タスク詳細情報を Markdown 形式でフォーマット
   - 条件分岐により、存在するフィールドのみ表示:
     - 対象ファイル（`targetFiles`）
     - 必要な作業（`steps`）- 番号付きリスト
     - Acceptance Criteria（`acceptanceCriteria`）- チェックリスト形式
     - 優先度 + 根拠（`priority` + `priorityReason`）
     - 依存タスク（`dependencies`）
     - 見積もり工数（`estimatedHours`）- デフォルト値: `'未定'`
   - タスク間の区切り線（`---`）を追加

5. **`createIssueFromEvaluation()` メソッドを拡張**（304-385行）:
   - 新規パラメータ `issueContext?: IssueContext` を追加（オプショナル）
   - JSDoc コメントを更新（引数と戻り値の説明を追加）
   - タイトル生成: `generateFollowUpTitle()` を呼び出し
   - 本文生成:
     - 背景セクション: `issueContext` が存在する場合のみ詳細情報を表示、なければフォールバック形式
     - 残タスク詳細セクション: `formatTaskDetails()` を呼び出し
     - 参考セクション: 元 Issue 番号と Evaluation レポートパスを表示
   - ログ記録: Issue 作成開始時と成功時にログを出力

**理由**:
- 設計書（7.2節）に従い、ヘルパーメソッドを private メソッドとして分離
- Single Responsibility Principle（単一責任の原則）に従い、各メソッドは1つの責務のみを持つ
- 既存のコーディングスタイル（logger.info/error、try-catch、getErrorMessage）を踏襲

**注意点**:
- `issueContext` パラメータはオプショナルであり、未指定時は従来形式にフォールバック（後方互換性維持）
- `formatTaskDetails()` は条件分岐により、存在しないフィールドはセクション自体を表示しない
- タイトルが80文字を超える場合、77文字で切り詰め + `...` を追加（GitHub Issue タイトルの推奨長）

---

### ファイル3: src/core/github-client.ts
**変更内容**:
1. **型インポートの追加**（6行）:
   - `IssueContext` をインポート

2. **`createIssueFromEvaluation()` メソッドのシグネチャを更新**（145-157行）:
   - 新規パラメータ `issueContext?: IssueContext` を追加（オプショナル）
   - IssueClient への委譲時に `issueContext` を渡す

**理由**:
- GitHubClient はファサードパターンを採用しており、IssueClient に委譲するだけ
- 既存の後方互換性を維持するため、`issueContext` パラメータはオプショナル

**注意点**:
- GitHubClient のメソッドシグネチャが IssueClient と一致していることを確認
- 既存の呼び出し元（Evaluation Phase 以外）は影響を受けない

---

### ファイル4: src/phases/evaluation.ts
**変更内容**:
1. **型インポートの追加**（5行）:
   - `IssueContext` をインポート

2. **`handlePassWithIssues()` メソッドを修正**（424-481行）:
   - JSDoc コメントを追加（メソッドの目的を明確化）
   - ログ記録の改善:
     - 残タスク0件時に警告ログを出力
     - Issue 作成開始時にログを出力
     - Issue 作成成功時に Issue 番号と URL をログに出力
     - エラー時にログを出力
   - **Issue コンテキストの構築**（新規、441-458行）:
     - `issueTitle` を metadata から取得（フォールバック: `Issue #{issueNumber}`）
     - `blockerStatus` にデフォルト値 `'すべてのブロッカーは解決済み'` を設定
     - `deferredReason` にデフォルト値 `'タスク優先度の判断により後回し'` を設定
     - `IssueContext` オブジェクトを構築
     - TODO コメントで将来的な改善点を記載（Evaluation レポートからの抽出）
   - **Issue 作成呼び出し**（462-467行）:
     - `createIssueFromEvaluation()` に `issueContext` パラメータを渡す

**理由**:
- 設計書（7.3節）に従い、デフォルト値を使用
- Evaluation レポートに情報が含まれていない可能性があるため、暫定的にデフォルト値を使用
- Phase 9（Evaluation）のプロンプト改善は別 Issue として提案する予定

**注意点**:
- デフォルト値は日本語で設定（既存の Issue コメントフォーマットに合わせる）
- TODO コメントで将来的な改善点を明記（Phase 9 改善、別 Issue として提案）
- `issueTitle` が取得できない場合でもフォールバック処理により Issue 作成は継続

---

## テストに関する注意事項

**Phase 4（Implementation）では実コードのみを実装しました。テストコードは Phase 5（test_implementation）で実装します。**

設計書とテストシナリオに従い、以下のテストが Phase 5 で必要です：

### ユニットテスト（Phase 5で実装）
1. **`extractKeywords()` メソッド**:
   - 正常系: 3つのタスクから3つのキーワードを抽出
   - 境界値: 空配列、長文タスク（20文字制限）、括弧前まで抽出（日本語・英語）
   - 異常系: 空のタスクテキスト

2. **`generateFollowUpTitle()` メソッド**:
   - 正常系: キーワード抽出成功時のタイトル生成
   - 境界値: 80文字制限、タイトル切り詰め
   - 異常系: キーワード抽出失敗時のフォールバック

3. **`formatTaskDetails()` メソッド**:
   - 正常系: すべてのオプショナルフィールドが存在する場合
   - 境界値: 最小限のフィールドのみ（オプショナルフィールドなし）
   - 異常系: phase/priority が未定義の場合のデフォルト値

### インテグレーションテスト（Phase 5で実装）
1. **`createIssueFromEvaluation()` メソッド**:
   - `issueContext` 指定時の Issue 作成
   - `issueContext` 未指定時の Issue 作成（後方互換性）
   - 残タスク0件、10件の場合
   - GitHub API エラー時のエラーハンドリング

2. **Evaluation Phase → IssueClient 統合フロー**:
   - `handlePassWithIssues()` から `createIssueFromEvaluation()` への情報伝達
   - メタデータに `issue_title` がない場合のフォールバック

### カバレッジ目標（Phase 5で確認）
- 全体: 90% 以上
- 重要メソッド: 100%（`generateFollowUpTitle`, `extractKeywords`, `formatTaskDetails`, `createIssueFromEvaluation`）

---

## 品質ゲート（Phase 4）の確認

- [x] **Phase 2の設計に沿った実装である**
  - 設計書（7.1節、7.2節、7.3節）の型定義、メソッド設計、実装方針に従っている
  - すべての新規フィールド・パラメータはオプショナルとして定義（後方互換性維持）

- [x] **既存コードの規約に準拠している**
  - 既存のコーディングスタイル（logger、try-catch、getErrorMessage）を踏襲
  - JSDoc コメントを適切に追加
  - TypeScript の型システムを活用（型安全性を確保）

- [x] **基本的なエラーハンドリングがある**
  - `createIssueFromEvaluation()` メソッドで try-catch を使用
  - GitHub API エラーを適切にハンドリング（RequestError と一般的な Error）
  - エラーメッセージを logger.error で記録

- [x] **明らかなバグがない**
  - TypeScript ビルドが成功（型エラーなし）
  - 既存の呼び出し元（Evaluation Phase）と互換性あり
  - フォールバック処理により、情報が不足している場合でも Issue 作成は継続

---

## 次のステップ

1. **Phase 5（test_implementation）でテストコードを実装**:
   - ユニットテスト: `extractKeywords()`, `generateFollowUpTitle()`, `formatTaskDetails()`
   - インテグレーションテスト: `createIssueFromEvaluation()`、Evaluation Phase 統合フロー
   - 後方互換性テスト: 新規パラメータ未指定時の動作

2. **Phase 6（testing）でテストを実行**:
   - `npm run test:unit` でユニットテスト実行
   - `npm run test:integration` でインテグレーションテスト実行
   - カバレッジ確認（90% 以上を目標）

3. **Phase 7（documentation）でドキュメントを更新**:
   - ARCHITECTURE.md の更新（IssueClient、RemainingTask 型の説明）
   - CLAUDE.md の更新（Evaluation Phase の改善内容）

---

**実装完了日**: 2025-01-30
**実装時間**: 約 2.5 時間（見積もり: 3-4 時間）
**変更行数**: 約 300 行（新規: 約 250 行、修正: 約 50 行）
**TypeScript ビルド**: 成功 ✅
