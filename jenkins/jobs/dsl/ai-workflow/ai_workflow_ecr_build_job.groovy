/**
 * AI Workflow ECR Build Job DSL
 *
 * ECRイメージビルド・プッシュ用ジョブ（定期実行 + 手動実行）
 * パラメータ数: 7個
 */

// 汎用フォルダ定義（Develop 1 + Stable 9）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
] + (1..9).collect { i ->
    [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
}

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_ecr_build_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - ECR Image Build & Push
            |
            |${descriptionHeader}
            |
            |## 概要
            |既存のDockerfileを使用してAWS ECRにDockerイメージをビルド・プッシュします。
            |cronトリガーにより毎日深夜2時頃に自動実行されます。
            |
            |## パラメータ
            |- AWS_ACCOUNT_ID（必須）: AWSアカウントID
            |- AWS_REGION: AWSリージョン（デフォルト: ap-northeast-1）
            |- ECR_REPOSITORY_NAME: ECRリポジトリ名（デフォルト: ai-workflow-agent）
            |- IMAGE_RETENTION_COUNT: 保持するイメージ世代数（デフォルト: 2）
            |- AWS認証情報: 手動実行時にオプションで指定
            |
            |## 注意事項
            |- cronトリガー実行時はIAMインスタンスプロファイルの認証情報を使用
            |- 手動実行時はAWS_ACCESS_KEY_ID等のパラメータ指定可能
            |- disableConcurrentBuilds()により並行実行を防止
            """.stripMargin())

        // パラメータ定義
        parameters {
            // ========================================
            // ECR設定（必須）
            // ========================================
            stringParam('AWS_ACCOUNT_ID', '', '''
AWSアカウントID（必須）

ECRリポジトリが存在するAWSアカウントの12桁のIDを指定してください。
例: 123456789012
            '''.stripIndent().trim())

            // ========================================
            // ECR設定（任意、デフォルト値あり）
            // ========================================
            stringParam('AWS_REGION', 'ap-northeast-1', '''
AWSリージョン

ECRリポジトリが存在するリージョンを指定します。
デフォルト: ap-northeast-1（東京リージョン）
            '''.stripIndent().trim())

            stringParam('ECR_REPOSITORY_NAME', 'ai-workflow-agent', '''
ECRリポジトリ名

DockerイメージをプッシュするECRリポジトリの名前を指定します。
デフォルト: ai-workflow-agent
            '''.stripIndent().trim())

            stringParam('IMAGE_RETENTION_COUNT', '2', '''
保持するイメージの世代数

ECRリポジトリに保持するイメージの最大数を指定します。
この数を超える古いイメージは自動削除されます。
1以上の整数を指定してください。
デフォルト: 2
            '''.stripIndent().trim())

            // ========================================
            // AWS認証情報
            // ========================================
            stringParam('AWS_ACCESS_KEY_ID', '', '''
AWSアクセスキーID（任意）

手動実行時にAWS認証情報を指定する場合に使用します。
cronトリガー実行時は空欄のままでOK（IAMインスタンスプロファイルを使用）。
            '''.stripIndent().trim())

            nonStoredPasswordParam('AWS_SECRET_ACCESS_KEY', '''
AWSシークレットアクセスキー（任意）

手動実行時にAWS認証情報を指定する場合に使用します。
cronトリガー実行時は空欄のままでOK（IAMインスタンスプロファイルを使用）。
            '''.stripIndent().trim())

            nonStoredPasswordParam('AWS_SESSION_TOKEN', '''
AWSセッショントークン（任意）

一時的なAWS認証情報を使用する場合に指定します。
永続的なアクセスキーを使用する場合は空欄でOK。
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile')
            }
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
