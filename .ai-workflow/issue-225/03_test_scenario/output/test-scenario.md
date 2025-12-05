# テストシナリオ

## Issue #225: --squash-on-complete オプション実行時の不具合修正

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION** (Planning Document Phase 2より引用)

### テスト対象の範囲

#### 修正対象コード
1. **`src/commands/init.ts`**: `base_commit`記録タイミングの修正
2. **`src/core/git/squash-manager.ts`**: プロンプトパス解決の確認（既に正しく実装済み）
3. **`src/core/metadata-manager.ts`**: `setBaseCommit()` / `getBaseCommit()` メソッド（既存機能）

#### テスト対象機能
- **機能1**: `base_commit`記録タイミングの変更（initコミット前に記録）
- **機能2**: スカッシュ実行時のコミット範囲特定（initコミット含む）
- **機能3**: エラーハンドリングの強化（base_commit記録失敗時の継続）

### テストの目的

1. **正確性の保証**: `base_commit`が正しいタイミング（initコミット前）で記録されることを検証
2. **統合性の保証**: スカッシュ実行時にinitコミットが正しく含まれることを検証
3. **堅牢性の保証**: エラー発生時もワークフローが継続することを検証
4. **リグレッション防止**: 既存のワークフローに影響がないことを検証

---

## 2. Unitテストシナリオ

### 2.1 `src/commands/init.ts` のテストケース

#### テストケース UT-1.1: base_commit記録タイミング（正常系）

**テスト対象**: `handleInitCommand()` - `base_commit`記録処理

**目的**: `base_commit`がinitコミット前のHEADハッシュを記録することを検証

**前提条件**:
- Gitリポジトリが初期化されている
- 現在のブランチが`main`である
- リモートブランチ`origin/ai-workflow/issue-225`が存在しない
- Git操作（`revparse`, `checkout`, `commit`）がモック化されている

**入力**:
```typescript
issueUrl = 'https://github.com/owner/repo/issues/225'
customBranch = undefined
```

**テスト手順**:
1. `handleInitCommand(issueUrl)` を実行
2. `git.revparse(['HEAD'])` の呼び出しタイミングを確認
3. `metadataManager.setBaseCommit()` の呼び出しタイミングを確認
4. `gitManager.commitWorkflowInit()` の呼び出しタイミングを確認

**期待結果**:
- `git.revparse(['HEAD'])` が `gitManager.commitWorkflowInit()` より前に呼ばれる
- `metadataManager.setBaseCommit()` が `gitManager.commitWorkflowInit()` より前に呼ばれる
- `metadataManager.setBaseCommit()` の引数が正しいHEADハッシュである（例: `'abc123def456'`）
- ログに `Recorded base_commit for squash: abc123d` が出力される

**検証コード例**:
```typescript
// Given: Git操作のモック
const mockGit = {
  revparse: jest.fn().mockResolvedValue('abc123def456\n'),
  checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
  // ...
};

const mockMetadataManager = {
  setBaseCommit: jest.fn(),
  save: jest.fn(),
  data: {},
};

const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({ success: true }),
};

// When: handleInitCommand実行

// Then: 呼び出し順序を検証
expect(mockGit.revparse).toHaveBeenCalledWith(['HEAD']);
expect(mockMetadataManager.setBaseCommit).toHaveBeenCalledWith('abc123def456');
expect(mockMetadataManager.setBaseCommit).toHaveBeenCalledBefore(
  mockGitManager.commitWorkflowInit
);
```

---

#### テストケース UT-1.2: base_commit記録失敗時の動作（異常系）

**テスト対象**: `handleInitCommand()` - エラーハンドリング

**目的**: `git.revparse(['HEAD'])` 失敗時もワークフロー初期化が継続することを検証

**前提条件**:
- Gitリポジトリが初期化されている
- `git.revparse(['HEAD'])` が失敗する（例: detached HEAD状態）

**入力**:
```typescript
issueUrl = 'https://github.com/owner/repo/issues/225'
customBranch = undefined
```

