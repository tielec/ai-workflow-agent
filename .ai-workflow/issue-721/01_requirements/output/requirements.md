# 要件定義書: Issue #721

## executeコマンドにEC2ネットワークスループット低下検知によるグレースフル停止機能を追加

---

## 0. Planning Documentの確認

### 開発計画の全体像

Planning Phase（Phase 0）で策定された計画に基づき、以下の戦略を確認済み：

- **実装戦略**: EXTEND（既存コードの拡張 + 新規モジュール1つの追加）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 12〜16時間
- **複雑度**: 中程度
- **リスク評価**: 中（AWS SDK依存、非EC2環境フォールバック、CloudWatch APIレート制限、メトリクス誤検知）

### スコープ確認

- 新規モジュール: `src/core/network-health-checker.ts`（1ファイル）
- 変更対象: 6〜7ファイル（型定義、CLI、設定、オプション解析、ワークフロー実行、Jenkinsfile）
- 新規依存: `@aws-sdk/client-cloudwatch`（1パッケージ）
- 破壊的変更: なし（全オプションはデフォルトで無効）

### 技術選定確認

- AWS SDK v3のモジュラーアーキテクチャ（`@aws-sdk/client-cloudwatch`のみ）を採用
- IMDSv2はNode.js標準の`fetch` APIで直接呼び出し（追加依存不要）
- SigV4署名の手動実装は工数・保守コストから非推奨とし、SDK使用を決定

---

## 1. 概要

### 背景

Jenkins環境（EC2フリートインスタンス）で`execute --phase all`を実行する際、T系インスタンスのネットワーク帯域バースト制限により、約1時間経過後に`NetworkPacketsOut`および`NetworkOut`メトリクスが極端に低下する現象が発生している。この状態ではAPI呼び出し（OpenAI/Anthropic API、GitHub API等）のレイテンシが増大し、残フェーズの実行時間が大幅に延長される。

当初はCPUクレジット枯渇が原因と推測されていたが、調査の結果、**ネットワークスループットの低下が根本原因**であることが判明した。

### 目的

フェーズ開始前にEC2インスタンスのネットワークスループットをチェックし、低下検知時にグレースフル停止する機能をオプションとして追加する。これにより、以下を実現する：

1. ネットワーク帯域低下状態での無駄な実行時間を削減する
2. 帯域回復後にジョブをレジューム実行する運用フローを確立する
3. 全体のワークフロースループットを向上させる

### ビジネス価値

- **コスト削減**: ネットワーク帯域低下時の無駄なAPI呼び出し（レイテンシ増大による実効時間の増加）を回避し、APIコストおよびEC2インスタンス利用時間を削減
- **スループット向上**: ジョブの早期終了→帯域回復後のレジューム実行により、全体の完了時間を短縮
- **運用効率改善**: ネットワーク帯域低下を自動検知し、人手による監視・介入の負担を軽減

### 技術的価値

- **既存レジューム機能との統合**: `executePhasesFrom()`が`executePhasesSequential()`に委譲する既存アーキテクチャを活用し、追加コード量を最小化
- **オプショナル機能**: デフォルト無効のため既存動作に影響なし、段階的な導入が可能
- **拡張可能な設計**: 将来的にCPUクレジットやメモリなど他のリソース監視を追加する際の基盤となる

---

## 2. 機能要件

### FR-001: CLIオプションの追加（優先度: 高）

`execute`コマンドに以下の2つのCLIオプションを追加する。

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `--network-health-check` | boolean | `false` | ネットワークヘルスチェックを有効化する |
| `--network-throughput-drop-threshold` | number | `70` | スループット低下率の閾値（%）。直近メトリクスがピーク値からこの割合以上低下した場合に停止する |

