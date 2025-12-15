# Response Plan

- PR Number: 436
- Analyzed At: 2025-12-15T02:28:12.707Z
- Analyzer Agent: codex

| Type | Count |
| --- | --- |
| code_change | 1 |
| reply | 0 |
| discussion | 0 |
| skip | 0 |
| total | 1 |

## Comment #2616718581
- File: jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile
- Line: 13
- Author: yuto-takashi
- Type: code_change (confidence: high)
- Rationale: Jenkinsfile already accepts CUSTOM_INSTRUCTION but the corresponding Job DSL lacks the parameter, so jobs cannot pass the value; adding the textParam aligns the pipeline parameters.
- Reply Message: ご指摘ありがとうございます。JobDSL側に CUSTOM_INSTRUCTION の textParam を追加し、パラメータ数表記も更新して Jenkinsfile の引数と一致させます。修正を反映します。
- Proposed Changes:
  - [modify] jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy 1-223: /**
 * AI Workflow Auto Issue Job DSL
 *
 * AIによる自動Issue作成用ジョブ
 * EXECUTION_MODE: auto_issue（固定値、パラメータとして表示しない）
 * パラメータ数: 15個（9個 + APIキー6個）
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_auto_issue_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""            |# AI Workflow - Auto Issue Creation
            |
            |${descriptionHeader}
            |
            |## 概要
            |AIエージェントがリポジトリを探索し、バグや改善点を検出してIssueを自動作成します。
            |
            |## Issue検出カテゴリ
            |- bug: バグ・潜在的問題の検出（Phase 1で実装済み）
            |- refactor: リファクタリング候補の検出（Phase 2で実装予定）
            |- enhancement: 機能拡張提案（Phase 3で実装予定）
            |- all: 全カテゴリを検出
            |
            |## 機能
            |- 重複判定の類似度閾値設定（デフォルト: 0.8）
            |- 作成するIssueの最大数設定（デフォルト: 5）
            |
            |## 注意事項
            |- EXECUTION_MODEは内部的に'auto_issue'に固定されます
            |- ISSUE_URLは不要（リポジトリ探索により自動Issue作成）
            |- コスト上限: デフォルト $5.00 USD
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // 実行モード（固定値）
            // ========================================
            choiceParam('EXECUTION_MODE', ['auto_issue'], '''
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
- codex: Codex のみを使用（CODEX_API_KEY または OPENAI_API_KEY が必要）
- claude: Claude Code のみを使用（credentials.json が必要）
            '''.stripIndent().trim())

            // ========================================
            // Auto Issue 設定
            // ========================================
            choiceParam('AUTO_ISSUE_CATEGORY', ['bug', 'refactor', 'enhancement', 'all'], '''
Issue検出カテゴリ

- bug: バグ・潜在的問題の検出（Phase 1で実装済み）
- refactor: リファクタリング候補の検出（Phase 2で実装予定）
- enhancement: 機能拡張提案（Phase 3で実装予定）
- all: 全カテゴリを検出
            '''.stripIndent().trim())

            stringParam('AUTO_ISSUE_LIMIT', '5', '''
作成するIssueの最大数

1〜50の範囲で指定してください。
            '''.stripIndent().trim())

            stringParam('AUTO_ISSUE_SIMILARITY_THRESHOLD', '0.8', '''
重複判定の類似度閾値

0.0〜1.0の範囲で指定してください。
値が高いほど厳密に重複判定します（デフォルト: 0.8）。
            '''.stripIndent().trim())

            textParam('CUSTOM_INSTRUCTION', '', '''
カスタム指示（任意、最大500文字程度）

エージェントへの追加ガイダンスを指定します。空欄の場合はデフォルト挙動で実行します。
            '''.stripIndent().trim())

            // ========================================
            // 実行オプション
            // ========================================
            booleanParam('DRY_RUN', false, '''
ドライランモード（API 呼び出しや Git 操作を行わず動作確認のみ実施）
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile')
            }
        }

        // 環境変数（EXECUTION_MODEを固定値として設定）
        environmentVariables {
            env('EXECUTION_MODE', 'auto_issue')
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
        "フォルダ: ${folder.displayName}
ブランチ: ${folder.branch}",
        folder.branch
    )
}


