# 詳細設計書: Issue #505

## Jenkins Pipelineからのwebhook送信機能を追加してジョブ実行状況をLavableに通知

---

## 0. Planning Documentの確認

### 開発計画の要約

- **複雑度**: 中程度（計17ファイルの変更、パターン化された作業）
- **見積もり工数**: 9.5〜10.5時間
- **リスク評価**: 低（既存パターンに沿った拡張、失敗時はビルドを失敗させない設計）
- **実装戦略**: EXTEND（既存コードの拡張が中心）
- **テスト戦略**: INTEGRATION_ONLY（外部システム連携が中心）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Jenkins Server                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Job DSL Definitions                         │    │
│  │  (8 files: ai_workflow_*_job.groovy)                            │    │
│  │                                                                  │    │
│  │  Parameters:                                                     │    │
│  │  - JOB_ID (string)                                              │    │
│  │  - WEBHOOK_URL (nonStoredPasswordParam)                         │    │
│  │  - WEBHOOK_TOKEN (nonStoredPasswordParam)                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Jenkinsfiles (8 files)                      │    │
│  │                                                                  │    │
│  │  stages:                                                         │    │
│  │    [Load Common Library] ─────────────────┐                      │    │
│  │           │                                │                      │    │
│  │           ▼                                ▼                      │    │
│  │    [sendWebhook: running] ◄──── common.groovy                    │    │
│  │           │                       (sendWebhook function)         │    │
│  │           ▼                                                      │    │
│  │    [Execute Pipeline]                                            │    │
│  │           │                                                      │    │
│  │           ▼                                                      │    │
│  │  post:                                                           │    │
│  │    success: [sendWebhook: success]                               │    │
│  │    failure: [sendWebhook: failed + error]                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
                               ▼ HTTP POST (JSON)
┌──────────────────────────────────────────────────────────────────────────┐
│                         Lavable Frontend                                  │
│                                                                          │
│  Webhook Endpoint: ${WEBHOOK_URL}                                        │
│  Authentication: X-Webhook-Token: ${WEBHOOK_TOKEN}                       │
│                                                                          │
│  Request Body:                                                           │
│  - { "job_id": "<JOB_ID>", "status": "running" }                        │
│  - { "job_id": "<JOB_ID>", "status": "success" }                        │
│  - { "job_id": "<JOB_ID>", "status": "failed", "error": "<msg>" }       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────────────────┐
│                         変更対象コンポーネント                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  jenkins/shared/common.groovy                                       │
│  └─ sendWebhook() [NEW]                                             │
│       │                                                             │
│       ├──◄── jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile       │
│       │       (8 Jenkinsfiles call sendWebhook)                     │
│       │                                                             │
│  jenkins/jobs/dsl/ai-workflow/ai_workflow_*_job.groovy             │
│  └─ parameters: JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN [NEW]            │
│       (8 Job DSL files define parameters)                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 データフロー

