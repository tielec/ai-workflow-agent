# アーキテクチャ概要 ― AI Workflow v2 (TypeScript)

このドキュメントでは、TypeScript 版 AI Workflow の構成、モジュール間の制御フロー、および Codex / Claude Code / GitHub との連携方法を説明します。

## 全体フロー

```
CLI (src/main.ts - 約118行に削減、v0.3.0でリファクタリング)
 ├─ runCli() … CLI エントリーポイント
 ├─ commander定義（コマンドルーティングのみ）
 ├─ reportFatalError() … 致命的エラー報告
 ├─ reportExecutionSummary() … 実行サマリー表示
 └─ isValidPhaseName() … フェーズ名バリデーション

src/commands/init.ts (Issue初期化コマンド処理)
 ├─ handleInitCommand() … Issue初期化コマンドハンドラ
 ├─ validateBranchName() … ブランチ名バリデーション（Git 命名規則チェック）
 ├─ resolveBranchName() … ブランチ名解決（カスタム or デフォルト）
 ├─ ★PR タイトル生成★ … Issueタイトルを取得し、PRタイトルとして使用（v0.3.0、Issue #73）
 └─ src/core/repository-utils.ts を利用（Issue URL解析、リポジトリパス解決）

src/commands/execute.ts (フェーズ実行コマンド処理 - ファサード、v0.3.1で27%削減、Issue #46)
 ├─ handleExecuteCommand() … フェーズ実行コマンドハンドラ（各モジュールへ委譲）
 ├─ 既存公開関数の再エクスポート
 │   ├─ executePhasesSequential (workflow-executor から)
 │   ├─ executePhasesFrom (workflow-executor から)
 │   ├─ createPhaseInstance (phase-factory から)
 │   ├─ resolvePresetName (そのまま保持)
 │   └─ getPresetPhases (そのまま保持)
 └─ 内部ヘルパー関数
     ├─ canResumeWorkflow (そのまま保持)
     ├─ loadExternalDocuments (そのまま保持)
     ├─ resetMetadata (そのまま保持)
     └─ reportExecutionSummary (そのまま保持)

src/commands/execute/options-parser.ts (CLIオプション解析、v0.3.1で追加、Issue #46)
 ├─ parseExecuteOptions() … ExecuteCommandOptions を正規化
 └─ validateExecuteOptions() … 相互排他オプションの検証

src/commands/execute/agent-setup.ts (エージェント初期化、v0.3.1で追加、Issue #46)
 ├─ setupAgentClients() … Codex/Claude クライアントの初期化
 └─ resolveAgentCredentials() … 認証情報のフォールバック処理

src/commands/execute/workflow-executor.ts (ワークフロー実行、v0.3.1で追加、Issue #46)
 ├─ executePhasesSequential() … フェーズの順次実行
 ├─ executePhasesFrom() … 特定フェーズからの実行
 └─ 依存関係順にフェーズを実行
      ├─ BasePhase.run()
      │    ├─ execute()    … エージェントで成果物生成
      │    ├─ review()     … 可能ならレビューサイクル実施
      │    └─ revise()     … オプション（自動修正）
      └─ GitManager による自動コミット / プッシュ（必要に応じて）

src/core/phase-factory.ts (フェーズインスタンス生成、v0.3.1で追加、Issue #46)
 └─ createPhaseInstance() … フェーズインスタンス生成（10フェーズ対応）

src/commands/review.ts (フェーズレビューコマンド処理)
 └─ handleReviewCommand() … メタデータを取得し、フェーズの状態を表示

src/commands/list-presets.ts (プリセット一覧表示コマンド処理)
 └─ listPresets() … 利用可能なプリセット一覧を表示

src/commands/rollback.ts (フェーズ差し戻しコマンド処理、v0.4.0、Issue #90/#271で追加)
 ├─ handleRollbackCommand() … 手動rollbackコマンドハンドラ（Issue #90）
 │   ├─ validateRollbackOptions() … rollbackオプションのバリデーション（exported for testing）
 │   ├─ loadRollbackReason() … 差し戻し理由の読み込み（--reason, --reason-file, --interactive）（exported for testing）
 │   ├─ generateRollbackReasonMarkdown() … ROLLBACK_REASON.mdファイルの生成（exported for testing）
 │   └─ getPhaseNumber() … フェーズ名から番号を取得するヘルパー（exported for testing）
 │
 ├─ handleRollbackAutoCommand() … 自動rollbackコマンドハンドラ（Issue #271）
 │   ├─ initializeAgentClients() … agentモードに応じたエージェント初期化（Codex/Claude）
 │   ├─ collectAnalysisContext() … review/test結果の自動探索
 │   │   ├─ findLatestReviewResult() … review-result.md の最新ファイルを検索
 │   │   └─ findLatestTestResult() … test-result.md の最新ファイルを検索
 │   ├─ buildAgentPrompt() … プロンプトテンプレート（src/prompts/rollback/auto-analyze.txt）から分析プロンプトを生成
 │   ├─ AgentExecutor.executeWithAgent() … エージェントで分析実行（Codex/Claude）
 │   ├─ parseRollbackDecision() … エージェント応答からRollbackDecisionをJSON抽出（exported for testing）
 │   │   └─ 3つのフォールバックパターン: Markdown code block → Plain JSON → Bracket search
 │   ├─ validateRollbackDecision() … RollbackDecision型の厳格な検証（exported for testing）
 │   │   └─ needs_rollback, to_phase, confidence, reason, analysis フィールドの必須チェック
 │   ├─ displayAnalysisResult() … 判定結果をユーザーに表示
 │   ├─ displayDryRunPreview() … dry-runモードでプレビュー表示
 │   ├─ confirmRollbackAuto() … 信頼度ベースの確認プロンプト（high + --force でスキップ）
 │   └─ executeRollback() … 既存の手動rollback実行ロジックを再利用
 │
 └─ MetadataManager拡張メソッドを利用（Issue #90で追加）
     ├─ setRollbackContext() … 差し戻しコンテキストの設定
     ├─ getRollbackContext() … 差し戻しコンテキストの取得
     ├─ clearRollbackContext() … 差し戻しコンテキストのクリア
     ├─ addRollbackHistory() … 差し戻し履歴の追加（mode: "manual" or "auto"を記録）
     ├─ updatePhaseForRollback() … 差し戻し先フェーズのステータス更新
     └─ resetSubsequentPhases() … 後続フェーズのリセット

src/commands/cleanup.ts (ワークフローログの手動クリーンアップコマンド処理、v0.4.0、Issue #212で追加)
 ├─ handleCleanupCommand() … クリーンアップコマンドハンドラ
 ├─ validateCleanupOptions() … クリーンアップオプションのバリデーション（exported for testing）
 ├─ parsePhaseRange() … フェーズ範囲のパース（数値範囲とフェーズ名リストをサポート）（exported for testing）
 ├─ executeCleanup() … クリーンアップ実行（削除 + Git コミット＆プッシュ）
 └─ previewCleanup() … プレビューモード（削除対象の表示のみ）
    └─ ArtifactCleaner.cleanupWorkflowLogs() を利用
        └─ phaseRange パラメータでクリーンアップ対象フェーズを指定

src/commands/finalize.ts (ワークフロー完了後の最終処理コマンド処理、v0.5.0、Issue #261で追加)
 ├─ handleFinalizeCommand() … finalize コマンドハンドラ（5ステップのオーケストレーション）
 ├─ validateFinalizeOptions() … finalize オプションのバリデーション（exported for testing）
 ├─ executeStep1() … Step 1: base_commit 取得・一時保存
 ├─ executeStep2() … Step 2: .ai-workflow 削除 + コミット＆プッシュ
 ├─ executeStep3() … Step 3: コミットスカッシュ
 ├─ executeStep4And5() … Step 4-5: PR 本文更新 + ドラフト解除
 ├─ generateFinalPrBody() … PR 最終本文生成（Markdown形式）
 ├─ previewFinalize() … ドライランモードでプレビュー表示
 └─ 既存モジュールを利用
     ├─ MetadataManager.getBaseCommit() … base_commit 取得
     ├─ ArtifactCleaner.cleanupWorkflowArtifacts() … ワークフローディレクトリ削除
     ├─ SquashManager.squashCommitsForFinalize() … コミットスカッシュ（FinalizeContext 使用）
     ├─ PullRequestClient.updatePullRequest() … PR 本文更新
     ├─ PullRequestClient.updateBaseBranch() … マージ先ブランチ変更（NEW）
     └─ PullRequestClient.markPRReady() … ドラフト解除（NEW）

src/commands/pr-comment/init.ts (PRコメント自動対応: 初期化コマンド、Issue #383で追加、Issue #407で拡張)
 ├─ handlePRCommentInitCommand() … pr-comment init コマンドハンドラ
 ├─ buildRepositoryInfo() … リポジトリ情報構築（Issue #407で--pr-url対応）
 ├─ collectUnresolvedComments() … PR から未解決コメントを収集
 └─ PRCommentMetadataManager.initialize() … メタデータ初期化

src/commands/pr-comment/execute.ts (PRコメント自動対応: 実行コマンド、Issue #383で追加、Issue #407で拡張)
 ├─ handlePRCommentExecuteCommand() … pr-comment execute コマンドハンドラ（--pr-url対応）
 ├─ processComments() … バッチ処理でコメントを順次処理
 ├─ ReviewCommentAnalyzer.analyze() … コメント分析
 ├─ CodeChangeApplier.apply() … コード変更適用
 └─ CommentClient.replyToPRReviewComment() … 返信投稿

src/commands/pr-comment/finalize.ts (PRコメント自動対応: 完了コマンド、Issue #383で追加、Issue #407で拡張)
 ├─ handlePRCommentFinalizeCommand() … pr-comment finalize コマンドハンドラ（--pr-url対応）
 ├─ resolveCompletedThreads() … 完了スレッドを解決
 └─ PRCommentMetadataManager.cleanup() … メタデータクリーンアップ

src/core/pr-comment/metadata-manager.ts (PRコメント: メタデータ管理、Issue #383で追加)
 ├─ PRCommentMetadataManager クラス
 │   ├─ initialize() … メタデータ初期化
 │   ├─ load() … メタデータ読み込み
 │   ├─ save() … メタデータ保存
 │   ├─ exists() … メタデータ存在確認
 │   ├─ updateStatus() … コメントステータス更新
 │   ├─ incrementRetry() … リトライ回数増加
 │   ├─ getPendingComments() … 未処理コメント取得
 │   ├─ addCost() … コスト追跡
 │   ├─ setResolved() … 解決日時設定
 │   └─ cleanup() … クリーンアップ
 └─ CommentResolutionMetadata 型

src/core/pr-comment/comment-analyzer.ts (PRコメント: コメント分析エンジン、Issue #383で追加)
 ├─ ReviewCommentAnalyzer クラス
 │   ├─ analyze() … コメント分析（AIエージェント実行）
 │   ├─ classifyComment() … コメント分類（キーワードパターン）
 │   ├─ buildPrompt() … プロンプト構築
 │   └─ parseResult() … 結果パース・検証
 └─ CommentResolution 型（code_change | reply | discussion | skip）

src/core/pr-comment/change-applier.ts (PRコメント: コード変更適用エンジン、Issue #383で追加)
 ├─ CodeChangeApplier クラス
 │   ├─ apply() … 変更適用
 │   ├─ validatePath() … パス検証（パストラバーサル防止）
 │   ├─ isExcluded() … 機密ファイル除外判定
 │   └─ applyModification() … ファイル変更適用
 └─ FileChange 型（modify | create | delete）

src/types/pr-comment.ts (PRコメント: 型定義、Issue #383で追加)
 ├─ PRCommentInitOptions … init コマンドオプション
 ├─ PRCommentExecuteOptions … execute コマンドオプション
 ├─ PRCommentFinalizeOptions … finalize コマンドオプション
 ├─ CommentResolutionMetadata … メタデータ構造
 ├─ CommentMetadata … コメントメタデータ
 ├─ ResolutionMetadata … 解決メタデータ
 ├─ CommentResolution … 解決結果
 └─ FileChange … ファイル変更

src/core/repository-utils.ts (リポジトリ関連ユーティリティ)
 ├─ parseIssueUrl() … GitHub Issue URLからリポジトリ情報を抽出
 ├─ parsePullRequestUrl() … GitHub PR URLからリポジトリ情報を抽出
 ├─ resolveLocalRepoPath() … リポジトリ名からローカルパスを解決
 ├─ resolveRepoPathFromPrUrl() … PR URLからREPOS_ROOT配下のローカルパスを解決（Issue #407で追加）
 ├─ findWorkflowMetadata() … Issue番号から対応するメタデータを探索
 └─ getRepoRoot() … Gitリポジトリのルートパスを取得

src/types/commands.ts (コマンド関連の型定義)
 ├─ PhaseContext … フェーズ実行コンテキスト
 ├─ ExecutionSummary … 実行サマリー
 ├─ IssueInfo … Issue情報
 └─ BranchValidationResult … ブランチバリデーション結果
```

