# 要件定義書: Issue #571

## Implement prompt file switching based on language setting

---

## 0. Planning Documentの確認

本要件定義は、Planning Phase成果物（`.ai-workflow/issue-571/00_planning/output/planning.md`）の計画に基づいて作成されています。

### 開発計画の概要

| 項目 | 内容 |
|------|------|
| **複雑度** | 中程度 |
| **見積もり工数** | 12〜16時間 |
| **実装戦略** | EXTEND（既存の`loadPrompt()`メソッドを拡張） |
| **テスト戦略** | UNIT_INTEGRATION |
| **テストコード戦略** | CREATE_TEST |

### リスク概要

- 英語プロンプトの翻訳品質がシステム動作に影響
- MetadataManager.getLanguage()の依存関係
- 既存テストの回帰リスク
- ビルドスクリプトの互換性

---

## 1. 概要

### 1.1 背景

Issue #526において、言語設定の優先順位解決ロジック（CLI > 環境変数 > メタデータ > デフォルト）とmetadata.jsonへの`language`フィールド永続化が実装された（PR #568）。しかし、現在のシステムでは実際のプロンプトファイル（`src/prompts/{phase}/execute.txt`等）が日本語固定のままであり、言語設定が反映されていない。

### 1.2 目的

`metadata.json`の`language`設定に応じて、適切な言語のプロンプトファイルを動的に読み込む機能を実装し、多言語対応ワークフローを実現する。

### 1.3 ビジネス価値

- **国際化対応**: 英語圏ユーザーへのサポート拡大
- **ユーザーエクスペリエンス向上**: 母国語でのプロンプト提供によるLLM応答品質向上
- **拡張性**: 将来的な多言語対応（中国語、韓国語等）への基盤整備

### 1.4 技術的価値

- **モジュール化**: 言語切り替えロジックの集中管理
- **後方互換性**: フォールバック機構による既存動作の保証
- **保守性**: 言語別プロンプトの独立した品質改善が可能

---

## 2. 機能要件

### FR-001: プロンプトファイルディレクトリ構造の多言語化

**優先度**: 高

**説明**: 既存のプロンプトファイル構造を多言語対応ディレクトリ構造に変更する。

**詳細仕様**:
- 現在の構造: `src/prompts/{phase}/{type}.txt`
- 新構造: `src/prompts/{phase}/{language}/{type}.txt`
- 対象フェーズ: 全10フェーズ（planning, requirements, design, test_scenario, implementation, test_implementation, testing, documentation, report, evaluation）
- 対象言語: `ja`（日本語）、`en`（英語）
- 対象ファイルタイプ: `execute.txt`、`review.txt`、`revise.txt`

**ファイル数**:
- 日本語: 30ファイル（10フェーズ × 3種類）の移動
- 英語: 30ファイル（10フェーズ × 3種類）の新規作成

### FR-002: BasePhase.loadPrompt()の多言語対応

**優先度**: 高

**説明**: `BasePhase`クラスの`loadPrompt()`メソッドを拡張し、言語設定に基づいてプロンプトファイルを読み込む。

**詳細仕様**:
```typescript
// 擬似コード
private loadPrompt(type: 'execute' | 'review' | 'revise'): string {
  const language = this.metadataManager.getLanguage(); // 言語設定を取得
  const promptPath = path.join(this.promptsRoot, this.phaseName, language, `${type}.txt`);

  // 指定言語のプロンプトが存在しない場合は日本語にフォールバック
  if (!fs.existsSync(promptPath)) {
    const fallbackPath = path.join(this.promptsRoot, this.phaseName, DEFAULT_LANGUAGE, `${type}.txt`);
    logger.warn(`Prompt not found for language '${language}', falling back to '${DEFAULT_LANGUAGE}'`);
    return fs.readFileSync(fallbackPath, 'utf-8');
  }

  return fs.readFileSync(promptPath, 'utf-8');
}
```

**依存関係**:
- `MetadataManager.getLanguage()`: Issue #526で実装済み想定（未実装の場合は本Issueで追加）

### FR-003: フォールバック機構

**優先度**: 高

**説明**: 指定された言語のプロンプトファイルが存在しない場合、日本語（デフォルト言語）にフォールバックする。

**詳細仕様**:
- デフォルト言語: `ja`（日本語）
- フォールバック条件: 指定言語のプロンプトファイルが存在しない場合
- ログ出力: フォールバック発生時にWARNレベルでログ出力
- エラー処理: デフォルト言語のプロンプトも存在しない場合はエラーをスロー

### FR-004: DEFAULT_LANGUAGE定数の追加

**優先度**: 中

**説明**: システム全体で使用するデフォルト言語を定数として定義する。

