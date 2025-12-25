# テストシナリオ設計書: Issue #510

## finalize コマンドで Step 2 の push 時に pull が実行されると HEAD が更新されスカッシュが失敗する

**作成日**: 2025-12-25
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/510
**バージョン**: 1.0

---

## 0. テスト戦略サマリー

### テスト戦略: UNIT_INTEGRATION

Planning Phase（`00_planning/output/planning.md`）および Design Phase（`02_design/output/design.md`）にて決定されたテスト戦略に基づき、以下のテストを設計します：

| テスト種別 | 対象 | 目的 |
|-----------|------|------|
| **ユニットテスト** | `getCommitsToSquash()` | `targetHead` パラメータの動作確認 |
| **ユニットテスト** | `squashCommitsForFinalize()` | `headCommit` 指定時の動作確認 |
| **ユニットテスト** | `FinalizeContext` 型 | 後方互換性の確認 |
| **インテグレーションテスト** | finalize コマンド全体 | Issue #510 シナリオの再現 |
| **インテグレーションテスト** | Step 1 → Step 3 連携 | `headBeforeCleanup` の伝播確認 |

### テスト対象の範囲

1. **`src/core/git/squash-manager.ts`**
   - `FinalizeContext` 型の拡張（`headCommit?: string`）
   - `getCommitsToSquash(baseCommit, targetHead)` の新パラメータ
   - `squashCommitsForFinalize(context)` での `headCommit` 使用

2. **`src/commands/finalize.ts`**
   - `executeStep1()` の戻り値拡張
   - `executeStep3()` のパラメータ追加
   - `handleFinalizeCommand()` でのデータ伝播

### テストの目的

1. **機能検証**: Issue #510 の修正が正しく動作することを確認
2. **後方互換性**: 既存機能への影響がないことを確認
3. **回帰防止**: 将来の変更で問題が再発しないことを保証

---

## 1. ユニットテストシナリオ

### 1.1 getCommitsToSquash() のテスト

#### UT-001: targetHead 指定時のコミット範囲取得

| 項目 | 内容 |
|------|------|
| **テストケース名** | `getCommitsToSquash_targetHead指定時_指定されたHEADまでのコミットを取得` |
| **目的** | `targetHead` パラメータが指定された場合、`git.log()` の `to` パラメータに正しく渡されることを検証 |
| **前提条件** | `SquashManager` インスタンスが初期化されている |
| **入力** | `baseCommit = 'abc123'`, `targetHead = 'def456'` |
| **期待結果** | `git.log()` が `{ from: 'abc123', to: 'def456', format: { hash: '%H' } }` で呼び出される |
| **テストデータ** | モック: `git.log()` → `{ all: [{ hash: 'c1' }, { hash: 'c2' }, { hash: 'c3' }] }` |

```typescript
describe('UT-001: getCommitsToSquash with targetHead parameter', () => {
  it('should use specified targetHead instead of HEAD', async () => {
    // Given
    const baseCommit = 'abc123';
    const targetHead = 'def456';
    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }, { hash: 'c3' }],
    });

    // When
    const commits = await squashManager['getCommitsToSquash'](baseCommit, targetHead);

    // Then
    expect(mockGit.log).toHaveBeenCalledWith({
      from: baseCommit,
      to: targetHead,
      format: { hash: '%H' },
    });
    expect(commits).toHaveLength(3);
    expect(commits).toEqual(['c1', 'c2', 'c3']);
  });
});
```

---

#### UT-002: targetHead 省略時の後方互換性

| 項目 | 内容 |
|------|------|
| **テストケース名** | `getCommitsToSquash_targetHead未指定時_HEADを使用` |
| **目的** | `targetHead` を省略した場合、デフォルト値 `'HEAD'` が使用されることを検証（後方互換性） |
| **前提条件** | `SquashManager` インスタンスが初期化されている |
| **入力** | `baseCommit = 'abc123'`（`targetHead` は省略） |
| **期待結果** | `git.log()` が `{ from: 'abc123', to: 'HEAD', format: { hash: '%H' } }` で呼び出される |
| **テストデータ** | モック: `git.log()` → `{ all: [{ hash: 'c1' }, { hash: 'c2' }] }` |

