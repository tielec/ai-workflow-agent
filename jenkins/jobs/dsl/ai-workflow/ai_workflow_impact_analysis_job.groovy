/**
 * AI Workflow Impact Analysis Job DSL
 *
 * PRの影響範囲をLLMエージェントで自動調査するジョブ。
 * EXECUTION_MODE: impact_analysis（固定値、パラメータとして表示）
 * パラメータ数: 19個（固有4 + 基本3 + 認証7 + Webhook3 + その他2）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_impact_analysis_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - Impact Analysis
            |${descriptionHeader}
            |
            |## 概要
            |PRの影響範囲をLLMエージェントで自動調査し、結果をPRコメントとして投稿します。
            |
            |## ステージ
            |1. Load Common Library
            |2. Prepare Codex auth.json
            |3. Prepare Agent Credentials
            |4. Validate Parameters
            |5. Setup Environment
            |6. Setup Node.js Environment
            |7. Execute Impact Analysis
            |
            |## 注意事項
            |- EXECUTION_MODE は 'impact_analysis' に固定されています
            |- PR_NUMBER と PR_URL はどちらか一方のみ指定してください
            |- DRY_RUN=true の場合、PRコメント投稿をスキップしローカルにレポートを出力します
            |""".stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['impact_analysis'], '''
実行モード（固定値 - 変更不可）
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('PR_NUMBER', '', '''
PR 番号（PR_URL と排他）

PR_URL と同時に指定することはできません。
PR_NUMBER を指定する場合は GITHUB_REPOSITORY も必須です。

例: 123
            '''.stripIndent().trim())

            stringParam('PR_URL', '', '''
対象 Pull Request URL（PR_NUMBER と排他）

PR_NUMBER と同時に指定することはできません。
PR_URL を指定した場合、URLからリポジトリ情報とPR番号を自動判定します。

例: https://github.com/tielec/ai-workflow-agent/pull/123
            '''.stripIndent().trim())

            stringParam('GITHUB_REPOSITORY', '', '''
GitHub リポジトリ（owner/repo）（必須）

例: tielec/ai-workflow-agent
            '''.stripIndent().trim())

            choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: 利用可能な認証情報で自動選択
- codex: Codex のみを使用
- claude: Claude Code のみを使用
            '''.stripIndent().trim())

            choiceParam('LANGUAGE', ['ja', 'en'], '''
ワークフロー言語
- ja: 日本語（デフォルト）
- en: English
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（PRコメント投稿をスキップしローカルにレポートを出力）
            '''.stripIndent().trim())

            textParam('CUSTOM_INSTRUCTION', '', '''
カスタム指示（任意、最大500文字程度）

リポジトリ固有の追加調査観点を指定します。空欄の場合はデフォルト挙動で実行します。
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

            nonStoredPasswordParam('CODEX_AUTH_JSON', '''
Codex auth.json の内容（任意）

Codex CLI 用の ~/.codex/auth.json を貼り付けます。ジョブ実行中のみ workspace/.codex/auth.json として展開され、完了後にクリーンアップされます。
空欄の場合はファイルを作成しません。

注意: 入力フィールドが単一行のパスワード形式に変更されます。
auth.json の内容を1行に整形するか、改行なしで貼り付けてください。
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

            // ========================================
            // その他
            // ========================================
            choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR'], '''
ログレベル
- INFO: 一般的な情報
- DEBUG: 詳細ログ（デバッグ用）
- WARNING / ERROR: 警告 / エラーのみ
            '''.stripIndent().trim())

            stringParam('JOB_ID', '', '''
Lavable Job ID（任意）

ジョブ実行状況をLavableに通知する際のジョブ識別子。
WEBHOOK_URL, WEBHOOK_TOKEN と合わせて指定してください。
            '''.stripIndent().trim())

            // ========================================
            // Webhook通知設定
            // ========================================
            nonStoredPasswordParam('WEBHOOK_URL', '''
Webhookエンドポイント URL（任意）

Lavableの通知受信エンドポイント。
HTTPSプロトコルを推奨します。
            '''.stripIndent().trim())

            nonStoredPasswordParam('WEBHOOK_TOKEN', '''
Webhook認証トークン（任意）

X-Webhook-Tokenヘッダーとして送信されます。
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'impact_analysis')
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
