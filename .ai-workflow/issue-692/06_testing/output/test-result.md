# テスト実行結果

## テスト結果サマリー
- 総テスト数: 2919件
- 成功: 2870件
- 失敗: 26件
- 成功率: 98.32%

## 条件分岐
以下の形式で失敗したテストの詳細のみを記載します。

### `tests/unit/report-cleanup.test.ts::cleanupWorkflowLogs メソッドテスト（Issue #405） › 1.1: execute/review/reviseディレクトリを正しく削除する`
- **エラー**: Expected: false / Received: true
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/report-cleanup.test.ts:138:24)
  ```

### `tests/unit/core/metadata-manager-rollback.test.ts::MetadataManager - Rollback機能 › UC-MM-08: resetSubsequentPhases() - 後続フェーズのリセット › 指定フェーズより後のすべてのフェーズが正しくリセットされる`
- **エラー**: Expected配列に含まれない "test_preparation" が Received に含まれている
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/core/metadata-manager-rollback.test.ts:372:27)
  ```

### `tests/integration/jenkins/non-stored-password-params.test.ts::Integration: Sensitive Jenkins parameters use nonStoredPasswordParam (Issue #462) › IT-001: Job DSL seed job reapplication completes without errors › lists all AI Workflow jobs with valid DSL paths for the seed job execution`
- **エラー**: Expected length: 10 / Received length: 11
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/jenkins/non-stored-password-params.test.ts:196:30)
  ```

### `tests/integration/jenkins/auto-close-issue-job-config.test.ts::Integration: auto-close-issue job-config entry (Issue #678) › auto-close-issueジョブに必要なパラメータが定義されている`
- **エラー**: Expected: "followup" / Received: "all"
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/jenkins/auto-close-issue-job-config.test.ts:127:58)
  ```

### `tests/integration/jenkins/rewrite-issue-job.test.ts::Integration: rewrite-issue Jenkins pipeline (Issue #674) › IT-013/IT-014/IT-015: ビルド/検証/CLIヘルプの実行確認 › npm run build が成功し dist/index.js が生成される`
- **エラー**: Command failed: npm run build
- **スタックトレース**:
  ```
  at tests/integration/jenkins/rewrite-issue-job.test.ts
  ```

### `tests/integration/jenkins/rewrite-issue-job.test.ts::Integration: rewrite-issue Jenkins pipeline (Issue #674) › IT-013/IT-014/IT-015: ビルド/検証/CLIヘルプの実行確認 › npm run validate を実行し正常終了する`
- **エラー**: Command failed: npm run build
- **スタックトレース**:
  ```
  at tests/integration/jenkins/rewrite-issue-job.test.ts
  ```

### `tests/integration/jenkins/rewrite-issue-job.test.ts::Integration: rewrite-issue Jenkins pipeline (Issue #674) › IT-013/IT-014/IT-015: ビルド/検証/CLIヘルプの実行確認 › node dist/index.js rewrite-issue --help がヘルプを出力する`
- **エラー**: Command failed: npm run build
- **スタックトレース**:
  ```
  at tests/integration/jenkins/rewrite-issue-job.test.ts
  ```

### `tests/integration/prompt-language-switching.test.ts::Prompt language switching integration › all prompts include the required language instruction near the top`
- **エラー**: instructionIndex が -1（言語指示が見つからない）
- **スタックトレース**:
  ```
  at tests/integration/prompt-language-switching.test.ts:239:38
  ```

### `tests/integration/prompt-language-switching.test.ts::Prompt language switching integration › language instruction appears exactly once in each prompt file`
- **エラー**: Expected: 1 / Received: 0
- **スタックトレース**:
  ```
  at tests/integration/prompt-language-switching.test.ts:257:29
  ```

### `tests/integration/prompt-language-switching.test.ts::Prompt language switching integration › prompt inventory matches expected counts by language`
- **エラー**: Expected: 48 / Received: 51
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/prompt-language-switching.test.ts:263:45)
  ```

### `tests/unit/phases/test-preparation.test.ts::TestPreparationPhase › UT-PHASE-007: revise() がレビュー指摘を反映して更新される`
- **エラー**: Expected: true / Received: false
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/phases/test-preparation.test.ts:239:28)
  ```

### `tests/unit/git/commit-message-builder.test.ts::CommitMessageBuilder - createCommitMessage › createCommitMessage_正常系_全フェーズの番号計算`
- **エラー**: 期待文字列 "Phase 7 (test_preparation)" が含まれない（"Phase 0 (test_preparation)" になっている）
- **スタックトレース**:
  ```
  at tests/unit/git/commit-message-builder.test.ts:95:23
  ```

### `tests/unit/github-actions-workflows.test.ts::Project scripts for existing commands › TS-010 runs npm build and produces dist artifacts`
- **エラー**: Command failed: npm run build
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/github-actions-workflows.test.ts:185:20)
  ```

### `tests/integration/jenkins/auto-close-issue-jenkinsfile.test.ts::Integration: auto-close-issue Jenkinsfile / Job DSL (Issue #652) › IT-005/IT-006/IT-007/IT-008: CLIオプション組み立てに空文字ガードとドライラン既定値がある`
- **エラー**: dryRunFlag の正規表現が一致しない
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/integration/jenkins/auto-close-issue-jenkinsfile.test.ts:105:32)
  ```

### `tests/unit/utils/pr-body-checklist-utils.test.ts::updatePhaseChecklistInPrBody › updates phase checklist for the specified phase (parametrized)`
- **エラー**: 期待したチェックリスト文言が含まれない（Phase表示が想定外）
- **スタックトレース**:
  ```
  at tests/unit/utils/pr-body-checklist-utils.test.ts:70:23
  ```

### `tests/unit/utils/pr-body-checklist-utils.test.ts::updatePhaseChecklistInPrBody › updates only the targeted phase and preserves others`
- **エラー**: 期待した "- [ ] Phase 8: Report" が含まれない
- **スタックトレース**:
  ```
  at Object.<anonymous> (tests/unit/utils/pr-body-checklist-utils.test.ts:103:21)
  ```

### `tests/unit/jenkins/skip-phases.test.ts::skip-phases › 設定したスキップ対象のフェーズがJenkinsfileに含まれる`
- **エラー**: 期待したフェーズ文字列が Jenkinsfile に存在しない
- **スタックトレース**:
  ```
  at tests/unit/jenkins/skip-phases.test.ts:58:23
  ```

### `tests/unit/prompts/issue-207-prompt-simplification.test.ts::Issue #207: Prompt Simplification for Phase 4-8 › Issue #388: Documentation prompt length guidance › should keep required template placeholders and quality gates intact`
- **エラー**: Expected pattern: /品質ゲート（Phase 7: Documentation）/ が見つからない
- **スタックトレース**:
  ```
  at tests/unit/prompts/issue-207-prompt-simplification.test.ts
  ```

## 失敗原因の分析と対処方針
- `npm run build` 失敗が複数テストで発生しているため、ビルド依存関係または生成物（`dist/`）の更新差分を再確認する必要があります。
- フェーズ追加に伴う番号・一覧の期待値ズレが複数のテスト（チェックリスト・コミットメッセージ・スキップフェーズ）で発生しています。
- Jenkins関連の期待値（Job定義・Jenkinsfileのフラグ生成・既定値）が実装と整合していない可能性があります。
- プロンプト言語指示の挿入位置・出現回数・総数の前提が更新されていない可能性があります。

## 次フェーズへの推奨
失敗テストの修正と再実行を行ってからPhase 7（Documentation）へ進んでください。
