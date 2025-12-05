# シードジョブテスト手順

## 概要

このドキュメントは、Issue #238（Jenkins Job用Jenkinsfileのディレクトリ再配置）の実装後に、シードジョブを実行してジョブ生成を検証するための手動テスト手順書です。

## 前提条件

テスト実行前に以下の条件が満たされていることを確認してください：

- [ ] Jenkinsにシードジョブ `Admin_Jobs/ai-workflow-job-creator` が登録されている
- [ ] DSLファイルの `scriptPath` 更新が完了している（各DSLファイルが新パスを参照）
- [ ] 各Jenkinsfileが正しいディレクトリに配置されている（`jenkins/jobs/pipeline/ai-workflow/{mode}/Jenkinsfile`）
- [ ] 変更がGitリポジトリにコミット・プッシュされている
- [ ] Jenkins環境にアクセス可能（認証情報を準備）
- [ ] ローカルで `validate_dsl.sh` スクリプトが正常に実行される

## 事前検証

### ローカル検証スクリプトの実行

Jenkinsでテストする前に、ローカルでDSL検証スクリプトを実行してください：

```bash
cd jenkins/jobs/dsl/ai-workflow/
./validate_dsl.sh
```

**期待結果**: `=== ✓ All validations passed ===` が表示される

すべての検証がパスしない場合、Jenkins統合テストを実行しないでください。

---

## テスト手順

### 1. シードジョブの実行

#### 手順 1.1: Jenkinsへのアクセス

1. Jenkins UIにアクセスする（例: `https://jenkins.example.com`）
2. 認証情報を入力してログイン
3. ホーム画面が表示されることを確認

#### 手順 1.2: シードジョブの選択

1. 左サイドバーから `Admin_Jobs` フォルダをクリック
2. `ai-workflow-job-creator` ジョブを選択
3. ジョブ詳細画面が表示されることを確認

#### 手順 1.3: ビルドの実行

1. 「ビルド」ボタンをクリック（パラメータなし）
2. ビルド履歴に新しいビルド番号が表示される
3. ビルド番号をクリックして詳細画面を開く
4. 「Console Output」をクリックしてビルドログを表示

#### 手順 1.4: ビルド実行の監視

ビルドログをリアルタイムで確認します：

**確認項目**:
- [ ] ビルドが開始された（`Started by user ...` メッセージ）
- [ ] DSLスクリプトの処理が開始された
- [ ] 以下のメッセージが表示される：
  ```
  Processing DSL script ai_workflow_all_phases_job.groovy
  Processing DSL script ai_workflow_preset_job.groovy
  Processing DSL script ai_workflow_single_phase_job.groovy
  Processing DSL script ai_workflow_rollback_job.groovy
  Processing DSL script ai_workflow_auto_issue_job.groovy
  ```
- [ ] エラーメッセージが**表示されない**
- [ ] ビルドが完了する（約30秒〜1分）

#### 手順 1.5: ビルド結果の確認

**期待される結果**:
- **ビルドステータス**: SUCCESS（青色アイコン）
- **終了コード**: 0
- **ビルドログに以下のエラーメッセージが含まれない**:
  - `Jenkinsfile not found`
  - `scriptPath resolution failed`
  - `File does not exist`
  - `ERROR: script not found at ...`

**失敗した場合**: トラブルシューティングセクションを参照

---

### 2. ジョブ生成の確認

#### 手順 2.1: フォルダ一覧の確認

1. Jenkins ホーム画面に戻る
2. `AI_Workflow` フォルダを開く
3. 以下の10個のフォルダが存在することを確認：

**確認項目**:
- [ ] `develop` フォルダ
- [ ] `stable-1` フォルダ
- [ ] `stable-2` フォルダ
- [ ] `stable-3` フォルダ
- [ ] `stable-4` フォルダ
- [ ] `stable-5` フォルダ
- [ ] `stable-6` フォルダ
- [ ] `stable-7` フォルダ
- [ ] `stable-8` フォルダ
- [ ] `stable-9` フォルダ

**期待されるフォルダ数**: 10個

#### 手順 2.2: 各フォルダ内のジョブ確認

各フォルダ（例: `develop`）を開き、以下の5つのジョブが存在することを確認します：

**確認項目**（`develop` フォルダ）:
- [ ] `all_phases` ジョブ
- [ ] `preset` ジョブ
- [ ] `single_phase` ジョブ
- [ ] `rollback` ジョブ
- [ ] `auto_issue` ジョブ

同様に、他のフォルダ（`stable-1` 〜 `stable-9`）でも5つのジョブが存在することを確認します。

