# テストシナリオ: Issue #442

## pr-comment execute コマンドでエージェントログをファイルに保存すべき

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

| 項目 | 内容 |
|------|------|
| **テスト戦略** | UNIT_ONLY（ユニットテストのみ） |
| **テストコード戦略** | EXTEND_TEST（既存テストファイルを拡張） |
| **対象ファイル** | `tests/unit/pr-comment/comment-analyzer.test.ts` |

### 1.2 テスト対象の範囲

| 対象 | 説明 |
|------|------|
| **クラス** | `ReviewCommentAnalyzer` |
| **新規メソッド** | `saveAgentLog()` (private) |
| **変更メソッド** | `runAgent()` - `commentId` パラメータ追加、ログ保存処理追加 |
| **間接的変更** | `analyze()` - `runAgent()` 呼び出しの修正 |

### 1.3 テストの目的

1. **機能検証**: エージェント実行ログがファイルに正しく保存されること
2. **エラーハンドリング検証**: エージェント失敗時もログが保存されること
3. **信頼性検証**: ログ保存失敗が分析処理を阻害しないこと
4. **フォーマット検証**: `LogFormatter` が正しく呼び出されること

### 1.4 テスト戦略の判断根拠（Phase 2から引用）

- `ReviewCommentAnalyzer` クラスの内部ロジック変更のみ
- `LogFormatter` は既存でテスト済み（独立したユニットテストが存在）
- 外部システム連携（GitHub API等）への影響なし
- `runAgent()` メソッドの単体テストで十分カバー可能
- 既存テストファイル（`comment-analyzer.test.ts`）が存在し、パターンを踏襲可能

---

## 2. Unitテストシナリオ

### 2.1 LogFormatter インスタンスの初期化

#### TC-001: コンストラクタでLogFormatterが初期化される

| 項目 | 内容 |
|------|------|
| **目的** | `ReviewCommentAnalyzer` のコンストラクタで `LogFormatter` インスタンスが正しく初期化されることを検証 |
| **対応要件** | FR-005 |
| **前提条件** | なし |
| **入力** | `promptsDir = '/prompts'`, `outputDir = '/output'` |
| **期待結果** | インスタンスが正常に生成され、内部で `LogFormatter` が使用可能な状態になる |
| **検証方法** | インスタンス生成が例外をスローしないこと、後続の `analyze()` 呼び出しが動作すること |

```typescript
it('initializes LogFormatter in constructor', () => {
  const analyzer = new ReviewCommentAnalyzer('/prompts', '/output');
  expect(analyzer).toBeDefined();
  // LogFormatterはprivateなので直接検証できないが、
  // 後続テストでログ保存が動作することで間接的に検証
});
```

---

### 2.2 エージェント実行成功時のログ保存

#### TC-002: Codexエージェント成功時にログファイルが作成される

| 項目 | 内容 |
|------|------|
| **目的** | Codex Agent が正常に実行完了した場合、エージェントログがファイルに保存されることを検証 |
| **対応要件** | FR-001, AC-001 |
| **前提条件** | `ReviewCommentAnalyzer` が初期化済み、`outputDir` が存在する |
| **入力** | - `commentMeta.comment.id = 456`<br>- `context.repoPath = '/repo'`<br>- `agent` = Codex Agent モック（成功レスポンス返却） |
| **期待結果** | - `agent_log_comment_456.md` が作成される<br>- ログファイルに "Codex Agent" が含まれる<br>- 実行開始時刻・終了時刻が含まれる |
| **テストデータ** | 後述のテストデータセクション参照 |

```typescript
it('saves agent log on successful Codex Agent execution', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringContaining('agent_log_comment_456.md'),
    expect.stringContaining('Codex Agent'),
    'utf-8'
  );
});
```

#### TC-003: Claudeエージェント成功時にログファイルが作成される

