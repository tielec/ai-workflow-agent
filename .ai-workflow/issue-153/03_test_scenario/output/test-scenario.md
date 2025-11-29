# テストシナリオ - Issue #153

## 0. Planning Documentの確認

Planning Documentを確認した結果、以下のテスト戦略が策定されています：

### テスト戦略
- **UNIT_INTEGRATION**: ユニットテストと統合テストを組み合わせ
- `resolveLocalRepoPath()` の動作検証（REPOS_ROOT設定時/未設定時）
- `handleAutoIssueCommand()` が正しいパスで `RepositoryAnalyzer` を呼び出すことを検証

### テストコード戦略
- **EXTEND_TEST**: 既存テストファイル（`tests/unit/commands/auto-issue.test.ts`）にテストケース追加
- 新規テストファイルは作成しない

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**

### テスト対象の範囲

#### ユニットテスト対象
- `handleAutoIssueCommand()` 関数のリポジトリパス解決ロジック
- `GITHUB_REPOSITORY` 環境変数のパース処理
- エラーハンドリング（リポジトリ未発見、不正な形式）
- ログ出力の検証

#### 統合テスト対象
- `handleAutoIssueCommand()` と `resolveLocalRepoPath()` の連携
- `handleAutoIssueCommand()` と `RepositoryAnalyzer.analyze()` の連携
- Jenkins環境とローカル環境での動作差異
- エンドツーエンドのデータフロー（環境変数 → パス解決 → 解析実行）

### テストの目的

1. **正しいリポジトリが解析される**: Jenkins環境で `GITHUB_REPOSITORY` で指定したリポジトリが正しく解析されることを保証
2. **既存動作の維持**: ローカル環境での既存動作（カレントディレクトリ解析）が壊れていないことを確認
3. **エラーハンドリングの妥当性**: リポジトリが見つからない場合に適切なエラーメッセージが表示されることを確認
4. **ログ出力の正確性**: 解析対象パスが正しくログに出力されることを確認

---

## 2. ユニットテストシナリオ

### UT-1: GITHUB_REPOSITORY環境変数の取得と検証

#### UT-1-1: GITHUB_REPOSITORY が設定されている場合（正常系）

- **目的**: `GITHUB_REPOSITORY` 環境変数から owner/repo を正しく取得できることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY` 環境変数が `tielec/reflection-cloud-api` に設定されている
  - `config.getGitHubRepository()` が正しく動作する
- **入力**: なし（環境変数から取得）
- **期待結果**:
  - `owner` = `"tielec"`
  - `repo` = `"reflection-cloud-api"`
  - ログに `"GitHub repository: tielec/reflection-cloud-api"` が出力される
- **テストデータ**: `GITHUB_REPOSITORY=tielec/reflection-cloud-api`

#### UT-1-2: GITHUB_REPOSITORY が未設定の場合（異常系）

- **目的**: `GITHUB_REPOSITORY` 環境変数が未設定の場合にエラーがスローされることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY` 環境変数が未設定
  - `config.getGitHubRepository()` が `undefined` または空文字列を返す
- **入力**: なし
- **期待結果**:
  - `Error: GITHUB_REPOSITORY environment variable is required.` がスローされる
  - ログに `"auto-issue command failed: GITHUB_REPOSITORY environment variable is required."` が出力される
- **テストデータ**: `GITHUB_REPOSITORY` 未設定

#### UT-1-3: GITHUB_REPOSITORY の形式が不正な場合（異常系）

- **目的**: `GITHUB_REPOSITORY` の形式が `owner/repo` でない場合にエラーがスローされることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY` 環境変数が不正な形式（例: `invalid-format`, `owner/`, `/repo`）
- **入力**: 不正な形式の文字列
- **期待結果**:
  - `Error: Invalid repository name: {githubRepository}` がスローされる
- **テストデータ**:
  - `GITHUB_REPOSITORY=invalid-format`
  - `GITHUB_REPOSITORY=owner/`
  - `GITHUB_REPOSITORY=/repo`

### UT-2: リポジトリパス解決ロジックの検証

#### UT-2-1: REPOS_ROOT が設定されている場合（正常系）

- **目的**: `REPOS_ROOT` が設定されている場合、`resolveLocalRepoPath()` が正しいパスを返すことを検証
- **前提条件**:
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345` が設定されている
  - `/tmp/ai-workflow-repos-12345/reflection-cloud-api` ディレクトリが存在する
