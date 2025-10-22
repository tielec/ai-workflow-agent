# 詳細設計書 - Issue #25: Git Manager の操作別分割

## 0. Planning Document の確認

Planning Phase（`.ai-workflow/issue-25/00_planning/output/planning.md`）において、以下の開発計画が策定されました：

### 実装戦略
- **REFACTOR**: 既存の `git-manager.ts` (548行) を操作種別で分割するリファクタリング
- **ファサードパターン**: 後方互換性100%維持のため、既存のpublicメソッドを専門マネージャーに委譲
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 既存統合テストの継続実行）
- **テストコード戦略**: EXTEND_TEST（既存テスト拡張 + 新規テスト作成）

### 見積もり工数
- **14~22時間**（最小17h、最大27h）
- **リスク評価**: 中（Git操作は開発ワークフローの中核機能であり、不具合が全フェーズに影響）

### 成功基準
1. 各専門マネージャーが200行以下である
2. GitManager ファサードが約150行である（約73%削減）
3. 既存テスト27個が全て通過している（後方互換性100%維持）
4. 統合テスト16個が全て通過している
5. テストカバレッジが80%以上である

---

## 1. アーキテクチャ設計

### 1.1. システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitManager (Facade)                     │
│                        約150行（73%削減）                        │
├─────────────────────────────────────────────────────────────────┤
│  - コンストラクタ: 専門マネージャーをインスタンス化              │
│  - simple-git インスタンスを生成し、各マネージャーに共有         │
│  - MetadataManager, SecretMasker を CommitManager に注入         │
│  - publicメソッドを専門マネージャーに委譲                       │
├─────────────────────────────────────────────────────────────────┤
│  【コミット操作委譲】                                           │
│    commitPhaseOutput()     → CommitManager                      │
│    commitStepOutput()      → CommitManager                      │
│    commitWorkflowInit()    → CommitManager                      │
│    commitCleanupLogs()     → CommitManager                      │
│    createCommitMessage()   → CommitManager                      │
│                                                                 │
│  【ブランチ操作委譲】                                           │
│    createBranch()          → BranchManager                      │
│    branchExists()          → BranchManager                      │
│    getCurrentBranch()      → BranchManager                      │
│    switchBranch()          → BranchManager                      │
│                                                                 │
│  【リモート操作委譲】                                           │
│    pushToRemote()          → RemoteManager                      │
│    pullLatest()            → RemoteManager                      │
│                                                                 │
│  【共通操作】                                                   │
│    getStatus()             → GitManager（ファサード内部実装）   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ CommitManager   │  │ BranchManager   │  │ RemoteManager   │
│   約200行       │  │   約180行       │  │   約150行       │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ コミット操作    │  │ ブランチ操作    │  │ リモート操作    │
│ - 作成          │  │ - 作成          │  │ - push          │
│ - メッセージ生成│  │ - 切り替え      │  │ - pull          │
│ - SecretMasker  │  │ - 存在チェック  │  │ - リトライ      │
│   統合          │  │ - 現在取得      │  │ - GitHub認証    │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ 依存:           │  │ 依存:           │  │ 依存:           │
│ - SimpleGit     │  │ - SimpleGit     │  │ - SimpleGit     │
│ - MetadataMan   │  │                 │  │ - MetadataMan   │
│ - SecretMasker  │  │                 │  │   (branch_name) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   SimpleGit     │
                    │   (shared)      │
                    └─────────────────┘
```

### 1.2. コンポーネント間の関係

**ファサードパターン**:
- GitManager は各専門マネージャーのインスタンスを保持
- `simple-git` インスタンスはコンストラクタで1つ生成し、各マネージャーに共有（依存性注入）
- 既存のpublicメソッドは対応するマネージャーに委譲
- 後方互換性100%維持（呼び出し元は無変更）

**責務分離**:
- **CommitManager**: コミット操作とメッセージ生成の専門家
- **BranchManager**: ブランチライフサイクル管理の専門家
- **RemoteManager**: リモート同期とネットワーク処理の専門家
- **GitManager**: オーケストレーションのみ（ファサード）

**依存性注入**:
- `simple-git` インスタンスは各マネージャーのコンストラクタで受け取る
- `MetadataManager` と `SecretMasker` は CommitManager のみが依存
- 各マネージャーは独立してテスト可能（モック注入が容易）

### 1.3. データフロー

```
【コミット操作フロー】
BasePhase.run()
  → GitManager.commitStepOutput()
    → CommitManager.commitStepOutput()
      → CommitManager.getChangedFiles()
      → CommitManager.filterPhaseFiles()
      → SecretMasker.maskSecretsInWorkflowDir()
      → SimpleGit.add()
      → CommitManager.ensureGitConfig()
      → CommitManager.buildStepCommitMessage()
      → SimpleGit.commit()
    → 戻り値: CommitResult

