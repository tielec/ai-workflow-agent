# 要件定義書: Issue #45 - リファクタリング: コマンドハンドラの型安全性を改善（any型を削除）

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された開発計画を確認しました：

### 全体戦略
- **実装戦略**: EXTEND（既存の型定義ファイル `src/types/commands.ts` を拡張）
- **テスト戦略**: UNIT_ONLY（コンパイル時型チェック + ユニットテスト）
- **テストコード戦略**: EXTEND_TEST（既存テストファイルに型検証テストを追加）
- **見積もり工数**: 3~5時間
- **複雑度**: 簡単
- **リスク評価**: 低

### 影響範囲
Planning Documentで特定された影響ファイル：
1. `src/types/commands.ts` - 新規インターフェース追加（`ExecuteCommandOptions`, `ReviewCommandOptions`）
2. `src/commands/execute.ts` - `handleExecuteCommand(options: any)` の型修正
3. `src/commands/review.ts` - `handleReviewCommand(options: any)` の型修正
4. `src/commands/migrate.ts` - `MigrateOptions` インターフェースの移行

### 品質ゲート
Planning Documentで定義された品質ゲートを踏まえ、以下を満たす必要があります：
- Phase 2（設計）: **実装戦略（EXTEND）**、**テスト戦略（UNIT_ONLY）**、**テストコード戦略（EXTEND_TEST）** が明確に記述されている
- Phase 4（実装）: `npm run build` がエラーなく完了し、すべての `any` 型が適切な型に置き換えられている
- Phase 6（テスト実行）: `npm test` がすべて通過し、後方互換性が保証されている

---

## 1. 概要

### 背景
現在、`src/commands/execute.ts`、`src/commands/review.ts` などのコマンドハンドラで `any` 型が使用されており、TypeScript の型安全性が失われています。これにより以下の問題が発生しています：

- ランタイムエラーがコンパイル時に検出できない
- IDE のオートコンプリートが利用できず、開発効率が低下
- リファクタリング時にエラーが発生しやすい
- CLI オプションの検証が困難

### 目的
すべてのコマンドハンドラに適切な TypeScript インターフェースを定義し、コンパイル時の型安全性を確保することで、以下を実現します：

1. **コンパイル時型検証**: CLI オプションの型不一致をコンパイル時に検出
2. **IDE サポート向上**: オートコンプリート、型ヒント、リアルタイム型チェックの有効化
3. **リファクタリング容易性**: 型定義により、コード変更時の影響範囲が明確化
4. **自己文書化**: 型定義がドキュメントとして機能

### ビジネス価値・技術的価値

**技術的価値**（優先度: 高）:
- **保守性向上**: 型定義により、コードの可読性と保守性が向上
- **バグ削減**: コンパイル時型チェックにより、ランタイムエラーを事前に防止
- **開発効率**: IDE サポートにより、開発者のコーディング速度が向上
- **リファクタリング安全性**: 型システムにより、破壊的変更を自動検出

**ビジネス価値**（間接的）:
- **品質向上**: バグ削減により、プロダクトの安定性が向上
- **開発速度**: IDE サポートとリファクタリング容易性により、機能開発速度が向上
- **保守コスト削減**: 可読性向上により、新規開発者のオンボーディング時間が短縮

---

## 2. 機能要件

### FR-1: `ExecuteCommandOptions` インターフェースの定義（優先度: 高）

**説明**: `src/commands/execute.ts` の `handleExecuteCommand()` 関数で使用される CLI オプションの型定義を作成します。

**詳細仕様**:
- **場所**: `src/types/commands.ts`
- **フィールド一覧**（`src/main.ts` の Commander.js 定義から抽出）:
  - `issue: string` - Issue番号（必須）
  - `phase?: string` - フェーズ名または "all"（オプション、デフォルト: "all"）
  - `preset?: string` - プリセット名（オプション）
  - `gitUser?: string` - Git コミット作成者名（オプション）
  - `gitEmail?: string` - Git コミット作成者メール（オプション）
  - `forceReset?: boolean` - メタデータリセットフラグ（オプション、デフォルト: false）
  - `skipDependencyCheck?: boolean` - 依存関係チェックスキップフラグ（オプション、デフォルト: false）
  - `ignoreDependencies?: boolean` - 依存関係警告無視フラグ（オプション、デフォルト: false）
  - `agent?: 'auto' | 'codex' | 'claude'` - エージェントモード（オプション、デフォルト: 'auto'）
  - `cleanupOnComplete?: boolean` - 完了時クリーンアップフラグ（オプション、デフォルト: false）
  - `cleanupOnCompleteForce?: boolean` - クリーンアップ強制フラグ（オプション、デフォルト: false）
  - `requirementsDoc?: string` - 外部要件ドキュメントパス（オプション）
  - `designDoc?: string` - 外部設計ドキュメントパス（オプション）
  - `testScenarioDoc?: string` - 外部テストシナリオドキュメントパス（オプション）

