# ドキュメント更新ログ - Issue #90: フェーズ差し戻し機能の実装

**作成日**: 2025-01-31
**Issue番号**: #90
**プロジェクト**: AI Workflow Agent
**バージョン**: v0.4.0
**Phase**: 7 (Documentation)

---

## 更新サマリー

Issue #90で実装されたフェーズ差し戻し機能（rollback command）に関連するプロジェクトドキュメントを更新しました。新機能の使用方法、アーキテクチャへの影響、開発者向けガイドラインを追加し、ユーザーと開発者の両方が新機能を理解し活用できるようにしました。

### 更新統計

- **調査したファイル数**: 10個
- **更新したファイル数**: 3個
- **更新対象外**: 7個
- **追加行数**: 約200行

---

## ドキュメント調査結果

### 1. プロジェクト全体のドキュメント構造

プロジェクトのルートディレクトリにある主要なMarkdownファイル：

```
.
├── README.md                    # メインドキュメント（ユーザー向け）
├── ARCHITECTURE.md              # アーキテクチャ概要（開発者向け）
├── CLAUDE.md                    # Claude Code開発ガイド（開発者向け）
├── TROUBLESHOOTING.md           # トラブルシューティングガイド
├── ROADMAP.md                   # ロードマップ
├── DOCKER_AUTH_SETUP.md         # Docker認証セットアップ
├── SETUP_TYPESCRIPT.md          # TypeScript開発環境セットアップ
├── PROGRESS.md                  # プロジェクト進捗状況
└── .ai-workflow/                # AIワークフローメタデータ
```

### 2. Issue #90の変更内容

#### 新規追加コンポーネント

1. **新規コマンド**: `src/commands/rollback.ts` (459行)
   - `handleRollbackCommand()` - メインコマンドハンドラ
   - `validateRollbackOptions()` - オプションバリデーション
   - `loadRollbackReason()` - 差し戻し理由読み込み（3つの入力方法）
   - `generateRollbackReasonMarkdown()` - ROLLBACK_REASON.md生成
   - `getPhaseNumber()` - フェーズ番号取得ヘルパー

2. **MetadataManager拡張** (約108行追加)
   - `setRollbackContext()` - 差し戻しコンテキスト設定
   - `getRollbackContext()` - 差し戻しコンテキスト取得
   - `clearRollbackContext()` - 差し戻しコンテキストクリア
   - `addRollbackHistory()` - 差し戻し履歴追加
   - `updatePhaseForRollback()` - 差し戻し先フェーズ更新
   - `resetSubsequentPhases()` - 後続フェーズリセット

3. **型定義拡張**: `src/types/commands.ts` (約90行追加)
   - `RollbackCommandOptions` - rollbackコマンドのオプション型
   - `RollbackContext` - 差し戻しコンテキスト型
   - `RollbackHistoryEntry` - 差し戻し履歴エントリ型

4. **メタデータスキーマ拡張**: `src/types.ts` (4行追加)
   - `PhaseMetadata.rollback_context?: RollbackContext` (オプショナル)
   - `WorkflowState.rollback_history?: RollbackHistoryEntry[]` (オプショナル)

5. **BasePhase拡張**: `src/phases/base-phase.ts` (約31行追加)
   - プロンプト注入機能: reviseステップで差し戻し理由を自動注入

6. **ReviewCycleManager拡張**: `src/phases/core/review-cycle-manager.ts` (9行追加)
   - reviseサイクル完了後の差し戻しコンテキストクリーンアップ

#### 主要機能

- **3つの差し戻し理由入力方法**:
  - `--reason <text>`: 直接テキストで指定（最大1000文字）
  - `--reason-file <path>`: ファイルから読み込み（最大100KB）
  - `--interactive`: 標準入力から入力（EOF（Ctrl+D）で終了）

- **メタデータ自動更新**:
  - 差し戻し先フェーズを `in_progress` に設定
  - 後続フェーズを `pending` にリセット
  - 差し戻しコンテキストを設定
  - 差し戻し履歴に記録

- **プロンプト自動注入**:
  - 差し戻し先フェーズの revise ステップ実行時に ROLLBACK_REASON.md を自動的にプロンプトに注入
  - 差し戻し理由がエージェントに明確に伝達される

