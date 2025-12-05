/**
 * AI Workflow Orchestrator - Jenkinsfile
 *
 * ⚠️ **非推奨（DEPRECATED）**
 * このファイルは将来削除される予定です。
 * Issue #211のリファクタリングにより、各実行モード専用のJenkinsfileに分割されました。
 * 移行先:
 * - jenkins/Jenkinsfile.all-phases（全フェーズ実行）
 * - jenkins/Jenkinsfile.preset（プリセット実行）
 * - jenkins/Jenkinsfile.single-phase（単一フェーズ実行）
 * - jenkins/Jenkinsfile.rollback（差し戻し実行）
 * - jenkins/Jenkinsfile.auto-issue（自動Issue生成）
 *
 * 削除予定日: 2025年3月以降（並行運用期間終了後）
 *
 * ---
 *
 * GitHub IssueからPR作成まで、Claude AIによる自動開発を実行
 *
 * パラメータ（Job DSLで定義）:
 * - ISSUE_URL: GitHub Issue URL（auto_issue以外のモードで必須）
 * - EXECUTION_MODE: 実行モード（デフォルト: all_phases）
 *   - all_phases: 全フェーズを一括実行
 *   - preset: 定義済みワークフローパターンを実行（推奨）
 *   - single_phase: 特定フェーズのみ実行（デバッグ用）
 *   - rollback: フェーズ差し戻し実行（v0.4.0、Issue #90）
 *   - auto_issue: AIエージェントによる自動Issue作成（v0.5.0、Issue #121）
 * - PRESET: プリセット名（presetモード時のみ有効、デフォルト: quick-fix）
 *   - quick-fix, implementation, testing, review-requirements, review-design, review-test-scenario, finalize
 * - START_PHASE: 開始フェーズ（single_phaseモード時のみ有効、デフォルト: planning）
 * - ROLLBACK_TO_PHASE: 差し戻し先フェーズ（rollbackモード時のみ有効、デフォルト: implementation）
 * - ROLLBACK_TO_STEP: 差し戻し先ステップ（rollbackモード時、省略可、デフォルト: revise）
 * - ROLLBACK_REASON: 差し戻し理由（rollbackモード時のみ有効、省略時はインタラクティブ入力）
 * - ROLLBACK_REASON_FILE: 差し戻し理由ファイルパス（rollbackモード時、省略可）
 * - AUTO_ISSUE_CATEGORY: Issue検出カテゴリ（auto_issueモード時、デフォルト: bug）
 *   - bug: バグ検出
 *   - refactor: リファクタリング候補（Phase 2で実装予定）
 *   - enhancement: 機能拡張提案（Phase 3で実装予定）
 *   - all: 全カテゴリ
 * - AUTO_ISSUE_LIMIT: 作成するIssue上限（auto_issueモード時、デフォルト: 5）
 * - AUTO_ISSUE_SIMILARITY_THRESHOLD: 重複判定の類似度閾値（auto_issueモード時、デフォルト: 0.8）
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
 * - SQUASH_ON_COMPLETE: ワークフロー完了時にコミットをスカッシュ（デフォルト: false、Issue #194）
 *
 * 認証情報（すべてJob DSLパラメータから取得）:
 * - GITHUB_TOKEN: GitHub Personal Access Token
 * - CODEX_API_KEY: Codexエージェント用APIキー
 * - OPENAI_API_KEY: OpenAI API用キー（Follow-up Issue生成、レビュー解析等）
 * - CLAUDE_CODE_OAUTH_TOKEN: Claude Codeエージェント用OAuthトークン（優先）
 * - CLAUDE_CODE_API_KEY: Claude Codeエージェント用APIキー（フォールバック）
 * - ANTHROPIC_API_KEY: Anthropic API用キー（Follow-up Issue生成）
 * - AWS認証情報: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
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
 * - rollback: node dist/index.js rollback を実行（v0.4.0、Issue #90）
 *   - 指定されたフェーズに差し戻し、メタデータを更新
 *   - 差し戻し理由を記録し、reviseプロンプトに自動注入
 *   - CI環境では --force フラグを自動付与（確認プロンプトをスキップ）
 * - auto_issue: node dist/index.js auto-issue を実行（v0.5.0、Issue #121）
 *   - AIエージェントがリポジトリを探索し、バグ・改善点を検出
 *   - 既存Issueとの重複を自動チェック
 *   - 検出結果をGitHub Issueとして自動作成
 */

// Jenkins共有ライブラリ（将来実装）
// @Library('jenkins-shared-library') _

