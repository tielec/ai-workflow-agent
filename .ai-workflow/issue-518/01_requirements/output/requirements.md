# 要件定義書: Issue #518

## [FOLLOW-UP] #510: finalize-command.test.ts・Jest モックの一貫したパターン確立

---

## 0. Planning Document の確認

### 開発計画の全体像

Planning Document（`.ai-workflow/issue-518/00_planning/output/planning.md`）に基づき、以下の戦略が策定されている：

| 項目 | 決定事項 |
|------|----------|
| 実装戦略 | **REFACTOR** - 既存テストコードの構造改善が中心 |
| テスト戦略 | **INTEGRATION_ONLY** - インテグレーションテストの修正が主目的 |
| テストコード戦略 | **EXTEND_TEST** - 既存テストファイルの修正 |
| 複雑度 | **中程度** |
| 見積もり工数 | **8〜12時間** |
| リスク評価 | **中** |

### スコープ

- `tests/integration/finalize-command.test.ts` の ESM モック対応修正
- `__mocks__/fs-extra.ts` の ESM 互換性確認・修正
- テストスイート全体のモックパターン標準化（代表的なファイルのみ）
- モックガイドラインの文書化

### 技術選定

- `jest.unstable_mockModule` + `beforeAll` + 動的インポートパターンを標準として採用
- `__esModule: true` の明示
- `jest.requireActual` の併用

---

## 1. 概要

### 背景

Issue #510 の修正において、実装自体は健全であることが確認されたが、Evaluation Report でインテグレーションテスト `tests/integration/finalize-command.test.ts` が ESM 互換性のない Jest モックにより失敗した。この問題は既存のテストインフラに起因するものであり、実装の品質とは独立した課題である。

また、テストスイート全体でモック記法（同期的な `jest.mock` ファクトリ、`jest.spyOn`、`__mocks__` 自動モック、`jest.unstable_mockModule` 等）が混在していることが再発リスクとして指摘された。

### 目的

1. **短期目標**: `tests/integration/finalize-command.test.ts` の ESM モック問題を解消し、Issue #510 の検証を完遂する
2. **中期目標**: テストスイート全体で Jest モックの書き方を統一し、CJS/ESM 混在環境でも安定して動作する標準パターンを確立する
3. **長期目標**: 同種のインテグレーションテスト不具合を防止し、テストインフラの保守性を向上させる

### ビジネス価値・技術的価値

| カテゴリ | 価値 |
|---------|------|
| **品質保証** | テストの信頼性向上により、実装の品質を正確に検証可能になる |
| **開発効率** | モックパターン統一により、新規テスト作成時の迷いを削減 |
| **保守性** | 標準化されたパターンにより、テストコードの可読性・保守性が向上 |
| **CI/CD 安定性** | ESM 互換性問題の解消により、CI パイプラインの安定性が向上 |

---

## 2. 機能要件

### FR-01: `finalize-command.test.ts` の ESM モック修正

**優先度**: 高

**説明**: インテグレーションテスト `tests/integration/finalize-command.test.ts` のモック記法を ESM 互換パターンに変更し、テストを成功させる。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-01-1 | `fs-extra` モック定義を ESM 互換ファクトリに置き換える | テスト実行で TypeError が発生しない |
| FR-01-2 | `simple-git` モック定義を ESM 互換パターンに変更する | モック関数が正常に呼び出される |
| FR-01-3 | `repository-utils.js` モック定義を ESM 互換パターンに変更する | モック関数が正常に呼び出される |
| FR-01-4 | `git-manager.js` モック定義を ESM 互換パターンに変更する | モック関数が正常に呼び出される |
| FR-01-5 | `artifact-cleaner.js` モック定義を ESM 互換パターンに変更する | モック関数が正常に呼び出される |
| FR-01-6 | `github-client.js` モック定義を ESM 互換パターンに変更する | モック関数が正常に呼び出される |
| FR-01-7 | モジュールインポートを `beforeAll` 内の動的インポートに変更する | モック設定後にモジュールがインポートされる |
| FR-01-8 | `beforeEach` でモックの状態をリセットする | 各テストケース間でモック状態が独立する |

