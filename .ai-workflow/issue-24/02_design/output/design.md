# 詳細設計書 - Issue #24: GitHub Client の機能別分割

**作成日**: 2025-01-21
**Issue番号**: #24
**実装戦略**: REFACTOR
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: CREATE_TEST
**見積もり工数**: 12~16時間

---

## 0. Planning Document と Requirements の確認

Planning Phase（Phase 0）と Requirements Phase（Phase 1）で策定された計画・要件を確認しました。本設計書は、以下に基づいて作成します：

### 開発計画の概要（Planning Phase）

- **実装戦略**: REFACTOR（既存コードの構造改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **複雑度**: 中程度
- **リスク評価**: 中（Octokitインスタンス共有、privateメソッド配置先）

### 要件定義の概要（Requirements Phase）

要件定義書では以下が明確化されています：

1. **機能要件**:
   - FR-001: IssueClient の作成（200行以下）
   - FR-002: PullRequestClient の作成（200行以下）
   - FR-003: CommentClient の作成（150行以下）
   - FR-004: ReviewClient の作成（180行以下）
   - FR-005: ファサードパターンによる統合
   - FR-006: 依存性注入パターンの実装
   - FR-007: エラーハンドリングの統一
   - FR-008: ドキュメント関連メソッドの配置

2. **非機能要件**:
   - NFR-001: API呼び出し回数の維持
   - NFR-002: レスポンスタイムの維持（±10%以内）
   - NFR-005: 後方互換性の保証（100%）
   - NFR-006: テストカバレッジ（80%以上）
   - NFR-007: コードの可読性（各モジュール200行以下）

---

## 1. 実装戦略判断

### 実装戦略: REFACTOR

**判断根拠**:

既存の `github-client.ts`（702行）を機能別に分割し、ファサードパターンで統合するリファクタリング作業です。

1. **既存コードの構造改善が主目的**
   - 現在の `github-client.ts` は複数の責務（Issue操作、PR操作、コメント操作、レビュー操作、ドキュメント抽出）を担っており、単一責任原則（SRP）に違反
   - 702行のモノリシックな構造を、機能別に分割することで可読性と保守性を向上
   - 新機能の追加ではなく、既存機能の再構成

2. **ファサードパターンによる後方互換性の維持**
   - 既存の `GitHubClient` のpublicメソッドシグネチャは一切変更しない
   - 既存の呼び出し元（`src/commands/init.ts`, `src/commands/execute.ts`, `src/phases/base-phase.ts`）は無変更で動作
   - 戻り値の型（`PullRequestResult`, `IssueCreationResult`, `GenericResult`, `ProgressCommentResult`, `PullRequestSummary`）も維持

3. **内部実装の改善のみ**
   - 外部APIは変更せず、内部実装のみを改善
   - 各クライアントを独立したモジュールとして切り出し、テスト容易性を向上

**実装アプローチ**:
- **CREATE**: 新規モジュール（`issue-client.ts`, `pull-request-client.ts`, `comment-client.ts`, `review-client.ts`）を作成
- **EXTEND**: なし（既存機能の拡張はしない）
- **REFACTOR**: 既存メソッドを機能別に分割・再配置し、ファサードで統合

---

## 2. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

1. **ユニットテストが必要な理由**
   - 各クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）の独立した動作を検証
   - Octokitのモック化により、GitHub API依存を排除した高速テストを実現
   - エラーハンドリング（401/403/422エラー、RequestError）の境界値テストが必要
   - 各クライアントが単一の責務を持つため、ユニットテストで十分にカバレッジを確保可能

2. **統合テストが必要な理由**
   - ファサードパターンによる統合動作を検証（既存APIとの互換性）
   - 既存の呼び出し箇所（`init.ts`, `execute.ts`, `base-phase.ts`）との互換性テスト
   - Octokitインスタンス共有の正常性確認（コンストラクタ注入が正しく機能するか）
   - GitHubClient のpublicメソッドが各クライアントに正しく委譲されているか検証

3. **BDDテストが不要な理由**
   - 本Issueはユーザーストーリーよりも内部リファクタリングが中心
   - エンドユーザー向けの振る舞いは変わらない（既存機能の再構成のみ）
   - ビジネスロジックの変更ではなく、技術的な構造改善

**テスト構成**:
- **UNIT**: 各クライアントの独立したテスト（約70%のカバレッジ）
- **INTEGRATION**: ファサードパターンと既存呼び出し元との統合テスト（約15%のカバレッジ）
- **合計目標カバレッジ**: 85%以上

---

## 3. テストコード戦略判断

### テストコード戦略: CREATE_TEST

**判断根拠**:

1. **既存テストが存在しない**
   - 既存の `github-client.ts` に対するテストコードが存在しない（Glob検索で `**/github*.test.ts` の結果が空）
   - 新規モジュール（`issue-client.ts`, `pull-request-client.ts`, `comment-client.ts`, `review-client.ts`）に対応する新規テストファイルを作成する必要がある

2. **新規テストファイル構成**
   - `tests/unit/github/issue-client.test.ts`
   - `tests/unit/github/pull-request-client.test.ts`
   - `tests/unit/github/comment-client.test.ts`
   - `tests/unit/github/review-client.test.ts`
   - `tests/integration/github-client-facade.test.ts`

3. **既存テストの拡張は不要**
   - 既存のGitHub関連テストがないため、EXTEND_TESTは該当しない
   - 統合テストは新規作成

