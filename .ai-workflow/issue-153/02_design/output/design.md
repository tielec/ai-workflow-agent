# 設計書 - Issue #153

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

### 技術的価値
- 既存の `resolveLocalRepoPath()` 関数を再利用し、コードの一貫性を維持
- マルチリポジトリワークフロー（v0.2.0）との統合を強化

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- **既存コード拡張**: `handleAutoIssueCommand()` 内部でリポジトリパス解決ロジックを追加
- **既存関数の活用**: `resolveLocalRepoPath()` を呼び出すだけ（新規関数の作成不要）
- **Jenkinsfile 拡張**: `Setup Environment` ステージに対象リポジトリクローンロジック追加（既存ステージの拡張）
- **新規ファイル作成なし**: すべて既存ファイルへの追加・修正
- **既存パターンとの整合性**: `init` / `execute` コマンドで使用している `resolveLocalRepoPath()` と同じパターンを適用

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
- **ユニットテスト**: `resolveLocalRepoPath()` の動作を検証（`REPOS_ROOT` 設定時、未設定時のフォールバック動作）
- **インテグレーションテスト**: `handleAutoIssueCommand()` が正しいリポジトリパスで `RepositoryAnalyzer` を呼び出すことを検証
- **BDD不要**: エンドユーザー向け機能ではなく、内部コマンドの修正のため
- **既存テストパターンとの整合性**: 他のコマンド（`init`, `execute`）も同様のテスト戦略を採用

---

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST

**判断根拠**:
- **既存テストファイル拡張**: `tests/unit/commands/auto-issue.test.ts` にテストケース追加
- **新規テストファイル不要**: リポジトリパス解決のテストは `tests/unit/core/repository-utils.test.ts` （存在する場合）に追加可能
- **既存テストスイートとの統合**: 既存のモック構造を再利用
- **保守性の向上**: テストファイルの肥大化を防ぎ、既存テストとの一貫性を維持

---

## 5. アーキテクチャ設計

### システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                      Jenkins Pipeline                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Setup Environment Stage                               │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ auto_issue モード判定                            │  │ │
│  │  │  ↓                                                │  │ │
│  │  │ GITHUB_REPOSITORY から owner/repo を抽出         │  │ │
│  │  │  ↓                                                │  │ │
│  │  │ REPOS_ROOT/{repo} にリポジトリをクローン         │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Execute Stage                                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ auto-issue コマンド実行                          │  │ │
│  │  │  ↓                                                │  │ │
│  │  │ handleAutoIssueCommand()                          │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              handleAutoIssueCommand()                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. GITHUB_REPOSITORY から owner/repo を取得           │ │
│  │     ↓                                                  │ │
│  │ 2. resolveLocalRepoPath(repo) を呼び出し              │ │
│  │     ↓                                                  │ │
│  │ 3. 解決したパスでRepositoryAnalyzer.analyze()を実行   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           resolveLocalRepoPath(repo)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. REPOS_ROOT が設定されている場合                    │ │
│  │     → REPOS_ROOT/{repo} を返す                        │ │
│  │ 2. REPOS_ROOT が未設定の場合                          │ │
│  │     → フォールバック候補パスを探索                    │ │
│  │       - ~/TIELEC/development/{repo}                   │ │
│  │       - ~/projects/{repo}                             │ │
│  │       - ../{repo}                                      │ │
│  │ 3. すべて失敗した場合                                 │ │
│  │     → エラーをスロー                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────────┐
│                      src/commands/auto-issue.ts              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ handleAutoIssueCommand()                               │ │
│  │  - GITHUB_REPOSITORY から owner/repo を取得           │ │
│  │  - resolveLocalRepoPath(repo) を呼び出し              │ │
│  │  - エラーハンドリング                                  │ │
│  │  - ログ出力強化                                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ uses
┌─────────────────────────────────────────────────────────────┐
│              src/core/repository-utils.ts                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ resolveLocalRepoPath(repoName: string)                 │ │
│  │  - REPOS_ROOT チェック                                │ │
│  │  - フォールバック候補パス探索                         │ │
│  │  - リポジトリ存在チェック                             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ uses
┌─────────────────────────────────────────────────────────────┐
│                    src/core/config.ts                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ config.getGitHubRepository()                           │ │
│  │ config.getReposRoot()                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ uses
┌─────────────────────────────────────────────────────────────┐
│                    src/utils/logger.ts                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ logger.info()                                          │ │
│  │ logger.error()                                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### データフロー