【ブランチ操作フロー】
InitCommand
  → GitManager.createBranch()
    → BranchManager.branchExists()
    → SimpleGit.checkoutLocalBranch()
    → 戻り値: BranchResult

【リモート操作フロー】
BasePhase.run()
  → GitManager.pushToRemote()
    → RemoteManager.pushToRemote()
      → SimpleGit.status()
      → SimpleGit.push() / SimpleGit.raw(['push', '--set-upstream', ...])
      → RemoteManager.pullLatest() (non-fast-forward時)
      → RemoteManager.isRetriableError() (リトライ判定)
    → 戻り値: PushSummary
```

---

## 2. 実装戦略判断

### 実装戦略: REFACTOR

**判断根拠**:
1. **既存コードの構造改善**: 既存の `git-manager.ts` (548行) を操作種別で分割するリファクタリングであり、新規機能追加は行わない
2. **後方互換性維持**: ファサードパターンにより、既存のpublicメソッドを全て維持し、呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts` 等）は無変更で動作
3. **実績のあるパターン**: Issue #23 (BasePhase: 1420行→676行、52.4%削減) および Issue #24 (GitHubClient: 702行→402行、42.7%削減) において、同様のファサードパターンによるリファクタリングの実績がある
4. **単一責任原則の適用**: Git操作の責務（コミット、ブランチ、リモート）を明確に分離し、各マネージャーを200行以下に整理

**期待される効果**:
- コードの可読性向上（各マネージャーが特定の責務のみを担当）
- 保守性向上（変更時の影響範囲が明確化）
- テスト容易性向上（各マネージャーの独立したテストが可能）

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
1. **ユニットテスト**: 各専門マネージャーの独立した動作を検証
   - コミットメッセージ生成の正確性（各メソッドの正確性）
   - ブランチ操作の正常系・エラー系
   - リモート操作のリトライロジック
   - SecretMasker との統合（モック使用）

2. **統合テスト**: 既存の統合テストが27個のテストケースでGit操作全体を検証済み
   - `tests/unit/git-manager-issue16.test.ts` (27テスト)
   - `tests/integration/workflow-init-cleanup.test.ts` (16テスト)
   - ファサード経由で既存テストがそのまま動作することで、後方互換性を保証

3. **BDDは不要**: Git操作はインフラ層であり、ユーザーストーリーベースのテストは不適切

**期待される効果**:
- 各マネージャーの独立した動作保証
- 後方互換性100%の検証
- リグレッション防止（既存テスト27個の継続実行）

---

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST

**判断根拠**:
1. **既存テスト拡張**: `tests/unit/git-manager-issue16.test.ts` (448行、3つのテストスイート、27テスト) を拡張し、ファサードパターンの動作を検証
   - 既存テスト27個がファサード経由で全て通過することを確認
   - 後方互換性の検証

2. **新規テスト作成**: 各専門マネージャーの単体テストファイルを作成
   - `tests/unit/git/commit-manager.test.ts`
   - `tests/unit/git/branch-manager.test.ts`
   - `tests/unit/git/remote-manager.test.ts`
   - 各マネージャーの独立した動作を検証

3. **統合テスト**: `tests/integration/workflow-init-cleanup.test.ts` (16テスト) はファサード経由で動作するため、変更不要

**期待される効果**:
- 既存テストの継続実行による後方互換性保証
- 新規テストによる各マネージャーの独立した動作保証
- テストカバレッジ80%以上の維持

**テスト構成の選択理由**:
- BOTH_TEST（既存テスト拡張 + 新規テスト作成）が最適だが、既存テストの後方互換性検証が主目的のため、EXTEND_TESTを選択
- 既存テスト27個が全て通過することで、ファサードパターンの正しさを検証

---

## 5. 影響範囲分析

### 5.1. 既存コードへの影響

**変更が必要なファイル**:
- `src/core/git-manager.ts` (548行) → ファサードクラスに縮小（約150行）

**新規作成ファイル**:
- `src/core/git/commit-manager.ts` - コミット操作（約200行）
- `src/core/git/branch-manager.ts` - ブランチ操作（約180行）
- `src/core/git/remote-manager.ts` - リモート操作（約150行）

**変更不要ファイル** (ファサードパターンにより後方互換性維持):
- `src/commands/init.ts` - `GitManager` を使用
- `src/commands/execute.ts` - `GitManager` を使用
- `src/phases/base-phase.ts` - `GitManager` を使用
- `src/phases/core/review-cycle-manager.ts` - `GitManager` を使用

### 5.2. 依存関係の変更

**新規依存**:
- なし（既存の `simple-git`, `fs-extra`, `minimatch` を継続使用）

**既存依存の変更**:
- なし（`simple-git` のバージョン変更なし）

**依存性注入の追加**:
- `simple-git` インスタンスを各マネージャーのコンストラクタで受け取る
- `MetadataManager` と `SecretMasker` を CommitManager のコンストラクタで受け取る

