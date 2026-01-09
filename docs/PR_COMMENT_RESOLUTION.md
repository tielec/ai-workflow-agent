# PRコメント自動対応機能ガイド

このドキュメントでは、PRレビューコメントを検出し、AIエージェントが自動的に対応する `pr-comment` コマンドの詳細な使用方法を説明します。

## 概要

`pr-comment` コマンドは、Pull Requestに投稿されたレビューコメントを検出し、AIエージェント（Codex / Claude）が各コメントに対して自動的に対応（コード修正、返信、解決マーク）を行う機能です。

**主なユースケース**:
- レビューコメントへの自動返信
- 指摘されたコード修正の自動適用
- 議論が必要なコメントの識別
- PRレビューサイクルの高速化

## 高度な分析機能（Issue #615で追加）

### スレッドコンテキスト分析

PRコメント分析では、各コメントを独立して判定するのではなく、**スレッド全体の文脈を考慮した分析**を行います。

**主な機能**:
- コメントを`thread_id`でグループ化し、時系列順に整理
- AIの返信コメントと人間のコメントを識別（`[AI Reply]`/`[User Comment]`ラベル付け）
- スレッド内の過去のやりとりを含めた包括的な分析

**従来の問題**:
```
ユーザー: 「リファクタリングしたほうが良さそう」
AI提案: 「ヘルパー関数に分けて進めてよいでしょうか」
ユーザー: 「はい、その方針で進めていいです」
→ 従来: type: "reply"（単なる返信として誤判定）
```

**改善後**:
```
ユーザー: 「リファクタリングしたほうが良さそう」
AI提案: 「ヘルパー関数に分けて進めてよいでしょうか」
ユーザー: 「はい、その方針で進めていいです」
→ 改善後: type: "code_change"（承認パターンを正しく検出）
```

### 承認パターン検出

スレッド全体を分析し、以下のパターンを自動検出します。

**パターン1: AI提案 → ユーザー承認**
- AI提案キーワード: 「〜してよいでしょうか」「〜の方針で進めます」「〜を実装しましょうか」
- ユーザー承認キーワード: 「はい」「OK」「その方針で進めて」「お願いします」
- 結果: `type: "code_change"`, `confidence: "high"`

**パターン2: 質問 → 回答**
- AIが技術的な質問をし、ユーザーが具体的な指示で回答
- 結果: `type: "code_change"`, `confidence: "medium"`

**パターン3: 単純な返信**
- AI提案がない、または承認キーワードがない場合
- 結果: `type: "reply"` または `type: "discussion"`

**多言語サポート**:
- 日本語と英語の両方で承認パターンを検出
- 承認キーワード例（英語）: "yes", "OK", "LGTM", "go ahead", "please proceed"

### 技術的詳細

**スレッドデータの構造**:
```markdown
### Thread #thread-ABC123

#### Comment #100 [User Comment]
- Author: reviewer1
- Created: 2025-01-20T10:00:00Z
- File: src/commands/execute/agent-setup.ts
- Line: 42
- Body:
```
今回の修正によって可読性が悪くなったと思う。リファクタリングしたほうが良さそう。
```

#### Comment #101 [AI Reply]
- Author: ai-workflow-bot
- Created: 2025-01-20T10:05:00Z
- File: src/commands/execute/agent-setup.ts
- Line: 42
- Body:
```
ご指摘ありがとうございます。優先度ごとの処理を小さなヘルパー関数に分けて、フォールバックのログ/初期化順序が見通せる形にリファクタする案で進めてよいでしょうか。
```

#### Comment #102 [User Comment]
- Author: reviewer1
- Created: 2025-01-20T10:10:00Z
- File: src/commands/execute/agent-setup.ts
- Line: 42
- Body:
```
はい、その方針で進めていいです。
```
```

このスレッドコンテキストにより、AIエージェントはComment #102を単なる返信ではなく、具体的なリファクタリング提案への承認として正しく判定できます。

## クイックスタート