```
1. Jenkins Pipeline
   ↓
2. Setup Environment Stage
   - GITHUB_REPOSITORY 環境変数を取得
   - REPOS_ROOT を /tmp/ai-workflow-repos-{BUILD_ID} に設定
   - auto_issue モード判定
   - 対象リポジトリを REPOS_ROOT にクローン
   ↓
3. Execute Stage
   - auto-issue コマンド実行
   ↓
4. handleAutoIssueCommand()
   - config.getGitHubRepository() で GITHUB_REPOSITORY を取得
   - owner/repo を分割
   - resolveLocalRepoPath(repo) を呼び出し
   ↓
5. resolveLocalRepoPath(repo)
   - REPOS_ROOT が設定されている場合
     → REPOS_ROOT/{repo} を返す
   - REPOS_ROOT が未設定の場合
     → フォールバック候補パス（~/TIELEC/development/{repo}、~/projects/{repo}、../{repo}）を探索
   - リポジトリが見つからない場合
     → Error をスロー
   ↓
6. RepositoryAnalyzer.analyze(repoPath, agentMode)
   - 解決したパスでリポジトリを解析
   ↓
7. バグ候補検出
   ↓
8. Issue生成
```

---

## 6. 影響範囲分析

### 既存コードへの影響

#### 変更が必要なファイル

| ファイル | 変更内容 | 影響度 | 変更理由 |
|---------|---------|--------|---------|
| `src/commands/auto-issue.ts` | `GITHUB_REPOSITORY` からリポジトリパスを解決する処理を追加（Line 49-50付近） | 中 | リポジトリパス解決ロジックの追加 |
| `Jenkinsfile` | `Setup Environment` ステージに対象リポジトリクローンロジック追加（Line 257-287付近） | 中 | Jenkins環境での対象リポジトリ準備 |
| `tests/unit/commands/auto-issue.test.ts` | リポジトリパス解決のテストケース追加 | 低 | テストカバレッジの向上 |

#### 影響を受けるモジュール

- **`RepositoryAnalyzer`**: 解析対象パスが変更されるが、インターフェースは不変
- **`resolveLocalRepoPath()`**: 既存関数の呼び出し追加（関数自体は変更なし）
- **Jenkins パイプライン**: `Setup Environment` ステージの処理時間が若干増加（対象リポジトリクローン時）

### 依存関係の変更

**新規依存の追加**: なし

**既存依存の変更**: なし

**既存関数の再利用**:
- `resolveLocalRepoPath()` (`src/core/repository-utils.ts`)
- `config.getGitHubRepository()` (`src/core/config.ts`)
- `config.getReposRoot()` (`src/core/config.ts`)
- `logger.info()`, `logger.error()` (`src/utils/logger.ts`)

### マイグレーション要否

**不要**

- データベーススキーマ変更なし
- 設定ファイル変更なし（環境変数 `REPOS_ROOT` は既存）
- メタデータ構造変更なし

---

## 7. 変更・追加ファイルリスト

### 修正が必要な既存ファイル

1. **src/commands/auto-issue.ts**
   - `handleAutoIssueCommand()` 関数に対象リポジトリパス解決ロジックを追加
   - ログ出力強化（解析対象パス、`REPOS_ROOT` の値）

2. **Jenkinsfile**
   - `Setup Environment` ステージに `auto_issue` モード判定と対象リポジトリクローンロジックを追加

3. **tests/unit/commands/auto-issue.test.ts**
   - リポジトリパス解決のテストケースを追加

### 新規作成ファイル

なし

### 削除が必要なファイル

なし

---

## 8. 詳細設計

### 8.1 クラス設計

既存クラスの変更はありません。既存の関数を活用します。

### 8.2 関数設計

#### handleAutoIssueCommand() 関数の拡張

**ファイル**: `src/commands/auto-issue.ts`

**既存シグネチャ**:
```typescript
export async function handleAutoIssueCommand(rawOptions: RawAutoIssueOptions): Promise<void>
```

**変更内容**:
- `GITHUB_REPOSITORY` 環境変数から owner/repo を取得
- `resolveLocalRepoPath(repo)` を呼び出してローカルリポジトリパスを解決
- 解決したパスで `RepositoryAnalyzer.analyze()` を実行
- エラーハンドリング追加（リポジトリが見つからない場合）
- ログ出力強化

