# テストシナリオ - Issue #102

## 0. Planning Documentの確認

Planning Documentを確認し、以下のテスト戦略を踏まえてテストシナリオを作成しました：

### テスト戦略
- **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
- **テストコード戦略**: EXTEND_TEST（既存テストの期待値修正）
- **Phase 5（テストコード実装）**: スキップ（新規テスト追加不要）

### テスト範囲
- 既存のユニットテストの期待値修正のみ
- 新規テストケースの追加は不要
- 統合テストは実行可能にするが、テスト内容の変更なし

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_ONLY**（Phase 2で決定）

### 1.2 テスト対象の範囲

**修正対象ファイル**:
1. `tests/unit/git/file-selector.test.ts`（期待値修正）
2. `tests/unit/git/commit-message-builder.test.ts`（期待値修正）
3. `jest.config.cjs`（設定修正）

**検証対象ファイル**（参照のみ、変更なし）:
- `src/core/git/file-selector.ts`
- `src/core/git/commit-message-builder.ts`
- `src/core/git/commit-manager.ts`

### 1.3 テストの目的

**Issue #102の目的**:
1. **テスト期待値の修正**: 実装動作に合わせて期待値を修正し、全ユニットテストがPASSするようにする
2. **Jest設定の修正**: ESMパッケージ（chalk）を正しく処理できるようにし、統合テストを実行可能にする
3. **回帰テストの確認**: 修正によって既存テストに影響がないことを確認する

**テストシナリオの目的**:
- 修正後のテストが正常にPASSすることを確認
- 既存のテスト構造（Given-When-Then）が維持されることを確認
- CI環境でもテストが成功することを確認

---

## 2. Unitテストシナリオ

### 2.1 file-selector.test.ts の期待値修正シナリオ

#### テストケース1: getChangedFiles_境界値_重複ファイルの除去

**テストケース名**: `getChangedFiles_境界値_重複ファイルの除去`（既存テストケース）

**目的**:
- モックデータの型定義を修正し、SimpleGit の FileStatusResult 型に準拠させる
- 修正後、テストが正常にPASSすることを確認

**前提条件**:
- FileSelector クラスが実装されている
- SimpleGit モックが設定されている
- モックデータの型定義が FileStatusResult 型に準拠している（修正後）

**入力**:
- モックデータ（修正後）:
  ```typescript
  mockGit.status.mockResolvedValue({
    modified: ['src/index.ts'],
    staged: ['src/index.ts'],
    files: [
      { path: 'src/index.ts', index: 'M', working_dir: 'M' },
      { path: 'src/other.ts', index: 'M', working_dir: 'M' }
    ],
    not_added: [],
    created: [],
    deleted: [],
    renamed: [],
  } as any);
  ```

**期待結果**:
- `getChangedFiles()` メソッドが正常に実行される
- 重複ファイルが除去された結果が返される: `['src/index.ts', 'src/other.ts']`
- テストケースが PASS する

**テストデータ**:
- 重複ファイル: `src/index.ts`（modified と staged の両方に含まれる）
- 非重複ファイル: `src/other.ts`

**検証項目**:
- ✅ モックデータの型定義が FileStatusResult[] 型に準拠している
- ✅ `file.path` プロパティが正しく参照されている
- ✅ 重複ファイルが除去されている
- ✅ テストケースが PASS する

**修正箇所**:
- `tests/unit/git/file-selector.test.ts` lines 72-79

**修正内容**:
```typescript
// 修正前（誤った型定義）
files: ['src/index.ts', 'src/other.ts'],  // ❌ string[] 型

// 修正後（正しい型定義）
files: [  // ✅ FileStatusResult[] 型
  { path: 'src/index.ts', index: 'M', working_dir: 'M' },
  { path: 'src/other.ts', index: 'M', working_dir: 'M' }
],
```

