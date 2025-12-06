# テストシナリオ - Issue #259

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**INTEGRATION_ONLY** (Planning Documentより引用)

### テスト対象の範囲
- Jenkins Job DSL (`ai_workflow_finalize_job.groovy`)
- Finalize Jenkinsfile (`jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile`)
- 共通処理モジュール (`jenkins/shared/common.groovy`)との統合
- Cleanup コマンド (`node dist/index.js cleanup`) との統合
- Git操作との統合

### テストの目的
1. **シードジョブからのJob DSL実行検証**
   - Job DSL構文の正しさ
   - 10フォルダ（develop + stable-1～stable-9）へのジョブ作成
   - パラメータ定義の正確性

2. **パラメータバリデーションの動作確認**
   - 必須パラメータ（ISSUE_URL）の検証
   - CLEANUP_PHASES形式チェック
   - CLEANUP_PHASES と CLEANUP_ALL の排他チェック

3. **Cleanup Workflow ステージの正常動作確認**
   - `node dist/index.js cleanup` の実行
   - パラメータフラグの正しい構築（`--phases`, `--all`, `--dry-run`）
   - Git コミット＆プッシュの成功

4. **TODOステージの適切なスキップ動作確認**
   - Squash Commits ステージ
   - Update PR ステージ
   - Promote PR ステージ
   - 各ステージが echo メッセージのみで正常終了

5. **共通処理モジュールとの統合確認**
   - `common.groovy` の正常な読み込み
   - `prepareAgentCredentials()` の動作
   - `setupEnvironment()` の動作
   - `setupNodeEnvironment()` の動作
   - `archiveArtifacts()` の動作

---

## 2. Integrationテストシナリオ

### シナリオ2.1: シードジョブからのJob作成

**目的**: シードジョブから finalize ジョブが正常に作成されることを検証

**前提条件**:
- Jenkins環境が正常に動作している
- シードジョブ (`ai-workflow-job-creator`) が存在する
- `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` が配置されている
- `jenkins/jobs/dsl/common/commonSettings.groovy` と `config.yaml` が正しく設定されている

**テスト手順**:
1. シードジョブ (`AI_Workflow/_seed/ai-workflow-job-creator`) を実行
2. ビルドログを確認し、Job DSL処理が成功したことを確認
3. 以下の10個のジョブが作成されたことを確認:
   - `AI_Workflow/develop/finalize`
   - `AI_Workflow/stable-1/finalize`
   - `AI_Workflow/stable-2/finalize`
   - `AI_Workflow/stable-3/finalize`
   - `AI_Workflow/stable-4/finalize`
   - `AI_Workflow/stable-5/finalize`
   - `AI_Workflow/stable-6/finalize`
   - `AI_Workflow/stable-7/finalize`
   - `AI_Workflow/stable-8/finalize`
   - `AI_Workflow/stable-9/finalize`
4. 各ジョブの設定を確認:
   - Display Name: 「AI Workflow - Finalize」
   - Description: 適切な説明文が設定されている
   - Parameters: 18個のパラメータが正しく定義されている
   - Pipeline Definition: `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` を参照
   - Log Rotation: 30ビルド、90日保持

**期待結果**:
- シードジョブが成功する（ステータス: SUCCESS）
- 10個の finalize ジョブがすべて作成される
- 各ジョブの設定が設計書通りである
- Job DSL構文エラーがない

**確認項目**:
- [ ] シードジョブのビルドが SUCCESS
- [ ] 10個のフォルダにジョブが作成されている
- [ ] 各ジョブに18個のパラメータが定義されている
- [ ] パラメータのデフォルト値が正しい
- [ ] Job DSL構文エラーがログに出力されていない

---

### シナリオ2.2: パラメータバリデーション（正常系）

**目的**: 正しいパラメータでジョブが実行されることを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue（例: #259）が存在する
- GitHub Token が設定されている
- 対象リポジトリにワークフローブランチが存在する

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-8` (デフォルト)
   - `CLEANUP_ALL`: `false`
   - `CLEANUP_DRY_RUN`: `true` (プレビューモード)
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
   - その他: デフォルト値
3. ビルドログを確認
4. Validate Parameters ステージの出力を確認:
   - Issue Number: `259`
   - Repository Owner: `tielec`
   - Repository Name: `ai-workflow-agent`
   - Cleanup Phases: `0-8`

**期待結果**:
- Validate Parameters ステージが成功する
- Issue URL が正しく解析される
- ビルドディスクリプションが更新される: "Issue #259 | Finalize | tielec/ai-workflow-agent"
- エラーが発生しない

**確認項目**:
- [ ] Validate Parameters ステージが SUCCESS
- [ ] Issue番号が正しく抽出されている (259)
- [ ] リポジトリ情報が正しく抽出されている (tielec/ai-workflow-agent)
- [ ] ビルドディスクリプションが正しく設定されている
- [ ] パラメータバリデーションエラーがない

---

### シナリオ2.3: パラメータバリデーション（異常系 - 必須パラメータ未指定）

**目的**: 必須パラメータが未指定の場合、エラーが発生することを検証

**前提条件**:
- finalize ジョブが作成されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: (空欄)
   - その他: デフォルト値
3. ビルドログを確認
4. Validate Parameters ステージの出力を確認

**期待結果**:
- Validate Parameters ステージが失敗する（ステータス: FAILURE）
- エラーメッセージ: "ISSUE_URL parameter is required"
- ビルドが中断される

**確認項目**:
- [ ] ビルド全体が FAILURE
- [ ] Validate Parameters ステージで "ISSUE_URL parameter is required" エラー
- [ ] 後続ステージが実行されない

---

### シナリオ2.4: パラメータバリデーション（異常系 - 不正なISSUE_URL形式）

**目的**: 不正な ISSUE_URL が指定された場合、エラーが発生することを検証

**前提条件**:
- finalize ジョブが作成されている

**テスト手順（ケース1: GitHubでない）**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://gitlab.com/tielec/my-project/issues/123`
3. ビルドログを確認

