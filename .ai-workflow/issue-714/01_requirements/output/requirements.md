# 要件定義書: Issue #714 — Jenkins に split-issue ジョブを追加

## 0. Planning Document の確認

### 開発計画の全体像

Planning Phase（`.ai-workflow/issue-714/00_planning/output/planning.md`）で策定された計画を確認済み。以下の戦略に基づいて本要件定義を作成する。

| 項目 | 策定内容 |
|------|---------|
| 実装戦略 | **CREATE** — 新規ファイル2件の作成と既存ファイル2件への追記 |
| テスト戦略 | **UNIT_ONLY** — Jenkins パイプライン定義は静的検証のみ |
| テストコード戦略 | **CREATE_TEST** — 構文検証・整合性チェックの新規テスト作成 |
| 複雑度 | **簡単** — 既存テンプレートの差分変更が中心 |
| 見積もり工数 | 約3〜4時間 |
| リスク評価 | **低** — テンプレート元が安定稼働中 |

### スコープ確認

- CLI側の `split-issue` コマンドは Issue #715 で実装完了済み（ユニットテスト39件、統合テスト7件パス済み）
- 本Issueは Jenkins CI/CD パイプラインからの実行を可能にするラッパー層の追加のみ
- 共通ライブラリ（`jenkins/shared/common.groovy`）への変更は不要

---

## 1. 概要

### 1.1 背景

AI Workflow Agent は Jenkins CI/CD パイプラインを通じて各種ワークフローコマンドを実行する仕組みを持つ。現在12種類のジョブタイプが Jenkins に登録されており、シードジョブ実行により全10フォルダ（develop + stable-1〜9）に自動デプロイされる構成である。

Issue #715 で `split-issue` コマンド（複雑な GitHub Issue を機能単位の子 Issue に分割する機能）の CLI 実装が完了しているが、Jenkins からの実行環境が未整備であり、CI/CD パイプラインから利用できない状態にある。

### 1.2 目的

`split-issue` コマンドを Jenkins CI/CD パイプラインから実行可能にするため、以下の3点セットを新規作成する：

1. **Jenkinsfile**（パイプライン定義）
2. **Job DSL**（ジョブ構成定義）
3. **シード設定**（`job-config.yaml` へのエントリ追加）

加えて、`jenkins/README.md` のドキュメントを更新し、新規ジョブの情報を反映する。

### 1.3 ビジネス価値

| 価値 | 説明 |
|------|------|
| 運用効率の向上 | Jenkins UI からパラメータを指定して `split-issue` を実行可能になり、CLI の直接操作が不要になる |
| CI/CD 統合の完全性 | CLI で利用可能な全コマンドが Jenkins からも実行でき、ツールキットの一貫性が保たれる |
| Webhook 通知の活用 | Lavable との連携により、ジョブ実行状況のリアルタイム通知が利用可能になる |
| マルチ環境デプロイ | シードジョブにより10フォルダ（develop + stable-1〜9）に自動デプロイされ、並行実行環境が確保される |

### 1.4 技術的価値

| 価値 | 説明 |
|------|------|
| テンプレートパターンの踏襲 | 既存の `rewrite-issue` ジョブと同一アーキテクチャで、保守性・統一性が維持される |
| Docker コンテナ実行 | Jenkins エージェント上の Docker コンテナ内で TypeScript CLI を実行する標準パターンに準拠 |
| 認証情報の安全管理 | `nonStoredPasswordParam` による機密情報の非永続化パターンを継承 |

---

## 2. 機能要件

### FR-001: Jenkinsfile の新規作成

**優先度**: 高

`jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` を新規作成する。

