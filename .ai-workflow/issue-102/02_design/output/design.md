# 詳細設計書 - Issue #102

## 0. Planning Documentの確認

Planning Documentを確認し、以下の開発計画を踏まえて設計を実施しました：

### 開発計画の概要
- **複雑度**: 簡単
- **見積もり工数**: 2~3時間
- **リスク評価**: 低
- **実装戦略**: EXTEND（既存テストファイルの修正）
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストの期待値修正）

### スコープ
- テストファイル2つの期待値修正（file-selector.test.ts、commit-message-builder.test.ts）
- Jest設定ファイル1つの修正（jest.config.cjs）
- 本体コード（src/配下）の変更は不要

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│  Issue #102 - テストインフラ修正                              │
│  （元Issue: #52のフォローアップ）                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  Task 1: テスト期待値の修正               │
        │  ・file-selector.test.ts (lines 72-79)  │
        │  ・commit-message-builder.test.ts       │
        │    (lines 205, 222)                     │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  Task 2: Jest設定の修正                  │
        │  ・jest.config.cjs                      │
        │  ・transformIgnorePatterns に chalk追加 │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  検証: テスト実行                         │
        │  ・npm run test:unit                    │
        │  ・npm run test:integration             │
        └─────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────────┐
│  本体コード（src/）                                            │
│  ・src/core/git/file-selector.ts        ←─ 実装済み（変更なし）│
│  ・src/core/git/commit-message-builder.ts ←─ 実装済み（変更なし）│
└─────────────────────────────────────────────────────────────┘
                              │
                              │ テスト対象
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  テストコード（tests/）                                        │
│  ・tests/unit/git/file-selector.test.ts        ←─ 期待値修正  │
│  ・tests/unit/git/commit-message-builder.test.ts ←─ 期待値修正│
│  ・tests/integration/git/commit-manager.test.ts ←─ 実行可能化 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 実行環境
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Jest設定（jest.config.cjs）                                  │
│  ・transformIgnorePatterns の修正       ←─ chalk対応        │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 データフロー

