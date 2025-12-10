# init コマンドにベースブランチ指定オプションを追加

## 概要

現在の `init` コマンドは、新規ブランチ作成時に現在チェックアウトされているブランチから分岐します。しかし、Jenkins 環境や CI/CD パイプラインでは、明示的に `main` または `develop` から分岐させたい場合があります。

`init` コマンドに `--base-branch` オプションを追加し、ユーザーがベースブランチを指定できるようにします。

## 背景

### 現在の動作

`src/commands/init.ts` では、新規ブランチ作成時に以下のコードが実行されます：

```typescript
// 358行目
await git.checkoutLocalBranch(branchName);
logger.info(`Created and switched to new branch: ${branchName}`);
```

この実装では、**現在チェックアウトされているブランチ**から新規ブランチが分岐します。

**問題点**:
1. **意図しないベースブランチ**: Jenkins で実行した場合、どのブランチがチェックアウトされているか不明確
2. **develop/main の使い分け不可**: 開発ブランチ（develop）から分岐させたいか、本番ブランチ（main）から分岐させたいかを制御できない
3. **再現性の欠如**: 同じコマンドでも実行環境によって異なるベースブランチから分岐する

### 既存の関連実装

#### BranchManager には baseBranch パラメータが存在

`src/core/git/branch-manager.ts` の `createBranch()` メソッドは、既に `baseBranch` パラメータをサポートしています：

```typescript
public async createBranch(
  branchName: string,
  baseBranch?: string, // ← 既に存在
): Promise<BranchResult> {
  if (await this.branchExists(branchName)) {
    // ...
  }

  try {
    if (baseBranch) {
      await this.git.checkout(baseBranch); // ← ベースブランチにチェックアウト
    }

    await this.git.checkoutLocalBranch(branchName); // ← 新規ブランチ作成
    return { success: true, branch_name: branchName };
  } catch (error) {
    // ...
  }
}
```

しかし、`init` コマンドでは `GitManager.createBranch()` を使用せず、`simple-git` の `checkoutLocalBranch()` を直接呼んでいるため、この機能が活用されていません。

#### finalize コマンドには BASE_BRANCH が存在

`jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` では、PR のマージ先ブランチを指定する `BASE_BRANCH` パラメータが既に存在します：

```groovy
stringParam('BASE_BRANCH', '', '''
PRのマージ先ブランチ（任意）

空欄の場合: 現在のマージ先ブランチを変更しません
変更する場合: 「main」や「develop」を指定
'''.stripIndent().trim())
```

同様のアプローチを `init` コマンドにも適用します。

## 目標

`init` コマンドに `--base-branch` オプションを追加し、ユーザーが明示的にベースブランチを指定できるようにする。

## 実装詳細

### 対象ファイル

#### CLI 実装

1. `src/main.ts` - `init` コマンドの CLI オプション定義に `--base-branch` を追加
2. `src/commands/init.ts` - `handleInitCommand()` で `baseBranch` パラメータを受け取り、ブランチ作成時に使用

#### Jenkins 統合

3. `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy` - `BASE_BRANCH` パラメータを追加
4. `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy` - `BASE_BRANCH` パラメータを追加
5. `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy` - `BASE_BRANCH` パラメータを追加
6. `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` - `init` コマンドに `--base-branch` を渡す
7. `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` - `init` コマンドに `--base-branch` を渡す
8. `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` - `init` コマンドに `--base-branch` を渡す

### CLI 実装

#### src/main.ts の変更

```typescript
program
  .command('init')
  .description('Initialize workflow for a GitHub Issue')
  .requiredOption('--issue-url <url>', 'GitHub Issue URL')
  .option('--branch <name>', 'Custom branch name (default: ai-workflow/issue-<NUM>)')
  .option('--base-branch <branch>', 'Base branch to branch from (default: current branch)') // 追加
  .option('--auto-model-selection', 'Enable automatic model selection based on issue difficulty')
  .action(async (options) => {
    await handleInitCommand(options.issueUrl, options.branch, options.autoModelSelection, options.baseBranch);
  });
```

