/**
 * AI Workflow Rollback Job DSL
 *
 * フェーズ差し戻し実行用ジョブ
 * EXECUTION_MODE: rollback（固定値、パラメータとして表示しない）
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
def jobKey = 'ai_workflow_rollback_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - Rollback Execution
            |
            |${descriptionHeader}
            |
            |## 概要
            |フェーズを差し戻し、指定したフェーズから再実行します。
            |メタデータが更新され、指定されたフェーズから再開可能になります。
            |
            |## 差し戻し先フェーズ
            |- implementation: 実装
            |- planning: 計画
            |- requirements: 要件定義
            |- design: 詳細設計
            |- test_scenario: テストシナリオ
            |- test_implementation: テスト実装
            |- testing: テスト実行
            |- documentation: ドキュメント作成
            |- report: レポート作成
            |
            |注: evaluation フェーズへの差し戻しはできません
            |
            |## 注意事項
            |- EXECUTION_MODEは内部的に'rollback'に固定されます
            |- コスト上限: デフォルト \$5.00 USD
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['rollback'], '''
実行モード（固定値 - 変更不可）
            '''.stripIndent().trim())

            // ========================================
            // 基本設定
            // ========================================
            nonStoredPasswordParam('ISSUE_URL', '''
GitHub Issue URL（必須）

例: https://github.com/tielec/my-project/issues/123
注: Issue URL から対象リポジトリを自動判定します
            '''.stripIndent().trim())

            nonStoredPasswordParam('BRANCH_NAME', '''
作業ブランチ名（任意）
空欄の場合は Issue 番号から自動生成されます
            '''.stripIndent().trim())

            choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
- auto: Codex APIキーがあれば Codex を優先し、なければ Claude Code を使用
- codex: Codex のみを使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
- claude: Claude Code のみを使用（credentials.json が必要）
            '''.stripIndent().trim())

            choiceParam('ROLLBACK_MODE', ['auto', 'manual'], '''
差し戻しモード（デフォルト: auto）
- auto: エージェントがワークフロー状態を分析し、最適な差し戻しフェーズ / ステップ / 理由を自動判定
- manual: 従来どおり差し戻し先を手動指定
            '''.stripIndent().trim())

            // ========================================
            // Rollback 設定
            // ========================================
            choiceParam('ROLLBACK_TO_PHASE', ['implementation', 'planning', 'requirements', 'design', 'test_scenario', 'test_implementation', 'testing', 'documentation', 'report'], '''
差し戻し先フェーズ（ROLLBACK_MODE=manual のみ必須）

manual の場合は差し戻し先フェーズを指定してください。auto の場合はエージェントが最適なフェーズを自動判定します。
※ evaluation フェーズへの差し戻しはサポートしていません。
            '''.stripIndent().trim())

            choiceParam('ROLLBACK_TO_STEP', ['revise', 'execute', 'review'], '''
差し戻し先ステップ（任意）

デフォルトは revise です。
- execute: フェーズの最初から再実行
- review: レビューステップから再実行
- revise: 修正ステップから再実行（差し戻し理由がプロンプトに注入されます）
            '''.stripIndent().trim())

            textParam('ROLLBACK_REASON', '', '''
差し戻し理由（ROLLBACK_MODE=manual のみ必須）

manual の場合は差し戻し理由を入力してください（または ROLLBACK_REASON_FILE を利用）。auto の場合はエージェントが理由を自動生成します。
            '''.stripIndent().trim())

            stringParam('ROLLBACK_REASON_FILE', '', '''
差し戻し理由ファイルパス（任意）

差し戻し理由をテキストファイルで管理する場合に指定します。
ROLLBACK_REASON と ROLLBACK_REASON_FILE の両方が指定された場合は ROLLBACK_REASON_FILE を優先します。
manual モードでは差し戻し理由の提供が必須のため、ファイル入力で代替できます。
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（API 呼び出しや Git 操作を行わず動作確認のみ実施）
            '''.stripIndent().trim())

            // ========================================
            // Git 設定
            // ========================================
            nonStoredPasswordParam('GIT_COMMIT_USER_NAME', '''
Git コミットユーザー名

デフォルト値: AI Workflow Bot
            '''.stripIndent().trim())

            nonStoredPasswordParam('GIT_COMMIT_USER_EMAIL', '''
Git コミットメールアドレス

デフォルト値: ai-workflow@example.com
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
            stringParam('COST_LIMIT_USD', '5.0', '''
ワークフローあたりのコスト上限（USD）
            '''.stripIndent().trim())

            choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR'], '''
ログレベル
- INFO: 一般的な情報
- DEBUG: 詳細ログ（デバッグ用）
- WARNING / ERROR: 警告 / エラーのみ
            '''.stripIndent().trim())

            // ========================================
            // Webhook通知設定
            // ========================================
            stringParam('JOB_ID', '', '''
Lavable Job ID（任意）

ジョブ実行状況をLavableに通知する際のジョブ識別子。
WEBHOOK_URL, WEBHOOK_TOKEN と合わせて指定してください。
            '''.stripIndent().trim())

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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'rollback')
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
