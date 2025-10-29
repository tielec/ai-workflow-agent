# 詳細設計書: エラーハンドリングユーティリティへのリファクタリング

**Issue**: #48
**タイトル**: リファクタリング: 過剰な 'as Error' キャストを適切なエラーハンドリングユーティリティに置き換え
**作成日**: 2025-01-21
**バージョン**: 1.0

---

## 0. Planning Document の確認

Planning Phase（Phase 0）で策定された計画書を確認しました：

**実装戦略**: CREATE + EXTEND（20% CREATE / 80% EXTEND）
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: CREATE_TEST + EXTEND_TEST（70% CREATE_TEST / 30% EXTEND_TEST）
**見積もり工数**: 12~16時間
**リスク評価**: 低~中

本設計書は、この計画を踏まえて詳細設計を行います。

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Workflow Agent                            │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐      │
│  │  Commands    │   │   Phases     │   │    Core      │      │
│  │  (execute,   │   │ (planning,   │   │ (git, github,│      │
│  │   init, etc) │   │ requirements,│   │  metadata)   │      │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘      │
│         │                  │                  │               │
│         └──────────┬───────┴──────────────────┘               │
│                    │                                           │
│                    │ catchブロックで使用                       │
│                    ↓                                           │
│         ┌─────────────────────────┐                           │
│         │ NEW: error-utils.ts     │ ← 新規作成                │
│         │ ・getErrorMessage()     │                           │
│         │ ・getErrorStack()       │                           │
│         │ ・isError()             │                           │
│         └─────────────────────────┘                           │
│                                                                 │
│  既存の67箇所の `as Error` を置き換え                          │
│  - src/commands/* (7箇所)                                      │
│  - src/core/* (31箇所)                                         │
│  - src/phases/* (29箇所)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント間の関係

```
                  ┌────────────────────┐
                  │ error-utils.ts     │
                  │ (新規モジュール)   │
                  └──────────┬─────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼───────┐        ┌───────▼───────┐
        │ Commands       │        │ Core          │
        │ - execute.ts   │        │ - git/*.ts    │
        │ - init.ts      │        │ - github/*.ts │
        └───────┬────────┘        └───────┬───────┘
                │                         │
                └────────────┬────────────┘
                             │
                      ┌──────▼──────┐
                      │ Phases      │
                      │ - base-*.ts │
                      │ - *.ts      │
                      └─────────────┘
```

### 1.3 データフロー

```
1. エラー発生（Error | string | number | null | undefined | object）
   ↓
2. catchブロックで捕捉（error: unknown）
   ↓
3. getErrorMessage(error) 呼び出し
   ↓
4. 型判定とフォールバック処理
   ├─ Error → error.message
   ├─ string → そのまま返す
   ├─ number → String(error)
   └─ その他 → String(error)
   ↓
5. 安全なエラーメッセージ文字列を取得
   ↓
6. logger.error() または console.error() に渡す
```

---

## 2. 実装戦略判断

### 実装戦略: CREATE + EXTEND

**判断根拠**:

1. **CREATE（20%）**: 新規ユーティリティモジュール `src/utils/error-utils.ts` を作成
   - 3つの関数（`getErrorMessage`, `getErrorStack`, `isError`）を新規実装
   - 約60行の新規コード
   - 既存コードとの依存関係なし（純粋なユーティリティ関数）

2. **EXTEND（80%）**: 既存22ファイル、67箇所のcatchブロックを修正
   - `(error as Error).message` → `getErrorMessage(error)` に置き換え
   - importステートメントの追加
   - 既存のロジックや構造は変更しない（機能的同等性を保証）

**CREATE vs EXTEND の比率**:
- 新規コード: 約60行（ユーティリティ）+ 約22行（import文）= 約82行
- 修正コード: 67箇所 × 約5行/箇所（平均）= 約335行
- 比率: 82 / (82 + 335) ≈ 20% CREATE / 80% EXTEND

**選択理由**:
- 既存コードの動作を変更しない（リスク低減）
- 単一ポイントでのエラーハンドリングロジック管理（保守性向上）
- 新規ユーティリティは独立してテスト可能（テスタビリティ）

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

1. **UNIT_ONLY**: エラーユーティリティ関数の動作を検証
   - 入力パターン網羅: Error、string、number、null、undefined、オブジェクト、Symbol
   - エッジケース: 循環参照オブジェクト、カスタムtoString()
   - 型ガードの動作確認（TypeScript型システムとの連携）
   - カバレッジ目標: 100%（行、分岐、関数）

2. **INTEGRATION_ONLY**: 既存コードとの統合を検証
   - 既存の統合テスト（52ファイル）が引き続き成功することを確認
   - エラーハンドリングパスが正しく動作するか
   - 実際のエージェント実行、Git操作、GitHub API呼び出しでのエラー処理

**選択理由**:
- ユーティリティ関数自体は純粋関数であり、ユニットテストで完全に検証可能
- 既存コードへの統合は、既存の統合テストスイート（52ファイル）で安全性を確認
- BDDは不要（エンドユーザー向けの振る舞い変更ではなく、内部リファクタリング）

**BDD_ONLYを選択しない理由**:
- ユーザーストーリーがない（内部開発ツールのリファクタリング）
- Given-When-Then形式よりも、入力パターン網羅テストが適切

---

## 4. テストコード戦略判断

### テストコード戦略: CREATE_TEST + EXTEND_TEST

**判断根拠**:

1. **CREATE_TEST（70%）**: 新規ユニットテストファイルを作成
   - `tests/unit/utils/error-utils.test.ts` を新規作成
   - 全入力パターンをカバー（8~10ケース以上）
   - エッジケーステストを含む
   - 約150~200行の新規テストコード

2. **EXTEND_TEST（30%）**: 既存テストファイルを更新
   - 必要に応じて、非Error型をスローするケースを追加
   - 例: `tests/unit/commands/init.test.ts` に文字列エラーケースを追加
   - 例: `tests/unit/git/commit-manager.test.ts` にnullエラーケースを追加
   - 約50~70行のテストコード追加

**CREATE_TEST vs EXTEND_TEST の比率**:
- 新規テストコード: 約150~200行
- 既存テスト拡張: 約50~70行
- 比率: 約70% CREATE_TEST / 30% EXTEND_TEST

**選択理由**:
- 新規ユーティリティは独立したテストファイルが必要（単一責任原則）
- 既存テストは、エラーハンドリングのエッジケースを追加するのみ（最小限の変更）
- 既存の統合テスト（52ファイル）は修正不要（機能的同等性を保証）

**EXTEND_TEST_ONLYを選択しない理由**:
- 新規ユーティリティに対応する既存テストファイルが存在しない
- `tests/unit/utils/` ディレクトリに新規テストファイルを作成するのが適切

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響

**直接的な変更が必要なファイル（22ファイル、67箇所）**:

| カテゴリ | ファイル | 箇所数 | 変更内容 |
|---------|---------|--------|----------|
| Commands | `src/commands/execute.ts` | 3 | `as Error` → `getErrorMessage()` |
| Commands | `src/commands/init.ts` | 4 | `as Error` → `getErrorMessage()` |
| Core | `src/core/content-parser.ts` | 4 | `as Error` → `getErrorMessage()` |
| Core/Git | `src/core/git/branch-manager.ts` | 3 | `as Error` → `getErrorMessage()` |
| Core/Git | `src/core/git/commit-manager.ts` | 10 | `as Error` → `getErrorMessage()` |
| Core/Git | `src/core/git/remote-manager.ts` | 8 | `as Error` → `getErrorMessage()` |
| Core | `src/core/github-client.ts` | 1 | `as Error` → `getErrorMessage()` |
| Core/GitHub | `src/core/github/comment-client.ts` | 2 | `as Error` → `getErrorMessage()` |
| Core/GitHub | `src/core/github/issue-client.ts` | 2 | `as Error` → `getErrorMessage()` |
| Core/GitHub | `src/core/github/pull-request-client.ts` | 推定2 | `as Error` → `getErrorMessage()` |
| Core | `src/core/phase-dependencies.ts` | 推定1 | `as Error` → `getErrorMessage()` |
| Core | `src/core/secret-masker.ts` | 推定1 | `as Error` → `getErrorMessage()` |
| Phases | `src/phases/base-phase.ts` | 4 | `as Error` → `getErrorMessage()` |
| Phases/Core | `src/phases/core/agent-executor.ts` | 1 | `as Error` → `getErrorMessage()` |
| Phases | `src/phases/evaluation.ts` | 6 | `as Error` → `getErrorMessage()` |
| Phases | `src/phases/report.ts` | 推定2 | `as Error` → `getErrorMessage()` |
| その他 | 6ファイル | 推定13 | `as Error` → `getErrorMessage()` |

**変更パターン**:

```typescript
// Before
try {
  // some operation
} catch (error) {
  logger.error(`Failed: ${(error as Error).message}`);
}

// After
import { getErrorMessage } from '@/utils/error-utils.js';

try {
  // some operation
} catch (error) {
  logger.error(`Failed: ${getErrorMessage(error)}`);
}
```

**間接的な影響**:

- **logger.ts**: 変更不要（文字列を受け取る設計のため）
- **テストファイル**: 既存52ファイルが引き続き成功する必要がある
- **型定義**: 新規型 `ErrorLike` の導入（オプション、将来的な拡張用）

### 5.2 依存関係の変更

**新規依存**: なし（標準ライブラリのみ使用）

**既存依存の変更**: なし

**インポートの追加**:
- 22ファイルで `import { getErrorMessage, getErrorStack, isError } from '@/utils/error-utils.js';` を追加
- TypeScript の path alias `@/` を使用（`tsconfig.json` の設定に準拠）

### 5.3 マイグレーション要否

**不要**

理由:
- データベーススキーマ変更なし
- 設定ファイル変更なし
- 環境変数の追加なし
- APIの破壊的変更なし
- ビルドプロセスの変更なし

---

## 6. 変更・追加ファイルリスト

### 6.1 新規作成ファイル

| 相対パス | 説明 | 行数（推定） |
|---------|------|-------------|
| `src/utils/error-utils.ts` | エラーハンドリングユーティリティ | 約60行 |
| `tests/unit/utils/error-utils.test.ts` | ユニットテスト | 約150~200行 |

### 6.2 修正が必要な既存ファイル

**ソースコード（22ファイル）**:

1. `src/commands/execute.ts` - 3箇所
2. `src/commands/init.ts` - 4箇所
3. `src/core/content-parser.ts` - 4箇所
4. `src/core/git/branch-manager.ts` - 3箇所
5. `src/core/git/commit-manager.ts` - 10箇所
6. `src/core/git/remote-manager.ts` - 8箇所
7. `src/core/github-client.ts` - 1箇所
8. `src/core/github/comment-client.ts` - 2箇所
9. `src/core/github/issue-client.ts` - 2箇所
10. `src/core/github/pull-request-client.ts` - 推定2箇所
11. `src/core/phase-dependencies.ts` - 推定1箇所
12. `src/core/secret-masker.ts` - 推定1箇所
13. `src/phases/base-phase.ts` - 4箇所
14. `src/phases/core/agent-executor.ts` - 1箇所
15. `src/phases/evaluation.ts` - 6箇所
16. `src/phases/report.ts` - 推定2箇所
17. その他6ファイル（未特定）- 推定13箇所

**テストコード（必要に応じて）**:

- `tests/unit/commands/init.test.ts` - 文字列エラーケース追加
- `tests/unit/git/commit-manager.test.ts` - nullエラーケース追加
- その他、必要に応じて既存テストのエラーモックを更新

**ドキュメント**:

- `CLAUDE.md` - エラーハンドリング規約セクションの追加

### 6.3 削除が必要なファイル

**なし**

---

## 7. 詳細設計

### 7.1 モジュール設計: `src/utils/error-utils.ts`

#### 7.1.1 概要

エラーハンドリングユーティリティモジュール。`unknown` 型のエラーから安全にメッセージやスタックトレースを抽出する関数を提供します。

#### 7.1.2 型定義

```typescript
/**
 * エラーライク型（将来的な拡張用）
 * カスタムエラーオブジェクトの判定に使用可能
 */
export interface ErrorLike {
  message: string;
  stack?: string;
}
```

#### 7.1.3 関数設計

##### 7.1.3.1 `getErrorMessage(error: unknown): string`

**目的**: `unknown` 型のエラーから安全にエラーメッセージを抽出する。

**シグネチャ**:
```typescript
export function getErrorMessage(error: unknown): string
```

**ロジック**:
```typescript
export function getErrorMessage(error: unknown): string {
  // 1. Error オブジェクトの判定
  if (error instanceof Error) {
    return error.message;
  }

  // 2. 文字列の判定
  if (typeof error === 'string') {
    return error;
  }

  // 3. null / undefined のフォールバック
  if (error === null) {
    return 'null';
  }

  if (error === undefined) {
    return 'undefined';
  }

  // 4. その他（number、object、Symbol等）
  // String(error) で安全に文字列化
  try {
    return String(error);
  } catch (conversionError) {
    // 文字列化に失敗した場合のフォールバック
    // （循環参照オブジェクト等）
    return '[Unparseable error]';
  }
}
```

**入力パターンと期待出力**:

| 入力型 | 入力値例 | 期待出力 |
|-------|---------|---------|
| Error | `new Error('test')` | `'test'` |
| TypeError | `new TypeError('type error')` | `'type error'` |
| string | `'error message'` | `'error message'` |
| number | `404` | `'404'` |
| null | `null` | `'null'` |
| undefined | `undefined` | `'undefined'` |
| object | `{ code: 500 }` | `'[object Object]'` |
| Symbol | `Symbol('err')` | `'Symbol(err)'` |

**エッジケース**:
- 循環参照オブジェクト: `String(error)` が例外をスローする場合、`'[Unparseable error]'` を返す
- カスタム `toString()`: オブジェクトが `toString()` をオーバーライドしている場合、その結果を返す

**戻り値**: 必ず文字列を返す（never throw）

---

##### 7.1.3.2 `getErrorStack(error: unknown): string | undefined`

**目的**: `unknown` 型のエラーから安全にスタックトレースを抽出する。

**シグネチャ**:
```typescript
export function getErrorStack(error: unknown): string | undefined
```

**ロジック**:
```typescript
export function getErrorStack(error: unknown): string | undefined {
  // Error オブジェクトかつ stack プロパティが存在する場合のみ返す
  if (error instanceof Error && typeof error.stack === 'string') {
    return error.stack;
  }

  // それ以外は undefined
  return undefined;
}
```

**入力パターンと期待出力**:

| 入力型 | 入力値例 | 期待出力 |
|-------|---------|---------|
| Error (with stack) | `new Error('test')` | `'Error: test\n    at ...'` |
| Error (no stack) | `const e = new Error('test'); delete e.stack; return e;` | `undefined` |
| string | `'error message'` | `undefined` |
| number | `404` | `undefined` |
| null | `null` | `undefined` |

**戻り値**: `string | undefined`（never throw）

---

##### 7.1.3.3 `isError(error: unknown): error is Error`

**目的**: `unknown` 型の値が Error オブジェクトかどうかを判定する型ガード関数。

**シグネチャ**:
```typescript
export function isError(error: unknown): error is Error
```

**ロジック**:
```typescript
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}
```

**型ナローイング**:
```typescript
try {
  // some operation
} catch (error) {
  if (isError(error)) {
    // ここで error は Error 型にナローイングされる
    console.error(error.message);  // OK
    console.error(error.stack);    // OK
  } else {
    // error は unknown のまま
    console.error(getErrorMessage(error));
  }
}
```

**入力パターンと期待出力**:

| 入力型 | 入力値例 | 期待出力 |
|-------|---------|---------|
| Error | `new Error('test')` | `true` |
| TypeError | `new TypeError('type error')` | `true` |
| SyntaxError | `new SyntaxError('syntax error')` | `true` |
| string | `'error message'` | `false` |
| number | `404` | `false` |
| null | `null` | `false` |
| object | `{ message: 'fake error' }` | `false` |

**戻り値**: `boolean`（never throw）

---

### 7.2 TSDocコメント設計

#### 7.2.1 `getErrorMessage()`

```typescript
/**
 * unknown型のエラーから安全にエラーメッセージを抽出します。
 *
 * このユーティリティ関数は、catch ブロックで捕捉したエラーが
 * Error オブジェクトでない場合でも安全に処理できます。
 *
 * @param error - 抽出元のエラー（unknown型）
 * @returns エラーメッセージ文字列
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "Something went wrong"
 * }
 * ```
 *
 * @example 非Errorオブジェクトの場合
 * ```typescript
 * try {
 *   throw 'String error';
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "String error"
 * }
 * ```
 *
 * @example nullの場合
 * ```typescript
 * try {
 *   throw null;
 * } catch (error) {
 *   console.error(getErrorMessage(error));  // "null"
 * }
 * ```
 *
 * @remarks
 * - Error オブジェクトの場合: `error.message` を返す
 * - 文字列の場合: そのまま返す
 * - null の場合: `"null"` を返す
 * - undefined の場合: `"undefined"` を返す
 * - その他の型: `String(error)` で文字列化して返す
 * - この関数は決して例外をスローしません
 */