**コメント追加**:
```typescript
// FileStatusResult 型に準拠（path, index, working_dir を含むオブジェクト）
files: [
  { path: 'src/index.ts', index: 'M', working_dir: 'M' },
  { path: 'src/other.ts', index: 'M', working_dir: 'M' }
],
```

---

### 2.2 commit-message-builder.test.ts の期待値修正シナリオ

#### テストケース2: createCleanupCommitMessage_正常系_reportフェーズ

**テストケース名**: `createCleanupCommitMessage_正常系_reportフェーズ`（既存テストケース）

**目的**:
- Phase番号の期待値を修正し、実装動作（report = Phase 8）に合わせる
- 修正後、テストが正常にPASSすることを確認

**前提条件**:
- CommitMessageBuilder クラスが実装されている
- `createCleanupCommitMessage()` メソッドが実装されている
- 実装では report = Phase 8 となる（設計書 7.1 修正2 参照）

**入力**:
- `issueNumber`: 123
- `phase`: 'report'

**期待結果**:
- コミットメッセージに以下が含まれる:
  - `[ai-workflow] Clean up workflow execution logs`
  - `Issue: #123`
  - `Phase: 8 (report)` ✅（修正後）
- テストケースが PASS する

**テストデータ**:
- Issue番号: 123
- フェーズ: 'report'

**検証項目**:
- ✅ Phase番号が正しい（report = 8）
- ✅ off-by-oneエラーが修正されている
- ✅ テストケースが PASS する

**修正箇所**:
- `tests/unit/git/commit-message-builder.test.ts` line 205

**修正内容**:
```typescript
// 修正前（誤ったPhase番号）
expect(message).toContain('Phase: 9 (report)');  // ❌ off-by-oneエラー

// 修正後（正しいPhase番号）
expect(message).toContain('Phase: 8 (report)');  // ✅ 実装に合わせる
```

**コメント追加**:
```typescript
// 実装では report=Phase 8、evaluation=Phase 9 となる
expect(message).toContain('Phase: 8 (report)');
```

---

#### テストケース3: createCleanupCommitMessage_正常系_evaluationフェーズ

**テストケース名**: `createCleanupCommitMessage_正常系_evaluationフェーズ`（既存テストケース）

**目的**:
- Phase番号の期待値を修正し、実装動作（evaluation = Phase 9）に合わせる
- 修正後、テストが正常にPASSすることを確認

**前提条件**:
- CommitMessageBuilder クラスが実装されている
- `createCleanupCommitMessage()` メソッドが実装されている
- 実装では evaluation = Phase 9 となる（設計書 7.1 修正3 参照）

**入力**:
- `issueNumber`: 456
- `phase`: 'evaluation'

**期待結果**:
- コミットメッセージに以下が含まれる:
  - `[ai-workflow] Clean up workflow execution logs`
  - `Issue: #456`
  - `Phase: 9 (evaluation)` ✅（修正後）
- テストケースが PASS する

**テストデータ**:
- Issue番号: 456
- フェーズ: 'evaluation'

**検証項目**:
- ✅ Phase番号が正しい（evaluation = 9）
- ✅ off-by-oneエラーが修正されている
- ✅ テストケースが PASS する

**修正箇所**:
- `tests/unit/git/commit-message-builder.test.ts` line 222

**修正内容**:
```typescript
// 修正前（誤ったPhase番号）
expect(message).toContain('Phase: 10 (evaluation)');  // ❌ off-by-oneエラー

// 修正後（正しいPhase番号）
expect(message).toContain('Phase: 9 (evaluation)');  // ✅ 実装に合わせる
```

**コメント追加**:
```typescript
// 実装では report=Phase 8、evaluation=Phase 9 となる
expect(message).toContain('Phase: 9 (evaluation)');
```

---

### 2.3 Jest設定の修正シナリオ

#### テストケース4: Jest設定修正による統合テスト実行可能性の確認

**テストケース名**: `Jest設定修正_chalk対応_統合テスト実行可能`