**期待結果（ケース1）**:
- Validate Parameters ステージが失敗する
- エラーメッセージ: "ISSUE_URL must be a GitHub Issue URL: https://gitlab.com/..."

**テスト手順（ケース2: Issue URLでない）**:
1. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/pull/259`
2. ビルドログを確認

**期待結果（ケース2）**:
- Validate Parameters ステージが失敗する
- エラーメッセージ: "ISSUE_URL must be a GitHub Issue URL (/issues/): https://github.com/..."

**確認項目**:
- [ ] ケース1でバリデーションエラーが発生
- [ ] ケース2でバリデーションエラーが発生
- [ ] エラーメッセージが明確である

---

### シナリオ2.5: パラメータバリデーション（異常系 - CLEANUP_PHASES と CLEANUP_ALL の同時指定）

**目的**: CLEANUP_PHASES と CLEANUP_ALL が同時に指定された場合、エラーが発生することを検証

**前提条件**:
- finalize ジョブが作成されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-4`
   - `CLEANUP_ALL`: `true`
3. ビルドログを確認

**期待結果**:
- Validate Parameters ステージが失敗する
- エラーメッセージ: "Cannot specify both CLEANUP_PHASES and CLEANUP_ALL parameters"

**確認項目**:
- [ ] ビルド全体が FAILURE
- [ ] Validate Parameters ステージで排他チェックエラー
- [ ] エラーメッセージが明確である

---

### シナリオ2.6: パラメータバリデーション（異常系 - 不正なCLEANUP_PHASES形式）

**目的**: 不正な CLEANUP_PHASES が指定された場合、エラーが発生することを検証

**前提条件**:
- finalize ジョブが作成されている

**テスト手順（ケース1: 不正な形式）**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `invalid-format`
3. ビルドログを確認

**期待結果（ケース1）**:
- Validate Parameters ステージが失敗する
- エラーメッセージ: "CLEANUP_PHASES must be numeric range (0-4) or phase name list (planning,requirements)"

**テスト手順（ケース2: 範囲外の数値）**:
1. 以下のパラメータで「Build with Parameters」を実行:
   - `CLEANUP_PHASES`: `0-10`
2. ビルドログを確認

**期待結果（ケース2）**:
- Validate Parameters ステージまたはCleanup Workflowステージが失敗する
- エラーメッセージ: "Invalid phase range" または cleanup コマンドからのエラー

**確認項目**:
- [ ] ケース1でバリデーションエラーが発生
- [ ] ケース2でエラーが発生
- [ ] エラーメッセージが明確である

---

### シナリオ2.7: Cleanup Workflow ステージ（ドライランモード）

**目的**: Cleanup Workflow ステージが正常に動作し、クリーンアッププレビューが表示されることを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- Phase 0-8のログが存在する（execute/review/reviseディレクトリ）

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-8`
   - `CLEANUP_DRY_RUN`: `true`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
   - その他: デフォルト値
3. ビルドログを確認
4. Cleanup Workflow ステージの出力を確認:
   - `[DRY RUN] Cleanup preview:` メッセージ
   - 削除対象ファイルのリスト
   - ファイル数とサイズのサマリー

**期待結果**:
- Cleanup Workflow ステージが成功する
- ドライランモードでプレビューが表示される
- 実際のファイル削除は行われない
- Git コミット＆プッシュは実行されない
- ビルド全体が SUCCESS

**確認項目**:
- [ ] Cleanup Workflow ステージが SUCCESS
- [ ] `[DRY RUN] Cleanup preview:` メッセージが表示される
- [ ] 削除対象ファイルのリストが表示される
- [ ] ファイル数とサイズが表示される
- [ ] 実際のファイル削除が行われていない（ワークフローディレクトリを確認）

---

### シナリオ2.8: Cleanup Workflow ステージ（通常モード - フェーズ範囲指定）

**目的**: Cleanup Workflow ステージが正常に動作し、指定フェーズ範囲のログがクリーンアップされることを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- Phase 0-4のログが存在する（execute/review/reviseディレクトリ）

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-4`
   - `CLEANUP_DRY_RUN`: `false`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
   - その他: デフォルト値
