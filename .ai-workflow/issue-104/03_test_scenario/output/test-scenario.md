# テストシナリオ - Issue #104

## 0. Planning Document の確認

Planning Phase (Phase 0) で策定された開発計画を確認しました。主要な戦略は以下の通りです：

### 開発計画の全体像
- **複雑度**: 中程度
- **見積もり工数**: 10~14時間
- **実装戦略**: EXTEND（既存の `IssueClient.createIssueFromEvaluation()` メソッドを拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテストとインテグレーションテストの組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストの拡張 + 新規テスト作成）

### 主なリスク
- `RemainingTask` 型の拡張による後方互換性の破壊（軽減策: すべてオプショナルフィールドとして定義）
- Evaluation レポートから詳細情報を抽出できない可能性（軽減策: フォールバック処理とデフォルト値の使用）
- タイトル生成のキーワード抽出が不正確（軽減策: シンプルなアルゴリズムとフォールバック）

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

### 1.2 テスト対象の範囲

#### ユニットテスト対象
- `IssueClient.extractKeywords()` メソッド: キーワード抽出ロジック
- `IssueClient.generateFollowUpTitle()` メソッド: タイトル生成ロジック
- `IssueClient.formatTaskDetails()` メソッド: タスク詳細フォーマット

#### インテグレーションテスト対象
- `IssueClient.createIssueFromEvaluation()` メソッド: 全体フロー（タイトル生成 + 本文生成 + GitHub API連携）
- Evaluation Phase → IssueClient の統合フロー
- GitHub API（Octokit）モック統合

#### 後方互換性テスト対象
- 新規パラメータ未指定時の動作（既存の呼び出し元が壊れないことを確認）

### 1.3 テストの目的

1. **機能正確性の検証**: フォローアップ Issue のタイトルと本文が要件通りに生成されることを確認
2. **境界値・異常系の検証**: 空配列、長文、特殊文字等のエッジケースで正しく動作することを確認
3. **統合性の検証**: Evaluation Phase から IssueClient への情報伝達フローが正しく動作することを確認
4. **後方互換性の検証**: 既存の呼び出し元が無変更で動作することを確認

---

## 2. ユニットテストシナリオ

### 2.1 `extractKeywords()` メソッドのテスト

#### テストケース 2.1.1: 正常系 - 3つのタスクから3つのキーワードを抽出

**目的**: 残タスクリストから主要なキーワードが正しく抽出されることを検証

**前提条件**:
- `RemainingTask[]` が3つの有効なタスクを含む

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
  { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
  { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
];
const maxCount = 3;
```

**期待結果**:
```typescript
['Coverage improvement to 90%', 'Performance benchmark execution', 'Documentation updates']
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.2: 正常系 - 括弧前まで抽出（日本語括弧）

**目的**: 日本語括弧（`（`）の前までキーワードが抽出されることを検証

**前提条件**:
- タスクテキストに日本語括弧が含まれる

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Jest設定を修正（src/jest.config.js）', phase: 'implementation', priority: 'High' },
];
const maxCount = 1;
```

**期待結果**:
```typescript
['Jest設定を修正']
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.3: 正常系 - 括弧前まで抽出（英語括弧）

**目的**: 英語括弧（`(`）の前までキーワードが抽出されることを検証

**前提条件**:
- タスクテキストに英語括弧が含まれる

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
];
const maxCount = 1;
```

**期待結果**:
```typescript
['Fix Jest configuration']
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.4: 境界値 - タスクテキストが20文字を超える場合

**目的**: タスクテキストが20文字を超える場合、20文字で切り詰められることを検証

**前提条件**:
- タスクテキストが20文字を超える

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
];
const maxCount = 1;
```

**期待結果**:
```typescript
['This is a very long']  // 20文字
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.5: 境界値 - 空配列

**目的**: 空の残タスクリストが渡された場合、空配列が返されることを検証

**前提条件**:
- `RemainingTask[]` が空配列

**入力**:
```typescript
const tasks: RemainingTask[] = [];
const maxCount = 3;
```

**期待結果**:
```typescript
[]
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.6: 境界値 - maxCount より多いタスクがある場合

**目的**: タスク数が `maxCount` を超える場合、最初の `maxCount` 個のみが処理されることを検証

**前提条件**:
- `RemainingTask[]` が10個のタスクを含む

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: 'Task 1', phase: 'p1', priority: 'High' },
  { task: 'Task 2', phase: 'p2', priority: 'High' },
  { task: 'Task 3', phase: 'p3', priority: 'High' },
  { task: 'Task 4', phase: 'p4', priority: 'High' },
  { task: 'Task 5', phase: 'p5', priority: 'High' },
  { task: 'Task 6', phase: 'p6', priority: 'High' },
  { task: 'Task 7', phase: 'p7', priority: 'High' },
  { task: 'Task 8', phase: 'p8', priority: 'High' },
  { task: 'Task 9', phase: 'p9', priority: 'High' },
  { task: 'Task 10', phase: 'p10', priority: 'High' },
];
const maxCount = 3;
```