**擬似コード**:
```typescript
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

**エラーハンドリング**:
- `GITHUB_REPOSITORY` が未設定の場合: エラーをスロー
- `GITHUB_REPOSITORY` のフォーマットが不正な場合: エラーをスロー
- `resolveLocalRepoPath()` がエラーをスローした場合: 詳細なエラーメッセージを表示

**ログ出力強化**:
- `GitHub repository: {githubRepository}` を追加
- `Resolved repository path: {repoPath}` を追加
- `REPOS_ROOT: {reposRoot}` を追加（未設定の場合は `(not set)` と表示）
- `Analyzing repository: {repoPath}` を追加（既存のログを明確化）

#### Jenkinsfile の拡張

**ファイル**: `Jenkinsfile`

**変更箇所**: `Setup Environment` ステージ（Line 249-328付近）

**追加内容**:
- `auto_issue` モード判定（`params.EXECUTION_MODE == 'auto_issue'`）
- 対象リポジトリのクローンロジック
- 既存リポジトリが存在する場合の `git pull` 処理

**擬似コード**:
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

**重要なポイント**:
- `git clone --depth 1` でシャローコピー（履歴なし）を実行し、クローン時間を短縮
- 既存リポジトリが存在する場合は `git pull` のみ実行（再クローン不要）
- GitHub Token を使用した認証（`https://${GITHUB_TOKEN}@github.com/${owner}/${repo}.git`）
- クローン完了後、`ls -la ${REPOS_ROOT}` でディレクトリ内容をログ出力

### 8.3 データ構造設計

新規データ構造の追加はありません。既存の環境変数とメタデータ構造を使用します。

**使用する環境変数**:
- `GITHUB_REPOSITORY`: 対象リポジトリ（`owner/repo` 形式）
- `REPOS_ROOT`: リポジトリの親ディレクトリ
- `GITHUB_TOKEN`: GitHub Personal Access Token

**ログ出力例**:
```
2025-01-30 14:30:10 [INFO ] Starting auto-issue command...
2025-01-30 14:30:10 [INFO ] GitHub repository: tielec/reflection-cloud-api
2025-01-30 14:30:10 [INFO ] REPOS_ROOT: /tmp/ai-workflow-repos-12345
2025-01-30 14:30:10 [INFO ] Resolved repository path: /tmp/ai-workflow-repos-12345/reflection-cloud-api
2025-01-30 14:30:10 [INFO ] Analyzing repository for bugs...
2025-01-30 14:30:10 [INFO ] Analyzing repository: /tmp/ai-workflow-repos-12345/reflection-cloud-api
```

### 8.4 インターフェース設計

既存のインターフェースを使用します。新規インターフェースの追加はありません。

**既存インターフェース**:
- `resolveLocalRepoPath(repoName: string): string` (`src/core/repository-utils.ts`)
- `config.getGitHubRepository(): string` (`src/core/config.ts`)
- `config.getReposRoot(): string | null` (`src/core/config.ts`)
- `logger.info(message: string): void` (`src/utils/logger.ts`)
- `logger.error(message: string): void` (`src/utils/logger.ts`)

---

## 9. セキュリティ考慮事項

### 認証情報の取り扱い

- **GitHub Token**: Jenkins Credentials から取得し、環境変数として渡す
- **Git URL サニタイズ**: HTTPS形式のURLに埋め込まれたトークンは自動的に除去（v0.3.1、Issue #54）
- **ログ出力の注意点**: GitHub Token をログに出力しない

### エラーメッセージのセキュリティ

- リポジトリパスが見つからない場合のエラーメッセージは、内部パス情報を漏洩しないように注意
- `REPOS_ROOT` の値はログに出力するが、トークンは含まれない

---

## 10. 非機能要件への対応

### パフォーマンス

- **Git clone**: シャローコピー（`--depth 1`）により、クローン時間を短縮する
- **既存リポジトリ**: 既存リポジトリが存在する場合、再クローンせず `git pull` のみ実行
- **ログ出力**: 最小限のログ出力（必要な情報のみ）

### 可用性・信頼性

- **エラーハンドリング**: リポジトリクローン失敗時、明確なエラーメッセージを表示
- **ロールバック**: クローン失敗時、ワークフローを停止（部分的な状態で実行しない）

### 保守性・拡張性

- **既存関数の再利用**: `resolveLocalRepoPath()` を活用し、コードの重複を避ける
- **テスト容易性**: ユニットテストでモックを使用して `resolveLocalRepoPath()` の動作を検証

---

## 11. 実装の順序

### 推奨実装順序

1. **Phase 1: 要件定義** (完了)
   - Issue #153 の要件を明確化
   - 既存コードの調査

2. **Phase 2: 設計** (本ドキュメント)
   - リポジトリパス解決ロジックの設計
   - Jenkins 対象リポジトリクローンロジックの設計

3. **Phase 3: テストシナリオ**
   - ユニットテストシナリオ作成
   - 統合テストシナリオ作成

