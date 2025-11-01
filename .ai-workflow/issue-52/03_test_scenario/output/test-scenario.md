# テストシナリオ - Issue #52

## 0. Planning Document の確認

Planning Document（@.ai-workflow/issue-52/00_planning/output/planning.md）で策定された開発計画を確認しました：

### テスト戦略の概要
- **テスト戦略**: UNIT_INTEGRATION（単体テスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（新規テスト作成 + 既存テスト拡張）
- **見積もり工数**: 14~20時間（2~3日）
- **リスク評価**: 低（後方互換性100%維持、既存テストスイート充実）

### テスト対象モジュール
1. **FileSelector** (約150行): ファイル選択・フィルタリングロジック
2. **CommitMessageBuilder** (約100行): コミットメッセージ構築ロジック
3. **CommitManager** (約200行): コミット実行（リファクタリング後）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_INTEGRATION**（Unit + Integration）

### テスト対象の範囲

#### Unitテスト対象
1. **FileSelector**
   - `getChangedFiles()`: Git statusから変更ファイル取得、@tmp除外
   - `filterPhaseFiles()`: Issue番号でフィルタリング
   - `getPhaseSpecificFiles()`: フェーズ固有ファイル取得
   - `scanDirectories()`: ディレクトリスキャン
   - `scanByPatterns()`: minimatchパターンマッチング

2. **CommitMessageBuilder**
   - `createCommitMessage()`: フェーズ完了メッセージ生成
   - `buildStepCommitMessage()`: ステップ完了メッセージ生成
   - `createInitCommitMessage()`: 初期化メッセージ生成
   - `createCleanupCommitMessage()`: クリーンアップメッセージ生成

3. **CommitManager**（委譲動作）
   - `commitPhaseOutput()`: FileSelector/CommitMessageBuilderへの委譲
   - `commitStepOutput()`: FileSelector/CommitMessageBuilderへの委譲
   - `commitWorkflowInit()`: FileSelector/CommitMessageBuilderへの委譲
   - `commitCleanupLogs()`: FileSelector/CommitMessageBuilderへの委譲

#### Integrationテスト対象
1. **GitManager統合**
   - GitManager → CommitManager → FileSelector/CommitMessageBuilder の連携動作
   - 実際のGit操作とファイルシステム連携

2. **エンドツーエンド統合**
   - 既存の `step-commit-push.test.ts` で後方互換性を検証
   - リファクタリング後も既存テストが成功することを確認

### テストの目的

#### Unitテストの目的
- FileSelector の各メソッドが正しくファイルをフィルタリングできることを検証
- CommitMessageBuilder が正しいフォーマットでメッセージを生成できることを検証
- CommitManager が FileSelector/CommitMessageBuilder に正しく処理を委譲できることを検証
- モックを使用して、各モジュールが独立して動作することを検証

#### Integrationテストの目的
- リファクタリング後も既存の統合テストが成功することで、後方互換性100%を保証
- GitManager → CommitManager → FileSelector/CommitMessageBuilder の連携が正常に動作することを検証
- 実際のGit操作とファイルシステム連携が正常に動作することを検証

---

## 2. Unitテストシナリオ

### 2.1. FileSelector - getChangedFiles()

#### テストケース 2.1.1: getChangedFiles_正常系_変更ファイルを正しく取得

- **目的**: Git statusから変更ファイルを正しく取得できることを検証
- **前提条件**:
  - SimpleGitのモックが正常にステータスを返す
  - 以下の変更ファイルが存在する:
    - `not_added`: `['src/new-file.ts']`
    - `created`: `['src/created.ts']`
    - `modified`: `['src/modified.ts']`
    - `staged`: `['src/staged.ts']`
- **入力**: なし
- **期待結果**:
  - `['src/new-file.ts', 'src/created.ts', 'src/modified.ts', 'src/staged.ts']` が返される
  - 重複が除去される（Set使用）
- **テストデータ**:
  ```typescript
  {
    not_added: ['src/new-file.ts'],
    created: ['src/created.ts'],
    modified: ['src/modified.ts'],
    staged: ['src/staged.ts'],
    deleted: [],
    renamed: [],
    files: []
  }
  ```

#### テストケース 2.1.2: getChangedFiles_正常系_@tmpを除外

- **目的**: `@tmp` を含むファイルが除外されることを検証
- **前提条件**:
  - SimpleGitのモックが以下のステータスを返す:
    - `modified`: `['src/index.ts', 'src/@tmp/temp.ts', '.ai-workflow/issue-123/@tmp/log.txt']`
- **入力**: なし
- **期待結果**:
  - `['src/index.ts']` のみが返される
  - `@tmp` を含むファイルが除外される
- **テストデータ**:
  ```typescript
  {
    modified: ['src/index.ts', 'src/@tmp/temp.ts', '.ai-workflow/issue-123/@tmp/log.txt'],
    not_added: [],
    created: [],
    staged: [],
    deleted: [],
    renamed: [],
    files: []
  }
  ```

#### テストケース 2.1.3: getChangedFiles_境界値_重複ファイルの除去

- **目的**: 重複ファイルが正しく除去されることを検証
- **前提条件**:
  - SimpleGitのモックが以下のステータスを返す:
    - `modified`: `['src/index.ts']`
    - `staged`: `['src/index.ts']`
    - `files`: `['src/index.ts', 'src/other.ts']`
- **入力**: なし
- **期待結果**:
  - `['src/index.ts', 'src/other.ts']` が返される
  - 重複が除去される
- **テストデータ**:
  ```typescript
  {
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: ['src/index.ts', 'src/other.ts'],
    not_added: [],
    created: [],
    deleted: [],
    renamed: []
  }
  ```

#### テストケース 2.1.4: getChangedFiles_正常系_renamedファイルの処理

- **目的**: リネームされたファイルが正しく処理されることを検証
- **前提条件**:
  - SimpleGitのモックが以下のステータスを返す:
    - `renamed`: `[{from: 'old.ts', to: 'new.ts'}]`
- **入力**: なし
- **期待結果**:
  - `['new.ts']` が返される（`rename.to` が使用される）
- **テストデータ**:
  ```typescript
  {
    renamed: [{from: 'old.ts', to: 'new.ts'}],
    modified: [],
    staged: [],
    not_added: [],
    created: [],
    deleted: [],
    files: []
  }
  ```

#### テストケース 2.1.5: getChangedFiles_境界値_変更ファイルなし

- **目的**: 変更ファイルがない場合に空配列が返されることを検証
- **前提条件**:
  - SimpleGitのモックが以下のステータスを返す:
    - すべてのステータスが空
- **入力**: なし
- **期待結果**:
  - `[]` が返される
