/**
 * AI Workflow ECR Build Job DSL
 *
 * ECRイメージビルド・プッシュ用ジョブ（定期実行 + 手動実行）
 * パラメータ数: 3個
 */

// 汎用フォルダ定義（Develop 1）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
]

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
            |- AWS_REGION: AWSリージョン（デフォルト: ap-northeast-1）
            |- ECR_REPOSITORY_NAME: ECRリポジトリ名（デフォルト: ai-workflow-agent）
            |- IMAGE_RETENTION_COUNT: 保持するイメージ世代数（デフォルト: 2）
            |
            |## 注意事項
            |- cronトリガー実行時はIAMインスタンスプロファイルの認証情報を使用
            |- AWS_ACCOUNT_IDはAWS STSから自動取得されます
            |- disableConcurrentBuilds()により並行実行を防止
            """.stripMargin())

        // パラメータ定義
        parameters {
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