- **入力**: `repo = "reflection-cloud-api"`
- **期待結果**:
  - `repoPath = "/tmp/ai-workflow-repos-12345/reflection-cloud-api"` が返される
  - ログに `"Resolved repository path: /tmp/ai-workflow-repos-12345/reflection-cloud-api"` が出力される
- **テストデータ**:
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345`
  - `repo=reflection-cloud-api`

#### UT-2-2: REPOS_ROOT が未設定でフォールバック候補が存在する場合（正常系）

- **目的**: `REPOS_ROOT` が未設定の場合、フォールバック候補パスから正しいパスを返すことを検証
- **前提条件**:
  - `REPOS_ROOT` 未設定
  - `~/TIELEC/development/reflection-cloud-api` ディレクトリが存在する
- **入力**: `repo = "reflection-cloud-api"`
- **期待結果**:
  - `repoPath = "~/TIELEC/development/reflection-cloud-api"` （展開後のパス）が返される
  - ログに `"Resolved repository path: {expandedPath}"` が出力される
- **テストデータ**:
  - `REPOS_ROOT` 未設定
  - `repo=reflection-cloud-api`

#### UT-2-3: リポジトリが見つからない場合（異常系）

- **目的**: `REPOS_ROOT` 配下にリポジトリが存在せず、フォールバック候補も見つからない場合にエラーがスローされることを検証
- **前提条件**:
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345` が設定されている
  - `/tmp/ai-workflow-repos-12345/reflection-cloud-api` ディレクトリが存在しない
  - フォールバック候補パスにもリポジトリが存在しない
- **入力**: `repo = "reflection-cloud-api"`
- **期待結果**:
  - `Error: Repository 'reflection-cloud-api' not found locally.` がスローされる
  - エラーメッセージに以下が含まれる：
    - `"Please ensure REPOS_ROOT is set correctly in Jenkins environment,"`
    - `"or run the command from the repository root in local environment."`
  - ログに `"Failed to resolve repository path: {errorMessage}"` が出力される