**期待結果**:
```typescript
['Task 1', 'Task 2', 'Task 3']  // 最初の3つのみ
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.7: 異常系 - タスクテキストが空文字列

**目的**: タスクテキストが空文字列の場合、スキップされることを検証

**前提条件**:
- タスクテキストが空文字列

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: '', phase: 'implementation', priority: 'High' },
  { task: 'Valid task', phase: 'testing', priority: 'Medium' },
];
const maxCount = 2;
```

**期待結果**:
```typescript
['Valid task']  // 空文字列はスキップ
```

**テストデータ**: 上記 `tasks`

---

#### テストケース 2.1.8: 異常系 - すべてのタスクテキストが空

**目的**: すべてのタスクテキストが空の場合、空配列が返されることを検証

**前提条件**:
- すべてのタスクテキストが空文字列

**入力**:
```typescript
const tasks: RemainingTask[] = [
  { task: '', phase: 'p1', priority: 'High' },
  { task: '   ', phase: 'p2', priority: 'Medium' },
];
const maxCount = 2;
```

**期待結果**:
```typescript
[]
```

**テストデータ**: 上記 `tasks`

---

### 2.2 `generateFollowUpTitle()` メソッドのテスト

#### テストケース 2.2.1: 正常系 - キーワードが抽出できた場合のタイトル生成

**目的**: キーワードが正しく抽出され、タイトルが正しいフォーマットで生成されることを検証

**前提条件**:
- `RemainingTask[]` が有効なタスクを含む

**入力**:
```typescript
const issueNumber = 91;
const tasks: RemainingTask[] = [
  { task: 'テストカバレッジ改善', phase: 'test_implementation', priority: 'Medium' },
  { task: 'パフォーマンスベンチマーク', phase: 'testing', priority: 'Medium' },
];
```

**期待結果**:
```typescript
'[FOLLOW-UP] #91: テストカバレッジ改善・パフォーマンスベンチマーク'
```

**テストデータ**: 上記 `issueNumber`, `tasks`

---

#### テストケース 2.2.2: 正常系 - 1つのキーワードのみの場合

**目的**: 1つのタスクから1つのキーワードが抽出され、正しくタイトルが生成されることを検証

**前提条件**:
- `RemainingTask[]` が1つのタスクのみを含む

**入力**:
```typescript
const issueNumber = 52;
const tasks: RemainingTask[] = [
  { task: 'ドキュメント更新', phase: 'documentation', priority: 'Low' },
];
```

**期待結果**:
```typescript
'[FOLLOW-UP] #52: ドキュメント更新'
```

**テストデータ**: 上記 `issueNumber`, `tasks`

---

#### テストケース 2.2.3: 境界値 - タイトルが80文字以内の場合

**目的**: タイトルが80文字以内の場合、そのまま返されることを検証

**前提条件**:
- 生成されるタイトルが80文字以内

**入力**:
```typescript
const issueNumber = 74;
const tasks: RemainingTask[] = [
  { task: 'ESLintルール追加', phase: 'implementation', priority: 'High' },
  { task: 'SecretMasker統合検討', phase: 'design', priority: 'Medium' },
];
```

**期待結果**:
```typescript
'[FOLLOW-UP] #74: ESLintルール追加・SecretMasker統合検討'  // 80文字以内
```

**テストデータ**: 上記 `issueNumber`, `tasks`

---

#### テストケース 2.2.4: 境界値 - タイトルが80文字を超える場合

**目的**: タイトルが80文字を超える場合、77文字で切り詰められ、末尾に `...` が追加されることを検証

**前提条件**:
- 生成されるタイトルが80文字を超える

**入力**:
```typescript
const issueNumber = 123;
const tasks: RemainingTask[] = [
  { task: 'Very long task description number one', phase: 'implementation', priority: 'High' },
  { task: 'Very long task description number two', phase: 'implementation', priority: 'High' },
  { task: 'Very long task description number three', phase: 'implementation', priority: 'High' },
];
```

**期待結果**:
- タイトルの長さが80文字である
- タイトルが `...` で終わる

**テストデータ**: 上記 `issueNumber`, `tasks`

---

#### テストケース 2.2.5: 異常系 - キーワードが抽出できない場合のフォールバック

**目的**: キーワードが抽出できない場合、フォールバック形式（`[FOLLOW-UP] Issue #{issueNumber} - 残タスク`）が使用されることを検証

**前提条件**:
- すべてのタスクテキストが空

**入力**:
```typescript
const issueNumber = 52;
const tasks: RemainingTask[] = [
  { task: '', phase: 'implementation', priority: 'High' },
];
```

**期待結果**:
```typescript
'[FOLLOW-UP] Issue #52 - 残タスク'
```

**テストデータ**: 上記 `issueNumber`, `tasks`

---

### 2.3 `formatTaskDetails()` メソッドのテスト

