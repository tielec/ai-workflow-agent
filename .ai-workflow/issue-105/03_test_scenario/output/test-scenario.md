# テストシナリオ - Issue #105

**Issue番号**: #105
**タイトル**: [FOLLOW-UP] Issue #102 - 残タスク
**作成日**: 2025-01-31
**ステータス**: Test Scenario Phase

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**

Phase 2（設計）で決定されたテスト戦略に基づき、以下のテストを実施します：

- **ユニットテスト**: Jest設定の個別検証、transformIgnorePatterns の動作確認
- **インテグレーションテスト**: commit-manager.test.ts の統合テスト実行、全テストスイート実行による回帰テスト

### テスト対象の範囲

1. **Jest設定の拡張（FR-1）**
   - transformIgnorePatterns に #ansi-styles を追加
   - chalk 内部依存の ESM → CommonJS 変換の検証

2. **commit-manager.test.ts の統合テスト実行可能化（FR-2）**
   - chalk インポートのESMエラー解消
   - モック設定の修正

3. **高優先度テストの修正（FR-3）**
   - エラーパターン1: モック関数へのアクセスエラー修正（約30-40個）
   - エラーパターン2: MetadataManager rollback機能のモック追加（約10-15個）
   - エラーパターン3: TypeScript 型エラー修正（約5-10個）

4. **回帰テスト**
   - Issue #102 で修正したテストが引き続き PASS すること
   - 既存の成功テストケース（766ケース）が引き続き PASS すること

### テストの目的

- Jest の ESM パッケージ対応を完了し、統合テストが実行可能になることを検証
- 失敗テスト数を 146個 → 50個以下に削減し、テストインフラが安定化することを検証
- 本体コードへの影響がないことを検証（src/ 配下の変更が0行）

---

## 2. ユニットテストシナリオ

### 2.1 Jest設定の検証

#### テストケース 2.1.1: transformIgnorePatterns に #ansi-styles が含まれている

**目的**: Jest設定ファイルに #ansi-styles が正しく追加されていることを検証

**前提条件**:
- `jest.config.cjs` ファイルが存在する
- Issue #105 の修正が適用されている

**入力**:
- `jest.config.cjs` ファイルの読み込み

**期待結果**:
- `transformIgnorePatterns` に以下のパターンが含まれている：
  ```javascript
  '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)'
  ```
- 正規表現の構文エラーがない

**検証方法**:
```bash
npx jest --showConfig | grep transformIgnorePatterns
```

**テストデータ**:
- jest.config.cjs の実際の設定内容

---

#### テストケース 2.1.2: Jest が chalk を変換対象として認識する

**目的**: Jest が chalk パッケージを transformIgnorePatterns に基づいて変換対象として認識することを検証

**前提条件**:
- jest.config.cjs に chalk が transformIgnorePatterns に含まれている
- chalk v5.3.0（ESM only）がインストールされている

**入力**:
- `npm test` の実行

**期待結果**:
- chalk 関連の ESM エラーが発生しない
- `SyntaxError: Cannot use import statement outside a module` エラーが発生しない
- ts-jest が chalk を CommonJS 形式に変換する

**検証方法**:
```bash
npm test 2>&1 | grep -i "chalk" | grep -i "error"
# 結果が空（エラーなし）であることを確認
```

**テストデータ**:
- chalk を使用するテストファイル（commit-manager.test.ts 等）

---

#### テストケース 2.1.3: Jest が #ansi-styles を変換対象として認識する

**目的**: Jest が #ansi-styles を transformIgnorePatterns に基づいて変換対象として認識することを検証

**前提条件**:
- jest.config.cjs に #ansi-styles が transformIgnorePatterns に含まれている
- chalk の内部依存として #ansi-styles が存在する

**入力**:
- `npm test` の実行

**期待結果**:
- `#ansi-styles` 関連の ESM エラーが発生しない
- `SyntaxError: Cannot use import statement outside a module` エラーが発生しない（#ansi-styles に対して）
- ts-jest が #ansi-styles を CommonJS 形式に変換する

**検証方法**:
```bash
npm test 2>&1 | grep -i "ansi-styles" | grep -i "error"
# 結果が空（エラーなし）であることを確認
```

