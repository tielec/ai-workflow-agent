# テストシナリオ - Issue #127

## 0. Planning Document・要件定義書・設計書の確認

本テストシナリオは、以下のドキュメントに基づいて作成されています：

### 開発計画の概要
- **実装戦略**: EXTEND（既存のPhase 1コードを拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 12〜16時間
- **複雑度**: 中程度
- **リスク評価**: 中（エージェントプロンプト設計、Phase 1互換性、言語非依存性検証）

### テスト対象の範囲
Phase 2（リファクタリング検出機能）の実装範囲：
- `RefactorCandidate` 型定義の追加
- `RepositoryAnalyzer.analyzeForRefactoring()` メソッド
- `validateRefactorCandidate()` バリデーション機能
- `parseOptions` でカテゴリ `'refactor'` を処理
- `handleAutoIssueCommand` のカテゴリ分岐拡張
- `IssueGenerator.generateRefactorIssue()` メソッド
- プロンプトテンプレート（`detect-refactoring.txt`）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Planning Document セクション3から引用）

### テスト戦略の根拠
1. **UNITテストが必要な理由**:
   - `validateRefactorCandidate()` のバリデーション機能（最小文字数、必須フィールド、`type` フィールドの検証）
   - `parseOptions` でカテゴリ `'refactor'` を正しく処理するロジック
   - プロンプトテンプレート変数置換ロジック（エージェント実行前の準備処理）

2. **INTEGRATIONテストが必要な理由**:
   - エージェント（Codex/Claude）の実行フローE2Eテスト（実際のエージェント呼び出し）
   - `RepositoryAnalyzer.analyzeForRefactoring()` → `IssueDeduplicator` → `IssueGenerator` のフロー全体
   - dry-runモードでの統合動作確認（Issue生成スキップの検証）
   - TypeScript以外の言語（Python, Go）でのリファクタリング検出テスト

3. **BDD不要の理由**:
   - エンドユーザー向けUI機能ではなく、CLI内部の解析エンジン拡張のため
   - ビジネスシナリオよりも、技術的なバリデーションと統合フローの検証が重要

### テストの目的
- リファクタリング検出機能の正確性を保証
- Phase 1（バグ検出機能）との互換性を保証
- エージェントプロンプトの有効性を検証
- 言語非依存性を確認（TypeScript, Python, Go）
- エラーハンドリングとバリデーションの妥当性を確認

---

## 2. Unitテストシナリオ

### 2.1 `validateRefactorCandidate()` - 正常系

#### テストケース 2.1.1: 有効なリファクタリング候補（large-file）
**目的**: すべての必須フィールドが正しく設定された候補がバリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**: `true` が返される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.1.2: 有効なリファクタリング候補（duplication、lineRange付き）
**目的**: オプショナルフィールド（lineRange）が設定された候補がバリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'duplication',
  filePath: 'src/utils/validators.ts',
  lineRange: { start: 45, end: 60 },
  description: 'emailバリデーションロジックが3箇所で重複している',
  suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
  priority: 'medium'
}
```

**期待結果**: `true` が返される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.1.3: 有効なリファクタリング候補（missing-docs、priority: low）
**目的**: すべての `type` と `priority` の組み合わせが正しく処理されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'missing-docs',
  filePath: 'src/core/data-processor.ts',
  lineRange: { start: 120, end: 150 },
  description: 'processData関数にJSDocコメントがなく、複雑なロジックの理解が困難',
  suggestion: 'パラメータ、戻り値、エラーケースを含むJSDocコメントを追加することを推奨',
  priority: 'low'
}
```

**期待結果**: `true` が返される

**テストデータ**: 上記入力オブジェクト

---

### 2.2 `validateRefactorCandidate()` - 異常系

#### テストケース 2.2.1: 必須フィールド欠落（type が欠落）
**目的**: 必須フィールドが欠落した候補がバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**:
- `false` が返される
- ログに `"Missing required fields in refactor candidate"` が出力される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.2.2: 必須フィールド欠落（description が欠落）
**目的**: description欠落時にバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**:
- `false` が返される
- ログに `"Missing required fields in refactor candidate"` が出力される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.2.3: 無効な type フィールド
**目的**: 定義されていない型が指定された場合にバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'invalid-type',
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**:
- `false` が返される
- ログに `"Invalid refactor type: invalid-type"` が出力される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.2.4: description の最小文字数違反（20文字未満）
**目的**: description が20文字未満の場合にバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'Too short',  // 9文字
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**:
- `false` が返される
- ログに `"Description too short (min 20 chars): Too short"` が出力される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.2.5: suggestion の最小文字数違反（20文字未満）
**目的**: suggestion が20文字未満の場合にバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: 'Split it',  // 8文字
  priority: 'high'
}
```

**期待結果**:
- `false` が返される
- ログに `"Suggestion too short (min 20 chars): Split it"` が出力される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.2.6: 無効な priority フィールド
**目的**: 定義されていない優先度が指定された場合にバリデーションで弾かれることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'critical'  // 無効な値
}
```

**期待結果**:
- `false` が返される
- ログに `"Invalid priority: critical"` が出力される

**テストデータ**: 上記入力オブジェクト

---

### 2.3 `validateRefactorCandidate()` - 境界値テスト