**テスト手順**:
1. `git.revparse(['HEAD'])` を失敗させる（`mockRejectedValue`）
2. `handleInitCommand(issueUrl)` を実行
3. エラーログを確認
4. ワークフロー初期化の継続を確認

**期待結果**:
- `metadataManager.setBaseCommit()` が呼ばれない
- 警告ログ `Failed to record base_commit: ...` が出力される
- `gitManager.commitWorkflowInit()` は実行される（ワークフロー初期化は継続）
- `gitManager.pushToRemote()` は実行される（ワークフロー初期化は継続）
- エラーがスローされない

**検証コード例**:
```typescript
// Given: git.revparse が失敗するモック
const mockGit = {
  revparse: jest.fn().mockRejectedValue(new Error('Git command failed')),
  // ...
};

const mockMetadataManager = {
  setBaseCommit: jest.fn(),
  save: jest.fn(),
  data: {},
};

const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({ success: true }),
  pushToRemote: jest.fn().mockResolvedValue({ success: true }),
};

// When: handleInitCommand実行
await handleInitCommand(issueUrl);

// Then:
expect(mockMetadataManager.setBaseCommit).not.toHaveBeenCalled();
expect(mockGitManager.commitWorkflowInit).toHaveBeenCalled();
expect(mockGitManager.pushToRemote).toHaveBeenCalled();
// 警告ログを検証（logger.warn のモックで確認）
```

---

#### テストケース UT-1.3: base_commitの値検証（境界値）

**テスト対象**: `handleInitCommand()` - `base_commit`の値の正確性

**目的**: `base_commit`に記録される値が正しいGitハッシュ（40文字の16進数）であることを検証

**前提条件**:
- Gitリポジトリが初期化されている
- `git.revparse(['HEAD'])` が正常に動作する

**入力**:
```typescript
issueUrl = 'https://github.com/owner/repo/issues/225'
customBranch = undefined
```

**テスト手順**:
1. `git.revparse(['HEAD'])` が返す値を設定（例: `'abc123def456789012345678901234567890abcd\n'`）
2. `handleInitCommand(issueUrl)` を実行
3. `metadataManager.setBaseCommit()` の引数を確認

**期待結果**:
- `metadataManager.setBaseCommit()` の引数が `'abc123def456789012345678901234567890abcd'`（トリム済み）
- 改行文字 `\n` が除去されている
- ログに短縮ハッシュ `abc123d` が出力される

**テストデータ**:
| テストケース | `git.revparse()` の返り値 | 期待される `setBaseCommit()` の引数 |
|-------------|-------------------------|--------------------------------|
| 正常系 | `'abc123...\n'` | `'abc123...'` |
| 改行なし | `'abc123...'` | `'abc123...'` |
| 空白文字 | `'  abc123...\n'` | `'abc123...'` |

---

### 2.2 `src/core/metadata-manager.ts` のテストケース

#### テストケース UT-2.1: setBaseCommit() / getBaseCommit() の動作（正常系）

**テスト対象**: `MetadataManager.setBaseCommit()`, `MetadataManager.getBaseCommit()`

**目的**: `base_commit`の保存と取得が正しく動作することを検証

**前提条件**:
- `metadata.json` が存在する
- `WorkflowState` が正常に初期化されている

**入力**:
```typescript
commit = 'abc123def456789012345678901234567890abcd'
```

**テスト手順**:
1. `metadataManager.setBaseCommit(commit)` を実行
2. `metadataManager.getBaseCommit()` を実行
3. 返り値を検証

**期待結果**:
- `getBaseCommit()` が `'abc123def456789012345678901234567890abcd'` を返す
- `metadata.json` に `base_commit` フィールドが保存される
- ログに `Base commit set: abc123...` が出力される

**検証コード例**:
```typescript
// Given: MetadataManagerの初期化
const metadataManager = new MetadataManager(metadataPath);

// When: base_commitを設定
metadataManager.setBaseCommit('abc123def456789012345678901234567890abcd');

// Then: 取得した値を検証
const retrieved = metadataManager.getBaseCommit();
expect(retrieved).toBe('abc123def456789012345678901234567890abcd');
```

---