```
1. ジョブ開始時
   params.JOB_ID ─────┐
   params.WEBHOOK_URL ├──► sendWebhook(jobId, url, token, "running")
   params.WEBHOOK_TOKEN┘              │
                                      ▼
                          HTTP POST to WEBHOOK_URL
                          Headers: X-Webhook-Token
                          Body: {"job_id":"...", "status":"running"}

2. ビルド成功時 (post.success)
   params.* ──────────────► sendWebhook(..., "success")
                                      │
                                      ▼
                          Body: {"job_id":"...", "status":"success"}

3. ビルド失敗時 (post.failure)
   params.* ──────────────► sendWebhook(..., "failed", errorMsg)
   currentBuild.result ────┘          │
                                      ▼
                          Body: {"job_id":"...", "status":"failed", "error":"..."}
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- 既存の`jenkins/shared/common.groovy`に新規関数`sendWebhook()`を追加する拡張作業
- 既存の8つのJob DSL定義ファイルにパラメータ定義を追加
- 既存の8つのJenkinsfileに`sendWebhook()`呼び出しを追加
- 新規ファイルの作成は不要（テストファイルを除く）
- 既存のアーキテクチャ・パターンを完全に踏襲
- CREATE（新規作成）は不適切: 既存コードへの統合が必須
- REFACTOR（リファクタリング）は不適切: 構造改善ではなく機能追加

---

## 3. テスト戦略判断

### テスト戦略: INTEGRATION_ONLY

**判断根拠**:
- **外部システム連携が中心**: HTTP Request Plugin経由でのwebhook送信が主機能
- **Jenkins Pipeline特性**: Groovy Jenkinsfileのテストは統合テストが主流
- **ユニットテスト不適**:
  - `httpRequest`ステップはJenkins環境でのみ動作
  - Groovyスクリプトの単体テストは複雑で費用対効果が低い
- **BDD不適**: エンドユーザー向け機能ではなくシステム間連携
- **検証項目**:
  - webhook送信成功時の動作確認
  - webhook送信失敗時のエラーハンドリング確認
  - パラメータ未指定時のスキップ動作確認

---

## 4. テストコード戦略判断

### テストコード戦略: CREATE_TEST

**判断根拠**:
- `sendWebhook()`関数は完全新規実装
- `jenkins/shared/common.groovy`に対する既存テストファイルは存在しない
- 新規テストファイル`tests/integration/jenkins/webhook-test.groovy`を作成
- EXTEND_TESTは不適: 拡張すべき既存テストがない
- BOTH_TESTは不適: 既存テストがないため拡張対象なし

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

| 影響カテゴリ | 詳細 | リスク |
|------------|------|--------|
| **機能影響** | webhook送信はオプショナル機能（パラメータ未指定時はスキップ） | 低 |
| **パフォーマンス影響** | 最大30秒のタイムアウト（ただし失敗時も継続） | 低 |
| **後方互換性** | 完全互換（既存パラメータはそのまま、新パラメータはオプショナル） | なし |
| **既存テスト影響** | なし（Jenkinsfileに対する自動テストは未整備） | なし |

### 5.2 依存関係の変更

#### 新規依存の追加

| 依存コンポーネント | バージョン | 必要性 | 未インストール時の動作 |
|------------------|-----------|--------|----------------------|
| HTTP Request Plugin | 1.8以上推奨 | 必須 | `httpRequest`ステップがエラー |

#### 既存依存への影響
- なし（既存のJob DSL Plugin、Pipeline Pluginへの影響なし）

### 5.3 マイグレーション要否

| 項目 | 要否 | 詳細 |
|------|------|------|
| データベーススキーマ変更 | 不要 | - |
| 設定ファイル変更 | 不要 | - |
| Jenkins側作業 | **要** | Job DSL更新後、Seed Job実行でジョブ定義を再生成 |
| プラグインインストール | **要** | HTTP Request Pluginが未インストールの場合 |

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

| ファイルパス | 目的 |
|-------------|------|
| `tests/integration/jenkins/webhook-test.groovy` | sendWebhook関数の統合テスト |

### 6.2 修正が必要な既存ファイル

#### 共通モジュール（1ファイル）

| ファイルパス | 変更内容 |
|-------------|---------|
| `jenkins/shared/common.groovy` | `sendWebhook()`関数を末尾に追加 |

#### Job DSL定義ファイル（8ファイル）

| ファイルパス | 変更内容 |
|-------------|---------|
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy` | JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN パラメータ追加 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy` | 同上 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy` | 同上 |

#### Jenkinsfile（8ファイル）

| ファイルパス | 変更内容 |
|-------------|---------|
| `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` | sendWebhook呼び出し追加（開始/成功/失敗） |
| `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` | 同上 |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` | 同上 |

#### ドキュメント（1ファイル）

| ファイルパス | 変更内容 |
|-------------|---------|
| `jenkins/README.md` | webhook機能のセクション追加、新規パラメータの説明 |

### 6.3 削除が必要なファイル

- なし

---

## 7. 詳細設計

### 7.1 sendWebhook関数設計

#### 関数シグネチャ

```groovy
/**
 * Webhook通知を送信する共通関数
 *
 * @param jobId Lavable Job ID（JOB_IDパラメータ値）
 * @param webhookUrl Webhookエンドポイント URL（WEBHOOK_URLパラメータ値）
 * @param webhookToken Webhook認証トークン（WEBHOOK_TOKENパラメータ値）
 * @param status ジョブステータス（"running" | "success" | "failed"）
 * @param errorMessage エラーメッセージ（status="failed"時のみ使用、デフォルト: ''）
 */