**テスト実装方針**:
- Jest を使用（プロジェクト標準）
- Octokitのモック化により、GitHub API呼び出しを排除
- エラーケースの境界値テスト（401/403/422/RequestError）を含む
- 既存の呼び出し元との統合テストで後方互換性を検証

---

## 4. アーキテクチャ設計

### 4.1 システム全体図

```
┌─────────────────────────────────────────────────────────┐
│                 Existing Callers                        │
│  - src/commands/init.ts                                 │
│  - src/commands/execute.ts                              │
│  - src/phases/base-phase.ts                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ (既存APIを維持)
                     ▼
┌─────────────────────────────────────────────────────────┐
│            GitHubClient (Facade)                        │
│  - src/core/github-client.ts (約150行)                 │
│                                                          │
│  Public Methods:                                        │
│  - getIssue()          → IssueClient に委譲            │
│  - postComment()       → IssueClient に委譲            │
│  - createPullRequest() → PullRequestClient に委譲      │
│  - postWorkflowProgress() → CommentClient に委譲       │
│  - postReviewResult()  → ReviewClient に委譲           │
│  - etc.                                                 │
│                                                          │
│  Private Fields:                                        │
│  - issueClient: IssueClient                             │
│  - pullRequestClient: PullRequestClient                 │
│  - commentClient: CommentClient                         │
│  - reviewClient: ReviewClient                           │
│  - octokit: Octokit (各クライアントに注入)             │
│                                                          │
│  Document Extraction Methods (Private):                │
│  - extractPhaseOutputs()                                │
│  - generatePrBodyTemplate()                             │
│  - generatePrBodyDetailed()                             │
│  - extractSectionFromFile()                             │
│  - extractSectionWithCandidates()                       │
│  - extractSection()                                     │
│  - extractSummaryFromIssue()                            │
└────────────┬──────────┬──────────┬──────────┬───────────┘
             │          │          │          │
             │          │          │          │
    ┌────────▼─┐  ┌────▼─────┐  ┌▼────────┐ ┌▼──────────┐
    │ Issue    │  │ Pull     │  │ Comment │ │ Review    │
    │ Client   │  │ Request  │  │ Client  │ │ Client    │
    │          │  │ Client   │  │         │ │           │
    │ (~180行) │  │ (~200行) │  │ (~150行)│ │ (~180行)  │
    └──────────┘  └──────────┘  └─────────┘ └───────────┘
         │              │              │          │
         │              │              │          │
         └──────────────┴──────────────┴──────────┘
                        │
                        ▼
                  ┌───────────┐
                  │  Octokit  │
                  │ (GitHub   │
                  │  REST     │
                  │  API)     │
                  └───────────┘
```

### 4.2 コンポーネント間の関係

**依存関係**:
- **GitHubClient (Facade)**: 各専門クライアントに依存
- **各専門クライアント**: Octokit に依存
- **Octokit**: GitHub REST API に依存

**データフロー**:
1. 呼び出し元が `GitHubClient` の公開メソッドを呼び出す
2. `GitHubClient` が対応する専門クライアントのメソッドに委譲
3. 専門クライアントが Octokit を使用して GitHub API を呼び出す
4. レスポンスを Result型（`PullRequestResult`, `IssueCreationResult` 等）で返す

**Octokitインスタンスの共有**:
- `GitHubClient` のコンストラクタで Octokit インスタンスを作成
- 各専門クライアントのコンストラクタに Octokit インスタンスを注入（依存性注入）
- すべてのクライアントが同一の Octokit インスタンスを共有

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 変更が必要なファイル

**1. `src/core/github-client.ts`（702行 → 約150行、約78.6%削減）**

変更内容:
- ファサードとして各クライアントを統合
- 既存のpublicメソッドは維持（後方互換性）
- privateメソッドのうち、ドキュメント抽出関連メソッドは `GitHubClient` 内部に保持
- Issue/PR/Comment/Review 関連のメソッドを各クライアントに委譲

**2. 新規作成ファイル**

- `src/core/github/issue-client.ts`（約180行）
  - Issue操作（取得、コメント投稿、クローズ、新規Issue作成）

- `src/core/github/pull-request-client.ts`（約200行）
  - PR操作（作成、更新、検索、クローズ、PR番号取得）

- `src/core/github/comment-client.ts`（約150行）
  - コメント操作（進捗コメント、レビュー結果投稿、進捗コメント作成/更新）

- `src/core/github/review-client.ts`（約180行）
  - レビュー操作（レビュー結果投稿）

#### 動作確認が必要なファイル（変更不要）

以下のファイルは `GitHubClient` を使用していますが、**変更不要**です（後方互換性により）：

- `src/commands/init.ts`（306行）
  - `GitHubClient` のインポートとインスタンス化
  - `checkExistingPr()`, `createPullRequest()`, `generatePrBodyTemplate()` の呼び出し

- `src/commands/execute.ts`（634行）
  - `GitHubClient` のインポートとインスタンス化
  - `PhaseContext` の構築で `githubClient` を渡す

- `src/phases/base-phase.ts`（676行）
  - `GitHubClient` のインポートとフィールド定義
  - `getIssueInfo()`, `postComment()`, `createOrUpdateProgressComment()` の呼び出し

### 5.2 依存関係の変更

#### 新規依存の追加

