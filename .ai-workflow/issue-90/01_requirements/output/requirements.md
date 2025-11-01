# 要件定義書 - Issue #90: フェーズ差し戻し機能の実装

**作成日**: 2025-01-30
**Issue番号**: #90
**プロジェクト**: AI Workflow Agent
**バージョン**: v0.4.0

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Document（`planning.md`）で策定された計画を確認し、以下の戦略を踏まえて要件定義を実施します：

**実装戦略**: EXTEND
- 既存の`MetadataManager`、`BasePhase`、`ContentParser`クラスに新規メソッドを追加
- 新規コマンド`rollback`を追加（`src/commands/rollback.ts`）
- 既存のワークフロー機構を維持しながら差し戻し機能を追加

**テスト戦略**: UNIT_INTEGRATION
- ユニットテスト: 各クラスの新規メソッドを個別に検証
- インテグレーションテスト: エンドツーエンドの差し戻しシナリオ（Phase 6 → Phase 4）を検証

**複雑度**: 中程度
**見積もり工数**: 12~16時間
**リスク評価**: 中

**クリティカルパス**:
Phase 1（要件定義）→ Phase 2（設計）→ Phase 3（テストシナリオ）→ Phase 4（実装）→ Phase 5（テストコード実装）→ Phase 6（テスト実行）→ Phase 7（ドキュメント）→ Phase 8（レポート）

---

## 1. 概要

### 1.1. 背景

Issue #49での経験から、レビューで前フェーズの問題が判明した際に、フェーズを差し戻して再実行する必要があることが判明しました。

**具体例（Issue #49）**:
- Phase 6 (testing) のレビューで「`PhaseExecutionResult`型に`approved`と`feedback`フィールドが不足している」という問題が判明
- この問題はPhase 4 (implementation)で発生したため、Phase 4に戻って修正する必要があった
- 手動でメタデータを編集して差し戻しを実施したが、5-10分の作業時間と編集ミスのリスクがあった

### 1.2. 現状の問題

1. **差し戻し理由の伝達不足（最重要問題）**:
   - なぜ差し戻されたのか、何を修正すべきかという情報がエージェントに伝達されない
   - 単にフェーズを戻すだけでは、エージェントは問題の本質を理解できない

2. **手動メタデータ編集の負担**:
   - `metadata.json`を手動で編集する必要があり、エラーが発生しやすい
   - JSON構造の理解が必要で、作業時間が5-10分かかる

3. **後続フェーズのリセット漏れリスク**:
   - 差し戻し時に後続フェーズの状態をリセットし忘れる可能性

### 1.3. 目的

**ビジネス価値**:
- ワークフロー効率化: 差し戻し作業時間を5-10分→10秒に短縮（95%削減）
- 品質向上: 人的ミスによるワークフロー破損の防止
- 開発生産性向上: エージェントが差し戻し理由を理解して適切な修正を実施可能

**技術的価値**:
- メタデータの一貫性保証: 自動化により後続フェーズリセット漏れを防止
- 監査証跡の確立: 差し戻し履歴の記録により、プロセス改善の分析が可能
- エージェントの自律性向上: コンテキスト情報により、人間の介入を最小化

### 1.4. スコープ

**対象範囲**:
- フェーズ差し戻しコマンド（`rollback`）の実装
- 差し戻し理由の記録・伝達メカニズム
- メタデータ自動更新
- 後続フェーズの自動リセット

**対象外**:
- 自動差し戻し機能（レビューFAIL時の自動提案）→ P2機能として将来検討
- 差し戻し履歴表示コマンド → P2機能として将来検討
- 後続フェーズディレクトリの物理削除 → P2機能として将来検討

---

## 2. 機能要件

### 2.1. フェーズ差し戻しコマンド（P0: 必須）

**要件ID**: FR-001
**優先度**: 高（P0）

#### 説明
`rollback`コマンドを実装し、指定したフェーズを特定のステップから再実行可能にする。

#### 必須引数
1. `--issue <NUM>`: Issue番号（整数値、1以上）
2. `--to-phase <PHASE_NAME>`: 差し戻し先フェーズ名（有効なフェーズ名: `planning`, `requirements`, `design`, `test-scenario`, `implementation`, `test-implementation`, `testing`, `documentation`, `report`, `evaluation`）
3. `--reason <TEXT>` または `--reason-file <PATH>`: 差し戻しの理由（必須、いずれか一方を指定）

#### オプション引数
1. `--to-step <STEP_NAME>`: 差し戻し先ステップ（`execute` | `review` | `revise`、デフォルト: `revise`）
2. `--from-phase <PHASE_NAME>`: 差し戻し元フェーズ（自動検出可能だが、明示的に指定可能）
3. `--force`: 確認プロンプトをスキップ
4. `--dry-run`: 変更内容のプレビュー（メタデータは変更しない）