### FR-02: `__mocks__/fs-extra.ts` の ESM 対応確認・修正

**優先度**: 中

**説明**: 共通モックファイル `__mocks__/fs-extra.ts` が ESM 環境で正常に動作することを確認し、必要に応じて修正する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-02-1 | default export と named export の両方が正常に動作する | 両方の import 形式でテスト可能 |
| FR-02-2 | `__esModule: true` が必要な場合は追加する | ESM 環境でのインポートが成功する |
| FR-02-3 | Jest の自動モック解決と整合性がある | `__mocks__` からの自動モック読み込みが動作する |

### FR-03: Jest モックパターンの標準化

**優先度**: 中

**説明**: テストスイート全体で使用されているモック記法を分析し、ESM/CJS 互換の標準パターンを確立する。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-03-1 | 現行モック記法のばらつきを洗い出し、分類する | 分類リストの作成 |
| FR-03-2 | ESM/CJS 互換の標準モックパターンを定義する | パターン仕様の文書化 |
| FR-03-3 | 代表的なテストファイルを標準パターンにリファクタする | リファクタしたテストが成功する |
| FR-03-4 | 共通モックヘルパー関数を作成する（必要な場合） | ヘルパーを使用したテストが成功する |

### FR-04: モックガイドラインの文書化

**優先度**: 中

**説明**: ESM 対応モックパターンのガイドラインを作成し、今後のテスト開発に活用できるようにする。

**詳細要件**:

| ID | 要件 | 検証方法 |
|----|------|----------|
| FR-04-1 | ESM 互換モックパターンの推奨形式を明文化する | ドキュメントレビュー |
| FR-04-2 | サンプルコードを記載する | サンプルコードが実行可能 |
| FR-04-3 | 避けるべきパターン（アンチパターン）を記載する | ドキュメントレビュー |
| FR-04-4 | ガイドラインをテストディレクトリまたは CLAUDE.md に配置する | ファイル存在確認 |

---

## 3. 非機能要件

### NFR-01: パフォーマンス要件

| ID | 要件 | 目標値 |
|----|------|--------|
| NFR-01-1 | `finalize-command.test.ts` の実行時間 | 現状から大幅な増加なし（±20%以内） |
| NFR-01-2 | 全テストスイートの実行時間 | 現状から大幅な増加なし（±10%以内） |

### NFR-02: 互換性要件

| ID | 要件 | 検証方法 |
|----|------|----------|
| NFR-02-1 | Node.js 18.x/20.x LTS で動作する | CI 環境での実行確認 |
| NFR-02-2 | Jest 29.x で動作する | テストスイート全体の実行確認 |
| NFR-02-3 | `--experimental-vm-modules` フラグ使用時に動作する | package.json の既存スクリプトで実行確認 |
| NFR-02-4 | TypeScript 5.x で型エラーがない | `npm run build` での確認 |

### NFR-03: 保守性要件

| ID | 要件 | 検証方法 |
|----|------|----------|
| NFR-03-1 | モックパターンが一貫している | コードレビュー |
| NFR-03-2 | 新規テスト作成者が標準パターンを理解しやすい | ガイドラインの存在確認 |
| NFR-03-3 | モック設定とテストコードの分離が明確 | コードレビュー |

### NFR-04: 信頼性要件

| ID | 要件 | 検証方法 |
|----|------|----------|
| NFR-04-1 | テストが決定論的に動作する（フレーキーでない） | 複数回実行での成功確認 |
| NFR-04-2 | モック状態が各テストケース間で独立している | テスト順序変更での確認 |
| NFR-04-3 | 既存テストの期待値が変更されない | リグレッションテスト |

---

