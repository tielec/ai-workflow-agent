# 要件定義書 - Issue #232

## 0. Planning Documentの確認

Planning Phaseで策定された計画を確認しました：

### 実装戦略
- **戦略**: EXTEND（既存ディレクトリ構造への追加と既存ファイルの修正）
- **根拠**: 新しいディレクトリを作成し、既存ファイルを移動・更新する作業のため

### テスト戦略
- **戦略**: INTEGRATION_ONLY（統合テストのみ）
- **根拠**: ロジック変更がなく、シードジョブ実行による統合動作確認が必要

### 複雑度評価
- **評価**: 簡単
- **工数見積もり**: 3～5時間
- **リスク評価**: 低（ファイルパス変更のみ、ロールバックが容易）

### 主要リスク
1. DSLファイルのscriptPath更新漏れ（影響度: 高）
2. 移動先ディレクトリ構造の誤り（影響度: 中）
3. シードジョブ実行失敗によるジョブ未生成（影響度: 高）

これらの計画を踏まえて、詳細な要件定義を実施します。

---

## 1. 概要

### 1.1 背景
Issue #230で `infrastructure-as-code` リポジトリからJenkins Job定義を移行した際、各実行モード用のJenkinsfileが `jenkins/` ディレクトリ直下に配置されたままになっている。これらを標準的なディレクトリ構造に整理し、保守性を向上させる必要がある。

### 1.2 目的
Jenkins Job用のJenkinsfileを適切なディレクトリ階層に配置し、プロジェクトのディレクトリ構造を標準化する。同時に、DSLファイルの参照パスを更新してジョブ生成が正常に動作するようにする。

### 1.3 ビジネス価値・技術的価値
- **保守性向上**: ディレクトリ構造が整理され、ファイルの役割と配置が明確になる
- **可読性向上**: 標準的なディレクトリ階層により、新規開発者がプロジェクト構造を理解しやすくなる
- **拡張性向上**: 将来的に新しい実行モードを追加する際の配置場所が明確になる
- **一貫性確保**: プロジェクト全体のディレクトリ命名規則とパターンに統一される

---

## 2. 機能要件

### FR-1: Jenkinsfileのディレクトリ移動（優先度: 高）
**説明**: 5つのJenkinsfileを `jenkins/` ディレクトリ直下から `jenkins/jobs/pipeline/ai-workflow/` 配下の適切なサブディレクトリに移動する。

**詳細**:
- `jenkins/Jenkinsfile.all-phases` → `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
- `jenkins/Jenkinsfile.preset` → `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
- `jenkins/Jenkinsfile.single-phase` → `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
- `jenkins/Jenkinsfile.rollback` → `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
- `jenkins/Jenkinsfile.auto-issue` → `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile`

**制約**:
- ファイル移動には `git mv` コマンドを使用し、Git履歴を保持すること
- 移動先ディレクトリが存在しない場合は `mkdir -p` で作成すること
- ファイル名は `Jenkinsfile` に統一すること（拡張子なし）

### FR-2: DSLファイルのscriptPath更新（優先度: 高）
**説明**: 5つのDSLファイルの `scriptPath` 属性を新しいパスに更新する。

**詳細**:
| DSLファイル | 現在の値 | 新しい値 |
|------------|---------|---------|
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy` | `'Jenkinsfile'` (line 199) | `'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile'` |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy` | `'Jenkinsfile'` (line 217) | `'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile'` |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy` | `'Jenkinsfile'` | `'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile'` |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy` | `'Jenkinsfile'` | `'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile'` |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy` | `'Jenkinsfile'` | `'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile'` |

**制約**:
- 相対パスで記載すること（リポジトリルートからの相対パス）
- Groovyの文字列リテラルはシングルクォート `'` で囲むこと
- 更新箇所は `definition { cpsScm { ... scriptPath(...) } }` セクション

### FR-3: README.mdのディレクトリ構造更新（優先度: 中）
**説明**: `jenkins/README.md` の「ディレクトリ構造」セクションを更新し、新しいディレクトリ構造を反映する。

