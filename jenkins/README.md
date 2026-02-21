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
│   │       ├── rewrite-issue/
│   │       │   └── Jenkinsfile
│   │       ├── split-issue/
│   │       │   └── Jenkinsfile
│   │       ├── auto-close-issue/
│   │       │   └── Jenkinsfile
│   │       ├── finalize/
│   │       │   └── Jenkinsfile
│   │       ├── pr-comment-execute/
│   │       │   └── Jenkinsfile
│   │       ├── pr-comment-finalize/
│   │       │   └── Jenkinsfile
│   │       ├── resolve-conflict/
│   │       │   └── Jenkinsfile
│   │       ├── validate-credentials/
│   │       │   ├── Jenkinsfile
│   │       │   └── README.md
│   │       └── ecr-build/
│   │           └── Jenkinsfile
│   └── dsl/
│       ├── folders.groovy               # フォルダ作成DSL
│       └── ai-workflow/
│           ├── ai_workflow_all_phases_job.groovy
│           ├── ai_workflow_preset_job.groovy
│           ├── ai_workflow_single_phase_job.groovy
│           ├── ai_workflow_rollback_job.groovy
│           ├── ai_workflow_auto_issue_job.groovy
│           ├── ai_workflow_rewrite_issue_job.groovy
│           ├── ai_workflow_split_issue_job.groovy
│           ├── ai_workflow_auto_close_issue_job.groovy
│           ├── ai_workflow_finalize_job.groovy
│           ├── ai_workflow_pr_comment_execute_job.groovy
│           ├── ai_workflow_pr_comment_finalize_job.groovy
│           ├── ai_workflow_resolve_conflict_job.groovy
│           ├── ai_workflow_validate_credentials_job.groovy
│           ├── ai_workflow_ecr_build_job.groovy
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
| **rewrite_issue** | Issue本文再設計（リポジトリ文脈を参照した既存Issue改善） | 18 |
| **split_issue** | 複雑なIssueを機能単位で分割（split-issueコマンドのJenkins実行） | 19 |
| **auto_close_issue** | 既存Issue自動クローズ（AIによる安全なIssue整理） | 20 |
| **finalize** | ワークフロー完了後の最終処理（cleanup/squash/PR更新） | 24 |
| **pr_comment_execute** | PRコメント自動対応（init + execute） | 19 |
| **pr_comment_finalize** | PRコメント解決処理（finalize） | 18 |
| **resolve_conflict** | PRマージコンフリクト自動解消（init/analyze/execute/finalizeの4フェーズ） | 19 |
| **validate_credentials** | 認証情報バリデーション（Git/GitHub/Codex/Claude/OpenAI/Anthropic） | 17 |
| **ecr_build** | DockerイメージのECRビルド・プッシュ（cronトリガーによる定期実行、古いイメージの自動削除） | 7 |

### 言語設定

すべてのジョブで**ワークフロー言語**を選択できます：

- **LANGUAGE**: ワークフロー実行言語
  - `ja`: 日本語（デフォルト）
  - `en`: English

この設定により、プロンプト、出力メッセージ、生成されるドキュメントが指定した言語で作成されます。

### All Phases ジョブの主要機能

**SKIP_PHASES パラメータ**（Issue #656 で追加）:
- **機能**: 特定のフェーズをスキップして全フェーズワークフローを実行
- **設定方法**: パラメータ「SKIP_PHASES」にカンマ区切りでフェーズ名を入力（例: `test_scenario,testing`）
- **対応フェーズ**: requirements, design, test_scenario, implementation, test_implementation, testing, documentation, report, evaluation
- **制約**: planning フェーズはスキップ不可（他フェーズが依存）
- **空欄時**: すべてのフェーズを実行（従来動作）

**使用例**:
```
# テスト関連フェーズを除外して実行
SKIP_PHASES: test_scenario,test_implementation,testing

# ドキュメント生成のみスキップ
SKIP_PHASES: documentation,report
```

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
│   ├── rewrite_issue
│   ├── split_issue
│   ├── auto_close_issue
│   ├── finalize
│   ├── pr_comment_execute
│   ├── pr_comment_finalize
│   ├── resolve_conflict
│   ├── validate_credentials
│   └── ecr_build
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
- 各実行モード用のジョブ（13種類 × 10フォルダ = 130ジョブ）

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

## auto-close-issue パイプライン詳細

### 概要と利用場面

**auto-close-issue** パイプラインは、AIエージェントを活用してリポジトリ内の既存オープンIssueを検品し、適切にクローズできるIssueを安全に自動クローズするジョブです。

**主な利用場面**:
- プロジェクトのIssueメンテナンス作業
- 長期間更新のないIssueの整理
- フォローアップが必要なIssueの定期チェック
- プロジェクトのクリーンアップ作業

### 主要パラメータ

| パラメータ | 説明 | デフォルト値 | 推奨設定 |
|-----------|------|------------|----------|
| **AUTO_CLOSE_CATEGORY** | Issue分類（followup/stale/old/all） | followup | 初回は `followup` |
| **AUTO_CLOSE_LIMIT** | 処理対象上限数（1-50） | 10 | 初回は5以下 |
| **CONFIDENCE_THRESHOLD** | AI判定の信頼度閾値（0.0-1.0） | 0.7 | 保守的: 0.8以上 |
| **DAYS_THRESHOLD** | 更新からの経過日数閾値 | 90 | アクティブ: 30日 |
| **EXCLUDE_LABELS** | 除外ラベル（カンマ区切り） | do-not-close,pinned | 必要に応じて追加 |
| **DRY_RUN** | ドライランモード | **true** | **初回は必ずtrue** |

### 安全機能

- **ドライランデフォルト**: 実際のクローズ前に結果プレビュー
- **除外ラベル機能**: 特定ラベル付きIssueの処理除外
- **信頼度閾値**: AIの判定精度による自動フィルタリング
- **処理数制限**: 一度に大量のIssueを処理することを防止

### 実行フロー

1. **パラメータ検証**: 必須項目・形式の確認
2. **Issue候補取得**: 指定条件に基づく対象Issue抽出
3. **AI検品実行**: 各Issueのクローズ可否をAI判定
4. **結果出力**: ドライランの場合は候補表示、実行の場合はクローズ実行

### 注意事項

⚠️ **必ず最初はドライランで実行してください**
- `DRY_RUN: true` で候補Issueの確認
- AI判定の妥当性をマニュアルチェック
- 問題がなければ `DRY_RUN: false` で本実行

⚠️ **重要なIssueの保護**
- `do-not-close`, `pinned` 等の除外ラベルを活用
- 組織の重要なIssueには事前にラベル付与を推奨

## 詳細ドキュメント

各ジョブの詳細な使い方については、以下を参照してください：

- [AI Workflow README](../README.md) - ワークフロー全体の説明
- [ARCHITECTURE.md](../ARCHITECTURE.md) - アーキテクチャ詳細
- [auto-close-issue パイプライン利用ガイド](../docs/AUTO_CLOSE_ISSUE_PIPELINE_GUIDE.md) - **auto-close-issue 詳細マニュアル**
- [TEST_PLAN.md](jobs/dsl/ai-workflow/TEST_PLAN.md) - テスト計画

## 関連Issue

- 移行元Issue: https://github.com/tielec/infrastructure-as-code/issues/481
- 移行先Issue: https://github.com/tielec/ai-workflow-agent/issues/230