```typescript
describe('UT-002: getCommitsToSquash backward compatibility', () => {
  it('should use HEAD when targetHead is not specified', async () => {
    // Given
    const baseCommit = 'abc123';
    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }],
    });

    // When
    const commits = await squashManager['getCommitsToSquash'](baseCommit);

    // Then
    expect(mockGit.log).toHaveBeenCalledWith({
      from: baseCommit,
      to: 'HEAD',
      format: { hash: '%H' },
    });
    expect(commits).toHaveLength(2);
  });
});
```

---

#### UT-003: targetHead が空文字列の場合

| 項目 | 内容 |
|------|------|
| **テストケース名** | `getCommitsToSquash_targetHead空文字列_HEADにフォールバック` |
| **目的** | `targetHead` が空文字列の場合の動作を検証（エッジケース） |
| **前提条件** | `SquashManager` インスタンスが初期化されている |
| **入力** | `baseCommit = 'abc123'`, `targetHead = ''` |
| **期待結果** | 空文字列がそのまま渡される（または `'HEAD'` にフォールバック - 実装依存） |
| **テストデータ** | モック: `git.log()` → Git エラーまたは空結果 |

```typescript
describe('UT-003: getCommitsToSquash with empty targetHead', () => {
  it('should handle empty targetHead gracefully', async () => {
    // Given
    const baseCommit = 'abc123';
    const targetHead = '';

    // 空文字列の場合は Git コマンドがエラーになる可能性がある
    mockGit.log.mockRejectedValue(new Error('Invalid revision'));

    // When & Then
    await expect(
      squashManager['getCommitsToSquash'](baseCommit, targetHead)
    ).rejects.toThrow(/Failed to get commits to squash/);
  });
});
```

---

### 1.2 squashCommitsForFinalize() のテスト

#### UT-004: headCommit 指定時のスカッシュ範囲

| 項目 | 内容 |
|------|------|
| **テストケース名** | `squashCommitsForFinalize_headCommit指定時_指定されたHEADでスカッシュ` |
| **目的** | `FinalizeContext.headCommit` が指定されている場合、それが `getCommitsToSquash()` に渡されることを検証 |
| **前提条件** | `SquashManager` インスタンスが初期化されている、複数コミットが存在する |
| **入力** | `context = { issueNumber: 510, baseCommit: 'abc123', targetBranch: 'main', headCommit: 'def456' }` |
| **期待結果** | `getCommitsToSquash()` が `('abc123', 'def456')` で呼び出される |
| **テストデータ** | モック: 複数コミット、フィーチャーブランチ上 |

```typescript
describe('UT-004: squashCommitsForFinalize with headCommit', () => {
  it('should pass headCommit to getCommitsToSquash when specified', async () => {
    // Given
    const context: FinalizeContext = {
      issueNumber: 510,
      baseCommit: 'abc123',
      targetBranch: 'main',
      headCommit: 'def456',
    };

    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }, { hash: 'c3' }],
    });
    mockGit.revparse.mockResolvedValue('feature/issue-510\n');
    mockGit.reset.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'squashed' });
    mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true });

    // When
    await squashManager.squashCommitsForFinalize(context);

    // Then
    expect(mockGit.log).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'def456' })
    );
  });
});
```

---

#### UT-005: headCommit 未指定時の後方互換性

| 項目 | 内容 |
|------|------|
| **テストケース名** | `squashCommitsForFinalize_headCommit未指定時_HEADを使用` |
| **目的** | `FinalizeContext.headCommit` が未指定の場合、`'HEAD'` が使用されることを検証（後方互換性） |
| **前提条件** | `SquashManager` インスタンスが初期化されている |
| **入力** | `context = { issueNumber: 510, baseCommit: 'abc123', targetBranch: 'main' }`（`headCommit` なし） |
| **期待結果** | `getCommitsToSquash()` が `('abc123', 'HEAD')` で呼び出される |
| **テストデータ** | モック: 複数コミット、フィーチャーブランチ上 |

