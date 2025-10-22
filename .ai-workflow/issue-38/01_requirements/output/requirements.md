# 要件定義書 - Issue #38

**Issue番号**: #38
**タイトル**: [FOLLOW-UP] Issue #26 - 残タスク
**状態**: open
**URL**: https://github.com/tielec/ai-workflow-agent/issues/38
**作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Document（`.ai-workflow/issue-38/00_planning/output/planning.md`）で策定された全体戦略を確認しました：

- **複雑度判定**: **簡単**（テストコードのAPIシグネチャ修正のみ、新規実装なし）
- **見積もり工数**: 6～9時間（1.5～2日間）
- **リスク評価**: **低**（修正内容が明確、技術的に容易）
- **実装戦略**: **EXTEND**（既存テストコードを最新APIシグネチャに適合させる）
- **テスト戦略**: **UNIT_INTEGRATION**（既存のユニットテストと統合テストを修正）
- **テストコード戦略**: **EXTEND_TEST**（既存テストファイルへの修正のみ）

### スコープの明確化

Issue #26の評価レポート（`evaluation_report.md`）で特定された残タスクは、**Phase 5（テストコード実装）でPhase 4の最新APIシグネチャを正しく反映できなかった問題**です。実装自体（Phase 4）は以下の点で優れていることが確認されています：

- ✅ 後方互換性100%維持
- ✅ 行数削減目標達成（250行削減、21.9%）
- ✅ コーディング規約準拠（ESLint、Prettier）
- ✅ 単一責任原則（SRP）、DRY原則の遵守
- ✅ 既存テストの88.1%（384個）が成功

したがって、本Issueのスコープは**テストコードの技術的調整のみ**であり、**新規実装やコアロジックの変更は不要**です。

---

## 1. 概要

### 背景

Issue #26「[REFACTOR] 残り4ファイルの軽量リファクタリング」のワークフローにおいて、Phase 9（評価フェーズ）で以下の問題が発見されました：

- **問題**: Phase 5（テストコード実装）で作成されたテストファイル9個のうち7個が、Phase 4の最新APIシグネチャを正しく反映できておらず、Phase 6（テスト実行）で失敗している
- **根本原因**: テスト実装時（Phase 5）に、Phase 4の最新実装を正しく参照せず、古いAPIシグネチャを想定してテストコードを作成した
- **影響範囲**: Issue #26のテストファイル9個中7個（優先度1～4で分類済み）

### 目的

本Issueの目的は、**Issue #26のテストコードを最新のAPIシグネチャに適合させ、すべてのテストが合格する状態にすること**です。これにより、以下を達成します：

1. **Issue #26のマージ準備完了**: テスト合格率100%、カバレッジ目標達成
2. **高品質なテストスイートの確立**: 信頼性の高いリファクタリング検証
3. **リファクタリング全体計画（Issue #1）の前進**: Issue #26の完了を記録

### ビジネス価値・技術的価値

**ビジネス価値**:
- **品質保証の確立**: Issue #26のリファクタリングが正常に動作することを検証
- **開発速度の向上**: 信頼性の高いテストスイートにより、将来の変更が安全に実施可能
- **技術的負債の削減**: 不正確なテストコードによる誤った自信を防止

**技術的価値**:
- **テストカバレッジの向上**: 新規ヘルパーモジュール（6ファイル）のカバレッジ85%以上を達成
- **後方互換性の検証**: リファクタリングによる既存機能への影響がないことを確認
- **保守性の向上**: 正確なテストコードにより、将来のメンテナンスが容易に

---

## 2. 機能要件

### REQ-001: CodexAgentClientのコンストラクタシグネチャ修正（優先度: 高）

**説明**:
`codex-agent-client.test.ts`において、`CodexAgentClient`クラスのコンストラクタ呼び出しを、Phase 4の最新実装（オプションオブジェクト形式）に修正する。

**現状**:
```typescript
new CodexAgentClient('/test/workspace')  // 旧API（文字列引数）
```

