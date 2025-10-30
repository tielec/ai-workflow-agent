# 要件定義書: エラーハンドリングユーティリティへのリファクタリング

**Issue**: #48
**タイトル**: リファクタリング: 過剰な 'as Error' キャストを適切なエラーハンドリングユーティリティに置き換え
**作成日**: 2025-01-21
**バージョン**: 1.0

---

## 0. Planning Document の確認

### 開発計画の全体像

Planning Phase（Phase 0）で策定された計画書を確認し、以下の戦略を踏まえて要件定義を実施します：

**実装戦略**: CREATE + EXTEND（20% CREATE / 80% EXTEND）
- **CREATE**: 新規ユーティリティモジュール `src/utils/error-utils.ts` を作成
- **EXTEND**: 既存22ファイルのcatchブロックでユーティリティを使用（67箇所の置き換え）

**テスト戦略**: UNIT_INTEGRATION
- **UNIT_ONLY**: エラーユーティリティ関数の動作を検証（Error、string、number、null、undefined、カスタムオブジェクト等）
- **INTEGRATION_ONLY**: 既存の統合テスト（52ファイル）が引き続き成功することを検証

**テストコード戦略**: CREATE_TEST + EXTEND_TEST（70% CREATE_TEST / 30% EXTEND_TEST）
- **CREATE_TEST**: `tests/unit/utils/error-utils.test.ts` を新規作成
- **EXTEND_TEST**: 既存テストファイルの一部を更新（必要に応じて）

**見積もり工数**: 12~16時間（Phase 1: 1~2時間、Phase 2: 2~3時間、Phase 3: 1~2時間、Phase 4: 3~4時間、Phase 5: 2~3時間、Phase 6: 1~2時間、Phase 7: 1~2時間、Phase 8: 1時間）

**リスク評価**: 低~中
- 低リスク要因: 既存の動作を変更しない、影響範囲が明確、ユニットテストで安全性を検証可能
- 中リスク要因: 広範囲の変更（67箇所）によるヒューマンエラー、エラーハンドリングのエッジケースの見落とし

**主要な成功基準**:
- `src/` 配下に `as Error` キャストが0箇所（`grep -r "as Error" src/` の結果が空）
- 全ユニットテストおよび統合テストが100%成功
- `error-utils.ts` のコードカバレッジが100%
- CLAUDE.mdにエラーハンドリングガイドラインが追記されている

---

## 1. 概要

### 背景

現在、AI Workflow Agent のコードベース全体に `(error as Error)` 型キャストが 67 箇所存在しており、特に catch ブロックで頻繁に使用されています。TypeScript では catch ブロックのエラー変数は `unknown` 型となるため、開発者は `(error as Error).message` のような型アサーションを用いてエラーメッセージにアクセスしています。

このパターンには以下の問題があります：
1. **型安全性の欠如**: catch したエラーが Error オブジェクトでない場合（例: 文字列、数値、null、undefined）、ランタイムクラッシュを引き起こす可能性がある
2. **コードの可読性低下**: 繰り返し出現する `as Error` キャストがノイズとなり、本質的なロジックを読みにくくする
3. **保守性の低下**: エラーハンドリングロジックの変更が必要になった場合、67箇所すべてを手動で修正する必要がある
4. **エッジケースの見落とし**: JavaScript では任意の値を throw できるため、非 Error オブジェクトがスローされるケースに対応していない

### 目的

本プロジェクトは、unsafe な型キャストを型安全なエラーハンドリングユーティリティ関数に置き換えることで、以下を達成します：

1. **型安全性の向上**: すべてのエラー型（Error、string、number、null、undefined、カスタムオブジェクト）を安全に処理
2. **コードの可読性向上**: `getErrorMessage(error)` のような明示的な関数名により、意図が明確になる
3. **保守性の向上**: エラーハンドリングロジックの変更が単一ポイント（`error-utils.ts`）で可能
4. **デバッグ性の向上**: 適切なスタックトレース取得により、エラーの原因特定が容易になる
5. **ベストプラクティスの確立**: 新規コード作成時のエラーハンドリングガイドラインを策定

### ビジネス価値