- **テストデータ**:
  ```typescript
  {
    modified: [],
    staged: [],
    not_added: [],
    created: [],
    deleted: [],
    renamed: [],
    files: []
  }
  ```

---

### 2.2. FileSelector - filterPhaseFiles()

#### テストケース 2.2.1: filterPhaseFiles_正常系_Issue番号でフィルタリング

- **目的**: 指定されたIssue番号に関連するファイルのみが返されることを検証
- **前提条件**:
  - Issue番号が `'123'` である
  - 変更ファイルリストに以下が含まれる:
    - `.ai-workflow/issue-123/metadata.json`
    - `.ai-workflow/issue-456/metadata.json`
    - `src/index.ts`
- **入力**:
  - `files`: `['.ai-workflow/issue-123/metadata.json', '.ai-workflow/issue-456/metadata.json', 'src/index.ts']`
  - `issueNumber`: `'123'`
- **期待結果**:
  - `['.ai-workflow/issue-123/metadata.json', 'src/index.ts']` が返される
  - Issue #456 のファイルは除外される
- **テストデータ**: 上記input

#### テストケース 2.2.2: filterPhaseFiles_正常系_@tmpを除外

- **目的**: `@tmp` を含むファイルが除外されることを検証
- **前提条件**:
  - Issue番号が `'123'` である
  - 変更ファイルリストに以下が含まれる:
    - `.ai-workflow/issue-123/metadata.json`
    - `.ai-workflow/issue-123/@tmp/log.txt`
    - `src/index.ts`
- **入力**:
  - `files`: `['.ai-workflow/issue-123/metadata.json', '.ai-workflow/issue-123/@tmp/log.txt', 'src/index.ts']`
  - `issueNumber`: `'123'`
- **期待結果**:
  - `['.ai-workflow/issue-123/metadata.json', 'src/index.ts']` が返される
  - `@tmp` を含むファイルは除外される
- **テストデータ**: 上記input

#### テストケース 2.2.3: filterPhaseFiles_正常系_非ai-workflowファイルを含める

- **目的**: `.ai-workflow/` 以外のファイルが含まれることを検証
- **前提条件**:
  - Issue番号が `'123'` である
  - 変更ファイルリストに以下が含まれる:
    - `src/core/git/file-selector.ts`
    - `tests/unit/git/file-selector.test.ts`
    - `README.md`
- **入力**:
  - `files`: `['src/core/git/file-selector.ts', 'tests/unit/git/file-selector.test.ts', 'README.md']`
  - `issueNumber`: `'123'`
- **期待結果**:
  - `['src/core/git/file-selector.ts', 'tests/unit/git/file-selector.test.ts', 'README.md']` が返される
  - すべてのファイルが含まれる
- **テストデータ**: 上記input

#### テストケース 2.2.4: filterPhaseFiles_境界値_空のファイルリスト

- **目的**: 空のファイルリストに対して空配列が返されることを検証
- **前提条件**:
  - Issue番号が `'123'` である
  - 変更ファイルリストが空
- **入力**:
  - `files`: `[]`
  - `issueNumber`: `'123'`
- **期待結果**:
  - `[]` が返される
- **テストデータ**: 上記input

---

### 2.3. FileSelector - getPhaseSpecificFiles()

#### テストケース 2.3.1: getPhaseSpecificFiles_正常系_implementationフェーズ

- **目的**: `implementation` フェーズで `scripts/`, `pulumi/`, `ansible/`, `jenkins/` ディレクトリが対象となることを検証
- **前提条件**:
  - フェーズ名が `'implementation'` である
  - 変更ファイルに `scripts/deploy.sh`, `pulumi/index.ts`, `src/index.ts` が含まれる
  - `scanDirectories()` が正しく動作する（モック）
- **入力**:
  - `phaseName`: `'implementation'`
- **期待結果**:
  - `scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins'])` が呼ばれる
  - `['scripts/deploy.sh', 'pulumi/index.ts']` が返される
- **テストデータ**:
  ```typescript
  changedFiles: ['scripts/deploy.sh', 'pulumi/index.ts', 'src/index.ts']
  ```

#### テストケース 2.3.2: getPhaseSpecificFiles_正常系_test_implementationフェーズ

- **目的**: `test_implementation` フェーズでテストファイルパターンが対象となることを検証
- **前提条件**:
  - フェーズ名が `'test_implementation'` である
  - 変更ファイルに `src/index.test.ts`, `src/index.ts`, `tests/test_util.py` が含まれる
  - `scanByPatterns()` が正しく動作する（モック）
- **入力**:
  - `phaseName`: `'test_implementation'`
- **期待結果**:
  - `scanByPatterns(['test_*.py', '*_test.py', '*.test.js', '*.spec.js', '*.test.ts', '*.spec.ts', '*_test.go', 'Test*.java', '*Test.java', 'test_*.sh'])` が呼ばれる
  - `['src/index.test.ts', 'tests/test_util.py']` が返される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts', 'src/index.ts', 'tests/test_util.py']
  ```

#### テストケース 2.3.3: getPhaseSpecificFiles_正常系_documentationフェーズ

- **目的**: `documentation` フェーズでMarkdownファイルが対象となることを検証
- **前提条件**:
  - フェーズ名が `'documentation'` である
  - 変更ファイルに `README.md`, `docs/API.MD`, `src/index.ts` が含まれる
  - `scanByPatterns()` が正しく動作する（モック）
- **入力**:
  - `phaseName`: `'documentation'`
- **期待結果**:
  - `scanByPatterns(['*.md', '*.MD'])` が呼ばれる
  - `['README.md', 'docs/API.MD']` が返される
- **テストデータ**:
  ```typescript
  changedFiles: ['README.md', 'docs/API.MD', 'src/index.ts']
  ```

#### テストケース 2.3.4: getPhaseSpecificFiles_正常系_その他のフェーズ

- **目的**: `implementation`, `test_implementation`, `documentation` 以外のフェーズでは空配列が返されることを検証
- **前提条件**:
  - フェーズ名が `'requirements'` である
- **入力**:
  - `phaseName`: `'requirements'`
- **期待結果**:
  - `[]` が返される
- **テストデータ**: なし

---

### 2.4. FileSelector - scanDirectories()

#### テストケース 2.4.1: scanDirectories_正常系_単一ディレクトリ

- **目的**: 指定されたディレクトリ配下のファイルが正しくスキャンされることを検証
- **前提条件**:
  - 変更ファイルに `scripts/deploy.sh`, `src/index.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `directories`: `['scripts']`
