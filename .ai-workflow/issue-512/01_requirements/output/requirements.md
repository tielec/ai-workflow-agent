# 要件定義書: Issue #512

## Jenkins Webhook仕様に合わせてペイロードを拡張（build_url, branch_name, pr_url等を追加）

---

## 0. Planning Documentの確認

### 開発計画の概要

| 項目 | 内容 |
|------|------|
| **実装戦略** | EXTEND（既存の`sendWebhook()`関数を拡張） |
| **テスト戦略** | INTEGRATION_ONLY（Jenkinsパイプラインの静的解析テスト） |
| **テストコード戦略** | EXTEND_TEST（既存テストに新規テストケースを追加） |
| **複雑度** | 中程度 |
| **見積もり工数** | 8〜12時間 |
| **リスクレベル** | 低 |

### 影響範囲

- **対象ファイル**: 10ファイル
  - `jenkins/shared/common.groovy`（共通モジュール）
  - 8つのJenkinsfile
  - `tests/integration/jenkins/webhook-notifications.test.ts`（テスト）
  - `jenkins/README.md`（ドキュメント）

### 技術的決定事項

1. **シグネチャ変更**: 位置引数（5つ）からMap型config引数へ移行
2. **後方互換性**: 全Jenkinsfileを同時更新することで整合性を確保
3. **オプショナルフィールド**: 存在する場合のみペイロードに追加

---

## 1. 概要

### 1.1 背景

Issue #505で基本的なwebhook送信機能が実装され、DevLoop Runner（Lovable）へのジョブステータス通知が可能になった。しかし、DevLoop RunnerのWebhook仕様が更新され、より詳細な情報（ビルドURL、ブランチ名、PR URL、完了日時、ログURL）が必要になった。

### 1.2 目的

既存のwebhook送信機能を拡張し、DevLoop Runnerが必要とする追加フィールドを送信可能にする。これにより、DevLoop Runner側でより詳細なビルド情報を表示・活用できるようになる。

### 1.3 ビジネス価値

| 価値 | 説明 |
|------|------|
| **可視性の向上** | ビルドURL・ログURLにより、DevLoop RunnerからJenkinsビルドへの直接アクセスが可能 |
| **トレーサビリティ** | ブランチ名・PR URLにより、コード変更との紐付けが明確化 |
| **監査対応** | 完了日時のタイムスタンプにより、ビルド履歴の正確な記録が可能 |

### 1.4 技術的価値

| 価値 | 説明 |
|------|------|
| **拡張性** | Map型引数への移行により、将来のフィールド追加が容易 |
| **保守性** | 共通モジュール化による一元管理の継続 |
| **整合性** | 全Jenkinsfileで統一された呼び出しパターン |

---

## 2. 機能要件

### 2.1 sendWebhook()関数の拡張

#### FR-001: Map型config引数への移行
- **優先度**: 高
- **説明**: 現在の位置引数（5つ）をMap型config引数に変更する
- **現状の実装**:
  ```groovy
  def sendWebhook(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = '')
  ```
- **変更後の実装**:
  ```groovy
  def sendWebhook(Map config)
  ```

#### FR-002: 新規フィールド「build_url」の追加
- **優先度**: 高
- **説明**: JenkinsのビルドURLをペイロードに追加する
- **型**: String
- **必須**: No（オプショナル）
- **値の取得元**: `env.BUILD_URL`
- **送信タイミング**: 全ステータス（running, success, failed）
- **例**: `http://jenkins.example.com/job/devloop/123/`

#### FR-003: 新規フィールド「branch_name」の追加
- **優先度**: 高
- **説明**: 作業ブランチ名をペイロードに追加する
- **型**: String
- **必須**: No（オプショナル）
- **値の取得元**: `env.BRANCH_NAME`または該当するパイプライン変数
- **送信タイミング**: running, success
- **例**: `ai-workflow/issue-505`

#### FR-004: 新規フィールド「pr_url」の追加
- **優先度**: 高
- **説明**: 作成されたPull RequestのURLをペイロードに追加する
- **型**: String
- **必須**: No（オプショナル）
- **値の取得元**: `.ai-workflow/issue-{ISSUE_NUMBER}/metadata.json`の`pr_url`フィールド（jqコマンドで取得）
- **送信タイミング**: successのみ
- **例**: `https://github.com/owner/repo/pull/456`