- **品質向上**: ランタイムクラッシュのリスクを低減し、ユーザー体験を向上
- **開発効率向上**: エラーハンドリングのベストプラクティスが確立され、新規コード作成時の迷いがなくなる
- **保守コスト削減**: エラーハンドリングロジックの変更が単一ポイントで可能になり、保守コストを削減

### 技術的価値

- **型システムの活用**: TypeScript の型ガード機能を活用し、コンパイル時の型チェックを強化
- **テスタビリティ**: ユーティリティ関数化により、エラーハンドリングロジックが独立してテスト可能
- **拡張性**: 将来的なエラーハンドリングロジックの拡張（例: エラーレポーティングサービスへの送信）が容易

---

## 2. 機能要件

### FR-1: エラーメッセージ抽出関数（優先度: 高）

**説明**: `unknown` 型のエラーから安全にエラーメッセージを抽出する関数を提供する。

**要件詳細**:
- 関数名: `getErrorMessage(error: unknown): string`
- Error オブジェクトの場合: `error.message` を返す
- 文字列の場合: そのまま返す
- 数値の場合: `String(error)` で文字列に変換して返す
- null の場合: `"null"` を返す
- undefined の場合: `"undefined"` を返す
- オブジェクトの場合: `String(error)` で文字列に変換して返す（`[object Object]` 等）
- すべての入力に対して必ず文字列を返す（never throw）

**検証可能性**: ユニットテストで上記すべての入力パターンをカバー

---

### FR-2: スタックトレース抽出関数（優先度: 高）

**説明**: `unknown` 型のエラーから安全にスタックトレースを抽出する関数を提供する。

**要件詳細**:
- 関数名: `getErrorStack(error: unknown): string | undefined`
- Error オブジェクトの場合: `error.stack` を返す
- 非 Error オブジェクトの場合: `undefined` を返す
- スタックトレースが存在しない Error の場合: `undefined` を返す
- すべての入力に対して安全に動作（never throw）

**検証可能性**: ユニットテストで Error、非 Error、スタックトレースなしのケースをカバー

---

### FR-3: Error 型ガード関数（優先度: 中）

**説明**: `unknown` 型の値が Error オブジェクトかどうかを判定する型ガード関数を提供する。

**要件詳細**:
- 関数名: `isError(error: unknown): error is Error`
- Error オブジェクトの場合: `true` を返す
- Error のサブクラス（例: TypeError、SyntaxError）の場合: `true` を返す
- 非 Error オブジェクトの場合: `false` を返す
- 型ナローイングに利用可能（TypeScript の型システムと連携）
- `instanceof Error` を使用して判定

**検証可能性**: ユニットテストで Error、ErrorSubclass、非 Error のケースをカバー

---

### FR-4: 既存コードのリファクタリング（優先度: 高）

**説明**: 既存22ファイル、67箇所の `as Error` キャストをエラーユーティリティ関数に置き換える。

**要件詳細**:
- 置き換えパターン1: `(error as Error).message` → `getErrorMessage(error)`
- 置き換えパターン2: `(error as Error).stack` → `getErrorStack(error)`（必要に応じて）
- 置き換えパターン3: `if (error instanceof Error)` の後に `isError(error)` を使用（必要に応じて）
- すべての置き換え箇所で import 文を追加: `import { getErrorMessage, getErrorStack, isError } from '@/utils/error-utils.js';`
- 既存の動作を変更しない（機能的同等性を保証）
- リファクタリング後、`grep -r "as Error" src/` の結果が空になる

**対象ファイル**（Planning Document より）:
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
17. その他6ファイル - 推定13箇所

**検証可能性**: 既存の統合テスト（52ファイル）がすべて成功することで検証

---

### FR-5: ユニットテストの作成（優先度: 高）

**説明**: エラーユーティリティ関数の全入力パターンをカバーするユニットテストを作成する。

**要件詳細**:
- テストファイル: `tests/unit/utils/error-utils.test.ts`
- `getErrorMessage()` のテストケース:
  - Error オブジェクト
  - 文字列
  - 数値
  - null
  - undefined
  - カスタムオブジェクト
  - Symbol（エッジケース）
  - 循環参照オブジェクト（エッジケース）
