# PR comment resolution 機能の Jenkins 統合

## 概要

Issue #383 で実装された `pr-comment` コマンド（init, execute, finalize）を Jenkins パイプラインとして実行できるようにします。Jenkins Job DSL、Jenkinsfile、Seed Job 設定ファイルを作成し、Jenkins UI から PR コメント自動対応ワークフローを実行可能にします。

**ジョブ構成**:
- **PR Comment Execute ジョブ**: init + execute（コメント処理まで実行）
- **PR Comment Finalize ジョブ**: finalize のみ（スレッド解決とクリーンアップ）

## 背景

### 実装済み機能（Issue #383）

以下の3つのコマンドが既に実装されています：

1. **`pr-comment init`**: PRから未解決レビューコメントを取得し、メタデータを初期化
2. **`pr-comment execute`**: 各コメントをAIエージェントで分析し、コード修正・返信投稿を実行
3. **`pr-comment finalize`**: 完了したコメントスレッドを解決し、メタデータをクリーンアップ

**CLI 使用例**:
```bash
# 1. 初期化
ai-workflow pr-comment init --pr 123

# 2. 実行
ai-workflow pr-comment execute --pr 123 --agent auto

# 3. 完了
ai-workflow pr-comment finalize --pr 123
```

### Jenkins 統合の必要性

現在の実装はローカル CLI のみのため、以下の問題があります：

1. **手動実行が必要**: PR レビュー後、開発者が手動でコマンドを実行する必要がある
2. **CI/CD パイプラインに統合できない**: Jenkins ジョブとして定義されていないため、自動化できない
3. **統一された実行環境がない**: ローカル環境の差異により、動作が不安定になる可能性がある

## 目標

Jenkins Job DSL と Jenkinsfile を作成し、以下を実現します：

1. **Jenkins UI から実行可能**: パラメータ入力のみで PR コメント自動対応を実行
2. **2つのジョブによる段階的実行**:
   - **Execute ジョブ**: init + execute（コメント処理まで）
   - **Finalize ジョブ**: finalize のみ（スレッド解決とクリーンアップ）
3. **既存ジョブとの整合性**: 既存の ai-workflow ジョブ（all-phases, preset, single-phase 等）と同じ構造
4. **Seed Job への統合**: 既存の Seed Job で Jenkins ジョブを自動生成

## 実装詳細

### 対象ファイル

#### 新規作成（5ファイル）

1. **`jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy`** - Execute ジョブ Job DSL 定義
2. **`jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy`** - Finalize ジョブ Job DSL 定義
3. **`jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile`** - Execute パイプライン実装
4. **`jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile`** - Finalize パイプライン実装
5. **`jenkins/seed/ai_workflow_seed.groovy`** - Seed Job 設定（更新）

### ファイル構成

```
jenkins/
├── jobs/
│   ├── dsl/
│   │   └── ai-workflow/
│   │       ├── ai_workflow_all_phases_job.groovy
│   │       ├── ai_workflow_preset_job.groovy
│   │       ├── ai_workflow_single_phase_job.groovy
│   │       ├── ai_workflow_rollback_job.groovy
│   │       ├── ai_workflow_finalize_job.groovy
│   │       ├── ai_workflow_pr_comment_execute_job.groovy   // 新規
│   │       └── ai_workflow_pr_comment_finalize_job.groovy  // 新規
│   └── pipeline/
│       └── ai-workflow/
│           ├── all-phases/
│           ├── preset/
│           ├── single-phase/
│           ├── rollback/
│           ├── finalize/
│           ├── pr-comment-execute/                          // 新規
│           │   └── Jenkinsfile
│           └── pr-comment-finalize/                         // 新規
│               └── Jenkinsfile
├── seed/
│   └── ai_workflow_seed.groovy                              // 更新
└── shared/
    └── common.groovy
```

### Job DSL 定義

#### 1. Execute ジョブ（init + execute）

**jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy**

