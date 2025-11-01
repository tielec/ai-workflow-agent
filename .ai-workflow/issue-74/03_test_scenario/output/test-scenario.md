# テストシナリオ - Issue #74

**Issue番号**: #74
**タイトル**: [FOLLOW-UP] Issue #51 - 残タスク
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**テスト戦略**: UNIT_ONLY

**判断根拠** (Phase 2 Design Documentより):
- 本Issueの対象はユニットテストファイル（`tests/unit/core/config.test.ts`）の修正のみ
- 外部システム連携やユーザーストーリーは含まれない
- 実装コードの変更がないため、新規のユニットテストは不要
- 既存のテストケースが正しく動作することを検証するのみ

### 1.2 テスト対象の範囲

**主要テスト対象**:
- テストケース2.6.5の環境依存問題の修正
- テストケース2.6.6の環境依存問題の修正
- 環境変数削除・復元処理の動作検証
- リグレッション防止（他のテストケースへの影響がないことの確認）

**スコープ外**:
- 実装コード（`src/core/config.ts`）の修正（仕様通りに動作済み）
- 新規テストケースの追加
- 統合テストやBDDシナリオ

### 1.3 テストの目的

1. **環境依存問題の解決**: テストケース2.6.5と2.6.6がローカル環境とJenkins CI環境の両方で100%成功すること
2. **テストの独立性確保**: `JENKINS_HOME`環境変数が適切に削除・復元され、他のテストケースに影響を与えないこと
3. **リグレッション防止**: 既存の56個のテストケース全体が100%成功すること
4. **品質保証**: テストカバレッジ96.4%以上を維持すること

---

## 2. Unitテストシナリオ

### 2.1 テストケース2.6.5の修正検証

#### シナリオ2.1.1: JENKINS_HOME環境変数の削除処理

**テストケース名**: `beforeEach_フック_JENKINS_HOME削除_正常系`

- **目的**: `beforeEach`フックで`JENKINS_HOME`環境変数が正しく削除されることを検証
- **前提条件**:
  - Jenkins CI環境で`JENKINS_HOME`環境変数が設定されている（例: `/var/jenkins_home`）
  - テストケース2.6.5の`beforeEach`フックが実装されている
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `beforeEach`フック実行後、`process.env.JENKINS_HOME`が`undefined`である
  - 元の値が`originalJenkinsHome`変数に保存されている
- **テストデータ**:
  - 初期状態: `process.env.JENKINS_HOME = '/var/jenkins_home'`
  - 期待状態: `process.env.JENKINS_HOME = undefined`、`originalJenkinsHome = '/var/jenkins_home'`

**検証方法**:
```typescript
// テストケース内で以下を検証
expect(process.env.JENKINS_HOME).toBeUndefined();
```

---

#### シナリオ2.1.2: CI=false時のisCI()の動作

**テストケース名**: `isCI_正常系_CIがfalse_JENKINS_HOME未設定`

- **目的**: `CI=false`かつ`JENKINS_HOME`が未設定の場合、`isCI()`が`false`を返すことを検証
- **前提条件**:
  - `beforeEach`フックで`JENKINS_HOME`が削除されている
  - テストケース2.6.5が実行される
- **入力**:
  - `process.env.CI = 'false'`
- **期待結果**:
  - `config.isCI()`が`false`を返す
- **テストデータ**:
  - 環境変数: `CI='false'`, `JENKINS_HOME=undefined`

**検証方法**:
```typescript
process.env.CI = 'false';
const result = config.isCI();
expect(result).toBe(false);
```

---

#### シナリオ2.1.3: JENKINS_HOME環境変数の復元処理（値が存在する場合）

**テストケース名**: `afterEach_フック_JENKINS_HOME復元_元の値が存在`

- **目的**: `afterEach`フックで`JENKINS_HOME`環境変数が元の値に復元されることを検証
- **前提条件**:
  - `beforeEach`フックで`originalJenkinsHome = '/var/jenkins_home'`が保存されている
  - テストケース2.6.5が完了している
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `afterEach`フック実行後、`process.env.JENKINS_HOME = '/var/jenkins_home'`に復元される
- **テストデータ**:
  - 保存された値: `originalJenkinsHome = '/var/jenkins_home'`
  - 期待状態: `process.env.JENKINS_HOME = '/var/jenkins_home'`

