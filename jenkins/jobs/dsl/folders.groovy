// Jenkinsfileから渡されたフォルダ設定を取得
def folderConfig = binding.hasVariable('jenkinsFoldersConfig') ?
    binding.getVariable('jenkinsFoldersConfig') :
    [:]

if (!folderConfig) {
    error("Folder configuration not found. Please ensure jenkinsFoldersConfig is passed from Jenkinsfile.")
}

println "=== Starting folder creation ==="

// 作成済みフォルダを追跡（重複作成を防ぐ）
def createdFolders = [] as Set

// メイン処理

// 1. 通常のフォルダを作成（パスでソートして親から順に作成）
if (folderConfig.folders) {
    println "\n=== Creating static folders ==="
    // フォルダを階層順（浅い→深い）でソートし、同じ階層内では名前順にする
    // これにより親フォルダが子フォルダより先に作成されることを保証する
    def sortedFolders = folderConfig.folders.sort { a, b ->
        def aDepth = a.path.count('/')
        def bDepth = b.path.count('/')

        // まず階層の深さで比較
        if (aDepth != bDepth) {
            return aDepth - bDepth  // 浅い階層を先に
        }

        // 同じ階層の場合は名前順
        return a.path.compareTo(b.path)
    }

    sortedFolders.each { folderDef ->
        def fullPath = folderDef.path

        // パスから親フォルダを作成
        def parts = fullPath.split('/')
        def currentPath = ''

        parts.eachWithIndex { part, index ->
            currentPath = currentPath ? "${currentPath}/${part}" : part

            // 最後の要素以外は親フォルダとして作成
            if (index < parts.size() - 1) {
                if (!createdFolders.contains(currentPath)) {
                    folder(currentPath) {
                        displayName(part)
                        description("Auto-generated parent folder")
                    }
                    createdFolders.add(currentPath)
                }
            }
        }

        // フォルダを作成
        if (!createdFolders.contains(fullPath)) {
            folder(fullPath) {
                displayName(folderDef.displayName ?: folderDef.path.split('/').last())
                if (folderDef.description) {
                    description(folderDef.description.stripIndent().trim())
                }
            }
            createdFolders.add(fullPath)
            println "Created folder: ${fullPath}"
        }
    }
}

// 2. 動的フォルダを作成
if (folderConfig.dynamic_folders) {
    println "\n=== Creating dynamic folders ==="

    folderConfig.dynamic_folders.each { dynamicRule ->
        if (dynamicRule.source == 'jenkins-managed-repositories' &&
            binding.hasVariable('jenkinsManagedRepositories')) {

            def repositories = binding.getVariable('jenkinsManagedRepositories')
            def template = dynamicRule.template

            println "Creating dynamic folders in: ${dynamicRule.parent_path}"

            repositories.each { name, repo ->
                def subfolderPath = "${dynamicRule.parent_path}/${template.path_suffix.replace('{name}', name)}"
                def folderDisplayName = template.displayName.replace('{name}', name)
                def folderDescription = template.description.replace('{name}', name)

                // 親フォルダが存在することを確認
                def parentParts = subfolderPath.split('/')
                def parentPath = ''

                parentParts.eachWithIndex { part, index ->
                    parentPath = parentPath ? "${parentPath}/${part}" : part

                    // 最後の要素以外は親フォルダとして作成
                    if (index < parentParts.size() - 1) {
                        if (!createdFolders.contains(parentPath)) {
                            folder(parentPath) {
                                displayName(part)
                                description("Auto-generated parent folder")
                            }
                            createdFolders.add(parentPath)
                        }
                    }
                }

                // 動的フォルダを作成
                folder(subfolderPath) {
                    displayName(folderDisplayName)
                    description(folderDescription.stripIndent().trim())
                }
                createdFolders.add(subfolderPath)
                println "Created dynamic folder: ${subfolderPath}"
            }
        }
        // Pulumiプロジェクト用の動的フォルダ作成を追加
        if (dynamicRule.source == 'pulumi-projects' &&
            binding.hasVariable('pulumi_projects')) {

            def pulumiProjects = binding.getVariable('pulumi_projects')
            def template = dynamicRule.template

            println "Creating Pulumi project folders in: ${dynamicRule.parent_path}"

            pulumiProjects.each { repoKey, repoConfig ->
                def subfolderPath = "${dynamicRule.parent_path}/${template.path_suffix.replace('{repo_name}', repoConfig.repo_name)}"
                def folderDisplayName = template.displayName.replace('{repo_name}', repoConfig.repo_name)
                def folderDescription = template.description
                    .replace('{repo_name}', repoConfig.repo_name)
                    .replace('{display_name}', repoConfig.display_name ?: repoConfig.repo_name)

                // プロジェクトパスの置換（最初のプロジェクトのパスを使用）
                if (repoConfig.projects && repoConfig.projects.size() > 0) {
                    def firstProject = repoConfig.projects.values().first()
                    folderDescription = folderDescription.replace('{project_path}', firstProject.project_path)
                }

                // 親フォルダが存在することを確認
                def parentParts = subfolderPath.split('/')
                def parentPath = ''

                parentParts.eachWithIndex { part, index ->
                    parentPath = parentPath ? "${parentPath}/${part}" : part

                    // 最後の要素以外は親フォルダとして作成
                    if (index < parentParts.size() - 1) {
                        if (!createdFolders.contains(parentPath)) {
                            folder(parentPath) {
                                displayName(part)
                                description("Auto-generated parent folder")
                            }
                            createdFolders.add(parentPath)
                        }
                    }
                }

                // 動的フォルダを作成
                folder(subfolderPath) {
                    displayName(folderDisplayName)
                    description(folderDescription.stripIndent().trim())
                }
                createdFolders.add(subfolderPath)
                println "Created Pulumi project folder: ${subfolderPath}"
            }
        }
    }
}

// 処理完了メッセージ
println "\n=== Folder creation completed ==="
println "Total folders created: ${createdFolders.size()}"