**詳細仕様:**
- FR-001-1: `--network-health-check`はboolean型フラグとして動作し、指定時に`true`となる
- FR-001-2: `--network-throughput-drop-threshold`は0〜100の範囲の数値を受け付ける。範囲外の値が指定された場合はバリデーションエラーを返す
- FR-001-3: `--network-throughput-drop-threshold`は`--network-health-check`が有効な場合のみ意味を持つ（無効時は無視される）
- FR-001-4: 環境変数`NETWORK_HEALTH_CHECK`（boolean）および`NETWORK_THROUGHPUT_DROP_THRESHOLD`（number）でもデフォルト値を設定可能とする。CLIオプションが明示的に指定された場合はCLIオプションが優先される

### FR-002: ネットワークヘルスチェッカーモジュールの新規作成（優先度: 高）

`src/core/network-health-checker.ts`を新規作成し、EC2インスタンスのネットワークスループットを評価する機能を実装する。

**詳細仕様:**

- FR-002-1: **IMDSv2によるインスタンスメタデータ取得**
  - HTTP PUTリクエストで`http://169.254.169.254/latest/api/token`からIMDSv2セッショントークンを取得する（TTL: 21600秒）
  - 取得したトークンを使用して`instance-id`および`placement/availability-zone`を取得する
  - availability-zoneの末尾1文字を除去してリージョンを導出する（例: `ap-northeast-1a` → `ap-northeast-1`）
  - すべてのIMDSv2リクエストに`AbortSignal.timeout(3000)`を設定し、3秒でタイムアウトする

- FR-002-2: **CloudWatch APIによるメトリクス取得**
  - `@aws-sdk/client-cloudwatch`の`GetMetricStatisticsCommand`を使用する
  - 取得対象メトリクス:
    - `NetworkPacketsOut`（Namespace: `AWS/EC2`、Dimension: `InstanceId`）
    - `NetworkOut`（Namespace: `AWS/EC2`、Dimension: `InstanceId`）
  - 取得期間: 現在時刻から過去1時間（`StartTime`〜`EndTime`）
  - 集計粒度: 300秒（5分）
  - 統計量: `Average`

- FR-002-3: **スループット低下率の計算ロジック**
  - 直近5分間の平均値（最新のデータポイント）を`current`とする
  - 過去1時間のデータポイントの最大値を`peak`とする
  - 低下率を`dropPercentage = (1 - current / peak) * 100`で計算する
  - `peak`が0の場合は低下率を0%とする（ゼロ除算防止）

- FR-002-4: **停止判定ロジック（AND条件）**
  - `NetworkPacketsOut`と`NetworkOut`の**両方**の低下率が閾値（`dropThreshold`）以上である場合のみ`shouldStop: true`を返す
  - 片方のメトリクスのみ低下している場合は`shouldStop: false`を返す（フェーズ間の静止期間での誤検知防止）

- FR-002-5: **戻り値の構造**
  - `NetworkHealthCheckResult`インターフェースとして以下のフィールドを含む:
    - `available: boolean` — チェックが実行可能だったか
    - `shouldStop: boolean` — 停止すべきか
    - `networkPacketsOutCurrent: number` — 直近5分の平均NetworkPacketsOut
    - `networkPacketsOutPeak: number` — 過去1時間のピークNetworkPacketsOut
    - `networkOutCurrent: number` — 直近5分の平均NetworkOut（バイト）
    - `networkOutPeak: number` — 過去1時間のピークNetworkOut（バイト）
    - `dropPercentage: number` — ピークからの低下率（%、両メトリクスの大きい方）
    - `reason?: string` — 停止理由（`shouldStop: true`の場合のみ）

### FR-003: フェーズ実行ループへの統合（優先度: 高）

`src/commands/execute/workflow-executor.ts`の`executePhasesSequential()`関数内のフェーズforループに、ネットワークヘルスチェックを統合する。

**詳細仕様:**

- FR-003-1: **チェックの挿入位置**
  - フェーズforループ内の各フェーズ開始前（`skipPhases`チェックの前）にネットワークヘルスチェックを実行する
  - `context.networkHealthCheck`が`true`の場合のみチェックを実行する