#### テストケース UT-2.2: getBaseCommit() - base_commit未記録時の動作（境界値）

**テスト対象**: `MetadataManager.getBaseCommit()`

**目的**: `base_commit`が未記録の場合、`null`を返すことを検証

**前提条件**:
- `metadata.json` が存在する
- `base_commit` フィールドが未設定

**入力**:
なし

**テスト手順**:
1. `metadataManager.getBaseCommit()` を実行
2. 返り値を検証

**期待結果**:
- `getBaseCommit()` が `null` を返す

**検証コード例**:
```typescript
// Given: base_commit未記録のMetadataManager
const metadataManager = new MetadataManager(metadataPath);

// When: base_commitを取得
const result = metadataManager.getBaseCommit();

// Then: nullを返す
expect(result).toBeNull();
```

---

### 2.3 `src/core/git/squash-manager.ts` のテストケース

#### テストケース UT-3.1: getCommitsToSquash() - コミット範囲特定（正常系）

**テスト対象**: `SquashManager.getCommitsToSquash()` (privateメソッド、間接的にテスト)

**目的**: `base_commit`からHEADまでのコミット範囲が正しく特定されることを検証

**前提条件**:
- `base_commit` が記録されている
- `base_commit`からHEADまでに複数のコミットが存在する

**入力**:
```typescript
baseCommit = 'abc123def456789012345678901234567890abcd'
commits = [
  { hash: 'commit1hash...' },  // initコミット
  { hash: 'commit2hash...' },  // Phase 0
  { hash: 'commit3hash...' },  // Phase 1
]
```

**テスト手順**:
1. `mockGit.log()` を設定（`from: baseCommit, to: 'HEAD'`）
2. `squashManager.squashCommits(context)` を実行
3. `mockGit.log()` の呼び出しを検証

**期待結果**:
- `mockGit.log()` が `{ from: 'abc123...', to: 'HEAD', format: { hash: '%H' } }` で呼ばれる
- 返り値のコミット数が3である（initコミット含む）
- `metadataManager.setPreSquashCommits()` が3つのコミットハッシュで呼ばれる

**検証コード例**:
```typescript
// Given: スカッシュ実行の前提条件
mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
mockGit.log.mockResolvedValue({ all: commits });

// When: スカッシュ実行
await squashManager.squashCommits(context);

// Then: コミット範囲特定を検証
expect(mockGit.log).toHaveBeenCalledWith({
  from: baseCommit,
  to: 'HEAD',
  format: { hash: '%H' },
});

const preSquashCommits = mockMetadataManager.setPreSquashCommits.mock.calls[0][0];
expect(preSquashCommits).toHaveLength(3);
expect(preSquashCommits).toContain('commit1hash...');
```

---

#### テストケース UT-3.2: squashCommits() - base_commit未記録時のスキップ（境界値）

**テスト対象**: `SquashManager.squashCommits()`

**目的**: `base_commit`が未記録の場合、スカッシュがスキップされることを検証

**前提条件**:
- `metadataManager.getBaseCommit()` が `null` を返す

**入力**:
```typescript
context = {
  issueNumber: 225,
  issueInfo: null,
  workingDir: '/test/working-dir',
  metadataManager: mockMetadataManager,
}
```

**テスト手順**:
1. `mockMetadataManager.getBaseCommit()` を `null` に設定
2. `squashManager.squashCommits(context)` を実行
3. Git操作が呼ばれないことを確認

**期待結果**:
- 警告ログ `base_commit not found in metadata. Skipping squash.` が出力される
- `mockGit.log()` が呼ばれない
- `mockGit.reset()` が呼ばれない
- `mockRemoteManager.forcePushToRemote()` が呼ばれない

**検証コード例**:
```typescript
// Given: base_commit未記録
mockMetadataManager.getBaseCommit.mockReturnValue(null);

// When: スカッシュ実行
await squashManager.squashCommits(context);

// Then: スカッシュがスキップされる
expect(mockGit.log).not.toHaveBeenCalled();
expect(mockGit.reset).not.toHaveBeenCalled();
expect(mockRemoteManager.forcePushToRemote).not.toHaveBeenCalled();
```

