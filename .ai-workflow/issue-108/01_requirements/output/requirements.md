# 要件定義書 - Issue #108

## 0. Planning Document の確認

Planning Document（`@.ai-workflow/issue-108/00_planning/output/planning.md`）の確認結果：

### 開発計画の全体像
- **複雑度**: 簡単（既存コードの軽微な修正のみ）
- **見積もり工数**: 2~3時間
- **実装戦略**: EXTEND（既存ファイルの拡張）
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルの修正のみ）

### 主要な技術的決定事項
1. **テスト期待値修正**: Issue #104 の Evaluation Report で特定された 4 つのテストケース期待値を修正
2. **trim() 実装**: オプショナル。Phase 2 のトレードオフ分析に基づいて実装の有無を判断
3. **Phase 9 プロンプト改善**: 調査のみ実施。実装は別 Issue (#109) として分離

### リスクと軽減策
- **リスク1**: テスト期待値修正の判断ミス → 設計書の再確認、各テストケースの Given-When-Then 再検証
- **リスク2**: trim() 実装による予期しない影響 → 影響範囲徹底分析、全テストスイート実行
- **リスク3**: Phase 9 プロンプト改善の調査不足 → プロンプトレビュー、TODO コメント確認
- **リスク4**: Issue #104 の Evaluation Report 更新漏れ → Phase 7 でチェックリスト化

---

## 1. 概要

### 背景
Issue #104「Follow-up Issue 作成機能の実装」の Evaluation Phase（Phase 9）において、3 件の残タスクが特定されました。これらのタスクは Issue #104 の主要機能（Follow-up Issue 自動作成）とは独立しており、優先度「中」1 件、優先度「低」2 件で構成されています。

### 目的
Issue #104 で実装した Follow-up Issue 作成機能の品質向上と、将来の機能拡張の基盤整備を目的とします。具体的には以下の 3 点を達成します：

1. **テスト品質の向上**: デザイン仕様（20 文字・80 文字制限）に準拠したテスト期待値への修正
2. **コード品質の向上**: キーワード抽出ロジックの改善検討（オプショナル）
3. **ワークフロー改善の基盤**: Phase 9 プロンプト改善の調査と Issue #109 作成のための情報収集

### ビジネス価値・技術的価値

**ビジネス価値**:
- **信頼性の向上**: テスト期待値が仕様に準拠することで、Follow-up Issue 作成機能の品質保証が強化される
- **保守性の向上**: テストコードが正確になることで、将来の機能拡張時の影響範囲を早期に検出可能
- **透明性の向上**: Phase 9 プロンプト改善により、残タスクの背景情報が充実し、Follow-up Issue の優先度判断が容易になる

**技術的価値**:
- **テストカバレッジの正確性**: 27 テストケース中 4 ケースの期待値を修正し、100% PASS の状態を実現
- **コード品質の一貫性**: trim() 実装によりキーワード抽出ロジックの堅牢性が向上（実装する場合）
- **ワークフロー改善の知見蓄積**: Phase 9 プロンプト改善の調査により、AI Workflow 全体の改善に寄与する知見を獲得

---

## 2. 機能要件

### FR-1: テスト期待値修正（優先度: 中）

**説明**:
Issue #104 の Evaluation Report（lines 193-210）で特定された 4 つのテストケースの期待値を、デザイン仕様（20 文字・80 文字制限）に準拠する形に修正します。

**対象テストケース**:
1. **Test case 2.1.1**: 20 文字切り詰めを考慮した期待値に修正
2. **Test case 2.1.3**: "Fix Jest configurati" (20 文字) に修正、またはテストデータ短縮
3. **Test case 2.1.4**: 末尾空白を含む 20 文字を期待値に設定、または trim() 実装
4. **Test case 2.2.4**: 80 文字以上のタイトル生成を保証するテストデータに修正

**成功条件**:
- 4 つのテストケースの期待値がデザイン仕様（`02_design/output/design.md`）に準拠している
- すべてのユニットテスト（27 ケース）が PASS する
- コードの可読性が保たれている

**失敗条件**:
- テスト期待値が 20 文字・80 文字制限の仕様に違反している
- テスト実行時に 1 件でも FAIL が発生する
- 期待値の修正により、テストケースの意図が不明瞭になる

---

### FR-2: extractKeywords() への trim() 追加検討（優先度: 低）

**説明**:
`src/core/github/issue-client.ts` の `extractKeywords()` メソッドに `.trim()` を追加し、キーワード末尾の空白を除去することで、Test case 2.1.4 の期待値修正を不要にします。この機能はオプショナルであり、Phase 2（Design）のトレードオフ分析に基づいて実装の有無を判断します。

**実装内容**:
- `keyword.substring(0, 20)` を `keyword.substring(0, 20).trim()` に変更
- 既存の 27 テストケースへの影響を分析
- 影響がある場合は、実装を見送り、テスト期待値修正のみで対応

**成功条件**:
- trim() 実装のトレードオフ分析が完了している（Phase 2）
- 実装する場合: 全テストケース（27 ケース）が PASS し、既存動作への影響がない
- 実装しない場合: テスト期待値修正のみで Test case 2.1.4 が解決する

**失敗条件**:
- トレードオフ分析が実施されていない
- 実装した結果、既存テストケースが FAIL する
- 実装しなかった場合、Test case 2.1.4 が未解決のまま残る

---

### FR-3: Phase 9 プロンプト改善の調査（優先度: 低）

**説明**:
Evaluation Phase のプロンプト（`src/prompts/evaluation/execute.txt`）をレビューし、フォローアップ Issue 作成時に `blockerStatus` と `deferredReason` を Evaluation レポートから抽出できるようにするための調査を実施します。実装は別 Issue (#109) として分離し、Issue #108 では調査と Issue #109 作成のための参考資料準備のみを実施します。

**調査内容**:
- Evaluation Phase プロンプト（`src/prompts/evaluation/execute.txt`）のレビュー
- `src/phases/evaluation.ts` の TODO コメント（lines 447-452）の確認
- `blockerStatus` と `deferredReason` 抽出ロジックの実現可能性調査
- Issue #109 作成時の参考資料として調査結果をドキュメント化

**成功条件**:
- Evaluation Phase プロンプトのレビューが完了している
- `blockerStatus` / `deferredReason` 抽出ロジックの実現可能性が調査されている
- 調査結果が Phase 7（Documentation）でドキュメント化されている
- Issue #109 作成のための十分な情報が収集されている

**失敗条件**:
- プロンプトレビューが実施されていない
- 抽出ロジックの実現可能性が不明確
- 調査結果がドキュメント化されておらず、Issue #109 作成時に情報不足となる

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **テスト実行時間**: 既存のユニットテスト（27 ケース）は 30 秒以内に完了すること
- **影響範囲**: テスト期待値修正および trim() 実装による既存機能のパフォーマンス劣化がないこと
- **Git 操作**: コミット・プッシュ操作は各 10 秒以内に完了すること

### NFR-2: セキュリティ要件

- **コード品質**: ESLint および TypeScript コンパイラのエラーが 0 件であること
- **機密情報**: テストデータに機密情報（トークン、パスワード等）を含まないこと
- **Git コミット**: コミットメッセージに機密情報を含まないこと

### NFR-3: 可用性・信頼性要件

- **テストカバレッジ**: 既存の 27 テストケースがすべて PASS すること（100% PASS）
- **回帰テスト**: `tests/unit/github/issue-client.test.ts` の既存テストに影響がないこと
- **ロールバック**: 修正が失敗した場合、Git コミットを revert して元の状態に戻せること

### NFR-4: 保守性・拡張性要件

- **コードの可読性**: テスト期待値の修正により、テストケースの意図が明確であること
- **ドキュメント整備**: 実装ログ（Phase 7）に修正内容が詳細に記録されていること
- **将来の拡張**: Phase 9 プロンプト改善の調査結果が Issue #109 作成の基盤となること

---

## 4. 制約事項

### 技術的制約

- **既存コードの尊重**: 新規ファイル作成は不要。既存ファイル（`tests/unit/github/issue-client-followup.test.ts`、`src/core/github/issue-client.ts`）の修正のみ
- **型定義の維持**: `src/types.ts` の型定義変更は不要。インターフェース変更なし
- **アーキテクチャの維持**: アーキテクチャ変更なし。既存のファサードパターン（GitHubClient）を維持
- **テストフレームワーク**: Jest を使用。設定ファイル（`jest.config.cjs`）の変更なし
- **Node.js バージョン**: Node.js 20 以上（`package.json` の `engines` フィールドに準拠）

### リソース制約

- **工数**: 合計 2~3 時間（Planning Document の見積もりに準拠）
- **フェーズ**: Phase 1（Requirements）〜 Phase 8（Report）を実施。Phase 9（Evaluation）は Issue #108 のスコープ外
- **CI/CD**: Jenkins 環境での実行時間は最大 30 分以内（タイムアウト制約）

### ポリシー制約

- **コーディング規約**: CLAUDE.md および ARCHITECTURE.md のコーディング規約に準拠
  - ロギング: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` を使用（`console.log` 禁止）
  - 環境変数: `config.getXxx()` メソッドを使用（`process.env` 直接アクセス禁止）
  - エラーハンドリング: `getErrorMessage()`, `getErrorStack()` を使用（`as Error` 型アサーション禁止）
- **Git コミットメッセージ**: `[ai-workflow] Phase {number} ({name}) - {step} completed` 形式を使用
- **セキュリティ**: Personal Access Token を metadata.json に記録しない（v0.3.1 以降の制約）

---

## 5. 前提条件

### システム環境

- **Node.js**: 20 以上
- **npm**: 10 以上
- **TypeScript**: 5.x（`package.json` の `devDependencies` に準拠）
- **Jest**: 29.x（テストフレームワーク）
- **Git**: 2.x 以上（コミット・プッシュ操作）

### 依存コンポーネント

- **Issue #104**: 完了済み（Evaluation Phase まで実施済み）
- **Evaluation Report**: `.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md` が存在すること
- **Design Document**: `.ai-workflow/issue-104/02_design/output/design.md` が存在すること（20 文字・80 文字制限の仕様確認用）
- **既存テストファイル**: `tests/unit/github/issue-client-followup.test.ts` が存在すること

### 外部システム連携

- **GitHub**: GitHub API を使用した Issue コメント投稿、PR 更新（`GITHUB_TOKEN` 必須）
- **Git リモートリポジトリ**: コミット・プッシュ先として `origin` リモートが設定されていること
- **AI エージェント**: Codex または Claude Code（`CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` 必須）

---

## 6. 受け入れ基準

### AC-1: テスト期待値修正の完了（FR-1 に対応）

**Given**: Issue #104 の Evaluation Report で特定された 4 つのテストケース期待値が不正確である
**When**: テスト期待値をデザイン仕様（20 文字・80 文字制限）に準拠する形に修正する
**Then**:
- 4 つのテストケース（2.1.1, 2.1.3, 2.1.4, 2.2.4）の期待値がすべて修正されている
- `npm test tests/unit/github/issue-client-followup.test.ts` を実行し、27/27 PASS である
- テストケースの意図（Given-When-Then）が明確に記述されている

---

### AC-2: trim() 実装のトレードオフ分析完了（FR-2 に対応）

**Given**: Test case 2.1.4 の期待値修正に `trim()` 実装が有効な選択肢として存在する
**When**: Phase 2（Design）で trim() 実装のトレードオフ分析を実施する
**Then**:
- トレードオフ分析結果が Phase 2 のドキュメントに記録されている
- 実装 vs. テスト期待値修正のメリット・デメリット比較が明記されている
- 推奨アプローチ（実装する / しない）が決定されている
- 実装する場合: 全テストケース（27 ケース）が PASS し、既存動作への影響がない
- 実装しない場合: テスト期待値修正のみで Test case 2.1.4 が解決している

---

### AC-3: Phase 9 プロンプト改善の調査完了（FR-3 に対応）

**Given**: Evaluation Phase のプロンプトが `blockerStatus` と `deferredReason` を抽出していない
**When**: Phase 9 プロンプトをレビューし、抽出ロジックの実現可能性を調査する
**Then**:
- Evaluation Phase プロンプト（`src/prompts/evaluation/execute.txt`）のレビューが完了している
- `src/phases/evaluation.ts` の TODO コメント（lines 447-452）の内容を確認済みである
- `blockerStatus` / `deferredReason` 抽出ロジックの実現可能性が評価されている
- 調査結果が Phase 7（Documentation）でドキュメント化されている
- Issue #109 作成のための十分な情報（技術的アプローチ、見積もり、リスク）が収集されている

---

### AC-4: Issue #104 Evaluation Report の更新完了

**Given**: Issue #104 の Evaluation Report に 3 件の残タスクが記録されている
**When**: Issue #108 で残タスクを完了し、Evaluation Report を更新する
**Then**:
- `.ai-workflow/issue-104/09_evaluation/output/evaluation_report.md` の残タスクセクションが更新されている
- 完了したタスクにチェックマーク（`- [x]`）が追加されている
- 完了日時が記録されている
- Issue #104 がクローズ可能な状態である

---

### AC-5: 全ユニットテストの成功（非機能要件 NFR-3 に対応）

**Given**: テスト期待値修正および trim() 実装（該当する場合）が完了している
**When**: 全ユニットテストを実行する
**Then**:
- `npm test tests/unit/github/issue-client-followup.test.ts` を実行し、27/27 PASS である
- `npm test tests/unit/github/issue-client.test.ts` を実行し、すべてのテストが PASS である
- trim() 実装を選択した場合、全テストスイート（`npm test`）が PASS である
- テスト実行時間が 30 秒以内である

---

### AC-6: ドキュメント整備の完了（非機能要件 NFR-4 に対応）

**Given**: 実装が完了している
**When**: Phase 7（Documentation）で実装ログを作成する
**Then**:
- 実装ログが作成され、修正内容が詳細に記録されている
- 修正したテスト期待値の詳細（修正前・修正後の比較）が記録されている
- trim() 実装の有無と理由が記録されている
- Phase 9 プロンプト改善の調査結果がドキュメント化されている

---

## 7. スコープ外

以下の項目は Issue #108 のスコープ外とし、別途対応します：

### 明確にスコープ外とする事項

1. **Phase 9 プロンプト改善の実装**:
   - 理由: Issue #108 では調査のみを実施し、実装は別 Issue (#109) として分離
   - 影響: Phase 9 プロンプトの実装は Issue #109 で実施

2. **新規テストケースの追加**:
   - 理由: 既存の 27 テストケースで十分にカバーされており、新規追加は不要
   - 影響: テストカバレッジは現状維持（27 ケース）

3. **型定義の変更**:
   - 理由: テスト期待値修正および trim() 実装は型定義変更を伴わない
   - 影響: `src/types.ts` は変更なし

4. **アーキテクチャの変更**:
   - 理由: 既存のファサードパターン（GitHubClient）を維持し、軽微な修正のみ実施
   - 影響: `src/core/github-client.ts` のファサード構造は変更なし

5. **他のテストファイルの修正**:
   - 理由: 影響範囲は `tests/unit/github/issue-client-followup.test.ts` のみ
   - 影響: 他のテストファイル（`issue-client.test.ts` 等）は変更なし

### 将来的な拡張候補

以下の項目は Issue #108 のスコープ外ですが、将来的な拡張候補として記録します：

1. **Issue #109: Phase 9 プロンプト改善の実装**:
   - 内容: Evaluation Phase のプロンプトを改善し、`blockerStatus` と `deferredReason` を Evaluation レポートから抽出できるようにする
   - 優先度: 低
   - 見積もり: 2~4 時間（Planning Document の見積もり）

2. **Follow-up Issue タイトル生成ロジックの改善**:
   - 内容: Issue #108 で「そもそも論として、issue のタイトル作成も LLM を使ったほうがいい」という指摘があるため、LLM を使用したタイトル生成ロジックを検討
   - 優先度: 低
   - 見積もり: 未定（要調査）

3. **キーワード抽出ロジックの拡張**:
   - 内容: 現在の 20 文字制限を超えて、より柔軟なキーワード抽出（例: 重要度に応じた文字数調整）を実現
   - 優先度: 低
   - 見積もり: 未定（要調査）

---

**作成日**: 2025-01-30
**作成者**: AI Workflow Phase 1 (Requirements)
**Issue**: #108 - [FOLLOW-UP] Issue #104 - 残タスク
**対象リポジトリ**: tielec/ai-workflow-agent
