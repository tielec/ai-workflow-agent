# 要件定義書

**Issue番号**: #271
**タイトル**: feat(rollback): Add auto mode with agent-based rollback target detection
**作成日**: 2025-12-07
**バージョン**: 1.0

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 実装戦略
- **EXTEND戦略**: 既存の `rollback.ts` に `auto` サブコマンドを追加する形で実装
- 既存関数（`executeRollback()` 等）を再利用してコード重複を回避
- CLI パーサー拡張とエージェント統合ロジックの追加のみで実現可能

### テスト戦略
- **UNIT_INTEGRATION戦略**: ユニットテストと統合テストの両方で網羅的にカバー
- JSON パース処理、バリデーション、confidence 制御ロジックを個別にテスト
- エージェント呼び出しからロールバック実行までのエンドツーエンドの動作を確認

### テストコード戦略
- **BOTH_TEST戦略**: 既存テストの拡張 + 新規テストファイルの作成
- 既存 rollback コマンドのリグレッションテストを拡張
- auto モード専用のテストファイル（`rollback-auto.test.ts`）を作成

### リスク
- エージェント出力の不安定性（高影響、中確率）→ JSON形式明示、複数抽出パターン、フォールバック処理で軽減
- エージェント判断精度の問題（中影響、中確率）→ confidence制御、dry-runモード、analysisフィールド表示で軽減

### 工数見積もり
- **複雑度**: 中程度
- **見積もり工数**: 12~16時間
- **8つのフェーズ**に分割してタスク管理

---

## 1. 概要

### 背景
現在の `rollback` コマンドは、差し戻し先フェーズ（`--to-phase`）、ステップ（`--to-step`）、理由（`--reason`）を手動で指定する必要があります。しかし、Review 実行後であれば、エージェント（Codex/Claude）が `metadata.json` と最新の生成ドキュメント（レビュー結果、テスト結果）を分析することで、差し戻しの必要性と適切な差し戻し先を自動判断できます。

### 目的
`rollback auto` サブコマンドを追加し、AIエージェントによる自動判断により、以下を実現します：

1. **差し戻しの必要性判断**: ワークフロー状態を分析し、差し戻しが必要かを自動判定
2. **差し戻し先の特定**: 問題の根本原因があるフェーズとステップを特定
3. **差し戻し理由の生成**: 具体的な問題箇所と修正内容を含む差し戻し理由を生成
4. **ユーザー体験の向上**: 手動判断の負担を軽減し、適切な差し戻しを迅速に実行

### ビジネス価値
- **開発効率の向上**: 手動でログを分析して差し戻し先を判断する時間を削減
- **判断精度の向上**: AIによる包括的な分析により、最適な差し戻し先を特定
- **学習コストの低減**: 新規メンバーでも適切な差し戻しが可能

### 技術的価値
- **既存機能との統合**: 既存の rollback ロジックを再利用し、コード重複を回避
- **エージェント活用**: Codex/Claude の推論能力を活用した高度な判断機能
- **段階的なフォールバック**: エージェント判断 → ユーザー確認 → 手動モードの多段階対応

---

## 2. スコープ

### 対象範囲（In Scope）

#### 2.1 CLI サブコマンド
- `rollback auto` サブコマンドの追加
- `--dry-run`、`--force`、`--agent` オプションのサポート
- 既存 `rollback` コマンドとの統合

#### 2.2 エージェント判断機能
- metadata.json の状態分析
- レビュー結果ファイル（`review_result.md`）の解析
- テスト結果ファイル（Testing Phase の場合）の解析
- 差し戻し先フェーズとステップの自動決定
- 差し戻し理由の自動生成

#### 2.3 確認プロンプト
- confidence レベル（high/medium/low）に基づく確認制御
- `--force` オプションによる確認スキップ（high confidence のみ）
- dry-run モードでの実行プレビュー

#### 2.4 エラーハンドリング
- JSON パース失敗時のフォールバック
- ファイル未発見時のエラーメッセージ
- エージェント呼び出し失敗時のフォールバック

### 対象外範囲（Out of Scope）

#### 2.5 Phase 1では実装しない機能
- 複数フェーズへの連続差し戻し（将来拡張）
- 差し戻し履歴の可視化UI（将来拡張）
- 差し戻し理由のテンプレート提案機能（将来拡張）
- エージェント判断精度の学習・改善機能（将来拡張）

#### 2.6 既存機能の変更
- 既存 `rollback` コマンドの動作変更（完全な後方互換性を維持）
- metadata.json のスキーマ変更（既存フィールドの変更なし）

