# テストシナリオ: Issue #721

## executeコマンドにEC2ネットワークスループット低下検知によるグレースフル停止機能を追加

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（ユニットテスト + インテグレーションテスト）

### テスト対象の範囲

| テスト種別 | 対象モジュール | テストファイル |
|-----------|-------------|-------------|
| ユニットテスト（新規） | `src/core/network-health-checker.ts` | `tests/unit/core/network-health-checker.test.ts` |
| ユニットテスト（拡張） | `src/commands/execute/options-parser.ts` | `tests/unit/commands/execute/options-parser.test.ts` |
| ユニットテスト（拡張） | `src/core/config.ts` | `tests/unit/core/config.test.ts` |
| インテグレーションテスト（拡張） | `src/commands/execute/workflow-executor.ts` | `tests/unit/commands/execute/workflow-executor.test.ts` |

### テストの目的

1. **ネットワークヘルスチェッカーモジュールの正確性検証**: IMDSv2メタデータ取得、CloudWatchメトリクス取得、低下率計算、AND条件判定、非EC2環境フォールバックの各ロジックが正確に動作することを検証する
2. **既存機能への非影響確認**: 新規オプション追加による既存の解析・バリデーションロジックへの影響がないことを確認する
3. **ワークフロー統合フローの検証**: ヘルスチェック→早期終了→`ExecutionSummary`構築のエンドツーエンドフローが正しく動作することを検証する
4. **後方互換性の保証**: `--network-health-check`がデフォルト無効であり、既存動作が一切変更されないことを保証する

### テスト戦略の判断根拠

- **ユニットテスト**: ネットワークヘルスチェッカーのコアロジック（閾値判定、メトリクス比較、非EC2フォールバック）は外部依存をモックして個別にテスト可能
- **インテグレーションテスト**: `executePhasesSequential()`内でのヘルスチェック呼び出し→早期終了フローは統合テストで検証すべき
- **BDDテストは不要**: エンドユーザー向けUI機能ではなく、インフラレベルの自動制御機能であるため

### ESMモッキング制約への対応

本プロジェクトはESMモード（`"type": "module"`）で動作しており、Jestのモッキングに制約がある：

- `jest.mock()` with factory functions はESMで信頼性が低い
- `jest.spyOn()` はESM exportのread-onlyプロパティをモックできない
- **解決策**: `jest.unstable_mockModule()` と動的インポート（`await import()`）を組み合わせてESMモジュールをモックする

---

## 2. ユニットテストシナリオ

### 2.1 ネットワークヘルスチェッカー（新規: `network-health-checker.test.ts`）

#### 2.1.1 `checkNetworkHealth()` - 正常系

**テストケースID**: NHC-001
**テストケース名**: `checkNetworkHealth_正常系_メトリクス正常時にshouldStopがfalseを返す`

- **目的**: EC2環境で両メトリクスが閾値未満の場合に、フェーズ実行を続行する判定が正しく返されることを検証する
- **前提条件**:
  - IMDSv2がモックされ、正常なインスタンスメタデータを返す
  - CloudWatch APIがモックされ、正常なメトリクスデータポイントを返す
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - IMDSv2トークン: `"mock-token-12345"`
  - インスタンスID: `"i-0abcdef1234567890"`
  - Availability Zone: `"ap-northeast-1a"`
  - NetworkPacketsOut: peak=1000, current=800（低下率20%）
  - NetworkOut: peak=5000000, current=4000000（低下率20%）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
    networkPacketsOutCurrent: 800,
    networkPacketsOutPeak: 1000,
    networkOutCurrent: 4000000,
    networkOutPeak: 5000000,
    dropPercentage: 20, // 両メトリクスの大きい方
    reason: undefined,
  }
  ```

---

**テストケースID**: NHC-002
**テストケース名**: `checkNetworkHealth_正常系_両メトリクス低下時にshouldStopがtrueを返す`

- **目的**: EC2環境で両メトリクスの低下率が閾値以上の場合に、グレースフル停止の判定が正しく返されることを検証する（AC-002-1）
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=200（低下率80%）
  - NetworkOut: peak=5000000, current=500000（低下率90%）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: true,
    networkPacketsOutCurrent: 200,
    networkPacketsOutPeak: 1000,
    networkOutCurrent: 500000,
    networkOutPeak: 5000000,
    dropPercentage: 90, // 両メトリクスの大きい方
    reason: expect.stringContaining('network'), // 停止理由が含まれる
  }
  ```

---

**テストケースID**: NHC-003
**テストケース名**: `checkNetworkHealth_正常系_片方のメトリクスのみ低下時にshouldStopがfalseを返す`

- **目的**: AND条件判定の正確性を検証する。片方のメトリクスのみ閾値以上の場合、停止しないことを確認する（AC-002-2）
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=200（低下率80% ≥ 閾値）
  - NetworkOut: peak=5000000, current=4000000（低下率20% < 閾値）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
    networkPacketsOutCurrent: 200,
    networkPacketsOutPeak: 1000,
    networkOutCurrent: 4000000,
    networkOutPeak: 5000000,
    dropPercentage: 80, // 大きい方
  }
  ```

---

**テストケースID**: NHC-004
**テストケース名**: `checkNetworkHealth_正常系_NetworkOutのみ低下時にshouldStopがfalseを返す`

- **目的**: AND条件の逆パターンを検証。`NetworkOut`のみ低下、`NetworkPacketsOut`は正常の場合に続行することを確認する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=800（低下率20% < 閾値）
  - NetworkOut: peak=5000000, current=500000（低下率90% ≥ 閾値）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
    dropPercentage: 90,
  }
  ```

---

**テストケースID**: NHC-005
**テストケース名**: `checkNetworkHealth_正常系_カスタム閾値で判定が正しく動作する`

- **目的**: デフォルト閾値（70%）以外のカスタム閾値での判定が正しく動作することを検証する（AC-001-3）
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 50`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=400（低下率60% ≥ 50%閾値）
  - NetworkOut: peak=5000000, current=2000000（低下率60% ≥ 50%閾値）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: true,
    dropPercentage: 60,
  }
  ```

---

#### 2.1.2 `checkNetworkHealth()` - 境界値テスト

**テストケースID**: NHC-006
**テストケース名**: `checkNetworkHealth_境界値_閾値ちょうどの低下率でshouldStopがtrueを返す`