## モジュール一覧

| モジュール | 役割 |
|------------|------|
| `src/main.ts` | `commander` による CLI 定義。コマンドルーティングのみを担当（約118行、v0.3.0でリファクタリング）。 |
| `src/index.ts` | `ai-workflow-v2` 実行ファイルのエントリーポイント。`runCli` を呼び出す。 |
| `src/commands/init.ts` | Issue初期化コマンド処理（約400行、Issue #363で拡張）。ブランチ作成、メタデータ初期化、PR作成、PRタイトル自動生成（v0.3.0、Issue #73）を担当。`handleInitCommand()`, `validateBranchName()`, `resolveBranchName()` を提供。**`--auto-model-selection` オプション追加**（Issue #363）: 指定時に `DifficultyAnalyzer` でIssue難易度を分析し、`ModelOptimizer` でモデル設定を生成、`metadata.json` に `difficulty_analysis` と `model_config` を保存。 |
| `src/commands/execute.ts` | フェーズ実行コマンド処理（約497行、v0.3.1で27%削減、Issue #46）。ファサードパターンにより4つの専門モジュールに分離。エージェント管理、プリセット解決、フェーズ順次実行を担当。`handleExecuteCommand()`, `executePhasesSequential()`, `resolvePresetName()`, `getPresetPhases()` 等を提供。 |
| `src/commands/execute/options-parser.ts` | CLIオプション解析とバリデーション（約151行、v0.3.1で追加、Issue #46）。`parseExecuteOptions()`, `validateExecuteOptions()` を提供。 |
| `src/commands/execute/agent-setup.ts` | エージェント初期化と認証情報解決（約175行、v0.3.1で追加、Issue #46、v0.5.0でエージェント優先順位追加、Issue #306）。`setupAgentClients()`, `resolveAgentCredentials()` を提供。**エージェント優先順位機能**: `AgentPriority` 型（`'codex-first' | 'claude-first'`）と `PHASE_AGENT_PRIORITY` 定数（10フェーズのエージェント優先順位マッピング）を提供。 |
| `src/commands/execute/workflow-executor.ts` | ワークフロー実行ロジック（約128行、v0.3.1で追加、Issue #46）。`executePhasesSequential()`, `executePhasesFrom()` を提供。 |
| `src/commands/review.ts` | フェーズレビューコマンド処理（約33行）。フェーズステータスの表示を担当。`handleReviewCommand()` を提供。 |
| `src/commands/list-presets.ts` | プリセット一覧表示コマンド処理（約34行）。`listPresets()` を提供。 |
| `src/commands/rollback.ts` | フェーズ差し戻しコマンド処理（約930行、v0.4.0、Issue #90/#271で追加）。**手動rollback**（Issue #90）と**自動rollback**（Issue #271）の2つのモードを提供。手動rollbackは `handleRollbackCommand()`, `validateRollbackOptions()`, `loadRollbackReason()`, `generateRollbackReasonMarkdown()`, `getPhaseNumber()` を提供し、差し戻し理由の3つの入力方法（--reason, --reason-file, --interactive）、メタデータ自動更新、差し戻し履歴記録、プロンプト自動注入をサポート。自動rollbackは `handleRollbackAutoCommand()` を提供し、AIエージェント（Codex/Claude）による自動差し戻し判定機能を実現。コンテキスト収集（`collectAnalysisContext()`, `findLatestReviewResult()`, `findLatestTestResult()`）、プロンプト構築（`buildAgentPrompt()`）、JSON パース（`parseRollbackDecision()`, 3つのフォールバックパターン）、バリデーション（`validateRollbackDecision()`）、信頼度ベース確認（`confirmRollbackAuto()`）を含む。エージェントは metadata.json, review results, test results を分析し、needs_rollback, to_phase, to_step, confidence, reason, analysis を含む RollbackDecision を返す。 |
| `src/commands/cleanup.ts` | ワークフローログの手動クリーンアップコマンド処理（約480行、v0.4.0、Issue #212で追加）。Report Phase（Phase 8）の自動クリーンアップとは独立して、任意のタイミングでワークフローログを削除する機能を提供。`handleCleanupCommand()`, `validateCleanupOptions()`, `parsePhaseRange()`, `executeCleanup()`, `previewCleanup()` を提供。3つのクリーンアップモード（通常、部分、完全）、プレビューモード（`--dry-run`）、Git自動コミット＆プッシュをサポート。 |
| `src/commands/finalize.ts` | ワークフロー完了後の最終処理コマンド処理（約385行、v0.5.0、Issue #261で追加）。5ステップを統合した finalize コマンドを提供。`handleFinalizeCommand()`, `validateFinalizeOptions()`, `executeStep1()`, `executeStep2()`, `executeStep3()`, `executeStep4And5()`, `generateFinalPrBody()`, `previewFinalize()` を提供。クリーンアップ、コミットスカッシュ、PR更新、ドラフト解除を1コマンドで実行。`--dry-run`, `--skip-squash`, `--skip-pr-update`, `--base-branch` オプションで柔軟な実行制御が可能。 |
| `src/commands/pr-comment/init.ts` | PRコメント自動対応: 初期化コマンド処理（Issue #383で追加、Issue #407で拡張）。`handlePRCommentInitCommand()` でPRから未解決レビューコメントを収集し、メタデータを初期化。`--pr`, `--pr-url`, `--dry-run` オプションをサポート。**Issue #407で追加**: `--pr-url` 指定時にREPOS_ROOT配下のリポジトリパスを使用し、マルチリポジトリ対応を実現。`buildRepositoryInfo()` で条件分岐によりパス解決方法を切り替え。 |
| `src/commands/pr-comment/execute.ts` | PRコメント自動対応: 実行コマンド処理（Issue #383で追加、Issue #407で拡張）。`handlePRCommentExecuteCommand()` でコメントをバッチ処理、AIエージェントで分析、コード修正適用、返信投稿を実行。`--pr`, `--pr-url`, `--dry-run`, `--agent`, `--batch-size` オプションをサポート。レジューム機能により中断からの再開が可能。**Issue #407で追加**: `--pr-url` 指定時にREPOS_ROOT配下で処理を実行。 |
| `src/commands/pr-comment/finalize.ts` | PRコメント自動対応: 完了コマンド処理（Issue #383で追加、Issue #407で拡張）。`handlePRCommentFinalizeCommand()` で完了したコメントスレッドをGraphQL mutationで解決し、メタデータをクリーンアップ。`--pr`, `--pr-url`, `--dry-run` オプションをサポート。**Issue #407で追加**: `--pr-url` 指定時にREPOS_ROOT配下のリポジトリを使用してfinalize処理を実行。 |
| `src/core/pr-comment/metadata-manager.ts` | PRコメント: メタデータ管理（Issue #383で追加）。`PRCommentMetadataManager` クラスでコメントごとのステータス管理、サマリー計算、コスト追跡を実施。`initialize()`, `load()`, `save()`, `exists()`, `updateStatus()`, `incrementRetry()`, `getPendingComments()`, `addCost()`, `setResolved()`, `cleanup()` を提供。 |
| `src/core/pr-comment/comment-analyzer.ts` | PRコメント: コメント分析エンジン（Issue #383で追加）。`ReviewCommentAnalyzer` クラスでAIエージェントを使用してコメントを分析し、4種類の解決タイプ（`code_change`, `reply`, `discussion`, `skip`）を判定。`analyze()`, `classifyComment()`, `buildPrompt()`, `parseResult()` を提供。confidence レベルによる自動スキップ機能付き。 |
| `src/core/pr-comment/change-applier.ts` | PRコメント: コード変更適用エンジン（Issue #383で追加）。`CodeChangeApplier` クラスでファイル変更適用（modify, create, delete）を実施。`apply()`, `validatePath()`, `isExcluded()`, `applyModification()` を提供。セキュリティ機能（パストラバーサル防止、機密ファイル除外）を実装。 |
| `src/types/pr-comment.ts` | PRコメント: 型定義（Issue #383で追加）。`PRCommentInitOptions`, `PRCommentExecuteOptions`, `PRCommentFinalizeOptions`, `CommentResolutionMetadata`, `CommentMetadata`, `ResolutionMetadata`, `CommentResolution`, `FileChange` 等の型を定義。 |
| `src/core/repository-utils.ts` | リポジトリ関連ユーティリティ（約200行、Issue #407で拡張）。Issue/PR URL解析、ローカルリポジトリパス解決、メタデータ探索を提供。`parseIssueUrl()`, `parsePullRequestUrl()`, `resolveLocalRepoPath()`, `resolveRepoPathFromPrUrl()`, `findWorkflowMetadata()`, `getRepoRoot()` を提供。**Issue #407で追加**: `resolveRepoPathFromPrUrl()`によりPR URLからREPOS_ROOT配下のローカルパスを解決し、`pr-comment`コマンドのマルチリポジトリ対応を実現。 |
| `src/core/phase-factory.ts` | フェーズインスタンス生成（約65行、v0.3.1で追加、Issue #46）。`createPhaseInstance()` を提供。10フェーズすべてのインスタンス生成を担当。 |
| `src/core/difficulty-analyzer.ts` | Issue難易度分析モジュール（約250行、Issue #363で追加）。Issue情報（タイトル、本文、ラベル）をLLMで分析し、3段階の難易度（`simple` / `moderate` / `complex`）を判定。Claude Sonnet（プライマリ）/ Codex Mini（フォールバック）で分析を実行し、JSON形式の結果（`level`, `confidence`, `reasoning`, `analyzed_at`）を返す。失敗時は安全側フォールバックとして `complex` を設定。`analyzeDifficulty()`, `parseAnalysisResult()`, `createFallbackResult()` を提供。 |
| `src/core/model-optimizer.ts` | モデル最適化モジュール（約300行、Issue #363で追加）。難易度×フェーズ×ステップのマッピングに基づいて最適なモデルを自動選択。難易度別デフォルトマッピング（`simple`: 全軽量、`moderate`: 設計系フェーズは revise も軽量 / 実装系フェーズは revise 高品質 / ドキュメント系は全軽量、`complex`: execute/revise 高品質 + review 軽量）を提供。**review ステップは常に軽量モデルで、CLI/ENV オーバーライドは review には適用しない**。CLI/ENV 優先オーバーライドと metadata.json の既存設定を考慮。`resolveModel()`, `generateModelConfig()`, `applyOverrides()` を提供。型定義: `DifficultyLevel`, `StepModelConfig`, `PhaseModelConfig`, `ModelConfigByPhase`。 |
| `src/core/safety/instruction-validator.ts` | カスタム指示の安全性検証モジュール（約170行、Issue #380で追加）。`auto-issue` コマンドの `--custom-instruction` オプションで指定された指示の安全性を検証。`InstructionValidator.validate()` で文字数制限（500文字）と危険パターン検出を実施。`DANGEROUS_PATTERNS`（Git操作、ファイル操作、システムコマンド、設定変更、DB操作、自動修正）と `ALLOWED_PATTERNS`（分析・検出・調査系キーワード）を定義。単語境界マッチング（英語）と含有チェック（日本語）で誤検知を軽減。 |
| `src/core/codex-agent-client.ts` | Codex CLI を起動し JSON イベントをストリーム処理。認証エラー検知・利用量記録も実施（約200行、Issue #26で25.4%削減）。 |
| `src/core/claude-agent-client.ts` | Claude Agent SDK を利用してイベントを取得し、Codex と同様の JSON 形式で保持（約206行、Issue #26で23.7%削減）。 |
| `src/core/helpers/agent-event-parser.ts` | Codex/Claude共通のイベントパースロジック（74行、Issue #26で追加）。`parseCodexEvent()`, `parseClaudeEvent()`, `determineCodexEventType()`, `determineClaudeEventType()` を提供。 |
| `src/core/helpers/log-formatter.ts` | エージェントログのフォーマット処理（181行、Issue #26で追加）。`formatCodexLog()`, `formatClaudeLog()`, `truncateInput()` を提供。 |
| `src/core/helpers/env-setup.ts` | エージェント実行環境のセットアップ（47行、Issue #26で追加）。`setupCodexEnvironment()`, `setupGitHubEnvironment()` を提供。 |
| `src/utils/git-url-utils.ts` | Git URLサニタイゼーション（約60行、Issue #54で追加）。`sanitizeGitUrl()` を提供。HTTPS形式のURLからPersonal Access Tokenを除去し、SSH形式は変更せずに返す。 |
| `src/core/content-parser.ts` | レビュー結果の解釈や判定を担当（OpenAI API を利用）。Issue #243でパースロジックを改善：`extractJsonFromResponse()`（JSON抽出前処理）と`inferDecisionFromText()`（マーカーパターン優先判定）を追加し、LLMレスポンス形式の多様性に対応。 |
| `src/core/logger.ts` | Logger抽象化（約158行、Issue #50で追加）。LogLevel enum、ILogger interface、ConsoleLogger class、logger singleton instanceを提供。環境変数 LOG_LEVEL でログレベルを制御可能。 |
| `src/core/github-client.ts` | Octokit ラッパー（ファサードパターン、約402行、Issue #24で42.7%削減）。各専門クライアントを統合し、後方互換性を維持。 |
| `src/core/github/issue-client.ts` | Issue操作の専門クライアント（約385行、Issue #24で追加、Issue #104で拡張、Issue #119でLLM統合、Issue #174でエージェントベース生成統合）。Issue取得、コメント投稿、クローズ、残タスクIssue作成、タイトル生成、キーワード抽出、詳細フォーマット機能、**LLM統合によるフォローアップIssue生成とフォールバック制御**、**エージェントベースIssue生成（IssueAgentGenerator連携）** を担当。 |
| `src/core/github/issue-ai-generator.ts` | フォローアップIssue用LLM生成エンジン（約450行、Issue #119で追加）。プロンプト生成、OpenAI/Anthropicアダプタ、レスポンス検証、リトライ制御、サニタイズ処理を担当。 |
| `src/core/github/issue-agent-generator.ts` | フォローアップIssue用エージェント生成エンジン（約385行、Issue #174で追加）。エージェント（Codex/Claude）を使用してフォローアップIssueのタイトル・本文を生成。ファイルベース出力方式、2段階フォールバック（Codex→Claude、Agent→LLM API）、5必須セクション検証、テンプレートベースフォールバック生成を提供。 |
| `src/core/github/pull-request-client.ts` | PR操作の専門クライアント（約380行、Issue #24で追加、Issue #261で拡張）。PR作成、更新、検索、クローズ、PR番号取得、**ドラフト解除**（`markPRReady()`）、**マージ先ブランチ変更**（`updateBaseBranch()`）を担当。GraphQL mutation + `gh pr ready` フォールバック機構を実装。 |
| `src/core/github/comment-client.ts` | コメント操作の専門クライアント（約145行、Issue #24で追加）。ワークフロー進捗コメント、進捗コメント作成/更新を担当。 |
| `src/core/github/review-client.ts` | レビュー操作の専門クライアント（約75行、Issue #24で追加）。レビュー結果投稿を担当。 |
| `src/core/git-manager.ts` | Git操作のファサードクラス（約181行、Issue #25で67%削減）。各専門マネージャーを統合し、後方互換性を維持。 |
| `src/core/git/commit-manager.ts` | コミット操作の専門マネージャー（約409行、Issue #52で30.2%削減）。コミット作成（commitPhaseOutput, commitStepOutput等）、FileSelector/CommitMessageBuilderへの委譲、SecretMasker統合を担当。 |
| `src/core/git/file-selector.ts` | ファイル選択・フィルタリングの専門モジュール（約160行、Issue #52で追加）。変更ファイル検出、Issue番号フィルタリング、フェーズ固有パターンマッチング、@tmp除外を担当。 |
| `src/core/git/commit-message-builder.ts` | コミットメッセージ構築の専門モジュール（約151行、Issue #52で追加）。フェーズ完了、ステップ完了、初期化、クリーンアップのメッセージ生成を担当。 |
| `src/core/git/branch-manager.ts` | ブランチ操作の専門マネージャー（約110行、Issue #25で追加）。ブランチ作成、切り替え、存在チェックを担当。 |
| `src/core/git/remote-manager.ts` | リモート操作の専門マネージャー（約210行、Issue #25で追加）。push、pull、リトライロジック、GitHub認証設定を担当。 |
| `src/core/git/squash-manager.ts` | スカッシュ操作の専門マネージャー（約500行、Issue #194で追加、Issue #261で拡張）。コミットスカッシュ、エージェント生成コミットメッセージ、ブランチ保護、`--force-with-lease` による安全な強制プッシュを提供。`squashCommits()`, `squashCommitsForFinalize()`, `getCommitsToSquash()`, `validateBranchProtection()`, `generateCommitMessage()`, `executeSquash()`, `generateFallbackMessage()`, `generateFinalizeMessage()` を含む8つの主要メソッドを提供。**PhaseContext依存解消**により、`FinalizeContext` インターフェースで finalize コマンド用のスカッシュ処理が可能。 |
| `src/core/metadata-manager.ts` | `.ai-workflow/issue-*/metadata.json` の CRUD、コスト集計、リトライ回数管理など（約380行、Issue #26で9.5%削減、v0.4.0でrollback機能追加、Issue #90、Issue #363で拡張）。差し戻し機能用の6つのメソッド（`setRollbackContext()`, `getRollbackContext()`, `clearRollbackContext()`, `addRollbackHistory()`, `updatePhaseForRollback()`, `resetSubsequentPhases()`）を提供。**Issue #363で追加**: `setDifficultyAnalysis()`, `getDifficultyAnalysis()`, `setModelConfig()`, `getModelConfig()` メソッドで難易度分析結果とモデル設定の保存・取得をサポート。 |
| `src/core/helpers/metadata-io.ts` | メタデータファイルI/O操作（98行、Issue #26で追加）。`formatTimestampForFilename()`, `backupMetadataFile()`, `removeWorkflowDirectory()`, `getPhaseOutputFilePath()` を提供。 |
| `src/core/helpers/validation.ts` | 共通バリデーション処理（47行、Issue #26で追加）。`validatePhaseName()`, `validateStepName()`, `validateIssueNumber()` を提供。 |
| `src/utils/logger.ts` | 統一ログモジュール（約150行、Issue #61で追加）。ログレベル制御（debug/info/warn/error）、カラーリング機能（chalk統合）、タイムスタンプ自動付与、環境変数制御（LOG_LEVEL、LOG_NO_COLOR）を提供。`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` をエクスポート。 |
| `src/utils/error-utils.ts` | エラーハンドリングユーティリティ（約190行、Issue #48で追加）。`getErrorMessage()`, `getErrorStack()`, `isError()` を提供。TypeScript の catch ブロックで `unknown` 型のエラーから型安全にメッセージを抽出。非 Error オブジェクト（string、number、null、undefined）に対応し、決して例外をスローしない（never throw 保証）。`as Error` 型アサーションの代替として全プロジェクトで使用。 |
| `src/core/config.ts` | 環境変数アクセス管理（約220行、Issue #51で追加）。型安全な環境変数アクセス、必須/オプション環境変数の検証、フォールバックロジック（`CODEX_API_KEY` → `OPENAI_API_KEY` 等）の統一を提供。`config.getGitHubToken()`, `config.getCodexApiKey()`, `config.isCI()` 等14個のメソッドをエクスポート。Singleton パターンで実装。 |
| `src/core/workflow-state.ts` | メタデータの読み書きとマイグレーション処理。 |
| `src/core/phase-dependencies.ts` | フェーズ間の依存関係管理、プリセット定義、依存関係チェック機能を提供（約249行、Issue #26で27.2%削減）。 |
| `src/core/helpers/dependency-messages.ts` | 依存関係エラー/警告メッセージの生成（68行、Issue #26で追加）。`buildErrorMessage()`, `buildWarningMessage()` を提供。 |
| `src/types/commands.ts` | コマンド関連の型定義（約325行、Issue #45で拡張、v0.4.0でrollback型追加、Issue #90/#271）。PhaseContext, ExecutionSummary, IssueInfo, BranchValidationResult, ExecuteCommandOptions, ReviewCommandOptions, MigrateOptions, RollbackCommandOptions, RollbackContext, RollbackHistoryEntry, RollbackAutoOptions, RollbackDecision等の型を提供。コマンドハンドラの型安全性を確保。Issue #271で追加された型: `RollbackAutoOptions`（rollback-autoコマンドのCLIオプション: issueNumber, dryRun, force, agent）、`RollbackDecision`（エージェント出力の構造: needs_rollback, to_phase, to_step, reason, confidence, analysis、厳格なバリデーションルール付き）。 |
| `src/phases/base-phase.ts` | フェーズ実行の基底クラス（約500行、v0.3.1で40%削減、Issue #49でさらなるモジュール分解、v0.4.0でrollbackプロンプト注入追加、Issue #90、v0.5.0でエージェント優先順位対応、Issue #306、Issue #363でモデル最適化対応）。execute/review/revise のライフサイクル管理とオーケストレーションを担当。差し戻し時に自動的にROLLBACK_REASON.mdをreviseステッププロンプトに注入し、差し戻し理由を次のフェーズ実行時に伝達する機能を提供。**エージェント優先順位**: `PHASE_AGENT_PRIORITY` からフェーズ固有の優先順位を取得し、`AgentExecutor` コンストラクタに渡す。**モデル最適化**（Issue #363）: ステップ開始前に `ModelOptimizer.resolveModel()` を呼び出し、review は常に軽量モデル、それ以外は優先順位（CLI/ENV → metadata → デフォルト）に従うモデルを `AgentExecutor` に反映。 |
| `src/phases/core/agent-executor.ts` | エージェント実行ロジック（約300行、Issue #23で追加、v0.5.0でエージェント優先順位対応、Issue #306、Issue #363でステップ単位モデル指定対応）。Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当。**エージェント優先順位**: コンストラクタに `agentPriority` パラメータ（オプショナル、デフォルト `'codex-first'`）を追加。`claude-first` の場合は Claude を優先、`codex-first` の場合は Codex を優先し、プライマリエージェント失敗時にフォールバックエージェントへ切り替え。**ステップ単位モデル指定**（Issue #363）: `updateModelConfig()` メソッドで実行前にモデルを動的に切り替え可能（`claudeModel`, `codexModel` を受け取り Codex/Claude 実行に適用）。 |
| `src/phases/core/review-cycle-manager.ts` | レビューサイクル管理（約130行、Issue #23で追加）。レビュー失敗時の自動修正（revise）とリトライ管理を担当。 |
| `src/phases/lifecycle/step-executor.ts` | ステップ実行ロジック（約233行、Issue #49で追加）。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュを担当。 |
| `src/phases/lifecycle/phase-runner.ts` | フェーズライフサイクル管理（約244行、Issue #49で追加）。フェーズ全体の実行、依存関係検証、エラーハンドリング、進捗投稿を担当。 |
| `src/phases/context/context-builder.ts` | コンテキスト構築（約223行、Issue #49で追加）。オプショナルコンテキスト構築、ファイル参照生成（@filepath形式）、Planning Document参照を担当。 |
| `src/phases/cleanup/artifact-cleaner.ts` | クリーンアップロジック（約228行、Issue #49で追加）。ワークフロークリーンアップ、パス検証（セキュリティ対策）、シンボリックリンクチェック、CI環境判定を担当。 |
| `src/phases/formatters/progress-formatter.ts` | 進捗表示フォーマット（約150行、Issue #23で追加）。GitHub Issue コメント用の進捗状況フォーマットを生成。 |
| `src/phases/formatters/log-formatter.ts` | ログフォーマット（約400行、Issue #23で追加）。Codex/Claude エージェントの生ログを Markdown 形式に変換。 |
| `src/phases/*.ts` | 各フェーズの具象クラス。`execute()`, `review()`, `revise()` を実装。 |
| `src/prompts/{phase}/*.txt` | フェーズ別のプロンプトテンプレート。 |
| `src/prompts/difficulty/analyze.txt` | Issue難易度分析プロンプトテンプレート（Issue #363で追加）。Issue情報（タイトル、本文、ラベル）から難易度（simple/moderate/complex）を判定するためのプロンプト。JSON形式で `level`, `confidence`, `reasoning` を返すよう指示。 |
| `src/templates/*.md` | PR ボディ等の Markdown テンプレート。 |
| `scripts/copy-static-assets.mjs` | ビルド後に prompts / templates を `dist/` へコピー。 |