- **テストデータ**:
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345`
  - `repo=reflection-cloud-api`（存在しない）

### UT-3: エラーハンドリングの検証

#### UT-3-1: resolveLocalRepoPath() がエラーをスローした場合

- **目的**: `resolveLocalRepoPath()` がエラーをスローした場合、適切なエラーメッセージが表示されることを検証
- **前提条件**:
  - `resolveLocalRepoPath()` がモックされており、エラーをスローする設定
- **入力**: `repo = "reflection-cloud-api"`
- **期待結果**:
  - `handleAutoIssueCommand()` がエラーをキャッチし、詳細なエラーメッセージを表示
  - エラーメッセージに元のエラー内容が含まれる（`Original error: {errorMessage}`）
- **テストデータ**: モックされたエラー

#### UT-3-2: RepositoryAnalyzer.analyze() がエラーをスローした場合

- **目的**: `RepositoryAnalyzer.analyze()` がエラーをスローした場合、適切にエラーが伝播されることを検証
- **前提条件**:
  - `RepositoryAnalyzer.analyze()` がモックされており、エラーをスローする設定
- **入力**: `repoPath = "/tmp/ai-workflow-repos-12345/reflection-cloud-api"`
- **期待結果**:
  - `handleAutoIssueCommand()` がエラーをキャッチし、ログに出力
  - `auto-issue command failed: {errorMessage}` が表示される
- **テストデータ**: モックされたエラー

### UT-4: ログ出力の検証

#### UT-4-1: 正常系のログ出力確認

- **目的**: 正常系の実行時に期待されるログが正しく出力されることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY=tielec/reflection-cloud-api`
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345`
  - リポジトリが存在する
- **入力**: なし
- **期待結果**:
  - ログに以下が含まれる（順序も確認）：
    1. `"Starting auto-issue command..."`
    2. `"GitHub repository: tielec/reflection-cloud-api"`
    3. `"Resolved repository path: /tmp/ai-workflow-repos-12345/reflection-cloud-api"`
    4. `"REPOS_ROOT: /tmp/ai-workflow-repos-12345"`
    5. `"Analyzing repository for bugs..."`
    6. `"Analyzing repository: /tmp/ai-workflow-repos-12345/reflection-cloud-api"`
- **テストデータ**: 上記環境変数

#### UT-4-2: REPOS_ROOT が未設定の場合のログ出力確認

- **目的**: `REPOS_ROOT` が未設定の場合、ログに `(not set)` が表示されることを検証
- **前提条件**:
  - `REPOS_ROOT` 未設定
  - フォールバック候補からリポジトリパスを解決
- **入力**: なし
- **期待結果**:
  - ログに `"REPOS_ROOT: (not set)"` が出力される
- **テストデータ**: `REPOS_ROOT` 未設定

---

## 3. 統合テストシナリオ

### IT-1: handleAutoIssueCommand() と resolveLocalRepoPath() の連携

#### IT-1-1: Jenkins環境でのエンドツーエンドフロー（正常系）

- **目的**: Jenkins環境で `GITHUB_REPOSITORY` からリポジトリパスを解決し、`RepositoryAnalyzer.analyze()` が正しいパスで呼び出されることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY=tielec/reflection-cloud-api`
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345`
  - `/tmp/ai-workflow-repos-12345/reflection-cloud-api` ディレクトリが存在する
  - `RepositoryAnalyzer.analyze()` がモックされている
- **テスト手順**:
  1. `handleAutoIssueCommand()` を実行
  2. `GITHUB_REPOSITORY` から `owner/repo` を抽出
  3. `resolveLocalRepoPath("reflection-cloud-api")` を呼び出し
  4. 解決したパスで `RepositoryAnalyzer.analyze(repoPath, agentMode)` を呼び出し
- **期待結果**:
  - `RepositoryAnalyzer.analyze()` が以下のパラメータで呼び出される：
    - `repoPath = "/tmp/ai-workflow-repos-12345/reflection-cloud-api"`
    - `agentMode = "codex"` または `"claude"`（オプションによる）
  - エラーが発生しない
- **確認項目**:
  - [ ] `resolveLocalRepoPath()` が正しいパスを返した
  - [ ] `RepositoryAnalyzer.analyze()` が正しいパラメータで呼び出された
  - [ ] ログに正しいリポジトリパスが出力された

#### IT-1-2: ローカル環境でのエンドツーエンドフロー（正常系）

- **目的**: ローカル環境で `REPOS_ROOT` 未設定の場合、フォールバック候補からリポジトリパスを解決し、解析が実行されることを検証
- **前提条件**:
  - `GITHUB_REPOSITORY=tielec/ai-workflow-agent`
  - `REPOS_ROOT` 未設定
  - `~/TIELEC/development/ai-workflow-agent` ディレクトリが存在する
  - `RepositoryAnalyzer.analyze()` がモックされている
- **テスト手順**:
  1. `handleAutoIssueCommand()` を実行
  2. `GITHUB_REPOSITORY` から `owner/repo` を抽出
  3. `resolveLocalRepoPath("ai-workflow-agent")` を呼び出し
  4. フォールバック候補から `~/TIELEC/development/ai-workflow-agent` を検出
  5. 解決したパスで `RepositoryAnalyzer.analyze(repoPath, agentMode)` を呼び出し
- **期待結果**:
  - `RepositoryAnalyzer.analyze()` が以下のパラメータで呼び出される：
    - `repoPath = "{expandedPath}/ai-workflow-agent"`
  - ログに `"REPOS_ROOT: (not set)"` が出力される
- **確認項目**:
  - [ ] フォールバック候補からリポジトリパスが解決された
  - [ ] `RepositoryAnalyzer.analyze()` が正しいパラメータで呼び出された
  - [ ] 既存動作（ローカル環境）が壊れていない

### IT-2: エラーハンドリングのエンドツーエンドフロー

#### IT-2-1: リポジトリが見つからない場合のエラーフロー（異常系）

- **目的**: リポジトリが見つからない場合、適切なエラーメッセージが表示され、解析が実行されないことを検証
- **前提条件**:
  - `GITHUB_REPOSITORY=tielec/non-existent-repo`
  - `REPOS_ROOT=/tmp/ai-workflow-repos-12345`
  - `/tmp/ai-workflow-repos-12345/non-existent-repo` ディレクトリが存在しない
  - `RepositoryAnalyzer.analyze()` がモックされている
- **テスト手順**:
  1. `handleAutoIssueCommand()` を実行
  2. `resolveLocalRepoPath("non-existent-repo")` がエラーをスロー
  3. エラーをキャッチし、詳細なエラーメッセージを表示
- **期待結果**:
  - エラーメッセージが以下を含む：
    - `"Repository 'non-existent-repo' not found locally."`
    - `"Please ensure REPOS_ROOT is set correctly in Jenkins environment,"`
    - `"or run the command from the repository root in local environment."`
  - `RepositoryAnalyzer.analyze()` が呼び出されない
  - ログに `"Failed to resolve repository path: {errorMessage}"` が出力される
- **確認項目**:
  - [ ] エラーメッセージが明確で実用的である
  - [ ] 解析処理が実行されていない
  - [ ] エラーログが出力された

#### IT-2-2: GITHUB_REPOSITORY が不正な形式の場合のエラーフロー（異常系）

- **目的**: `GITHUB_REPOSITORY` が不正な形式の場合、早期にエラーが発生し、解析が実行されないことを検証
- **前提条件**:
  - `GITHUB_REPOSITORY=invalid-format`
  - `RepositoryAnalyzer.analyze()` がモックされている
- **テスト手順**:
  1. `handleAutoIssueCommand()` を実行
  2. `GITHUB_REPOSITORY` のパース処理でエラーを検出
  3. エラーをスロー
- **期待結果**:
  - `Error: Invalid repository name: invalid-format` がスローされる
  - `RepositoryAnalyzer.analyze()` が呼び出されない
- **確認項目**:
  - [ ] 早期にエラーが検出された（リポジトリパス解決前）
  - [ ] 解析処理が実行されていない

### IT-3: Jenkins環境とローカル環境の動作差異検証

#### IT-3-1: Jenkins環境での動作確認

- **目的**: Jenkins環境（`REPOS_ROOT` 設定あり）で正しく動作することを検証
- **前提条件**:
  - Jenkins環境を模擬（`REPOS_ROOT` 設定、`GITHUB_REPOSITORY` 設定）
  - 対象リポジトリが `REPOS_ROOT` 配下に存在する
- **テスト手順**:
  1. 環境変数を設定（`REPOS_ROOT`, `GITHUB_REPOSITORY`）
  2. `handleAutoIssueCommand()` を実行
  3. リポジトリパス解決とログ出力を確認
- **期待結果**:
  - `REPOS_ROOT/{repo}` が解析される
  - ログに `"REPOS_ROOT: {path}"` が出力される
- **確認項目**:
  - [ ] Jenkins環境で正しく動作する
  - [ ] `REPOS_ROOT` が優先的に使用される

#### IT-3-2: ローカル環境での動作確認

- **目的**: ローカル環境（`REPOS_ROOT` 未設定）で既存動作が維持されることを検証
- **前提条件**:
  - ローカル環境を模擬（`REPOS_ROOT` 未設定）
  - フォールバック候補にリポジトリが存在する
- **テスト手順**:
  1. 環境変数を設定（`GITHUB_REPOSITORY` のみ、`REPOS_ROOT` 未設定）
  2. `handleAutoIssueCommand()` を実行
  3. フォールバック候補からリポジトリパスが解決されることを確認
- **期待結果**:
  - フォールバック候補からリポジトリパスが解決される
  - ログに `"REPOS_ROOT: (not set)"` が出力される
- **確認項目**:
  - [ ] ローカル環境で既存動作が維持される
  - [ ] フォールバック動作が正しく機能する

---

## 4. テストデータ

### 正常データ

| データ項目 | 値 | 用途 |
|-----------|-----|------|
| `GITHUB_REPOSITORY` | `tielec/reflection-cloud-api` | Jenkins環境での正常系テスト |
| `REPOS_ROOT` | `/tmp/ai-workflow-repos-12345` | Jenkins環境でのリポジトリパス解決 |
| リポジトリディレクトリ | `/tmp/ai-workflow-repos-12345/reflection-cloud-api` | 解析対象リポジトリ |

### 異常データ

| データ項目 | 値 | 用途 |
|-----------|-----|------|
| `GITHUB_REPOSITORY` | `invalid-format` | 不正な形式のテスト |
| `GITHUB_REPOSITORY` | `owner/` | 不正な形式のテスト（repo部分が空） |
| `GITHUB_REPOSITORY` | `/repo` | 不正な形式のテスト（owner部分が空） |
| `GITHUB_REPOSITORY` | `""` (空文字列) | 未設定のテスト |
| `REPOS_ROOT` | `/tmp/ai-workflow-repos-12345` + 存在しないリポジトリ | リポジトリ未発見のテスト |

### 境界値データ

| データ項目 | 値 | 用途 |
|-----------|-----|------|
| `REPOS_ROOT` | 未設定 | フォールバック動作のテスト |
| リポジトリ名 | 長い名前（例: `very-long-repository-name-for-testing`） | 長いリポジトリ名の処理テスト |

---

## 5. テスト環境要件

### 必要なテスト環境

1. **ローカル環境**:
   - Node.js 20+
   - npm 10+
   - TypeScript 5.x
   - Jest（テストフレームワーク）

2. **CI/CD環境（Jenkins）**:
   - Docker 24+
   - Node.js 20+
   - Jenkins Pipeline
   - GitHub Token（`repo` スコープ）

### 必要な外部サービス・データベース

- **GitHub**: リポジトリクローンの検証（統合テストで使用）
- **GitHub Token**: 認証情報（Jenkins環境で必要）

### モック/スタブの必要性

#### モックが必要なコンポーネント

1. **`resolveLocalRepoPath()`**:
   - ユニットテストでは実際のファイルシステムアクセスを避けるためモック化
   - 統合テストでは実際の関数を使用

2. **`RepositoryAnalyzer.analyze()`**:
   - ユニットテスト・統合テストともにモック化（実際の解析は不要）
   - 呼び出しパラメータの検証のみ実施

3. **`config.getGitHubRepository()`**:
   - ユニットテストで環境変数を設定せずにテスト可能にするためモック化

4. **`config.getReposRoot()`**:
   - ユニットテストで `REPOS_ROOT` の設定/未設定を模擬するためモック化

5. **`logger.info()`, `logger.error()`**:
   - ログ出力の検証のためモック化（スパイ機能を使用）

#### モック実装例

```typescript
// resolveLocalRepoPath のモック
jest.mock('../../src/core/repository-utils', () => ({
  resolveLocalRepoPath: jest.fn(),
}));