### 5.3. マイグレーション要否

**不要** - ファサードパターンにより既存のAPIを100%維持するため、マイグレーション不要

**既存の呼び出し元は無変更で動作**:
```typescript
// 既存の呼び出し (変更不要)
const gitManager = new GitManager(repoPath, metadataManager);
await gitManager.commitPhaseOutput('requirements', 'completed', 'PASS');
await gitManager.pushToRemote();

// ファサード内部で各マネージャーに委譲されるが、呼び出し側は意識不要
```

---

## 6. 変更・追加ファイルリスト

### 6.1. 新規作成ファイル

**専門マネージャー**:
- `src/core/git/commit-manager.ts` (約200行)
  - コミット操作（commitPhaseOutput, commitStepOutput, commitWorkflowInit, commitCleanupLogs）
  - コミットメッセージ生成（createCommitMessage, buildStepCommitMessage, createInitCommitMessage, createCleanupCommitMessage）
  - ファイル操作ヘルパー（getChangedFiles, filterPhaseFiles, getPhaseSpecificFiles, scanDirectories, scanByPatterns）
  - Git設定管理（ensureGitConfig）
  - SecretMasker 統合

- `src/core/git/branch-manager.ts` (約180行)
  - ブランチ操作（createBranch, branchExists, getCurrentBranch, switchBranch）
  - ローカル/リモートブランチの存在チェック
  - エラーハンドリング

- `src/core/git/remote-manager.ts` (約150行)
  - リモート操作（pushToRemote, pullLatest）
  - リトライロジック（isRetriableError）
  - GitHub認証設定（setupGithubCredentials）
  - non-fast-forwardエラー時の自動pullとリトライ

**ユニットテスト**:
- `tests/unit/git/commit-manager.test.ts` (新規作成)
- `tests/unit/git/branch-manager.test.ts` (新規作成)
- `tests/unit/git/remote-manager.test.ts` (新規作成)

### 6.2. 修正が必要な既存ファイル

**コアファイル**:
- `src/core/git-manager.ts` (548行 → 約150行)
  - ファサードクラスに縮小
  - コンストラクタで各専門マネージャーをインスタンス化
  - publicメソッドを専門マネージャーに委譲
  - インターフェース型（CommitResult, PushSummary, BranchResult, StatusSummary）の維持

**テストファイル**:
- `tests/unit/git-manager-issue16.test.ts` (既存テストの継続実行)
- `tests/integration/workflow-init-cleanup.test.ts` (既存テストの継続実行)

### 6.3. 削除が必要なファイル

**なし** - ファサードパターンにより既存ファイルを維持

---

## 7. 詳細設計

### 7.1. GitManager ファサードクラス設計

**ファイル**: `src/core/git-manager.ts` (約150行)

**責務**: 専門マネージャーのオーケストレーション

**クラス設計**:
```typescript
export class GitManager {
  private readonly repoPath: string;
  private readonly metadata: MetadataManager;
  private readonly config: Record<string, unknown>;
  private readonly git: SimpleGit;
  private readonly commitManager: CommitManager;
  private readonly branchManager: BranchManager;
  private readonly remoteManager: RemoteManager;

  constructor(
    repoPath: string,
    metadataManager: MetadataManager,
    config: Record<string, unknown> = {},
  ) {
    this.repoPath = repoPath;
    this.metadata = metadataManager;
    this.config = config;

    // simple-git インスタンスを生成（共有）
    this.git = simpleGit({ baseDir: repoPath });

    // 各専門マネージャーをインスタンス化（依存性注入）
    const secretMasker = new SecretMasker();
    this.commitManager = new CommitManager(
      this.git,
      metadataManager,
      secretMasker,
      repoPath,
    );
    this.branchManager = new BranchManager(this.git);
    this.remoteManager = new RemoteManager(this.git, metadataManager);
  }

  // コミット操作の委譲
  public async commitPhaseOutput(...): Promise<CommitResult> {
    return this.commitManager.commitPhaseOutput(...);
  }

  public async commitStepOutput(...): Promise<CommitResult> {
    return this.commitManager.commitStepOutput(...);
  }

  public async commitWorkflowInit(...): Promise<CommitResult> {
    return this.commitManager.commitWorkflowInit(...);
  }

  public async commitCleanupLogs(...): Promise<CommitResult> {
    return this.commitManager.commitCleanupLogs(...);
  }

  public createCommitMessage(...): string {
    return this.commitManager.createCommitMessage(...);
  }

  // ブランチ操作の委譲
  public async createBranch(...): Promise<BranchResult> {
    return this.branchManager.createBranch(...);
  }

  public async branchExists(...): Promise<boolean> {
    return this.branchManager.branchExists(...);
  }

  public async getCurrentBranch(): Promise<string> {
    return this.branchManager.getCurrentBranch();
  }

  public async switchBranch(...): Promise<BranchResult> {
    return this.branchManager.switchBranch(...);
  }

  // リモート操作の委譲
  public async pushToRemote(...): Promise<PushSummary> {
    return this.remoteManager.pushToRemote(...);
  }

  public async pullLatest(...): Promise<{ success: boolean; error?: string | null }> {
    return this.remoteManager.pullLatest(...);
  }

  // 共通操作（ファサード内部実装）
  public async getStatus(): Promise<StatusSummary> {
    const status = await this.git.status();
    return {
      branch: status.current ?? 'HEAD',
      is_dirty: status.files.length > 0,
      untracked_files: status.not_added,
      modified_files: status.modified,
    };
  }
}
```