- FR-003-2: **チェック結果に基づく動作**
  - `available: true`かつ`shouldStop: true`の場合:
    - 警告ログを出力する（低下率、現在値/ピーク値、停止対象フェーズ名を含む）
    - `ExecutionSummary`を`success: false`で返却し、`stoppedReason: 'network_throughput_degraded'`を設定する
    - `failedPhase`に停止直前のフェーズ名を設定する
  - `available: true`かつ`shouldStop: false`の場合:
    - デバッグログを出力する（低下率と閾値を含む）
    - フェーズ実行を続行する
  - `available: false`の場合:
    - デバッグログを出力する（チェックスキップの旨）
    - フェーズ実行を続行する（チェックをスキップ）

- FR-003-3: **レジューム機能との互換性**
  - `executePhasesFrom()`は`executePhasesSequential()`に委譲しているため、ネットワークヘルスチェックは自動的にレジューム実行時にも適用される
  - グレースフル停止後の再実行時、レジューム機能により停止したフェーズから再開できることを保証する

### FR-004: 型定義の拡張（優先度: 高）

`src/types/commands.ts`の既存型定義を拡張する。

**詳細仕様:**

- FR-004-1: `ExecuteCommandOptions`インターフェースに以下を追加:
  - `networkHealthCheck?: boolean`
  - `networkThroughputDropThreshold?: number`

- FR-004-2: `PhaseContext`型に以下を追加:
  - `networkHealthCheck?: boolean`
  - `networkThroughputDropThreshold?: number`

- FR-004-3: `ExecutionSummary`型に以下を追加:
  - `stoppedReason?: string` — 停止理由（`'network_throughput_degraded'`等）

### FR-005: 設定管理の拡張（優先度: 中）

`src/core/config.ts`の`IConfig`インターフェースおよび`Config`クラスに環境変数アクセスメソッドを追加する。

**詳細仕様:**

- FR-005-1: `IConfig`インターフェースに以下のメソッドを追加:
  - `getNetworkHealthCheckEnabled(): boolean` — 環境変数`NETWORK_HEALTH_CHECK`のboolean値を返す（デフォルト: `false`）
  - `getNetworkThroughputDropThreshold(): number` — 環境変数`NETWORK_THROUGHPUT_DROP_THRESHOLD`の数値を返す（デフォルト: `70`）

- FR-005-2: `Config`クラスに上記メソッドの実装を追加:
  - `getNetworkHealthCheckEnabled()`: `parseBoolean(this.getEnv('NETWORK_HEALTH_CHECK', false), false)`を使用
  - `getNetworkThroughputDropThreshold()`: `parseNumericEnv('NETWORK_THROUGHPUT_DROP_THRESHOLD') ?? 70`を使用

### FR-006: オプション解析の拡張（優先度: 中）

`src/commands/execute/options-parser.ts`の解析・バリデーションロジックを拡張する。

**詳細仕様:**

- FR-006-1: `ParsedExecuteOptions`インターフェースに以下を追加:
  - `networkHealthCheck: boolean`
  - `networkThroughputDropThreshold: number`

- FR-006-2: `parseExecuteOptions()`関数で以下を実装:
  - `options.networkHealthCheck`をboolean値に正規化（`Boolean()`使用）
  - `options.networkThroughputDropThreshold`を数値に変換（未指定時はデフォルト`70`）

- FR-006-3: `validateExecuteOptions()`関数で以下のバリデーションを追加:
  - `networkThroughputDropThreshold`が0〜100の範囲内であること
  - 範囲外の場合、`ValidationResult.errors`にエラーメッセージを追加する

### FR-007: Jenkinsfileの拡張（優先度: 中）

`jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`にネットワークヘルスチェック関連のパラメータを追加する。

**詳細仕様:**

