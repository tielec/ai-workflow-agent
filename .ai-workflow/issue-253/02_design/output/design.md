# 詳細設計書

## Issue概要

- **Issue番号**: #253
- **タイトル**: metadata.json から pr_url が消失する(または最初から埋め込まれない)問題
- **状態**: open
- **優先度**: 中(PR情報の欠落によるワークフロー問題)

---

## 1. アーキテクチャ設計

### システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                    init コマンド実行                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  handleInitCommand() in src/commands/init.ts                │
│                                                               │
│  【修正前の処理フロー】                                        │
│  1. metadata.json 作成 & 保存 (pr_url なし)                  │
│  2. gitManager.commitWorkflowInit() → コミット                │
│  3. gitManager.pushToRemote() → プッシュ                      │
│  4. githubClient.createPullRequest() → PR作成                 │
│  5. metadataManager.save() → pr_url を保存(ローカルのみ) ❌   │
│                                                               │
│  【修正後の処理フロー】                                        │
│  1. metadata.json 作成 & 保存 (pr_url なし)                  │
│  2. gitManager.commitWorkflowInit() → コミット                │
│  3. gitManager.pushToRemote() → プッシュ                      │
│  4. githubClient.createPullRequest() → PR作成                 │
│  5. metadataManager.save() → pr_url を保存                    │
│  6. gitManager.commitPhaseOutput() → 再度コミット ✅           │
│  7. gitManager.pushToRemote() → 再度プッシュ ✅               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CommitManager.commitPhaseOutput()                           │
│  in src/core/git/commit-manager.ts                           │
│                                                               │
│  - FileSelector.getChangedFiles()                            │
│  - FileSelector.filterPhaseFiles()                           │
│  - SecretMasker.maskSecretsInWorkflowDir()                   │
│  - git.add() → git.commit()                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  RemoteManager.pushToRemote()                                │
│  in src/core/git/remote-manager.ts                           │
│                                                               │
│  - Retry ロジック (最大3回)                                   │
│  - git.push() 実行                                            │
└─────────────────────────────────────────────────────────────┘
```

### コンポーネント間の関係

```
┌──────────────────────┐
│   src/commands/      │
│   init.ts            │
│                      │
│  handleInitCommand() │
└──────────────────────┘
           │
           │ uses
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│  MetadataManager     │       │  GitHubClient        │
│                      │       │                      │
│  save()              │       │  createPullRequest() │
│  data.pr_url         │       │  checkExistingPr()   │
│  data.pr_number      │       │  getIssue()          │
└──────────────────────┘       └──────────────────────┘
           │
           │ uses
           ▼
┌──────────────────────┐
│  GitManager          │
│  (Facade)            │
│                      │
│  commitWorkflowInit()│───┐
│  commitPhaseOutput() │   │ delegates to
│  pushToRemote()      │   │
└──────────────────────┘   │
                           ▼
           ┌───────────────────────────────────┐
           │                                   │
           ▼                                   ▼
┌──────────────────────┐       ┌──────────────────────┐
│  CommitManager       │       │  RemoteManager       │
│                      │       │                      │
│  commitPhaseOutput() │       │  pushToRemote()      │
│  commitWorkflowInit()│       │                      │
│  - FileSelector      │       │  - Retry logic       │
│  - MessageBuilder    │       │  - Error handling    │
│  - SecretMasker      │       │                      │
└──────────────────────┘       └──────────────────────┘
```

### データフロー

```
Step 1: metadata.json 初期作成
┌──────────────────────┐
│ metadata.json        │
│                      │
│ pr_url: null         │ ← 初期状態
│ pr_number: null      │
└──────────────────────┘
         │
         │ commitWorkflowInit() & pushToRemote()
         ▼
┌──────────────────────┐
│ Remote Repository    │
│                      │
│ metadata.json        │
│ pr_url: null         │ ← リモートにプッシュ
└──────────────────────┘

Step 2: PR作成
┌──────────────────────┐
│ GitHub API           │
│                      │
│ createPullRequest()  │
│  → pr_url, pr_number │
└──────────────────────┘
         │
         │ 結果を取得
         ▼
┌──────────────────────┐
│ metadata.json        │
│ (Local)              │
│                      │
│ pr_url: "https://..."│ ← ローカルに保存
│ pr_number: 123       │
└──────────────────────┘

