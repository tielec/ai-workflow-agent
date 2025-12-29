# テストシナリオ

## Issue概要

- **Issue番号**: #545
- **タイトル**: feat: Add GitHub Actions CI workflows for automated testing and build verification
- **状態**: open
- **URL**: https://github.com/tielec/ai-workflow-agent/issues/545

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略: UNIT_ONLY

**判断根拠**（Planning Document / 設計書より引用）:
- GitHub Actionsワークフローファイル（YAML）は、GitHub上でのみ実行可能であり、ローカルでの自動テストは構文検証（YAMLリント）に限定される
- 本実装はワークフロー定義ファイルの作成であり、通常のアプリケーションコードではないため、Integration TestやBDD Testの対象外
- プロジェクトの既存テスト（143 test suites, 2180 tests）への変更は不要

### テスト対象の範囲

| 対象 | テスト種別 | 説明 |
|------|------------|------|
| `.github/workflows/test.yml` | YAML構文検証 | ワークフローファイルの構文正当性 |
| `.github/workflows/build.yml` | YAML構文検証 | ワークフローファイルの構文正当性 |
| 既存テストスイート | 影響確認 | 既存テストが影響を受けていないことの確認 |
| GitHub Actions実行 | 動作検証 | PR作成後にGitHub上で実施 |

### テストの目的

1. **構文正当性の保証**: ワークフローファイルがGitHub Actionsで正しく解析・実行できること
2. **既存コードへの非影響確認**: 新規ファイル追加が既存のテスト・ビルドに影響を与えないこと
3. **ワークフロー動作の検証**: GitHub Actions上でワークフローが期待通りに動作すること

---

## 2. Unitテストシナリオ

### 2.1 YAML構文検証テスト

#### TS-001: test.yml YAML構文検証

**テストケース名**: test_yml_yaml_syntax_validation

- **目的**: test.ymlが有効なYAML形式であり、構文エラーがないことを検証
- **前提条件**: `.github/workflows/test.yml`ファイルが作成されている
- **入力**: test.ymlファイル
- **期待結果**:
  - YAMLパーサーがエラーなく解析できる
  - インデントが正しい（2スペース）
  - 文字列のクォートが適切
- **テストデータ**: 作成されたtest.ymlファイル
- **検証方法**:
  ```bash
  # Node.js環境でのYAML検証
  node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/test.yml', 'utf8'))"

  # または yamllint（インストールされている場合）
  yamllint .github/workflows/test.yml
  ```

#### TS-002: build.yml YAML構文検証

**テストケース名**: build_yml_yaml_syntax_validation

- **目的**: build.ymlが有効なYAML形式であり、構文エラーがないことを検証
- **前提条件**: `.github/workflows/build.yml`ファイルが作成されている
- **入力**: build.ymlファイル
- **期待結果**:
  - YAMLパーサーがエラーなく解析できる
  - インデントが正しい（2スペース）
  - 文字列のクォートが適切
- **テストデータ**: 作成されたbuild.ymlファイル
- **検証方法**:
  ```bash
  # Node.js環境でのYAML検証
  node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/build.yml', 'utf8'))"

  # または yamllint（インストールされている場合）
  yamllint .github/workflows/build.yml
  ```

---

### 2.2 ワークフロー構造検証テスト

#### TS-003: test.yml トリガー設定検証

**テストケース名**: test_yml_trigger_configuration

- **目的**: test.ymlのトリガー設定が要件通りであることを検証
- **前提条件**: test.ymlファイルが作成されている
- **入力**: test.ymlの`on`セクション
- **期待結果**:
  - `push`トリガーが`main`と`develop`ブランチに設定されている
  - `pull_request`トリガーが`main`と`develop`ブランチに設定されている
- **検証方法**: YAML内容の目視確認またはスクリプトによる検証
  ```bash
  # YAMLをパースしてトリガー設定を確認
  node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    const doc = yaml.load(fs.readFileSync('.github/workflows/test.yml', 'utf8'));
    console.log('Push branches:', doc.on.push.branches);
    console.log('PR branches:', doc.on.pull_request.branches);
    const expected = ['main', 'develop'];
    const pushOk = JSON.stringify(doc.on.push.branches.sort()) === JSON.stringify(expected);
    const prOk = JSON.stringify(doc.on.pull_request.branches.sort()) === JSON.stringify(expected);
    if (!pushOk || !prOk) process.exit(1);
  "
  ```

