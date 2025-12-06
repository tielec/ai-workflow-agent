/**
 * AI Workflow Finalize Job DSL
 *
 * ワークフロー完了後の最終処理用ジョブ（cleanup、squash、PR更新等）
 * EXECUTION_MODE: finalize（固定値、パラメータとして表示しない）
 * パラメータ数: 18個（12個 + APIキー6個）
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
