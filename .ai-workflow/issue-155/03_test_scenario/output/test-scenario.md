# テストシナリオ - Issue #155

## プロジェクト情報

- **Issue番号**: #155
- **タイトル**: [Refactor] コード重複の削減: repository-analyzer.ts
- **カテゴリ**: リファクタリング
- **優先度**: High
- **作成日**: 2025-01-30

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

**判断根拠**:
- **ユニットテスト**: 新規抽出メソッド（`executeAgentWithFallback`、`validateAnalysisResult`）の個別ロジック（バリデーション、エラーハンドリング、フォールバック動作）を検証
- **インテグレーションテスト**: 既存の`analyze()`、`analyzeForRefactoring()`メソッドの統合動作を検証し、リグレッション防止

### 1.2 テスト対象の範囲

**対象ファイル**:
- `src/core/repository-analyzer.ts`

**対象メソッド**:
1. **新規作成メソッド**（ユニットテスト対象）
   - `executeAgentWithFallback()` - エージェント実行ロジックの共通化
   - `validateAnalysisResult()` - バリデーションロジックの共通化

2. **リファクタリング対象メソッド**（インテグレーションテスト対象）
   - `analyze()` - バグ候補の検出
   - `analyzeForRefactoring()` - リファクタリング候補の検出

### 1.3 テストの目的

1. **リグレッション防止**: リファクタリング前後で既存機能の動作が完全に一致することを保証
2. **新規メソッドの品質保証**: 共通化されたメソッドが正しく動作することを保証
3. **エッジケースの網羅**: エージェントフォールバックロジックのエッジケースを網羅的に検証
4. **テストカバレッジ向上**: 90%以上のカバレッジを達成

---

## 2. ユニットテストシナリオ

### 2.1 executeAgentWithFallback メソッド

#### 2.1.1 正常系: Codexエージェント成功パターン

**テストケース名**: `executeAgentWithFallback_Codex成功_出力ファイル生成`

**目的**: `agent='auto'`でCodexエージェントが利用可能な場合、Codexが実行され正常に完了することを検証

**前提条件**:
- `this.codexClient`がnullでない（Codexエージェントが利用可能）
- プロンプトテンプレートファイルが存在する（例: `detect-bugs.txt`）
- `agent`パラメータが`'auto'`または`'codex'`

**入力**:
```typescript
promptPath = '/path/to/prompts/detect-bugs.txt'
outputFilePath = '/tmp/auto-issue-bugs-12345.json'
repoPath = '/path/to/repository'
agent = 'auto'
```

**期待結果**:
- `this.codexClient.executeTask()`が1回呼び出される
- `this.claudeClient.executeTask()`は呼び出されない
- ログに`'Using Codex agent for analysis.'`が記録される
- エラーがスローされない

**テストデータ**:
- プロンプトテンプレート（`detect-bugs.txt`）:
  ```
  Analyze the repository at {repository_path} and output results to {output_file_path}.
  ```

---

#### 2.1.2 正常系: Codex利用不可 → Claude自動フォールバック

**テストケース名**: `executeAgentWithFallback_Codex利用不可_Claudeフォールバック`

**目的**: `agent='auto'`でCodexが利用不可の場合、自動的にClaudeにフォールバックすることを検証

**前提条件**:
- `this.codexClient`がnull（Codexエージェントが利用不可）
- `this.claudeClient`がnullでない（Claudeエージェントが利用可能）
- プロンプトテンプレートファイルが存在する
- `agent`パラメータが`'auto'`

**入力**:
```typescript
promptPath = '/path/to/prompts/detect-refactoring.txt'
outputFilePath = '/tmp/auto-issue-refactor-67890.json'
repoPath = '/path/to/repository'
agent = 'auto'
```

**期待結果**:
- `this.codexClient.executeTask()`は呼び出されない（nullのため）
- `this.claudeClient.executeTask()`が1回呼び出される
- ログに`'Codex not available, falling back to Claude.'`が記録される
- ログに`'Using Claude agent for analysis.'`が記録される
- エラーがスローされない