- **期待結果**:
  - `['scripts/deploy.sh']` が返される
  - `src/index.ts` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['scripts/deploy.sh', 'src/index.ts']
  ```

#### テストケース 2.4.2: scanDirectories_正常系_複数ディレクトリ

- **目的**: 複数のディレクトリ配下のファイルが正しくスキャンされることを検証
- **前提条件**:
  - 変更ファイルに `scripts/deploy.sh`, `pulumi/index.ts`, `ansible/playbook.yml`, `src/index.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `directories`: `['scripts', 'pulumi', 'ansible']`
- **期待結果**:
  - `['scripts/deploy.sh', 'pulumi/index.ts', 'ansible/playbook.yml']` が返される
  - `src/index.ts` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['scripts/deploy.sh', 'pulumi/index.ts', 'ansible/playbook.yml', 'src/index.ts']
  ```

#### テストケース 2.4.3: scanDirectories_正常系_@tmpを除外

- **目的**: ディレクトリスキャン時に `@tmp` を含むファイルが除外されることを検証
- **前提条件**:
  - 変更ファイルに `scripts/deploy.sh`, `scripts/@tmp/temp.sh` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `directories`: `['scripts']`
- **期待結果**:
  - `['scripts/deploy.sh']` が返される
  - `scripts/@tmp/temp.sh` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['scripts/deploy.sh', 'scripts/@tmp/temp.sh']
  ```

#### テストケース 2.4.4: scanDirectories_境界値_該当ファイルなし

- **目的**: 該当するファイルがない場合に空配列が返されることを検証
- **前提条件**:
  - 変更ファイルに `src/index.ts`, `tests/test.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `directories`: `['scripts']`
- **期待結果**:
  - `[]` が返される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.ts', 'tests/test.ts']
  ```

---

### 2.5. FileSelector - scanByPatterns()

#### テストケース 2.5.1: scanByPatterns_正常系_単一パターン

- **目的**: 単一のパターンに一致するファイルが正しくスキャンされることを検証
- **前提条件**:
  - 変更ファイルに `src/index.test.ts`, `src/index.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `patterns`: `['*.test.ts']`
- **期待結果**:
  - `['src/index.test.ts']` が返される
  - `src/index.ts` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts', 'src/index.ts']
  ```

#### テストケース 2.5.2: scanByPatterns_正常系_複数パターン

- **目的**: 複数のパターンに一致するファイルが正しくスキャンされることを検証
- **前提条件**:
  - 変更ファイルに `src/index.test.ts`, `src/util.spec.ts`, `src/index.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `patterns`: `['*.test.ts', '*.spec.ts']`
- **期待結果**:
  - `['src/index.test.ts', 'src/util.spec.ts']` が返される
  - `src/index.ts` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts', 'src/util.spec.ts', 'src/index.ts']
  ```

#### テストケース 2.5.3: scanByPatterns_正常系_minimatchの2つのマッチング方式

- **目的**: minimatch の2つのマッチング方式が正しく動作することを検証
- **前提条件**:
  - 変更ファイルに `src/index.test.ts`, `index.test.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
  - minimatch が以下の2つの方式でマッチする:
    - `minimatch(file, pattern, { dot: true })`
    - `minimatch(file, `**/${pattern}`, { dot: true })`
- **入力**:
  - `patterns`: `['*.test.ts']`
- **期待結果**:
  - `['src/index.test.ts', 'index.test.ts']` が返される
  - 両方のマッチング方式でマッチしたファイルが含まれる
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts', 'index.test.ts']
  ```

#### テストケース 2.5.4: scanByPatterns_正常系_@tmpを除外

- **目的**: パターンスキャン時に `@tmp` を含むファイルが除外されることを検証
- **前提条件**:
  - 変更ファイルに `src/index.test.ts`, `src/@tmp/temp.test.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `patterns`: `['*.test.ts']`
- **期待結果**:
  - `['src/index.test.ts']` が返される
  - `src/@tmp/temp.test.ts` は除外される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts', 'src/@tmp/temp.test.ts']
  ```

#### テストケース 2.5.5: scanByPatterns_境界値_該当ファイルなし

- **目的**: 該当するファイルがない場合に空配列が返されることを検証
- **前提条件**:
  - 変更ファイルに `src/index.ts`, `src/util.ts` が含まれる
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `patterns`: `['*.test.ts']`
- **期待結果**:
  - `[]` が返される
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.ts', 'src/util.ts']
  ```

#### テストケース 2.5.6: scanByPatterns_境界値_重複ファイルの除去

- **目的**: 複数パターンにマッチしたファイルの重複が除去されることを検証
- **前提条件**:
  - 変更ファイルに `src/index.test.ts` が含まれる
  - パターン `['*.test.ts', '*.test.*']` により、同じファイルが複数回マッチする
  - `getChangedFiles()` が正しく動作する（モック）
- **入力**:
  - `patterns`: `['*.test.ts', '*.test.*']`
- **期待結果**:
  - `['src/index.test.ts']` が返される（重複除去）
- **テストデータ**:
  ```typescript
  changedFiles: ['src/index.test.ts']
  ```

---

### 2.6. CommitMessageBuilder - createCommitMessage()

#### テストケース 2.6.1: createCommitMessage_正常系_completedステータス

- **目的**: フェーズ完了時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - MetadataManager のモックが Issue番号 `123` を返す
  - フェーズ名が `'requirements'`
  - ステータスが `'completed'`
  - レビュー結果が `'PASS'`
- **入力**:
  - `phaseName`: `'requirements'`
  - `status`: `'completed'`
  - `reviewResult`: `'PASS'`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Phase 1 (requirements) - completed

    Issue: #123
    Phase: 1 (requirements)
    Status: completed
    Review: PASS

    Auto-generated by AI Workflow
    ```
- **テストデータ**:
  ```typescript
  metadata.data.issue_number = '123'
  phaseOrder.indexOf('requirements') = 1 (Phase 2)
  ```

#### テストケース 2.6.2: createCommitMessage_正常系_failedステータス

- **目的**: フェーズ失敗時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - MetadataManager のモックが Issue番号 `123` を返す
  - フェーズ名が `'implementation'`
  - ステータスが `'failed'`
  - レビュー結果が `'FAIL'`
