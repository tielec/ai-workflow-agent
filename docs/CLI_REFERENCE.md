## CLI の使用方法

CLI バイナリは `ai-workflow` です（ローカル実行時は `node dist/index.js`）。

### ワークフロー初期化
```bash
# Issue に対してワークフローを初期化（メタデータ、ブランチ、ドラフト PR を作成）
node dist/index.js init --issue-url <GITHUB_ISSUE_URL>

# カスタムブランチ名を指定（v0.2.0 で追加）
node dist/index.js init --issue-url <GITHUB_ISSUE_URL> --branch <BRANCH_NAME>

# ベースブランチを指定して分岐元を明示（v0.5.0、Issue #391 で追加）
node dist/index.js init --issue-url <GITHUB_ISSUE_URL> --base-branch main
```

**`--branch` オプション**:
- **未指定時**: デフォルトブランチ名 `ai-workflow/issue-{issue_number}` を使用
- **指定時**: カスタムブランチ名を使用（既存ブランチにも切り替え可能）
- **バリデーション**: Git 命名規則（空白不可、連続ドット不可、不正文字不可）に従う

**`--base-branch` オプション**（v0.5.0、Issue #391 で追加）:
- **未指定時**: 現在チェックアウトされているブランチから分岐（従来動作）
- **指定時**: 指定されたブランチにチェックアウト後、新規ブランチを作成
- **既存ブランチ優先**: リモート/ローカルブランチが既に存在する場合、`--base-branch` は無視される
- **バリデーション**: 存在しないブランチを指定するとエラー終了

**PR タイトル生成**（v0.3.0 で追加、Issue #73）:
- Issue タイトルを取得し、そのままPRタイトルとして使用
- Issue取得失敗時は従来の形式 `[AI-Workflow] Issue #<NUM>` にフォールバック
- 256文字を超えるタイトルは自動的に切り詰め（253文字 + `...`）

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

### ワークフロー言語設定（Issue #526で追加）

すべてのコマンドで `--language` オプションを使用して、ワークフローの出力言語を指定できます。

```bash
# 英語でワークフローを初期化
node dist/index.js init --issue-url <URL> --language en

# 日本語でワークフローを実行（デフォルト）
node dist/index.js execute --issue 123 --phase all --language ja

# 環境変数で言語を設定
export AI_WORKFLOW_LANGUAGE="en"
node dist/index.js execute --issue 123 --phase all
```

**優先順位**:
- CLI オプション `--language <ja|en>` が最優先
- 環境変数 `AI_WORKFLOW_LANGUAGE` は CLI 未指定時に使用
- メタデータ（`metadata.json` の `language` フィールド）
- デフォルト値 `ja`（日本語）

**実装モジュール**:
- **LanguageResolver** (`src/core/language-resolver.ts`): CLI・環境変数・メタデータを優先順位付きで解決する共通ヘルパー
- **Config.getLanguage()** (`src/core/config.ts`): 環境変数 `AI_WORKFLOW_LANGUAGE` からの取得とバリデーション
- **MetadataManager** (`src/core/metadata-manager.ts`): 言語設定の永続化/取得

### auto-close-issue コマンド（Issue #645）

GitHub Issue をエージェントが検品し、条件を満たすものを安全にクローズするコマンドです。デフォルトではドライランで実行され、`GITHUB_TOKEN` と `GITHUB_REPOSITORY`（`owner/repo` 形式）が必須です。作業ディレクトリは `REPOS_ROOT` を基に自動解決され、Codex/Claude がローカルワークツリーを参照します。

**主なオプションとデフォルト**:
- `--category followup|stale|old|all`（既定: `followup`）: `[FOLLOW-UP]` タイトル / 更新が `--days-threshold` 日以上 / 作成が `--days-threshold`×2 日以上 / すべて
- `--limit <1-50>`（既定: `10`）: 検品するIssue件数の上限
- `--dry-run`（既定: 有効）: クローズせずに判定のみ表示
- `--confidence-threshold <0.0-1.0>`（既定: `0.7`）: `close` 推奨がこの閾値未満ならスキップ
- `--days-threshold <number>`（既定: `90`）: `stale`/`old` 判定の経過日数（`old` は2倍）
- `--exclude-labels <labels>`（既定: `do-not-close,pinned`）: 付与されているIssueは検品対象外
- `--require-approval`（既定: 無効）: `close` 推奨時に `yes/no/skip` を対話確認
- `--agent auto|codex|claude`（既定: `auto`）: どのエージェントで検品/実行するかを指定

**使用例**:
```bash
# プレビュー実行（デフォルトのフォローアップ対象、ドライラン）
node dist/index.js auto-close-issue --category followup --limit 20

# Stale/Old を日数しきい値 120 日でまとめて確認（承認フロー付き）
node dist/index.js auto-close-issue \
  --category all \
  --days-threshold 120 \
  --confidence-threshold 0.8 \
  --require-approval

# Codex を固定し、特定ラベルを除外して実行
node dist/index.js auto-close-issue \
  --agent codex \
  --exclude-labels "security,do-not-close" \
  --dry-run
```

**安全運用のヒント**:
- まずドライランで確認し、`--require-approval` で手動確認を挟んでから本実行する
- プロジェクト固有の保護ラベル（例: `security`, `pinned`）を `--exclude-labels` で指定して誤クローズを防ぐ
- `GITHUB_REPOSITORY` と `REPOS_ROOT` の整合を事前にチェックし、誤ったリポジトリで動かさない

### rewrite-issue コマンド（Issue #669で追加）

リポジトリのコード文脈を参照して既存GitHub Issue本文を再設計し、差分プレビューを表示するコマンドです。デフォルトではdry-runモードで動作し、`--apply` オプションで実際にIssueを更新します。

```bash
# プレビューモード（デフォルト）: 差分を確認するのみ
node dist/index.js rewrite-issue --issue 123

# 英語で出力
node dist/index.js rewrite-issue --issue 123 --language en

# Claude エージェントを指定
node dist/index.js rewrite-issue --issue 123 --agent claude

# 実際にIssueを更新
node dist/index.js rewrite-issue --issue 123 --apply

# カスタム指示でリライト観点を指定（Issue #716で追加）
node dist/index.js rewrite-issue --issue 123 --custom-instruction "セキュリティ観点を重視してください"

# 初心者向けに書き直す
node dist/index.js rewrite-issue --issue 123 --custom-instruction "初心者でも理解しやすいように書き直してください" --apply

# すべてのオプションを組み合わせ
node dist/index.js rewrite-issue \
  --issue 456 \
  --language ja \
  --agent auto \
  --apply
```

**オプション**:
- `--issue <number>`: 対象Issue番号（**必須**）
- `--language <ja|en>`: 出力言語（デフォルト: `ja`）
- `--agent <auto|codex|claude>`: 使用エージェント（デフォルト: `auto`）
- `--dry-run`: プレビューモード（デフォルト動作、明示的に指定可能）
- `--apply`: 実際にIssueを更新（dry-runと排他）
- `--custom-instruction <text>`: リライトの追加指示（最大500文字、Issue #716で追加）

**`--custom-instruction` オプション**（Issue #716で追加）:
- **用途**: リライトの方向性や重点を指定する追加指示テキスト（最大500文字）
- **任意**: 未指定時は従来どおり汎用リライトを実行
- **バリデーション**: 空文字・空白のみは不可、500文字超過はエラー
- **使用例**:
  - `"セキュリティ観点を重視してください"` — セキュリティ脆弱性やリスクを明確化
  - `"パフォーマンス改善に焦点を当ててください"` — 性能ボトルネックや改善策を強調
  - `"初心者でも理解しやすいように書き直してください"` — 専門用語を減らし背景説明を追加

