# テストシナリオ - Issue #238

**Issue番号**: #238
**タイトル**: Jenkins Job用Jenkinsfileを適切なディレクトリに配置
**作成日**: 2025-01-30
**ステータス**: テストシナリオ作成完了

---

## 0. Planning Documentの確認

Planning Document（`.ai-workflow/issue-238/00_planning/output/planning.md`）および設計書（`.ai-workflow/issue-238/02_design/output/design.md`）で策定された以下の戦略を踏まえてテストシナリオを作成：

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

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**INTEGRATION_ONLY**

### 1.2 判断根拠

設計書（セクション3）より：

1. **Unitテスト不要**: Groovyスクリプト（DSL）は文字列置換のみで、複雑なロジックがない
2. **Integration Test必須**: シードジョブ実行によるジョブ生成確認が唯一の検証方法
3. **BDD不要**: ユーザーストーリーが明確でなく、テクニカルな移行作業のため
4. **既存テスト不在**: jenkins/jobs/dsl/ にはテストコードが存在せず、手動検証が標準

### 1.3 テスト対象の範囲

| テスト種別 | 対象範囲 |
|-----------|---------|
| **Integration Test** | ✅ シードジョブ実行による50ジョブ生成確認 |
| **Integration Test** | ✅ DSLファイルとJenkinsfileの参照整合性確認 |
| **Integration Test** | ✅ Git履歴保持確認 |
| **Integration Test** | ✅ ジョブ設定の正確性確認 |
| **Unit Test** | ❌ 対象外（テスト戦略により除外） |
| **BDD Test** | ❌ 対象外（テスト戦略により除外） |

### 1.4 テストの目的

本テストシナリオの目的は以下の通り：

1. **Jenkinsfileの移動が正しく実行される**: 5つのJenkinsfileが指定されたディレクトリに移動され、Git履歴が保持されている
2. **DSL更新が正確である**: 5つのDSLファイルの`scriptPath`が新しいパスを正しく参照している
3. **シードジョブが正常に実行される**: DSL更新後、シードジョブが50ジョブを正常に生成できる
4. **生成されたジョブが正しい設定を持つ**: 各ジョブのJenkinsfile参照が正しいパスを指している
5. **ロールバックが可能である**: 問題発生時、Git revertで安全にロールバックできる

---

## 2. Integrationテストシナリオ

### シナリオ2.1: Jenkinsfileの移動とGit履歴保持確認

**目的**: `git mv`コマンドによるファイル移動が正しく実行され、Git履歴が保持されることを検証

**前提条件**:
- 移動対象の5つのJenkinsfileが `jenkins/` 直下に存在する
- Gitリポジトリが正常な状態である
- 作業ブランチがチェックアウトされている

**テスト手順**:

1. **移動前の状態確認**
   ```bash
   ls -la jenkins/Jenkinsfile.*
   ```
   **期待結果**: 以下の5ファイルが存在する
   - `jenkins/Jenkinsfile.all-phases`
   - `jenkins/Jenkinsfile.preset`
   - `jenkins/Jenkinsfile.single-phase`
   - `jenkins/Jenkinsfile.rollback`
   - `jenkins/Jenkinsfile.auto-issue`

2. **移動前のGit履歴確認**
   ```bash
   git log --oneline jenkins/Jenkinsfile.all-phases | head -5
   ```
   **期待結果**: ファイルのコミット履歴が表示される

3. **ディレクトリ作成**
   ```bash
   mkdir -p jenkins/jobs/pipeline/ai-workflow/{all-phases,preset,single-phase,rollback,auto-issue}
   ```
   **期待結果**: 5つのディレクトリが作成される

4. **ファイル移動（git mv）**
   ```bash
   git mv jenkins/Jenkinsfile.all-phases jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   git mv jenkins/Jenkinsfile.preset jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile
   git mv jenkins/Jenkinsfile.single-phase jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile
   git mv jenkins/Jenkinsfile.rollback jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile
   git mv jenkins/Jenkinsfile.auto-issue jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile
   ```
   **期待結果**: エラーなく実行される