---

#### テストケース UT-3.3: squashCommits() - コミット数1以下でスキップ（境界値）

**テスト対象**: `SquashManager.squashCommits()`

**目的**: スカッシュ対象のコミット数が1以下の場合、スカッシュがスキップされることを検証

**前提条件**:
- `base_commit` が記録されている
- `base_commit`からHEADまでのコミット数が1つのみ

**入力**:
```typescript
baseCommit = 'abc123...'
commits = [{ hash: 'commit1hash...' }]  // initコミットのみ
```

**テスト手順**:
1. `mockGit.log()` を設定（コミット数1つ）
2. `squashManager.squashCommits(context)` を実行
3. スカッシュがスキップされることを確認

**期待結果**:
- ログに `Only 1 commit(s) found. Skipping squash.` が出力される
- `mockGit.reset()` が呼ばれない
- `mockRemoteManager.forcePushToRemote()` が呼ばれない

**検証コード例**:
```typescript
// Given: コミット数が1つのみ
mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);
mockGit.log.mockResolvedValue({ all: [{ hash: 'c1' }] });

// When: スカッシュ実行
await squashManager.squashCommits(context);

// Then: スカッシュがスキップされる
expect(mockGit.reset).not.toHaveBeenCalled();
```

---

## 3. Integrationテストシナリオ

### 3.1 エンドツーエンドワークフローテスト

#### テストケース IT-1.1: init → execute --squash-on-complete → スカッシュ成功

**シナリオ名**: 完全なスカッシュワークフローの統合テスト

**目的**: `init`コマンドから`execute --squash-on-complete`までの一連の流れで、initコミットが正しくスカッシュされることを検証

**前提条件**:
- テスト用Gitリポジトリが作成されている
- 初期コミット（`Initial commit`）が存在する
- GitHub API がモック化されている

**テスト手順**:
1. **init実行**:
   ```bash
   node dist/index.js init --issue-url https://github.com/owner/repo/issues/225
   ```
2. **コミット履歴確認**:
   ```bash
   git log --oneline
   ```
   - 期待: `[ai-workflow] Initialize workflow for issue #225` が存在
3. **metadata.json確認**:
   ```javascript
   const metadata = JSON.parse(fs.readFileSync('.ai-workflow/issue-225/metadata.json'));
   const baseCommit = metadata.base_commit;
   ```
   - 期待: `base_commit` がinitコミット前のHEADハッシュ
4. **Phase 0-9実行（モック）**:
   ```bash
   # 各フェーズのコミットを作成
   for i in {0..9}; do
     echo "Phase $i output" > phase-${i}.txt
     git add phase-${i}.txt
     git commit -m "[ai-workflow] Phase $i completed"
   done
   ```
5. **スカッシュ実行**:
   ```javascript
   await squashManager.squashCommits(context);
   ```
6. **コミット履歴確認**:
   ```bash
   git log --oneline
   ```
   - 期待: すべてのワークフローコミット（initコミット含む）が1つにスカッシュされる

**期待結果**:
- **スカッシュ前のコミット数**: `Initial commit` + `init` + Phase 0-9 = 12個
- **スカッシュ後のコミット数**: `Initial commit` + スカッシュコミット = 2個
- **スカッシュコミットメッセージ**: Conventional Commits形式（`feat:` または `fix:` で始まる）
- **Issue番号**: コミットメッセージに `Fixes #225` が含まれる
- **コミット範囲**: `base_commit..HEAD` のすべてのコミットがスカッシュされる

**確認項目**:
- [ ] initコミット（`[ai-workflow] Initialize workflow for issue #225`）が単独で残らない
- [ ] Phase 0-9のコミットがすべてスカッシュされる
- [ ] スカッシュコミットメッセージがConventional Commits形式である
- [ ] `metadata.json` の `base_commit` が正しく記録されている
- [ ] `metadata.json` の `pre_squash_commits` に元のコミットハッシュが記録されている
- [ ] `metadata.json` の `squashed_at` にタイムスタンプが記録されている

