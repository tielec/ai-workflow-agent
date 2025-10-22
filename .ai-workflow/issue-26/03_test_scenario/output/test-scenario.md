# テストシナリオ - Issue #26

**Issue番号**: #26
**タイトル**: [REFACTOR] 残り4ファイルの軽量リファクタリング
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/26
**作成日**: 2025-01-20
**優先度**: 低

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**

**判断根拠**（Phase 2から引用）:

1. **UNIT_ONLY が不十分な理由**:
   - エージェントクライアント: JSON/SDKイベント処理の実際の動作確認が必要
   - メタデータ管理: ファイルI/O操作の統合的な動作確認が必要
   - 依存関係検証: プリセット実行時の実際の動作確認が必要

2. **BDD が不要な理由**:
   - エンドユーザー向け機能ではない（内部モジュール）
   - ユーザーストーリーよりも技術的な動作保証が重要
   - 既存テストがBDDスタイルではない（Issue #23, #24, #25で確立されたテストパターンとの整合性）

3. **UNIT + INTEGRATION が最適な理由**:
   - **UNIT**: 各ヘルパー関数、共通ロジックの単体動作を保証
   - **INTEGRATION**: エージェント実行、メタデータI/O、依存関係検証の統合動作を保証

### 1.2 テスト対象の範囲

**新規ヘルパーモジュール（6ファイル）**:
- `src/core/helpers/agent-event-parser.ts`
- `src/core/helpers/log-formatter.ts`
- `src/core/helpers/env-setup.ts`
- `src/core/helpers/metadata-io.ts`
- `src/core/helpers/validation.ts`
- `src/core/helpers/dependency-messages.ts`

**リファクタリング対象コアファイル（4ファイル）**:
- `src/core/codex-agent-client.ts`
- `src/core/claude-agent-client.ts`
- `src/core/metadata-manager.ts`
- `src/core/phase-dependencies.ts`

### 1.3 テストの目的

1. **後方互換性の保証**: リファクタリング後も既存の呼び出し元が無変更で動作する
2. **新規ヘルパーモジュールの動作保証**: 各ヘルパー関数が正しく動作する（カバレッジ85%以上）
3. **統合動作の保証**: エージェント実行、メタデータI/O、依存関係検証が正しく統合される
4. **パフォーマンス維持**: リファクタリング前後で性能退行がない（±5%以内）

### 1.4 カバレッジ目標

- **全体カバレッジ**: 80%以上（既存レベル維持）
- **新規ヘルパーモジュール**: 85%以上
- **既存コアファイル**: 既存カバレッジレベル維持

---

## 2. Unitテストシナリオ

### 2.1 agent-event-parser.ts のユニットテスト

#### 2.1.1 parseCodexEvent() - 正常系

**テストケース名**: `parseCodexEvent_正常系_有効なJSON`

- **目的**: 有効なJSONイベント文字列が正しくパースされることを検証
- **前提条件**: なし
- **入力**:
  ```json
  {
    "type": "assistant",
    "message": {
      "role": "assistant",
      "content": [{"type": "text", "text": "Hello"}]
    }
  }
  ```
- **期待結果**:
  - CodexEventオブジェクトが返される
  - `payload.type === 'assistant'`
  - `payload.message.role === 'assistant'`
- **テストデータ**: 上記JSON文字列

#### 2.1.2 parseCodexEvent() - 異常系

**テストケース名**: `parseCodexEvent_異常系_不正なJSON`

- **目的**: 不正なJSONイベント文字列がnullを返すことを検証
- **前提条件**: なし
- **入力**: `"{ invalid json }"`
- **期待結果**: `null`が返される（例外はスローしない）
- **テストデータ**: 不正なJSON文字列

**テストケース名**: `parseCodexEvent_異常系_空文字列`

- **目的**: 空文字列がnullを返すことを検証
- **前提条件**: なし
- **入力**: `""`
- **期待結果**: `null`が返される
- **テストデータ**: 空文字列

#### 2.1.3 determineCodexEventType() - 正常系

**テストケース名**: `determineCodexEventType_正常系_assistant`

- **目的**: assistantイベントタイプが正しく判定されることを検証
- **前提条件**: なし
- **入力**: `{ type: 'assistant' }`
- **期待結果**: `'assistant'`が返される
- **テストデータ**: 上記オブジェクト

**テストケース名**: `determineCodexEventType_正常系_result`

- **目的**: resultイベントタイプが正しく判定されることを検証
- **前提条件**: なし
- **入力**: `{ type: 'result', result: 'success' }`
- **期待結果**: `'result'`が返される
- **テストデータ**: 上記オブジェクト

**テストケース名**: `determineCodexEventType_正常系_message.role`

- **目的**: typeがなくてもmessage.roleから判定されることを検証
- **前提条件**: なし
- **入力**: `{ message: { role: 'assistant' } }`
- **期待結果**: `'assistant'`が返される
- **テストデータ**: 上記オブジェクト

**テストケース名**: `determineCodexEventType_正常系_unknown`

- **目的**: typeもmessage.roleもない場合、unknownが返されることを検証
- **前提条件**: なし
- **入力**: `{}`
- **期待結果**: `'unknown'`が返される
- **テストデータ**: 空オブジェクト

#### 2.1.4 parseClaudeEvent() - 正常系

**テストケース名**: `parseClaudeEvent_正常系_SDKメッセージ`

- **目的**: Claude SDKメッセージが正しくパースされることを検証
- **前提条件**: なし
- **入力**: `{ type: 'assistant', content: [...] }` (SDKMessage型)
- **期待結果**: ClaudeEventオブジェクトが返される（現状はSDKメッセージそのまま）
- **テストデータ**: モックSDKメッセージ

#### 2.1.5 determineClaudeEventType() - 正常系

**テストケース名**: `determineClaudeEventType_正常系_assistant`

- **目的**: assistantメッセージタイプが正しく判定されることを検証
- **前提条件**: なし
- **入力**: `{ type: 'assistant' }`
- **期待結果**: `'assistant'`が返される
- **テストデータ**: 上記オブジェクト

**テストケース名**: `determineClaudeEventType_正常系_stream_event`

- **目的**: stream_eventメッセージタイプが正しく判定されることを検証
- **前提条件**: なし
- **入力**: `{ type: 'stream_event' }`
- **期待結果**: `'stream_event'`が返される
- **テストデータ**: 上記オブジェクト

---

### 2.2 log-formatter.ts のユニットテスト

#### 2.2.1 formatCodexLog() - 正常系

**テストケース名**: `formatCodexLog_正常系_thinking`