3. ビルドログを確認
4. Cleanup Workflow ステージの出力を確認:
   - `node dist/index.js cleanup --issue 259 --phases 0-4` コマンド実行
   - Cleanup成功メッセージ
5. Git コミット＆プッシュの確認:
   - コミットメッセージに "chore: cleanup workflow logs" が含まれる
   - リモートにプッシュされている
6. ワークフローディレクトリを確認:
   - Phase 0-4の execute/review/revise ディレクトリが削除されている
   - Phase 5-8の execute/review/revise ディレクトリは残っている
   - output ディレクトリは残っている

**期待結果**:
- Cleanup Workflow ステージが成功する
- Phase 0-4のログが削除される
- Git コミット＆プッシュが成功する
- ビルド全体が SUCCESS

**確認項目**:
- [ ] Cleanup Workflow ステージが SUCCESS
- [ ] `node dist/index.js cleanup --issue 259 --phases 0-4` が実行される
- [ ] Phase 0-4の execute/review/revise ディレクトリが削除される
- [ ] Phase 5-8のログは削除されていない
- [ ] Git コミットが作成される
- [ ] リモートにプッシュされる

---

### シナリオ2.9: Cleanup Workflow ステージ（通常モード - フェーズ名リスト指定）

**目的**: CLEANUP_PHASES にフェーズ名リスト（カンマ区切り）を指定した場合、正常に動作することを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- planning, requirements, design フェーズのログが存在する

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `planning,requirements,design`
   - `CLEANUP_DRY_RUN`: `false`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
3. ビルドログを確認
4. Cleanup Workflow ステージの出力を確認:
   - `node dist/index.js cleanup --issue 259 --phases planning,requirements,design` コマンド実行
5. ワークフローディレクトリを確認:
   - 00_planning, 01_requirements, 02_design の execute/review/revise ディレクトリが削除されている
   - 他のフェーズのログは残っている

**期待結果**:
- Cleanup Workflow ステージが成功する
- 指定フェーズ（planning, requirements, design）のログが削除される
- Git コミット＆プッシュが成功する

**確認項目**:
- [ ] Cleanup Workflow ステージが SUCCESS
- [ ] フェーズ名リストが正しく解析される
- [ ] 指定フェーズのログが削除される
- [ ] 他のフェーズのログは削除されていない

---

### シナリオ2.10: Cleanup Workflow ステージ（完全クリーンアップ - CLEANUP_ALL）

**目的**: CLEANUP_ALL フラグで完全クリーンアップが実行されることを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- Evaluation Phase が completed 状態である

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: (空欄)
   - `CLEANUP_ALL`: `true`
   - `CLEANUP_DRY_RUN`: `false`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
3. ビルドログを確認
4. Cleanup Workflow ステージの出力を確認:
   - `node dist/index.js cleanup --issue 259 --all` コマンド実行
   - 完全クリーンアップの確認プロンプト（CI環境では自動スキップ）
5. ワークフローディレクトリを確認:
   - `.ai-workflow/issue-259/` ディレクトリ全体が削除されている

**期待結果**:
- Cleanup Workflow ステージが成功する
- ワークフローディレクトリ全体が削除される
- Git コミット＆プッシュが成功する

**確認項目**:
- [ ] Cleanup Workflow ステージが SUCCESS
- [ ] `--all` フラグが正しく渡される
- [ ] ワークフローディレクトリ全体が削除される
- [ ] Git コミットが作成される

---

### シナリオ2.11: Cleanup Workflow ステージ（異常系 - Evaluation未完了で--all指定）

**目的**: Evaluation Phase が未完了の状態で CLEANUP_ALL を指定した場合、エラーが発生することを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- Evaluation Phase が completed 以外の状態（例: in_progress, failed）

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_ALL`: `true`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
3. ビルドログを確認

**期待結果**:
- Cleanup Workflow ステージが失敗する
- エラーメッセージ: "Error: --all option requires Evaluation Phase to be completed. Current status: ..."
- ビルド全体が FAILURE

**確認項目**:
- [ ] ビルド全体が FAILURE
- [ ] Cleanup Workflow ステージでエラー
- [ ] Evaluation完了チェックエラーメッセージが表示される

---

### シナリオ2.12: TODOステージのスキップ動作確認

**目的**: Squash Commits、Update PR、Promote PR の各TODOステージが正常にスキップされることを検証

**前提条件**:
- finalize ジョブが作成されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-8`
   - `CLEANUP_DRY_RUN`: `true`
   - `DRY_RUN`: `false`
   - `GITHUB_TOKEN`: (有効なトークン)
3. ビルドログを確認
4. Squash Commits ステージの出力を確認:
   - "Stage: Squash Commits (Phase 2 - TODO)" メッセージ
   - "Squash Commits: Not implemented yet (future expansion)" メッセージ
   - "Planned: Squash commits from base_commit to HEAD with AI-generated message" メッセージ