**検証方法**:
```typescript
// afterEach実行後、他のテストケースで以下を確認
// （リグレッションテストで検証）
```

---

#### シナリオ2.1.4: JENKINS_HOME環境変数の復元処理（元の値がundefinedの場合）

**テストケース名**: `afterEach_フック_JENKINS_HOME復元_元の値がundefined`

- **目的**: 元の`JENKINS_HOME`が`undefined`だった場合、`afterEach`フックで削除されることを検証
- **前提条件**:
  - ローカル環境で`JENKINS_HOME`が未設定（`undefined`）
  - `beforeEach`フックで`originalJenkinsHome = undefined`が保存されている
  - テストケース2.6.5が完了している
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `afterEach`フック実行後、`process.env.JENKINS_HOME`が`undefined`のまま（削除される）
- **テストデータ**:
  - 保存された値: `originalJenkinsHome = undefined`
  - 期待状態: `process.env.JENKINS_HOME = undefined`

**検証方法**:
```typescript
// afterEach実行後、以下を確認
expect(process.env.JENKINS_HOME).toBeUndefined();
```

---

### 2.2 テストケース2.6.6の修正検証

#### シナリオ2.2.1: JENKINS_HOME環境変数の削除処理

**テストケース名**: `beforeEach_フック_JENKINS_HOME削除_正常系_2`

- **目的**: テストケース2.6.6の`beforeEach`フックで`JENKINS_HOME`環境変数が正しく削除されることを検証
- **前提条件**:
  - Jenkins CI環境で`JENKINS_HOME`環境変数が設定されている（例: `/var/jenkins_home`）
  - テストケース2.6.6の`beforeEach`フックが実装されている
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `beforeEach`フック実行後、`process.env.JENKINS_HOME`が`undefined`である
  - 元の値が`originalJenkinsHome`変数に保存されている
- **テストデータ**:
  - 初期状態: `process.env.JENKINS_HOME = '/var/jenkins_home'`
  - 期待状態: `process.env.JENKINS_HOME = undefined`、`originalJenkinsHome = '/var/jenkins_home'`

**検証方法**:
```typescript
// テストケース内で以下を検証
expect(process.env.JENKINS_HOME).toBeUndefined();
```

---

#### シナリオ2.2.2: CI=0時のisCI()の動作

**テストケース名**: `isCI_正常系_CIが0_JENKINS_HOME未設定`

- **目的**: `CI=0`かつ`JENKINS_HOME`が未設定の場合、`isCI()`が`false`を返すことを検証
- **前提条件**:
  - `beforeEach`フックで`JENKINS_HOME`が削除されている
  - テストケース2.6.6が実行される
- **入力**:
  - `process.env.CI = '0'`
- **期待結果**:
  - `config.isCI()`が`false`を返す
- **テストデータ**:
  - 環境変数: `CI='0'`, `JENKINS_HOME=undefined`

**検証方法**:
```typescript
process.env.CI = '0';
const result = config.isCI();
expect(result).toBe(false);
```

---

#### シナリオ2.2.3: JENKINS_HOME環境変数の復元処理（値が存在する場合）

**テストケース名**: `afterEach_フック_JENKINS_HOME復元_元の値が存在_2`

- **目的**: テストケース2.6.6の`afterEach`フックで`JENKINS_HOME`環境変数が元の値に復元されることを検証
- **前提条件**:
  - `beforeEach`フックで`originalJenkinsHome = '/var/jenkins_home'`が保存されている
  - テストケース2.6.6が完了している
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `afterEach`フック実行後、`process.env.JENKINS_HOME = '/var/jenkins_home'`に復元される
- **テストデータ**:
  - 保存された値: `originalJenkinsHome = '/var/jenkins_home'`
  - 期待状態: `process.env.JENKINS_HOME = '/var/jenkins_home'`

**検証方法**:
```typescript
// afterEach実行後、他のテストケースで以下を確認
// （リグレッションテストで検証）
```

---

#### シナリオ2.2.4: JENKINS_HOME環境変数の復元処理（元の値がundefinedの場合）

**テストケース名**: `afterEach_フック_JENKINS_HOME復元_元の値がundefined_2`

