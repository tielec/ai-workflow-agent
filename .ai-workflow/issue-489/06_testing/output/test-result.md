# テスト実行結果

## テスト結果サマリー
- 総テスト数: 2301件
- 成功: 2000件
- 失敗: 281件
- 成功率: 86.92%

## 条件分岐
以下に失敗したテストの詳細を記載します。

### `tests/unit/commands/init-auto-model-selection.test.ts::init command - auto model selection runs difficulty analysis and stores model config when enabled (TC-INIT-002)`
- **エラー**: TypeError: config.getWorkflowLanguage is not a function
- **スタックトレース**:
  ```
  at applyWorkflowLanguage (src/commands/init.ts:566:30)
  at handleInitCommand (src/commands/init.ts:438:3)
  at tests/unit/commands/init-auto-model-selection.test.ts:179:5
  ```

### `tests/integration/instruction-validator-integration.test.ts::auto-issue integration with InstructionValidator validates custom instruction before repository analysis`
- **エラー**: TypeError: config.getWorkflowLanguage is not a function
- **スタックトレース**:
  ```
  at resolveLanguage (src/commands/auto-issue.ts:583:30)
  at handleAutoIssueCommand (src/commands/auto-issue.ts:51:39)
  at tests/integration/instruction-validator-integration.test.ts:166:11
  ```

### `tests/integration/jenkins/jenkinsfile-auto-model-selection.test.ts::IT-002: AUTO_MODEL_SELECTION parameter definition should have AUTO_MODEL_SELECTION mentioned in comment header: jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
- **エラー**: expect(received).toMatch(/AUTO_MODEL_SELECTION/)
- **スタックトレース**:
  ```
  at tests/integration/jenkins/jenkinsfile-auto-model-selection.test.ts:78:25
  ```

### `tests/unit/helpers/metadata-io.test.ts::metadata-io backupMetadataFile 正常系: バックアップファイルが作成される`
- **エラー**: expect(jest.fn()).toHaveBeenCalledWith(StringContaining "[INFO] Metadata backup created:")
- **スタックトレース**:
  ```
  Received: "2025-12-25 13:31:44 [INFO ] Metadata backup created: /path/to/metadata.json.backup_20251225_133144"
  at tests/unit/helpers/metadata-io.test.ts:74:30
  ```

### `tests/unit/git/commit-manager.test.ts::CommitManager - Message Generation buildStepCommitMessage_正常系_ステップ完了時のメッセージ生成`
- **エラー**: TypeError: commitManager.buildStepCommitMessage is not a function
- **スタックトレース**:
  ```
  at tests/unit/git/commit-manager.test.ts:103:46
  ```

### `tests/unit/core/metadata-manager-rollback.test.ts::MetadataManager - Rollback機能 UC-MM-01: setRollbackContext() - 正常系`
- **エラー**: TypeError: fsMocked.existsSync.mockReturnValue is not a function
- **スタックトレース**:
  ```
  at tests/unit/core/metadata-manager-rollback.test.ts:147:25
  ```

### `tests/unit/pr-comment/execute-command.test.ts::handlePRCommentExecuteCommand - response plan flow applies response plan code changes and replies, updating metadata`
- **エラー**: EACCES: permission denied, mkdir '/repo'
- **スタックトレース**:
  ```
  at persistExecuteLog (src/commands/pr-comment/execute.ts:514:3)
  at handlePRCommentExecuteCommand (src/commands/pr-comment/execute.ts:174:7)
  at tests/unit/pr-comment/execute-command.test.ts:189:5
  ```

### `tests/integration/multi-repo-workflow.test.ts::IT-001: infrastructure-as-codeリポジトリのIssueでワークフロー実行 同一リポジトリでのinit→execute（後方互換性）`
- **エラー**: Author identity unknown (git user.name/user.email 未設定)
- **スタックトレース**:
  ```
  fatal: unable to auto-detect email address
  at simple-git error handler (node_modules/simple-git/src/lib/plugins/error-detection.plugin.ts:42:29)
  ```

### `tests/integration/base-phase-refactored.test.ts::IC-BP-06: BasePhase のコード量が削減されている（約40%削減）`
- **エラー**: expect(received).toBeLessThanOrEqual(500) (実際: 1012)
- **スタックトレース**:
  ```
  at tests/integration/base-phase-refactored.test.ts:238:23
  ```

### `tests/integration/finalize-command.test.ts::Integration: Finalize Command - エンドツーエンドフロー IT-01`
- **エラー**: TypeError: fs.existsSync.mockReturnValue is not a function
- **スタックトレース**:
  ```
  at tests/integration/finalize-command.test.ts:150:34
  ```
