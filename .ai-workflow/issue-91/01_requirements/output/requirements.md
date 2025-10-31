# 要件定義書 - Issue #91

**Issue番号**: #91
**タイトル**: [FOLLOW-UP] Issue #49 - 残タスク
**作成日**: 2025-01-30
**バージョン**: 1.0
**ステータス**: Draft

---

## 0. Planning Documentの確認

Planning Document (`.ai-workflow/issue-91/00_planning/output/planning.md`) を確認しました。以下の開発計画が策定されています：

### 開発計画の全体像
- **複雑度**: 中程度（既存テストコードの修正が中心、新規設計不要）
- **見積もり工数**: 12-16時間
- **実装戦略**: EXTEND（既存テストファイル拡張）
- **テスト戦略**: UNIT_ONLY（ユニットテスト修正・追加のみ）
- **プロジェクトタイプ**: テストインフラ改善（フォローアップ）

### スコープ
- Issue #49のBasePhaseモジュール分解リファクタリングで残った15個のテスト失敗の修正
- カバレッジ向上（60-87% → 90%+）
- パフォーマンスベンチマーク（±5%閾値検証）

### 技術選定
- 既存テストフレームワーク（Jest）利用
- 既存mockライブラリ（jest-mock-extended）利用
- プロダクションコード変更なし

### リスクとスケジュール
- **技術的リスク**: 低（根本原因特定済み、修正手順文書化済み）
- **スコープリスク**: 低（明確なタスクリスト、優先度明確）
- **リソースリスク**: 低（既存ツール利用、新規スキル不要）

この開発計画を踏まえて、以下の要件定義を実施します。

---

## 1. 概要

### 1.1 背景

Issue #49「BasePhase Module Decomposition Refactoring」は、BasePhaseクラスの1420行を676行へリファクタリングし、アーキテクチャ設計とプロダクションコード実装に成功しました。しかし、Evaluation Phase（Phase 9）で実施された品質検証により、以下の問題が判明しました：

- **テスト失敗**: 15個のテスト失敗（30.6%失敗率、49テスト中15失敗）
- **カバレッジ未達**: 90%カバレッジ目標に対して60-87%達成（モジュール別）
- **パフォーマンス検証未実施**: AC-8（実行時間±5%）の検証が未完了

これらの問題により、Issue #49のマージが保留されています。本Issueは、これらの残タスクを完了させ、Issue #49を完全完了状態にすることを目的とします。

### 1.2 目的

1. **品質保証ギャップの解消**: 15個のテスト失敗を修正し、100%合格率を達成
2. **カバレッジ目標達成**: 各モジュール90%以上のカバレッジを達成
3. **パフォーマンス検証**: AC-8（実行時間±5%）を検証し、文書化
4. **Issue #49の完全完了**: すべてのブロッキングタスクを解消し、マージ準備完了

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- Issue #49のマージ完了により、BasePhaseモジュールのメンテナンス性が向上
- テストカバレッジ向上により、将来の変更時のリグレッション防止が強化
- パフォーマンス特性の文書化により、長期的な監視・改善が可能

**技術的価値**:
- 品質保証プロセスの完遂（テスト合格率100%、カバレッジ90%+）
- モジュール分解リファクタリングのベストプラクティス確立
- テストインフラの継続的改善（CI環境判定、エラーハンドリング等）

---

## 2. 機能要件

### FR-1: PhaseRunner テスト失敗修正（優先度: 高）

**説明**: `tests/unit/phases/lifecycle/phase-runner.test.ts` の10個のテスト失敗を修正する。

**詳細**:
- **根本原因**: `jest.mock('../../../../src/core/phase-dependencies.js')` の欠如、MetadataManager mock の `getAllPhasesStatus` 欠如、`logger.info` spy の欠如
- **修正内容**:
  1. ファイル先頭に `jest.mock('../../../../src/core/phase-dependencies.js')` を追加
  2. `createMockMetadataManager()` に `getAllPhasesStatus: jest.fn().mockReturnValue([])` を追加
  3. 各テストケースに `jest.spyOn(logger, 'info')` を追加（アサーション前）
- **影響範囲**: 10テスト

**受け入れ基準**: AC-FR1

