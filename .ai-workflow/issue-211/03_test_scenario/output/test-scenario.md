# テストシナリオ

**Issue番号**: #211
**タイトル**: refactor: Jenkinsfileを実行モード別に分割する
**作成日**: 2025-01-31
**プロジェクト種別**: リファクタリング

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**INTEGRATION_ONLY** (Phase 2設計書で決定)

### 判断根拠

1. **Jenkinsfileの性質上、統合テストが最適**
   - Jenkinsfileは宣言的パイプライン（Declarative Pipeline）のため、通常のテストフレームワーク（Jest、JUnit等）では検証できない
   - Jenkins環境での実際の実行による統合テストが唯一の現実的な検証方法

2. **各実行モードごとに統合テストを実施**
   - Jenkinsfile.all-phases: 全フェーズ実行の統合テスト
   - Jenkinsfile.preset: 各プリセット（review-requirements、quick-fix等）の統合テスト
   - Jenkinsfile.single-phase: 特定フェーズ実行の統合テスト
   - Jenkinsfile.rollback: 差し戻し実行の統合テスト
   - Jenkinsfile.auto-issue: 自動Issue生成の統合テスト

3. **BDDは不要**
   - ユーザーストーリーベースの検証ではなく、内部構造の改善が目的
   - 既存Jenkinsfileとの動作一致性を確認すれば十分

4. **ユニットテストは実施不可**
   - Groovyスクリプトの静的解析は可能だが、実行フローの検証には不十分
   - Jenkins Pipelineの動作はJenkins環境でのみ確認可能

### テスト対象の範囲

1. **共通処理モジュール（common.groovy）**
   - prepareAgentCredentials()
   - setupEnvironment()
   - setupNodeEnvironment()
   - archiveArtifacts()

2. **5つのJenkinsfile**
   - Jenkinsfile.all-phases
   - Jenkinsfile.preset
   - Jenkinsfile.single-phase
   - Jenkinsfile.rollback
   - Jenkinsfile.auto-issue

3. **エラーハンドリング**
   - 認証情報エラー
   - パラメータ不正
   - common.groovyロードエラー

### テストの目的

- 各Jenkinsfileが期待通りにワークフローを実行する
- 共通処理（common.groovy）が正しくロードされる
- パラメータの受け渡しが正常に機能する
- エラーハンドリングが適切に動作する
- 既存Jenkinsfileと同等の結果が得られる

---

## 2. Integrationテストシナリオ

### 2.1 共通処理モジュール（common.groovy）

#### IT-COMMON-01: prepareAgentCredentials() - 正常系

**目的**: 認証情報が正しく準備されることを検証

**前提条件**:
- Jenkins環境が稼働中
- 以下のJob DSLパラメータが設定済み:
  - GITHUB_TOKEN: 有効なGitHub Personal Access Token
  - OPENAI_API_KEY: 有効なOpenAI API Key
  - AWS_ACCESS_KEY_ID: 有効なAWS Access Key ID
  - AWS_SECRET_ACCESS_KEY: 有効なAWS Secret Access Key
  - AWS_SESSION_TOKEN: （オプション）
- Jenkins Credentialsに `claude-code-oauth-token` が登録済み

**テスト手順**:
1. Jenkins Jobを作成（Jenkinsfile.all-phasesを使用）
2. 上記パラメータを設定してビルドを実行
3. "Prepare Agent Credentials" ステージのログを確認

**期待結果**:
- `GITHUB_TOKEN: set` が出力される
- `OPENAI_API_KEY: set` が出力される
- `AWS_ACCESS_KEY_ID: set` が出力される
- `AWS_SECRET_ACCESS_KEY: set` が出力される
- `Claude Code credentials prepared` が出力される
- `/root/.claude-code/credentials.json` が存在する
- credentials.jsonのパーミッションが `600` である
- ステージが成功する

**確認項目**:
- [ ] 環境変数が正しく設定されている
- [ ] Claude Code認証情報ファイルが生成されている
- [ ] ビルドログに認証情報の値（トークン本体）が出力されていない
- [ ] ステージが成功している

---

#### IT-COMMON-02: prepareAgentCredentials() - GITHUB_TOKEN未設定

**目的**: GITHUB_TOKEN未設定時にエラーが発生することを検証

**前提条件**:
- Jenkins環境が稼働中
- GITHUB_TOKENが未設定または空文字列

**テスト手順**:
1. Jenkins Jobを作成
2. GITHUB_TOKENを未設定（空文字列）にしてビルドを実行
3. "Prepare Agent Credentials" ステージのログを確認