**テストデータ**:
- chalk を間接的に使用するテストファイル（logger.ts 経由）

---

### 2.2 commit-manager.test.ts の単体検証

#### テストケース 2.2.1: commit-manager.test.ts が実行可能になる

**目的**: commit-manager.test.ts の統合テストが chalk ESM エラーなしで実行可能になることを検証

**前提条件**:
- jest.config.cjs に #ansi-styles が transformIgnorePatterns に含まれている
- commit-manager.test.ts ファイルが存在する

**入力**:
```bash
npx jest tests/unit/git/commit-manager.test.ts
```

**期待結果**:
- テストが実行完了する（SKIP なし）
- chalk 関連のエラーが表示されない
- `SyntaxError: Cannot use import statement outside a module` エラーが発生しない

**検証方法**:
```bash
npx jest tests/unit/git/commit-manager.test.ts --verbose
```

**テストデータ**:
- commit-manager.test.ts の既存テストケース

---

#### テストケース 2.2.2: CommitMessageBuilder のモックが正しく動作する

**目的**: CommitManager クラスのリファクタリング（Issue #52）後の新しい API に対するモック設定が正しく動作することを検証

**前提条件**:
- commit-manager.test.ts のモック設定が修正されている
- CommitMessageBuilder クラスが存在する

**入力**:
- CommitMessageBuilder のメソッド呼び出し（buildStepCommitMessage 等）

**期待結果**:
- `TypeError: commitManager.buildStepCommitMessage is not a function` エラーが発生しない
- CommitMessageBuilder のメソッドが正しく呼び出される
- モック関数が期待される値を返す

**検証方法**:
```bash
npx jest tests/unit/git/commit-manager.test.ts --testNamePattern="buildStepCommitMessage"
```

**テストデータ**:
- issueNumber: 1
- phaseNumber: 0
- phaseName: 'planning'
- step: 'execute'

---

### 2.3 高優先度テストの単体検証

#### テストケース 2.3.1: エラーパターン1（モック関数アクセスエラー）が解消される

**目的**: CommitManager のメソッド移動に対応したモック修正により、モック関数アクセスエラーが解消されることを検証

**前提条件**:
- commit-manager.test.ts のモック設定が最新の API に更新されている
- FileSelector、CommitMessageBuilder クラスが存在する

**入力**:
- 以前エラーが発生していたテストケースの実行

**期待結果**:
- 以下のエラーが発生しない：
  - `TypeError: commitManager.buildStepCommitMessage is not a function`
  - `TypeError: commitManager.createInitCommitMessage is not a function`
  - `TypeError: commitManager.getChangedFiles is not a function`
  - `TypeError: commitManager.filterPhaseFiles is not a function`
- 修正したテストケースがすべて PASS する

**検証方法**:
```bash
npx jest tests/unit/git/commit-manager.test.ts --verbose
```

**テストデータ**:
- エラーパターン1 の代表的なテストケース（約30-40個のうち上位5個）

---

#### テストケース 2.3.2: エラーパターン2（MetadataManager rollback モック不足）が解消される

**目的**: MetadataManager の rollback 関連メソッドのモック追加により、モック不足エラーが解消されることを検証

**前提条件**:
- review-cycle-manager.test.ts のモック設定が更新されている
- MetadataManager の rollback 関連メソッドがモックに含まれている

**入力**:
- 以前エラーが発生していたテストケースの実行

**期待結果**:
- 以下のエラーが発生しない：
  - `TypeError: this.metadata.getRollbackContext is not a function`
  - `TypeError: this.metadata.clearRollbackContext is not a function`
- 修正したテストケースがすべて PASS する

**検証方法**:
```bash
npx jest tests/unit/phases/core/review-cycle-manager.test.ts --verbose
```

**テストデータ**:
- MetadataManager の rollback 関連メソッド：
  - `getRollbackContext()`
  - `clearRollbackContext()`
  - `setRollbackContext()`
  - `addRollbackHistory()`
  - `updatePhaseForRollback()`
  - `resetSubsequentPhases()`

---

#### テストケース 2.3.3: エラーパターン3（TypeScript 型エラー）が解消される