- **目的**: 低下率が閾値と完全一致する場合に停止判定されることを検証する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=300（低下率70.0% = 閾値）
  - NetworkOut: peak=5000000, current=1500000（低下率70.0% = 閾値）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: true,
    dropPercentage: 70,
  }
  ```

---

**テストケースID**: NHC-007
**テストケース名**: `checkNetworkHealth_境界値_閾値をわずかに下回る低下率でshouldStopがfalseを返す`

- **目的**: 低下率が閾値をわずかに下回る場合に続行判定されることを検証する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=301（低下率69.9%）
  - NetworkOut: peak=5000000, current=1505000（低下率69.9%）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
  }
  ```

---

**テストケースID**: NHC-008
**テストケース名**: `checkNetworkHealth_境界値_peakが0の場合に低下率が0を返す`

- **目的**: ゼロ除算防止の正確性を検証する（FR-002-3）
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=0, current=0
  - NetworkOut: peak=0, current=0
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
    dropPercentage: 0,
  }
  ```

---

**テストケースID**: NHC-009
**テストケース名**: `checkNetworkHealth_境界値_currentがpeakを超える場合に低下率が負となりshouldStopがfalseを返す`

- **目的**: 計測タイミングのずれ等で`current > peak`となった場合の安全な動作を検証する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 70`
- **モックデータ**:
  - NetworkPacketsOut: peak=500, current=800
  - NetworkOut: peak=2000000, current=4000000
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: false,
    // dropPercentage は負の値（低下していない）
  }
  ```

---

**テストケースID**: NHC-010
**テストケース名**: `checkNetworkHealth_境界値_閾値0で常にshouldStopがtrueを返す`

- **目的**: 閾値0%の場合、0%以上の低下（つまり少しでも低下すれば）停止することを検証する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 0`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=999（低下率0.1%）
  - NetworkOut: peak=5000000, current=4999000（低下率0.02%）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: true,
  }
  ```

---

**テストケースID**: NHC-011
**テストケース名**: `checkNetworkHealth_境界値_閾値100で完全停止時のみshouldStopがtrueを返す`

- **目的**: 閾値100%の場合、完全にスループットが0になった時のみ停止することを検証する
- **前提条件**: IMDSv2・CloudWatch APIがモックされている
- **入力**: `dropThreshold = 100`
- **モックデータ**:
  - NetworkPacketsOut: peak=1000, current=0（低下率100%）
  - NetworkOut: peak=5000000, current=0（低下率100%）
- **期待結果**:
  ```typescript
  {
    available: true,
    shouldStop: true,
    dropPercentage: 100,
  }
  ```

---

#### 2.1.3 `checkNetworkHealth()` - 異常系

**テストケースID**: NHC-012
**テストケース名**: `checkNetworkHealth_異常系_非EC2環境でIMDSv2タイムアウト時にavailableがfalseを返す`

- **目的**: 非EC2環境（ローカル開発環境等）でIMDSv2アクセスがタイムアウトした場合、`available: false`が返却され、フェーズ実行に影響を与えないことを検証する（AC-003-1）
- **前提条件**: グローバル`fetch`がタイムアウトエラー（`AbortError`）をスローするようにモックされている
- **入力**: `dropThreshold = 70`
- **モック動作**: `fetch` がIMDSv2トークン取得時にタイムアウト例外をスロー
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
    networkPacketsOutCurrent: 0,
    networkPacketsOutPeak: 0,
    networkOutCurrent: 0,
    networkOutPeak: 0,
    dropPercentage: 0,
    reason: undefined,
  }
  ```

---

**テストケースID**: NHC-013
**テストケース名**: `checkNetworkHealth_異常系_IMDSv2インスタンスID取得失敗時にavailableがfalseを返す`

- **目的**: IMDSv2トークン取得は成功するが、インスタンスID取得で失敗した場合の動作を検証する
- **前提条件**: `fetch`がトークン取得には成功し、インスタンスID取得でHTTP 404を返すようにモック
- **入力**: `dropThreshold = 70`
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
  }
  ```

---

**テストケースID**: NHC-014
**テストケース名**: `checkNetworkHealth_異常系_CloudWatch API呼び出しエラー時にavailableがfalseを返す`

- **目的**: CloudWatch API呼び出しが失敗した場合（認証エラー、レート制限等）、`available: false`で返却されフェーズ実行が続行されることを検証する（AC-003-2）
- **前提条件**: IMDSv2はモックで正常応答、CloudWatchClientのsendメソッドが例外をスロー
- **入力**: `dropThreshold = 70`
- **モック動作**: `CloudWatchClient.send()` が`AccessDeniedException`をスロー
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
  }
  ```

---

**テストケースID**: NHC-015
**テストケース名**: `checkNetworkHealth_異常系_CloudWatchデータポイントが空の場合にavailableがfalseを返す`

- **目的**: CloudWatch APIのレスポンスで`Datapoints`が空の場合（新規起動直後のインスタンス等）、`available: false`として処理されることを検証する（AC-003-3）
- **前提条件**: IMDSv2はモックで正常応答、CloudWatch APIは空の`Datapoints`を返す
- **入力**: `dropThreshold = 70`
- **モックデータ**: CloudWatch レスポンス `{ Datapoints: [] }`
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
  }
  ```

---

**テストケースID**: NHC-016
**テストケース名**: `checkNetworkHealth_異常系_ネットワーク接続エラー時にavailableがfalseを返す`

- **目的**: `fetch`自体がネットワーク接続エラー（`TypeError: Failed to fetch`等）を返した場合の動作を検証する
- **前提条件**: `fetch`がネットワークエラーをスロー
- **入力**: `dropThreshold = 70`
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
  }
  ```

---

#### 2.1.4 `getEc2InstanceMetadata()` - 内部関数テスト

**テストケースID**: NHC-017
**テストケース名**: `getEc2InstanceMetadata_正常系_インスタンスメタデータが正しく取得される`

- **目的**: IMDSv2プロトコルに準拠したメタデータ取得フローを検証する
- **前提条件**: `fetch`がIMDSv2エンドポイントへの各リクエストに正常応答を返す
- **モックデータ**:
  - PUTリクエスト(`/latest/api/token`): レスポンス `"mock-imds-token"`
  - GETリクエスト(`/latest/meta-data/instance-id`): レスポンス `"i-0abcdef1234567890"`
  - GETリクエスト(`/latest/meta-data/placement/availability-zone`): レスポンス `"ap-northeast-1a"`