- FR-007-1: Jenkinsパラメータに`NETWORK_HEALTH_CHECK`（boolean、デフォルト: `false`）を追加する
- FR-007-2: `Execute All Phases`ステージの`sh`ブロック内で、`params.NETWORK_HEALTH_CHECK`が`true`の場合に`--network-health-check`フラグを付与する
- FR-007-3: 既存のフラグ変数パターン（`forceResetFlag`、`squashFlag`等と同様）に従い、条件付きフラグ変数`networkHealthCheckFlag`を定義する

### FR-008: AWS SDK依存の追加（優先度: 高）

`package.json`に`@aws-sdk/client-cloudwatch`パッケージを追加する。

**詳細仕様:**

- FR-008-1: `dependencies`に`@aws-sdk/client-cloudwatch`を追加する（`devDependencies`ではない）
- FR-008-2: AWS SDK v3のモジュラーアーキテクチャに従い、`@aws-sdk/client-cloudwatch`のみを追加する（フルSDKの`aws-sdk`は使用しない）
- FR-008-3: バージョンは`^3.x.x`系の最新安定版を使用する

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

- NFR-001-1: IMDSv2トークン取得は3秒以内にタイムアウトする（`AbortSignal.timeout(3000)`使用）
- NFR-001-2: ネットワークヘルスチェック全体（IMDSv2 + CloudWatch API呼び出し + 判定）は5秒以内に完了する
- NFR-001-3: ネットワークヘルスチェックは各フェーズ開始前に最大1回のみ実行する（フェーズ数 × 1回）
- NFR-001-4: `--network-health-check`が無効の場合、ヘルスチェック関連の処理は一切実行されない（条件分岐のみのオーバーヘッド）

### NFR-002: 信頼性・可用性要件

- NFR-002-1: ネットワークヘルスチェックの失敗（IMDSv2タイムアウト、CloudWatch APIエラー、データポイント欠損）はフェーズ実行をブロックしない。警告ログを出力し、チェックをスキップして続行する
- NFR-002-2: 非EC2環境（ローカル開発環境等）ではIMDSv2アクセスが3秒以内にタイムアウトし、`available: false`として処理される。フェーズ実行に影響を与えない
- NFR-002-3: CloudWatch APIの認証失敗（IAMポリシー不足等）時は`available: false`で返却し、フェーズ実行を続行する
- NFR-002-4: CloudWatchメトリクスの`Datapoints`が空の場合（新規起動直後のインスタンス等）は`available: false`として処理する

### NFR-003: 保守性・拡張性要件

- NFR-003-1: ネットワークヘルスチェッカーは独立したモジュール（`src/core/network-health-checker.ts`）として実装し、他のコアモジュールとの結合度を最小化する
- NFR-003-2: 将来的に他のリソース監視（CPU、メモリ等）を追加する際に拡張可能な設計とする（`checkNetworkHealth()`関数のインターフェースを参考に`checkCpuHealth()`等を追加可能にする）
- NFR-003-3: IMDSv2アクセスとCloudWatch API呼び出しは内部的に分離し、それぞれ独立してテスト可能にする

### NFR-004: セキュリティ要件

- NFR-004-1: AWS認証情報はJenkinsfile内の既存の環境変数（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）を使用する。新たな認証情報の管理は不要
- NFR-004-2: IMDSv2のトークンベースアクセス（IMDSv1ではなくv2）を使用し、セキュリティベストプラクティスに準拠する
- NFR-004-3: ログ出力にAWS認証情報やセンシティブ情報を含めない

### NFR-005: 後方互換性要件

- NFR-005-1: `--network-health-check`のデフォルトは`false`であり、明示的に有効化しない限り既存動作は一切変更されない
- NFR-005-2: `ExecutionSummary`の`stoppedReason`フィールドはオプショナル（`?`付き）であり、既存コードへの影響はない
- NFR-005-3: `PhaseContext`への新規フィールドはすべてオプショナルであり、既存のコンテキスト生成コードの変更は不要
- NFR-005-4: 既存のテストスイートが全て通過することを保証する