## BasePhase のライフサイクル

1. **依存関係チェック** … `validatePhaseDependencies` で前工程が完了しているか確認（フラグで無効化可能）。
2. **execute()** … プロンプトを整形しエージェントを呼び出して成果物を生成。
   - **テンプレートメソッドパターン** … `executePhaseTemplate()` により重複コードを削減（Issue #47）
   - **フォールバック機構** … エージェントが成果物ファイルの生成に失敗した場合の自動復旧（Issue #113）
     - **2段階フォールバック**: ① ログからのコンテンツ抽出 → ② `revise()` による再生成
     - **適用フェーズ**: Planning, Requirements, Design, TestScenario, Implementation, Report（`enableFallback: true` で有効化）
     - **ログ抽出パターン**: 各フェーズ固有のヘッダーパターン（例: Planning → "# プロジェクト計画書"）で成果物を識別
     - **コンテンツ検証**: 最低100文字、2個以上のセクションヘッダー、フェーズ固有キーワード検証
     - **reviseプロンプト拡張**: `previous_log_snippet` 変数（agent_log.mdの先頭2000文字）を自動注入し、前回実行のコンテキストを提供
   - **Git自動コミット** … execute完了後、変更をコミット＆プッシュ（v0.3.0で追加）
3. **review()（任意）** … レビュープロンプトを実行し、`ContentParser` で PASS / FAIL を判定。必要に応じてフィードバックを GitHub に投稿。
   - **Git自動コミット** … review完了後、変更をコミット＆プッシュ（v0.3.0で追加）
