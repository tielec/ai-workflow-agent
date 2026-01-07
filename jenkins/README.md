# AI Workflow Jenkins Jobs

このディレクトリには、AI Workflow関連のJenkins Job定義が含まれています。

> **Note**: これらのファイルは `infrastructure-as-code` リポジトリから移行されました（Issue #230）

## ディレクトリ構造

```
jenkins/
├── jobs/
│   ├── pipeline/
│   │   ├── _seed/
│   │   │   └── ai-workflow-job-creator/
│   │   │       ├── Jenkinsfile          # シードジョブ定義
│   │   │       ├── folder-config.yaml   # フォルダ構成定義
│   │   │       └── job-config.yaml      # ジョブ設定
│   │   └── ai-workflow/                 # 各実行モード用Jenkinsfile
│   │       ├── all-phases/
│   │       │   └── Jenkinsfile
│   │       ├── preset/
│   │       │   └── Jenkinsfile
│   │       ├── single-phase/
│   │       │   └── Jenkinsfile
│   │       ├── rollback/
│   │       │   └── Jenkinsfile
│   │       ├── auto-issue/
│   │       │   └── Jenkinsfile
│   │       ├── finalize/
│   │       │   └── Jenkinsfile
│   │       ├── pr-comment-execute/
│   │       │   └── Jenkinsfile
│   │       ├── pr-comment-finalize/
│   │       │   └── Jenkinsfile
│   │       └── validate-credentials/
│   │           ├── Jenkinsfile
│   │           └── README.md
│   └── dsl/
│       ├── folders.groovy               # フォルダ作成DSL
│       └── ai-workflow/
│           ├── ai_workflow_all_phases_job.groovy
│           ├── ai_workflow_preset_job.groovy
│           ├── ai_workflow_single_phase_job.groovy
│           ├── ai_workflow_rollback_job.groovy
│           ├── ai_workflow_auto_issue_job.groovy
│           ├── ai_workflow_finalize_job.groovy
│           ├── ai_workflow_pr_comment_execute_job.groovy
│           ├── ai_workflow_pr_comment_finalize_job.groovy
│           ├── ai_workflow_validate_credentials_job.groovy
│           └── TEST_PLAN.md
└── shared/
    └── common.groovy                    # 共通処理モジュール
```

## 利用可能なジョブ

### ジョブ一覧

| ジョブ名 | 説明 | パラメータ数 |
|---------|------|-------------|
| **all_phases** | 全フェーズ一括実行（planning → evaluation） | 30 |
| **preset** | プリセット実行（quick-fix, implementation等） | 31 |
| **single_phase** | 単一フェーズ実行（デバッグ用） | 29 |
| **rollback** | フェーズ差し戻し実行 | 27 |
| **auto_issue** | 自動Issue作成 | 20 |
| **finalize** | ワークフロー完了後の最終処理（cleanup/squash/PR更新） | 24 |
| **pr_comment_execute** | PRコメント自動対応（init + execute） | 19 |
| **pr_comment_finalize** | PRコメント解決処理（finalize） | 18 |
| **validate_credentials** | 認証情報バリデーション（Git/GitHub/Codex/Claude/OpenAI/Anthropic） | 17 |

### 言語設定

すべてのジョブで**ワークフロー言語**を選択できます：

- **LANGUAGE**: ワークフロー実行言語
  - `ja`: 日本語（デフォルト）
  - `en`: English

この設定により、プロンプト、出力メッセージ、生成されるドキュメントが指定した言語で作成されます。

### Webhook通知

- すべてのジョブに以下のオプションパラメータを追加しました（Lavable通知向け）:
  - `JOB_ID`: Lavable Job ID
  - `WEBHOOK_URL`: webhookエンドポイント URL（nonStoredPasswordParam）
  - `WEBHOOK_TOKEN`: webhook認証トークン（nonStoredPasswordParam、`X-Webhook-Token`ヘッダーで送信）
- 通知タイミング: ジョブ開始 (`running`)、成功 (`success`)、失敗 (`failed`, `error`付き)
- Webhookペイロード（status別）:

| フィールド | running | success | failed | 備考 |
|-----------|:-------:|:-------:|:------:|------|
| `job_id` | ✓ | ✓ | ✓ | Lavable Job ID |
| `status` | ✓ | ✓ | ✓ | `running` / `success` / `failed` |
| `error` | - | - | ✓ | 失敗時のエラーメッセージ |
| `build_url` | ✓ | ✓ | ✓ | JenkinsビルドURL |
| `branch_name` | ✓ | ✓ | - | ブランチ名（空の場合は非送信） |
| `pr_url` | - | ✓ | - | `.ai-workflow/issue-*/metadata.json` から取得（空の場合は非送信） |
| `finished_at` | - | ✓ | ✓ | `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`（UTC） |
| `logs_url` | - | ✓ | ✓ | `${env.BUILD_URL}console` |
- オプショナルフィールドは空文字/未設定時はペイロードに含めません。
- HTTP Request Plugin が Jenkins にインストールされていることが前提です。未インストールの場合はログ出力のみでスキップされます。

### セキュリティ強化（Issue #462）

**機密情報パラメータの保護**:
以下のパラメータは、個人情報・機密情報の保護のためNon-Stored Password Parameterに変更されています：
- `ISSUE_URL`, `PR_URL` - リポジトリ情報を含むURL
- `BRANCH_NAME`, `BASE_BRANCH` - ブランチ名（作業内容を特定可能）
- `GIT_COMMIT_USER_NAME`, `GIT_COMMIT_USER_EMAIL` - ユーザー個人情報
- `CODEX_AUTH_JSON` - 認証情報