**修正後**:
```typescript
new CodexAgentClient({ workingDir: '/test/workspace' })  // 新API（オプションオブジェクト）
```

**受け入れ基準**:
- Given: `CodexAgentClient`クラスのテストコード
- When: コンストラクタを`{ workingDir: ... }`形式で呼び出す
- Then: テストが合格し、型エラーが発生しない

**関連ファイル**: `tests/unit/core/helpers/codex-agent-client.test.ts`

**優先度**: 高

---

### REQ-002: CodexAgentClientのexecuteTaskオプション修正（優先度: 高）

**説明**:
`codex-agent-client.test.ts`において、`executeTask`メソッドのオプションキー名を`workingDir`から`workingDirectory`に修正する。

**現状**:
```typescript
await client.executeTask('test prompt', { workingDir: '/test/dir' })
```

**修正後**:
```typescript
await client.executeTask('test prompt', { workingDirectory: '/test/dir' })
```

**受け入れ基準**:
- Given: `CodexAgentClient.executeTask()`のテストコード
- When: オプションで`workingDirectory`キーを使用する
- Then: テストが合格し、正しいディレクトリで実行される

**関連ファイル**: `tests/unit/core/helpers/codex-agent-client.test.ts`

**優先度**: 高

---

### REQ-003: ClaudeAgentClientのコンストラクタシグネチャ修正（優先度: 高）

**説明**:
`claude-agent-client.test.ts`において、`ClaudeAgentClient`クラスのコンストラクタ呼び出しを、Phase 4の最新実装（オプションオブジェクト形式）に修正する。

**現状**:
```typescript
new ClaudeAgentClient('/test/workspace')  // 旧API（文字列引数）
```

**修正後**:
```typescript
new ClaudeAgentClient({ workingDir: '/test/workspace' })  // 新API（オプションオブジェクト）
```

**受け入れ基準**:
- Given: `ClaudeAgentClient`クラスのテストコード
- When: コンストラクタを`{ workingDir: ... }`形式で呼び出す
- Then: テストが合格し、型エラーが発生しない

**関連ファイル**: `tests/unit/core/helpers/claude-agent-client.test.ts`

**優先度**: 高

---

### REQ-004: MetadataManagerのコンストラクタ引数型修正（優先度: 高）

**説明**:
`metadata-manager.test.ts`において、`MetadataManager`クラスのコンストラクタ引数を`number`型から`string`型に修正する。

**現状**:
```typescript
new MetadataManager(26)  // number型
```

**修正後**:
```typescript
new MetadataManager('26')  // string型
```

**受け入れ基準**:
- Given: `MetadataManager`クラスのテストコード
- When: コンストラクタに文字列型のIssue番号を渡す
- Then: テストが合格し、型エラーが発生しない

**関連ファイル**: `tests/unit/core/metadata-manager.test.ts`

**優先度**: 高

---

### REQ-005: MetadataManagerのupdatePhaseStatusオプション修正（優先度: 高）

**説明**:
`metadata-manager.test.ts`において、`updatePhaseStatus`メソッドのオプションキー名を`outputFiles`（複数形）から`outputFile`（単数形）に修正する。

**現状**:
```typescript
await manager.updatePhaseStatus('requirements', 'completed', { outputFiles: [...] })
```

**修正後**:
```typescript
await manager.updatePhaseStatus('requirements', 'completed', { outputFile: '...' })
```

**受け入れ基準**:
- Given: `MetadataManager.updatePhaseStatus()`のテストコード
- When: オプションで`outputFile`キー（単数形）を使用する
- Then: テストが合格し、正しいファイルパスが記録される

**関連ファイル**: `tests/unit/core/metadata-manager.test.ts`

**優先度**: 高

---

### REQ-006: MetadataManagerのaddCost引数数修正（優先度: 高）

**説明**:
`metadata-manager.test.ts`において、`addCost`メソッドの引数を4引数から3引数に修正する。

**現状**:
```typescript
await manager.addCost('requirements', 'execute', 1000, 0.02)  // 4引数（コスト引数が余分）
```