```bash
# 1. PRから未解決コメントを取得してメタデータを初期化
ai-workflow pr-comment init --pr 123

# 2. AIエージェントでコメントを分析し、response-plan.jsonを生成
ai-workflow pr-comment analyze --pr 123

# 3. response-plan.jsonに基づいてコード修正・返信投稿を実行
ai-workflow pr-comment execute --pr 123

# 4. 完了したコメントスレッドを解決し、メタデータをクリーンアップ
ai-workflow pr-comment finalize --pr 123

# Jenkins環境やマルチリポジトリ環境での使用例（--pr-urlオプション）
ai-workflow pr-comment init --pr-url https://github.com/owner/target-repo/pull/123
ai-workflow pr-comment analyze --pr-url https://github.com/owner/target-repo/pull/123
ai-workflow pr-comment execute --pr-url https://github.com/owner/target-repo/pull/123
ai-workflow pr-comment finalize --pr-url https://github.com/owner/target-repo/pull/123
```

## コマンド詳細

### `pr-comment init`

PRから未解決のレビューコメントを取得し、メタデータを初期化します。

```bash
ai-workflow pr-comment init --pr <number> | --pr-url <URL> [--dry-run]
```

**オプション**:
| オプション | 必須 | 説明 |
|-----------|------|------|
| `--pr <number>` | ✓* | 対象のPR番号（GITHUB_REPOSITORYから自動解決） |
| `--pr-url <URL>` | ✓* | 対象のPR URL（マルチリポジトリ対応、REPOS_ROOT配下を使用） |
| `--dry-run` | | プレビューモード（メタデータを作成しない） |

*`--pr` または `--pr-url` のいずれか一方が必須

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

### `pr-comment analyze`

各コメントをAIエージェントで分析し、response-plan.jsonを生成します（Issue #428で追加）。

```bash
ai-workflow pr-comment analyze --pr <number> | --pr-url <URL> [--dry-run] [--agent <mode>] [--comment-ids <ids>]
```

**オプション**:
| オプション | 必須 | 説明 | デフォルト |
|-----------|------|------|----------|
| `--pr <number>` | ✓* | 対象のPR番号（GITHUB_REPOSITORYから自動解決） | - |
| `--pr-url <URL>` | ✓* | 対象のPR URL（マルチリポジトリ対応、REPOS_ROOT配下を使用） | - |
| `--dry-run` | | プレビューモード（分析のみ、保存しない） | false |
| `--agent <mode>` | | 使用するエージェント（`auto` \| `codex` \| `claude`） | `auto` |
| `--comment-ids <ids>` | | 分析対象のコメントID（カンマ区切り） | 全コメント |

*`--pr` または `--pr-url` のいずれか一方が必須

**実行内容**:
1. メタデータから未処理のコメントを取得
2. AIエージェントで全コメントを一括分析
3. 各コメントの解決タイプ、返信メッセージ、提案するコード変更を決定
4. `.ai-workflow/pr-{prNumber}/output/response-plan.json` に分析結果を保存

`pr-comment analyze` は実行直前に `refreshComments()` を呼び出し、GitHub から未解決コメントを再取得した上で既存メタデータにない `comment_id` だけを `pending` 状態で追加する `PRCommentMetadataManager.addComments()` を実行するため、`pr-comment init` 実行後や中断再開後に投稿された新規コメントも漏れなく分析対象になります（重複は metadata 内の ID で除外されます）。

**AI返信コメントの自動除外機能（Issue #614で追加）**:
`refreshComments()` は取得したコメントの中からAI自身の返信コメント（メタデータの `reply_comment_id` に記録されたID）を自動的に除外し、2重返信を防ぎます。除外されたAI返信コメント数は `logger.debug("Excluded N AI reply comment(s)")` 形式でデバッグログに出力されます。

**出力ファイル**:

`response-plan.json` は以下の構造を持ちます:
```json
{
  "pr_number": 123,
  "analyzed_at": "2025-01-20T10:00:00Z",
  "analyzer_agent": "codex",
  "comments": [
    {
      "comment_id": "100",
      "type": "code_change",
      "confidence": "high",
      "rationale": "エラーハンドリングの追加が必要",
      "proposed_changes": [
        {
          "action": "modify",
          "file": "src/app.ts",
          "line_range": "10-20",
          "changes": "// 修正後のファイル内容"
        }
      ],
      "reply_message": "エラーハンドリングを追加しました。"
    }
  ]
}
```

