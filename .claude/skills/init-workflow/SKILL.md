---
name: init-workflow
description: GitHub Issue に対して AI ワークフローを初期化（ブランチ、メタデータ、ドラフト PR を作成）
version: 1.0.0
context: fork
tools:
  - Bash
  - Read
  - Write
hooks:
  pre-tool-use: |
    # Git 操作前に作業ツリーのクリーン状態を検証
    if tool == "Bash" and "git" in args:
      check_working_tree_clean()
  post-tool-use: |
    # すべての Git 操作をデバッグ用にログ記録
    if tool == "Bash" and "git" in args:
      log_git_operation(args, result)
---

# ワークフロー初期化スキル

このスキルは GitHub Issue に対して AI ワークフローを初期化します。

## できること

1. GitHub Issue URL を解析
2. フィーチャーブランチを作成（または既存ブランチにチェックアウト）
3. ワークフローメタデータを初期化
4. ドラフト Pull Request を作成

## 使い方

GitHub Issue URL または Issue 番号を指定してください：

```
/init-workflow https://github.com/owner/repo/issues/123
```

同じリポジトリの場合は Issue 番号だけでも OK：

```
/init-workflow 123
```

## 実行される処理

### ステップ 1: 前提条件の検証
- `GITHUB_TOKEN` が設定されているか確認
- リポジトリがクリーンか確認（未コミットの変更がないか）
- Issue が存在しアクセス可能か確認

### ステップ 2: Issue 情報の取得
- URL から owner、repo、Issue 番号を抽出
- Issue タイトルとメタデータを取得
- 対象リポジトリのパスを決定

### ステップ 3: ブランチ管理
- ブランチ名を生成: `ai-workflow/issue-{NUM}`
- ブランチが既に存在するか確認（ローカル/リモート）
- 新規ブランチを作成、または既存ブランチにチェックアウト
- ベースブランチを設定（デフォルト: 現在のブランチ、または `--base-branch` で指定）

### ステップ 4: メタデータ初期化
- `.ai-workflow/issue-{NUM}/` ディレクトリを作成
- `metadata.json` を生成:
  - Issue 情報
  - フェーズステータス（すべて pending）
  - 対象リポジトリの詳細
  - ワークフロー設定
  - 難易度分析（`--auto-model-selection` 有効時）

### ステップ 5: ドラフト PR 作成
- Issue タイトルから PR タイトルを生成
- テンプレート本文でドラフト PR を作成
- PR を Issue にリンク

## オプション

スキル呼び出し時に追加オプションを指定できます：

- **`--branch <name>`**: カスタムブランチ名（デフォルト: `ai-workflow/issue-{NUM}`）
- **`--base-branch <name>`**: 分岐元のベースブランチ（デフォルト: 現在のブランチ）
- **`--language <ja|en>`**: ワークフロー言語（デフォルト: `ja`）
- **`--auto-model-selection`**: Issue 難易度に基づく自動モデル選択を有効化

## 使用例

### 基本的な初期化
```
/init-workflow https://github.com/tielec/ai-workflow-agent/issues/658
```

### カスタムブランチ名を指定
```
/init-workflow 658 --branch feature/skills-migration
```

### ベースブランチと言語を指定
```
/init-workflow 658 --base-branch main --language en
```

### 自動モデル選択を有効化
```
/init-workflow 658 --auto-model-selection
```

## エラー対応

このスキルは一般的なエラーを自動的に処理します：

- **Issue が見つからない**: Issue URL を検証し、修正を提案
- **認証失敗**: `GITHUB_TOKEN` の確認を案内
- **作業ツリーが汚れている**: 変更をコミットまたは stash するよう促す
- **ブランチが既に存在**: 既存ブランチへのチェックアウトを提案
- **リモートリポジトリが見つからない**: マルチリポジトリ設定の解決を支援

## 内部実装

このスキルは以下の CLI コマンドを実行します：

```bash
node dist/index.js init \
  --issue-url <URL> \
  [--branch <name>] \
  [--base-branch <name>] \
  [--language <ja|en>] \
  [--auto-model-selection]
```

## 出力例

初期化が成功すると、以下のように表示されます：

```
✓ Issue #658 を取得: Skills 化による UX 改善
✓ ブランチを作成: ai-workflow/issue-658
✓ メタデータを初期化: .ai-workflow/issue-658/metadata.json
✓ ドラフト PR を作成: #123
```

## 次のステップ

初期化後、以下のアクションが可能です：

1. フェーズを実行: `/execute-phase`
2. ワークフロー状態を確認: `/workflow-status`
3. 必要に応じて差し戻し: `/rollback-phase`

## ヒント

- 複数の Issue に取り組む場合は、それぞれを個別に初期化してください
- Issue の複雑さに応じて最適なモデルを選択するには `--auto-model-selection` を使用
- このスキルは `context: fork` を使用して Git 操作をメイン会話から分離します