**インターフェース型の維持**:
```typescript
// 既存のインターフェース型を維持（後方互換性）
interface CommitResult {
  success: boolean;
  commit_hash: string | null;
  files_committed: string[];
  error?: string | null;
}

interface PushSummary {
  success: boolean;
  retries: number;
  error?: string;
}

interface BranchResult {
  success: boolean;
  branch_name: string;
  error?: string | null;
}

interface StatusSummary {
  branch: string;
  is_dirty: boolean;
  untracked_files: string[];
  modified_files: string[];
}
```

### 7.2. CommitManager 設計

**ファイル**: `src/core/git/commit-manager.ts` (約200行)

**責務**: コミット操作とメッセージ生成

**クラス設計**:
```typescript
export class CommitManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;
  private readonly secretMasker: SecretMasker;
  private readonly repoPath: string;

  constructor(
    git: SimpleGit,
    metadataManager: MetadataManager,
    secretMasker: SecretMasker,
    repoPath: string,
  ) {
    this.git = git;
    this.metadata = metadataManager;
    this.secretMasker = secretMasker;
    this.repoPath = repoPath;
  }

  // コミット操作
  public async commitPhaseOutput(...): Promise<CommitResult>
  public async commitStepOutput(...): Promise<CommitResult>
  public async commitWorkflowInit(...): Promise<CommitResult>
  public async commitCleanupLogs(...): Promise<CommitResult>

  // コミットメッセージ生成
  public createCommitMessage(...): string
  private buildStepCommitMessage(...): string
  private createInitCommitMessage(...): string
  private createCleanupCommitMessage(...): string

  // ファイル操作ヘルパー
  private async getChangedFiles(): Promise<string[]>
  private filterPhaseFiles(...): string[]
  private async getPhaseSpecificFiles(...): Promise<string[]>
  private async scanDirectories(...): Promise<string[]>
  private async scanByPatterns(...): Promise<string[]>

  // Git設定管理
  private async ensureGitConfig(): Promise<void>
}
```

**主要メソッド**:

1. **commitPhaseOutput**:
   - Phase完了時のコミット作成
   - 変更ファイルの自動検出とフィルタリング
   - SecretMasker との統合（Issue #12対応）
   - コミットメッセージ生成（createCommitMessage の呼び出し）

2. **commitStepOutput**:
   - ステップ単位のコミット作成（Issue #10対応）
   - ステップ用コミットメッセージ生成（buildStepCommitMessage の呼び出し）

3. **commitWorkflowInit**:
   - ワークフロー初期化用のコミット作成（Issue #16対応）
   - 初期化用コミットメッセージ生成（createInitCommitMessage の呼び出し）

4. **commitCleanupLogs**:
   - ログクリーンアップ用のコミット作成（Issue #16対応）
   - クリーンアップ用コミットメッセージ生成（createCleanupCommitMessage の呼び出し）

5. **createCommitMessage**:
   - Phase完了時のコミットメッセージ生成
   - Issue番号、Phase番号、ステータス、レビュー結果を含む

6. **getChangedFiles**:
   - Git statusから変更ファイルを取得
   - `@tmp` ファイルを除外

7. **filterPhaseFiles**:
   - Issue番号に基づいてファイルをフィルタリング
   - `.ai-workflow/issue-{issue_number}/` 配下のファイルを対象

8. **ensureGitConfig**:
   - user.name/user.email の自動設定
   - 環境変数（GIT_COMMIT_USER_NAME, GIT_COMMIT_USER_EMAIL）からフォールバック

**SecretMasker 統合**:
```typescript
// コミット前に機密情報をマスキング
const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
if (maskingResult.filesProcessed > 0) {
  console.info(`[INFO] Masked ${maskingResult.secretsMasked} secret(s)`);
}
```

### 7.3. BranchManager 設計

**ファイル**: `src/core/git/branch-manager.ts` (約180行)

**責務**: ブランチライフサイクル管理

**クラス設計**:
```typescript
export class BranchManager {
  private readonly git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  // ブランチ操作
  public async createBranch(branchName: string, baseBranch?: string): Promise<BranchResult>
  public async branchExists(branchName: string, checkRemote = true): Promise<boolean>
  public async getCurrentBranch(): Promise<string>
  public async switchBranch(branchName: string): Promise<BranchResult>
}
```