- **目的**: thinkingイベントが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**:
  - `eventType = 'assistant'`
  - `payload = { message: { content: [{ type: 'text', text: 'Thinking...' }] } }`
- **期待結果**: `[CODEX THINKING] Thinking...`形式の文字列が返される
- **テストデータ**: 上記payload

**テストケース名**: `formatCodexLog_正常系_action_with_tool_use`

- **目的**: tool_useイベントが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**:
  - `eventType = 'assistant'`
  - `payload = { message: { content: [{ type: 'tool_use', name: 'bash', input: 'ls -la' }] } }`
- **期待結果**: `[CODEX ACTION] bash(...)`形式の文字列が返される（inputは切り詰め）
- **テストデータ**: 上記payload

**テストケース名**: `formatCodexLog_正常系_result`

- **目的**: resultイベントが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**:
  - `eventType = 'result'`
  - `payload = { result: 'success', status: 'completed' }`
- **期待結果**: `[CODEX RESULT] success (status: completed)`形式の文字列が返される
- **テストデータ**: 上記payload

**テストケース名**: `formatCodexLog_正常系_system`

- **目的**: systemイベントが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**:
  - `eventType = 'system'`
  - `payload = { message: 'System message' }`
- **期待結果**: `[CODEX SYSTEM] System message`形式の文字列が返される
- **テストデータ**: 上記payload

#### 2.2.2 formatClaudeLog() - 正常系

**テストケース名**: `formatClaudeLog_正常系_thinking`

- **目的**: assistantメッセージ（thinking）が正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**: `{ type: 'assistant', content: [{ type: 'text', text: 'Thinking...' }] }`
- **期待結果**: `[AGENT THINKING] Thinking...`形式の文字列が返される
- **テストデータ**: 上記メッセージ

**テストケース名**: `formatClaudeLog_正常系_action`

- **目的**: tool_useメッセージが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**: `{ type: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: {...} }] }`
- **期待結果**: `[AGENT ACTION] Read(...)`形式の文字列が返される
- **テストデータ**: 上記メッセージ

**テストケース名**: `formatClaudeLog_正常系_stream_event`

- **目力**: stream_eventメッセージが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**: `{ type: 'stream_event', ... }`
- **期待結果**: `[AGENT ACTION] ...`形式の文字列が返される
- **テストデータ**: モックストリームイベント

#### 2.2.3 truncateInput() - 正常系・境界値

**テストケース名**: `truncateInput_正常系_短い文字列`

- **目的**: 500文字以下の文字列がそのまま返されることを検証
- **前提条件**: なし
- **入力**: `"Hello World"` (11文字)
- **期待結果**: `"Hello World"`がそのまま返される
- **テストデータ**: 上記文字列

**テストケース名**: `truncateInput_境界値_ちょうど500文字`

- **目的**: ちょうど500文字の文字列がそのまま返されることを検証
- **前提条件**: なし
- **入力**: 500文字の文字列
- **期待結果**: 入力文字列がそのまま返される
- **テストデータ**: 'a'.repeat(500)

**テストケース名**: `truncateInput_正常系_501文字以上`

- **目的**: 501文字以上の文字列が切り詰められることを検証
- **前提条件**: なし
- **入力**: 600文字の文字列
- **期待結果**: 最初の500文字 + `'…'`が返される
- **テストデータ**: 'a'.repeat(600)

**テストケース名**: `truncateInput_正常系_カスタムmaxLength`

- **目的**: カスタムmaxLengthパラメータが正しく動作することを検証
- **前提条件**: なし
- **入力**: `"Hello World"`, `maxLength = 5`
- **期待結果**: `"Hello…"`が返される
- **テストデータ**: 上記

---

### 2.3 env-setup.ts のユニットテスト

#### 2.3.1 setupCodexEnvironment() - 正常系

**テストケース名**: `setupCodexEnvironment_正常系_CODEX_API_KEY変換`

- **目的**: CODEX_API_KEYがOPENAI_API_KEYに変換されることを検証
- **前提条件**: なし
- **入力**: `{ CODEX_API_KEY: 'test-key' }`
- **期待結果**:
  - `OPENAI_API_KEY === 'test-key'`
  - `CODEX_API_KEY`は保持される
- **テストデータ**: 上記環境変数オブジェクト

**テストケース名**: `setupCodexEnvironment_正常系_GITHUB_TOKEN変換`

- **目的**: GITHUB_TOKENがGH_TOKENに変換されることを検証
- **前提条件**: なし
- **入力**: `{ GITHUB_TOKEN: 'ghp_test' }`
- **期待結果**:
  - `GH_TOKEN === 'ghp_test'`
  - `GITHUB_TOKEN`は保持される
- **テストデータ**: 上記環境変数オブジェクト

**テストケース名**: `setupCodexEnvironment_正常系_CODEX_AUTH_FILE削除`

- **目的**: CODEX_AUTH_FILEが削除されることを検証
- **前提条件**: なし
- **入力**: `{ CODEX_AUTH_FILE: '/path/to/auth.json', OTHER_VAR: 'value' }`
- **期待結果**:
  - `CODEX_AUTH_FILE`が存在しない
  - `OTHER_VAR`は保持される
- **テストデータ**: 上記環境変数オブジェクト

**テストケース名**: `setupCodexEnvironment_正常系_イミュータブル`

- **目的**: 元の環境変数オブジェクトが変更されないことを検証（純粋関数）
- **前提条件**: なし
- **入力**: `baseEnv = { CODEX_API_KEY: 'test-key' }`
- **期待結果**:
  - 返されたオブジェクトは新しいオブジェクト
  - `baseEnv`は変更されていない
- **テストデータ**: 上記baseEnv

#### 2.3.2 setupGitHubEnvironment() - 正常系

**テストケース名**: `setupGitHubEnvironment_正常系_GITHUB_TOKEN変換`

- **目的**: GITHUB_TOKENがGH_TOKENに変換されることを検証
- **前提条件**: なし
- **入力**: `{ GITHUB_TOKEN: 'ghp_test' }`
- **期待結果**:
  - `GH_TOKEN === 'ghp_test'`
  - `GITHUB_TOKEN`は保持される
- **テストデータ**: 上記環境変数オブジェクト

**テストケース名**: `setupGitHubEnvironment_正常系_イミュータブル`

- **目的**: 元の環境変数オブジェクトが変更されないことを検証（純粋関数）
- **前提条件**: なし
- **入力**: `baseEnv = { GITHUB_TOKEN: 'ghp_test' }`
- **期待結果**:
  - 返されたオブジェクトは新しいオブジェクト
  - `baseEnv`は変更されていない