**詳細**:
- 現在のディレクトリ構造セクション（line 7-27）を更新
- 新しいディレクトリ構造を追加:
  ```
  jenkins/
  ├── jobs/
  │   ├── pipeline/
  │   │   ├── _seed/
  │   │   │   └── ai-workflow-job-creator/
  │   │   │       ├── Jenkinsfile
  │   │   │       ├── folder-config.yaml
  │   │   │       └── job-config.yaml
  │   │   └── ai-workflow/
  │   │       ├── all-phases/
  │   │       │   └── Jenkinsfile
  │   │       ├── preset/
  │   │       │   └── Jenkinsfile
  │   │       ├── single-phase/
  │   │       │   └── Jenkinsfile
  │   │       ├── rollback/
  │   │       │   └── Jenkinsfile
  │   │       └── auto-issue/
  │   │           └── Jenkinsfile
  │   └── dsl/
  │       ├── folders.groovy
  │       └── ai-workflow/
  │           ├── ai_workflow_all_phases_job.groovy
  │           ├── ai_workflow_preset_job.groovy
  │           ├── ai_workflow_single_phase_job.groovy
  │           ├── ai_workflow_rollback_job.groovy
  │           ├── ai_workflow_auto_issue_job.groovy
  │           └── TEST_PLAN.md
  └── shared/
      └── common.groovy
  ```

**制約**:
- Markdownフォーマットの統一（インデント: 2スペース、リストマーカー: `├─`, `└─`）
- 既存の説明文は可能な限り保持すること

### FR-4: シードジョブによる検証（優先度: 高）
**説明**: 変更後にシードジョブを実行し、ジョブが正常に生成されることを検証する。

**詳細**:
- シードジョブ (`Admin_Jobs/ai-workflow-job-creator`) を実行
- 5種類のジョブ（all_phases, preset, single_phase, rollback, auto_issue）が正常に生成されることを確認
- 各ジョブの設定で `scriptPath` が新しいパスになっていることを確認
- 生成されたジョブのビルド可能性を確認（Jenkinsfile読み込みエラーがないこと）

**制約**:
- シードジョブ実行前に、すべてのファイル変更をコミット・プッシュすること
- テスト実行は手動で実施すること（自動テストコードは実装しない）

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件
- シードジョブの実行時間: 5分以内に完了すること
- ファイル移動操作: 10秒以内に完了すること

### NFR-2: 信頼性要件
- ファイル移動操作は原子的に実行されること（失敗時は元の状態に復元可能）
- Git履歴が保持されること（`git mv` の使用により）
- エラー発生時は明確なエラーメッセージが表示されること

### NFR-3: 保守性要件
- ディレクトリ構造は標準的な命名規則に従うこと
- コミットメッセージは明確で、変更内容が把握できること
- README.mdの説明は開発者が理解しやすい形式であること

### NFR-4: セキュリティ要件
- ファイル移動操作でパーミッションが変更されないこと
- 機密情報（APIキー等）を含むファイルが誤って移動されないこと

---

## 4. 制約事項

### 4.1 技術的制約
- **Git操作**: `git mv` コマンドによるファイル移動（履歴保持のため）
- **パス形式**: リポジトリルートからの相対パスを使用（絶対パスは不可）
- **Groovy構文**: DSLファイルはGroovy構文に準拠すること
- **Markdown構文**: README.mdはMarkdown構文に準拠すること

### 4.2 既存システムとの整合性
- シードジョブのJenkinsfile (`jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile`) は変更しないこと
- `jenkins/shared/common.groovy` は変更しないこと
- フォルダDSL (`jenkins/jobs/dsl/folders.groovy`) は変更しないこと

### 4.3 リソース制約
- 作業時間: 3～5時間（Planning Phaseの見積もりに準拠）
- 並行作業: 単一開発者による作業を想定

---

## 5. 前提条件

### 5.1 システム環境
- Git 2.x 以上がインストールされていること
- Jenkins環境が稼働していること
- シードジョブ (`Admin_Jobs/ai-workflow-job-creator`) が登録されていること

### 5.2 依存コンポーネント
- Job DSL Plugin (Jenkins)
- Pipeline Plugin (Jenkins)
- Git Plugin (Jenkins)

### 5.3 外部システム連携
- GitHub: リモートリポジトリへのプッシュが可能であること
- Jenkins: シードジョブの実行権限があること

---

## 6. 受け入れ基準

### AC-1: Jenkinsfileの移動（FR-1）
**Given**: 5つのJenkinsfileが `jenkins/` ディレクトリ直下に存在する
**When**: ファイル移動操作を実行する
**Then**:
- 各Jenkinsfileが新しいディレクトリに移動されていること
- 元のディレクトリにファイルが残っていないこと
- Git履歴が保持されていること（`git log --follow` で確認可能）
- ファイルパーミッションが変更されていないこと

