# テストシナリオ - Issue #47: Extract duplicated phase template pattern

## 0. Planning Document・設計書の確認

### Phase 0 (Planning) の決定事項
- **実装戦略**: REFACTOR（既存コードの構造改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテストと統合テストの両方）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **見積もり工数**: 8~12時間
- **リスク評価**: 低

### Phase 2 (Design) の設計決定
- **テンプレートメソッド名**: `executePhaseTemplate<T extends Record<string, string>>()`
- **対象フェーズ**: 全10フェーズ（Planning, Requirements, Design, TestScenario, Implementation, TestImplementation, Testing, Documentation, Report, Evaluation）
- **特殊ロジック保持**: DesignPhase（設計決定抽出）、ImplementationPhase（オプショナルコンテキスト）、TestingPhase（ファイル更新チェック）、PlanningPhase（revise なし）

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2で決定）

### 1.2 テスト対象の範囲

**ユニットテスト対象**:
1. `BasePhase.executePhaseTemplate()` メソッド
   - 変数置換ロジック
   - エラーハンドリング（出力ファイル不在時）
   - オプション引数のデフォルト値設定
   - ジェネリック型パラメータの型安全性

**統合テスト対象**:
1. 標準フェーズでのテンプレートメソッド動作検証
   - RequirementsPhase.execute()
   - TestScenarioPhase.execute()
2. 特殊ロジック含むフェーズでのテンプレートメソッド動作検証
   - DesignPhase.execute()（設計決定抽出）
   - ImplementationPhase.execute()（オプショナルコンテキスト）
   - TestingPhase.execute()（ファイル更新チェック）
3. 既存フローの回帰テスト
   - execute → review → revise フローが破壊されていないことを確認

### 1.3 テストの目的

1. **正確性**: テンプレートメソッドがプロンプト変数を正しく置換し、エージェント実行が成功すること
2. **堅牢性**: エラーケース（出力ファイル不在等）で適切なエラーハンドリングが行われること
3. **互換性**: リファクタリング後も既存のフェーズ実行フローが破壊されていないこと
4. **保守性**: 特殊ロジックを持つフェーズでもテンプレートメソッドが正しく動作すること

---

## 2. ユニットテストシナリオ

### 2.1 テスト対象: BasePhase.executePhaseTemplate()

#### 2.1.1 正常系テストケース

---

**テストケース名**: `executePhaseTemplate_正常系_基本的な変数置換`

- **テストID**: UT-001
- **優先度**: 高
- **目的**: テンプレート変数が正しくプロンプトに置換されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - プロンプトテンプレート `execute.txt` に `{var1}`, `{var2}` が含まれている
  - `executeWithAgent()` がモック化されている
  - 出力ファイル（`test.md`）が存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {
    var1: 'value1',
    var2: 'value2'
  }
  options: undefined
  ```
- **期待結果**:
  - プロンプト内の `{var1}` が `'value1'` に置換される
  - プロンプト内の `{var2}` が `'value2'` に置換される
  - `executeWithAgent()` が置換後のプロンプトで呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"This is {var1} and {var2}."`
  - 期待されるプロンプト: `"This is value1 and value2."`

---

**テストケース名**: `executePhaseTemplate_正常系_オプション引数なし（デフォルト値）`

- **テストID**: UT-002
- **優先度**: 高
- **目的**: オプション引数が指定されない場合、デフォルト値（`maxTurns: 30`）が使用されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {}
  options: undefined
  ```
- **期待結果**:
  - `executeWithAgent()` が `{ maxTurns: 30, verbose: undefined, logDir: undefined }` で呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"No variables"`

---

**テストケース名**: `executePhaseTemplate_正常系_オプション引数あり（カスタム値）`

- **テストID**: UT-003
- **優先度**: 高
- **目的**: オプション引数（`maxTurns`, `verbose`, `logDir`）が指定された場合、その値が使用されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {}
  options: { maxTurns: 50, verbose: true, logDir: '/custom/log' }
  ```
- **期待結果**:
  - `executeWithAgent()` が `{ maxTurns: 50, verbose: true, logDir: '/custom/log' }` で呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"No variables"`

---

**テストケース名**: `executePhaseTemplate_正常系_複数変数の置換`

