# CLAUDE.md

このファイルは、このリポジトリで作業する際に Claude Code (claude.ai/code) にガイダンスを提供します。

## 概要

TypeScript ベースの AI Workflow 自動化ツールキットで、デュアルエージェント（Codex + Claude）をサポートしています。GitHub Issue に対して planning から evaluation までの 10 フェーズのワークフローを実行し、マルチリポジトリワークフロー、Jenkins 統合、永続的なメタデータ管理をサポートします。

## ビルド & 開発コマンド

```bash
# 依存関係のインストール
npm install

# TypeScript ソースのビルド（dist/ へコンパイルし、prompts/templates をコピー）
npm run build

# ウォッチモードで開発
npm run dev

# テスト実行
npm test                    # すべてのテスト
npm run test:unit          # ユニットテストのみ
npm run test:integration   # 統合テストのみ
npm run test:coverage      # カバレッジレポート付き
```

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

Codex エージェントは `gpt-5.1-codex-max` をデフォルトで使用しますが、CLI オプションまたは環境変数でモデルを切り替えられます。`resolveCodexModel()`（`src/core/codex-agent-client.ts`）がエイリアスを大文字・小文字を区別せずに解決し、未指定時は `DEFAULT_CODEX_MODEL` にフォールバックします。

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
- どちらも未指定の場合は `gpt-5.1-codex-max` を使用

**モデルエイリアス**（`CODEX_MODEL_ALIASES` 定数で定義）:

| エイリアス | 実際のモデルID | 用途 |
|-----------|---------------|------|
| `max` | `gpt-5.1-codex-max` | **デフォルト**。長時間・高負荷タスク向け |
| `mini` | `gpt-5.1-codex-mini` | 軽量／コスト重視の検証タスク |
| `5.1` | `gpt-5.1` | 汎用プロンプト向け |
| `legacy` | `gpt-5-codex` | 旧デフォルトとの後方互換性 |

フルモデルIDを指定した場合はエイリアス解決をスキップしてそのまま渡されるため、新しい Codex リリースにも即応できます。`legacy` エイリアスを使えば既存の `gpt-5-codex` 固定ワークフローを破壊せずに動作確認が可能です。

**補足**: ChatGPT アカウントで Codex CLI（`CODEX_AUTH_JSON` など）を使うと `gpt-4o`/`gpt-4o-mini` は非対応になるため、`resolveCodexModel()` では非対応モデルや未指定値が渡された際に `DEFAULT_CODEX_MODEL`（`gpt-5.1-codex-max`）へ安全にフォールバックします。`--codex-model` や `CODEX_MODEL` では上記エイリアスまたはフルモデル名を使って ChatGPT 対応モデルを明示的に指定してください。詳細やトラブルシュートは `TROUBLESHOOTING.md` の該当セクションを確認してください。

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
  --followup-llm-model claude-3-sonnet-20240229

# LLM生成を無効化（既存テンプレートを使用）
node dist/index.js execute \
  --issue <NUM> \
  --phase evaluation \
  --followup-llm-mode off
```

**主な機能**:
- **LLM統合**: OpenAI（gpt-4o-mini）またはAnthropic（claude-3-sonnet-20240229）を使用してフォローアップIssueのタイトル/本文を生成
- **自動フォールバック**: LLM呼び出し失敗時は既存テンプレートへ自動的にフォールバック
- **セキュリティ**: プロンプト送信前にシークレット（APIキー、メールアドレス、トークン）を自動マスキング
- **リトライ制御**: 指数バックオフ戦略で最大3回までリトライ
- **メタデータ記録**: 生成元プロバイダ、モデル、実行時間、リトライ回数、トークン使用量を記録

**オプション**:
- `--followup-llm-mode <mode>`: LLMプロバイダ（`auto` | `openai` | `claude` | `off`、デフォルト: `off`）
- `--followup-llm-model <model>`: 使用モデル（`gpt-4o-mini` | `claude-3-sonnet-20240229` 等）
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
node dist/index.js execute --issue 123 --phase all --claude-model claude-opus-4-5-20251101

# 環境変数でデフォルト動作を設定
export CLAUDE_MODEL=sonnet
node dist/index.js execute --issue 123 --phase all
```

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `opus` | `claude-opus-4-5-20251101` | **デフォルト**。最高性能、複雑なタスク向け |
| `sonnet` | `claude-sonnet-4-20250514` | バランス型、コスト効率良好 |
| `haiku` | `claude-haiku-3-5-20241022` | 高速・低コスト、シンプルなタスク向け |

**優先順位**:
1. CLI オプション `--claude-model`（最優先）
2. 環境変数 `CLAUDE_MODEL`
3. デフォルト値 `opus`（`claude-opus-4-5-20251101`）

### Codex モデル指定（Issue #302で追加）

```bash
# デフォルト（gpt-5.1-codex-max）を使用
node dist/index.js execute --issue 123 --phase all

# mini モデルを明示的に指定（軽量・経済的）
node dist/index.js execute --issue 123 --phase all --codex-model mini

# レガシーモデルを使用（後方互換性）
node dist/index.js execute --issue 123 --phase all --codex-model legacy

# フルモデルIDで指定
node dist/index.js execute --issue 123 --phase all --codex-model gpt-5.1-codex-max

# 環境変数でデフォルト動作を設定
export CODEX_MODEL=mini
node dist/index.js execute --issue 123 --phase all
```

**モデルエイリアス**:

| エイリアス | 実際のモデル ID | 説明 |
|-----------|----------------|------|
| `max` | `gpt-5.1-codex-max` | **デフォルト**。長時間エージェントタスク向けに最適化 |
| `mini` | `gpt-5.1-codex-mini` | 軽量・経済的 |
| `5.1` | `gpt-5.1` | 汎用モデル |
| `legacy` | `gpt-5-codex` | レガシー（後方互換性） |

