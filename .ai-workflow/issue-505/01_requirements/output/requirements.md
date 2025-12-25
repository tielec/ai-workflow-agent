# 要件定義書: Issue #505

## Jenkins Pipelineからのwebhook送信機能を追加してジョブ実行状況をLavableに通知

---

## 0. Planning Documentの確認

### 開発計画の全体像

**実装戦略**: EXTEND（既存コードの拡張が中心）
- 新規ファイル作成なし
- 既存の8つのJenkinsfile + 8つのJob DSL + 1つの共通モジュールへの機能追加

**テスト戦略**: INTEGRATION_ONLY
- 外部システム連携（HTTP Request Plugin）が中心のため統合テストを採用
- ユニットテストは不適切（Groovy Jenkinsfileのテストは統合テストが主流）

**テストコード戦略**: CREATE_TEST
- `sendWebhook()` 関数は新規実装のためテストファイルを新規作成

**リスク評価**: 低
- 既存パターンに沿った拡張
- webhook失敗時はビルドを失敗させない設計

**変更対象ファイル**: 計17ファイル
- Job DSL定義ファイル: 8ファイル
- Jenkinsfile: 8ファイル
- 共通モジュール: 1ファイル（`jenkins/shared/common.groovy`）

---

## 1. 概要

### 1.1 背景

Lavableフロントエンドからai-workflowのJenkinsジョブを実行する際、現状ではジョブの実行状況をLavable側でリアルタイムに把握する手段がない。ユーザーはJenkinsコンソールを直接確認するか、ジョブ完了まで待機する必要がある。

### 1.2 目的

Jenkins Pipelineからwebhookを送信し、ジョブの実行状況（開始・成功・失敗）をLavableフロントエンドにリアルタイム通知する機能を実装する。

### 1.3 ビジネス価値

| 価値カテゴリ | 詳細 |
|-------------|------|
| **ユーザー体験向上** | ジョブの進捗がLavableフロントエンド上で可視化され、ユーザーはJenkinsコンソールを確認する必要がなくなる |
| **運用効率化** | ジョブの成功・失敗が即座に通知され、迅速な対応が可能 |
| **トラブルシューティング改善** | 失敗時のエラーメッセージがwebhookに含まれ、問題の特定が容易化 |

### 1.4 技術的価値

| 価値カテゴリ | 詳細 |
|-------------|------|
| **標準化された実装** | HTTP Request Plugin（広く使われている標準プラグイン）を使用 |
| **共通モジュール化** | `sendWebhook()` 関数を共通化し、保守性と一貫性を確保 |
| **オプショナル機能** | パラメータ未指定時はwebhook送信をスキップし、既存ワークフローに影響なし |
| **障害耐性** | webhook送信失敗時はビルド全体を失敗させない設計 |

---

## 2. 機能要件

### 2.1 Job DSLパラメータ追加

| ID | 要件 | 優先度 |
|----|------|--------|
| FR-001 | 全8つのJob DSL定義ファイルに `JOB_ID` パラメータ（string型）を追加する | 高 |
| FR-002 | 全8つのJob DSL定義ファイルに `WEBHOOK_URL` パラメータ（nonStoredPasswordParam型）を追加する | 高 |
| FR-003 | 全8つのJob DSL定義ファイルに `WEBHOOK_TOKEN` パラメータ（nonStoredPasswordParam型）を追加する | 高 |