### FR-2: StepExecutor テスト失敗修正（優先度: 高）

**説明**: `tests/unit/phases/lifecycle/step-executor.test.ts` の3個のテスト失敗を修正する。

**詳細**:
- **根本原因**: StepExecutorは例外をスローせず `{ success: false, error }` を返すが、テストが `rejects.toThrow()` を期待
- **修正内容**:
  - UC-SE-03, UC-SE-09, UC-SE-09-2の期待値変更
  - `rejects.toThrow()` → `const result = await ...; expect(result.success).toBe(false); expect(result.error).toContain(...)`
- **影響範囲**: 3テスト

**受け入れ基準**: AC-FR2

### FR-3: Integration テスト失敗修正（優先度: 高）

**説明**: `tests/integration/base-phase-refactored.test.ts` の2個のテスト失敗を修正する。

**詳細**:
- **根本原因**: プライベートメソッド `cleanupWorkflowArtifacts()` を直接呼び出し
- **修正内容**:
  - IC-BP-04, IC-BP-08で公開ラッパーメソッド（例: `testCleanupWorkflowArtifacts()`）を利用
  - または、冗長テスト削除（ユニットテストで既カバー）
- **影響範囲**: 2テスト

**受け入れ基準**: AC-FR3

### FR-4: カバレッジ向上（優先度: 高）

**説明**: 4つのモジュール（ArtifactCleaner, PhaseRunner, ContextBuilder, StepExecutor）のカバレッジを90%以上に向上させる。

**詳細**:

#### FR-4.1: ArtifactCleaner カバレッジ向上（64.4% → 90%）
- **追加テストケース**（10-12ケース、0.5-1h）:
  - `isCIEnvironment()`: CI環境変数あり/なし（2ケース）
  - `promptUserConfirmation()`: ユーザー入力 "yes"/"no"/無効入力/EOF（4-6ケース）
  - `cleanupWorkflowArtifacts()`: CI環境自動確認/非CI環境プロンプト表示（2ケース）
  - `validateWorkflowPath()`: 不正パスエッジケース（2ケース）

#### FR-4.2: PhaseRunner カバレッジ向上（62% → 90%）
- **追加テストケース**（5-7ケース、0.5-1h）:
  - 依存関係検証エッジケース（lines 93-97, 112-113）: 空違反配列、空警告配列（2ケース）
  - エラーハンドリング分岐（lines 121-131）: Git失敗、GitHub失敗（2ケース）
  - 進捗投稿エッジケース（lines 142-144, 180-181）: Issue番号NaN、GitHub API失敗（1-3ケース）

#### FR-4.3: ContextBuilder カバレッジ向上（80.48% → 90%）
- **追加テストケース**（1-2ケース、0.5h）:
  - パス解決エッジケース（lines 84-85, 147-154）: シンボリックリンク、存在しないIssue番号（1-2ケース）

#### FR-4.4: StepExecutor カバレッジ向上（87.67% → 90%）
- **追加テストケース**（1-2ケース、0.5h）:
  - エラーハンドリング分岐（lines 137-138, 144-145）: revise失敗、例外スロー（1-2ケース）

**受け入れ基準**: AC-FR4

### FR-5: パフォーマンスベンチマーク実行（優先度: 高）

**説明**: Issue #49のリファクタリング前後でPlanningPhase実行時間を測定し、AC-8（±5%閾値）を検証する。

**詳細**:
- **測定対象**: BasePhase.run() 実行時間（Planning Phase）
- **ベースライン測定**: Issue #49マージ前のコードでPlanningPhase実行時間測定
- **比較測定**: Issue #49マージ後のコードでPlanningPhase実行時間測定
- **閾値**: ±5%以内（AC-8）
- **測定方法**: 既存統合テストの実行時間計測（手動測定）

**受け入れ基準**: AC-FR5

### FR-6: パフォーマンス特性文書化（優先度: 高）

**説明**: FR-5で測定したパフォーマンスメトリクスを文書化し、将来の監視推奨事項を記録する。

**詳細**:
- **ベースラインメトリクス記録**: 実行時間、メモリ使用量
- **Issue #49前後の比較結果**: 実行時間差、メモリ使用量差
- **許容範囲確認**: ±5%以内であることの確認
- **監視推奨事項**: 将来的な監視ポイント、劣化検知基準

