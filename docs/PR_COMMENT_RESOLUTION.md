# PRコメント自動対応機能ガイド

このドキュメントでは、PRレビューコメントを検出し、AIエージェントが自動的に対応する `pr-comment` コマンドの詳細な使用方法を説明します。

## 概要

`pr-comment` コマンドは、Pull Requestに投稿されたレビューコメントを検出し、AIエージェント（Codex / Claude）が各コメントに対して自動的に対応（コード修正、返信、解決マーク）を行う機能です。

**主なユースケース**:
- レビューコメントへの自動返信
- 指摘されたコード修正の自動適用
- 議論が必要なコメントの識別
- PRレビューサイクルの高速化

## クイックスタート

```bash
# 1. PRから未解決コメントを取得してメタデータを初期化
ai-workflow pr-comment init --pr 123

# 2. 各コメントをAIエージェントで分析し、コード修正・返信投稿を実行
ai-workflow pr-comment execute --pr 123

# 3. 完了したコメントスレッドを解決し、メタデータをクリーンアップ
ai-workflow pr-comment finalize --pr 123
```

## コマンド詳細

### `pr-comment init`

PRから未解決のレビューコメントを取得し、メタデータを初期化します。

```bash
ai-workflow pr-comment init --pr <number> [--dry-run]
```

**オプション**:
| オプション | 必須 | 説明 |
|-----------|------|------|
| `--pr <number>` | ✓ | 対象のPR番号 |
| `--dry-run` | | プレビューモード（メタデータを作成しない） |

**実行内容**:
1. GitHub APIを使用してPRの未解決レビューコメントを取得
2. 各コメントのメタデータ（ID、本文、対象ファイル、行番号等）を収集
3. `.ai-workflow/pr-<number>/comment-resolution-metadata.json` を作成

**出力例**:
```
🔍 PR #123 から未解決コメントを取得中...
✅ 5件の未解決コメントを検出しました

📋 コメント一覧:
  1. src/core/parser.ts:45 - "エラーハンドリングが不足しています"
  2. src/utils/helper.ts:120 - "この関数は分割できそうです"
  3. src/main.ts:30 - "定数名をより分かりやすくしてください"
  ...

✅ メタデータを初期化しました: .ai-workflow/pr-123/comment-resolution-metadata.json
```

### `pr-comment execute`

各コメントをAIエージェントで分析し、コード修正・返信投稿を実行します。

```bash
ai-workflow pr-comment execute --pr <number> [--dry-run] [--agent <mode>] [--batch-size <number>]
```

**オプション**:
| オプション | 必須 | 説明 | デフォルト |
|-----------|------|------|----------|
| `--pr <number>` | ✓ | 対象のPR番号 | - |
| `--dry-run` | | プレビューモード（変更を適用しない） | false |
| `--agent <mode>` | | 使用するエージェント（`auto` \| `codex` \| `claude`） | `auto` |
| `--batch-size <number>` | | 一度に処理するコメント数 | 5 |

**実行内容**:
1. メタデータから未処理のコメントを取得
2. 各コメントをAIエージェントで分析し、解決タイプを判定
3. 解決タイプに応じた処理を実行:
   - `code_change`: ファイル変更を適用し、返信を投稿
   - `reply`: 返信のみを投稿
   - `discussion`: スキップ（人間の判断を待つ）
   - `skip`: スキップ（対応不要）
4. 処理結果をメタデータに保存

**解決タイプ**:

| タイプ | 説明 | 自動アクション |
|--------|------|--------------|
| `code_change` | コード修正が必要 | ファイル変更適用 + 返信投稿 |
| `reply` | 返信のみで対応 | 返信投稿のみ |
| `discussion` | 議論が必要 | スキップ（人間の判断を待つ） |
| `skip` | 対応不要 | スキップ |

**出力例**:
```
🤖 PR #123 のコメントを処理中...

[1/5] src/core/parser.ts:45
  📝 コメント: "エラーハンドリングが不足しています"
  🔍 分析中...
  ✅ 解決タイプ: code_change (confidence: high)
  📄 ファイル変更: src/core/parser.ts (3行追加)
  💬 返信投稿: "エラーハンドリングを追加しました。try-catchブロックで例外を捕捉し、..."

[2/5] src/utils/helper.ts:120
  📝 コメント: "この関数は分割できそうです"
  🔍 分析中...
  ⏭️ 解決タイプ: discussion (confidence: medium)
  📝 理由: リファクタリングの範囲と方針について確認が必要です

...

📊 処理サマリー:
  - 完了: 3件
  - 議論が必要: 1件
  - スキップ: 1件
```

### `pr-comment finalize`

完了したコメントスレッドを解決し、メタデータをクリーンアップします。

```bash
ai-workflow pr-comment finalize --pr <number> [--dry-run]
```

**オプション**:
| オプション | 必須 | 説明 |
|-----------|------|------|
| `--pr <number>` | ✓ | 対象のPR番号 |
| `--dry-run` | | プレビューモード（実際に解決しない） |

**実行内容**:
1. メタデータから `completed` ステータスのコメントを取得
2. GitHub GraphQL APIを使用してスレッドを解決（Resolve）
3. メタデータをクリーンアップ

