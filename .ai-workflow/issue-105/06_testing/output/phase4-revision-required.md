# Phase 4への差し戻し記録 - Issue #105

**差し戻し日時**: 2025-01-31
**差し戻し理由**: Phase 6（Testing）で実装が期待通りに機能していないことが判明

---

## 修正が必要な理由

Issue #105で実施した修正（`#ansi-styles`をtransformIgnorePatternsに追加）が、**実際には機能していない**ことが判明しました。

### 具体的な問題

1. **Jest設定ファイルには正しく`#ansi-styles`が追加されている**（`npx jest --showConfig`で確認済み）
2. **しかし、Jestが`#`で始まるパッケージ名を正しく処理できていない**
   - Node.jsのpackage.json importsフィールドで定義されるサブパス
   - Jestの`transformIgnorePatterns`の技術的限界
3. **その結果、commit-manager.test.tsが依然として実行不可能**
   - `SyntaxError: Cannot use import statement outside a module`
4. **受け入れ基準AC-1、AC-2が未達成**
   - AC-1: commit-manager.test.tsの統合テストが実行可能になる → 未達成
   - AC-2: 失敗テスト数が削減される（目標50個以下） → 未達成（146個のまま）

### Phase 2（設計）での判断の誤り

- Phase 2では「`#ansi-styles`をtransformIgnorePatternsに追加するだけで解決できる」と判断
- しかし、実際のテスト実行により、この判断が**誤り**であることが証明された
- Jestの`transformIgnorePatterns`は、`#`で始まるサブパスインポートを正しく処理できない

---

## 失敗したテスト

### クリティカルな失敗

1. **commit-manager.test.ts**: 実行不可能（テストスイート自体が起動しない）
   - エラー: `SyntaxError: Cannot use import statement outside a module`
   - 発生箇所: `node_modules/chalk/source/index.js:1`
   - 影響: 受け入れ基準AC-1が未達成

2. **全テストスイート**: 146個の失敗テスト（修正前と同じ）
   - 目標: 50個以下 → **未達成**
   - 影響: 受け入れ基準AC-2が未達成

3. **品質ゲート2**: FAIL
   - 「主要なテストケースが成功している」が満たされていない
   - Phase 7（ドキュメント）に進むことは不適切

---

## 必要な実装修正

Phase 4に戻り、以下のいずれかを実装する必要があります：

### オプション1: experimental-vm-modulesの完全導入（推奨）

**理由**: chalk v5.3.0（ESM only）を完全にサポートし、将来的なESM移行にも対応

**変更内容**:

#### 1. jest.config.cjsの修正

```javascript
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
  ],
  // その他の既存設定を維持（rootDir, testMatch, moduleNameMapper等）
};
```

#### 2. package.jsonのscripts修正

```json
{
  "scripts": {
    "test": "NODE_OPTIONS=--experimental-vm-modules jest --experimental-vm-modules"
  }
}
```

**見積もり工数**: 1〜2時間

**メリット**:
- chalk v5.3.0を完全にサポート
- 将来的なESM移行にも対応
- 根本的な解決策

**デメリット**:
- experimental機能のため、Node.jsバージョンによっては警告が表示される可能性
- jest.config.cjsの大幅な変更が必要

---

### オプション2: chalkのCommonJS版への切り替え（短期的な回避策）

**理由**: 最小限の変更で問題を回避し、短期的にテストを実行可能にする

**変更内容**:

#### 1. package.jsonの修正

```bash
npm install chalk@4.1.2
```

#### 2. jest.config.cjsの修正（`#ansi-styles`を削除）

```javascript
transformIgnorePatterns: [
  '/node_modules/(?!(strip-ansi|ansi-regex)/)',
],
```

**見積もり工数**: 0.5〜1時間

**メリット**:
- 最小限の変更で問題を解決
- 安定したCommonJS版を使用
- 既存のJest設定をほぼ維持