```groovy
/**
 * AI Workflow PR Comment Execute Job DSL
 *
 * PRレビューコメント処理用ジョブ（init + execute）
 * - Init: PRから未解決コメントを取得してメタデータを初期化
 * - Execute: 各コメントをAIエージェントで分析し、コード修正・返信投稿を実行
 *
 * EXECUTION_MODE: pr_comment_execute（固定値）
 * パラメータ数: 14個（8個 + APIキー6個）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_pr_comment_execute_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - PR Comment Execute
            |
            |${descriptionHeader}
            |
            |## 概要
            |Pull Requestに投稿されたレビューコメントを検出し、AIエージェントが自動的に対応します。
            |このジョブは Init + Execute の2ステージを実行します。
            |
            |## ワークフローステージ
            |1. **Init**: PRから未解決コメントを取得してメタデータを初期化
            |2. **Execute**: 各コメントをAIエージェントで分析し、コード修正・返信投稿を実行
            |
            |## 解決タイプ
            |- **code_change**: コード修正を適用
            |- **reply**: 返信のみ投稿
            |- **discussion**: 議論が必要（スキップ）
            |- **skip**: 対応不要
            |
            |## セキュリティ機能
            |- confidence: low のコード変更を discussion に強制変更
            |- 機密ファイル（.env, credentials.json等）除外
            |- パストラバーサル防止
            |
            |## 次のステップ
            |このジョブ完了後、**PR Comment Finalize ジョブ**を実行してスレッド解決とクリーンアップを行います。
            |
            |## 注意事項
            |- PR番号の指定が必須です
            |- GitHub Token は必須（PR コメント取得・投稿に使用）
            |- dry-run モードでプレビュー可能
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['pr_comment_execute'], '''
実行モード（固定値 - 変更不可）
Init + Execute の2ステージを実行します
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('PR_NUMBER', '', '''
Pull Request 番号（必須）

例: 123
            '''.stripIndent().trim())

            stringParam('GITHUB_REPOSITORY', 'tielec/ai-workflow-agent', '''
対象GitHubリポジトリ（owner/repo形式）

例: tielec/ai-workflow-agent
            '''.stripIndent().trim())

            choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: Codex APIキーがあれば Codex を優先し、なければ Claude Code を使用
- codex: Codex のみを使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
- claude: Claude Code のみを使用（credentials.json が必要）
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（変更を適用せず動作確認のみ実施）
            '''.stripIndent().trim())

            stringParam('BATCH_SIZE', '5', '''
一度に処理するコメント数（デフォルト: 5）

大量のコメントがある場合、バッチサイズを調整してください
            '''.stripIndent().trim())

            // ========================================
            // Git 設定
            // ========================================
            stringParam('GIT_COMMIT_USER_NAME', 'AI Workflow', '''
Git コミットユーザー名
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_EMAIL', 'ai-workflow@tielec.local', '''
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
            // APIキー設定
            // ========================================
            nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token（必須）
PRコメント取得・投稿に使用されます
            '''.stripIndent().trim())

            nonStoredPasswordParam('OPENAI_API_KEY', '''
OpenAI API キー（任意）
Codex実行モードで使用されます
            '''.stripIndent().trim())

            nonStoredPasswordParam('CODEX_API_KEY', '''
Codex API キー（任意）
OPENAI_API_KEYの代替として使用可能
            '''.stripIndent().trim())

            textParam('CODEX_AUTH_JSON', '', '''
Codex auth.json の内容（任意）

Codex CLI 用の ~/.codex/auth.json を貼り付けます。ジョブ実行中のみ workspace/.codex/auth.json として展開され、完了後にクリーンアップされます。
空欄の場合はファイルを作成しません。※ 入力内容はログに出力されません。
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'pr_comment_execute')
            env('WORKFLOW_VERSION', '0.6.0')
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
        "フォルダ: ${folder.displayName}\\nブランチ: ${folder.branch}",
        folder.branch
    )
}
```

#### 2. Finalize ジョブ（finalize のみ）

**jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy**