**目的**:
- jest.config.cjs の transformIgnorePatterns を修正し、ESMパッケージ（chalk）を正しく処理できるようにする
- 修正後、統合テスト（commit-manager.test.ts）が実行可能になることを確認

**前提条件**:
- jest.config.cjs が修正されている（transformIgnorePatterns に chalk を追加）
- chalk パッケージが package.json に含まれている（既存依存）
- commit-manager.test.ts が存在する

**入力**:
- jest.config.cjs の修正内容:
  ```javascript
  // 修正後
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
  ],
  ```

**期待結果**:
- `npm run test:integration` で commit-manager.test.ts が実行される
- Jest が chalk モジュールを正しく処理する（エラーが発生しない）
- 統合テストが PASS する

**テストデータ**:
- なし（Jest設定の検証）

**検証項目**:
- ✅ transformIgnorePatterns に chalk が含まれている
- ✅ Jest が chalk を ESM として処理する
- ✅ commit-manager.test.ts が実行可能になる
- ✅ 統合テストが PASS する
- ✅ 既存のユニットテストにも影響がない

**修正箇所**:
- `jest.config.cjs`（transformIgnorePatterns の追加）

**修正内容**:
```javascript
// 修正前（transformIgnorePatterns が未定義）
// デフォルトではすべての node_modules が無視される

// 修正後（chalk を変換対象に含める）
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
],
```

**コメント追加**:
```javascript
// ESMパッケージ（chalk、strip-ansi、ansi-regex）を変換対象に含める
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
],
```

---

### 2.4 全テスト実行による回帰テスト確認シナリオ

#### テストケース5: 全テストスイート実行_回帰なし

**テストケース名**: `全テストスイート実行_回帰なし_100%成功`

**目的**:
- FR-1, FR-2, FR-3 の修正後、全テストスイート（ユニットテスト + 統合テスト）を実行し、回帰テストが成功することを確認
- 既存のテストケースにも影響がないことを確認

**前提条件**:
- FR-1: file-selector.test.ts の期待値が修正されている
- FR-2: commit-message-builder.test.ts の期待値が修正されている
- FR-3: jest.config.cjs の transformIgnorePatterns が修正されている

**入力**:
- テスト実行コマンド: `npm test`（または `npm run test:unit && npm run test:integration`）

**期待結果**:
- **file-selector.test.ts**: 23ケース PASS（100% 成功）
- **commit-message-builder.test.ts**: 9ケース PASS（100% 成功）
- **commit-manager.test.ts**: 統合テスト実行可能 & PASS
- **既存の他のテストケース**: すべて PASS（回帰なし）
- **合計**: 全テストケースが PASS（100% 成功率）

**テストデータ**:
- なし（全テスト実行）

**検証項目**:
- ✅ file-selector.test.ts が全テストケース PASS
- ✅ commit-message-builder.test.ts が全テストケース PASS
- ✅ commit-manager.test.ts が実行可能で PASS
- ✅ 既存テストに回帰がない（他のテストファイルも PASS）
- ✅ テスト実行時間が修正前後で±5%以内（NFR-1）
- ✅ テストカバレッジが90.6%以上を維持

**実行手順**:
1. `npm run test:unit` でユニットテストを実行
2. file-selector.test.ts の結果を確認（23ケース PASS）
3. commit-message-builder.test.ts の結果を確認（9ケース PASS）
4. `npm run test:integration` で統合テストを実行
5. commit-manager.test.ts の結果を確認（実行可能 & PASS）
6. `npm test` で全テストスイートを実行
7. 全テストケースが PASS することを確認
8. テスト実行時間を計測し、修正前と比較（±5%以内）

---

## 3. テストデータ

### 3.1 file-selector.test.ts のテストデータ

**モックデータ（修正前）**:
```typescript
{
  modified: ['src/index.ts'],
  staged: ['src/index.ts'],
  files: ['src/index.ts', 'src/other.ts'],  // ❌ string[] 型（誤り）
  not_added: [],
  created: [],
  deleted: [],
  renamed: [],
}
```