- **目的**: 元の`JENKINS_HOME`が`undefined`だった場合、テストケース2.6.6の`afterEach`フックで削除されることを検証
- **前提条件**:
  - ローカル環境で`JENKINS_HOME`が未設定（`undefined`）
  - `beforeEach`フックで`originalJenkinsHome = undefined`が保存されている
  - テストケース2.6.6が完了している
- **入力**: なし（環境変数の状態のみ）
- **期待結果**:
  - `afterEach`フック実行後、`process.env.JENKINS_HOME`が`undefined`のまま（削除される）
- **テストデータ**:
  - 保存された値: `originalJenkinsHome = undefined`
  - 期待状態: `process.env.JENKINS_HOME = undefined`

**検証方法**:
```typescript
// afterEach実行後、以下を確認
expect(process.env.JENKINS_HOME).toBeUndefined();
```

---

### 2.3 リグレッションテスト

#### シナリオ2.3.1: テストスイート全体の成功率検証

**テストケース名**: `config_test_ts_全テストケース_成功率100%`

- **目的**: `tests/unit/core/config.test.ts`の全56個のテストケースが成功することを検証
- **前提条件**:
  - テストケース2.6.5と2.6.6の修正が完了している
  - 他のテストケース（2.1〜2.5、2.7など）は変更されていない
- **入力**: なし（テストスイート全体を実行）
- **期待結果**:
  - 56個中56個のテストケースが成功（100%成功率）
  - テスト実行時間が従来の±10%以内
- **テストデータ**: 既存のテストデータ（変更なし）

**検証方法**:
```bash
npm test -- tests/unit/core/config.test.ts
# 期待出力: Tests: 56 passed, 56 total
```

---

#### シナリオ2.3.2: 他のテストケースへの影響がないことの確認

**テストケース名**: `config_test_ts_他のテストケース_影響なし`

- **目的**: テストケース2.6.5と2.6.6の修正が他のテストケースに影響を与えないことを検証
- **前提条件**:
  - テストケース2.6.5と2.6.6の修正が完了している
  - テストスイート全体が実行される
- **入力**: なし
- **期待結果**:
  - テストケース2.1〜2.5、2.7以降のすべてのテストケースが成功
  - 環境変数の状態が各テストケース実行前後で適切に管理されている
- **テストデータ**: 既存のテストデータ（変更なし）

**検証方法**:
```bash
npm test -- tests/unit/core/config.test.ts
# 個別にテストケースを確認し、すべて成功することを検証
```

---

#### シナリオ2.3.3: テストカバレッジの維持確認

**テストケース名**: `config_test_ts_テストカバレッジ_96.4%以上`

- **目的**: テストカバレッジが96.4%以上を維持していることを検証
- **前提条件**:
  - テストケース2.6.5と2.6.6の修正が完了している
  - テストスイート全体が実行される
- **入力**: なし
- **期待結果**:
  - テストカバレッジが96.4%以上
  - 実装コードの変更がないため、カバレッジは維持される
- **テストデータ**: 既存のテストデータ（変更なし）

**検証方法**:
```bash
npm test -- --coverage tests/unit/core/config.test.ts
# カバレッジレポートで96.4%以上を確認
```

---

### 2.4 環境別テスト

#### シナリオ2.4.1: ローカル環境でのテスト実行

**テストケース名**: `ローカル環境_テストケース2.6.5_2.6.6_成功`

- **目的**: ローカル環境（`JENKINS_HOME`未設定）でテストケース2.6.5と2.6.6が成功することを検証
- **前提条件**:
  - ローカル環境で`JENKINS_HOME`環境変数が未設定
  - テストケース2.6.5と2.6.6の修正が完了している
- **入力**: なし
- **期待結果**:
  - テストケース2.6.5が成功（`isCI() = false`）
  - テストケース2.6.6が成功（`isCI() = false`）
- **テストデータ**:
  - 環境変数: `JENKINS_HOME=undefined`

**検証方法**:
```bash
# ローカル環境で実行
npm test -- tests/unit/core/config.test.ts
# テストケース2.6.5と2.6.6が成功することを確認
```

---

#### シナリオ2.4.2: Jenkins CI環境でのテスト実行

**テストケース名**: `Jenkins_CI環境_テストケース2.6.5_2.6.6_成功`

