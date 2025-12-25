# テスト実行結果

## テスト結果サマリー
- 総テスト数: 2205件
- 成功: 1638件
- 失敗: 547件
- 成功率: 74.3%

## 条件分岐
以下のテストが失敗しました。

### `tests/integration/github-client-facade.test.ts::GitHubClient Facade Integration › Pull Request Operations Delegation › should delegate closePullRequest to PullRequestClient`
- **エラー**: ReferenceError: jest is not defined
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/github-client-facade.test.ts:228:27)
  ```

### `tests/unit/core/metadata-manager-rollback.test.ts::MetadataManager - Rollback機能 › UC-MM-01: setRollbackContext() - 正常系`
- **エラー**: TypeError: existsSync.mockReturnValue is not a function
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/core/metadata-manager-rollback.test.ts:35:16)
  ```

### `tests/integration/metadata-persistence.test.ts::メタデータ永続化の統合テスト › メタデータ永続化フロー`
- **エラー**: Error: metadata.json not found: /test/.ai-workflow/issue-26/metadata.json
- **スタックトレース**:
  ```
  at Function.load (src/core/workflow-state.ts:67:13)
  at new MetadataManager (src/core/metadata-manager.ts:43:32)
  at Object.<anonymous> (tests/integration/metadata-persistence.test.ts:42:23)
  ```

### `tests/integration/jenkins/auto-issue-custom-instruction.test.ts::Integration: auto-issue Jenkins Custom Instruction support (Issue #435) › documents the CUSTOM_INSTRUCTION parameter in the header comments`
- **エラー**: TypeError: The "cb" argument must be of type function. Received type string ('utf-8')
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/jenkins/auto-issue-custom-instruction.test.ts:23:35)
  ```

### `tests/integration/finalize-command.test.ts::Integration: Finalize Command - エンドツーエンドフロー › IT-510-001: pull を挟んでも headBeforeCleanup でスカッシュする`
- **エラー**: TypeError: jest.mocked(...).mockReturnValue is not a function
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/finalize-command.test.ts:104:32)
  ```

### `tests/integration/squash-workflow.test.ts::スカッシュワークフロー統合テスト › シナリオ 3.2.1: git reset → commit → push --force-with-lease の一連の流れ`
- **エラー**: expect(received).toBeLessThan(expected) with expected value undefined
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/squash-workflow.test.ts:244:28)
  ```

### `tests/unit/squash-manager.test.ts::SquashManager › Issue #216: ESM compatibility and forcePushToRemote › should load prompt template without __dirname error in ESM environment`
- **エラー**: expect(jest.fn()).toHaveBeenCalled() – mockReadFile が呼ばれていない
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/squash-manager.test.ts:591:28)
  ```