---

## 3. 機能要件

### 3.1 CLI仕様

#### 3.1.1 基本コマンド構文

```bash
node dist/index.js rollback auto --issue <NUM> [options]
```

#### 3.1.2 必須引数

| 引数 | 型 | 説明 | 例 |
|------|-----|------|-----|
| `--issue` | `number` | 対象のIssue番号 | `--issue 271` |

#### 3.1.3 オプション引数

| オプション | 型 | デフォルト値 | 説明 |
|-----------|-----|------------|------|
| `--dry-run` | `boolean` | `false` | プレビューモード（実際には差し戻さない） |
| `--force` | `boolean` | `false` | 確認プロンプトをスキップ（high confidence のみ） |
| `--agent` | `'auto' \| 'codex' \| 'claude'` | `'auto'` | 使用するエージェント |

#### 3.1.4 使用例

```bash
# 基本的な使用方法
node dist/index.js rollback auto --issue 271

# プレビューモード（dry-run）
node dist/index.js rollback auto --issue 271 --dry-run

# 確認スキップ（high confidence のみ）
node dist/index.js rollback auto --issue 271 --force

# エージェント指定
node dist/index.js rollback auto --issue 271 --agent codex
```

### 3.2 エージェント判断ロジック

#### 3.2.1 エージェント入力情報

エージェントに以下の情報を `@filepath` 形式で提供：

| 情報源 | ファイルパス | 必須/任意 | 説明 |
|--------|------------|----------|------|
| ワークフロー状態 | `@.ai-workflow/issue-{NUM}/metadata.json` | 必須 | フェーズステータス、completed_steps、current_phase、retry_count、rollback_history |
| レビュー結果 | `@.ai-workflow/issue-{NUM}/{phase}/review/review_result.md` | 任意 | 最新フェーズのレビュー結果 |
| テスト結果 | `@.ai-workflow/issue-{NUM}/06_testing/output/test-result.md` | 任意 | Testing Phase のテスト結果 |

**metadata.json の必須フィールド**:
- `phases[].status`: `'pending' | 'in_progress' | 'completed' | 'failed'`
- `phases[].completed_steps`: `StepName[]`
- `current_phase`: `PhaseName | null`
- `rollback_history`: `RollbackHistoryEntry[]`（過去の差し戻し履歴）

#### 3.2.2 プロンプト設計

プロンプトファイル: `src/prompts/rollback/auto-analyze.txt`

**プロンプト構造**:
```
あなたはAI Workflowの差し戻し判断エージェントです。
以下の情報を分析し、差し戻しが必要かどうか、必要な場合はどのフェーズに戻るべきかを判断してください。

## ワークフロー状態
@.ai-workflow/issue-{issue_number}/metadata.json

## 最新のレビュー結果（存在する場合）
{latest_review_result_reference}

## テスト結果（Testing Phase の場合）
{test_result_reference}

## 判断基準

1. **差し戻し不要のケース**
   - すべてのフェーズが正常に完了している
   - 現在のフェーズで対処可能な問題のみ

2. **差し戻しが必要なケース**
   - レビュー結果に BLOCKER が存在し、前段フェーズの修正が必要
   - テスト失敗が実装の問題に起因する
   - 設計や要件の根本的な問題が発覚

3. **差し戻し先の決定**
   - 問題の根本原因があるフェーズを特定
   - 最小限の差し戻しで問題を解決できるフェーズを選択

## 出力形式（JSON）

以下の形式で出力してください：

```json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあるため、Implementation Phase で修正が必要です。",
  "confidence": "high",
  "analysis": "Testing Phase で 3 件のテストが失敗しています。"
}
```

または差し戻し不要の場合：

```json
{
  "needs_rollback": false,
  "reason": "すべてのテストが成功しており、差し戻しは不要です。",
  "confidence": "high",
  "analysis": "Testing Phase の結果を確認しましたが、全テストが成功しています。"
}
```
```

**テンプレート変数**:
- `{issue_number}`: Issue番号
- `{latest_review_result_reference}`: 最新のレビュー結果ファイルパス（`@filepath` 形式）
- `{test_result_reference}`: テスト結果ファイルパス（`@filepath` 形式）

#### 3.2.3 エージェント出力フォーマット

