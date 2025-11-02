# テストシナリオ - Issue #115

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

- **実装戦略**: EXTEND（既存テストファイルの修正）
- **テスト戦略**: UNIT_ONLY（修正後の動作確認のみ）
- **テストコード戦略**: EXTEND_TEST（既存テストの修正）
- **見積もり工数**: 4~6時間
- **複雑度**: 簡単
- **リスク評価**: 低

この テストシナリオでは、Planning Documentで策定された**UNIT_ONLY**戦略を踏襲します。

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY** (Phase 2で決定)

### 1.2 テスト対象の範囲

本Issueは**テストコード修正**のプロジェクトであり、以下の2つのテストファイルの修正を対象とします：

1. **統合テスト**: `tests/integration/phases/fallback-mechanism.test.ts`（15個のテストケース）
   - TypeScript型定義エラーの修正

2. **ユニットテスト**: `tests/unit/phases/base-phase-fallback.test.ts`（33個のテストケース）
   - モック設定の修正（4個のテストケース）
   - テストデータの修正（1個のテストケース）

### 1.3 テストの目的

このテストシナリオの目的は、**修正後のテストコードが正しく動作すること**を検証することです。具体的には：

1. **Task 1の検証**: TypeScript型定義修正後、15個の統合テストが全て成功すること
2. **Task 2の検証**: モック設定修正後、4個のexecutePhaseTemplateユニットテストが全て成功すること
3. **Task 3の検証**: テストデータ修正後、1個のisValidOutputContentテストが成功すること
4. **回帰テストの検証**: 全テストスイート（57ファイル）が引き続き成功すること

**重要な注意事項**: 本プロジェクトはテストコード修正のため、**メタテスト（テストのテスト）は作成しません**。修正後のテストコードの品質は、既存のテスト実行によって自己検証されます（UNIT_ONLY戦略）。

---

## 2. Unitテストシナリオ

本セクションでは、**修正後のテストコード**が正しく動作することを検証するためのテストシナリオを定義します。

### 2.1 Task 1: 統合テスト TypeScript コンパイルエラー修正

#### テストケース 1-1: TypeScriptコンパイル成功確認

**テストケース名**: `TypeScript_compilation_成功`

- **目的**: 修正後の統合テストファイルがTypeScript 5.x型チェックに適合し、コンパイルエラーが発生しないことを検証
- **前提条件**:
  - `tests/integration/phases/fallback-mechanism.test.ts` に型アノテーション修正が完了している
  - TypeScript 5.6.3がインストールされている
- **入力**:
  - コマンド: `tsc --noEmit`
- **期待結果**:
  - TypeScriptコンパイラが終了コード0で終了する
  - エラーメッセージが一切表示されない
  - 警告メッセージが一切表示されない
- **テストデータ**: 修正後の `tests/integration/phases/fallback-mechanism.test.ts`

**検証コマンド**:
```bash
tsc --noEmit
echo "Exit code: $?"
```

**成功条件**:
- 終了コード: 0
- エラー出力: 空

**失敗条件**:
- 終了コード: 非0
- エラー出力: 任意のTypeScriptエラーメッセージ

---

#### テストケース 1-2: 統合テスト実行成功確認（全15ケース）

**テストケース名**: `Integration_test_execution_全15ケース成功`

- **目的**: 修正後の統合テストファイルが15個全てのテストケースで成功することを検証
- **前提条件**:
  - テストケース 1-1 が成功している（TypeScriptコンパイルが成功）
  - `tests/integration/phases/fallback-mechanism.test.ts` に型アノテーション修正が完了している
- **入力**:
  - コマンド: `npm test tests/integration/phases/fallback-mechanism.test.ts`
- **期待結果**:
  - 15個のテストケースが全て成功する（15 passed, 0 failed）
  - テストが正常に終了する（終了コード0）
  - コンパイルエラーによるテストスキップが発生しない
- **テストデータ**: 修正後の `tests/integration/phases/fallback-mechanism.test.ts`

**検証コマンド**:
```bash
npm test tests/integration/phases/fallback-mechanism.test.ts 2>&1 | tee test-output.log
grep "15 passed" test-output.log
echo "Exit code: $?"
```

**成功条件**:
- テスト結果: "15 passed, 15 total"
- 終了コード: 0
- 失敗テスト数: 0