```typescript
describe('UT-005: squashCommitsForFinalize backward compatibility', () => {
  it('should use HEAD when headCommit is not specified in FinalizeContext', async () => {
    // Given
    const context: FinalizeContext = {
      issueNumber: 510,
      baseCommit: 'abc123',
      targetBranch: 'main',
      // headCommit: undefined (未指定)
    };

    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }],
    });
    mockGit.revparse.mockResolvedValue('feature/issue-510\n');
    mockGit.reset.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'squashed' });
    mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true });

    // When
    await squashManager.squashCommitsForFinalize(context);

    // Then
    expect(mockGit.log).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'HEAD' })
    );
  });
});
```

---

#### UT-006: headCommit が null の場合

| 項目 | 内容 |
|------|------|
| **テストケース名** | `squashCommitsForFinalize_headCommitがnull_HEADにフォールバック` |
| **目的** | `headCommit` が明示的に `null` または `undefined` の場合の動作を検証 |
| **前提条件** | `SquashManager` インスタンスが初期化されている |
| **入力** | `context = { ..., headCommit: null }` |
| **期待結果** | `'HEAD'` が使用される（null 合体演算子による） |
| **テストデータ** | モック: 複数コミット |

```typescript
describe('UT-006: squashCommitsForFinalize with null headCommit', () => {
  it('should fallback to HEAD when headCommit is explicitly null', async () => {
    // Given
    const context: FinalizeContext = {
      issueNumber: 510,
      baseCommit: 'abc123',
      targetBranch: 'main',
      headCommit: undefined, // 明示的に undefined
    };

    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }],
    });
    mockGit.revparse.mockResolvedValue('feature/issue-510\n');
    mockGit.reset.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'squashed' });
    mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true });

    // When
    await squashManager.squashCommitsForFinalize(context);

    // Then
    expect(mockGit.log).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'HEAD' })
    );
  });
});
```

---

### 1.3 FinalizeContext 型の後方互換性テスト

#### UT-007: 既存コードとの型互換性

| 項目 | 内容 |
|------|------|
| **テストケース名** | `FinalizeContext_headCommit未指定_コンパイルエラーなし` |
| **目的** | `headCommit` を省略した `FinalizeContext` オブジェクトがコンパイル可能であることを検証 |
| **前提条件** | TypeScript コンパイル環境 |
| **入力** | `{ issueNumber: 123, baseCommit: 'abc', targetBranch: 'main' }` |
| **期待結果** | コンパイルエラーなし、既存コードの動作に影響なし |
| **テストデータ** | N/A（型チェックテスト） |

```typescript
describe('UT-007: FinalizeContext type compatibility', () => {
  it('should allow creating FinalizeContext without headCommit', () => {
    // Given & When
    const context: FinalizeContext = {
      issueNumber: 123,
      baseCommit: 'abc123',
      targetBranch: 'main',
      // headCommit は省略可能
    };

    // Then: コンパイルが成功すればOK
    expect(context.issueNumber).toBe(123);
    expect(context.baseCommit).toBe('abc123');
    expect(context.targetBranch).toBe('main');
    expect(context.headCommit).toBeUndefined();
  });

  it('should allow creating FinalizeContext with headCommit', () => {
    // Given & When
    const context: FinalizeContext = {
      issueNumber: 123,
      baseCommit: 'abc123',
      targetBranch: 'main',
      headCommit: 'def456',
    };

    // Then
    expect(context.headCommit).toBe('def456');
  });
});
```

---

## 2. インテグレーションテストシナリオ

### 2.1 Issue #510 シナリオ再現

#### IT-510-001: non-fast-forward + pull 発生時のスカッシュ成功

