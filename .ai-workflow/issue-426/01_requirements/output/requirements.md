# 要件定義書: Issue #426 - PR comment: Jenkinsリビルド時にresume機能が動作しない

## 0. Planning Documentの確認

### 開発計画の概要

| 項目 | 内容 |
|------|------|
| **複雑度** | 中程度 |
| **見積もり工数** | 6〜10時間 |
| **リスク評価** | 低 |
| **実装戦略** | EXTEND（既存コードの拡張） |
| **テスト戦略** | UNIT_INTEGRATION（ユニット + インテグレーション） |
| **テストコード戦略** | EXTEND_TEST（既存テストファイルに追加） |

### 主要な変更対象（計画から）

1. `src/commands/pr-comment/init.ts` - 既存メタデータの存在チェックを追加
2. `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` - Check Resumeステージとwhen条件を追加
3. `tests/integration/pr-comment-workflow.test.ts` - スキップテストとリビルドシナリオのテストを追加

---

## 1. 概要

### 1.1 背景

PR comment execute ジョブをJenkinsでリビルドする際、既にinitステージが完了している場合でも、resumeせずにinitから再実行されてしまう問題が発生している。これにより、既存のメタデータが上書きされ、重複処理や中間状態の喪失が発生する。

### 1.2 目的

Jenkinsでのリビルド時に、既存のメタデータを検出し、initステージをスキップしてanalyzeまたはexecuteステージから適切に再開できるようにする。

### 1.3 ビジネス価値・技術的価値

| 価値タイプ | 説明 |
|-----------|------|
| **UX改善** | 手動回避が不要になり、リビルド操作の信頼性が向上 |
| **運用効率** | 失敗したジョブのリビルド時に中間状態から再開でき、無駄な再実行を回避 |
| **データ整合性** | メタデータの上書きや重複処理を防止し、コスト追跡等の情報を保持 |
| **障害復旧** | Jenkins障害やタイムアウト後の復旧が容易になる |

---

## 2. 機能要件

### FR-001: メタデータ存在チェック機能（優先度: 高）

| 項目 | 内容 |
|------|------|
| **ID** | FR-001 |
| **名称** | pr-comment init コマンドのメタデータ存在チェック |
| **説明** | `pr-comment init` コマンド実行時、対象PRのメタデータファイルが既に存在する場合は初期化処理をスキップする |
| **入力** | PR URL または PR番号 |
| **出力** | メタデータが存在する場合: 警告ログを出力し正常終了（exit code 0）、存在しない場合: 従来通り初期化処理を実行 |
| **検証方法** | ユニットテスト、インテグレーションテスト |

### FR-002: Jenkinsfile Resume判定機能（優先度: 高）

| 項目 | 内容 |
|------|------|
| **ID** | FR-002 |
| **名称** | JenkinsfileへのCheck Resumeステージ追加 |
| **説明** | パイプライン実行時にメタデータファイルの存在を確認し、initステージの実行要否を判定する環境変数を設定する |
| **入力** | メタデータファイルパス（`${REPOS_ROOT}/${REPO_NAME}/.ai-workflow/pr-${PR_NUMBER}/comment-resolution-metadata.json`） |
| **出力** | 環境変数 `SHOULD_INIT`（`true` または `false`） |
| **検証方法** | Jenkinsパイプラインの動作確認 |

### FR-003: Initステージ条件分岐（優先度: 高）

| 項目 | 内容 |
|------|------|
| **ID** | FR-003 |
| **名称** | PR Comment Initステージへのwhen条件追加 |
| **説明** | `SHOULD_INIT == 'true'` の場合のみPR Comment Initステージを実行する |
| **入力** | 環境変数 `SHOULD_INIT` |
| **出力** | 条件に基づくステージの実行/スキップ |
| **検証方法** | Jenkinsパイプラインの動作確認 |

### FR-004: スキップ時のログ出力（優先度: 中）

| 項目 | 内容 |
|------|------|
| **ID** | FR-004 |
| **名称** | スキップ時の情報ログ出力 |
| **説明** | メタデータが存在してinitをスキップする場合、ユーザーに適切な情報を提供するログを出力する |
| **入力** | メタデータ存在確認結果 |
| **出力** | 警告/情報ログ（「Metadata already exists. Skipping initialization.」等） |
| **検証方法** | ログ出力の確認 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| ID | 要件 | 基準 |
|----|------|------|
| NFR-P001 | メタデータ存在チェックの応答時間 | 1秒以内 |
| NFR-P002 | Check Resumeステージの実行時間 | 5秒以内 |