#### TS-004: test.yml マトリックス設定検証

**テストケース名**: test_yml_matrix_configuration

- **目的**: test.ymlのマトリックス設定が要件通りであることを検証
- **前提条件**: test.ymlファイルが作成されている
- **入力**: test.ymlの`strategy.matrix`セクション
- **期待結果**:
  - `os`に`ubuntu-latest`と`windows-latest`が含まれている
  - `node-version`に`18.x`と`20.x`が含まれている
  - 合計4パターンのマトリックスが構成される
- **検証方法**:
  ```bash
  node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    const doc = yaml.load(fs.readFileSync('.github/workflows/test.yml', 'utf8'));
    const matrix = doc.jobs.test.strategy.matrix;
    console.log('OS:', matrix.os);
    console.log('Node versions:', matrix['node-version']);
    const osOk = matrix.os.includes('ubuntu-latest') && matrix.os.includes('windows-latest');
    const nodeOk = matrix['node-version'].includes('18.x') && matrix['node-version'].includes('20.x');
    if (!osOk || !nodeOk) process.exit(1);
  "
  ```

#### TS-005: test.yml ステップ構成検証

**テストケース名**: test_yml_steps_configuration

- **目的**: test.ymlの各ステップが要件通りに構成されていることを検証
- **前提条件**: test.ymlファイルが作成されている
- **入力**: test.ymlの`jobs.test.steps`セクション
- **期待結果**:
  - `actions/checkout@v4`が使用されている
  - `actions/setup-node@v4`が使用されている（cache: 'npm'付き）
  - `npm ci`が実行される
  - `npm test`が実行される（CI: true環境変数付き）
  - カバレッジアップロードステップが条件付きで存在する
- **検証方法**:
  ```bash
  node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    const doc = yaml.load(fs.readFileSync('.github/workflows/test.yml', 'utf8'));
    const steps = doc.jobs.test.steps;

    // actions/checkout@v4 の確認
    const hasCheckout = steps.some(s => s.uses === 'actions/checkout@v4');

    // actions/setup-node@v4 の確認
    const setupNode = steps.find(s => s.uses && s.uses.startsWith('actions/setup-node@v4'));
    const hasSetupNode = setupNode && setupNode.with && setupNode.with.cache === 'npm';

    // npm ci の確認
    const hasNpmCi = steps.some(s => s.run === 'npm ci');

    // npm test の確認
    const testStep = steps.find(s => s.run === 'npm test');
    const hasNpmTest = testStep && testStep.env && testStep.env.CI === true;

    // codecov の確認
    const codecovStep = steps.find(s => s.uses && s.uses.startsWith('codecov/codecov-action@v3'));
    const hasCodecov = codecovStep && codecovStep.if && codecovStep.with && codecovStep.with.fail_ci_if_error === false;

    console.log('Checkout:', hasCheckout);
    console.log('Setup Node:', hasSetupNode);
    console.log('npm ci:', hasNpmCi);
    console.log('npm test:', hasNpmTest);
    console.log('Codecov:', hasCodecov);

    if (!hasCheckout || !hasSetupNode || !hasNpmCi || !hasNpmTest || !hasCodecov) process.exit(1);
  "
  ```

#### TS-006: build.yml トリガー設定検証

**テストケース名**: build_yml_trigger_configuration

- **目的**: build.ymlのトリガー設定が要件通りであることを検証
- **前提条件**: build.ymlファイルが作成されている
- **入力**: build.ymlの`on`セクション
- **期待結果**:
  - `push`トリガーが`main`と`develop`ブランチに設定されている
  - `pull_request`トリガーが`main`と`develop`ブランチに設定されている
- **検証方法**: TS-003と同様の方法でbuild.ymlに対して実行

#### TS-007: build.yml 実行環境検証

**テストケース名**: build_yml_environment_configuration

