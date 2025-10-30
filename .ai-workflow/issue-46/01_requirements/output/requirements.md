# 要件定義書: Issue #46

**作成日**: 2025-01-20
**Issue番号**: #46
**Issue タイトル**: リファクタリング: execute.ts を小さなモジュールに分解（683行）
**対象リポジトリ**: tielec/ai-workflow-agent

---

## 0. Planning Document の確認

Planning Document（`.ai-workflow/issue-46/00_planning/output/planning.md`）で策定された開発計画を踏まえ、以下の方針で要件定義を実施します：

### 開発計画の概要
- **実装戦略**: REFACTOR（既存機能を保持しつつ、複数のモジュールに分割）
- **テスト戦略**: UNIT_ONLY（既存の統合テストを回帰テストとして活用し、新規ユニットテストを追加）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 24~32時間（3~4営業日相当）
- **リスク評価**: 中（非破壊的リファクタリング、既存テストでカバーされているが、インポート文修正時の誤りが混入しやすい）

### 成功基準
1. `execute.ts` が683行から約150行に削減され、循環的複雑度が低下している
2. 各モジュールが明確な責務を持ち、独立してテスト可能である
3. 既存のインポート元（`src/main.ts`, テストファイル）は変更不要である
4. すべてのユニットテストと統合テストが成功している
5. テストカバレッジ90%以上を維持している
6. ARCHITECTURE.md と CLAUDE.md が最新の状態に更新されている
7. 今後の機能追加時に、該当モジュールのみ変更すればよい状態になっている

---

## 1. 概要

### 背景
`src/commands/execute.ts` は現在683行あり、AI Workflow Agent における最大のファイルとなっています。このファイルは以下の複数の責務を持っているため、メンテナンスとテストが困難な状態です：

- **CLIオプション解析**: `--preset`, `--phase`, `--skip-dependency-check`, `--ignore-dependencies` 等の相互排他オプション検証
- **エージェント初期化と認証情報管理**: Codex/Claude の API キーまたは認証情報ファイルの探索とフォールバック処理
- **メタデータ読み込みと検証**: ワークフローメタデータの存在確認、対象リポジトリ情報の取得
- **Git 操作**: ブランチ切り替え、pull/push
- **フェーズ実行のオーケストレーション**: 依存関係順にフェーズを順次実行
- **エラーハンドリングとレポート**: 実行サマリーの生成と報告

循環的複雑度は推定25+となっており、一部の変更が他の部分に影響を与えやすく、理解が困難な状態です。

### 目的
本リファクタリングの目的は、`execute.ts` を単一責任の原則（SRP）に準拠した複数のモジュールに分解し、以下を実現することです：

1. **保守性の向上**: 各モジュールが明確な責務を持ち、変更の影響範囲が限定される
2. **テスタビリティの向上**: 個別コンポーネントの独立したテストが容易になる
3. **循環的複雑度の低減**: モジュール分割により、各関数の複雑度を低減
4. **再利用可能なコンポーネント**: 他のコマンドハンドラからも利用可能なコンポーネントを提供

### ビジネス価値
- **開発速度の向上**: 保守性向上により、新機能追加やバグ修正が迅速化
- **品質向上**: テスタビリティ向上により、バグ混入リスクが低減
- **技術的負債の削減**: 循環的複雑度低減により、長期的なメンテナンスコストが削減

### 技術的価値
- **アーキテクチャの改善**: ファサードパターンの適用により、既存の公開APIを維持しつつ内部実装を刷新
- **コードの可読性向上**: 各モジュールが独立したファイルとなり、責務が明確化
- **過去の成功事例の適用**: Issue #24（GitHubClient）、Issue #25（GitManager）、Issue #26（各種ヘルパー）で実証されたリファクタリングパターンを適用

---

## 2. 機能要件

本リファクタリングでは、既存機能を完全に保持しつつ、コード構造のみを改善します。

