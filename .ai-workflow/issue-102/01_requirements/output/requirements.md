# 要件定義書 - Issue #102

## 0. Planning Documentの確認

Planning Documentを確認し、以下の開発計画を踏まえて要件定義を実施しました：

### 開発計画の全体像
- **複雑度**: 簡単
- **見積もり工数**: 2~3時間
- **リスク評価**: 低
- **実装戦略**: EXTEND（既存テストファイルの修正）
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストの期待値修正）

### スコープ
- テストファイル2つの期待値修正（file-selector.test.ts、commit-message-builder.test.ts）
- Jest設定ファイル1つの修正（jest.config.cjs）
- 本体コード（src/配下）の変更は不要

### 技術選定
- 既存のテストフレームワーク（Jest）をそのまま使用
- ESMパッケージ（chalk）のJest対応のみ実施

### リスク
- **リスク1**: 期待値修正の不正確性（影響度: 中、確率: 低）
- **リスク2**: Jest設定修正の副作用（影響度: 低、確率: 低）
- **リスク3**: テスト実行時の環境依存問題（影響度: 低、確率: 低）
- **リスク4**: スコープクリープ（追加修正の発見）（影響度: 低、確率: 低）

---

## 1. 概要

### 背景
Issue #52（commit-manager.tsの3モジュール分割リファクタリング）の評価フェーズで、3つのテストケースが期待値のミスにより失敗し、また統合テストがJest設定の問題により実行できないことが判明しました。これらは実装の問題ではなく、テストインフラの修正が必要です。

### 目的
- テストシナリオの期待値を修正し、全ユニットテストが正常にPASSするようにする
- Jest設定を修正し、統合テストが実行可能になるようにする
- Issue #52のリファクタリングプロジェクトを完全に完了させる

### ビジネス価値
- **品質保証**: テストカバレッジ90.6% → 100%を達成し、リファクタリングの品質を保証
- **保守性向上**: 統合テストが実行可能になることで、後方互換性の継続的な検証が可能
- **開発効率化**: テスト失敗の原因が明確になり、将来的なテスト保守が容易

### 技術的価値
- **テスト品質の向上**: 期待値の正確性を確保し、テストの信頼性を向上
- **CI/CD環境の改善**: 統合テストが実行可能になることで、CI/CDパイプラインの健全性を確保
- **ESMパッケージ対応**: Jest設定でchalkを正しく処理できるようにし、将来的なESMパッケージ利用を円滑化

---

## 2. 機能要件

### FR-1: file-selector.test.ts の期待値修正

**説明**: `tests/unit/git/file-selector.test.ts` の lines 72-79 のモックデータ型定義を修正し、テストケースが正常にPASSするようにする。

**詳細**:
- **対象ファイル**: `tests/unit/git/file-selector.test.ts`
- **対象行**: 72-79
- **失敗内容**: モックデータの型定義ミスにより `getChangedFiles()` メソッドのテストが失敗
- **修正内容**: FileStatusResult の型定義を正しい形式に修正
- **優先度**: 中

**受け入れ基準**（FR-1）:
- **Given**: file-selector.test.ts の getChangedFiles テストケースが存在する
- **When**: npm run test:unit で file-selector.test.ts を実行する
- **Then**: lines 72-79 の対象テストケースが PASS する

---

### FR-2: commit-message-builder.test.ts の期待値修正

**説明**: `tests/unit/git/commit-message-builder.test.ts` の lines 205, 222 のPhase番号期待値を修正し、テストケースが正常にPASSするようにする。

**詳細**:
- **対象ファイル**: `tests/unit/git/commit-message-builder.test.ts`
- **対象行**: 205, 222
- **失敗内容**: Phase番号の期待値ミス（off-by-oneエラー）
  - Line 205: report=Phase 8を期待すべきところ、Phase 9と誤記
  - Line 222: evaluation=Phase 9を期待すべきところ、Phase 10と誤記
- **修正内容**: Phase番号を正しい値に修正
- **優先度**: 中

