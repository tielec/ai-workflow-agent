# 要件定義書 - Issue #194

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-194/00_planning/output/planning.md`）を確認し、以下の開発方針を把握しました：

### 実装戦略
- **EXTEND戦略**: 既存機能への追加（機能拡張）が中心
- 既存コードの拡張が中心（InitCommand、ExecuteCommand、MetadataManager、EvaluationPhase）
- 新規クラスは1つのみ（SquashManager）で、既存のGitManager階層に統合

### テスト戦略
- **UNIT_INTEGRATION**: ロジックの正確性（ユニット）+ Git/エージェント統合（インテグレーション）の両方
- SquashManagerの単体テスト、Git操作の統合テスト、エージェント統合テストを実施

### 見積もり工数
- **合計**: 12~18時間
- Phase 1（要件定義）: 1~2時間
- Phase 2（設計）: 2~3時間
- Phase 3（テストシナリオ）: 1~2時間
- Phase 4（実装）: 5~7時間
- Phase 5（テストコード実装）: 2~3時間
- Phase 6（テスト実行）: 0.5~1時間
- Phase 7（ドキュメント）: 0.5~1時間
- Phase 8（レポート）: 0.5~1時間

### 主要リスク
1. フォースプッシュによるコミット喪失（影響度: 高、確率: 中）
2. エージェント生成メッセージの品質（影響度: 中、確率: 低）
3. 後方互換性（影響度: 中、確率: 低）

これらの方針を踏まえて、以下の要件定義を実施します。

---

## 1. 概要

### 背景
現在、AI Workflow の実行中は各フェーズ（initialize → planning → ... → evaluation → cleanup）ごとにコミットが作成されます。これにより：

1. **PRのコミット履歴が冗長**: 10+ のコミットが含まれ、レビューが煩雑
2. **意味のある単位でない**: 各フェーズのコミットは中間状態であり、最終的な変更のみが重要
3. **コミットメッセージが機械的**: `[ai-workflow] Phase X completed` のような定型メッセージ

### 目的
Evaluation Phase 完了後のクリーンアップが終わった時点で、ワークフロー中に作成された一連のコミットをスカッシュして1つにまとめ、エージェント生成のコミットメッセージでフォースプッシュする機能を追加します。

### ビジネス価値
- **レビュー効率の向上**: PRのコミット履歴がクリーンになり、レビュアーが最終的な変更に集中できる
- **コミット履歴の意味性向上**: 機械的なコミットメッセージではなく、Issueの目的を反映した意味のあるコミットメッセージ
- **開発者体験の向上**: PRマージ後のmain/masterブランチのコミット履歴が整理される

### 技術的価値
- **エージェント活用の拡張**: コミットメッセージ生成にもエージェントを活用し、AI Workflow のエージェント統合を強化
- **Git操作の高度化**: スカッシュ、フォースプッシュ、ブランチ保護チェックなど、Git操作の自動化を拡張
- **メタデータ管理の強化**: ワークフロー全体を通じたコミット履歴の記録と管理

---

## 2. 機能要件

### FR-1: ワークフロー開始時点のコミット記録（優先度: 高）
**説明**: `init` コマンド実行時に、ワークフロー開始時点のコミットハッシュ（`base_commit`）を `metadata.json` に記録します。

**受け入れ基準**:
- **Given**: ユーザーが `node dist/index.js init --issue-url <URL>` を実行
- **When**: InitCommand が正常に完了
- **Then**: `metadata.json` に `base_commit` フィールドが追加され、現在のコミットハッシュが記録される

**詳細仕様**:
- `base_commit` は `git rev-parse HEAD` で取得
- `metadata.json` のトップレベルに `base_commit: string` フィールドを追加
- Git操作に失敗した場合はエラーログを出力し、ワークフロー初期化を中断

### FR-2: スカッシュ対象コミットの特定（優先度: 高）
**説明**: ワークフロー開始時点（`base_commit`）から現在のHEADまでのコミットをスカッシュ対象として特定します。

**受け入れ基準**:
- **Given**: `metadata.json` に `base_commit` が記録されている
- **When**: スカッシュ処理が実行される
- **Then**: `base_commit` から HEAD までのコミットリストが取得される

**詳細仕様**:
- `git log <base_commit>..HEAD --oneline` でコミットリストを取得
- コミットが1つ以下の場合はスカッシュをスキップ（ログに INFO レベルで記録）
- `base_commit` が存在しない、または無効な場合はスカッシュをスキップ（ログに WARNING レベルで記録）

### FR-3: エージェント生成コミットメッセージ（優先度: 高）
**説明**: エージェント（Codex/Claude）を使用して、Issueの内容と変更の差分からコミットメッセージを生成します。

**受け入れ基準**:
- **Given**: Issue情報と変更差分が利用可能
- **When**: エージェントがコミットメッセージ生成プロンプトを実行
- **Then**: Conventional Commits 形式のコミットメッセージが生成される

**詳細仕様**:
- 入力情報:
  - Issue タイトル（`metadata.json` から取得）
  - Issue 本文（`metadata.json` から取得）
  - 変更ファイル一覧（`git diff --stat <base_commit>..HEAD`）
  - 変更の概要（`git diff --shortstat <base_commit>..HEAD`）
- 出力形式（Conventional Commits）:
  ```
  <type>(<scope>): <subject>

  <body>

  Fixes #<issue_number>
  ```
- 生成されたメッセージは検証され、最低限以下を含む必要がある:
  - `<type>`: feat, fix, docs, style, refactor, test, chore のいずれか
  - `<subject>`: 50文字以内、命令形、先頭小文字、末尾にピリオドなし
  - `Fixes #<issue_number>`: Issue番号の参照

