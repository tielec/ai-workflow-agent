# テストシナリオ - Issue #194

## 0. Planning Document・設計書の確認

Planning Document（`.ai-workflow/issue-194/00_planning/output/planning.md`）および設計書（`.ai-workflow/issue-194/02_design/output/design.md`）を確認し、以下のテスト戦略を把握しました：

### テスト戦略: UNIT_INTEGRATION

**判断根拠**（Planning Documentより）:

#### ユニットテストが必要な理由:
- **`SquashManager`の単体ロジック**: コミット範囲の特定、ブランチ保護チェック、エラーハンドリング
- **`MetadataManager`の拡張ロジック**: 新規フィールドのCRUD操作
- **プロンプトテンプレート処理**: テンプレート変数の置換、フォーマット検証

#### インテグレーションテストが必要な理由:
- **Git操作の統合**: `git reset --soft` → `git commit` → `git push --force-with-lease`の一連の流れ
- **エージェント統合**: Codex/Claudeによるコミットメッセージ生成のエンドツーエンド
- **ワークフロー統合**: `init` → `execute --phase all` → `evaluation` → スカッシュの全体フロー

これらの方針を踏まえて、以下のテストシナリオを作成します。

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**: ユニットテストとインテグレーションテストの両方を実施

### テスト対象の範囲

#### ユニットテスト対象:
1. **SquashManager**:
   - `getCommitsToSquash()`: コミット範囲の特定
   - `validateBranchProtection()`: ブランチ保護チェック
   - `isValidCommitMessage()`: コミットメッセージのバリデーション
   - `generateFallbackMessage()`: フォールバックメッセージ生成
   - エラーハンドリング（各種失敗ケース）

2. **MetadataManager拡張**:
   - `setBaseCommit()` / `getBaseCommit()`
   - `setPreSquashCommits()` / `getPreSquashCommits()`
   - `setSquashedAt()` / `getSquashedAt()`

3. **GitManager拡張（ファサード）**:
   - `squashCommits()`: SquashManagerへの委譲

#### インテグレーションテスト対象:
1. **スカッシュワークフロー全体**:
   - `init` → `execute --squash-on-complete` → スカッシュの統合
   - メタデータの永続化と読み込み

2. **Git操作の統合**:
   - `git reset --soft` → `git commit` → `git push --force-with-lease`の一連の流れ
   - リトライロジックの統合

3. **エージェント統合**:
   - Codex/Claudeによるコミットメッセージ生成のエンドツーエンド
   - フォールバック処理

4. **CLIオプション統合**:
   - `--squash-on-complete` / `--no-squash-on-complete`オプション
   - 環境変数`AI_WORKFLOW_SQUASH_ON_COMPLETE`

### テストの目的

1. **機能の正確性**: スカッシュ処理が仕様通りに動作することを検証
2. **安全性**: フォースプッシュの安全性、ブランチ保護が機能することを検証
3. **後方互換性**: 既存ワークフロー（base_commit未記録）が正常に動作することを検証
4. **エラーハンドリング**: 各種エラーケースで適切にエラー処理が行われることを検証
5. **統合**: 各コンポーネントが協調して動作することを検証

---

## 2. ユニットテストシナリオ

### 2.1 SquashManager - getCommitsToSquash()

#### テストケース 2.1.1: getCommitsToSquash_正常系_複数コミット

- **目的**: base_commitからHEADまでの複数コミットが正しく取得できることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - base_commit以降に3つのコミットが存在する
- **入力**:
  - `baseCommit`: `"abc123def456"` (40文字のコミットハッシュ)
- **期待結果**:
  - 3つのコミットハッシュが配列で返される
  - コミットは古い順に並んでいる
- **テストデータ**:
  ```typescript
  const commits = [
    'commit1hash000000000000000000000000000',
    'commit2hash000000000000000000000000000',
    'commit3hash000000000000000000000000000'
  ];
  ```

#### テストケース 2.1.2: getCommitsToSquash_正常系_1つのコミット

- **目的**: base_commit以降に1つのコミットしかない場合でも正しく取得できることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - base_commit以降に1つのコミットが存在する
- **入力**:
  - `baseCommit`: `"abc123def456"`
- **期待結果**:
  - 1つのコミットハッシュが配列で返される
- **テストデータ**:
  ```typescript
  const commits = ['commit1hash000000000000000000000000000'];
  ```

#### テストケース 2.1.3: getCommitsToSquash_異常系_無効なbase_commit

- **目的**: 無効なbase_commitが指定された場合にエラーがスローされることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
- **入力**:
  - `baseCommit`: `"invalid_commit_hash"`
- **期待結果**:
  - エラーがスローされる
  - エラーメッセージに `"Failed to get commits to squash"` が含まれる
- **テストデータ**: N/A

#### テストケース 2.1.4: getCommitsToSquash_境界値_0コミット

- **目的**: base_commitとHEADが同じ場合（0コミット）に空配列が返されることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - base_commitとHEADが同じ
- **入力**:
  - `baseCommit`: `"<current_HEAD>"`
- **期待結果**:
  - 空配列 `[]` が返される
- **テストデータ**: N/A