5. Update PR ステージの出力を確認:
   - "Stage: Update PR (Phase 2 - TODO)" メッセージ
   - "Update PR: Not implemented yet (future expansion)" メッセージ
6. Promote PR ステージの出力を確認:
   - "Stage: Promote PR (Phase 2 - TODO)" メッセージ
   - "Promote PR: Not implemented yet (future expansion)" メッセージ

**期待結果**:
- 3つのTODOステージすべてが成功する（ステータス: SUCCESS）
- 各ステージで echo メッセージのみが出力される
- 実際の処理は実行されない
- ビルド全体が SUCCESS

**確認項目**:
- [ ] Squash Commits ステージが SUCCESS
- [ ] Update PR ステージが SUCCESS
- [ ] Promote PR ステージが SUCCESS
- [ ] 各ステージでTODOメッセージが表示される
- [ ] 実際の処理が実行されていない

---

### シナリオ2.13: 共通処理モジュールとの統合（Load Common Library）

**目的**: common.groovy が正常に読み込まれることを検証

**前提条件**:
- finalize ジョブが作成されている
- `jenkins/shared/common.groovy` が存在する

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 任意のパラメータで「Build with Parameters」を実行
3. ビルドログを確認
4. Load Common Library ステージの出力を確認:
   - "AI Workflow Orchestrator v0.2.0" メッセージ
   - "Mode: Finalize" メッセージ
   - "Common library loaded successfully" メッセージ

**期待結果**:
- Load Common Library ステージが成功する
- common.groovy が正常に読み込まれる

**確認項目**:
- [ ] Load Common Library ステージが SUCCESS
- [ ] "Common library loaded successfully" メッセージが表示される
- [ ] common 変数が後続ステージで使用可能

---

### シナリオ2.14: 共通処理モジュールとの統合（Prepare Agent Credentials）

**目的**: prepareAgentCredentials() が正常に動作することを検証

**前提条件**:
- finalize ジョブが作成されている
- 認証情報パラメータが設定されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `AGENT_MODE`: `auto`
   - `GITHUB_TOKEN`: (有効なトークン)
   - `CLAUDE_CODE_API_KEY`: (有効なAPIキー)
   - その他: デフォルト値
3. ビルドログを確認
4. Prepare Agent Credentials ステージの出力を確認:
   - "Stage: Prepare Agent Credentials" メッセージ
   - "Agent Mode: auto" メッセージ
   - 各認証情報の確認メッセージ（"[INFO] CLAUDE_CODE_API_KEY is configured"等）

**期待結果**:
- Prepare Agent Credentials ステージが成功する
- 認証情報が正しく検証される

**確認項目**:
- [ ] Prepare Agent Credentials ステージが SUCCESS
- [ ] Agent Mode が正しく表示される
- [ ] 設定済み認証情報が検出される
- [ ] 未設定認証情報が警告される

---

### シナリオ2.15: 共通処理モジュールとの統合（Setup Environment）

**目的**: setupEnvironment() が正常に動作し、REPOS_ROOT とリポジトリクローンが正しく実行されることを検証

**前提条件**:
- finalize ジョブが作成されている
- GitHub Token が設定されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `GITHUB_TOKEN`: (有効なトークン)
3. ビルドログを確認
4. Setup Environment ステージの出力を確認:
   - "Stage: Setup Environment" メッセージ
   - "Setting up REPOS_ROOT: /tmp/ai-workflow-repos-..." メッセージ
   - "Cloning repository tielec/ai-workflow-agent..." メッセージ
   - "Target repository: /tmp/ai-workflow-repos-.../ai-workflow-agent" メッセージ
   - "Current branch: ai-workflow/issue-259" メッセージ
5. env.REPOS_ROOT が設定されていることを確認

**期待結果**:
- Setup Environment ステージが成功する
- REPOS_ROOT ディレクトリが作成される
- 対象リポジトリがクローンされる
- ワークフローブランチにチェックアウトされる

**確認項目**:
- [ ] Setup Environment ステージが SUCCESS
- [ ] REPOS_ROOT が `/tmp/ai-workflow-repos-<BUILD_ID>-<random>` 形式で作成される
- [ ] リポジトリが正しくクローンされる
- [ ] ブランチが正しくチェックアウトされる
- [ ] env.REPOS_ROOT が設定される

---

### シナリオ2.16: 共通処理モジュールとの統合（Setup Node.js Environment）

**目的**: setupNodeEnvironment() が正常に動作し、npm install と npm run build が実行されることを検証

**前提条件**:
- finalize ジョブが作成されている
- Setup Environment ステージが成功している

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 任意のパラメータで「Build with Parameters」を実行
3. ビルドログを確認
4. Setup Node.js Environment ステージの出力を確認:
   - "Stage: Setup Node.js Environment" メッセージ
   - "Node version: ..." メッセージ
   - "npm version: ..." メッセージ
   - "Installing dependencies (including dev)..." メッセージ
   - "Building TypeScript sources..." メッセージ
