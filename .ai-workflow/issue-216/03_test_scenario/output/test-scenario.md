# テストシナリオ書

## Issue情報

- **Issue番号**: #216
- **タイトル**: bug: --squash-on-complete が正常に動作しない(複数の問題)
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/216

---

## 1. テスト戦略サマリー

### 1.1. 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

### 1.2. テスト対象の範囲

本テストシナリオは、Issue #216で発生している以下3つの問題の修正をカバーします：

1. **ESM環境での `__dirname` エラー修正**
   - `squash-manager.ts` の `loadPromptTemplate()` メソッドのパス解決ロジック
   - ESM互換の `import.meta.url` + `fileURLToPath` への変更

2. **Force push の確実な実行**
   - `remote-manager.ts` に新しい `forcePushToRemote()` メソッドを追加
   - `--force-with-lease` オプションの使用確認

3. **スカッシュ無効化の防止**
   - スカッシュ後の push 失敗時に pull を実行しないエラーハンドリング
   - 明確なエラーメッセージの提示

### 1.3. テストの目的

- **ユニットテスト**: 各修正された関数・メソッド単位での動作を検証
- **統合テスト**: 実際のGitリポジトリ環境でのスカッシュ＆プッシュの動作を検証
- **リグレッション防止**: 既存の通常push機能への影響がないことを確認

---

## 2. Unitテストシナリオ

### 2.1. SquashManager.loadPromptTemplate()（修正対象メソッド）

#### テストケース 2.1.1: ESM互換のパス解決_正常系

- **目的**: ESM環境で `import.meta.url` + `fileURLToPath` によるパス解決が正しく機能することを検証
- **前提条件**:
  - `squash-manager.ts` に `__filename` と `__dirname` の定義が追加されている
  - プロンプトテンプレートファイル（`generate-message.txt`）が存在する
- **入力**: なし（privateメソッドのため、間接的にテスト）
- **期待結果**:
  - プロンプトテンプレートの内容が正常に読み込まれる
  - `__dirname is not defined` エラーが発生しない
- **テストデータ**:
  - テンプレートファイル: `src/prompts/squash/generate-message.txt`

#### テストケース 2.1.2: プロンプトテンプレート読み込み失敗_異常系

- **目的**: ファイルが存在しない場合の適切なエラーハンドリングを検証
- **前提条件**: プロンプトテンプレートファイルが存在しない
- **入力**: 存在しないファイルパス
- **期待結果**:
  - `Failed to load prompt template` エラーがスローされる
  - エラーメッセージに原因が含まれる
- **テストデータ**: 存在しないパス

#### テストケース 2.1.3: パフォーマンス検証_境界値

- **目的**: プロンプトテンプレート読み込み時間が要件（100ms以内）を満たすことを検証
- **前提条件**:
  - テンプレートファイルが存在する
  - ESM互換のパス解決が実装されている
- **入力**: なし
- **期待結果**:
  - 読み込み時間が 100ms 以内
  - 既存実装（`__dirname`）と同等のパフォーマンス
- **テストデータ**: 実際のテンプレートファイル

---

### 2.2. RemoteManager.forcePushToRemote()（新規メソッド）

#### テストケース 2.2.1: Force push成功_正常系

- **目的**: `--force-with-lease` オプションを使用した正常な強制プッシュを検証
- **前提条件**:
  - ブランチ名が取得可能
  - リモートブランチが存在する
  - 認証情報が設定されている
- **入力**:
  - `maxRetries = 3`
  - `retryDelay = 2000`
- **期待結果**:
  - `git.raw(['push', '--force-with-lease', 'origin', branchName])` が実行される
  - `PushSummary { success: true, retries: 0 }` が返される
  - ログに "Force push completed successfully." が出力される
- **テストデータ**:
  - branchName: "ai-workflow/issue-216"

#### テストケース 2.2.2: Non-fast-forward エラー時のpull禁止_異常系

- **目的**: スカッシュ後のpush失敗時にpullを実行しないことを検証
- **前提条件**:
  - リモートブランチが先に進んでいる状態
  - force push が rejected される
- **入力**: 同上
- **期待結果**:
  - pull を実行しない
  - `PushSummary { success: false, error: 'Remote branch has diverged...' }` が返される
  - エラーメッセージに手動対処方法が含まれる
- **テストデータ**:
  - エラーメッセージ: "rejected (non-fast-forward)"

#### テストケース 2.2.3: ブランチ名取得失敗_異常系