```groovy
/**
 * AI Workflow PR Comment Finalize Job DSL
 *
 * PRレビューコメント完了処理用ジョブ（finalize のみ）
 * - Finalize: 完了したコメントスレッドを解決し、メタデータをクリーンアップ
 *
 * EXECUTION_MODE: pr_comment_finalize（固定値）
 * パラメータ数: 11個（5個 + APIキー6個）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_pr_comment_finalize_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - PR Comment Finalize
            |
            |${descriptionHeader}
            |
            |## 概要
            |PRレビューコメント対応完了後の最終処理を実行します。
            |このジョブは Finalize ステージのみを実行します。
            |
            |## ワークフローステージ
            |1. **Finalize**: 完了したコメントスレッドを解決し、メタデータをクリーンアップ
            |
            |## 前提条件
            |**PR Comment Execute ジョブ**を事前に実行し、コメント処理を完了している必要があります。
            |
            |## 注意事項
            |- PR番号の指定が必須です
            |- GitHub Token は必須（PR コメントスレッド解決に使用）
            |- dry-run モードでプレビュー可能
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['pr_comment_finalize'], '''
実行モード（固定値 - 変更不可）
Finalize ステージのみを実行します
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('PR_NUMBER', '', '''
Pull Request 番号（必須）

例: 123
            '''.stripIndent().trim())

            stringParam('GITHUB_REPOSITORY', 'tielec/ai-workflow-agent', '''
対象GitHubリポジトリ（owner/repo形式）

例: tielec/ai-workflow-agent
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（変更を適用せず動作確認のみ実施）
            '''.stripIndent().trim())

            // ========================================
            // Git 設定
            // ========================================
            stringParam('GIT_COMMIT_USER_NAME', 'AI Workflow', '''
Git コミットユーザー名
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_EMAIL', 'ai-workflow@tielec.local', '''
Git コミットメールアドレス
            '''.stripIndent().trim())

            // ========================================
            // APIキー設定
            // ========================================
            nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token（必須）
PRコメントスレッド解決に使用されます
            '''.stripIndent().trim())

            // 以下は finalize では不要だが、共通ライブラリとの互換性のために定義
            nonStoredPasswordParam('OPENAI_API_KEY', '''
OpenAI API キー（Finalize では使用されません）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CODEX_API_KEY', '''
Codex API キー（Finalize では使用されません）
            '''.stripIndent().trim())

            textParam('CODEX_AUTH_JSON', '', '''
Codex auth.json の内容（Finalize では使用されません）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN', '''
Claude Code OAuth トークン（Finalize では使用されません）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_API_KEY', '''
Claude Code API キー（Finalize では使用されません）
            '''.stripIndent().trim())

            nonStoredPasswordParam('ANTHROPIC_API_KEY', '''
Anthropic API キー（Finalize では使用されません）
            '''.stripIndent().trim())
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'pr_comment_finalize')
            env('WORKFLOW_VERSION', '0.6.0')
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
        "フォルダ: ${folder.displayName}\\nブランチ: ${folder.branch}",
        folder.branch
    )
}
```

### Jenkinsfile 定義

#### 1. Execute Jenkinsfile（init + execute）

**jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile**