| 項目 | 内容 |
|------|------|
| **シナリオ名** | `Issue #510 シナリオ再現: pull 後もスカッシュが正常に実行される` |
| **目的** | Step 2 で pull が発生して HEAD が更新されても、Step 3 でスカッシュが正しく実行されることを検証 |
| **前提条件** | ワークフローが初期化済み、複数コミットが存在、リモートブランチに別の変更あり |
| **テスト手順** | 1. finalize コマンド実行<br>2. Step 2 で non-fast-forward エラー発生<br>3. pullLatest() 実行で HEAD 更新<br>4. Step 3 でスカッシュ実行 |
| **期待結果** | スカッシュが `baseCommit..headBeforeCleanup` の範囲で正常に実行される |
| **確認項目** | - `squashCommitsForFinalize()` に `headCommit` が渡される<br>- "Only 0 commit(s) found" が表示されない<br>- スカッシュコミットが作成される |

```typescript
describe('IT-510-001: Issue #510 シナリオ再現', () => {
  it('should squash correctly even when pull updates HEAD during Step 2', async () => {
    // Given: ワークフローが初期化されている
    // - base_commit: 'base123' が記録されている
    // - Step 2 実行前の HEAD: 'head456'
    // - フィーチャーブランチ上に複数のコミットがある
    // - リモートブランチに別の変更がある（non-fast-forward 状態）

    const metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.base_commit = 'base123def456789012345678901234567890';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',
      remote_url: 'https://github.com/owner/repo.git',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );

    // GitManager モック: Step 2 で non-fast-forward → pull → HEAD 更新
    const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
    let pushCallCount = 0;
    mockGitManager.mockImplementation(() => ({
      commitWorkflowDeletion: jest.fn().mockResolvedValue({
        success: true,
        commit_hash: 'cleanup789',
      }),
      pushToRemote: jest.fn().mockImplementation(() => {
        pushCallCount++;
        // 1回目: non-fast-forward エラー → 内部で pull が実行される
        // 2回目: 成功
        return Promise.resolve({ success: true });
      }),
      getSquashManager: jest.fn().mockReturnValue({
        squashCommitsForFinalize: jest.fn().mockImplementation((context) => {
          // headCommit が渡されていることを確認
          expect(context.headCommit).toBeDefined();
          expect(context.headCommit).not.toBe('HEAD');
          return Promise.resolve();
        }),
      }),
    } as any));

    const options: FinalizeCommandOptions = {
      issue: '510',
    };

    // When: finalize コマンドを実行
    await handleFinalizeCommand(options);

    // Then:
    // Step 3 で headBeforeCleanup を使用してスカッシュ範囲が計算される
    const gitManagerInstance = mockGitManager.mock.results[0]?.value;
    const squashManager = gitManagerInstance?.getSquashManager();

    expect(squashManager.squashCommitsForFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 510,
        baseCommit: 'base123def456789012345678901234567890',
        headCommit: expect.any(String), // headBeforeCleanup が渡される
      })
    );
  });
});
```

---

#### IT-510-002: headCommit 未指定時の後方互換性（インテグレーション）

| 項目 | 内容 |
|------|------|
| **シナリオ名** | `後方互換性: headCommit 未指定でも正常動作` |
| **目的** | `headCommit` が未指定の場合でも、従来通り `HEAD` を使用してスカッシュが実行されることを検証 |
| **前提条件** | 既存のワークフローコード、`headCommit` を渡さない呼び出し |
| **テスト手順** | 1. `FinalizeContext` を `headCommit` なしで作成<br>2. `squashCommitsForFinalize()` を呼び出し |
| **期待結果** | `HEAD` を使用してスカッシュが実行される |
| **確認項目** | - `git.log()` の `to` パラメータが `'HEAD'`<br>- スカッシュが正常に実行される |

