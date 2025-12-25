# テストシナリオ: Issue #505

## Jenkins Pipelineからのwebhook送信機能を追加してジョブ実行状況をLavableに通知

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**テスト戦略**: INTEGRATION_ONLY

**判断根拠（Phase 2 設計書より）**:
- 外部システム連携（HTTP Request Plugin経由でのwebhook送信）が主機能
- Groovy Jenkinsfileのテストは統合テストが主流
- `httpRequest`ステップはJenkins環境でのみ動作するためユニットテストは不適切
- BDDはエンドユーザー向け機能ではなくシステム間連携のため不適切

### 1.2 テスト対象の範囲

| 対象コンポーネント | テスト内容 |
|------------------|-----------|
| `jenkins/shared/common.groovy` | `sendWebhook()`関数が正しく定義されているか |
| Job DSLファイル（8ファイル） | JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが追加されているか |
| Jenkinsfile（8ファイル） | `sendWebhook()`呼び出しが適切に組み込まれているか |

### 1.3 テストの目的

1. **機能完全性の確認**: 全17ファイルにwebhook機能が正しく実装されていることを静的検証
2. **セキュリティ要件の検証**: 機密パラメータが`nonStoredPasswordParam`で保護されていることを確認
3. **後方互換性の確認**: 既存機能に影響を与えないことを確認
4. **エラーハンドリングの設計確認**: webhook失敗時にビルドが継続する設計が実装されていることを確認

---

## 2. Integrationテストシナリオ

### IT-001: sendWebhook共通関数の定義確認

**シナリオ名**: common.groovy に sendWebhook 関数が追加されている

- **目的**: 共通モジュールに webhook 送信用関数が正しく定義されていることを検証
- **前提条件**: `jenkins/shared/common.groovy` ファイルが存在する
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. `sendWebhook` 関数の定義を検索する
  3. 関数シグネチャが仕様通りであることを確認する
- **期待結果**:
  - `def sendWebhook(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = '')` 形式の関数定義が存在する
- **確認項目**:
  - [ ] `sendWebhook` 関数が定義されている
  - [ ] 5つのパラメータ（jobId, webhookUrl, webhookToken, status, errorMessage）を受け取る
  - [ ] errorMessage にデフォルト値 `''` が設定されている

---

### IT-002: sendWebhook関数のパラメータ検証ロジック確認

**シナリオ名**: sendWebhook関数がパラメータ未指定時にスキップする

- **目的**: パラメータ未指定時の動作が正しく実装されていることを検証
- **前提条件**: sendWebhook 関数が common.groovy に定義されている
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. パラメータ検証ロジックを検索する
- **期待結果**:
  - `webhookUrl`, `webhookToken`, `jobId` のいずれかが空/未定義の場合をチェックするロジックが存在する
  - スキップ時に「Webhook parameters not provided, skipping notification」というログ出力がある
- **確認項目**:
  - [ ] `!webhookUrl?.trim()` または同等の null/empty チェックが存在する
  - [ ] `!webhookToken?.trim()` または同等のチェックが存在する
  - [ ] `!jobId?.trim()` または同等のチェックが存在する
  - [ ] スキップログメッセージが実装されている

---

### IT-003: sendWebhook関数のhttpRequest使用確認

**シナリオ名**: sendWebhook関数がHTTP Request Pluginを使用している

- **目的**: HTTP Request Plugin を使用した webhook 送信が正しく実装されていることを検証
- **前提条件**: sendWebhook 関数が common.groovy に定義されている
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. `httpRequest` ステップの呼び出しを検索する
  3. 各パラメータ設定を確認する
- **期待結果**:
  - `httpRequest()` ステップが使用されている
  - 以下のパラメータが設定されている:
    - `httpMode: 'POST'`
    - `contentType: 'APPLICATION_JSON'`
    - `customHeaders` に `X-Webhook-Token` が含まれている
    - `validResponseCodes: '200:299'`
    - `timeout: 30`
- **確認項目**:
  - [ ] `httpRequest(` 呼び出しが存在する
  - [ ] POST メソッドが指定されている
  - [ ] JSON コンテンツタイプが指定されている
  - [ ] X-Webhook-Token ヘッダーが設定されている
  - [ ] レスポンスコード 200-299 が有効として設定されている
  - [ ] タイムアウト 30秒が設定されている

---

### IT-004: sendWebhook関数のエラーハンドリング確認