4. **revise()（任意）** … レビュー失敗時に最大 3 回まで自動修正サイクルを実行。
   - **Git自動コミット** … revise完了後、変更をコミット＆プッシュ（v0.3.0で追加）
5. **メタデータ更新** … フェーズ状態、出力ファイル、コスト、Git コミット情報などを更新。
6. **進捗コメント** … `GitHubClient` を通じて Issue へ進捗コメントを投稿・更新。

### フェーズステータス管理の改善（Issue #248）

preset実行時にフェーズステータスが `in_progress` のまま完了しない問題を解決するため、以下の改善を実装しました：

**MetadataManager の改善** (`src/core/metadata-manager.ts`):
- **冪等性チェック**: 同じステータスへの重複更新をスキップし、不要なファイル書き込みを削減
  ```typescript
  if (currentStatus === status) {
    logger.info(`Phase ${phaseName}: Status already set to '${status}', skipping update`);
    return;
  }
  ```
- **ステータス遷移バリデーション**: 不正なステータス遷移を検出して警告ログを出力
  ```typescript
  // 許可される遷移パターン
  // pending → in_progress
  // in_progress → completed | failed
  // completed → (遷移不可)
  // failed → (遷移不可)
  ```

**PhaseRunner の改善** (`src/phases/lifecycle/phase-runner.ts`):
- **finalizePhase()**: フェーズ完了時にステータスを `completed` に確実に更新し、進捗を投稿
- **ensurePhaseStatusUpdated()**: `finally` ブロックでステータス更新漏れを検出し、自動修正
  - 実行成功時に `in_progress` のままの場合 → `completed` に自動修正
  - 実行失敗時に `in_progress` のままの場合 → `failed` に自動修正