5. **Git状態確認**
   ```bash
   git status
   ```
   **期待結果**: 以下のような出力が表示される
   ```
   renamed: jenkins/Jenkinsfile.all-phases -> jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   renamed: jenkins/Jenkinsfile.preset -> jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile
   renamed: jenkins/Jenkinsfile.single-phase -> jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile
   renamed: jenkins/Jenkinsfile.rollback -> jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile
   renamed: jenkins/Jenkinsfile.auto-issue -> jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile
   ```

6. **移動後のファイル存在確認**
   ```bash
   ls -la jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile
   ```
   **期待結果**: 5つのJenkinsfileが移動先ディレクトリに存在する

7. **Git履歴の追跡確認**
   ```bash
   git log --follow --oneline jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile | head -5
   ```
   **期待結果**: 移動前のコミット履歴が表示される（手順2と同じ履歴）

8. **移動元の削除確認**
   ```bash
   ls jenkins/Jenkinsfile.* 2>/dev/null || echo "Old files removed"
   ```
   **期待結果**: `Old files removed` が表示される

**確認項目チェックリスト**:
- [ ] 5つのJenkinsfileが移動先に配置されている
- [ ] `git status`で5ファイルが`renamed`として表示される
- [ ] `git log --follow`で移動前の履歴が追跡可能
- [ ] 移動元（`jenkins/`直下）に旧Jenkinsfileが残っていない
- [ ] 各Jenkinsfileの内容が変更されていない（移動のみ）

---

### シナリオ2.2: DSLファイルのscriptPath更新確認

**目的**: 5つのDSLファイルの`scriptPath`が新しいパスを正しく参照していることを検証

**前提条件**:
- Jenkinsfileの移動が完了している（シナリオ2.1）
- DSLファイルが存在する
- 更新対象のDSLファイルが5個ある

**テスト手順**:

1. **更新前のscriptPath確認**
   ```bash
   grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   **期待結果**: 各DSLファイルに`scriptPath('Jenkinsfile')`が含まれている

2. **DSLファイル更新（各ファイル）**

   以下の5ファイルを更新:
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy`
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy`
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy`
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy`
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy`

   各ファイルの`scriptPath`行を以下のように更新:

   | DSLファイル | 更新後のscriptPath |
   |------------|-------------------|
   | `ai_workflow_all_phases_job.groovy` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile')` |
   | `ai_workflow_preset_job.groovy` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile')` |
   | `ai_workflow_single_phase_job.groovy` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile')` |
   | `ai_workflow_rollback_job.groovy` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile')` |
   | `ai_workflow_auto_issue_job.groovy` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile')` |