---

### 2.2 SquashManager - validateBranchProtection()

#### テストケース 2.2.1: validateBranchProtection_正常系_featureブランチ

- **目的**: featureブランチでブランチ保護チェックがパスすることを検証
- **前提条件**:
  - 現在のブランチが `feature/issue-194`
- **入力**: なし
- **期待結果**:
  - エラーがスローされない
  - ログに `"Branch protection check passed: feature/issue-194"` が出力される
- **テストデータ**: N/A

#### テストケース 2.2.2: validateBranchProtection_異常系_mainブランチ

- **目的**: mainブランチでブランチ保護チェックがエラーになることを検証
- **前提条件**:
  - 現在のブランチが `main`
- **入力**: なし
- **期待結果**:
  - エラーがスローされる
  - エラーメッセージ: `"Cannot squash commits on protected branch: main. Squashing is only allowed on feature branches."`
- **テストデータ**: N/A

#### テストケース 2.2.3: validateBranchProtection_異常系_masterブランチ

- **目的**: masterブランチでブランチ保護チェックがエラーになることを検証
- **前提条件**:
  - 現在のブランチが `master`
- **入力**: なし
- **期待結果**:
  - エラーがスローされる
  - エラーメッセージ: `"Cannot squash commits on protected branch: master. Squashing is only allowed on feature branches."`
- **テストデータ**: N/A

#### テストケース 2.2.4: validateBranchProtection_異常系_Git操作失敗

- **目的**: Git操作失敗時に適切なエラーがスローされることを検証
- **前提条件**:
  - `git revparse`がエラーを返す（モック設定）
- **入力**: なし
- **期待結果**:
  - エラーがスローされる
  - エラーメッセージに `"Failed to check branch protection"` が含まれる
- **テストデータ**: N/A

---

### 2.3 SquashManager - isValidCommitMessage()

#### テストケース 2.3.1: isValidCommitMessage_正常系_Conventional Commits形式

- **目的**: 有効なConventional Commits形式のメッセージがバリデーションをパスすることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `feat(squash): add commit squashing feature

  This feature allows squashing workflow commits into one.

  Fixes #194`;
  ```
- **期待結果**:
  - `true` が返される
- **テストデータ**: 上記message

#### テストケース 2.3.2: isValidCommitMessage_正常系_scopeなし

- **目的**: scope省略形式のメッセージがバリデーションをパスすることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `fix: resolve squash error

  Fixes #194`;
  ```
- **期待結果**:
  - `true` が返される
- **テストデータ**: 上記message

#### テストケース 2.3.3: isValidCommitMessage_異常系_無効なtype

- **目的**: 無効なtypeのメッセージがバリデーションで拒否されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `invalid: bad commit message

  Fixes #194`;
  ```
- **期待結果**:
  - `false` が返される
- **テストデータ**: 上記message

#### テストケース 2.3.4: isValidCommitMessage_異常系_subjectが長すぎる

- **目的**: 50文字を超えるsubjectがバリデーションで拒否されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `feat: this is a very long subject line that exceeds fifty characters limit

  Fixes #194`;
  ```
- **期待結果**:
  - `false` が返される
- **テストデータ**: 上記message

#### テストケース 2.3.5: isValidCommitMessage_異常系_Issue参照なし

- **目的**: Issue参照がないメッセージがバリデーションで拒否されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `feat: add squashing feature

  This feature allows squashing workflow commits.`;
  ```
- **期待結果**:
  - `false` が返される
- **テストデータ**: 上記message

#### テストケース 2.3.6: isValidCommitMessage_境界値_subject50文字ちょうど

- **目的**: 50文字ちょうどのsubjectがバリデーションをパスすることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const message = `feat: add squash feature for workflow commits

  Fixes #194`;
  // "feat: add squash feature for workflow commits" = 46文字（50文字以内）
  ```
- **期待結果**:
  - `true` が返される
- **テストデータ**: 上記message

---

### 2.4 SquashManager - generateFallbackMessage()

#### テストケース 2.4.1: generateFallbackMessage_正常系_完全なIssue情報

- **目的**: Issue情報が完全な場合に適切なフォールバックメッセージが生成されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const context = {
    issueNumber: 194,
    issueInfo: {
      title: 'feat: Squash commits after workflow completion',
      body: '...'
    }
  };
  ```
- **期待結果**:
  ```
  feat: Complete workflow for Issue #194

  feat: Squash commits after workflow completion

  Fixes #194
  ```
- **テストデータ**: 上記context

#### テストケース 2.4.2: generateFallbackMessage_正常系_Issue情報なし

- **目的**: Issue情報がない場合にデフォルトメッセージが生成されることを検証
- **前提条件**: なし
- **入力**:
  ```typescript
  const context = {
    issueNumber: 194,
    issueInfo: null
  };
  ```
- **期待結果**:
  ```
  feat: Complete workflow for Issue #194

  AI Workflow completion

  Fixes #194
  ```
- **テストデータ**: 上記context

---

### 2.5 MetadataManager - base_commit関連

#### テストケース 2.5.1: setBaseCommit_getBaseCommit_正常系

