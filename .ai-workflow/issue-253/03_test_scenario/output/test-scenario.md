# テストシナリオ書

## Issue概要

- **Issue番号**: #253
- **タイトル**: metadata.json から pr_url が消失する（または最初から埋め込まれない）問題
- **状態**: open
- **優先度**: 中（PR情報の欠落によるワークフロー問題）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION** (Phase 2で決定)

### テスト対象の範囲

1. **ユニットテスト対象**:
   - `src/commands/init.ts` の `handleInitCommand()` 関数
   - PR作成後のメタデータコミット&プッシュロジック
   - エラーハンドリングロジック

2. **統合テスト対象**:
   - `init` コマンド実行後のリモートリポジトリへのメタデータ永続化
   - `execute` コマンドでのメタデータ読み込み
   - Git操作とファイルシステムの統合

### テストの目的

1. **バグ修正の検証**: PR作成後の `pr_url` がリモートの `metadata.json` に確実に保存されること
2. **データ整合性の保証**: ローカルとリモートのメタデータが一致すること
3. **エラー耐性の確認**: コミット/プッシュ失敗時に適切なエラーハンドリングが行われること
4. **既存機能の保護**: 既存の `init` コマンド機能に破壊的変更がないこと

---

## 2. ユニットテストシナリオ

### 2.1 PR作成成功後のメタデータコミット&プッシュ

#### テストケース名: handleInitCommand_PR作成成功_正常系

**目的**: PR作成成功後、`pr_url` と `pr_number` がメタデータに保存され、コミット&プッシュが実行されることを検証

**前提条件**:
- `gitManager.commitWorkflowInit()` が成功する（モック）
- `gitManager.pushToRemote()` が成功する（モック）
- `githubClient.createPullRequest()` が成功する（モック）
- `gitManager.commitPhaseOutput()` が成功する（モック）

**入力**:
- `issueUrl`: `"https://github.com/tielec/ai-workflow-agent/issues/253"`
- PR作成結果（モック）:
  ```typescript
  {
    success: true,
    pr_url: "https://github.com/tielec/ai-workflow-agent/pull/123",
    pr_number: 123
  }
  ```

**期待結果**:
1. `metadataManager.data.pr_url` が `"https://github.com/tielec/ai-workflow-agent/pull/123"` に設定される
2. `metadataManager.data.pr_number` が `123` に設定される
3. `metadataManager.save()` が呼ばれる
4. `gitManager.commitPhaseOutput('planning', 'completed', undefined)` が呼ばれる
5. `gitManager.pushToRemote()` が2回呼ばれる（初回コミット + PR情報コミット）
6. エラーログが出力されない

**テストデータ**:
```typescript
const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({
    success: true,
    commit_hash: 'abc123'
  }),
  pushToRemote: jest.fn().mockResolvedValue({
    success: true
  }),
  commitPhaseOutput: jest.fn().mockResolvedValue({
    success: true,
    commit_hash: 'def456'
  }),
};

const mockGitHubClient = {
  createPullRequest: jest.fn().mockResolvedValue({
    success: true,
    pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/123',
    pr_number: 123,
  }),
  checkExistingPr: jest.fn().mockResolvedValue(null),
  getIssue: jest.fn().mockResolvedValue({
    title: 'Test Issue #253',
    body: 'Test issue body',
  }),
};

const mockMetadataManager = {
  data: { pr_url: null, pr_number: null },
  save: jest.fn(),
};
```

---

### 2.2 PR作成成功後のコミット失敗

#### テストケース名: handleInitCommand_PR作成成功_コミット失敗_異常系

**目的**: PR作成後のコミット失敗時、エラーが適切にハンドリングされ、警告ログが出力されることを検証

**前提条件**:
- `gitManager.commitWorkflowInit()` が成功する（モック）
- `githubClient.createPullRequest()` が成功する（モック）
- `gitManager.commitPhaseOutput()` が失敗する（モック）

**入力**:
- `issueUrl`: `"https://github.com/tielec/ai-workflow-agent/issues/253"`
- コミット失敗結果（モック）:
  ```typescript
  {
    success: false,
    error: "Commit failed: nothing to commit"
  }
  ```

