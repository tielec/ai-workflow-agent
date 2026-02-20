# 詳細設計書: Issue #714 — Jenkins に split-issue ジョブを追加

## 0. Planning Document・要件定義書の確認

### 開発計画の参照

Planning Phase（`.ai-workflow/issue-714/00_planning/output/planning.md`）および Requirements Phase（`.ai-workflow/issue-714/01_requirements/output/requirements.md`）で策定された計画・要件を確認済み。以下の戦略に基づいて本設計書を作成する。

| 項目 | 策定内容 |
|------|---------|
| 実装戦略 | **CREATE** — 新規ファイル2件の作成と既存ファイル2件への追記 |
| テスト戦略 | **UNIT_ONLY** — Jenkins パイプライン定義は静的検証のみ |
| テストコード戦略 | **CREATE_TEST** — 構文検証・整合性チェックの新規テスト作成 |
| 複雑度 | **簡単** — 既存テンプレートの差分変更が中心 |
| リスク評価 | **低** — テンプレート元（`rewrite-issue`）が安定稼働中 |

### 要件定義書のトレーサビリティ

本設計書は以下の機能要件に対応する設計を提供する：

| 要件ID | 要件名 | 設計セクション |
|--------|--------|---------------|
| FR-001 | Jenkinsfile の新規作成（14項目） | [4.1 Jenkinsfile 詳細設計](#41-jenkinsfile-詳細設計) |
| FR-002 | Job DSL の新規作成（15項目） | [4.2 Job DSL 詳細設計](#42-job-dsl-詳細設計) |
| FR-003 | job-config.yaml への新規エントリ追加（9項目） | [4.3 job-config.yaml 詳細設計](#43-job-configyaml-詳細設計) |
| FR-004 | jenkins/README.md の更新（6項目） | [4.4 README.md 詳細設計](#44-readmemd-詳細設計) |

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                    Jenkins Server                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Admin_Jobs/ai-workflow-job-creator (Seed Job)       │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │ job-config.yaml                              │     │   │
│  │  │  ├─ ai_workflow_all_phases_job               │     │   │
│  │  │  ├─ ai_workflow_preset_job                   │     │   │
│  │  │  ├─ ...                                      │     │   │
│  │  │  ├─ ai_workflow_rewrite_issue_job            │     │   │
│  │  │  ├─ ai_workflow_split_issue_job  ◀── 新規追加 │     │   │
│  │  │  └─ ai_workflow_ecr_build_job               │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼ シードジョブ実行                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AI_Workflow/ (10フォルダ自動生成)                     │   │
│  │  ├─ develop/                                         │   │
│  │  │  ├─ all_phases                                    │   │
│  │  │  ├─ ...                                           │   │
│  │  │  ├─ rewrite_issue                                 │   │
│  │  │  ├─ split_issue  ◀── 新規生成                      │   │
│  │  │  └─ ecr_build                                     │   │
│  │  ├─ stable-1/ ... stable-9/                          │   │
│  │  │  └─ (同一構成)                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
┌─────────────────────────┐
│  Job DSL (.groovy)      │───定義───▶ Jenkins ジョブ生成
│  ai_workflow_split_     │            │
│  issue_job.groovy       │            │
└───────────┬─────────────┘            │
            │ scriptPath 参照           ▼
┌───────────▼─────────────┐    ┌──────────────────┐
│  Jenkinsfile            │───▶│ Docker コンテナ   │
│  split-issue/           │    │  (ec2-fleet-micro)│
│  Jenkinsfile            │    │                   │
└───────────┬─────────────┘    │  node dist/       │
            │ load              │  index.js         │
┌───────────▼─────────────┐    │  split-issue      │
│  shared/common.groovy   │    │  --issue N        │
│  (共通ライブラリ)        │    │  --max-splits M   │
│  - prepareAgentCreds()  │    └──────────────────┘
│  - prepareCodexAuth()   │            │
│  - setupEnvironment()   │            ▼
│  - setupNodeEnv()       │    ┌──────────────────┐
│  - sendWebhook()        │    │  CLI (TypeScript) │
└─────────────────────────┘    │  split-issue.ts   │
                               │  (Issue #715 済み) │
┌─────────────────────────┐    └──────────────────┘
│  job-config.yaml        │
│  (シード設定)            │───エントリ参照───▶ DSL/Jenkinsfile パス解決
└─────────────────────────┘
```

### 1.3 データフロー

```
ユーザー入力 (Jenkins UI)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Job DSL パラメータ (19個)                         │
│ ISSUE_NUMBER, GITHUB_REPOSITORY, MAX_SPLITS,    │
│ APPLY, DRY_RUN, AGENT_MODE, LANGUAGE,           │
│ GITHUB_TOKEN, API Keys, Webhook設定 ...          │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Jenkinsfile パイプライン実行                       │
│                                                   │
│ 1. Load Common Library                            │
│ 2. Prepare Codex auth.json                       │
│ 3. Prepare Agent Credentials                      │
│ 4. Validate Parameters                            │
│    └─ ISSUE_NUMBER 必須・数値チェック              │
│    └─ GITHUB_REPOSITORY 必須・owner/repo形式      │
│ 5. Setup Environment                              │
│    └─ REPOS_ROOT作成 + リポジトリクローン          │
│ 6. Setup Node.js Environment                      │
│    └─ npm install + npm run build                 │
│ 7. Execute Split Issue                            │
│    └─ node dist/index.js split-issue              │
│       --issue N --language L --agent M            │
│       [--apply|--dry-run] [--max-splits S]        │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Post Processing                                   │
│ - REPOS_ROOT クリーンアップ                       │
│ - CODEX_HOME クリーンアップ                       │
│ - cleanWs()                                       │
│ - Webhook通知 (success/failed)                    │
└─────────────────────────────────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: CREATE

**判断根拠**:
- 新規作成ファイルが中心（Jenkinsfile 1件、Job DSL 1件の2ファイルを新規作成）
- 既存ファイルへの変更は設定ファイルへの追記（`job-config.yaml` に6行のエントリ追加）とドキュメント更新（`README.md` に数行追加）のみであり、いずれも独立したエントリの追加であるため既存コードのロジック変更は一切ない
- 既存の `rewrite-issue` ジョブを「テンプレート」としてコピー＆カスタマイズする作業であり、リファクタリングや既存機能の拡張には該当しない
- 共通ライブラリ（`jenkins/shared/common.groovy`）への変更は不要

---

## 3. テスト戦略判断

### テスト戦略: UNIT_ONLY

**判断根拠**:
- 本 Issue の成果物は Jenkins パイプライン定義ファイル（Groovy）と設定ファイル（YAML）であり、実際のパイプライン動作は Jenkins 環境でのみ検証可能
- コードレベルで実施可能なテストは静的検証（構文チェック、パラメータ整合性確認、ファイル存在確認）に限定される
- CLI 側のテスト（ユニットテスト39件、統合テスト7件）は Issue #715 で実装完了済みであり、追加テスト不要
- Jenkins 環境での統合テスト（E2E テスト）は本 Issue のスコープ外（シードジョブの実運用で確認する性質）
- BDD テストは Jenkins パイプライン定義のテストに適さない（ユーザーストーリーは Jenkins UI の操作であり、コードレベルでの BDD は不適切）

---

## 4. テストコード戦略判断

### テストコード戦略: CREATE_TEST

**判断根拠**:
- 新規作成するファイル群（Jenkinsfile、Job DSL）に対する検証テストが必要
- 既存の Jenkins ジョブ定義に対するテストファイルは存在しないため、新規テストファイルを作成する必要がある
- テスト内容は主に静的検証（ファイル存在確認、YAML 構文チェック、パラメータ整合性チェック）が中心
- 既存の TypeScript テスト（`tests/unit/`、`tests/integration/`）とは別の検証領域であり、拡張ではなく新規作成が適切

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

| カテゴリ | ファイル | 影響内容 | リスク |
|---------|---------|---------|-------|
| 設定追記 | `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` | 末尾（`ai_workflow_ecr_build_job` の前、`ai_workflow_rewrite_issue_job` の後）に独立エントリ6行を追加 | 極低（独立エントリのため既存エントリに影響なし） |
| ドキュメント更新 | `jenkins/README.md` | ジョブ一覧テーブルに1行追加、ディレクトリ構造図に2行追加、フォルダ構成図に1行追加、ジョブ数を更新 | なし（ドキュメントのみ） |

### 5.2 既存ジョブへの影響

- 既存の12種類のジョブには **一切影響なし**
- シードジョブ実行時に新たに `split_issue` ジョブが追加生成されるのみ
- 既存ジョブの再生成時にも影響なし（`job-config.yaml` への追記は独立エントリ）
- 共通ライブラリ `jenkins/shared/common.groovy` への変更なし

### 5.3 依存関係の変更

- **新規依存の追加**: なし
- **既存依存の変更**: なし
- **npm パッケージ変更**: なし
- 新規ファイルは既存の共通ライブラリに依存するが、共通ライブラリ側の変更は不要

### 5.4 マイグレーション要否

- **データベーススキーマ変更**: なし
- **設定ファイル変更**: `job-config.yaml` へのエントリ追加のみ（破壊的変更なし、後方互換性あり）
- **環境変数追加**: なし（既存の環境変数をそのまま利用）

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル（2件）

| # | ファイルパス（相対パス） | 説明 | テンプレート元 | 推定行数 |
|---|------------------------|------|---------------|---------|
| 1 | `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` | split-issue パイプライン定義 | `rewrite-issue/Jenkinsfile`（282行） | 約295行 |
| 2 | `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` | split-issue Job DSL 定義 | `ai_workflow_rewrite_issue_job.groovy`（212行） | 約225行 |

### 6.2 変更ファイル（2件）

| # | ファイルパス（相対パス） | 変更内容 | 変更行数 |
|---|------------------------|---------|---------|
| 1 | `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` | `ai_workflow_split_issue_job` エントリの追加 | +7行 |
| 2 | `jenkins/README.md` | ジョブ一覧・ディレクトリ構造・フォルダ構成の更新 | +6行、既存1行変更 |

### 6.3 削除ファイル

なし

---

## 7. 詳細設計

### 4.1 Jenkinsfile 詳細設計

**ファイルパス**: `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile`

#### 4.1.1 テンプレートからの変更マッピング

`rewrite-issue/Jenkinsfile` をベースに、以下の差分を適用する。変更箇所は最小限に抑え、テンプレートとの一貫性を維持する。

| # | 変更箇所 | 行範囲（テンプレート参照） | 変更前（rewrite-issue） | 変更後（split-issue） | 対応要件 |
|---|---------|------------------------|------------------------|---------------------|---------|
| 1 | コメントヘッダー | 1-20行 | `Rewrite Issue Mode` / パラメータ一覧 | `Split Issue Mode` / `MAX_SPLITS` パラメータ追記 | FR-001-14 |
| 2 | `EXECUTION_MODE` | 45行 | `'rewrite_issue'` | `'split_issue'` | FR-001-2 |
| 3 | モード表示 | 73行 | `"Mode: Rewrite Issue"` | `"Mode: Split Issue"` | FR-001-1 |
| 4 | ビルド説明 | 137行 | `"Rewrite Issue #..."` | `"Split Issue #..."` | FR-001-7 |
| 5 | パラメータログ | 146行付近 | なし | `echo "Max Splits: ${params.MAX_SPLITS ?: '10'}"` 追加 | FR-001-4 |
| 6 | ステージ名 | 167行 | `'Execute Rewrite Issue'` | `'Execute Split Issue'` | FR-001-3 |
| 7 | ステージヘッダー | 171行 | `"Stage: Execute Rewrite Issue"` | `"Stage: Execute Split Issue"` | FR-001-3 |
| 8 | パラメータログ（実行ステージ） | 177行付近 | なし | `echo "Max Splits: ${params.MAX_SPLITS ?: '10'}"` 追加 | FR-001-4 |
| 9 | ビルド説明（実行ステージ） | 181行 | `"Rewrite Issue #..."` | `"Split Issue #..."` | FR-001-7 |
| 10 | CLI コマンド | 191行 | `rewrite-issue` | `split-issue` | FR-001-3 |
| 11 | `maxSplitsOption` 変数 | 189行付近（新規追加） | なし | `def maxSplitsOption = params.MAX_SPLITS ? "--max-splits ${params.MAX_SPLITS}" : ''` | FR-001-4 |
| 12 | CLI 引数に `maxSplitsOption` 追加 | 196行付近 | なし | `${maxSplitsOption}` を CLI 引数に追加 | FR-001-4 |
| 13 | Post ビルド説明 | 213行 | `"Rewrite Issue #..."` | `"Split Issue #..."` | FR-001-7 |
| 14 | 成功ログ | 237-243行 | `"Rewrite Issue Success"` / `"Rewrite issue completed"` | `"Split Issue Success"` / `"Split issue completed"` | FR-001-9 |
| 15 | 失敗ログ | 261-265行 | `"Rewrite Issue Failure"` | `"Split Issue Failure"` | FR-001-9 |

#### 4.1.2 パイプラインステージ構成

テンプレート（`rewrite-issue`）と同一のステージ構成を維持する（FR-001-11）：

```
1. Load Common Library     → common.groovy ロード + Webhook(running) 送信
2. Prepare Codex auth.json → common.prepareCodexAuthFile()
3. Prepare Agent Credentials → common.prepareAgentCredentials()
4. Validate Parameters     → ISSUE_NUMBER / GITHUB_REPOSITORY バリデーション
5. Setup Environment       → common.setupEnvironment()
6. Setup Node.js Environment → common.setupNodeEnvironment()
7. Execute Split Issue     → node dist/index.js split-issue 実行
```

#### 4.1.3 Execute Split Issue ステージの CLI コマンド構築ロジック

```groovy
// パラメータからCLIオプションを構築
def issueNumber = params.ISSUE_NUMBER
def languageOption = params.LANGUAGE ? "--language ${params.LANGUAGE}" : ''
def agentOption = "--agent ${params.AGENT_MODE ?: 'auto'}"
def applyFlag = params.APPLY ? '--apply' : ''
def dryRunFlag = (!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''
def maxSplitsOption = params.MAX_SPLITS ? "--max-splits ${params.MAX_SPLITS}" : ''

sh """
    node dist/index.js split-issue \\
        --issue ${issueNumber} \\
        ${languageOption} \\
        ${agentOption} \\
        ${applyFlag} \\
        ${dryRunFlag} \\
        ${maxSplitsOption}
"""
```

**APPLY/DRY_RUN 排他制御のロジック**（`rewrite-issue` と同一、FR-001-6）：

```
APPLY=true,  DRY_RUN=any   → --apply のみ（DRY_RUN は無視）
APPLY=false, DRY_RUN=true  → --dry-run のみ
APPLY=false, DRY_RUN=false → どちらも付与しない（CLIデフォルト動作）
```

**MAX_SPLITS パラメータの受け渡しロジック**（FR-001-4）：

```
MAX_SPLITS が非空文字列 → "--max-splits ${params.MAX_SPLITS}" を付与
MAX_SPLITS が空文字列   → "--max-splits" オプション自体を省略（CLI側デフォルト10が適用）
```

#### 4.1.4 environment ブロック

テンプレートと同一の環境変数定義。唯一の差分は `EXECUTION_MODE`：

```groovy
environment {
    CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'
    WORKFLOW_DIR = '.'
    WORKFLOW_VERSION = '0.2.0'
    AI_WORKFLOW_LANGUAGE = "${params.LANGUAGE ?: 'ja'}"
    EXECUTION_MODE = 'split_issue'  // ◀ 唯一の差分
    CODEX_HOME = ''
    LOG_NO_COLOR = 'true'

    GIT_COMMIT_USER_NAME = "${params.GIT_COMMIT_USER_NAME ?: 'AI Workflow Bot'}"
    GIT_COMMIT_USER_EMAIL = "${params.GIT_COMMIT_USER_EMAIL ?: 'ai-workflow@example.com'}"

    AWS_ACCESS_KEY_ID = "${params.AWS_ACCESS_KEY_ID ?: ''}"
    AWS_SECRET_ACCESS_KEY = "${params.AWS_SECRET_ACCESS_KEY ?: ''}"
    AWS_SESSION_TOKEN = "${params.AWS_SESSION_TOKEN ?: ''}"

    GITHUB_TOKEN = "${params.GITHUB_TOKEN}"
    GITHUB_REPOSITORY = "${params.GITHUB_REPOSITORY ?: 'tielec/ai-workflow-agent'}"

    CODEX_API_KEY = "${params.CODEX_API_KEY ?: ''}"
    OPENAI_API_KEY = "${params.OPENAI_API_KEY ?: ''}"

    CLAUDE_CODE_OAUTH_TOKEN = "${params.CLAUDE_CODE_OAUTH_TOKEN ?: ''}"
    CLAUDE_CODE_API_KEY = "${params.CLAUDE_CODE_API_KEY ?: ''}"
    ANTHROPIC_API_KEY = "${params.ANTHROPIC_API_KEY ?: ''}"
}
```

#### 4.1.5 agent ブロック（変更なし）

```groovy
agent {
    dockerfile {
        label 'ec2-fleet-micro'
        dir '.'
        filename 'Dockerfile'
        args "-v \${WORKSPACE}:/workspace -w /workspace -e CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1"
    }
}
```

#### 4.1.6 post セクション

テンプレートと同一構造。差分はテキスト文字列のみ：

- `post.always`: ビルド説明を `"Split Issue #..."` に設定、REPOS_ROOT/CODEX_HOME クリーンアップ、`cleanWs()`
- `post.success`: `"Split Issue Success"` ログ + Webhook(success) 送信
- `post.failure`: `"Split Issue Failure"` ログ + Webhook(failed) 送信

---

### 4.2 Job DSL 詳細設計

**ファイルパス**: `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy`

#### 4.2.1 テンプレートからの変更マッピング

`ai_workflow_rewrite_issue_job.groovy` をベースに、以下の差分を適用する。

| # | 変更箇所 | 行範囲 | 変更前（rewrite-issue） | 変更後（split-issue） | 対応要件 |
|---|---------|-------|------------------------|---------------------|---------|
| 1 | コメントヘッダー | 1-7行 | `Rewrite Issue Job DSL` / `rewrite_issue` | `Split Issue Job DSL` / `split_issue` | FR-002-14 |
| 2 | `jobKey` | 18行 | `'ai_workflow_rewrite_issue_job'` | `'ai_workflow_split_issue_job'` | FR-002-2 |
| 3 | description ヘッダー | 27行 | `AI Workflow - Rewrite Issue` | `AI Workflow - Split Issue` | FR-002-9 |
| 4 | description 概要 | 31行 | `既存のGitHub Issue本文を再設計し...` | `複雑なGitHub Issueを機能単位の子Issueに分割します。` | FR-002-9 |
| 5 | description 機能リスト | 33-36行 | rewrite-issue の機能説明 | split-issue の機能説明 | FR-002-9 |
| 6 | description 注意事項 | 39行 | `'rewrite_issue'` | `'split_issue'` | FR-002-9 |
| 7 | `EXECUTION_MODE` choiceParam | 48行 | `['rewrite_issue']` | `['split_issue']` | FR-002-3 |
| 8 | `MAX_SPLITS` パラメータ追加 | 87行の後（新規） | なし | `stringParam('MAX_SPLITS', '10', ...)` | FR-002-4, FR-002-5 |
| 9 | `scriptPath` | 184行 | `'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile'` | `'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile'` | FR-002-7 |
| 10 | `environmentVariables` EXECUTION_MODE | 190行 | `'rewrite_issue'` | `'split_issue'` | FR-002-8 |

#### 4.2.2 パラメータ定義（19個）

テンプレートの18パラメータに `MAX_SPLITS` を1つ追加して合計19個とする。

```
セクション: 実行モード（固定値）
  1. EXECUTION_MODE  choiceParam    ['split_issue']

セクション: 基本設定
  2. ISSUE_NUMBER    stringParam    ''
  3. GITHUB_REPOSITORY stringParam ''
  4. AGENT_MODE      choiceParam    ['auto','codex','claude']
  5. LANGUAGE        choiceParam    ['ja','en']

セクション: 実行オプション
  6. APPLY           booleanParam   true
  7. DRY_RUN         booleanParam   false
  8. MAX_SPLITS      stringParam    '10'      ◀ 新規追加（DRY_RUN の直後）

セクション: APIキー設定
  9.  GITHUB_TOKEN            nonStoredPasswordParam
  10. OPENAI_API_KEY          nonStoredPasswordParam
  11. CODEX_API_KEY           nonStoredPasswordParam
  12. CODEX_AUTH_JSON         nonStoredPasswordParam
  13. CLAUDE_CODE_OAUTH_TOKEN nonStoredPasswordParam
  14. CLAUDE_CODE_API_KEY     nonStoredPasswordParam
  15. ANTHROPIC_API_KEY       nonStoredPasswordParam

セクション: その他
  16. LOG_LEVEL       choiceParam    ['INFO','DEBUG','WARNING','ERROR']

セクション: Webhook通知設定
  17. JOB_ID          stringParam    ''
  18. WEBHOOK_URL     nonStoredPasswordParam
  19. WEBHOOK_TOKEN   nonStoredPasswordParam
```

#### 4.2.3 MAX_SPLITS パラメータの定義

`DRY_RUN` パラメータの直後、`GITHUB_TOKEN`（APIキー設定セクション）の前に配置する（FR-002-5）。

```groovy
stringParam('MAX_SPLITS', '10', '''
分割Issue数の上限（1-20の整数、デフォルト: 10）

分割するIssueの最大数を指定します。
空欄の場合はデフォルト値（10）が使用されます。
'''.stripIndent().trim())
```

#### 4.2.4 description の設計

```groovy
description("""\
    |# AI Workflow - Split Issue
    |${descriptionHeader}
    |
    |## 概要
    |複雑なGitHub Issueを機能単位の子Issueに分割します。
    |
    |## 機能
    |- Issue番号を指定して対象Issueを分割
    |- dry-run モードで分割プレビューのみ表示
    |- apply モードで子Issueを作成
    |- 分割数上限を指定可能（デフォルト: 10）
    |
    |## 注意事項
    |- EXECUTION_MODEは内部的に'split_issue'に固定されます
    |- APPLYとDRY_RUNが両方trueの場合、APPLYが優先されます
    |""".stripMargin())
```

#### 4.2.5 フォルダ生成ロジック（変更なし）

テンプレートと完全に同一の構造を維持する：

```groovy
// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 汎用フォルダ用ジョブを作成
genericFolders.each { folder ->
    createJob(
        "AI_Workflow/${folder.name}/${jobConfig.name}",
        "フォルダ: ${folder.displayName}\nブランチ: ${folder.branch}",
        folder.branch
    )
}
```

#### 4.2.6 パイプライン定義・その他設定（変更なし）

以下の設定はテンプレートと完全に同一：

- `logRotator`: `numToKeep(30)`, `daysToKeep(90)` — FR-002-11
- `disableConcurrentBuilds()` — FR-002-12
- Git SCM 設定: `url('https://github.com/tielec/ai-workflow-agent.git')`, `credentials('github-token')` — FR-002-13
- `WORKFLOW_VERSION`: `'0.2.0'` — FR-002-8

---

### 4.3 job-config.yaml 詳細設計

**ファイルパス**: `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml`

#### 4.3.1 追加エントリ

`ai_workflow_rewrite_issue_job`（58-63行）の直後、`ai_workflow_validate_credentials_job`（65行）の前に追加する（FR-003-7）。

```yaml
  ai_workflow_split_issue_job:
    name: 'split_issue'
    displayName: 'Split Issue'
    dslfile: jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy
    jenkinsfile: jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile
    skipJenkinsfileValidation: true
```

#### 4.3.2 フォーマット規約

- インデント: スペース2個（既存エントリと同一）— FR-003-8
- キー形式: `ai_workflow_` プレフィックス + `split_issue_job` — FR-003-1
- 全フィールドが既存エントリのパターンに完全準拠

#### 4.3.3 各フィールドの設計根拠

| フィールド | 値 | 設計根拠 | 対応要件 |
|----------|---|---------|---------|
| `name` | `'split_issue'` | Jenkins ジョブのパス名として使用。`rewrite_issue` と同一パターン | FR-003-2 |
| `displayName` | `'Split Issue'` | Jenkins UI でのジョブ表示名。`Rewrite Issue` と同一パターン | FR-003-3 |
| `dslfile` | `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` | Job DSL ファイルへの相対パス | FR-003-4 |
| `jenkinsfile` | `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` | Jenkinsfile への相対パス | FR-003-5 |
| `skipJenkinsfileValidation` | `true` | ai-workflow-agent リポジトリの Jenkinsfile を使用するため、ローカル存在チェックをスキップ | FR-003-6 |

---

### 4.4 README.md 詳細設計

**ファイルパス**: `jenkins/README.md`

#### 4.4.1 ジョブ一覧テーブルの更新

`rewrite_issue` 行（75行）の直後に以下を追加（FR-004-1）：

```markdown
| **split_issue** | 複雑なIssueを機能単位で分割（split-issueコマンドのJenkins実行） | 19 |
```

#### 4.4.2 ディレクトリ構造図の更新

`rewrite-issue/` エントリ（29-30行）の直後に以下を追加（FR-004-2）：

```
│   │       ├── split-issue/
│   │       │   └── Jenkinsfile
```

DSL ファイル一覧に以下を追加（FR-004-3）：

```
│           ├── ai_workflow_split_issue_job.groovy
```

#### 4.4.3 フォルダ構成図の更新

`rewrite_issue` エントリ（159行）の直後に以下を追加（FR-004-4）：

```
│   ├── split_issue
```

#### 4.4.4 ジョブ種類数の更新

194行の記述を更新（FR-004-5）：

```
変更前: 各実行モード用のジョブ（12種類 × 10フォルダ = 120ジョブ）
変更後: 各実行モード用のジョブ（13種類 × 10フォルダ = 130ジョブ）
```

---

## 8. セキュリティ考慮事項

### 8.1 認証情報の保護

本設計は `rewrite-issue` テンプレートのセキュリティパターンを完全に踏襲する（NFR-002）：

| セキュリティ要件 | 実装方法 | 対応NFR |
|----------------|---------|--------|
| 機密情報の非永続化 | `GITHUB_TOKEN`、API キー群、`WEBHOOK_URL`、`WEBHOOK_TOKEN` に `nonStoredPasswordParam` を使用 | NFR-002-1 |
| 認証ファイルの一時展開 | `CODEX_AUTH_JSON` は実行中のみファイル展開、完了後にクリーンアップ | NFR-002-2 |
| ワークスペースクリーンアップ | `post.always` で `REPOS_ROOT`、`CODEX_HOME` 削除 + `cleanWs()` | NFR-002-3 |
| 入力バリデーション | `ISSUE_NUMBER` の数値チェック、`GITHUB_REPOSITORY` の `owner/repo` 形式チェック | NFR-002-4, NFR-002-5 |

### 8.2 MAX_SPLITS パラメータのセキュリティ

- `MAX_SPLITS` は `stringParam` として定義し、Jenkins UI から入力される
- 値の範囲バリデーション（1-20）は CLI 側（`src/commands/split-issue.ts`）で実施済み
- Jenkins 側では文字列として受け渡すのみであり、追加のバリデーションは不要（OUT-008）
- CLI への受け渡し時に Groovy の文字列補間 `"--max-splits ${params.MAX_SPLITS}"` を使用するが、`params.MAX_SPLITS` は Jenkins パラメータとして型安全に取得されるため、コマンドインジェクションのリスクは低い

### 8.3 Git URL のセキュリティ

- Job DSL の `url('https://github.com/tielec/ai-workflow-agent.git')` は固定値であり、環境変数やパラメータに依存しない
- `common.setupEnvironment()` 内でのリポジトリクローンは `GITHUB_TOKEN` を使用するが、これは既存の共通ライブラリの実装に依存しており、本 Issue での変更なし

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス（NFR-001）

| 要件 | 対応 |
|------|-----|
| NFR-001-1: シードジョブ実行時間への影響 | 新規1ジョブ定義の読み込み分（数秒以内）に限定。既存の12ジョブ定義と同一の読み込みコストである |
| NFR-001-2: ジョブ実行のオーバーヘッド | CLI 側の処理時間に依存。Jenkins ラッパー層でのオーバーヘッドは `rewrite-issue` と同等（パイプラインステージ構成が同一であるため） |

### 9.2 保守性・拡張性（NFR-004）

| 要件 | 対応 |
|------|-----|
| NFR-004-1: テンプレートパターン準拠 | `rewrite-issue` と同一のコード構造・命名規則・ステージ構成を維持 |
| NFR-004-2: 共通関数の再利用 | `jenkins/shared/common.groovy` の既存関数をそのまま利用、変更なし |
| NFR-004-3: コメントヘッダー | Jenkinsfile・Job DSL 両方に機能説明・パラメータ一覧・注意事項を記載 |
| NFR-004-4: バージョン統一 | `WORKFLOW_VERSION = '0.2.0'` を既存ジョブと統一 |

### 9.3 可用性・信頼性（NFR-003）

| 要件 | 対応 |
|------|-----|
| NFR-003-1: 既存ジョブへの非影響 | `job-config.yaml` への独立エントリ追加のみ |
| NFR-003-2: 10フォルダ自動デプロイ | テンプレートと同一の `genericFolders` ロジックを使用 |
| NFR-003-3: エラー時の通知 | `post.failure` で Webhook(failed) 送信（テンプレートと同一） |
| NFR-003-4: 並行実行防止 | `disableConcurrentBuilds()` 設定 |

---

## 10. 実装の順序

### 10.1 推奨実装順序

```
Step 1: Jenkinsfile 作成
    └─ rewrite-issue/Jenkinsfile をコピー → 差分適用
    └─ 所要時間: 0.5h

Step 2: Job DSL 作成
    └─ ai_workflow_rewrite_issue_job.groovy をコピー → 差分適用
    └─ 所要時間: 0.5h

Step 3: job-config.yaml 更新
    └─ ai_workflow_split_issue_job エントリ追加
    └─ 所要時間: 0.15h

Step 4: jenkins/README.md 更新
    └─ ジョブ一覧・構造図・フォルダ構成・ジョブ数の更新
    └─ 所要時間: 0.25h

Step 5: テスト実行
    └─ npm run validate でリグレッションチェック
    └─ YAML 構文検証
    └─ 所要時間: 0.25h
```

### 10.2 依存関係

```
Step 1 (Jenkinsfile) ─────┐
                          ├──▶ Step 3 (job-config.yaml)
Step 2 (Job DSL) ─────────┤
                          ├──▶ Step 4 (README.md)
                          │
                          └──▶ Step 5 (テスト実行)
```

- Step 1 と Step 2 は独立しており並行実装可能
- Step 3 は Step 1・Step 2 のファイルパスが確定している必要がある（ただし既に確定済みなので実質独立）
- Step 4 は全ファイルの情報が確定した後に実施
- Step 5 は全ファイルの作成・更新完了後に実施

---

## 11. 品質ゲート確認

### Phase 2 品質ゲート

- [x] **実装戦略の判断根拠が明記されている** → セクション2で CREATE を判断根拠とともに明記
- [x] **テスト戦略の判断根拠が明記されている** → セクション3で UNIT_ONLY を判断根拠とともに明記
- [x] **既存コードへの影響範囲が分析されている** → セクション5で詳細に分析
- [x] **変更が必要なファイルがリストアップされている** → セクション6で全4ファイルをリスト化
- [x] **設計が実装可能である** → セクション7で全ファイルの詳細設計（変更マッピング、コードスニペット、パラメータ定義）を提供

### 追加品質チェック

- [x] テストコード戦略の判断根拠が明記されている（セクション4: CREATE_TEST）
- [x] 全要件（FR-001〜FR-004）に対するトレーサビリティが確保されている（セクション0の対応表、各設計セクション内の対応要件カラム）
- [x] セキュリティ考慮事項が記載されている（セクション8）
- [x] 非機能要件への対応が記載されている（セクション9）
- [x] 実装順序と依存関係が明確化されている（セクション10）

---

## 補足: rewrite-issue → split-issue 変更差分サマリー

| 項目 | rewrite-issue（テンプレート） | split-issue（設計） |
|------|---------------------------|-------------------|
| EXECUTION_MODE | `'rewrite_issue'` | `'split_issue'` |
| CLI コマンド | `node dist/index.js rewrite-issue` | `node dist/index.js split-issue` |
| ステージ名 | `'Execute Rewrite Issue'` | `'Execute Split Issue'` |
| ビルド説明 | `"Rewrite Issue #..."` | `"Split Issue #..."` |
| 成功ログ | `"Rewrite Issue Success"` | `"Split Issue Success"` |
| 失敗ログ | `"Rewrite Issue Failure"` | `"Split Issue Failure"` |
| 固有パラメータ | なし | `MAX_SPLITS`（`stringParam`, デフォルト `'10'`） |
| Job DSL キー | `ai_workflow_rewrite_issue_job` | `ai_workflow_split_issue_job` |
| scriptPath | `rewrite-issue/Jenkinsfile` | `split-issue/Jenkinsfile` |
| パラメータ数 | 18 | 19 |
| description | Issue本文再設計 | 複雑なIssueを機能単位で分割 |
| 機能リスト | 再設計・差分プレビュー・更新 | 分割・プレビュー・子Issue作成・分割数上限指定 |
