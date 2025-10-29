/**
 * AI Workflow Orchestrator - Jenkinsfile
 *
 * GitHub IssueからPR作成まで、Claude AIによる自動開発を実行
 *
 * パラメータ（Job DSLで定義）:
 * - ISSUE_URL: GitHub Issue URL（必須）
 * - EXECUTION_MODE: 実行モード（デフォルト: all_phases）
 *   - all_phases: 全フェーズを一括実行
 *   - preset: 定義済みワークフローパターンを実行（推奨）
 *   - single_phase: 特定フェーズのみ実行（デバッグ用）
 * - PRESET: プリセット名（presetモード時のみ有効、デフォルト: quick-fix）
 *   - quick-fix, implementation, testing, review-requirements, review-design, review-test-scenario, finalize
 * - START_PHASE: 開始フェーズ（single_phaseモード時のみ有効、デフォルト: planning）
 * - FORCE_RESET: 強制リセット（デフォルト: false）
 * - DRY_RUN: ドライランモード（デフォルト: false）
 * - SKIP_REVIEW: レビュースキップ（デフォルト: false）
 * - MAX_RETRIES: 最大リトライ回数（デフォルト: 3）
 * - COST_LIMIT_USD: コスト上限USD（デフォルト: 5.0）
 * - LOG_LEVEL: ログレベル（デフォルト: INFO）
 * - GIT_COMMIT_USER_NAME: Gitコミット時のユーザー名（デフォルト: AI Workflow Bot）
 * - GIT_COMMIT_USER_EMAIL: Gitコミット時のメールアドレス（デフォルト: ai-workflow@example.com）
 * - AWS_ACCESS_KEY_ID: AWS アクセスキー ID（任意、Infrastructure as Code実行時に必要）
 * - AWS_SECRET_ACCESS_KEY: AWS シークレットアクセスキー（任意、Infrastructure as Code実行時に必要）
 * - AWS_SESSION_TOKEN: AWS セッショントークン（任意、一時的な認証情報を使用する場合）
 * - CLEANUP_ON_COMPLETE_FORCE: Evaluation Phase完了後にワークフローディレクトリを強制削除（デフォルト: false、Issue #2）
 *
 * 認証情報（Jenkins Credentialsで設定）:
 * - claude-code-oauth-token: Claude Agent SDK用OAuthトークン（必須）
 * - openai-api-key: ContentParser用OpenAI APIキー（必須）
 * - github-token: GitHub API用トークン（必須）
 *
 * 重要: パラメータ定義はこのファイルでは行いません（Job DSLで定義済み）
 *
 * 実行モードの説明:
 * - all_phases: node dist/index.js execute --phase all を実行
 *   - Phase 0-9を順次実行（planning → requirements → ... → evaluation）
 *   - resume機能により、失敗したフェーズから自動再開
 *   - --force-resetフラグで最初から実行し直すことも可能
 * - preset: node dist/index.js execute --preset {PRESET} を実行（推奨）
 *   - 定義済みワークフローパターンを実行
 *   - 例: quick-fix, implementation, testing, review-requirements, finalize
 * - single_phase: node dist/index.js execute --phase {START_PHASE} を実行
 *   - 指定されたフェーズのみ実行（デバッグ用）
 */

// Jenkins共有ライブラリ（将来実装）
// @Library('jenkins-shared-library') _

