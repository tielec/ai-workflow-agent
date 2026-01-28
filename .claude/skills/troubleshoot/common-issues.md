# よくある問題と解決策

このドキュメントは AI ワークフローでよく発生する問題と解決策をまとめたものです。

## 目次

1. [認証関連の問題](#認証関連の問題)
2. [メタデータ関連の問題](#メタデータ関連の問題)
3. [Git 関連の問題](#git-関連の問題)
4. [フェーズ依存関係の問題](#フェーズ依存関係の問題)
5. [エージェント実行の問題](#エージェント実行の問題)
6. [環境変数の問題](#環境変数の問題)
7. [マルチリポジトリの問題](#マルチリポジトリの問題)

---

## 認証関連の問題

### GitHub 認証エラー

**エラーメッセージ**:
```
Error: GitHub API error: 401 Unauthorized
Error: Bad credentials
```

**原因**:
- `GITHUB_TOKEN` が設定されていない
- トークンが無効または期限切れ
- トークンのスコープが不足（`repo` スコープが必要）

**解決策**:
```bash
# 1. GitHub トークンを生成
# https://github.com/settings/tokens/new にアクセス
# スコープ: repo (すべて)

# 2. トークンを環境変数に設定
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 3. トークンを検証
node dist/index.js validate-credentials --check github
```

---

### Codex 認証エラー

**エラーメッセージ**:
```
Error: Codex API error: 401 Unauthorized
Error: No API key provided
```

**原因**:
- `CODEX_API_KEY` または `OPENAI_API_KEY` が設定されていない
- APIキーが無効
- ~/.codex/auth.json が存在しない

**解決策**:
```bash
# 方法 1: CODEX_API_KEY を設定
export CODEX_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 方法 2: OPENAI_API_KEY を設定（フォールバック）
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 方法 3: Codex CLI でログイン
codex login

# 認証を検証
node dist/index.js validate-credentials --check codex
```

---

### Claude 認証エラー

**エラーメッセージ**:
```
Error: Claude API error: 401 Unauthorized
Error: Invalid OAuth token
```

**原因**:
- `CLAUDE_CODE_OAUTH_TOKEN` または `CLAUDE_CODE_API_KEY` が設定されていない
- トークンが無効または期限切れ

**解決策**:
```bash
# 方法 1: OAuth トークンを設定（推奨）
export CLAUDE_CODE_OAUTH_TOKEN="sess_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 方法 2: API キーを設定（フォールバック）
export CLAUDE_CODE_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 認証を検証
node dist/index.js validate-credentials --check claude
```

---

## メタデータ関連の問題

### メタデータが見つからない

**エラーメッセージ**:
```
Error: Workflow not found for Issue #658
Error: Metadata file does not exist
```

**原因**:
- ワークフローが初期化されていない
- `.ai-workflow/issue-{NUM}/` ディレクトリが存在しない

**解決策**:
```bash
# ワークフローを初期化
/init-workflow https://github.com/owner/repo/issues/658

# または CLI で
node dist/index.js init --issue-url https://github.com/owner/repo/issues/658
```

---

### メタデータが破損している

**エラーメッセージ**:
```
Error: Failed to parse metadata.json
SyntaxError: Unexpected token } in JSON
```

**原因**:
- `metadata.json` が破損している
- JSON形式が不正

**解決策**:
```bash
# 1. バックアップを確認
ls .ai-workflow/issue-658/

# 2. 手動で修正（エディタで開いて構文エラーを修正）
code .ai-workflow/issue-658/metadata.json

# 3. または再初期化（注意: データが失われる）
rm -rf .ai-workflow/issue-658/
/init-workflow 658
```

---

## Git 関連の問題

### 作業ツリーが汚れている

**エラーメッセージ**:
```
Error: Git working tree is dirty
Error: You have uncommitted changes
```

**原因**:
- 未コミットの変更がある
- ステージングエリアにファイルがある

**解決策**:
```bash
# 方法 1: 変更をコミット
git add .
git commit -m "Work in progress"

# 方法 2: 変更をstash
git stash

# 方法 3: 変更を破棄（注意: 変更が失われる）
git reset --hard HEAD
```

---

### プッシュ失敗

**エラーメッセージ**:
```
Error: Failed to push to remote
error: failed to push some refs
```

**原因**:
- リモートブランチとの競合
- ネットワークエラー
- 認証エラー

**解決策**:
```bash
# 1. リモートの変更を取得
git fetch origin

# 2. リベースして再プッシュ
git rebase origin/ai-workflow/issue-658
git push

# 3. または強制プッシュ（注意: 他の変更が上書きされる）
git push --force-with-lease
```

---

### ブランチが存在しない

**エラーメッセージ**:
```
Error: Branch 'ai-workflow/issue-658' does not exist
```

**原因**:
- ブランチが作成されていない
- ブランチ名が間違っている

**解決策**:
```bash
# 1. ブランチを作成
git checkout -b ai-workflow/issue-658

# 2. またはリモートからチェックアウト
git checkout -b ai-workflow/issue-658 origin/ai-workflow/issue-658

# 3. ワークフローを再初期化
/init-workflow 658
```

---

## フェーズ依存関係の問題

### 前提フェーズが未完了

**エラーメッセージ**:
```
Error: Phase requirements requires planning to be completed
Error: Dependency check failed
```

**原因**:
- 前提フェーズが完了していない
- フェーズ実行順序が正しくない

**解決策**:
```bash
# 方法 1: 前提フェーズを実行
/execute-phase 658 --phase planning

# 方法 2: 依存関係を無視（非推奨）
/execute-phase 658 --phase requirements --ignore-dependencies

# 方法 3: プリセットを使用（推奨）
/execute-phase 658 --preset review-requirements
```

---

### 循環依存関係

**エラーメッセージ**:
```
Error: Circular dependency detected
```

**原因**:
- フェーズ依存関係が循環している（バグの可能性）

**解決策**:
```bash
# 1. メタデータを確認
cat .ai-workflow/issue-658/metadata.json

# 2. フェーズステータスをリセット
node dist/index.js execute --issue 658 --phase planning --force-reset

# 3. Issue を報告
gh issue create --title "Circular dependency detected" --body "..."
```

---

## エージェント実行の問題

### エージェントが空出力を返す

**エラーメッセージ**:
```
Error: Agent execution failed: Empty output
Error: No content generated
```

**原因**:
- エージェントのタイムアウト
- プロンプトが不適切
- エージェントAPIの問題

**解決策**:
```bash
# 1. ログを確認
cat .ai-workflow/issue-658/00_planning/execute/agent_log.md

# 2. 代替エージェントで再実行
/execute-phase 658 --phase planning --agent claude

# 3. 詳細ログを有効化
export LOG_LEVEL=debug
/execute-phase 658 --phase planning

# 4. タイムアウトを増やす（コードレベルで対応が必要）
# maxTurns を増やすか、プロンプトを簡潔にする
```

---

### エージェント実行がタイムアウト

**エラーメッセージ**:
```
Error: Agent execution timeout
Error: Command timed out after 300000ms
```

**原因**:
- エージェントの処理時間が長すぎる
- ネットワークの問題

**解決策**:
```bash
# 1. より速いモデルを使用
/execute-phase 658 --phase planning --codex-model mini
/execute-phase 658 --phase planning --claude-model haiku

# 2. プロンプトを簡潔にする（コードレベルで対応）

# 3. ネットワークを確認
ping github.com
```

---

### JSONパースエラー

**エラーメッセージ**:
```
Error: Failed to parse agent response
SyntaxError: Unexpected token < in JSON
```

**原因**:
- エージェントがJSON以外の形式で応答
- レスポンスにHTMLエラーが含まれている

**解決策**:
```bash
# 1. ログを確認
cat .ai-workflow/issue-658/00_planning/execute/agent_log_raw.txt

# 2. エージェントを変更
/execute-phase 658 --phase planning --agent claude

# 3. プロンプトを修正（コードレベルで対応）
# JSON出力を強制するようにプロンプトを改善
```

---

## 環境変数の問題

### 環境変数が設定されていない

**エラーメッセージ**:
```
Error: Required environment variable not set: GITHUB_TOKEN
Error: REPOS_ROOT is not defined
```

**原因**:
- 必須の環境変数が設定されていない

**解決策**:
```bash
# 1. .env ファイルを作成
cat > .env << EOF
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
CODEX_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLAUDE_CODE_OAUTH_TOKEN=sess_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
REPOS_ROOT=/path/to/repos
EOF

# 2. 環境変数を読み込み
source .env

# 3. または直接設定
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export CODEX_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

### パスが見つからない

**エラーメッセージ**:
```
Error: ENOENT: no such file or directory
Error: Cannot find module
```

**原因**:
- ファイルパスが間違っている
- 相対パスの解決に失敗

**解決策**:
```bash
# 1. カレントディレクトリを確認
pwd

# 2. 正しいディレクトリに移動
cd /path/to/ai-workflow-agent

# 3. パスを絶対パスで指定
export REPOS_ROOT="/Users/username/projects"
```

---

## マルチリポジトリの問題

### リポジトリパスが解決できない

**エラーメッセージ**:
```
Error: Could not resolve repository path
Error: Repository not found: owner/repo
```

**原因**:
- `REPOS_ROOT` が設定されていない
- リポジトリがクローンされていない

**解決策**:
```bash
# 1. REPOS_ROOT を設定
export REPOS_ROOT="/Users/username/TIELEC/development"

# 2. リポジトリをクローン
cd $REPOS_ROOT
git clone https://github.com/owner/repo.git

# 3. ワークフローを再初期化
/init-workflow https://github.com/owner/repo/issues/123
```

---

### リポジトリ間でメタデータが見つからない

**エラーメッセージ**:
```
Error: Workflow metadata not found in any repository
```

**原因**:
- メタデータが別のリポジトリに存在する
- リポジトリパスが正しくない

**解決策**:
```bash
# 1. メタデータを検索
find $REPOS_ROOT -name "metadata.json" | grep "issue-658"

# 2. 正しいリポジトリに移動
cd $REPOS_ROOT/owner/repo

# 3. メタデータを確認
cat .ai-workflow/issue-658/metadata.json
```

---

## その他の問題

### ディスク容量不足

**エラーメッセージ**:
```
Error: ENOSPC: no space left on device
```

**解決策**:
```bash
# 1. ディスク使用量を確認
df -h

# 2. ログをクリーンアップ
/cleanup-logs 658

# 3. または手動で削除
rm -rf .ai-workflow/issue-*/*/execute/
rm -rf .ai-workflow/issue-*/*/review/
rm -rf .ai-workflow/issue-*/*/revise/
```

---

### メモリ不足

**エラーメッセージ**:
```
Error: JavaScript heap out of memory
```

**解決策**:
```bash
# Node.js のメモリ制限を増やす
export NODE_OPTIONS="--max-old-space-size=4096"

# ワークフローを再実行
/execute-phase 658 --phase planning
```

---

## デバッグのヒント

### ログレベルを上げる

```bash
export LOG_LEVEL=debug
/execute-phase 658 --phase planning
```

### 詳細なエラースタックトレースを表示

```bash
export NODE_ENV=development
/execute-phase 658 --phase planning
```

### エージェントログを確認

```bash
# 実行ログ
cat .ai-workflow/issue-658/00_planning/execute/agent_log.md

# 生ログ
cat .ai-workflow/issue-658/00_planning/execute/agent_log_raw.txt

# プロンプト
cat .ai-workflow/issue-658/00_planning/execute/prompt.txt
```

### メタデータを確認

```bash
# メタデータ全体
cat .ai-workflow/issue-658/metadata.json

# フェーズステータスのみ
cat .ai-workflow/issue-658/metadata.json | jq '.phases'

# 特定フェーズのステータス
cat .ai-workflow/issue-658/metadata.json | jq '.phases.planning'
```

---

## サポート

これらの解決策で問題が解決しない場合：

1. **Issue を作成**: https://github.com/tielec/ai-workflow-agent/issues/new
2. **ドキュメントを確認**: `TROUBLESHOOTING.md` を参照
3. **トラブルシューティングスキルを使用**: `/troubleshoot 658 --verbose`