**修正後**:
```typescript
await manager.addCost('requirements', 'execute', 1000)  // 3引数（トークン数のみ）
```

**受け入れ基準**:
- Given: `MetadataManager.addCost()`のテストコード
- When: フェーズ名、ステップ名、トークン数の3引数で呼び出す
- Then: テストが合格し、コストが自動計算される

**関連ファイル**: `tests/unit/core/metadata-manager.test.ts`

**優先度**: 高

---

### REQ-007: 統合テスト（agent-client-execution.test.ts）のAPIシグネチャ修正（優先度: 高）

**説明**:
`agent-client-execution.test.ts`において、REQ-001～REQ-003と同じAPIシグネチャ修正を適用する。

**受け入れ基準**:
- Given: エージェント実行フローの統合テストコード
- When: `CodexAgentClient`、`ClaudeAgentClient`のコンストラクタを新API形式で呼び出す
- Then: 統合テストが合格し、エージェント実行フローが正常に動作する

**関連ファイル**: `tests/integration/agent-client-execution.test.ts`

**優先度**: 高

---

### REQ-008: 統合テスト（metadata-persistence.test.ts）のAPIシグネチャ修正（優先度: 高）

**説明**:
`metadata-persistence.test.ts`において、REQ-004～REQ-006と同じAPIシグネチャ修正を適用する。

**受け入れ基準**:
- Given: メタデータ永続化フローの統合テストコード
- When: `MetadataManager`のコンストラクタと各メソッドを新API形式で呼び出す
- Then: 統合テストが合格し、メタデータ永続化フローが正常に動作する

**関連ファイル**: `tests/integration/metadata-persistence.test.ts`

**優先度**: 高

---

### REQ-009: log-formatter.test.tsのCodexEvent['message']型修正（優先度: 中）

**説明**:
`log-formatter.test.ts`において、`CodexEvent['message']`型を文字列からオブジェクト形式に修正する。

**現状**:
```typescript
message: 'System message'  // 文字列
```

**修正後**:
```typescript
message: { role: 'system', content: [...] }  // オブジェクト
```

**受け入れ基準**:
- Given: `formatCodexLog()`のテストコード
- When: `message`フィールドをオブジェクト形式で渡す
- Then: テストが合格し、型エラーが発生しない

**関連ファイル**: `tests/unit/core/helpers/log-formatter.test.ts`

**優先度**: 中

---

### REQ-010: dependency-messages.test.tsのPhaseName型インポート修正（優先度: 中）

**説明**:
`dependency-messages.test.ts`において、`PhaseName`型のインポートパスを明示的に指定する。

**現状**:
```typescript
import type { PhaseName }  // インポート元が不明
```

**修正後**:
```typescript
import type { PhaseName } from '../types.js'  // 明示的なインポート
```

**受け入れ基準**:
- Given: `buildErrorMessage()`、`buildWarningMessage()`のテストコード
- When: `PhaseName`型を`../types.js`からインポートする
- Then: テストが合格し、型エラーが発生しない

**関連ファイル**: `tests/unit/core/helpers/dependency-messages.test.ts`

**優先度**: 中

---

### REQ-011: validation.test.tsのvalidPhases配列修正（優先度: 中）

**説明**:
`validation.test.ts`において、`validPhases`配列をプレフィックス付きフェーズ名（'00_planning'、'01_requirements'等）に修正する。

**現状**:
```typescript
const validPhases = ['planning', 'requirements', 'design', ...]
```

**修正後**:
```typescript
const validPhases = ['00_planning', '01_requirements', '02_design', ...]
```

**受け入れ基準**:
- Given: `validatePhaseName()`のテストコード
- When: プレフィックス付きフェーズ名を使用する
- Then: テストが合格し、フェーズ名バリデーションが正常に動作する

**関連ファイル**: `tests/unit/core/helpers/validation.test.ts`

**優先度**: 中

---

### REQ-012: metadata-io.test.tsのjest.mock()修正（優先度: 中）

