# AI Workflow Agent

TypeScript ベースの AI Workflow 自動化ツールキットです。Codex と Claude Code のデュアルエージェント機能により、GitHub / Jenkins 統合で 10 フェーズの Issue ワークフロー（planning 〜 evaluation）を実行します。

## 特長

- **Codex + Claude のデュアルエージェント** - Codex（gpt-5.2-codex）と Claude（Opus 4.5）の自動フォールバック
- **10フェーズワークフロー** - Planning → Requirements → Design → Test Scenario → Implementation → Test Implementation → Testing → Documentation → Report → Evaluation
- **永続化メタデータ** - `.ai-workflow/issue-*/metadata.json` でワークフロー状態を管理、途中再開とコスト集計が可能
- **マルチリポジトリ対応** - Issue URL から対象リポジトリを自動判定し、別のリポジトリに対してもワークフローを実行（v0.2.0）
- **自動PR作成** - Issue タイトルを PR タイトルとして使用、リアルタイム進捗表示（Issue #325）
- **Jenkins統合** - Docker コンテナ内で TypeScript CLI を実行、実行モード別Jenkinsfileをサポート
- **多言語対応** - 日本語/英語でワークフローを実行可能（Issue #526）
- **Agent Teams 対応** - Claude Code の Agent Teams による並列開発をサポート（詳細は [AGENT_TEAMS.md](./AGENT_TEAMS.md) 参照）
- **Codex 可用性チェック + Claude/Regex フォールバック** - ARM64 などで Codex CLI が利用できない場合でも事前検知して Claude に切り替え、ContentParser は Claude/Regex でレビュー解析を継続します
- **Testing フェーズの環境事前チェック** - Python などのランタイム不足を検出し、プロンプトにセットアップ手順や警告を注入して `AGENT_CAN_INSTALL_PACKAGES` の設定に応じた対応を促します

## リポジトリ構成

```
ai-workflow-agent/
├── src/
│   ├── core/         # エージェント・Git/GitHub ヘルパー・メタデータ管理
│   ├── phases/       # 各フェーズ実装（planning 〜 evaluation）
│   ├── prompts/      # フェーズ/コマンド別・言語別プロンプト（{phase|category}/{lang}/*.txt）
│   ├── templates/    # PR ボディなどのテンプレート（{lang}/pr_body*.md）
│   └── main.ts       # CLI 定義
├── tests/
│   ├── unit/         # ユニットテスト
│   └── integration/  # 統合テスト
├── docs/             # ドキュメント（詳細は下記参照）
├── .ai-workflow/     # ワークフロー成果物（サンプル含む）
│   ├── issue-7/      # サンプル: シンプルな成功例
│   ├── issue-10/     # サンプル: 標準的な完了例
│   └── issue-105/    # サンプル: ロールバック対応例
└── dist/             # ビルド成果物（npm run build 後に生成）
```

### サンプルワークフロー

`.ai-workflow/` ディレクトリには、リファレンス用に完了済みワークフローのサンプルを保持しています：

- **issue-7**: シンプルな成功例（ロールバックなし、$10.51）— 基本的なワークフロー構成の理解に最適
- **issue-10**: 標準的な完了例（コスト追跡あり、$24.92）— フェーズ管理とコスト追跡の参考
- **issue-105**: ロールバック対応例（testing→implementation、$13.15）— 失敗からの復旧フローを示す

各サンプルディレクトリには README.md が含まれており、10 フェーズの構成と各成果物の詳細が記載されています。

## 前提条件

- **Node.js**: 20 以上
- **npm**: 10 以上
- **GitHub Token**: パーソナルアクセストークン（`repo` スコープ）
- **エージェント認証**（どちらか一方）:
  - Codex: `CODEX_API_KEY` または `~/.codex/auth.json`
  - Claude: `CLAUDE_CODE_OAUTH_TOKEN` または `CLAUDE_CODE_API_KEY`
- **Docker**: 24 以上（コンテナ内で実行する場合）

Testing フェーズでは `checkTestEnvironment` による事前チェックが実行され、主要ランタイム（例: Python 3.11）が不足するとプロンプトにセットアップ手順や警告が追加されます。`AGENT_CAN_INSTALL_PACKAGES=true` なら自動インストール手順を含めて案内し、`false` の場合は警告中心に出力します。Codex CLI の可用性は `AgentExecutor` によって事前に確認され、`CODEX_CLI_NOT_FOUND` 相当と判定された場合は Claude に切り替えるため、ARM64 環境でもフェーズ中断を回避しやすくなっています。

 詳細な環境変数設定は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) を参照してください。

## クイックスタート

### 1. インストール

```bash
# リポジトリのクローン
git clone https://github.com/tielec/ai-workflow-agent.git
cd ai-workflow-agent

# 依存関係のインストールとビルド
npm install
npm run build
```

### 2. 環境変数の設定

```bash
# 必須
export GITHUB_TOKEN="ghp_..."
export GITHUB_REPOSITORY="tielec/ai-workflow-agent"

# エージェント認証（どちらか一方）
export CODEX_API_KEY="sk-code..."
# または
export CLAUDE_CODE_OAUTH_TOKEN="sess..."

# オプション
export REPOS_ROOT="$HOME/projects"
export LOG_LEVEL="info"
```