- **目的**: ブランチ名が取得できない場合のエラーハンドリングを検証
- **前提条件**:
  - `git.status()` が null を返す
  - metadata.branch_name も null
- **入力**: 同上
- **期待結果**:
  - `Unable to determine current branch name` エラーがスローされる
- **テストデータ**:
  - status.current: null
  - metadata.data.branch_name: null

#### テストケース 2.2.4: リトライ可能エラーのリトライロジック_境界値

- **目的**: ネットワークエラー等のリトライ可能エラーで適切にリトライされることを検証
- **前提条件**:
  - 初回push時にネットワークエラーが発生
  - 2回目で成功
- **入力**:
  - `maxRetries = 3`
  - `retryDelay = 2000`
- **期待結果**:
  - 1回リトライされる
  - `PushSummary { success: true, retries: 1 }` が返される
  - ログに "Retriable error, retrying..." が出力される
- **テストデータ**:
  - 1回目エラー: "timeout"
  - 2回目成功

#### テストケース 2.2.5: 認証エラー時のリトライ禁止_異常系

- **目的**: 認証エラー等の非リトライ可能エラーで即座に失敗することを検証
- **前提条件**: 認証情報が不正
- **入力**: 同上
- **期待結果**:
  - リトライせずに即座に失敗
  - `PushSummary { success: false, retries: 0, error: 'authentication failed' }` が返される
- **テストデータ**:
  - エラーメッセージ: "authentication failed"

---

### 2.3. SquashManager.executeSquash()（修正対象メソッド）

#### テストケース 2.3.1: forcePushToRemote呼び出し確認_正常系

- **目的**: `pushToRemote()` ではなく `forcePushToRemote()` が呼び出されることを検証
- **前提条件**:
  - スカッシュコミットが作成された状態
  - RemoteManager に `forcePushToRemote()` メソッドが存在
- **入力**:
  - `baseCommit`: "abc123"
  - `message`: "feat: test squash"
- **期待結果**:
  - `git.reset(['--soft', baseCommit])` が実行される
  - `git.commit(message)` が実行される
  - `remoteManager.forcePushToRemote()` が呼び出される
  - `remoteManager.pushToRemote()` は呼び出されない
- **テストデータ**: 上記の入力値

#### テストケース 2.3.2: Git reset失敗時のエラー伝播_異常系

- **目的**: Git操作失敗時に適切なエラーメッセージでスローされることを検証
- **前提条件**: `git.reset()` がエラーを返す
- **入力**: 同上
- **期待結果**:
  - `Failed to execute squash` エラーがスローされる
  - エラーメッセージに原因が含まれる
- **テストデータ**:
  - reset エラー: "fatal: ambiguous argument 'abc123'"

---

### 2.4. RemoteManager.pushToRemote()（既存メソッド）

#### テストケース 2.4.1: 既存の通常push機能が影響を受けていない_正常系

- **目的**: 新しい `forcePushToRemote()` メソッド追加により、既存の `pushToRemote()` が影響を受けていないことを検証
- **前提条件**:
  - upstream が設定されている
  - push可能な状態
- **入力**:
  - `maxRetries = 3`
  - `retryDelay = 2000`
- **期待結果**:
  - 通常のpushが正常に実行される
  - `--force-with-lease` が使用されない
  - `PushSummary { success: true, retries: 0 }` が返される
- **テストデータ**:
  - branchName: "feature/test"

#### テストケース 2.4.2: Non-fast-forward エラー時のpull実行_正常系

- **目的**: 通常pushにおけるnon-fast-forwardエラー時のpull動作が維持されていることを検証
- **前提条件**:
  - リモートブランチが先に進んでいる
  - 通常pushが rejected
- **入力**: 同上
- **期待結果**:
  - pullが実行される（スカッシュ後と異なる動作）
  - pullに成功した場合、pushがリトライされる
- **テストデータ**:
  - エラーメッセージ: "rejected (non-fast-forward)"

---

## 3. Integrationテストシナリオ

### 3.1. スカッシュ＆フォースプッシュの統合動作

#### シナリオ 3.1.1: ESM環境でのスカッシュワークフロー全体の成功

- **目的**: ESM環境でプロンプト読み込みからスカッシュ完了までのエンドツーエンドの動作を検証
- **前提条件**:
  - Node.js ESM環境で実行
  - base_commit が記録されている
  - 5つ以上のコミットが存在する
  - featureブランチである