**目的**: Jest 型定義の更新、関数シグネチャの修正により、TypeScript 型エラーが解消されることを検証

**前提条件**:
- 型エラーが発生していたテストファイルが修正されている
- Jest 型定義が最新である

**入力**:
- TypeScript コンパイル（`npx tsc --noEmit`）
- テスト実行（`npm test`）

**期待結果**:
- 以下のエラーが発生しない：
  - `TS2694: Namespace 'jest' has no exported member 'SpyInstance'`
  - `TS2554: Expected 0 arguments, but got 1`
  - `TS2554: Expected 2 arguments, but got 3`
- 修正したテストケースがすべて PASS する

**検証方法**:
```bash
npx tsc --noEmit
npm test
```

**テストデータ**:
- migrate.test.ts、workflow-executor.test.ts、rollback.test.ts の型エラー箇所

---

## 3. インテグレーションテストシナリオ

### 3.1 Jest + chalk + #ansi-styles の統合テスト

#### シナリオ 3.1.1: Jest が chalk と #ansi-styles を統合的に変換する

**目的**: Jest が chalk および #ansi-styles を統合的に変換し、logger.ts を使用するテストが正常に実行されることを検証

**前提条件**:
- jest.config.cjs に chalk と #ansi-styles が transformIgnorePatterns に含まれている
- logger.ts が chalk v5.3.0 を使用している
- chalk が内部で #ansi-styles を使用している

**テスト手順**:
1. `npm test` で全テストスイートを実行
2. logger.ts を使用するテストケースの実行結果を確認
3. chalk 関連のエラーが表示されないことを確認

**期待結果**:
- logger.ts を使用するすべてのテストが実行完了する
- chalk → #ansi-styles の依存関係が正しく解決される
- ESM → CommonJS 変換が正常に機能する

**確認項目**:
- [ ] commit-manager.test.ts が実行可能になる
- [ ] logger.ts を間接的に使用するテストが実行可能になる
- [ ] chalk 関連のエラーメッセージが表示されない
- [ ] `SyntaxError: Cannot use import statement outside a module` エラーが発生しない

---

### 3.2 commit-manager.test.ts の統合テスト

#### シナリオ 3.2.1: commit-manager.test.ts のすべてのテストケースが実行可能になる

**目的**: commit-manager.test.ts の統合テストがすべて実行可能になり、PASS することを検証

**前提条件**:
- Jest設定の修正が完了している
- commit-manager.test.ts のモック設定が修正されている

**テスト手順**:
1. `npx jest tests/unit/git/commit-manager.test.ts --verbose` を実行
2. すべてのテストケースが実行完了することを確認
3. SKIP されたテストケースがないことを確認
4. すべてのテストケースが PASS することを確認

**期待結果**:
- すべてのテストケースが実行完了する（SKIP なし）
- すべてのテストケースが PASS する
- エラーメッセージが表示されない

**確認項目**:
- [ ] chalk インポートのESMエラーが解消されている
- [ ] モック関数へのアクセスエラーが解消されている
- [ ] CommitMessageBuilder、FileSelector の新しい API に対応している
- [ ] テスト実行時間が 60秒以内（パフォーマンス要件）

---

### 3.3 全テストスイート実行による統合検証

#### シナリオ 3.3.1: 全テストスイート実行で失敗テスト数が削減される

**目的**: 全テストスイートを実行し、失敗テスト数が 146個 → 50個以下に削減されることを検証

**前提条件**:
- Jest設定の修正が完了している
- 高優先度テストの修正が完了している

**テスト手順**:
1. `npm test` で全テストスイートを実行
2. テスト結果のサマリーを確認
3. 失敗テスト数を記録

**期待結果**:
- 失敗テスト数が 50個以下に削減される（目標）
- 高優先度テスト（ブロッカー）がすべて PASS する
- `npm test` の終了コードが 0 になる（CI環境での成功判定）

**確認項目**:
- [ ] Test Suites: 失敗数が削減されている
- [ ] Tests: 失敗数が 146個 → 50個以下に削減されている
- [ ] 成功テスト数が維持または増加している（766ケース以上）
- [ ] テスト実行時間が 60秒以内（パフォーマンス要件）