| 要件ID | 詳細 | 検証方法 |
|--------|------|---------|
| FR-001-1 | `rewrite-issue/Jenkinsfile` をベーステンプレートとし、`split-issue` 固有の変更を適用する | テンプレートとの diff 検証 |
| FR-001-2 | `EXECUTION_MODE` 環境変数を `'split_issue'` に設定する | Jenkinsfile 内の文字列検索 |
| FR-001-3 | 'Execute Split Issue' ステージで `node dist/index.js split-issue` コマンドを実行する | Jenkinsfile 内の CLI コマンド検証 |
| FR-001-4 | `--max-splits` オプションを `params.MAX_SPLITS` から取得して CLI に渡す（空の場合はオプション自体を省略） | パラメータ受け渡しロジック検証 |
| FR-001-5 | `--issue`、`--language`、`--agent`、`--apply`、`--dry-run` オプションを `rewrite-issue` と同一ロジックで CLI に渡す | 既存テンプレートとの一致検証 |
| FR-001-6 | `APPLY` と `DRY_RUN` の排他制御を `rewrite-issue` と同一ロジックで実装する（`APPLY=true` の場合 `DRY_RUN` は無視） | 条件分岐ロジック検証 |
| FR-001-7 | ビルド説明（`currentBuild.description`）を `"Split Issue #${env.ISSUE_NUMBER}${applyLabel}${dryRunLabel} | ${env.REPO_OWNER}/${env.REPO_NAME}"` 形式で設定する | 文字列テンプレート検証 |
| FR-001-8 | Webhook 通知で `status: 'running'`（開始時）、`status: 'success'`（成功時）、`status: 'failed'`（失敗時）を `common.sendWebhook()` 経由で送信する | Webhook 呼び出し箇所の検証 |
| FR-001-9 | `post` セクションのログメッセージを `"Split Issue Success"` / `"Split Issue Failure"` に変更する | 文字列検証 |
| FR-001-10 | `Load Common Library` ステージで `jenkins/shared/common.groovy` を読み込み、共通関数を利用する | ステージ定義検証 |
| FR-001-11 | パイプラインステージ構成を `rewrite-issue` と同一にする（Load Common Library → Prepare Codex auth.json → Prepare Agent Credentials → Validate Parameters → Setup Environment → Setup Node.js Environment → Execute Split Issue） | ステージ順序検証 |
| FR-001-12 | `Validate Parameters` ステージで `ISSUE_NUMBER`（必須・数値）、`GITHUB_REPOSITORY`（必須・owner/repo 形式）のバリデーションを実施する | バリデーションロジック検証 |
| FR-001-13 | Docker エージェント設定（`dockerfile` ディレクティブ、`ec2-fleet-micro` ラベル、`CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1`）を `rewrite-issue` と同一にする | エージェント設定検証 |
| FR-001-14 | コメントヘッダーを `split-issue` の機能説明に更新し、パラメータ一覧に `MAX_SPLITS` を追記する | コメント内容検証 |

### FR-002: Job DSL の新規作成

**優先度**: 高

`jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` を新規作成する。

| 要件ID | 詳細 | 検証方法 |
|--------|------|---------|
| FR-002-1 | `ai_workflow_rewrite_issue_job.groovy` をベーステンプレートとし、`split-issue` 固有の変更を適用する | テンプレートとの diff 検証 |
| FR-002-2 | ジョブキーを `'ai_workflow_split_issue_job'` に設定する | 変数定義検証 |
| FR-002-3 | `EXECUTION_MODE` を `choiceParam` で `['split_issue']` に固定する | パラメータ定義検証 |
| FR-002-4 | `MAX_SPLITS` パラメータを `stringParam` で追加する（デフォルト値: `'10'`、説明: 「分割Issue数の上限（1-20の整数、デフォルト: 10）」） | パラメータ定義検証 |
| FR-002-5 | `MAX_SPLITS` パラメータの配置位置は `DRY_RUN` パラメータの直後（API キー設定セクションの前）とする | パラメータ順序検証 |
| FR-002-6 | パラメータ総数が19個であること（`rewrite-issue` の18個 + `MAX_SPLITS` 1個） | パラメータ数カウント |
| FR-002-7 | `scriptPath` を `'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile'` に設定する | scriptPath 値検証 |
| FR-002-8 | `environmentVariables` で `EXECUTION_MODE` を `'split_issue'` に、`WORKFLOW_VERSION` を `'0.2.0'` に設定する | 環境変数定義検証 |
| FR-002-9 | `description` をIssue分割機能の説明に変更する（概要：「複雑なGitHub Issueを機能単位の子Issueに分割」、機能：Issue番号指定、dry-runプレビュー、applyモード、分割数上限指定） | description 内容検証 |
| FR-002-10 | 10フォルダ分のジョブを生成する（develop 1 + stable-1〜9）ためのフォルダ定義と `createJob` クロージャを `rewrite-issue` と同一構造で実装する | フォルダ生成ロジック検証 |
| FR-002-11 | ログローテーション設定を `rewrite-issue` と同一にする（`numToKeep: 30`、`daysToKeep: 90`） | ログローテーション設定検証 |
| FR-002-12 | `disableConcurrentBuilds()` プロパティを設定する | プロパティ検証 |
| FR-002-13 | Git SCM 設定（リポジトリURL、credentials、ブランチ）を `rewrite-issue` と同一構造で設定する | SCM 設定検証 |
| FR-002-14 | コメントヘッダーを `split-issue` の機能説明に更新する | コメント内容検証 |
| FR-002-15 | 既存の `rewrite-issue` と共通するパラメータ（`ISSUE_NUMBER`、`GITHUB_REPOSITORY`、`AGENT_MODE`、`LANGUAGE`、`APPLY`、`DRY_RUN`、API キー群、`LOG_LEVEL`、Webhook 群）の定義を完全に踏襲する | 共通パラメータ定義の一致検証 |