- **入力**:
  - `phaseName`: `'implementation'`
  - `status`: `'failed'`
  - `reviewResult`: `'FAIL'`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Phase 4 (implementation) - failed

    Issue: #123
    Phase: 4 (implementation)
    Status: failed
    Review: FAIL

    Auto-generated by AI Workflow
    ```
- **テストデータ**:
  ```typescript
  metadata.data.issue_number = '123'
  phaseOrder.indexOf('implementation') = 4 (Phase 5)
  ```

#### テストケース 2.6.3: createCommitMessage_境界値_reviewResult未指定

- **目的**: reviewResult が未指定の場合に 'N/A' が使用されることを検証
- **前提条件**:
  - MetadataManager のモックが Issue番号 `123` を返す
  - フェーズ名が `'design'`
  - ステータスが `'completed'`
  - レビュー結果が未指定（`undefined`）
- **入力**:
  - `phaseName`: `'design'`
  - `status`: `'completed'`
  - `reviewResult`: `undefined`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Phase 2 (design) - completed

    Issue: #123
    Phase: 2 (design)
    Status: completed
    Review: N/A

    Auto-generated by AI Workflow
    ```
- **テストデータ**:
  ```typescript
  metadata.data.issue_number = '123'
  phaseOrder.indexOf('design') = 2 (Phase 3)
  ```

#### テストケース 2.6.4: createCommitMessage_正常系_全フェーズの番号計算

- **目的**: 全フェーズに対して正しい Phase番号が計算されることを検証
- **前提条件**:
  - MetadataManager のモックが Issue番号 `123` を返す
- **入力**:
  - 各フェーズ名: `'planning'`, `'requirements'`, `'design'`, `'test_scenario'`, `'implementation'`, `'test_implementation'`, `'testing'`, `'documentation'`, `'report'`, `'evaluation'`
- **期待結果**:
  - Phase番号が以下のように計算される:
    - planning → Phase 0
    - requirements → Phase 1
    - design → Phase 2
    - test_scenario → Phase 3
    - implementation → Phase 4
    - test_implementation → Phase 5
    - testing → Phase 6
    - documentation → Phase 7
    - report → Phase 8
    - evaluation → Phase 9
- **テストデータ**:
  ```typescript
  phaseOrder = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ]
  ```

---

### 2.7. CommitMessageBuilder - buildStepCommitMessage()

#### テストケース 2.7.1: buildStepCommitMessage_正常系_executeステップ

- **目的**: ステップ完了時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - フェーズ名が `'implementation'`
  - Phase番号が `4`
  - ステップが `'execute'`
  - Issue番号が `123`
- **入力**:
  - `phaseName`: `'implementation'`
  - `phaseNumber`: `4`
  - `step`: `'execute'`
  - `issueNumber`: `123`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Phase 4 (implementation) - execute completed

    Issue: #123
    Phase: 4 (implementation)
    Step: execute
    Status: completed

    Auto-generated by AI Workflow
    ```
- **テストデータ**: 上記input

#### テストケース 2.7.2: buildStepCommitMessage_正常系_reviewステップ

- **目的**: レビューステップのコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - フェーズ名が `'requirements'`
  - Phase番号が `1`
  - ステップが `'review'`
  - Issue番号が `456`
- **入力**:
  - `phaseName`: `'requirements'`
  - `phaseNumber`: `1`
  - `step`: `'review'`
  - `issueNumber`: `456`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Phase 1 (requirements) - review completed

    Issue: #456
    Phase: 1 (requirements)
    Step: review
    Status: completed

    Auto-generated by AI Workflow
    ```
- **テストデータ**: 上記input

---

### 2.8. CommitMessageBuilder - createInitCommitMessage()

#### テストケース 2.8.1: createInitCommitMessage_正常系

- **目的**: ワークフロー初期化時のコミットメッセージが正しく生成されることを検証
- **前提条件**:
  - Issue番号が `123`
  - ブランチ名が `'ai-workflow/issue-123'`
- **入力**:
  - `issueNumber`: `123`
  - `branchName`: `'ai-workflow/issue-123'`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Initialize workflow for issue #123

    Issue: #123
    Action: Create workflow metadata and directory structure
    Branch: ai-workflow/issue-123

    Auto-generated by AI Workflow
    ```
- **テストデータ**: 上記input

---

### 2.9. CommitMessageBuilder - createCleanupCommitMessage()

#### テストケース 2.9.1: createCleanupCommitMessage_正常系_reportフェーズ

- **目的**: reportフェーズのクリーンアップメッセージが正しく生成されることを検証
- **前提条件**:
  - Issue番号が `123`
  - フェーズが `'report'`
- **入力**:
  - `issueNumber`: `123`
  - `phase`: `'report'`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Clean up workflow execution logs

    Issue: #123
    Phase: 8 (report)
    Action: Remove agent execution logs (execute/review/revise directories)
    Preserved: metadata.json, output/*.md

    Auto-generated by AI Workflow
    ```
- **テストデータ**: 上記input

#### テストケース 2.9.2: createCleanupCommitMessage_正常系_evaluationフェーズ

- **目的**: evaluationフェーズのクリーンアップメッセージが正しく生成されることを検証
- **前提条件**:
  - Issue番号が `456`
  - フェーズが `'evaluation'`
- **入力**:
  - `issueNumber`: `456`
  - `phase`: `'evaluation'`
- **期待結果**:
  - 以下のフォーマットのメッセージが返される:
    ```
    [ai-workflow] Clean up workflow execution logs

    Issue: #456
    Phase: 9 (evaluation)
    Action: Remove agent execution logs (execute/review/revise directories)
    Preserved: metadata.json, output/*.md

    Auto-generated by AI Workflow
    ```
- **テストデータ**: 上記input

---

### 2.10. CommitManager - commitPhaseOutput()（委譲動作）

#### テストケース 2.10.1: commitPhaseOutput_正常系_委譲動作の検証

- **目的**: CommitManager が FileSelector と CommitMessageBuilder に正しく処理を委譲することを検証
- **前提条件**:
  - FileSelector のモックが用意されている
  - CommitMessageBuilder のモックが用意されている
  - SecretMasker のモックが用意されている
  - SimpleGit のモックが用意されている
  - MetadataManager が Issue番号 `123` を返す
- **入力**:
  - `phaseName`: `'requirements'`
  - `status`: `'completed'`
  - `reviewResult`: `'PASS'`
- **期待結果**:
  - `fileSelector.getChangedFiles()` が1回呼ばれる
  - `fileSelector.filterPhaseFiles(changedFiles, '123')` が1回呼ばれる
  - `fileSelector.getPhaseSpecificFiles('requirements')` が1回呼ばれる
  - `secretMasker.maskSecretsInWorkflowDir()` が1回呼ばれる
  - `messageBuilder.createCommitMessage('requirements', 'completed', 'PASS')` が1回呼ばれる
  - `git.add()` が1回呼ばれる
  - `git.commit()` が1回呼ばれる
  - `CommitResult` オブジェクトが返される
