# テストシナリオ - Issue #24: GitHub Client の機能別分割

**作成日**: 2025-01-21
**Issue番号**: #24
**実装戦略**: REFACTOR
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: CREATE_TEST

---

## 0. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

Planning PhaseとDesign Phaseで策定された方針に基づき、以下の2種類のテストを実施します：

1. **ユニットテスト（UNIT）**: 各クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）の独立した動作を検証
2. **統合テスト（INTEGRATION）**: ファサードパターンによる統合動作を検証（既存APIとの互換性、Octokitインスタンス共有）

### テスト対象の範囲

**新規作成モジュール**:
- `src/core/github/issue-client.ts`（約180行）
- `src/core/github/pull-request-client.ts`（約200行）
- `src/core/github/comment-client.ts`（約150行）
- `src/core/github/review-client.ts`（約180行）

**リファクタリング対象**:
- `src/core/github-client.ts`（702行 → 約150行）

**統合テスト対象**:
- GitHubClient ファサードの委譲機能
- Octokitインスタンス共有の正常性
- 既存呼び出し元との後方互換性

### テストの目的

1. **機能正確性の保証**: 各クライアントが正しくGitHub APIを呼び出し、期待される結果を返すこと
2. **エラーハンドリングの検証**: 401/403/422エラー、RequestErrorが適切にハンドリングされること
3. **後方互換性の保証**: 既存のコード（`init.ts`, `execute.ts`, `base-phase.ts`）が無変更で動作すること
4. **Octokitインスタンス共有の検証**: すべてのクライアントが同一のOctokitインスタンスを使用すること
5. **テストカバレッジの達成**: 各クライアント80%以上、全体で85%以上のカバレッジを達成

---

## 1. ユニットテストシナリオ

### 1.1 IssueClient ユニットテスト

**テストファイル**: `tests/unit/github/issue-client.test.ts`

**目的**: Issue操作の正常性とエラーハンドリングを検証

---

#### テストケース 1-1: getIssue_正常系

**目的**: Issue詳細を正しく取得できることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている
- Issue #24 が存在する

**入力**:
```typescript
issueNumber = 24
```

**期待結果**:
- Octokit の `rest.issues.get()` が呼び出される
- 呼び出し時のパラメータ: `{ owner, repo, issue_number: 24 }`
- Issue詳細オブジェクトが返される（`number`, `title`, `body`, `state`, `labels`, `url`, `created_at`, `updated_at` を含む）

**テストデータ**:
```typescript
const mockIssueResponse = {
  data: {
    number: 24,
    title: '[REFACTOR] GitHub Client の機能別分割',
    body: '## 概要\n...',
    state: 'open',
    labels: [],
    html_url: 'https://github.com/owner/repo/issues/24',
    created_at: '2025-01-21T00:00:00Z',
    updated_at: '2025-01-21T12:00:00Z'
  }
};
```

---

#### テストケース 1-2: getIssueInfo_正常系

**目的**: Issue情報の簡易取得ができることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
```

**期待結果**:
- `IssueInfo` 型のオブジェクトが返される
- 必須フィールド: `number`, `title`, `body`, `state`, `labels`, `url`, `created_at`, `updated_at`

**テストデータ**:
```typescript
const expectedIssueInfo: IssueInfo = {
  number: 24,
  title: '[REFACTOR] GitHub Client の機能別分割',
  body: '## 概要\n...',
  state: 'open',
  labels: [],
  url: 'https://github.com/owner/repo/issues/24',
  created_at: '2025-01-21T00:00:00Z',
  updated_at: '2025-01-21T12:00:00Z'
};
```

---

#### テストケース 1-3: postComment_正常系

**目的**: コメントを正しく投稿できることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
body = '## Phase 1: Requirements - 開始\n進捗を報告します。'
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- 呼び出し時のパラメータ: `{ owner, repo, issue_number: 24, body: '## Phase 1: Requirements - 開始\n進捗を報告します。' }`
- コメントオブジェクトが返される

**テストデータ**:
```typescript
const mockCommentResponse = {
  data: {
    id: 123456,
    body: '## Phase 1: Requirements - 開始\n進捗を報告します。',
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
    created_at: '2025-01-21T12:00:00Z'
  }
};
```

---

#### テストケース 1-4: closeIssueWithReason_正常系

**目的**: Issueを理由付きでクローズできることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
reason = '実装完了。すべてのテストがパスしました。'
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される（理由コメント投稿）
- Octokit の `rest.issues.update()` が呼び出される（Issue クローズ）
- 呼び出し時のパラメータ: `{ owner, repo, issue_number: 24, state: 'closed' }`
- `GenericResult` 型のオブジェクトが返される: `{ success: true }`

**テストデータ**:
```typescript
const expectedResult: GenericResult = {
  success: true
};
```

---

#### テストケース 1-5: createIssueFromEvaluation_正常系

**目的**: 残タスクIssueを正しく作成できることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
remainingTasks = [
  { title: 'ドキュメント更新', description: 'ARCHITECTURE.mdの更新' }
]
evaluationReportPath = '.ai-workflow/issue-24/08_evaluation/output/evaluation.md'
```

**期待結果**:
- Octokit の `rest.issues.create()` が呼び出される
- 新規Issueのタイトルに「残タスク」が含まれる
- `IssueCreationResult` 型のオブジェクトが返される: `{ success: true, issue_url: '...', issue_number: 25 }`

