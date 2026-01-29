---
name: troubleshoot
description: AI ワークフローのトラブルシューティング（エラー診断と解決策提案）
version: 1.0.0
context: fork
tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# トラブルシューティングスキル

このスキルは AI ワークフローのトラブルシューティングを支援します。エラーを診断し、解決策を提案します。

## できること

1. **エラー診断**: メタデータ、ログ、環境変数を分析
2. **解決策提案**: 具体的な修正手順を提示
3. **認証情報検証**: GitHub、Codex、Claude の認証状態を確認
4. **依存関係チェック**: フェーズ依存関係の問題を検出
5. **よくある問題の自動検出**: 既知の問題パターンをマッチング

## 使い方

### Issue 番号を指定して診断

```
/troubleshoot 658
```

### エラーメッセージを指定して診断

```
/troubleshoot 658 --error "ENOENT: no such file or directory"
```

### 特定のカテゴリのみ診断

```
/troubleshoot 658 --category auth
```

## 診断カテゴリ

以下のカテゴリで問題を診断します：

| カテゴリ | 診断内容 |
|---------|---------|
| `auth` | GitHub、Codex、Claude の認証状態 |
| `metadata` | メタデータファイルの存在と整合性 |
| `dependencies` | フェーズ依存関係の問題 |
| `git` | Git 設定、作業ツリーの状態 |
| `environment` | 環境変数、パス設定 |
| `logs` | エージェントログのエラー検出 |
| `all` | すべてのカテゴリ（デフォルト） |

## オプション

- **`--issue <NUM>`**: Issue 番号（省略時は最新のワークフローを自動検出）
- **`--error <message>`**: エラーメッセージを指定
- **`--category <name>`**: 診断カテゴリを指定（デフォルト: `all`）
- **`--verbose`**: 詳細な診断情報を表示
- **`--fix`**: 自動修正を試みる（可能な場合）

## 使用例

### 基本的な診断

```
# Issue 658 の問題を全カテゴリで診断
/troubleshoot 658

# 最新のワークフローを自動検出して診断
/troubleshoot
```

### カテゴリ指定

```
# 認証問題のみ診断
/troubleshoot 658 --category auth

# Git 関連の問題のみ診断
/troubleshoot 658 --category git

# ログからエラーを検出
/troubleshoot 658 --category logs
```

### エラーメッセージ指定

```
# 特定のエラーメッセージを診断
/troubleshoot 658 --error "ENOENT: no such file or directory, open 'planning.md'"

# API エラーを診断
/troubleshoot 658 --error "401 Unauthorized"
```

### 詳細診断と自動修正

```
# 詳細な診断情報を表示
/troubleshoot 658 --verbose

# 自動修正を試みる
/troubleshoot 658 --fix
```

## よくある問題と解決策

### 1. 認証エラー

**問題**: `401 Unauthorized` または `403 Forbidden`

**診断結果**:
```
❌ GitHub 認証: 失敗
  原因: GITHUB_TOKEN が設定されていません

❌ Codex 認証: 失敗
  原因: CODEX_API_KEY が設定されていません
```

**解決策**:
```bash
# GitHub トークンを設定
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"

# Codex API キーを設定
export CODEX_API_KEY="sk-xxxxxxxxxxxx"

# または
export OPENAI_API_KEY="sk-xxxxxxxxxxxx"
```

### 2. メタデータが見つからない

**問題**: `Workflow not found for Issue #658`

**診断結果**:
```
❌ メタデータ: 見つかりません
  場所: .ai-workflow/issue-658/metadata.json
```

**解決策**:
```bash
# ワークフローを初期化
/init-workflow 658
```

### 3. フェーズ依存関係エラー

**問題**: `Phase requirements requires planning to be completed`

**診断結果**:
```
❌ 依存関係: Phase 1 (requirements) は Phase 0 (planning) が完了していません
  planning: pending
  requirements: in_progress
```

**解決策**:
```bash
# 前提フェーズを実行
/execute-phase 658 --phase planning

# または依存関係を無視（非推奨）
/execute-phase 658 --phase requirements --ignore-dependencies
```

### 4. Git 作業ツリーが汚れている

**問題**: `Git working tree is dirty`

**診断結果**:
```
⚠ Git 状態: 未コミットの変更があります
  変更されたファイル:
    - src/core/config.ts
    - package.json
```

**解決策**:
```bash
# 変更をコミット
git add .
git commit -m "Work in progress"

# または変更をstash
git stash
```

### 5. エージェント実行失敗

**問題**: `Agent execution failed: Empty output`

