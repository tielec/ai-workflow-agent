# CLAUDE.md

このファイルは、このリポジトリで作業する際に Claude Code (claude.ai/code) にガイダンスを提供します。

## 概要

TypeScript ベースの AI Workflow 自動化ツールキットで、デュアルエージェント（Codex + Claude）をサポートしています。GitHub Issue に対して planning から evaluation までの 10 フェーズのワークフローを実行し、マルチリポジトリワークフロー、Jenkins 統合、永続的なメタデータ管理をサポートします。

## ビルド & 開発コマンド

```bash
# 依存関係のインストール
npm install

# TypeScript ソースのビルド（dist/ へコンパイルし、prompts/templates をコピー）
npm run build

# ウォッチモードで開発
npm run dev

# テスト実行
npm test                    # すべてのテスト
npm run test:unit          # ユニットテストのみ
npm run test:integration   # 統合テストのみ
npm run test:coverage      # カバレッジレポート付き
```

## Claude Code Skills の使用方法（推奨）

このリポジトリは Claude Code Skills をサポートしており、スラッシュコマンドで主要な操作を実行できます。

### 利用可能な Skills

| スキル名 | 説明 | 使用例 |
|---------|------|--------|
| `/init-workflow` | ワークフローを初期化（ブランチ、メタデータ、ドラフトPR作成） | `/init-workflow 658` |
| `/execute-phase` | フェーズを実行（プリセットまたは個別フェーズ） | `/execute-phase 658 --preset implementation` |
| `/rollback-phase` | フェーズを差し戻し（手動または AI 自動判定） | `/rollback-phase 658` |
| `/troubleshoot` | トラブルシューティング（エラー診断と解決策提案） | `/troubleshoot 658` |

### Skills のメリット

- **簡潔なコマンド**: 長い CLI 引数を覚える必要なし
- **対話的な操作**: デフォルト値と選択肢を提示
- **コンテキスト理解**: メタデータを自動読み込み
- **エラー診断**: 自動的に問題を検出して解決策を提案

### Skills 詳細ドキュメント

各 Skill の詳細は `.claude/skills/{skill-name}/SKILL.md` を参照してください：

- **init-workflow**: [.claude/skills/init-workflow/SKILL.md](.claude/skills/init-workflow/SKILL.md)
- **execute-phase**: [.claude/skills/execute-phase/SKILL.md](.claude/skills/execute-phase/SKILL.md)
- **rollback-phase**: [.claude/skills/rollback-phase/SKILL.md](.claude/skills/rollback-phase/SKILL.md)
- **troubleshoot**: [.claude/skills/troubleshoot/SKILL.md](.claude/skills/troubleshoot/SKILL.md)

### 基本的なワークフロー例

```
1. ワークフロー初期化
   /init-workflow https://github.com/owner/repo/issues/123

2. フェーズ実行（プリセット使用）
   /execute-phase 123 --preset implementation

3. 問題が発生した場合
   /troubleshoot 123

4. 必要に応じて差し戻し
   /rollback-phase 123
```

**注意**: Skills は Claude Code 2.1.0 以降で利用可能です。CLI コマンドも引き続き利用できます。

---


## CLI リファレンス（簡潔版）