- **テストID**: UT-004
- **優先度**: 中
- **目的**: 複数のテンプレート変数（3つ以上）が正しく置換されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - プロンプトテンプレート `execute.txt` に複数の変数が含まれている
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'requirements.md'
  templateVariables: {
    planning_document_path: '@.ai-workflow/issue-47/00_planning/output/planning.md',
    issue_info: 'Issue #47: Refactor phase template',
    issue_number: '47'
  }
  ```
- **期待結果**:
  - プロンプト内の `{planning_document_path}` が `'@.ai-workflow/issue-47/00_planning/output/planning.md'` に置換される
  - プロンプト内の `{issue_info}` が `'Issue #47: Refactor phase template'` に置換される
  - プロンプト内の `{issue_number}` が `'47'` に置換される
  - 戻り値: `{ success: true, output: '/path/to/output/requirements.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"Planning: {planning_document_path}, Issue: {issue_info}, Number: {issue_number}"`

---

#### 2.1.2 異常系テストケース

---

**テストケース名**: `executePhaseTemplate_異常系_出力ファイル不在`

- **テストID**: UT-005
- **優先度**: 高
- **目的**: エージェント実行後に出力ファイルが存在しない場合、適切なエラーが返されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - `executeWithAgent()` がモック化されている
  - 出力ファイル（`missing.md`）が**存在しない**
- **入力**:
  ```typescript
  phaseOutputFile: 'missing.md'
  templateVariables: {}
  ```
- **期待結果**:
  - `fs.existsSync()` が `false` を返す
  - 戻り値: `{ success: false, error: 'missing.md が見つかりません: /path/to/output/missing.md' }`
- **テストデータ**: なし

---

**テストケース名**: `executePhaseTemplate_異常系_executeWithAgentがエラーをスロー`

- **テストID**: UT-006
- **優先度**: 中
- **目的**: `executeWithAgent()` がエラーをスローした場合、例外が適切に伝播されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - `executeWithAgent()` がモック化されており、エラーをスローする
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {}
  ```
- **期待結果**:
  - `executeWithAgent()` がエラーをスロー
  - 例外が呼び出し元に伝播される（`executePhaseTemplate()` はキャッチしない）
- **テストデータ**:
  - エラー: `new Error('Agent execution failed')`

---

#### 2.1.3 境界値テストケース

---

**テストケース名**: `executePhaseTemplate_境界値_空文字列の変数置換`

- **テストID**: UT-007
- **優先度**: 低
- **目的**: 変数値が空文字列の場合でも正しく置換されることを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - プロンプトテンプレート `execute.txt` に `{var1}` が含まれている
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: { var1: '' }
  ```
- **期待結果**:
  - プロンプト内の `{var1}` が空文字列に置換される
  - `executeWithAgent()` が呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"Value: {var1}"`
  - 期待されるプロンプト: `"Value: "`

---

**テストケース名**: `executePhaseTemplate_境界値_変数なし（空オブジェクト）`

- **テストID**: UT-008
- **優先度**: 低
- **目的**: `templateVariables` が空オブジェクトの場合でも正常に動作することを検証
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - プロンプトテンプレートに変数が含まれていない
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {}
  ```
- **期待結果**:
  - プロンプトは変更されない
  - `executeWithAgent()` が呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }`
- **テストデータ**:
  - プロンプトテンプレート: `"No variables"`

---

**テストケース名**: `executePhaseTemplate_境界値_maxTurnsが0`

- **テストID**: UT-009
- **優先度**: 低
- **目的**: `maxTurns` が 0 の場合でもエラーなく動作することを検証（エージェントが即座に終了）
- **前提条件**:
  - `BasePhase` のサブクラス（TestPhase）が存在する
  - `executeWithAgent()` がモック化されている
  - 出力ファイルが存在する
- **入力**:
  ```typescript
  phaseOutputFile: 'test.md'
  templateVariables: {}
  options: { maxTurns: 0 }
  ```
- **期待結果**:
  - `executeWithAgent()` が `{ maxTurns: 0 }` で呼び出される
  - 戻り値: `{ success: true, output: '/path/to/output/test.md' }` （エージェント側の動作に依存）
- **テストデータ**: なし

---

### 2.2 モック・スタブ戦略

#### 2.2.1 モック化が必要なメソッド

| メソッド | モック理由 | モック動作 |
|---------|----------|----------|
| `loadPrompt('execute')` | プロンプトファイルの読み込みを避けるため | 固定のテンプレート文字列を返す |
| `executeWithAgent()` | 実際のエージェント実行を避けるため | 空配列 `[]` を返す |
| `fs.existsSync()` | ファイルシステムアクセスを避けるため | テストケースに応じて `true` または `false` を返す |
| `path.join()` | 実際のパス結合は不要（固定パスで十分） | モック不要（実関数を使用） |

#### 2.2.2 テスト用サブクラス

```typescript
// tests/unit/phases/base-phase.test.ts 内
class TestPhase extends BasePhase {
  // executePhaseTemplate() を public にするためのラッパー
  public async testExecutePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
  ): Promise<PhaseExecutionResult> {
    return this.executePhaseTemplate(phaseOutputFile, templateVariables, options);
  }

  // 抽象メソッドの実装（ダミー）
  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true };
  }
}
```

---

## 3. 統合テストシナリオ

### 3.1 標準フェーズでのテンプレートメソッド動作検証

#### 3.1.1 RequirementsPhase の統合テスト

---

**シナリオ名**: `RequirementsPhase.execute() がテンプレートメソッドを使用して正常に実行される`

- **テストID**: IT-001
- **優先度**: 高
- **目的**: RequirementsPhase がリファクタリング後も正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する（`metadata.json`）
  - Planning Document（`planning.md`）が存在する
  - GitHub API クライアントがモック化されている
  - エージェントクライアント（Codex/Claude）がモック化されている
- **テスト手順**:
  1. `RequirementsPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. エージェントが実行され、`requirements.md` が生成されることを確認
  4. メタデータが更新されることを確認（`phases.requirements.status = 'completed'`）
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/requirements.md' }` を返す
  - `requirements.md` ファイルが存在する
  - メタデータ `phases.requirements.status` が `'completed'` になる
  - メタデータ `phases.requirements.output_file` が `'/path/to/requirements.md'` になる
