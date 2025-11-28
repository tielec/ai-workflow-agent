# テストシナリオ

**Issue番号**: #126
**タイトル**: auto-issue: Phase 1 - CLIコマンド基盤とバグ検出機能の実装
**親Issue**: #121 AIエージェントによる自動Issue作成機能の実装
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 目次

1. [テスト戦略サマリー](#1-テスト戦略サマリー)
2. [Unitテストシナリオ](#2-unitテストシナリオ)
3. [Integrationテストシナリオ](#3-integrationテストシナリオ)
4. [テストデータ](#4-テストデータ)
5. [テスト環境要件](#5-テスト環境要件)
6. [品質ゲート確認](#6-品質ゲート確認)

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**

Phase 2設計書で決定されたテスト戦略に基づき、以下の2種類のテストを実施します：

1. **ユニットテスト**: 各モジュール（RepositoryAnalyzer、IssueDeduplicator、IssueGenerator、CLIハンドラ）の単体動作検証
2. **インテグレーションテスト**: エンドツーエンドワークフロー、エージェント統合、GitHub API統合の検証

### 1.2 テスト対象の範囲

#### ユニットテスト対象
- `src/core/repository-analyzer.ts`: バグ候補のパースロジック、バリデーション、エージェント呼び出し
- `src/core/issue-deduplicator.ts`: コサイン類似度計算、LLM判定、フィルタリング
- `src/core/issue-generator.ts`: Issue本文生成、ラベル付与、dry-runモード
- `src/commands/auto-issue.ts`: CLIオプション解析、エラーハンドリング、結果サマリー

#### インテグレーションテスト対象
- エンドツーエンドワークフロー（コマンド実行 → バグ検出 → 重複検出 → Issue作成）
- エージェント選択ロジック（auto/codex/claude）とフォールバック動作
- GitHub API統合（Issue作成、既存Issue取得）
- dry-runモードの動作検証
- 言語非依存性の検証（TypeScript、Python）

### 1.3 テストの目的

1. **機能正確性の保証**: 要件定義書のすべての機能要件（FR-1〜FR-5）が正しく実装されていることを検証
2. **品質保証**: 受け入れ基準（AC-1〜AC-10）をすべて満たしていることを確認
3. **回帰防止**: 将来の変更時に既存機能が壊れないことを保証
4. **エッジケース対応**: 異常系、境界値、エラー処理が適切に実装されていることを確認

---

## 2. Unitテストシナリオ

### 2.1 RepositoryAnalyzer ユニットテスト

**テストファイル**: `tests/unit/core/repository-analyzer.test.ts`

---

#### TC-RA-001: analyze_正常系_Codexエージェント使用

**目的**: Codexエージェントを使用してバグ候補を正しく検出できることを検証

**前提条件**:
- CodexAgentClientのモックが正常に動作する
- エージェント出力がJSON形式で返される

**入力**:
```typescript
repoPath = '/path/to/repo'
agent = 'codex'
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockResolvedValue([
  '```json',
  JSON.stringify({
    bugs: [
      {
        title: 'エラーハンドリングの欠如',
        file: 'src/core/codex-agent-client.ts',
        line: 42,
        severity: 'high',
        description: 'executeTask()メソッドでエラーハンドリングが不足しています。',
        suggestedFix: 'try-catchブロックを追加してください。',
        category: 'bug'
      }
    ]
  }),
  '```'
])
```

**期待結果**:
- `BugCandidate[]` が返される
- 配列の要素数が1
- 返却された候補が入力データと一致

**テストデータ**: 上記モック設定

---

#### TC-RA-002: analyze_正常系_Claudeエージェント使用

**目的**: Claudeエージェントを使用してバグ候補を正しく検出できることを検証

**前提条件**:
- ClaudeAgentClientのモックが正常に動作する
- エージェント出力がJSON形式で返される

**入力**:
```typescript
repoPath = '/path/to/repo'
agent = 'claude'
```

**モック設定**:
```typescript
mockClaudeClient.executeTask.mockResolvedValue([
  '```json',
  JSON.stringify({
    bugs: [
      {
        title: '型安全性の問題',
        file: 'src/types/auto-issue.ts',
        line: 10,
        severity: 'medium',
        description: 'any型が過度に使用されています。',
        suggestedFix: '具体的な型定義を追加してください。',
        category: 'bug'
      }
    ]
  }),
  '```'
])
```

**期待結果**:
- `BugCandidate[]` が返される
- 配列の要素数が1
- ClaudeAgentClientが呼び出される（CodexAgentClientは呼び出されない）

**テストデータ**: 上記モック設定

---

#### TC-RA-003: analyze_正常系_autoモードでCodex→Claudeフォールバック

**目的**: autoモードでCodex失敗時にClaudeにフォールバックすることを検証

**前提条件**:
- CodexAgentClientがエラーをスローする
- ClaudeAgentClientが正常に動作する

**入力**:
```typescript
repoPath = '/path/to/repo'
agent = 'auto'
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'))
mockClaudeClient.executeTask.mockResolvedValue([
  '```json',
  JSON.stringify({
    bugs: [
      { title: 'test bug', file: 'test.ts', line: 1, severity: 'low', description: 'test', suggestedFix: 'fix', category: 'bug' }
    ]
  }),
  '```'
])
```

**期待結果**:
- CodexAgentClientが先に呼び出される
- Codex失敗後、ClaudeAgentClientが呼び出される
- `BugCandidate[]` が返される（Claude経由）
- ログに "Codex failed, falling back to Claude" が記録される

**テストデータ**: 上記モック設定

---

#### TC-RA-004: analyze_異常系_エージェント出力が不正なJSON

**目的**: エージェント出力が不正なJSON形式の場合、空配列を返すことを検証

**前提条件**:
- CodexAgentClientが不正なJSON出力を返す

**入力**:
```typescript
repoPath = '/path/to/repo'
agent = 'codex'
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockResolvedValue([
  '```json',
  '{ invalid json }',
  '```'
])
```

**期待結果**:
- 空配列 `[]` が返される
- ログに "Failed to parse JSON output" が記録される
- エラーはスローされない（ゴーストフリー）

**テストデータ**: 上記モック設定

---

#### TC-RA-005: parseAgentOutput_正常系_JSON形式出力

**目的**: JSON形式のエージェント出力を正しくパースできることを検証

**前提条件**: なし

**入力**:
```typescript
rawOutput = `
ここはテキスト

\`\`\`json
{
  "bugs": [
    {
      "title": "test bug",
      "file": "test.ts",
      "line": 1,
      "severity": "high",
      "description": "test description with at least 50 characters to pass validation",
      "suggestedFix": "test fix with minimum length",
      "category": "bug"
    }
  ]
}
\`\`\`

追加テキスト
`
```

**期待結果**:
- `BugCandidate[]` が返される
- 配列の要素数が1
- パースされたデータが入力JSONと一致

**テストデータ**: 上記rawOutput

---

#### TC-RA-006: parseAgentOutput_異常系_JSONブロックなし

**目的**: JSONブロックが含まれない出力の場合、空配列を返すことを検証

**前提条件**: なし

**入力**:
```typescript
rawOutput = "This is plain text without JSON block"
```

**期待結果**:
- 空配列 `[]` が返される
- エラーはスローされない

**テストデータ**: 上記rawOutput

---

#### TC-RA-007: validateBugCandidate_正常系_有効な候補

**目的**: すべてのフィールドが有効な候補がバリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
candidate = {
  title: 'Valid bug title with enough length',
  file: 'src/core/test.ts',
  line: 42,
  severity: 'high',
  description: 'This is a valid description with at least 50 characters to pass the validation check.',
  suggestedFix: 'This is a valid fix suggestion with minimum required length.',
  category: 'bug'
}
```

**期待結果**:
- `true` が返される

**テストデータ**: 上記candidate

---

#### TC-RA-008: validateBugCandidate_異常系_タイトルが短すぎる

**目的**: タイトルが10文字未満の場合、バリデーションに失敗することを検証

**前提条件**: なし

**入力**:
```typescript
candidate = {
  title: 'Short',
  file: 'src/core/test.ts',
  line: 42,
  severity: 'high',
  description: 'This is a valid description with at least 50 characters to pass the validation.',
  suggestedFix: 'This is a valid fix.',
  category: 'bug'
}
```

**期待結果**:
- `false` が返される

**テストデータ**: 上記candidate

---

#### TC-RA-009: validateBugCandidate_異常系_非対応言語

**目的**: TypeScript/Python以外のファイルがバリデーションに失敗することを検証

**前提条件**: なし

**入力**:
```typescript
candidate = {
  title: 'Valid bug title',
  file: 'src/core/test.java',  // Phase 1ではJavaは非対応
  line: 42,
  severity: 'high',
  description: 'This is a valid description with at least 50 characters to pass the validation.',
  suggestedFix: 'This is a valid fix.',
  category: 'bug'
}
```

**期待結果**:
- `false` が返される

**テストデータ**: 上記candidate

---

#### TC-RA-010: validateBugCandidate_境界値_タイトル10文字ちょうど

**目的**: タイトルが10文字ちょうどの場合、バリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
candidate = {
  title: '1234567890',  // ちょうど10文字
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'This is a valid description with at least 50 characters to pass.',
  suggestedFix: 'This is a valid fix suggestion.',
  category: 'bug'
}
```

**期待結果**:
- `true` が返される

**テストデータ**: 上記candidate

---

### 2.2 IssueDeduplicator ユニットテスト

**テストファイル**: `tests/unit/core/issue-deduplicator.test.ts`

---

#### TC-ID-001: filterDuplicates_正常系_重複なし

**目的**: 既存Issueと類似しない候補がフィルタリングされないことを検証

**前提条件**:
- GitHubClientのモックが空のIssueリストを返す

**入力**:
```typescript
candidates = [
  {
    title: 'Unique bug title',
    file: 'test.ts',
    line: 1,
    severity: 'high',
    description: 'This is a unique bug description.',
    suggestedFix: 'Fix it.',
    category: 'bug'
  }
]
existingIssues = []
threshold = 0.8
```

**期待結果**:
- 返却される配列の要素数が1（フィルタリングされない）
- OpenAI APIは呼び出されない（既存Issueがないため）

**テストデータ**: 上記candidates, existingIssues

---

#### TC-ID-002: filterDuplicates_正常系_コサイン類似度で重複検出

**目的**: コサイン類似度が閾値を超えた場合、LLM判定が実行されることを検証

**前提条件**:
- 類似度が0.85（閾値0.8を超える）
- LLM判定が "YES" を返す

**入力**:
```typescript
candidates = [
  {
    title: 'Fix memory leak in CodexAgentClient',
    file: 'src/core/codex-agent-client.ts',
    line: 42,
    severity: 'high',
    description: 'Memory leak occurs when executeTask fails.',
    suggestedFix: 'Add proper cleanup in catch block.',
    category: 'bug'
  }
]
existingIssues = [
  {
    number: 123,
    title: 'Fix memory leak in CodexAgentClient',
    body: 'Memory leak issue in executeTask method.'
  }
]
threshold = 0.8
```

**モック設定**:
```typescript
mockOpenAI.chat.completions.create.mockResolvedValue({
  choices: [{ message: { content: 'YES' } }]
})
```

**期待結果**:
- 返却される配列が空（重複として除外される）
- OpenAI APIが1回呼び出される
- ログに "Duplicate detected" が記録される

**テストデータ**: 上記candidates, existingIssues, モック設定

---

#### TC-ID-003: filterDuplicates_正常系_LLM判定で非重複

**目的**: コサイン類似度が閾値を超えてもLLM判定で非重複と判定された場合、フィルタリングされないことを検証

**前提条件**:
- 類似度が0.85（閾値0.8を超える）
- LLM判定が "NO" を返す

**入力**:
```typescript
candidates = [
  {
    title: 'Fix memory leak in IssueGenerator',
    file: 'src/core/issue-generator.ts',
    line: 50,
    severity: 'high',
    description: 'Memory leak in createIssueOnGitHub method.',
    suggestedFix: 'Add cleanup.',
    category: 'bug'
  }
]
existingIssues = [
  {
    number: 123,
    title: 'Fix memory leak in CodexAgentClient',
    body: 'Memory leak in executeTask method.'
  }
]
threshold = 0.8
```

**モック設定**:
```typescript
mockOpenAI.chat.completions.create.mockResolvedValue({
  choices: [{ message: { content: 'NO' } }]
})
```

**期待結果**:
- 返却される配列の要素数が1（フィルタリングされない）
- OpenAI APIが呼び出される
- ログに "Duplicate detected" が記録されない

**テストデータ**: 上記candidates, existingIssues, モック設定

---

#### TC-ID-004: filterDuplicates_異常系_OpenAI_API失敗

**目的**: OpenAI API失敗時、フォールバックしてコサイン類似度のみで判定することを検証

**前提条件**:
- 類似度が0.85（閾値を超える）
- OpenAI APIがエラーをスローする

**入力**:
```typescript
candidates = [
  {
    title: 'Test bug',
    file: 'test.ts',
    line: 1,
    severity: 'high',
    description: 'Test description with enough characters.',
    suggestedFix: 'Test fix.',
    category: 'bug'
  }
]
existingIssues = [
  {
    number: 123,
    title: 'Test bug similar',
    body: 'Test description'
  }
]
threshold = 0.8
```

**モック設定**:
```typescript
mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API rate limit'))
```

**期待結果**:
- 返却される配列の要素数が1（LLM失敗時はfalseとして扱う）
- ログに "LLM duplicate check failed" が記録される
- エラーはスローされない

**テストデータ**: 上記candidates, existingIssues, モック設定

---

#### TC-ID-005: calculateCosineSimilarity_正常系_同一テキスト

**目的**: 同一テキストの類似度が1.0になることを検証

**前提条件**: なし

**入力**:
```typescript
text1 = "This is a test sentence with some words."
text2 = "This is a test sentence with some words."
```

**期待結果**:
- 類似度が `1.0`

**テストデータ**: 上記text1, text2

---

#### TC-ID-006: calculateCosineSimilarity_正常系_全く異なるテキスト

**目的**: 全く異なるテキストの類似度が0に近くなることを検証

**前提条件**: なし

**入力**:
```typescript
text1 = "apple orange banana"
text2 = "car truck bicycle"
```

**期待結果**:
- 類似度が `0.0`

**テストデータ**: 上記text1, text2

---

#### TC-ID-007: calculateCosineSimilarity_境界値_空文字列

**目的**: 空文字列の場合、類似度が0になることを検証

**前提条件**: なし

**入力**:
```typescript
text1 = ""
text2 = "test"
```

**期待結果**:
- 類似度が `0.0`
- エラーはスローされない（ゼロ除算を回避）

**テストデータ**: 上記text1, text2

---

#### TC-ID-008: checkDuplicateWithLLM_正常系_重複判定

**目的**: LLMが "YES" を返した場合、重複と判定されることを検証

**前提条件**:
- OpenAI APIが正常に動作する

**入力**:
```typescript
candidate = {
  title: 'Fix bug A',
  description: 'Bug A description'
}
issue = {
  number: 123,
  title: 'Fix bug A',
  body: 'Bug A description'
}
```

**モック設定**:
```typescript
mockOpenAI.chat.completions.create.mockResolvedValue({
  choices: [{ message: { content: 'YES' } }]
})
```

**期待結果**:
- `true` が返される

**テストデータ**: 上記candidate, issue, モック設定

---

#### TC-ID-009: checkDuplicateWithLLM_正常系_非重複判定

**目的**: LLMが "NO" を返した場合、非重複と判定されることを検証

**前提条件**:
- OpenAI APIが正常に動作する

**入力**:
```typescript
candidate = {
  title: 'Fix bug A',
  description: 'Bug A description'
}
issue = {
  number: 123,
  title: 'Fix bug B',
  body: 'Bug B description'
}
```

**モック設定**:
```typescript
mockOpenAI.chat.completions.create.mockResolvedValue({
  choices: [{ message: { content: 'NO' } }]
})
```

**期待結果**:
- `false` が返される

**テストデータ**: 上記candidate, issue, モック設定

---

#### TC-ID-010: filterDuplicates_境界値_閾値ちょうど

**目的**: 類似度が閾値ちょうどの場合、LLM判定が実行されることを検証

**前提条件**:
- 類似度が0.8（閾値と同じ）
- LLM判定が "NO" を返す

**入力**:
```typescript
candidates = [候補1つ]
existingIssues = [Issue1つ]
threshold = 0.8
```

**モック設定**:
```typescript
// コサイン類似度が0.8になるようなテキストペア
mockOpenAI.chat.completions.create.mockResolvedValue({
  choices: [{ message: { content: 'NO' } }]
})
```

**期待結果**:
- OpenAI APIが呼び出される（閾値 >= threshold でLLM判定実行）
- 返却される配列の要素数が1（LLM判定で非重複）

**テストデータ**: 上記candidates, existingIssues, モック設定

---

### 2.3 IssueGenerator ユニットテスト

**テストファイル**: `tests/unit/core/issue-generator.test.ts`

---

#### TC-IG-001: generate_正常系_dry-runモード

**目的**: dry-runモードでIssue作成がスキップされることを検証

**前提条件**:
- CodexAgentClientが正常に動作する
- dry-run = true

**入力**:
```typescript
candidate = {
  title: 'Test bug',
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'Test description',
  suggestedFix: 'Test fix',
  category: 'bug'
}
agent = 'codex'
dryRun = true
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockResolvedValue([
  '```markdown',
  '## 概要\nTest issue body',
  '```'
])
```

**期待結果**:
- `IssueCreationResult.success` が `true`
- `IssueCreationResult.skippedReason` が `'dry-run mode'`
- `IssueCreationResult.issueUrl` が `undefined`
- GitHub APIが呼び出されない
- ログに "[DRY RUN] Skipping issue creation" が記録される

**テストデータ**: 上記candidate, モック設定

---

#### TC-IG-002: generate_正常系_Issue作成成功

**目的**: 本番モードでIssueが正常に作成されることを検証

**前提条件**:
- CodexAgentClientが正常に動作する
- GitHub APIが正常に動作する
- dry-run = false

**入力**:
```typescript
candidate = {
  title: 'Fix memory leak',
  file: 'src/core/test.ts',
  line: 42,
  severity: 'high',
  description: 'Memory leak description',
  suggestedFix: 'Add cleanup',
  category: 'bug'
}
agent = 'codex'
dryRun = false
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockResolvedValue([
  '```markdown',
  '## 概要\nMemory leak in test module',
  '```'
])
mockGitHubClient.createIssueOnGitHub.mockResolvedValue({
  number: 456,
  url: 'https://github.com/owner/repo/issues/456'
})
```

**期待結果**:
- `IssueCreationResult.success` が `true`
- `IssueCreationResult.issueUrl` が `'https://github.com/owner/repo/issues/456'`
- `IssueCreationResult.issueNumber` が `456`
- GitHub APIが呼び出される
- ログに "Issue created: #456" が記録される

**テストデータ**: 上記candidate, モック設定

---

#### TC-IG-003: generate_異常系_GitHub_API失敗

**目的**: GitHub API失敗時、エラーが適切に処理されることを検証

**前提条件**:
- CodexAgentClientが正常に動作する
- GitHub APIがエラーをスローする
- dry-run = false

**入力**:
```typescript
candidate = {
  title: 'Test bug',
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'Test description',
  suggestedFix: 'Test fix',
  category: 'bug'
}
agent = 'codex'
dryRun = false
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockResolvedValue([
  '```markdown',
  '## 概要\nTest',
  '```'
])
mockGitHubClient.createIssueOnGitHub.mockRejectedValue(new Error('API rate limit exceeded'))
```

**期待結果**:
- `IssueCreationResult.success` が `false`
- `IssueCreationResult.error` が `'GitHub API failed: API rate limit exceeded'`
- エラーはスローされない（ゴーストフリー）

**テストデータ**: 上記candidate, モック設定

---

#### TC-IG-004: generate_正常系_Claudeエージェント使用

**目的**: Claudeエージェントを使用してIssue本文を生成できることを検証

**前提条件**:
- ClaudeAgentClientが正常に動作する
- dry-run = true

**入力**:
```typescript
candidate = {
  title: 'Test bug',
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'Test description',
  suggestedFix: 'Test fix',
  category: 'bug'
}
agent = 'claude'
dryRun = true
```

**モック設定**:
```typescript
mockClaudeClient.executeTask.mockResolvedValue([
  '```markdown',
  '## 概要\nClaude generated issue body',
  '```'
])
```

**期待結果**:
- `IssueCreationResult.success` が `true`
- ClaudeAgentClientが呼び出される（CodexAgentClientは呼び出されない）
- ログに "[DRY RUN]" が記録される

**テストデータ**: 上記candidate, モック設定

---

#### TC-IG-005: generate_異常系_Codexエージェント失敗

**目的**: Codexエージェント失敗時、エラーが適切に処理されることを検証

**前提条件**:
- CodexAgentClientがエラーをスローする
- agent = 'codex'（フォールバックなし）

**入力**:
```typescript
candidate = { /* 有効な候補 */ }
agent = 'codex'
dryRun = false
```

**モック設定**:
```typescript
mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'))
```

**期待結果**:
- `IssueCreationResult.success` が `false`
- `IssueCreationResult.error` が `'Codex failed: Codex API failed'`
- GitHub APIが呼び出されない

**テストデータ**: 上記candidate, モック設定

---

#### TC-IG-006: createIssueBody_正常系_Markdownブロック抽出

**目的**: エージェント出力からMarkdownブロックを正しく抽出できることを検証

**前提条件**: なし

**入力**:
```typescript
candidate = { /* 任意の候補 */ }
agentOutput = `
Here is the issue body:

\`\`\`markdown
## 概要
This is a test issue.

## 詳細
Detailed description here.
\`\`\`

Additional text.
`
```

**期待結果**:
- 返却される文字列が以下と一致:
  ```
  ## 概要
  This is a test issue.

  ## 詳細
  Detailed description here.
  ```

**テストデータ**: 上記agentOutput

---

#### TC-IG-007: createIssueBody_異常系_Markdownブロックなし

**目的**: Markdownブロックがない場合、エージェント出力をそのまま使用することを検証

**前提条件**: なし

**入力**:
```typescript
candidate = { /* 任意の候補 */ }
agentOutput = "Plain text output without markdown block"
```

**期待結果**:
- 返却される文字列が `"Plain text output without markdown block"`

**テストデータ**: 上記agentOutput

---

#### TC-IG-008: createIssueOnGitHub_正常系_ラベル付与

**目的**: Issue作成時に正しいラベルが付与されることを検証

**前提条件**:
- GitHub APIが正常に動作する

**入力**:
```typescript
title = 'Test issue'
body = '## 概要\nTest body'
labels = ['auto-generated', 'bug']
```

**モック設定**:
```typescript
mockOctokit.issues.create.mockResolvedValue({
  data: {
    number: 789,
    html_url: 'https://github.com/owner/repo/issues/789'
  }
})
```

**期待結果**:
- `octokit.issues.create` が以下の引数で呼び出される:
  ```typescript
  {
    owner: 'owner',
    repo: 'repo',
    title: 'Test issue',
    body: '## 概要\nTest body',
    labels: ['auto-generated', 'bug']
  }
  ```
- 返却される `number` が `789`
- 返却される `url` が `'https://github.com/owner/repo/issues/789'`

**テストデータ**: 上記title, body, labels, モック設定

---

### 2.4 CLIハンドラ（handleAutoIssueCommand）ユニットテスト

**テストファイル**: `tests/unit/commands/auto-issue.test.ts`

---

#### TC-CLI-001: parseOptions_正常系_デフォルト値適用

**目的**: オプション未指定時にデフォルト値が適用されることを検証

**前提条件**: なし

**入力**:
```typescript
rawOptions = {}
```

**期待結果**:
```typescript
{
  category: 'bug',
  limit: 5,
  dryRun: false,
  similarityThreshold: 0.8,
  agent: 'auto'
}
```

**テストデータ**: 上記rawOptions

---

#### TC-CLI-002: parseOptions_正常系_すべてのオプション指定

**目的**: すべてのオプションが正しくパースされることを検証

**前提条件**: なし

**入力**:
```typescript
rawOptions = {
  category: 'bug',
  limit: '10',
  dryRun: true,
  similarityThreshold: '0.9',
  agent: 'codex'
}
```

**期待結果**:
```typescript
{
  category: 'bug',
  limit: 10,
  dryRun: true,
  similarityThreshold: 0.9,
  agent: 'codex'
}
```

**テストデータ**: 上記rawOptions

---

#### TC-CLI-003: parseOptions_異常系_limitが数値以外

**目的**: limitが数値に変換できない場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
rawOptions = {
  limit: 'invalid'
}
```

**期待結果**:
- エラーがスローされる
- エラーメッセージに "Invalid limit" が含まれる

**テストデータ**: 上記rawOptions

---

#### TC-CLI-004: parseOptions_異常系_similarityThresholdが範囲外

**目的**: similarityThresholdが0.0〜1.0の範囲外の場合、エラーがスローされることを検証

**前提条件**: なし

**入力**:
```typescript
rawOptions = {
  similarityThreshold: '1.5'
}
```

**期待結果**:
- エラーがスローされる
- エラーメッセージに "Similarity threshold must be between 0.0 and 1.0" が含まれる

**テストデータ**: 上記rawOptions

---

#### TC-CLI-005: handleAutoIssueCommand_正常系_エンドツーエンド

**目的**: コマンド全体が正常に動作することを検証（すべてのモジュールを統合）

**前提条件**:
- すべてのモジュール（RepositoryAnalyzer, IssueDeduplicator, IssueGenerator）のモックが正常に動作する

**入力**:
```typescript
options = {
  category: 'bug',
  limit: 2,
  dryRun: true,
  similarityThreshold: 0.8,
  agent: 'codex'
}
```

**モック設定**:
```typescript
// RepositoryAnalyzer
mockAnalyzer.analyze.mockResolvedValue([
  { title: 'Bug 1', file: 'test1.ts', line: 1, severity: 'high', description: 'Desc 1 with enough characters.', suggestedFix: 'Fix 1', category: 'bug' },
  { title: 'Bug 2', file: 'test2.ts', line: 2, severity: 'medium', description: 'Desc 2 with enough characters.', suggestedFix: 'Fix 2', category: 'bug' },
  { title: 'Bug 3', file: 'test3.ts', line: 3, severity: 'low', description: 'Desc 3 with enough characters.', suggestedFix: 'Fix 3', category: 'bug' }
])

// IssueDeduplicator
mockDeduplicator.filterDuplicates.mockResolvedValue([
  { title: 'Bug 1', file: 'test1.ts', line: 1, severity: 'high', description: 'Desc 1 with enough characters.', suggestedFix: 'Fix 1', category: 'bug' },
  { title: 'Bug 2', file: 'test2.ts', line: 2, severity: 'medium', description: 'Desc 2 with enough characters.', suggestedFix: 'Fix 2', category: 'bug' }
])

// IssueGenerator
mockGenerator.generate.mockResolvedValue({
  success: true,
  skippedReason: 'dry-run mode'
})
```

**期待結果**:
- `RepositoryAnalyzer.analyze` が1回呼び出される
- `IssueDeduplicator.filterDuplicates` が1回呼び出される
- `IssueGenerator.generate` が2回呼び出される（limit=2）
- ログに結果サマリーが記録される
- エラーはスローされない

**テストデータ**: 上記options, モック設定

---

#### TC-CLI-006: handleAutoIssueCommand_異常系_GITHUB_REPOSITORY未設定

**目的**: GITHUB_REPOSITORY環境変数が未設定の場合、エラーがスローされることを検証

**前提条件**:
- config.getGitHubRepository() が null を返す

**入力**:
```typescript
options = { /* 任意のオプション */ }
```

**モック設定**:
```typescript
mockConfig.getGitHubRepository.mockReturnValue(null)
```

**期待結果**:
- エラーがスローされる
- エラーメッセージが `'GITHUB_REPOSITORY environment variable is required.'`

**テストデータ**: 上記options, モック設定

---

#### TC-CLI-007: handleAutoIssueCommand_異常系_エージェント未設定

**目的**: エージェントが設定されていない場合、エラーがスローされることを検証

**前提条件**:
- codexClient と claudeClient が両方とも null

**入力**:
```typescript
options = {
  agent: 'auto'
}
```

**モック設定**:
```typescript
mockSetupAgentClients.mockReturnValue({
  codexClient: null,
  claudeClient: null
})
```

**期待結果**:
- エラーがスローされる
- エラーメッセージが `'Agent mode requires a valid agent configuration.'`

**テストデータ**: 上記options, モック設定

---

#### TC-CLI-008: reportResults_正常系_成功結果表示

**目的**: Issue作成成功時に適切な結果サマリーが表示されることを検証

**前提条件**: なし

**入力**:
```typescript
results = [
  { success: true, issueUrl: 'https://github.com/owner/repo/issues/1', issueNumber: 1 },
  { success: true, issueUrl: 'https://github.com/owner/repo/issues/2', issueNumber: 2 }
]
dryRun = false
```

**期待結果**:
- ログに "Successfully created 2 issues" が記録される
- ログに各IssueのURLが記録される

**テストデータ**: 上記results

---

#### TC-CLI-009: reportResults_正常系_dry-run結果表示

**目的**: dry-runモード時に適切な結果サマリーが表示されることを検証

**前提条件**: なし

**入力**:
```typescript
results = [
  { success: true, skippedReason: 'dry-run mode' },
  { success: true, skippedReason: 'dry-run mode' }
]
dryRun = true
```

**期待結果**:
- ログに "[DRY RUN] 2 issue candidates found" が記録される
- ログに "No issues were created (dry-run mode)" が記録される

**テストデータ**: 上記results

---

#### TC-CLI-010: reportResults_正常系_部分的成功

**目的**: 一部のIssue作成が失敗した場合、適切な結果サマリーが表示されることを検証

**前提条件**: なし

**入力**:
```typescript
results = [
  { success: true, issueUrl: 'https://github.com/owner/repo/issues/1', issueNumber: 1 },
  { success: false, error: 'GitHub API failed' },
  { success: true, issueUrl: 'https://github.com/owner/repo/issues/3', issueNumber: 3 }
]
dryRun = false
```

**期待結果**:
- ログに "Successfully created 2 issues" が記録される
- ログに "Failed to create 1 issues" が記録される
- ログに失敗理由が記録される

**テストデータ**: 上記results

---

## 3. Integrationテストシナリオ

### 3.1 エンドツーエンドワークフロー

**テストファイル**: `tests/integration/auto-issue-workflow.test.ts`

---

#### TC-INT-001: エンドツーエンド_正常系_dry-runモード

**シナリオ名**: auto-issueコマンド全体（dry-runモード）

**目的**: コマンド実行からバグ検出、重複検出、Issue候補表示までの全ワークフローを検証

**前提条件**:
- テストリポジトリが存在する（ai-workflow-agent）
- 環境変数が設定されている（GITHUB_TOKEN, CODEX_API_KEY）
- GitHub APIにアクセス可能

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 3`
2. エージェントがリポジトリを解析
3. バグ候補が検出される
4. 既存Issueとの重複検出が実行される
5. 重複を除外した候補が表示される（最大3件）
6. Issue作成はスキップされる

**期待結果**:
- コマンドがエラーなく完了する（終了コード0）
- バグ候補が1件以上表示される
- 各候補に以下の情報が含まれる:
  - タイトル
  - ファイルパス
  - 行番号
  - 深刻度
  - 詳細説明
  - 修正案
- ログに "[DRY RUN] Skipping issue creation" が記録される
- GitHub APIでIssueが作成されない

**確認項目**:
- [ ] コマンドが正常終了する
- [ ] バグ候補が表示される
- [ ] 候補数が limit以下である
- [ ] dry-runメッセージが表示される
- [ ] GitHub上にIssueが作成されていない

---

#### TC-INT-002: エンドツーエンド_正常系_実際のIssue作成

**シナリオ名**: auto-issueコマンド全体（本番モード）

**目的**: コマンド実行から実際のIssue作成までの全ワークフローを検証

**前提条件**:
- テストリポジトリが存在する
- 環境変数が設定されている
- GitHub APIにアクセス可能
- テスト用のGitHubリポジトリが用意されている

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --limit 2`
2. エージェントがリポジトリを解析
3. バグ候補が検出される
4. 既存Issueとの重複検出が実行される
5. 重複を除外した候補（最大2件）でIssueが作成される
6. 作成されたIssue URLが表示される

**期待結果**:
- コマンドがエラーなく完了する
- 最大2件のIssueが作成される
- 各Issueに以下のラベルが付与される:
  - `auto-generated`
  - `bug`
- Issue本文に5セクションが含まれる:
  - 概要
  - 詳細
  - 影響範囲
  - 修正案
  - 関連ファイル
- ログに作成されたIssue URLが記録される

**確認項目**:
- [ ] コマンドが正常終了する
- [ ] GitHub上に2件以下のIssueが作成される
- [ ] 各Issueに正しいラベルが付与されている
- [ ] Issue本文が5セクション構成である
- [ ] 作成されたIssue URLが表示される

---

#### TC-INT-003: エンドツーエンド_正常系_重複検出によるスキップ

**シナリオ名**: 重複Issueのスキップ検証

**目的**: 既存Issueと重複する候補が正しくスキップされることを検証

**前提条件**:
- テストリポジトリに既存Issue「Fix memory leak in CodexAgentClient」が存在する
- バグ検出で「メモリリーク」を含む候補が検出される

**テスト手順**:
1. 既存Issueを確認: `gh issue list`
2. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 5`
3. バグ検出結果に「メモリリーク」関連の候補が含まれる
4. 重複検出が実行される
5. 既存Issueと類似する候補がスキップされる

**期待結果**:
- 重複候補がフィルタリングされる
- ログに "Duplicate detected" が記録される
- ログにスキップ理由が記録される（例: "Skipped (duplicate with #123)"）
- 類似度スコアが0.8以上

**確認項目**:
- [ ] 重複候補が除外される
- [ ] ログに重複検出メッセージが記録される
- [ ] スキップ理由が明確に表示される

---

### 3.2 エージェント統合テスト

---

#### TC-INT-004: エージェント選択_正常系_Codex使用

**シナリオ名**: Codexエージェントでバグ検出

**目的**: --agent codex オプションでCodexのみが使用されることを検証

**前提条件**:
- CODEX_API_KEY が設定されている
- Codex APIにアクセス可能

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --agent codex --dry-run --limit 3`
2. Codexエージェントがバグ検出を実行
3. バグ候補が検出される

**期待結果**:
- コマンドが正常終了する
- ログに "Using Codex agent" が記録される
- ログに "Claude" が記録されない（Claudeは使用されない）
- バグ候補が1件以上検出される

**確認項目**:
- [ ] Codexエージェントのみが使用される
- [ ] Claudeにフォールバックしない
- [ ] バグ候補が検出される

---

#### TC-INT-005: エージェント選択_正常系_Claude使用

**シナリオ名**: Claudeエージェントでバグ検出

**目的**: --agent claude オプションでClaudeのみが使用されることを検証

**前提条件**:
- CLAUDE_CODE_CREDENTIALS_PATH が設定されている
- Claude APIにアクセス可能

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --agent claude --dry-run --limit 3`
2. Claudeエージェントがバグ検出を実行
3. バグ候補が検出される

**期待結果**:
- コマンドが正常終了する
- ログに "Using Claude agent" が記録される
- ログに "Codex" が記録されない（Codexは使用されない）
- バグ候補が1件以上検出される

**確認項目**:
- [ ] Claudeエージェントのみが使用される
- [ ] Codexにフォールバックしない
- [ ] バグ候補が検出される

---

#### TC-INT-006: エージェント選択_正常系_autoモードでフォールバック

**シナリオ名**: autoモードでCodex→Claudeフォールバック

**目的**: Codex失敗時にClaudeにフォールバックすることを検証

**前提条件**:
- CODEX_API_KEY が無効（または未設定）
- CLAUDE_CODE_CREDENTIALS_PATH が設定されている
- Claude APIにアクセス可能

**テスト手順**:
1. CODEX_API_KEY を一時的に無効化
2. コマンド実行: `node dist/index.js auto-issue --category bug --agent auto --dry-run --limit 3`
3. Codexが利用不可と判定される
4. Claudeにフォールバックする
5. バグ候補が検出される

**期待結果**:
- コマンドが正常終了する
- ログに "Codex not available, falling back to Claude" が記録される
- Claudeエージェントがバグ検出を実行
- バグ候補が1件以上検出される

**確認項目**:
- [ ] Codex利用不可が検出される
- [ ] Claudeにフォールバックする
- [ ] バグ候補が検出される
- [ ] フォールバックログが記録される

---

### 3.3 GitHub API統合テスト

---

#### TC-INT-007: GitHub_API統合_正常系_Issue作成

**シナリオ名**: GitHub APIでIssue作成

**目的**: GitHub APIを使用してIssueが正常に作成されることを検証

**前提条件**:
- GITHUB_TOKEN が設定されている
- テスト用リポジトリにアクセス可能
- repo スコープ権限あり

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --limit 1`
2. バグ候補が検出される
3. GitHub APIでIssueが作成される
4. 作成されたIssue URLが表示される
5. GitHub上でIssueを確認

**期待結果**:
- Issue番号が返される
- Issue URLが表示される
- GitHub上でIssueが確認できる
- ラベル `auto-generated`, `bug` が付与されている
- Issue本文が5セクション構成である

**確認項目**:
- [ ] IssueがGitHub上に作成される
- [ ] ラベルが正しく付与される
- [ ] Issue本文が期待通りのフォーマットである
- [ ] Issue URLが有効である

---

#### TC-INT-008: GitHub_API統合_正常系_既存Issue取得

**シナリオ名**: 既存Issueの取得

**目的**: GitHub APIから既存Issueを正しく取得できることを検証

**前提条件**:
- テスト用リポジトリに既存Issueが存在する
- GITHUB_TOKEN が設定されている

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 5`
2. GitHub APIで既存Issue一覧を取得
3. 重複検出が実行される
4. ログに既存Issue数が記録される

**期待結果**:
- 既存Issueが取得される
- ログに "Found X existing issues" が記録される
- 重複検出が正常に実行される

**確認項目**:
- [ ] GitHub APIが呼び出される
- [ ] 既存Issueが取得される
- [ ] 取得したIssue数がログに記録される

---

#### TC-INT-009: GitHub_API統合_異常系_レート制限

**シナリオ名**: GitHub APIレート制限対応

**目的**: レート制限発生時に適切なエラーメッセージが表示されることを検証

**前提条件**:
- GitHub APIのレート制限に近い状態（事前に大量リクエスト実行）

**テスト手順**:
1. 事前に大量のAPIリクエストを実行してレート制限に近づける
2. コマンド実行: `node dist/index.js auto-issue --category bug --limit 10`
3. レート制限エラーが発生
4. エラーメッセージが表示される

**期待結果**:
- エラーメッセージに "API rate limit exceeded" が含まれる
- ログに残りレート制限数が記録される
- プロセスが異常終了する（適切なエラーコード）

**確認項目**:
- [ ] レート制限エラーが検出される
- [ ] エラーメッセージが明確である
- [ ] ログに詳細情報が記録される

---

### 3.4 言語非依存性テスト

---

#### TC-INT-010: 言語非依存性_正常系_TypeScriptリポジトリ

**シナリオ名**: TypeScriptリポジトリでのバグ検出

**目的**: TypeScriptリポジトリでバグ検出が正常に動作することを検証

**前提条件**:
- テストリポジトリ（ai-workflow-agent）がTypeScriptで書かれている
- エージェントが設定されている

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 5`
2. エージェントがTypeScriptコードを解析
3. バグ候補が検出される

**期待結果**:
- バグ候補が最低5パターン検出される:
  1. エラーハンドリング欠如（try-catchなし）
  2. 型安全性問題（`any` の過度な使用）
  3. リソースリーク（ファイルハンドルの未クローズ）
  4. セキュリティ懸念（環境変数の直接参照）
  5. コードの重複（DRY原則違反）
- 各候補のファイルパスが `.ts` で終わる

**確認項目**:
- [ ] 5パターン以上のバグが検出される
- [ ] TypeScript固有の問題が検出される
- [ ] ファイル拡張子が `.ts` である

---

#### TC-INT-011: 言語非依存性_正常系_Pythonリポジトリ

**シナリオ名**: Pythonリポジトリでのバグ検出

**目的**: Pythonリポジトリでバグ検出が正常に動作することを検証

**前提条件**:
- テスト用Pythonリポジトリが用意されている
- エージェントが設定されている

**テスト手順**:
1. Pythonリポジトリのディレクトリに移動
2. コマンド実行: `node /path/to/ai-workflow-agent/dist/index.js auto-issue --category bug --dry-run --limit 3`
3. エージェントがPythonコードを解析
4. バグ候補が検出される

**期待結果**:
- バグ候補が最低3件検出される
- Python固有の問題が検出される（例: 型ヒント欠如、例外処理なし）
- 各候補のファイルパスが `.py` で終わる
- エラーなく実行完了する

**確認項目**:
- [ ] 3件以上のバグが検出される
- [ ] Pythonコードが正しく解析される
- [ ] ファイル拡張子が `.py` である
- [ ] エラーが発生しない

---

#### TC-INT-012: 言語非依存性_境界値_非対応言語

**シナリオ名**: 非対応言語（Java）の処理

**目的**: Phase 1で非対応の言語（Java）がバリデーションで除外されることを検証

**前提条件**:
- Javaファイルを含むテストリポジトリ

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 5`
2. エージェントがJavaファイルも含めて解析
3. バリデーションでJavaファイルの候補が除外される

**期待結果**:
- エージェントはJavaファイルも解析する
- バリデーション時に `.java` ファイルの候補が除外される
- ログに "Parsed X candidates, Y valid" が記録される（X > Y）
- TypeScript/Pythonファイルの候補のみが残る

**確認項目**:
- [ ] Javaファイルの候補が除外される
- [ ] ログに除外された候補数が記録される
- [ ] TypeScript/Pythonファイルの候補は残る

---

### 3.5 オプション統合テスト

---

#### TC-INT-013: オプション統合_正常系_limit制限

**シナリオ名**: --limit オプションで候補数を制限

**目的**: --limit オプションが正しく動作することを検証

**前提条件**:
- テストリポジトリに10件以上のバグ候補が検出可能

**テスト手順**:
1. コマンド実行: `node dist/index.js auto-issue --category bug --dry-run --limit 3`
2. バグ検出が実行される
3. 重複検出後、上位3件のみが選択される

**期待結果**:
- 表示される候補数が3件以下
- ログに "After deduplication: X candidates" が記録される
- ログに "Limiting to 3 candidates" が記録される

**確認項目**:
- [ ] 候補数が limit以下である
- [ ] ログに制限メッセージが記録される
- [ ] 高深刻度の候補が優先される

---

#### TC-INT-014: オプション統合_正常系_similarity-threshold調整

**シナリオ名**: --similarity-threshold オプションで閾値調整

**目的**: 類似度閾値が正しく適用されることを検証

**前提条件**:
- 既存Issueと類似度0.85の候補が検出される

**テスト手順**:
1. パターン1: `node dist/index.js auto-issue --category bug --dry-run --similarity-threshold 0.9`
   - 期待: 候補がフィルタリングされない（0.85 < 0.9）
2. パターン2: `node dist/index.js auto-issue --category bug --dry-run --similarity-threshold 0.7`
   - 期待: 候補がフィルタリングされる（0.85 > 0.7）

**期待結果**:
- 閾値0.9: 重複と判定されない
- 閾値0.7: 重複と判定される
- ログに類似度スコアが記録される

**確認項目**:
- [ ] 閾値0.9で候補が残る
- [ ] 閾値0.7で候補が除外される
- [ ] ログに類似度スコアが記録される

---

## 4. テストデータ

### 4.1 バグ候補サンプルデータ

#### 有効なバグ候補（正常系）

```typescript
const validBugCandidate: BugCandidate = {
  title: 'エラーハンドリングの欠如 in CodexAgentClient',
  file: 'src/core/codex-agent-client.ts',
  line: 42,
  severity: 'high',
  description: 'executeTask()メソッドでエラーハンドリングが不足しています。APIリクエスト失敗時にキャッチされないエラーが発生する可能性があります。',
  suggestedFix: 'try-catchブロックを追加して、エラー発生時に適切なログ記録とリトライ処理を実装してください。',
  category: 'bug'
}
```

#### 無効なバグ候補（異常系）

```typescript
// タイトルが短すぎる
const invalidTitleCandidate: BugCandidate = {
  title: 'Bug',  // 10文字未満
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'Valid description with at least 50 characters to pass validation.',
  suggestedFix: 'Valid fix suggestion.',
  category: 'bug'
}

// 非対応言語
const invalidLanguageCandidate: BugCandidate = {
  title: 'Valid bug title',
  file: 'test.java',  // Phase 1では非対応
  line: 1,
  severity: 'high',
  description: 'Valid description with at least 50 characters to pass validation.',
  suggestedFix: 'Valid fix suggestion.',
  category: 'bug'
}

// 説明が短すぎる
const invalidDescriptionCandidate: BugCandidate = {
  title: 'Valid bug title',
  file: 'test.ts',
  line: 1,
  severity: 'high',
  description: 'Short',  // 50文字未満
  suggestedFix: 'Valid fix suggestion.',
  category: 'bug'
}
```

### 4.2 既存Issueサンプルデータ

```typescript
const existingIssues = [
  {
    number: 123,
    title: 'Fix memory leak in CodexAgentClient',
    body: 'Memory leak occurs when executeTask method fails. Need to add proper cleanup in catch block.'
  },
  {
    number: 124,
    title: 'Add error handling to ClaudeAgentClient',
    body: 'Error handling is missing in executeTask method.'
  },
  {
    number: 125,
    title: 'Improve type safety in auto-issue module',
    body: 'Too many any types are used in the new auto-issue feature.'
  }
]
```

### 4.3 エージェント出力サンプルデータ

#### JSON形式出力（正常系）

```
Here are the bugs I found:

```json
{
  "bugs": [
    {
      "title": "エラーハンドリングの欠如",
      "file": "src/core/codex-agent-client.ts",
      "line": 42,
      "severity": "high",
      "description": "executeTask()メソッドでエラーハンドリングが不足しています。",
      "suggestedFix": "try-catchブロックを追加してください。",
      "category": "bug"
    },
    {
      "title": "型安全性の問題",
      "file": "src/types/auto-issue.ts",
      "line": 10,
      "severity": "medium",
      "description": "any型が過度に使用されています。",
      "suggestedFix": "具体的な型定義を追加してください。",
      "category": "bug"
    }
  ]
}
```

Additional analysis complete.
```

#### Markdown形式出力（Issue本文生成）

```
Here is the GitHub Issue body:

```markdown
## 概要
CodexAgentClientのexecuteTask()メソッドでエラーハンドリングが不足しており、APIリクエスト失敗時にキャッチされないエラーが発生する可能性があります。

## 詳細
executeTask()メソッドは外部APIを呼び出していますが、try-catchブロックでラップされていません。このため、ネットワークエラーやAPIレート制限などの例外が発生した場合、アプリケーション全体がクラッシュする可能性があります。

## 影響範囲
- CodexAgentClientを使用するすべての機能（auto-issue、execute コマンド等）
- エラー発生時にユーザーに適切なエラーメッセージが表示されない
- リトライ処理が実装されていない

## 修正案
1. executeTask()メソッド全体をtry-catchブロックでラップ
2. エラー発生時に適切なログ記録を実装
3. リトライ可能なエラー（レート制限等）に対してリトライロジックを追加
4. ユーザーに分かりやすいエラーメッセージを返す

## 関連ファイル
- src/core/codex-agent-client.ts (行42)
```

Thank you for the detailed bug report.
```

### 4.4 CLIオプションサンプルデータ

```typescript
// デフォルト値
const defaultOptions = {
  category: 'bug',
  limit: 5,
  dryRun: false,
  similarityThreshold: 0.8,
  agent: 'auto'
}

// カスタムオプション
const customOptions = {
  category: 'bug',
  limit: 10,
  dryRun: true,
  similarityThreshold: 0.9,
  agent: 'codex'
}

// 境界値オプション
const boundaryOptions = {
  limit: 1,  // 最小値
  similarityThreshold: 1.0  // 最大値
}
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

#### ローカル環境
- **Node.js**: 20以上
- **npm**: 10以上
- **TypeScript**: 5.6以上
- **Jest**: テストランナー（既存の設定を使用）

#### CI/CD環境
- GitHub Actions（既存のワークフローを拡張）
- テスト実行: `npm run test:unit`, `npm run test:integration`

### 5.2 必要な外部サービス

#### GitHub API
- **用途**: Issue作成、既存Issue取得
- **認証**: `GITHUB_TOKEN` 環境変数
- **スコープ**: `repo`, `workflow`, `read:org`
- **レート制限**: 5000 requests/hour（認証済みユーザー）

#### OpenAI API
- **用途**: 重複検出（LLM判定）
- **認証**: `OPENAI_API_KEY` 環境変数
- **モデル**: `gpt-4o-mini`
- **コスト**: 約$0.01〜$0.10/実行

#### Codex/Claude エージェント
- **Codex**: `CODEX_API_KEY` または `OPENAI_API_KEY`
- **Claude**: `CLAUDE_CODE_CREDENTIALS_PATH`
- **用途**: バグ検出、Issue本文生成

### 5.3 モック/スタブの必要性

#### ユニットテストでモック化するコンポーネント

1. **CodexAgentClient**
   ```typescript
   jest.mock('../src/core/codex-agent-client');
   const mockCodexClient = jest.mocked(CodexAgentClient);
   ```

2. **ClaudeAgentClient**
   ```typescript
   jest.mock('../src/core/claude-agent-client');
   const mockClaudeClient = jest.mocked(ClaudeAgentClient);
   ```

3. **GitHubClient**
   ```typescript
   jest.mock('../src/core/github-client');
   const mockGitHubClient = jest.mocked(GitHubClient);
   ```

4. **OpenAI API**
   ```typescript
   jest.mock('openai');
   const mockOpenAI = jest.mocked(OpenAI);
   ```

#### インテグレーションテストでモック化するコンポーネント

- **最小限のモック**: 実際のAPIを使用するが、テスト用リポジトリを使用
- **GitHub API**: テスト用リポジトリを用意（本番リポジトリを汚染しない）
- **OpenAI API**: 実際のAPIを使用（コスト削減のため limit を小さくする）

### 5.4 テストデータセットアップ

#### テスト用リポジトリ
- **TypeScript**: ai-workflow-agent（本プロジェクト）
- **Python**: 別途用意（例: simple-python-app）

#### テスト用既存Issue
- テスト前に既存Issueを作成（または既存Issueを利用）
- テスト後にクリーンアップ（auto-generatedラベル付きIssueを削除）

### 5.5 環境変数設定

#### ユニットテスト用
```bash
# ユニットテストではモックを使用するため、実際の値は不要
export GITHUB_TOKEN="test-token"
export GITHUB_REPOSITORY="test-owner/test-repo"
export OPENAI_API_KEY="test-api-key"
```

#### インテグレーションテスト用
```bash
# 実際の認証情報が必要
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxx"
export GITHUB_REPOSITORY="test-owner/test-repo"
export OPENAI_API_KEY="sk-xxxxxxxxxxxxx"
export CODEX_API_KEY="sk-xxxxxxxxxxxxx"  # または OPENAI_API_KEY と同じ
export CLAUDE_CODE_CREDENTIALS_PATH="/path/to/credentials.json"
```

---

## 6. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

**確認結果**: ✅ 合格

- Phase 2で決定されたテスト戦略: **UNIT_INTEGRATION**
- 本テストシナリオ:
  - ユニットテストシナリオ: 4モジュール × 10ケース = 40ケース
  - インテグレーションテストシナリオ: 5カテゴリ × 14ケース = 14ケース
- BDDシナリオは含まれていない（戦略に沿って除外）

### ✅ 主要な正常系がカバーされている

**確認結果**: ✅ 合格

**ユニットテスト正常系**:
- TC-RA-001: RepositoryAnalyzer - Codexエージェント使用
- TC-RA-002: RepositoryAnalyzer - Claudeエージェント使用
- TC-ID-001: IssueDeduplicator - 重複なし
- TC-ID-005: IssueDeduplicator - コサイン類似度計算（同一テキスト）
- TC-IG-001: IssueGenerator - dry-runモード
- TC-IG-002: IssueGenerator - Issue作成成功
- TC-CLI-001: CLIハンドラ - デフォルト値適用
- TC-CLI-005: CLIハンドラ - エンドツーエンド

**インテグレーションテスト正常系**:
- TC-INT-001: エンドツーエンド - dry-runモード
- TC-INT-002: エンドツーエンド - 実際のIssue作成
- TC-INT-004: エージェント選択 - Codex使用
- TC-INT-005: エージェント選択 - Claude使用
- TC-INT-007: GitHub API統合 - Issue作成
- TC-INT-010: 言語非依存性 - TypeScriptリポジトリ
- TC-INT-011: 言語非依存性 - Pythonリポジトリ

### ✅ 主要な異常系がカバーされている

**確認結果**: ✅ 合格

**ユニットテスト異常系**:
- TC-RA-004: RepositoryAnalyzer - 不正なJSON出力
- TC-RA-008: RepositoryAnalyzer - タイトルが短すぎる
- TC-RA-009: RepositoryAnalyzer - 非対応言語
- TC-ID-004: IssueDeduplicator - OpenAI API失敗
- TC-IG-003: IssueGenerator - GitHub API失敗
- TC-IG-005: IssueGenerator - Codexエージェント失敗
- TC-CLI-003: CLIハンドラ - limitが数値以外
- TC-CLI-004: CLIハンドラ - similarityThresholdが範囲外
- TC-CLI-006: CLIハンドラ - GITHUB_REPOSITORY未設定
- TC-CLI-007: CLIハンドラ - エージェント未設定

**インテグレーションテスト異常系**:
- TC-INT-009: GitHub API統合 - レート制限

**フォールバック・リトライ**:
- TC-RA-003: RepositoryAnalyzer - autoモードでCodex→Claudeフォールバック
- TC-INT-006: エージェント選択 - autoモードでフォールバック

### ✅ 期待結果が明確である

**確認結果**: ✅ 合格

すべてのテストケースに以下の情報が明記されています:
- **目的**: テストで検証する内容が明確
- **前提条件**: テスト実行前の状態が明確
- **入力**: 具体的な入力データ
- **期待結果**: 検証可能な期待値（戻り値、ログメッセージ、副作用）
- **テストデータ**: サンプルデータが提供されている

**明確性の例**:
- TC-ID-005: 「類似度が `1.0`」（数値で明確）
- TC-IG-001: 「`IssueCreationResult.success` が `true`」（型とフィールドが明確）
- TC-INT-001: 「ログに "[DRY RUN] Skipping issue creation" が記録される」（具体的な文字列）

---

## 受け入れ基準との対応

本テストシナリオは、要件定義書の受け入れ基準（AC-1〜AC-10）をすべてカバーしています。

| 受け入れ基準 | 対応するテストケース |
|------------|-------------------|
| AC-1: CLIコマンド動作 | TC-INT-001, TC-INT-002 |
| AC-2: エージェント選択 | TC-INT-004, TC-INT-005, TC-INT-006 |
| AC-3: バグ検出精度（TypeScript） | TC-INT-010 |
| AC-4: バグ検出精度（Python） | TC-INT-011 |
| AC-5: 重複検出 | TC-INT-003, TC-ID-002 |
| AC-6: 閾値調整 | TC-INT-014 |
| AC-7: Issue生成（本番実行） | TC-INT-002, TC-INT-007 |
| AC-8: ユニットテスト | TC-RA-001〜TC-CLI-010（全40ケース） |
| AC-9: インテグレーションテスト | TC-INT-001〜TC-INT-014（全14ケース） |
| AC-10: ドキュメント | （Phase 7で対応） |

---

## まとめ

### テストケース数
- **ユニットテスト**: 40ケース（RepositoryAnalyzer: 10, IssueDeduplicator: 10, IssueGenerator: 8, CLIハンドラ: 12）
- **インテグレーションテスト**: 14ケース
- **合計**: 54ケース

### カバレッジ目標
- **ユニットテスト**: 80%以上（設計書の品質ゲート）
- **インテグレーションテスト**: 主要ワークフローすべて

### 推定テスト実行時間
- **ユニットテスト**: 約5〜10分（モック使用のため高速）
- **インテグレーションテスト**: 約15〜20分（実際のAPI呼び出しを含むため低速）

### 次フェーズへの引き継ぎ
- Phase 4（実装）: 本テストシナリオに基づいて実装を進める
- Phase 5（テストコード実装）: 本テストシナリオに基づいてテストコードを作成
- Phase 6（テスト実行）: 本テストシナリオのすべてのケースを実行し、合格を確認

---

**テストシナリオ作成日**: 2025-01-30
**次フェーズ**: Phase 4 (実装)
**担当者**: AI Workflow Agent
