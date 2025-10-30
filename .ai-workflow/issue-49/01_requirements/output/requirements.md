# 要件定義書 - Issue #49: base-phase.ts のモジュール分解リファクタリング

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-49/00_planning/output/planning.md`）において、以下の開発方針が策定されています：

- **実装戦略**: REFACTOR（リファクタリング）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **複雑度**: 複雑（Complex）
- **総工数**: 24~32時間（3~4日）
- **リスクレベル**: 高（コアアーキテクチャのリファクタリング）
- **後方互換性**: 100%維持

本要件定義書は、Planning Documentで策定された戦略を踏まえ、具体的な機能要件、非機能要件、受け入れ基準を定義します。

---

## 1. 概要

### 1.1 背景

`src/phases/base-phase.ts` は、AI Workflow の全10フェーズの基底クラスであり、フェーズ実行ライフサイクルの中核を担っています。Issue #23において1420行から676行へリファクタリングされましたが、依然として以下の7つの異なる責務を持っており、単一責任の原則（SRP）に違反しています：

1. **フェーズライフサイクル管理**: execute/review/revise のオーケストレーション
2. **エージェント実行**: Codex/Claude エージェントの選択と実行
3. **Git統合**: ステップ単位のコミット＆プッシュ（v0.3.0で追加）
4. **GitHub API統合**: 進捗コメントの投稿・更新
5. **ファイル参照とコンテキスト構築**: オプショナルコンテキスト、@filepath参照生成
6. **ワークフロークリーンアップ**: ログ削除、アーティファクト削除
7. **ユーザーインタラクション**: 確認プロンプト（CI環境/非CI環境）

この複雑性により、以下の課題が発生しています：

- **メンテナンス困難**: 複数の責務が絡み合い、変更の影響範囲が不明瞭
- **テスト困難**: モック化が複雑で、ユニットテストが書きにくい
- **循環的複雑度**: `run()` メソッドが99行あり、制御フローの理解が困難
- **再利用不可**: 責務が密結合しており、他の文脈での再利用が不可能

### 1.2 目的

BasePhase（676行）を、単一責任の原則に基づいて4つの独立したモジュールに分解し、以下を実現します：

1. **保守性の向上**: 各モジュールの責務を明確化し、変更の影響範囲を局所化
2. **テスト容易性の向上**: モジュール単位でのユニットテストが容易
3. **循環的複雑度の削減**: `run()` メソッドを簡略化（99行 → 約50行以下）
4. **再利用性の向上**: 各モジュールが独立して再利用可能
5. **開発効率の向上**: 新規フェーズ追加時の実装コストを削減

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- **開発速度の向上**: 新規フェーズの追加や既存フェーズの変更が迅速化
- **品質の向上**: テスト容易性の向上により、バグの早期発見が可能
- **保守コストの削減**: コードベースの理解が容易になり、保守コストが削減

**技術的価値**:
- **アーキテクチャの改善**: 単一責任の原則、依存性注入パターンの適用
- **テストカバレッジの向上**: モジュール単位のテストにより、カバレッジ90%以上を達成
- **コードベースの縮小**: BasePhase 676行 → 約300行（55.6%削減）

---

## 2. 機能要件

### 2.1 モジュール分離要件（優先度: 高）

#### FR-1: StepExecutor モジュールの作成

**概要**: ステップ実行ロジック（execute/review/revise）を専門的に扱うモジュールを作成する。

**機能詳細**:
- **FR-1.1**: `executeStep()` メソッド実装
  - BasePhase.execute() を呼び出し
  - completed_steps に 'execute' を追加
  - current_step を 'execute' に設定
  - execute 完了後、current_step を null に設定
- **FR-1.2**: `reviewStep()` メソッド実装
  - BasePhase.review() を呼び出し
  - BasePhase.skipReview が true の場合、レビューをスキップ
  - completed_steps に 'review' を追加
  - current_step を 'review' に設定
  - review 完了後、current_step を null に設定
- **FR-1.3**: `reviseStep()` メソッド実装
  - ReviewCycleManager と連携してリトライロジックを実行
  - completed_steps に 'revise' を追加
  - current_step を 'revise' に設定
  - revise 完了後、current_step を null に設定
- **FR-1.4**: `commitAndPushStep()` メソッド実装
  - 各ステップ完了後に Git コミット＆プッシュを実行
  - コミットメッセージ形式: `[ai-workflow] Phase {number} ({name}) - {step} completed`
  - GitManager と連携

**配置場所**: `src/phases/lifecycle/step-executor.ts`（約120行）

**受け入れ基準**:
- Given: フェーズインスタンスとメタデータが提供される
- When: executeStep() を呼び出す
- Then: BasePhase.execute() が実行され、completed_steps に 'execute' が追加され、Git コミット＆プッシュが実行される

#### FR-2: PhaseRunner モジュールの作成

**概要**: フェーズライフサイクル全体を管理するモジュールを作成する。

**機能詳細**:
- **FR-2.1**: `run()` メソッド実装
  - 依存関係検証（validateDependencies）
  - StepExecutor を呼び出して各ステップを順次実行
  - ステータス更新（pending → in_progress → completed/failed）
  - エラーハンドリング（handleFailure）
- **FR-2.2**: `validateDependencies()` メソッド実装
  - phase-dependencies.ts と連携して依存関係を検証
  - 未完了の依存フェーズがある場合、エラーをスロー
- **FR-2.3**: `handleFailure()` メソッド実装
  - フェーズ失敗時のメタデータ更新（status: 'failed'）
  - GitHub Issue への失敗コメント投稿
  - エラースタックトレースの記録
- **FR-2.4**: `postProgress()` メソッド実装
  - ProgressFormatter と連携して進捗状況をフォーマット
  - GitHub Issue へ進捗コメントを投稿

**配置場所**: `src/phases/lifecycle/phase-runner.ts`（約100行）

**受け入れ基準**:
- Given: フェーズインスタンスとメタデータが提供される
- When: run() を呼び出す
- Then: 依存関係検証 → execute → review → revise のライフサイクルが実行され、ステータスが completed に更新される

#### FR-3: ContextBuilder モジュールの作成

**概要**: フェーズ実行時のコンテキスト構築（ファイル参照、オプショナルコンテキスト）を専門的に扱うモジュールを作成する。

**機能詳細**:
- **FR-3.1**: `buildOptionalContext()` メソッド実装
  - ファイル存在チェック（fs.existsSync）
  - ファイルが存在する場合: @filepath 参照を生成
  - ファイルが存在しない場合: フォールバックメッセージを返す
- **FR-3.2**: `getAgentFileReference()` メソッド実装
  - 相対パス解決（path.relative）
  - @filepath 形式の参照を生成
- **FR-3.3**: `getPlanningDocumentReference()` メソッド実装
  - Planning Phase の output/planning.md を参照
  - ファイルが存在しない場合のフォールバック
- **FR-3.4**: `getPhaseOutputFile()` メソッド実装
  - 各フェーズの出力ファイルパスを解決
  - メタデータから target_repository.path を取得

**配置場所**: `src/phases/context/context-builder.ts`（約100行）

**受け入れ基準**:
- Given: ファイルパスとワーキングディレクトリが提供される
- When: buildOptionalContext() を呼び出す
- Then: ファイルが存在する場合は @filepath 参照が返され、存在しない場合はフォールバックメッセージが返される

#### FR-4: ArtifactCleaner モジュールの作成

**概要**: ワークフロークリーンアップ（ログ削除、アーティファクト削除、確認プロンプト）を専門的に扱うモジュールを作成する。

**機能詳細**:
- **FR-4.1**: `cleanupWorkflowArtifacts()` メソッド実装
  - Evaluation Phase（Phase 9）完了後、.ai-workflow/issue-<NUM>/ ディレクトリ全体を削除
  - パス検証（正規表現: `\.ai-workflow[\/\\]issue-\d+$`）
  - シンボリックリンクチェック（fs.lstatSync）
  - CI環境判定（config.isCI()）
  - 確認プロンプト（force=false かつ非CI環境の場合のみ）
- **FR-4.2**: `cleanupWorkflowLogs()` メソッド実装
  - Report Phase（Phase 8）完了後、phases 00-08 の execute/review/revise ディレクトリを削除
  - metadata.json と output/*.md は保持
  - Planning Phase の output/planning.md も保持
- **FR-4.3**: `promptUserConfirmation()` メソッド実装
  - readline インターフェースを使用して確認プロンプトを表示
  - CI環境では自動的に確認をスキップ（true を返す）
- **FR-4.4**: `isCIEnvironment()` メソッド実装
  - config.isCI() を呼び出して CI 環境を判定

**配置場所**: `src/phases/cleanup/artifact-cleaner.ts`（約80行）

**受け入れ基準**:
- Given: メタデータと force フラグが提供される
- When: cleanupWorkflowLogs() を呼び出す
- Then: phases 00-08 の execute/review/revise ディレクトリが削除され、metadata.json と output/*.md が保持される

### 2.2 BasePhase リファクタリング要件（優先度: 高）

#### FR-5: BasePhase のモジュール統合

**概要**: BasePhase クラスを、新規モジュールを統合したファサードクラスとして再構成する。

**機能詳細**:
- **FR-5.1**: 依存性注入による新規モジュールの統合
  - コンストラクタで StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner を初期化
  - 既存モジュール（AgentExecutor、ReviewCycleManager、LogFormatter、ProgressFormatter）との統合
- **FR-5.2**: run() メソッドの簡略化
  - PhaseRunner に委譲（約99行 → 約20行）
- **FR-5.3**: buildOptionalContext() メソッドの委譲
  - ContextBuilder に委譲
- **FR-5.4**: cleanupWorkflowArtifacts() / cleanupWorkflowLogs() メソッドの委譲
  - ArtifactCleaner に委譲
- **FR-5.5**: 不要な private メソッドの削除
  - 各モジュールに移動済みのメソッドを削除
- **FR-5.6**: 後方互換性の保証
  - public メソッドのシグネチャは不変
  - 既存フェーズクラス（10クラス）は無変更で動作

**受け入れ基準**:
- Given: 既存の BasePhase クラスが存在する
- When: 新規モジュールを統合する
- Then: BasePhase の行数が676行から約300行に削減され、public メソッドのシグネチャが不変である

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

- **NFR-1**: 依存性注入によるオーバーヘッドは5%以内に抑える
  - モジュール初期化はコンストラクタで1回のみ実施
  - 遅延初期化（lazy initialization）は必要に応じて検討
- **NFR-2**: リファクタリング前後で実行時間が同等（±5%以内）
  - パフォーマンステストで実行時間を比較

### 3.2 セキュリティ要件

- **NFR-3**: パストラバーサル攻撃の防止
  - ArtifactCleaner でパス検証（正規表現）を実施
- **NFR-4**: シンボリックリンク攻撃の防止
  - ArtifactCleaner でシンボリックリンクチェックを実施

### 3.3 可用性・信頼性要件

- **NFR-5**: クリーンアップ失敗時もワークフロー全体は成功として扱う
  - WARNING ログのみ出力し、ワークフロー継続
- **NFR-6**: エラーハンドリングの一貫性
  - 各モジュールで適切な例外処理を実装
  - error-utils.ts の `getErrorMessage()` を使用

### 3.4 保守性・拡張性要件

- **NFR-7**: 循環的複雑度の削減
  - run() メソッドを99行から約50行以下に削減
- **NFR-8**: テストカバレッジ90%以上
  - Jest カバレッジレポートで確認
- **NFR-9**: 各モジュールは単一責任の原則に準拠
  - モジュールごとに明確な責務を持つ

---

## 4. 制約事項

### 4.1 技術的制約

- **C-1**: TypeScript を使用（既存プロジェクトと同じ）
- **C-2**: 既存の依存関係（fs-extra、simple-git、@octokit/rest）のみを使用
  - 新規ライブラリの追加は不要
- **C-3**: BasePhase の public メソッドのシグネチャは不変（後方互換性100%維持）
- **C-4**: 全10フェーズクラスのコード変更は不要（インテグレーションテストで動作確認のみ）

### 4.2 リソース制約

- **C-5**: 総工数は24~32時間（3~4日）以内
- **C-6**: 既存モジュール（Issue #23で作成）との統合複雑性を考慮

### 4.3 ポリシー制約

- **C-7**: ロギング規約（Issue #61）に準拠
  - console.log/error/warn の直接使用は禁止
  - logger.debug()、logger.info()、logger.warn()、logger.error() を使用
- **C-8**: 環境変数アクセス規約（Issue #51）に準拠
  - process.env への直接アクセスは禁止
  - Config クラスの config.getXxx() メソッドを使用
- **C-9**: エラーハンドリング規約（Issue #48）に準拠
  - `as Error` 型アサーションの使用は禁止
  - error-utils.ts の `getErrorMessage()` を使用

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 20 以上
- TypeScript 5.x
- Jest テストフレームワーク

### 5.2 依存コンポーネント

- **既存モジュール（Issue #23で作成）**:
  - AgentExecutor (`src/phases/core/agent-executor.ts`)
  - ReviewCycleManager (`src/phases/core/review-cycle-manager.ts`)
  - LogFormatter (`src/phases/formatters/log-formatter.ts`)
  - ProgressFormatter (`src/phases/formatters/progress-formatter.ts`)
- **既存モジュール（Issue #24で作成）**:
  - GitHubClient (`src/core/github-client.ts`)
  - IssueClient、PullRequestClient、CommentClient、ReviewClient
- **既存モジュール（Issue #25で作成）**:
  - GitManager (`src/core/git-manager.ts`)
  - CommitManager、BranchManager、RemoteManager
- **既存モジュール（その他）**:
  - Config (`src/core/config.ts`)
  - MetadataManager (`src/core/metadata-manager.ts`)
  - phase-dependencies (`src/core/phase-dependencies.ts`)
  - error-utils (`src/utils/error-utils.ts`)
  - logger (`src/utils/logger.ts`)

### 5.3 外部システム連携

- GitHub API（Octokit）
- Git（simple-git）

---

## 6. 受け入れ基準

### 6.1 モジュール分離の受け入れ基準

#### AC-1: StepExecutor モジュール
- Given: フェーズインスタンスとメタデータが提供される
- When: executeStep() を呼び出す
- Then: BasePhase.execute() が実行され、completed_steps に 'execute' が追加され、Git コミット＆プッシュが実行される

- Given: フェーズインスタンスとメタデータが提供される
- When: reviewStep() を呼び出す（skipReview=false）
- Then: BasePhase.review() が実行され、completed_steps に 'review' が追加され、Git コミット＆プッシュが実行される

- Given: フェーズインスタンスとメタデータが提供される
- When: reviewStep() を呼び出す（skipReview=true）
- Then: レビューがスキップされ、completed_steps に 'review' は追加されない

- Given: フェーズインスタンスとメタデータが提供される
- When: reviseStep() を呼び出す
- Then: ReviewCycleManager と連携してリトライロジックが実行され、completed_steps に 'revise' が追加される

#### AC-2: PhaseRunner モジュール
- Given: フェーズインスタンスとメタデータが提供される
- When: run() を呼び出す（依存関係が満たされている）
- Then: 依存関係検証 → execute → review → revise のライフサイクルが実行され、ステータスが completed に更新される

- Given: フェーズインスタンスとメタデータが提供される
- When: run() を呼び出す（依存関係が満たされていない）
- Then: validateDependencies() がエラーをスローし、フェーズは実行されない

- Given: フェーズインスタンスとメタデータが提供される
- When: execute ステップで失敗が発生する
- Then: handleFailure() が呼び出され、ステータスが failed に更新され、GitHub Issue へ失敗コメントが投稿される

#### AC-3: ContextBuilder モジュール
- Given: ファイルパスとワーキングディレクトリが提供される
- When: buildOptionalContext() を呼び出す（ファイルが存在する）
- Then: @filepath 参照が返される

- Given: ファイルパスとワーキングディレクトリが提供される
- When: buildOptionalContext() を呼び出す（ファイルが存在しない）
- Then: フォールバックメッセージが返される

- Given: ファイルパスとワーキングディレクトリが提供される
- When: getAgentFileReference() を呼び出す
- Then: 相対パス解決が行われ、@filepath 形式の参照が生成される

#### AC-4: ArtifactCleaner モジュール
- Given: メタデータと force フラグが提供される
- When: cleanupWorkflowLogs() を呼び出す
- Then: phases 00-08 の execute/review/revise ディレクトリが削除され、metadata.json と output/*.md が保持される

- Given: メタデータと force フラグが提供される
- When: cleanupWorkflowArtifacts() を呼び出す（force=false、非CI環境）
- Then: 確認プロンプトが表示され、ユーザーが確認後にディレクトリが削除される

- Given: メタデータと force フラグが提供される
- When: cleanupWorkflowArtifacts() を呼び出す（force=true または CI環境）
- Then: 確認プロンプトなしでディレクトリが削除される

- Given: メタデータと force フラグが提供される
- When: cleanupWorkflowArtifacts() を呼び出す（不正なパス）
- Then: パス検証エラーがスローされ、削除は実行されない

### 6.2 BasePhase リファクタリングの受け入れ基準

#### AC-5: BasePhase の行数削減
- Given: 既存の BasePhase クラス（676行）が存在する
- When: 新規モジュールを統合する
- Then: BasePhase の行数が約300行に削減される（55.6%削減）

#### AC-6: 後方互換性の保証
- Given: 既存の全10フェーズクラスが存在する
- When: BasePhase をリファクタリングする
- Then: 全10フェーズクラスのコード変更なしで動作する

#### AC-7: public メソッドのシグネチャ不変
- Given: 既存の BasePhase クラスが存在する
- When: 新規モジュールを統合する
- Then: public メソッドのシグネチャが不変である

### 6.3 非機能要件の受け入れ基準

#### AC-8: パフォーマンス要件
- Given: リファクタリング前の BasePhase が存在する
- When: リファクタリング後の BasePhase を実行する
- Then: 実行時間がリファクタリング前と同等（±5%以内）である

#### AC-9: テストカバレッジ要件
- Given: 新規モジュールが作成される
- When: ユニットテストを実行する
- Then: テストカバレッジが90%以上である

#### AC-10: 循環的複雑度の削減
- Given: 既存の BasePhase.run() メソッド（99行）が存在する
- When: PhaseRunner に委譲する
- Then: BasePhase.run() メソッドが約20行に削減される

### 6.4 統合テストの受け入れ基準

#### AC-11: 全フェーズの動作保証
- Given: リファクタリング後の BasePhase が存在する
- When: 全10フェーズのインテグレーションテストを実行する
- Then: すべてのフェーズが正常に動作する（既存テストが成功する）

#### AC-12: Git統合の動作保証
- Given: リファクタリング後の StepExecutor が存在する
- When: ステップ単位の Git コミット＆プッシュを実行する
- Then: コミットメッセージが正しく生成され、リモートにプッシュされる

#### AC-13: GitHub統合の動作保証
- Given: リファクタリング後の PhaseRunner が存在する
- When: 進捗コメントを投稿する
- Then: GitHub Issue に進捗コメントが正しく投稿される

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

- **既存モジュール（Issue #23で作成）の変更**:
  - AgentExecutor、ReviewCycleManager、LogFormatter、ProgressFormatter の変更は行わない
  - 既存モジュールのインターフェースは不変
- **全10フェーズクラスの変更**:
  - Planning、Requirements、Design、TestScenario、Implementation、TestImplementation、Testing、Documentation、Report、Evaluation の変更は行わない
  - 既存フェーズクラスは無変更で動作することを保証
- **新規機能の追加**:
  - このリファクタリングでは機能追加を一切行わない
  - リファクタリングと機能追加は分離（Martin Fowler の「リファクタリング」原則）
- **新規ライブラリの追加**:
  - 既存の依存関係（fs-extra、simple-git、@octokit/rest）のみを使用

### 7.2 将来的な拡張候補

- **Issue #50以降で検討**:
  - StepExecutor のさらなる細分化（execute/review/revise を独立したクラスに分離）
  - ContextBuilder の拡張（テンプレート変数の動的解決）
  - ArtifactCleaner の拡張（クリーンアップポリシーの外部設定化）

---

## 品質ゲートチェックリスト

- [x] **機能要件が明確に記載されている**: FR-1 〜 FR-5 で5つの機能要件を明確に定義
- [x] **受け入れ基準が定義されている**: AC-1 〜 AC-13 で13個の受け入れ基準を Given-When-Then 形式で定義
- [x] **スコープが明確である**: スコープ内（FR-1〜FR-5）とスコープ外（既存モジュール変更、新規機能追加）を明確に区分
- [x] **論理的な矛盾がない**: Planning Document の戦略（REFACTOR、UNIT_INTEGRATION、後方互換性100%維持）と整合性あり

---

**作成日**: 2025-01-21
**バージョン**: 1.0
**複雑度**: Complex
**見積もり工数**: 24~32時間（3~4日）
**リスクレベル**: 高（コアアーキテクチャのリファクタリング）