### FR-003: job-config.yaml への新規エントリ追加

**優先度**: 高

`jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` に `split-issue` ジョブのエントリを追加する。

| 要件ID | 詳細 | 検証方法 |
|--------|------|---------|
| FR-003-1 | エントリキーを `ai_workflow_split_issue_job` とする | YAML キー検証 |
| FR-003-2 | `name` フィールドを `'split_issue'` に設定する | フィールド値検証 |
| FR-003-3 | `displayName` フィールドを `'Split Issue'` に設定する | フィールド値検証 |
| FR-003-4 | `dslfile` フィールドを `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` に設定する | ファイルパス検証 |
| FR-003-5 | `jenkinsfile` フィールドを `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` に設定する | ファイルパス検証 |
| FR-003-6 | `skipJenkinsfileValidation` フィールドを `true` に設定する | フラグ値検証 |
| FR-003-7 | エントリの配置位置は `ai_workflow_rewrite_issue_job` の直後とする | YAML エントリ順序検証 |
| FR-003-8 | 既存エントリのインデント・フォーマットを厳密に踏襲する（スペース2個インデント） | YAML フォーマット検証 |
| FR-003-9 | YAML ファイル全体がパースエラーなく読み込み可能であること | YAML 構文検証 |

### FR-004: jenkins/README.md の更新

**優先度**: 中

`jenkins/README.md` を更新して `split-issue` ジョブの情報を追加する。

| 要件ID | 詳細 | 検証方法 |
|--------|------|---------|
| FR-004-1 | ジョブ一覧テーブルに `split_issue` 行を追加する（説明: 「複雑なIssueを機能単位で分割（split-issueコマンドのJenkins実行）」、パラメータ数: 19） | テーブル行検証 |
| FR-004-2 | ディレクトリ構造図の `ai-workflow/` 配下に `split-issue/` ディレクトリと `Jenkinsfile` を追加する | 構造図検証 |
| FR-004-3 | DSL ファイル一覧に `ai_workflow_split_issue_job.groovy` を追加する | ファイル一覧検証 |
| FR-004-4 | フォルダ構成図の `develop/` 配下に `split_issue` を追加する | フォルダ構成検証 |
| FR-004-5 | ジョブ種類数を「12種類 × 10フォルダ = 120ジョブ」から「13種類 × 10フォルダ = 130ジョブ」に更新する | 数値更新検証 |
| FR-004-6 | 追加行の配置位置は既存の `rewrite_issue` 行の直後とし、アルファベット順・論理的順序を維持する | 配置順序検証 |

---

## 3. 非機能要件

### NFR-001: パフォーマンス

| 要件ID | 詳細 |
|--------|------|
| NFR-001-1 | シードジョブの実行時間に対する影響は、新規1ジョブ定義の読み込み分（数秒以内）に限定されること |
| NFR-001-2 | `split-issue` ジョブ自体の実行パフォーマンスは CLI 側の処理時間に依存し、Jenkins ラッパー層でのオーバーヘッドは既存ジョブ（`rewrite-issue`）と同等であること |

### NFR-002: セキュリティ