### `pr-comment execute`

response-plan.jsonに基づいてコード修正・返信投稿を実行します（Issue #444でリファクタリング）。

```bash
ai-workflow pr-comment execute --pr <number> | --pr-url <URL> [--dry-run] [--batch-size <number>]
```

**オプション**:
| オプション | 必須 | 説明 | デフォルト |
|-----------|------|------|----------|
| `--pr <number>` | ✓* | 対象のPR番号（GITHUB_REPOSITORYから自動解決） | - |
| `--pr-url <URL>` | ✓* | 対象のPR URL（マルチリポジトリ対応、REPOS_ROOT配下を使用） | - |
| `--dry-run` | | プレビューモード（変更を適用しない） | false |
| `--batch-size <number>` | | 一度に処理するコメント数 | 5 |

*`--pr` または `--pr-url` のいずれか一方が必須

**前提条件**:
- `pr-comment analyze` が事前に実行されていること
- `response-plan.json` が存在すること

**実行内容**:
1. `.ai-workflow/pr-{prNumber}/output/response-plan.json` を読み込み
2. 各コメントの解決情報を取得（再分析は行わない）
3. 解決タイプに応じた処理を実行:
   - `code_change`: proposed_changesに基づいてファイル変更を適用し、返信を投稿
   - `reply`: reply_messageを返信投稿
   - `discussion`: スキップ（人間の判断を待つ）
   - `skip`: スキップ（対応不要）
4. 処理結果をメタデータに保存
5. **各コメント分析時のエージェント実行ログをファイルに保存**（Issue #487で追加）:
   - ファイル名: `agent_log_comment_{comment_id}.md`
   - 保存先: `.ai-workflow/pr-{NUM}/execute/`
   - フォーマット: Markdown形式（LogFormatterによる統一フォーマット）
   - ドライランモード時はログ保存をスキップ

**補足**: `metadataManager.getPendingComments()` は `reply_comment_id` が設定済みのコメントを未処理リストから除外し、`processComment()` でも再確認して `Comment #${commentId} already has a reply (reply ID: ${reply_comment_id}). Skipping.` というログを出力しつつ `skipped` ステータスを付与することで二重返信を防ぎます。dry-run モードではステータス更新を行わずログのみを出力しますが、実行サマリーの `summary.by_status.skipped` にはスキップ件数が反映されます。

**注意**: Issue #444でリファクタリングされ、executeコマンドはエージェント実行を行わなくなりました。これにより、analyzeフェーズで生成された分析結果が正確に適用され、実行コストが半減します。

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
ai-workflow pr-comment finalize --pr <number> | --pr-url <URL> [--dry-run] [--squash]
```

**オプション**:
| オプション | 必須 | 説明 |
|-----------|------|------|
| `--pr <number>` | ✓* | 対象のPR番号（GITHUB_REPOSITORYから自動解決） |
| `--pr-url <URL>` | ✓* | 対象のPR URL（マルチリポジトリ対応、REPOS_ROOT配下を使用） |
| `--dry-run` | | プレビューモード（実際に解決しない） |
| `--squash` | | ワークフローで作成されたコミットを1つにまとめる（Issue #450で追加） |

*`--pr` または `--pr-url` のいずれか一方が必須

**実行内容**:
1. メタデータから `completed` ステータスのコメントを取得
2. GitHub GraphQL APIを使用してスレッドを解決（Resolve）
3. ワークフロー成果物（`.ai-workflow/pr-{number}/`ディレクトリ）をクリーンアップ
4. 削除された成果物をGit操作で反映
   - `git add .` ですべての変更（削除を含む）をステージング
   - `git.status()` の `files.length > 0` を確認し、変更があれば `[pr-comment] Finalize PR #${prNumber}: Clean up workflow artifacts (${resolvedCount} threads resolved)` というメッセージでコミット、変更がなければ `No changes to commit.` を出力してコミット・プッシュ処理をスキップ
   - `metadata.pr.branch` で判別した PR の head ブランチに `git push('origin', 'HEAD:<branch>')` してリモートへ反映