- **テストデータ**: 上記baseEnv

---

### 2.4 metadata-io.ts のユニットテスト

#### 2.4.1 formatTimestampForFilename() - 正常系

**テストケース名**: `formatTimestampForFilename_正常系_デフォルト（現在時刻）`

- **目的**: デフォルトで現在時刻がYYYYMMDD_HHMMSS形式になることを検証
- **前提条件**: なし
- **入力**: なし（デフォルト）
- **期待結果**: `/^\d{8}_\d{6}$/`パターンにマッチする文字列
- **テストデータ**: なし

**テストケース名**: `formatTimestampForFilename_正常系_カスタムDate`

- **目的**: カスタムDateオブジェクトが正しくフォーマットされることを検証
- **前提条件**: なし
- **入力**: `new Date('2025-01-20T15:30:45')`
- **期待結果**: `'20250120_153045'`
- **テストデータ**: 上記Date

**テストケース名**: `formatTimestampForFilename_正常系_1桁パディング`

- **目的**: 1桁の月・日・時・分・秒が2桁にパディングされることを検証
- **前提条件**: なし
- **入力**: `new Date('2025-01-05T09:08:07')`
- **期待結果**: `'20250105_090807'`
- **テストデータ**: 上記Date

#### 2.4.2 backupMetadataFile() - 正常系

**テストケース名**: `backupMetadataFile_正常系_バックアップ作成`

- **目的**: メタデータファイルが正しくバックアップされることを検証
- **前提条件**:
  - テスト用metadata.jsonファイルが存在する
  - fs-extraがモック化されている
- **入力**: `/path/to/metadata.json`
- **期待結果**:
  - `fs.copyFileSync()`が呼ばれる
  - バックアップファイルパス（`metadata.json.backup_{timestamp}`）が返される
  - コンソールログ出力（`[INFO] metadata.json backup created: ...`）
- **テストデータ**: モックファイルパス

#### 2.4.3 backupMetadataFile() - 異常系

**テストケース名**: `backupMetadataFile_異常系_ファイル不在`

- **目的**: ファイルが存在しない場合、例外がスローされることを検証
- **前提条件**: ファイルが存在しない
- **入力**: `/path/to/nonexistent.json`
- **期待結果**: `fs.copyFileSync()`の例外がスローされる
- **テストデータ**: 存在しないパス

#### 2.4.4 removeWorkflowDirectory() - 正常系

**テストケース名**: `removeWorkflowDirectory_正常系_ディレクトリ削除`

- **目的**: ワークフローディレクトリが正しく削除されることを検証
- **前提条件**:
  - テスト用ディレクトリが存在する
  - fs-extraがモック化されている
- **入力**: `/path/to/.ai-workflow/issue-26`
- **期待結果**:
  - `fs.existsSync()`が呼ばれる
  - `fs.removeSync()`が呼ばれる
  - コンソールログ出力（`[INFO] Removing workflow directory: ...`）
- **テストデータ**: モックディレクトリパス

**テストケース名**: `removeWorkflowDirectory_正常系_ディレクトリ不在`

- **目的**: ディレクトリが存在しない場合、削除処理がスキップされることを検証
- **前提条件**: ディレクトリが存在しない
- **入力**: `/path/to/.ai-workflow/issue-99`
- **期待結果**:
  - `fs.existsSync()`が呼ばれる
  - `fs.removeSync()`は呼ばれない
- **テストデータ**: 存在しないパス

#### 2.4.5 getPhaseOutputFilePath() - 正常系

**テストケース名**: `getPhaseOutputFilePath_正常系_planning`

- **目的**: planningフェーズの出力ファイルパスが正しく取得されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'planning'`
  - `workflowDir = '/path/to/.ai-workflow/issue-26'`
- **期待結果**: `/path/to/.ai-workflow/issue-26/00_planning/output/planning.md`
- **テストデータ**: 上記

**テストケース名**: `getPhaseOutputFilePath_正常系_requirements`

- **目的**: requirementsフェーズの出力ファイルパスが正しく取得されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'requirements'`
  - `workflowDir = '/path/to/.ai-workflow/issue-26'`
- **期待結果**: `/path/to/.ai-workflow/issue-26/01_requirements/output/requirements.md`
- **テストデータ**: 上記

**テストケース名**: `getPhaseOutputFilePath_異常系_無効なフェーズ名`

- **目的**: 無効なフェーズ名の場合、nullが返されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'invalid'`
  - `workflowDir = '/path/to/.ai-workflow/issue-26'`
- **期待結果**: `null`
- **テストデータ**: 上記

---

### 2.5 validation.ts のユニットテスト

#### 2.5.1 validatePhaseName() - 正常系

**テストケース名**: `validatePhaseName_正常系_有効なフェーズ名`

- **目的**: 有効なフェーズ名に対してtrueが返されることを検証
- **前提条件**: なし
- **入力**: `'planning'`, `'requirements'`, `'design'`, 等
- **期待結果**: `true`
- **テストデータ**: PHASE_DEPENDENCIESのキー

**テストケース名**: `validatePhaseName_異常系_無効なフェーズ名`

- **目的**: 無効なフェーズ名に対してfalseが返されることを検証
- **前提条件**: なし
- **入力**: `'invalid'`, `'foo'`, `''`
- **期待結果**: `false`
- **テストデータ**: 上記

#### 2.5.2 validateStepName() - 正常系

**テストケース名**: `validateStepName_正常系_有効なステップ名`

- **目的**: 有効なステップ名に対してtrueが返されることを検証
- **前提条件**: なし
- **入力**: `'execute'`, `'review'`, `'revise'`
- **期待結果**: `true`
- **テストデータ**: 上記

**テストケース名**: `validateStepName_異常系_無効なステップ名`

- **目的**: 無効なステップ名に対してfalseが返されることを検証
- **前提条件**: なし
- **入力**: `'invalid'`, `'foo'`, `''`
- **期待結果**: `false`
- **テストデータ**: 上記

#### 2.5.3 validateIssueNumber() - 正常系・異常系

**テストケース名**: `validateIssueNumber_正常系_有効な数値`

- **目的**: 1以上の整数に対してtrueが返されることを検証
- **前提条件**: なし
- **入力**: `1`, `26`, `1000`
- **期待結果**: `true`
- **テストデータ**: 上記

**テストケース名**: `validateIssueNumber_正常系_有効な文字列`

- **目的**: '1'以上の整数文字列に対してtrueが返されることを検証
- **前提条件**: なし
- **入力**: `'1'`, `'26'`, `'1000'`
- **期待結果**: `true`
- **テストデータ**: 上記

**テストケース名**: `validateIssueNumber_異常系_0以下`

- **目的**: 0以下の数値に対してfalseが返されることを検証
- **前提条件**: なし
- **入力**: `0`, `-1`, `-100`
- **期待結果**: `false`
- **テストデータ**: 上記

**テストケース名**: `validateIssueNumber_異常系_不正な文字列`

- **目的**: 不正な文字列に対してfalseが返されることを検証
- **前提条件**: なし
- **入力**: `'abc'`, `''`, `'0'`
- **期待結果**: `false`
- **テストデータ**: 上記

---

### 2.6 dependency-messages.ts のユニットテスト

#### 2.6.1 buildErrorMessage() - 正常系

**テストケース名**: `buildErrorMessage_正常系_未完了依存フェーズあり`

- **目的**: 未完了依存フェーズがある場合のエラーメッセージが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'implementation'`
  - `missingDependencies = ['requirements', 'design']`
  - `missingFiles = []`
