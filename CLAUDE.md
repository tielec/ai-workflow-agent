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

## CLI の使用方法

CLI バイナリは `ai-workflow` です（ローカル実行時は `node dist/index.js`）。

### ワークフロー初期化
```bash
# Issue に対してワークフローを初期化（メタデータ、ブランチ、ドラフト PR を作成）
node dist/index.js init --issue-url <GITHUB_ISSUE_URL>

# カスタムブランチ名を指定（v0.2.0 で追加）
node dist/index.js init --issue-url <GITHUB_ISSUE_URL> --branch <BRANCH_NAME>
```

**`--branch` オプション**:
- **未指定時**: デフォルトブランチ名 `ai-workflow/issue-{issue_number}` を使用
- **指定時**: カスタムブランチ名を使用（既存ブランチにも切り替え可能）
- **バリデーション**: Git 命名規則（空白不可、連続ドット不可、不正文字不可）に従う

**PR タイトル生成**（v0.3.0 で追加、Issue #73）:
- Issue タイトルを取得し、そのままPRタイトルとして使用
- Issue取得失敗時は従来の形式 `[AI-Workflow] Issue #<NUM>` にフォールバック
- 256文字を超えるタイトルは自動的に切り詰め（253文字 + `...`）

### フェーズ実行
```bash
# 全フェーズを実行（失敗したフェーズから自動的に再開）
node dist/index.js execute --issue <NUM> --phase all

# 特定のフェーズを実行
node dist/index.js execute --issue <NUM> --phase <PHASE_NAME>

# プリセットワークフローを実行（推奨）
node dist/index.js execute --issue <NUM> --preset <PRESET_NAME>

# 利用可能なプリセット一覧を表示
node dist/index.js list-presets
```

### フェーズ差し戻し（v0.4.0、Issue #90で追加）
```bash
# ワークフローを前のフェーズに差し戻し（直接理由を指定）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --reason "差し戻し理由"

# ファイルから差し戻し理由を読み込む
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --reason-file /path/to/reason.md

# インタラクティブモード（標準入力から理由を入力）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --interactive

# 特定のステップへの差し戻し（revise ステップから再開）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase implementation \
  --to-step revise \
  --reason "レビューコメントの修正が必要"

# ドライラン（実際には差し戻さず、変更内容のみ確認）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase implementation \
  --reason "テスト用" \
  --dry-run
```

**主な機能**:
- **3つの入力方法**: `--reason`（直接指定）、`--reason-file`（ファイル）、`--interactive`（標準入力）
- **メタデータ自動更新**: 差し戻し先フェーズを `in_progress` に、後続フェーズを `pending` にリセット
- **差し戻し履歴記録**: `metadata.json` の `rollback_history` 配列に履歴を保存
- **プロンプト自動注入**: 差し戻し先フェーズの `revise` ステップで差し戻し理由が自動的にプロンプトに注入
- **ROLLBACK_REASON.md生成**: 差し戻し理由を記録したMarkdownファイルを自動生成

**オプション**:
- `--to-step <step>`: 差し戻し先のステップ（`execute` | `review` | `revise`、デフォルト: `revise`）
- `--from-phase <phase>`: 差し戻し元のフェーズ（省略時は現在の最新完了フェーズ）
- `--force`: 確認プロンプトをスキップ
- `--dry-run`: 実際には差し戻さず、変更内容のみを表示

### フォローアップIssue生成オプション（v0.5.0、Issue #119で追加）
```bash
# OpenAIを使用してフォローアップIssueのタイトル/本文を生成
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode openai \
  --followup-llm-model gpt-4o-mini \
  --followup-llm-append-metadata

# Claudeを使用してフォローアップIssueを生成
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode claude \
  --followup-llm-model claude-3-sonnet-20240229

# LLM生成を無効化（既存テンプレートを使用）
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode off
```

**主な機能**:
- **LLM統合**: OpenAI（gpt-4o-mini）またはAnthropic（claude-3-sonnet-20240229）を使用してフォローアップIssueのタイトル/本文を生成
- **自動フォールバック**: LLM呼び出し失敗時は既存テンプレートへ自動的にフォールバック
- **セキュリティ**: プロンプト送信前にシークレット（APIキー、メールアドレス、トークン）を自動マスキング
- **リトライ制御**: 指数バックオフ戦略で最大3回までリトライ
- **メタデータ記録**: 生成元プロバイダ、モデル、実行時間、リトライ回数、トークン使用量を記録

