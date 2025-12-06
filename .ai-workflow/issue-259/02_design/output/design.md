# 詳細設計書 - Issue #259

## 概要

AI Workflow の最終処理を行うための Jenkins パイプライン（`finalize`）と Job DSL を追加する。このパイプラインは将来的にワークフロー完了時の全ての後処理をまとめるものとして拡張予定。

**Phase 1（今回実装）**：
- Cleanup Stage の実装（`node dist/index.js cleanup` を実行）
- Squash Commits、Update PR、Promote PR の各ステージは TODO コメント付きで枠組みのみ実装

## 1. 実装戦略判断

### 実装戦略: CREATE

**判断根拠**:
1. **新規ファイル作成中心**
   - `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`（新規作成）
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`（新規作成）
   - 既存ファイルへの影響はほぼゼロ（既存の `common.groovy` を再利用するのみ）

2. **独立したパイプライン**
   - 既存の5つの実行モード（all-phases、preset、single-phase、rollback、auto-issue）とは独立した6番目の実行モード
   - 既存パイプラインとの依存関係なし（共通処理モジュール `common.groovy` のみを参照）

3. **汎用フォルダ対応パターンの踏襲**
   - 既存のJob DSLパターン（`ai_workflow_all_phases_job.groovy` 等）と同じ構造を採用
   - `genericFolders` を使用して develop + stable-1～stable-9 の10フォルダに対応

## 2. テスト戦略判断

### テスト戦略: INTEGRATION_ONLY

**判断根拠**:
1. **Jenkinsパイプラインの特性**
   - パイプライン自体の動作検証は Jenkins 環境での統合テストが中心
   - Groovy コードの単体テストは費用対効果が低い（モッキングが複雑）

2. **既存テストの活用**
   - `cleanup` コマンドのユニットテストは既に Issue #212 で実装済み
   - `cleanup` コマンド自体の動作は保証されている

3. **検証項目**
   - シードジョブからの Job DSL 実行検証
   - パラメータバリデーションの動作確認
   - Cleanup Stage の正常動作確認
   - TODO ステージの適切なスキップ動作確認

4. **手動テスト戦略**
   - 各パラメータパターンの組み合わせテスト
   - ドライランモードの動作確認
   - エラーハンドリングの確認

## 3. テストコード戦略判断

### テストコード戦略: NO_TEST

**判断根拠**:
1. **Jenkinsパイプライン自体のユニットテストは実装しない**
   - Groovy スクリプトの単体テストは複雑でメンテナンスコストが高い
   - Jenkins Pipeline Unit Testing Framework は導入されていない

2. **統合テストと手動検証で品質を確保**
   - Jenkins 環境での手動実行による統合テスト
   - シードジョブからの Job 作成テスト
   - パラメータバリデーションのテスト

3. **既存の cleanup コマンドテストで十分カバー**
   - `src/commands/cleanup.ts` のユニットテストは Issue #212 で完了
   - パイプラインは既存コマンドを呼び出すラッパーに過ぎない

## 4. アーキテクチャ設計

### 4.1 システム全体図

```
┌────────────────────────────────────────────────────────────┐
│ Jenkins Job DSL (Seed Job)                                │
│ jenkins/jobs/pipeline/_seed/ai-workflow-job-creator       │
└────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌────────────────────────────────────────────────────────────┐
│ Finalize Job DSL                                          │
│ jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy │
│                                                            │
│ - 汎用フォルダ定義（develop + stable-1～stable-9）        │
│ - パラメータ定義（18個）                                   │
│ - パイプライン定義（cpsScm）                               │
└────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌────────────────────────────────────────────────────────────┐
│ Finalize Jenkinsfile                                      │
│ jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile    │
│                                                            │
│ Stages:                                                   │
│  1. Load Common Library                                   │
│  2. Prepare Agent Credentials                             │
│  3. Validate Parameters                                   │
│  4. Setup Environment                                     │
│  5. Setup Node.js Environment                             │
│  6. Initialize Workflow                                   │
│  7. Cleanup Workflow (実装)                                │
│  8. Squash Commits (TODO)                                 │
│  9. Update PR (TODO)                                      │
│ 10. Promote PR (TODO)                                     │
│ 11. Archive Artifacts (post処理)                          │
└────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 共通処理モジュール (jenkins/shared/common.groovy)         │
│                                                            │
│ - prepareAgentCredentials()                               │
│ - setupEnvironment()                                      │
│ - setupNodeEnvironment()                                  │
│ - archiveArtifacts()                                      │
└────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌────────────────────────────────────────────────────────────┐
│ AI Workflow CLI (TypeScript)                              │
│ node dist/index.js cleanup --issue <NUM> --phases <range> │
└────────────────────────────────────────────────────────────┘
```

### 4.2 コンポーネント間の関係

```
Seed Job
   └── ai_workflow_finalize_job.groovy
         ├── 10フォルダ（develop + stable-1～9）にジョブ作成
         ├── パラメータ定義（18個）
         └── Jenkinsfile参照（cpsScm）
               ↓
         jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile
               ├── common.groovy（共通処理）
               ├── パラメータバリデーション
               ├── 環境セットアップ
               ├── Cleanup Workflow (実装)
               │     └── node dist/index.js cleanup
               └── TODO ステージ（枠組みのみ）