**テストデータ**:
```typescript
const expectedResult: IssueCreationResult = {
  success: true,
  issue_url: 'https://github.com/owner/repo/issues/25',
  issue_number: 25,
  error: null
};
```

---

#### テストケース 1-6: getIssue_401エラー

**目的**: 401エラーが適切にハンドリングされることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が401エラーを返すようモック化されている

**入力**:
```typescript
issueNumber = 24
```

**期待結果**:
- RequestError（status: 401）がキャッチされる
- エラーメッセージ: 「GitHub Token lacks required scope」
- 例外はスローされない（Result型で返される）

**テストデータ**:
```typescript
const mockError = new RequestError('Unauthorized', 401, {
  request: { method: 'GET', url: 'https://api.github.com/repos/owner/repo/issues/24' },
  response: { status: 401, url: 'https://api.github.com/repos/owner/repo/issues/24', headers: {} }
});
```

---

#### テストケース 1-7: postComment_403エラー

**目的**: 403エラーが適切にハンドリングされることを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が403エラーを返すようモック化されている

**入力**:
```typescript
issueNumber = 24
body = 'コメント本文'
```

**期待結果**:
- RequestError（status: 403）がキャッチされる
- エラーメッセージ: 「GitHub Token lacks required scope」
- 例外はスローされない

**テストデータ**:
```typescript
const mockError = new RequestError('Forbidden', 403, {
  request: { method: 'POST', url: 'https://api.github.com/repos/owner/repo/issues/24/comments' },
  response: { status: 403, url: 'https://api.github.com/repos/owner/repo/issues/24/comments', headers: {} }
});
```

---

#### テストケース 1-8: createIssueFromEvaluation_境界値（残タスクが空配列）

**目的**: 残タスクが空の場合でもエラーにならないことを検証

**前提条件**:
- IssueClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
remainingTasks = []
evaluationReportPath = '.ai-workflow/issue-24/08_evaluation/output/evaluation.md'
```

**期待結果**:
- Issueは作成されない、または空のタスクリストで作成される
- `IssueCreationResult` 型のオブジェクトが返される: `{ success: true, issue_url: null, issue_number: null }`（作成されない場合）

**テストデータ**:
```typescript
const expectedResult: IssueCreationResult = {
  success: true,
  issue_url: null,
  issue_number: null,
  error: null
};
```

---

### 1.2 PullRequestClient ユニットテスト

**テストファイル**: `tests/unit/github/pull-request-client.test.ts`

**目的**: PR操作の正常性とエラーハンドリングを検証

---

#### テストケース 2-1: createPullRequest_正常系

**目的**: PRを正しく作成できることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
title = 'feat: GitHub Client の機能別分割'
body = '## Summary\n...'
head = 'feature/issue-24-github-client-refactor'
base = 'main'
draft = true
```

**期待結果**:
- Octokit の `rest.pulls.create()` が呼び出される
- 呼び出し時のパラメータ: `{ owner, repo, title, body, head, base, draft: true }`
- `PullRequestResult` 型のオブジェクトが返される: `{ success: true, pr_url: '...', pr_number: 10 }`

**テストデータ**:
```typescript
const mockPrResponse = {
  data: {
    number: 10,
    html_url: 'https://github.com/owner/repo/pull/10',
    state: 'open',
    draft: true
  }
};

const expectedResult: PullRequestResult = {
  success: true,
  pr_url: 'https://github.com/owner/repo/pull/10',
  pr_number: 10,
  error: null
};
```

---

#### テストケース 2-2: checkExistingPr_正常系（PRが存在する）

**目的**: 既存PRを正しく検索できることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が既存PR一覧を返すようモック化されている

**入力**:
```typescript
head = 'feature/issue-24-github-client-refactor'
base = 'main'
```

**期待結果**:
- Octokit の `rest.pulls.list()` が呼び出される
- 呼び出し時のパラメータ: `{ owner, repo, head: 'owner:feature/issue-24-github-client-refactor', base: 'main', state: 'open' }`
- `PullRequestSummary` 型のオブジェクトが返される: `{ pr_number: 10, pr_url: '...', state: 'open' }`

**テストデータ**:
```typescript
const mockPrListResponse = {
  data: [
    {
      number: 10,
      html_url: 'https://github.com/owner/repo/pull/10',
      state: 'open'
    }
  ]
};

const expectedResult: PullRequestSummary = {
  pr_number: 10,
  pr_url: 'https://github.com/owner/repo/pull/10',
  state: 'open'
};
```

---

#### テストケース 2-3: checkExistingPr_正常系（PRが存在しない）

**目的**: 既存PRが存在しない場合にnullが返されることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が空のPR一覧を返すようモック化されている

**入力**:
```typescript
head = 'feature/new-branch'
base = 'main'
```

**期待結果**:
- Octokit の `rest.pulls.list()` が呼び出される
- `null` が返される

**テストデータ**:
```typescript
const mockPrListResponse = {
  data: []
};

const expectedResult = null;
```

---

#### テストケース 2-4: updatePullRequest_正常系

