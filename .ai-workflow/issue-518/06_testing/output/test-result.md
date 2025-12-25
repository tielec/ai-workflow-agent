# テスト実行結果

## テスト結果サマリー
- 総テスト数: 2281件
- 成功: 2004件
- 失敗: 257件
- 成功率: 87.9%

## 失敗したテストの詳細
### `tests/integration/workflow-init-cleanup.test.ts::ワークフロー初期化の統合テスト - Issue #16 3.1.1: ワークフロー初期化 → コミットメッセージ確認`
- **エラー**: expect(received).toBe(expected)（コミットメッセージに追加情報が含まれて想定と不一致）
- **スタックトレース**:
  ```
  Error: expect(received).toBe(expected)
      at tests/integration/workflow-init-cleanup.test.ts:81:27
  ```

### `tests/integration/workflow-init-cleanup.test.ts::Report Phaseクリーンアップの統合テスト - Issue #16 3.2.1: Report Phase完了 → ログクリーンアップ → コミットメッセージ確認`
- **エラー**: expect(received).not.toBeNull()（コミット結果が null）
- **スタックトレース**:
  ```
  Error: expect(received).not.toBeNull()
      at tests/integration/workflow-init-cleanup.test.ts:206:42
  ```

### `tests/integration/workflow-init-cleanup.test.ts::Evaluation Phaseクリーンアップの統合テスト - Issue #16 3.3.1: Evaluation Phase完了（デフォルト） → ログのみ削除`
- **エラー**: expect(received).not.toBeNull()（コミット結果が null）
- **スタックトレース**:
  ```
  Error: expect(received).not.toBeNull()
      at tests/integration/workflow-init-cleanup.test.ts:354:42
  ```

### `tests/integration/workflow-init-cleanup.test.ts::エンドツーエンドテスト - Issue #16 3.4.1: ワークフロー全体（初期化 → Phase 8 → クリーンアップ）`
- **エラー**: expect(received).toContain(expected)（最新コミットログに初期化メッセージが含まれない）
- **スタックトレース**:
  ```
  Error: expect(received).toContain(expected)
      at tests/integration/workflow-init-cleanup.test.ts:437:27
  ```

### `tests/unit/git/remote-manager.test.ts::RemoteManager - GitHub Credentials/setupGithubCredentials_境界値_SSH URLはスキップ`
- **エラー**: expect(jest.fn()).toHaveBeenCalledWith（ログ期待値がプレーン文字列だが実際はタイムスタンプ付き）
- **スタックトレース**:
  ```
  Expected: StringContaining "[INFO] Git remote URL is not HTTPS"
  Received: "2025-12-25 09:30:28 [INFO ] Git remote URL is not HTTPS, skipping token configuration: git@github.com:tielec/ai-workflow-agent.git"
      at tests/unit/git/remote-manager.test.ts:123:22
  ```

### `tests/integration/step-commit-push.test.ts::TC-I-005: プッシュ成功（正常系）- ローカルコミットのみ`
- **エラー**: expect(received).toBeTruthy()（push 成功判定が false）
- **スタックトレース**:
  ```
  Error: expect(received).toBeTruthy()
      at tests/integration/step-commit-push.test.ts:116:59
  ```

### `tests/integration/phases/fallback-mechanism.test.ts::Design Phase - Fallback Integration`
- **エラー**: TypeError: Cannot read properties of undefined (reading 'implementation_strategy')
- **スタックトレース**:
  ```
  TypeError: Cannot read properties of undefined (reading 'implementation_strategy')
      at src/phases/design.ts:49:21
      at tests/integration/phases/fallback-mechanism.test.ts:278:22
  ```

### `tests/unit/phases/base-phase-prompt-injection.test.ts::TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合`
- **エラー**: TypeError: mockFs.existsSync.mockReturnValue is not a function
- **スタックトレース**:
  ```
  TypeError: mockFs.existsSync.mockReturnValue is not a function
      at tests/unit/phases/base-phase-prompt-injection.test.ts:88:23
  ```

### `tests/unit/phases/core/review-cycle-manager.test.ts::1-1: 1回目のreviseで成功した場合、リトライせずに終了`
- **エラー**: TypeError: this.metadata.getRollbackContext is not a function
- **スタックトレース**:
  ```
  TypeError: this.metadata.getRollbackContext is not a function
      at src/phases/core/review-cycle-manager.ts:109:47
      at tests/unit/phases/core/review-cycle-manager.test.ts:82:5
  ```

### `tests/unit/core/metadata-manager-rollback.test.ts::UC-MM-01: setRollbackContext() - 正常系`
- **エラー**: TypeError: fsMocked.existsSync.mockReturnValue is not a function
- **スタックトレース**:
  ```
  TypeError: fsMocked.existsSync.mockReturnValue is not a function
      at tests/unit/core/metadata-manager-rollback.test.ts:147:25
  ```

### `tests/integration/preset-workflow.test.ts::ステータス遷移パターン/should allow transition: pending -> in_progress -> completed`
- **エラー**: Error: metadata.json not found: /test/.ai-workflow/issue-248/metadata.json
- **スタックトレース**:
  ```
  Error: metadata.json not found: /test/.ai-workflow/issue-248/metadata.json
      at src/core/workflow-state.ts:67:13
      at tests/integration/preset-workflow.test.ts:303:25
  ```

### `tests/integration/agent-client-execution.test.ts::Codexエージェント実行フロー`
- **エラー**: expect(jest.fn()).toHaveBeenCalled()（spawn/console.log が呼ばれていない）
- **スタックトレース**:
  ```
  Error: expect(jest.fn()).toHaveBeenCalled()
      at tests/integration/agent-client-execution.test.ts:79:29
  ```

### `tests/unit/helpers/metadata-io.test.ts::backupMetadataFile`
- **エラー**: expect(jest.fn()).toHaveBeenCalledWith（ログ期待値がプレーン文字列だが実際はタイムスタンプ付き）
- **スタックトレース**:
  ```
  Expected: StringContaining "[INFO] Metadata backup created:"
  Received: "2025-12-25 09:30:42 [INFO ] Metadata backup created: /path/to/metadata.json.backup_20251225_093042"
      at tests/unit/helpers/metadata-io.test.ts:74:30
  ```

### `tests/unit/core/issue-deduplicator.test.ts::TC-ID-010: filterDuplicates with threshold boundary`
- **エラー**: expect(jest.fn()).toHaveBeenCalled()（LLM 判定の mock が未呼び出し）
- **スタックトレース**:
  ```
  Expected number of calls: >= 1
  Received number of calls:    0
      at tests/unit/core/issue-deduplicator.test.ts:361:50
  ```

### `tests/integration/auto-issue-enhancement.test.ts::Scenario 3.2.1: End-to-end flow with dry-run mode`
- **エラー**: Error: Repository 'repo' not found locally.
- **スタックトレース**:
  ```
  Error: Repository 'repo' not found locally.
      at tests/integration/auto-issue-enhancement.test.ts:276:19
  ```

（上記以外にもログフォーマット変更、モック未定義、テストデータ不足などに起因する失敗が多数発生しています。）