**失敗条件**:
- テスト結果に "failed" が含まれる
- 終了コード: 非0
- テストがスキップされる

**対象テストケース一覧（15個）**:
1. Planning Phase - should execute with fallback when output file is missing
2. Planning Phase - should not trigger fallback when output file exists
3. Planning Phase - should return error when fallback is disabled
4. Requirements Phase - should execute with fallback when output file is missing
5. Requirements Phase - should not trigger fallback when output file exists
6. Design Phase - should execute with fallback when output file is missing
7. Design Phase - should not trigger fallback when output file exists
8. TestScenario Phase - should execute with fallback when output file is missing
9. TestScenario Phase - should not trigger fallback when output file exists
10. Implementation Phase - should execute with fallback when output file is missing
11. Implementation Phase - should not trigger fallback when output file exists
12. Report Phase - should execute with fallback when output file is missing
13. Report Phase - should not trigger fallback when output file exists
14. Regression test - should not affect existing phases without fallback
15. Error handling - should handle LLM errors gracefully

---

#### テストケース 1-3: 型アノテーションの正確性確認

**テストケース名**: `Type_annotation_正確性確認`

- **目的**: 修正後の型アノテーションが `as any` を使用せず、正しい型推論を実現していることを検証
- **前提条件**:
  - テストケース 1-1 が成功している（TypeScriptコンパイルが成功）
  - `tests/integration/phases/fallback-mechanism.test.ts` に型アノテーション修正が完了している
- **入力**:
  - コマンド: `grep -r "as any" tests/integration/phases/fallback-mechanism.test.ts`
- **期待結果**:
  - `as any` の使用が最小限（0個または必要最小限のみ）
  - 型パラメータ指定（例: `jest.fn<() => Promise<IssueInfo>>()`）が使用されている
  - `jest.Mocked<T>` 型が適切に使用されている
- **テストデータ**: 修正後の `tests/integration/phases/fallback-mechanism.test.ts`

**検証コマンド**:
```bash
# as any の使用数をカウント
grep -o "as any" tests/integration/phases/fallback-mechanism.test.ts | wc -l

# jest.fn<> の型パラメータ使用を確認
grep -o "jest.fn<" tests/integration/phases/fallback-mechanism.test.ts | wc -l
```

**成功条件**:
- `as any` の使用数: 0個（または必要最小限、NFR-4で許可された範囲内）
- 型パラメータ指定の使用数: 15個以上（各テストケースのモック設定）

**失敗条件**:
- `as any` が過度に使用されている（10個以上）
- 型パラメータ指定が使用されていない

---

### 2.2 Task 2: ユニットテスト モック設定修正

#### テストケース 2-1: executePhaseTemplateテスト実行成功確認（4ケース）

**テストケース名**: `Unit_test_executePhaseTemplate_4ケース成功`

- **目的**: モック設定修正後、4個のexecutePhaseTemplateユニットテストが全て成功することを検証
- **前提条件**:
  - `tests/unit/phases/base-phase-fallback.test.ts` のモック範囲見直しが完了している
  - 共通ヘルパー関数 `setupFileSystemMock()` が実装されている
- **入力**:
  - コマンド: `npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="executePhaseTemplate"`
- **期待結果**:
  - 4個のexecutePhaseTemplateテストケースが全て成功する（4 passed, 0 failed）
  - `loadPrompt()` メソッドが正常に動作する（プロンプトファイルの読み込みに成功）
  - `fs.readFileSync` モックが `loadPrompt()` に影響を与えない
  - "EACCES: permission denied" エラーが発生しない
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts`

**検証コマンド**:
```bash
npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="executePhaseTemplate" 2>&1 | tee test-output.log
grep "4 passed" test-output.log
grep -i "EACCES" test-output.log && echo "ERROR: Permission denied found" || echo "OK: No permission errors"
echo "Exit code: $?"
```

**成功条件**:
- テスト結果: "4 passed"
- 終了コード: 0
- エラーログに "EACCES" が含まれない
- エラーログに "permission denied" が含まれない

**失敗条件**:
- テスト結果に "failed" が含まれる
- 終了コード: 非0
- エラーログに "EACCES" または "permission denied" が含まれる

**対象テストケース一覧（4個）**:
1. File exists - Normal flow: "should return success when output file exists"
2. Fallback trigger: "should trigger fallback when file is missing and enableFallback is true"
3. Fallback disabled: "should return error when file is missing and enableFallback is false"
4. Default fallback: "should return error when enableFallback is not specified (default: false)"

---

#### テストケース 2-2: モック範囲限定の正確性確認

**テストケース名**: `Mock_scope_限定確認`

- **目的**: モック設定が適切に範囲限定されており、プロンプトファイル読み込みが実ファイルシステムを使用していることを検証
- **前提条件**:
  - `tests/unit/phases/base-phase-fallback.test.ts` のモック範囲見直しが完了している
  - 共通ヘルパー関数 `setupFileSystemMock()` が実装されている
- **入力**:
  - テストコード内の `setupFileSystemMock()` 関数の実装を確認
- **期待結果**:
  - プロンプトファイル（`/prompts/` または `\\prompts\\` を含むパス）は実ファイルシステムを使用
  - その他のファイル（`agent_log.md` 等）はモックを使用
  - クロスプラットフォーム対応（Windows: `\\`、Linux/Mac: `/`）
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts` のモック実装