**根拠**: `src/main.ts:47-83` の Commander.js 定義と `src/commands/execute.ts:50-58` の実装から抽出

### FR-2: `ReviewCommandOptions` インターフェースの定義（優先度: 高）

**説明**: `src/commands/review.ts` の `handleReviewCommand()` 関数で使用される CLI オプションの型定義を作成します。

**詳細仕様**:
- **場所**: `src/types/commands.ts`
- **フィールド一覧**（`src/main.ts` の Commander.js 定義から抽出）:
  - `phase: string` - フェーズ名（必須）
  - `issue: string` - Issue番号（必須）

**根拠**: `src/main.ts:92-103` の Commander.js 定義と `src/commands/review.ts:14` の実装から抽出

### FR-3: `MigrateOptions` インターフェースの移行（優先度: 中）

**説明**: `src/commands/migrate.ts` で既に定義されている `MigrateOptions` インターフェースを `src/types/commands.ts` に移行し、統一された型定義場所を確立します。

**詳細仕様**:
- **移行元**: `src/commands/migrate.ts:20-25`
- **移行先**: `src/types/commands.ts`
- **既存定義**:
  ```typescript
  export interface MigrateOptions {
    sanitizeTokens: boolean;
    dryRun: boolean;
    issue?: string;
    repo?: string;
  }
  ```
- **対応作業**:
  1. `MigrateOptions` を `src/types/commands.ts` にコピー
  2. `src/commands/migrate.ts` の `MigrateOptions` 定義を削除
  3. `src/commands/migrate.ts` に `import type { MigrateOptions } from '../types/commands.js';` を追加

**根拠**: Planning Document の「既存の `MigrateOptions` を `src/commands/migrate.ts` から移行（重複排除）」に従う

### FR-4: コマンドハンドラ関数シグネチャの修正（優先度: 高）

**説明**: すべてのコマンドハンドラ関数のシグネチャを、新しく定義された型インターフェースを使用するように修正します。

**詳細仕様**:

**1. `handleExecuteCommand()` の修正**:
- **場所**: `src/commands/execute.ts:50`
- **変更前**: `export async function handleExecuteCommand(options: any): Promise<void>`
- **変更後**: `export async function handleExecuteCommand(options: ExecuteCommandOptions): Promise<void>`
- **インポート追加**: `import type { ExecuteCommandOptions } from '../types/commands.js';`

**2. `handleReviewCommand()` の修正**:
- **場所**: `src/commands/review.ts:14`
- **変更前**: `export async function handleReviewCommand(options: any): Promise<void>`
- **変更後**: `export async function handleReviewCommand(options: ReviewCommandOptions): Promise<void>`
- **インポート追加**: `import type { ReviewCommandOptions } from '../types/commands.js';`

**3. `handleMigrateCommand()` の確認**:
- **場所**: `src/commands/migrate.ts:55-57`
- **現状**: 既に型定義済み（`options: MigrateOptions`）
- **対応**: インポート文を `../types/commands.js` に変更

**根拠**: `src/commands/execute.ts:50`、`src/commands/review.ts:14` で `any` 型が使用されていることを確認

### FR-5: JSDoc コメントの追加（優先度: 中）

**説明**: 新規作成されたインターフェースに JSDoc コメントを追加し、IDE のオートコンプリートで説明が表示されるようにします。

**詳細仕様**:
- 各インターフェースに説明コメントを追加
- 各フィールドに説明、デフォルト値、必須/オプションを明記
- 例:
  ```typescript
  /**
   * Execute コマンドのオプション定義
   * CLI の --issue, --phase, --preset 等のオプションを型安全に扱うためのインターフェース
   */
  export interface ExecuteCommandOptions {
    /**
     * Issue番号（必須）
     * 例: "123"
     */
    issue: string;

    /**
     * フェーズ名または "all"（オプション）
     * デフォルト: "all"
     */
    phase?: string;

    // ...
  }
  ```

