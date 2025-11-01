# アーキテクチャ概要 ― AI Workflow v2 (TypeScript)

このドキュメントでは、TypeScript 版 AI Workflow の構成、モジュール間の制御フロー、および Codex / Claude Code / GitHub との連携方法を説明します。

## 全体フロー

```
CLI (src/main.ts - 約118行に削減、v0.3.0でリファクタリング)
 ├─ runCli() … CLI エントリーポイント
 ├─ commander定義（コマンドルーティングのみ）
 ├─ reportFatalError() … 致命的エラー報告
 ├─ reportExecutionSummary() … 実行サマリー表示
 └─ isValidPhaseName() … フェーズ名バリデーション

src/commands/init.ts (Issue初期化コマンド処理)
 ├─ handleInitCommand() … Issue初期化コマンドハンドラ
 ├─ validateBranchName() … ブランチ名バリデーション（Git 命名規則チェック）
 ├─ resolveBranchName() … ブランチ名解決（カスタム or デフォルト）
 ├─ ★PR タイトル生成★ … Issueタイトルを取得し、PRタイトルとして使用（v0.3.0、Issue #73）
 └─ src/core/repository-utils.ts を利用（Issue URL解析、リポジトリパス解決）

src/commands/execute.ts (フェーズ実行コマンド処理 - ファサード、v0.3.1で27%削減、Issue #46)
 ├─ handleExecuteCommand() … フェーズ実行コマンドハンドラ（各モジュールへ委譲）
 ├─ 既存公開関数の再エクスポート
 │   ├─ executePhasesSequential (workflow-executor から)
 │   ├─ executePhasesFrom (workflow-executor から)
 │   ├─ createPhaseInstance (phase-factory から)
 │   ├─ resolvePresetName (そのまま保持)
 │   └─ getPresetPhases (そのまま保持)
 └─ 内部ヘルパー関数
     ├─ canResumeWorkflow (そのまま保持)
     ├─ loadExternalDocuments (そのまま保持)
     ├─ resetMetadata (そのまま保持)
     └─ reportExecutionSummary (そのまま保持)

src/commands/execute/options-parser.ts (CLIオプション解析、v0.3.1で追加、Issue #46)
 ├─ parseExecuteOptions() … ExecuteCommandOptions を正規化
 └─ validateExecuteOptions() … 相互排他オプションの検証

src/commands/execute/agent-setup.ts (エージェント初期化、v0.3.1で追加、Issue #46)
 ├─ setupAgentClients() … Codex/Claude クライアントの初期化
 └─ resolveAgentCredentials() … 認証情報のフォールバック処理

src/commands/execute/workflow-executor.ts (ワークフロー実行、v0.3.1で追加、Issue #46)
 ├─ executePhasesSequential() … フェーズの順次実行
 ├─ executePhasesFrom() … 特定フェーズからの実行
 └─ 依存関係順にフェーズを実行
      ├─ BasePhase.run()
      │    ├─ execute()    … エージェントで成果物生成
      │    ├─ review()     … 可能ならレビューサイクル実施
      │    └─ revise()     … オプション（自動修正）
      └─ GitManager による自動コミット / プッシュ（必要に応じて）

src/core/phase-factory.ts (フェーズインスタンス生成、v0.3.1で追加、Issue #46)
 └─ createPhaseInstance() … フェーズインスタンス生成（10フェーズ対応）

src/commands/review.ts (フェーズレビューコマンド処理)
 └─ handleReviewCommand() … メタデータを取得し、フェーズの状態を表示

src/commands/list-presets.ts (プリセット一覧表示コマンド処理)
 └─ listPresets() … 利用可能なプリセット一覧を表示

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

src/core/repository-utils.ts (リポジトリ関連ユーティリティ)
 ├─ parseIssueUrl() … GitHub Issue URLからリポジトリ情報を抽出
 ├─ resolveLocalRepoPath() … リポジトリ名からローカルパスを解決
 ├─ findWorkflowMetadata() … Issue番号から対応するメタデータを探索
 └─ getRepoRoot() … Gitリポジトリのルートパスを取得

src/types/commands.ts (コマンド関連の型定義)
 ├─ PhaseContext … フェーズ実行コンテキスト
 ├─ ExecutionSummary … 実行サマリー
 ├─ IssueInfo … Issue情報
 └─ BranchValidationResult … ブランチバリデーション結果
```