**期待される総ジョブ数**: **50個**（10フォルダ × 5モード）

---

### 3. scriptPath設定の確認

各ジョブのJenkinsfile参照（scriptPath）が正しいパスを指していることを確認します。

#### 手順 3.1: All Phases Jobの設定確認

1. `AI_Workflow/develop/all_phases` を選択
2. 「設定」（Configure）ボタンをクリック
3. 「Pipeline」セクションまでスクロール

**確認項目**:
- [ ] **Definition**: Pipeline script from SCM
- [ ] **SCM**: Git
- [ ] **Repository URL**: `https://github.com/tielec/ai-workflow-agent.git`
- [ ] **Credentials**: 適切な認証情報が設定されている
- [ ] **Branch Specifier**: `*/develop`
- [ ] **Script Path**: `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`

#### 手順 3.2: その他のジョブの設定確認

同様に、以下のジョブでも設定を確認します：

| ジョブ | 期待される Script Path |
|--------|----------------------|
| `AI_Workflow/develop/preset` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `AI_Workflow/develop/single_phase` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `AI_Workflow/develop/rollback` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `AI_Workflow/develop/auto_issue` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

**推奨**: 少なくとも各モード（5種類）について1つずつ確認してください。

#### 手順 3.3: 他のブランチ（stable-1等）での確認

`stable-1` フォルダから1つのジョブ（例: `all_phases`）を選択し、同様に設定を確認します：

**確認項目**:
- [ ] **Script Path**: `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`（モード別に正しい）
- [ ] **Branch Specifier**: `*/stable-1`（ブランチ指定のみが異なる）

---

### 4. ジョブ実行テスト（Jenkinsfileロード確認）

生成されたジョブを実際にビルドして、Jenkinsfileが正常にロードされることを検証します。

**注意**: この手順は**オプション**です。本番環境での実行を避けるため、DRY_RUNモードで実行することを推奨します。

#### 手順 4.1: All Phases Jobのドライラン実行

1. `AI_Workflow/develop/all_phases` を選択
2. 「Build with Parameters」をクリック

#### 手順 4.2: ビルドパラメータの設定

以下のパラメータを設定します：

| パラメータ名 | 値 | 説明 |
|-------------|---|------|
| `ISSUE_URL` | `https://github.com/tielec/ai-workflow-agent/issues/238` | テスト対象のIssue |
| `DRY_RUN` | `true` | ドライランモード（実際の処理は実行しない） |
| その他のパラメータ | デフォルト値を使用 | 各ジョブの既定値 |

#### 手順 4.3: ビルドの開始と監視

1. 「ビルド」ボタンをクリック
2. ビルドログを開く（Console Output）
3. ログの最初の数行を確認

**期待される結果**:

ビルドログの最初の方に以下のようなメッセージが表示される：

```
Obtained jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile from git https://github.com/tielec/ai-workflow-agent.git
```

**確認項目**:
- [ ] Jenkinsfileが正常にロードされる（上記メッセージが表示される）
- [ ] エラーメッセージが**表示されない**：
  - `Jenkinsfile not found`
  - `ERROR: script not found at jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
  - `hudson.plugins.git.GitException`
- [ ] パイプライン処理が開始される（DRY_RUNのため、実際の処理は実行されないが、ロードは成功）

#### 手順 4.4: オプション - 他のジョブでの確認

`preset` ジョブでも同様にドライランビルドを実行し、Jenkinsfileが正常にロードされることを確認してください。

---

## テスト完了条件

すべてのテスト手順が完了し、以下の条件がすべて満たされている場合、テストは成功です：

- [x] シードジョブが正常に完了した（ビルドステータス: SUCCESS、EXIT CODE 0）
- [x] 10個のフォルダが生成された（`develop`, `stable-1` 〜 `stable-9`）
- [x] 各フォルダ内に5つのジョブが存在する（`all_phases`, `preset`, `single_phase`, `rollback`, `auto_issue`）
- [x] 総ジョブ数が50個である
- [x] ビルドログにエラーメッセージがない
- [x] すべてのDSLスクリプトが正常に処理された
- [x] 各ジョブの `scriptPath` が正しいパスを参照している
- [x] （オプション）ドライランビルドでJenkinsfileが正常にロードされた

---

## トラブルシューティング

### 問題1: シードジョブが失敗する（BUILD FAILURE）

**症状**: シードジョブのビルドがFAILUREで終了する

**原因候補**:
1. DSLファイルにGroovy構文エラーがある
2. scriptPathが間違っている
3. Jenkinsfileが存在しない

**対策**:

1. **ビルドログでエラーメッセージを確認**:
   ```
   ERROR: script not found at jenkins/jobs/pipeline/ai-workflow/{mode}/Jenkinsfile
   ```
   このエラーが表示される場合、Jenkinsfileが正しい場所に配置されていません。

2. **ローカルで検証スクリプトを実行**:
   ```bash
   ./jenkins/jobs/dsl/ai-workflow/validate_dsl.sh
   ```
   すべての検証がパスすることを確認してください。

3. **DSLファイルの scriptPath を再確認**:
   ```bash
   grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   各DSLファイルが正しいパスを参照しているか確認してください。