#### テストケース 2.3.1: description が正確に20文字
**目的**: description が最小文字数（20文字）ちょうどの場合にバリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'This is exactly 20.',  // 正確に20文字
  suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
  priority: 'high'
}
```

**期待結果**: `true` が返される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.3.2: suggestion が正確に20文字
**目的**: suggestion が最小文字数（20文字）ちょうどの場合にバリデーションを通過することを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務を持っている',
  suggestion: 'This is exactly 20.',  // 正確に20文字
  priority: 'high'
}
```

**期待結果**: `true` が返される

**テストデータ**: 上記入力オブジェクト

---

#### テストケース 2.3.3: すべての type フィールドをテスト
**目的**: 6つすべての `type` フィールド値が正しく処理されることを検証

**前提条件**: なし

**入力**: 6つの候補（各 `type` につき1つ）
```typescript
[
  { type: 'large-file', filePath: 'test.ts', description: 'Large file description here', suggestion: 'Split the file suggestion', priority: 'high' },
  { type: 'large-function', filePath: 'test.ts', description: 'Large function description', suggestion: 'Split the function now', priority: 'high' },
  { type: 'high-complexity', filePath: 'test.ts', description: 'High complexity description', suggestion: 'Simplify the logic here', priority: 'medium' },
  { type: 'duplication', filePath: 'test.ts', description: 'Code duplication found here', suggestion: 'Extract common function', priority: 'medium' },
  { type: 'unused-code', filePath: 'test.ts', description: 'Unused code detected here', suggestion: 'Remove the unused code', priority: 'low' },
  { type: 'missing-docs', filePath: 'test.ts', description: 'Missing docs detected now', suggestion: 'Add JSDoc comments here', priority: 'low' }
]
```

**期待結果**: すべての候補で `true` が返される

**テストデータ**: 上記配列

---

### 2.4 `parseOptions()` - 正常系

#### テストケース 2.4.1: `--category refactor` を正しく解析
**目的**: `--category refactor` オプションが正しくパースされることを検証

**前提条件**: なし

**入力**: `['--category', 'refactor']`

**期待結果**:
```typescript
{
  category: 'refactor',
  // ... その他のデフォルト値
}
```

**テストデータ**: 上記配列

---

#### テストケース 2.4.2: カテゴリ未指定時のデフォルト値
**目的**: `--category` オプション未指定時にデフォルト値（`'bug'`）が設定されることを検証

**前提条件**: なし

**入力**: `[]`

**期待結果**:
```typescript
{
  category: 'bug',  // デフォルト
  // ... その他のデフォルト値
}
```

**テストデータ**: 空配列

---

#### テストケース 2.4.3: `--category bug` を正しく解析（Phase 1互換性）
**目的**: Phase 1の `--category bug` が引き続き動作することを検証

**前提条件**: なし

**入力**: `['--category', 'bug']`

**期待結果**:
```typescript
{
  category: 'bug',
  // ... その他のデフォルト値
}
```

**テストデータ**: 上記配列

---

### 2.5 `parseOptions()` - 異常系

#### テストケース 2.5.1: 無効なカテゴリ値
**目的**: サポートされていないカテゴリが指定された場合にエラーが発生することを検証

**前提条件**: なし

**入力**: `['--category', 'invalid']`

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Invalid category: invalid. Valid values: bug, refactor, enhancement, all"`

**テストデータ**: 上記配列

---

#### テストケース 2.5.2: カテゴリ値が空文字列
**目的**: カテゴリ値が空の場合にエラーが発生することを検証

**前提条件**: なし

**入力**: `['--category', '']`

**期待結果**:
- エラーがスローされる
- エラーメッセージ: `"Invalid category: . Valid values: bug, refactor, enhancement, all"`

**テストデータ**: 上記配列

---

### 2.6 `parseRefactorOutput()` - 正常系

#### テストケース 2.6.1: JSON配列形式の出力を正しくパース
**目的**: エージェント出力（JSON配列）を正しく `RefactorCandidate[]` にパースすることを検証

**前提条件**: なし

**入力**:
```json
"[{\"type\":\"large-file\",\"filePath\":\"src/services/user-service.ts\",\"description\":\"ファイルサイズが750行あり、複数の責務を持っている\",\"suggestion\":\"認証ロジックをauth-service.tsに分割することを推奨\",\"priority\":\"high\"}]"
```

**期待結果**:
```typescript
[
  {
    type: 'large-file',
    filePath: 'src/services/user-service.ts',
    description: 'ファイルサイズが750行あり、複数の責務を持っている',
    suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
    priority: 'high'
  }
]
```

**テストデータ**: 上記JSON文字列

---

#### テストケース 2.6.2: Markdown codeblock形式の出力を正しくパース
**目的**: エージェントが Markdown codeblock（```json...```）形式で出力した場合に正しくパースすることを検証

**前提条件**: なし

**入力**:
````
```json
[
  {
    "type": "duplication",
    "filePath": "src/utils/validators.ts",
    "lineRange": { "start": 45, "end": 60 },
    "description": "emailバリデーションロジックが3箇所で重複している",
    "suggestion": "共通のvalidateEmail関数を作成し、再利用することを推奨",
    "priority": "medium"
  }
]
```
````

**期待結果**:
```typescript
[
  {
    type: 'duplication',
    filePath: 'src/utils/validators.ts',
    lineRange: { start: 45, end: 60 },
    description: 'emailバリデーションロジックが3箇所で重複している',
    suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
    priority: 'medium'
  }
]
```

