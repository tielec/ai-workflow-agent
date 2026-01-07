/**
 * AI Workflow Validate Credentials Job DSL
 *
 * 認証情報バリデーション専用ジョブ。
 * validate-credentials コマンドを Jenkins から実行し、各種トークンと設定を事前に確認します。
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_validate_credentials_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - Validate Credentials
            |
            |${descriptionHeader}
            |
            |## 概要
            |validate-credentials コマンドを実行し、Git/GitHub/Codex/Claude/OpenAI/Anthropic の認証情報をチェックします。
            |
            |## パラメータ
            |- CHECK_CATEGORY: チェックするカテゴリ（all, git, github, codex, claude, openai, anthropic）
            |- VERBOSE: 詳細ログ出力
            |- OUTPUT_FORMAT: text / json
            |- EXIT_ON_ERROR: 失敗時にビルドを失敗させる
            |- GIT_COMMIT_USER_NAME / EMAIL: Git設定上書き（任意）
            |- 各種APIキー: GitHub、Codex、Claude、OpenAI、Anthropic
            |
            |## 成果物
            |- credentials-validation-result.json
            |- credentials-validation-result.txt
            """.stripMargin())

        // パラメータ定義
        parameters {
            choiceParam('CHECK_CATEGORY', ['all', 'git', 'github', 'codex', 'claude', 'openai', 'anthropic'], '''
チェックするカテゴリ
            '''.stripIndent().trim())

            booleanParam('VERBOSE', false, '''
詳細ログ出力を有効化
            '''.stripIndent().trim())

            choiceParam('OUTPUT_FORMAT', ['text', 'json'], '''
出力フォーマット（text または json）
            '''.stripIndent().trim())

            booleanParam('EXIT_ON_ERROR', false, '''
失敗がある場合にビルドを失敗させる
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_NAME', '', '''
Git コミットユーザー名（任意）
            '''.stripIndent().trim())

            stringParam('GIT_COMMIT_USER_EMAIL', '', '''
Git コミットメールアドレス（任意）
            '''.stripIndent().trim())

            choiceParam('LANGUAGE', ['ja', 'en'], '''
ワークフロー言語
- ja: 日本語（デフォルト）
- en: English
            '''.stripIndent().trim())

            nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token
            '''.stripIndent().trim())

            nonStoredPasswordParam('CODEX_AUTH_JSON', '''
Codex auth.json の内容（任意、1行で貼り付け）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CODEX_API_KEY', '''
Codex API キー（任意）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN', '''
Claude Code OAuth トークン（任意）
            '''.stripIndent().trim())

            nonStoredPasswordParam('CLAUDE_CODE_API_KEY', '''
Claude Code API キー（任意）
            '''.stripIndent().trim())

            nonStoredPasswordParam('OPENAI_API_KEY', '''
OpenAI API キー（任意）
            '''.stripIndent().trim())

            nonStoredPasswordParam('ANTHROPIC_API_KEY', '''
Anthropic API キー（任意）
            '''.stripIndent().trim())
        }

        // ログローテーション
        logRotator {
            daysToKeep(30)
            numToKeep(20)
        }

        definition {
            cpsScm {
                lightweight(true)
                scm {
                    git {
                        remote {
                            url(jenkinsPipelineRepo.url)
                            credentials(jenkinsPipelineRepo.credentials)
                        }
                        branches(gitBranch)
                    }
                }
                scriptPath(jobConfig.jenkinsfile)
            }
        }
    }
}

// Develop / Stable フォルダ配下にジョブを作成
genericFolders.each { folder ->
    String jobName = "ai-workflow/${folder.name}/validate-credentials"
    String descriptionHeader = "Target Branch: ${folder.displayName} (${folder.branch})"
    createJob(jobName, descriptionHeader, folder.branch)
}