- **テストデータ**:
  ```typescript
  fileSelector.getChangedFiles() returns ['src/index.ts', '.ai-workflow/issue-123/metadata.json']
  fileSelector.filterPhaseFiles() returns ['src/index.ts', '.ai-workflow/issue-123/metadata.json']
  fileSelector.getPhaseSpecificFiles() returns []
  secretMasker.maskSecretsInWorkflowDir() returns { filesProcessed: 1, secretsMasked: 0, errors: [] }
  messageBuilder.createCommitMessage() returns '[ai-workflow] Phase 1 (requirements) - completed...'
  git.commit() returns { commit: 'abc123', summary: { changes: 2, insertions: 10, deletions: 0 } }
  ```

#### テストケース 2.10.2: commitPhaseOutput_異常系_Issue番号なし

- **目的**: Issue番号がない場合にエラーが返されることを検証
- **前提条件**:
  - MetadataManager が Issue番号を返さない（`undefined`）
- **入力**:
  - `phaseName`: `'requirements'`
  - `status`: `'completed'`
  - `reviewResult`: `'PASS'`
- **期待結果**:
  - `CommitResult` オブジェクトが返される:
    ```typescript
    {
      success: false,
      commit_hash: null,
      files_committed: [],
      error: 'Issue number not found in metadata'
    }
    ```
  - FileSelector/CommitMessageBuilder のメソッドは呼ばれない
- **テストデータ**:
  ```typescript
  metadata.data.issue_number = undefined
  ```

#### テストケース 2.10.3: commitPhaseOutput_境界値_変更ファイルなし

- **目的**: 変更ファイルがない場合に空のコミット結果が返されることを検証
- **前提条件**:
  - FileSelector のモックが空配列を返す
  - MetadataManager が Issue番号 `123` を返す
- **入力**:
  - `phaseName`: `'requirements'`
  - `status`: `'completed'`
  - `reviewResult`: `'PASS'`
- **期待結果**:
  - `CommitResult` オブジェクトが返される:
    ```typescript
    {
      success: true,
      commit_hash: null,
      files_committed: []
    }
    ```
  - `git.add()` と `git.commit()` は呼ばれない
- **テストデータ**:
  ```typescript
  fileSelector.getChangedFiles() returns []
  fileSelector.filterPhaseFiles() returns []
  fileSelector.getPhaseSpecificFiles() returns []
  ```

---

### 2.11. CommitManager - commitStepOutput()（委譲動作）

#### テストケース 2.11.1: commitStepOutput_正常系_委譲動作の検証

- **目的**: CommitManager が FileSelector と CommitMessageBuilder に正しく処理を委譲することを検証
- **前提条件**:
  - FileSelector のモックが用意されている
  - CommitMessageBuilder のモックが用意されている
  - SecretMasker のモックが用意されている
  - SimpleGit のモックが用意されている
- **入力**:
  - `phaseName`: `'implementation'`
  - `phaseNumber`: `4`
  - `step`: `'execute'`
  - `issueNumber`: `123`
  - `workingDir`: `'/path/to/repo/.ai-workflow/issue-123/04_implementation'`
- **期待結果**:
  - `fileSelector.getChangedFiles()` が1回呼ばれる
  - `fileSelector.filterPhaseFiles(changedFiles, '123')` が1回呼ばれる
  - `secretMasker.maskSecretsInWorkflowDir()` が1回呼ばれる
  - `messageBuilder.buildStepCommitMessage('implementation', 4, 'execute', 123)` が1回呼ばれる
  - `git.add()` が1回呼ばれる
  - `git.commit()` が1回呼ばれる
  - `CommitResult` オブジェクトが返される
- **テストデータ**:
  ```typescript
  fileSelector.getChangedFiles() returns ['src/index.ts', '.ai-workflow/issue-123/04_implementation/execute/output/code.ts']
  fileSelector.filterPhaseFiles() returns ['src/index.ts', '.ai-workflow/issue-123/04_implementation/execute/output/code.ts']
  secretMasker.maskSecretsInWorkflowDir() returns { filesProcessed: 1, secretsMasked: 0, errors: [] }
  messageBuilder.buildStepCommitMessage() returns '[ai-workflow] Phase 4 (implementation) - execute completed...'
  git.commit() returns { commit: 'def456', summary: { changes: 2, insertions: 20, deletions: 0 } }
  ```

---

### 2.12. CommitManager - commitWorkflowInit()（委譲動作）

#### テストケース 2.12.1: commitWorkflowInit_正常系_委譲動作の検証

- **目的**: CommitManager が FileSelector と CommitMessageBuilder に正しく処理を委譲することを検証
- **前提条件**:
  - FileSelector のモックが用意されている
  - CommitMessageBuilder のモックが用意されている
  - SecretMasker のモックが用意されている
  - SimpleGit のモックが用意されている
- **入力**:
  - `issueNumber`: `123`
  - `branchName`: `'ai-workflow/issue-123'`
- **期待結果**:
  - `fileSelector.getChangedFiles()` が1回呼ばれる
  - `fileSelector.filterPhaseFiles(changedFiles, '123')` が1回呼ばれる
  - `secretMasker.maskSecretsInWorkflowDir()` が1回呼ばれる
  - `messageBuilder.createInitCommitMessage(123, 'ai-workflow/issue-123')` が1回呼ばれる
  - `git.add()` が1回呼ばれる
  - `git.commit()` が1回呼ばれる
  - `CommitResult` オブジェクトが返される
- **テストデータ**:
  ```typescript
  fileSelector.getChangedFiles() returns ['.ai-workflow/issue-123/metadata.json']
  fileSelector.filterPhaseFiles() returns ['.ai-workflow/issue-123/metadata.json']
  secretMasker.maskSecretsInWorkflowDir() returns { filesProcessed: 1, secretsMasked: 0, errors: [] }
  messageBuilder.createInitCommitMessage() returns '[ai-workflow] Initialize workflow for issue #123...'
  git.commit() returns { commit: 'ghi789', summary: { changes: 1, insertions: 50, deletions: 0 } }
  ```

---

### 2.13. CommitManager - commitCleanupLogs()（委譲動作）

#### テストケース 2.13.1: commitCleanupLogs_正常系_委譲動作の検証

- **目的**: CommitManager が FileSelector と CommitMessageBuilder に正しく処理を委譲することを検証
- **前提条件**:
  - FileSelector のモックが用意されている
  - CommitMessageBuilder のモックが用意されている
  - SimpleGit のモックが用意されている
- **入力**:
  - `issueNumber`: `123`
  - `phase`: `'report'`