**テストデータ**:
- プロンプトテンプレート（`detect-refactoring.txt`）:
  ```
  Analyze the repository at {repository_path} for refactoring opportunities and output results to {output_file_path}.
  ```

---

#### 2.1.3 正常系: Codex実行失敗 → Claude自動フォールバック

**テストケース名**: `executeAgentWithFallback_Codex失敗_Claudeフォールバック`

**目的**: `agent='auto'`でCodex実行中にエラーが発生した場合、自動的にClaudeにフォールバックすることを検証

**前提条件**:
- `this.codexClient`がnullでない
- `this.codexClient.executeTask()`がエラーをスローする（例: ネットワークエラー）
- `this.claudeClient`がnullでない
- `agent`パラメータが`'auto'`

**入力**:
```typescript
promptPath = '/path/to/prompts/detect-bugs.txt'
outputFilePath = '/tmp/auto-issue-bugs-12345.json'
repoPath = '/path/to/repository'
agent = 'auto'
```

**期待結果**:
- `this.codexClient.executeTask()`が1回呼び出される（失敗）
- `this.claudeClient.executeTask()`が1回呼び出される（成功）
- ログに`'Using Codex agent for analysis.'`が記録される
- ログに`'Codex failed (Network error), falling back to Claude.'`が記録される
- ログに`'Using Claude agent for analysis.'`が記録される
- エラーがスローされない

**テストデータ**:
- モックエラー: `new Error('Network error')`

---

#### 2.1.4 異常系: プロンプトテンプレートファイル不在

**テストケース名**: `executeAgentWithFallback_プロンプト不在_エラースロー`

**目的**: プロンプトテンプレートファイルが存在しない場合、適切なエラーメッセージを含む例外がスローされることを検証

**前提条件**:
- 指定されたプロンプトパスのファイルが存在しない

**入力**:
```typescript
promptPath = '/path/to/nonexistent-prompt.txt'
outputFilePath = '/tmp/auto-issue-bugs-12345.json'
repoPath = '/path/to/repository'
agent = 'auto'
```

**期待結果**:
- `Error`例外がスローされる
- エラーメッセージ: `'Prompt template not found: /path/to/nonexistent-prompt.txt'`
- `this.codexClient.executeTask()`は呼び出されない
- `this.claudeClient.executeTask()`は呼び出されない

**テストデータ**:
- なし（ファイル不在をシミュレート）

---

#### 2.1.5 異常系: 両エージェント利用不可

**テストケース名**: `executeAgentWithFallback_両エージェント不可_エラースロー`

**目的**: `agent='auto'`でCodexとClaudeの両方が利用不可の場合、適切なエラーがスローされることを検証

**前提条件**:
- `this.codexClient`がnull
- `this.claudeClient`がnull
- `agent`パラメータが`'auto'`

**入力**:
```typescript
promptPath = '/path/to/prompts/detect-bugs.txt'
outputFilePath = '/tmp/auto-issue-bugs-12345.json'
repoPath = '/path/to/repository'
agent = 'auto'
```

**期待結果**:
- `Error`例外がスローされる
- エラーメッセージ: `'Claude agent is not available.'`
- ログに`'Codex not available, falling back to Claude.'`が記録される

**テストデータ**:
- なし（両クライアントがnull）

---

#### 2.1.6 異常系: Codex強制モードで失敗

**テストケース名**: `executeAgentWithFallback_Codex強制失敗_エラースロー`

**目的**: `agent='codex'`でCodex実行失敗時、フォールバックせずエラーがスローされることを検証

**前提条件**:
- `this.codexClient`がnullでない
- `this.codexClient.executeTask()`がエラーをスローする
- `agent`パラメータが`'codex'`（強制モード）

**入力**:
```typescript
promptPath = '/path/to/prompts/detect-bugs.txt'
outputFilePath = '/tmp/auto-issue-bugs-12345.json'
repoPath = '/path/to/repository'
agent = 'codex'
```