**期待結果**:
- `GITHUB_TOKEN is not set` エラーメッセージが表示される
- ビルドが失敗する
- ステージが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

#### IT-COMMON-03: setupEnvironment() - 正常系

**目的**: REPOS_ROOT準備とリポジトリクローンが正しく実行されることを検証

**前提条件**:
- Jenkins環境が稼働中
- GITHUB_TOKENが設定済み
- GITHUB_REPOSITORY環境変数が設定済み（例: `tielec/ai-workflow-agent`）

**テスト手順**:
1. Jenkins Jobを作成
2. "Setup Environment" ステージを実行
3. ステージのログを確認

**期待結果**:
- `REPOS_ROOT prepared: /tmp/ai-workflow-repos-${BUILD_ID}` が出力される
- `Repository cloned: /tmp/ai-workflow-repos-${BUILD_ID}/ai-workflow-agent` が出力される
- `/tmp/ai-workflow-repos-${BUILD_ID}/ai-workflow-agent` ディレクトリが存在する
- リポジトリの内容が正しくクローンされている（`.git` ディレクトリ、`package.json` 等）
- ステージが成功する

**確認項目**:
- [ ] REPOS_ROOTディレクトリが作成されている
- [ ] リポジトリがクローンされている
- [ ] リポジトリの内容が正しい
- [ ] ステージが成功している

---

#### IT-COMMON-04: setupNodeEnvironment() - 正常系

**目的**: Node.js環境確認とnpm install & buildが正しく実行されることを検証

**前提条件**:
- Jenkins環境が稼働中
- REPOS_ROOTが準備済み
- リポジトリがクローン済み
- Dockerコンテナ内にNode.jsがインストール済み

**テスト手順**:
1. Jenkins Jobを作成
2. "Setup Node.js Environment" ステージを実行
3. ステージのログを確認

**期待結果**:
- `node --version` の出力が表示される（例: `v18.x.x`）
- `npm --version` の出力が表示される（例: `9.x.x`）
- `npm install completed` が出力される
- `npm run build completed` が出力される
- `dist/index.js` ファイルが生成されている
- ステージが成功する

**確認項目**:
- [ ] Node.jsとnpmがインストールされている
- [ ] npm installが成功している
- [ ] npm run buildが成功している
- [ ] ビルド成果物（dist/index.js）が生成されている
- [ ] ステージが成功している

---

#### IT-COMMON-05: archiveArtifacts() - 正常系

**目的**: 成果物アーカイブが正しく実行されることを検証

**前提条件**:
- Jenkins環境が稼働中
- REPOS_ROOTが準備済み
- Issue番号が環境変数 `ISSUE_NUMBER` に設定済み（例: `211`）
- `.ai-workflow/issue-211/` ディレクトリにワークフローメタデータが存在

**テスト手順**:
1. Jenkins Jobを作成
2. Initialize Workflowステージを実行し、`.ai-workflow/issue-211/` を生成
3. Post処理で `archiveArtifacts(env.ISSUE_NUMBER)` を実行
4. Jenkins UIでビルド成果物を確認

**期待結果**:
- `Artifacts archived for Issue #211` が出力される
- Jenkins UIの「ビルド成果物」に `.ai-workflow/issue-211/**` が表示される
- アーカイブされたファイルをダウンロード可能
- ステージが成功する

**確認項目**:
- [ ] 成果物がアーカイブされている
- [ ] アーカイブされたファイルが正しい
- [ ] Jenkins UIからダウンロード可能
- [ ] ステージが成功している

---

### 2.2 Jenkinsfile.all-phases

#### IT-ALL-PHASES-01: 全フェーズ実行 - 正常系

**目的**: 全フェーズ実行が既存Jenkinsfile（EXECUTION_MODE=all_phases）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み
- ai-workflow-agent Dockerイメージがビルド済み

**テスト手順**:
1. Jenkins Jobを作成（Job DSLで `AI Workflow - All Phases` を定義）
2. 以下のパラメータを設定:
   - ISSUE_URL: `https://github.com/tielec/ai-workflow-agent/issues/999`
   - AGENT_MODE: `auto`
   - OPENAI_API_KEY: （有効な値）
   - GITHUB_TOKEN: （有効な値）
   - AWS認証情報: （有効な値）
3. ビルドを実行
4. 各ステージのログを確認

**期待結果**:
- "Load Common Library" ステージが成功する
- "Prepare Agent Credentials" ステージが成功する
- "Setup Environment" ステージが成功する
- "Setup Node.js Environment" ステージが成功する
- "Initialize Workflow" ステージが成功する
  - `node dist/index.js init --issue-url https://github.com/tielec/ai-workflow-agent/issues/999` が実行される
  - `.ai-workflow/issue-999/` ディレクトリが作成される