**主な機能**:
- **Issue情報取得**: GitHub APIを通じて現在のタイトル・本文を取得
- **リポジトリ文脈取得**: RepositoryAnalyzerを使用してコードベースの構造・主要ファイル・依存関係などのコンテキストを取得
- **Issue再生成**: AIエージェント（Codex/Claude）がコード文脈を踏まえた新しいタイトル・本文を生成
- **難易度・バグリスク自動付与**（Issue #712で追加）: 再設計後のIssue本文の先頭にYAML frontmatter形式で5段階難易度（A〜E）とバグリスク予測を自動付与。`DifficultyAnalyzer.analyzeWithGrade()` でLLM判定し、失敗時はfrontmatterなしで続行（グレースフルデグラデーション）
- **差分プレビュー**: 変更前後の差分をunified diff形式で標準出力に表示
- **採点指標表示**: 完全性スコア（0-100）と具体性スコア（0-100）を表示
- **Issue更新**: `--apply` オプション指定時に、GitHub APIを通じてIssueを更新

**出力例（dry-runモード）**:
```
========================================
  REWRITE-ISSUE PREVIEW (dry-run)
========================================

=== Title ===
- 旧タイトル
+ 新しいタイトル: 具体的な改善内容

=== Body ===
- 旧本文の行
+ 新本文の行（概要、現在の状況、提案内容などのセクションを含む）

========================================
  METRICS
========================================
  Completeness Score: 80/100
  Specificity Score:  70/100

To apply these changes, run with --apply option.
```

**環境変数**:
- `GITHUB_TOKEN`: GitHub Personal Access Token（Issue更新権限が必要）
- `GITHUB_REPOSITORY`: `owner/repo` 形式でリポジトリを指定

**frontmatter自動付与**（Issue #712で追加）:

`rewrite-issue` コマンド実行後、再設計されたIssue本文の先頭にYAML frontmatter形式で難易度・バグリスク情報が自動付与されます。

```yaml
---
difficulty: C
difficulty_label: moderate
bug_risk:
  expected_bugs: 2
  probability: 35
  risk_score: 0.70
rationale: |
  複数ファイルの変更が必要であり中程度の難易度と判定。
assessed_by: claude
assessed_at: 2025-01-15T10:30:00Z
---
```

| フィールド | 説明 |
|-----------|------|
| `difficulty` | 5段階グレード（A: trivial, B: simple, C: moderate, D: complex, E: critical） |
| `difficulty_label` | グレードに対応するラベル文字列 |
| `bug_risk.expected_bugs` | 想定バグ発生件数（0以上の整数） |
| `bug_risk.probability` | バグ発生確率（0〜100%） |
| `bug_risk.risk_score` | 総合リスクスコア（`expected_bugs * probability / 100`） |
| `rationale` | 判定根拠テキスト |
| `assessed_by` | 判定に使用したエージェント（`claude` / `codex`） |
| `assessed_at` | 判定日時（ISO 8601形式） |

- 難易度判定はClaude→Codex→デフォルト値（D/complex）の3段階フォールバックで動作します
- 判定失敗時はfrontmatterなしで既存フローを続行します（コマンド全体は正常完了）
- 既存の3段階難易度システム（`metadata.json`の`simple`/`moderate`/`complex`）には影響しません

**技術詳細**:
- **実装モジュール**: `src/commands/rewrite-issue.ts`
- **型定義**: `src/types/rewrite-issue.ts`
- **プロンプトテンプレート**: `src/prompts/rewrite-issue/{ja|en}/rewrite-issue.txt`
- **難易度判定プロンプト**: `src/prompts/difficulty/{ja|en}/analyze-grade.txt`（Issue #712で追加）
- **frontmatterユーティリティ**: `src/utils/frontmatter.ts`（Issue #712で追加）
- **IssueClient拡張**: `updateIssue()` メソッドでIssueのタイトル・本文を部分更新

**Jenkins統合**:

Jenkins環境では、`AI_Workflow/{develop,stable-1〜9}/rewrite_issue` ジョブとして実行できます。Jenkins UIパラメータとCLIオプションの対応：

| Jenkins パラメータ | CLI オプション | デフォルト値 |
|------------------|--------------|-------------|
| ISSUE_NUMBER | --issue | - (必須) |
| LANGUAGE | --language | ja |
| AGENT_MODE | --agent | auto |
| APPLY | --apply | true |
| DRY_RUN | - | true (CLIデフォルト動作) |
| CUSTOM_INSTRUCTION | --custom-instruction | - (任意) |

**パイプライン実行例**:
```
# Jenkins でパラメータ設定
ISSUE_NUMBER: 123
LANGUAGE: ja
AGENT_MODE: auto
APPLY: true (更新モード)

# 上記は以下のCLI実行と等価
node dist/index.js rewrite-issue --issue 123 --language ja --agent auto
```

**安全運用のヒント**:
- まずdry-run（デフォルト）で差分を確認し、問題がなければ `--apply` で更新する
- 重要なIssueは事前にバックアップ（コメント等で元の内容を保存）することを推奨
- `GITHUB_TOKEN` にはIssue更新権限（`repo` スコープ）が必要
- Jenkins実行時は、Docker エージェント内でリポジトリが自動クローンされます

### split-issue コマンド（Issue #715で追加）

複雑なGitHub Issueを機能単位で複数の子Issueに分割するコマンドです。AIエージェント（Codex/Claude）がIssueを分析し、各子Issueが独立して完結できる粒度に分割します。デフォルトではdry-runモードで動作し、`--apply` オプションで実際にIssueを作成します。

```bash
# プレビューモード（デフォルト: dry-run）
node dist/index.js split-issue --issue 123

# 実際にIssueを作成
node dist/index.js split-issue --issue 123 --apply

# 分割数の上限を5に制限
node dist/index.js split-issue --issue 123 --max-splits 5 --apply

# 英語出力・Claude指定
node dist/index.js split-issue --issue 123 --language en --agent claude --apply
```

**オプション**:
- `--issue <number>`: 分割対象のIssue番号（**必須**）
- `--language <ja|en>`: 出力言語（デフォルト: `ja`）
- `--agent <auto|codex|claude>`: 使用エージェント（デフォルト: `auto`）
- `--dry-run`: プレビューモード（デフォルト動作、明示的に指定可能）
- `--apply`: 実際にGitHub Issueを作成（dry-runと排他）
- `--max-splits <number>`: 分割Issueの最大数（デフォルト: `10`、範囲: 1〜20）

**主な機能**:
- **Issue情報取得**: GitHub APIを通じて対象Issueのタイトル・本文を取得
- **リポジトリ文脈取得**: RepositoryAnalyzerを使用してコードベースの構造情報を取得
- **機能単位分割**: AIエージェントが「1 Issue = 1 機能」の原則で分割を提案
- **工程分割の禁止**: 「要件定義」「実装」「テスト」のような工程単位での分割は行わない
- **プレビュー表示**: dry-runモードで分割結果のプレビュー（タイトル、本文抜粋、ラベル、優先度、品質メトリクス）を表示
- **子Issue一括作成**: `--apply` オプションで子Issueを逐次作成（GitHub APIレート制限対策）
- **元Issueへのコメント投稿**: 作成された子Issueへのリンク一覧を元Issueにコメントとして自動投稿
- **部分失敗許容**: 一部のIssue作成に失敗しても、成功した分は保持して処理を継続

**出力例（dry-runモード）**:
```
╔══════════════════════════════════════════════════════════════╗
║             SPLIT-ISSUE PREVIEW (dry-run)                   ║
╠══════════════════════════════════════════════════════════════╣

📋 分割概要: このIssueを3つの機能Issueに分割しました
📊 分割数: 3 件

────────────────────────────────────────────────────────────────
Issue #1: CLIオプションのパースとバリデーション機能
  本文: ## 概要 CLIオプションのパースとバリデーション機能を実装する...
  ラベル: enhancement
  優先度: high
────────────────────────────────────────────────────────────────

📈 METRICS
  Completeness: 85/100
  Specificity:  70/100

╚══════════════════════════════════════════════════════════════╝

💡 To apply these changes, run with --apply option.
```

**環境変数**:
- `GITHUB_TOKEN`: GitHub Personal Access Token（Issue作成・コメント投稿権限が必要）
- `GITHUB_REPOSITORY`: `owner/repo` 形式でリポジトリを指定

**技術詳細**:
- **実装モジュール**: `src/commands/split-issue.ts`
- **型定義**: `src/types/split-issue.ts`
- **プロンプトテンプレート**: `src/prompts/split-issue/{ja|en}/split-issue.txt`
- **IssueClient拡張**: `createMultipleIssues()` メソッドで子Issueを逐次作成
- **GitHubClientファサード**: `createMultipleIssues()` ファサードメソッドを追加