**TypeScript 型定義**:
```typescript
interface RollbackDecision {
  needs_rollback: boolean;
  to_phase?: PhaseName; // needs_rollback=true の場合は必須
  to_step?: StepName;   // 'execute' | 'review' | 'revise'、デフォルト: 'revise'
  reason: string;       // 差し戻し理由（ROLLBACK_REASON.md に記載）
  confidence: 'high' | 'medium' | 'low'; // 判断の信頼度
  analysis: string;     // 判断根拠の詳細説明
}

type PhaseName =
  | 'planning'
  | 'requirements'
  | 'design'
  | 'test_scenario'
  | 'implementation'
  | 'test_implementation'
  | 'testing'
  | 'documentation'
  | 'report'
  | 'evaluation';

type StepName = 'execute' | 'review' | 'revise';
```

**confidence レベルの判断基準**:
- `high`: 問題原因が明確で、差し戻し先が確実に特定できる
- `medium`: 問題原因が推定でき、差し戻し先が妥当と思われる
- `low`: 問題原因が不明確、または差し戻し先の判断に不確実性がある

#### 3.2.4 JSON パース処理

**パース戦略**（複数パターンでフォールバック）:
1. **パターン1**: マークダウンコードブロック内のJSON（`` ```json ... ``` ``）
2. **パターン2**: プレーンテキスト内のJSON（`{...}` を検索）
3. **パターン3**: JSON 開始（`{`）と終了（`}`）を探索して抽出
4. **フォールバック**: パース失敗時はエラーメッセージを返し、手動モードを案内

**バリデーション**:
- `needs_rollback` フィールドの存在チェック（boolean型）
- `needs_rollback=true` の場合、`to_phase` の必須チェック
- `to_phase` の値が有効な PhaseName かチェック
- `to_step` の値が `'execute' | 'review' | 'revise'` のいずれかかチェック
- `confidence` の値が `'high' | 'medium' | 'low'` のいずれかかチェック

### 3.3 確認プロンプト制御

#### 3.3.1 confidence レベルに基づく確認

| confidence | `--force` なし | `--force` あり |
|-----------|--------------|--------------|
| `high` | 確認プロンプト表示 | スキップ（自動実行） |
| `medium` | 確認プロンプト表示（必須） | 確認プロンプト表示（必須） |
| `low` | 確認プロンプト表示（必須） | 確認プロンプト表示（必須） |

**確認プロンプトの内容**:
```
[INFO] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: test_implementation
  - To Step: revise

[INFO] Analysis:
  Testing Phase で 3 件のユニットテストが失敗しています。
  失敗内容を分析した結果、test-implementation.ts のテストケースが
  最新の実装変更に追従していないことが原因です。

[INFO] Reason:
  テストコードの修正が必要です。
  - test_commitRollback_converts_paths: 絶対パス変換のアサーションを追加
  - test_filterExistingFiles_handles_absolute_paths: テストデータを更新

[CONFIRM] Proceed with rollback to test_implementation (step: revise)? [y/N]:
```

#### 3.3.2 dry-run モード

`--dry-run` オプション指定時の動作:
1. エージェント判断を実行
2. 判断結果を表示（analysis、reason を含む）
3. **実際の差し戻しは実行しない**
4. 終了コード: 0（正常終了）

**出力例**:
```
[DRY-RUN] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: implementation
  - To Step: revise

[DRY-RUN] Analysis:
  テスト失敗の原因が実装にあります。

[DRY-RUN] Reason:
  commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落しています。

[DRY-RUN] Rollback would be executed to: implementation (step: revise)
[DRY-RUN] No actual rollback performed.
```

### 3.4 既存機能との統合

#### 3.4.1 `executeRollback()` の再利用

`rollback auto` コマンドは、エージェント判断後に既存の `executeRollback()` 関数を呼び出します。

**既存機能の再利用範囲**:
- metadata.json の更新（`updatePhaseForRollback()`, `resetSubsequentPhases()`）
- rollback_history への記録（`addRollbackHistory()`）
- ROLLBACK_REASON.md の生成
- Git コミット & プッシュ

**新規追加処理**:
- エージェント判断ロジック
- JSON パース処理
- confidence レベルに基づく確認プロンプト制御

#### 3.4.2 後方互換性の保証

既存の `rollback` コマンド（手動モード）の動作は**一切変更しません**:
```bash
# 既存コマンド（変更なし）
node dist/index.js rollback --issue 271 --to-phase implementation --reason "Fix bug"
```

---

## 4. 非機能要件

### 4.1 パフォーマンス要件