#### テストケース 2.3.1: 正常系 - すべてのオプショナルフィールドが存在する場合

**目的**: すべてのオプショナルフィールドが存在する場合、すべてのセクションが正しく表示されることを検証

**前提条件**:
- `RemainingTask` がすべてのオプショナルフィールドを含む

**入力**:
```typescript
const task: RemainingTask = {
  task: 'カバレッジを 90% に改善',
  phase: 'test_implementation',
  priority: 'Medium',
  priorityReason: '元 Issue #91 の推奨事項、ブロッカーではない',
  targetFiles: ['src/core/phase-factory.ts', 'src/commands/execute/agent-setup.ts'],
  steps: ['不足しているテストケースを特定', 'エッジケースのテストを追加'],
  acceptanceCriteria: ['90% 以上のカバレッジを達成', 'npm run test:coverage がすべてパス'],
  dependencies: ['Task 1 完了後に実行'],
  estimatedHours: '2-4h',
};
const taskNumber = 1;
```

**期待結果**:
- タスク見出し: `### Task 1: カバレッジを 90% に改善`
- 対象ファイルセクションが表示される
- 必要な作業セクションが表示される
- Acceptance Criteria セクションが表示される（チェックリスト形式）
- Phase: `test_implementation`
- 優先度: `Medium - 元 Issue #91 の推奨事項、ブロッカーではない`
- 見積もり: `2-4h`
- 依存タスクセクションが表示される

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.2: 正常系 - 最小限のフィールドのみ（オプショナルフィールドなし）

**目的**: オプショナルフィールドが存在しない場合、最小限の情報のみが表示されることを検証

**前提条件**:
- `RemainingTask` がオプショナルフィールドを含まない

**入力**:
```typescript
const task: RemainingTask = {
  task: 'ドキュメント更新',
  phase: 'documentation',
  priority: 'Low',
};
const taskNumber = 2;
```

**期待結果**:
- タスク見出し: `### Task 2: ドキュメント更新`
- 対象ファイルセクションが表示されない
- 必要な作業セクションが表示されない
- Acceptance Criteria セクションが表示されない
- Phase: `documentation`
- 優先度: `Low`（根拠なし）
- 見積もり: `未定`
- 依存タスクセクションが表示されない

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.3: 境界値 - targetFiles が空配列の場合

**目的**: `targetFiles` が空配列の場合、対象ファイルセクションが表示されないことを検証

**前提条件**:
- `RemainingTask.targetFiles` が空配列

**入力**:
```typescript
const task: RemainingTask = {
  task: 'テストケース追加',
  phase: 'test_implementation',
  priority: 'High',
  targetFiles: [],
};
const taskNumber = 1;
```

**期待結果**:
- 対象ファイルセクションが表示されない

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.4: 境界値 - steps が1個の場合

**目的**: `steps` が1個の場合、番号付きリストで正しく表示されることを検証

**前提条件**:
- `RemainingTask.steps` が1つの要素を含む

**入力**:
```typescript
const task: RemainingTask = {
  task: 'シンプルなタスク',
  phase: 'implementation',
  priority: 'Medium',
  steps: ['修正を適用'],
};
const taskNumber = 1;
```

**期待結果**:
- 必要な作業セクション:
  ```
  **必要な作業**:

  1. 修正を適用
  ```

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.5: 境界値 - acceptanceCriteria が複数ある場合

**目的**: `acceptanceCriteria` が複数ある場合、すべてチェックリスト形式で表示されることを検証

**前提条件**:
- `RemainingTask.acceptanceCriteria` が3つの要素を含む

**入力**:
```typescript
const task: RemainingTask = {
  task: '複雑なタスク',
  phase: 'testing',
  priority: 'High',
  acceptanceCriteria: [
    'すべてのテストがパス',
    'カバレッジ 90% 以上',
    'パフォーマンスが 10% 改善',
  ],
};
const taskNumber = 1;
```

**期待結果**:
- Acceptance Criteria セクション:
  ```
  **Acceptance Criteria**:

  - [ ] すべてのテストがパス
  - [ ] カバレッジ 90% 以上
  - [ ] パフォーマンスが 10% 改善
  ```

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.6: 異常系 - phase が未定義の場合

**目的**: `phase` が未定義（`undefined`）の場合、デフォルト値 `'unknown'` が表示されることを検証

**前提条件**:
- `RemainingTask.phase` が `undefined`

**入力**:
```typescript
const task: RemainingTask = {
  task: 'フェーズ不明のタスク',
  priority: 'Medium',
};
const taskNumber = 1;
```

**期待結果**:
- Phase: `unknown`

**テストデータ**: 上記 `task`, `taskNumber`

---

#### テストケース 2.3.7: 異常系 - priority が未定義の場合

**目的**: `priority` が未定義（`undefined`）の場合、デフォルト値 `'中'` が表示されることを検証

**前提条件**:
- `RemainingTask.priority` が `undefined`

