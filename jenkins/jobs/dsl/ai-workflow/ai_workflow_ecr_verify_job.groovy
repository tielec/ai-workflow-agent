/**
 * AI Workflow ECR Verify Job DSL
 *
 * ECRイメージ動作確認用ジョブ（定期実行 + 手動実行）
 * パラメータ数: 3個
 */

// 汎用フォルダ定義（Develop 1）
def genericFolders = [
    [name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop']
]

// 共通設定を取得
def jenkinsPipelineRepo = commonSettings['jenkins-pipeline-repo']
def jobKey = 'ai_workflow_ecr_verify_job'
def jobConfig = jenkinsJobsConfig[jobKey]

// ジョブ作成クロージャ
def createJob = { String jobName, String descriptionHeader, String gitBranch ->
    pipelineJob(jobName) {
        displayName(jobConfig.displayName)

        description("""\
            |# AI Workflow - ECR Image Verify
            |
            |${descriptionHeader}
            |
            |## 概要
            |ECRからpullしたDockerイメージのランタイム検証を実行します。
            |cronトリガーにより毎日午前9時頃に自動実行されます。
            |
            |## パラメータ
            |- AWS_REGION: AWSリージョン（デフォルト: ap-northeast-1）
            |- ECR_REPOSITORY_NAME: ECRリポジトリ名（デフォルト: ai-workflow-agent）
            |- IMAGE_TAG: 検証対象のイメージタグ（デフォルト: latest）
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

DockerイメージをpullするECRリポジトリの名前を指定します。
デフォルト: ai-workflow-agent
            '''.stripIndent().trim())

            stringParam('IMAGE_TAG', 'latest', '''
検証対象のイメージタグ

ECRから取得するイメージのタグを指定します。
手動実行時に特定ビルドのイメージを検証する場合に変更してください。
デフォルト: latest
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
                scriptPath('jenkins/jobs/pipeline/ai-workflow/ecr-verify/Jenkinsfile')
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