| 項目 | 要件 | 目標値 |
|------|------|--------|
| エージェント呼び出しタイムアウト | 最大許容時間 | 120秒 |
| JSON パース処理時間 | 最大許容時間 | 5秒 |
| ファイル読み込み | 最大ファイルサイズ | 10MB（metadata.json、レビュー結果、テスト結果の合計） |
| レスポンスタイム（dry-run） | ユーザー体感時間 | 5秒以内（エージェント呼び出しを除く） |

### 4.2 セキュリティ要件

#### 4.2.1 データの機密性
- エージェントに送信するデータに機密情報（APIキー、認証情報）が含まれないことを確認
- metadata.json、レビュー結果、テスト結果に機密情報が含まれる場合は警告

#### 4.2.2 ログファイルのセキュリティ
- エージェント出力ログ（`agent_log.md`）に機密情報が含まれないことを確認
- ログファイルのパーミッション設定（読み取り権限の制限）

#### 4.2.3 Git操作の認証
- 既存のGit認証情報（`GITHUB_TOKEN`）を使用
- 強制プッシュは使用しない（既存の rollback と同様）

#### 4.2.4 エラーメッセージの情報漏洩防止
- エラーメッセージにファイルパスの絶対パスを含めない
- エラーメッセージにAPIキーやトークンを含めない

### 4.3 保守性要件

#### 4.3.1 コードの可読性
- 既存のコーディング規約（CLAUDE.md、ARCHITECTURE.md）に従う
- 関数は単一責任原則（SRP）に従い、最大100行以内

#### 4.3.2 テストカバレッジ
- ユニットテスト: 80%以上
- 統合テスト: 主要シナリオ（成功、失敗、エラー）をカバー

#### 4.3.3 エラーハンドリング
- すべての外部呼び出し（エージェント、ファイルI/O）でtry-catchを使用
- エラーメッセージは具体的で、ユーザーが対処方法を理解できる内容

---

## 5. 受け入れ基準

### 5.1 機能受け入れ基準

#### AC-1: CLI サブコマンドの動作
**条件**: `rollback auto --issue <NUM>` を実行する
**期待結果**:
- エージェントが metadata.json、レビュー結果、テスト結果を分析
- 差し戻しの必要性と差し戻し先を判断
- 判断結果（needs_rollback、to_phase、to_step、reason、confidence、analysis）を表示
- confidence レベルに応じて確認プロンプトを表示
- ユーザー確認後、差し戻しを実行

#### AC-2: dry-run モードの動作
**条件**: `rollback auto --issue <NUM> --dry-run` を実行する
**期待結果**:
- エージェント判断を実行
- 判断結果を表示
- 実際の差し戻しは実行されない
- metadata.json が更新されない
- ROLLBACK_REASON.md が作成されない

#### AC-3: confidence レベルに基づく確認制御
**条件**: エージェントが `confidence: high` で判断し、`--force` オプションを指定する
**期待結果**:
- 確認プロンプトがスキップされる
- 差し戻しが自動実行される

**条件**: エージェントが `confidence: medium` で判断し、`--force` オプションを指定する
**期待結果**:
- 確認プロンプトが表示される（`--force` でもスキップされない）

#### AC-4: エージェント指定
**条件**: `rollback auto --issue <NUM> --agent codex` を実行する
**期待結果**:
- Codex エージェントが使用される
- Claude エージェントへのフォールバックは発生しない

#### AC-5: 差し戻し不要の判断
**条件**: エージェントが `needs_rollback: false` と判断する
**期待結果**:
- "差し戻しは不要です" というメッセージを表示
- 差し戻しが実行されない
- 終了コード: 0（正常終了）

### 5.2 非機能要件受け入れ基準

#### AC-6: JSON パース処理の堅牢性
**条件**: エージェントが不正なJSON（カンマ抜け、ダブルクォート不足）を返す
**期待結果**:
- 複数のパースパターンでフォールバック処理が実行される
- フォールバック失敗時は適切なエラーメッセージを表示
- 手動モード（`rollback --to-phase <phase> --reason <reason>`）を案内

#### AC-7: ファイル未発見時のエラーハンドリング
**条件**: metadata.json が存在しない
**期待結果**:
- "ワークフローメタデータが見つかりません" というエラーメッセージを表示
- `init` コマンドの実行を案内
- 終了コード: 1（エラー）

**条件**: レビュー結果ファイルが存在しない
**期待結果**:
- エージェントにレビュー結果なしの情報を提供
- エージェントが利用可能な情報（metadata.json のみ）で判断
- 判断が困難な場合は `confidence: low` を返す