- **ROLLBACK_REASON.md生成**:
  - `.ai-workflow/issue-<NUM>/<PHASE>/ROLLBACK_REASON.md` に保存
  - 差し戻し元/先フェーズ、理由、タイムスタンプを記録

---

## 更新されたドキュメント

### 1. README.md ✅ 更新完了

**更新理由**: ユーザー向けのメインドキュメントとして、rollbackコマンドの使用方法を追加する必要がある

**更新内容**:

#### 1.1. CLIオプションセクション（108-116行目）
```bash
ai-workflow rollback \
  --issue <number> \
  --to-phase <phase> \
  --reason <text> | --reason-file <path> | --interactive \
  [--to-step <step>] \
  [--from-phase <phase>] \
  [--force] \
  [--dry-run]
```

#### 1.2. Rollbackコマンドセクション（230-323行目）
新規セクションを追加（約94行）:

- **コマンド概要**: フェーズ差し戻し機能の説明
- **基本的な使用方法**: 3つの入力方法の例
  - 直接理由指定（--reason）
  - ファイルから読み込み（--reason-file）
  - インタラクティブモード（--interactive）
  - 特定ステップへの差し戻し（--to-step）
  - ドライラン（--dry-run）

- **主な機能**: 5つの主要機能を箇条書き
  - 差し戻し理由の記録
  - メタデータ自動更新
  - 差し戻し履歴の記録
  - プロンプト自動注入
  - ROLLBACK_REASON.md生成

- **オプション詳細**: 全オプションの説明
  - 必須オプション: `--issue`, `--to-phase`, 差し戻し理由（3つのうち1つ）
  - オプショナル: `--to-step`, `--from-phase`, `--force`, `--dry-run`
  - 有効なフェーズ名一覧

- **使用例**: 4つの実践的なケース
  - ケース1: Phase 6でバグ発見 → Phase 4に差し戻し
  - ケース2: テスト設計の見直し → Phase 3に差し戻し
  - ケース3: 長文理由のインタラクティブ入力
  - ケース4: ドライランによる事前確認

- **注意事項**: 5つの重要な制約事項
  - 差し戻し先フェーズは実行済みである必要
  - 差し戻し理由は必須
  - 後続フェーズのリセット
  - ROLLBACK_REASON.mdの保存先
  - 次回execute時の自動再開

**影響範囲**: ユーザー向けドキュメント（CLI使用方法）

### 2. ARCHITECTURE.md ✅ 更新完了

**更新理由**: 開発者向けアーキテクチャドキュメントとして、新規コマンドとモジュールの技術的詳細を記載する必要がある

**更新内容**:

#### 2.1. 全体フローセクション（63-76行目）
新規コマンドフローを追加:
```
src/commands/rollback.ts (フェーズ差し戻しコマンド処理、v0.4.0、Issue #90で追加)
 ├─ handleRollbackCommand() … フェーズ差し戻しコマンドハンドラ
 ├─ validateRollbackOptions() … rollbackオプションのバリデーション（exported for testing）
 ├─ loadRollbackReason() … 差し戻し理由の読み込み（--reason, --reason-file, --interactive）（exported for testing）
 ├─ generateRollbackReasonMarkdown() … ROLLBACK_REASON.mdファイルの生成（exported for testing）
 ├─ getPhaseNumber() … フェーズ名から番号を取得するヘルパー（exported for testing）
 └─ MetadataManager拡張メソッドを利用
     ├─ setRollbackContext() … 差し戻しコンテキストの設定
     ├─ getRollbackContext() … 差し戻しコンテキストの取得
     ├─ clearRollbackContext() … 差し戻しコンテキストのクリア
     ├─ addRollbackHistory() … 差し戻し履歴の追加
     ├─ updatePhaseForRollback() … 差し戻し先フェーズのステータス更新
     └─ resetSubsequentPhases() … 後続フェーズのリセット
```

