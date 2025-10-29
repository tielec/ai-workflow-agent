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
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `review()`: 出力を検証（オプション）
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `revise()`: 自動修正サイクル（最大 3 回まで）
     - **Git コミット & プッシュ** (v0.3.0で追加)

### コアモジュール

- **`src/main.ts`**: CLI 定義とコマンドルーティング（約118行、v0.3.0でリファクタリング）。コマンドルーターとしての役割のみに特化。
- **`src/commands/init.ts`**: Issue初期化コマンド処理（約306行）。ブランチ作成、メタデータ初期化、PR作成を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。
- **`src/commands/execute.ts`**: フェーズ実行コマンド処理（約634行）。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。
- **`src/commands/review.ts`**: フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。
- **`src/commands/list-presets.ts`**: プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。
- **`src/core/repository-utils.ts`**: リポジトリ関連ユーティリティ（約170行）。Issue URL解析、リポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。
- **`src/types/commands.ts`**: コマンド関連の型定義（約71行）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult等の型を提供。
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス（約698行、v0.3.1で52.4%削減、Issue #23、Issue #47でテンプレートメソッド追加）
- **`src/phases/core/agent-executor.ts`**: エージェント実行ロジック（約270行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。
- **`src/phases/core/review-cycle-manager.ts`**: レビューサイクル管理（約130行、v0.3.1で追加、Issue #23）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。
- **`src/phases/formatters/progress-formatter.ts`**: 進捗表示フォーマット（約150行、v0.3.1で追加、Issue #23）。GitHub Issue コメント用の進捗状況フォーマットを生成。
- **`src/phases/formatters/log-formatter.ts`**: ログフォーマット（約400行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの生ログを Markdown 形式に変換。
- **`src/core/codex-agent-client.ts`**: JSON イベントストリーミングを備えた Codex CLI ラッパー（約200行、Issue #26で25.4%削減）
- **`src/core/claude-agent-client.ts`**: Claude Agent SDK ラッパー（約206行、Issue #26で23.7%削減）
- **`src/core/helpers/agent-event-parser.ts`**: Codex/Claude共通のイベントパースロジック（74行、Issue #26で追加）
- **`src/core/helpers/log-formatter.ts`**: エージェントログのフォーマット処理（181行、Issue #26で追加）
- **`src/core/helpers/env-setup.ts`**: エージェント実行環境のセットアップ（47行、Issue #26で追加）
- **`src/core/metadata-manager.ts`**: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作（約239行、Issue #26で9.5%削減）
- **`src/core/helpers/metadata-io.ts`**: メタデータファイルI/O操作（98行、Issue #26で追加）
- **`src/core/helpers/validation.ts`**: 共通バリデーション処理（47行、Issue #26で追加）
- **`src/core/config.ts`**: 環境変数アクセス管理（約220行、Issue #51で追加）。型安全な環境変数アクセス、必須/オプション環境変数の検証、フォールバックロジックの統一を提供。`config.getGitHubToken()`, `config.getCodexApiKey()`, `config.isCI()` 等14個のメソッドをエクスポート。
- **`src/core/git-manager.ts`**: Git操作のファサードクラス（約181行、Issue #25で67%削減）。各専門マネージャーを統合し、後方互換性を維持。
- **`src/core/git/commit-manager.ts`**: コミット操作の専門マネージャー（約530行、Issue #25で追加）。コミット作成、メッセージ生成、SecretMasker統合を担当。
- **`src/core/git/branch-manager.ts`**: ブランチ操作の専門マネージャー（約110行、Issue #25で追加）。ブランチ作成、切り替え、存在チェックを担当。
- **`src/core/git/remote-manager.ts`**: リモート操作の専門マネージャー（約210行、Issue #25で追加）。push、pull、リトライロジック、GitHub認証設定を担当。
- **`src/core/github-client.ts`**: Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。
- **`src/core/github/issue-client.ts`**: Issue操作の専門クライアント（約238行、Issue #24で追加）。Issue取得、コメント投稿、クローズ、残タスクIssue作成を担当。
- **`src/core/github/pull-request-client.ts`**: PR操作の専門クライアント（約231行、Issue #24で追加）。PR作成、更新、検索、クローズ、PR番号取得を担当。
- **`src/core/github/comment-client.ts`**: コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。
- **`src/core/github/review-client.ts`**: レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。
- **`src/core/phase-dependencies.ts`**: 依存関係検証、プリセット定義（約249行、Issue #26で27.2%削減）
- **`src/core/helpers/dependency-messages.ts`**: 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）
- **`src/core/content-parser.ts`**: レビュー結果の解釈（OpenAI API を使用）
- **`src/utils/logger.ts`**: 統一ログモジュール（約150行、Issue #61で追加）。ログレベル制御、カラーリング、タイムスタンプ、環境変数制御を提供

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

### マルチリポジトリサポート
- `REPOS_ROOT`: リポジトリの親ディレクトリ（v0.2.0）

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