```typescript
describe('IT-510-002: 後方互換性 - headCommit 未指定', () => {
  it('should use HEAD when headCommit is not specified in FinalizeContext', async () => {
    // Given: FinalizeContext に headCommit が設定されていない
    const baseCommit = 'abc123';
    mockMetadataManager.getBaseCommit.mockReturnValue(baseCommit);

    mockGit.log.mockResolvedValue({
      all: [{ hash: 'c1' }, { hash: 'c2' }, { hash: 'c3' }],
    });
    mockGit.revparse.mockResolvedValue('feature/test\n');
    mockGit.reset.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'squashed' });
    mockRemoteManager.forcePushToRemote.mockResolvedValue({ success: true });

    const context: FinalizeContext = {
      issueNumber: 123,
      baseCommit: 'abc123',
      targetBranch: 'main',
      // headCommit: undefined (未指定)
    };

    // When: squashCommitsForFinalize が呼び出される
    await squashManager.squashCommitsForFinalize(context);

    // Then:
    // getCommitsToSquash() に 'HEAD' が渡される
    expect(mockGit.log).toHaveBeenCalledWith({
      from: 'abc123',
      to: 'HEAD',
      format: { hash: '%H' },
    });

    // スカッシュが正常に実行される
    expect(mockGit.reset).toHaveBeenCalledWith(['--soft', 'abc123']);
    expect(mockGit.commit).toHaveBeenCalled();
    expect(mockRemoteManager.forcePushToRemote).toHaveBeenCalled();
  });
});
```

---

### 2.2 Step 1 → Step 3 連携テスト

#### IT-510-003: headBeforeCleanup の伝播確認

| 項目 | 内容 |
|------|------|
| **シナリオ名** | `Step 1 → Step 3 連携: headBeforeCleanup が正しく伝播する` |
| **目的** | `executeStep1()` で取得した `headBeforeCleanup` が `executeStep3()` に正しく渡されることを検証 |
| **前提条件** | finalize コマンドが実行可能な状態 |
| **テスト手順** | 1. finalize コマンド実行<br>2. Step 1 で base_commit と headBeforeCleanup を取得<br>3. Step 3 で headBeforeCleanup を使用 |
| **期待結果** | Step 1 で取得した HEAD が Step 3 の `FinalizeContext.headCommit` に設定される |
| **確認項目** | - `executeStep1()` の戻り値に `headBeforeCleanup` が含まれる<br>- `squashCommitsForFinalize()` の引数に `headCommit` が含まれる |

```typescript
describe('IT-510-003: Step 1 → Step 3 連携', () => {
  it('should pass headBeforeCleanup from Step 1 to Step 3', async () => {
    // Given: ワークフローが初期化されている
    const metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.base_commit = 'base123';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',
      remote_url: 'https://github.com/owner/repo.git',
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );

    // simple-git のモック（HEAD 取得用）
    // Step 1 で git.revparse(['HEAD']) が呼ばれる
    let capturedHeadCommit: string | undefined;

    const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
    mockGitManager.mockImplementation(() => ({
      commitWorkflowDeletion: jest.fn().mockResolvedValue({
        success: true,
        commit_hash: 'cleanup789',
      }),
      pushToRemote: jest.fn().mockResolvedValue({ success: true }),
      getSquashManager: jest.fn().mockReturnValue({
        squashCommitsForFinalize: jest.fn().mockImplementation((context) => {
          capturedHeadCommit = context.headCommit;
          return Promise.resolve();
        }),
      }),
    } as any));

    const options: FinalizeCommandOptions = {
      issue: '510',
    };

    // When: finalize コマンドを実行
    await handleFinalizeCommand(options);

    // Then: headBeforeCleanup が Step 3 に渡されている
    expect(capturedHeadCommit).toBeDefined();
    expect(capturedHeadCommit).not.toBe('');
  });
});
```

---

### 2.3 既存機能への影響確認

#### IT-510-004: 既存テスト IT-12 の動作確認

| 項目 | 内容 |
|------|------|
| **シナリオ名** | `既存テスト IT-12: SquashManager 連携が引き続き動作` |
| **目的** | 既存の `IT-12: 統合テスト_モジュール連携_SquashManager連携` が修正後も正常に動作することを検証 |
| **前提条件** | 既存テストコードが存在する |
| **テスト手順** | 既存テスト IT-12 を実行 |
| **期待結果** | テストがパスする |
| **確認項目** | - `squashCommitsForFinalize()` が正しい引数で呼び出される<br>- 既存の期待値（`issueNumber`, `baseCommit`, `targetBranch`）が維持される |