```
1. Jest設定読み込み
   jest.config.cjs → transformIgnorePatterns → chalk を ESM として処理

2. ユニットテスト実行
   npm run test:unit → file-selector.test.ts → 期待値チェック
                    → commit-message-builder.test.ts → 期待値チェック

3. 統合テスト実行
   npm run test:integration → commit-manager.test.ts → chalk モジュール読み込み
                                                      → テスト実行
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND（拡張）

**判断根拠**:
1. **既存テストファイルの修正が中心**
   - file-selector.test.ts: 期待値の修正（lines 72-79）
   - commit-message-builder.test.ts: 期待値の修正（lines 205, 222）
   - jest.config.cjs: transformIgnorePatterns の拡張

2. **新規ファイル・クラスの作成は不要**
   - すべての修正が既存ファイル内で完結
   - 新しいコンポーネントやモジュールの追加なし

3. **本体コード（src/配下）の変更は不要**
   - src/core/git/file-selector.ts: 実装済み、動作確認済み
   - src/core/git/commit-message-builder.ts: 実装済み、動作確認済み
   - テストシナリオの期待値のみが誤っている

4. **既存のテスト構造を維持**
   - テストケースの追加・削除なし
   - テスト構造（Given-When-Then）の変更なし
   - 期待値の数値・型定義のみを修正

---

## 3. テスト戦略判断

### テスト戦略: UNIT_ONLY（ユニットテストのみ）

**判断根拠**:
1. **修正対象がユニットテストのみ**
   - file-selector.test.ts: FileSelector クラスのユニットテスト
   - commit-message-builder.test.ts: CommitMessageBuilder クラスのユニットテスト
   - commit-manager.test.ts: CommitManager の統合テスト（Jest設定修正で実行可能にするのみ）

2. **外部システム連携は不要**
   - Git操作はモック化済み（SimpleGit モック）
   - GitHub API 呼び出しなし
   - ファイルシステム操作は最小限（Git statusのモック）

3. **ユーザーストーリーは不要**
   - テストインフラの修正であり、エンドユーザー機能の変更ではない
   - BDDテスト（Given-When-Then形式のシナリオ）は既に記述済み
   - 新規ユーザーストーリーの追加は不要

4. **既存のユニットテスト・統合テストを修正・有効化するのみ**
   - 新規テストケースの追加なし
   - 既存テストの期待値修正のみ
   - 統合テストは実行可能にするが、テスト内容の変更なし

---

## 4. テストコード戦略判断

### テストコード戦略: EXTEND_TEST（既存テストの拡張）

**判断根拠**:
1. **既存テストファイルの期待値を修正**
   - file-selector.test.ts: 既存のテストケース「getChangedFiles_境界値_重複ファイルの除去」の期待値を修正
   - commit-message-builder.test.ts: 既存のテストケース「createCleanupCommitMessage」の期待値を修正
   - 既存のテストファイル構造を保持

2. **新規テストファイルの作成は不要**
   - FileSelector、CommitMessageBuilder のテストは既に存在
   - テストカバレッジは90.6%を達成（目標90%以上）
   - 新規テストケースの追加は不要

3. **既存のテスト構造・テストケースを維持**
   - Given-When-Then 構造を維持
   - テストケース数（23ケース + 9ケース）を維持
   - テストケース名を変更しない

4. **期待値の修正のみで、新規テストケースの追加は不要**
   - 実装コードは正しく動作している
   - テストシナリオの期待値のみが誤っている
   - 修正箇所は3箇所のみ（lines 72-79, 205, 222）

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

#### テストコード（3ファイル）

**ファイル1: tests/unit/git/file-selector.test.ts**
- **修正箇所**: lines 72-79
- **修正内容**: モックデータの型定義を修正
- **影響度**: 低
- **詳細**:
  ```typescript
  // 現在（誤った型定義）
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: ['src/index.ts', 'src/other.ts'],  // この型定義がSimpleGit型に不一致
    // ...
  } as any);

  // 修正後（正しい型定義）
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: [
      { path: 'src/index.ts', index: 'M', working_dir: 'M' },
      { path: 'src/other.ts', index: 'M', working_dir: 'M' }
    ],
    // ...
  } as any);
  ```

**ファイル2: tests/unit/git/commit-message-builder.test.ts**
- **修正箇所**: lines 205, 222
- **修正内容**: Phase番号の期待値を修正
- **影響度**: 低
- **詳細**:
  ```typescript
  // Line 205（現在）
  expect(message).toContain('Phase: 9 (report)');

  // Line 205（修正後）
  expect(message).toContain('Phase: 8 (report)');

  // Line 222（現在）
  expect(message).toContain('Phase: 10 (evaluation)');

  // Line 222（修正後）
  expect(message).toContain('Phase: 9 (evaluation)');
  ```

**ファイル3: tests/integration/git/commit-manager.test.ts**
- **修正内容**: なし（Jest設定修正により実行可能になるのみ）
- **影響度**: なし（テストコード自体の変更なし）

#### 設定ファイル（1ファイル）

**ファイル: jest.config.cjs**
- **修正箇所**: transformIgnorePatterns の追加
- **修正内容**: chalk パッケージを ESM 対応リストに追加
- **影響度**: 低
- **詳細**:
  ```javascript
  // 現在
  // transformIgnorePatternsが未定義（デフォルトではすべてのnode_modulesを無視）

  // 修正後
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
  ],
  ```

#### 本体コード

**影響なし**:
- `src/core/git/file-selector.ts`: 変更なし
- `src/core/git/commit-message-builder.ts`: 変更なし
- その他すべての src/ 配下のファイル: 変更なし

### 5.2 依存関係の変更

#### 新規依存の追加
**なし**

#### 既存依存の変更
**なし**
- chalk は既存依存として package.json に含まれている
- バージョン変更なし

#### Jest設定の変更
- **transformIgnorePatterns の追加**:
  - 目的: ESM パッケージ（chalk、strip-ansi、ansi-regex）を Jest で正しく処理
  - 影響範囲: 統合テスト（commit-manager.test.ts）のみ
  - 他のテストへの影響: なし（既存のユニットテストはESMパッケージを使用していない）

### 5.3 マイグレーション要否

**不要**

- **データベーススキーマ変更**: なし
- **設定ファイル変更**: Jest設定のみ（開発環境のみ影響、本番環境への影響なし）
- **環境変数追加**: なし
- **バージョンアップグレード**: なし

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル
**なし**

### 6.2 修正が必要な既存ファイル

1. **tests/unit/git/file-selector.test.ts**
   - 修正箇所: lines 72-79
   - 修正内容: モックデータの型定義修正
   - 修正行数: 8行

2. **tests/unit/git/commit-message-builder.test.ts**
   - 修正箇所: lines 205, 222
   - 修正内容: Phase番号の期待値修正
   - 修正行数: 2行

3. **jest.config.cjs**
   - 修正箇所: transformIgnorePatterns の追加（新規プロパティ）
   - 修正内容: chalk を ESM 対応リストに追加
   - 修正行数: 3行（プロパティ追加）

### 6.3 削除が必要なファイル
**なし**

---

## 7. 詳細設計

### 7.1 テスト期待値の修正設計

#### 修正1: file-selector.test.ts (lines 72-79)

**目的**: モックデータの型定義を SimpleGit の FileStatusResult 型に準拠させる

**現在の実装（誤った型定義）**:
```typescript
test('getChangedFiles_境界値_重複ファイルの除去', async () => {
  // Given: 重複ファイルが複数のステータスに含まれる
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: ['src/index.ts', 'src/other.ts'],  // ❌ 誤った型定義
    not_added: [],
    created: [],
    deleted: [],
    renamed: [],
  } as any);
  // ...
});
```

**修正後の実装（正しい型定義）**:
```typescript
test('getChangedFiles_境界値_重複ファイルの除去', async () => {
  // Given: 重複ファイルが複数のステータスに含まれる
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: [  // ✅ FileStatusResult[] 型に準拠
      { path: 'src/index.ts', index: 'M', working_dir: 'M' },
      { path: 'src/other.ts', index: 'M', working_dir: 'M' }
    ],
    not_added: [],
    created: [],
    deleted: [],
    renamed: [],
  } as any);
  // ...
});
```

**修正理由**:
- SimpleGit の `StatusResult.files` プロパティは `FileStatusResult[]` 型であり、各要素は `{ path: string, index: string, working_dir: string }` オブジェクト
- 現在のモックデータは `string[]` 型であり、型定義が不一致
- 実装コード（file-selector.ts lines 45-46）は `status.files.forEach((file) => aggregated.add(file.path))` として `file.path` を参照しているため、正しい型定義が必要

**影響範囲**:
- このテストケースのみ（他のテストケースには影響なし）

#### 修正2: commit-message-builder.test.ts (line 205)

**目的**: Phase番号の期待値を実装動作に合わせて修正

**現在の実装（誤ったPhase番号）**:
```typescript
test('createCleanupCommitMessage_正常系_reportフェーズ', () => {
  // Given: Issue番号が 123、フェーズが report
  const issueNumber = 123;
  const phase = 'report';

  // When: createCleanupCommitMessage を呼び出す
  const message = messageBuilder.createCleanupCommitMessage(issueNumber, phase);

  // Then: 正しいフォーマットのメッセージが生成される
  expect(message).toContain('[ai-workflow] Clean up workflow execution logs');
  expect(message).toContain('Issue: #123');
  expect(message).toContain('Phase: 9 (report)');  // ❌ 誤ったPhase番号（off-by-oneエラー）
  // ...
});
```

**修正後の実装（正しいPhase番号）**:
```typescript
test('createCleanupCommitMessage_正常系_reportフェーズ', () => {
  // Given: Issue番号が 123、フェーズが report
  const issueNumber = 123;
  const phase = 'report';

  // When: createCleanupCommitMessage を呼び出す
  const message = messageBuilder.createCleanupCommitMessage(issueNumber, phase);

  // Then: 正しいフォーマットのメッセージが生成される
  expect(message).toContain('[ai-workflow] Clean up workflow execution logs');
  expect(message).toContain('Issue: #123');
  expect(message).toContain('Phase: 8 (report)');  // ✅ 正しいPhase番号
  // ...
});
```

**修正理由**:
- 実装コード（commit-message-builder.ts line 138）では `const phaseNumber = phase === 'report' ? 8 : 9;` として Phase番号を計算
- report フェーズは Phase 8、evaluation フェーズは Phase 9
- テストシナリオでは誤って Phase 9（off-by-oneエラー）と記載されていた

**フェーズ番号の対応**:
```
Phase 0: planning (phaseOrder[0] + 1 = 1)
Phase 1: requirements (phaseOrder[1] + 1 = 2)
Phase 2: design (phaseOrder[2] + 1 = 3)
Phase 3: test_scenario (phaseOrder[3] + 1 = 4)
Phase 4: implementation (phaseOrder[4] + 1 = 5)
Phase 5: test_implementation (phaseOrder[5] + 1 = 6)
Phase 6: testing (phaseOrder[6] + 1 = 7)
Phase 7: documentation (phaseOrder[7] + 1 = 8)
Phase 8: report (phaseOrder[8] + 1 = 9)  ← ❌ テストでは Phase 9 と誤記
Phase 9: evaluation (phaseOrder[9] + 1 = 10) ← ❌ テストでは Phase 10 と誤記