---

## 4. 制約事項

### 技術的制約

- TC-001: **プロジェクトコーディング規約の遵守**
  - `console.log`等の直接使用は禁止。`logger`モジュール（`src/utils/logger.ts`）を使用する
  - `process.env`への直接アクセスは禁止。`Config`クラス（`src/core/config.ts`）を使用する
  - `as Error`型アサーションの使用は禁止。`getErrorMessage()`/`isError()`（`src/utils/error-utils.ts`）を使用する
  - ReDoS脆弱性のある正規表現を使用しない

- TC-002: **Node.js標準fetch APIの使用**
  - IMDSv2へのHTTPリクエストにはNode.js 20以上の標準`fetch` APIを使用する（追加依存なし）
  - `AbortSignal.timeout()`はNode.js 17.3以上で利用可能であり、Node.js 20以上のプロジェクト要件を満たす

- TC-003: **AWS SDK v3モジュラーアーキテクチャ**
  - `@aws-sdk/client-cloudwatch`のみを追加し、フルSDK（`aws-sdk` v2）は使用しない
  - バンドルサイズへの影響を最小化する

- TC-004: **既存アーキテクチャとの整合性**
  - `executePhasesSequential()`のforループ構造を維持し、ループ内にチェックポイントを挿入する形で統合する
  - フェーズライフサイクル（`BasePhase.run()`の`execute()`→`review()`→`revise()`）には変更を加えない
  - メタデータ管理（`metadata.json`）のスキーマには変更を加えない

- TC-005: **テストフレームワーク**
  - JestをESMモードで使用する（既存テスト設定に準拠）
  - テストコードでは`jest.restoreAllMocks()`によるモッククリーンアップを実施する
  - ESMモジュールのモックには`jest.unstable_mockModule()`を使用する

### リソース制約

- RC-001: 見積もり工数は12〜16時間（Planning Phaseで策定済み）
- RC-002: 新規ファイルは1つ（`src/core/network-health-checker.ts`）、変更ファイルは6〜7ファイル

### ポリシー制約

- PC-001: すべてのCLIオプションはデフォルトで無効（`false`/未指定）とし、既存動作を維持する
- PC-002: `npm run validate`（lint + test + build）が全て通過することを品質ゲートとする
- PC-003: 新規環境変数（`NETWORK_HEALTH_CHECK`、`NETWORK_THROUGHPUT_DROP_THRESHOLD`）はオプショナルとし、未設定時はデフォルト値を使用する

---

## 5. 前提条件

### システム環境

- PA-001: Node.js 20以上がインストールされていること（`fetch` API、`AbortSignal.timeout()`の利用に必要）
- PA-002: TypeScript 5.x系のビルド環境が利用可能であること
- PA-003: `npm install`により`@aws-sdk/client-cloudwatch`がインストール可能であること

### 依存コンポーネント

- PA-004: `src/commands/execute/workflow-executor.ts`の`executePhasesSequential()`関数が現在のforループ構造を維持していること
- PA-005: `executePhasesFrom()`が`executePhasesSequential()`に委譲するアーキテクチャが維持されていること
- PA-006: `src/core/config.ts`の`Config`クラスが`parseBoolean()`および`parseNumericEnv()`ヘルパーメソッドを提供していること
- PA-007: `src/utils/logger.ts`の`logger`モジュールが`debug()`、`info()`、`warn()`、`error()`メソッドを提供していること
- PA-008: `src/utils/error-utils.ts`の`getErrorMessage()`関数が利用可能であること

### 外部システム連携

- PA-009: **EC2環境（Jenkins）**: IMDSv2エンドポイント（`http://169.254.169.254`）にアクセス可能であること
- PA-010: **EC2環境（Jenkins）**: IAMインスタンスプロファイルまたは環境変数により`cloudwatch:GetMetricStatistics`アクション権限が付与されていること
- PA-011: **EC2環境（Jenkins）**: `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`がJenkinsfile経由で環境変数として設定されていること
- PA-012: **非EC2環境**: IMDSv2エンドポイントへのアクセスがタイムアウトすること（`available: false`としてフォールバック）