```groovy
/**
 * AI Workflow - PR Comment Execute
 *
 * PRレビューコメント処理用Jenkinsfile（v0.6.0、Issue #383で実装）。
 * 2つのステージで構成：
 * 1. Init: PRから未解決コメントを取得してメタデータを初期化
 * 2. Execute: 各コメントをAIエージェントで分析し、コード修正・返信投稿を実行
 *
 * パラメータ（Job DSLで定義）:
 * - PR_NUMBER: Pull Request 番号（必須）
 * - GITHUB_REPOSITORY: 対象GitHubリポジトリ（デフォルト: tielec/ai-workflow-agent）
 * - AGENT_MODE: エージェントモード（デフォルト: auto）
 * - DRY_RUN: ドライランモード（デフォルト: false）
 * - BATCH_SIZE: 一度に処理するコメント数（デフォルト: 5）
 * - GITHUB_TOKEN: GitHub Personal Access Token（必須）
 * - その他の認証情報（Jenkinsfile.all-phasesと同じ）
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
        CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'
        WORKFLOW_DIR = '.'
        WORKFLOW_VERSION = '0.6.0'
        EXECUTION_MODE = 'pr_comment_execute'
        CODEX_HOME = ''
        LOG_NO_COLOR = 'true'

        GIT_COMMIT_USER_NAME = "${params.GIT_COMMIT_USER_NAME ?: 'AI Workflow'}"
        GIT_COMMIT_USER_EMAIL = "${params.GIT_COMMIT_USER_EMAIL ?: 'ai-workflow@tielec.local'}"

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

    stages {
        stage('Load Common Library') {
            steps {
                script {
                    echo "========================================="
                    echo "AI Workflow Orchestrator v${env.WORKFLOW_VERSION}"
                    echo "Mode: PR Comment Execute (Init + Execute)"
                    echo "========================================="

                    common = load 'jenkins/shared/common.groovy'
                    echo "Common library loaded successfully"
                }
            }
        }

        stage('Prepare Codex auth.json') {
            steps {
                script {
                    common.prepareCodexAuthFile()
                }
            }
        }

        stage('Prepare Agent Credentials') {
            steps {
                script {
                    common.prepareAgentCredentials()
                }
            }
        }

        stage('Validate Parameters') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Validate Parameters"
                    echo "========================================="

                    if (!params.PR_NUMBER) {
                        error("PR_NUMBER parameter is required")
                    }

                    if (!params.GITHUB_REPOSITORY) {
                        error("GITHUB_REPOSITORY parameter is required")
                    }

                    // リポジトリ情報抽出
                    def repoParts = params.GITHUB_REPOSITORY.split('/')
                    if (repoParts.size() != 2) {
                        error("GITHUB_REPOSITORY must be in 'owner/repo' format: ${params.GITHUB_REPOSITORY}")
                    }
                    env.REPO_OWNER = repoParts[0]
                    env.REPO_NAME = repoParts[1]

                    // ビルドディスクリプションを設定
                    currentBuild.description = "PR #${params.PR_NUMBER} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    echo "PR Number: ${params.PR_NUMBER}"
                    echo "Repository Owner: ${env.REPO_OWNER}"
                    echo "Repository Name: ${env.REPO_NAME}"
                    echo "Agent Mode: ${params.AGENT_MODE}"
                    echo "Batch Size: ${params.BATCH_SIZE ?: 5}"
                    echo "Dry Run: ${params.DRY_RUN ?: false}"
                }
            }
        }

        stage('Setup Environment') {
            steps {
                script {
                    common.setupEnvironment()
                }
            }
        }

        stage('Setup Node.js Environment') {
            steps {
                script {
                    common.setupNodeEnvironment()
                }
            }
        }

        stage('PR Comment Init') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: PR Comment Init"
                    echo "========================================="
                    echo "PR: #${params.PR_NUMBER}"

                    currentBuild.description = "PR #${params.PR_NUMBER} | Initializing | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        def dryRunFlag = params.DRY_RUN ? '--dry-run' : ''

                        sh """
                            node dist/index.js pr-comment init \
                                --pr ${params.PR_NUMBER} \
                                ${dryRunFlag}
                        """
                    }
                }
            }
        }

        stage('PR Comment Execute') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: PR Comment Execute"
                    echo "========================================="
                    echo "PR: #${params.PR_NUMBER}"
                    echo "Agent Mode: ${params.AGENT_MODE}"
                    echo "Batch Size: ${params.BATCH_SIZE ?: 5}"

                    currentBuild.description = "PR #${params.PR_NUMBER} | Executing | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        def dryRunFlag = params.DRY_RUN ? '--dry-run' : ''
                        def batchSizeFlag = params.BATCH_SIZE ? "--batch-size ${params.BATCH_SIZE}" : ''

                        sh """
                            node dist/index.js pr-comment execute \
                                --pr ${params.PR_NUMBER} \
                                --agent ${params.AGENT_MODE ?: 'auto'} \
                                ${dryRunFlag} \
                                ${batchSizeFlag}
                        """
                    }
                }
            }
        }

    }

    post {
        always {
            script {
                echo "========================================="
                echo "Post Processing"
                echo "========================================="

                currentBuild.description = "PR #${params.PR_NUMBER} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                if (params.PR_NUMBER) {
                    // メタデータディレクトリをアーカイブ
                    def metadataDir = ".ai-workflow/pr-${params.PR_NUMBER}"
                    if (fileExists(metadataDir)) {
                        archiveArtifacts artifacts: "${metadataDir}/**/*", allowEmptyArchive: true
                    }
                }

                // REPOS_ROOTクリーンアップ
                if (env.REPOS_ROOT) {
                    sh """
                        rm -rf ${env.REPOS_ROOT}
                    """
                    echo "REPOS_ROOT cleaned up: ${env.REPOS_ROOT}"
                }

                if (env.CODEX_HOME?.trim()) {
                    sh """
                        rm -rf ${env.CODEX_HOME}
                    """
                    echo "CODEX_HOME cleaned up: ${env.CODEX_HOME}"
                }

                // ワークスペースのクリーンアップ
                cleanWs()
                echo "Workspace cleaned up"
            }
        }

        success {
            script {
                echo "========================================="
                echo "✅ AI Workflow - PR Comment Execute Success"
                echo "========================================="
                echo "PR: #${params.PR_NUMBER}"
                echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                echo ""
                echo "次のステップ: PR Comment Finalize ジョブを実行してください"
            }
        }

        failure {
            script {
                echo "========================================="
                echo "❌ AI Workflow - PR Comment Execute Failure"
                echo "========================================="
                echo "PR: #${params.PR_NUMBER}"
                echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                echo "Please check the logs"
            }
        }
    }
}
```