- `getErrorStack()` のテストケース:
  - Error オブジェクト（スタックトレースあり）
  - Error オブジェクト（スタックトレースなし）
  - 非 Error オブジェクト
- `isError()` のテストケース:
  - Error オブジェクト
  - Error サブクラス（TypeError、SyntaxError 等）
  - 非 Error オブジェクト
- カバレッジ目標: 100%（行カバレッジ、分岐カバレッジ、関数カバレッジ）

**検証可能性**: `npm run test:unit` で全テストが成功し、カバレッジレポートで100%を確認

---

### FR-6: 統合テストの更新（優先度: 中）

**説明**: 既存の統合テストが引き続き成功することを確認し、必要に応じてエラーモックを更新する。

**要件詳細**:
- 既存52テストファイルの実行と成功確認
- エラーハンドリングパスのカバレッジ確認
- 必要に応じて、非 Error 型をスローするケースを追加（例: 文字列エラー、null エラー）
- 例: `tests/unit/commands/init.test.ts` に文字列エラーケースを追加
- 例: `tests/unit/git/commit-manager.test.ts` に null エラーケースを追加

**検証可能性**: `npm run test:integration` で全テストが成功

---

### FR-7: ドキュメント更新（優先度: 高）

**説明**: CLAUDE.md にエラーハンドリングのベストプラクティスを追記する。

**要件詳細**:
- CLAUDE.md に「エラーハンドリング規約」セクションを追加
- `as Error` 使用禁止の明記
- `error-utils` の使用方法とベストプラクティス
- 新規コード作成時の注意事項
- TSDoc コメントの充実化（`error-utils.ts` 内）
- 使用例の追加
- エッジケースの説明

**検証可能性**: CLAUDE.md の該当セクションを目視確認

---

## 3. 非機能要件

### NFR-1: パフォーマンス要件

**要件**: エラーユーティリティ関数の実行時オーバーヘッドは無視できる程度であること。

**測定基準**:
- `getErrorMessage()` の実行時間: 1ms 未満（通常のエラーハンドリングパスでは問題にならない）
- `getErrorStack()` の実行時間: 1ms 未満
- `isError()` の実行時間: 0.1ms 未満（単純な `instanceof` チェックのため）

**根拠**: エラーユーティリティ関数は catch ブロック内でのみ使用され、ホットパス（頻繁に実行される処理）ではないため、パフォーマンスへの影響は極めて限定的です。

---

### NFR-2: セキュリティ要件

**要件**: エラーメッセージに機密情報が含まれていても、ユーティリティ関数自体が新たなセキュリティリスクを生じさせないこと。

**測定基準**:
- `getErrorMessage()` は入力をそのまま文字列化するのみで、追加の情報漏洩リスクを生じさせない
- エラーメッセージのサニタイズは呼び出し元の責任（既存の `SecretMasker` との統合は別Issue）
- ユーティリティ関数自体は機密情報を保持・永続化しない

**根拠**: 既存の `as Error` キャストと機能的に同等であり、新たなセキュリティリスクは生じません。

---

### NFR-3: 可用性・信頼性要件

**要件**: エラーユーティリティ関数はすべての入力に対して安全に動作し、決して例外をスローしないこと。

**測定基準**:
- `getErrorMessage()` は never throw（すべての入力に対して文字列を返す）
- `getErrorStack()` は never throw（すべての入力に対して `string | undefined` を返す）
- `isError()` は never throw（すべての入力に対して `boolean` を返す）
- ユニットテストでエッジケース（null、undefined、循環参照オブジェクト）をカバー

**根拠**: エラーハンドリングロジック内で新たなエラーが発生すると、デバッグが困難になります。

---

### NFR-4: 保守性・拡張性要件

**要件**: エラーハンドリングロジックの変更が単一ポイント（`error-utils.ts`）で可能であること。

**測定基準**:
- エラーメッセージのフォーマット変更（例: 接頭辞の追加）が `error-utils.ts` の修正のみで実現可能
- 将来的なエラーレポーティングサービスへの送信が、`error-utils.ts` に関数を追加するだけで実現可能
- TSDoc コメントが充実しており、新規開発者が使用方法を理解できる