---

## 6. 受け入れ基準

### AC-001: CLIオプションが正しく動作する

**AC-001-1: ネットワークヘルスチェックの有効化**
- **Given**: `execute`コマンドに`--network-health-check`オプションが指定されている
- **When**: コマンドが実行される
- **Then**: ネットワークヘルスチェックが各フェーズ開始前に実行される

**AC-001-2: ネットワークヘルスチェックのデフォルト無効**
- **Given**: `execute`コマンドに`--network-health-check`オプションが指定されていない
- **When**: コマンドが実行される
- **Then**: ネットワークヘルスチェックは一切実行されず、既存動作と同一の結果となる

**AC-001-3: 閾値のカスタマイズ**
- **Given**: `--network-health-check`と`--network-throughput-drop-threshold 50`が指定されている
- **When**: コマンドが実行される
- **Then**: 低下率50%を閾値としてネットワークヘルスチェックが実行される

**AC-001-4: 閾値のバリデーション**
- **Given**: `--network-throughput-drop-threshold`に101（または-1）が指定されている
- **When**: コマンドのバリデーションが実行される
- **Then**: バリデーションエラーが返され、コマンド実行は開始されない

### AC-002: ネットワークスループット低下検知時にグレースフル停止する

**AC-002-1: 両メトリクス低下時の停止**
- **Given**: EC2環境で`--network-health-check`が有効であり、`NetworkPacketsOut`と`NetworkOut`の両方のピーク値からの低下率が閾値（デフォルト70%）以上である
- **When**: 次のフェーズ開始前にネットワークヘルスチェックが実行される
- **Then**: `ExecutionSummary`が`success: false`、`stoppedReason: 'network_throughput_degraded'`で返却され、当該フェーズは実行されない

**AC-002-2: 片方のメトリクスのみ低下時の続行**
- **Given**: EC2環境で`--network-health-check`が有効であり、`NetworkPacketsOut`のみ低下率が閾値以上で、`NetworkOut`は閾値未満である
- **When**: 次のフェーズ開始前にネットワークヘルスチェックが実行される
- **Then**: チェックは`shouldStop: false`を返し、フェーズ実行が続行される

**AC-002-3: 閾値未満の低下時の続行**
- **Given**: EC2環境で`--network-health-check`が有効であり、両メトリクスの低下率が閾値未満である
- **When**: 次のフェーズ開始前にネットワークヘルスチェックが実行される
- **Then**: チェックは`shouldStop: false`を返し、フェーズ実行が続行される

**AC-002-4: 停止時のログ出力**
- **Given**: ネットワークヘルスチェックにより停止が決定された
- **When**: `ExecutionSummary`が構築される
- **Then**: 警告ログに以下が含まれる: 低下率（%）、現在値/ピーク値、停止対象フェーズ名

### AC-003: 非EC2環境でのフォールバック動作

**AC-003-1: IMDSv2タイムアウト時のスキップ**
- **Given**: 非EC2環境（ローカル開発環境等）で`--network-health-check`が有効である
- **When**: IMDSv2トークン取得が3秒以内にタイムアウトする
- **Then**: `available: false`が返却され、フェーズ実行は通常通り続行される

**AC-003-2: CloudWatch APIエラー時のスキップ**
- **Given**: EC2環境で`--network-health-check`が有効であるが、CloudWatch APIの呼び出しが失敗する（認証エラー、レート制限等）
- **When**: ネットワークヘルスチェックが実行される
- **Then**: `available: false`が返却され、警告ログが出力されてフェーズ実行は続行される