#### AC-8: エージェント呼び出し失敗時のフォールバック
**条件**: エージェント呼び出しがタイムアウトまたはエラーを返す
**期待結果**:
- 代替エージェント（Codex → Claude、またはその逆）にフォールバック
- 両方失敗した場合は適切なエラーメッセージを表示
- 手動モードを案内

#### AC-9: 既存機能との統合
**条件**: `rollback auto` で差し戻しを実行する
**期待結果**:
- 既存の `executeRollback()` 関数が呼び出される
- metadata.json が正しく更新される（`updatePhaseForRollback()`, `resetSubsequentPhases()`）
- rollback_history に履歴が追加される（`addRollbackHistory()`）
- ROLLBACK_REASON.md が生成される
- Git コミット & プッシュが実行される

#### AC-10: 後方互換性
**条件**: 既存の `rollback` コマンド（手動モード）を実行する
**期待結果**:
- 既存の動作が一切変更されない
- `rollback auto` の追加による影響がない

---

## 6. ユースケース

### 6.1 成功シナリオ

#### UC-1: テスト失敗による自動差し戻し
**前提条件**:
- Testing Phase でテストが失敗している
- テスト結果ファイル（`test-result.md`）が存在する

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. エージェントが metadata.json とテスト結果を分析
3. エージェントが「テスト失敗の原因が実装にある」と判断
4. `needs_rollback: true`, `to_phase: "implementation"`, `to_step: "revise"`, `confidence: "high"` を返す
5. 確認プロンプトを表示
6. ユーザーが "y" を入力
7. `executeRollback()` が呼び出され、差し戻しが実行される

**期待結果**:
- metadata.json の `phases.implementation.status` が `in_progress` に更新
- rollback_history に履歴が追加
- ROLLBACK_REASON.md が生成
- Git コミット & プッシュが実行

#### UC-2: レビューBLOCKERによる自動差し戻し
**前提条件**:
- Requirements Phase のレビューで BLOCKER が検出されている
- レビュー結果ファイル（`review_result.md`）が存在する

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. エージェントが metadata.json とレビュー結果を分析
3. エージェントが「要件定義に根本的な問題がある」と判断
4. `needs_rollback: true`, `to_phase: "planning"`, `to_step: "revise"`, `confidence: "medium"` を返す
5. 確認プロンプトを表示（`--force` でもスキップされない）
6. ユーザーが "y" を入力
7. `executeRollback()` が呼び出され、差し戻しが実行される

**期待結果**:
- metadata.json の `phases.planning.status` が `in_progress` に更新
- rollback_history に履歴が追加
- ROLLBACK_REASON.md が生成
- Git コミット & プッシュが実行

### 6.2 失敗シナリオ

#### UC-3: JSON パース失敗
**前提条件**:
- エージェントが不正なJSON（構文エラー）を返す

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. エージェントが不正なJSONを返す
3. 複数のパースパターンでフォールバック処理が実行される
4. すべてのパターンで失敗

**期待結果**:
- エラーメッセージ: "エージェントの出力をパースできませんでした。手動モードをお試しください。"
- 手動モード（`rollback --to-phase <phase> --reason <reason>`）の使用例を表示
- 終了コード: 1（エラー）

#### UC-4: metadata.json 未発見
**前提条件**:
- `init` コマンドが実行されていない
- metadata.json が存在しない

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. metadata.json の読み込みに失敗

**期待結果**:
- エラーメッセージ: "ワークフローメタデータが見つかりません。先に `init` コマンドを実行してください。"
- 終了コード: 1（エラー）

#### UC-5: エージェント呼び出しタイムアウト
**前提条件**:
- エージェントが120秒以内に応答しない

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. エージェント呼び出しがタイムアウト
3. 代替エージェントにフォールバック
4. 代替エージェントも失敗

**期待結果**:
- エラーメッセージ: "エージェント呼び出しがタイムアウトしました。手動モードをお試しください。"
- 終了コード: 1（エラー）

### 6.3 エッジケース

#### UC-6: 差し戻し不要の判断
**前提条件**:
- すべてのフェーズが正常に完了している
- レビュー結果に BLOCKER がない

**実行フロー**:
1. ユーザーが `rollback auto --issue 271` を実行
2. エージェントが `needs_rollback: false` と判断

**期待結果**:
- メッセージ: "差し戻しは不要です。すべてのフェーズが正常に完了しています。"
- 終了コード: 0（正常終了）

#### UC-7: confidence: low の判断
**前提条件**:
- エージェントが問題原因を特定できない
- `confidence: "low"` を返す

