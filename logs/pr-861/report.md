# 影響範囲調査レポート

## サマリー
- 発見事項の件数: 10 件（INV-001: 5 件 / INV-002: 5 件）
- 重要度内訳: `warning` 1 件、`info` 9 件
- 重要な注意点:
  - `addCost()` / `updateCostTracking()` の新引数 `agent?` / `model?` はオプショナルで、既存呼び出しとの後方互換性が維持されている。プロダクションコードの呼び出し箇所（`src/phases/core/agent-executor.ts`、`src/commands/pr-comment/execute.ts`）は diff 内で同時に 5 引数化済み。
  - `WorkflowState.migrate()` は execute/review/rollback/pr-comment 経路では自動起動されないが、`addCost()` 内の `tracking.model_usage ??= {}` による遅延初期化で NullReference を回避している。
  - `PRCommentMetadataManager` 側には `migrate()` 相当の処理が無く、旧 `comment-resolution-metadata.json` は自動マイグレーションされない。ただし防御的コードで実行時エラーは発生しない設計。
  - `WorkflowState.migrate()` の `else if` チェーン追加は局所最適であり、将来 `cost_tracking` にフィールドを追加する際の保守性に懸念あり（`warning`）。
  - INV-003（呼び出し元網羅の最終確認）はガードレール（タイムアウト）により未完了。

## 発見事項

### INV-001: 共有リソース変更

#### 1. `addCost()` / `updateCostTracking()` のプロダクション呼び出し箇所はすべて更新済み（severity: info）
- プロダクションコード内の `addCost()` / `updateCostTracking()` 呼び出しは 2 箇所のみで、本 PR の diff はその両方に `agent`/`model` 引数を追加している。既存呼び出しの漏れは確認されなかった。
- 証拠:
  - `src/phases/core/agent-executor.ts:543` — `this.metadata.addCost(metrics.inputTokens, metrics.outputTokens, metrics.totalCostUsd);`（diff で `metrics.agent` / `metrics.model` を追加し 5 引数化）
  - `src/commands/pr-comment/execute.ts:284` — `await metadataManager.updateCostTracking(costTracking.inputTokens, costTracking.outputTokens, costTracking.costUsd);`（diff で `costTrackingMetadata.agent` / `costTrackingMetadata.model` を追加し 5 引数化）
  - `src/core/metadata-manager.ts:193` — 定義側 `MetadataManager.addCost`。diff で `agent?` / `model?` をオプショナル追加、既存呼び出しは型エラーにならない。
  - `src/core/pr-comment/metadata-manager.ts:257` — 定義側 `PRCommentMetadataManager.updateCostTracking`。diff でオプショナル引数追加、既存 3 引数呼び出しは後方互換で動作。

#### 2. `CostTracking` / `ModelUsageEntry` 型拡張による破壊影響なし（severity: info）
- `CostTracking` は `src/types.ts` と `src/types/pr-comment.ts` で内部定義され、プロダクションコードから名前付きで import している箇所は存在しない（参照は `WorkflowMetadata.cost_tracking` / `CommentResolutionMetadata.cost_tracking` 経由のみ）。
- `model_usage?` と `ModelUsageEntry` はオプショナル/新規型のため既存利用者のコンパイルに影響しない。
- 証拠:
  - `src/types.ts:237` — `CostTracking` 定義（`src/` 全体で import 検索しても定義ファイル 2 箇所と型参照のみヒット）
  - `src/types/pr-comment.ts:208` — `CostTracking` 定義（`import type { ModelUsageEntry } from '../types.js';` で循環依存なし）

#### 3. `analyzer_model` が response-plan.md に表示されない（severity: info）
- `src/commands/pr-comment/analyze/markdown-builder.ts:14` は `plan.analyzer_agent` を出力しているが、diff で追加された `plan.analyzer_model` は出力に含まれていない。機能要件上は execute 側でのみ参照されるため支障はないが、人間向け出力（response-plan.md）にモデル情報が反映されない。
- fallback plan では `analyzer_agent: 'fallback'` のみ設定され、`analyzer_model` は未設定。execute 側の `resolvePlanCostTrackingMetadata()` は `analyzer_agent === 'claude' | 'codex'` かつ `analyzer_model` が truthy な時のみモデル情報を返すため、fallback 経路ではモデル別集計が行われず合計値のみ更新される（意図的な後方互換挙動）。
- 証拠:
  - `src/commands/pr-comment/analyze/markdown-builder.ts:14` — `md += `- Analyzer Agent: ${plan.analyzer_agent}\n\n`;`
  - `src/commands/pr-comment/analyze/markdown-builder.ts:45` — `buildFallbackPlan()` は `analyzer_agent: 'fallback'` のみ設定し `analyzer_model` を含めない
  - `src/phases/formatters/progress-formatter.ts` — `cost_tracking` / `total_cost_usd` / `total_input_tokens` の Grep ヒットなし（表示系への波及影響なし）