**入力**:
```typescript
const task: RemainingTask = {
  task: '優先度不明のタスク',
  phase: 'implementation',
};
const taskNumber = 1;
```

**期待結果**:
- 優先度: `中`

**テストデータ**: 上記 `task`, `taskNumber`

---

## 3. インテグレーションテストシナリオ

### 3.1 `createIssueFromEvaluation()` メソッドの統合テスト

#### シナリオ 3.1.1: issueContext 指定時の Issue 作成

**目的**: `issueContext` パラメータが指定された場合、背景セクションが正しく含まれ、タイトルが改善された形式で Issue が作成されることを検証

**前提条件**:
- GitHub API（Octokit）がモック化されている
- `issueContext` オブジェクトが有効な値を含む

**テスト手順**:
1. `RemainingTask[]` を準備（2つのタスク）
2. `IssueContext` オブジェクトを準備（summary, blockerStatus, deferredReason を含む）
3. `createIssueFromEvaluation()` を呼び出す（`issueContext` を渡す）
4. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が以下のパラメータで呼び出される:
  - `title`: `[FOLLOW-UP] #91: {キーワード1}・{キーワード2}` 形式
  - `body`: 以下のセクションを含む:
    - `## 背景`
    - `### 元 Issue のステータス`
    - `### なぜこれらのタスクが残ったか`
    - `## 残タスク詳細`
    - `### Task 1: {task1.task}`
    - `### Task 2: {task2.task}`
    - `## 参考`
- `IssueCreationResult.success` が `true`
- `IssueCreationResult.issueNumber` が返される

**確認項目**:
- [ ] タイトルが改善された形式（キーワード含む）である
- [ ] 背景セクションに `issueContext.summary` が含まれる
- [ ] 元 Issue のステータスに `issueContext.blockerStatus` が含まれる
- [ ] タスクが残った理由に `issueContext.deferredReason` が含まれる
- [ ] 各タスクの詳細情報が正しくフォーマットされている

---

#### シナリオ 3.1.2: issueContext 未指定時の Issue 作成（後方互換性）

**目的**: `issueContext` パラメータが未指定の場合、フォールバック形式の背景セクションが使用され、Issue が作成されることを検証（後方互換性）

**前提条件**:
- GitHub API（Octokit）がモック化されている
- `issueContext` パラメータが未指定（`undefined`）

**テスト手順**:
1. `RemainingTask[]` を準備（1つのタスク）
2. `createIssueFromEvaluation()` を呼び出す（`issueContext` を渡さない）
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が以下のパラメータで呼び出される:
  - `title`: `[FOLLOW-UP] #{issueNumber}: {キーワード}` または `[FOLLOW-UP] Issue #{issueNumber} - 残タスク`（フォールバック）
  - `body`: フォールバック形式の背景セクションを含む:
    - `## 背景`
    - `AI Workflow Issue #{issueNumber} の評価フェーズで残タスクが見つかりました。`
- `IssueCreationResult.success` が `true`

**確認項目**:
- [ ] タイトルが生成される（キーワード抽出成功時）またはフォールバック形式（抽出失敗時）
- [ ] 背景セクションにフォールバックメッセージが含まれる
- [ ] 元 Issue のステータスセクションが表示されない
- [ ] タスクが残った理由セクションが表示されない
- [ ] 既存の呼び出し元と同じ動作をする（後方互換性）

---

#### シナリオ 3.1.3: 残タスク0件の場合（エッジケース）

**目的**: 残タスクが0件の場合でも、Issue が正常に作成されることを検証（エッジケース）

**前提条件**:
- GitHub API（Octokit）がモック化されている
- `RemainingTask[]` が空配列

**テスト手順**:
1. `RemainingTask[]` を空配列で準備
2. `createIssueFromEvaluation()` を呼び出す
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が呼び出される
- `title`: フォールバック形式（`[FOLLOW-UP] Issue #{issueNumber} - 残タスク`）
- `body`: 背景セクションのみ（残タスク詳細セクションは空）
- `IssueCreationResult.success` が `true`

**確認項目**:
- [ ] タイトルがフォールバック形式である
- [ ] 本文に「残タスク詳細」セクションが存在するが、タスクが0件である
- [ ] エラーが発生しない

---

#### シナリオ 3.1.4: 残タスク10件の場合（多数のタスク）

**目的**: 残タスクが10件の場合、すべてのタスクが正しく Issue 本文に含まれることを検証

**前提条件**:
- GitHub API（Octokit）がモック化されている
- `RemainingTask[]` が10個のタスクを含む

**テスト手順**:
1. `RemainingTask[]` を10個のタスクで準備
2. `createIssueFromEvaluation()` を呼び出す
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が呼び出される
- `title`: 最初の3つのタスクからキーワードを抽出したタイトル
- `body`: 10個すべてのタスクが含まれる（`### Task 1` ~ `### Task 10`）
- `IssueCreationResult.success` が `true`