詳細な環境変数リストは [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) を参照してください。

### 3. ワークフローの実行

```bash
# Issue に対してワークフローを初期化
node dist/index.js init --issue-url https://github.com/owner/repo/issues/123

# 全フェーズを実行
node dist/index.js execute --issue 123 --phase all

# 特定のフェーズのみ実行
node dist/index.js execute --issue 123 --phase implementation

# 英語でワークフローを実行
node dist/index.js execute --issue 123 --phase all --language en
```

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| `init` | GitHub Issue からワークフローを初期化（メタデータ、ブランチ、ドラフトPRを作成） |
| `execute` | フェーズを実行（planning 〜 evaluation の 10 フェーズ） |
| `rollback` | 前のフェーズに差し戻し（手動/自動） |
| `cleanup` | ワークフローログをクリーンアップ |
| `finalize` | ワークフロー完了後の最終処理（コミットスカッシュ、PR更新） |
| `auto-issue` | 自動バグ・リファクタリング・機能拡張Issue生成 |
| `auto-close-issue` | 条件を満たすIssueを安全にクローズ |
| `rewrite-issue` | リポジトリ文脈を参照してIssue本文を再設計 |
| `split-issue` | 複雑なIssueを機能単位で複数の子Issueに分割 |
| `create-sub-issue` | 親Issueに紐づくサブIssueをAIエージェントで自動生成・起票 |
| `pr-comment` | PRコメント自動対応（init / analyze / execute / finalize） |
| `resolve-conflict` | PRのマージコンフリクトをAIで分析・解消（init / analyze / execute / finalize） |
| `validate-credentials` | 認証情報とAPIの疎通確認 |

詳細な CLI リファレンスは [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) を参照してください。
resolve-conflict の使い方は [docs/CONFLICT_RESOLUTION.md](./docs/CONFLICT_RESOLUTION.md) も参照してください。

## 主要オプション

### init コマンド

```bash
node dist/index.js init \
  --issue-url <URL> \
  [--branch <name>] \
  [--base-branch <branch>] \
  [--auto-model-selection] \
  [--language <ja|en>]
```

### execute コマンド

```bash
node dist/index.js execute \
  --issue <number> \
  [--phase <name>|--phase all] \
  [--agent auto|codex|claude] \
  [--preset <name>] \
  [--skip-phases <phases>] \
  [--language <ja|en>]
```

**利用可能なプリセット**:
- `review-requirements`: Planning + Requirements
- `review-design`: Planning + Requirements + Design
- `implementation`: Planning + Implementation + TestImplementation + Testing + Documentation + Report
- `finalize`: Planning + Documentation + Report + Evaluation

完全なコマンドリファレンスは [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) を参照してください。

## 10フェーズワークフロー

| フェーズ | 説明 | 成果物 |
|---------|------|--------|
| 0. Planning | 実装戦略、テスト戦略、タスク分割を策定 | `planning.md` |
| 1. Requirements | 機能要件、非機能要件を明確化 | `requirements.md` |
| 2. Design | アーキテクチャ設計、データモデル設計 | `design.md` |
| 3. Test Scenario | テストシナリオ、受入基準を定義 | `test-scenario.md` |
| 4. Implementation | コード実装（AIエージェントが自動実装） | 変更ファイル一覧 |
| 5. Test Implementation | テストコード実装 | テストファイル一覧 |
| 6. Testing | テスト実行、バグ修正 | テスト結果 |
| 7. Documentation | ドキュメント更新（README、CHANGELOG等） | 更新サマリー |
| 8. Report | エグゼクティブサマリー、マージチェックリスト | `report.md` |
| 9. Evaluation | ワークフロー評価、フォローアップIssue生成 | `evaluation.md` |

各フェーズの詳細は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。

## マルチリポジトリ対応

Issue URL から対象リポジトリを自動判定し、別のリポジトリに対してもワークフローを実行できます（v0.2.0）。

```bash
# ai-workflow-agent 以外のリポジトリに対してワークフローを実行
node dist/index.js init \
  --issue-url https://github.com/owner/my-app/issues/123

# REPOS_ROOT 環境変数で親ディレクトリを指定（Jenkins環境では必須）
export REPOS_ROOT="$HOME/projects"
```

詳細は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#マルチリポジトリサポート) を参照してください。

## Jenkins統合

実行モード別に分割されたJenkinsfileがDocker コンテナ内でワークフローを実行します（v0.4.0、Issue #211）。

