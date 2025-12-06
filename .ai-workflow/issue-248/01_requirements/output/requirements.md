# 要件定義書

## Issue概要

- **Issue番号**: #248
- **タイトル**: preset実行時にフェーズステータスがin_progressのまま完了しない
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/248
- **作成日**: 2025-01-30

## 0. Planning Documentの確認

Planning Document (`@.ai-workflow/issue-248/00_planning/output/planning.md`) で策定された開発計画を確認しました。

**実装戦略**: EXTEND
- 既存のフェーズ実行フロー（PhaseRunner、ReviewCycleManager）を拡張する形での修正が中心
- 新規ファイル・クラスの作成は不要
- 既存のエラーハンドリングとステータス更新ロジックの改善

**テスト戦略**: UNIT_INTEGRATION
- ユニットテスト: 個別のエラーハンドリングロジック、ステータス更新ロジックの検証
- 統合テスト: preset実行時のエンドツーエンド動作検証（最も重要）

**見積もり工数**: 8~12時間

**リスクレベル**: 中

## 1. 概要

### 背景

AI Workflow Agent では、preset（例: `review-design`）を使用して複数フェーズを連続実行できる機能がある。しかし、preset実行時に最後のフェーズ（例: design）のステータスが `metadata.json` で `in_progress` のまま `completed` に更新されない不具合が報告されている。

この問題は、ワークフローの状態管理の信頼性に影響を与え、以下の問題を引き起こす：
- 再実行時に正しいフェーズから再開できない
- Issue のステータス追跡ができない
- ワークフロー全体の完了判定が不正確になる

### 目的

preset実行時にフェーズステータスが確実に `completed` または `failed` に更新されるようにし、ワークフロー状態管理の信頼性を向上させる。

### ビジネス価値

- **信頼性向上**: ワークフロー実行の成功/失敗を正確に追跡可能
- **運用効率化**: 不正なステータスによる手動介入の削減
- **再実行の正確性**: resume機能が正しく動作し、無駄な再実行を防止

### 技術的価値

- **メタデータ管理の堅牢性向上**: 状態遷移の確実性を保証
- **エラーハンドリングの改善**: 例外発生時の適切な状態管理
- **テスタビリティ向上**: 統合テストによる回帰防止

## 2. 機能要件

### FR-1: フェーズステータスの確実な更新（優先度: 高）

**要件**: preset実行時、各フェーズが正常に完了した場合、`metadata.json` のフェーズステータスを `completed` に更新する。

**詳細**:
- `PhaseRunner.finalizePhase()` メソッドで、フェーズ完了時に `MetadataManager.updatePhaseStatus('completed')` を確実に呼び出す
- 最後のフェーズも含め、すべてのフェーズで同じロジックを適用
- ステータス更新は、Git操作や進捗投稿の成功/失敗に関わらず実行される

**受け入れ基準**:
- **Given**: preset `review-design` を実行
- **When**: planning、requirements、design フェーズがすべて正常に完了
- **Then**: `metadata.json` で `phases.planning.status`、`phases.requirements.status`、`phases.design.status` がすべて `"completed"` になる

### FR-2: エラー時のフェーズステータス更新（優先度: 高）

**要件**: フェーズ実行中に例外が発生した場合、`metadata.json` のフェーズステータスを `failed` に更新する。

**詳細**:
- `PhaseRunner.handlePhaseError()` メソッドで、例外発生時に `MetadataManager.updatePhaseStatus('failed')` を確実に呼び出す
- `handlePhaseError()` 内でさらに例外が発生しても、ステータス更新は try-catch-finally で保護される
- エラー詳細（エラーメッセージ、スタックトレース）もメタデータに記録

**受け入れ基準**:
- **Given**: design フェーズ実行中
- **When**: execute/review/revise ステップのいずれかで例外が発生
- **Then**: `metadata.json` で `phases.design.status` が `"failed"` に更新され、エラー詳細が記録される

### FR-3: レビュー失敗時のステータス更新（優先度: 高）

**要件**: レビュー結果が FAIL の場合、最大リトライ回数（3回）を超えた時点で、フェーズステータスを `failed` に更新する。

**詳細**:
- `ReviewCycleManager.performReviseStepWithRetry()` メソッドで、最大リトライ回数を超えた場合に例外をスロー
- PhaseRunner がこの例外をキャッチし、`handlePhaseError()` でステータスを `failed` に更新
- Issue #243（レビュー結果の誤認問題）の修正が前提条件

**受け入れ基準**:
- **Given**: design フェーズのレビューが FAIL
- **When**: revise を3回実行してもレビューが PASS にならない
- **Then**: `metadata.json` で `phases.design.status` が `"failed"` に更新される

### FR-4: ステータス遷移のバリデーション（優先度: 中）

**要件**: `MetadataManager.updatePhaseStatus()` メソッドで、不正なステータス遷移を検出してログ出力する。

**詳細**:
- 許可される遷移: `pending` → `in_progress` → `completed`/`failed`
- 不正な遷移（例: `completed` → `in_progress`）が発生した場合、WARNING ログを出力
- 不正な遷移でもステータス更新は実行される（エラーにはしない）