**期待結果**:
1. `metadataManager.data.pr_url` が正しく設定される
2. `metadataManager.save()` が呼ばれる
3. `gitManager.commitPhaseOutput()` が呼ばれる
4. 警告ログが出力される: `"Failed to commit PR metadata: Commit failed: nothing to commit. PR info saved locally."`
5. `gitManager.pushToRemote()` が2回目に呼ばれない
6. `handleInitCommand()` がエラーをスローしない（警告のみ）

**テストデータ**:
```typescript
const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({
    success: true
  }),
  pushToRemote: jest.fn().mockResolvedValue({
    success: true
  }),
  commitPhaseOutput: jest.fn().mockResolvedValue({
    success: false,
    error: 'Commit failed: nothing to commit'
  }),
};
```

---

### 2.3 PR作成成功後のプッシュ失敗

#### テストケース名: handleInitCommand_PR作成成功_プッシュ失敗_異常系

**目的**: PR作成後のプッシュ失敗時、エラーが適切にハンドリングされ、警告ログが出力されることを検証

**前提条件**:
- `gitManager.commitWorkflowInit()` が成功する（モック）
- `githubClient.createPullRequest()` が成功する（モック）
- `gitManager.commitPhaseOutput()` が成功する（モック）
- `gitManager.pushToRemote()` が2回目に失敗する（モック）

**入力**:
- `issueUrl`: `"https://github.com/tielec/ai-workflow-agent/issues/253"`
- プッシュ失敗結果（モック）:
  ```typescript
  {
    success: false,
    error: "Push failed: network error"
  }
  ```

**期待結果**:
1. `gitManager.commitPhaseOutput()` が呼ばれる
2. `gitManager.pushToRemote()` が2回呼ばれる（1回目成功、2回目失敗）
3. 警告ログが出力される: `"Failed to push PR metadata: Push failed: network error. PR info saved locally."`
4. `handleInitCommand()` がエラーをスローしない（警告のみ）

**テストデータ**:
```typescript
const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({
    success: true
  }),
  pushToRemote: jest.fn()
    .mockResolvedValueOnce({ success: true })      // 初回プッシュ成功
    .mockResolvedValueOnce({
      success: false,
      error: 'Push failed: network error'
    }),                                             // PR情報プッシュ失敗
  commitPhaseOutput: jest.fn().mockResolvedValue({
    success: true,
    commit_hash: 'def456'
  }),
};
```

---

### 2.4 PR作成失敗

#### テストケース名: handleInitCommand_PR作成失敗_異常系

**目的**: PR作成失敗時、`pr_url` が保存されず、適切な警告ログが出力されることを検証

**前提条件**:
- `gitManager.commitWorkflowInit()` が成功する（モック）
- `githubClient.createPullRequest()` が失敗する（モック）

**入力**:
- `issueUrl`: `"https://github.com/tielec/ai-workflow-agent/issues/253"`
- PR作成失敗結果（モック）:
  ```typescript
  {
    success: false,
    error: "PR creation failed: 401 Unauthorized"
  }
  ```

**期待結果**:
1. `metadataManager.data.pr_url` が `null` のまま
2. `metadataManager.data.pr_number` が `null` のまま
3. `metadataManager.save()` が呼ばれない（PR情報保存処理がスキップされる）
4. `gitManager.commitPhaseOutput()` が呼ばれない
5. 警告ログが出力される: `"PR creation failed: PR creation failed: 401 Unauthorized. Please create manually."`

**テストデータ**:
```typescript
const mockGitHubClient = {
  createPullRequest: jest.fn().mockResolvedValue({
    success: false,
    error: 'PR creation failed: 401 Unauthorized',
  }),
};
```

---

### 2.5 予期しないエラー（例外スロー）

#### テストケース名: handleInitCommand_予期しないエラー_異常系

**目的**: `commitPhaseOutput()` または `pushToRemote()` が例外をスローした場合、エラーが適切にキャッチされ、警告ログが出力されることを検証

**前提条件**:
- `gitManager.commitWorkflowInit()` が成功する（モック）
- `githubClient.createPullRequest()` が成功する（モック）
- `gitManager.commitPhaseOutput()` が例外をスローする（モック）