### FR-1: モジュール分割 【優先度: 高】
- **ID**: FR-1
- **要件**: `src/commands/execute.ts`（683行）を以下の4つのモジュールに分割する
  1. `src/commands/execute/options-parser.ts`（約100行）
  2. `src/commands/execute/agent-setup.ts`（約150行）
  3. `src/commands/execute/workflow-executor.ts`（約200行）
  4. `src/core/phase-factory.ts`（約100行）
- **詳細**:
  - 分割後の `execute.ts` は約150行に削減
  - 各モジュールは単一の責務を持つ
- **根拠**: Issue #24, #25 で実証された成功パターン（ファサードパターン + 専門クライアント）

### FR-2: options-parser モジュール 【優先度: 高】
- **ID**: FR-2
- **要件**: CLIオプションの解析とバリデーションロジックを専門モジュールに分離
- **提供する関数**:
  - `parseExecuteOptions(options: ExecuteCommandOptions): ParsedExecuteOptions`
    - ExecuteCommandOptions を正規化し、デフォルト値を補完
  - `validateExecuteOptions(options: ExecuteCommandOptions): ValidationResult`
    - 相互排他オプション（`--preset` vs `--phase`, `--skip-dependency-check` vs `--ignore-dependencies`）を検証
    - 必須オプション（`--issue`）の存在を確認
- **エラーハンドリング**: 検証失敗時は `ValidationResult.valid = false` を返し、エラーメッセージを含める

### FR-3: agent-setup モジュール 【優先度: 高】
- **ID**: FR-3
- **要件**: エージェント初期化と認証情報の解決ロジックを専門モジュールに分離
- **提供する関数**:
  - `setupAgentClients(agentMode, workingDir): AgentSetupResult`
    - Codex/Claude クライアントのインスタンス化
    - エージェントモード（auto/codex/claude）に基づいた初期化
  - `resolveAgentCredentials(homeDir, repoRoot): CredentialsResult`
    - Codex API キーのフォールバック処理（`CODEX_API_KEY` → `OPENAI_API_KEY`）
    - Claude 認証情報ファイルの候補パス探索（`CLAUDE_CODE_CREDENTIALS_PATH` → `~/.claude-code/credentials.json` → `<repo>/.claude-code/credentials.json`）
- **フォールバック処理**:
  - `agentMode: 'auto'` の場合、Codex API キー優先、Claudeにフォールバック
  - 両方とも利用不可の場合、エラーメッセージを返す

### FR-4: workflow-executor モジュール 【優先度: 高】
- **ID**: FR-4
- **要件**: ワークフロー実行ロジックを専門モジュールに分離
- **提供する関数**:
  - `executePhasesSequential(phases, context, gitManager, ...): ExecutionSummary`
    - フェーズを依存関係順に順次実行
    - 既存の実装を完全に移植（変更なし）
  - `executePhasesFrom(startPhase, context, gitManager, ...): ExecutionSummary`
    - 特定フェーズから実行を開始
    - レジューム機能で使用
  - `resumeWorkflowIfNeeded(metadata): ResumeInfo | null`
    - ResumeManager を使用したレジュームロジック
    - レジューム可能な場合、再開フェーズを返す
- **既存機能の保持**:
  - `PhaseContext` の構築ロジックをそのまま移植
  - Git 自動コミット＆プッシュの統合を維持

### FR-5: phase-factory モジュール 【優先度: 高】
- **ID**: FR-5
- **要件**: フェーズインスタンス生成ロジックを `src/core/phase-factory.ts` に分離
- **提供する関数**:
  - `createPhaseInstance(phaseName, context): BasePhase`
    - フェーズ名から対応するクラスインスタンスを生成
    - 10フェーズすべてに対応（Planning, Requirements, Design, TestScenario, Implementation, TestImplementation, Testing, Documentation, Report, Evaluation）
    - Switch文を保持（既存の493-529行を移植）
- **PhaseContext 構築**:
  - `baseParams` オブジェクトを生成（workingDir, metadataManager, codexClient, claudeClient, githubClient, skipDependencyCheck, ignoreDependencies, presetPhases）
  - 各フェーズクラスのコンストラクタに渡す