5. dist/ ディレクトリが作成されたことを確認

**期待結果**:
- Setup Node.js Environment ステージが成功する
- npm install が成功する
- npm run build が成功する
- dist/ ディレクトリが作成される

**確認項目**:
- [ ] Setup Node.js Environment ステージが SUCCESS
- [ ] Node.js と npm のバージョンが表示される
- [ ] npm install が成功する
- [ ] npm run build が成功する
- [ ] dist/index.js が作成される

---

### シナリオ2.17: 共通処理モジュールとの統合（Archive Artifacts）

**目的**: archiveArtifacts() が正常に動作し、ワークフロー成果物がアーカイブされることを検証

**前提条件**:
- finalize ジョブが作成されている
- Cleanup Workflow ステージが成功している
- `.ai-workflow/issue-259/` ディレクトリが存在する

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 任意のパラメータで「Build with Parameters」を実行
3. ビルド完了後、ビルドページを確認
4. 「Build Artifacts」セクションを確認
5. アーカイブされたファイルのリストを確認

**期待結果**:
- Post処理でArchive Artifactsが成功する
- `.ai-workflow/issue-259/**/*` のファイルがアーカイブされる
- ビルドページから成果物をダウンロードできる

**確認項目**:
- [ ] Post処理でアーカイブ処理が実行される
- [ ] 「Build Artifacts」セクションにファイルが表示される
- [ ] metadata.json がアーカイブされている
- [ ] 各フェーズの output/ ディレクトリがアーカイブされている

---

### シナリオ2.18: ビルド全体の成功（エンドツーエンド - ドライランモード）

**目的**: finalize パイプライン全体が正常に動作することを検証（ドライランモード）

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- GitHub Token が設定されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-8`
   - `CLEANUP_DRY_RUN`: `true`
   - `DRY_RUN`: `false`
   - `AGENT_MODE`: `auto`
   - `GITHUB_TOKEN`: (有効なトークン)
   - その他: デフォルト値
3. ビルドログを確認
4. 全ステージの実行順序を確認:
   1. Load Common Library
   2. Prepare Agent Credentials
   3. Validate Parameters
   4. Setup Environment
   5. Setup Node.js Environment
   6. Initialize Workflow
   7. Cleanup Workflow
   8. Squash Commits
   9. Update PR
   10. Promote PR
   11. Archive Artifacts (post処理)
5. ビルドディスクリプションを確認: "Issue #259 | Finalize | tielec/ai-workflow-agent"
6. ビルド時間を確認（5分以内）

**期待結果**:
- ビルド全体が SUCCESS
- 全ステージが順次実行される
- ドライランモードでクリーンアッププレビューが表示される
- ビルド時間が5分以内（環境により変動）

**確認項目**:
- [ ] ビルド全体が SUCCESS
- [ ] 全ステージが正しい順序で実行される
- [ ] Load Common Library ステージ: SUCCESS
- [ ] Prepare Agent Credentials ステージ: SUCCESS
- [ ] Validate Parameters ステージ: SUCCESS
- [ ] Setup Environment ステージ: SUCCESS
- [ ] Setup Node.js Environment ステージ: SUCCESS
- [ ] Initialize Workflow ステージ: SUCCESS
- [ ] Cleanup Workflow ステージ: SUCCESS（ドライランモード）
- [ ] Squash Commits ステージ: SUCCESS（TODOメッセージ）
- [ ] Update PR ステージ: SUCCESS（TODOメッセージ）
- [ ] Promote PR ステージ: SUCCESS（TODOメッセージ）
- [ ] Archive Artifacts: SUCCESS
- [ ] ビルド時間が妥当

---

### シナリオ2.19: ビルド全体の成功（エンドツーエンド - 通常モード）

**目的**: finalize パイプライン全体が正常に動作し、実際のクリーンアップが実行されることを検証

**前提条件**:
- finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する
- Phase 0-8のログが存在する
- GitHub Token が設定されている

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを開く
2. 以下のパラメータで「Build with Parameters」を実行:
   - `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
   - `CLEANUP_PHASES`: `0-8`
   - `CLEANUP_DRY_RUN`: `false`
   - `DRY_RUN`: `false`
   - `AGENT_MODE`: `auto`
   - `GITHUB_TOKEN`: (有効なトークン)
   - その他: デフォルト値
3. ビルドログを確認
4. Cleanup Workflow ステージの出力を確認:
   - `node dist/index.js cleanup --issue 259 --phases 0-8` コマンド実行
   - Cleanup成功メッセージ
   - Git コミット＆プッシュ成功メッセージ
5. ワークフローディレクトリを確認:
   - Phase 0-8の execute/review/revise ディレクトリが削除されている
   - output ディレクトリは残っている
6. Gitリポジトリを確認:
   - cleanup コミットが作成されている
   - リモートにプッシュされている

**期待結果**:
- ビルド全体が SUCCESS
- Phase 0-8のログが削除される
- Git コミット＆プッシュが成功する
- 成果物がアーカイブされる

