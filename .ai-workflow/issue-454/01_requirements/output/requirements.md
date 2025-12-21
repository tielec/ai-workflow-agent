# 要件定義書: Issue #454

## 全Jenkins Jobsのagentラベルをec2-fleet-microに統一

**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/454
**作成日**: 2025-01-21
**ステータス**: 本リポジトリでは対応完了済み（別リポジトリ対応が必要）

---

## 0. Planning Documentの確認結果

### 開発計画の全体像

Planning Phaseでの調査結果により、以下の重要事項が判明しています：

| 項目 | 内容 |
|------|------|
| **本リポジトリの状態** | 全Jenkinsジョブが既に`ec2-fleet-micro`に更新済み（Issue #435で対応完了） |
| **Issueで指定されたジョブ** | Admin_Jobs、delivery-management-jobs等は**別リポジトリ**に配置 |
| **実装戦略** | N/A（本リポジトリでは実装対象なし） |
| **テスト戦略** | N/A（本リポジトリではテスト対象なし） |
| **複雑度** | 簡単（別リポジトリで実施する場合も単純な文字列置換） |

### 本リポジトリでの確認済みJenkinsfile

以下のファイルが全て`ec2-fleet-micro`に更新済みであることを確認：

| ファイルパス | 現在の設定 |
|-------------|-----------|
| `Jenkinsfile` (ルート) | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` | `ec2-fleet-micro` ✓ |
| `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` | `ec2-fleet-micro` ✓ |

---

## 1. 概要

### 背景

Issue #435でai-workflowパイプライン関連のJenkinsfileを`ec2-fleet-micro`に変更し、テストを実施した結果、他のジョブカテゴリについても軽量なagentラベルで十分に動作することが確認された。EC2 Fleetの最適化とコスト削減のため、軽量ジョブには`ec2-fleet-micro`ラベルを使用する方針となった。

### 目的

17のJenkinsジョブのagentラベルを`ec2-fleet-micro`に統一し、以下を達成する：

1. **コスト削減**: 軽量ジョブに適切なインスタンスタイプを使用することでEC2コストを削減
2. **起動時間の短縮**: 小さいインスタンスの方が起動が早い可能性がある
3. **リソース最適化**: 必要最小限のリソースを使用

### 本リポジトリでの結論

⚠️ **本リポジトリ（ai-workflow-agent）での対応は完了済みです。**

- すべてのJenkinsジョブが既に`ec2-fleet-micro`に更新済み（Issue #435で対応完了）
- Issueで記載されている対象ジョブ（Admin_Jobs、delivery-management-jobs等）は本リポジトリには存在しない

### ビジネス価値・技術的価値

| 価値 | 説明 |
|------|------|
| **コスト削減** | EC2インスタンス費用の削減（軽量ジョブに最適なインスタンスタイプを使用） |
| **リソース効率化** | リソースの無駄遣いを防止 |
| **運用標準化** | 全ジョブで統一されたagentラベル設定 |
| **スケーラビリティ向上** | 小さいインスタンスはより迅速にスケール可能 |

---

## 2. 機能要件

### ⚠️ 重要: 本リポジトリでは機能要件なし

本リポジトリ（ai-workflow-agent）では、すべてのJenkinsジョブが既に`ec2-fleet-micro`に更新されているため、追加の機能要件はありません。

### 参考: 別リポジトリでの機能要件

以下は、対象ジョブが配置されている別リポジトリで実施する場合の機能要件です。

#### FR-001: Admin_Jobsのagentラベル変更

| 項目 | 内容 |
|------|------|
| **優先度** | 高 |
| **説明** | Admin_Jobsカテゴリの6ジョブのagentラベルを`ec2-fleet-micro`に変更 |
| **対象ジョブ** | Backup_Config、Github_Webhooks_Setting、Restore_Config、SSM_Parameter_Backup、SSM_Parameter_Restore、Test_EC2_Fleet_Agent |
| **修正ファイル** | 各ジョブの`job.groovy`および`Jenkinsfile`（計12ファイル） |

#### FR-002: delivery-management-jobsのagentラベル変更

| 項目 | 内容 |
|------|------|
| **優先度** | 高 |
| **説明** | delivery-management-jobsカテゴリの3ジョブのagentラベルを`ec2-fleet-micro`に変更 |
| **対象ジョブ** | pulumi-dashboard、ssm-parameter-store-dashboard、lambda-verification |
| **修正ファイル** | 各ジョブの`job.groovy`および`Jenkinsfile`（計6ファイル） |

#### FR-003: Infrastructure_Managementのagentラベル変更

| 項目 | 内容 |
|------|------|
| **優先度** | 高 |
| **説明** | Infrastructure_Managementカテゴリの1ジョブのagentラベルを`ec2-fleet-micro`に変更 |
| **対象ジョブ** | Shutdown_Jenkins_Environment |
| **修正ファイル** | `job.groovy`および`Jenkinsfile`（計2ファイル） |

#### FR-004: Code_Quality_Checkerのagentラベル変更

| 項目 | 内容 |
|------|------|
| **優先度** | 高 |
| **説明** | Code_Quality_Checkerカテゴリの4ジョブのagentラベルを`ec2-fleet-micro`に変更 |
| **対象ジョブ** | pr-complexity-analyzer-github-trigger、rust-code-analysis-check-github-trigger、rust-code-analysis-check、pr-complexity-analyzer |
| **修正ファイル** | 各ジョブの`job.groovy`および`Jenkinsfile`（計8ファイル） |

#### FR-005: Document_Generatorのagentラベル変更

| 項目 | 内容 |
|------|------|
| **優先度** | 高 |
| **説明** | Document_Generatorカテゴリの3ジョブのagentラベルを`ec2-fleet-micro`に変更 |
| **対象ジョブ** | pull_request_comment_builder、multi_pull_request_comment_builder、pull_request_comment_builder_github_trigger |
| **修正ファイル** | 各ジョブの`job.groovy`および`Jenkinsfile`（計6ファイル） |

#### FR-006: Seed Job実行によるジョブ設定反映

| 項目 | 内容 |
|------|------|
| **優先度** | 中 |
| **説明** | Job DSL変更後、Seed Jobを実行してJenkinsにジョブ設定を反映 |
| **前提条件** | FR-001〜FR-005が完了していること |

---

## 3. 非機能要件

### ⚠️ 本リポジトリでは非機能要件なし

本リポジトリでは実装対象がないため、非機能要件はありません。

### 参考: 別リポジトリでの非機能要件

#### NFR-001: 可用性

| 項目 | 内容 |
|------|------|
| **要件** | 変更はJenkinsを停止せずに実施する |
| **理由** | サービス継続性の確保 |

#### NFR-002: パフォーマンス

| 項目 | 内容 |
|------|------|
| **要件** | 各ジョブの起動時間が現状と同等以上であること |
| **測定方法** | ジョブ実行ログでエージェント割り当て時間を確認 |

#### NFR-003: 互換性

| 項目 | 内容 |
|------|------|
| **要件** | `ec2-fleet-micro`ラベルがEC2 Fleet設定で定義済みであること |
| **確認方法** | EC2 Fleet設定の確認（Issue #435で検証済み） |

#### NFR-004: 保守性

| 項目 | 内容 |
|------|------|
| **要件** | ロールバックが容易であること |
| **方法** | Git revertによる復旧が可能 |

---

## 4. 制約事項

### 技術的制約

| 制約 | 説明 |
|------|------|
| **別リポジトリ配置** | 対象ファイル（Admin_Jobs、delivery-management-jobs等）はai-workflow-agentリポジトリ外に配置されている |
| **EC2 Fleet設定依存** | `ec2-fleet-micro`ラベルがEC2 Fleet設定で正しく定義されている必要がある |
| **Job DSLパターン** | 既存のJob DSL記述パターンに従う必要がある |

### リソース制約

| 制約 | 説明 |
|------|------|
| **リポジトリアクセス権限** | 対象リポジトリへの書き込み権限が必要 |
| **Jenkins権限** | Seed Jobの実行権限が必要 |

### ポリシー制約

| 制約 | 説明 |
|------|------|
| **営業時間外推奨** | ジョブ実行の少ない時間帯に変更を実施することを推奨 |
| **変更管理** | 本番環境への変更はレビュー承認後に実施 |

---

## 5. 前提条件

### システム環境

| 前提条件 | 説明 |
|----------|------|
| **EC2 Fleet設定** | `ec2-fleet-micro`ラベルがEC2 Fleet設定で正しく定義されている |
| **Issue #435完了** | ai-workflowパイプラインでのテストが完了し、`ec2-fleet-micro`の動作が確認済み |

### 依存コンポーネント

| コンポーネント | 依存内容 |
|---------------|----------|
| **Jenkins** | Seed Job機能が利用可能 |
| **EC2 Fleet Plugin** | `ec2-fleet-micro`ラベルでエージェントが起動可能 |
| **Git** | 変更のバージョン管理 |

### 外部システム連携

| システム | 連携内容 |
|----------|----------|
| **AWS EC2** | EC2 Fleetインスタンスの起動・終了 |
| **GitHub** | ソースコード管理、PR作成 |

---

## 6. 受け入れ基準

### 本リポジトリでの受け入れ基準

⚠️ **本リポジトリ（ai-workflow-agent）は既に受け入れ基準を満たしています。**

| 基準 | 状態 |
|------|------|
| すべてのJenkinsfileで`label 'ec2-fleet-micro'`が設定されている | ✅ 完了 |
| すべてのJob DSLで`label 'ec2-fleet-micro'`が設定されている | ✅ 完了（対象なし） |
| ジョブが正常に実行できる | ✅ Issue #435で確認済み |

### 参考: 別リポジトリでの受け入れ基準

#### AC-001: Job DSL設定の変更

```gherkin
Given すべての対象ジョブのJob DSLファイルが存在する
When agentラベルを`ec2-fleet-micro`に変更する
Then すべてのJob DSLファイルで`label 'ec2-fleet-micro'`が設定されている
```

#### AC-002: Jenkinsfile設定の変更

```gherkin
Given すべての対象ジョブのJenkinsfileが存在する
When agentラベルを`ec2-fleet-micro`に変更する
Then すべてのJenkinsfileで`label 'ec2-fleet-micro'`が設定されている
```

#### AC-003: Seed Job実行

```gherkin
Given Job DSLの変更がコミットされている
When Seed Jobを実行する
Then すべての対象ジョブがJenkinsに正しく反映される
And エラーが発生しない
```

#### AC-004: ジョブ実行確認

```gherkin
Given 各カテゴリから1つずつ代表ジョブを選定する
When 代表ジョブを実行する
Then ジョブが正常に完了する
And `ec2-fleet-micro`ラベルでエージェントが割り当てられる
```

#### AC-005: コスト削減効果の確認

```gherkin
Given ジョブ実行後のAWSコストレポートが取得可能
When コスト削減効果を分析する
Then EC2コストが削減されている（または同等）
```

---

## 7. スコープ外

### 本リポジトリでのスコープ外

以下の項目は本リポジトリ（ai-workflow-agent）での対応範囲外です：

| 項目 | 理由 |
|------|------|
| **Admin_Jobsの変更** | 別リポジトリに配置 |
| **delivery-management-jobsの変更** | 別リポジトリに配置 |
| **Infrastructure_Managementの変更** | 別リポジトリに配置 |
| **Code_Quality_Checkerの変更** | 別リポジトリに配置 |
| **Document_Generatorの変更** | 別リポジトリに配置 |

### 将来的な拡張候補

| 項目 | 説明 |
|------|------|
| **ドキュメント更新** | `.github/ISSUE_PR_COMMENT_JENKINS_INTEGRATION.md`内の古い`ec2-fleet`例を`ec2-fleet-micro`に更新（軽微な改善） |
| **EC2 Fleet設定の最適化** | `ec2-fleet-micro`のインスタンスタイプ・容量の最適化 |
| **自動化スクリプト** | 複数リポジトリ間でのagentラベル一括変更ツール |

---

## 8. 推奨アクション

本リポジトリ（ai-workflow-agent）での対応が完了済みであることを踏まえ、以下のアクションを推奨します：

### オプション1: Issueのクローズと新規Issue作成（推奨）

1. Issue #454に「ai-workflow-agentリポジトリ分は完了済み（Issue #435で対応）」とコメント
2. 対象ジョブが配置されているリポジトリを特定
3. 各リポジトリで新規Issueを作成

### オプション2: Issueの移動

1. Issue #454を対象ジョブが配置されているリポジトリに移動
2. 移動先リポジトリで対応を継続

### オプション3: 複数リポジトリ対応

1. 対象リポジトリを特定（Admin_Jobs、delivery-management-jobs等が配置されているリポジトリ）
2. 各リポジトリでIssue #454を参照して対応

---

## 9. 対象ジョブ一覧（別リポジトリ）

### 概要

| カテゴリ | ジョブ数 | 修正ファイル数 |
|---------|---------|---------------|
| Admin_Jobs | 6 | 12 |
| delivery-management-jobs | 3 | 6 |
| Infrastructure_Management | 1 | 2 |
| Code_Quality_Checker | 4 | 8 |
| Document_Generator | 3 | 6 |
| **合計** | **17** | **34** |

### 詳細

#### Admin_Jobs (6ジョブ、12ファイル)

| ジョブ名 | 修正対象ファイル |
|---------|-----------------|
| Backup_Config | `job.groovy`, `Jenkinsfile` |
| Github_Webhooks_Setting | `job.groovy`, `Jenkinsfile` |
| Restore_Config | `job.groovy`, `Jenkinsfile` |
| SSM_Parameter_Backup | `job.groovy`, `Jenkinsfile` |
| SSM_Parameter_Restore | `job.groovy`, `Jenkinsfile` |
| Test_EC2_Fleet_Agent | `job.groovy`, `Jenkinsfile` |

#### delivery-management-jobs (3ジョブ、6ファイル)

| ジョブ名 | 修正対象ファイル |
|---------|-----------------|
| pulumi-dashboard | `job.groovy`, `Jenkinsfile` |
| ssm-parameter-store-dashboard | `job.groovy`, `Jenkinsfile` |
| lambda-verification | `job.groovy`, `Jenkinsfile` |

#### Infrastructure_Management (1ジョブ、2ファイル)

| ジョブ名 | 修正対象ファイル |
|---------|-----------------|
| Shutdown_Jenkins_Environment | `job.groovy`, `Jenkinsfile` |

#### Code_Quality_Checker (4ジョブ、8ファイル)

| ジョブ名 | 修正対象ファイル |
|---------|-----------------|
| pr-complexity-analyzer-github-trigger | `job.groovy`, `Jenkinsfile` |
| rust-code-analysis-check-github-trigger | `job.groovy`, `Jenkinsfile` |
| rust-code-analysis-check | `job.groovy`, `Jenkinsfile` |
| pr-complexity-analyzer | `job.groovy`, `Jenkinsfile` |

#### Document_Generator (3ジョブ、6ファイル)

| ジョブ名 | 修正対象ファイル |
|---------|-----------------|
| pull_request_comment_builder | `job.groovy`, `Jenkinsfile` |
| multi_pull_request_comment_builder | `job.groovy`, `Jenkinsfile` |
| pull_request_comment_builder_github_trigger | `job.groovy`, `Jenkinsfile` |

---

## 10. 修正パターン

### Job DSL (.groovyファイル)

```groovy
// 修正前
agent {
    label 'ec2-fleet'
}