## モジュール一覧

| モジュール | 役割 |
|------------|------|
| `src/main.ts` | `commander` による CLI 定義。コマンドルーティングのみを担当（約118行、v0.3.0でリファクタリング）。 |
| `src/index.ts` | `ai-workflow-v2` 実行ファイルのエントリーポイント。`runCli` を呼び出す。 |
| `src/commands/init.ts` | Issue初期化コマンド処理（約356行）。ブランチ作成、メタデータ初期化、PR作成、PRタイトル自動生成（v0.3.0、Issue #73）を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。 |
| `src/commands/execute.ts` | フェーズ実行コマンド処理（約497行、v0.3.1で27%削減、Issue #46）。ファサードパターンにより4つの専門モジュールに分離。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。 |
| `src/commands/execute/options-parser.ts` | CLIオプション解析とバリデーション（約151行、v0.3.1で追加、Issue #46）。`parseExecuteOptions()`, `validateExecuteOptions()` を提供。 |
| `src/commands/execute/agent-setup.ts` | エージェント初期化と認証情報解決（約175行、v0.3.1で追加、Issue #46）。`setupAgentClients()`, `resolveAgentCredentials()` を提供。 |
| `src/commands/execute/workflow-executor.ts` | ワークフロー実行ロジック（約128行、v0.3.1で追加、Issue #46）。`executePhasesSequential()`, `executePhasesFrom()` を提供。 |
| `src/commands/review.ts` | フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。 |
| `src/commands/list-presets.ts` | プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。 |
| `src/commands/rollback.ts` | フェーズ差し戻しコマンド処理（約459行、v0.4.0、Issue #90で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。`handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。 |
| `src/core/repository-utils.ts` | リポジトリ関連ユーティリティ（約170行）。Issue URL解析、ローカルリポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。 |
| `src/core/phase-factory.ts` | フェーズインスタンス生成（約65行、v0.3.1で追加、Issue #46）。`createPhaseInstance()` を提供。10フェーズすべてのインスタンス生成を担当。 |
| `src/core/codex-agent-client.ts` | Codex CLI を起動し JSON イベントをストリーム処理。認証エラー検知・利用量記録も実施（約200行、Issue #26で25.4%削減）。 |
| `src/core/claude-agent-client.ts` | Claude Agent SDK を利用してイベントを取得し、Codex と同様の JSON 形式で保持（約206行、Issue #26で23.7%削減）。 |
| `src/core/helpers/agent-event-parser.ts` | Codex/Claude共通のイベントパースロジック（74行、Issue #26で追加）。`parseCodexEvent()`, `parseClaudeEvent()`, `determineCodexEventType()`, `determineClaudeEventType()` を提供。 |
| `src/core/helpers/log-formatter.ts` | エージェントログのフォーマット処理（181行、Issue #26で追加）。`formatCodexLog()`, `formatClaudeLog()`, `truncateInput()` を提供。 |
| `src/core/helpers/env-setup.ts` | エージェント実行環境のセットアップ（47行、Issue #26で追加）。`setupCodexEnvironment()`, `setupGitHubEnvironment()` を提供。 |
| `src/utils/git-url-utils.ts` | Git URLサニタイゼーション（約60行、Issue #54で追加）。`sanitizeGitUrl()` を提供。HTTPS形式のURLからPersonal Access Tokenを除去し、SSH形式は変更せずに返す。 |
| `src/core/content-parser.ts` | レビュー結果の解釈や判定を担当（OpenAI API を利用）。 |
| `src/core/logger.ts` | Logger抽象化（約158行、Issue #50で追加）。LogLevel enum、ILogger interface、ConsoleLogger class、logger singleton instanceを提供。環境変数 LOG_LEVEL でログレベルを制御可能。 |
| `src/core/github-client.ts` | Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。 |
| `src/core/github/issue-client.ts` | Issue操作の専門クライアント（約238行、Issue #24で追加）。Issue取得、コメント投稿、クローズ、残タスクIssue作成を担当。 |
| `src/core/github/pull-request-client.ts` | PR操作の専門クライアント（約231行、Issue #24で追加）。PR作成、更新、検索、クローズ、PR番号取得を担当。 |
| `src/core/github/comment-client.ts` | コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。 |
| `src/core/github/review-client.ts` | レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。 |
| `src/core/git-manager.ts` | Git操作のファサードクラス（約181行、Issue #25で67%削減）。各専門マネージャーを統合し、後方互換性を維持。 |
| `src/core/git/commit-manager.ts` | コミット操作の専門マネージャー（約530行、Issue #25で追加）。コミット作成、メッセージ生成、SecretMasker統合を担当。 |
| `src/core/git/branch-manager.ts` | ブランチ操作の専門マネージャー（約110行、Issue #25で追加）。ブランチ作成、切り替え、存在チェックを担当。 |
| `src/core/git/remote-manager.ts` | リモート操作の専門マネージャー（約210行、Issue #25で追加）。push、pull、リトライロジック、GitHub認証設定を担当。 |
| `src/core/metadata-manager.ts` | `.ai-workflow/issue-*/metadata.json` の CRUD、コスト集計、リトライ回数管理など（約347行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90）。差し戻し機能用の6つの新規メソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。 |
| `src/core/helpers/metadata-io.ts` | メタデータファイルI/O操作（98行、Issue #26で追加）。`formatTimestampForFilename()`, `backupMetadataFile()`, `removeWorkflowDirectory()`, `getPhaseOutputFilePath()` を提供。 |
| `src/core/helpers/validation.ts` | 共通バリデーション処理（47行、Issue #26で追加）。`validatePhaseName()`, `validateStepName()`, `validateIssueNumber()` を提供。 |
| `src/utils/logger.ts` | 統一ログモジュール（約150行、Issue #61で追加）。ログレベル制御（debug/info/warn/error）、カラーリング機能（chalk統合）、タイムスタンプ自動付与、環境変数制御（LOG_LEVEL、LOG_NO_COLOR）を提供。`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` をエクスポート。 |
| `src/utils/error-utils.ts` | エラーハンドリングユーティリティ（約190行、Issue #48で追加）。`getErrorMessage()`, `getErrorStack()`, `isError()` を提供。TypeScript の catch ブロックで `unknown` 型のエラーから型安全にメッセージを抽出。非 Error オブジェクト（string、number、null、undefined）に対応し、決して例外をスローしない（never throw 保証）。`as Error` 型アサーションの代替として全プロジェクトで使用。 |
| `src/core/config.ts` | 環境変数アクセス管理（約220行、Issue #51で追加）。型安全な環境変数アクセス、必須/オプション環境変数の検証、フォールバックロジック（`CODEX_API_KEY` → `OPENAI_API_KEY` 等）の統一を提供。`config.getGitHubToken()`, `config.getCodexApiKey()`, `config.isCI()` 等14個のメソッドをエクスポート。Singleton パターンで実装。 |
| `src/core/workflow-state.ts` | メタデータの読み書きとマイグレーション処理。 |
| `src/core/phase-dependencies.ts` | フェーズ間の依存関係管理、プリセット定義、依存関係チェック機能を提供（約249行、Issue #26で27.2%削減）。 |
| `src/core/helpers/dependency-messages.ts` | 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）。`buildErrorMessage()`, `buildWarningMessage()` を提供。 |
| `src/types/commands.ts` | コマンド関連の型定義（約240行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry等の型を提供。コマンドハンドラの型安全性を確保。 |
| `src/phases/base-phase.ts` | フェーズ実行の基底クラス（約476行、v0.3.1で40%削減、Issue #49でさらなるモジュール分解、v0.4.0でrollbackプロンプト注入追加、Issue #90）。execute/review/revise のライフサイクル管理とオーケストレーションを担当。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入し、差し戻し理由を次のフェーズ実行時に伝達する機能を提供。 |
| `src/phases/core/agent-executor.ts` | エージェント実行ロジック（約270行、Issue #23で追加）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。 |
| `src/phases/core/review-cycle-manager.ts` | レビューサイクル管理（約130行、Issue #23で追加）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。 |
| `src/phases/lifecycle/step-executor.ts` | ステップ実行ロジック（約233行、Issue #49で追加）。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュを担当。 |
| `src/phases/lifecycle/phase-runner.ts` | フェーズライフサイクル管理（約244行、Issue #49で追加）。フェーズ全体の実行、依存関係検証、エラーハンドリング、進捗投稿を担当。 |
| `src/phases/context/context-builder.ts` | コンテキスト構築（約223行、Issue #49で追加）。オプショナルコンテキスト構築、ファイル参照生成（@filepath形式）、Planning Document参照を担当。 |
| `src/phases/cleanup/artifact-cleaner.ts` | クリーンアップロジック（約228行、Issue #49で追加）。ワークフロークリーンアップ、パス検証（セキュリティ対策）、シンボリックリンクチェック、CI環境判定を担当。 |
| `src/phases/formatters/progress-formatter.ts` | 進捗表示フォーマット（約150行、Issue #23で追加）。GitHub Issue コメント用の進捗状況フォーマットを生成。 |
| `src/phases/formatters/log-formatter.ts` | ログフォーマット（約400行、Issue #23で追加）。Codex/Claude エージェントの生ログを Markdown 形式に変換。 |
| `src/phases/*.ts` | 各フェーズの具象クラス。`execute()`, `review()`, `revise()` を実装。 |
| `src/prompts/{phase}/*.txt` | フェーズ別のプロンプトテンプレート。 |
| `src/templates/*.md` | PR ボディ等の Markdown テンプレート。 |
| `scripts/copy-static-assets.mjs` | ビルド後に prompts / templates を `dist/` へコピー。 |

