# 要件定義書 - Issue #153

## 0. Planning Documentの確認

Planning Documentを確認した結果、以下の開発計画が策定されています：

### 実装戦略
- **EXTEND**: 既存の `handleAutoIssueCommand()` と `Jenkinsfile` を拡張
- 既存の `resolveLocalRepoPath()` 関数を活用（新規実装不要）
- 新規ファイル作成なし

### テスト戦略
- **UNIT_INTEGRATION**: ユニットテストと統合テストを組み合わせ
- `resolveLocalRepoPath()` の動作検証（REPOS_ROOT設定時/未設定時）
- `handleAutoIssueCommand()` が正しいパスで `RepositoryAnalyzer` を呼び出すことを検証

### テストコード戦略
- **EXTEND_TEST**: 既存テストファイル（`tests/unit/commands/auto-issue.test.ts`）にテストケース追加
- 新規テストファイルは作成しない

### 見積もり工数
- **6~8時間**（実装: 2~3h、テスト: 1~2h、その他: 3~3.5h）

### リスク評価
- **中**（技術的リスク: REPOS_ROOT未設定時のフォールバック動作、CI/CD環境での動作確認が必要）

---

## 1. 概要

### 背景
Jenkins環境で `auto-issue` コマンドを実行した際、`GITHUB_REPOSITORY` 環境変数で指定した対象リポジトリ（例: `tielec/reflection-cloud-api`）を解析するべきところ、Jenkinsワークスペース（`ai-workflow-agent` 自体がクローンされているディレクトリ）を解析してしまう問題が発生しています。

### 目的
- **Jenkins環境**: `GITHUB_REPOSITORY` で指定したリポジトリを正しく解析できるようにする
- **ローカル環境**: カレントディレクトリをデフォルトで解析する既存動作を維持
- マルチリポジトリサポート機能（v0.2.0）との整合性を保つ

### ビジネス価値
- Jenkins環境で `auto-issue` コマンドが正しく動作し、AIエージェントによる自動Issue作成機能（Issue #121）が完全に利用可能になる
- 対象リポジトリの誤認識によるユーザー混乱を防止

### 技術的価値
- 既存の `resolveLocalRepoPath()` 関数を再利用し、コードの一貫性を維持
- マルチリポジトリワークフロー（v0.2.0）との統合を強化

---

## 2. 機能要件

### FR1: 対象リポジトリパスの自動解決（優先度: 高）

**説明**: `auto-issue` コマンド実行時、`GITHUB_REPOSITORY` 環境変数から対象リポジトリのローカルパスを自動的に解決する。

**詳細**:
- `GITHUB_REPOSITORY` 環境変数から `owner/repo` 形式でリポジトリ情報を取得
- `resolveLocalRepoPath(repo)` 関数を呼び出してローカルパスを解決
- 解決したパスで `RepositoryAnalyzer.analyze()` を実行

**実装箇所**:
- `src/commands/auto-issue.ts` の `handleAutoIssueCommand()` 関数（Line 49-50 付近）

**受け入れ基準**:
- Given: `GITHUB_REPOSITORY=tielec/reflection-cloud-api` が設定されている
- When: `auto-issue` コマンドを実行
- Then: `REPOS_ROOT/reflection-cloud-api` が解析される

### FR2: リポジトリが見つからない場合のエラーハンドリング（優先度: 高）

**説明**: ローカルリポジトリが見つからない場合、明確なエラーメッセージを表示する。

**詳細**:
- `resolveLocalRepoPath()` がエラーをスローした場合、エラーメッセージに以下を含める：
  - 探索したリポジトリ名
  - `REPOS_ROOT` 環境変数の設定方法
  - Jenkinsfile の確認を促すメッセージ

**受け入れ基準**:
- Given: `REPOS_ROOT` に対象リポジトリが存在しない
- When: `auto-issue` コマンドを実行
- Then: 「REPOS_ROOT にリポジトリが見つかりません。Jenkinsfile を確認してください」というエラーメッセージが表示される

### FR3: Jenkins環境での対象リポジトリ自動クローン（優先度: 高）