**期待結果**:
- `this.codexClient.executeTask()`が1回呼び出される（失敗）
- `this.claudeClient.executeTask()`は呼び出されない（フォールバックなし）
- ログに`'Using Codex agent for analysis.'`が記録される
- Codexの実行エラーがそのままスローされる

**テストデータ**:
- モックエラー: `new Error('Codex API authentication failed')`

---

#### 2.1.7 境界値: 変数置換の正確性検証

**テストケース名**: `executeAgentWithFallback_変数置換_正確性`

**目的**: プロンプトテンプレート内の変数（`{repository_path}`, `{output_file_path}`）が正確に置換されることを検証

**前提条件**:
- `this.codexClient`がnullでない
- プロンプトテンプレートに変数プレースホルダーが含まれる

**入力**:
```typescript
promptPath = '/path/to/prompts/template-with-vars.txt'
outputFilePath = '/tmp/output-12345.json'
repoPath = '/home/user/my-repo'
agent = 'codex'
```

**テストデータ**:
- プロンプトテンプレート（`template-with-vars.txt`）:
  ```
  Repository: {repository_path}
  Output: {output_file_path}
  Multiple outputs: {output_file_path} and {output_file_path}
  ```

**期待結果**:
- `this.codexClient.executeTask()`に渡されるプロンプトが以下と一致:
  ```
  Repository: /home/user/my-repo
  Output: /tmp/output-12345.json
  Multiple outputs: /tmp/output-12345.json and /tmp/output-12345.json
  ```

---

### 2.2 validateAnalysisResult メソッド

#### 2.2.1 正常系: バグ候補のバリデーション（全て有効）

**テストケース名**: `validateAnalysisResult_Bug全有効_全候補返却`

**目的**: `candidateType='bug'`で全ての候補が有効な場合、全候補が返されることを検証

**前提条件**:
- `this.validateBugCandidate()`が全候補に対してtrueを返す

**入力**:
```typescript
candidates = [
  { title: 'Bug 1', file: 'a.ts', line: 10, severity: 'high', description: 'Desc', suggestedFix: 'Fix', category: 'bug' },
  { title: 'Bug 2', file: 'b.ts', line: 20, severity: 'medium', description: 'Desc', suggestedFix: 'Fix', category: 'bug' },
  { title: 'Bug 3', file: 'c.ts', line: 30, severity: 'low', description: 'Desc', suggestedFix: 'Fix', category: 'bug' }
]
candidateType = 'bug'
```

**期待結果**:
- 戻り値が3個の候補を含む配列
- `this.validateBugCandidate()`が3回呼び出される
- ログに`'Parsed 3 bug candidates, 3 valid after validation.'`が記録される

**テストデータ**: 上記candidates

---

#### 2.2.2 正常系: バグ候補のバリデーション（一部無効）

**テストケース名**: `validateAnalysisResult_Bug一部無効_有効候補のみ返却`

**目的**: `candidateType='bug'`で一部の候補が無効な場合、有効な候補のみが返されることを検証

**前提条件**:
- `this.validateBugCandidate()`が1番目と3番目の候補にtrueを返し、2番目にfalseを返す

**入力**:
```typescript
candidates = [
  { title: 'Bug 1', file: 'a.ts', line: 10, severity: 'high', description: 'Desc', suggestedFix: 'Fix', category: 'bug' },
  { title: 'Invalid Bug', file: '', line: 0, severity: 'high', description: '', suggestedFix: '', category: 'bug' }, // 無効
  { title: 'Bug 3', file: 'c.ts', line: 30, severity: 'low', description: 'Desc', suggestedFix: 'Fix', category: 'bug' }
]
candidateType = 'bug'
```

**期待結果**:
- 戻り値が2個の有効な候補を含む配列（1番目と3番目）
- `this.validateBugCandidate()`が3回呼び出される
- ログに`'Parsed 3 bug candidates, 2 valid after validation.'`が記録される

**テストデータ**: 上記candidates

---

#### 2.2.3 正常系: リファクタリング候補のバリデーション（全て有効）

**テストケース名**: `validateAnalysisResult_Refactor全有効_全候補返却`