| 項目 | 内容 |
|------|------|
| **目的** | Claude Agent が正常に実行完了した場合、エージェントログがファイルに保存されることを検証 |
| **対応要件** | FR-001, AC-001 |
| **前提条件** | `ReviewCommentAnalyzer` が初期化済み、`outputDir` が存在する |
| **入力** | - `commentMeta.comment.id = 789`<br>- `context.repoPath = '/repo'`<br>- `agent` = Claude Agent モック（成功レスポンス返却） |
| **期待結果** | - `agent_log_comment_789.md` が作成される<br>- ログファイルに "Claude Agent" が含まれる |
| **テストデータ** | 後述のテストデータセクション参照 |

```typescript
it('saves agent log on successful Claude Agent execution', async () => {
  const mockAgent = createMockClaudeAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'assistant',
    content: JSON.stringify({ type: 'code_change', confidence: 'medium', changes: [] })
  })]);

  await analyzer.analyze(commentMeta789, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringContaining('agent_log_comment_789.md'),
    expect.stringContaining('Claude Agent'),
    'utf-8'
  );
});
```

#### TC-004: ログファイルに実行時間情報が含まれる

| 項目 | 内容 |
|------|------|
| **目的** | 保存されたログファイルに実行時間（duration）、開始時刻、終了時刻が含まれることを検証 |
| **対応要件** | FR-001, AC-001 |
| **前提条件** | エージェント実行が成功する |
| **入力** | 標準的なコメントメタデータとエージェントモック |
| **期待結果** | ログファイルに「経過時間」「開始」「終了」の情報が含まれる |
| **テストデータ** | 後述のテストデータセクション参照 |

```typescript
it('includes execution timing information in log file', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  const writtenContent = writeFileSpy.mock.calls.find(
    call => String(call[0]).includes('agent_log_comment_')
  )?.[1] as string;

  expect(writtenContent).toContain('経過時間');
  expect(writtenContent).toContain('開始');
  expect(writtenContent).toContain('終了');
});
```

---

### 2.3 エージェント実行失敗時のログ保存

#### TC-005: エージェント実行エラー時にログファイルが作成される

| 項目 | 内容 |
|------|------|
| **目的** | エージェント実行がエラーで失敗した場合も、エラー情報を含むログが保存されることを検証 |
| **対応要件** | FR-002, AC-002 |
| **前提条件** | `ReviewCommentAnalyzer` が初期化済み |
| **入力** | - `commentMeta.comment.id = 789`<br>- `agent` = エラーをスローするモック |
| **期待結果** | - `agent_log_comment_789.md` が作成される<br>- ログファイルにエラー情報が含まれる<br>- `analyze()` は `success: false` を返す |
| **テストデータ** | `Error('Agent execution timeout')` |

```typescript
it('saves agent log on failed execution with error information', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockRejectedValue(new Error('Agent execution timeout'));

  const result = await analyzer.analyze(commentMeta789, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringContaining('agent_log_comment_789.md'),
    expect.stringContaining('Agent execution timeout'),
    'utf-8'
  );
  expect(result.success).toBe(false);
});
```

#### TC-006: エラー時もエージェント名が正しくログに記録される

| 項目 | 内容 |
|------|------|
| **目的** | エラー発生時も、どのエージェント（Codex/Claude）でエラーが発生したかがログに記録されることを検証 |
| **対応要件** | FR-002 |
| **前提条件** | Claude Agent でエラーが発生する |
| **入力** | - `agent` = Claude Agent モック（エラーをスロー） |
| **期待結果** | ログファイルに "Claude Agent" が含まれる |
| **テストデータ** | `Error('API rate limit exceeded')` |

```typescript
it('records correct agent name in error log', async () => {
  const mockAgent = createMockClaudeAgent();
  mockAgent.executeTask.mockRejectedValue(new Error('API rate limit exceeded'));

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  const writtenContent = writeFileSpy.mock.calls.find(
    call => String(call[0]).includes('agent_log_comment_')
  )?.[1] as string;

  expect(writtenContent).toContain('Claude Agent');
  expect(writtenContent).toContain('API rate limit exceeded');
});
```