4. **Jenkinsfileの存在確認**:
   ```bash
   ls -la jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile
   ```
   5つのJenkinsfileがすべて存在することを確認してください。

---

### 問題2: ジョブは生成されるが、scriptPathが正しくない

**症状**: 50ジョブは生成されるが、ジョブ設定のScript Pathが旧パスを参照している

**原因候補**:
1. DSLファイルの更新が反映されていない
2. 変更がコミット・プッシュされていない
3. Jenkinsがキャッシュを使用している

**対策**:

1. **DSLファイルを再確認**:
   ```bash
   grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   scriptPathが更新されているか確認してください。

2. **変更をリモートにプッシュ**:
   ```bash
   git status
   git push origin <branch-name>
   ```

3. **シードジョブを再実行**:
   古いキャッシュをクリアするため、シードジョブを再度実行してください。

---

### 問題3: Jenkinsfileが見つからない（ジョブ実行時）

**症状**: ジョブをビルドすると「Jenkinsfile not found」エラーが発生

**原因候補**:
1. Jenkinsfileが正しく移動されていない
2. scriptPathのパスが間違っている
3. Gitブランチが間違っている

**対策**:

1. **ローカルでファイル存在を確認**:
   ```bash
   ls jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile
   ```

2. **ジョブ設定のScript Pathを確認**:
   ジョブの「設定」画面で、Script Pathが正しいか確認してください。

3. **ジョブ設定のBranch Specifierを確認**:
   ブランチ名が正しいか確認してください（例: `*/develop`, `*/stable-1`）。

4. **Gitリポジトリに変更がプッシュされているか確認**:
   ```bash
   git log --oneline -5
   ```
   Issue #238の変更コミットがプッシュされていることを確認してください。

---

### 問題4: Git履歴が追跡できない

**症状**: `git log --follow` でファイル履歴が表示されない

**原因候補**:
1. `git mv` ではなく通常の移動（`mv` + `git add`）を使用した
2. ファイル内容が大幅に変更された

**対策**:

1. **Git履歴の確認**:
   ```bash
   git log --follow --oneline jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   ```
   移動前のコミット履歴が表示されるか確認してください。

2. **ロールバックして再実行**:
   履歴が保持されていない場合、`git revert`でロールバックし、`git mv`を使用して再実装してください。

---

## 参考情報

### 関連ドキュメント

- Planning Document: `.ai-workflow/issue-238/00_planning/output/planning.md`
- 要件定義書: `.ai-workflow/issue-238/01_requirements/output/requirements.md`
- 設計書: `.ai-workflow/issue-238/02_design/output/design.md`
- テストシナリオ: `.ai-workflow/issue-238/03_test_scenario/output/test-scenario.md`
- 実装完了レポート: `.ai-workflow/issue-238/04_implementation/output/implementation.md`

### 検証スクリプト

- DSL検証スクリプト: `jenkins/jobs/dsl/ai-workflow/validate_dsl.sh`

### 移動されたJenkinsfile一覧

| 移動元 | 移動先 |
|--------|--------|
| `jenkins/Jenkinsfile.all-phases` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `jenkins/Jenkinsfile.preset` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `jenkins/Jenkinsfile.single-phase` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `jenkins/Jenkinsfile.rollback` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `jenkins/Jenkinsfile.auto-issue` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

### DSLファイルと対応するscriptPath

| DSLファイル | scriptPath |
|------------|------------|
| `ai_workflow_all_phases_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `ai_workflow_preset_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `ai_workflow_single_phase_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `ai_workflow_rollback_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `ai_workflow_auto_issue_job.groovy` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

---

**ドキュメント作成者**: AI Workflow Agent
**作成日**: 2025-01-30
**Issue**: #238 - Jenkins Job用Jenkinsfileを適切なディレクトリに配置
**レビュー状態**: 初回作成完了