**テストデータ**: 上記Markdown文字列

---

#### テストケース 2.6.3: 単一オブジェクト（非配列）を配列化
**目的**: エージェントが単一オブジェクトを返した場合に配列化されることを検証

**前提条件**: なし

**入力**:
```json
"{\"type\":\"large-file\",\"filePath\":\"src/services/user-service.ts\",\"description\":\"ファイルサイズが750行あり、複数の責務を持っている\",\"suggestion\":\"認証ロジックをauth-service.tsに分割することを推奨\",\"priority\":\"high\"}"
```

**期待結果**:
```typescript
[
  {
    type: 'large-file',
    filePath: 'src/services/user-service.ts',
    description: 'ファイルサイズが750行あり、複数の責務を持っている',
    suggestion: '認証ロジックをauth-service.tsに分割することを推奨',
    priority: 'high'
  }
]
```

**テストデータ**: 上記JSON文字列

---

### 2.7 `parseRefactorOutput()` - 異常系

#### テストケース 2.7.1: 不正なJSON形式
**目的**: パースできないJSON文字列の場合に空配列が返されることを検証

**前提条件**: なし

**入力**: `"This is not JSON"`

**期待結果**:
- 空配列 `[]` が返される
- ログに `"Failed to parse refactor output: ..."` が出力される

**テストデータ**: 上記文字列

---

#### テストケース 2.7.2: 空文字列
**目的**: 空文字列の場合に空配列が返されることを検証

**前提条件**: なし

**入力**: `""`

**期待結果**:
- 空配列 `[]` が返される
- ログに `"Failed to parse refactor output: ..."` が出力される

**テストデータ**: 空文字列

---

### 2.8 `buildRefactorIssueTitle()` - 正常系

#### テストケース 2.8.1: large-file のタイトル生成
**目的**: `type: 'large-file'` の候補から正しいタイトルが生成されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: '...',
  suggestion: '...',
  priority: 'high'
}
```

**期待結果**: `"[Refactor] Large File: user-service.ts"`

**テストデータ**: 上記オブジェクト

---

#### テストケース 2.8.2: duplication のタイトル生成
**目的**: `type: 'duplication'` の候補から正しいタイトルが生成されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'duplication',
  filePath: 'src/utils/validators.ts',
  lineRange: { start: 45, end: 60 },
  description: '...',
  suggestion: '...',
  priority: 'medium'
}
```

**期待結果**: `"[Refactor] Code Duplication: validators.ts"`

**テストデータ**: 上記オブジェクト

---

### 2.9 `buildRefactorLabels()` - 正常系

#### テストケース 2.9.1: large-file のラベル生成
**目的**: `type: 'large-file'` の候補から正しいラベルセットが生成されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'large-file',
  filePath: 'src/services/user-service.ts',
  description: '...',
  suggestion: '...',
  priority: 'high'
}
```

**期待結果**: `['refactor', 'priority:high', 'code-quality']`

**テストデータ**: 上記オブジェクト

---

#### テストケース 2.9.2: duplication のラベル生成
**目的**: `type: 'duplication'` の候補から正しいラベルセットが生成されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'duplication',
  filePath: 'src/utils/validators.ts',
  lineRange: { start: 45, end: 60 },
  description: '...',
  suggestion: '...',
  priority: 'medium'
}
```

**期待結果**: `['refactor', 'priority:medium', 'code-duplication']`

**テストデータ**: 上記オブジェクト

---

#### テストケース 2.9.3: missing-docs のラベル生成
**目的**: `type: 'missing-docs'` の候補から正しいラベルセットが生成されることを検証

**前提条件**: なし

**入力**:
```typescript
{
  type: 'missing-docs',
  filePath: 'src/core/data-processor.ts',
  lineRange: { start: 120, end: 150 },
  description: '...',
  suggestion: '...',
  priority: 'low'
}
```

**期待結果**: `['refactor', 'priority:low', 'documentation']`

**テストデータ**: 上記オブジェクト

---

## 3. Integrationテストシナリオ

### 3.1 エージェント実行フローE2Eテスト

#### シナリオ 3.1.1: TypeScriptリポジトリでのリファクタリング候補検出（Codex）
**目的**: TypeScriptリポジトリに対して `--category refactor` でリファクタリング候補を検出し、Issue生成まで完了することを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する（大きすぎるファイル、重複コード、未使用コードを含む）
- `CODEX_API_KEY` または `OPENAI_API_KEY` が設定されている
- `GITHUB_TOKEN` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --agent codex` を実行
3. エージェント（Codex）が実行され、リファクタリング候補を検出
4. 検出結果が `RefactorCandidate[]` として返される
5. 重複除外処理が実行される
6. GitHub APIでIssueが作成される

**期待結果**:
- エージェントが少なくとも1つのリファクタリング候補を検出
- 検出された候補がすべて `validateRefactorCandidate()` を通過
- 重複除外後、ユニークな候補のみが残る
- GitHub Issueが作成され、Issue URLが返される
- Issue本文に以下の情報が含まれる:
  - ファイルパス
  - 対象範囲（行範囲）
  - 優先度
  - 問題点（description）
  - 推奨改善策（suggestion）
  - 期待される効果
- Issueに以下のラベルが付与される:
  - `refactor`
  - `priority:{high|medium|low}`
  - 種類別ラベル（`code-quality`, `code-duplication`, `dead-code`, `documentation`）

**確認項目**:
- [ ] エージェントが正常に実行された
- [ ] リファクタリング候補が検出された
- [ ] 候補がバリデーションを通過した
- [ ] 重複除外が正しく機能した
- [ ] Issueが作成された
- [ ] Issue本文が適切なフォーマットである
- [ ] 適切なラベルが付与された

---

#### シナリオ 3.1.2: TypeScriptリポジトリでのリファクタリング候補検出（Claude）
**目的**: Claudeエージェントを使用した場合も同様にリファクタリング候補を検出できることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `GITHUB_TOKEN` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --agent claude` を実行
3. エージェント（Claude）が実行され、リファクタリング候補を検出
4. 検出結果が `RefactorCandidate[]` として返される
5. 重複除外処理が実行される
6. GitHub APIでIssueが作成される