**根拠**: Planning Document Task 7-1「IDE のオートコンプリートで表示される説明文を記載」に従う

---

## 3. 非機能要件

### NFR-1: コンパイル時型安全性（優先度: 高）

**説明**: すべてのコマンドハンドラで `any` 型を使用せず、TypeScript の型チェックが完全に機能すること。

**測定基準**:
- `npm run build` がエラーなく完了すること
- `npx eslint --ext .ts src` がエラーなく完了すること
- `any` 型が0件であること（`handleExecuteCommand`、`handleReviewCommand` で削除）

### NFR-2: 後方互換性（優先度: 高）

**説明**: 既存のテストコードやワークフローに破壊的変更を与えないこと。

**測定基準**:
- `npm test` がすべて通過すること
- 既存の統合テストが通過すること（後方互換性の検証）

### NFR-3: IDE サポート（優先度: 中）

**説明**: VSCode、WebStorm 等の IDE で、オートコンプリート、型ヒント、リアルタイム型チェックが機能すること。

**測定基準**:
- VSCode で `options.` を入力した際、フィールド一覧が表示されること
- 不正な型を代入した際、リアルタイムにエラーが表示されること
- JSDoc コメントがホバー時に表示されること

### NFR-4: 保守性（優先度: 中）

**説明**: 型定義が既存のコードスタイル（`PhaseContext`、`IssueInfo` 等）と整合性が取れていること。

**測定基準**:
- `src/types/commands.ts` 内の既存インターフェースと命名規則が一致していること
- エクスポート方法（`export interface` または `export type`）が統一されていること

---

## 4. 制約事項

### TC-1: 技術的制約

**1. TypeScript バージョン**:
- 現在の `tsconfig.json` で設定されている TypeScript バージョンとの互換性を維持
- ES Modules を前提とした型定義（`.js` 拡張子でのインポート）

**2. Commander.js との整合性**:
- `src/main.ts` で定義された Commander.js のオプション定義と完全に一致する必要がある
- オプション名（kebab-case → camelCase 変換）が正しくマッピングされること
  - 例: `--force-reset` → `forceReset`、`--skip-dependency-check` → `skipDependencyCheck`

**3. 既存の型定義との整合性**:
- `src/types/commands.ts` に既に存在する型定義（`PhaseContext`、`ExecutionSummary`、`IssueInfo`、`BranchValidationResult`）とのスタイル統一

### TC-2: リソース制約

**1. 時間制約**:
- 見積もり工数: 3~5時間（Planning Document に基づく）
- タスク分割:
  - Phase 1（要件定義）: 0.5h
  - Phase 2（設計）: 0.5h
  - Phase 3（テストシナリオ）: 0.5h
  - Phase 4（実装）: 1~2h
  - Phase 5（テストコード実装）: 0.5~1h
  - Phase 6（テスト実行）: 0.5h
  - Phase 7（ドキュメント）: 0.5h
  - Phase 8（レポート）: 0.5h

**2. 影響範囲の制約**:
- 変更対象ファイル: 4ファイルのみ（`src/types/commands.ts`、`src/commands/execute.ts`、`src/commands/review.ts`、`src/commands/migrate.ts`）
- 新規ファイル作成: なし

### TC-3: ポリシー制約

**1. コーディング規約**:
- ESLint ルール（`.eslintrc.json`）に準拠
- `no-console` ルールによる `console.log` 使用禁止（統一 logger モジュール使用）
- Prettier によるフォーマット統一

**2. 環境変数アクセス規約**:
- `process.env` への直接アクセス禁止（Config クラス経由）
- 本Issue では環境変数アクセスの変更は不要

---

## 5. 前提条件

### PC-1: システム環境

- Node.js 20 以上
- npm 10 以上
- TypeScript 5.x（`package.json` で指定されたバージョン）

### PC-2: 依存コンポーネント

**1. Commander.js**:
- `src/main.ts` で定義された CLI オプションが正確に型定義に反映される必要がある
- Commander.js の型定義（`@types/commander`）との互換性

**2. 既存の型定義ファイル**:
- `src/types/commands.ts` が既に存在し、以下の型が定義されている:
  - `PhaseContext`
  - `PhaseResultMap`
  - `ExecutionSummary`
  - `IssueInfo`
  - `BranchValidationResult`

### PC-3: 外部システム連携