- "Execute All Phases" ステージが成功する
  - `node dist/index.js execute --issue 999 --phase all --agent auto` が実行される
  - 全フェーズ（Phase 0-9）が実行される
- Post処理が成功する
  - 成果物がアーカイブされる
  - REPOS_ROOTがクリーンアップされる
- ビルド全体が成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] Initialize Workflowが実行されている
- [ ] Execute All Phasesが実行されている
- [ ] 成果物がアーカイブされている
- [ ] REPOS_ROOTがクリーンアップされている
- [ ] ビルドが成功している

---

#### IT-ALL-PHASES-02: Issue URL未設定エラー

**目的**: Issue URL未設定時にエラーが発生することを検証

**前提条件**:
- Jenkins環境が稼働中
- ISSUE_URLが未設定または空文字列

**テスト手順**:
1. Jenkins Jobを作成
2. ISSUE_URLを未設定（空文字列）にしてビルドを実行
3. "Initialize Workflow" ステージのログを確認

**期待結果**:
- `node dist/index.js init --issue-url ` が実行される（空のURL）
- AI Workflow CLIがエラーを返す（`ISSUE_URL is required`）
- "Initialize Workflow" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

#### IT-ALL-PHASES-03: common.groovyロードエラー

**目的**: common.groovyのロードに失敗した場合にエラーが発生することを検証

**前提条件**:
- Jenkins環境が稼働中
- `jenkins/shared/common.groovy` が存在しない、または構文エラーがある

**テスト手順**:
1. Jenkins Jobを作成
2. `jenkins/shared/common.groovy` を削除またはリネーム
3. ビルドを実行
4. "Load Common Library" ステージのログを確認

**期待結果**:
- `load 'jenkins/shared/common.groovy'` が失敗する
- エラーメッセージが表示される（例: `No such file: jenkins/shared/common.groovy`）
- "Load Common Library" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

### 2.3 Jenkinsfile.preset

#### IT-PRESET-01: review-requirementsプリセット実行 - 正常系

**目的**: review-requirementsプリセットが既存Jenkinsfile（EXECUTION_MODE=preset, PRESET=review-requirements）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み
- ai-workflow-agent Dockerイメージがビルド済み

**テスト手順**:
1. Jenkins Jobを作成（Job DSLで `AI Workflow - Preset` を定義）
2. 以下のパラメータを設定:
   - ISSUE_URL: `https://github.com/tielec/ai-workflow-agent/issues/999`
   - PRESET: `review-requirements`
   - AGENT_MODE: `auto`
   - 認証情報: （有効な値）
3. ビルドを実行
4. "Execute Preset" ステージのログを確認

**期待結果**:
- "Initialize Workflow" ステージが成功する
- "Execute Preset" ステージが成功する
  - `node dist/index.js execute --issue 999 --preset review-requirements --agent auto` が実行される
- ビルドが成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] review-requirementsプリセットが実行されている
- [ ] ビルドが成功している

---

#### IT-PRESET-02: quick-fixプリセット実行 - 正常系

**目的**: quick-fixプリセットが既存Jenkinsfile（EXECUTION_MODE=preset, PRESET=quick-fix）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み

**テスト手順**:
1. Jenkins Jobを作成
2. 以下のパラメータを設定:
   - ISSUE_URL: `https://github.com/tielec/ai-workflow-agent/issues/999`
   - PRESET: `quick-fix`
   - AGENT_MODE: `auto`
   - 認証情報: （有効な値）
3. ビルドを実行
4. "Execute Preset" ステージのログを確認

**期待結果**:
- "Execute Preset" ステージが成功する
  - `node dist/index.js execute --issue 999 --preset quick-fix --agent auto` が実行される
- quick-fixプリセットが実行される
- ビルドが成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] quick-fixプリセットが実行されている
- [ ] ビルドが成功している

---

#### IT-PRESET-03: 全プリセットの動作確認

**目的**: すべてのプリセット選択肢が正しく動作することを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み

**テスト手順**:
1. 以下の各プリセットについて、順次ビルドを実行:
   - `review-requirements`
   - `review-design`
   - `review-test-scenario`
   - `quick-fix`
   - `implementation`
   - `testing`
   - `finalize`
2. 各ビルドの "Execute Preset" ステージのログを確認

**期待結果**:
- すべてのプリセットでビルドが成功する
- 各プリセットで正しいCLIコマンドが実行される
- エラーが発生しない

**確認項目**:
- [ ] review-requirementsが成功する
- [ ] review-designが成功する
- [ ] review-test-scenarioが成功する
- [ ] quick-fixが成功する
- [ ] implementationが成功する
- [ ] testingが成功する
- [ ] finalizeが成功する

