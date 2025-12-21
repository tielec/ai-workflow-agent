# 詳細設計書: Issue #454

## 全Jenkins Jobsのagentラベルをec2-fleet-microに統一

**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/454
**作成日**: 2025-01-21
**ステータス**: 本リポジトリでは実装対象なし（対応完了済み）

---

## 0. Planning Document・要件定義書の確認結果

### 前フェーズでの調査結論

Planning PhaseおよびRequirements Phaseで以下が確認されています：

| 項目 | 結果 |
|------|------|
| **本リポジトリの状態** | 全Jenkinsジョブが既に`ec2-fleet-micro`に更新済み（Issue #435で対応完了） |
| **Issueで指定されたジョブ** | Admin_Jobs、delivery-management-jobs等は**別リポジトリ**に配置 |
| **本リポジトリでの実装** | 不要 |

### 本リポジトリのJenkinsファイル確認結果

以下の9ファイルすべてで`label 'ec2-fleet-micro'`が設定済みであることを確認：

| ファイルパス | 設定状態 |
|-------------|----------|
| `Jenkinsfile` (ルート) | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` | ✅ `ec2-fleet-micro` |
| `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` | ✅ `ec2-fleet-micro` |

### 対象ジョブカテゴリの配置確認

Issue #454で指定されている以下のジョブカテゴリは本リポジトリに存在しないことを確認：

- ❌ `Admin_Jobs` - 本リポジトリに存在しない
- ❌ `delivery-management-jobs` - 本リポジトリに存在しない
- ❌ `Infrastructure_Management` - 本リポジトリに存在しない
- ❌ `Code_Quality_Checker` - 本リポジトリに存在しない
- ❌ `Document_Generator` - 本リポジトリに存在しない

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Jenkins CI/CD Infrastructure                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EC2 Fleet Agent Pool                              │   │
│  │  ┌─────────────────────┐    ┌─────────────────────┐                 │   │
│  │  │   ec2-fleet-micro   │    │     ec2-fleet       │                 │   │
│  │  │  (軽量ジョブ向け)   │    │   (重量ジョブ向け)  │                 │   │
│  │  │                     │    │                     │                 │   │
│  │  │  - t3.micro/small   │    │  - t3.medium/large  │                 │   │
│  │  │  - コスト最適化     │    │  - リソース重視     │                 │   │
│  │  └─────────────────────┘    └─────────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Jenkins Jobs                                 │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  ai-workflow-agent リポジトリ (本リポジトリ)                   │  │   │
│  │  │  ✅ 全ジョブが ec2-fleet-micro に更新済み (Issue #435)         │  │   │
│  │  │                                                               │  │   │
│  │  │  - ai-workflow-all-phases                                     │  │   │
│  │  │  - ai-workflow-single-phase                                   │  │   │
│  │  │  - ai-workflow-preset                                         │  │   │
│  │  │  - ai-workflow-finalize                                       │  │   │
│  │  │  - ai-workflow-rollback                                       │  │   │
│  │  │  - ai-workflow-auto-issue                                     │  │   │
│  │  │  - ai-workflow-pr-comment-execute                             │  │   │
│  │  │  - ai-workflow-pr-comment-finalize                            │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  別リポジトリ (Issue #454 の対象)                              │  │   │
│  │  │  ⚠️ 本リポジトリ外 - 変更対象外                                │  │   │
│  │  │                                                               │  │   │
│  │  │  - Admin_Jobs (6ジョブ)                                       │  │   │
│  │  │  - delivery-management-jobs (3ジョブ)                         │  │   │
│  │  │  - Infrastructure_Management (1ジョブ)                        │  │   │
│  │  │  - Code_Quality_Checker (4ジョブ)                             │  │   │
│  │  │  - Document_Generator (3ジョブ)                               │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

本リポジトリにおけるJenkinsジョブ構成：

```
ai-workflow-agent/
├── Jenkinsfile                          # ルートJenkinsfile (ec2-fleet-micro ✅)
├── jenkins/
│   ├── jobs/
│   │   ├── dsl/
│   │   │   └── ai-workflow/             # Job DSL定義
│   │   │       ├── ai_workflow_all_phases_job.groovy
│   │   │       ├── ai_workflow_single_phase_job.groovy
│   │   │       ├── ai_workflow_preset_job.groovy
│   │   │       ├── ai_workflow_finalize_job.groovy
│   │   │       ├── ai_workflow_rollback_job.groovy
│   │   │       ├── ai_workflow_auto_issue_job.groovy
│   │   │       ├── ai_workflow_pr_comment_execute_job.groovy
│   │   │       └── ai_workflow_pr_comment_finalize_job.groovy
│   │   └── pipeline/
│   │       └── ai-workflow/             # パイプライン定義
│   │           ├── all-phases/Jenkinsfile     (ec2-fleet-micro ✅)
│   │           ├── single-phase/Jenkinsfile   (ec2-fleet-micro ✅)
│   │           ├── preset/Jenkinsfile         (ec2-fleet-micro ✅)
│   │           ├── finalize/Jenkinsfile       (ec2-fleet-micro ✅)
│   │           ├── rollback/Jenkinsfile       (ec2-fleet-micro ✅)
│   │           ├── auto-issue/Jenkinsfile     (ec2-fleet-micro ✅)
│   │           ├── pr-comment-execute/Jenkinsfile   (ec2-fleet-micro ✅)
│   │           └── pr-comment-finalize/Jenkinsfile  (ec2-fleet-micro ✅)
│   └── shared/
│       └── common.groovy                # 共通ライブラリ
└── ...
```

### 1.3 データフロー

```
[Issue #454 対応フロー]

本リポジトリ (ai-workflow-agent):
┌────────────────────────────────────────────────────────────────┐
│                     対応完了済み                                │
│                                                                │
│  Issue #435 ──→ 全Jenkinsfile更新 ──→ テスト完了 ──→ 完了     │
│                 (ec2-fleet-micro)                              │
└────────────────────────────────────────────────────────────────┘

別リポジトリ (対象ジョブ配置先):
┌────────────────────────────────────────────────────────────────┐
│                     対応未実施                                  │
│                                                                │
│  Issue #454 ──→ 対象リポジトリ特定 ──→ Job DSL修正 ──→        │
│                                         Jenkinsfile修正 ──→    │
│                                         Seed Job実行 ──→ 完了  │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. 実装戦略判断

### 実装戦略: N/A（本リポジトリでは実装対象なし）

**判断根拠**:
- 本リポジトリ（ai-workflow-agent）の全Jenkinsジョブは既にIssue #435で`ec2-fleet-micro`に更新済み
- 本リポジトリにはIssue #454で指定されているジョブカテゴリ（Admin_Jobs、delivery-management-jobs等）が存在しない
- コード変更は不要であり、実装戦略の選択は不要

**参考: 別リポジトリで実施する場合の実装戦略**:

### 実装戦略: REFACTOR

**判断根拠**:
- 既存の`.groovy`ファイルと`Jenkinsfile`の修正のみ
- 単純な文字列置換（`label 'ec2-fleet'` → `label 'ec2-fleet-micro'`）
- 新規ファイルの作成は不要
- ロジック変更なし、設定値の変更のみ

---

## 3. テスト戦略判断

### テスト戦略: N/A（本リポジトリではテスト対象なし）

**判断根拠**:
- 本リポジトリでのコード変更がないため、テスト実施は不要
- 本リポジトリのJenkinsジョブはIssue #435で動作確認済み

**参考: 別リポジトリで実施する場合のテスト戦略**:

### テスト戦略: INTEGRATION_ONLY

**判断根拠**:
- 設定値の変更のみであり、ユニットテストは不要
- Seed Job実行によるジョブ設定反映確認が必要
- 各カテゴリの代表ジョブで実際のビルド実行確認が必要
- `ec2-fleet-micro`ラベルでエージェントが正しく割り当てられることの確認が必要
- BDDテストは過剰（単純な設定変更のため）

---

## 4. テストコード戦略判断

### テストコード戦略: N/A（テストコード作成不要）

**判断根拠**:
- 本リポジトリでのコード変更がないため、テストコード作成は不要
- 別リポジトリで実施する場合も、設定値の変更のみであり、テストコード作成は不要
- Jenkins設定の変更はJenkins上での手動確認または既存のCI/CDパイプラインで検証

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### 本リポジトリ（ai-workflow-agent）

| 影響項目 | 状態 |
|----------|------|
| **Jenkinsfile修正** | 不要（既に更新済み） |
| **Job DSL修正** | 不要（対象なし） |
| **共通ライブラリ修正** | 不要 |
| **テストコード修正** | 不要 |

#### 別リポジトリ（参考）

| 影響項目 | 影響度 |
|----------|--------|
| **Job DSL (.groovy)** | 17ファイル修正 |
| **Jenkinsfile** | 17ファイル修正 |
| **合計** | 34ファイル修正 |

### 5.2 依存関係の変更

| 依存関係 | 変更有無 |
|----------|----------|
| **新規依存の追加** | なし |
| **既存依存の変更** | なし |
| **EC2 Fleet設定依存** | `ec2-fleet-micro`ラベルがEC2 Fleet設定で定義済みであること（前提条件、Issue #435で確認済み） |

### 5.3 マイグレーション要否

| マイグレーション項目 | 要否 |
|---------------------|------|
| **データベーススキーマ変更** | なし |
| **設定ファイルマイグレーション** | なし |
| **Jenkins再起動** | 不要（Seed Job実行で反映） |

---

## 6. 変更・追加ファイルリスト

### 6.1 本リポジトリ（ai-workflow-agent）

#### 新規作成ファイル

なし

#### 修正が必要な既存ファイル

なし（全ファイル更新済み）

#### 削除が必要なファイル

なし

### 6.2 別リポジトリ（参考）

#### 修正が必要な既存ファイル（34ファイル）

##### Admin_Jobs (12ファイル)
| ファイルパス | 修正内容 |
|-------------|----------|
| `Admin_Jobs/Backup_Config/job.groovy` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `Admin_Jobs/Backup_Config/Jenkinsfile` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `Admin_Jobs/Github_Webhooks_Setting/job.groovy` | 同上 |
| `Admin_Jobs/Github_Webhooks_Setting/Jenkinsfile` | 同上 |
| `Admin_Jobs/Restore_Config/job.groovy` | 同上 |
| `Admin_Jobs/Restore_Config/Jenkinsfile` | 同上 |
| `Admin_Jobs/SSM_Parameter_Backup/job.groovy` | 同上 |
| `Admin_Jobs/SSM_Parameter_Backup/Jenkinsfile` | 同上 |
| `Admin_Jobs/SSM_Parameter_Restore/job.groovy` | 同上 |
| `Admin_Jobs/SSM_Parameter_Restore/Jenkinsfile` | 同上 |
| `Admin_Jobs/Test_EC2_Fleet_Agent/job.groovy` | 同上 |
| `Admin_Jobs/Test_EC2_Fleet_Agent/Jenkinsfile` | 同上 |

##### delivery-management-jobs (6ファイル)
| ファイルパス | 修正内容 |
|-------------|----------|
| `delivery-management-jobs/pulumi-dashboard/job.groovy` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `delivery-management-jobs/pulumi-dashboard/Jenkinsfile` | 同上 |
| `delivery-management-jobs/ssm-parameter-store-dashboard/job.groovy` | 同上 |
| `delivery-management-jobs/ssm-parameter-store-dashboard/Jenkinsfile` | 同上 |
| `delivery-management-jobs/lambda-verification/job.groovy` | 同上 |
| `delivery-management-jobs/lambda-verification/Jenkinsfile` | 同上 |

##### Infrastructure_Management (2ファイル)
| ファイルパス | 修正内容 |
|-------------|----------|
| `Infrastructure_Management/Shutdown_Jenkins_Environment/job.groovy` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `Infrastructure_Management/Shutdown_Jenkins_Environment/Jenkinsfile` | 同上 |

##### Code_Quality_Checker (8ファイル)
| ファイルパス | 修正内容 |
|-------------|----------|
| `Code_Quality_Checker/pr-complexity-analyzer-github-trigger/job.groovy` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `Code_Quality_Checker/pr-complexity-analyzer-github-trigger/Jenkinsfile` | 同上 |
| `Code_Quality_Checker/rust-code-analysis-check-github-trigger/job.groovy` | 同上 |
| `Code_Quality_Checker/rust-code-analysis-check-github-trigger/Jenkinsfile` | 同上 |
| `Code_Quality_Checker/rust-code-analysis-check/job.groovy` | 同上 |
| `Code_Quality_Checker/rust-code-analysis-check/Jenkinsfile` | 同上 |
| `Code_Quality_Checker/pr-complexity-analyzer/job.groovy` | 同上 |
| `Code_Quality_Checker/pr-complexity-analyzer/Jenkinsfile` | 同上 |

##### Document_Generator (6ファイル)
| ファイルパス | 修正内容 |
|-------------|----------|
| `Document_Generator/pull_request_comment_builder/job.groovy` | `label 'ec2-fleet'` → `label 'ec2-fleet-micro'` |
| `Document_Generator/pull_request_comment_builder/Jenkinsfile` | 同上 |
| `Document_Generator/multi_pull_request_comment_builder/job.groovy` | 同上 |
| `Document_Generator/multi_pull_request_comment_builder/Jenkinsfile` | 同上 |
| `Document_Generator/pull_request_comment_builder_github_trigger/job.groovy` | 同上 |
| `Document_Generator/pull_request_comment_builder_github_trigger/Jenkinsfile` | 同上 |

---

## 7. 詳細設計

### 7.1 本リポジトリでの詳細設計

**⚠️ 本リポジトリ（ai-workflow-agent）では実装対象がないため、詳細設計は不要です。**

### 7.2 参考: 別リポジトリでの詳細設計

#### 7.2.1 修正パターン

##### Job DSL (.groovyファイル)

```groovy
// 修正前
pipelineJob('カテゴリ/ジョブ名') {
    definition {
        cpsScm {
            // ...
        }
    }
    // agent設定がJob DSL内にある場合
    label('ec2-fleet')
}

// 修正後
pipelineJob('カテゴリ/ジョブ名') {
    definition {
        cpsScm {
            // ...
        }
    }
    label('ec2-fleet-micro')
}
```

##### Jenkinsfile

```groovy
// 修正前
pipeline {
    agent {
        label 'ec2-fleet'
    }
    stages {
        // ...
    }
}

// 修正後
pipeline {
    agent {
        label 'ec2-fleet-micro'
    }
    stages {
        // ...
    }
}
```

#### 7.2.2 変更パターンの詳細

| パターン | 対象 | 検索文字列 | 置換文字列 |
|----------|------|-----------|-----------|
| Jenkinsfile agent設定 | Jenkinsfile | `label 'ec2-fleet'` | `label 'ec2-fleet-micro'` |
| Job DSL label設定 | job.groovy | `label('ec2-fleet')` | `label('ec2-fleet-micro')` |
| Job DSL label設定（別形式） | job.groovy | `label 'ec2-fleet'` | `label 'ec2-fleet-micro'` |

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

| 項目 | 対応状況 |
|------|----------|
| **Jenkins権限** | 既存のJenkins RBAC設定を使用（変更なし） |
| **リポジトリアクセス** | 既存のGitHub権限を使用（変更なし） |
| **AWS権限** | EC2 Fleet操作権限は既存設定を使用（変更なし） |

### 8.2 データ保護

| 項目 | 対応状況 |
|------|----------|
| **シークレット管理** | 変更なし（既存のAWS Secrets Manager/SSM Parameter Storeを使用） |
| **ログ出力** | 変更なし |

### 8.3 セキュリティリスクと対策

| リスク | 対策 |
|--------|------|
| **権限昇格** | 該当なし（agentラベル変更は権限に影響しない） |
| **リソース枯渇** | `ec2-fleet-micro`のスケーリング設定を事前確認 |

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

| 項目 | 期待値 | 対応 |
|------|--------|------|
| **ジョブ起動時間** | 現状と同等以上 | `ec2-fleet-micro`は軽量インスタンスのため起動が早い可能性あり |
| **ジョブ実行時間** | 現状と同等 | 軽量ジョブのため`ec2-fleet-micro`で十分 |

### 9.2 スケーラビリティ

| 項目 | 対応 |
|------|------|
| **同時実行数** | EC2 Fleet設定の`ec2-fleet-micro`プールの容量で制御 |
| **スケールアウト** | EC2 Fleetの自動スケーリング機能を使用 |

### 9.3 保守性

| 項目 | 対応 |
|------|------|
| **ロールバック** | Git revertで容易に復旧可能 |
| **変更履歴** | Gitコミット履歴で追跡可能 |
| **ドキュメント** | 本設計書および関連Issue（#435、#454）で記録 |

---

## 10. 実装の順序

### 10.1 本リポジトリ（ai-workflow-agent）

**⚠️ 本リポジトリでは実装対象がないため、実装順序は適用されません。**

推奨アクション：
1. Issue #454に「ai-workflow-agentリポジトリ分は完了済み（Issue #435で対応）」とコメント
2. 対象ジョブが配置されているリポジトリを特定
3. そのリポジトリで新規Issueを作成するか、Issue #454を移動

### 10.2 参考: 別リポジトリでの実装順序

```
Phase 1: 準備（0.5h）
├── Step 1-1: 対象ファイルの特定・現状確認
├── Step 1-2: バックアップ作成
└── Step 1-3: EC2 Fleet設定の確認

Phase 2: 実装（1.5h）
├── Step 2-1: Admin_Jobs修正（6ジョブ×2ファイル=12ファイル）
├── Step 2-2: delivery-management-jobs修正（3ジョブ×2ファイル=6ファイル）
├── Step 2-3: Infrastructure_Management修正（1ジョブ×2ファイル=2ファイル）
├── Step 2-4: Code_Quality_Checker修正（4ジョブ×2ファイル=8ファイル）
├── Step 2-5: Document_Generator修正（3ジョブ×2ファイル=6ファイル）
└── Step 2-6: コミット・プッシュ

Phase 3: 検証（0.5h）
├── Step 3-1: Seed Job実行
├── Step 3-2: 代表ジョブの動作確認
└── Step 3-3: エージェント割り当て確認
```

**並列実行可能なタスク**:
- Step 2-1 ～ Step 2-5 は独立したファイル修正のため並列実行可能

---

## 11. 品質ゲートチェックリスト（Phase 2）

### 必須要件

- [x] **実装戦略の判断根拠が明記されている**
  - 本リポジトリ: N/A（実装対象なし）
  - 別リポジトリ参考: REFACTOR（既存ファイルの設定値変更のみ）

- [x] **テスト戦略の判断根拠が明記されている**
  - 本リポジトリ: N/A（テスト対象なし）
  - 別リポジトリ参考: INTEGRATION_ONLY（設定変更の反映確認のみ）

- [x] **既存コードへの影響範囲が分析されている**
  - 本リポジトリ: 影響なし（全ファイル更新済み）
  - 別リポジトリ: 34ファイルの修正が必要

- [x] **変更が必要なファイルがリストアップされている**
  - 本リポジトリ: 変更ファイルなし
  - 別リポジトリ: セクション6.2に34ファイルを列挙

- [x] **設計が実装可能である**
  - 本リポジトリ: 実装不要（既に完了）
  - 別リポジトリ: 単純な文字列置換で実装可能

---

## 12. 結論と推奨アクション

### 12.1 本リポジトリ（ai-workflow-agent）での結論

**本リポジトリでの実装は不要です。**

理由：
1. 全Jenkinsジョブ（9ファイル）が既にIssue #435で`ec2-fleet-micro`に更新済み
2. Issue #454で指定されているジョブカテゴリ（Admin_Jobs等17ジョブ）は本リポジトリに存在しない
3. 追加のコード変更、テスト実施、テストコード作成はすべて不要

### 12.2 推奨アクション

| アクション | 優先度 | 担当 |
|------------|--------|------|
| Issue #454に完了報告コメント | 高 | 本タスク実行者 |
| 対象リポジトリの特定 | 高 | Issue作成者またはインフラチーム |
| 別リポジトリでのIssue作成または移動 | 中 | Issue作成者 |

### 12.3 Issue #454へのコメント案

```markdown
## 調査結果

ai-workflow-agentリポジトリを調査した結果、以下のことが判明しました：

### 本リポジトリの状況
- **すべてのJenkinsジョブが既に`ec2-fleet-micro`に更新済み**（Issue #435で対応完了）
- 対象ジョブ: 9ファイル（Jenkinsfile）

### Issue記載のジョブカテゴリについて
以下のカテゴリは**本リポジトリには存在しません**：
- Admin_Jobs
- delivery-management-jobs
- Infrastructure_Management
- Code_Quality_Checker
- Document_Generator

これらのジョブは別リポジトリに配置されていると思われます。

### 推奨アクション
1. 対象ジョブが配置されているリポジトリを特定
2. そのリポジトリで新規Issueを作成するか、本Issueを移動

本リポジトリ分の対応は完了済みのため、ai-workflow-agentリポジトリでの追加対応は不要です。
```

---

## 関連Issue

- **Issue #435**: ai-workflowパイプラインのラベル変更（完了済み、本Issue #454の前提）
- **Issue #454**: 全Jenkins Jobsのagentラベルをec2-fleet-microに統一（本設計書の対象Issue）

---

*この詳細設計書はPhase 2で作成されました。*
*作成日: 2025-01-21*