**入力**:
- `issueUrl`: `"https://github.com/tielec/ai-workflow-agent/issues/253"`
- 例外（モック）:
  ```typescript
  new Error("Unexpected error: EACCES permission denied")
  ```

**期待結果**:
1. `metadataManager.data.pr_url` が正しく設定される
2. `metadataManager.save()` が呼ばれる
3. 警告ログが出力される: `"Failed to commit/push PR metadata: Unexpected error: EACCES permission denied. PR info saved locally."`
4. `handleInitCommand()` がエラーをスローしない（警告のみ）

**テストデータ**:
```typescript
const mockGitManager = {
  commitWorkflowInit: jest.fn().mockResolvedValue({
    success: true
  }),
  pushToRemote: jest.fn().mockResolvedValue({
    success: true
  }),
  commitPhaseOutput: jest.fn().mockRejectedValue(
    new Error('Unexpected error: EACCES permission denied')
  ),
};
```

---

### 2.6 メタデータフィールドの正確性検証

#### テストケース名: handleInitCommand_メタデータフィールド検証_正常系

**目的**: PR作成後、`pr_url` と `pr_number` がメタデータに正確に設定されることを検証

**前提条件**:
- `githubClient.createPullRequest()` が成功する（モック）

**入力**:
- PR作成結果（モック）:
  ```typescript
  {
    success: true,
    pr_url: "https://github.com/owner/repo/pull/456",
    pr_number: 456
  }
  ```

**期待結果**:
1. `metadataManager.data.pr_url` が `"https://github.com/owner/repo/pull/456"` と完全一致
2. `metadataManager.data.pr_number` が `456` と完全一致
3. 型が正しい（`pr_url` は `string`、`pr_number` は `number`）

**テストデータ**:
```typescript
const mockGitHubClient = {
  createPullRequest: jest.fn().mockResolvedValue({
    success: true,
    pr_url: 'https://github.com/owner/repo/pull/456',
    pr_number: 456,
  }),
};
```

---

### 2.7 コミットメッセージ形式の検証

#### テストケース名: handleInitCommand_コミットメッセージ形式検証_正常系

**目的**: PR情報のコミット時、正しいパラメータで `commitPhaseOutput()` が呼ばれることを検証

**前提条件**:
- `githubClient.createPullRequest()` が成功する（モック）
- `gitManager.commitPhaseOutput()` がモック化されている

**入力**:
- なし（デフォルトパラメータ）

**期待結果**:
1. `gitManager.commitPhaseOutput()` が以下のパラメータで呼ばれる:
   - 第1引数: `'planning'`
   - 第2引数: `'completed'`
   - 第3引数: `undefined`

**テストデータ**:
```typescript
expect(mockGitManager.commitPhaseOutput).toHaveBeenCalledWith(
  'planning',
  'completed',
  undefined,
);
```

---

## 3. 統合テストシナリオ

### 3.1 init コマンド実行後のリモートメタデータ永続化

#### シナリオ名: init_コマンド_PR_URL_リモート永続化

**目的**: `init` コマンド実行後、リモートリポジトリの `metadata.json` に `pr_url` が保存されることを検証

**前提条件**:
- テスト用のGitリポジトリが初期化されている
- GitHub APIのモックまたは実際のテストリポジトリが利用可能
- 認証情報（`GITHUB_TOKEN`）が設定されている

**テスト手順**:

1. **セットアップ**:
   ```bash
   # テスト用リポジトリを初期化
   mkdir -p /tmp/test-init-pr-url
   cd /tmp/test-init-pr-url
   git init
   git config user.name "Test User"
   git config user.email "test@example.com"
   git remote add origin https://github.com/test-org/test-repo.git
   ```

2. **init コマンド実行**:
   ```bash
   node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/253
   ```

3. **リモートブランチ確認**:
   ```bash
   git fetch origin
   git branch -r | grep "origin/ai-workflow/issue-253"
   ```

4. **リモートメタデータ確認**:
   ```bash
   git show origin/ai-workflow/issue-253:.ai-workflow/issue-253/metadata.json
   ```