**確認項目**:
- [ ] タイトルに最大3つのキーワードが含まれる
- [ ] 本文に10個すべてのタスクが含まれる
- [ ] 各タスクが正しくフォーマットされている

---

#### シナリオ 3.1.5: GitHub API エラー時のエラーハンドリング

**目的**: GitHub API 呼び出しがエラーを返す場合、適切にエラーハンドリングされることを検証

**前提条件**:
- GitHub API（Octokit）がモック化され、`issues.create()` がエラーをスローする

**テスト手順**:
1. `RemainingTask[]` を準備
2. Octokit モックを設定し、`issues.create()` がエラーをスローするようにする
3. `createIssueFromEvaluation()` を呼び出す
4. エラーが適切にキャッチされ、ログが記録されることを確認

**期待結果**:
- エラーがキャッチされる
- `logger.error()` が呼び出され、エラーメッセージが記録される
- エラーが再スローされる（呼び出し元でハンドリング可能）

**確認項目**:
- [ ] エラーがキャッチされる
- [ ] エラーログが記録される
- [ ] エラーが再スローされる

---

### 3.2 Evaluation Phase → IssueClient 統合フロー

#### シナリオ 3.2.1: handlePassWithIssues() から createIssueFromEvaluation() への情報伝達

**目的**: Evaluation Phase の `handlePassWithIssues()` メソッドから `createIssueFromEvaluation()` に正しく情報が渡されることを検証

**前提条件**:
- Evaluation Phase がモック化またはテスト環境で実行可能
- メタデータマネージャーに `issue_title` が設定されている
- GitHub API（Octokit）がモック化されている

**テスト手順**:
1. `EvaluationResult` を準備（`result: 'pass_with_issues'`, `remainingTasks` を含む）
2. メタデータマネージャーに `issue_title` を設定
3. `handlePassWithIssues()` を呼び出す
4. `createIssueFromEvaluation()` が正しいパラメータで呼び出されたことを確認（スパイまたはモック）

**期待結果**:
- `createIssueFromEvaluation()` が以下のパラメータで呼び出される:
  - `issueNumber`: 元 Issue 番号
  - `remainingTasks`: Evaluation 結果から取得した残タスクリスト
  - `evaluationReportPath`: Evaluation レポートのパス
  - `issueContext`: 以下の情報を含む:
    - `summary`: `この Issue は、Issue #{issueNumber}「{issueTitle}」の Evaluation フェーズで特定された残タスクをまとめたものです。`
    - `blockerStatus`: `すべてのブロッカーは解決済み`（デフォルト値）
    - `deferredReason`: `タスク優先度の判断により後回し`（デフォルト値）

**確認項目**:
- [ ] `createIssueFromEvaluation()` が正しいパラメータで呼び出される
- [ ] `issueContext.summary` に元 Issue タイトルが含まれる
- [ ] `issueContext.blockerStatus` がデフォルト値である
- [ ] `issueContext.deferredReason` がデフォルト値である

---

#### シナリオ 3.2.2: メタデータに issue_title がない場合のフォールバック

**目的**: メタデータに `issue_title` が存在しない場合、フォールバック値が使用されることを検証

**前提条件**:
- メタデータマネージャーに `issue_title` が設定されていない
- GitHub API（Octokit）がモック化されている

**テスト手順**:
1. `EvaluationResult` を準備（`result: 'pass_with_issues'`, `remainingTasks` を含む）
2. メタデータマネージャーに `issue_title` を設定しない
3. `handlePassWithIssues()` を呼び出す
4. `createIssueFromEvaluation()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `createIssueFromEvaluation()` が以下のパラメータで呼び出される:
  - `issueContext.summary`: `この Issue は、Issue #{issueNumber}「Issue #{issueNumber}」の Evaluation フェーズで特定された残タスクをまとめたものです。`（フォールバック）

**確認項目**:
- [ ] `issueContext.summary` にフォールバック値が使用される
- [ ] エラーが発生しない

---

## 4. 後方互換性テストシナリオ

### 4.1 新規パラメータ未指定時の動作検証

#### シナリオ 4.1.1: 既存の呼び出し元（issueContext なし）が壊れないことを確認

**目的**: 既存の呼び出し元が `issueContext` パラメータを指定しない場合、従来と同じ動作をすることを検証

**前提条件**:
- GitHub API（Octokit）がモック化されている

**テスト手順**:
1. `RemainingTask[]` を準備（従来形式、オプショナルフィールドなし）
2. `createIssueFromEvaluation()` を呼び出す（`issueContext` を指定しない）
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が呼び出される
- タイトルが生成される（キーワード抽出成功時）またはフォールバック形式
- 本文にフォールバック形式の背景セクションが含まれる
- `IssueCreationResult.success` が `true`

**確認項目**:
- [ ] タイトルが生成される
- [ ] 背景セクションにフォールバックメッセージが含まれる
- [ ] 既存の動作と一致する（リグレッションなし）

---

### 4.2 RemainingTask 型の拡張による影響検証

#### シナリオ 4.2.1: 新規フィールド未指定時の動作検証

