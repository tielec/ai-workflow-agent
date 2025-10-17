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
2. Jenkins などのシークレットストアに保存（例: `codex-api-key`）。
3. 実行時に `CODEX_API_KEY` をエクスポートします。CLI 側で `OPENAI_API_KEY` にもコピーされます。

### Claude 認証情報

1. 信頼できる端末で `claude login` を実行し、`~/.claude-code/credentials.json` を作成します。
2. ファイルを Base64 変換して Jenkins に登録します。PowerShell 例:
   ```powershell
   [convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.claude-code\credentials.json"))
   ```
3. Jenkins のシークレット（Secret Text）として保存し、パイプラインでデコードして `/home/node/.claude-code/credentials.json` に配置します。

### GitHub PAT

- `repo`, `workflow`, `read:org` スコープ付き PAT を発行。
- Jenkins では `github-token` などの名前で Secret Text に登録します。

## Jenkins での環境変数例

```groovy
environment {
    OPENAI_API_KEY = credentials('codex-api-key')    // CODEX_API_KEY として再利用
    GITHUB_TOKEN   = credentials('github-token')
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

> **メモ:** コンテナ内に `auth.json` や平文の OAuth トークンを持ち込まないでください。TypeScript CLI は Codex CLI の旧形式ではなく API キーを前提としています。AWS SSM / GitHub Actions Secrets / Jenkins Credentials Store などを活用し、実行時に安全に注入してください。