**受け入れ基準**（FR-2）:
- **Given**: commit-message-builder.test.ts の createCleanupCommitMessage テストケースが存在する
- **When**: npm run test:unit で commit-message-builder.test.ts を実行する
- **Then**: lines 205, 222 の対象テストケースが PASS する

---

### FR-3: Jest設定の修正（chalk対応）

**説明**: `jest.config.cjs` の `transformIgnorePatterns` を修正し、ESMパッケージである `chalk` を正しく処理できるようにする。

**詳細**:
- **対象ファイル**: `jest.config.cjs`
- **現在の設定**: `transformIgnorePatterns: ['/node_modules/(?!(strip-ansi|ansi-regex)/)']`
- **修正後の設定**: `transformIgnorePatterns: ['/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)']`
- **目的**: `commit-manager.test.ts` 統合テストを実行可能にする
- **優先度**: 中

**受け入れ基準**（FR-3）:
- **Given**: jest.config.cjs の transformIgnorePatterns が修正されている
- **When**: npm run test:integration で commit-manager.test.ts を実行する
- **Then**: Jest が chalk モジュールを正しく処理し、統合テストが実行される（エラーが発生しない）

---

### FR-4: 全テスト実行による回帰テスト確認

**説明**: FR-1, FR-2, FR-3の修正後、全テストスイート（ユニットテスト + 統合テスト）を実行し、回帰テストが成功することを確認する。

**詳細**:
- **実行コマンド**: `npm test`（または `npm run test:unit && npm run test:integration`）
- **成功基準**: 全テストケースが PASS すること（100% 成功率）
- **優先度**: 高

**受け入れ基準**（FR-4）:
- **Given**: FR-1, FR-2, FR-3 の修正がすべて完了している
- **When**: npm test で全テストスイートを実行する
- **Then**:
  - file-selector.test.ts が全テストケース PASS
  - commit-message-builder.test.ts が全テストケース PASS
  - commit-manager.test.ts（統合テスト）が実行可能で PASS
  - 既存の他のテストケースにも影響がない（回帰なし）

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- **テスト実行時間**: 修正前後でテスト実行時間が±5%以内であること
- **CI/CD実行時間**: Jenkins等のCI環境での実行時間に悪影響がないこと

### NFR-2: 保守性要件
- **コメントの追加**: 修正箇所には「なぜこの期待値が正しいか」のコメントを追加すること
- **Jest設定のコメント**: jest.config.cjs に chalk 追加理由を記載すること
- **コード可読性**: 修正内容が将来のメンテナーに理解しやすい形であること

### NFR-3: 信頼性要件
- **テストの再現性**: ローカル環境とCI環境で同じテスト結果が得られること
- **Node.jsバージョン互換性**: 現在のNode.jsバージョン（v20）で動作すること

### NFR-4: 拡張性要件
- **ESMパッケージ対応**: 将来的に他のESMパッケージを追加する際のガイドラインとなること
- **Jest設定の柔軟性**: 他のESMパッケージ（strip-ansi、ansi-regex）との整合性を維持すること

---

## 4. 制約事項

### 技術的制約
- **Jestバージョン**: 既存のJestバージョン（package.jsonに記載）をそのまま使用
- **ESM対応**: Jest の transformIgnorePatterns でESMパッケージを個別に指定する方法を採用
- **テストフレームワーク**: Jest 以外のテストフレームワークは使用しない
- **本体コードの変更禁止**: src/ 配下のコードは一切変更しない（テストコードのみ修正）

### リソース制約
- **工数**: 2~3時間以内に完了
- **Phase制約**: Phase 0（Planning）から Phase 8（Report）まで、10フェーズのワークフローに従う

### ポリシー制約
- **コーディング規約**: CLAUDE.md に記載されたコーディング規約に準拠
- **エラーハンドリング**: 統一loggerモジュール（src/utils/logger.ts）を使用
- **環境変数アクセス**: Config クラス（src/core/config.ts）を使用

---

## 5. 前提条件

### システム環境
- **Node.js**: v20 以上
- **npm**: v10 以上
- **OS**: Linux, macOS, Windows（いずれも対応）