**期待結果**: シナリオ 3.1.1 と同様

**確認項目**: シナリオ 3.1.1 と同様

---

#### シナリオ 3.1.3: 4つの検出パターンすべてがカバーされることを確認
**目的**: エージェントが4つの検出パターン（コード品質、重複、未使用、ドキュメント）すべてを検出できることを検証

**前提条件**:
- 4つの検出パターンをすべて含むテスト用TypeScriptリポジトリが存在する:
  - 大きすぎるファイル（500行以上）
  - 複雑な条件分岐（ネスト深さ4以上）
  - コード重複（類似コードブロック）
  - 未使用のインポート・変数
  - ドキュメント欠落（JSDocなし）
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --dry-run` を実行（dry-runモードで検出結果のみ確認）
3. エージェントが実行され、リファクタリング候補を検出
4. 検出結果をコンソール出力で確認

**期待結果**:
- エージェントが以下の `type` の候補を少なくとも1つずつ検出:
  - `large-file` または `large-function` または `high-complexity`（コード品質）
  - `duplication`（コード重複）
  - `unused-code`（未使用コード）
  - `missing-docs`（ドキュメント欠落）
- 各候補の `description` と `suggestion` が具体的で有用である

**確認項目**:
- [ ] コード品質問題が検出された
- [ ] コード重複が検出された
- [ ] 未使用コードが検出された
- [ ] ドキュメント欠落が検出された
- [ ] 各候補の説明が具体的である
- [ ] 各候補の推奨改善策が実行可能である

---

### 3.2 dry-runモードテスト

#### シナリオ 3.2.1: dry-runモードでIssue生成をスキップ
**目的**: `--dry-run` オプション指定時にIssue生成がスキップされ、検出結果のみが表示されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --dry-run` を実行
3. エージェントが実行され、リファクタリング候補を検出
4. 検出結果がコンソールに表示される
5. GitHub APIは呼び出されない

**期待結果**:
- エージェントが実行され、リファクタリング候補が検出される
- コンソールに `[DRY RUN] Issues would be created for the following candidates:` が表示される
- 各候補について以下の情報がコンソールに表示される:
  - ファイルパス
  - description
- GitHub APIが呼び出されない（Issueが作成されない）
- `git status` で既存Issueが増えていないことを確認

**確認項目**:
- [ ] dry-runモードで実行された
- [ ] リファクタリング候補が検出された
- [ ] 検出結果がコンソールに表示された
- [ ] Issueが作成されなかった

---

### 3.3 言語非依存性テスト

#### シナリオ 3.3.1: Pythonリポジトリでのリファクタリング候補検出
**目的**: TypeScript以外の言語（Python）でもリファクタリング候補を検出できることを検証

**前提条件**:
- テスト用Pythonリポジトリが存在する（`.py` ファイルを含む）
- Pythonリポジトリに以下の問題を含む:
  - 大きすぎる関数（50行以上）
  - コード重複
  - 未使用のインポート
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用Pythonリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --dry-run` を実行
3. エージェントが実行され、Pythonコードのリファクタリング候補を検出
4. 検出結果をコンソール出力で確認

**期待結果**:
- エージェントがPythonコードを正しく分析
- 少なくとも1つのリファクタリング候補が検出される
- 候補の `filePath` が `.py` で終わる
- 候補の `description` と `suggestion` がPythonコードに対して適切である

**確認項目**:
- [ ] Pythonコードが分析された
- [ ] リファクタリング候補が検出された
- [ ] ファイルパスが `.py` である
- [ ] 説明がPythonコードに対して適切である

---

#### シナリオ 3.3.2: Goリポジトリでのリファクタリング候補検出
**目的**: TypeScript以外の言語（Go）でもリファクタリング候補を検出できることを検証

**前提条件**:
- テスト用Goリポジトリが存在する（`.go` ファイルを含む）
- Goリポジトリに以下の問題を含む:
  - 大きすぎるファイル（500行以上）
  - 複雑な条件分岐
  - ドキュメント欠落（GoDocコメントなし）
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用Goリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --dry-run` を実行
3. エージェントが実行され、Goコードのリファクタリング候補を検出
4. 検出結果をコンソール出力で確認

**期待結果**:
- エージェントがGoコードを正しく分析
- 少なくとも1つのリファクタリング候補が検出される
- 候補の `filePath` が `.go` で終わる
- 候補の `description` と `suggestion` がGoコードに対して適切である

