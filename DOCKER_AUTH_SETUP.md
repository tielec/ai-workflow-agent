# Docker 認証セットアップ（TypeScript 版）

TypeScript CLI を Docker / Jenkins 上で実行する際に必要な認証情報の準備方法をまとめています。

## 必要なシークレット

| 用途 | 変数 / パス | 補足 |
|------|-------------|------|
| Codex API キー | `CODEX_API_KEY`（または `OPENAI_API_KEY`） | `gpt-5-codex` の高推論キー |
| Claude 認証情報 | `CLAUDE_CODE_CREDENTIALS_PATH`（JSON ファイル） | Claude Code CLI で取得した OAuth トークン |
| GitHub API | `GITHUB_TOKEN` | `repo`, `workflow`, `read:org` を付与した PAT |
| リポジトリ名 | `GITHUB_REPOSITORY` | `tielec/ai-workflow-agent` 形式 |

### Codex API キー

1. Codex（`gpt-5-codex`）のヘッドレス利用用 API キーを取得します。
2. Jenkins では Job DSL パラメータとして定義します（`password` 型でマスキング表示）。
3. 実行時に `OPENAI_API_KEY` 環境変数として設定されます。CLI 側で `CODEX_API_KEY` としても利用可能です。

### Claude 認証情報

1. 信頼できる端末で `claude login` を実行し、`~/.claude-code/credentials.json` を作成します。
2. ファイルを Base64 変換して Jenkins に登録します。PowerShell 例:
   ```powershell
   [convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.claude-code\credentials.json"))
   ```
3. Jenkins のシークレット（Secret Text）として保存し、パイプラインでデコードして `/home/node/.claude-code/credentials.json` に配置します。

### GitHub PAT

- `repo`, `workflow`, `read:org` スコープ付き PAT を発行。
- Jenkins では Job DSL パラメータとして定義します（`password` 型でマスキング表示）。

## Jenkins での環境変数例

Issue #184 で認証情報の取得方法を統一しました：

```groovy
environment {
    // Job DSLパラメータから環境変数に設定
    OPENAI_API_KEY = "${params.OPENAI_API_KEY}"
    GITHUB_TOKEN = "${params.GITHUB_TOKEN}"
    AWS_ACCESS_KEY_ID = "${params.AWS_ACCESS_KEY_ID ?: ''}"
    AWS_SECRET_ACCESS_KEY = "${params.AWS_SECRET_ACCESS_KEY ?: ''}"
    AWS_SESSION_TOKEN = "${params.AWS_SESSION_TOKEN ?: ''}"

    // Claude認証情報（Jenkins Credentialsで管理）
    CLAUDE_CODE_CREDENTIALS_PATH = "/home/node/.claude-code/credentials.json"
}
```

`AGENT_MODE` パラメータによって必要なシークレットは以下の通りです。

- `auto` … Codex キー必須。Claude の資格情報があれば併用。
- `codex` … Codex キーのみ必要。Claude のアップロードは省略。
- `claude` … Claude の資格情報が必須。Codex キーは不要。

## Docker 実行例

```bash
docker run --rm \
  -e CODEX_API_KEY="$CODEX_API_KEY" \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e GITHUB_REPOSITORY="$GITHUB_REPOSITORY" \
  -e CLAUDE_CODE_CREDENTIALS_PATH=/root/.claude-code/credentials.json \
  -v "$PWD:/workspace" \
  -v "$HOME/.claude-code:/root/.claude-code:ro" \
  ai-workflow-agent \
  node dist/index.js execute --issue 1 --phase all --agent auto
```

## Docker環境での多言語サポート（Issue #177）

Docker環境では、エージェントが必要に応じて多言語環境を自動インストールできます。

### ベースイメージ変更

Dockerfile のベースイメージが `node:20-slim` から `ubuntu:22.04` に変更されました：

- **Node.js 20.x**: NodeSource 公式リポジトリからインストール
- **ビルドツール**: `build-essential`（gcc、g++、make等）、`sudo`
- **環境変数**: `AGENT_CAN_INSTALL_PACKAGES=true`（Docker内部で自動設定）

### インストール可能な言語

エージェントは、以下の言語環境を必要に応じて自動インストールします：

- **Python**: `apt-get update && apt-get install -y python3 python3-pip`
- **Go**: `apt-get update && apt-get install -y golang-go`
- **Java**: `apt-get update && apt-get install -y default-jdk`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
- **Ruby**: `apt-get update && apt-get install -y ruby ruby-dev`

### セキュリティ

- **デフォルトで無効**: Docker外部（ローカル開発環境）では `AGENT_CAN_INSTALL_PACKAGES` がデフォルトで `false`
- **Docker内部のみ有効**: Dockerfile で明示的に `true` を設定
- **隔離環境**: Docker コンテナ内部での実行のため、ホストシステムへの影響なし

> **メモ:** コンテナ内に `auth.json` や平文の OAuth トークンを持ち込まないでください。TypeScript CLI は Codex CLI の旧形式ではなく API キーを前提としています。AWS SSM / GitHub Actions Secrets / Jenkins Credentials Store などを活用し、実行時に安全に注入してください。
