# Documentation Update Log: Issue #271

**Feature**: Add `rollback auto` mode with agent-based rollback target detection

**Phase**: 07_documentation

**Date**: 2025-12-07

---

## Summary

プロジェクトドキュメントを更新し、Issue #271 で追加された `rollback-auto` コマンドの使用方法、技術詳細、アーキテクチャ情報を反映しました。

---

## Updated Documentation Files

### 1. README.md

**セクション**: Rollback コマンド（フェーズ差し戻し）

**追加内容**:

#### 1.1 CLI Options セクション（行 135-139）

```bash
ai-workflow rollback-auto \
  --issue <number> \
  [--dry-run] \
  [--force] \
  [--agent auto|codex|claude]
```

rollback-auto コマンドの CLI オプションを追加しました。

#### 1.2 Rollback Auto モードのサブセクション（行 430-529）

新しいサブセクション「#### Rollback Auto モード（AI エージェントによる自動差し戻し判定）」を追加し、以下の内容をドキュメント化しました：

- **主な機能**:
  - 自動状態分析（metadata.json、review results、test results）
  - AI エージェントによる判定（needs_rollback, to_phase, to_step, confidence, reason, analysis）
  - 信頼度ベースの確認プロンプト
  - 既存 rollback との統合

- **オプション**:
  - `--issue <number>`: 必須
  - `--dry-run`: プレビューモード
  - `--force`: 高信頼度判定時の確認スキップ
  - `--agent <mode>`: エージェント選択（auto | codex | claude）

- **使用例**:
  - ケース1: テスト失敗後に自動判定（プレビューモード）
  - ケース2: 本番実行（確認あり）
  - ケース3: 高信頼度判定時は自動実行
  - ケース4: Codex で高精度判定

- **エージェント判定の例**（JSON 形式）

- **差し戻しが必要と判定されるケース**:
  - テスト失敗
  - レビュー BLOCKER
  - アーキテクチャ問題

- **差し戻しが不要と判定されるケース**:
  - 軽微なバグ
  - コード品質の問題
  - ドキュメント不足

- **注意事項**

---

### 2. CLAUDE.md

**セクション**: フェーズ差し戻し、アーキテクチャ（コアモジュール）

**追加内容**:

#### 2.1 Rollback Auto モードのサブセクション（行 114-154）

新しいサブセクション「### Rollback Auto モード（v0.4.0、Issue #271で追加）」を追加し、以下の内容をドキュメント化しました：

- **基本的な使用方法**（コマンド例）
- **主な機能**（詳細説明）
- **オプション**（全オプションの説明）
- **技術詳細**:
  - 実装: `src/commands/rollback.ts` の `handleRollbackAutoCommand()` 関数
  - プロンプトテンプレート: `src/prompts/rollback/auto-analyze.txt`
  - JSON パース: 3つのフォールバックパターン
  - バリデーション: `validateRollbackDecision()` で厳格な型チェック
  - コンテキスト収集: `findLatestReviewResult()`, `findLatestTestResult()`

#### 2.2 アーキテクチャセクション - rollback.ts モジュールの更新（行 470-480）

`src/commands/rollback.ts` モジュールの説明を拡張し、自動rollback機能の詳細を追加しました：