5. **pr_url フィールド検証**:
   ```typescript
   const metadata = JSON.parse(remoteMetadataContent);
   expect(metadata.pr_url).toBeDefined();
   expect(metadata.pr_url).toMatch(/^https:\/\/github\.com\/.*\/pull\/\d+$/);
   expect(metadata.pr_number).toBeGreaterThan(0);
   ```

**期待結果**:
- リモートブランチ `origin/ai-workflow/issue-253` が存在する
- リモートの `metadata.json` に `pr_url` フィールドが存在する
- `pr_url` が GitHub PR URL の形式（`https://github.com/{owner}/{repo}/pull/{number}`）に一致する
- `pr_number` が正の整数である

**確認項目チェックリスト**:
- [ ] リモートブランチが作成されている
- [ ] `metadata.json` がリモートにプッシュされている
- [ ] `pr_url` フィールドが存在する
- [ ] `pr_url` が正しいURL形式である
- [ ] `pr_number` が正の整数である
- [ ] コミット履歴に2つのコミットが存在する（初回コミット + PR情報コミット）

---

### 3.2 execute コマンドでのメタデータ読み込み

#### シナリオ名: execute_コマンド_PR_URL_読み込み

**目的**: `init` コマンド実行後、`execute` コマンド開始時に `pr_url` が正しく読み込まれることを検証

**前提条件**:
- `init` コマンドが正常に完了している
- リモートリポジトリに `pr_url` を含む `metadata.json` がプッシュされている

**テスト手順**:

1. **init コマンド実行**（前提条件の確立）:
   ```bash
   node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/253
   ```

2. **ローカルリポジトリのクリーンアップ**（リモートからの読み込みを強制）:
   ```bash
   rm -rf .ai-workflow/issue-253
   git checkout ai-workflow/issue-253
   git pull origin ai-workflow/issue-253
   ```

3. **MetadataManager でメタデータ読み込み**:
   ```typescript
   import { MetadataManager } from './src/core/metadata-manager.js';

   const metadataPath = '.ai-workflow/issue-253/metadata.json';
   const metadataManager = new MetadataManager(metadataPath);

   console.log('PR URL:', metadataManager.data.pr_url);
   console.log('PR Number:', metadataManager.data.pr_number);
   ```

4. **execute コマンド実行**（オプション）:
   ```bash
   node dist/index.js execute --issue 253 --phase planning
   ```

5. **ログ確認**:
   ```bash
   # ログに PR URL が記録されていることを確認
   grep "PR URL:" logs/ai-workflow.log
   ```

**期待結果**:
- `metadataManager.data.pr_url` が `null` でない
- `metadataManager.data.pr_url` が GitHub PR URL の形式に一致する
- `metadataManager.data.pr_number` が正の整数である
- `execute` コマンドのログに PR URL が記録される（実装されている場合）

**確認項目チェックリスト**:
- [ ] `metadata.json` が正しく読み込まれる
- [ ] `pr_url` フィールドが存在する
- [ ] `pr_url` が正しいURL形式である
- [ ] `pr_number` が正の整数である
- [ ] `execute` コマンドが正常に実行される（エラーなし）

---

### 3.3 Git操作の統合テスト（コミット&プッシュ）

#### シナリオ名: Git操作_コミット_プッシュ_統合

**目的**: PR作成後のコミット&プッシュが実際のGit操作として正常に実行されることを検証

**前提条件**:
- テスト用のGitリポジトリが初期化されている
- リモートリポジトリが設定されている（またはローカルベアリポジトリ）

**テスト手順**:

1. **ローカルベアリポジトリ作成**（テスト用）:
   ```bash
   mkdir -p /tmp/test-remote-repo.git
   cd /tmp/test-remote-repo.git
   git init --bare
   ```

2. **テスト用リポジトリセットアップ**:
   ```bash
   mkdir -p /tmp/test-init-repo
   cd /tmp/test-init-repo
   git init
   git config user.name "Test User"
   git config user.email "test@example.com"
   git remote add origin /tmp/test-remote-repo.git
   ```

3. **init コマンド実行**:
   ```bash
   node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/253
   ```