**AC-003-3: メトリクスデータポイント欠損時のスキップ**
- **Given**: EC2環境で新規起動直後（メトリクス履歴が不十分）のインスタンスで`--network-health-check`が有効である
- **When**: CloudWatch APIのレスポンスで`Datapoints`が空である
- **Then**: `available: false`が返却され、フェーズ実行は続行される

### AC-004: レジューム機能との整合性

**AC-004-1: グレースフル停止後のレジューム実行**
- **Given**: ネットワークスループット低下によりフェーズXで停止した後、帯域が回復した
- **When**: `execute --phase all --network-health-check`を再実行する
- **Then**: レジューム機能によりフェーズXから再開され、ネットワークヘルスチェックも各フェーズ開始前に引き続き実行される

### AC-005: 環境変数によるデフォルト設定

**AC-005-1: 環境変数での有効化**
- **Given**: 環境変数`NETWORK_HEALTH_CHECK=true`が設定されている
- **When**: `config.getNetworkHealthCheckEnabled()`が呼び出される
- **Then**: `true`が返却される

**AC-005-2: 環境変数での閾値設定**
- **Given**: 環境変数`NETWORK_THROUGHPUT_DROP_THRESHOLD=50`が設定されている
- **When**: `config.getNetworkThroughputDropThreshold()`が呼び出される
- **Then**: `50`が返却される

**AC-005-3: 環境変数未設定時のデフォルト**
- **Given**: 環境変数`NETWORK_HEALTH_CHECK`および`NETWORK_THROUGHPUT_DROP_THRESHOLD`が設定されていない
- **When**: 各getterメソッドが呼び出される
- **Then**: `getNetworkHealthCheckEnabled()`は`false`、`getNetworkThroughputDropThreshold()`は`70`を返却する

### AC-006: Jenkinsパイプラインとの連携

**AC-006-1: Jenkinsパラメータの追加**
- **Given**: Jenkinsジョブに`NETWORK_HEALTH_CHECK`パラメータが`true`で設定されている
- **When**: `Execute All Phases`ステージが実行される
- **Then**: `node dist/index.js execute`コマンドに`--network-health-check`フラグが付与される

**AC-006-2: Jenkinsパラメータのデフォルト**
- **Given**: Jenkinsジョブで`NETWORK_HEALTH_CHECK`パラメータが未設定（デフォルト`false`）である
- **When**: `Execute All Phases`ステージが実行される
- **Then**: `--network-health-check`フラグは付与されない

---

## 7. スコープ外

### 明確にスコープ外とする事項

- SO-001: **CPUクレジット監視機能**: 本Issueではネットワークスループットのみをチェックする。CPUクレジット（`CPUCreditBalance`メトリクス）の監視は将来的な拡張候補とする
- SO-002: **メモリ使用量監視機能**: EC2インスタンスのメモリ使用量監視は本Issueのスコープ外とする
- SO-003: **自動リトライ/自動再実行機能**: グレースフル停止後のジョブ再実行は手動（またはJenkinsの既存リトライ機構）で行う。自動的な帯域回復待ち→再実行は実装しない
- SO-004: **CloudWatch Alarmとの連携**: CloudWatch Alarmベースの通知やイベント駆動型の停止は本Issueでは実装しない
- SO-005: **リアルタイムモニタリングダッシュボード**: ネットワークメトリクスの可視化やダッシュボード機能は実装しない
- SO-006: **`NetworkIn`/`NetworkPacketsIn`メトリクスの監視**: 受信側のメトリクスは監視対象外とする（API呼び出しのボトルネックは送信側で発生するため）
- SO-007: **フェーズ実行中のリアルタイム監視**: フェーズ実行中のネットワーク状態監視は行わない。チェックはフェーズ開始前の1回のみ
- SO-008: **AWS以外のクラウド環境サポート**: Azure、GCP等のクラウド環境でのネットワーク監視は本Issueでは対応しない
- SO-009: **GitHub Issue プログレスコメントへのネットワーク状態反映**: Issue #721の本文で言及されているが、本Issueのスコープ外とする（将来的な改善候補）