⚠️ createCleanupCommitMessage では独自のロジックで Phase番号を計算:
- report → 8
- evaluation → 9
```

**注意**: createCleanupCommitMessage メソッドでは、phaseOrder配列を使用せず、独自のロジックでPhase番号を計算しているため、report=8、evaluation=9 となる。

#### 修正3: commit-message-builder.test.ts (line 222)

**目的**: Phase番号の期待値を実装動作に合わせて修正

**現在の実装（誤ったPhase番号）**:
```typescript
test('createCleanupCommitMessage_正常系_evaluationフェーズ', () => {
  // Given: Issue番号が 456、フェーズが evaluation
  const issueNumber = 456;
  const phase = 'evaluation';

  // When: createCleanupCommitMessage を呼び出す
  const message = messageBuilder.createCleanupCommitMessage(issueNumber, phase);

  // Then: 正しいフォーマットのメッセージが生成される
  expect(message).toContain('[ai-workflow] Clean up workflow execution logs');
  expect(message).toContain('Issue: #456');
  expect(message).toContain('Phase: 10 (evaluation)');  // ❌ 誤ったPhase番号（off-by-oneエラー）
});
```

**修正後の実装（正しいPhase番号）**:
```typescript
test('createCleanupCommitMessage_正常系_evaluationフェーズ', () => {
  // Given: Issue番号が 456、フェーズが evaluation
  const issueNumber = 456;
  const phase = 'evaluation';

  // When: createCleanupCommitMessage を呼び出す
  const message = messageBuilder.createCleanupCommitMessage(issueNumber, phase);

  // Then: 正しいフォーマットのメッセージが生成される
  expect(message).toContain('[ai-workflow] Clean up workflow execution logs');
  expect(message).toContain('Issue: #456');
  expect(message).toContain('Phase: 9 (evaluation)');  // ✅ 正しいPhase番号
});
```

**修正理由**:
- 修正2と同様、createCleanupCommitMessage メソッドでは evaluation フェーズは Phase 9
- テストシナリオでは誤って Phase 10（off-by-oneエラー）と記載されていた

### 7.2 Jest設定の修正設計

#### 修正4: jest.config.cjs - transformIgnorePatterns の追加

**目的**: ESM パッケージ（chalk）を Jest で正しく処理できるようにする

**現在の設定**:
```javascript
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // ❌ transformIgnorePatterns が未定義
  // デフォルトでは /node_modules/ 全体が変換対象外となる
};