| 要件ID | 詳細 |
|--------|------|
| NFR-002-1 | 機密情報（`GITHUB_TOKEN`、API キー群、`WEBHOOK_URL`、`WEBHOOK_TOKEN`）は `nonStoredPasswordParam` を使用し、ビルド履歴に保存されないこと |
| NFR-002-2 | `CODEX_AUTH_JSON` は `nonStoredPasswordParam` で入力し、ジョブ実行中のみファイルとして展開されること |
| NFR-002-3 | `post` セクションで `REPOS_ROOT`、`CODEX_HOME` のクリーンアップおよび `cleanWs()` によるワークスペースクリーンが実行されること |
| NFR-002-4 | `ISSUE_NUMBER` パラメータは数値バリデーションを実施し、不正な入力を拒否すること |
| NFR-002-5 | `GITHUB_REPOSITORY` パラメータは `owner/repo` 形式のバリデーションを実施すること |

### NFR-003: 可用性・信頼性

| 要件ID | 詳細 |
|--------|------|
| NFR-003-1 | 既存の12種類のジョブに影響を与えないこと（独立したエントリ追加のみ） |
| NFR-003-2 | シードジョブ実行後に全10フォルダに正常にジョブが生成されること |
| NFR-003-3 | ジョブ実行失敗時に `post.failure` ブロックで適切なエラーログとWebhook通知が送信されること |
| NFR-003-4 | `disableConcurrentBuilds()` により同一ジョブの並行実行を防止すること |

### NFR-004: 保守性・拡張性

| 要件ID | 詳細 |
|--------|------|
| NFR-004-1 | 新規ファイルのコード構造は既存の `rewrite-issue` テンプレートと統一されたパターンに従うこと |
| NFR-004-2 | 共通処理は `jenkins/shared/common.groovy` の既存関数を使用し、共通ライブラリへの変更は行わないこと |
| NFR-004-3 | 新規ファイルに適切なコメントヘッダー（機能説明、パラメータ一覧、注意事項）を記載すること |
| NFR-004-4 | Jenkins パイプラインのバージョン情報（`WORKFLOW_VERSION = '0.2.0'`）を既存ジョブと統一すること |

---

## 4. 制約事項

### 4.1 技術的制約

| 制約ID | 詳細 |
|--------|------|
| TC-001 | Jenkinsfile は Groovy 言語（Jenkins Pipeline DSL）で記述すること |
| TC-002 | Job DSL は Jenkins Job DSL Plugin の API に準拠すること |
| TC-003 | job-config.yaml は既存のシードジョブ（`Admin_Jobs/ai-workflow-job-creator`）が読み込み可能な YAML フォーマットに準拠すること |
| TC-004 | Docker エージェント設定は既存ジョブ（`ec2-fleet-micro` ラベル、`Dockerfile` 使用）と同一にすること |
| TC-005 | CLI コマンドは `node dist/index.js split-issue` として呼び出すこと（TypeScript ビルド済みの `dist/` を使用） |
| TC-006 | `split-issue` CLI のパラメータインターフェースは `src/main.ts` 358-383行で定義されたものに厳密に従うこと |
| TC-007 | Git SCM 設定のリポジトリ URL は `https://github.com/tielec/ai-workflow-agent.git` に固定すること |

### 4.2 既存システムとの整合性制約

| 制約ID | 詳細 |
|--------|------|
| IC-001 | `jenkins/shared/common.groovy` の既存関数（`prepareAgentCredentials()`、`prepareCodexAuthFile()`、`setupEnvironment()`、`setupNodeEnvironment()`、`sendWebhook()`）をそのまま利用し、変更を加えないこと |
| IC-002 | 既存ジョブの動作に影響を与えないこと（`job-config.yaml` への追記は独立エントリとする） |
| IC-003 | フォルダ構成（develop 1 + stable-1〜9 の10フォルダ）は既存構成を踏襲すること |
| IC-004 | ログローテーション設定（`numToKeep: 30`、`daysToKeep: 90`）は既存ジョブと統一すること |

### 4.3 ポリシー制約

| 制約ID | 詳細 |
|--------|------|
| PC-001 | CLAUDE.md のコーディング規約に準拠すること（ただし、本 Issue は TypeScript コードの変更を含まないため、Groovy/YAML に対する直接的な規約は限定的） |
| PC-002 | `nonStoredPasswordParam` によるセキュリティパターンを機密パラメータに適用すること（Issue #462 準拠） |

---

## 5. 前提条件

### 5.1 システム環境