**測定方法**:
```bash
npm test 2>&1 | tee test-results.log
# Test Suites: X failed, Y passed, Z total
# Tests:       X failed, Y passed, Z total
```

---

### 3.4 回帰テストシナリオ

#### シナリオ 3.4.1: Issue #102 で修正したテストが引き続き PASS する

**目的**: Issue #102 で修正したテストケースが引き続き PASS することを検証（後方互換性の確認）

**前提条件**:
- Issue #102 で修正された file-selector.test.ts、commit-message-builder.test.ts が存在する
- Issue #105 の修正が適用されている

**テスト手順**:
1. `npx jest tests/unit/git/file-selector.test.ts --verbose` を実行
2. `npx jest tests/unit/git/commit-message-builder.test.ts --verbose` を実行
3. すべてのテストケースが PASS することを確認

**期待結果**:
- file-selector.test.ts のすべてのテストケースが PASS する
- commit-message-builder.test.ts のすべてのテストケースが PASS する
- 期待値が変更されていない

**確認項目**:
- [ ] file-selector.test.ts が PASS する
- [ ] commit-message-builder.test.ts が PASS する
- [ ] Issue #102 で修正した期待値が引き続き正しい
- [ ] 回帰エラーが発生していない

---

#### シナリオ 3.4.2: 既存の成功テストケースが引き続き PASS する

**目的**: Issue #105 の修正が既存の成功テストケース（766ケース）に影響を与えていないことを検証

**前提条件**:
- Issue #105 の修正が適用されている
- Issue #105 修正前に 766ケースのテストが PASS していた

**テスト手順**:
1. `npm test` で全テストスイートを実行
2. 成功テスト数を確認
3. 766ケース以上のテストが PASS することを確認

**期待結果**:
- 成功テスト数が 766ケース以上である
- 新たに失敗するテストケースがない
- 本体コード（src/）の変更が0行である

**確認項目**:
- [ ] Tests: 766 passed 以上
- [ ] 新たに失敗するテストケースがない
- [ ] `git diff src/` の結果が空である（本体コードへの影響なし）

---

### 3.5 CI/CD統合テストシナリオ

#### シナリオ 3.5.1: Jenkins Job でテストが正常に実行される

**目的**: CI環境（Jenkins）でテストが正常に実行され、ビルドが成功することを検証

**前提条件**:
- Issue #105 の修正がフィーチャーブランチにプッシュされている
- Jenkins Job が設定されている

**テスト手順**:
1. Jenkins Job を手動実行（またはPRトリガー）
2. ビルドログを確認
3. テスト実行結果を確認

**期待結果**:
- Jenkins Job のビルドが成功する（Build Status: SUCCESS）
- テストステージでエラーが発生しない
- 失敗テスト数が 50個以下である

**確認項目**:
- [ ] Build Status: SUCCESS
- [ ] Tests: 失敗数が 50個以下
- [ ] ビルド時間が 10% 以上増加していない（パフォーマンス要件）
- [ ] experimental-vm-modules の警告が表示される（既知の警告）

---

## 4. テストデータ

### 4.1 Jest設定テストデータ

**jest.config.cjs の期待される設定**:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
  ],
  // ... その他の設定
};
```

### 4.2 commit-manager.test.ts のテストデータ

**CommitMessageBuilder の期待される使用方法**:
```typescript
import { CommitMessageBuilder } from '@/core/git/commit-message-builder';