**目的**: `RemainingTask` の新規オプショナルフィールドが未指定の場合、エラーが発生せず、既存の動作を維持することを検証

**前提条件**:
- GitHub API（Octokit）がモック化されている

**テスト手順**:
1. `RemainingTask[]` を準備（新規フィールドを含まない、従来形式）
   ```typescript
   const tasks: RemainingTask[] = [
     { task: 'Test task', phase: 'testing', priority: 'Medium' },
   ];
   ```
2. `createIssueFromEvaluation()` を呼び出す
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が呼び出される
- 本文に以下が含まれる:
  - `### Task 1: Test task`
  - `**Phase**: testing`
  - `**優先度**: Medium`
  - `**見積もり**: 未定`（デフォルト値）
- 新規フィールドのセクション（対象ファイル、必要な作業、Acceptance Criteria）は表示されない
- エラーが発生しない

**確認項目**:
- [ ] 新規フィールド未指定でエラーが発生しない
- [ ] 既存フィールドが正しく表示される
- [ ] デフォルト値が使用される（見積もり: `未定`）

---

#### シナリオ 4.2.2: 新規フィールド指定時の動作検証

**目的**: `RemainingTask` の新規オプショナルフィールドが指定された場合、正しく表示されることを検証

**前提条件**:
- GitHub API（Octokit）がモック化されている

**テスト手順**:
1. `RemainingTask[]` を準備（新規フィールドを含む）
   ```typescript
   const tasks: RemainingTask[] = [
     {
       task: 'Test task with new fields',
       phase: 'testing',
       priority: 'High',
       priorityReason: 'Blocker for next release',
       targetFiles: ['src/test.ts'],
       steps: ['Step 1', 'Step 2'],
       acceptanceCriteria: ['All tests pass'],
       dependencies: ['Task A'],
       estimatedHours: '1-2h',
     },
   ];
   ```
2. `createIssueFromEvaluation()` を呼び出す
3. モックされた Octokit API の `issues.create()` が正しいパラメータで呼び出されたことを確認

**期待結果**:
- `issues.create()` が呼び出される
- 本文にすべての新規フィールドが含まれる:
  - 対象ファイルセクション
  - 必要な作業セクション
  - Acceptance Criteria セクション
  - 優先度の根拠
  - 依存タスク
  - 見積もり工数

**確認項目**:
- [ ] すべての新規フィールドが正しく表示される
- [ ] Markdown フォーマットが正しい

---

## 5. テストデータ

### 5.1 RemainingTask テストデータセット

#### データセット A: 標準的なタスク（オプショナルフィールドなし）

```typescript
export const standardTasks: RemainingTask[] = [
  {
    task: 'Coverage improvement to 90%',
    phase: 'test_implementation',
    priority: 'Medium',
  },
  {
    task: 'Performance benchmark execution',
    phase: 'testing',
    priority: 'Medium',
  },
  {
    task: 'Documentation updates',
    phase: 'documentation',
    priority: 'Low',
  },
];
```

#### データセット B: すべてのフィールドを含むタスク

```typescript
export const fullTasks: RemainingTask[] = [
  {
    task: 'カバレッジを 90% に改善',
    phase: 'test_implementation',
    priority: 'Medium',
    priorityReason: '元 Issue #91 の推奨事項、ブロッカーではない',
    targetFiles: ['src/core/phase-factory.ts', 'src/commands/execute/agent-setup.ts'],
    steps: ['不足しているテストケースを特定', 'エッジケースのテストを追加'],
    acceptanceCriteria: ['90% 以上のカバレッジを達成', 'npm run test:coverage がすべてパス'],
    dependencies: ['Task 1 完了後に実行'],
    estimatedHours: '2-4h',
  },
];
```

#### データセット C: 空のタスクリスト

```typescript
export const emptyTasks: RemainingTask[] = [];
```

#### データセット D: 大量のタスク（10件）

```typescript
export const manyTasks: RemainingTask[] = Array.from({ length: 10 }, (_, i) => ({
  task: `Task ${i + 1}`,
  phase: `phase_${i + 1}`,
  priority: i % 3 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low',
}));
```

#### データセット E: 特殊文字を含むタスク

```typescript
export const specialCharTasks: RemainingTask[] = [
  {
    task: 'Jest設定を修正（src/jest.config.js）',
    phase: 'implementation',
    priority: 'High',
  },
  {
    task: 'Fix Jest configuration (src/jest.config.js)',
    phase: 'implementation',
    priority: 'High',
  },
  {
    task: 'タスク with <HTML> & "special" characters',
    phase: 'testing',
    priority: 'Medium',
  },
];
```

### 5.2 IssueContext テストデータセット

#### データセット A: 標準的な IssueContext

```typescript
export const standardIssueContext: IssueContext = {
  summary: 'この Issue は、Issue #91「テスト失敗修正」の Evaluation フェーズで特定された残タスクをまとめたものです。',
  blockerStatus: 'すべてのブロッカーは解決済み',
  deferredReason: 'テスト失敗修正を優先したため、カバレッジ改善は後回しにした',
};
```