**目的**: PR本文を正しく更新できることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
prNumber = 10
body = '## Summary\n更新された本文'
```

**期待結果**:
- Octokit の `rest.pulls.update()` が呼び出される
- 呼び出し時のパラメータ: `{ owner, repo, pull_number: 10, body: '## Summary\n更新された本文' }`
- `GenericResult` 型のオブジェクトが返される: `{ success: true }`

**テストデータ**:
```typescript
const expectedResult: GenericResult = {
  success: true
};
```

---

#### テストケース 2-5: closePullRequest_正常系

**目的**: PRを正しくクローズできることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
prNumber = 10
reason = '別のアプローチで実装します。'
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される（理由コメント投稿）
- Octokit の `rest.pulls.update()` が呼び出される（PRクローズ）
- 呼び出し時のパラメータ: `{ owner, repo, pull_number: 10, state: 'closed' }`
- `GenericResult` 型のオブジェクトが返される: `{ success: true }`

**テストデータ**:
```typescript
const expectedResult: GenericResult = {
  success: true
};
```

---

#### テストケース 2-6: createPullRequest_422エラー（既存PR存在）

**目的**: 422エラーが適切にハンドリングされることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が422エラーを返すようモック化されている

**入力**:
```typescript
title = 'feat: GitHub Client の機能別分割'
body = '## Summary\n...'
head = 'feature/issue-24-github-client-refactor'
base = 'main'
draft = true
```

**期待結果**:
- RequestError（status: 422）がキャッチされる
- エラーメッセージ: 「A pull request already exists for this branch」
- `PullRequestResult` 型のオブジェクトが返される: `{ success: false, pr_url: null, pr_number: null, error: 'A pull request already exists for this branch' }`

**テストデータ**:
```typescript
const mockError = new RequestError('Validation Failed', 422, {
  request: { method: 'POST', url: 'https://api.github.com/repos/owner/repo/pulls' },
  response: { status: 422, url: 'https://api.github.com/repos/owner/repo/pulls', headers: {} }
});

const expectedResult: PullRequestResult = {
  success: false,
  pr_url: null,
  pr_number: null,
  error: 'A pull request already exists for this branch'
};
```

---

#### テストケース 2-7: getPullRequestNumber_正常系

**目的**: Issue番号からPR番号を正しく取得できることを検証

**前提条件**:
- PullRequestClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
```

**期待結果**:
- Octokit の `rest.issues.get()` が呼び出される
- レスポンスに `pull_request` フィールドが存在する場合、PR番号が返される
- PR番号が返される: `10`

**テストデータ**:
```typescript
const mockIssueResponse = {
  data: {
    number: 24,
    pull_request: {
      url: 'https://api.github.com/repos/owner/repo/pulls/10'
    }
  }
};

const expectedResult = 10;
```

---

### 1.3 CommentClient ユニットテスト

**テストファイル**: `tests/unit/github/comment-client.test.ts`

**目的**: コメント操作の正常性とエラーハンドリングを検証

---

#### テストケース 3-1: postWorkflowProgress_正常系

**目的**: ワークフロー進捗コメントを正しく投稿できることを検証

**前提条件**:
- CommentClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
phase = 'requirements'
status = 'in_progress'
details = '要件定義書を作成中です。'
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- コメント本文に絵文字（🔄）、フェーズ名（要件定義）、ステータス（進行中）、詳細情報が含まれる
- コメントオブジェクトが返される

**テストデータ**:
```typescript
const expectedCommentBody = `🔄 **Phase: 要件定義** - 進行中

要件定義書を作成中です。`;

const mockCommentResponse = {
  data: {
    id: 123456,
    body: expectedCommentBody,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};
```

---

#### テストケース 3-2: createOrUpdateProgressComment_正常系（新規作成）

**目的**: 進捗コメントを新規作成できることを検証

**前提条件**:
- CommentClient がインスタンス化されている
- Octokit が適切にモック化されている
- MetadataManager が既存コメントIDを持っていない（`getProgressCommentId()` が `null` を返す）

**入力**:
```typescript
issueNumber = 24
content = '## Phase 1: Requirements - 完了\n要件定義書を作成しました。'
metadataManager = mockMetadataManager
```

**期待結果**:
- `metadataManager.getProgressCommentId()` が呼び出される
- Octokit の `rest.issues.createComment()` が呼び出される（新規作成）
- `metadataManager.setProgressCommentId()` が呼び出される（新規コメントIDを保存）
- `ProgressCommentResult` 型のオブジェクトが返される: `{ comment_id: 123456, comment_url: '...' }`

**テストデータ**:
```typescript
const mockCommentResponse = {
  data: {
    id: 123456,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};

const expectedResult: ProgressCommentResult = {
  comment_id: 123456,
  comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
};
```

---

#### テストケース 3-3: createOrUpdateProgressComment_正常系（更新成功）

**目的**: 進捗コメントを正しく更新できることを検証

**前提条件**:
- CommentClient がインスタンス化されている
- Octokit が適切にモック化されている
- MetadataManager が既存コメントID（123456）を持っている

**入力**:
```typescript
issueNumber = 24
content = '## Phase 2: Design - 完了\n設計書を作成しました。'
metadataManager = mockMetadataManager (getProgressCommentId() returns 123456)
```

**期待結果**:
- `metadataManager.getProgressCommentId()` が呼び出される
- Octokit の `rest.issues.updateComment()` が呼び出される（更新）
- 呼び出し時のパラメータ: `{ owner, repo, comment_id: 123456, body: '## Phase 2: Design - 完了\n設計書を作成しました。' }`
- `ProgressCommentResult` 型のオブジェクトが返される: `{ comment_id: 123456, comment_url: '...' }`