**検証方法**:
```bash
# setupFileSystemMock() 関数の存在確認
grep -A 20 "function setupFileSystemMock" tests/unit/phases/base-phase-fallback.test.ts

# プロンプトファイルパスの条件分岐確認
grep -o "filepath.includes('/prompts/')" tests/unit/phases/base-phase-fallback.test.ts | wc -l
grep -o "filepath.includes('\\\\prompts\\\\')" tests/unit/phases/base-phase-fallback.test.ts | wc -l
```

**成功条件**:
- `setupFileSystemMock()` 関数が存在する
- プロンプトファイルパスの条件分岐が実装されている（`/prompts/` と `\\prompts\\` の両方）
- 実ファイルシステムアクセス（`jest.requireActual('fs-extra').readFileSync()`）が使用されている

**失敗条件**:
- `setupFileSystemMock()` 関数が存在しない
- プロンプトファイルパスの条件分岐が不完全
- 実ファイルシステムアクセスが実装されていない

---

#### テストケース 2-3: 全ユニットテスト実行成功確認（33ケース）

**テストケース名**: `Unit_test_execution_全33ケース成功`

- **目的**: モック設定修正が他のユニットテストに影響を与えず、全33個のテストケースが成功することを検証
- **前提条件**:
  - テストケース 2-1 が成功している（executePhaseTemplateテストが成功）
  - `tests/unit/phases/base-phase-fallback.test.ts` のモック範囲見直しが完了している
- **入力**:
  - コマンド: `npm test tests/unit/phases/base-phase-fallback.test.ts`
- **期待結果**:
  - 33個のユニットテストケースが全て成功する（33 passed, 0 failed）
  - テストが正常に終了する（終了コード0）
  - モック修正によって他のテストが破壊されていない
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts`

**検証コマンド**:
```bash
npm test tests/unit/phases/base-phase-fallback.test.ts 2>&1 | tee test-output.log
grep "33 passed" test-output.log
echo "Exit code: $?"
```

**成功条件**:
- テスト結果: "33 passed, 33 total"
- 終了コード: 0
- 失敗テスト数: 0

**失敗条件**:
- テスト結果に "failed" が含まれる
- 終了コード: 非0
- モック修正前に成功していたテストが失敗する

---

### 2.3 Task 3: テストデータ修正

#### テストケース 3-1: isValidOutputContentテスト成功確認

**テストケース名**: `isValidOutputContent_test_成功`

- **目的**: テストデータ修正後、isValidOutputContentテスト（"should validate content with sufficient length and sections"）が成功することを検証
- **前提条件**:
  - `tests/unit/phases/base-phase-fallback.test.ts` のテストデータ修正が完了している
  - テストデータにPlanning Phaseキーワード（実装戦略、テスト戦略、タスク分割）が追加されている
- **入力**:
  - コマンド: `npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="should validate content with sufficient length and sections"`
- **期待結果**:
  - 当該テストケースが成功する（1 passed, 0 failed）
  - `isValidOutputContent()` メソッドが `true` を返す
  - Planning Phaseキーワードが正しく検出される
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts` のテストデータ

**検証コマンド**:
```bash
npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="should validate content with sufficient length and sections" 2>&1 | tee test-output.log
grep "1 passed" test-output.log
echo "Exit code: $?"
```