**検証コード例**:
```typescript
describe('IT-1.1: init → execute --squash-on-complete → スカッシュ成功', () => {
  let testRepoPath: string;
  let git: SimpleGit;

  beforeEach(async () => {
    // テスト用リポジトリを作成
    testRepoPath = path.join('/tmp', `test-repo-${Date.now()}`);
    fs.ensureDirSync(testRepoPath);
    git = simpleGit(testRepoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // 初期コミット
    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test Repo');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  afterEach(() => {
    fs.removeSync(testRepoPath);
  });

  it('should squash all commits including init commit', async () => {
    // Step 1: init実行（モック化されたhandleInitCommand）
    const initialCommit = await git.revparse(['HEAD']);
    await handleInitCommand('https://github.com/owner/repo/issues/225');

    const commitsAfterInit = await git.log();
    expect(commitsAfterInit.total).toBe(2); // Initial + init

    // Step 2: metadata.json確認
    const metadataPath = path.join(testRepoPath, '.ai-workflow/issue-225/metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    expect(metadata.base_commit).toBe(initialCommit.trim());

    // Step 3: Phase 0-9実行（コミット作成）
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(testRepoPath, `phase-${i}.txt`), `Phase ${i}`);
      await git.add(`phase-${i}.txt`);
      await git.commit(`[ai-workflow] Phase ${i} completed`);
    }

    const commitsBeforeSquash = await git.log();
    expect(commitsBeforeSquash.total).toBe(12); // Initial + init + 10 phases

    // Step 4: スカッシュ実行
    const metadataManager = new MetadataManager(metadataPath);
    const squashManager = new SquashManager(git, metadataManager, ...);
    await squashManager.squashCommits(context);

    // Step 5: コミット履歴確認
    const commitsAfterSquash = await git.log();
    expect(commitsAfterSquash.total).toBe(2); // Initial + squashed

    // Step 6: スカッシュコミットメッセージ確認
    const latestCommit = commitsAfterSquash.latest;
    expect(latestCommit?.message).toMatch(/^(feat|fix):/);
    expect(latestCommit?.message).toContain('Fixes #225');
  });
});
```

---

#### テストケース IT-1.2: initコミットのみ（Phase未実行）→ スカッシュスキップ

**シナリオ名**: initコミットのみの場合のスカッシュスキップ

**目的**: ワークフロー初期化後、フェーズを実行せずにスカッシュを実行した場合、スカッシュがスキップされることを検証

**前提条件**:
- テスト用Gitリポジトリが作成されている
- `init`コマンドが実行されている
- フェーズは実行されていない（initコミットのみ）

**テスト手順**:
1. **init実行**
2. **コミット履歴確認**: `Initial commit` + `init` = 2個
3. **スカッシュ実行**
4. **コミット履歴確認**: スカッシュがスキップされ、2個のまま

**期待結果**:
- ログに `Only 1 commit(s) found. Skipping squash.` が出力される
- コミット数は変わらない（2個のまま）
- `metadata.json` の `squashed_at` が記録されない

**確認項目**:
- [ ] スカッシュがスキップされる
- [ ] コミット履歴が変更されない
- [ ] ワークフローが正常に継続する

---

#### テストケース IT-1.3: 既存ワークフロー（base_commit未記録）→ スカッシュスキップ

**シナリオ名**: 既存ワークフロー（Issue #194以前）でのスカッシュスキップ

**目的**: `base_commit`が未記録の既存ワークフローでスカッシュを実行した場合、スカッシュがスキップされることを検証

**前提条件**:
- テスト用Gitリポジトリが作成されている
- `metadata.json` に `base_commit` フィールドが存在しない（既存ワークフロー）

**テスト手順**:
1. **metadata.json作成**（`base_commit` フィールドなし）
2. **スカッシュ実行**
3. **コミット履歴確認**: スカッシュがスキップされる

**期待結果**:
- 警告ログ `base_commit not found in metadata. Skipping squash.` が出力される
- コミット履歴が変更されない
- ワークフローが正常に継続する