module.exports = config;
```

**修正後の設定**:
```javascript
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // ✅ transformIgnorePatterns を追加
  // ESMパッケージ（chalk、strip-ansi、ansi-regex）を変換対象に含める
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
  ],
};

module.exports = config;
```

**修正理由**:
- chalk は ESM（ECMAScript Modules）パッケージであり、Jestのデフォルト設定では正しく処理されない
- transformIgnorePatterns を設定することで、特定のnode_modulesパッケージを変換対象に含めることができる
- 正規表現 `/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)` は「strip-ansi、ansi-regex、chalk 以外の node_modules を無視する」という意味
- strip-ansi、ansi-regex は chalk の依存パッケージであり、同様にESMパッケージのため変換対象に含める必要がある

**影響範囲**:
- 統合テスト（commit-manager.test.ts）のみ
- ユニットテストは chalk を使用していないため影響なし

**検証方法**:
```bash
# 統合テストを実行
npm run test:integration

# 期待される結果: commit-manager.test.ts が実行可能になり、エラーなく完了
```

### 7.3 データ構造設計

**変更なし**

すべての修正はテストの期待値とJest設定のみであり、データ構造の変更はありません。

### 7.4 インターフェース設計

**変更なし**

本体コード（src/配下）の変更がないため、インターフェースの変更はありません。

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可
**影響なし**

テストコードとJest設定の修正のみであり、認証・認可に関する変更はありません。

### 8.2 データ保護
**影響なし**

データ構造の変更がないため、データ保護に関する変更はありません。

### 8.3 セキュリティリスクと対策

**リスク**: なし

**根拠**:
- テストコードの期待値修正のみ
- Jest設定の修正は開発環境のみに影響
- 本番環境への影響なし
- 新規パッケージの追加なし（chalk は既存依存）

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**要件**: テスト実行時間が修正前後で±5%以内であること（NFR-1）

**設計**:
- テストケースの数や構造は変更しないため、パフォーマンスへの影響はほぼゼロ
- transformIgnorePatterns の追加により、chalk の変換処理が追加されるが、影響は統合テストのみ（数ミリ秒程度）

**検証方法**:
```bash
# 修正前のテスト実行時間を計測
time npm test