4. **コミット履歴確認**:
   ```bash
   git log --oneline
   # 期待: 2つのコミットが存在
   # - [ai-workflow] Phase 0 (planning) - init completed
   # - [ai-workflow] Phase 0 (planning) - completed
   ```

5. **リモートコミット確認**:
   ```bash
   git ls-remote origin ai-workflow/issue-253
   # 期待: ブランチが存在し、コミットハッシュが表示される
   ```

6. **リモートファイル確認**:
   ```bash
   git fetch origin
   git show origin/ai-workflow/issue-253:.ai-workflow/issue-253/metadata.json | jq '.pr_url'
   # 期待: PR URLが表示される
   ```

**期待結果**:
- ローカルに2つのコミットが作成される（初回コミット + PR情報コミット）
- リモートリポジトリにブランチが作成される
- リモートの `metadata.json` に `pr_url` が含まれる
- コミットメッセージが既存の形式に従っている

**確認項目チェックリスト**:
- [ ] ローカルに2つのコミットが存在する
- [ ] リモートブランチが作成されている
- [ ] リモートに `metadata.json` がプッシュされている
- [ ] `metadata.json` に `pr_url` が含まれる
- [ ] コミットメッセージが正しい形式である

---

### 3.4 エラーリカバリーテスト（プッシュ失敗からのリトライ）

#### シナリオ名: プッシュ失敗_リトライ_統合

**目的**: プッシュ失敗時、既存のリトライロジックが正常に機能することを検証

**前提条件**:
- テスト用のGitリポジトリが初期化されている
- リモートリポジトリが一時的に利用不可（ネットワークエラーシミュレーション）

**テスト手順**:

1. **リモートリポジトリを一時的に無効化**:
   ```bash
   # リモートURLを無効なURLに変更
   git remote set-url origin https://invalid-host.example.com/repo.git
   ```

2. **init コマンド実行**（プッシュ失敗を期待）:
   ```bash
   node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/253
   ```

3. **ログ確認**:
   ```bash
   # リトライログが出力されることを確認
   grep "Retrying" logs/ai-workflow.log
   grep "Failed to push" logs/ai-workflow.log
   ```

4. **ローカルメタデータ確認**:
   ```bash
   cat .ai-workflow/issue-253/metadata.json | jq '.pr_url'
   # 期待: PR URLが保存されている（ローカルのみ）
   ```

5. **リモートURL修正後、手動プッシュ**:
   ```bash
   git remote set-url origin /tmp/test-remote-repo.git
   git push origin ai-workflow/issue-253
   ```

6. **リモートメタデータ確認**:
   ```bash
   git show origin/ai-workflow/issue-253:.ai-workflow/issue-253/metadata.json | jq '.pr_url'
   # 期待: PR URLが表示される
   ```

**期待結果**:
- プッシュ失敗時、リトライロジックが実行される（最大3回）
- リトライ失敗後、警告ログが出力される
- ローカルの `metadata.json` には `pr_url` が保存されている
- 手動プッシュ後、リモートにも `pr_url` が反映される

**確認項目チェックリスト**:
- [ ] リトライログが出力される
- [ ] 警告ログが出力される（"Failed to push PR metadata"）
- [ ] ローカルの `metadata.json` に `pr_url` が存在する
- [ ] 手動プッシュ後、リモートにも `pr_url` が反映される

---

### 3.5 既存テストの破壊がないことを確認

#### シナリオ名: 既存テスト_後方互換性

**目的**: コード修正後、既存のユニットテスト・統合テストがすべてパスすることを検証

**前提条件**:
- コード修正が完了している
- テスト環境が整っている

**テスト手順**:

1. **ユニットテスト実行**:
   ```bash
   npm run test:unit
   ```

2. **統合テスト実行**:
   ```bash
   npm run test:integration
   ```

3. **テスト結果確認**:
   ```bash
   # すべてのテストがパスすることを確認
   # FAIL が0件であることを確認
   ```

4. **カバレッジ確認**（オプション）:
   ```bash
   npm run test:coverage
   # 変更箇所のカバレッジが80%以上であることを確認
   ```

**期待結果**:
- すべての既存ユニットテストがパスする
- すべての既存統合テストがパスする
- 新規追加コードのカバレッジが80%以上である