3. **更新後のscriptPath確認**
   ```bash
   grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   **期待結果**: 各DSLファイルが新しいパスを参照している

4. **Groovy構文チェック（オプション）**
   ```bash
   # Groovyがインストールされている場合
   for file in jenkins/jobs/dsl/ai-workflow/*.groovy; do
       echo "Checking $(basename $file)..."
       groovy -c "$file" 2>&1 || echo "Syntax error in $file"
   done
   ```
   **期待結果**: 構文エラーが発生しない

5. **scriptPathのファイル存在確認**
   ```bash
   # 各scriptPathで指定されたファイルが実際に存在するか確認
   for path in \
       "jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile" \
       "jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile" \
       "jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile" \
       "jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile" \
       "jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile"; do
       if [ -f "$path" ]; then
           echo "✓ $path exists"
       else
           echo "✗ $path NOT FOUND"
           exit 1
       fi
   done
   ```
   **期待結果**: 全ファイルが存在する

6. **他のパラメータの非変更確認**
   ```bash
   git diff jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   **期待結果**: `scriptPath`行のみが変更されている（`displayName`, `description`等は変更なし）

**確認項目チェックリスト**:
- [ ] 5つのDSLファイルすべてで`scriptPath`が更新されている
- [ ] 各`scriptPath`が正しいディレクトリパスを参照している
- [ ] Groovy構文エラーがない
- [ ] `scriptPath`で指定されたJenkinsfileが実際に存在する
- [ ] `scriptPath`以外のパラメータが変更されていない

---

### シナリオ2.3: README.mdディレクトリ構造更新確認

**目的**: `jenkins/README.md`のディレクトリ構造セクションが新しい構造を正確に反映していることを検証

**前提条件**:
- Jenkinsfileの移動が完了している（シナリオ2.1）
- `jenkins/README.md`が存在する

**テスト手順**:

1. **更新前のREADME確認**
   ```bash
   head -30 jenkins/README.md
   ```
   **期待結果**: 旧ディレクトリ構造が記載されている

2. **README.md更新**

   ディレクトリ構造セクション（7〜27行目付近）を新しい構造に更新

3. **更新後の差分確認**
   ```bash
   git diff jenkins/README.md
   ```
   **期待結果**: 以下の変更が含まれている
   - `ai-workflow/`ディレクトリセクションの追加
   - 5つのモード別サブディレクトリの記載
   - 各サブディレクトリ配下の`Jenkinsfile`の記載

4. **Markdown構文チェック**
   ```bash
   # マークダウンリンターがある場合
   # markdownlint jenkins/README.md
   ```
   **期待結果**: Markdown構文エラーがない

5. **ディレクトリ構造の正確性確認**

   README.mdに記載されたすべてのパスが実際に存在することを確認:
   ```bash
   # READMEに記載されたパスを抽出して確認（手動）
   cat jenkins/README.md | grep "Jenkinsfile"
   ```
   **期待結果**: 記載されたすべてのJenkinsfileパスが実際に存在する

**確認項目チェックリスト**:
- [ ] ディレクトリ構造セクションが更新されている
- [ ] `jenkins/jobs/pipeline/ai-workflow/`の構造が正確に記載されている
- [ ] 5つのモード別ディレクトリがすべて記載されている
- [ ] Markdown構文エラーがない
- [ ] 記載されたファイルパスがすべて実際に存在する

---

### シナリオ2.4: シードジョブによる50ジョブ生成確認

**目的**: DSL更新後、シードジョブを実行して50ジョブ（5モード × 10フォルダ）が正常に生成されることを検証

**前提条件**:
- Jenkinsfileの移動が完了している（シナリオ2.1）
- DSLファイルの更新が完了している（シナリオ2.2）
- 変更がGitにコミット・プッシュされている
- Jenkins環境にアクセス可能
- シードジョブ `Admin_Jobs/ai-workflow-job-creator` が登録されている

**テスト手順**:

1. **Jenkinsへのアクセス**

   Jenkins UIにアクセスし、認証を完了する

2. **シードジョブの実行**

   - `Admin_Jobs/ai-workflow-job-creator` を選択
   - 「ビルド」ボタンをクリック
   - ビルドが開始されることを確認

3. **ビルド実行の監視**

   - ビルドログをリアルタイムで確認
   - エラーメッセージがないことを確認
   - ビルド完了まで待機（約30秒〜1分）

4. **ビルド結果確認**

   **期待結果**: ビルドが SUCCESS で完了する（EXIT CODE 0）

5. **フォルダ生成確認**

   `AI_Workflow` フォルダを開き、以下の10フォルダが存在することを確認:
   - `develop`
   - `stable-1`
   - `stable-2`
   - `stable-3`
   - `stable-4`
   - `stable-5`
   - `stable-6`
   - `stable-7`
   - `stable-8`
   - `stable-9`

6. **各フォルダ内のジョブ確認**

   各フォルダ（例: `develop`）を開き、以下の5つのジョブが存在することを確認:
   - `all_phases`
   - `preset`
   - `single_phase`
   - `rollback`
   - `auto_issue`

7. **総ジョブ数の確認**

   **期待されるジョブ数**: 50個（10フォルダ × 5モード）

8. **ビルドログの詳細確認**

   シードジョブのビルドログで以下を確認:
   ```
   Processing DSL script ai_workflow_all_phases_job.groovy
   Processing DSL script ai_workflow_preset_job.groovy
   Processing DSL script ai_workflow_single_phase_job.groovy
   Processing DSL script ai_workflow_rollback_job.groovy
   Processing DSL script ai_workflow_auto_issue_job.groovy
   ```
   **期待結果**: すべてのDSLスクリプトが正常に処理される

9. **エラーログの確認**

   **期待結果**: 以下のようなエラーメッセージが**ない**ことを確認
   - `Jenkinsfile not found`
   - `scriptPath resolution failed`
   - `File does not exist`

**確認項目チェックリスト**:
- [ ] シードジョブが正常に完了した（SUCCESS）
- [ ] 10個のフォルダが生成された
- [ ] 各フォルダ内に5つのジョブが存在する
- [ ] 総ジョブ数が50個である
- [ ] ビルドログにエラーメッセージがない
- [ ] すべてのDSLスクリプトが正常に処理された

---

### シナリオ2.5: 生成されたジョブのscriptPath設定確認

**目的**: シードジョブで生成された各ジョブのJenkinsfile参照（scriptPath）が正しいパスを指していることを検証

**前提条件**:
- シードジョブが正常に完了している（シナリオ2.4）
- 50ジョブが生成されている

**テスト手順**:

1. **All Phases Jobの設定確認**

   - `AI_Workflow/develop/all_phases` を選択
   - 「設定」（Configure）を開く
   - 「Pipeline」セクションまでスクロール

   **確認項目**:
   - **Definition**: Pipeline script from SCM
   - **SCM**: Git
   - **Repository URL**: `https://github.com/tielec/ai-workflow-agent.git`
   - **Branch Specifier**: `*/develop` (または適切なブランチ)
   - **Script Path**: `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`

2. **Preset Jobの設定確認**

   - `AI_Workflow/develop/preset` を選択
   - 「設定」を開く
   - **Script Path**: `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` であることを確認

3. **Single Phase Jobの設定確認**

   - `AI_Workflow/develop/single_phase` を選択
   - 「設定」を開く
   - **Script Path**: `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` であることを確認

4. **Rollback Jobの設定確認**

   - `AI_Workflow/develop/rollback` を選択
   - 「設定」を開く
   - **Script Path**: `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` であることを確認

5. **Auto Issue Jobの設定確認**

   - `AI_Workflow/develop/auto_issue` を選択
   - 「設定」を開く
   - **Script Path**: `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` であることを確認

6. **他のフォルダでのサンプル確認**

   `stable-1` フォルダから1つのジョブ（例: `all_phases`）を選択し、同様に設定を確認

   **期待結果**: `scriptPath`が正しく、ブランチ指定のみが異なる（`*/stable-1`）

**確認項目チェックリスト**:
- [ ] `all_phases`のscriptPathが`jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
- [ ] `preset`のscriptPathが`jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile`
- [ ] `single_phase`のscriptPathが`jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile`
- [ ] `rollback`のscriptPathが`jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile`
- [ ] `auto_issue`のscriptPathが`jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile`
- [ ] すべてのジョブがSCMタイプ「Git」を使用している
- [ ] Repository URLが正しい