**オプション**:
- `--followup-llm-mode <mode>`: LLMプロバイダ（`auto` | `openai` | `claude` | `off`、デフォルト: `off`）
- `--followup-llm-model <model>`: 使用モデル（`gpt-4o-mini` | `claude-3-sonnet-20240229` 等）
- `--followup-llm-timeout <ms>`: タイムアウト（ミリ秒、デフォルト: 30000）
- `--followup-llm-max-retries <count>`: 最大リトライ回数（デフォルト: 3）
- `--followup-llm-append-metadata`: Issue本文末尾に生成メタデータを追記

**環境変数**:
- `FOLLOWUP_LLM_MODE`: LLMプロバイダ（CLI引数より優先度低）
- `FOLLOWUP_LLM_MODEL`: 使用モデル
- `OPENAI_API_KEY`: OpenAI APIキー（`--followup-llm-mode openai` 使用時に必須）
- `ANTHROPIC_API_KEY`: Anthropic APIキー（`--followup-llm-mode claude` 使用時に必須）

**生成品質要件**:
- タイトル: 50〜80文字の日本語タイトル
- 本文: 5つの必須セクション（背景、実行内容、テスト、注意事項、参考情報）を含むMarkdown形式
- バリデーション: タイトル長、セクション存在チェック、最小文字数検証

### 自動バグ・リファクタリング検出＆Issue生成（v0.5.0、Issue #126/#127で追加）
```bash
# リポジトリのバグを自動検出してGitHub Issueを生成
node dist/index.js auto-issue

# リファクタリング機会を検出してGitHub Issueを生成
node dist/index.js auto-issue --category refactor

# 機能拡張提案を検出してGitHub Issueを生成
node dist/index.js auto-issue --category enhancement

# 創造的な機能拡張提案を検出してGitHub Issueを生成（--creative-modeオプション）
node dist/index.js auto-issue --category enhancement --creative-mode

# プレビューモード（Issue生成せず、検出結果のみ表示）
node dist/index.js auto-issue --dry-run

# 検出数を制限（最大5件のIssueを生成）
node dist/index.js auto-issue --limit 5

# 類似度閾値を調整（より厳格な重複判定、バグ検出時のみ有効）
node dist/index.js auto-issue --similarity-threshold 0.85

# すべてのオプションを組み合わせ
node dist/index.js auto-issue \
  --category bug \
  --limit 10 \
  --dry-run \
  --similarity-threshold 0.8 \
  --agent codex
```

**主な機能**:
- **RepositoryAnalyzer**: コードベース全体を自動分析し、潜在的なバグ、リファクタリング機会、機能拡張提案を検出（30+ 言語サポート、Issue #144で汎用化）
  - **バグ検出**（`analyzeForBugs`）: 潜在的なバグ、エラーハンドリング不足、null参照など
  - **リファクタリング検出**（`analyzeForRefactoring`）: 6種類のリファクタリングタイプ（large-file, large-function, high-complexity, duplication, unused-code, missing-docs）
  - **機能拡張提案**（`analyzeForEnhancements`）: 6種類の拡張タイプ（improvement, integration, automation, dx, quality, ecosystem）、--creative-modeオプション対応
- **IssueDeduplicator**: 2段階の重複検出アルゴリズム（バグ検出時のみ有効）
  - Stage 1: コサイン類似度による高速フィルタリング（TF-IDF ベクトル化）
  - Stage 2: LLM による意味的類似性の判定
- **IssueGenerator**: 検出されたバグ、リファクタリング機会、または機能拡張提案から自動的にGitHub Issueを作成
  - **バグIssue**（`generate`）: エージェント生成の詳細な説明と修正提案
  - **リファクタリングIssue**（`generateRefactorIssue`）: テンプレートベースの定型Issue（概要、推奨改善策、アクションアイテム）
  - **機能拡張Issue**（`generateEnhancementIssue`）: エージェント生成の詳細な提案（根拠、実装ヒント、期待される効果、工数見積もり）

**リポジトリパス解決**（Issue #153で修正）:
- `GITHUB_REPOSITORY` 環境変数から対象リポジトリを自動解決
- `REPOS_ROOT` が設定されている場合、優先的に使用（Jenkins環境では必須）
- `REPOS_ROOT` 未設定時はフォールバック候補パス（`~/TIELEC/development/{repo}`、`~/projects/{repo}`、`../{repo}`）を探索
- リポジトリが見つからない場合、明確なエラーメッセージを表示し、`REPOS_ROOT` 設定またはJenkinsfile確認を促す

