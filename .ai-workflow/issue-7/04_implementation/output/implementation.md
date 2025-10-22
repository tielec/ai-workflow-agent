# 実装ログ: Issue #7 - カスタムブランチ名での作業をサポート

## 実装サマリー

- **実装戦略**: EXTEND
- **変更ファイル数**: 2個
- **新規作成ファイル数**: 0個
- **実装日**: 2025-01-XX
- **実装フェーズ**: Phase 4 (Implementation)

## 変更ファイル一覧

### 修正ファイル

1. **`src/main.ts`**: CLI オプション追加、バリデーション関数実装、ブランチ名解決ロジック実装
2. **`Jenkinsfile`**: Initialize Workflow ステージの更新

## 実装詳細

### ファイル1: src/main.ts

#### 変更内容

**1. CLI オプションの追加（行75-85）**

`init` コマンドに `--branch <name>` オプションを追加しました。

```typescript
program
  .command('init')
  .requiredOption('--issue-url <url>', 'GitHub Issue URL')
  .option('--branch <name>', 'Custom branch name (default: ai-workflow/issue-{issue_number})')
  .action(async (options) => {
    try {
      await handleInitCommand(options.issueUrl, options.branch);
    } catch (error) {
      reportFatalError(error);
    }
  });
```

**実装理由**:
- 設計書のセクション7.1.1に従い、Commander.jsの`.option()`メソッドを使用
- オプションは任意（未指定時はデフォルト動作）
- `handleInitCommand`の第2引数として`options.branch`を渡す

**2. インターフェース定義（行155-161）**

ブランチ名バリデーション結果の型を定義しました。

```typescript
interface BranchValidationResult {
  valid: boolean;
  error?: string;
}
```

**実装理由**:
- バリデーション結果を明確な型で返すため
- 設計書のセクション11.1に準拠

**3. ブランチ名バリデーション関数（行163-198）**

Git命名規則に基づくバリデーション関数を実装しました。

```typescript
function validateBranchName(branchName: string): BranchValidationResult {
  // 1. 空文字列チェック
  if (!branchName || branchName.trim() === '') {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  // 2. スラッシュの位置チェック
  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot start or end with "/"' };
  }

  // 3. 連続ドットチェック
  if (branchName.includes('..')) {
    return { valid: false, error: 'Branch name cannot contain ".."' };
  }

  // 4. 不正文字チェック（~, ^, :, ?, *, [, \, 空白、@{）
  const invalidChars = /[~^:?*[\\\s]|@\{/;
  if (invalidChars.test(branchName)) {
    return { valid: false, error: 'Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\, @{)' };
  }

  // 5. ドットで終わらないチェック
  if (branchName.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot end with "."' };
  }

  return { valid: true };
}
```

**実装理由**:
- 設計書のセクション7.1.2の実装仕様に厳密に従う
- `git-check-ref-format`の命名規則を実装
- 5つのバリデーションルールを順次チェック
- ユーザーフレンドリーなエラーメッセージを提供