def sendWebhook(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = '')
```

#### 実装詳細

```groovy
def sendWebhook(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = '') {
    // 1. パラメータ検証: 必須パラメータが未指定の場合はスキップ
    if (!webhookUrl?.trim() || !webhookToken?.trim() || !jobId?.trim()) {
        echo "Webhook parameters not provided, skipping notification"
        return
    }

    // 2. リクエストボディ構築
    def requestBody = errorMessage?.trim()
        ? """{"job_id": "${jobId}", "status": "${status}", "error": "${errorMessage}"}"""
        : """{"job_id": "${jobId}", "status": "${status}"}"""

    // 3. HTTP Request送信（try-catchでエラーを捕捉）
    try {
        httpRequest(
            url: webhookUrl,
            httpMode: 'POST',
            contentType: 'APPLICATION_JSON',
            customHeaders: [[name: 'X-Webhook-Token', value: webhookToken]],
            requestBody: requestBody,
            validResponseCodes: '200:299',
            timeout: 30
        )
        echo "Webhook sent successfully: ${status}"
    } catch (Exception e) {
        // 4. エラー時はログ出力のみでビルドを継続
        echo "Failed to send webhook: ${e.message}"
    }
}
```

#### 処理フロー図

```
sendWebhook()
    │
    ▼
┌─────────────────────────────────┐
│ パラメータ検証                    │
│ (jobId, webhookUrl, webhookToken)│
└─────────────────────────────────┘
    │
    ├──[いずれか未指定]──► "skipping notification" ──► return
    │
    ▼ [すべて指定]
┌─────────────────────────────────┐
│ リクエストボディ構築              │
│ - errorMessage有: {job_id,      │
│                    status, error}│
│ - errorMessage無: {job_id,      │
│                    status}       │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ httpRequest() 実行              │
│ - POST ${webhookUrl}            │
│ - Header: X-Webhook-Token       │
│ - Body: JSON                    │
│ - Timeout: 30s                  │
│ - ValidCodes: 200-299           │
└─────────────────────────────────┘
    │
    ├──[成功]──► "Webhook sent successfully: ${status}"
    │
    └──[例外]──► "Failed to send webhook: ${e.message}"
                 (ビルドは継続)