**安全運用のヒント**:
- まずdry-run（デフォルト）で分割プレビューを確認し、問題がなければ `--apply` で実行する
- `--max-splits` オプションで分割数を制限し、過度な分割を防ぐ
- 一部のIssue作成に失敗した場合、成功した子Issueの一覧がログに出力される
- 元Issueへのコメント投稿に失敗しても、子Issueの作成結果は保持される
- `GITHUB_TOKEN` にはIssue作成権限（`repo` スコープ）が必要

### create-sub-issue コマンド（Issue #713で追加）

親Issueに紐づくサブIssueをAIエージェント（Claude/Codex）で自動生成し、GitHub Sub-Issue APIを使って親子関係を紐づけるコマンドです。デフォルトではdry-runモードで動作し、`--apply` オプションで実際にIssueを作成します。

```bash
# プレビューモード（デフォルト: dry-run）
node dist/index.js create-sub-issue --parent-issue 123 --description "ログイン画面でエラーが発生する"

# 実際にIssueを作成してSub-Issue紐づけ
node dist/index.js create-sub-issue --parent-issue 123 --description "ログイン画面でエラーが発生する" --apply

# タスク種別を指定
node dist/index.js create-sub-issue --parent-issue 123 --description "リファクタリング対象" --type task --apply

# 英語出力・Claude指定
node dist/index.js create-sub-issue --parent-issue 123 --description "Fix login error" --language en --agent claude --apply

# カスタム指示とラベルを指定
node dist/index.js create-sub-issue --parent-issue 123 --description "パフォーマンス改善" --type enhancement --labels "priority:high,performance" --custom-instruction "レスポンス時間の改善に焦点を当ててください" --apply
```

**オプション**:
- `--parent-issue <number>`: 親Issue番号（**必須**）
- `--description <text>`: 不具合内容またはタスク概要（**必須**、1〜1000文字）
- `--type <bug|task|enhancement>`: Issue種別（デフォルト: `bug`）
- `--language <ja|en>`: 出力言語（デフォルト: `ja`）
- `--agent <auto|codex|claude>`: 使用エージェント（デフォルト: `auto`）
- `--dry-run`: プレビューモード（デフォルト動作、明示的に指定可能）
- `--apply`: 実際にGitHub Issueを作成（dry-runと排他）
- `--labels <labels>`: カンマ区切りのラベル一覧（エージェント提案ラベルと統合）
- `--custom-instruction <text>`: 生成時の追加指示（最大500文字）

**主な機能**:
- **親Issue情報取得**: GitHub APIを通じて親Issueのタイトル・本文を取得
- **リポジトリ文脈取得**: RepositoryAnalyzerを使用してコードベースの構造情報を取得
- **AI本文生成**: AIエージェント（Claude/Codex）が親Issueの文脈とユーザー入力からサブIssue本文を自動生成
- **Sub-Issue紐づけ**: GitHub Sub-Issue API（`POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`）で親子関係を紐づけ
- **フォールバック機構**: Sub-Issue APIが利用できない場合、子Issue本文に `Parent issue: #<number>` を追記し、親Issueにリンクコメントを投稿
- **プレビュー表示**: dry-runモードで生成結果のプレビュー（タイトル、本文抜粋、ラベル、品質メトリクス）を表示
- **親Issueへの通知コメント**: apply時に親Issueへ `🔗 Sub-issue #<number> created: <title>` 形式のコメントを自動投稿
- **部分失敗許容**: コメント投稿に失敗しても、Issue作成結果は保持して処理を継続

**出力例（dry-runモード）**:
```
========================================
  [Dry-Run] Sub-Issue Preview for Parent Issue #123
========================================

Parent Issue: #123 - 親Issueのタイトル

--- Sub-Issue ---
Title: ログイン画面のエラーハンドリング改善
Body: ## 概要 ログイン画面でエラーが発生した場合の処理を改善する...
Labels: bug

METRICS
  Completeness: 85/100
  Specificity:  90/100

Run with --apply to create this sub-issue on GitHub.
```

**環境変数**:
- `GITHUB_TOKEN`: GitHub Personal Access Token（Issue作成・Sub-Issue紐づけ・コメント投稿権限が必要）
- `GITHUB_REPOSITORY`: `owner/repo` 形式でリポジトリを指定

**技術詳細**:
- **実装モジュール**: `src/commands/create-sub-issue.ts`
- **型定義**: `src/types/create-sub-issue.ts`
- **プロンプトテンプレート**: `src/prompts/create-sub-issue/{ja|en}/create-sub-issue.txt`
- **IssueClient拡張**: `addSubIssue()` メソッドでGitHub Sub-Issue APIを呼び出し
- **GitHubClientファサード**: `addSubIssue()` ファサードメソッドを追加

**安全運用のヒント**:
- まずdry-run（デフォルト）で生成結果を確認し、問題がなければ `--apply` で実行する
- `--custom-instruction` オプションで生成の方向性を細かく制御できる
- Sub-Issue API が利用できない環境でも、フォールバックにより親子関係の参照情報が保持される
- `GITHUB_TOKEN` にはIssue作成権限（`repo` スコープ）が必要

### 認証情報の検証（validate-credentials コマンド）

ワークフロー実行前に、すべての認証情報とAPIの疎通を確認するコマンドです。

```bash
# すべてのカテゴリを検証
node dist/index.js validate-credentials --check all

# 特定のカテゴリのみ検証
node dist/index.js validate-credentials --check codex
node dist/index.js validate-credentials --check claude

# JSON形式で出力
node dist/index.js validate-credentials --check all --output json

# 詳細ログを有効化
node dist/index.js validate-credentials --check all --verbose

# 失敗時にビルドを失敗させる（CI/CD用）
node dist/index.js validate-credentials --check all --exit-on-error
```

**検証カテゴリ（`--check` オプション）**:
- `all`: すべてのカテゴリを検証（デフォルト）
- `git`: Git 設定（ユーザー名、メールアドレス）
- `github`: GitHub 認証（トークン、スコープ、レート制限）
- `codex`: Codex 認証とエージェント疎通
- `claude`: Claude Code 認証とエージェント疎通
- `openai`: OpenAI API キー
- `anthropic`: Anthropic API キー

**認証情報の設定パターン**:

| カテゴリ | 認証方法A | 認証方法B | 疎通チェック |
|---------|----------|----------|------------|
| **Codex** | `~/.codex/auth.json` ファイル | `CODEX_API_KEY` 環境変数 | どちらか一方があれば実行 |
| **Claude** | `CLAUDE_CODE_OAUTH_TOKEN` | `CLAUDE_CODE_API_KEY` | どちらか一方があれば実行 |

**重要**: 疎通チェックは、どちらか一方の認証情報があれば実行されます。

**Codex の動作**:
- ✅ `~/.codex/auth.json` のみ: ファイル存在確認 → JSON形式検証 → エージェント疎通（"ping" プロンプト実行）
- ✅ `CODEX_API_KEY` のみ: APIキー確認 → エージェント疎通（"ping" プロンプト実行）
- ✅ 両方あり: ファイル + APIキーの両方を確認 → エージェント疎通
- ❌ 両方なし: 認証失敗（`status: failed`）

**Claude の動作**:
- ✅ `CLAUDE_CODE_OAUTH_TOKEN` のみ: OAuth トークン確認 → エージェント疎通（"ping" プロンプト実行）
- ✅ `CLAUDE_CODE_API_KEY` のみ: APIキー確認 → エージェント疎通（"ping" プロンプト実行）
- ✅ 両方あり: OAuth（優先） + APIキー → エージェント疎通
- ❌ 両方なし: 認証失敗（`status: failed`）

**疎通チェックの実装**:
- `CodexAgentClient` / `ClaudeAgentClient` を再利用（execute コマンドと同じロジック）
- 軽量プロンプト（"ping"）を `maxTurns: 1` で実行
- タイムアウト: 30秒（Docker環境での初回起動を考慮）
- 詳細ログ: 有効（Jenkins環境でのデバッグのため `verbose: true`）