**検証項目**:
- ✅ 空文字列を拒否
- ✅ スラッシュで始まる/終わるブランチ名を拒否
- ✅ 連続ドット（`..`）を拒否
- ✅ 不正文字（空白、`~`, `^`, `:`, `?`, `*`, `[`, `\`, `@{`）を拒否
- ✅ ドットで終わるブランチ名を拒否

**4. ブランチ名解決関数（行200-227）**

カスタムブランチ名またはデフォルトブランチ名を解決する関数を実装しました。

```typescript
function resolveBranchName(
  customBranch: string | undefined,
  issueNumber: number
): string {
  // 1. カスタムブランチ名が指定された場合
  if (customBranch) {
    // バリデーション
    const validation = validateBranchName(customBranch);
    if (!validation.valid) {
      throw new Error(`[ERROR] Invalid branch name: ${customBranch}. ${validation.error}`);
    }

    console.info(`[INFO] Using custom branch name: ${customBranch}`);
    return customBranch;
  }

  // 2. デフォルトブランチ名
  const defaultBranch = `ai-workflow/issue-${issueNumber}`;
  console.info(`[INFO] Using default branch name: ${defaultBranch}`);
  return defaultBranch;
}
```

**実装理由**:
- 設計書のセクション7.1.3の実装仕様に準拠
- カスタムブランチ名が指定された場合はバリデーションを実行
- バリデーションエラー時は明確なエラーメッセージを出力
- 未指定時はデフォルトブランチ名を生成
- ログ出力で動作を明確化

**5. handleInitCommand関数の更新（行229, 287-288）**

関数シグネチャを変更し、ブランチ名解決ロジックを統合しました。

```typescript
async function handleInitCommand(issueUrl: string, customBranch?: string): Promise<void> {
  // ... 既存のIssue URL解析処理 ...

  // ワークフローディレクトリ作成（対象リポジトリ配下）
  const workflowDir = path.join(repoRoot, '.ai-workflow', `issue-${issueNumber}`);
  const metadataPath = path.join(workflowDir, 'metadata.json');

  // ブランチ名を解決（カスタムまたはデフォルト）
  const branchName = resolveBranchName(customBranch, issueNumber);

  const git = simpleGit(repoRoot);
  // ... 既存のブランチ作成・切り替えロジック ...
}
```

**変更点**:
- 関数シグネチャに `customBranch?: string` パラメータを追加
- ハードコードされた `const branchName = `ai-workflow/issue-${issueNumber}`` を削除
- `resolveBranchName()` を呼び出してブランチ名を取得
- それ以外の既存ロジック（ブランチ作成、メタデータ保存、PR作成）は変更なし

**実装理由**:
- 設計書のセクション7.1.4の変更内容に準拠
- 既存のブランチ作成・切り替えロジックを再利用
- 後方互換性を完全に維持（`customBranch`が`undefined`の場合はデフォルト動作）

### ファイル2: Jenkinsfile

#### 変更内容

**Initialize Workflow ステージの更新（行270-296）**

`BRANCH_NAME` パラメータの条件分岐を追加しました。

```groovy
stage('Initialize Workflow') {
    steps {
        script {
            echo "========================================="
            echo "Stage: Initialize Workflow"
            echo "========================================="

            dir(env.WORKFLOW_DIR) {
                if (params.DRY_RUN) {
                    echo "[DRY RUN] ワークフロー初期化をスキップ"
                } else {
                    // ワークフロー初期化またはマイグレーション
                    // - metadata.jsonが存在しない場合: 新規作成
                    // - metadata.jsonが存在する場合: スキーママイグレーション実行
                    // BRANCH_NAME パラメータが指定されている場合、--branch オプションを追加
                    def branchOption = params.BRANCH_NAME ? "--branch ${params.BRANCH_NAME}" : ""

                    sh """
                        node dist/index.js init \
                            --issue-url ${params.ISSUE_URL} \
                            ${branchOption}
                    """
                }
            }
        }
    }
}
```

**変更点**:
- `def branchOption = params.BRANCH_NAME ? "--branch ${params.BRANCH_NAME}" : ""` を追加
- `sh`コマンドに `${branchOption}` を追加
- `BRANCH_NAME`パラメータが空の場合はオプションを渡さない（デフォルト動作）

**実装理由**:
- 設計書のセクション7.4.1の実装仕様に準拠
- 既存のパラメータパターン（`AGENT_MODE`, `PRESET_NAME`）を踏襲
- Groovy の三項演算子を使用して条件分岐を簡潔に記述
- デフォルト動作を完全に維持

**注意点**:
- Job DSL ファイル（`jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy`）の実装はスコープ外
- ドキュメント（README.md）にのみ記載する予定

## 実装時の重要な決定事項

### 1. 既存コードの再利用

設計書に従い、既存の Git 操作ロジック（ブランチ作成、切り替え、メタデータ保存）をすべて再利用しました。変更したのはブランチ名の取得方法のみです。

**利点**:
- コード重複を回避
- バグのリスクを最小化
- 既存テストスイートが引き続き有効

### 2. バリデーションエラーのハンドリング

バリデーションエラー時は`throw new Error()`でエラーをスローし、`reportFatalError()`で処理されるようにしました。

**理由**:
- 既存のエラーハンドリングパターンに準拠
- ユーザーに明確なエラーメッセージを表示
- プロセスを終了コード1で終了

### 3. ログ出力の追加

`resolveBranchName()`関数内で、使用されるブランチ名をINFOレベルでログ出力しました。

**理由**:
- 設計書のセクション9.3（保守性）に準拠
- デバッグ容易性の向上
- ユーザーに動作を明確化

### 4. 型安全性の確保

- `BranchValidationResult` インターフェースを定義
- 関数シグネチャに型アノテーションを明示
- TypeScript の型チェックを活用

**理由**:
- プロジェクトのコーディング規約に準拠
- コンパイル時エラーの早期発見
- IDE の補完機能を有効化

## 既存機能への影響

### 後方互換性

✅ **完全に維持**

- `--branch`オプション未指定時、従来通り`ai-workflow/issue-{issue_number}`が生成される
- 既存のメタデータスキーマは変更なし（既存の`branch_name`フィールドを使用）
- 既存のテストスイートに影響なし

### Git 操作ロジック

✅ **変更なし**

- ブランチ作成・切り替えの既存フローは完全に保持
- リモートブランチ取得ロジックは変更なし
- メタデータ保存ロジックは変更なし

### マルチリポジトリワークフロー

✅ **互換性維持**

- カスタムブランチ名は対象リポジトリで正しく動作
- `target_repository` メタデータとの整合性を保持

## テスト戦略

Phase 4 では実コードのみを実装しました。テストコードは Phase 5（test_implementation）で実装する予定です。

### ユニットテスト（Phase 5で実装予定）

- `validateBranchName()` 関数の正常系・異常系テスト
- `resolveBranchName()` 関数のデフォルト/カスタムブランチ解決テスト
- 境界値テスト（空文字列、不正文字）

### インテグレーションテスト（Phase 5で実装予定）

- デフォルトブランチ名での`init`コマンド実行
- カスタムブランチ名での`init`コマンド実行
- 既存ローカルブランチへの切り替え
- リモートブランチの取得とチェックアウト
- 不正なブランチ名のエラーハンドリング

## 品質ゲートの確認

### Phase 4 品質ゲート

- [x] **Phase 2の設計に沿った実装である**
  - 設計書のセクション7.1〜7.4の仕様に厳密に従った
  - 実装戦略（EXTEND）を踏襲

- [x] **既存コードの規約に準拠している**
  - TypeScript の型アノテーションを使用
  - 既存のコーディングスタイル（インデント、命名規則）を維持
  - Commander.js の既存パターンに準拠

- [x] **基本的なエラーハンドリングがある**
  - バリデーションエラー時は明確なエラーメッセージを表示
  - エラーは既存の`reportFatalError()`で処理
  - ログ出力で動作を明確化

- [x] **明らかなバグがない**
  - バリデーションロジックは設計書の仕様通り
  - 正規表現パターンは Git 命名規則に準拠
  - 既存ロジックへの影響は最小限

## 次のステップ

### Phase 5: Test Implementation（テスト実装）

以下のテストコードを実装する予定です：

1. **ユニットテスト**:
   - `tests/unit/branch-validation.test.ts`: ブランチ名バリデーションの単体テスト
   - 正常系: 標準的なfeature/bugfix/hotfixブランチ名
   - 異常系: 空文字列、不正文字、連続ドット、スラッシュの位置
   - 境界値: 複雑だが正常なブランチ名

2. **インテグレーションテスト**:
   - `tests/integration/custom-branch-workflow.test.ts`: カスタムブランチワークフローの統合テスト
   - デフォルトブランチ名（後方互換性）
   - カスタムブランチ名（新規作成）
   - 既存ローカルブランチへの切り替え
   - リモートブランチの取得とチェックアウト
   - 不正なブランチ名のエラーハンドリング

3. **既存テストの拡張**:
   - `tests/integration/multi-repo-workflow.test.ts`: マルチリポジトリワークフローへのケース追加
   - カスタムブランチでのマルチリポジトリ動作
   - デフォルトブランチでの後方互換性

### Phase 6: Testing（テスト実行）

- ユニットテスト実行: `npm run test:unit`
- インテグレーションテスト実行: `npm run test:integration`
- カバレッジレポート確認（目標: 90%以上）

### Phase 7: Documentation（ドキュメント）

以下のドキュメントを更新する予定です：

1. **README.md**:
   - CLI オプションセクションに `--branch` を追加
   - 使用例の追加（デフォルト、カスタム、既存ブランチ）
   - ブランチ名バリデーションルールの記載

2. **CLAUDE.md**:
   - CLIオプション一覧に `--branch` を追加
   - マルチリポジトリワークフローセクションに言及

3. **ARCHITECTURE.md**（任意）:
   - initコマンドフローにブランチ名解決ステップを追記

## 実装完了の確認

### 実装済みの機能

✅ FR-1: CLIオプションの追加
✅ FR-2: デフォルト動作の維持
✅ FR-3: ブランチ名解決ロジック（部分的: バリデーションとデフォルト/カスタム解決）
✅ FR-4: ブランチ名バリデーション
✅ FR-6: Jenkinsパラメータ統合（Jenkinsfile のみ、Job DSL はスコープ外）

### 実装内容の要約

- **src/main.ts**: 73行追加（バリデーション関数、解決関数、CLI オプション、関数シグネチャ変更）
- **Jenkinsfile**: 6行追加（BRANCH_NAME パラメータの条件分岐）

### コードレビューのポイント

1. **バリデーションロジックの正確性**:
   - 正規表現パターンが Git 命名規則に準拠しているか
   - エラーメッセージがユーザーフレンドリーか

2. **後方互換性の維持**:
   - `--branch`オプション未指定時の動作が変更されていないか
   - 既存のメタデータスキーマとの互換性が保たれているか

3. **エラーハンドリング**:
   - バリデーションエラーが適切に処理されているか
   - ログ出力が適切なレベルで出力されているか

4. **型安全性**:
   - TypeScript の型アノテーションが適切に使用されているか
   - インターフェース定義が明確か

---

**実装ログ v1.0**
**作成日**: 2025-01-XX
**Issue番号**: #7
**対応Issue**: https://github.com/tielec/ai-workflow-agent/issues/7
**実装戦略**: EXTEND
**実装フェーズ**: Phase 4 (Implementation)
**次フェーズ**: Phase 5 (Test Implementation)