**テストデータ**:
```typescript
const mockUpdateResponse = {
  data: {
    id: 123456,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};

const expectedResult: ProgressCommentResult = {
  comment_id: 123456,
  comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
};
```

---

#### テストケース 3-4: createOrUpdateProgressComment_フォールバック（更新失敗時に新規作成）

**目的**: 既存コメント更新失敗時に新規作成するフォールバック機能を検証

**前提条件**:
- CommentClient がインスタンス化されている
- Octokit が適切にモック化されている
- MetadataManager が既存コメントID（123456）を持っている
- Octokit の `rest.issues.updateComment()` がエラーを返す（404エラー: コメントが削除された）

**入力**:
```typescript
issueNumber = 24
content = '## Phase 3: Test Scenario - 完了\nテストシナリオを作成しました。'
metadataManager = mockMetadataManager (getProgressCommentId() returns 123456)
```

**期待結果**:
- `metadataManager.getProgressCommentId()` が呼び出される
- Octokit の `rest.issues.updateComment()` が呼び出される（エラー発生）
- 警告ログが出力される: 「既存コメントの更新に失敗しました。新規コメントを作成します。」
- Octokit の `rest.issues.createComment()` が呼び出される（フォールバック）
- `metadataManager.setProgressCommentId()` が呼び出される（新規コメントIDを保存）
- `ProgressCommentResult` 型のオブジェクトが返される: `{ comment_id: 789012, comment_url: '...' }`

**テストデータ**:
```typescript
const mockUpdateError = new RequestError('Not Found', 404, {
  request: { method: 'PATCH', url: 'https://api.github.com/repos/owner/repo/issues/comments/123456' },
  response: { status: 404, url: 'https://api.github.com/repos/owner/repo/issues/comments/123456', headers: {} }
});

const mockCreateResponse = {
  data: {
    id: 789012,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-789012'
  }
};

const expectedResult: ProgressCommentResult = {
  comment_id: 789012,
  comment_url: 'https://github.com/owner/repo/issues/24#issuecomment-789012'
};
```

---

### 1.4 ReviewClient ユニットテスト

**テストファイル**: `tests/unit/github/review-client.test.ts`

**目的**: レビュー操作の正常性とエラーハンドリングを検証

---

#### テストケース 4-1: postReviewResult_正常系（PASS）

**目的**: レビュー結果（PASS）を正しく投稿できることを検証

**前提条件**:
- ReviewClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
phase = 'requirements'
result = 'PASS'
feedback = '要件定義書は完璧です。'
suggestions = []
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- コメント本文に判定（✅ PASS）とフィードバックが含まれる
- サジェスションリストは含まれない（空配列のため）
- コメントオブジェクトが返される

**テストデータ**:
```typescript
const expectedCommentBody = `## 📋 Phase: 要件定義 - レビュー結果

**判定**: ✅ PASS

**フィードバック**:
要件定義書は完璧です。`;

const mockCommentResponse = {
  data: {
    id: 123456,
    body: expectedCommentBody,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};
```

---

#### テストケース 4-2: postReviewResult_正常系（PASS_WITH_SUGGESTIONS）

**目的**: レビュー結果（PASS_WITH_SUGGESTIONS）を正しく投稿できることを検証

**前提条件**:
- ReviewClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
phase = 'design'
result = 'PASS_WITH_SUGGESTIONS'
feedback = '設計書は良好ですが、改善提案があります。'
suggestions = [
  'エラーハンドリングの詳細を追記してください。',
  'パフォーマンス要件を明確化してください。'
]
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- コメント本文に判定（⚠️ PASS_WITH_SUGGESTIONS）、フィードバック、サジェスションリストが含まれる
- サジェスションリストが箇条書きで表示される

**テストデータ**:
```typescript
const expectedCommentBody = `## 📋 Phase: 設計 - レビュー結果

**判定**: ⚠️ PASS_WITH_SUGGESTIONS

**フィードバック**:
設計書は良好ですが、改善提案があります。

**提案事項**:
- エラーハンドリングの詳細を追記してください。
- パフォーマンス要件を明確化してください。`;

const mockCommentResponse = {
  data: {
    id: 123456,
    body: expectedCommentBody,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};
```

---

#### テストケース 4-3: postReviewResult_正常系（FAIL）

**目的**: レビュー結果（FAIL）を正しく投稿できることを検証

**前提条件**:
- ReviewClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
phase = 'implementation'
result = 'FAIL'
feedback = '実装に重大な問題があります。'
suggestions = [
  'セキュリティ脆弱性を修正してください。',
  'テストカバレッジが不足しています。'
]
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- コメント本文に判定（❌ FAIL）、フィードバック、サジェスションリストが含まれる

**テストデータ**:
```typescript
const expectedCommentBody = `## 📋 Phase: 実装 - レビュー結果

**判定**: ❌ FAIL

**フィードバック**:
実装に重大な問題があります。

**提案事項**:
- セキュリティ脆弱性を修正してください。
- テストカバレッジが不足しています。`;

const mockCommentResponse = {
  data: {
    id: 123456,
    body: expectedCommentBody,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};
```

---

#### テストケース 4-4: postReviewResult_境界値（サジェスションが空配列）

**目的**: サジェスションが空の場合でも正しく処理されることを検証

