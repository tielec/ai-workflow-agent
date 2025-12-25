# テストシナリオ: Issue #512

## Jenkins Webhook仕様に合わせてペイロードを拡張（build_url, branch_name, pr_url等を追加）

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**テスト戦略**: INTEGRATION_ONLY

**判断根拠**:
- JenkinsパイプラインのGroovyコードは、Groovyランタイム依存のため単体テストが困難
- 静的解析（正規表現マッチング、パターン検証）による統合テストが最も効果的
- 既存の`tests/integration/jenkins/webhook-notifications.test.ts`が存在し、静的解析パターンが確立済み
- 実際のHTTP通信はJenkins環境でのみ検証可能

### 1.2 テスト対象の範囲

| 対象コンポーネント | テスト内容 |
|------------------|----------|
| `jenkins/shared/common.groovy` | `sendWebhook()`関数のシグネチャ変更、新規フィールド追加、ペイロード構築ロジック |
| 8つのJenkinsfile | 新しいMap型呼び出しパターン、各ステータスでの適切なフィールド送信 |
| `jenkins/README.md` | 新規Webhookフィールドのドキュメント記載 |

### 1.3 テストの目的

1. `sendWebhook()`関数がMap型config引数を受け取ることを検証
2. 新規フィールド（build_url, branch_name, pr_url, finished_at, logs_url）がペイロード構築ロジックに含まれることを検証
3. オプショナルフィールドの条件付き追加ロジックを検証
4. ISO 8601タイムスタンプ形式が正しく使用されることを検証
5. 8つのJenkinsfileすべてで新しい呼び出しパターンが適用されていることを検証
6. 既存のテスト（IT-001〜IT-018）が継続して成功することを確認

---

## 2. 統合テストシナリオ

### 2.1 common.groovy sendWebhook()関数の検証

#### IT-019: sendWebhook()がMap型config引数を受け取ること

- **目的**: 関数シグネチャが位置引数からMap型引数に変更されていることを検証
- **前提条件**: `jenkins/shared/common.groovy`ファイルが存在する
- **テスト手順**:
  1. common.groovyファイルを読み込む
  2. `def sendWebhook(Map config)`パターンを検索
- **期待結果**: シグネチャが`def sendWebhook(Map config)`にマッチする
- **確認項目**:
  - [x] Map型引数`config`が宣言されている
  - [x] 旧シグネチャ（位置引数5つ）が削除されている

**テストコード例**:
```typescript
it('should have Map type parameter in function signature', () => {
  expect(commonContent).toMatch(/def sendWebhook\s*\(\s*Map\s+config\s*\)/);
});
```

#### IT-020: build_urlフィールドがペイロードに追加されること

- **目的**: build_urlフィールドがペイロード構築ロジックに含まれることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `build_url`フィールドの追加ロジックを検索
- **期待結果**: `if (config.buildUrl?.trim()) { payload.build_url = config.buildUrl }`相当のパターンが存在
- **確認項目**:
  - [x] config.buildUrlからpayload.build_urlへの代入が存在
  - [x] 条件付き追加（空チェック）が実装されている

**テストコード例**:
```typescript
it('should add build_url field to payload when provided', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/if\s*\(\s*config\.buildUrl/);
  expect(sendWebhookBlock).toMatch(/payload\.build_url\s*=\s*config\.buildUrl/);
});
```

#### IT-021: branch_nameフィールドがペイロードに追加されること

- **目的**: branch_nameフィールドがペイロード構築ロジックに含まれることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `branch_name`フィールドの追加ロジックを検索
- **期待結果**: `if (config.branchName?.trim()) { payload.branch_name = config.branchName }`相当のパターンが存在
- **確認項目**:
  - [x] config.branchNameからpayload.branch_nameへの代入が存在
  - [x] 条件付き追加（空チェック）が実装されている

**テストコード例**:
```typescript
it('should add branch_name field to payload when provided', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/if\s*\(\s*config\.branchName/);
  expect(sendWebhookBlock).toMatch(/payload\.branch_name\s*=\s*config\.branchName/);
});
```

#### IT-022: pr_urlフィールドがペイロードに追加されること

- **目的**: pr_urlフィールドがペイロード構築ロジックに含まれることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `pr_url`フィールドの追加ロジックを検索
- **期待結果**: `if (config.prUrl?.trim()) { payload.pr_url = config.prUrl }`相当のパターンが存在
- **確認項目**:
  - [x] config.prUrlからpayload.pr_urlへの代入が存在
  - [x] 条件付き追加（空チェック）が実装されている