**確認項目**:
- [ ] スカッシュがスキップされる
- [ ] 警告ログが出力される
- [ ] ワークフローが正常に継続する

---

### 3.2 エラーハンドリングテスト

#### テストケース IT-2.1: base_commit記録失敗 → ワークフロー継続

**シナリオ名**: `git.revparse(['HEAD'])` 失敗時のワークフロー継続

**目的**: `base_commit`記録に失敗した場合でも、ワークフロー初期化が正常に完了することを検証

**前提条件**:
- Gitリポジトリが初期化されている
- `git.revparse(['HEAD'])` が失敗する環境（detached HEAD状態）

**テスト手順**:
1. **Git環境を設定**（detached HEAD状態）
   ```bash
   git checkout <commit-hash>
   ```
2. **init実行**
3. **警告ログ確認**: `Failed to record base_commit: ...`
4. **コミット履歴確認**: initコミットが正常に作成される
5. **metadata.json確認**: `base_commit` が未設定（`null`）

**期待結果**:
- 警告ログが出力される
- ワークフロー初期化は正常に完了する（エラーで中断しない）
- initコミットが作成される
- PRが作成される

**確認項目**:
- [ ] 警告ログ `Failed to record base_commit: ...` が出力される
- [ ] `metadata.json` が作成される
- [ ] initコミットが作成される
- [ ] PRが作成される
- [ ] `metadata.json` の `base_commit` が `null` または未設定

---

#### テストケース IT-2.2: スカッシュ実行時のブランチ保護チェック

**シナリオ名**: `main`ブランチでのスカッシュ禁止

**目的**: `main`または`master`ブランチでスカッシュを実行した場合、エラーがスローされることを検証

**前提条件**:
- 現在のブランチが`main`である
- `base_commit` が記録されている

**テスト手順**:
1. **mainブランチに切り替え**
   ```bash
   git checkout main
   ```
2. **スカッシュ実行**
3. **エラー確認**: `Cannot squash commits on protected branch: main`

**期待結果**:
- エラーがスローされる
- スカッシュ処理が実行されない（`git reset` が呼ばれない）
- リモートへのpushが行われない

**確認項目**:
- [ ] エラーメッセージ `Cannot squash commits on protected branch: main` が出力される
- [ ] `git reset` が実行されない
- [ ] `git push --force-with-lease` が実行されない

---

### 3.3 パス解決テスト（Issue #225 修正内容2）

#### テストケース IT-3.1: プロンプトテンプレート読み込み（正常系）

**シナリオ名**: スカッシュ実行時のプロンプトテンプレート読み込み

**目的**: スカッシュ実行時にプロンプトテンプレート（`dist/prompts/squash/generate-message.txt`）が正しく読み込まれることを検証

**前提条件**:
- `dist/prompts/squash/generate-message.txt` が存在する
- スカッシュ実行の前提条件が整っている（`base_commit`記録済み、コミット数2以上）

**テスト手順**:
1. **ビルド実行**
   ```bash
   npm run build
   ```
2. **ファイル存在確認**
   ```bash
   ls -la dist/prompts/squash/generate-message.txt
   ```
3. **スカッシュ実行**
4. **ログ確認**: エラーログ `ENOENT: no such file or directory` が出力されない

**期待結果**:
- プロンプトテンプレートが正しく読み込まれる
- エージェント実行が成功する
- エージェント生成のコミットメッセージが使用される（フォールバックメッセージではない）

**確認項目**:
- [ ] エラーログ `ENOENT: no such file or directory` が出力されない
- [ ] エージェント実行が成功する
- [ ] コミットメッセージがConventional Commits形式である
- [ ] コミットメッセージに `Fixes #225` が含まれる

---

#### テストケース IT-3.2: プロンプトテンプレート不在時のフォールバック

**シナリオ名**: プロンプトテンプレート不在時のフォールバックメッセージ使用

**目的**: プロンプトテンプレートが存在しない場合でも、フォールバックメッセージが使用され、スカッシュ処理が継続することを検証

**前提条件**:
- `dist/prompts/squash/generate-message.txt` が存在しない
- スカッシュ実行の前提条件が整っている