**根拠**: 67箇所に散在するエラーハンドリングロジックを単一モジュールに集約することで、保守性が大幅に向上します。

---

## 4. 制約事項

### 技術的制約

**TC-1: TypeScript 型システムとの整合性**
- TypeScript の型システムに準拠し、型ナローイング（type narrowing）をサポートする
- `isError()` は型ガード関数（`error is Error`）として動作する必要がある
- すべての関数は明示的な戻り値型を持つ

**TC-2: 既存コードとの互換性**
- 既存の動作を変更しない（機能的同等性を保証）
- 既存の統合テスト（52ファイル）がすべて成功する
- ESLint エラーがゼロ（`npx eslint src/`）
- TypeScript コンパイルエラーがゼロ（`npm run build`）

**TC-3: モジュールシステム**
- ES Modules 形式でエクスポート
- `@/utils/error-utils.js` としてインポート可能（`.js` 拡張子必須、TypeScript の設定に準拠）
- ビルド後に `dist/utils/error-utils.js` として配置

**TC-4: Node.js バージョン**
- Node.js 20 以上をサポート（現在のプロジェクト要件）
- 標準ライブラリのみ使用（新規依存関係の追加なし）

---

### リソース制約

**RC-1: 工数制約**
- 見積もり工数: 12~16時間（Planning Document より）
- Phase 4（実装）: 3~4時間
- Phase 5（テストコード実装）: 2~3時間
- Phase 6（テスト実行）: 1~2時間

**RC-2: 人員制約**
- 単一の開発者による実装（AI Workflow Agent による自動化）
- レビュー: クリティカルシンキングレビュー（自動レビューサイクル）

---

### ポリシー制約

**PC-1: コーディング規約**
- CLAUDE.md に記載されたコーディング規約に準拠
- ESLint ルール（`no-console`、`@typescript-eslint/no-explicit-any` 等）に準拠
- 統一ログモジュール（`src/utils/logger.ts`）を使用（`console.log` の直接使用は禁止）

**PC-2: エラーハンドリング規約（新規）**
- `as Error` 型アサーションの使用禁止（CLAUDE.md に追記）
- `error-utils` ユーティリティの使用を義務化
- 新規コード作成時は `getErrorMessage()`、`getErrorStack()`、`isError()` を使用

**PC-3: テスト規約**
- ユニットテストのカバレッジ目標: 100%（新規コード）
- 統合テストの成功率: 100%（既存テスト）
- テストファイルでも統一ログモジュールを使用（`console.log` 禁止）

---

## 5. 前提条件

### システム環境

**ENV-1: 開発環境**
- Node.js 20 以上
- npm 10 以上
- TypeScript 5.x
- Jest（テストフレームワーク、ES modules サポート）

**ENV-2: CI 環境**
- Jenkins（Docker コンテナ内で実行）
- GitHub Actions（オプション）
- 環境変数 `CI` が設定されている

---

### 依存コンポーネント

**DEP-1: 統一ログモジュール**
- `src/utils/logger.ts` が存在し、`logger.debug()`、`logger.info()`、`logger.warn()`、`logger.error()` が利用可能
- エラーユーティリティ関数自体はロギングを行わないが、呼び出し元でログモジュールと組み合わせて使用

**DEP-2: 既存テストスイート**
- `tests/unit/` ディレクトリに既存のユニットテスト
- `tests/integration/` ディレクトリに既存の統合テスト（52ファイル）
- `npm run test:unit`、`npm run test:integration`、`npm run test:coverage` が実行可能

**DEP-3: ビルドシステム**
- `npm run build` で TypeScript ソースがビルドされ、`dist/` ディレクトリに配置される
- `scripts/copy-static-assets.mjs` によりプロンプト・テンプレートがコピーされる

---

### 外部システム連携

**EXT-1: GitHub**
- GitHub Personal Access Token（`GITHUB_TOKEN` 環境変数）
- Issue、PR、コメント投稿機能（既存の `GitHubClient` 経由）

**EXT-2: Git**
- Git コミット＆プッシュ機能（既存の `GitManager` 経由）
- ブランチ: `ai-workflow/issue-48`（デフォルト）または `--branch` オプションで指定