// 修正後
agent {
    label 'ec2-fleet-micro'
}
```

### Jenkinsfile

```groovy
// 修正前
pipeline {
    agent {
        label 'ec2-fleet'
    }
    // ...
}

// 修正後
pipeline {
    agent {
        label 'ec2-fleet-micro'
    }
    // ...
}
```

---

## 品質ゲートチェックリスト（Phase 1）

### 必須要件

- [x] **機能要件が明確に記載されている**: 本リポジトリでは対象なし（別リポジトリでの要件は参考として記載）
- [x] **受け入れ基準が定義されている**: 本リポジトリは既に基準を満たしている（別リポジトリでの基準は参考として記載）
- [x] **スコープが明確である**: 本リポジトリでは対応完了済み、別リポジトリでの対応が必要であることを明記
- [x] **論理的な矛盾がない**: Planning Documentの調査結果と一致

### 本リポジトリでの結論

**本リポジトリ（ai-workflow-agent）での実装は不要です。**

- すべてのJenkinsジョブが既に`ec2-fleet-micro`に更新済み
- Issue #454で指定されているジョブカテゴリは別リポジトリに配置されている
- 推奨アクション: Issueのクローズまたは移動

---

## 関連Issue

- **Issue #435**: ai-workflowパイプラインのラベル変更（完了済み、本Issue #454の前提）

---

*この要件定義書はPhase 1で作成されました。*
*作成日: 2025-01-21*