- **期待結果**:
  ```
  [ERROR] Phase "implementation" requires the following phases to be completed:
  ✗ requirements - NOT COMPLETED
  ✗ design - NOT COMPLETED

  Please run:
    --phase all
  or
    --ignore-dependencies
  ```
- **テストデータ**: 上記

**テストケース名**: `buildErrorMessage_正常系_ファイル不在あり`

- **目的**: ファイル不在がある場合のエラーメッセージが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'implementation'`
  - `missingDependencies = []`
  - `missingFiles = [{ phase: 'requirements', file: '/path/to/requirements.md' }]`
- **期待結果**:
  ```
  [ERROR] Phase "implementation" requires the following phases to be completed:
  ✗ requirements - /path/to/requirements.md NOT FOUND

  Please run:
    --phase all
  or
    --ignore-dependencies
  ```
- **テストデータ**: 上記

**テストケース名**: `buildErrorMessage_正常系_未完了とファイル不在の両方`

- **目的**: 未完了依存とファイル不在の両方がある場合のエラーメッセージが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'implementation'`
  - `missingDependencies = ['requirements']`
  - `missingFiles = [{ phase: 'design', file: '/path/to/design.md' }]`
- **期待結果**: 両方のエラーが含まれるメッセージ
- **テストデータ**: 上記

#### 2.6.2 buildWarningMessage() - 正常系

**テストケース名**: `buildWarningMessage_正常系_未完了依存フェーズあり`

