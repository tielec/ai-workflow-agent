/**
 * AI Workflow PR Comment Execute Job DSL
 *
 * PRレビューコメントの初期化と自動対応を行うジョブ。
 * EXECUTION_MODE: pr_comment_execute（固定値、パラメータとして表示）
 * パラメータ数: 15個（基本8個 + APIキー7個）
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
            |Pull Requestのレビューコメントを解析し、自動対応を実施します。
            |init ステージで未解決コメントのメタデータを生成し、execute ステージでAIエージェントが返信・修正を行います。
            |
            |## ステージ
            |1. Load Common Library
            |2. Prepare Codex auth.json
            |3. Prepare Agent Credentials
            |4. Validate Parameters
            |5. Setup Environment
            |6. Setup Node.js Environment
            |7. PR Comment Init
            |8. PR Comment Execute
            |
            |## 注意事項
            |- EXECUTION_MODE は 'pr_comment_execute' に固定されています
            |- DRY_RUN を有効にするとAPI呼び出しやGit操作をスキップします
            |- アーティファクトは .ai-workflow/pr-{PR番号}/ 配下を保存します
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['pr_comment_execute'], '''
実行モード（固定値 - 変更不可）
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('PR_URL', '', '''
Pull Request URL（必須）

例: https://github.com/tielec/ai-workflow-agent/pull/123
            '''.stripIndent().trim())

            choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: 利用可能な認証情報で自動選択
- codex: Codex のみを使用
- claude: Claude Code のみを使用
            '''.stripIndent().trim())

            booleanParam('DRY_RUN', false, '''
ドライランモード（API呼び出しやGit操作を行わず動作確認のみ実施）
            '''.stripIndent().trim())

            stringParam('BATCH_SIZE', '5', '''
一度に処理するコメント数（デフォルト: 5）
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
        "フォルダ: ${folder.displayName}\nブランチ: ${folder.branch}",
        folder.branch
    )
}
