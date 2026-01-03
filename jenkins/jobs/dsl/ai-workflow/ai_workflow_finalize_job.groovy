/**
 * AI Workflow Finalize Job DSL
 *
 * ワークフロー完了後の最終処理用ジョブ（v0.5.0、Issue #261で実装完了）
 * finalize コマンドを呼び出し、以下の処理を実行：
 * 1. base_commit 取得
 * 2. .ai-workflow ディレクトリ削除 + コミット
 * 3. コミットスカッシュ（--skip-squash でスキップ可能）
 * 4. PR 本文更新 + マージ先ブランチ変更（--skip-pr-update でスキップ可能）
 * 5. PR ドラフト解除
 *
 * EXECUTION_MODE: finalize（固定値、パラメータとして表示しない）
 * パラメータ数: 16個（10個 + APIキー6個）
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
            |ワークフロー完了後の最終処理を実行します。
            |finalize コマンドが以下の5ステップを順次実行：
            |
            |1. **base_commit 取得**: metadata.json から開始時点のコミットを取得
            |2. **クリーンアップ**: .ai-workflow ディレクトリを削除してコミット
            |3. **スカッシュ**: base_commit から HEAD までのコミットをスカッシュ（--skip-squash でスキップ可）
            |4. **PR 更新**: PR 本文を最終内容に更新、マージ先ブランチ変更（--skip-pr-update でスキップ可）
            |5. **ドラフト解除**: PR をレビュー可能状態に変更
            |
            |## パラメータ
            |- ISSUE_URL（必須）: GitHub Issue URL
            |- SKIP_SQUASH: コミットスカッシュをスキップ
            |- SKIP_PR_UPDATE: PR更新・ドラフト解除をスキップ
            |- BASE_BRANCH: PRのマージ先ブランチ（デフォルト: main）
            |- DRY_RUN: ドライランモード
            |- その他: Git設定、AWS認証情報、APIキー等
            |
            |## 注意事項
            |- Evaluation Phase（Phase 9）が完了している必要があります
            |- base_commit が metadata.json に記録されている必要があります（init コマンド実行時に記録）
            |- SKIP_SQUASH を true にすると、コミット履歴がそのまま残ります
            |- SKIP_PR_UPDATE を true にすると、PR は更新されず、ドラフト状態のままです
            """.stripMargin())

        // パラメータ定義（16個）
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

            choiceParam('LANGUAGE', ['ja', 'en'], '''
ワークフロー言語
- ja: 日本語（デフォルト）
- en: English
            '''.stripIndent().trim())

            // ========================================
            // Finalize 設定
            // ========================================
            booleanParam('SKIP_SQUASH', false, '''
コミットスカッシュをスキップ

true の場合、コミット履歴がそのまま残ります
デフォルト: false（スカッシュを実行）
            '''.stripIndent().trim())

            booleanParam('SKIP_PR_UPDATE', false, '''
PR更新・ドラフト解除をスキップ

true の場合、PR本文の更新とドラフト解除を行いません
デフォルト: false（PR更新を実行）
            '''.stripIndent().trim())

            nonStoredPasswordParam('BASE_BRANCH', '''
PRのマージ先ブランチ（ベースブランチ）（任意）

空欄の場合: 現在のマージ先ブランチを変更しません
変更する場合: 「main」や「develop」を指定
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
            // APIキー設定（6個）
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'finalize')
            env('WORKFLOW_VERSION', '0.5.0')
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
