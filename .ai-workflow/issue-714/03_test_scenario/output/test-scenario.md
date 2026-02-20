# テストシナリオ: Issue #714 — Jenkins に split-issue ジョブを追加

## 0. 前フェーズ成果物の確認

### Planning Document・要件定義書・設計書の参照

| 項目 | 策定内容 |
|------|---------|
| 実装戦略 | **CREATE** — 新規ファイル2件の作成と既存ファイル2件への追記 |
| テスト戦略 | **UNIT_ONLY** — Jenkins パイプライン定義は静的検証のみ |
| テストコード戦略 | **CREATE_TEST** — 構文検証・整合性チェックの新規テスト作成 |
| 複雑度 | **簡単** — 既存テンプレートの差分変更が中心 |
| リスク評価 | **低** — テンプレート元（`rewrite-issue`）が安定稼働中 |

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY** — ユニットテスト（静的検証）のみを実施する。

### 1.2 テスト対象の範囲

本 Issue の成果物は Jenkins パイプライン定義ファイル（Groovy）と設定ファイル（YAML/Markdown）であり、実際のパイプライン動作は Jenkins 環境でのみ検証可能である。コードレベルで実施可能なテストは以下の静的検証に限定される：

| テスト対象 | 検証内容 |
|-----------|---------|
| `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` | ファイル存在、パラメータ参照、ステージ構成、CLI コマンド構築、post 処理 |
| `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy` | ファイル存在、パラメータ定義（19個）、フォルダ構成、scriptPath 参照 |
| `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` | YAML 構文、`ai_workflow_split_issue_job` エントリの構造・値 |
| `jenkins/README.md` | ジョブ一覧テーブル、ディレクトリ構造図、フォルダ構成図、ジョブ種類数 |
| `jenkins/jobs/dsl/ai-workflow/validate_dsl.sh` | split-issue の Jenkinsfile パスと scriptPath 整合性チェックの追加 |

### 1.3 テストの目的

1. 新規作成ファイルが正しいパスに存在し、適切な内容を含むことを保証する
2. `rewrite-issue` テンプレートからの差分変更が意図通りであることを検証する
3. ファイル間の整合性（DSL ↔ Jenkinsfile ↔ job-config.yaml）を確認する
4. `MAX_SPLITS` パラメータの追加が正しく実装されていることを検証する
5. 既存ジョブへの影響がないことを確認する

### 1.4 テストパターンの参考

既存の `tests/integration/jenkins/rewrite-issue-job.test.ts`（IT-001〜IT-016）のテストパターンを踏襲し、`split-issue` 固有の検証項目を追加する。テストフレームワークは Jest（TypeScript）を使用する。

---

## 2. ユニットテストシナリオ

### 2.1 テストファイル構成

```
tests/integration/jenkins/split-issue-job.test.ts
```

テストは以下の `describe` グループに分類する：

| グループ | テストID | テスト数 | 概要 |
|---------|---------|---------|------|
| DSL 構文と scriptPath 参照 | UT-001〜UT-003 | 3 | DSL ファイルの基本検証 |
| job-config.yaml エントリ | UT-004〜UT-006 | 3 | シード設定の検証 |
| Jenkinsfile 構成 | UT-007〜UT-013 | 7 | パイプライン定義の検証 |
| Job DSL パラメータ定義 | UT-014〜UT-018 | 5 | パラメータ完全性の検証 |
| rewrite-issue との差分 | UT-019〜UT-023 | 5 | テンプレート差分の意図検証 |
| ビルド・検証・CLI ヘルプ | UT-024〜UT-026 | 3 | 実行可能性の検証 |
| validate_dsl.sh 拡張 | UT-027〜UT-028 | 2 | 検証スクリプトの更新確認 |

**合計: 28 テストケース**

---

### 2.2 DSL 構文と scriptPath 参照の検証

#### UT-001: DSL ファイルの存在確認

- **目的**: Job DSL ファイルが正しいパスに存在することを検証する
- **前提条件**: リポジトリルートが解決可能である
- **入力**: ファイルパス `jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy`
- **期待結果**: ファイルが存在し、読み取り可能である（`fs.pathExists()` が `true` を返す）
- **対応要件**: FR-002-1, AC-011