#### FR-005: 新規フィールド「finished_at」の追加
- **優先度**: 高
- **説明**: ビルド完了日時をペイロードに追加する
- **型**: String（ISO 8601形式）
- **必須**: No（オプショナル）
- **フォーマット**: `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`
- **タイムゾーン**: UTC
- **送信タイミング**: success, failed
- **例**: `2025-12-25T04:41:18.000Z`

#### FR-006: 新規フィールド「logs_url」の追加
- **優先度**: 高
- **説明**: ビルドログのURLをペイロードに追加する
- **型**: String
- **必須**: No（オプショナル）
- **値の取得元**: `${env.BUILD_URL}console`
- **送信タイミング**: success, failed
- **例**: `http://jenkins.example.com/job/devloop/123/console`

#### FR-007: オプショナルフィールドの条件付き追加
- **優先度**: 高
- **説明**: 各オプショナルフィールドは値が存在する場合のみペイロードに追加する
- **条件**: 値がnullまたは空文字列の場合はペイロードに含めない
- **ロジック**:
  ```groovy
  if (config.buildUrl) payload.build_url = config.buildUrl
  if (config.branchName) payload.branch_name = config.branchName
  if (config.prUrl) payload.pr_url = config.prUrl
  if (config.finishedAt) payload.finished_at = config.finishedAt
  if (config.logsUrl) payload.logs_url = config.logsUrl
  ```

#### FR-008: 既存フィールドの維持
- **優先度**: 高
- **説明**: 既存のフィールド（job_id, status, error）は引き続き送信する
- **既存フィールド**:
  - `job_id`: 必須（ジョブ識別子）
  - `status`: 必須（running, success, failed）
  - `error`: オプショナル（failedステータス時のエラーメッセージ）

### 2.2 Jenkinsfileの更新

#### FR-009: 全Jenkinsfileでのwebhook呼び出し更新
- **優先度**: 高
- **説明**: 8つのJenkinsfileすべてで新しい呼び出しパターンを適用する
- **対象ファイル**:
  1. `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
  2. `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
  3. `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
  4. `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
  5. `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile`
  6. `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`
  7. `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile`
  8. `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile`

#### FR-010: runningステータス時の呼び出しパターン
- **優先度**: 高
- **説明**: ビルド開始時に適切なフィールドを送信する
- **送信フィールド**: job_id, status, build_url, branch_name
- **呼び出し例**:
  ```groovy
  common.sendWebhook([
      webhookUrl: params.WEBHOOK_URL,
      webhookToken: params.WEBHOOK_TOKEN,
      jobId: params.JOB_ID,
      status: 'running',
      buildUrl: env.BUILD_URL,
      branchName: env.BRANCH_NAME
  ])
  ```

#### FR-011: successステータス時の呼び出しパターン
- **優先度**: 高
- **説明**: ビルド成功時に適切なフィールドを送信する
- **送信フィールド**: job_id, status, build_url, branch_name, pr_url, finished_at, logs_url
- **PR URL取得**: metadata.jsonからjqコマンドで取得
- **呼び出し例**:
  ```groovy
  def prUrl = sh(
      script: "cat .ai-workflow/issue-${ISSUE_NUMBER}/metadata.json | jq -r '.pr_url // empty'",
      returnStdout: true
  ).trim()

  common.sendWebhook([
      webhookUrl: params.WEBHOOK_URL,
      webhookToken: params.WEBHOOK_TOKEN,
      jobId: params.JOB_ID,
      status: 'success',
      buildUrl: env.BUILD_URL,
      branchName: env.BRANCH_NAME,
      prUrl: prUrl,
      finishedAt: new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", TimeZone.getTimeZone('UTC')),
      logsUrl: "${env.BUILD_URL}console"
  ])
  ```