**テスト手順**:
1. **プロンプトテンプレート削除**
   ```bash
   rm -f dist/prompts/squash/generate-message.txt
   ```
2. **スカッシュ実行**
3. **ログ確認**: エラーログ `Failed to load prompt template: ...` が出力される
4. **コミットメッセージ確認**: フォールバックメッセージが使用される

**期待結果**:
- エラーログが出力される
- フォールバックメッセージが使用される
- スカッシュ処理が継続される（エラーで中断しない）
- コミットメッセージが `feat: Complete workflow for Issue #225` である

**確認項目**:
- [ ] エラーログ `Failed to load prompt template: ...` が出力される
- [ ] フォールバックメッセージが使用される
- [ ] スカッシュ処理が正常に完了する
- [ ] コミットメッセージに `Fixes #225` が含まれる

---

## 4. テストデータ

### 4.1 Gitコミットハッシュ

| 用途 | ハッシュ | 説明 |
|------|---------|------|
| `base_commit` | `abc123def456789012345678901234567890abcd` | ワークフロー開始時のHEAD |
| `init_commit` | `commit1hash000000000000000000000000000` | initコミットハッシュ |
| Phase 0 | `commit2hash000000000000000000000000000` | Phase 0コミットハッシュ |
| Phase 1 | `commit3hash000000000000000000000000000` | Phase 1コミットハッシュ |
| スカッシュコミット | `squashed-commit-hash0000000000000000` | スカッシュ後のコミットハッシュ |

### 4.2 Issue情報

| フィールド | 値 |
|-----------|---|
| Issue番号 | 225 |
| タイトル | `--squash-on-complete オプション実行時の不具合修正` |
| URL | `https://github.com/tielec/ai-workflow-agent/issues/225` |
| ラベル | なし |

### 4.3 コミットメッセージ

#### エージェント生成メッセージ（期待値）
```
fix(squash): resolve init commit exclusion issue

This fix ensures that the init commit is included in squash range
by recording base_commit before creating the init commit.

Fixes #225
```

#### フォールバックメッセージ
```
feat: Complete workflow for Issue #225

--squash-on-complete オプション実行時の不具合修正

Fixes #225
```

---

## 5. テスト環境要件

### 5.1 ローカル環境

- **Node.js**: 20.x以上
- **npm**: 10.x以上
- **Git**: 2.x以上
- **OS**: Linux / macOS / Windows（Node.js 20.x対応環境）

### 5.2 CI/CD環境

- **テストフレームワーク**: Jest (ESM対応)
- **テストコマンド**:
  - ユニットテスト: `npm run test:unit`
  - 統合テスト: `npm run test:integration`
  - カバレッジ: `npm run test:coverage`
- **カバレッジ目標**: 80%以上（Planning Documentより）

### 5.3 モック/スタブ

#### ユニットテスト用モック

1. **Git操作のモック**:
   ```typescript
   const mockGit = {
     revparse: jest.fn().mockResolvedValue('abc123\n'),
     checkoutLocalBranch: jest.fn(),
     commit: jest.fn(),
     log: jest.fn(),
     reset: jest.fn(),
     diff: jest.fn(),
   };
   ```

2. **MetadataManager のモック**:
   ```typescript
   const mockMetadataManager = {
     setBaseCommit: jest.fn(),
     getBaseCommit: jest.fn().mockReturnValue('abc123'),
     setPreSquashCommits: jest.fn(),
     setSquashedAt: jest.fn(),
     save: jest.fn(),
     data: {},
   };
   ```

3. **GitManager のモック**:
   ```typescript
   const mockGitManager = {
     commitWorkflowInit: jest.fn().mockResolvedValue({ success: true }),
     pushToRemote: jest.fn().mockResolvedValue({ success: true }),
   };
   ```

#### 統合テスト用モック

1. **GitHub API のモック**:
   ```typescript
   const mockGitHubClient = {
     checkExistingPr: jest.fn().mockResolvedValue(null),
     createPullRequest: jest.fn().mockResolvedValue({ success: true }),
     getIssue: jest.fn().mockResolvedValue({ title: 'Test Issue', body: 'Test body' }),
   };
   ```

