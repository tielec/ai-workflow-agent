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
 └─ src/core/repository-utils.ts を利用（Issue URL解析、リポジトリパス解決）

src/commands/execute.ts (フェーズ実行コマンド処理)
 ├─ handleExecuteCommand() … フェーズ実行コマンドハンドラ
 ├─ executePhasesSequential() … フェーズ順次実行
 ├─ executePhasesFrom() … 特定フェーズから実行
 ├─ createPhaseInstance() … フェーズインスタンス作成
 ├─ resolvePresetName() … プリセット名解決（後方互換性対応）
 ├─ getPresetPhases() … プリセットフェーズ取得
 ├─ canResumeWorkflow() … ワークフロー再開可否判定
 ├─ loadExternalDocuments() … 外部ドキュメント読み込み
 ├─ resetMetadata() … メタデータリセット
 └─ 依存関係順にフェーズを実行
      ├─ BasePhase.run()
      │    ├─ execute()    … エージェントで成果物生成
      │    ├─ review()     … 可能ならレビューサイクル実施
      │    └─ revise()     … オプション（自動修正）
      └─ GitManager による自動コミット / プッシュ（必要に応じて）

src/commands/review.ts (フェーズレビューコマンド処理)
 └─ handleReviewCommand() … メタデータを取得し、フェーズの状態を表示

src/commands/list-presets.ts (プリセット一覧表示コマンド処理)
 └─ listPresets() … 利用可能なプリセット一覧を表示

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
| `src/commands/init.ts` | Issue初期化コマンド処理（約306行）。ブランチ作成、メタデータ初期化、PR作成を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。 |
| `src/commands/execute.ts` | フェーズ実行コマンド処理（約634行）。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。 |
| `src/commands/review.ts` | フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。 |
| `src/commands/list-presets.ts` | プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。 |
| `src/core/repository-utils.ts` | リポジトリ関連ユーティリティ（約170行）。Issue URL解析、ローカルリポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。 |
| `src/core/codex-agent-client.ts` | Codex CLI を起動し JSON イベントをストリーム処理。認証エラー検知・利用量記録も実施。 |
| `src/core/claude-agent-client.ts` | Claude Agent SDK を利用してイベントを取得し、Codex と同様の JSON 形式で保持。 |
| `src/core/content-parser.ts` | レビュー結果の解釈や判定を担当（OpenAI API を利用）。 |
| `src/core/github-client.ts` | Octokit ラッパー。コメント投稿、PR ボディ生成、ワークフロー情報の同期など。 |
| `src/core/git-manager.ts` | `simple-git` 経由でブランチ切替、pull、commit、push を実行。 |
| `src/core/metadata-manager.ts` | `.ai-workflow/issue-*/metadata.json` の CRUD、コスト集計、リトライ回数管理など。 |
| `src/core/workflow-state.ts` | メタデータの読み書きとマイグレーション処理。 |
| `src/core/phase-dependencies.ts` | フェーズ間の依存関係管理、プリセット定義、依存関係チェック機能を提供。 |
| `src/types/commands.ts` | コマンド関連の型定義（約71行）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult等の型を提供。 |
| `src/phases/*.ts` | 各フェーズの具象クラス。`execute()`, `review()`, `revise()` を実装。 |
| `src/prompts/{phase}/*.txt` | フェーズ別のプロンプトテンプレート。 |
| `src/templates/*.md` | PR ボディ等の Markdown テンプレート。 |
| `scripts/copy-static-assets.mjs` | ビルド後に prompts / templates を `dist/` へコピー。 |

## BasePhase のライフサイクル

1. **依存関係チェック** … `validatePhaseDependencies` で前工程が完了しているか確認（フラグで無効化可能）。
2. **execute()** … プロンプトを整形しエージェントを呼び出して成果物を生成。
   - **Git自動コミット** … execute完了後、変更をコミット＆プッシュ（v0.3.0で追加）
3. **review()（任意）** … レビュープロンプトを実行し、`ContentParser` で PASS / FAIL を判定。必要に応じてフィードバックを GitHub に投稿。
   - **Git自動コミット** … review完了後、変更をコミット＆プッシュ（v0.3.0で追加）
4. **revise()（任意）** … レビュー失敗時に最大 3 回まで自動修正サイクルを実行。
   - **Git自動コミット** … revise完了後、変更をコミット＆プッシュ（v0.3.0で追加）
5. **メタデータ更新** … フェーズ状態、出力ファイル、コスト、Git コミット情報などを更新。
6. **進捗コメント** … `GitHubClient` を通じて Issue へ進捗コメントを投稿・更新。

### ステップ単位のGitコミット（v0.3.0）

各ステップ（execute/review/revise）の完了後に自動的にGitコミット＆プッシュが実行されます：

- **コミットメッセージ形式**: `[ai-workflow] Phase {number} ({name}) - {step} completed`
- **メタデータ管理**: `metadata.json` に `current_step` と `completed_steps` フィールドを追加
- **レジューム機能**: 完了済みステップは自動的にスキップされ、失敗したステップのみ再実行
- **CI環境対応**: リモートブランチからメタデータを同期し、ワークスペースリセット後も適切なステップから再開

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
- `GITHUB_TOKEN`, `GITHUB_REPOSITORY` を使用
- Issue への進捗コメント投稿、PR ボディ生成、成果物の添付に利用

### Git
- `GitManager` が checkout / pull / commit / push を担当
- 自動コミットメッセージは `"chore: update <phase>"`（実装を参照）

## Jenkins での利用

`jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy` で `AGENT_MODE` パラメータを定義し、パイプライン（`jenkins/jobs/pipeline/ai-workflow/ai-workflow-orchestrator/Jenkinsfile`）が CLI に渡します。TypeScript プロジェクトの `Dockerfile` からビルドしたイメージ上で CLI を実行し、必要に応じて Claude 認証情報をコピーします。

## ビルドパイプライン

```
npm run build
 ├─ tsc -p tsconfig.json
 └─ node scripts/copy-static-assets.mjs
```

`dist/` ディレクトリは `src/` と同じ構造で生成され、Docker / Jenkins からもプロンプトとテンプレートを利用できるようになります。