**実行フロー**:
1. ユーザーが `rollback auto --issue 271 --force` を実行
2. エージェントが `confidence: "low"` で判断
3. 確認プロンプトが表示される（`--force` でもスキップされない）

**期待結果**:
- 警告メッセージ: "エージェントの判断信頼度が低いため、手動で確認してください。"
- 確認プロンプトを表示
- ユーザーが "n" を入力した場合、差し戻しがキャンセルされる

---

## 7. データモデル

### 7.1 RollbackDecision 型

```typescript
/**
 * エージェントが返す差し戻し判断結果
 */
interface RollbackDecision {
  /**
   * 差し戻しが必要かどうか
   */
  needs_rollback: boolean;

  /**
   * 差し戻し先のフェーズ（needs_rollback=true の場合は必須）
   */
  to_phase?: PhaseName;

  /**
   * 差し戻し先のステップ（デフォルト: 'revise'）
   */
  to_step?: StepName;

  /**
   * 差し戻し理由（ROLLBACK_REASON.md に記載される）
   * 具体的な問題箇所と修正内容を含む
   */
  reason: string;

  /**
   * 判断の信頼度
   * - high: 問題原因が明確で、差し戻し先が確実
   * - medium: 問題原因が推定でき、差し戻し先が妥当
   * - low: 問題原因が不明確、または判断に不確実性がある
   */
  confidence: 'high' | 'medium' | 'low';

  /**
   * 判断根拠の詳細説明
   * ユーザーが判断の妥当性を評価するための情報
   */
  analysis: string;
}
```

### 7.2 metadata.json 参照フィールド

```typescript
/**
 * metadata.json の関連フィールド
 */
interface WorkflowState {
  phases: {
    [phase in PhaseName]: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      completed_steps: StepName[];
      retry_count: number;
      // ... 他のフィールド
    };
  };
  current_phase: PhaseName | null;
  rollback_history: RollbackHistoryEntry[];
  // ... 他のフィールド
}

interface RollbackHistoryEntry {
  triggered_at: string; // ISO 8601 形式
  from_phase: PhaseName;
  to_phase: PhaseName;
  to_step: StepName;
  reason: string;
  mode: 'manual' | 'auto'; // 追加フィールド（auto モードの履歴を識別）
}
```

---

## 8. エラーハンドリング

### 8.1 異常系ケース一覧

| エラーケース | エラーメッセージ | 終了コード | 対処方法 |
|------------|----------------|----------|---------|
| metadata.json 未発見 | "ワークフローメタデータが見つかりません。先に `init` コマンドを実行してください。" | 1 | `init` コマンドを実行 |
| JSON パース失敗 | "エージェントの出力をパースできませんでした。手動モードをお試しください。" | 1 | `rollback --to-phase <phase> --reason <reason>` を使用 |
| エージェント呼び出し失敗 | "エージェント呼び出しに失敗しました。手動モードをお試しください。" | 1 | 手動モードを使用、またはエージェント設定を確認 |
| エージェントタイムアウト | "エージェント呼び出しがタイムアウトしました（120秒）。手動モードをお試しください。" | 1 | 手動モードを使用 |
| 不正な to_phase 値 | "エージェントが不正なフェーズ名を返しました: {to_phase}" | 1 | 手動モードを使用 |
| 不正な to_step 値 | "エージェントが不正なステップ名を返しました: {to_step}" | 1 | 手動モードを使用 |
| confidence フィールド欠落 | "エージェントの出力に confidence フィールドがありません。" | 1 | 手動モードを使用 |
| ファイル読み込み失敗 | "ファイルの読み込みに失敗しました: {filepath}" | 1 | ファイルの存在とパーミッションを確認 |
| ユーザーキャンセル | "差し戻しがキャンセルされました。" | 0 | （正常終了） |

### 8.2 フォールバック戦略

#### 8.2.1 JSON パース失敗時
1. パターン1: マークダウンコードブロック内のJSON
2. パターン2: プレーンテキスト内のJSON
3. パターン3: JSON 開始・終了探索
4. フォールバック: エラーメッセージ + 手動モード案内

#### 8.2.2 エージェント呼び出し失敗時
1. プライマリエージェント（`--agent` 指定、または `auto` モードで Codex）
2. セカンダリエージェント（Claude へフォールバック）
3. フォールバック: エラーメッセージ + 手動モード案内

#### 8.2.3 ファイル未発見時
- metadata.json 未発見: エラー（必須ファイル）
- レビュー結果未発見: 警告 + エージェントに "レビュー結果なし" の情報を提供
- テスト結果未発見: 警告 + エージェントに "テスト結果なし" の情報を提供