2. **エージェントクライアントのモック**:
   ```typescript
   const mockCodexAgent = {
     executeTask: jest.fn().mockResolvedValue(undefined),
   };

   const mockClaudeAgent = {
     executeTask: jest.fn().mockResolvedValue(undefined),
   };
   ```

---

## 6. テストカバレッジ目標

### 6.1 ユニットテストカバレッジ

| ファイル | カバレッジ目標 |
|---------|--------------|
| `src/commands/init.ts` | 80%以上 |
| `src/core/metadata-manager.ts` | 85%以上（既存機能含む） |
| `src/core/git/squash-manager.ts` | 85%以上（既存機能含む） |

### 6.2 統合テストカバレッジ

| シナリオ | カバレッジ対象 |
|---------|--------------|
| IT-1.1 | エンドツーエンドワークフロー全体 |
| IT-1.2 | エッジケース（コミット数1以下） |
| IT-1.3 | 既存ワークフローとの互換性 |
| IT-2.1 | エラーハンドリング |
| IT-2.2 | ブランチ保護チェック |
| IT-3.1 | プロンプトパス解決 |
| IT-3.2 | フォールバック機能 |

---

## 7. 品質ゲート（Phase 3）

### 7.1 必須要件

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づいたユニットテスト + 統合テストシナリオを作成
- [x] **主要な正常系がカバーされている**:
  - UT-1.1: base_commit記録タイミング（正常系）
  - IT-1.1: init → execute --squash-on-complete → スカッシュ成功
  - IT-3.1: プロンプトテンプレート読み込み（正常系）
- [x] **主要な異常系がカバーされている**:
  - UT-1.2: base_commit記録失敗時の動作
  - IT-2.1: base_commit記録失敗 → ワークフロー継続
  - IT-2.2: ブランチ保護チェック
  - IT-3.2: プロンプトテンプレート不在時のフォールバック
- [x] **期待結果が明確である**: すべてのテストケースで「期待結果」セクションを明記

### 7.2 推奨要件

- [x] **境界値テストが含まれている**:
  - UT-1.3: base_commitの値検証（境界値）
  - UT-2.2: getBaseCommit() - base_commit未記録時の動作
  - UT-3.3: squashCommits() - コミット数1以下でスキップ
- [x] **エッジケースがカバーされている**:
  - IT-1.2: initコミットのみ（Phase未実行）→ スカッシュスキップ
  - IT-1.3: 既存ワークフロー（base_commit未記録）→ スカッシュスキップ
- [x] **テストデータが具体的である**: セクション4で詳細なテストデータを定義

---

## 8. 次フェーズ（Implementation Phase）への引き継ぎ事項

### 8.1 実装優先順位

1. **優先度: 高** - 修正内容1（`src/commands/init.ts`）
2. **優先度: 高** - ユニットテスト（`tests/unit/commands/init.test.ts`）
3. **優先度: 中** - 統合テスト（`tests/integration/squash-workflow.test.ts`）

### 8.2 実装時の注意事項

1. **処理順序の変更**: `base_commit`記録処理（L275-285）を L244-274の間（メタデータ保存前）に移動
2. **エラーハンドリング**: 既存のtry-catchをそのまま維持（警告ログのみ、処理継続）
3. **ログメッセージ**: 既存のログメッセージを維持（`Recorded base_commit for squash: ...`）
4. **コメント追加**: Issue番号を明記（`Issue #225: base_commitの記録（スカッシュ機能用）`）

### 8.3 テスト実装時の注意事項

1. **既存テストパターンの踏襲**: `init.test.ts` の既存テスト構造（describe/test）を参考にする
2. **モック化**: Git操作はモック化してユニットテスト、実際のGitリポジトリを使用して統合テスト
3. **テストカバレッジ**: 80%以上を目標（Planning Documentの要件）
4. **リグレッション防止**: 既存のテストが全て成功することを確認

---

**テストシナリオバージョン**: 1.0
**作成日**: 2025-12-05
**Issue番号**: #225