**シナリオ名**: sendWebhook関数がwebhook送信失敗時にビルドを継続する

- **目的**: webhook 送信失敗時にビルドを失敗させない設計が実装されていることを検証
- **前提条件**: sendWebhook 関数が common.groovy に定義されている
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. try-catch ブロックの存在を確認する
  3. catch ブロック内の処理を確認する
- **期待結果**:
  - `try { ... } catch (Exception e) { ... }` 構造が存在する
  - catch ブロック内でエラーログ「Failed to send webhook:」が出力される
  - catch ブロック内で `error()` や例外の再スローがない
- **確認項目**:
  - [ ] try-catch 構造が実装されている
  - [ ] 失敗時のログメッセージが出力される
  - [ ] 例外を再スローしていない（ビルド継続）

---

### IT-005: sendWebhook関数のリクエストボディ構築確認

**シナリオ名**: sendWebhook関数が正しいJSONリクエストボディを構築する

- **目的**: ステータスに応じた適切な JSON リクエストボディが構築されることを検証
- **前提条件**: sendWebhook 関数が common.groovy に定義されている
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. リクエストボディ構築ロジックを検索する
- **期待結果**:
  - 通常時: `{"job_id": "${jobId}", "status": "${status}"}` 形式
  - エラー時: `{"job_id": "${jobId}", "status": "${status}", "error": "${errorMessage}"}` 形式
- **確認項目**:
  - [ ] `job_id` フィールドが含まれる
  - [ ] `status` フィールドが含まれる
  - [ ] errorMessage が存在する場合に `error` フィールドが追加される

---

### IT-006: sendWebhook関数の成功ログ出力確認

**シナリオ名**: sendWebhook関数が成功時にログを出力する

- **目的**: webhook 送信成功時のログ出力が実装されていることを検証
- **前提条件**: sendWebhook 関数が common.groovy に定義されている
- **テスト手順**:
  1. `jenkins/shared/common.groovy` ファイルを読み込む
  2. 成功時のログ出力を検索する
- **期待結果**:
  - 「Webhook sent successfully:」を含むログ出力が存在する
- **確認項目**:
  - [ ] 成功ログメッセージが実装されている
  - [ ] ステータス値がログに含まれる

---

### IT-007: Job DSL - JOB_IDパラメータ追加確認

**シナリオ名**: 全Job DSLファイルにJOB_IDパラメータが追加されている

- **目的**: 8つの Job DSL ファイルすべてに JOB_ID パラメータが追加されていることを検証
- **前提条件**: 対象の8つの Job DSL ファイルが存在する
- **テスト手順**:
  1. 各 Job DSL ファイルを読み込む
  2. `stringParam('JOB_ID'` パラメータ定義を検索する
- **期待結果**:
  - 全8ファイルに `stringParam('JOB_ID'` が存在する
- **確認項目**:
  - [ ] ai_workflow_all_phases_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_preset_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_single_phase_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_rollback_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_auto_issue_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_finalize_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_pr_comment_execute_job.groovy に JOB_ID が定義されている
  - [ ] ai_workflow_pr_comment_finalize_job.groovy に JOB_ID が定義されている

---

### IT-008: Job DSL - WEBHOOK_URLパラメータセキュリティ確認

**シナリオ名**: WEBHOOK_URLがnonStoredPasswordParamとして定義されている

- **目的**: WEBHOOK_URL パラメータが `nonStoredPasswordParam` を使用して保護されていることを検証
- **前提条件**: 対象の8つの Job DSL ファイルが存在する
- **テスト手順**:
  1. 各 Job DSL ファイルを読み込む
  2. `nonStoredPasswordParam('WEBHOOK_URL'` を検索する
  3. `stringParam('WEBHOOK_URL'` が使用されていないことを確認する
- **期待結果**:
  - 全8ファイルに `nonStoredPasswordParam('WEBHOOK_URL'` が存在する
  - `stringParam('WEBHOOK_URL'` が存在しない
- **確認項目**:
  - [ ] 全8ファイルで WEBHOOK_URL が nonStoredPasswordParam として定義されている
  - [ ] stringParam として定義されていない

---

### IT-009: Job DSL - WEBHOOK_TOKENパラメータセキュリティ確認

**シナリオ名**: WEBHOOK_TOKENがnonStoredPasswordParamとして定義されている