- **手動rollback** (Issue #90): 既存の機能説明を保持
- **自動rollback** (Issue #271): 新機能の詳細を追加
  - コンテキスト収集: `collectAnalysisContext()`, `findLatestReviewResult()`, `findLatestTestResult()`
  - エージェント初期化: `initializeAgentClients()`
  - プロンプト構築: `buildAgentPrompt()`
  - JSON パース: `parseRollbackDecision()`（exported for testing）
  - バリデーション: `validateRollbackDecision()`（exported for testing）
  - 信頼度ベース確認: `confirmRollbackAuto()`
  - 表示: `displayAnalysisResult()`, `displayDryRunPreview()`
  - 実行: 既存の `executeRollback()` を再利用

#### 2.3 型定義セクションの更新（行 484）

`src/types/commands.ts` モジュールの説明を更新し、Issue #271 で追加された型を追記しました：

- 行数を約240行から約325行に更新
- 追加された型の説明:
  - `RollbackAutoOptions`（CLI options for rollback-auto command）
  - `RollbackDecision`（Agent output structure with validation rules）

---

### 3. ARCHITECTURE.md

**セクション**: 全体フロー、モジュール一覧、型定義

**追加内容**:

#### 3.1 全体フローセクション - rollback.ts コマンドの詳細フロー（行 63-92）

`src/commands/rollback.ts` のフローチャートを拡張し、自動rollback機能の詳細なフローを追加しました：

```
src/commands/rollback.ts (フェーズ差し戻しコマンド処理、v0.4.0、Issue #90/#271で追加)
 ├─ handleRollbackCommand() … 手動rollbackコマンドハンドラ（Issue #90）
 │   ├─ validateRollbackOptions()
 │   ├─ loadRollbackReason()
 │   ├─ generateRollbackReasonMarkdown()
 │   └─ getPhaseNumber()
 │
 ├─ handleRollbackAutoCommand() … 自動rollbackコマンドハンドラ（Issue #271）
 │   ├─ initializeAgentClients()
 │   ├─ collectAnalysisContext()
 │   │   ├─ findLatestReviewResult()
 │   │   └─ findLatestTestResult()
 │   ├─ buildAgentPrompt()
 │   ├─ AgentExecutor.executeWithAgent()
 │   ├─ parseRollbackDecision()（exported for testing）
 │   │   └─ 3つのフォールバックパターン
 │   ├─ validateRollbackDecision()（exported for testing）
 │   │   └─ 必須フィールドチェック
 │   ├─ displayAnalysisResult()
 │   ├─ displayDryRunPreview()
 │   ├─ confirmRollbackAuto()
 │   └─ executeRollback()
 │
 └─ MetadataManager拡張メソッドを利用（Issue #90で追加）
     ├─ setRollbackContext()
     ├─ getRollbackContext()
     ├─ clearRollbackContext()
     ├─ addRollbackHistory()（mode: "manual" or "auto"を記録）
     ├─ updatePhaseForRollback()
     └─ resetSubsequentPhases()
```

#### 3.2 モジュール一覧テーブルの更新（行 146）

`src/commands/rollback.ts` の行数と説明を更新しました：

- 行数: 約459行 → 約930行
- 説明を拡張し、手動rollback と自動rollback の2つのモードを詳細に説明
- コンテキスト収集、プロンプト構築、JSON パース、バリデーション、信頼度ベース確認の各機能を記載
- エージェント分析の出力（RollbackDecision）の構造を説明

#### 3.3 型定義の更新（行 182）

`src/types/commands.ts` の行数と説明を更新しました：

- 行数: 約240行 → 約325行
- Issue #271 で追加された型の詳細を記載:
  - `RollbackAutoOptions`（rollback-autoコマンドのCLIオプション: issueNumber, dryRun, force, agent）
  - `RollbackDecision`（エージェント出力の構造: needs_rollback, to_phase, to_step, reason, confidence, analysis、厳格なバリデーションルール付き）

---

## Quality Gates Check

### ドキュメント品質基準の確認

#### ✅ 完全性（Completeness）

- [x] 全ての新機能がドキュメント化されている
  - rollback-auto コマンドの全オプション
  - エージェント判定のフロー
  - 信頼度ベースの確認機能
  - JSON パースとバリデーション機能

#### ✅ 正確性（Accuracy）

- [x] 技術的な詳細が正確に記載されている
  - 実装ファイルパス: `src/commands/rollback.ts`
  - プロンプトテンプレートパス: `src/prompts/rollback/auto-analyze.txt`
  - エクスポートされた関数の明示: `parseRollbackDecision()`, `validateRollbackDecision()`
  - 型定義: `RollbackAutoOptions`, `RollbackDecision`

#### ✅ 一貫性（Consistency）

- [x] 既存ドキュメントとの整合性が取れている
  - 手動rollback のドキュメントと同じセクション構造を使用
  - 既存の CLI オプション説明形式に従う
  - 既存のモジュール説明形式に従う

#### ✅ 使いやすさ（Usability）

- [x] ユーザーが機能を理解しやすい構成になっている
  - 基本的な使用方法から始まる段階的な説明
  - 4つの実用的な使用例（ケース1-4）
  - 判定結果の JSON 例を提示
  - 差し戻しが必要/不要なケースの明確な区別

---

## Changes Summary

| ドキュメント | セクション | 変更種別 | 行数増加 | 主な追加内容 |
|------------|----------|---------|---------|------------|
| **README.md** | CLI Options | 追加 | +5 | rollback-auto コマンドの CLI オプション |
| **README.md** | Rollback コマンド | 追加 | +100 | Rollback Auto モードの詳細説明 |
| **CLAUDE.md** | フェーズ差し戻し | 追加 | +41 | Rollback Auto モードの使用方法と技術詳細 |
| **CLAUDE.md** | コアモジュール（rollback.ts） | 拡張 | +12 | 自動rollback機能の実装詳細 |
| **CLAUDE.md** | 型定義（commands.ts） | 更新 | +1 | 追加された型の説明 |
| **ARCHITECTURE.md** | 全体フロー（rollback.ts） | 拡張 | +23 | 自動rollback機能のフローチャート |
| **ARCHITECTURE.md** | モジュール一覧（rollback.ts） | 更新 | +1 | 行数と機能説明の更新 |
| **ARCHITECTURE.md** | 型定義（commands.ts） | 更新 | +1 | 追加された型の詳細説明 |
| **合計** | - | - | **+184** | - |

---

## Files Modified

```
README.md                      (+105 lines)
CLAUDE.md                      (+54 lines)
ARCHITECTURE.md                (+25 lines)
.ai-workflow/issue-271/07_documentation/output/documentation-update-log.md (NEW)
```

---

## Documentation Review Checklist

- [x] README.md: ユーザー向けの使用方法が明確に記載されている
- [x] CLAUDE.md: 開発者向けの技術詳細が明確に記載されている
- [x] ARCHITECTURE.md: アーキテクチャと設計情報が明確に記載されている
- [x] 全ドキュメントで一貫した用語を使用している
- [x] コードサンプルが正確で実行可能である
- [x] 新機能の利点と使用ケースが明確に説明されている
- [x] エラーハンドリングと注意事項が記載されている
- [x] Issue #271 の要件をすべて満たしている

---

## Next Steps

Phase 8（Report）に進む準備が整いました。以下の成果物が完成しています：

1. ✅ Phase 0: Planning Document（計画書）
2. ✅ Phase 1: Requirements Document（要件定義書）
3. ✅ Phase 2: Design Document（設計書）
4. ✅ Phase 3: Test Scenario Document（テストシナリオ）
5. ✅ Phase 4: Implementation（実装完了）
6. ✅ Phase 5: Test Implementation（テスト実装完了）
7. ✅ Phase 6: Testing（テスト実行完了、31/31成功）
8. ✅ Phase 7: Documentation（ドキュメント更新完了）

---

**Documentation Phase 完了日**: 2025-12-07
**実行者**: AI Workflow Agent
**次フェーズ**: Phase 8 - Report