## BasePhase のライフサイクル

1. **依存関係チェック** … `validatePhaseDependencies` で前工程が完了しているか確認（フラグで無効化可能）。
2. **execute()** … プロンプトを整形しエージェントを呼び出して成果物を生成。
   - **テンプレートメソッドパターン** … `executePhaseTemplate()` により重複コードを削減（Issue #47）
   - **Git自動コミット** … execute完了後、変更をコミット＆プッシュ（v0.3.0で追加）
3. **review()（任意）** … レビュープロンプトを実行し、`ContentParser` で PASS / FAIL を判定。必要に応じてフィードバックを GitHub に投稿。
   - **Git自動コミット** … review完了後、変更をコミット＆プッシュ（v0.3.0で追加）
4. **revise()（任意）** … レビュー失敗時に最大 3 回まで自動修正サイクルを実行。
   - **Git自動コミット** … revise完了後、変更をコミット＆プッシュ（v0.3.0で追加）
5. **メタデータ更新** … フェーズ状態、出力ファイル、コスト、Git コミット情報などを更新。
6. **進捗コメント** … `GitHubClient` を通じて Issue へ進捗コメントを投稿・更新。

### テンプレートメソッドパターン（Issue #47）

全10フェーズの `execute()` メソッドで繰り返されていたプロンプト処理パターン（プロンプト読み込み → 変数置換 → エージェント実行 → 出力確認）を、`BasePhase.executePhaseTemplate()` メソッドに集約しました。