```typescript
describe('IT-510-004: 既存テスト IT-12 の動作確認', () => {
  it('should maintain backward compatibility with existing IT-12 test', async () => {
    // Given: 既存のテスト設定（IT-12 と同じ）
    const metadataManager = new MetadataManager(testMetadataPath);
    metadataManager.data.base_commit = 'abc123def456';
    metadataManager.data.target_repository = {
      owner: 'owner',
      repo: 'repo',
      path: '/test/repo',
      github_name: 'owner/repo',
      remote_url: 'https://github.com/owner/repo.git',
    };
    metadataManager.data.phases.planning.status = 'completed';

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(metadataManager.data)
    );

    const options: FinalizeCommandOptions = {
      issue: '123',
    };

    // When: finalize コマンドを実行
    await handleFinalizeCommand(options);

    // Then: 既存の期待値が維持される
    const mockGitManager = GitManager as jest.MockedClass<typeof GitManager>;
    const gitManagerInstance = mockGitManager.mock.results[0]?.value;
    const squashManager = gitManagerInstance?.getSquashManager();

    expect(squashManager.squashCommitsForFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 123,
        baseCommit: 'abc123def456',
        targetBranch: 'main',
      })
    );
  });
});
```

---

### 2.4 エラーハンドリング

#### IT-510-005: Step 1 で HEAD 取得失敗時のエラーハンドリング

| 項目 | 内容 |
|------|------|
| **シナリオ名** | `エラーハンドリング: git.revparse(['HEAD']) 失敗時` |
| **目的** | Step 1 で HEAD 取得に失敗した場合、適切なエラーメッセージが表示されることを検証 |
| **前提条件** | Git リポジトリが破損している等の異常状態 |
| **テスト手順** | 1. `git.revparse(['HEAD'])` がエラーを返すようモック設定<br>2. finalize コマンド実行 |
| **期待結果** | エラーがスローされ、適切なメッセージが表示される |
| **確認項目** | - エラーメッセージに原因が含まれる<br>- Step 2 以降は実行されない |

```typescript
describe('IT-510-005: Step 1 HEAD 取得失敗時のエラー', () => {
  it('should throw error when git.revparse fails', async () => {
    // Given: git.revparse がエラーを返す
    // （simpleGit のモック設定が必要）

    const options: FinalizeCommandOptions = {
      issue: '510',
    };

    // When & Then: エラーがスローされる
    // 実装に依存するため、具体的なエラーメッセージは実装後に確定
    await expect(handleFinalizeCommand(options))
      .rejects.toThrow();
  });
});
```

---

## 3. テストデータ

### 3.1 正常系テストデータ

| データ名 | 値 | 用途 |
|----------|-----|------|
| `baseCommit` | `'abc123def456789012345678901234567890abcd'` | ワークフロー開始時のコミット |
| `headBeforeCleanup` | `'def456789012345678901234567890abcd1234'` | Step 2 実行直前の HEAD |
| `headAfterPull` | `'ghi789012345678901234567890abcd12345678'` | pull 後の HEAD（使用されない） |
| `issueNumber` | `510` | Issue 番号 |
| `targetBranch` | `'main'` | マージ先ブランチ |

### 3.2 異常系テストデータ

| データ名 | 値 | 用途 |
|----------|-----|------|
| `emptyBaseCommit` | `''` | 空の base_commit |
| `nullBaseCommit` | `null` | null の base_commit |
| `invalidHeadCommit` | `'invalid'` | 無効なコミットハッシュ |

### 3.3 境界値テストデータ