**なし**（既存の `@octokit/rest`, `@octokit/request-error` を継続使用）

#### 既存依存の変更

**なし**

### 5.3 マイグレーション要否

#### データベーススキーマ変更

**なし**

#### 設定ファイル変更

**なし**

#### 環境変数変更

**なし**

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

1. `src/core/github/issue-client.ts`（約180行）
2. `src/core/github/pull-request-client.ts`（約200行）
3. `src/core/github/comment-client.ts`（約150行）
4. `src/core/github/review-client.ts`（約180行）

### 6.2 修正が必要な既存ファイル

1. `src/core/github-client.ts`（702行 → 約150行）

### 6.3 削除が必要なファイル

**なし**

### 6.4 新規作成テストファイル

1. `tests/unit/github/issue-client.test.ts`
2. `tests/unit/github/pull-request-client.test.ts`
3. `tests/unit/github/comment-client.test.ts`
4. `tests/unit/github/review-client.test.ts`
5. `tests/integration/github-client-facade.test.ts`

---

## 7. 詳細設計

### 7.1 IssueClient 設計

**責務**: Issue操作のみ

**ファイルパス**: `src/core/github/issue-client.ts`

**推定行数**: 約180行

#### インターフェース設計

```typescript
export class IssueClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string);

  // Issue取得
  public async getIssue(issueNumber: number): Promise<any>;
  public async getIssueInfo(issueNumber: number): Promise<IssueInfo>;

  // Issueコメント取得
  public async getIssueComments(issueNumber: number): Promise<any[]>;
  public async getIssueCommentsDict(issueNumber: number): Promise<CommentDict[]>;

  // コメント投稿
  public async postComment(issueNumber: number, body: string): Promise<any>;

  // Issueクローズ
  public async closeIssueWithReason(
    issueNumber: number,
    reason: string
  ): Promise<GenericResult>;

  // 残タスクIssue作成
  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string
  ): Promise<IssueCreationResult>;
}
```

#### 型定義（既存型を再利用）

```typescript
interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
  created_at: string;
  updated_at: string;
}

interface CommentDict {
  id: number;
  user: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// 既存型（変更なし）
export interface IssueCreationResult {
  success: boolean;
  issue_url: string | null;
  issue_number: number | null;
  error?: string | null;
}

export interface GenericResult {
  success: boolean;
  error?: string | null;
}
```

#### エラーハンドリング

- 401/403エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
- RequestErrorの場合: `GitHub API error: {status} - {message}` 形式でエラーメッセージを構築
- その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを構築
- エラー発生時も例外をスローせず、Result型を返す

---

### 7.2 PullRequestClient 設計

**責務**: PR操作のみ

**ファイルパス**: `src/core/github/pull-request-client.ts`

**推定行数**: 約200行

#### インターフェース設計

```typescript
export class PullRequestClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly repositoryName: string;

  constructor(
    octokit: Octokit,
    owner: string,
    repo: string,
    repositoryName: string
  );

  // PR作成
  public async createPullRequest(
    title: string,
    body: string,
    head: string,
    base?: string,
    draft?: boolean
  ): Promise<PullRequestResult>;

  // 既存PR検索
  public async checkExistingPr(
    head: string,
    base?: string
  ): Promise<PullRequestSummary | null>;

  // PR更新
  public async updatePullRequest(
    prNumber: number,
    body: string
  ): Promise<GenericResult>;

  // PRクローズ
  public async closePullRequest(
    prNumber: number,
    reason?: string
  ): Promise<GenericResult>;

  // PR番号取得
  public async getPullRequestNumber(
    issueNumber: number
  ): Promise<number | null>;
}
```

#### 型定義（既存型を再利用）

```typescript
export interface PullRequestResult {
  success: boolean;
  pr_url: string | null;
  pr_number: number | null;
  error?: string | null;
}

export interface PullRequestSummary {
  pr_number: number;
  pr_url: string;
  state: string;
}
```

#### エラーハンドリング

- 422エラー（PR作成時）: 「A pull request already exists for this branch」エラーメッセージを返す
- 401/403エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
- RequestErrorの場合: `GitHub API error: {status} - {message}` 形式でエラーメッセージを構築
- その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを構築
- エラー発生時も例外をスローせず、Result型を返す

---

### 7.3 CommentClient 設計

**責務**: コメント操作のみ

**ファイルパス**: `src/core/github/comment-client.ts`

**推定行数**: 約150行

#### インターフェース設計

```typescript
export class CommentClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string);

  // ワークフロー進捗コメント投稿
  public async postWorkflowProgress(
    issueNumber: number,
    phase: string,
    status: string,
    details?: string
  ): Promise<any>;

  // 進捗コメント作成/更新
  public async createOrUpdateProgressComment(
    issueNumber: number,
    content: string,
    metadataManager: MetadataManager
  ): Promise<ProgressCommentResult>;
}
```

#### 型定義（既存型を再利用）

```typescript
export interface ProgressCommentResult {
  comment_id: number;
  comment_url: string | null;
}
```

#### エラーハンドリング

- 既存コメント更新失敗時: 警告ログを出力し、新規コメントを作成（フォールバック）
- RequestErrorの場合: `GitHub API error: {status} - {message}` 形式でエラーメッセージを構築
- その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを構築
- `createOrUpdateProgressComment` は例外をスローする可能性がある（既存動作を維持）