#### 2.2. モジュール一覧テーブル（103行目）
新規エントリを追加:
```
| `src/commands/rollback.ts` | フェーズ差し戻しコマンド処理（約459行、v0.4.0、Issue #90で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。`handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。 |
```

#### 2.3. MetadataManagerエントリ更新（123行目）
行数とrollback機能を追加:
```
| `src/core/metadata-manager.ts` | `.ai-workflow/issue-*/metadata.json` の CRUD、コスト集計、リトライ回数管理など（約347行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90）。差し戻し機能用の6つの新規メソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。 |
```

#### 2.4. types/commands.tsエントリ更新（132行目）
rollback型の追加を記載:
```
| `src/types/commands.ts` | コマンド関連の型定義（約240行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry等の型を提供。コマンドハンドラの型安全性を確保。 |
```

#### 2.5. BasePhaseエントリ更新（133行目）
rollbackプロンプト注入機能を追加:
```
| `src/phases/base-phase.ts` | フェーズ実行の基底クラス（約476行、v0.3.1で40%削減、Issue #49でさらなるモジュール分解、v0.4.0でrollbackプロンプト注入追加、Issue #90）。execute/review/revise のライフサイクル管理とオーケストレーションを担当。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入し、差し戻し理由を次のフェーズ実行時に伝達する機能を提供。 |
```

#### 2.6. メタデータセクション（292-293行目）
新しいフィールドを追加:
```
- `phases.*.rollback_context` … 差し戻しコンテキスト（triggered_at、from_phase、to_phase、to_step、reason等）（v0.4.0、Issue #90で追加、オプショナル）
- `rollback_history` … 差し戻し履歴の配列（各エントリは triggered_at、from_phase、to_phase、to_step、reason等を含む）（v0.4.0、Issue #90で追加、オプショナル）
```

**影響範囲**: 開発者向けドキュメント（モジュール構成、データフロー）

### 3. CLAUDE.md ✅ 更新完了

**更新理由**: Claude Code開発者向けガイドとして、rollbackコマンドの使用方法と関連モジュールの情報を追加する必要がある

**更新内容**:

#### 3.1. CLIの使用方法セクション（66-112行目）
新規サブセクションを追加:

**フェーズ差し戻し（v0.4.0、Issue #90で追加）**

- **使用例**: 5つのrollbackコマンド例
  - 直接理由指定
  - ファイルから読み込み
  - インタラクティブモード
  - 特定ステップへの差し戻し
  - ドライラン

- **主な機能**: 5つの箇条書き
  - 3つの入力方法
  - メタデータ自動更新
  - 差し戻し履歴記録
  - プロンプト自動注入
  - ROLLBACK_REASON.md生成

- **オプション**: 4つのオプショナルフラグ
  - `--to-step`
  - `--from-phase`
  - `--force`
  - `--dry-run`

#### 3.2. コアモジュールセクション（151行目）
新規エントリを追加:
```
- **`src/commands/rollback.ts`**: フェーズ差し戻しコマンド処理（約459行、v0.4.0、Issue #90で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。`handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。
```

#### 3.3. types/commands.tsエントリ更新（154行目）
rollback型の追加を記載:
```
- **`src/types/commands.ts`**: コマンド関連の型定義（約240行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry等の型を提供。コマンドハンドラの型安全性を確保。
```

#### 3.4. BasePhaseエントリ更新（155行目）
rollbackプロンプト注入機能を追加:
```
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス（約476行、v0.3.1で40%削減、Issue #23・#47・#49でリファクタリング、v0.4.0でrollbackプロンプト注入追加、Issue #90）。ファサードパターンにより専門モジュールへ委譲。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入。
```

#### 3.5. MetadataManagerエントリ更新（169行目）
rollback機能を追加:
```
- **`src/core/metadata-manager.ts`**: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作（約347行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90）。差し戻し機能用の6つの新規メソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。
```

**影響範囲**: 開発者向けドキュメント（Claude Code使用ガイド）

---

## 更新対象外のドキュメント

### 1. TROUBLESHOOTING.md ⚠️ 更新不要

**理由**:
- rollbackコマンドは新機能であり、まだトラブルシューティングの実績データがない
- 基本的なエラーハンドリング（無効なフェーズ名、未開始フェーズへの差し戻し等）は実装で対応済み
- 今後ユーザーから問題が報告された場合に追加する方が適切

**現在の内容**:
- Issue初期化の問題
- フェーズ実行の問題
- レビューサイクルの問題
- Git/GitHub関連の問題
- エージェント認証の問題

**今後の検討事項**:
- rollbackコマンド使用時の一般的なエラーパターンが明らかになった時点で追加
- 例: 「差し戻し理由ファイルが見つからない」「インタラクティブモードでの入力方法」等

### 2. ROADMAP.md ⚠️ 更新不要

**理由**:
- Issue #90は完了した機能であり、ロードマップは「今後の計画」を記載するドキュメント
- v0.4.0の機能として完成済み
- ロードマップには未完了または計画中の機能のみを記載すべき

**現在の内容**:
- リリースノート（過去のバージョン）
- 今後の改善計画（Phase最適化、エージェント改善等）

### 3. DOCKER_AUTH_SETUP.md ⚠️ 更新不要

**理由**:
- Docker認証のセットアップ手順を記載したドキュメント
- rollbackコマンドは認証とは無関係
- Codex/Claude認証情報の設定方法のみを扱う

**現在の内容**:
- Codex API認証
- Claude Code認証
- Docker環境での認証情報の扱い

### 4. SETUP_TYPESCRIPT.md ⚠️ 更新不要

**理由**:
- TypeScript開発環境のセットアップ手順を記載したドキュメント
- rollbackコマンドの実装は既存のTypeScript環境で開発可能
- 新しい開発環境のセットアップは不要

**現在の内容**:
- Node.js/npm のインストール
- TypeScript のインストール
- 依存関係のインストール
- ビルドとテストの実行

### 5. PROGRESS.md ⚠️ 更新不要

**理由**:
- プロジェクト全体の進捗状況を記録するドキュメント
- 個別Issue（Issue #90）の完了をここに記載するのは不適切
- 進捗はメタデータとGitHub Issueで管理される

**現在の内容**:
- 各Issueの進捗状況
- マイルストーンの達成状況
- 技術的負債の管理

### 6. .ai-workflow/issue-*/metadata.json ⚠️ 更新不要（動的ファイル）

**理由**:
- メタデータファイルは動的に生成・更新される
- ドキュメント更新の対象ではない
- rollback機能によって自動的に更新される

**rollback関連フィールド**（実装により自動管理）:
```json
{
  "phases": {
    "implementation": {
      "rollback_context": {
        "triggered_at": "2025-01-31T12:00:00Z",
        "from_phase": "testing",
        "to_phase": "implementation",
        "to_step": "revise",
        "reason": "テストでバグが発見されたため..."
      }
    }
  },
  "rollback_history": [
    {
      "triggered_at": "2025-01-31T12:00:00Z",
      "from_phase": "testing",
      "to_phase": "implementation",
      "to_step": "revise",
      "reason": "テストでバグが発見されたため..."
    }
  ]
}
```

### 7. テストファイル内のドキュメント ⚠️ 更新不要

**理由**:
- テストコード自体がドキュメントとして機能している（自己文書化コード）
- Issue #90で追加されたテストファイル:
  - `tests/unit/core/metadata-manager-rollback.test.ts`
  - `tests/unit/commands/rollback.test.ts`
  - `tests/integration/rollback-workflow.test.ts`
- これらのテストケースが仕様書として機能している

---

## 品質保証

### ドキュメント整合性チェック

#### 1. コマンドシンタックスの一貫性 ✅

すべてのドキュメントで同じコマンド構文を使用:
```bash
ai-workflow rollback \
  --issue <number> \
  --to-phase <phase> \
  --reason <text> | --reason-file <path> | --interactive \
  [--to-step <step>] \
  [--from-phase <phase>] \
  [--force] \
  [--dry-run]