#### 2. Finalize Jenkinsfile（finalize のみ）

**jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile**

```groovy
/**
 * AI Workflow - PR Comment Finalize
 *
 * PRレビューコメント完了処理用Jenkinsfile（v0.6.0、Issue #383で実装）。
 * 1つのステージで構成：
 * 1. Finalize: 完了したコメントスレッドを解決し、メタデータをクリーンアップ
 *
 * 前提条件: PR Comment Execute ジョブが事前に実行されている必要があります
 *
 * パラメータ（Job DSLで定義）:
 * - PR_NUMBER: Pull Request 番号（必須）
 * - GITHUB_REPOSITORY: 対象GitHubリポジトリ（デフォルト: tielec/ai-workflow-agent）
 * - DRY_RUN: ドライランモード（デフォルト: false）
 * - GITHUB_TOKEN: GitHub Personal Access Token（必須）
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
        CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'
        WORKFLOW_DIR = '.'
        WORKFLOW_VERSION = '0.6.0'
        EXECUTION_MODE = 'pr_comment_finalize'
        CODEX_HOME = ''
        LOG_NO_COLOR = 'true'

        GIT_COMMIT_USER_NAME = "${params.GIT_COMMIT_USER_NAME ?: 'AI Workflow'}"
        GIT_COMMIT_USER_EMAIL = "${params.GIT_COMMIT_USER_EMAIL ?: 'ai-workflow@tielec.local'}"

        GITHUB_TOKEN = "${params.GITHUB_TOKEN}"
        GITHUB_REPOSITORY = "${params.GITHUB_REPOSITORY ?: 'tielec/ai-workflow-agent'}"
    }

    stages {
        stage('Load Common Library') {
            steps {
                script {
                    echo "========================================="
                    echo "AI Workflow Orchestrator v${env.WORKFLOW_VERSION}"
                    echo "Mode: PR Comment Finalize"
                    echo "========================================="

                    common = load 'jenkins/shared/common.groovy'
                    echo "Common library loaded successfully"
                }
            }
        }

        stage('Validate Parameters') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Validate Parameters"
                    echo "========================================="

                    if (!params.PR_NUMBER) {
                        error("PR_NUMBER parameter is required")
                    }

                    if (!params.GITHUB_REPOSITORY) {
                        error("GITHUB_REPOSITORY parameter is required")
                    }

                    // リポジトリ情報抽出
                    def repoParts = params.GITHUB_REPOSITORY.split('/')
                    if (repoParts.size() != 2) {
                        error("GITHUB_REPOSITORY must be in 'owner/repo' format: ${params.GITHUB_REPOSITORY}")
                    }
                    env.REPO_OWNER = repoParts[0]
                    env.REPO_NAME = repoParts[1]

                    // ビルドディスクリプションを設定
                    currentBuild.description = "PR #${params.PR_NUMBER} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    echo "PR Number: ${params.PR_NUMBER}"
                    echo "Repository Owner: ${env.REPO_OWNER}"
                    echo "Repository Name: ${env.REPO_NAME}"
                    echo "Dry Run: ${params.DRY_RUN ?: false}"
                }
            }
        }

        stage('Setup Environment') {
            steps {
                script {
                    common.setupEnvironment()
                }
            }
        }

        stage('Setup Node.js Environment') {
            steps {
                script {
                    common.setupNodeEnvironment()
                }
            }
        }

        stage('PR Comment Finalize') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: PR Comment Finalize"
                    echo "========================================="
                    echo "PR: #${params.PR_NUMBER}"

                    currentBuild.description = "PR #${params.PR_NUMBER} | Finalizing | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Finalize skipped"
                        } else {
                            sh """
                                node dist/index.js pr-comment finalize \
                                    --pr ${params.PR_NUMBER}
                            """
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo "========================================="
                echo "Post Processing"
                echo "========================================="

                currentBuild.description = "PR #${params.PR_NUMBER} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                if (params.PR_NUMBER) {
                    // メタデータディレクトリをアーカイブ
                    def metadataDir = ".ai-workflow/pr-${params.PR_NUMBER}"
                    if (fileExists(metadataDir)) {
                        archiveArtifacts artifacts: "${metadataDir}/**/*", allowEmptyArchive: true
                    }
                }

                // REPOS_ROOTクリーンアップ
                if (env.REPOS_ROOT) {
                    sh """
                        rm -rf ${env.REPOS_ROOT}
                    """
                    echo "REPOS_ROOT cleaned up: ${env.REPOS_ROOT}"
                }

                // ワークスペースのクリーンアップ
                cleanWs()
                echo "Workspace cleaned up"
            }
        }

        success {
            script {
                echo "========================================="
                echo "✅ AI Workflow - PR Comment Finalize Success"
                echo "========================================="
                echo "PR: #${params.PR_NUMBER}"
                echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                echo ""
                echo "すべてのPRコメント対応が完了しました"
            }
        }

        failure {
            script {
                echo "========================================="
                echo "❌ AI Workflow - PR Comment Finalize Failure"
                echo "========================================="
                echo "PR: #${params.PR_NUMBER}"
                echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                echo "Please check the logs"
            }
        }
    }
}
```