- **確認項目**:
  - [x] `requirements.md` が生成されている
  - [x] プロンプト変数（`planning_document_path`, `issue_info`, `issue_number`）が正しく置換されている
  - [x] メタデータが正しく更新されている
  - [x] エラーログが出力されていない

---

**シナリオ名**: `TestScenarioPhase.execute() がテンプレートメソッドを使用して正常に実行される`

- **テストID**: IT-002
- **優先度**: 中
- **目的**: TestScenarioPhase がリファクタリング後も正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document、Requirements Document、Design Document が存在する
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `TestScenarioPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. エージェントが実行され、`test-scenario.md` が生成されることを確認
  4. メタデータが更新されることを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/test-scenario.md' }` を返す
  - `test-scenario.md` ファイルが存在する
  - メタデータが正しく更新される
- **確認項目**:
  - [x] `test-scenario.md` が生成されている
  - [x] プロンプト変数が正しく置換されている
  - [x] メタデータが正しく更新されている

---

### 3.2 特殊ロジック含むフェーズでのテンプレートメソッド動作検証

#### 3.2.1 DesignPhase の統合テスト（設計決定抽出）

---

**シナリオ名**: `DesignPhase.execute() がテンプレートメソッドを使用し、設計決定抽出も正常に動作する`

- **テストID**: IT-003
- **優先度**: 高
- **目的**: DesignPhase がリファクタリング後も設計決定抽出ロジックを含めて正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document、Requirements Document が存在する
  - エージェントクライアントがモック化されており、設計書（`design.md`）を生成する
  - `design.md` に設計決定（`implementation_strategy`, `test_strategy`, `test_code_strategy`）が含まれている
  - `metadata.data.design_decisions.implementation_strategy` が `null`（未抽出状態）
- **テスト手順**:
  1. `DesignPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. エージェントが実行され、`design.md` が生成されることを確認
  4. 設計決定が `metadata.json` に抽出されることを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/design.md' }` を返す
  - `design.md` ファイルが存在する
  - メタデータ `design_decisions.implementation_strategy` が `'REFACTOR'` に更新される（設計書の内容に応じて）
  - メタデータ `design_decisions.test_strategy` が `'UNIT_INTEGRATION'` に更新される
  - メタデータ `design_decisions.test_code_strategy` が `'CREATE_TEST'` に更新される
- **確認項目**:
  - [x] `design.md` が生成されている
  - [x] プロンプト変数が正しく置換されている
  - [x] 設計決定が正しく抽出されている
  - [x] `metadata.json` に設計決定が保存されている
  - [x] `console.info` で設計決定更新ログが出力されている

---

**シナリオ名**: `DesignPhase.execute() で設計決定が既に存在する場合、再抽出されない`

- **テストID**: IT-004
- **優先度**: 中
- **目的**: 設計決定が既に存在する場合、重複抽出が行われないことを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - `metadata.data.design_decisions.implementation_strategy` が既に `'REFACTOR'`（抽出済み状態）
- **テスト手順**:
  1. `DesignPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. 設計決定抽出が**スキップ**されることを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/design.md' }` を返す
  - `ContentParser.extractDesignDecisions()` が呼び出されない
  - メタデータ `design_decisions.implementation_strategy` が変更されない（`'REFACTOR'` のまま）