### 依存コンポーネント
- **Jest**: 既存のバージョン（package.jsonに記載）
- **chalk**: ESMパッケージ（既存依存、バージョン変更なし）
- **strip-ansi, ansi-regex**: 既存のESMパッケージ（transformIgnorePatternsで既に対応済み）

### 外部システム連携
- **GitHub**: Issue #102、元Issue #52 との関連を明確に記録
- **CI/CD**: Jenkins 環境での実行を想定（ローカル環境でも動作）

---

## 6. 受け入れ基準

### AC-1: file-selector.test.ts の期待値修正
- **Given**: file-selector.test.ts の lines 72-79 が修正されている
- **When**: npm run test:unit で file-selector.test.ts を実行する
- **Then**:
  - getChangedFiles テストケースが PASS する
  - モックデータの型定義が正しい（FileStatusResult 型に準拠）
  - 修正箇所にコメントが追加されている

### AC-2: commit-message-builder.test.ts の期待値修正
- **Given**: commit-message-builder.test.ts の lines 205, 222 が修正されている
- **When**: npm run test:unit で commit-message-builder.test.ts を実行する
- **Then**:
  - createCleanupCommitMessage テストケースが PASS する
  - Line 205: Phase 8（report）の期待値が正しい
  - Line 222: Phase 9（evaluation）の期待値が正しい
  - 修正箇所にコメントが追加されている

### AC-3: Jest設定の修正
- **Given**: jest.config.cjs の transformIgnorePatterns が修正されている
- **When**: npm run test:integration で commit-manager.test.ts を実行する
- **Then**:
  - chalk モジュールが正しく処理される（Jest エラーが発生しない）
  - 統合テストが実行可能になる
  - 設定ファイルにコメントが追加されている（chalk追加理由）

### AC-4: 全テスト実行による回帰テスト確認
- **Given**: FR-1, FR-2, FR-3 の修正がすべて完了している
- **When**: npm test で全テストスイートを実行する
- **Then**:
  - 全テストケースが PASS する（100% 成功率）
  - file-selector.test.ts: 23ケース PASS
  - commit-message-builder.test.ts: 9ケース PASS
  - commit-manager.test.ts: 統合テスト実行可能 & PASS
  - 既存テストに回帰がない

### AC-5: CI環境での検証
- **Given**: 修正がすべて完了し、ローカル環境でテストが成功している
- **When**: CI環境（Jenkins）でテストを実行する
- **Then**:
  - CI環境でもローカル環境と同じテスト結果が得られる
  - Node.jsバージョン、npmバージョンの整合性が確認される

---

## 7. スコープ外

### 明確にスコープ外とする事項
- **本体コード（src/）の修正**: Issue #102 では本体コードの変更は行わない
- **新規テストケースの追加**: 既存テストの修正のみ、新規追加は行わない
- **Jestバージョンアップグレード**: 既存バージョンをそのまま使用
- **他のESMパッケージ対応**: chalk 以外のESMパッケージは対象外
- **リファクタリング**: Issue #52 のリファクタリング自体は完了済み、Issue #102 ではフォローアップ作業のみ

### 将来的な拡張候補
- **Jest設定の最適化**: より多くのESMパッケージに対応するための包括的な設定見直し
- **テストカバレッジの向上**: 現在90.6%のカバレッジを100%に近づける（別Issueとして検討）
- **パフォーマンス最適化**: テスト実行時間の短縮（別Issueとして検討）

---

## 8. 品質ゲート（Phase 1: Requirements）

この要件定義書は、以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR-1, FR-2, FR-3, FR-4 の4つの機能要件を明確に定義
- ✅ **受け入れ基準が定義されている**: AC-1 〜 AC-5 の5つの受け入れ基準を Given-When-Then 形式で定義
- ✅ **スコープが明確である**: セクション7でスコープ外の事項を明確に記載
- ✅ **論理的な矛盾がない**: Planning Document との整合性を確認し、矛盾がないことを検証

---

## 9. リスク評価と軽減策

Planning Document で特定されたリスクに対する詳細な軽減策を定義します。