### Seed Job 設定の更新

#### jenkins/seed/ai_workflow_seed.groovy（更新箇所のみ）

```groovy
// jenkins-jobs-config.yaml の読み込み部分に追加
def jenkinsJobsConfig = [
    ai_workflow_all_phases_job: [
        name: 'AI_Workflow_All_Phases',
        displayName: 'AI Workflow - All Phases (Planning → Evaluation)'
    ],
    ai_workflow_preset_job: [
        name: 'AI_Workflow_Preset',
        displayName: 'AI Workflow - Preset Execution'
    ],
    ai_workflow_single_phase_job: [
        name: 'AI_Workflow_Single_Phase',
        displayName: 'AI Workflow - Single Phase Execution'
    ],
    ai_workflow_rollback_job: [
        name: 'AI_Workflow_Rollback',
        displayName: 'AI Workflow - Rollback Execution'
    ],
    ai_workflow_finalize_job: [
        name: 'AI_Workflow_Finalize',
        displayName: 'AI Workflow - Finalize Execution'
    ],
    ai_workflow_pr_comment_execute_job: [                     // 新規追加
        name: 'AI_Workflow_PR_Comment_Execute',
        displayName: 'AI Workflow - PR Comment Execute'
    ],
    ai_workflow_pr_comment_finalize_job: [                    // 新規追加
        name: 'AI_Workflow_PR_Comment_Finalize',
        displayName: 'AI Workflow - PR Comment Finalize'
    ]
]

// Job DSL スクリプトの実行部分に追加
jobDsl {
    targets([
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy',
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy',
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy',
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy',
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy',   // 新規追加
        'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy'   // 新規追加
    ].join('\n'))

    // ...existing code...
}
```

## パラメータ仕様

### 1. Execute ジョブ

#### 必須パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `PR_NUMBER` | Pull Request 番号 | `123` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxx` |

#### オプションパラメータ