5. `--squash` オプション指定時:
   - `base_commit`（init時に記録）から現在のHEADまでのコミットを1つにまとめる
   - コミットメッセージ: `[pr-comment] Resolve PR #XXX review comments (N comments)`
   - `git push --force-with-lease` で安全に強制プッシュ

**出力例**:
```
🏁 PR #123 のコメントスレッドを解決中...

✅ 3件のスレッドを解決しました:
  - src/core/parser.ts:45 (code_change)
  - src/main.ts:30 (code_change)
  - tests/parser.test.ts:15 (reply)

🧹 メタデータをクリーンアップしました
📝 ワークフロー成果物の削除をステージ・コミット・プッシュしました
📋 Git status: 3 件の変更が検出されました
✍️ コミット: `[pr-comment] Finalize PR #123: Clean up workflow artifacts (3 threads resolved)`
🔁 `origin HEAD:feature/test-feature` に push しました

```

> `No changes to commit.` は変更がない場合に表示されるログで、コミット・プッシュはスキップされます。

#### コミットスカッシュ機能（Issue #450で追加）

`--squash` オプションを指定すると、ワークフローで作成された複数のコミットを1つにまとめます。

**動作要件**:
- `pr-comment init` が最新バージョンで実行されていること（`base_commit` が記録されている必要あり）
- 現在のブランチが `main` または `master` でないこと（ブランチ保護）
- スカッシュ対象のコミットが2件以上存在すること

**スカッシュの流れ**:
1. `base_commit`（init時に記録）をメタデータから取得
2. `base_commit` がない場合は警告を表示してスカッシュをスキップ（他の処理は継続）
3. 現在のブランチが `main`/`master` でないことを確認
4. `git reset --soft <base_commit>` でコミットをリセット
5. 以下のフォーマットでコミットメッセージを生成:
   ```
   [pr-comment] Resolve PR #XXX review comments (N comments)

   - Addressed N review comments
   - Applied N code changes
   - Posted N replies

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
6. `git commit -m "<message>"` で新しいコミットを作成
7. `git push --force-with-lease origin <branch>` で安全に強制プッシュ

**使用例**:
```bash
# 通常の finalize（スカッシュなし）
ai-workflow pr-comment finalize --pr 123

# スカッシュ付き finalize
ai-workflow pr-comment finalize --pr 123 --squash

# プレビューモードでスカッシュ内容を確認
ai-workflow pr-comment finalize --pr 123 --squash --dry-run
```

**後方互換性**:
- `base_commit` がメタデータにない場合（旧バージョンでinitした場合）は、スカッシュ処理のみスキップされます
- スレッド解決やクリーンアップなど他の処理は正常に実行されます
- 警告メッセージ: `base_commit not found in metadata. Skipping squash.`

**安全機能**:
- `main`/`master` ブランチへの強制プッシュを禁止
- `--force-with-lease` を使用（リモートの変更を上書きしない）
- `--dry-run` でスカッシュ内容を事前確認可能

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

`pr-comment` コマンド群は中断からの再開をサポートします。

### 動作仕様

1. 各コメント処理後にメタデータを保存
2. 中断後に再実行すると、`pending` または `in_progress` ステータスのコメントから再開
3. `completed` または `skipped` ステータスのコメントはスキップ

### initコマンドのスキップ機能（Issue #426で追加）

既存のメタデータが存在する場合、`pr-comment init` は初期化をスキップし、既存データを保護します。

**動作**:
- メタデータファイルが存在する場合は警告ログを出力して正常終了
- 既存メタデータの上書きを防止
- リビルド時の安全な再開を実現

**例**:
```bash
# 初回実行
ai-workflow pr-comment init --pr 123
# → メタデータを新規作成

# リビルド時（既にメタデータが存在）
ai-workflow pr-comment init --pr 123
# → [WARNING] Metadata already exists. Skipping initialization.
# → [INFO] Use "pr-comment analyze" or "pr-comment execute" to resume.
```

### 使用例