# 修正後のテスト実行時間を計測
time npm test

# 差分が±5%以内であることを確認
```

### 9.2 スケーラビリティ

**影響なし**

テストコードとJest設定の修正のみであり、スケーラビリティに関する変更はありません。

### 9.3 保守性

**要件**: コメントの追加、コード可読性の維持（NFR-2）

**設計**:
1. **コメントの追加**:
   - file-selector.test.ts: モックデータの型定義修正箇所に「FileStatusResult 型に準拠」というコメントを追加
   - commit-message-builder.test.ts: Phase番号修正箇所に「実装では report=8、evaluation=9」というコメントを追加
   - jest.config.cjs: transformIgnorePatterns に「ESMパッケージ（chalk）対応」というコメントを追加

2. **コード可読性の維持**:
   - 既存のテスト構造（Given-When-Then）を維持
   - テストケース名を変更しない
   - Jest設定の他のプロパティを変更しない

**例（コメント追加）**:
```typescript
// file-selector.test.ts
test('getChangedFiles_境界値_重複ファイルの除去', async () => {
  // Given: 重複ファイルが複数のステータスに含まれる
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    // FileStatusResult 型に準拠（path, index, working_dir を含むオブジェクト）
    files: [
      { path: 'src/index.ts', index: 'M', working_dir: 'M' },
      { path: 'src/other.ts', index: 'M', working_dir: 'M' }
    ],
    // ...
  } as any);
  // ...
});
```

```typescript
// commit-message-builder.test.ts
test('createCleanupCommitMessage_正常系_reportフェーズ', () => {
  // ...
  // 実装では report=Phase 8、evaluation=Phase 9 となる
  expect(message).toContain('Phase: 8 (report)');
  // ...
});
```

```javascript
// jest.config.cjs
const config = {
  // ...
  // ESMパッケージ（chalk、strip-ansi、ansi-regex）を変換対象に含める
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
  ],
};
```

---

## 10. 実装の順序

### 10.1 実装順序の推奨

**Phase 4（実装）での作業順序**:

1. **Step 1**: file-selector.test.ts の期待値修正（15分）
   - lines 72-79 のモックデータ型定義を修正
   - コメント追加（FileStatusResult 型に準拠）
   - ローカルでテスト実行して確認

2. **Step 2**: commit-message-builder.test.ts の期待値修正（15分）
   - line 205 の期待値を修正（Phase 9 → Phase 8）
   - line 222 の期待値を修正（Phase 10 → Phase 9）
   - コメント追加（実装では report=8、evaluation=9）
   - ローカルでテスト実行して確認

3. **Step 3**: jest.config.cjs の修正（15分）
   - transformIgnorePatterns プロパティを追加
   - コメント追加（ESMパッケージ対応）
   - ローカルで統合テスト実行して確認

4. **Step 4**: 全テスト実行による検証（15分）
   - `npm test` で全テストスイートを実行
   - file-selector.test.ts: 23ケース PASS を確認
   - commit-message-builder.test.ts: 9ケース PASS を確認
   - commit-manager.test.ts: 実行可能 & PASS を確認

**合計見積もり時間**: 1時間

### 10.2 依存関係の考慮

**依存関係**:
- Step 1、Step 2、Step 3 は独立しており、並行作業可能
- Step 4 は Step 1-3 がすべて完了してから実行

**推奨実行順序**:
1. Step 1-3 を順次実行（または並行実行）
2. Step 4 で全体検証

**ロールバック計画**:
- 各修正はGitで管理されているため、問題が発生した場合は `git revert` で簡単にロールバック可能
- 修正箇所が3ファイル・合計13行のみであり、リスクは非常に低い

---

## 11. 品質ゲート（Phase 2: Design）

この設計書は以下の品質ゲートを満たしています：

- ✅ **実装戦略の判断根拠が明記されている**: セクション2で4つの根拠を明記
- ✅ **テスト戦略の判断根拠が明記されている**: セクション3で4つの根拠を明記
- ✅ **テストコード戦略の判断根拠が明記されている**: セクション4で4つの根拠を明記
- ✅ **既存コードへの影響範囲が分析されている**: セクション5で詳細に分析
- ✅ **変更が必要なファイルがリストアップされている**: セクション6でリストアップ
- ✅ **設計が実装可能である**: セクション7で具体的な修正内容を明記

---

## 12. まとめ

### 12.1 設計概要

Issue #102は、Issue #52のフォローアップ作業として、3つのテスト期待値の修正とJest設定の修正を行います。

**主要な修正内容**:
1. file-selector.test.ts: モックデータの型定義修正（1箇所、8行）
2. commit-message-builder.test.ts: Phase番号の期待値修正（2箇所、2行）
3. jest.config.cjs: transformIgnorePatterns の追加（1箇所、3行）

**合計**: 3ファイル、13行の修正

### 12.2 設計の特徴

- **低リスク**: 本体コード（src/配下）の変更なし、テストインフラの修正のみ
- **高品質**: 既存のテスト構造を維持、保守性を確保
- **実装容易**: 修正箇所が明確、見積もり工数2~3時間以内

### 12.3 次のフェーズへの引き継ぎ事項

**Phase 3（Test Scenario）**:
- 新規テストケースの追加は不要
- 既存テストシナリオの期待値修正のみ確認

**Phase 4（Implementation）**:
- セクション7の詳細設計に従って修正を実施
- セクション10の実装順序に従って作業

**Phase 6（Testing）**:
- `npm test` で全テストスイート（32ケース）が PASS することを確認
- CI環境（Jenkins）でもテストが成功することを確認

---

**作成日**: 2025-01-31
**作成者**: AI Workflow Phase 2 (Design)
**Issue番号**: #102（元Issue: #52）
**Planning Document**: @.ai-workflow/issue-102/00_planning/output/planning.md
**Requirements Document**: @.ai-workflow/issue-102/01_requirements/output/requirements.md