**主要メソッド**:

1. **createBranch**:
   - ブランチ作成（checkoutLocalBranch）
   - ベースブランチからの分岐サポート
   - 既存ブランチチェック（branchExists の呼び出し）

2. **branchExists**:
   - ローカルブランチの存在チェック（branchLocal）
   - リモートブランチの存在チェック（branch(['--remotes', ...])）

3. **getCurrentBranch**:
   - 現在のブランチ名取得（rev-parse --abbrev-ref HEAD）

4. **switchBranch**:
   - ブランチ切り替え（checkout）

**エラーハンドリング**:
```typescript
// ブランチが既に存在する場合
if (await this.branchExists(branchName)) {
  return {
    success: false,
    branch_name: branchName,
    error: `Branch ${branchName} already exists`,
  };
}

// Git操作失敗時
try {
  await this.git.checkout(branchName);
  return { success: true, branch_name: branchName };
} catch (error) {
  return {
    success: false,
    branch_name: branchName,
    error: `Git command failed: ${(error as Error).message}`,
  };
}
```

### 7.4. RemoteManager 設計

**ファイル**: `src/core/git/remote-manager.ts` (約150行)

**責務**: リモート同期とネットワーク処理

**クラス設計**:
```typescript
export class RemoteManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;

  constructor(git: SimpleGit, metadataManager: MetadataManager) {
    this.git = git;
    this.metadata = metadataManager;

    // Fire and forget setup of credentials (best-effort).
    this.setupGithubCredentials().catch((error) => {
      console.warn(`[WARN] Failed to set up GitHub credentials: ${error.message}`);
    });
  }

  // リモート操作
  public async pushToRemote(maxRetries = 3, retryDelay = 2000): Promise<PushSummary>
  public async pullLatest(branchName?: string): Promise<{ success: boolean; error?: string | null }>

  // リトライロジック
  private isRetriableError(error: unknown): boolean

  // GitHub認証設定
  private async setupGithubCredentials(): Promise<void>
}
```

**主要メソッド**:

1. **pushToRemote**:
   - upstream設定（--set-upstream フラグ）
   - non-fast-forwardエラー時の自動pullとリトライ
   - リトライロジック（最大3回、デフォルト2秒間隔）
   - リトライ可能エラーの判定（isRetriableError の呼び出し）

2. **pullLatest**:
   - リモートブランチからのpull（--no-rebase 戦略）
   - divergent branches対応

3. **isRetriableError**:
   - 再試行不可エラーの判定（認証失敗、権限エラー等）
   - 再試行可能エラーの判定（タイムアウト、接続エラー等）

4. **setupGithubCredentials**:
   - HTTPS URLへのGITHUB_TOKENの埋め込み
   - SSH URLのスキップ（HTTPSのみ対応）

**リトライロジック**:
```typescript
public async pushToRemote(maxRetries = 3, retryDelay = 2000): Promise<PushSummary> {
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      // Push処理
      const result = await this.git.push('origin', branchName);
      return { success: true, retries };
    } catch (error) {
      // non-fast-forwardエラーの場合、pullしてから再試行
      if (errorMessage.includes('rejected') || errorMessage.includes('non-fast-forward')) {
        await this.pullLatest(branchName);
        retries += 1;
        continue;
      }

      // リトライ可能エラーの判定
      if (!this.isRetriableError(error) || retries === maxRetries) {
        return { success: false, retries, error: error.message };
      }

      retries += 1;
      await delay(retryDelay);
    }
  }
}

private isRetriableError(error: unknown): boolean {
  const message = (error as Error).message.toLowerCase();

  // 再試行不可エラー
  const nonRetriableKeywords = [
    'permission denied',
    'authentication failed',
    'could not read from remote repository',
  ];
  if (nonRetriableKeywords.some(k => message.includes(k))) {
    return false;
  }

  // 再試行可能エラー
  const retriableKeywords = [
    'timeout',
    'connection refused',
    'network is unreachable',
  ];
  return retriableKeywords.some(k => message.includes(k));
}
```

### 7.5. データ構造設計

**インターフェース型**（既存と同じ）:
```typescript
// src/core/git-manager.ts（ファサード）で定義
interface CommitResult {
  success: boolean;
  commit_hash: string | null;
  files_committed: string[];
  error?: string | null;
}

interface PushSummary {
  success: boolean;
  retries: number;
  error?: string;
}

interface BranchResult {
  success: boolean;
  branch_name: string;
  error?: string | null;
}

interface StatusSummary {
  branch: string;
  is_dirty: boolean;
  untracked_files: string[];
  modified_files: string[];
}
```

**各マネージャーでの使用**:
- CommitManager: `CommitResult` を返す
- BranchManager: `BranchResult` を返す
- RemoteManager: `PushSummary` を返す

