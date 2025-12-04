# 要件定義書 - Issue #212

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 開発計画の全体像
- **実装戦略**: EXTEND（既存ロジックの抽出・再利用 + 新規コマンド追加）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + インテグレーションテスト）
- **テストコード戦略**: CREATE_TEST（新規テストファイル作成）
- **見積もり工数**: 11~19時間（推奨: 2~3日間）
- **リスク評価**: 低（既存ロジック再利用により新規実装が少ない）

### 主要な設計決定
1. `BasePhase.cleanupWorkflowLogs()`のロジックを抽出し、独立した関数として再利用可能にする
2. `src/commands/cleanup.ts`を新規作成し、CLI引数解析とバリデーション実装
3. `src/main.ts`に`cleanup`コマンドを登録
4. 既存のReport Phase（Phase 8）の自動クリーンアップ処理は維持

### スコープ確認
- **対象範囲**: 新規CLIコマンド追加、既存ロジック再利用、テスト実装、ドキュメント更新
- **除外範囲**: Report Phaseの既存自動クリーンアップ処理の変更（互換性維持）

以下、Planning Documentの戦略に基づいて要件定義を実施します。

---

## 1. 概要

### 1.1 背景

現在、AI Workflow Agentでは Report Phase（Phase 8）完了後に、ワークフローログ（`execute/`、`review/`、`revise/`ディレクトリ）を自動的に削除する`cleanupWorkflowLogs()`メソッドが実装されています。この処理により、リポジトリサイズを約75%削減し、PRレビューを成果物に集中させることができます。

しかし、現状では以下の課題があります：
- **手動クリーンアップ不可**: Report Phase完了まで待つ必要がある
- **部分クリーンアップ不可**: 特定フェーズのみクリーンアップできない
- **デバッグ困難**: ドライランで削除対象を事前確認できない
- **Jenkinsfile分割対応**: Issue #211で計画されているJenkinsfile分割後、独立したステップとして実行したい

### 1.2 目的

ワークフローログクリーンアップを独立したCLIコマンドとして実装し、以下を実現します：
1. **柔軟性**: 任意のタイミングでクリーンアップを実行可能にする
2. **デバッグ性**: ドライランで削除対象を事前確認できるようにする
3. **部分クリーンアップ**: 特定フェーズのみを対象にできるようにする
4. **Jenkins統合**: Jenkinsfileの独立したステップとして実行可能にする

### 1.3 ビジネス価値・技術的価値

**ビジネス価値**:
- **運用効率向上**: デバッグ時や開発中に不要なログを削除し、ストレージコストを削減
- **開発者体験向上**: PRレビュー前に手動でクリーンアップし、レビュー効率を向上

**技術的価値**:
- **保守性向上**: 既存ロジックを再利用し、コードの重複を削減
- **拡張性向上**: 新しいクリーンアップモード（部分/完全）を追加可能
- **テスト容易性**: 独立したコマンドとして単体テストが容易

---

## 2. 機能要件

### FR-1: 基本的なクリーンアップコマンド（優先度: 高）

**説明**: Issue番号を指定して、通常のワークフローログクリーンアップを実行できる。

**コマンド例**:
```bash
node dist/index.js cleanup --issue <NUM>
```

