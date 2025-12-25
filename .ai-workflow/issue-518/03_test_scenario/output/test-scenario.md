# テストシナリオ: Issue #518

## [FOLLOW-UP] #510: finalize-command.test.ts・Jest モックの一貫したパターン確立

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**INTEGRATION_ONLY**

Planning Document と要件定義書に基づき、インテグレーションテストのみを対象とする。

### テスト戦略の根拠

| 観点 | 判断 |
|------|------|
| 主目的 | `tests/integration/finalize-command.test.ts` の ESM モック問題を解消する |
| スコープ | 既存テストのリファクタリング（新規テスト追加なし） |
| 検証方法 | 既存インテグレーションテストの実行成功をもって検証完了 |
| BDD テスト | 不要（テストインフラ修正であり、ユーザーストーリーに直接関係しない） |
| ユニットテスト追加 | 不要（既存テストのモック記法変更のみ） |

### テスト対象の範囲

| 対象ファイル | 役割 | 変更内容 |
|-------------|------|----------|
| `tests/integration/finalize-command.test.ts` | 主要対象 | ESM 互換モックパターンへの変更 |
| `tests/integration/cleanup-command.test.ts` | 代表ファイル | パターン統一（代表例） |
| `__mocks__/fs-extra.ts` | モック定義 | `__esModule: true` の追加確認 |

### テストの目的

1. **ESM モック関連の TypeError を解消する**
   - 現状: `TypeError: fs.existsSync.mockReturnValue is not a function`
   - 目標: すべてのモック関数が正しく動作する

2. **既存テストケースの期待値を維持する**
   - テストロジックは変更せず、モック設定部分のみ修正
   - 呼び出し回数・戻り値のアサーションが維持される

3. **モックパターンを標準化する**
   - `jest.unstable_mockModule()` パターンへの統一
   - `beforeAll` での非同期モック設定
   - `__esModule: true` の明示

---

## 2. 現状分析

### 2.1 現在の問題

テスト実行時に以下のエラーが発生:

```
TypeError: fs.existsSync.mockReturnValue is not a function

    at Object.<anonymous> (tests/integration/finalize-command.test.ts:150:34)
```

### 2.2 原因分析

| 問題 | 詳細 |
|------|------|
| **同期的 `jest.mock()` の使用** | ESM 環境では `jest.unstable_mockModule()` が必要 |
| **モック設定前のインポート** | 動的インポートパターンが必要 |
| **`__esModule: true` の欠如** | ESM 互換性フラグが設定されていない |
| **モックホイスティングへの依存** | ESM ではホイスティングが正しく機能しない |

### 2.3 テンプレート（正常なパターン）

`tests/unit/pr-comment/finalize-command.test.ts` で使用されている ESM 互換パターン:

```typescript
beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
  }));

  // モック設定後に動的インポート
  const module = await import('../../../src/commands/pr-comment/finalize.js');
  handlePRCommentFinalizeCommand = module.handlePRCommentFinalizeCommand;
});
```

---

## 3. Integrationテストシナリオ

### 3.1 テスト実行成功の検証シナリオ

#### シナリオ IT-VERIFY-01: finalize-command.test.ts の全テスト成功

**目的**: ESM モック修正後、既存の16テストケースがすべて成功することを検証

**前提条件**:
- `npm install` が完了している
- ESM 互換モックパターンへの変更が完了している

**テスト手順**:
1. `npm test -- tests/integration/finalize-command.test.ts` を実行
2. テスト結果を確認

**期待結果**:
- [ ] ESM モック関連の TypeError が発生しない
- [ ] 全16テストケースが PASS する
- [ ] モック関数の呼び出しアサーションが成功する

**確認項目**:
```
Tests:       16 passed, 16 total
```

---

#### シナリオ IT-VERIFY-02: IT-01 正常系テストの動作検証

**シナリオ名**: 統合テスト_正常系_全ステップ完全実行

**目的**: finalize --issue 123 で全5ステップが順次実行されることを検証

**前提条件**:
- メタデータファイルが存在する（モック）
- Git リポジトリが正常状態（モック）
- GitHub API が利用可能（モック）

**テスト手順**:
1. モック関数の初期設定
   - `fs.existsSync` → `true`
   - `fs.readFileSync` → メタデータJSON
   - `mockRevparse` → `'head-before-cleanup\n'`
2. `handleFinalizeCommand({ issueNumber: 123, ... })` を実行
3. 各ステップの実行を確認

**期待結果**:
- [ ] Step 1: アーティファクトクリーンアップ実行
- [ ] Step 2: Git コミット実行
- [ ] Step 3: スカッシュ実行
- [ ] Step 4: Git プッシュ実行
- [ ] Step 5: PR 更新実行