---

### 7.4 ReviewClient 設計

**責務**: レビュー結果投稿のみ

**ファイルパス**: `src/core/github/review-client.ts`

**推定行数**: 約180行

#### インターフェース設計

```typescript
export class ReviewClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string);

  // レビュー結果投稿
  public async postReviewResult(
    issueNumber: number,
    phase: string,
    result: string,
    feedback: string,
    suggestions: string[]
  ): Promise<any>;
}
```

#### エラーハンドリング

- RequestErrorの場合: `GitHub API error: {status} - {message}` 形式でエラーメッセージを構築
- その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを構築
- エラー発生時も例外をスローせず、Result型を返す

---

### 7.5 GitHubClient (Facade) 設計

**責務**: 各専門クライアントの統合とドキュメント抽出機能

**ファイルパス**: `src/core/github-client.ts`

**推定行数**: 約150行（約78.6%削減）

#### クラス設計

```typescript
export class GitHubClient {
  private readonly token: string;
  private readonly repositoryName: string;
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  // 各専門クライアント
  private readonly issueClient: IssueClient;
  private readonly pullRequestClient: PullRequestClient;
  private readonly commentClient: CommentClient;
  private readonly reviewClient: ReviewClient;

  constructor(token?: string | null, repository?: string | null) {
    // 既存のコンストラクタロジック（トークン検証、リポジトリ名解析）
    // Octokit インスタンス作成
    this.octokit = new Octokit({ auth: this.token });

    // 各クライアントのインスタンス化（依存性注入）
    this.issueClient = new IssueClient(this.octokit, this.owner, this.repo);
    this.pullRequestClient = new PullRequestClient(
      this.octokit,
      this.owner,
      this.repo,
      this.repositoryName
    );
    this.commentClient = new CommentClient(this.octokit, this.owner, this.repo);
    this.reviewClient = new ReviewClient(this.octokit, this.owner, this.repo);
  }

  // Issue操作（IssueClient に委譲）
  public async getIssue(issueNumber: number) {
    return this.issueClient.getIssue(issueNumber);
  }

  public async getIssueInfo(issueNumber: number) {
    return this.issueClient.getIssueInfo(issueNumber);
  }

  public async getIssueComments(issueNumber: number) {
    return this.issueClient.getIssueComments(issueNumber);
  }

  public async getIssueCommentsDict(issueNumber: number) {
    return this.issueClient.getIssueCommentsDict(issueNumber);
  }

  public async postComment(issueNumber: number, body: string) {
    return this.issueClient.postComment(issueNumber, body);
  }

  public async closeIssueWithReason(issueNumber: number, reason: string) {
    return this.issueClient.closeIssueWithReason(issueNumber, reason);
  }

  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string
  ) {
    return this.issueClient.createIssueFromEvaluation(
      issueNumber,
      remainingTasks,
      evaluationReportPath
    );
  }

  // PR操作（PullRequestClient に委譲）
  public async createPullRequest(
    title: string,
    body: string,
    head: string,
    base = 'main',
    draft = true
  ) {
    return this.pullRequestClient.createPullRequest(title, body, head, base, draft);
  }

  public async checkExistingPr(head: string, base = 'main') {
    return this.pullRequestClient.checkExistingPr(head, base);
  }

  public async updatePullRequest(prNumber: number, body: string) {
    return this.pullRequestClient.updatePullRequest(prNumber, body);
  }

  public async closePullRequest(prNumber: number, reason?: string) {
    return this.pullRequestClient.closePullRequest(prNumber, reason);
  }

  public async getPullRequestNumber(issueNumber: number) {
    return this.pullRequestClient.getPullRequestNumber(issueNumber);
  }

  // コメント操作（CommentClient に委譲）
  public async postWorkflowProgress(
    issueNumber: number,
    phase: string,
    status: string,
    details?: string
  ) {
    return this.commentClient.postWorkflowProgress(issueNumber, phase, status, details);
  }

  public async createOrUpdateProgressComment(
    issueNumber: number,
    content: string,
    metadataManager: MetadataManager
  ) {
    return this.commentClient.createOrUpdateProgressComment(
      issueNumber,
      content,
      metadataManager
    );
  }

  // レビュー操作（ReviewClient に委譲）
  public async postReviewResult(
    issueNumber: number,
    phase: string,
    result: string,
    feedback: string,
    suggestions: string[]
  ) {
    return this.reviewClient.postReviewResult(
      issueNumber,
      phase,
      result,
      feedback,
      suggestions
    );
  }

  // ドキュメント抽出機能（GitHubClient 内部に保持）
  public generatePrBodyTemplate(issueNumber: number, branchName: string): string {
    // 既存実装を維持
  }

  public generatePrBodyDetailed(
    issueNumber: number,
    branchName: string,
    extractedInfo: Record<string, string>
  ): string {
    // 既存実装を維持
  }

  public async extractPhaseOutputs(
    issueNumber: number,
    phaseOutputs: Record<string, string | null | undefined>
  ): Promise<Record<string, string>> {
    // 既存実装を維持
  }

  // Private メソッド（ドキュメント抽出用）
  private extractSectionFromFile(
    filePath: string | null | undefined,
    headers: string[],
    fallback: string
  ): string {
    // 既存実装を維持
  }

  private extractSectionWithCandidates(content: string, headers: string[]): string {
    // 既存実装を維持
  }

  private extractSection(content: string, header: string): string {
    // 既存実装を維持
  }

  private extractSummaryFromIssue(issueBody: string): string {
    // 既存実装を維持
  }

  public close(): void {
    // Octokit does not require explicit disposal.
  }
}
```

