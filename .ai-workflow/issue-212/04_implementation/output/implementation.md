# 実装ログ - Issue #212

## 実装サマリー
- **実装戦略**: EXTEND（既存ロジックの抽出・再利用 + 新規コマンド追加）
- **変更ファイル数**: 2個
- **新規作成ファイル数**: 1個
- **実装行数**: 約515行（新規約480行、修正約35行）

## 変更ファイル一覧

### 新規作成
- `src/commands/cleanup.ts`: クリーンアップコマンドハンドラ（約480行）

### 修正
- `src/phases/cleanup/artifact-cleaner.ts`: `cleanupWorkflowLogs()` メソッドの引数拡張（約35行変更）
- `src/main.ts`: `cleanup` コマンドの登録（約15行追加）

## 実装詳細

### ファイル1: src/phases/cleanup/artifact-cleaner.ts
- **変更内容**:
  - `cleanupWorkflowLogs()` メソッドに `phaseRange?: PhaseName[]` 引数を追加
  - フェーズ範囲が指定されている場合は、指定されたフェーズのみを削除対象とする
  - フェーズ範囲未指定時は既存動作（phases 00-09 を削除）を維持
  - PhaseName → ディレクトリ名のマッピング（`phaseNameToDir`）を追加
  - ログメッセージに削除対象フェーズを明示
- **理由**:
  - 設計書の実装戦略（EXTEND）に従い、既存メソッドを拡張
  - 後方互換性を維持するため、引数はオプショナルに設定
  - Report Phase の自動クリーンアップ処理は変更なし
- **注意点**:
  - 既存呼び出し（引数なし）は既存動作を維持
  - `phaseRange` が空配列の場合も全フェーズを削除（既存動作と同じ）