**確認項目チェックリスト**:
- [ ] ユニットテストがすべてパスする
- [ ] 統合テストがすべてパスする
- [ ] テスト失敗（FAIL）が0件である
- [ ] カバレッジが基準（80%）を満たす
- [ ] 既存のテストケースに破壊的変更がない

---

## 4. テストデータ

### 4.1 正常データ

#### Issue情報
```json
{
  "issueNumber": 253,
  "issueUrl": "https://github.com/tielec/ai-workflow-agent/issues/253",
  "issueTitle": "metadata.json から pr_url が消失する問題",
  "issueBody": "PR作成後の metadata.json がコミット&プッシュされていない"
}
```

#### PR作成結果（正常）
```json
{
  "success": true,
  "pr_url": "https://github.com/tielec/ai-workflow-agent/pull/123",
  "pr_number": 123
}
```

#### metadata.json（PR作成後）
```json
{
  "issue_number": 253,
  "issue_url": "https://github.com/tielec/ai-workflow-agent/issues/253",
  "branch_name": "ai-workflow/issue-253",
  "pr_url": "https://github.com/tielec/ai-workflow-agent/pull/123",
  "pr_number": 123,
  "workflow_status": "in_progress",
  "created_at": "2025-12-06T01:30:00.000Z"
}
```

### 4.2 異常データ

#### PR作成結果（失敗）
```json
{
  "success": false,
  "error": "PR creation failed: 401 Unauthorized"
}
```

#### コミット結果（失敗）
```json
{
  "success": false,
  "error": "Commit failed: nothing to commit"
}
```

#### プッシュ結果（失敗）
```json
{
  "success": false,
  "error": "Push failed: network error"
}
```

### 4.3 境界値データ

#### PR番号の境界値
```typescript
// 最小値
{ pr_number: 1 }

// 大きな値
{ pr_number: 999999 }

// null（PR作成失敗時）
{ pr_number: null }
```

#### PR URLの形式バリエーション
```typescript
// 標準形式
"https://github.com/owner/repo/pull/123"

// 企業GitHubインスタンス
"https://github.enterprise.com/owner/repo/pull/123"

// null（PR作成失敗時）
null
```

---

## 5. テスト環境要件

### 5.1 ユニットテスト環境

**必要な環境**:
- Node.js 20以上
- npm 10以上
- Jest テストフレームワーク
- TypeScript 5.x

**モック/スタブの必要性**:
- `GitManager`: コミット&プッシュ操作をモック化
- `GitHubClient`: PR作成操作をモック化
- `MetadataManager`: メタデータ保存操作をモック化
- `Logger`: ログ出力をモック化（検証用）

**セットアップコマンド**:
```bash
npm install
npm run build
```

**テスト実行コマンド**:
```bash
npm run test:unit
```

### 5.2 統合テスト環境

**必要な環境**:
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- テスト用Gitリポジトリ（ローカルベアリポジトリ推奨）
- GitHub API（モックまたは実際のテストリポジトリ）

**環境変数**:
```bash
# GitHub Personal Access Token（実際のGitHub APIを使用する場合）
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# テスト用リポジトリパス
export TEST_REPO_ROOT="/tmp/test-init-pr-url"
```

**セットアップコマンド**:
```bash
# ローカルベアリポジトリ作成
mkdir -p /tmp/test-remote-repo.git
cd /tmp/test-remote-repo.git
git init --bare

# テスト用リポジトリ作成
mkdir -p /tmp/test-init-pr-url
cd /tmp/test-init-pr-url
git init
git config user.name "Test User"
git config user.email "test@example.com"
git remote add origin /tmp/test-remote-repo.git
```

**テスト実行コマンド**:
```bash
npm run test:integration
```

**クリーンアップコマンド**:
```bash
rm -rf /tmp/test-init-pr-url
rm -rf /tmp/test-remote-repo.git
```

### 5.3 CI/CD環境

**必要な環境**:
- GitHub Actions または Jenkins
- Docker（コンテナ化されたテスト環境）
- Git、Node.js、npm

