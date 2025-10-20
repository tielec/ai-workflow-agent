# 要件定義書

**Issue**: #1 - [REFACTOR] 大規模ファイルのリファクタリング計画
**作成日**: 2025-01-20
**プロジェクト**: AI Workflow Agent (TypeScript)

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された以下の開発計画を確認し、これに基づいて要件定義を実施します：

- **実装戦略**: REFACTOR（既存機能の保持、構造改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テストの修正 + 新規テスト作成）
- **見積もり工数**: 40~60時間
- **リスク評価**: 高（後方互換性、テストカバレッジ、段階的移行の失敗、工数超過、既存ワークフローへの影響）

詳細は以下を参照：
- Planning Document: @.ai-workflow/issue-1/00_planning/output/planning.md

---

## 1. 概要

### 1.1 背景

AI Workflow Agent (TypeScript版) のソースコードが肥大化し、保守性と可読性が低下しています。特に以下のファイルが1000行を超える巨大ファイルとなっており、責務の分離が不十分な状態です：

- **main.ts**: 1309行（CLIエントリーポイント、コマンドハンドラ、ユーティリティ関数が混在）
- **base-phase.ts**: 1419行（フェーズ実行、Agent制御、ログフォーマット、レビューサイクルが混在）
- **github-client.ts**: 702行（Issue/PR/コメント操作が集中）
- **git-manager.ts**: 843行（コミット/ブランチ/リモート操作が集中）

この状態は以下の問題を引き起こしています：

1. **保守性の低下**: 1ファイルの変更が広範囲に影響を及ぼす
2. **可読性の低下**: ファイルが長すぎてコードレビューが困難
3. **テストの複雑化**: 大きなクラスのモック・テストが複雑化
4. **新機能追加の難易度増加**: 責務が不明確で拡張が困難

### 1.2 目的

本リファクタリングの目的は以下の通りです：

1. **保守性の向上**: 各ファイルを200~300行以下に削減し、責務を明確化
2. **可読性の向上**: 単一責任の原則（SRP）に基づいてクラスを分割
3. **テストしやすさの向上**: 小規模クラスによりユニットテストが容易に
4. **拡張性の向上**: 新しいフェーズやコマンドの追加が容易に

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- 開発速度の向上（新機能追加が容易に）
- バグ修正時間の短縮（影響範囲の明確化）
- コードレビュー時間の削減（小規模ファイルによる）

**技術的価値**:
- SOLID原則への準拠（特に単一責任の原則）
- テストカバレッジの維持・向上
- 技術的負債の解消
- 新規開発者のオンボーディング時間の短縮

---

## 2. 機能要件

### FR-1: main.ts のリファクタリング（最優先）

**優先度**: 高
**説明**: CLIエントリーポイントとコマンドハンドラを分離し、main.ts を200行以下に削減

**詳細要件**:
- FR-1.1: CLIルーティング機能のみを main.ts に残す（`commander` による CLI定義）
- FR-1.2: `init` コマンド処理を `src/commands/init-command.ts` に分離
- FR-1.3: `execute` コマンド処理を `src/commands/execute-command.ts` に分離
- FR-1.4: `review` コマンド処理を `src/commands/review-command.ts` に分離
- FR-1.5: `list-presets` コマンド処理を `src/commands/preset-command.ts` に分離
- FR-1.6: ブランチバリデーション機能を `src/utils/branch-validator.ts` に分離
- FR-1.7: リポジトリパス解決機能を `src/utils/repo-resolver.ts` に分離

**受け入れ基準**:
- main.ts が200行以下に削減されていること
- すべてのCLIコマンド（init, execute, review, list-presets）が正常に動作すること
- 既存のテスト（`tests/unit/branch-validation.test.ts`, `tests/unit/repository-resolution.test.ts`, `tests/unit/main-preset-resolution.test.ts`）が合格すること

---

### FR-2: base-phase.ts のリファクタリング（最優先）

**優先度**: 高
**説明**: BasePhaseクラスの責務を分離し、base-phase.ts を300行以下に削減

**詳細要件**:
- FR-2.1: Agent実行ロジックを `src/phases/base/agent-executor.ts` に分離
  - `executeWithAgent()` メソッド
  - `runAgentTask()` メソッド
  - エージェントフォールバック機能
- FR-2.2: レビューサイクル管理を `src/phases/base/review-cycle-manager.ts` に分離
  - `performReviewCycle()` メソッド
  - リトライ制御（最大3回）
- FR-2.3: 進捗コメント生成を `src/phases/base/progress-formatter.ts` に分離
  - `formatProgressComment()` メソッド
  - フェーズ状態表示ロジック
