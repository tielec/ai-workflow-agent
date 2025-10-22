# テストシナリオ: Issue #7 - カスタムブランチ名での作業をサポート

## 0. Planning Documentの確認

本テストシナリオは、Planning Phase（Phase 0）の計画書、要件定義書（Phase 1）、詳細設計書（Phase 2）の内容を踏まえて作成されています。

### テスト戦略: UNIT_INTEGRATION

**ユニットテスト**:
- ブランチ名バリデーションロジックの単体テスト
- CLIオプション解析ロジックの単体テスト
- 外部依存なしで独立してテスト可能

**インテグレーションテスト**:
- Git操作統合テスト
- CLIコマンド全体フロー検証
- メタデータとGit状態の整合性確認
- リモートブランチ取得のシナリオ検証

### テストコード戦略: BOTH_TEST
- **CREATE_TEST**: 新規テストファイル（`tests/unit/branch-validation.test.ts`, `tests/integration/custom-branch-workflow.test.ts`）
- **EXTEND_TEST**: 既存テストファイルへのケース追加（`tests/integration/multi-repo-workflow.test.ts`）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION** - ユニットテストとインテグレーションテストの組み合わせ

### テスト対象の範囲

#### ユニットテスト対象
1. **ブランチ名バリデーション関数** (`validateBranchName()`)
   - Git命名規則チェック
   - 正常系・異常系・境界値テスト
   - 純粋関数のため外部依存なし

2. **ブランチ名解決ロジック** (`resolveBranchName()`)
   - デフォルトブランチ名生成
   - カスタムブランチ名検証
   - バリデーション統合

#### インテグレーションテスト対象
1. **CLIコマンド全体フロー**
   - `init`コマンドのエンドツーエンド実行
   - CLIオプション解析からGit操作完了まで

2. **Git操作統合**
   - ブランチ作成・切り替え・取得
   - ローカル/リモートブランチの存在チェック
   - メタデータとGit状態の整合性

3. **後方互換性**
   - デフォルトブランチ生成の動作維持
   - 既存テストスイートの成功

### テストの目的

1. **機能正確性の保証**: 受け入れ基準（AC-1〜AC-7）の完全達成
2. **後方互換性の検証**: 既存ユーザーの動作に影響を与えないことの確認
3. **エラーハンドリングの検証**: 不正なブランチ名、Git操作エラーの適切な処理
4. **コード品質の維持**: カバレッジ ≥ 90%、リグレッションなし

---

## 2. ユニットテストシナリオ

### 2.1 ブランチ名バリデーション関数 (`validateBranchName()`)

#### テストファイル
`tests/unit/branch-validation.test.ts` (新規作成)

---

#### テストケース 2.1.1: 正常系 - 標準的なfeatureブランチ名

**目的**: 標準的なfeatureブランチ名が受け入れられることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "feature/add-logging"
```

**期待結果**:
```typescript
{
  valid: true,
  error: undefined
}
```

**テストデータ**:
- `"feature/add-logging"`
- `"bugfix/issue-123"`
- `"hotfix/security-patch"`
- `"feature/add-aws-credentials-support"`

**検証項目**:
- [ ] `valid`フィールドが`true`である
- [ ] `error`フィールドが`undefined`である

---

#### テストケース 2.1.2: 異常系 - 空文字列

**目的**: 空文字列が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = ""
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot be empty"
}
```

**テストデータ**:
- `""`
- `"   "` (空白のみ)

**検証項目**:
- [ ] `valid`フィールドが`false`である
- [ ] `error`フィールドが`"Branch name cannot be empty"`である

---

#### テストケース 2.1.3: 異常系 - スラッシュで始まる/終わる

**目的**: スラッシュで始まる/終わるブランチ名が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "/feature"
// または
branchName = "feature/"
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot start or end with \"/\""
}
```

**テストデータ**:
- `"/feature"`
- `"feature/"`
- `"/feature/"`

**検証項目**:
- [ ] `valid`フィールドが`false`である
- [ ] エラーメッセージが正しい

---

#### テストケース 2.1.4: 異常系 - 連続ドット

**目的**: 連続ドット(`..`)を含むブランチ名が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "feature/.."
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot contain \"..\""
}
```