### ファイル2: src/commands/cleanup.ts（新規作成）
- **変更内容**:
  - `handleCleanupCommand()`: エントリーポイント
  - `validateCleanupOptions()`: CLI引数のバリデーション
    - Issue番号チェック（数値、正の整数）
    - フェーズ範囲チェック（`--phases` 指定時）
    - Evaluation完了チェック（`--all` 使用時）
    - 排他制御（`--phases` と `--all` の同時指定を禁止）
  - `parsePhaseRange()`: フェーズ範囲文字列の解析
    - 数値範囲パターン（例: "0-4"）
    - フェーズ名リストパターン（例: "planning,requirements"）
    - 単一フェーズパターン（例: "planning"）
    - 範囲外エラー、逆順エラー、無効なフェーズ名エラーを処理
  - `executeCleanup()`: クリーンアップ実行
    - `--all` フラグ判定（完全クリーンアップ）
    - 通常クリーンアップ（フェーズ範囲指定またはデフォルト）
    - Git コミット＆プッシュ（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs (manual cleanup)`）
  - `previewCleanup()`: ドライランモードでプレビュー表示
    - 削除対象ファイルのスキャン
    - ファイルリスト表示（最大20件）
    - 合計ファイル数と合計サイズの表示
  - `scanTargetFiles()`: 削除対象ファイルをスキャン
  - `scanDirectoryRecursive()`: ディレクトリを再帰的にスキャン
- **理由**:
  - 設計書の詳細設計に従って実装
  - 既存の `rollback.ts` のコーディングスタイルを参考に統一
  - エラーハンドリングユーティリティ（`getErrorMessage()`）を使用
  - 統一loggerモジュール（`logger`）を使用（`console.log` は使用しない）
  - 環境変数アクセスは `config` クラス経由
- **注意点**:
  - `--phases` と `--all` の同時指定は禁止（バリデーションエラー）
  - `--all` 使用時は Evaluation Phase が完了していることを確認
  - Git コミットメッセージは `report` フェーズ用（通常クリーンアップ）と `evaluation` フェーズ用（完全クリーンアップ）で区別

### ファイル3: src/main.ts
- **変更内容**:
  - `handleCleanupCommand` のインポート追加
  - `cleanup` コマンドの定義（約15行追加）
    - 4つのCLIオプション: `--issue`, `--dry-run`, `--phases`, `--all`
    - コマンド説明: "Clean up workflow execution logs manually"
    - エラーハンドリング（`reportFatalError` 呼び出し）
- **理由**:
  - 設計書の CLI統合セクションに従って実装
  - 既存のコマンド登録パターン（`rollback`, `auto-issue` 等）を踏襲
- **注意点**:
  - `--issue` は必須オプション（`requiredOption`）
  - 他のオプションはすべてオプショナル

## 設計書との整合性確認

### ✅ 実装戦略（EXTEND）に準拠
- 既存の `ArtifactCleaner` クラスの `cleanupWorkflowLogs()` メソッドを拡張
- 新規コマンド `src/commands/cleanup.ts` を追加
- `src/main.ts` に `cleanup` コマンドを登録
- Report Phase の自動クリーンアップ処理は変更なし（後方互換性維持）

### ✅ 設計書の「詳細設計」セクションに準拠
- CLI引数インターフェース（`CleanupCommandOptions`）を実装
- 5つの主要関数を実装:
  1. `handleCleanupCommand()`: エントリーポイント
  2. `validateCleanupOptions()`: バリデーション
  3. `parsePhaseRange()`: フェーズ範囲解析
  4. `executeCleanup()`: クリーンアップ実行
  5. `previewCleanup()`: ドライランプレビュー
- データ構造設計に従った型定義（`CleanupCommandOptions`）

### ✅ セキュリティ考慮事項に準拠
- パストラバーサル防止: `ArtifactCleaner.validatePath()` を再利用（自動的に実行）
- シンボリックリンク防止: `ArtifactCleaner.isSymbolicLink()` を再利用（自動的に実行）
- CLI引数サニタイズ: `validateCleanupOptions()` でバリデーション実施

### ✅ 非機能要件に準拠
- **パフォーマンス**: `fs.promises.rm()` ではなく `fs.removeSync()` を使用（既存の `ArtifactCleaner` に合わせる）
- **保守性**: 統一loggerモジュール（`logger`）を使用、`console.log` は使用しない
- **環境変数アクセス**: `config` クラス経由（`config.isCI()`）
- **エラーハンドリング**: `getErrorMessage()` を使用（`as Error` 型アサーションは使用しない）

### ✅ コーディング規約に準拠
- ESLintルール `no-console` を遵守（`console.log` 不使用）
- TypeScript 厳格な型チェックを維持
- 既存のコーディングスタイル（`rollback.ts`）を踏襲

## 実装時の設計判断

### 判断1: Git コミットメッセージの区別
- **決定**: 通常クリーンアップは `report` フェーズ用、完全クリーンアップは `evaluation` フェーズ用のコミットメッセージを使用
- **理由**: 既存の `commitCleanupLogs()` メソッドは `phase` 引数で区別されるため、適切な引数を渡す
- **影響**: Git履歴でクリーンアップの種類を区別可能

### 判断2: ドライランモードのファイルスキャン実装
- **決定**: `scanTargetFiles()` と `scanDirectoryRecursive()` を実装し、削除対象ファイルを事前にスキャン
- **理由**: 設計書の `previewCleanup()` 仕様に従い、ユーザーに削除対象を明示するため
- **影響**: ドライランモードで詳細なプレビューが可能

### 判断3: parsePhaseRange() のエクスポート
- **決定**: `parsePhaseRange()` を `export` として公開
- **理由**: 後続の Phase 5（test_implementation）でユニットテストを実装するため
- **影響**: テスト容易性の向上

### 判断4: フェーズ範囲未指定時の動作
- **決定**: `phaseRange` が `undefined` の場合は全フェーズを削除（既存動作と同じ）
- **理由**: 後方互換性の維持、デフォルト動作は既存と同じにする
- **影響**: Report Phase の自動クリーンアップは変更不要

## 次のステップ

- **Phase 5（test_implementation）**: テストコードの実装
  - `tests/unit/commands/cleanup.test.ts` の作成
  - `tests/integration/cleanup-command.test.ts` の作成
  - テストカバレッジ目標: 90%以上

- **Phase 6（testing）**: テストの実行
  - ユニットテスト実行（`npm run test:unit`）
  - インテグレーションテスト実行（`npm run test:integration`）
  - カバレッジ確認

## 品質ゲート確認（Phase 4）

実装は以下の品質ゲートを満たしています：

- ✅ **Phase 2の設計に沿った実装である**
  - 設計書の「詳細設計」セクションに従って実装
  - 実装戦略（EXTEND）に準拠
  - セキュリティ考慮事項に準拠

- ✅ **既存コードの規約に準拠している**
  - ESLintルール `no-console` を遵守
  - 統一loggerモジュール（`logger`）を使用
  - エラーハンドリングユーティリティ（`getErrorMessage()`）を使用
  - 環境変数アクセスは `config` クラス経由
  - 既存のコーディングスタイル（`rollback.ts`）を踏襲

- ✅ **基本的なエラーハンドリングがある**
  - `validateCleanupOptions()` でCLI引数のバリデーション
  - `parsePhaseRange()` でフェーズ範囲の解析エラーを処理
  - `executeCleanup()` でGit操作失敗時のエラーハンドリング
  - すべての例外は適切なエラーメッセージで報告

- ✅ **明らかなバグがない**
  - 後方互換性を維持（既存の `cleanupWorkflowLogs()` 呼び出しは影響なし）
  - 排他制御（`--phases` と `--all` の同時指定を禁止）
  - Evaluation完了チェック（`--all` 使用時）
  - フェーズ範囲の検証（0-9の範囲内、逆順エラー、無効なフェーズ名エラー）

**注意**: テストコードの実装は Phase 5（test_implementation）で行います。Phase 4では実コードのみを実装しました。

---

**作成日**: 2025-12-04
**実装者**: AI Agent (Claude)
**実装戦略**: EXTEND
**実装完了**: Phase 4 完了、Phase 5（test_implementation）へ移行可能