- **期待結果**:
  - `fileSelector.getChangedFiles()` が1回呼ばれる
  - `fileSelector.filterPhaseFiles(changedFiles, '123')` が1回呼ばれる
  - `messageBuilder.createCleanupCommitMessage(123, 'report')` が1回呼ばれる
  - `git.add()` が1回呼ばれる
  - `git.commit()` が1回呼ばれる
  - `CommitResult` オブジェクトが返される
- **テストデータ**:
  ```typescript
  fileSelector.getChangedFiles() returns ['.ai-workflow/issue-123/08_report/metadata.json']
  fileSelector.filterPhaseFiles() returns ['.ai-workflow/issue-123/08_report/metadata.json']
  messageBuilder.createCleanupCommitMessage() returns '[ai-workflow] Clean up workflow execution logs...'
  git.commit() returns { commit: 'jkl012', summary: { changes: 1, insertions: 0, deletions: 100 } }
  ```

---

### 2.14. CommitManager - createCommitMessage()（公開API）

#### テストケース 2.14.1: createCommitMessage_正常系_CommitMessageBuilderへの委譲

- **目的**: 公開メソッド `createCommitMessage()` が CommitMessageBuilder に正しく委譲されることを検証
- **前提条件**:
  - CommitMessageBuilder のモックが用意されている
- **入力**:
  - `phaseName`: `'requirements'`
  - `status`: `'completed'`
  - `reviewResult`: `'PASS'`
- **期待結果**:
  - `messageBuilder.createCommitMessage('requirements', 'completed', 'PASS')` が1回呼ばれる
  - 返り値が CommitMessageBuilder の返り値と一致する
- **テストデータ**:
  ```typescript
  messageBuilder.createCommitMessage() returns '[ai-workflow] Phase 1 (requirements) - completed...'
  ```

---

## 3. Integrationテストシナリオ

### 3.1. GitManager → CommitManager → FileSelector/CommitMessageBuilder 統合

#### シナリオ 3.1.1: フェーズ出力コミットのエンドツーエンド統合

- **目的**: GitManager → CommitManager → FileSelector/CommitMessageBuilder の連携が正常に動作することを検証
- **前提条件**:
  - 実際のGitリポジトリが存在する（テスト用）
  - `.ai-workflow/issue-123/01_requirements/` ディレクトリが存在する
  - 以下のファイルが変更されている:
    - `.ai-workflow/issue-123/metadata.json`
    - `.ai-workflow/issue-123/01_requirements/output/requirements.md`
    - `src/index.ts`
- **テスト手順**:
  1. GitManager のインスタンスを生成
  2. `gitManager.commitPhaseOutput('requirements', 'completed', 'PASS')` を呼び出す
  3. Git ログを確認
- **期待結果**:
  - コミットが正常に作成される
  - コミットメッセージが以下のフォーマットである:
    ```
    [ai-workflow] Phase 1 (requirements) - completed

    Issue: #123
    Phase: 1 (requirements)
    Status: completed
    Review: PASS

    Auto-generated by AI Workflow
    ```
  - コミットに含まれるファイルが以下である:
    - `.ai-workflow/issue-123/metadata.json`
    - `.ai-workflow/issue-123/01_requirements/output/requirements.md`
    - `src/index.ts`
  - `@tmp` を含むファイルがコミットから除外される
- **確認項目**:
  - [ ] コミットが作成された
  - [ ] コミットメッセージが正しいフォーマットである
  - [ ] コミットに正しいファイルが含まれている
  - [ ] `@tmp` を含むファイルが除外されている
  - [ ] SecretMasker が実行された

---

#### シナリオ 3.1.2: ステップ出力コミットのエンドツーエンド統合

- **目的**: GitManager → CommitManager → FileSelector/CommitMessageBuilder の連携（ステップコミット）が正常に動作することを検証
- **前提条件**:
  - 実際のGitリポジトリが存在する（テスト用）
  - `.ai-workflow/issue-123/04_implementation/execute/` ディレクトリが存在する
  - 以下のファイルが変更されている:
    - `.ai-workflow/issue-123/04_implementation/execute/output/code.ts`
    - `src/new-feature.ts`
- **テスト手順**:
  1. GitManager のインスタンスを生成
  2. `gitManager.commitStepOutput('implementation', 4, 'execute', 123, '/path')` を呼び出す
  3. Git ログを確認
- **期待結果**:
  - コミットが正常に作成される
  - コミットメッセージが以下のフォーマットである:
    ```
    [ai-workflow] Phase 4 (implementation) - execute completed

    Issue: #123
    Phase: 4 (implementation)
    Step: execute
    Status: completed

    Auto-generated by AI Workflow
    ```
  - コミットに含まれるファイルが以下である:
    - `.ai-workflow/issue-123/04_implementation/execute/output/code.ts`
    - `src/new-feature.ts`
- **確認項目**:
  - [ ] コミットが作成された
  - [ ] コミットメッセージが正しいフォーマットである
  - [ ] コミットに正しいファイルが含まれている
  - [ ] SecretMasker が実行された

---

### 3.2. 後方互換性の検証

#### シナリオ 3.2.1: 既存の統合テストが成功する

- **目的**: リファクタリング後も既存の統合テスト（`step-commit-push.test.ts`）が成功することで、後方互換性100%を保証
- **前提条件**:
  - リファクタリングが完了している
  - 既存の統合テストスイート（`step-commit-push.test.ts`）が存在する
- **テスト手順**:
  1. `npm run test:integration` を実行
  2. テスト結果を確認
- **期待結果**:
  - すべての統合テストが成功する
  - テスト実行時間がリファクタリング前と比較して±5%以内である
- **確認項目**:
  - [ ] すべての統合テストが成功した
  - [ ] パフォーマンス劣化がない（±5%以内）
  - [ ] GitManager の呼び出しインターフェースが変更されていない

---

#### シナリオ 3.2.2: git-manager.ts のコード変更が不要

- **目的**: リファクタリング後も git-manager.ts のコード変更が不要であることを検証
- **前提条件**:
  - リファクタリングが完了している
- **テスト手順**:
  1. git-manager.ts のコードを確認
  2. CommitManager の呼び出し箇所を確認
- **期待結果**:
  - git-manager.ts のコードが変更されていない
  - CommitManager の公開API（`commitPhaseOutput`, `commitStepOutput`, `createCommitMessage` 等）が維持されている
- **確認項目**:
  - [ ] git-manager.ts のコードが変更されていない
  - [ ] CommitManager の公開APIが維持されている
  - [ ] GitManager からの呼び出しが正常に動作する

---

### 3.3. FileSelector と CommitMessageBuilder の統合

#### シナリオ 3.3.1: FileSelector と CommitMessageBuilder が正しく連携する