### FR-6: ファサードパターンによる後方互換性維持 【優先度: 高】
- **ID**: FR-6
- **要件**: `src/commands/execute.ts` がファサードとして既存の公開APIを維持
- **公開関数（再エクスポート）**:
  - `handleExecuteCommand(options)`（簡素化、各モジュールへ委譲）
  - `executePhasesSequential(phases, context, gitManager, ...)`（workflow-executor から再エクスポート）
  - `executePhasesFrom(startPhase, context, gitManager, ...)`（workflow-executor から再エクスポート）
  - `createPhaseInstance(phaseName, context)`（phase-factory から再エクスポート）
  - `resolvePresetName(presetName)`（そのまま保持）
  - `getPresetPhases(presetName)`（そのまま保持）
- **既存インポート元**:
  - `src/main.ts`（変更不要）
  - `tests/unit/commands/execute.test.ts`（変更不要）
  - `tests/integration/preset-execution.test.ts`（変更不要）

### FR-7: インポート文の整理 【優先度: 中】
- **ID**: FR-7
- **要件**: 10フェーズクラスのインポート文を `phase-factory.ts` に移動
- **現在の状態**: `execute.ts` の28-37行で10フェーズをインポート
- **分割後**: `phase-factory.ts` のみでフェーズクラスをインポート、`execute.ts` では不要

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- **応答時間**: リファクタリング前後で、フェーズ実行の応答時間に変化がないこと（±5%以内）
- **メモリ消費**: モジュール分割によるメモリ消費増加は10%以内に抑える
- **根拠**: ファサードパターンの委譲オーバーヘッドは無視できるレベルであることを確認（Issue #24, #25で実証済み）

### NFR-2: 保守性要件
- **循環的複雑度**: 各関数の循環的複雑度を10以下に抑える（現在: 推定25+）
- **ファイルサイズ**: 各モジュールは200行以内に抑える（`execute.ts` は約150行に削減）
- **単一責任の原則**: 各モジュールが1つの責務のみを持つ
- **依存性注入**: 各モジュールは PhaseContext や GitManager 等を引数で受け取り、外部依存を注入可能とする

### NFR-3: テスタビリティ要件
- **ユニットテストカバレッジ**: 新規モジュールのコードカバレッジは90%以上
- **独立性**: 各モジュールが独立してテスト可能（モックとスタブで外部依存を置き換え）
- **統合テストの維持**: 既存の統合テスト（`preset-execution.test.ts`, `multi-repo-workflow.test.ts`）が変更なしで動作すること

### NFR-4: 可用性・信頼性要件
- **エラーハンドリング**: 各モジュールがエラー時に適切なエラーメッセージを返す
- **ロールバック可能性**: リファクタリング後も既存の ResumeManager による中断・再開機能が動作すること
- **CI/CD互換性**: Jenkins パイプラインが変更なしで動作すること

### NFR-5: セキュリティ要件
- **認証情報の保護**: Codex API キーおよび Claude 認証情報ファイルパスを環境変数経由でのみ取得（ハードコード禁止）
- **Personal Access Token の除去**: Git remote URL のサニタイズ処理を維持（Issue #54 で導入済み）
- **ファイルパスの検証**: 外部ドキュメント読み込み時のパストラバーサル対策を維持

---

## 4. 制約事項

### 技術的制約
1. **TypeScript バージョン**: TypeScript 5.x を使用（package.json で定義）
2. **Node.js バージョン**: Node.js 20 以上（Dockerfile で定義）
3. **ESM モジュール形式**: `"type": "module"` のため、すべてのインポートは `.js` 拡張子を含む
4. **既存の型定義**: `src/types/commands.ts` の型定義（Issue #45 で導入）を再利用
5. **Config クラスの使用**: 環境変数アクセスは `src/core/config.ts` 経由（Issue #51 で導入）
6. **統一ロガーの使用**: ログ出力は `src/utils/logger.ts` 経由（Issue #61 で導入）
7. **エラーハンドリングユーティリティの使用**: `src/utils/error-utils.ts` の `getErrorMessage()` を使用（Issue #48 で導入）