#### コマンド例
```bash
# レビュー結果ファイルを指定して差し戻し（推奨）
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason-file .ai-workflow/issue-49/06_testing/review/result.md

# 理由を直接指定
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "型定義にapprovedとfeedbackフィールドが不足しています。src/types.tsを修正してください。"

# ドライラン
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason-file .ai-workflow/issue-49/06_testing/review/result.md \
  --dry-run

# execute ステップから再実行
node dist/index.js rollback --issue 49 --to-phase implementation --to-step execute \
  --reason "Phase 6のレビューで実装不備が判明。Phase 4を最初から再実装が必要。"
```

#### 成功条件
- コマンド実行後、対象フェーズの`status`が`in_progress`になる
- 対象フェーズの`current_step`が指定されたステップになる
- 後続フェーズが`pending`にリセットされる
- `rollback_context`フィールドが正しく設定される
- `ROLLBACK_REASON.md`が生成される

---

### 2.2. 差し戻し理由の記録と伝達（P0: 必須・最重要）

**要件ID**: FR-002
**優先度**: 高（P0）

#### 説明
差し戻し理由をメタデータに記録し、エージェントが理解できる形でプロンプトに注入する。これにより、エージェントは「なぜ差し戻されたのか」「何を修正すべきか」を正確に理解できる。

#### 2.2.1. メタデータへの記録

`metadata.json`の対象フェーズに`rollback_context`フィールドを追加：

```json
{
  "phases": {
    "implementation": {
      "status": "in_progress",
      "current_step": "revise",
      "rollback_context": {
        "triggered_at": "2025-01-30T12:34:56.789Z",
        "from_phase": "testing",
        "from_step": "review",
        "reason": "Type definition missing: PhaseExecutionResult needs approved and feedback fields",
        "review_result": "@.ai-workflow/issue-49/06_testing/review/result.md",
        "details": {
          "blocker_count": 2,
          "suggestion_count": 4,
          "affected_tests": ["StepExecutor", "PhaseRunner", "BasePhase integration"]
        }
      }
    }
  }
}
```

**フィールド仕様**:
- `triggered_at`: ISO 8601形式のタイムスタンプ（UTC）
- `from_phase`: 差し戻し元フェーズ名（文字列、省略可能）
- `from_step`: 差し戻し元ステップ名（`execute` | `review` | `revise`、省略可能）
- `reason`: 差し戻し理由（文字列、必須、1000文字以内）
- `review_result`: レビュー結果ファイルへの`@filepath`形式の参照（省略可能）
- `details`: 追加詳細情報（オブジェクト、省略可能）

#### 2.2.2. 差し戻し理由ドキュメントの生成

差し戻し時に、対象フェーズのディレクトリに`ROLLBACK_REASON.md`を自動生成：

**生成場所**: `.ai-workflow/issue-{NUM}/{phase}/ROLLBACK_REASON.md`

**内容例**:
```markdown
# Phase 4 (implementation) への差し戻し理由

**差し戻し元**: Phase 6 (testing) - review ステップ
**差し戻し日時**: 2025-01-30T12:34:56.789Z

## 差し戻しの理由

Type definition missing: PhaseExecutionResult needs approved and feedback fields

## 詳細情報

### ブロッカー（BLOCKER）

1. **型定義の不整合（Phase 4の実装不備）**
   - 問題: `PhaseExecutionResult`型に`approved`と`feedback`フィールドが定義されていない
   - 影響: StepExecutor、PhaseRunner、BasePhase統合テストがTypeScriptコンパイルエラーで全失敗
   - 対策: `src/types.ts`の`PhaseExecutionResult`型に`approved?: boolean`と`feedback?: string`を追加

### 参照ドキュメント

- レビュー結果: @.ai-workflow/issue-49/06_testing/review/result.md

### 修正後の確認事項

1. `src/types.ts`の`PhaseExecutionResult`型に`approved`と`feedback`フィールドを追加
2. TypeScriptビルドが成功することを確認（`npm run build`）
3. Phase 6でテストを再実行し、成功率が80%以上になることを確認
```

#### 2.2.3. revise プロンプトへの理由注入

`BasePhase.loadPrompt()`を拡張し、`rollback_context`が存在する場合はプロンプトの先頭に差し戻し理由を自動注入：