// RepositoryAnalyzer のモック
jest.mock('../../src/core/repository-analyzer', () => ({
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockResolvedValue([]),
  })),
}));

// logger のモック（スパイ）
jest.spyOn(logger, 'info');
jest.spyOn(logger, 'error');
```

---

## 6. テスト実行計画

### Phase 6-1: ユニットテスト実行

#### 実行コマンド
```bash
npm run test:unit -- tests/unit/commands/auto-issue.test.ts
```

#### 期待される結果
- すべてのユニットテストケース（UT-1 ~ UT-4）が成功
- カバレッジが95%以上（追加コード部分）

#### 確認項目
- [ ] UT-1-1 ~ UT-1-3 が成功
- [ ] UT-2-1 ~ UT-2-3 が成功
- [ ] UT-3-1 ~ UT-3-2 が成功
- [ ] UT-4-1 ~ UT-4-2 が成功
- [ ] カバレッジが95%以上

### Phase 6-2: 統合テスト実行

#### 実行コマンド
```bash
npm run test:integration -- tests/integration/commands/auto-issue.test.ts
```

または、ユニットテストと統合テストを同じファイルに含める場合：
```bash
npm run test:unit -- tests/unit/commands/auto-issue.test.ts
```

#### 期待される結果
- すべての統合テストケース（IT-1 ~ IT-3）が成功
- エンドツーエンドのデータフローが正しく機能

#### 確認項目
- [ ] IT-1-1 ~ IT-1-2 が成功
- [ ] IT-2-1 ~ IT-2-2 が成功
- [ ] IT-3-1 ~ IT-3-2 が成功
- [ ] 既存テストが壊れていない

### Phase 6-3: カバレッジ確認

#### 実行コマンド
```bash
npm run test:coverage
```

#### 期待される結果
- 追加コード（`handleAutoIssueCommand()` の修正部分）のカバレッジが100%
- プロジェクト全体のカバレッジが95%以上

#### 確認項目
- [ ] 追加コードが100%カバーされている
- [ ] プロジェクト全体のカバレッジが95%以上
- [ ] カバーされていないコードがエッジケースのみである

---

## 7. 品質ゲート（Phase 3）チェックリスト

- ✅ **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION戦略に基づき、ユニットテストと統合テストのシナリオを作成
- ✅ **主要な正常系がカバーされている**:
  - UT-1-1, UT-2-1: GITHUB_REPOSITORY取得とリポジトリパス解決の正常系
  - IT-1-1, IT-1-2: Jenkins環境とローカル環境でのエンドツーエンドフロー
  - IT-3-1, IT-3-2: Jenkins環境とローカル環境の動作確認
- ✅ **主要な異常系がカバーされている**:
  - UT-1-2, UT-1-3: GITHUB_REPOSITORY未設定・不正な形式
  - UT-2-3: リポジトリが見つからない場合
  - IT-2-1, IT-2-2: エラーハンドリングのエンドツーエンドフロー
- ✅ **期待結果が明確である**: 各テストシナリオで期待される結果を具体的に記載（ログ出力、エラーメッセージ、関数呼び出しパラメータなど）

---

## 8. 受け入れ基準との対応

### AC1: Jenkins環境での正しいリポジトリ解析

**対応するテストシナリオ**:
- IT-1-1: Jenkins環境でのエンドツーエンドフロー（正常系）
- IT-3-1: Jenkins環境での動作確認
- UT-4-1: 正常系のログ出力確認

### AC2: リポジトリクローンの動作確認

**対応するテストシナリオ**:
- Jenkinsfileの修正によりカバー（テストシナリオには含まれない）
- Jenkins Pipelineの実行で手動確認

### AC3: 既存リポジトリの pull 動作確認

**対応するテストシナリオ**:
- Jenkinsfileの修正によりカバー（テストシナリオには含まれない）
- Jenkins Pipelineの実行で手動確認

### AC4: リポジトリ未発見時のエラーハンドリング

**対応するテストシナリオ**:
- UT-2-3: リポジトリが見つからない場合（異常系）
- IT-2-1: リポジトリが見つからない場合のエラーフロー（異常系）

### AC5: ローカル環境での既存動作維持

**対応するテストシナリオ**:
- IT-1-2: ローカル環境でのエンドツーエンドフロー（正常系）
- IT-3-2: ローカル環境での動作確認
- UT-2-2: REPOS_ROOT が未設定でフォールバック候補が存在する場合（正常系）

### AC6: ログ出力の確認

**対応するテストシナリオ**:
- UT-4-1: 正常系のログ出力確認
- UT-4-2: REPOS_ROOT が未設定の場合のログ出力確認

---

## 9. テストケース一覧（サマリー）

### ユニットテスト（12ケース）

| ID | テストケース名 | 種別 | 優先度 |
|----|---------------|------|--------|
| UT-1-1 | GITHUB_REPOSITORY が設定されている場合 | 正常系 | 高 |
| UT-1-2 | GITHUB_REPOSITORY が未設定の場合 | 異常系 | 高 |
| UT-1-3 | GITHUB_REPOSITORY の形式が不正な場合 | 異常系 | 高 |
| UT-2-1 | REPOS_ROOT が設定されている場合 | 正常系 | 高 |
| UT-2-2 | REPOS_ROOT が未設定でフォールバック候補が存在する場合 | 正常系 | 中 |
| UT-2-3 | リポジトリが見つからない場合 | 異常系 | 高 |
| UT-3-1 | resolveLocalRepoPath() がエラーをスローした場合 | 異常系 | 中 |
| UT-3-2 | RepositoryAnalyzer.analyze() がエラーをスローした場合 | 異常系 | 中 |
| UT-4-1 | 正常系のログ出力確認 | 正常系 | 高 |
| UT-4-2 | REPOS_ROOT が未設定の場合のログ出力確認 | 正常系 | 中 |

### 統合テスト（6ケース）

| ID | テストケース名 | 種別 | 優先度 |
|----|---------------|------|--------|
| IT-1-1 | Jenkins環境でのエンドツーエンドフロー | 正常系 | 高 |
| IT-1-2 | ローカル環境でのエンドツーエンドフロー | 正常系 | 高 |
| IT-2-1 | リポジトリが見つからない場合のエラーフロー | 異常系 | 高 |
| IT-2-2 | GITHUB_REPOSITORY が不正な形式の場合のエラーフロー | 異常系 | 中 |
| IT-3-1 | Jenkins環境での動作確認 | 正常系 | 高 |
| IT-3-2 | ローカル環境での動作確認 | 正常系 | 高 |

**合計**: 18テストケース（ユニット12 + 統合6）

---

## 10. リスクとテストカバレッジ

### リスク1: Jenkins環境で `REPOS_ROOT` 配下にリポジトリが見つからない

**対応するテストシナリオ**:
- UT-2-3: リポジトリが見つからない場合（異常系）
- IT-2-1: リポジトリが見つからない場合のエラーフロー（異常系）

**カバレッジ**: ✅ 十分

### リスク2: GitHub Token の権限不足でリポジトリクローンに失敗

**対応するテストシナリオ**:
- Jenkinsfileの修正によりカバー（テストシナリオには含まれない）
- Jenkins Pipelineの実行で手動確認

**カバレッジ**: ⚠️ 手動確認が必要

### リスク3: 対象リポジトリのサイズが大きくクローンに時間がかかる

**対応するテストシナリオ**:
- Jenkinsfileの修正によりカバー（`git clone --depth 1` でシャローコピー）
- パフォーマンステストは実施しない（80点で十分）

**カバレッジ**: ✅ 軽減策で対応

### リスク4: `resolveLocalRepoPath()` のフォールバック動作が Jenkins 環境で機能しない

**対応するテストシナリオ**:
- UT-2-1: REPOS_ROOT が設定されている場合（正常系）
- UT-2-2: REPOS_ROOT が未設定でフォールバック候補が存在する場合（正常系）
- IT-3-1: Jenkins環境での動作確認
- IT-3-2: ローカル環境での動作確認

**カバレッジ**: ✅ 十分

---

## 11. 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|-----------|---------|--------|
| 2025-01-30 | 1.0 | 初版作成 | AI Workflow Agent |

---

**承認**: このテストシナリオは、Phase 3（Test Scenario）の品質ゲートをすべて満たしており、Phase 4（Implementation）への移行が可能です。