**テストコード例**:
```typescript
it('should add pr_url field to payload when provided', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/if\s*\(\s*config\.prUrl/);
  expect(sendWebhookBlock).toMatch(/payload\.pr_url\s*=\s*config\.prUrl/);
});
```

#### IT-023: finished_atフィールドがペイロードに追加されること

- **目的**: finished_atフィールドがペイロード構築ロジックに含まれることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `finished_at`フィールドの追加ロジックを検索
- **期待結果**: `if (config.finishedAt?.trim()) { payload.finished_at = config.finishedAt }`相当のパターンが存在
- **確認項目**:
  - [x] config.finishedAtからpayload.finished_atへの代入が存在
  - [x] 条件付き追加（空チェック）が実装されている

**テストコード例**:
```typescript
it('should add finished_at field to payload when provided', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/if\s*\(\s*config\.finishedAt/);
  expect(sendWebhookBlock).toMatch(/payload\.finished_at\s*=\s*config\.finishedAt/);
});
```

#### IT-024: logs_urlフィールドがペイロードに追加されること

- **目的**: logs_urlフィールドがペイロード構築ロジックに含まれることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `logs_url`フィールドの追加ロジックを検索
- **期待結果**: `if (config.logsUrl?.trim()) { payload.logs_url = config.logsUrl }`相当のパターンが存在
- **確認項目**:
  - [x] config.logsUrlからpayload.logs_urlへの代入が存在
  - [x] 条件付き追加（空チェック）が実装されている

**テストコード例**:
```typescript
it('should add logs_url field to payload when provided', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/if\s*\(\s*config\.logsUrl/);
  expect(sendWebhookBlock).toMatch(/payload\.logs_url\s*=\s*config\.logsUrl/);
});
```

#### IT-025: オプショナルフィールドは空の場合ペイロードに含まれないこと

- **目的**: 各オプショナルフィールドが条件付き追加ロジックで実装されていることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. 各オプショナルフィールドに対する条件分岐を確認
- **期待結果**: すべてのオプショナルフィールドに`?.trim()`または同等の空チェックが存在
- **確認項目**:
  - [x] errorMessage: 条件付き追加
  - [x] buildUrl: 条件付き追加
  - [x] branchName: 条件付き追加
  - [x] prUrl: 条件付き追加
  - [x] finishedAt: 条件付き追加
  - [x] logsUrl: 条件付き追加