- なし（このリファクタリングは外部システムとの連携に影響しません）

---

## 6. 受け入れ基準

### AC-1: `ExecuteCommandOptions` インターフェースが正しく定義されている

**Given**: `src/types/commands.ts` に `ExecuteCommandOptions` インターフェースが存在する
**When**: IDE で `ExecuteCommandOptions` 型の変数を宣言し、フィールドにアクセスする
**Then**:
- 14個のフィールド（`issue`, `phase`, `preset`, `gitUser`, `gitEmail`, `forceReset`, `skipDependencyCheck`, `ignoreDependencies`, `agent`, `cleanupOnComplete`, `cleanupOnCompleteForce`, `requirementsDoc`, `designDoc`, `testScenarioDoc`）が定義されている
- `issue` は必須フィールド（`string`）である
- その他のフィールドはオプショナル（`?`）である
- `agent` は型リテラル（`'auto' | 'codex' | 'claude'`）である

### AC-2: `ReviewCommandOptions` インターフェースが正しく定義されている

**Given**: `src/types/commands.ts` に `ReviewCommandOptions` インターフェースが存在する
**When**: IDE で `ReviewCommandOptions` 型の変数を宣言し、フィールドにアクセスする
**Then**:
- 2個のフィールド（`phase`, `issue`）が定義されている
- 両方とも必須フィールド（`string`）である

### AC-3: `handleExecuteCommand()` の型シグネチャが修正されている

**Given**: `src/commands/execute.ts` の `handleExecuteCommand()` 関数
**When**: 関数定義を確認する
**Then**:
- シグネチャが `handleExecuteCommand(options: ExecuteCommandOptions): Promise<void>` である
- `any` 型が使用されていない
- `import type { ExecuteCommandOptions } from '../types/commands.js';` がインポートされている

### AC-4: `handleReviewCommand()` の型シグネチャが修正されている

**Given**: `src/commands/review.ts` の `handleReviewCommand()` 関数
**When**: 関数定義を確認する
**Then**:
- シグネチャが `handleReviewCommand(options: ReviewCommandOptions): Promise<void>` である
- `any` 型が使用されていない
- `import type { ReviewCommandOptions } from '../types/commands.js';` がインポートされている

### AC-5: `MigrateOptions` が `src/types/commands.ts` に移行されている

**Given**: `src/types/commands.ts` と `src/commands/migrate.ts`
**When**: 両ファイルを確認する
**Then**:
- `src/types/commands.ts` に `MigrateOptions` インターフェースが存在する
- `src/commands/migrate.ts` には `MigrateOptions` インターフェース定義が存在しない
- `src/commands/migrate.ts` で `import type { MigrateOptions } from '../types/commands.js';` がインポートされている

### AC-6: TypeScript コンパイルが成功する

**Given**: すべてのコード変更が完了している
**When**: `npm run build` を実行する
**Then**:
- コンパイルエラーが0件である
- `dist/` ディレクトリに JavaScript ファイルが生成される

### AC-7: ESLint チェックが成功する

**Given**: すべてのコード変更が完了している
**When**: `npx eslint --ext .ts src` を実行する
**Then**:
- ESLint エラーが0件である
- ESLint 警告がある場合、既存のものと同等またはそれ以下である

### AC-8: すべてのテストが通過する

**Given**: すべてのコード変更が完了している
**When**: `npm test` を実行する
**Then**:
- すべてのユニットテストが通過する
- すべての統合テストが通過する（後方互換性の検証）
- テストカバレッジが低下していない

### AC-9: IDE サポートが機能する

**Given**: VSCode または WebStorm で `src/commands/execute.ts` を開く
**When**: `handleExecuteCommand()` 関数内で `options.` を入力する
**Then**:
- `ExecuteCommandOptions` のフィールド一覧がオートコンプリートで表示される
- 各フィールドの JSDoc コメントがホバー時に表示される
- 不正な型を代入した際、リアルタイムにエラーが表示される

### AC-10: JSDoc コメントが適切に記述されている

**Given**: `src/types/commands.ts` の新規インターフェース
**When**: IDE でインターフェース名またはフィールド名にホバーする
**Then**:
- 各インターフェースに説明コメントが表示される
- 各フィールドに説明、デフォルト値、必須/オプションの情報が表示される

---

## 7. スコープ外

### OS-1: 他のコマンドハンドラの型定義