- **目的**: Jenkins CI環境（`JENKINS_HOME`設定済み）でテストケース2.6.5と2.6.6が成功することを検証
- **前提条件**:
  - Jenkins CI環境で`JENKINS_HOME`環境変数が設定されている（例: `/var/jenkins_home`）
  - テストケース2.6.5と2.6.6の修正が完了している
- **入力**: なし
- **期待結果**:
  - テストケース2.6.5が成功（`beforeEach`で`JENKINS_HOME`が削除され、`isCI() = false`）
  - テストケース2.6.6が成功（`beforeEach`で`JENKINS_HOME`が削除され、`isCI() = false`）
  - `afterEach`で`JENKINS_HOME`が復元される
- **テストデータ**:
  - 環境変数: `JENKINS_HOME='/var/jenkins_home'`

**検証方法**:
```bash
# Jenkins CI環境で実行
npm test -- tests/unit/core/config.test.ts
# テストケース2.6.5と2.6.6が成功することを確認
```

---

#### シナリオ2.4.3: JENKINS_HOME環境変数の有無による動作確認

**テストケース名**: `環境変数_JENKINS_HOME_有無_動作確認`

- **目的**: `JENKINS_HOME`環境変数の有無に関わらず、テストケース2.6.5と2.6.6が成功することを検証
- **前提条件**:
  - テストケース2.6.5と2.6.6の修正が完了している
- **入力**:
  - パターン1: `JENKINS_HOME=undefined`（ローカル環境）
  - パターン2: `JENKINS_HOME='/var/jenkins_home'`（Jenkins CI環境）
- **期待結果**:
  - 両パターンでテストケース2.6.5と2.6.6が成功
  - `beforeEach`で環境変数が適切に削除される
  - `afterEach`で環境変数が適切に復元される
- **テストデータ**: 上記の2パターン

**検証方法**:
```bash
# パターン1: ローカル環境
unset JENKINS_HOME
npm test -- tests/unit/core/config.test.ts

# パターン2: Jenkins CI環境（または手動でJENKINS_HOMEを設定）
export JENKINS_HOME=/var/jenkins_home
npm test -- tests/unit/core/config.test.ts
```

---

### 2.5 パフォーマンステスト

#### シナリオ2.5.1: テスト実行時間の確認

**テストケース名**: `テスト実行時間_従来と同程度_10%以内`

- **目的**: テストスイート全体の実行時間が従来の±10%以内であることを検証
- **前提条件**:
  - テストケース2.6.5と2.6.6の修正が完了している
  - 修正前のテスト実行時間が記録されている
- **入力**: なし
- **期待結果**:
  - テスト実行時間が修正前の±10%以内
  - `beforeEach`/`afterEach`フックの処理が軽量（1ms未満）
- **テストデータ**: なし

**検証方法**:
```bash
# 修正前の実行時間を記録
npm test -- tests/unit/core/config.test.ts
# 例: Time: 2.5s

# 修正後の実行時間を測定
npm test -- tests/unit/core/config.test.ts
# 期待: Time: 2.25s〜2.75s（±10%以内）
```

---

## 3. テストデータ

### 3.1 環境変数テストデータ

#### データセット1: JENKINS_HOME設定済み（Jenkins CI環境）

```typescript
// テスト実行前の状態
process.env.JENKINS_HOME = '/var/jenkins_home'
```

**用途**: シナリオ2.1.1, 2.1.3, 2.2.1, 2.2.3, 2.4.2

---

#### データセット2: JENKINS_HOME未設定（ローカル環境）

```typescript
// テスト実行前の状態
process.env.JENKINS_HOME = undefined
```

**用途**: シナリオ2.1.4, 2.2.4, 2.4.1

---

#### データセット3: CI環境変数パターン

```typescript
// パターン1: CI=false
process.env.CI = 'false'

// パターン2: CI=0
process.env.CI = '0'
```

**用途**: シナリオ2.1.2, 2.2.2

---

### 3.2 期待結果データ

#### 期待結果1: isCI() = false

```typescript
const result = config.isCI();
expect(result).toBe(false);
```

**条件**:
- `CI='false'`または`CI='0'`
- かつ`JENKINS_HOME=undefined`

**用途**: シナリオ2.1.2, 2.2.2