pipeline {
    agent {
        dockerfile {
            label 'ec2-fleet'
            dir '.'
            filename 'Dockerfile'
            // 注意: シングルクォートではGroovy変数が展開されないため、ダブルクォートを使用
            // 環境変数は environment ブロックで params から設定済み
            args "-v \${WORKSPACE}:/workspace -w /workspace -e CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1"
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

        // GitHub認証情報（Job DSLパラメータから環境変数に設定）
        GITHUB_TOKEN = "${params.GITHUB_TOKEN}"

        // OpenAI系認証情報（Job DSLパラメータから環境変数に設定）
        // CODEX_API_KEY: Codexエージェント用
        // OPENAI_API_KEY: OpenAI API用（Follow-up Issue生成、レビュー解析等）
        CODEX_API_KEY = "${params.CODEX_API_KEY ?: ''}"
        OPENAI_API_KEY = "${params.OPENAI_API_KEY ?: ''}"

        // Claude系認証情報（Job DSLパラメータから環境変数に設定）
        // CLAUDE_CODE_OAUTH_TOKEN: Claude Codeエージェント用（優先）
        // CLAUDE_CODE_API_KEY: Claude Codeエージェント用（フォールバック）
        // ANTHROPIC_API_KEY: Anthropic API用（Follow-up Issue生成）
        CLAUDE_CODE_OAUTH_TOKEN = "${params.CLAUDE_CODE_OAUTH_TOKEN ?: ''}"
        CLAUDE_CODE_API_KEY = "${params.CLAUDE_CODE_API_KEY ?: ''}"
        ANTHROPIC_API_KEY = "${params.ANTHROPIC_API_KEY ?: ''}"
    }

    stages {
        stage('Prepare Agent Credentials') {
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Prepare Agent Credentials"
                    echo "========================================="

                    def agentMode = (params.AGENT_MODE ?: 'auto').toLowerCase()

                    // 認証情報の確認（パラメータベース）
                    echo "Agent Mode: ${agentMode}"

                    // OpenAI系
                    if (env.CODEX_API_KEY?.trim()) {
                        echo '[INFO] CODEX_API_KEY is configured (for Codex agent).'
                    } else {
                        echo '[WARN] CODEX_API_KEY is not configured. Codex agent will not be available.'
                    }

                    if (env.OPENAI_API_KEY?.trim()) {
                        echo '[INFO] OPENAI_API_KEY is configured (for OpenAI API).'
                    } else {
                        echo '[WARN] OPENAI_API_KEY is not configured. OpenAI API features will not be available.'
                    }

                    // Claude系
                    if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
                        echo '[INFO] CLAUDE_CODE_OAUTH_TOKEN is configured (for Claude Code agent, priority).'
                    } else if (env.CLAUDE_CODE_API_KEY?.trim()) {
                        echo '[INFO] CLAUDE_CODE_API_KEY is configured (for Claude Code agent, fallback).'
                    } else {
                        echo '[WARN] Neither CLAUDE_CODE_OAUTH_TOKEN nor CLAUDE_CODE_API_KEY is configured. Claude Code agent will not be available.'
                    }

                    if (env.ANTHROPIC_API_KEY?.trim()) {
                        echo '[INFO] ANTHROPIC_API_KEY is configured (for Anthropic API).'
                    } else {
                        echo '[WARN] ANTHROPIC_API_KEY is not configured. Anthropic API features will not be available.'
                    }

                    // エージェントモードに応じた検証
                    if (agentMode == 'codex') {
                        if (!env.CODEX_API_KEY?.trim()) {
                            error("Agent mode 'codex' requires CODEX_API_KEY parameter.")
                        }
                        echo '[INFO] Agent mode "codex" selected. Using CODEX_API_KEY.'
                    } else if (agentMode == 'claude') {
                        if (!env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && !env.CLAUDE_CODE_API_KEY?.trim()) {
                            error("Agent mode 'claude' requires CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY parameter.")
                        }
                        echo '[INFO] Agent mode "claude" selected. Using Claude Code credentials.'
                    } else {
                        // auto mode
                        echo '[INFO] Agent mode "auto" selected. Will use available credentials.'
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

                    // auto_issue モードの場合は ISSUE_URL 不要
                    if (params.EXECUTION_MODE == 'auto_issue') {
                        // auto_issue モード: GITHUB_REPOSITORY からリポジトリ情報を取得
                        if (!params.GITHUB_REPOSITORY) {
                            error("auto_issue モードでは GITHUB_REPOSITORY パラメータが必須です")
                        }
                        def repoParts = params.GITHUB_REPOSITORY.split('/')
                        if (repoParts.length != 2) {
                            error("GITHUB_REPOSITORY は 'owner/repo' 形式である必要があります: ${params.GITHUB_REPOSITORY}")
                        }
                        env.REPO_OWNER = repoParts[0]
                        env.REPO_NAME = repoParts[1]
                        env.ISSUE_NUMBER = 'auto'  // auto_issue モードでは Issue 番号なし

                        // ビルドディスクリプションを設定
                        currentBuild.description = "Auto Issue | ${params.AUTO_ISSUE_CATEGORY ?: 'bug'} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                        echo "Execution Mode: auto_issue"
                        echo "GitHub Repository: ${params.GITHUB_REPOSITORY}"
                        echo "Repository Owner: ${env.REPO_OWNER}"
                        echo "Repository Name: ${env.REPO_NAME}"
                        echo "Auto Issue Category: ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}"
                        echo "Auto Issue Limit: ${params.AUTO_ISSUE_LIMIT ?: 5}"
                        echo "Auto Issue Similarity Threshold: ${params.AUTO_ISSUE_SIMILARITY_THRESHOLD ?: 0.8}"
                    } else {
                        // 通常モード: ISSUE_URL が必須
                        if (!params.ISSUE_URL) {
                            error("ISSUE_URL パラメータが必須です")
                        }

                        if (!params.ISSUE_URL.startsWith('https://github.com/')) {
                            error("ISSUE_URL は GitHub Issue URLである必要があります: ${params.ISSUE_URL}")
                        }

                        if (!params.ISSUE_URL.contains('/issues/')) {
                            error("ISSUE_URL は GitHub Issue URL (/issues/) である必要があります: ${params.ISSUE_URL}")
                        }

                        // Issue番号とリポジトリ情報抽出
                        def urlParts = params.ISSUE_URL.split('/')
                        env.ISSUE_NUMBER = urlParts[-1]
                        env.REPO_OWNER = urlParts[-4]
                        env.REPO_NAME = urlParts[-3]

                        // ビルドディスクリプションを設定
                        currentBuild.description = "Issue #${env.ISSUE_NUMBER} | ${params.EXECUTION_MODE} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                        echo "Issue URL: ${params.ISSUE_URL}"
                        echo "Issue Number: ${env.ISSUE_NUMBER}"
                        echo "Repository Owner: ${env.REPO_OWNER}"
                        echo "Repository Name: ${env.REPO_NAME}"
                    }

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

                        # auto_issue モードの場合、対象リポジトリをクローン
                        if [ "${params.EXECUTION_MODE}" = "auto_issue" ]; then
                            echo "Auto-issue mode detected. Cloning target repository..."

                            # 対象リポジトリ情報を取得
                            REPO_NAME=\$(echo ${params.GITHUB_REPOSITORY} | cut -d'/' -f2)
                            TARGET_REPO_PATH="${reposRoot}/\${REPO_NAME}"

                            if [ ! -d "\${TARGET_REPO_PATH}" ]; then
                                echo "Cloning repository ${params.GITHUB_REPOSITORY}..."
                                cd ${reposRoot}
                                git clone --depth 1 https://\${GITHUB_TOKEN}@github.com/${params.GITHUB_REPOSITORY}.git
                            else
                                echo "Repository \${REPO_NAME} already exists. Pulling latest changes..."
                                cd "\${TARGET_REPO_PATH}"
                                git pull
                            fi

                            echo "Target repository setup completed: \${TARGET_REPO_PATH}"
                        fi

                        # 通常モード（init/execute）の場合、Issue URLから対象リポジトリをクローン
                        if [ "${params.EXECUTION_MODE}" != "auto_issue" ] && [ "${env.REPO_NAME}" != "ai-workflow-agent" ]; then
                            if [ ! -d ${reposRoot}/${env.REPO_NAME} ]; then
                                echo "Cloning repository ${env.REPO_OWNER}/${env.REPO_NAME}..."
                                cd ${reposRoot}
                                git clone https://\${GITHUB_TOKEN}@github.com/${env.REPO_OWNER}/${env.REPO_NAME}.git
                            else
                                echo "Repository ${env.REPO_NAME} already exists. Pulling latest changes..."
                                cd ${reposRoot}/${env.REPO_NAME}
                                git pull
                            fi
                        fi

                        echo "REPOS_ROOT contents:"
                        ls -la ${reposRoot} || echo "REPOS_ROOT is empty"
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
            when {
                expression { params.EXECUTION_MODE != 'auto_issue' }
            }
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

                    // ビルドディスクリプションを更新
                    currentBuild.description = "Issue #${env.ISSUE_NUMBER} | 全フェーズ実行中 (Phase 0-9) | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] 全フェーズ実行をスキップ"
                        } else {
                            // TypeScript版 CLI の --phase all を実行
                            // resume機能により、失敗したフェーズから自動再開
                            def forceResetFlag = params.FORCE_RESET ? '--force-reset' : ''
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''
                            def squashFlag = params.SQUASH_ON_COMPLETE ? '--squash-on-complete' : ''

                            sh """
                                node dist/index.js execute \
                                    --phase all \
                                    --issue ${env.ISSUE_NUMBER} \
                                    --agent ${params.AGENT_MODE} \
                                    --followup-llm-mode agent \
                                    ${forceResetFlag} \
                                    ${cleanupFlags} \
                                    ${squashFlag}
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

                    // ビルドディスクリプションを更新
                    currentBuild.description = "Issue #${env.ISSUE_NUMBER} | プリセット実行中: ${params.PRESET} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Preset ${params.PRESET}実行をスキップ"
                        } else {
                            // プリセットパターンを実行
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''
                            def squashFlag = params.SQUASH_ON_COMPLETE ? '--squash-on-complete' : ''

                            sh """
                                node dist/index.js execute \
                                    --preset ${params.PRESET} \
                                    --agent ${params.AGENT_MODE} \
                                    --issue ${env.ISSUE_NUMBER} \
                                    --followup-llm-mode agent \
                                    ${cleanupFlags} \
                                    ${squashFlag}
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

                    // ビルドディスクリプションを更新
                    currentBuild.description = "Issue #${env.ISSUE_NUMBER} | 単一フェーズ実行: ${params.START_PHASE} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Phase ${params.START_PHASE}実行をスキップ"
                        } else {
                            // 指定されたフェーズのみ実行
                            def cleanupFlags = params.CLEANUP_ON_COMPLETE_FORCE ? '--cleanup-on-complete --cleanup-on-complete-force' : ''
                            def squashFlag = params.SQUASH_ON_COMPLETE ? '--squash-on-complete' : ''

                            sh """
                                node dist/index.js execute \
                                    --phase ${params.START_PHASE} \
                                    --agent ${params.AGENT_MODE} \
                                    --issue ${env.ISSUE_NUMBER} \
                                    --followup-llm-mode agent \
                                    ${cleanupFlags} \
                                    ${squashFlag}
                            """
                        }
                    }
                }
            }
        }

        stage('Execute Rollback') {
            when {
                expression { params.EXECUTION_MODE == 'rollback' }
            }
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Execute Rollback - ${params.ROLLBACK_TO_PHASE}"
                    echo "========================================="
                    echo "Execution Mode: ${params.EXECUTION_MODE}"
                    echo "Rollback To Phase: ${params.ROLLBACK_TO_PHASE}"
                    echo "Rollback To Step: ${params.ROLLBACK_TO_STEP ?: 'revise (default)'}"
                    echo "Rollback Reason: ${params.ROLLBACK_REASON ?: '(not provided)'}"
                    echo "Rollback Reason File: ${params.ROLLBACK_REASON_FILE ?: '(not provided)'}"

                    // ビルドディスクリプションを更新
                    currentBuild.description = "Issue #${env.ISSUE_NUMBER} | フェーズ差し戻し: ${params.ROLLBACK_TO_PHASE} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        if (params.DRY_RUN) {
                            echo "[DRY RUN] Rollback to ${params.ROLLBACK_TO_PHASE}をスキップ"
                        } else {
                            // 差し戻し実行
                            // CI環境では --force フラグを自動付与（確認プロンプトをスキップ）
                            def toStepFlag = params.ROLLBACK_TO_STEP ? "--to-step ${params.ROLLBACK_TO_STEP}" : ''
                            def reasonFlag = params.ROLLBACK_REASON ? "--reason \"${params.ROLLBACK_REASON}\"" : ''
                            def reasonFileFlag = params.ROLLBACK_REASON_FILE ? "--reason-file ${params.ROLLBACK_REASON_FILE}" : ''

                            sh """
                                node dist/index.js rollback \
                                    --issue ${env.ISSUE_NUMBER} \
                                    --to-phase ${params.ROLLBACK_TO_PHASE} \
                                    ${toStepFlag} \
                                    ${reasonFlag} \
                                    ${reasonFileFlag} \
                                    --force
                            """
                        }
                    }
                }
            }
        }

        stage('Execute Auto Issue') {
            when {
                expression { params.EXECUTION_MODE == 'auto_issue' }
            }
            steps {
                script {
                    echo "========================================="
                    echo "Stage: Execute Auto Issue"
                    echo "========================================="
                    echo "Execution Mode: ${params.EXECUTION_MODE}"
                    echo "Category: ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}"
                    echo "Limit: ${params.AUTO_ISSUE_LIMIT ?: 5}"
                    echo "Similarity Threshold: ${params.AUTO_ISSUE_SIMILARITY_THRESHOLD ?: 0.8}"
                    echo "Dry Run: ${params.DRY_RUN}"

                    // ビルドディスクリプションを更新
                    def dryRunLabel = params.DRY_RUN ? ' [DRY RUN]' : ''
                    currentBuild.description = "Auto Issue | ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}${dryRunLabel} | ${env.REPO_OWNER}/${env.REPO_NAME}"

                    dir(env.WORKFLOW_DIR) {
                        // auto-issue コマンドを実行
                        def category = params.AUTO_ISSUE_CATEGORY ?: 'bug'
                        def limit = params.AUTO_ISSUE_LIMIT ?: 5
                        def similarityThreshold = params.AUTO_ISSUE_SIMILARITY_THRESHOLD ?: 0.8
                        def dryRunFlag = params.DRY_RUN ? '--dry-run' : ''

                        sh """
                            node dist/index.js auto-issue \
                                --category ${category} \
                                --limit ${limit} \
                                --similarity-threshold ${similarityThreshold} \
                                --agent ${params.AGENT_MODE} \
                                ${dryRunFlag}
                        """
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
        always {
            script {
                // ビルドディスクリプションを更新（成功・失敗共通）
                def executionType = ""
                if (params.EXECUTION_MODE == 'all_phases') {
                    executionType = "全フェーズ実行"
                } else if (params.EXECUTION_MODE == 'preset') {
                    executionType = "プリセット: ${params.PRESET}"
                } else if (params.EXECUTION_MODE == 'single_phase') {
                    executionType = "単一フェーズ: ${params.START_PHASE}"
                } else if (params.EXECUTION_MODE == 'rollback') {
                    executionType = "差し戻し: ${params.ROLLBACK_TO_PHASE}"
                } else if (params.EXECUTION_MODE == 'auto_issue') {
                    def dryRunLabel = params.DRY_RUN ? ' [DRY RUN]' : ''
                    executionType = "Auto Issue: ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}${dryRunLabel}"
                }
                // auto_issue モードでは Issue 番号の代わりに 'Auto Issue' を表示
                if (params.EXECUTION_MODE == 'auto_issue') {
                    currentBuild.description = "Auto Issue | ${executionType} | ${env.REPO_OWNER}/${env.REPO_NAME}"
                } else {
                    currentBuild.description = "Issue #${env.ISSUE_NUMBER} | ${executionType} | ${env.REPO_OWNER}/${env.REPO_NAME}"
                }

                // クリーンアップ（オプション）
                echo "========================================="
                echo "Cleanup"
                echo "========================================="

                // 一時ファイルの削除など
                // 注意: .ai-workflowは残す（成果物として保持）

                // 成果物をアーカイブ（成功・失敗問わず）
                // auto_issue モードでは .ai-workflow ディレクトリは使用しない
                // 対象リポジトリは REPOS_ROOT にクローンされるため、そこからアーティファクトを取得
                if (params.EXECUTION_MODE != 'auto_issue') {
                    def artifactPath = "${env.REPOS_ROOT}/${env.REPO_NAME}/.ai-workflow/issue-${env.ISSUE_NUMBER}/**/*"
                    echo "Archiving artifacts from: ${artifactPath}"
                    archiveArtifacts artifacts: artifactPath, allowEmptyArchive: true
                }
            }
        }

        success {
            script {
                echo "========================================="
                echo "✅ AI Workflow 成功"
                echo "========================================="
                if (params.EXECUTION_MODE == 'auto_issue') {
                    echo "Mode: Auto Issue"
                    echo "Category: ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}"
                    echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                } else {
                    echo "Issue: ${params.ISSUE_URL}"
                    echo "Workflow Directory: .ai-workflow/issue-${env.ISSUE_NUMBER}"
                }
            }
        }

        failure {
            script {
                echo "========================================="
                echo "❌ AI Workflow 失敗"
                echo "========================================="
                if (params.EXECUTION_MODE == 'auto_issue') {
                    echo "Mode: Auto Issue"
                    echo "Category: ${params.AUTO_ISSUE_CATEGORY ?: 'bug'}"
                    echo "Repository: ${env.REPO_OWNER}/${env.REPO_NAME}"
                } else {
                    echo "Issue: ${params.ISSUE_URL}"
                }
                echo "ログを確認してください"
            }
        }
    }
}