- **テスト手順**:
  1. `squash-manager.ts` のESM互換コードでプロンプトテンプレートを読み込む
  2. エージェントでコミットメッセージを生成
  3. `git reset --soft <base_commit>` を実行
  4. `git commit -m "<message>"` を実行
  5. `forcePushToRemote()` で `git push --force-with-lease` を実行
- **期待結果**:
  - `__dirname is not defined` エラーが発生しない
  - プロンプトテンプレートが正常に読み込まれる
  - スカッシュされた単一コミットが作成される
  - リモートに正常にプッシュされる
  - metadata.json に `pre_squash_commits` と `squashed_at` が記録される
- **確認項目**:
  - [ ] `__dirname` エラーが発生しない
  - [ ] テンプレートファイルが読み込まれている
  - [ ] `git log` でコミット数が1つになっている
  - [ ] リモートブランチが更新されている
  - [ ] `pre_squash_commits` に元のコミットハッシュが記録されている

#### シナリオ 3.1.2: --force-with-lease による安全な強制プッシュ

- **目的**: `--force-with-lease` が他の変更を上書きしないことを検証
- **前提条件**:
  - スカッシュコミット作成後
  - 別の開発者がリモートブランチに変更をプッシュ済み
- **テスト手順**:
  1. ローカルでスカッシュコミットを作成
  2. 別セッションでリモートブランチに新しいコミットをプッシュ
  3. `forcePushToRemote()` を実行
- **期待結果**:
  - push が rejected される
  - `Remote branch has diverged` エラーメッセージが表示される
  - 手動対処方法が提示される
  - 他の開発者の変更が保護される
- **確認項目**:
  - [ ] push が失敗する
  - [ ] エラーメッセージに "diverged" が含まれる
  - [ ] 手動対処のGitコマンドが提示される
  - [ ] リモートブランチの他の変更が残っている

#### シナリオ 3.1.3: スカッシュ後のpush失敗時にpullを実行しない

- **目的**: スカッシュ後のnon-fast-forwardエラー時にpullを実行せず、スカッシュが無効化されないことを検証
- **前提条件**:
  - スカッシュコミット作成後
  - リモートブランチが先に進んでいる（強制的にシミュレート）
- **テスト手順**:
  1. スカッシュコミットを作成
  2. リモートブランチを強制的に先に進める
  3. `forcePushToRemote()` を実行
- **期待結果**:
  - push が失敗する
  - pull を実行しない
  - ローカルのスカッシュコミットが保持される
  - `pre_squash_commits` メタデータが保持される（ロールバック可能）
- **確認項目**:
  - [ ] push が失敗する
  - [ ] pull が実行されない
  - [ ] `git log` でスカッシュコミットが残っている
  - [ ] `pre_squash_commits` に元のコミットが記録されている

---

### 3.2. リグレッションテスト（既存機能への影響確認）

#### シナリオ 3.2.1: 通常のpush機能が正常に動作する

- **目的**: `forcePushToRemote()` 追加により、既存の `pushToRemote()` が影響を受けていないことを検証
- **前提条件**:
  - 通常のワークフロー実行（Phase 0~9）
  - スカッシュオプションなし
- **テスト手順**:
  1. `init` コマンドでワークフローを開始
  2. 各Phase で通常通りコミット
  3. Phase 0~9 でそれぞれ `pushToRemote()` を実行
- **期待結果**:
  - すべてのPhaseで通常pushが成功する
  - `--force-with-lease` が使用されない
  - Non-fast-forward エラー時にpullが実行される（既存動作）
- **確認項目**:
  - [ ] すべてのPhaseでpushが成功する
  - [ ] force pushが実行されない
  - [ ] エラー時のpullロジックが動作する

#### シナリオ 3.2.2: 既存のユニットテストがすべて成功する

- **目的**: 既存のテストスイートがすべて成功し、リグレッションがないことを検証
- **前提条件**:
  - コード変更がすべて完了
  - テスト環境が構築されている
- **テスト手順**:
  1. `npm run test:unit` を実行
  2. すべてのテストケースを確認
- **期待結果**:
  - すべてのユニットテストが成功する
  - 新しいテストケースが追加されている
  - 既存テストが失敗していない
- **確認項目**:
  - [ ] 既存テストがすべて成功
  - [ ] 新規テストが追加されている
  - [ ] カバレッジが維持または向上している

#### シナリオ 3.2.3: 既存の統合テストがすべて成功する

- **目的**: 既存の統合テストがすべて成功し、リグレッションがないことを検証
- **前提条件**: 同上
- **テスト手順**:
  1. `npm run test:integration` を実行
  2. すべてのテストケースを確認