#### データセット B: 空の IssueContext（デフォルト値）

```typescript
export const defaultIssueContext: IssueContext = {
  summary: 'AI Workflow Issue #52 の評価フェーズで残タスクが見つかりました。',
  blockerStatus: 'すべてのブロッカーは解決済み',
  deferredReason: 'タスク優先度の判断により後回し',
};
```

---

## 6. テスト環境要件

### 6.1 必要なテスト環境

- **ローカル環境**: Node.js 20 以上、npm 10 以上
- **CI/CD 環境**: GitHub Actions（既存の CI/CD パイプライン）

### 6.2 必要な外部サービス・データベース

- **GitHub API**: モック化（Octokit モック使用）
- **データベース**: 不要（ファイルシステムのみ使用）

### 6.3 モック/スタブの必要性

#### 必須モック
1. **Octokit（GitHub API クライアント）**:
   - `issues.create()` メソッドのモック
   - モックレスポンス: `{ data: { number: 123, html_url: 'https://github.com/...' } }`

2. **Logger**（オプション）:
   - `logger.info()`, `logger.error()` のスパイ（テスト時のログ出力を確認する場合）

#### オプションモック
1. **MetadataManager**（Evaluation Phase 統合テスト時）:
   - `getMetadata()` メソッドのモック
   - `updatePhase()` メソッドのスパイ

---

## 7. 品質ゲート確認（Phase 3）

### 7.1 Phase 2の戦略に沿ったテストシナリオである

- [x] **UNIT_INTEGRATION 戦略に準拠**
  - ユニットテストシナリオ（セクション2）: `extractKeywords()`, `generateFollowUpTitle()`, `formatTaskDetails()` の詳細テスト
  - インテグレーションテストシナリオ（セクション3）: `createIssueFromEvaluation()` 統合テスト、Evaluation Phase 統合テスト
  - BDD シナリオは不要（Phase 2 の判断通り）

### 7.2 主要な正常系がカバーされている

- [x] **ユニットテスト正常系**:
  - テストケース 2.1.1: 3つのタスクから3つのキーワードを抽出
  - テストケース 2.1.2, 2.1.3: 括弧前まで抽出（日本語・英語）
  - テストケース 2.2.1, 2.2.2: タイトル生成（複数・単一キーワード）
  - テストケース 2.3.1, 2.3.2: タスク詳細フォーマット（すべてのフィールド・最小限のフィールド）

- [x] **インテグレーションテスト正常系**:
  - シナリオ 3.1.1: `issueContext` 指定時の Issue 作成
  - シナリオ 3.2.1: Evaluation Phase → IssueClient 統合フロー

### 7.3 主要な異常系がカバーされている

- [x] **ユニットテスト異常系**:
  - テストケース 2.1.7, 2.1.8: タスクテキストが空
  - テストケース 2.2.5: キーワード抽出失敗時のフォールバック
  - テストケース 2.3.6, 2.3.7: phase/priority が未定義

- [x] **インテグレーションテスト異常系**:
  - シナリオ 3.1.5: GitHub API エラー時のエラーハンドリング
  - シナリオ 3.2.2: メタデータに issue_title がない場合のフォールバック

### 7.4 期待結果が明確である

- [x] **すべてのテストケース・シナリオに期待結果が明記されている**
  - ユニットテスト: 入力と期待される出力を具体的に記載
  - インテグレーションテスト: 期待される動作と確認項目を明記
  - 後方互換性テスト: 既存の動作との一致を確認

---

## 8. テストカバレッジ目標

### 8.1 全体目標

**90% 以上**（要件定義書 NFR-4 より）

### 8.2 重要なメソッドのカバレッジ目標

**100%**:
- `extractKeywords()`
- `generateFollowUpTitle()`
- `formatTaskDetails()`
- `createIssueFromEvaluation()`

---

## 9. テスト実施優先度

### 9.1 優先度 High（クリティカルパス）

1. **ユニットテスト**: `extractKeywords()`, `generateFollowUpTitle()`
   - タイトル生成の核心機能
   - 境界値テスト（80文字制限、空配列）が重要

2. **インテグレーションテスト**: `createIssueFromEvaluation()` の Issue 作成フロー
   - タイトル + 本文生成 + GitHub API 連携の統合テスト

3. **後方互換性テスト**: 新規パラメータ未指定時の動作
   - 既存コードが壊れないことを確認（リグレッション防止）

### 9.2 優先度 Medium

1. **ユニットテスト**: `formatTaskDetails()`
   - オプショナルフィールドの条件分岐テスト

2. **インテグレーションテスト**: Evaluation Phase → IssueClient 統合フロー
   - 情報伝達フローの検証

### 9.3 優先度 Low（追加テスト）

1. **エッジケース**: 特殊文字、大量のタスク（10件以上）
   - 主要機能が動作することが確認できた後に実施