**確認項目**:
- [ ] Goコードが分析された
- [ ] リファクタリング候補が検出された
- [ ] ファイルパスが `.go` である
- [ ] 説明がGoコードに対して適切である

---

### 3.4 重複除外機能テスト

#### シナリオ 3.4.1: 既存Issueとの重複チェック
**目的**: 既に作成されているIssueと同じリファクタリング候補が重複除外されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- リポジトリに既存のリファクタリングIssueが存在する（例: "Large File: user-service.ts"）
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `OPENAI_API_KEY` が設定されている（重複検出用）

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --dry-run` を実行
3. エージェントが実行され、リファクタリング候補を検出
4. `IssueDeduplicator` が既存Issueとの類似度をチェック
5. 重複除外後の候補がコンソールに表示される

**期待結果**:
- エージェントが既存Issueと同じリファクタリング候補を検出
- `IssueDeduplicator` が類似度計算を実行
- 類似度が閾値（デフォルト: 0.75）を超える候補が除外される
- 除外された候補はコンソール出力に含まれない
- ログに `"Skipping duplicate issue: ..."` が出力される

**確認項目**:
- [ ] 既存Issueとの類似度が計算された
- [ ] 類似度が閾値を超える候補が除外された
- [ ] 除外ログが出力された
- [ ] 重複しない候補のみが残った

---

#### シナリオ 3.4.2: 類似度閾値の調整
**目的**: `--similarity-threshold` オプションで類似度閾値を調整できることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- リポジトリに既存のリファクタリングIssueが存在する
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `OPENAI_API_KEY` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --similarity-threshold 0.5 --dry-run` を実行（閾値を0.5に下げる）
3. `IssueDeduplicator` が類似度0.5以上の候補を除外
4. 重複除外後の候補がコンソールに表示される

**期待結果**:
- 類似度0.5以上の候補が除外される（デフォルトの0.75より緩い基準）
- より多くの候補が除外される
- 閾値が正しく反映されている

**確認項目**:
- [ ] 類似度閾値が0.5に設定された
- [ ] 閾値が正しく機能した
- [ ] より多くの候補が除外された

---

### 3.5 Issue生成テスト

#### シナリオ 3.5.1: リファクタリングIssueの本文フォーマット
**目的**: 生成されたIssue本文が適切なフォーマットであることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `GITHUB_TOKEN` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --limit 1` を実行
3. 1つのリファクタリングIssueが作成される
4. GitHub上でIssueを確認

**期待結果**:
- Issue本文が以下のセクションを含む:
  - `## リファクタリング候補`
  - `**ファイル**: \`{filePath}\``
  - `**対象範囲**: Lines {start}-{end}` または `Entire file`
  - `**優先度**: {PRIORITY}`
  - `### 問題点` → `{description}`
  - `### 推奨改善策` → `{suggestion}`
  - `### 期待される効果` → 箇条書き
  - フッター: `🤖 このIssueは [AI Workflow Agent](...) により自動生成されました。`
- Markdown形式が正しい（フォーマットエラーなし）

**確認項目**:
- [ ] Issue本文が適切なフォーマットである
- [ ] ファイルパスが正しい
- [ ] 対象範囲が正しい
- [ ] 優先度が正しい
- [ ] 問題点が明確に記述されている
- [ ] 推奨改善策が実行可能である
- [ ] 期待される効果が記載されている
- [ ] フッターが含まれている

---

#### シナリオ 3.5.2: リファクタリングIssueのラベル付与
**目的**: リファクタリングIssueに適切なラベルが自動付与されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する（複数の検出パターンを含む）
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `GITHUB_TOKEN` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --limit 3` を実行
3. 複数のリファクタリングIssueが作成される
4. GitHub上で各Issueのラベルを確認

**期待結果**:
- すべてのIssueに `refactor` ラベルが付与される
- 各Issueに優先度ラベルが付与される（`priority:high`, `priority:medium`, `priority:low`）
- 各Issueに種類別ラベルが付与される:
  - `large-file`, `large-function`, `high-complexity` → `code-quality`
  - `duplication` → `code-duplication`
  - `unused-code` → `dead-code`
  - `missing-docs` → `documentation`

**確認項目**:
- [ ] すべてのIssueに `refactor` ラベルが付与された
- [ ] 優先度ラベルが正しい
- [ ] 種類別ラベルが正しい

---

### 3.6 エージェントフォールバックテスト

#### シナリオ 3.6.1: Codex実行失敗時にClaudeへフォールバック
**目的**: Codex実行失敗時にClaudeへ自動的にフォールバックすることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` が無効または未設定
- `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --agent auto --dry-run` を実行（`auto` モードで実行）
3. Codex実行が失敗
4. 自動的にClaudeへフォールバック
5. Claudeでリファクタリング候補を検出

**期待結果**:
- Codex実行が失敗する
- ログに `"Codex execution failed, falling back to Claude..."` が出力される
- Claudeが実行される
- リファクタリング候補が正常に検出される

**確認項目**:
- [ ] Codex実行が失敗した
- [ ] フォールバックログが出力された
- [ ] Claudeが実行された
- [ ] リファクタリング候補が検出された

---

### 3.7 エラーハンドリングテスト