**出力例（JSON形式）**:
```json
{
  "timestamp": "2026-01-08T10:30:00.000Z",
  "results": {
    "codex": {
      "status": "passed",
      "checks": [
        { "name": "Codex Auth File", "status": "passed", "value": "/root/.codex/auth.json" },
        { "name": "JSON Format", "status": "passed", "message": "Valid JSON format" },
        { "name": "CODEX_API_KEY", "status": "skipped", "message": "Not set (using auth file)" },
        { "name": "Codex API", "status": "passed", "message": "Codex agent responded successfully" }
      ]
    },
    "claude": {
      "status": "passed",
      "checks": [
        { "name": "CLAUDE_CODE_OAUTH_TOKEN", "status": "passed", "value": "sess****" },
        { "name": "CLAUDE_CODE_API_KEY", "status": "skipped", "message": "Not set (using OAuth token)" },
        { "name": "Claude API", "status": "passed", "message": "Claude agent responded successfully" }
      ]
    }
  },
  "summary": {
    "total": 8,
    "passed": 6,
    "failed": 0,
    "warnings": 0,
    "skipped": 2
  }
}
```

### プロンプト/テンプレートの配置（多言語化）

- プロンプトはフェーズ/コマンド別に `src/prompts/{phase|category}/{lang}/*.txt`（`ja`/`en`）へ配置。auto-issue, pr-comment, rollback, difficulty, followup, squash, content_parser, validation も同パターンで揃えています。
- PR 本文テンプレートは `src/templates/{lang}/pr_body*_template.md` に分割。`PromptLoader` が `config.getLanguage()` を参照し、指定言語が無い場合はデフォルト（`ja`）へフォールバックします。
- すべてのプロンプトには言語別の明示的な出力指示を含めます（英語: `**IMPORTANT: Write all document content in English. All sections, descriptions, and explanations must be in English.**` / 日本語: `**重要: すべてのドキュメント内容を日本語で記述してください。すべてのセクション、説明、解説は日本語で書いてください。**`）。タイトルがあるプロンプトはタイトル直下（空行を挟んで）に、タイトルが無いプロンプトはファイル先頭に配置します。

### Codex モデル選択（Issue #302で追加）

Codex エージェントは `gpt-5.2-codex` をデフォルトで使用しますが、CLI オプションまたは環境変数でモデルを切り替えられます。`resolveCodexModel()`（`src/core/codex-agent-client.ts`）がエイリアスを大文字・小文字を区別せずに解決し、未指定時は `DEFAULT_CODEX_MODEL` にフォールバックします。

```bash
# CLI オプションでエイリアスを指定
node dist/index.js execute --issue 302 --phase implementation --codex-model mini

# 環境変数でデフォルト値を切り替え（CLI指定があればそちらを優先）
export CODEX_MODEL=legacy
node dist/index.js execute --issue 302 --phase documentation
```

**優先順位**:
- CLI オプション `--codex-model <alias|model>` が最優先
- 環境変数 `CODEX_MODEL=<alias|model>` は CLI 未指定時に使用
- どちらも未指定の場合は `gpt-5.2-codex` を使用

**モデルエイリアス**（`CODEX_MODEL_ALIASES` 定数で定義）:

| エイリアス | 実際のモデルID | 用途 |
|-----------|---------------|------|
| `max` | `gpt-5.2-codex` | **デフォルト**。長時間・高負荷タスク向け |
| `mini` | `gpt-5.1-codex-mini` | 軽量／コスト重視の検証タスク |
| `5.1` | `gpt-5.1` | 汎用プロンプト向け |
| `legacy` | `gpt-5-codex` | 旧デフォルトとの後方互換性 |

フルモデルIDを指定した場合はエイリアス解決をスキップしてそのまま渡されるため、新しい Codex リリースにも即応できます。`legacy` エイリアスを使えば既存の `gpt-5-codex` 固定ワークフローを破壊せずに動作確認が可能です。

**補足**: ChatGPT アカウントで Codex CLI（`CODEX_AUTH_JSON` など）を使うと `gpt-4o`/`gpt-4o-mini` は非対応になるため、`resolveCodexModel()` では非対応モデルや未指定値が渡された際に `DEFAULT_CODEX_MODEL`（`gpt-5.2-codex`）へ安全にフォールバックします。`--codex-model` や `CODEX_MODEL` では上記エイリアスまたはフルモデル名を使って ChatGPT 対応モデルを明示的に指定してください。詳細やトラブルシュートは `TROUBLESHOOTING.md` の該当セクションを確認してください。

### モデル自動選択機能（Issue #363で追加）

Issue の難易度に基づいて、各フェーズ・ステップで使用するモデルを自動的に最適化する機能です。

```bash
# init 時に --auto-model-selection を指定
node dist/index.js init \
  --issue-url https://github.com/owner/repo/issues/123 \
  --auto-model-selection

# execute は通常通り実行（モデルが自動選択される）
node dist/index.js execute --issue 123 --phase all
```

**実装モジュール**:
- **DifficultyAnalyzer** (`src/core/difficulty-analyzer.ts`): Issue情報（タイトル、本文、ラベル）を LLM で分析し、難易度（`simple` / `moderate` / `complex`）を判定。Claude Sonnet（プライマリ）/ Codex Mini（フォールバック）で分析を実行。
- **ModelOptimizer** (`src/core/model-optimizer.ts`): 難易度×フェーズ×ステップのマッピングに基づいてモデルを解決。CLI/ENV オーバーライドをサポート。

**難易度別モデルマッピング**:

- `simple`: 全フェーズで execute/review/revise ともに Sonnet/Mini
- `moderate`:
  - planning / requirements / design / test_scenario / evaluation: execute=Opus/Max, review=Sonnet/Mini, revise=Sonnet/Mini
  - implementation / test_implementation / testing: execute=Opus/Max, review=Sonnet/Mini, revise=Opus/Max
  - documentation / report: execute/review/revise ともに Sonnet/Mini
- `complex`: 全フェーズで execute/revise が Opus/Max、review が Sonnet/Mini

**重要**: `review` ステップは難易度に関係なく常に軽量モデルを使用（コスト最適化）。

**モデル選択優先順位**:
1. CLI オプション（`--codex-model`, `--claude-model`）
2. 環境変数（`CODEX_MODEL`, `CLAUDE_MODEL`）
3. metadata.json の `model_config`（`--auto-model-selection` で生成）
4. デフォルトマッピング

※ review ステップは常に軽量モデル固定のため、CLI/ENV で指定したモデルは review には適用されません。

**metadata.json 構造**:
```json
{
  "difficulty_analysis": {
    "level": "moderate",
    "confidence": 0.85,
    "factors": {
      "estimated_file_changes": 6,
      "scope": "single_module",
      "requires_tests": true,
      "requires_architecture_change": false,
      "complexity_score": 0.62
    },
    "analyzed_at": "2025-01-20T10:30:00Z",
    "analyzer_agent": "claude",
    "analyzer_model": "sonnet"
  },
  "model_config": {
    "planning": {
      "execute": { "claudeModel": "opus", "codexModel": "max" },
      "review": { "claudeModel": "sonnet", "codexModel": "mini" },
      "revise": { "claudeModel": "sonnet", "codexModel": "mini" }
    },
    "implementation": {
      "execute": { "claudeModel": "opus", "codexModel": "max" },
      "review": { "claudeModel": "sonnet", "codexModel": "mini" },
      "revise": { "claudeModel": "opus", "codexModel": "max" }
    }
  }
}
```

**後方互換性**: `--auto-model-selection` 未指定時は従来動作（全ステップで Opus/Max）を維持。

### フェーズ差し戻し（v0.4.0、Issue #90で追加）
```bash
# ワークフローを前のフェーズに差し戻し（直接理由を指定）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --reason "差し戻し理由"

# ファイルから差し戻し理由を読み込む
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --reason-file /path/to/reason.md

# インタラクティブモード（標準入力から理由を入力）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase <PHASE_NAME> \
  --interactive

# 特定のステップへの差し戻し（revise ステップから再開）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase implementation \
  --to-step revise \
  --reason "レビューコメントの修正が必要"

# ドライラン（実際には差し戻さず、変更内容のみ確認）
node dist/index.js rollback \
  --issue <NUM> \
  --to-phase implementation \
  --reason "テスト用" \
  --dry-run
```

