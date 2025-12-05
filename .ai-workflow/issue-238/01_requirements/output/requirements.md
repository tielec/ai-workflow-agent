# 要件定義書 - Issue #238

**Issue番号**: #238
**タイトル**: Jenkins Job用Jenkinsfileを適切なディレクトリに配置
**作成日**: 2025-01-30
**ステータス**: 要件定義完了

---

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-238/00_planning/output/planning.md`）で策定された以下の戦略を踏まえて要件定義を実施：

### 開発計画の概要
- **複雑度判定**: 簡単（2~3時間）
- **実装戦略**: EXTEND（既存構造の拡張）
- **テスト戦略**: INTEGRATION_ONLY（統合テスト中心）
- **影響範囲**: 限定的（Jenkinsfile 5個 + DSL 5個 + README.md 1個）

### 重要な戦略的判断
- **Git履歴の保持**: `git mv`コマンドでファイル移動を実行し、変更履歴を維持
- **段階的検証**: ファイル移動 → DSL更新 → 統合テストの順で実施
- **リスク対策**: シードジョブ実行による50ジョブ生成確認をゲート条件に設定

---

## 1. 概要

### 背景
Issue #230で `infrastructure-as-code` リポジトリからJenkins Job定義を移行した際、各実行モード用のJenkinsfileが `jenkins/` 直下に残された状態となっている。現在の配置は暫定的なものであり、標準的なディレクトリ構造に準拠していないため、保守性と可読性が低下している。

### 目的
Jenkins Job用Jenkinsfileを標準的なディレクトリ構造に再配置し、以下を達成する：

1. **保守性の向上**: 各実行モード用Jenkinsfileを独立したディレクトリに配置し、変更時の影響範囲を明確化
2. **一貫性の確保**: `jenkins/jobs/pipeline/` 配下の構造を統一し、Job DSL設定との整合性を確保
3. **Git履歴の保持**: `git mv`コマンドでファイル移動を実行し、変更履歴を維持

### ビジネス価値・技術的価値
- **ビジネス価値**: Jenkins Job定義の保守コスト削減（標準構造により新規メンバーのオンボーディング時間を短縮）
- **技術的価値**: ディレクトリ構造の標準化により、CI/CDパイプラインの拡張性と可読性が向上

---

## 2. 機能要件

### FR-001: Jenkinsfileの移動（優先度：高）
**説明**: 各実行モード用Jenkinsfileを `jenkins/jobs/pipeline/ai-workflow/` 配下の専用ディレクトリに移動する。

**対象ファイル**:
| 移動元 | 移動先 |
|--------|--------|
| `jenkins/Jenkinsfile.all-phases` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `jenkins/Jenkinsfile.preset` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `jenkins/Jenkinsfile.single-phase` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `jenkins/Jenkinsfile.rollback` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `jenkins/Jenkinsfile.auto-issue` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

**実装方法**: `git mv` コマンドを使用し、Git履歴を保持

**受け入れ基準**:
- Given: 移動対象の5つのJenkinsfileが `jenkins/` 直下に存在する
- When: `git mv` コマンドで各Jenkinsfileを移動先ディレクトリに移動する
- Then: 移動先ディレクトリに各Jenkinsfileが配置され、Git履歴が保持されている

### FR-002: DSLファイルの `scriptPath` 更新（優先度：高）
**説明**: Job DSLファイル（`jenkins/jobs/dsl/ai-workflow/*.groovy`）の `scriptPath` パラメータを、移動後のJenkinsfileパスに更新する。

**対象DSLファイルと更新内容**:
| DSLファイル | 現在の `scriptPath` | 更新後の `scriptPath` |
|------------|---------------------|----------------------|
| `ai_workflow_all_phases_job.groovy` | `Jenkinsfile.all-phases` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `ai_workflow_preset_job.groovy` | `Jenkinsfile.preset` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `ai_workflow_single_phase_job.groovy` | `Jenkinsfile.single-phase` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `ai_workflow_rollback_job.groovy` | `Jenkinsfile.rollback` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `ai_workflow_auto_issue_job.groovy` | `Jenkinsfile.auto-issue` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

**受け入れ基準**:
- Given: 5つのDSLファイルが旧 `scriptPath` を参照している
- When: 各DSLファイルの `scriptPath` を新しいパスに更新する
- Then: 全DSLファイルが正しい `scriptPath` を参照し、構文エラーがない

### FR-003: `jenkins/README.md` の更新（優先度：中）
**説明**: `jenkins/README.md` のディレクトリ構造セクションを、移動後のディレクトリ構造に更新する。

**更新対象セクション**:
- ディレクトリ構造図（変更後の構造を反映）
- Jenkinsfile一覧表（パスを更新）

**受け入れ基準**:
- Given: `jenkins/README.md` が旧ディレクトリ構造を記載している
- When: ディレクトリ構造セクションを更新する
- Then: 新しいディレクトリ構造が正確に記載され、リンク切れがない

### FR-004: シードジョブによる統合検証（優先度：高）
**説明**: シードジョブを実行し、全50ジョブ（5モード × 10フェーズ）が正常に生成されることを確認する。

**検証項目**:
1. シードジョブが正常に完了する（EXIT CODE 0）
2. 全50ジョブが生成される
3. 各ジョブのJenkinsfile参照が正しい（`scriptPath`が正しく解決される）

**受け入れ基準**:
- Given: DSL更新が完了している
- When: シードジョブを実行する
- Then: 全50ジョブが正常に生成され、各ジョブのJenkinsfileパスが正しい

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件
- **シードジョブ実行時間**: 既存の実行時間（約2~3分）から大幅に増加しないこと（許容範囲: +10%以内）
- **Jenkinsfileロード時間**: 各ジョブのJenkinsfileロード時間が現状と同等であること

### NFR-002: 可用性・信頼性要件
- **Git履歴の保持**: ファイル移動後も、変更履歴（コミット履歴、blame情報）が保持されること
- **ロールバック可能性**: 問題発生時、Git revertで安全にロールバック可能であること

### NFR-003: 保守性・拡張性要件
- **ディレクトリ構造の一貫性**: `jenkins/jobs/pipeline/ai-workflow/` 配下の構造が統一されていること
- **新規モード追加の容易性**: 将来的に新しい実行モードを追加する際、既存パターンを踏襲できること
- **ドキュメントの同期**: `jenkins/README.md` が常に最新のディレクトリ構造を反映していること

### NFR-004: セキュリティ要件
- **認証情報の保護**: Jenkinsfileに認証情報がハードコードされていないこと（移動前後で変更なし）
- **アクセス制御**: ファイル移動後も、既存のアクセス制御（Gitリポジトリの権限）が維持されること

---

## 4. 制約事項

### 技術的制約
- **使用技術**: Jenkins Job DSL Plugin、Groovy、Bash（`git mv` コマンド）
- **既存システムとの整合性**:
  - シードジョブ（`jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile`）は変更しない
  - `shared/common.groovy` の共通処理モジュールは変更しない
- **Git操作**: `git mv` コマンドでファイル移動を実行し、履歴を保持（`git mv` がサポートされる環境を前提）

### リソース制約
- **時間**: 2~3時間以内での完了を目標（Planning Documentの見積もりに準拠）
- **人員**: 単独作業を想定
- **予算**: 追加コストなし（既存リソース内で実施）

### ポリシー制約
- **コーディング規約**: プロジェクトの既存コーディング規約に準拠（特に変更なし）
- **変更管理**: 全変更を単一コミットで実施し、コミットメッセージに Issue番号を含める
- **レビュー**: PR作成後、ピアレビューを実施（自動化ワークフローの一環）

---

## 5. 前提条件

### システム環境
- **Git**: バージョン2.0以降（`git mv` コマンドサポート）
- **Jenkins**: Job DSL Pluginがインストール済み
- **リポジトリ**: `ai-workflow-agent` リポジトリのクローン済み環境

### 依存コンポーネント
- **シードジョブ**: `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile` が正常動作すること
- **Job DSL Plugin**: バージョン1.77以降（`scriptPath` パラメータサポート）

### 外部システム連携
- **GitHub**: GitHub Actions（CI/CDパイプライン）が正常動作すること
- **Jenkins Server**: シードジョブを実行可能なJenkinsサーバーが利用可能であること

---

## 6. 受け入れ基準

### AC-001: Jenkinsfileの移動（FR-001）
- **Given**: 移動対象の5つのJenkinsfileが `jenkins/` 直下に存在する
- **When**: `git mv` コマンドで各Jenkinsfileを以下のように移動する
  - `jenkins/Jenkinsfile.all-phases` → `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
  - `jenkins/Jenkinsfile.preset` → `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
  - `jenkins/Jenkinsfile.single-phase` → `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
  - `jenkins/Jenkinsfile.rollback` → `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
  - `jenkins/Jenkinsfile.auto-issue` → `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile`
- **Then**:
  - 移動先ディレクトリに各Jenkinsfileが配置されている
  - `git log --follow <file>` で移動前の履歴が追跡可能
  - 移動元（`jenkins/` 直下）に旧Jenkinsfileが残っていない

### AC-002: DSLファイルの `scriptPath` 更新（FR-002）
- **Given**: 5つのDSLファイルが旧 `scriptPath` を参照している
- **When**: 各DSLファイルの `scriptPath` を以下のように更新する
  | DSLファイル | 更新後の `scriptPath` |
  |------------|----------------------|
  | `ai_workflow_all_phases_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
  | `ai_workflow_preset_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
  | `ai_workflow_single_phase_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
  | `ai_workflow_rollback_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
  | `ai_workflow_auto_issue_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |
- **Then**:
  - 全DSLファイルが新しい `scriptPath` を参照している
  - Groovy構文エラーがない（`groovy -c <file>` で検証可能）
  - 他のパラメータ（`displayName`, `description` 等）は変更されていない

### AC-003: `jenkins/README.md` の更新（FR-003）
- **Given**: `jenkins/README.md` が旧ディレクトリ構造を記載している
- **When**: ディレクトリ構造セクションを更新する
- **Then**:
  - 新しいディレクトリ構造が正確に記載されている
  - Jenkinsfile一覧表のパスが更新されている
  - リンク切れがない（存在しないファイルへの参照がない）
  - Markdown構文エラーがない

### AC-004: シードジョブによる統合検証（FR-004）
- **Given**: FR-001, FR-002, FR-003が完了している
- **When**: シードジョブ（`ai-workflow-job-creator`）を実行する
- **Then**:
  - シードジョブが正常に完了する（EXIT CODE 0）
  - 全50ジョブ（5モード × 10フェーズ）が生成される
  - 各ジョブのJenkinsfile参照が正しい（例: All Phases Jobの `scriptPath` が `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` を参照）
  - ジョブのビルド履歴に異常ログがない

### AC-005: ロールバック可能性（NFR-002）
- **Given**: 全変更が単一コミットで実施されている
- **When**: `git revert <commit-hash>` を実行する
- **Then**:
  - 全ファイルが移動前の状態に復元される
  - DSLファイルの `scriptPath` が旧パスに戻る
  - シードジョブを実行すると、旧構造で50ジョブが正常に生成される

---

## 7. スコープ外

以下は本Issueのスコープ外とし、将来的な拡張候補とする：

### 明確にスコープ外とする事項
1. **Jenkinsfileの内容変更**: 各Jenkinsfileのロジック修正や機能追加は対象外
2. **共通処理モジュールの変更**: `shared/common.groovy` の修正は対象外
3. **シードジョブの変更**: `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile` の修正は対象外
4. **新規ディレクトリの追加**: `jenkins/jobs/pipeline/` 配下に新しい構造を追加することは対象外
5. **Job DSL設定の最適化**: DSLファイルのパラメータ最適化やリファクタリングは対象外

### 将来的な拡張候補
- **Jenkinsfileの共通化**: 各実行モード用Jenkinsfileの共通処理を `shared/` に抽出
- **ディレクトリ構造のさらなる標準化**: `jenkins/jobs/dsl/` の構造も統一
- **自動テストの追加**: シードジョブ実行後のジョブ生成確認を自動化

---

## 8. 品質ゲート（Phase 1）チェックリスト

本要件定義書は、以下の品質ゲートを満たしている：

- [x] **機能要件が明確に記載されている**: FR-001〜FR-004で具体的に定義
- [x] **受け入れ基準が定義されている**: AC-001〜AC-005でGiven-When-Then形式で記載
- [x] **スコープが明確である**: スコープ外事項を明示的に列挙
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準が対応し、制約事項と前提条件が整合

---

## 9. 備考

### Planning Documentとの整合性確認
- ✅ 実装戦略（EXTEND）と要件定義が一致
- ✅ テスト戦略（INTEGRATION_ONLY）と受け入れ基準が一致
- ✅ リスク対策（Git履歴保持、統合テスト）が要件に反映済み

### 次フェーズへの引き継ぎ事項
- Design Phaseでは、ファイル移動スクリプトの詳細設計と、DSL更新の具体的なパターンを定義する
- Test Scenario Phaseでは、AC-004（シードジョブ統合検証）の具体的なテストケースを策定する

---

**ドキュメント作成者**: AI Workflow Agent
**レビュー状態**: 初回作成完了
**最終更新日**: 2025-01-30