#### シナリオ 3.7.1: エージェント実行エラー
**目的**: エージェント実行エラー時に適切なエラーメッセージが表示されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` と `CLAUDE_CODE_CREDENTIALS_PATH` が両方とも未設定

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor` を実行
3. エージェント実行エラーが発生

**期待結果**:
- エラーメッセージが表示される
- エラーメッセージに原因と対処法が含まれる（例: "Please set CODEX_API_KEY or CLAUDE_CODE_CREDENTIALS_PATH"）
- プロセスが適切に終了する（クラッシュしない）

**確認項目**:
- [ ] エラーメッセージが表示された
- [ ] エラーメッセージが明確である
- [ ] プロセスが適切に終了した

---

#### シナリオ 3.7.2: GitHub API エラー（401 Unauthorized）
**目的**: GitHub API認証エラー時に適切なエラーメッセージが表示されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `GITHUB_TOKEN` が無効または未設定

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category refactor --limit 1` を実行
3. エージェントが実行され、リファクタリング候補を検出
4. GitHub API呼び出しで認証エラー（401）が発生

**期待結果**:
- エラーメッセージが表示される
- エラーメッセージに原因と対処法が含まれる（例: "GitHub API authentication failed. Please check your GITHUB_TOKEN"）
- プロセスが適切に終了する

**確認項目**:
- [ ] エラーメッセージが表示された
- [ ] エラーメッセージが明確である
- [ ] プロセスが適切に終了した

---

#### シナリオ 3.7.3: GitHub API リトライロジック（429 Too Many Requests）
**目的**: 一時的なAPIエラー（429 Too Many Requests）時にリトライが実行されることを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている
- `GITHUB_TOKEN` が設定されている
- GitHub APIレート制限に達している状態を模擬

**テスト手順**:
1. GitHub APIレート制限に達している状態を模擬（モック）
2. `ai-workflow auto-issue --category refactor --limit 1` を実行
3. GitHub API呼び出しで429エラーが発生
4. リトライロジックが実行される（最大3回）

**期待結果**:
- 429エラーが発生する
- ログに `"Rate limit exceeded, retrying in {seconds} seconds..."` が出力される
- 最大3回までリトライが実行される
- リトライ成功時、Issueが作成される
- リトライ失敗時、適切なエラーメッセージが表示される

**確認項目**:
- [ ] 429エラーが発生した
- [ ] リトライログが出力された
- [ ] リトライが実行された
- [ ] リトライ成功/失敗が適切に処理された

---

## 4. リグレッションテストシナリオ（Phase 1互換性確認）

### 4.1 Phase 1バグ検出機能の動作確認

#### シナリオ 4.1.1: `--category bug` でバグ検出機能が引き続き動作
**目的**: Phase 2の変更がPhase 1のバグ検出機能に影響を与えていないことを検証

**前提条件**:
- テスト用TypeScriptリポジトリが存在する（バグを含む）
- `CODEX_API_KEY` または `CLAUDE_CODE_CREDENTIALS_PATH` が設定されている

**テスト手順**:
1. テスト用TypeScriptリポジトリのディレクトリに移動
2. `ai-workflow auto-issue --category bug --dry-run` を実行
3. エージェントが実行され、バグ候補を検出
4. 検出結果がコンソールに表示される

**期待結果**:
- エージェントがバグ候補を検出する
- 検出結果が `BugCandidate[]` 形式である
- Phase 1と同じバグ検出プロンプト（`detect-bugs.txt`）が使用される
- リファクタリング検出と混在しない（バグのみ検出）

**確認項目**:
- [ ] バグ検出機能が動作した
- [ ] バグ候補が検出された
- [ ] リファクタリング候補と混在しなかった
- [ ] Phase 1と同じ動作である

---

#### シナリオ 4.1.2: Phase 1のユニットテストがすべてパス
**目的**: Phase 1のユニットテストがリグレッションなくパスすることを検証

**前提条件**:
- Phase 1のユニットテストが存在する（`tests/unit/repository-analyzer.test.ts` 等）

**テスト手順**:
1. `npm run test:unit` を実行
2. Phase 1のユニットテストがすべて実行される

**期待結果**:
- すべてのPhase 1ユニットテストがパスする
- テストカバレッジが既存水準（80%以上）を維持している

**確認項目**:
- [ ] すべてのPhase 1ユニットテストがパスした
- [ ] テストカバレッジが維持された

---

#### シナリオ 4.1.3: Phase 1の統合テストがすべてパス
**目的**: Phase 1の統合テストがリグレッションなくパスすることを検証

**前提条件**:
- Phase 1の統合テストが存在する（`tests/integration/auto-issue-bug.test.ts` 等）

**テスト手順**:
1. `npm run test:integration` を実行
2. Phase 1の統合テストがすべて実行される

**期待結果**:
- すべてのPhase 1統合テストがパスする
- バグ検出機能が正常に動作している

**確認項目**:
- [ ] すべてのPhase 1統合テストがパスした
- [ ] バグ検出機能が正常に動作した

---

## 5. テストデータ

### 5.1 TypeScript リファクタリング候補サンプル

#### サンプル1: 大きすぎるファイル（large-file）
**ファイルパス**: `test-data/typescript/large-user-service.ts`

**内容**: 750行のファイル、複数の責務（認証、プロフィール管理、通知）を持つ

**期待される検出**:
```typescript
{
  type: 'large-file',
  filePath: 'test-data/typescript/large-user-service.ts',
  description: 'ファイルサイズが750行あり、複数の責務（認証、プロフィール管理、通知）を持っている',
  suggestion: '認証ロジックをauth-service.tsに、通知ロジックをnotification-service.tsに分割することを推奨',
  priority: 'high'
}
```

---

#### サンプル2: コード重複（duplication）
**ファイルパス**: `test-data/typescript/validators.ts`

**内容**: emailバリデーションロジックが3箇所で重複

**期待される検出**:
```typescript
{
  type: 'duplication',
  filePath: 'test-data/typescript/validators.ts',
  lineRange: { start: 45, end: 60 },
  description: 'emailバリデーションロジックが3箇所で重複している',
  suggestion: '共通のvalidateEmail関数を作成し、再利用することを推奨',
  priority: 'medium'
}
```

---

#### サンプル3: 未使用コード（unused-code）
**ファイルパス**: `test-data/typescript/utils.ts`

**内容**: 未使用のインポート、未参照の関数

**期待される検出**:
```typescript
{
  type: 'unused-code',
  filePath: 'test-data/typescript/utils.ts',
  lineRange: { start: 1, end: 5 },
  description: '未使用のインポート（lodash, moment）と未参照の関数（formatDate）が存在する',
  suggestion: '未使用のコードを削除し、コードベースをクリーンに保つことを推奨',
  priority: 'low'
}
```

---

#### サンプル4: ドキュメント欠落（missing-docs）
**ファイルパス**: `test-data/typescript/data-processor.ts`

**内容**: 複雑な関数にJSDocコメントがない

**期待される検出**:
```typescript
{
  type: 'missing-docs',
  filePath: 'test-data/typescript/data-processor.ts',
  lineRange: { start: 120, end: 150 },
  description: 'processData関数にJSDocコメントがなく、複雑なロジックの理解が困難',
  suggestion: 'パラメータ、戻り値、エラーケースを含むJSDocコメントを追加することを推奨',
  priority: 'low'
}
```

---

### 5.2 Python リファクタリング候補サンプル

#### サンプル5: 大きすぎる関数（large-function）
**ファイルパス**: `test-data/python/data_processor.py`

**内容**: 80行の関数、複雑な条件分岐

**期待される検出**:
```typescript
{
  type: 'large-function',
  filePath: 'test-data/python/data_processor.py',
  lineRange: { start: 45, end: 125 },
  description: 'process_data関数が80行あり、複雑な条件分岐（ネスト深さ5）を含む',
  suggestion: 'データ検証、変換、保存の3つの関数に分割することを推奨',
  priority: 'high'
}
```

---

### 5.3 Go リファクタリング候補サンプル

#### サンプル6: 複雑な条件分岐（high-complexity）
**ファイルパス**: `test-data/go/handler.go`

**内容**: ネスト深さ5の条件分岐

**期待される検出**:
```typescript
{
  type: 'high-complexity',
  filePath: 'test-data/go/handler.go',
  lineRange: { start: 78, end: 120 },
  description: 'HandleRequest関数にネスト深さ5の複雑な条件分岐がある',
  suggestion: 'Early returnパターンを使用し、ネストを削減することを推奨',
  priority: 'medium'
}
```

---

### 5.4 エージェント出力モック（JSON）

#### モック1: 正常な出力（JSON配列）
```json
[
  {
    "type": "large-file",
    "filePath": "src/services/user-service.ts",
    "description": "ファイルサイズが750行あり、複数の責務を持っている",
    "suggestion": "認証ロジックをauth-service.tsに分割することを推奨",
    "priority": "high"
  },
  {
    "type": "duplication",
    "filePath": "src/utils/validators.ts",
    "lineRange": { "start": 45, "end": 60 },
    "description": "emailバリデーションロジックが3箇所で重複している",
    "suggestion": "共通のvalidateEmail関数を作成し、再利用することを推奨",
    "priority": "medium"
  }
]
```

---

#### モック2: Markdown codeblock形式
````json
```json
[
  {
    "type": "unused-code",
    "filePath": "src/utils/helpers.ts",
    "lineRange": { "start": 1, "end": 10 },
    "description": "未使用のインポートと関数が存在する",
    "suggestion": "未使用のコードを削除することを推奨",
    "priority": "low"
  }
]
```
````

---

#### モック3: 単一オブジェクト（非配列）
```json
{
  "type": "missing-docs",
  "filePath": "src/core/data-processor.ts",
  "lineRange": { "start": 120, "end": 150 },
  "description": "processData関数にJSDocコメントがない",
  "suggestion": "JSDocコメントを追加することを推奨",
  "priority": "low"
}
```

---

## 6. テスト環境要件

### 6.1 必要なテスト環境

#### ローカル環境
- **Node.js**: 20以上
- **npm**: 10以上
- **Git**: 2.30以上

#### CI/CD環境（将来的な統合）
- GitHub Actions
- 環境変数の設定（CODEX_API_KEY, CLAUDE_CODE_CREDENTIALS_PATH, GITHUB_TOKEN）

---

### 6.2 必要な外部サービス

#### エージェントAPI
- **Codex API**: `CODEX_API_KEY` または `OPENAI_API_KEY` が必要
- **Claude Code**: `CLAUDE_CODE_CREDENTIALS_PATH` が必要

#### OpenAI API（重複検出用）
- **OpenAI Embeddings API**: `OPENAI_API_KEY` が必要

#### GitHub API
- **GitHub API**: `GITHUB_TOKEN` が必要（Issue作成、既存Issue検索）

---

### 6.3 モック/スタブの必要性

#### Unitテスト
- **エージェント実行のモック**: `CodexAgentClient.execute()`, `ClaudeAgentClient.execute()` をモック化
- **GitHub API のモック**: `GitHubClient.createIssue()`, `GitHubClient.getIssues()` をモック化
- **OpenAI API のモック**: `OpenAIClient.getEmbedding()` をモック化

#### Integrationテスト
- **実際のエージェント実行**: モックなし（実際にCodex/Claudeを呼び出す）
- **GitHub API のモック**: 一部のテストでモック化（dry-runテスト等）

---

### 6.4 テストデータディレクトリ構造

```
test-data/
├── typescript/
│   ├── large-user-service.ts       # 大きすぎるファイル
│   ├── validators.ts                # コード重複
│   ├── utils.ts                     # 未使用コード
│   └── data-processor.ts            # ドキュメント欠落
├── python/
│   └── data_processor.py            # 大きすぎる関数
└── go/
    └── handler.go                   # 複雑な条件分岐