#### FR-012: failedステータス時の呼び出しパターン
- **優先度**: 高
- **説明**: ビルド失敗時に適切なフィールドを送信する
- **送信フィールド**: job_id, status, error, build_url, finished_at, logs_url
- **注意**: branch_nameとpr_urlは送信しない（失敗時は不要）
- **呼び出し例**:
  ```groovy
  def errorMessage = currentBuild.result ?: 'Build failed'
  common.sendWebhook([
      webhookUrl: params.WEBHOOK_URL,
      webhookToken: params.WEBHOOK_TOKEN,
      jobId: params.JOB_ID,
      status: 'failed',
      errorMessage: errorMessage,
      buildUrl: env.BUILD_URL,
      finishedAt: new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", TimeZone.getTimeZone('UTC')),
      logsUrl: "${env.BUILD_URL}console"
  ])
  ```

### 2.3 テストの拡張

#### FR-013: 統合テストの追加
- **優先度**: 中
- **説明**: 新規フィールドの検証テストを追加する
- **対象ファイル**: `tests/integration/jenkins/webhook-notifications.test.ts`
- **新規テストシナリオ**: IT-019〜（既存IT-001〜IT-018に追加）

### 2.4 ドキュメントの更新

#### FR-014: READMEの更新
- **優先度**: 低
- **説明**: jenkins/README.mdに新規フィールドの説明を追加する
- **追加内容**:
  - 新規Webhookフィールドの説明
  - 各ステータスでの送信フィールド一覧表
  - 更新された使用例

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

#### NFR-001: Webhookタイムアウト
- **要件**: webhook送信のタイムアウトは30秒以内とする
- **根拠**: 既存実装で設定済み（変更なし）

#### NFR-002: ビルドへの影響最小化
- **要件**: webhook送信処理がビルド全体の実行時間に与える影響は無視できる程度とする
- **目標**: 各webhook送信は通常1秒以内に完了

### 3.2 セキュリティ要件

#### NFR-003: 認証情報の保護
- **要件**: WEBHOOK_URLとWEBHOOK_TOKENはnonStoredPasswordParamを使用し、ビルド履歴に保存されないこと
- **根拠**: 既存実装で対応済み（変更なし）

#### NFR-004: 認証トークンのヘッダー送信
- **要件**: WEBHOOK_TOKENは`X-Webhook-Token`ヘッダーで送信すること
- **根拠**: 既存実装で対応済み（変更なし）

### 3.3 可用性・信頼性要件

#### NFR-005: Webhook送信失敗時のビルド継続
- **要件**: webhook送信が失敗してもビルド全体は失敗させないこと
- **実装**: try-catchでエラーをキャッチし、ログ出力のみで処理を継続
- **根拠**: 既存実装で対応済み（変更なし）

#### NFR-006: パラメータ未指定時のスキップ
- **要件**: webhookUrl, webhookToken, jobIdのいずれかが未指定の場合、webhook送信をスキップすること
- **実装**: パラメータ検証後、ログ出力して早期リターン
- **根拠**: 既存実装で対応済み（変更なし）

### 3.4 保守性・拡張性要件

#### NFR-007: Map型引数による拡張性確保
- **要件**: 将来のフィールド追加が容易な設計とする
- **実装**: Map型config引数により、新規フィールド追加時もシグネチャ変更不要

#### NFR-008: JSON生成の安全性
- **要件**: ペイロードのJSON生成は安全かつ正確に行うこと
- **実装**: `groovy.json.JsonOutput.toJson()`を使用し、手動での文字列連結を避ける

---

## 4. 制約事項

### 4.1 技術的制約

#### TC-001: Jenkins HTTP Request Plugin依存
- **制約**: HTTP Request Pluginがインストールされていることが前提
- **影響**: プラグイン未インストール環境では動作しない
- **対策**: READMEに前提条件として明記済み

#### TC-002: Groovyランタイム依存
- **制約**: sendWebhook()関数はJenkins Groovyランタイム内でのみ実行可能
- **影響**: 単体テストは困難、静的解析テストで対応

#### TC-003: jqコマンド依存
- **制約**: PR URL取得にjqコマンドを使用
- **影響**: jq未インストール環境では PR URLを取得できない
- **対策**: `// empty`フォールバックで空文字列を返す

### 4.2 リソース制約

#### RC-001: 実装工数
- **制約**: 8〜12時間の工数制限
- **影響**: 機能範囲を限定

### 4.3 ポリシー制約