- FR-2.4: Agentログフォーマット機能を `src/phases/base/agent-log-formatter.ts` に分離
  - `formatAgentLog()` メソッド（Codex/Claude両対応）
  - `formatCodexAgentLog()` メソッド
  - ログ解析・整形ロジック（300行以上）
- FR-2.5: BasePhaseクラスのコア機能のみを `src/phases/base/base-phase.ts` に残す
  - 抽象メソッド定義（execute, review, revise）
  - フェーズライフサイクル管理（run メソッド）
  - ディレクトリ管理、メタデータ更新

**受け入れ基準**:
- base-phase.ts が300行以下に削減されていること
- すべてのフェーズ（planning 〜 evaluation）が正常に動作すること
- 既存のテスト（`tests/unit/step-management.test.ts`, `tests/unit/base-phase-optional-context.test.ts`）が合格すること
- Codex/Claude両エージェントでのログフォーマットが正常に動作すること

---

### FR-3: github-client.ts のリファクタリング（高優先）

**優先度**: 中
**説明**: GitHub API呼び出しを責務ごとに分離し、各ファイルを200行以下に削減

**詳細要件**:
- FR-3.1: Issue操作を `src/core/github/issue-client.ts` に分離
  - `getIssueInfo()` メソッド
  - Issue本文取得、ラベル管理
- FR-3.2: PR操作を `src/core/github/pr-client.ts` に分離
  - `createPullRequest()` メソッド
  - `checkExistingPr()` メソッド
  - PR本文生成、PRステータス管理
- FR-3.3: コメント操作を `src/core/github/comment-client.ts` に分離
  - `postComment()` メソッド
  - `createOrUpdateProgressComment()` メソッド
  - コメント更新・削除機能
- FR-3.4: ファサードクラス `src/core/github/github-client.ts` を作成
  - 既存の外部インターフェースを維持
  - 内部的に issue-client, pr-client, comment-client を呼び出し

**受け入れ基準**:
- github-client.ts および各分離後ファイルが200行以下であること
- すべてのGitHub連携機能（Issue取得、PR作成、コメント投稿）が正常に動作すること
- 既存の統合テスト（`tests/integration/multi-repo-workflow.test.ts`, `tests/integration/custom-branch-workflow.test.ts`）が合格すること

---

### FR-4: git-manager.ts のリファクタリング（中優先）

**優先度**: 中
**説明**: Git操作を責務ごとに分離し、各ファイルを200行以下に削減

**詳細要件**:
- FR-4.1: コミット操作を `src/core/git/commit-manager.ts` に分離
  - `commitPhaseOutput()` メソッド
  - `commitStepOutput()` メソッド（Issue #10対応）
  - `commitWorkflowInit()` メソッド（Issue #16対応）
- FR-4.2: ブランチ操作を `src/core/git/branch-manager.ts` に分離
  - `switchBranch()` メソッド
  - `branchExists()` メソッド
  - `getCurrentBranch()` メソッド
- FR-4.3: リモート操作を `src/core/git/remote-manager.ts` に分離
  - `pushToRemote()` メソッド（リトライ機能含む）
  - `pullLatest()` メソッド
  - リモートURL管理
- FR-4.4: ファサードクラス `src/core/git/git-manager.ts` を作成
  - 既存の外部インターフェースを維持
  - 内部的に commit-manager, branch-manager, remote-manager を呼び出し

**受け入れ基準**:
- git-manager.ts および各分離後ファイルが200行以下であること
- すべてのGit操作（コミット、ブランチ切替、プッシュ）が正常に動作すること
- 既存のテスト（`tests/unit/git-manager-issue16.test.ts`, `tests/integration/step-commit-push.test.ts`, `tests/integration/step-resume.test.ts`）が合格すること

---

### FR-5: テストコードの更新

**優先度**: 高
**説明**: リファクタリングに伴い既存テストを修正し、新規クラスに対するテストを追加

**詳細要件**:
- FR-5.1: 既存テスト18ファイルのimport文を修正
  - 例: `import { ... } from 'src/main.ts'` → `import { ... } from 'src/commands/execute-command.ts'`
- FR-5.2: モック対象の変更
  - 例: `jest.mock('src/main.ts')` → `jest.mock('src/commands/execute-command.ts')`
- FR-5.3: 新規クラスに対するユニットテスト作成
  - `tests/unit/commands/init-command.test.ts`
  - `tests/unit/commands/execute-command.test.ts`
  - `tests/unit/utils/branch-validator.test.ts`
  - `tests/unit/utils/repo-resolver.test.ts`
  - `tests/unit/phases/base/agent-executor.test.ts`
  - `tests/unit/phases/base/review-cycle-manager.test.ts`

