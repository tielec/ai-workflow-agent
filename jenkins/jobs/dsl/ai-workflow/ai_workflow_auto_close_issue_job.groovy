/**
 * AI Workflow Auto Close Issue Job DSL
 *
 * 既存IssueをAIで検品し、自動クローズするジョブ定義。
 * EXECUTION_MODE: auto_close_issue（固定値）
 * パラメータ数: 20個（基本9 + 認証6 + Webhook/実行設定5）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: "develop", displayName: 'AI Workflow Executor - Develop', branch: '*/develop'],
    [name: "stable-1", displayName: 'AI Workflow Executor - Stable 1', branch: '*/main'],
    [name: "stable-2", displayName: 'AI Workflow Executor - Stable 2', branch: '*/main'],
    [name: "stable-3", displayName: 'AI Workflow Executor - Stable 3', branch: '*/main'],
    [name: "stable-4", displayName: 'AI Workflow Executor - Stable 4', branch: '*/main'],
    [name: "stable-5", displayName: 'AI Workflow Executor - Stable 5', branch: '*/main'],
    [name: "stable-6", displayName: 'AI Workflow Executor - Stable 6', branch: '*/main'],
    [name: "stable-7", displayName: 'AI Workflow Executor - Stable 7', branch: '*/main'],
    [name: "stable-8", displayName: 'AI Workflow Executor - Stable 8', branch: '*/main'],
    [name: "stable-9", displayName: 'AI Workflow Executor - Stable 9', branch: '*/main']
]

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_auto_close_issue_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""|
            |# AI Workflow - Auto Close Issue
            |${descriptionHeader}
            |
            |## 概要
            |AIエージェントが既存のオープンIssueを検品し、安全にクローズします。
            |
            |## クローズカテゴリ
            |- followup: フォローアップが必要なIssue
            |- stale: 長期間更新のないIssue
            |- old: 作成から長期間経過したIssue
            |- all: 全カテゴリ
            |
            |## 安全対策
            |- DRY_RUNデフォルトfalse
            |- EXCLUDE_LABELSで保護ラベルを除外
            |- REQUIRE_APPROVALで追加確認（CIでは非推奨）
            |
            |## 注意事項
            |- EXECUTION_MODEは内部的に'auto_close_issue'に固定
            |- コスト上限・Webhook通知は任意指定
            |- コマンド実行は Jenkinsfile 側で行います
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['auto_close_issue'], '''
実行モード（固定値 - 変更不可）
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            stringParam('GITHUB_REPOSITORY', '', '''
GitHub リポジトリ（owner/repo）（必須）

例: tielec/ai-workflow-agent
            '''.stripIndent().trim())

            choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: Codex APIキーがあれば Codex を優先し、なければ Claude Code を使用
- codex: Codex のみを使用
- claude: Claude Code のみを使用
            '''.stripIndent().trim())

            choiceParam('LANGUAGE', ['ja', 'en'], '''
ワークフロー言語
- ja: 日本語（デフォルト）
- en: English
            '''.stripIndent().trim())

            // ========================================
            // Auto Close Issue 設定
            // ========================================
            choiceParam('AUTO_CLOSE_CATEGORY', ['followup', 'stale', 'old', 'all'], '''
Issue分類カテゴリ

- followup: フォローアップが必要なIssue
- stale: 長期間更新のないIssue
- old: 古いIssue
- all: 全カテゴリ
            '''.stripIndent().trim())

            stringParam('AUTO_CLOSE_LIMIT', '10', '''
処理対象のIssue上限

1〜50の範囲で指定してください。
            '''.stripIndent().trim())

            stringParam('CONFIDENCE_THRESHOLD', '0.7', '''
クローズ推奨の信頼度閾値

0.0〜1.0の範囲で指定してください。
値が高いほど厳密にクローズ判定します（デフォルト: 0.7）。
            '''.stripIndent().trim())

            stringParam('DAYS_THRESHOLD', '90', '''
経過日数の閾値

指定日数以上更新のないIssueが対象となります。
            '''.stripIndent().trim())

            stringParam('EXCLUDE_LABELS', 'do-not-close,pinned', '''
除外するラベル（カンマ区切り）

これらのラベルが付与されたIssueは処理対象から除外されます。
空欄の場合はオプションを省略します。
            '''.stripIndent().trim())

            booleanParam('REQUIRE_APPROVAL', false, '''
クローズ前に承認を要求する

注意: CI環境では対話的確認ができないため、非推奨です。
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（デフォルト: false）

true: Issueをクローズせず、クローズ候補の検出結果のみ表示
false: 実際にIssueをクローズ
            '''.stripIndent().trim())

            // ========================================
            // APIキー設定（6個）
            // ========================================
            nonStoredPasswordParam('GITHUB_TOKEN', '''
GitHub Personal Access Token（必須）
repoスコープ推奨
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
            // Webhook・実行設定（5個）
            // ========================================
            stringParam('JOB_ID', '', '''
Lavable Job ID（任意）

ジョブ実行状況をWebhook通知する際の識別子。
WEBHOOK_URL, WEBHOOK_TOKEN と合わせて指定してください。
            '''.stripIndent().trim())

            nonStoredPasswordParam('WEBHOOK_URL', '''
Webhookエンドポイント URL（任意）

通知を受け取るエンドポイント。HTTPS推奨。
            '''.stripIndent().trim())

            nonStoredPasswordParam('WEBHOOK_TOKEN', '''
Webhook認証トークン（任意）
X-Webhook-Tokenヘッダーとして送信されます。
            '''.stripIndent().trim())

            stringParam('COST_LIMIT_USD', '10', '''
ワークフローあたりのコスト上限（USD）
            '''.stripIndent().trim())

            choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR'], '''
ログレベル
- INFO: 一般的な情報
- DEBUG: 詳細ログ（デバッグ用）
- WARNING / ERROR: 警告 / エラーのみ
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
                            url(jenkinsPipelineRepo.url)
                            credentials(jenkinsPipelineRepo.credentials)
                        }
                        branch(gitBranch)
                    }
                }
                scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'auto_close_issue')
            env('WORKFLOW_VERSION', '0.2.0')
        }

        // プロパティ
        properties {
            disableConcurrentBuilds()
        }

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