- **確認項目**:
  - [x] `design.md` が生成されている
  - [x] 設計決定抽出がスキップされている
  - [x] メタデータが変更されていない

---

#### 3.2.2 ImplementationPhase の統合テスト（オプショナルコンテキスト）

---

**シナリオ名**: `ImplementationPhase.execute() がオプショナルコンテキストを構築してテンプレートメソッドを使用する`

- **テストID**: IT-005
- **優先度**: 高
- **目的**: ImplementationPhase がオプショナルコンテキスト構築ロジックを含めて正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document が存在する
  - Requirements Document、Design Document、TestScenario Document が**存在しない**（オプショナル）
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `ImplementationPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. オプショナルコンテキストがフォールバックメッセージになることを確認
  4. エージェントが実行され、`implementation.md` が生成されることを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/implementation.md' }` を返す
  - プロンプト変数 `requirements_context` がフォールバックメッセージになる（例: `'要件定義書は利用できません。...'`）
  - プロンプト変数 `design_context` がフォールバックメッセージになる
  - プロンプト変数 `test_scenario_context` がフォールバックメッセージになる
  - `implementation.md` ファイルが存在する
- **確認項目**:
  - [x] `implementation.md` が生成されている
  - [x] オプショナルコンテキストがフォールバックメッセージになっている
  - [x] プロンプト変数が正しく置換されている
  - [x] メタデータが正しく更新されている

---

**シナリオ名**: `ImplementationPhase.execute() でドキュメントが存在する場合、ファイルパス参照を使用する`

- **テストID**: IT-006
- **優先度**: 中
- **目的**: オプショナルコンテキストで、ドキュメントが存在する場合に `@filepath` 形式の参照が使用されることを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document、Requirements Document、Design Document、TestScenario Document がすべて存在する
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `ImplementationPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出す
  3. オプショナルコンテキストが `@filepath` 形式になることを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/implementation.md' }` を返す
  - プロンプト変数 `requirements_context` が `'@.ai-workflow/issue-47/01_requirements/output/requirements.md'` になる
  - プロンプト変数 `design_context` が `'@.ai-workflow/issue-47/02_design/output/design.md'` になる
  - プロンプト変数 `test_scenario_context` が `'@.ai-workflow/issue-47/03_test_scenario/output/test-scenario.md'` になる
- **確認項目**:
  - [x] `implementation.md` が生成されている
  - [x] オプショナルコンテキストが `@filepath` 形式になっている
  - [x] プロンプト変数が正しく置換されている

---

#### 3.2.3 TestingPhase の統合テスト（ファイル更新チェック）

---

**シナリオ名**: `TestingPhase.execute() がファイル更新チェックを含めてテンプレートメソッドを使用する`

- **テストID**: IT-007
- **優先度**: 高
- **目的**: TestingPhase がファイル更新チェックロジックを含めて正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - `test-result.md` が既に存在する（古いファイル）
  - エージェントクライアントがモック化されており、`test-result.md` を更新する
- **テスト手順**:
  1. `test-result.md` の mtime と size を記録
  2. `TestingPhase` のインスタンスを作成
  3. `execute()` メソッドを呼び出す
  4. エージェントが実行され、`test-result.md` が更新されることを確認
  5. ファイル更新チェックが成功することを確認
- **期待結果**:
  - `execute()` が `{ success: true, output: '/path/to/test-result.md' }` を返す
  - `test-result.md` の mtime または size が変更されている
  - メタデータが正しく更新される
- **確認項目**:
  - [x] `test-result.md` が更新されている
  - [x] mtime または size が変更されている
  - [x] プロンプト変数が正しく置換されている
  - [x] メタデータが正しく更新されている

---

**シナリオ名**: `TestingPhase.execute() でファイルが更新されない場合、エラーを返す`

- **テストID**: IT-008
- **優先度**: 高
- **目的**: TestingPhase で `test-result.md` が更新されない場合、エラーが返されることを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - `test-result.md` が既に存在する（古いファイル）
  - エージェントクライアントがモック化されており、`test-result.md` を**更新しない**（mtime と size が変わらない）
- **テスト手順**:
  1. `test-result.md` の mtime と size を記録
  2. `TestingPhase` のインスタンスを作成
  3. `execute()` メソッドを呼び出す
  4. エージェントが実行されるが、`test-result.md` が更新されない
  5. ファイル更新チェックが失敗することを確認
- **期待結果**:
  - `execute()` が `{ success: false, error: 'test-result.md が更新されていません。' }` を返す
  - メタデータは更新されない（エラー状態）