- **目的**: WEBHOOK_TOKEN パラメータが `nonStoredPasswordParam` を使用して保護されていることを検証
- **前提条件**: 対象の8つの Job DSL ファイルが存在する
- **テスト手順**:
  1. 各 Job DSL ファイルを読み込む
  2. `nonStoredPasswordParam('WEBHOOK_TOKEN'` を検索する
  3. `stringParam('WEBHOOK_TOKEN'` が使用されていないことを確認する
- **期待結果**:
  - 全8ファイルに `nonStoredPasswordParam('WEBHOOK_TOKEN'` が存在する
  - `stringParam('WEBHOOK_TOKEN'` が存在しない
- **確認項目**:
  - [ ] 全8ファイルで WEBHOOK_TOKEN が nonStoredPasswordParam として定義されている
  - [ ] stringParam として定義されていない

---

### IT-010: Job DSL - パラメータ説明文の確認

**シナリオ名**: webhook関連パラメータに適切な説明文が設定されている

- **目的**: 各パラメータに運用者向けの説明文が含まれていることを検証
- **前提条件**: 対象の Job DSL ファイルにパラメータが定義されている
- **テスト手順**:
  1. 各 Job DSL ファイルを読み込む
  2. JOB_ID の説明文を確認する
  3. WEBHOOK_URL の説明文を確認する
  4. WEBHOOK_TOKEN の説明文を確認する
- **期待結果**:
  - JOB_ID: 「Lavable Job ID」を含む説明文
  - WEBHOOK_URL: 「Webhook」を含む説明文
  - WEBHOOK_TOKEN: 「Webhook」または「X-Webhook-Token」を含む説明文
- **確認項目**:
  - [ ] JOB_ID に説明文が存在する
  - [ ] WEBHOOK_URL に説明文が存在する
  - [ ] WEBHOOK_TOKEN に説明文が存在する

---

### IT-011: Jenkinsfile - common.groovy読み込み確認

**シナリオ名**: 全JenkinsfileがcommonライブラリをロードしてsendWebhookを呼び出せる

- **目的**: 各 Jenkinsfile が common.groovy を読み込み、sendWebhook を使用可能であることを検証
- **前提条件**: 対象の8つの Jenkinsfile が存在する
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. `load 'jenkins/shared/common.groovy'` またはそれに相当する読み込みを確認する
- **期待結果**:
  - 全8ファイルで common.groovy がロードされている
- **確認項目**:
  - [ ] all-phases/Jenkinsfile で common.groovy がロードされている
  - [ ] preset/Jenkinsfile で common.groovy がロードされている
  - [ ] single-phase/Jenkinsfile で common.groovy がロードされている
  - [ ] rollback/Jenkinsfile で common.groovy がロードされている
  - [ ] auto-issue/Jenkinsfile で common.groovy がロードされている
  - [ ] finalize/Jenkinsfile で common.groovy がロードされている
  - [ ] pr-comment-execute/Jenkinsfile で common.groovy がロードされている
  - [ ] pr-comment-finalize/Jenkinsfile で common.groovy がロードされている

---

### IT-012: Jenkinsfile - ビルド開始時webhook送信確認

**シナリオ名**: 全Jenkinsfileでビルド開始時にwebhook送信が呼び出される

- **目的**: ビルド開始時に `status: "running"` で webhook が送信されることを検証
- **前提条件**: Jenkinsfile に sendWebhook 呼び出しが追加されている
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. `sendWebhook(` 呼び出しで `'running'` ステータスを検索する
- **期待結果**:
  - 全8ファイルに `sendWebhook(..., 'running')` 形式の呼び出しが存在する
  - Load Common Library ステージまたはその直後に配置されている
- **確認項目**:
  - [ ] 全8ファイルで 'running' ステータスの sendWebhook 呼び出しが存在する

---

### IT-013: Jenkinsfile - ビルド成功時webhook送信確認

**シナリオ名**: 全Jenkinsfileのpost.successブロックでwebhook送信が呼び出される

- **目的**: ビルド成功時に `status: "success"` で webhook が送信されることを検証
- **前提条件**: Jenkinsfile に post.success ブロックが存在する
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. `success {` ブロック内で `sendWebhook(` 呼び出しを検索する
  3. `'success'` ステータスが渡されていることを確認する
- **期待結果**:
  - 全8ファイルの post.success ブロック内に `sendWebhook(..., 'success')` が存在する
- **確認項目**:
  - [ ] 全8ファイルで post.success 内に 'success' ステータスの sendWebhook がある