### FR-4: コミットのスカッシュとフォースプッシュ（優先度: 高）
**説明**: 特定されたコミットをスカッシュし、エージェント生成のコミットメッセージでコミット後、リモートにフォースプッシュします。

**受け入れ基準**:
- **Given**: スカッシュ対象コミットが特定され、コミットメッセージが生成されている
- **When**: スカッシュ処理が実行される
- **Then**: コミットが1つにまとめられ、リモートにプッシュされる

**詳細仕様**:
- スカッシュ前にコミットハッシュのリストを `metadata.json` の `pre_squash_commits` フィールドに記録
- `git reset --soft <base_commit>` でスカッシュ
- エージェント生成のコミットメッセージでコミット（`git commit -m "<message>"`）
- `git push --force-with-lease` でプッシュ（他の変更を上書きしないように安全なフォースプッシュ）
- スカッシュ成功時は `metadata.json` の `squashed_at` タイムスタンプを記録

### FR-5: ブランチ保護チェック（優先度: 高）
**説明**: main/master ブランチへのフォースプッシュを禁止し、スカッシュ実行前にブランチ名をチェックします。

**受け入れ基準**:
- **Given**: 現在のブランチが main または master
- **When**: スカッシュ処理が実行される
- **Then**: エラーメッセージを表示し、スカッシュを中断する

**詳細仕様**:
- `git branch --show-current` で現在のブランチ名を取得
- ブランチ名が `main` または `master` の場合はエラーをスロー
- エラーメッセージ: `Cannot squash commits on protected branch: <branch_name>. Squashing is only allowed on feature branches.`

### FR-6: CLIオプション（優先度: 中）
**説明**: `execute` コマンドに `--squash-on-complete` および `--no-squash-on-complete` オプションを追加します。

**受け入れ基準**:
- **Given**: ユーザーが `node dist/index.js execute --issue <NUM> --phase all --squash-on-complete` を実行
- **When**: Evaluation Phase が完了
- **Then**: スカッシュ処理が自動的に実行される

**詳細仕様**:
- `--squash-on-complete`: スカッシュを有効化（デフォルト: 無効）
- `--no-squash-on-complete`: スカッシュを無効化（明示的に）
- CLI オプションは環境変数 `AI_WORKFLOW_SQUASH_ON_COMPLETE` より優先される
- `ExecuteCommandOptions` インターフェースに `squashOnComplete?: boolean` フィールドを追加

### FR-7: 環境変数サポート（優先度: 中）
**説明**: 環境変数 `AI_WORKFLOW_SQUASH_ON_COMPLETE` でスカッシュ機能を制御します。

**受け入れ基準**:
- **Given**: 環境変数 `AI_WORKFLOW_SQUASH_ON_COMPLETE=true` が設定されている
- **When**: Evaluation Phase が完了
- **Then**: スカッシュ処理が自動的に実行される

**詳細仕様**:
- 環境変数の値: `true` | `false`（大文字小文字を区別しない）
- デフォルト: `false`（無効）
- `config.ts` の Config クラスに `getSquashOnComplete()` メソッドを追加