**受け入れ基準**: AC-FR6

### FR-7: GitHub Issue進捗更新（優先度: 中）

**説明**: Issue #91の残タスクチェックリストを更新し、完了タスクにチェックマークを付与する。

**詳細**:
- 残タスクチェックリスト更新
- 完了タスクのチェックマーク付与
- Issue #49のEvaluation Reportへのリンク追記

**受け入れ基準**: AC-FR7

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **NFR-1.1**: リファクタリング後の実行時間は、リファクタリング前の±5%以内であること（AC-8）
- **NFR-1.2**: テスト実行時間は、修正後も既存と同等（±10%以内）であること
- **NFR-1.3**: カバレッジ測定コマンド（`npm run test:coverage`）は3分以内に完了すること

### NFR-2: 品質要件

- **NFR-2.1**: テスト合格率100%を達成すること（49/49テスト合格）
- **NFR-2.2**: 各モジュールのカバレッジ90%以上を達成すること
  - ArtifactCleaner: 90%以上
  - PhaseRunner: 90%以上
  - ContextBuilder: 90%以上
  - StepExecutor: 90%以上
- **NFR-2.3**: TypeScriptビルド成功を維持すること（`npm run build` エラーなし）

### NFR-3: 保守性要件

- **NFR-3.1**: 追加テストケースは、既存テストケースのコーディングスタイルと一貫性を保つこと
- **NFR-3.2**: mockオブジェクトは、既存のmock定義（jest-mock-extended）を利用すること
- **NFR-3.3**: テストケース名は、Given-When-Then形式またはUC-XX-YY形式で記述すること

### NFR-4: ドキュメント要件

- **NFR-4.1**: パフォーマンス特性文書は、Markdown形式で記述すること
- **NFR-4.2**: テスト戦略更新は、既存のテスト戦略ドキュメントと整合性を保つこと
- **NFR-4.3**: CLAUDE.md/ARCHITECTURE.md更新は、既存フォーマットに従うこと

---

## 4. 制約事項

### 4.1 技術的制約

- **TC-1**: プロダクションコード（`src/`配下）は変更しないこと
  - Issue #49のリファクタリング結果をそのまま利用
  - テストコードのみ修正・追加
- **TC-2**: 既存テストフレームワーク（Jest）のみ使用すること
  - 新規テストフレームワーク導入は不可
  - `jest.mock()`, `jest.spyOn()`, `jest.fn()` を活用
- **TC-3**: 既存mockライブラリ（jest-mock-extended）のみ使用すること
  - 新規mockライブラリ導入は不可
- **TC-4**: Node.js 20以上、npm 10以上の環境で動作すること
- **TC-5**: ES modules（`NODE_OPTIONS=--experimental-vm-modules`）に対応すること

### 4.2 リソース制約

- **RC-1**: 見積もり工数12-16時間以内で完了すること
- **RC-2**: Phase 5（テストコード実装）は4-6時間以内で完了すること
- **RC-3**: Phase 6（テスト実行・検証）は2-3時間以内で完了すること
- **RC-4**: Phase 7（ドキュメント）は2-3時間以内で完了すること

### 4.3 ポリシー制約

- **PC-1**: コーディング規約（@CLAUDE.md）に従うこと
  - ロギング規約: 統一loggerモジュール使用、console.log禁止
  - 環境変数アクセス規約: Config クラス使用、process.env直接アクセス禁止
  - エラーハンドリング規約: error-utilsモジュール使用、`as Error`型アサーション禁止
- **PC-2**: Git コミット戦略に従うこと
  - Phase完了後に `[ai-workflow] Phase {number} ({name}) - execute completed` 形式でコミット
  - クリーンアップ後に `[ai-workflow] Clean up workflow execution logs` でコミット
- **PC-3**: セキュリティポリシーに従うこと
  - パストラバーサル攻撃防止（正規表現によるパス検証）
  - シンボリックリンク攻撃防止（`fs.lstatSync()`による検証）

---

## 5. 前提条件

### 5.1 システム環境