**目的**: `candidateType='refactor'`で全ての候補が有効な場合、全候補が返されることを検証

**前提条件**:
- `this.validateRefactorCandidate()`が全候補に対してtrueを返す

**入力**:
```typescript
candidates = [
  { type: 'large-file', filePath: 'a.ts', description: 'Desc', suggestion: 'Sug', priority: 'high' },
  { type: 'duplication', filePath: 'b.ts', lineRange: { start: 10, end: 20 }, description: 'Desc', suggestion: 'Sug', priority: 'medium' }
]
candidateType = 'refactor'
```

**期待結果**:
- 戻り値が2個の候補を含む配列
- `this.validateRefactorCandidate()`が2回呼び出される
- ログに`'Parsed 2 refactor candidates, 2 valid after validation.'`が記録される

**テストデータ**: 上記candidates

---

#### 2.2.4 正常系: リファクタリング候補のバリデーション（一部無効）

**テストケース名**: `validateAnalysisResult_Refactor一部無効_有効候補のみ返却`

**目的**: `candidateType='refactor'`で一部の候補が無効な場合、有効な候補のみが返されることを検証

**前提条件**:
- `this.validateRefactorCandidate()`が1番目にtrueを返し、2番目にfalseを返す

**入力**:
```typescript
candidates = [
  { type: 'large-file', filePath: 'a.ts', description: 'Desc', suggestion: 'Sug', priority: 'high' },
  { type: 'duplication', filePath: '', description: '', suggestion: '', priority: 'high' } // 無効
]
candidateType = 'refactor'
```

**期待結果**:
- 戻り値が1個の有効な候補を含む配列（1番目のみ）
- `this.validateRefactorCandidate()`が2回呼び出される
- ログに`'Parsed 2 refactor candidates, 1 valid after validation.'`が記録される

**テストデータ**: 上記candidates

---

#### 2.2.5 境界値: 空の候補リスト

**テストケース名**: `validateAnalysisResult_空リスト_空配列返却`

**目的**: 候補リストが空の場合、空配列が返されることを検証

**前提条件**:
- 候補リストが空配列

**入力**:
```typescript
candidates = []
candidateType = 'bug'
```

**期待結果**:
- 戻り値が空配列（`[]`）
- `this.validateBugCandidate()`は呼び出されない
- ログに`'Parsed 0 bug candidates, 0 valid after validation.'`が記録される

**テストデータ**: なし

---

#### 2.2.6 境界値: 全ての候補が無効

**テストケース名**: `validateAnalysisResult_全無効_空配列返却`

**目的**: 全ての候補が無効な場合、空配列が返されることを検証

**前提条件**:
- `this.validateBugCandidate()`が全候補に対してfalseを返す

**入力**:
```typescript
candidates = [
  { title: '', file: '', line: 0, severity: 'high', description: '', suggestedFix: '', category: 'bug' },
  { title: '', file: '', line: 0, severity: 'high', description: '', suggestedFix: '', category: 'bug' }
]
candidateType = 'bug'
```

**期待結果**:
- 戻り値が空配列（`[]`）
- `this.validateBugCandidate()`が2回呼び出される
- ログに`'Parsed 2 bug candidates, 0 valid after validation.'`が記録される

**テストデータ**: 上記candidates

---

## 3. インテグレーションテストシナリオ

### 3.1 analyze メソッド（リグレッションテスト）

#### 3.1.1 正常系: バグ候補検出の完全なフロー

**シナリオ名**: `analyze_完全フロー_リファクタリング前後一致`

**目的**: リファクタリング前後で`analyze()`メソッドの動作が完全に一致することを検証

**前提条件**:
- Codexエージェントが利用可能
- プロンプトテンプレート（`detect-bugs.txt`）が存在する
- リポジトリパスが有効

**テスト手順**:
1. リファクタリング前のコードで`analyze(repoPath, 'auto')`を実行し、結果を記録
2. リファクタリング後のコードで同じ入力で`analyze(repoPath, 'auto')`を実行
3. 戻り値、ログ出力、副作用（ファイル生成・削除）を比較