### FR-8: 後方互換性の確保（優先度: 高）
**説明**: 既存のワークフロー（`base_commit` が記録されていない）でもエラーにならず、スカッシュをスキップします。

**受け入れ基準**:
- **Given**: 既存のワークフロー（`base_commit` フィールドが存在しない）
- **When**: スカッシュ処理が実行される
- **Then**: スカッシュをスキップし、WARNING ログのみ表示

**詳細仕様**:
- `metadata.json` に `base_commit` フィールドが存在しない場合:
  - ログに WARNING レベルで `base_commit not found in metadata. Skipping squash.` を出力
  - スカッシュ処理を中断し、ワークフロー全体は継続
- マイグレーション不要（新規ワークフローのみで `base_commit` を記録）

---

## 3. 非機能要件

### NFR-1: パフォーマンス（優先度: 中）
- **NFR-1.1**: スカッシュ処理全体（コミットメッセージ生成、スカッシュ、プッシュ）は 30秒以内に完了する
- **NFR-1.2**: エージェントによるコミットメッセージ生成は 10秒以内に完了する
- **NFR-1.3**: Git操作（reset、commit、push）は 20秒以内に完了する

### NFR-2: セキュリティ（優先度: 高）
- **NFR-2.1**: `--force-with-lease` を使用し、他の開発者のプッシュを検出して上書きを防ぐ
- **NFR-2.2**: main/master ブランチへのフォースプッシュを明示的に禁止する
- **NFR-2.3**: スカッシュ前のコミットハッシュを `metadata.json` に記録し、ロールバック可能にする
- **NFR-2.4**: エージェント生成のコミットメッセージに機密情報（APIキー、パスワード等）が含まれないように検証する

### NFR-3: 可用性・信頼性（優先度: 高）
- **NFR-3.1**: スカッシュ失敗時もワークフロー全体は継続する（WARNING ログのみ）
- **NFR-3.2**: エージェントによるコミットメッセージ生成失敗時は、テンプレートベースのフォールバックメッセージを使用する
- **NFR-3.3**: フォースプッシュ失敗時は、既存の RemoteManager のリトライロジックを活用する
- **NFR-3.4**: スカッシュ処理のエラーハンドリングは、既存の Git操作と同じパターンを踏襲する

### NFR-4: 保守性・拡張性（優先度: 中）
- **NFR-4.1**: SquashManager クラスは単一責任原則（SRP）に従い、Git操作とエージェント連携のみを担当する
- **NFR-4.2**: ファサードパターンにより、GitManager に `squashCommits()` メソッドを追加し、後方互換性を維持する
- **NFR-4.3**: プロンプトテンプレート（`generate-message.txt`）は、他のフェーズと同様に `src/prompts/squash/` に配置する
- **NFR-4.4**: SquashManager のユニットテストとインテグレーションテストを実装し、テストカバレッジ 80% 以上を確保する

---

## 4. 制約事項

### 技術的制約
- **CON-1**: 既存の GitManager 階層（BranchManager、CommitManager、RemoteManager）に統合し、一貫性を保つ
- **CON-2**: 既存のエージェント統合パターン（`BasePhase.executeWithAgent()`）を再利用する
- **CON-3**: Git操作は `simple-git` ライブラリを使用し、既存のパターンを踏襲する
- **CON-4**: メタデータスキーマ（`metadata.json`）の拡張は後方互換性を維持する

### リソース制約
- **CON-5**: 実装工数は 5~7時間を超えない
- **CON-6**: テストコード実装は 2~3時間を超えない
- **CON-7**: ドキュメント更新は 0.5~1時間を超えない

### ポリシー制約
- **CON-8**: エージェント生成のコミットメッセージは Conventional Commits 形式に従う
- **CON-9**: フォースプッシュは `--force-with-lease` のみを使用し、`--force` は禁止
- **CON-10**: スカッシュ機能はオプトイン方式（デフォルト無効）とし、既存ワークフローに影響を与えない

---

## 5. 前提条件

### システム環境
- **PRE-1**: Node.js 20以上
- **PRE-2**: Git 2.30以上（`--force-with-lease` サポート）
- **PRE-3**: TypeScript 5.x
- **PRE-4**: simple-git 3.x

### 依存コンポーネント
- **PRE-5**: GitManager（BranchManager、CommitManager、RemoteManager）
- **PRE-6**: MetadataManager（メタデータ CRUD 操作）
- **PRE-7**: CodexAgentClient / ClaudeAgentClient（エージェント実行）
- **PRE-8**: EvaluationPhase（スカッシュ処理の呼び出し元）