**成功条件**:
- テスト結果: "1 passed"
- 終了コード: 0
- エラーログに "Expected: true, Received: false" が含まれない

**失敗条件**:
- テスト結果に "failed" が含まれる
- 終了コード: 非0
- エラーログに "Expected: true, Received: false" が含まれる

---

#### テストケース 3-2: Planning Phaseキーワードの存在確認

**テストケース名**: `Planning_phase_keywords_存在確認`

- **目的**: テストデータにPlanning Phaseの必須キーワードが含まれていることを検証
- **前提条件**:
  - `tests/unit/phases/base-phase-fallback.test.ts` のテストデータ修正が完了している
- **入力**:
  - テストコード内のテストデータ（content変数）を確認
- **期待結果**:
  - 以下のキーワードのうち、少なくとも1つが含まれている:
    - 日本語: 実装戦略、テスト戦略、タスク分割
    - 英語: Implementation Strategy, Test Strategy, Task Breakdown
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts` のテストデータ

**検証コマンド**:
```bash
# テストデータ内のキーワード存在確認
grep -A 30 "should validate content with sufficient length and sections" tests/unit/phases/base-phase-fallback.test.ts | grep -E "(実装戦略|テスト戦略|タスク分割|Implementation Strategy|Test Strategy|Task Breakdown)"
```

**成功条件**:
- 日本語キーワード（実装戦略、テスト戦略、タスク分割）のうち、少なくとも1つが存在する
- または、英語キーワード（Implementation Strategy, Test Strategy, Task Breakdown）のうち、少なくとも1つが存在する

**失敗条件**:
- 日本語・英語のいずれのキーワードも存在しない

---

### 2.4 回帰テスト

#### テストケース 4-1: 全テストスイート実行成功確認（57ファイル）

**テストケース名**: `Full_test_suite_全57ファイル成功`

- **目的**: 修正が他のテストファイルに影響を与えず、全テストスイート（57ファイル）が引き続き成功することを検証
- **前提条件**:
  - テストケース 1-2、2-3、3-1 が全て成功している
  - 2つのテストファイル（`tests/integration/phases/fallback-mechanism.test.ts`、`tests/unit/phases/base-phase-fallback.test.ts`）の修正が完了している
- **入力**:
  - コマンド: `npm test`
- **期待結果**:
  - 全57テストファイルが成功する（Test Suites: 57 passed, 57 total）
  - 全テストケースが成功する（Tests: X passed, X total）
  - 修正によって他のテストが破壊されていない
- **テストデータ**: 全テストファイル（57ファイル）

**検証コマンド**:
```bash
npm test 2>&1 | tee test-output.log
grep "Test Suites:" test-output.log
grep "Tests:" test-output.log
echo "Exit code: $?"
```

**成功条件**:
- テスト結果: "Test Suites: 57 passed, 57 total"
- テスト結果: "Tests: X passed, X total"（Xは全テストケース数）
- 終了コード: 0
- 失敗テストスイート数: 0

**失敗条件**:
- テスト結果に "failed" が含まれる
- 終了コード: 非0
- 修正前に成功していたテストファイルが失敗する

---

#### テストケース 4-2: カバレッジレポート確認

**テストケース名**: `Coverage_report_問題なし確認`

- **目的**: 修正によって新たなカバレッジ問題が発生していないことを検証
- **前提条件**:
  - テストケース 4-1 が成功している（全テストスイートが成功）
- **入力**:
  - コマンド: `npm run test:coverage`
- **期待結果**:
  - カバレッジレポートが生成される
  - 新たな警告が発生していない
  - カバレッジ率が低下していない（修正前と同等以上）
- **テストデータ**: 全テストファイル（57ファイル）

**検証コマンド**:
```bash
npm run test:coverage 2>&1 | tee coverage-output.log
grep "Coverage" coverage-output.log
echo "Exit code: $?"
```

**成功条件**:
- カバレッジレポートが生成される
- 終了コード: 0
- 新たな警告が発生していない

**失敗条件**:
- カバレッジレポート生成に失敗する
- 終了コード: 非0
- カバレッジ率が大幅に低下する（5%以上低下）

---

### 2.5 パフォーマンステスト

#### テストケース 5-1: ユニットテスト実行時間確認

**テストケース名**: `Unit_test_performance_2倍以下`

- **目的**: モック修正によってユニットテストの実行時間が2倍以上に増加していないことを検証（NFR-1）
- **前提条件**:
  - 修正前のユニットテスト実行時間が測定されている
  - テストケース 2-3 が成功している（全33個のユニットテストが成功）
- **入力**:
  - コマンド: `time npm test tests/unit/phases/base-phase-fallback.test.ts`
- **期待結果**:
  - 実行時間が修正前の2倍以内
  - 過度に複雑なモック設定によるパフォーマンス劣化がない
- **テストデータ**: 修正後の `tests/unit/phases/base-phase-fallback.test.ts`

**検証コマンド**:
```bash
# 修正前のベースライン測定（参考）
# time npm test tests/unit/phases/base-phase-fallback.test.ts