---

#### 期待結果2: 環境変数の削除

```typescript
expect(process.env.JENKINS_HOME).toBeUndefined();
```

**条件**: `beforeEach`フック実行後

**用途**: シナリオ2.1.1, 2.2.1

---

#### 期待結果3: 環境変数の復元（値が存在する場合）

```typescript
expect(process.env.JENKINS_HOME).toBe('/var/jenkins_home');
```

**条件**: `afterEach`フック実行後、元の値が存在した場合

**用途**: シナリオ2.1.3, 2.2.3

---

#### 期待結果4: 環境変数の復元（元の値がundefined）

```typescript
expect(process.env.JENKINS_HOME).toBeUndefined();
```

**条件**: `afterEach`フック実行後、元の値が`undefined`だった場合

**用途**: シナリオ2.1.4, 2.2.4

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

#### 環境1: ローカル開発環境

**要件**:
- Node.js 20以上
- npm 10以上
- Jest with ES modules
- `JENKINS_HOME`環境変数が未設定

**用途**: シナリオ2.4.1, 2.4.3（パターン1）

---

#### 環境2: Jenkins CI環境

**要件**:
- Node.js 20以上
- npm 10以上
- Jest with ES modules
- `JENKINS_HOME`環境変数が設定済み（例: `/var/jenkins_home`）

**用途**: シナリオ2.4.2, 2.4.3（パターン2）

---

### 4.2 必要な外部サービス・データベース

**不要**: テストコードの修正のみであり、外部サービスやデータベースとの連携は不要

---

### 4.3 モック/スタブの必要性

**不要**:
- `Config`クラスの実装は変更されず、仕様通りに動作
- 環境変数の削除・復元処理のみをテスト
- 実際の`process.env`を使用してテストを実行

---

### 4.4 テスト実行コマンド

#### ローカル環境でのテスト実行

```bash
# テストスイート全体を実行
npm test -- tests/unit/core/config.test.ts

# カバレッジ付きで実行
npm test -- --coverage tests/unit/core/config.test.ts

# 特定のテストケースのみ実行（デバッグ用）
npm test -- tests/unit/core/config.test.ts -t "isCI_正常系_CIがfalseの場合"
```

---

#### Jenkins CI環境でのテスト実行

```bash
# Jenkinsfileで実行されるコマンド
npm test
```

---

## 5. テストシナリオサマリー

### 5.1 テストケース数

| カテゴリ | テストケース数 | 主要な検証内容 |
|---------|--------------|--------------|
| テストケース2.6.5の修正検証 | 4 | 環境変数削除・isCI()動作・環境変数復元 |
| テストケース2.6.6の修正検証 | 4 | 環境変数削除・isCI()動作・環境変数復元 |
| リグレッションテスト | 3 | 全テストケース成功・他への影響なし・カバレッジ維持 |
| 環境別テスト | 3 | ローカル環境・Jenkins CI環境・環境変数有無 |
| パフォーマンステスト | 1 | テスト実行時間 ±10%以内 |
| **合計** | **15** | - |

---

### 5.2 受け入れ基準との対応

| 受け入れ基準 | 対応するテストシナリオ | 検証内容 |
|------------|---------------------|---------|
| AC-1: テストケース2.6.5の修正完了 | シナリオ2.1.1, 2.1.2, 2.1.3, 2.1.4, 2.4.1, 2.4.2 | 環境変数削除・isCI()動作・環境変数復元 |
| AC-2: テストケース2.6.6の修正完了 | シナリオ2.2.1, 2.2.2, 2.2.3, 2.2.4, 2.4.1, 2.4.2 | 環境変数削除・isCI()動作・環境変数復元 |
| AC-3: 環境変数の適切な削除・復元 | シナリオ2.1.1, 2.1.3, 2.1.4, 2.2.1, 2.2.3, 2.2.4 | beforeEach/afterEachフックの動作 |
| AC-4: テストスイート全体の成功率100% | シナリオ2.3.1 | 56個中56個のテストが成功 |
| AC-8: リグレッションなし | シナリオ2.3.2, 2.3.3 | 他のテストケースへの影響なし |

---

### 5.3 主要な正常系のカバー状況