**前提条件**:
- ReviewClient がインスタンス化されている
- Octokit が適切にモック化されている

**入力**:
```typescript
issueNumber = 24
phase = 'test'
result = 'PASS'
feedback = 'テストは完璧です。'
suggestions = []
```

**期待結果**:
- Octokit の `rest.issues.createComment()` が呼び出される
- コメント本文にサジェスションリストが含まれない
- コメントオブジェクトが返される

**テストデータ**:
```typescript
const expectedCommentBody = `## 📋 Phase: テスト - レビュー結果

**判定**: ✅ PASS

**フィードバック**:
テストは完璧です。`;

const mockCommentResponse = {
  data: {
    id: 123456,
    body: expectedCommentBody,
    html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456'
  }
};
```

---

## 2. 統合テストシナリオ

### 2.1 GitHubClient ファサード統合テスト

**テストファイル**: `tests/integration/github-client-facade.test.ts`

**目的**: ファサードパターンによる統合動作を検証

---

#### シナリオ 1: GitHubClient の委譲機能検証

**目的**: GitHubClient の各メソッドが正しいクライアントに委譲されることを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- 各専門クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）がモック化されている

**テスト手順**:

1. **Issue操作の委譲**
   - `GitHubClient.getIssue(24)` を呼び出す
   - `IssueClient.getIssue(24)` が呼び出されることを確認
   - 戻り値が `IssueClient.getIssue()` の戻り値と一致することを確認

2. **PR操作の委譲**
   - `GitHubClient.createPullRequest('title', 'body', 'head', 'main', true)` を呼び出す
   - `PullRequestClient.createPullRequest('title', 'body', 'head', 'main', true)` が呼び出されることを確認
   - 戻り値が `PullRequestClient.createPullRequest()` の戻り値と一致することを確認

3. **コメント操作の委譲**
   - `GitHubClient.postWorkflowProgress(24, 'requirements', 'in_progress', '詳細')` を呼び出す
   - `CommentClient.postWorkflowProgress(24, 'requirements', 'in_progress', '詳細')` が呼び出されることを確認
   - 戻り値が `CommentClient.postWorkflowProgress()` の戻り値と一致することを確認

4. **レビュー操作の委譲**
   - `GitHubClient.postReviewResult(24, 'design', 'PASS', 'フィードバック', ['提案1'])` を呼び出す
   - `ReviewClient.postReviewResult(24, 'design', 'PASS', 'フィードバック', ['提案1'])` が呼び出されることを確認
   - 戻り値が `ReviewClient.postReviewResult()` の戻り値と一致することを確認

**期待結果**:
- すべての委譲が正しく機能する
- 戻り値が各クライアントから正しく返される
- GitHubClient 自体は GitHub API を直接呼び出さない

**確認項目**:
- [ ] Issue操作が IssueClient に委譲される
- [ ] PR操作が PullRequestClient に委譲される
- [ ] コメント操作が CommentClient に委譲される
- [ ] レビュー操作が ReviewClient に委譲される
- [ ] 各メソッドの戻り値が正しい

---

#### シナリオ 2: Octokitインスタンス共有の検証

**目的**: すべてのクライアントが同一のOctokitインスタンスを使用していることを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- Octokit がモック化されており、インスタンスIDを追跡可能

**テスト手順**:

1. **GitHubClient のインスタンス化**
   - `new GitHubClient('token', 'owner/repo')` を実行
   - 内部で Octokit インスタンスが作成されることを確認

2. **各クライアントへのOctokit注入確認**
   - IssueClient のコンストラクタに渡された Octokit インスタンスIDを取得
   - PullRequestClient のコンストラクタに渡された Octokit インスタンスIDを取得
   - CommentClient のコンストラクタに渡された Octokit インスタンスIDを取得
   - ReviewClient のコンストラクタに渡された Octokit インスタンスIDを取得

3. **インスタンスIDの比較**
   - すべてのクライアントに渡された Octokit インスタンスIDが同一であることを確認

**期待結果**:
- すべてのクライアントが同一の Octokit インスタンスを使用している
- Octokit インスタンスが重複作成されていない
- 認証情報（トークン）が正しく共有されている

**確認項目**:
- [ ] すべてのクライアントが同一の Octokit インスタンスを使用している
- [ ] Octokit インスタンスが1つのみ作成されている
- [ ] 認証トークンが正しく設定されている

---

#### シナリオ 3: 後方互換性の検証

**目的**: 既存の呼び出し元が無変更で動作することを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- Octokit が適切にモック化されている

**テスト手順**:

1. **既存メソッドシグネチャの確認**
   - `GitHubClient.getIssue()` のシグネチャが変更されていないことを確認
   - `GitHubClient.createPullRequest()` のシグネチャが変更されていないことを確認
   - `GitHubClient.postWorkflowProgress()` のシグネチャが変更されていないことを確認
   - `GitHubClient.postReviewResult()` のシグネチャが変更されていないことを確認

2. **戻り値の型確認**
   - `GitHubClient.createPullRequest()` の戻り値が `PullRequestResult` 型であることを確認
   - `GitHubClient.createIssueFromEvaluation()` の戻り値が `IssueCreationResult` 型であることを確認
   - `GitHubClient.createOrUpdateProgressComment()` の戻り値が `ProgressCommentResult` 型であることを確認