const commitMessageBuilder = new CommitMessageBuilder();
const message = commitMessageBuilder.buildStepCommitMessage(
  1,      // issueNumber
  0,      // phaseNumber
  'planning', // phaseName
  'execute'   // step
);
```

**期待される出力**:
```
Phase 0 (planning) - execute completed
```

### 4.3 MetadataManager rollback モックのテストデータ

**モックの期待される設定**:
```typescript
const mockMetadata = {
  getPhaseStatus: jest.fn(),
  updatePhaseStatus: jest.fn(),
  getRollbackContext: jest.fn().mockReturnValue(null),
  clearRollbackContext: jest.fn(),
  setRollbackContext: jest.fn(),
  addRollbackHistory: jest.fn(),
  updatePhaseForRollback: jest.fn(),
  resetSubsequentPhases: jest.fn(),
} as unknown as MetadataManager;
```

### 4.4 全テストスイート実行の期待される結果

**修正前（Issue #102 完了時点）**:
```
Test Suites: 40 failed, 35 passed, 75 total
Tests:       146 failed, 766 passed, 912 total
Time:        56.4 s
```

**修正後（Issue #105 目標）**:
```
Test Suites: X failed (X ≤ 10), Y passed (Y ≥ 65), 75 total
Tests:       X failed (X ≤ 50), Y passed (Y ≥ 862), 912 total
Time:        ≤ 60 s
```

---

## 5. テスト環境要件

### 5.1 ローカル開発環境

**必要な環境**:
- Node.js 20 以上
- npm 10 以上
- Git 2.30 以上

**必要なパッケージ**:
- chalk v5.3.0（ESM only）
- jest v29.x
- ts-jest v29.x
- simple-git v3.27.0
- @types/jest v29.x

**環境変数**:
- `NODE_OPTIONS=--experimental-vm-modules` （package.json で設定済み）

### 5.2 CI/CD環境（Jenkins）

**必要な環境**:
- Docker 24 以上
- Node.js 20 ベースのコンテナ
- Jenkins 2.400 以上

**Jenkinsfile の設定**:
- Jest実行コマンド: `npm test`
- experimental-vm-modules オプション確認（package.json で設定済み）

### 5.3 モック/スタブの必要性

**必要なモック**:
- CommitMessageBuilder クラス（必要に応じて）
- FileSelector クラス（必要に応じて）
- MetadataManager クラス（rollback関連メソッドを含む）
- Config クラス
- Octokit クラス
- simple-git モジュール

**モック不要な対象**:
- chalk パッケージ（実際の chalk を使用）
- fs/promises モジュール（実際のファイルシステムを使用、統合テストでは）

---

## 6. テスト実行手順

### 6.1 ローカル環境でのテスト実行

**ステップ1: 依存関係のインストール**
```bash
npm ci
```

**ステップ2: Jest設定の検証**
```bash
npx jest --showConfig | grep transformIgnorePatterns
```

**ステップ3: commit-manager.test.ts の単体実行**
```bash
npx jest tests/unit/git/commit-manager.test.ts --verbose
```

**ステップ4: 高優先度テストの単体実行**
```bash
npx jest tests/unit/phases/core/review-cycle-manager.test.ts --verbose
npx jest tests/unit/commands/migrate.test.ts --verbose
```

**ステップ5: 全テストスイート実行**
```bash
npm test
```

**ステップ6: テスト結果の確認**
```bash
# 失敗テスト数の確認
npm test 2>&1 | grep "Tests:"