#### src/commands/init.ts の変更

```typescript
export async function handleInitCommand(
  issueUrl: string,
  customBranch?: string,
  autoModelSelection = false,
  baseBranch?: string, // 追加
): Promise<void> {
  // ...existing code...

  // リモートブランチが存在しない場合: 新規作成
  logger.info(`Remote branch '${branchName}' not found. Creating new branch...`);

  const localBranches = await git.branchLocal();
  if (localBranches.all.includes(branchName)) {
    await git.checkout(branchName);
    logger.info(`Switched to existing local branch: ${branchName}`);
  } else {
    // baseBranch が指定されている場合、そのブランチから分岐
    if (baseBranch) {
      logger.info(`Branching from: ${baseBranch}`);
      await git.checkout(baseBranch); // ベースブランチにチェックアウト
    } else {
      logger.info('Branching from: current branch');
    }

    await git.checkoutLocalBranch(branchName);
    logger.info(`Created and switched to new branch: ${branchName}`);
  }

  // ...existing code...
}
```

**別案（GitManager.createBranch() を使用）**:

```typescript
// GitManager を使用してブランチ作成（より推奨）
const gitManager = new GitManager(repoRoot, metadataManager);
const branchResult = await gitManager.createBranch(branchName, baseBranch);

if (!branchResult.success) {
  throw new Error(`Failed to create branch: ${branchResult.error}`);
}

logger.info(`Created and switched to new branch: ${branchName}`);
```

### Jenkins Job DSL の変更

#### パラメータ追加（3ファイル共通）

```groovy
// ========================================
// 基本設定
// ========================================
stringParam('ISSUE_URL', '', '''
GitHub Issue URL（必須）

例: https://github.com/tielec/my-project/issues/123
注: Issue URL から対象リポジトリを自動判定します
'''.stripIndent().trim())

stringParam('BRANCH_NAME', '', '''
作業ブランチ名（任意）
空欄の場合は Issue 番号から自動生成されます
'''.stripIndent().trim())

stringParam('BASE_BRANCH', '', ''' // 追加
ベースブランチ（任意）

新規ブランチを作成する際の分岐元ブランチを指定します。
- 空欄の場合: 現在チェックアウトされているブランチから分岐
- 指定する場合: 「main」「develop」等のブランチ名を指定

注: リモートブランチが既に存在する場合、このパラメータは無視されます
'''.stripIndent().trim())

choiceParam('AGENT_MODE', ['auto', 'codex', 'claude'], '''
エージェントの実行モード
...
'''.stripIndent().trim())
```

#### パラメータ数の更新

```groovy
/**
 * AI Workflow All Phases Job DSL
 *
 * 全フェーズ一括実行用ジョブ（planning → evaluation）
 * EXECUTION_MODE: all_phases（固定値、パラメータとして表示しない）
 * パラメータ数: 22個（16個 + APIキー6個）  // 21個 → 22個 に更新
 */
```

### Jenkins Jenkinsfile の変更

#### Initialize Workflow ステージの修正（3ファイル共通）

```groovy
stage('Initialize Workflow') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Initialize Workflow"
            echo "========================================="

            dir(env.WORKFLOW_DIR) {
                if (params.DRY_RUN) {
                    echo "[DRY RUN] Workflow initialization skipped"
                } else {
                    def branchOption = params.BRANCH_NAME ? "--branch ${params.BRANCH_NAME}" : ""
                    def baseBranchOption = params.BASE_BRANCH ? "--base-branch ${params.BASE_BRANCH}" : "" // 追加

                    sh """
                        node dist/index.js init \
                            --issue-url ${params.ISSUE_URL} \
                            ${branchOption} \
                            ${baseBranchOption}
                    """
                }
            }
        }
    }
}
```