```bash
# 最初の実行（途中でCtrl+Cで中断）
ai-workflow pr-comment init --pr 123
ai-workflow pr-comment execute --pr 123
# → 2件処理後に中断

# リビルド時（initはスキップされ、残りの処理を継続）
ai-workflow pr-comment init --pr 123     # → スキップ
ai-workflow pr-comment execute --pr 123  # → 残りの3件を処理
```

### Jenkinsでのリビルド対応

Jenkins環境では、パイプラインのリビルド時に自動的にメタデータの有無を判定し、適切なステージから再開します。

**ステージ構成**:
1. Setup Environment
2. Setup Node.js Environment
3. **Check Resume**（新規追加） - メタデータの存在確認
4. **PR Comment Init**（条件分岐追加） - メタデータがない場合のみ実行
5. PR Comment Analyze
6. PR Comment Execute

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

#### 4. analyze フェーズでのエラー終了（Issue #428で改善）

```
Error: Failed to analyze PR comments: [エラー詳細]
```

**原因**: analyzeフェーズでAIエージェントによる分析が失敗した場合の動作が改善されました。

**CI環境での動作**:
- エラー発生時に即座に `exit(1)` で終了
- executeステージには進まない
- Jenkinsパイプラインで失敗として検知される

**ローカル環境での動作**:
- 確認プロンプトが表示される
- ユーザーが継続を承認するとフォールバックプランで続行
- ユーザーが拒否すると `exit(1)` で終了

**対処法**:
```bash
# CI環境: ログを確認してエラー原因を修正後、再実行
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_error'

# ローカル環境: プロンプトで 'y' を入力してフォールバックで継続（推奨度低）
# または 'N' で終了してエラー原因を修正
```

**エラー情報の確認**:
```bash
# メタデータからエラー詳細を確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_error, .analyzer_error_type'

# 一般的なエラー種別
# - agent_execution_error: API認証エラー、タイムアウト等
# - agent_empty_output: エージェントが空出力を返した
# - json_parse_error: レスポンスのJSONパースに失敗
# - validation_error: レスポンス構造の検証に失敗
```

**JSONパースエラーの詳細（Issue #438で根本解決）**:

Issue #438 により、`pr-comment analyze` は `.ai-workflow/pr-{prNumber}/analyze/response-plan.json` に JSON を書き出し、CLI はこのファイルを最優先で読み込むようになりました。ファイルが存在しない・正しくないケースでは、Issue #427 で改善された3段階のパース戦略（Markdown → JSON Lines → プレーンJSON）をフォールバックとして順番に試行します。

ファイル生成に失敗したケースでは、以下のようにログやパース戦略を確認してフォールバックの試行履歴を追跡できます。

```bash
# パース戦略の試行結果を確認（v0.5.0以降）
grep -E "(Strategy [123]|parse|failed)" .ai-workflow/pr-123/analyze/execute/agent_log.md

# 改善内容の確認
# Strategy 1: Markdownコードブロック抽出
# Strategy 2: JSON Lines形式からの後方探索（改善版）
# Strategy 3: プレーンJSONパターンのマッチング（改善版）

# パース成功率の確認
cat .ai-workflow/pr-123/comment-resolution-metadata.json | jq '.analyzer_agent'
# "fallback" の場合はパース失敗、"codex"/"claude" の場合は成功
```

**注意**: これらのパース戦略は現在フォールバック用途であり、通常は `.ai-workflow/pr-{prNumber}/analyze/response-plan.json` から直接読み込まれるため使用されません。Issue #427 で改善された成功率向上は、ファイル出力が失敗した稀なケースでの安全網として機能します。

#### 5. ファイル変更適用エラー

```
Error: Path validation failed: src/../../../etc/passwd
```

**解決策**: パストラバーサル攻撃の可能性があるため、対象ファイルパスを確認してください。

### ログの確認

詳細なログは Markdownフォーマットで以下の場所に保存されます:

- 分析フェーズ: `.ai-workflow/pr-<number>/analyze/agent_log.md`
- 実行フェーズ: `.ai-workflow/pr-<number>/execute/agent_log.md`
- **個別コメント分析ログ**: `.ai-workflow/pr-<number>/execute/agent_log_comment_{comment_id}.md`（Issue #487で追加）