4. **Phase 4: 実装**
   - **Step 1**: `src/commands/auto-issue.ts` の修正
     - `GITHUB_REPOSITORY` から owner/repo を抽出
     - `resolveLocalRepoPath(repoName)` を呼び出してリポジトリパスを取得
     - 解決したパスで `analyzer.analyze(repoPath, options.agent)` を実行
     - エラーハンドリング追加
   - **Step 2**: ロギング強化
     - 解析対象リポジトリパスをログ出力
     - `REPOS_ROOT` の値をログ出力
   - **Step 3**: Jenkinsfile の修正
     - `Setup Environment` ステージに `auto_issue` モード判定追加
     - 対象リポジトリクローンロジック追加
     - 既存リポジトリ存在時の pull 処理追加

5. **Phase 5: テストコード実装**
   - **Step 1**: ユニットテスト実装
     - `tests/unit/commands/auto-issue.test.ts` にテストケース追加
     - `resolveLocalRepoPath()` のモック設定
     - リポジトリパス解決が正しく動作することを検証
   - **Step 2**: 統合テスト実装
     - `RepositoryAnalyzer.analyze()` のモック設定
     - `handleAutoIssueCommand()` が正しいパスで解析を実行することを検証
     - ログ出力の検証

6. **Phase 6: テスト実行**
   - ユニットテスト実行
   - 統合テスト実行
   - カバレッジ確認

7. **Phase 7: ドキュメント**
   - CLAUDE.md の更新
   - README.md の更新

8. **Phase 8: レポート**
   - PR 説明文の作成
   - Issue #153 のクローズコメント作成

### 依存関係の考慮

- **Phase 4 (実装) の依存関係**:
  - Step 1 → Step 2 → Step 3（順次実行）
  - Step 1 が完了しないと、Step 2、Step 3 のログ出力やJenkinsfile修正ができない

- **Phase 5 (テストコード実装) の依存関係**:
  - Phase 4 の実装が完了している必要がある
  - Step 1 (ユニットテスト) と Step 2 (統合テスト) は並行実行可能

---

## 12. リスクと軽減策

### リスク1: Jenkins環境で `REPOS_ROOT` 配下にリポジトリが見つからない

- **影響度**: 高
- **確率**: 中
- **軽減策**:
  - Jenkinsfile の `Setup Environment` ステージで対象リポジトリを必ず `REPOS_ROOT` にクローンする
  - `resolveLocalRepoPath()` のエラーメッセージを改善（「REPOS_ROOT にリポジトリが見つかりません。Jenkinsfile を確認してください」）
  - Jenkins ビルドログに `REPOS_ROOT` の内容を出力（`ls -la ${REPOS_ROOT}`）

### リスク2: GitHub Token の権限不足でリポジトリクローンに失敗

- **影響度**: 高
- **確率**: 低
- **軽減策**:
  - Jenkinsfile に GitHub Token のスコープ要件を明記（`repo` スコープ必須）
  - クローン失敗時のエラーメッセージを改善（「GitHub Token の権限を確認してください」）

### リスク3: 対象リポジトリのサイズが大きくクローンに時間がかかる

- **影響度**: 中
- **確率**: 中
- **軽減策**:
  - `git clone --depth 1` でシャローコピー（履歴なし）を実行
  - 既存リポジトリが存在する場合は `git pull` のみ実行（再クローン不要）

### リスク4: `resolveLocalRepoPath()` のフォールバック動作が Jenkins 環境で機能しない

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  - `REPOS_ROOT` を必ず設定することで、フォールバック動作に依存しない
  - ユニットテストで `REPOS_ROOT` 設定時の動作を優先的に検証

---

## 13. 受け入れ基準

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

## 14. 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|-----------|---------|--------|
| 2025-01-30 | 1.0 | 初版作成 | AI Workflow Agent |

---

## 15. 品質ゲート（Phase 2）チェックリスト

- ✅ **実装戦略の判断根拠が明記されている**: セクション2で `EXTEND` の判断根拠を詳細に記載
- ✅ **テスト戦略の判断根拠が明記されている**: セクション3で `UNIT_INTEGRATION` の判断根拠を詳細に記載
- ✅ **テストコード戦略の判断根拠が明記されている**: セクション4で `EXTEND_TEST` の判断根拠を詳細に記載
- ✅ **既存コードへの影響範囲が分析されている**: セクション6で影響範囲を詳細に分析
- ✅ **変更が必要なファイルがリストアップされている**: セクション7で変更・追加ファイルリストを明記
- ✅ **設計が実装可能である**: セクション8で詳細設計を具体的に記載（擬似コード含む）

---

**承認**: この設計書は、Phase 2（Design）の品質ゲートをすべて満たしており、Phase 3（Test Scenario）への移行が可能です。