**確認項目**:
- [ ] ビルド全体が SUCCESS
- [ ] Cleanup Workflow ステージが SUCCESS
- [ ] Phase 0-8の execute/review/revise ディレクトリが削除される
- [ ] output ディレクトリは削除されていない
- [ ] Git コミットが作成される
- [ ] リモートにプッシュされる
- [ ] 成果物がアーカイブされる

---

### シナリオ2.20: 複数フォルダでのジョブ実行確認

**目的**: develop および stable-1～stable-9 フォルダのジョブがすべて正常に動作することを検証

**前提条件**:
- 10個の finalize ジョブが作成されている
- テスト用Issue #259のワークフローディレクトリが存在する

**テスト手順**:
1. `AI_Workflow/develop/finalize` ジョブを実行（ドライランモード）
2. ビルドが SUCCESS であることを確認
3. `AI_Workflow/stable-1/finalize` ジョブを実行（ドライランモード）
4. ビルドが SUCCESS であることを確認
5. `AI_Workflow/stable-5/finalize` ジョブを実行（ドライランモード）
6. ビルドが SUCCESS であることを確認
7. 各ジョブで以下を確認:
   - Git Branch: develop は `*/develop`、stable-1～9 は `*/main`
   - 環境変数 EXECUTION_MODE: `finalize`
   - 環境変数 WORKFLOW_VERSION: `0.2.0`

**期待結果**:
- develop および stable-1～stable-9 の全ジョブが正常に動作する
- 各ジョブで正しいブランチが使用される

**確認項目**:
- [ ] develop フォルダのジョブが SUCCESS
- [ ] stable-1 フォルダのジョブが SUCCESS
- [ ] stable-5 フォルダのジョブが SUCCESS
- [ ] 各ジョブで正しいブランチが使用される
- [ ] EXECUTION_MODE が `finalize` に設定される

---

## 3. テストデータ

### 3.1 テスト用Issue

**Issue #259**:
- URL: `https://github.com/tielec/ai-workflow-agent/issues/259`
- 状態: open
- ワークフローブランチ: `ai-workflow/issue-259`
- 想定状態: Report Phase完了（Phase 0-8のログが存在）

### 3.2 パラメータテストデータ

**正常データ**:
- `ISSUE_URL`: `https://github.com/tielec/ai-workflow-agent/issues/259`
- `CLEANUP_PHASES`: `0-8`, `0-4`, `planning,requirements`, `planning`
- `CLEANUP_ALL`: `false`, `true` (Evaluation completed時のみ)
- `CLEANUP_DRY_RUN`: `true`, `false`
- `DRY_RUN`: `false`, `true`
- `AGENT_MODE`: `auto`, `codex`, `claude`

**異常データ**:
- `ISSUE_URL`: (空欄), `https://gitlab.com/...`, `https://github.com/.../pull/123`
- `CLEANUP_PHASES`: `invalid-format`, `0-10`, `10-15`, `unknown-phase`
- `CLEANUP_PHASES` + `CLEANUP_ALL`: 両方 true（排他チェック）

**境界値データ**:
- `CLEANUP_PHASES`: `0-0`, `9-9`, `0-9`, `planning`, `evaluation`

### 3.3 ワークフロー状態テストデータ

**Phase 0-8のログが存在する状態**:
- `.ai-workflow/issue-259/00_planning/execute/` (ログファイル複数)
- `.ai-workflow/issue-259/00_planning/review/` (ログファイル複数)
- `.ai-workflow/issue-259/00_planning/revise/` (ログファイル複数)
- `.ai-workflow/issue-259/00_planning/output/` (成果物)
- ... (Phase 1-8 も同様)

**Evaluation Phase completed状態**:
- `metadata.json` の `phases.evaluation.status`: `"completed"`

**Evaluation Phase not completed状態**:
- `metadata.json` の `phases.evaluation.status`: `"in_progress"` または `"failed"`

---

## 4. テスト環境要件

### 4.1 Jenkins環境

- **Jenkins バージョン**: 2.387以上
- **必須プラグイン**:
  - Job DSL Plugin
  - Pipeline Plugin
  - Git Plugin
  - Docker Plugin
  - AnsiColor Plugin
  - Timestamper Plugin

### 4.2 外部サービス

- **GitHub**:
  - テスト用リポジトリ: `tielec/ai-workflow-agent`
  - GitHub Personal Access Token (repo, workflow スコープ)
  - テスト用Issue #259
  - ワークフローブランチ: `ai-workflow/issue-259`

- **Docker**:
  - Docker環境が利用可能
  - Dockerfile が存在する

### 4.3 認証情報

- **Jenkins Credentials**:
  - `github-token`: GitHub Personal Access Token
  - その他APIキー（CLAUDE_CODE_API_KEY 等）

### 4.4 ファイルシステム

- **REPOS_ROOT**: `/tmp/ai-workflow-repos-*` ディレクトリ作成権限
- **ワークフローディレクトリ**: `.ai-workflow/issue-259/` 存在（テスト用）
- **ログファイル**: Phase 0-8の execute/review/revise ディレクトリに複数ファイル存在