- **目的**: 未完了依存フェーズがある場合の警告メッセージが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'implementation'`
  - `missingDependencies = ['requirements', 'design']`
  - `missingFiles = []`
- **期待結果**:
  ```
  [WARNING] Phase "implementation" has unmet dependencies, but proceeding anyway...
  ⚠ requirements - NOT COMPLETED
  ⚠ design - NOT COMPLETED
  ```
- **テストデータ**: 上記

**テストケース名**: `buildWarningMessage_正常系_ファイル不在あり`

- **目的**: ファイル不在がある場合の警告メッセージが正しく生成されることを検証
- **前提条件**: なし
- **入力**:
  - `phaseName = 'implementation'`
  - `missingDependencies = []`
  - `missingFiles = [{ phase: 'requirements', file: '/path/to/requirements.md' }]`
- **期待結果**:
  ```
  [WARNING] Phase "implementation" has unmet dependencies, but proceeding anyway...
  ⚠ requirements - /path/to/requirements.md NOT FOUND
  ```
- **テストデータ**: 上記

---

### 2.7 codex-agent-client.ts のユニットテスト

#### 2.7.1 executeTask() - 正常系

**テストケース名**: `executeTask_正常系_Codex実行成功`

- **目的**: Codex CLIが正常終了した場合、出力が返されることを検証
- **前提条件**:
  - Codex CLIがインストールされている（モック）
  - `setupCodexEnvironment()`が正しく動作する
- **入力**:
  ```typescript
  {
    prompt: 'Hello, Codex!',
    workingDir: '/path/to/workspace',
    taskName: 'test-task'
  }
  ```
- **期待結果**:
  - `setupCodexEnvironment()`が呼ばれる
  - Codex CLIプロセスが起動される
  - 出力配列が返される
- **テストデータ**: モックCodex出力

#### 2.7.2 executeTask() - 異常系

**テストケース名**: `executeTask_異常系_Codex未インストール`

- **目的**: Codex CLIが未インストールの場合、CODEX_CLI_NOT_FOUNDエラーがスローされることを検証
- **前提条件**: Codex CLIが存在しない
- **入力**: 上記と同じ
- **期待結果**: `Error('CODEX_CLI_NOT_FOUND')`がスローされる
- **テストデータ**: なし

#### 2.7.3 executeTaskFromFile() - 正常系

**テストケース名**: `executeTaskFromFile_正常系_テンプレート変数埋め込み`

- **目的**: プロンプトファイルからテンプレート変数が正しく埋め込まれることを検証
- **前提条件**:
  - プロンプトファイルが存在する
  - `fillTemplate()`が正しく動作する
- **入力**:
  ```typescript
  {
    promptPath: '/path/to/prompt.md',
    workingDir: '/path/to/workspace',
    taskName: 'test-task',
    variables: { issueNumber: '26' }
  }
  ```
- **期待結果**:
  - プロンプトファイルが読み込まれる
  - テンプレート変数が埋め込まれる
  - `executeTask()`が呼ばれる
- **テストデータ**: モックプロンプトファイル

#### 2.7.4 logEvent() - 正常系（リファクタリング後の動作確認）

**テストケース名**: `logEvent_正常系_ヘルパー関数使用`

- **目的**: リファクタリング後も`logEvent()`が正しく動作することを検証
- **前提条件**:
  - `parseCodexEvent()`が正しく動作する
  - `formatCodexLog()`が正しく動作する
- **入力**:
  ```json
  {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "Hello"}]}}
  ```
- **期待結果**:
  - `parseCodexEvent()`が呼ばれる
  - `formatCodexLog()`が呼ばれる
  - `console.log()`が呼ばれる
- **テストデータ**: 上記JSON文字列

---

### 2.8 claude-agent-client.ts のユニットテスト

#### 2.8.1 executeTask() - 正常系

**テストケース名**: `executeTask_正常系_Claude実行成功`

- **目的**: Claude Agent SDKが正常終了した場合、出力が返されることを検証
- **前提条件**:
  - Claude Agent SDKがモック化されている
  - `ensureAuthToken()`が正しく動作する
- **入力**:
  ```typescript
  {
    prompt: 'Hello, Claude!',
    workingDir: '/path/to/workspace',
    taskName: 'test-task'
  }
  ```
- **期待結果**:
  - `ensureAuthToken()`が呼ばれる
  - Claude Agent SDKプロセスが起動される
  - 出力配列が返される
- **テストデータ**: モックClaude出力

#### 2.8.2 executeTask() - 異常系

**テストケース名**: `executeTask_異常系_認証エラー`

- **目的**: 認証トークンが取得できない場合、エラーがスローされることを検証
- **前提条件**:
  - `credentials.json`が存在しない
  - `CLAUDE_CODE_OAUTH_TOKEN`環境変数が未設定
- **入力**: 上記と同じ
- **期待結果**: 認証エラーがスローされる
- **テストデータ**: なし

#### 2.8.3 ensureAuthToken() - 正常系

**テストケース名**: `ensureAuthToken_正常系_credentials.jsonから取得`

- **目的**: credentials.jsonからトークンが正しく取得されることを検証
- **前提条件**:
  - `credentials.json`が存在する
  - `extractToken()`が正しく動作する
- **入力**: なし
- **期待結果**:
  - `readTokenFromCredentials()`が呼ばれる
  - `extractToken()`が呼ばれる
  - トークン文字列が返される
- **テストデータ**: モックcredentials.json

**テストケース名**: `ensureAuthToken_正常系_環境変数から取得`

- **目的**: 環境変数`CLAUDE_CODE_OAUTH_TOKEN`からトークンが取得されることを検証
- **前提条件**:
  - `credentials.json`が存在しない
  - `CLAUDE_CODE_OAUTH_TOKEN`環境変数が設定されている
- **入力**: なし
- **期待結果**:
  - 環境変数の値が返される
- **テストデータ**: モック環境変数

#### 2.8.4 extractToken() - 正常系

**テストケース名**: `extractToken_正常系_トークン抽出成功`

- **目的**: credentials.jsonから再帰的にトークンが抽出されることを検証
- **前提条件**: なし
- **入力**:
  ```json
  {
    "oauth": {
      "access_token": "test-oauth-token"
    }
  }
  ```
- **期待結果**: `'test-oauth-token'`が返される
- **テストデータ**: 上記JSON

**テストケース名**: `extractToken_正常系_ネストされたトークン`

- **目的**: ネストされたオブジェクトからトークンが抽出されることを検証
- **前提条件**: なし
- **入力**:
  ```json
  {
    "level1": {
      "level2": {
        "access_token": "nested-token"
      }
    }
  }
  ```
- **期待結果**: `'nested-token'`が返される
- **テストデータ**: 上記JSON

**テストケース名**: `extractToken_異常系_トークン不在`

- **目的**: トークンが見つからない場合、nullが返されることを検証
- **前提条件**: なし
- **入力**: `{ "other": "value" }`
- **期待結果**: `null`
- **テストデータ**: 上記JSON

#### 2.8.5 logMessage() - 正常系（リファクタリング後の動作確認）

**テストケース名**: `logMessage_正常系_ヘルパー関数使用`

- **目的**: リファクタリング後も`logMessage()`が正しく動作することを検証
- **前提条件**:
  - `parseClaudeEvent()`が正しく動作する
  - `formatClaudeLog()`が正しく動作する
- **入力**: `{ type: 'assistant', content: [...] }`
- **期待結果**:
  - `parseClaudeEvent()`が呼ばれる
  - `formatClaudeLog()`が呼ばれる
  - `console.log()`が呼ばれる
- **テストデータ**: モックSDKメッセージ

---

### 2.9 metadata-manager.ts のユニットテスト

#### 2.9.1 updatePhaseStatus() - 正常系

**テストケース名**: `updatePhaseStatus_正常系_ステータス更新`

- **目的**: フェーズステータスが正しく更新されることを検証
- **前提条件**: メタデータファイルが存在する
- **入力**:
  ```typescript
  {
    phaseName: 'planning',
    status: 'completed',
    outputFiles: ['/path/to/planning.md']
  }
  ```
- **期待結果**:
  - WorkflowStateのphaseStatusesが更新される
  - `save()`が呼ばれる
- **テストデータ**: モックメタデータ

#### 2.9.2 addCost() - 正常系

**テストケース名**: `addCost_正常系_コスト集計`

- **目的**: コストが正しく集計されることを検証
- **前提条件**: メタデータファイルが存在する
- **入力**:
  ```typescript
  {
    provider: 'codex',
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.05
  }
  ```
- **期待結果**:
  - WorkflowStateのtotalCostが更新される
  - `save()`が呼ばれる
- **テストデータ**: 上記

#### 2.9.3 backupMetadata() - 正常系（リファクタリング後の動作確認）

**テストケース名**: `backupMetadata_正常系_ヘルパー関数使用`

- **目的**: リファクタリング後も`backupMetadata()`が正しく動作することを検証
- **前提条件**:
  - メタデータファイルが存在する
  - `backupMetadataFile()`が正しく動作する
- **入力**: なし
- **期待結果**:
  - `backupMetadataFile()`が呼ばれる
  - バックアップファイルパスが返される
- **テストデータ**: モックメタデータパス

#### 2.9.4 clear() - 正常系（リファクタリング後の動作確認）

**テストケース名**: `clear_正常系_ヘルパー関数使用`

- **目的**: リファクタリング後も`clear()`が正しく動作することを検証
- **前提条件**:
  - メタデータファイルが存在する
  - ワークフローディレクトリが存在する
  - `removeWorkflowDirectory()`が正しく動作する
- **入力**: なし
- **期待結果**:
  - メタデータファイルが削除される
  - `removeWorkflowDirectory()`が呼ばれる
- **テストデータ**: モックメタデータパス

---

### 2.10 phase-dependencies.ts のユニットテスト

#### 2.10.1 validatePhaseDependencies() - 正常系

**テストケース名**: `validatePhaseDependencies_正常系_依存関係充足`

- **目的**: すべての依存関係が充足されている場合、validがtrueになることを検証
- **前提条件**:
  - 依存フェーズがすべて完了している
  - 出力ファイルがすべて存在する
- **入力**:
  - `phaseName = 'implementation'`
  - `metadataManager`（モック）
- **期待結果**:
  - `{ valid: true, missingDependencies: [], missingFiles: [] }`
- **テストデータ**: モックMetadataManager

**テストケース名**: `validatePhaseDependencies_異常系_未完了依存あり`

- **目的**: 未完了依存がある場合、validがfalseになることを検証
- **前提条件**:
  - 依存フェーズの一部が未完了
- **入力**:
  - `phaseName = 'implementation'`
  - `metadataManager`（モック）
- **期待結果**:
  - `{ valid: false, missingDependencies: ['requirements'], missingFiles: [] }`
  - `buildErrorMessage()`が呼ばれる（内部的に）
- **テストデータ**: モックMetadataManager

**テストケース名**: `validatePhaseDependencies_異常系_ファイル不在`

- **目的**: ファイル不在がある場合、validがfalseになることを検証
- **前提条件**:
  - 依存フェーズは完了しているが、出力ファイルが存在しない
- **入力**:
  - `phaseName = 'implementation'`
  - `metadataManager`（モック）
- **期待結果**:
  - `{ valid: false, missingDependencies: [], missingFiles: [{ phase: 'requirements', file: '/path/to/requirements.md' }] }`
  - `buildErrorMessage()`が呼ばれる（内部的に）
- **テストデータ**: モックMetadataManager

#### 2.10.2 detectCircularDependencies() - 正常系

**テストケース名**: `detectCircularDependencies_正常系_循環なし`

- **目的**: 循環依存がない場合、空配列が返されることを検証
- **前提条件**: PHASE_DEPENDENCIESに循環依存が存在しない
- **入力**: なし
- **期待結果**: `[]`
- **テストデータ**: なし

**テストケース名**: `detectCircularDependencies_異常系_循環あり`

- **目的**: 循環依存がある場合、検出されることを検証
- **前提条件**: PHASE_DEPENDENCIESに循環依存を追加（テスト用）
- **入力**: なし
- **期待結果**: 循環パスの配列が返される
- **テストデータ**: モック循環依存

#### 2.10.3 validateExternalDocument() - 正常系

**テストケース名**: `validateExternalDocument_正常系_ドキュメント存在`

- **目的**: 外部ドキュメントが存在する場合、validがtrueになることを検証
- **前提条件**:
  - Planning Phaseが完了している
  - planning.mdファイルが存在する
- **入力**:
  - `currentPhase = 'requirements'`
  - `metadataManager`（モック）
- **期待結果**:
  - `{ valid: true, message: '...' }`
- **テストデータ**: モックMetadataManager

**テストケース名**: `validateExternalDocument_異常系_ドキュメント不在`

- **目的**: 外部ドキュメントが存在しない場合、validがfalseになることを検証
- **前提条件**:
  - Planning Phaseが未完了または出力ファイルが存在しない
- **入力**:
  - `currentPhase = 'requirements'`
  - `metadataManager`（モック）
- **期待結果**:
  - `{ valid: false, message: '...' }`
- **テストデータ**: モックMetadataManager

---

## 3. Integrationテストシナリオ

### 3.1 Codex/Claudeエージェント実行の統合テスト

#### 3.1.1 Codexエージェント実行フロー

**シナリオ名**: `agent-client-execution_integration_codex_full_flow`

- **目的**: Codexエージェントの実行からログ出力までの統合フローを検証
- **前提条件**:
  - Codex CLIがインストールされている（モック可）
  - テスト用ワークスペースが存在する
- **テスト手順**:
  1. `CodexAgentClient`インスタンスを作成
  2. `executeTask()`を呼び出す
  3. `setupCodexEnvironment()`が正しく環境変数を設定することを確認
  4. Codex CLIプロセスが起動されることを確認
  5. JSONイベントストリームが`parseCodexEvent()`でパースされることを確認
  6. パース済みイベントが`formatCodexLog()`でフォーマットされることを確認
  7. ログが`console.log()`で出力されることを確認
  8. 最終的な出力配列が返されることを確認
- **期待結果**:
  - すべての手順が正しく実行される
  - 出力配列にエージェントの応答が含まれる
  - ログ出力が正しくフォーマットされている
- **確認項目**:
  - [ ] 環境変数が正しく設定されている（OPENAI_API_KEY, GH_TOKEN）
  - [ ] JSONイベントが正しくパースされている
  - [ ] ログフォーマットが正しい（`[CODEX THINKING]`, `[CODEX ACTION]` 等）
  - [ ] エラーハンドリングが正しい

#### 3.1.2 Claudeエージェント実行フロー

**シナリオ名**: `agent-client-execution_integration_claude_full_flow`

- **目的**: Claudeエージェントの実行からログ出力までの統合フローを検証
- **前提条件**:
  - Claude Agent SDKが利用可能（モック可）
  - 認証トークンが取得可能
  - テスト用ワークスペースが存在する
- **テスト手順**:
  1. `ClaudeAgentClient`インスタンスを作成
  2. `executeTask()`を呼び出す
  3. `ensureAuthToken()`が認証トークンを取得することを確認
  4. Claude Agent SDKプロセスが起動されることを確認
  5. SDKメッセージが`parseClaudeEvent()`でパースされることを確認
  6. パース済みイベントが`formatClaudeLog()`でフォーマットされることを確認
  7. ログが`console.log()`で出力されることを確認
  8. 最終的な出力配列が返されることを確認
- **期待結果**:
  - すべての手順が正しく実行される
  - 出力配列にエージェントの応答が含まれる
  - ログ出力が正しくフォーマットされている
- **確認項目**:
  - [ ] 認証トークンが正しく取得されている（credentials.jsonまたは環境変数）
  - [ ] SDKメッセージが正しくパースされている
  - [ ] ログフォーマットが正しい（`[AGENT THINKING]`, `[AGENT ACTION]` 等）
  - [ ] エラーハンドリングが正しい

#### 3.1.3 エージェントフォールバック処理

**シナリオ名**: `agent-client-execution_integration_fallback`

- **目的**: Codex失敗時にClaudeにフォールバックする統合フローを検証
- **前提条件**:
  - Codex CLIが失敗する状態（モック）
  - Claude Agent SDKは利用可能
- **テスト手順**:
  1. `AgentExecutor`（またはBasePhase）がCodexを試行
  2. Codex実行が失敗する
  3. Claudeにフォールバックする
  4. Claude実行が成功する
- **期待結果**:
  - Codex失敗時にClaudeにフォールバックする
  - Claude実行が正常に完了する
- **確認項目**:
  - [ ] Codexエラーが正しくハンドリングされる
  - [ ] Claudeが正しく起動される
  - [ ] 最終的な出力が返される

---

### 3.2 メタデータ永続化の統合テスト

#### 3.2.1 メタデータ永続化フロー

**シナリオ名**: `metadata-persistence_integration_full_flow`

- **目的**: メタデータの作成、更新、保存、読み込みの統合フローを検証
- **前提条件**:
  - テスト用ワークフローディレクトリが作成されている
  - fs-extraが利用可能
- **テスト手順**:
  1. `MetadataManager`インスタンスを作成
  2. `updatePhaseStatus()`でフェーズステータスを更新
  3. `addCost()`でコストを追加
  4. `save()`でメタデータファイルに保存
  5. `formatTimestampForFilename()`が内部で呼ばれることを確認（タイムスタンプ生成）
  6. 新しい`MetadataManager`インスタンスでメタデータファイルを読み込み
  7. 保存したデータが正しく読み込まれることを確認
- **期待結果**:
  - メタデータが正しく保存される
  - メタデータが正しく読み込まれる
  - フェーズステータスとコストが保持される
- **確認項目**:
  - [ ] metadata.jsonファイルが作成される
  - [ ] ファイル内容が正しいJSON形式
  - [ ] フェーズステータスが正しく保存される
  - [ ] コストが正しく集計される

#### 3.2.2 バックアップ＋ロールバック

**シナリオ名**: `metadata-persistence_integration_backup_rollback`

- **目的**: メタデータのバックアップとロールバックの統合フローを検証
- **前提条件**:
  - metadata.jsonファイルが存在する
  - `backupMetadataFile()`が利用可能
- **テスト手順**:
  1. `MetadataManager`で既存のメタデータを読み込み
  2. `backupMetadata()`でバックアップを作成
  3. バックアップファイルが作成されることを確認（`metadata.json.backup_{timestamp}`）
  4. メタデータを更新し、保存
  5. バックアップファイルから元のメタデータを復元
  6. 復元したメタデータが元のデータと一致することを確認
- **期待結果**:
  - バックアップファイルが正しく作成される
  - 復元後のメタデータが元のデータと一致する
- **確認項目**:
  - [ ] バックアップファイルが作成される
  - [ ] バックアップファイル名にタイムスタンプが含まれる
  - [ ] 復元後のデータが元のデータと一致する

#### 3.2.3 ワークフローディレクトリクリーンアップ

**シナリオ名**: `metadata-persistence_integration_cleanup`

- **目的**: ワークフローディレクトリのクリーンアップの統合フローを検証
- **前提条件**:
  - .ai-workflow/issue-26ディレクトリが存在する
  - `removeWorkflowDirectory()`が利用可能
- **テスト手順**:
  1. `MetadataManager`インスタンスを作成
  2. `clear()`を呼び出す
  3. metadata.jsonファイルが削除されることを確認
  4. `removeWorkflowDirectory()`が呼ばれることを確認
  5. ワークフローディレクトリが削除されることを確認
- **期待結果**:
  - metadata.jsonファイルが削除される
  - ワークフローディレクトリが削除される
- **確認項目**:
  - [ ] metadata.jsonが存在しない
  - [ ] .ai-workflow/issue-26が存在しない
  - [ ] 削除処理のログが出力される

---

### 3.3 依存関係検証の統合テスト

#### 3.3.1 依存関係検証フロー

**シナリオ名**: `dependency-validation_integration_full_flow`

- **目的**: 依存関係検証の統合フローを検証
- **前提条件**:
  - MetadataManagerが利用可能
  - 一部のフェーズが完了している
- **テスト手順**:
  1. MetadataManagerで各フェーズのステータスを設定
  2. `validatePhaseDependencies()`を呼び出す
  3. `getPhaseOutputFilePath()`が内部で呼ばれることを確認
  4. ファイル存在チェックが実行されることを確認
  5. `buildErrorMessage()`または`buildWarningMessage()`が呼ばれることを確認（依存関係が未充足の場合）
  6. 検証結果が返されることを確認
- **期待結果**:
  - 依存関係が正しく検証される
  - エラー/警告メッセージが正しく生成される
- **確認項目**:
  - [ ] 依存関係チェックが正しく実行される
  - [ ] ファイル存在チェックが正しく実行される
  - [ ] エラー/警告メッセージが適切に生成される

#### 3.3.2 プリセット実行フロー

**シナリオ名**: `dependency-validation_integration_preset_execution`

- **目的**: プリセットに基づく依存関係検証の統合フローを検証
- **前提条件**:
  - PHASE_PRESETSが定義されている
  - MetadataManagerが利用可能
- **テスト手順**:
  1. `--preset full`オプションでワークフローを実行
  2. 各フェーズが順次実行されることを確認
  3. 各フェーズの依存関係が検証されることを確認
  4. 依存関係が充足されていない場合、エラーが表示されることを確認
  5. `--ignore-dependencies`オプションで依存関係チェックがスキップされることを確認
- **期待結果**:
  - プリセットのフェーズが順次実行される
  - 依存関係チェックが正しく動作する
- **確認項目**:
  - [ ] プリセット定義が正しく読み込まれる
  - [ ] 各フェーズの依存関係が検証される
  - [ ] `--ignore-dependencies`オプションが正しく動作する

---

## 4. テストデータ

### 4.1 Codexイベントデータ

#### 4.1.1 正常系イベント

**Assistant Thinking**:
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I need to read the file to understand the current implementation."
      }
    ]
  }
}
```