**オプション**:
- `--category <type>`: 検出するIssueの種類（`bug` | `refactor` | `enhancement` | `all`、デフォルト: `bug`）
  - **Phase 1 (Issue #126)**: `bug`（バグ検出とIssue生成）
  - **Phase 2 (Issue #127)**: `refactor`（リファクタリング機会検出とIssue生成）
    - 6種類のリファクタリングタイプをサポート
    - 優先度による自動ソート（high → medium → low）
    - 重複除外は実行されません
  - **Phase 3 (Issue #128)**: `enhancement`（機能拡張提案とIssue生成）
    - 6種類の拡張タイプをサポート（improvement, integration, automation, dx, quality, ecosystem）
    - 優先度（expected_impact）による自動ソート（high → medium → low）
    - 重複除外は実行されません
    - `--creative-mode` オプションで実験的・創造的な提案を有効化
- `--limit <number>`: 生成するIssueの最大数（デフォルト: 無制限）
- `--dry-run`: プレビューモード（Issue生成せず、検出結果のみ表示）
- `--similarity-threshold <0.0-1.0>`: 重複判定の類似度閾値（デフォルト: 0.75、バグ検出時のみ有効）
- `--agent <mode>`: 使用するAIエージェント（`auto` | `codex` | `claude`）
- `--creative-mode`: 創造的・実験的な提案を有効化（`enhancement` カテゴリのみ有効）
  - より野心的で革新的な機能拡張アイデアを生成
  - 実験的な統合やエコシステム改善の提案を含む

**サポート対象言語**（v0.5.1、Issue #144で汎用化）:

| カテゴリ | 言語/ファイル |
|---------|--------------|
| **スクリプト言語** | JavaScript (.js, .jsx, .mjs), TypeScript (.ts, .tsx), Python (.py), Ruby (.rb), PHP (.php), Perl (.pl), Shell (.sh, .bash) |
| **コンパイル言語** | Go (.go), Java (.java), Kotlin (.kt), Rust (.rs), C (.c, .h), C++ (.cpp, .hpp), C# (.cs), Swift (.swift) |
| **JVM言語** | Groovy (.groovy), Scala (.scala) |
| **CI/CD設定** | Jenkinsfile, Dockerfile, Makefile |
| **設定/データ** | YAML (.yml, .yaml), JSON (.json), TOML (.toml), XML (.xml) |
| **IaC** | Terraform (.tf), CloudFormation (.template) |

**除外パターン**:
- **ディレクトリ**: `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `coverage/`, `.next/`, `.nuxt/`
- **生成ファイル**: `*.min.js`, `*.bundle.js`, `*.generated.*`, `*.g.go`, `*.pb.go`, `*.gen.ts`
- **ロックファイル**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `poetry.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, `composer.lock`
- **バイナリ**: `.exe`, `.dll`, `.so`, `.dylib`, `.a`, `.lib`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.svg`, `.webp`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.zip`, `.tar`, `.gz`, `.bz2`, `.7z`, `.rar`, `.mp3`, `.mp4`, `.avi`, `.mov`, `.mkv`, `.woff`, `.woff2`, `.ttf`, `.eot`

**現在の実装状況**:
- ✅ **Phase 1 (Issue #126)**: `bug` カテゴリ（バグ検出とIssue生成）
- ✅ **Phase 2 (Issue #127)**: `refactor` カテゴリ（リファクタリング機会検出とIssue生成）
- ✅ **Phase 3 (Issue #128)**: `enhancement` カテゴリ（機能拡張提案とIssue生成）
- ⏳ **Phase 4**: `all` カテゴリ（将来実装予定）

### エージェントモード
- `--agent auto`（デフォルト）: `CODEX_API_KEY` が設定されていれば Codex を使用、なければ Claude にフォールバック
- `--agent codex`: Codex を強制使用（`CODEX_API_KEY` または `OPENAI_API_KEY` が必要）
- `--agent claude`: Claude を強制使用（`CLAUDE_CODE_CREDENTIALS_PATH` が必要）

### 依存関係管理
- `--skip-dependency-check`: すべての依存関係検証をバイパス（慎重に使用）
- `--ignore-dependencies`: 警告を表示するが実行を継続
- `--force-reset`: メタデータをクリアして Phase 0 から再開

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
- **`src/commands/rollback.ts`**: フェーズ差し戻しコマンド処理（約459行、v0.4.0、Issue #90で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。`handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。
- **`src/core/repository-utils.ts`**: リポジトリ関連ユーティリティ（約170行）。Issue URL解析、リポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。
- **`src/core/phase-factory.ts`**: フェーズインスタンス生成（約65行、v0.3.1で追加、Issue #46）。`createPhaseInstance()` を提供。10フェーズすべてのインスタンス生成を担当。
- **`src/types/commands.ts`**: コマンド関連の型定義（約240行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry等の型を提供。コマンドハンドラの型安全性を確保。
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス（約476行、v0.3.1で40%削減、Issue #23・#47・#49でリファクタリング、v0.4.0でrollbackプロンプト注入追加、Issue #90、Issue #113でfallback機構追加）。ファサードパターンにより専門モジュールへ委譲。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入。フォールバック機構（`handleMissingOutputFile()`, `extractContentFromLog()`, `isValidOutputContent()`）により、成果物ファイル生成失敗時にログから自動抽出またはrevise呼び出しで復旧。
- **`src/phases/core/agent-executor.ts`**: エージェント実行ロジック（約270行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。
- **`src/phases/core/review-cycle-manager.ts`**: レビューサイクル管理（約130行、v0.3.1で追加、Issue #23）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。
- **`src/phases/lifecycle/step-executor.ts`**: ステップ実行ロジック（約233行、v0.3.1で追加、Issue #49）。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュを担当。
- **`src/phases/lifecycle/phase-runner.ts`**: フェーズライフサイクル管理（約244行、v0.3.1で追加、Issue #49）。フェーズ全体の実行、依存関係検証、エラーハンドリング、GitHub進捗投稿を担当。
- **`src/phases/context/context-builder.ts`**: コンテキスト構築（約223行、v0.3.1で追加、Issue #49）。オプショナルコンテキスト構築、ファイル参照生成（@filepath形式）、Planning Document参照を担当。
- **`src/phases/cleanup/artifact-cleaner.ts`**: クリーンアップロジック（約228行、v0.3.1で追加、Issue #49）。ワークフロークリーンアップ、パス検証（セキュリティ対策）、シンボリックリンクチェック、CI環境判定を担当。
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
- **`src/core/git/remote-manager.ts`**: リモート操作の専門マネージャー（約210行、Issue #25で追加）。push、pull、リトライロジック、GitHub認証設定を担当。
- **`src/core/github-client.ts`**: Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。
- **`src/core/github/issue-client.ts`**: Issue操作の専門クライアント（約385行、Issue #24で追加、Issue #104で拡張）。Issue取得、コメント投稿、クローズ、残タスクIssue作成、タイトル生成、キーワード抽出、詳細フォーマット機能を担当。
- **`src/core/github/pull-request-client.ts`**: PR操作の専門クライアント（約231行、Issue #24で追加）。PR作成、更新、検索、クローズ、PR番号取得を担当。
- **`src/core/github/comment-client.ts`**: コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。
- **`src/core/github/review-client.ts`**: レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。
- **`src/core/phase-dependencies.ts`**: 依存関係検証、プリセット定義（約249行、Issue #26で27.2%削減）
- **`src/core/helpers/dependency-messages.ts`**: 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）
- **`src/core/content-parser.ts`**: レビュー結果の解釈（OpenAI API を使用）
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
- `quick-fix`: Implementation + Documentation + Report（`--ignore-dependencies` と併用）
- `implementation`: Implementation + TestImplementation + Testing + Documentation + Report
- `testing`: TestImplementation + Testing
- `finalize`: Documentation + Report + Evaluation

### オプショナルコンテキスト構築

`BasePhase.buildOptionalContext()` により、フェーズは前段フェーズの成果物を柔軟に参照可能:
- ファイルが存在する場合: `@relative/path` 参照を返す
- ファイルが存在しない場合: フォールバックメッセージを返す
- 使用フェーズ: Implementation、TestImplementation、Testing、Documentation、Report

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
- `GITHUB_TOKEN`: GitHub パーソナルアクセストークン（repo、workflow、read:org スコープ）
- `GITHUB_REPOSITORY`: `owner/repo` 形式（メタデータからフォールバック）

### エージェント設定
- `CODEX_API_KEY` または `OPENAI_API_KEY`: Codex エージェント用
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude credentials.json へのパス（または `CLAUDE_CODE_OAUTH_TOKEN`）

### フォローアップIssue生成設定（v0.5.0、Issue #119で追加）
- `FOLLOWUP_LLM_MODE`: LLMプロバイダ（`auto` | `openai` | `claude` | `off`、デフォルト: `off`）
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
const apiKey = config.getCodexApiKey();  // CODEX_API_KEY || OPENAI_API_KEY

// CI環境判定
if (config.isCI()) {
  // CI環境での処理
}
```

**主な利点**:
- 型安全な環境変数アクセス（必須: `string`、オプション: `string | null`）
- フォールバックロジックの統一（`CODEX_API_KEY` → `OPENAI_API_KEY` 等）
- テスト容易性の向上（Config モックにより環境変数を簡単にモック可能）

## Jenkins 統合

ルートの Jenkinsfile が Docker コンテナ内でワークフローを実行:
- **エージェントモード**: `AGENT_MODE` パラメータで制御（auto/codex/claude）
- **実行モード**: `all_phases`、`preset`、`single_phase`
- **認証情報**: `claude-code-oauth-token`、`openai-api-key`、`github-token`（Jenkins シークレット）
- **マルチリポジトリ**: REPOS_ROOT を `/tmp/ai-workflow-repos-${BUILD_ID}` に設定し、対象リポジトリをクローン

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