---

### シナリオ2.6: ジョブ実行テスト（Jenkinsfileロード確認）

**目的**: 生成されたジョブを実際にビルドして、Jenkinsfileが正常にロードされることを検証

**前提条件**:
- シードジョブが正常に完了している（シナリオ2.4）
- ジョブのscriptPath設定が正しい（シナリオ2.5）

**テスト手順**:

1. **All Phases Jobの実行**

   - `AI_Workflow/develop/all_phases` を選択
   - 「Build with Parameters」をクリック

2. **ビルドパラメータの設定**

   以下のパラメータを設定（DRY_RUNモードで実行）:
   - **ISSUE_URL**: `https://github.com/tielec/ai-workflow-agent/issues/238`
   - **DRY_RUN**: `true` （本番実行を避けるため）
   - その他のパラメータ: デフォルト値を使用

3. **ビルドの開始**

   「ビルド」ボタンをクリック

4. **Jenkinsfileロードの確認**

   ビルドログの最初の数行を確認:
   ```
   Obtained jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile from git https://github.com/tielec/ai-workflow-agent.git
   ```
   **期待結果**: Jenkinsfileが正常にロードされる

5. **エラーメッセージの確認**

   **期待結果**: 以下のようなエラーメッセージが**ない**ことを確認
   - `Jenkinsfile not found`
   - `ERROR: script not found at jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile`
   - `hudson.plugins.git.GitException`

6. **ビルドの進行確認**

   **期待結果**: Jenkinsfileのパイプライン処理が開始される（DRY_RUNのため、実際の処理は実行されないが、ロードは成功する）