export function getErrorMessage(error: unknown): string
```

#### 7.2.2 `getErrorStack()`

```typescript
/**
 * unknown型のエラーから安全にスタックトレースを抽出します。
 *
 * Error オブジェクトの場合のみスタックトレースを返します。
 * 非Error オブジェクトの場合は undefined を返します。
 *
 * @param error - 抽出元のエラー（unknown型）
 * @returns スタックトレース文字列（Error の場合）または undefined
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   const stack = getErrorStack(error);
 *   if (stack) {
 *     console.error('Stack trace:', stack);
 *   }
 * }
 * ```
 *
 * @example 非Errorオブジェクトの場合
 * ```typescript
 * try {
 *   throw 'String error';
 * } catch (error) {
 *   const stack = getErrorStack(error);
 *   console.log(stack);  // undefined
 * }
 * ```
 *
 * @remarks
 * - Error オブジェクトかつ stack プロパティが存在する場合: `error.stack` を返す
 * - それ以外の場合: `undefined` を返す
 * - この関数は決して例外をスローしません
 */
export function getErrorStack(error: unknown): string | undefined
```

#### 7.2.3 `isError()`

```typescript
/**
 * unknown型の値が Error オブジェクトかどうかを判定する型ガード関数です。
 *
 * TypeScript の型システムと連携し、型ナローイングをサポートします。
 *
 * @param error - 判定対象の値（unknown型）
 * @returns Error オブジェクトの場合 true、それ以外は false
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   if (isError(error)) {
 *     // ここで error は Error 型にナローイングされる
 *     console.error(error.message);  // OK
 *     console.error(error.stack);    // OK
 *   } else {
 *     console.error('Non-error thrown:', error);
 *   }
 * }
 * ```
 *
 * @example Error のサブクラス
 * ```typescript
 * try {
 *   throw new TypeError('Type error');
 * } catch (error) {
 *   if (isError(error)) {
 *     console.log('This is an Error object');  // true
 *   }
 * }
 * ```
 *
 * @remarks
 * - `instanceof Error` を使用して判定
 * - Error のサブクラス（TypeError、SyntaxError 等）も true を返す
 * - この関数は決して例外をスローしません
 */