**詳細仕様**:
- 定義場所: `src/types.ts`または`src/core/config.ts`
- 定数名: `DEFAULT_LANGUAGE`
- デフォルト値: `'ja'`
- 型: `'ja' | 'en'`（Language型として定義も検討）

### FR-005: ビルドスクリプトの多言語対応

**優先度**: 中

**説明**: `scripts/copy-static-assets.mjs`を更新し、多言語ディレクトリ構造を`dist/prompts/`に正しくコピーする。

**詳細仕様**:
- 既存の`fs.cp()`による再帰コピーで対応可能（`recursive: true`オプション）
- コピー元: `src/prompts/{phase}/{lang}/*.txt`
- コピー先: `dist/prompts/{phase}/{lang}/*.txt`
- 検証: ビルド後に多言語ディレクトリ構造が維持されていることを確認

### FR-006: 英語プロンプトの作成

**優先度**: 高

**説明**: 全10フェーズ × 3種類 = 30ファイルの英語プロンプトを作成する。

**詳細仕様**:
- 翻訳対象: 既存の日本語プロンプトファイル
- 翻訳方法: LLMを使用した自動翻訳
- 品質保証: 主要プロンプト（特に`execute.txt`）の品質レビュー実施
- ファイル配置: `src/prompts/{phase}/en/`ディレクトリ

**対象ファイル一覧**:

| フェーズ | execute.txt | review.txt | revise.txt |
|---------|------------|-----------|------------|
| planning | 要翻訳 | 要翻訳 | 要翻訳 |
| requirements | 要翻訳 | 要翻訳 | 要翻訳 |
| design | 要翻訳 | 要翻訳 | 要翻訳 |
| test_scenario | 要翻訳 | 要翻訳 | 要翻訳 |
| implementation | 要翻訳 | 要翻訳 | 要翻訳 |
| test_implementation | 要翻訳 | 要翻訳 | 要翻訳 |
| testing | 要翻訳 | 要翻訳 | 要翻訳 |
| documentation | 要翻訳 | 要翻訳 | 要翻訳 |
| report | 要翻訳 | 要翻訳 | 要翻訳 |
| evaluation | 要翻訳 | 要翻訳 | 要翻訳 |

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

**説明**: プロンプトファイル読み込みのパフォーマンスへの影響を最小化する。

**詳細仕様**:
- 追加のファイルシステムアクセス: フォールバック時のみ（`fs.existsSync()`1回追加）
- 許容応答時間: 現行と同等（プロンプト読み込みは10ms以下を維持）
- キャッシュ: 現時点では不要（将来的な拡張として検討可能）

### NFR-002: セキュリティ要件

**説明**: パストラバーサル攻撃への対策。

**詳細仕様**:
- 言語パラメータのバリデーション: 許可された言語コード（`ja`、`en`）のみ受け付け
- パス構築: `path.join()`による安全なパス構築
- ユーザー入力の直接使用禁止

### NFR-003: 可用性・信頼性要件

**説明**: フォールバック機構による高可用性の確保。

**詳細仕様**:
- フォールバック成功率: 100%（デフォルト言語のプロンプトは必須）
- エラー発生時の動作: デフォルト言語のプロンプトで処理を継続
- ログ出力: フォールバック発生時にWARNレベルでログ出力

### NFR-004: 保守性・拡張性要件

**説明**: 将来的な言語追加を容易にする設計。

**詳細仕様**:
- 新規言語追加手順: `src/prompts/{phase}/{new_lang}/`ディレクトリを作成し、プロンプトファイルを配置するのみ
- コード変更不要: 言語ディレクトリの追加でシステム側の変更は不要
- デフォルト言語の変更: `DEFAULT_LANGUAGE`定数の変更のみ

---

## 4. 制約事項

### 4.1 技術的制約

| 制約 | 詳細 |
|------|------|
| 既存APIの維持 | `loadPrompt()`メソッドのシグネチャ変更は不可（後方互換性） |
| ファイルシステム依存 | プロンプトファイルはローカルファイルシステムから読み込み |
| 同期読み込み | `fs.readFileSync()`による同期読み込みを維持 |
| Node.js互換性 | Node.js 18以上をサポート |

### 4.2 リソース制約

| 制約 | 詳細 |
|------|------|
| 翻訳工数 | 30ファイルの英語翻訳に4〜6時間 |
| レビュー工数 | 翻訳品質レビューに1〜2時間 |
| 総工数上限 | 12〜16時間以内で完了 |

### 4.3 ポリシー制約

| 制約 | 詳細 |
|------|------|
| ESLint準拠 | すべてのコードはESLintルールに準拠 |
| テストカバレッジ | 新規コードは既存のカバレッジ水準を維持 |
| コミット形式 | Conventional Commits形式に準拠 |

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 18以上
- TypeScript 5.x
- ESM（ECMAScript Modules）環境