# 修正後の測定
time npm test tests/unit/phases/base-phase-fallback.test.ts 2>&1 | tee performance-output.log
```

**成功条件**:
- 実行時間: 修正前の2倍以内（例: 修正前10秒 → 修正後20秒以内）

**失敗条件**:
- 実行時間: 修正前の2倍超過（例: 修正前10秒 → 修正後21秒以上）

---

#### テストケース 5-2: 全テストスイート実行時間確認

**テストケース名**: `Full_test_suite_performance_30秒以内増加`

- **目的**: 修正によって全テストスイート実行時間が30秒以上増加していないことを検証（NFR-1）
- **前提条件**:
  - 修正前の全テストスイート実行時間が測定されている
  - テストケース 4-1 が成功している（全57ファイルのテストが成功）
- **入力**:
  - コマンド: `time npm test`
- **期待結果**:
  - 実行時間の増加が30秒以内
  - テスト実行効率が維持されている
- **テストデータ**: 全テストファイル（57ファイル）

**検証コマンド**:
```bash
# 修正前のベースライン測定（参考）
# time npm test

# 修正後の測定
time npm test 2>&1 | tee performance-output.log
```

**成功条件**:
- 実行時間の増加: 30秒以内（例: 修正前120秒 → 修正後150秒以内）

**失敗条件**:
- 実行時間の増加: 30秒超過（例: 修正前120秒 → 修正後151秒以上）

---

## 3. テストデータ

### 3.1 Task 1: 統合テストのテストデータ

**対象ファイル**: `tests/integration/phases/fallback-mechanism.test.ts`

**テストデータ種別**: 型アノテーション修正

**正常データ**:
- `jest.fn<() => Promise<IssueInfo>>()` 形式の型パラメータ指定
- `jest.Mocked<GitHubClient>` 形式の型アサーション
- `jest.Mocked<Pick<GitHubClient, 'getIssueInfo' | 'postComment'>>` 形式の型アサーション

**異常データ**:
- `as any` による型アサーション回避（最悪の場合のみ、NFR-4で許可された範囲内）

**境界値データ**:
- TypeScript 5.x strict type checking の境界ケース

### 3.2 Task 2: ユニットテストのテストデータ

**対象ファイル**: `tests/unit/phases/base-phase-fallback.test.ts`

**テストデータ種別**: モック設定の範囲限定

**正常データ**:
- プロンプトファイルパス: `/prompts/planning.hbs`、`/prompts/requirements.hbs` 等
- テスト用ファイルパス: `agent_log.md`、`planning.md` 等

**異常データ**:
- 存在しないファイルパス
- パーミッションエラーを引き起こすファイルパス

**境界値データ**:
- クロスプラットフォームのパス区切り文字（Windows: `\\`、Linux/Mac: `/`）

### 3.3 Task 3: テストデータ修正

**対象ファイル**: `tests/unit/phases/base-phase-fallback.test.ts`

**テストデータ種別**: Planning Phaseキーワードを含むコンテンツ

**正常データ**:
```markdown
# Planning Document

## Section 1: Implementation Strategy
This is a comprehensive analysis with detailed explanations that provide sufficient content length.
実装戦略: EXTEND strategy will be used for this implementation.

## Section 2: Test Strategy
More detailed content with implementation strategy information.
テスト戦略: UNIT_INTEGRATION testing approach will be applied.

## Section 3: Task Breakdown
Additional sections with test strategy details.
タスク分割: Tasks are divided into multiple phases for efficient execution.
```

**異常データ**:
```markdown
# Planning Document

## Section 1
Content without Planning phase keywords.