---

### 2.4 Jenkinsfile.single-phase

#### IT-SINGLE-PHASE-01: planningフェーズ実行 - 正常系

**目的**: planningフェーズが既存Jenkinsfile（EXECUTION_MODE=single_phase, START_PHASE=planning）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み

**テスト手順**:
1. Jenkins Jobを作成（Job DSLで `AI Workflow - Single Phase` を定義）
2. 以下のパラメータを設定:
   - ISSUE_URL: `https://github.com/tielec/ai-workflow-agent/issues/999`
   - START_PHASE: `planning`
   - AGENT_MODE: `auto`
   - 認証情報: （有効な値）
3. ビルドを実行
4. "Execute Single Phase" ステージのログを確認

**期待結果**:
- "Initialize Workflow" ステージが成功する
- "Execute Single Phase" ステージが成功する
  - `node dist/index.js execute --issue 999 --phase planning --agent auto` が実行される
- planningフェーズのみが実行される
- ビルドが成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] planningフェーズが実行されている
- [ ] 他のフェーズが実行されていない
- [ ] ビルドが成功している

---

#### IT-SINGLE-PHASE-02: 全フェーズの動作確認

**目的**: すべてのフェーズ選択肢が正しく動作することを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み

**テスト手順**:
1. 以下の各フェーズについて、順次ビルドを実行:
   - `planning`
   - `requirements`
   - `design`
   - `test-scenario`
   - `implementation`
   - `test-implementation`
   - `testing`
   - `documentation`
   - `report`
   - `evaluation`
2. 各ビルドの "Execute Single Phase" ステージのログを確認

**期待結果**:
- すべてのフェーズでビルドが成功する
- 各フェーズで正しいCLIコマンドが実行される
- エラーが発生しない

**確認項目**:
- [ ] planningが成功する
- [ ] requirementsが成功する
- [ ] designが成功する
- [ ] test-scenarioが成功する
- [ ] implementationが成功する
- [ ] test-implementationが成功する
- [ ] testingが成功する
- [ ] documentationが成功する
- [ ] reportが成功する
- [ ] evaluationが成功する

---

### 2.5 Jenkinsfile.rollback

#### IT-ROLLBACK-01: requirements差し戻し - 正常系

**目的**: requirements差し戻しが既存Jenkinsfile（EXECUTION_MODE=rollback）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- テスト用Issue（例: #999）が作成済み
- すべての認証情報が設定済み
- Issueが既にdesignフェーズまで完了している（差し戻し可能な状態）

**テスト手順**:
1. Jenkins Jobを作成（Job DSLで `AI Workflow - Rollback` を定義）
2. 以下のパラメータを設定:
   - ISSUE_URL: `https://github.com/tielec/ai-workflow-agent/issues/999`
   - ROLLBACK_TO_PHASE: `requirements`
   - ROLLBACK_REASON: `要件定義に不備があるため、修正が必要です。`
   - AGENT_MODE: `auto`
   - 認証情報: （有効な値）
3. ビルドを実行
4. "Execute Rollback" ステージのログを確認

**期待結果**:
- "Initialize Workflow" ステージが成功する
- "Execute Rollback" ステージが成功する
  - `rollback_reason.txt` ファイルが作成される
  - `node dist/index.js rollback --issue 999 --to-phase requirements --reason-file rollback_reason.txt --force` が実行される
- Issueがrequirementsフェーズに差し戻される
- ビルドが成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] 差し戻し理由がファイルに保存されている
- [ ] rollbackコマンドが実行されている
- [ ] Issueが差し戻されている
- [ ] ビルドが成功している

---

#### IT-ROLLBACK-02: 差し戻し理由未設定エラー

**目的**: 差し戻し理由未設定時にエラーが発生することを検証

**前提条件**:
- Jenkins環境が稼働中
- ROLLBACK_REASONが未設定または空文字列

**テスト手順**:
1. Jenkins Jobを作成
2. ROLLBACK_REASONを未設定（空文字列）にしてビルドを実行
3. "Execute Rollback" ステージのログを確認

**期待結果**:
- AI Workflow CLIがエラーを返す（`Rollback reason is required`）
- "Execute Rollback" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] Issueが差し戻されていない

---

### 2.6 Jenkinsfile.auto-issue

#### IT-AUTO-ISSUE-01: bugカテゴリ自動Issue生成 - 正常系

**目的**: bugカテゴリ自動Issue生成が既存Jenkinsfile（EXECUTION_MODE=auto_issue）と同等の結果を返すことを検証