### リソース制約
1. **工数**: 24~32時間（3~4営業日相当）
2. **対象ファイル数**: 直接影響を受けるファイルは7つ（新規作成5つ、既存変更2つ）
3. **テスト時間**: ユニットテスト実行は5分以内、統合テストは10分以内

### ポリシー制約
1. **後方互換性の維持**: 既存の公開API（`handleExecuteCommand`, `executePhasesSequential`, `createPhaseInstance` 等）は変更不可
2. **非破壊的リファクタリング**: 機能追加は一切行わない（別 Issue で対応）
3. **コーディング規約**: ESLint ルール（`.eslintrc.json`）に準拠
4. **コミットメッセージ形式**: `[ai-workflow] Phase {number} ({name}) - {step} completed` 形式を維持

---

## 5. 前提条件

### システム環境
- **OS**: Linux/macOS（Docker コンテナ環境でも動作）
- **Node.js**: v20 以上
- **npm**: v10 以上
- **Git**: v2.30 以上

### 依存コンポーネント
- **Issue #45 の完了**: `src/types/commands.ts` に `ExecuteCommandOptions`, `PhaseContext`, `ExecutionSummary` 等の型定義が存在すること（完了済み）
- **既存の統合テスト**: `tests/integration/preset-execution.test.ts`, `tests/integration/multi-repo-workflow.test.ts` が動作すること
- **既存のユニットテスト**: `tests/unit/commands/execute.test.ts` が動作すること

### 外部システム連携
- **GitHub API**: `GitHubClient` を経由して Issue コメント投稿、PR 作成を行う
- **Git**: `GitManager` を経由してブランチ切り替え、コミット、プッシュを行う
- **Codex/Claude API**: エージェントクライアント（`CodexAgentClient`, `ClaudeAgentClient`）を経由してプロンプト実行を行う

---

## 6. 受け入れ基準

本リファクタリングは、以下の受け入れ基準をすべて満たす必要があります。

### AC-1: モジュール分割の完了
- **Given**: `src/commands/execute.ts` が683行存在する
- **When**: リファクタリングを実施
- **Then**:
  - `src/commands/execute.ts` が約150行に削減される
  - `src/commands/execute/options-parser.ts` が約100行で作成される
  - `src/commands/execute/agent-setup.ts` が約150行で作成される
  - `src/commands/execute/workflow-executor.ts` が約200行で作成される
  - `src/core/phase-factory.ts` が約100行で作成される

### AC-2: 後方互換性の維持
- **Given**: 既存のインポート元（`src/main.ts`, テストファイル）が存在する
- **When**: リファクタリングを実施
- **Then**:
  - 既存のインポート元はコード変更なしで動作する
  - `handleExecuteCommand()`, `executePhasesSequential()`, `createPhaseInstance()` 等の公開関数が `execute.ts` から利用可能

### AC-3: TypeScript コンパイル成功
- **Given**: リファクタリング後のコードが存在する
- **When**: `npm run build` を実行
- **Then**:
  - TypeScript コンパイルが成功する
  - `dist/` ディレクトリにコンパイル済み JavaScript が生成される
  - ESLint チェック（`npx eslint src/`）が成功する

### AC-4: ユニットテストの成功
- **Given**: 新規ユニットテストが作成されている
- **When**: `npm run test:unit` を実行
- **Then**:
  - すべてのユニットテストが成功する
  - 新規モジュールのコードカバレッジが90%以上である
  - 既存の `tests/unit/commands/execute.test.ts` が変更なしで動作する

### AC-5: 統合テストの成功（回帰テスト）
- **Given**: 既存の統合テストが存在する
- **When**: `npm run test:integration` を実行
- **Then**:
  - すべての統合テストが成功する（`preset-execution.test.ts`, `multi-repo-workflow.test.ts` 等）
  - リファクタリング前後で動作が同一である