#### UT-002: DSL の scriptPath が正しい Jenkinsfile パスを参照している

- **目的**: Job DSL の `scriptPath` 定義が正しい Jenkinsfile を指していることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: DSL 内に `scriptPath('jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile')` が含まれる
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-002-7

#### UT-003: scriptPath が参照する Jenkinsfile が実際に存在する

- **目的**: DSL が参照する Jenkinsfile が実際のファイルシステム上に存在することを検証する
- **前提条件**: リポジトリルートが解決可能である
- **入力**: ファイルパス `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile`
- **期待結果**: ファイルが存在する（`fs.pathExists()` が `true` を返す）
- **対応要件**: FR-001-1, AC-011

---

### 2.3 job-config.yaml エントリ検証

#### UT-004: job-config.yaml が YAML として正常にパースできる

- **目的**: `job-config.yaml` に構文エラーがないことを検証する
- **前提条件**: job-config.yaml ファイルが存在する
- **入力**: `jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml` のファイル内容
- **期待結果**: `yaml.parse()` がエラーなく完了し、有効な JavaScript オブジェクトが返される
- **テストデータ**: ファイル全体
- **対応要件**: FR-003-9, AC-010

#### UT-005: split_issue ジョブのエントリが必要項目を満たす

- **目的**: `ai_workflow_split_issue_job` エントリが正しいフィールドと値を持つことを検証する
- **前提条件**: job-config.yaml がパース済みである
- **入力**: パース結果の `jenkins-jobs.ai_workflow_split_issue_job` オブジェクト
- **期待結果**: 以下のフィールドが一致する
  ```typescript
  expect(entry).toMatchObject({
    name: 'split_issue',
    displayName: 'Split Issue',
    dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy',
    jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile',
    skipJenkinsfileValidation: true,
  });
  ```
- **テストデータ**: YAML パース結果
- **対応要件**: FR-003-1〜FR-003-6, AC-010

#### UT-006: 既存の rewrite_issue エントリが変更されていない

- **目的**: `ai_workflow_rewrite_issue_job` エントリが split-issue 追加により変更されていないことを検証する
- **前提条件**: job-config.yaml がパース済みである
- **入力**: パース結果の `jenkins-jobs.ai_workflow_rewrite_issue_job` オブジェクト
- **期待結果**: 以下のフィールドが元の値と一致する
  ```typescript
  expect(entry).toMatchObject({
    name: 'rewrite_issue',
    displayName: 'Rewrite Issue',
    dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy',
    jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile',
    skipJenkinsfileValidation: true,
  });
  ```
- **対応要件**: AC-009

---

### 2.4 Jenkinsfile 構成検証

#### UT-007: EXECUTION_MODE が 'split_issue' に設定されている

- **目的**: Jenkinsfile の `environment` ブロックで `EXECUTION_MODE` が正しく設定されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: `EXECUTION_MODE = 'split_issue'` が含まれる
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-001-2

#### UT-008: 必須パラメータ参照が Jenkinsfile 内に存在する

- **目的**: Jenkinsfile がすべての必須パラメータを参照していることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下のパラメータ参照がすべて含まれる
  - `params.ISSUE_NUMBER`
  - `params.GITHUB_REPOSITORY`
  - `params.LANGUAGE`
  - `params.AGENT_MODE`
  - `params.APPLY`
  - `params.DRY_RUN`
  - `params.GITHUB_TOKEN`
  - `params.MAX_SPLITS`
- **テストデータ**: 文字列配列によるループマッチング
- **対応要件**: FR-001-4, FR-001-5

#### UT-009: 必要な7つのステージが定義されている

- **目的**: パイプラインに必須の7ステージがすべて定義されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容から `stage('...')` パターンを抽出
- **期待結果**: 以下の7ステージがすべて存在する
  1. `Load Common Library`
  2. `Prepare Codex auth.json`
  3. `Prepare Agent Credentials`
  4. `Validate Parameters`
  5. `Setup Environment`
  6. `Setup Node.js Environment`
  7. `Execute Split Issue`