| 前提ID | 詳細 |
|--------|------|
| PRE-001 | Jenkins サーバーに Job DSL Plugin がインストールされていること |
| PRE-002 | Jenkins サーバーに Pipeline Plugin がインストールされていること |
| PRE-003 | Jenkins サーバーに HTTP Request Plugin がインストールされていること（Webhook 通知に必要） |
| PRE-004 | Jenkins エージェントに `ec2-fleet-micro` ラベルが割り当てられたノードが存在すること |
| PRE-005 | Jenkins エージェント上で Docker が利用可能であること |
| PRE-006 | リポジトリルートに `Dockerfile` が存在し、Node.js 20 以上の実行環境を提供すること |

### 5.2 依存コンポーネント

| 前提ID | 詳細 |
|--------|------|
| DEP-001 | `split-issue` CLI コマンドが実装完了していること（Issue #715 で完了済み） |
| DEP-002 | `src/commands/split-issue.ts`（675行）が正常動作すること |
| DEP-003 | `src/types/split-issue.ts`（88行）に型定義が存在すること |
| DEP-004 | `src/prompts/split-issue/{ja,en}/split-issue.txt` にプロンプトテンプレートが存在すること |
| DEP-005 | `src/main.ts` の358-383行で `split-issue` コマンドが CLI に登録されていること |
| DEP-006 | `jenkins/shared/common.groovy` が正常動作すること（既存の共通関数に依存） |
| DEP-007 | シードジョブ `Admin_Jobs/ai-workflow-job-creator` が正常動作すること |

### 5.3 CLI パラメータマッピング

CLI 定義（`src/main.ts` 358-383行）と Jenkins パラメータの対応表：

| CLI オプション | 型 | Jenkins パラメータ | パラメータ型 | マッピング方法 |
|---------------|----|--------------------|-------------|---------------|
| `--issue <number>` | 必須・数値 | `ISSUE_NUMBER` | `stringParam` | `params.ISSUE_NUMBER` を直接渡す |
| `--language <lang>` | 選択・`ja`/`en` | `LANGUAGE` | `choiceParam` | `--language ${params.LANGUAGE}` |
| `--agent <mode>` | 選択・`auto`/`codex`/`claude` | `AGENT_MODE` | `choiceParam` | `--agent ${params.AGENT_MODE}` |
| `--apply` | フラグ | `APPLY` | `booleanParam` | `params.APPLY ? '--apply' : ''` |
| `--dry-run` | フラグ | `DRY_RUN` | `booleanParam` | `(!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''` |
| `--max-splits <number>` | オプション・デフォルト`'10'` | `MAX_SPLITS` | `stringParam` | `params.MAX_SPLITS ? "--max-splits ${params.MAX_SPLITS}" : ''` |

---

## 6. 受け入れ基準

### AC-001: シードジョブによるジョブ自動生成

**Given** シードジョブ `Admin_Jobs/ai-workflow-job-creator` が Jenkins に登録されている
**When** シードジョブを実行する
**Then** `AI_Workflow/develop/split_issue`、`AI_Workflow/stable-1/split_issue`、...、`AI_Workflow/stable-9/split_issue` の合計10個のジョブが自動生成される

### AC-002: パラメータ画面の表示

**Given** `AI_Workflow/develop/split_issue` ジョブが生成されている
**When** ジョブの「パラメータ付きビルド」画面を表示する
**Then** 以下の19個のパラメータが表示される：
1. `EXECUTION_MODE`（固定値: `split_issue`）
2. `ISSUE_NUMBER`（文字列入力）
3. `GITHUB_REPOSITORY`（文字列入力）
4. `AGENT_MODE`（選択: auto/codex/claude）
5. `LANGUAGE`（選択: ja/en）
6. `APPLY`（チェックボックス、デフォルト: true）
7. `DRY_RUN`（チェックボックス、デフォルト: false）
8. `MAX_SPLITS`（文字列入力、デフォルト: 10）
9. `GITHUB_TOKEN`（パスワード入力）
10. `OPENAI_API_KEY`（パスワード入力）
11. `CODEX_API_KEY`（パスワード入力）
12. `CODEX_AUTH_JSON`（パスワード入力）
13. `CLAUDE_CODE_OAUTH_TOKEN`（パスワード入力）
14. `CLAUDE_CODE_API_KEY`（パスワード入力）
15. `ANTHROPIC_API_KEY`（パスワード入力）
16. `LOG_LEVEL`（選択: INFO/DEBUG/WARNING/ERROR）
17. `JOB_ID`（文字列入力）
18. `WEBHOOK_URL`（パスワード入力）
19. `WEBHOOK_TOKEN`（パスワード入力）