---

## 5. モック/スタブの必要性

**統合テストのため、モック/スタブは使用しない**

以下は実環境で実行：
- Jenkins Job DSL処理
- Jenkinsパイプライン実行
- Git操作（clone, checkout, commit, push）
- `node dist/index.js cleanup` コマンド実行
- ファイルシステム操作（ディレクトリ削除、成果物アーカイブ）

---

## 6. 品質ゲート（Phase 3）確認

### 品質ゲート確認チェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - Planning Document で決定された **INTEGRATION_ONLY** 戦略に従っている
  - Unitテスト、BDDテストは含まれていない

- [x] **主要な正常系がカバーされている**
  - シナリオ2.1: シードジョブからのJob作成（正常系）
  - シナリオ2.2: パラメータバリデーション（正常系）
  - シナリオ2.7: Cleanup Workflow ステージ（ドライランモード）
  - シナリオ2.8: Cleanup Workflow ステージ（通常モード - フェーズ範囲指定）
  - シナリオ2.9: Cleanup Workflow ステージ（フェーズ名リスト指定）
  - シナリオ2.10: Cleanup Workflow ステージ（完全クリーンアップ）
  - シナリオ2.12: TODOステージのスキップ動作確認
  - シナリオ2.13-2.17: 共通処理モジュールとの統合
  - シナリオ2.18: ビルド全体の成功（エンドツーエンド - ドライランモード）
  - シナリオ2.19: ビルド全体の成功（エンドツーエンド - 通常モード）
  - シナリオ2.20: 複数フォルダでのジョブ実行確認

- [x] **主要な異常系がカバーされている**
  - シナリオ2.3: パラメータバリデーション（異常系 - 必須パラメータ未指定）
  - シナリオ2.4: パラメータバリデーション（異常系 - 不正なISSUE_URL形式）
  - シナリオ2.5: パラメータバリデーション（異常系 - CLEANUP_PHASES と CLEANUP_ALL の同時指定）
  - シナリオ2.6: パラメータバリデーション（異常系 - 不正なCLEANUP_PHASES形式）
  - シナリオ2.11: Cleanup Workflow ステージ（異常系 - Evaluation未完了で--all指定）

- [x] **期待結果が明確である**
  - 全シナリオで「期待結果」セクションを明記
  - 各シナリオで「確認項目」チェックリストを提供
  - 成功/失敗の判定基準が明確

---

## 7. 受け入れ基準との対応表