7. **オプション: 他のジョブでの確認**

   `preset` ジョブでも同様にドライランビルドを実行し、Jenkinsfileが正常にロードされることを確認

**確認項目チェックリスト**:
- [ ] ビルドログに「Obtained ... Jenkinsfile」メッセージが表示される
- [ ] Jenkinsfileロードエラーが発生しない
- [ ] パイプライン処理が開始される
- [ ] ビルドが異常終了しない（Jenkinsfileロードの観点で）

---

### シナリオ2.7: Git履歴追跡の統合確認

**目的**: ファイル移動後も、Git履歴が正常に追跡可能であることを統合的に検証

**前提条件**:
- Jenkinsfileの移動が完了している（シナリオ2.1）
- 変更がコミットされている

**テスト手順**:

1. **移動後のファイル履歴確認**
   ```bash
   git log --follow --oneline jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   ```
   **期待結果**: 移動前のコミット履歴が表示される

2. **Blameによる変更者追跡**
   ```bash
   git blame jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile | head -10
   ```
   **期待結果**: 各行の変更者とコミットハッシュが表示される（移動前の情報も含む）

3. **移動前後の差分確認**
   ```bash
   # 移動コミットの差分を確認
   git show HEAD --stat
   ```
   **期待結果**: 5ファイルが `renamed` として表示される

4. **ファイル内容の非変更確認**
   ```bash
   # 移動前後でファイル内容が変わっていないことを確認
   git diff HEAD~1 HEAD -- jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   ```
   **期待結果**: 差分が表示されない（内容が同一）

5. **全ファイルの履歴追跡確認**

   5つのJenkinsfileすべてで `git log --follow` が機能することを確認:
   ```bash
   for mode in all-phases preset single-phase rollback auto-issue; do
       echo "=== $mode ==="
       git log --follow --oneline jenkins/jobs/pipeline/ai-workflow/$mode/Jenkinsfile | head -3
   done
   ```
   **期待結果**: すべてのファイルで履歴が表示される

**確認項目チェックリスト**:
- [ ] `git log --follow` で移動前の履歴が追跡可能
- [ ] `git blame` で各行の変更者が確認可能
- [ ] 移動コミットで5ファイルが `renamed` として記録されている
- [ ] ファイル内容が移動前後で変更されていない
- [ ] 5つのJenkinsfileすべてで履歴追跡が機能する

---

### シナリオ2.8: ロールバック可能性の確認

**目的**: 問題発生時、`git revert`で安全にロールバック可能であることを検証

**前提条件**:
- すべての変更が単一コミットで実施されている
- 変更コミットのハッシュが判明している

**テスト手順**:

1. **変更コミットの特定**
   ```bash
   git log --oneline -1
   ```
   **期待結果**: Issue #238の変更コミットが表示される
   ```
   abc1234 Reorganize Jenkinsfiles into appropriate directory structure (Issue #238)
   ```

2. **テストブランチの作成**
   ```bash
   git checkout -b test-rollback
   ```
   **期待結果**: テストブランチが作成される

3. **Revertの実行**
   ```bash
   git revert HEAD --no-edit
   ```
   **期待結果**: Revertコミットが作成される

4. **ロールバック後のファイル配置確認**
   ```bash
   ls jenkins/Jenkinsfile.*
   ```
   **期待結果**: 旧Jenkinsfileが復元されている
   - `jenkins/Jenkinsfile.all-phases`
   - `jenkins/Jenkinsfile.preset`
   - `jenkins/Jenkinsfile.single-phase`
   - `jenkins/Jenkinsfile.rollback`
   - `jenkins/Jenkinsfile.auto-issue`

5. **新ディレクトリの削除確認**
   ```bash
   ls jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile 2>/dev/null || echo "New files removed"
   ```
   **期待結果**: `New files removed` が表示される

6. **DSLファイルのscriptPath復元確認**
   ```bash
   grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy
   ```
   **期待結果**: すべてのDSLファイルが旧scriptPath `Jenkinsfile` を参照している

7. **README.mdの復元確認**
   ```bash
   git diff HEAD~1 jenkins/README.md
   ```
   **期待結果**: ディレクトリ構造が旧構造に戻っている