---

## 10. テスト実施スケジュール

### Phase 5（Test Code Implementation）で実施

1. **Day 1 (1~1.5h)**:
   - `extractKeywords()` のユニットテスト実装（テストケース 2.1.1 ~ 2.1.8）
   - `generateFollowUpTitle()` のユニットテスト実装（テストケース 2.2.1 ~ 2.2.5）

2. **Day 2 (0.5~0.5h)**:
   - `formatTaskDetails()` のユニットテスト実装（テストケース 2.3.1 ~ 2.3.7）

3. **Day 3 (0.5~0.5h)**:
   - `createIssueFromEvaluation()` の統合テスト実装（シナリオ 3.1.1 ~ 3.1.5）
   - 後方互換性テスト実装（シナリオ 4.1.1 ~ 4.2.2）

### Phase 6（Test Execution）で実施

4. **Day 4 (0.25~0.5h)**:
   - すべてのユニットテスト実行
   - カバレッジ確認（90% 以上を確認）

5. **Day 5 (0.25~0.5h)**:
   - すべてのインテグレーションテスト実行
   - 後方互換性テスト実行
   - リグレッションなしを確認

---

## 11. テスト失敗時の対応

### 11.1 ユニットテスト失敗時

1. **境界値テスト失敗**（例: 80文字制限が機能しない）
   - 実装ロジックを見直し（`generateFollowUpTitle()` の切り詰め処理）
   - テストケース 2.2.4 を再実行

2. **キーワード抽出失敗**（例: 括弧前まで抽出できない）
   - 正規表現を見直し（`extractKeywords()` の `split()` 処理）
   - テストケース 2.1.2, 2.1.3 を再実行

### 11.2 インテグレーションテスト失敗時

1. **Issue 作成失敗**（例: GitHub API エラー）
   - Octokit モックの設定を確認
   - エラーハンドリングロジックを確認（`createIssueFromEvaluation()` の try-catch）

2. **背景セクション未表示**（例: `issueContext` が渡されていない）
   - Evaluation Phase 側の実装を確認（`handlePassWithIssues()` の `IssueContext` 構築）
   - シナリオ 3.2.1 を再実行

### 11.3 後方互換性テスト失敗時

1. **既存コードが壊れる**（例: 新規パラメータ未指定時にエラー）
   - パラメータのオプショナル定義を確認（`issueContext?`）
   - フォールバックロジックを確認
   - シナリオ 4.1.1 を再実行

---

## 12. まとめ

### 12.1 テストシナリオの概要

本テストシナリオでは、Issue #104「Evaluation Phase のフォローアップ Issue を改善」に対する詳細なテストシナリオを作成しました。主なテスト内容は以下の通りです：

1. **ユニットテストシナリオ（セクション2）**:
   - `extractKeywords()` メソッド: 8つのテストケース（正常系3、境界値3、異常系2）
   - `generateFollowUpTitle()` メソッド: 5つのテストケース（正常系2、境界値2、異常系1）
   - `formatTaskDetails()` メソッド: 7つのテストケース（正常系2、境界値3、異常系2）

2. **インテグレーションテストシナリオ（セクション3）**:
   - `createIssueFromEvaluation()` メソッド: 5つのシナリオ（正常系2、エッジケース2、異常系1）
   - Evaluation Phase → IssueClient 統合フロー: 2つのシナリオ

3. **後方互換性テストシナリオ（セクション4）**:
   - 新規パラメータ未指定時の動作: 1つのシナリオ
   - `RemainingTask` 型拡張の影響: 2つのシナリオ

### 12.2 品質ゲートの達成状況

- [x] **Phase 2の戦略に沿ったテストシナリオである**（UNIT_INTEGRATION）
- [x] **主要な正常系がカバーされている**（ユニットテスト + インテグレーションテスト）
- [x] **主要な異常系がカバーされている**（空配列、フォールバック、エラーハンドリング）
- [x] **期待結果が明確である**（すべてのテストケース・シナリオに具体的な期待結果を記載）

### 12.3 次のフェーズへの引き継ぎ事項

**Phase 4（Implementation）で実装前に確認すべき事項**:
- ユニットテストシナリオ（セクション2）を参照し、境界値・異常系の処理を忘れずに実装
- 特に重要: 80文字制限、フォールバック処理、オプショナルフィールドの条件分岐

**Phase 5（Test Code Implementation）で実装すべき事項**:
- 本テストシナリオに基づき、`tests/unit/github/issue-client.test.ts` に新規テストケースを追加
- テストデータ（セクション5）を活用し、DRYなテストコードを実装
- モック/スタブ（セクション6.3）を適切に設定

---

**テストシナリオ作成日**: 2025-01-30
**想定テスト実施期間**: Phase 5（Test Code Implementation）+ Phase 6（Test Execution）完了時まで（見積もり: 2.5~3時間）
**カバレッジ目標**: 90% 以上（重要メソッドは 100%）