Step 3: PR情報を再度コミット&プッシュ (修正箇所)
         │
         │ commitPhaseOutput() & pushToRemote()
         ▼
┌──────────────────────┐
│ Remote Repository    │
│                      │
│ metadata.json        │
│ pr_url: "https://..."│ ← リモートにプッシュ ✅
│ pr_number: 123       │
└──────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
1. **既存ファイルへの影響範囲が限定的**
   - 変更対象は `src/commands/init.ts` の `handleInitCommand()` 関数内のみ(約20行の修正)
   - 新規ファイルの作成は不要
   - 既存のメソッド(`gitManager.commitPhaseOutput()`, `gitManager.pushToRemote()`)を再利用

2. **既存の処理フローを拡張**
   - PR作成後のコミット&プッシュ処理を追加するだけ
   - 既存の処理順序(metadata作成→コミット→プッシュ→PR作成)は維持
   - 新しい処理(PR情報のコミット&プッシュ)を末尾に追加

3. **新規機能ではなく既存処理の修正**
   - 新しい機能の追加ではなく、既存機能の不具合修正
   - データ構造の変更なし(`pr_url`, `pr_number` フィールドは既存)
   - アーキテクチャの変更なし(既存のモジュール構成を維持)

4. **リファクタリングも不要**
   - コード構造の改善は不要(既存のファサードパターンを利用)
   - 既存のエラーハンドリングパターンを踏襲
   - 既存のログ出力パターンを踏襲

**結論**: 既存コードを最小限の変更で拡張する「EXTEND」戦略が最適

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
1. **ユニットテストが必要な理由**
   - `handleInitCommand()` 関数のロジック変更を検証
   - 処理順序が正しいか(PR作成 → metadata保存 → コミット&プッシュ)
   - `metadata.json` に `pr_url` が正しく保存されるか
   - モックを使用して外部依存(Git、GitHub API)を排除

2. **インテグレーションテストが必要な理由**
   - 実際のGit操作とファイルシステムを使用
   - `init` コマンド実行後、リモートの `metadata.json` に `pr_url` が存在するか検証
   - `execute` コマンドで `pr_url` が正しく読み込めるか検証
   - エンドツーエンドの動作確認

3. **BDDテストが不要な理由**
   - エンドユーザー向け機能ではなく、内部のバグ修正
   - ユーザーストーリーやビジネス要件の変更なし
   - 開発者向けのテストで十分

**結論**: 「UNIT_INTEGRATION」戦略により、ロジック検証とエンドツーエンドの動作確認を両立

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:
1. **既存テストの拡張(EXTEND_TEST)が必要な理由**
   - `tests/unit/commands/init.test.ts`(存在する場合)にテストケースを追加
   - `handleInitCommand()` のロジック検証を強化
   - 既存のユニットテストと整合性を保つ

2. **新規テストの作成(CREATE_TEST)が必要な理由**
   - `tests/integration/init-pr-url.test.ts`(新規作成)
   - 実際のGit操作とファイルシステムを使用した統合テスト
   - `init` → `execute` のフローで `pr_url` が消失しないことを検証
   - 既存の統合テストでは対応できない新しいテストシナリオ

3. **既存テストファイルの制約**
   - 既存のユニットテストは主にバリデーションロジックの検証
   - PR作成後のコミット&プッシュは新しいテストシナリオ
   - 統合テストは新規ファイルとして作成する方が保守性が高い

**結論**: 既存テストの拡張と新規テストの作成を組み合わせる「BOTH_TEST」戦略が最適

---

## 5. 影響範囲分析

### 既存コードへの影響

#### 変更が必要なファイル

1. **`src/commands/init.ts`** (約372行 → 約395行、+23行)
   - `handleInitCommand()` 関数内の処理順序変更(358-370行目付近)
   - PR作成後のコミット&プッシュ追加(約15行)

#### 変更が不要なファイル

1. **`src/core/metadata-manager.ts`**
   - 変更不要(`data.pr_url`, `data.pr_number` フィールドは既存)
   - `save()` メソッドをそのまま使用

2. **`src/core/git-manager.ts`**
   - 変更不要(既存メソッドを再利用)
   - `commitPhaseOutput()`, `pushToRemote()` をそのまま使用

3. **`src/core/git/commit-manager.ts`**
   - 変更不要(既存のコミット処理を再利用)
   - `commitPhaseOutput()` で `planning` フェーズのコミットを作成