3. **既存呼び出し元の動作確認**（モック環境）
   - `src/commands/init.ts` の `checkExistingPr()` 呼び出しが正常に動作することを確認
   - `src/commands/init.ts` の `createPullRequest()` 呼び出しが正常に動作することを確認
   - `src/phases/base-phase.ts` の `getIssueInfo()` 呼び出しが正常に動作することを確認
   - `src/phases/base-phase.ts` の `createOrUpdateProgressComment()` 呼び出しが正常に動作することを確認

**期待結果**:
- すべての既存メソッドシグネチャが変更されていない
- 戻り値の型が変更されていない
- 既存の呼び出し元が無変更で動作する

**確認項目**:
- [ ] `getIssue()` のシグネチャが変更されていない
- [ ] `createPullRequest()` のシグネチャが変更されていない
- [ ] `postWorkflowProgress()` のシグネチャが変更されていない
- [ ] `postReviewResult()` のシグネチャが変更されていない
- [ ] 戻り値の型が変更されていない
- [ ] `src/commands/init.ts` が無変更で動作する
- [ ] `src/phases/base-phase.ts` が無変更で動作する

---

#### シナリオ 4: エラーハンドリングの統合検証

**目的**: 各クライアントのエラーハンドリングがファサード経由で正しく動作することを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- Octokit が各種エラーを返すようモック化されている

**テスト手順**:

1. **401エラーのハンドリング**
   - Octokit が401エラーを返すよう設定
   - `GitHubClient.getIssue(24)` を呼び出す
   - エラーメッセージ「GitHub Token lacks required scope」が返されることを確認
   - 例外がスローされないことを確認

2. **422エラーのハンドリング（PR作成時）**
   - Octokit が422エラーを返すよう設定
   - `GitHubClient.createPullRequest('title', 'body', 'head')` を呼び出す
   - エラーメッセージ「A pull request already exists for this branch」が返されることを確認
   - `PullRequestResult` 型のオブジェクトが返されることを確認: `{ success: false, error: '...' }`

3. **RequestErrorのハンドリング**
   - Octokit がRequestError（status: 500）を返すよう設定
   - `GitHubClient.postComment(24, 'body')` を呼び出す
   - エラーメッセージ「GitHub API error: 500 - ...」形式で返されることを確認

**期待結果**:
- すべてのエラーが適切にハンドリングされる
- エラーメッセージが統一されている
- 例外がスローされない（Result型で返される）

**確認項目**:
- [ ] 401エラーが適切にハンドリングされる
- [ ] 422エラーが適切にハンドリングされる
- [ ] RequestErrorが適切にハンドリングされる
- [ ] エラーメッセージが統一形式である
- [ ] 例外がスローされない

---

### 2.2 既存コードとの統合テスト

**テストファイル**: `tests/integration/github-client-backward-compatibility.test.ts`

**目的**: 既存のコード（`init.ts`, `execute.ts`, `base-phase.ts`）との互換性を検証

---

#### シナリオ 5: init.ts との統合

**目的**: `src/commands/init.ts` が無変更で動作することを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- Octokit が適切にモック化されている

**テスト手順**:

1. **checkExistingPr() の呼び出し**
   - `src/commands/init.ts` の `checkExistingPr()` ロジックをシミュレート
   - `GitHubClient.checkExistingPr('feature/test', 'main')` を呼び出す
   - 既存PRが存在しない場合、`null` が返されることを確認

2. **createPullRequest() の呼び出し**
   - `src/commands/init.ts` の `createPullRequest()` ロジックをシミュレート
   - `GitHubClient.createPullRequest('title', 'body', 'feature/test', 'main', true)` を呼び出す
   - `PullRequestResult` 型のオブジェクトが返されることを確認

3. **generatePrBodyTemplate() の呼び出し**
   - `src/commands/init.ts` の `generatePrBodyTemplate()` ロジックをシミュレート
   - `GitHubClient.generatePrBodyTemplate(24, 'feature/test')` を呼び出す
   - PR本文テンプレートが返されることを確認

**期待結果**:
- `src/commands/init.ts` の既存ロジックが無変更で動作する
- 戻り値の型が変更されていない
- エラーが発生しない

**確認項目**:
- [ ] `checkExistingPr()` が正常に動作する
- [ ] `createPullRequest()` が正常に動作する
- [ ] `generatePrBodyTemplate()` が正常に動作する

---

#### シナリオ 6: base-phase.ts との統合

**目的**: `src/phases/base-phase.ts` が無変更で動作することを検証

**前提条件**:
- GitHubClient がインスタンス化されている
- Octokit が適切にモック化されている
- MetadataManager がモック化されている

**テスト手順**:

1. **getIssueInfo() の呼び出し**
   - `src/phases/base-phase.ts` の `getIssueInfo()` ロジックをシミュレート
   - `GitHubClient.getIssueInfo(24)` を呼び出す
   - `IssueInfo` 型のオブジェクトが返されることを確認

2. **postComment() の呼び出し**
   - `src/phases/base-phase.ts` の `postComment()` ロジックをシミュレート
   - `GitHubClient.postComment(24, 'コメント本文')` を呼び出す
   - コメントが正しく投稿されることを確認

3. **createOrUpdateProgressComment() の呼び出し**
   - `src/phases/base-phase.ts` の `createOrUpdateProgressComment()` ロジックをシミュレート
   - `GitHubClient.createOrUpdateProgressComment(24, '進捗コメント', metadataManager)` を呼び出す
   - `ProgressCommentResult` 型のオブジェクトが返されることを確認