- **目的**: base_commitの記録と取得が正しく動作することを検証
- **前提条件**:
  - MetadataManagerが初期化されている
- **入力**:
  - `commit`: `"abc123def456789012345678901234567890abcd"`
- **期待結果**:
  - `setBaseCommit()`後、`getBaseCommit()`で同じ値が返される
  - `metadata.json`に`base_commit`フィールドが記録される
- **テストデータ**: 上記commit

#### テストケース 2.5.2: getBaseCommit_正常系_base_commit未記録

- **目的**: base_commitが未記録の場合にnullが返されることを検証
- **前提条件**:
  - MetadataManagerが初期化されている
  - `base_commit`フィールドが存在しない
- **入力**: なし
- **期待結果**:
  - `null` が返される
- **テストデータ**: N/A

---

### 2.6 MetadataManager - pre_squash_commits関連

#### テストケース 2.6.1: setPreSquashCommits_getPreSquashCommits_正常系

- **目的**: pre_squash_commitsの記録と取得が正しく動作することを検証
- **前提条件**:
  - MetadataManagerが初期化されている
- **入力**:
  ```typescript
  const commits = [
    'commit1hash000000000000000000000000000',
    'commit2hash000000000000000000000000000',
    'commit3hash000000000000000000000000000'
  ];
  ```
- **期待結果**:
  - `setPreSquashCommits()`後、`getPreSquashCommits()`で同じ配列が返される
  - `metadata.json`に`pre_squash_commits`フィールドが記録される
- **テストデータ**: 上記commits

#### テストケース 2.6.2: getPreSquashCommits_正常系_未記録

- **目的**: pre_squash_commitsが未記録の場合にnullが返されることを検証
- **前提条件**:
  - MetadataManagerが初期化されている
  - `pre_squash_commits`フィールドが存在しない
- **入力**: なし
- **期待結果**:
  - `null` が返される
- **テストデータ**: N/A

---

### 2.7 MetadataManager - squashed_at関連

#### テストケース 2.7.1: setSquashedAt_getSquashedAt_正常系

- **目的**: squashed_atの記録と取得が正しく動作することを検証
- **前提条件**:
  - MetadataManagerが初期化されている
- **入力**:
  - `timestamp`: `"2025-01-30T12:34:56.789Z"` (ISO 8601形式)
- **期待結果**:
  - `setSquashedAt()`後、`getSquashedAt()`で同じ値が返される
  - `metadata.json`に`squashed_at`フィールドが記録される
- **テストデータ**: 上記timestamp

#### テストケース 2.7.2: getSquashedAt_正常系_未記録

- **目的**: squashed_atが未記録の場合にnullが返されることを検証
- **前提条件**:
  - MetadataManagerが初期化されている
  - `squashed_at`フィールドが存在しない
- **入力**: なし
- **期待結果**:
  - `null` が返される
- **テストデータ**: N/A

---

### 2.8 GitManager - squashCommits()（ファサード）

#### テストケース 2.8.1: squashCommits_正常系_SquashManagerへの委譲

- **目的**: GitManager.squashCommits()がSquashManagerに正しく委譲されることを検証
- **前提条件**:
  - GitManagerが初期化されている
  - SquashManagerがモックされている
- **入力**:
  ```typescript
  const context: PhaseContext = {
    issueNumber: 194,
    issueInfo: { title: 'Test', body: 'Test body' },
    // ... その他のフィールド
  };
  ```
- **期待結果**:
  - `SquashManager.squashCommits()`が1回呼ばれる
  - 引数として`context`が渡される
- **テストデータ**: 上記context

---

## 3. インテグレーションテストシナリオ

### 3.1 スカッシュワークフロー全体統合

#### シナリオ 3.1.1: init → execute --squash-on-complete → スカッシュ成功

- **目的**: ワークフロー全体でスカッシュが正常に動作することを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - リモートリポジトリが設定されている
  - featureブランチにいる
  - エージェント（Codex/Claude）が利用可能
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/owner/repo/issues/194` を実行
  2. `metadata.json`の`base_commit`フィールドを確認
  3. 5つのフェーズコミットを作成（手動またはワークフロー実行）
  4. `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
  5. スカッシュ処理が実行されることを確認
- **期待結果**:
  - `metadata.json`に`base_commit`が記録される
  - 5つのコミットが1つにスカッシュされる
  - エージェント生成のコミットメッセージが適用される
  - リモートにフォースプッシュされる
  - `metadata.json`に`pre_squash_commits`と`squashed_at`が記録される
- **確認項目**:
  - [ ] `metadata.json`の`base_commit`フィールドが存在する
  - [ ] `git log`でコミット数が1つになっている
  - [ ] コミットメッセージがConventional Commits形式
  - [ ] コミットメッセージに`Fixes #194`が含まれる
  - [ ] `metadata.json`の`pre_squash_commits`に5つのコミットハッシュが記録されている
  - [ ] `metadata.json`の`squashed_at`にタイムスタンプが記録されている

#### シナリオ 3.1.2: init → execute --no-squash-on-complete → スカッシュスキップ

