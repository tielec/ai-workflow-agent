/**
 * AI Workflow - 共通処理モジュール
 *
 * 各実行モード専用Jenkinsfileから共通処理を抽出したモジュール。
 * 認証情報準備、環境セットアップ、Node.js環境セットアップ、成果物アーカイブを提供。
 *
 * 使用方法:
 *   def common = load 'jenkins/shared/common.groovy'
 *   common.prepareAgentCredentials()
 *   common.setupEnvironment()
 *   common.setupNodeEnvironment()
 *   common.archiveArtifacts(env.ISSUE_NUMBER)
 */

/**
 * エージェント実行に必要な認証情報を準備
 *
 * 処理内容:
 * 1. GitHub Token確認
 * 2. OpenAI API Key確認
 * 3. AWS認証情報確認
 * 4. Claude/Codex系認証情報確認
 * 5. エージェントモードに応じた検証
 *
 * 環境変数（Job DSLパラメータから設定済み）:
 * - GITHUB_TOKEN: GitHub Personal Access Token
 * - OPENAI_API_KEY: OpenAI API用キー
 * - CODEX_API_KEY: Codexエージェント用APIキー
 * - CLAUDE_CODE_OAUTH_TOKEN: Claude Codeエージェント用OAuthトークン（優先）
 * - CLAUDE_CODE_API_KEY: Claude Codeエージェント用APIキー（フォールバック）
 * - ANTHROPIC_API_KEY: Anthropic API用キー
 * - AWS_ACCESS_KEY_ID: AWS Access Key ID
 * - AWS_SECRET_ACCESS_KEY: AWS Secret Access Key
 * - AWS_SESSION_TOKEN: AWS Session Token（オプション）
 */
def prepareAgentCredentials() {
    echo "========================================="
    echo "Stage: Prepare Agent Credentials"
    echo "========================================="

    def agentMode = (params.AGENT_MODE ?: 'auto').toLowerCase()

    // 認証情報の確認（パラメータベース）
    echo "Agent Mode: ${agentMode}"

    def hasCodexApiKey = env.CODEX_API_KEY?.trim()
    def hasCodexAuthJson = params.CODEX_AUTH_JSON?.trim()

    // OpenAI系
    if (hasCodexApiKey) {
        echo '[INFO] CODEX_API_KEY is configured (for Codex agent).'
    } else if (hasCodexAuthJson) {
        echo '[INFO] CODEX_AUTH_JSON is provided. Codex CLI auth file will be used.'
    } else {
        echo '[WARN] Neither CODEX_API_KEY nor CODEX_AUTH_JSON is configured. Codex agent will not be available.'
    }

    if (env.OPENAI_API_KEY?.trim()) {
        echo '[INFO] OPENAI_API_KEY is configured (for OpenAI API).'
    } else {
        echo '[WARN] OPENAI_API_KEY is not configured. OpenAI API features will not be available.'
    }

    // Claude系
    if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
        echo '[INFO] CLAUDE_CODE_OAUTH_TOKEN is configured (for Claude Code agent, priority).'
    } else if (env.CLAUDE_CODE_API_KEY?.trim()) {
        echo '[INFO] CLAUDE_CODE_API_KEY is configured (for Claude Code agent, fallback).'
    } else {
        echo '[WARN] Neither CLAUDE_CODE_OAUTH_TOKEN nor CLAUDE_CODE_API_KEY is configured. Claude Code agent will not be available.'
    }

    if (env.ANTHROPIC_API_KEY?.trim()) {
        echo '[INFO] ANTHROPIC_API_KEY is configured (for Anthropic API).'
    } else {
        echo '[WARN] ANTHROPIC_API_KEY is not configured. Anthropic API features will not be available.'
    }

    // エージェントモードに応じた検証
    if (agentMode == 'codex') {
        if (!hasCodexApiKey && !hasCodexAuthJson) {
            error("Agent mode 'codex' requires CODEX_API_KEY or CODEX_AUTH_JSON parameter.")
        }
        if (hasCodexApiKey) {
            echo '[INFO] Agent mode "codex" selected. Using CODEX_API_KEY.'
        } else {
            echo '[INFO] Agent mode "codex" selected. Using CODEX_AUTH_JSON workspace credential.'
        }
    } else if (agentMode == 'claude') {
        if (!env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && !env.CLAUDE_CODE_API_KEY?.trim()) {
            error("Agent mode 'claude' requires CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY parameter.")
        }
        echo '[INFO] Agent mode "claude" selected. Using Claude Code credentials.'
    } else {
        // auto mode
        echo '[INFO] Agent mode "auto" selected. Will use available credentials.'
    }
}

/**
 * CODEX_AUTH_JSONパラメータから一時的なauth.jsonを展開
 *
 * Jenkinsのworkspace配下に ~/.codex/auth.json を書き出し、CODEX_HOMEを設定する。
 * パラメータが空の場合は何もしない。
 */