**期待結果**:
- 戻り値（`BugCandidate[]`）がリファクタリング前後で完全に一致
- ログ出力が同じ順序・内容で記録される
- 一時ファイルが正常にクリーンアップされる（`cleanupOutputFile()`呼び出し確認）
- エラーがスローされない

**確認項目**:
- [ ] 戻り値の配列長が一致
- [ ] 各候補の`title`, `file`, `line`, `severity`, `description`, `suggestedFix`, `category`が一致
- [ ] ログに`'Analyzing repository: {repoPath}'`が記録される
- [ ] ログに`'Using Codex agent for analysis.'`が記録される
- [ ] ログに`'Parsed N bug candidates, M valid after validation.'`が記録される
- [ ] 一時ファイルが最終的に削除される

---

#### 3.1.2 正常系: エージェントフォールバック動作の維持

**シナリオ名**: `analyze_Codex失敗フォールバック_動作維持`

**目的**: `agent='auto'`でCodex失敗時のClaudeフォールバック動作がリファクタリング前後で一致することを検証

**前提条件**:
- Codexエージェントが実行失敗をシミュレート（モック）
- Claudeエージェントが利用可能

**テスト手順**:
1. `this.codexClient.executeTask()`がエラーをスローするようモック設定
2. `analyze(repoPath, 'auto')`を実行
3. Claudeエージェントが呼び出されることを確認

**期待結果**:
- `this.codexClient.executeTask()`が1回呼び出される（失敗）
- `this.claudeClient.executeTask()`が1回呼び出される（成功）
- ログに`'Codex failed (...), falling back to Claude.'`が記録される
- ログに`'Using Claude agent for analysis.'`が記録される
- バグ候補が正常に返される

**確認項目**:
- [ ] エージェントフォールバックが発生する
- [ ] 最終的にClaudeエージェントで結果が取得される
- [ ] ログ出力が期待通り
- [ ] 一時ファイルがクリーンアップされる

---

#### 3.1.3 異常系: エージェント実行失敗時のクリーンアップ

**シナリオ名**: `analyze_エージェント失敗_クリーンアップ実行`

**目的**: エージェント実行失敗時も`finally`ブロックでクリーンアップが実行されることを検証

**前提条件**:
- 両エージェントが利用不可またはエラーをスローする

**テスト手順**:
1. `this.codexClient`と`this.claudeClient`を両方nullに設定
2. `analyze(repoPath, 'auto')`を実行
3. エラーがスローされることを確認
4. `cleanupOutputFile()`が呼び出されることを確認

**期待結果**:
- `Error`例外がスローされる
- `cleanupOutputFile()`が1回呼び出される（`finally`ブロック）
- 一時ファイルが削除される

**確認項目**:
- [ ] 例外がスローされる
- [ ] `cleanupOutputFile()`が必ず実行される
- [ ] 一時ファイルが残らない

---

### 3.2 analyzeForRefactoring メソッド（リグレッションテスト）

#### 3.2.1 正常系: リファクタリング候補検出の完全なフロー

**シナリオ名**: `analyzeForRefactoring_完全フロー_リファクタリング前後一致`

**目的**: リファクタリング前後で`analyzeForRefactoring()`メソッドの動作が完全に一致することを検証

**前提条件**:
- Codexエージェントが利用可能
- プロンプトテンプレート（`detect-refactoring.txt`）が存在する
- リポジトリパスが有効

**テスト手順**:
1. リファクタリング前のコードで`analyzeForRefactoring(repoPath, 'auto')`を実行し、結果を記録
2. リファクタリング後のコードで同じ入力で`analyzeForRefactoring(repoPath, 'auto')`を実行
3. 戻り値、ログ出力、副作用を比較

**期待結果**:
- 戻り値（`RefactorCandidate[]`）がリファクタリング前後で完全に一致
- ログ出力が同じ順序・内容で記録される
- 一時ファイルが正常にクリーンアップされる
- エラーがスローされない