- **テストデータ**: 正規表現 `stage\('([^']+)'\)` で抽出した Set
- **対応要件**: FR-001-11

#### UT-010: split-issue CLI コマンドが正しく組み立てられている

- **目的**: Execute Split Issue ステージで CLI コマンドが正しく構築されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の文字列がすべて含まれる
  - `node dist/index.js split-issue`（CLI サブコマンド）
  - `--issue ${issueNumber}`（Issue 番号の受け渡し）
  - `--language ${params.LANGUAGE}`（言語オプション）
  - `--agent ${params.AGENT_MODE ?: 'auto'}`（エージェントモード）
  - `def applyFlag = params.APPLY ? '--apply' : ''`（APPLY フラグ構築）
  - `def dryRunFlag = (!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''`（DRY_RUN 排他制御）
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-001-3, FR-001-5, FR-001-6

#### UT-011: MAX_SPLITS パラメータの受け渡しロジックが実装されている

- **目的**: `MAX_SPLITS` パラメータが CLI に正しく渡されるロジックが存在することを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の文字列が含まれる
  - `params.MAX_SPLITS` への参照
  - `--max-splits` オプション文字列
  - 条件付きオプション構築ロジック（空の場合にオプション自体を省略するパターン）
- **テストデータ**: 文字列マッチング（`def maxSplitsOption = params.MAX_SPLITS ? "--max-splits ${params.MAX_SPLITS}" : ''` またはそれに相当するロジック）
- **対応要件**: FR-001-4, AC-008

#### UT-012: post 処理の成功/失敗 Webhook とクリーンアップが定義されている

- **目的**: パイプラインの post セクションで適切な後処理が定義されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の文字列がすべて含まれる
  - `post {`（post ブロックの存在）
  - `cleanWs()`（ワークスペースクリーンアップ）
  - `status: 'success'`（成功時 Webhook）
  - `status: 'failed'`（失敗時 Webhook）
  - `REPOS_ROOT cleaned up`（REPOS_ROOT クリーンアップログ）
  - `CODEX_HOME cleaned up`（CODEX_HOME クリーンアップログ）
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-001-8, FR-001-9, AC-005, AC-012

#### UT-013: パラメータバリデーションが実装されている

- **目的**: Validate Parameters ステージで必須パラメータのバリデーションが実装されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下のバリデーションロジックが含まれる
  - `ISSUE_NUMBER parameter is required`（ISSUE_NUMBER 空チェックのエラーメッセージ）
  - `ISSUE_NUMBER must be a number`（ISSUE_NUMBER 数値チェックのエラーメッセージ）
  - `GITHUB_REPOSITORY parameter is required`（GITHUB_REPOSITORY 空チェックのエラーメッセージ）
  - `owner/repo`（GITHUB_REPOSITORY フォーマットチェック）
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-001-12, AC-006

---

### 2.5 Job DSL パラメータ定義とフォルダ構成

#### UT-014: 必須パラメータが DSL 内で定義されている