```

#### 2. 機能説明の統一 ✅

3つのドキュメント（README.md、ARCHITECTURE.md、CLAUDE.md）で一貫した機能説明:
- 3つの差し戻し理由入力方法
- メタデータ自動更新
- 差し戻し履歴記録
- プロンプト自動注入
- ROLLBACK_REASON.md生成

#### 3. 技術用語の一貫性 ✅

以下の用語を統一:
- **フェーズ差し戻し** (Phase Rollback)
- **差し戻しコンテキスト** (Rollback Context)
- **差し戻し履歴** (Rollback History)
- **ROLLBACK_REASON.md** (差し戻し理由ドキュメント)
- **プロンプト注入** (Prompt Injection)

#### 4. バージョン情報の正確性 ✅

すべてのドキュメントで v0.4.0 と Issue #90 を正しく記載

#### 5. コード例の動作確認 ✅

README.mdの使用例はすべて実装と整合:
- ケース1: Phase 6 → Phase 4への差し戻し
- ケース2: Phase 5 → Phase 3への差し戻し（--reason-file使用）
- ケース3: インタラクティブモード
- ケース4: ドライラン

---

## Phase 7品質ゲート確認

### ✅ 必須ゲート

1. **影響を受けるドキュメントが特定されている** ✅
   - 10個のMarkdownファイルを調査
   - 3個の更新対象ファイルを特定
   - 7個の更新不要ファイルを明確化

2. **必要なドキュメントが更新されている** ✅
   - README.md: CLIオプション、rollbackコマンドセクション追加
   - ARCHITECTURE.md: モジュール一覧、メタデータフィールド追加
   - CLAUDE.md: CLIの使用方法、コアモジュール更新

3. **更新内容がログに記録されている** ✅
   - このドキュメント（documentation-update-log.md）に全更新を記録
   - 各ドキュメントの更新理由、更新内容、影響範囲を明記
   - 更新対象外のドキュメントとその理由も記録

### ✅ オプショナルゲート

4. **既存ドキュメントとの整合性が保たれている** ✅
   - コマンド構文の統一
   - 機能説明の一貫性
   - 技術用語の統一
   - バージョン情報の正確性

5. **ユーザーと開発者の両方に適切なドキュメントが提供されている** ✅
   - ユーザー向け: README.md（使用方法、オプション、使用例）
   - 開発者向け: ARCHITECTURE.md（モジュール構成、データフロー）
   - 開発者向け: CLAUDE.md（Claude Code開発ガイド）

---

## 次のステップ

### Phase 8 (Report) への進行

**進行可否**: ✅ **Phase 8に進行可能**

**理由**:
1. **すべての必須ドキュメントが更新済み**
2. **ドキュメントの品質が保証されている**（整合性チェック完了）
3. **Phase 7の品質ゲートをすべて満たしている**

### Phase 8での作業内容

1. **ステータスレポート生成**: Issue #90の実装サマリーを作成
2. **PRボディ更新**: 新機能の説明をPR descriptionに追加
3. **ワークフローログクリーンアップ**: Phase 0-8のデバッグログを削除

---

## 参考情報

### 関連ドキュメント

- **実装ログ**: `.ai-workflow/issue-90/04_implementation/output/implementation.md`
- **テストシナリオ**: `.ai-workflow/issue-90/03_test_scenario/output/test-scenario.md`
- **設計書**: `.ai-workflow/issue-90/02_design/output/design.md`
- **テスト結果**: `.ai-workflow/issue-90/06_testing/output/test-result.md`

### Issue #90の完了状況

| Phase | ステータス | 成果物 |
|-------|----------|--------|
| 0. Planning | ✅ 完了 | planning.md |
| 1. Requirements | ✅ 完了 | requirements.md |
| 2. Design | ✅ 完了 | design.md |
| 3. Test Scenario | ✅ 完了 | test-scenario.md |
| 4. Implementation | ✅ 完了 | implementation.md |
| 5. Test Implementation | ✅ 完了 | test-implementation.md |
| 6. Testing | ✅ 完了（条件付き） | test-result.md |
| 7. Documentation | ✅ 完了 | documentation-update-log.md（このファイル） |
| 8. Report | ⏳ 待機中 | - |
| 9. Evaluation | ⏳ 待機中 | - |

---

## まとめ

### Phase 7（Documentation）の成果

**✅ 達成されたこと**:
1. **ドキュメント調査の完了**: 10個のMarkdownファイルを調査し、影響範囲を特定
2. **3つの主要ドキュメントを更新**: README.md、ARCHITECTURE.md、CLAUDE.md
3. **ドキュメント整合性の保証**: コマンド構文、機能説明、技術用語の統一
4. **詳細な更新ログの作成**: 全更新内容と理由を記録

**📝 更新統計**:
- 調査したファイル: 10個
- 更新したファイル: 3個
- 追加行数: 約200行

### 判定

**総合判定**: ✅ **Phase 8（Report）に進行可能**

**根拠**:
- Phase 7の主目的（プロジェクトドキュメントの更新）は完全に達成済み
- すべての品質ゲート（必須・オプショナル）をクリア
- ドキュメントの整合性と品質が保証されている

---

**作成完了日時**: 2025-01-31
**作成者**: AI Workflow Agent (Phase 7: Documentation)
**Issue**: #90 - フェーズ差し戻し機能の実装（差し戻し理由の伝達を重視）
**レビュー状態**: 更新完了（Phase 8への進行推奨）
**次のアクション**: Phase 8（Report）への進行