- **handlePhaseError()**: エラー発生時にステータスを `failed` に更新し、進捗を投稿

**ReviewCycleManager の改善** (`src/phases/core/review-cycle-manager.ts`):
- **例外スロー前のステータス更新**: revise失敗時やリトライ超過時に、例外をスローする前にステータスを `failed` に確実に更新

**実装効果**:
- フェーズステータスの更新漏れを防止
- finally ブロックによる確実なステータス更新保証
- 不正なステータス遷移の検出と警告
- 重複するステータス更新の最適化

### テンプレートメソッドパターン（Issue #47）

全10フェーズの `execute()` メソッドで繰り返されていたプロンプト処理パターン（プロンプト読み込み → 変数置換 → エージェント実行 → 出力確認）を、`BasePhase.executePhaseTemplate()` メソッドに集約しました。

**主な利点**:
- **コード削減**: 約200行（32%）の重複コードを削減
- **保守性向上**: 共通ロジックを単一箇所に集約（DRY原則）
- **一貫性確保**: 全フェーズで統一されたエラーハンドリング
- **拡張性向上**: 新規フェーズ追加が容易

**実装パターン**:
```typescript
protected async executePhaseTemplate<T extends Record<string, string>>(
  phaseOutputFile: string,
  templateVariables: T,
  options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
): Promise<PhaseExecutionResult>
```