**優先順位**:
1. CLI オプション `--codex-model`（最優先）
2. 環境変数 `CODEX_MODEL`
3. デフォルト値 `max`（`gpt-5.1-codex-max`）

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

## アーキテクチャ

### フェーズ実行フロー

1. **CLI エントリー**（`src/main.ts`）: コマンドルーティング → 各コマンドハンドラ（`src/commands/init.ts`, `src/commands/execute.ts` 等）へ委譲
2. **Issue URL 解析**: GitHub URL から owner/repo/issue を抽出（`parseIssueUrl` in `src/core/repository-utils.ts`）
3. **マルチリポジトリ解決**: `REPOS_ROOT` 環境変数を使用して対象リポジトリを特定
4. **メタデータ読み込み**: `.ai-workflow/issue-<NUM>/metadata.json` を読み込み、`target_repository` 情報を取得
5. **フェーズ実行**: `BasePhase.run()` による順次実行（`src/commands/execute.ts` で管理）:
   - 依存関係検証
   - `execute()`: エージェントで成果物を生成
     - **フォールバック機構** (Issue #113で追加): 成果物ファイル不在時の自動復旧
       - `enableFallback: true` のフェーズ（Planning, Requirements, Design, TestScenario, Implementation, Report）で有効
       - ① ログからの成果物抽出（`extractContentFromLog()`） → ② revise呼び出し
       - フェーズ固有ヘッダーパターンでログを解析、コンテンツ検証後に保存
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `review()`: 出力を検証（オプション）
     - **Git コミット & プッシュ** (v0.3.0で追加)
   - `revise()`: 自動修正サイクル（最大 3 回まで）
     - **previous_log_snippet 注入** (Issue #113で追加): agent_log.mdの先頭2000文字を自動注入
     - **Git コミット & プッシュ** (v0.3.0で追加)

### コアモジュール

- **`src/main.ts`**: CLI 定義とコマンドルーティング（約118行、v0.3.0でリファクタリング）。コマンドルーターとしての役割のみに特化。
- **`src/commands/init.ts`**: Issue初期化コマンド処理（約306行）。ブランチ作成、メタデータ初期化、PR作成を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。
- **`src/commands/execute.ts`**: フェーズ実行コマンド処理（約497行、v0.3.1で27%削減、Issue #46）。ファサードパターンにより4つの専門モジュールに分離。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。
- **`src/commands/execute/options-parser.ts`**: CLIオプション解析とバリデーション（約151行、v0.3.1で追加、Issue #46）。`parseExecuteOptions()`, `validateExecuteOptions()` を提供。
- **`src/commands/execute/agent-setup.ts`**: エージェント初期化と認証情報解決（約175行、v0.3.1で追加、Issue #46）。`setupAgentClients()`, `resolveAgentCredentials()` を提供。
- **`src/commands/execute/workflow-executor.ts`**: ワークフロー実行ロジック（約128行、v0.3.1で追加、Issue #46）。`executePhasesSequential()`, `executePhasesFrom()` を提供。
- **`src/commands/review.ts`**: フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。
- **`src/commands/list-presets.ts`**: プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。
- **`src/commands/rollback.ts`**: フェーズ差し戻しコマンド処理（約930行、v0.4.0、Issue #90/#271で追加）。ワークフローを前のフェーズに差し戻し、修正作業を行うための機能を提供。
  - **手動rollback** (Issue #90): `handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供。差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。
  - **自動rollback** (Issue #271): `handleRollbackAutoCommand()` を提供。AIエージェント（Codex/Claude）による自動差し戻し判定機能。
    - **コンテキスト収集**: `collectAnalysisContext()`, `findLatestReviewResult()`, `findLatestTestResult()` でreview/test結果を自動探索
    - **エージェント初期化**: `initializeAgentClients()` でagentモードに応じたクライアント初期化
    - **プロンプト構築**: `buildAgentPrompt()` でテンプレート（`src/prompts/rollback/auto-analyze.txt`）から分析プロンプトを生成
    - **JSON パース**: `parseRollbackDecision()` で3つのフォールバックパターン（Markdown code block → Plain JSON → Bracket search）を使用してエージェント応答から RollbackDecision を抽出（exported for testing）
    - **バリデーション**: `validateRollbackDecision()` で厳格な型チェック（needs_rollback, to_phase, confidence 等の必須フィールド検証）（exported for testing）
    - **信頼度ベース確認**: `confirmRollbackAuto()` で confidence level に応じた確認プロンプト表示（high + --force でスキップ）
    - **表示**: `displayAnalysisResult()`, `displayDryRunPreview()` で判定結果をユーザーに表示
    - **実行**: 既存の `executeRollback()` を再利用して実際の差し戻しを実行
- **`src/commands/cleanup.ts`**: ワークフローログの手動クリーンアップコマンド処理（約480行、v0.4.0、Issue #212で追加）。Report Phase（Phase 8）の自動クリーンアップとは独立して、任意のタイミングでワークフローログを削除する機能を提供。`handleCleanupCommand()`, `validateCleanupOptions()`, `parsePhaseRange()`, `executeCleanup()`, `previewCleanup()` を提供。3つのクリーンアップモード（通常、部分、完全）、プレビューモード（`--dry-run`）、Git自動コミット＆プッシュをサポート。
- **`src/core/repository-utils.ts`**: リポジトリ関連ユーティリティ（約170行）。Issue URL解析、リポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `resolveLocalRepoPath()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。
- **`src/core/phase-factory.ts`**: フェーズインスタンス生成（約65行、v0.3.1で追加、Issue #46）。`createPhaseInstance()` を提供。10フェーズすべてのインスタンス生成を担当。
- **`src/types/commands.ts`**: コマンド関連の型定義（約325行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90/#271）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry, RollbackAutoOptions, RollbackDecision等の型を提供。コマンドハンドラの型安全性を確保。Issue #271で追加された型: `RollbackAutoOptions`（CLI options for rollback-auto command）、`RollbackDecision`（Agent output structure with validation rules）。
- **`src/phases/base-phase.ts`**: execute/review/revise ライフサイクルを持つ抽象基底クラス（約476行、v0.3.1で40%削減、Issue #23・#47・#49でリファクタリング、v0.4.0でrollbackプロンプト注入追加、Issue #90、Issue #113でfallback機構追加）。ファサードパターンにより専門モジュールへ委譲。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入。フォールバック機構（`handleMissingOutputFile()`, `extractContentFromLog()`, `isValidOutputContent()`）により、成果物ファイル生成失敗時にログから自動抽出またはrevise呼び出しで復旧。
- **`src/phases/core/agent-executor.ts`**: エージェント実行ロジック（約270行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。
- **`src/phases/core/review-cycle-manager.ts`**: レビューサイクル管理（約130行、v0.3.1で追加、Issue #23）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。
- **`src/phases/lifecycle/step-executor.ts`**: ステップ実行ロジック（約233行、v0.3.1で追加、Issue #49）。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュを担当。
- **`src/phases/lifecycle/phase-runner.ts`**: フェーズライフサイクル管理（約244行、v0.3.1で追加、Issue #49）。フェーズ全体の実行、依存関係検証、エラーハンドリング、GitHub進捗投稿を担当。
- **`src/phases/context/context-builder.ts`**: コンテキスト構築（約223行、v0.3.1で追加、Issue #49）。オプショナルコンテキスト構築、ファイル参照生成（@filepath形式）、Planning Document参照を担当。
- **`src/phases/cleanup/artifact-cleaner.ts`**: クリーンアップロジック（約228行、v0.3.1で追加、Issue #49、v0.4.0でphaseRange追加、Issue #212）。ワークフロークリーンアップ、パス検証（セキュリティ対策）、シンボリックリンクチェック、CI環境判定を担当。`cleanupWorkflowLogs()` メソッドに `phaseRange?: PhaseName[]` パラメータを追加し、クリーンアップ対象フェーズの範囲指定をサポート。
- **`src/phases/formatters/progress-formatter.ts`**: 進捗表示フォーマット（約150行、v0.3.1で追加、Issue #23）。GitHub Issue コメント用の進捗状況フォーマットを生成。
- **`src/phases/formatters/log-formatter.ts`**: ログフォーマット（約400行、v0.3.1で追加、Issue #23）。Codex/Claude エージェントの生ログを Markdown 形式に変換。
- **`src/core/codex-agent-client.ts`**: JSON イベントストリーミングを備えた Codex CLI ラッパー（約200行、Issue #26で25.4%削減）
- **`src/core/claude-agent-client.ts`**: Claude Agent SDK ラッパー（約206行、Issue #26で23.7%削減）
- **`src/core/helpers/agent-event-parser.ts`**: Codex/Claude共通のイベントパースロジック（74行、Issue #26で追加）
- **`src/core/helpers/log-formatter.ts`**: エージェントログのフォーマット処理（181行、Issue #26で追加）
- **`src/core/helpers/env-setup.ts`**: エージェント実行環境のセットアップ（47行、Issue #26で追加）
- **`src/core/metadata-manager.ts`**: `.ai-workflow/issue-*/metadata.json` に対する CRUD 操作（約347行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90）。差し戻し機能用の6つの新規メソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。
- **`src/core/helpers/metadata-io.ts`**: メタデータファイルI/O操作（98行、Issue #26で追加）
- **`src/core/helpers/validation.ts`**: 共通バリデーション処理（47行、Issue #26で追加）
- **`src/core/config.ts`**: 環境変数アクセス管理（約220行、Issue #51で追加）。型安全な環境変数アクセス、必須/オプション環境変数の検証、フォールバックロジックの統一を提供。`config.getGitHubToken()`, `config.getCodexApiKey()`, `config.isCI()` 等14個のメソッドをエクスポート。
- **`src/core/git-manager.ts`**: Git操作のファサードクラス（約181行、Issue #25で67%削減）。各専門マネージャーを統合し、後方互換性を維持。
- **`src/core/git/commit-manager.ts`**: コミット操作の専門マネージャー（約409行、Issue #52で30.2%削減）。コミット作成（commitPhaseOutput, commitStepOutput等）、FileSelector/CommitMessageBuilderへの委譲、SecretMasker統合、ensureGitConfig（Git設定管理）を担当。
- **`src/core/git/file-selector.ts`**: ファイル選択・フィルタリング専門モジュール（約160行、Issue #52で追加）。getChangedFiles（変更ファイル検出）、filterPhaseFiles（Issue番号フィルタリング）、getPhaseSpecificFiles（フェーズ固有パターンマッチング）、scanDirectories、scanByPatterns、@tmp除外ロジックを担当。
- **`src/core/git/commit-message-builder.ts`**: コミットメッセージ構築専門モジュール（約151行、Issue #52で追加）。createCommitMessage（フェーズ完了）、buildStepCommitMessage（ステップ完了）、createInitCommitMessage（初期化）、createCleanupCommitMessage（クリーンアップ）のメッセージ生成を担当。
- **`src/core/git/branch-manager.ts`**: ブランチ操作の専門マネージャー（約110行、Issue #25で追加）。ブランチ作成、切り替え、存在チェックを担当。
- **`src/core/git/remote-manager.ts`**: リモート操作の専門マネージャー（約210行、Issue #25で追加、Issue #216で拡張）。push、pull、リトライロジック、GitHub認証設定を担当。`forcePushToRemote()` メソッド（Issue #216で追加）は `--force-with-lease` で安全に強制プッシュを実行し、non-fast-forwardエラー時にpullを実行しない（スカッシュ後の履歴保持のため）。
- **`src/core/git/squash-manager.ts`**: スカッシュ操作の専門マネージャー（約350行、Issue #194で追加、Issue #216でESM互換性修正）。コミットスカッシュ、エージェント生成コミットメッセージ、ブランチ保護、`--force-with-lease`による安全な強制プッシュを担当。ESM環境では `import.meta.url` と `fileURLToPath` を使用してパス解決を実行（`__dirname` はESMではグローバル変数として利用できないため）。
- **`src/core/github-client.ts`**: Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。
- **`src/core/github/issue-client.ts`**: Issue操作の専門クライアント（約385行、Issue #24で追加、Issue #104で拡張）。Issue取得、コメント投稿、クローズ、残タスクIssue作成、タイトル生成、キーワード抽出、詳細フォーマット機能を担当。
- **`src/core/github/pull-request-client.ts`**: PR操作の専門クライアント（約231行、Issue #24で追加）。PR作成、更新、検索、クローズ、PR番号取得を担当。
- **`src/core/github/comment-client.ts`**: コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。
- **`src/core/github/review-client.ts`**: レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。
- **`src/core/phase-dependencies.ts`**: 依存関係検証、プリセット定義（約249行、Issue #26で27.2%削減）
- **`src/core/helpers/dependency-messages.ts`**: 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）
- **`src/core/content-parser.ts`**: レビュー結果の解釈（OpenAI API を使用）。Issue #243でレビュー結果パースロジックを改善：JSON抽出前処理（`extractJsonFromResponse()`）とマーカーパターン優先判定（`inferDecisionFromText()`）により、LLMレスポンスの多様な形式に対応し、誤検出（「PASS判定が可能になります」→PASS）を防止
- **`src/utils/logger.ts`**: 統一ログモジュール（約150行、Issue #61で追加）。ログレベル制御、カラーリング、タイムスタンプ、環境変数制御を提供
- **`src/utils/error-utils.ts`**: エラーハンドリングユーティリティ（約190行、Issue #48で追加）。`getErrorMessage()`, `getErrorStack()`, `isError()` を提供。TypeScript の catch ブロックで `unknown` 型のエラーから型安全にメッセージを抽出。非 Error オブジェクト（string、number、null、undefined）に対応し、決して例外をスローしない（never throw 保証）

### フェーズ順序（0-9）

0. Planning → 1. Requirements → 2. Design → 3. Test Scenario → 4. Implementation → 5. Test Implementation → 6. Testing → 7. Documentation → 8. Report → 9. Evaluation

### プロンプト & テンプレート

- **プロンプト**: `src/prompts/{phase}/{execute|review|revise}.txt` → ビルド時に `dist/prompts/` へコピー
- **テンプレート**: `src/templates/*.md` → ビルド時に `dist/templates/` へコピー
- プロンプトは `BasePhase.loadPrompt()` で読み込まれ、エージェントコンテキストでレンダリング

### プリセット

`src/core/phase-dependencies.ts` で定義:
- `review-requirements`: Planning + Requirements
- `review-design`: Planning + Requirements + Design
- `review-test-scenario`: Planning + Requirements + Design + TestScenario
- `analysis-design`: Planning + Requirements + Design
- `quick-fix`: Planning + Implementation + Documentation + Report（`--ignore-dependencies` と併用）
- `implementation`: Planning + Implementation + TestImplementation + Testing + Documentation + Report
- `full-test`: Planning + TestScenario + TestImplementation
- `testing`: Planning + TestImplementation + Testing
- `finalize`: Planning + Documentation + Report + Evaluation

### オプショナルコンテキスト構築

`BasePhase.buildOptionalContext()` により、フェーズは前段フェーズの成果物を柔軟に参照可能:
- ファイルが存在する場合: `@relative/path` 参照を返す
- ファイルが存在しない場合: フォールバックメッセージを返す
- 使用フェーズ: Implementation、TestImplementation、Testing、Documentation、Report

## Phase 4-8 の出力ドキュメント簡潔化（Issue #207）

中盤フェーズ（Phase 4-8）の出力ドキュメントが簡潔化されました。以下のフォーマットに従ってください：

### Phase 4（Implementation）
- **変更ファイル一覧**: テーブルフォーマット（ファイル、変更種別、概要）
- **主要な変更点**: 3-5個の箇条書き
- **削除されたセクション**: 各ファイルの詳細な変更内容（「実装詳細」セクション）

### Phase 5（Test Implementation）
- **テストファイル一覧**: テーブルフォーマット（ファイル、テスト数、カバー対象）
- **テストカバレッジ**: 数値サマリー（ユニットテスト数、統合テスト数）
- **削除されたセクション**: 各テスト関数の詳細説明（「テストケース詳細」セクション）

### Phase 6（Testing）
- **成功時**: サマリーのみ（総数、成功率）
- **失敗時**: サマリー + 失敗したテストの詳細のみ
- **削除されたセクション**: 成功したテストの詳細リスト

### Phase 7（Documentation）
- **更新サマリー**: テーブルフォーマット（ファイル、更新理由）
- **削除されたセクション**: 調査したドキュメント一覧、更新不要と判断したドキュメント一覧
- **Readツールの制限**: `CLAUDE.md` / `~/.claude/CLAUDE.md` は自動コンテキストに含まれるため Read 不要。Read は一度に3-5ファイルまでに絞り、大型ドキュメントは `limit: 1000-2000` を付けて部分読みにする（プロンプト長エラー防止）。

### Phase 8（Report）
- **エグゼクティブサマリー**: Issue番号、タイトル、実装内容、変更規模、テスト結果、マージ推奨
- **マージチェックリスト**: 要件充足、テスト成功、ドキュメント更新、セキュリティリスク、後方互換性
- **詳細参照**: @references形式で各フェーズのファイルへリンク
- **削除されたセクション**: 各フェーズの詳細再掲載（要件定義サマリー、設計サマリー等）

**簡潔化の効果**:
- コンテキスト消費量: 従来比30-50%削減
- レビュー時間: 短縮（重要な情報に集中可能）
- 可読性: 向上（テーブル、箇条書き、サマリー形式の採用）

**注意事項**:
- Phase 0-2（Planning, Requirements, Design）は詳細を維持（変更なし）
- 詳細情報は各フェーズの成果物ファイル（`@.ai-workflow/issue-{NUM}/<phase>/output/*.md`）を参照
- Phase 8のReport Phaseでは@references方式により、詳細へのアクセス経路を提供

## マルチリポジトリワークフロー（v0.2.0）

ワークフローは `ai-workflow-agent` 以外のリポジトリも対象にできます:

1. **Issue URL 解析**: GitHub Issue URL から owner/repo を抽出
2. **ローカル解決**: `$REPOS_ROOT`、`~/TIELEC/development`、`~/projects`、または `../` からリポジトリを検索
3. **メタデータ保存**: metadata.json の `target_repository` オブジェクトに path、GitHub name、remote URL、owner、repo を保存
4. **実行コンテキスト**: すべての操作は対象リポジトリの作業ディレクトリで実行

**主要関数**:
- `parseIssueUrl(issueUrl)`: URL からリポジトリ情報を抽出（`src/core/repository-utils.ts`）
- `resolveLocalRepoPath(repoName)`: ローカルリポジトリパスを検索（`src/core/repository-utils.ts`）
- `findWorkflowMetadata(issueNumber)`: リポジトリ間でワークフローメタデータを検索（`src/core/repository-utils.ts`）

## ワークフローメタデータ構造

```
.ai-workflow/issue-<NUM>/
├── metadata.json              # WorkflowState（フェーズステータス、ステップ進捗、コスト、target_repository など）
├── 00_planning/
│   ├── execute/agent_log_raw.txt
│   ├── execute/prompt.txt
│   ├── review/...
│   └── output/planning.md
├── 01_requirements/...
└── ...
```

### ステップ単位の進捗管理（v0.3.0）

各フェーズのメタデータには、ステップ単位の進捗情報が記録されます：

```json
{
  "phases": {
    "requirements": {
      "status": "in_progress",
      "current_step": "review",
      "completed_steps": ["execute"],
      "retry_count": 0
    }
  }
}
```

- **`current_step`**: 現在実行中のステップ（'execute' | 'review' | 'revise' | null）
- **`completed_steps`**: 完了済みステップの配列
- **レジューム動作**: 完了済みステップは自動的にスキップされ、`current_step` または次の未完了ステップから再開

### ワークフローログクリーンアップ

Report Phase（Phase 8）完了後、`cleanupWorkflowLogs()` が自動的にデバッグログを削除:
- **削除対象**: phases 00-08（00_planning 〜 08_report）の `execute/`、`review/`、`revise/` ディレクトリ
- **保持対象**: `metadata.json`、`output/*.md`（Planning Phaseの `output/planning.md` も保持）
- **効果**: リポジトリサイズを約 75% 削減、PR をクリーンに
- **Git コミット**: 削除後、`[ai-workflow] Clean up workflow execution logs` メッセージで自動コミット＆プッシュ（Phase 8: report）

**手動クリーンアップ**（v0.4.0、Issue #212で追加）:
- `cleanup` コマンドを使用すると、自動クリーンアップとは独立して任意のタイミングでログをクリーンアップ可能
- 詳細は [ワークフローログの手動クリーンアップ](#ワークフローログの手動クリーンアップv040issue-212で追加) セクションを参照

### ワークフローディレクトリの完全削除（v0.3.0）

Evaluation Phase (Phase 9) 完了後、オプションで `.ai-workflow/issue-*` ディレクトリ全体を削除可能:
- **CLI オプション**: `--cleanup-on-complete`, `--cleanup-on-complete-force`
- **削除対象**: `.ai-workflow/issue-<NUM>/` ディレクトリ全体（`metadata.json`、`output/*.md` を含む）
- **確認プロンプト**: 対話的環境では削除前に確認を求める（CI環境では自動スキップ）
- **実装**: `BasePhase.cleanupWorkflowArtifacts()` メソッド、`EvaluationPhase.run()` で統合
- **セキュリティ**: パス検証（正規表現）、シンボリックリンクチェック

**Report Phase クリーンアップとの違い**:

| 項目 | Report Phase (Phase 8) | Evaluation Phase (Phase 9) |
|------|------------------------|----------------------------|
| **削除対象** | phases 00-08 のデバッグログ（`execute/`, `review/`, `revise/`） | ワークフロー全体（`.ai-workflow/issue-<NUM>/`） |
| **実行タイミング** | Report Phase 完了時（常に実行） | Evaluation Phase 完了時（オプション指定時のみ） |
| **目的** | PR レビューの負荷軽減（約 75% 削減） | ワークフロー完了後のクリーンアップ（完全削除） |
| **保護対象** | `metadata.json`, `output/*.md` | なし（全て削除） |
| **Git コミットメッセージ** | `[ai-workflow] Clean up workflow execution logs` (Phase 8: report) | `[ai-workflow] Clean up all workflow artifacts` |

## 環境変数

### 必須
- `GITHUB_TOKEN`: GitHub パーソナルアクセストークン（`repo` スコープ）
- `GITHUB_REPOSITORY`: `owner/repo` 形式（メタデータからフォールバック）

### エージェント設定（Issue #188で整理）

認証情報は用途別に分離されています：

#### OpenAI 系
| 環境変数 | 用途 | 備考 |
|---------|------|------|
| `CODEX_API_KEY` | Codex エージェント専用 | フェーズ実行（execute/review/revise）に使用 |
| `OPENAI_API_KEY` | OpenAI API 専用 | テキスト生成（Follow-up Issue 生成、レビュー解析等）に使用 |

#### Claude 系
| 環境変数 | 用途 | 優先順位 |
|---------|------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code エージェント | **優先** |
| `CLAUDE_CODE_API_KEY` | Claude Code エージェント | フォールバック（OAuth トークンがない場合） |
| `CLAUDE_MODEL` | Claude モデル指定（Issue #301） | エイリアス（opus/sonnet/haiku）またはフルモデルID。デフォルト: `opus` |
| `ANTHROPIC_API_KEY` | Anthropic API 呼び出し | テキスト生成（Follow-up Issue 生成等）に使用 |
| `CLAUDE_CODE_CREDENTIALS_PATH` | credentials.json パス | **非推奨**、レガシーサポート |

### フォローアップIssue生成設定（v0.5.0、Issue #119で追加）
- `FOLLOWUP_LLM_MODE`: LLMプロバイダ（`auto` | `openai` | `claude` | `agent` | `off`、デフォルト: `off`）
- `FOLLOWUP_LLM_MODEL`: 使用モデル（`gpt-4o-mini` | `claude-3-sonnet-20240229` 等）
- `OPENAI_API_KEY`: OpenAI APIキー（`--followup-llm-mode openai` 使用時）
- `ANTHROPIC_API_KEY`: Anthropic APIキー（`--followup-llm-mode claude` 使用時）

### マルチリポジトリサポート
- `REPOS_ROOT`: リポジトリの親ディレクトリ（v0.2.0）
  - Jenkins環境では必須（Issue #153で明確化）
  - `auto-issue` コマンド実行時、対象リポジトリの自動解決に使用

### ロギング設定（Issue #61で追加）
- `LOG_LEVEL`: ログレベル制御（`debug` | `info` | `warn` | `error`、デフォルト: `info`）
- `LOG_NO_COLOR`: カラーリング無効化（CI環境用、`true` | `1` で有効化）

### コミットスカッシュ設定（Issue #194で追加）
- `AI_WORKFLOW_SQUASH_ON_COMPLETE`: スカッシュ機能のデフォルト動作（`true` | `false`、デフォルト: `false`）

### Docker環境設定（Issue #177で追加）
- `AGENT_CAN_INSTALL_PACKAGES`: エージェントがパッケージをインストール可能かどうか（`true` | `1` で有効化、デフォルト: `false`）
  - Docker環境では Dockerfile で明示的に `true` を設定
  - エージェントが必要に応じて多言語環境（Python、Go、Java、Rust、Ruby）をインストール可能
  - セキュリティ: デフォルトは無効、Docker内部のみで有効化を推奨

### Git 設定
- `GIT_COMMIT_USER_NAME`: Git コミット作成者名（デフォルト: git config から）
- `GIT_COMMIT_USER_EMAIL`: Git コミット作成者メール（デフォルト: git config から）

### 環境変数アクセス管理（Issue #51で追加）

すべての環境変数アクセスは `src/core/config.ts` の Config クラスを経由します。`process.env` への直接アクセスは行わないでください。

**Config クラスの使用方法**:
```typescript
import { config } from '@/core/config';

// 必須環境変数（未設定時は例外をスロー）
const token = config.getGitHubToken();
const homeDir = config.getHomeDir();

// オプション環境変数（未設定時は null を返す）
const reposRoot = config.getReposRoot();

// エージェント用（用途別に分離、Issue #188）
const codexKey = config.getCodexApiKey();      // CODEX_API_KEY のみ
const claudeToken = config.getClaudeCodeToken(); // OAUTH_TOKEN → API_KEY のフォールバック

// API用（テキスト生成）
const openAiKey = config.getOpenAiApiKey();    // OPENAI_API_KEY のみ
const anthropicKey = config.getAnthropicApiKey(); // ANTHROPIC_API_KEY のみ

// CI環境判定
if (config.isCI()) {
  // CI環境での処理
}
```

**主な利点**:
- 型安全な環境変数アクセス（必須: `string`、オプション: `string | null`）
- 用途別の API キー分離（エージェント用 vs API 呼び出し用）
- Claude Code 認証のフォールバック（`OAUTH_TOKEN` → `API_KEY`）
- テスト容易性の向上（Config モックにより環境変数を簡単にモック可能）

## Jenkins 統合

### 実行モード別Jenkinsfile（v0.4.0、Issue #211で追加）

実行モード別に分割されたJenkinsfileがDocker コンテナ内でワークフローを実行します：

**実行モード専用Jenkinsfile**:
- `jenkins/Jenkinsfile.all-phases` … 全フェーズ実行（Phase 0-9）
- `jenkins/Jenkinsfile.preset` … プリセットワークフロー実行
  - 7種類のプリセット: `review-requirements`, `review-design`, `review-test-scenario`, `quick-fix`, `implementation`, `testing`, `finalize`
- `jenkins/Jenkinsfile.single-phase` … 単一フェーズ実行
  - 10種類のフェーズ: `planning`, `requirements`, `design`, `test-scenario`, `implementation`, `test-implementation`, `testing`, `documentation`, `report`, `evaluation`
- `jenkins/Jenkinsfile.rollback` … フェーズ差し戻し実行（v0.4.0、Issue #90）
- `jenkins/Jenkinsfile.auto-issue` … 自動Issue生成（v0.5.0、Issue #121）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` … PRコメント自動対応（init + execute）（v0.6.0、Issue #393）
- `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` … PRコメント解決処理（finalize）（v0.6.0、Issue #393）

**共通処理モジュール**:
- `jenkins/shared/common.groovy` … 認証情報準備、環境セットアップ、Node.js環境、成果物アーカイブ

**非推奨ファイル**:
- `Jenkinsfile`（ルートディレクトリ） … 非推奨（削除予定: 2025年3月以降、並行運用期間終了後）

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

## テスト関連の注意事項

- テストフレームワーク: Jest with ES modules（`NODE_OPTIONS=--experimental-vm-modules`）
- ユニットテスト: `tests/unit/`（フェーズ依存関係、プリセット解決、リポジトリ解決、レポートクリーンアップ）
- 統合テスト: `tests/integration/`（プリセット実行、マルチリポジトリワークフロー）
- テストでのファイル操作には `fs-extra` を使用
- **テストコードのロギング**: テストファイル（`tests/`配下）でも統一loggerモジュールを使用する。console.log/error/warn等の直接使用は禁止（ESLintの `no-console` ルールで強制）

### テストコード品質のベストプラクティス（Issue #115で追加）

#### TypeScript 5.x + Jest型定義の互換性
- TypeScript 5.xの厳格な型チェックにより、`jest.fn().mockResolvedValue()`の型推論が正しく機能しない場合がある
- **解決策1**: 型パラメータを明示的に指定（`jest.fn<any>()`）
- **解決策2**: 型アサーションを`as any`に統一
- **参考**: Issue #102、Issue #105、Issue #115

**型アノテーション例**:
```typescript
// ❌ 型推論エラーの例
mockGitHub = {
  getIssueInfo: jest.fn().mockResolvedValue({ number: 113 }),  // TS2352エラー
} as any;

// ✅ 型パラメータを明示的に指定
mockGitHub = {
  getIssueInfo: jest.fn<any>().mockResolvedValue({ number: 113 }),
} as any;

// ✅ mockResolvedValue()の戻り値に型アノテーション
jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

// ✅ mockImplementation()のパラメータ型をanyに
jest.spyOn(phase as any, 'revise').mockImplementation(async (feedback: any) => {
  return { success: true, output: 'planning.md' };
});
```

#### モック設定のベストプラクティス
- 過度に広範囲なモック設定は、意図しない影響を与える可能性がある
- **モック範囲を限定する戦略**:
  1. 特定ファイルパスのみをモック
  2. 必要最小限のメソッドのみをモック
  3. モックを設定しない（実ファイルシステムアクセスを許可）

**モッククリーンアップの重要性**（Issue #115で強調）:
- **必須**: `afterEach()`で`jest.restoreAllMocks()`を呼び出し、テスト後に全モックをクリーンアップ
- **理由**: テスト間でモックが残留すると、意図しない副作用が発生する
- **例**: 前のテストの`jest.spyOn(fs, 'readFileSync')`が後続のテストに影響

```typescript
describe('My Test Suite', () => {
  afterEach(() => {
    // ✅ 全モックをクリーンアップ
    jest.restoreAllMocks();

    // テストディレクトリのクリーンアップ
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  it('should handle file operations', () => {
    // テスト内でモックを作成
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // テスト処理...
  });
  // ✅ afterEach()で自動的にモックがクリーンアップされる
});
```

**モック範囲を限定する例**（Issue #115のupdateFileSystemMock戦略）:
```typescript
/**
 * ファイルシステムモックを限定的に設定
 *
 * プロンプトファイル読み込み（loadPrompt）に影響を与えないよう、
 * 特定のファイルパスのみをモックする。
 */
function setupFileSystemMock(): void {
  // 空の関数 = モックを設定しない
  // 実ファイルシステムアクセスを許可し、loadPrompt()が正常に動作する
}
```

#### テストデータの充実
- フェーズ固有のキーワード検証テストでは、適切なテストデータを用意する
- **Planning Phaseの例** (Issue #115):
  - 日本語キーワード: 実装戦略、テスト戦略、タスク分割
  - 英語キーワード: Implementation Strategy、Test Strategy、Task Breakdown
  - 最小文字数: 100文字以上
  - 最小セクション数: 2個以上の`##`ヘッダー

```typescript
// ✅ 適切なテストデータ
const content = `
# Planning Document

## Section 1: Implementation Strategy
This is a comprehensive analysis with detailed explanations.
実装戦略: EXTEND strategy will be used for this implementation.

## Section 2: Test Strategy
More detailed content with implementation strategy information.
テスト戦略: UNIT_INTEGRATION testing approach will be applied.

## Section 3: Task Breakdown
Additional sections with test strategy details.
タスク分割: Tasks are divided into multiple phases.
`;

// ❌ 不十分なテストデータ（キーワード欠落、短すぎる）
const content = `
# Planning Document

## Section 1
Short content.
`;
```

### Jest設定（ESMパッケージ対応）

`jest.config.cjs` の `transformIgnorePatterns` で、ESMパッケージ（`chalk`, `strip-ansi`, `ansi-regex`, `#ansi-styles`）を変換対象に含める設定を追加しています：

```javascript
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
],
```

この設定により、統合テスト（`commit-manager.test.ts` 等）で chalk を使用するモジュールが正しく処理されます。

**主な変更履歴**:
- Issue #102: chalk、strip-ansi、ansi-regex を transformIgnorePatterns に追加
- Issue #105: chalk の内部依存（#ansi-styles）を transformIgnorePatterns に追加

**既知の制限**:
- chalk v5.3.0（ESM only）の内部依存である `#ansi-styles` は Node.js の subpath imports 機能を使用しています
- Jest の `transformIgnorePatterns` に `#ansi-styles` を追加しても、一部の環境では完全にESMエラーが解決されない場合があります
- 問題が継続する場合は、experimental-vm-modules の設定強化、または chalk v4.x（CommonJS版）への切り替えを検討してください

詳細は Issue #102、Issue #105 を参照してください。

## 主要な設計パターン

### エージェントフォールバック戦略
1. プライマリエージェント（`--agent` フラグに基づいて Codex または Claude）
2. 認証エラーまたは空出力の場合: 代替エージェントにフォールバック
3. エージェント選択はコンソールとメタデータに記録

### 自動リトライ付きレビューサイクル
1. フェーズを実行 → 2. 出力をレビュー → 3. 失敗した場合: 修正（最大 3 回まで）→ 4. レビューを繰り返し

### 再開機能
- `ResumeManager`（`src/utils/resume.ts`）が不完全/失敗したフェーズを検出
- `canResume()`: ワークフローが開始されているが完了していないかチェック
- `getResumePhase()`: 次に実行すべきフェーズを返す
- `--phase all` で最後の失敗から継続するために使用

### エージェントログフォーマット
- **Codex**: JSON イベント → ターンごとの内訳を含む Markdown サマリー
- **Claude**: SDK イベント → ツール使用と結果を含む Markdown
- 生ログは `agent_log_raw.txt` として保存、フォーマット済みは `agent_log.md`

## 重要な制約事項

1. **プロンプトは決定的**: `src/prompts/` 内のすべてのテンプレートはビルド時に `dist/` へコピーされる
2. **メタデータはバージョン管理対象**: `.ai-workflow/` はフィーチャーブランチにコミットされる
3. **PR の手動編集不可**: PR 本文は Report phase（Phase 8）で生成される
4. **フェーズ依存関係は厳格**（`--skip-dependency-check` または `--ignore-dependencies` を使用しない限り）
5. **Git 操作にはクリーンな作業ツリーが必要**（pull 時、未コミットの変更がある場合はスキップ）
6. **ファイル参照は `@relative/path` 形式を使用**（エージェントコンテキスト用、`getAgentFileReference()` 参照）
7. **Git URLのセキュリティ**: HTTPS形式のGit URLに埋め込まれたPersonal Access Tokenは自動的に除去される（v0.3.1、Issue #54）。SSH形式の利用を推奨。
8. **ロギング規約（Issue #61）**: console.log/error/warn等の直接使用は禁止。統一loggerモジュール（`src/utils/logger.ts`）を使用し、`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` を呼び出す。ESLintの `no-console` ルールで強制。
9. **環境変数アクセス規約（Issue #51）**: `process.env` への直接アクセスは禁止。Config クラス（`src/core/config.ts`）の `config.getXxx()` メソッドを使用する。必須環境変数は例外をスロー、オプション環境変数は `null` を返す。
10. **エラーハンドリング規約（Issue #48）**: `as Error` 型アサーションの使用は禁止。エラーハンドリングユーティリティ（`src/utils/error-utils.ts`）の `getErrorMessage()`, `getErrorStack()`, `isError()` を使用する。TypeScript の catch ブロックで `unknown` 型のエラーから安全にメッセージを抽出し、非 Error オブジェクト（string、number、null、undefined）がスローされる場合にも対応する。
11. **フォールバック機構の制約（Issue #113）**: フォールバック機構（`enableFallback: true`）が有効なフェーズでは、エージェントが成果物ファイルを生成しなくても、ログから自動抽出またはrevise呼び出しで復旧を試みる。ただし、以下の条件を満たす必要がある：
    - **ログ存在**: `agent_log.md` が存在すること
    - **コンテンツ長**: 抽出内容が100文字以上
    - **セクション数**: 2個以上のセクションヘッダー（`##`）を含む
    - **キーワード**: フェーズ固有キーワードが少なくとも1つ含まれる（すべて欠落の場合は無効）
    - **revise実装**: ログ抽出失敗時にreviseメソッドが実装されていること（未実装の場合はエラー）
12. **セキュリティ: ReDoS攻撃の防止（Issue #140、Issue #161で完了）**: 正規表現を動的に生成する場合、ユーザー入力やテンプレート変数をそのまま `new RegExp()` に渡すと ReDoS（Regular Expression Denial of Service）攻撃のリスクがある。以下の対策を推奨：
    - **文字列置換**: リテラル文字列の置換には `String.prototype.replaceAll()` を使用（Node.js 15.0.0以降）
    - **エスケープ処理**: 正規表現が必須の場合は、ユーザー入力を適切にエスケープ（例: `escape-string-regexp` ライブラリ）
    - **パフォーマンステスト**: 正規表現パターンに対してタイムアウトテストを実施（OWASP CWE-1333）
    - **実装完了**: `fillTemplate` メソッド（`src/core/claude-agent-client.ts` および `src/core/codex-agent-client.ts`）では、`new RegExp(\`{${key}}\`, 'g')` を `replaceAll(\`{${key}}\`, value)` に置換し、ReDoS脆弱性を完全に排除（99.997%のパフォーマンス改善を達成、Issue #161で修正完了）

## よくあるトラブルシューティング

- **"Workflow not found"**: まず `init` コマンドを実行してください
- **エージェント認証エラー**: `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` を確認してください
- **依存関係検証失敗**: `--ignore-dependencies` を使用するか、前提フェーズを完了させてください
- **マルチリポジトリ解決失敗**: `REPOS_ROOT` 環境変数を設定するか、標準パスにリポジトリが存在することを確認してください

## 追加ドキュメント

- **ARCHITECTURE.md**: 詳細なモジュールアーキテクチャとデータフロー
- **DOCKER_AUTH_SETUP.md**: Codex/Claude 認証のセットアップ
- **SETUP_TYPESCRIPT.md**: ローカル開発環境のセットアップ手順
- **TROUBLESHOOTING.md**: よくある問題と解決方法
- **ROADMAP.md**: 今後の機能計画