**主な機能**:
- **3つの入力方法**: `--reason`（直接指定）、`--reason-file`（ファイル）、`--interactive`（標準入力）
- **メタデータ自動更新**: 差し戻し先フェーズを `in_progress` に、後続フェーズを `pending` にリセット
- **差し戻し履歴記録**: `metadata.json` の `rollback_history` 配列に履歴を保存
- **プロンプト自動注入**: 差し戻し先フェーズの `revise` ステップで差し戻し理由が自動的にプロンプトに注入
- **ROLLBACK_REASON.md生成**: 差し戻し理由を記録したMarkdownファイルを自動生成

**オプション**:
- `--to-step <step>`: 差し戻し先のステップ（`execute` | `review` | `revise`、デフォルト: `revise`）
- `--from-phase <phase>`: 差し戻し元のフェーズ（省略時は現在の最新完了フェーズ）
- `--force`: 確認プロンプトをスキップ
- `--dry-run`: 実際には差し戻さず、変更内容のみを表示

### Rollback Auto モード（v0.4.0、Issue #271で追加）

```bash
# 基本的な使用方法（AIエージェントが差し戻し判定）
node dist/index.js rollback-auto --issue <NUM>

# プレビューモード（差し戻し判定のみ、実際には実行しない）
node dist/index.js rollback-auto --issue <NUM> --dry-run

# 高信頼度判定時は確認をスキップ
node dist/index.js rollback-auto --issue <NUM> --force

# 使用するエージェントを指定
node dist/index.js rollback-auto --issue <NUM> --agent codex
node dist/index.js rollback-auto --issue <NUM> --agent claude
```

**主な機能**:
- **自動状態分析**: `metadata.json`、review results、test results を自動収集して分析
- **AI エージェントによる判定**:
  - 差し戻しが必要かどうかを判定（`needs_rollback: true/false`）
  - 差し戻しが必要な場合、適切な差し戻し先フェーズとステップを提案
  - 判定理由と分析結果を詳細に説明
  - 判定の信頼度（`high` / `medium` / `low`）を提供
- **信頼度ベースの確認**:
  - `confidence: high` かつ `--force` 指定時: 確認プロンプトをスキップして自動実行
  - `confidence: medium/low`: 常に確認プロンプトを表示（安全性重視）
- **既存 rollback との統合**: 差し戻し実行時は既存の `executeRollback()` を再利用

**オプション**:
- `--issue <number>`: 対象のIssue番号（必須）
- `--dry-run`: プレビューモード（差し戻し判定のみ、実際には実行しない）
- `--force`: 高信頼度判定時は確認をスキップ（`confidence: high` の場合のみ有効）
- `--agent <mode>`: 使用するエージェント（`auto` | `codex` | `claude`、デフォルト: `auto`）

**技術詳細**:
- **実装**: `src/commands/rollback.ts` の `handleRollbackAutoCommand()` 関数
- **プロンプトテンプレート**: `src/prompts/rollback/auto-analyze.txt`
- **JSON パース**: 3つのフォールバックパターン（Markdown code block → Plain JSON → Bracket search）
- **バリデーション**: `validateRollbackDecision()` で厳格な型チェック
- **コンテキスト収集**: `findLatestReviewResult()`, `findLatestTestResult()` でreview/test結果を自動探索

### ワークフローログの手動クリーンアップ（v0.4.0、Issue #212で追加）
```bash
# 基本的な使用方法（Phase 0-8のログをクリーンアップ）
node dist/index.js cleanup --issue <NUM>

# プレビューモード（削除対象のみ表示、実際には削除しない）
node dist/index.js cleanup --issue <NUM> --dry-run

# 特定のフェーズ範囲をクリーンアップ（数値範囲）
node dist/index.js cleanup --issue <NUM> --phases 0-4

# 特定のフェーズ範囲をクリーンアップ（フェーズ名リスト）
node dist/index.js cleanup --issue <NUM> --phases planning,requirements,design

# 完全クリーンアップ（Phase 0-9すべて、Evaluation Phase完了後のみ）
node dist/index.js cleanup --issue <NUM> --all
```

### ワークフロー完了後の最終処理（v0.5.0、Issue #261で追加）
```bash
# 基本的な使用方法（全5ステップを実行）
node dist/index.js finalize --issue <NUM>

# ドライラン（プレビューモード）
node dist/index.js finalize --issue <NUM> --dry-run

# コミットスカッシュをスキップ
node dist/index.js finalize --issue <NUM> --skip-squash

# PR更新とドラフト解除をスキップ
node dist/index.js finalize --issue <NUM> --skip-pr-update

# マージ先ブランチを変更（デフォルト: main）
node dist/index.js finalize --issue <NUM> --base-branch develop
```

**主な機能**:
- **5ステップの統合実行**: ワークフロー完了後の最終処理を1コマンドで実行
  - Step 1: base_commit をメタデータから取得・一時保存
  - Step 2: .ai-workflow/issue-{NUM}/ ディレクトリ全体を削除 + Git コミット＆プッシュ
  - Step 3: base_commit から HEAD までのコミットをスカッシュ（AI生成メッセージ付与）
  - Step 4: PR 本文を最終版に更新、マージ先ブランチを変更（オプション）
  - Step 5: PR ドラフトを解除し、Ready for Review 状態に変更
- **責務の明確化**: スカッシュ処理を execute コマンドから分離し、finalize コマンドに集約
- **PR準備の自動化**: ドラフト解除とマージ先ブランチ変更を自動化
- **柔軟な実行制御**: `--skip-squash`、`--skip-pr-update` オプションで柔軟なステップスキップが可能

**オプション**:
- `--issue <number>`: 対象のIssue番号（必須）
- `--dry-run`: プレビューモード（実際には実行せず、実行内容を表示）
- `--skip-squash`: Step 3（コミットスカッシュ）をスキップ
- `--skip-pr-update`: Step 4-5（PR更新・ドラフト解除）をスキップ
- `--base-branch <branch>`: PRのマージ先ブランチ（デフォルト: `main`）

**主な機能**:
- **通常クリーンアップ**: Phase 0-8のワークフローログを削除（`execute/`, `review/`, `revise/` ディレクトリ）
- **部分クリーンアップ**: `--phases` オプションで指定したフェーズ範囲のみを削除
- **完全クリーンアップ**: `--all` オプションでPhase 0-9すべてのログを削除（Evaluation Phase完了後のみ可能）
- **プレビューモード**: `--dry-run` で削除対象を確認してから実行可能
- **Git 自動コミット**: クリーンアップ後に変更を自動コミット＆プッシュ（コミットメッセージ: `[ai-workflow] Manual cleanup of workflow logs (Phase 0-8)`）
- **セキュリティ**: パス検証とシンボリックリンクチェックにより、安全な削除を保証

**削除対象と保持対象**:
- **削除**: 各フェーズディレクトリ内の `execute/`, `review/`, `revise/` ディレクトリとそのすべてのファイル
- **保持**: `metadata.json`（ワークフロー状態）、`output/*.md`（成果物ドキュメント）

**オプション**:
- `--issue <number>`: 対象のIssue番号（必須）
- `--dry-run`: プレビューモード（削除対象のみ表示、実際には削除しない）
- `--phases <range>`: クリーンアップするフェーズ範囲
  - 数値範囲: `0-4`、`5-7`
  - フェーズ名リスト（カンマ区切り）: `planning,requirements,design`
- `--all`: 完全クリーンアップ（Phase 0-9すべて）
  - Evaluation Phase（Phase 9）が `completed` 状態の場合のみ実行可能

**クリーンアップモード**:
- **通常**（デフォルト）: Phase 0-8のログを削除、約75%のリポジトリサイズ削減
- **部分**（`--phases`）: 指定範囲のみを削除、範囲に応じて削減効果が変動
- **完全**（`--all`）: Phase 0-9すべてのログを削除、Evaluation完了後のみ実行可能