✅ **カバー済み**:
- テストケース2.6.5のCI=false時のisCI()動作（シナリオ2.1.2）
- テストケース2.6.6のCI=0時のisCI()動作（シナリオ2.2.2）
- JENKINS_HOME環境変数の削除処理（シナリオ2.1.1, 2.2.1）
- JENKINS_HOME環境変数の復元処理（シナリオ2.1.3, 2.1.4, 2.2.3, 2.2.4）
- ローカル環境でのテスト実行（シナリオ2.4.1）
- Jenkins CI環境でのテスト実行（シナリオ2.4.2）
- テストスイート全体の成功率100%（シナリオ2.3.1）

---

### 5.4 主要な異常系のカバー状況

**注記**: 本Issueはテストコードの環境依存問題の修正であり、実装コードの変更がないため、異常系テストケースの追加は不要です。既存のテストケース（56個）で異常系は網羅済みです。

✅ **既存でカバー済み**:
- 環境変数が未設定の場合のエラーハンドリング（既存のテストケースでカバー済み）
- 不正な環境変数値の処理（既存のテストケースでカバー済み）

---

## 6. 品質ゲート（Phase 3）の確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **テスト戦略**: UNIT_ONLY
- **対応**: ユニットテストシナリオのみを作成（統合テスト・BDDシナリオは不要）
- **確認**: セクション2「Unitテストシナリオ」で15個のテストケースを定義

---

### ✅ 主要な正常系がカバーされている

**カバー済み正常系**:
1. テストケース2.6.5のCI=false時の動作（シナリオ2.1.2）
2. テストケース2.6.6のCI=0時の動作（シナリオ2.2.2）
3. JENKINS_HOME環境変数の削除処理（シナリオ2.1.1, 2.2.1）
4. JENKINS_HOME環境変数の復元処理（シナリオ2.1.3, 2.1.4, 2.2.3, 2.2.4）
5. ローカル環境でのテスト実行（シナリオ2.4.1）
6. Jenkins CI環境でのテスト実行（シナリオ2.4.2）
7. テストスイート全体の成功率100%（シナリオ2.3.1）

---

### ✅ 主要な異常系がカバーされている

**注記**: 本Issueはテストコードの環境依存問題の修正であり、実装コードの変更がないため、新規の異常系テストケースは不要です。既存のテストケース（56個）で異常系は網羅済みです。

**リグレッションテストでカバー**:
- シナリオ2.3.2: 他のテストケースへの影響がないことの確認
- シナリオ2.3.3: テストカバレッジの維持確認（96.4%以上）

---

### ✅ 期待結果が明確である

**各シナリオの期待結果**:
- すべてのテストシナリオで「期待結果」セクションを記載
- 具体的な検証方法（`expect()`文）を記載
- テストデータと期待値を明確に定義（セクション3「テストデータ」）

**例**:
- シナリオ2.1.2: `expect(result).toBe(false);`
- シナリオ2.3.1: `Tests: 56 passed, 56 total`
- シナリオ2.5.1: `Time: 2.25s〜2.75s（±10%以内）`

---

## 7. まとめ

本テストシナリオは、Issue #74の詳細なテストシナリオを記述したものです。

**重要ポイント**:

1. **テスト戦略**: UNIT_ONLY（ユニットテストのみ）
2. **テストケース数**: 15個（正常系・リグレッション・環境別・パフォーマンス）
3. **主要な検証内容**:
   - テストケース2.6.5、2.6.6の環境依存問題の解決
   - JENKINS_HOME環境変数の削除・復元処理
   - リグレッション防止（他のテストケースへの影響なし）
   - テストスイート全体の成功率100%
4. **受け入れ基準との対応**: AC-1〜AC-4、AC-8をカバー
5. **品質ゲート**: 4つの必須要件をすべて満たす

**次のフェーズ（Implementation）への引き継ぎ事項**:
- テストケース2.6.5、2.6.6の修正実装
- beforeEach/afterEachフックの実装
- リグレッションテストの実行
- ローカル環境とJenkins CI環境でのテスト実行確認

本テストシナリオに基づき、次のImplementation Phaseで実装を進め、Test Execution Phaseでテストを実行することができます。

---

**作成者**: AI Workflow Phase 3 (Test Scenario)
**作成日時**: 2025-01-30
**バージョン**: 1.0
