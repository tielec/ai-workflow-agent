# テスト実行結果

## テスト結果サマリー
- 総テスト数: 558件
- 成功: 205件
- 失敗: 334件
- 成功率: 36.7%

以下のテストが失敗しました。

### `tests/integration/squash-workflow.test.ts`
- **エラー**: EACCES: permission denied, mkdir '/test'
- **スタックトレース**:
  ```
  Error: EACCES: permission denied, mkdir '/test'
    at SquashManager.squashCommits (src/core/git/squash-manager.ts:124:16)
    at Object.<anonymous> (tests/integration/squash-workflow.test.ts:130:7)
  ```

### `tests/integration/metadata-persistence.test.ts`
- **エラー**: metadata.json not found: /test/.ai-workflow/issue-26/metadata.json
- **スタックトレース**:
  ```
  Error: metadata.json not found: /test/.ai-workflow/issue-26/metadata.json
    at Function.load (src/core/workflow-state.ts:67:13)
    at new MetadataManager (src/core/metadata-manager.ts:43:32)
    at Object.<anonymous> (tests/integration/metadata-persistence.test.ts:103:23)
  ```

### `tests/integration/jenkins/auto-issue-custom-instruction.test.ts`
- **エラー**: TypeError: The "cb" argument must be of type function. Received type string ('utf-8')
- **スタックトレース**:
  ```
  TypeError: The "cb" argument must be of type function. Received type string ('utf-8')
    at Object.<anonymous> (tests/integration/jenkins/auto-issue-custom-instruction.test.ts:23:35)
  ```

### `tests/integration/jenkins/claude-md-auto-model-selection.test.ts`
- **エラー**: TypeError: The "cb" argument must be of type function. Received type string ('utf-8')
- **スタックトレース**:
  ```
  TypeError: The "cb" argument must be of type function. Received type string ('utf-8')
    at Object.<anonymous> (tests/integration/jenkins/claude-md-auto-model-selection.test.ts:24:32)
  ```

### その他
- **エラー**: Cannot log after tests are done. Did you forget to wait for something async in your test?
- **スタックトレース**:
  ```
  Cannot log after tests are done.
    at log (src/utils/logger.ts:123:17)
    at CodexAgentClient.logEvent (src/core/codex-agent-client.ts:258:14)
  ```