**Assistant Action (Tool Use)**:
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "name": "bash",
        "input": {
          "command": "ls -la"
        }
      }
    ]
  }
}
```

**Result**:
```json
{
  "type": "result",
  "result": "success",
  "status": "completed",
  "turns": 3,
  "duration_ms": 5000
}
```

#### 4.1.2 異常系イベント

**不正なJSON**:
```
{ invalid json }
```

**空文字列**:
```
""
```

---

### 4.2 Claudeイベントデータ

#### 4.2.1 正常系メッセージ

**Assistant Message (Thinking)**:
```typescript
{
  type: 'assistant',
  content: [
    {
      type: 'text',
      text: 'I will analyze the codebase to understand the refactoring requirements.'
    }
  ]
}
```

**Assistant Message (Action)**:
```typescript
{
  type: 'assistant',
  content: [
    {
      type: 'tool_use',
      name: 'Read',
      input: {
        file_path: '/path/to/file.ts'
      }
    }
  ]
}
```

**Stream Event**:
```typescript
{
  type: 'stream_event',
  // ... SDKストリームイベント
}
```

---

### 4.3 メタデータテストデータ

#### 4.3.1 正常系メタデータ

**WorkflowState**:
```json
{
  "issueNumber": 26,
  "phaseStatuses": {
    "planning": {
      "status": "completed",
      "startedAt": "2025-01-20T10:00:00Z",
      "completedAt": "2025-01-20T11:00:00Z",
      "outputFiles": ["/path/to/.ai-workflow/issue-26/00_planning/output/planning.md"]
    },
    "requirements": {
      "status": "in_progress",
      "startedAt": "2025-01-20T11:00:00Z"
    }
  },
  "totalCost": {
    "codex": { "inputTokens": 1000, "outputTokens": 500, "cost": 0.05 },
    "claude": { "inputTokens": 2000, "outputTokens": 1000, "cost": 0.10 }
  }
}
```

#### 4.3.2 credentials.jsonテストデータ

**正常系**:
```json
{
  "oauth": {
    "access_token": "test-oauth-token-12345"
  }
}
```

**ネストされたトークン**:
```json
{
  "level1": {
    "level2": {
      "access_token": "nested-token-67890"
    }
  }
}
```

---

### 4.4 環境変数テストデータ

#### 4.4.1 Codex環境変数

```typescript
{
  CODEX_API_KEY: 'sk-test-api-key-12345',
  GITHUB_TOKEN: 'ghp_test_token_67890',
  CODEX_AUTH_FILE: '/path/to/auth.json',
  OTHER_VAR: 'other-value'
}
```

#### 4.4.2 Claude環境変数

```typescript
{
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token-12345',
  OTHER_VAR: 'other-value'
}
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **ローカル開発環境**: Node.js 20以上、npm 10以上
- **CI/CD環境**: GitHub Actions（既存のワークフローを使用）
- **テストフレームワーク**: Jest（既存のテストインフラを使用）