```bash
# 分析ログを確認
cat .ai-workflow/pr-123/analyze/agent_log.md

# 実行ログを確認
cat .ai-workflow/pr-123/execute/agent_log.md

# 特定コメントの分析ログを確認（Issue #487で追加）
cat .ai-workflow/pr-123/execute/agent_log_comment_12345.md

# 全ての個別コメントログを確認
ls .ai-workflow/pr-123/execute/agent_log_comment_*.md
```

これらのログはIssue #441により統一的なMarkdown形式で出力され、読みやすい構造化された情報を提供します。

### メタデータのリセット

問題が発生した場合、メタデータを削除して再初期化できます:

```bash
# メタデータを削除
rm -rf .ai-workflow/pr-123

# 再初期化
ai-workflow pr-comment init --pr 123
```

## Jenkins 統合

Issue #393で追加されたJenkinsジョブにより、PR Comment機能をJenkins UIから実行できます。

### 利用可能なジョブ

| ジョブ名 | 説明 | パラメータ数 |
|---------|------|-------------|
| **pr_comment_execute** | PRコメント自動対応（init + execute） | 14 |
| **pr_comment_finalize** | PRコメント解決処理（finalize） | 11 |

### PR Comment Execute ジョブ

PRから未解決コメントを取得し、AIエージェントで分析・処理します。

**パラメータ**:

| パラメータ | 説明 | 必須 | デフォルト |
|-----------|------|------|----------|
| `PR_URL` | 対象のPR URL（REPOS_ROOT配下のリポジトリを使用） | ✓ | - |
| `AGENT_MODE` | 使用するエージェント（auto/codex/claude） | | `auto` |
| `DRY_RUN` | プレビューモード | | `false` |
| `BATCH_SIZE` | 一度に処理するコメント数 | | `5` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | ✓ | - |

**非推奨パラメータ（後方互換性のみ）**:
| パラメータ | 説明 | 置き換え先 |
|-----------|------|-----------|
| `PR_NUMBER` | 対象のPR番号 | `PR_URL`を使用 |
| `GITHUB_REPOSITORY` | 対象リポジトリ（owner/repo形式） | `PR_URL`から自動解決 |

**ステージ構成**:
1. Load Common Library
2. Prepare Codex auth.json
3. Prepare Agent Credentials
4. Validate Parameters
5. Setup Environment
6. Setup Node.js Environment
7. **Check Resume**（新規追加） - メタデータの存在確認、`SHOULD_INIT` 環境変数を設定
8. **PR Comment Init**（条件分岐追加） - `SHOULD_INIT='true'` の場合のみ実行
9. PR Comment Analyze
10. PR Comment Execute

**リビルド時の動作**:
- **Check Resume** ステージでメタデータファイルの存在を確認
- メタデータが存在する場合は `SHOULD_INIT='false'` を設定し、PR Comment Init をスキップ
- メタデータが存在しない場合は `SHOULD_INIT='true'` を設定し、通常通り Init を実行

### PR Comment Finalize ジョブ

完了したコメントスレッドを解決し、メタデータをクリーンアップします。

**パラメータ**:

| パラメータ | 説明 | 必須 | デフォルト |
|-----------|------|------|----------|
| `PR_URL` | 対象のPR URL（REPOS_ROOT配下のリポジトリを使用） | ✓ | - |
| `DRY_RUN` | プレビューモード | | `false` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | ✓ | - |

Issue #462 により `PR_URL` パラメータは Jenkins の `nonStoredPasswordParam`（非保持パスワード）として定義されています。Jenkins UI 上ではマスク表示され、ビルド履歴にも値が残りませんので、Execute / Finalize ジョブを実行するたびに再入力してください。`nonStoredPasswordParam` のため、値自体は従来どおり実行時の環境変数として各ステージに渡されます。

**非推奨パラメータ（後方互換性のみ）**:
| パラメータ | 説明 | 置き換え先 |
|-----------|------|-----------|
| `PR_NUMBER` | 対象のPR番号 | `PR_URL`を使用 |
| `GITHUB_REPOSITORY` | 対象リポジトリ（owner/repo形式） | `PR_URL`から自動解決 |