**確認項目**:
- [ ] 戻り値の配列長が一致
- [ ] 各候補の`type`, `filePath`, `lineRange`, `description`, `suggestion`, `priority`が一致
- [ ] ログに`'Analyzing repository for refactoring: {repoPath}'`が記録される
- [ ] ログに`'Using Codex agent for analysis.'`が記録される
- [ ] ログに`'Parsed N refactor candidates, M valid after validation.'`が記録される
- [ ] 一時ファイルが最終的に削除される

---

#### 3.2.2 正常系: バリデーション動作の維持

**シナリオ名**: `analyzeForRefactoring_バリデーション_動作維持`

**目的**: リファクタリング候補のバリデーション動作がリファクタリング前後で一致することを検証

**前提条件**:
- エージェントが有効・無効混在のリファクタリング候補を返す

**テスト手順**:
1. `this.codexClient.executeTask()`が有効・無効混在の候補を含むJSONを出力するようモック設定
2. `analyzeForRefactoring(repoPath, 'codex')`を実行
3. 有効な候補のみが返されることを確認

**期待結果**:
- `this.validateRefactorCandidate()`が各候補に対して呼び出される
- 無効な候補（例: `filePath`が空）がフィルタリングされる
- ログに`'Parsed N refactor candidates, M valid after validation.'`が記録される（M < N）
- 有効な候補のみが戻り値に含まれる

**確認項目**:
- [ ] バリデーションロジックが実行される
- [ ] 無効な候補が除外される
- [ ] ログ出力が正確

---

#### 3.2.3 正常系: Claude強制モード

**シナリオ名**: `analyzeForRefactoring_Claude強制_正常動作`

**目的**: `agent='claude'`でClaudeエージェントが強制使用され、正常に動作することを検証

**前提条件**:
- Claudeエージェントが利用可能
- `agent='claude'`が指定される

**テスト手順**:
1. `analyzeForRefactoring(repoPath, 'claude')`を実行
2. Claudeエージェントが呼び出されることを確認

**期待結果**:
- `this.codexClient.executeTask()`は呼び出されない
- `this.claudeClient.executeTask()`が1回呼び出される
- ログに`'Using Claude agent for analysis.'`が記録される
- リファクタリング候補が正常に返される

**確認項目**:
- [ ] Claudeエージェントのみが使用される
- [ ] Codexエージェントは使用されない
- [ ] 結果が正常に返される

---

### 3.3 統合シナリオ: analyze + analyzeForRefactoring

#### 3.3.1 正常系: 連続実行での独立性

**シナリオ名**: `analyze_analyzeForRefactoring_連続実行_独立性`

**目的**: `analyze()`と`analyzeForRefactoring()`を連続実行した場合、互いに影響を与えないことを検証

**前提条件**:
- 両エージェントが利用可能
- 両プロンプトテンプレートが存在する

**テスト手順**:
1. `analyze(repoPath, 'auto')`を実行し、結果Aを取得
2. `analyzeForRefactoring(repoPath, 'auto')`を実行し、結果Bを取得
3. 再度`analyze(repoPath, 'auto')`を実行し、結果Cを取得
4. 結果AとCが一致することを確認

**期待結果**:
- 結果Aと結果Cが完全に一致（`analyzeForRefactoring()`の影響を受けない）
- 結果Bが独立した結果である
- 各メソッドが独立した一時ファイルを使用する
- 一時ファイルが各実行後にクリーンアップされる

**確認項目**:
- [ ] 連続実行で結果が一貫している
- [ ] 一時ファイルの競合がない
- [ ] クリーンアップが各実行後に実行される

---

## 4. テストデータ

### 4.1 プロンプトテンプレート

#### バグ検出用プロンプト（`detect-bugs.txt`）

```
Analyze the repository at {repository_path} and identify potential bugs.
Output the results to {output_file_path} in JSON format.

Expected output format:
{
  "candidates": [
    {
      "title": "Bug title",
      "file": "path/to/file.ts",
      "line": 123,
      "severity": "high",
      "description": "Bug description",
      "suggestedFix": "How to fix",
      "category": "bug"
    }
  ]
}
```