---

## 6. 受け入れ基準

### AC-1: エラーメッセージ抽出関数

**Given**: `getErrorMessage()` 関数が実装されている
**When**: Error オブジェクトを入力として渡す
**Then**: `error.message` が文字列として返される

**Given**: `getErrorMessage()` 関数が実装されている
**When**: 文字列を入力として渡す
**Then**: その文字列がそのまま返される

**Given**: `getErrorMessage()` 関数が実装されている
**When**: null を入力として渡す
**Then**: `"null"` が返される

**Given**: `getErrorMessage()` 関数が実装されている
**When**: undefined を入力として渡す
**Then**: `"undefined"` が返される

**Given**: `getErrorMessage()` 関数が実装されている
**When**: 数値を入力として渡す
**Then**: 数値の文字列表現が返される（例: `42` → `"42"`）

**Given**: `getErrorMessage()` 関数が実装されている
**When**: カスタムオブジェクトを入力として渡す
**Then**: `String(error)` の結果が返される（例: `"[object Object]"`）

---

### AC-2: スタックトレース抽出関数

**Given**: `getErrorStack()` 関数が実装されている
**When**: スタックトレースを持つ Error オブジェクトを入力として渡す
**Then**: `error.stack` が文字列として返される

**Given**: `getErrorStack()` 関数が実装されている
**When**: スタックトレースを持たない Error オブジェクトを入力として渡す
**Then**: `undefined` が返される

**Given**: `getErrorStack()` 関数が実装されている
**When**: 非 Error オブジェクト（例: 文字列、数値、null）を入力として渡す
**Then**: `undefined` が返される

---

### AC-3: Error 型ガード関数

**Given**: `isError()` 関数が実装されている
**When**: Error オブジェクトを入力として渡す
**Then**: `true` が返され、型が `Error` にナローイングされる

**Given**: `isError()` 関数が実装されている
**When**: Error のサブクラス（例: TypeError）を入力として渡す
**Then**: `true` が返される

**Given**: `isError()` 関数が実装されている
**When**: 非 Error オブジェクト（例: 文字列、数値、null）を入力として渡す
**Then**: `false` が返される

---

### AC-4: 既存コードのリファクタリング

**Given**: 既存22ファイル、67箇所に `as Error` キャストが存在する
**When**: すべての `as Error` キャストをエラーユーティリティ関数に置き換える
**Then**: `grep -r "as Error" src/` の結果が空になる

**Given**: リファクタリングが完了している
**When**: 既存の統合テスト（52ファイル）を実行する
**Then**: すべてのテストが成功する（成功率100%）

**Given**: リファクタリングが完了している
**When**: `npm run build` を実行する
**Then**: TypeScript コンパイルエラーがゼロ

**Given**: リファクタリングが完了している
**When**: `npx eslint src/` を実行する
**Then**: ESLint エラーがゼロ

---

### AC-5: ユニットテストの作成

**Given**: `tests/unit/utils/error-utils.test.ts` が作成されている
**When**: `npm run test:unit` を実行する
**Then**: すべてのテストが成功する

**Given**: ユニットテストが作成されている
**When**: `npm run test:coverage` を実行する
**Then**: `error-utils.ts` のカバレッジが100%（行、分岐、関数）である

**Given**: ユニットテストが作成されている
**When**: エッジケース（null、undefined、循環参照オブジェクト）をテストする
**Then**: すべてのエッジケースで関数が安全に動作する（never throw）

---

### AC-6: 統合テストの更新

**Given**: 既存の統合テスト（52ファイル）が存在する
**When**: `npm run test:integration` を実行する
**Then**: すべてのテストが成功する（成功率100%）

**Given**: 統合テストが更新されている（必要に応じて）
**When**: 非 Error 型をスローするケース（例: 文字列エラー）を実行する
**Then**: エラーユーティリティ関数が正しく動作する

---

### AC-7: ドキュメント更新

**Given**: CLAUDE.md が存在する
**When**: 「エラーハンドリング規約」セクションを追加する
**Then**: `as Error` 使用禁止が明記されている