### AC-003: Dry-run モードでのジョブ実行

**Given** `split_issue` ジョブが生成されており、有効な認証情報が設定されている
**When** `ISSUE_NUMBER` に有効なIssue番号を、`APPLY=false`、`DRY_RUN=true` を指定してジョブを実行する
**Then**
- パイプラインが正常に完了する（ビルドステータス: SUCCESS）
- コンソールログに `node dist/index.js split-issue --issue <番号> --language <lang> --agent <mode> --dry-run` の実行が記録される
- `--max-splits` オプションが CLI に渡される（`MAX_SPLITS` パラメータが指定されている場合）
- ビルド説明に `"Split Issue #<番号> [DRY RUN] | <owner>/<repo>"` が設定される

### AC-004: Apply モードでのジョブ実行

**Given** `split_issue` ジョブが生成されており、有効な認証情報が設定されている
**When** `ISSUE_NUMBER` に有効なIssue番号を、`APPLY=true` を指定してジョブを実行する
**Then**
- パイプラインが正常に完了する（ビルドステータス: SUCCESS）
- コンソールログに `node dist/index.js split-issue --issue <番号> --language <lang> --agent <mode> --apply` の実行が記録される
- GitHub 上に子 Issue が作成される
- ビルド説明に `"Split Issue #<番号> [APPLY] | <owner>/<repo>"` が設定される

### AC-005: Webhook 通知

**Given** `split_issue` ジョブが生成されており、`WEBHOOK_URL`、`WEBHOOK_TOKEN`、`JOB_ID` が設定されている
**When** ジョブを実行する
**Then**
- ジョブ開始時に `status: 'running'` の Webhook が送信される
- ジョブ成功時に `status: 'success'`（`finished_at`、`logs_url` 付き）の Webhook が送信される
- ジョブ失敗時に `status: 'failed'`（`errorMessage`、`finished_at`、`logs_url` 付き）の Webhook が送信される

### AC-006: パラメータバリデーション

**Given** `split_issue` ジョブが生成されている
**When** `ISSUE_NUMBER` を空にしてジョブを実行する
**Then** `"ISSUE_NUMBER parameter is required"` エラーでジョブが失敗する

**Given** `split_issue` ジョブが生成されている
**When** `ISSUE_NUMBER` に非数値文字列を指定してジョブを実行する
**Then** `"ISSUE_NUMBER must be a number"` エラーでジョブが失敗する

**Given** `split_issue` ジョブが生成されている
**When** `GITHUB_REPOSITORY` を空にしてジョブを実行する
**Then** `"GITHUB_REPOSITORY parameter is required"` エラーでジョブが失敗する

**Given** `split_issue` ジョブが生成されている
**When** `GITHUB_REPOSITORY` に `owner/repo` 形式でない文字列を指定してジョブを実行する
**Then** `"GITHUB_REPOSITORY must be in 'owner/repo' format"` エラーでジョブが失敗する

### AC-007: APPLY と DRY_RUN の排他制御

**Given** `split_issue` ジョブが生成されている
**When** `APPLY=true` かつ `DRY_RUN=true` で実行する
**Then** `APPLY` が優先され、`--apply` フラグのみが CLI に渡される（`--dry-run` は渡されない）

**Given** `split_issue` ジョブが生成されている
**When** `APPLY=false` かつ `DRY_RUN=true` で実行する
**Then** `--dry-run` フラグのみが CLI に渡される

**Given** `split_issue` ジョブが生成されている
**When** `APPLY=false` かつ `DRY_RUN=false` で実行する
**Then** `--apply` も `--dry-run` も CLI に渡されない（CLI 側のデフォルト動作に従う）

### AC-008: MAX_SPLITS パラメータの受け渡し

**Given** `split_issue` ジョブが生成されている
**When** `MAX_SPLITS=5` を指定してジョブを実行する
**Then** CLI に `--max-splits 5` が渡される