**前提条件**:
- Jenkins環境が稼働中
- すべての認証情報が設定済み
- ai-workflow-agent Dockerイメージがビルド済み

**テスト手順**:
1. Jenkins Jobを作成（Job DSLで `AI Workflow - Auto Issue` を定義）
2. 以下のパラメータを設定:
   - AUTO_ISSUE_CATEGORY: `bug`
   - AGENT_MODE: `auto`
   - 認証情報: （有効な値）
3. ビルドを実行
4. "Execute Auto Issue" ステージのログを確認

**期待結果**:
- "Load Common Library" ステージが成功する
- "Prepare Agent Credentials" ステージが成功する
- "Setup Environment" ステージが成功する
- "Setup Node.js Environment" ステージが成功する
- "Execute Auto Issue" ステージが成功する
  - `node dist/index.js auto-issue --category bug --agent auto` が実行される
- GitHub上に新規Issueが作成される（bugカテゴリ）
- ビルドが成功する

**確認項目**:
- [ ] すべてのステージが成功している
- [ ] auto-issueコマンドが実行されている
- [ ] 新規Issueが作成されている
- [ ] ビルドが成功している

---

#### IT-AUTO-ISSUE-02: 全カテゴリの動作確認

**目的**: すべてのカテゴリ選択肢が正しく動作することを検証

**前提条件**:
- Jenkins環境が稼働中
- すべての認証情報が設定済み

**テスト手順**:
1. 以下の各カテゴリについて、順次ビルドを実行:
   - `bug`
   - `refactor`
   - `enhancement`
   - `all`
2. 各ビルドの "Execute Auto Issue" ステージのログを確認

**期待結果**:
- すべてのカテゴリでビルドが成功する
- 各カテゴリで正しいCLIコマンドが実行される
- エラーが発生しない

**確認項目**:
- [ ] bugが成功する
- [ ] refactorが成功する
- [ ] enhancementが成功する
- [ ] allが成功する

---

#### IT-AUTO-ISSUE-03: Initialize Workflowステージが存在しないことを確認

**目的**: Jenkinsfile.auto-issueには Initialize Workflow ステージが存在しないことを検証

**前提条件**:
- Jenkins環境が稼働中

**テスト手順**:
1. Jenkins Jobを作成
2. ビルドを実行
3. ステージ一覧を確認

**期待結果**:
- "Initialize Workflow" ステージが存在しない
- "Execute Auto Issue" ステージが直接実行される
- ビルドが成功する

**確認項目**:
- [ ] Initialize Workflowステージが存在しない
- [ ] Execute Auto Issueステージが実行されている
- [ ] ビルドが成功している

---

### 2.7 エラーハンドリング統合テスト

#### IT-ERROR-01: AWS認証情報未設定エラー

**目的**: AWS認証情報未設定時にエラーが発生することを検証

**前提条件**:
- Jenkins環境が稼働中
- AWS_ACCESS_KEY_IDまたはAWS_SECRET_ACCESS_KEYが未設定

**テスト手順**:
1. Jenkins Jobを作成（任意のJenkinsfileを使用）
2. AWS_ACCESS_KEY_IDを未設定（空文字列）にしてビルドを実行
3. "Prepare Agent Credentials" ステージのログを確認

**期待結果**:
- `AWS credentials are not set` エラーメッセージが表示される
- "Prepare Agent Credentials" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

#### IT-ERROR-02: リポジトリクローンエラー

**目的**: 不正なGITHUB_TOKENでリポジトリクローンに失敗することを検証

**前提条件**:
- Jenkins環境が稼働中
- GITHUB_TOKENが無効または期限切れ

**テスト手順**:
1. Jenkins Jobを作成
2. 無効なGITHUB_TOKENを設定してビルドを実行
3. "Setup Environment" ステージのログを確認

**期待結果**:
- `git clone` コマンドが失敗する
- 認証エラーメッセージが表示される（例: `Authentication failed`）
- "Setup Environment" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

#### IT-ERROR-03: npm installエラー

**目的**: package.jsonに不正な依存関係がある場合にnpm installが失敗することを検証

**前提条件**:
- Jenkins環境が稼働中
- リポジトリのpackage.jsonに不正な依存関係が記載されている（テスト用ブランチを作成）

**テスト手順**:
1. テスト用ブランチを作成し、package.jsonに存在しないパッケージを追加
2. Jenkins Jobを作成（テスト用ブランチを指定）
3. ビルドを実行
4. "Setup Node.js Environment" ステージのログを確認

**期待結果**:
- `npm install` コマンドが失敗する
- エラーメッセージが表示される（例: `404 Not Found`）
- "Setup Node.js Environment" ステージが失敗する
- ビルドが失敗する