### AC-6: 循環的複雑度の低減
- **Given**: リファクタリング後のコードが存在する
- **When**: 循環的複雑度を測定（`npx eslint src/ --ext .ts --format json`）
- **Then**:
  - 各関数の循環的複雑度が10以下である
  - `handleExecuteCommand()` の循環的複雑度が50%以上削減される

### AC-7: ドキュメントの更新
- **Given**: リファクタリングが完了している
- **When**: `ARCHITECTURE.md` と `CLAUDE.md` を確認
- **Then**:
  - 新規モジュール（`options-parser.ts`, `agent-setup.ts`, `workflow-executor.ts`, `phase-factory.ts`）が「モジュール一覧」テーブルに追加されている
  - `execute.ts` の行数が更新されている（683行 → 約150行）
  - 「フェーズ実行フロー」セクションが更新されている

### AC-8: エージェント初期化ロジックの保持
- **Given**: リファクタリング前のエージェント初期化ロジックが存在する
- **When**: `agent-setup.ts` のロジックを確認
- **Then**:
  - Codex API キーのフォールバック処理（`CODEX_API_KEY` → `OPENAI_API_KEY`）が保持されている
  - Claude 認証情報ファイルの候補パス探索（3つのパス）が保持されている
  - エージェントモード（auto/codex/claude）の選択ロジックが保持されている

---

## 7. スコープ外

以下の事項は本リファクタリングのスコープ外とし、別 Issue で対応します。

### スコープ外の項目
1. **新機能の追加**:
   - 新しいエージェントモードの追加
   - 新しいプリセットの追加
   - 新しい CLI オプションの追加
2. **パフォーマンス最適化**:
   - フェーズ実行の並列化
   - キャッシュ機構の導入
3. **ロジックの変更**:
   - エージェントフォールバック処理の変更
   - レジュームロジックの変更
   - 依存関係検証ロジックの変更
4. **他のコマンドハンドラのリファクタリング**:
   - `src/commands/init.ts`（306行）
   - `src/commands/review.ts`（33行）
   - `src/commands/list-presets.ts`（34行）
5. **BasePhase クラスのリファクタリング**:
   - Issue #23 で完了済み（698行 → 676行、52.4%削減）
6. **GitHubClient, GitManager のリファクタリング**:
   - Issue #24, #25 で完了済み

### 将来的な拡張候補
1. **プリセットの動的読み込み**: 外部ファイル（YAML/JSON）からプリセット定義を読み込む
2. **エージェント初期化の設定ファイル化**: `agent-config.json` 等で認証情報を一元管理
3. **ワークフロー実行の並列化**: 依存関係のない複数フェーズを並列実行
4. **CLI オプションの型安全性向上**: Zod 等のバリデーションライブラリの導入

---

## 8. 参考情報

### 類似のリファクタリング事例

本プロジェクトでは、過去に以下のリファクタリングを実施しており、同様のパターンを適用できます：

#### Issue #24: GitHubClient のリファクタリング（v0.3.1）
- **削減**: 702行 → 402行（42.7%削減）
- **パターン**: ファサードパターンで4つの専門クライアントに分離（IssueClient, PullRequestClient, CommentClient, ReviewClient）
- **後方互換性**: 100%維持
- **教訓**:
  - ファサードクラスで既存のpublicメソッドを専門クライアントに委譲
  - Octokitインスタンスはコンストラクタ注入により共有
  - ドキュメント抽出関連メソッドはファサードクラス内部に保持

#### Issue #25: GitManager のリファクタリング（v0.3.1）
- **削減**: 548行 → 181行（67%削減）
- **パターン**: ファサードパターンで3つの専門マネージャーに分離（CommitManager, BranchManager, RemoteManager）
- **後方互換性**: 100%維持
- **教訓**:
  - simple-gitインスタンスはコンストラクタ注入により共有
  - 自動コミットメッセージは統一形式を保持