```

### 4.3 データフロー

```
1. ユーザー入力
   ↓ (ISSUE_URL, CLEANUP_PHASES, DRY_RUN 等)
2. Job DSL パラメータ定義
   ↓
3. Jenkinsfile 環境変数設定
   ↓ (GITHUB_TOKEN, ISSUE_NUMBER, REPO_OWNER, REPO_NAME)
4. パラメータバリデーション
   ↓ (ISSUE_URL 形式チェック、必須パラメータ確認)
5. 環境セットアップ
   ↓ (REPOS_ROOT 準備、対象リポジトリクローン)
6. Node.js 環境セットアップ
   ↓ (npm install, npm run build)
7. Workflow 初期化
   ↓ (node dist/index.js init)
8. Cleanup 実行
   ↓ (node dist/index.js cleanup --issue <NUM> --phases <range>)
9. 成果物アーカイブ
   ↓ (.ai-workflow/issue-<NUM>/**/* をアーカイブ)
10. REPOS_ROOT クリーンアップ
```

## 5. 影響範囲分析

### 5.1 既存コードへの影響

**影響なし**:
- 既存の5つの実行モード（all-phases、preset、single-phase、rollback、auto-issue）には一切影響なし
- 既存の `common.groovy` を再利用するのみで、変更は不要
- 既存の `cleanup` コマンド（`src/commands/cleanup.ts`）を呼び出すのみで、変更は不要

### 5.2 依存関係の変更

**新規依存**:
- Finalize Jenkinsfile → `jenkins/shared/common.groovy`（既存の共通処理モジュール）
- Finalize Jenkinsfile → `node dist/index.js cleanup`（既存の cleanup コマンド、Issue #212）

**依存関係なし**:
- 他の実行モードとの依存関係はゼロ
- 完全に独立したパイプライン

### 5.3 マイグレーション要否

**不要**:
- 新規パイプラインの追加のみ
- 既存のワークフローやメタデータに影響なし

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

1. **`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`**
   - Finalize パイプラインの定義
   - 9つのステージ構成（Load Common Library、Prepare Agent Credentials、Validate Parameters、Setup Environment、Setup Node.js Environment、Initialize Workflow、Cleanup Workflow、Squash Commits、Update PR、Promote PR）
   - Cleanup Workflow ステージのみ実装、他は TODO コメント付きの枠組み

2. **`jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`**
   - Finalize ジョブの Job DSL 定義
   - 汎用フォルダ対応（develop + stable-1～stable-9）
   - 18個のパラメータ定義

### 6.2 修正が必要な既存ファイル

**なし**

### 6.3 削除が必要なファイル

**なし**

## 7. 詳細設計

### 7.1 Jenkinsfile 設計

#### 7.1.1 基本構造

```groovy
/**
 * AI Workflow - Finalize Mode
 *
 * ワークフロー完了後の最終処理を行うJenkinsfile（v0.4.0、Issue #259で追加）。
 * Phase 1ではCleanup Workflowのみ実装。Phase 2で他のステージを拡張予定。
 */

def common