| パラメータ | デフォルト値 | 説明 |
|-----------|------------|------|
| `GITHUB_REPOSITORY` | `tielec/ai-workflow-agent` | 対象GitHubリポジトリ（owner/repo形式） |
| `AGENT_MODE` | `auto` | エージェントモード（auto \| codex \| claude） |
| `DRY_RUN` | `false` | ドライランモード |
| `BATCH_SIZE` | `5` | 一度に処理するコメント数 |
| `GIT_COMMIT_USER_NAME` | `AI Workflow` | Git コミットユーザー名 |
| `GIT_COMMIT_USER_EMAIL` | `ai-workflow@tielec.local` | Git コミットメールアドレス |

#### APIキーパラメータ（6個）

- `OPENAI_API_KEY` - OpenAI API キー
- `CODEX_API_KEY` - Codex API キー
- `CODEX_AUTH_JSON` - Codex auth.json の内容
- `CLAUDE_CODE_OAUTH_TOKEN` - Claude Code OAuth トークン
- `CLAUDE_CODE_API_KEY` - Claude Code API キー
- `ANTHROPIC_API_KEY` - Anthropic API キー

**合計パラメータ数**: 14個（8個 + APIキー6個）

### 2. Finalize ジョブ

#### 必須パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `PR_NUMBER` | Pull Request 番号 | `123` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxx` |

#### オプションパラメータ

| パラメータ | デフォルト値 | 説明 |
|-----------|------------|------|
| `GITHUB_REPOSITORY` | `tielec/ai-workflow-agent` | 対象GitHubリポジトリ（owner/repo形式） |
| `DRY_RUN` | `false` | ドライランモード |
| `GIT_COMMIT_USER_NAME` | `AI Workflow` | Git コミットユーザー名 |
| `GIT_COMMIT_USER_EMAIL` | `ai-workflow@tielec.local` | Git コミットメールアドレス |

#### APIキーパラメータ（6個、finalize では未使用だが互換性のため定義）

- `OPENAI_API_KEY` - OpenAI API キー（Finalize では使用されません）
- `CODEX_API_KEY` - Codex API キー（Finalize では使用されません）
- `CODEX_AUTH_JSON` - Codex auth.json の内容（Finalize では使用されません）
- `CLAUDE_CODE_OAUTH_TOKEN` - Claude Code OAuth トークン（Finalize では使用されません）
- `CLAUDE_CODE_API_KEY` - Claude Code API キー（Finalize では使用されません）
- `ANTHROPIC_API_KEY` - Anthropic API キー（Finalize では使用されません）

**合計パラメータ数**: 11個（5個 + APIキー6個）

## Jenkins ジョブ構成

### フォルダ構造

```
AI_Workflow/
├── develop/
│   ├── AI_Workflow_All_Phases
│   ├── AI_Workflow_Preset
│   ├── AI_Workflow_Single_Phase
│   ├── AI_Workflow_Rollback
│   ├── AI_Workflow_Finalize
│   ├── AI_Workflow_PR_Comment_Execute      // 新規
│   └── AI_Workflow_PR_Comment_Finalize     // 新規
├── stable-1/
│   ├── AI_Workflow_PR_Comment_Execute      // 新規
│   └── AI_Workflow_PR_Comment_Finalize     // 新規
├── stable-2/
│   ├── AI_Workflow_PR_Comment_Execute      // 新規
│   └── AI_Workflow_PR_Comment_Finalize     // 新規
...
└── stable-9/
    ├── AI_Workflow_PR_Comment_Execute      // 新規
    └── AI_Workflow_PR_Comment_Finalize     // 新規
```

### 実行ステージ

#### Execute ジョブ

```
1. Load Common Library
2. Prepare Codex auth.json
3. Prepare Agent Credentials
4. Validate Parameters
5. Setup Environment
6. Setup Node.js Environment
7. PR Comment Init              // pr-comment init コマンド実行
8. PR Comment Execute           // pr-comment execute コマンド実行
```

#### Finalize ジョブ

```
1. Load Common Library
2. Validate Parameters
3. Setup Environment
4. Setup Node.js Environment
5. PR Comment Finalize          // pr-comment finalize コマンド実行
```

## 期待される動作

### 1. Execute ジョブ

#### Jenkins パラメータ例

```groovy
PR_NUMBER: "123"
GITHUB_REPOSITORY: "tielec/ai-workflow-agent"
AGENT_MODE: "auto"
DRY_RUN: false
BATCH_SIZE: "5"
GITHUB_TOKEN: "ghp_xxxx"
```