#### Validate Parameters ステージのログ追加

```groovy
echo "Issue URL: ${params.ISSUE_URL}"
echo "Issue Number: ${env.ISSUE_NUMBER}"
echo "Repository Owner: ${env.REPO_OWNER}"
echo "Repository Name: ${env.REPO_NAME}"
echo "Branch Name: ${params.BRANCH_NAME ?: '(auto-generated)'}"
echo "Base Branch: ${params.BASE_BRANCH ?: '(current branch)'}" // 追加
echo "Agent Mode: ${params.AGENT_MODE}"
```

## 動作仕様

### CLI 使用例

```bash
# デフォルト（現在のブランチから分岐）
node dist/index.js init --issue-url https://github.com/tielec/my-project/issues/123

# main ブランチから分岐
node dist/index.js init \
  --issue-url https://github.com/tielec/my-project/issues/123 \
  --base-branch main

# develop ブランチから分岐
node dist/index.js init \
  --issue-url https://github.com/tielec/my-project/issues/123 \
  --base-branch develop

# カスタムブランチ名 + ベースブランチ指定
node dist/index.js init \
  --issue-url https://github.com/tielec/my-project/issues/123 \
  --branch feature/my-custom-branch \
  --base-branch develop
```

### Jenkins パラメータ例

```groovy
ISSUE_URL: "https://github.com/tielec/my-project/issues/123"
BRANCH_NAME: ""  // 空欄（自動生成: ai-workflow/issue-123）
BASE_BRANCH: "main"  // main ブランチから分岐
AGENT_MODE: "auto"
```

### 動作フロー

#### 新規ブランチ作成時

```
1. リモートブランチの存在確認
   - ✅ 存在する → チェックアウト & pull（BASE_BRANCH は無視）
   - ❌ 存在しない → 次へ

2. ローカルブランチの存在確認
   - ✅ 存在する → チェックアウト（BASE_BRANCH は無視）
   - ❌ 存在しない → 次へ

3. BASE_BRANCH の処理
   - ✅ 指定あり → git checkout <BASE_BRANCH>
   - ❌ 指定なし → 現在のブランチを維持

4. 新規ブランチ作成
   - git checkout -b <BRANCH_NAME>
```

#### 既存ブランチへの切り替え時

リモートまたはローカルブランチが既に存在する場合、`BASE_BRANCH` パラメータは無視されます。

```
# リモートブランチが存在する場合
git checkout ai-workflow/issue-123
git pull origin ai-workflow/issue-123

# BASE_BRANCH パラメータは無視（既存ブランチを維持）
```

## 期待される効果

### 再現性の向上

- Jenkins ジョブで常に同じベースブランチから分岐できる
- CI/CD パイプラインでの動作が予測可能になる

### ブランチ戦略のサポート

- **main ブランチ運用**: 本番環境向けの修正は main から分岐
- **develop ブランチ運用**: 開発環境向けの機能追加は develop から分岐
- **Git Flow**: feature ブランチを develop から、hotfix ブランチを main から分岐

### 後方互換性

- `--base-branch` オプション未指定時: 従来動作を維持（現在のブランチから分岐）
- 既存のワークフロー、スクリプトに影響なし

## テスト計画

### ユニットテスト

1. **`init.ts` のテスト**:
   - `baseBranch` 指定時に正しくベースブランチから分岐することを確認
   - `baseBranch` 未指定時に現在のブランチから分岐することを確認
   - リモートブランチが存在する場合、`baseBranch` が無視されることを確認

### 統合テスト

1. **main ブランチから分岐**:
   ```bash
   # main ブランチにチェックアウト
   git checkout main

   # init コマンド実行
   node dist/index.js init \
     --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 \
     --base-branch main

   # 新規ブランチが main から分岐していることを確認
   git log --oneline --graph --all
   ```