8. **テストブランチの削除**
   ```bash
   git checkout -
   git branch -D test-rollback
   ```
   **期待結果**: テストブランチが削除され、元のブランチに戻る

**確認項目チェックリスト**:
- [ ] `git revert`が正常に実行される
- [ ] 旧Jenkinsfileが `jenkins/` 直下に復元される
- [ ] 新ディレクトリのJenkinsfileが削除される
- [ ] DSLファイルのscriptPathが旧パスに戻る
- [ ] README.mdが旧ディレクトリ構造に戻る
- [ ] Revert後もGit履歴が保持されている

---

## 3. テストデータ

### 3.1 対象ファイル一覧

#### 移動対象Jenkinsfile（5個）

| ファイル名 | 移動元 | 移動先 |
|-----------|--------|--------|
| `Jenkinsfile.all-phases` | `jenkins/` | `jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile` |
| `Jenkinsfile.preset` | `jenkins/` | `jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile` |
| `Jenkinsfile.single-phase` | `jenkins/` | `jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile` |
| `Jenkinsfile.rollback` | `jenkins/` | `jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile` |
| `Jenkinsfile.auto-issue` | `jenkins/` | `jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile` |

#### 更新対象DSLファイル（5個）

| DSLファイル | 更新対象行 | 更新前 | 更新後 |
|------------|----------|--------|--------|
| `ai_workflow_all_phases_job.groovy` | scriptPath行 | `scriptPath('Jenkinsfile')` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile')` |
| `ai_workflow_preset_job.groovy` | scriptPath行 | `scriptPath('Jenkinsfile')` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile')` |
| `ai_workflow_single_phase_job.groovy` | scriptPath行 | `scriptPath('Jenkinsfile')` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile')` |
| `ai_workflow_rollback_job.groovy` | scriptPath行 | `scriptPath('Jenkinsfile')` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile')` |
| `ai_workflow_auto_issue_job.groovy` | scriptPath行 | `scriptPath('Jenkinsfile')` | `scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile')` |

### 3.2 期待されるジョブ生成結果

**総ジョブ数**: 50個（10フォルダ × 5モード）

**フォルダ一覧**（10個）:
- `develop`
- `stable-1` 〜 `stable-9`

**各フォルダ内のジョブ**（5個）:
- `all_phases`
- `preset`
- `single_phase`
- `rollback`
- `auto_issue`

### 3.3 テスト用パラメータ（ジョブ実行テスト用）

シナリオ2.6で使用するビルドパラメータ:

| パラメータ名 | 値 | 説明 |
|-------------|---|------|
| `ISSUE_URL` | `https://github.com/tielec/ai-workflow-agent/issues/238` | テスト対象のIssue |
| `DRY_RUN` | `true` | ドライランモード（実際の処理は実行しない） |
| その他 | デフォルト値 | 各ジョブの既定パラメータを使用 |

---

## 4. テスト環境要件

### 4.1 必要なローカル環境

| 項目 | 要件 | 備考 |
|------|------|------|
| **Git** | バージョン2.0以降 | `git mv`, `git log --follow`をサポート |
| **シェル** | Bash 4.0以降 | テストスクリプト実行用 |
| **エディタ** | 任意 | DSLファイル、README.md編集用 |
| **Groovy**（オプション） | 2.4以降 | DSL構文チェック用（任意） |

### 4.2 必要なJenkins環境

| 項目 | 要件 | 備考 |
|------|------|------|
| **Jenkins** | 2.300以降推奨 | Job DSL Pluginが動作する環境 |
| **Job DSL Plugin** | 1.77以降 | `scriptPath`パラメータサポート必須 |
| **Git Plugin** | 最新版推奨 | GitリポジトリからJenkinsfileを取得 |
| **シードジョブ** | `Admin_Jobs/ai-workflow-job-creator` | 既存シードジョブが登録済み |
| **認証情報** | GitHub認証情報設定済み | リポジトリアクセス用 |

### 4.3 ネットワーク要件

| 項目 | 要件 |
|------|------|
| **GitHub接続** | `https://github.com/tielec/ai-workflow-agent.git` にアクセス可能 |
| **Jenkins接続** | Jenkins UIにアクセス可能 |