**Given**: CLAUDE.md が更新されている
**When**: `error-utils` の使用方法を確認する
**Then**: 使用例とベストプラクティスが記載されている

**Given**: `error-utils.ts` が実装されている
**When**: TSDoc コメントを確認する
**Then**: 各関数の説明、パラメータ、戻り値、使用例が記載されている

---

## 7. スコープ外

以下の項目は本プロジェクトのスコープ外とし、将来的な拡張候補として位置づけます：

### OUT-1: エラーレポーティングサービスへの送信

**説明**: エラーを外部サービス（例: Sentry、Datadog）に自動送信する機能。

**理由**: 本プロジェクトはエラーハンドリングの型安全性向上に焦点を当てており、外部サービス連携は別Issueとして扱うべきです。

**将来的な拡張**: `error-utils.ts` に `reportError(error: unknown, context?: Record<string, unknown>): void` 関数を追加することで、単一ポイントから外部サービスに送信可能になります。

---

### OUT-2: カスタムエラークラスの導入

**説明**: アプリケーション固有のエラークラス（例: `WorkflowError`、`GitHubApiError`）を導入する。

**理由**: 本プロジェクトは既存の `as Error` キャストの置き換えに焦点を当てており、新規エラークラスの導入は別Issueとして扱うべきです。

**将来的な拡張**: カスタムエラークラスを導入する場合、`isError()` 型ガードを拡張して `isWorkflowError(error: unknown): error is WorkflowError` のような関数を追加できます。

---

### OUT-3: エラーメッセージの国際化（i18n）

**説明**: エラーメッセージを多言語対応にする。

**理由**: 本プロジェクトは内部開発ツールであり、現時点で国際化の要件はありません。

**将来的な拡張**: 国際化が必要になった場合、`getErrorMessage()` 関数内で翻訳ロジックを追加できます。

---

### OUT-4: エラーメッセージのサニタイズ統合

**説明**: `SecretMasker` と統合し、エラーメッセージに含まれる機密情報を自動的にマスキングする。

**理由**: `SecretMasker` の統合は既存のロギング機構（`logger.ts`）で対応しており、エラーユーティリティ関数に組み込む必要はありません。

**将来的な拡張**: 必要に応じて、`getErrorMessage()` 関数内で `SecretMasker` を呼び出すことは可能ですが、現時点では呼び出し元の責任とします。

---

### OUT-5: ESLint ルールの追加

**説明**: `@typescript-eslint/no-explicit-type-assertion` ルールを有効化し、`as Error` の使用を自動的に禁止する。

**理由**: ESLint ルールの追加は別Issueとして扱うべきです。まずは手動リファクタリングを完了させ、その後にルールを導入することで、段階的な移行が可能になります。

**将来的な拡張**: リファクタリング完了後、`.eslintrc.json` に以下のルールを追加できます：
```json
{
  "rules": {
    "@typescript-eslint/consistent-type-assertions": [
      "error",
      {
        "assertionStyle": "never"
      }
    ]
  }
}
```

---

## 8. 補足情報

### 参考資料

- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: モジュール構成とデータフロー
- **Planning Document**: `.ai-workflow/issue-48/00_planning/output/planning.md`（実装戦略、テスト戦略、リスク、スケジュール）

### 技術参考

- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - 型ガード関数の実装方法
- [MDN: Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) - Error オブジェクトの仕様
- [TypeScript Deep Dive: Type Guards](https://basarat.gitbook.io/typescript/type-system/typeguard) - 型ガードのベストプラクティス

---

## 9. 品質ゲート確認

本要件定義書は、Phase 1 の品質ゲートを満たしていることを確認します：

- [x] **機能要件が明確に記載されている**: FR-1 〜 FR-7 で7つの機能要件を具体的に定義
- [x] **受け入れ基準が定義されている**: AC-1 〜 AC-7 で Given-When-Then 形式の受け入れ基準を定義
- [x] **スコープが明確である**: セクション7でスコープ外の項目を5つ明示
- [x] **論理的な矛盾がない**: Planning Document の戦略と整合性があり、機能要件・非機能要件・制約事項の間に矛盾なし

---

**承認者**: _____________
**承認日**: _____________