**テストコード例**:
```typescript
it('should conditionally add optional fields only when non-empty', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  const optionalFields = ['errorMessage', 'buildUrl', 'branchName', 'prUrl', 'finishedAt', 'logsUrl'];

  optionalFields.forEach(field => {
    expect(sendWebhookBlock).toMatch(new RegExp(`if\\s*\\(\\s*config\\.${field}\\??\\.trim\\(\\)`));
  });
});
```

#### IT-026: JsonOutput.toJsonでペイロードが生成されること

- **目的**: ペイロードのJSON生成に`groovy.json.JsonOutput.toJson()`が使用されていることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `JsonOutput.toJson()`の使用を確認
- **期待結果**: `groovy.json.JsonOutput.toJson(payload)`パターンが存在
- **確認項目**:
  - [x] JsonOutput.toJsonがインポート/使用されている
  - [x] payloadオブジェクトがJSON化されている

**テストコード例**:
```typescript
it('should use JsonOutput.toJson for payload generation', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/groovy\.json\.JsonOutput\.toJson\s*\(\s*payload\s*\)/);
});
```

#### IT-033: ペイロードがMapリテラルで構築されること

- **目的**: ペイロードがGroovyのMapリテラルで構築されていることを検証
- **前提条件**: common.groovyのsendWebhook()関数が存在する
- **テスト手順**:
  1. sendWebhook()関数のコードブロックを抽出
  2. `def payload = [...]`パターンを確認
- **期待結果**: `def payload = [ job_id: config.jobId, status: config.status ]`相当のパターンが存在
- **確認項目**:
  - [x] Mapリテラルでpayloadが初期化されている
  - [x] 基本フィールド（job_id, status）がMapに含まれている

**テストコード例**:
```typescript
it('should construct payload as Groovy Map literal', () => {
  const sendWebhookBlock = getSendWebhookBlock();
  expect(sendWebhookBlock).toMatch(/def payload\s*=\s*\[[\s\S]*job_id:\s*config\.jobId[\s\S]*status:\s*config\.status[\s\S]*\]/);
});
```

---

### 2.2 Jenkinsfile webhook呼び出しパターンの検証

#### IT-027: runningステータスでbuild_url, branch_nameが送信されること

- **目的**: ビルド開始時のwebhook呼び出しに適切なフィールドが含まれることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. 'running'ステータスのsendWebhook呼び出しを検索
  3. buildUrl、branchNameパラメータの存在を確認
- **期待結果**: すべてのJenkinsfileで'running'呼び出しにbuildUrl、branchNameが含まれる
- **確認項目**:
  - [x] status: 'running'が指定されている
  - [x] buildUrl: env.BUILD_URLが指定されている
  - [x] branchName: env.BRANCH_NAMEまたは相当値が指定されている

**テストコード例**:
```typescript
it('should send build_url and branch_name with running status', () => {
  Object.values(pipelineContents).forEach((content) => {
    // runningステータスの呼び出しを検出
    expect(content).toMatch(/sendWebhook\s*\(\s*\[[\s\S]*?status:\s*'running'[\s\S]*?\]\s*\)/);
    // buildUrlが含まれていることを確認
    const runningBlock = content.match(/sendWebhook\s*\(\s*\[[\s\S]*?status:\s*'running'[\s\S]*?\]\s*\)/)?.[0];
    expect(runningBlock).toMatch(/buildUrl:\s*env\.BUILD_URL/);
    expect(runningBlock).toMatch(/branchName:/);
  });
});
```

#### IT-028: successステータスで全フィールドが送信されること

- **目的**: ビルド成功時のwebhook呼び出しにすべての新規フィールドが含まれることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. post.successブロック内のsendWebhook呼び出しを検索
  3. 全フィールド（buildUrl, branchName, prUrl, finishedAt, logsUrl）の存在を確認
- **期待結果**: すべてのJenkinsfileで'success'呼び出しに全フィールドが含まれる
- **確認項目**:
  - [x] status: 'success'が指定されている
  - [x] buildUrl: env.BUILD_URLが指定されている
  - [x] branchName: env.BRANCH_NAMEまたは相当値が指定されている
  - [x] prUrl: metadata.jsonから取得した値が指定されている
  - [x] finishedAt: ISO 8601形式のタイムスタンプが指定されている
  - [x] logsUrl: `${env.BUILD_URL}console`が指定されている

**テストコード例**:
```typescript
it('should send all fields with success status', () => {
  Object.values(pipelineContents).forEach((content) => {
    expect(content).toMatch(/success\s*\{[\s\S]*sendWebhook\s*\(\s*\[[\s\S]*?status:\s*'success'/);
    // successブロック内でフィールドを確認
    const successBlock = content.match(/success\s*\{[\s\S]*?sendWebhook\s*\(\s*\[[\s\S]*?\]\s*\)/)?.[0];
    expect(successBlock).toMatch(/buildUrl:/);
    expect(successBlock).toMatch(/branchName:/);
    expect(successBlock).toMatch(/prUrl:/);
    expect(successBlock).toMatch(/finishedAt:/);
    expect(successBlock).toMatch(/logsUrl:/);
  });
});
```

#### IT-029: failedステータスでerror, build_url, finished_at, logs_urlが送信されること

- **目的**: ビルド失敗時のwebhook呼び出しに適切なフィールドが含まれることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. post.failureブロック内のsendWebhook呼び出しを検索
  3. 必要なフィールド（errorMessage, buildUrl, finishedAt, logsUrl）の存在を確認
- **期待結果**: すべてのJenkinsfileで'failed'呼び出しに適切なフィールドが含まれる
- **確認項目**:
  - [x] status: 'failed'が指定されている
  - [x] errorMessage: currentBuild.resultまたはエラーメッセージが指定されている
  - [x] buildUrl: env.BUILD_URLが指定されている
  - [x] finishedAt: ISO 8601形式のタイムスタンプが指定されている
  - [x] logsUrl: `${env.BUILD_URL}console`が指定されている
  - [x] branchName: 含まれていない（失敗時は不要）
  - [x] prUrl: 含まれていない（失敗時は不要）

**テストコード例**:
```typescript
it('should send error, build_url, finished_at, logs_url with failed status', () => {
  Object.values(pipelineContents).forEach((content) => {
    expect(content).toMatch(/failure\s*\{[\s\S]*sendWebhook\s*\(\s*\[[\s\S]*?status:\s*'failed'/);
    // failureブロック内でフィールドを確認
    const failureBlock = content.match(/failure\s*\{[\s\S]*?sendWebhook\s*\(\s*\[[\s\S]*?\]\s*\)/)?.[0];
    expect(failureBlock).toMatch(/errorMessage:/);
    expect(failureBlock).toMatch(/buildUrl:/);
    expect(failureBlock).toMatch(/finishedAt:/);
    expect(failureBlock).toMatch(/logsUrl:/);
  });
});
```

#### IT-030: PR URLがmetadata.jsonから取得されること

- **目的**: PR URLの取得にmetadata.jsonとjqコマンドが使用されていることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. jqコマンドによるpr_url取得パターンを検索
- **期待結果**: `jq -r '.pr_url // empty'`パターンが使用されている
- **確認項目**:
  - [x] metadata.jsonファイルの読み込みが行われている
  - [x] jqコマンドが使用されている
  - [x] `// empty`フォールバックが使用されている

**テストコード例**:
```typescript
it('should retrieve PR URL from metadata.json using jq', () => {
  Object.values(pipelineContents).forEach((content) => {
    expect(content).toMatch(/metadata\.json/);
    expect(content).toMatch(/jq\s+-r\s+['"]\s*\.pr_url\s*\/\/\s*empty\s*['"]/);
  });
});
```

#### IT-031: タイムスタンプがISO 8601形式であること

- **目的**: finishedAtタイムスタンプが正しいISO 8601形式で生成されていることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. `new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")`パターンを検索
- **期待結果**: ISO 8601形式のタイムスタンプ生成コードが存在する
- **確認項目**:
  - [x] `new Date().format()`が使用されている
  - [x] フォーマット文字列が`yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`
  - [x] UTCタイムゾーンが指定されている

**テストコード例**:
```typescript
it('should generate timestamp in ISO 8601 format', () => {
  const iso8601Pattern = /new Date\(\)\.format\s*\(\s*["']yyyy-MM-dd'T'HH:mm:ss\.SSS'Z'["']\s*,\s*TimeZone\.getTimeZone\s*\(\s*['"]UTC['"]\s*\)\s*\)/;
  Object.values(pipelineContents).forEach((content) => {
    expect(content).toMatch(iso8601Pattern);
  });
});
```

#### IT-032: 8つのJenkinsfileすべてで新呼び出しパターンが使用されていること

- **目的**: 全Jenkinsfileで統一されたMap型呼び出しパターンが使用されていることを検証
- **前提条件**: 8つのJenkinsfileが存在する
- **テスト手順**:
  1. 各Jenkinsfileを読み込む
  2. `sendWebhook([...])` Map型呼び出しパターンを検索
  3. 旧パターン（位置引数）が存在しないことを確認
- **期待結果**: すべてのJenkinsfileでMap型呼び出しパターンが使用されている
- **確認項目**:
  - [x] `sendWebhook([`パターンが存在する
  - [x] 旧パターン`sendWebhook(params.JOB_ID, params.WEBHOOK_URL, ...)`が存在しない

**テストコード例**:
```typescript
it('should use Map type invocation pattern in all Jenkinsfiles', () => {
  Object.values(pipelineContents).forEach((content) => {
    // 新しいMap型パターンが使用されている
    expect(content).toMatch(/sendWebhook\s*\(\s*\[/);
    // 旧パターン（位置引数）が使用されていない
    expect(content).not.toMatch(/sendWebhook\s*\(\s*params\.JOB_ID\s*,\s*params\.WEBHOOK_URL\s*,/);
  });
});
```

---

### 2.3 ドキュメント更新の検証

#### IT-034: jenkins/README.mdに新規Webhookフィールドの説明があること

- **目的**: READMEに新規フィールドの説明が追加されていることを検証
- **前提条件**: jenkins/README.mdファイルが存在する
- **テスト手順**:
  1. README.mdを読み込む
  2. 各新規フィールドの説明を検索
- **期待結果**: build_url, branch_name, pr_url, finished_at, logs_urlの説明が含まれる
- **確認項目**:
  - [x] build_urlの説明が存在
  - [x] branch_nameの説明が存在
  - [x] pr_urlの説明が存在
  - [x] finished_atの説明が存在
  - [x] logs_urlの説明が存在

**テストコード例**:
```typescript
it('should document new webhook fields in README', () => {
  expect(jenkinsReadme).toMatch(/build_url/);
  expect(jenkinsReadme).toMatch(/branch_name/);
  expect(jenkinsReadme).toMatch(/pr_url/);
  expect(jenkinsReadme).toMatch(/finished_at/);
  expect(jenkinsReadme).toMatch(/logs_url/);
});
```

#### IT-035: 各ステータスでの送信フィールド一覧表があること

- **目的**: READMEにステータス別の送信フィールド一覧表が追加されていることを検証
- **前提条件**: jenkins/README.mdファイルが存在する
- **テスト手順**:
  1. README.mdを読み込む
  2. ステータス別フィールド一覧表を検索
- **期待結果**: running/success/failedステータスごとの送信フィールドが表形式で記載されている
- **確認項目**:
  - [x] runningステータスの説明が存在
  - [x] successステータスの説明が存在
  - [x] failedステータスの説明が存在

**テストコード例**:
```typescript
it('should include field summary table per status', () => {
  expect(jenkinsReadme).toMatch(/running.*success.*failed/is);
  // または表形式のマークダウンパターン
  expect(jenkinsReadme).toMatch(/\|.*フィールド.*\|.*running.*\|.*success.*\|.*failed.*\|/i);
});
```

---

### 2.4 既存テストの継続成功確認

#### IT-001〜IT-018: 既存テストの継続成功

- **目的**: Issue #505で実装された既存テストが引き続き成功することを確認
- **前提条件**: 既存のテストファイルが存在する
- **テスト手順**:
  1. `npm run test:integration`を実行
  2. IT-001〜IT-018のテスト結果を確認
- **期待結果**: すべての既存テストがパス
- **確認項目**:
  - [x] IT-001〜IT-006: common.groovy sendWebhook実装（継続動作確認）
  - [x] IT-007〜IT-010, IT-016: Job DSLパラメータ定義
  - [x] IT-011〜IT-015, IT-017: Jenkinsfile webhook統合
  - [x] IT-018: ドキュメント更新

**注意**: 既存テストはシグネチャ変更に伴い修正が必要な場合があります。IT-001の旧シグネチャ検証は、新シグネチャ検証（IT-019）に置き換わります。

---

## 3. テストデータ

### 3.1 正常データ

| データ項目 | 値 | 用途 |
|----------|-----|------|
| jobId | `abc123` | ジョブ識別子 |
| webhookUrl | `https://api.example.com/webhook` | Webhookエンドポイント |
| webhookToken | `token123` | 認証トークン |
| status | `running`, `success`, `failed` | ステータス値 |
| buildUrl | `http://jenkins.example.com/job/devloop/123/` | ビルドURL |
| branchName | `ai-workflow/issue-505` | ブランチ名 |
| prUrl | `https://github.com/owner/repo/pull/456` | PR URL |
| finishedAt | `2025-01-13T04:41:18.000Z` | ISO 8601タイムスタンプ |
| logsUrl | `http://jenkins.example.com/job/devloop/123/console` | ログURL |
| errorMessage | `Build failed due to test failures` | エラーメッセージ |

### 3.2 境界値・エッジケースデータ

| データ項目 | 値 | 説明 |
|----------|-----|------|
| buildUrl | `''` (空文字列) | オプショナルフィールドが空の場合 |
| branchName | `null` | オプショナルフィールドがnullの場合 |
| prUrl | `''` (空文字列) | metadata.jsonにpr_urlがない場合 |
| finishedAt | 空 | runningステータスでは送信しない |

### 3.3 サンプルペイロード

**runningステータス**:
```json
{
  "job_id": "abc123",
  "status": "running",
  "build_url": "http://jenkins.example.com/job/devloop/123/",
  "branch_name": "ai-workflow/issue-505"
}
```

**successステータス**:
```json
{
  "job_id": "abc123",
  "status": "success",
  "build_url": "http://jenkins.example.com/job/devloop/123/",
  "branch_name": "ai-workflow/issue-505",
  "pr_url": "https://github.com/owner/repo/pull/456",
  "finished_at": "2025-01-13T04:41:18.000Z",
  "logs_url": "http://jenkins.example.com/job/devloop/123/console"
}
```

**failedステータス**:
```json
{
  "job_id": "abc123",
  "status": "failed",
  "error": "Build failed",
  "build_url": "http://jenkins.example.com/job/devloop/123/",
  "finished_at": "2025-01-13T04:41:18.000Z",
  "logs_url": "http://jenkins.example.com/job/devloop/123/console"
}
```

---

## 4. テスト環境要件

### 4.1 実行環境

| 項目 | 要件 |
|------|------|
| Node.js | v18以上 |
| npm | v8以上 |
| テストフレームワーク | Jest |
| CI環境 | GitHub Actions / Jenkins |

### 4.2 必要なファイル

| ファイル | パス | 説明 |
|---------|------|------|
| 共通モジュール | `jenkins/shared/common.groovy` | テスト対象 |
| Jenkinsfile (8) | `jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile` | テスト対象 |
| Job DSL (8) | `jenkins/jobs/dsl/ai-workflow/*.groovy` | 参照（パラメータ定義確認） |
| README | `jenkins/README.md` | テスト対象 |

### 4.3 テスト実行コマンド

```bash
# 統合テストの実行
npm run test:integration

# 特定のテストファイルのみ実行
npm test -- tests/integration/jenkins/webhook-notifications.test.ts

# 新規テストケースのみ実行
npm test -- tests/integration/jenkins/webhook-notifications.test.ts -t "IT-019"
```

---

## 5. テストケースID一覧

### 5.1 新規テストケース（IT-019〜IT-035）

| ID | カテゴリ | テスト内容 | 優先度 |
|-----|---------|----------|:------:|
| IT-019 | common.groovy | sendWebhook()がMap型config引数を受け取ること | 高 |
| IT-020 | common.groovy | build_urlフィールドがペイロードに追加されること | 高 |
| IT-021 | common.groovy | branch_nameフィールドがペイロードに追加されること | 高 |
| IT-022 | common.groovy | pr_urlフィールドがペイロードに追加されること | 高 |
| IT-023 | common.groovy | finished_atフィールドがペイロードに追加されること | 高 |
| IT-024 | common.groovy | logs_urlフィールドがペイロードに追加されること | 高 |
| IT-025 | common.groovy | オプショナルフィールドは空の場合ペイロードに含まれないこと | 高 |
| IT-026 | common.groovy | JsonOutput.toJsonでペイロードが生成されること | 中 |
| IT-027 | Jenkinsfile | runningステータスでbuild_url, branch_nameが送信されること | 高 |
| IT-028 | Jenkinsfile | successステータスで全フィールドが送信されること | 高 |
| IT-029 | Jenkinsfile | failedステータスでerror, build_url, finished_at, logs_urlが送信されること | 高 |
| IT-030 | Jenkinsfile | PR URLがmetadata.jsonから取得されること | 中 |
| IT-031 | Jenkinsfile | タイムスタンプがISO 8601形式であること | 中 |
| IT-032 | Jenkinsfile | 8つのJenkinsfileすべてで新呼び出しパターンが使用されていること | 高 |
| IT-033 | common.groovy | ペイロードがMapリテラルで構築されること | 中 |
| IT-034 | README | jenkins/README.mdに新規Webhookフィールドの説明があること | 低 |
| IT-035 | README | 各ステータスでの送信フィールド一覧表があること | 低 |

### 5.2 既存テストケース（IT-001〜IT-018）- 継続確認

| ID | カテゴリ | テスト内容 | 修正要否 |
|-----|---------|----------|:------:|
| IT-001 | common.groovy | sendWebhook()のシグネチャ | **要修正** |
| IT-002〜IT-006 | common.groovy | パラメータ検証、HTTP設定、エラーハンドリング | 確認 |
| IT-007〜IT-010 | Job DSL | パラメータ定義 | 変更なし |
| IT-011〜IT-015 | Jenkinsfile | webhook統合 | **要修正** |
| IT-016〜IT-017 | Job DSL/Jenkinsfile | 追加検証 | 確認 |
| IT-018 | README | ドキュメント | 確認 |

---

## 6. 品質ゲート（Phase 3）チェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**: INTEGRATION_ONLY戦略に基づき、静的解析テストのみ作成
- [x] **主要な正常系がカバーされている**: 全新規フィールドの検証、各ステータスでの呼び出しパターン検証を含む
- [x] **主要な異常系がカバーされている**: オプショナルフィールドの条件付き追加（空値ハンドリング）を検証
- [x] **期待結果が明確である**: 各テストケースで具体的な期待結果と検証パターンを記載

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-01-13 | 1.0 | 初版作成 |