# 本体コードへの影響確認
git diff src/
```

### 6.2 CI/CD環境でのテスト実行

**ステップ1: フィーチャーブランチへのプッシュ**
```bash
git push origin ai-workflow/issue-105
```

**ステップ2: Jenkins Job の手動実行**
- Jenkins ダッシュボードにアクセス
- Issue #105 関連の Job を選択
- "Build Now" をクリック

**ステップ3: ビルドログの確認**
- ビルド番号をクリック
- "Console Output" を確認
- テスト実行結果を確認

**ステップ4: ビルドステータスの確認**
- Build Status: SUCCESS を確認
- Tests: 失敗数が 50個以下を確認

---

## 7. 異常系テストシナリオ

### 7.1 Jest設定エラーの検出

#### シナリオ 7.1.1: transformIgnorePatterns の正規表現エラー

**目的**: transformIgnorePatterns に構文エラーがある場合、適切にエラーが検出されることを検証

**前提条件**:
- jest.config.cjs に意図的に構文エラーを含める

**テスト手順**:
1. transformIgnorePatterns に不正な正規表現を設定
2. `npx jest --showConfig` を実行
3. エラーメッセージを確認

**期待結果**:
- Jest が設定エラーを検出する
- エラーメッセージが表示される
- テストが実行されない

**修正後の確認**:
- 正規表現を修正後、エラーが解消されることを確認

---

### 7.2 モック設定エラーの検出

#### シナリオ 7.2.1: モックメソッドが存在しない場合のエラー

**目的**: モック設定に存在しないメソッドが呼び出された場合、適切にエラーが検出されることを検証

**前提条件**:
- モック設定から意図的にメソッドを削除

**テスト手順**:
1. MetadataManager のモックから `getRollbackContext` を削除
2. テストを実行
3. エラーメッセージを確認

**期待結果**:
- `TypeError: this.metadata.getRollbackContext is not a function` エラーが発生する
- テストが失敗する

**修正後の確認**:
- モックにメソッドを追加後、エラーが解消されることを確認

---

## 8. 境界値テストシナリオ

### 8.1 失敗テスト数の境界値

#### シナリオ 8.1.1: 失敗テスト数が 50個ちょうどの場合

**目的**: 失敗テスト数が目標値（50個）の境界にある場合でも受け入れ基準を満たすことを検証

**前提条件**:
- 高優先度テストの修正が完了している
- 失敗テスト数が 50個前後である

**テスト手順**:
1. `npm test` で全テストスイートを実行
2. 失敗テスト数を確認

**期待結果**:
- 失敗テスト数が 50個以下である
- 受け入れ基準（AC-2）を満たす

**確認項目**:
- [ ] Tests: X failed (X ≤ 50)
- [ ] 高優先度テスト（ブロッカー）がすべて PASS する

---

### 8.2 テスト実行時間の境界値

#### シナリオ 8.2.1: テスト実行時間が 60秒ちょうどの場合

**目的**: テスト実行時間がパフォーマンス要件（60秒以内）の境界にある場合でも受け入れ基準を満たすことを検証

**前提条件**:
- Jest設定の修正が完了している
- transformIgnorePatterns に #ansi-styles が含まれている

**テスト手順**:
1. `time npm test` でテスト実行時間を計測

**期待結果**:
- テスト実行時間が 60秒以内である
- パフォーマンス要件（NFR-1）を満たす

**確認項目**:
- [ ] Time: ≤ 60 s
- [ ] Issue #102 と同等（56.4秒）の実行時間を維持

---

## 9. 品質ゲート確認

本テストシナリオは、Phase 3（Test Scenario）の品質ゲートを満たしていることを確認します。

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **テスト戦略**: UNIT_INTEGRATION
- **ユニットテストシナリオ**: セクション2で詳細に記載（Jest設定、commit-manager.test.ts、高優先度テスト）
- **インテグレーションテストシナリオ**: セクション3で詳細に記載（Jest + chalk + #ansi-styles、全テストスイート、回帰テスト、CI/CD）

### ✅ 主要な正常系がカバーされている

- **正常系シナリオ**:
  - テストケース 2.1.1: transformIgnorePatterns に #ansi-styles が含まれている
  - テストケース 2.1.2: Jest が chalk を変換対象として認識する
  - テストケース 2.1.3: Jest が #ansi-styles を変換対象として認識する
  - シナリオ 3.1.1: Jest が chalk と #ansi-styles を統合的に変換する
  - シナリオ 3.2.1: commit-manager.test.ts のすべてのテストケースが実行可能になる
  - シナリオ 3.3.1: 全テストスイート実行で失敗テスト数が削減される
  - シナリオ 3.4.1: Issue #102 で修正したテストが引き続き PASS する
  - シナリオ 3.4.2: 既存の成功テストケースが引き続き PASS する

### ✅ 主要な異常系がカバーされている

- **異常系シナリオ**:
  - シナリオ 7.1.1: transformIgnorePatterns の正規表現エラー
  - シナリオ 7.2.1: モックメソッドが存在しない場合のエラー
  - テストケース 2.3.1: エラーパターン1（モック関数アクセスエラー）が解消される
  - テストケース 2.3.2: エラーパターン2（MetadataManager rollback モック不足）が解消される
  - テストケース 2.3.3: エラーパターン3（TypeScript 型エラー）が解消される

### ✅ 期待結果が明確である

- すべてのテストケース・シナリオに以下を記載:
  - **期待結果**: 具体的な期待される出力・状態変化
  - **検証方法**: 実行可能なコマンドまたは確認手順
  - **確認項目**: チェックリスト形式の確認ポイント
  - **テストデータ**: 使用する具体的なデータ

---

## 10. テスト実行チェックリスト

Phase 6（Testing）で使用するチェックリストを事前に定義します。

### 10.1 修正済みテストの単体実行チェックリスト

- [ ] **ユニットテスト（Jest設定）**
  - [ ] テストケース 2.1.1 が PASS する
  - [ ] テストケース 2.1.2 が PASS する
  - [ ] テストケース 2.1.3 が PASS する

- [ ] **ユニットテスト（commit-manager.test.ts）**
  - [ ] テストケース 2.2.1 が PASS する（commit-manager.test.ts が実行可能になる）
  - [ ] テストケース 2.2.2 が PASS する（CommitMessageBuilder のモックが正しく動作する）

- [ ] **ユニットテスト（高優先度テスト）**
  - [ ] テストケース 2.3.1 が PASS する（エラーパターン1 が解消される）
  - [ ] テストケース 2.3.2 が PASS する（エラーパターン2 が解消される）
  - [ ] テストケース 2.3.3 が PASS する（エラーパターン3 が解消される）

### 10.2 全テストスイート実行チェックリスト

- [ ] **インテグレーションテスト**
  - [ ] シナリオ 3.1.1 が PASS する（Jest が chalk と #ansi-styles を統合的に変換する）
  - [ ] シナリオ 3.2.1 が PASS する（commit-manager.test.ts のすべてのテストケースが実行可能になる）
  - [ ] シナリオ 3.3.1 が PASS する（全テストスイート実行で失敗テスト数が削減される）

- [ ] **回帰テスト**
  - [ ] シナリオ 3.4.1 が PASS する（Issue #102 で修正したテストが引き続き PASS する）
  - [ ] シナリオ 3.4.2 が PASS する（既存の成功テストケースが引き続き PASS する）

- [ ] **CI/CD統合テスト**
  - [ ] シナリオ 3.5.1 が PASS する（Jenkins Job でテストが正常に実行される）

### 10.3 受け入れ基準（Acceptance Criteria）の確認

- [ ] **AC-1**: commit-manager.test.ts の統合テストが実行可能になる
  - [ ] すべての統合テストケースが実行完了する（SKIP なし）
  - [ ] すべての統合テストケースが PASS する
  - [ ] chalk 内部依存のエラーが発生しない

- [ ] **AC-2**: 失敗テスト数が削減される
  - [ ] 失敗テスト数が 50個以下に削減される（目標）
  - [ ] 高優先度テスト（ブロッカー）がすべて PASS する
  - [ ] `npm test` の終了コードが 0 になる（CI環境での成功判定）

- [ ] **AC-3**: 回帰テストが成功する
  - [ ] file-selector.test.ts がすべて PASS する
  - [ ] commit-message-builder.test.ts がすべて PASS する
  - [ ] 既存の成功テストケース（766ケース）が引き続き PASS する

- [ ] **AC-4**: 本体コードへの影響がない
  - [ ] src/ 配下のコード変更が0行である
  - [ ] `git diff src/` の結果が空である
  - [ ] プロダクション環境への影響がない

- [ ] **AC-5**: CLAUDE.md が更新されている
  - [ ] 「### Jest設定（ESMパッケージ対応）」セクションが更新される
  - [ ] transformIgnorePatterns の拡張内容が明記される
  - [ ] Issue #105 への参照リンクが追加される

- [ ] **AC-6**: CHANGELOG.md が更新されている
  - [ ] `## [Unreleased]` セクションに変更履歴が追加される
  - [ ] 修正内容のサマリー（Jest設定拡張、テスト修正）が記載される
  - [ ] Issue #105 への参照リンク（`#105`）が追加される

---

**テストシナリオフェーズ完了**

このドキュメントは Issue #105 の実装を成功させるための詳細なテストシナリオです。すべての品質ゲートを満たすことで、次フェーズ（Phase 4: Implementation）への円滑な移行を保証します。

**次のアクション**: Phase 4（Implementation）へ進み、Jest設定の修正、commit-manager.test.ts の修正、高優先度テストの修正を実施してください。
