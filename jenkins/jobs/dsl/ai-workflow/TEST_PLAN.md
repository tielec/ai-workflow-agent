# AI Workflow Jobs - Test Plan

**Issue**: #453
**Test Strategy**: INTEGRATION_ONLY (Jenkins環境での統合テストのみ)
**Test Execution**: Manual testing in Jenkins environment
**Last Updated**: 2025-01-17

**Security Enhancement (Issue #462)**:
Job DSL パラメータが Non-Stored Password Parameter に変更され、個人情報・機密情報の保護が強化されました。詳細は [Issue #462](https://github.com/tielec/ai-workflow-agent/issues/462) を参照。

---

## テスト概要

このテストプランは、AI Workflow Orchestratorジョブを実行モードごとに分割したジョブ（5つ）の統合テストを定義します。

### テスト対象ジョブ
1. `AI_Workflow/{repository-name}/all_phases` - 全フェーズ一括実行
2. `AI_Workflow/{repository-name}/preset` - プリセット実行
3. `AI_Workflow/{repository-name}/single_phase` - 単一フェーズ実行
4. `AI_Workflow/{repository-name}/rollback` - フェーズ差し戻し実行
5. `AI_Workflow/{repository-name}/auto_issue` - 自動Issue作成

### テスト環境
- **Jenkins Version**: 2.426.1以上
- **Required Plugins**: Job DSL Plugin, Pipeline Plugin, Git Plugin, Credentials Plugin
- **Test Repository**: infrastructure-as-code, ai-workflow-agent
- **Execution Mode**: Manual testing with DRY_RUN=true

---

## 事前準備チェックリスト

実施日: ___________
実施者: ___________

- [ ] Jenkins環境が正常に動作している
- [ ] 5つのJob DSLファイルが`jenkins/jobs/dsl/ai-workflow/`に配置されている
  - [ ] `ai_workflow_all_phases_job.groovy`
  - [ ] `ai_workflow_preset_job.groovy`
  - [ ] `ai_workflow_single_phase_job.groovy`
  - [ ] `ai_workflow_rollback_job.groovy`
  - [ ] `ai_workflow_auto_issue_job.groovy`
- [ ] `job-config.yaml`に5つの新しいジョブ定義が追加されている
- [ ] `folder-config.yaml`に動的フォルダルールが追加されている
- [ ] `jenkinsManagedRepositories`に最低1つのリポジトリが登録されている
- [ ] GitHub Token（`github-token`）が設定されている

---

## Test Suite 1: シードジョブ実行テスト

### TC-001: シードジョブによるジョブ生成

**目的**: シードジョブを実行し、5つの新しいジョブが正しく生成されることを検証

**手順**:
1. Jenkinsにログイン
2. `Admin_Jobs/job-creator`ジョブに移動
3. 「Build Now」をクリックしてシードジョブを実行
4. ビルドログを確認

**期待結果**:
- [ ] シードジョブが成功（SUCCESS）で完了する
- [ ] ビルドログに「ERROR」「FAILED」の文字列が含まれない
- [ ] ビルド時間が5分以内である

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-002: リポジトリ別フォルダ構造の検証

**目的**: 複数のリポジトリに対して、それぞれ独立したフォルダとジョブが生成されることを検証

**手順**:
1. Jenkins Top画面に戻る
2. `AI_Workflow`フォルダを開く
3. 各リポジトリ名のサブフォルダが存在することを確認
4. 各サブフォルダを開き、5つのジョブが存在することを確認

**期待結果**:
- [ ] `AI_Workflow/infrastructure-as-code/`フォルダが存在する
- [ ] `AI_Workflow/ai-workflow-agent/`フォルダが存在する（登録されている場合）
- [ ] 各リポジトリフォルダに以下のジョブが存在する:
  - [ ] `all_phases` (displayName: "All Phases Execution")
  - [ ] `preset` (displayName: "Preset Execution")
  - [ ] `single_phase` (displayName: "Single Phase Execution")
  - [ ] `rollback` (displayName: "Rollback Execution")
  - [ ] `auto_issue` (displayName: "Auto Issue Creation")

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 2: パラメータ定義テスト

### TC-003: all_phasesジョブのパラメータ検証

**目的**: all_phasesジョブのパラメータが要件通りに定義されていることを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/all_phases`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータ一覧を確認

**期待結果** (パラメータ数: **14個**):

| パラメータ名 | 表示 | 型 | デフォルト値 |
|------------|------|-----|------------|
| ISSUE_URL | ✅ | String | (空文字) |
| BRANCH_NAME | ✅ | String | (空文字) |
| AGENT_MODE | ✅ | Choice | auto |
| DRY_RUN | ✅ | Boolean | false |
| SKIP_REVIEW | ✅ | Boolean | false |
| FORCE_RESET | ✅ | Boolean | false |
| MAX_RETRIES | ✅ | Choice | 3 |
| CLEANUP_ON_COMPLETE_FORCE | ✅ | Boolean | false |
| GIT_COMMIT_USER_NAME | ✅ | String | AI Workflow Bot |
| GIT_COMMIT_USER_EMAIL | ✅ | String | ai-workflow@example.com |
| AWS_ACCESS_KEY_ID | ✅ | String | (空文字) |
| AWS_SECRET_ACCESS_KEY | ✅ | NonStoredPassword | - |
| AWS_SESSION_TOKEN | ✅ | NonStoredPassword | - |
| COST_LIMIT_USD | ✅ | String | 5.0 |
| LOG_LEVEL | ✅ | Choice | INFO |

**表示されないパラメータ**:
- [ ] EXECUTION_MODE (内部的に固定値)
- [ ] PRESET
- [ ] START_PHASE
- [ ] ROLLBACK_*
- [ ] AUTO_ISSUE_*
- [ ] GITHUB_REPOSITORY

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-004: presetジョブのパラメータ検証

**目的**: presetジョブのパラメータが要件通りに定義されていることを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/preset`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータ一覧を確認

**期待結果** (パラメータ数: **15個**):
- [ ] TC-003のall_phases用14個のパラメータ + PRESET
- [ ] **PRESETパラメータ**が表示される（Choiceタイプ）
- [ ] PRESETの選択肢:
  - [ ] quick-fix
  - [ ] implementation
  - [ ] testing
  - [ ] review-requirements
  - [ ] review-design
  - [ ] review-test-scenario
  - [ ] finalize
- [ ] START_PHASE、ROLLBACK_*、AUTO_ISSUE_*が表示されない

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-005: single_phaseジョブのパラメータ検証

**目的**: single_phaseジョブのパラメータが要件通りに定義されていることを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/single_phase`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータ一覧を確認

**期待結果** (パラメータ数: **13個**):
- [ ] **START_PHASEパラメータ**が表示される（Choiceタイプ）
- [ ] START_PHASEの選択肢:
  - [ ] planning
  - [ ] requirements
  - [ ] design
  - [ ] test_scenario
  - [ ] implementation
  - [ ] test_implementation
  - [ ] testing
  - [ ] documentation
  - [ ] report
  - [ ] evaluation
- [ ] FORCE_RESETが表示されない
- [ ] CLEANUP_ON_COMPLETE_FORCEが表示されない
- [ ] PRESET、ROLLBACK_*、AUTO_ISSUE_*が表示されない

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-006: rollbackジョブのパラメータ検証

**目的**: rollbackジョブのパラメータが要件通りに定義されていることを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/rollback`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータ一覧を確認

**期待結果** (パラメータ数: **12個**):
- [ ] **ROLLBACK_TO_PHASEパラメータ**が表示される（Choiceタイプ）
- [ ] ROLLBACK_TO_PHASEの選択肢（evaluationは含まれない）:
  - [ ] implementation
  - [ ] planning
  - [ ] requirements
  - [ ] design
  - [ ] test_scenario
  - [ ] test_implementation
  - [ ] testing
  - [ ] documentation
  - [ ] report
- [ ] **ROLLBACK_TO_STEPパラメータ**が表示される（Choiceタイプ）
  - 選択肢: revise, execute, review
- [ ] **ROLLBACK_REASONパラメータ**が表示される（Textタイプ）
- [ ] **ROLLBACK_REASON_FILEパラメータ**が表示される（Stringタイプ）
- [ ] 以下が表示されない: PRESET、START_PHASE、AUTO_ISSUE_*、SKIP_REVIEW、FORCE_RESET、MAX_RETRIES、CLEANUP_ON_COMPLETE_FORCE

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-007: auto_issueジョブのパラメータ検証

**目的**: auto_issueジョブのパラメータが要件通りに定義されていることを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/auto_issue`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータ一覧を確認

**期待結果** (パラメータ数: **8個**):
- [ ] **GITHUB_REPOSITORYパラメータ**が表示される（Stringタイプ）
- [ ] **AUTO_ISSUE_CATEGORYパラメータ**が表示される（Choiceタイプ）
  - 選択肢: bug, refactor, enhancement, all
- [ ] **AUTO_ISSUE_LIMITパラメータ**が表示される（Stringタイプ、デフォルト: 5）
- [ ] **AUTO_ISSUE_SIMILARITY_THRESHOLDパラメータ**が表示される（Stringタイプ、デフォルト: 0.8）
- [ ] AGENT_MODE、DRY_RUN、COST_LIMIT_USD、LOG_LEVELが表示される
- [ ] 以下が表示されない: ISSUE_URL、BRANCH_NAME、PRESET、START_PHASE、ROLLBACK_*、SKIP_REVIEW、FORCE_RESET、MAX_RETRIES、CLEANUP_ON_COMPLETE_FORCE、GIT_COMMIT_*、AWS_*

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 3: EXECUTION_MODE設定テスト

### TC-008: all_phasesジョブのEXECUTION_MODE検証

**目的**: all_phasesジョブがEXECUTION_MODEを`all_phases`として内部的に設定することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/all_phases`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - ISSUE_URL: `https://github.com/tielec/infrastructure-as-code/issues/999` (ダミー)
   - DRY_RUN: `true`
   - その他はデフォルト
4. 「Build」をクリック
5. ビルドログを確認

**期待結果**:
- [ ] ビルドが開始される
- [ ] ビルドログに`EXECUTION_MODE=all_phases`と記録される (または環境変数として設定される)
- [ ] DRY_RUNモードのため、実際のAPI呼び出しは行わない
- [ ] ビルドが成功（SUCCESS）で完了する

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-009: 全ジョブのEXECUTION_MODE一斉検証

**目的**: 5つのジョブそれぞれが、正しいEXECUTION_MODEを設定していることを検証

**手順**: 各ジョブについて以下を実行
1. ジョブを開く
2. 「Build with Parameters」をクリック
3. 最小限のパラメータを入力（DRY_RUN=true）
4. ビルドを実行
5. ビルドログでEXECUTION_MODEの値を確認

**期待結果**:

| ジョブ名 | EXECUTION_MODE | ビルド結果 |
|---------|----------------|-----------|
| all_phases | all_phases | SUCCESS |
| preset | preset | SUCCESS |
| single_phase | single_phase | SUCCESS |
| rollback | rollback | SUCCESS |
| auto_issue | auto_issue | SUCCESS |

- [ ] all_phases: `EXECUTION_MODE=all_phases`
- [ ] preset: `EXECUTION_MODE=preset`
- [ ] single_phase: `EXECUTION_MODE=single_phase`
- [ ] rollback: `EXECUTION_MODE=rollback`
- [ ] auto_issue: `EXECUTION_MODE=auto_issue`

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 4: Jenkinsfile連携テスト

### TC-010: Jenkinsfile参照設定の検証

**目的**: 各ジョブが正しいJenkinsfile（ai-workflow-agentリポジトリ）を参照していることを検証

**手順**:
1. 各ジョブの設定画面（Configure）を開く
2. 「Pipeline」セクションを確認

**期待結果**:
- [ ] 「Pipeline script from SCM」が選択されている
- [ ] SCM: Git
- [ ] Repository URL: `https://github.com/tielec/ai-workflow-agent.git`
- [ ] Credentials: `github-token` (または適切なクレデンシャル)
- [ ] Branch: `*/main`
- [ ] Script Path: `Jenkinsfile`

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 5: Deprecated化テスト

### TC-011: 既存ジョブのDeprecated表示検証

**目的**: 既存のai_workflow_orchestratorジョブが非推奨として正しく表示されることを検証

**手順**:
1. 既存の`ai_workflow_orchestrator`ジョブを開く（存在する場合）
2. ジョブのdescription（説明文）を確認

**期待結果**:
- [ ] descriptionの冒頭に「⚠️ このジョブは非推奨です」と表示される
- [ ] 新しいジョブへの移行案内が表示される
- [ ] 5つの新しいジョブのパスが記載されている
- [ ] 削除予定日が明記されている
- [ ] ジョブは実行可能な状態である（後方互換性）

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 6: エンドツーエンドテスト（DRY_RUN）

### TC-012: all_phasesジョブの動作確認

**目的**: 実際のIssue URLを使用して、all_phasesジョブが正常に動作することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/all_phases`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - ISSUE_URL: `https://github.com/tielec/infrastructure-as-code/issues/999` (テスト用)
   - DRY_RUN: `true`
   - その他はデフォルト
4. ビルドを実行
5. ビルドログを確認

**期待結果**:
- [ ] ビルドが開始される
- [ ] Jenkinsfileがチェックアウトされる
- [ ] `EXECUTION_MODE=all_phases`が設定される
- [ ] DRY_RUNモードのため、実際の処理は行わないが、各フェーズのステップが表示される
- [ ] ビルドが成功（SUCCESS）で完了する
- [ ] ビルド時間が合理的な範囲内（DRY_RUNで数分以内）

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-013: presetジョブの動作確認

**目的**: presetジョブが正常に動作することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/preset`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - ISSUE_URL: `https://github.com/tielec/infrastructure-as-code/issues/999`
   - PRESET: `quick-fix`
   - DRY_RUN: `true`
4. ビルドを実行

**期待結果**:
- [ ] ビルドが成功（SUCCESS）で完了する
- [ ] `EXECUTION_MODE=preset`が設定される
- [ ] `PRESET=quick-fix`が設定される

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-014: single_phaseジョブの動作確認

**目的**: single_phaseジョブが正常に動作することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/single_phase`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - ISSUE_URL: `https://github.com/tielec/infrastructure-as-code/issues/999`
   - START_PHASE: `implementation`
   - DRY_RUN: `true`
4. ビルドを実行

**期待結果**:
- [ ] ビルドが成功（SUCCESS）で完了する
- [ ] `EXECUTION_MODE=single_phase`が設定される
- [ ] `START_PHASE=implementation`が設定される

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-015: rollbackジョブの動作確認

**目的**: rollbackジョブが正常に動作することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/rollback`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - ISSUE_URL: `https://github.com/tielec/infrastructure-as-code/issues/999`
   - ROLLBACK_TO_PHASE: `implementation`
   - ROLLBACK_TO_STEP: `revise`
   - ROLLBACK_REASON: `テストのための差し戻し`
   - DRY_RUN: `true`
4. ビルドを実行

**期待結果**:
- [ ] ビルドが成功（SUCCESS）で完了する
- [ ] `EXECUTION_MODE=rollback`が設定される
- [ ] `ROLLBACK_TO_PHASE=implementation`が設定される
- [ ] `ROLLBACK_TO_STEP=revise`が設定される

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

### TC-016: auto_issueジョブの動作確認

**目的**: auto_issueジョブが正常に動作することを検証

**手順**:
1. `AI_Workflow/infrastructure-as-code/auto_issue`ジョブを開く
2. 「Build with Parameters」をクリック
3. パラメータを入力:
   - GITHUB_REPOSITORY: `tielec/infrastructure-as-code`
   - AUTO_ISSUE_CATEGORY: `bug`
   - AUTO_ISSUE_LIMIT: `5`
   - AUTO_ISSUE_SIMILARITY_THRESHOLD: `0.8`
   - DRY_RUN: `true`
4. ビルドを実行

**期待結果**:
- [ ] ビルドが成功（SUCCESS）で完了する
- [ ] `EXECUTION_MODE=auto_issue`が設定される
- [ ] `GITHUB_REPOSITORY=tielec/infrastructure-as-code`が設定される
- [ ] ISSUE_URLが設定されていない（auto_issueでは不要）

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**備考**: ___________________________________________

---

## Test Suite 7: スケーラビリティテスト

### TC-017: 複数リポジトリでのジョブ生成

**目的**: リポジトリ数が増加した場合、シードジョブが正常に動作し、すべてのジョブが生成されることを検証

**手順**:
1. `jenkinsManagedRepositories`に複数のリポジトリが登録されていることを確認
2. シードジョブを実行
3. ビルド完了時間を記録
4. 生成されたジョブ数を確認

**期待結果**:
- [ ] シードジョブが成功（SUCCESS）で完了する
- [ ] ビルド時間が5分以内である
- [ ] 生成されたジョブ数 = リポジトリ数 × 5
- [ ] すべてのジョブが正常に生成される

**実行日**: ___________
**結果**: ✅ PASS / ❌ FAIL
**リポジトリ数**: _____
**ビルド時間**: _____分_____秒
**備考**: ___________________________________________

---

## テスト結果サマリー

### 実施状況

| Test Suite | テストケース数 | PASS | FAIL | 未実施 |
|-----------|--------------|------|------|--------|
| Suite 1: シードジョブ実行 | 2 | | | |
| Suite 2: パラメータ定義 | 5 | | | |
| Suite 3: EXECUTION_MODE設定 | 2 | | | |
| Suite 4: Jenkinsfile連携 | 1 | | | |
| Suite 5: Deprecated化 | 1 | | | |
| Suite 6: エンドツーエンド | 5 | | | |
| Suite 7: スケーラビリティ | 1 | | | |
| **合計** | **17** | | | |

### 成功率
- 成功率: _____% (PASS数 / 総テストケース数 × 100)

### 発見された問題

| 問題ID | 問題内容 | 重要度 | 対応状況 | 担当者 |
|--------|---------|--------|---------|--------|
| | | | | |

### 品質ゲート判定

- [ ] **全テストケースが実行された**
- [ ] **クリティカルな問題が0件**
- [ ] **成功率が90%以上**

**総合判定**: ✅ PASS / ❌ FAIL

---

## テスト実施時の注意事項

1. **DRY_RUNモードの使用**: 実際のAPI呼び出しを行わないため、外部サービスへの影響を最小化
2. **ダミーIssue URL**: テスト用のIssue URLを使用（例: #999）
3. **ログの確認**: EXECUTION_MODEが正しく渡されているかをログで必ず確認
4. **ビルド履歴の保持**: テスト実行後、ビルドログをスクリーンショットまたは保存
5. **並行実行の禁止**: テスト実行中は他のビルドを実行しない

---

## 次のステップ

このテストプランを実行した後:
1. テスト結果サマリーを記録
2. 発見された問題を記録
3. 品質ゲートの判定を行う
4. Phase 7（Documentation）に進む

---

**テストプラン作成者**: AI Workflow Agent
**レビュー待ち**: Phase 5 (Test Implementation) Review