### リスク1: 期待値修正の不正確性
- **影響度**: 中
- **確率**: 低
- **詳細な軽減策**:
  - **Phase 1（要件定義）**: 元Issue #52の評価レポートを詳細に確認し、テスト失敗の根本原因を特定
  - **Phase 2（設計）**: 実装コード（src/core/git/file-selector.ts、src/core/git/commit-message-builder.ts）を確認し、実際の動作を理解
  - **Phase 4（実装）**: 期待値修正後、必ず実際のテスト実行で動作確認
  - **Phase 5（テスト実装）**: テストケースのコメントに期待値の根拠を記載

### リスク2: Jest設定修正の副作用
- **影響度**: 低
- **確率**: 低
- **詳細な軽減策**:
  - **Phase 2（設計）**: transformIgnorePatterns の修正前後で、既存テストが引き続きPASSすることを確認
  - **Phase 4（実装）**: chalk以外のESMパッケージ（strip-ansi、ansi-regex）との整合性を確認
  - **Phase 6（テスト実行）**: 全テストスイート（npm test）を実行し、回帰テストを実施

### リスク3: テスト実行時の環境依存問題
- **影響度**: 低
- **確率**: 低
- **詳細な軽減策**:
  - **Phase 6（テスト実行）**: CI環境（Jenkins）での実行も確認
  - **AC-5**: ローカル環境とCI環境でテスト結果が一致することを確認
  - **Phase 1（要件定義）**: Node.jsバージョン、npmバージョンの整合性を確認

### リスク4: スコープクリープ（追加修正の発見）
- **影響度**: 低
- **確率**: 低
- **詳細な軽減策**:
  - **Phase 0（Planning）**: 修正対象を明確に限定（file-selector.test.ts、commit-message-builder.test.ts、jest.config.cjsのみ）
  - **Phase 9（Evaluation）**: テスト実行時に他の失敗が見つかった場合、別Issueとして切り出す
  - **Phase 1（要件定義）**: セクション7でスコープ外の事項を明確に記載

---

## 10. 依存関係と参照

### 元Issue
- **Issue #52**: commit-manager.tsの3モジュール分割リファクタリング
- **Evaluation Report**: `.ai-workflow/issue-52/09_evaluation/output/evaluation_report.md`

### 関連ドキュメント
- **Planning Document**: `.ai-workflow/issue-102/00_planning/output/planning.md`
- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **jest.config.cjs**: Jest設定ファイル

### 修正対象ファイル
1. `tests/unit/git/file-selector.test.ts` (lines 72-79)
2. `tests/unit/git/commit-message-builder.test.ts` (lines 205, 222)
3. `jest.config.cjs` (transformIgnorePatterns)

### 検証対象ファイル（参照のみ、変更なし）
- `src/core/git/file-selector.ts`
- `src/core/git/commit-message-builder.ts`
- `src/core/git/commit-manager.ts`

---

## 11. 成功基準

Issue #102 が成功とみなされるためには、以下の基準をすべて満たす必要があります：

### 基準1: 全ユニットテストの成功
- file-selector.test.ts の全テストケース（23ケース）が PASS
- commit-message-builder.test.ts の全テストケース（9ケース）が PASS

### 基準2: 統合テストの実行可能性
- commit-manager.test.ts（統合テスト）が実行可能になる
- Jest が chalk モジュールを正しく処理する

### 基準3: 回帰テストの成功
- 全テストスイート（npm test）が成功する
- 既存の他のテストケースにも影響がない

### 基準4: CI環境での検証
- Jenkins 等のCI環境でもテストが成功する
- ローカル環境とCI環境でテスト結果が一致する

### 基準5: ドキュメント更新
- CHANGELOG.md にIssue #102の修正内容を追加
- 元Issue #52との関連を明記

---

**作成日**: 2025-01-31
**作成者**: AI Workflow Phase 1 (Requirements)
**Issue番号**: #102（元Issue: #52）
**Planning Document**: @.ai-workflow/issue-102/00_planning/output/planning.md
**Evaluation Report**: @.ai-workflow/issue-52/09_evaluation/output/evaluation_report.md