**テストデータ**:
- `"feature/.."`
- `"../feature"`
- `"feature/../test"`

**検証項目**:
- [ ] `valid`フィールドが`false`である
- [ ] エラーメッセージが正しい

---

#### テストケース 2.1.5: 異常系 - 不正文字（空白）

**目的**: 空白を含むブランチ名が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "invalid branch name"
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\, @{)"
}
```

**テストデータ**:
- `"invalid branch name"`
- `"feature/with space"`

**検証項目**:
- [ ] `valid`フィールドが`false`である
- [ ] エラーメッセージに"invalid characters"が含まれる

---

#### テストケース 2.1.6: 異常系 - 不正文字（~, ^, :, ?, *, [, \, @{）

**目的**: Git禁止文字を含むブランチ名が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "~test"
// または他の禁止文字
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name contains invalid characters (spaces, ~, ^, :, ?, *, [, \\, @{)"
}
```

**テストデータ**:
| 入力 | 禁止文字 |
|------|---------|
| `"~test"` | `~` |
| `"test^123"` | `^` |
| `"test:branch"` | `:` |
| `"test?branch"` | `?` |
| `"test*branch"` | `*` |
| `"test[branch"` | `[` |
| `"test\\branch"` | `\` |
| `"feature@{123}"` | `@{` |

**検証項目**:
- [ ] 各禁止文字に対して`valid`が`false`である
- [ ] エラーメッセージが正しい

---

#### テストケース 2.1.7: 異常系 - ドットで終わる

**目的**: ドットで終わるブランチ名が拒否されることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "feature."
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot end with \".\""
}
```

**テストデータ**:
- `"feature."`
- `"test/branch."`

**検証項目**:
- [ ] `valid`フィールドが`false`である
- [ ] エラーメッセージが正しい

---

#### テストケース 2.1.8: 境界値 - 複雑な正常ブランチ名

**目的**: 複雑だが正常なブランチ名が受け入れられることを検証

**前提条件**: なし（純粋関数）

**入力**:
```typescript
branchName = "feature/add-aws-credentials-support"
```

**期待結果**:
```typescript
{
  valid: true,
  error: undefined
}
```

**テストデータ**:
- `"feature/add-aws-credentials-support"`
- `"bugfix/fix-login-issue-with-oauth"`
- `"hotfix/2024-01-15-security-patch"`
- `"feature/implement-api-v2.0"`

**検証項目**:
- [ ] `valid`フィールドが`true`である
- [ ] 複数階層のスラッシュが許可される
- [ ] ハイフン、ドット（末尾以外）が許可される

---

### 2.2 ブランチ名解決ロジック (`resolveBranchName()`)

#### テストファイル
`tests/unit/branch-validation.test.ts` (2.1と同じファイルに追加)

---

#### テストケース 2.2.1: 正常系 - カスタムブランチ名指定

**目的**: カスタムブランチ名が正しく解決されることを検証

**前提条件**:
- GitManagerのモックが準備されている

**入力**:
```typescript
customBranch = "feature/custom-branch"
issueNumber = 123
gitManager = mockGitManager
```

**期待結果**:
```typescript
resolvedBranchName = "feature/custom-branch"
```

**テストデータ**:
- カスタムブランチ名: `"feature/custom-branch"`
- Issue番号: `123`

**検証項目**:
- [ ] 返り値が`"feature/custom-branch"`である
- [ ] デフォルトブランチ名生成ロジックが呼ばれない
- [ ] コンソールに`"[INFO] Using custom branch name: feature/custom-branch"`が出力される

---

#### テストケース 2.2.2: 正常系 - デフォルトブランチ名生成

**目的**: カスタムブランチ名未指定時、デフォルトブランチ名が生成されることを検証

**前提条件**:
- GitManagerのモックが準備されている

**入力**:
```typescript
customBranch = undefined
issueNumber = 123
gitManager = mockGitManager
```

**期待結果**:
```typescript
resolvedBranchName = "ai-workflow/issue-123"
```

**テストデータ**:
- カスタムブランチ名: `undefined`
- Issue番号: `123`

**検証項目**:
- [ ] 返り値が`"ai-workflow/issue-123"`である
- [ ] コンソールに`"[INFO] Using default branch name: ai-workflow/issue-123"`が出力される

---

#### テストケース 2.2.3: 異常系 - 不正なカスタムブランチ名

**目的**: 不正なカスタムブランチ名がエラーとして処理されることを検証

**前提条件**:
- GitManagerのモックが準備されている

**入力**:
```typescript
customBranch = "invalid branch name"
issueNumber = 123
gitManager = mockGitManager
```

**期待結果**:
```typescript
throw new Error("[ERROR] Invalid branch name: invalid branch name. Branch name contains invalid characters ...")
```

**テストデータ**:
- カスタムブランチ名: `"invalid branch name"`
- Issue番号: `123`

**検証項目**:
- [ ] エラーがスローされる
- [ ] エラーメッセージに`"[ERROR] Invalid branch name:"`が含まれる
- [ ] エラーメッセージにバリデーションエラー内容が含まれる

---

## 3. インテグレーションテストシナリオ

### 3.1 CLIコマンド全体フロー

#### テストファイル
`tests/integration/custom-branch-workflow.test.ts` (新規作成)

---

#### シナリオ 3.1.1: デフォルトブランチ名（後方互換性）

**目的**: `--branch`オプション未指定時、従来通りデフォルトブランチが作成されることを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- 現在のブランチが`main`である
- `ai-workflow/issue-123`ブランチが存在しない

**テスト手順**:
1. テスト用Gitリポジトリを作成
2. `ai-workflow-v2 init --issue-url https://github.com/test/repo/issues/123`を実行（`--branch`オプションなし）
3. 現在のブランチを確認
4. `metadata.json`の`branch_name`フィールドを確認

**期待結果**:
- `git branch --show-current`の出力が`ai-workflow/issue-123`である
- `metadata.json`の`branch_name`フィールドが`"ai-workflow/issue-123"`である
- コンソールに`"[INFO] Using default branch name: ai-workflow/issue-123"`が表示される
- コンソールに`"[INFO] Created and switched to new branch: ai-workflow/issue-123"`が表示される

**確認項目**:
- [ ] ブランチ名が`ai-workflow/issue-123`である
- [ ] メタデータが正しく保存されている
- [ ] ログメッセージが正しい
- [ ] 既存機能の動作が変更されていない

**テストコード例**:
```typescript
test('should create workflow with default branch', async () => {
  // テスト用リポジトリセットアップ
  const testRepoPath = setupTestRepo();

  // CLI実行: --branch オプションなし
  execSync(
    `node dist/index.js init --issue-url https://github.com/test/repo/issues/123`,
    { cwd: testRepoPath }
  );

  // 検証: ブランチが作成されたか
  const git = simpleGit(testRepoPath);
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  expect(currentBranch.trim()).toBe('ai-workflow/issue-123');

  // 検証: metadata.json の branch_name フィールド
  const metadataPath = path.join(testRepoPath, '.ai-workflow', 'issue-123', 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  expect(metadata.branch_name).toBe('ai-workflow/issue-123');
});
```

---

#### シナリオ 3.1.2: カスタムブランチ名（新規作成）

**目的**: カスタムブランチ名を指定して新規ブランチを作成できることを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- 現在のブランチが`main`である
- `feature/add-logging`ブランチが存在しない（ローカル・リモート共に）

**テスト手順**:
1. テスト用Gitリポジトリを作成
2. `ai-workflow-v2 init --issue-url https://github.com/test/repo/issues/123 --branch feature/add-logging`を実行
3. 現在のブランチを確認
4. `metadata.json`の`branch_name`フィールドを確認
5. ログメッセージを確認