- **ENV-1**: Node.js 20以上がインストールされていること
- **ENV-2**: npm 10以上がインストールされていること
- **ENV-3**: Git 2.30以上がインストールされていること
- **ENV-4**: `npm install` が実行済みであること（依存関係インストール済み）

### 5.2 依存コンポーネント

- **DEP-1**: Issue #49のリファクタリングコードがマージ済みであること
  - `src/phases/lifecycle/phase-runner.ts` 存在
  - `src/phases/lifecycle/step-executor.ts` 存在
  - `src/phases/context/context-builder.ts` 存在
  - `src/phases/cleanup/artifact-cleaner.ts` 存在
- **DEP-2**: Evaluation Report（`.ai-workflow/issue-49/09_evaluation/output/evaluation_report.md`）が参照可能であること

### 5.3 外部システム連携

- **EXT-1**: GitHub APIアクセス可能であること（`GITHUB_TOKEN` 設定済み）
- **EXT-2**: Gitリモートリポジトリへのpush権限があること

---

## 6. 受け入れ基準

### AC-FR1: PhaseRunner テスト失敗修正

**Given**: `tests/unit/phases/lifecycle/phase-runner.test.ts` が存在する
**When**: 以下の修正を実施する
1. ファイル先頭に `jest.mock('../../../../src/core/phase-dependencies.js')` を追加
2. `createMockMetadataManager()` に `getAllPhasesStatus: jest.fn().mockReturnValue([])` を追加
3. 各テストケースに `jest.spyOn(logger, 'info')` を追加

**Then**:
- PhaseRunnerの10テストすべてが合格すること
- `npm test -- tests/unit/phases/lifecycle/phase-runner.test.ts` が成功すること
- TypeScriptビルド（`npm run build`）が成功すること

### AC-FR2: StepExecutor テスト失敗修正

**Given**: `tests/unit/phases/lifecycle/step-executor.test.ts` が存在する
**When**: UC-SE-03, UC-SE-09, UC-SE-09-2の期待値を `rejects.toThrow()` から `{ success: false, error }` 検証に変更する
**Then**:
- StepExecutorの3テストすべてが合格すること
- `npm test -- tests/unit/phases/lifecycle/step-executor.test.ts` が成功すること
- TypeScriptビルド（`npm run build`）が成功すること

### AC-FR3: Integration テスト失敗修正

**Given**: `tests/integration/base-phase-refactored.test.ts` が存在する
**When**: IC-BP-04, IC-BP-08で公開ラッパーメソッドを利用する、または冗長テストを削除する
**Then**:
- Integrationの2テストすべてが合格すること
- `npm test -- tests/integration/base-phase-refactored.test.ts` が成功すること
- TypeScriptビルド（`npm run build`）が成功すること

### AC-FR4: カバレッジ向上

**Given**: 以下のモジュールが存在する
- `src/phases/cleanup/artifact-cleaner.ts`（カバレッジ64.4%）
- `src/phases/lifecycle/phase-runner.ts`（カバレッジ62%）
- `src/phases/context/context-builder.ts`（カバレッジ80.48%）
- `src/phases/lifecycle/step-executor.ts`（カバレッジ87.67%）

**When**: 以下のテストケースを追加する
- ArtifactCleaner: 10-12ケース（CI環境判定、ユーザープロンプト、パス検証）
- PhaseRunner: 5-7ケース（依存関係検証、エラーハンドリング、進捗投稿）
- ContextBuilder: 1-2ケース（パス解決エッジケース）
- StepExecutor: 1-2ケース（エラーハンドリング分岐）

**Then**:
- `npm run test:coverage` 実行時、各モジュールのカバレッジが90%以上であること
- ArtifactCleaner: 90%以上
- PhaseRunner: 90%以上
- ContextBuilder: 90%以上
- StepExecutor: 90%以上
- 全テストが合格すること（100%合格率）

### AC-FR5: パフォーマンスベンチマーク実行

**Given**: Issue #49マージ前後のコードが利用可能である
**When**: 以下の測定を実施する
1. ベースライン測定（Issue #49前のコードでPlanningPhase実行時間測定）
2. 比較測定（Issue #49後のコードでPlanningPhase実行時間測定）
3. 実行時間差を算出