**確認項目**:
- [ ] `mockCleanupWorkflowArtifacts` が1回呼び出される
- [ ] `mockCommitWorkflowDeletion` が1回呼び出される
- [ ] `mockSquashCommitsForFinalize` が1回呼び出される
- [ ] `mockPushToRemote` が1回呼び出される
- [ ] `mockUpdatePullRequest` が1回呼び出される

---

#### シナリオ IT-VERIFY-03: IT-510 non-fast-forward テストの動作検証

**シナリオ名**: non-fast-forward で HEAD が更新されてもスカッシュ対象を維持

**目的**: Issue #510 の修正が正しく機能することを検証

**前提条件**:
- headBeforeCleanup が Step 1 で取得されている
- non-fast-forward プッシュが発生する可能性がある

**テスト手順**:
1. IT-510-001 ~ IT-510-005 の各テストケースを実行
2. headBeforeCleanup の伝播を確認

**期待結果**:
- [ ] IT-510-001: pull を挟んでも headBeforeCleanup でスカッシュする
- [ ] IT-510-002: headCommit 未指定時は HEAD を終点にする
- [ ] IT-510-003: Step 1 の headBeforeCleanup を Step 3 に伝播する
- [ ] IT-510-004: 既存 IT-12 相当のコンテキストで後方互換を維持する
- [ ] IT-510-005: Step 1 で HEAD 取得に失敗した場合はエラーにする

**確認項目**:
- [ ] `mockSquashCommitsForFinalize` の引数に `headBeforeCleanup` が含まれる
- [ ] 後方互換性が維持される

---

#### シナリオ IT-VERIFY-04: エラーハンドリングテストの動作検証

**シナリオ名**: 異常系テストの動作検証

**目的**: エラー条件での適切な終了を検証

**前提条件**:
- 各エラー条件を模擬するモック設定

**テスト手順**:
1. IT-05: base_commit 不在時のテスト実行
2. IT-06: PR 不在時のテスト実行
3. IT-07: GitHub API 権限不足時のテスト実行

**期待結果**:
- [ ] IT-05: base_commit 不在時に適切なエラーで終了する
- [ ] IT-06: PR 不在時に適切なエラーで終了する
- [ ] IT-07: GitHub API 権限不足時に適切なエラーで終了する

**確認項目**:
- [ ] 各エラーケースで `expect(...).rejects.toThrow()` が成功する

---

#### シナリオ IT-VERIFY-05: モジュール連携テストの動作検証

**シナリオ名**: モジュール間連携の動作検証

**目的**: 各モジュールとの連携が正常に動作することを検証

**前提条件**:
- 各モジュールのモックが正しく設定されている

**テスト手順**:
1. IT-10: MetadataManager 連携テスト実行
2. IT-11: ArtifactCleaner 連携テスト実行
3. IT-12: SquashManager 連携テスト実行
4. IT-13: PullRequestClient 連携テスト実行

**期待結果**:
- [ ] 各モジュールのモック関数が期待通りに呼び出される
- [ ] 連携時のデータフローが正しい

**確認項目**:
- [ ] `MetadataManager` インスタンスが正しく作成される
- [ ] `ArtifactCleaner.cleanupWorkflowArtifacts` が呼び出される
- [ ] `SquashManager.squashCommitsForFinalize` が呼び出される
- [ ] `PullRequestClient` メソッドが呼び出される

---

#### シナリオ IT-VERIFY-06: Git操作エラーハンドリングテストの動作検証

**シナリオ名**: Git 操作エラー時の動作検証

**目的**: Git 操作失敗時に適切なエラーがスローされることを検証

**前提条件**:
- Git 操作をモックでエラーにする

**テスト手順**:
1. IT-GIT-ERR-01: Git コミット失敗時のテスト実行
2. IT-GIT-ERR-02: Git プッシュ失敗時のテスト実行

**期待結果**:
- [ ] コミット失敗時に適切なエラーがスローされる
- [ ] プッシュ失敗時に適切なエラーがスローされる

**確認項目**:
- [ ] エラーメッセージが適切

---

### 3.2 代表ファイルのパターン統一検証シナリオ

#### シナリオ IT-PATTERN-01: cleanup-command.test.ts のモックパターン統一

**目的**: 代表ファイルでのモックパターン統一を検証

**前提条件**:
- ESM 互換モックパターンへの変更が完了している

**テスト手順**:
1. `npm test -- tests/integration/cleanup-command.test.ts` を実行
2. テスト結果を確認