**受け入れ基準**:
- **Given**: あるフェーズのステータスが `"completed"`
- **When**: 同じフェーズを `updatePhaseStatus('in_progress')` で更新しようとする
- **Then**: WARNING ログが出力され、ステータスは `"in_progress"` に更新される

### FR-5: ステータス更新の冪等性確保（優先度: 中）

**要件**: 同じステータスへの重複更新を検出し、不要な更新をスキップする。

**詳細**:
- `MetadataManager.updatePhaseStatus()` メソッドで、現在のステータスと新しいステータスを比較
- 同じステータスの場合は INFO ログを出力して早期リターン
- メタデータファイルへの書き込み回数を削減

**受け入れ基準**:
- **Given**: design フェーズのステータスが `"completed"`
- **When**: `updatePhaseStatus('completed')` を再度呼び出す
- **Then**: INFO ログ「Status already set to 'completed', skipping update」が出力され、ファイル更新はスキップされる

### FR-6: finally ブロックでのステータス更新保証（優先度: 高）

**要件**: `PhaseRunner.runPhase()` メソッドの try-catch-finally ブロックで、ステータス更新を確実に実行する。

**詳細**:
- `runPhase()` メソッドの finally ブロックで、ステータスが `in_progress` のままの場合にエラーログを出力
- ステータス更新漏れを早期検出
- finally ブロック自体の例外は catch してログ出力

**受け入れ基準**:
- **Given**: design フェーズ実行中
- **When**: `finalizePhase()` が呼ばれずに `runPhase()` が終了
- **Then**: ERROR ログ「Phase status is still 'in_progress' after execution」が出力される

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **メタデータ更新の応答時間**: 100ms 以内（通常のSSD環境）
- **ステータス遷移バリデーション**: 追加オーバーヘッド < 10ms
- **ログ出力**: 非同期ログ機構により実行速度への影響を最小化

### NFR-2: 信頼性要件

- **ステータス更新の成功率**: 99.9%（メタデータファイル書き込み失敗時も retry）
- **例外発生時の状態管理**: すべての例外パスで適切なステータス更新を保証
- **冪等性**: 同じステータス更新を複数回実行しても、最終的な状態が一貫している

### NFR-3: 保守性・拡張性要件

- **既存コードへの影響**: 最小限（EXTEND 戦略）
- **テストカバレッジ**: 変更部分のコードカバレッジ 80% 以上
- **ログの可読性**: ステータス遷移のログが明確で、トラブルシューティングが容易

### NFR-4: セキュリティ要件

- **メタデータファイルの保護**: ファイルパーミッションは 644（所有者のみ書き込み可能）
- **ログのサニタイズ**: 機密情報（APIキー等）をログに出力しない

## 4. 制約事項

### 技術的制約

- **既存アーキテクチャの維持**: BasePhase、PhaseRunner、ReviewCycleManager、MetadataManager の既存設計を維持
- **後方互換性**: 既存の metadata.json スキーマを変更しない
- **TypeScript**: TypeScript 5.x + ESM の既存環境に準拠
- **依存ライブラリ**: 新規の外部依存は追加しない

### リソース制約

- **開発期間**: 8~12時間（Planning Document の見積もり）
- **テスト時間**: 1.5~2.5時間（ユニットテスト + 統合テスト）
- **レビュー時間**: 実装完了後の品質ゲートレビュー

### ポリシー制約

- **コーディング規約**: 既存のESLintルール（`@typescript-eslint/recommended`）に準拠
- **エラーハンドリング規約**: `error-utils.ts` の `getErrorMessage()` を使用（`as Error` 禁止）
- **ロギング規約**: `logger.ts` の統一loggerモジュールを使用（`console.log` 禁止）
- **環境変数アクセス規約**: `config.ts` の Config クラスを使用（`process.env` 直接アクセス禁止）

## 5. 前提条件

### システム環境

- **Node.js**: 20.x 以上
- **npm**: 10.x 以上
- **OS**: Linux、macOS、Windows（Jenkins Docker環境含む）

### 依存コンポーネント

- **PhaseRunner** (`src/phases/lifecycle/phase-runner.ts`): フェーズライフサイクル管理
- **ReviewCycleManager** (`src/phases/core/review-cycle-manager.ts`): レビューサイクル管理
- **MetadataManager** (`src/core/metadata-manager.ts`): メタデータ状態管理
- **BasePhase** (`src/phases/base-phase.ts`): フェーズ基底クラス

### 前提Issue

- **Issue #243**: レビュー結果の誤認問題が修正済みであること
  - レビュー結果が FAIL の場合、正しく検出される
  - revise が適切に実行される

## 6. 受け入れ基準

### AC-1: preset実行時の正常系動作

- **Given**: Issue #248 の修正が適用された環境
- **When**: preset `review-design` を実行し、すべてのフェーズが正常に完了
- **Then**:
  - `metadata.json` で `phases.planning.status` が `"completed"`
  - `metadata.json` で `phases.requirements.status` が `"completed"`
  - `metadata.json` で `phases.design.status` が `"completed"`
  - ログに「Phase X (name) completed successfully」が出力される