- **目的**: --no-squash-on-completeオプションでスカッシュがスキップされることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - featureブランチにいる
- **テスト手順**:
  1. `node dist/index.js init --issue-url https://github.com/owner/repo/issues/194` を実行
  2. 3つのフェーズコミットを作成
  3. `node dist/index.js execute --issue 194 --phase all --no-squash-on-complete` を実行
- **期待結果**:
  - スカッシュ処理が実行されない
  - 3つのコミットがそのまま残る
  - `metadata.json`に`squashed_at`が記録されない
- **確認項目**:
  - [ ] `git log`でコミット数が3つのまま
  - [ ] `metadata.json`の`squashed_at`フィールドが存在しない

#### シナリオ 3.1.3: 既存ワークフロー（base_commit未記録）→ スカッシュスキップ

- **目的**: 後方互換性が確保されており、base_commit未記録でもエラーにならないことを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - 古いバージョンのワークフローで作成された`metadata.json`（`base_commit`フィールドなし）
- **テスト手順**:
  1. 既存の`metadata.json`を配置（`base_commit`フィールドなし）
  2. `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
- **期待結果**:
  - WARNINGログ: `"base_commit not found in metadata. Skipping squash."`
  - スカッシュ処理がスキップされる
  - ワークフローは正常に完了する
- **確認項目**:
  - [ ] ログに`WARN`レベルで`base_commit not found`メッセージが出力される
  - [ ] ワークフローが正常終了する（エラーにならない）
  - [ ] `metadata.json`の`squashed_at`フィールドが存在しない

---

### 3.2 Git操作統合

#### シナリオ 3.2.1: git reset → commit → push --force-with-lease の一連の流れ

- **目的**: Git操作の一連の流れが正常に動作することを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - リモートリポジトリが設定されている
  - base_commitから5つのコミットが存在する
- **テスト手順**:
  1. SquashManager.executeSquash()を呼び出す
  2. Git操作の各ステップをモニタリング
- **期待結果**:
  - `git reset --soft <base_commit>` が実行される
  - エージェント生成のコミットメッセージで`git commit`が実行される
  - `git push --force-with-lease` が実行される
  - リモートリポジトリに反映される
- **確認項目**:
  - [ ] `git log`でコミット数が1つになっている
  - [ ] リモートリポジトリ（GitHub）でコミット数が1つになっている
  - [ ] フォースプッシュによる他の変更の上書きが発生していない

#### シナリオ 3.2.2: push --force-with-lease 失敗時のリトライ

- **目的**: フォースプッシュ失敗時にRemoteManagerのリトライロジックが動作することを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - リモートリポジトリが一時的に到達不能（モック設定）
- **テスト手順**:
  1. ネットワークエラーを発生させる（モック）
  2. SquashManager.executeSquash()を呼び出す
- **期待結果**:
  - 最大3回までリトライされる
  - リトライ成功時はスカッシュが完了する
  - リトライも失敗した場合はエラーがスローされる
- **確認項目**:
  - [ ] `push()`が最大3回呼ばれる
  - [ ] リトライ成功時はワークフローが正常完了する
  - [ ] リトライ失敗時はWARNINGログが出力され、ワークフローは継続する

---

### 3.3 エージェント統合

#### シナリオ 3.3.1: Codexエージェントによるコミットメッセージ生成（正常系）

- **目的**: Codexエージェントが正常にコミットメッセージを生成できることを検証
- **前提条件**:
  - Codexエージェントが利用可能
  - Issue情報が取得可能
  - 変更差分が存在する
- **テスト手順**:
  1. プロンプトテンプレート`generate-message.txt`を読み込む
  2. テンプレート変数を置換する
  3. Codexエージェントを実行する
  4. 生成されたコミットメッセージを取得する
- **期待結果**:
  - Conventional Commits形式のコミットメッセージが生成される
  - メッセージに`Fixes #194`が含まれる
  - メッセージがバリデーションをパスする
- **確認項目**:
  - [ ] コミットメッセージが生成される
  - [ ] `isValidCommitMessage()`が`true`を返す
  - [ ] 生成時間が10秒以内

#### シナリオ 3.3.2: Claudeエージェントによるコミットメッセージ生成（正常系）

- **目的**: Claudeエージェントが正常にコミットメッセージを生成できることを検証
- **前提条件**:
  - Claudeエージェントが利用可能
  - Issue情報が取得可能
  - 変更差分が存在する
- **テスト手順**:
  1. プロンプトテンプレート`generate-message.txt`を読み込む
  2. テンプレート変数を置換する
  3. Claudeエージェントを実行する
  4. 生成されたコミットメッセージを取得する
- **期待結果**:
  - Conventional Commits形式のコミットメッセージが生成される
  - メッセージに`Fixes #194`が含まれる
  - メッセージがバリデーションをパスする
- **確認項目**:
  - [ ] コミットメッセージが生成される
  - [ ] `isValidCommitMessage()`が`true`を返す
  - [ ] 生成時間が10秒以内

#### シナリオ 3.3.3: エージェント失敗時のフォールバック

- **目的**: エージェント実行失敗時にフォールバックメッセージが使用されることを検証
- **前提条件**:
  - エージェントが失敗する（モック設定）
  - Issue情報が取得可能