**期待結果**:
- `git branch --show-current`の出力が`feature/add-logging`である
- `metadata.json`の`branch_name`フィールドが`"feature/add-logging"`である
- コンソールに`"[INFO] Using custom branch name: feature/add-logging"`が表示される
- コンソールに`"[INFO] Created and switched to new branch: feature/add-logging"`が表示される

**確認項目**:
- [ ] 新規ブランチ`feature/add-logging`が作成された
- [ ] 現在のブランチが`feature/add-logging`である
- [ ] メタデータに正しいブランチ名が保存されている
- [ ] ログメッセージが正しい

**テストコード例**:
```typescript
test('should create workflow with custom branch', async () => {
  const testRepoPath = setupTestRepo();

  // CLI実行: --branch オプションあり
  execSync(
    `node dist/index.js init --issue-url https://github.com/test/repo/issues/123 --branch feature/add-logging`,
    { cwd: testRepoPath }
  );

  // 検証: カスタムブランチが作成されたか
  const git = simpleGit(testRepoPath);
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  expect(currentBranch.trim()).toBe('feature/add-logging');

  // 検証: metadata.json の branch_name フィールド
  const metadataPath = path.join(testRepoPath, '.ai-workflow', 'issue-123', 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  expect(metadata.branch_name).toBe('feature/add-logging');
});
```

---

#### シナリオ 3.1.3: 既存ローカルブランチへの切り替え

**目的**: 既存のローカルブランチに正常に切り替わることを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- `feature/existing-work`ブランチが既に存在する
- 現在のブランチが`main`である

**テスト手順**:
1. テスト用Gitリポジトリを作成
2. `git checkout -b feature/existing-work`で既存ブランチを作成
3. `git checkout main`でmainブランチに戻る
4. `ai-workflow-v2 init --issue-url https://github.com/test/repo/issues/123 --branch feature/existing-work`を実行
5. 現在のブランチを確認
6. ブランチ数を確認（新規ブランチが作成されていないこと）

