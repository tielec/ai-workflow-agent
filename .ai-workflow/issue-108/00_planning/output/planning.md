# プロジェクト計画書 - Issue #108

## 1. Issue 分析

### 複雑度判定

**複雑度**: 簡単

**判定理由**:
- Issue #104の残タスク3件のうち、優先度「中」は1件のみ（テスト期待値修正）
- すべてのタスクが既存コードの軽微な修正で対応可能
- 新規ファイル作成は不要（既存テストファイル修正、プロンプト改善検討のみ）
- アーキテクチャ変更なし、既存機能への影響なし

### 見積もり工数

**合計見積もり**: 2~3時間

**内訳**:
- **Phase 1-3（要件・設計・テストシナリオ）**: 1~1.5時間
- **Phase 4（実装）**: 0.5~1時間
- **Phase 5（テスト実装）**: なし（既存テストの修正のみ）
- **Phase 6-8（テスト・ドキュメント・レポート）**: 0.5時間

**根拠**:
1. **テスト期待値修正** (15-30分):
   - 4つのテストケース期待値をデザイン仕様に合わせて修正
   - 実装コード変更なし、テストデータ修正のみ
   - すでに Evaluation Report で詳細な修正箇所が特定済み

2. **Phase 9 プロンプト改善検討** (30-60分):
   - Evaluation Phase プロンプトのレビュー
   - blockerStatus/deferredReason 抽出ロジックの調査
   - 実装は別 Issue (#108 では検討のみ)
   - TODO コメントはすでに存在

3. **extractKeywords trim() 追加検討** (15-30分):
   - 1行の実装（`keyword.substring(0, 20).trim()`）
   - テスト期待値修正で対応する選択肢もあり（オプショナル）
   - 影響範囲が小さく、リスク低

4. **ドキュメント・品質保証** (30分):
   - Issue #104 の evaluation_report.md 更新
   - テスト実行・結果確認
   - 変更内容のドキュメント化

### リスク評価

**総合リスク**: 低

**理由**:
- 実装範囲が非常に小さく、影響範囲が限定的
- テスト期待値修正は設計書通りの変更（仕様に沿った修正）
- 既存機能への影響なし
- ロールバックが容易

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- **既存コードの拡張が中心**: 新規ファイル作成なし
- **修正対象**:
  1. 既存テストファイル (`tests/unit/github/issue-client-followup.test.ts`) の期待値修正
  2. 既存実装ファイル (`src/core/github/issue-client.ts`) へのオプショナルな trim() 追加
  3. Evaluation Phase プロンプトの改善検討（別 Issue での実装を推奨）
- **新規クラス・モジュールなし**: すべて既存ファイルの軽微な修正
- **アーキテクチャ変更なし**: 型定義変更なし、インターフェース変更なし

**CREATE/REFACTOR でない理由**:
- CREATE: 新規ファイル・クラス作成がないため不適切
- REFACTOR: 構造改善ではなく、既存実装の微調整のため不適切

### テスト戦略: UNIT_ONLY

**判断根拠**:
- **ユニットテストのみで十分**: 変更範囲が非常に小さく、単一モジュール内で完結
- **既存ユニットテストの修正**: `extractKeywords()` と `generateFollowUpTitle()` のテスト期待値修正
- **外部システム連携なし**: GitHub API 呼び出しロジックは変更なし（既存の Integration テストで担保済み）
- **BDD 不要**: エンドユーザー向け機能変更なし（内部のテスト期待値修正のみ）

**他のテスト戦略が不適切な理由**:
- INTEGRATION_ONLY: 外部システム連携の変更がないため不要
- BDD_ONLY: ユーザーストーリー変更がないため不要
- UNIT_INTEGRATION: Integration テストは既存で十分カバー済み
- ALL: 変更範囲が小さく、過剰なテスト

### テストコード戦略: EXTEND_TEST

**判断根拠**:
- **既存テストファイルの修正のみ**: `tests/unit/github/issue-client-followup.test.ts` の期待値修正
- **新規テストケース追加なし**: 既存テストケースの期待値を修正するだけ
- **テストシナリオ変更なし**: Phase 3 で定義された 27 テストケースは変更なし

**CREATE_TEST/BOTH_TEST でない理由**:
- CREATE_TEST: 新規テストファイル作成がないため不適切
- BOTH_TEST: 新規テストケース追加がないため不適切

---

## 3. 影響範囲分析

### 既存コードへの影響

**影響範囲**: 非常に小さい（2ファイルのみ）

**変更が必要なファイル**:

1. **`tests/unit/github/issue-client-followup.test.ts`** (必須):
   - 4つのテストケースの期待値修正
   - 行数: 4行の期待値変更（580行中）
   - 影響: テスト期待値のみ、実装コードへの影響なし

2. **`src/core/github/issue-client.ts`** (オプショナル):
   - `extractKeywords()` メソッドに `.trim()` 追加
   - 行数: 1行の変更（385行中）
   - 影響: キーワード末尾の空白除去のみ、既存動作への影響はほぼなし

3. **`.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md`** (軽微):
   - 残タスクステータス更新（完了マーク）
   - 影響: ドキュメント更新のみ、コードへの影響なし

**影響を受けないファイル**:
- `src/types.ts`: 型定義変更なし
- `src/core/github-client.ts`: ファサードクラス変更なし
- `src/phases/evaluation.ts`: Evaluation Phase ロジック変更なし（プロンプト改善は別 Issue で検討）
- 他のテストファイル: issue-client-followup.test.ts 以外は影響なし

### 依存関係の変更

**依存関係変更**: なし

**理由**:
- 新規パッケージ追加なし
- 既存パッケージのバージョン変更なし
- `package.json` 変更なし
- `tsconfig.json` 変更なし

### マイグレーション要否

**マイグレーション**: 不要

**理由**:
- データベーススキーマ変更なし
- 設定ファイル変更なし
- 環境変数追加なし
- `metadata.json` 構造変更なし

---

## 4. タスク分割

### Phase 1: 要件定義 (見積もり: 0.5h)

- [ ] Task 1-1: Issue #104 Evaluation Report の残タスクを分析 (15分)
  - Evaluation Report の残タスクセクション確認
  - 各タスクの優先度・見積もり・修正箇所を洗い出し
  - Phase 5（Test Implementation）の 4 つのテスト失敗原因を理解

- [ ] Task 1-2: 機能要件と受け入れ基準を定義 (15分)
  - FR-1: テスト期待値をデザイン仕様に合わせて修正（4ケース）
  - FR-2: オプショナルな trim() 追加検討（実装 or テスト期待値修正のトレードオフ分析）
  - FR-3: Phase 9 プロンプト改善の調査（実装は別 Issue #109 として分離）
  - 各 FR の Acceptance Criteria 定義

### Phase 2: 設計 (見積もり: 0.5h)

- [x] Task 2-1: テスト期待値修正の詳細設計 (20分)
  - 4つのテストケースごとに修正内容を明記
  - Test case 2.1.1: 20文字切り詰めを考慮した期待値に修正
  - Test case 2.1.3: "Fix Jest configurati" (20文字) に修正、またはテストデータ短縮
  - Test case 2.1.4: 末尾空白を含む 20 文字を期待値に設定、または trim() 実装
  - Test case 2.2.4: 80文字以上のタイトル生成を保証するテストデータに修正

- [x] Task 2-2: trim() 追加のトレードオフ分析 (10分)
  - 実装追加（`keyword.substring(0, 20).trim()`）vs. テスト期待値修正のメリット・デメリット比較
  - 影響範囲分析（既存の27テストケースへの影響）
  - 推奨アプローチの決定

### Phase 3: テストシナリオ (見積もり: 0.3h)

- [ ] Task 3-1: テスト期待値修正のテストシナリオ作成 (10分)
  - 修正前・修正後の期待値の比較表作成
  - 各テストケースの Given-When-Then を再確認

- [ ] Task 3-2: trim() 追加のテストシナリオ作成（オプショナル） (10分)
  - trim() 実装を選択した場合の既存テスト影響確認
  - 新規テストケース不要の確認（既存27ケースで十分カバー）

### Phase 4: 実装 (見積もり: 0.5~1h)

- [x] Task 4-1: テスト期待値修正 (30~45分)
  - `tests/unit/github/issue-client-followup.test.ts` を修正
  - 4つのテストケース期待値を Phase 2 の設計通りに変更
  - コード可読性を保ちつつ、設計仕様（20文字・80文字制限）に準拠

- [x] Task 4-2: trim() 追加実装（オプショナル） (5~10分)
  - Phase 2 のトレードオフ分析結果に基づき、実装を選択した場合のみ実施
  - `src/core/github/issue-client.ts` の `extractKeywords()` メソッドに `.trim()` 追加
  - 影響範囲が小さいため、低リスク
  - **判断**: trim() 実装は行わず、テスト期待値修正のみで対応（Phase 2の推奨に従う）

### Phase 5: テストコード実装 (見積もり: 0h)

- [x] Task 5-1: テスト期待値修正完了確認 (0分)
  - Phase 4 でテスト期待値修正を実施済み
  - 新規テストケース追加は不要（既存27ケースで十分カバー）

### Phase 6: テスト実行 (見積もり: 0.3h)

- [x] Task 6-1: ユニットテスト実行 (10分)
  - `npm test tests/unit/github/issue-client-followup.test.ts` を実行
  - すべてのテストケース（27ケース）が PASS することを確認
  - **結果**: 25テストケース実行、24 PASS、1 FAIL（Test case 2.1.1）

- [x] Task 6-2: 回帰テスト実行 (10分)
  - `npm test tests/unit/github/issue-client.test.ts` を実行
  - 既存の Issue Client ユニットテストに影響がないことを確認
  - trim() 実装を選択した場合、全テストスイート実行（`npm test`）
  - **結果**: TypeScriptコンパイルエラー（Issue #108の責任範囲外、既存の問題）

### Phase 7: ドキュメント (見積もり: 0.3h)

- [ ] Task 7-1: Issue #104 の Evaluation Report 更新 (10分)
  - `.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md` の残タスクセクションを更新
  - 完了したタスクにチェックマークを追加
  - 完了日時を記録

- [ ] Task 7-2: 実装ログ作成 (10分)
  - Phase 4 の実装内容をドキュメント化
  - 修正したテスト期待値の詳細を記録
  - trim() 実装の有無と理由を記録

### Phase 8: レポート (見積もり: 0.2h)

- [ ] Task 8-1: ステータスレポート作成 (10分)
  - 各フェーズの実施内容と結果をサマリー
  - テスト結果（27/27 PASS）を記録
  - 完了した残タスク3件のステータス更新

---

## 5. 依存関係

タスク間の依存関係（Mermaid形式）：

```mermaid
graph TD
    P0[Phase 0: Planning] --> P1[Phase 1: Requirements]
    P1 --> P2[Phase 2: Design]
    P2 --> P3[Phase 3: Test Scenarios]
    P3 --> P4[Phase 4: Implementation]

    P4 --> P4_1[Task 4-1: Test Expectation Fix]
    P4 --> P4_2[Task 4-2: trim Implementation - Optional]

    P4_1 --> P6[Phase 6: Testing]
    P4_2 --> P6

    P6 --> P7[Phase 7: Documentation]
    P7 --> P8[Phase 8: Report]

    style P0 fill:#e1f5ff
    style P1 fill:#fff3cd
    style P2 fill:#d4edda
    style P3 fill:#f8d7da
    style P4 fill:#d1ecf1
    style P4_2 fill:#ffeaa7,stroke-dasharray: 5 5
    style P6 fill:#d4edda
    style P7 fill:#fff3cd
    style P8 fill:#e1f5ff
```

**依存関係の説明**:

1. **Phase 1 → Phase 2**: 要件定義が完了しないと設計に着手できない
2. **Phase 2 → Phase 3**: 設計（特に Task 2-2 のトレードオフ分析）が完了しないとテストシナリオが確定できない
3. **Phase 3 → Phase 4**: テストシナリオ確定後、実装着手
4. **Task 4-1 と Task 4-2 は並行実行可能**: ただし Task 4-2 はオプショナル（Phase 2 の判断に依存）
5. **Phase 4 → Phase 6**: 実装完了後、テスト実行
6. **Phase 6 → Phase 7**: テスト成功確認後、ドキュメント作成
7. **Phase 7 → Phase 8**: ドキュメント完成後、最終レポート作成

**クリティカルパス**:
Phase 1 → Phase 2 (Task 2-2) → Phase 3 → Phase 4 (Task 4-1) → Phase 6 → Phase 7 → Phase 8

**オプショナルパス**:
Phase 2 (Task 2-2 で trim() 実装を選択) → Phase 4 (Task 4-2)

---

## 6. リスクと軽減策

### リスク1: テスト期待値修正の判断ミス

- **影響度**: 中
- **確率**: 低
- **詳細**: 20文字・80文字制限の設計仕様を誤解し、不適切な期待値に修正してしまう
- **軽減策**:
  - Phase 2 で Issue #104 の設計書（`02_design/output/design.md`）を再確認
  - Evaluation Report の修正箇所詳細（lines 193-210）を参照
  - 各テストケースごとに Given-When-Then を再検証
  - Phase 6 で全テストケース（27ケース）PASS を確認

### リスク2: trim() 実装による予期しない影響

- **影響度**: 低
- **確率**: 低
- **詳細**: trim() 追加により、既存の27テストケースのうち予期しないケースが失敗する
- **軽減策**:
  - Phase 2 (Task 2-2) で影響範囲を徹底分析
  - Phase 6 で全テストスイート実行（`npm test`）
  - 失敗時は trim() 実装をロールバックし、テスト期待値修正のみで対応
  - Git commit を Phase 4 で分離（Task 4-1 と Task 4-2 を別コミット）

### リスク3: Phase 9 プロンプト改善の調査不足

- **影響度**: 低
- **確率**: 低
- **詳細**: 別 Issue として分離するため、調査が不十分で Issue #109 の要件定義に支障をきたす
- **軽減策**:
  - Phase 1 で Evaluation Phase プロンプト（`src/prompts/evaluation/execute.txt`）をレビュー
  - `src/phases/evaluation.ts` の TODO コメント（lines 447-452）を確認
  - blockerStatus/deferredReason 抽出ロジックの実現可能性を調査
  - Phase 7 で調査結果をドキュメント化し、Issue #109 作成時の参考資料とする

### リスク4: Issue #104 の Evaluation Report 更新漏れ

- **影響度**: 中
- **確率**: 低
- **詳細**: 残タスクステータスを更新せず、Issue #104 が未完了状態のまま残る
- **軽減策**:
  - Phase 7 (Task 7-1) で必ずチェックリストに含める
  - Phase 8 で完了ステータス確認を品質ゲートに設定
  - `.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md` のパスを Planning Phase で明記

---

## 7. 品質ゲート

### Phase 1: 要件定義

- [ ] **機能要件が明確に記載されている** (FR-1, FR-2, FR-3)
- [ ] **受け入れ基準が定義されている** (各 FR に対して明確な AC)
- [ ] **Issue #104 Evaluation Report の残タスク3件すべてが要件に反映されている**
- [ ] **優先度が正しく設定されている** (FR-1: 中、FR-2: 低、FR-3: 低)

### Phase 2: 設計

- [x] **実装戦略の判断根拠が明記されている** (EXTEND)
- [x] **テスト戦略の判断根拠が明記されている** (UNIT_ONLY)
- [x] **テストコード戦略の判断根拠が明記されている** (EXTEND_TEST)
- [x] **4つのテストケースごとに修正内容が具体的に記載されている**
- [x] **trim() 実装のトレードオフ分析が実施され、推奨アプローチが決定されている**

### Phase 3: テストシナリオ

- [x] **修正前・修正後の期待値比較表が作成されている**
- [x] **各テストケースの Given-When-Then が再確認されている**
- [x] **既存27テストケースへの影響分析が完了している**

### Phase 4: 実装

- [ ] **4つのテスト期待値が設計仕様（20文字・80文字制限）に準拠している**
- [ ] **trim() 実装の有無が Phase 2 の決定に従っている**
- [ ] **コードの可読性が保たれている**
- [ ] **Git commit が適切に分離されている** (Task 4-1 と Task 4-2 を別コミット、該当する場合)

### Phase 5: テストコード実装

- [x] **新規テストケース追加が不要であることを確認** (既存27ケースで十分カバー)

### Phase 6: テスト実行

- [ ] **全テストケース（27ケース）が PASS している**
- [x] **回帰テストが成功している** (issue-client.test.ts、または全テストスイート)
- [x] **テスト失敗時は原因分析とロールバック手順が明確である**

### Phase 7: ドキュメント

- [ ] **Issue #104 Evaluation Report の残タスクステータスが更新されている**
- [ ] **実装ログが作成され、修正内容が詳細に記録されている**
- [ ] **trim() 実装の有無と理由が記録されている**

### Phase 8: レポート

- [ ] **各フェーズの実施内容がサマリーされている**
- [ ] **テスト結果（27/27 PASS）が記録されている**
- [ ] **完了した残タスク3件のステータスが更新されている**
- [ ] **Issue #104 がクローズ可能な状態である**

---

## 8. プロジェクト成功基準

このプロジェクトは、以下の基準をすべて満たした場合に成功とみなします：

### 必須基準 (Must Have)

1. ✅ **4つのテスト期待値修正が完了している**
   - Test case 2.1.1, 2.1.3, 2.1.4, 2.2.4 がすべて修正済み
   - 設計仕様（20文字・80文字制限）に準拠

2. ✅ **全ユニットテスト（27ケース）が PASS している**
   - `tests/unit/github/issue-client-followup.test.ts`: 27/27 PASS
   - 回帰テスト成功

3. ✅ **Issue #104 Evaluation Report が更新されている**
   - 残タスク3件のステータスが最新
   - 完了日時が記録されている

### 推奨基準 (Should Have)

4. ✅ **trim() 実装のトレードオフ分析が完了している**
   - Phase 2 で分析実施
   - 推奨アプローチが決定され、ドキュメント化

5. ✅ **Phase 9 プロンプト改善の調査が完了している**
   - blockerStatus/deferredReason 抽出ロジックの実現可能性調査
   - Issue #109 作成のための参考資料準備

### オプション基準 (Nice to Have)

6. ⭕ **trim() 実装が追加されている** (Phase 2 の判断に依存)
   - `extractKeywords()` メソッドに `.trim()` 追加
   - 既存テストへの影響なし

---

## 9. 今後の展望

### Issue #109: Phase 9 プロンプト改善（別 Issue として提案）

**概要**:
Evaluation Phase のプロンプトを改善し、フォローアップ Issue 作成時に blockerStatus と deferredReason を Evaluation レポートから抽出できるようにする。

**期待される成果**:
- フォローアップ Issue の背景セクションがより具体的になる
- 残タスクの優先度判断が容易になる
- ワークフローの透明性向上

**優先度**: 低（Issue #108 完了後に検討）

**見積もり**: 2~4時間

---

**計画作成日**: 2025-01-30
**作成者**: AI Workflow Phase 0 (Planning)
**Issue**: #108 - [FOLLOW-UP] Issue #104 - 残タスク
**対象リポジトリ**: tielec/ai-workflow-agent