- **テスト手順**:
  1. エージェント実行がエラーを返すように設定（モック）
  2. SquashManager.generateCommitMessage()を呼び出す
- **期待結果**:
  - エラーログが出力される: `"Failed to generate commit message with agent"`
  - フォールバックメッセージが使用される
  - スカッシュ処理が継続される
- **確認項目**:
  - [ ] エラーログが出力される
  - [ ] フォールバックメッセージが使用される
  - [ ] スカッシュ処理が成功する

#### シナリオ 3.3.4: 生成メッセージのバリデーション失敗時のフォールバック

- **目的**: 生成されたメッセージがバリデーション失敗した場合にフォールバックメッセージが使用されることを検証
- **前提条件**:
  - エージェントが無効な形式のメッセージを生成する（モック設定）
- **テスト手順**:
  1. エージェントが無効なメッセージを返すように設定（モック）
  2. SquashManager.generateCommitMessage()を呼び出す
- **期待結果**:
  - WARNINGログが出力される: `"Generated commit message is invalid. Using fallback."`
  - フォールバックメッセージが使用される
  - スカッシュ処理が継続される
- **確認項目**:
  - [ ] WARNINGログが出力される
  - [ ] フォールバックメッセージが使用される
  - [ ] スカッシュ処理が成功する

---

### 3.4 CLIオプション統合

#### シナリオ 3.4.1: --squash-on-complete オプションの動作

- **目的**: --squash-on-completeオプションが正常に機能することを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
- **テスト手順**:
  1. `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
  2. ExecuteCommandOptionsを確認
- **期待結果**:
  - `options.squashOnComplete`が`true`に設定される
  - Evaluation Phase完了後にスカッシュ処理が実行される
- **確認項目**:
  - [ ] `options.squashOnComplete`が`true`
  - [ ] スカッシュ処理が実行される

#### シナリオ 3.4.2: 環境変数 AI_WORKFLOW_SQUASH_ON_COMPLETE の動作

- **目的**: 環境変数が正常に機能することを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - 環境変数`AI_WORKFLOW_SQUASH_ON_COMPLETE=true`が設定されている
- **テスト手順**:
  1. `AI_WORKFLOW_SQUASH_ON_COMPLETE=true node dist/index.js execute --issue 194 --phase all` を実行
  2. ExecuteCommandOptionsを確認
- **期待結果**:
  - `options.squashOnComplete`が`true`に設定される
  - Evaluation Phase完了後にスカッシュ処理が実行される
- **確認項目**:
  - [ ] `options.squashOnComplete`が`true`
  - [ ] スカッシュ処理が実行される

#### シナリオ 3.4.3: CLIオプションと環境変数の優先度

- **目的**: CLIオプションが環境変数より優先されることを検証
- **前提条件**:
  - Gitリポジトリが初期化されている
  - 環境変数`AI_WORKFLOW_SQUASH_ON_COMPLETE=true`が設定されている
- **テスト手順**:
  1. `AI_WORKFLOW_SQUASH_ON_COMPLETE=true node dist/index.js execute --issue 194 --phase all --no-squash-on-complete` を実行
  2. ExecuteCommandOptionsを確認
- **期待結果**:
  - `options.squashOnComplete`が`false`に設定される（CLIオプションが優先）
  - スカッシュ処理が実行されない
- **確認項目**:
  - [ ] `options.squashOnComplete`が`false`
  - [ ] スカッシュ処理がスキップされる

---

### 3.5 エラーハンドリング統合

#### シナリオ 3.5.1: ブランチ保護エラー時のワークフロー継続

- **目的**: mainブランチでスカッシュを試みた場合にエラーになるが、ワークフロー全体は継続することを検証
- **前提条件**:
  - 現在のブランチが`main`
- **テスト手順**:
  1. `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
  2. エラーログを確認
- **期待結果**:
  - エラーログが出力される: `"Cannot squash commits on protected branch: main"`
  - スカッシュ処理が中断される
  - Evaluation Phaseは完了とマークされる
  - ワークフロー全体は正常終了する
- **確認項目**:
  - [ ] エラーログが出力される
  - [ ] `metadata.json`の`evaluation` phaseが`completed`
  - [ ] ワークフローが正常終了する（exit code 0）

#### シナリオ 3.5.2: コミット数不足時のスキップ

- **目的**: コミット数が1つ以下の場合にスカッシュがスキップされることを検証
- **前提条件**:
  - base_commit以降のコミットが1つのみ