---

## 9. 実装計画

### 9.1 タスク分割（Planning Phaseより）

#### Task 1: CLI サブコマンド構造の追加
- [ ] `rollback auto` サブコマンドを main.ts に追加
- [ ] `handleRollbackAutoCommand()` ハンドラを作成
- [ ] オプション定義（`--dry-run`, `--force`, `--agent`）
- [ ] バリデーション処理

#### Task 2: コンテキスト収集
- [ ] metadata.json の読み込みと状態分析
- [ ] 最新のレビュー結果ファイルの特定
- [ ] テスト結果ファイルの特定（Testing Phase の場合）
- [ ] ファイル参照形式（`@filepath`）の生成

#### Task 3: エージェント統合
- [ ] 判断用プロンプトテンプレートの作成（`src/prompts/rollback/auto-analyze.txt`）
- [ ] エージェント呼び出しロジック（Codex/Claude）
- [ ] JSON 出力のパースとバリデーション
- [ ] フォールバック処理（パース失敗、エージェント失敗）

#### Task 4: 確認と実行
- [ ] confidence レベルに基づく確認プロンプト
- [ ] 既存の `executeRollback()` への委譲
- [ ] dry-run モードの対応
- [ ] rollback_history への mode フィールド追加

#### Task 5: ユニットテスト
- [ ] JSON パース処理のテスト（複数パターン）
- [ ] バリデーション処理のテスト
- [ ] confidence 制御ロジックのテスト
- [ ] エラーハンドリングのテスト

#### Task 6: 統合テスト
- [ ] エージェント呼び出しからロールバック実行までのE2Eテスト
- [ ] dry-run モードのテスト
- [ ] confidence レベル別の動作テスト

#### Task 7: ドキュメント更新
- [ ] CLAUDE.md の更新（rollback auto の使用方法）
- [ ] ARCHITECTURE.md の更新（rollback auto の設計）

#### Task 8: リグレッションテスト
- [ ] 既存 rollback コマンドのテスト（後方互換性確認）

### 9.2 ファイル構成

```
src/
├── commands/
│   └── rollback.ts          # 既存 + auto モード追加
├── prompts/
│   └── rollback/
│       └── auto-analyze.txt  # 新規: エージェント判断プロンプト
tests/
├── unit/
│   └── rollback-auto.test.ts # 新規: auto モード専用ユニットテスト
└── integration/
    └── rollback.test.ts      # 拡張: auto モード統合テスト
```

---

## 10. 制約事項

### 10.1 技術的制約
- エージェントAPIのトークン数制限（入力: 約200K tokens、出力: 約8K tokens）
- JSON パースの不確実性（エージェント出力の形式が多様）
- ファイルサイズ制限（metadata.json、レビュー結果、テスト結果の合計 10MB）

### 10.2 ビジネス制約
- 既存 rollback コマンドの動作を変更しない（完全な後方互換性）
- metadata.json のスキーマ変更は最小限（rollback_history の mode フィールドのみ追加）

### 10.3 スコープ制約
- Phase 1 では単一フェーズへの差し戻しのみサポート（複数フェーズの連続差し戻しは将来拡張）
- エージェント判断精度の学習・改善機能は将来拡張

---

## 11. 前提条件

### 11.1 ワークフロー状態
- `init` コマンドが実行されており、metadata.json が存在する
- 少なくとも1つのフェーズが完了している

### 11.2 エージェント認証
- `CODEX_API_KEY` または `OPENAI_API_KEY`（Codex 使用時）
- `CLAUDE_CODE_OAUTH_TOKEN` または `CLAUDE_CODE_API_KEY`（Claude 使用時）

### 11.3 Git 環境
- 作業ディレクトリがGitリポジトリである
- `GITHUB_TOKEN` が設定されている
- リモートブランチへのプッシュ権限がある

---

## 12. 関連Issue

- **Issue #90**: Rollback コマンド実装（基本機能）
- **Issue #269**: rollback の絶対パス問題修正
- **Issue #267**: Testing Phase KillShell 問題

---

## 13. 変更履歴

| バージョン | 日付 | 変更内容 | 著者 |
|-----------|------|---------|------|
| 1.0 | 2025-12-07 | 初版作成 | AI Workflow Agent |

---

## 14. 承認

この要件定義書は、Planning Phase（Phase 0）で策定された開発計画に基づいています。

**Planning Document参照**: @.ai-workflow/issue-271/00_planning/output/planning.md