**注入されるプロンプトの例**:
```markdown
# ⚠️ 差し戻し情報

**このフェーズは Phase testing から差し戻されました。**

## 差し戻しの理由:
Type definition missing: PhaseExecutionResult needs approved and feedback fields

## 詳細情報:
- ブロッカー数: 2
- 影響を受けるテスト: StepExecutor, PhaseRunner, BasePhase integration

## 参照すべきドキュメント:
- @.ai-workflow/issue-49/06_testing/review/result.md
- @.ai-workflow/issue-49/06_testing/output/test-result.md

---

# Phase implementation - 修正プロンプト

## タスク概要

上記の差し戻し理由を踏まえ、以下の問題を修正してください：
...
```

#### 成功条件
- `rollback_context`フィールドがメタデータに正しく記録される
- `ROLLBACK_REASON.md`が指定された場所に生成される
- reviseステップのプロンプトに差し戻し理由が先頭に注入される
- 注入されたプロンプトがエージェントに渡される

---

### 2.3. メタデータ自動更新（P0: 必須）

**要件ID**: FR-003
**優先度**: 高（P0）

#### 説明
差し戻し時に対象フェーズのメタデータを自動的に更新する。

#### 対象フェーズの状態変更
1. `status`: `"in_progress"`に変更
2. `current_step`: 指定されたステップ（デフォルト: `"revise"`）に設定
3. `completed_steps`: 維持（execute, reviewは完了済みとして保持）
4. `completed_at`: `null`に設定
5. `rollback_context`: 差し戻し理由と詳細情報を記録（新規フィールド）

#### 後続フェーズのリセット
対象フェーズより後のすべてのフェーズについて：
1. `status`: `"pending"`に変更
2. `started_at`: `null`に設定
3. `completed_at`: `null`に設定
4. `current_step`: `null`に設定
5. `completed_steps`: `[]`（空配列）に設定
6. `retry_count`: `0`に設定

#### ワークフロー全体の更新
1. `current_phase`: 差し戻し先フェーズに変更
2. `updated_at`: 現在時刻（ISO 8601形式、UTC）に設定

#### 成功条件
- 対象フェーズの状態が正しく更新される
- 後続フェーズがすべてリセットされる
- `metadata.json`ファイルが正常に保存される

---

### 2.4. 差し戻し理由の入力方法（P0: 必須）

**要件ID**: FR-004
**優先度**: 高（P0）

#### 説明
差し戻し理由を複数の方法で入力可能にする。

#### 方法1: ファイル指定（推奨）
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason-file .ai-workflow/issue-49/06_testing/review/result.md
```

- レビュー結果ファイルから差し戻し理由を読み込む
- ファイルが存在しない場合はエラー
- ファイルサイズ上限: 100KB

#### 方法2: コマンドライン引数
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "型定義にapprovedとfeedbackフィールドが不足しています。"
```

- コマンドライン引数で直接理由を指定
- 文字数上限: 1000文字

#### 方法3: 対話的入力（P1: 重要）
```bash
node dist/index.js rollback --issue 49 --to-phase implementation --interactive
# プロンプトが表示される:
# "差し戻しの理由を入力してください（Ctrl+D で終了）:"
```

- 標準入力から複数行の理由を入力
- エディタ風の体験を提供

#### 成功条件
- `--reason`または`--reason-file`が指定されていない場合、エラーメッセージを表示
- ファイル指定時、ファイルが存在しない場合はエラー
- 理由が空文字列または空白のみの場合はエラー

---

### 2.5. バリデーション（P0: 必須）

**要件ID**: FR-005
**優先度**: 高（P0）

#### 説明
差し戻しコマンド実行前に前提条件をチェックし、不正な操作を防止する。

#### 前提条件チェック
1. **ワークフローメタデータの存在**:
   - `.ai-workflow/issue-{NUM}/metadata.json`が存在すること
   - 存在しない場合: `Error: Workflow metadata not found for issue {NUM}. Please run 'init' command first.`

2. **対象フェーズのステータス**:
   - 対象フェーズの`status`が`completed`または`in_progress`であること
   - `pending`の場合: `Error: Cannot rollback to phase '{phase}' because it has not been started yet.`

3. **差し戻し先ステップの有効性**:
   - `--to-step`の値が`execute`, `review`, `revise`のいずれかであること
   - 無効な値の場合: `Error: Invalid step '{step}'. Valid steps are: execute, review, revise.`

4. **差し戻し先フェーズの有効性**:
   - `--to-phase`の値が有効なフェーズ名であること
   - 無効な値の場合: `Error: Invalid phase name '{phase}'. Use 'list-presets' command to see valid phase names.`

5. **差し戻し理由の提供**:
   - `--reason`または`--reason-file`が指定されていること
   - いずれも指定されていない場合: `Error: Rollback reason is required. Use --reason or --reason-file option.`

#### 成功条件
- すべての前提条件チェックに合格した場合のみ、差し戻し処理を実行
- チェックに失敗した場合、適切なエラーメッセージを表示して終了

---

### 2.6. 確認プロンプト（P0: 必須）