- **確認項目**:
  - [x] エラーメッセージが正しい
  - [x] `test-result.md` の mtime と size が変わっていない
  - [x] メタデータがエラー状態になっている

---

### 3.3 既存フローの回帰テスト

#### 3.3.1 execute → review → revise フローの回帰テスト

---

**シナリオ名**: `RequirementsPhase で execute → review → revise フローが正常に動作する`

- **テストID**: IT-009
- **優先度**: 高
- **目的**: リファクタリング後も既存のフェーズ実行フロー（execute → review → revise）が破壊されていないことを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document が存在する
  - GitHub API クライアントがモック化されている
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `RequirementsPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出し、`requirements.md` を生成
  3. `review()` メソッドを呼び出し、レビュー結果を取得
  4. レビュー結果が `'REVISE_NEEDED'` の場合、`revise()` メソッドを呼び出し、`requirements.md` を修正
  5. すべてのステップが成功することを確認
- **期待結果**:
  - `execute()` が成功（`{ success: true }`）
  - `review()` が成功（`{ success: true, output: 'PASS' }` または `{ success: true, output: 'REVISE_NEEDED' }`）
  - `revise()` が成功（`{ success: true }`）
  - メタデータが各ステップで正しく更新される
- **確認項目**:
  - [x] `execute()` が成功している
  - [x] `requirements.md` が生成されている
  - [x] `review()` が成功している
  - [x] レビュー結果が GitHub にコメント投稿されている
  - [x] `revise()` が成功している（REVISE_NEEDED の場合）
  - [x] メタデータが正しく更新されている

---

**シナリオ名**: `DesignPhase で execute → review → revise フローが正常に動作し、設計決定も抽出される`

- **テストID**: IT-010
- **優先度**: 高
- **目的**: 特殊ロジック（設計決定抽出）を持つ DesignPhase でも既存フローが破壊されていないことを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - Planning Document、Requirements Document が存在する
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `DesignPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出し、`design.md` を生成し、設計決定を抽出
  3. `review()` メソッドを呼び出し、レビュー結果を取得
  4. `revise()` メソッドを呼び出し、`design.md` を修正（設計決定は再抽出されない）
  5. すべてのステップが成功することを確認
- **期待結果**:
  - `execute()` が成功し、設計決定が抽出される
  - `review()` が成功
  - `revise()` が成功し、設計決定は再抽出されない（既に存在するため）
  - メタデータが各ステップで正しく更新される
- **確認項目**:
  - [x] `execute()` が成功している
  - [x] `design.md` が生成されている
  - [x] 設計決定が抽出されている
  - [x] `review()` が成功している
  - [x] `revise()` が成功している
  - [x] `revise()` 実行後も設計決定が再抽出されていない
  - [x] メタデータが正しく更新されている

---

**シナリオ名**: `PlanningPhase で execute → review フローが正常に動作する（revise なし）`

- **テストID**: IT-011
- **優先度**: 中
- **目的**: PlanningPhase は `revise()` メソッドを持たないため、execute → review のみで正常に動作することを検証
- **前提条件**:
  - Issue #47 のメタデータが存在する
  - エージェントクライアントがモック化されている
- **テスト手順**:
  1. `PlanningPhase` のインスタンスを作成
  2. `execute()` メソッドを呼び出し、`planning.md` を生成
  3. `review()` メソッドを呼び出し、レビュー結果を取得
  4. `revise()` メソッドが存在しないことを確認
- **期待結果**:
  - `execute()` が成功
  - `review()` が成功
  - `revise()` メソッドが存在しない（または呼び出されない）
  - メタデータが正しく更新される
- **確認項目**:
  - [x] `execute()` が成功している
  - [x] `planning.md` が生成されている
  - [x] `review()` が成功している
  - [x] `revise()` メソッドが存在しない
  - [x] メタデータが正しく更新されている

---

## 4. テストデータ

### 4.1 正常データ

#### 4.1.1 Issue情報

```json
{
  "number": 47,
  "title": "Refactor: Extract duplicated phase template pattern from all phase implementations",
  "state": "open",
  "body": "## Problem\nAll 10 phase implementations repeat the same pattern...",
  "labels": [],
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

#### 4.1.2 メタデータ（metadata.json）

```json
{
  "issue_number": "47",
  "phases": {
    "planning": {
      "status": "completed",
      "output_file": ".ai-workflow/issue-47/00_planning/output/planning.md"
    },
    "requirements": {
      "status": "pending",
      "output_file": null
    },
    "design": {
      "status": "pending",
      "output_file": null
    }
  },
  "design_decisions": {
    "implementation_strategy": null,
    "test_strategy": null,
    "test_code_strategy": null
  }
}
```

#### 4.1.3 プロンプトテンプレート例（requirements/execute.txt）

```
# 要件定義フェーズ - 実行プロンプト