- **期待結果**: 同上
- **確認項目**: 同上

---

### 3.3. エラーハンドリングの統合テスト

#### シナリオ 3.3.1: ブランチ保護チェックでmain/masterへのforce push禁止

- **目的**: main/masterブランチでのスカッシュ実行時に適切にエラーが発生することを検証
- **前提条件**:
  - 現在のブランチが main または master
  - スカッシュ対象のコミットが存在
- **テスト手順**:
  1. main ブランチに切り替え
  2. `squashCommits()` を実行
- **期待結果**:
  - `Cannot squash commits on protected branch: main` エラーがスローされる
  - スカッシュ処理が実行されない
  - リモートへのpushが行われない
- **確認項目**:
  - [ ] エラーメッセージが明確
  - [ ] スカッシュが実行されない
  - [ ] リモートブランチが変更されない

#### シナリオ 3.3.2: Force push失敗時のロールバック可能性

- **目的**: スカッシュ後のpush失敗時に元のコミット履歴にロールバック可能であることを検証
- **前提条件**:
  - スカッシュコミット作成後
  - push が失敗
  - `pre_squash_commits` メタデータが記録されている
- **テスト手順**:
  1. スカッシュコミットを作成
  2. push を失敗させる
  3. `pre_squash_commits` から元のコミットハッシュを取得
  4. `git reset --hard <最後のpre_squash_commit>` を実行
- **期待結果**:
  - 元のコミット履歴が復元される
  - スカッシュ前の状態に戻る
- **確認項目**:
  - [ ] `pre_squash_commits` に元のコミットが記録されている
  - [ ] reset により元の履歴が復元される
  - [ ] データ損失がない

---

## 4. テストデータ

### 4.1. 正常データ

#### プロンプトテンプレート
```
You are tasked with generating a commit message for a squashed commit...

Issue: #{issue_number}
Title: {issue_title}

{issue_body}

Changes:
{diff_stat}

{diff_shortstat}
```

#### 有効なコミットメッセージ（Conventional Commits形式）
```
feat(squash): add commit squashing feature

This feature allows squashing workflow commits into one.

Fixes #194
```

#### メタデータ（metadata.json）
```json
{
  "base_commit": "abc123def456789012345678901234567890abcd",
  "branch_name": "ai-workflow/issue-216",
  "pre_squash_commits": [
    "commit1hash000000000000000000000000000",
    "commit2hash000000000000000000000000000",
    "commit3hash000000000000000000000000000"
  ],
  "squashed_at": "2025-01-30T10:00:00.000Z"
}
```

---

### 4.2. 異常データ

#### 無効なコミットメッセージ（フォーマット違反）
```
Invalid commit message without proper format
```

#### 存在しないbase_commit
```
"invalid_commit_hash_that_does_not_exist"
```

#### エラーメッセージ例
```
rejected (non-fast-forward)
authentication failed
timeout
__dirname is not defined
```

---

### 4.3. 境界値データ

#### 50文字ちょうどのコミットメッセージ
```
feat: add squash feature for workflow commits

Fixes #194
```

#### 1つのコミット（スカッシュスキップ）
```
[{ hash: 'commit1hash000000000000000000000000000' }]
```

#### 0コミット（base_commit == HEAD）
```
[]
```

---

## 5. テスト環境要件

### 5.1. 必要なテスト環境

- **ローカル環境**: 開発者のマシン（ユニットテスト、統合テスト）
- **CI/CD環境**: Jenkins（自動テスト実行）

### 5.2. 必要な外部サービス・データベース

- **GitHub**: リモートリポジトリへのpush検証
- **Git**: ローカルGitリポジトリ（統合テスト用）

### 5.3. モック/スタブの必要性

#### ユニットテストで使用するモック

1. **SimpleGit モック**:
   - `git.log()`: コミット履歴取得
   - `git.revparse()`: ブランチ名取得
   - `git.reset()`: ソフトリセット
   - `git.commit()`: コミット作成
   - `git.raw()`: force push実行
   - `git.status()`: ブランチ状態取得

2. **fs.promises モック**:
   - `fs.readFile()`: プロンプトテンプレート読み込み
   - `fs.mkdir()`: 一時ディレクトリ作成
   - `fs.rm()`: 一時ディレクトリ削除

3. **MetadataManager モック**:
   - `getBaseCommit()`: base_commit取得
   - `setPreSquashCommits()`: pre_squash_commits記録
   - `setSquashedAt()`: squashed_atタイムスタンプ記録