**期待結果**:
- [ ] ESM モック関連のエラーが発生しない
- [ ] 既存テストが PASS する
- [ ] モック初期化エラーがない

**確認項目**:
- [ ] `jest.unstable_mockModule()` パターンが使用されている
- [ ] `__esModule: true` が設定されている
- [ ] 動的インポートが使用されている

---

### 3.3 全テストスイートのリグレッション検証シナリオ

#### シナリオ IT-REGRESSION-01: 全テストスイートの実行

**目的**: モックパターン変更による既存テストへのリグレッションがないことを検証

**前提条件**:
- すべてのモックパターン変更が完了している
- `__mocks__/fs-extra.ts` が ESM 対応している

**テスト手順**:
1. `npm test` を実行
2. テスト結果を確認

**期待結果**:
- [ ] 全テストスイートが PASS する
- [ ] 新たなテスト失敗が発生しない
- [ ] モック初期化エラーがない

**確認項目**:
- [ ] テスト実行時間が許容範囲内（±10%）
- [ ] 既存のアサーションが維持されている

---

## 4. テストデータ

### 4.1 正常系テストデータ

#### 基本メタデータ

```typescript
const baseMetadata = {
  issueNumber: 123,
  baseBranch: 'main',
  workBranch: 'ai-work/issue-123',
  currentPhase: 'implementation',
  base_commit: 'abc123',
  pr_number: 456,
  repository: 'owner/repo',
};
```

#### オプション設定

```typescript
const defaultOptions = {
  issueNumber: 123,
  baseBranch: 'main',
  skipSquash: false,
  skipPrUpdate: false,
  dryRun: false,
};
```

### 4.2 異常系テストデータ

#### base_commit 不在

```typescript
const metadataWithoutBaseCommit = {
  issueNumber: 123,
  baseBranch: 'main',
  workBranch: 'ai-work/issue-123',
  currentPhase: 'implementation',
  // base_commit: 欠落
  pr_number: 456,
};
```

#### PR 不在

```typescript
const metadataWithoutPR = {
  issueNumber: 123,
  baseBranch: 'main',
  workBranch: 'ai-work/issue-123',
  currentPhase: 'implementation',
  base_commit: 'abc123',
  // pr_number: 欠落
};
```

### 4.3 IT-510 関連テストデータ

#### headBeforeCleanup の伝播

```typescript
const headBeforeCleanup = 'head-before-cleanup';

const metadataWithHeadBeforeCleanup = {
  ...baseMetadata,
  headBeforeCleanup: 'head-before-cleanup',
};
```

---

## 5. モック設定

### 5.1 fs-extra モック

```typescript
const mockExistsSync = jest.fn<() => boolean>();
const mockEnsureDirSync = jest.fn<() => void>();
const mockWriteFileSync = jest.fn<() => void>();
const mockReadFileSync = jest.fn<() => string>();
const mockStatSync = jest.fn();
const mockReaddirSync = jest.fn<() => string[]>();
const mockRemoveSync = jest.fn<() => void>();
const mockMkdirSync = jest.fn<() => void>();

await jest.unstable_mockModule('fs-extra', () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    ensureDirSync: mockEnsureDirSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    statSync: mockStatSync,
    readdirSync: mockReaddirSync,
    removeSync: mockRemoveSync,
    mkdirSync: mockMkdirSync,
  },
  existsSync: mockExistsSync,
  ensureDirSync: mockEnsureDirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  statSync: mockStatSync,
  readdirSync: mockReaddirSync,
  removeSync: mockRemoveSync,
  mkdirSync: mockMkdirSync,
}));
```

### 5.2 simple-git モック

```typescript
const mockRevparse = jest.fn<() => Promise<string>>();

await jest.unstable_mockModule('simple-git', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    revparse: mockRevparse,
  })),
}));
```

### 5.3 内部モジュールモック

```typescript
const mockFindWorkflowMetadata = jest.fn();
const mockCommitWorkflowDeletion = jest.fn();
const mockPushToRemote = jest.fn();
const mockSquashCommitsForFinalize = jest.fn();
const mockCleanupWorkflowArtifacts = jest.fn();
const mockUpdatePullRequest = jest.fn();

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  findWorkflowMetadata: mockFindWorkflowMetadata,
}));

await jest.unstable_mockModule('../../src/core/git-manager.js', () => ({
  __esModule: true,
  GitManager: jest.fn().mockImplementation(() => ({
    commitWorkflowDeletion: mockCommitWorkflowDeletion,
    pushToRemote: mockPushToRemote,
    getSquashManager: jest.fn().mockReturnValue({
      squashCommitsForFinalize: mockSquashCommitsForFinalize,
    }),
  })),
}));
```