**使用例**:
```bash
# プレビューモードで削除対象を確認
node dist/index.js cleanup --issue 212 --dry-run

# Phase 0-8 のログをクリーンアップ（約75%削減）
node dist/index.js cleanup --issue 212

# Planning と Requirements のみクリーンアップ
node dist/index.js cleanup --issue 212 --phases planning,requirements

# Phase 0-4 のログをクリーンアップ
node dist/index.js cleanup --issue 212 --phases 0-4

# Evaluation Phase 完了後に完全クリーンアップ
node dist/index.js cleanup --issue 212 --all
```

**Report Phase自動クリーンアップとの関係**:
- Report Phase（Phase 8）完了時に自動クリーンアップが実行される（Phase 0-8のログを削除）
- `cleanup` コマンドは自動クリーンアップとは独立して任意のタイミングで実行可能
- 自動クリーンアップ後に再度 `cleanup` コマンドを実行しても、削除対象がなければスキップされる
- `--phases` オプションで特定のフェーズのみをクリーンアップする場合は、自動クリーンアップとは独立して動作

### フォローアップIssue生成オプション（v0.5.0、Issue #119で追加）
```bash
# OpenAIを使用してフォローアップIssueのタイトル/本文を生成
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode openai \
  --followup-llm-model gpt-4o-mini \
  --followup-llm-append-metadata

# Claudeを使用してフォローアップIssueを生成
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode claude \
  --followup-llm-model claude-sonnet-4-5

# LLM生成を無効化（既存テンプレートを使用）
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode off
```

**主な機能**:
- **LLM統合**: OpenAI（gpt-4o-mini）またはAnthropic（claude-sonnet-4-5）を使用してフォローアップIssueのタイトル/本文を生成
- **自動フォールバック**: LLM呼び出し失敗時は既存テンプレートへ自動的にフォールバック
- **セキュリティ**: プロンプト送信前にシークレット（APIキー、メールアドレス、トークン）を自動マスキング
- **リトライ制御**: 指数バックオフ戦略で最大3回までリトライ
- **メタデータ記録**: 生成元プロバイダ、モデル、実行時間、リトライ回数、トークン使用量を記録

**オプション**:
- `--followup-llm-mode <mode>`: LLMプロバイダ（`auto` | `openai` | `claude` | `off`、デフォルト: `off`）
- `--followup-llm-model <model>`: 使用モデル（`gpt-4o-mini` | `claude-sonnet-4-5` 等）
- `--followup-llm-timeout <ms>`: タイムアウト（ミリ秒、デフォルト: 30000）
- `--followup-llm-max-retries <count>`: 最大リトライ回数（デフォルト: 3）
- `--followup-llm-append-metadata`: Issue本文末尾に生成メタデータを追記

**環境変数**:
- `FOLLOWUP_LLM_MODE`: LLMプロバイダ（CLI引数より優先度低）
- `FOLLOWUP_LLM_MODEL`: 使用モデル
- `OPENAI_API_KEY`: OpenAI APIキー（`--followup-llm-mode openai` 使用時に必須）
- `ANTHROPIC_API_KEY`: Anthropic APIキー（`--followup-llm-mode claude` 使用時に必須）

**生成品質要件**:
- タイトル: 50〜80文字の日本語タイトル
- 本文: 5つの必須セクション（背景、実行内容、テスト、注意事項、参考情報）を含むMarkdown形式
- バリデーション: タイトル長、セクション存在チェック、最小文字数検証

### 自動バグ・リファクタリング検出＆Issue生成（v0.5.0、Issue #126/#127で追加）
```bash
# リポジトリのバグを自動検出してGitHub Issueを生成
node dist/index.js auto-issue

# リファクタリング機会を検出してGitHub Issueを生成
node dist/index.js auto-issue --category refactor

# 機能拡張提案を検出してGitHub Issueを生成
node dist/index.js auto-issue --category enhancement

# 創造的な機能拡張提案を検出してGitHub Issueを生成（--creative-modeオプション）
node dist/index.js auto-issue --category enhancement --creative-mode

# プレビューモード（Issue生成せず、検出結果のみ表示）
node dist/index.js auto-issue --dry-run

# 検出数を制限（最大5件のIssueを生成）
node dist/index.js auto-issue --limit 5

# 類似度閾値を調整（より厳格な重複判定、バグ検出時のみ有効）
node dist/index.js auto-issue --similarity-threshold 0.85

# カスタム指示で分析観点を追加（Issue #380で追加）
node dist/index.js auto-issue --custom-instruction "N+1クエリを重点的に検出してください"

# すべてのオプションを組み合わせ
node dist/index.js auto-issue \
  --category bug \
  --limit 10 \
  --dry-run \
  --similarity-threshold 0.8 \
  --agent codex \
  --custom-instruction "セキュリティ脆弱性を優先的に検出"
```

**カスタム指示オプション**（Issue #380で追加）:
- `--custom-instruction <text>`: 分析時の追加指示を指定（最大500文字）
- 分析の重点や観点をカスタマイズ可能
- 安全性検証により危険な指示（ファイル削除、Git操作、自動修正など）は自動ブロック
- 許可される指示例: 「N+1クエリを重点的に検出」「セキュリティ脆弱性を優先」「エラーハンドリングを詳細に調査」
- ブロックされる指示例: 「ファイルを削除」「バグを自動修正」「commitして」

**主な機能**:
- **RepositoryAnalyzer**: コードベース全体を自動分析し、潜在的なバグ、リファクタリング機会、機能拡張提案を検出（30+ 言語サポート、Issue #144で汎用化）
  - **バグ検出**（`analyzeForBugs`）: 潜在的なバグ、エラーハンドリング不足、null参照など
  - **リファクタリング検出**（`analyzeForRefactoring`）: 6種類のリファクタリングタイプ（large-file, large-function, high-complexity, duplication, unused-code, missing-docs）
  - **機能拡張提案**（`analyzeForEnhancements`）: 6種類の拡張タイプ（improvement, integration, automation, dx, quality, ecosystem）、--creative-modeオプション対応
- **IssueDeduplicator**: 2段階の重複検出アルゴリズム（バグ検出時のみ有効）
  - Stage 1: コサイン類似度による高速フィルタリング（TF-IDF ベクトル化）
  - Stage 2: LLM による意味的類似性の判定
- **IssueGenerator**: 検出されたバグ、リファクタリング機会、または機能拡張提案から自動的にGitHub Issueを作成
  - **バグIssue**（`generate`）: エージェント生成の詳細な説明と修正提案
  - **リファクタリングIssue**（`generateRefactorIssue`）: テンプレートベースの定型Issue（概要、推奨改善策、アクションアイテム）
  - **機能拡張Issue**（`generateEnhancementIssue`）: エージェント生成の詳細な提案（根拠、実装ヒント、期待される効果、工数見積もり）
    - `auto-issue --category enhancement` の Issue #485 修正により、Writeツールで `{output_file_path}` に JSON を書き出すようになり、バグ/リファクタリング検出と同様に Jenkins 等から JSON を収集できます

**リポジトリパス解決**（Issue #153で修正）:
- `GITHUB_REPOSITORY` 環境変数から対象リポジトリを自動解決
- `REPOS_ROOT` が設定されている場合、優先的に使用（Jenkins環境では必須）
- `REPOS_ROOT` 未設定時はフォールバック候補パス（`~/TIELEC/development/{repo}`、`~/projects/{repo}`、`../{repo}`）を探索
- リポジトリが見つからない場合、明確なエラーメッセージを表示し、`REPOS_ROOT` 設定またはJenkinsfile確認を促す

**Issue #592 対応**:
- SecretMasker は Unix パス内の長いディレクトリ名を `[REDACTED_TOKEN]` にマスクしないようになり、ログ出力に含まれるリポジトリパスが保持されることで Claude/Codex が working directory を正しく決定できるようになりました。
- `working-directory-resolver.ts` は REPOS_ROOT との整合性チェックと前後の存在確認ログを追加しており、REPOS_ROOT 外に解決すると `[Issue #592 Warning] Resolved path (...) is outside REPOS_ROOT (...)` のような警告を出すので、ログから設定やマスキングの問題を検証できます。