## 4. 制約事項

### 技術的制約

| ID | 制約 | 理由 |
|----|------|------|
| TC-01 | Jest 29.x を使用する | プロジェクト既存の依存関係 |
| TC-02 | `jest.unstable_mockModule` API を使用する | ESM 環境での唯一の公式モック手法 |
| TC-03 | `ts-jest` を使用する | TypeScript テストの既存インフラ |
| TC-04 | `--experimental-vm-modules` フラグを維持する | ESM サポートに必須 |
| TC-05 | 既存の `__mocks__/` ディレクトリ構造を維持する | 既存テストとの互換性 |

### リソース制約

| ID | 制約 | 対応策 |
|----|------|--------|
| RC-01 | 全テストファイル（29ファイル）の完全統一は対象外 | 代表的なファイルのみ修正し、残りは別 Issue で対応 |
| RC-02 | 8〜12時間の工数見積もり | 優先度の高い FR-01 を最優先で実施 |

### ポリシー制約

| ID | 制約 | 理由 |
|----|------|------|
| PC-01 | 既存テストの期待値（呼び出し回数・戻り値）を変更しない | 後方互換性の維持 |
| PC-02 | 新規依存パッケージを追加しない | 依存関係の最小化 |
| PC-03 | Jest 設定ファイル（`jest.config.cjs`）は原則変更しない | 既存インフラへの影響最小化 |

---

## 5. 前提条件

### システム環境

| ID | 前提条件 | 確認状況 |
|----|----------|----------|
| PE-01 | Node.js 18.x 以上がインストールされている | package.json の engines 参照 |
| PE-02 | `npm install` で依存関係がインストール済み | 開発環境の標準手順 |
| PE-03 | `NODE_OPTIONS="--experimental-vm-modules"` が設定可能 | package.json の test スクリプトで確認済み |

### 依存コンポーネント

| ID | 依存 | バージョン | 用途 |
|----|------|-----------|------|
| DC-01 | Jest | 29.x | テストフレームワーク |
| DC-02 | ts-jest | 29.x | TypeScript テストトランスパイル |
| DC-03 | fs-extra | 11.x | ファイルシステム操作（モック対象） |
| DC-04 | simple-git | 3.x | Git 操作（モック対象） |

### 外部システム連携

本 Issue はテストインフラの修正であり、外部システム連携は発生しない。

---

## 6. 受け入れ基準

### AC-01: `finalize-command.test.ts` の成功

```gherkin
Given: tests/integration/finalize-command.test.ts を単体実行する
When: npm test -- tests/integration/finalize-command.test.ts を実行する
Then: ESM モック関連の TypeError が発生せず、全ケースが成功する
```

**検証コマンド**:
```bash
npm test -- tests/integration/finalize-command.test.ts
```

**成功条件**:
- 全テストケースが PASS する
- `TypeError: Cannot read properties of undefined` 等の ESM 関連エラーが発生しない
- モック関数の呼び出しアサーションが成功する

### AC-02: 代表テストでのモック初期化エラーなし

```gherkin
Given: テストスイートに新しいモックパターンが導入される
When: 代表的な既存テスト（統一パターンに置き換えたもの）を実行する
Then: モック初期化エラーなく既存の期待値が維持される
```

**検証コマンド**:
```bash
npm test -- tests/integration/cleanup-command.test.ts
npm test -- tests/unit/commands/finalize.test.ts
```

**成功条件**:
- 対象テストが PASS する
- モック初期化時のエラーが発生しない
- 既存のテスト期待値（呼び出し回数、戻り値等）が変更されていない

### AC-03: モックガイドラインの明文化

```gherkin
Given: モックガイドラインが整理される
When: テストディレクトリや共通セットアップを確認する
Then: ESM/CJS 混在を意識した統一的なモック手順が明文化されている
```