---

### 2.4 ログ保存失敗時のエラーハンドリング

#### TC-007: ログ保存失敗時も分析処理は継続する

| 項目 | 内容 |
|------|------|
| **目的** | ログファイルの書き込みが失敗しても、コメント分析処理自体は正常に完了することを検証 |
| **対応要件** | NFR-002, AC-003 |
| **前提条件** | エージェント実行は成功するが、ファイル書き込みが失敗する |
| **入力** | - `agent` = 成功するモック<br>- `fs.writeFile` = ログファイル書き込み時にエラーをスロー |
| **期待結果** | - `analyze()` は `success: true` を返す<br>- 警告ログが出力される |
| **テストデータ** | `Error('Permission denied')` |

```typescript
it('continues analysis when log save fails', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  // ログファイル書き込みのみ失敗させる
  writeFileSpy.mockImplementation(async (filePath: string) => {
    if (filePath.includes('agent_log_comment_')) {
      throw new Error('Permission denied');
    }
    return undefined;
  });

  const result = await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(result.success).toBe(true);
});
```

#### TC-008: ログ保存失敗時に警告ログが出力される

| 項目 | 内容 |
|------|------|
| **目的** | ログ保存が失敗した場合、警告レベルのログが出力されることを検証 |
| **対応要件** | NFR-002, AC-003 |
| **前提条件** | ログファイル書き込みが失敗する |
| **入力** | - `fs.writeFile` = エラーをスロー |
| **期待結果** | `logger.warn()` が "Failed to save agent log" メッセージで呼び出される |
| **テストデータ** | `Error('Disk full')` |

```typescript
it('outputs warning log when log save fails', async () => {
  const warnSpy = jest.spyOn(logger, 'warn');
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  writeFileSpy.mockImplementation(async (filePath: string) => {
    if (filePath.includes('agent_log_comment_')) {
      throw new Error('Disk full');
    }
    return undefined;
  });

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('Failed to save agent log')
  );
});
```

---

### 2.5 ログファイルのフォーマット検証

#### TC-009: LogFormatter.formatAgentLog()が正しいパラメータで呼び出される

| 項目 | 内容 |
|------|------|
| **目的** | `LogFormatter.formatAgentLog()` が正しい引数（messages, startTime, endTime, duration, error, agentName）で呼び出されることを検証 |
| **対応要件** | FR-003, AC-004 |
| **前提条件** | エージェント実行が成功する |
| **入力** | 標準的なエージェントモック |
| **期待結果** | `formatAgentLog()` が6つの引数で呼び出される |
| **テストデータ** | 後述のテストデータセクション参照 |

```typescript
it('calls LogFormatter.formatAgentLog with correct parameters', async () => {
  const formatAgentLogSpy = jest.spyOn(LogFormatter.prototype, 'formatAgentLog');
  const mockAgent = createMockCodexAgent();
  const mockMessages = [JSON.stringify({ type: 'result', result: '{}' })];
  mockAgent.executeTask.mockResolvedValue(mockMessages);

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(formatAgentLogSpy).toHaveBeenCalledWith(
    mockMessages,              // messages
    expect.any(Number),        // startTime
    expect.any(Number),        // endTime
    expect.any(Number),        // duration
    null,                      // error (成功時はnull)
    'Codex Agent'             // agentName
  );
});
```

#### TC-010: 保存されたログファイルがMarkdown形式である

| 項目 | 内容 |
|------|------|
| **目的** | 保存されるログファイルが Markdown 形式で、`LogFormatter.formatAgentLog()` の出力と一致することを検証 |
| **対応要件** | FR-003, AC-004 |
| **前提条件** | エージェント実行が成功する |
| **入力** | 標準的なエージェントモック |
| **期待結果** | ログファイルにMarkdown見出し（`#`）が含まれる |
| **テストデータ** | 後述のテストデータセクション参照 |