- **期待結果**:
  ```typescript
  { instanceId: "i-0abcdef1234567890", region: "ap-northeast-1" }
  ```
- **追加検証**:
  - PUTリクエストのヘッダーに`X-aws-ec2-metadata-token-ttl-seconds: 21600`が含まれること
  - GETリクエストのヘッダーに`X-aws-ec2-metadata-token: mock-imds-token`が含まれること
  - 各リクエストに`AbortSignal.timeout(3000)`が設定されていること

---

**テストケースID**: NHC-018
**テストケース名**: `getEc2InstanceMetadata_正常系_リージョン導出が正しく動作する`

- **目的**: 各種AZパターンからリージョンが正しく導出されることを検証する
- **テストパターン**:

| Availability Zone | 期待されるリージョン |
|---|---|
| `ap-northeast-1a` | `ap-northeast-1` |
| `us-east-1b` | `us-east-1` |
| `eu-west-2c` | `eu-west-2` |
| `ap-southeast-1a` | `ap-southeast-1` |

---

#### 2.1.5 `getCloudWatchMetrics()` - 内部関数テスト

**テストケースID**: NHC-019
**テストケース名**: `getCloudWatchMetrics_正常系_メトリクスデータが正しく取得される`

- **目的**: CloudWatch `GetMetricStatistics` APIの呼び出しパラメータと、レスポンスからの`current`・`peak`抽出が正しいことを検証する
- **前提条件**: `CloudWatchClient.send()`がモックされている
- **入力**: `instanceId = "i-0abcdef1234567890"`, `region = "ap-northeast-1"`, `metricName = "NetworkPacketsOut"`
- **モックデータ**: CloudWatch レスポンス
  ```typescript
  {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 800 },
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 1000 },
      { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 950 },
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 600 },
    ]
  }
  ```
- **期待結果**: `{ current: 600, peak: 1000 }`
- **追加検証**: `GetMetricStatisticsCommand`のパラメータが以下を満たすこと
  - `Namespace: 'AWS/EC2'`
  - `MetricName: 'NetworkPacketsOut'`
  - `Dimensions: [{ Name: 'InstanceId', Value: 'i-0abcdef1234567890' }]`
  - `Period: 300`
  - `Statistics: ['Average']`
  - `StartTime`が現在時刻の約1時間前であること
  - `EndTime`が現在時刻付近であること

---

**テストケースID**: NHC-020
**テストケース名**: `getCloudWatchMetrics_正常系_データポイントがTimestampでソートされる`

- **目的**: `Datapoints`がTimestamp順にソートされていない場合でも、最新のデータポイントが正しく`current`として抽出されることを検証する
- **モックデータ**: 逆順のタイムスタンプを持つDatapoints
  ```typescript
  {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 200 },
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 1000 },
      { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 800 },
    ]
  }
  ```
- **期待結果**: `{ current: 200, peak: 1000 }`

---

**テストケースID**: NHC-021
**テストケース名**: `getCloudWatchMetrics_異常系_データポイントが空の場合にエラーをスローする`

- **目的**: `Datapoints`が空配列の場合にエラーがスローされ、呼び出し元で`available: false`として処理されることを検証する
- **モックデータ**: `{ Datapoints: [] }`
- **期待結果**: エラーがスローされる

---

**テストケースID**: NHC-022
**テストケース名**: `getCloudWatchMetrics_異常系_Datapointsがundefinedの場合にエラーをスローする`

- **目的**: CloudWatch APIのレスポンスで`Datapoints`プロパティが存在しない場合の安全な動作を検証する
- **モックデータ**: `{ Datapoints: undefined }`
- **期待結果**: エラーがスローされる

---

#### 2.1.6 `calculateDropPercentage()` - 内部関数テスト

**テストケースID**: NHC-023
**テストケース名**: `calculateDropPercentage_正常系_低下率が正しく計算される`

- **目的**: 低下率計算ロジック`(1 - current / peak) * 100`の正確性を検証する
- **テストパターン**:

| current | peak | 期待される低下率 |
|---------|------|--------------|
| 300 | 1000 | 70.0 |
| 500 | 1000 | 50.0 |
| 0 | 1000 | 100.0 |
| 1000 | 1000 | 0.0 |
| 800 | 1000 | 20.0 |

---

**テストケースID**: NHC-024
**テストケース名**: `calculateDropPercentage_境界値_peakが0の場合に0を返す`

- **目的**: ゼロ除算防止の動作を検証する
- **入力**: `current = 0, peak = 0`
- **期待結果**: `0`

---

**テストケースID**: NHC-025
**テストケース名**: `calculateDropPercentage_境界値_currentがpeakを超える場合に負の値を返す`

- **目的**: `current > peak`（計測タイミングのずれ等）の場合の安全な動作を検証する
- **入力**: `current = 1500, peak = 1000`
- **期待結果**: `-50.0`（負の値 = 低下していない）

---

#### 2.1.7 `buildUnavailableResult()` - ヘルパー関数テスト

**テストケースID**: NHC-026
**テストケース名**: `buildUnavailableResult_正常系_全フィールドが適切なデフォルト値で返却される`

- **目的**: `available: false`時の結果オブジェクトが仕様通りの構造であることを検証する
- **期待結果**:
  ```typescript
  {
    available: false,
    shouldStop: false,
    networkPacketsOutCurrent: 0,
    networkPacketsOutPeak: 0,
    networkOutCurrent: 0,
    networkOutPeak: 0,
    dropPercentage: 0,
    reason: undefined,
  }
  ```

---

#### 2.1.8 ロギング検証

**テストケースID**: NHC-027
**テストケース名**: `checkNetworkHealth_ロギング_IMDSv2タイムアウト時にwarningログが出力される`

- **目的**: 非EC2環境でのIMDSv2タイムアウト時に適切な警告ログが出力されることを検証する（NFR-002-2）
- **前提条件**: `logger.warn`がスパイされている
- **入力**: IMDSv2トークン取得がタイムアウト
- **期待結果**: `logger.warn`が「IMDSv2」を含むメッセージで呼び出される

---

**テストケースID**: NHC-028
**テストケース名**: `checkNetworkHealth_ロギング_CloudWatch APIエラー時にwarningログが出力される`