---

### IT-014: Jenkinsfile - ビルド失敗時webhook送信確認

**シナリオ名**: 全Jenkinsfileのpost.failureブロックでwebhook送信が呼び出される

- **目的**: ビルド失敗時に `status: "failed"` と `error` で webhook が送信されることを検証
- **前提条件**: Jenkinsfile に post.failure ブロックが存在する
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. `failure {` ブロック内で `sendWebhook(` 呼び出しを検索する
  3. `'failed'` ステータスが渡されていることを確認する
  4. エラーメッセージパラメータが渡されていることを確認する
- **期待結果**:
  - 全8ファイルの post.failure ブロック内に `sendWebhook(..., 'failed', ...)` が存在する
  - エラーメッセージ（5番目のパラメータ）が渡されている
- **確認項目**:
  - [ ] 全8ファイルで post.failure 内に 'failed' ステータスの sendWebhook がある
  - [ ] エラーメッセージパラメータが含まれている

---

### IT-015: Jenkinsfile - パラメータ参照の正確性確認

**シナリオ名**: JenkinsfileがJob DSLパラメータを正しく参照している

- **目的**: sendWebhook 呼び出し時に params.JOB_ID, params.WEBHOOK_URL, params.WEBHOOK_TOKEN が正しく参照されることを検証
- **前提条件**: Jenkinsfile に sendWebhook 呼び出しが存在する
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. sendWebhook 呼び出しのパラメータを確認する
- **期待結果**:
  - `params.JOB_ID` が使用されている
  - `params.WEBHOOK_URL` が使用されている
  - `params.WEBHOOK_TOKEN` が使用されている
- **確認項目**:
  - [ ] `params.JOB_ID` の参照が存在する
  - [ ] `params.WEBHOOK_URL` の参照が存在する
  - [ ] `params.WEBHOOK_TOKEN` の参照が存在する

---

### IT-016: 後方互換性 - 既存パラメータの保持確認

**シナリオ名**: 既存のJob DSLパラメータが影響を受けていない

- **目的**: webhook パラメータ追加により既存パラメータが削除・変更されていないことを検証
- **前提条件**: Job DSL ファイルが存在する
- **テスト手順**:
  1. 各 Job DSL ファイルを読み込む
  2. 既存パラメータ（ISSUE_URL, BRANCH_NAME, AGENT_MODE, LOG_LEVEL 等）の存在を確認する
- **期待結果**:
  - 既存パラメータがすべて保持されている
- **確認項目**:
  - [ ] ISSUE_URL パラメータが保持されている
  - [ ] BRANCH_NAME パラメータが保持されている
  - [ ] AGENT_MODE パラメータが保持されている
  - [ ] LOG_LEVEL パラメータが保持されている
  - [ ] logRotator 設定（numToKeep: 30, daysToKeep: 90）が保持されている

---

### IT-017: 後方互換性 - 既存Jenkinsfileステージの保持確認

**シナリオ名**: 既存のJenkinsfileステージが影響を受けていない

- **目的**: webhook 呼び出し追加により既存のパイプラインステージが影響を受けていないことを検証
- **前提条件**: Jenkinsfile が存在する
- **テスト手順**:
  1. 各 Jenkinsfile を読み込む
  2. 既存のステージ（Load Common Library, Prepare Agent Credentials, Setup Environment 等）の存在を確認する
- **期待結果**:
  - 既存ステージ構造が保持されている
- **確認項目**:
  - [ ] Load Common Library ステージが存在する
  - [ ] Prepare Agent Credentials ステージが存在する（pr-comment-finalize除く）
  - [ ] Setup Environment ステージが存在する
  - [ ] Execute AI Workflow ステージが存在する

---

### IT-018: ドキュメント - README更新確認

**シナリオ名**: jenkins/README.mdにwebhook機能のドキュメントが追加されている

- **目的**: webhook 機能の使用方法がドキュメント化されていることを検証
- **前提条件**: `jenkins/README.md` ファイルが存在する
- **テスト手順**:
  1. `jenkins/README.md` ファイルを読み込む
  2. webhook 関連のセクションまたは説明を検索する
- **期待結果**:
  - JOB_ID パラメータの説明が含まれている
  - WEBHOOK_URL パラメータの説明が含まれている
  - WEBHOOK_TOKEN パラメータの説明が含まれている
  - HTTP Request Plugin が前提条件として記載されている