### 4.4 テスト実行権限

| 項目 | 要件 |
|------|------|
| **Gitリポジトリ** | ブランチ作成、コミット、プッシュ権限 |
| **Jenkins** | シードジョブ実行権限、ジョブ設定閲覧権限 |

---

## 5. テスト実施スケジュール

### 5.1 推奨実施順序

```
Phase 4実装完了後
  ↓
シナリオ2.1: Jenkinsfile移動確認（10分）
  ↓
シナリオ2.2: DSL更新確認（15分）
  ↓
シナリオ2.3: README更新確認（10分）
  ↓
シナリオ2.7: Git履歴確認（10分）
  ↓
コミット・プッシュ
  ↓
シナリオ2.4: シードジョブ実行（30分）
  ↓
シナリオ2.5: ジョブ設定確認（20分）
  ↓
シナリオ2.6: ジョブ実行テスト（10分）
  ↓
シナリオ2.8: ロールバック確認（10分・オプション）
```

### 5.2 所要時間見積もり

| シナリオ | 所要時間 | 必須/オプション |
|---------|----------|----------------|
| 2.1: Jenkinsfile移動確認 | 10分 | 必須 |
| 2.2: DSL更新確認 | 15分 | 必須 |
| 2.3: README更新確認 | 10分 | 必須 |
| 2.4: シードジョブ実行 | 30分 | 必須 |
| 2.5: ジョブ設定確認 | 20分 | 必須 |
| 2.6: ジョブ実行テスト | 10分 | 必須 |
| 2.7: Git履歴確認 | 10分 | 必須 |
| 2.8: ロールバック確認 | 10分 | オプション |
| **合計** | **約1.5〜2時間** | - |

---

## 6. 異常系テストシナリオ

### シナリオ6.1: scriptPathが間違っている場合

**目的**: DSLファイルのscriptPathが間違っている場合、シードジョブがエラーを検出することを確認

**テスト手順**:

1. **意図的に間違ったscriptPathを設定**
   ```groovy
   // 例: ai_workflow_all_phases_job.groovy
   scriptPath('jenkins/jobs/pipeline/ai-workflow/WRONG-PATH/Jenkinsfile')
   ```

2. **シードジョブを実行**

3. **期待結果**: ビルドログにエラーメッセージが表示される
   ```
   ERROR: script not found at jenkins/jobs/pipeline/ai-workflow/WRONG-PATH/Jenkinsfile
   ```

4. **修正して再テスト**

   正しいscriptPathに修正し、シードジョブが成功することを確認

**確認項目**:
- [ ] 間違ったscriptPathでシードジョブがエラーになる
- [ ] エラーメッセージが明確である
- [ ] 修正後、正常に実行される

---

### シナリオ6.2: Jenkinsfileが移動されていない場合

**目的**: Jenkinsfileが移動されていない状態でDSLを更新すると、シードジョブがエラーになることを確認

**テスト手順**:

1. **Jenkinsfileを移動せずにDSLを更新**

   DSLファイルの`scriptPath`を新しいパスに変更するが、Jenkinsfileは移動しない

2. **シードジョブを実行**

3. **期待結果**: ビルドログにエラーメッセージが表示される
   ```
   ERROR: script not found at jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile
   ```

4. **Jenkinsfileを移動して再テスト**

**確認項目**:
- [ ] Jenkinsfile未移動の状態でシードジョブがエラーになる
- [ ] エラーメッセージが明確である
- [ ] Jenkinsfile移動後、正常に実行される

---

## 7. トラブルシューティングガイド

### 問題1: シードジョブが失敗する

**症状**: シードジョブのビルドがFAILUREで終了する

**原因候補**:
1. DSLファイルにGroovy構文エラーがある
2. scriptPathが間違っている
3. Jenkinsfileが存在しない

**対策**:
1. ビルドログでエラーメッセージを確認
2. `grep -n "scriptPath" jenkins/jobs/dsl/ai-workflow/*.groovy` で設定を確認
3. 各scriptPathで指定されたファイルが実際に存在するか確認

---

### 問題2: ジョブは生成されるが、scriptPathが正しくない

**症状**: 50ジョブは生成されるが、ジョブ設定のScript Pathが旧パスを参照している