---

## 8. セキュリティ考慮事項

### 8.1. SecretMasker 統合（Issue #12）

**対象**: CommitManager

**実装**:
```typescript
// コミット前に機密情報をマスキング
const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
try {
  const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
  if (maskingResult.filesProcessed > 0) {
    console.info(`[INFO] Masked ${maskingResult.secretsMasked} secret(s)`);
  }
} catch (error) {
  console.error(`[ERROR] Secret masking failed: ${error.message}`);
  // Continue with commit (don't block)
}
```

**セキュリティポリシー**:
- コミット前に必ず実行
- マスキング失敗時もコミットは継続（ベストエフォート）
- エラーログを出力して管理者に通知

### 8.2. GitHub認証情報管理

**対象**: RemoteManager

**実装**:
```typescript
private async setupGithubCredentials(): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return; // トークンがない場合はスキップ
  }

  const currentUrl = await this.git.remote(['get-url', 'origin']);
  if (!currentUrl.startsWith('https://github.com/')) {
    console.info('[INFO] Git remote URL is not HTTPS, skipping token configuration');
    return; // HTTPSでない場合はスキップ
  }

  const path = currentUrl.replace('https://github.com/', '');
  const newUrl = `https://${githubToken}@github.com/${path}`;
  await this.git.remote(['set-url', 'origin', newUrl]);
}
```

**セキュリティポリシー**:
- GITHUB_TOKEN は環境変数から取得（ハードコード禁止）
- HTTPS URLのみ対応（SSH URLはスキップ）
- ベストエフォート実行（失敗時もワークフロー継続）

### 8.3. エラーメッセージのサニタイゼーション

**対象**: 全マネージャー

**実装**:
```typescript
// エラーメッセージに機密情報が含まれないように注意
try {
  await this.git.push('origin', branchName);
} catch (error) {
  // トークン等の機密情報がエラーメッセージに含まれる可能性
  const sanitizedMessage = error.message.replace(/https:\/\/.*@github\.com/, 'https://***@github.com');
  console.error(`[ERROR] Push failed: ${sanitizedMessage}`);
}
```

---

## 9. 非機能要件への対応

### 9.1. パフォーマンス

**要件**:
- NFR-1.1: Git操作のレスポンス時間は、リファクタリング前後で5%以内の差に収める
- NFR-1.2: `simple-git` インスタンスの共有により、初期化オーバーヘッドを最小化する
- NFR-1.3: ファサードパターンの委譲オーバーヘッドは1ms未満とする

**対応**:
1. **simple-git インスタンスの共有**:
   - GitManager のコンストラクタで1つ生成し、各マネージャーに依存性注入
   - 初期化オーバーヘッドを1回のみに削減

2. **ファサード委譲のオーバーヘッド**:
   - 単純なメソッド委譲のみ（追加処理なし）
   - オーバーヘッドは関数呼び出しのみ（1ms未満）

3. **ファイル操作の最適化**:
   - `getChangedFiles` は1回のみ実行し、結果をキャッシュ
   - `filterPhaseFiles` はO(n)の線形処理（n = ファイル数）

### 9.2. セキュリティ

**要件**:
- NFR-2.1: SecretMasker 統合により、コミット前に機密情報を自動マスキングする
- NFR-2.2: GITHUB_TOKEN は環境変数から取得し、コード内にハードコードしない
- NFR-2.3: setupGithubCredentials() はベストエフォートで実行し、失敗時もワークフローを継続する

**対応**:
- セクション8（セキュリティ考慮事項）で詳述

### 9.3. 可用性・信頼性

**要件**:
- NFR-3.1: リトライロジックにより、一時的なネットワークエラーに対応する（最大3回）
- NFR-3.2: non-fast-forwardエラー時の自動pullとリトライにより、並行開発環境での衝突を解決する
- NFR-3.3: Git操作失敗時は詳細なエラーメッセージをログに出力し、デバッグを容易にする

**対応**:
1. **リトライロジック** (RemoteManager.pushToRemote):
   - 最大3回までリトライ
   - デフォルト2秒間隔（retryDelay パラメータで調整可能）
   - リトライ可能エラーの判定（isRetriableError）

2. **non-fast-forwardエラー対応**:
   - 自動的にpullを実行し、再度pushを試行
   - 並行開発環境での衝突を自動解決

3. **詳細なエラーログ**:
   - エラーメッセージにマネージャー名を含める（例: `[CommitManager] Commit failed`）
   - エラー原因を明示的に表示

### 9.4. 保守性・拡張性

**要件**:
- NFR-4.1: 各専門マネージャーは200行以下とする（単一責任原則）
- NFR-4.2: 各専門マネージャーは独立してテスト可能な設計とする
- NFR-4.3: ファサードパターンにより、将来的な拡張時も既存コードの変更を最小化する
- NFR-4.4: 依存性注入パターンにより、テスト時のモック化を容易にする

**対応**:
1. **単一責任原則**:
   - CommitManager: 約200行（コミット操作のみ）
   - BranchManager: 約180行（ブランチ操作のみ）
   - RemoteManager: 約150行（リモート操作のみ）
   - GitManager: 約150行（オーケストレーションのみ）

2. **独立したテスト可能性**:
   - 各マネージャーは simple-git インスタンスを依存性注入で受け取る
   - テスト時はモック simple-git を注入可能

3. **ファサードパターン**:
   - 既存のpublicメソッドを100%維持
   - 将来的な拡張時も既存の呼び出し元は無変更

4. **依存性注入パターン**:
   - コンストラクタで依存関係を明示化
   - テスト時のモック化が容易

---

## 10. 実装の順序

### 10.1. 実装順序の推奨

**Phase 1: 専門マネージャーの実装**（並行可能）
1. **CommitManager の実装** (1.5~2h)
   - `src/core/git/commit-manager.ts` 作成
   - コミット操作の移行
   - コミットメッセージ生成の移行
   - SecretMasker との統合

2. **BranchManager の実装** (1~1.5h)
   - `src/core/git/branch-manager.ts` 作成
   - ブランチ操作の移行

3. **RemoteManager の実装** (1~1.5h)
   - `src/core/git/remote-manager.ts` 作成
   - リモート操作の移行
   - リトライロジックの移行

**Phase 2: ファサードの実装**（Phase 1完了後）
4. **GitManager ファサードの実装** (0.5~1h)
   - `src/core/git-manager.ts` をファサードクラスに縮小
   - コンストラクタで各専門マネージャーをインスタンス化
   - publicメソッドを専門マネージャーに委譲

**Phase 3: テストコードの実装**（Phase 2完了後）
5. **各マネージャーのユニットテスト作成** (2~3h)
   - `tests/unit/git/commit-manager.test.ts` 作成
   - `tests/unit/git/branch-manager.test.ts` 作成
   - `tests/unit/git/remote-manager.test.ts` 作成

6. **既存テストの後方互換性確認** (1~1.5h)
   - `tests/unit/git-manager-issue16.test.ts` の実行（27テスト）
   - `tests/integration/workflow-init-cleanup.test.ts` の実行（16テスト）

### 10.2. 依存関係の考慮

**依存関係グラフ**:
```
Phase 1: 専門マネージャーの実装
  ├─ CommitManager (並行可能)
  ├─ BranchManager (並行可能)
  └─ RemoteManager (並行可能)
        │
        ▼