**レビュー必須項目**:
- [ ] 機能要件が明確に記載されている
- [ ] 受け入れ基準が定義されている
- [ ] スコープが明確である
- [ ] 論理的な矛盾がない

---

## 付録A: プロンプトテンプレート例

**ファイル**: `src/prompts/rollback/auto-analyze.txt`

```
あなたはAI Workflowの差し戻し判断エージェントです。
以下の情報を分析し、差し戻しが必要かどうか、必要な場合はどのフェーズに戻るべきかを判断してください。

## ワークフロー状態
@.ai-workflow/issue-{issue_number}/metadata.json

## 最新のレビュー結果（存在する場合）
{latest_review_result_reference}

## テスト結果（Testing Phase の場合）
{test_result_reference}

## 判断基準

1. **差し戻し不要のケース**
   - すべてのフェーズが正常に完了している
   - 現在のフェーズで対処可能な問題のみ

2. **差し戻しが必要なケース**
   - レビュー結果に BLOCKER が存在し、前段フェーズの修正が必要
   - テスト失敗が実装の問題に起因する
   - 設計や要件の根本的な問題が発覚

3. **差し戻し先の決定**
   - 問題の根本原因があるフェーズを特定
   - 最小限の差し戻しで問題を解決できるフェーズを選択

## 出力形式（JSON）

以下の形式で出力してください：

\`\`\`json
{
  "needs_rollback": true,
  "to_phase": "implementation",
  "to_step": "revise",
  "reason": "テスト失敗の原因が実装にあるため、Implementation Phase で修正が必要です。\n\n失敗したテスト:\n- test_commitRollback_converts_paths: 絶対パス変換ロジックが未実装\n- test_filterExistingFiles_handles_absolute_paths: パス結合の問題",
  "confidence": "high",
  "analysis": "Testing Phase で 3 件のテストが失敗しています。失敗内容を分析した結果、commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落していることが原因です。"
}
\`\`\`

または差し戻し不要の場合：

\`\`\`json
{
  "needs_rollback": false,
  "reason": "すべてのテストが成功しており、差し戻しは不要です。",
  "confidence": "high",
  "analysis": "Testing Phase の結果を確認しましたが、全テストが成功しています。"
}
\`\`\`

## 注意事項

- confidence が "low" の場合、ユーザーに確認を求めます
- reason は差し戻し先フェーズの revise ステップで参照されます
- 具体的なファイル名や問題箇所を含めてください
```

---

## 付録B: 出力例

### B.1 成功時の出力

```
$ node dist/index.js rollback auto --issue 271

[INFO] Analyzing workflow state with agent...
[INFO] Using Claude Agent for rollback analysis

[INFO] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: test_implementation
  - To Step: revise

[INFO] Analysis:
  Testing Phase で 3 件のユニットテストが失敗しています。
  失敗内容を分析した結果、test-implementation.ts のテストケースが
  最新の実装変更に追従していないことが原因です。

[INFO] Reason:
  テストコードの修正が必要です。
  - test_commitRollback_converts_paths: 絶対パス変換のアサーションを追加
  - test_filterExistingFiles_handles_absolute_paths: テストデータを更新

[CONFIRM] Proceed with rollback to test_implementation (step: revise)? [y/N]: y

[INFO] Executing rollback...
[INFO] ROLLBACK_REASON.md generated at .ai-workflow/issue-271/ROLLBACK_REASON.md
[INFO] Metadata updated: test_implementation -> in_progress
[INFO] Subsequent phases reset to pending
[INFO] Rollback committed: abc1234
[INFO] Rollback completed successfully.
```

### B.2 dry-run 時の出力

```
$ node dist/index.js rollback auto --issue 271 --dry-run

[DRY-RUN] Analyzing workflow state with agent...
[DRY-RUN] Using Claude Agent for rollback analysis

[DRY-RUN] Agent analysis complete:
  - Needs rollback: Yes
  - Confidence: high
  - To Phase: implementation
  - To Step: revise

[DRY-RUN] Analysis:
  テスト失敗の原因が実装にあります。

[DRY-RUN] Reason:
  commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落しています。

[DRY-RUN] Rollback would be executed to: implementation (step: revise)
[DRY-RUN] No actual rollback performed.
```

### B.3 エラー時の出力

```
$ node dist/index.js rollback auto --issue 999

[ERROR] ワークフローメタデータが見つかりません。先に `init` コマンドを実行してください。

使用方法:
  node dist/index.js init --issue-url https://github.com/owner/repo/issues/999
```

---

**以上、要件定義書 完**