- **目的**: CloudWatch API呼び出し失敗時に適切な警告ログが出力されることを検証する（NFR-002-3）
- **前提条件**: IMDSv2は正常、CloudWatch APIがエラーをスロー、`logger.warn`がスパイされている
- **期待結果**: `logger.warn`が「CloudWatch」を含むメッセージで呼び出される

---

### 2.2 オプション解析テスト（拡張: `options-parser.test.ts`）

#### 2.2.1 `parseExecuteOptions()` - ネットワークヘルスチェックオプション

**テストケースID**: OPT-001
**テストケース名**: `parseExecuteOptions_networkHealthCheck_デフォルト値はfalse`

- **目的**: `--network-health-check`未指定時にデフォルト値`false`が設定されることを検証する（AC-001-2）
- **入力**:
  ```typescript
  { issue: '721', phase: 'all' }
  ```
- **期待結果**: `result.networkHealthCheck === false`

---

**テストケースID**: OPT-002
**テストケース名**: `parseExecuteOptions_networkHealthCheck_trueが正しく設定される`

- **目的**: `--network-health-check`指定時に`true`が設定されることを検証する（AC-001-1）
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkHealthCheck: true }
  ```
- **期待結果**: `result.networkHealthCheck === true`

---

**テストケースID**: OPT-003
**テストケース名**: `parseExecuteOptions_networkThroughputDropThreshold_デフォルト値は70`

- **目的**: `--network-throughput-drop-threshold`未指定時にデフォルト値`70`が設定されることを検証する
- **入力**:
  ```typescript
  { issue: '721', phase: 'all' }
  ```
- **期待結果**: `result.networkThroughputDropThreshold === 70`

---

**テストケースID**: OPT-004
**テストケース名**: `parseExecuteOptions_networkThroughputDropThreshold_カスタム値が正しくパースされる`

- **目的**: カスタム閾値が数値に変換されて正しく設定されることを検証する（AC-001-3）
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkThroughputDropThreshold: '50' }
  ```
- **期待結果**: `result.networkThroughputDropThreshold === 50`

---

**テストケースID**: OPT-005
**テストケース名**: `parseExecuteOptions_networkThroughputDropThreshold_文字列数値が正しくパースされる`

- **目的**: CLIから渡される文字列型の数値が正しく`Number`変換されることを検証する
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkThroughputDropThreshold: '30' }
  ```
- **期待結果**: `result.networkThroughputDropThreshold === 30`

---

**テストケースID**: OPT-006
**テストケース名**: `parseExecuteOptions_両オプション同時指定_正しくパースされる`

- **目的**: `--network-health-check`と`--network-throughput-drop-threshold`の同時指定が正しく処理されることを検証する
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkHealthCheck: true, networkThroughputDropThreshold: '50' }
  ```
- **期待結果**:
  - `result.networkHealthCheck === true`
  - `result.networkThroughputDropThreshold === 50`

---

**テストケースID**: OPT-007
**テストケース名**: `parseExecuteOptions_既存オプションとの共存_全フィールドが正しく解析される`

- **目的**: ネットワークヘルスチェックオプションが既存オプションと共存しても、既存オプションの解析に影響がないことを検証する（NFR-005）
- **入力**:
  ```typescript
  {
    issue: '721',
    phase: 'all',
    agent: 'codex',
    forceReset: true,
    networkHealthCheck: true,
    networkThroughputDropThreshold: '50',
  }
  ```
- **期待結果**:
  - `result.issueNumber === '721'`
  - `result.phaseOption === 'all'`
  - `result.agentMode === 'codex'`
  - `result.forceReset === true`
  - `result.networkHealthCheck === true`
  - `result.networkThroughputDropThreshold === 50`

---

#### 2.2.2 `validateExecuteOptions()` - ネットワークヘルスチェック閾値バリデーション

**テストケースID**: OPT-008
**テストケース名**: `validateExecuteOptions_networkThroughputDropThreshold_有効範囲内の値は検証成功`

- **目的**: 閾値が0〜100の範囲内の場合にバリデーションが成功することを検証する
- **テストパターン**:

| 入力値 | 期待結果 |
|--------|---------|
| `0` | `valid: true` |
| `50` | `valid: true` |
| `70` | `valid: true` |
| `100` | `valid: true` |

---

**テストケースID**: OPT-009
**テストケース名**: `validateExecuteOptions_networkThroughputDropThreshold_101指定でバリデーションエラー`

- **目的**: 閾値が100を超える場合にバリデーションエラーが返されることを検証する（AC-001-4）
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkThroughputDropThreshold: 101 }
  ```
- **期待結果**:
  - `result.valid === false`
  - `result.errors` に `"--network-throughput-drop-threshold"` を含むエラーメッセージが含まれる

---

**テストケースID**: OPT-010
**テストケース名**: `validateExecuteOptions_networkThroughputDropThreshold_負の値でバリデーションエラー`

- **目的**: 閾値が0未満の場合にバリデーションエラーが返されることを検証する（AC-001-4）
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkThroughputDropThreshold: -1 }
  ```
- **期待結果**:
  - `result.valid === false`
  - `result.errors` にエラーメッセージが含まれる

---

**テストケースID**: OPT-011
**テストケース名**: `validateExecuteOptions_networkThroughputDropThreshold_非数値でバリデーションエラー`

- **目的**: 数値に変換できない値が指定された場合にバリデーションエラーが返されることを検証する
- **入力**:
  ```typescript
  { issue: '721', phase: 'all', networkThroughputDropThreshold: 'abc' as any }
  ```
- **期待結果**:
  - `result.valid === false`
  - `result.errors` にエラーメッセージが含まれる

---

**テストケースID**: OPT-012
**テストケース名**: `validateExecuteOptions_networkThroughputDropThreshold_未指定時はバリデーションスキップ`

- **目的**: 閾値が未指定の場合、バリデーション自体がスキップされることを検証する
- **入力**:
  ```typescript
  { issue: '721', phase: 'all' }
  ```
- **期待結果**: `result.valid === true`

---

**テストケースID**: OPT-013
**テストケース名**: `validateExecuteOptions_既存バリデーションとの共存_閾値エラーと他のエラーが同時に返される`

- **目的**: ネットワーク閾値バリデーションエラーが既存のバリデーションエラーと共存することを検証する
- **入力**:
  ```typescript
  {
    // issue 未指定（既存エラー）
    phase: 'planning',
    preset: 'quick-fix', // preset と phase 同時指定（既存エラー）
    networkThroughputDropThreshold: 200, // 範囲外（新規エラー）
  } as any
  ```