#### ドキュメント抽出メソッドの配置理由

Planning PhaseとRequirements Phaseで検討された結果、以下の理由により `GitHubClient` 内部に保持することに決定：

1. **行数制約の遵守**
   - ドキュメント抽出関連メソッド（`extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed`, `extractSectionFromFile` 等）は約150行
   - ファサード本体は約150行
   - 合計約150行で、目標の150行以下に収まる見込み

2. **責務の明確化**
   - ドキュメント抽出はGitHub API操作ではなく、ローカルファイル操作
   - `GitHubClient` が持つユーティリティ機能として位置づけることで、単一責任原則に違反しない

3. **複雑性の抑制**
   - 別クラス `DocumentExtractor` を作成すると、依存関係が増加し、複雑性が上がる
   - `GitHubClient` 内部に保持することで、既存の呼び出し元への影響を最小化

**代替案**: 将来的に行数が150行を超過する場合、または単一責任原則の観点から分離が望ましい場合、別クラス `DocumentExtractor` を作成することを検討（優先度: 中、見積もり工数: 2~3時間）

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

**要件**: GitHub トークンの保護

**実装方針**:
- GitHub トークンは、各クライアント内で平文保存しない
- Octokit インスタンスを通じてのみ認証情報を使用
- 各クライアントは Octokit インスタンスを受け取るのみで、トークンを直接扱わない

**検証方法**:
- コードレビューで、トークンの直接保存がないことを確認
- ユニットテストで、Octokitインスタンスのモック化により、トークンが外部に漏れないことを確認

### 8.2 データ保護

**要件**: エラーメッセージの安全性

**実装方針**:
- エラーメッセージに GitHub トークンや機密情報を含めない
- RequestError のメッセージをそのまま返さず、安全なメッセージに変換
- エラーログに機密情報を出力しない

**検証方法**:
- エラーケースのユニットテストで、エラーメッセージに機密情報が含まれないことを確認

### 8.3 セキュリティリスクと対策

**リスク1**: Octokitインスタンスの不正利用

**対策**:
- 各クライアントのコンストラクタで Octokit インスタンスを private フィールドに格納
- 外部からの直接アクセスを防止

**リスク2**: エラーメッセージによる情報漏洩

**対策**:
- エラーメッセージをフォーマットし、機密情報をマスキング
- RequestError の詳細情報を出力しない（ステータスコードとメッセージのみ）

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**NFR-001: API呼び出し回数の維持**

**設計方針**:
- リファクタリング後も、GitHub API呼び出し回数は変更前と同一
- ファサードパターンによる委譲のみで、追加のAPI呼び出しは発生しない

**測定方法**:
- 統合テストで API呼び出し回数をカウントし、変更前と比較
- Octokitのモック化により、API呼び出し回数を記録

**NFR-002: レスポンスタイムの維持**

**設計方針**:
- 各メソッドのレスポンスタイムは、変更前と比較して **10%以内の差異** に収める
- ファサードパターンによる委譲のオーバーヘッドは、JavaScript のメソッド呼び出しのみ（数マイクロ秒程度）

**測定方法**:
- ベンチマークテストで各メソッドの実行時間を測定
- 変更前のレスポンスタイムと比較（目標: ±10%以内）

### 9.2 スケーラビリティ

**設計方針**:
- 各クライアントが独立しているため、新しいGitHub API機能の追加が容易
- 例: GitHub Discussions、GitHub Projects 連携のクライアントを追加する場合、既存のクライアントに影響を与えない

**拡張例**:
- `DiscussionsClient` を追加する場合
  - `src/core/github/discussions-client.ts` を作成
  - `GitHubClient` のコンストラクタで `DiscussionsClient` をインスタンス化
  - `GitHubClient` の公開メソッドを追加（委譲）

### 9.3 保守性

**NFR-007: コードの可読性**

**設計方針**:
- 各モジュールは **200行以下** であること
- 単一責任原則（SRP）を遵守し、各クライアントが1つの責務のみを持つ

**目標行数**:
- `IssueClient`: 180行以下
- `PullRequestClient`: 200行以下
- `CommentClient`: 150行以下
- `ReviewClient`: 180行以下
- `GitHubClient`（ファサード）: 150行以下

**測定方法**:
- コードレビューで各ファイルの行数を確認
- Phase 6（テスト実行）で行数制約を検証

**NFR-008: 単一責任原則の遵守**

**設計方針**:
- 各クライアントは、単一の責務のみを持つこと
- IssueClient: Issue操作のみ
- PullRequestClient: PR操作のみ
- CommentClient: コメント操作のみ
- ReviewClient: レビュー結果投稿のみ

**検証方法**:
- コードレビューで、各クライアントが複数の責務を持っていないことを確認

**NFR-009: 拡張性**

**設計方針**:
- 新しいGitHub API機能の追加時、既存のクライアントに影響を与えないこと
- 各クライアントを疎結合に設計し、新機能は新規クラスとして追加