**説明**: Jenkinsfile の `Setup Environment` ステージで、`auto_issue` モード時に対象リポジトリを `REPOS_ROOT` にクローンする。

**詳細**:
- `params.EXECUTION_MODE == 'auto_issue'` の場合にのみ実行
- `GITHUB_REPOSITORY` 環境変数から `owner/repo` を取得
- `REPOS_ROOT` 配下に対象リポジトリが存在しない場合は `git clone` を実行
- 既存リポジトリが存在する場合は `git pull` を実行
- GitHub Token を使用した認証（`https://${GITHUB_TOKEN}@github.com/${owner}/${repo}.git`）

**実装箇所**:
- `Jenkinsfile` の `Setup Environment` ステージ（Line 249-328 付近）

**受け入れ基準**:
- Given: Jenkins Job で `EXECUTION_MODE=auto_issue` が選択されている
- And: `GITHUB_REPOSITORY=tielec/reflection-cloud-api` が設定されている
- When: `Setup Environment` ステージを実行
- Then: `REPOS_ROOT/reflection-cloud-api` が存在し、最新の状態である

### FR4: ロギング強化（優先度: 中）

**説明**: 解析対象リポジトリパスと `REPOS_ROOT` の値をログ出力する。

**詳細**:
- 解析開始時に `Analyzing repository: {repoPath}` をログ出力
- `REPOS_ROOT` 環境変数の値をログ出力（未設定の場合も明示）
- Jenkins環境では `ls -la ${REPOS_ROOT}` の結果をログ出力

**受け入れ基準**:
- Given: `auto-issue` コマンドを実行
- When: リポジトリ解析が開始される
- Then: ログに「Analyzing repository: /path/to/repo」と表示される

### FR5: ローカル環境での既存動作維持（優先度: 高）

**説明**: ローカル環境（`REPOS_ROOT` 未設定）で `auto-issue` コマンドを実行した場合、カレントディレクトリを解析する既存動作を維持する。

**詳細**:
- `REPOS_ROOT` が未設定の場合、`resolveLocalRepoPath()` はフォールバック候補パス（`~/TIELEC/development`、`~/projects`、`../`）を探索
- フォールバック候補でリポジトリが見つからない場合、カレントディレクトリを使用（`process.cwd()`）

**受け入れ基準**:
- Given: `REPOS_ROOT` が未設定
- And: カレントディレクトリが対象リポジトリのルート
- When: `auto-issue` コマンドを実行
- Then: カレントディレクトリが解析される

---

## 3. 非機能要件

### NFR1: パフォーマンス

- **Git clone**: シャローコピー（`--depth 1`）により、クローン時間を短縮する
- **既存リポジトリ**: 既存リポジトリが存在する場合、再クローンせず `git pull` のみ実行

### NFR2: セキュリティ

- **GitHub Token**: Git URL に埋め込まれたトークンは自動的に除去される（v0.3.1、Issue #54）
- **認証情報管理**: Jenkins Credentials からトークンを取得し、ログに出力しない

### NFR3: 可用性・信頼性

- **エラーハンドリング**: リポジトリクローン失敗時、明確なエラーメッセージを表示
- **ロールバック**: クローン失敗時、ワークフローを停止（部分的な状態で実行しない）

### NFR4: 保守性・拡張性

- **既存関数の再利用**: `resolveLocalRepoPath()` を活用し、コードの重複を避ける
- **テスト容易性**: ユニットテストでモックを使用して `resolveLocalRepoPath()` の動作を検証

---

## 4. 制約事項

### 技術的制約

- **既存関数の活用**: `resolveLocalRepoPath()` 関数の既存動作を変更しない
- **Jenkins環境**: `REPOS_ROOT` 環境変数が必須
- **GitHub Token**: `repo` スコープを持つGitHub Personal Access Tokenが必須

### リソース制約

- **開発工数**: 6~8時間（Planning Documentで策定）
- **テスト工数**: 1~2時間（ユニットテスト + 統合テスト）

### ポリシー制約

- **コーディング規約**: TypeScript 5.x、ESLint `no-console` ルール準拠
- **ロギング規約**: 統一loggerモジュール（`src/utils/logger.ts`）を使用
- **環境変数アクセス規約**: Config クラス（`src/core/config.ts`）を使用