**受け入れ基準**:
- すべての既存テストが合格すること（18ファイル）
- 新規クラスに対するテストが作成され、合格すること
- テストカバレッジが80%以上を維持していること（`npm run test:coverage`）

---

### FR-6: ビルド成果物の維持

**優先度**: 高
**説明**: リファクタリング後も `dist/` ディレクトリの構造を維持し、既存の実行環境（Docker, Jenkins）で動作すること

**詳細要件**:
- FR-6.1: `npm run build` が成功すること
- FR-6.2: dist/ ディレクトリにすべての必要ファイルがコピーされること
  - dist/prompts/ … プロンプトテンプレート
  - dist/templates/ … Markdownテンプレート
  - dist/*.js … コンパイル済みJavaScript
- FR-6.3: CLIバイナリ `ai-workflow` が正常に動作すること
  - `node dist/index.js init --issue-url <URL>`
  - `node dist/index.js execute --issue <NUM> --phase all`

**受け入れ基準**:
- `npm run build` が成功すること
- dist/index.js が実行可能であること
- Docker環境でワークフローが実行できること
- Jenkins環境でワークフローが実行できること

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- NFR-1.1: リファクタリング後のワークフロー実行時間が、リファクタリング前と比較して**5%以内の差**であること
- NFR-1.2: ファイル分割によるモジュール読み込み時間が**100ms以内**であること
- NFR-1.3: Agent実行時間（最大の処理時間）に影響を与えないこと

### NFR-2: セキュリティ要件

- NFR-2.1: 既存のセキュリティ機能（シークレットマスキング）が維持されること
  - `src/core/secret-masker.ts` の動作が変わらないこと
  - `tests/unit/secret-masker.test.ts` が合格すること
- NFR-2.2: 環境変数（CODEX_API_KEY, CLAUDE_CODE_CREDENTIALS_PATH, GITHUB_TOKEN）の取り扱いが変わらないこと

### NFR-3: 可用性・信頼性要件

- NFR-3.1: 既存の18ファイルのテストがすべて合格すること
  - ユニットテスト: 11ファイル
  - 統合テスト: 7ファイル
- NFR-3.2: 既存ワークフロー（Issue #2, #10, #16, #396）が影響を受けないこと
  - マルチリポジトリ対応（Issue #396）
  - ステップ単位のコミット＆レジューム（Issue #10）
  - ワークフロークリーンアップ（Issue #2）
  - カスタムブランチ対応（v0.2.0）
- NFR-3.3: エラー発生時のフォールバック機能（Codex → Claude）が維持されること

### NFR-4: 保守性・拡張性要件

- NFR-4.1: 各ファイルが以下の行数制限を満たすこと：
  - main.ts: 200行以下
  - base-phase.ts: 300行以下
  - 新規作成ファイル: 200行以下
- NFR-4.2: SOLID原則（特に単一責任の原則）に準拠していること
- NFR-4.3: 新しいフェーズの追加が容易であること（BasePhaseの継承のみ）
- NFR-4.4: 新しいコマンドの追加が容易であること（commandsディレクトリへの追加のみ）

---

## 4. 制約事項

### 4.1 技術的制約

- **使用技術の維持**: TypeScript 5.6, Node.js 20, Commander 12.1, Simple-Git 3.27
- **依存ライブラリの変更なし**: 新しい依存関係を追加しない（リファクタリングのみ）
- **ビルドツールの維持**: `tsc` + `scripts/copy-static-assets.mjs` の構成を維持
- **プロンプトの維持**: `src/prompts/` 配下のプロンプトテンプレートは変更しない

### 4.2 リソース制約

- **工数**: 40~60時間（Planning Phaseの見積もり）
- **期間**: 段階的リファクタリング（1ファイルずつ対応）
- **担当者**: AI Agent（自動化ワークフロー）

### 4.3 ポリシー制約

- **後方互換性の維持**: 既存のCLIオプション、環境変数、metadata.json のスキーマを変更しない
- **コーディング規約**: 既存のコーディングスタイルを維持（ESLint設定を変更しない）
- **Git履歴の保持**: リファクタリングコミットは明確なメッセージで識別可能にする

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 20以上がインストールされていること
- npm 10以上がインストールされていること
- Git 2.x以上がインストールされていること

### 5.2 依存コンポーネント

- **Codex CLI**: `codex` コマンドが利用可能（オプション）
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` v0.1.14
- **GitHub API**: Octokit REST API v20.1.0
- **Simple Git**: `simple-git` v3.27.0

### 5.3 外部システム連携

- **GitHub**: API v3 (REST API) への接続が可能であること
- **OpenAI API**: gpt-5-codex モデルへのアクセス（オプション）
- **Claude API**: Claude Agent SDK経由でのアクセス（オプション）

---

## 6. 受け入れ基準

### 6.1 ファイルサイズ削減

**Given**: 1000行を超える大規模ファイルが存在する
**When**: リファクタリングを実施する
**Then**: 以下の削減率を達成する

- main.ts: 1309行 → 200行以下（削減率: 84%以上）
- base-phase.ts: 1419行 → 300行以下（削減率: 79%以上）
- github-client.ts: 702行 → 各200行以下のファイルに分割
- git-manager.ts: 843行 → 各200行以下のファイルに分割

### 6.2 後方互換性維持

**Given**: 既存の18ファイルのテストが存在する
**When**: リファクタリングを実施する
**Then**: すべてのテストが合格する

- ユニットテスト（11ファイル）がすべて合格
- 統合テスト（7ファイル）がすべて合格
- CLIオプション、環境変数、metadata.json のスキーマに変更なし

### 6.3 テストカバレッジ維持

**Given**: リファクタリング前のテストカバレッジが存在する
**When**: リファクタリングを実施する
**Then**: テストカバレッジが80%以上を維持する

- `npm run test:coverage` で確認
- 新規クラスに対するテストも含めて80%以上

### 6.4 ビルド成果物の維持

**Given**: `npm run build` が成功する環境が存在する
**When**: リファクタリングを実施する
**Then**: dist/ ディレクトリの構造が変わらない

- dist/prompts/ にプロンプトがコピーされる
- dist/templates/ にテンプレートがコピーされる
- dist/index.js が実行可能である

### 6.5 既存ワークフローの動作保証

**Given**: 既存のワークフロー（Issue #2, #10, #16, #396）が存在する
**When**: リファクタリングを実施する
**Then**: すべてのワークフローが影響を受けない

- マルチリポジトリ対応のテスト（`multi-repo-workflow.test.ts`）が合格
- ステップ単位のコミット＆レジュームのテスト（`step-commit-push.test.ts`, `step-resume.test.ts`）が合格
- ワークフロークリーンアップのテスト（`workflow-init-cleanup.test.ts`）が合格
- カスタムブランチ対応のテスト（`custom-branch-workflow.test.ts`）が合格

---

## 7. スコープ外

本リファクタリングでは、以下の項目は明確にスコープ外とします：

### 7.1 機能追加

- 新しいフェーズの追加
- 新しいCLIコマンドの追加
- 新しいエージェント（Codex/Claude以外）のサポート

### 7.2 依存ライブラリの更新

- TypeScriptのバージョンアップ
- Node.jsのバージョンアップ
- 依存ライブラリのメジャーバージョンアップ

### 7.3 アーキテクチャ変更

- `simple-git` から他のGitライブラリへの移行
- `@octokit/rest` から他のGitHub APIクライアントへの移行
- プロンプト管理方式の変更

### 7.4 パフォーマンス最適化

- Agent実行速度の最適化
- メモリ使用量の最適化
- ファイルI/Oの最適化

### 7.5 将来的な拡張候補

以下は本リファクタリングのスコープ外ですが、将来的な拡張候補として記録します：

- **content-parser.ts のリファクタリング**: 359行（現時点では優先度が低い）
- **report.ts のリファクタリング**: 350行（Phase固有ファイル、base-phase.ts リファクタリング後に検討）
- **evaluation.ts のリファクタリング**: 344行（Phase固有ファイル、base-phase.ts リファクタリング後に検討）
- **phase-dependencies.ts のリファクタリング**: 336行（依存関係管理の中核、慎重な検討が必要）

---

## 8. リスクと軽減策

### Risk-1: 後方互換性の破壊

**影響度**: 高
**確率**: 中
**軽減策**:
1. ファサードパターンの採用（既存インターフェースを維持）
2. 既存テストの全実行（18ファイル）
3. 段階的デプロイ（1ファイルずつリファクタリング）

### Risk-2: テストカバレッジの低下

**影響度**: 中
**確率**: 中
**軽減策**:
1. カバレッジ目標設定（80%以上を維持）
2. 新規クラスへのテスト追加
3. 統合テストの維持

### Risk-3: 段階的移行の失敗

**影響度**: 高
**確率**: 中
**軽減策**:
1. 依存関係の事前分析（Task 1-1）
2. ファサードパターンの活用
3. ビルド成果物の確認（各段階で `npm run build` 実行）

### Risk-4: 工数超過

**影響度**: 中
**確率**: 高
**軽減策**:
1. 見積もりバッファ（40~60時間）
2. 優先順位の明確化（Phase 1-2 を最優先）
3. スコープ調整（Phase 3-4 は必要に応じて先送り）

### Risk-5: 既存ワークフローへの影響

**影響度**: 高
**確率**: 低
**軽減策**:
1. 既存Issue（#2, #10, #16, #396）の動作確認
2. マルチリポジトリ対応のテスト実行
3. ステップ単位のコミット＆レジュームのテスト実行

---

## 9. 依存関係

### 9.1 前提となる要件

なし（既存機能の保持が前提）

### 9.2 後続タスクとの依存関係

- **Design Phase**: 本要件定義書に基づいて新しいファイル構造とクラス図を作成
- **Test Scenario Phase**: 本要件定義書に基づいてテストシナリオを作成
- **Implementation Phase**: Design Phaseの成果物に基づいて実装を実施

### 9.3 外部システムとの依存関係

- **GitHub API**: Issue情報取得、PR作成、コメント投稿（既存機能の維持）
- **Git**: ブランチ操作、コミット、プッシュ（既存機能の維持）
- **Codex/Claude API**: エージェント実行（既存機能の維持）

---

## 10. 参考情報

### 10.1 プロジェクト関連ドキュメント

- **CLAUDE.md**: プロジェクト概要、ビルド方法、CLI使用方法、フェーズ概要
- **ARCHITECTURE.md**: モジュール構成、全体フロー、BasePhaseライフサイクル、エージェント選択
- **README.md**: クイックスタート、CLIオプション、フェーズ概要、開発フロー
- **Planning Document**: 開発計画、タスク分割、リスク評価、品質ゲート

### 10.2 関連Issue

- **Issue #2**: ワークフローログクリーンアップ（Report Phase完了後）
- **Issue #10**: ステップ単位のコミット＆レジューム
- **Issue #16**: Git Manager Issue（コミット機能）
- **Issue #396**: マルチリポジトリ対応

### 10.3 既存テストファイル

**ユニットテスト（11ファイル）**:
- `step-management.test.ts`
- `secret-masker.test.ts`
- `repository-resolution.test.ts`
- `report-cleanup.test.ts`
- `phase-dependencies.test.ts`
- `main-preset-resolution.test.ts`
- `git-manager-issue16.test.ts`
- `content-parser-evaluation.test.ts`
- `cleanup-workflow-artifacts.test.ts`
- `branch-validation.test.ts`
- `base-phase-optional-context.test.ts`

**統合テスト（7ファイル）**:
- `workflow-init-cleanup.test.ts`
- `step-resume.test.ts`
- `step-commit-push.test.ts`
- `preset-execution.test.ts`
- `multi-repo-workflow.test.ts`
- `evaluation-phase-file-save.test.ts`
- `evaluation-phase-cleanup.test.ts`
- `custom-branch-workflow.test.ts`

---

## 11. 補足事項

### 11.1 リファクタリングの原則

本リファクタリングでは、以下の原則を厳守します：

1. **後方互換性の維持**: 既存の動作を壊さない
2. **段階的リファクタリング**: 1ファイルずつ対応（Phase 1 → Phase 2 → Phase 3 → Phase 4）
3. **テストカバレッジの維持**: リファクタリング前後で動作確認
4. **既存機能の保持**: 機能削除は行わない
5. **SOLID原則の遵守**: 特に単一責任の原則（Single Responsibility Principle）

### 11.2 成功基準（Planning Documentより）

以下の基準をすべて満たした場合に成功とみなします：

1. **ファイルサイズ削減**: 上記6.1参照
2. **後方互換性維持**: 上記6.2参照
3. **テストカバレッジ維持**: 上記6.3参照
4. **ビルド成果物の維持**: 上記6.4参照
5. **ドキュメント更新**: ARCHITECTURE.md, CLAUDE.md の更新

### 11.3 次のステップ

本要件定義書（Phase 1）完了後、以下を実施してください：

1. **Design Phase（Phase 2）**: 新しいファイル構造とクラス図を作成
2. **Test Scenario Phase（Phase 3）**: テストシナリオを作成
3. **Implementation Phase（Phase 4）**: 優先順位に従って実装（Phase 4-1, 4-2 を最優先）

---

**要件定義書承認日**: 2025-01-20
**次回レビュー日**: Design Phase完了後
**承認者**: AI Workflow Agent (Phase 1: Requirements)