**主な利点**:
- **コード削減**: 約200行（32%）の重複コードを削減
- **保守性向上**: 共通ロジックを単一箇所に集約（DRY原則）
- **一貫性確保**: 全フェーズで統一されたエラーハンドリング
- **拡張性向上**: 新規フェーズ追加が容易

**実装パターン**:
```typescript
protected async executePhaseTemplate<T extends Record<string, string>>(
  phaseOutputFile: string,
  templateVariables: T,
  options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
): Promise<PhaseExecutionResult>
```

各フェーズの `execute()` メソッドは、テンプレート変数を定義して `executePhaseTemplate()` を呼び出すだけで済むようになりました。特殊ロジック（設計決定抽出、ファイル更新チェック等）は各フェーズで保持されます。

### ステップ単位のGitコミット（v0.3.0）

各ステップ（execute/review/revise）の完了後に自動的にGitコミット＆プッシュが実行されます：

- **コミットメッセージ形式**: `[ai-workflow] Phase {number} ({name}) - {step} completed`
- **メタデータ管理**: `metadata.json` に `current_step` と `completed_steps` フィールドを追加
- **レジューム機能**: 完了済みステップは自動的にスキップされ、失敗したステップのみ再実行
- **CI環境対応**: リモートブランチからメタデータを同期し、ワークスペースリセット後も適切なステップから再開