**実装例**:
- GitHub Discussions 連携を追加する場合
  - `DiscussionsClient` を新規作成
  - `GitHubClient` のコンストラクタで `DiscussionsClient` をインスタンス化
  - `GitHubClient` の公開メソッドを追加（委譲）
  - 既存のクライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）には一切変更を加えない

---

## 10. 実装の順序

実装順序は以下の通りです（依存関係を考慮）：

### Phase 1: 基盤整備（1~2時間）

**Task 1-1**: ディレクトリ構造の作成
- `src/core/github/` ディレクトリを作成
- 各クライアントのファイルを作成（空のテンプレート）

**Task 1-2**: 型定義の確認
- 既存の型定義（`PullRequestResult`, `IssueCreationResult`, `GenericResult`, `ProgressCommentResult`, `PullRequestSummary`）を確認
- 必要に応じて新しい型定義を追加（`IssueInfo`, `CommentDict`）

### Phase 2: 各クライアントの実装（4~5時間）

**Task 2-1**: IssueClient の実装（1~1.5時間）
- コンストラクタとフィールドの実装
- `getIssue`, `getIssueInfo`, `getIssueComments`, `getIssueCommentsDict` の実装
- `postComment`, `closeIssueWithReason`, `createIssueFromEvaluation` の実装
- エラーハンドリングの実装

**Task 2-2**: PullRequestClient の実装（1~1.5時間）
- コンストラクタとフィールドの実装
- `createPullRequest`, `checkExistingPr`, `updatePullRequest` の実装
- `closePullRequest`, `getPullRequestNumber` の実装
- エラーハンドリングの実装（422エラーの特別処理を含む）

**Task 2-3**: CommentClient の実装（0.5~1時間）
- コンストラクタとフィールドの実装
- `postWorkflowProgress`, `createOrUpdateProgressComment` の実装
- エラーハンドリングの実装（既存コメント更新失敗時のフォールバック）

**Task 2-4**: ReviewClient の実装（0.5時間）
- コンストラクタとフィールドの実装
- `postReviewResult` の実装
- エラーハンドリングの実装

### Phase 3: ファサードの実装（0.5~1時間）

**Task 3-1**: GitHubClient のリファクタリング
- 既存のコンストラクタロジックを維持
- 各クライアントのインスタンス化とOctokitインスタンス注入
- 既存publicメソッドを各クライアントに委譲
- ドキュメント抽出関連のprivateメソッドを維持

### Phase 4: テストコード実装（2~3時間）

**Task 4-1**: IssueClient のユニットテスト（0.5~1時間）
- Octokitのモック化
- 正常系（`getIssue`, `postComment`, `createIssueFromEvaluation`）
- エラー系（401/403エラー、RequestError処理）

**Task 4-2**: PullRequestClient のユニットテスト（0.5~1時間）
- `createPullRequest` の正常系（成功、既存PR検出、422エラー）
- `checkExistingPr` の正常系・エラー系
- `updatePullRequest`, `closePullRequest` のテスト

**Task 4-3**: CommentClient のユニットテスト（0.5時間）
- `postWorkflowProgress` の正常系
- `createOrUpdateProgressComment` の正常系（新規作成、更新成功、更新失敗時のフォールバック）

**Task 4-4**: ReviewClient のユニットテスト（0.25時間）
- `postReviewResult` の正常系

**Task 4-5**: ファサード統合テスト（0.25~0.5時間）
- `GitHubClient` の各メソッドが正しいクライアントに委譲されているか検証
- 既存の呼び出し元との互換性確認

### Phase 5: テスト実行と検証（0.5~1時間）

**Task 5-1**: ユニットテスト実行
- `npm run test:unit` ですべてのユニットテストが成功することを確認
- カバレッジレポート確認（目標: 80%以上）