| 受け入れ基準（要件定義書より） | 対応テストシナリオ |
|------------------------------|-------------------|
| `jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile` が作成されている | シナリオ2.1, 2.18, 2.19 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` が作成されている | シナリオ2.1 |
| シードジョブから finalize ジョブが作成できる | シナリオ2.1 |
| Cleanup Workflow ステージが正常に動作する | シナリオ2.7, 2.8, 2.9, 2.10 |
| Squash/Update PR/Promote PR ステージはTODOコメント付きで枠組みのみ実装 | シナリオ2.12 |
| 既存の common.groovy を活用している | シナリオ2.13, 2.14, 2.15, 2.16, 2.17 |
| パラメータバリデーションが実装されている | シナリオ2.2, 2.3, 2.4, 2.5, 2.6 |
| 汎用フォルダ構成（develop + stable-1～9）に対応している | シナリオ2.1, 2.20 |

---

## 8. テスト実行ガイドライン

### 8.1 推奨実行順序

1. **シナリオ2.1**: シードジョブからのJob作成
   - 最初に実行し、10個のジョブが作成されることを確認
2. **シナリオ2.2-2.6**: パラメータバリデーション
   - 正常系、異常系を順次テスト
3. **シナリオ2.13-2.17**: 共通処理モジュールとの統合
   - 各共通処理が正常に動作することを確認
4. **シナリオ2.7**: Cleanup Workflow（ドライランモード）
   - クリーンアップ処理の動作を安全に確認
5. **シナリオ2.8-2.10**: Cleanup Workflow（通常モード）
   - 実際のクリーンアップ処理をテスト
   - **注意**: 実ファイルを削除するため、テスト環境で実行
6. **シナリオ2.12**: TODOステージのスキップ動作
7. **シナリオ2.18-2.19**: エンドツーエンドテスト
   - パイプライン全体の動作を確認
8. **シナリオ2.20**: 複数フォルダでのジョブ実行確認

### 8.2 テスト準備

1. **テスト用Issueの準備**:
   - Issue #259のワークフローディレクトリを作成
   - Phase 0-8のログファイルを配置（execute/review/reviseディレクトリ）
   - metadata.json を適切に設定

2. **認証情報の設定**:
   - Jenkins Credentials に `github-token` を設定
   - 必要に応じてAPIキーを設定

3. **ワークフローブランチの作成**:
   - `ai-workflow/issue-259` ブランチを作成
   - ワークフローディレクトリをコミット＆プッシュ

### 8.3 テスト後のクリーンアップ

1. **REPOS_ROOTの削除**:
   - テスト実行後、`/tmp/ai-workflow-repos-*` ディレクトリを削除
   - パイプラインのpost処理で自動削除されるが、手動確認推奨

2. **テスト用ブランチの削除**:
   - テスト完了後、`ai-workflow/issue-259` ブランチを削除（任意）

3. **テスト用コミットの削除**:
   - cleanup コミットが複数作成されるため、必要に応じて削除

---

## 9. トラブルシューティング

### 9.1 シードジョブが失敗する場合

**原因**:
- Job DSL構文エラー
- commonSettings.groovy または config.yaml の設定不備

**対処法**:
1. ビルドログでエラーメッセージを確認
2. `jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy` の構文をチェック
3. 既存のJob DSL（`ai_workflow_all_phases_job.groovy`）と比較
4. `validate_dsl.sh` で構文検証

### 9.2 Cleanup Workflow ステージが失敗する場合

**原因**:
- cleanup コマンドのエラー
- ワークフローメタデータの不備
- Git操作の失敗

**対処法**:
1. ビルドログで cleanup コマンドのエラーメッセージを確認
2. ワークフローディレクトリの存在を確認
3. metadata.json の内容を確認
4. GitHub Token の権限を確認
5. ドライランモード（`CLEANUP_DRY_RUN=true`）で事前検証

### 9.3 パラメータバリデーションが動作しない場合

**原因**:
- Validate Parametersステージのロジック不備
- 環境変数が正しく設定されていない

**対処法**:
1. ビルドログで環境変数の値を確認
2. Validate Parameters ステージのコードをレビュー
3. 既存パイプライン（all-phases）のバリデーション処理と比較

### 9.4 共通処理モジュールの読み込みエラー

**原因**:
- common.groovy のパスが間違っている
- common.groovy の構文エラー

**対処法**:
1. `load 'jenkins/shared/common.groovy'` のパスを確認
2. common.groovy の存在を確認
3. common.groovy の構文をチェック

---

## 10. テスト結果レポート（テンプレート）

### テスト実行日: YYYY-MM-DD

| シナリオ番号 | シナリオ名 | ステータス | 備考 |
|------------|-----------|----------|------|
| 2.1 | シードジョブからのJob作成 | PASS/FAIL | |
| 2.2 | パラメータバリデーション（正常系） | PASS/FAIL | |
| 2.3 | パラメータバリデーション（異常系 - 必須パラメータ未指定） | PASS/FAIL | |
| 2.4 | パラメータバリデーション（異常系 - 不正なISSUE_URL形式） | PASS/FAIL | |
| 2.5 | パラメータバリデーション（異常系 - CLEANUP_PHASES と CLEANUP_ALL の同時指定） | PASS/FAIL | |
| 2.6 | パラメータバリデーション（異常系 - 不正なCLEANUP_PHASES形式） | PASS/FAIL | |
| 2.7 | Cleanup Workflow ステージ（ドライランモード） | PASS/FAIL | |
| 2.8 | Cleanup Workflow ステージ（通常モード - フェーズ範囲指定） | PASS/FAIL | |
| 2.9 | Cleanup Workflow ステージ（通常モード - フェーズ名リスト指定） | PASS/FAIL | |
| 2.10 | Cleanup Workflow ステージ（完全クリーンアップ - CLEANUP_ALL） | PASS/FAIL | |
| 2.11 | Cleanup Workflow ステージ（異常系 - Evaluation未完了で--all指定） | PASS/FAIL | |
| 2.12 | TODOステージのスキップ動作確認 | PASS/FAIL | |
| 2.13 | 共通処理モジュールとの統合（Load Common Library） | PASS/FAIL | |
| 2.14 | 共通処理モジュールとの統合（Prepare Agent Credentials） | PASS/FAIL | |
| 2.15 | 共通処理モジュールとの統合（Setup Environment） | PASS/FAIL | |
| 2.16 | 共通処理モジュールとの統合（Setup Node.js Environment） | PASS/FAIL | |
| 2.17 | 共通処理モジュールとの統合（Archive Artifacts） | PASS/FAIL | |
| 2.18 | ビルド全体の成功（エンドツーエンド - ドライランモード） | PASS/FAIL | |
| 2.19 | ビルド全体の成功（エンドツーエンド - 通常モード） | PASS/FAIL | |
| 2.20 | 複数フォルダでのジョブ実行確認 | PASS/FAIL | |

### テスト結果サマリー

- **総テスト数**: 20
- **PASS**: __
- **FAIL**: __
- **合格率**: __%

### 不具合一覧

| 不具合ID | 関連シナリオ | 内容 | 重要度 | ステータス |
|---------|------------|------|-------|-----------|
| | | | | |

---

## 11. 変更履歴

| 日時 | 変更内容 | 変更者 |
|-----|---------|--------|
| 2025-12-06 | 初版作成 | Claude Agent |

---

**テストシナリオ作成完了**: 次のPhase（実装フェーズ）に進む準備が整いました。