### 5.2 必要な外部サービス

- **Codex CLI**: モック化可能（実際のCLIインストールは不要）
- **Claude Agent SDK**: モック化可能（実際のSDKは不要）
- **GitHub API**: モック化可能（実際のAPIアクセスは不要）

### 5.3 モック/スタブの必要性

#### 5.3.1 Unitテスト用モック

- **fs-extra**: ファイルシステム操作のモック
  - `fs.copyFileSync()`, `fs.removeSync()`, `fs.existsSync()`
- **child_process**: プロセス起動のモック
  - `spawn()`
- **@anthropic-ai/claude-agent-sdk**: Claude SDKのモック
  - `Agent`クラス、`executeTask()`メソッド

#### 5.3.2 Integrationテスト用モック

- **Codex CLI**: 実際のCLI実行をモック化（テストデータを返す）
- **Claude Agent SDK**: 実際のSDK実行をモック化（テストデータを返す）
- **ファイルシステム**: テスト用一時ディレクトリを使用（実ファイルI/O）

### 5.4 テスト用ディレクトリ構造

```
/tmp/test-workspace/
├── .ai-workflow/
│   └── issue-26/
│       ├── metadata.json
│       ├── 00_planning/
│       │   └── output/
│       │       └── planning.md
│       ├── 01_requirements/
│       │   └── output/
│       │       └── requirements.md
│       └── 02_design/
│           └── output/
│               └── design.md
└── credentials.json
```