**要件ID**: FR-006
**優先度**: 高（P0）

#### 説明
差し戻し実行前にユーザーに確認を求め、誤操作を防止する。

#### 確認メッセージ例
```
Warning: Rolling back to phase 'implementation' will reset the following phases:
  - implementation (current step: revise)
  - test-implementation (status: completed)
  - testing (status: completed)
  - documentation (status: in_progress)
  - report (status: pending)
  - evaluation (status: pending)

All progress in these phases will be lost.

Rollback reason: Type definition missing: PhaseExecutionResult needs approved and feedback fields

Do you want to continue? [y/N]:
```

#### 確認スキップ
`--force`オプションが指定されている場合、確認プロンプトをスキップして即座に実行。

#### CI環境での自動スキップ
`process.env.CI`が設定されている場合、自動的に確認をスキップ（CI環境ではユーザー入力不可のため）。

#### 成功条件
- 確認プロンプトで`y`または`yes`が入力された場合のみ、差し戻し処理を実行
- `n`、`no`、または空入力の場合は処理をキャンセル
- `--force`オプションまたはCI環境では確認をスキップ

---

### 2.7. ドライラン機能（P1: 重要）

**要件ID**: FR-007
**優先度**: 中（P1）

#### 説明
`--dry-run`オプションで、実際にメタデータを変更せずに差し戻し内容をプレビュー可能にする。

#### 表示内容
1. 対象フェーズの変更内容（`status`, `current_step`, `rollback_context`）
2. 後続フェーズのリセット内容
3. 生成される`ROLLBACK_REASON.md`のプレビュー

#### 出力例
```
[DRY RUN] Rollback preview for issue #49:

Target phase: implementation
  status: completed → in_progress
  current_step: null → revise
  rollback_context: (new)
    triggered_at: 2025-01-30T12:34:56.789Z
    from_phase: testing
    reason: Type definition missing...

Subsequent phases to be reset:
  - test-implementation: completed → pending
  - testing: completed → pending
  - documentation: in_progress → pending
  - report: pending → (unchanged)
  - evaluation: pending → (unchanged)

ROLLBACK_REASON.md content:
---
# Phase 4 (implementation) への差し戻し理由
...
---

[DRY RUN] No changes were made. Remove --dry-run to execute.
```

#### 成功条件
- ドライラン時、`metadata.json`は変更されない
- `ROLLBACK_REASON.md`は生成されない
- 差し戻し履歴（`rollback_history`）に記録されない

---

### 2.8. 差し戻し履歴の管理（P1: 重要）

**要件ID**: FR-008
**優先度**: 中（P1）

#### 説明
`metadata.json`のルートレベルに`rollback_history`フィールドを追加し、差し戻し履歴を監査ログとして記録する。

#### メタデータ構造
```json
{
  "rollback_history": [
    {
      "timestamp": "2025-01-30T12:34:56.789Z",
      "from_phase": "testing",
      "from_step": "review",
      "to_phase": "implementation",
      "to_step": "revise",
      "reason": "Type definition missing: PhaseExecutionResult needs approved and feedback fields",
      "triggered_by": "manual",
      "review_result_path": ".ai-workflow/issue-49/06_testing/review/result.md"
    }
  ]
}
```

#### フィールド仕様
- `timestamp`: 差し戻し実行時刻（ISO 8601形式、UTC）
- `from_phase`: 差し戻し元フェーズ（省略可能）
- `from_step`: 差し戻し元ステップ（省略可能）
- `to_phase`: 差し戻し先フェーズ（必須）
- `to_step`: 差し戻し先ステップ（必須）
- `reason`: 差し戻し理由（必須、1000文字以内）
- `triggered_by`: トリガー元（`manual` | `automatic`、現在は`manual`のみ）
- `review_result_path`: レビュー結果ファイルのパス（省略可能）

#### 成功条件
- 差し戻し実行時、`rollback_history`配列に新しいエントリが追加される
- 配列は時系列順（古い→新しい）に保持される
- ドライラン時は記録されない

---

### 2.9. revise完了後のrollback_contextクリア（P1: 重要）

**要件ID**: FR-009
**優先度**: 中（P1）

#### 説明
差し戻されたフェーズのreviseステップが正常に完了した後、`rollback_context`フィールドを自動的にクリアする。これにより、次回のフェーズ実行時に差し戻し情報が誤って表示されることを防ぐ。

#### 実装箇所
`BasePhase.run()`メソッド内で、reviseステップ完了後に`metadata.clearRollbackContext()`を呼び出す。

#### 成功条件
- reviseステップが正常に完了した後、`rollback_context`フィールドが`null`または削除される
- 次回のフェーズ実行時、差し戻し情報がプロンプトに注入されない