2. **develop ブランチから分岐**:
   ```bash
   # 現在のブランチは無関係（例: main）
   git checkout main

   # init コマンド実行（develop から分岐）
   node dist/index.js init \
     --issue-url https://github.com/tielec/ai-workflow-agent/issues/999 \
     --base-branch develop

   # 新規ブランチが develop から分岐していることを確認
   git log --oneline --graph --all
   ```

3. **既存ブランチへの切り替え**:
   ```bash
   # 既存のリモートブランチをチェックアウト
   node dist/index.js init \
     --issue-url https://github.com/tielec/ai-workflow-agent/issues/383 \
     --base-branch main

   # BASE_BRANCH が無視され、既存ブランチがチェックアウトされることを確認
   git branch --show-current
   # 期待値: ai-workflow/issue-383 または fix/codex-error-raw-logging-326
   ```

4. **Jenkins 統合テスト**:
   ```groovy
   // Jenkins パラメータ
   ISSUE_URL: "https://github.com/tielec/ai-workflow-agent/issues/999"
   BASE_BRANCH: "develop"

   // ビルド実行後、コンソールログで以下を確認
   [INFO] Branching from: develop
   [INFO] Created and switched to new branch: ai-workflow/issue-999
   ```

## 実装チェックリスト

### CLI 実装

- [ ] `src/main.ts` に `--base-branch` オプションを追加
- [ ] `src/commands/init.ts` の `handleInitCommand()` に `baseBranch` パラメータを追加
- [ ] 新規ブランチ作成時に `baseBranch` を使用（`git.checkout(baseBranch)` → `git.checkoutLocalBranch(branchName)`）
- [ ] ログ出力を追加（`Branching from: <baseBranch>` または `Branching from: current branch`）

### Jenkins 実装

#### Job DSL（3ファイル）

- [ ] `ai_workflow_all_phases_job.groovy` に `BASE_BRANCH` パラメータを追加
- [ ] `ai_workflow_preset_job.groovy` に `BASE_BRANCH` パラメータを追加
- [ ] `ai_workflow_single_phase_job.groovy` に `BASE_BRANCH` パラメータを追加
- [ ] パラメータ数コメントを更新（21個 → 22個）

#### Jenkinsfile（3ファイル）

- [ ] `all-phases/Jenkinsfile` の `Initialize Workflow` ステージに `--base-branch` オプションを追加
- [ ] `preset/Jenkinsfile` の `Initialize Workflow` ステージに `--base-branch` オプションを追加
- [ ] `single-phase/Jenkinsfile` の `Initialize Workflow` ステージに `--base-branch` オプションを追加
- [ ] `Validate Parameters` ステージに `BASE_BRANCH` のログ出力を追加

### テスト

- [ ] ユニットテスト追加（`init.test.ts`）
- [ ] 統合テスト実施（4シナリオ）
- [ ] Jenkins 統合テスト実施

### ドキュメント

- [ ] CLAUDE.md に `--base-branch` オプションの説明を追加
- [ ] README.md の Jenkins パラメータ例を更新

## 関連Issue

なし（新規機能）

## 後方互換性

### 影響なし

- `--base-branch` オプション未指定時: 従来動作を維持（現在のブランチから分岐）
- 既存のワークフロー、スクリプトに影響なし
- Jenkins Job DSL の既存パラメータに影響なし

### 動作変更

なし（完全な後方互換性を維持）

## 成功基準

- ✅ `--base-branch main` 指定時、main ブランチから新規ブランチが作成される
- ✅ `--base-branch develop` 指定時、develop ブランチから新規ブランチが作成される
- ✅ `--base-branch` 未指定時、現在のブランチから新規ブランチが作成される（従来動作）
- ✅ リモートブランチが存在する場合、`--base-branch` が無視される
- ✅ Jenkins パラメータ `BASE_BRANCH` が正しく `init` コマンドに渡される
- ✅ ユニットテストカバレッジ 80% 以上
- ✅ 統合テスト 4シナリオすべて成功