### 外部システム連携
- **PRE-9**: GitHub API（Issue情報の取得、PRコメント投稿）
- **PRE-10**: OpenAI API（Codexエージェント）
- **PRE-11**: Anthropic API（Claudeエージェント）

---

## 6. 受け入れ基準

### AC-1: ワークフロー開始時点のコミット記録
- **Given**: ユーザーが `node dist/index.js init --issue-url https://github.com/owner/repo/issues/194` を実行
- **When**: InitCommand が正常に完了
- **Then**:
  - `metadata.json` に `base_commit` フィールドが追加される
  - `base_commit` の値は現在のコミットハッシュ（40文字の16進数）
  - Git操作に失敗した場合はエラーログが出力され、ワークフロー初期化が中断される

### AC-2: スカッシュ対象コミットの特定
- **Given**: `metadata.json` に `base_commit: "abc123def456..."` が記録されている
- **When**: スカッシュ処理が実行される
- **Then**:
  - `git log abc123def456...HEAD --oneline` でコミットリストが取得される
  - コミットが2つ以上存在する場合はスカッシュ処理が継続される
  - コミットが1つ以下の場合はスカッシュがスキップされる

### AC-3: エージェント生成コミットメッセージ
- **Given**: Issue #194 のタイトルが "feat: Squash commits after workflow completion"
- **When**: エージェントがコミットメッセージ生成プロンプトを実行
- **Then**:
  - 生成されたメッセージは Conventional Commits 形式（`<type>(<scope>): <subject>`）
  - `<type>` は `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` のいずれか
  - `<subject>` は 50文字以内
  - メッセージの最後に `Fixes #194` が含まれる

### AC-4: コミットのスカッシュとフォースプッシュ
- **Given**: スカッシュ対象コミットが5つ、エージェント生成のコミットメッセージが利用可能
- **When**: スカッシュ処理が実行される
- **Then**:
  - `metadata.json` の `pre_squash_commits` に5つのコミットハッシュが記録される
  - `git reset --soft <base_commit>` でコミットがスカッシュされる
  - エージェント生成のコミットメッセージでコミットが作成される
  - `git push --force-with-lease` でリモートにプッシュされる
  - `metadata.json` の `squashed_at` にタイムスタンプが記録される

### AC-5: ブランチ保護チェック
- **Given**: 現在のブランチが `main`
- **When**: スカッシュ処理が実行される
- **Then**:
  - エラーメッセージ `Cannot squash commits on protected branch: main` が表示される
  - スカッシュ処理が中断される
  - ワークフロー全体は継続される（Evaluation Phase は完了とマークされる）

### AC-6: CLIオプション
- **Given**: ユーザーが `node dist/index.js execute --issue 194 --phase all --squash-on-complete` を実行
- **When**: Evaluation Phase が完了
- **Then**:
  - スカッシュ処理が自動的に実行される
  - コミットが1つにまとめられる
  - リモートにフォースプッシュされる

### AC-7: 環境変数サポート
- **Given**: 環境変数 `AI_WORKFLOW_SQUASH_ON_COMPLETE=true` が設定されている
- **When**: `node dist/index.js execute --issue 194 --phase all` を実行
- **Then**:
  - Evaluation Phase 完了後にスカッシュ処理が自動的に実行される
  - `--squash-on-complete` オプションが指定されていなくてもスカッシュされる

### AC-8: 後方互換性の確保
- **Given**: 既存のワークフロー（`base_commit` フィールドが存在しない）
- **When**: スカッシュ処理が実行される
- **Then**:
  - WARNING ログ `base_commit not found in metadata. Skipping squash.` が出力される
  - スカッシュ処理がスキップされる
  - ワークフロー全体は正常に完了する

### AC-9: スカッシュ失敗時のエラーハンドリング
- **Given**: フォースプッシュがネットワークエラーで失敗
- **When**: スカッシュ処理が実行される
- **Then**:
  - WARNING ログにエラー詳細が出力される
  - RemoteManager のリトライロジックが最大3回まで再試行される
  - リトライも失敗した場合はスカッシュ処理を中断
  - ワークフロー全体は継続される（Evaluation Phase は完了とマークされる）