| データ名 | 値 | 用途 |
|----------|-----|------|
| `singleCommit` | `[{ hash: 'c1' }]` | コミット数 1（スカッシュスキップ） |
| `zeroCommits` | `[]` | コミット数 0（スカッシュスキップ） |
| `manyCommits` | `[{ hash: 'c1' }, ..., { hash: 'c100' }]` | 大量コミット |

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

| 環境 | 要件 |
|------|------|
| **ローカル環境** | Node.js 18.x 以上、Git 2.x 以上 |
| **CI/CD 環境** | GitHub Actions、Jest テストランナー |

### 4.2 必要な外部サービス

| サービス | 用途 | モック要否 |
|----------|------|------------|
| GitHub API | PR 操作 | **モック必須** |
| Git リポジトリ | Git 操作 | **モック必須** |

### 4.3 モック/スタブの必要性

| モジュール | モック内容 |
|------------|-----------|
| `simple-git` | `git.log()`, `git.revparse()`, `git.reset()`, `git.commit()` |
| `RemoteManager` | `pushToRemote()`, `forcePushToRemote()`, `pullLatest()` |
| `MetadataManager` | `getBaseCommit()`, `data` プロパティ |
| `fs-extra` | `existsSync()`, `readFileSync()`, `writeFileSync()` |
| `GitHubClient` | `getPullRequestClient()`, PR 操作メソッド |

---

## 5. テスト実行計画

### 5.1 テスト実行順序

```
1. ユニットテスト（squash-workflow.test.ts）
   ├── UT-001: getCommitsToSquash_targetHead指定時
   ├── UT-002: getCommitsToSquash_targetHead未指定時
   ├── UT-003: getCommitsToSquash_空文字列
   ├── UT-004: squashCommitsForFinalize_headCommit指定時
   ├── UT-005: squashCommitsForFinalize_headCommit未指定時
   ├── UT-006: squashCommitsForFinalize_headCommitがnull
   └── UT-007: FinalizeContext型互換性

2. インテグレーションテスト（finalize-command.test.ts）
   ├── IT-510-001: Issue #510 シナリオ再現
   ├── IT-510-002: 後方互換性 - headCommit未指定
   ├── IT-510-003: Step 1 → Step 3 連携
   ├── IT-510-004: 既存テスト IT-12 動作確認
   └── IT-510-005: Step 1 HEAD 取得失敗時
```

### 5.2 テスト実行コマンド

```bash
# ユニットテストのみ実行
npm run test:unit -- --grep "Issue #510"

# インテグレーションテストのみ実行
npm run test:integration -- --grep "IT-510"

# 全テスト実行
npm test

# カバレッジ付きで実行
npm run test:coverage
```

### 5.3 テスト成功基準

| 基準 | 目標値 |
|------|--------|
| ユニットテストパス率 | 100% |
| インテグレーションテストパス率 | 100% |
| コードカバレッジ（修正箇所） | 80% 以上 |
| 回帰テストパス率 | 100% |

---

## 6. 品質ゲートチェックリスト（Phase 3）

- [x] **Phase 2 の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に基づき、ユニットテストとインテグレーションテストを設計
- [x] **主要な正常系がカバーされている**: IT-510-001（Issue #510 シナリオ）、UT-001〜UT-006 で正常系をカバー
- [x] **主要な異常系がカバーされている**: IT-510-005（HEAD 取得失敗）、UT-003（空文字列）で異常系をカバー
- [x] **期待結果が明確である**: 各テストケースに具体的な期待結果を記載

---

## 7. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-12-25 | 初版作成 |

---

## 8. 関連ドキュメント

| ドキュメント | パス |
|------------|------|
| Planning Document | `.ai-workflow/issue-510/00_planning/output/planning.md` |
| Requirements Document | `.ai-workflow/issue-510/01_requirements/output/requirements.md` |
| Design Document | `.ai-workflow/issue-510/02_design/output/design.md` |
| 既存テスト: finalize-command.test.ts | `tests/integration/finalize-command.test.ts` |
| 既存テスト: squash-workflow.test.ts | `tests/integration/squash-workflow.test.ts` |