#### 実行フロー

```
1. Validate Parameters
   - PR_NUMBER が指定されているか確認
   - GITHUB_REPOSITORY が owner/repo 形式か確認

2. PR Comment Init
   - node dist/index.js pr-comment init --pr 123
   - PRから未解決コメントを取得
   - メタデータを初期化

3. PR Comment Execute
   - node dist/index.js pr-comment execute --pr 123 --agent auto --batch-size 5
   - 各コメントをAIエージェントで分析
   - コード修正・返信投稿を実行

4. Post Processing
   - .ai-workflow/pr-123/ をアーカイブ
   - REPOS_ROOT、CODEX_HOME をクリーンアップ
   - ワークスペースをクリーンアップ
```

### 2. Finalize ジョブ

#### Jenkins パラメータ例

```groovy
PR_NUMBER: "123"
GITHUB_REPOSITORY: "tielec/ai-workflow-agent"
DRY_RUN: false
GITHUB_TOKEN: "ghp_xxxx"
```

#### 実行フロー

```
1. Validate Parameters
   - PR_NUMBER が指定されているか確認
   - GITHUB_REPOSITORY が owner/repo 形式か確認

2. PR Comment Finalize
   - node dist/index.js pr-comment finalize --pr 123
   - 完了したコメントスレッドを解決
   - メタデータをクリーンアップ

3. Post Processing
   - .ai-workflow/pr-123/ をアーカイブ
   - REPOS_ROOT をクリーンアップ
   - ワークスペースをクリーンアップ
```

## テスト計画

### Job DSL パース検証

```bash
cd jenkins/jobs/dsl/ai-workflow
groovy -cp /path/to/jenkins-job-dsl.jar ai_workflow_pr_comment_job.groovy
```

### Jenkinsfile 文法検証

```bash
# Jenkins Pipeline Linter を使用
curl -X POST -F "jenkinsfile=<jenkins/jobs/pipeline/ai-workflow/pr-comment/Jenkinsfile" \
  http://localhost:8080/pipeline-model-converter/validate
```

### Jenkins ジョブ実行テスト

1. **Seed Job 実行**: ジョブが正しく生成されることを確認
2. **dry-run モード実行**: パラメータ検証と初期化のみ実行
3. **実環境テスト**: 実際のPRコメントに対して実行

## 実装チェックリスト

### Execute ジョブ

- [ ] `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy` を作成
- [ ] `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` を作成
- [ ] Job DSL パース検証（Execute）
- [ ] Jenkinsfile 文法検証（Execute）
- [ ] Jenkins ジョブ実行テスト（dry-run）
- [ ] Jenkins ジョブ実行テスト（実環境）

### Finalize ジョブ

- [ ] `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy` を作成
- [ ] `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` を作成
- [ ] Job DSL パース検証（Finalize）
- [ ] Jenkinsfile 文法検証（Finalize）
- [ ] Jenkins ジョブ実行テスト（dry-run）
- [ ] Jenkins ジョブ実行テスト（実環境）

### 共通

- [ ] `jenkins/seed/ai_workflow_seed.groovy` を更新
- [ ] Seed Job 実行テスト（2つのジョブが正しく生成されることを確認）
- [ ] ドキュメント更新（CLAUDE.md、README.md）
- [ ] Execute → Finalize の連続実行テスト

## 関連Issue

- Issue #383: PRコメント自動対応機能の実装（CLI 実装完了）

## 後方互換性

### 影響なし

- 既存の Jenkins ジョブ（all-phases, preset, single-phase, rollback, finalize）に影響なし
- 新規ジョブの追加のみ

## 成功基準

- ✅ Seed Job が正常に実行され、2つのジョブ（`AI_Workflow_PR_Comment_Execute` と `AI_Workflow_PR_Comment_Finalize`）が生成される
- ✅ Jenkins UI で両ジョブのパラメータが正しく表示される
- ✅ Execute ジョブが dry-run モードで正常に実行される（エラーなし）
- ✅ Finalize ジョブが dry-run モードで正常に実行される（エラーなし）
- ✅ 実環境で Execute → Finalize の順で実行し、PR コメント自動対応が正常に完了する
- ✅ アーカイブされたメタデータが正しく保存される