- **目的**: FileSelector と CommitMessageBuilder が CommitManager 経由で正しく連携することを検証
- **前提条件**:
  - 実際のGitリポジトリが存在する（テスト用）
  - 複数のフェーズのファイルが変更されている:
    - `.ai-workflow/issue-123/01_requirements/output/requirements.md`
    - `.ai-workflow/issue-456/02_design/output/design.md`
    - `src/index.ts`
- **テスト手順**:
  1. CommitManager のインスタンスを生成
  2. `commitManager.commitPhaseOutput('requirements', 'completed', 'PASS')` を呼び出す
  3. Git ログを確認
- **期待結果**:
  - FileSelector が Issue #123 のファイルのみを選択する
  - CommitMessageBuilder が正しいフォーマットのメッセージを生成する
  - コミットに含まれるファイルが以下である:
    - `.ai-workflow/issue-123/01_requirements/output/requirements.md`
    - `src/index.ts`
  - Issue #456 のファイルは除外される
- **確認項目**:
  - [ ] FileSelector が正しくファイルを選択した
  - [ ] CommitMessageBuilder が正しいメッセージを生成した
  - [ ] Issue #456 のファイルが除外された

---

### 3.4. SecretMasker 統合の維持

#### シナリオ 3.4.1: SecretMasker がコミット前に実行される

- **目的**: リファクタリング後も SecretMasker がコミット前に正しく実行されることを検証
- **前提条件**:
  - 実際のGitリポジトリが存在する（テスト用）
  - `.ai-workflow/issue-123/metadata.json` にシークレット候補が含まれる（例: `"api_key": "secret123"`）
- **テスト手順**:
  1. CommitManager のインスタンスを生成
  2. `commitManager.commitPhaseOutput('requirements', 'completed', 'PASS')` を呼び出す
  3. SecretMasker のログを確認
  4. コミット後の `metadata.json` を確認
- **期待結果**:
  - SecretMasker が実行される
  - シークレットがマスクされる（例: `"api_key": "***"`）
  - ログに「Masked X secret(s) in Y file(s)」が出力される
- **確認項目**:
  - [ ] SecretMasker が実行された
  - [ ] シークレットがマスクされた
  - [ ] ログが正しく出力された

---

## 4. テストデータ

### 4.1. FileSelector テストデータ

#### 4.1.1. Git Status モックデータ

```typescript
// 正常系: 複数のステータス
const gitStatusNormal = {
  not_added: ['src/new-file.ts'],
  created: ['src/created.ts'],
  modified: ['src/modified.ts', '.ai-workflow/issue-123/metadata.json'],
  staged: ['src/staged.ts'],
  deleted: ['src/deleted.ts'],
  renamed: [{ from: 'old.ts', to: 'new.ts' }],
  files: ['src/index.ts']
};

// 境界値: @tmp を含むファイル
const gitStatusWithTmp = {
  modified: ['src/index.ts', 'src/@tmp/temp.ts', '.ai-workflow/issue-123/@tmp/log.txt'],
  not_added: [],
  created: [],
  staged: [],
  deleted: [],
  renamed: [],
  files: []
};

// 境界値: 空のステータス
const gitStatusEmpty = {
  modified: [],
  staged: [],
  not_added: [],
  created: [],
  deleted: [],
  renamed: [],
  files: []
};
```

#### 4.1.2. ファイルリストテストデータ

```typescript
// 正常系: 複数Issueのファイル
const filesMultipleIssues = [
  '.ai-workflow/issue-123/metadata.json',
  '.ai-workflow/issue-123/01_requirements/output/requirements.md',
  '.ai-workflow/issue-456/metadata.json',
  'src/index.ts',
  'src/util.ts'
];

// 正常系: フェーズ固有ファイル（implementation）
const filesImplementation = [
  'scripts/deploy.sh',
  'pulumi/index.ts',
  'ansible/playbook.yml',
  'jenkins/Jenkinsfile',
  'src/index.ts'
];

// 正常系: フェーズ固有ファイル（test_implementation）
const filesTestImplementation = [
  'src/index.test.ts',
  'src/util.spec.ts',
  'tests/test_util.py',
  'src/index.ts'
];

// 正常系: フェーズ固有ファイル（documentation）
const filesDocumentation = [
  'README.md',
  'docs/API.MD',
  'ARCHITECTURE.md',
  'src/index.ts'
];
```

### 4.2. CommitMessageBuilder テストデータ

#### 4.2.1. Metadata テストデータ

```typescript
// 正常系: Issue #123
const metadataIssue123 = {
  issue_number: '123',
  issue_title: 'Refactor commit-manager.ts',
  current_phase: 'requirements',
  status: 'in_progress'
};

// 正常系: Issue #456
const metadataIssue456 = {
  issue_number: '456',
  issue_title: 'Add new feature',
  current_phase: 'implementation',
  status: 'in_progress'
};
```

#### 4.2.2. フェーズ順序テストデータ

```typescript
const phaseOrder = [
  'planning',        // Phase 0
  'requirements',    // Phase 1
  'design',          // Phase 2
  'test_scenario',   // Phase 3
  'implementation',  // Phase 4
  'test_implementation', // Phase 5
  'testing',         // Phase 6
  'documentation',   // Phase 7
  'report',          // Phase 8
  'evaluation',      // Phase 9
];
```

### 4.3. CommitManager テストデータ

#### 4.3.1. CommitResult テストデータ

```typescript
// 正常系: コミット成功
const commitResultSuccess = {
  success: true,
  commit_hash: 'abc123def456',
  files_committed: [
    '.ai-workflow/issue-123/metadata.json',
    'src/index.ts'
  ]
};

// 異常系: Issue番号なし
const commitResultNoIssue = {
  success: false,
  commit_hash: null,
  files_committed: [],
  error: 'Issue number not found in metadata'
};

// 境界値: 変更ファイルなし
const commitResultNoFiles = {
  success: true,
  commit_hash: null,
  files_committed: []
};
```

---

## 5. テスト環境要件

### 5.1. ローカル開発環境

#### 必要なツール
- Node.js 20以上
- npm 10以上
- Git 2.x

#### 必要な開発ツール
- TypeScript 5.x
- Jest（ES modules モード）
- ESLint

### 5.2. CI/CD 環境

#### GitHub Actions
- Node.js 20
- Git 2.x
- テスト用の一時的なGitリポジトリ作成

### 5.3. 外部サービス・データベース

- **不要**: このリファクタリングではデータベースや外部サービスは使用しない

### 5.4. モック/スタブの必要性

#### Unitテストで必要なモック

1. **SimpleGit モック**
   - `git.status()`: Git statusのモックデータを返す
   - `git.add()`: ステージング動作をモック
   - `git.commit()`: コミット動作をモック