### AC-2: DSLファイルのscriptPath更新（FR-2）
**Given**: DSLファイルの `scriptPath` が `'Jenkinsfile'` に設定されている
**When**: scriptPathを新しいパスに更新する
**Then**:
- 5つのDSLファイルすべてで `scriptPath` が新しいパスに更新されていること
- Groovy構文エラーがないこと（`groovy -c <file>` で検証）
- `scriptPath` の値がシングルクォートで囲まれていること

### AC-3: README.mdの更新（FR-3）
**Given**: README.mdのディレクトリ構造セクションが古い状態である
**When**: ディレクトリ構造セクションを更新する
**Then**:
- 新しいディレクトリ構造が反映されていること
- Markdownフォーマットが正しいこと（`markdownlint` で検証）
- 視覚的に読みやすい形式であること

### AC-4: シードジョブ実行による検証（FR-4）
**Given**: すべてのファイル変更がコミット・プッシュされている
**When**: シードジョブを実行する
**Then**:
- シードジョブが正常に完了すること（ビルドステータス: SUCCESS）
- 5種類 × 10フォルダ = 50個のジョブが生成されること
- 各ジョブの設定で `scriptPath` が新しいパスになっていること
- 生成されたジョブのビルドが開始可能であること（Jenkinsfile読み込みエラーがないこと）

### AC-5: 異常系テスト
**Given**: 存在しないscriptPathを指定した場合
**When**: シードジョブを実行する
**Then**:
- ジョブ生成は成功するが、ジョブ実行時にエラーメッセージが表示されること
- エラーメッセージに "Jenkinsfile not found" または類似のメッセージが含まれること

---

## 7. スコープ外

以下の事項は本Issueのスコープ外とし、将来的な拡張候補とする：

### 7.1 明確にスコープ外とする事項
- Jenkinsfileの内容の変更（パラメータ、ステージ定義等）
- 新しい実行モードの追加
- シードジョブのJenkinsfileの変更
- `common.groovy` の共通処理の変更
- Job DSLパラメータの追加・削除

### 7.2 将来的な拡張候補
- Jenkinsfileの自動テスト機能の追加
- ディレクトリ構造の自動検証スクリプト
- scriptPath自動更新スクリプト
- CI/CDパイプラインでの自動検証

---

## 8. 品質ゲート（Phase 1）

この要件定義書は、以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: 4つの機能要件（FR-1～FR-4）を具体的に記述
- ✅ **受け入れ基準が定義されている**: 5つの受け入れ基準（AC-1～AC-5）をGiven-When-Then形式で定義
- ✅ **スコープが明確である**: スコープ外の事項を明示し、作業範囲を明確化
- ✅ **論理的な矛盾がない**: 各セクション間で整合性を確保し、矛盾を排除

---

## 9. 補足情報

### 9.1 Planning Documentとの整合性
本要件定義書は、Planning Phaseで策定された以下の計画と整合しています：

- **実装戦略**: EXTEND（既存ディレクトリ構造への追加）
- **テスト戦略**: INTEGRATION_ONLY（シードジョブ実行による統合テスト）
- **複雑度評価**: 簡単（3～5時間）
- **リスク評価**: 低（ファイルパス変更のみ、ロールバック容易）

### 9.2 関連ドキュメント
- [Issue #230](https://github.com/tielec/ai-workflow-agent/issues/230) - AI Workflow Jenkins Job定義の移行
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - アーキテクチャ設計思想
- [jenkins/README.md](../../jenkins/README.md) - Jenkins Jobs概要
- [jenkins/jobs/dsl/ai-workflow/TEST_PLAN.md](../../jenkins/jobs/dsl/ai-workflow/TEST_PLAN.md) - テスト計画

### 9.3 注意事項
- ファイル移動とscriptPath更新は密接に関連しており、両方が完了しないとシードジョブが正常に動作しない
- コミットメッセージは明確にし、レビュワーが変更内容を把握しやすくすること
- テスト実行（シードジョブ実行）は手動で実施し、スクリーンショット等の証跡を残すこと

---

**作成日時**: 2025-01-31
**バージョン**: 1.0
**最終更新**: Phase 1 (Requirements) - 要件定義書作成完了