```typescript
it('saves log file in Markdown format', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  const writtenContent = writeFileSpy.mock.calls.find(
    call => String(call[0]).includes('agent_log_comment_')
  )?.[1] as string;

  // Markdown形式の検証
  expect(writtenContent).toMatch(/^#/m);  // 見出しが含まれる
});
```

---

### 2.6 コメントID識別のテスト

#### TC-011: ログファイル名にコメントIDが含まれる

| 項目 | 内容 |
|------|------|
| **目的** | 生成されるログファイル名が `agent_log_comment_{commentId}.md` の形式であることを検証 |
| **対応要件** | FR-004, AC-005 |
| **前提条件** | エージェント実行が成功する |
| **入力** | `commentMeta.comment.id = 12345` |
| **期待結果** | `agent_log_comment_12345.md` というファイル名で保存される |
| **テストデータ** | `commentId = 12345` |

```typescript
it('includes comment ID in log file name', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  const commentMetaWithId = {
    ...commentMeta,
    comment: { ...commentMeta.comment, id: 12345 }
  };

  await analyzer.analyze(commentMetaWithId, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringMatching(/agent_log_comment_12345\.md$/),
    expect.any(String),
    'utf-8'
  );
});
```

#### TC-012: 複数コメント処理時に個別のログファイルが作成される

| 項目 | 内容 |
|------|------|
| **目的** | 複数のコメントを処理する際、各コメントごとに個別のログファイルが作成されることを検証 |
| **対応要件** | FR-004, AC-005 |
| **前提条件** | 複数のコメントを順次処理する |
| **入力** | - `commentId = 100`<br>- `commentId = 200`<br>- `commentId = 300` |
| **期待結果** | 3つのログファイルが作成される:<br>- `agent_log_comment_100.md`<br>- `agent_log_comment_200.md`<br>- `agent_log_comment_300.md` |
| **テストデータ** | コメントID 100, 200, 300 |

```typescript
it('creates separate log files for multiple comments', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: JSON.stringify({ type: 'reply', confidence: 'high', reply: 'OK' })
  })]);

  const commentIds = [100, 200, 300];

  for (const id of commentIds) {
    const meta = { ...commentMeta, comment: { ...commentMeta.comment, id } };
    await analyzer.analyze(meta, { repoPath: '/repo' }, mockAgent);
  }

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringMatching(/agent_log_comment_100\.md$/),
    expect.any(String),
    'utf-8'
  );
  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringMatching(/agent_log_comment_200\.md$/),
    expect.any(String),
    'utf-8'
  );
  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringMatching(/agent_log_comment_300\.md$/),
    expect.any(String),
    'utf-8'
  );
});
```

---

### 2.7 エージェントなしの場合のテスト

#### TC-013: エージェントがnullの場合、ログファイルは作成されない

| 項目 | 内容 |
|------|------|
| **目的** | エージェントが渡されない（null）場合、エージェントログファイルが作成されないことを検証 |
| **対応要件** | 既存動作の維持 |
| **前提条件** | `agent = null` |
| **入力** | `agent = null` |
| **期待結果** | `agent_log_comment_*.md` ファイルが作成されない |
| **テストデータ** | なし |

```typescript
it('does not create log file when agent is null', async () => {
  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, null);

  const logFileWriteCalls = writeFileSpy.mock.calls.filter(
    call => String(call[0]).includes('agent_log_comment_')
  );

  expect(logFileWriteCalls).toHaveLength(0);
});
```

---

### 2.8 境界値テスト

#### TC-014: 空のメッセージ配列でもログが保存される

| 項目 | 内容 |
|------|------|
| **目的** | エージェントが空のメッセージ配列を返した場合でも、ログファイルが作成されることを検証 |
| **対応要件** | FR-001（エッジケース） |
| **前提条件** | エージェントが空配列を返す |
| **入力** | `messages = []` |
| **期待結果** | ログファイルが作成される（内容は空または最小限） |
| **テストデータ** | 空配列 `[]` |