**Task 5-2**: 統合テスト実行
- `npm run test:integration` で統合テストが成功することを確認
- 既存の呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts`）の動作確認

**Task 5-3**: 行数制約の確認
- 各ファイルの行数を確認（目標: 各クライアント200行以下、ファサード150行以下）

### Phase 6: ドキュメント更新（1~1.5時間）

**Task 6-1**: ARCHITECTURE.md の更新（0.5~1時間）
- GitHubClient のモジュール構成を追記（ファサードパターンの説明）
- 各クライアントの責務を記載
- Octokitインスタンス共有方法の説明

**Task 6-2**: CLAUDE.md の更新（0.5時間）
- `src/core/github-client.ts` の説明を更新（ファサードとしての役割）
- 新規モジュール（`src/core/github/*.ts`）の説明を追加

---

## 11. テスト設計

### 11.1 ユニットテスト

#### IssueClient のユニットテスト

**ファイル**: `tests/unit/github/issue-client.test.ts`

**テストケース**:

1. **正常系**
   - `getIssue()`: Issue詳細を取得できる
   - `getIssueInfo()`: Issue情報の簡易取得ができる
   - `getIssueComments()`: Issueコメント一覧を取得できる
   - `getIssueCommentsDict()`: コメント情報の辞書形式取得ができる
   - `postComment()`: コメントを投稿できる
   - `closeIssueWithReason()`: Issueをクローズできる
   - `createIssueFromEvaluation()`: 残タスクIssueを作成できる

2. **エラー系**
   - 401エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
   - 403エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
   - RequestError: `GitHub API error: {status} - {message}` 形式でエラーメッセージを返す
   - その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを返す

3. **境界値テスト**
   - Issue番号が0の場合
   - コメント本文が空の場合
   - 残タスクが空配列の場合

#### PullRequestClient のユニットテスト

**ファイル**: `tests/unit/github/pull-request-client.test.ts`

**テストケース**:

1. **正常系**
   - `createPullRequest()`: PRを作成できる
   - `checkExistingPr()`: 既存PRを検索できる
   - `updatePullRequest()`: PR本文を更新できる
   - `closePullRequest()`: PRをクローズできる
   - `getPullRequestNumber()`: PR番号を取得できる

2. **エラー系**
   - 422エラー（PR作成時）: 「A pull request already exists for this branch」エラーメッセージを返す
   - 401エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
   - 403エラー: 「GitHub Token lacks required scope」エラーメッセージを返す
   - RequestError: `GitHub API error: {status} - {message}` 形式でエラーメッセージを返す
   - その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを返す

3. **境界値テスト**
   - PR番号が0の場合
   - head ブランチ名が空の場合
   - 既存PRが存在しない場合

#### CommentClient のユニットテスト

**ファイル**: `tests/unit/github/comment-client.test.ts`

**テストケース**:

1. **正常系**
   - `postWorkflowProgress()`: ワークフロー進捗コメントを投稿できる
   - `createOrUpdateProgressComment()`: 進捗コメントを新規作成できる
   - `createOrUpdateProgressComment()`: 進捗コメントを更新できる
   - `createOrUpdateProgressComment()`: 既存コメント更新失敗時に新規作成できる（フォールバック）

2. **エラー系**
   - RequestError: `GitHub API error: {status} - {message}` 形式でエラーメッセージを返す
   - その他のエラー: 例外をスロー（既存動作を維持）

3. **境界値テスト**
   - フェーズ名が未知の場合
   - ステータスが未知の場合

#### ReviewClient のユニットテスト

**ファイル**: `tests/unit/github/review-client.test.ts`

**テストケース**:

1. **正常系**
   - `postReviewResult()`: レビュー結果コメントを投稿できる
   - サジェスションリストが正しく表示される

2. **エラー系**
   - RequestError: `GitHub API error: {status} - {message}` 形式でエラーメッセージを返す
   - その他のエラー: `Unexpected error: {message}` 形式でエラーメッセージを返す

3. **境界値テスト**
   - サジェスションが空配列の場合
   - フィードバックが空文字列の場合

### 11.2 統合テスト

#### ファサード統合テスト

**ファイル**: `tests/integration/github-client-facade.test.ts`

**テストケース**:

1. **委譲の正常性テスト**
   - `GitHubClient.getIssue()` が `IssueClient.getIssue()` に委譲される
   - `GitHubClient.createPullRequest()` が `PullRequestClient.createPullRequest()` に委譲される
   - `GitHubClient.postWorkflowProgress()` が `CommentClient.postWorkflowProgress()` に委譲される
   - `GitHubClient.postReviewResult()` が `ReviewClient.postReviewResult()` に委譲される

2. **Octokitインスタンス共有の検証**
   - すべてのクライアントが同一の Octokit インスタンスを使用している

3. **後方互換性テスト**
   - 既存のメソッドシグネチャが変更されていない
   - 戻り値の型が変更されていない
   - 既存の呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts`）が無変更で動作する

### 11.3 テストカバレッジ目標

- **各クライアントのユニットテスト**: 80%以上
- **ファサード統合テスト**: 100%（すべての委譲メソッドをカバー）
- **全体のカバレッジ**: 85%以上

---

## 12. リスクと軽減策

### リスク1: Octokitインスタンスの共有方法の誤り

**影響度**: 高
**確率**: 中

**リスク内容**:
- Octokitインスタンスの共有方法を誤ると、認証エラー（401/403）が発生する可能性
- 各クライアントが独自のOctokitインスタンスを作成すると、トークンが重複管理される

**軽減策**:
- Phase 4（実装）で依存性注入パターン（コンストラクタ注入）を明確に実装
- Phase 5（テストコード実装）で各クライアントがOctokitインスタンスを正しく使用しているか検証
- 統合テストで実際のGitHub API呼び出しシーケンスを確認（モック環境）

### リスク2: privateメソッドの配置先の曖昧さ

**影響度**: 中
**確率**: 中

**リスク内容**:
- `extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed` などのprivateメソッドの配置先が曖昧
- 別クラス `DocumentExtractor` を作成するか、`GitHubClient` 内部に保持するか

**軽減策**:
- Planning PhaseとRequirements Phaseで検討された結果、`GitHubClient` 内部に保持することに決定
- Phase 4（実装）で行数を定期的に確認し、150行を超過する場合は別クラス化を検討

**代替案（将来的な拡張候補）**:
- 優先度: 中
- 条件: `GitHubClient` の行数が150行を超過する場合、または単一責任原則の観点から分離が望ましい場合
- 見積もり工数: 2~3時間

### リスク3: 既存の呼び出し元での後方互換性破壊

**影響度**: 高
**確率**: 低

**リスク内容**:
- リファクタリング後、既存の呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts`）が動作しなくなる

**軽減策**:
- Phase 4（実装）でファサードパターンにより既存のpublicメソッドを完全に維持
- Phase 5（テストコード実装）で既存の呼び出し元との統合テストを実施
- Phase 6（テスト実行）で既存のワークフロー全体を手動実行し、動作確認

### リスク4: テストカバレッジ不足

**影響度**: 中
**確率**: 低

**リスク内容**:
- テストカバレッジが目標（80%以上）に達しない

**軽減策**:
- Phase 5（テストコード実装）でカバレッジ目標（80%以上）を明確化
- `npm run test:coverage` でカバレッジレポートを確認
- エラーハンドリング（401/403/422）の境界値テストを網羅

### リスク5: 行数制約（200行以下）の超過

**影響度**: 低
**確率**: 中

**リスク内容**:
- 各クライアントの行数が目標（200行以下）を超過する

**軽減策**:
- Phase 1（要件定義）で各クライアントのメソッド数を事前に計算
- Phase 4（実装）で各モジュールの行数を定期的に確認
- 必要に応じてさらに細分化（例: DocumentExtractor を別クラス化）

---

## 13. 品質ゲート

設計書は以下の品質ゲートを満たす必要があります：

- [x] **実装戦略の判断根拠が明記されている**（セクション1）
- [x] **テスト戦略の判断根拠が明記されている**（セクション2）
- [x] **テストコード戦略の判断根拠が明記されている**（セクション3）
- [x] **既存コードへの影響範囲が分析されている**（セクション5）
- [x] **変更が必要なファイルがリストアップされている**（セクション6）
- [x] **設計が実装可能である**（セクション7）

---

## 14. 受け入れ基準（Phase 2）

Phase 2（設計）の受け入れ基準は以下の通りです：

- [x] **実装戦略の判断根拠が明記されている**: REFACTOR（既存コードの構造改善）
- [x] **テスト戦略の判断根拠が明記されている**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- [x] **テストコード戦略の判断根拠が明記されている**: CREATE_TEST（新規テストファイル作成）
- [x] **各クライアントのインターフェースが明確である**: セクション7で各クライアントのインターフェースを定義
- [x] **ファサードパターンの実装方針が定義されている**: セクション7.5でファサードの設計を定義
- [x] **エラーハンドリング方針が統一されている**: セクション7で各クライアントのエラーハンドリングを統一
- [x] **既存コードへの影響範囲が分析されている**: セクション5で影響範囲を分析
- [x] **変更が必要なファイルがリストアップされている**: セクション6でファイルリストを作成
- [x] **論理的な矛盾がない**: 各セクション間で矛盾がない

---

## 15. スコープ外

以下の事項は、本Issue（#24）のスコープ外とし、将来的な拡張候補として扱います：

### OUT-001: DocumentExtractor クラスの分離

- `extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed` などのドキュメント関連メソッドを別クラス化することは、Phase 4（実装）では実施しない
- **理由**: 行数制約（GitHubClient を150行以下に収める）が達成可能であれば、ファサード内に保持することで複雑性を抑える
- **優先度**: 中
- **条件**: `GitHubClient` の行数が150行を超過する場合、または単一責任原則の観点から分離が望ましい場合
- **見積もり工数**: 2~3時間

### OUT-002: GitHub GraphQL API への移行

- REST API から GraphQL API への移行は、本Issueのスコープ外
- **理由**: 後方互換性を維持しつつ、段階的にリファクタリングを進めることを優先
- **優先度**: 低
- **見積もり工数**: 8~10時間

### OUT-003: GitHub Discussions, Projects 連携

- Issue/PR 以外の GitHub 機能（Discussions, Projects, Packages 等）への対応は、本Issueのスコープ外
- **理由**: 現在の AI Workflow では使用していないため、優先度が低い
- **優先度**: 低

### OUT-004: リトライロジックの追加

- GitHub API 呼び出し失敗時の自動リトライ機能は、本Issueのスコープ外
- **理由**: 既存の実装でリトライ機能がないため、新規追加は影響範囲が広い
- **優先度**: 低
- **見積もり工数**: 4~6時間

---

## 16. 付録

### 16.1 用語集

| 用語 | 定義 |
|------|------|
| **ファサードパターン** | 複雑なサブシステムへの統一されたインターフェースを提供する設計パターン。本Issueでは、`GitHubClient` が各専門クライアント（IssueClient, PullRequestClient等）への統一インターフェースを提供する。 |
| **依存性注入（DI）** | オブジェクトの依存関係を外部から注入する設計パターン。本Issueでは、Octokitインスタンスをコンストラクタ注入により各クライアントに渡す。 |
| **単一責任原則（SRP）** | 1つのクラスは1つの責務のみを持つべきという原則。本Issueでは、各クライアントが1つの責務（Issue操作、PR操作等）のみを持つ。 |
| **Result型** | 処理結果（成功/失敗）とエラーメッセージを含むオブジェクト型。例: `{ success: boolean, error?: string }` |

### 16.2 参考資料

- **Planning Document**: `.ai-workflow/issue-24/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-24/01_requirements/output/requirements.md`
- **既存実装**: `src/core/github-client.ts` (702行)
- **CLAUDE.md**: プロジェクト全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **親Issue**: #1（AI Workflow 全体の親Issue）

### 16.3 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-21 | 1.0 | 初版作成 | AI Workflow Agent |

---

**承認**:

- [ ] プロダクトオーナー承認
- [ ] テックリード承認
- [ ] QAリード承認

**次フェーズ**: Phase 3 (Test Scenario) - テストシナリオの作成

---

*本設計書は、AI Workflow Phase 2 (Design) で自動生成されました。*