4. **RemoteManager モック**:
   - `pushToRemote()`: 通常push（ユニットテストのみ）
   - `forcePushToRemote()`: force push（ユニットテストのみ）

5. **エージェントクライアント モック**:
   - `CodexAgentClient.executeTask()`: コミットメッセージ生成
   - `ClaudeAgentClient.executeTask()`: コミットメッセージ生成（フォールバック）

#### 統合テストで使用する実環境

- **実Gitリポジトリ**: 統合テスト用の一時リポジトリ
- **実ファイルシステム**: プロンプトテンプレートファイルの読み込み

---

## 6. テスト実行計画

### 6.1. ユニットテスト実行

**コマンド**: `npm run test:unit`

**実行タイミング**: コード修正後、即座に実行

**対象ファイル**:
- `tests/unit/squash-manager.test.ts`（既存テストに追加）
- `tests/unit/remote-manager.test.ts`（新規作成の可能性）

**実行時間**: 約 1~2分

---

### 6.2. 統合テスト実行

**コマンド**: `npm run test:integration`

**実行タイミング**: ユニットテスト成功後

**対象ファイル**:
- `tests/integration/squash-workflow.test.ts`（既存テストに追加）

**実行時間**: 約 3~5分

---

### 6.3. リグレッションテスト実行

**コマンド**: `npm test`（すべてのテスト）

**実行タイミング**: 統合テスト成功後

**対象**: すべての既存テストスイート

**実行時間**: 約 5~10分

---

## 7. 品質ゲート（Phase 3）

本テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_INTEGRATION戦略に基づき、ユニットテストと統合テストの両方を作成

- [x] **主要な正常系がカバーされている**
  - ESM互換のパス解決（2.1.1）
  - Force push成功（2.2.1）
  - スカッシュワークフロー全体の成功（3.1.1）
  - 既存機能の動作確認（3.2.1）

- [x] **主要な異常系がカバーされている**
  - Non-fast-forward エラー時のpull禁止（2.2.2）
  - ブランチ保護チェック（3.3.1）
  - 認証エラー（2.2.5）
  - プロンプトテンプレート読み込み失敗（2.1.2）

- [x] **期待結果が明確である**
  - すべてのテストケースに具体的な期待結果を記載
  - 確認項目をチェックリスト形式で記載
  - 入力・出力が明確に定義されている

---

## 8. テストシナリオのサマリー

### 8.1. ユニットテストケース数

- **SquashManager.loadPromptTemplate()**: 3ケース
- **RemoteManager.forcePushToRemote()**: 5ケース
- **SquashManager.executeSquash()**: 2ケース
- **RemoteManager.pushToRemote()**: 2ケース（リグレッション）

**合計**: 12ケース

---

### 8.2. 統合テストシナリオ数

- **スカッシュ＆フォースプッシュの統合動作**: 3シナリオ
- **リグレッションテスト**: 3シナリオ
- **エラーハンドリングの統合テスト**: 2シナリオ

**合計**: 8シナリオ

---

### 8.3. カバレッジ目標

- **ユニットテスト**: 修正対象メソッドのカバレッジ 100%
- **統合テスト**: クリティカルパスのカバレッジ 100%
- **リグレッション**: 既存テストの成功率 100%

---

## 9. 重要な注意事項

### 9.1. テスト実行順序

1. **ユニットテスト優先**: 各メソッド単位での動作確認
2. **統合テスト**: エンドツーエンドの動作確認
3. **リグレッションテスト**: 既存機能への影響確認

### 9.2. CI/CD統合

- すべてのテストはJenkins CI環境で自動実行される
- テスト失敗時はPRマージをブロックする
- カバレッジレポートを生成し、品質を可視化する

### 9.3. テストデータの管理

- 実際のGitHub Issueデータは使用せず、モックデータを使用
- プロンプトテンプレートは実ファイルを使用（統合テスト）
- メタデータは一時ファイルで管理（統合テスト後にクリーンアップ）

---

## 10. 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2025-01-30 | 1.0 | 初版作成 | AI Workflow Agent |

---

## 11. 承認

本テストシナリオは、以下の品質ゲート（Phase 3）を満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**（UNIT_INTEGRATION）
- [x] **主要な正常系がカバーされている**（12ユニットテスト、8統合テスト）
- [x] **主要な異常系がカバーされている**（エラーハンドリング、ブランチ保護等）
- [x] **期待結果が明確である**（すべてのテストケースに具体的な期待結果を記載）

次のフェーズ（Implementation Phase）に進む準備が整いました。