**CI/CDパイプライン**:
```yaml
# .github/workflows/test.yml の例
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm run test:unit
      - run: npm run test:integration
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 6. 品質ゲート確認（Phase 3）

以下の品質ゲートを満たしていることを確認しました：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_INTEGRATION（Phase 2で決定）
  - ユニットテストシナリオ: 7件（セクション2）
  - 統合テストシナリオ: 5件（セクション3）

- [x] **主要な正常系がカバーされている**
  - ユニットテスト: PR作成成功後のメタデータコミット&プッシュ（2.1）
  - 統合テスト: init コマンド実行後のリモートメタデータ永続化（3.1）
  - 統合テスト: execute コマンドでのメタデータ読み込み（3.2）

- [x] **主要な異常系がカバーされている**
  - ユニットテスト: PR作成成功後のコミット失敗（2.2）
  - ユニットテスト: PR作成成功後のプッシュ失敗（2.3）
  - ユニットテスト: PR作成失敗（2.4）
  - ユニットテスト: 予期しないエラー（2.5）
  - 統合テスト: プッシュ失敗からのリトライ（3.4）

- [x] **期待結果が明確である**
  - すべてのテストケースに具体的な期待結果を記載
  - 検証可能な形式（モック呼び出し回数、フィールド値、ログメッセージ）
  - 統合テストには確認項目チェックリストを追加

---

## 7. テストカバレッジ目標

### 7.1 コードカバレッジ

**目標**: 新規追加コード（`src/commands/init.ts` のPR情報コミット&プッシュ処理）のカバレッジ **80%以上**

**カバレッジ対象**:
- PR作成成功後のメタデータ保存ロジック
- `gitManager.commitPhaseOutput()` 呼び出し
- `gitManager.pushToRemote()` 呼び出し
- エラーハンドリング（コミット失敗、プッシュ失敗、例外）
- ログ出力（成功時、失敗時）

### 7.2 要件カバレッジ

**要件定義書の受け入れ基準との対応**:

| 受け入れ基準 | 対応するテストシナリオ | カバレッジ |
|------------|---------------------|----------|
| AC-1: PR作成後の `pr_url` がリモートの `metadata.json` に保存される | 統合テスト 3.1 | ✅ |
| AC-2: `execute` コマンド開始時に `pr_url` が正しく読み込める | 統合テスト 3.2 | ✅ |
| AC-3: 既存のテストがすべてパスする | 統合テスト 3.5 | ✅ |
| AC-4: PR作成失敗時に適切なエラーログが出力される | ユニットテスト 2.4 | ✅ |
| AC-5: コミット&プッシュ失敗時に警告ログが出力される | ユニットテスト 2.2, 2.3 | ✅ |

**カバレッジ**: **100%**（すべての受け入れ基準がテストシナリオでカバーされている）

---

## 8. テスト実行スケジュール

### Phase 4（実装）完了後

1. **ユニットテスト実行** (Phase 6-1):
   - `npm run test:unit`
   - 所要時間: 約5分
   - すべてのテストがパスすることを確認

2. **統合テスト実行** (Phase 6-2):
   - `npm run test:integration`
   - 所要時間: 約10分
   - エンドツーエンドの動作確認

3. **カバレッジ確認**:
   - `npm run test:coverage`
   - 新規追加コードのカバレッジが80%以上であることを確認

### CI/CDパイプライン

- **トリガー**: PR作成時、コミットプッシュ時
- **実行内容**:
  1. ユニットテスト
  2. 統合テスト
  3. カバレッジレポート生成
  4. 品質ゲート検証

---

## 9. 次ステップ

Phase 4（実装）に進み、以下を実施してください：

1. **`src/commands/init.ts` の修正**:
   - `handleInitCommand()` 関数内にPR情報のコミット&プッシュ処理を追加
   - エラーハンドリングを追加
   - ログ出力を追加

2. **Phase 5（テストコード実装）**:
   - ユニットテストの実装（`tests/unit/commands/init.test.ts` 修正）
   - 統合テストの実装（`tests/integration/init-pr-url.test.ts` 新規作成）

3. **Phase 6（テスト実行）**:
   - 本テストシナリオに基づいてテスト実行
   - 品質ゲート検証

---

**経過時間**: テストシナリオフェーズ完了
**ステータス**: Phase 3 品質ゲート通過 ✅