2. **MetadataManager モック**
   - `metadata.data.issue_number`: Issue番号を返す
   - `metadata.data`: メタデータオブジェクトを返す

3. **SecretMasker モック**
   - `secretMasker.maskSecretsInWorkflowDir()`: マスキング結果をモック

4. **FileSelector モック**（CommitManager のテスト用）
   - `fileSelector.getChangedFiles()`: 変更ファイルリストを返す
   - `fileSelector.filterPhaseFiles()`: フィルタされたファイルリストを返す
   - `fileSelector.getPhaseSpecificFiles()`: フェーズ固有ファイルリストを返す

5. **CommitMessageBuilder モック**（CommitManager のテスト用）
   - `messageBuilder.createCommitMessage()`: コミットメッセージを返す
   - `messageBuilder.buildStepCommitMessage()`: ステップコミットメッセージを返す

#### Integrationテストで必要な実環境

1. **実際のGitリポジトリ**
   - テスト用の一時的なGitリポジトリを作成
   - `.ai-workflow/issue-*/` ディレクトリ構造を作成

2. **実際のファイルシステム**
   - テスト用のファイルを作成
   - テスト後にクリーンアップ

---

## 6. 品質ゲート（Phase 3）

このテストシナリオは以下の品質ゲートを満たしています：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略 **UNIT_INTEGRATION** に準拠
  - Unitテストシナリオ（セクション2）: FileSelector、CommitMessageBuilder、CommitManager の全メソッドをカバー
  - Integrationテストシナリオ（セクション3）: GitManager統合、後方互換性検証、エンドツーエンド統合をカバー

- [x] **主要な正常系がカバーされている**
  - FileSelector: `getChangedFiles()`, `filterPhaseFiles()`, `getPhaseSpecificFiles()`, `scanDirectories()`, `scanByPatterns()` の正常系をカバー
  - CommitMessageBuilder: `createCommitMessage()`, `buildStepCommitMessage()`, `createInitCommitMessage()`, `createCleanupCommitMessage()` の正常系をカバー
  - CommitManager: `commitPhaseOutput()`, `commitStepOutput()`, `commitWorkflowInit()`, `commitCleanupLogs()` の委譲動作をカバー
  - 統合テスト: フェーズ出力コミット、ステップ出力コミット、後方互換性のエンドツーエンドをカバー

- [x] **主要な異常系がカバーされている**
  - FileSelector: `@tmp` 除外、重複除去、空のファイルリスト、該当ファイルなし
  - CommitMessageBuilder: `reviewResult` 未指定
  - CommitManager: Issue番号なし、変更ファイルなし
  - 統合テスト: 複数Issueのファイル混在、SecretMasker統合

- [x] **期待結果が明確である**
  - 各テストケースに明確な期待結果を記載
  - 入力データと出力データを明示
  - 確認項目をチェックリスト形式で記載

---

## 7. テスト実行計画

### 7.1. Unitテスト実行順序

1. **FileSelector のユニットテスト**（優先度: 高）
   - `getChangedFiles()` のテスト（5ケース）
   - `filterPhaseFiles()` のテスト（4ケース）
   - `getPhaseSpecificFiles()` のテスト（4ケース）
   - `scanDirectories()` のテスト（4ケース）
   - `scanByPatterns()` のテスト（6ケース）
   - **見積もり**: 1~1.5時間

2. **CommitMessageBuilder のユニットテスト**（優先度: 高）
   - `createCommitMessage()` のテスト（4ケース）
   - `buildStepCommitMessage()` のテスト（2ケース）
   - `createInitCommitMessage()` のテスト（1ケース）
   - `createCleanupCommitMessage()` のテスト（2ケース）
   - **見積もり**: 0.5~1時間

3. **CommitManager の委譲テスト**（優先度: 高）
   - `commitPhaseOutput()` のテスト（3ケース）
   - `commitStepOutput()` のテスト（1ケース）
   - `commitWorkflowInit()` のテスト（1ケース）
   - `commitCleanupLogs()` のテスト（1ケース）
   - `createCommitMessage()` のテスト（1ケース）
   - **見積もり**: 0.5~1時間

### 7.2. Integrationテスト実行順序

1. **GitManager → CommitManager → FileSelector/CommitMessageBuilder 統合**（優先度: 高）
   - フェーズ出力コミットのエンドツーエンド統合（1シナリオ）
   - ステップ出力コミットのエンドツーエンド統合（1シナリオ）
   - **見積もり**: 0.5時間

2. **後方互換性の検証**（優先度: 高）
   - 既存の統合テストが成功する（1シナリオ）
   - git-manager.ts のコード変更が不要（1シナリオ）
   - **見積もり**: 0.5時間

3. **FileSelector と CommitMessageBuilder の統合**（優先度: 中）
   - FileSelector と CommitMessageBuilder が正しく連携する（1シナリオ）
   - **見積もり**: 0.25時間

4. **SecretMasker 統合の維持**（優先度: 中）
   - SecretMasker がコミット前に実行される（1シナリオ）
   - **見積もり**: 0.25時間

### 7.3. テスト実行コマンド

```bash
# Unitテストのみ実行
npm run test:unit

# Integrationテストのみ実行
npm run test:integration

# すべてのテストを実行
npm test

# カバレッジレポート生成
npm run test:coverage
```

---

## 8. 成功基準

このテストシナリオが成功したと判断する基準：

### 8.1. Unitテスト成功基準
- ✅ FileSelector の全メソッドに対するユニットテストが成功する（23ケース）
- ✅ CommitMessageBuilder の全メソッドに対するユニットテストが成功する（9ケース）
- ✅ CommitManager の委譲動作に対するユニットテストが成功する（7ケース）
- ✅ ユニットテストカバレッジが90%以上である

### 8.2. Integrationテスト成功基準
- ✅ GitManager → CommitManager → FileSelector/CommitMessageBuilder の統合テストが成功する（2シナリオ）
- ✅ 既存の統合テスト（`step-commit-push.test.ts`）が成功する
- ✅ git-manager.ts のコード変更が不要である
- ✅ パフォーマンス劣化がない（±5%以内）

### 8.3. 後方互換性成功基準
- ✅ CommitManager の公開APIが維持される
- ✅ 既存の呼び出し元コードが無変更で動作する
- ✅ すべての既存テストが成功する

---

**テストシナリオ作成日**: 2025-01-31
**見積もり総工数**: 2時間（テストシナリオ作成）
**テスト実装工数**: 2~3時間（Phase 5）
**テスト実行工数**: 1時間（Phase 6）
**テスト戦略**: UNIT_INTEGRATION
**品質ゲート**: すべて満たす