```

---

## 7. 品質ゲート確認

本テストシナリオは、以下の品質ゲート（Phase 3）を満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略 UNIT_INTEGRATION に基づき、Unitテストシナリオ（セクション2）と Integrationテストシナリオ（セクション3）を作成
  - BDDシナリオは含めていない（Phase 2の戦略に従う）

- [x] **主要な正常系がカバーされている**
  - Unit正常系: 2.1 `validateRefactorCandidate()` 正常系、2.4 `parseOptions()` 正常系、2.6 `parseRefactorOutput()` 正常系
  - Integration正常系: 3.1 エージェント実行フローE2E、3.3 言語非依存性、3.5 Issue生成

- [x] **主要な異常系がカバーされている**
  - Unit異常系: 2.2 `validateRefactorCandidate()` 異常系、2.5 `parseOptions()` 異常系、2.7 `parseRefactorOutput()` 異常系
  - Integration異常系: 3.7 エラーハンドリング（エージェント実行エラー、GitHub APIエラー、リトライロジック）

- [x] **期待結果が明確である**
  - すべてのテストケースで「期待結果」セクションを記載
  - 具体的な入力・出力を明示
  - 検証可能な形式で記述

---

## 8. 受け入れ基準との対応

本テストシナリオは、Requirements Document（セクション6）で定義された10個の受け入れ基準（AC-1〜AC-10）をすべてカバーしています：

| 受け入れ基準 | 対応するテストシナリオ |
|------------|----------------------|
| AC-1: リファクタリング候補の検出 | シナリオ 3.1.1, 3.1.2 |
| AC-2: コード品質問題の検出 | シナリオ 3.1.3（large-file, large-function, high-complexity） |
| AC-3: コード重複の検出 | シナリオ 3.1.3（duplication） |
| AC-4: 未使用コードの検出 | シナリオ 3.1.3（unused-code） |
| AC-5: ドキュメント品質問題の検出 | シナリオ 3.1.3（missing-docs） |
| AC-6: 言語非依存性の確認 | シナリオ 3.3.1（Python）, 3.3.2（Go） |
| AC-7: CLIオプションの動作確認 | テストケース 2.4.1, 2.4.2 |
| AC-8: Phase 1との互換性確認 | シナリオ 4.1.1, 4.1.2, 4.1.3 |
| AC-9: dry-runモードの動作確認 | シナリオ 3.2.1 |
| AC-10: ユニットテストの追加 | シナリオ 4.1.2（Phase 1ユニットテスト）、セクション2（新規ユニットテスト） |

---

## 9. 次フェーズ（Implementation Phase）への引き継ぎ事項

### 9.1 実装時に参照すべきテストシナリオ

1. **型定義実装時**: テストケース 2.1.1〜2.1.3（有効な候補のバリデーション）を参照
2. **バリデーション実装時**: テストケース 2.2.1〜2.2.6（異常系）、2.3.1〜2.3.3（境界値）を参照
3. **プロンプトテンプレート作成時**: シナリオ 3.1.3（4つの検出パターン）を参照
4. **CLIオプション実装時**: テストケース 2.4.1〜2.4.3、2.5.1〜2.5.2を参照
5. **Issue生成実装時**: シナリオ 3.5.1, 3.5.2を参照

### 9.2 テストデータ準備

実装フェーズでは、以下のテストデータを準備してください：
- TypeScript サンプルリポジトリ（セクション5.1）
- Python サンプルリポジトリ（セクション5.2）
- Go サンプルリポジトリ（セクション5.3）
- エージェント出力モック（セクション5.4）

### 9.3 優先度の高いテストシナリオ

以下のテストシナリオは、クリティカルパスに該当するため、実装完了後すぐにテストしてください：
1. シナリオ 3.1.1（エージェント実行フローE2E）
2. シナリオ 4.1.1（Phase 1互換性）
3. テストケース 2.1.1〜2.1.3（バリデーション正常系）

---

**テストシナリオ作成日**: 2025-01-30
**作成者**: AI Workflow Agent (Test Scenario Phase)
**レビュー予定日**: Phase 4完了後（クリティカルシンキングレビュー）