#### リファクタリング検出用プロンプト（`detect-refactoring.txt`）

```
Analyze the repository at {repository_path} for refactoring opportunities.
Output the results to {output_file_path} in JSON format.

Expected output format:
{
  "candidates": [
    {
      "type": "large-file",
      "filePath": "path/to/file.ts",
      "lineRange": { "start": 1, "end": 500 },
      "description": "Refactor description",
      "suggestion": "How to refactor",
      "priority": "high"
    }
  ]
}
```

### 4.2 モックデータ

#### 有効なバグ候補（正常データ）

```typescript
const validBugCandidates: BugCandidate[] = [
  {
    title: 'Null pointer dereference',
    file: 'src/utils/helper.ts',
    line: 42,
    severity: 'high',
    description: 'Potential null pointer access without null check',
    suggestedFix: 'Add null check before accessing property',
    category: 'bug'
  },
  {
    title: 'Missing error handling',
    file: 'src/core/processor.ts',
    line: 89,
    severity: 'medium',
    description: 'Async function without try-catch block',
    suggestedFix: 'Wrap async call in try-catch',
    category: 'bug'
  }
];
```

#### 無効なバグ候補（異常データ）

```typescript
const invalidBugCandidates: BugCandidate[] = [
  {
    title: '', // 空のタイトル
    file: '',
    line: 0,
    severity: 'high',
    description: '',
    suggestedFix: '',
    category: 'bug'
  }
];
```

#### 有効なリファクタリング候補（正常データ）

```typescript
const validRefactorCandidates: RefactorCandidate[] = [
  {
    type: 'large-file',
    filePath: 'src/core/repository-analyzer.ts',
    lineRange: { start: 1, end: 800 },
    description: 'File exceeds 500 lines',
    suggestion: 'Split into multiple modules',
    priority: 'high'
  },
  {
    type: 'duplication',
    filePath: 'src/core/repository-analyzer.ts',
    lineRange: { start: 234, end: 305 },
    description: 'Code duplication detected',
    suggestion: 'Extract common method',
    priority: 'high'
  }
];
```

#### 無効なリファクタリング候補（異常データ）

```typescript
const invalidRefactorCandidates: RefactorCandidate[] = [
  {
    type: 'large-file',
    filePath: '', // 空のファイルパス
    description: '',
    suggestion: '',
    priority: 'high'
  }
];
```

### 4.3 境界値データ

#### 空の候補リスト

```typescript
const emptyCandidates = [];
```

#### 大量の候補（パフォーマンステスト用）