### BasePhase のモジュール構造（v0.3.1、Issue #23）

BasePhase クラスは1420行から676行へリファクタリングされ（約52.4%削減）、4つの独立したモジュールに責務を分離しました：

**コアモジュール**:
- **AgentExecutor** (`src/phases/core/agent-executor.ts`): エージェント実行ロジックを担当。Codex/Claude エージェントの実行、認証エラー時のフォールバック処理、空出力時のフォールバック処理、利用量メトリクスの抽出・記録を実施。
- **ReviewCycleManager** (`src/phases/core/review-cycle-manager.ts`): レビューサイクル管理を担当。レビュー失敗時の自動修正（revise）、最大リトライ回数（3回）のチェック、Git コミット＆プッシュの統合、completed_steps の管理を実施。

**フォーマッターモジュール**:
- **ProgressFormatter** (`src/phases/formatters/progress-formatter.ts`): 進捗表示フォーマットを担当。フェーズステータスに応じた絵文字表示、全フェーズの進捗状況リスト、現在のフェーズ詳細、完了したフェーズの詳細（折りたたみ表示）を生成。
- **LogFormatter** (`src/phases/formatters/log-formatter.ts`): ログフォーマットを担当。Codex/Claude の生ログを Markdown 形式に変換、JSON イベントストリームの解析、4000文字を超える出力の切り詰め処理を実施。

**オーケストレーション**:
BasePhase クラスは各モジュールを依存性注入により統合し、フェーズライフサイクル（execute → review → revise）のオーケストレーションのみを担当します。各モジュールは単一の責務を持ち（Single Responsibility Principle）、独立してテスト可能です。

### BasePhase のさらなるモジュール分解（v0.3.1、Issue #49）

Issue #49では、BasePhase クラスを676行から445行へさらにリファクタリングし（約40%削減）、4つの専門モジュールに責務を分離しました：

**ライフサイクルモジュール**:
- **StepExecutor** (`src/phases/lifecycle/step-executor.ts`, 233行): ステップ実行ロジックを担当。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュ（`commitAndPushStep`）、ステップ完了チェック（`isStepCompleted`）を実施。各ステップ完了後に自動コミット・プッシュが実行され、レジューム機能をサポート。
- **PhaseRunner** (`src/phases/lifecycle/phase-runner.ts`, 244行): フェーズライフサイクル管理を担当。フェーズ全体の実行（`runPhase`）、依存関係検証（`validateAndStartPhase`）、エラーハンドリング（`handlePhaseError`）、GitHub進捗投稿（`postProgressToGitHub`）、フェーズ完了処理（`finalizePhase`）を実施。

**コンテキスト構築モジュール**:
- **ContextBuilder** (`src/phases/context/context-builder.ts`, 223行): コンテキスト構築を担当。オプショナルコンテキスト構築（`buildOptionalContext`）、ファイル参照生成（`@filepath` 形式、`buildFileReference`）、Planning Document参照（`buildPlanningDocumentReference`）を実施。ファイルが存在しない場合は適切なフォールバックメッセージを返し、依存関係を無視した柔軟な実行を可能にする。