**UI変更点**:
- 対象パラメータは Jenkins UI でパスワード入力フィールド（マスク表示）になります
- パラメータ値はビルド履歴に保存されません
- `CODEX_AUTH_JSON` は複数行入力から単一行入力に変更されます

### フォルダ構成

ジョブは以下のフォルダ構成で配置されます：

```
AI_Workflow/
├── develop/           # developブランチ用（最新バージョン）
│   ├── all_phases
│   ├── preset
│   ├── single_phase
│   ├── rollback
│   ├── auto_issue
│   ├── finalize
│   ├── pr_comment_execute
│   ├── pr_comment_finalize
│   └── validate_credentials
├── stable-1/          # mainブランチ用（安定バージョン）
│   └── ...
├── stable-2/
├── ...
└── stable-9/
```

- **develop**: ai-workflow-agentのdevelopブランチを使用（新機能テスト用）
- **stable-1〜9**: ai-workflow-agentのmainブランチを使用（本番環境用、並行実行可能）

## セットアップ

### 1. シードジョブの登録

Jenkinsに以下のパイプラインジョブを作成してください：

- **ジョブ名**: `Admin_Jobs/ai-workflow-job-creator`
- **Pipeline script from SCM**:
  - SCM: Git
  - Repository URL: `https://github.com/tielec/ai-workflow-agent.git`
  - Branch: `*/main`
  - Script Path: `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile`

### 2. シードジョブの実行

作成したシードジョブを実行すると、以下が自動生成されます：

- AI_Workflowフォルダ構造
- 各実行モード用のジョブ（9種類 × 10フォルダ = 90ジョブ）

## 共通処理モジュール

### shared/common.groovy

すべてのJenkinsfileから利用される共通処理を提供します：

#### 主要な機能

| 関数名 | 説明 |
|-------|------|
| `prepareAgentCredentials()` | エージェント実行に必要な認証情報準備（GitHub、OpenAI、Codex、Claude、AWS） |
| `prepareCodexAuthFile()` | CODEX_AUTH_JSONパラメータから一時的なauth.jsonを展開 |
| `setupEnvironment()` | REPOS_ROOT準備と対象リポジトリのクローン |
| `setupNodeEnvironment()` | Node.js環境確認とnpm install & build実行 |
| `archiveArtifacts(issueNumber)` | ワークフローメタデータ、ログ、成果物のアーカイブ |
| `sendWebhook(Map config)` | Lavableにジョブステータスを通知（HTTP POST, タイムアウト30秒、build_url / branch_name / pr_url / finished_at / logs_urlをオプション送信） |

#### archiveArtifacts関数の機能

- **Issue番号サニタイズ**: パストラバーサル攻撃防止（英数字、ハイフン、アンダースコアのみ許可）
- **ソースディレクトリ存在確認**: 存在しない場合は警告ログ出力してスキップ
- **一時ファイルコピー**: REPOS_ROOTからWORKSPACEへのファイルコピー
- **ワークスペース相対パスアーカイブ**: `artifacts/.ai-workflow/issue-*/**/*` パターンでアーティファクト保存
- **自動クリーンアップ**: アーカイブ後に一時ファイルを削除

使用例:
```groovy
def common = load 'jenkins/shared/common.groovy'
common.archiveArtifacts(env.ISSUE_NUMBER)
```

## GitHub Actions との比較

このプロジェクトでは、AI Workflow Agent のCIタスクとして Jenkins とGitHub Actions の両方をサポートしています。

### CI/CD オプションの使い分け

| 項目 | GitHub Actions | Jenkins |
|------|---------------|---------|
| **用途** | 自動テスト・ビルド検証 | AI Workflow Agent の実行 |
| **トリガー** | PR作成・更新、pushイベント | 手動実行 |
| **実行内容** | `npm test`, `npm run build` | AI Workflow の10フェーズ実行 |
| **カバレッジ** | Codecov 自動アップロード | - |
| **マトリックス** | Ubuntu/Windows × Node.js 18.x/20.x | - |
| **設定ファイル** | `.github/workflows/test.yml`, `build.yml` | `jenkins/` ディレクトリ配下 |

### GitHub Actions の導入メリット

- **軽量な品質チェック**: PRマージ前の自動テスト・ビルド検証
- **GitHub ネイティブ統合**: PR画面での直接的なステータス確認
- **無料枠内運用**: パブリックリポジトリでの無料実行
- **メンテナンスフリー**: Jenkins サーバー管理が不要

### 移行の考え方

- **GitHub Actions**: 軽量なCI（テスト・ビルドチェック）にフォーカス
- **Jenkins**: AI Workflow の実行基盤として継続利用

## 詳細ドキュメント

各ジョブの詳細な使い方については、以下を参照してください：

- [AI Workflow README](../README.md) - ワークフロー全体の説明
- [ARCHITECTURE.md](../ARCHITECTURE.md) - アーキテクチャ詳細
- [TEST_PLAN.md](jobs/dsl/ai-workflow/TEST_PLAN.md) - テスト計画

## 関連Issue

- 移行元Issue: https://github.com/tielec/infrastructure-as-code/issues/481
- 移行先Issue: https://github.com/tielec/ai-workflow-agent/issues/230