---

### 2.10. レビュー結果からのブロッカー情報自動抽出（P1: 重要）

**要件ID**: FR-010
**優先度**: 中（P1）

#### 説明
`--reason-file`オプションでレビュー結果ファイルを指定した場合、Markdownフォーマットから自動的にブロッカー情報（問題、影響、対策）を抽出する。

#### 抽出対象
1. **ブロッカー（BLOCKER）セクション**:
   - 問題: `PhaseExecutionResult`型に`approved`と`feedback`フィールドが定義されていない
   - 影響: StepExecutor、PhaseRunner、BasePhase統合テストがTypeScriptコンパイルエラーで全失敗
   - 対策: `src/types.ts`の`PhaseExecutionResult`型に`approved?: boolean`と`feedback?: string`を追加

2. **改善提案（SUGGESTION）セクション**:
   - 提案内容の一覧

#### 実装方法
`ContentParser`クラスに以下のメソッドを追加：

```typescript
interface ReviewBlocker {
  title: string;
  problem: string;
  impact: string;
  solution: string;
}

class ContentParser {
  extractBlockers(reviewResult: string): ReviewBlocker[] {
    // Markdownパース → ブロッカーセクションを抽出
  }

  extractSuggestions(reviewResult: string): string[] {
    // Markdownパース → 改善提案セクションを抽出
  }
}
```

#### 成功条件
- レビュー結果ファイルからブロッカー情報が正しく抽出される
- 抽出された情報が`rollback_context.details`に格納される
- `ROLLBACK_REASON.md`に抽出された情報が反映される

---

## 3. 非機能要件

### 3.1. パフォーマンス要件

**要件ID**: NFR-001
**優先度**: 中

#### 説明
差し戻しコマンドは迅速に実行され、ユーザーの待ち時間を最小化する。

#### 要求水準
- コマンド実行時間: 10秒以内（確認プロンプトを除く）
- メタデータ更新時間: 1秒以内
- `ROLLBACK_REASON.md`生成時間: 1秒以内

#### 測定方法
- ユニットテストでメタデータ更新処理の実行時間を測定
- インテグレーションテストでエンドツーエンドの実行時間を測定

---

### 3.2. セキュリティ要件

**要件ID**: NFR-002
**優先度**: 高

#### 説明
メタデータの整合性を保ち、不正なデータ注入を防止する。

#### 要求水準
1. **入力バリデーション**:
   - すべてのコマンドライン引数を厳格に検証
   - SQLインジェクション、コマンドインジェクション対策を実施

2. **パストラバーサル対策**:
   - `--reason-file`で指定されたパスが`.ai-workflow/`ディレクトリ内に限定されることを確認
   - `../`などの相対パスによる不正なファイルアクセスを防止

3. **メタデータ整合性**:
   - `metadata.json`の構造を検証し、不正なデータが書き込まれないようにする
   - JSONスキーマバリデーションを実施

#### 測定方法
- セキュリティテストで不正な入力パターンをテスト
- コードレビューでバリデーションロジックを確認

---

### 3.3. 可用性・信頼性要件

**要件ID**: NFR-003
**優先度**: 高

#### 説明
差し戻し処理が失敗した場合でも、メタデータの破損を防ぐ。

#### 要求水準
1. **トランザクション性**:
   - メタデータ更新は原子性（atomicity）を保証
   - 更新失敗時は元の状態にロールバック

2. **バックアップ**:
   - メタデータ更新前に自動バックアップを作成（`.ai-workflow/issue-{NUM}/metadata.json.bak.{timestamp}`）

3. **エラーハンドリング**:
   - すべてのエラーは適切にキャッチされ、ユーザーフレンドリーなメッセージを表示
   - スタックトレースは`--verbose`オプション時のみ表示

#### 測定方法
- エラーハンドリングテストで異常系をカバー
- インテグレーションテストでメタデータの整合性を検証

---

### 3.4. 保守性・拡張性要件

**要件ID**: NFR-004
**優先度**: 中

#### 説明
差し戻し機能のコードは保守しやすく、将来的な拡張が容易である。

#### 要求水準
1. **モジュール性**:
   - `src/commands/rollback.ts`を新規作成し、既存コードへの影響を最小化
   - `MetadataManager`、`BasePhase`、`ContentParser`への拡張は新規メソッド追加のみ

2. **コメント・ドキュメント**:
   - 新規追加メソッドにはJSDocコメントを記述
   - 差し戻し機能の使用方法をREADME.mdに追加

3. **テストカバレッジ**:
   - 新規コードのテストカバレッジ80%以上
   - ユニットテスト、インテグレーションテストを実装

#### 測定方法
- コードレビューでモジュール性を確認
- テストカバレッジレポートで80%以上を確認