- **期待結果**:
  - `result.valid === false`
  - `result.errors.length >= 3`
  - issue未指定エラー、preset/phase排他エラー、閾値範囲エラーがすべて含まれる

---

### 2.3 設定管理テスト（拡張: `config.test.ts`）

#### 2.3.1 `getNetworkHealthCheckEnabled()`

**テストケースID**: CFG-001
**テストケース名**: `getNetworkHealthCheckEnabled_正常系_trueが設定されている場合`

- **目的**: 環境変数`NETWORK_HEALTH_CHECK=true`の場合に`true`が返されることを検証する（AC-005-1）
- **前提条件**: `process.env.NETWORK_HEALTH_CHECK = 'true'`
- **期待結果**: `true`

---

**テストケースID**: CFG-002
**テストケース名**: `getNetworkHealthCheckEnabled_正常系_1が設定されている場合`

- **目的**: 環境変数`NETWORK_HEALTH_CHECK=1`の場合に`true`が返されることを検証する
- **前提条件**: `process.env.NETWORK_HEALTH_CHECK = '1'`
- **期待結果**: `true`

---

**テストケースID**: CFG-003
**テストケース名**: `getNetworkHealthCheckEnabled_正常系_falseが設定されている場合`

- **目的**: 環境変数`NETWORK_HEALTH_CHECK=false`の場合に`false`が返されることを検証する
- **前提条件**: `process.env.NETWORK_HEALTH_CHECK = 'false'`
- **期待結果**: `false`

---

**テストケースID**: CFG-004
**テストケース名**: `getNetworkHealthCheckEnabled_正常系_未設定の場合にデフォルトfalseを返す`

- **目的**: 環境変数未設定時にデフォルト値`false`が返されることを検証する（AC-005-3）
- **前提条件**: `delete process.env.NETWORK_HEALTH_CHECK`
- **期待結果**: `false`

---

**テストケースID**: CFG-005
**テストケース名**: `getNetworkHealthCheckEnabled_エッジケース_空文字列の場合にfalseを返す`

- **目的**: 環境変数が空文字列の場合にデフォルト値`false`が返されることを検証する
- **前提条件**: `process.env.NETWORK_HEALTH_CHECK = ''`
- **期待結果**: `false`

---

**テストケースID**: CFG-006
**テストケース名**: `getNetworkHealthCheckEnabled_エッジケース_大文字TRUEの場合にtrueを返す`

- **目的**: 大文字小文字の正規化が正しく動作することを検証する
- **前提条件**: `process.env.NETWORK_HEALTH_CHECK = 'TRUE'`
- **期待結果**: `true`

---

#### 2.3.2 `getNetworkThroughputDropThreshold()`

**テストケースID**: CFG-007
**テストケース名**: `getNetworkThroughputDropThreshold_正常系_数値が設定されている場合`

- **目的**: 環境変数`NETWORK_THROUGHPUT_DROP_THRESHOLD=50`の場合に`50`が返されることを検証する（AC-005-2）
- **前提条件**: `process.env.NETWORK_THROUGHPUT_DROP_THRESHOLD = '50'`
- **期待結果**: `50`

---

**テストケースID**: CFG-008
**テストケース名**: `getNetworkThroughputDropThreshold_正常系_未設定の場合にデフォルト70を返す`

- **目的**: 環境変数未設定時にデフォルト値`70`が返されることを検証する（AC-005-3）
- **前提条件**: `delete process.env.NETWORK_THROUGHPUT_DROP_THRESHOLD`
- **期待結果**: `70`

---

**テストケースID**: CFG-009
**テストケース名**: `getNetworkThroughputDropThreshold_エッジケース_0が設定されている場合に0を返す`

- **目的**: 0%の閾値が正しく扱われることを検証する
- **前提条件**: `process.env.NETWORK_THROUGHPUT_DROP_THRESHOLD = '0'`
- **期待結果**: `0`

---

**テストケースID**: CFG-010
**テストケース名**: `getNetworkThroughputDropThreshold_エッジケース_100が設定されている場合に100を返す`

- **目的**: 100%の閾値が正しく扱われることを検証する
- **前提条件**: `process.env.NETWORK_THROUGHPUT_DROP_THRESHOLD = '100'`
- **期待結果**: `100`

---

**テストケースID**: CFG-011
**テストケース名**: `getNetworkThroughputDropThreshold_エッジケース_非数値の場合にデフォルト70を返す`

- **目的**: 環境変数が非数値文字列の場合にデフォルト値にフォールバックすることを検証する
- **前提条件**: `process.env.NETWORK_THROUGHPUT_DROP_THRESHOLD = 'abc'`
- **期待結果**: `70`

---

## 3. インテグレーションテストシナリオ

### 3.1 ワークフロー実行 × ネットワークヘルスチェック統合（拡張: `workflow-executor.test.ts`）

#### 3.1.1 ヘルスチェック有効時の早期終了フロー

**シナリオID**: INT-001
**シナリオ名**: ヘルスチェック有効・shouldStop:true時にExecutionSummaryがsuccess:falseで返却される

- **目的**: ネットワークヘルスチェックが`shouldStop: true`を返した場合、フェーズ実行が中断され、`ExecutionSummary`が正しく構築されることを検証する（AC-002-1、FR-003-2）
- **前提条件**:
  - `context.networkHealthCheck = true`
  - `context.networkThroughputDropThreshold = 70`
  - `checkNetworkHealth()`が`{ available: true, shouldStop: true, dropPercentage: 85, ... }`を返すようにモック
- **テスト手順**:
  1. `networkHealthCheck: true`を含む`PhaseContext`を作成
  2. `network-health-checker`モジュールの動的インポートをモックし、`checkNetworkHealth`が`shouldStop: true`を返すように設定
  3. `executePhasesSequential()`を呼び出す
  4. 返却された`ExecutionSummary`を検証する
- **期待結果**:
  ```typescript
  {
    success: false,
    failedPhase: 'planning', // 最初のフェーズ
    error: expect.stringContaining('Network throughput degraded'),
    stoppedReason: 'network_throughput_degraded',
    results: {}, // フェーズは実行されていない
  }
  ```