**実行モード専用Jenkinsfile**:
- `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` - 全フェーズ実行（Phase 0-9）
- `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` - プリセットワークフロー実行（推奨モード、事前定義済みのパラメータセット）
- `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` - 単一フェーズ実行（対象フェーズを限定して手動再実行）
- `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` - フェーズ差し戻し実行（途中フェーズからロールバック）
- `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` - 自動Issue生成（エラー検出時のIssue化）
- `jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile` - Issue本文再設計実行（リポジトリ文脈を参照した既存Issue改善）
- `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` - ワークフロー完了処理（成果物の集約と通知）
- `jenkins/jobs/pipeline/ai-workflow/validate-credentials/Jenkinsfile` - 認証情報検証（必要な資格情報の事前チェック）
- `jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile` - Issue自動クローズ（完了済みIssueの片付け）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` - PRコメント自動対応（コメント内容で実行）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` - PRコメント自動対応（最終結果・クローズ処理）
- `jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile` - ECRイメージビルド・プッシュ（1日1回の定期実行、古いイメージの自動削除）

**旧Jenkinsfile（非推奨）**:
- `Jenkinsfile` - 汎用Jenkinsfile（Issue #211により非推奨、2025年3月以降削除予定。既存の手動実行環境からは実行モード専用ファイルへの移行を推奨）

詳細は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#jenkins統合) を参照してください。

## 開発者向け情報

### ビルドとテスト

```bash
# TypeScript ソースのビルド
npm run build

# ウォッチモードで開発
npm run dev

# テスト実行
npm test                    # すべてのテスト
npm run test:unit          # ユニットテストのみ
npm run test:integration   # 統合テストのみ
npm run test:coverage      # カバレッジレポート付き
```

詳細な開発環境セットアップは [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) を参照してください。

### コーディング規約

Claude Code で開発する際は、以下の規約を厳守してください：

1. **ロギング規約**: `console.log`等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用
2. **環境変数アクセス**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）を使用
3. **エラーハンドリング**: `as Error` 型アサーションは禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）を使用

詳細は [CLAUDE.md](./CLAUDE.md) を参照してください。

## ドキュメント索引

### ユーザー向けドキュメント

| ドキュメント | 説明 |
|-------------|------|
| [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) | CLIコマンドの詳細、オプション、使用例 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | アーキテクチャ詳細、モジュール構成、データフロー |
| [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) | 環境変数一覧、認証設定、Jenkins統合 |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 開発環境セットアップ、ビルド方法、テスト実行 |

### 開発者向けドキュメント

| ドキュメント | 説明 |
|-------------|------|
| [CLAUDE.md](./CLAUDE.md) | Claude Code 向けガイダンス、コーディング規約、制約事項 |
| [AGENT_TEAMS.md](./AGENT_TEAMS.md) | Agent Teams 実践ガイド、具体的なタスク例、トラブルシューティング |
| DOCKER_AUTH_SETUP.md | Codex/Claude 認証のセットアップ |
| SETUP_TYPESCRIPT.md | ローカル開発環境のセットアップ手順 |
| TROUBLESHOOTING.md | よくある問題と解決方法 |
| ROADMAP.md | 今後の機能計画 |

### Quick Links

| タスク | ドキュメント |
|-------|-------------|
| Agent Teams を使う | [AGENT_TEAMS.md](./AGENT_TEAMS.md) |
| CLI コマンドを調べる | [docs/CLI_REFERENCE.md](./docs/CLI_REFERENCE.md) |
| 環境変数を設定する | [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) |
| 開発環境をセットアップする | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) |
| アーキテクチャを理解する | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| テストを書く | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md#テスト) |
| Jenkins で実行する | [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#jenkins統合) |
| トラブルシューティング | TROUBLESHOOTING.md |

## よくある質問

### Q: ワークフローが途中で失敗しました。どうすればいいですか？

A: `execute --phase all` コマンドで再実行してください。最後の失敗したフェーズから自動的に再開されます。

```bash
node dist/index.js execute --issue 123 --phase all
```

### Q: 特定のフェーズをスキップしたいです。

A: `--skip-phases` オプションを使用してください（v0.5.1、Issue #636）。

```bash
# Test Scenario と Testing フェーズをスキップ
node dist/index.js execute --issue 123 --phase all \
  --skip-phases test_scenario,testing
```

### Q: エージェント認証エラーが発生します。

A: 認証情報を確認してください。

```bash
# 認証情報を検証
node dist/index.js validate-credentials --check all

# 環境変数を再設定
export CODEX_API_KEY="sk-code-..."
export CLAUDE_CODE_OAUTH_TOKEN="sess_..."
```

詳細は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#トラブルシューティング) を参照してください。

### Q: 複数のリポジトリでワークフローを実行したいです。

A: `REPOS_ROOT` 環境変数を設定し、Issue URL を指定してください。

```bash
export REPOS_ROOT="$HOME/projects"
node dist/index.js init --issue-url https://github.com/owner/repo-a/issues/1
node dist/index.js init --issue-url https://github.com/owner/repo-b/issues/2
```

詳細は [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#マルチリポジトリサポート) を参照してください。

## ライセンス

MIT License

## コントリビューション

プルリクエストを歓迎します。大きな変更の場合は、まずIssueを開いて変更内容を議論してください。

詳細は [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md#コントリビューション) を参照してください。

## サポート

- **Issues**: [GitHub Issues](https://github.com/tielec/ai-workflow-agent/issues)
- **ドキュメント**: [docs/](./docs/)
- **トラブルシューティング**: TROUBLESHOOTING.md