**Then**:
- 実行時間差が±5%以内であること（AC-8）
- 測定結果がメトリクスとして記録されること
- ベースライン、比較測定、実行時間差がすべて文書化されること

### AC-FR6: パフォーマンス特性文書化

**Given**: FR-5のパフォーマンスベンチマーク結果が利用可能である
**When**: 以下のドキュメントを作成する
1. ベースラインメトリクス記録（実行時間、メモリ使用量）
2. Issue #49前後の比較結果
3. 許容範囲（±5%）内であることの確認
4. 監視推奨事項

**Then**:
- パフォーマンス特性文書が Markdown 形式で作成されること
- ベースラインメトリクス、比較結果、監視推奨事項が含まれること
- CLAUDE.md または ARCHITECTURE.md に統合されること

### AC-FR7: GitHub Issue進捗更新

**Given**: Issue #91が存在し、残タスクチェックリストが記載されている
**When**: 完了したタスクにチェックマークを付与する
**Then**:
- すべての完了タスクに `[x]` チェックマークが付与されること
- Issue #49のEvaluation Reportへのリンクが追記されること
- 未完了タスクが `[ ]` のまま残っていること

### AC-ALL: 全体受け入れ基準（必須）

**Given**: すべての機能要件（FR-1 ~ FR-7）が実装されている
**When**: 以下のコマンドを実行する
1. `npm run build`
2. `npm test`
3. `npm run test:coverage`

**Then**:
- TypeScriptビルドが成功すること（エラーなし）
- テスト合格率100%を達成すること（49/49テスト合格）
- 各モジュールのカバレッジ90%以上を達成すること
- パフォーマンス±5%閾値を達成すること（AC-8）

---

## 7. スコープ外

以下の項目は本Issueのスコープ外とし、将来的な拡張候補として記録します。

### OUT-1: プロダクションコード変更

- `src/` 配下のコード変更
- 新規モジュール追加
- 既存APIの変更

**理由**: Issue #49のリファクタリング結果をそのまま利用するため。

### OUT-2: 新規テストフレームワーク導入

- Jest以外のテストフレームワーク（Vitest、Mocha等）
- BDD統合テスト（Cucumber、Playwright等）

**理由**: 既存テストインフラ改善に焦点を当てるため。新規フレームワークは将来の拡張候補。

### OUT-3: 自動パフォーマンス監視

- CI/CDパイプラインでのパフォーマンス自動測定
- パフォーマンス劣化時の自動アラート
- 実行時間トレンドグラフ生成

**理由**: 手動測定で十分な段階であり、自動化は将来の拡張候補。

### OUT-4: エンドツーエンド統合テスト

- Phase 0 → Phase 8 完全ワークフロー統合テスト
- マルチリポジトリワークフローの統合テスト

**理由**: 現状範囲外。将来的な品質保証強化の候補。

### OUT-5: カバレッジ100%達成

- すべてのモジュールで100%カバレッジ達成

**理由**: 90%カバレッジを目標とし、100%は将来の拡張候補。コストパフォーマンスを考慮。

### OUT-6: Issue #49の追加リファクタリング

- BasePhaseのさらなるモジュール分解
- 新規デザインパターンの導入

**理由**: Issue #49は完了とし、追加リファクタリングは別Issueで対応。

---

## 8. 変更履歴

| バージョン | 日付 | 変更内容 | 変更者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-30 | 初版作成 | AI Workflow Requirements Phase |

---

## 9. 承認

本要件定義書は、Phase 1（Requirements）の品質ゲートを満たしています：

- [x] **機能要件が明確に記載されている**（FR-1 ~ FR-7、7個の機能要件）
- [x] **受け入れ基準が定義されている**（AC-FR1 ~ AC-ALL、8個の受け入れ基準）
- [x] **スコープが明確である**（スコープ内: FR-1~7、スコープ外: OUT-1~6）
- [x] **論理的な矛盾がない**（Planning Documentとの整合性確認済み）

次フェーズ（Phase 2: Design）への移行可能です。

---

**作成者**: AI Workflow Orchestrator v0.3.1
**作成日**: 2025-01-30
**次フェーズ**: Phase 2 (Design)