**確認項目**:
- [ ] エラーメッセージが明確である
- [ ] ビルドが失敗している
- [ ] 後続のステージが実行されない

---

### 2.8 並行運用テスト

#### IT-PARALLEL-01: 既存Jenkinsfileとの並行運用

**目的**: 既存Jenkinsfileと新Jenkinsfileが同時に動作し、互いに影響を与えないことを検証

**前提条件**:
- Jenkins環境が稼働中
- 既存 `Jenkinsfile` が存在
- 新しい `jenkins/Jenkinsfile.all-phases` が存在
- すべての認証情報が設定済み

**テスト手順**:
1. 既存JenkinsfileのJobを作成（`AI Workflow Orchestrator`）
2. 新JenkinsfileのJobを作成（`AI Workflow - All Phases`）
3. 両方のJobを同時に実行（異なるIssueを指定）
4. 各ビルドのログを確認

**期待結果**:
- 既存Jenkinsfileのビルドが成功する
- 新Jenkinsfileのビルドが成功する
- 両者が互いに影響を与えない（REPOS_ROOTが独立している）
- 両者の実行結果が同等である（同じIssueを処理した場合）

**確認項目**:
- [ ] 既存Jenkinsfileが正常に動作している
- [ ] 新Jenkinsfileが正常に動作している
- [ ] 両者が独立して動作している
- [ ] 実行結果が同等である

---

#### IT-PARALLEL-02: 実行時間の比較

**目的**: 新Jenkinsfileの実行時間が既存Jenkinsfileと同等またはそれ以下であることを検証

**前提条件**:
- Jenkins環境が稼働中
- 既存 `Jenkinsfile` が存在
- 新しい `jenkins/Jenkinsfile.all-phases` が存在
- 同じIssueを処理可能

**テスト手順**:
1. 既存JenkinsfileのJobを実行し、実行時間を記録
2. 新JenkinsfileのJobを実行し、実行時間を記録
3. 実行時間を比較

**期待結果**:
- 新Jenkinsfileの実行時間が既存Jenkinsfileと比較して±5%以内である
- common.groovyのロードオーバーヘッドが無視できるレベル（数ミリ秒）である

**確認項目**:
- [ ] 新Jenkinsfileの実行時間が許容範囲内である
- [ ] パフォーマンス劣化が発生していない

---

## 3. テストデータ

### 3.1 テスト用Issue

以下のテスト用Issueを作成します：

| Issue番号 | タイトル | 用途 |
|----------|---------|------|
| #999 | [TEST] Integration test for Jenkinsfile refactoring | 全テストシナリオで共通使用 |
| #998 | [TEST] Bug fix test | bugカテゴリ自動Issue生成のテスト |
| #997 | [TEST] Refactor test | refactorカテゴリ自動Issue生成のテスト |

### 3.2 認証情報テストデータ

| 認証情報 | 正常値 | 異常値 |
|---------|-------|-------|
| GITHUB_TOKEN | 有効なPersonal Access Token | 空文字列、無効なトークン、期限切れトークン |
| OPENAI_API_KEY | 有効なOpenAI API Key | 空文字列、無効なAPIキー |
| AWS_ACCESS_KEY_ID | 有効なAWS Access Key ID | 空文字列、無効なキー |
| AWS_SECRET_ACCESS_KEY | 有効なAWS Secret Access Key | 空文字列、無効なキー |
| AWS_SESSION_TOKEN | 有効なSession Token（オプション） | 空文字列（許可）、無効なトークン |
| claude-code-oauth-token | Jenkins Credentialsに登録済みのトークン | 未登録、不正なフォーマット |

### 3.3 パラメータテストデータ

#### ISSUE_URL
- **正常値**: `https://github.com/tielec/ai-workflow-agent/issues/999`
- **異常値**:
  - 空文字列
  - 不正なURL形式: `not-a-url`
  - 存在しないIssue: `https://github.com/tielec/ai-workflow-agent/issues/99999`

#### AGENT_MODE
- **正常値**: `auto`, `codex`, `claude`
- **異常値**: `invalid-mode`（Job DSLのchoiceパラメータで制限されるため、実質発生しない）

#### PRESET
- **正常値**: `review-requirements`, `review-design`, `review-test-scenario`, `quick-fix`, `implementation`, `testing`, `finalize`
- **異常値**: `invalid-preset`（Job DSLのchoiceパラメータで制限されるため、実質発生しない）