**推奨**: 通常は [Claude Code Skills](#claude-code-skills-の使用方法推奨) を使用してください。このセクションは技術的な詳細や自動化スクリプト向けです。

### 主要コマンド一覧

| コマンド | 説明 | Skills 参照 |
|---------|------|-----------|
| `init` | ワークフロー初期化 | `/init-workflow` |
| `execute` | フェーズ実行 | `/execute-phase` |
| `rollback` | フェーズ差し戻し（手動） | `/rollback-phase` |
| `rollback-auto` | フェーズ差し戻し（AI判定） | `/rollback-phase` |
| `cleanup` | ログクリーンアップ | 未実装 |
| `finalize` | 最終処理 | 未実装 |
| `auto-issue` | 自動Issue生成 | 未実装 |
| `pr-comment` | PRコメント対応 | 未実装 |
| `validate-credentials` | 認証情報検証 | 未実装 |
| `list-presets` | プリセット一覧表示 | `/execute-phase` |

### 基本的な使用方法

#### ワークフロー初期化
```bash
node dist/index.js init --issue-url <GITHUB_ISSUE_URL> [--branch <NAME>] [--base-branch <BRANCH>] [--language <ja|en>]
```
詳細: [/init-workflow スキル](.claude/skills/init-workflow/SKILL.md)

#### フェーズ実行
```bash
node dist/index.js execute --issue <NUM> --phase <PHASE_NAME|all> [--preset <NAME>] [--agent <auto|codex|claude>]
```
詳細: [/execute-phase スキル](.claude/skills/execute-phase/SKILL.md)

#### フェーズ差し戻し
```bash
# 自動判定（推奨）
node dist/index.js rollback-auto --issue <NUM>

# 手動指定
node dist/index.js rollback --issue <NUM> --to-phase <PHASE> --reason <TEXT>
```
詳細: [/rollback-phase スキル](.claude/skills/rollback-phase/SKILL.md)

### その他のコマンド

#### 認証情報検証
```bash
node dist/index.js validate-credentials --check <all|git|github|codex|claude|openai|anthropic>
```

#### ログクリーンアップ
```bash
node dist/index.js cleanup --issue <NUM> [--phases <RANGE>] [--all] [--dry-run]
```

#### 最終処理
```bash
node dist/index.js finalize --issue <NUM> [--skip-squash] [--skip-pr-update] [--base-branch <BRANCH>]
```

#### 自動Issue生成
```bash
node dist/index.js auto-issue [--category bug|refactor|enhancement|all] [--limit <NUM>] [--dry-run]
```

#### PRコメント対応
```bash
node dist/index.js pr-comment init --pr <NUM>
node dist/index.js pr-comment analyze --pr <NUM>
node dist/index.js pr-comment execute --pr <NUM> [--batch-size <NUM>]
node dist/index.js pr-comment finalize --pr <NUM>
```

### 共通オプション

- `--language <ja|en>`: ワークフロー言語（デフォルト: `ja`）
- `--agent <auto|codex|claude>`: 使用するエージェント（デフォルト: `auto`）
- `--codex-model <alias|model>`: Codex モデル（`max`|`mini`|`5.1`|`legacy`、デフォルト: `max`）
- `--claude-model <alias|model>`: Claude モデル（`opus`|`sonnet`|`haiku`、デフォルト: `opus`）
- `--dry-run`: プレビューモード（実際には実行しない）
- `--force`: 確認プロンプトをスキップ

### モデルエイリアス

#### Codex モデル
- `max` → `gpt-5.1-codex-max`（デフォルト、長時間タスク向け）
- `mini` → `gpt-5.1-codex-mini`（軽量、コスト重視）
- `5.1` → `gpt-5.1`（汎用）
- `legacy` → `gpt-5-codex`（後方互換性）

#### Claude モデル
- `opus` → `claude-opus-4-5-20251101`（デフォルト、最高性能）
- `sonnet` → `claude-sonnet-4-20250514`（バランス型）
- `haiku` → `claude-haiku-3-5-20241022`（高速、低コスト）

### プリセットワークフロー

| プリセット | フェーズ | 用途 |
|-----------|---------|------|
| `review-requirements` | Planning + Requirements | 要件レビュー |
| `review-design` | Planning + Requirements + Design | 設計レビュー |
| `review-test-scenario` | Planning + Requirements + Design + TestScenario | テストシナリオレビュー |
| `implementation` | Planning + Implementation + TestImplementation + Testing + Documentation + Report | 実装フル |
| `quick-fix` | Planning + Implementation + Documentation + Report | 簡易修正 |
| `testing` | Planning + TestImplementation + Testing | テストのみ |
| `finalize` | Planning + Documentation + Report + Evaluation | 最終処理 |

詳細: `/execute-phase` スキルを参照

### エージェント選択戦略

`--agent auto` の場合、フェーズの特性に応じて自動選択：

| フェーズ | 優先エージェント | 理由 |
|---------|----------------|------|
| Planning, Requirements, Design, TestScenario | Claude 優先 | 戦略立案、分析が得意 |
| Implementation, TestImplementation, Testing | Codex 優先 | コード実装が得意 |
| Documentation, Report, Evaluation | Claude 優先 | ドキュメント作成が得意 |

### トラブルシューティング

問題が発生した場合は `/troubleshoot` スキルを使用してください：

```
/troubleshoot <ISSUE_NUM>
```

または [common-issues.md](.claude/skills/troubleshoot/common-issues.md) を参照してください。

---
## アーキテクチャ

### フェーズ実行フロー

1. **CLI エントリー**（`src/main.ts`）: コマンドルーティング → 各コマンドハンドラ（`src/commands/init.ts`, `src/commands/execute.ts` 等）へ委譲
2. **Issue URL 解析**: GitHub URL から owner/repo/issue を抽出（`parseIssueUrl` in `src/core/repository-utils.ts`）
3. **マルチリポジトリ解決**: `REPOS_ROOT` 環境変数を使用して対象リポジトリを特定
4. **メタデータ読み込み**: `.ai-workflow/issue-<NUM>/metadata.json` を読み込み、`target_repository` 情報を取得
5. **フェーズ実行**: `BasePhase.run()` による順次実行（`src/commands/execute.ts` で管理）:
   - 依存関係検証
   - `execute()`: エージェントで成果物を生成
     - **フォールバック機構** (Issue #113で追加): 成果物ファイル不在時の自動復旧
       - `enableFallback: true` のフェーズ（Planning, Requirements, Design, TestScenario, Implementation, Report）で有効
       - ① ログからの成果物抽出（`extractContentFromLog()`） → ② revise呼び出し
       - フェーズ固有ヘッダーパターンでログを解析、コンテンツ検証後に保存
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `review()`: 出力を検証（オプション）
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `revise()`: 自動修正サイクル（最大 3 回まで）
     - **previous_log_snippet 注入** (Issue #113で追加): agent_log.mdの先頭2000文字を自動注入
     - **Git コミット & プッシュ** (v0.3.0で追加)

### コアモジュール

- **`src/main.ts`**: CLI 定義とコマンドルーティング（約118行、v0.3.0でリファクタリング）。コマンドルーターとしての役割のみに特化。
- **`src/commands/init.ts`**: Issue初期化コマンド処理（約306行）。ブランチ作成、メタデータ初期化、PR作成を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。
- **`src/commands/execute.ts`**: フェーズ実行コマンド処理（約497行、v0.3.1で27%削減、Issue #46）。ファサードパターンにより4つの専門モジュールに分離。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。
- **`src/commands/execute/options-parser.ts`**: CLIオプション解析とバリデーション（約151行、v0.3.1で追加、Issue #46）。`parseExecuteOptions()`, `validateExecuteOptions()` を提供。
- **`src/commands/execute/agent-setup.ts`**: エージェント初期化と認証情報解決（約175行、v0.3.1で追加、Issue #46）。`setupAgentClients()`, `resolveAgentCredentials()` を提供。
- **`src/commands/execute/workflow-executor.ts`**: ワークフロー実行ロジック（約128行、v0.3.1で追加、Issue #46）。`executePhasesSequential()`, `executePhasesFrom()` を提供。
- **`src/commands/review.ts`**: フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。
- **`src/commands/list-presets.ts`**: プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。
- **`src/commands/rollback.ts`**: フェーズ差し戻しコマンド処理（約930行、v0.4.0、Issue #90/#271で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。
  - **手動rollback** (Issue #90): `handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。
  - **自動rollback** (Issue #271): `handleRollbackAutoCommand()` を提供。AIエージェント（Codex/Claude）による自動差し戻し判定機能。
    - **コンテキスト収集**: `collectAnalysisContext()`, `findLatestReviewResult()`, `findLatestTestResult()` でreview/test結果を自動探索
    - **エージェント初期化**: `initializeAgentClients()` でagentモードに応じたクライアント初期化
    - **プロンプト構築**: `buildAgentPrompt()` でテンプレート（`src/prompts/rollback/auto-analyze.txt`）から分析プロンプトを生成
    - **JSON パース**: `parseRollbackDecision()` で3つのフォールバックパターン（Markdown code block → Plain JSON → Bracket search）を使用してエージェント応答から RollbackDecision を抽出（exported for testing）
    - **バリデーション**: `validateRollbackDecision()` で厳格な型チェック（needs_rollback, to_phase, confidence 等の必須フィールド検証）（exported for testing）
    - **信頼度ベース確認**: `confirmRollbackAuto()` で confidence level に応じた確認プロンプト表示（high + --force でスキップ）
    - **表示**: `displayAnalysisResult()`, `displayDryRunPreview()` で判定結果をユーザーに表示
    - **実行**: 既存の `executeRollback()` を再利用して実際の差し戻しを実行
- **`src/commands/cleanup.ts`**: ワークフローログの手動クリーンアップコマンド処理（約480行、v0.4.0、Issue #212で追加）。Report Phase（Phase 8）の自動クリーンアップとは独立して、任意のタイミングでワークフローログを削除する機能を提供。`handleCleanupCommand()`, `validateCleanupOptions()`, `parsePhaseRange()`, `executeCleanup()`, `previewCleanup()` を提供。3つのクリーンアップモード（通常、部分、完全）、プレビューモード（`--dry-run`）、Git自動コミット＆プッシュをサポート。
- **`src/core/repository-utils.ts`**: リポジトリ関連ユーティリティ（約170行）。Issue URL解析、リポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。
- **`src/core/phase-factory.ts`**: フェーズインスタンス生成（約65行、v0.3.1で追加、Issue #46）。`createPhaseInstance()` を提供。10フェーズすべてのインスタンス生成を担当。
- **`src/types/commands.ts`**: コマンド関連の型定義（約325行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90/#271）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry, RollbackAutoOptions, RollbackDecision等の型を提供。コマンドハンドラの型安全性を確保。Issue #271で追加された型: `RollbackAutoOptions`（CLI options for rollback-auto command）、`RollbackDecision`（Agent output structure with validation rules）。
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス（約476行、v0.3.1で40%削減、Issue #23・#47・#49でリファクタリング、v0.4.0でrollbackプロンプト注入追加、Issue #90、Issue #113でfallback機構追加）。ファサードパターンにより専門モジュールへ委譲。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入。フォールバック機構（`handleMissingOutputFile()`, `extractContentFromLog()`, `isValidOutputContent()`）により、成果物ファイル生成失敗時にログから自動抽出またはrevise呼び出しで復旧。
- **`src/phases/core/agent-executor.ts`**: エージェント実行ロジック（約270行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。
- **`src/phases/core/review-cycle-manager.ts`**: レビューサイクル管理（約130行、v0.3.1で追加、Issue #23）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。
- **`src/phases/lifecycle/step-executor.ts`**: ステップ実行ロジック（約233行、v0.3.1で追加、Issue #49）。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュを担当。
- **`src/phases/lifecycle/phase-runner.ts`**: フェーズライフサイクル管理（約244行、v0.3.1で追加、Issue #49）。フェーズ全体の実行、依存関係検証、エラーハンドリング、GitHub進捗投稿を担当。
- **`src/phases/context/context-builder.ts`**: コンテキスト構築（約223行、v0.3.1で追加、Issue #49）。オプショナルコンテキスト構築、ファイル参照生成（@filepath形式）、Planning Document参照を担当。
- **`src/phases/cleanup/artifact-cleaner.ts`**: クリーンアップロジック（約228行、v0.3.1で追加、Issue #49、v0.4.0でphaseRange追加、Issue #212）。ワークフロークリーンアップ、パス検証（セキュリティ対策）、シンボリックリンクチェック、CI環境判定を担当。`cleanupWorkflowLogs()` メソッドに `phaseRange?: PhaseName[]` パラメータを追加し、クリーンアップ対象フェーズの範囲指定をサポート。
- **`src/phases/formatters/progress-formatter.ts`**: 進捗表示フォーマット（約150行、v0.3.1で追加、Issue #23）。GitHub Issue コメント用の進捗状況フォーマットを生成。
- **`src/phases/formatters/log-formatter.ts`**: ログフォーマット（約400行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの生ログを Markdown 形式に変換。
- **`src/core/codex-agent-client.ts`**: JSON イベントストリーミングを備えた Codex CLI ラッパー（約200行、Issue #26で25.4%削減）
- **`src/core/claude-agent-client.ts`**: Claude Agent SDK ラッパー（約206行、Issue #26で23.7%削減）
- **`src/core/helpers/agent-event-parser.ts`**: Codex/Claude共通のイベントパースロジック（74行、Issue #26で追加）
- **`src/core/helpers/log-formatter.ts`**: エージェントログのフォーマット処理（181行、Issue #26で追加）
- **`src/core/helpers/env-setup.ts`**: エージェント実行環境のセットアップ（47行、Issue #26で追加）
- **`src/core/metadata-manager.ts`**: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作（約347行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90）。差し戻し機能用の6つの新規メソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。
- **`src/core/helpers/metadata-io.ts`**: メタデータファイルI/O操作（98行、Issue #26で追加）
- **`src/core/helpers/validation.ts`**: 共通バリデーション処理（47行、Issue #26で追加）
- **`src/core/config.ts`**: 環境変数アクセス管理（約220行、Issue #51で追加）。型安全な環境変数アクセス、必須/オプション環境変数の検証、フォールバックロジックの統一を提供。`config.getGitHubToken()`, `config.getCodexApiKey()`, `config.isCI()` 等14個のメソッドをエクスポート。
- **`src/core/git-manager.ts`**: Git操作のファサードクラス（約181行、Issue #25で67%削減）。各専門マネージャーを統合し、後方互換性を維持。
- **`src/core/git/commit-manager.ts`**: コミット操作の専門マネージャー（約409行、Issue #52で30.2%削減）。コミット作成（commitPhaseOutput, commitStepOutput等）、FileSelector/CommitMessageBuilderへの委譲、SecretMasker統合、ensureGitConfig（Git設定管理）を担当。
- **`src/core/git/file-selector.ts`**: ファイル選択・フィルタリング専門モジュール（約160行、Issue #52で追加）。getChangedFiles（変更ファイル検出）、filterPhaseFiles（Issue番号フィルタリング）、getPhaseSpecificFiles（フェーズ固有パターンマッチング）、scanDirectories、scanByPatterns、@tmp除外ロジックを担当。
- **`src/core/git/commit-message-builder.ts`**: コミットメッセージ構築専門モジュール（約151行、Issue #52で追加）。createCommitMessage（フェーズ完了）、buildStepCommitMessage（ステップ完了）、createInitCommitMessage（初期化）、createCleanupCommitMessage（クリーンアップ）のメッセージ生成を担当。
- **`src/core/git/branch-manager.ts`**: ブランチ操作の専門マネージャー（約110行、Issue #25で追加）。ブランチ作成、切り替え、存在チェックを担当。
- **`src/core/git/remote-manager.ts`**: リモート操作の専門マネージャー（約210行、Issue #25で追加、Issue #216で拡張）。push、pull、リトライロジック、GitHub認証設定を担当。`forcePushToRemote()` メソッド（Issue #216で追加）は `--force-with-lease` で安全に強制プッシュを実行し、non-fast-forwardエラー時にpullを実行しない（スカッシュ後の履歴保持のため）。
- **`src/core/git/squash-manager.ts`**: スカッシュ操作の専門マネージャー（約350行、Issue #194で追加、Issue #216でESM互換性修正）。コミットスカッシュ、エージェント生成コミットメッセージ、ブランチ保護、`--force-with-lease`による安全な強制プッシュを担当。ESM環境では `import.meta.url` と `fileURLToPath` を使用してパス解決を実行（`__dirname` はESMではグローバル変数として利用できないため）。
- **`src/core/github-client.ts`**: Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。
- **`src/core/github/issue-client.ts`**: Issue操作の専門クライアント（約385行、Issue #24で追加、Issue #104で拡張）。Issue取得、コメント投稿、クローズ、残タスクIssue作成、タイトル生成、キーワード抽出、詳細フォーマット機能を担当。
- **`src/core/github/pull-request-client.ts`**: PR操作の専門クライアント（約231行、Issue #24で追加）。PR作成、更新、検索、クローズ、PR番号取得を担当。
- **`src/core/github/comment-client.ts`**: コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。
- **`src/core/github/review-client.ts`**: レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。
- **`src/core/phase-dependencies.ts`**: 依存関係検証、プリセット定義（約249行、Issue #26で27.2%削減）
- **`src/core/helpers/dependency-messages.ts`**: 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）
- **`src/core/content-parser.ts`**: レビュー結果の解釈（OpenAI API を使用）。Issue #243でレビュー結果パースロジックを改善：JSON抽出前処理（`extractJsonFromResponse()`）とマーカーパターン優先判定（`inferDecisionFromText()`）により、LLMレスポンスの多様な形式に対応し、誤検出（「PASS判定が可能になります」→PASS）を防止
- **`src/utils/logger.ts`**: 統一ログモジュール（約150行、Issue #61で追加）。ログレベル制御、カラーリング、タイムスタンプ、環境変数制御を提供
- **`src/utils/error-utils.ts`**: エラーハンドリングユーティリティ（約190行、Issue #48で追加）。`getErrorMessage()`, `getErrorStack()`, `isError()` を提供。TypeScript の catch ブロックで `unknown` 型のエラーから型安全にメッセージを抽出。非 Error オブジェクト（string、number、null、undefined）に対応し、決して例外をスローしない（never throw 保証）

### フェーズ順序（0-9）

0. Planning → 1. Requirements → 2. Design → 3. Test Scenario → 4. Implementation → 5. Test Implementation → 6. Testing → 7. Documentation → 8. Report → 9. Evaluation

### プロンプト & テンプレート

- **プロンプト**: `src/prompts/{phase}/{execute|review|revise}.txt` → ビルド時に `dist/prompts/` へコピー
- **テンプレート**: `src/templates/*.md` → ビルド時に `dist/templates/` へコピー
- プロンプトは `BasePhase.loadPrompt()` で読み込まれ、エージェントコンテキストでレンダリング

### プリセット

`src/core/phase-dependencies.ts` で定義:
- `review-requirements`: Planning + Requirements
- `review-design`: Planning + Requirements + Design
- `review-test-scenario`: Planning + Requirements + Design + TestScenario
- `analysis-design`: Planning + Requirements + Design
- `quick-fix`: Planning + Implementation + Documentation + Report（`--ignore-dependencies` と併用）
- `implementation`: Planning + Implementation + TestImplementation + Testing + Documentation + Report
- `full-test`: Planning + TestScenario + TestImplementation
- `testing`: Planning + TestImplementation + Testing
- `finalize`: Planning + Documentation + Report + Evaluation

### オプショナルコンテキスト構築

`BasePhase.buildOptionalContext()` により、フェーズは前段フェーズの成果物を柔軟に参照可能:
- ファイルが存在する場合: `@relative/path` 参照を返す
- ファイルが存在しない場合: フォールバックメッセージを返す
- 使用フェーズ: Implementation、TestImplementation、Testing、Documentation、Report

## Phase 4-8 の出力ドキュメント簡潔化（Issue #207）

中盤フェーズ（Phase 4-8）の出力ドキュメントが簡潔化されました。以下のフォーマットに従ってください：

### Phase 4（Implementation）
- **変更ファイル一覧**: テーブルフォーマット（ファイル、変更種別、概要）
- **主要な変更点**: 3-5個の箇条書き
- **削除されたセクション**: 各ファイルの詳細な変更内容（「実装詳細」セクション）

### Phase 5（Test Implementation）
- **テストファイル一覧**: テーブルフォーマット（ファイル、テスト数、カバー対象）
- **テストカバレッジ**: 数値サマリー（ユニットテスト数、統合テスト数）
- **削除されたセクション**: 各テスト関数の詳細説明（「テストケース詳細」セクション）

### Phase 6（Testing）
- **成功時**: サマリーのみ（総数、成功率）
- **失敗時**: サマリー + 失敗したテストの詳細のみ
- **削除されたセクション**: 成功したテストの詳細リスト

### Phase 7（Documentation）
- **更新サマリー**: テーブルフォーマット（ファイル、更新理由）
- **削除されたセクション**: 調査したドキュメント一覧、更新不要と判断したドキュメント一覧
- **Readツールの制限**: `CLAUDE.md` / `~/.claude/CLAUDE.md` は自動コンテキストに含まれるため Read 不要。Read は一度に3-5ファイルまでに絞り、大型ドキュメントは `limit: 1000-2000` を付けて部分読みにする（プロンプト長エラー防止）。

### Phase 8（Report）
- **エグゼクティブサマリー**: Issue番号、タイトル、実装内容、変更規模、テスト結果、マージ推奨
- **マージチェックリスト**: 要件充足、テスト成功、ドキュメント更新、セキュリティリスク、後方互換性
- **詳細参照**: @references形式で各フェーズのファイルへリンク
- **削除されたセクション**: 各フェーズの詳細再掲載（要件定義サマリー、設計サマリー等）

**簡潔化の効果**:
- コンテキスト消費量: 従来比30-50%削減
- レビュー時間: 短縮（重要な情報に集中可能）
- 可読性: 向上（テーブル、箇条書き、サマリー形式の採用）

**注意事項**:
- Phase 0-2（Planning, Requirements, Design）は詳細を維持（変更なし）
- 詳細情報は各フェーズの成果物ファイル（`@.ai-workflow/issue-{NUM}/<phase>/output/*.md`）を参照
- Phase 8のReport Phaseでは@references方式により、詳細へのアクセス経路を提供

## マルチリポジトリワークフロー（v0.2.0）

ワークフローは `ai-workflow-agent` 以外のリポジトリも対象にできます:

1. **Issue URL 解析**: GitHub Issue URL から owner/repo を抽出
2. **ローカル解決**: `$REPOS_ROOT`、`~/TIELEC/development`、`~/projects`、または `../` からリポジトリを検索
3. **メタデータ保存**: metadata.json の `target_repository` オブジェクトに path、GitHub name、remote URL、owner、repo を保存
4. **実行コンテキスト**: すべての操作は対象リポジトリの作業ディレクトリで実行

**主要関数**:
- `parseIssueUrl(issueUrl)`: URL からリポジトリ情報を抽出（`src/core/repository-utils.ts`）
- `resolveLocalRepoPath(repoName)`: ローカルリポジトリパスを検索（`src/core/repository-utils.ts`）
- `findWorkflowMetadata(issueNumber)`: リポジトリ間でワークフローメタデータを検索（`src/core/repository-utils.ts`）

## ワークフローメタデータ構造

```
.ai-workflow/issue-<NUM>/
├── metadata.json              # WorkflowState（フェーズステータス、ステップ進捗、コスト、target_repository など）
├── 00_planning/
│   ├── execute/agent_log_raw.txt
│   ├── execute/prompt.txt
│   ├── review/...
│   └── output/planning.md
├── 01_requirements/...
└── ...
```

### ステップ単位の進捗管理（v0.3.0）

各フェーズのメタデータには、ステップ単位の進捗情報が記録されます：

```json
{
  "phases": {
    "requirements": {
      "status": "in_progress",
      "current_step": "review",
      "completed_steps": ["execute"],
      "retry_count": 0
    }
  }
}
```

- **`current_step`**: 現在実行中のステップ（'execute' | 'review' | 'revise' | null）
- **`completed_steps`**: 完了済みステップの配列
- **レジューム動作**: 完了済みステップは自動的にスキップされ、`current_step` または次の未完了ステップから再開

### ワークフローログクリーンアップ

Report Phase（Phase 8）完了後、`cleanupWorkflowLogs()` が自動的にデバッグログを削除:
- **削除対象**: phases 00-08（00_planning 〜 08_report）の `execute/`、`review/`、`revise/` ディレクトリ
- **保持対象**: `metadata.json`、`output/*.md`（Planning Phaseの `output/planning.md` も保持）
- **効果**: リポジトリサイズを約 75% 削減、PR をクリーンに
- **Git コミット**: 削除後、`[ai-workflow] Clean up workflow execution logs` メッセージで自動コミット＆プッシュ（Phase 8: report）

**手動クリーンアップ**（v0.4.0、Issue #212で追加）:
- `cleanup` コマンドを使用すると、自動クリーンアップとは独立して任意のタイミングでログをクリーンアップ可能
- 詳細は [ワークフローログの手動クリーンアップ](#ワークフローログの手動クリーンアップv040issue-212で追加) セクションを参照

### ワークフローディレクトリの完全削除（v0.3.0）

Evaluation Phase (Phase 9) 完了後、オプションで `.ai-workflow/issue-*` ディレクトリ全体を削除可能:
- **CLI オプション**: `--cleanup-on-complete`, `--cleanup-on-complete-force`
- **削除対象**: `.ai-workflow/issue-<NUM>/` ディレクトリ全体（`metadata.json`、`output/*.md` を含む）
- **確認プロンプト**: 対話的環境では削除前に確認を求める（CI環境では自動スキップ）
- **実装**: `BasePhase.cleanupWorkflowArtifacts()` メソッド、`EvaluationPhase.run()` で統合
- **セキュリティ**: パス検証（正規表現）、シンボリックリンクチェック

**Report Phase クリーンアップとの違い**:

| 項目 | Report Phase (Phase 8) | Evaluation Phase (Phase 9) |
|------|------------------------|----------------------------|
| **削除対象** | phases 00-08 のデバッグログ（`execute/`, `review/`, `revise/`） | ワークフロー全体（`.ai-workflow/issue-<NUM>/`） |
| **実行タイミング** | Report Phase 完了時（常に実行） | Evaluation Phase 完了時（オプション指定時のみ） |
| **目的** | PR レビューの負荷軽減（約 75% 削減） | ワークフロー完了後のクリーンアップ（完全削除） |
| **保護対象** | `metadata.json`, `output/*.md` | なし（全て削除） |
| **Git コミットメッセージ** | `[ai-workflow] Clean up workflow execution logs` (Phase 8: report) | `[ai-workflow] Clean up all workflow artifacts` |

## 環境変数

### 必須
- `GITHUB_TOKEN`: GitHub パーソナルアクセストークン（`repo` スコープ）
- `GITHUB_REPOSITORY`: `owner/repo` 形式（メタデータからフォールバック）

### エージェント設定（Issue #188で整理）

認証情報は用途別に分離されています：

#### OpenAI 系
| 環境変数 | 用途 | 備考 |
|---------|------|------|
| `CODEX_API_KEY` | Codex エージェント専用 | フェーズ実行（execute/review/revise）に使用 |
| `OPENAI_API_KEY` | OpenAI API 専用 | テキスト生成（Follow-up Issue 生成、レビュー解析等）に使用 |

#### Claude 系
| 環境変数 | 用途 | 優先順位 |
|---------|------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code エージェント | **優先** |
| `CLAUDE_CODE_API_KEY` | Claude Code エージェント | フォールバック（OAuth トークンがない場合） |
| `CLAUDE_MODEL` | Claude モデル指定（Issue #301） | エイリアス（opus/sonnet/haiku）またはフルモデルID。デフォルト: `opus` |
| `ANTHROPIC_API_KEY` | Anthropic API 呼び出し | テキスト生成（Follow-up Issue 生成等）に使用 |
| `CLAUDE_CODE_CREDENTIALS_PATH` | credentials.json パス | **非推奨**、レガシーサポート |

### フォローアップIssue生成設定（v0.5.0、Issue #119で追加）
- `FOLLOWUP_LLM_MODE`: LLMプロバイダ（`auto` | `openai` | `claude` | `agent` | `off`、デフォルト: `off`）
- `FOLLOWUP_LLM_MODEL`: 使用モデル（`gpt-4o-mini` | `claude-3-sonnet-20240229` 等）
- `OPENAI_API_KEY`: OpenAI APIキー（`--followup-llm-mode openai` 使用時）
- `ANTHROPIC_API_KEY`: Anthropic APIキー（`--followup-llm-mode claude` 使用時）

### マルチリポジトリサポート
- `REPOS_ROOT`: リポジトリの親ディレクトリ（v0.2.0）
  - Jenkins環境では必須（Issue #153で明確化）
  - `auto-issue` コマンド実行時、対象リポジトリの自動解決に使用

### ロギング設定（Issue #61で追加）
- `LOG_LEVEL`: ログレベル制御（`debug` | `info` | `warn` | `error`、デフォルト: `info`）
- `LOG_NO_COLOR`: カラーリング無効化（CI環境用、`true` | `1` で有効化）

### コミットスカッシュ設定（Issue #194で追加）
- `AI_WORKFLOW_SQUASH_ON_COMPLETE`: スカッシュ機能のデフォルト動作（`true` | `false`、デフォルト: `false`）

### Docker環境設定（Issue #177で追加）
- `AGENT_CAN_INSTALL_PACKAGES`: エージェントがパッケージをインストール可能かどうか（`true` | `1` で有効化、デフォルト: `false`）
  - Docker環境では Dockerfile で明示的に `true` を設定
  - エージェントが必要に応じて多言語環境（Python、Go、Java、Rust、Ruby）をインストール可能
  - セキュリティ: デフォルトは無効、Docker内部のみで有効化を推奨

### Git 設定
- `GIT_COMMIT_USER_NAME`: Git コミット作成者名（デフォルト: git config から）
- `GIT_COMMIT_USER_EMAIL`: Git コミット作成者メール（デフォルト: git config から）

### 環境変数アクセス管理（Issue #51で追加）

すべての環境変数アクセスは `src/core/config.ts` の Config クラスを経由します。`process.env` への直接アクセスは行わないでください。

**Config クラスの使用方法**:
```typescript
import { config } from '@/core/config';

// 必須環境変数（未設定時は例外をスロー）
const token = config.getGitHubToken();
const homeDir = config.getHomeDir();

// オプション環境変数（未設定時は null を返す）
const reposRoot = config.getReposRoot();

// エージェント用（用途別に分離、Issue #188）
const codexKey = config.getCodexApiKey();      // CODEX_API_KEY のみ
const claudeToken = config.getClaudeCodeToken(); // OAUTH_TOKEN → API_KEY のフォールバック

// API用（テキスト生成）
const openAiKey = config.getOpenAiApiKey();    // OPENAI_API_KEY のみ
const anthropicKey = config.getAnthropicApiKey(); // ANTHROPIC_API_KEY のみ

// CI環境判定
if (config.isCI()) {
  // CI環境での処理
}
```

**主な利点**:
- 型安全な環境変数アクセス（必須: `string`、オプション: `string | null`）
- 用途別の API キー分離（エージェント用 vs API 呼び出し用）
- Claude Code 認証のフォールバック（`OAUTH_TOKEN` → `API_KEY`）
- テスト容易性の向上（Config モックにより環境変数を簡単にモック可能）

## Jenkins 統合

### 実行モード別Jenkinsfile（v0.4.0、Issue #211で追加）

実行モード別に分割されたJenkinsfileがDocker コンテナ内でワークフローを実行します：

**実行モード専用Jenkinsfile**:
- `jenkins/Jenkinsfile.all-phases` … 全フェーズ実行（Phase 0-9）
- `jenkins/Jenkinsfile.preset` … プリセットワークフロー実行
  - 7種類のプリセット: `review-requirements`, `review-design`, `review-test-scenario`, `quick-fix`, `implementation`, `testing`, `finalize`
- `jenkins/Jenkinsfile.single-phase` … 単一フェーズ実行
  - 10種類のフェーズ: `planning`, `requirements`, `design`, `test-scenario`, `implementation`, `test-implementation`, `testing`, `documentation`, `report`, `evaluation`
- `jenkins/Jenkinsfile.rollback` … フェーズ差し戻し実行（v0.4.0、Issue #90）
- `jenkins/Jenkinsfile.auto-issue` … 自動Issue生成（v0.5.0、Issue #121）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` … PRコメント自動対応（init + execute）（v0.6.0、Issue #393）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` … PRコメント解決処理（finalize）（v0.6.0、Issue #393）

**共通処理モジュール**:
- `jenkins/shared/common.groovy` … 認証情報準備、環境セットアップ、Node.js環境、成果物アーカイブ

**非推奨ファイル**:
- `Jenkinsfile`（ルートディレクトリ） … 非推奨（削除予定: 2025年3月以降、並行運用期間終了後）

### 実行設定

- **エージェントモード**: `AGENT_MODE` パラメータで制御（auto/codex/claude）
- **自動モデル選択**: `AUTO_MODEL_SELECTION` パラメータで制御（デフォルト: true）
  - Issue難易度に基づいて最適なモデルを自動選択（Issue #379で追加）
  - `true`: 難易度分析を実行し、simple/moderate/complexに応じてモデルを選択
  - `false`: 従来動作（`AGENT_MODE`パラメータに従う）
- **実行モード**: 各Jenkinsfileが対応する実行モードを担当
- **認証情報**:
  - `OPENAI_API_KEY`、`GITHUB_TOKEN`、AWS認証情報（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）: Job DSLパラメータから取得
  - `claude-code-oauth-token`: Jenkins Credentialsから取得
- **マルチリポジトリ**: REPOS_ROOT を `/tmp/ai-workflow-repos-${BUILD_ID}` に設定し、対象リポジトリをクローン

### All Phases ジョブのパラメータ（SKIP_PHASES 追加）

| パラメータ | 説明 | デフォルト |
|-----------|------|----------|
| `ISSUE_URL` | GitHub Issue の URL（必須） | なし |
| `DRY_RUN` | ドライランモード。API 呼び出しや Git 操作を行わず動作確認のみ実施 | `false` |
| `SKIP_PHASES` | スキップするフェーズ（カンマ区切り）。空欄の場合はすべて実行。planning はスキップ不可 | `''` |
| `SKIP_REVIEW` | AI レビューをスキップ（検証・デバッグ用途） | `false` |
| `FORCE_RESET` | メタデータを初期化して最初から実行 | `false` |
| `CLEANUP_ON_COMPLETE_FORCE` | Evaluation 完了後にワークフローディレクトリを強制削除 | `false` |
| `SQUASH_ON_COMPLETE` | ワークフロー完了時にコミットをスカッシュ | `false` |
| `LANGUAGE` | ワークフロー言語 (`ja` / `en`) | `ja` |
| その他 | Git 設定、API キー、Webhook 設定など | ― |

#### SKIP_PHASES の使用例

```
# Phase 3 (Test Scenario) と Phase 6 (Testing) をスキップ
SKIP_PHASES: test_scenario,testing

# Phase 7 (Documentation) と Phase 8 (Report) をスキップ
SKIP_PHASES: documentation,report
```

> 注意: `planning` フェーズは依存関係のためスキップ不可。CLI 側でエラーになります。

## テスト関連の注意事項

- テストフレームワーク: Jest with ES modules（`NODE_OPTIONS=--experimental-vm-modules`）
- ユニットテスト: `tests/unit/`（フェーズ依存関係、プリセット解決、リポジトリ解決、レポートクリーンアップ）
- 統合テスト: `tests/integration/`（プリセット実行、マルチリポジトリワークフロー）
- テストでのファイル操作には `fs-extra` を使用
- **テストコードのロギング**: テストファイル（`tests/`配下）でも統一loggerモジュールを使用する。console.log/error/warn等の直接使用は禁止（ESLintの `no-console` ルールで強制）

### テストコード品質のベストプラクティス（Issue #115で追加）

#### TypeScript 5.x + Jest型定義の互換性
- TypeScript 5.xの厳格な型チェックにより、`jest.fn().mockResolvedValue()`の型推論が正しく機能しない場合がある
- **解決策1**: 型パラメータを明示的に指定（`jest.fn<any>()`）
- **解決策2**: 型アサーションを`as any`に統一
- **参考**: Issue #102、Issue #105、Issue #115

**型アノテーション例**:
```typescript
// ❌ 型推論エラーの例
mockGitHub = {
  getIssueInfo: jest.fn().mockResolvedValue({ number: 113 }),  // TS2352エラー
} as any;

// ✅ 型パラメータを明示的に指定
mockGitHub = {
  getIssueInfo: jest.fn<any>().mockResolvedValue({ number: 113 }),
} as any;

// ✅ mockResolvedValue()の戻り値に型アノテーション
jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

// ✅ mockImplementation()のパラメータ型をanyに
jest.spyOn(phase as any, 'revise').mockImplementation(async (feedback: any) => {
  return { success: true, output: 'planning.md' };
});
```

#### モック設定のベストプラクティス
- 過度に広範囲なモック設定は、意図しない影響を与える可能性がある
- **モック範囲を限定する戦略**:
  1. 特定ファイルパスのみをモック
  2. 必要最小限のメソッドのみをモック
  3. モックを設定しない（実ファイルシステムアクセスを許可）

**モッククリーンアップの重要性**（Issue #115で強調）:
- **必須**: `afterEach()`で`jest.restoreAllMocks()`を呼び出し、テスト後に全モックをクリーンアップ
- **理由**: テスト間でモックが残留すると、意図しない副作用が発生する
- **例**: 前のテストの`jest.spyOn(fs, 'readFileSync')`が後続のテストに影響

```typescript
describe('My Test Suite', () => {
  afterEach(() => {
    // ✅ 全モックをクリーンアップ
    jest.restoreAllMocks();

    // テストディレクトリのクリーンアップ
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  it('should handle file operations', () => {
    // テスト内でモックを作成
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // テスト処理...
  });
  // ✅ afterEach()で自動的にモックがクリーンアップされる
});
```

**モック範囲を限定する例**（Issue #115のupdateFileSystemMock戦略）:
```typescript
/**
 * ファイルシステムモックを限定的に設定
 *
 * プロンプトファイル読み込み（loadPrompt）に影響を与えないよう、
 * 特定のファイルパスのみをモックする。
 */
function setupFileSystemMock(): void {
  // 空の関数 = モックを設定しない
  // 実ファイルシステムアクセスを許可し、loadPrompt()が正常に動作する
}
```

#### テストデータの充実
- フェーズ固有のキーワード検証テストでは、適切なテストデータを用意する
- **Planning Phaseの例** (Issue #115):
  - 日本語キーワード: 実装戦略、テスト戦略、タスク分割
  - 英語キーワード: Implementation Strategy、Test Strategy、Task Breakdown
  - 最小文字数: 100文字以上
  - 最小セクション数: 2個以上の`##`ヘッダー

```typescript
// ✅ 適切なテストデータ
const content = `
# Planning Document

## Section 1: Implementation Strategy
This is a comprehensive analysis with detailed explanations.
実装戦略: EXTEND strategy will be used for this implementation.

## Section 2: Test Strategy
More detailed content with implementation strategy information.
テスト戦略: UNIT_INTEGRATION testing approach will be applied.

## Section 3: Task Breakdown
Additional sections with test strategy details.
タスク分割: Tasks are divided into multiple phases.
`;

// ❌ 不十分なテストデータ（キーワード欠落、短すぎる）
const content = `
# Planning Document

## Section 1
Short content.
`;
```

### Jest設定（ESMパッケージ対応）

`jest.config.cjs` の `transformIgnorePatterns` で、ESMパッケージ（`chalk`, `strip-ansi`, `ansi-regex`, `#ansi-styles`）を変換対象に含める設定を追加しています：

```javascript
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
],
```

この設定により、統合テスト（`commit-manager.test.ts` 等）で chalk を使用するモジュールが正しく処理されます。

**主な変更履歴**:
- Issue #102: chalk、strip-ansi、ansi-regex を transformIgnorePatterns に追加
- Issue #105: chalk の内部依存（#ansi-styles）を transformIgnorePatterns に追加

**既知の制限**:
- chalk v5.3.0（ESM only）の内部依存である `#ansi-styles` は Node.js の subpath imports 機能を使用しています
- Jest の `transformIgnorePatterns` に `#ansi-styles` を追加しても、一部の環境では完全にESMエラーが解決されない場合があります
- 問題が継続する場合は、experimental-vm-modules の設定強化、または chalk v4.x（CommonJS版）への切り替えを検討してください

詳細は Issue #102、Issue #105 を参照してください。

## 主要な設計パターン

### エージェントフォールバック戦略
1. プライマリエージェント（`--agent` フラグに基づいて Codex または Claude）
2. 認証エラーまたは空出力の場合: 代替エージェントにフォールバック
3. エージェント選択はコンソールとメタデータに記録

### 自動リトライ付きレビューサイクル
1. フェーズを実行 → 2. 出力をレビュー → 3. 失敗した場合: 修正（最大 3 回まで）→ 4. レビューを繰り返し

### 再開機能
- `ResumeManager`（`src/utils/resume.ts`）が不完全/失敗したフェーズを検出
- `canResume()`: ワークフローが開始されているが完了していないかチェック
- `getResumePhase()`: 次に実行すべきフェーズを返す
- `--phase all` で最後の失敗から継続するために使用

### エージェントログフォーマット
- **Codex**: JSON イベント → ターンごとの内訳を含む Markdown サマリー
- **Claude**: SDK イベント → ツール使用と結果を含む Markdown
- 生ログは `agent_log_raw.txt` として保存、フォーマット済みは `agent_log.md`

## 重要な制約事項

1. **プロンプトは決定的**: `src/prompts/` 内のすべてのテンプレートはビルド時に `dist/` へコピーされる
2. **メタデータはバージョン管理対象**: `.ai-workflow/` はフィーチャーブランチにコミットされる
3. **PR の手動編集不可**: PR 本文は Report phase（Phase 8）で生成される
4. **フェーズ依存関係は厳格**（`--skip-dependency-check` または `--ignore-dependencies` を使用しない限り）
5. **Git 操作にはクリーンな作業ツリーが必要**（pull 時、未コミットの変更がある場合はスキップ）
6. **ファイル参照は `@relative/path` 形式を使用**（エージェントコンテキスト用、`getAgentFileReference()` 参照）
7. **Git URLのセキュリティ**: HTTPS形式のGit URLに埋め込まれたPersonal Access Tokenは自動的に除去される（v0.3.1、Issue #54）。SSH形式の利用を推奨。
8. **ロギング規約（Issue #61）**: console.log/error/warn等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用し、`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` を呼び出す。ESLintの `no-console` ルールで強制。
9. **環境変数アクセス規約（Issue #51）**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）の `config.getXxx()` メソッドを使用する。必須環境変数は例外をスロー、オプション環境変数は `null` を返す。
10. **エラーハンドリング規約（Issue #48）**: `as Error` 型アサーションの使用は禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）の `getErrorMessage()`, `getErrorStack()`, `isError()` を使用する。TypeScript の catch ブロックで `unknown` 型のエラーから安全にメッセージを抽出し、非 Error オブジェクト（string、number、null、undefined）がスローされる場合にも対応する。
11. **フォールバック機構の制約（Issue #113）**: フォールバック機構（`enableFallback: true`）が有効なフェーズでは、エージェントが成果物ファイルを生成しなくても、ログから自動抽出またはrevise呼び出しで復旧を試みる。ただし、以下の条件を満たす必要がある：
    - **ログ存在**: `agent_log.md` が存在すること
    - **コンテンツ長**: 抽出内容が100文字以上
    - **セクション数**: 2個以上のセクションヘッダー（`##`）を含む
    - **キーワード**: フェーズ固有キーワードが少なくとも1つ含まれる（すべて欠落の場合は無効）
    - **revise実装**: ログ抽出失敗時にreviseメソッドが実装されていること（未実装の場合はエラー）
12. **セキュリティ: ReDoS攻撃の防止（Issue #140、Issue #161で完了）**: 正規表現を動的に生成する場合、ユーザー入力やテンプレート変数をそのまま `new RegExp()` に渡すと ReDoS（Regular Expression Denial of Service）攻撃のリスクがある。以下の対策を推奨：
    - **文字列置換**: リテラル文字列の置換には `String.prototype.replaceAll()` を使用（Node.js 15.0.0以降）
    - **エスケープ処理**: 正規表現が必須の場合は、ユーザー入力を適切にエスケープ（例: `escape-string-regexp` ライブラリ）
    - **パフォーマンステスト**: 正規表現パターンに対してタイムアウトテストを実施（OWASP CWE-1333）
    - **実装完了**: `fillTemplate` メソッド（`src/core/claude-agent-client.ts` および `src/core/codex-agent-client.ts`）では、`new RegExp(\`{${key}}\`, 'g')` を `replaceAll(\`{${key}}\`, value)` に置換し、ReDoS脆弱性を完全に排除（99.997%のパフォーマンス改善を達成、Issue #161で修正完了）

## よくあるトラブルシューティング

- **"Workflow not found"**: まず `init` コマンドを実行してください
- **エージェント認証エラー**: `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` を確認してください
- **依存関係検証失敗**: `--ignore-dependencies` を使用するか、前提フェーズを完了させてください
- **マルチリポジトリ解決失敗**: `REPOS_ROOT` 環境変数を設定するか、標準パスにリポジトリが存在することを確認してください

## 追加ドキュメント

- **ARCHITECTURE.md**: 詳細なモジュールアーキテクチャとデータフロー
- **DOCKER_AUTH_SETUP.md**: Codex/Claude 認証のセットアップ
- **SETUP_TYPESCRIPT.md**: ローカル開発環境のセットアップ手順
- **TROUBLESHOOTING.md**: よくある問題と解決方法
- **ROADMAP.md**: 今後の機能計画