---

### 3.5. 後方互換性要件

**要件ID**: NFR-005
**優先度**: 高

#### 説明
既存のワークフローに影響を与えず、新規フィールドはオプショナルとする。

#### 要求水準
1. **メタデータ構造**:
   - `rollback_context`および`rollback_history`フィールドはオプショナル
   - 既存の`metadata.json`は変更不要
   - 新規フィールドは差し戻し実行時に自動的に追加される

2. **既存フェーズへの影響**:
   - `BasePhase.loadPrompt()`の拡張は、`rollback_context`が存在しない場合は既存のロジックを維持
   - reviseステップのみに差し戻し情報を注入（executeとreviewステップには影響なし）

#### 測定方法
- インテグレーションテストで既存ワークフローへの影響を検証
- 既存のメタデータファイルを読み込んで正常に動作することを確認

---

## 4. 制約事項

### 4.1. 技術的制約

1. **TypeScript / Node.js**:
   - Node.js 20以上で動作すること
   - TypeScriptのビルドエラーがないこと
   - ESLintエラーがないこと

2. **既存アーキテクチャとの整合性**:
   - 既存の`BasePhase`クラスのライフサイクル（execute → review → revise）を維持
   - 既存の`MetadataManager`のメソッド命名規則に従う

3. **プロンプト管理**:
   - プロンプトテンプレートは`src/prompts/{phase}/revise.txt`を使用
   - 差し戻し情報はプロンプトの先頭に動的に注入

4. **Git操作への影響**:
   - 差し戻しコマンド自体はGitコミットを作成しない
   - 差し戻し後のフェーズ実行時に、通常通りGitコミットが作成される

### 4.2. リソース制約

1. **時間制約**:
   - 見積もり工数: 12~16時間
   - Phase 4（実装）: 4~6時間

2. **人員制約**:
   - AIエージェント単独での実装を想定
   - 人間のレビューはレビューステップで実施

### 4.3. ポリシー制約

1. **コーディング規約**:
   - CLAUDE.mdのロギング規約に従う（統一loggerモジュール使用）
   - CLAUDE.mdの環境変数アクセス規約に従う（Config クラス使用）
   - CLAUDE.mdのエラーハンドリング規約に従う（`as Error`禁止、error-utils使用）

2. **セキュリティポリシー**:
   - メタデータにシークレット情報を記録しない
   - Personal Access Tokenは自動的に除去される（既存のSecretMasker機構）

---

## 5. 前提条件

### 5.1. システム環境

1. **実行環境**:
   - Node.js 20以上
   - npm 10以上
   - Git 2.x以上

2. **ワークフロー初期化**:
   - `init`コマンドが実行済みであること
   - `.ai-workflow/issue-{NUM}/metadata.json`が存在すること

### 5.2. 依存コンポーネント

1. **既存モジュール**:
   - `MetadataManager`: メタデータの読み書き機能を提供
   - `BasePhase`: フェーズライフサイクル管理を提供
   - `ContentParser`: レビュー結果の解釈機能を提供

2. **新規モジュール**:
   - `src/commands/rollback.ts`: 差し戻しコマンドハンドラ（新規作成）

### 5.3. 外部システム連携

1. **Git**:
   - ローカルGitリポジトリが存在すること
   - 作業ディレクトリがクリーンであること（差し戻し時はコミット不要）

2. **GitHub**:
   - GitHub Issue番号が有効であること
   - `GITHUB_TOKEN`環境変数が設定されていること（進捗投稿用）

---

## 6. 受け入れ基準

### 6.1. 基本機能の受け入れ基準

#### AC-001: 差し戻しコマンドの実行

**Given**: Issue #49のワークフローが存在し、Phase 6 (testing)が完了している
**When**: 以下のコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "型定義にapprovedとfeedbackフィールドが不足しています。"
```
**Then**:
- コマンドが正常に終了する（終了コード0）
- Phase 4 (implementation)の`status`が`in_progress`になる
- Phase 4の`current_step`が`revise`になる
- Phase 5, 6, 7, 8, 9の`status`が`pending`になる
- `rollback_context`フィールドが設定される
- `ROLLBACK_REASON.md`が生成される

---

#### AC-002: レビュー結果ファイルからの差し戻し

**Given**: Issue #49のワークフローが存在し、Phase 6のレビュー結果ファイル（`.ai-workflow/issue-49/06_testing/review/result.md`）が存在する
**When**: 以下のコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason-file .ai-workflow/issue-49/06_testing/review/result.md
```
**Then**:
- コマンドが正常に終了する
- `rollback_context.reason`にレビュー結果ファイルの内容が設定される
- `rollback_context.review_result`にファイルパスが`@filepath`形式で設定される
- ブロッカー情報が`rollback_context.details`に抽出される（P1機能）