**原因候補**:
1. DSLファイルの更新が反映されていない
2. 変更がコミット・プッシュされていない
3. Jenkinsがキャッシュを使用している

**対策**:
1. DSLファイルを再確認し、scriptPathが更新されているか確認
2. `git push` で変更をリモートにプッシュ
3. シードジョブを再実行

---

### 問題3: Jenkinsfileが見つからない

**症状**: ジョブをビルドすると「Jenkinsfile not found」エラーが発生

**原因候補**:
1. Jenkinsfileが正しく移動されていない
2. scriptPathのパスが間違っている
3. Gitブランチが間違っている

**対策**:
1. `ls jenkins/jobs/pipeline/ai-workflow/*/Jenkinsfile` でファイル存在を確認
2. ジョブ設定のScript Pathを確認
3. ジョブ設定のBranch Specifierを確認

---

### 問題4: Git履歴が追跡できない

**症状**: `git log --follow` でファイル履歴が表示されない

**原因候補**:
1. `git mv` ではなく通常の移動（`mv` + `git add`）を使用した
2. ファイル内容が大幅に変更された

**対策**:
1. ロールバックして `git mv` を使用し直す
2. ファイル内容を変更せず、移動のみを実行

---

## 8. 品質ゲート（Phase 3）チェックリスト

本テストシナリオは以下の品質ゲートを満たしている：

- [x] **Phase 2の戦略に沿ったテストシナリオである**: INTEGRATION_ONLYに準拠し、統合テストシナリオのみを作成
- [x] **主要な正常系がカバーされている**: シナリオ2.1〜2.7で主要な正常系をすべてカバー
- [x] **主要な異常系がカバーされている**: シナリオ6.1〜6.2で主要な異常系をカバー
- [x] **期待結果が明確である**: 各テスト手順に具体的な期待結果を記載

---

## 9. テストシナリオ実施記録テンプレート

テスト実施時は以下のテンプレートを使用して記録してください：

```markdown
## テスト実施記録

**実施日**: YYYY-MM-DD
**実施者**: [名前]
**環境**: [Jenkins URL, Gitブランチ等]

### シナリオ2.1: Jenkinsfile移動確認
- [ ] 手順1: 移動前の状態確認 → 結果: ___________
- [ ] 手順2: 移動前のGit履歴確認 → 結果: ___________
- ...
- **総合判定**: PASS / FAIL
- **備考**: ___________

### シナリオ2.2: DSL更新確認
- [ ] 手順1: 更新前のscriptPath確認 → 結果: ___________
- ...
- **総合判定**: PASS / FAIL
- **備考**: ___________

（以下同様）
```

---

## 10. 次フェーズへの引き継ぎ事項

### Implementation Phaseへ
- 本テストシナリオを参照し、実装完了後に必ずシナリオ2.1〜2.7を実施すること
- 特にシナリオ2.4（シードジョブ実行）は必須ゲート条件

### Testing Phaseへ
- シナリオ2.4〜2.6はJenkins環境へのアクセスが必要
- テスト実施前にJenkins認証情報を準備すること
- テスト実施記録テンプレートを使用して結果を記録すること

---

## 11. 備考

### Planning Documentとの整合性確認

- ✅ **テスト戦略（INTEGRATION_ONLY）**: 設計書のセクション3と一致
- ✅ **段階的検証**: ファイル移動 → DSL更新 → 統合テストの順で実施
- ✅ **リスク対策**: シードジョブ実行による50ジョブ生成確認をゲート条件に設定

### 要件定義書との整合性確認

- ✅ **FR-001**: シナリオ2.1でカバー（Jenkinsfileの移動）
- ✅ **FR-002**: シナリオ2.2でカバー（DSLファイルの`scriptPath`更新）
- ✅ **FR-003**: シナリオ2.3でカバー（README.md更新）
- ✅ **FR-004**: シナリオ2.4でカバー（シードジョブによる統合検証）
- ✅ **NFR-002**: シナリオ2.7、2.8でカバー（Git履歴保持、ロールバック可能性）

---

**ドキュメント作成者**: AI Workflow Agent
**レビュー状態**: 初回作成完了
**最終更新日**: 2025-01-30