---

## 5. 前提条件

### システム環境

- **Jenkins環境**: Docker 24 以上、Node.js 20 以上
- **ローカル環境**: Node.js 20 以上、npm 10 以上

### 依存コンポーネント

- **既存関数**: `resolveLocalRepoPath()` (`src/core/repository-utils.ts`)
- **既存クラス**: `RepositoryAnalyzer` (`src/core/repository-analyzer.ts`)

### 外部システム連携

- **GitHub**: GitHub Personal Access Token（`repo` スコープ）
- **Git**: Git 2.30 以上

---

## 6. 受け入れ基準

### AC1: Jenkins環境での正しいリポジトリ解析

- **Given**: Jenkins Job で `EXECUTION_MODE=auto_issue` が選択されている
- **And**: `GITHUB_REPOSITORY=tielec/reflection-cloud-api` が設定されている
- **When**: `auto-issue` コマンドを実行
- **Then**: `REPOS_ROOT/reflection-cloud-api` のコードが解析される
- **And**: ログに「GitHub repository: tielec/reflection-cloud-api」と表示される
- **And**: ログに「Analyzing repository: /tmp/ai-workflow-repos-{BUILD_ID}/reflection-cloud-api」と表示される

### AC2: リポジトリクローンの動作確認

- **Given**: Jenkins Job で `auto_issue` モードを実行
- **And**: `REPOS_ROOT/reflection-cloud-api` が存在しない
- **When**: `Setup Environment` ステージを実行
- **Then**: `git clone https://${GITHUB_TOKEN}@github.com/tielec/reflection-cloud-api.git` が実行される
- **And**: `REPOS_ROOT/reflection-cloud-api` ディレクトリが作成される

### AC3: 既存リポジトリの pull 動作確認

- **Given**: `REPOS_ROOT/reflection-cloud-api` が既に存在する
- **When**: `Setup Environment` ステージを実行
- **Then**: `git clone` はスキップされる
- **And**: `git pull` が実行され、最新のコミットが取得される

### AC4: リポジトリ未発見時のエラーハンドリング

- **Given**: `REPOS_ROOT` に対象リポジトリが存在しない
- **And**: `Setup Environment` ステージでクローンに失敗
- **When**: `auto-issue` コマンドを実行
- **Then**: エラーメッセージ「Repository 'reflection-cloud-api' not found. Please set REPOS_ROOT environment variable or clone the repository.」が表示される
- **And**: ワークフローが停止する

### AC5: ローカル環境での既存動作維持

- **Given**: `REPOS_ROOT` が未設定
- **And**: カレントディレクトリが `ai-workflow-agent` のルート
- **When**: `npm run build && node dist/index.js auto-issue` を実行
- **Then**: カレントディレクトリ（`ai-workflow-agent`）が解析される
- **And**: エラーが発生しない

### AC6: ログ出力の確認

- **Given**: `auto-issue` コマンドを実行
- **When**: リポジトリ解析が開始される
- **Then**: ログに以下が含まれる：
  - 「GitHub repository: {owner}/{repo}」
  - 「Analyzing repository: {repoPath}」
  - 「REPOS_ROOT: {path}」または「REPOS_ROOT: (not set)」

---

## 7. スコープ外

以下の項目は、本Issueのスコープ外とします：

### 将来的な拡張候補

- **複数リポジトリの同時解析**: 現在は単一リポジトリのみ対象
- **リモートリポジトリの直接解析**: ローカルクローンなしでリモート解析（将来検討）
- **カスタム除外パターン**: `.ai-workflow-ignore` ファイルによる除外設定（将来検討）

### 他Issueで対応

- **auto-issue コマンドの機能拡張**: Issue #127（リファクタリング検出）、Issue #128（enhancement検出）
- **重複検出アルゴリズムの改善**: Issue #146（Jenkins/CI環境での動作安定化）

---

## 8. 依存関係

### 上流依存（ブロッカー）

- ✅ **Issue #126**: auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装（完了）
- ✅ **v0.2.0**: マルチリポジトリサポート機能（完了）