**クリーンアップモジュール**:
- **ArtifactCleaner** (`src/phases/cleanup/artifact-cleaner.ts`, 228行): クリーンアップロジックを担当。ワークフロークリーンアップ（`cleanupWorkflowLogs`, `cleanupWorkflowArtifacts`）、パス検証（正規表現によるセキュリティ対策、`validateWorkflowPath`）、シンボリックリンクチェック（`isSymbolicLink`）、CI環境判定（`shouldAutoConfirm`）、確認プロンプト表示を実施。

**ファサードパターンによる後方互換性**:
BasePhase クラスは各専門モジュールのインスタンスを保持し、既存のpublicメソッドを対応するモジュールに委譲することで、後方互換性を100%維持します。依存性注入パターンにより、各モジュールは独立してテスト可能で、単一責任原則（SRP）に従った設計となっています。

**主な利点**:
- **保守性向上**: 各モジュールが明確な責務を持ち、コードの理解と変更が容易
- **テスト容易性**: 独立したモジュールにより、ユニットテストとモックが容易
- **拡張性向上**: 新機能の追加が特定のモジュールに限定され、影響範囲が明確
- **コード削減**: 676行から445行へ34%削減（リファクタリング効果と重複削減）

## エージェントの選択

`src/commands/execute.ts` の `handleExecuteCommand()` で `--agent` オプションを解釈します。

- `auto` … `CODEX_API_KEY` / `OPENAI_API_KEY` が設定されていれば Codex を優先し、なければ Claude を使用。
- `codex` … Codex API キー必須。ログは `CodexAgentClient` が収集。
- `claude` … Claude 認証情報が必須。Codex は無効化されます。

`CodexAgentClient` は JSON イベントを `agent_log_raw.txt` に蓄積し、Markdown サマリー（失敗時は生 JSON ブロック）を生成します。`ClaudeAgentClient` は従来の Markdown 形式を維持します。

## プリセットとフェーズ依存関係

### プリセット機能

`src/core/phase-dependencies.ts` は、よくある開発パターンに合わせて複数のフェーズを組み合わせたプリセット定義を提供します。

**主なプリセット**:
- `review-requirements`, `review-design`, `review-test-scenario` … レビュー駆動パターン
- `quick-fix`, `implementation` … 実装中心パターン
- `testing` … テスト中心パターン
- `finalize` … ドキュメント・レポートパターン

プリセット名の解決は `src/commands/execute.ts` の `resolvePresetName()` 関数で行われ、後方互換性のために非推奨プリセット名（`requirements-only`, `design-phase`, `implementation-phase`, `full-workflow`）のエイリアスもサポートします。

### 依存関係チェック

`validatePhaseDependencies()` 関数は、各フェーズの実行前に依存する前段フェーズが完了しているかチェックします。以下の機能を提供:

- **完了状態チェック**: metadata.json の `completed` フラグを確認
- **ファイル存在チェック**: 実ファイルが存在するか確認（`checkFileExistence` オプション）
- **エラーメッセージ構築**: 未完了フェーズとファイル不在を明示的に表示
- **警告モード**: `--ignore-dependencies` オプションで警告のみ表示して実行継続

### オプショナルコンテキスト構築

`BasePhase` クラスの `buildOptionalContext()` メソッドは、前段フェーズの成果物が存在しない場合でもフェーズを実行できるようにします。ファイルが存在する場合は `@filepath` 形式で参照し、存在しない場合はフォールバックメッセージを返します。これにより `quick-fix` プリセットなどで、依存関係を無視した柔軟な実行が可能になります。

**適用済みPhase**:
- `ImplementationPhase` - requirements、design、test_scenario を参照
- `TestImplementationPhase` - requirements、design、test_scenario、implementation を参照
- `TestingPhase` - test_implementation、implementation、test_scenario を参照
- `DocumentationPhase` - implementation、testing を主要コンテキストとして参照
- `ReportPhase` - requirements、design、implementation、testing、documentation を参照

各Phaseは、ファイルが存在しない場合でも適切なフォールバックメッセージによりエージェントが動作を継続できます。