def prepareCodexAuthFile() {
    def codexAuth = params.CODEX_AUTH_JSON ?: ''
    if (!codexAuth.trim()) {
        echo "CODEX_AUTH_JSON is empty; skipping Codex auth setup."
        env.CODEX_HOME = ''
        return
    }

    if (env.WORKSPACE?.trim()) {
        sh """
            rm -rf '${env.WORKSPACE}/.codex'
        """
    }

    def workspaceTmp = env.WORKSPACE_TMP ?: "${env.WORKSPACE}@tmp"
    def codexSuffix = (env.BUILD_TAG ?: env.BUILD_ID ?: UUID.randomUUID().toString()).replaceAll('[^A-Za-z0-9_-]', '-')
    def codexHome = "${workspaceTmp}/codex-auth-${codexSuffix}"
    def authFilePath = "${codexHome}/auth.json"

    sh """
        mkdir -p '${codexHome}'
    """

    writeFile file: authFilePath, text: codexAuth

    sh """
        chmod 600 '${authFilePath}'
    """

    // Copy to HOME/.codex/auth.json so codex CLI auto-detects credentials
    def shellHome = sh(script: 'echo $HOME', returnStdout: true)?.trim()
    if (!shellHome) {
        shellHome = env.HOME ?: '/root'
    }
    def homeCodexDir = "${shellHome}/.codex"
    def homeAuthPath = "${homeCodexDir}/auth.json"

    sh """
        mkdir -p '${homeCodexDir}'
        cp '${authFilePath}' '${homeAuthPath}'
        chmod 600 '${homeAuthPath}'
    """

    env.CODEX_HOME = codexHome
    echo "Codex auth.json prepared at ${authFilePath}"
    echo "Codex auth.json copied to ${homeAuthPath}"
}

/**
 * REPOS_ROOT準備と対象リポジトリのクローン
 *
 * 処理内容:
 * 1. REPOS_ROOTディレクトリ作成
 * 2. auto_issueモード: 対象リポジトリをクローン
 * 3. 通常モード: Issue URLから対象リポジトリをクローン
 * 4. REPOS_ROOT環境変数を設定
 *
 * 環境変数:
 * - REPOS_ROOT: /tmp/ai-workflow-repos-${BUILD_ID}
 * - WORKSPACE: Jenkinsワークスペース
 */
