# 環境変数と認証設定

このドキュメントでは、AI Workflow Agent で使用する環境変数、認証情報の設定方法、Jenkins統合について説明します。

## 目次

- [必須環境変数](#必須環境変数)
- [エージェント認証](#エージェント認証)
- [オプション環境変数](#オプション環境変数)
- [環境変数の設定方法](#環境変数の設定方法)
- [Jenkins統合](#jenkins統合)
- [Docker環境](#docker環境)
- [トラブルシューティング](#トラブルシューティング)

## 必須環境変数

### GitHub認証

| 環境変数 | 説明 | 例 |
|---------|------|---|
| `GITHUB_TOKEN` | GitHub パーソナルアクセストークン（`repo` スコープ必須） | `ghp_xxxxxxxxxxxxx` |
| `GITHUB_REPOSITORY` | 対象リポジトリ（`owner/repo` 形式） | `tielec/ai-workflow-agent` |

**GitHubトークンの作成方法**:

1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" をクリック
3. スコープで `repo` を選択（プライベートリポジトリの場合）
4. または `public_repo`（パブリックリポジトリのみの場合）
5. GitHub Actions ワークフロー編集が必要な場合は `workflow` も追加
6. トークンを生成してコピー

## エージェント認証

エージェント認証は用途別に分離されています（Issue #188で整理）。

### OpenAI 系

| 環境変数 | 用途 | 備考 |
|---------|------|------|
| `CODEX_API_KEY` | Codex エージェント専用 | フェーズ実行（execute/review/revise）に使用 |
| `OPENAI_API_KEY` | OpenAI API 専用 | テキスト生成（Follow-up Issue 生成、レビュー解析等）に使用 |

**Codex 認証の設定方法**:

1. **環境変数を使用**（推奨）:
   ```bash
   export CODEX_API_KEY="sk-code-xxxxxxxxxxxxx"
   ```

2. **認証ファイルを使用**:
   ```bash
   # ~/.codex/auth.json を作成
   mkdir -p ~/.codex
   echo '{"api_key": "sk-code-xxxxxxxxxxxxx"}' > ~/.codex/auth.json
   ```

### Claude 系

| 環境変数 | 用途 | 優先順位 |
|---------|------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code エージェント | **優先** |
| `CLAUDE_CODE_API_KEY` | Claude Code エージェント | フォールバック（OAuth トークンがない場合） |
| `CLAUDE_MODEL` | Claude モデル指定（Issue #301） | エイリアス（opus/sonnet/haiku）またはフルモデルID。デフォルト: `opus` |
| `ANTHROPIC_API_KEY` | Anthropic API 呼び出し | テキスト生成（Follow-up Issue 生成等）に使用 |
| `CLAUDE_CODE_CREDENTIALS_PATH` | credentials.json パス | **非推奨**、レガシーサポート |

**Claude 認証の設定方法**:

1. **OAuth トークンを使用**（推奨）:
   ```bash
   export CLAUDE_CODE_OAUTH_TOKEN="sess_xxxxxxxxxxxxx"
   ```

2. **API キーを使用**:
   ```bash
   export CLAUDE_CODE_API_KEY="sk-ant-xxxxxxxxxxxxx"
   ```

3. **モデル指定**（オプション）:
   ```bash
   # エイリアスを使用
   export CLAUDE_MODEL="sonnet"  # opus, sonnet, haiku

   # フルモデルIDを使用
   export CLAUDE_MODEL="claude-sonnet-4-5"
   ```

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `opus` | `claude-opus-4-6` | **デフォルト**。最高性能、複雑なタスク向け |
| `sonnet` | `claude-sonnet-4-5` | バランス型、コスト効率良好 |
| `haiku` | `claude-haiku-4-5` | 高速・低コスト、シンプルなタスク向け |

### Codex モデル指定（Issue #302）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `CODEX_MODEL` | Codex モデル指定 | `max` (gpt-5.2-codex) |

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `max` | `gpt-5.2-codex` | **デフォルト**。長時間エージェントタスク向けに最適化 |
| `mini` | `gpt-5.1-codex-mini` | 軽量・経済的 |
| `5.1` | `gpt-5.1` | 汎用モデル |
| `legacy` | `gpt-5-codex` | レガシー（後方互換性） |

**使用例**:
```bash
# 環境変数でデフォルト動作を設定
export CODEX_MODEL=mini
node dist/index.js execute --issue 123 --phase all

# CLI オプションで上書き
node dist/index.js execute --issue 123 --phase all --codex-model max
```

## オプション環境変数

### マルチリポジトリサポート

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `REPOS_ROOT` | リポジトリの親ディレクトリ | なし |

- Jenkins環境では必須（Issue #153で明確化）
- `auto-issue` コマンド実行時、対象リポジトリの自動解決に使用
- 未設定時はフォールバック候補パス（`~/TIELEC/development`, `~/projects`, `../`）を探索

**設定例**:
```bash
export REPOS_ROOT="$HOME/projects"
```

### ロギング設定（Issue #61で追加）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `LOG_LEVEL` | ログレベル制御 | `info` |
| `LOG_NO_COLOR` | カラーリング無効化（CI環境用） | `false` |

**ログレベル**:
- `debug`: デバッグ情報を含むすべてのログ
- `info`: 情報メッセージ以上
- `warn`: 警告メッセージ以上
- `error`: エラーメッセージのみ

**設定例**:
```bash
# 開発時は debug 推奨
export LOG_LEVEL="debug"

# CI環境ではカラーリングを無効化
export LOG_NO_COLOR="true"
```

### ワークフロー言語設定（Issue #526で追加）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `AI_WORKFLOW_LANGUAGE` | ワークフロー出力言語 | `ja` |

**優先順位**:
1. CLI オプション `--language <ja|en>` が最優先
2. 環境変数 `AI_WORKFLOW_LANGUAGE`
3. メタデータ（`metadata.json` の `language` フィールド）
4. デフォルト値 `ja`（日本語）

**設定例**:
```bash
# 環境変数で設定
export AI_WORKFLOW_LANGUAGE="en"

# CLI オプションで上書き
node dist/index.js execute --issue 123 --phase all --language ja
```

### コミットスカッシュ設定（Issue #194で追加）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `AI_WORKFLOW_SQUASH_ON_COMPLETE` | スカッシュ機能のデフォルト動作 | `false` |

**設定例**:
```bash
# 環境変数でデフォルト動作を設定
export AI_WORKFLOW_SQUASH_ON_COMPLETE="true"

# CLI オプションで上書き
node dist/index.js execute --issue 123 --phase all --no-squash-on-complete
```

### フォローアップIssue生成設定（v0.5.0、Issue #119で追加）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `FOLLOWUP_LLM_MODE` | LLMプロバイダ | `off` |
| `FOLLOWUP_LLM_MODEL` | 使用モデル | なし |

**LLMプロバイダ**:
- `auto`: 自動選択
- `openai`: OpenAI API使用
- `claude`: Anthropic API使用
- `agent`: エージェントAPI使用
- `off`: LLM生成を無効化（既存テンプレート使用）

**設定例**:
```bash
# OpenAI を使用
export FOLLOWUP_LLM_MODE="openai"
export FOLLOWUP_LLM_MODEL="gpt-4o-mini"
export OPENAI_API_KEY="sk-..."

# Claude を使用
export FOLLOWUP_LLM_MODE="claude"
export FOLLOWUP_LLM_MODEL="claude-sonnet-4-5"
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Docker環境設定（Issue #177で追加）

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `AGENT_CAN_INSTALL_PACKAGES` | エージェントがパッケージをインストール可能かどうか | `false` |

- Docker環境では Dockerfile で明示的に `true` を設定
- エージェントが必要に応じて多言語環境（Python、Go、Java、Rust、Ruby）をインストール可能
- **セキュリティ**: デフォルトは無効、Docker内部のみで有効化を推奨

**設定例**:
```bash
# Docker 内部でのみ有効化
export AGENT_CAN_INSTALL_PACKAGES="true"
```

### Git 設定

| 環境変数 | 説明 | デフォルト |
|---------|------|----------|
| `GIT_COMMIT_USER_NAME` | Git コミット作成者名 | git config から取得 |
| `GIT_COMMIT_USER_EMAIL` | Git コミット作成者メール | git config から取得 |

**設定例**:
```bash
export GIT_COMMIT_USER_NAME="AI Workflow Bot"
export GIT_COMMIT_USER_EMAIL="ai-workflow@example.com"
```

## 環境変数の設定方法

### ローカル開発

**.bashrc / .zshrc に追加**:

```bash
# ~/.bashrc または ~/.zshrc
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxx"
export GITHUB_REPOSITORY="tielec/ai-workflow-agent"
export CODEX_API_KEY="sk-code-xxxxxxxxxxxxx"
export CLAUDE_CODE_OAUTH_TOKEN="sess_xxxxxxxxxxxxx"
export LOG_LEVEL="debug"
export REPOS_ROOT="$HOME/projects"
```

**.env ファイルを使用**（dotenv）:

```bash
# .env ファイル（リポジトリには含めない！.gitignore に追加）
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_REPOSITORY=tielec/ai-workflow-agent
CODEX_API_KEY=sk-code-xxxxxxxxxxxxx
CLAUDE_CODE_OAUTH_TOKEN=sess_xxxxxxxxxxxxx
LOG_LEVEL=debug
REPOS_ROOT=/home/user/projects
```

**注意**: `.env` ファイルは `.gitignore` に追加して、リポジトリにコミットしないでください。

### CI/CD環境（GitHub Actions）

`.github/workflows/ci.yml`:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
  CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
  LOG_NO_COLOR: "true"
  LOG_LEVEL: "info"
```

## Jenkins統合

### 実行モード別Jenkinsfile（v0.4.0、Issue #211で追加）

実行モード別に分割されたJenkinsfileがDocker コンテナ内でワークフローを実行します。

**実行モード専用Jenkinsfile**:

| Jenkinsfile | 説明 |
|------------|------|
| `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` | 全フェーズ実行（Phase 0-9） |
| `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` | プリセットワークフロー実行（推奨モード） |
| `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` | 単一フェーズ実行 |
| `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` | フェーズ差し戻し実行 |
| `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` | 自動Issue生成 |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | ワークフロー完了処理 |
| `jenkins/jobs/pipeline/ai-workflow/validate-credentials/Jenkinsfile` | 認証情報検証 |
| `jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile` | Issue自動クローズ |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` | PRコメント自動対応（実行） |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` | PRコメント自動対応（最終化） |

**共通処理モジュール**:
- `jenkins/shared/common.groovy` … 認証情報準備、環境セットアップ、Node.js環境、成果物アーカイブ

**旧Jenkinsfile（非推奨）**:
- `Jenkinsfile` - 汎用Jenkinsfile（Issue #211により非推奨、2025年3月以降削除予定）

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

### All Phases ジョブのパラメータ

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

**SKIP_PHASES の使用例**:

```
# Phase 3 (Test Scenario) と Phase 6 (Testing) をスキップ
SKIP_PHASES: test_scenario,testing

# Phase 7 (Documentation) と Phase 8 (Report) をスキップ
SKIP_PHASES: documentation,report
```

> **注意**: `planning` フェーズは依存関係のためスキップ不可。CLI 側でエラーになります。

### Jenkins Credentials 設定

Jenkins で以下の認証情報を設定してください：

1. **GitHub Token** (`github-token`):
   - 種類: Secret text
   - 値: `ghp_xxxxxxxxxxxxx`

2. **Codex API Key** (`codex-api-key`):
   - 種類: Secret text
   - 値: `sk-code-xxxxxxxxxxxxx`

3. **Claude Code OAuth Token** (`claude-code-oauth-token`):
   - 種類: Secret text
   - 値: `sess_xxxxxxxxxxxxx`

4. **AWS Credentials** (`aws-credentials`):
   - 種類: AWS Credentials
   - Access Key ID と Secret Access Key を設定

## Docker環境

### Dockerfile での環境変数設定

`Dockerfile`:

```dockerfile
FROM node:20-alpine

# 環境変数を設定
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    LOG_NO_COLOR=true \
    AGENT_CAN_INSTALL_PACKAGES=true

# アプリケーションをコピー
COPY . /app
WORKDIR /app

# 依存関係をインストール
RUN npm ci --only=production

# ビルド
RUN npm run build

# エントリーポイント
ENTRYPOINT ["node", "dist/index.js"]
```

### Docker Compose での環境変数設定

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  ai-workflow:
    build: .
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
      - CODEX_API_KEY=${CODEX_API_KEY}
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
      - LOG_LEVEL=debug
      - REPOS_ROOT=/workspace
    volumes:
      - ./workspace:/workspace
    command: execute --issue 123 --phase all
```

## トラブルシューティング

### エージェント認証エラー

**エラー**: "Codex authentication failed" または "Claude authentication failed"

**原因**: 環境変数が正しく設定されていない

**解決策**:

1. 環境変数を確認:
   ```bash
   echo $CODEX_API_KEY
   echo $CLAUDE_CODE_OAUTH_TOKEN
   ```

2. 環境変数を再設定:
   ```bash
   export CODEX_API_KEY="sk-code-xxxxxxxxxxxxx"
   export CLAUDE_CODE_OAUTH_TOKEN="sess_xxxxxxxxxxxxx"
   ```

3. 認証情報を検証:
   ```bash
   node dist/index.js validate-credentials --check all
   ```

### GitHub認証エラー

**エラー**: "Bad credentials" または "Resource not accessible by integration"

**原因**: GitHubトークンのスコープが不足している

**解決策**:

1. GitHubトークンのスコープを確認
   - `repo` スコープが必要
   - GitHub Actions ワークフロー編集には `workflow` スコープも必要

2. 新しいトークンを生成して設定:
   ```bash
   export GITHUB_TOKEN="ghp_xxxxxxxxxxxxx"
   ```

### マルチリポジトリ解決失敗

**エラー**: "Repository not found" または "Workflow not found"

**原因**: `REPOS_ROOT` が設定されていない、またはリポジトリパスが正しくない

**解決策**:

1. `REPOS_ROOT` を設定:
   ```bash
   export REPOS_ROOT="$HOME/projects"
   ```

2. リポジトリパスを確認:
   ```bash
   ls $REPOS_ROOT/ai-workflow-agent
   ```

3. フォールバック候補パスを確認:
   ```bash
   ls ~/TIELEC/development/ai-workflow-agent
   ls ~/projects/ai-workflow-agent
   ls ../ai-workflow-agent
   ```

### 環境変数が反映されない

**原因**: シェル設定ファイルが読み込まれていない

**解決策**:

1. シェル設定ファイルを再読み込み:
   ```bash
   source ~/.bashrc
   # または
   source ~/.zshrc
   ```

2. 新しいターミナルセッションを開始

## 参考リンク

- [README.md](../README.md) - プロジェクト概要
- [docs/CLI_REFERENCE.md](./CLI_REFERENCE.md) - CLI使用方法
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) - アーキテクチャ詳細
- [docs/DEVELOPMENT.md](./DEVELOPMENT.md) - 開発者ガイド