export function isError(error: unknown): error is Error
```

---

### 7.3 使用例

#### 7.3.1 基本的な使用例

```typescript
import { getErrorMessage, getErrorStack, isError } from '@/utils/error-utils.js';
import { logger } from '@/utils/logger.js';

// 例1: logger.error() と組み合わせる
try {
  await someAsyncOperation();
} catch (error) {
  logger.error(`Failed to execute operation: ${getErrorMessage(error)}`);

  const stack = getErrorStack(error);
  if (stack) {
    logger.debug(`Stack trace: ${stack}`);
  }
}

// 例2: 型ガードと組み合わせる
try {
  await anotherOperation();
} catch (error) {
  if (isError(error)) {
    // Error オブジェクトの場合、より詳細な処理
    logger.error(`Error: ${error.message}`, { name: error.name, stack: error.stack });
  } else {
    // 非Error オブジェクトの場合
    logger.error(`Non-error thrown: ${getErrorMessage(error)}`);
  }
}
```

#### 7.3.2 既存コードの置き換え例

**Before**:
```typescript
// src/commands/init.ts:95
try {
  await gitManager.createBranch(branchName);
} catch (error) {
  logger.error(`Failed to create branch: ${(error as Error).message}`);
  throw error;
}
```

**After**:
```typescript
import { getErrorMessage } from '@/utils/error-utils.js';