### 将来的な拡張候補

- FE-001: CPUクレジット監視の追加（`CPUCreditBalance`メトリクス）
- FE-002: 複数のリソースヘルスチェックを統合したリソースヘルスチェッカーフレームワーク
- FE-003: 自動リトライ機構（帯域回復待ち→自動再実行）
- FE-004: GitHub Issueプログレスコメントへのネットワーク状態の反映
- FE-005: CloudWatch Alarmベースのイベント駆動型停止

---

## 付録A: 用語集

| 用語 | 定義 |
|------|------|
| IMDSv2 | Instance Metadata Service Version 2。EC2インスタンスのメタデータにセッショントークンベースでアクセスするサービス |
| CloudWatch | AWSの監視サービス。EC2インスタンスのメトリクス（CPU、ネットワーク等）を収集・提供する |
| NetworkPacketsOut | EC2インスタンスから送信されたパケット数のCloudWatchメトリクス |
| NetworkOut | EC2インスタンスから送信されたバイト数のCloudWatchメトリクス |
| グレースフル停止 | 実行中のフェーズを完了してから安全に停止すること。フェーズの途中で強制終了するのではなく、フェーズ開始前の判定で停止する |
| T系インスタンス | AWS EC2のバースト可能なインスタンスタイプ（t2、t3、t3a等）。CPU・ネットワーク帯域にバースト制限がある |
| レジューム実行 | 前回停止したフェーズから実行を再開すること。`execute --phase all`で自動的に停止フェーズから再開される |
| AND条件判定 | `NetworkPacketsOut`と`NetworkOut`の両方が閾値を超えた場合のみ停止判定とする論理条件 |

## 付録B: 変更対象ファイル一覧

| ファイル | 変更種別 | 影響度 | 概要 |
|---------|---------|--------|------|
| `src/core/network-health-checker.ts` | 新規作成 | なし | ネットワークヘルスチェッカーモジュール |
| `src/types/commands.ts` | 拡張 | 低 | `ExecuteCommandOptions`、`PhaseContext`、`ExecutionSummary`にフィールド追加 |
| `src/core/config.ts` | 拡張 | 低 | `IConfig`に2メソッド追加、`Config`クラスに実装追加 |
| `src/commands/execute/options-parser.ts` | 拡張 | 低 | `ParsedExecuteOptions`にフィールド追加、解析・バリデーション拡張 |
| `src/main.ts` | 拡張 | 低 | `execute`コマンドに2つのCLIオプション追加 |
| `src/commands/execute/workflow-executor.ts` | 拡張 | 中 | `executePhasesSequential()`のforループ内にヘルスチェック挿入 |
| `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` | 拡張 | 低 | パラメータとオプション受け渡し追加 |
| `package.json` | 拡張 | 低 | `@aws-sdk/client-cloudwatch`依存追加 |
| `tests/unit/core/network-health-checker.test.ts` | 新規作成 | なし | ヘルスチェッカーユニットテスト |
| `tests/unit/commands/execute/workflow-executor.test.ts` | 拡張 | 低 | ワークフロー統合テストケース追加 |
| `tests/unit/commands/execute/options-parser.test.ts` | 拡張 | 低 | オプション解析テストケース追加 |

## 付録C: 品質ゲートチェックリスト

### Phase 1（本フェーズ）品質ゲート

- [x] **機能要件が明確に記載されている**: FR-001〜FR-008の8つの機能要件を詳細仕様付きで定義済み
- [x] **受け入れ基準が定義されている**: AC-001〜AC-006の6カテゴリ、18個の受け入れ基準をGiven-When-Then形式で定義済み
- [x] **スコープが明確である**: スコープ外事項（SO-001〜SO-009）を明示的に定義済み
- [x] **論理的な矛盾がない**: 機能要件・非機能要件・制約事項・受け入れ基準の間で整合性を確認済み