### 下流依存（本Issueに依存）

- **Issue #127**: auto-issue: Phase 2 - リファクタリング候補検出機能の実装（リポジトリパス解決が必要）
- **Issue #146**: Jenkins/CI環境での動作安定化（本Issueの修正が前提）

---

## 9. データモデル

### 環境変数

| 環境変数名 | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `GITHUB_REPOSITORY` | string | ✅ | - | 対象リポジトリ（`owner/repo` 形式） |
| `REPOS_ROOT` | string | ❌ | - | リポジトリの親ディレクトリ（Jenkins環境では必須） |
| `GITHUB_TOKEN` | string | ✅ | - | GitHub Personal Access Token |

### ログ出力例

```
2025-01-30 14:30:10 [INFO ] Starting auto-issue command...
2025-01-30 14:30:10 [INFO ] GitHub repository: tielec/reflection-cloud-api
2025-01-30 14:30:10 [INFO ] REPOS_ROOT: /tmp/ai-workflow-repos-12345
2025-01-30 14:30:10 [INFO ] Analyzing repository for bugs...
2025-01-30 14:30:10 [INFO ] Analyzing repository: /tmp/ai-workflow-repos-12345/reflection-cloud-api
```

---

## 10. セキュリティ考慮事項

### 認証情報の取り扱い

- **GitHub Token**: Jenkins Credentials から取得し、環境変数として渡す
- **Git URL サニタイズ**: HTTPS形式のURLに埋め込まれたトークンは自動的に除去（Issue #54）

### ログ出力の注意点

- GitHub Token をログに出力しない
- Git URL は `sanitizeGitUrl()` でサニタイズ済みのものを表示

---

## 11. テスト要件

### ユニットテスト

- `resolveLocalRepoPath()` の動作検証
  - `REPOS_ROOT` 設定時の動作
  - `REPOS_ROOT` 未設定時のフォールバック動作
  - リポジトリが見つからない場合のエラー処理

### 統合テスト

- `handleAutoIssueCommand()` が正しいパスで `RepositoryAnalyzer.analyze()` を呼び出すことを検証
- ログ出力が正しいリポジトリパスを含むことを検証

### E2Eテスト（手動）

- Jenkins環境で `auto_issue` モードを実行し、対象リポジトリが正しく解析されることを確認

---

## 12. ドキュメント更新

- **CLAUDE.md**: `auto-issue` コマンドの動作説明に「対象リポジトリ解決」を追記
- **README.md**: `auto-issue` コマンドの使用例に `REPOS_ROOT` 環境変数の説明追加

---

## 13. 品質ゲート（Phase 1）

本要件定義書は、Planning Document（Phase 0）で策定された品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR1~FR5 で具体的かつ検証可能な要件を定義
- ✅ **受け入れ基準が定義されている**: AC1~AC6 で Given-When-Then 形式の受け入れ基準を明記
- ✅ **スコープが明確である**: スコープ内（セクション2）とスコープ外（セクション7）を明確に分離
- ✅ **論理的な矛盾がない**: 各セクション間で整合性を確認済み（機能要件↔受け入れ基準、非機能要件↔制約事項）

---

## 14. 実装ガイドライン

### FR1 実装例