### AC-10: エージェント失敗時のフォールバック
- **Given**: エージェントによるコミットメッセージ生成が失敗
- **When**: スカッシュ処理が実行される
- **Then**:
  - テンプレートベースのフォールバックメッセージが使用される
  - フォールバックメッセージ: `feat: Complete workflow for Issue #<NUM>\n\nFixes #<NUM>`
  - スカッシュ処理が継続される

---

## 7. スコープ外

以下の事項は本 Issue のスコープ外とし、将来的な拡張候補として記録します：

### 将来拡張候補
1. **ドライランモード**: `--squash-dry-run` オプションでスカッシュ内容を事前確認
2. **カスタムメッセージ**: `--squash-message` オプションでメッセージを手動指定
3. **対話的モード**: スカッシュ前に確認プロンプトを表示
4. **リベースサポート**: スカッシュ以外のGit履歴整形オプション（rebase、fixup等）
5. **スカッシュのロールバック**: `pre_squash_commits` からの自動ロールバックコマンド

### 明確にスコープ外とする事項
1. **複数Issue対応**: 複数のIssueをまとめてスカッシュする機能
2. **部分的なスカッシュ**: 特定のフェーズのコミットのみをスカッシュする機能
3. **コミットメッセージの手動編集**: エージェント生成後のメッセージをエディタで編集する機能
4. **GitHub Squash and Merge統合**: GitHub のSquash and Merge機能との統合

---

## 8. リスク管理（Planning Documentから）

Planning Document で特定された主要リスクとその軽減策を確認しました：

### リスク1: フォースプッシュによるコミット喪失（影響度: 高、確率: 中）
**軽減策**:
- `--force-with-lease` の使用（`--force` は禁止）
- `pre_squash_commits` の記録（ロールバック用）
- ブランチ保護チェック（main/master 検出）
- エラーハンドリング（フォースプッシュ失敗時は元のコミット履歴を維持）

### リスク2: エージェント生成メッセージの品質（影響度: 中、確率: 低）
**軽減策**:
- プロンプト最適化（Conventional Commits 形式を強制）
- バリデーション（生成されたメッセージのフォーマット検証）
- フォールバック（エージェント失敗時はテンプレートベースのメッセージを使用）
- レビュー可能性（生成されたメッセージを事前にログ出力）

### リスク3: 後方互換性（影響度: 中、確率: 低）
**軽減策**:
- オプトイン方式（デフォルトは無効）
- `base_commit` 未記録時のスキップ（既存ワークフローでエラーにならない）
- 後方互換性テスト（既存ワークフローでの動作確認）
- 段階的ロールアウト（少数のIssueで先行検証後、全体に適用）

---

## 9. 補足情報

### 影響を受けるファイル（Planning Documentから）

**変更が必要なファイル（7ファイル）**:
1. `src/commands/init.ts`: `base_commit` の記録機能追加
2. `src/commands/execute.ts`: `--squash-on-complete` オプション追加
3. `src/core/metadata-manager.ts`: `base_commit`, `pre_squash_commits` フィールド追加
4. `src/core/git-manager.ts`: SquashManager統合（ファサードパターン）
5. `src/phases/evaluation.ts`: スカッシュ処理の呼び出し追加
6. `src/types/workflow-state.ts`: WorkflowStateインターフェース拡張
7. `src/types/commands.ts`: ExecuteCommandOptionsに`squashOnComplete`追加

**新規作成ファイル（2ファイル）**:
1. `src/core/git/squash-manager.ts`: スカッシュ処理の専門マネージャー
2. `src/prompts/squash/generate-message.txt`: コミットメッセージ生成用プロンプト

### 依存関係
- `src/core/git/commit-manager.ts`: Git設定管理（`ensureGitConfig`）を再利用
- `src/core/git/remote-manager.ts`: フォースプッシュとリトライロジックを再利用
- `src/phases/cleanup/artifact-cleaner.ts`: クリーンアップ後にスカッシュを実行

---

## 10. 品質ゲート確認

本要件定義書は、以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR-1 〜 FR-8 で8つの機能要件を定義
- ✅ **受け入れ基準が定義されている**: AC-1 〜 AC-10 で10個の受け入れ基準を Given-When-Then 形式で記述
- ✅ **スコープが明確である**: セクション7で将来拡張候補とスコープ外事項を明記
- ✅ **論理的な矛盾がない**: Planning Document の方針と整合性を確保し、各セクション間で矛盾なし

---

**ドキュメント作成日**: 2025-01-30
**Issue番号**: #194
**作成者**: AI Workflow Agent (Requirements Phase)