```typescript
const largeCandidateList: BugCandidate[] = Array.from({ length: 100 }, (_, i) => ({
  title: `Bug ${i + 1}`,
  file: `src/file${i % 10}.ts`,
  line: (i + 1) * 10,
  severity: ['high', 'medium', 'low'][i % 3] as 'high' | 'medium' | 'low',
  description: `Description for bug ${i + 1}`,
  suggestedFix: `Fix for bug ${i + 1}`,
  category: 'bug'
}));
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

**ローカル開発環境**:
- Node.js 20以上
- npm 10以上
- TypeScript 5.x
- Jest（テストフレームワーク）

**CI/CD環境**:
- GitHub Actions（推奨）
- Node.js 20イメージ
- 環境変数設定（`CODEX_API_KEY`、`CLAUDE_CODE_CREDENTIALS_PATH`）のモック

### 5.2 必要な外部サービス・データベース

**外部サービス**:
- Codex API（モック可能）
- Claude Code SDK（モック可能）

**データベース**:
- なし

### 5.3 モック/スタブの必要性

#### 必須のモック

1. **CodexAgentClient**
   - `executeTask()`メソッドのモック
   - 成功パターン、失敗パターン、タイムアウトパターン

2. **ClaudeAgentClient**
   - `executeTask()`メソッドのモック
   - 成功パターン、失敗パターン

3. **fs-extra**
   - `existsSync()`のモック（プロンプトテンプレート存在確認）
   - `readFileSync()`のモック（プロンプトテンプレート読み込み）
   - 出力ファイル読み込み・削除のモック（`readOutputFile`、`cleanupOutputFile`内で使用）

4. **logger**
   - `logger.info()`、`logger.warn()`、`logger.debug()`のモック（ログ出力確認用）

#### モック設定のベストプラクティス

- **型パラメータ明示**: `jest.spyOn<RepositoryAnalyzer, 'executeAgentWithFallback'>()`
- **モッククリーンアップ**: `afterEach(() => jest.restoreAllMocks())`
- **モックヘルパー関数**: `setupMocks()`関数でモック設定を一元管理

---

## 6. テスト実行計画

### 6.1 ユニットテスト実行

**コマンド**:
```bash
npm run test:unit -- repository-analyzer.test.ts
```

**目標カバレッジ**: 90%以上

**実行頻度**: コミット毎

### 6.2 インテグレーションテスト実行

**コマンド**:
```bash
npm run test:integration
```

**実行頻度**: PR作成時、マージ前

### 6.3 カバレッジレポート

**コマンド**:
```bash
npm run test:coverage
```

**確認項目**:
- [ ] `executeAgentWithFallback()`のカバレッジが90%以上
- [ ] `validateAnalysisResult()`のカバレッジが90%以上
- [ ] `analyze()`のカバレッジが90%以上
- [ ] `analyzeForRefactoring()`のカバレッジが90%以上

---

## 7. 品質ゲート（Phase 3: Test Scenario）

本テストシナリオは以下の品質ゲートを満たしていることを確認しました:

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテストとインテグレーションテストの両方を網羅
- [x] **主要な正常系がカバーされている**:
  - ユニットテスト: Codex成功、Claudeフォールバック、変数置換、バリデーション（全有効）
  - インテグレーションテスト: `analyze()`と`analyzeForRefactoring()`の完全なフロー
- [x] **主要な異常系がカバーされている**:
  - プロンプトファイル不在、両エージェント利用不可、Codex強制モード失敗
  - エージェント実行失敗時のクリーンアップ
- [x] **期待結果が明確である**: 各テストケースにおいて、戻り値、ログ出力、メソッド呼び出し回数、エラー内容が明確に記載されている

---

## 8. まとめ

本テストシナリオは、Issue #155（コード重複の削減: repository-analyzer.ts）のリファクタリングを検証するための包括的なテスト計画を提示しました。

### 主要なポイント

1. **テスト戦略: UNIT_INTEGRATION**
   - 新規メソッド（`executeAgentWithFallback`、`validateAnalysisResult`）のユニットテスト: 13ケース
   - 既存メソッド（`analyze`、`analyzeForRefactoring`）のインテグレーションテスト: 7ケース
   - **合計20テストシナリオ**を網羅

2. **網羅的なカバレッジ**
   - 正常系: Codex成功、Claudeフォールバック、変数置換、バリデーション
   - 異常系: プロンプト不在、エージェント利用不可、実行失敗
   - 境界値: 空リスト、全無効、大量データ

3. **リグレッション防止**
   - リファクタリング前後の出力比較テスト
   - エージェントフォールバック動作の維持確認
   - クリーンアップ動作の検証

4. **テストカバレッジ目標: 90%以上**
   - 新規メソッドのカバレッジ: 90%以上
   - 既存メソッドのリグレッション: 100%

### 次のフェーズ（Phase 4: Implementation）

次のフェーズでは、本テストシナリオに基づいて実装を進めます。テスト駆動開発（TDD）アプローチを推奨し、以下の順序で実施します：

1. ユニットテストの実装（新規メソッド用）
2. 新規メソッドの実装（`executeAgentWithFallback`、`validateAnalysisResult`）
3. 既存メソッドのリファクタリング（`analyze`、`analyzeForRefactoring`）
4. インテグレーションテストの実行とリグレッション検証

---

**作成日**: 2025-01-30
**バージョン**: 1.0
**作成者**: AI Workflow Agent (Test Scenario Phase)