- **目的**: Job DSL に必要なすべてのパラメータが定義されていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下のパラメータ名がすべて DSL 内に存在する
  - `EXECUTION_MODE`
  - `ISSUE_NUMBER`
  - `GITHUB_REPOSITORY`
  - `AGENT_MODE`
  - `LANGUAGE`
  - `APPLY`
  - `DRY_RUN`
  - `MAX_SPLITS`
  - `GITHUB_TOKEN`
  - `OPENAI_API_KEY`
  - `CODEX_API_KEY`
  - `CODEX_AUTH_JSON`
  - `CLAUDE_CODE_OAUTH_TOKEN`
  - `CLAUDE_CODE_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `LOG_LEVEL`
  - `JOB_ID`
  - `WEBHOOK_URL`
  - `WEBHOOK_TOKEN`
- **テストデータ**: 正規表現マッチング（19パラメータ）
- **対応要件**: FR-002-4, FR-002-6, FR-002-15, AC-002

#### UT-015: MAX_SPLITS パラメータが stringParam として定義されている

- **目的**: `MAX_SPLITS` パラメータが正しい型とデフォルト値で定義されていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の条件を満たす
  - `stringParam('MAX_SPLITS'` が含まれる（型が `stringParam` である）
  - `'10'` がデフォルト値として含まれる
  - 分割数上限に関する説明文が含まれる
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-002-4, FR-002-5

#### UT-016: EXECUTION_MODE が 'split_issue' に固定されている

- **目的**: Job DSL で `EXECUTION_MODE` が `split_issue` に固定されていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の条件を満たす
  - `choiceParam('EXECUTION_MODE', ['split_issue']` が含まれる（choiceParam で単一選択肢に固定）
  - `env('EXECUTION_MODE', 'split_issue')` が含まれる（environmentVariables での設定）
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-002-3, FR-002-8

#### UT-017: develop と stable-1〜9 フォルダを展開する定義がある

- **目的**: Job DSL が10フォルダ分のジョブ生成ロジックを持つことを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の定義が含まれる
  - `name: 'develop'`（develop フォルダの定義）
  - `stable-${i}`（stable フォルダのテンプレート定義）
- **テストデータ**: 正規表現マッチング
- **対応要件**: FR-002-10, AC-001

#### UT-018: ログローテーションと並行ビルド防止が設定されている

- **目的**: Job DSL にログローテーションと並行ビルド防止の設定が含まれていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の設定が含まれる
  - `numToKeep(30)`（ログ保持件数）
  - `daysToKeep(90)`（ログ保持日数）
  - `disableConcurrentBuilds()`（並行ビルド防止）
- **テストデータ**: 文字列マッチング
- **対応要件**: FR-002-11, FR-002-12

---

### 2.6 rewrite-issue との差分検証

#### UT-019: Jenkinsfile のモード表示が 'Split Issue' に変更されている

- **目的**: Jenkinsfile のモード表示文字列が `rewrite-issue` から `split-issue` に正しく変更されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の条件を満たす
  - `"Mode: Split Issue"` が含まれる
  - `"Mode: Rewrite Issue"` が含まれ**ない**
- **テストデータ**: 文字列の存在/非存在マッチング
- **対応要件**: FR-001-1

#### UT-020: ビルド説明が 'Split Issue' 形式になっている

- **目的**: `currentBuild.description` が `Split Issue` 形式で設定されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の条件を満たす
  - `"Split Issue #` が含まれる（ビルド説明プレフィックス）
  - `"Rewrite Issue #` が含まれ**ない**
- **テストデータ**: 文字列の存在/非存在マッチング
- **対応要件**: FR-001-7

#### UT-021: post セクションのログメッセージが 'Split Issue' に変更されている

- **目的**: post セクションの成功/失敗ログメッセージが `split-issue` 用に変更されていることを検証する
- **前提条件**: Jenkinsfile が読み込み済みである
- **入力**: Jenkinsfile の内容
- **期待結果**: 以下の条件を満たす
  - `"Split Issue Success"` が含まれる
  - `"Split Issue Failure"` が含まれる
  - `"Split issue completed"` が含まれる
  - `"Rewrite Issue Success"` が含まれ**ない**
  - `"Rewrite Issue Failure"` が含まれ**ない**
  - `"Rewrite issue completed"` が含まれ**ない**
- **テストデータ**: 文字列の存在/非存在マッチング
- **対応要件**: FR-001-9

#### UT-022: Job DSL の description が分割機能の説明になっている

- **目的**: Job DSL の `description` が `split-issue` の機能説明に変更されていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の条件を満たす
  - `AI Workflow - Split Issue` が含まれる（タイトル）
  - 「分割」または「split」に関する機能説明が含まれる
  - `AI Workflow - Rewrite Issue` が含まれ**ない**
- **テストデータ**: 文字列の存在/非存在マッチング
- **対応要件**: FR-002-9, FR-002-14

#### UT-023: Job DSL の jobKey が 'ai_workflow_split_issue_job' に設定されている

- **目的**: Job DSL のジョブキーが正しく設定されていることを検証する
- **前提条件**: DSL ファイルが読み込み済みである
- **入力**: DSL ファイルの内容
- **期待結果**: 以下の条件を満たす
  - `'ai_workflow_split_issue_job'` が含まれる
  - `'ai_workflow_rewrite_issue_job'` が含まれ**ない**（テンプレート残りがないこと）
- **テストデータ**: 文字列の存在/非存在マッチング
- **対応要件**: FR-002-2

---

### 2.7 ビルド・検証・CLI ヘルプの実行確認

#### UT-024: npm run build が成功し dist/index.js が生成される

- **目的**: TypeScript ビルドが正常に完了し、CLI エントリポイントが生成されることを検証する
- **前提条件**: npm パッケージがインストール済みである
- **入力**: `npm run build` コマンドの実行
- **期待結果**:
  - コマンドがエラーなく完了する
  - `dist/index.js` ファイルが存在する
- **テストデータ**: `execFile('npm', ['run', 'build'])` の実行結果
- **対応要件**: TC-005

#### UT-025: npm run validate が正常終了する

- **目的**: プロジェクト全体の lint/test/build 検証が正常に完了することを検証する
- **前提条件**: npm パッケージがインストール済みである
- **入力**: `npm run validate` コマンドの実行（`SKIP_VALIDATE_TEST=1` で再帰防止）
- **期待結果**: コマンドがエラーなく完了する
- **テストデータ**: `execFile('npm', ['run', 'validate'])` の実行結果
- **注意**: 再帰実行を避けるため、子プロセス側では `SKIP_VALIDATE_TEST=1` を設定する。`SKIP_VALIDATE_TEST=1` が設定されている場合はスキップする。
- **対応要件**: Phase 6 品質ゲート

#### UT-026: node dist/index.js split-issue --help がヘルプを出力する

- **目的**: `split-issue` CLI コマンドのヘルプが正常に表示されることを検証する
- **前提条件**: ビルドが完了している（`dist/index.js` が存在する）
- **入力**: `node dist/index.js split-issue --help` コマンドの実行
- **期待結果**:
  - コマンドが正常終了する
  - `Split complex GitHub Issue into feature-based sub-issues` が出力に含まれる
  - `--issue <number>` が出力に含まれる
  - `--max-splits <number>` が出力に含まれる
- **テストデータ**: `execFile('node', ['dist/index.js', 'split-issue', '--help'])` の実行結果
- **対応要件**: DEP-001, DEP-005

---

### 2.8 validate_dsl.sh 拡張検証

#### UT-027: validate_dsl.sh に split-issue の Jenkinsfile パスが追加されている

- **目的**: `validate_dsl.sh` の `expected_paths` 配列に split-issue の Jenkinsfile パスが含まれていることを検証する
- **前提条件**: `validate_dsl.sh` が読み込み済みである
- **入力**: `validate_dsl.sh` の内容
- **期待結果**: `jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile` が含まれる
- **テストデータ**: 文字列マッチング
- **対応要件**: AC-011

#### UT-028: validate_dsl.sh に split-issue の scriptPath 整合性チェックが追加されている

- **目的**: `validate_dsl.sh` に `ai_workflow_split_issue_job.groovy` の scriptPath 検証が追加されていることを検証する
- **前提条件**: `validate_dsl.sh` が読み込み済みである
- **入力**: `validate_dsl.sh` の内容
- **期待結果**: `ai_workflow_split_issue_job.groovy has correct scriptPath` が含まれる
- **テストデータ**: 文字列マッチング
- **対応要件**: AC-011

---

## 3. テストデータ

### 3.1 ファイルパス定数

テストで使用するファイルパスの定数定義：

```typescript
const paths = {
  dsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy'),
  jenkinsfile: path.join(projectRoot, 'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile'),
  jobConfig: path.join(projectRoot, 'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'),
  validateDsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/validate_dsl.sh'),
  readme: path.join(projectRoot, 'jenkins/README.md'),
  distIndex: path.join(projectRoot, 'dist/index.js'),
  // テンプレート元（比較用）
  rewriteDsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy'),
  rewriteJenkinsfile: path.join(projectRoot, 'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile'),
};
```

### 3.2 正常データ

| データ項目 | 期待値 |
|-----------|--------|
| EXECUTION_MODE | `'split_issue'` |
| CLI サブコマンド | `split-issue` |
| ステージ名 | `'Execute Split Issue'` |
| ビルド説明プレフィックス | `"Split Issue #"` |
| 成功ログ | `"Split Issue Success"` |
| 失敗ログ | `"Split Issue Failure"` |
| Job DSL キー | `'ai_workflow_split_issue_job'` |
| job-config name | `'split_issue'` |
| job-config displayName | `'Split Issue'` |
| MAX_SPLITS デフォルト値 | `'10'` |
| パラメータ総数 | 19 |

### 3.3 異常データ（テンプレート残り検出用）

テンプレート元（`rewrite-issue`）の文字列が残っていないことを確認するための文字列：

| 検出対象文字列 | 検出ファイル | 許容 |
|--------------|-----------|------|
| `"Mode: Rewrite Issue"` | Jenkinsfile | 含まれてはならない |
| `"Rewrite Issue #"` | Jenkinsfile | 含まれてはならない |
| `"Rewrite Issue Success"` | Jenkinsfile | 含まれてはならない |
| `"Rewrite Issue Failure"` | Jenkinsfile | 含まれてはならない |
| `"Rewrite issue completed"` | Jenkinsfile | 含まれてはならない |
| `EXECUTION_MODE = 'rewrite_issue'` | Jenkinsfile | 含まれてはならない |
| `'ai_workflow_rewrite_issue_job'` | DSL | 含まれてはならない |
| `AI Workflow - Rewrite Issue` | DSL | 含まれてはならない |
| `['rewrite_issue']` | DSL | 含まれてはならない |
| `node dist/index.js rewrite-issue` | Jenkinsfile | 含まれてはならない |

---

## 4. テストコードの擬似実装

以下は `tests/integration/jenkins/split-issue-job.test.ts` の擬似コード構造を示す。

```typescript
/**
 * Integration tests for Issue #714: split-issue Jenkins pipeline & Job DSL
 *
 * Test Strategy: UNIT_ONLY (static validation of Job DSL, Jenkinsfile, seed config)
 * Covered Scenarios: UT-001〜UT-028
 */
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import yaml from 'yaml';

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

describe('Integration: split-issue Jenkins pipeline (Issue #714)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const execFileAsync = promisify(execFile);
  const longTimeoutMs = 10 * 60 * 1000;
  const paths = { /* ... ファイルパス定数 ... */ };

  let dslContent: string;
  let jenkinsfileContent: string;
  let jobConfig: Record<string, unknown>;
  let validateDslContent: string;

  jest.setTimeout(longTimeoutMs);

  beforeAll(async () => {
    // 全ファイルを並行読み込み
    const [dslRaw, jfRaw, jobConfigRaw, validateDslRaw] = await Promise.all([
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
      fs.readFile(paths.jobConfig, 'utf8'),
      fs.readFile(paths.validateDsl, 'utf8'),
    ]);
    dslContent = dslRaw;
    jenkinsfileContent = jfRaw;
    jobConfig = yaml.parse(jobConfigRaw);
    validateDslContent = validateDslRaw;
  });

  describe('UT-001/UT-002/UT-003: DSL構文とscriptPath参照の検証', () => {
    // ... UT-001〜UT-003 の実装
  });

  describe('UT-004/UT-005/UT-006: job-config.yaml エントリ検証', () => {
    // ... UT-004〜UT-006 の実装
  });

  describe('UT-007〜UT-013: Jenkinsfile 構成検証', () => {
    // ... UT-007〜UT-013 の実装
  });

  describe('UT-014〜UT-018: Job DSL パラメータ定義とフォルダ構成', () => {
    // ... UT-014〜UT-018 の実装
  });

  describe('UT-019〜UT-023: rewrite-issue との差分検証', () => {
    // ... UT-019〜UT-023 の実装
  });

  describe('UT-024/UT-025/UT-026: ビルド・検証・CLIヘルプの実行確認', () => {
    // ... UT-024〜UT-026 の実装
  });

  describe('UT-027/UT-028: validate_dsl.sh 拡張検証', () => {
    // ... UT-027〜UT-028 の実装
  });
});
```

---

## 5. テスト環境要件

### 5.1 実行環境

| 要件 | 詳細 |
|------|------|
| Node.js | 20.x 以上 |
| npm | インストール済み |
| テストフレームワーク | Jest（既存プロジェクト設定に準拠） |
| TypeScript | プロジェクト既存の `tsconfig.json` に準拠 |
| OS | Linux（CI 環境）/ macOS / Windows |

### 5.2 必要なパッケージ（既存プロジェクトに含まれる）

| パッケージ | 用途 |
|-----------|------|
| `@jest/globals` | テストフレームワーク API |
| `fs-extra` | ファイルシステム操作 |
| `yaml` | YAML パース |
| `child_process` | 外部コマンド実行（npm build/validate、CLI ヘルプ） |

### 5.3 モック/スタブの必要性

**不要** — 本テストは静的検証（ファイル内容の文字列マッチング、YAML パース、外部コマンド実行）のみであり、モック/スタブは使用しない。全テストは実際のファイルシステム上のファイルを直接読み取り、内容を検証する。

### 5.4 テスト実行コマンド

```bash
# 個別テスト実行
npx jest tests/integration/jenkins/split-issue-job.test.ts

# プロジェクト全体のテスト実行
npm run validate
```

---

## 6. 要件カバレッジマトリクス

### 6.1 機能要件のカバレッジ

| 要件ID | 要件概要 | テストID | カバレッジ |
|--------|---------|---------|-----------|
| FR-001-1 | rewrite-issue/Jenkinsfile ベーステンプレート | UT-019 | ✅ |
| FR-001-2 | EXECUTION_MODE = 'split_issue' | UT-007 | ✅ |
| FR-001-3 | Execute Split Issue ステージで CLI 実行 | UT-009, UT-010 | ✅ |
| FR-001-4 | --max-splits パラメータ受け渡し | UT-008, UT-011 | ✅ |
| FR-001-5 | 共通 CLI オプションの受け渡し | UT-008, UT-010 | ✅ |
| FR-001-6 | APPLY/DRY_RUN 排他制御 | UT-010 | ✅ |
| FR-001-7 | ビルド説明 Split Issue 形式 | UT-020 | ✅ |
| FR-001-8 | Webhook 通知 | UT-012 | ✅ |
| FR-001-9 | post ログメッセージ | UT-021 | ✅ |
| FR-001-10 | common.groovy ロード | UT-009 | ✅ |
| FR-001-11 | 7ステージ構成 | UT-009 | ✅ |
| FR-001-12 | パラメータバリデーション | UT-013 | ✅ |
| FR-001-13 | Docker エージェント設定 | ※テンプレート踏襲のため個別テスト省略 | — |
| FR-001-14 | コメントヘッダー更新 | UT-019 | ✅ |
| FR-002-1 | rewrite-issue DSL ベーステンプレート | UT-001 | ✅ |
| FR-002-2 | jobKey 設定 | UT-023 | ✅ |
| FR-002-3 | EXECUTION_MODE choiceParam | UT-016 | ✅ |
| FR-002-4 | MAX_SPLITS パラメータ定義 | UT-015 | ✅ |
| FR-002-5 | MAX_SPLITS 配置位置 | UT-015 | ✅ |
| FR-002-6 | パラメータ総数 19 | UT-014 | ✅ |
| FR-002-7 | scriptPath 設定 | UT-002 | ✅ |
| FR-002-8 | environmentVariables | UT-016 | ✅ |
| FR-002-9 | description 更新 | UT-022 | ✅ |
| FR-002-10 | 10フォルダ生成 | UT-017 | ✅ |
| FR-002-11 | ログローテーション | UT-018 | ✅ |
| FR-002-12 | disableConcurrentBuilds | UT-018 | ✅ |
| FR-002-13 | Git SCM 設定 | ※テンプレート踏襲のため個別テスト省略 | — |
| FR-002-14 | コメントヘッダー更新 | UT-022 | ✅ |
| FR-002-15 | 共通パラメータ踏襲 | UT-014 | ✅ |
| FR-003-1 | エントリキー | UT-005 | ✅ |
| FR-003-2 | name フィールド | UT-005 | ✅ |
| FR-003-3 | displayName フィールド | UT-005 | ✅ |
| FR-003-4 | dslfile フィールド | UT-005 | ✅ |
| FR-003-5 | jenkinsfile フィールド | UT-005 | ✅ |
| FR-003-6 | skipJenkinsfileValidation | UT-005 | ✅ |
| FR-003-7 | 配置位置 | ※YAML エントリ順序はパース時に非保証のため静的検証対象外 | — |
| FR-003-8 | フォーマット準拠 | UT-004 | ✅ |
| FR-003-9 | YAML 構文検証 | UT-004 | ✅ |
| FR-004-1〜FR-004-6 | README 更新 | ※ドキュメントの静的検証は実装フェーズで目視確認 | — |

### 6.2 受け入れ基準のカバレッジ

| AC-ID | 受け入れ基準概要 | テストID | カバレッジ |
|-------|----------------|---------|-----------|
| AC-001 | 10フォルダ自動生成 | UT-017 | ✅（DSL ロジック存在確認） |
| AC-002 | 19パラメータ表示 | UT-014 | ✅ |
| AC-005 | Webhook 通知 | UT-012 | ✅ |
| AC-006 | パラメータバリデーション | UT-013 | ✅ |
| AC-007 | APPLY/DRY_RUN 排他制御 | UT-010 | ✅ |
| AC-008 | MAX_SPLITS 受け渡し | UT-011 | ✅ |
| AC-009 | 既存ジョブへの非影響 | UT-006 | ✅ |
| AC-010 | job-config.yaml 構文整合性 | UT-004, UT-005 | ✅ |
| AC-011 | ファイル配置の正確性 | UT-001, UT-003 | ✅ |
| AC-012 | ワークスペースクリーンアップ | UT-012 | ✅ |

> **注記**: AC-003（Dry-run 実行）、AC-004（Apply 実行）は Jenkins 環境での E2E テストが必要であり、本 Issue のスコープ外（OUT-006）。静的検証として CLI コマンド構築ロジックの正確性を UT-010, UT-011 で検証する。

---

## 7. 品質ゲート確認

### Phase 3 品質ゲート

- [x] **Phase 2 の戦略に沿ったテストシナリオである** — UNIT_ONLY 戦略に基づき、静的検証（ファイル存在確認、文字列マッチング、YAML パース、CLI ヘルプ確認）のみで構成。Integration/BDD シナリオは作成していない。
- [x] **主要な正常系がカバーされている** — 新規ファイル2件の存在・内容検証、job-config.yaml のエントリ検証、Jenkinsfile の全7ステージ検証、19パラメータの定義確認、CLI ヘルプ出力確認を網羅。
- [x] **主要な異常系がカバーされている** — テンプレート残り検出（`rewrite-issue` 文字列の非存在確認）、YAML 構文エラー検出、パラメータバリデーションメッセージの存在確認、既存エントリへの非影響確認を実施。
- [x] **期待結果が明確である** — 各テストケースで具体的な文字列マッチング条件、`toMatchObject()` による構造検証、`fs.pathExists()` によるファイル存在確認など、検証可能な期待結果を記載。

### 追加品質チェック

- [x] 全28テストケースが要件定義書の機能要件（FR-001〜FR-004）にトレース可能
- [x] 受け入れ基準（AC-001〜AC-012）のうち、静的検証可能な項目がすべてカバー
- [x] 既存テスト（`rewrite-issue-job.test.ts`）のパターンと一貫したテスト構造
- [x] テスト実行に特別な環境（Jenkins サーバー等）を必要としない