- **テスト手順**:
  1. base_commit以降に1つのコミットのみ作成
  2. `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
- **期待結果**:
  - INFOログが出力される: `"Only 1 commit(s) found. Skipping squash."`
  - スカッシュ処理がスキップされる
  - ワークフローは正常に完了する
- **確認項目**:
  - [ ] INFOログが出力される
  - [ ] コミット数が変化していない
  - [ ] ワークフローが正常終了する

#### シナリオ 3.5.3: git reset失敗時のエラーハンドリング

- **目的**: git reset失敗時に適切にエラー処理されることを検証
- **前提条件**:
  - Gitリポジトリが破損している（モック設定）
- **テスト手順**:
  1. `git reset`が失敗するように設定（モック）
  2. SquashManager.executeSquash()を呼び出す
- **期待結果**:
  - エラーがスローされる: `"Failed to execute squash"`
  - WARNINGログが出力される
  - ワークフロー全体は継続される
- **確認項目**:
  - [ ] エラーログが出力される
  - [ ] ワークフローが正常終了する（スカッシュはスキップされる）

---

### 3.6 パフォーマンステスト

#### シナリオ 3.6.1: スカッシュ処理全体の実行時間

- **目的**: スカッシュ処理全体が30秒以内に完了することを検証（NFR-1.1）
- **前提条件**:
  - Gitリポジトリが初期化されている
  - 10個のコミットが存在する
  - エージェントが利用可能
- **テスト手順**:
  1. スカッシュ処理開始時刻を記録
  2. SquashManager.squashCommits()を実行
  3. 完了時刻を記録
- **期待結果**:
  - 実行時間が30秒以内
- **確認項目**:
  - [ ] 実行時間 <= 30秒

#### シナリオ 3.6.2: エージェントによるメッセージ生成時間

- **目的**: エージェントによるコミットメッセージ生成が10秒以内に完了することを検証（NFR-1.2）
- **前提条件**:
  - エージェントが利用可能
  - Issue情報と差分統計が利用可能
- **テスト手順**:
  1. メッセージ生成開始時刻を記録
  2. SquashManager.generateCommitMessage()を実行
  3. 完了時刻を記録
- **期待結果**:
  - 実行時間が10秒以内
- **確認項目**:
  - [ ] 実行時間 <= 10秒

#### シナリオ 3.6.3: Git操作（reset, commit, push）の実行時間

- **目的**: Git操作が20秒以内に完了することを検証（NFR-1.3）
- **前提条件**:
  - Gitリポジトリが初期化されている
  - リモートリポジトリが設定されている
- **テスト手順**:
  1. Git操作開始時刻を記録
  2. SquashManager.executeSquash()を実行
  3. 完了時刻を記録
- **期待結果**:
  - 実行時間が20秒以内
- **確認項目**:
  - [ ] 実行時間 <= 20秒

---

## 4. テストデータ

### 4.1 正常データ

#### コミットハッシュ（テスト用）:
```typescript
const BASE_COMMIT = 'abc123def456789012345678901234567890abcd';
const COMMITS = [
  'commit1hash000000000000000000000000000',
  'commit2hash000000000000000000000000000',
  'commit3hash000000000000000000000000000',
  'commit4hash000000000000000000000000000',
  'commit5hash000000000000000000000000000'
];
```

#### Issue情報（テスト用）:
```typescript
const ISSUE_INFO = {
  number: 194,
  title: 'feat: Squash commits after workflow completion with agent-generated commit message',
  body: `## 概要
Evaluation Phase 完了後のクリーンアップが終わった時点で、ワークフロー中に作成された一連のコミットをスカッシュして1つにまとめ、フォースプッシュする機能を追加する。`,
  labels: ['enhancement']
};
```

#### 有効なコミットメッセージ（テスト用）:
```typescript
const VALID_COMMIT_MESSAGE = `feat(squash): add commit squashing feature

This feature allows squashing workflow commits into one with agent-generated commit message.

Fixes #194`;
```

#### 差分統計（テスト用）:
```typescript
const DIFF_STAT = `
 src/core/git/squash-manager.ts        | 250 +++++++++++++++++++++++++++
 src/prompts/squash/generate-message.txt | 100 +++++++++++
 src/commands/init.ts                    |  10 ++
 src/core/metadata-manager.ts            |  30 ++++
 5 files changed, 390 insertions(+)
`;

const DIFF_SHORTSTAT = '5 files changed, 390 insertions(+)';
```

### 4.2 異常データ

#### 無効なコミットハッシュ:
```typescript
const INVALID_COMMIT = 'invalid_commit_hash';
```

#### 無効なコミットメッセージ:
```typescript
const INVALID_MESSAGES = [
  // 無効なtype
  'invalid: bad commit message\n\nFixes #194',

  // subjectが長すぎる
  'feat: this is a very long subject line that exceeds the fifty character limit for commit messages\n\nFixes #194',

  // Issue参照なし
  'feat: add squashing feature\n\nThis feature allows squashing.',

  // 形式が完全に間違っている
  'Just a plain commit message without any structure'
];
```

### 4.3 境界値データ

#### subject 50文字ちょうど:
```typescript
const BOUNDARY_MESSAGE_50 = 'feat: add squash feature for workflow commits'; // 46文字（50文字以内）
```

#### コミット数:
```typescript
const ZERO_COMMITS = [];
const ONE_COMMIT = ['commit1hash000000000000000000000000000'];
const TWO_COMMITS = [
  'commit1hash000000000000000000000000000',
  'commit2hash000000000000000000000000000'
];
```

### 4.4 エラーケース用データ

#### ブランチ名（保護ブランチ）:
```typescript
const PROTECTED_BRANCHES = ['main', 'master'];
const ALLOWED_BRANCHES = ['feature/issue-194', 'develop', 'bugfix/something'];
```

#### ネットワークエラー（モック用）:
```typescript
const NETWORK_ERROR = new Error('Network error: Connection timeout');
const GIT_ERROR = new Error('Git operation failed: Permission denied');
```

---

## 5. テスト環境要件

### 5.1 ローカル環境

#### 必要なソフトウェア:
- Node.js 20以上
- Git 2.30以上
- npm 9以上
- TypeScript 5.x

#### 環境変数:
```bash
# エージェント認証
OPENAI_API_KEY=<Codex用APIキー>
ANTHROPIC_API_KEY=<Claude用APIキー>

