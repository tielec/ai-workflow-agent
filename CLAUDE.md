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

1. **CLI エントリー**（`src/main.ts`）: オプション解析、プリセット解決、依存関係検証
2. **Issue URL 解析**: GitHub URL から owner/repo/issue を抽出（`parseIssueUrl`）
3. **マルチリポジトリ解決**: `REPOS_ROOT` 環境変数を使用して対象リポジトリを特定
4. **メタデータ読み込み**: `.ai-workflow/issue-<NUM>/metadata.json` を読み込み、`target_repository` 情報を取得
5. **フェーズ実行**: `BasePhase.run()` による順次実行:
   - 依存関係検証
   - `execute()`: エージェントで成果物を生成
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `review()`: 出力を検証（オプション）
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `revise()`: 自動修正サイクル（最大 3 回まで）
     - **Git コミット & プッシュ** (v0.3.0で追加)

### コアモジュール

- **`src/main.ts`**: CLI 定義とコマンドルーティング（約118行、v0.3.0でリファクタリング）
- **`src/commands/init.ts`**: Issue初期化コマンド処理（ブランチ作成、メタデータ初期化、PR作成）
- **`src/commands/execute.ts`**: フェーズ実行コマンド処理（エージェント管理、プリセット解決、フェーズ順次実行）
- **`src/commands/review.ts`**: フェーズレビューコマンド処理（フェーズステータス表示）
- **`src/commands/list-presets.ts`**: プリセット一覧表示コマンド処理
- **`src/core/repository-utils.ts`**: リポジトリ関連ユーティリティ（Issue URL解析、リポジトリパス解決、メタデータ探索）
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス
- **`src/core/codex-agent-client.ts`**: JSON イベントストリーミングを備えた Codex CLI ラッパー
- **`src/core/claude-agent-client.ts`**: Claude Agent SDK ラッパー
- **`src/core/metadata-manager.ts`**: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作
- **`src/core/git-manager.ts`**: `simple-git` による Git 操作
- **`src/core/github-client.ts`**: Octokit による GitHub API（Issue、PR、コメント）
- **`src/core/phase-dependencies.ts`**: 依存関係検証、プリセット定義
- **`src/core/content-parser.ts`**: レビュー結果の解釈（OpenAI API を使用）
- **`src/types/commands.ts`**: コマンド関連の型定義（PhaseContext, ExecutionSummary, IssueInfo等）

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
- `parseIssueUrl(issueUrl)`: URL からリポジトリ情報を抽出（src/main.ts:880）
- `resolveLocalRepoPath(repoName)`: ローカルリポジトリパスを検索（src/main.ts:921）
- `findWorkflowMetadata(issueNumber)`: リポジトリ間でワークフローメタデータを検索（src/main.ts:960）

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

### Git 設定
- `GIT_COMMIT_USER_NAME`: Git コミット作成者名（デフォルト: git config から）
- `GIT_COMMIT_USER_EMAIL`: Git コミット作成者メール（デフォルト: git config から）

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