**期待結果**:
- `src/phases/base-phase.ts` の既存ロジックが無変更で動作する
- 戻り値の型が変更されていない
- エラーが発生しない

**確認項目**:
- [ ] `getIssueInfo()` が正常に動作する
- [ ] `postComment()` が正常に動作する
- [ ] `createOrUpdateProgressComment()` が正常に動作する

---

## 3. テストデータ

### 3.1 正常データ

**Issue情報**:
```typescript
const mockIssue = {
  number: 24,
  title: '[REFACTOR] GitHub Client の機能別分割',
  body: `## 概要
\`github-client.ts\` (702行) を機能別に分割し、ファサードパターンで既存のインターフェースを維持しながら、各モジュールを200行以下に整理します。

## 目標
- 各モジュールを **200行以下** に削減
- GitHub API操作の責務を明確化
- 後方互換性の維持`,
  state: 'open',
  labels: [],
  html_url: 'https://github.com/owner/repo/issues/24',
  created_at: '2025-01-21T00:00:00Z',
  updated_at: '2025-01-21T12:00:00Z'
};
```

**PR情報**:
```typescript
const mockPullRequest = {
  number: 10,
  title: 'feat: GitHub Client の機能別分割',
  body: `## Summary
- IssueClient を作成
- PullRequestClient を作成
- CommentClient を作成
- ReviewClient を作成
- ファサードパターンで統合`,
  state: 'open',
  draft: true,
  html_url: 'https://github.com/owner/repo/pull/10',
  head: {
    ref: 'feature/issue-24-github-client-refactor'
  },
  base: {
    ref: 'main'
  }
};
```

**コメント情報**:
```typescript
const mockComment = {
  id: 123456,
  body: '## Phase 1: Requirements - 完了\n要件定義書を作成しました。',
  html_url: 'https://github.com/owner/repo/issues/24#issuecomment-123456',
  user: {
    login: 'ai-workflow-agent'
  },
  created_at: '2025-01-21T12:00:00Z',
  updated_at: '2025-01-21T12:00:00Z'
};
```

### 3.2 異常データ

**401エラー（認証失敗）**:
```typescript
const mock401Error = new RequestError('Unauthorized', 401, {
  request: {
    method: 'GET',
    url: 'https://api.github.com/repos/owner/repo/issues/24',
    headers: {}
  },
  response: {
    status: 401,
    url: 'https://api.github.com/repos/owner/repo/issues/24',
    headers: {},
    data: {
      message: 'Bad credentials'
    }
  }
});
```

**403エラー（権限不足）**:
```typescript
const mock403Error = new RequestError('Forbidden', 403, {
  request: {
    method: 'POST',
    url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
    headers: {}
  },
  response: {
    status: 403,
    url: 'https://api.github.com/repos/owner/repo/issues/24/comments',
    headers: {},
    data: {
      message: 'Resource not accessible by integration'
    }
  }
});
```

**422エラー（既存PR存在）**:
```typescript
const mock422Error = new RequestError('Validation Failed', 422, {
  request: {
    method: 'POST',
    url: 'https://api.github.com/repos/owner/repo/pulls',
    headers: {}
  },
  response: {
    status: 422,
    url: 'https://api.github.com/repos/owner/repo/pulls',
    headers: {},
    data: {
      message: 'Validation Failed',
      errors: [
        {
          resource: 'PullRequest',
          code: 'custom',
          message: 'A pull request already exists for owner:feature/test.'
        }
      ]
    }
  }
});
```

### 3.3 境界値データ

**Issue番号が0の場合**:
```typescript
const invalidIssueNumber = 0;
```

**コメント本文が空の場合**:
```typescript
const emptyCommentBody = '';
```

**残タスクが空配列の場合**:
```typescript
const emptyRemainingTasks: RemainingTask[] = [];
```

**サジェスションが空配列の場合**:
```typescript
const emptySuggestions: string[] = [];
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

**ローカル環境**:
- Node.js 20 以上
- npm 10 以上
- TypeScript 5.x
- Jest テストフレームワーク

**CI/CD環境**:
- GitHub Actions
- Jest テストランナー
- カバレッジレポートツール（istanbul/nyc）

### 4.2 必要な外部サービス・データベース

**外部サービス**:
- **GitHub REST API**: ユニットテストではモック化、統合テストでもモック化（実際のAPI呼び出しは行わない）
- **テスト用リポジトリ**: 不要（すべてモック環境で実施）

**データベース**:
- 不要（GitHub Clientはデータベースを使用しない）

### 4.3 モック/スタブの必要性

**モック化が必要なコンポーネント**:

1. **Octokit インスタンス**
   - `rest.issues.get()`, `rest.issues.createComment()`, `rest.issues.update()` などのメソッドをモック化
   - RequestError をスローする機能

2. **MetadataManager**
   - `getProgressCommentId()` をモック化（既存コメントIDを返す/nullを返す）
   - `setProgressCommentId()` をモック化（新規コメントIDを保存）

3. **各専門クライアント（統合テストで使用）**
   - IssueClient, PullRequestClient, CommentClient, ReviewClient をモック化
   - 各メソッドの呼び出しを追跡