**オプション**:
- `--category <type>`: 検出するIssueの種類（`bug` | `refactor` | `enhancement` | `all`、デフォルト: `bug`）
  - **Phase 1 (Issue #126)**: `bug`（バグ検出とIssue生成）
  - **Phase 2 (Issue #127)**: `refactor`（リファクタリング機会検出とIssue生成）
    - 6種類のリファクタリングタイプをサポート
    - 優先度による自動ソート（high → medium → low）
    - 重複除外は実行されません
  - **Phase 3 (Issue #128)**: `enhancement`（機能拡張提案とIssue生成）
    - 6種類の拡張タイプをサポート（improvement, integration, automation, dx, quality, ecosystem）
    - 優先度（expected_impact）による自動ソート（high → medium → low）
    - 重複除外は実行されません
    - `--creative-mode` オプションで実験的・創造的な提案を有効化
- `--limit <number>`: 生成するIssueの最大数（デフォルト: 無制限）
- `--dry-run`: プレビューモード（Issue生成せず、検出結果のみ表示）
- `--similarity-threshold <0.0-1.0>`: 重複判定の類似度閾値（デフォルト: 0.75、バグ検出時のみ有効）
- `--agent <mode>`: 使用するAIエージェント（`auto` | `codex` | `claude`）
- `--creative-mode`: 創造的・実験的な提案を有効化（`enhancement` カテゴリのみ有効）
  - より野心的で革新的な機能拡張アイデアを生成
  - 実験的な統合やエコシステム改善の提案を含む

**サポート対象言語**（v0.5.1、Issue #144で汎用化）:

| カテゴリ | 言語/ファイル |
|---------|--------------|
| **スクリプト言語** | JavaScript (.js, .jsx, .mjs), TypeScript (.ts, .tsx), Python (.py), Ruby (.rb), PHP (.php), Perl (.pl), Shell (.sh, .bash) |
| **コンパイル言語** | Go (.go), Java (.java), Kotlin (.kt), Rust (.rs), C (.c, .h), C++ (.cpp, .hpp), C# (.cs), Swift (.swift) |
| **JVM言語** | Groovy (.groovy), Scala (.scala) |
| **CI/CD設定** | Jenkinsfile, Dockerfile, Makefile |
| **設定/データ** | YAML (.yml, .yaml), JSON (.json), TOML (.toml), XML (.xml) |
| **IaC** | Terraform (.tf), CloudFormation (.template) |

**除外パターン**:
- **ディレクトリ**: `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `coverage/`, `.next/`, `.nuxt/`
- **生成ファイル**: `*.min.js`, `*.bundle.js`, `*.generated.*`, `*.g.go`, `*.pb.go`, `*.gen.ts`
- **ロックファイル**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `poetry.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, `composer.lock`
- **バイナリ**: `.exe`, `.dll`, `.so`, `.dylib`, `.a`, `.lib`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.svg`, `.webp`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.zip`, `.tar`, `.gz`, `.bz2`, `.7z`, `.rar`, `.mp3`, `.mp4`, `.avi`, `.mov`, `.mkv`, `.woff`, `.woff2`, `.ttf`, `.eot`

**現在の実装状況**:
- ✅ **Phase 1 (Issue #126)**: `bug` カテゴリ（バグ検出とIssue生成）
- ✅ **Phase 2 (Issue #127)**: `refactor` カテゴリ（リファクタリング機会検出とIssue生成）
- ✅ **Phase 3 (Issue #128)**: `enhancement` カテゴリ（機能拡張提案とIssue生成）
- ⏳ **Phase 4**: `all` カテゴリ（将来実装予定）

### InstructionValidator の動作と環境変数（Issue #655）

- **エージェント優先順**: `codex-agent (mini) → claude-agent (haiku) → OpenAI gpt-4o-mini → pattern` の順で検証し、使用した経路は `validationMethod` に記録されます。
- **必要な認証情報**: `CODEX_API_KEY` または `~/.codex/auth.json` があれば Codex が有効、`CLAUDE_CODE_OAUTH_TOKEN` もしくは `CLAUDE_CODE_API_KEY` があれば Claude が有効、`OPENAI_API_KEY` があれば LLM 検証を実行します。すべて無い場合はパターン検証のみ（警告付き続行）。
- **SAFE_PATTERNS / DANGEROUS_PATTERNS**: `execute --phase` や `npm run` などの CLI 操作は安全パターンとして許容し、削除・上書き・Git操作・任意コマンド実行は危険パターンとしてブロックします。
- **信頼度と継続条件**: `confidence='low'` でパターン検証のみとなった場合は警告を出しつつ続行し、より厳密な検証を行うには上記の認証情報を設定してください。
- **キャッシュ**: 指示文字列の SHA-256 をキーに 1時間TTL / 最大1000件の LRU キャッシュを保持し、同一指示の再検証を高速化します。
- **CLI での利用例**:
  - `node dist/index.js auto-issue --category bug --custom-instruction "N+1クエリを重点的に検出"`
  - 検証結果はログに `validationMethod` と `confidence` を出力し、危険判定時は即時エラー、低信頼パターン時は警告のみで続行します。

**推奨環境変数セット**（例）:

```bash
export CODEX_API_KEY="sk-..."          # Codex 優先
export CLAUDE_CODE_OAUTH_TOKEN="sess..." # Codex が無い場合のフォールバック
export OPENAI_API_KEY="sk-..."          # Codex/Claude が両方失敗したときの最終LLM
```

### エージェントモード
- `--agent auto`（デフォルト）: `CODEX_API_KEY` が設定されていれば Codex を使用、なければ Claude にフォールバック
- `--agent codex`: Codex を強制使用（`CODEX_API_KEY` または `OPENAI_API_KEY` が必要）
- `--agent claude`: Claude を強制使用（`CLAUDE_CODE_CREDENTIALS_PATH` が必要）

### エージェント優先順位の自動選択（Issue #306で追加）

`--agent auto` モード実行時、フェーズの特性に応じてエージェントの優先順位が自動的に選択されます。

| フェーズ | 優先順位 | 理由 |
|---------|---------|------|
| planning | claude-first | 戦略立案、情報整理が得意 |
| requirements | claude-first | 要件の構造化、分析が得意 |
| design | claude-first | アーキテクチャ設計、ドキュメント作成が得意 |
| test_scenario | claude-first | テストシナリオの設計・整理が得意 |
| implementation | codex-first | 具体的なコード実装が得意 |
| test_implementation | codex-first | テストコード生成が得意 |
| testing | codex-first | テスト実行、デバッグが得意 |
| documentation | claude-first | ドキュメント作成が得意 |
| report | claude-first | レポート作成、要約が得意 |
| evaluation | claude-first | 評価、分析が得意 |

**動作**:
- `claude-first`: Claude Code を優先的に使用、失敗時に Codex へフォールバック
- `codex-first`: Codex を優先的に使用、失敗時に Claude Code へフォールバック

**後方互換性**: デフォルト動作は従来どおり `codex-first`。`agentPriority` 未指定時やフェーズ外での使用は従来動作を維持。

**技術詳細**:
- 定数: `PHASE_AGENT_PRIORITY`（`src/commands/execute/agent-setup.ts`）
- 型: `AgentPriority`（`'codex-first' | 'claude-first'`）
- `AgentExecutor` コンストラクタに `agentPriority` パラメータを追加（オプショナル）

### Claude モデル指定（Issue #301で追加）

```bash
# デフォルト（Opus 4.5）を使用
node dist/index.js execute --issue 123 --phase all

# Sonnet を明示的に指定
node dist/index.js execute --issue 123 --phase all --claude-model sonnet

# Haiku を明示的に指定（高速・低コスト）
node dist/index.js execute --issue 123 --phase all --claude-model haiku

# フルモデルIDで指定
node dist/index.js execute --issue 123 --phase all --claude-model claude-opus-4-6

# 環境変数でデフォルト動作を設定
export CLAUDE_MODEL=sonnet
node dist/index.js execute --issue 123 --phase all
```

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `opus` | `claude-opus-4-6` | **デフォルト**。最高性能、複雑なタスク向け |
| `sonnet` | `claude-sonnet-4-5` | バランス型、コスト効率良好 |
| `haiku` | `claude-haiku-4-5` | 高速・低コスト、シンプルなタスク向け |

**優先順位**:
1. CLI オプション `--claude-model`（最優先）
2. 環境変数 `CLAUDE_MODEL`
3. デフォルト値 `opus`（`claude-opus-4-6`）

### Codex モデル指定（Issue #302で追加）

```bash
# デフォルト（gpt-5.2-codex）を使用
node dist/index.js execute --issue 123 --phase all

# mini モデルを明示的に指定（軽量・経済的）
node dist/index.js execute --issue 123 --phase all --codex-model mini

# レガシーモデルを使用（後方互換性）
node dist/index.js execute --issue 123 --phase all --codex-model legacy

# フルモデルIDで指定
node dist/index.js execute --issue 123 --phase all --codex-model gpt-5.2-codex

# 環境変数でデフォルト動作を設定
export CODEX_MODEL=mini
node dist/index.js execute --issue 123 --phase all
```

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `max` | `gpt-5.2-codex` | **デフォルト**。長時間エージェントタスク向けに最適化 |
| `mini` | `gpt-5.1-codex-mini` | 軽量・経済的 |
| `5.1` | `gpt-5.1` | 汎用モデル |
| `legacy` | `gpt-5-codex` | レガシー（後方互換性） |

**優先順位**:
1. CLI オプション `--codex-model`（最優先）
2. 環境変数 `CODEX_MODEL`
3. デフォルト値 `max`（`gpt-5.2-codex`）

### PRコメント自動対応（Issue #383で追加、Issue #444でリファクタリング）

```bash
# 1. PRから未解決コメントを取得してメタデータを初期化
node dist/index.js pr-comment init --pr 123

# 2. AIエージェントでコメントを分析し、response-plan.jsonを生成
node dist/index.js pr-comment analyze --pr 123

# 3. response-plan.jsonに基づいてコード修正・返信投稿を実行
node dist/index.js pr-comment execute --pr 123

# 4. 完了したコメントスレッドを解決し、メタデータをクリーンアップ
node dist/index.js pr-comment finalize --pr 123

# プレビューモード（実際の変更を行わない）
node dist/index.js pr-comment execute --pr 123 --dry-run

# バッチサイズを指定（一度に処理するコメント数）
node dist/index.js pr-comment execute --pr 123 --batch-size 10
```

**主な機能**:
- **analyze/execute分離（Issue #444）**: analyzeでエージェント分析、executeで適用のみを実行
  - エージェント実行回数が半減（コスト50%削減）
  - 分析結果が正確に適用される（パース失敗によるフォールバック問題を解消）
- **コメント分析エンジン**: AIエージェントがコメントを分析し、4種類の解決タイプを判定
  - `code_change`: コード修正が必要（ファイル変更を適用）
  - `reply`: 返信のみで対応（コメントを投稿）
  - `discussion`: 議論が必要（人間の判断を待つ）
  - `skip`: 対応不要（スキップ）
- **コード変更適用**: ファイル変更適用（modify, create, delete）
- **セキュリティ機能**:
  - パストラバーサル防止（リポジトリ外への書き込み禁止）
  - 機密ファイル除外（`.env`, `credentials.json`, `*.pem`, `*.key` 等）
  - `confidence: low` のコード変更は自動的に `discussion` に変更
- **レジューム機能**: 中断からの再開、部分的成功時の継続処理
- **最新コメントの再取得**: `pr-comment analyze` は GitHub から未解決コメントを再取得し、metadata に存在しない `comment_id` を `pending` へ追加するため、`init` 実行後や再開後に投稿された新規コメントも自動的に分析対象となり、追加件数はログで確認できます。
- **AI返信除外**: `refreshComments()` でメタデータの `reply_comment_id` に記録されたAI返信のコメントIDを除外し、ユーザーの新規コメントのみを追加。除外件数は `logger.debug("Excluded N AI reply comment(s)")` で出力されます。

**オプション**:
- `--pr <number>`: 対象のPR番号（必須）
- `--dry-run`: プレビューモード（実際の変更を行わない）
- `--batch-size <number>`: 一度に処理するコメント数（デフォルト: 5、executeのみ）
- `--agent <mode>`: 使用するエージェント（`auto` | `codex` | `claude`、デフォルト: `auto`、**analyzeのみ**）

**メタデータ構造**:
```
.ai-workflow/pr-123/
├── comment-resolution-metadata.json  # コメントごとのステータス、サマリー、コスト追跡
├── output/
│   └── response-plan.json            # analyze結果（executeで使用）
└── execute/
    └── agent_log.md                  # エージェント実行ログ（analyzeのみ）
```

**技術詳細**:
- **実装モジュール**:
  - `src/commands/pr-comment/init.ts`: 初期化コマンド
  - `src/commands/pr-comment/analyze.ts`: 分析コマンド（Issue #428で追加）
  - `src/commands/pr-comment/execute.ts`: 実行コマンド（Issue #444でリファクタリング）
  - `src/commands/pr-comment/finalize.ts`: 完了コマンド
  - `src/core/pr-comment/metadata-manager.ts`: メタデータ管理
  - `src/core/pr-comment/comment-analyzer.ts`: コメント分析エンジン（analyzeで使用）
  - `src/core/pr-comment/change-applier.ts`: コード変更適用エンジン
- **型定義**: `src/types/pr-comment.ts`
- **プロンプト**: `src/prompts/pr-comment/analyze.txt`
- **GitHub API**: PRレビューコメント取得（REST）、スレッド解決（GraphQL mutation）、返信投稿

### resolve-conflict コマンド（Issue #719）

Pull Request のマージコンフリクトを AI で分析・解消する 4 フェーズコマンドです。

```bash
# init: メタデータ作成とブランチ fetch
node dist/index.js resolve-conflict init --pr-url <PR_URL>

# analyze: コンフリクト解析と解消計画の生成
node dist/index.js resolve-conflict analyze --pr-url <PR_URL> --agent auto

# execute: 解消計画に従って解消（dry-run でプレビュー）
node dist/index.js resolve-conflict execute --pr-url <PR_URL> --dry-run

# finalize: push と PR コメント投稿
node dist/index.js resolve-conflict finalize --pr-url <PR_URL> --push
```

**主なオプション**:
- `--pr-url <url>`: PR URL（必須）
- `--agent <auto|codex|claude>`: 使用エージェント（analyze/execute）
- `--dry-run`: 変更のプレビューのみ（execute）
- `--push`: リモートへ push（finalize）
- `--squash`: 1コミット前提のガイド表示（finalize）
- `--language <ja|en>`: 出力言語

**生成される成果物**:
- `.ai-workflow/conflict-<pr>/metadata.json`
- `.ai-workflow/conflict-<pr>/resolution-plan.json`
- `.ai-workflow/conflict-<pr>/resolution-result.json`

**詳細**:
- `docs/CONFLICT_RESOLUTION.md` を参照

### コミットスカッシュ（Issue #194で追加）
```bash
# ワークフロー完了後にコミットをスカッシュ
node dist/index.js execute --issue 123 --phase all --squash-on-complete

# 環境変数でデフォルト動作を設定
export AI_WORKFLOW_SQUASH_ON_COMPLETE=true
node dist/index.js execute --issue 123 --phase all

# 明示的に無効化
node dist/index.js execute --issue 123 --phase all --no-squash-on-complete
```

**動作要件**:
- `evaluation` フェーズが含まれる場合のみ実行
- `init`コマンド実行時に `base_commit` が記録されている
- main/master ブランチでは実行不可（ブランチ保護）

**主な機能**:
- **コミット範囲の取得**: `base_commit` から `HEAD` までのコミット範囲を自動取得
- **エージェント生成**: Codex / Claude がコミット履歴とdiff統計を分析し、Conventional Commits形式のメッセージを生成
- **スカッシュ実行**: `git reset --soft base_commit` でコミットをスカッシュし、生成されたメッセージで新しいコミットを作成
- **安全な強制プッシュ**: `git push --force-with-lease` で他の変更を上書きしない
- **ロールバック可能性**: `pre_squash_commits` メタデータで元のコミット履歴を保存

### 依存関係管理
- `--skip-dependency-check`: すべての依存関係検証をバイパス（慎重に使用）
- `--ignore-dependencies`: 警告を表示するが実行を継続
- `--force-reset`: メタデータをクリアして Phase 0 から再開