## Section 2
More content without required keywords.
```

**境界値データ**:
- コンテンツ長: 100文字ちょうど
- セクション数: 1個（最小）
- キーワード数: 1個（最小、"実装戦略" のみ）

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

**ローカル環境**:
- Node.js: 20.x
- npm: 10.x
- TypeScript: 5.6.3
- Jest: 既存のバージョン（`package.json` に記載）
- OS: Linux, macOS, Windows（クロスプラットフォーム対応）

**CI/CD環境**:
- Jenkins: 既存の設定（`.ai-workflow/` 配下）
- 自動テスト実行（`npm test`）
- カバレッジレポート生成（`npm run test:coverage`）

### 4.2 必要な外部サービス・データベース

**外部サービス**: なし（本Issueは外部システムとの連携を必要としない）

**データベース**: なし（本Issueはデータベーススキーマ変更を必要としない）

### 4.3 モック/スタブの必要性

**既存のモック**:
- `fs.readFileSync` のモック（Task 2で範囲限定修正）
- `executeWithAgent` のモック（統合テストで使用）
- `loadPrompt` のモック（不要、実ファイルシステムを使用するよう修正）

**新規モック**: なし

**注意事項**:
- モック範囲を限定し、プロンプトファイル読み込みは実ファイルシステムを使用する
- 過度に広範囲なモックを避け、テスト実行効率を維持する

---

## 5. テスト実行手順

### 5.1 個別テスト実行

#### Task 1: 統合テスト TypeScript コンパイルエラー修正

```bash
# Step 1: TypeScriptコンパイル確認
tsc --noEmit

# Step 2: 統合テスト実行（15個）
npm test tests/integration/phases/fallback-mechanism.test.ts

# Step 3: 型アノテーションの正確性確認
grep -r "as any" tests/integration/phases/fallback-mechanism.test.ts
grep -o "jest.fn<" tests/integration/phases/fallback-mechanism.test.ts | wc -l
```

#### Task 2: ユニットテスト モック設定修正

```bash
# Step 1: executePhaseTemplateテスト実行（4個）
npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="executePhaseTemplate"

# Step 2: 全ユニットテスト実行（33個）
npm test tests/unit/phases/base-phase-fallback.test.ts

# Step 3: モック範囲限定の確認
grep -A 20 "function setupFileSystemMock" tests/unit/phases/base-phase-fallback.test.ts
```

#### Task 3: テストデータ修正

```bash
# Step 1: isValidOutputContentテスト実行（1個）
npm test tests/unit/phases/base-phase-fallback.test.ts -- --testNamePattern="should validate content with sufficient length and sections"

# Step 2: Planning Phaseキーワードの存在確認
grep -A 30 "should validate content with sufficient length and sections" tests/unit/phases/base-phase-fallback.test.ts | grep -E "(実装戦略|テスト戦略|タスク分割|Implementation Strategy|Test Strategy|Task Breakdown)"
```

### 5.2 回帰テスト実行

```bash
# Step 1: 全テストスイート実行（57ファイル）
npm test

# Step 2: カバレッジレポート生成
npm run test:coverage

# Step 3: テスト結果の確認
grep "Test Suites:" test-output.log
grep "Tests:" test-output.log
```

### 5.3 パフォーマンステスト実行

```bash
# Step 1: ユニットテスト実行時間測定
time npm test tests/unit/phases/base-phase-fallback.test.ts

# Step 2: 全テストスイート実行時間測定
time npm test