**対象外**: `src/commands/init.ts`、`src/commands/list-presets.ts`
**理由**: これらのファイルでは `any` 型が使用されていないため、本Issue の対象外です。

### OS-2: `PhaseContext` の型定義変更

**対象外**: `src/types/commands.ts` の既存インターフェース（`PhaseContext`、`ExecutionSummary` 等）
**理由**: 既存の型定義は問題なく機能しており、本Issue の範囲外です。

### OS-3: ランタイムロジックの変更

**対象外**: コマンドハンドラの内部実装ロジック
**理由**: 本Issue は型定義の追加のみを対象とし、ランタイム動作に影響を与えません。

### OS-4: 新規テストシナリオの追加

**対象外**: 新規のエンドツーエンドテスト、インテグレーションテスト
**理由**: 型安全性の改善は既存テストに型アサーションを追加する程度で済み、新規のテストシナリオは不要です（Planning Document の「テスト戦略: UNIT_ONLY」に従う）。

### OS-5: 将来的な拡張候補

**1. すべてのコマンドハンドラの型定義**:
- 将来的に `src/commands/init.ts` にも型定義を追加する可能性があります。
- 本Issue で確立されたパターンを適用します。

**2. コマンドオプションのバリデーション強化**:
- 現在は TypeScript の型チェックのみですが、将来的にランタイムバリデーション（Zod、Yup 等）を追加する可能性があります。

**3. 型安全な Commander.js ラッパー**:
- 将来的に Commander.js の型定義を自動的に生成する仕組みを導入する可能性があります。

---

## 8. リスクと軽減策（Planning Document から抽出）

### リスク1: 型定義の漏れ（オプションフィールドの見落とし）

- **影響度**: 中
- **確率**: 低
- **軽減策**:
  1. `src/main.ts` の Commander.js オプション定義を網羅的に確認
  2. 各コマンドハンドラ内で `options.xxx` でアクセスされているフィールドを grep で抽出
  3. TypeScript コンパイラが未定義フィールドをエラーとして検出するため、コンパイル時に発見可能

### リスク2: Optional vs Required の判定ミス

- **影響度**: 低
- **確率**: 低
- **軽減策**:
  1. Commander.js の `.requiredOption()` と `.option()` を区別して確認
  2. コマンドハンドラ内で `options.xxx ?? defaultValue` のようなフォールバック処理があるフィールドは Optional とする
  3. ユニットテストで必須フィールドの検証ロジックを追加

### リスク3: 既存テストの失敗（型変更による副作用）

- **影響度**: 低
- **確率**: 極めて低
- **軽減策**:
  1. 実装後、必ず `npm test` を実行してすべてのテストが通過することを確認
  2. TypeScript の型推論により、型不一致があればコンパイル時にエラーとなるため、ランタイムエラーは発生しにくい
  3. 既存のテストコードに型アサーションを追加する程度の変更なので、テストロジックの変更は不要

### リスク4: `MigrateOptions` の移行時の重複定義

- **影響度**: 低
- **確率**: 低
- **軽減策**:
  1. `src/commands/migrate.ts` の `MigrateOptions` を `src/types/commands.ts` に移行する際、元の定義を削除
  2. `src/commands/migrate.ts` で `import type { MigrateOptions } from '../types/commands.js'` を追加
  3. コンパイルエラーが発生した場合、import パスを修正

---

## 9. 補足情報

### 参考ドキュメント

- **CLAUDE.md**: プロジェクト全体方針（環境変数アクセス規約、ロギング規約）
- **ARCHITECTURE.md**: モジュール構成とデータフロー
- **src/main.ts**: Commander.js の CLI オプション定義
- **src/types/commands.ts**: 既存の型定義（スタイルガイドとして参照）

### 品質ゲート（Phase 1）の確認

この要件定義書は、以下の品質ゲートを満たしています：

- ✅ **機能要件が明確に記載されている**: FR-1 〜 FR-5 で詳細に記述
- ✅ **受け入れ基準が定義されている**: AC-1 〜 AC-10 で Given-When-Then 形式で記述
- ✅ **スコープが明確である**: セクション7「スコープ外」で明示
- ✅ **論理的な矛盾がない**: 機能要件と受け入れ基準が対応し、非機能要件と制約事項に矛盾がない

---

**文書バージョン**: 1.0
**作成日**: 2025-01-XX
**最終更新日**: 2025-01-XX
**承認状態**: レビュー待ち