**期待結果**:
- `git branch --show-current`の出力が`feature/existing-work`である
- 新しいブランチは作成されない（ブランチリストに重複なし）
- コンソールに`"[INFO] Switched to existing branch: feature/existing-work"`が表示される
- `metadata.json`の`branch_name`フィールドが`"feature/existing-work"`である

**確認項目**:
- [ ] 既存ブランチにチェックアウトした
- [ ] 新規ブランチが作成されていない
- [ ] ログメッセージが正しい（"Switched to existing branch"）
- [ ] メタデータが正しく保存されている

**テストコード例**:
```typescript
test('should switch to existing local branch', async () => {
  const testRepoPath = setupTestRepo();
  const git = simpleGit(testRepoPath);

  // 事前準備: 既存ブランチ作成
  await git.checkoutLocalBranch('feature/existing-work');
  await git.checkout('main');

  // CLI実行: 既存ブランチ指定
  execSync(
    `node dist/index.js init --issue-url https://github.com/test/repo/issues/123 --branch feature/existing-work`,
    { cwd: testRepoPath }
  );

  // 検証: 既存ブランチにチェックアウトされたか
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  expect(currentBranch.trim()).toBe('feature/existing-work');

  // 検証: 新規ブランチが作成されていないこと
  const branches = await git.branchLocal();
  const existingWorkBranches = branches.all.filter(b => b.includes('feature/existing-work'));
  expect(existingWorkBranches.length).toBe(1);
});
```

---

#### シナリオ 3.1.4: リモートブランチの取得とチェックアウト

**目的**: リモートブランチが存在し、ローカルには存在しない場合、fetch & checkoutが動作することを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- リモートリポジトリが設定されている
- `origin/feature/remote-only`ブランチが存在する
- ローカルには`feature/remote-only`が存在しない

**テスト手順**:
1. テスト用Gitリポジトリを作成（リモート付き）
2. リモートに`feature/remote-only`ブランチを作成（ローカルには作成しない）
3. `ai-workflow-v2 init --issue-url https://github.com/test/repo/issues/123 --branch feature/remote-only`を実行
4. `git fetch`が実行されたことを確認
5. ローカルブランチ`feature/remote-only`が作成され、`origin/feature/remote-only`をトラッキングしていることを確認

**期待結果**:
- `git branch --show-current`の出力が`feature/remote-only`である
- ローカルブランチ`feature/remote-only`が作成され、`origin/feature/remote-only`をトラッキングしている
- コンソールに`"[INFO] Created local branch 'feature/remote-only' tracking origin/feature/remote-only"`が表示される
- `metadata.json`の`branch_name`フィールドが`"feature/remote-only"`である

**確認項目**:
- [ ] `git fetch`が実行された
- [ ] ローカルブランチが作成された
- [ ] トラッキング設定が正しい
- [ ] ログメッセージが正しい
- [ ] メタデータが正しく保存されている

