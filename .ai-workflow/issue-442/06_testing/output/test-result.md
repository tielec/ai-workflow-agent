# テスト実行結果

## テスト結果サマリー
- 総テスト数: 1551件
- 成功: 1135件
- 失敗: 415件
- 成功率: 73.18%

### `tests/unit/commands/auto-issue.test.ts::TC-CLI-001: parseOptions with default values`
- **エラー**: Repository 'repo' not found locally. Please ensure REPOS_ROOT is set correctly...
- **スタックトレース**:
  ```
  handleAutoIssueCommand (src/commands/auto-issue.ts:88:13)
  Object.<anonymous> (tests/unit/commands/auto-issue.test.ts:138:13)
  ```

### `tests/unit/commands/auto-issue.test.ts::Issue #153: GITHUB_REPOSITORY is set correctly`
- **エラー**: TypeError: jest.mocked(...).mockReturnValue is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/commands/auto-issue.test.ts:376:59)
  ```

### `tests/unit/commands/init-auto-model-selection.test.ts::TC-INIT-002 runs difficulty analysis...`
- **エラー**: TypeError: fs.ensureDir is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/commands/init-auto-model-selection.test.ts:168:14)
  ```

### `tests/unit/commands/init-auto-model-selection.test.ts::TC-INIT-001 skips difficulty analysis when disabled`
- **エラー**: TypeError: fs.removeSync is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/commands/init-auto-model-selection.test.ts:161:6)
  ```

### `tests/unit/phase-dependencies.test.ts::1.4.1: 全依存関係が満たされている場合`
- **エラー**: TypeError: fs.ensureDir is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/phase-dependencies.test.ts:72:14)
  ```

### `tests/unit/base-phase-optional-context.test.ts::1.3.1: ファイル存在時の参照生成`
- **エラー**: TypeError: fs.ensureDir is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/base-phase-optional-context.test.ts:31:14)
  ```

### `tests/unit/base-phase-optional-context.test.ts::afterAll cleanup`
- **エラー**: TypeError: fs.remove is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/base-phase-optional-context.test.ts:71:14)
  ```

### `tests/unit/helpers/metadata-io.test.ts`
- **エラー**: TypeError: Cannot assign to read only property 'copyFileSync' of object '[object Module]'
- **スタックトレース**:
  ```
  node_modules/jest-mock/build/index.js:622:31
  ```

### `tests/unit/pr-comment/change-applier.test.ts::CodeChangeApplier rejects absolute and traversal paths`
- **エラー**: Property `ensureDir` does not exist in the provided object
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/pr-comment/change-applier.test.ts:15:10)
  ```

### `tests/unit/core/issue-deduplicator.test.ts::Issue #153 end-to-end flow`
- **エラー**: TypeError: jest.mocked(...).mockReturnValue is not a function
- **スタックトレース**:
  ```
  Object.<anonymous> (tests/unit/core/issue-deduplicator.test.ts:335:50)
  ```