try {
  await gitManager.createBranch(branchName);
} catch (error) {
  logger.error(`Failed to create branch: ${getErrorMessage(error)}`);
  throw error;
}
```

---

**Before**:
```typescript
// src/core/git/commit-manager.ts:105
try {
  await this.git.commit(commitMessage);
} catch (error) {
  console.error(`[ERROR] Git commit failed: ${(error as Error).message}`);
  throw error;
}
```

**After**:
```typescript
import { getErrorMessage } from '@/utils/error-utils.js';

try {
  await this.git.commit(commitMessage);
} catch (error) {
  console.error(`[ERROR] Git commit failed: ${getErrorMessage(error)}`);
  throw error;
}
```

---

**Before**:
```typescript
// src/phases/base-phase.ts:150
try {
  await this.executeAgentCall();
} catch (error) {
  logger.error(`Agent execution failed: ${(error as Error).message}`);
  logger.debug(`Stack trace: ${(error as Error).stack}`);
  throw error;
}
```

**After**:
```typescript
import { getErrorMessage, getErrorStack } from '@/utils/error-utils.js';

try {
  await this.executeAgentCall();
} catch (error) {
  logger.error(`Agent execution failed: ${getErrorMessage(error)}`);

  const stack = getErrorStack(error);
  if (stack) {
    logger.debug(`Stack trace: ${stack}`);
  }

  throw error;
}
```

---

### 7.4 ディレクトリ構造（変更後）

```
src/
├── commands/
│   ├── execute.ts        # 修正（3箇所）
│   └── init.ts           # 修正（4箇所）
├── core/
│   ├── git/
│   │   ├── branch-manager.ts   # 修正（3箇所）
│   │   ├── commit-manager.ts   # 修正（10箇所）
│   │   └── remote-manager.ts   # 修正（8箇所）
│   ├── github/
│   │   ├── comment-client.ts   # 修正（2箇所）
│   │   ├── issue-client.ts     # 修正（2箇所）
│   │   └── pull-request-client.ts  # 修正（推定2箇所）
│   ├── content-parser.ts       # 修正（4箇所）
│   ├── github-client.ts        # 修正（1箇所）
│   ├── phase-dependencies.ts   # 修正（推定1箇所）
│   └── secret-masker.ts        # 修正（推定1箇所）
├── phases/
│   ├── core/
│   │   └── agent-executor.ts   # 修正（1箇所）
│   ├── base-phase.ts           # 修正（4箇所）
│   ├── evaluation.ts           # 修正（6箇所）
│   └── report.ts               # 修正（推定2箇所）
└── utils/
    ├── logger.ts               # 変更なし
    └── error-utils.ts          # ★新規作成★

