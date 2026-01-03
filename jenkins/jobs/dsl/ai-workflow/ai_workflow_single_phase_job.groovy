/**
 * AI Workflow Single Phase Job DSL
 *
 * 単一フェーズ実行用ジョブ（指定フェーズのみ実行）
 * EXECUTION_MODE: single_phase（固定値、パラメータとして表示しない）
 * パラメータ数: 21個（15個 + APIキー6個）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_single_phase_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - Single Phase Execution
            |
            |${descriptionHeader}
            |
            |## 概要
            |指定した単一フェーズのみを実行します（デバッグ用）。
            |
            |## フェーズ
            |- planning: 計画
            |- requirements: 要件定義
            |- design: 詳細設計
            |- test_scenario: テストシナリオ
            |- implementation: 実装
            |- test_implementation: テスト実装
            |- testing: テスト実行
            |- documentation: ドキュメント作成
            |- report: レポート作成
            |- evaluation: 評価
            |
            |## 注意事項
            |- EXECUTION_MODEは内部的に'single_phase'に固定されます
            |- コスト上限: デフォルト \$5.00 USD
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['single_phase'], '''
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

            nonStoredPasswordParam('BASE_BRANCH', '''
ベースブランチ（任意）

新規ブランチを作成する際の分岐元ブランチを指定します。
- 空欄の場合: 現在チェックアウトされているブランチから分岐
- 指定する場合: 「main」「develop」等のブランチ名を指定

注: リモートブランチが既に存在する場合、このパラメータは無視されます
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
            // フェーズ指定
            // ========================================
            choiceParam('START_PHASE', ['planning', 'requirements', 'design', 'test_scenario', 'implementation', 'test_implementation', 'testing', 'documentation', 'report', 'evaluation'], '''
開始フェーズ（必須）

指定したフェーズのみを実行します
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

            choiceParam('MAX_RETRIES', ['3', '1', '5', '10'], '''
フェーズ失敗時の最大リトライ回数
            '''.stripIndent().trim())

            booleanParam('SQUASH_ON_COMPLETE', true, '''
ワークフロー完了時にコミットをスカッシュする
            '''.stripIndent().trim())

            // ========================================
            // モデル選択オプション
            // ========================================
            booleanParam('AUTO_MODEL_SELECTION', true, '''
Issue難易度に基づく自動エージェントモデル選択
- true: Issue内容を分析し最適なモデルを自動選択（コスト最適化＋品質バランス）
- false: AGENT_MODEパラメータで指定された固定モデルを使用
デフォルト: true
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'single_phase')
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