**出力例**:
```
🏁 PR #123 のコメントスレッドを解決中...

✅ 3件のスレッドを解決しました:
  - src/core/parser.ts:45 (code_change)
  - src/main.ts:30 (code_change)
  - tests/parser.test.ts:15 (reply)

🧹 メタデータをクリーンアップしました
```

## メタデータ構造

`.ai-workflow/pr-<number>/comment-resolution-metadata.json`:

```json
{
  "pr_number": 123,
  "initialized_at": "2025-01-20T10:00:00Z",
  "comments": [
    {
      "id": 12345,
      "thread_id": "PRRT_kwDOABC123",
      "path": "src/core/parser.ts",
      "line": 45,
      "body": "エラーハンドリングが不足しています",
      "author": "reviewer",
      "status": "completed",
      "resolution": {
        "type": "code_change",
        "confidence": "high",
        "reply": "エラーハンドリングを追加しました...",
        "file_changes": [
          {
            "path": "src/core/parser.ts",
            "type": "modify",
            "content": "..."
          }
        ],
        "resolved_at": "2025-01-20T10:30:00Z"
      },
      "retry_count": 0
    }
  ],
  "summary": {
    "total": 5,
    "pending": 0,
    "in_progress": 0,
    "completed": 3,
    "failed": 0,
    "skipped": 2
  },
  "cost_tracking": {
    "total_tokens": 15000,
    "estimated_cost_usd": 0.15
  }
}
```

## セキュリティ機能

### パストラバーサル防止

ファイル変更適用時、以下の検証を実施します:

```typescript
function validatePath(repoPath: string, targetPath: string): boolean {
  const resolved = path.resolve(repoPath, targetPath);
  return resolved.startsWith(repoPath) && !targetPath.includes('..');
}
```

- リポジトリ外への書き込みを禁止
- `..` を含むパスを拒否

### 機密ファイル除外

以下のパターンに一致するファイルは変更対象から除外されます:

```typescript
const EXCLUDED_PATTERNS = [
  '.env',
  '.env.*',
  'credentials.json',
  '*.pem',
  '*.key',
  '.git/**',
  '**/.git/**'
];
```

### 信頼度による自動スキップ

AIエージェントの分析結果に `confidence` レベルが含まれます:

| Confidence | 説明 | アクション |
|------------|------|----------|
| `high` | 高い確信度 | 自動適用 |
| `medium` | 中程度の確信度 | 自動適用（警告表示） |
| `low` | 低い確信度 | `discussion` に変更（自動スキップ） |

`confidence: low` のコード変更は自動的に `discussion` タイプに変更され、人間の判断を待ちます。

## レジューム機能

`pr-comment execute` は中断からの再開をサポートします。

### 動作仕様

1. 各コメント処理後にメタデータを保存
2. 中断後に再実行すると、`pending` または `in_progress` ステータスのコメントから再開
3. `completed` または `skipped` ステータスのコメントはスキップ

### 使用例

```bash
# 最初の実行（途中でCtrl+Cで中断）
ai-workflow pr-comment execute --pr 123
# → 2件処理後に中断

# 再実行（残りの3件を処理）
ai-workflow pr-comment execute --pr 123
# → 残りの3件を処理
```

## トラブルシューティング

### よくある問題

#### 1. GitHub API認証エラー

```
Error: Bad credentials
```

**解決策**: `GITHUB_TOKEN` 環境変数を確認してください。

```bash
export GITHUB_TOKEN="ghp_..."
```

#### 2. PR番号が見つからない

```
Error: PR #123 not found
```

**解決策**: PR番号が正しいか、リポジトリが正しいか確認してください。

```bash
# GITHUB_REPOSITORY 環境変数を確認
echo $GITHUB_REPOSITORY
```

#### 3. エージェント認証エラー

```
Error: Codex API key not found
```

**解決策**: エージェント認証情報を設定してください。

```bash
# Codex を使用する場合
export CODEX_API_KEY="sk-..."

# Claude を使用する場合
export CLAUDE_CODE_CREDENTIALS_PATH="$HOME/.claude-code/credentials.json"
```

#### 4. ファイル変更適用エラー

```
Error: Path validation failed: src/../../../etc/passwd
```

**解決策**: パストラバーサル攻撃の可能性があるため、対象ファイルパスを確認してください。

### ログの確認

詳細なログは `.ai-workflow/pr-<number>/execute/agent_log.md` に保存されます:

```bash
# ログを確認
cat .ai-workflow/pr-123/execute/agent_log.md
```

### メタデータのリセット

問題が発生した場合、メタデータを削除して再初期化できます:

```bash
# メタデータを削除
rm -rf .ai-workflow/pr-123

# 再初期化
ai-workflow pr-comment init --pr 123
```

## 制限事項

1. **対象コメント**: PRレビューコメントのみ（一般的なIssueコメントは対象外）
2. **ファイル変更**: 既存ファイルの変更、新規ファイル作成、ファイル削除をサポート
3. **バイナリファイル**: バイナリファイルの変更は未サポート
4. **大規模変更**: 大規模なリファクタリングは `discussion` タイプとして扱われる場合があります

## 関連ドキュメント

- [README.md](../README.md) - プロジェクト概要とクイックスタート
- [ARCHITECTURE.md](../ARCHITECTURE.md) - アーキテクチャ詳細
- [CLAUDE.md](../CLAUDE.md) - Claude Code向けガイダンス

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0.0 | 2025-01-20 | 初版作成（Issue #383） |