各フェーズの `execute()` メソッドは、テンプレート変数を定義して `executePhaseTemplate()` を呼び出すだけで済むようになりました。特殊ロジック（設計決定抽出、ファイル更新チェック等）は各フェーズで保持されます。

### フォールバック機構（Issue #113）

Evaluation Phase で実装されていたフォールバック機構を、Planning, Requirements, Design, TestScenario, Implementation, Reportの6フェーズに拡張しました。エージェントが成果物ファイルの生成に失敗した場合でも、自動復旧により再実行なしでワークフローを継続できます。

**実装メソッド**:

1. **handleMissingOutputFile()** … 成果物ファイル不在時の自動復旧処理
   - エージェントログ（`agent_log.md`）が存在するかチェック
   - `extractContentFromLog()` でログからコンテンツを抽出し保存
   - 抽出失敗時は `revise()` メソッドを呼び出して再生成
   - reviseメソッド未実装の場合は適切なエラーを返す

2. **extractContentFromLog()** … ログから成果物を抽出
   - フェーズ固有のヘッダーパターンで成果物を識別（例: Planning → `/# プロジェクト計画書/`）
   - ヘッダーが見つからない場合、複数のMarkdownセクション（`##`）があればフォールバックパターンで抽出
   - `isValidOutputContent()` でコンテンツを検証
   - 有効なコンテンツのみを返却（無効な場合は `null`）

3. **isValidOutputContent()** … 抽出コンテンツの検証
   - 最低100文字以上の長さ
   - 2個以上のセクションヘッダー（`##`）を含む
   - フェーズ固有キーワード検証（例: Planning → "実装戦略", "テスト戦略", "タスク分割"）
   - すべてのキーワードが欠落している場合は無効（少なくとも1つ必要）

**enableFallback オプション**:

`executePhaseTemplate()` に `enableFallback: boolean` オプションを追加。`true` の場合、成果物ファイル不在時に `handleMissingOutputFile()` を自動実行します。

**フェーズ固有ヘッダーパターン**:

| フェーズ | 日本語パターン | 英語パターン |
|---------|---------------|-------------|
| Planning | `# プロジェクト計画書` | `# Project Planning` |
| Requirements | `# 要件定義書` | `# Requirements Specification` |
| Design | `# 設計書` | `# Design Document` |
| TestScenario | `# テストシナリオ` | `# Test Scenario` |
| Implementation | `# 実装完了レポート` | `# Implementation Report` |
| Report | `# Issue 完了レポート` | `# Issue Completion Report` |

**revise プロンプト拡張**:

各フェーズの `revise()` メソッドで `previous_log_snippet` 変数（`agent_log.md` の先頭2000文字）を自動注入し、前回実行のコンテキストをエージェントに提供します。これにより、エージェントは前回の失敗原因を理解し、より適切な修正が可能になります。

### ステップ単位のGitコミット（v0.3.0）

各ステップ（execute/review/revise）の完了後に自動的にGitコミット＆プッシュが実行されます：

- **コミットメッセージ形式**: `[ai-workflow] Phase {number} ({name}) - {step} completed`
- **メタデータ管理**: `metadata.json` に `current_step` と `completed_steps` フィールドを追加
- **レジューム機能**: 完了済みステップは自動的にスキップされ、失敗したステップのみ再実行
- **CI環境対応**: リモートブランチからメタデータを同期し、ワークスペースリセット後も適切なステップから再開

### BasePhase のモジュール構造（v0.3.1、Issue #23）

BasePhase クラスは1420行から676行へリファクタリングされ（約52.4%削減）、4つの独立したモジュールに責務を分離しました：

**コアモジュール**:
- **AgentExecutor** (`src/phases/core/agent-executor.ts`): エージェント実行ロジックを担当。Codex/Claude エージェントの実行、認証エラー時のフォールバック処理、空出力時のフォールバック処理、利用量メトリクスの抽出・記録を実施。
- **ReviewCycleManager** (`src/phases/core/review-cycle-manager.ts`): レビューサイクル管理を担当。レビュー失敗時の自動修正（revise）、最大リトライ回数（3回）のチェック、Git コミット＆プッシュの統合、completed_steps の管理を実施。

**フォーマッターモジュール**:
- **ProgressFormatter** (`src/phases/formatters/progress-formatter.ts`): 進捗表示フォーマットを担当。フェーズステータスに応じた絵文字表示、全フェーズの進捗状況リスト、現在のフェーズ詳細、完了したフェーズの詳細（折りたたみ表示）を生成。
- **LogFormatter** (`src/phases/formatters/log-formatter.ts`): ログフォーマットを担当。Codex/Claude の生ログを Markdown 形式に変換、JSON イベントストリームの解析、4000文字を超える出力の切り詰め処理を実施。

**オーケストレーション**:
BasePhase クラスは各モジュールを依存性注入により統合し、フェーズライフサイクル（execute → review → revise）のオーケストレーションのみを担当します。各モジュールは単一の責務を持ち（Single Responsibility Principle）、独立してテスト可能です。

### BasePhase のさらなるモジュール分解（v0.3.1、Issue #49）

Issue #49では、BasePhase クラスを676行から445行へさらにリファクタリングし（約40%削減）、4つの専門モジュールに責務を分離しました：

**ライフサイクルモジュール**:
- **StepExecutor** (`src/phases/lifecycle/step-executor.ts`, 233行): ステップ実行ロジックを担当。execute/review/revise ステップの実行、completed_steps 管理、Git コミット＆プッシュ（`commitAndPushStep`）、ステップ完了チェック（`isStepCompleted`）を実施。各ステップ完了後に自動コミット・プッシュが実行され、レジューム機能をサポート。
- **PhaseRunner** (`src/phases/lifecycle/phase-runner.ts`, 244行): フェーズライフサイクル管理を担当。フェーズ全体の実行（`runPhase`）、依存関係検証（`validateAndStartPhase`）、エラーハンドリング（`handlePhaseError`）、GitHub進捗投稿（`postProgressToGitHub`）、フェーズ完了処理（`finalizePhase`）を実施。

**コンテキスト構築モジュール**:
- **ContextBuilder** (`src/phases/context/context-builder.ts`, 223行): コンテキスト構築を担当。オプショナルコンテキスト構築（`buildOptionalContext`）、ファイル参照生成（`@filepath` 形式、`buildFileReference`）、Planning Document参照（`buildPlanningDocumentReference`）を実施。ファイルが存在しない場合は適切なフォールバックメッセージを返し、依存関係を無視した柔軟な実行を可能にする。