# Step 3: 実行時間の比較（修正前後）
```

---

## 6. 品質ゲート（Phase 3）

本テストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - UNIT_ONLY戦略に従い、修正後のテストコードの動作確認シナリオを作成
  - メタテスト（テストのテスト）は作成せず、既存のテスト実行による自己検証を採用

- [x] **主要な正常系がカバーされている**
  - Task 1: TypeScript型定義修正 → 15個の統合テスト成功
  - Task 2: モック設定修正 → 4個のexecutePhaseTemplateテスト成功、33個の全ユニットテスト成功
  - Task 3: テストデータ修正 → 1個のisValidOutputContentテスト成功
  - 回帰テスト: 全57テストファイル成功

- [x] **主要な異常系がカバーされている**
  - TypeScriptコンパイルエラー検出
  - モック設定の不備によるパーミッションエラー検出
  - Planning Phaseキーワード欠落によるテスト失敗検出
  - 回帰テスト失敗の検出

- [x] **期待結果が明確である**
  - 各テストケースで具体的な成功条件・失敗条件を定義
  - 検証コマンドと期待出力を明示
  - 数値的な基準を設定（例: 実行時間2倍以内、30秒以内増加）

---

## 7. テストシナリオのサマリー

### 7.1 テストケース数

| カテゴリ | テストケース数 |
|---------|---------------|
| Task 1: 統合テスト TypeScript コンパイルエラー修正 | 3 |
| Task 2: ユニットテスト モック設定修正 | 3 |
| Task 3: テストデータ修正 | 2 |
| 回帰テスト | 2 |
| パフォーマンステスト | 2 |
| **合計** | **12** |

### 7.2 テストケース優先度

| 優先度 | テストケース |
|-------|-------------|
| **P0（必須）** | テストケース 1-2、2-1、3-1、4-1（Task 1〜3の成功確認、回帰テスト） |
| **P1（高）** | テストケース 1-1、2-3、4-2（TypeScriptコンパイル、全ユニットテスト、カバレッジ） |
| **P2（中）** | テストケース 1-3、2-2、3-2（型アノテーション正確性、モック範囲限定、キーワード存在） |
| **P3（低）** | テストケース 5-1、5-2（パフォーマンステスト） |

### 7.3 テスト実行順序

1. **Phase 1**: Task 1のテストケース（1-1 → 1-2 → 1-3）
2. **Phase 2**: Task 2のテストケース（2-1 → 2-2 → 2-3）
3. **Phase 3**: Task 3のテストケース（3-1 → 3-2）
4. **Phase 4**: 回帰テスト（4-1 → 4-2）
5. **Phase 5**: パフォーマンステスト（5-1 → 5-2）

**依存関係**:
- Phase 2 は Phase 1 の成功が前提
- Phase 3 は Phase 2 の成功が前提
- Phase 4 は Phase 1〜3 の成功が前提
- Phase 5 は Phase 4 の成功が前提

---

## 8. 成功基準（再掲）

このプロジェクトは以下の条件を全て満たした場合に成功とします：

1. **Task 1成功**: `tests/integration/phases/fallback-mechanism.test.ts` の15個の統合テストが全て成功（テストケース 1-2）
2. **Task 2成功**: `tests/unit/phases/base-phase-fallback.test.ts` の4個のexecutePhaseTemplateユニットテストが全て成功（テストケース 2-1）
3. **Task 3成功**: `tests/unit/phases/base-phase-fallback.test.ts` の1個のisValidOutputContentテストが成功（テストケース 3-1）
4. **回帰なし**: 全テストスイート（57ファイル）が引き続き成功（テストケース 4-1）
5. **TypeScriptコンパイル成功**: `tsc --noEmit` でエラーなし（テストケース 1-1）
6. **パフォーマンス基準**: ユニットテスト実行時間が2倍以内、全テストスイート実行時間が30秒以内増加（テストケース 5-1、5-2）

---

## 9. 補足情報

### 9.1 テストシナリオの特性

本テストシナリオは、**テストコード修正プロジェクト**の特性を反映しています：

1. **メタテスト不要**: テストのテストを作成せず、既存のテスト実行による自己検証を採用（UNIT_ONLY戦略）
2. **既存テスト実行中心**: 修正後の動作確認が主目的であり、新規テストケース追加はしない（EXTEND_TEST戦略）
3. **回帰テスト重視**: 修正が他のテストに影響を与えないことを重点的に検証

### 9.2 テストシナリオの制約事項

- プロダクションコードは変更しない（テストコードのみの修正）
- テスト仕様は変更しない（実装の問題のみを修正）
- 新規テストケースは追加しない（既存テストの修正のみ）

### 9.3 参考ドキュメント

- **Issue #113 Evaluation Report**: `.ai-workflow/issue-113/09_evaluation/output/evaluation_report.md`（残タスクの詳細分析）
- **Issue #113 Test Result Report**: `.ai-workflow/issue-113/06_testing/output/test-result.md`（テスト失敗の詳細）
- **Planning Document**: `.ai-workflow/issue-115/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-115/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-115/02_design/output/design.md`

---

**テストシナリオ作成日**: 2025-11-02
**作成者**: Claude (AI Assistant)
**Issue**: #115
**テスト戦略**: UNIT_ONLY
**総テストケース数**: 12
**見積もり総工数**: 1h（テスト実行）