```typescript
it('saves log file even with empty messages array', async () => {
  const mockAgent = createMockCodexAgent();
  mockAgent.executeTask.mockResolvedValue([]);

  await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringContaining('agent_log_comment_'),
    expect.any(String),
    'utf-8'
  );
});
```

#### TC-015: 大きなメッセージでもログが正しく保存される

| 項目 | 内容 |
|------|------|
| **目的** | LogFormatter の 4000 文字切り詰め機能が動作することを確認（間接検証） |
| **対応要件** | FR-003 |
| **前提条件** | エージェントが大きなメッセージを返す |
| **入力** | 5000文字以上のメッセージ |
| **期待結果** | ログファイルが作成され、エラーなく処理完了 |
| **テストデータ** | `'x'.repeat(5000)` |

```typescript
it('handles large messages without error', async () => {
  const mockAgent = createMockCodexAgent();
  const largeContent = 'x'.repeat(5000);
  mockAgent.executeTask.mockResolvedValue([JSON.stringify({
    type: 'result',
    result: largeContent
  })]);

  const result = await analyzer.analyze(commentMeta, { repoPath: '/repo' }, mockAgent);

  expect(writeFileSpy).toHaveBeenCalledWith(
    expect.stringContaining('agent_log_comment_'),
    expect.any(String),
    'utf-8'
  );
  // 処理がエラーなく完了することを確認
  expect(result).toBeDefined();
});
```

---

## 3. テストデータ

### 3.1 コメントメタデータ

```typescript
// 標準テストデータ
const commentMeta: CommentMetadata = {
  comment: {
    id: 456,
    body: 'Please fix this issue',
    user: { login: 'reviewer' },
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    html_url: 'https://github.com/owner/repo/pull/1#discussion_r456',
  },
  status: 'pending',
  prNumber: 1,
  pullRequest: {
    number: 1,
    title: 'Test PR',
    body: 'Test description',
    head: { ref: 'feature-branch' },
    base: { ref: 'main' },
  },
};

// コメントID 789 用
const commentMeta789: CommentMetadata = {
  ...commentMeta,
  comment: { ...commentMeta.comment, id: 789 }
};
```

### 3.2 エージェントモック

```typescript
// Codex Agent モック作成関数
function createMockCodexAgent(): jest.Mocked<CodexAgentClient> {
  return {
    executeTask: jest.fn(),
  } as unknown as jest.Mocked<CodexAgentClient>;
}

// Claude Agent モック作成関数
function createMockClaudeAgent(): jest.Mocked<ClaudeAgentClient> {
  return {
    executeTask: jest.fn(),
  } as unknown as jest.Mocked<ClaudeAgentClient>;
}
```

### 3.3 エージェントレスポンス