**クリーンアップモジュール**:
- **ArtifactCleaner** (`src/phases/cleanup/artifact-cleaner.ts`, 228行、v0.4.0でphaseRange追加、Issue #212): クリーンアップロジックを担当。ワークフロークリーンアップ（`cleanupWorkflowLogs`, `cleanupWorkflowArtifacts`）、パス検証（正規表現によるセキュリティ対策、`validateWorkflowPath`）、シンボリックリンクチェック（`isSymbolicLink`）、CI環境判定（`shouldAutoConfirm`）、確認プロンプト表示を実施。`cleanupWorkflowLogs()` メソッドに `phaseRange?: PhaseName[]` パラメータを追加し、クリーンアップ対象フェーズの範囲指定をサポート（手動クリーンアップコマンドから利用）。

**ファサードパターンによる後方互換性**:
BasePhase クラスは各専門モジュールのインスタンスを保持し、既存のpublicメソッドを対応するモジュールに委譲することで、後方互換性を100%維持します。依存性注入パターンにより、各モジュールは独立してテスト可能で、単一責任原則（SRP）に従った設計となっています。

**主な利点**:
- **保守性向上**: 各モジュールが明確な責務を持ち、コードの理解と変更が容易
- **テスト容易性**: 独立したモジュールにより、ユニットテストとモックが容易
- **拡張性向上**: 新機能の追加が特定のモジュールに限定され、影響範囲が明確
- **コード削減**: 676行から445行へ34%削減（リファクタリング効果と重複削減）

## エージェントの選択

`src/commands/execute.ts` の `handleExecuteCommand()` で `--agent` オプションを解釈します。

- `auto` … `CODEX_API_KEY` / `OPENAI_API_KEY` が設定されていれば Codex を優先し、なければ Claude を使用。
- `codex` … Codex API キー必須。ログは `CodexAgentClient` が収集。
- `claude` … Claude 認証情報が必須。Codex は無効化されます。

`CodexAgentClient` は JSON イベントを `agent_log_raw.txt` に蓄積し、Markdown サマリー（失敗時は生 JSON ブロック）を生成します。`ClaudeAgentClient` は従来の Markdown 形式を維持します。

### フェーズごとのエージェント優先順位自動選択（v0.5.0、Issue #306）

`--agent auto` モード実行時、フェーズの特性に応じてエージェントの優先順位が自動的に選択されます。

**PHASE_AGENT_PRIORITY マッピング** (`src/commands/execute/agent-setup.ts`):

| フェーズ | 優先順位 | 理由 |
|---------|---------|------|
| planning | claude-first | 戦略立案、情報整理が得意 |
| requirements | claude-first | 要件の構造化、分析が得意 |
| design | claude-first | アーキテクチャ設計、ドキュメント作成が得意 |
| test_scenario | claude-first | テストシナリオの設計・整理が得意 |
| implementation | codex-first | 具体的なコード実装が得意 |
| test_implementation | codex-first | テストコード生成が得意 |
| testing | codex-first | テスト実行、デバッグが得意 |
| documentation | claude-first | ドキュメント作成が得意 |
| report | claude-first | レポート作成、要約が得意 |
| evaluation | claude-first | 評価、分析が得意 |

**動作フロー**:
1. `BasePhase` が `PHASE_AGENT_PRIORITY[this.phaseName]` でフェーズ固有の優先順位を取得
2. `AgentExecutor` コンストラクタに `agentPriority` パラメータとして渡す
3. `AgentExecutor.executeWithAgent()` が優先順位に基づいてプライマリエージェントを選択
4. プライマリエージェント失敗時（認証エラー、空出力等）にフォールバックエージェントへ切り替え

**後方互換性**: `agentPriority` 未指定時のデフォルト動作は `codex-first`（従来動作を維持）

## プリセットとフェーズ依存関係

### プリセット機能

`src/core/phase-dependencies.ts` は、よくある開発パターンに合わせて複数のフェーズを組み合わせたプリセット定義を提供します。

**主なプリセット**:
- `review-requirements`, `review-design`, `review-test-scenario` … レビュー駆動パターン
- `quick-fix`, `implementation` … 実装中心パターン
- `testing` … テスト中心パターン
- `finalize` … ドキュメント・レポートパターン

プリセット名の解決は `src/commands/execute.ts` の `resolvePresetName()` 関数で行われ、後方互換性のために非推奨プリセット名（`requirements-only`, `design-phase`, `implementation-phase`, `full-workflow`）のエイリアスもサポートします。

### 依存関係チェック

`validatePhaseDependencies()` 関数は、各フェーズの実行前に依存する前段フェーズが完了しているかチェックします。以下の機能を提供:

- **完了状態チェック**: metadata.json の `completed` フラグを確認
- **ファイル存在チェック**: 実ファイルが存在するか確認（`checkFileExistence` オプション）
- **エラーメッセージ構築**: 未完了フェーズとファイル不在を明示的に表示
- **警告モード**: `--ignore-dependencies` オプションで警告のみ表示して実行継続

### オプショナルコンテキスト構築

`BasePhase` クラスの `buildOptionalContext()` メソッドは、前段フェーズの成果物が存在しない場合でもフェーズを実行できるようにします。ファイルが存在する場合は `@filepath` 形式で参照し、存在しない場合はフォールバックメッセージを返します。これにより `quick-fix` プリセットなどで、依存関係を無視した柔軟な実行が可能になります。

**適用済みPhase**:
- `ImplementationPhase` - requirements、design、test_scenario を参照
- `TestImplementationPhase` - requirements、design、test_scenario、implementation を参照
- `TestingPhase` - test_implementation、implementation、test_scenario を参照
- `DocumentationPhase` - implementation、testing を主要コンテキストとして参照
- `ReportPhase` - requirements、design、implementation、testing、documentation を参照

各Phaseは、ファイルが存在しない場合でも適切なフォールバックメッセージによりエージェントが動作を継続できます。

## ワークフローメタデータ

```
.ai-workflow/issue-385/
├── metadata.json             # WorkflowState（フェーズ状態、コスト、設計メモ、対象リポジトリ等）
├── 00_planning/
│   ├── execute/agent_log_raw.txt
│   ├── execute/prompt.txt
│   ├── review/...
│   └── output/planning.md
└── …
```

`metadata.json` には以下を記録します。

- `phases.*.status` … `pending | in_progress | completed | failed`
- `phases.*.current_step` … 現在実行中のステップ（'execute' | 'review' | 'revise' | null）（v0.3.0 で追加）
- `phases.*.completed_steps` … 完了済みステップの配列（v0.3.0 で追加）
- `phases.*.rollback_context` … 差し戻しコンテキスト（triggered_at、from_phase、to_phase、to_step、reason等）（v0.4.0、Issue #90で追加、オプショナル）
- `rollback_history` … 差し戻し履歴の配列（各エントリは triggered_at、from_phase、to_phase、to_step、reason等を含む）（v0.4.0、Issue #90で追加、オプショナル）
- `retry_count` … revise 実行回数
- `output_files` … 生成成果物のパス
- `design_decisions` … 設計フェーズでの意思決定ログ
- `cost_tracking` … トークン数と概算コスト（USD）
- `github_integration` … 進捗コメントの ID など
- `target_repository` … 対象リポジトリ情報（path、github_name、remote_url、owner、repo）（v0.2.0 で追加）

### ワークフローログクリーンアップ

Report Phase (Phase 8) 完了後、`cleanupWorkflowLogs()` メソッドが自動的に実行され、デバッグログを削除します：

**削除対象**:
- フェーズ 00_planning 〜 08_report の `execute/`, `review/`, `revise/` ディレクトリ
- 内容: `agent_log.md`, `agent_log_raw.txt`, `prompt.txt` など

**保持対象**:
- `metadata.json`（各フェーズのメタデータ）
- `output/*.md`（成果物ファイル、Planning Phaseの `output/planning.md` を含む）

**実行タイミング**: Report Phase の `execute()` メソッド完了後、Git コミット前に実行されるため、クリーンアップされた状態が自動的にコミット・プッシュされます。

**Git コミットメッセージ**: `[ai-workflow] Clean up workflow execution logs` (Phase 8: report)

**エラーハンドリング**: クリーンアップ失敗時も WARNING ログのみ出力し、ワークフロー全体は継続します。

**効果**: リポジトリサイズを約 75% 削減、PR レビューを成果物に集中

### Evaluation Phase 完了後のクリーンアップ（v0.3.0）

Evaluation Phase (Phase 9) 完了後、`--cleanup-on-complete` オプションでワークフローディレクトリ全体を削除できます：

**実行フロー**:
1. `EvaluationPhase.run(options)` 実行
2. `super.run(options)` でフェーズ完了
3. `options.cleanupOnComplete === true` の場合、`BasePhase.cleanupWorkflowArtifacts()` 呼び出し
4. CI環境判定（`process.env.CI`）
5. 確認プロンプト表示（`force=false` かつ非CI環境の場合のみ）
6. パス検証（正規表現 `\.ai-workflow[\/\\]issue-\d+$`）とシンボリックリンクチェック
7. `.ai-workflow/issue-<NUM>/` ディレクトリ削除
8. Git コミット & プッシュ

**エラーハンドリング**: クリーンアップ失敗時もワークフロー全体は成功として扱う（Report Phaseと同様）

**セキュリティ対策**:
- パストラバーサル攻撃防止（正規表現によるパス検証）
- シンボリックリンク攻撃防止（`fs.lstatSync()` による検証）

## 外部サービスとの連携

### Codex CLI
- バイナリパス: `codex`（必要に応じて `CODEX_CLI_PATH` で上書き）
- 必須環境変数: `CODEX_API_KEY` または `OPENAI_API_KEY`
- ログ: `agent_log_raw.txt`（JSON）＋ Markdown サマリー

### Claude Code SDK
- `CLAUDE_CODE_CREDENTIALS_PATH` もしくは `CLAUDE_CODE_OAUTH_TOKEN` が必要
- SDK のストリームイベントを Codex と同じ形式の JSON 配列として保存

### GitHub

**GitHubClient のモジュール構成（v0.3.1、Issue #24）**:

GitHubClient は702行から402行へリファクタリングされ（約42.7%削減）、ファサードパターンにより4つの専門クライアントに責務を分離しました：

- **IssueClient** (`src/core/github/issue-client.ts`): Issue操作を担当。Issue取得、コメント投稿、クローズ、残タスクIssue作成を提供。フォローアップIssue生成機能（タイトル生成、キーワード抽出、詳細フォーマット）を含む（Issue #104で拡張）。**LLM統合によるフォローアップIssue生成**（Issue #119で追加）。LLM生成→フォールバック制御→メタデータ付与を実装し、`IssueAIGenerator`と連携してOpenAI/Anthropic経由で高品質なIssueタイトル・本文を生成。LLM失敗時は既存テンプレートへ自動フォールバック。**エージェントベースIssue生成**（Issue #174で追加）。`IssueAgentGenerator`と連携してCodex/Claudeエージェント経由でフォローアップIssueを生成。エージェント失敗時はLLM APIへフォールバック。
- **IssueAIGenerator** (`src/core/github/issue-ai-generator.ts`): フォローアップIssue用LLM生成エンジン（Issue #119で追加）。プロンプト生成、サニタイズ（SecretMasker統合）、OpenAI/Anthropicアダプタ、レスポンス検証（タイトル長・必須セクションチェック）、リトライ制御（指数バックオフ）、利用量メトリクス記録を提供。OpenAI (`gpt-4o-mini`) とAnthropic (`claude-3-sonnet-20240229`) をサポート。
- **IssueAgentGenerator** (`src/core/github/issue-agent-generator.ts`): フォローアップIssue用エージェント生成エンジン（Issue #174で追加）。エージェント（Codex/Claude）を使用してフォローアップIssueのタイトル・本文を生成。ファイルベース出力方式（一時ファイルに書き込み→読み込み→クリーンアップ）、2段階フォールバック機構（①Codex→Claude、②Agent→LLM API）、5必須セクション検証（背景、目的、実行内容、受け入れ基準、参考情報）、タイトル生成（キーワード抽出、100文字制限）、テンプレートベースフォールバック生成を提供。`generate()`, `buildPrompt()`, `isValidIssueContent()`, `createFallbackBody()`, `generateTitle()` メソッドをエクスポート。
- **PullRequestClient** (`src/core/github/pull-request-client.ts`): PR操作を担当。PR作成、更新、検索、クローズ、PR番号取得を提供。
- **CommentClient** (`src/core/github/comment-client.ts`): コメント操作を担当。ワークフロー進捗コメント、進捗コメント作成/更新を担当。
- **ReviewClient** (`src/core/github/review-client.ts`): レビュー操作を担当。レビュー結果投稿を担当。

**ファサードパターンの設計**:
- GitHubClient は各専門クライアントのインスタンスを保持し、既存のpublicメソッドを対応するクライアントに委譲
- Octokitインスタンスはコンストラクタ注入により各クライアントで共有（依存性注入パターン）
- 後方互換性100%維持（既存の呼び出し元は無変更で動作）
- ドキュメント抽出関連メソッド（`extractPhaseOutputs`, `generatePrBodyTemplate`, `generatePrBodyDetailed` 等）はGitHubClient内部に保持

**環境変数**:
- `GITHUB_TOKEN`, `GITHUB_REPOSITORY` を使用
- Issue への進捗コメント投稿、PR ボディ生成、成果物の添付に利用

### Git

**GitManager のモジュール構成（v0.3.1、Issue #25 / v0.4.0、Issue #52）**:

GitManager は548行から181行へリファクタリングされ（約67%削減）、ファサードパターンにより3つの専門マネージャーに責務を分離しました：

- **CommitManager** (`src/core/git/commit-manager.ts`): コミット操作を担当（約409行、Issue #52で30.2%削減）。コミット作成（commitPhaseOutput, commitStepOutput, commitWorkflowInit, commitCleanupLogs）、FileSelector/CommitMessageBuilderへの委譲によるファサードパターン実装、SecretMasker統合（Issue #54でmetadata.jsonスキャン追加）、ensureGitConfig（Git設定管理）を提供。
  - **FileSelector** (`src/core/git/file-selector.ts`): ファイル選択・フィルタリング専門モジュール（約160行、Issue #52で追加）。getChangedFiles（変更ファイル検出）、filterPhaseFiles（Issue番号フィルタリング）、getPhaseSpecificFiles（フェーズ固有パターンマッチング）、scanDirectories、scanByPatterns、@tmp除外ロジックを担当。
  - **CommitMessageBuilder** (`src/core/git/commit-message-builder.ts`): コミットメッセージ構築専門モジュール（約151行、Issue #52で追加）。createCommitMessage（フェーズ完了）、buildStepCommitMessage（ステップ完了）、createInitCommitMessage（初期化）、createCleanupCommitMessage（クリーンアップ）のメッセージ生成を担当。
- **BranchManager** (`src/core/git/branch-manager.ts`): ブランチ操作を担当。ブランチ作成、切り替え、存在チェック（ローカル/リモート）、現在のブランチ取得を提供。
- **RemoteManager** (`src/core/git/remote-manager.ts`): リモート操作を担当。push（upstream設定、リトライロジック）、pull、GitHub認証設定（setupGithubCredentials）、再試行可能エラー判定（isRetriableError）を提供。
- **SquashManager** (`src/core/git/squash-manager.ts`): スカッシュ操作を担当（Issue #194で追加）。コミットスカッシュ（`squashCommits()`）、コミット範囲取得（`getCommitsToSquash()`）、ブランチ保護（`validateBranchProtection()`）、エージェント生成コミットメッセージ（`generateCommitMessage()`）、スカッシュ実行（`executeSquash()`）、フォールバックメッセージ生成（`generateFallbackMessage()`）を提供。Codex / Claude エージェントがConventional Commits形式のメッセージを生成し、`--force-with-lease` で安全に強制プッシュ。

**ファサードパターンの設計**:
- GitManager は各専門マネージャーのインスタンスを保持し、既存のpublicメソッドを対応するマネージャーに委譲
- simple-gitインスタンスはコンストラクタ注入により各マネージャーで共有（依存性注入パターン）
- 後方互換性100%維持（既存の呼び出し元は無変更で動作）
- 自動コミットメッセージは `"[ai-workflow] Phase {number} ({name}) - {step} completed"` 形式（ステップ単位のコミット）

## Jenkins での利用

### 実行モード別Jenkinsfile（v0.4.0、Issue #211で追加）

Jenkinsfileは実行モード別に分割され、保守性と可読性が大幅に向上しました：

**実行モード専用Jenkinsfile**:
- `jenkins/Jenkinsfile.all-phases` … 全フェーズ実行（Phase 0-9）
- `jenkins/Jenkinsfile.preset` … プリセットワークフロー実行（7種類のプリセットに対応）
- `jenkins/Jenkinsfile.single-phase` … 単一フェーズ実行（Phase 0-9の任意のフェーズ）
- `jenkins/Jenkinsfile.rollback` … フェーズ差し戻し実行（v0.4.0、Issue #90）
- `jenkins/Jenkinsfile.auto-issue` … 自動Issue生成（v0.5.0、Issue #121）
- `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` … ワークフロー完了後の最終処理実行（v0.4.0、Issue #259）

**共通処理モジュール**:
- `jenkins/shared/common.groovy` … 認証情報準備、環境セットアップ、Node.js環境、成果物アーカイブ

各Jenkinsfileは `load 'jenkins/shared/common.groovy'` で共通処理を再利用し、重複コードを約90%削減しました。

**非推奨ファイル**:
- `Jenkinsfile`（ルートディレクトリ） … 非推奨（削除予定: 2025年3月以降、並行運用期間終了後）

### Job DSL設定

`jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy` で Job DSL パラメータ（`AGENT_MODE`、`OPENAI_API_KEY`、`GITHUB_TOKEN`、AWS認証情報等）を定義し、各実行モード専用のJenkinsfileが CLI に渡します。TypeScript プロジェクトの `Dockerfile` からビルドしたイメージ上で CLI を実行し、必要に応じて Claude 認証情報をコピーします。

**認証情報の管理**:
- **Job DSLパラメータ経由**: `OPENAI_API_KEY`、`GITHUB_TOKEN`、AWS認証情報（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）
  - Jenkinsfile の `environment` セクションで `params` から環境変数に設定
  - 例: `OPENAI_API_KEY = "${params.OPENAI_API_KEY}"`
- **Jenkins Credentials経由**: `claude-code-oauth-token`
  - Jenkinsfile の `Prepare Agent Credentials` ステージで処理
  - Base64エンコードされたファイルとして保存・デコード

## ビルドパイプライン

```
npm run build
 ├─ tsc -p tsconfig.json
 └─ node scripts/copy-static-assets.mjs
```

`dist/` ディレクトリは `src/` と同じ構造で生成され、Docker / Jenkins からもプロンプトとテンプレートを利用できるようになります。