```

### 7.2 Job DSLパラメータ設計

#### パラメータ仕様

| パラメータ名 | 型 | 説明 | デフォルト | 必須 |
|-------------|-----|------|-----------|------|
| JOB_ID | string | Lavable Job ID | '' | 任意 |
| WEBHOOK_URL | nonStoredPasswordParam | Webhookエンドポイント URL | '' | 任意 |
| WEBHOOK_TOKEN | nonStoredPasswordParam | Webhook認証トークン | '' | 任意 |

#### 追加位置

既存のパラメータ定義の末尾（`LOG_LEVEL`の後）に追加:

```groovy
parameters {
    // ... 既存パラメータ ...

    choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR'], '''
ログレベル
    '''.stripIndent().trim())

    // ========================================
    // Webhook通知設定
    // ========================================
    stringParam('JOB_ID', '', '''
Lavable Job ID（任意）

ジョブ実行状況をLavableに通知する際のジョブ識別子。
WEBHOOK_URL, WEBHOOK_TOKEN と合わせて指定してください。
    '''.stripIndent().trim())

    nonStoredPasswordParam('WEBHOOK_URL', '''
Webhookエンドポイント URL（任意）

Lavableの通知受信エンドポイント。
HTTPSプロトコルを推奨します。
    '''.stripIndent().trim())

    nonStoredPasswordParam('WEBHOOK_TOKEN', '''
Webhook認証トークン（任意）

X-Webhook-Tokenヘッダーとして送信されます。
    '''.stripIndent().trim())
}
```

### 7.3 Jenkinsfileへの組み込み設計

#### 変更パターン

各Jenkinsfileに以下の変更を加える:

##### 1. ビルド開始時の通知（Load Common Library直後）

```groovy
stage('Load Common Library') {
    steps {
        script {
            // ... 既存コード ...
            common = load 'jenkins/shared/common.groovy'
            echo "Common library loaded successfully"

            // [NEW] Webhook通知: ビルド開始
            common.sendWebhook(
                params.JOB_ID,
                params.WEBHOOK_URL,
                params.WEBHOOK_TOKEN,
                'running'
            )
        }
    }
}
```

##### 2. 成功時の通知（post.success）

```groovy
success {
    script {
        echo "========================================="
        echo "✅ AI Workflow - [Mode] Success"
        echo "========================================="
        // ... 既存コード ...

        // [NEW] Webhook通知: 成功
        common.sendWebhook(
            params.JOB_ID,
            params.WEBHOOK_URL,
            params.WEBHOOK_TOKEN,
            'success'
        )
    }
}
```

##### 3. 失敗時の通知（post.failure）

```groovy
failure {
    script {
        echo "========================================="
        echo "❌ AI Workflow - [Mode] Failure"
        echo "========================================="
        // ... 既存コード ...

        // [NEW] Webhook通知: 失敗
        def errorMessage = currentBuild.result ?: 'Build failed'
        common.sendWebhook(
            params.JOB_ID,
            params.WEBHOOK_URL,
            params.WEBHOOK_TOKEN,
            'failed',
            errorMessage
        )
    }
}
```

#### Jenkinsfile別考慮事項

| Jenkinsfile | 特記事項 |
|-------------|---------|
| all-phases/Jenkinsfile | 標準パターン適用 |
| preset/Jenkinsfile | 標準パターン適用 |
| single-phase/Jenkinsfile | 標準パターン適用 |
| rollback/Jenkinsfile | 標準パターン適用 |
| auto-issue/Jenkinsfile | 標準パターン適用 |
| finalize/Jenkinsfile | 標準パターン適用 |
| pr-comment-execute/Jenkinsfile | 標準パターン適用 |
| pr-comment-finalize/Jenkinsfile | `prepareAgentCredentials`ステージなし。Load Common Library直後に通知 |

### 7.4 データ構造設計

#### Webhookリクエストボディ

##### running / success

```json
{
    "job_id": "<JOB_ID>",
    "status": "running" | "success"
}
```

##### failed

```json
{
    "job_id": "<JOB_ID>",
    "status": "failed",
    "error": "<エラーメッセージ>"
}
```

#### HTTPリクエスト仕様

| 項目 | 値 |
|------|-----|
| Method | POST |
| Content-Type | application/json |
| Custom Header | X-Webhook-Token: ${WEBHOOK_TOKEN} |
| Timeout | 30秒 |
| Valid Response Codes | 200-299 |

### 7.5 インターフェース設計

#### sendWebhook関数インターフェース

```
Input:
  - jobId: String (required for sending, but function handles null/empty)
  - webhookUrl: String (required for sending)
  - webhookToken: String (required for sending)
  - status: String ("running" | "success" | "failed")
  - errorMessage: String (optional, default: '')

Output:
  - void (no return value)

Side Effects:
  - HTTP POST to webhookUrl (if parameters valid)
  - echo log message (always)

Error Handling:
  - Parameters missing: skip with log message
  - HTTP error: catch exception, log error, continue build
```

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

| 対策 | 詳細 |
|------|------|
| **トークン保護** | `nonStoredPasswordParam`を使用し、ビルドログやジョブ設定に平文表示されない |
| **URL保護** | `WEBHOOK_URL`も`nonStoredPasswordParam`としてエンドポイント漏洩を防止 |
| **ヘッダー認証** | `X-Webhook-Token`ヘッダーでLavable側がリクエストの正当性を検証可能 |

### 8.2 データ保護

| 対策 | 詳細 |
|------|------|
| **最小限のデータ送信** | job_id, status, error のみ送信。機密情報は含まない |
| **HTTPS推奨** | ドキュメントでHTTPSプロトコルの使用を推奨 |

### 8.3 セキュリティリスクと対策

| リスク | 対策 |
|--------|------|
| **トークン漏洩** | `nonStoredPasswordParam`使用でビルドXMLに保存されない |
| **中間者攻撃** | HTTPS使用を推奨（ドキュメントに記載） |
| **不正リクエスト** | X-Webhook-Tokenヘッダーによる認証（Lavable側で検証） |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

| 項目 | 対応 |
|------|------|
| **タイムアウト設定** | 30秒（HTTP Request Pluginデフォルト） |
| **ビルド時間影響** | 最大90秒（3回のwebhook送信 × 30秒タイムアウト）、ただし通常は1秒未満 |
| **非同期化** | Groovyの制約により同期送信。ただし失敗時も継続するため影響は限定的 |

### 9.2 スケーラビリティ

| 項目 | 対応 |
|------|------|
| **同時実行** | webhook送信は各ビルドで独立して実行 |
| **Lavable側負荷** | 1ビルドあたり最大3回のリクエスト（開始/成功or失敗） |

### 9.3 保守性

| 項目 | 対応 |
|------|------|
| **共通関数化** | `sendWebhook()`を`common.groovy`に集約し、変更時の影響範囲を限定 |
| **ログ出力** | 成功/失敗/スキップ時にログを出力し、トラブルシューティングを容易化 |
| **コードスタイル** | 既存の`common.groovy`関数パターンに準拠 |

### 9.4 可用性

| 項目 | 対応 |
|------|------|
| **障害耐性** | webhook送信失敗時もビルドを継続 |
| **オプショナル機能** | パラメータ未指定時はスキップし、既存ワークフローに影響なし |
| **リトライなし** | 設計方針として1回のみ試行（失敗時はログ記録のみ） |

---

## 10. 実装の順序

### 推奨実装順序

```
Phase 1: 共通関数実装
└─► Task 1: common.groovy に sendWebhook() 追加

Phase 2: Job DSLパラメータ追加（並列実行可能）
├─► Task 2a: ai_workflow_all_phases_job.groovy
├─► Task 2b: ai_workflow_preset_job.groovy
├─► Task 2c: ai_workflow_single_phase_job.groovy
├─► Task 2d: ai_workflow_rollback_job.groovy
├─► Task 2e: ai_workflow_auto_issue_job.groovy
├─► Task 2f: ai_workflow_finalize_job.groovy
├─► Task 2g: ai_workflow_pr_comment_execute_job.groovy
└─► Task 2h: ai_workflow_pr_comment_finalize_job.groovy

Phase 3: Jenkinsfile更新（Phase 1完了後）
├─► Task 3a: all-phases/Jenkinsfile
├─► Task 3b: preset/Jenkinsfile
├─► Task 3c: single-phase/Jenkinsfile
├─► Task 3d: rollback/Jenkinsfile
├─► Task 3e: auto-issue/Jenkinsfile
├─► Task 3f: finalize/Jenkinsfile
├─► Task 3g: pr-comment-execute/Jenkinsfile
└─► Task 3h: pr-comment-finalize/Jenkinsfile

Phase 4: テスト実装
└─► Task 4: tests/integration/jenkins/webhook-test.groovy 作成

Phase 5: ドキュメント更新
└─► Task 5: jenkins/README.md 更新
```

### 依存関係

```
common.groovy (sendWebhook)
    ▲
    │ depends on
    │
Jenkinsfile (sendWebhook呼び出し)
    │
    │ parallel with
    ▼
Job DSL (パラメータ定義)
```

- **Phase 1 → Phase 3**: sendWebhook関数がないとJenkinsfileで呼び出せない
- **Phase 2とPhase 3**: 並列実行可能（パラメータ定義と関数呼び出しは独立）
- **Phase 4**: Phase 1完了後に実施可能
- **Phase 5**: 全実装完了後に実施

---

## 11. 品質ゲートチェックリスト

### 設計フェーズ（Phase 2）品質ゲート

- [x] **実装戦略の判断根拠が明記されている**: EXTEND（既存コードの拡張）
- [x] **テスト戦略の判断根拠が明記されている**: INTEGRATION_ONLY（外部システム連携が中心）
- [x] **テストコード戦略の判断根拠が明記されている**: CREATE_TEST（新規テストファイル作成）
- [x] **既存コードへの影響範囲が分析されている**: 17ファイルの変更、後方互換性あり
- [x] **変更が必要なファイルがリストアップされている**: 新規1ファイル、修正17ファイル
- [x] **設計が実装可能である**: 全て標準的なJenkins Pipeline/Job DSLパターンに準拠

---

## 12. 補足情報

### 12.1 Issueとの差異

Planning Documentで特定された通り、Issue記載のファイルパスと実際のパスが異なります:

| Issue記載パス | 実際のパス |
|--------------|-----------|
| `jenkins/Jenkinsfile.all-phases` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `jenkins/Jenkinsfile.preset` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `jenkins/Jenkinsfile.single-phase` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `jenkins/Jenkinsfile.rollback` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `jenkins/Jenkinsfile.auto-issue` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

また、対象Jenkinsfileは7つではなく8つ（`finalize/Jenkinsfile`が追加対象）。

### 12.2 既存common.groovy関数一覧

| 関数名 | 説明 |
|--------|------|
| `prepareAgentCredentials()` | エージェント実行に必要な認証情報を準備 |
| `prepareCodexAuthFile()` | CODEX_AUTH_JSONから一時的なauth.jsonを展開 |
| `setupEnvironment()` | REPOS_ROOT準備と対象リポジトリのクローン |
| `setupNodeEnvironment()` | Node.js環境確認とnpm install & build実行 |
| `archiveArtifacts(issueNumber)` | ワークフロー成果物のアーカイブ |
| `sendWebhook(...)` | **[NEW]** Webhook通知を送信 |

### 12.3 HTTP Request Pluginの使用パターン

```groovy
httpRequest(
    url: webhookUrl,
    httpMode: 'POST',
    contentType: 'APPLICATION_JSON',
    customHeaders: [[name: 'X-Webhook-Token', value: webhookToken]],
    requestBody: requestBody,
    validResponseCodes: '200:299',
    timeout: 30
)
```

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0 | 初版作成 | AI Workflow |