**説明**:
`metadata-io.test.ts`において、`jest.mock('fs-extra')`をESモジュールモードで動作する形式（動的インポートまたはVitestのvi.mock()）に修正する。

**現状**:
```typescript
jest.mock('fs-extra')  // ESモジュールモードで使用不可
```

**修正後**:
```typescript
// 動的インポート形式に変更、またはVitestへの移行
```

**受け入れ基準**:
- Given: `metadata-io.ts`の関数（`backupMetadataFile()`、`removeWorkflowDirectory()`等）のテストコード
- When: ESモジュールモードでモックを使用する
- Then: テストが合格し、モック関数が正常に動作する

**関連ファイル**: `tests/unit/core/helpers/metadata-io.test.ts`

**優先度**: 中

---

### REQ-013: npm testでIssue #26のテストがすべて合格すること（優先度: 高）

**説明**:
REQ-001～REQ-012の修正完了後、`npm test`でIssue #26のテストファイル9個がすべて合格することを確認する。

**受け入れ基準**:
- Given: REQ-001～REQ-012の修正が完了している
- When: `npm test`を実行する
- Then: Issue #26のテストファイル9個がすべて合格する（失敗0個）

**関連ファイル**: すべてのIssue #26テストファイル

**優先度**: 高

---

### REQ-014: カバレッジ目標の達成（優先度: 高）

**説明**:
`npm run test:coverage`でカバレッジレポートを生成し、以下の目標を達成することを確認する：

- 全体カバレッジ: 80%以上
- 新規ヘルパーモジュール（6ファイル）: 85%以上

**受け入れ基準**:
- Given: REQ-001～REQ-013の修正が完了している
- When: `npm run test:coverage`を実行する
- Then: 全体カバレッジが80%以上、新規ヘルパーモジュールが85%以上である

**関連ファイル**: すべてのIssue #26テストファイル

**優先度**: 高

---

### REQ-015: Issue #26レポートの更新（優先度: 高）

**説明**:
`.ai-workflow/issue-26/08_report/output/report.md`の「テスト結果」セクションを更新し、「マージ推奨」を「✅ マージ推奨」に変更する。

**受け入れ基準**:
- Given: REQ-001～REQ-014の修正が完了している
- When: `report.md`を更新する
- Then: 「テスト結果」セクションに最新のテスト結果（合格率100%、カバレッジ結果）が反映され、「✅ マージ推奨」の表記がある

**関連ファイル**: `.ai-workflow/issue-26/08_report/output/report.md`

**優先度**: 高

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

**説明**: テストコードの修正により、テスト実行時間が大幅に増加しないこと。

**基準**:
- `npm test`の実行時間: 修正前後で±10%以内
- カバレッジレポート生成時間: 修正前後で±15%以内

**測定方法**: `time npm test`コマンドで測定

---

### NFR-002: 保守性要件

**説明**: 修正後のテストコードは、将来のAPIシグネチャ変更に対して容易に適応できること。

**基準**:
- テストコードは最新の実装（Phase 4）を正しく反映している
- TypeScript型システムにより、APIシグネチャ変更時に型エラーが検出される
- JSDocコメントにより、テストケースの意図が明確である

---

### NFR-003: 信頼性要件

**説明**: 修正後のテストコードは、リファクタリングによる後方互換性の破壊を正確に検出すること。

**基準**:
- 既存テストの成功率が88.1%以上を維持している（修正により既存テストが悪化しない）
- Issue #26のテストがすべて合格している（新規機能の検証が完了している）
- カバレッジ目標を達成している（未テストコードパスが最小限）

---

### NFR-004: 可用性要件

**説明**: テストコードの修正により、CI/CD環境での自動テスト実行が正常に動作すること。

**基準**:
- Jenkins環境で`npm test`が正常に実行される
- テスト失敗時、エラーメッセージが明確である
- ESモジュールモードでのモック（REQ-012）が正常に動作する

---

## 4. 制約事項

### 技術的制約

1. **Phase 4実装への依存**:
   - テストコードはPhase 4の最新実装に完全に依存している
   - Phase 4の実装変更時、テストコードも同時に修正が必要