---

## 6. 品質ゲート確認

### 6.1 Phase 2の戦略に沿ったテストシナリオである

✅ **確認**:
- UNIT_INTEGRATION戦略に基づき、Unitテストシナリオ（2.1～2.10）とIntegrationテストシナリオ（3.1～3.3）を作成
- BDDシナリオは作成していない（戦略に含まれないため）

### 6.2 主要な正常系がカバーされている

✅ **確認**:
- 各ヘルパーモジュールの主要関数の正常系をカバー（agent-event-parser, log-formatter, env-setup, metadata-io, validation, dependency-messages）
- 各コアファイルの主要メソッドの正常系をカバー（CodexAgentClient, ClaudeAgentClient, MetadataManager, phase-dependencies）
- 統合フローの正常系をカバー（エージェント実行、メタデータ永続化、依存関係検証）

### 6.3 主要な異常系がカバーされている

✅ **確認**:
- パース失敗、ファイル不在、認証エラー、依存関係未充足等の異常系をカバー
- 各ヘルパーモジュールの異常系（parseCodexEvent_異常系、backupMetadataFile_異常系、validateIssueNumber_異常系 等）
- エージェントクライアントの異常系（executeTask_異常系_Codex未インストール、executeTask_異常系_認証エラー）

### 6.4 期待結果が明確である

✅ **確認**:
- すべてのテストケースに具体的な期待結果を記載
- Given-When-Then形式（または類似形式）で期待値を明記
- 確認項目チェックリストを統合テストシナリオに追加

---

## 7. 追加情報

### 7.1 テストカバレッジ目標

- **全体カバレッジ**: 80%以上（既存レベル維持）
- **新規ヘルパーモジュール**: 85%以上
  - agent-event-parser.ts: 85%以上
  - log-formatter.ts: 85%以上
  - env-setup.ts: 85%以上
  - metadata-io.ts: 85%以上
  - validation.ts: 85%以上
  - dependency-messages.ts: 85%以上
- **既存コアファイル**: 既存カバレッジレベル維持
  - codex-agent-client.ts: 既存レベル維持
  - claude-agent-client.ts: 既存レベル維持
  - metadata-manager.ts: 既存レベル維持
  - phase-dependencies.ts: 既存レベル維持

### 7.2 テスト実行コマンド

```bash
# 全テスト実行
npm test

# Unitテストのみ
npm run test:unit

# Integrationテストのみ
npm run test:integration

# カバレッジレポート生成
npm run test:coverage
```

### 7.3 既存テストとの整合性

本テストシナリオは、以下の既存テストパターンとの整合性を維持します：

- **Issue #23 (BasePhase)**: 30テストケース、カバレッジ85%以上
- **Issue #24 (GitHubClient)**: 24テストケース、カバレッジ82%以上
- **Issue #25 (GitManager)**: 21テストケース、カバレッジ80%以上

本Issueでは、**25～35テストケース**を目標とし、**カバレッジ80～85%以上**を達成します。

### 7.4 次のステップ

1. Phase 4（実装）でヘルパーモジュールを実装
2. Phase 5（テストコード実装）で本テストシナリオに基づくテストコードを作成
3. Phase 6（テスト実行）でテストを実行し、カバレッジレポートを確認
4. 失敗したテストケースの修正、リグレッションテストの実行

---

**テストシナリオ作成日**: 2025-01-20
**承認者**: AI Workflow Agent
**次回レビュー日**: Phase 5（テストコード実装）完了後