**対象Job DSLファイル**:
1. `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy`
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy`
3. `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy`
4. `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy`
5. `jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy`
6. `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy`
7. `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy`
8. `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy`

**パラメータ仕様**:

| パラメータ名 | 型 | 説明 | 必須 |
|-------------|-----|------|------|
| JOB_ID | string | Lavable Job ID。webhook送信時にジョブを識別するために使用 | 任意 |
| WEBHOOK_URL | nonStoredPasswordParam | Webhookエンドポイント URL。HTTPSプロトコルを推奨 | 任意 |
| WEBHOOK_TOKEN | nonStoredPasswordParam | Webhook認証トークン。リクエストヘッダーに含めて送信 | 任意 |

### 2.2 共通webhook送信関数

| ID | 要件 | 優先度 |
|----|------|--------|
| FR-004 | `jenkins/shared/common.groovy` に `sendWebhook()` 関数を追加する | 高 |
| FR-005 | `sendWebhook()` 関数は HTTP Request Plugin の `httpRequest` ステップを使用してPOSTリクエストを送信する | 高 |
| FR-006 | パラメータ（JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN）のいずれかが未指定の場合、ログ出力のみでwebhook送信をスキップする | 高 |
| FR-007 | webhook送信失敗時はエラーログを出力するが、ビルド全体を失敗させない | 高 |

**関数シグネチャ**:
```groovy
def sendWebhook(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = '')
```

**送信フォーマット**:
- HTTP Method: POST
- Content-Type: application/json
- 認証ヘッダー: `X-Webhook-Token: ${webhookToken}`
- リクエストボディ:
  - 成功/実行中時: `{"job_id": "${jobId}", "status": "${status}"}`
  - 失敗時: `{"job_id": "${jobId}", "status": "${status}", "error": "${errorMessage}"}`

### 2.3 Jenkinsfileへのwebhook呼び出し追加

| ID | 要件 | 優先度 |
|----|------|--------|
| FR-008 | ビルド開始時（最初のステージ開始後）に `status: "running"` を含むwebhookを送信する | 高 |
| FR-009 | ビルド成功時（post.successブロック内）に `status: "success"` を含むwebhookを送信する | 高 |
| FR-010 | ビルド失敗時（post.failureブロック内）に `status: "failed"` および `error` を含むwebhookを送信する | 高 |

**対象Jenkinsfile**:
1. `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
2. `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
3. `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
4. `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
5. `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile`
6. `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`
7. `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile`
8. `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile`

**webhook送信タイミング詳細**:

| タイミング | status値 | 追加データ | 呼び出し位置 |
|-----------|----------|-----------|-------------|
| ビルド開始時 | "running" | なし | Load Common Library ステージ完了後 |
| ビルド成功時 | "success" | なし | post.success ブロック内 |
| ビルド失敗時 | "failed" | error: エラーメッセージ | post.failure ブロック内 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| ID | 要件 | 目標値 |
|----|------|--------|
| NFR-001 | webhook送信のタイムアウト時間 | 30秒（デフォルト） |
| NFR-002 | webhook送信がビルド全体の実行時間に与える影響 | 最大30秒以内（タイムアウト発生時） |

### 3.2 セキュリティ要件

| ID | 要件 | 説明 |
|----|------|------|
| NFR-003 | WEBHOOK_TOKENは `nonStoredPasswordParam` を使用して保護する | Jenkinsのジョブ設定やビルドログにトークン値が平文で表示されない |
| NFR-004 | WEBHOOK_URLは `nonStoredPasswordParam` を使用して保護する | エンドポイントURLの漏洩を防止 |
| NFR-005 | webhook送信時に認証ヘッダー `X-Webhook-Token` を使用する | Lavable側でリクエストの正当性を検証可能 |

### 3.3 可用性・信頼性要件

| ID | 要件 | 説明 |
|----|------|------|
| NFR-006 | webhook送信失敗時もビルドは継続する | webhook送信は補助的機能であり、本来のビルド処理に影響を与えない |
| NFR-007 | パラメータ未指定時はwebhook送信をスキップする | 既存のワークフローに影響を与えず、オプショナル機能として動作 |
| NFR-008 | リトライは行わない | webhook送信失敗時は1回のみ試行し、失敗をログに記録 |

### 3.4 保守性・拡張性要件

| ID | 要件 | 説明 |
|----|------|------|
| NFR-009 | webhook送信ロジックは共通関数 `sendWebhook()` として実装する | 重複コードを削減し、変更時の影響範囲を限定 |
| NFR-010 | 共通関数は `jenkins/shared/common.groovy` に配置する | 既存の共通関数配置パターンに従う |
| NFR-011 | 有効なレスポンスコードを200-299とする | 標準的なHTTP成功レスポンス範囲 |

---

## 4. 制約事項

### 4.1 技術的制約

| ID | 制約 | 影響 |
|----|------|------|
| TC-001 | HTTP Request Pluginが Jenkins にインストール済みであること | プラグイン未インストール環境ではwebhook送信が動作しない |
| TC-002 | Groovy/Jenkinsfile の構文に従った実装 | 非同期処理や高度なエラーハンドリングに制限がある |
| TC-003 | 既存のJenkinsfile構造を維持する | 大規模な構造変更は避け、`post` ブロックへの追加で対応 |
| TC-004 | `httpRequest` ステップで使用可能なパラメータに限定 | カスタムHTTPクライアント実装は不可 |

### 4.2 リソース制約

| ID | 制約 | 説明 |
|----|------|------|
| RC-001 | 見積もり工数: 9.5〜10.5時間 | Planning Documentで策定 |
| RC-002 | 変更対象: 17ファイル | Job DSL 8 + Jenkinsfile 8 + common.groovy 1 |

### 4.3 ポリシー制約

| ID | 制約 | 説明 |
|----|------|------|
| PC-001 | 既存のパラメータ命名規則に従う | UPPER_SNAKE_CASE を使用 |
| PC-002 | 既存のコードスタイルに従う | インデント、コメント形式、関数命名を統一 |
| PC-003 | セキュリティベストプラクティスに従う | 機密情報は `nonStoredPasswordParam` を使用 |

---

## 5. 前提条件

### 5.1 システム環境

| ID | 前提条件 | 確認方法 |
|----|---------|---------|
| PC-001 | Jenkinsサーバーが稼働していること | Jenkins管理画面アクセス確認 |
| PC-002 | HTTP Request Plugin (version 1.8以上推奨) がインストール済み | Jenkinsプラグイン管理画面で確認 |
| PC-003 | Job DSL Pluginがインストール済み | Seed Jobが実行可能であること |

### 5.2 依存コンポーネント

| ID | 依存コンポーネント | バージョン/条件 |
|----|-------------------|----------------|
| DC-001 | HTTP Request Plugin | 1.8以上推奨 |
| DC-002 | Job DSL Plugin | 既存使用バージョン |
| DC-003 | `jenkins/shared/common.groovy` | 既存モジュール |

### 5.3 外部システム連携

| ID | 外部システム | 連携内容 |
|----|-------------|---------|
| ES-001 | Lavable webhook endpoint | HTTP POST リクエストを受信し、ジョブステータスを処理 |
| ES-002 | Lavable認証システム | `X-Webhook-Token` ヘッダーでリクエストを認証 |

---

## 6. 受け入れ基準

### AC-001: Job DSLパラメータ追加

**Given**: Job DSL Seed Jobが実行可能な状態である
**When**: Seed Jobを実行してジョブ定義を再生成する
**Then**: 全8つのai-workflowジョブに JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが表示される

### AC-002: webhook送信成功（ビルド開始時）

**Given**: JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが正しく指定されている
**When**: Jenkinsジョブを開始する
**Then**: Lavable webhook endpointに `{"job_id": "<JOB_ID>", "status": "running"}` がPOSTされる
**And**: レスポンスコードが200-299の場合、ログに「Webhook sent successfully: running」が出力される

### AC-003: webhook送信成功（ビルド成功時）

**Given**: ジョブが正常に完了する条件が揃っている
**And**: JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが正しく指定されている
**When**: Jenkinsジョブが成功で終了する
**Then**: Lavable webhook endpointに `{"job_id": "<JOB_ID>", "status": "success"}` がPOSTされる
**And**: レスポンスコードが200-299の場合、ログに「Webhook sent successfully: success」が出力される

### AC-004: webhook送信成功（ビルド失敗時）

**Given**: ジョブが失敗する条件がある
**And**: JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが正しく指定されている
**When**: Jenkinsジョブが失敗で終了する
**Then**: Lavable webhook endpointに `{"job_id": "<JOB_ID>", "status": "failed", "error": "<エラーメッセージ>"}` がPOSTされる
**And**: レスポンスコードが200-299の場合、ログに「Webhook sent successfully: failed」が出力される

### AC-005: パラメータ未指定時のスキップ

**Given**: WEBHOOK_URL パラメータが未指定（空欄）である
**When**: Jenkinsジョブを実行する
**Then**: webhook送信は行われない
**And**: ログに「Webhook parameters not provided, skipping notification」が出力される
**And**: ビルドは通常通り実行される

### AC-006: webhook送信失敗時の継続

**Given**: JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータが指定されている
**And**: WEBHOOK_URL が到達不可能なエンドポイントである
**When**: Jenkinsジョブを実行する
**Then**: webhook送信がタイムアウト（30秒）する
**And**: ログに「Failed to send webhook: <エラー詳細>」が出力される
**And**: ビルド全体は失敗せず、本来の処理が継続される

### AC-007: セキュリティ保護

**Given**: WEBHOOK_TOKEN パラメータに機密トークンを入力する
**When**: Jenkinsのビルドログを確認する
**Then**: WEBHOOK_TOKEN の値がログに平文で表示されていない
**And**: ビルド設定画面でも値がマスクされている

### AC-008: 全Jenkinsfileでの動作確認

**Given**: 全8つのJenkinsfileにwebhook呼び出しが追加されている
**When**: 各ジョブを順次実行する
**Then**: 全てのジョブでAC-002〜AC-006の動作が確認できる

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

| ID | 事項 | 理由 |
|----|------|------|
| OOS-001 | Lavable側のwebhook受信エンドポイント実装 | 本Issueの対象外。Lavable側で別途実装が必要 |
| OOS-002 | webhook送信のリトライ機構 | 設計上、リトライは行わない方針 |
| OOS-003 | webhook送信の非同期化 | Groovyの制約により同期送信のみ対応 |
| OOS-004 | 中間ステータス（各ステージ完了時）の通知 | 本Issueでは開始・成功・失敗の3ステータスのみ |
| OOS-005 | HTTP Request Pluginの自動インストール | 前提条件として手動インストールを想定 |
| OOS-006 | webhook URLのバリデーション（フォーマットチェック） | 無効なURL指定時はタイムアウトで処理 |

### 7.2 将来的な拡張候補

| ID | 拡張候補 | 優先度 |
|----|---------|--------|
| FE-001 | 各ステージ完了時の中間ステータス通知 | 中 |
| FE-002 | webhook送信のリトライ機構追加 | 低 |
| FE-003 | カスタムペイロードフィールドの追加（ビルド番号、実行時間等） | 低 |
| FE-004 | 複数webhook URLへの同時送信 | 低 |
| FE-005 | webhook送信結果のメトリクス収集 | 低 |

---

## 8. 用語集

| 用語 | 定義 |
|------|------|
| Lavable | ai-workflowのフロントエンドアプリケーション |
| Job DSL | Jenkinsジョブを定義するためのGroovy DSL |
| HTTP Request Plugin | JenkinsでHTTPリクエストを送信するためのプラグイン |
| nonStoredPasswordParam | Jenkins Job DSLでパスワード/機密情報を保護するパラメータ型 |
| REPOS_ROOT | 作業対象リポジトリを格納する一時ディレクトリ |

---

## 9. 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0 | 初版作成 | AI Workflow |

---

## 品質ゲート（Phase 1）チェックリスト

- [x] **機能要件が明確に記載されている**: FR-001〜FR-010として10個の機能要件を定義
- [x] **受け入れ基準が定義されている**: AC-001〜AC-008として8個の受け入れ基準をGiven-When-Then形式で定義
- [x] **スコープが明確である**: スコープ外（OOS-001〜OOS-006）と将来拡張候補（FE-001〜FE-005）を明記
- [x] **論理的な矛盾がない**: 各セクション間の整合性を確認済み