4. **`src/core/git/remote-manager.ts`**
   - 変更不要(既存のプッシュ処理を再利用)

5. **`src/core/github-client.ts`**
   - 変更不要(PR作成処理は既存のまま)

### 依存関係の変更

#### 新規依存の追加
- **なし**: 既存の依存関係のみを使用

#### 既存依存の変更
- **なし**: `simple-git`, `fs-extra`, `GitManager`, `MetadataManager`, `GitHubClient` 等、すべて既存依存を使用

### マイグレーション要否

#### 不要
- **データ構造変更なし**: `metadata.json` の形式に変更なし
- **既存フィールド使用**: `pr_url`, `pr_number` フィールドは既存
- **後方互換性維持**: 既存のワークフローに影響なし

---

## 6. 変更・追加ファイルリスト

### 新規作成ファイル

1. **`tests/integration/init-pr-url.test.ts`** (新規作成)
   - 統合テスト: `init` コマンド実行後の `pr_url` 保存確認
   - 統合テスト: `execute` コマンドでの `pr_url` 読み込み確認

### 修正が必要な既存ファイル

1. **`src/commands/init.ts`**
   - 358-370行目付近: PR作成後のコミット&プッシュ処理を追加

2. **`tests/unit/commands/init.test.ts`** (存在する場合)
   - PR作成後のコミット&プッシュ処理のテストケースを追加

### 削除が必要なファイル

- **なし**: 既存ファイルの削除は不要

---

## 7. 詳細設計

### 7.1 修正対象ファイル: `src/commands/init.ts`

#### 変更箇所: `handleInitCommand()` 関数内 (358-370行目付近)

**修正前のコード**:
```typescript
const prResult = await githubClient.createPullRequest(prTitle, prBody, branchName, 'main', true);

if (prResult.success) {
  logger.info(`Draft PR created: ${prResult.pr_url}`);
  metadataManager.data.pr_number = prResult.pr_number ?? null;
  metadataManager.data.pr_url = prResult.pr_url ?? null;
  metadataManager.save();  // ← ローカルのみ保存、コミット&プッシュなし！
} else {
  logger.warn(`PR creation failed: ${prResult.error ?? 'unknown error'}. Please create manually.`);
}
```

**修正後のコード**:
```typescript
const prResult = await githubClient.createPullRequest(prTitle, prBody, branchName, 'main', true);

if (prResult.success) {
  logger.info(`Draft PR created: ${prResult.pr_url}`);
  metadataManager.data.pr_number = prResult.pr_number ?? null;
  metadataManager.data.pr_url = prResult.pr_url ?? null;
  metadataManager.save();

  // PR情報をコミット&プッシュ (Issue #253: Fix pr_url persistence)
  logger.info('Committing PR information to metadata.json...');
  try {
    const prCommitResult = await gitManager.commitPhaseOutput(
      'planning',
      'completed',
      undefined,
    );
    if (prCommitResult.success) {
      logger.info(`PR metadata commit created: ${prCommitResult.commit_hash?.slice(0, 7) ?? 'unknown'}`);

      const prPushResult = await gitManager.pushToRemote();
      if (prPushResult.success) {
        logger.info('PR metadata pushed to remote successfully.');
      } else {
        logger.warn(`Failed to push PR metadata: ${prPushResult.error ?? 'unknown error'}. PR info saved locally.`);
      }
    } else {
      logger.warn(`Failed to commit PR metadata: ${prCommitResult.error ?? 'unknown error'}. PR info saved locally.`);
    }
  } catch (error) {
    logger.warn(`Failed to commit/push PR metadata: ${getErrorMessage(error)}. PR info saved locally.`);
  }
} else {
  logger.warn(`PR creation failed: ${prResult.error ?? 'unknown error'}. Please create manually.`);
}
```

#### 設計のポイント

1. **既存メソッドの再利用**
   - `gitManager.commitPhaseOutput()` を使用(既存のコミット処理)
   - `gitManager.pushToRemote()` を使用(既存のプッシュ処理)

2. **エラーハンドリング**
   - コミット失敗時: 警告ログを出力し、ローカル保存は維持
   - プッシュ失敗時: 警告ログを出力し、ローカル保存は維持
   - `try-catch` で予期しないエラーをキャッチ

