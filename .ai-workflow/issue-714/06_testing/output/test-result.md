# テスト実行結果

## 環境準備サマリー
- インストールした言語: 追加インストールなし（Node.js/NPMは既存）
- インストールしたパッケージ: `npm install`（435パッケージ追加）
- テストフレームワーク: Jest（`npx jest`）
- 準備で発生した問題: なし（`npm install` 時に deprecated 警告と脆弱性警告は表示）

## テスト結果サマリー
- 総テスト数: 28件
- 成功: 25件
- 失敗: 3件
- 成功率: 89.29%

## 失敗詳細

### `tests/integration/jenkins/split-issue-job.test.ts::UT-025: npm run validate を実行し正常終了する`
- **エラー**: `npm run validate` が非ゼロ終了
- **スタックトレース**:
  ```
  Command failed: npm run validate
  (node:717) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
  ...（validate 実行ログ多数のため省略）...
  ```

### `tests/integration/jenkins/split-issue-job.test.ts::UT-027: validate_dsl.sh に split-issue の Jenkinsfile パスが追加されている`
- **エラー**: `validate_dsl.sh` に `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` が含まれていない
- **スタックトレース**:
  ```
  expect(received).toContain(expected)
  Expected substring: "jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile"
  ```

### `tests/integration/jenkins/split-issue-job.test.ts::UT-028: validate_dsl.sh に split-issue の scriptPath 整合性チェックが追加されている`
- **エラー**: `validate_dsl.sh` に `ai_workflow_split_issue_job.groovy has correct scriptPath` が含まれていない
- **スタックトレース**:
  ```
  expect(received).toContain(expected)
  Expected substring: "ai_workflow_split_issue_job.groovy has correct scriptPath"
  ```

## 次フェーズへの推奨
- UT-027/UT-028 は `jenkins/jobs/dsl/ai-workflow/validate_dsl.sh` に split-issue 用の検証追加が必要です。
- UT-025 は `npm run validate` の失敗原因を切り分けた上で再実行してください。