- **確認項目**:
  - [x] `ExecutionSummary.success`が`false`であること
  - [x] `ExecutionSummary.stoppedReason`が`'network_throughput_degraded'`であること
  - [x] `ExecutionSummary.failedPhase`に停止直前のフェーズ名が設定されていること
  - [x] `ExecutionSummary.error`にネットワークスループット低下の情報が含まれること
  - [x] 実際のフェーズ実行（`createPhaseInstance`、`phaseInstance.run()`）が呼ばれていないこと

---

**シナリオID**: INT-002
**シナリオ名**: ヘルスチェック有効・2番目のフェーズ開始前にshouldStop:trueで停止する

- **目的**: 最初のフェーズは正常に通過し、2番目のフェーズ開始前にネットワーク低下が検知された場合の動作を検証する
- **前提条件**:
  - `context.networkHealthCheck = true`
  - 1回目の`checkNetworkHealth()`呼び出しは`shouldStop: false`を返す
  - 2回目の`checkNetworkHealth()`呼び出しは`shouldStop: true`を返す
- **テスト手順**:
  1. `checkNetworkHealth`のモックを1回目は`shouldStop: false`、2回目は`shouldStop: true`を返すように設定
  2. フェーズ実行（`createPhaseInstance`→`run()`）のモックが1回だけ呼ばれることを検証
  3. `executePhasesSequential()`を呼び出す
- **期待結果**:
  - `ExecutionSummary.success === false`
  - `ExecutionSummary.stoppedReason === 'network_throughput_degraded'`
  - `ExecutionSummary.failedPhase` が2番目のフェーズ名（`'requirements'`等）
  - 1番目のフェーズの実行結果が`results`に含まれること

---

#### 3.1.2 ヘルスチェック有効・続行フロー

**シナリオID**: INT-003
**シナリオ名**: ヘルスチェック有効・shouldStop:false時にフェーズ実行が続行される

- **目的**: ネットワークヘルスチェックが`shouldStop: false`を返した場合、フェーズが通常通り実行されることを検証する（AC-002-3）
- **前提条件**:
  - `context.networkHealthCheck = true`
  - `checkNetworkHealth()`が常に`{ available: true, shouldStop: false, ... }`を返す
- **期待結果**: フェーズが通常通り実行され、`createPhaseInstance`→`phaseInstance.run()`が呼ばれる

---

**シナリオID**: INT-004
**シナリオ名**: ヘルスチェック有効・available:false時にフェーズ実行が続行される

- **目的**: ネットワークヘルスチェックが`available: false`を返した場合（非EC2環境等）、チェックがスキップされフェーズが続行されることを検証する（AC-003-1）
- **前提条件**:
  - `context.networkHealthCheck = true`
  - `checkNetworkHealth()`が`{ available: false, shouldStop: false, ... }`を返す
- **期待結果**: フェーズが通常通り実行される

---

#### 3.1.3 ヘルスチェック無効時のスキップ動作

**シナリオID**: INT-005
**シナリオ名**: ヘルスチェック無効（デフォルト）時にcheckNetworkHealthが一切呼ばれない

- **目的**: `--network-health-check`が無効（デフォルト）の場合、ネットワークヘルスチェック関連の処理が一切実行されないことを検証する（NFR-001-4、AC-001-2）
- **前提条件**:
  - `context.networkHealthCheck = false`（または未設定）
- **期待結果**:
  - `network-health-checker`モジュールの動的インポートが呼ばれないこと
  - `checkNetworkHealth()`が呼ばれないこと
  - フェーズが通常通り実行されること

---

**シナリオID**: INT-006
**シナリオ名**: ヘルスチェック無効・networkHealthCheckがundefined時にスキップされる

- **目的**: `PhaseContext`に`networkHealthCheck`プロパティが存在しない場合（後方互換性）、ヘルスチェックがスキップされることを検証する（NFR-005-3）
- **前提条件**: `context`に`networkHealthCheck`プロパティが設定されていない（既存のテストフィクスチャと同じ状態）
- **期待結果**: フェーズが通常通り実行される

---

#### 3.1.4 ExecutionSummaryの構造検証

**シナリオID**: INT-007
**シナリオ名**: グレースフル停止時のExecutionSummaryにstoppedReasonフィールドが含まれる

- **目的**: ネットワーク低下による停止時の`ExecutionSummary`が要件通りの構造を持つことを検証する（FR-004-3）
- **前提条件**: ヘルスチェック有効、`shouldStop: true`
- **期待結果**:
  ```typescript
  expect(summary).toMatchObject({
    success: false,
    stoppedReason: 'network_throughput_degraded',
    failedPhase: expect.any(String),
    error: expect.stringContaining('Network throughput degraded'),
    results: expect.any(Object),
  });
  ```

---

**シナリオID**: INT-008
**シナリオ名**: 通常の全フェーズ成功時のExecutionSummaryにstoppedReasonが含まれない

- **目的**: ネットワークヘルスチェック機能追加後も、通常の全フェーズ成功時の`ExecutionSummary`構造が変更されないことを検証する（NFR-005-2）
- **前提条件**: ヘルスチェック無効、全フェーズ成功
- **期待結果**:
  ```typescript
  expect(summary).toMatchObject({
    success: true,
    results: expect.any(Object),
  });
  expect(summary.stoppedReason).toBeUndefined();
  ```

---

#### 3.1.5 skipPhasesとの併用

**シナリオID**: INT-009
**シナリオ名**: ヘルスチェックとskipPhasesの併用時にスキップされたフェーズではヘルスチェックが不要

- **目的**: `skipPhases`でスキップされるフェーズの前でもヘルスチェックが実行されるが、`continue`によりフェーズ自体は実行されないことを検証する。ヘルスチェック → skipPhases判定の順序が設計通りであることを確認する
- **前提条件**:
  - `context.networkHealthCheck = true`
  - `context.skipPhases = ['requirements']`
  - `checkNetworkHealth()`は常に`{ available: true, shouldStop: false }`を返す
- **期待結果**:
  - `checkNetworkHealth`が各フェーズ開始前に呼ばれること（スキップフェーズ含む）
  - `requirements`フェーズの実行（`phaseInstance.run()`）はスキップされること

---

#### 3.1.6 レジューム機能との互換性

**シナリオID**: INT-010
**シナリオ名**: executePhasesFromを通じてもネットワークヘルスチェックが適用される

- **目的**: `executePhasesFrom()`が`executePhasesSequential()`に委譲しているため、レジューム実行時にもネットワークヘルスチェックが自動的に適用されることを検証する（FR-003-3、AC-004-1）
- **前提条件**:
  - `context.networkHealthCheck = true`
  - `checkNetworkHealth()`が`shouldStop: true`を返す
  - `startPhase = 'implementation'`（途中からのレジューム）