**ステージ構成**:
1. Load Common Library
2. Validate Parameters
3. Setup Environment
4. Setup Node.js Environment
5. PR Comment Finalize

### 使用例

```
# 1. Jenkins UIで PR Comment Execute ジョブを実行
PR_URL: https://github.com/owner/target-repo/pull/123
AGENT_MODE: auto
DRY_RUN: false
GITHUB_TOKEN: ghp_xxx

# 2. 処理完了後、PR Comment Finalize ジョブを実行
PR_URL: https://github.com/owner/target-repo/pull/123
DRY_RUN: false
GITHUB_TOKEN: ghp_xxx
```

## マルチリポジトリサポート（Issue #407で追加）

`pr-comment`コマンドは、`--pr-url`オプションでマルチリポジトリ環境をサポートします。

### 従来の動作（`--pr`オプション）
- 現在のワーキングディレクトリでコマンドを実行
- `GITHUB_REPOSITORY`環境変数からリポジトリ情報を取得
- Jenkins環境では`ai-workflow-agent`リポジトリ内で動作してしまう問題

### 新機能（`--pr-url`オプション）
- PR URLからリポジトリ名を自動抽出
- `REPOS_ROOT`環境変数配下の対象リポジトリで動作
- Jenkins環境でクローンされた対象リポジトリを正しく使用

### 環境変数要件

**`REPOS_ROOT`環境変数**:
- Jenkins環境では`common.groovy`の`setupEnvironment()`で自動設定
- マルチリポジトリの親ディレクトリを指定
- 例: `/var/jenkins/repos`

**ディレクトリ構造例**:
```
$REPOS_ROOT/
├── ai-workflow-agent/  # ワークフローエージェント自体
├── target-repo/        # 対象リポジトリ
│   ├── .git/
│   ├── .ai-workflow/   # PRコメントメタデータが作成される
│   └── src/
└── other-repo/         # その他のリポジトリ
```

### パス解決の優先順位

1. **PR URL指定時**（`--pr-url`）:
   - `REPOS_ROOT/{リポジトリ名}`を優先使用
   - REPOS_ROOT未設定時はフォールバックパスを探索
   - 見つからない場合はエラーで終了

2. **PR番号指定時**（`--pr`、後方互換性）:
   - 現在のワーキングディレクトリを使用（従来動作維持）

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
| 1.1.0 | 2025-01-20 | Jenkins統合セクション追加（Issue #393） |
| 1.2.0 | 2025-12-14 | リビルド対応機能追加（Issue #426） - initスキップ機能、Jenkinsパイプラインのresume判定 |
| 1.3.0 | 2025-01-20 | analyze/execute分離（Issue #444） - executeがresponse-plan.jsonを使用、エージェント実行削除、コスト50%削減 |
| 1.4.0 | 2025-12-21 | finalize Git commit改善（Issue #458） - `.ai-workflow/pr-{number}/` の削除を `git add .` でステージし、`git status()` で空コミットを回避したうえで `[pr-comment] Finalize PR #${prNumber}: Clean up workflow artifacts (${resolvedCount} threads resolved)` というメッセージでコミット・プッシュ |
| 1.5.0 | 2025-01-21 | コミットスカッシュ機能追加（Issue #450） - `--squash` オプションで複数コミットを1つにまとめる機能、`init` で `base_commit` を記録、`--force-with-lease` による安全な強制プッシュ |
| 1.6.0 | 2025-01-22 | agent_log.mdのMarkdown化（Issue #441） - LogFormatterによる統一的なMarkdown形式でログ出力、可読性向上とフォーマット統一 |
| 1.7.0 | 2025-01-22 | executeコマンドでエージェントログをファイル保存（Issue #487） - 各コメント分析時のエージェント実行ログを `agent_log_comment_{comment_id}.md` として保存、Markdown形式、ドライランモード対応 |
| 1.8.0 | 2025-01-20 | スレッドコンテキストと承認パターン検出機能追加（Issue #615） - コメントを`thread_id`でグループ化し、「AI提案→ユーザー承認」パターンを`code_change`として正しく判定。`[AI Reply]`/`[User Comment]`ラベル付きでスレッド全体の文脈を考慮した分析を実行 |