**テストコード例**:
```typescript
test('should fetch and checkout remote branch', async () => {
  const testRepoPath = setupTestRepoWithRemote();
  const git = simpleGit(testRepoPath);

  // 事前準備: リモートブランチ作成（ローカルには作成しない）
  await createRemoteBranchOnly('feature/remote-only');

  // CLI実行: リモートブランチ指定
  execSync(
    `node dist/index.js init --issue-url https://github.com/test/repo/issues/123 --branch feature/remote-only`,
    { cwd: testRepoPath }
  );

  // 検証: ローカルブランチが作成されたか
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  expect(currentBranch.trim()).toBe('feature/remote-only');

  // 検証: トラッキング設定が正しいか
  const trackingBranch = await git.revparse(['--abbrev-ref', 'feature/remote-only@{upstream}']);
  expect(trackingBranch.trim()).toBe('origin/feature/remote-only');
});
```

---

#### シナリオ 3.1.5: 不正なブランチ名のエラーハンドリング

**目的**: 不正なブランチ名を指定した場合、適切なエラーメッセージが表示され、ブランチが作成されないことを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- 現在のブランチが`main`である

**テスト手順**:
1. テスト用Gitリポジトリを作成
2. `ai-workflow-v2 init --issue-url https://github.com/test/repo/issues/123 --branch "invalid branch name"`を実行
3. エラーメッセージを確認
4. ブランチが作成されていないことを確認
5. `metadata.json`が作成されていないことを確認

**期待結果**:
- コマンドがエラーで終了する（終了コード1）
- エラーメッセージ`"[ERROR] Invalid branch name: invalid branch name. Branch name contains invalid characters ..."`が表示される
- `invalid branch name`ブランチは作成されない
- `metadata.json`は作成されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] エラーメッセージにバリデーションエラー内容が含まれる
- [ ] ブランチが作成されていない
- [ ] メタデータが作成されていない
- [ ] プロセスが終了コード1で終了する