- **目的**: build.ymlの実行環境が要件通りであることを検証
- **前提条件**: build.ymlファイルが作成されている
- **入力**: build.ymlの`jobs.build`セクション
- **期待結果**:
  - `runs-on`が`ubuntu-latest`である
  - Node.jsバージョンが`20.x`である
- **検証方法**:
  ```bash
  node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    const doc = yaml.load(fs.readFileSync('.github/workflows/build.yml', 'utf8'));

    const runsOn = doc.jobs.build['runs-on'];
    const setupNode = doc.jobs.build.steps.find(s => s.uses && s.uses.startsWith('actions/setup-node@v4'));
    const nodeVersion = setupNode && setupNode.with && setupNode.with['node-version'];

    console.log('runs-on:', runsOn);
    console.log('node-version:', nodeVersion);

    if (runsOn !== 'ubuntu-latest' || nodeVersion !== '20.x') process.exit(1);
  "
  ```

#### TS-008: build.yml ステップ構成検証

**テストケース名**: build_yml_steps_configuration

- **目的**: build.ymlの各ステップが要件通りに構成されていることを検証
- **前提条件**: build.ymlファイルが作成されている
- **入力**: build.ymlの`jobs.build.steps`セクション
- **期待結果**:
  - `actions/checkout@v4`が使用されている
  - `actions/setup-node@v4`が使用されている（cache: 'npm'付き）
  - `npm ci`が実行される
  - `npm run build`が実行される
  - distディレクトリ存在確認ステップが存在する
- **検証方法**:
  ```bash
  node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    const doc = yaml.load(fs.readFileSync('.github/workflows/build.yml', 'utf8'));
    const steps = doc.jobs.build.steps;

    const hasCheckout = steps.some(s => s.uses === 'actions/checkout@v4');
    const setupNode = steps.find(s => s.uses && s.uses.startsWith('actions/setup-node@v4'));
    const hasSetupNode = setupNode && setupNode.with && setupNode.with.cache === 'npm';
    const hasNpmCi = steps.some(s => s.run === 'npm ci');
    const hasNpmBuild = steps.some(s => s.run === 'npm run build');
    const hasDistCheck = steps.some(s => s.run && s.run.includes('dist') && s.run.includes('exit 1'));

    console.log('Checkout:', hasCheckout);
    console.log('Setup Node:', hasSetupNode);
    console.log('npm ci:', hasNpmCi);
    console.log('npm run build:', hasNpmBuild);
    console.log('dist check:', hasDistCheck);

    if (!hasCheckout || !hasSetupNode || !hasNpmCi || !hasNpmBuild || !hasDistCheck) process.exit(1);
  "
  ```

---

### 2.3 既存テスト影響確認テスト

#### TS-009: 既存テストスイート実行確認

**テストケース名**: existing_test_suite_execution

- **目的**: ワークフローファイル追加後も既存のテストスイートが正常に実行できることを検証
- **前提条件**:
  - ワークフローファイルが作成されている
  - Node.js環境がセットアップされている
  - 依存関係がインストールされている
- **入力**: `npm test`コマンド
- **期待結果**:
  - テストが正常に実行される（exit code 0）
  - Test Suites: 143以上がpass
  - Tests: 2180以上がpass
- **検証方法**:
  ```bash
  npm test
  # 出力例:
  # Test Suites: 143 passed, 2 skipped, 145 total
  # Tests: 2180 passed, 72 skipped, 2252 total
  ```

#### TS-010: 既存ビルド実行確認

**テストケース名**: existing_build_execution

- **目的**: ワークフローファイル追加後も既存のビルドプロセスが正常に実行できることを検証
- **前提条件**:
  - ワークフローファイルが作成されている
  - Node.js環境がセットアップされている
  - 依存関係がインストールされている
- **入力**: `npm run build`コマンド
- **期待結果**:
  - ビルドが正常に完了する（exit code 0）
  - `dist`ディレクトリが生成される
- **検証方法**:
  ```bash
  npm run build
  test -d dist && echo "dist directory exists" || echo "dist directory NOT found"
  ```

---

## 3. GitHub Actions動作検証シナリオ