**診断結果**:
```
❌ エージェント実行: 失敗
  エージェント: codex
  プロンプト: src/prompts/planning/ja/execute.txt
  出力: 空

  ログファイル:
    .ai-workflow/issue-658/00_planning/execute/agent_log.md
```

**解決策**:
```bash
# ログを確認
cat .ai-workflow/issue-658/00_planning/execute/agent_log.md

# 代替エージェントで再実行
/execute-phase 658 --phase planning --agent claude

# または詳細ログを有効化
export LOG_LEVEL=debug
/execute-phase 658 --phase planning
```

### 6. リポジトリパス解決失敗

**問題**: `Could not resolve repository path`

**診断結果**:
```
❌ リポジトリパス: 見つかりません
  リポジトリ: tielec/ai-workflow-agent
  検索パス:
    - C:\Users\ytaka\TIELEC\development\ai-workflow-agent ❌
    - C:\Users\ytaka\projects\ai-workflow-agent ❌
```

**解決策**:
```bash
# REPOS_ROOT を設定
export REPOS_ROOT="C:\Users\ytaka\TIELEC\development"

# または正しいディレクトリに移動
cd C:\Users\ytaka\TIELEC\development\ai-workflow-agent
```

## 自動修正機能

`--fix` オプションを使用すると、以下の問題を自動修正できます：

1. **環境変数の設定**: `.env` ファイルの生成
2. **Git 設定の修正**: `user.name` と `user.email` の設定
3. **メタデータの修復**: 破損したメタデータの復元
4. **依存関係の解決**: 前提フェーズの自動実行（確認あり）

```bash
/troubleshoot 658 --fix
```

## 診断レポート

診断完了後、以下の形式でレポートが表示されます：

```
=== トラブルシューティングレポート ===

Issue: #658 - Skills 化による UX 改善
ワークフロー状態: in_progress
現在のフェーズ: planning (Phase 0)

診断結果:
  ✓ GitHub 認証: OK
  ✓ Codex 認証: OK
  ✓ Claude 認証: OK
  ✓ メタデータ: OK
  ✓ Git 設定: OK
  ⚠ 依存関係: 警告
    Phase 1 (requirements) は Phase 0 (planning) が完了していません

推奨アクション:
  1. Phase 0 (planning) を完了してください
     /execute-phase 658 --phase planning

  2. その後、Phase 1 (requirements) を実行
     /execute-phase 658 --phase requirements

参考情報:
  - TROUBLESHOOTING.md を参照してください
  - 詳細ログ: .ai-workflow/issue-658/00_planning/execute/agent_log.md
```

## エラーパターンマッチング

このスキルは以下のエラーパターンを自動検出します：

### 認証エラー
- `401 Unauthorized`
- `403 Forbidden`
- `Bad credentials`
- `Token expired`

### ファイルシステムエラー
- `ENOENT: no such file or directory`
- `EACCES: permission denied`
- `EMFILE: too many open files`

### Git エラー
- `fatal: not a git repository`
- `error: failed to push`
- `error: Your local changes would be overwritten`

### エージェントエラー
- `Empty output`
- `Agent execution timeout`
- `JSON parse error`
- `Tool use failed`

## 内部実装

このスキルは以下の処理を実行します：

1. **メタデータ読み込み**: `.ai-workflow/issue-{NUM}/metadata.json`
2. **環境変数確認**: `GITHUB_TOKEN`, `CODEX_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` 等
3. **ログファイル解析**: エージェントログからエラーを抽出
4. **Git 状態確認**: `git status`, `git config` を実行
5. **依存関係検証**: フェーズ依存関係をチェック

実行される CLI コマンド：

```bash
# 認証情報検証
node dist/index.js validate-credentials --check all

# Git 状態確認
git status
git config user.name
git config user.email

# メタデータ確認
cat .ai-workflow/issue-<NUM>/metadata.json

# ログファイル確認
cat .ai-workflow/issue-<NUM>/<phase>/execute/agent_log.md
```

## 次のステップ

トラブルシューティング後、以下のアクションが可能です：

1. 問題を修正してフェーズを再実行: `/execute-phase`
2. ワークフロー状態を確認: `/workflow-status`
3. 認証情報を再検証: `/validate-credentials`

## ヒント

- エラーが発生したら、まず `/troubleshoot` を実行して診断
- `--verbose` オプションで詳細な情報を確認
- `--fix` オプションで自動修正を試みる（安全な操作のみ）
- よくある問題は `TROUBLESHOOTING.md` にも記載されています