```typescript
// Codex Agent 成功レスポンス
const codexSuccessResponse = [JSON.stringify({
  type: 'result',
  result: JSON.stringify({
    type: 'reply',
    confidence: 'high',
    reply: 'Thank you for the feedback!'
  })
})];

// Claude Agent 成功レスポンス
const claudeSuccessResponse = [JSON.stringify({
  type: 'assistant',
  content: JSON.stringify({
    type: 'code_change',
    confidence: 'medium',
    changes: [{ file: 'test.ts', diff: '+// fix' }]
  })
})];

// エラーレスポンス
const agentTimeoutError = new Error('Agent execution timeout');
const apiRateLimitError = new Error('API rate limit exceeded');
const diskFullError = new Error('Disk full');
const permissionDeniedError = new Error('Permission denied');
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

| 項目 | 要件 |
|------|------|
| **ランタイム** | Node.js v18.x 以上 |
| **テストフレームワーク** | Jest |
| **実行環境** | ローカル / CI (GitHub Actions) |

### 4.2 必要なモック・スタブ

| 対象 | モック方法 |
|------|-----------|
| `fs.writeFile` | `jest.spyOn(fsp, 'writeFile')` |
| `fs.ensureDir` | `jest.spyOn(fs, 'ensureDir')` |
| `fs.readFile` | `jest.spyOn(fs, 'readFile')` |
| `CodexAgentClient` | 手動モック（`executeTask` メソッド） |
| `ClaudeAgentClient` | 手動モック（`executeTask` メソッド） |
| `logger` | `jest.spyOn(logger, 'warn')` / `jest.spyOn(logger, 'debug')` |
| `LogFormatter.formatAgentLog` | `jest.spyOn(LogFormatter.prototype, 'formatAgentLog')` |

### 4.3 セットアップ・クリーンアップ

```typescript
describe('ReviewCommentAnalyzer agent logging', () => {
  let analyzer: ReviewCommentAnalyzer;
  let writeFileSpy: jest.SpiedFunction<typeof fsp.writeFile>;
  let readFileSpy: jest.SpiedFunction<typeof fs.readFile>;

  beforeEach(() => {
    // 初期化
    analyzer = new ReviewCommentAnalyzer('/prompts', '/output');

    // ファイルシステムモック
    jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);
    readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue('prompt template');
  });

  afterEach(() => {
    // クリーンアップ
    jest.restoreAllMocks();
  });

  // テストケース...
});
```

---

## 5. テストカバレッジ目標

### 5.1 コードカバレッジ

| メトリクス | 目標 |
|-----------|------|
| 行カバレッジ (Line) | 80% 以上 |
| 分岐カバレッジ (Branch) | 80% 以上 |
| 関数カバレッジ (Function) | 100% |

### 5.2 カバレッジ対象

| 対象 | カバレッジ |
|------|-----------|
| `saveAgentLog()` | 100%（正常系 + 異常系） |
| `runAgent()` のログ保存部分 | 100%（成功時 + 失敗時） |

---

## 6. 要件トレーサビリティ

### 6.1 機能要件 → テストケース対応表

| 要件ID | 要件概要 | テストケース |
|--------|---------|-------------|
| FR-001 | エージェント実行成功時のログ保存 | TC-002, TC-003, TC-004 |
| FR-002 | エージェント実行失敗時のログ保存 | TC-005, TC-006 |
| FR-003 | ログファイルのフォーマット | TC-009, TC-010 |
| FR-004 | コメントIDの識別 | TC-011, TC-012 |
| FR-005 | LogFormatterインスタンスの初期化 | TC-001 |
| FR-006 | runAgent()メソッドのシグネチャ変更 | TC-002〜TC-012（間接検証） |

### 6.2 非機能要件 → テストケース対応表

| 要件ID | 要件概要 | テストケース |
|--------|---------|-------------|
| NFR-002 | 信頼性（ログ保存失敗時の挙動） | TC-007, TC-008 |
| NFR-004 | テスト容易性 | 全テストケース |

### 6.3 受け入れ基準 → テストケース対応表

| 受け入れ基準 | テストケース |
|-------------|-------------|
| AC-001 | TC-002, TC-003, TC-004 |
| AC-002 | TC-005, TC-006 |
| AC-003 | TC-007, TC-008 |
| AC-004 | TC-009, TC-010 |
| AC-005 | TC-011, TC-012 |
| AC-006 | TC-001 |

---

## 7. 品質ゲートチェックリスト（Phase 3）

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_ONLY 戦略に準拠（Integration/BDDシナリオなし）
- [x] **主要な正常系がカバーされている**: TC-001〜TC-004, TC-011, TC-012
- [x] **主要な異常系がカバーされている**: TC-005〜TC-008
- [x] **期待結果が明確である**: 各テストケースに具体的な期待結果を記載

---

## 8. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | - | 初版作成 |