- **テスト手順**:
  1. `executePhasesFrom('implementation', context, gitManager)`を呼び出す
  2. `checkNetworkHealth`が呼ばれたことを検証する
  3. `ExecutionSummary`に`stoppedReason`が含まれることを検証する
- **期待結果**:
  - `ExecutionSummary.success === false`
  - `ExecutionSummary.stoppedReason === 'network_throughput_degraded'`
  - `ExecutionSummary.failedPhase === 'implementation'`

---

## 4. テストデータ

### 4.1 IMDSv2モックデータ

```typescript
// 正常系データ
const MOCK_IMDS_TOKEN = 'AQAAAAIQf3vEJHRUwn...mock-token';
const MOCK_INSTANCE_ID = 'i-0abcdef1234567890';
const MOCK_AVAILABILITY_ZONE = 'ap-northeast-1a';
const MOCK_REGION = 'ap-northeast-1';

// IMDSv2エンドポイント
const IMDS_TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const IMDS_INSTANCE_ID_URL = 'http://169.254.169.254/latest/meta-data/instance-id';
const IMDS_AZ_URL = 'http://169.254.169.254/latest/meta-data/placement/availability-zone';
```

### 4.2 CloudWatchメトリクスモックデータ

```typescript
// メトリクス正常時（低下率20%）
const MOCK_HEALTHY_METRICS = {
  NetworkPacketsOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 800 },
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 1000 },
      { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 950 },
      { Timestamp: new Date('2024-01-01T00:15:00Z'), Average: 900 },
      { Timestamp: new Date('2024-01-01T00:20:00Z'), Average: 850 },
      { Timestamp: new Date('2024-01-01T00:25:00Z'), Average: 920 },
      { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 880 },
      { Timestamp: new Date('2024-01-01T00:35:00Z'), Average: 910 },
      { Timestamp: new Date('2024-01-01T00:40:00Z'), Average: 870 },
      { Timestamp: new Date('2024-01-01T00:45:00Z'), Average: 860 },
      { Timestamp: new Date('2024-01-01T00:50:00Z'), Average: 840 },
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 800 }, // current (最新)
    ],
  },
  NetworkOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 4000000 },
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 5000000 }, // peak
      { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 4800000 },
      { Timestamp: new Date('2024-01-01T00:15:00Z'), Average: 4500000 },
      { Timestamp: new Date('2024-01-01T00:20:00Z'), Average: 4300000 },
      { Timestamp: new Date('2024-01-01T00:25:00Z'), Average: 4600000 },
      { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 4400000 },
      { Timestamp: new Date('2024-01-01T00:35:00Z'), Average: 4500000 },
      { Timestamp: new Date('2024-01-01T00:40:00Z'), Average: 4200000 },
      { Timestamp: new Date('2024-01-01T00:45:00Z'), Average: 4100000 },
      { Timestamp: new Date('2024-01-01T00:50:00Z'), Average: 4050000 },
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 4000000 }, // current
    ],
  },
};

// メトリクス低下時（低下率80%以上）
const MOCK_DEGRADED_METRICS = {
  NetworkPacketsOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 900 },
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 1000 }, // peak
      { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 950 },
      { Timestamp: new Date('2024-01-01T00:15:00Z'), Average: 800 },
      { Timestamp: new Date('2024-01-01T00:20:00Z'), Average: 600 },
      { Timestamp: new Date('2024-01-01T00:25:00Z'), Average: 500 },
      { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 400 },
      { Timestamp: new Date('2024-01-01T00:35:00Z'), Average: 350 },
      { Timestamp: new Date('2024-01-01T00:40:00Z'), Average: 300 },
      { Timestamp: new Date('2024-01-01T00:45:00Z'), Average: 250 },
      { Timestamp: new Date('2024-01-01T00:50:00Z'), Average: 220 },
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 200 }, // current (80%低下)
    ],
  },
  NetworkOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 4500000 },
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 5000000 }, // peak
      { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 4800000 },
      { Timestamp: new Date('2024-01-01T00:15:00Z'), Average: 4000000 },
      { Timestamp: new Date('2024-01-01T00:20:00Z'), Average: 3000000 },
      { Timestamp: new Date('2024-01-01T00:25:00Z'), Average: 2500000 },
      { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 2000000 },
      { Timestamp: new Date('2024-01-01T00:35:00Z'), Average: 1500000 },
      { Timestamp: new Date('2024-01-01T00:40:00Z'), Average: 1000000 },
      { Timestamp: new Date('2024-01-01T00:45:00Z'), Average: 800000 },
      { Timestamp: new Date('2024-01-01T00:50:00Z'), Average: 600000 },
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 500000 }, // current (90%低下)
    ],
  },
};

// 片方のみ低下（AND条件テスト用）
const MOCK_PARTIAL_DEGRADATION_METRICS = {
  NetworkPacketsOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 1000 }, // peak
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 200 },  // current (80%低下)
    ],
  },
  NetworkOut: {
    Datapoints: [
      { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 5000000 }, // peak
      { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 4000000 }, // current (20%低下)
    ],
  },
};
```

### 4.3 PhaseContextモックデータ

```typescript
// ヘルスチェック有効のコンテキスト
function createMockContextWithHealthCheck(
  overrides?: Partial<PhaseContext>
): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: { updatePhaseStatus: jest.fn() } as any,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
    networkHealthCheck: true,
    networkThroughputDropThreshold: 70,
    ...overrides,
  };
}

// ヘルスチェック無効のコンテキスト（既存互換）
function createMockContextWithoutHealthCheck(): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: { updatePhaseStatus: jest.fn() } as any,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
    // networkHealthCheck、networkThroughputDropThreshold は未設定
  };
}
```

### 4.4 ExecuteCommandOptionsモックデータ