**動作**:
1. `.ai-workflow/issue-<NUM>/metadata.json`を読み込み、ワークフローの存在を確認
2. フェーズ 00_planning 〜 08_report の `execute/`、`review/`、`revise/` ディレクトリを削除
3. `metadata.json`、`output/*.md`（Planning Phaseの `output/planning.md` を含む）は保持
4. 削除後、Gitコミット＆プッシュ（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs (manual cleanup)`）

**受け入れ基準**:
- **Given**: Issue #123のワークフローが存在する
- **When**: `cleanup --issue 123`を実行
- **Then**: フェーズ 00-08 のデバッグログが削除され、成果物（`metadata.json`、`output/*.md`）は保持される

### FR-2: ドライランモード（優先度: 高）

**説明**: 削除せず、削除対象ファイルのみを表示する。

**コマンド例**:
```bash
node dist/index.js cleanup --issue <NUM> --dry-run
```

**動作**:
1. 削除対象ファイルをスキャン
2. 削除対象ファイルのリストをコンソールに表示（ファイルパス、サイズ）
3. 実際の削除は行わない
4. Gitコミットも行わない

**受け入れ基準**:
- **Given**: Issue #123のワークフローが存在する
- **When**: `cleanup --issue 123 --dry-run`を実行
- **Then**: 削除対象ファイルがコンソールに表示され、実際のファイル削除は行われない

### FR-3: 部分クリーンアップ（優先度: 中）

**説明**: 特定フェーズのみを対象にクリーンアップを実行できる。

**コマンド例**:
```bash
# フェーズ範囲指定（Phase 0-4のみ）
node dist/index.js cleanup --issue <NUM> --phases 0-4

# フェーズ名指定（planning, requirements のみ）
node dist/index.js cleanup --issue <NUM> --phases planning,requirements
```

**動作**:
1. `--phases` オプションで指定されたフェーズのみを対象にする
2. フェーズ範囲（例: `0-4`）またはフェーズ名リスト（例: `planning,requirements`）を受け付ける
3. 指定されたフェーズの `execute/`、`review/`、`revise/` ディレクトリのみを削除

**受け入れ基準**:
- **Given**: Issue #123のワークフローが存在する
- **When**: `cleanup --issue 123 --phases 0-4`を実行
- **Then**: Phase 0-4 のデバッグログのみが削除され、Phase 5-9 は保持される

### FR-4: 完全クリーンアップ（優先度: 中）

**説明**: Evaluation Phase完了後、`.ai-workflow/issue-<NUM>/`ディレクトリ全体を削除できる。

**コマンド例**:
```bash
node dist/index.js cleanup --issue <NUM> --all
```

**動作**:
1. `metadata.json`の`phases.evaluation.status`が`completed`であることを確認
2. 確認プロンプトを表示（CI環境では自動スキップ）
3. `.ai-workflow/issue-<NUM>/`ディレクトリ全体を削除
4. Gitコミット＆プッシュ（コミットメッセージ: `[ai-workflow] Clean up all workflow artifacts`）

**前提条件**:
- Evaluation Phase（Phase 9）が完了していること（`metadata.json`の`phases.evaluation.status`が`completed`）

**受け入れ基準**:
- **Given**: Issue #123のEvaluation Phaseが完了している
- **When**: `cleanup --issue 123 --all`を実行し、確認プロンプトで承認
- **Then**: `.ai-workflow/issue-123/`ディレクトリ全体が削除され、Gitコミット＆プッシュされる

### FR-5: バリデーションとエラーハンドリング（優先度: 高）

**説明**: CLI引数のバリデーションと適切なエラーメッセージを提供する。

**バリデーション項目**:
1. **Issue番号チェック**: `--issue`オプションが必須であることを確認
2. **ワークフロー存在チェック**: `.ai-workflow/issue-<NUM>/metadata.json`が存在することを確認
3. **フェーズ範囲チェック**: `--phases`オプションの範囲が有効（0-9）であることを確認
4. **Evaluation完了チェック**: `--all`オプション使用時、Evaluation Phaseが完了していることを確認
5. **パストラバーサル防止**: パス検証（正規表現`\.ai-workflow[\/\\]issue-\d+$`）

**エラーメッセージ例**:
- `--issue`オプション未指定: `Error: --issue option is required`
- ワークフロー不存在: `Error: Workflow for issue #123 not found`
- `--phases`範囲不正: `Error: Invalid phase range: 10-12. Valid range is 0-9`
- `--all`使用時にEvaluation未完了: `Error: --all option requires Evaluation Phase to be completed`

**受け入れ基準**:
- **Given**: ワークフローが存在しない
- **When**: `cleanup --issue 999`を実行
- **Then**: `Error: Workflow for issue #999 not found`が表示され、終了コード1で終了する

### FR-6: Report Phase自動クリーンアップとの互換性（優先度: 高）

**説明**: 既存のReport Phase（Phase 8）自動クリーンアップ処理を維持する。

**動作**:
1. `BasePhase.cleanupWorkflowLogs()`のロジックを共通モジュール（`src/core/cleanup-manager.ts`）に抽出
2. Report Phaseから共通モジュールを呼び出す
3. 新規`cleanup`コマンドからも同じ共通モジュールを呼び出す

**受け入れ基準**:
- **Given**: Report Phaseを実行
- **When**: Report Phase完了時
- **Then**: 既存と同様にワークフローログが自動削除され、Gitコミット＆プッシュされる

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

- **削除速度**: 1000ファイル以下の削除を10秒以内に完了する
- **警告閾値**: 削除対象ファイル数が1000ファイルを超える場合、警告メッセージを表示する
- **非同期削除**: `fs.promises.rm()`を使用して非同期削除を実行する

### NFR-2: セキュリティ要件

- **パストラバーサル防止**: パス検証（正規表現`\.ai-workflow[\/\\]issue-\d+$`）により、意図しないディレクトリの削除を防止
- **シンボリックリンク防止**: `fs.lstatSync()`によるシンボリックリンクチェックを実施し、削除対象外とする
- **CLI引数サニタイズ**: CLI引数（Issue番号、フェーズ範囲）を正規表現でバリデーションし、インジェクション攻撃を防止

### NFR-3: 可用性・信頼性要件

- **エラーハンドリング**: クリーンアップ失敗時、適切なエラーメッセージを表示し、終了コード1で終了
- **部分失敗時の継続**: 一部のフェーズディレクトリ削除に失敗しても、他のフェーズは削除を継続し、WARNINGログを出力
- **ロールバック不要**: 削除は非破壊的ではないが、重要なファイル（`metadata.json`、`output/*.md`）は保護

### NFR-4: 保守性・拡張性要件

- **共通モジュール化**: クリーンアップロジックを`src/core/cleanup-manager.ts`に抽出し、再利用可能にする
- **テストカバレッジ**: ユニットテストカバレッジ90%以上を達成する
- **コード品質**: ESLintエラー0件、TypeScript型エラー0件を維持する

---

## 4. 制約事項

### 4.1 技術的制約

- **Node.js バージョン**: Node.js 20以上が必須
- **TypeScript**: TypeScript 5.xを使用し、厳格な型チェックを維持
- **既存アーキテクチャ**: `BasePhase`クラスおよび`MetadataManager`クラスの既存設計を維持
- **Git操作**: `GitManager`クラスを使用してGitコミット＆プッシュを実行

### 4.2 リソース制約

- **開発時間**: 11~19時間（2~3日間）
- **開発メンバー**: 1名（AIエージェント）

### 4.3 ポリシー制約

- **コーディング規約**: ESLintルール（`no-console`、`@typescript-eslint/no-explicit-any`等）を遵守
- **環境変数アクセス**: `process.env`への直接アクセスは禁止、`config.getXxx()`を使用
- **エラーハンドリング**: `as Error`型アサーションは禁止、`getErrorMessage()`を使用
- **ロギング**: `console.log`は禁止、`logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`を使用

---

## 5. 前提条件

### 5.1 システム環境

- **オペレーティングシステム**: Linux、macOS、Windows（WSL推奨）
- **Node.js**: 20.x以上
- **npm**: 10.x以上
- **Git**: 2.x以上

### 5.2 依存コンポーネント

- **commander.js**: CLI引数解析に使用
- **fs-extra**: ファイルシステム操作に使用（`fs.promises.rm()`のポリフィル）
- **simple-git**: Git操作に使用
- **@octokit/rest**: GitHub API操作に使用（オプション）

### 5.3 外部システム連携

- **Git リポジトリ**: ローカルGitリポジトリが初期化されていること
- **GitHub リモート**: リモートリポジトリ（GitHub）が設定されていること
- **ワークフローメタデータ**: `.ai-workflow/issue-<NUM>/metadata.json`が存在すること

---

## 6. 受け入れ基準

### AC-1: 基本的なクリーンアップコマンド

- **Given**: Issue #123のワークフローが存在する（Phase 0-8が完了）
- **When**: `node dist/index.js cleanup --issue 123`を実行
- **Then**:
  - フェーズ 00-08 の `execute/`、`review/`、`revise/` ディレクトリが削除される
  - `metadata.json`、`output/*.md`は保持される
  - Gitコミット＆プッシュが実行される（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs (manual cleanup)`）
  - 成功メッセージ（`Workflow logs cleaned up successfully`）が表示される

### AC-2: ドライランモード

- **Given**: Issue #123のワークフローが存在する
- **When**: `node dist/index.js cleanup --issue 123 --dry-run`を実行
- **Then**:
  - 削除対象ファイルのリストがコンソールに表示される
  - ファイルパス、サイズ、削除対象数が表示される
  - 実際のファイル削除は行われない
  - Gitコミットは行われない
  - ドライラン完了メッセージ（`Dry run completed. 120 files would be deleted (45.2 MB)`）が表示される

### AC-3: 部分クリーンアップ（フェーズ範囲指定）

- **Given**: Issue #123のワークフローが存在する
- **When**: `node dist/index.js cleanup --issue 123 --phases 0-4`を実行
- **Then**:
  - Phase 0-4 の `execute/`、`review/`、`revise/` ディレクトリのみが削除される
  - Phase 5-9 のディレクトリは保持される
  - Gitコミット＆プッシュが実行される
  - 成功メッセージに削除対象フェーズが表示される（`Cleaned up phases 0-4 successfully`）

### AC-4: 部分クリーンアップ（フェーズ名指定）

- **Given**: Issue #123のワークフローが存在する
- **When**: `node dist/index.js cleanup --issue 123 --phases planning,requirements`を実行
- **Then**:
  - Phase 0 (planning)、Phase 1 (requirements) のデバッグログのみが削除される
  - 他のフェーズは保持される
  - Gitコミット＆プッシュが実行される

### AC-5: 完全クリーンアップ（Evaluation完了後）

- **Given**: Issue #123のEvaluation Phase（Phase 9）が完了している
- **When**: `node dist/index.js cleanup --issue 123 --all`を実行し、確認プロンプトで「y」を入力
- **Then**:
  - 確認プロンプトが表示される（`This will delete all workflow artifacts for issue #123. Continue? (y/N):`）
  - `.ai-workflow/issue-123/`ディレクトリ全体が削除される
  - Gitコミット＆プッシュが実行される（コミットメッセージ: `[ai-workflow] Clean up all workflow artifacts`）

### AC-6: 完全クリーンアップ（Evaluation未完了時のエラー）

- **Given**: Issue #123のEvaluation Phase（Phase 9）が未完了
- **When**: `node dist/index.js cleanup --issue 123 --all`を実行
- **Then**:
  - エラーメッセージが表示される（`Error: --all option requires Evaluation Phase to be completed. Current status: in_progress`）
  - 終了コード1で終了する
  - ファイル削除は行われない

### AC-7: ワークフロー不存在時のエラー

- **Given**: Issue #999のワークフローが存在しない
- **When**: `node dist/index.js cleanup --issue 999`を実行
- **Then**:
  - エラーメッセージが表示される（`Error: Workflow for issue #999 not found`）
  - 終了コード1で終了する

### AC-8: 無効なフェーズ範囲のエラー

- **Given**: Issue #123のワークフローが存在する
- **When**: `node dist/index.js cleanup --issue 123 --phases 10-12`を実行
- **Then**:
  - エラーメッセージが表示される（`Error: Invalid phase range: 10-12. Valid range is 0-9`）
  - 終了コード1で終了する

### AC-9: Report Phase自動クリーンアップとの互換性

- **Given**: Report Phase（Phase 8）を実行
- **When**: Report Phase完了時
- **Then**:
  - 既存の自動クリーンアップが正常に動作する
  - フェーズ 00-08 のデバッグログが削除される
  - `metadata.json`、`output/*.md`は保持される
  - Gitコミット＆プッシュが実行される（コミットメッセージ: `[ai-workflow] Clean up workflow execution logs`）

### AC-10: CI環境での自動承認（完全クリーンアップ）

- **Given**: Issue #123のEvaluation Phaseが完了している、CI環境（`process.env.CI === 'true'`）
- **When**: `node dist/index.js cleanup --issue 123 --all`を実行
- **Then**:
  - 確認プロンプトは表示されない（自動承認）
  - `.ai-workflow/issue-123/`ディレクトリ全体が削除される
  - Gitコミット＆プッシュが実行される

---

## 7. スコープ外

以下の項目は本Issueのスコープ外とし、将来的な拡張候補とします：

### 7.1 Issue #211（Jenkinsfile分割）との統合
- **説明**: Jenkinsfileに`cleanup`コマンドを独立したステップとして組み込む実装は、Issue #211で実施
- **理由**: Issue #211がまだ未着手のため、本Issueでは`cleanup`コマンドの実装のみに集中

### 7.2 複数Issue一括クリーンアップ
- **説明**: 複数のIssue番号を指定して一括クリーンアップする機能（例: `cleanup --issues 123,124,125`）
- **理由**: 要件が複雑化し、初期実装の範囲を超えるため

### 7.3 クリーンアップ履歴の記録
- **説明**: クリーンアップ実行履歴を`metadata.json`に記録する機能（削除日時、削除ファイル数、実行ユーザー等）
- **理由**: 必須機能ではなく、将来的な拡張候補として検討

### 7.4 削除ファイルの圧縮アーカイブ
- **説明**: 削除前にデバッグログを`.tar.gz`形式で圧縮アーカイブする機能
- **理由**: ストレージコスト削減が主目的のため、アーカイブは不要と判断

### 7.5 リモート専用ブランチのクリーンアップ
- **説明**: ローカルではなく、リモート（GitHub）のブランチのみを対象にクリーンアップする機能
- **理由**: 技術的複雑性が高く、初期実装の範囲外

### 7.6 クリーンアップスケジューリング
- **説明**: cron等で定期的にクリーンアップを自動実行する機能
- **理由**: 運用要件が未定のため、将来的な拡張候補

---

## 8. 参考情報

### 8.1 関連Issue
- **Issue #211**: Jenkinsfile分割（本Issueのクリーンアップコマンドを統合予定）
- **Issue #90**: フェーズ差し戻し機能（rollbackコマンドの実装例として参考）

### 8.2 関連実装
- **`src/phases/base-phase.ts`**: `cleanupWorkflowLogs()`メソッドの現在の実装
- **`src/phases/cleanup/artifact-cleaner.ts`**: クリーンアップロジックの専門モジュール（`cleanupWorkflowLogs()`, `cleanupWorkflowArtifacts()`）
- **`src/commands/rollback.ts`**: CLI引数解析とバリデーションの実装例（約459行）
- **`src/commands/execute.ts`**: `handleExecuteCommand()`の実装例（約497行）

### 8.3 関連ドキュメント
- **CLAUDE.md**: 「ワークフローログクリーンアップ」セクション（行442-447）
- **ARCHITECTURE.md**: 「クリーンアップモジュール」セクション（行270-272）
- **README.md**: 「ワークフローログの自動クリーンアップ」セクション（行919-928）

---

**作成日**: 2025-12-04
**バージョン**: 1.0
**ステータス**: Draft