### 3.2 信頼性要件

| ID | 要件 | 基準 |
|----|------|------|
| NFR-R001 | メタデータ存在チェックの正確性 | ファイルシステムの状態を正確に反映 |
| NFR-R002 | 既存ワークフローとの互換性 | 新規実行時の動作に影響を与えない |
| NFR-R003 | エラー時の挙動 | メタデータチェックでエラー発生時も適切にハンドリング |

### 3.3 保守性・拡張性要件

| ID | 要件 | 基準 |
|----|------|------|
| NFR-M001 | コードの可読性 | 既存コードスタイルとの一貫性を維持 |
| NFR-M002 | テストカバレッジ | 新規追加コードに対して80%以上 |
| NFR-M003 | 将来の拡張性 | analyze/executeステージのresume対応への拡張が容易な設計 |

### 3.4 運用性要件

| ID | 要件 | 基準 |
|----|------|------|
| NFR-O001 | ログの可視性 | スキップ理由がJenkinsコンソールで明確に確認可能 |
| NFR-O002 | トラブルシューティング | メタデータパスがログに出力され、問題調査が容易 |

---

## 4. 制約事項

### 4.1 技術的制約

| ID | 制約 | 詳細 |
|----|------|------|
| TC-001 | 使用言語 | TypeScript（Node.js）- 既存コードとの整合性 |
| TC-002 | Jenkinsfile構文 | Declarative Pipeline構文を維持 |
| TC-003 | 既存API | `PRCommentMetadataManager.exists()` メソッドを活用 |
| TC-004 | 終了コード | initスキップ時はexit code 0で終了（エラーではない） |

### 4.2 リソース制約

| ID | 制約 | 詳細 |
|----|------|------|
| RC-001 | 実装工数 | 6〜10時間（Planning Documentに基づく） |
| RC-002 | 影響範囲 | 変更は2ファイル + テストファイルに限定 |

### 4.3 ポリシー制約

| ID | 制約 | 詳細 |
|----|------|------|
| PC-001 | コーディング規約 | プロジェクトの既存コーディング規約に準拠 |
| PC-002 | テスト必須 | 新規コードには必ずテストを追加 |
| PC-003 | 後方互換性 | 既存の `--pr` / `--issue` オプションの動作を維持 |

---

## 5. 前提条件

### 5.1 システム環境

| ID | 前提条件 |
|----|----------|
| PRE-001 | Node.js 環境が利用可能 |
| PRE-002 | Jenkins Declarative Pipelineが動作可能 |
| PRE-003 | ファイルシステムへの読み取りアクセスが可能 |

### 5.2 依存コンポーネント

| ID | コンポーネント | バージョン/状態 |
|----|---------------|----------------|
| DEP-001 | `PRCommentMetadataManager` クラス | 既存実装（`exists()` メソッドが利用可能） |
| DEP-002 | `fs-extra` パッケージ | 現行バージョン |
| DEP-003 | Jenkins共通ライブラリ | `jenkins/shared/common.groovy` |

### 5.3 外部システム連携

| ID | 外部システム | 連携内容 |
|----|-------------|----------|
| EXT-001 | GitHub API | PR情報の取得（既存機能、本Issue影響なし） |
| EXT-002 | ファイルシステム | メタデータファイルの存在確認 |

---

## 6. 受け入れ基準

### AC-001: 新規実行時の動作（FR-001関連）