#### 4. 既存テストの旧シグネチャ呼び出しは後方互換検証として機能（severity: info）
- テストコード内に旧シグネチャ（3 引数）での `addCost()` / `updateCostTracking()` 呼び出しが残存しているが、後方互換（合計値のみ更新・model_usage は初期化されない）を検証するテストとして機能している。diff で新しい 5 引数テストケースも同時追加されており網羅性は担保。
- 証拠:
  - `tests/unit/metadata-manager.test.ts:79` — 3 引数呼び出しテスト（既存）+ diff で 5 引数テスト複数追加
  - `tests/unit/pr-comment/metadata-manager.test.ts:243` — 3 引数呼び出しテスト + diff で「records model-specific cost tracking when agent and model are provided」テスト追加
  - `tests/integration/metadata-persistence.test.ts:54` — 3 引数呼び出し + diff で「統合テスト: モデル別コスト追跡が永続化され、再読み込み後も保持される」追加
  - `src/core/metadata-manager.ts:193` — `if (agent && model)` 分岐により、agent/model 未指定時は `model_usage` 更新をスキップし `tracking.total_*` のみ加算

#### 5. `UsageMetrics` 型の必須フィールド追加は影響限定的（severity: info）
- `UsageMetrics` 型（`src/phases/core/agent-executor.ts` ローカル型）への `agent`/`model` 必須フィールド追加について、`getLastExecutionMetrics()` の戻り値型も影響を受けるが、外部参照は `tests/unit/phases/core/agent-executor.test.ts` のみで、diff 内で同テストも更新済み。
- 証拠:
  - `src/phases/core/agent-executor.ts:265` — `getLastExecutionMetrics(): UsageMetrics | null`（`src/` 配下で他呼び出しなし）
  - `tests/unit/phases/core/agent-executor.test.ts:488` — diff で `metrics?.agent` / `metrics?.model` 期待値追加

---

### INV-002: マイグレーション波及

#### 6. PR コメント metadata にはマイグレーション処理なし、ただし遅延初期化で代用（severity: info）
- `PRCommentMetadataManager.load()` は単純な `JSON.parse` のみで `migrate()` 相当のメソッドも存在しない。`.ai-workflow/pr-*/comment-resolution-metadata.json` には自動マイグレーションが効かない。
- ただし `updateCostTracking()` では `this.metadata!.cost_tracking.model_usage ??= {};` により呼び出し時に遅延初期化されるため、旧フォーマット metadata でも実行時例外は発生しない（マイグレーション未実施を防御的コードで代用）。
- 証拠:
  - `src/core/pr-comment/metadata-manager.ts:89` — `load()` は `JSON.parse(content) as CommentResolutionMetadata` のみ
  - `src/core/pr-comment/metadata-manager.ts:257` — `updateCostTracking` 実装で `model_usage ??= {};` による遅延初期化
  - `src/commands/pr-comment/{init,analyze,execute,finalize}.ts` — いずれも `load()` のみで `migrate()` 相当処理を呼ばない

#### 7. `WorkflowState.migrate()` は execute/review/rollback 経路では自動起動されない（severity: info）
- `MetadataManager` コンストラクタは `WorkflowState.load()` のみで `migrate()` を自動呼び出ししない。明示的に `migrate()` を呼ぶ経路は `src/commands/init.ts:306` と `src/core/metadata-manager.ts:57` の `ensurePhaseData()`（欠落フェーズ遭遇時の遅延マイグレーション）のみ。
- `execute`/`review`/`rollback`/`pr-comment` 経路では旧フォーマット metadata を読み込んでもマイグレーションが走らないが、`addCost()` 内の `tracking.model_usage ??= {};` により null 安全にアクセスされ実行時エラーにはならない。
- 証拠:
  - `src/core/metadata-manager.ts:43` — コンストラクタで `WorkflowState.load(metadataPath)` のみ、`migrate()` なし
  - `src/core/metadata-manager.ts:57` — `ensurePhaseData()` 内での遅延 `migrate()`（フェーズ欠落時のみ）
  - `src/commands/init.ts:305` — init コマンドでのみ明示的に `state.migrate()`
  - `src/commands/review.ts:29` — `WorkflowState.load()` のみ、`migrate()` なし