**注意**: 以下のシナリオはGitHub上でのみ実行可能です。PR作成後に検証を行います。

### 3.1 test.yml ワークフロー動作検証

#### TS-011: PRトリガー動作確認

**シナリオ名**: test_workflow_pr_trigger

- **目的**: PRが作成された時にtest.ymlワークフローが自動的に開始されることを確認
- **前提条件**:
  - ワークフローファイルがリポジトリにプッシュされている
  - developまたはmainブランチへのPRが作成される
- **テスト手順**:
  1. feature/github-actions-ciブランチからdevelopへのPRを作成
  2. GitHub ActionsタブでTestsワークフローが開始されることを確認
- **期待結果**:
  - Testsワークフローが自動的に開始される
  - 4つのマトリックスジョブ（Ubuntu×18.x, Ubuntu×20.x, Windows×18.x, Windows×20.x）が作成される
- **確認項目**:
  - [ ] ワークフローが開始された
  - [ ] 4つのジョブが並列で実行されている
  - [ ] ジョブ名に環境情報が表示されている

#### TS-012: マトリックスビルド成功確認

**シナリオ名**: test_workflow_matrix_success

- **目的**: すべてのマトリックスジョブが成功することを確認
- **前提条件**: TS-011が完了している
- **テスト手順**:
  1. GitHub ActionsタブでTestsワークフローの実行状況を確認
  2. 各マトリックスジョブの結果を確認
- **期待結果**:
  - 4つすべてのジョブが成功ステータス（緑チェック）で完了
  - 各ジョブでテストが実行されている
- **確認項目**:
  - [ ] Ubuntu + Node.js 18.x: 成功
  - [ ] Ubuntu + Node.js 20.x: 成功
  - [ ] Windows + Node.js 18.x: 成功
  - [ ] Windows + Node.js 20.x: 成功

#### TS-013: カバレッジアップロード確認

**シナリオ名**: test_workflow_coverage_upload

- **目的**: Ubuntu + Node.js 20.x環境でのみカバレッジがアップロードされることを確認
- **前提条件**: TS-012が完了している
- **テスト手順**:
  1. Ubuntu + Node.js 20.xジョブの詳細ログを確認
  2. 他の3つのジョブでカバレッジアップロードステップがスキップされていることを確認
- **期待結果**:
  - Ubuntu + Node.js 20.xジョブでカバレッジアップロードステップが実行される
  - 他のジョブではカバレッジアップロードステップがスキップされる
  - アップロード失敗時もジョブ全体は成功する（fail_ci_if_error: false）
- **確認項目**:
  - [ ] Ubuntu + Node.js 20.x: カバレッジアップロード実行
  - [ ] Ubuntu + Node.js 18.x: カバレッジアップロードスキップ
  - [ ] Windows + Node.js 18.x: カバレッジアップロードスキップ
  - [ ] Windows + Node.js 20.x: カバレッジアップロードスキップ

### 3.2 build.yml ワークフロー動作検証

#### TS-014: PRトリガー動作確認

**シナリオ名**: build_workflow_pr_trigger

- **目的**: PRが作成された時にbuild.ymlワークフローが自動的に開始されることを確認
- **前提条件**:
  - ワークフローファイルがリポジトリにプッシュされている
  - developまたはmainブランチへのPRが作成される
- **テスト手順**:
  1. feature/github-actions-ciブランチからdevelopへのPRを作成（TS-011と同時）
  2. GitHub ActionsタブでBuildワークフローが開始されることを確認
- **期待結果**:
  - Buildワークフローが自動的に開始される
  - 1つのジョブ（Build TypeScript）が作成される
- **確認項目**:
  - [ ] ワークフローが開始された
  - [ ] Build TypeScriptジョブが実行されている

#### TS-015: ビルドジョブ成功確認

**シナリオ名**: build_workflow_success

- **目的**: ビルドジョブが成功し、distディレクトリが作成されることを確認
- **前提条件**: TS-014が完了している
- **テスト手順**:
  1. GitHub ActionsタブでBuildワークフローの実行状況を確認
  2. Build TypeScriptジョブの詳細ログを確認