#### START_PHASE
- **正常値**: `planning`, `requirements`, `design`, `test-scenario`, `implementation`, `test-implementation`, `testing`, `documentation`, `report`, `evaluation`
- **異常値**: `invalid-phase`（Job DSLのchoiceパラメータで制限されるため、実質発生しない）

#### ROLLBACK_TO_PHASE
- **正常値**: （START_PHASEと同じ）
- **異常値**: （START_PHASEと同じ）

#### ROLLBACK_REASON
- **正常値**: `要件定義に不備があるため、修正が必要です。`（日本語テキスト、最大1000文字）
- **異常値**: 空文字列

#### AUTO_ISSUE_CATEGORY
- **正常値**: `bug`, `refactor`, `enhancement`, `all`
- **異常値**: `invalid-category`（Job DSLのchoiceパラメータで制限されるため、実質発生しない）

---

## 4. テスト環境要件

### 4.1 Jenkins環境

- **Jenkinsバージョン**: 2.x以上
- **必須プラグイン**:
  - Pipeline Plugin
  - Docker Pipeline Plugin
  - Job DSL Plugin
  - Credentials Plugin
  - Git Plugin

### 4.2 Docker環境

- **Dockerバージョン**: 24以上
- **必須イメージ**: `ai-workflow-agent:latest`（事前ビルド済み）
- **Docker Socketマウント**: `/var/run/docker.sock:/var/run/docker.sock`

### 4.3 Node.js環境（Dockerコンテナ内）

- **Node.jsバージョン**: 18.x以上
- **npmバージョン**: 9.x以上

### 4.4 外部サービス

- **GitHub API**: 利用可能（Issue作成、PR作成、コメント投稿）
- **OpenAI API**: 利用可能（Codexエージェント）
- **AWS S3**: 利用可能（成果物アーカイブ、オプション）

### 4.5 Jenkins Credentials

以下の認証情報をJenkins Credentialsに登録する必要があります：

| Credentials ID | 種類 | 説明 |
|---------------|-----|------|
| `claude-code-oauth-token` | Secret file | Base64エンコードされたClaude Code認証情報 |
| `github-token` | Secret text | GitHub Personal Access Token（Job DSL用） |

### 4.6 ファイルシステム

- `/tmp` ディレクトリへの書き込み権限（REPOS_ROOT作成用）
- `/root/.claude-code` ディレクトリへの書き込み権限（credentials.json作成用）

---

## 5. テスト実行手順

### 5.1 事前準備

1. **Jenkins環境のセットアップ**
   - Jenkinsをインストール・起動
   - 必須プラグインをインストール
   - Jenkins Credentialsに認証情報を登録

2. **Dockerイメージのビルド**
   ```bash
   cd /path/to/ai-workflow-agent
   docker build -t ai-workflow-agent:latest .
   ```

3. **テスト用Issueの作成**
   - GitHub上に #999, #998, #997 を作成

4. **Job DSLの実行**
   - `jenkins/jobs/dsl/ai-workflow/ai_workflow_orchestrator.groovy` を実行
   - 各実行モード専用のJobが作成されることを確認

### 5.2 テスト実行順序

以下の順序でテストを実行します：

1. **共通処理モジュール（common.groovy）のテスト**
   - IT-COMMON-01 ~ IT-COMMON-05

2. **Jenkinsfile.all-phasesのテスト**
   - IT-ALL-PHASES-01 ~ IT-ALL-PHASES-03

3. **Jenkinsfile.presetのテスト**
   - IT-PRESET-01 ~ IT-PRESET-03

4. **Jenkinsfile.single-phaseのテスト**
   - IT-SINGLE-PHASE-01 ~ IT-SINGLE-PHASE-02

5. **Jenkinsfile.rollbackのテスト**
   - IT-ROLLBACK-01 ~ IT-ROLLBACK-02

6. **Jenkinsfile.auto-issueのテスト**
   - IT-AUTO-ISSUE-01 ~ IT-AUTO-ISSUE-03

7. **エラーハンドリング統合テスト**
   - IT-ERROR-01 ~ IT-ERROR-03

8. **並行運用テスト**
   - IT-PARALLEL-01 ~ IT-PARALLEL-02

### 5.3 テスト結果の記録

各テストシナリオについて、以下の情報を記録します：

- **テストID**: （例: IT-COMMON-01）
- **実行日時**: （例: 2025-01-31 10:00:00）
- **実行者**: （例: Jenkins自動実行）
- **結果**: 成功/失敗
- **ビルド番号**: （例: #42）
- **実行時間**: （例: 5分30秒）
- **確認項目チェック結果**: すべて✓/一部✗
- **備考**: （エラーメッセージ、特記事項等）

### 5.4 テスト完了基準