#### 8. `migrate()` の `else if` チェーンは将来の拡張性に懸念（severity: warning）
- diff で追加された `WorkflowState.migrate()` のマイグレーション条件は、既存の `if (!this.data.cost_tracking)` に `else if (!('model_usage' in this.data.cost_tracking) || !this.data.cost_tracking.model_usage)` としてぶら下がる形。将来 `cost_tracking` に別フィールド（例: `by_phase`）を追加する場合、同じ `else if` チェーンに続けるか独立した `if` にするかで挙動が変わるため、保守性の観点で可読性リスクがある。
- `design_decisions` のマイグレーションは `else { for (const key of Object.keys(template.design_decisions)) { if (!(key in this.data.design_decisions)) { ... } } }` のようにキー毎ループで拡張しやすい構造になっており、`cost_tracking` も将来的にはこのパターンに揃えると保守性が高まる。
- 証拠:
  - `src/core/workflow-state.ts:193` — 現行コードは `cost_tracking` 存在チェックのみ。diff は `else if` 追加
  - `src/core/workflow-state.ts:176` — `design_decisions` はループ方式で拡張容易

#### 9. `metadata.json.template` と `PRCommentMetadataManager.initialize()` の二重管理（severity: info）
- `metadata.json.template` の `cost_tracking` に `model_usage: {}` が追加されるため、`WorkflowState.createNew()` および `migrate()` 内の `{ ...template.cost_tracking }` 経由で新規データには必ず `model_usage: {}` が設定される。
- 一方 PR コメント側の `PRCommentMetadataManager.initialize()` では直接リテラルで `cost_tracking` を初期化しており、`metadata.json.template` とは別管理。将来 `CostTracking` 型にフィールドを追加する際は両方の初期化コードを更新する必要がある。
- 証拠:
  - `metadata.json.template:15` — 現行テンプレート（diff で `"model_usage": {}` 追加）
  - `src/core/pr-comment/metadata-manager.ts:67` — 初期化はリテラル手書き（diff で `model_usage: {}` 追加）
  - `src/core/workflow-state.ts:196` — `this.data.cost_tracking = { ...template.cost_tracking };`（テンプレート経由）

#### 10. 後方互換性の設計と仕様上の留意点（severity: info）
- diff 実装では `addCost()` / `updateCostTracking()` とも `??=` による遅延初期化で NullReference エラーを回避。マイグレーションが効かないケースでも後方互換性が担保される。
- ただし `agent`/`model` が指定されない 3 引数呼び出しでは `model_usage` を触らないため、旧データでは `model_usage` フィールドが生成されないまま使われ続ける（永続的に undefined/欠落のまま）。仕様として許容されている。
- 証拠:
  - `tests/unit/metadata-manager.test.ts` — 「エッジケース: model_usage未初期化でも自動初期化して記録できる」で検証
  - `tests/unit/metadata-manager.test.ts` — 「エッジケース: agentまたはmodelが欠けている場合はmodel_usageを更新しない」で仕様検証（`undefined` のまま維持）
  - `src/core/metadata-manager.ts:193` — 現行 3 引数実装から diff で `??=` 付き 5 引数実装へ

## ガードレール
- 到達の有無: **到達あり**
- 詳細: タイムアウト（334秒 / 300秒上限）により、全調査観点のうち INV-003 が未完了のまま終了。INV-001（共有リソース変更）と INV-002（マイグレーション波及）は完了済み。

## 未完了の調査観点
- **INV-003**: 調査タイムアウトのため未実施。本レポートでは INV-001 / INV-002 の調査結果のみ反映しており、INV-003 の観点（調査計画に含まれていたが未実行）については追加確認が必要となる可能性があります。

## 免責
本レポートは Investigator の Findings（事実ベースの調査結果）をまとめたものであり、マージ可否や追加対応の必要性についての判断は行いません。特に以下の点について、最終的な判断は開発者が行ってください:
- INV-003 の未完了分に関する追加調査の要否
- `WorkflowState.migrate()` の `else if` チェーン構造（severity: warning）のリファクタリング要否
- `response-plan.md` への `analyzer_model` 表示追加の要否
- PR コメント側 `comment-resolution-metadata.json` へのマイグレーション機構導入の要否