---

#### AC-003: 差し戻し理由のプロンプト注入

**Given**: Phase 4 (implementation)に`rollback_context`が設定されている
**When**: Phase 4のreviseステップを実行する
```bash
node dist/index.js execute --issue 49 --phase implementation
```
**Then**:
- reviseステップのプロンプトに差し戻し理由が先頭に注入される
- 注入されたプロンプトがエージェントに渡される
- エージェントが差し戻し理由を理解して修正を実施する

---

#### AC-004: revise完了後のrollback_contextクリア

**Given**: Phase 4 (implementation)に`rollback_context`が設定されており、reviseステップを実行する
**When**: reviseステップが正常に完了する
**Then**:
- `rollback_context`フィールドが`null`または削除される
- 次回のフェーズ実行時、差し戻し情報がプロンプトに注入されない

---

### 6.2. バリデーションの受け入れ基準

#### AC-005: 差し戻し理由が未指定の場合

**Given**: Issue #49のワークフローが存在する
**When**: `--reason`も`--reason-file`も指定せずにrollbackコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation
```
**Then**:
- エラーメッセージが表示される: `Error: Rollback reason is required. Use --reason or --reason-file option.`
- 終了コードが1になる
- メタデータは変更されない

---

#### AC-006: 無効なフェーズ名を指定した場合

**Given**: Issue #49のワークフローが存在する
**When**: 無効なフェーズ名を指定してrollbackコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase invalid-phase \
  --reason "test"
```
**Then**:
- エラーメッセージが表示される: `Error: Invalid phase name 'invalid-phase'. Use 'list-presets' command to see valid phase names.`
- 終了コードが1になる
- メタデータは変更されない

---

#### AC-007: 未開始のフェーズへの差し戻し

**Given**: Issue #49のワークフローが存在し、Phase 7 (documentation)が`pending`状態である
**When**: Phase 7に差し戻しを試みる
```bash
node dist/index.js rollback --issue 49 --to-phase documentation \
  --reason "test"
```
**Then**:
- エラーメッセージが表示される: `Error: Cannot rollback to phase 'documentation' because it has not been started yet.`
- 終了コードが1になる
- メタデータは変更されない

---

### 6.3. 確認プロンプトの受け入れ基準

#### AC-008: 確認プロンプトで`n`を入力した場合

**Given**: Issue #49のワークフローが存在する
**When**: rollbackコマンドを実行し、確認プロンプトで`n`を入力する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "test"
# 確認プロンプト: Do you want to continue? [y/N]: n
```
**Then**:
- 処理がキャンセルされる
- `Rollback cancelled.`というメッセージが表示される
- メタデータは変更されない

---

#### AC-009: --forceオプションで確認をスキップ

**Given**: Issue #49のワークフローが存在する
**When**: `--force`オプションを指定してrollbackコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "test" --force
```
**Then**:
- 確認プロンプトが表示されない
- 差し戻し処理が即座に実行される
- メタデータが更新される

---

### 6.4. ドライランの受け入れ基準

#### AC-010: ドライランで変更内容をプレビュー

**Given**: Issue #49のワークフローが存在する
**When**: `--dry-run`オプションを指定してrollbackコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "test" --dry-run
```
**Then**:
- 差し戻し内容のプレビューが表示される
- `[DRY RUN]`というプレフィックスが付く
- メタデータは変更されない
- `ROLLBACK_REASON.md`は生成されない
- `rollback_history`に記録されない

---

### 6.5. 差し戻し履歴の受け入れ基準

#### AC-011: 差し戻し履歴の記録

**Given**: Issue #49のワークフローが存在する
**When**: rollbackコマンドを実行する
```bash
node dist/index.js rollback --issue 49 --to-phase implementation \
  --reason "test" --force