```typescript
// ネットワークヘルスチェック有効のCLIオプション
const OPTIONS_WITH_HEALTH_CHECK: ExecuteCommandOptions = {
  issue: '721',
  phase: 'all',
  networkHealthCheck: true,
  networkThroughputDropThreshold: 70,
};

// ネットワークヘルスチェック無効（デフォルト）のCLIオプション
const OPTIONS_WITHOUT_HEALTH_CHECK: ExecuteCommandOptions = {
  issue: '721',
  phase: 'all',
};

// カスタム閾値のCLIオプション
const OPTIONS_WITH_CUSTOM_THRESHOLD: ExecuteCommandOptions = {
  issue: '721',
  phase: 'all',
  networkHealthCheck: true,
  networkThroughputDropThreshold: 50,
};

// バリデーションエラーのCLIオプション
const OPTIONS_INVALID_THRESHOLD: ExecuteCommandOptions = {
  issue: '721',
  phase: 'all',
  networkThroughputDropThreshold: 101,
};
```

---

## 5. テスト環境要件

### 5.1 テスト実行環境

| 項目 | 要件 |
|------|------|
| Node.js | 20以上（`fetch` API、`AbortSignal.timeout()`使用） |
| テストフレームワーク | Jest（ESMモード） |
| テストランナー | `npm run test:unit` / `npm run test:integration` |
| CI環境 | Jenkins（既存CI設定を使用） |
| 品質ゲート | `npm run validate`（lint + test + build） |

### 5.2 モック/スタブの必要性

| 対象 | モック方法 | 理由 |
|------|----------|------|
| グローバル`fetch` API | `jest.unstable_mockModule()`またはグローバルfetchのスパイ | IMDSv2エンドポイントへの実際のHTTPリクエストを防止 |
| `@aws-sdk/client-cloudwatch` | `jest.unstable_mockModule()`で`CloudWatchClient`と`GetMetricStatisticsCommand`をモック | AWS CloudWatch APIへの実際の呼び出しを防止 |
| `logger` | `jest.spyOn(logger, 'warn')`等 | ログ出力の検証 |
| `createPhaseInstance` | `jest.unstable_mockModule()`で`phase-factory`モジュールをモック | 実際のフェーズ実行を防止（統合テスト時） |
| `network-health-checker` | `jest.unstable_mockModule()`でモジュール全体をモック | ワークフロー統合テストでのヘルスチェック結果制御 |

### 5.3 ESMモッキングパターン

```typescript
// ESMモジュールのモックパターン（本プロジェクトの規約）
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// モックの定義（テストファイルの先頭）
const mockCheckNetworkHealth = jest.fn();
jest.unstable_mockModule('../../core/network-health-checker.js', () => ({
  checkNetworkHealth: mockCheckNetworkHealth,
}));

// 動的インポート（モック定義の後）
const { executePhasesSequential } = await import(
  '../../commands/execute/workflow-executor.js'
);

// テスト内でのモック設定
beforeEach(() => {
  jest.restoreAllMocks();
  mockCheckNetworkHealth.mockResolvedValue({
    available: true,
    shouldStop: false,
    networkPacketsOutCurrent: 800,
    networkPacketsOutPeak: 1000,
    networkOutCurrent: 4000000,
    networkOutPeak: 5000000,
    dropPercentage: 20,
  });
});
```

### 5.4 テスト実行コマンド

```bash
# ユニットテストのみ実行
npm run test:unit

# 特定のテストファイルのみ実行
npx jest tests/unit/core/network-health-checker.test.ts
npx jest tests/unit/commands/execute/options-parser.test.ts
npx jest tests/unit/commands/execute/workflow-executor.test.ts
npx jest tests/unit/core/config.test.ts

# 統合検証（lint + test + build）
npm run validate
```

---

## 6. テストカバレッジマトリクス

### 6.1 要件トレーサビリティ

| 要件ID | 要件概要 | テストケースID |
|--------|---------|-------------|
| FR-001 | CLIオプション追加 | OPT-001〜OPT-007 |
| FR-002 | ネットワークヘルスチェッカーモジュール | NHC-001〜NHC-028 |
| FR-003 | フェーズ実行ループへの統合 | INT-001〜INT-010 |
| FR-004 | 型定義の拡張 | INT-007, INT-008 |
| FR-005 | 設定管理の拡張 | CFG-001〜CFG-011 |
| FR-006 | オプション解析の拡張 | OPT-001〜OPT-013 |

### 6.2 受け入れ基準トレーサビリティ

| 受け入れ基準ID | 概要 | テストケースID |
|-------------|------|-------------|
| AC-001-1 | ヘルスチェック有効化 | OPT-002, INT-001 |
| AC-001-2 | ヘルスチェックデフォルト無効 | OPT-001, INT-005, INT-006 |
| AC-001-3 | 閾値カスタマイズ | OPT-004, NHC-005 |
| AC-001-4 | 閾値バリデーション | OPT-009, OPT-010, OPT-011 |
| AC-002-1 | 両メトリクス低下時の停止 | NHC-002, INT-001 |
| AC-002-2 | 片方のみ低下時の続行 | NHC-003, NHC-004 |
| AC-002-3 | 閾値未満時の続行 | NHC-001, INT-003 |
| AC-002-4 | 停止時のログ出力 | NHC-027, NHC-028 |
| AC-003-1 | IMDSv2タイムアウト時のスキップ | NHC-012, INT-004 |
| AC-003-2 | CloudWatch APIエラー時のスキップ | NHC-014 |
| AC-003-3 | データポイント欠損時のスキップ | NHC-015, NHC-021 |
| AC-004-1 | レジューム実行との互換性 | INT-010 |
| AC-005-1 | 環境変数での有効化 | CFG-001, CFG-002 |
| AC-005-2 | 環境変数での閾値設定 | CFG-007 |
| AC-005-3 | 環境変数未設定時のデフォルト | CFG-004, CFG-008 |

---

## 7. 品質ゲートチェックリスト（Phase 3）

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテスト（28ケース）とインテグレーションテスト（10シナリオ）を定義済み
- [x] **主要な正常系がカバーされている**: メトリクス正常（NHC-001）、メトリクス低下による停止（NHC-002）、AND条件（NHC-003, NHC-004）、カスタム閾値（NHC-005）、オプション解析（OPT-001〜007）、環境変数（CFG-001〜011）、ワークフロー統合（INT-001〜010）
- [x] **主要な異常系がカバーされている**: 非EC2環境フォールバック（NHC-012）、IMDSv2部分障害（NHC-013）、CloudWatchエラー（NHC-014）、データポイント欠損（NHC-015）、ネットワーク接続エラー（NHC-016）、閾値バリデーションエラー（OPT-009〜011）
- [x] **期待結果が明確である**: 全テストケースに具体的な入力データ・モックデータ・期待結果（TypeScriptコード形式）を記載済み