#### PC-001: 後方互換性の維持
- **制約**: 既存のwebhook機能を破壊しないこと
- **対策**: 全Jenkinsfileを同時更新し整合性を確保

#### PC-002: 既存テストの継続成功
- **制約**: 既存テスト（IT-001〜IT-018）が引き続き成功すること
- **対策**: テスト拡張時に既存テストへの影響を最小化

---

## 5. 前提条件

### 5.1 システム環境

| 前提条件 | 説明 |
|---------|------|
| Jenkins | バージョン2.x以上 |
| HTTP Request Plugin | インストール済み |
| Groovyランタイム | Jenkins標準搭載 |
| jqコマンド | Jenkinsエージェントにインストール済み |

### 5.2 依存コンポーネント

| コンポーネント | 説明 |
|--------------|------|
| common.groovy | 共通Groovyライブラリ（本変更対象） |
| Job DSLパラメータ | JOB_ID, WEBHOOK_URL, WEBHOOK_TOKEN（既存、変更なし） |
| metadata.json | PR URL格納ファイル（既存） |

### 5.3 外部システム連携

| システム | 連携方法 |
|---------|---------|
| DevLoop Runner（Lovable） | HTTPS POST webhook（X-Webhook-Token認証） |

---

## 6. 受け入れ基準

### AC-001: sendWebhook()関数のMap型引数対応

**Given**: common.groovyのsendWebhook()関数が存在する
**When**: Map型config引数で呼び出す
**Then**: 正しくペイロードが構築され、webhookが送信される

**検証方法**: 静的コード解析（関数シグネチャの確認）

### AC-002: build_urlフィールドの送信

**Given**: buildUrl パラメータが指定されている
**When**: sendWebhook()を呼び出す
**Then**: ペイロードに`build_url`フィールドが含まれる

**検証方法**: 静的コード解析（ペイロード構築ロジックの確認）

### AC-003: branch_nameフィールドの送信

**Given**: branchName パラメータが指定されている
**When**: sendWebhook()を呼び出す（status: running または success）
**Then**: ペイロードに`branch_name`フィールドが含まれる

**検証方法**: 静的コード解析

### AC-004: pr_urlフィールドの送信

**Given**: prUrl パラメータが指定されている
**When**: sendWebhook()を呼び出す（status: success）
**Then**: ペイロードに`pr_url`フィールドが含まれる

**検証方法**: 静的コード解析

### AC-005: finished_atフィールドの送信

**Given**: finishedAt パラメータが指定されている
**When**: sendWebhook()を呼び出す（status: success または failed）
**Then**: ペイロードに`finished_at`フィールドがISO 8601形式で含まれる

**検証方法**: 静的コード解析 + 正規表現マッチング（`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`）

### AC-006: logs_urlフィールドの送信

**Given**: logsUrl パラメータが指定されている
**When**: sendWebhook()を呼び出す（status: success または failed）
**Then**: ペイロードに`logs_url`フィールドが含まれる

**検証方法**: 静的コード解析

### AC-007: オプショナルフィールドの条件付き追加

**Given**: オプショナルフィールドの値がnullまたは空文字列
**When**: sendWebhook()を呼び出す
**Then**: そのフィールドはペイロードに含まれない

**検証方法**: 静的コード解析（条件分岐の確認）

### AC-008: 全Jenkinsfileでの新呼び出しパターン適用

**Given**: 8つのJenkinsfileが存在する
**When**: 各Jenkinsfileを確認する
**Then**: すべてで新しいMap型呼び出しパターンが使用されている

**検証方法**: 静的コード解析（パターンマッチング）

### AC-009: runningステータスでの適切なフィールド送信

**Given**: Jenkinsfileのビルド開始ステージ
**When**: sendWebhook()を'running'ステータスで呼び出す
**Then**: job_id, status, build_url, branch_nameが送信される

**検証方法**: 静的コード解析

### AC-010: successステータスでの適切なフィールド送信

**Given**: Jenkinsfileのpost.successブロック
**When**: sendWebhook()を'success'ステータスで呼び出す
**Then**: job_id, status, build_url, branch_name, pr_url, finished_at, logs_urlが送信される

**検証方法**: 静的コード解析