2. **ESモジュールモードの制約**:
   - `jest.mock()`が使用不可（REQ-012）
   - 動的インポートまたはVitestへの移行が必要

3. **既存テストとの整合性**:
   - 既存テスト（88.1%成功）との整合性を維持する必要がある
   - フェーズ名のプレフィックス（'00_planning'等）を統一する必要がある

### リソース制約

1. **時間制約**:
   - 見積もり工数: 6～9時間（1.5～2日間）
   - 優先度1（APIシグネチャ修正）: 2～3時間
   - 優先度2～4（型定義、フェーズ名、モック方式）: 1.5～2.5時間
   - テスト実行・カバレッジ確認: 1～1.5時間
   - ドキュメント・レポート更新: 1時間

2. **人員制約**:
   - AI Workflowエージェント単独で実施可能
   - 人的レビューは不要（自動レビューサイクルで完結）

### ポリシー制約

1. **コーディング規約**:
   - ESLint、Prettierに準拠する
   - JSDocコメントを追加する（必要に応じて）
   - TypeScript型システムを活用する

2. **テスト品質基準**:
   - Given-When-Then構造を維持する
   - 要件定義書とのトレーサビリティを維持する
   - 境界値テスト、異常系テストを含める

3. **後方互換性ポリシー**:
   - 既存テストの成功率を低下させない（88.1%以上を維持）
   - Issue #26の実装（Phase 4）への影響はない

---

## 5. 前提条件

### システム環境

- **Node.js**: 20以上
- **npm**: 10以上
- **TypeScript**: 5.x
- **テストフレームワーク**: Jest with ES modules（`NODE_OPTIONS=--experimental-vm-modules`）

### 依存コンポーネント

- **Issue #26のPhase 4実装**: 完了済み（後方互換性100%維持、行数削減目標達成）
- **新規ヘルパーモジュール**: 6ファイル（515行）すべて作成済み
- **リファクタリング対象ファイル**: 4ファイルすべて完了（合計250行削減、21.9%）

### 外部システム連携

- **GitHub**: Issue #26のレポート更新（`.ai-workflow/issue-26/08_report/output/report.md`）
- **CI/CD環境**: Jenkins環境での自動テスト実行

---

## 6. 受け入れ基準

### 全体的な受け入れ基準

本Issueの完了には、以下の**すべての基準**を満たす必要があります：

#### AC-001: Issue #26のテストがすべて合格する

- **Given**: REQ-001～REQ-012の修正が完了している
- **When**: `npm test`を実行する
- **Then**: Issue #26のテストファイル9個がすべて合格する（失敗0個）

#### AC-002: カバレッジ目標を達成する

- **Given**: REQ-001～REQ-013の修正が完了している
- **When**: `npm run test:coverage`を実行する
- **Then**:
  - 全体カバレッジが80%以上である
  - 新規ヘルパーモジュール（6ファイル）のカバレッジが85%以上である

#### AC-003: 既存テストの成功率を維持する

- **Given**: REQ-001～REQ-013の修正が完了している
- **When**: `npm test`を実行する
- **Then**: 既存テストの成功率が88.1%以上を維持している

#### AC-004: Issue #26レポートが更新される

- **Given**: REQ-001～REQ-014の修正が完了している
- **When**: `.ai-workflow/issue-26/08_report/output/report.md`を確認する
- **Then**:
  - 「テスト結果」セクションに最新のテスト結果が反映されている
  - 「✅ マージ推奨」の表記がある

### 各要件の受け入れ基準

各機能要件（REQ-001～REQ-015）の受け入れ基準は、「2. 機能要件」セクションに記載されています。

---

## 7. スコープ外

### 明確にスコープ外とする事項

以下の事項は、本Issue（#38）の**スコープ外**です：

#### 既存テストの失敗（Issue #26とは無関係）