```gherkin
Given PR #123 のメタデータが存在しない
When `pr-comment init --pr-url https://github.com/owner/repo/pull/123` を実行する
Then メタデータファイルが作成される
And 初期化完了ログが出力される
And 終了コード 0 で終了する
```

### AC-002: リビルド時のスキップ動作（FR-001関連）

```gherkin
Given PR #123 のメタデータが既に存在する
When `pr-comment init --pr-url https://github.com/owner/repo/pull/123` を実行する
Then 初期化処理はスキップされる
And 警告ログ「Metadata already exists. Skipping initialization.」が出力される
And 情報ログ「Use "pr-comment analyze" or "pr-comment execute" to resume.」が出力される
And 終了コード 0 で終了する
And 既存メタデータは上書きされない
```

### AC-003: JenkinsでのCheck Resumeステージ動作（FR-002関連）

```gherkin
Given PR comment executeパイプラインが実行される
When Check Resumeステージが実行される
Then メタデータファイルの存在が確認される
And メタデータが存在する場合、SHOULD_INIT='false' が設定される
And メタデータが存在しない場合、SHOULD_INIT='true' が設定される
```

### AC-004: Jenkinsでのinitステージスキップ（FR-003関連）

```gherkin
Given SHOULD_INIT='false' が設定されている（メタデータ存在）
When PR Comment Initステージが評価される
Then Initステージはスキップされる
And パイプラインはAnalyzeステージに進む
```

### AC-005: Jenkinsでのinitステージ実行（FR-003関連）

```gherkin
Given SHOULD_INIT='true' が設定されている（メタデータ不在）
When PR Comment Initステージが評価される
Then Initステージが実行される
And メタデータが初期化される
```

### AC-006: 既存オプションの後方互換性

```gherkin
Given PR #123 のメタデータが存在しない
When `pr-comment init --pr 123` を実行する（旧オプション形式）
Then 従来通り初期化処理が実行される
And 終了コード 0 で終了する
```

### AC-007: エラーハンドリング

```gherkin
Given メタデータファイルの存在確認時にI/Oエラーが発生する
When `pr-comment init --pr-url https://github.com/owner/repo/pull/123` を実行する
Then エラーログが出力される
And 終了コード 1 で終了する
```

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

| ID | 項目 | 理由 |
|----|------|------|
| OUT-001 | analyzeステージのresume機能 | 別Issue（#425）で対応予定 |
| OUT-002 | executeステージのresume機能 | 別Issue（#425）で対応予定 |
| OUT-003 | 強制再初期化オプション（`--force`）の追加 | 将来の拡張候補として検討 |
| OUT-004 | メタデータの自動クリーンアップ機能 | 既存の `pr-comment finalize` で対応可能 |
| OUT-005 | Jenkinsパイプラインの大規模リファクタリング | 最小限の変更に留める |

### 7.2 将来的な拡張候補

| ID | 項目 | 説明 |
|----|------|------|
| FUT-001 | `--force` オプション | 既存メタデータを強制的に上書きして再初期化 |
| FUT-002 | resume状態のサマリー表示 | スキップ時に既存メタデータの状態（completed/pending数等）を表示 |
| FUT-003 | analyzeステージのresume | 分析途中からの再開機能 |
| FUT-004 | 部分的な再実行 | 特定コメントのみ再処理するオプション |

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| **メタデータ** | PRコメント対応の状態を管理するJSONファイル（`comment-resolution-metadata.json`） |
| **initステージ** | PRから未解決コメントを取得してメタデータを初期化するフェーズ |
| **analyzeステージ** | 全コメントを一括分析してresponse-plan.mdを生成するフェーズ |
| **executeステージ** | response-plan.mdに基づいて対応を実行するフェーズ |
| **リビルド** | Jenkinsで失敗/成功したビルドを再実行すること |
| **resume** | 中断された処理を途中から再開すること |

---

## 9. 品質ゲート達成状況

- [x] **機能要件が明確に記載されている** - FR-001〜FR-004で定義済み
- [x] **受け入れ基準が定義されている** - AC-001〜AC-007でGiven-When-Then形式で定義済み
- [x] **スコープが明確である** - セクション7でスコープ外を明示
- [x] **論理的な矛盾がない** - 機能要件と受け入れ基準が対応、制約事項と整合

---

## 10. 関連ドキュメント・Issue

| 種別 | 参照先 |
|------|--------|
| Planning Document | `.ai-workflow/issue-426/00_planning/output/planning.md` |
| 親Issue | #425: Resume機能とエラーハンドリングの改善 |
| 関連Issue | #409: PR comment resolution の2段階ワークフロー実装 |
| 対象ソースコード | `src/commands/pr-comment/init.ts` |
| 対象Jenkinsfile | `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` |
| 対象テストファイル | `tests/integration/pr-comment-workflow.test.ts` |

---

**作成日**: 2025年12月14日
**作成者**: AI Workflow Agent
**バージョン**: 1.0.0