tests/
└── unit/
    ├── commands/
    │   └── init.test.ts        # 拡張（文字列エラーケース追加）
    ├── git/
    │   └── commit-manager.test.ts  # 拡張（nullエラーケース追加）
    └── utils/
        └── error-utils.test.ts     # ★新規作成★

CLAUDE.md                       # 修正（エラーハンドリング規約追加）
```

---

## 8. セキュリティ考慮事項

### 8.1 情報漏洩リスク

**リスク**: エラーメッセージに機密情報（APIキー、トークン、パスワード等）が含まれる可能性がある。

**対策**:
1. **既存の SecretMasker との統合**: エラーユーティリティ自体は機密情報のマスキングを行わない。呼び出し元で `SecretMasker` を使用する責任を維持する。
2. **ドキュメント化**: CLAUDE.md にエラーハンドリング規約を追記し、機密情報を含むエラーメッセージの取り扱いについて明記する。

**将来的な拡張**:
- `getErrorMessage()` 内部で `SecretMasker` を統合することも可能（別Issueとして検討）

### 8.2 例外の安全性

**保証**: `getErrorMessage()`, `getErrorStack()`, `isError()` はすべて決して例外をスローしない（never throw）。

**実装方針**:
- `try-catch` ブロックでフォールバック処理を実装
- すべての入力パターンに対して安全な戻り値を保証

### 8.3 型安全性

**保証**: TypeScript の型システムに準拠し、型ナローイングをサポートする。

**実装方針**:
- `isError()` 型ガード関数により、`error is Error` の型述語を提供
- すべての関数に明示的な戻り値型を定義

---

## 9. 非機能要件への対応

### 9.1 パフォーマンス

**要件**: エラーユーティリティ関数の実行時オーバーヘッドは無視できる程度であること。

**測定基準**:
- `getErrorMessage()` の実行時間: 1ms 未満
- `getErrorStack()` の実行時間: 1ms 未満
- `isError()` の実行時間: 0.1ms 未満

**根拠**:
- エラーユーティリティ関数は catch ブロック内でのみ使用され、ホットパス（頻繁に実行される処理）ではない
- 単純な型チェックと文字列変換のみを行うため、パフォーマンスへの影響は極めて限定的

**検証方法**:
- 必要に応じてベンチマークテスト実施（`as Error` vs `getErrorMessage()`）

### 9.2 可用性・信頼性

**要件**: エラーユーティリティ関数はすべての入力に対して安全に動作し、決して例外をスローしないこと。

**測定基準**:
- `getErrorMessage()` は never throw（すべての入力に対して文字列を返す）
- `getErrorStack()` は never throw（すべての入力に対して `string | undefined` を返す）
- `isError()` は never throw（すべての入力に対して `boolean` を返す）

**検証方法**:
- ユニットテストでエッジケース（null、undefined、循環参照オブジェクト）をカバー

### 9.3 保守性・拡張性

**要件**: エラーハンドリングロジックの変更が単一ポイント（`error-utils.ts`）で可能であること。

**測定基準**:
- エラーメッセージのフォーマット変更（例: 接頭辞の追加）が `error-utils.ts` の修正のみで実現可能
- 将来的なエラーレポーティングサービスへの送信が、`error-utils.ts` に関数を追加するだけで実現可能

**拡張例**:
```typescript
// 将来的な拡張（別Issueとして検討）
export function reportError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  // 外部サービス（Sentry、Datadog等）への送信
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);
  // ... 送信処理
}
```

**ドキュメント化**:
- TSDoc コメントが充実しており、新規開発者が使用方法を理解できる

---

## 10. 実装の順序

### 10.1 推奨実装順序

以下の順序で実装することを推奨します：

**Phase 1: 要件定義（完了済み）**
- ✅ 67箇所の `as Error` 使用箇所のリストアップ
- ✅ エラーハンドリングパターンの分類
- ✅ ユーティリティ関数の仕様策定

**Phase 2: 設計（本フェーズ）**
- ✅ エラーユーティリティモジュールの詳細設計
- ✅ リファクタリング方針の策定
- ✅ 型安全性とエラーハンドリングのベストプラクティス定義

**Phase 3: テストシナリオ（次フェーズ）**
- ユニットテストシナリオの策定（8~10ケース以上）
- 統合テストシナリオの策定（既存52ファイル）
- エッジケーステストの策定

**Phase 4: 実装（クリティカルパス）**
- **Task 4-1**: エラーユーティリティモジュールの実装（1~1.5h）
  - `src/utils/error-utils.ts` の作成
  - `getErrorMessage()`, `getErrorStack()`, `isError()` の実装
  - TSDocコメント追加
- **Task 4-2**: 高優先度ファイルのリファクタリング（前半11ファイル、1~1.5h）
  - Commands、Core、Core/Git、Core/GitHub
- **Task 4-3**: 中優先度ファイルのリファクタリング（後半11ファイル、1h）
  - Phases、その他

**Phase 5: テストコード実装**
- **Task 5-1**: ユニットテストの実装（1.5~2h）
  - `tests/unit/utils/error-utils.test.ts` の作成
  - 全入力パターンテスト（8~10ケース）
  - エッジケーステスト
- **Task 5-2**: 統合テストの更新（0.5~1h）
  - 既存テストファイルでエラーモックを更新（必要に応じて）

**Phase 6: テスト実行**
- **Task 6-1**: ユニットテスト実行（0.5h）
  - カバレッジレポートの確認（100%を目指す）
- **Task 6-2**: 統合テスト実行（0.5~1h）
  - 既存52テストファイルの成功確認
  - リグレッションの検出と修正
- **Task 6-3**: 全テスト実行とカバレッジ確認（0.5h）

**Phase 7: ドキュメント**
- **Task 7-1**: CLAUDE.mdへのエラーハンドリングガイドライン追記（0.5~1h）
- **Task 7-2**: error-utils.tsのドキュメント充実化（0.5h）

**Phase 8: レポート**
- **Task 8-1**: リファクタリング結果のサマリー作成（0.5h）
- **Task 8-2**: PR本文の作成（0.5h）

### 10.2 依存関係の考慮

**ブロッカー**:
- Task 4-1（ユーティリティ実装）は Task 4-2/4-3（リファクタリング）の前提条件
- Task 5-1（ユニットテスト）は Task 4-1 完了後に着手可能

**並行可能**:
- Task 7-1（CLAUDE.md更新）は Task 4-1 完了後に並行実施可能

**クリティカルパス**:
1. Task 4-1: エラーユーティリティモジュールの実装
2. Task 4-2/4-3: リファクタリング
3. Task 5-1: ユニットテスト実装
4. Task 6-1/6-2: テスト実行
5. Task 8-2: PR作成

### 10.3 リスク軽減策

**リスク1: 広範囲の変更によるヒューマンエラー**
- 軽減策: 変更箇所のチェックリスト作成（67箇所を管理）
- 軽減策: `grep -r "as Error" src/` で残存箇所を確認

**リスク2: 非Errorオブジェクトがthrowされるエッジケースの見落とし**
- 軽減策: ユニットテストで全入力型をカバー（Error、string、number、null、undefined、object）
- 軽減策: 既存コードで実際に文字列やnullがthrowされているケースを調査

**リスク3: 既存テストの失敗（リグレッション）**
- 軽減策: Phase 6で全テストを実行し、失敗ケースを早期検出
- 軽減策: 失敗したテストのエラーメッセージを分析

---

## 11. 品質ゲート確認

本設計書は、Phase 2 の品質ゲートを満たしていることを確認します：

- [x] **実装戦略（CREATE + EXTEND）の判断根拠が明記されている** ✅
  → セクション2で判断根拠を3つ明記（CREATE 20% / EXTEND 80%）

- [x] **テスト戦略（UNIT_INTEGRATION）の判断根拠が明記されている** ✅
  → セクション3で判断根拠を2つ明記（ユニットテストで関数検証、統合テストで既存コード検証）

- [x] **テストコード戦略（CREATE_TEST + EXTEND_TEST）の判断根拠が明記されている** ✅
  → セクション4で判断根拠を2つ明記（CREATE_TEST 70% / EXTEND_TEST 30%）

- [x] **既存コードへの影響範囲が分析されている** ✅
  → セクション5で22ファイル、67箇所の影響範囲を詳細に分析

- [x] **変更が必要なファイルがリストアップされている** ✅
  → セクション6で新規作成ファイル（2ファイル）、修正ファイル（22ファイル）を明記

- [x] **設計が実装可能である** ✅
  → セクション7で関数シグネチャ、ロジック、TSDocコメント、使用例を具体的に記載

---

## 12. 付録

### 12.1 参考資料

- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: モジュール構成とデータフロー
- **Planning Document**: `.ai-workflow/issue-48/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-48/01_requirements/output/requirements.md`

### 12.2 技術参考

- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - 型ガード関数の実装方法
- [MDN: Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) - Error オブジェクトの仕様
- [TypeScript Deep Dive: Type Guards](https://basarat.gitbook.io/typescript/type-system/typeguard) - 型ガードのベストプラクティス

### 12.3 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|-------|
| 1.0 | 2025-01-21 | 初版作成 | AI Workflow Agent |

---

**承認者**: _____________
**承認日**: _____________