def setupEnvironment() {
    echo "========================================="
    echo "Stage: Setup Environment"
    echo "========================================="

    // REPOS_ROOT の準備と対象リポジトリのチェックアウト
    // マルチリポジトリサポート: Issue URLから取得したリポジトリをクローン
    // ランダムサフィックスを追加して衝突を回避
    def randomSuffix = UUID.randomUUID().toString().take(8)
    def reposRoot = "/tmp/ai-workflow-repos-${env.BUILD_ID}-${randomSuffix}"
    echo "Setting up REPOS_ROOT: ${reposRoot}"

    // Issue #234: ai-workflow-agent自体のIssueでもREPOS_ROOTにクローンして作業
    // これにより、WORKSPACEのCLI（dist/）と作業対象リポジトリを分離
    def executionMode = env.EXECUTION_MODE ?: params.EXECUTION_MODE ?: ''
    def repoOwner = env.REPO_OWNER ?: ''
    def repoName = env.REPO_NAME ?: ''
    def issueNumber = env.ISSUE_NUMBER ?: ''
    def prNumber = env.PR_NUMBER ?: ''

    echo "DEBUG: executionMode=${executionMode}, prNumber=${prNumber}, repoOwner=${repoOwner}, repoName=${repoName}"

    // PR comment jobs の場合、GitHub API で PR のブランチ名を取得
    def targetBranch = params.BRANCH_NAME ?: "ai-workflow/issue-${issueNumber}"
    if (executionMode in ['pr_comment_init', 'pr_comment_execute', 'pr_comment_finalize'] && prNumber) {
        echo "Fetching PR branch name from GitHub API..."
        echo "Running: gh api repos/${repoOwner}/${repoName}/pulls/${prNumber} --jq .head.ref"
        def prBranch = sh(
            script: "gh api repos/${repoOwner}/${repoName}/pulls/${prNumber} --jq .head.ref || echo ''",
            returnStdout: true
        ).trim()
        echo "API response: '${prBranch}'"
        if (prBranch && prBranch != '') {
            targetBranch = prBranch
            echo "PR branch detected: ${targetBranch}"
        } else {
            echo "Warning: Failed to fetch PR branch. Using default: ${targetBranch}"
        }
    }

    sh """
        # REPOS_ROOT ディレクトリ作成
        mkdir -p ${reposRoot}

        # auto_issue モードの場合、対象リポジトリをクローン
        if [ "\${EXECUTION_MODE:-}" = "auto_issue" ]; then
            echo "Auto-issue mode detected. Cloning target repository..."

            # 対象リポジトリ情報を取得
            REPO_NAME_FROM_ENV=\$(echo \${GITHUB_REPOSITORY} | cut -d'/' -f2)
            TARGET_REPO_PATH="${reposRoot}/\${REPO_NAME_FROM_ENV}"

            if [ ! -d "\${TARGET_REPO_PATH}" ]; then
                echo "Cloning repository \${GITHUB_REPOSITORY}..."
                cd ${reposRoot}
                git clone --depth 1 https://\${GITHUB_TOKEN}@github.com/\${GITHUB_REPOSITORY}.git
            else
                echo "Repository \${REPO_NAME_FROM_ENV} already exists. Pulling latest changes..."
                cd "\${TARGET_REPO_PATH}"
                git pull
            fi

            echo "Target repository setup completed: \${TARGET_REPO_PATH}"
        fi

        # 通常モード（init/execute）の場合、Issue URLから対象リポジトリをクローン
        # ai-workflow-agent自体も含めて、すべてのリポジトリをREPOS_ROOTにクローン
        if [ "\${EXECUTION_MODE:-}" != "auto_issue" ]; then
            TARGET_REPO_PATH="${reposRoot}/${repoName}"

            if [ ! -d "\${TARGET_REPO_PATH}" ]; then
                echo "Cloning repository ${repoOwner}/${repoName}..."
                cd ${reposRoot}
                git clone https://\${GITHUB_TOKEN}@github.com/${repoOwner}/${repoName}.git
            fi

            # ワークフローブランチにチェックアウト
            cd "\${TARGET_REPO_PATH}"
            echo "Fetching remote branches..."
            git fetch origin

            # BASE_BRANCH を取得（デフォルト: main）
            BASE_BRANCH="\${BASE_BRANCH:-main}"
            echo "Base branch: \${BASE_BRANCH}"

            if git rev-parse --verify origin/${targetBranch} >/dev/null 2>&1; then
                echo "Branch ${targetBranch} exists on remote. Checking out..."
                git checkout -B ${targetBranch} origin/${targetBranch}
            else
                echo "Branch ${targetBranch} does not exist on remote. Creating from \${BASE_BRANCH}..."
                git checkout -B ${targetBranch} origin/\${BASE_BRANCH}
            fi

            echo "Target repository: \${TARGET_REPO_PATH}"
            echo "Current branch: \$(git rev-parse --abbrev-ref HEAD)"
        fi

        echo "REPOS_ROOT contents:"
        ls -la ${reposRoot} || echo "REPOS_ROOT is empty"
    """

    // REPOS_ROOT 環境変数を設定
    env.REPOS_ROOT = reposRoot
    echo "REPOS_ROOT set to: ${env.REPOS_ROOT}"
    echo "WORKSPACE: ${env.WORKSPACE}"
    echo "Target repository path: ${reposRoot}/${repoName}"
}

/**
 * Node.js環境確認とnpm install & build実行
 *
 * 処理内容:
 * 1. Node.js環境確認（node --version、npm --version）
 * 2. npm install実行（開発依存含む）
 * 3. npm run build実行（TypeScriptビルド）
 *
 * 前提条件:
 * - WORKFLOW_DIRが設定済み（既定: '.'）
 * - package.jsonが存在する
 */
def setupNodeEnvironment() {
    echo "========================================="
    echo "Stage: Setup Node.js Environment"
    echo "========================================="

    dir(env.WORKFLOW_DIR ?: '.') {
        sh """
            echo "Node version:"
            node --version

            echo ""
            echo "npm version:"
            npm --version

            echo ""
            echo "Current user: \$(whoami)"
            echo "HOME directory: \$HOME"

            echo ""
            echo "Installing dependencies (including dev)..."
            npm install --include=dev

            echo ""
            echo "Building TypeScript sources..."
            npm run build
        """
    }
}

/**
 * ワークフローメタデータ、ログ、成果物のアーカイブ
 *
 * 処理内容:
 * 1. リポジトリパス取得
 * 2. .ai-workflow/issue-${issueNumber}/ 配下のファイルをアーカイブ
 * 3. ログ出力
 *
 * @param issueNumber Issue番号（例: '211'）
 *
 * 前提条件:
 * - REPOS_ROOT環境変数が設定済み
 * - REPO_NAME環境変数が設定済み
 */
def archiveArtifacts(String issueNumber) {
    echo "========================================="
    echo "Stage: Archive Artifacts"
    echo "========================================="

    if (!issueNumber || issueNumber == 'auto') {
        echo "[INFO] Issue number not available (auto_issue mode). Skipping artifact archiving."
        return
    }

    def artifactPath = "${env.REPOS_ROOT}/${env.REPO_NAME}/.ai-workflow/issue-${issueNumber}/**/*"
    echo "Archiving artifacts from: ${artifactPath}"

    archiveArtifacts artifacts: artifactPath, allowEmptyArchive: true
    echo "Artifacts archived for Issue #${issueNumber}"
}

// Groovyスクリプトとして読み込み可能にするため、return this を末尾に追加
return this