**デメリット**:
- chalk v4.xは古いバージョン（最新はv5.3.0）
- 将来的にESM移行が必要になる可能性
- 一時的な回避策であり、根本的な解決ではない

---

## 推奨される対処方針

**推奨**: **オプション1（experimental-vm-modulesの完全導入）**

**理由**:
1. 根本的な解決策であり、将来的なESM移行にも対応
2. chalk v5.3.0（ESM only）を完全にサポート
3. 見積もり工数1〜2時間は許容範囲内
4. 「80点で十分」の原則を適用できる状況ではない（品質ゲート2がFAILのため）

---

## Phase 4での実装手順

### ステップ1: jest.config.cjsの修正

1. `jest.config.cjs`を開く
2. `preset`を`'ts-jest/presets/default-esm'`に変更
3. `extensionsToTreatAsEsm: ['.ts']`を追加
4. `transform`セクションを追加（ts-jestの`useESM: true`オプション）
5. `moduleNameMapper`に`'^(\\.{1,2}/.*)\\.js$': '$1'`を追加
6. 既存の設定（`rootDir`, `testMatch`, `collectCoverageFrom`等）を維持

### ステップ2: package.jsonのscripts修正

1. `package.json`を開く
2. `"test"`スクリプトを以下に変更：
   ```json
   "test": "NODE_OPTIONS=--experimental-vm-modules jest --experimental-vm-modules"
   ```

### ステップ3: Phase 6（Testing）を再実行

1. Jest設定の検証: `npx jest --showConfig | grep -A 3 "transformIgnorePatterns"`
2. commit-manager.test.tsの単体実行: `npx jest tests/unit/git/commit-manager.test.ts --verbose`
3. 全テストスイート実行: `npm test`
4. テスト結果の記録

### ステップ4: 受け入れ基準の確認

- AC-1: commit-manager.test.tsが実行可能になることを確認
- AC-2: 失敗テスト数が削減されることを確認（目標: 50個以下）
- AC-3: 回帰テストが成功することを確認
- AC-4: 本体コードへの影響がないことを確認

---

## Phase 6での検証項目

Phase 4で実装修正後、Phase 6（Testing）で以下を検証してください：

### 検証1: commit-manager.test.tsが実行可能になる

```bash
npx jest tests/unit/git/commit-manager.test.ts --verbose
```

**期待結果**:
- テストスイートが起動する
- `SyntaxError: Cannot use import statement outside a module`エラーが発生しない
- すべてのテストケースが実行完了する（SKIPなし）

### 検証2: chalkのESMエラーが解消される

```bash
npm test 2>&1 | grep -i "chalk" | grep -i "error"
# 結果が空（エラーなし）であることを確認
```

### 検証3: 失敗テスト数が削減される

```bash
npm test
```

**期待結果**:
- Test Suites: 失敗数が削減されている
- Tests: 失敗数が 146個 → 50個以下に削減されている
- 成功テスト数が維持または増加している（766ケース以上）

### 検証4: 回帰テストが成功する

```bash
npx jest tests/unit/git/file-selector.test.ts --verbose
npx jest tests/unit/git/commit-message-builder.test.ts --verbose
```

**期待結果**:
- Issue #102で修正したテストが引き続きPASSする
- 新たに失敗するテストケースがない

---

## 参考情報

- **詳細なテスト結果**: `.ai-workflow/issue-105/06_testing/output/test-result.md`
- **実装ログ（Phase 4）**: `.ai-workflow/issue-105/04_implementation/output/implementation.md`
- **テストシナリオ（Phase 3）**: `.ai-workflow/issue-105/03_test_scenario/output/test-scenario.md`
- **設計書（Phase 2）**: `.ai-workflow/issue-105/02_design/output/design.md`

---

**Phase 4への差し戻しは不可避です。オプション1（experimental-vm-modulesの完全導入）を推奨します。**