## ワークフローメタデータ

```
.ai-workflow/issue-385/
├── metadata.json             # WorkflowState（フェーズ状態、コスト、設計メモ、対象リポジトリ等）
├── 00_planning/
│   ├── execute/agent_log_raw.txt
│   ├── execute/prompt.txt
│   ├── review/...
│   └── output/planning.md
└── …
```

`metadata.json` には以下を記録します。

- `phases.*.status` … `pending | in_progress | completed | failed`
- `phases.*.current_step` … 現在実行中のステップ（'execute' | 'review' | 'revise' | null）（v0.3.0 で追加）
- `phases.*.completed_steps` … 完了済みステップの配列（v0.3.0 で追加）
- `phases.*.rollback_context` … 差し戻しコンテキスト（triggered_at、from_phase、to_phase、to_step、reason等）（v0.4.0、Issue #90で追加、オプショナル）
- `rollback_history` … 差し戻し履歴の配列（各エントリは triggered_at、from_phase、to_phase、to_step、reason等を含む）（v0.4.0、Issue #90で追加、オプショナル）
- `retry_count` … revise 実行回数
- `output_files` … 生成成果物のパス
- `design_decisions` … 設計フェーズでの意思決定ログ
- `cost_tracking` … トークン数と概算コスト（USD）
- `github_integration` … 進捗コメントの ID など
- `target_repository` … 対象リポジトリ情報（path、github_name、remote_url、owner、repo）（v0.2.0 で追加）

### ワークフローログクリーンアップ

Report Phase (Phase 8) 完了後、`cleanupWorkflowLogs()` メソッドが自動的に実行され、デバッグログを削除します：

**削除対象**:
- フェーズ 00_planning 〜 08_report の `execute/`, `review/`, `revise/` ディレクトリ
- 内容: `agent_log.md`, `agent_log_raw.txt`, `prompt.txt` など

**保持対象**:
- `metadata.json`（各フェーズのメタデータ）
- `output/*.md`（成果物ファイル、Planning Phaseの `output/planning.md` を含む）

**実行タイミング**: Report Phase の `execute()` メソッド完了後、Git コミット前に実行されるため、クリーンアップされた状態が自動的にコミット・プッシュされます。

**Git コミットメッセージ**: `[ai-workflow] Clean up workflow execution logs` (Phase 8: report)

**エラーハンドリング**: クリーンアップ失敗時も WARNING ログのみ出力し、ワークフロー全体は継続します。

**効果**: リポジトリサイズを約 75% 削減、PR レビューを成果物に集中

### Evaluation Phase 完了後のクリーンアップ（v0.3.0）

Evaluation Phase (Phase 9) 完了後、`--cleanup-on-complete` オプションでワークフローディレクトリ全体を削除できます：

**実行フロー**:
1. `EvaluationPhase.run(options)` 実行
2. `super.run(options)` でフェーズ完了
3. `options.cleanupOnComplete === true` の場合、`BasePhase.cleanupWorkflowArtifacts()` 呼び出し
4. CI環境判定（`process.env.CI`）
5. 確認プロンプト表示（`force=false` かつ非CI環境の場合のみ）
6. パス検証（正規表現 `\.ai-workflow[\/\\]issue-\d+$`）とシンボリックリンクチェック
7. `.ai-workflow/issue-<NUM>/` ディレクトリ削除
8. Git コミット & プッシュ

**エラーハンドリング**: クリーンアップ失敗時もワークフロー全体は成功として扱う（Report Phaseと同様）

**セキュリティ対策**:
- パストラバーサル攻撃防止（正規表現によるパス検証）
- シンボリックリンク攻撃防止（`fs.lstatSync()` による検証）

## 外部サービスとの連携

### Codex CLI
- バイナリパス: `codex`（必要に応じて `CODEX_CLI_PATH` で上書き）
- 必須環境変数: `CODEX_API_KEY` または `OPENAI_API_KEY`
- ログ: `agent_log_raw.txt`（JSON）＋ Markdown サマリー