3. **ログ出力**
   - コミット成功時: コミットハッシュを出力
   - プッシュ成功時: 成功メッセージを出力
   - 失敗時: 警告メッセージを出力

4. **コミットメッセージ形式**
   - `commitPhaseOutput('planning', 'completed', undefined)` を使用
   - 既存の形式: `[ai-workflow] Phase 0 (planning) - completed`

### 7.2 新規作成ファイル: `tests/integration/init-pr-url.test.ts`

#### テストシナリオ

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import simpleGit from 'simple-git';
import { handleInitCommand } from '../../../src/commands/init.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';

describe('init command - PR URL persistence (Integration Test)', () => {
  const testRepoRoot = path.join(__dirname, '../../tmp/test-init-pr-url');
  const issueNumber = 253;
  const issueUrl = `https://github.com/tielec/ai-workflow-agent/issues/${issueNumber}`;
  const workflowDir = path.join(testRepoRoot, '.ai-workflow', `issue-${issueNumber}`);
  const metadataPath = path.join(workflowDir, 'metadata.json');

  beforeEach(async () => {
    // テスト用リポジトリのセットアップ
    await fs.ensureDir(testRepoRoot);
    const git = simpleGit(testRepoRoot);
    await git.init();
    await git.addConfig('user.name', 'Test User', false, 'local');
    await git.addConfig('user.email', 'test@example.com', false, 'local');
  });

  afterEach(async () => {
    // クリーンアップ
    await fs.remove(testRepoRoot);
  });

  it('should persist pr_url to remote metadata.json after PR creation', async () => {
    // Given: init コマンド実行
    await handleInitCommand(issueUrl);

    // When: リモートの metadata.json を確認
    const git = simpleGit(testRepoRoot);
    const remoteBranches = await git.branch(['-r']);
    const branchName = `ai-workflow/issue-${issueNumber}`;
    const remoteBranchExists = remoteBranches.all.some((ref) =>
      ref.includes(`origin/${branchName}`),
    );

    // Then: リモートブランチが存在する
    expect(remoteBranchExists).toBe(true);

    // Then: metadata.json に pr_url が保存されている
    const metadata = await fs.readJson(metadataPath);
    expect(metadata.pr_url).toBeDefined();
    expect(metadata.pr_url).not.toBeNull();
    expect(metadata.pr_number).toBeDefined();
    expect(metadata.pr_number).not.toBeNull();
  });

  it('should load pr_url correctly in execute command', async () => {
    // Given: init コマンド実行
    await handleInitCommand(issueUrl);

    // When: MetadataManager で読み込み
    const metadataManager = new MetadataManager(metadataPath);

    // Then: pr_url が正しく読み込める
    expect(metadataManager.data.pr_url).toBeDefined();
    expect(metadataManager.data.pr_url).not.toBeNull();
    expect(metadataManager.data.pr_number).toBeDefined();
    expect(metadataManager.data.pr_number).not.toBeNull();
  });
});
```

### 7.3 修正対象ファイル: `tests/unit/commands/init.test.ts` (存在する場合)

#### 追加するテストケース

```typescript
describe('handleInitCommand', () => {
  // 既存のテストケース...

  describe('PR URL persistence', () => {
    it('should commit and push metadata.json after PR creation', async () => {
      // Given: モックのセットアップ
      const mockGitManager = {
        commitWorkflowInit: jest.fn().mockResolvedValue({ success: true, commit_hash: 'abc123' }),
        pushToRemote: jest.fn().mockResolvedValue({ success: true }),
        commitPhaseOutput: jest.fn().mockResolvedValue({ success: true, commit_hash: 'def456' }),
      };
      const mockGitHubClient = {
        createPullRequest: jest.fn().mockResolvedValue({
          success: true,
          pr_url: 'https://github.com/owner/repo/pull/123',
          pr_number: 123,
        }),
        checkExistingPr: jest.fn().mockResolvedValue(null),
        getIssue: jest.fn().mockResolvedValue({ title: 'Test Issue' }),
      };
      const mockMetadataManager = {
        data: { pr_url: null, pr_number: null },
        save: jest.fn(),
      };

      // When: handleInitCommand 実行
      await handleInitCommand('https://github.com/owner/repo/issues/253');

      // Then: commitPhaseOutput が呼ばれた
      expect(mockGitManager.commitPhaseOutput).toHaveBeenCalledWith(
        'planning',
        'completed',
        undefined,
      );

      // Then: pushToRemote が2回呼ばれた
      expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);

      // Then: metadata に pr_url が保存された
      expect(mockMetadataManager.data.pr_url).toBe('https://github.com/owner/repo/pull/123');
      expect(mockMetadataManager.data.pr_number).toBe(123);
    });

    it('should handle commit failure gracefully', async () => {
      // Given: コミット失敗のモック
      const mockGitManager = {
        commitWorkflowInit: jest.fn().mockResolvedValue({ success: true }),
        pushToRemote: jest.fn().mockResolvedValue({ success: true }),
        commitPhaseOutput: jest.fn().mockResolvedValue({ success: false, error: 'Commit failed' }),
      };

      // When: handleInitCommand 実行
      await handleInitCommand('https://github.com/owner/repo/issues/253');

      // Then: エラーがスローされない(警告ログのみ)
      expect(mockGitManager.commitPhaseOutput).toHaveBeenCalled();
    });

    it('should handle push failure gracefully', async () => {
      // Given: プッシュ失敗のモック
      const mockGitManager = {
        commitWorkflowInit: jest.fn().mockResolvedValue({ success: true }),
        pushToRemote: jest.fn()
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false, error: 'Push failed' }),
        commitPhaseOutput: jest.fn().mockResolvedValue({ success: true }),
      };

      // When: handleInitCommand 実行
      await handleInitCommand('https://github.com/owner/repo/issues/253');

      // Then: エラーがスローされない(警告ログのみ)
      expect(mockGitManager.pushToRemote).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

- **変更なし**: 既存の認証機構(GITHUB_TOKEN)を使用
- **PR作成権限**: 既存のGitHub Personal Access Tokenを使用

### 8.2 データ保護

1. **Personal Access Tokenのマスキング**
   - 既存の `SecretMasker` を使用(Issue #54で実装済み)
   - `CommitManager.commitPhaseOutput()` 内で自動的にマスキング実行
   - Git URLからトークンを除去(既存の `sanitizeGitUrl` 機能を利用)

2. **metadata.json の保護**
   - `.ai-workflow/` ディレクトリはGitで管理される
   - センシティブ情報(APIキー、トークン等)は含まれない
   - `pr_url`, `pr_number` は公開情報

### 8.3 セキュリティリスクと対策

#### リスク1: コミット失敗時のデータ不整合

**対策**:
- コミット失敗時も警告ログを出力し、ローカル保存は維持
- ユーザーが手動でコミット&プッシュ可能
- `try-catch` で予期しないエラーをキャッチ

#### リスク2: プッシュ失敗時のデータ不整合

**対策**:
- プッシュ失敗時も警告ログを出力し、ローカルコミットは維持
- ユーザーが手動でプッシュ可能
- 既存のリトライロジック(最大3回)を活用

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

#### Git操作のレスポンスタイム

- **目標**: コミット&プッシュは10秒以内に完了
- **対策**:
  - 既存の `commitPhaseOutput()` メソッドを使用(最適化済み)
  - 既存の `pushToRemote()` メソッドを使用(リトライロジック含む)
  - ファイルサイズは小さい(`metadata.json` のみ、数KB程度)

#### メタデータ保存

- **目標**: ファイル書き込みは1秒以内に完了
- **対策**:
  - 既存の `MetadataManager.save()` メソッドを使用
  - 同期的なファイル書き込み(`fs.writeJsonSync`)

#### 既存処理への影響

- **目標**: `init` コマンド全体の実行時間が5秒以上増加しない
- **影響分析**:
  - 追加処理: コミット1回 + プッシュ1回(約3-5秒)
  - 許容範囲内(既存のコミット&プッシュと同じオーダー)

### 9.2 スケーラビリティ

- **影響なし**: 単一リポジトリの単一ブランチに対する操作
- **既存の設計を維持**: マルチリポジトリ対応(v0.2.0で実装済み)

### 9.3 保守性

#### コードの可読性

1. **コメント追加**
   - PR情報のコミット&プッシュ処理にコメントを追加
   - Issue番号を明記(`Issue #253: Fix pr_url persistence`)

2. **ログ出力の強化**
   - コミット成功時: コミットハッシュを出力
   - プッシュ成功時: 成功メッセージを出力
   - 失敗時: 警告メッセージを出力

3. **既存パターンの踏襲**
   - 既存のエラーハンドリングパターンを使用
   - 既存のログ出力パターンを使用

#### テストカバレッジ

- **目標**: 新規追加コードのカバレッジは80%以上を維持
- **対策**:
  - ユニットテスト: PR作成後のコミット&プッシュ処理
  - 統合テスト: エンドツーエンドの動作確認
  - エラーケース: コミット失敗、プッシュ失敗

#### ドキュメント

- **CLAUDE.md の更新** (該当セクションがある場合)
  - バグ修正履歴を記録
  - 修正内容のサマリーを記載

---

## 10. 実装の順序

### Step 1: コード修正 (優先度: 高)

1. **`src/commands/init.ts` の修正**
   - `handleInitCommand()` 関数内にPR情報のコミット&プッシュ処理を追加
   - エラーハンドリングを追加
   - ログ出力を追加

### Step 2: ユニットテスト作成 (優先度: 高)

1. **`tests/unit/commands/init.test.ts` の修正** (存在する場合)
   - PR作成後のコミット&プッシュ処理のテストケースを追加
   - エラーケース(コミット失敗、プッシュ失敗)のテストケースを追加

### Step 3: 統合テスト作成 (優先度: 中)

1. **`tests/integration/init-pr-url.test.ts` の作成**
   - `init` コマンド実行後の `pr_url` 保存確認
   - `execute` コマンドでの `pr_url` 読み込み確認

### Step 4: テスト実行 (優先度: 高)

1. **ユニットテスト実行**
   - `npm run test:unit` で実行
   - すべてのテストがパスすることを確認

2. **統合テスト実行**
   - `npm run test:integration` で実行
   - エンドツーエンドの動作確認

### Step 5: ドキュメント更新 (優先度: 低)

1. **CLAUDE.md の更新** (該当セクションがある場合)
   - バグ修正履歴を記録

### 実装の依存関係

```
Step 1 (コード修正)
    │
    ├──▶ Step 2 (ユニットテスト)
    │
    └──▶ Step 3 (統合テスト)
         │
         └──▶ Step 4 (テスト実行)
              │
              └──▶ Step 5 (ドキュメント)
```

---

## 11. リスクと軽減策

### リスク1: コミット失敗時のデータ不整合

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  - コミット失敗時も警告ログを出力し、ローカル保存は維持
  - ユーザーが手動でコミット&プッシュ可能
  - `try-catch` で予期しないエラーをキャッチ

### リスク2: プッシュ失敗時のデータ不整合

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  - プッシュ失敗時も警告ログを出力し、ローカルコミットは維持
  - ユーザーが手動でプッシュ可能
  - 既存のリトライロジック(最大3回)を活用

### リスク3: 既存テストの破壊

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  - Step 4でユニットテスト・統合テストをすべて実行
  - コミット&プッシュのタイミング変更が既存テストに影響しないことを確認

### リスク4: Jenkins環境での動作確認不足

- **影響度**: 中
- **確率**: 中
- **軽減策**:
  - Step 4でローカル環境とCI環境の両方でテスト実行
  - `init` → `execute` のフル実行でPR URLが正しく保存されることを確認

---

## 12. 品質ゲート確認

以下の品質ゲート(Phase 2必須要件)を満たしていることを確認しました:

- [x] **実装戦略の判断根拠が明記されている** (セクション2: EXTEND)
- [x] **テスト戦略の判断根拠が明記されている** (セクション3: UNIT_INTEGRATION)
- [x] **テストコード戦略の判断根拠が明記されている** (セクション4: BOTH_TEST)
- [x] **既存コードへの影響範囲が分析されている** (セクション5)
- [x] **変更が必要なファイルがリストアップされている** (セクション6)
- [x] **設計が実装可能である** (セクション7: 詳細設計)

---

## 13. 次ステップ

Phase 3(テストシナリオ)に進み、以下を実施してください:

1. **ユニットテストシナリオ作成**: `handleInitCommand()` の処理順序検証、`metadata.json` への `pr_url` 保存検証
2. **統合テストシナリオ作成**: `init` コマンド実行後のリモート `metadata.json` 検証、`execute` コマンドでの `pr_url` 読み込み検証

---

**経過時間**: 設計フェーズ完了
**ステータス**: Phase 2 品質ゲート通過 ✅