```
**Then**:
- `metadata.json`の`rollback_history`配列に新しいエントリが追加される
- エントリに`timestamp`, `to_phase`, `to_step`, `reason`が含まれる

---

### 6.6. 後方互換性の受け入れ基準

#### AC-012: 既存ワークフローへの影響なし

**Given**: Issue #49のワークフローが存在し、`rollback_context`フィールドが存在しない
**When**: Phase 4のreviseステップを実行する
```bash
node dist/index.js execute --issue 49 --phase implementation
```
**Then**:
- 既存のロジックが正常に動作する
- プロンプトに差し戻し情報が注入されない
- エラーが発生しない

---

## 7. スコープ外

以下の機能は本Issueのスコープ外とし、将来的な拡張候補として記録します：

### 7.1. P2機能（あると良い）

1. **自動差し戻し提案機能**:
   - レビューステップで`FAIL`判定が出た場合、自動的に差し戻しを提案
   - ブロッカー情報を解析し、適切なフェーズを推定
   - ユーザーの承認を得て差し戻しを実行

2. **差し戻し履歴表示コマンド**:
   - `node dist/index.js rollback-history --issue <NUM>`
   - 過去の差し戻し履歴を一覧表示
   - 差し戻し理由と影響範囲を可視化

3. **後続フェーズディレクトリの物理削除**:
   - `--clean-subsequent-phases`オプション
   - 後続フェーズのディレクトリ（`execute/`, `review/`, `revise/`, `output/`）を物理削除
   - ディスク容量の削減とクリーンなワークフロー状態の維持

### 7.2. 将来的な機能拡張

1. **差し戻し理由のテンプレート化**:
   - よくある差し戻し理由をテンプレート化
   - `--template <NAME>`オプションでテンプレートを選択

2. **差し戻し影響範囲の可視化**:
   - 差し戻しによって影響を受けるフェーズとファイルを可視化
   - グラフ形式で表示（Mermaid図等）

3. **差し戻し統計の分析**:
   - プロジェクト全体での差し戻し頻度を分析
   - 問題が多いフェーズを特定し、プロセス改善に活用

---

## 8. 付録

### 8.1. 用語集

| 用語 | 説明 |
|------|------|
| フェーズ差し戻し | 特定のフェーズを以前の状態に戻し、再実行可能にする操作 |
| rollback_context | メタデータに記録される差し戻しコンテキスト情報（理由、元フェーズ、詳細等） |
| ROLLBACK_REASON.md | 差し戻し理由を記録したMarkdownドキュメント |
| ブロッカー | 次のフェーズに進めない重大な問題 |
| 改善提案 | 次のフェーズに進めるが、改善が推奨される事項 |
| 差し戻し履歴 | 過去の差し戻し操作の記録（`rollback_history`配列） |

### 8.2. 参考資料

- Issue #49: Phase 6 (testing) で Phase 4 (implementation) の型定義不備が判明し、手動差し戻しを実施
- Planning Document: `.ai-workflow/issue-90/00_planning/output/planning.md`
- CLAUDE.md: プロジェクトの全体方針とコーディングガイドライン
- ARCHITECTURE.md: アーキテクチャ設計思想

### 8.3. メタデータスキーマ例

```json
{
  "issue_number": 49,
  "current_phase": "implementation",
  "updated_at": "2025-01-30T12:34:56.789Z",
  "phases": {
    "implementation": {
      "status": "in_progress",
      "current_step": "revise",
      "completed_steps": ["execute", "review"],
      "rollback_context": {
        "triggered_at": "2025-01-30T12:34:56.789Z",
        "from_phase": "testing",
        "from_step": "review",
        "reason": "Type definition missing: PhaseExecutionResult needs approved and feedback fields",
        "review_result": "@.ai-workflow/issue-49/06_testing/review/result.md",
        "details": {
          "blocker_count": 2,
          "suggestion_count": 4,
          "affected_tests": ["StepExecutor", "PhaseRunner", "BasePhase integration"]
        }
      }
    },
    "test-implementation": {
      "status": "pending",
      "current_step": null,
      "completed_steps": []
    }
  },
  "rollback_history": [
    {
      "timestamp": "2025-01-30T12:34:56.789Z",
      "from_phase": "testing",
      "from_step": "review",
      "to_phase": "implementation",
      "to_step": "revise",
      "reason": "Type definition missing: PhaseExecutionResult needs approved and feedback fields",
      "triggered_by": "manual",
      "review_result_path": ".ai-workflow/issue-49/06_testing/review/result.md"
    }
  ]
}
```

---

## 9. 品質ゲートチェック

以下の品質ゲート（Phase 1の必須要件）を確認します：

- [x] **機能要件が明確に記載されている**
  - FR-001 ~ FR-010で機能要件を詳細に記述
  - 各要件にコマンド例、フィールド仕様、成功条件を明記

- [x] **受け入れ基準が定義されている**
  - AC-001 ~ AC-012でGiven-When-Then形式の受け入れ基準を記述
  - 正常系、異常系、エッジケースをカバー

- [x] **スコープが明確である**
  - セクション1.4でスコープを明記
  - セクション7でスコープ外を明記（P2機能、将来的な拡張）

- [x] **論理的な矛盾がない**
  - Planning Documentの戦略（EXTEND、UNIT_INTEGRATION）と整合
  - 機能要件と受け入れ基準が対応
  - 非機能要件と制約事項が矛盾していない

---

**作成者**: AI Workflow Agent (Phase 1: Requirements)
**レビュー対象**: Phase 1 品質ゲート（機能要件、受け入れ基準、スコープ、論理的整合性）