### AC-011: failedステータスでの適切なフィールド送信

**Given**: Jenkinsfileのpost.failureブロック
**When**: sendWebhook()を'failed'ステータスで呼び出す
**Then**: job_id, status, error, build_url, finished_at, logs_urlが送信される

**検証方法**: 静的コード解析

### AC-012: PR URL取得のフォールバック

**Given**: metadata.jsonが存在しない、またはpr_urlフィールドがない
**When**: PR URLを取得しようとする
**Then**: 空文字列が返され、pr_urlはペイロードに含まれない

**検証方法**: 静的コード解析（jq `// empty`パターンの確認）

### AC-013: 既存テストの継続成功

**Given**: 既存の統合テスト（IT-001〜IT-018）
**When**: `npm run test:integration`を実行する
**Then**: すべてのテストが成功する

**検証方法**: テスト実行

### AC-014: 新規テストの成功

**Given**: 新規の統合テスト（IT-019〜）
**When**: `npm run test:integration`を実行する
**Then**: すべての新規テストが成功する

**検証方法**: テスト実行

### AC-015: ドキュメントの更新

**Given**: jenkins/README.md
**When**: ドキュメントを確認する
**Then**: 新規Webhookフィールドの説明と使用例が含まれている

**検証方法**: ドキュメントレビュー

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

| 項目 | 理由 |
|------|------|
| Job DSLパラメータの変更 | 既存のJOB_ID, WEBHOOK_URL, WEBHOOK_TOKENをそのまま使用 |
| 新規Jenkinsfileの作成 | 既存8ファイルの更新のみ |
| Webhook受信側（DevLoop Runner）の実装 | 本Issueは送信側のみ |
| リトライ機構の追加 | 既存動作（リトライなし）を維持 |
| Webhook送信の非同期化 | 既存動作（同期送信）を維持 |
| データベーススキーマ変更 | webhook送信側に変更なし |
| 設定ファイル変更 | 既存設定をそのまま使用 |

### 7.2 将来的な拡張候補

| 項目 | 説明 |
|------|------|
| Webhook送信のリトライ機構 | 一時的なネットワーク障害への対応 |
| Webhook送信の非同期化 | ビルド時間への影響をさらに削減 |
| 追加フィールドの対応 | DevLoop Runner仕様の更新に追従 |
| Webhook送信のバッチ化 | 複数通知をまとめて送信 |

---

## 8. ペイロード仕様まとめ

### 8.1 ステータス別送信フィールド一覧

| フィールド | running | success | failed |
|-----------|:-------:|:-------:|:------:|
| job_id | ✓ | ✓ | ✓ |
| status | ✓ | ✓ | ✓ |
| error | - | - | ✓ |
| build_url | ✓ | ✓ | ✓ |
| branch_name | ✓ | ✓ | - |
| pr_url | - | ✓ | - |
| finished_at | - | ✓ | ✓ |
| logs_url | - | ✓ | ✓ |

### 8.2 フィールド仕様一覧

| フィールド | 型 | 必須 | 形式 | 例 |
|-----------|------|------|------|-----|
| job_id | string | Yes | - | `abc123` |
| status | string | Yes | enum | `running`, `success`, `failed` |
| error | string | No | - | `Build failed` |
| build_url | string | No | URL | `http://jenkins.example.com/job/devloop/123/` |
| branch_name | string | No | - | `ai-workflow/issue-505` |
| pr_url | string | No | URL | `https://github.com/owner/repo/pull/456` |
| finished_at | string | No | ISO 8601 | `2025-12-25T04:41:18.000Z` |
| logs_url | string | No | URL | `http://jenkins.example.com/job/devloop/123/console` |

---

## 品質ゲート（Phase 1）チェックリスト

- [x] **機能要件が明確に記載されている**: FR-001〜FR-014で14項目の機能要件を定義
- [x] **受け入れ基準が定義されている**: AC-001〜AC-015で15項目の受け入れ基準を定義（Given-When-Then形式）
- [x] **スコープが明確である**: セクション7でスコープ外と将来的な拡張候補を明確に記載
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準が1対1で対応、各セクション間で整合性を確認

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-01-13 | 1.0 | 初版作成 |