**モックデータ（修正後）**:
```typescript
{
  modified: ['src/index.ts'],
  staged: ['src/index.ts'],
  files: [  // ✅ FileStatusResult[] 型（正しい）
    { path: 'src/index.ts', index: 'M', working_dir: 'M' },
    { path: 'src/other.ts', index: 'M', working_dir: 'M' }
  ],
  not_added: [],
  created: [],
  deleted: [],
  renamed: [],
}
```

### 3.2 commit-message-builder.test.ts のテストデータ

**テストケース2（report フェーズ）**:
- Issue番号: 123
- フェーズ: 'report'
- 期待Phase番号: 8（修正前は9と誤記）

**テストケース3（evaluation フェーズ）**:
- Issue番号: 456
- フェーズ: 'evaluation'
- 期待Phase番号: 9（修正前は10と誤記）

### 3.3 jest.config.cjs の設定データ

**修正前**:
```javascript
// transformIgnorePatterns が未定義
// デフォルト: /node_modules/ 全体が変換対象外
```

**修正後**:
```javascript
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk)/)',
],
```

---

## 4. テスト環境要件

### 4.1 ローカル環境

**必要な環境**:
- Node.js: v20 以上
- npm: v10 以上
- OS: Linux, macOS, Windows（いずれも対応）

**セットアップ手順**:
1. `npm install` で依存パッケージをインストール
2. `npm run build` でビルド（必要に応じて）
3. `npm test` でテスト実行

### 4.2 CI/CD環境

**必要な環境**:
- Jenkins（または GitHub Actions）
- Node.js: v20 以上
- npm: v10 以上

**検証項目**:
- ローカル環境とCI環境でテスト結果が一致することを確認
- CI環境でもすべてのテストが PASS することを確認

### 4.3 モック/スタブの必要性

**既存のモック**:
- SimpleGit モック（file-selector.test.ts、commit-message-builder.test.ts で使用）
- Git操作のモック（統合テストでも使用）

**新規モック**:
- なし（既存モックのみ使用）

---

## 5. CI環境での検証シナリオ

### 5.1 CI環境でのテスト実行

**テストケース名**: `CI環境_Jenkins_テスト成功`

**目的**:
- CI環境（Jenkins）でもローカル環境と同じテスト結果が得られることを確認
- Node.jsバージョン、npmバージョンの整合性を確認

**前提条件**:
- FR-1, FR-2, FR-3 の修正がすべて完了している
- ローカル環境でテストが成功している
- Jenkins環境がセットアップされている

**入力**:
- Jenkins パイプライン実行

**期待結果**:
- ローカル環境と同じテスト結果が得られる（全テストケース PASS）
- Node.jsバージョン、npmバージョンの整合性が確認される
- CI環境でもテストカバレッジが90.6%以上

**検証項目**:
- ✅ CI環境でもローカル環境と同じテスト結果
- ✅ Node.jsバージョン: v20 以上
- ✅ npmバージョン: v10 以上
- ✅ テストカバレッジ: 90.6% 以上

---

## 6. テスト実行計画

### 6.1 Phase 4（実装）後のテスト実行

**実行順序**:
1. **Step 1**: file-selector.test.ts の修正後、`npm run test:unit -- file-selector.test.ts` で個別実行
   - 23ケース PASS を確認

2. **Step 2**: commit-message-builder.test.ts の修正後、`npm run test:unit -- commit-message-builder.test.ts` で個別実行
   - 9ケース PASS を確認

3. **Step 3**: jest.config.cjs の修正後、`npm run test:integration` で統合テスト実行
   - commit-manager.test.ts が実行可能になることを確認

4. **Step 4**: `npm test` で全テストスイートを実行
   - 全テストケースが PASS することを確認
   - テスト実行時間を計測（修正前と比較）

### 6.2 Phase 6（テスト実行）での検証