**モックライブラリ**:
- Jest の組み込みモック機能（`jest.fn()`, `jest.spyOn()`）
- `@octokit/request-error` のモック（RequestErrorインスタンス作成用）

---

## 5. テストカバレッジ目標

### 5.1 ユニットテストカバレッジ

- **IssueClient**: 80%以上
- **PullRequestClient**: 80%以上
- **CommentClient**: 80%以上
- **ReviewClient**: 80%以上

### 5.2 統合テストカバレッジ

- **GitHubClient ファサード**: 100%（すべての委譲メソッドをカバー）
- **後方互換性テスト**: 100%（すべての既存メソッドをカバー）

### 5.3 全体カバレッジ

- **全体目標**: 85%以上

### 5.4 カバレッジ測定方法

```bash
npm run test:coverage
```

カバレッジレポートは `coverage/` ディレクトリに出力されます。

---

## 6. 品質ゲート（Phase 3）

テストシナリオは以下の品質ゲートを満たす必要があります：

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION に基づき、ユニットテストと統合テストを作成
- [x] **主要な正常系がカバーされている**: 各クライアントの主要メソッドの正常系テストケースを作成
- [x] **主要な異常系がカバーされている**: 401/403/422エラー、RequestErrorのテストケースを作成
- [x] **期待結果が明確である**: すべてのテストケースに具体的な期待結果を記載

---

## 7. テスト実行計画

### 7.1 ユニットテスト実行

**コマンド**:
```bash
npm run test:unit
```

**実行対象**:
- `tests/unit/github/issue-client.test.ts`
- `tests/unit/github/pull-request-client.test.ts`
- `tests/unit/github/comment-client.test.ts`
- `tests/unit/github/review-client.test.ts`

**実行タイミング**: Phase 5（テストコード実装）完了後

**成功基準**:
- すべてのユニットテストがパス
- カバレッジが80%以上

### 7.2 統合テスト実行

**コマンド**:
```bash
npm run test:integration
```

**実行対象**:
- `tests/integration/github-client-facade.test.ts`
- `tests/integration/github-client-backward-compatibility.test.ts`

**実行タイミング**: Phase 5（テストコード実装）完了後

**成功基準**:
- すべての統合テストがパス
- 後方互換性が保証される

### 7.3 全体テスト実行

**コマンド**:
```bash
npm run test
```

**実行対象**: すべてのテスト（ユニット + 統合）

**実行タイミング**: Phase 6（テスト実行）

**成功基準**:
- すべてのテストがパス
- 全体カバレッジが85%以上

---

## 8. リスクと軽減策

### リスク1: Octokitモック化の複雑性

**影響度**: 中
**確率**: 中

**リスク内容**:
- Octokitのモック化が複雑で、テストコード作成に時間がかかる可能性

**軽減策**:
- Jest の `jest.fn()` と `jest.spyOn()` を使用してシンプルなモックを作成
- テストケースごとにモックをリセット（`jest.clearAllMocks()`）
- 共通のモックヘルパー関数を作成し、再利用性を高める

### リスク2: テストカバレッジ不足

**影響度**: 中
**確率**: 低

**リスク内容**:
- テストカバレッジが目標（80%以上）に達しない

**軽減策**:
- Phase 5（テストコード実装）で定期的にカバレッジレポートを確認
- エラーハンドリング（401/403/422）の境界値テストを網羅
- 未カバーの分岐を特定し、追加テストケースを作成

### リスク3: 後方互換性テストの見落とし

**影響度**: 高
**確率**: 低

**リスク内容**:
- 既存の呼び出し元（`init.ts`, `execute.ts`, `base-phase.ts`）との互換性テストが不足し、後方互換性が破壊される

**軽減策**:
- Phase 3（テストシナリオ）で既存コードとの統合テストシナリオを明確化
- Phase 5（テストコード実装）で既存の呼び出し元をシミュレートしたテストを実施
- Phase 6（テスト実行）で既存のワークフロー全体を手動実行し、動作確認

---

## 9. 付録

### 9.1 用語集

| 用語 | 定義 |
|------|------|
| **ユニットテスト** | 各関数・メソッド単位の独立したテスト。外部依存をモック化し、境界値・正常系・異常系を検証する。 |
| **統合テスト** | 複数のコンポーネント間の連携を検証するテスト。ファサードパターンの統合動作や後方互換性を確認する。 |
| **モック化** | テスト対象の外部依存（Octokit, MetadataManager等）を偽のオブジェクトに置き換え、テストを独立させる手法。 |
| **RequestError** | Octokitが返すエラーオブジェクト。HTTPステータスコード（401/403/422等）を含む。 |
| **Result型** | 処理結果（成功/失敗）とエラーメッセージを含むオブジェクト型。例: `{ success: boolean, error?: string }` |

### 9.2 参考資料

- **Planning Document**: `.ai-workflow/issue-24/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-24/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-24/02_design/output/design.md`
- **Jest ドキュメント**: https://jestjs.io/docs/getting-started
- **Octokit ドキュメント**: https://octokit.github.io/rest.js/

### 9.3 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-21 | 1.0 | 初版作成 | AI Workflow Agent |

---

**承認**:

- [ ] プロダクトオーナー承認
- [ ] テックリード承認
- [ ] QAリード承認

**次フェーズ**: Phase 4 (Implementation) - 実装の開始

---

*本テストシナリオは、AI Workflow Phase 3 (Test Scenario) で自動生成されました。*
