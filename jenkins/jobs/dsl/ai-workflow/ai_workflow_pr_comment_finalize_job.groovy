/**
 * AI Workflow PR Comment Finalize Job DSL
 *
 * PRレビューコメントの完了処理を行うジョブ。
 * finalize サブコマンドを呼び出し、コメントスレッドの解決とメタデータ後処理を実施します。
 * EXECUTION_MODE: pr_comment_finalize（固定値、パラメータとして表示）
 * パラメータ数: 13個（基本6個 + APIキー7個）
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
            |PRレビューコメントの最終確認とスレッド解決を行います。
            |既存のメタデータをもとに finalize サブコマンドを実行し、完了処理のみを実施します。
            |
            |## ステージ
            |1. Load Common Library
            |2. Validate Parameters
            |3. Setup Environment
            |4. Setup Node.js Environment
            |5. PR Comment Finalize
            |
            |## 注意事項
            |- EXECUTION_MODE は 'pr_comment_finalize' に固定されています
            |- DRY_RUN を有効にするとAPI呼び出しやGit操作をスキップします
            |- アーティファクトは .ai-workflow/pr-{PR番号}/ 配下を保存します
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['pr_comment_finalize'], '''
実行モード（固定値 - 変更不可）
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('PR_URL', '', '''
Pull Request URL（必須）

例: https://github.com/tielec/ai-workflow-agent/pull/123
            '''.stripIndent().trim())

            booleanParam('DRY_RUN', false, '''
ドライランモード（API呼び出しやGit操作を行わず動作確認のみ実施）
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_NAME', 'AI Workflow Bot', '''
Git コミットユーザー名
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_EMAIL', 'ai-workflow@example.com', '''
Git コミットメールアドレス
            '''.stripIndent().trim())

            choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR'], '''
ログレベル
- DEBUG: 詳細なデバッグ情報を出力
- INFO: 通常の情報を出力（デフォルト）
- WARNING: 警告のみ出力
- ERROR: エラーのみ出力
            '''.stripIndent().trim())

            // ========================================
            // APIキー設定
            // ========================================
            nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token（必須）
GitHub API呼び出しに使用されます
            '''.stripIndent().trim())

            nonStoredPasswordParam('OPENAI_API_KEY', '''
OpenAI API キー（任意）
互換性のため定義（Finalizeでは未使用）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CODEX_API_KEY', '''
Codex API キー（任意）
OPENAI_API_KEYの代替として使用可能（Finalizeでは未使用）
            '''.stripIndent().trim())

            textParam('CODEX_AUTH_JSON', '', '''
Codex auth.json の内容（任意）
互換性のため定義（Finalizeでは未使用）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN', '''
Claude Code OAuth トークン（任意）
互換性のため定義（Finalizeでは未使用）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_API_KEY', '''
Claude Code API キー（任意）
互換性のため定義（Finalizeでは未使用）
            '''.stripIndent().trim())

            nonStoredPasswordParam('ANTHROPIC_API_KEY', '''
Anthropic API キー（任意）
互換性のため定義（Finalizeでは未使用）
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
        "フォルダ: ${folder.displayName}\nブランチ: ${folder.branch}",
        folder.branch
    )
}