Phase 2: ファサードの実装
  └─ GitManager ファサード (Phase 1完了後)
        │
        ▼
Phase 3: テストコードの実装
  ├─ ユニットテスト作成 (Phase 2完了後)
  └─ 後方互換性確認 (Phase 2完了後)
```

**クリティカルパス**:
1. CommitManager の実装（最も複雑で行数が多い）
2. GitManager ファサードの実装（CommitManager, BranchManager, RemoteManager完了後）
3. 既存テストの後方互換性確認（全27テストが通過する必要がある）

---

## 11. テストシナリオ概要

### 11.1. CommitManager のテストシナリオ

**ファイル**: `tests/unit/git/commit-manager.test.ts`

**テストケース**:
1. **コミットメッセージ生成の正確性**:
   - `createCommitMessage`: Phase番号、Issue番号、ステータス、レビュー結果を含む
   - `buildStepCommitMessage`: ステップ情報を含む
   - `createInitCommitMessage`: 初期化用メッセージ
   - `createCleanupCommitMessage`: クリーンアップ用メッセージ（Phase番号の正確性）

2. **SecretMasker 統合**:
   - マスキング成功時の動作
   - マスキング失敗時も継続動作

3. **ファイルなし時の警告ログ**:
   - 成功として扱われることを確認

4. **Git操作失敗時のエラーハンドリング**:
   - エラーメッセージを含む CommitResult が返される

### 11.2. BranchManager のテストシナリオ

**ファイル**: `tests/unit/git/branch-manager.test.ts`

**テストケース**:
1. **ブランチ作成**:
   - 正常系（新規ブランチ）
   - エラー系（既存ブランチ）

2. **ブランチ存在チェック**:
   - ローカルブランチ
   - リモートブランチ

3. **ブランチ切り替え**:
   - 正常系
   - エラー系（存在しないブランチ）

### 11.3. RemoteManager のテストシナリオ

**ファイル**: `tests/unit/git/remote-manager.test.ts`

**テストケース**:
1. **Push操作**:
   - upstream設定
   - リトライロジック
   - non-fast-forward時の自動pullとリトライ

2. **Pull操作**:
   - 正常系
   - エラー系

3. **GitHub認証設定**:
   - HTTPSのみ対応
   - SSHはスキップ

### 11.4. 後方互換性テストシナリオ

**ファイル**: 既存テストの継続実行

**テストケース**:
1. **ユニットテスト** (`tests/unit/git-manager-issue16.test.ts`):
   - 全27テストが通過することを確認
   - ファサード経由で既存テストが動作

2. **統合テスト** (`tests/integration/workflow-init-cleanup.test.ts`):
   - 全16テストが通過することを確認
   - マルチリポジトリワークフローが正常動作

---

## 12. リスクと軽減策

### Risk-1: simple-gitインスタンス共有の複雑性

**影響度**: 中
**確率**: 中

**軽減策**:
- Issue #24 (GitHubClient) でOctokitインスタンスを依存性注入により共有した実績を適用
- 各専門マネージャーのコンストラクタで `simple-git` インスタンスを受け取る設計
- ファサードで1つの `simple-git` インスタンスを生成し、各専門マネージャーに渡す
- 既存テストで動作確認（`git-manager-issue16.test.ts`、27テスト）

### Risk-2: 既存テストの後方互換性維持

**影響度**: 高（テストが失敗するとリリースできない）
**確率**: 低（ファサードパターンで既存APIを100%維持）

**軽減策**:
- ファサードクラスで既存のpublicメソッドを100%維持
- 既存の統合テスト（27テスト）をリグレッションテストとして活用
- Phase 5 Task 5-4 で既存テスト全体を実行して確認

### Risk-3: Git操作エラーのデバッグ困難化

**影響度**: 中
**確率**: 低

**軽減策**:
- 各専門マネージャーで詳細なログ出力（`console.info`, `console.warn`, `console.error`）
- エラーメッセージにマネージャー名を含める（例: `[CommitManager] Commit failed`）
- 既存のエラーハンドリングロジックをそのまま移行

### Risk-4: MetadataManager と SecretMasker の依存関係

**影響度**: 中
**確率**: 低

**軽減策**:
- CommitManager のみが MetadataManager と SecretMasker に依存する設計
- コンストラクタ注入により依存関係を明示化
- 既存のコードをそのまま移行し、動作を変更しない

---

## 13. 品質ゲート（Phase 2）

設計書は以下の品質ゲートを満たす必要があります：

- [x] **実装戦略（REFACTOR）が明確に決定されている**
- [x] **テスト戦略（UNIT_INTEGRATION）が明確に決定されている**
- [x] **テストコード戦略（EXTEND_TEST）が明確に決定されている**
- [x] **既存コードへの影響範囲が分析されている**
- [x] **変更が必要なファイルがリストアップされている**
- [x] **設計が実装可能である**

---

## 14. 成功基準（Planning Documentから引用）

### 必須要件
1. ✅ 各専門マネージャーが200行以下である
   - CommitManager: 約200行
   - BranchManager: 約180行
   - RemoteManager: 約150行

2. ✅ GitManager ファサードが約150行である（約73%削減）
   - 548行 → 約150行（約73%削減）

3. ✅ 既存テスト27個が全て通過している（後方互換性100%維持）
   - `tests/unit/git-manager-issue16.test.ts` (27テスト)

4. ✅ 統合テスト16個が全て通過している
   - `tests/integration/workflow-init-cleanup.test.ts` (16テスト)

5. ✅ テストカバレッジが80%以上である
   - 各マネージャーのユニットテスト作成
   - 既存テストの継続実行

### 推奨要件
1. ✅ CLAUDE.md と ARCHITECTURE.md が更新されている
2. ✅ PR ボディに Before/After 比較が含まれている
3. ✅ コミットメッセージが明確である（例: `[refactor] Split GitManager into specialized managers (Issue #25)`）

---

## 15. 参考情報

### 15.1. 類似リファクタリング実績

**Issue #23 (BasePhase リファクタリング)**:
- Before: 1420行
- After: 676行（約52.4%削減）
- 分離モジュール:
  - `AgentExecutor` (約270行)
  - `ReviewCycleManager` (約130行)
  - `ProgressFormatter` (約150行)
  - `LogFormatter` (約400行)

**Issue #24 (GitHubClient リファクタリング)**:
- Before: 702行
- After: 402行（約42.7%削減）
- 分離モジュール:
  - `IssueClient` (約238行)
  - `PullRequestClient` (約231行)
  - `CommentClient` (約145行)
  - `ReviewClient` (約75行)

### 15.2. 設計パターン

**ファサードパターン**:
- 既存のpublicメソッドを100%維持
- 各専門マネージャーのインスタンスを保持
- publicメソッドを専門マネージャーに委譲
- Octokitインスタンス（simple-gitインスタンス）はコンストラクタ注入で共有

**依存性注入パターン**:
- simple-gitインスタンスは各専門マネージャーで共有
- MetadataManager, SecretMasker は CommitManager のみが依存
- コンストラクタで依存関係を明示化

---

**作成日**: 2025-01-20
**Issue**: #25
**バージョン**: 1.0
**ステータス**: Draft