## Planning Phase成果物
- Planning Document: {planning_document_path}

## GitHub Issue情報
{issue_info}

## Issue番号
{issue_number}
```

#### 4.1.4 設計書（design.md）の例（設計決定を含む）

```markdown
# 設計書

## 実装戦略: REFACTOR
## テスト戦略: UNIT_INTEGRATION
## テストコード戦略: CREATE_TEST
```

### 4.2 異常データ

#### 4.2.1 存在しないファイルパス

```typescript
phaseOutputFile: 'missing.md' // ファイルが存在しない
```

#### 4.2.2 エージェント実行エラー

```typescript
// executeWithAgent() がエラーをスロー
throw new Error('Agent execution failed: API rate limit exceeded')
```

### 4.3 境界値データ

#### 4.3.1 空文字列

```typescript
templateVariables: {
  var1: '',
  var2: ''
}
```

#### 4.3.2 maxTurns = 0

```typescript
options: { maxTurns: 0 }
```

#### 4.3.3 変数なし

```typescript
templateVariables: {} // 空オブジェクト
```

---

## 5. テスト環境要件

### 5.1 テスト環境

| 項目 | 要件 |
|-----|------|
| **Node.js バージョン** | 20.x 以上 |
| **npm バージョン** | 10.x 以上 |
| **テストフレームワーク** | Jest（`package.json` に記載のバージョン） |
| **TypeScript バージョン** | 5.x |
| **OS** | Linux, macOS, Windows（クロスプラットフォーム） |

### 5.2 必要な外部サービス・データベース

| サービス | 必要性 | モック化 |
|---------|-------|---------|
| **GitHub API** | 必要 | モック化する（`@octokit/rest` をモック） |
| **Codex Agent API** | 必要 | モック化する（`CodexAgentClient` をモック） |
| **Claude Agent API** | 必要 | モック化する（`ClaudeAgentClient` をモック） |
| **ファイルシステム** | 必要 | 一部モック化する（`fs.existsSync`, `fs.readFileSync` 等） |

### 5.3 モック/スタブの必要性

#### 5.3.1 ユニットテストで必要なモック

| モック対象 | モック理由 | モック実装方法 |
|----------|----------|--------------|
| `loadPrompt()` | プロンプトファイルの読み込みを避けるため | `jest.spyOn()` で固定文字列を返す |
| `executeWithAgent()` | 実際のエージェント実行を避けるため | `jest.spyOn()` で空配列を返す |
| `fs.existsSync()` | ファイルシステムアクセスを避けるため | `jest.mock('fs-extra')` でモック化 |

#### 5.3.2 統合テストで必要なモック

| モック対象 | モック理由 | モック実装方法 |
|----------|----------|--------------|
| `GitHubClient` | GitHub API 呼び出しを避けるため | `jest.mock()` でモッククラスを作成 |
| `CodexAgentClient` | Codex API 呼び出しを避けるため | `jest.mock()` でモッククラスを作成 |
| `ClaudeAgentClient` | Claude API 呼び出しを避けるため | `jest.mock()` でモッククラスを作成 |

### 5.4 テスト実行コマンド

```bash
# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# すべてのテスト
npm test