- **期待結果**:
  - ジョブが成功ステータス（緑チェック）で完了
  - npm run buildが成功している
  - "Build successful, dist directory created"メッセージが出力されている
- **確認項目**:
  - [ ] Build TypeScriptジョブ: 成功
  - [ ] npm run build: 成功
  - [ ] dist directory check: 成功

---

## 4. 異常系テストシナリオ

### 4.1 YAML構文エラー検出テスト

#### TS-016: 不正なYAML構文検出

**テストケース名**: invalid_yaml_syntax_detection

- **目的**: 不正なYAML構文がエラーとして検出されることを確認
- **前提条件**: なし
- **入力**: 意図的に構文エラーを含むYAMLファイル
  ```yaml
  # インデントエラーの例
  name: Tests
  on:
    push:
    branches:  # インデントが不正
      - main
  ```
- **期待結果**:
  - YAMLパーサーがエラーを報告する
  - エラーメッセージにエラー箇所が示される
- **検証方法**:
  ```bash
  # エラーが発生することを確認
  node -e "require('js-yaml').load('...')" && echo "FAIL: No error" || echo "PASS: Error detected"
  ```

**注意**: このテストは実際の実装ではなく、検証プロセスの動作確認のために使用します。

### 4.2 ビルド失敗検出テスト（GitHub Actions上）

#### TS-017: distディレクトリ未生成時のエラー検出

**テストケース名**: dist_directory_missing_error

- **目的**: ビルド後にdistディレクトリが存在しない場合、エラーで終了することを確認
- **前提条件**: build.ymlのdistディレクトリチェックステップが正しく実装されている
- **入力**: distディレクトリが生成されないビルド
- **期待結果**:
  - "Error: dist directory not created"メッセージが出力される
  - ジョブが失敗ステータスで終了する
- **検証方法**: GitHub Actions上でビルドが失敗した場合のログを確認

**注意**: 正常なビルド状態では発生しないため、この検証は設計上の確認となります。

---

## 5. テストデータ

### 5.1 正常データ

#### test.yml 期待される構造

```yaml
name: Tests
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
jobs:
  test:
    name: Run Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
        env:
          CI: true
      - uses: codecov/codecov-action@v3
        if: matrix.os == 'ubuntu-latest' && matrix.node-version == '20.x'
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
```

#### build.yml 期待される構造

```yaml
name: Build
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
jobs:
  build:
    name: Build TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Check dist directory
        run: |
          if [ ! -d "dist" ]; then
            echo "Error: dist directory not created"
            exit 1
          fi
          echo "Build successful, dist directory created"
```

### 5.2 異常データ（構文エラー例）

#### インデントエラー

```yaml
name: Tests
on:
  push:
  branches:  # 誤: 'push:'の下にインデントされていない
    - main
```

#### クォート不整合

```yaml
name: 'Tests
on:  # 誤: クォートが閉じていない
```

#### 不正なキー

```yaml
name: Tests
on:
  push:
    branchs:  # 誤: 'branches'のスペルミス
      - main
```

---

## 6. テスト環境要件

### 6.1 ローカルテスト環境

| 項目 | 要件 |
|------|------|
| **OS** | Linux/macOS/Windows |
| **Node.js** | 20.x以上 |
| **npm** | 8.x以上 |
| **必要なパッケージ** | js-yaml（YAML検証用、devDependenciesとして追加不要。npm実行で確認可能） |

### 6.2 CI/CDテスト環境（GitHub Actions）

| 項目 | 要件 |
|------|------|
| **GitHub Actions** | 有効化されていること |
| **リポジトリ権限** | workflow書き込み権限（PRを作成するユーザー） |
| **外部サービス** | Codecov（オプション、fail_ci_if_error: falseのため必須ではない） |

### 6.3 モック/スタブの必要性

本テストシナリオでは、モック/スタブは不要です。

- **YAML検証**: 実際のファイルを使用
- **既存テスト**: 実際のテストスイートを実行
- **GitHub Actions**: 実際のGitHub環境で実行

---

## 7. テスト実行手順

### 7.1 ローカル検証手順