- **確認項目**:
  - [ ] webhook 機能のセクションが存在する
  - [ ] 新規パラメータの説明が記載されている
  - [ ] 前提条件（HTTP Request Plugin）が記載されている

---

## 3. テストデータ

### 3.1 Job DSLファイルパス

| ファイル名 | パス |
|-----------|------|
| all-phases | `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy` |
| preset | `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy` |
| single-phase | `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy` |
| rollback | `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy` |
| auto-issue | `jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy` |
| finalize | `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` |
| pr-comment-execute | `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy` |
| pr-comment-finalize | `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy` |

### 3.2 Jenkinsfileパス

| ファイル名 | パス |
|-----------|------|
| all-phases | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| preset | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| single-phase | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| rollback | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| auto-issue | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |
| finalize | `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` |
| pr-comment-execute | `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` |
| pr-comment-finalize | `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` |

### 3.3 共通モジュールパス

| ファイル名 | パス |
|-----------|------|
| common.groovy | `jenkins/shared/common.groovy` |

### 3.4 検証用正規表現パターン

| 検証対象 | パターン |
|---------|----------|
| sendWebhook関数定義 | `def sendWebhook\s*\(.*String jobId.*String webhookUrl.*String webhookToken.*String status` |
| パラメータ検証 | `!webhookUrl\?\.\s*trim\(\)` |
| httpRequest呼び出し | `httpRequest\s*\(` |
| try-catch構造 | `try\s*\{[\s\S]*\}\s*catch\s*\(Exception` |
| JOB_IDパラメータ | `stringParam\('JOB_ID'` |
| WEBHOOK_URL保護 | `nonStoredPasswordParam\('WEBHOOK_URL'` |
| WEBHOOK_TOKEN保護 | `nonStoredPasswordParam\('WEBHOOK_TOKEN'` |
| runningステータス | `sendWebhook\([^)]*'running'` |
| successステータス | `sendWebhook\([^)]*'success'` |
| failedステータス | `sendWebhook\([^)]*'failed'` |

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

| 項目 | 要件 |
|------|------|
| 実行環境 | Node.js 18以上 |
| テストフレームワーク | Jest |
| 実行方法 | `npm test` または `npx jest tests/integration/jenkins/webhook-*.test.ts` |

### 4.2 必要な依存関係

| パッケージ | 用途 |
|-----------|------|
| jest | テストフレームワーク |
| fs-extra | ファイル読み込み |
| path | パス操作 |

### 4.3 モック/スタブの必要性

- **不要**: 本テストシナリオは静的検証（ファイル内容の検証）であり、外部システムとの連携テストは行わない
- Jenkins 環境での実際の webhook 送信テストは運用時の手動テストで実施

---

## 5. 受け入れ基準との対応

| 受け入れ基準 | 対応テストシナリオ |
|-------------|------------------|
| AC-001: Job DSLパラメータ追加 | IT-007, IT-008, IT-009, IT-010 |
| AC-002: webhook送信成功（ビルド開始時） | IT-012, IT-015 |
| AC-003: webhook送信成功（ビルド成功時） | IT-013, IT-015 |
| AC-004: webhook送信成功（ビルド失敗時） | IT-014, IT-015 |
| AC-005: パラメータ未指定時のスキップ | IT-002 |
| AC-006: webhook送信失敗時の継続 | IT-004 |
| AC-007: セキュリティ保護 | IT-008, IT-009 |
| AC-008: 全Jenkinsfileでの動作確認 | IT-011, IT-012, IT-013, IT-014 |

---

## 6. 品質ゲートチェックリスト

### Phase 3 品質ゲート

- [x] **Phase 2の戦略に沿ったテストシナリオである**: INTEGRATION_ONLY 戦略に基づく静的検証テストシナリオを作成
- [x] **主要な正常系がカバーされている**:
  - sendWebhook関数の定義・実装確認（IT-001〜IT-006）
  - Job DSLパラメータ追加確認（IT-007〜IT-010）
  - Jenkinsfile webhook呼び出し確認（IT-011〜IT-015）
- [x] **主要な異常系がカバーされている**:
  - パラメータ未指定時のスキップ動作（IT-002）
  - webhook送信失敗時のエラーハンドリング（IT-004）
- [x] **期待結果が明確である**: 各テストシナリオに具体的な期待結果と確認項目を記載

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0 | 初版作成 | AI Workflow |