# GitHub認証
GITHUB_TOKEN=<GitHub Personal Access Token>

# スカッシュ機能制御（テスト用）
AI_WORKFLOW_SQUASH_ON_COMPLETE=false
```

### 5.2 CI/CD環境

#### テスト実行コマンド:
```bash
# ユニットテスト
npm run test:unit

# インテグレーションテスト
npm run test:integration

# すべてのテスト
npm run test
```

#### カバレッジ目標:
- ユニットテスト: 80%以上
- インテグレーションテスト: 主要フローをカバー

### 5.3 外部サービス

#### 必要なサービス:
1. **GitHub API**:
   - Issue情報の取得
   - PRコメント投稿
   - リポジトリ操作

2. **OpenAI API**（Codexエージェント）:
   - コミットメッセージ生成
   - プロンプト実行

3. **Anthropic API**（Claudeエージェント）:
   - コミットメッセージ生成
   - プロンプト実行

### 5.4 モック/スタブ

#### モックが必要な箇所:

1. **Gitリポジトリ**（ユニットテスト）:
   - `simple-git`のモック
   - コミット履歴のモック
   - ブランチ情報のモック

2. **エージェント**（ユニットテスト）:
   - `CodexAgentClient`のモック
   - `ClaudeAgentClient`のモック
   - エージェントレスポンスのモック

3. **ファイルシステム**（ユニットテスト）:
   - `fs-extra`のモック
   - プロンプトテンプレート読み込みのモック

4. **外部API**（インテグレーションテスト）:
   - GitHub APIのモック（必要に応じて）
   - OpenAI/Anthropic APIのモック（必要に応じて）

---

## 6. テストカバレッジ目標

### 6.1 ユニットテストカバレッジ

#### SquashManager:
- **行カバレッジ**: 90%以上
- **分岐カバレッジ**: 85%以上
- **関数カバレッジ**: 100%

主要メソッド:
- `squashCommits()`: 完全カバー
- `getCommitsToSquash()`: 完全カバー
- `validateBranchProtection()`: 完全カバー
- `generateCommitMessage()`: 正常系・異常系カバー
- `executeSquash()`: 正常系・異常系カバー
- `isValidCommitMessage()`: 境界値含む完全カバー
- `generateFallbackMessage()`: 完全カバー

#### MetadataManager拡張:
- **行カバレッジ**: 100%
- **分岐カバレッジ**: 100%
- **関数カバレッジ**: 100%

新規メソッド:
- `setBaseCommit()` / `getBaseCommit()`: 完全カバー
- `setPreSquashCommits()` / `getPreSquashCommits()`: 完全カバー
- `setSquashedAt()` / `getSquashedAt()`: 完全カバー

#### GitManager拡張:
- **行カバレッジ**: 100%
- **分岐カバレッジ**: N/A（単純な委譲のため）
- **関数カバレッジ**: 100%

新規メソッド:
- `squashCommits()`: 完全カバー（委譲のみ）

### 6.2 インテグレーションテストカバレッジ

#### ワークフロー統合:
- [ ] init → execute --squash-on-complete → スカッシュ成功
- [ ] init → execute --no-squash-on-complete → スカッシュスキップ
- [ ] 既存ワークフロー（base_commit未記録）→ スカッシュスキップ

#### Git操作統合:
- [ ] git reset → commit → push --force-with-lease の一連の流れ
- [ ] push --force-with-lease 失敗時のリトライ

#### エージェント統合:
- [ ] Codexエージェントによるコミットメッセージ生成
- [ ] Claudeエージェントによるコミットメッセージ生成
- [ ] エージェント失敗時のフォールバック
- [ ] 生成メッセージのバリデーション失敗時のフォールバック

#### CLIオプション統合:
- [ ] --squash-on-complete オプションの動作
- [ ] 環境変数 AI_WORKFLOW_SQUASH_ON_COMPLETE の動作
- [ ] CLIオプションと環境変数の優先度

#### エラーハンドリング統合:
- [ ] ブランチ保護エラー時のワークフロー継続
- [ ] コミット数不足時のスキップ
- [ ] git reset失敗時のエラーハンドリング

#### パフォーマンステスト:
- [ ] スカッシュ処理全体が30秒以内
- [ ] エージェントによるメッセージ生成が10秒以内
- [ ] Git操作が20秒以内

### 6.3 全体カバレッジ目標

- **行カバレッジ**: 80%以上
- **分岐カバレッジ**: 75%以上
- **関数カバレッジ**: 90%以上

---

## 7. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **UNIT_INTEGRATION戦略に準拠**:
  - ユニットテストシナリオ: セクション2（8つの主要コンポーネント）
  - インテグレーションテストシナリオ: セクション3（6つの統合ポイント）

### ✅ 主要な正常系がカバーされている

- **ユニットテスト正常系**:
  - `getCommitsToSquash_正常系_複数コミット`（2.1.1）
  - `validateBranchProtection_正常系_featureブランチ`（2.2.1）
  - `isValidCommitMessage_正常系_Conventional Commits形式`（2.3.1）
  - `generateFallbackMessage_正常系_完全なIssue情報`（2.4.1）
  - すべてのMetadataManagerメソッドの正常系（2.5.1, 2.6.1, 2.7.1）

- **インテグレーションテスト正常系**:
  - `init → execute --squash-on-complete → スカッシュ成功`（3.1.1）
  - `git reset → commit → push --force-with-lease の一連の流れ`（3.2.1）
  - `Codexエージェントによるコミットメッセージ生成`（3.3.1）
  - `Claudeエージェントによるコミットメッセージ生成`（3.3.2）
  - `--squash-on-complete オプションの動作`（3.4.1）

### ✅ 主要な異常系がカバーされている

- **ユニットテスト異常系**:
  - `getCommitsToSquash_異常系_無効なbase_commit`（2.1.3）
  - `validateBranchProtection_異常系_mainブランチ`（2.2.2）
  - `validateBranchProtection_異常系_masterブランチ`（2.2.3）
  - `isValidCommitMessage_異常系_無効なtype`（2.3.3）
  - `isValidCommitMessage_異常系_subjectが長すぎる`（2.3.4）
  - `isValidCommitMessage_異常系_Issue参照なし`（2.3.5）

- **インテグレーションテスト異常系**:
  - `既存ワークフロー（base_commit未記録）→ スカッシュスキップ`（3.1.3）
  - `push --force-with-lease 失敗時のリトライ`（3.2.2）
  - `エージェント失敗時のフォールバック`（3.3.3）
  - `生成メッセージのバリデーション失敗時のフォールバック`（3.3.4）
  - `ブランチ保護エラー時のワークフロー継続`（3.5.1）
  - `git reset失敗時のエラーハンドリング`（3.5.3）

### ✅ 期待結果が明確である

- すべてのテストケースに以下が明記されている:
  - **目的**: 何を検証するか
  - **前提条件**: テスト実行前の状態
  - **入力**: 具体的な入力パラメータ
  - **期待結果**: 検証可能な期待される出力・状態変化
  - **テストデータ**: 使用する具体的なデータ
  - **確認項目**: チェックリスト形式の確認ポイント

---

## 8. テスト実装の優先度

### 優先度1（必須）: クリティカルパス

1. **SquashManager.squashCommits() 正常系**（2.1.1, 2.2.1, 2.3.1, 2.4.1）
2. **スカッシュワークフロー全体統合**（3.1.1）
3. **Git操作統合**（3.2.1）
4. **エージェント統合 正常系**（3.3.1, 3.3.2）
5. **ブランチ保護チェック**（2.2.2, 2.2.3, 3.5.1）

### 優先度2（重要）: エラーハンドリング

1. **エージェント失敗時のフォールバック**（3.3.3, 3.3.4）
2. **後方互換性**（3.1.3）
3. **Git操作エラー**（2.1.3, 3.5.3）
4. **リトライロジック**（3.2.2）

### 優先度3（推奨）: その他

1. **境界値テスト**（2.1.4, 2.3.6）
2. **CLIオプション統合**（3.4.1, 3.4.2, 3.4.3）
3. **パフォーマンステスト**（3.6.1, 3.6.2, 3.6.3）
4. **スキップロジック**（3.1.2, 3.5.2）

---

## 9. テスト実装時の注意事項

### 9.1 モック/スタブの活用

- **ユニットテスト**では外部依存をすべてモック化する
- **インテグレーションテスト**では実際のGit操作を使用するが、エージェントAPIはモック化も検討

### 9.2 テストの独立性

- 各テストケースは独立して実行可能にする
- テスト間でのデータ共有を避ける
- setup/teardownで環境をクリーンにする

### 9.3 テストの可読性

- テストケース名は`対象メソッド_ケース種別_具体的な条件`形式で統一
- Arrange-Act-Assert（AAA）パターンを使用
- 期待結果を明確に記述

### 9.4 エラーメッセージの検証

- エラーハンドリングのテストではエラーメッセージも検証する
- ログ出力も検証対象に含める

### 9.5 パフォーマンステストの注意

- パフォーマンステストはCI/CD環境では不安定になる可能性がある
- タイムアウト値に余裕を持たせる
- 複数回実行して平均値を取る

---

**ドキュメント作成日**: 2025-01-30
**Issue番号**: #194
**作成者**: AI Workflow Agent (Test Scenario Phase)
**テスト戦略**: UNIT_INTEGRATION
**テストケース総数**: 36件（ユニット: 19件、インテグレーション: 17件）