```bash
# 1. ワークフローファイルが存在することを確認
ls -la .github/workflows/

# 2. YAML構文検証（Node.jsを使用）
node -e "
  const yaml = require('js-yaml');
  const fs = require('fs');

  try {
    yaml.load(fs.readFileSync('.github/workflows/test.yml', 'utf8'));
    console.log('test.yml: OK');
  } catch (e) {
    console.error('test.yml: ERROR', e.message);
    process.exit(1);
  }

  try {
    yaml.load(fs.readFileSync('.github/workflows/build.yml', 'utf8'));
    console.log('build.yml: OK');
  } catch (e) {
    console.error('build.yml: ERROR', e.message);
    process.exit(1);
  }
"

# 3. 既存テスト実行確認
npm test

# 4. 既存ビルド実行確認
npm run build
test -d dist && echo "dist directory exists" || exit 1
```

### 7.2 GitHub Actions検証手順

1. ワークフローファイルを含むPRを作成
2. GitHub Actionsタブで両ワークフローの実行を確認
3. 各ジョブのステータスと出力を確認
4. 全ジョブが成功したらPRをマージ

---

## 8. 要件トレーサビリティ

### 8.1 機能要件とテストシナリオの対応

| 要件ID | 要件概要 | テストシナリオ |
|--------|----------|----------------|
| FR-001 | test.ymlファイル作成 | TS-001 |
| FR-002 | pushトリガー設定 | TS-003, TS-011 |
| FR-003 | pull_requestトリガー設定 | TS-003, TS-011 |
| FR-004 | マトリックスビルド（OS） | TS-004, TS-012 |
| FR-005 | マトリックスビルド（Node.js） | TS-004, TS-012 |
| FR-006 | 依存関係インストール | TS-005 |
| FR-007 | テスト実行 | TS-005, TS-009 |
| FR-008 | カバレッジアップロード | TS-005, TS-013 |
| FR-009 | Codecov連携（graceful） | TS-005, TS-013 |
| FR-010 | npmキャッシュ | TS-005 |
| FR-011 | build.ymlファイル作成 | TS-002 |
| FR-012 | pushトリガー設定（build） | TS-006, TS-014 |
| FR-013 | pull_requestトリガー設定（build） | TS-006, TS-014 |
| FR-014 | 実行環境 | TS-007 |
| FR-015 | 依存関係インストール（build） | TS-008 |
| FR-016 | TypeScriptビルド | TS-008, TS-010 |
| FR-017 | ビルド成果物検証 | TS-008, TS-015 |
| FR-018 | ビルド失敗時エラー | TS-008, TS-017 |

### 8.2 受け入れ基準とテストシナリオの対応

| 受け入れ基準 | テストシナリオ |
|--------------|----------------|
| AC-001: ワークフローファイルの存在（test） | TS-001 |
| AC-002: pushトリガーの動作 | TS-003, TS-011 |
| AC-003: pull_requestトリガーの動作 | TS-003, TS-011 |
| AC-004: マトリックスビルドの実行 | TS-004, TS-012 |
| AC-005: テストの成功 | TS-009, TS-012 |
| AC-006: カバレッジアップロード | TS-005, TS-013 |
| AC-007: ワークフローファイルの存在（build） | TS-002 |
| AC-008: ビルドの成功 | TS-010, TS-015 |
| AC-009: ビルド失敗時の検出 | TS-017 |
| AC-010: distディレクトリの検証 | TS-008, TS-015 |

---

## 9. 品質ゲート確認

| 品質ゲート | 状態 | 備考 |
|------------|------|------|
| Phase 2の戦略に沿ったテストシナリオである | ✅ | UNIT_ONLY戦略に基づき、YAML構文検証と既存テスト影響確認を中心に設計 |
| 主要な正常系がカバーされている | ✅ | TS-001〜TS-015で正常系をカバー |
| 主要な異常系がカバーされている | ✅ | TS-016, TS-017で異常系をカバー |
| 期待結果が明確である | ✅ | 各テストシナリオに具体的な期待結果を記載 |

---

## 10. 改訂履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|------------|------|----------|--------|
| 1.0 | - | 初版作成 | AI Workflow Agent |