**Task 6-1: ユニットテスト実行と確認**（0.25~0.5h）
- `npm run test:unit` で file-selector.test.ts を実行
- `npm run test:unit` で commit-message-builder.test.ts を実行
- 期待値修正により全テストケースがPASSすることを確認

**Task 6-2: 統合テスト実行と確認**（0.25~0.25h）
- `npm run test:integration` で commit-manager.test.ts を実行
- Jest設定修正により統合テストが実行可能になることを確認
- 統合テストが全てPASSすることを確認

---

## 7. 品質ゲート（Phase 3: Test Scenario）

このテストシナリオは以下の品質ゲートを満たしています：

- ✅ **Phase 2の戦略に沿ったテストシナリオである**: UNIT_ONLY 戦略に準拠（ユニットテストのみ）
- ✅ **主要な正常系がカバーされている**: 3つの期待値修正シナリオ + Jest設定修正シナリオ + 回帰テストシナリオ
- ✅ **主要な異常系がカバーされている**: 回帰テスト（既存テストへの影響確認）
- ✅ **期待結果が明確である**: 各テストケースで具体的な期待値を記載

---

## 8. リスク評価と軽減策

### リスク1: 期待値修正の不正確性

**軽減策**:
- テストケース1: モックデータの型定義を FileStatusResult 型に準拠させる（設計書 7.1 修正1 参照）
- テストケース2-3: Phase番号を実装コード（commit-message-builder.ts line 138）に合わせる
- 各修正後、必ず個別にテスト実行して確認

### リスク2: Jest設定修正の副作用

**軽減策**:
- テストケース4: transformIgnorePatterns の修正前後で、既存テストが引き続きPASSすることを確認
- テストケース5: 全テストスイート実行による回帰テスト

### リスク3: テスト実行時の環境依存問題

**軽減策**:
- セクション5: CI環境（Jenkins）での実行も確認
- AC-5: ローカル環境とCI環境でテスト結果が一致することを確認

### リスク4: スコープクリープ（追加修正の発見）

**軽減策**:
- テストケース5で回帰テストを実施
- 他の失敗が見つかった場合、別Issueとして切り出す（スコープを限定）

---

## 9. まとめ

### 9.1 テストシナリオ概要

Issue #102では、3つの期待値修正と1つのJest設定修正を行います。

**主要なテストシナリオ**:
1. **テストケース1**: file-selector.test.ts のモックデータ型定義修正
2. **テストケース2-3**: commit-message-builder.test.ts のPhase番号期待値修正
3. **テストケース4**: jest.config.cjs の transformIgnorePatterns 修正
4. **テストケース5**: 全テスト実行による回帰テスト確認
5. **CI環境検証**: Jenkins環境でのテスト成功確認

**合計**: 5つのテストシナリオ

### 9.2 成功基準

- file-selector.test.ts: 23ケース PASS
- commit-message-builder.test.ts: 9ケース PASS
- commit-manager.test.ts: 実行可能 & PASS
- 全テストスイート: 100% 成功率
- CI環境: ローカル環境と同じテスト結果

### 9.3 次のフェーズへの引き継ぎ事項

**Phase 4（Implementation）**:
- セクション2のテストシナリオに従って期待値を修正
- 各修正後、該当するテストケースを実行して確認

**Phase 5（Test Implementation）**:
- **スキップ**（新規テスト追加不要）

**Phase 6（Testing）**:
- セクション6のテスト実行計画に従って検証
- Task 6-1: ユニットテスト実行と確認
- Task 6-2: 統合テスト実行と確認

---

**作成日**: 2025-01-31
**作成者**: AI Workflow Phase 3 (Test Scenario)
**Issue番号**: #102（元Issue: #52）
**Planning Document**: @.ai-workflow/issue-102/00_planning/output/planning.md
**Requirements Document**: @.ai-workflow/issue-102/01_requirements/output/requirements.md
**Design Document**: @.ai-workflow/issue-102/02_design/output/design.md