以下の条件をすべて満たした場合、テストを完了とします：

- [ ] すべての統合テストシナリオが成功する（IT-COMMON-01 ~ IT-PARALLEL-02）
- [ ] 確認項目がすべてチェックされている
- [ ] エラーハンドリングが適切に動作する
- [ ] 既存Jenkinsfileと新Jenkinsfileの実行結果が同等である
- [ ] 実行時間が許容範囲内である（±5%以内）
- [ ] 並行運用が問題なく機能する

---

## 6. リスクと軽減策

### リスク1: Jenkins環境でのロードエラー

**シナリオ**: IT-ALL-PHASES-03, IT-PRESET-01等

**影響度**: 高（すべてのJenkinsfileが動作不能）

**軽減策**:
- common.groovyの構文を事前検証（Groovy静的解析ツールを使用）
- テスト実行前に `load` 構文をJenkins Pipeline Syntax Generatorで確認
- 問題発生時は既存Jenkinsfileにロールバック

### リスク2: パラメータの受け渡し不備

**シナリオ**: IT-ALL-PHASES-02, IT-ROLLBACK-02等

**影響度**: 中（特定の実行モードのみ影響）

**軽減策**:
- すべてのパラメータパターンを網羅的にテスト（正常値、異常値、境界値）
- エラーメッセージを充実させ、問題の早期発見を促進
- Job DSLパラメータのバリデーションを強化

### リスク3: 認証情報のビルドログへの露出

**シナリオ**: IT-COMMON-01等

**影響度**: 高（セキュリティリスク）

**軽減策**:
- `withCredentials` ヘルパーを使用し、マスキングを徹底
- ビルドログを確認し、認証情報の値が出力されていないことを検証
- 認証情報の存在のみを確認する（値は出力しない）

### リスク4: 並行運用期間中の混乱

**シナリオ**: IT-PARALLEL-01, IT-PARALLEL-02

**影響度**: 低（ユーザー体験の低下）

**軽減策**:
- 旧Jenkinsfileに非推奨警告コメントを追加
- ドキュメントに移行手順を明記
- 移行完了後、旧Jenkinsfileを削除する前に十分な猶予期間を設ける

---

## 7. 品質ゲート（Phase 3）

### 必須要件

- [x] **Phase 2の戦略に沿ったテストシナリオである**: INTEGRATION_ONLYに基づき、統合テストシナリオのみを作成
- [x] **主要な正常系がカバーされている**: 各実行モード（all-phases, preset, single-phase, rollback, auto-issue）の正常系をカバー
- [x] **主要な異常系がカバーされている**: 認証情報エラー、パラメータ不正、ロードエラー等の異常系をカバー
- [x] **期待結果が明確である**: 各テストシナリオで具体的な期待結果と確認項目を記載

### 推奨事項

- [x] テストシナリオが実行可能である（曖昧な表現を避ける）
- [x] テストデータが具体的である（正常値、異常値、境界値を明記）
- [x] テスト環境要件が明確である（Jenkins、Docker、Node.js等）
- [x] リスクと軽減策が記載されている
- [x] テスト実行手順が明確である

---

## 8. 成功指標

### 8.1 カバレッジ指標

- **共通処理モジュール**: 100%カバー（4関数すべてテスト済み）
- **Jenkinsfile**: 100%カバー（5つすべてテスト済み）
- **エラーハンドリング**: 主要なエラーケースをカバー（認証エラー、パラメータエラー、ロードエラー）

### 8.2 品質指標

- **テスト成功率**: 100%（すべての統合テストが成功）
- **実行時間**: 既存Jenkinsfileと比較して±5%以内
- **並行運用成功率**: 100%（既存Jenkinsfileと新Jenkinsfileが同時動作可能）

### 8.3 互換性指標

- **既存Jenkinsfileとの動作一致率**: 100%（同じIssueで同等の結果）
- **パラメータ互換性**: 100%（既存パラメータがすべて動作）

---

## 9. 完了条件

以下の条件をすべて満たした場合、Phase 3（Test Scenario Phase）は完了とします：

- [x] テスト戦略サマリーが記載されている
- [x] すべての統合テストシナリオが作成されている（共通処理、5つのJenkinsfile、エラーハンドリング、並行運用）
- [x] 各テストシナリオに目的、前提条件、テスト手順、期待結果、確認項目が記載されている
- [x] テストデータが定義されている
- [x] テスト環境要件が明確である
- [x] テスト実行手順が記載されている
- [x] 品質ゲート（4つの必須要件）をすべて満たしている

---

**作成日**: 2025-01-31
**最終更新日**: 2025-01-31
**ステータス**: 初版作成完了