### AC-2: エラー発生時のステータス更新

- **Given**: design フェーズ実行中
- **When**: execute ステップで例外が発生
- **Then**:
  - `metadata.json` で `phases.design.status` が `"failed"`
  - エラー詳細（message、stack）がメタデータに記録される
  - ERROR ログが出力される

### AC-3: レビュー失敗時のステータス更新

- **Given**: design フェーズのレビューが FAIL
- **When**: revise を3回実行してもレビューが PASS にならない
- **Then**:
  - `metadata.json` で `phases.design.status` が `"failed"`
  - `phases.design.retry_count` が 3 になる
  - ERROR ログ「Max retry count exceeded」が出力される

### AC-4: ステータス遷移バリデーション

- **Given**: design フェーズのステータスが `"completed"`
- **When**: `updatePhaseStatus('in_progress')` を呼び出す
- **Then**:
  - WARNING ログ「Invalid status transition: completed -> in_progress」が出力される
  - ステータスは `"in_progress"` に更新される（エラーにはならない）

### AC-5: ステータス更新の冪等性

- **Given**: design フェーズのステータスが `"completed"`
- **When**: `updatePhaseStatus('completed')` を再度呼び出す
- **Then**:
  - INFO ログ「Status already set to 'completed', skipping update」が出力される
  - `metadata.json` への書き込みはスキップされる

### AC-6: 統合テスト（preset実行）

- **Given**: テスト用のリポジトリ環境
- **When**: 統合テスト `tests/integration/preset-workflow.test.ts` を実行
- **Then**:
  - preset `review-design` の正常系テストがパス
  - エラー発生時のフェールバックテストがパス
  - すべてのステータス検証がパス

### AC-7: ユニットテスト（MetadataManager）

- **Given**: MetadataManager のユニットテスト
- **When**: `updatePhaseStatus()` のテストを実行
- **Then**:
  - ステータス遷移バリデーションのテストがパス
  - 冪等性のテストがパス
  - 境界値テスト（不正なステータス値）がパス

## 7. スコープ外

以下の項目は、本Issueのスコープ外とする：

### 7.1. 将来的な拡張候補

- **Issue #243の修正**: 別Issueで対応済み（本Issueは #243 の修正が前提）
- **メタデータスキーマの変更**: 既存スキーマを維持し、新規フィールドは追加しない
- **ステータス遷移の厳格化**: 不正な遷移をエラーにする（現状は WARNING ログのみ）
- **ロック機構の導入**: 並行実行時の競合対策（現状は単一ワークフローのみ対象）

### 7.2. 明確にスコープ外とする事項

- **単一フェーズ実行（`--phase <name>`）の動作**: preset実行のみが対象
- **全フェーズ実行（`--phase all`）の動作**: preset実行のみが対象
- **Phase 4-9 の個別動作**: Planning、Requirements、Design フェーズに焦点
- **Jenkins環境固有の問題**: ローカル環境での再現を優先

## 8. 参照情報

### 関連Issue

- **Issue #243**: レビュー結果がFAILでもreviseが実行されず後続フェーズに進んでしまうバグ
- **Issue #245**: preset実行時にContextBuilderの相対パス解決がWORKSPACEを基準に計算される

### 参照ドキュメント

- **@CLAUDE.md**: プロジェクト全体方針、コーディング規約
- **@ARCHITECTURE.md**: Phase実行フロー、メタデータ管理アーキテクチャ
- **Planning Document**: `.ai-workflow/issue-248/00_planning/output/planning.md`

### 主要ソースファイル

- `src/phases/lifecycle/phase-runner.ts`: フェーズライフサイクル管理（244行）
- `src/phases/core/review-cycle-manager.ts`: レビューサイクル管理（130行）
- `src/core/metadata-manager.ts`: メタデータ状態管理（347行）
- `src/phases/base-phase.ts`: フェーズ基底クラス（476行）

## 9. リスク分析

### 高リスク項目

- **Issue #243の修正が未完了**: 本Issueの修正が依存する前提条件
  - **軽減策**: Issue #243の進捗を確認し、必要に応じて統合

- **メタデータ状態管理の破壊的変更**: 既存の状態遷移パスを破壊
  - **軽減策**: 段階的なリファクタリング、統合テストで既存動作を保証

### 中リスク項目

- **非同期処理の競合**: Git操作とメタデータ更新の順序が不明確
  - **軽減策**: finally ブロックでの確実なクリーンアップ

- **テストの不足**: preset実行のエンドツーエンドテストが不十分
  - **軽減策**: 統合テスト `preset-workflow.test.ts` を必須化

### 低リスク項目

- **根本原因の見逃し**: 複数の原因候補が存在
  - **軽減策**: 段階的なデバッグログ追加、Jenkins実行ログの詳細分析

## 10. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-30 | 初版作成 | AI Workflow Agent |

---

**要件定義書バージョン**: 1.0
**作成日**: 2025-01-30
**Planning Document参照**: @.ai-workflow/issue-248/00_planning/output/planning.md