pipeline {
    agent {
        dockerfile {
            label 'ec2-fleet'
            dir '.'
            filename 'Dockerfile'
            args "-v \${WORKSPACE}:/workspace -w /workspace -e CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1"
        }
    }

    options {
        timestamps()
        ansiColor('xterm')
    }

    environment {
        // 環境変数定義（all-phasesと同じパターン）
    }

    stages {
        // 9つのステージ
    }

    post {
        // always, success, failure
    }
}
```

#### 7.1.2 ステージ構成

| ステージ名 | 説明 | 実装状況 |
|-----------|------|---------|
| Load Common Library | 共通処理モジュールの読み込み | 実装 |
| Prepare Agent Credentials | 認証情報の準備 | 実装 |
| Validate Parameters | パラメータバリデーション | 実装 |
| Setup Environment | REPOS_ROOT 準備、リポジトリクローン | 実装 |
| Setup Node.js Environment | npm install、npm run build | 実装 |
| Initialize Workflow | node dist/index.js init | 実装 |
| Cleanup Workflow | node dist/index.js cleanup | **実装（Phase 1）** |
| Squash Commits | コミットスカッシュ | TODO（Phase 2） |
| Update PR | PR本文の最終更新 | TODO（Phase 2） |
| Promote PR | ドラフト状態解除 | TODO（Phase 2） |

#### 7.1.3 環境変数定義

```groovy
environment {
    CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'
    WORKFLOW_DIR = '.'
    WORKFLOW_VERSION = '0.2.0'
    EXECUTION_MODE = 'finalize'
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

#### 7.1.4 Cleanup Workflow ステージ詳細設計

```groovy
stage('Cleanup Workflow') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Cleanup Workflow"
            echo "========================================="

            currentBuild.description = "Issue #${env.ISSUE_NUMBER} | Cleanup Workflow | ${env.REPO_OWNER}/${env.REPO_NAME}"

            dir(env.WORKFLOW_DIR) {
                if (params.DRY_RUN) {
                    echo "[DRY RUN] Cleanup workflow skipped"
                } else {
                    // Cleanup 実行
                    // --phases オプション: デフォルト 0-8（パラメータから取得）
                    // --dry-run オプション: DRY_RUNパラメータに応じて設定
                    // --all オプション: CLEANUP_ALL パラメータに応じて設定
                    def phasesFlag = params.CLEANUP_PHASES ? "--phases ${params.CLEANUP_PHASES}" : ''
                    def allFlag = params.CLEANUP_ALL ? '--all' : ''
                    def dryRunFlag = params.CLEANUP_DRY_RUN ? '--dry-run' : ''

                    sh """
                        node dist/index.js cleanup \
                            --issue ${env.ISSUE_NUMBER} \
                            ${phasesFlag} \
                            ${allFlag} \
                            ${dryRunFlag}
                    """
                }
            }
        }
    }
}
```

#### 7.1.5 TODO ステージ（Phase 2 用）

```groovy
stage('Squash Commits') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Squash Commits (Phase 2 - TODO)"
            echo "========================================="

            // TODO: Issue #194 の squash 機能を呼び出し
            // node dist/index.js execute --issue ${env.ISSUE_NUMBER} --phase evaluation --squash-on-complete
            // または専用コマンド追加の可能性
            echo "Squash Commits: Not implemented yet (Phase 2 - future expansion)"
            echo "Planned: Squash commits from base_commit to HEAD with AI-generated message"
        }
    }
}

stage('Update PR') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Update PR (Phase 2 - TODO)"
            echo "========================================="

            // TODO: PR本文の最終更新
            // gh pr edit コマンドでPR本文を更新
            // - 完了ステータスの記載
            // - 変更サマリーの更新
            echo "Update PR: Not implemented yet (Phase 2 - future expansion)"
            echo "Planned: Update PR body with completion status and summary"
        }
    }
}

stage('Promote PR') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Promote PR (Phase 2 - TODO)"
            echo "========================================="

            // TODO: ドラフト状態を解除
            // gh pr ready コマンドでドラフト状態を解除
            // 必要に応じてレビュアーをアサイン
            echo "Promote PR: Not implemented yet (Phase 2 - future expansion)"
            echo "Planned: Mark PR as ready for review and assign reviewers"
        }
    }
}
```

#### 7.1.6 パラメータバリデーション

```groovy
stage('Validate Parameters') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Validate Parameters"
            echo "========================================="

            if (!params.ISSUE_URL) {
                error("ISSUE_URL parameter is required")
            }

            if (!params.ISSUE_URL.startsWith('https://github.com/')) {
                error("ISSUE_URL must be a GitHub Issue URL: ${params.ISSUE_URL}")
            }

            if (!params.ISSUE_URL.contains('/issues/')) {
                error("ISSUE_URL must be a GitHub Issue URL (/issues/): ${params.ISSUE_URL}")
            }

            // CLEANUP_PHASES と CLEANUP_ALL の排他チェック
            if (params.CLEANUP_PHASES && params.CLEANUP_ALL) {
                error("Cannot specify both CLEANUP_PHASES and CLEANUP_ALL parameters")
            }

            // CLEANUP_PHASES 形式チェック（数値範囲またはフェーズ名リスト）
            if (params.CLEANUP_PHASES) {
                def phasesPattern = /^(\d+-\d+|[a-z-]+(,[a-z-]+)*)$/
                if (!params.CLEANUP_PHASES.matches(phasesPattern)) {
                    error("CLEANUP_PHASES must be numeric range (0-4) or phase name list (planning,requirements)")
                }
            }

            // Issue番号とリポジトリ情報抽出
            def urlParts = params.ISSUE_URL.split('/')
            env.ISSUE_NUMBER = urlParts[-1]
            env.REPO_OWNER = urlParts[-4]
            env.REPO_NAME = urlParts[-3]

            // ビルドディスクリプションを設定
            currentBuild.description = "Issue #${env.ISSUE_NUMBER} | Finalize | ${env.REPO_OWNER}/${env.REPO_NAME}"

            echo "Issue URL: ${params.ISSUE_URL}"
            echo "Issue Number: ${env.ISSUE_NUMBER}"
            echo "Repository Owner: ${env.REPO_OWNER}"
            echo "Repository Name: ${env.REPO_NAME}"
            echo "Cleanup Phases: ${params.CLEANUP_PHASES ?: '0-8 (default)'}"
            echo "Cleanup All: ${params.CLEANUP_ALL ?: false}"
            echo "Cleanup Dry Run: ${params.CLEANUP_DRY_RUN ?: false}"
            echo "Dry Run: ${params.DRY_RUN ?: false}"
        }
    }
}
```

#### 7.1.7 post 処理

```groovy
post {
    always {
        script {
            echo "========================================="
            echo "Post Processing"
            echo "========================================="

            currentBuild.description = "Issue #${env.ISSUE_NUMBER} | Finalize | ${env.REPO_OWNER}/${env.REPO_NAME}"

            if (env.ISSUE_NUMBER && env.ISSUE_NUMBER != 'auto') {
                common.archiveArtifacts(env.ISSUE_NUMBER)
            }

            // REPOS_ROOTクリーンアップ
            if (env.REPOS_ROOT) {
                sh """
                    rm -rf ${env.REPOS_ROOT}
                """
                echo "REPOS_ROOT cleaned up: ${env.REPOS_ROOT}"
            }
        }
    }

    success {
        script {
            echo "========================================="
            echo "✅ AI Workflow - Finalize Success"
            echo "========================================="
            echo "Issue: ${params.ISSUE_URL}"
            echo "Workflow Directory: .ai-workflow/issue-${env.ISSUE_NUMBER}"
        }
    }

    failure {
        script {
            echo "========================================="
            echo "❌ AI Workflow - Finalize Failure"
            echo "========================================="
            echo "Issue: ${params.ISSUE_URL}"
            echo "Please check the logs"
        }
    }
}
```

### 7.2 Job DSL 設計

#### 7.2.1 基本構造

```groovy
/**
 * AI Workflow Finalize Job DSL
 *
 * ワークフロー完了後の最終処理用ジョブ（cleanup、squash、PR更新等）
 * EXECUTION_MODE: finalize（固定値、パラメータとして表示しない）
 * パラメータ数: 18個（14個 + APIキー6個、all-phasesと同じパターン）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_finalize_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - Finalize Execution
            |
            |${descriptionHeader}
            |
            |## 概要
            |ワークフロー完了後の最終処理（cleanup、squash、PR更新等）を実行します。
            |Phase 1ではCleanup Workflowのみ実装。Phase 2で他のステージを拡張予定。
            |
            |## パラメータ
            |- ISSUE_URL（必須）: GitHub Issue URL
            |- CLEANUP_PHASES: クリーンアップ対象フェーズ範囲（デフォルト: 0-8）
            |- CLEANUP_ALL: 完全クリーンアップ（Phase 0-9すべて、Evaluation完了後のみ）
            |- CLEANUP_DRY_RUN: クリーンアッププレビューモード（削除対象の表示のみ）
            |- その他: 実行オプション、Git設定、AWS認証情報等
            |
            |## 注意事項
            |- EXECUTION_MODEは内部的に'finalize'に固定されます
            |- Phase 1: Cleanup Workflowのみ実装
            |- Phase 2: Squash Commits、Update PR、Promote PR（将来拡張予定）
            """.stripMargin())

        // パラメータ定義（18個）
        parameters {
            // 省略（次のセクションで詳細）
        }

        // ログローテーション
        logRotator {
            numToKeep(30)
            daysToKeep(90)
        }

        // パイプライン定義
        definition {
            cpsScm {
                scm {
                    git {
                        remote {
                            url('https://github.com/tielec/ai-workflow-agent.git')
                            credentials('github-token')
                        }
                        branch(gitBranch)
                    }
                }
                scriptPath('jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'finalize')
            env('WORKFLOW_VERSION', '0.2.0')
        }

        // プロパティ
        properties {
            disableConcurrentBuilds()
        }

        // ジョブの無効化状態
        disabled(false)
    }
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

#### 7.2.2 パラメータ定義（18個）

```groovy
parameters {
    // ========================================
    // 実行モード（固定値）
    // ========================================
    choiceParam('EXECUTION_MODE', ['finalize'], '''
実行モード（固定値 - 変更不可）
    '''.stripIndent().trim())

    // ========================================
    // 基本設定
    // ========================================
    stringParam('ISSUE_URL', '', '''
GitHub Issue URL（必須）

例: https://github.com/tielec/my-project/issues/123
注: Issue URL から対象リポジトリを自動判定します
    '''.stripIndent().trim())

    stringParam('BRANCH_NAME', '', '''
作業ブランチ名（任意）
空欄の場合は Issue 番号から自動生成されます
    '''.stripIndent().trim())

    choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: Codex APIキーがあれば Codex を優先し、なければ Claude Code を使用
- codex: Codex のみを使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
- claude: Claude Code のみを使用（credentials.json が必要）
    '''.stripIndent().trim())

    // ========================================
    // Cleanup 設定
    // ========================================
    stringParam('CLEANUP_PHASES', '0-8', '''
クリーンアップ対象フェーズ範囲

形式:
- 数値範囲: 0-4、5-7
- フェーズ名リスト（カンマ区切り）: planning,requirements,design

デフォルト: 0-8（Phase 0-8のログをクリーンアップ）
    '''.stripIndent().trim())

    booleanParam('CLEANUP_ALL', false, '''
完全クリーンアップ（Phase 0-9すべてのログを削除）

注意:
- Evaluation Phase（Phase 9）が completed 状態の場合のみ実行可能
- CLEANUP_PHASES と併用不可
    '''.stripIndent().trim())

    booleanParam('CLEANUP_DRY_RUN', false, '''
クリーンアッププレビューモード

true の場合、削除対象のみ表示し、実際には削除しない
    '''.stripIndent().trim())

    // ========================================
    // 実行オプション
    // ========================================
    booleanParam('DRY_RUN', false, '''
ドライランモード（API 呼び出しや Git 操作を行わず動作確認のみ実施）
    '''.stripIndent().trim())

    booleanParam('SKIP_REVIEW', false, '''
AI レビューをスキップする（検証・デバッグ用）
    '''.stripIndent().trim())

    // ========================================
    // Git 設定
    // ========================================
    stringParam('GIT_COMMIT_USER_NAME', 'AI Workflow Bot', '''
Git コミットユーザー名
    '''.stripIndent().trim())

    stringParam('GIT_COMMIT_USER_EMAIL', 'ai-workflow@example.com', '''
Git コミットメールアドレス
    '''.stripIndent().trim())

    // ========================================
    // AWS 認証情報（Infrastructure as Code 用）
    // ========================================
    stringParam('AWS_ACCESS_KEY_ID', '', '''
AWS アクセスキー ID（任意）
Infrastructure as Code実行時に必要
    '''.stripIndent().trim())

    nonStoredPasswordParam('AWS_SECRET_ACCESS_KEY', '''
AWS シークレットアクセスキー（任意）
Infrastructure as Code実行時に必要
    '''.stripIndent().trim())

    nonStoredPasswordParam('AWS_SESSION_TOKEN', '''
AWS セッショントークン（任意）
一時的な認証情報を使用する場合
    '''.stripIndent().trim())

    // ========================================
    // APIキー設定（6個）
    // ========================================
    nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token（任意）
GitHub API呼び出しに使用されます
    '''.stripIndent().trim())

    nonStoredPasswordParam('OPENAI_API_KEY', '''
OpenAI API キー（任意）
Codex実行モードで使用されます
    '''.stripIndent().trim())

    nonStoredPasswordParam('CODEX_API_KEY', '''
Codex API キー（任意）
OPENAI_API_KEYの代替として使用可能
    '''.stripIndent().trim())

    nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN', '''
Claude Code OAuth トークン（任意）
Claude実行モードで使用されます
    '''.stripIndent().trim())

    nonStoredPasswordParam('CLAUDE_CODE_API_KEY', '''
Claude Code API キー（任意）
Claude実行モードで使用されます
    '''.stripIndent().trim())

    nonStoredPasswordParam('ANTHROPIC_API_KEY', '''
Anthropic API キー（任意）
Claude実行モードで使用されます
    '''.stripIndent().trim())
}
```

### 7.3 関数設計

**主要な関数**:

共通処理モジュール（`jenkins/shared/common.groovy`）の既存関数を再利用：

1. **prepareAgentCredentials()**
   - 認証情報の準備と検証
   - エージェントモードに応じた検証

2. **setupEnvironment()**
   - REPOS_ROOT 準備
   - 対象リポジトリのクローン
   - ブランチチェックアウト

3. **setupNodeEnvironment()**
   - Node.js 環境確認
   - npm install 実行
   - npm run build 実行

4. **archiveArtifacts(String issueNumber)**
   - `.ai-workflow/issue-<NUM>/**/*` のアーカイブ

### 7.4 データ構造設計

**パラメータデータ構造**:

```groovy
params = [
    EXECUTION_MODE: 'finalize',          // 固定値
    ISSUE_URL: 'https://github.com/...',  // 必須
    BRANCH_NAME: '',                      // オプション
    AGENT_MODE: 'auto',                   // デフォルト: auto
    CLEANUP_PHASES: '0-8',                // デフォルト: 0-8
    CLEANUP_ALL: false,                   // デフォルト: false
    CLEANUP_DRY_RUN: false,               // デフォルト: false
    DRY_RUN: false,                       // デフォルト: false
    SKIP_REVIEW: false,                   // デフォルト: false
    GIT_COMMIT_USER_NAME: 'AI Workflow Bot',
    GIT_COMMIT_USER_EMAIL: 'ai-workflow@example.com',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    AWS_SESSION_TOKEN: '',
    GITHUB_TOKEN: '',
    OPENAI_API_KEY: '',
    CODEX_API_KEY: '',
    CLAUDE_CODE_OAUTH_TOKEN: '',
    CLAUDE_CODE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
]
```

**環境変数データ構造**:

```groovy
env = [
    EXECUTION_MODE: 'finalize',
    WORKFLOW_VERSION: '0.2.0',
    WORKFLOW_DIR: '.',
    LOG_NO_COLOR: 'true',
    ISSUE_NUMBER: '259',
    REPO_OWNER: 'tielec',
    REPO_NAME: 'ai-workflow-agent',
    REPOS_ROOT: '/tmp/ai-workflow-repos-${BUILD_ID}-${randomSuffix}',
    // その他の認証情報環境変数
]
```

### 7.5 インターフェース設計

**CLI コマンドインターフェース**:

```bash
# Cleanup 実行
node dist/index.js cleanup \
    --issue <ISSUE_NUMBER> \
    [--phases <range>] \
    [--all] \
    [--dry-run]
```

**パラメータ**:
- `--issue <number>`: Issue番号（必須）
- `--phases <range>`: フェーズ範囲（オプション、数値範囲またはフェーズ名リスト）
- `--all`: 完全クリーンアップ（Evaluation完了後のみ）
- `--dry-run`: プレビューモード

## 8. セキュリティ考慮事項

### 8.1 認証・認可

1. **GitHub Token**
   - `nonStoredPasswordParam` で定義し、ビルド履歴に保存しない
   - Jenkins Credentials からの取得を推奨

2. **API キー**
   - OpenAI、Codex、Claude、Anthropic の各 API キーは `nonStoredPasswordParam` で定義
   - ビルドログへの出力を避ける

3. **AWS 認証情報**
   - `nonStoredPasswordParam` で定義（SECRET_ACCESS_KEY、SESSION_TOKEN）
   - Infrastructure as Code 実行時のみ使用

### 8.2 データ保護

1. **リポジトリクローン時の認証情報**
   - HTTPS 形式のクローンで `GITHUB_TOKEN` を使用
   - トークンが URL に埋め込まれないように注意（Issue #54 で対応済み）

2. **成果物アーカイブ**
   - `.ai-workflow/issue-<NUM>/**/*` のアーカイブ
   - シークレット情報が含まれないことを確認（`metadata.json` のスキャンは Issue #54 で対応済み）

### 8.3 セキュリティリスクと対策

| リスク | 対策 |
|-------|------|
| API キーのビルドログ漏洩 | `nonStoredPasswordParam` 使用、ログ出力時のマスキング |
| GitHub Token の URL 埋め込み | `sanitizeGitUrl()` による自動除去（Issue #54） |
| シークレット情報の成果物アーカイブ | `SecretMasker` によるスキャン（Issue #54） |
| 不正なパラメータ入力 | バリデーションステージで検証 |

## 9. 非機能要件への対応

### 9.1 パフォーマンス

1. **Cleanup 実行時間**
   - 対象フェーズ数に依存（Phase 0-8: 約3分以内を想定）
   - `--dry-run` モードで事前確認が可能

2. **パイプライン全体の実行時間**
   - 環境セットアップ: 約2分
   - Cleanup 実行: 約3分
   - 合計: 約5分以内（TODO ステージを除く）

### 9.2 スケーラビリティ

1. **汎用フォルダ対応**
   - develop + stable-1～stable-9 の10フォルダに対応
   - 各フォルダで独立したジョブが作成される

2. **リソース分離**
   - REPOS_ROOT を各ビルドごとにランダムサフィックス付きで作成
   - ビルド間のリソース競合を回避

### 9.3 保守性

1. **共通処理の再利用**
   - `jenkins/shared/common.groovy` を活用
   - 重複コードを約90%削減

2. **コードの可読性**
   - 各ステージの処理内容を明記
   - TODO コメントで将来の拡張を明示

3. **ドキュメント整備**
   - Job DSL の description に詳細な説明を記載
   - Jenkinsfile のコメントで各ステージの役割を明記

## 10. 実装の順序

### 推奨実装順序

1. **Job DSL 作成**
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` 作成
   - 既存の `ai_workflow_all_phases_job.groovy` をテンプレートとして使用
   - パラメータ定義を調整（18個）

2. **Jenkinsfile 作成**
   - `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` 作成
   - 既存の `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` をテンプレートとして使用
   - 9つのステージを実装

3. **Cleanup Workflow ステージ実装**
   - `node dist/index.js cleanup` コマンドの呼び出し
   - パラメータフラグの構築（`--phases`, `--all`, `--dry-run`）

4. **TODO ステージの枠組み実装**
   - Squash Commits ステージ
   - Update PR ステージ
   - Promote PR ステージ
   - それぞれ TODO コメントと echo メッセージのみ

5. **パラメータバリデーション強化**
   - CLEANUP_PHASES と CLEANUP_ALL の排他チェック
   - CLEANUP_PHASES 形式チェック

6. **シードジョブへの統合確認**
   - 既存のシードジョブから自動的に読み込まれることを確認
   - 必要に応じて `seed-job.groovy` または設定ファイルを更新

7. **テスト実行**
   - シードジョブ実行
   - Finalize ジョブ作成確認
   - パラメータバリデーションテスト
   - Cleanup Workflow ステージテスト
   - TODO ステージのスキップ動作確認

### 依存関係の考慮

```
Step 1: Job DSL 作成
   ↓（依存）
Step 2: Jenkinsfile 作成
   ↓（依存）
Step 3: Cleanup Workflow ステージ実装
   ↓（並行可能）
Step 4: TODO ステージの枠組み実装
   ↓（並行可能）
Step 5: パラメータバリデーション強化
   ↓（依存）
Step 6: シードジョブへの統合確認
   ↓（依存）
Step 7: テスト実行
```

## 11. Phase 2（将来拡張）の設計メモ

### 11.1 Squash Commits Stage

**想定実装**:
```groovy
stage('Squash Commits') {
    steps {
        script {
            if (params.SQUASH_ON_COMPLETE) {
                echo "Squashing commits from base_commit to HEAD..."

                dir(env.WORKFLOW_DIR) {
                    // Issue #194 の squash 機能を呼び出し
                    // オプション1: execute コマンドに --squash-on-complete フラグを追加
                    // オプション2: 専用コマンド追加（node dist/index.js squash --issue <NUM>）

                    sh """
                        node dist/index.js execute \
                            --issue ${env.ISSUE_NUMBER} \
                            --phase evaluation \
                            --squash-on-complete
                    """
                }
            } else {
                echo "Squash commits skipped (SQUASH_ON_COMPLETE = false)"
            }
        }
    }
}
```

**新規パラメータ**:
- `SQUASH_ON_COMPLETE`: boolean（デフォルト: false）

### 11.2 Update PR Stage

**想定実装**:
```groovy
stage('Update PR') {
    steps {
        script {
            if (params.UPDATE_PR) {
                echo "Updating PR body with completion status..."

                dir(env.WORKFLOW_DIR) {
                    // gh pr edit コマンドでPR本文を更新
                    // - 完了ステータスの記載
                    // - 変更サマリーの更新

                    sh """
                        gh pr edit \
                            --body-file .ai-workflow/issue-${env.ISSUE_NUMBER}/08_report/output/pr_body.md \
                            --repo ${env.REPO_OWNER}/${env.REPO_NAME}
                    """
                }
            } else {
                echo "Update PR skipped (UPDATE_PR = false)"
            }
        }
    }
}
```

**新規パラメータ**:
- `UPDATE_PR`: boolean（デフォルト: true）

### 11.3 Promote PR Stage

**想定実装**:
```groovy
stage('Promote PR') {
    steps {
        script {
            if (params.PROMOTE_PR) {
                echo "Promoting PR from draft to ready for review..."

                dir(env.WORKFLOW_DIR) {
                    // gh pr ready コマンドでドラフト状態を解除
                    // 必要に応じてレビュアーをアサイン

                    sh """
                        PR_NUMBER=\$(gh pr view --json number --jq .number)
                        gh pr ready \${PR_NUMBER} \
                            --repo ${env.REPO_OWNER}/${env.REPO_NAME}

                        # レビュアーをアサイン（オプション）
                        if [ -n "${params.REVIEWERS ?: ''}" ]; then
                            gh pr edit \${PR_NUMBER} \
                                --add-reviewer ${params.REVIEWERS} \
                                --repo ${env.REPO_OWNER}/${env.REPO_NAME}
                        fi
                    """
                }
            } else {
                echo "Promote PR skipped (PROMOTE_PR = false)"
            }
        }
    }
}
```

**新規パラメータ**:
- `PROMOTE_PR`: boolean（デフォルト: true）
- `REVIEWERS`: string（オプション、カンマ区切り）

## 12. 品質ゲート確認

### 設計書品質ゲート

- [x] **実装戦略の判断根拠が明記されている**
  - CREATE 戦略を選択
  - 新規ファイル作成中心、既存ファイルへの影響ゼロ、独立したパイプライン

- [x] **テスト戦略の判断根拠が明記されている**
  - INTEGRATION_ONLY 戦略を選択
  - Jenkins 環境での統合テストが中心、既存テストの活用、手動テスト戦略

- [x] **テストコード戦略の判断根拠が明記されている**
  - NO_TEST 戦略を選択
  - Groovy スクリプトの単体テストは実装しない、統合テストと手動検証で品質を確保

- [x] **既存コードへの影響範囲が分析されている**
  - 既存の5つの実行モードには一切影響なし
  - 既存の `common.groovy` と `cleanup` コマンドを再利用するのみで変更不要

- [x] **変更が必要なファイルがリストアップされている**
  - 新規作成ファイル: 2ファイル（Jenkinsfile、Job DSL）
  - 修正が必要な既存ファイル: なし
  - 削除が必要なファイル: なし

- [x] **設計が実装可能である**
  - 既存の all-phases、rollback パターンを踏襲
  - 共通処理モジュールを再利用
  - cleanup コマンドは既に実装済み（Issue #212）

## 13. 変更履歴

| 日時 | 変更内容 | 変更者 |
|-----|---------|--------|
| 2025-12-06 | 初版作成 | Claude Agent |

---

この詳細設計書に基づいて、次のフェーズ（Implementation Phase）で実装を行います。
