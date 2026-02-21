# テスト実行結果

## 環境準備サマリー
- インストールした言語: なし（python3 を導入しようとしたが `apt-get update` が権限不足で失敗）
- インストールしたパッケージ: `npm install`（依存パッケージ 435件）
- テストフレームワーク: Jest（`npm test`）
- 準備で発生した問題: `apt-get update` が `E: List directory /var/lib/apt/lists/partial is missing. - Acquire (13: Permission denied)` で失敗

## テスト結果サマリー
- 総テスト数: 3199件
- 成功: 3173件
- 失敗: 4件
- 成功率: 99.19%

## 条件分岐

**失敗時（失敗数が1件以上）**:

### `tests/unit/pr-comment/finalize-command.test.ts::handlePRCommentFinalizeCommand git flow › configures git user information before staging changes`
- **エラー**: `expect(jest.fn()).toHaveBeenCalledWith(...expected)`（`user.name` の呼び出しが追加引数付きで記録され、期待と不一致）
- **スタックトレース**:
  ```
  Expected: "user.name", "Configured Bot"
  Received
         1: "user.name", "Configured Bot", false, "local"
         2: "user.email", "configured@example.com", false, "local"

  249 |     await handlePRCommentFinalizeCommand(commandOptions);
  250 |
> 251 |     expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.name', 'Configured Bot');
      |                                    ^
  ```

### `tests/unit/pr-comment/finalize-command.test.ts::handlePRCommentFinalizeCommand git flow › falls back to default git user values when configuration is absent`
- **エラー**: `expect(jest.fn()).toHaveBeenCalledWith(...expected)`（デフォルト値が `AI Workflow Bot` ではなく `AI Workflow` に変更され、追加引数付きで記録）
- **スタックトレース**:
  ```
  Expected: "user.name", "AI Workflow Bot"
  Received
         1: "user.name", "AI Workflow", false, "local"
         2: "user.email", "ai-workflow@tielec.local", false, "local"

  271 |     await handlePRCommentFinalizeCommand(commandOptions);
  272 |
> 273 |     expect(simpleGitAddConfigMock).toHaveBeenCalledWith('user.name', 'AI Workflow Bot');
      |                                    ^
  ```

### `tests/integration/jenkins/ecr-build-job.test.ts::Integration: ECR build Jenkins pipeline (Issue #725) › UT-026: リグレッション検証（任意） › npm run validate を実行し正常終了する`
- **エラー**: `Command failed: npm run validate`（内部で `tests/unit/pr-comment/finalize-command.test.ts` が失敗）
- **スタックトレース**:
  ```
  Command failed: npm run validate
  (node:1460) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
  ```

### `tests/integration/jenkins/rewrite-issue-job.test.ts::Integration: rewrite-issue Jenkins pipeline (Issue #674) › IT-013/IT-014/IT-015: ビルド/検証/CLIヘルプの実行確認 › npm run validate を実行し正常終了する`
- **エラー**: `Command failed: npm run validate`（内部で `tests/unit/pr-comment/finalize-command.test.ts` が失敗）
- **スタックトレース**:
  ```
  Command failed: npm run validate
  (node:4855) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
  ```