# カバレッジ付きテスト
npm run test:coverage
```

---

## 6. テストカバレッジ目標

| カバレッジ指標 | 目標値 | 測定方法 |
|--------------|-------|---------|
| **Statements** | 85% 以上 | `npm run test:coverage` |
| **Branches** | 85% 以上 | `npm run test:coverage` |
| **Functions** | 85% 以上 | `npm run test:coverage` |
| **Lines** | 85% 以上 | `npm run test:coverage` |

### 6.1 カバレッジ対象

- `src/phases/base-phase.ts` の新規メソッド（`executePhaseTemplate()`）
- 各フェーズクラスの `execute()` メソッド（リファクタリング後）

### 6.2 カバレッジ除外

- `src/phases/base-phase.ts` の既存メソッド（変更なし）
- ログ出力のみを行うコード（`console.info`, `console.warn` 等）
- エラーハンドリング用の catch ブロック（実際にエラーが発生しにくいケース）

---

## 7. 品質ゲート（Phase 3: テストシナリオ）

本テストシナリオは、以下の品質ゲートを満たしています：

### 7.1 品質ゲートチェックリスト

- ✅ **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_INTEGRATION（Phase 2で決定）
  - ユニットテストシナリオ（セクション 2）を作成
  - 統合テストシナリオ（セクション 3）を作成
  - BDDシナリオは不要（Phase 2の決定に準拠）

- ✅ **主要な正常系がカバーされている**
  - UT-001: 基本的な変数置換（正常系）
  - UT-002: オプション引数なし（正常系）
  - UT-003: オプション引数あり（正常系）
  - UT-004: 複数変数の置換（正常系）
  - IT-001: RequirementsPhase の正常実行
  - IT-003: DesignPhase の正常実行（設計決定抽出含む）
  - IT-005: ImplementationPhase の正常実行（オプショナルコンテキスト含む）
  - IT-007: TestingPhase の正常実行（ファイル更新チェック含む）

- ✅ **主要な異常系がカバーされている**
  - UT-005: 出力ファイル不在（異常系）
  - UT-006: executeWithAgent がエラーをスロー（異常系）
  - IT-008: TestingPhase でファイルが更新されない場合のエラー

- ✅ **期待結果が明確である**
  - すべてのテストケースで「期待結果」セクションを明記
  - 入力、出力、状態変化が具体的に記述されている
  - 確認項目チェックリストを各統合テストに追加

---

## 8. テストの優先度と実行順序

### 8.1 優先度の定義

| 優先度 | 定義 | 実行タイミング |
|-------|------|--------------|
| **高** | クリティカルな機能、既存動作の保証に必須 | Phase 6（テスト実行）で必須実行 |
| **中** | 重要だが、失敗しても次フェーズに進める | Phase 6 で実行推奨 |
| **低** | エッジケース、境界値テスト | Phase 6 で時間があれば実行 |

### 8.2 推奨実行順序

1. **ユニットテスト（正常系）**: UT-001, UT-002, UT-003, UT-004
2. **ユニットテスト（異常系）**: UT-005, UT-006
3. **統合テスト（標準フェーズ）**: IT-001, IT-002
4. **統合テスト（特殊ロジック）**: IT-003, IT-004, IT-005, IT-006, IT-007, IT-008
5. **統合テスト（回帰テスト）**: IT-009, IT-010, IT-011
6. **ユニットテスト（境界値）**: UT-007, UT-008, UT-009

---

## 9. テスト実施時の注意事項

### 9.1 モック化の注意点

- `executeWithAgent()` をモック化する際、エージェントログ（`messages`）を正しく返すこと
  - 空配列 `[]` または、ダミーメッセージ `[{ role: 'assistant', content: '...' }]`

### 9.2 ファイルシステムの注意点

- 統合テストでは、実際にファイルを作成する場合と、モック化する場合を明確に区別すること
  - 実ファイル作成: `test-result.md` の更新チェック（IT-007, IT-008）
  - モック化: 出力ファイル存在チェック（UT-005）

### 9.3 CI/CD環境での実行

- CI/CD環境では、GitHub API クライアントを完全にモック化すること
  - 実際の GitHub API 呼び出しは避ける（レート制限を回避）

### 9.4 テストデータのクリーンアップ

- 統合テスト実行後、テスト用ファイル（`test.md`, `requirements.md` 等）をクリーンアップすること
  - Jest の `afterEach()` または `afterAll()` でクリーンアップ処理を実装

---

## 10. 次フェーズへの引き継ぎ事項

### 10.1 Phase 4（実装）へのインプット

- **ユニットテストの実装ガイド**: セクション 2（ユニットテストシナリオ）を参照
- **統合テストの実装ガイド**: セクション 3（統合テストシナリオ）を参照
- **モック戦略**: セクション 2.2（モック・スタブ戦略）を参照

### 10.2 Phase 5（テストコード実装）へのインプット

- **テストファイル構造**:
  - `tests/unit/phases/base-phase.test.ts` （新規作成）
  - `tests/integration/phases/requirements.test.ts` （拡張）
  - `tests/integration/phases/design.test.ts` （拡張）
  - `tests/integration/phases/implementation.test.ts` （拡張）
  - `tests/integration/phases/testing.test.ts` （拡張）

- **テストカバレッジ目標**: 85% 以上（セクション 6 参照）

### 10.3 Phase 6（テスト実行）へのインプット

- **実行順序**: セクション 8.2（推奨実行順序）を参照
- **注意事項**: セクション 9（テスト実施時の注意事項）を参照

---

## 11. 結論

### 11.1 テストシナリオサマリー

Issue #47「Refactor: Extract duplicated phase template pattern from all phase implementations」のテストシナリオを作成しました。

**テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）

**テストケース数**:
- **ユニットテスト**: 9ケース（正常系: 4、異常系: 2、境界値: 3）
- **統合テスト**: 11ケース（標準フェーズ: 2、特殊ロジック: 6、回帰テスト: 3）
- **合計**: 20ケース

### 11.2 カバレッジ予測

**ユニットテスト**:
- `executePhaseTemplate()` メソッドのカバレッジ: 85% 以上（目標達成見込み）
- 正常系、異常系、境界値がすべてカバーされている

**統合テスト**:
- 標準フェーズ（RequirementsPhase, TestScenarioPhase）のカバレッジ: 90% 以上
- 特殊ロジック含むフェーズ（DesignPhase, ImplementationPhase, TestingPhase）のカバレッジ: 85% 以上
- 既存フローの回帰テストにより、execute → review → revise フローが保証される

### 11.3 品質ゲート達成状況

- ✅ **Phase 2の戦略に沿ったテストシナリオである**（UNIT_INTEGRATION）
- ✅ **主要な正常系がカバーされている**（8ケース）
- ✅ **主要な異常系がカバーされている**（3ケース）
- ✅ **期待結果が明確である**（すべてのテストケースで明記）

**結論**: 本テストシナリオは Phase 3 の品質ゲートをすべて満たしており、次フェーズ（Phase 4: 実装）へ進む準備が整っています。

---

## 付録A: テストケース一覧表

| テストID | テストケース名 | テスト種別 | 優先度 | 対象メソッド/フェーズ |
|---------|--------------|-----------|-------|--------------------|
| UT-001 | executePhaseTemplate_正常系_基本的な変数置換 | Unit | 高 | BasePhase.executePhaseTemplate() |
| UT-002 | executePhaseTemplate_正常系_オプション引数なし | Unit | 高 | BasePhase.executePhaseTemplate() |
| UT-003 | executePhaseTemplate_正常系_オプション引数あり | Unit | 高 | BasePhase.executePhaseTemplate() |
| UT-004 | executePhaseTemplate_正常系_複数変数の置換 | Unit | 中 | BasePhase.executePhaseTemplate() |
| UT-005 | executePhaseTemplate_異常系_出力ファイル不在 | Unit | 高 | BasePhase.executePhaseTemplate() |
| UT-006 | executePhaseTemplate_異常系_executeWithAgentがエラーをスロー | Unit | 中 | BasePhase.executePhaseTemplate() |
| UT-007 | executePhaseTemplate_境界値_空文字列の変数置換 | Unit | 低 | BasePhase.executePhaseTemplate() |
| UT-008 | executePhaseTemplate_境界値_変数なし | Unit | 低 | BasePhase.executePhaseTemplate() |
| UT-009 | executePhaseTemplate_境界値_maxTurnsが0 | Unit | 低 | BasePhase.executePhaseTemplate() |
| IT-001 | RequirementsPhase.execute() 正常実行 | Integration | 高 | RequirementsPhase |
| IT-002 | TestScenarioPhase.execute() 正常実行 | Integration | 中 | TestScenarioPhase |
| IT-003 | DesignPhase.execute() 正常実行（設計決定抽出） | Integration | 高 | DesignPhase |
| IT-004 | DesignPhase.execute() 設計決定が既に存在 | Integration | 中 | DesignPhase |
| IT-005 | ImplementationPhase.execute() オプショナルコンテキスト（フォールバック） | Integration | 高 | ImplementationPhase |
| IT-006 | ImplementationPhase.execute() オプショナルコンテキスト（ファイルパス参照） | Integration | 中 | ImplementationPhase |
| IT-007 | TestingPhase.execute() ファイル更新チェック（成功） | Integration | 高 | TestingPhase |
| IT-008 | TestingPhase.execute() ファイル更新チェック（失敗） | Integration | 高 | TestingPhase |
| IT-009 | RequirementsPhase execute → review → revise フロー | Integration | 高 | RequirementsPhase |
| IT-010 | DesignPhase execute → review → revise フロー | Integration | 高 | DesignPhase |
| IT-011 | PlanningPhase execute → review フロー（revise なし） | Integration | 中 | PlanningPhase |

**合計テストケース数**: 20ケース
- **優先度: 高**: 13ケース
- **優先度: 中**: 4ケース
- **優先度: 低**: 3ケース

---

以上で、Issue #47 のテストシナリオを完了します。

**次のステップ**: Phase 4（実装）へ進み、本テストシナリオに基づいて `BasePhase.executePhaseTemplate()` メソッドと各フェーズのリファクタリングを実施してください。