**検証方法**:
- ガイドラインドキュメントの存在確認
- 以下のセクションが含まれていることを確認:
  - ESM 互換モックパターンの推奨形式
  - `jest.unstable_mockModule` の使用例
  - `beforeAll` での動的インポートパターン
  - 避けるべきアンチパターン

### AC-04: 全テストスイートのリグレッションなし

```gherkin
Given: モックパターンが修正される
When: 全テストスイートを実行する
Then: 既存のテストにリグレッションが発生しない
```

**検証コマンド**:
```bash
npm test
```

**成功条件**:
- 全テストスイートが PASS する
- 修正前と同等以上のテスト成功率を維持

---

## 7. スコープ外

### 明確にスコープ外とする事項

| ID | 項目 | 理由 |
|----|------|------|
| OOS-01 | 全29ファイルの完全モックパターン統一 | 工数制約。代表ファイルのみ対応し、残りは別 Issue |
| OOS-02 | Jest のバージョンアップ | 本 Issue の目的外 |
| OOS-03 | 新規テストケースの追加 | 既存テストの修正が目的 |
| OOS-04 | `jest.config.cjs` の大幅変更 | 既存インフラへの影響を最小化 |
| OOS-05 | BDD テストの追加 | テストインフラ修正であり、ユーザーストーリーに直接関係しない |
| OOS-06 | ユニットテストの新規追加 | 既存テストのリファクタリングが目的 |

### 将来的な拡張候補

| ID | 項目 | 想定時期 |
|----|------|----------|
| FE-01 | 残りの26ファイルのモックパターン統一 | 次回以降の Issue |
| FE-02 | 共通モックヘルパーライブラリの拡充 | 必要に応じて |
| FE-03 | Jest ESM サポート安定化後のマイグレーション | Jest の安定版リリース後 |

---

## 参考情報

### 正常なモックパターン例（テンプレート）

`tests/unit/pr-comment/finalize-command.test.ts` より抜粋：

```typescript
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// モック関数の事前定義
const getRepoRootMock = jest.fn<() => Promise<string>>();
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  repositoryName: 'owner/repo',
  prNumber: 123,
}));

let handlePRCommentFinalizeCommand: (options: PRCommentFinalizeOptions) => Promise<void>;

beforeAll(async () => {
  // ESM 互換の非同期モック設定
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  // モック設定後にモジュールをインポート
  const module = await import('../../../src/commands/pr-comment/finalize.js');
  handlePRCommentFinalizeCommand = module.handlePRCommentFinalizeCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // モックの初期値設定
});
```

### 問題のあるパターン例（現在の finalize-command.test.ts）

```typescript
// 同期的な jest.mock - ESM では問題が発生する可能性
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  ensureDirSync: jest.fn(),
  // ...
}));

// モック設定前にインポート（ホイスティングに依存）
import fs from 'fs-extra';
```

### 関連リソース

| リソース | URL/パス |
|----------|----------|
| 元 Issue | #510 |
| Jest ESM ドキュメント | https://jestjs.io/docs/ecmascript-modules |
| jest.unstable_mockModule API | https://jestjs.io/docs/jest-object#jestunstable_mockmodulemodulename-factory-options |
| Planning Document | `.ai-workflow/issue-518/00_planning/output/planning.md` |

---

## 品質ゲート達成状況

| 品質ゲート | 状況 | 備考 |
|-----------|------|------|
| 機能要件が明確に記載されている | :white_check_mark: 達成 | FR-01〜FR-04 で詳細に定義 |
| 受け入れ基準が定義されている | :white_check_mark: 達成 | AC-01〜AC-04 で Given-When-Then 形式で定義 |
| スコープが明確である | :white_check_mark: 達成 | スコープ外項目を明示 |
| 論理的な矛盾がない | :white_check_mark: 達成 | Planning Document との整合性を確認 |

---

*作成日: 2025-01-20*
*作成者: AI Workflow Agent*
*Issue 番号: #518*
*関連 Issue: #510*