---

## 6. テスト環境要件

### 6.1 実行環境

| 項目 | 要件 |
|------|------|
| Node.js | 18.x 以上 |
| npm | 最新安定版 |
| Jest | 29.x |
| ts-jest | 29.x |

### 6.2 環境変数

```bash
NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=4096"
```

### 6.3 テスト実行コマンド

```bash
# 対象テストのみ実行
npm test -- tests/integration/finalize-command.test.ts

# 代表ファイルのテスト実行
npm test -- tests/integration/cleanup-command.test.ts

# 全テストスイート実行
npm test
```

### 6.4 外部サービス・データベース

**不要** - すべてモックで代替

### 6.5 モック/スタブの必要性

| モジュール | 必要性 | 理由 |
|-----------|--------|------|
| fs-extra | 必須 | ファイルシステム操作のモック |
| simple-git | 必須 | Git 操作のモック |
| GitManager | 必須 | Git 高レベル操作のモック |
| GitHubClient | 必須 | GitHub API 操作のモック |
| ArtifactCleaner | 必須 | アーティファクトクリーンアップのモック |

---

## 7. 受け入れ基準との対応

| 受け入れ基準 | 対応シナリオ | 検証方法 |
|-------------|-------------|----------|
| AC-01: `finalize-command.test.ts` が成功する | IT-VERIFY-01 ~ IT-VERIFY-06 | `npm test -- tests/integration/finalize-command.test.ts` |
| AC-02: 代表テストでモック初期化エラーなし | IT-PATTERN-01 | `npm test -- tests/integration/cleanup-command.test.ts` |
| AC-03: モックガイドラインの明文化 | - | `tests/MOCK_GUIDELINES.md` の存在確認 |
| AC-04: 全テストスイートのリグレッションなし | IT-REGRESSION-01 | `npm test` |

---

## 8. 品質ゲート達成状況

| 品質ゲート | 状況 | 備考 |
|-----------|------|------|
| Phase 2の戦略に沿ったテストシナリオである | :white_check_mark: 達成 | INTEGRATION_ONLY 戦略に準拠 |
| 主要な正常系がカバーされている | :white_check_mark: 達成 | IT-01 ~ IT-04, IT-510 シナリオ |
| 主要な異常系がカバーされている | :white_check_mark: 達成 | IT-05 ~ IT-07, IT-GIT-ERR シナリオ |
| 期待結果が明確である | :white_check_mark: 達成 | 各シナリオに具体的な期待結果を記載 |

---

## 9. テストケース一覧（全16ケース）

| ID | カテゴリ | テスト名 | 検証内容 |
|----|---------|---------|----------|
| IT-01 | 正常系 | 全5ステップ完全実行 | finalize --issue 123 の全ステップ実行 |
| IT-02 | 正常系 | develop指定 | --base-branch develop でマージ先変更 |
| IT-03 | 正常系 | skip-squash | --skip-squash でスカッシュスキップ |
| IT-04 | 正常系 | skip-pr-update | --skip-pr-update でPR更新スキップ |
| IT-510-001 | #510対応 | pull を挟んでも headBeforeCleanup でスカッシュ | non-fast-forward 対応 |
| IT-510-002 | #510対応 | headCommit 未指定時は HEAD を終点に | デフォルト動作 |
| IT-510-003 | #510対応 | Step 1 の headBeforeCleanup を Step 3 に伝播 | データフロー |
| IT-510-004 | #510対応 | 既存 IT-12 相当のコンテキストで後方互換維持 | 後方互換性 |
| IT-510-005 | #510対応 | Step 1 で HEAD 取得失敗時はエラー | エラーハンドリング |
| IT-05 | 異常系 | base_commit 不在でエラー終了 | 必須データ欠落 |
| IT-06 | 異常系 | PR 不在でエラー終了 | 必須データ欠落 |
| IT-07 | 異常系 | GitHub API 権限不足 | API エラー |
| IT-10 | 連携 | MetadataManager 連携 | モジュール連携 |
| IT-11 | 連携 | ArtifactCleaner 連携 | モジュール連携 |
| IT-12 | 連携 | SquashManager 連携 | モジュール連携 |
| IT-13 | 連携 | PullRequestClient 連携 | モジュール連携 |
| IT-GIT-ERR-01 | Git エラー | コミット失敗時のエラー | Git エラーハンドリング |
| IT-GIT-ERR-02 | Git エラー | プッシュ失敗時のエラー | Git エラーハンドリング |

---

*作成日: 2025-01-20*
*作成者: AI Workflow Agent*
*Issue 番号: #518*
*関連 Issue: #510*