- **詳細**: 既存テスト20個のテストスイートが失敗している（evaluation_report.md Line 383-400）
- **根本原因**: Issue #26のリファクタリングとは無関係な既存の問題
  - phase-dependencies.test.ts: `Unknown phase: planning`エラー（フェーズ名の不一致）
  - repository-utils.test.ts: エラーメッセージパターンの不一致
  - comment-client.test.ts、review-client.test.ts: モック関数のAPI不一致
  - preset-execution.test.ts: プリセット数の不一致（期待7個、実際9個）
- **推奨対応**: 別途Issueとして管理する（Issue #26のスコープ外）

#### Issue #26の実装（Phase 4）の変更

- **詳細**: テストコードの修正により、Phase 4の実装を変更することは不要
- **根拠**: Phase 4の実装は後方互換性100%維持、行数削減目標達成、コーディング規約準拠など、すべての品質基準を満たしている（evaluation_report.md Line 436-457）

#### 新規機能の追加

- **詳細**: 本Issueはテストコードの技術的調整のみであり、新規機能の追加は行わない
- **根拠**: Issue #26は「軽量リファクタリング」であり、機能追加は含まれていない

#### パフォーマンス最適化

- **詳細**: テスト実行時間の最適化は努力目標であり、必須ではない
- **根拠**: NFR-001で「±10%以内」と規定しているが、修正によるパフォーマンス悪化のリスクは低い

### 将来的な拡張候補

以下は、本Issueの完了後に検討可能な拡張候補です：

#### 拡張候補1: 既存テストの修正（別途Issue）

- **詳細**: 既存テスト20個のテストスイートを修正し、成功率を88.1%から90%以上に向上
- **優先度**: 中
- **見積もり工数**: 3～5時間

#### 拡張候補2: テストフレームワークのVitestへの移行

- **詳細**: JestからVitestへの移行により、ESモジュールモードの互換性問題を解決
- **優先度**: 低
- **見積もり工数**: 8～12時間

#### 拡張候補3: カバレッジ目標の引き上げ

- **詳細**: 全体カバレッジを80%から85%に、新規ヘルパーモジュールを85%から90%に引き上げ
- **優先度**: 低
- **見積もり工数**: 2～4時間

---

## 8. 付録

### A. Issue #26評価レポートの主要箇所

本要件定義書は、以下の評価レポート箇所を基に作成されています：

- **残タスクの詳細**: evaluation_report.md Line 405-459
- **失敗したテストの詳細**: evaluation_report.md Line 46-137
- **失敗の主要原因**: evaluation_report.md Line 156-196
- **修正方法**: evaluation_report.md Line 209-239

### B. Planning Documentの主要箇所

本要件定義書は、以下のPlanning Document箇所を基に作成されています：

- **複雑度判定**: planning.md Line 14-22
- **見積もり工数**: planning.md Line 23-38
- **実装戦略**: planning.md Line 50-103
- **影響範囲分析**: planning.md Line 106-154
- **タスク分割**: planning.md Line 156-261

### C. 優先度の定義

| 優先度 | 定義 | 例 |
|--------|------|-----|
| **高** | マージのブロッキング要因。完了しないとIssue #26がマージできない。 | REQ-001～008（APIシグネチャ修正）、REQ-013～015（テスト実行、レポート更新） |
| **中** | 非ブロッキング要因。完了しなくてもマージは可能だが、品質上は望ましい。 | REQ-009～012（型定義、フェーズ名、モック方式） |
| **低** | 将来的な改善候補。本Issueの完了後に検討可能。 | 拡張候補1～3 |

### D. 関連ドキュメント

- **Issue #26評価レポート**: `AI_Workflow/ai_workflow_orchestrator/.ai-workflow/issue-26/09_evaluation/output/evaluation_report.md`
- **Issue #26テスト結果**: `AI_Workflow/ai_workflow_orchestrator/.ai-workflow/issue-26/06_testing/output/test-result.md`
- **Planning Document**: `.ai-workflow/issue-38/00_planning/output/planning.md`
- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想

---

**要件定義完了日**: 2025-01-22
**作成者**: AI Workflow Agent (Claude Code)
**承認者**: （レビュー後に記入）