### Claude Code SDK
- `CLAUDE_CODE_CREDENTIALS_PATH` もしくは `CLAUDE_CODE_OAUTH_TOKEN` が必要
- SDK のストリームイベントを Codex と同じ形式の JSON 配列として保存

### GitHub

**GitHubClient のモジュール構成（v0.3.1、Issue #24）**:

GitHubClient は702行から402行へリファクタリングされ（約42.7%削減）、ファサードパターンにより4つの専門クライアントに責務を分離しました：

- **IssueClient** (`src/core/github/issue-client.ts`): Issue操作を担当。Issue取得、コメント投稿、クローズ、残タスクIssue作成を提供。
- **PullRequestClient** (`src/core/github/pull-request-client.ts`): PR操作を担当。PR作成、更新、検索、クローズ、PR番号取得を提供。
- **CommentClient** (`src/core/github/comment-client.ts`): コメント操作を担当。ワークフロー進捗コメント、進捗コメント作成/更新を提供。
- **ReviewClient** (`src/core/github/review-client.ts`): レビュー操作を担当。レビュー結果投稿を提供。

**ファサードパターンの設計**:
- GitHubClient は各専門クライアントのインスタンスを保持し、既存のpublicメソッドを対応するクライアントに委譲
- Octokitインスタンスはコンストラクタ注入により各クライアントで共有（依存性注入パターン）
- 後方互換性100%維持（既存の呼び出し元は無変更で動作）
- ドキュメント抽出関連メソッド（`extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed` 等）はGitHubClient内部に保持

**環境変数**:
- `GITHUB_TOKEN`, `GITHUB_REPOSITORY` を使用
- Issue への進捗コメント投稿、PR ボディ生成、成果物の添付に利用

### Git

**GitManager のモジュール構成（v0.3.1、Issue #25）**:

GitManager は548行から181行へリファクタリングされ（約67%削減）、ファサードパターンにより3つの専門マネージャーに責務を分離しました：

- **CommitManager** (`src/core/git/commit-manager.ts`): コミット操作を担当。コミット作成（commitPhaseOutput, commitStepOutput, commitWorkflowInit, commitCleanupLogs）、コミットメッセージ生成、SecretMasker統合（Issue #54でmetadata.jsonスキャン追加）、ファイル操作ヘルパー（getChangedFiles, filterPhaseFiles, ensureGitConfig）を提供。
- **BranchManager** (`src/core/git/branch-manager.ts`): ブランチ操作を担当。ブランチ作成、切り替え、存在チェック（ローカル/リモート）、現在のブランチ取得を提供。
- **RemoteManager** (`src/core/git/remote-manager.ts`): リモート操作を担当。push（upstream設定、リトライロジック）、pull、GitHub認証設定（setupGithubCredentials）、再試行可能エラー判定（isRetriableError）を提供。

**ファサードパターンの設計**:
- GitManager は各専門マネージャーのインスタンスを保持し、既存のpublicメソッドを対応するマネージャーに委譲
- simple-gitインスタンスはコンストラクタ注入により各マネージャーで共有（依存性注入パターン）
- 後方互換性100%維持（既存の呼び出し元は無変更で動作）
- 自動コミットメッセージは `"[ai-workflow] Phase {number} ({name}) - {step} completed"` 形式（ステップ単位のコミット）

## Jenkins での利用

`jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy` で `AGENT_MODE` パラメータを定義し、パイプライン（`jenkins/jobs/pipeline/ai-workflow/ai-workflow-orchestrator/Jenkinsfile`）が CLI に渡します。TypeScript プロジェクトの `Dockerfile` からビルドしたイメージ上で CLI を実行し、必要に応じて Claude 認証情報をコピーします。

## ビルドパイプライン

```
npm run build
 ├─ tsc -p tsconfig.json
 └─ node scripts/copy-static-assets.mjs
```

`dist/` ディレクトリは `src/` と同じ構造で生成され、Docker / Jenkins からもプロンプトとテンプレートを利用できるようになります。