pipeline {
    agent {
        dockerfile {
            label 'ec2-fleet'
            dir '.'
            filename 'Dockerfile'
            args '-v ${WORKSPACE}:/workspace -w /workspace -e CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1 -e OPENAI_API_KEY=${OPENAI_API_KEY} -e GITHUB_TOKEN=${GITHUB_TOKEN} -e CLAUDE_CODE_CREDENTIALS_PATH=/home/node/.claude-code/credentials.json -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} -e AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}'
        }
    }

    options {
        // タイムスタンプ表示
        timestamps()

        // カラー出力
        ansiColor('xterm')
    }

    environment {
        // Claude Agent SDK設定（Bashコマンド承認スキップ）
        CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1'
        CLAUDE_CODE_CREDENTIALS_PATH = "/home/node/.claude-code/credentials.json"

        // AI Workflow設定
        WORKFLOW_DIR = '.'
        WORKFLOW_VERSION = '0.2.0'

        // ログ設定（CI環境ではカラーリング無効化）
        // カラーリングはCI環境のログ表示を乱すため、LOG_NO_COLORで無効化
        // ローカル環境では環境変数未設定のため、カラーリングは有効
        LOG_NO_COLOR = 'true'

        // Git設定（Job DSLパラメータから環境変数に設定）
        GIT_COMMIT_USER_NAME = "${params.GIT_COMMIT_USER_NAME}"
        GIT_COMMIT_USER_EMAIL = "${params.GIT_COMMIT_USER_EMAIL}"

        // AWS認証情報（Job DSLパラメータから環境変数に設定）
        AWS_ACCESS_KEY_ID = "${params.AWS_ACCESS_KEY_ID ?: ''}"
        AWS_SECRET_ACCESS_KEY = "${params.AWS_SECRET_ACCESS_KEY ?: ''}"
        AWS_SESSION_TOKEN = "${params.AWS_SESSION_TOKEN ?: ''}"

        // 認証情報（Jenkinsクレデンシャルから取得）
        OPENAI_API_KEY = credentials('openai-api-key')
        GITHUB_TOKEN = credentials('github-token')
    }

    stages {
        stage('Prepare Agent Credentials') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Prepare Agent Credentials"
                    echo "========================================="

                    def homeDir = env.HOME ?: '/home/node'
                    def agentMode = (params.AGENT_MODE ?: 'auto').toLowerCase()
                    def claudeTarget = "${homeDir}/.claude-code/credentials.json"

                    if (agentMode == 'codex') {
                        echo '[INFO] Agent mode "codex" selected. Skipping Claude credential setup.'
                    } else if (agentMode == 'claude') {
                        if (!fileExists(claudeTarget)) {
                            def uploadParams = input(
                                message: 'Upload Claude Code credentials file (Base64 encoded). This is required for agent mode "claude".',
                                ok: 'Upload',
                                parameters: [
                                    base64File(name: 'claudeCredsB64', description: 'Claude Code credentials file (credentials.json)')
                                ]
                            )

                            def claudeValue = ''
                            if (uploadParams instanceof Map) {
                                claudeValue = (uploadParams['claudeCredsB64'] ?: '').toString().trim()
                            } else if (uploadParams) {
                                claudeValue = uploadParams.toString().trim()
                            }

                            if (!claudeValue) {
                                error("Agent mode 'claude' requires Claude Code credentials.")
                            }

                            withEnv(["CLAUDE_FILE_B64=${claudeValue}"]) {
                                sh '''
                                    mkdir -p ~/.claude-code
                                    printf "%s" "$CLAUDE_FILE_B64" | base64 -d > ~/.claude-code/credentials.json
                                    chmod 600 ~/.claude-code/credentials.json
                                '''
                            }
                        } else {
                            echo '[INFO] Reusing previously uploaded Claude Code credentials.'
                        }
                    } else {
                        if (fileExists(claudeTarget)) {
                            echo '[INFO] Claude credentials found. Auto mode will use them for fallback.'
                        } else {
                            echo '[INFO] Claude credentials not found. Auto mode will run without Claude fallback.'
                        }
                    }
                }
            }
        }


        stage('Validate Parameters') {
            steps {
                script {
                    echo "========================================="
                    echo "AI Workflow Orchestrator v${env.WORKFLOW_VERSION}"
                    echo "========================================="

                    // パラメータ検証
                    if (!params.ISSUE_URL) {
                        error("ISSUE_URL パラメータが必須です")
                    }

                    if (!params.ISSUE_URL.startsWith('https://github.com/')) {
                        error("ISSUE_URL は GitHub Issue URLである必要があります: ${params.ISSUE_URL}")
                    }

                    // Issue番号とリポジトリ情報抽出
                    def urlParts = params.ISSUE_URL.split('/')
                    env.ISSUE_NUMBER = urlParts[-1]
                    env.REPO_OWNER = urlParts[-4]
                    env.REPO_NAME = urlParts[-3]

                    echo "Issue URL: ${params.ISSUE_URL}"
                    echo "Issue Number: ${env.ISSUE_NUMBER}"
                    echo "Repository Owner: ${env.REPO_OWNER}"
                    echo "Repository Name: ${env.REPO_NAME}"
                    echo "GitHub Repository: ${params.GITHUB_REPOSITORY}"
                    echo "Start Phase: ${params.START_PHASE}"
                    echo "Agent Mode: ${params.AGENT_MODE}"
                    echo "Dry Run: ${params.DRY_RUN}"
                    echo "Skip Review: ${params.SKIP_REVIEW}"
                    echo "Max Retries: ${params.MAX_RETRIES}"
                    echo "Cost Limit: \$${params.COST_LIMIT_USD} USD"
                    echo "Log Level: ${params.LOG_LEVEL}"
                    echo "Git Commit User Name: ${params.GIT_COMMIT_USER_NAME}"
                    echo "Git Commit User Email: ${params.GIT_COMMIT_USER_EMAIL}"
                    echo "Cleanup On Complete Force: ${params.CLEANUP_ON_COMPLETE_FORCE}"
                }
            }
        }

        stage('Setup Environment') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Setup Environment"
                    echo "========================================="

                    // REPOS_ROOT の準備と対象リポジトリのチェックアウト
                    // マルチリポジトリサポート: Issue URLから取得したリポジトリをクローン
                    def reposRoot = "/tmp/ai-workflow-repos-${env.BUILD_ID}"
                    echo "Setting up REPOS_ROOT: ${reposRoot}"

                    sh """
                        # REPOS_ROOT ディレクトリ作成
                        mkdir -p ${reposRoot}

                        # 対象リポジトリをクローン（ai-workflow-agentリポジトリ自体へのIssueの場合はスキップ）
                        if [ "${env.REPO_NAME}" != "ai-workflow-agent" ]; then
                            if [ ! -d ${reposRoot}/${env.REPO_NAME} ]; then
                                echo "Cloning repository ${env.REPO_OWNER}/${env.REPO_NAME}..."
                                cd ${reposRoot}
                                git clone https://\${GITHUB_TOKEN}@github.com/${env.REPO_OWNER}/${env.REPO_NAME}.git
                            else
                                echo "Repository ${env.REPO_NAME} already exists. Pulling latest changes..."
                                cd ${reposRoot}/${env.REPO_NAME}
                                git pull
                            fi
                            echo "Repository ${env.REPO_NAME} setup completed."
                        else
                            echo "Target repository is ai-workflow-agent. Using WORKSPACE directly."
                        fi

                        echo "REPOS_ROOT contents:"
                        ls -la ${reposRoot} || echo "REPOS_ROOT is empty (using WORKSPACE for ai-workflow-agent)"
                    """

                    // REPOS_ROOT 環境変数を設定
                    env.REPOS_ROOT = reposRoot
                    echo "REPOS_ROOT set to: ${env.REPOS_ROOT}"
                    echo "WORKSPACE: ${env.WORKSPACE}"

                    // Git checkout: Detached HEADを回避するため、ブランチに明示的にcheckout
                    sh """
                        # 現在のブランチを確認
                        BRANCH_NAME=\$(git rev-parse --abbrev-ref HEAD)
                        echo "Current branch: \$BRANCH_NAME"

                        # Detached HEADの場合、feature/ai-workflow-mvpにcheckout
                        if [ "\$BRANCH_NAME" = "HEAD" ]; then
                            echo "Detached HEAD detected. Checking out feature/ai-workflow-mvp..."
                            git checkout -B feature/ai-workflow-mvp
                        fi
                    """

                    // Node.js環境確認（コンテナ内の実行環境を確認）
                    dir(env.WORKFLOW_DIR) {
                        sh """
                            echo "Node version:"
                            node --version

                            echo ""
                            echo "npm version:"
                            npm --version

                            echo ""
                            echo "Current user: \$(whoami)"
                            echo "HOME directory: \$HOME"

                            echo ""
                            echo "Installing dependencies (including dev)..."
                            npm install --include=dev

                            echo ""
                            echo "Building TypeScript sources..."
                            npm run build
                        """
                    }
                }
            }
        }

        stage('Initialize Workflow') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Initialize Workflow"
                    echo "========================================="

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] ワークフロー初期化をスキップ"
                        } else {
                            // ワークフロー初期化またはマイグレーション
                            // - metadata.jsonが存在しない場合: 新規作成
                            // - metadata.jsonが存在する場合: スキーママイグレーション実行
                            // BRANCH_NAME パラメータが指定されている場合、--branch オプションを追加
                            def branchOption = params.BRANCH_NAME ? "--branch ${params.BRANCH_NAME}" : ""

                            sh """
                                node dist/index.js init \
                                    --issue-url ${params.ISSUE_URL} \
                                    ${branchOption}
                            """
                        }
                    }
                }
            }
        }

        stage('Execute All Phases') {
            when {
                expression { params.EXECUTION_MODE == 'all_phases' }
            }
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Execute All Phases"
                    echo "========================================="
                    echo "Execution Mode: ${params.EXECUTION_MODE}"
                    echo "Force Reset: ${params.FORCE_RESET}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] 全フェーズ実行をスキップ"
                        } else {
                            // TypeScript版 CLI の --phase all を実行
                            // resume機能により、失敗したフェーズから自動再開
                            def forceResetFlag = params.FORCE_RESET ? '--force-reset' : ''
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''

                            sh """
                                node dist/index.js execute \
                                    --phase all \
                                    --issue ${env.ISSUE_NUMBER} \
                                    --agent ${params.AGENT_MODE} \
                                    ${forceResetFlag} \
                                    ${cleanupFlags}
                            """
                        }
                    }
                }
            }
        }

        stage('Execute Preset') {
            when {
                expression { params.EXECUTION_MODE == 'preset' }
            }
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Execute Preset - ${params.PRESET}"
                    echo "========================================="
                    echo "Execution Mode: ${params.EXECUTION_MODE}"
                    echo "Preset: ${params.PRESET}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Preset ${params.PRESET}実行をスキップ"
                        } else {
                            // プリセットパターンを実行
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''

                            sh """
                                node dist/index.js execute \
                                    --preset ${params.PRESET} \
                                    --agent ${params.AGENT_MODE} \
                                    --issue ${env.ISSUE_NUMBER} \
                                    ${cleanupFlags}
                            """
                        }
                    }
                }
            }
        }

        stage('Execute Single Phase') {
            when {
                expression { params.EXECUTION_MODE == 'single_phase' }
            }
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Execute Single Phase - ${params.START_PHASE}"
                    echo "========================================="
                    echo "Execution Mode: ${params.EXECUTION_MODE}"
                    echo "Target Phase: ${params.START_PHASE}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Phase ${params.START_PHASE}実行をスキップ"
                        } else {
                            // 指定されたフェーズのみ実行
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''

                            sh """
                                node dist/index.js execute \
                                    --phase ${params.START_PHASE} \
                                    --agent ${params.AGENT_MODE} \
                                    --issue ${env.ISSUE_NUMBER} \
                                    ${cleanupFlags}
                            """
                        }
                    }
                }
            }
        }

        stage('Create Pull Request') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Create Pull Request"
                    echo "========================================="

                    echo "[未実装] PR自動作成は今後の拡張で実装予定"

                    // 将来の実装イメージ:
                    // if (!params.DRY_RUN) {
                    //     sh """
                    //         gh pr create \\
                    //             --title "[AI-Workflow] Issue #${env.ISSUE_NUMBER}" \\
                    //             --body "自動生成されたPRです" \\
                    //             --base main \\
                    //             --head feature/issue-${env.ISSUE_NUMBER}
                    //     """
                    // }
                }
            }
        }
    }

    post {
        success {
            script {
                echo "========================================="
                echo "✅ AI Workflow 成功"
                echo "========================================="
                echo "Issue: ${params.ISSUE_URL}"
                echo "Workflow Directory: .ai-workflow/issue-${env.ISSUE_NUMBER}"

                // 成果物をアーカイブ
                dir('.ai-workflow') {
                    archiveArtifacts artifacts: "issue-${env.ISSUE_NUMBER}/**/*", allowEmptyArchive: true
                }
            }
        }

        failure {
            script {
                echo "========================================="
                echo "❌ AI Workflow 失敗"
                echo "========================================="
                echo "Issue: ${params.ISSUE_URL}"
                echo "ログを確認してください"

                // 失敗時もメタデータをアーカイブ
                dir('.ai-workflow') {
                    archiveArtifacts artifacts: "issue-${env.ISSUE_NUMBER}/**/*", allowEmptyArchive: true
                }
            }
        }

        always {
            script {
                // クリーンアップ（オプション）
                echo "========================================="
                echo "Cleanup"
                echo "========================================="

                // 一時ファイルの削除など
                // 注意: .ai-workflowは残す（成果物として保持）
            }
        }
    }
}