```typescript
// src/commands/auto-issue.ts (Line 49-83付近)

export async function handleAutoIssueCommand(rawOptions: RawAutoIssueOptions): Promise<void> {
  try {
    logger.info('Starting auto-issue command...');

    const options = parseOptions(rawOptions);

    // GITHUB_REPOSITORY から owner/repo を取得
    const githubRepository = config.getGitHubRepository();
    if (!githubRepository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required.');
    }
    logger.info(`GitHub repository: ${githubRepository}`);

    // リポジトリ名を抽出（例: "tielec/reflection-cloud-api" → "reflection-cloud-api"）
    const [owner, repo] = githubRepository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${githubRepository}`);
    }

    // ローカルリポジトリパスを解決
    let repoPath: string;
    try {
      repoPath = resolveLocalRepoPath(repo);
      logger.info(`Resolved repository path: ${repoPath}`);
    } catch (error) {
      logger.error(`Failed to resolve repository path: ${getErrorMessage(error)}`);
      throw new Error(
        `Repository '${repo}' not found locally.\n` +
        `Please ensure REPOS_ROOT is set correctly in Jenkins environment,\n` +
        `or run the command from the repository root in local environment.\n` +
        `Original error: ${getErrorMessage(error)}`
      );
    }

    // REPOS_ROOT の値をログ出力
    const reposRoot = config.getReposRoot();
    logger.info(`REPOS_ROOT: ${reposRoot || '(not set)'}`);

    // エージェント認証情報を解決
    const homeDir = config.getHomeDir();
    const credentials = resolveAgentCredentials(homeDir, repoPath);

    // エージェントクライアントを初期化
    const { codexClient, claudeClient } = setupAgentClients(
      options.agent,
      repoPath,
      credentials.codexApiKey,
      credentials.claudeCredentialsPath,
    );

    // リポジトリ解析
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);
    logger.info('Analyzing repository for bugs...');
    logger.info(`Analyzing repository: ${repoPath}`);
    const bugCandidates = await analyzer.analyze(repoPath, options.agent);

    // 以下、既存のロジック...
  } catch (error) {
    logger.error(`auto-issue command failed: ${getErrorMessage(error)}`);
    throw error;
  }
}
```

### FR3 実装例（Jenkinsfile）

```groovy
stage('Setup Environment') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Setup Environment"
            echo "========================================="

            def reposRoot = "/tmp/ai-workflow-repos-${env.BUILD_ID}"
            echo "Setting up REPOS_ROOT: ${reposRoot}"

            sh """
                # REPOS_ROOT ディレクトリ作成
                mkdir -p ${reposRoot}

                # auto_issue モードの場合、対象リポジトリをクローン
                if [ "${params.EXECUTION_MODE}" = "auto_issue" ]; then
                    echo "Auto-issue mode detected. Cloning target repository..."

                    # 対象リポジトリ情報を取得
                    REPO_NAME=\$(echo ${params.GITHUB_REPOSITORY} | cut -d'/' -f2)
                    TARGET_REPO_PATH="${reposRoot}/\${REPO_NAME}"

                    if [ ! -d "\${TARGET_REPO_PATH}" ]; then
                        echo "Cloning repository ${params.GITHUB_REPOSITORY}..."
                        cd ${reposRoot}
                        git clone --depth 1 https://\${GITHUB_TOKEN}@github.com/${params.GITHUB_REPOSITORY}.git
                    else
                        echo "Repository \${REPO_NAME} already exists. Pulling latest changes..."
                        cd "\${TARGET_REPO_PATH}"
                        git pull
                    fi

                    echo "Target repository setup completed: \${TARGET_REPO_PATH}"
                fi

                # 通常モード（init/execute）の場合、Issue URLから対象リポジトリをクローン
                if [ "${params.EXECUTION_MODE}" != "auto_issue" ] && [ "${env.REPO_NAME}" != "ai-workflow-agent" ]; then
                    if [ ! -d ${reposRoot}/${env.REPO_NAME} ]; then
                        echo "Cloning repository ${env.REPO_OWNER}/${env.REPO_NAME}..."
                        cd ${reposRoot}
                        git clone https://\${GITHUB_TOKEN}@github.com/${env.REPO_OWNER}/${env.REPO_NAME}.git
                    else
                        echo "Repository ${env.REPO_NAME} already exists. Pulling latest changes..."
                        cd ${reposRoot}/${env.REPO_NAME}
                        git pull
                    fi
                fi

                echo "REPOS_ROOT contents:"
                ls -la ${reposRoot} || echo "REPOS_ROOT is empty"
            """

            env.REPOS_ROOT = reposRoot
            echo "REPOS_ROOT set to: ${env.REPOS_ROOT}"
        }
    }
}
```

---

## 15. 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|-----------|---------|--------|
| 2025-01-30 | 1.0 | 初版作成 | AI Workflow Agent |

---

**承認**: この要件定義書は、Phase 1（Requirements）の品質ゲートをすべて満たしており、Phase 2（Design）への移行が可能です。