**Given** `split_issue` ジョブが生成されている
**When** `MAX_SPLITS` を空にしてジョブを実行する
**Then** `--max-splits` オプション自体が CLI に渡されない（CLI 側のデフォルト値 `10` が適用される）

### AC-009: 既存ジョブへの非影響

**Given** シードジョブ実行前に既存の12種類のジョブが正常動作している
**When** `job-config.yaml` に `split_issue` エントリを追加してシードジョブを実行する
**Then** 既存の12種類 × 10フォルダ = 120個のジョブが変更なく維持される

### AC-010: job-config.yaml の構文整合性

**Given** `job-config.yaml` に `ai_workflow_split_issue_job` エントリが追加されている
**When** YAML パーサーでファイルを読み込む
**Then** パースエラーなく読み込みが成功し、`ai_workflow_split_issue_job` エントリの全フィールド（`name`、`displayName`、`dslfile`、`jenkinsfile`、`skipJenkinsfileValidation`）が正しく取得できる

### AC-011: ファイル配置の正確性

**Given** 実装が完了している
**When** 以下のファイルの存在を確認する
**Then** 以下の4ファイルが存在する：
1. `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile`（新規）
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy`（新規）
3. `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml`（更新済み）
4. `jenkins/README.md`（更新済み）

### AC-012: ワークスペースクリーンアップ

**Given** `split_issue` ジョブが実行完了している（成功・失敗問わず）
**When** `post.always` ブロックが実行される
**Then**
- `REPOS_ROOT` ディレクトリが削除される
- `CODEX_HOME` ディレクトリが削除される（設定されている場合）
- `cleanWs()` によりワークスペースがクリーンアップされる

---

## 7. スコープ外

### 明確にスコープ外とする事項

| 除外ID | 詳細 | 理由 |
|--------|------|------|
| OUT-001 | `split-issue` CLI コマンド自体の実装・修正 | Issue #715 で実装完了済み |
| OUT-002 | `jenkins/shared/common.groovy` への変更 | 既存の共通関数で全機能を実現可能 |
| OUT-003 | `src/` 配下の TypeScript ソースコードの変更 | Jenkins ラッパー層の追加のみが対象 |
| OUT-004 | npm パッケージの追加・更新 | 依存関係の変更は不要 |
| OUT-005 | Jenkins サーバーの構成変更（プラグインインストール等） | 前提条件として既に必要なプラグインが導入済み |
| OUT-006 | `split-issue` ジョブの実運用テスト（Jenkins 環境での E2E テスト） | コードレベルの静的検証のみが本 Issue のスコープ |
| OUT-007 | GitHub Actions ワークフローへの `split-issue` 統合 | Jenkins 統合のみが対象 |
| OUT-008 | `MAX_SPLITS` パラメータの値範囲バリデーション（1-20）の Jenkins 側での実装 | CLI 側でバリデーションが実装済みのため、Jenkins 側は文字列として渡すのみ |

### 将来的な拡張候補

| 候補ID | 詳細 |
|--------|------|
| FUT-001 | `split-issue` ジョブの cron トリガーによる定期実行 |
| FUT-002 | `split-issue` の結果を Webhook ペイロードに含める（作成された子 Issue URL 一覧） |
| FUT-003 | `--custom-instruction` パラメータの Jenkins UI からの設定対応（`rewrite-issue` CLI には存在するが `split-issue` CLI には未実装のため、CLI 側実装後に対応） |

---

## 8. パラメータ詳細仕様

### 8.1 全パラメータ一覧（19個）

| # | パラメータ名 | 型 | デフォルト値 | 必須 | 説明 | セキュリティ |
|---|-------------|------|------------|------|------|-------------|
| 1 | `EXECUTION_MODE` | `choiceParam` | `split_issue` | — | 実行モード（固定値、変更不可） | — |
| 2 | `ISSUE_NUMBER` | `stringParam` | `''` | 必須 | 対象Issue番号 | — |
| 3 | `GITHUB_REPOSITORY` | `stringParam` | `''` | 必須 | GitHub リポジトリ（owner/repo形式） | — |
| 4 | `AGENT_MODE` | `choiceParam` | `auto` | — | エージェント実行モード（auto/codex/claude） | — |
| 5 | `LANGUAGE` | `choiceParam` | `ja` | — | ワークフロー言語（ja/en） | — |
| 6 | `APPLY` | `booleanParam` | `true` | — | Issue作成フラグ | — |
| 7 | `DRY_RUN` | `booleanParam` | `false` | — | プレビューモード | — |
| 8 | `MAX_SPLITS` | `stringParam` | `'10'` | — | 分割Issue数の上限（1-20の整数） | — |
| 9 | `GITHUB_TOKEN` | `nonStoredPasswordParam` | — | 必須 | GitHub Personal Access Token | 非永続化 |
| 10 | `OPENAI_API_KEY` | `nonStoredPasswordParam` | — | 任意 | OpenAI API キー | 非永続化 |
| 11 | `CODEX_API_KEY` | `nonStoredPasswordParam` | — | 任意 | Codex API キー | 非永続化 |
| 12 | `CODEX_AUTH_JSON` | `nonStoredPasswordParam` | — | 任意 | Codex auth.json の内容 | 非永続化 |
| 13 | `CLAUDE_CODE_OAUTH_TOKEN` | `nonStoredPasswordParam` | — | 任意 | Claude Code OAuth トークン | 非永続化 |
| 14 | `CLAUDE_CODE_API_KEY` | `nonStoredPasswordParam` | — | 任意 | Claude Code API キー | 非永続化 |
| 15 | `ANTHROPIC_API_KEY` | `nonStoredPasswordParam` | — | 任意 | Anthropic API キー | 非永続化 |
| 16 | `LOG_LEVEL` | `choiceParam` | `INFO` | — | ログレベル（INFO/DEBUG/WARNING/ERROR） | — |
| 17 | `JOB_ID` | `stringParam` | `''` | 任意 | Lavable Job ID | — |
| 18 | `WEBHOOK_URL` | `nonStoredPasswordParam` | — | 任意 | Webhook エンドポイント URL | 非永続化 |
| 19 | `WEBHOOK_TOKEN` | `nonStoredPasswordParam` | — | 任意 | Webhook 認証トークン | 非永続化 |

### 8.2 rewrite-issue との差分

| 差分項目 | rewrite-issue | split-issue |
|---------|--------------|-------------|
| `EXECUTION_MODE` | `'rewrite_issue'` | `'split_issue'` |
| CLI コマンド | `rewrite-issue` | `split-issue` |
| 固有パラメータ | なし | `MAX_SPLITS`（`stringParam`, デフォルト `'10'`） |
| パラメータ総数 | 18 | 19 |
| ステージ名 | `'Execute Rewrite Issue'` | `'Execute Split Issue'` |
| ビルド説明 | `"Rewrite Issue #..."` | `"Split Issue #..."` |
| 成功ログ | `"Rewrite Issue Success"` | `"Split Issue Success"` |
| 失敗ログ | `"Rewrite Issue Failure"` | `"Split Issue Failure"` |
| Job DSL キー | `ai_workflow_rewrite_issue_job` | `ai_workflow_split_issue_job` |
| `scriptPath` | `rewrite-issue/Jenkinsfile` | `split-issue/Jenkinsfile` |
| description | Issue本文再設計 | 複雑なIssueを機能単位で分割 |

---

## 9. ファイル変更サマリー

### 新規作成ファイル（2件）

| ファイルパス | 説明 | テンプレート元 |
|-------------|------|---------------|
| `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` | split-issue パイプライン定義 | `rewrite-issue/Jenkinsfile` |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` | split-issue Job DSL 定義 | `ai_workflow_rewrite_issue_job.groovy` |

### 変更ファイル（2件）

| ファイルパス | 変更内容 | 影響範囲 |
|-------------|---------|---------|
| `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` | `ai_workflow_split_issue_job` エントリの追加（6行） | シードジョブの読み込み対象に1ジョブ追加 |
| `jenkins/README.md` | ジョブ一覧テーブル・構造図・フォルダ構成の更新 | ドキュメントのみ |

### 参照ファイル（変更なし）

| ファイルパス | 参照理由 |
|-------------|---------|
| `jenkins/shared/common.groovy` | 共通関数の利用（`prepareAgentCredentials`、`setupEnvironment`、`setupNodeEnvironment`、`sendWebhook`） |
| `src/main.ts` (358-383行) | CLI パラメータ定義の確認 |
| `src/types/split-issue.ts` | 型定義の確認 |
| `src/commands/split-issue.ts` | コマンドハンドラの実装確認 |