#### Issue #26: 各種ヘルパーの分離（v0.3.1）
- **削減**: CodexAgentClient（25.4%削減）、ClaudeAgentClient（23.7%削減）、MetadataManager（9.5%削減）、phase-dependencies（27.2%削減）
- **パターン**: 共通ロジックを `src/core/helpers/` に抽出
- **教訓**:
  - 小さなヘルパー関数（50-200行）は `helpers/` ディレクトリに配置
  - 単一の責務を持つヘルパーモジュールを作成

#### Issue #23: BasePhase のリファクタリング（v0.3.1）
- **削減**: 1420行 → 676行（52.4%削減）
- **パターン**: 4つの独立したモジュールに責務を分離（AgentExecutor, ReviewCycleManager, ProgressFormatter, LogFormatter）
- **教訓**:
  - オーケストレーション層（BasePhase）とビジネスロジック層（専門モジュール）を分離
  - 依存性注入パターンでモジュール間を統合

### 設計パターン

#### ファサードパターン
- **適用箇所**: `src/commands/execute.ts`
- **目的**: 既存の公開API（`handleExecuteCommand` 等）を維持し、内部実装を各モジュールに委譲
- **利点**:
  - 既存のインポート元は変更不要
  - 内部実装を自由に変更可能
  - モジュール間の結合度を低減

#### 単一責任の原則（SRP）
- **適用箇所**: 各モジュール（options-parser, agent-setup, workflow-executor, phase-factory）
- **目的**: 各モジュールが1つの責務のみを持つ
- **利点**:
  - 変更の影響範囲が限定される
  - テストが容易になる
  - 理解が容易になる

#### 依存性注入（DI）
- **適用箇所**: 各モジュールがPhaseContextやGitManager等を引数で受け取る
- **目的**: 外部依存を注入可能とし、テスト時にモックやスタブで置き換え可能にする
- **利点**:
  - テスタビリティの向上
  - モジュール間の疎結合化
  - 柔軟性の向上

### 関連ドキュメント
- **CLAUDE.md**: プロジェクト全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **Issue #45**: コマンドハンドラの型定義（依存関係、完了済み）
- **Issue #24**: GitHubClient のリファクタリング（参考事例）
- **Issue #25**: GitManager のリファクタリング（参考事例）
- **Issue #26**: 各種ヘルパーの分離（参考事例）

---

## 9. 補足事項

### リファクタリングの段階的実施
本リファクタリングは以下の順序で段階的に実施します：

1. **Phase 1（要件定義）**: 本ドキュメントの作成（2~3h）
2. **Phase 2（設計）**: 各モジュールの詳細設計、インターフェース設計、依存関係図作成（4~6h）
3. **Phase 3（テストシナリオ）**: 正常系・異常系テストケースの洗い出し（2~3h）
4. **Phase 4（実装）**: 4つのモジュール実装、インポートパス修正（8~12h）
5. **Phase 5（テストコード実装）**: 新規テストファイル作成、既存テスト拡張（3~4h）
6. **Phase 6（テスト実行）**: テスト実行、デバッグ（1~2h）
7. **Phase 7（ドキュメント）**: CLAUDE.md、ARCHITECTURE.md の更新（2~3h）
8. **Phase 8（レポート）**: 実装完了レポート作成（1~1h）

### リスク軽減策
本リファクタリングのリスク（Planning Document で評価: 中）に対する軽減策：

1. **インポートパスの誤り**: TypeScript コンパイラ、ESLint の import/no-unresolved ルール、段階的リファクタリングで検出
2. **既存テストの破壊**: ファサードパターンによる後方互換性維持、各実装ステップ後にテスト実行
3. **エージェント初期化ロジックの不整合**: 既存ロジックを忠実に移植、単体テスト充実、統合テストで回帰テスト
4. **循環依存の発生**: モジュール分割時に依存方向を明確化、`madge` ツールで検出
5. **スコープクリープ**: 「リファクタリングのみ」を厳守、コードレビューで機能変更がないことを確認

---

**計画書作成日**: 2025-01-20
**想定完了日**: Phase 0〜8 を通じて 24〜32時間（3〜4営業日相当）