**テストコード例**:
```typescript
test('should reject invalid branch name', () => {
  const testRepoPath = setupTestRepo();

  // CLI実行: 不正なブランチ名
  expect(() => {
    execSync(
      `node dist/index.js init --issue-url https://github.com/test/repo/issues/123 --branch "invalid branch name"`,
      { cwd: testRepoPath, stdio: 'pipe' }
    );
  }).toThrow();

  // 検証: ブランチが作成されていないこと
  const git = simpleGit(testRepoPath);
  const branches = await git.branchLocal();
  expect(branches.all).not.toContain('invalid branch name');

  // 検証: metadata.jsonが作成されていないこと
  const metadataPath = path.join(testRepoPath, '.ai-workflow', 'issue-123', 'metadata.json');
  expect(fs.existsSync(metadataPath)).toBe(false);
});
```

---

### 3.2 Git操作統合

#### テストファイル
`tests/integration/custom-branch-workflow.test.ts` (3.1と同じファイルに追加)

---

#### シナリオ 3.2.1: ブランチ作成と切り替えの統合

**目的**: GitManagerの既存メソッド（`createBranch()`, `switchBranch()`）が正しく呼び出されることを検証

**前提条件**:
- GitManagerのインスタンスが準備されている
- テスト用Gitリポジトリが初期化されている

**テスト手順**:
1. `handleInitCommand()`を実行（カスタムブランチ名指定）
2. GitManagerの`branchExists()`が呼ばれたことを確認
3. GitManagerの`createBranch()`または`switchBranch()`が呼ばれたことを確認
4. メタデータに正しいブランチ名が保存されていることを確認

**期待結果**:
- GitManagerの`branchExists()`が1回呼ばれる
- ブランチが存在しない場合、`createBranch()`が呼ばれる
- ブランチが存在する場合、`switchBranch()`が呼ばれる
- メタデータの`branch_name`フィールドが正しい

**確認項目**:
- [ ] `branchExists()`が呼ばれた
- [ ] 適切なメソッド（`createBranch()`または`switchBranch()`）が呼ばれた
- [ ] メタデータが正しく保存された

---

#### シナリオ 3.2.2: Git操作エラーのハンドリング

**目的**: Git操作が失敗した場合、適切なエラーメッセージが表示され、処理が中断されることを検証

**前提条件**:
- テスト用Gitリポジトリが初期化されている
- Git操作が失敗する状況を模擬（例: Gitリポジトリでないディレクトリ）

**テスト手順**:
1. Gitリポジトリでないディレクトリで`ai-workflow-v2 init`を実行
2. エラーメッセージを確認
3. プロセスが終了コード1で終了することを確認

**期待結果**:
- エラーメッセージが表示される
- プロセスが終了コード1で終了する
- メタデータが作成されない

**確認項目**:
- [ ] エラーメッセージが表示される
- [ ] 終了コード1で終了する
- [ ] メタデータが作成されない

---

### 3.3 後方互換性とリグレッションテスト

#### テストファイル
`tests/integration/multi-repo-workflow.test.ts` (既存ファイルへのケース追加)

---

#### シナリオ 3.3.1: マルチリポジトリワークフローでカスタムブランチを使用

**目的**: マルチリポジトリ環境でカスタムブランチが正しく動作することを検証

**前提条件**:
- オーケストレータリポジトリと対象リポジトリが設定されている
- 対象リポジトリにカスタムブランチ名を指定する

**テスト手順**:
1. オーケストレータリポジトリで`ai-workflow-v2 init --issue-url ... --branch feature/custom`を実行
2. 対象リポジトリにカスタムブランチ`feature/custom`が作成されることを確認
3. `metadata.json`の`target_repository`と`branch_name`フィールドを確認

**期待結果**:
- 対象リポジトリに`feature/custom`ブランチが作成される
- `metadata.json`の`branch_name`フィールドが`"feature/custom"`である
- `metadata.json`の`target_repository`フィールドが正しい

**確認項目**:
- [ ] 対象リポジトリにカスタムブランチが作成された
- [ ] メタデータのフィールドが正しい
- [ ] マルチリポジトリ機能との整合性が保たれている

---

#### シナリオ 3.3.2: マルチリポジトリワークフローでデフォルトブランチを使用（後方互換性）

**目的**: マルチリポジトリ環境でデフォルトブランチが正しく動作することを検証（後方互換性）

**前提条件**:
- オーケストレータリポジトリと対象リポジトリが設定されている
- `--branch`オプションを指定しない

**テスト手順**:
1. オーケストレータリポジトリで`ai-workflow-v2 init --issue-url ...`を実行（`--branch`なし）
2. 対象リポジトリにデフォルトブランチ`ai-workflow/issue-{issue_number}`が作成されることを確認
3. 既存のマルチリポジトリワークフローテストが成功することを確認

**期待結果**:
- 対象リポジトリに`ai-workflow/issue-{issue_number}`ブランチが作成される（従来通り）
- `metadata.json`の`branch_name`フィールドが`"ai-workflow/issue-{issue_number}"`である
- 既存のマルチリポジトリワークフローテストがすべて成功する

**確認項目**:
- [ ] デフォルトブランチが作成された
- [ ] メタデータが正しい
- [ ] 既存機能の動作が変更されていない
- [ ] リグレッションがない

---

### 3.4 Jenkinsパラメータ統合（参考）

#### テストファイル
`tests/integration/custom-branch-workflow.test.ts` (3.1と同じファイルに追加)

**注意**: Jenkins環境でのテストは手動実行が推奨されます。以下はシナリオの概要です。

---

#### シナリオ 3.4.1: JenkinsパラメータでBRANCH_NAMEを指定

**目的**: Jenkins環境でBRANCH_NAMEパラメータが正しく動作することを検証

**前提条件**:
- Jenkins Jobが設定されている
- `BRANCH_NAME`パラメータが追加されている（Job DSL実装後）
- 環境変数`GITHUB_TOKEN`, `CODEX_API_KEY`が設定されている

**テスト手順**:
1. Jenkins Jobのパラメータで`BRANCH_NAME = feature/jenkins-custom`を設定
2. Jenkins Jobを実行
3. `init`コマンドに`--branch feature/jenkins-custom`オプションが渡されることを確認
4. `feature/jenkins-custom`ブランチで作業が開始されることを確認
5. `metadata.json`の`branch_name`フィールドが`"feature/jenkins-custom"`であることを確認

**期待結果**:
- `init`コマンドに`--branch feature/jenkins-custom`が渡される
- `feature/jenkins-custom`ブランチで作業が開始される
- `metadata.json`の`branch_name`フィールドが`"feature/jenkins-custom"`である
- Jenkins実行ログに`"[INFO] Created and switched to new branch: feature/jenkins-custom"`が表示される

**確認項目**:
- [ ] Jenkinsパラメータが正しく渡される
- [ ] カスタムブランチで作業が開始される
- [ ] メタデータが正しい
- [ ] ログメッセージが正しい

---

#### シナリオ 3.4.2: JenkinsパラメータでBRANCH_NAMEを空にする（デフォルト動作）

**目的**: Jenkins環境でBRANCH_NAMEパラメータが空の場合、デフォルト動作が維持されることを検証

**前提条件**:
- Jenkins Jobが設定されている
- `BRANCH_NAME`パラメータが空文字列である

**テスト手順**:
1. Jenkins Jobのパラメータで`BRANCH_NAME = ""`（空文字列）を設定
2. Jenkins Jobを実行
3. `init`コマンドに`--branch`オプションが渡されないことを確認
4. デフォルトブランチ`ai-workflow/issue-{issue_number}`が作成されることを確認

**期待結果**:
- `init`コマンドに`--branch`オプションが渡されない
- デフォルトブランチ`ai-workflow/issue-{issue_number}`が作成される（従来通り）
- `metadata.json`の`branch_name`フィールドが`"ai-workflow/issue-{issue_number}"`である

**確認項目**:
- [ ] `--branch`オプションが渡されない
- [ ] デフォルトブランチが作成される
- [ ] 後方互換性が維持される

---

## 4. テストデータ

### 4.1 ブランチ名バリデーションテストデータ

#### 正常データ
```typescript
const validBranchNames = [
  "feature/add-logging",
  "bugfix/issue-123",
  "hotfix/security-patch",
  "feature/add-aws-credentials-support",
  "release/v1.0.0",
  "develop",
  "feature/implement-api-v2.0",
  "hotfix/2024-01-15-security-patch",
];
```

#### 異常データ
```typescript
const invalidBranchNames = [
  { name: "", error: "Branch name cannot be empty" },
  { name: "   ", error: "Branch name cannot be empty" },
  { name: "/feature", error: "Branch name cannot start or end with \"/\"" },
  { name: "feature/", error: "Branch name cannot start or end with \"/\"" },
  { name: "feature/..", error: "Branch name cannot contain \"..\"" },
  { name: "invalid branch name", error: "Branch name contains invalid characters" },
  { name: "~test", error: "Branch name contains invalid characters" },
  { name: "test^123", error: "Branch name contains invalid characters" },
  { name: "test:branch", error: "Branch name contains invalid characters" },
  { name: "test?branch", error: "Branch name contains invalid characters" },
  { name: "test*branch", error: "Branch name contains invalid characters" },
  { name: "test[branch", error: "Branch name contains invalid characters" },
  { name: "test\\branch", error: "Branch name contains invalid characters" },
  { name: "feature@{123}", error: "Branch name contains invalid characters" },
  { name: "feature.", error: "Branch name cannot end with \".\"" },
];
```

### 4.2 Git操作テストデータ

#### Issue URL
```typescript
const testIssueUrls = [
  "https://github.com/tielec/ai-workflow-agent/issues/7",
  "https://github.com/test/repo/issues/123",
  "https://github.com/org/project/issues/456",
];
```

#### カスタムブランチ名
```typescript
const customBranchNames = [
  "feature/add-logging",
  "bugfix/fix-login-issue",
  "hotfix/security-patch",
  "feature/custom-branch",
  "feature/jenkins-custom",
];
```

### 4.3 メタデータテストデータ

#### 期待されるメタデータ構造
```json
{
  "issue_number": "123",
  "issue_url": "https://github.com/test/repo/issues/123",
  "branch_name": "feature/custom-branch",
  "repository": "test/repo",
  "target_repository": null,
  "created_at": "2025-01-XX",
  "updated_at": "2025-01-XX"
}
```

---

## 5. テスト環境要件

### 5.1 ユニットテスト環境

**必要な環境**:
- Node.js 20以上
- npm 10以上
- Jestテストフレームワーク

**必要なモック/スタブ**:
- GitManagerのモック（ユニットテストで使用）
- MetadataManagerのモック（ユニットテストで使用）

**実行方法**:
```bash
npm run test:unit
```

### 5.2 インテグレーションテスト環境

**必要な環境**:
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- テスト用Gitリポジトリ（一時ディレクトリに作成）

**必要な外部サービス**:
- なし（ローカルGitリポジトリのみ）

**リモートブランチテスト用の追加要件**:
- テスト用リモートリポジトリ（bare repository）
- Git remote設定

**実行方法**:
```bash
npm run test:integration
```

### 5.3 Jenkins統合テスト環境（参考）

**必要な環境**:
- Jenkins環境
- AI Workflow Orchestrator Job
- 環境変数: `GITHUB_TOKEN`, `CODEX_API_KEY`

**実行方法**:
- Jenkins Job UIから手動実行

---

## 6. テストカバレッジ目標

### 6.1 ユニットテストカバレッジ

**目標**: ≥ 90%

**カバレッジ対象**:
- `validateBranchName()`: 100%（全分岐）
- `resolveBranchName()`: 100%（全分岐）
- CLI オプション解析ロジック: 90%以上

### 6.2 インテグレーションテストカバレッジ

**目標**: 主要シナリオ100%

**カバレッジ対象**:
- デフォルトブランチ生成（後方互換性）: 100%
- カスタムブランチ作成: 100%
- 既存ブランチ切り替え: 100%
- リモートブランチ取得: 100%
- エラーハンドリング: 100%

---

## 7. 受け入れ基準との対応

### AC-1: CLIでカスタムブランチ名を指定できる
**対応テストシナリオ**: 3.1.2（カスタムブランチ名（新規作成））

### AC-2: デフォルト動作が変わらない（後方互換性）
**対応テストシナリオ**: 3.1.1（デフォルトブランチ名（後方互換性））

### AC-3: 既存ブランチに切り替えられる
**対応テストシナリオ**: 3.1.3（既存ローカルブランチへの切り替え）

### AC-4: メタデータに保存される
**対応テストシナリオ**: 3.1.2, 3.1.3（メタデータ保存の検証）

### AC-5: Jenkinsでブランチ名を指定できる
**対応テストシナリオ**: 3.4.1（JenkinsパラメータでBRANCH_NAMEを指定）

### AC-6: ブランチ名のバリデーション
**対応テストシナリオ**: 2.1（ブランチ名バリデーション関数）, 3.1.5（不正なブランチ名のエラーハンドリング）

### AC-7: リモートブランチを取得できる
**対応テストシナリオ**: 3.1.4（リモートブランチの取得とチェックアウト）

---

## 8. 品質ゲート（Phase 3）

本テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATIONに基づいている
- [x] **主要な正常系がカバーされている**: デフォルトブランチ、カスタムブランチ、既存ブランチのシナリオを含む
- [x] **主要な異常系がカバーされている**: 不正なブランチ名、Git操作エラーのシナリオを含む
- [x] **期待結果が明確である**: 各テストケースに具体的な期待結果と検証項目が記載されている

---

## 9. 次ステップ

本テストシナリオ（Phase 3）が承認された後、以下のフェーズに進みます：

1. **Phase 4: Implementation（実装）** - コード実装（設計書の実装順序に従う）
2. **Phase 5: Test Implementation（テスト実装）** - 本テストシナリオに基づくテストコードの実装
3. **Phase 6: Testing（テスト実行）** - 全テストの実行とカバレッジ確認
4. **Phase 7: Documentation（ドキュメント）** - README、CLAUDE.md、ARCHITECTURE.mdの更新
5. **Phase 8: Report（レポート）** - 実装サマリーとPRボディの生成

---

**テストシナリオ v1.0**
**作成日**: 2025-01-XX
**Issue番号**: #7
**対応Issue**: https://github.com/tielec/ai-workflow-agent/issues/7
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: BOTH_TEST
**カバレッジ目標**: ユニット ≥ 90%, インテグレーション 100%