### 5.2 依存コンポーネント

| コンポーネント | 状態 | 備考 |
|--------------|------|------|
| MetadataManager | 実装済み | Issue #526で言語設定機能を追加（PR #568） |
| MetadataManager.getLanguage() | 要確認 | 未実装の場合は本Issueで追加 |
| BasePhase.loadPrompt() | 実装済み | 拡張対象 |
| copy-static-assets.mjs | 実装済み | 既存の再帰コピーで対応可能 |

### 5.3 外部システム連携

- なし（本機能は内部実装のみ）

---

## 6. 受け入れ基準

### AC-001: 日本語プロンプトの読み込み

```gherkin
Given metadata.jsonのlanguageが"ja"に設定されている
When BasePhase.loadPrompt("execute")が呼び出される
Then src/prompts/{phase}/ja/execute.txtの内容が返される
And ログに言語切り替え情報が出力されない（フォールバックなし）
```

### AC-002: 英語プロンプトの読み込み

```gherkin
Given metadata.jsonのlanguageが"en"に設定されている
When BasePhase.loadPrompt("execute")が呼び出される
Then src/prompts/{phase}/en/execute.txtの内容が返される
And ログに言語切り替え情報が出力されない（フォールバックなし）
```

### AC-003: フォールバック動作（言語プロンプト欠落時）

```gherkin
Given metadata.jsonのlanguageが"fr"に設定されている
And src/prompts/{phase}/fr/execute.txtが存在しない
When BasePhase.loadPrompt("execute")が呼び出される
Then src/prompts/{phase}/ja/execute.txtの内容が返される（デフォルト言語にフォールバック）
And WARNレベルのログが出力される
```

### AC-004: エラーハンドリング（デフォルト言語プロンプトも欠落時）

```gherkin
Given src/prompts/{phase}/ja/execute.txtが存在しない
And src/prompts/{phase}/{any_lang}/execute.txtが存在しない
When BasePhase.loadPrompt("execute")が呼び出される
Then エラーがスローされる
And エラーメッセージにファイルパスが含まれる
```

### AC-005: ビルド後のディレクトリ構造

```gherkin
Given npm run buildが実行された
When dist/promptsディレクトリを確認する
Then dist/prompts/{phase}/ja/*.txtが存在する
And dist/prompts/{phase}/en/*.txtが存在する
And ファイル内容がsrc/promptsと一致する
```

### AC-006: 全10フェーズでの多言語切り替え

```gherkin
Given 全10フェーズ（planning〜evaluation）のプロンプトが存在する
When 各フェーズでlanguage="en"でloadPromptが呼び出される
Then すべてのフェーズで英語プロンプトが読み込まれる
And すべてのプロンプトが正常に処理される
```

### AC-007: 既存テストの回帰なし

```gherkin
Given プロンプトファイル構造が変更された
When npm testを実行する
Then 既存のテストがすべてパスする
And テストカバレッジが既存水準を維持する
```

---

## 7. スコープ外

### 7.1 本Issueのスコープ外とする事項

| 項目 | 理由 |
|------|------|
| 日本語・英語以外の言語対応 | 将来的な拡張として検討（本Issueでは2言語のみ） |
| プロンプトファイルのキャッシュ機構 | パフォーマンス要件を満たしているため不要 |
| 言語設定のUI/CLIオプション追加 | Issue #526で実装済み |
| 自動言語検出 | 現時点では明示的な設定のみサポート |
| プロンプトファイルのバージョン管理UI | 管理はGitで実施 |

### 7.2 将来的な拡張候補

| 項目 | 優先度 | 備考 |
|------|--------|------|
| 中国語（zh）プロンプト追加 | 中 | 中国語圏ユーザー対応 |
| 韓国語（ko）プロンプト追加 | 中 | 韓国語圏ユーザー対応 |
| プロンプトファイルのホットリロード | 低 | 開発時の利便性向上 |
| 言語別プロンプト品質スコアリング | 低 | 翻訳品質の定量化 |

---

## 品質ゲート（Phase 1）チェックリスト

- [x] **機能要件が明確に記載されている**: FR-001〜FR-006で6つの機能要件を定義
- [x] **受け入れ基準が定義されている**: AC-001〜AC-007でGiven-When-Then形式で7つの受け入れ基準を定義
- [x] **スコープが明確である**: スコープ外項目と将来的な拡張候補を明示
- [x] **論理的な矛盾がない**: 機能要件と受け入れ基準が対応、非機能要件と制約事項が整合

---

## 関連Issue・PR

- **Issue #526**: 言語設定オプションの実装（解決ロジック・永続化）
- **PR #568**: Issue #526の実装
- **Planning Document**: `.ai-workflow/issue-571/00_planning/output/planning.md`

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-01-XX | 初版作成 |
