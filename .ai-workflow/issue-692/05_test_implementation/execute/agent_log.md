# Codex Agent 実行ログ

開始日時: 2026/2/17 7:57:06

---

## Turn 1: スレッド開始

**Thread ID**: `[REDACTED_TOKEN]`

## Turn 2: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 3: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc ls`
**ステータス**: completed (exit_code=0)

```text
AGENT_TEAMS.md
CHANGELOG.md
CLAUDE.md
[REDACTED_TOKEN].md
[REDACTED_TOKEN].md
[REDACTED_TOKEN].md
CODEBASE_SUMMARY.md
Dockerfile
Jenkinsfile
LICENSE
PROGRESS.md
README.md
TROUBLESHOOTING.md
__mocks__
docs
examples
jenkins
jest.config.cjs
metadata.json.template
package-lock.json
package.json
scripts
src
tests
tsconfig.json
tsconfig.test.json
```

## Turn 4: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' .ai-workflow/issue-692/00_planning/output/planning.md"`
**ステータス**: completed (exit_code=0)

```text
# プロジェクト計画書: Issue #692 - test_preparation フェーズの追加

## 1. Issue分析

### 概要

本Issueは、`execute` コマンドのワークフローにおいて、テスト実装（`test_implementation`）フェーズとテスト実行（`testing`）フェーズの間に、新規の **テスト準備（`test_preparation`）フェーズ** を追加する変更である。

Docker コンテナ内でテスト実行時に、対象リポジトリの開発言語ランタイムやライブラリがインストールされておらず、テストが失敗するケースが頻発している。この問題を根本的に解決するため、テスト実行前に環境を自動準備するフェーズを導入する。

### 複雑度: **中程度〜複雑**

**判定根拠**:
- **新規ファイル作成**: `[REDACTED_TOKEN]` クラス（1ファイル）、プロンプトファイル（6ファイル: ja/en x execute/review/revise）
- **既存ファイル変更**: 最低7ファイル（`types.ts`, `execute.ts`, `phase-dependencies.ts`, `phase-factory.ts`, `base-phase.ts`, `agent-setup.ts`, `model-optimizer.ts`）
- **フェーズ番号の変更**: 既存フェーズ（testing〜evaluation）の番号が06〜09から07〜10にシフトし、既存ワークフローとの後方互換性の考慮が必要
- **テスト追加**: ユニットテストおよび統合テストの新規作成・既存テスト修正
- **既存のフェーズ実装パターン**が明確に存在するため、ゼロからの設計は不要

### 見積もり工数: **16〜24時間**

| カテゴリ | 見積もり | 内訳 |
|---------|---------|------|
| 型定義・設定変更 | 2〜3h | types.ts, execute.ts, phase-dependencies.ts, phase-factory.ts, agent-setup.ts |
| フェーズクラス実装 | 4〜6h | [REDACTED_TOKEN]（execute/review/revise） |
| プロンプト作成 | 3〜4h | 日本語3ファイル + 英語3ファイル |
| base-phase.ts 変更 | 2〜3h | フェーズ番号マッピング変更、後方互換性対応 |
| model-optimizer.ts 変更 | 1〜2h | 難易度別モデルマッピング追加 |
| テスト作成・修正 | 3〜4h | ユニットテスト新規作成、既存テスト修正 |
| 統合テスト・検証 | 1〜2h | `npm run validate` で全体検証 |

### リスク評価: **中**

- フェーズ番号変更による既存ワークフローへの影響がリスク要因
- ただし、既存のフェーズ実装パターンが確立されており、実装自体の技術的リスクは低い

---

## 2. 実装戦略判断

### 実装戦略: **CREATE**

**判断根拠**:
- 新規フェーズクラス `[REDACTED_TOKEN]` の作成が中心的な作業
- 新規プロンプトファイル6ファイルの作成が必要
- 既存ファイルの変更は、新規フェーズの登録・統合のための定型的な追加が主
- 既存コードのリファクタリングは不要（フェーズ番号の調整は機械的な変更）
- `[REDACTED_TOKEN]` の実装パターンをテンプレートとして流用できるため、アーキテクチャ設計は不要

### テスト戦略: **UNIT_INTEGRATION**

**判断根拠**:
- **ユニットテスト**: `[REDACTED_TOKEN]` クラスの各メソッド（execute/review/revise）の単体テスト、フェーズ依存関係のバリデーションテスト、フェーズ番号マッピングのテスト
- **インテグレーションテスト**: `implementation` プリセットおよび `testing` プリセットで `test_preparation` が正しく実行順序に含まれることの検証、フェーズ間のコンテキスト受け渡しテスト
- **BDDテスト不要**: エンドユーザー向けUIの変更はなく、CLIの動作は既存のフレームワーク内で完結する

### テストコード戦略: **BOTH_TEST**

**判断根拠**:
- **CREATE_TEST**: `[REDACTED_TOKEN]` の新規テストファイル作成（`tests/unit/phases/test-preparation.test.ts`）
- **EXTEND_TEST**: 既存の統合テスト（フェーズ順序テスト、依存関係テスト、プリセットテスト）に `test_preparation` のケースを追加
- 既存の `execute.test.ts` や `phase-dependencies` 関連テストにもテストケース追加が必要

---

## 3. 影響範囲分析

### 既存コードへの影響

#### 直接変更が必要なファイル

| ファイル | 変更内容 | 影響度 |
|---------|---------|--------|
| `src/types.ts` | `PhaseName` 型に `'test_preparation'` を追加 | 低（型の拡張のみ） |
| `src/commands/execute.ts` | `PHASE_ORDER` 配列に追加 | 低（配列要素追加） |
| `src/core/phase-dependencies.ts` | `PHASE_DEPENDENCIES`, `PHASE_PRESETS`, `PRESET_DESCRIPTIONS` の更新 | 中（依存関係の変更） |
| `src/core/phase-factory.ts` | `createPhaseInstance()` に case 追加、import 追加 | 低（定型追加） |
| `src/phases/base-phase.ts` | `getPhaseNumber()` のマッピング更新（番号シフト） | **高**（既存フェーズ番号変更） |
| `src/commands/execute/agent-setup.ts` | `[REDACTED_TOKEN]` に `test_preparation` 追加 | 低（マッピング追加） |
| `src/core/model-optimizer.ts` | 難易度別モデルマッピングに `test_preparation` 追加 | 低（マッピング追加） |

#### 新規作成ファイル

| ファイル | 説明 |
|---------|------|
| `src/phases/test-preparation.ts` | `[REDACTED_TOKEN]` クラス |
| `src/prompts/test_preparation/ja/execute.txt` | テスト準備実行プロンプト（日本語） |
| `src/prompts/test_preparation/ja/review.txt` | テスト準備レビュープロンプト（日本語） |
| `src/prompts/test_preparation/ja/revise.txt` | テスト準備修正プロンプト（日本語） |
| `src/prompts/test_preparation/en/execute.txt` | テスト準備実行プロンプト（英語） |
| `src/prompts/test_preparation/en/review.txt` | テスト準備レビュープロンプト（英語） |
| `src/prompts/test_preparation/en/revise.txt` | テスト準備修正プロンプト（英語） |

#### 影響を受ける既存テスト

| テストファイル | 修正内容 |
|--------------|---------|
| `tests/unit/commands/execute.test.ts` | フェーズ順序テスト、プリセットテストの更新 |
| `tests/unit/phases/base-phase-*.test.ts` | フェーズ番号マッピングテストの更新 |
| `tests/integration/` 内の関連テスト | フェーズ数の変更（10→11）に伴うアサーション更新 |

### 依存関係の変更

- **新規依存の追加**: なし（既存の依存パッケージで実装可能）
- **フェーズ依存関係の変更**:
  - `test_preparation` → `['test_implementation']` に依存（新規追加）
  - `testing` → `['test_implementation']` から `['test_preparation']` に変更

### マイグレーション要否

**フェーズ番号のシフトに関する方
... (truncated)
```

## Turn 5: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' .ai-workflow/issue-692/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
# テストシナリオ: Issue #692 - test_preparation フェーズの追加

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION**（Phase 2 設計書で決定）

### テスト対象の範囲

| カテゴリ | 対象 | テスト種別 |
|---------|------|-----------|
| 型定義 | `PhaseName` 型への `'test_preparation'` 追加 | Unit |
| フェーズ順序 | `PHASE_ORDER` 配列への挿入 | Unit + Integration |
| 依存関係 | `PHASE_DEPENDENCIES` の更新 | Unit + Integration |
| プリセット | `PHASE_PRESETS`, `PRESET_DESCRIPTIONS` の更新 | Unit + Integration |
| フェーズクラス | `[REDACTED_TOKEN]` (execute/review/revise) | Unit |
| フェーズファクトリ | `createPhaseInstance()` の case 追加 | Unit |
| フェーズ番号 | `getPhaseNumber()` のマッピング更新（2箇所） | Unit |
| ログ抽出 | `[REDACTED_TOKEN]()` のヘッダーパターン追加 | Unit |
| エージェント優先順位 | `[REDACTED_TOKEN]` マッピング追加 | Unit |
| モデル最適化 | `[REDACTED_TOKEN]` への追加 | Unit |
| プロンプト | 6 ファイル（ja/en × execute/review/revise） | Unit |

### テストの目的

1. **型安全性の保証**: `PhaseName` 型の拡張が全ての `Record<PhaseName, ...>` マッピングに波及し、漏れがないことを検証
2. **フェーズ統合の正確性**: `test_preparation` が正しい位置（test_implementation の直後、testing の直前）に挿入されていることを検証
3. **依存関係の整合性**: 新しい依存チェーン（test_implementation → test_preparation → testing）が正しく機能することを検証
4. **後方互換性**: 既存のプリセット・依存関係・フェーズ番号が正しく動作し続けることを検証
5. **新規クラスの機能性**: `[REDACTED_TOKEN]` の execute/review/revise が正しく動作することを検証

---

## 2. Unit テストシナリオ

### 2.1 PhaseName 型の拡張（FR-001）

**テスト対象ファイル**: `src/types.ts`
**テストファイル**: 既存テストの TypeScript コンパイル成功で間接検証

#### UT-TYPE-001: PhaseName 型に test_preparation が含まれる

- **目的**: `PhaseName` 型ユニオンに `'test_preparation'` が追加されていることを検証
- **前提条件**: `src/types.ts` が変更済み
- **入力**: TypeScript コンパイル
- **期待結果**: `npm run lint` がエラーなく完了すること
- **検証方法**: `'test_preparation'` を `PhaseName` 型の変数に代入可能であること（型レベル検証はコンパイル時に実行）

---

### 2.2 PHASE_ORDER 配列の更新（FR-002）

**テスト対象ファイル**: `src/commands/execute.ts`
**テストファイル**: `tests/unit/commands/execute.test.ts`（既存テスト更新）

#### UT-ORDER-001: test_preparation が PHASE_ORDER に含まれる

- **目的**: `PHASE_ORDER` 配列に `'test_preparation'` が含まれていることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_ORDER` が `'test_preparation'` を含むこと
- **テストデータ**: なし

#### UT-ORDER-002: test_preparation の位置が正しい

- **目的**: `test_preparation` が `test_implementation` の直後、`testing` の直前に配置されていることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  - `PHASE_ORDER.indexOf('test_preparation')` が `PHASE_ORDER.indexOf('test_implementation') + 1` と等しい
  - `PHASE_ORDER.indexOf('test_preparation')` が `PHASE_ORDER.indexOf('testing') - 1` と等しい

#### UT-ORDER-003: フェーズ総数が 11 である

- **目的**: `test_preparation` の追加によりフェーズ総数が 10 から 11 に増加していることを検証
- **前提条件**: `PHASE_ORDER` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_ORDER.length` が 11 であること

---

### 2.3 フェーズ依存関係（FR-003）

**テスト対象ファイル**: `src/core/phase-dependencies.ts`
**テストファイル**: `tests/unit/phase-dependencies.test.ts`（既存テスト更新）

#### UT-DEP-001: test_preparation の依存関係が正しく定義されている

- **目的**: `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` であることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` と等しいこと

#### UT-DEP-002: testing の依存が test_preparation に変更されている

- **目的**: `PHASE_DEPENDENCIES['testing']` が `['test_implementation']` から `['test_preparation']` に変更されていることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PHASE_DEPENDENCIES['testing']` が `['test_preparation']` と等しいこと

#### UT-DEP-003: 全 Phase が PHASE_DEPENDENCIES に定義されている

- **目的**: `PHASE_DEPENDENCIES` のキーに `test_preparation` を含む全 11 フェーズが定義されていることを検証
- **前提条件**: `PHASE_DEPENDENCIES` が更新済み
- **入力**: 期待されるフェーズ名リスト（11 件）
- **期待結果**: すべてのフェーズ名が `PHASE_DEPENDENCIES` のキーに含まれること
- **テストデータ**:
  ```typescript
  const expectedPhases: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'test_preparation',
    'testing', 'documentation', 'report', 'evaluation',
  ];
  ```

#### UT-DEP-004: 循環依存が存在しない

- **目的**: `test_preparation` 追加後も依存関係グラフに循環が存在しないことを検証
- **前提条件**: `P
... (truncated)
```

## Turn 6: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '200,400p' .ai-workflow/issue-692/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
#### UT-PRESET-004: quick-fix プリセットが変更されていない

- **目的**: `PHASE_PRESETS['quick-fix']` が変更されていないことを検証（testing を含まないため追加不要）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  ```typescript
  PHASE_PRESETS['quick-fix'] === ['planning', 'implementation', 'documentation', 'report']
  ```

#### UT-PRESET-005: プリセット総数が変わらない（10 プリセット）

- **目的**: プリセットの数が変わっていないことを検証（プリセット自体の追加・削除はないため）
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys(PHASE_PRESETS).length === 10`

#### UT-PRESET-006: PRESET_DESCRIPTIONS のキーが PHASE_PRESETS と一致する

- **目的**: `PRESET_DESCRIPTIONS` のキー集合が `PHASE_PRESETS` のキー集合と完全に一致することを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys(PHASE_PRESETS).sort()` と `Object.keys(PRESET_DESCRIPTIONS).sort()` が等しいこと

#### UT-PRESET-007: PRESET_DESCRIPTIONS の implementation 説明に TestPreparation が含まれる

- **目的**: `PRESET_DESCRIPTIONS['implementation']` の説明に `TestPreparation` が含まれていることを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PRESET_DESCRIPTIONS['implementation']` が `'TestPreparation'` を含むこと

#### UT-PRESET-008: PRESET_DESCRIPTIONS の testing 説明に TestPreparation が含まれる

- **目的**: `PRESET_DESCRIPTIONS['testing']` の説明に `TestPreparation` が含まれていることを検証
- **前提条件**: `PRESET_DESCRIPTIONS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `PRESET_DESCRIPTIONS['testing']` が `'TestPreparation'` を含むこと

#### UT-PRESET-009: すべてのプリセットに planning が含まれ先頭である

- **目的**: 既存の規約（全プリセット先頭が planning）が維持されていることを検証
- **前提条件**: `PHASE_PRESETS` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: すべてのプリセットで `phases[0] === 'planning'`

---

### 2.5 [REDACTED_TOKEN] クラス（FR-005）

**テスト対象ファイル**: `src/phases/test-preparation.ts`（新規）
**テストファイル**: `tests/unit/phases/test-preparation.test.ts`（新規作成）

#### UT-PHASE-001: コンストラクタで phaseName が 'test_preparation' に設定される

- **目的**: `[REDACTED_TOKEN]` のインスタンス生成時に `phaseName` が `'test_preparation'` に正しく設定されることを検証
- **前提条件**: `[REDACTED_TOKEN]` クラスが実装済み
- **入力**: `[REDACTED_TOKEN]`（モック）
- **期待結果**: `instance.phaseName === 'test_preparation'`（内部プロパティの検証）

#### UT-PHASE-002: execute() が [REDACTED_TOKEN] を呼び出す（正常系）

- **目的**: `execute()` メソッドが `[REDACTED_TOKEN]()` を正しいパラメータで呼び出すことを検証
- **前提条件**: メタデータに `issue_number` が設定済み、モック環境
- **入力**: 内部メタデータの `issue_number`
- **期待結果**:
  - `[REDACTED_TOKEN]` が `'test-preparation.md'` を出力ファイル名として呼び出される
  - テンプレート変数に `[REDACTED_TOKEN]`, `[REDACTED_TOKEN]`, `[REDACTED_TOKEN]`, `issue_number` が含まれる
  - オプションに `maxTurns: 80` が設定されている
  - オプションに `enableFallback: true` が設定されている

#### UT-PHASE-003: execute() が [REDACTED_TOKEN] を使用してコンテキストを構築する

- **目的**: `execute()` メソッドが `[REDACTED_TOKEN]()` を使用して `test_implementation` と `implementation` のコンテキストを構築することを検証
- **前提条件**: モック環境
- **入力**: なし（内部処理）
- **期待結果**:
  - `[REDACTED_TOKEN]('test_implementation', 'test-implementation.md', ...)` が呼び出される
  - `[REDACTED_TOKEN]('implementation', 'implementation.md', ...)` が呼び出される

#### UT-PHASE-004: review() が出力ファイル不在時に FAIL を返す

- **目的**: `review()` メソッドが `test-preparation.md` が存在しない場合に失敗結果を返すことを検証
- **前提条件**: `output/test-preparation.md` が存在しない
- **入力**: なし
- **期待結果**: `result.success === false`

#### UT-PHASE-005: review() が出力ファイル存在時にレビュープロンプトを実行する

- **目的**: `review()` メソッドが `test-preparation.md` が存在する場合にレビューエージェントを実行することを検証
- **前提条件**: `output/test-preparation.md` が存在する
- **入力**: なし（内部処理）
- **期待結果**:
  - レビュープロンプトがロードされる
  - エージェントが実行される
  - レビュー結果が解析される（PASS/FAIL 判定）

#### UT-PHASE-006: revise() が出力ファイル不在時に FAIL を返す

- **目的**: `revise()` メソッドが `test-preparation.md` が存在しない場合に失敗結果を返すことを検証
- **前提条件**: `output/test-preparation.md` が存在しない
- **入力**: `reviewFeedback: 'ランタイムのバージョンが不正です'`
- **期待結果**: `result.success === false`

#### UT-PHASE-007: revise() がレビューフィードバックを含むプロンプトでエージェントを実行する

- **目的**: `revise()` メソッドがレビューフィードバックをテンプレート変数に含めてエージェントを実行することを検証
- **前提条件**: `output/test-preparation.md` が存在する
- **入力**: `reviewFeedback: 'Python 3.11 が必要ですが 3.9 がインストールされています'`
- **期待
... (truncated)
```

## Turn 7: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '400,800p' .ai-workflow/issue-692/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
**テスト対象ファイル**: `src/phases/base-phase.ts`
**テストファイル**: 間接検証（`[REDACTED_TOKEN]` の動作確認）

#### UT-LOG-001: test_preparation のヘッダーパターンが定義されている

- **目的**: `[REDACTED_TOKEN]()` の `headerPatterns` に `test_preparation` パターンが追加されていることを検証
- **前提条件**: `base-phase.ts` が更新済み
- **入力**: `# テスト準備` または `# Test Preparation` で始まるログ
- **期待結果**: パターンがマッチし、コンテンツが抽出されること

#### UT-LOG-002: test_preparation の日本語ヘッダーにマッチする

- **目的**: 日本語ヘッダー「テスト準備」または「環境準備」にマッチすることを検証
- **前提条件**: ヘッダーパターン追加済み
- **入力**: `# テスト準備\n\n## セクション1\n内容...`
- **期待結果**: パターン `/^#+ (テスト準備|Test Preparation|環境準備|Environment Setup)/im` にマッチ

#### UT-LOG-003: test_preparation の英語ヘッダーにマッチする

- **目的**: 英語ヘッダー「Test Preparation」または「Environment Setup」にマッチすることを検証
- **前提条件**: ヘッダーパターン追加済み
- **入力**: `# Test Preparation\n\n## Section 1\nContent...`
- **期待結果**: パターンにマッチ

---

### 2.9 エージェント優先順位（FR-008）

**テスト対象ファイル**: `src/commands/execute/agent-setup.ts`
**テストファイル**: Unit テスト

#### UT-AGENT-001: [REDACTED_TOKEN] に test_preparation が codex-first で定義されている

- **目的**: `[REDACTED_TOKEN]['test_preparation']` が `'codex-first'` であることを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `[REDACTED_TOKEN]['test_preparation'] === 'codex-first'`

#### UT-AGENT-002: 既存フェーズのエージェント優先順位が変更されていない

- **目的**: `test_preparation` の追加により既存フェーズの優先順位が変更されていないことを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**:
  - `[REDACTED_TOKEN]['planning'] === 'claude-first'`
  - `[REDACTED_TOKEN]['implementation'] === 'codex-first'`
  - `[REDACTED_TOKEN]['testing'] === 'codex-first'`
  - （その他既存フェーズも変更なし）

#### UT-AGENT-003: [REDACTED_TOKEN] の全 PhaseName に対するエントリが存在する

- **目的**: 全 11 フェーズ分のエージェント優先順位マッピングが存在することを検証
- **前提条件**: `agent-setup.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `Object.keys([REDACTED_TOKEN]).length >= 11`、全 PhaseName のキーが存在

---

### 2.10 モデル最適化マッピング（FR-009）

**テスト対象ファイル**: `src/core/model-optimizer.ts`
**テストファイル**: Unit テスト

#### UT-MODEL-001: simple 難易度で test_preparation のマッピングが存在する

- **目的**: `[REDACTED_TOKEN]['simple']` に `test_preparation` のエントリが存在することを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `[REDACTED_TOKEN]['simple']['test_preparation']` が定義されている
- **詳細**: 全ステップ（execute/review/revise）が `[REDACTED_TOKEN]`（`sonnet/mini`）

#### UT-MODEL-002: moderate 難易度で test_preparation のマッピングが存在する

- **目的**: `[REDACTED_TOKEN]['moderate']` に `test_preparation` のエントリが存在し、testing と同等の設定であることを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `[REDACTED_TOKEN]['moderate']['test_preparation']` が定義されている
- **詳細**: execute = HIGH_QUALITY（opus/max）、review = LIGHTWEIGHT（sonnet/mini）、revise = HIGH_QUALITY（opus/max）

#### UT-MODEL-003: complex 難易度で test_preparation のマッピングが存在する

- **目的**: `[REDACTED_TOKEN]['complex']` に `test_preparation` のエントリが存在することを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: なし（定数参照）
- **期待結果**: `[REDACTED_TOKEN]['complex']['test_preparation']` が定義されている
- **詳細**: 全ステップが `[REDACTED_TOKEN]`（execute/revise = opus/max、review = sonnet/mini）

#### UT-MODEL-004: ModelOptimizer.resolveModel が test_preparation で正しいモデルを返す

- **目的**: `ModelOptimizer.resolveModel('test_preparation', step)` が難易度に応じた正しいモデルを返すことを検証
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: `phase: 'test_preparation'`, `step: 'execute'`, `difficultyLevel: 'moderate'`
- **期待結果**: `{ claudeModel: 'opus', codexModel: 'max' }`

#### UT-MODEL-005: ModelOptimizer.resolveModel の review ステップは常に lightweight

- **目的**: review ステップでは難易度に関係なく lightweight モデルが返されることを検証（既存ロジック）
- **前提条件**: `model-optimizer.ts` が更新済み
- **入力**: `phase: 'test_preparation'`, `step: 'review'`, `difficultyLevel: 'complex'`
- **期待結果**: `{ claudeModel: 'sonnet', codexModel: 'mini' }`

---

### 2.11 プロンプトファイル（FR-010）

**テスト対象ファイル**: `src/prompts/test_preparation/`（新規 6 ファイル）
**テストファイル**: Unit テスト

#### UT-PROMPT-001: 日本語 execute プロンプトファイルが存在する

-
... (truncated)
```

## Turn 8: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '800,1200p' .ai-workflow/issue-692/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
- **テスト手順**:
  1. `npm run lint` を実行する
- **期待結果**: コンパイルエラーなし

#### IT-BUILD-002: ビルドが成功する

- **目的**: プロジェクト全体のビルドが成功することを検証
- **テスト手順**:
  1. `npm run build` を実行する
- **期待結果**: ビルド成功

#### IT-BUILD-003: npm run validate が成功する

- **目的**: lint + test + build の統合検証が成功することを検証
- **テスト手順**:
  1. `npm run validate` を実行する
- **期待結果**: すべてのステップが成功

---

## 4. テストデータ

### 4.1 メタデータテストデータ

#### 全フェーズ完了状態のメタデータ

```typescript
const completedMetadata = {
  issue_number: '692',
  issue_url: 'https://github.com/test/repo/issues/692',
  issue_title: 'Add test_preparation phase',
  phases: {
    planning: { status: 'completed', completed_steps: ['execute', 'review'] },
    requirements: { status: 'completed', completed_steps: ['execute', 'review'] },
    design: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_scenario: { status: 'completed', completed_steps: ['execute', 'review'] },
    implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_preparation: { status: 'completed', completed_steps: ['execute', 'review'] },
    testing: { status: 'completed', completed_steps: ['execute', 'review'] },
    documentation: { status: 'completed', completed_steps: ['execute', 'review'] },
    report: { status: 'completed', completed_steps: ['execute', 'review'] },
    evaluation: { status: 'completed', completed_steps: ['execute', 'review'] },
  },
};
```

#### test_preparation 依存検証用メタデータ

```typescript
// test_implementation 完了、test_preparation 未開始
const depTestMetadata = {
  phases: {
    // ... 前フェーズは全て completed ...
    test_implementation: { status: 'completed', completed_steps: ['execute', 'review'] },
    test_preparation: { status: 'pending', completed_steps: [], current_step: null },
    testing: { status: 'pending', completed_steps: [], current_step: null },
    // ...
  },
};
```

### 4.2 テスト用ベースフェーズデータ

```typescript
const basePhase = {
  status: 'pending',
  completed_steps: [],
  current_step: null,
  started_at: null,
  completed_at: null,
  review_result: null,
  retry_count: 0,
  rollback_context: null,
};
```

### 4.3 フェーズ番号の期待値テーブル

| PhaseName | 変更前 | 変更後 | 変更の有無 |
|-----------|--------|--------|-----------|
| planning | '00' | '00' | なし |
| requirements | '01' | '01' | なし |
| design | '02' | '02' | なし |
| test_scenario | '03' | '03' | なし |
| implementation | '04' | '04' | なし |
| test_implementation | '05' | '05' | なし |
| test_preparation | — | '06' | **新規** |
| testing | '06' | '07' | **変更** |
| documentation | '07' | '08' | **変更** |
| report | '08' | '09' | **変更** |
| evaluation | '09' | '10' | **変更** |

### 4.4 プリセット期待値テーブル

| プリセット名 | 変更前 | 変更後 | 変更の有無 |
|-------------|--------|--------|-----------|
| review-requirements | `['planning', 'requirements']` | 同左 | なし |
| review-design | `['planning', 'requirements', 'design']` | 同左 | なし |
| [REDACTED_TOKEN] | `['planning', 'requirements', 'design', 'test_scenario']` | 同左 | なし |
| analysis-design | `['planning', 'requirements', 'design']` | 同左 | なし |
| prototype | `['planning', 'design', 'implementation', 'report']` | 同左 | なし |
| quick-fix | `['planning', 'implementation', 'documentation', 'report']` | 同左 | なし |
| implementation | `['planning', 'implementation', 'test_implementation', 'testing', 'documentation', 'report']` | `['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']` | **変更** |
| full-test | `['planning', 'test_scenario', 'test_implementation']` | 同左 | なし |
| testing | `['planning', 'test_implementation', 'testing']` | `['planning', 'test_implementation', 'test_preparation', 'testing']` | **変更** |
| finalize | `['planning', 'documentation', 'report', 'evaluation']` | 同左 | なし |

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

| 環境 | 要件 |
|------|------|
| Node.js | 20 以上 |
| テストフレームワーク | Jest |
| ファイルシステム | 実ファイルシステムアクセス（MetadataManager が実ファイルを使用） |
| 一時ディレクトリ | `os.tmpdir()` ま
... (truncated)
```

## Turn 9: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' .ai-workflow/issue-692/04_implementation/output/implementation.md"`
**ステータス**: completed (exit_code=0)

```text
# 実装完了レポート

## 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `src/types.ts` | 修正 | PhaseName に `test_preparation` を追加 |
| `src/commands/execute.ts` | 修正 | PHASE_ORDER に `test_preparation` を追加 |
| `src/commands/execute/agent-setup.ts` | 修正 | エージェント優先順位に `test_preparation` を追加 |
| `src/commands/execute/options-parser.ts` | 修正 | 有効フェーズに `test_preparation` を追加 |
| `src/commands/execute/workflow-executor.ts` | 修正 | 実行順序に `test_preparation` を追加 |
| `src/core/phase-dependencies.ts` | 修正 | 依存関係・プリセット・説明に `test_preparation` を反映 |
| `src/core/phase-factory.ts` | 修正 | `[REDACTED_TOKEN]` の生成分岐を追加 |
| `src/phases/base-phase.ts` | 修正 | フェーズ番号とログ抽出パターンを更新 |
| `src/commands/rollback.ts` | 修正 | フェーズ番号・有効フェーズ・テスト結果探索を更新 |
| `src/core/model-optimizer.ts` | 修正 | モデル最適化マッピングに `test_preparation` を追加 |
| `src/core/content-parser.ts` | 修正 | フェーズ番号マッピングを更新 |
| `src/core/helpers/metadata-io.ts` | 修正 | フェーズディレクトリと出力ファイルマップを更新 |
| `src/core/metadata-manager.ts` | 修正 | PHASE_ORDER に `test_preparation` を追加 |
| `src/commands/cleanup.ts` | 修正 | フェーズ範囲とディレクトリ番号を更新 |
| `src/phases/cleanup/artifact-cleaner.ts` | 修正 | クリーンアップ対象フェーズ番号を更新 |
| `src/commands/finalize.ts` | 修正 | 完了フェーズ一覧に `test_preparation` を追加 |
| `src/phases/report.ts` | 修正 | テスト結果・ドキュメントの参照パスを更新 |
| `src/phases/evaluation.ts` | 修正 | フェーズ成果物一覧に `test_preparation` を追加、番号を更新 |
| `src/phases/test-preparation.ts` | 新規 | テスト準備フェーズの実装を追加 |
| `src/prompts/test_preparation/ja/execute.txt` | 新規 | テスト準備の実行プロンプト（日本語） |
| `src/prompts/test_preparation/ja/review.txt` | 新規 | テスト準備のレビュープロンプト（日本語） |
| `src/prompts/test_preparation/ja/revise.txt` | 新規 | テスト準備の修正プロンプト（日本語） |
| `src/prompts/test_preparation/en/execute.txt` | 新規 | テスト準備の実行プロンプト（英語） |
| `src/prompts/test_preparation/en/review.txt` | 新規 | テスト準備のレビュープロンプト（英語） |
| `src/prompts/test_preparation/en/revise.txt` | 新規 | テスト準備の修正プロンプト（英語） |
| `src/prompts/planning/en/execute.txt` | 修正 | 追加フェーズを反映した計画テンプレートに更新 |
| `src/prompts/planning/ja/execute.txt` | 修正 | 追加フェーズを反映した計画テンプレートに更新 |
| `src/prompts/test_implementation/en/execute.txt` | 修正 | フェーズ番号・スキップ案内を更新 |
| `src/prompts/test_implementation/ja/execute.txt` | 修正 | フェーズ番号・スキップ案内を更新 |
| `src/prompts/test_implementation/en/revise.txt` | 修正 | フェーズ番号を更新 |
| `src/prompts/test_implementation/ja/revise.txt` | 修正 | フェーズ番号を更新 |
| `src/prompts/testing/en/execute.txt` | 修正 | 出力パスとフェーズ番号を更新 |
| `src/prompts/testing/ja/execute.txt` | 修正 | 出力パスとフェーズ番号を更新 |
| `src/prompts/testing/en/review.txt` | 修正 | Planningチェック対象フェーズ番号を更新 |
| `src/prompts/testing/ja/review.txt` | 修正 | Planningチェック対象フェーズ番号を更新 |
| `src/prompts/testing/en/revise.txt` | 修正 | 次フェーズ案内を更新 |
| `src/prompts/testing/ja/revise.txt` | 修正 | 次フェーズ案内を更新 |
| `src/prompts/documentation/en/execute.txt` | 修正 | 出力パスと品質ゲート番号を更新 |
| `src/prompts/documentation/ja/execute.txt` | 修正 | 出力パスと品質ゲート番号を更新 |
| `src/prompts/documentation/en/review.txt` | 修正 | Planningチェック対象フェーズ番号を更新 |
| `src/prompts/documentation/ja/review.txt` | 修正 | Planningチェック対象フェーズ番号を更新 |
| `src/prompts/report/en/execute.txt` | 修正 | 出力パスとフェーズ番号を更新 |
| `src/prompts/report/ja/execute.txt` | 修正 | 出力パスとフェーズ番号を更新 |
| `src/prompts/report/en/review.txt` | 修正 | フェーズ番号と品質ゲート番号を更新 |
| `src/prompts/report/ja/review.txt` | 修正 | フェーズ番号と品質ゲート番号を更新 |
| `src/prompts/report/en/revise.txt` | 修正 | 参照フェーズ番号を更新 |
| `src/prompts/report/ja/revise.txt` | 修正 | 参照フェーズ番号を更新 |
| `src/prompts/evaluation/en/execute.txt` | 修正 | 参照フェーズ番号と出力パスを更新 |
| `src/prompts/evaluation/ja/execute.txt` | 修正 | 参照フェーズ番号と出力パスを更新 |
| `src/prompts/evaluation/en/revise.txt` | 修正 | 出力パスを更新 |
| `src/prompts/evaluation/ja/revise.txt` | 修正 | 出力パスを更新 |
| `src/prompts/auto-issue/en/detect-enhancements.txt` | 修正 | Evaluation フェーズ番号を更新 |
| `src/prompts/auto-issue/ja/detect-enhancements.txt` | 修正 | Evaluation フェーズ番号を更新 |

## 主要な変更点

- `test_preparation` フェーズを追加し、実行・レビュー・修正フローとプロンプトを新規実装しました。
- フェーズ番号シフトに伴う依存関係、フェーズ順序、メタデータパス、クリーンアップ、ロールバック処理を一括で更新しました。
- 既存フェーズのプロンプトや出力パス表記を更新し、新しいフェーズ構成に整合させました。

## テスト実施状況
- ビルド: ❌ 失敗（未実施）
- リント: ❌ 失敗（未実施）
- 基本動作確認: 未実施
```

## Turn 10: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 11: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'ls tests/unit'`
**ステータス**: completed (exit_code=0)

```text
[REDACTED_TOKEN].test.ts
branch-validation.test.ts
claude-agent-client.test.ts
[REDACTED_TOKEN].test.ts
codex-agent-client.test.ts
commands
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
core
[REDACTED_TOKEN].test.ts
git
git-manager-issue16.test.ts
github
[REDACTED_TOKEN].test.ts
helpers
jenkins
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
metadata-manager.test.ts
phase-dependencies.test.ts
phases
pr-comment
prompts
report-cleanup.test.ts
[REDACTED_TOKEN].test.ts
secret-masker.test.ts
squash-manager.test.ts
step-management.test.ts
types
utils
validators
```

## Turn 12: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 13: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/commands/execute.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: execute コマンドモジュール
 *
 * テスト対象:
 * - resolvePresetName(): プリセット名解決（後方互換性対応）
 * - getPresetPhases(): プリセットのフェーズリスト取得
 * - canResumeWorkflow(): ワークフロー再開可否判定
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 *
 * 注意: [REDACTED_TOKEN]()のテストは統合テストで実施します。
 */

import { describe, test, expect } from '@jest/globals';
import { resolvePresetName, getPresetPhases } from '../../../src/commands/execute.js';
import * as executeModule from '../../../src/commands/execute.js';

// =============================================================================
// resolvePresetName() のテスト
// =============================================================================

describe('resolvePresetName', () => {
  describe('正常系: 標準プリセット名', () => {
    test('quick-fixプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'quick-fix';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('quick-fix');
      expect(result.warning).toBeUndefined();
    });

    test('review-requirementsプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'review-requirements';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('review-requirements');
      expect(result.warning).toBeUndefined();
    });

    test('implementationプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'implementation';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('implementation');
      expect(result.warning).toBeUndefined();
    });
  });

  describe('正常系: 非推奨プリセット名（後方互換性）', () => {
    test('requirements-onlyが新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = 'requirements-only';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('review-requirements');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('review-requirements');
    });

    test('design-phaseが新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = 'design-phase';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('review-design');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('review-design');
    });

    test('[REDACTED_TOKEN]が新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = '[REDACTED_TOKEN]';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('implementation');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('implementation');
    });
  });

  describe('異常系: 存在しないプリセット名', () => {
    test('存在しないプリセット名でエラーをスローする', () => {
      // Given: 存在しないプリセット名
      const presetName = 'non-existent-preset';

      // When & Then: エラーがスローされる
      expect(() => {
        resolvePresetName(presetName);
      }).toThrow();
    });

    test('空文字列でエラーをスローする', () => {
      // Given: 空文字列
      const presetName = '';

      // When & Then: エラーがスローされる
      expect(() => {
        resolvePresetName(presetName);
      }).toThrow();
    });
  });
});

// =============================================================================
// getPresetPhases() のテスト
// =============================================================================

describe('getPresetPhases', () => {
  describe('正常系: プリセットのフェーズリスト取得', () => {
    test('quick-
... (truncated)
```

## Turn 14: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '200,400p' tests/unit/commands/execute.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// エラーがスローされる場合もOK
        expect(error).toBeTruthy();
      }
    });
  });
});

// =============================================================================
// エージェントモード選択のテスト（統合テストで詳細確認）
// =============================================================================

describe('エージェントモード選択（統合テストで確認）', () => {
  test('エージェントモード選択は統合テストで検証される', () => {
    // Given: エージェントモード（auto / codex / claude）
    // When: [REDACTED_TOKEN]が実行される
    // Then: 正しいエージェントが選択される

    // この部分は統合テストで実施されるため、ここではマーカーのみ
    expect(true).toBe(true);
  });
});

// =============================================================================
// 型安全性の検証（Issue #45）
// =============================================================================

describe('型安全性の検証', () => {
  test('[REDACTED_TOKEN] 型が正しくインポートできる', () => {
    // Given: [REDACTED_TOKEN] 型を使用
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    type TestType = import('../../../src/types/commands.js').[REDACTED_TOKEN];

    // Then: コンパイルエラーが発生しない
    expect(true).toBe(true);
  });

  test('[REDACTED_TOKEN] が型安全な引数を受け入れる', () => {
    // Given: [REDACTED_TOKEN] 関数の型シグネチャ
    // When: 関数がエクスポートされている
    // Then: [REDACTED_TOKEN] 型を受け入れる

    // この検証はコンパイル時に実行されるため、ここではマーカーのみ
    expect(true).toBe(true);
  });
});

// =============================================================================
// ファサード実装の検証（Issue #46）
// =============================================================================

describe('ファサード実装の検証', () => {
  test('[REDACTED_TOKEN] が workflow-executor から再エクスポートされている', () => {
    // Given: execute.ts から [REDACTED_TOKEN] をインポート
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    const func = executeModule.[REDACTED_TOKEN];

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('executePhasesFrom が workflow-executor から再エクスポートされている', () => {
    // Given: execute.ts から executePhasesFrom をインポート
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    const func = executeModule.executePhasesFrom;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('createPhaseInstance が phase-factory から再エクスポートされている', () => {
    // Given: execute.ts から createPhaseInstance をインポート
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    const func = executeModule.createPhaseInstance;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('resolvePresetName がファサード内で保持されている', () => {
    // Given: execute.ts に resolvePresetName が定義されている
    // When: resolvePresetName をインポート
    const func = resolvePresetName;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('getPresetPhases がファサード内で保持されている', () => {
    // Given: execute.ts に getPresetPhases が定義されている
    // When: getPresetPhases をインポート
    const func = getPresetPhases;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('[REDACTED_TOKEN] がメインエントリーポイントとして利用可能', () => {
    // Given: execute.ts から [REDACTED_TOKEN] をインポート
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    const func = executeModule.[REDACTED_TOKEN];

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });
});

// =============================================================================
// モジュール分割後の後方互換性検証（Issue #46）
// =============================================================================

describe('モジュール分割後の後方互換性検証', () => {
  test('既存のインポート元（main.ts）から [REDACTED_TOKEN] が利用可能', () => {
    // Given: execute.ts から [REDACTED_TOKEN] をインポート
    // [REDACTED_TOKEN] @typescript-eslint/no-unused-vars
    const func = executeModule.[REDACTED_TOKEN];

    // Then: 関数として利用可能（後方互換性維持）
    expect(typeof func).toBe('function');
  });

  test('既存の公開API がすべて維持されている', () => {
    // Given: execute.ts の公開API
    expect(typeof executeModule.[REDACTED_TOKEN]).toBe('fu
... (truncated)
```

## Turn 15: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 16: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,240p' tests/unit/phase-dependencies.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: phase-dependencies.ts
 *
 * テスト対象:
 * - PHASE_PRESETS定義の正確性
 * - DEPRECATED_PRESETS後方互換性
 * - [REDACTED_TOKEN]関数
 * - buildErrorMessage関数
 * - buildWarningMessage関数
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
  PHASE_DEPENDENCIES,
  [REDACTED_TOKEN],
  [REDACTED_TOKEN],
} from '../../src/core/phase-dependencies.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { PhaseName, type PhaseStatus } from '../../src/types.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', '[REDACTED_TOKEN]');
const [REDACTED_TOKEN] = path.join(TEST_DIR, 'skip-phases');

/**
 * skipPhases 用のメタデータを作成
 */
function [REDACTED_TOKEN](statuses: Partial<Record<PhaseName, PhaseStatus>>): MetadataManager {
  fs.ensureDirSync([REDACTED_TOKEN]);
  const tempDir = fs.mkdtempSync(path.join([REDACTED_TOKEN], 'case-'));
  const metadataPath = path.join(tempDir, 'metadata.json');
  WorkflowState.createNew(metadataPath, '123', 'https://example.com/issues/123', 'Skip phases test');
  const manager = new MetadataManager(metadataPath);

  for (const [phase, status] of Object.entries(statuses)) {
    if (!status) {
      continue;
    }
    manager.updatePhaseStatus(phase as PhaseName, 'in_progress');
    manager.updatePhaseStatus(phase as PhaseName, status as PhaseStatus);
  }

  return manager;
}

describe('PHASE_PRESETS定義テスト', () => {
  test('1.1.1: 新規プリセット定義の正確性', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットを確認
    // Then: 正しいPhaseリストを持つ
    expect(PHASE_PRESETS['review-requirements']).toEqual(['planning', 'requirements']);
    expect(PHASE_PRESETS['review-design']).toEqual(['planning', 'requirements', 'design']);
    expect(PHASE_PRESETS['[REDACTED_TOKEN]']).toEqual(['planning', 'requirements', 'design', 'test_scenario']);
    expect(PHASE_PRESETS['analysis-design']).toEqual(['planning', 'requirements', 'design']);

    expect(PHASE_PRESETS['quick-fix']).toEqual(['planning', 'implementation', 'documentation', 'report']);
    expect(PHASE_PRESETS['implementation']).toEqual(['planning', 'implementation', 'test_implementation', 'testing', 'documentation', 'report']);

    expect(PHASE_PRESETS['full-test']).toEqual(['planning', 'test_scenario', 'test_implementation']);
    expect(PHASE_PRESETS['testing']).toEqual(['planning', 'test_implementation', 'testing']);

    expect(PHASE_PRESETS['finalize']).toEqual(['planning', 'documentation', 'report', 'evaluation']);
  });

  test('1.1.2: プリセット説明マップの存在確認', () => {
    // Given: PHASE_PRESETSの全キー
    // When: 各プリセット名に対する説明を確認
    // Then: 説明文字列が存在する
    for (const presetName of Object.keys(PHASE_PRESETS)) {
      expect(PRESET_DESCRIPTIONS[presetName]).toBeTruthy();
      expect(PRESET_DESCRIPTIONS[presetName].length > 0).toBeTruthy();
    }
  });

  test('1.1.3: すべてのプリセットにplanningが含まれる', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのフェーズリストを確認
    // Then: すべてのプリセットに'planning'が含まれ、先頭が'planning'である
    for (const phases of Object.values(PHASE_PRESETS)) {
      expect(phases).toContain('planning');
      expect(phases[0]).toBe('planning');
    }
  });

  test('1.1.4: すべてのプリセット説明がPlanningで始まる', () => {
    // Given: PRESET_DESCRIPTIONSが定義されている
    // When: 各プリセットの説明を確認
    // Then: すべての説明が'Planning +'で始まる
    for (const description of Object.values(PRESET_DESCRIPTIONS)) {
      expect(description.startsWith('Planning +')).toBe(true);
    }
  });

  test('1.1.5: プリセットと説明のキーが一致する', () => {
    // Given: PHASE_PRESETSとPRESET_DESCRIPTIONSが定義されている
    // When: 両方のキー集合を比較
    // Then: キーが完全に一致する
    const presetNames = Object.keys(PHASE_PRESETS).sort();
    const descriptionNames = Object.keys(PRESET_DESCRIPTIONS).sort();
... (truncated)
```

## Turn 17: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '240,480p' tests/unit/phase-dependencies.test.ts"`
**ステータス**: completed (exit_code=0)

```text
test('スキップ対象は依存関係から除外される', () => {
    // Given: requirements と design は完了、test_scenario は未完了
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
      design: 'completed',
    });

    // When: implementation の依存関係を skipPhases でフィルタ
    const result = [REDACTED_TOKEN]('implementation', manager, {
      skipPhases: ['test_scenario'],
    });

    // Then: test_scenario は無視され、バリデーションが成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
  });

  test('skipPhases が空配列の場合は通常の検証が行われる', () => {
    // Given: requirements のみ完了、design は未完了
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
    });

    // When: test_scenario の依存関係を skipPhases: [] で検証
    const result = [REDACTED_TOKEN]('test_scenario', manager, {
      skipPhases: [],
    });

    // Then: design 未完了のためエラー
    expect(result.valid).toBe(false);
    expect(result.missing_phases).toContain('design');
  });

  test('skipPhases と presetPhases が組み合わさって適用される', () => {
    // Given: 必須フェーズ requirements/design は完了済み
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
      design: 'completed',
    });

    // When: implementation で skipPhases と presetPhases を同時指定
    const result = [REDACTED_TOKEN]('implementation', manager, {
      skipPhases: ['test_scenario'],
      presetPhases: ['planning', 'requirements', 'design', 'implementation'],
    });

    // Then: 両方のフィルタが適用されて成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
  });

  test('全依存フェーズをスキップした場合は依存なしとして扱われる', () => {
    // Given: 初期状態（すべて pending）
    const manager = [REDACTED_TOKEN]({});

    // When: test_scenario の依存 requirements/design をすべてスキップ
    const result = [REDACTED_TOKEN]('test_scenario', manager, {
      skipPhases: ['requirements', 'design'],
    });

    // Then: 依存関係なし扱いで成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
  });

  test('複数フェーズスキップで後続フェーズの依存が解消される', () => {
    // Given: implementation まで完了済み、test_implementation は未完了
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
      design: 'completed',
      implementation: 'completed',
    });

    // When: testing フェーズの依存 test_implementation をスキップ
    const result = [REDACTED_TOKEN]('testing', manager, {
      skipPhases: ['test_implementation'],
    });

    // Then: スキップされた依存はチェックされず成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
  });
});

describe('PHASE_DEPENDENCIES定義の整合性', () => {
  test('全Phaseが定義されている', () => {
    // Given: 期待されるPhase名リスト
    const expectedPhases: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    // When: PHASE_DEPENDENCIESのキーを確認
    const actualPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];

    // Then: 全てのPhaseが定義されている
    for (const phase of expectedPhases) {
      expect(actualPhases.includes(phase)).toBeTruthy();
    }
  });

  test('循環依存が存在しない', () => {
    // Given: PHASE_DEPENDENCIESが定義されている
    // When: 各Phaseの依存関係を確認
    // Then: 循環依存が存在しない

    const visited = new Set<PhaseName>();
    const stack: PhaseName[] = [];

    function dfs(phase: PhaseName): boolean {
      if (stack.includes(phase)) {
        // 循環依存を検出
        return true;
      }

      if (visited.has(phase)) {
        return false;
      }

      visited.add(phase);
      stack.push(phase);

      const deps = PHASE_DEPENDENCIES[phase] || [];
      for (const dep of deps) {
        if (dfs(dep)) {
          return true;
        }
      }

      stack.pop();
      return false;
    }

    for (const phase of Object.keys(PHASE_DEPENDENCIES) as PhaseName[])
... (truncated)
```

## Turn 18: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 19: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'ls tests/unit/phases'`
**ステータス**: completed (exit_code=0)

```text
base-phase-fallback.test.ts
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
base-phase-template.test.ts
cleanup
context
core
[REDACTED_TOKEN].test.ts
formatters
helpers
lifecycle
```

## Turn 20: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 21: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'rg "[REDACTED_TOKEN]|test_implementation" tests/unit/phases -n'`
**ステータス**: failed (exit_code=127)

```text
/bin/bash: line 1: rg: command not found
```

## Turn 22: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 23: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -R \"[REDACTED_TOKEN]\\|test_implementation\" -n tests/unit/phases"`
**ステータス**: completed (exit_code=0)

```text
tests/unit/phases/cleanup/artifact-cleaner.test.ts:62:      '[REDACTED_TOKEN]',
tests/unit/phases/core/review-cycle-manager.test.ts:34:      test_implementation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
tests/unit/phases/evaluation-phase-helpers.test.ts:43:        test_implementation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
tests/unit/phases/formatters/progress-formatter.test.ts:25:    'test_implementation',
tests/unit/phases/lifecycle/phase-runner.test.ts:44:        test_implementation: { status: 'pending' },
tests/unit/phases/lifecycle/phase-runner.test.ts:59:        test_implementation: 'pending',
tests/unit/phases/lifecycle/phase-runner.test.ts:73:      test_implementation: 'pending',
tests/unit/phases/lifecycle/phase-runner.test.ts:667:    'test_implementation',
```

## Turn 24: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 25: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "test_preparation" -n tests'`
**ステータス**: failed (exit_code=1)

## Turn 26: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 27: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "PHASE_ORDER" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/commands/execute/workflow-executor.test.ts:100:// PHASE_ORDER 定義の検証
tests/unit/commands/execute/workflow-executor.test.ts:103:describe('PHASE_ORDER 定義の検証', () => {
tests/unit/commands/execute/workflow-executor.test.ts:104:  test('すべてのフェーズが PHASE_ORDER に含まれている（検証のみ）', () => {
tests/unit/commands/execute/workflow-executor.test.ts:125:      // executePhasesFrom は PHASE_ORDER に存在しないフェーズでエラーを返す
```

## Turn 28: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '80,180p' tests/unit/commands/execute/workflow-executor.test.ts"`
**ステータス**: completed (exit_code=0)

```text
expect(result.failedPhase).toBe('unknown_phase');
    expect(result.error).toBe('Unknown phase: unknown_phase');
  });

  test('空文字列のフェーズ名: ExecutionSummary が success: false を返す', async () => {
    // Given: 空文字列
    const startPhase: PhaseName = '' as PhaseName;
    const context = createMockContext();
    const gitManager = [REDACTED_TOKEN]();

    // When: フェーズを実行
    const result: ExecutionSummary = await executePhasesFrom(startPhase, context, gitManager);

    // Then: ExecutionSummary が success: false を返す
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown phase');
  });
});

// =============================================================================
// PHASE_ORDER 定義の検証
// =============================================================================

describe('PHASE_ORDER 定義の検証', () => {
  test('すべてのフェーズが PHASE_ORDER に含まれている（検証のみ）', () => {
    // Given: すべてのフェーズ名
    const allPhaseNames: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    const context = createMockContext();
    const gitManager = [REDACTED_TOKEN]();

    // When/Then: 各フェーズ名がバリデーションを通過することを確認（エラーなし）
    for (const phaseName of allPhaseNames) {
      // Note: ここでは実際に実行せず、バリデーションのみを確認
      // executePhasesFrom は PHASE_ORDER に存在しないフェーズでエラーを返す
      // 存在するフェーズは indexOf が -1 を返さないため、エラーにならない
      expect(['planning', 'requirements', 'design', 'test_scenario',
              'implementation', 'test_implementation', 'testing',
              'documentation', 'report', 'evaluation']).toContain(phaseName);
    }
  });
});
```

## Turn 29: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 30: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "test_implementation" -n tests | head'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/base-phase-refactored.test.ts:83:    test_implementation: [],
tests/integration/cleanup-command.test.ts:107:      test_implementation: {
tests/integration/cleanup-command.test.ts:237:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:283:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:321:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:377:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:426:    for (const phaseName of ['[REDACTED_TOKEN]', '06_testing', '07_documentation', '08_report']) {
tests/integration/cleanup-command.test.ts:468:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:523:      '[REDACTED_TOKEN]',
tests/integration/evaluation-phase-file-save.test.ts:72:        test_implementation: { status: 'completed', started_at: new Date().toISOString() },
```

## Turn 31: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 32: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 33: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "06_testing" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:238:      '06_testing',
tests/integration/cleanup-command.test.ts:284:      '06_testing',
tests/integration/cleanup-command.test.ts:322:      '06_testing',
tests/integration/cleanup-command.test.ts:378:      '06_testing',
tests/integration/cleanup-command.test.ts:426:    for (const phaseName of ['[REDACTED_TOKEN]', '06_testing', '07_documentation', '08_report']) {
tests/integration/cleanup-command.test.ts:469:      '06_testing',
tests/integration/cleanup-command.test.ts:524:      '06_testing',
tests/integration/phase-template-refactoring.test.ts:146:      jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');
tests/integration/phase-template-refactoring.test.ts:148:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:181:      jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');
tests/integration/phase-template-refactoring.test.ts:183:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:442:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:472:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:599:      jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');
tests/integration/phase-template-refactoring.test.ts:601:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:639:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:673:      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/phase-template-refactoring.test.ts:731:        const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
tests/integration/prompt-output-format.test.ts:138:  const outputPath = path.join(WORKFLOW_DIR, '06_testing', 'output', 'test-result.md');
tests/integration/prompt-output-format.test.ts:283:      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/06_testing/i);
tests/integration/prompt-output-format.test.ts:430:      const outputPath = path.join(WORKFLOW_DIR, '06_testing', 'output', 'test-result.md');
tests/unit/commands/rollback.test.ts:379:        reasonFile: '.ai-workflow/issue-49/06_testing/review/result.md'
tests/unit/commands/rollback.test.ts:395:      expect(markdown).toContain('@.ai-workflow/issue-49/06_testing/review/result.md');
tests/unit/core/metadata-manager-rollback.test.ts:158:        review_result: '@.ai-workflow/issue-49/06_testing/review/result.md',
tests/unit/core/metadata-manager-rollback.test.ts:256:        review_result_path: '.ai-workflow/issue-49/06_testing/review/result.md'
tests/unit/helpers/metadata-io.test.ts:189:      const reviewPath = path.resolve(workflowDir, '06_testing', 'review', 'result.md');
tests/unit/helpers/metadata-io.test.ts:202:      const reviewPath = path.resolve(workflowDir, '06_testing', 'review', 'result.md');
tests/unit/helpers/metadata-io.test.ts:203:      const legacyPath = path.resolve(workflowDir, '06_testing', 'output', 'test-result.md');
tests/unit/phases/cleanup/artifact-cleaner.test.ts:63:      '06_testing',
tests/unit/report-cleanup.test.ts:86:      '06_testing',
tests/unit/report-cleanup.test.ts:395:    const testingDir = path.join(baseDir, '06_testing');
```

## Turn 34: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 35: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "07_documentation" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:239:      '07_documentation',
tests/integration/cleanup-command.test.ts:285:      '07_documentation',
tests/integration/cleanup-command.test.ts:323:      '07_documentation',
tests/integration/cleanup-command.test.ts:379:      '07_documentation',
tests/integration/cleanup-command.test.ts:426:    for (const phaseName of ['[REDACTED_TOKEN]', '06_testing', '07_documentation', '08_report']) {
tests/integration/cleanup-command.test.ts:470:      '07_documentation',
tests/integration/cleanup-command.test.ts:525:      '07_documentation',
tests/integration/prompt-output-format.test.ts:173:    '07_documentation',
tests/integration/prompt-output-format.test.ts:284:      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/07_documentation/i);
tests/integration/prompt-output-format.test.ts:440:        '07_documentation',
tests/unit/phases/cleanup/artifact-cleaner.test.ts:64:      '07_documentation',
tests/unit/prompts/issue-207-prompt-simplification.test.ts:377:    const [REDACTED_TOKEN] = path.join(workflowDir, '07_documentation', 'output');
tests/unit/prompts/issue-207-prompt-simplification.test.ts:450:      expect(reviewPrompt).toMatch(/@\.ai-workflow\/issue-388\/07_documentation\/output\/documentation-update-log\.md/);
tests/unit/report-cleanup.test.ts:87:      '07_documentation',
```

## Turn 36: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 37: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "08_report" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:240:      '08_report',
tests/integration/cleanup-command.test.ts:286:      '08_report',
tests/integration/cleanup-command.test.ts:324:      '08_report',
tests/integration/cleanup-command.test.ts:380:      '08_report',
tests/integration/cleanup-command.test.ts:426:    for (const phaseName of ['[REDACTED_TOKEN]', '06_testing', '07_documentation', '08_report']) {
tests/integration/cleanup-command.test.ts:471:      '08_report',
tests/integration/cleanup-command.test.ts:526:      '08_report',
tests/integration/phases/fallback-mechanism.test.ts:437:      const executeDir = path.join(mockMetadata.workflowDir, '08_report', 'execute');
tests/integration/phases/fallback-mechanism.test.ts:463:      const outputFile = path.join(mockMetadata.workflowDir, '08_report', 'output', 'report.md');
tests/integration/prompt-output-format.test.ts:214:  const outputPath = path.join(WORKFLOW_DIR, '08_report', 'output', 'report.md');
tests/integration/prompt-output-format.test.ts:290:  const outputPath = path.join(WORKFLOW_DIR, '08_report', 'output', 'report.md');
tests/integration/prompt-output-format.test.ts:451:      const outputPath = path.join(WORKFLOW_DIR, '08_report', 'output', 'report.md');
tests/integration/workflow-init-cleanup.test.ts:507:      { name: '08_report', num: 8 },
tests/integration/workflow-init-cleanup.test.ts:540:    expect(await fs.pathExists(path.join(issueDir, '08_report', 'execute'))).toBe(false);
tests/integration/workflow-init-cleanup.test.ts:545:    expect(await fs.pathExists(path.join(issueDir, '08_report', 'output', 'output.md'))).toBe(true);
tests/unit/git-manager-issue16.test.ts:269:    const phaseDir = path.join(testRepoDir, '.ai-workflow', 'issue-16', '08_report');
tests/unit/git/commit-manager.test.ts:331:          { path: '.ai-workflow/issue-25/08_report/execute/agent_log.md', working_dir: 'M' },
tests/unit/git/commit-manager.test.ts:334:        modified: ['.ai-workflow/issue-25/08_report/execute/agent_log.md'],
tests/unit/phases/cleanup/artifact-cleaner.test.ts:65:      '08_report',
tests/unit/report-cleanup.test.ts:88:      '08_report',
```

## Turn 38: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 39: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "09_evaluation" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:527:      '09_evaluation',
tests/integration/evaluation-phase-file-save.test.ts:90:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:114:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:125:    const executeDir = path.join(workflowDir, '09_evaluation', 'execute');
tests/integration/evaluation-phase-file-save.test.ts:145:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:213:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:257:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:300:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:356:    const outputDir = path.join(workflowDir, '09_evaluation', 'output');
tests/integration/evaluation-phase-file-save.test.ts:360:    const expectedPath = path.join(tempDir, '.ai-workflow', 'issue-5', '09_evaluation', 'output', 'evaluation_report.md');
tests/integration/evaluation-phase-file-save.test.ts:365:    expect(path.dirname(evaluationFile)).toContain(path.join('09_evaluation', 'output'));
tests/integration/evaluation-phase-file-save.test.ts:371:    const executeDir = path.join(workflowDir, '09_evaluation', 'execute');
tests/integration/evaluation-phase-file-save.test.ts:375:    const expectedPath = path.join(tempDir, '.ai-workflow', 'issue-5', '09_evaluation', 'execute', 'agent_log.md');
tests/integration/evaluation-phase-file-save.test.ts:380:    expect(path.dirname(agentLogPath)).toContain(path.join('09_evaluation', 'execute'));
tests/integration/followup-issue-agent.test.ts:104:- Evaluation Report: \`.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md\`
tests/integration/followup-issue-agent.test.ts:168:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:232:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:269:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:306:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:339:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:393:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:440:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/followup-issue-agent.test.ts:485:        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/integration/workflow-init-cleanup.test.ts:368:    const evalDir = path.join(issueDir, '09_evaluation');
tests/unit/git-manager-issue16.test.ts:249:    const phaseDir = path.join(testRepoDir, '.ai-workflow', 'issue-16', '09_evaluation');
tests/unit/github/issue-agent-generator.test.ts:119:- Evaluation Report: \`.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md\`
tests/unit/github/issue-agent-generator.test.ts:128:    evaluationReportPath: '.ai-workflow/issue-999/09_evaluation/output/evaluation_report.md',
tests/unit/github/issue-agent-generator.test.ts:192:      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/unit/github/issue-agent-generator.test.ts:249:      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
tests/unit/github/issue-agent-generator.test.ts:304:      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/eva
... (truncated)
```

## Turn 40: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 41: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 42: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,240p' src/phases/test-preparation.ts"`
**ステータス**: completed (exit_code=0)

```text
import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type [REDACTED_TOKEN] } from './base-phase.js';
import { [REDACTED_TOKEN] } from '../types.js';

export class [REDACTED_TOKEN] extends BasePhase {
  constructor(params: [REDACTED_TOKEN]) {
    super({ ...params, phaseName: 'test_preparation' });
  }

  protected async execute(): Promise<[REDACTED_TOKEN]> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);

    const [REDACTED_TOKEN] = this.[REDACTED_TOKEN](
      'test_implementation',
      'test-implementation.md',
      'テストコード実装ログは利用できません。実装コードとリポジトリ構成から環境準備を行ってください。',
      issueNumber,
    );

    const [REDACTED_TOKEN] = this.[REDACTED_TOKEN](
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装内容を直接確認して環境準備を行ってください。',
      issueNumber,
    );

    return this.[REDACTED_TOKEN]('test-preparation.md', {
      planning_document_path: this.[REDACTED_TOKEN](issueNumber),
      test_implementation_context: [REDACTED_TOKEN],
      implementation_context: [REDACTED_TOKEN],
      issue_number: String(issueNumber),
    }, { maxTurns: 80, enableFallback: true });
  }

  protected async review(): Promise<[REDACTED_TOKEN]> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const testPreparationFile = path.join(this.outputDir, 'test-preparation.md');

    if (!fs.existsSync(testPreparationFile)) {
      return {
        success: false,
        error: 'test-preparation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const planningReference = this.[REDACTED_TOKEN](issueNumber);
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);
    const [REDACTED_TOKEN] = this.getPhaseOutputFile(
      'test_implementation',
      'test-implementation.md',
      issueNumber,
    );

    const [REDACTED_TOKEN] = this.[REDACTED_TOKEN](testPreparationFile);
    if (![REDACTED_TOKEN]) {
      return {
        success: false,
        error: 'Agent が test-preparation.md を参照できません。',
      };
    }

    let implementationReference: string;
    if (implementationFile) {
      const ref = this.[REDACTED_TOKEN](implementationFile);
      [REDACTED_TOKEN] = ref ?? '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
    } else {
      [REDACTED_TOKEN] = '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
    }

    let testImplementationReference: string;
    if ([REDACTED_TOKEN]) {
      const ref = this.[REDACTED_TOKEN]([REDACTED_TOKEN]);
      [REDACTED_TOKEN] = ref ?? 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';
    } else {
      [REDACTED_TOKEN] = 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';
    }

    const reviewPrompt = this.loadPrompt('review')
      .replace('{[REDACTED_TOKEN]}', planningReference)
      .replace('{[REDACTED_TOKEN]}', [REDACTED_TOKEN])
      .replace('{[REDACTED_TOKEN]}', [REDACTED_TOKEN])
      .replace('{[REDACTED_TOKEN]}', [REDACTED_TOKEN]);

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 30, logDir: this.reviewDir });
    const reviewResult = await this.contentParser.parseReviewResult(messages);

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, reviewResult.feedback, 'utf-8');

    await this.github.postReviewResult(
      issueNumber,
      this.phaseName,
      reviewResult.result,
      reviewResult.feedback,
      reviewResult.suggestions,
      this.metadata,
    );

    return {
      success: reviewResult.result !== 'FAIL',
      output: reviewResult.result,
      error: reviewResult.result === 'FAIL' ? reviewResult.feedback : undefined,
    };
  }

  public async revise(reviewFeedback: s
... (truncated)
```

## Turn 43: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 44: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/phases/base-phase-template.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * BasePhase.[REDACTED_TOKEN]() - プロンプトテンプレート実行のテスト (Issue #47)
 *
 * 目的: [REDACTED_TOKEN]() メソッドの動作を検証
 *
 * 重要: ESM環境でのテストのため、実ファイルシステムを使用する戦略を採用
 * - jest.unstable_mockModule()は使用しない（ESM immutable binding問題を回避）
 * - os.tmpdir()に実ディレクトリ構造を作成
 * - 実ファイルを作成・削除
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { BasePhase } from '../../../src/phases/base-phase.js';
import type { [REDACTED_TOKEN] } from '../../../src/types.js';

type [REDACTED_TOKEN] = {
  phaseName: string;
  workingDir: string;
  metadataManager: any;
  githubClient: any;
  skipDependencyCheck?: boolean;
};

class TestPhase extends BasePhase {
  constructor(params: [REDACTED_TOKEN]) {
    super(params);
  }

  public async [REDACTED_TOKEN]<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
  ): Promise<[REDACTED_TOKEN]> {
    return this.[REDACTED_TOKEN](phaseOutputFile, templateVariables, options);
  }

  protected async execute(): Promise<[REDACTED_TOKEN]> {
    return { success: true };
  }

  protected async review(): Promise<[REDACTED_TOKEN]> {
    return { success: true };
  }
}

describe('BasePhase.[REDACTED_TOKEN]() - Issue #47', () => {
  let testPhase: TestPhase;
  let mockMetadata: any;
  let mockGithub: any;
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;
  let testPromptsDir: string;

  beforeAll(() => {
    // Create real test directory structure (avoid ESM mocking issues)
    testRootDir = path.join(os.tmpdir(), '[REDACTED_TOKEN]-' + Date.now());
    testWorkingDir = path.join(testRootDir, 'workspace');
    testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-47');
    testPromptsDir = path.join(testRootDir, 'prompts');

    // Create prompts directory structure
    const [REDACTED_TOKEN] = path.join(testPromptsDir, 'requirements');
    fs.ensureDirSync([REDACTED_TOKEN]);
    fs.writeFileSync(
      path.join([REDACTED_TOKEN], 'execute.txt'),
      'Execute phase template: {var1} and {var2}',
      'utf-8'
    );
    fs.writeFileSync(
      path.join([REDACTED_TOKEN], 'review.txt'),
      'Review phase template',
      'utf-8'
    );
    fs.writeFileSync(
      path.join([REDACTED_TOKEN], 'revise.txt'),
      'Revise phase template',
      'utf-8'
    );

    // Create workflow directory structure
    const [REDACTED_TOKEN] = path.join(testWorkflowDir, '01_requirements', 'output');
    fs.ensureDirSync([REDACTED_TOKEN]);
  });

  afterAll(() => {
    // Cleanup test directory
    if (testRootDir && fs.existsSync(testRootDir)) {
      fs.removeSync(testRootDir);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: {
        issue_number: '47',
        target_repository: {
          path: testWorkingDir,
          repo: path.basename(testWorkingDir),
        },
      },
      updatePhaseStatus: jest.fn<any>(),
      getPhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      save: jest.fn<any>(),
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
    };

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };

    // TestPhase インスタンス作成（実パスを使用）
    testPhase = new TestPhase({
      phaseName: 'requirements',
      workingDir: testWorkingDir,
      metadataManager: mockMeta
... (truncated)
```

## Turn 45: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 46: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "model-optimizer" -n tests/unit/core'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/core/model-optimizer.test.ts:2:import { ModelOptimizer, [REDACTED_TOKEN] } from '../../../src/core/model-optimizer.js';
```

## Turn 47: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/core/model-optimizer.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ModelOptimizer, [REDACTED_TOKEN] } from '../../../src/core/model-optimizer.js';
import { logger } from '../../../src/utils/logger.js';

describe('ModelOptimizer', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  describe('default mapping', () => {
    it('returns lightweight models for simple execute step (TC-MO-001)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('planning', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns lightweight models for simple review step (TC-MO-002)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('implementation', 'review');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns high quality models for moderate planning execute (TC-MO-003)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('planning', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for moderate revise steps in code phases (TC-MO-004)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('implementation', 'revise');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns lightweight models for moderate documentation execute (TC-MO-005)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('documentation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns high quality models for complex execute steps (TC-MO-006)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('implementation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for complex revise steps (TC-MO-007)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('testing', 'revise');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('falls back to complex mapping for unknown difficulty', () => {
      // Given
      const optimizer = new ModelOptimizer('unknown' as any);

      // When
      const result = optimizer.resolveModel('design', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });
  });

  describe('review lightweight rule', () => {
    it('forces lightweight models for all phases at simple/moderate/complex (TC-MO-008/009/010)', () => {
      // Given
      const phases = ['planning', 'implementation', 'evaluation'] as const;
      const levels: Array<'simple' | 'moderate' | 'complex'> = ['simple', 'moderate', 'complex'];

      // Then
      for (const level of levels) {
        const optimizer = new ModelOptimizer(level);
        for (const phase of phases) {
          const result = optimizer.resolveModel(phase, 'review');
          expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
        }
      }
    });

    it('forces lightweight models even when overrides are provided (TC-MO-011)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');
... (truncated)
```

## Turn 48: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 49: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/commands/execute/agent-setup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: agent-setup モジュール
 *
 * テスト対象:
 * - [REDACTED_TOKEN](): 認証情報の解決（フォールバック処理）
 * - setupAgentClients(): Codex/Claude クライアントの初期化
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import type {
  AgentSetupResult,
  CredentialsResult,
  AgentPriority,
} from '../../../../src/commands/execute/agent-setup.js';
import { PhaseName } from '../../../../src/types.js';

// =============================================================================
// テストダブル定義
// =============================================================================

const [REDACTED_TOKEN] = jest.fn().mockImplementation(() => ({
  executeTask: jest.fn(),
}));

const [REDACTED_TOKEN] = jest.fn().mockImplementation(() => ({
  executeTask: jest.fn(),
}));

const [REDACTED_TOKEN] = jest.fn(() => ({
  authFilePath: null,
  candidates: [],
}));

let [REDACTED_TOKEN]!: typeof import('../../../../src/commands/execute/agent-setup.js')['[REDACTED_TOKEN]'];
let setupAgentClients!: typeof import('../../../../src/commands/execute/agent-setup.js')['setupAgentClients'];
let [REDACTED_TOKEN]!: typeof import('../../../../src/commands/execute/agent-setup.js')['[REDACTED_TOKEN]'];

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../src/core/codex-agent-client.js', async () => {
    const CODEX_MODEL_ALIASES = {
      max: 'gpt-5.1-codex-max',
      mini: 'gpt-5.1-codex-mini',
      '5.1': 'gpt-5.1',
      legacy: 'gpt-5-codex',
    };
    const DEFAULT_CODEX_MODEL = 'gpt-5.1-codex-max';

    function resolveCodexModel(modelOrAlias: string | undefined | null): string {
      if (!modelOrAlias || !modelOrAlias.trim()) {
        return DEFAULT_CODEX_MODEL;
      }
      const normalized = modelOrAlias.toLowerCase().trim();
      if (CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES]) {
        return CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES];
      }
      return modelOrAlias;
    }

    return {
      __esModule: true,
      CODEX_MODEL_ALIASES,
      DEFAULT_CODEX_MODEL,
      resolveCodexModel,
      CodexAgentClient: [REDACTED_TOKEN],
    };
  });

  await jest.unstable_mockModule('../../../../src/core/claude-agent-client.js', async () => {
    const [REDACTED_TOKEN] = {
      opus: 'claude-opus-4-6',
      sonnet: 'claude-sonnet-4-5',
      haiku: 'claude-haiku-4-5',
    };
    const [REDACTED_TOKEN] = 'claude-opus-4-6';

    function resolveClaudeModel(modelOrAlias: string | undefined | null): string {
      if (!modelOrAlias || !modelOrAlias.trim()) {
        return [REDACTED_TOKEN];
      }
      const normalized = modelOrAlias.toLowerCase().trim();
      if ([REDACTED_TOKEN][normalized as keyof typeof [REDACTED_TOKEN]]) {
        return [REDACTED_TOKEN][normalized as keyof typeof [REDACTED_TOKEN]];
      }
      return modelOrAlias;
    }

    return {
      __esModule: true,
      [REDACTED_TOKEN],
      [REDACTED_TOKEN],
      resolveClaudeModel,
      ClaudeAgentClient: [REDACTED_TOKEN],
    };
  });

  await jest.unstable_mockModule('../../../../src/core/helpers/codex-credentials.js', async () => {
    const [REDACTED_TOKEN] = 20;
    const isValidCodexApiKey = (apiKey: string | null | undefined): apiKey is string => {
      if (!apiKey) {
        return false;
      }
      return apiKey.trim().length >= [REDACTED_TOKEN];
    };

    return {
      __esModule: true,
      [REDACTED_TOKEN],
      isValidCodexApiKey,
      detectCodexCliAuth: [REDACTED_TOKEN],
    };
  });

  const module = await import('../../../../src/commands/execute/agent-setup.js');
  [REDACTED_TOKEN] = module.[REDACTED_TOKEN];
  setupAgentClients = module.setupAgentClients;
  [REDACTED_TOKEN] = module.[REDACTED_TOKEN];
});

import fs from 'fs-extra';
import path from 'node:path'
... (truncated)
```

## Turn 50: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 51: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "[REDACTED_TOKEN]" -n tests/unit/commands/execute/agent-setup.test.ts'`
**ステータス**: completed (exit_code=0)

```text
40:let [REDACTED_TOKEN]!: typeof import('../../../../src/commands/execute/agent-setup.js')['[REDACTED_TOKEN]'];
120:  [REDACTED_TOKEN] = module.[REDACTED_TOKEN];
821:// [REDACTED_TOKEN] マッピング（Issue #306）
824:describe('[REDACTED_TOKEN] - 正常系（Issue #306）', () => {
835:      expect([REDACTED_TOKEN][phaseName]).toBeDefined();
836:      expect(['codex-first', 'claude-first']).toContain([REDACTED_TOKEN][phaseName]);
854:      expect([REDACTED_TOKEN][phaseName]).toBe('claude-first');
868:      expect([REDACTED_TOKEN][phaseName]).toBe('codex-first');
873:    // Given: [REDACTED_TOKEN] マッピング
874:    const allPhases = Object.entries([REDACTED_TOKEN]);
887:describe('[REDACTED_TOKEN] - 型安全性（Issue #306）', () => {
889:    // Given: [REDACTED_TOKEN] 定数
899:    const actualPhases = Object.keys([REDACTED_TOKEN]) as PhaseName[];
906:    // Given: [REDACTED_TOKEN] マッピング
910:    for (const priority of Object.values([REDACTED_TOKEN])) {
```

## Turn 52: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '800,940p' tests/unit/commands/execute/agent-setup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
});

  test('claude モード時、環境変数は ClaudeAgentClient 内部で処理される', () => {
    // Given: claude モード
    const agentMode = 'claude';
    const workingDir = '/workspace/repo';
    const credentials: CredentialsResult = {
      codexApiKey: null,
      claudeCodeToken: 'test-claude-token',
      claudeCredentialsPath: null,
    };

    // When: エージェントを初期化
    setupAgentClients(agentMode, workingDir, credentials);

    // Then: ClaudeAgentClient が初期化される（環境変数は ClaudeAgentClient 内部で処理）
    expect([REDACTED_TOKEN]).toHaveBeenCalled();
  });
});

// =============================================================================
// [REDACTED_TOKEN] マッピング（Issue #306）
// =============================================================================

describe('[REDACTED_TOKEN] - 正常系（Issue #306）', () => {
  test('すべてのフェーズに優先順位が定義されている', () => {
    // Given: 全10フェーズのリスト
    const phaseNames: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    // When & Then: 各フェーズに対して優先順位が定義されている
    for (const phaseName of phaseNames) {
      expect([REDACTED_TOKEN][phaseName]).toBeDefined();
      expect(['codex-first', 'claude-first']).toContain([REDACTED_TOKEN][phaseName]);
    }
  });

  test('claude-first フェーズが正しく設定されている', () => {
    // Given: Claude Code優先のフェーズリスト
    const claudeFirstPhases: PhaseName[] = [
      'planning',          // 戦略立案、情報整理
      'requirements',      // 要件の構造化、分析
      'design',            // アーキテクチャ設計、ドキュメント作成
      'test_scenario',     // テストシナリオの設計・整理
      'documentation',     // ドキュメント作成
      'report',            // レポート作成、要約
      'evaluation',        // 評価、分析
    ];

    // When & Then: すべてのフェーズで 'claude-first' が返される
    for (const phaseName of claudeFirstPhases) {
      expect([REDACTED_TOKEN][phaseName]).toBe('claude-first');
    }
  });

  test('codex-first フェーズが正しく設定されている', () => {
    // Given: Codex優先のフェーズリスト
    const codexFirstPhases: PhaseName[] = [
      'implementation',        // 具体的なコード実装
      'test_implementation',   // テストコード生成
      'testing',               // テスト実行、デバッグ
    ];

    // When & Then: すべてのフェーズで 'codex-first' が返される
    for (const phaseName of codexFirstPhases) {
      expect([REDACTED_TOKEN][phaseName]).toBe('codex-first');
    }
  });

  test('claude-first フェーズは7つ、codex-first フェーズは3つ', () => {
    // Given: [REDACTED_TOKEN] マッピング
    const allPhases = Object.entries([REDACTED_TOKEN]);

    // When: 各優先順位をカウント
    const claudeFirstCount = allPhases.filter(([_, priority]) => priority === 'claude-first').length;
    const codexFirstCount = allPhases.filter(([_, priority]) => priority === 'codex-first').length;

    // Then: 期待どおりのカウント
    expect(claudeFirstCount).toBe(7);
    expect(codexFirstCount).toBe(3);
    expect(allPhases.length).toBe(10); // 全10フェーズ
  });
});

describe('[REDACTED_TOKEN] - 型安全性（Issue #306）', () => {
  test('Record<PhaseName, AgentPriority> 型として定義されている', () => {
    // Given: [REDACTED_TOKEN] 定数
    // When & Then: 型安全性はコンパイル時にチェックされる
    // ランタイムテストとしては、キーの網羅性を確認

    const expectedPhases: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    const actualPhases = Object.keys([REDACTED_TOKEN]) as PhaseName[];

    // すべてのフェーズがマッピングに含まれている
    expect(actualPhases.sort()).toEqual(expectedPhases.sort());
  });

  test('AgentPriority 型の値のみが含まれている', () => {
    // Given: [REDACTED_TOKEN] マッピング
    const validPriorities: AgentPriority[] = ['codex-first', 'claude-first'];

    // When & Then: すべての値が有効な AgentPriority である
    for (const priority of Object.values([REDACTED_TOKEN])) {
      expect(validPriorities).toContain(priority);
    }
  });
});
```

## Turn 53: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 54: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "[REDACTED_TOKEN]" -n src/commands/execute/agent-setup.ts'`
**ステータス**: completed (exit_code=0)

```text
45: * const priority = [REDACTED_TOKEN]['planning']; // 'claude-first'
46: * const priority = [REDACTED_TOKEN]['implementation']; // 'codex-first'
48:export const PHASE_AGENT_PRIORITY: Record<PhaseName, AgentPriority> = {
```

## Turn 55: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '40,90p' src/commands/execute/agent-setup.ts"`
**ステータス**: completed (exit_code=0)

```text
* |---------|-------------|------|
 * | claude-first | planning, requirements, design, test_scenario, documentation, report, evaluation | 情報整理・戦略立案・ドキュメント作成が得意 |
 * | codex-first | implementation, test_implementation, test_preparation, testing | 具体的なコード実装・テスト実行が得意 |
 *
 * @example
 * const priority = [REDACTED_TOKEN]['planning']; // 'claude-first'
 * const priority = [REDACTED_TOKEN]['implementation']; // 'codex-first'
 */
export const PHASE_AGENT_PRIORITY: Record<PhaseName, AgentPriority> = {
  planning: 'claude-first',
  requirements: 'claude-first',
  design: 'claude-first',
  test_scenario: 'claude-first',
  implementation: 'codex-first',
  test_implementation: 'codex-first',
  test_preparation: 'codex-first',
  testing: 'codex-first',
  documentation: 'claude-first',
  report: 'claude-first',
  evaluation: 'claude-first',
};

/**
 * API キーの最小文字数
 * OpenAI/Codex API キーは通常 40 文字以上
 */
/**
 * エージェント初期化結果
 */
export interface AgentSetupResult {
  /**
   * Codex エージェントクライアント（未初期化時は null）
   */
  codexClient: CodexAgentClient | null;

  /**
   * Claude エージェントクライアント（未初期化時は null）
   */
  claudeClient: ClaudeAgentClient | null;
}

/**
 * 認証情報解決結果
 */
export interface CredentialsResult {
  /**
   * Codex API キー（未設定時は null）
   */
  codexApiKey: string | null;

  /**
```

## Turn 56: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 57: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "[REDACTED_TOKEN]" -n tests/unit'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/phases/base-phase-fallback.test.ts:5: * - [REDACTED_TOKEN](): Log extraction with pattern matching
tests/unit/phases/base-phase-fallback.test.ts:39:    return this.[REDACTED_TOKEN](agentLog, phaseName);
tests/unit/phases/base-phase-fallback.test.ts:137:  describe('[REDACTED_TOKEN]()', () => {
```

## Turn 58: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '120,220p' tests/unit/phases/base-phase-fallback.test.ts"`
**ステータス**: completed (exit_code=0)

```text
workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGitHub,
    });
  });

  afterEach(() => {
    // Restore all mocks to prevent test interference
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Cleanup test directory
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  describe('[REDACTED_TOKEN]()', () => {
    describe('Planning Phase - Header pattern matching', () => {
      it('should extract content from log with Japanese header pattern', () => {
        // Given: Agent log contains valid planning document with Japanese header
        const agentLog = `
Some agent output...

# プロジェクト計画書 - Issue #113

## 1. Issue分析
複雑度: 中程度

## 2. 実装戦略判断
実装戦略: EXTEND
`;

        // When: Extracting content for planning phase
        const result = testPhase.[REDACTED_TOKEN](agentLog, 'planning');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('プロジェクト計画書');
        expect(result).toContain('## 1. Issue分析');
        expect(result).toContain('## 2. 実装戦略判断');
      });

      it('should extract content from log with English header pattern', () => {
        // Given: Agent log contains valid planning document with English header
        const agentLog = `
Agent log here...

# Project Planning - Issue #113

## 1. Issue Analysis
Complexity: Medium

## 2. Implementation Strategy
Strategy: EXTEND
`;

        // When: Extracting content for planning phase
        const result = testPhase.[REDACTED_TOKEN](agentLog, 'planning');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('Project Planning');
        expect(result).toContain('## 1. Issue Analysis');
      });
    });

    describe('Requirements Phase - Header pattern matching', () => {
      it('should extract content from log with Japanese header pattern', () => {
        // Given: Agent log contains valid requirements document
        const agentLog = `
Agent started...

# 要件定義書 - Issue #113

## 1. 概要
本要件定義書では...

## 2. 機能要件
FR-1: BasePhaseへの汎用フォールバック機構の実装
`;

        // When: Extracting content for requirements phase
        const result = testPhase.[REDACTED_TOKEN](agentLog, 'requirements');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('要件定義書');
        expect(result).toContain('## 1. 概要');
        expect(result).toContain('## 2. 機能要件');
      });
    });

    describe('No header found - Fallback to markdown sections', () => {
      it('should extract content when header is not found but multiple markdown sections exist', () => {
        // Given: Agent log without header but with multiple markdown sections
        const agentLog = `
Agent started...

## Section 1
Content here...
```

## Turn 59: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 60: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'ls tests/unit/prompts'`
**ステータス**: completed (exit_code=0)

```text
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
[REDACTED_TOKEN].test.ts
```

## Turn 61: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 62: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,220p' tests/unit/commands/rollback.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: rollback コマンドモジュール
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - [REDACTED_TOKEN]()
 * - loadRollbackReason()
 * - confirmRollback()
 * - [REDACTED_TOKEN]()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  [REDACTED_TOKEN],
  loadRollbackReason,
  [REDACTED_TOKEN],
  getPhaseNumber,
  [REDACTED_TOKEN],
} from '../../../src/commands/rollback.js';
import type { [REDACTED_TOKEN] } from '../../../src/types/commands.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { AgentExecutor } from '../../../src/phases/core/agent-executor.js';
import * as path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

describe('Rollback コマンド - バリデーション', () => {
  let metadataManager: MetadataManager;
  // ユニットテスト: プロジェクトルート配下のパスを使用（MetadataManagerが実ファイルシステムを使用するため）
  const testWorkflowDir = path.join(process.cwd(), '.ai-workflow', 'issue-90-unit');
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();

    // 実ファイルシステムを使用（MetadataManagerが実際のfs-extraを呼び出すため）
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const basePhase = {
      status: 'pending',
      completed_steps: [],
      current_step: null,
      started_at: null,
      completed_at: null,
      review_result: null,
      retry_count: 0,
      rollback_context: null,
    };

    const metadataData = {
      issue_number: '90',
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'planning',
      phases: {
        planning: { ...basePhase },
        requirements: { ...basePhase },
        design: { ...basePhase },
        test_scenario: { ...basePhase },
        implementation: { ...basePhase, status: 'completed', completed_steps: ['execute', 'review'] },
        test_implementation: { ...basePhase },
        testing: { ...basePhase },
        documentation: { ...basePhase },
        report: { ...basePhase },
        evaluation: { ...basePhase },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // UC-RC-01: [REDACTED_TOKEN]() - 有効なオプション
  // =============================================================================
  describe('UC-RC-01: [REDACTED_TOKEN]() - 有効なオプション', () => {
    test('有効なオプションでバリデーションが成功する', () => {
      // Given: 有効なオプション
      const options: [REDACTED_TOKEN] = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'Type definition missing...',
        toStep: 'revise'
      };

      // When & Then: バリデーションが成功する（例外がスローされない）
      expect(() => [REDACTED_TOKEN](options, metadataManager)).not.toThrow();
    });
  });

  // =============================================================================
  // UC-RC-02: [REDACTED_TOKEN]() - 無効なフェーズ名
  // =============================================================================
  describe('UC-RC-02: [REDACTED_TOKEN]() - 無効なフェーズ名', () => {
    test('無効なフェーズ名が指定された場合にエラーがスローされる', () => {
      // Given: 無効なフェーズ名
      const options: [REDACTED_TOKEN] = {
        issue: '49',
        toPhase: 'invalid-phase',
        reason: 'Test'
      };

      // When & Then: エラ
... (truncated)
```

## Turn 63: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 64: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/commands/rollback-auto.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: rollback auto コマンドモジュール
 * Issue #271: エージェントベースの自動ロールバック判定機能
 *
 * テスト対象:
 * - [REDACTED_TOKEN]()
 * - [REDACTED_TOKEN]()
 * - [REDACTED_TOKEN]() (統合テスト)
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  [REDACTED_TOKEN],
  [REDACTED_TOKEN],
  getPhaseNumber,
} from '../../../src/commands/rollback.js';
import type { RollbackDecision } from '../../../src/types/commands.js';
import { PhaseName, StepName } from '../../../src/types.js';

// =============================================================================
// JSON パース処理のテスト (UT-PARSE-001 ~ UT-PARSE-006)
// =============================================================================
describe('JSON パース処理 - [REDACTED_TOKEN]()', () => {
  // UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース
  describe('UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース', () => {
    test('Markdownコードブロック内のJSONを正しく抽出・パースできる', () => {
      // Given: Markdownコードブロック形式のエージェント出力
      const agentOutput = [
        'エージェントの分析結果は以下の通りです。',
        '',
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "テスト失敗の原因が実装にあります。",',
        '  "confidence": "high",',
        '  "analysis": "Testing Phaseで3件のテストが失敗しています。"',
        '}',
        '```',
      ];

      // When: [REDACTED_TOKEN]()を呼び出す
      const result = [REDACTED_TOKEN](agentOutput);

      // Then: 正しくパースされた RollbackDecision が返される
      expect(result.needs_rollback).toBe(true);
      expect(result.to_phase).toBe('implementation');
      expect(result.to_step).toBe('revise');
      expect(result.reason).toBe('テスト失敗の原因が実装にあります。');
      expect(result.confidence).toBe('high');
      expect(result.analysis).toBe('Testing Phaseで3件のテストが失敗しています。');
    });
  });

  // UT-PARSE-002: プレーンテキスト内のJSONを正常にパース
  describe('UT-PARSE-002: プレーンテキスト内のJSONを正常にパース', () => {
    test('Markdownコードブロックがない場合でも、プレーンテキスト内のJSONを抽出できる', () => {
      // Given: プレーンテキスト形式のエージェント出力
      const agentOutput = [
        '判断結果: {"needs_rollback": false, "reason": "差し戻し不要", "confidence": "high", "analysis": "全テスト成功"}',
      ];

      // When: [REDACTED_TOKEN]()を呼び出す
      const result = [REDACTED_TOKEN](agentOutput);

      // Then: 正しくパースされる
      expect(result.needs_rollback).toBe(false);
      expect(result.reason).toBe('差し戻し不要');
      expect(result.confidence).toBe('high');
      expect(result.analysis).toBe('全テスト成功');
    });
  });

  // UT-PARSE-003: JSON開始・終了探索パターンでパース
  describe('UT-PARSE-003: JSON開始・終了探索パターンでパース', () => {
    test('Markdownコードブロックもプレーンテキストパターンも失敗した場合、{ と } を探索してJSONを抽出できる', () => {
      // Given: 特殊な形式のエージェント出力
      const agentOutput = [
        '以下が判断結果です:',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "design",',
        '  "to_step": "revise",',
        '  "reason": "設計の不備があります。",',
        '  "confidence": "medium",',
        '  "analysis": "レビュー結果にBLOCKERが存在します。"',
        '}',
        'その他の情報...',
      ];

      // When: [REDACTED_TOKEN]()を呼び出す
      const result = [REDACTED_TOKEN](agentOutput);

      // Then: ブラケット検索により正しくパースされる
      expect(result.needs_rollback).toBe(true);
      expect(result.to_phase).toBe('design');
      expect(result.to_step).toBe('revise');
      expect(result.reason).toBe('設計の不備があります。');
      expect(result.confidence).toBe('medium');
      expect(result.analysis).toBe('レビュー結果にBLOCKERが存在します。');
    });
  });

  // UT-PARSE-004: JSON抽出失敗時のエラー
  describe('UT-PARSE-004: JSON抽出失敗時のエラー', () => {
    test('JSONが全く含まれていない出力に対して、適切なエラーメッセージを返す', () => {
      // Given: JSONを含まない出力
      const agentOutput = ['エージェントの応答にJSONが含まれていません。'];

      // When & Then: エラーがスローされる
      expect(() => [REDACTED_TOKEN](agentOutput)).toThrow(
        /Failed to parse RollbackDecision from agent response/
      );
    });
  });

  // UT-PA
... (truncated)
```

## Turn 65: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 66: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "getPhaseNumber" -n tests/unit/commands/rollback-auto.test.ts'`
**ステータス**: completed (exit_code=0)

```text
17:  getPhaseNumber,
406:describe('ヘルパー関数 - getPhaseNumber()', () => {
409:    expect(getPhaseNumber('planning')).toBe('00');
410:    expect(getPhaseNumber('requirements')).toBe('01');
411:    expect(getPhaseNumber('design')).toBe('02');
412:    expect(getPhaseNumber('test_scenario')).toBe('03');
413:    expect(getPhaseNumber('implementation')).toBe('04');
414:    expect(getPhaseNumber('test_implementation')).toBe('05');
415:    expect(getPhaseNumber('testing')).toBe('06');
416:    expect(getPhaseNumber('documentation')).toBe('07');
417:    expect(getPhaseNumber('report')).toBe('08');
418:    expect(getPhaseNumber('evaluation')).toBe('09');
```

## Turn 67: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 68: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 69: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "python - <<'PY'
import os
from pathlib import Path
root = Path('tests')
replacements = {
    '06_testing': '07_testing',
    '07_documentation': '08_documentation',
    '08_report': '09_report',
    '09_evaluation': '10_evaluation',
}
files = [p for p in root.rglob('*') if p.is_file()]
for p in files:
    text = p.read_text(encoding='utf-8')
    new = text
    for old, newv in replacements.items():
        new = new.replace(old, newv)
    if new "'!= text:
        p.write_text(new, encoding='"'utf-8')
PY"`
**ステータス**: failed (exit_code=127)

```text
/bin/bash: line 1: python: command not found
```

## Turn 70: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 71: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = require('path');
const replacements = {
  '06_testing': '07_testing',
  '07_documentation': '08_documentation',
  '08_report': '09_report',
  '09_evaluation': '10_evaluation',
};
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      let text = fs.readFileSync(full, 'utf8');
      let updated = text;
      for (const [oldStr, newStr] of Object.entries(replacements)) {
        updated = updated.split(oldStr).join(newStr);
      }
      if (updated "'!== text) fs.writeFileSync(full, updated, '"'utf8');
    }
  }
}
walk('tests');
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 72: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 73: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/integration/preset-execution.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * インテグレーションテスト: プリセット実行
 *
 * テスト対象:
 * - 各プリセットのPhaseリスト取得
 * - プリセット実行フローの検証
 * - 後方互換性の検証
 *
 * 注意: 実際のAgent実行は行わず、プリセット定義とPhase選択ロジックをテストします。
 * 完全なE2Eテストは手動実行が必要です。
 */

import { describe, test, expect } from '@jest/globals';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PHASE_DEPENDENCIES,
} from '../../src/core/phase-dependencies.js';
import { PhaseName } from '../../src/types.js';

/**
 * プリセット名からPhaseリストを取得する関数（main.tsのgetPresetPhasesと同等）
 */
function getPresetPhases(presetName: string): PhaseName[] {
  const phases = PHASE_PRESETS[presetName];
  if (!phases) {
    throw new Error(
      `Invalid preset: '${presetName}'. Available presets: ${Object.keys(PHASE_PRESETS).join(', ')}`
    );
  }
  return phases as PhaseName[];
}

describe('プリセット実行の統合テスト', () => {
  test('2.1.1: quick-fixプリセットのPhase構成', () => {
    // Given: quick-fixプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('quick-fix');

    // Then: 期待されるPhaseリストが返される
    expect(phases).toEqual(['planning', 'implementation', 'documentation', 'report']);
    expect(phases.length).toBe(4);
  });

  test('2.1.2: review-requirementsプリセットのPhase構成', () => {
    // Given: review-requirementsプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('review-requirements');

    // Then: 期待されるPhaseリストが返される
    expect(phases).toEqual(['planning', 'requirements']);
    expect(phases.length).toBe(2);
  });

  test('2.1.3: implementationプリセットのPhase構成', () => {
    // Given: implementationプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('implementation');

    // Then: 期待されるPhaseリストが返される（5つのPhase）
    expect(phases).toEqual([
      'planning',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
    ]);
    expect(phases.length).toBe(6);
  });

  test('2.1.4: testingプリセットのPhase構成', () => {
    // Given: testingプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('testing');

    // Then: 期待されるPhaseリストが返される
    expect(phases).toEqual(['planning', 'test_implementation', 'testing']);
    expect(phases.length).toBe(3);
  });

  test('2.1.5: finalizeプリセットのPhase構成', () => {
    // Given: finalizeプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('finalize');

    // Then: 期待されるPhaseリストが返される
    expect(phases).toEqual(['planning', 'documentation', 'report', 'evaluation']);
    expect(phases.length).toBe(4);
  });

  test('存在しないプリセット名でエラーが投げられる', () => {
    // Given: 存在しないプリセット名
    const invalidPresetName = 'non-existent-preset';

    // When/Then: エラーが投げられる
    expect(() => {
      getPresetPhases(invalidPresetName);
    }).toThrow(/Invalid preset/);
  });
});

describe('後方互換性の統合テスト', () => {
  test('2.4.1: 非推奨プリセット名（requirements-only）が新プリセット名に解決される', () => {
    // Given: 非推奨プリセット名
    const oldPresetName = 'requirements-only';

    // When: 新プリセット名を取得
    const newPresetName = DEPRECATED_PRESETS[oldPresetName];

    // Then: 正しい新プリセット名に解決される
    expect(newPresetName).toBe('review-requirements');

    // さらに新プリセット名のPhaseリストが取得できる
    const phases = getPresetPhases(newPresetName);
    expect(phases).toEqual(['planning', 'requirements']);
  });

  test('2.4.2: full-workflowプリセットが--phase allに解決される', () => {
    // Given: full-workflowプリセット名
    const oldPresetName = 'full-workflow';

    // When: 新プリセット名を取得
    const newPresetName = DEPRECATED_PRESETS[oldPresetName];

    // Then: --phase allに解決される
    expect(newPresetName).toBe('--phase all');
  });
});

describe('プリセットの依存関係整合性', () => {
  test('各プリセットのPhaseが有効な依存関係を持つ', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのPhaseリストを確認
    // Then: 全てのPhaseがPHASE_DEPENDENCIESに定義されている

    const validPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];

    for (const [presetName, phases] of Object.entries(PHASE_PRESETS)) {
      for (const phase of phases) {
        expect(validPhases.includes(phase as PhaseName)).toBe
... (truncated)
```

## Turn 74: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 75: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 76: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/phases/cleanup/artifact-cleaner.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: artifact-cleaner.ts
 *
 * テスト対象:
 * - ArtifactCleaner.[REDACTED_TOKEN]()
 * - ArtifactCleaner.cleanupWorkflowLogs()
 * - パス検証（セキュリティ）
 * - シンボリックリンクチェック（セキュリティ）
 * - 確認プロンプト
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { ArtifactCleaner } from '../../../../src/phases/cleanup/artifact-cleaner.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', '[REDACTED_TOKEN]');

// config.isCI() のモック
jest.mock('../../../../src/core/config.js', () => ({
  config: {
    isCI: jest.fn<any>().mockReturnValue(false), // デフォルトは非CI環境
  }
}));

import { config } from '../../../../src/core/config.js';

/**
 * モック MetadataManager を作成
 */
function [REDACTED_TOKEN](workflowDir: string): any {
  return {
    workflowDir, // .ai-workflow/issue-1
  };
}

describe('ArtifactCleaner - cleanupWorkflowLogs() 正常系', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-1');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
    delete process.env.CI;
  });

  test('UC-AC-01: cleanupWorkflowLogs() - phases 00-09 の execute/review/revise が削除され、metadata.json と output/*.md が保持される', async () => {
    // Given: phases 00-09 のディレクトリが存在する
    const phaseDirs = [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '07_testing',
      '08_documentation',
      '09_report',
      '10_evaluation',
    ];

    for (const phaseDir of phaseDirs) {
      const phasePath = path.join(testWorkflowDir, phaseDir);
      await fs.ensureDir(path.join(phasePath, 'execute'));
      await fs.ensureDir(path.join(phasePath, 'review'));
      await fs.ensureDir(path.join(phasePath, 'revise'));
      await fs.ensureDir(path.join(phasePath, 'output'));
      await fs.writeFile(path.join(phasePath, 'metadata.json'), '{}');
      await fs.writeFile(path.join(phasePath, 'output', 'phase.md'), '# Phase Output');
    }

    const mockMetadata = [REDACTED_TOKEN](testWorkflowDir);
    const artifactCleaner = new ArtifactCleaner(mockMetadata);

    // When: cleanupWorkflowLogs() を呼び出す
    await artifactCleaner.cleanupWorkflowLogs();

    // Then: execute/review/revise が削除され、metadata.json と output/*.md が保持される
    for (const phaseDir of phaseDirs) {
      const phasePath = path.join(testWorkflowDir, phaseDir);
      expect(fs.existsSync(path.join(phasePath, 'execute'))).toBe(false);
      expect(fs.existsSync(path.join(phasePath, 'review'))).toBe(false);
      expect(fs.existsSync(path.join(phasePath, 'revise'))).toBe(false);
      expect(fs.existsSync(path.join(phasePath, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(phasePath, 'output', 'phase.md'))).toBe(true);
    }
  }, 20000);

  test('UC-AC-02: cleanupWorkflowLogs() - 削除失敗時でもワークフローが継続される（WARNING ログのみ）', async () => {
    // Given: ディレクトリが存在しない（削除失敗をシミュレート）
    const mockMetadata = [REDACTED_TOKEN](testWorkflowDir);
    const artifactCleaner = new ArtifactCleaner(mockMetadata);

    // When: cleanupWorkflowLogs() を呼び出す
    await expect(artifactCleaner.cleanupWorkflowLogs()).resolves.not.toThrow();

    // Then: 例外がスローされない（ワークフロー継続）
  });
});

describe('ArtifactCleaner - [REDACTED_TOKEN]() 正常系', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-1');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
    delete process.env.CI;
  });
```

## Turn 77: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 78: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -R \"test_implementation', 'testing\" -n tests"`
**ステータス**: completed (exit_code=0)

```text
tests/integration/preset-execution.test.ts:78:    expect(phases).toEqual(['planning', 'test_implementation', 'testing']);
tests/integration/skip-phases.test.ts:116:    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'testing'];
tests/unit/commands/execute.test.ts:164:      expect(result).toEqual(['planning', 'implementation', 'test_implementation', 'testing', 'documentation', 'report']);
tests/unit/commands/execute/agent-setup.test.ts:829:      'implementation', 'test_implementation', 'testing',
tests/unit/commands/execute/agent-setup.test.ts:895:      'implementation', 'test_implementation', 'testing',
tests/unit/commands/execute/workflow-executor.test.ts:128:              'implementation', 'test_implementation', 'testing',
tests/unit/phase-dependencies.test.ts:63:    expect(PHASE_PRESETS['implementation']).toEqual(['planning', 'implementation', 'test_implementation', 'testing', 'documentation', 'report']);
tests/unit/phase-dependencies.test.ts:66:    expect(PHASE_PRESETS['testing']).toEqual(['planning', 'test_implementation', 'testing']);
```

## Turn 79: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 80: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = require('path');
const files = [];
(function walk(dir){
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full); else files.push(full);
  }
})('tests');
const replacements = [
  [\"test_implementation', 'testing\", \"test_implementation', 'test_preparation', 'testing\"],
  ['test_implementation\", \"testing', 'test_implementation\", \"test_preparation\", \"testing'],
  [\"test_implementation', 'testing',\", \"test_implementation', 'test_preparation', 'testing',\"],
  ['test_implementation\", \"testing\",', 'test_implementation\", \"test_preparation\", \"testing\",'],
];
for (const file of files) {
  let text = fs.readFileSync(file,'utf8');
  let updated = text;
  for (const [oldStr,newStr] of replacements) {
    updated = updated.split(oldStr).join(newStr);
  }
  if (updated "'!== text) fs.writeFileSync(file, updated, '"'utf8');
}
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 81: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 82: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -R \"planning', 'requirements', 'design', 'test_scenario'\" -n tests"`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:675:    expect(result).toEqual(['planning', 'requirements', 'design', 'test_scenario', 'implementation']);
tests/unit/commands/execute/agent-setup.test.ts:828:      'planning', 'requirements', 'design', 'test_scenario',
tests/unit/commands/execute/agent-setup.test.ts:894:      'planning', 'requirements', 'design', 'test_scenario',
tests/unit/commands/execute/workflow-executor.test.ts:127:      expect(['planning', 'requirements', 'design', 'test_scenario',
tests/unit/phase-dependencies.test.ts:59:    expect(PHASE_PRESETS['[REDACTED_TOKEN]']).toEqual(['planning', 'requirements', 'design', 'test_scenario']);
```

## Turn 83: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 84: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -R \"PhaseName\\[\\]\" -n tests | head"`
**ステータス**: completed (exit_code=0)

```text
tests/integration/preset-execution.test.ts:24:function getPresetPhases(presetName: string): PhaseName[] {
tests/integration/preset-execution.test.ts:31:  return phases as PhaseName[];
tests/integration/preset-execution.test.ts:137:    const validPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];
tests/integration/preset-execution.test.ts:154:      for (const phase of phases as PhaseName[]) {
tests/integration/preset-execution.test.ts:160:          if ((phases as PhaseName[]).includes(dep)) {
tests/integration/preset-workflow.test.ts:110:      const phases: PhaseName[] = ['planning', 'requirements', 'design'];
tests/integration/prompt-language-switching.test.ts:21:const allPhases: PhaseName[] = [
tests/integration/skip-phases.test.ts:41:function createTestContext(skipPhases?: PhaseName[]): {
tests/integration/skip-phases.test.ts:100:    const phases: PhaseName[] = ['documentation'];
tests/integration/skip-phases.test.ts:116:    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'test_preparation', 'testing'];
```

## Turn 85: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 86: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/integration/prompt-language-switching.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * Integration tests for language-based prompt loading (Issue #573)
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { BasePhase } from '../../src/phases/base-phase.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { config } from '../../src/core/config.js';
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { logger } from '../../src/utils/logger.js';
import { [REDACTED_TOKEN] } from '../../src/prompts/prompt-language-instructions.js';
import { DEFAULT_LANGUAGE, type [REDACTED_TOKEN], type PhaseName } from '../../src/types.js';

const promptsRoot = path.join(process.cwd(), 'src', 'prompts');
const languages: Array<'ja' | 'en'> = ['ja', 'en'];
const promptTypes: Array<'execute' | 'review' | 'revise'> = ['execute', 'review', 'revise'];
const allPhases: PhaseName[] = [
  'planning',
  'requirements',
  'design',
  'test_scenario',
  'implementation',
  'test_implementation',
  'testing',
  'documentation',
  'report',
  'evaluation',
];

const collectPromptFiles = (lang: 'en' | 'ja'): string[] => {
  const files: string[] = [];
  fs.readdirSync(promptsRoot).forEach((category) => {
    const langDir = path.join(promptsRoot, category, lang);
    if (!fs.existsSync(langDir) || !fs.statSync(langDir).isDirectory()) {
      return;
    }

    fs.readdirSync(langDir).forEach((file) => {
      if (file.endsWith('.txt')) {
        files.push(path.join(langDir, file));
      }
    });
  });
  return files;
};

class TestPhase extends BasePhase {
  constructor(params: any) {
    super(params);
  }

  public readPrompt(promptType: 'execute' | 'review' | 'revise'): string {
    return (this as any).loadPrompt(promptType);
  }

  protected async execute(): Promise<[REDACTED_TOKEN]> {
    return { success: true };
  }

  protected async review(): Promise<[REDACTED_TOKEN]> {
    return { success: true };
  }
}

describe('Prompt language switching integration', () => {
  let tempRoot: string;
  let workingDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;
  let github: any;
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let canInstallSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  const createPhase = (): TestPhase =>
    new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager,
      githubClient: github,
      skipDependencyCheck: true,
    });

  const createMetadata = (): void => {
    WorkflowState.createNew(metadataPath, '573', 'https://example.com/issues/573', 'Prompt test');
    const data = fs.readJsonSync(metadataPath);
    data.target_repository = {
      path: workingDir,
      repo: path.basename(workingDir),
    };
    fs.writeJsonSync(metadataPath, data, { spaces: 2 });
    metadataManager = new MetadataManager(metadataPath);
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), '[REDACTED_TOKEN]-'));
    workingDir = path.join(tempRoot, 'workspace');
    metadataPath = path.join(workingDir, '.ai-workflow', 'issue-573', 'metadata.json');
    github = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
      createOrUpdateProgressComment: jest.fn(),
    };

    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    canInstallSpy = jest.spyOn(config, '[REDACTED_TOKEN]').mockReturnValue(false);
    createMetadata();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
    if (fs.existsSync(tempRoot)) {
```

## Turn 87: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 88: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 89: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "implementationプリセット" -n -C 2 tests/unit/commands/execute.test.ts'`
**ステータス**: completed (exit_code=0)

```text
46-    });
47-
48:    test('implementationプリセットが正しく解決される', () => {
49-      // Given: 標準プリセット名
50-      const presetName = 'implementation';
--
154-    });
155-
156:    test('implementationプリセットのフェーズリストが正しく取得できる', () => {
157:      // Given: implementationプリセット名
158-      const presetName = 'implementation';
159-
```

## Turn 90: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '150,190p' tests/unit/commands/execute.test.ts"`
**ステータス**: completed (exit_code=0)

```text
const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'requirements']);
    });

    test('implementationプリセットのフェーズリストが正しく取得できる', () => {
      // Given: implementationプリセット名
      const presetName = 'implementation';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']);
    });

    test('analysis-designプリセットのフェーズリストが正しく取得できる', () => {
      // Given: analysis-designプリセット名
      const presetName = 'analysis-design';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'requirements', 'design']);
    });

    test('full-testプリセットのフェーズリストが正しく取得できる', () => {
      // Given: full-testプリセット名
      const presetName = 'full-test';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'test_scenario', 'test_implementation']);
    });
  });

  describe('異常系: 存在しないプリセット名', () => {
```

## Turn 91: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 92: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "testingプリセット" -n -C 2 tests/unit/commands/execute.test.ts'`
**ステータス**: failed (exit_code=1)

## Turn 93: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 94: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '40,90p' tests/unit/phase-dependencies.test.ts"`
**ステータス**: completed (exit_code=0)

```text
for (const [phase, status] of Object.entries(statuses)) {
    if (!status) {
      continue;
    }
    manager.updatePhaseStatus(phase as PhaseName, 'in_progress');
    manager.updatePhaseStatus(phase as PhaseName, status as PhaseStatus);
  }

  return manager;
}

describe('PHASE_PRESETS定義テスト', () => {
  test('1.1.1: 新規プリセット定義の正確性', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットを確認
    // Then: 正しいPhaseリストを持つ
    expect(PHASE_PRESETS['review-requirements']).toEqual(['planning', 'requirements']);
    expect(PHASE_PRESETS['review-design']).toEqual(['planning', 'requirements', 'design']);
    expect(PHASE_PRESETS['[REDACTED_TOKEN]']).toEqual(['planning', 'requirements', 'design', 'test_scenario']);
    expect(PHASE_PRESETS['analysis-design']).toEqual(['planning', 'requirements', 'design']);

    expect(PHASE_PRESETS['quick-fix']).toEqual(['planning', 'implementation', 'documentation', 'report']);
    expect(PHASE_PRESETS['implementation']).toEqual(['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']);

    expect(PHASE_PRESETS['full-test']).toEqual(['planning', 'test_scenario', 'test_implementation']);
    expect(PHASE_PRESETS['testing']).toEqual(['planning', 'test_implementation', 'test_preparation', 'testing']);

    expect(PHASE_PRESETS['finalize']).toEqual(['planning', 'documentation', 'report', 'evaluation']);
  });

  test('1.1.2: プリセット説明マップの存在確認', () => {
    // Given: PHASE_PRESETSの全キー
    // When: 各プリセット名に対する説明を確認
    // Then: 説明文字列が存在する
    for (const presetName of Object.keys(PHASE_PRESETS)) {
      expect(PRESET_DESCRIPTIONS[presetName]).toBeTruthy();
      expect(PRESET_DESCRIPTIONS[presetName].length > 0).toBeTruthy();
    }
  });

  test('1.1.3: すべてのプリセットにplanningが含まれる', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのフェーズリストを確認
    // Then: すべてのプリセットに'planning'が含まれ、先頭が'planning'である
    for (const phases of Object.values(PHASE_PRESETS)) {
      expect(phases).toContain('planning');
      expect(phases[0]).toBe('planning');
    }
  });
```

## Turn 95: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 96: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "06_testing" -n tests'`
**ステータス**: failed (exit_code=1)

## Turn 97: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 98: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "07_documentation" -n tests'`
**ステータス**: failed (exit_code=1)

## Turn 99: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 100: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "[REDACTED_TOKEN]" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:237:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:283:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:321:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:377:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:426:    for (const phaseName of ['[REDACTED_TOKEN]', '07_testing', '08_documentation', '09_report']) {
tests/integration/cleanup-command.test.ts:468:      '[REDACTED_TOKEN]',
tests/integration/cleanup-command.test.ts:523:      '[REDACTED_TOKEN]',
tests/integration/prompt-output-format.test.ts:85:    '[REDACTED_TOKEN]',
tests/integration/prompt-output-format.test.ts:282:      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/05_test_implementation/i);
tests/integration/prompt-output-format.test.ts:419:        '[REDACTED_TOKEN]',
tests/unit/phases/cleanup/artifact-cleaner.test.ts:62:      '[REDACTED_TOKEN]',
tests/unit/report-cleanup.test.ts:85:      '[REDACTED_TOKEN]',
```

## Turn 101: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 102: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 103: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,240p' tests/unit/core/metadata-manager-rollback.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: MetadataManager - 差し戻し機能
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - setRollbackContext()
 * - getRollbackContext()
 * - [REDACTED_TOKEN]()
 * - addRollbackHistory()
 * - [REDACTED_TOKEN]()
 * - [REDACTED_TOKEN]()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { RollbackContext, [REDACTED_TOKEN] } from '../../../src/types/commands.js';
import type { PhaseName } from '../../../src/types.js';
import * as path from 'node:path';
import fs from 'fs-extra';
import { MetadataManager } from '../../../src/core/metadata-manager.js';

const baseMetadata = {
  issue_number: '90',
  issue_url: '',
  issue_title: '',
  repository: null,
  target_repository: null,
  workflow_version: '1.0.0',
  current_phase: 'planning',
  design_decisions: {
    implementation_strategy: null,
    test_strategy: null,
    test_code_strategy: null,
  },
  cost_tracking: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
  },
  phases: {
    planning: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    requirements: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    design: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_scenario: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    test_implementation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    testing: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    documentation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    report: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
    },
    evaluation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
      decision: null,
      failed_phase: null,
      remaining_tasks: [],
      created_issue_url: null,
      abort_reason: null,
    },
  },
  created_at: '',
  updated_at: '',
};

describe('MetadataManager - Rollback機能', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = '/test/.ai-workflow/issue-90';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();

    // Use jest.spyOn() to mock fs-extra functions
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(baseMetadata) as any);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    metadataManager = new MetadataManager(testMetadataPath);

    // メタデータの初期化（実装フェーズが完了している状態）
    metadataManager.data.phases.implementation.status = 'completed';
    metadataManager.data.phases.implementation.completed_steps = ['execute', 'review', 'revise'];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // UC-MM-01: setRollbackContext() - 正常系
  // =============================================================================
  describe('UC-MM-01: setRollbackContext() - 正常系', () => {
    test('差し戻しコンテキストが正しく設定される', () => {
      // Given: 差し戻しコンテキスト
      const phaseName: PhaseName = 'implementation';
... (truncated)
```

## Turn 104: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 105: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 106: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 107: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 108: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "依存関係チェックテスト" -n -C 2 tests/unit/phase-dependencies.test.ts'`
**ステータス**: completed (exit_code=0)

```text
128-});
129-
130:describe('依存関係チェックテスト', () => {
131-  let metadataManager: MetadataManager;
132-  let testMetadataPath: string;
```

## Turn 109: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 110: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '180,260p' tests/unit/phase-dependencies.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// Given: 依存Phaseが未完了
    const freshMetadata = new MetadataManager(testMetadataPath);
    // metadataをリセット
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();
    freshMetadata.updatePhaseStatus('planning', 'pending');

    // When: implementation Phaseの依存関係をチェック
    const result = [REDACTED_TOKEN]('implementation', freshMetadata);

    // Then: エラーが返される
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error?.includes('[ERROR] Phase "implementation" requires the following phases to be completed')).toBeTruthy();
    expect(result.error?.includes('NOT COMPLETED')).toBeTruthy();
    expect(result.missing_phases && result.missing_phases.length > 0).toBeTruthy();
  });

  test('1.4.3: ignoreViolationsオプション使用時', () => {
    // Given: 依存Phaseが未完了だが、ignoreViolations=true
    const freshMetadata = new MetadataManager(testMetadataPath);
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();

    const options: [REDACTED_TOKEN] = {
      ignoreViolations: true,
    };

    // When: implementation Phaseの依存関係をチェック
    const result = [REDACTED_TOKEN]('implementation', freshMetadata, options);

    // Then: 警告のみで継続
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('[WARNING] Phase "implementation" has unmet dependencies')).toBeTruthy();
    expect(result.ignored).toBe(true);
    expect(result.missing_phases && result.missing_phases.length > 0).toBeTruthy();
  });

  test('1.4.5: skipCheckオプション使用時', () => {
    // Given: 全依存が未完了だが、skipCheck=true
    const freshMetadata = new MetadataManager(testMetadataPath);
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();

    const options: [REDACTED_TOKEN] = {
      skipCheck: true,
    };

    // When: implementation Phaseの依存関係をチェック
    const result = [REDACTED_TOKEN]('implementation', freshMetadata, options);

    // Then: チェックがスキップされる
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
    expect(result.missing_files?.length || 0).toBe(0);
  });
});

describe('skipPhases オプションの適用', () => {
  test('スキップ対象は依存関係から除外される', () => {
    // Given: requirements と design は完了、test_scenario は未完了
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
      design: 'completed',
    });

    // When: implementation の依存関係を skipPhases でフィルタ
    const result = [REDACTED_TOKEN]('implementation', manager, {
      skipPhases: ['test_scenario'],
    });

    // Then: test_scenario は無視され、バリデーションが成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
  });

  test('skipPhases が空配列の場合は通常の検証が行われる', () => {
    // Given: requirements のみ完了、design は未完了
    const manager = [REDACTED_TOKEN]({
      requirements: 'completed',
```

## Turn 111: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 112: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 113: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 114: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 115: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '100,150p' tests/unit/commands/execute/workflow-executor.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// PHASE_ORDER 定義の検証
// =============================================================================

describe('PHASE_ORDER 定義の検証', () => {
  test('すべてのフェーズが PHASE_ORDER に含まれている（検証のみ）', () => {
    // Given: すべてのフェーズ名
    const allPhaseNames: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    const context = createMockContext();
    const gitManager = [REDACTED_TOKEN]();

    // When/Then: 各フェーズ名がバリデーションを通過することを確認（エラーなし）
    for (const phaseName of allPhaseNames) {
      // Note: ここでは実際に実行せず、バリデーションのみを確認
      // executePhasesFrom は PHASE_ORDER に存在しないフェーズでエラーを返す
      // 存在するフェーズは indexOf が -1 を返さないため、エラーにならない
      expect(['planning', 'requirements', 'design', 'test_scenario',
              'implementation', 'test_implementation', 'test_preparation', 'testing',
              'documentation', 'report', 'evaluation']).toContain(phaseName);
    }
  });
});
```

## Turn 116: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 117: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 118: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 119: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 120: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '820,910p' tests/unit/commands/execute/agent-setup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// =============================================================================
// [REDACTED_TOKEN] マッピング（Issue #306）
// =============================================================================

describe('[REDACTED_TOKEN] - 正常系（Issue #306）', () => {
  test('すべてのフェーズに優先順位が定義されている', () => {
    // Given: 全10フェーズのリスト
    const phaseNames: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'test_preparation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    // When & Then: 各フェーズに対して優先順位が定義されている
    for (const phaseName of phaseNames) {
      expect([REDACTED_TOKEN][phaseName]).toBeDefined();
      expect(['codex-first', 'claude-first']).toContain([REDACTED_TOKEN][phaseName]);
    }
  });

  test('claude-first フェーズが正しく設定されている', () => {
    // Given: Claude Code優先のフェーズリスト
    const claudeFirstPhases: PhaseName[] = [
      'planning',          // 戦略立案、情報整理
      'requirements',      // 要件の構造化、分析
      'design',            // アーキテクチャ設計、ドキュメント作成
      'test_scenario',     // テストシナリオの設計・整理
      'documentation',     // ドキュメント作成
      'report',            // レポート作成、要約
      'evaluation',        // 評価、分析
    ];

    // When & Then: すべてのフェーズで 'claude-first' が返される
    for (const phaseName of claudeFirstPhases) {
      expect([REDACTED_TOKEN][phaseName]).toBe('claude-first');
    }
  });

  test('codex-first フェーズが正しく設定されている', () => {
    // Given: Codex優先のフェーズリスト
    const codexFirstPhases: PhaseName[] = [
      'implementation',        // 具体的なコード実装
      'test_implementation',   // テストコード生成
      'testing',               // テスト実行、デバッグ
    ];

    // When & Then: すべてのフェーズで 'codex-first' が返される
    for (const phaseName of codexFirstPhases) {
      expect([REDACTED_TOKEN][phaseName]).toBe('codex-first');
    }
  });

  test('claude-first フェーズは7つ、codex-first フェーズは3つ', () => {
    // Given: [REDACTED_TOKEN] マッピング
    const allPhases = Object.entries([REDACTED_TOKEN]);

    // When: 各優先順位をカウント
    const claudeFirstCount = allPhases.filter(([_, priority]) => priority === 'claude-first').length;
    const codexFirstCount = allPhases.filter(([_, priority]) => priority === 'codex-first').length;

    // Then: 期待どおりのカウント
    expect(claudeFirstCount).toBe(7);
    expect(codexFirstCount).toBe(3);
    expect(allPhases.length).toBe(10); // 全10フェーズ
  });
});

describe('[REDACTED_TOKEN] - 型安全性（Issue #306）', () => {
  test('Record<PhaseName, AgentPriority> 型として定義されている', () => {
    // Given: [REDACTED_TOKEN] 定数
    // When & Then: 型安全性はコンパイル時にチェックされる
    // ランタイムテストとしては、キーの網羅性を確認

    const expectedPhases: PhaseName[] = [
      'planning', 'requirements', 'design', 'test_scenario',
      'implementation', 'test_implementation', 'test_preparation', 'testing',
      'documentation', 'report', 'evaluation',
    ];

    const actualPhases = Object.keys([REDACTED_TOKEN]) as PhaseName[];

    // すべてのフェーズがマッピングに含まれている
    expect(actualPhases.sort()).toEqual(expectedPhases.sort());
  });

  test('AgentPriority 型の値のみが含まれている', () => {
    // Given: [REDACTED_TOKEN] マッピング
    const validPriorities: AgentPriority[] = ['codex-first', 'claude-first'];

    // When & Then: すべての値が有効な AgentPriority である
    for (const priority of Object.values([REDACTED_TOKEN])) {
```

## Turn 121: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 122: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 123: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 124: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n -C 3 src/core/model-optimizer.ts'`
**ステータス**: completed (exit_code=0)

```text
32-    test_scenario: config,
33-    implementation: config,
34-    test_implementation: config,
35:    test_preparation: config,
36-    testing: config,
37-    documentation: config,
38-    report: config,
--
72-    test_scenario: strategyPhaseConfig,
73-    implementation: codePhaseConfig,
74-    test_implementation: codePhaseConfig,
75:    test_preparation: codePhaseConfig,
76-    testing: codePhaseConfig,
77-    documentation: docPhaseConfig,
78-    report: docPhaseConfig,
--
94-    test_scenario: complexConfig,
95-    implementation: complexConfig,
96-    test_implementation: complexConfig,
97:    test_preparation: complexConfig,
98-    testing: complexConfig,
99-    documentation: complexConfig,
100-    report: complexConfig,
```

## Turn 125: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 126: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 127: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 128: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 129: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "getPhaseNumber" -n -A 20 tests/unit/commands/rollback-auto.test.ts'`
**ステータス**: completed (exit_code=0)

```text
17:  getPhaseNumber,
18-} from '../../../src/commands/rollback.js';
19-import type { RollbackDecision } from '../../../src/types/commands.js';
20-import { PhaseName, StepName } from '../../../src/types.js';
21-
22-// =============================================================================
23-// JSON パース処理のテスト (UT-PARSE-001 ~ UT-PARSE-006)
24-// =============================================================================
25-describe('JSON パース処理 - [REDACTED_TOKEN]()', () => {
26-  // UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース
27-  describe('UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース', () => {
28-    test('Markdownコードブロック内のJSONを正しく抽出・パースできる', () => {
29-      // Given: Markdownコードブロック形式のエージェント出力
30-      const agentOutput = [
31-        'エージェントの分析結果は以下の通りです。',
32-        '',
33-        '```json',
34-        '{',
35-        '  "needs_rollback": true,',
36-        '  "to_phase": "implementation",',
37-        '  "to_step": "revise",',
--
406:describe('ヘルパー関数 - getPhaseNumber()', () => {
407-  test('すべてのフェーズ名から正しいフェーズ番号が返される', () => {
408-    // Given & When & Then: 各フェーズ名に対応する番号が返される
409:    expect(getPhaseNumber('planning')).toBe('00');
410:    expect(getPhaseNumber('requirements')).toBe('01');
411:    expect(getPhaseNumber('design')).toBe('02');
412:    expect(getPhaseNumber('test_scenario')).toBe('03');
413:    expect(getPhaseNumber('implementation')).toBe('04');
414:    expect(getPhaseNumber('test_implementation')).toBe('05');
415:    expect(getPhaseNumber('testing')).toBe('06');
416:    expect(getPhaseNumber('documentation')).toBe('07');
417:    expect(getPhaseNumber('report')).toBe('08');
418:    expect(getPhaseNumber('evaluation')).toBe('09');
419-  });
420-});
```

## Turn 130: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 131: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 132: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 133: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 134: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 135: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 136: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 137: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/helpers/metadata-io.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
161:      const phaseName = '00_planning';
165:      const result = [REDACTED_TOKEN](phaseName as any, workflowDir);
175:      const phaseName = '01_requirements';
179:      const result = [REDACTED_TOKEN](phaseName as any, workflowDir);
```

## Turn 138: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 139: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 140: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 141: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '60,120p' tests/unit/report-cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// ReportPhaseのインスタンスを作成
    reportPhase = new ReportPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
  });

  test('1.1: execute/review/reviseディレクトリを正しく削除する', async () => {
    // Given: 各フェーズにexecute/review/reviseディレクトリが存在する
    const phaseDirectories = [
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '07_testing',
      '08_documentation',
      '09_report',
    ];

    const targetSubdirs = ['execute', 'review', 'revise'];
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);

    // テスト用のディレクトリ構造を作成
    for (const phaseDir of phaseDirectories) {
      const phasePath = path.join(baseDir, phaseDir);

      // execute/review/reviseディレクトリを作成
      for (const subdir of targetSubdirs) {
        const subdirPath = path.join(phasePath, subdir);
        await fs.ensureDir(subdirPath);

        // ダミーファイルを作成
        await fs.writeFile(
          path.join(subdirPath, 'agent_log.md'),
          '# Agent Log\n\nTest content'
        );
        await fs.writeFile(
          path.join(subdirPath, 'prompt.txt'),
          'Test prompt'
        );
      }

      // outputディレクトリとmetadata.jsonを作成（保持対象）
      const outputDir = path.join(phasePath, 'output');
      await fs.ensureDir(outputDir);
      await fs.writeFile(
        path.join(outputDir, 'output.md'),
        '# Output Document\n\nTest output'
      );
```

## Turn 142: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 143: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "testingDir" -n tests/unit/report-cleanup.test.ts'`
**ステータス**: completed (exit_code=0)

```text
395:    const testingDir = path.join(baseDir, '07_testing');
396:    const reviewDir = path.join(testingDir, 'review');
```

## Turn 144: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 145: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 146: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 147: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/integration/cleanup-command.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
55:    current_phase: 'report',
56:    phases: {
176:async function createWorkflowLogs(workflowDir: string, phaseNames: string[]): Promise<void> {
177:  for (const phaseName of phaseNames) {
178:    const phaseDir = path.join(workflowDir, phaseName);
179:    await fs.ensureDir(phaseDir);
183:      const stepDir = path.join(phaseDir, step);
187:      await fs.writeFile(path.join(stepDir, 'agent_log.md'), `# ${step} log for ${phaseName}`);
191:    const outputDir = path.join(phaseDir, 'output');
193:    await fs.writeFile(path.join(outputDir, 'result.md'), `# Result for ${phaseName}`);
```

## Turn 148: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 149: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '220,340p' tests/integration/cleanup-command.test.ts"`
**ステータス**: completed (exit_code=0)

```text
execSync('git config user.email "[REDACTED_EMAIL]"', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' });

    // メタデータを作成
    const metadata = [REDACTED_TOKEN]('123');
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });

    // MetadataManagerインスタンスを作成（実際のファイルを読み込む）
    metadataManager = new MetadataManager(metadataPath);

    // ワークフローログを作成（Phase 0-8）
    await createWorkflowLogs(workflowDir, [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '07_testing',
      '08_documentation',
      '09_report',
    ]);

    // 初期コミットを作成（ファイルをGit追跡下に置く）
    execSync('git add -A', { cwd: testDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' });
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // リファクタリング例：通常クリーンアップのテスト
  // ===========================================================================
  test('通常クリーンアップが正しく動作する', async () => {
    // Given: Phase 0-8のログが存在する状態
    const options: [REDACTED_TOKEN] = {
      issue: '123',
      dryRun: false,
    };

    // When: executeCleanup を実行（Gitコミットエラーは無視）
    try {
      await executeCleanup(options, metadataManager, workflowDir);
    } catch (error: any) {
      // Gitコミットエラーは許容（テスト環境特有の問題）
      if (!error.message?.includes('Cleanup commit failed')) {
        throw error;
      }
    }

    // Then: execute/review/revise ディレクトリが削除されている
    for (const phaseName of [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '07_testing',
      '08_documentation',
      '09_report',
    ]) {
      const phaseDir = path.join(workflowDir, phaseName);
      expect(await fs.pathExists(path.join(phaseDir, 'execute'))).toBe(false);
      expect(await fs.pathExists(path.join(phaseDir, 'review'))).toBe(false);
      expect(await fs.pathExists(path.join(phaseDir, 'revise'))).toBe(false);

      // output ディレクトリは保持されている
      expect(await fs.pathExists(path.join(phaseDir, 'output'))).toBe(true);
    }

    // metadata.json は保持されている
    expect(await fs.pathExists(metadataPath)).toBe(true);
  });

  // ===========================================================================
  // リファクタリング例：ドライランモードのテスト
  // ===========================================================================
  test('ドライランモードでプレビューのみ表示される', async () => {
    // Given: Phase 0-8のログが存在する状態
    const options: [REDACTED_TOKEN] = {
      issue: '123',
      dryRun: true,
    };

    // When: previewCleanup を実行
    await previewCleanup(options, metadataManager);

    // Then: ファイルは削除されていない
    for (const phaseName of [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '07_testing',
      '08_documentation',
      '09_report',
    ]) {
      const phaseDir = path.join(workflowDir, phaseName);
      expect(await fs.pathExists(path.join(phaseDir, 'execute'))).toBe(true);
      expect(await fs.pathExists(path.join(phaseDir, 'review'))).toBe(true);
      expect(await fs.pathExists(path.join(phaseDir, 'revise'))).toBe(true);
    }

    // Git コミットは実行されない（ドライランモードのため）
    // ファイルが削除されていないことで検証済み
  });
});

// =============================================================================
// テストスイート: 部分クリーンアップ（--phasesオプション）
// =============================================================================
```

## Turn 150: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 151: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = 'tests/integration/cleanup-command.test.ts';
let text = fs.readFileSync(path,'utf8');
text = text.replace(/'[REDACTED_TOKEN]'\\s*,\\s*\\n\\s*'07_testing'/g, \"'[REDACTED_TOKEN]',\\n      '06_test_preparation',\\n      '07_testing'\");
text = text.replace(/'[REDACTED_TOKEN]'\\s*,\\s*'07_testing'/g, \"'[REDACTED_TOKEN]', '06_test_preparation', '07_testing'\");
fs.writeFileSync(path, text, 'utf8');
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 152: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 153: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "[REDACTED_TOKEN]" -n tests/integration/cleanup-command.test.ts'`
**ステータス**: completed (exit_code=0)

```text
237:      '[REDACTED_TOKEN]',
284:      '[REDACTED_TOKEN]',
323:      '[REDACTED_TOKEN]',
380:      '[REDACTED_TOKEN]',
430:    for (const phaseName of ['[REDACTED_TOKEN]', '06_test_preparation', '07_testing', '08_documentation', '09_report']) {
472:      '[REDACTED_TOKEN]',
528:      '[REDACTED_TOKEN]',
```

## Turn 154: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 155: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '228,246p' tests/integration/cleanup-command.test.ts"`
**ステータス**: completed (exit_code=0)

```text
metadataManager = new MetadataManager(metadataPath);

    // ワークフローログを作成（Phase 0-8）
    await createWorkflowLogs(workflowDir, [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '06_test_preparation',
      '07_testing',
      '08_documentation',
      '09_report',
    ]);

    // 初期コミットを作成（ファイルをGit追跡下に置く）
    execSync('git add -A', { cwd: testDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' });
```

## Turn 156: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 157: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "Phase 0-8" -n tests/integration/cleanup-command.test.ts'`
**ステータス**: completed (exit_code=0)

```text
230:    // ワークフローログを作成（Phase 0-8）
261:    // Given: Phase 0-8のログが存在する状態
307:    // Given: Phase 0-8のログが存在する状態
373:    // ワークフローログを作成（Phase 0-8）
404:    // Given: Phase 0-8のログが存在する状態
442:    // Given: Phase 0-8のログが存在する状態
```

## Turn 158: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 159: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = 'tests/integration/cleanup-command.test.ts';
let text = fs.readFileSync(path,'utf8');
text = text.replace(/Phase 0-8/g, 'Phase 0-9');
fs.writeFileSync(path, text, 'utf8');
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 160: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 161: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '270,310p' tests/integration/cleanup-command.test.ts"`
**ステータス**: completed (exit_code=0)

```text
} catch (error: any) {
      // Gitコミットエラーは許容（テスト環境特有の問題）
      if (!error.message?.includes('Cleanup commit failed')) {
        throw error;
      }
    }

    // Then: execute/review/revise ディレクトリが削除されている
    for (const phaseName of [
      '00_planning',
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '[REDACTED_TOKEN]',
      '06_test_preparation',
      '07_testing',
      '08_documentation',
      '09_report',
    ]) {
      const phaseDir = path.join(workflowDir, phaseName);
      expect(await fs.pathExists(path.join(phaseDir, 'execute'))).toBe(false);
      expect(await fs.pathExists(path.join(phaseDir, 'review'))).toBe(false);
      expect(await fs.pathExists(path.join(phaseDir, 'revise'))).toBe(false);

      // output ディレクトリは保持されている
      expect(await fs.pathExists(path.join(phaseDir, 'output'))).toBe(true);
    }

    // metadata.json は保持されている
    expect(await fs.pathExists(metadataPath)).toBe(true);
  });

  // ===========================================================================
  // リファクタリング例：ドライランモードのテスト
  // ===========================================================================
  test('ドライランモードでプレビューのみ表示される', async () => {
    // Given: Phase 0-9のログが存在する状態
    const options: [REDACTED_TOKEN] = {
      issue: '123',
      dryRun: true,
```

## Turn 162: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 163: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '60,120p' tests/integration/prompt-output-format.test.ts"`
**ステータス**: completed (exit_code=0)

```text
}

      const content = fs.readFileSync(outputPath, 'utf-8');

      // 「主要な変更点」セクションを抽出
      const majorChangesMatch = content.match(
        /##\s*主要な変更点\s*\n([\s\S]*?)(?=\n##|$)/i
      );

      if (majorChangesMatch) {
        const majorChangesSection = majorChangesMatch[1];
        // 箇条書きの数をカウント（`-` または `*` で始まる行）
        const bulletPoints = majorChangesSection.match(/^\s*[-*]\s+/gm);
        if (bulletPoints) {
          expect(bulletPoints.length).[REDACTED_TOKEN](3);
          expect(bulletPoints.length).toBeLessThanOrEqual(5);
        }
      }
    }
  );
});

describe('Phase 5 (Test Implementation) Output Format Validation', () => {
  const outputPath = path.join(
    WORKFLOW_DIR,
    '[REDACTED_TOKEN]',
    'output',
    'test-implementation.md'
  );

  // IT-2: Phase 5（Test Implementation）出力フォーマット検証
  maybeTest(
    'should generate concise test-implementation.md',
    () => {
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');

      // 「テストファイル一覧」セクションが存在する
      expect(content).toContain('## テストファイル一覧');

      // テーブルフォーマット（`| ファイル | テスト数 | カバー対象 |`）が含まれる
      const hasTableFormat = /\|\s*ファイル\s*\|\s*テスト数\s*\|\s*カバー対象\s*\|/i.test(
        content
      );
      expect(hasTableFormat).toBe(true);

      // 「テストカバレッジ」セクションが数値サマリー形式で存在する
      expect(content).toContain('## テストカバレッジ');

      // 削除された詳細セクション（`## テストケース詳細`）が含まれない
      expect(content).not.toContain('## テストケース詳細');
    }
  );

  maybeTest(
    'should have numeric summary in test coverage section',
    () => {
      if (!fs.existsSync(outputPath)) {
        return;
      }
```

## Turn 164: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 165: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/integration/prompt-output-format.test.ts | head -n 20'`
**ステータス**: completed (exit_code=0)

```text
270:    'should reference all phase output files',
```

## Turn 166: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '240,320p' tests/integration/prompt-output-format.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// @references形式のパスが正しく記載されているか
      const hasReferencePath = /@\.ai-workflow\/issue-\d+/i.test(content);
      expect(hasReferencePath).toBe(true);

      // 削除された詳細再掲載セクションが含まれていないことを確認
      expect(content).not.toContain('## 要件定義サマリー');
      expect(content).not.toContain('## 設計サマリー');
      expect(content).not.toContain('## 実装サマリー');
      expect(content).not.toContain('## テスト実装サマリー');
      expect(content).not.toContain('## テスト結果サマリー');
      expect(content).not.toContain('## ドキュメント更新サマリー');
    }
  );

  maybeTest(
    'should have merge recommendation indicator',
    () => {
      if (!fs.existsSync(outputPath)) {
        return;
      }

      const content = fs.readFileSync(outputPath, 'utf-8');

      // マージ推奨の絵文字アイコン（✅ / ⚠️ / ❌）が記載されているか
      const hasMergeIndicator = /[✅⚠️❌]/.test(content);
      expect(hasMergeIndicator).toBe(true);
    }
  );

  maybeTest(
    'should reference all phase output files',
    () => {
      if (!fs.existsSync(outputPath)) {
        return;
      }

      const content = fs.readFileSync(outputPath, 'utf-8');

      // 各フェーズへの参照が含まれていることを確認
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/01_requirements/i);
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/02_design/i);
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/04_implementation/i);
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/05_test_implementation/i);
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/07_testing/i);
      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/08_documentation/i);
    }
  );
});

describe('Context Consumption Reduction Validation', () => {
  const outputPath = path.join(WORKFLOW_DIR, '09_report', 'output', 'report.md');

  // IT-8: コンテキスト消費量削減効果検証
  maybeTest(
    'should have reduced file size compared to baseline',
    () => {
      if (!fs.existsSync(outputPath)) {
        console.warn('Phase 8 output not found. Skipping context reduction test.');
        return;
      }

      const stats = fs.statSync(outputPath);
      const fileSize = stats.size;

      // 修正前のファイルサイズ（ベースライン）を仮定
      // Note: 実際のベースラインは、修正前のワークフロー実行結果から取得する必要がある
      // ここでは、一般的なレポートサイズとして50KBを仮定
      const baselineSize = 50000; // 50KB (仮)

      // ファイルサイズが記録されていることを確認（最低限のチェック）
      expect(fileSize).toBeGreaterThan(0);

      // 実際の削減率チェックは、ベースラインデータがある場合のみ実施
      console.log(`Current report.md size: ${fileSize} bytes`);
      console.log(`Baseline (assumed): ${baselineSize} bytes`);

      if (fileSize < baselineSize) {
        const reductionRate = (baselineSize - fileSize) / baselineSize;
        console.log(`Reduction rate: ${(reductionRate * 100).toFixed(2)}%`);

        // 期待される削減率: 30-50%
```

## Turn 167: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 168: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "[REDACTED_TOKEN]" -n tests/integration/prompt-output-format.test.ts'`
**ステータス**: completed (exit_code=0)

```text
85:    '[REDACTED_TOKEN]',
282:      expect(content).toMatch(/@\.ai-workflow\/issue-\d+\/05_test_implementation/i);
419:        '[REDACTED_TOKEN]',
```

## Turn 169: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 170: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '70,95p' tests/integration/prompt-output-format.test.ts"`
**ステータス**: completed (exit_code=0)

```text
const majorChangesSection = majorChangesMatch[1];
        // 箇条書きの数をカウント（`-` または `*` で始まる行）
        const bulletPoints = majorChangesSection.match(/^\s*[-*]\s+/gm);
        if (bulletPoints) {
          expect(bulletPoints.length).[REDACTED_TOKEN](3);
          expect(bulletPoints.length).toBeLessThanOrEqual(5);
        }
      }
    }
  );
});

describe('Phase 5 (Test Implementation) Output Format Validation', () => {
  const outputPath = path.join(
    WORKFLOW_DIR,
    '[REDACTED_TOKEN]',
    'output',
    'test-implementation.md'
  );

  // IT-2: Phase 5（Test Implementation）出力フォーマット検証
  maybeTest(
    'should generate concise test-implementation.md',
    () => {
      expect(fs.existsSync(outputPath)).toBe(true);
```

## Turn 171: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 172: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '400,460p' tests/integration/prompt-output-format.test.ts"`
**ステータス**: completed (exit_code=0)

```text
maybeTest(
    'Phase 4 output filename should not change',
    () => {
      const outputPath = path.join(
        WORKFLOW_DIR,
        '04_implementation',
        'output',
        'implementation.md'
      );
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 5 output filename should not change',
    () => {
      const outputPath = path.join(
        WORKFLOW_DIR,
        '[REDACTED_TOKEN]',
        'output',
        'test-implementation.md'
      );
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 6 output filename should not change',
    () => {
      const outputPath = path.join(WORKFLOW_DIR, '07_testing', 'output', 'test-result.md');
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 7 output filename should not change',
    () => {
      const outputPath = path.join(
        WORKFLOW_DIR,
        '08_documentation',
        'output',
        'documentation.md'
      );
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 8 output filename should not change',
    () => {
      const outputPath = path.join(WORKFLOW_DIR, '09_report', 'output', 'report.md');
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );
});
```

## Turn 173: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 174: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 175: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 176: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '410,435p' tests/integration/prompt-output-format.test.ts"`
**ステータス**: completed (exit_code=0)

```text
);
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 5 output filename should not change',
    () => {
      const outputPath = path.join(
        WORKFLOW_DIR,
        '[REDACTED_TOKEN]',
        'output',
        'test-implementation.md'
      );
      expect(fs.existsSync(outputPath)).toBe(true);
    }
  );

  maybeTest(
    'Phase 6 output filename should not change',
    () => {
      const outputPath = path.join(
        WORKFLOW_DIR,
        '06_test_preparation',
        'output',
        'test-preparation.md'
```

## Turn 177: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 178: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 179: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 180: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 181: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 182: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '90,140p' tests/integration/skip-phases.test.ts"`
**ステータス**: completed (exit_code=0)

```text
await Promise.all(tempDirs.map((dir) => fs.remove(dir)));
  });

  test('IT-001: 単一フェーズスキップ_ワークフロー実行', async () => {
    // Given: documentation をスキップ指定
    const { context, metadataManager, gitManager } = createTestContext(['documentation']);
    tempDirs.push(context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');
    const warnSpy = jest.spyOn(logger, 'warn');

    const phases: PhaseName[] = ['documentation'];

    // When: フェーズを順次実行
    const result = await [REDACTED_TOKEN](phases, context, gitManager);

    // Then: documentation はスキップされ、ステータスが記録される
    expect(result.success).toBe(true);
    expect(result.results.documentation?.success).toBe(true);
    expect(metadataManager.getPhaseStatus('documentation')).toBe('skipped');
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('Phases to skip'));
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('⏭️  Skipped: documentation'));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('IT-002: テスト関連フェーズスキップ_ワークフロー実行', async () => {
    // Given: テスト関連フェーズをまとめてスキップ
    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'test_preparation', 'testing'];
    const { context, metadataManager, gitManager } = createTestContext(skipTargets);
    tempDirs.push(context.workingDir);
    const infoSpy = jest.spyOn(logger, 'info');

    const phases: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    // When: フェーズを順次実行
    const result = await [REDACTED_TOKEN](phases, context, gitManager);

    // Then: スキップ対象だけが実行されず、他フェーズは run が呼ばれる
    expect(result.success).toBe(true);
    expect(metadataManager.getPhaseStatus('test_scenario')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('test_implementation')).toBe('skipped');
```

## Turn 183: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 184: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 185: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 186: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n tests/integration/skip-phases.test.ts'`
**ステータス**: completed (exit_code=0)

```text
116:    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'test_preparation', 'testing'];
128:      'test_preparation',
```

## Turn 187: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 188: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '130,190p' tests/integration/skip-phases.test.ts"`
**ステータス**: completed (exit_code=0)

```text
'documentation',
      'report',
      'evaluation',
    ];

    // When: フェーズを順次実行
    const result = await [REDACTED_TOKEN](phases, context, gitManager);

    // Then: スキップ対象だけが実行されず、他フェーズは run が呼ばれる
    expect(result.success).toBe(true);
    expect(metadataManager.getPhaseStatus('test_scenario')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('test_implementation')).toBe('skipped');
    expect(metadataManager.getPhaseStatus('testing')).toBe('skipped');
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('ℹ️  Phases to skip'));
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('⏭️  Skipped: test_scenario'));
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('⏭️  Skipped: test_implementation'));
    expect(infoSpy).[REDACTED_TOKEN](expect.stringContaining('⏭️  Skipped: testing'));
    expect(mockPhaseRuns.has('planning')).toBe(true);
    expect(mockPhaseRuns.has('requirements')).toBe(true);
    expect(mockPhaseRuns.has('design')).toBe(true);
    expect(mockPhaseRuns.has('implementation')).toBe(true);
    expect(mockPhaseRuns.has('documentation')).toBe(true);
    expect(mockPhaseRuns.has('report')).toBe(true);
    expect(mockPhaseRuns.has('evaluation')).toBe(true);
    expect(mockPhaseRuns.has('test_scenario')).toBe(false);
    expect(mockPhaseRuns.has('test_implementation')).toBe(false);
    expect(mockPhaseRuns.has('testing')).toBe(false);
  });

  test('IT-003: スキップフェーズ_メタデータ記録', async () => {
    // Given: testing, documentation をスキップ指定
    const { context, metadataManager, gitManager } = createTestContext(['testing', 'documentation']);
    tempDirs.push(context.workingDir);
    const phases: PhaseName[] = ['testing', 'documentation'];

    // When: フェーズを順次実行
    const result = await [REDACTED_TOKEN](phases, context, gitManager);
    const metadata = fs.readJsonSync(metadataManager.metadataPath);

    // Then: ステータスが skipped となり、タイムスタンプが記録される
    expect(result.success).toBe(true);
    expect(metadata.phases.testing.status).toBe('skipped');
    expect(metadata.phases.documentation.status).toBe('skipped');
    expect(metadata.phases.testing.completed_at).toBeTruthy();
    expect(metadata.phases.documentation.completed_at).toBeTruthy();
  });

  test('IT-004: 既存メタデータ_整合性維持', async () => {
    // Given: requirements/design は completed、documentation をスキップ
    const { context, metadataManager, gitManager } = createTestContext(['documentation']);
    tempDirs.push(context.workingDir);
    setPhaseStatuses(metadataManager, {
      requirements: 'completed',
      design: 'completed',
    });

    const phases: PhaseName[] = ['requirements', 'design', 'documentation'];

    // When: スキップ付きで実行
    const result = await [REDACTED_TOKEN](phases, context, gitManager);
```

## Turn 189: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 190: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 191: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 192: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 193: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 194: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '90,130p' tests/integration/preset-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
});

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterAll(async () => {
    // Clean up temporary directory after all tests
    const tmpDir = path.join(process.cwd(), 'tmp', 'preset-workflow');
    if (fs.existsSync(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });

  // =============================================================================
  // 3.1. preset `review-design` 正常実行シナリオ
  // =============================================================================
  describe('正常実行シナリオ', () => {
    // テストケース 3.1.1: 全フェーズが正常に完了
    test('should complete all phases with status "completed"', () => {
      // Given: preset `review-design` のフェーズ
      const phases: PhaseName[] = ['planning', 'requirements', 'design'];

      // When: 各フェーズを順番に実行（シミュレート）
      phases.forEach((phase) => {
        metadataManager.updatePhaseStatus(phase, 'in_progress');
        metadataManager.updatePhaseStatus(phase, 'completed');
      });

      // Then: すべてのフェーズが completed になる
      expect(metadataManager.getPhaseStatus('planning')).toBe('completed');
      expect(metadataManager.getPhaseStatus('requirements')).toBe('completed');
      expect(metadataManager.getPhaseStatus('design')).toBe('completed');
    });
  });

  // =============================================================================
  // 3.2. preset `review-design` でレビュー失敗シナリオ
  // =============================================================================
  describe('レビュー失敗シナリオ', () => {
    // テストケース 3.2.1: design フェーズでレビュー失敗、最大リトライ回数超過
    test('should update status to "failed" after max retries', () => {
```

## Turn 195: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 196: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n -C 3 src/phases/base-phase.ts'`
**ステータス**: completed (exit_code=0)

```text
673-      test_scenario: '03',
674-      implementation: '04',
675-      test_implementation: '05',
676:      test_preparation: '06',
677-      testing: '07',
678-      documentation: '08',
679-      report: '09',
--
848-      report: /^#+ (プロジェクトレポート|Project Report|レポート|Report)/im,
849-      // 以下は対象外（フォールバック機構を導入しないフェーズ）
850-      test_implementation: /^#+ (テスト実装|Test Implementation)/im,
851:      test_preparation: /^#+ (テスト準備|Test Preparation|環境準備|Environment Setup)/im,
852-      testing: /^#+ (テスト実行結果|Test Result)/im,
853-      documentation: /^#+ (ドキュメント更新ログ|Documentation Update Log)/im,
854-      evaluation: /^#+ (評価レポート|Evaluation Report)/im,
```

## Turn 197: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 198: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 199: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 200: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' src/prompts/test_preparation/ja/execute.txt"`
**ステータス**: completed (exit_code=0)

```text
# テスト準備フェーズ - 実行プロンプト

**重要: すべてのドキュメント内容を日本語で記述してください。すべてのセクション、説明、解説は日本語で書いてください。**

## タスク概要
テスト実行前に、対象リポジトリの環境を自動準備してください。

### このフェーズの目的
- 言語ランタイムのインストール
- 依存パッケージの解決
- テストフレームワークのセットアップ
- 実行環境の検証

## ⚠️ このフェーズが不要と判断した場合の対応（Issue #411）

**重要**: このIssueでテスト準備が不要と判断した場合でも、**必ずtest-preparation.mdファイルを作成**してください。
ファイルが作成されないと、ワークフローがエラーで停止します。

### スキップ判断の基準
以下のような場合、テスト準備をスキップすることが適切です：
- テスト実行が不要なIssue（ドキュメントのみ、設定のみ等）
- Phase 5でテストコード実装がスキップされた場合
- テスト対象の実装が存在しない場合

### スキップ時のファイル作成（必須）
スキップすると判断した場合、以下のテンプレートで必ずtest-preparation.mdを作成してください：

```markdown
# テスト準備

## スキップ判定
このIssueではテスト準備が不要と判断しました。

## 判定理由
- （具体的な理由を箇条書きで記載）
- 例: ドキュメント修正のみのため、テスト実行が不要
- 例: Phase 5でテストコード実装がスキップされたため、環境準備が不要

## 次フェーズへの推奨
Phase 7（Testing）もスキップを推奨します。
```

## 入力情報

### Planning Phase成果物
- Planning Document: {[REDACTED_TOKEN]}

**注意**: Planning Phaseが実行されている場合、開発計画（実装戦略、テスト戦略、リスク、スケジュール）を必ず確認してください。

### テスト実装ログ（利用可能な場合）
{[REDACTED_TOKEN]}
<!--
  存在する場合: @test-implementation.md への参照
  存在しない場合: "テストコード実装ログは利用できません。実装コードとリポジトリ構成から環境準備を行ってください。"
-->

### 実装ログ（利用可能な場合）
{[REDACTED_TOKEN]}
<!--
  存在する場合: @implementation.md への参照
  存在しない場合: "実装ログは利用できません。リポジトリの実装内容を直接確認して環境準備を行ってください。"
-->

## テスト準備の手順

### 1. 言語・フレームワークの検出
以下のファイルを確認し、対象言語を特定してください：
- Node.js: package.json
- Python: requirements.txt / pyproject.toml
- Go: go.mod
- Java: pom.xml / build.gradle
- Ruby: Gemfile
- Rust: Cargo.toml

### 2. 言語ランタイムのインストール
対象言語に応じて、必要なランタイムをインストールしてください：
- Python: `apt-get update && apt-get install -y python3 python3-pip`
- Go: `apt-get update && apt-get install -y golang-go`
- Java: `apt-get update && apt-get install -y default-jdk`
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
- Ruby: `apt-get update && apt-get install -y ruby ruby-dev`

### 3. 依存パッケージのインストール
マニフェストに応じて依存解決を行ってください：
- Python: `pip install -r requirements.txt`
- Node.js: `npm install` / `npm ci`
- Go: `go mod download`
- Ruby: `bundle install`
- Java: `mvn dependency:resolve` / `./gradlew dependencies`

### 4. テストフレームワークのセットアップ確認
以下のようにテストランナーが利用可能か確認してください：
- pytest: `pytest --version`
- Jest: `npx jest --version` / `npm test -- --help`
- Go test: `go test ./... -list .`
- JUnit: `mvn -q -DskipTests=false test -Dtest=DummyTest`（必要なら）

### 5. 環境検証
簡易的にテストが実行可能な状態であることを確認してください：
- 言語バージョンの確認（`python --version`, `node --version` など）
- テストコマンドのヘルプ表示（`npm test -- --help` など）

## 結果の記録

テスト準備結果を以下の形式で記録してください：

```markdown
# テスト準備

## 検出した言語・フレームワーク
- 言語: （例: Python 3.11）
- フレームワーク: （例: pytest）

## インストール・セットアップ結果
- ランタイム: （インストール結果）
- 依存パッケージ: （インストール結果）
- テストランナー: （確認結果）

## 検証結果
- バージョン確認: （結果）
```

## Turn 201: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 202: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "cat <<'EOF' > tests/unit/prompts/test-preparation-prompts.test.ts
/**
 * ユニットテスト: test_preparation プロンプト
 *
 * テスト対象:
 * - 日本語/英語の execute/review/revise プロンプトの存在
 * - 重要なテンプレート変数の埋め込み
 * - 言語指示の有無
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';

const PROMPTS_ROOT = path.join(process.cwd(), 'src', 'prompts', 'test_preparation');

const promptFiles = {
  ja: {
    execute: path.join(PROMPTS_ROOT, 'ja', 'execute.txt'),
    review: path.join(PROMPTS_ROOT, 'ja', 'review.txt'),
    revise: path.join(PROMPTS_ROOT, 'ja', 'revise.txt'),
  },
  en: {
    execute: path.join(PROMPTS_ROOT, 'en', 'execute.txt'),
    review: path.join(PROMPTS_ROOT, 'en', 'review.txt'),
    revise: path.join(PROMPTS_ROOT, 'en', 'revise.txt'),
  },
} as const;

describe('test_preparation プロンプトファイルの存在確認', () => {
  test('日本語プロンプト（execute/review/revise）が存在し、空でない', () => {
    const files = Object.values(promptFiles.ja);
    for (const filePath of files) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('英語プロンプト（execute/review/revise）が存在し、空でない', () => {
    const files = Object.values(promptFiles.en);
    for (const filePath of files) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('test_preparation 実行プロンプトのテンプレート変数', () => {
  test('日本語 execute プロンプトに必須テンプレート変数が含まれる', () => {
    const content = fs.readFileSync(promptFiles.ja.execute, 'utf-8');
    expect(content).toContain('{[REDACTED_TOKEN]}');
    expect(content).toContain('{[REDACTED_TOKEN]}');
    expect(content).toContain('{[REDACTED_TOKEN]}');
    expect(content).toContain('{issue_number}');
  });
});

describe('test_preparation プロンプトの言語指示', () => {
  test('日本語プロンプトに日本語出力指示が含まれる', () => {
    const content = fs.readFileSync(promptFiles.ja.execute, 'utf-8');
    expect(content).toMatch(/日本語/);
  });

  test('英語プロンプトに英語出力指示が含まれる', () => {
    const content = fs.readFileSync(promptFiles.en.execute, 'utf-8');
    expect(content).toMatch(/English/i);
  });
});
EOF
"`
**ステータス**: completed (exit_code=0)

## Turn 203: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 204: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "English" -n src/prompts/test_preparation/en/execute.txt'`
**ステータス**: completed (exit_code=0)

```text
3:**Important: Write all document content in English. All sections, descriptions, and explanations must be written in English.**
```

## Turn 205: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 206: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "issue_number" -n src/prompts/test_preparation/ja/execute.txt'`
**ステータス**: completed (exit_code=0)

```text
127:このログを `.ai-workflow/issue-{issue_number}/06_test_preparation/output/test-preparation.md` として保存してください。
```

## Turn 207: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 208: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "testing" -n tests/unit/phases/base-phase-output-path.test.ts | head'`
**ステータス**: completed (exit_code=0)

## Turn 209: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/phases/base-phase-output-path.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { BasePhase } from '../../../src/phases/base-phase.js';

function injectOutput(prompt: string, outputPath: string): string {
  const phase = Object.create(BasePhase.prototype);
  return (phase as any).[REDACTED_TOKEN](prompt, outputPath);
}

describe('BasePhase output path injection (Issue #603)', () => {
  test('TC-U-603-020: execute prompt includes absolute output path block', () => {
    const repoPath = '/tmp/ai-workflow-repos/sd-platform-development';
    const outputPath = path.join(
      repoPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const prompt = '# Execute\nWrite the requirements.';

    const injected = injectOutput(prompt, outputPath);

    expect(injected).toContain('**IMPORTANT: Output File Path**');
    expect(injected).toContain(outputPath);
    expect(injected).toContain('Write tool');
    // Instruction is placed immediately after the first heading
    const lines = injected.split('\n');
    expect(lines[0]).toBe('# Execute');
    expect(lines[2]).toContain('Output File Path');
  });

  test('TC-U-603-021: prompt warns against relative and /workspace paths', () => {
    const injected = injectOutput('# Execute\ncontent', '/tmp/repo/.ai-workflow/issue-1/output/file.md');

    expect(injected).toContain('Do NOT use relative paths');
    expect(injected).toContain('/workspace');
  });

  test('TC-U-603-022: injection supports multiple phases and paths', () => {
    const phases = [
      {
        name: 'requirements',
        path: '/tmp/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md',
      },
      {
        name: 'design',
        path: '/tmp/repo/.ai-workflow/issue-1/02_design/output/design.md',
      },
      {
        name: 'test_scenario',
        path: '/tmp/repo/.ai-workflow/issue-1/03_test_scenario/output/test-scenario.md',
      },
    ];

    phases.forEach(({ name, path: outputPath }) => {
      const prompt = `# ${name}\nDetails`;
      const injected = injectOutput(prompt, outputPath);

      expect(injected).toContain(outputPath);
      expect(injected).toContain('Output File Path');
      expect(injected.startsWith(`# ${name}`)).toBe(true);
    });
  });
});
```

## Turn 210: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 211: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "getPhaseNumber" -n tests/unit/commands/rollback.test.ts'`
**ステータス**: completed (exit_code=0)

```text
19:  getPhaseNumber,
427:  // getPhaseNumber() のテスト
429:  describe('getPhaseNumber()', () => {
432:      expect(getPhaseNumber('planning')).toBe('00');
433:      expect(getPhaseNumber('requirements')).toBe('01');
434:      expect(getPhaseNumber('design')).toBe('02');
435:      expect(getPhaseNumber('test_scenario')).toBe('03');
436:      expect(getPhaseNumber('implementation')).toBe('04');
437:      expect(getPhaseNumber('test_implementation')).toBe('05');
438:      expect(getPhaseNumber('testing')).toBe('06');
439:      expect(getPhaseNumber('documentation')).toBe('07');
440:      expect(getPhaseNumber('report')).toBe('08');
441:      expect(getPhaseNumber('evaluation')).toBe('09');
```

## Turn 212: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 213: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 214: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '420,450p' tests/unit/commands/rollback.test.ts"`
**ステータス**: completed (exit_code=0)

```text
expect(markdown).not.toContain('参照ドキュメント');
    });
  });
});

describe('Rollback コマンド - ヘルパー関数', () => {
  // =============================================================================
  // getPhaseNumber() のテスト
  // =============================================================================
  describe('getPhaseNumber()', () => {
    test('フェーズ名から正しいフェーズ番号が返される', () => {
      // Then: 各フェーズ名に対応する番号が返される
      expect(getPhaseNumber('planning')).toBe('00');
      expect(getPhaseNumber('requirements')).toBe('01');
      expect(getPhaseNumber('design')).toBe('02');
      expect(getPhaseNumber('test_scenario')).toBe('03');
      expect(getPhaseNumber('implementation')).toBe('04');
      expect(getPhaseNumber('test_implementation')).toBe('05');
      expect(getPhaseNumber('testing')).toBe('06');
      expect(getPhaseNumber('documentation')).toBe('07');
      expect(getPhaseNumber('report')).toBe('08');
      expect(getPhaseNumber('evaluation')).toBe('09');
    });
  });
});

describe('Rollback auto language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let repoRoot: string;
  let issueDir: string;
  let metadataPath: string;
```

## Turn 215: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 216: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 217: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 218: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "testing" -n tests/unit/commands/rollback.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
68:        testing: { ...basePhase },
379:        fromPhase: 'testing',
380:        reasonFile: '.ai-workflow/issue-49/07_testing/review/result.md'
394:      expect(markdown).toContain('**差し戻し元**: Phase testing');
396:      expect(markdown).toContain('@.ai-workflow/issue-49/07_testing/review/result.md');
410:      const reason = 'Manual rollback for testing';
418:      expect(markdown).toContain('Manual rollback for testing');
439:      expect(getPhaseNumber('testing')).toBe('07');
471:    current_phase: 'testing',
479:      testing: { ...basePhase },
```

## Turn 219: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 220: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '430,445p' tests/unit/commands/rollback.test.ts"`
**ステータス**: completed (exit_code=0)

```text
test('フェーズ名から正しいフェーズ番号が返される', () => {
      // Then: 各フェーズ名に対応する番号が返される
      expect(getPhaseNumber('planning')).toBe('00');
      expect(getPhaseNumber('requirements')).toBe('01');
      expect(getPhaseNumber('design')).toBe('02');
      expect(getPhaseNumber('test_scenario')).toBe('03');
      expect(getPhaseNumber('implementation')).toBe('04');
      expect(getPhaseNumber('test_implementation')).toBe('05');
      expect(getPhaseNumber('test_preparation')).toBe('06');
      expect(getPhaseNumber('testing')).toBe('07');
      expect(getPhaseNumber('documentation')).toBe('08');
      expect(getPhaseNumber('report')).toBe('09');
      expect(getPhaseNumber('evaluation')).toBe('10');
    });
  });
});
```

## Turn 221: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 222: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "allPhases" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/jenkins/non-stored-password-params.test.ts:16:  allPhases: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
tests/integration/jenkins/non-stored-password-params.test.ts:33:  allPhases: 'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
tests/integration/jenkins/non-stored-password-params.test.ts:62:  ai_workflow_all_phases_job: JOB_DSL_PATHS.allPhases,
tests/integration/jenkins/non-stored-password-params.test.ts:223:    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'rollback', 'finalize'])(
tests/integration/jenkins/non-stored-password-params.test.ts:243:    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'rollback', 'finalize'])(
tests/integration/jenkins/non-stored-password-params.test.ts:253:    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'finalize'])(
tests/integration/jenkins/non-stored-password-params.test.ts:264:      'allPhases',
tests/integration/jenkins/non-stored-password-params.test.ts:279:      'allPhases',
tests/integration/jenkins/non-stored-password-params.test.ts:294:      'allPhases',
tests/integration/jenkins/non-stored-password-params.test.ts:311:        expectParamSecured('allPhases', paramName);
tests/integration/jenkins/non-stored-password-params.test.ts:313:      [REDACTED_TOKEN]('allPhases');
tests/integration/jenkins/non-stored-password-params.test.ts:319:      [REDACTED_TOKEN]('allPhases', [
tests/integration/jenkins/non-stored-password-params.test.ts:339:      const content = pipelineContents.allPhases + commonSharedContent;
tests/integration/jenkins/non-stored-password-params.test.ts:348:      [REDACTED_TOKEN]('allPhases');
tests/integration/jenkins/non-stored-password-params.test.ts:354:      expect(dslContents.allPhases).toMatch(/ISSUE_URL（必須）: GitHub Issue URL/);
tests/integration/jenkins/non-stored-password-params.test.ts:355:      expect(dslContents.allPhases).toMatch(/作業ブランチ名（任意）/);
tests/integration/jenkins/non-stored-password-params.test.ts:356:      expect(dslContents.allPhases).toMatch(/ベースブランチ（任意）/);
tests/integration/jenkins/non-stored-password-params.test.ts:357:      [REDACTED_TOKEN]('allPhases', '[REDACTED_TOKEN]', 'デフォルト値: AI Workflow Bot');
tests/integration/jenkins/non-stored-password-params.test.ts:359:        'allPhases',
tests/integration/jenkins/non-stored-password-params.test.ts:363:      expect(dslContents.allPhases).toMatch(/Codex auth\.json の内容（任意）/);
tests/integration/jenkins/webhook-notifications.test.ts:15:  allPhases: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
tests/integration/jenkins/webhook-notifications.test.ts:30:  allPhases: 'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
tests/integration/prompt-language-switching.test.ts:21:const allPhases: PhaseName[] = [
tests/integration/prompt-language-switching.test.ts:197:    allPhases.forEach((phaseName) => {
tests/unit/commands/execute/agent-setup.test.ts:875:    const allPhases = Object.entries([REDACTED_TOKEN]);
tests/unit/commands/execute/agent-setup.test.ts:878:    const claudeFirstCount = allPhases.filter(([_, priority]) => priority === 'claude-first').length;
tests/unit/commands/execute/agent-setup.test.ts:879:    const codexFirstCount = allPhases.filter(([_, priority]) => priority === 'codex-first').length;
tests/unit/commands/execute/agent-setup.test.ts:884:    expect(allPhases.length).toBe(11); // 全11フェーズ
tests/unit/phases/formatters/progress-formatter.test.ts:19:  const allPhases: PhaseName[] = [
tests/unit/phases/formatters/progress-formatter.test.ts:33:  for (const phase of allPhases) {
tests/unit/phases/formatters/progress-formatter.test.ts:79:      for (const phase of allPhases) {
```

## Turn 223: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 224: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/phases/formatters/progress-formatter.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: progress-formatter.ts
 *
 * テスト対象:
 * - ProgressFormatter.[REDACTED_TOKEN]()
 * - フェーズステータス絵文字マッピング
 * - 進捗状況リストの生成
 * - 完了フェーズの折りたたみ表示
 */

import { describe, test, expect } from '@jest/globals';
import { ProgressFormatter } from '../../../../src/phases/formatters/progress-formatter.js';
import { PhaseName, PhaseStatus, WorkflowMetadata } from '../../../../src/types.js';

/**
 * MetadataManager のモックを作成
 */
function [REDACTED_TOKEN](phasesData: Partial<Record<PhaseName, { status: PhaseStatus; started_at?: string | null; completed_at?: string | null; retry_count?: number; review_result?: string | null }>>): any {
  const allPhases: PhaseName[] = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ];

  const phases: any = {};
  for (const phase of allPhases) {
    const data = phasesData[phase] || { status: 'pending' };
    const phaseData: any = {
      status: data.status,
      started_at: data.started_at || null,
      completed_at: data.completed_at || null,
      retry_count: data.retry_count || 0,
      review_result: data.review_result || null,
      output_files: [],
      completed_steps: [],
      current_step: null,
    };

    // [REDACTED_TOKEN] には追加フィールドが必要
    if (phase === 'evaluation') {
      phaseData.decision = null;
      phaseData.failed_phase = null;
      phaseData.remaining_tasks = [];
      phaseData.created_issue_url = null;
      phaseData.abort_reason = null;
    }

    phases[phase] = phaseData;
  }

  const metadata: WorkflowMetadata = {
    issue_number: '999',
    issue_url: 'https://github.com/test/repo/issues/999',
    issue_title: 'Test Issue',
    workflow_version: '0.3.0',
    current_phase: 'planning',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    phases,
    cost_tracking: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    },
    design_decisions: { implementation_strategy: null, test_strategy: null, test_code_strategy: null },
  };

  return {
    data: metadata,
    getAllPhasesStatus: () => {
      const result: any = {};
      for (const phase of allPhases) {
        result[phase] = phases[phase].status;
      }
      return result;
    },
    getLanguage: () => 'ja', // Issue #587: デフォルトは日本語
  };
}

describe('ProgressFormatter - 基本的な進捗コメント生成', () => {
  const formatter = new ProgressFormatter();

  test('1-1: 進行中フェーズの進捗コメントが正しくフォーマットされる', () => {
    // Given: planning完了、requirements進行中、design以降はpending
    const mockMetadata = [REDACTED_TOKEN]({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00', review_result: 'approved' },
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });

    // When: requirements フェーズの進捗コメントを生成
    const result = formatter.[REDACTED_TOKEN]('requirements', 'in_progress', mockMetadata, 'Analyzing existing code...');

    // Then: 期待されるフォーマットが返される
    expect(result).toContain('## 🤖 AI Workflow - 進捗状況');
    expect(result).toContain('### 全体進捗');
    expect(result).toContain('✅ Phase 0: Planning - **COMPLETED** (2024-01-23 12:00:00)');
    expect(result).toContain('🔄 Phase 1: Requirements - **IN_PROGRESS** (開始: 2024-01-23 12:05:00)');
    expect(result).toContain('⏸️ Phase 2: Design - **PENDING**');
    expect(result).toContain('### 現在のフェーズ: Phase 1 (Requirements)');
    expect(result).toContain('**ステータス**: IN_PROGRESS');
    expect(result).toContain('**開始時刻**: 2024-01-23 12:05:00');
    expect(result).toContain('**試行回数**: 1/3');
    expect(result).toContain('Analyzing existing code...');
    expect(result).toContain('<details>');
    expect(result).toContain('完了したフェーズの詳細');
    expect(result).toContain('### Phase 0: Planning');
    expect(result).toContain('**レビュー結果**: approved');
  });

  test('1-2: 完了フェーズの進捗コメントが正しくフォーマ
... (truncated)
```

## Turn 225: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 226: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 227: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 228: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/phases/lifecycle/phase-runner.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
44:        test_implementation: { status: 'pending' },
59:        test_implementation: 'pending',
73:      test_implementation: 'pending',
667:    'test_implementation',
```

## Turn 229: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 230: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '640,690p' tests/unit/phases/lifecycle/phase-runner.test.ts"`
**ステータス**: completed (exit_code=0)

```text
expect(postProgressSpy).toHaveBeenCalled();
    expect(updateChecklistSpy).toHaveBeenCalled();
    expect(
      metadata.updatePhaseStatus.mock.invocationCallOrder[0] <
      postProgressSpy.mock.invocationCallOrder[0]
    ).toBe(true);
    expect(
      postProgressSpy.mock.invocationCallOrder[0] <
      updateChecklistSpy.mock.invocationCallOrder[0]
    ).toBe(true);
  });

  test('UC-PR-14: keeps status completed even if checklist update fails', async () => {
    const { runner, metadata } = [REDACTED_TOKEN]('design');
    jest.spyOn(runner as any, 'postProgress').mockResolvedValue(undefined as any);
    jest.spyOn(runner as any, '[REDACTED_TOKEN]').mockRejectedValue(new Error('boom'));

    await expect((runner as any).finalizePhase()).resolves.toBeUndefined();
    expect(metadata.updatePhaseStatus).[REDACTED_TOKEN]('design', 'completed', {});
  });

  test.each<PhaseName>([
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
  ])('UC-PR-15: invokes checklist update for phase %s', async (phaseName) => {
    const { runner } = [REDACTED_TOKEN](phaseName);
    const updateChecklistSpy = jest
      .spyOn(runner as any, '[REDACTED_TOKEN]')
      .mockResolvedValue(undefined as any);
    jest.spyOn(runner as any, 'postProgress').mockResolvedValue(undefined as any);

    await (runner as any).finalizePhase();

    expect(updateChecklistSpy).[REDACTED_TOKEN](1);
  });
});

describe('PhaseRunner - [REDACTED_TOKEN]() 依存関係検証', () => {
  let testWorkflowDir: string;

  beforeEach(async () => {
    testWorkflowDir = path.join(TEST_DIR, '.ai-workflow', 'issue-dependencies');
    await fs.ensureDir(testWorkflowDir);
    jest.clearAllMocks();
```

## Turn 231: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 232: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 233: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 234: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,100p' tests/unit/phases/lifecycle/phase-runner.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: phase-runner.ts
 *
 * テスト対象:
 * - PhaseRunner.run()
 * - PhaseRunner.[REDACTED_TOKEN]()
 * - PhaseRunner.handleFailure()
 * - PhaseRunner.postProgress()
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */

// [REDACTED_TOKEN] のモックを先に定義
const [REDACTED_TOKEN] = jest.fn<any>();

// jest.mock() でモジュールを置き換え（importより前に実行される）
jest.mock('../../../../src/core/phase-dependencies.js', () => ({
  validatePhaseDependencies: [REDACTED_TOKEN],
}));

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { PhaseRunner } from '../../../../src/phases/lifecycle/phase-runner.js';
import { PhaseName, PhaseStatus, [REDACTED_TOKEN], SupportedLanguage } from '../../../../src/types.js';
import { logger } from '../../../../src/utils/logger.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'phase-runner-test');

/**
 * モック MetadataManager を作成
 */
function [REDACTED_TOKEN](): any {
  return {
    data: {
      issue_number: '1',
      phases: {
        planning: { status: 'completed' },
        requirements: { status: 'completed' },
        design: { status: 'pending' },
        test_scenario: { status: 'pending' },
        implementation: { status: 'pending' },
        test_implementation: { status: 'pending' },
        testing: { status: 'pending' },
        documentation: { status: 'pending' },
        report: { status: 'pending' },
        evaluation: { status: 'pending' }
      }
    },
    updatePhaseStatus: jest.fn<any>(),
    getPhaseStatus: jest.fn<any>((phaseName: string) => {
      const phases: any = {
        planning: 'completed',
        requirements: 'completed',
        design: 'pending',
        test_scenario: 'pending',
        implementation: 'pending',
        test_implementation: 'pending',
        testing: 'pending',
        documentation: 'pending',
        report: 'pending',
        evaluation: 'pending'
      };
      return phases[phaseName] ?? 'pending';
    }),
    getAllPhasesStatus: jest.fn<any>().mockReturnValue({
      planning: 'completed',
      requirements: 'completed',
      design: 'pending',
      test_scenario: 'pending',
      implementation: 'pending',
      test_implementation: 'pending',
      testing: 'pending',
      documentation: 'pending',
      report: 'pending',
      evaluation: 'pending'
    }),
    getCurrentStep: jest.fn<any>(() => null),
    getCompletedSteps: jest.fn<any>(() => []),
    getLanguage: jest.fn<any>(() => 'ja'), // Issue #587
  };
}

/**
 * モック GitHubClient を作成
 */
function [REDACTED_TOKEN](): any {
  return {
    createOrUpdateProgressComment: jest.fn<any>().mockResolvedValue(undefined),
  };
}

/**
 * モック StepExecutor を作成
 */
function [REDACTED_TOKEN](
  executeResult: [REDACTED_TOKEN] = { success: true },
  reviewResult: [REDACTED_TOKEN] = { success: true }
): any {
```

## Turn 235: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 236: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 237: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 238: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/phases/core/review-cycle-manager.test.ts'`
**ステータス**: completed (exit_code=0)

```text
34:      test_implementation: { status: 'pending', started_at: null, completed_at: null, retry_count: 0, review_result: null, output_files: [], completed_steps: [], current_step: null },
```

## Turn 239: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 240: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 241: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 242: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "options-parser" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/commands/execute/options-parser.test.ts:2: * ユニットテスト: options-parser モジュール
tests/unit/commands/execute/options-parser.test.ts:21:} from '../../../../src/commands/execute/options-parser.js';
```

## Turn 243: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 244: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/commands/execute/options-parser.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: options-parser モジュール
 *
 * テスト対象:
 * - parseExecuteOptions(): [REDACTED_TOKEN] の正規化
 * - [REDACTED_TOKEN](): 相互排他オプションの検証
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect } from '@jest/globals';
import {
  parseExecuteOptions,
  parseLanguageOption,
  [REDACTED_TOKEN],
  [REDACTED_TOKEN],
  type [REDACTED_TOKEN],
  type ValidationResult,
} from '../../../../src/commands/execute/options-parser.js';
import type { [REDACTED_TOKEN] } from '../../../../src/types/commands.js';

// =============================================================================
// parseExecuteOptions() - 正常系
// =============================================================================

describe('parseExecuteOptions - 正常系', () => {
  test('標準オプション: issue と phase が正しく解析される', () => {
    // Given: 標準オプション
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'planning',
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: 正しく正規化される
    expect(result.issueNumber).toBe('46');
    expect(result.phaseOption).toBe('planning');
    expect(result.presetOption).toBeUndefined();
    expect(result.agentMode).toBe('auto');
    expect(result.skipDependencyCheck).toBe(false);
    expect(result.ignoreDependencies).toBe(false);
    expect(result.forceReset).toBe(false);
    expect(result.cleanupOnComplete).toBe(false);
    expect(result.[REDACTED_TOKEN]).toBe(false);
  });

  test('プリセットオプション: preset が正しく解析される', () => {
    // Given: プリセットオプション
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      preset: 'review-requirements',
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: 正しく正規化される
    expect(result.issueNumber).toBe('46');
    expect(result.phaseOption).toBe('all'); // デフォルト値
    expect(result.presetOption).toBe('review-requirements');
    expect(result.agentMode).toBe('auto');
  });

  test('エージェントモード指定: codex モードが正しく設定される', () => {
    // Given: エージェントモード = 'codex'
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'implementation',
      agent: 'codex',
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: agentMode が 'codex' に設定される
    expect(result.agentMode).toBe('codex');
  });

  test('エージェントモード指定: claude モードが正しく設定される', () => {
    // Given: エージェントモード = 'claude'
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'implementation',
      agent: 'claude',
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: agentMode が 'claude' に設定される
    expect(result.agentMode).toBe('claude');
  });

  test('エージェントモード指定: auto モードがデフォルト値として設定される', () => {
    // Given: エージェントモード未指定
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'implementation',
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: agentMode が 'auto' に設定される（デフォルト）
    expect(result.agentMode).toBe('auto');
  });

  test('エージェントモード指定: 無効な値は auto にフォールバック', () => {
    // Given: エージェントモード = 'invalid'
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'implementation',
      agent: 'invalid' as any,
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: agentMode が 'auto' にフォールバック
    expect(result.agentMode).toBe('auto');
  });

  test('forceReset フラグ: true が正しく設定される', () => {
    // Given: forceReset = true
    const options: [REDACTED_TOKEN] = {
      issue: '46',
      phase: 'all',
      forceReset: true,
    };

    // When: オプションを解析
    const result: [REDACTED_TOKEN] = parseExecuteOptions(options);

    // Then: forceReset が true に設定される
    expect(result.forceReset).toBe(true);
  });
... (truncated)
```

## Turn 245: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 246: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/commands/execute/options-parser.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
29:  test('標準オプション: issue と phase が正しく解析される', () => {
33:      phase: 'planning',
41:    expect(result.phaseOption).toBe('planning');
63:    expect(result.phaseOption).toBe('all'); // デフォルト値
72:      phase: 'implementation',
87:      phase: 'implementation',
102:      phase: 'implementation',
116:      phase: 'implementation',
131:      phase: 'all',
146:      phase: 'planning',
```

## Turn 247: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 248: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "valid" -n tests/unit/commands/execute/options-parser.test.ts | tail'`
**ステータス**: completed (exit_code=0)

```text
550:    const result: ValidationResult = [REDACTED_TOKEN](options);
553:    expect(result.valid).toBe(false);
792:      "Invalid language option 'fr'. Allowed values: ja, en",
797:describe('[REDACTED_TOKEN]', () => {
799:    expect([REDACTED_TOKEN]('ja')).toEqual({ valid: true, errors: [] });
800:    expect([REDACTED_TOKEN]('en')).toEqual({ valid: true, errors: [] });
804:    expect([REDACTED_TOKEN](undefined)).toEqual({ valid: true, errors: [] });
808:    expect([REDACTED_TOKEN]('')).toEqual({ valid: true, errors: [] });
812:    const result = [REDACTED_TOKEN]('fr');
813:    expect(result.valid).toBe(false);
```

## Turn 249: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 250: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "_report" -n tests/integration/workflow-init-cleanup.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
507:      { name: '09_report', num: 8 },
540:    expect(await fs.pathExists(path.join(issueDir, '09_report', 'execute'))).toBe(false);
545:    expect(await fs.pathExists(path.join(issueDir, '09_report', 'output', 'output.md'))).toBe(true);
```

## Turn 251: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 252: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '480,520p' tests/integration/workflow-init-cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// Step 1: ワークフロー初期化
    const issueDir = path.join(testRepoDir, '.ai-workflow', 'issue-21');
    await fs.ensureDir(issueDir);
    const metadataPath = path.join(issueDir, 'metadata.json');
    await fs.writeJson(metadataPath, {
      issue_number: '21',
      branch_name: 'ai-workflow/issue-21',
      issue_url: 'https://github.com/tielec/ai-workflow-agent/issues/21',
      issue_title: 'E2E test',
      created_at: new Date().toISOString(),
    });

    const metadataManager = new MetadataManager(metadataPath);
    const gitManager = new GitManager(testRepoDir, metadataManager);

    const initResult = await gitManager.commitWorkflowInit(21, 'ai-workflow/issue-21');
    expect(initResult.success).toBe(true);

    // 初期化コミットを確認
    const initCommitMessage = await git.show([initResult.commit_hash!, '--pretty=format:%B', '--no-patch']);
    expect(initCommitMessage).toContain('[ai-workflow] Initialize workflow for issue #21');

    // Step 2: Phase 1-8を順次実行（シミュレート）
    const phases = [
      { name: '00_planning', num: 0 },
      { name: '01_requirements', num: 1 },
      { name: '09_report', num: 8 },
    ];

    for (const phase of phases) {
      const phaseDir = path.join(issueDir, phase.name);
      await fs.ensureDir(path.join(phaseDir, 'execute'));
      await fs.ensureDir(path.join(phaseDir, 'output'));
      await fs.writeFile(path.join(phaseDir, 'execute', 'agent_log.md'), `# ${phase.name} Execute`);
      await fs.writeFile(path.join(phaseDir, 'output', 'output.md'), `# ${phase.name} Output`);
    }

    await git.add('.');
    await git.commit('Add phase logs');
```

## Turn 253: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 254: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/metadata-manager.test.ts'`
**ステータス**: completed (exit_code=0)

```text
249:      metadataManager.data.phases.test_implementation.status = 'pending';
250:      metadataManager.data.phases.test_implementation.completed_steps = ['execute'];
251:      metadataManager.data.phases.test_implementation.started_at = null;
254:      const result = metadataManager.[REDACTED_TOKEN]('test_implementation');
308:      // Given: test_implementation と testing が完了している
309:      metadataManager.data.phases.test_implementation.status = 'completed';
310:      metadataManager.data.phases.test_implementation.completed_steps = ['execute', 'review'];
311:      metadataManager.data.phases.test_implementation.started_at = '2025-01-30T10:00:00Z';
312:      metadataManager.data.phases.test_implementation.completed_at = '2025-01-30T11:00:00Z';
319:      // When: test_implementation にロールバック
320:      const result = metadataManager.rollbackToPhase('test_implementation');
```

## Turn 255: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 256: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/metadata-manager.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import type { WorkflowMetadata } from '../../src/types.js';
import fs from 'fs-extra';
import * as path from 'node:path';
import { jest } from '@jest/globals';

let templateMetadata: WorkflowMetadata;
let workflowState: WorkflowState;
let existsSyncSpy: jest.SpyInstance;
let removeSyncSpy: jest.SpyInstance;
let copyFileSyncSpy: jest.SpyInstance;
let ensureDirSyncSpy: jest.SpyInstance;
let writeJsonSyncSpy: jest.SpyInstance;

describe('MetadataManager', () => {
  let metadataManager: MetadataManager;
  const testWorkflowDir = '/test/.ai-workflow/issue-26';
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeAll(() => {
    templateMetadata = fs.readJsonSync(
      path.resolve('metadata.json.template'),
    ) as WorkflowMetadata;
  });

  beforeEach(() => {
    jest.restoreAllMocks();

    // Prepare in-memory workflow state based on template
    const metadataCopy = JSON.parse(JSON.stringify(templateMetadata)) as WorkflowMetadata;
    metadataCopy.issue_number = '26';
    metadataCopy.issue_url = 'https://example.com/issues/26';
    metadataCopy.issue_title = 'Test Issue 26';
    workflowState = new (WorkflowState as any)(testMetadataPath, metadataCopy);

    jest.spyOn(WorkflowState as any, 'load').mockReturnValue(workflowState);
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readJsonSync').mockReturnValue(metadataCopy);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    writeJsonSyncSpy = jest.spyOn(fs, 'writeJsonSync').mockImplementation(() => {});
    ensureDirSyncSpy = jest.spyOn(fs, 'ensureDirSync').mockImplementation(() => {});
    removeSyncSpy = jest.spyOn(fs, 'removeSync').mockImplementation(() => {});
    copyFileSyncSpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updatePhaseStatus', () => {
    // REQ-007, REQ-008, REQ-009: リファクタリング後の動作確認
    it('正常系: フェーズステータスが更新される', () => {
      // Given: フェーズ名とステータス
      const phaseName = '00_planning';
      const status = 'completed';
      const outputFile = '/path/to/planning.md';

      // When: updatePhaseStatus関数を呼び出す
      metadataManager.updatePhaseStatus(phaseName as any, status as any, {
        outputFile,
      });

      // Then: ステータスが更新される（内部状態の確認）
      expect(metadataManager.getPhaseStatus(phaseName as any)).toBe(status);
    });
  });

  describe('addCost', () => {
    it('正常系: コストが集計される', () => {
      // Given: コスト情報（3引数: inputTokens, outputTokens, costUsd）
      const inputTokens = 1000;
      const outputTokens = 500;
      const costUsd = 0.05;

      // When: addCost関数を呼び出す
      metadataManager.addCost(inputTokens, outputTokens, costUsd);

      // Then: コストが集計される（内部状態の確認は困難）
      expect(true).toBe(true);
    });
  });

  describe('backupMetadata', () => {
    it('正常系: バックアップファイルが作成される（ヘルパー関数使用）', () => {
      // Given: メタデータファイルが存在する
      existsSyncSpy.mockReturnValue(true);
      copyFileSyncSpy.mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: backupMetadata関数を呼び出す
      const result = metadataManager.backupMetadata();

      // Then: バックアップファイルパスが返される
      expect(result).toMatch(/metadata\.json\.backup_\d{8}_\d{6}$/);

      consoleLogSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('正常系: メタデータとワークフローディレクトリが削除される（ヘルパー関数使用）', () => {
      // Given: メタデータファイルとワークフローディレクトリが存在する
      existsSyncSpy.mockReturnValue(true);
      removeSyncSpy.mockImplementation(() => {});
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // When: clear関数を呼び出す
... (truncated)
```

## Turn 257: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 258: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/commands/execute/options-parser.test.ts | grep -n "invalid" -n'`
**ステータス**: completed (exit_code=0)

```text
22:304:      skipPhases: 'invalid_phase',
23:309:      /Invalid phase names in --skip-phases: invalid_phase/,
25:323:      /Invalid phase names in --skip-phases: invalid1, invalid2\. Valid phase names are:/,
```

## Turn 259: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 260: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '280,340p' tests/unit/commands/execute/options-parser.test.ts"`
**ステータス**: completed (exit_code=0)

```text
phase: 'all',
    };

    // When: オプションを解析
    const resultUndefined = parseExecuteOptions(optionsUndefined);

    // Then: undefined が設定される
    expect(resultUndefined.skipPhases).toBeUndefined();

    // And: 空文字指定でも undefined になる
    const optionsEmpty: [REDACTED_TOKEN] = {
      issue: '636',
      phase: 'all',
      skipPhases: '',
    };
    const resultEmpty = parseExecuteOptions(optionsEmpty);
    expect(resultEmpty.skipPhases).toBeUndefined();
  });

  test('無効なフェーズ名はエラーになる', () => {
    // Given: 無効なフェーズを含む skipPhases
    const options: [REDACTED_TOKEN] = {
      issue: '636',
      phase: 'all',
      skipPhases: 'invalid_phase',
    };

    // When / Then: エラーがスローされる
    expect(() => parseExecuteOptions(options)).toThrow(
      /Invalid phase names in --skip-phases: invalid_phase/,
    );
  });

  test('複数の無効フェーズ名はすべてメッセージに含まれる', () => {
    // Given: 複数の無効フェーズを含む skipPhases
    const options: [REDACTED_TOKEN] = {
      issue: '636',
      phase: 'all',
      skipPhases: 'invalid1,invalid2,test_scenario',
    };

    // When / Then: すべての無効フェーズが列挙されたエラーになる
    expect(() => parseExecuteOptions(options)).toThrow(
      /Invalid phase names in --skip-phases: invalid1, invalid2\. Valid phase names are:/,
    );
  });

  test('planning を含む場合はエラーになる', () => {
    // Given: planning を含む skipPhases
    const options: [REDACTED_TOKEN] = {
      issue: '636',
      phase: 'all',
      skipPhases: 'planning,test_scenario',
    };

    // When / Then: planning 禁止エラー
    expect(() => parseExecuteOptions(options)).toThrow(
      'Planning phase cannot be skipped as all other phases depend on it.',
    );
  });
```

## Turn 261: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 262: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "test_preparation" -n tests | head'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:238:      '06_test_preparation',
tests/integration/cleanup-command.test.ts:285:      '06_test_preparation',
tests/integration/cleanup-command.test.ts:324:      '06_test_preparation',
tests/integration/cleanup-command.test.ts:381:      '06_test_preparation',
tests/integration/cleanup-command.test.ts:430:    for (const phaseName of ['[REDACTED_TOKEN]', '06_test_preparation', '07_testing', '08_documentation', '09_report']) {
tests/integration/cleanup-command.test.ts:473:      '06_test_preparation',
tests/integration/cleanup-command.test.ts:529:      '06_test_preparation',
tests/integration/preset-execution.test.ts:65:      'test_preparation',
tests/integration/preset-execution.test.ts:79:    expect(phases).toEqual(['planning', 'test_implementation', 'test_preparation', 'testing']);
tests/integration/prompt-language-switching.test.ts:28:  'test_preparation',
```

## Turn 263: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 264: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 265: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "export type [REDACTED_TOKEN]" -n -C 2 src/phases/base-phase.ts'`
**ステータス**: completed (exit_code=0)

```text
60-};
61-
62:export type [REDACTED_TOKEN] = Omit<[REDACTED_TOKEN], 'phaseName'>;
63-
64-export abstract class BasePhase {
```

## Turn 266: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 267: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "type [REDACTED_TOKEN]" -n -A 20 src/phases/base-phase.ts'`
**ステータス**: completed (exit_code=0)

```text
46:export type [REDACTED_TOKEN] = {
47-  phaseName: PhaseName;
48-  workingDir: string;
49-  metadataManager: MetadataManager;
50-  codexClient?: CodexAgentClient | null;
51-  claudeClient?: ClaudeAgentClient | null;
52-  githubClient: GitHubClient;
53-  skipDependencyCheck?: boolean;
54-  ignoreDependencies?: boolean;
55-  skipPhases?: PhaseName[];
56-  presetPhases?: PhaseName[]; // プリセット実行時のフェーズリスト（Issue #396）
57-  [REDACTED_TOKEN]?: [REDACTED_TOKEN]; // Issue #119: Optional for backward compatibility
58-  modelOptimizer?: ModelOptimizer | null;
59-  modelOverrides?: ModelOverrides;
60-};
61-
62-export type [REDACTED_TOKEN] = Omit<[REDACTED_TOKEN], 'phaseName'>;
63-
64-export abstract class BasePhase {
65-  protected readonly phaseName: PhaseName;
66-  protected readonly workingDir: string;
```

## Turn 268: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 269: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 270: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "constructor(params" -n -A 40 src/phases/base-phase.ts'`
**ステータス**: completed (exit_code=0)

```text
204:  constructor(params: [REDACTED_TOKEN]) {
205-    this.phaseName = params.phaseName;
206-    this.workingDir = params.workingDir;
207-    this.metadata = params.metadataManager;
208-    this.codex = params.codexClient ?? null;
209-    this.claude = params.claudeClient ?? null;
210-    this.github = params.githubClient;
211-    this.skipDependencyCheck = params.skipDependencyCheck ?? false;
212-    this.ignoreDependencies = params.ignoreDependencies ?? false;
213-    this.skipPhases = params.skipPhases;
214-    this.presetPhases = params.presetPhases;
215-    this.contentParser = new ContentParser();
216-    this.[REDACTED_TOKEN] = params.[REDACTED_TOKEN]
217-      ? { ...params.[REDACTED_TOKEN] }
218-      : { enabled: false, provider: 'auto' };
219-    this.modelOptimizer = params.modelOptimizer ?? null;
220-    this.modelOverrides = params.modelOverrides;
221-
222-    const phaseNumber = this.getPhaseNumber(this.phaseName);
223-    // Issue #274: REPOS_ROOT が設定されている場合は動的にパスを解決
224-    const workflowBaseDir = this.[REDACTED_TOKEN]();
225-    this.phaseDir = path.join(workflowBaseDir, `${phaseNumber}_${this.phaseName}`);
226-    this.outputDir = path.join(this.phaseDir, 'output');
227-    this.executeDir = path.join(this.phaseDir, 'execute');
228-    this.reviewDir = path.join(this.phaseDir, 'review');
229-    this.reviseDir = path.join(this.phaseDir, 'revise');
230-
231-    this.ensureDirectories();
232-
233-    // 新規モジュールの初期化 (Issue #23)
234-    const language = this.metadata.getLanguage();
235-    this.logFormatter = new LogFormatter(language);
236-    this.progressFormatter = new ProgressFormatter();
237-    this.reviewCycleManager = new ReviewCycleManager(this.metadata, this.phaseName);
238-
239-    // AgentExecutor は遅延初期化（codex/claude が設定されている場合のみ）
240-    // Issue #264: [REDACTED_TOKEN] 関数を渡して REPOS_ROOT 対応
241-    // Issue #306: agentPriority を渡してフェーズ固有の優先順位を適用
242-    if (this.codex || this.claude) {
243-      const agentPriority = [REDACTED_TOKEN][this.phaseName];
244-      this.agentExecutor = new AgentExecutor(
```

## Turn 271: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 272: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "[REDACTED_TOKEN]" -n -A 20 src/phases/base-phase.ts'`
**ステータス**: completed (exit_code=0)

```text
165:  private [REDACTED_TOKEN](): string {
166-    const metadataData = (this.metadata as MetadataManager & { data?: WorkflowMetadata }).data;
167-    const issueNumber = metadataData?.issue_number;
168-    const targetRepo = metadataData?.target_repository;
169-
170-    if (!issueNumber) {
171-      throw new Error('[Issue #603] Issue number is missing from metadata. Cannot resolve workflow directory.');
172-    }
173-
174-    if (targetRepo?.path) {
175-      const repoPath = [REDACTED_TOKEN](targetRepo.path);
176-      const workflowDir = path.join(repoPath, '.ai-workflow', `issue-${issueNumber}`);
177-      logger.debug(`Using metadata target_repository.path for workflow directory: ${workflowDir}`);
178-      return workflowDir;
179-    }
180-
181-    const reposRoot = config.getReposRoot();
182-    if (reposRoot && targetRepo?.repo) {
183-      const repoPath = [REDACTED_TOKEN](path.join(reposRoot, targetRepo.repo));
184-      const workflowDir = path.join(repoPath, '.ai-workflow', `issue-${issueNumber}`);
185-      logger.warn(`metadata.target_repository.path missing. Using REPOS_ROOT fallback for workflow directory: ${workflowDir}`);
--
224:    const workflowBaseDir = this.[REDACTED_TOKEN]();
225-    this.phaseDir = path.join(workflowBaseDir, `${phaseNumber}_${this.phaseName}`);
226-    this.outputDir = path.join(this.phaseDir, 'output');
227-    this.executeDir = path.join(this.phaseDir, 'execute');
228-    this.reviewDir = path.join(this.phaseDir, 'review');
229-    this.reviseDir = path.join(this.phaseDir, 'revise');
230-
231-    this.ensureDirectories();
232-
233-    // 新規モジュールの初期化 (Issue #23)
234-    const language = this.metadata.getLanguage();
235-    this.logFormatter = new LogFormatter(language);
236-    this.progressFormatter = new ProgressFormatter();
237-    this.reviewCycleManager = new ReviewCycleManager(this.metadata, this.phaseName);
238-
239-    // AgentExecutor は遅延初期化（codex/claude が設定されている場合のみ）
240-    // Issue #264: [REDACTED_TOKEN] 関数を渡して REPOS_ROOT 対応
241-    // Issue #306: agentPriority を渡してフェーズ固有の優先順位を適用
242-    if (this.codex || this.claude) {
243-      const agentPriority = [REDACTED_TOKEN][this.phaseName];
244-      this.agentExecutor = new AgentExecutor(
```

## Turn 273: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 274: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 275: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "cat <<'EOF' > tests/unit/phases/test-preparation.test.ts
/**
 * ユニットテスト: [REDACTED_TOKEN]
 *
 * テスト対象:
 * - constructor
 * - execute()
 * - review()
 * - revise()
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { [REDACTED_TOKEN] } from '../../../src/phases/test-preparation.js';
import type { [REDACTED_TOKEN] } from '../../../src/types.js';

const ISSUE_NUMBER = '123';

const [REDACTED_TOKEN] =
  'テストコード実装ログは利用できません。実装コードとリポジトリ構成から環境準備を行ってください。';
const [REDACTED_TOKEN] =
  '実装ログは利用できません。リポジトリの実装内容を直接確認して環境準備を行ってください。';

const [REDACTED_TOKEN] =
  '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
const [REDACTED_TOKEN] =
  'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';

const [REDACTED_TOKEN] =
  '実装ログは利用できません。テスト準備内容から実装を推測して修正してください。';
const [REDACTED_TOKEN] =
  'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測して修正してください。';

describe('[REDACTED_TOKEN]', () => {
  let tempRoot: string;
  let workingDir: string;
  let workflowDir: string;
  let metadataManager: any;
  let githubClient: any;

  const createPhase = (): [REDACTED_TOKEN] =>
    new [REDACTED_TOKEN]({
      workingDir,
      metadataManager,
      githubClient,
      skipDependencyCheck: true,
    });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), '[REDACTED_TOKEN]-'));
    workingDir = path.join(tempRoot, 'repo');
    workflowDir = path.join(workingDir, '.ai-workflow', "'`issue-${ISSUE_NUMBER}`);
    fs.ensureDirSync(workingDir);

    metadataManager = {
      workflowDir,
      data: {
        issue_number: ISSUE_NUMBER,
        target_repository: {
          path: workingDir,
          repo: path.basename(workingDir),
        },
      },
      updatePhaseStatus: jest.fn<any>(),
      getPhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      save: jest.fn<any>(),
      getLanguage: jest.fn<any>().mockReturnValue('"'ja'),
    };

    githubClient = {
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
      postReviewResult: jest.fn<any>(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.removeSync(tempRoot);
    }
  });

  test('UT-PHASE-001: コンストラクタで phaseName が test_preparation に設定される', () => {
    const phase = createPhase();
    expect((phase as any).phaseName).toBe('test_preparation');
  });

  test('UT-PHASE-002: execute() が [REDACTED_TOKEN] を呼び出す', async () => {
    const phase = createPhase();

    const [REDACTED_TOKEN] = jest
      .spyOn(phase as any, '[REDACTED_TOKEN]')
      .mockReturnValue('mock-context');
    const planningRefSpy = jest
      .spyOn(phase as any, '[REDACTED_TOKEN]')
      .mockReturnValue('@planning');
    const executeTemplateSpy = jest
      .spyOn(phase as any, '[REDACTED_TOKEN]')
      .mockResolvedValue({ success: true } as [REDACTED_TOKEN]);

    const result = await (phase as any).execute();

    expect([REDACTED_TOKEN]).[REDACTED_TOKEN](
      'test_implementation',
      'test-implementation.md',
      [REDACTED_TOKEN],
      Number(ISSUE_NUMBER),
    );
    expect([REDACTED_TOKEN]).[REDACTED_TOKEN](
      'implementation',
      'implementation.md',
      [REDACTED_TOKEN],
      Number(ISSUE_NUMBER),
    );
    expect(planningRefSpy).[REDACTED_TOKEN](Number(ISSUE_NUMBER));
    expect(executeTemplateSpy).[REDACTED_TOKEN](
      'test-preparation.md',
      {
        planning_document_path: '@planning',
        test_implementation_context: 'mock-context',
        implementation_context: 'mock-context',
        issue_number: ISSUE_NUMBER,
      },
      { maxTurns: 80, enableFallback: true },
    );
    expect(result.success).toBe(true);
  });

  test('UT-PHASE-004: review() が出力ファイル不在時に失敗する', async () => {
    const phase = createPhase();

    const result = await (phase as any).review();

    expect(result.success).toBe(false);
    expect(result.error).toContain('test-preparation.md が存在しません');
  });

  test('UT-PHASE-005: review() がレビュープロンプトを実行して結果を返す', async () => {
    const phase = createPhase();
    const outputFile = path.join((phase as any).outputDir, 'test-preparation.md');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, '# テスト準備', 'utf-8');

    jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@planning');
    jest.spyOn(phase as any, 'getPhaseOutputFile').mockReturnValue(null);
    jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@test-prep');
    jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
      'Planning: {[REDACTED_TOKEN]}\\n' +
        'Prep: {[REDACTED_TOKEN]}\\n' +
        'Impl: {[REDACTED_TOKEN]}\\n' +
        'TestImpl: {[REDACTED_TOKEN]}'
    );

    const executeSpy = jest
      .spyOn(phase as any, 'executeWithAgent')
      .mockResolvedValue([{ role: 'assistant', content: 'OK' }] as any);

    jest.spyOn((phase as any).contentParser, 'parseReviewResult').mockResolvedValue({
      result: 'PASS',
      feedback: 'LGTM',
      suggestions: [],
    });

    const result = await (phase as any).review();

    const [[promptArg, optionsArg]] = executeSpy.mock.calls;
    expect(promptArg).toContain('Planning: @planning');
    expect(promptArg).toContain('Prep: @test-prep');
    expect(promptArg).toContain("'`Impl: ${[REDACTED_TOKEN]}`);
    expect(promptArg).toContain(`TestImpl: ${[REDACTED_TOKEN]}`);
    expect(optionsArg).toEqual({ maxTurns: 30, logDir: (phase as any).reviewDir });

    const reviewFile = path.join((phase as any).reviewDir, '"'result.md');
    expect(fs.existsSync(reviewFile)).toBe(true);
    expect(fs.readFileSync(reviewFile, 'utf-8')).toBe('LGTM');

    expect(githubClient.postReviewResult).[REDACTED_TOKEN](
      Number(ISSUE_NUMBER),
      'test_preparation',
      'PASS',
      'LGTM',
      [],
      metadataManager,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('PASS');
  });

  test('UT-PHASE-006: revise() が出力ファイル不在時に失敗する', async () => {
    const phase = createPhase();

    const result = await phase.revise('fix');

    expect(result.success).toBe(false);
    expect(result.error).toContain('test-preparation.md が存在しません');
  });

  test('UT-PHASE-007: revise() がレビュー指摘を反映して更新される', async () => {
    const phase = createPhase();
    const outputFile = path.join((phase as any).outputDir, 'test-preparation.md');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, '# テスト準備 v1', 'utf-8');

    jest.spyOn(phase as any, 'getPhaseOutputFile').mockReturnValue(null);
    jest.spyOn(phase as any, '[REDACTED_TOKEN]').mockReturnValue('@test-prep');
    jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
      'Prep: {[REDACTED_TOKEN]}\\n' +
        'Impl: {[REDACTED_TOKEN]}\\n' +
        'TestImpl: {[REDACTED_TOKEN]}\\n' +
        'Feedback: {review_feedback}\\n' +
        'Issue: {issue_number}'
    );

    const executeSpy = jest
      .spyOn(phase as any, 'executeWithAgent')
      .mockImplementation(async () => {
        fs.writeFileSync(outputFile, '# テスト準備 v2', 'utf-8');
        return [] as any;
      });

    const result = await phase.revise('Python 3.11 が必要です');

    const [[promptArg, optionsArg]] = executeSpy.mock.calls;
    expect(promptArg).toContain('Prep: @test-prep');
    expect(promptArg).toContain("'`Impl: ${[REDACTED_TOKEN]}`);
    expect(promptArg).toContain(`TestImpl: ${[REDACTED_TOKEN]}`);
    expect(promptArg).toContain('"'Feedback: Python 3.11 が必要です');
    expect(promptArg).toContain("'`Issue: ${ISSUE_NUMBER}`);
    expect(optionsArg).toEqual({ maxTurns: 80, logDir: (phase as any).reviseDir });

    expect(result.success).toBe(true);
    expect(result.output).toBe(outputFile);
  });
});
EOF
'`
**ステータス**: completed (exit_code=0)

## Turn 276: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 277: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 278: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "PHASE_ORDER" -n tests/unit/commands/execute.test.ts tests/unit/commands/execute/workflow-executor.test.ts'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/commands/execute/workflow-executor.test.ts:100:// PHASE_ORDER 定義の検証
tests/unit/commands/execute/workflow-executor.test.ts:103:describe('PHASE_ORDER 定義の検証', () => {
tests/unit/commands/execute/workflow-executor.test.ts:104:  test('すべてのフェーズが PHASE_ORDER に含まれている（検証のみ）', () => {
tests/unit/commands/execute/workflow-executor.test.ts:126:      // executePhasesFrom は PHASE_ORDER に存在しないフェーズでエラーを返す
```

## Turn 279: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 280: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 281: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 282: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -R \"test_implementation', 'testing\" -n tests"`
**ステータス**: failed (exit_code=1)

## Turn 283: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 284: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = 'tests';
const files = [];
(function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) walk(full); else files.push(full);
  }
})(root);
const suspects = [];
for(const file of files){
  const text = fs.readFileSync(file,'utf8');
  if(text.includes('test_implementation') && "'!text.includes('"'test_preparation')){
    suspects.push(file);
  }
}
console.log(suspects.join('\\n'));
NODE"`
**ステータス**: completed (exit_code=0)

```text
tests/integration/base-phase-refactored.test.ts
tests/integration/evaluation-phase-file-save.test.ts
tests/integration/finalize-command.test.ts
tests/integration/followup-issue-llm.test.ts
tests/integration/phase-template-refactoring.test.ts
tests/integration/preset-workflow.test.ts
tests/integration/rollback-workflow.test.ts
tests/unit/commands/cleanup.test.ts
tests/unit/commands/execute/options-parser.test.ts
tests/unit/commands/finalize.test.ts
tests/unit/core/metadata-manager-model-config.test.ts
tests/unit/core/phase-factory.test.ts
tests/unit/git/commit-message-builder.test.ts
tests/unit/git/file-selector.test.ts
tests/unit/github/issue-ai-generator.test.ts
tests/unit/github/issue-client-followup.test.ts
tests/unit/github/issue-client-llm.test.ts
tests/unit/helpers/validation.test.ts
tests/unit/jenkins/skip-phases.test.ts
tests/unit/metadata-manager.test.ts
tests/unit/phases/evaluation-phase-helpers.test.ts
tests/unit/prompts/issue-207-prompt-simplification.test.ts
tests/unit/prompts/prompt-simplification.test.ts
tests/unit/utils/pr-body-checklist-utils.test.ts
```

## Turn 285: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 286: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,200p' tests/unit/core/phase-factory.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * ユニットテスト: phase-factory モジュール
 *
 * テスト対象:
 * - createPhaseInstance(): フェーズインスタンス生成
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createPhaseInstance } from '../../../src/core/phase-factory.js';
import type { PhaseName } from '../../../src/types.js';
import type { PhaseContext } from '../../../src/types/commands.js';

import { PlanningPhase } from '../../../src/phases/planning.js';
import { RequirementsPhase } from '../../../src/phases/requirements.js';
import { DesignPhase } from '../../../src/phases/design.js';
import { TestScenarioPhase } from '../../../src/phases/test-scenario.js';
import { ImplementationPhase } from '../../../src/phases/implementation.js';
import { [REDACTED_TOKEN] } from '../../../src/phases/test-implementation.js';
import { TestingPhase } from '../../../src/phases/testing.js';
import { DocumentationPhase } from '../../../src/phases/documentation.js';
import { ReportPhase } from '../../../src/phases/report.js';
import { EvaluationPhase } from '../../../src/phases/evaluation.js';

// =============================================================================
// テストフィクスチャ: PhaseContext モック
// =============================================================================

/**
 * モック PhaseContext を作成
 */
function createMockContext(): PhaseContext {
  const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-factory-'));
  const workflowDir = path.join(workingDir, '.ai-workflow', 'issue-603');
  const metadataManager = {
    workflowDir,
    data: {
      issue_number: '603',
      target_repository: {
        path: workingDir,
        repo: path.basename(workingDir),
      },
      phases: {},
    },
    getLanguage: () => 'ja',
    getRollbackContext: () => null,
    updatePhaseStatus: jest.fn(),
    addCompletedStep: jest.fn(),
    getCompletedSteps: jest.fn().mockReturnValue([]),
    updateCurrentStep: jest.fn(),
    save: jest.fn(),
  } as any;

  return {
    workingDir,
    metadataManager,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
  };
}

// =============================================================================
// createPhaseInstance() - 正常系: 全10フェーズ
// =============================================================================

describe('createPhaseInstance - 正常系', () => {
  test('planning フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'planning'
    const phaseName: PhaseName = 'planning';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: PlanningPhase インスタンスが返される
    expect(result).toBeInstanceOf(PlanningPhase);
  });

  test('requirements フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'requirements'
    const phaseName: PhaseName = 'requirements';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: RequirementsPhase インスタンスが返される
    expect(result).toBeInstanceOf(RequirementsPhase);
  });

  test('design フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'design'
    const phaseName: PhaseName = 'design';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: DesignPhase インスタンスが返される
    expect(result).toBeInstanceOf(DesignPhase);
  });

  test('test_scenario フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'test_scenario'
    const phaseName: PhaseName = 'test_scenario';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: TestScenari
... (truncated)
```

## Turn 287: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 288: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 289: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 290: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "全10" -n tests/unit/core/phase-factory.test.ts'`
**ステータス**: completed (exit_code=0)

```text
74:// createPhaseInstance() - 正常系: 全10フェーズ
```

## Turn 291: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 292: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 293: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 294: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/commands/cleanup.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
143:        .toThrow(/Invalid phase range: 10-12. Valid range is 0-9/);
157:        .toThrow(/Invalid phase range: 4-0. Start must be less than or equal to end./);
171:        .toThrow(/Invalid phase name: abc/);
195:      const rangeStr = 'planning,invalid_phase,requirements';
199:        .toThrow(/Invalid phase name: invalid_phase/);
213:        .toThrow(/Invalid phase name/);
227:        .toThrow(/Invalid phase range: 10-10. Valid range is 0-9/);
```

## Turn 295: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 296: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '120,180p' tests/unit/commands/cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// Given: 数値範囲「0-0」
      const rangeStr = '0-0';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 単一要素の配列が返される
      expect(result).toEqual(['planning']);
    });
  });
});

describe('Cleanup コマンド - parsePhaseRange() 異常系', () => {
  // =============================================================================
  // parsePhaseRange_異常系_無効な範囲（10-12）
  // =============================================================================
  describe('parsePhaseRange_異常系_無効な範囲（10-12）', () => {
    test('範囲外の数値範囲が指定された場合にエラーがスローされる', () => {
      // Given: 範囲外の数値範囲
      const rangeStr = '10-12';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 10-12. Valid range is 0-9/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_逆順範囲（4-0）
  // =============================================================================
  describe('parsePhaseRange_異常系_逆順範囲（4-0）', () => {
    test('逆順の範囲が指定された場合にエラーがスローされる', () => {
      // Given: 逆順の範囲
      const rangeStr = '4-0';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 4-0. Start must be less than or equal to end./);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_無効な形式（abc）
  // =============================================================================
  describe('parsePhaseRange_異常系_無効な形式（abc）', () => {
    test('無効な形式が指定された場合にエラーがスローされる', () => {
      // Given: 無効な形式
      const rangeStr = 'abc';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase name: abc/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_空文字列
  // =============================================================================
  describe('parsePhaseRange_異常系_空文字列', () => {
    test('空文字列が指定された場合にエラーがスローされる', () => {
      // Given: 空文字列
```

## Turn 297: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 298: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 299: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 300: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "0-9" -n tests/unit/commands/cleanup.test.ts'`
**ステータス**: completed (exit_code=0)

```text
57:  // parsePhaseRange_正常系_数値範囲（0-9）
59:  describe('parsePhaseRange_正常系_数値範囲（0-9）', () => {
60:    test('数値範囲「0-9」が全フェーズ名配列に変換される', () => {
61:      // Given: 数値範囲「0-9」
62:      const rangeStr = '0-9';
227:        .toThrow(/Invalid phase range: 10-10. Valid range is 0-9/);
272:  // parsePhaseRange_エッジケース_最大範囲（0-9）
274:  describe('parsePhaseRange_エッジケース_最大範囲（0-9）', () => {
275:    test('最大範囲「0-9」が正しく処理される', () => {
277:      const rangeStr = '0-9';
```

## Turn 301: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 302: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '40,80p' tests/unit/commands/cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
const rangeStr = '0-4';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation'
      ]);
    });
  });

  // =============================================================================
  // parsePhaseRange_正常系_数値範囲（0-9）
  // =============================================================================
  describe('parsePhaseRange_正常系_数値範囲（0-9）', () => {
    test('数値範囲「0-9」が全フェーズ名配列に変換される', () => {
      // Given: 数値範囲「0-9」
      const rangeStr = '0-9';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 全フェーズ名が返される
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
```

## Turn 303: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 304: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 305: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '210,240p' tests/unit/commands/cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// When & Then: エラーがスローされる（パターンマッチしないため、フェーズ名として解釈されエラー）
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase name/);
    });
  });

  // =============================================================================
  // parsePhaseRange_異常系_開始が範囲外（-1-0）
  // =============================================================================
  describe('parsePhaseRange_異常系_範囲外の開始値', () => {
    test('開始値が範囲外の場合にエラーがスローされる（境界値テスト）', () => {
      // Given: 開始値10（範囲外）
      const rangeStr = '10-10';

      // When & Then: エラーがスローされる
      expect(() => parsePhaseRange(rangeStr))
        .toThrow(/Invalid phase range: 10-10. Valid range is 0-9/);
    });
  });
});

describe('Cleanup コマンド - エッジケーステスト', () => {
  // =============================================================================
  // parsePhaseRange_エッジケース_前後に空白
  // =============================================================================
  describe('parsePhaseRange_エッジケース_前後に空白', () => {
    test('前後に空白があってもトリムされて処理される', () => {
      // Given: 前後に空白がある文字列
      const rangeStr = '  0-4  ';
```

## Turn 306: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 307: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 308: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 309: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 310: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 311: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '260,300p' tests/unit/commands/cleanup.test.ts"`
**ステータス**: completed (exit_code=0)

```text
test('フェーズ名リストに空白があってもトリムされて処理される', () => {
      // Given: フェーズ名の前後に空白
      const rangeStr = ' planning , requirements , design ';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 期待通りのフェーズ名配列が返される
      expect(result).toEqual(['planning', 'requirements', 'design']);
    });
  });

  // =============================================================================
  // parsePhaseRange_エッジケース_最大範囲（0-9）
  // =============================================================================
  describe('parsePhaseRange_エッジケース_最大範囲（0-9）', () => {
    test('最大範囲「0-9」が正しく処理される', () => {
      // Given: 最大範囲
      const rangeStr = '0-9';

      // When: parsePhaseRange()を呼び出す
      const result = parsePhaseRange(rangeStr);

      // Then: 全10フェーズが返される
      expect(result.length).toBe(10);
      expect(result).toEqual([
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation'
      ]);
    });
  });

  // =============================================================================
```

## Turn 312: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 313: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 314: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 315: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "0-9" -n tests/unit/commands/cleanup.test.ts'`
**ステータス**: failed (exit_code=1)

## Turn 316: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 317: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/commands/finalize.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
127:        test_implementation: { ...basePhase },
165:      metadataManager.data.phases.test_implementation.status = 'completed';
208:      metadataManager.data.phases.test_implementation.status = 'completed';
244:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
337:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
409:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 318: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 319: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '100,160p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// 実ファイルシステムを使用（MetadataManagerが実際のfs-extraを呼び出すため）
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const basePhase = {
      status: 'pending',
      completed_steps: [],
      current_step: null,
      started_at: null,
      completed_at: null,
      review_result: null,
      retry_count: 0,
      rollback_context: null,
    };

    const metadataData = {
      issue_number: '123',
      issue_title: 'feat(cli): Add finalize command',
      issue_url: 'https://github.com/owner/repo/issues/123',
      created_at: '',
      updated_at: '',
      current_phase: 'planning',
      phases: {
        planning: { ...basePhase },
        requirements: { ...basePhase },
        design: { ...basePhase },
        test_scenario: { ...basePhase },
        implementation: { ...basePhase },
        test_implementation: { ...basePhase },
        testing: { ...basePhase },
        documentation: { ...basePhase },
        report: { ...basePhase },
        evaluation: { ...basePhase },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // UC-32: [REDACTED_TOKEN]正常系_全フェーズ完了
  // =============================================================================
  describe('UC-32: [REDACTED_TOKEN]正常系_全フェーズ完了', () => {
    test('全フェーズ完了時の PR 本文が正しく生成される', async () => {
      // Given: すべてのフェーズが completed 状態
      metadataManager.data.phases.planning.status = 'completed';
```

## Turn 320: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 321: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = 'tests/unit/commands/finalize.test.ts';
let text = fs.readFileSync(path,'utf8');
text = text.replace(/(test_implementation:["'^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { ...basePhase },'"\\n      testing:"'`);
// Also for explicit entries without basePhase
text = text.replace(/(test_implementation:[''^'"\\n]*\\n)(\\s*testing:)/g, "'`$1      test_preparation: { status: '"'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },\\n      testing:"'`);
fs.writeFileSync(path, text, '"'utf8');
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 322: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 323: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n tests/unit/commands/finalize.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
128:      test_preparation: { ...basePhase },
246:      test_preparation: { ...basePhase },
340:      test_preparation: { ...basePhase },
413:      test_preparation: { ...basePhase },
```

## Turn 324: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 325: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '230,260p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
const metadataData = {
      issue_number: '123',
      base_commit: 'abc123',
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'evaluation',
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      test_preparation: { ...basePhase },
      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
```

## Turn 326: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 327: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 328: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '320,360p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
jest.clearAllMocks();

    // 実ファイルシステムを使用
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const metadataData = {
      issue_number: '123',
      // base_commit が存在しない（意図的にエラーを発生させる）
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'evaluation',
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      test_preparation: { ...basePhase },
      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
```

## Turn 329: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 330: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '400,440p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
base_commit: 'abc123def456',
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'evaluation',
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      test_preparation: { ...basePhase },
      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // UC-04: dryRun_オプション_プレビュー表示
  // =============================================================================
```

## Turn 331: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 332: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = 'tests/unit/commands/finalize.test.ts';
let text = fs.readFileSync(path,'utf8');
text = text.replace(/\\s*test_preparation: \\{ \\.\\.\\.basePhase \\},/g,
  '        test_preparation: { status: \\'completed\\', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },');
fs.writeFileSync(path, text, 'utf8');
NODE"`
**ステータス**: completed (exit_code=0)

## Turn 333: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 334: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n -C 2 tests/unit/commands/finalize.test.ts'`
**ステータス**: completed (exit_code=0)

```text
125-        test_scenario: { ...basePhase },
126-        implementation: { ...basePhase },
127:        test_implementation: { ...basePhase },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
128-      testing: { ...basePhase },
129-        documentation: { ...basePhase },
--
242-        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
243-        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
244:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
245-      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
246-        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
--
335-        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
336-        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
337:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
338-      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
339-        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
--
407-        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
408-        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
409:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
410-      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
411-        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 335: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 336: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '118,135p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
created_at: '',
      updated_at: '',
      current_phase: 'planning',
      phases: {
        planning: { ...basePhase },
        requirements: { ...basePhase },
        design: { ...basePhase },
        test_scenario: { ...basePhase },
        implementation: { ...basePhase },
        test_implementation: { ...basePhase },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      testing: { ...basePhase },
        documentation: { ...basePhase },
        report: { ...basePhase },
        evaluation: { ...basePhase },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
```

## Turn 337: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 338: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 339: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 340: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '236,248p' tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
created_at: '',
      updated_at: '',
      current_phase: 'evaluation',
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 341: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 342: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 343: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 344: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "grep -n \"test_implementation: { status: 'completed'\" -n tests/unit/commands/finalize.test.ts"`
**ステータス**: completed (exit_code=0)

```text
245:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
339:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
411:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 345: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 346: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 347: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 348: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 349: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 350: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_preparation" -n tests/unit/commands/finalize.test.ts'`
**ステータス**: completed (exit_code=0)

```text
128:        test_preparation: { ...basePhase },
246:        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
340:        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
413:        test_preparation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 351: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 352: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/core/metadata-manager-model-config.test.ts'`
**ステータス**: completed (exit_code=0)

```text
24:    test_implementation: createPhase(),
```

## Turn 353: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 354: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,80p' tests/unit/core/metadata-manager-model-config.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MetadataManagerType = typeof import('../../../src/core/metadata-manager.js').MetadataManager;

const createPhase = () => ({
  status: 'pending',
  retry_count: 0,
  started_at: null,
  completed_at: null,
  review_result: null,
  output_files: [],
  current_step: null,
  completed_steps: [],
  rollback_context: null,
});

const createMockMetadata = () => {
  const phases: any = {
    planning: createPhase(),
    requirements: createPhase(),
    design: createPhase(),
    test_scenario: createPhase(),
    implementation: createPhase(),
    test_implementation: createPhase(),
    testing: createPhase(),
    documentation: createPhase(),
    report: createPhase(),
    evaluation: { ...createPhase(), decision: null, failed_phase: null, remaining_tasks: [], created_issue_url: null, abort_reason: null },
  };

  return {
    issue_number: '1',
    issue_url: 'https://example.com',
    issue_title: 'Test Issue',
    branch_name: 'ai-workflow/issue-1',
    repository: 'example/repo',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    phases,
    cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
  };
};

describe('MetadataManager - difficulty_analysis/model_config', () => {
  let MetadataManager: MetadataManagerType;
  let mockState: any;

  beforeEach(async () => {
    jest.resetModules();

    mockState = {
      data: createMockMetadata(),
      save: jest.fn(),
      migrate: jest.fn(),
      getPhaseStatus: jest.fn().mockReturnValue('pending'),
      setDesignDecision: jest.fn(),
      incrementRetryCount: jest.fn().mockReturnValue(0),
      updatePhaseStatus: jest.fn(),
    };

    jest.unstable_mockModule('../../../src/core/workflow-state.js', () => ({
      __esModule: true,
      WorkflowState: class {
        static load() {
          return mockState;
        }
      },
    }));

    jest.unstable_mockModule('../../../src/core/helpers/metadata-io.js', () => ({
      __esModule: true,
      formatTimestampForFilename: jest.fn(),
      backupMetadataFile: jest.fn().mockReturnValue('/tmp/backup.json'),
      removeWorkflowDirectory: jest.fn(),
    }));

    const module = await import('../../../src/core/metadata-manager.js');
    MetadataManager = module.MetadataManager;
  });
```

## Turn 355: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 356: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 357: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 358: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/helpers/validation.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
26:      validPhases.forEach((phase) => {
27:        expect(validatePhaseName(phase)).toBe(true);
36:      invalidPhases.forEach((phase) => {
37:        expect(validatePhaseName(phase)).toBe(false);
```

## Turn 359: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 360: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,80p' tests/unit/helpers/validation.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import {
  validatePhaseName,
  validateStepName,
  validateIssueNumber,
} from '../../../src/core/helpers/validation.js';

describe('validation', () => {
  describe('validatePhaseName', () => {
    // REQ-008: バリデーション処理の分離
    it('正常系: 有効なフェーズ名に対してtrueを返す', () => {
      // Given: 有効なフェーズ名のリスト（アンダースコア形式、プレフィックスなし）
      const validPhases = [
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation',
      ];

      // When/Then: 各フェーズ名でvalidatePhaseName関数を呼び出す
      validPhases.forEach((phase) => {
        expect(validatePhaseName(phase)).toBe(true);
      });
    });

    it('異常系: 無効なフェーズ名に対してfalseを返す', () => {
      // Given: 無効なフェーズ名のリスト
      const invalidPhases = ['invalid', 'foo', ''];

      // When/Then: 各フェーズ名でvalidatePhaseName関数を呼び出す
      invalidPhases.forEach((phase) => {
        expect(validatePhaseName(phase)).toBe(false);
      });
    });
  });

  describe('validateStepName', () => {
    it('正常系: 有効なステップ名に対してtrueを返す', () => {
      // Given: 有効なステップ名のリスト
      const validSteps = ['execute', 'review', 'revise'];

      // When/Then: 各ステップ名でvalidateStepName関数を呼び出す
      validSteps.forEach((step) => {
        expect(validateStepName(step)).toBe(true);
      });
    });

    it('異常系: 無効なステップ名に対してfalseを返す', () => {
      // Given: 無効なステップ名のリスト
      const invalidSteps = ['invalid', 'foo', ''];

      // When/Then: 各ステップ名でvalidateStepName関数を呼び出す
      invalidSteps.forEach((step) => {
        expect(validateStepName(step)).toBe(false);
      });
    });
  });

  describe('validateIssueNumber', () => {
    it('正常系: 有効な数値に対してtrueを返す', () => {
      // Given: 1以上の整数のリスト
      const validNumbers = [1, 26, 1000];

      // When/Then: 各数値でvalidateIssueNumber関数を呼び出す
      validNumbers.forEach((num) => {
        expect(validateIssueNumber(num)).toBe(true);
      });
    });

    it('正常系: 有効な文字列に対してtrueを返す', () => {
      // Given: '1'以上の整数文字列のリスト
      const validStrings = ['1', '26', '1000'];

      // When/Then: 各文字列でvalidateIssueNumber関数を呼び出す
      validStrings.forEach((str) => {
```

## Turn 361: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 362: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 363: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 364: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/utils/pr-body-checklist-utils.test.ts'`
**ステータス**: completed (exit_code=0)

```text
34:      'test_implementation',
56:    ['test_implementation', 'Phase 5: Test Implementation'],
```

## Turn 365: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 366: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/utils/pr-body-checklist-utils.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { describe, it, expect } from '@jest/globals';
import {
  PHASE_CHECKLIST_MAP,
  [REDACTED_TOKEN],
  [REDACTED_TOKEN],
} from '../../../src/utils/pr-body-checklist-utils.js';

const WORKFLOW_HEADER_JA = '### 🔄 ワークフロー進捗';
const WORKFLOW_HEADER_EN = '### 🔄 Workflow Progress';

// Base checklist fixture mirrors the PR body template used in workflows.
const uncheckedChecklist = [
  '- [ ] Phase 0: Planning',
  '- [ ] Phase 1: Requirements',
  '- [ ] Phase 2: Design',
  '- [ ] Phase 3: Test Scenario',
  '- [ ] Phase 4: Implementation',
  '- [ ] Phase 5: Test Implementation',
  '- [ ] Phase 6: Testing',
  '- [ ] Phase 7: Documentation',
  '- [ ] Phase 8: Report',
].join('\n');

const basePrBody = `${WORKFLOW_HEADER_EN}\n\n${uncheckedChecklist}`;

describe('PHASE_CHECKLIST_MAP', () => {
  it('contains all PhaseName values with correct labels', () => {
    const expectedPhases = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    expect(Object.keys(PHASE_CHECKLIST_MAP).sort()).toEqual(expectedPhases.sort());
    expect(Object.values(PHASE_CHECKLIST_MAP)).toContain('Phase 0: Planning');
    expect(PHASE_CHECKLIST_MAP.requirements).toBe('Phase 1: Requirements');
    expect(PHASE_CHECKLIST_MAP.report).toBe('Phase 8: Report');
  });
});

describe('[REDACTED_TOKEN]', () => {
  // Happy path coverage for each phase plus idempotency and formatting edge cases.
  it.each([
    ['planning', 'Phase 0: Planning'],
    ['requirements', 'Phase 1: Requirements'],
    ['design', 'Phase 2: Design'],
    ['test_scenario', 'Phase 3: Test Scenario'],
    ['implementation', 'Phase 4: Implementation'],
    ['test_implementation', 'Phase 5: Test Implementation'],
    ['testing', 'Phase 6: Testing'],
    ['documentation', 'Phase 7: Documentation'],
    ['report', 'Phase 8: Report'],
  ] as const)(
    'marks %s as completed when unchecked',
    (phaseName, displayName) => {
      const updated = [REDACTED_TOKEN](basePrBody, phaseName);

      expect(updated).toContain(`- [x] ${displayName}`);
      expect(updated).not.toContain(`- [ ] ${displayName}`);
    },
  );

  it('does not change already checked items (idempotent)', () => {
    const checkedBody = '- [x] Phase 1: Requirements';
    const updated = [REDACTED_TOKEN](checkedBody, 'requirements');

    expect(updated).toBe(checkedBody);
  });

  it('returns identical result across multiple calls (idempotent)', () => {
    const updatedOnce = [REDACTED_TOKEN](basePrBody, 'requirements');
    const updatedTwice = [REDACTED_TOKEN](updatedOnce, 'requirements');

    expect(updatedTwice).toBe(updatedOnce);
  });

  it('returns empty string when PR body is empty', () => {
    expect([REDACTED_TOKEN]('', 'requirements')).toBe('');
  });

  it('returns original content when checklist is missing', () => {
    const content = 'Some content without checklist';
    expect([REDACTED_TOKEN](content, 'requirements')).toBe(content);
  });

  it('updates only the targeted phase and preserves others', () => {
    const updated = [REDACTED_TOKEN](basePrBody, 'design');

    expect(updated).toContain('- [x] Phase 2: Design');
    expect(updated).toContain('- [ ] Phase 1: Requirements');
    expect(updated).toContain('- [ ] Phase 8: Report');
  });

  it('preserves non-checklist content in the PR body', () => {
    const prBody = `## AI Workflow PR\n\n${uncheckedChecklist}\n\n### Notes\n- keep this`;
    const updated = [REDACTED_TOKEN](prBody, 'requirements');

    expect(updated).toContain('## AI Workflow PR');
    expect(updated).toContain('### Notes');
    expect(updated).toContain('- keep this');
  });

  it('retains indentation on checklist items', () => {
    const indentedBody = `  - [ ] Phase 1: Requirements\n  - [ ] Ph
... (truncated)
```

## Turn 367: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 368: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' src/utils/pr-body-checklist-utils.ts"`
**ステータス**: completed (exit_code=0)

```text
import { PhaseName } from '../types.js';

/**
 * Mapping between internal phase names and PR checklist display labels.
 */
export const PHASE_CHECKLIST_MAP: Record<PhaseName, string> = {
  planning: 'Phase 0: Planning',
  requirements: 'Phase 1: Requirements',
  design: 'Phase 2: Design',
  test_scenario: 'Phase 3: Test Scenario',
  implementation: 'Phase 4: Implementation',
  test_implementation: 'Phase 5: Test Implementation',
  testing: 'Phase 6: Testing',
  documentation: 'Phase 7: Documentation',
  report: 'Phase 8: Report',
  evaluation: 'Phase 9: Evaluation',
};

/**
 * Update workflow checklist in the PR body by marking the given phase as completed.
 *
 * This function is pure: it does not mutate the input string.
 */
export function [REDACTED_TOKEN](prBody: string, phaseName: PhaseName): string {
  const phaseDisplayName = PHASE_CHECKLIST_MAP[phaseName];
  if (!phaseDisplayName) {
    return prBody;
  }

  // Escape special characters to avoid regex injection and match the exact checklist line.
  const [REDACTED_TOKEN] = phaseDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(\\s*)- \\[ \\] ${[REDACTED_TOKEN]}`, 'gm');
  const replacement = `$1- [x] ${phaseDisplayName}`;

  return prBody.replace(pattern, replacement);
}

/**
 * Detect whether the PR body contains the workflow checklist section.
 */
export function [REDACTED_TOKEN](prBody: string): boolean {
  return prBody.includes('ワークフロー進捗') || prBody.includes('Workflow Progress');
}
```

## Turn 369: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 370: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 371: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 372: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 373: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/git/commit-message-builder.test.ts'`
**ステータス**: completed (exit_code=0)

```text
84:      { name: 'test_implementation', number: 6 },
```

## Turn 374: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 375: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '70,95p' tests/unit/git/commit-message-builder.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// Then: Review が N/A として表示される
    expect(message).toContain('[ai-workflow] Phase 3 (design) - completed');
    expect(message).toContain('Review: N/A');
  });

  test('[REDACTED_TOKEN]正常系_全フェーズの番号計算', () => {
    // Given: すべてのフェーズ名
    const phases = [
      { name: 'planning', number: 1 },
      { name: 'requirements', number: 2 },
      { name: 'design', number: 3 },
      { name: 'test_scenario', number: 4 },
      { name: 'implementation', number: 5 },
      { name: 'test_implementation', number: 6 },
      { name: 'testing', number: 7 },
      { name: 'documentation', number: 8 },
      { name: 'report', number: 9 },
      { name: 'evaluation', number: 10 },
    ];

    // When/Then: 各フェーズに対して正しい Phase番号が計算される
    phases.forEach((phase) => {
      const message = messageBuilder.createCommitMessage(phase.name, 'completed', 'PASS');
      expect(message).toContain(`Phase ${phase.number} (${phase.name})`);
    });
```

## Turn 376: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 377: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 378: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 379: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/git/file-selector.test.ts'`
**ステータス**: completed (exit_code=0)

```text
246:  test('[REDACTED_TOKEN]正常系[REDACTED_TOKEN]フェーズ', async () => {
247:    // Given: test_implementation フェーズで、テストファイルが変更されている
259:    const files = await fileSelector.[REDACTED_TOKEN]('test_implementation');
```

## Turn 380: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 381: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phase" -n tests/unit/github/issue-ai-generator.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
37:  phase: 'test_implementation',
250:        phase: string;
```

## Turn 382: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 383: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "PhaseName" -n tests/integration/base-phase-refactored.test.ts'`
**ステータス**: completed (exit_code=0)

```text
15:import { PhaseName, [REDACTED_TOKEN] } from '../../src/types.js';
56:    phaseName: PhaseName,
77:  const completedSteps: Record<PhaseName, string[]> = {
100:    getCompletedSteps: jest.fn<any>((phase: PhaseName) => completedSteps[phase] || []),
101:    addCompletedStep: jest.fn<any>((phase: PhaseName, step: string) => {
```

## Turn 384: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 385: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '60,90p' tests/integration/base-phase-refactored.test.ts"`
**ステータス**: completed (exit_code=0)

```text
): string {
    return this.[REDACTED_TOKEN](phaseName, outputFileName, fallbackMessage, issueNumberOverride);
  }

  public async [REDACTED_TOKEN](force?: boolean): Promise<void> {
    return this.[REDACTED_TOKEN](force);
  }

  public async [REDACTED_TOKEN](): Promise<void> {
    return this.cleanupWorkflowLogs();
  }
}

/**
 * モック MetadataManager を作成
 */
function [REDACTED_TOKEN](workflowDir: string, repoPath: string): any {
  const completedSteps: Record<PhaseName, string[]> = {
    planning: [],
    requirements: [],
    design: [],
    test_scenario: [],
    implementation: [],
    test_implementation: [],
    testing: [],
    documentation: [],
    report: [],
    evaluation: [],
  };

  return {
```

## Turn 386: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 387: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 388: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 389: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phases" -n tests/integration/evaluation-phase-file-save.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
20:import { EvaluationPhase } from '../../src/phases/evaluation.js';
66:      phases: {
98:All phases completed successfully.
200:      phases: {},
247:      expect(metadata.data.phases.evaluation).toBeDefined();
248:      expect(metadata.data.phases.evaluation.decision).toBe('PASS_WITH_ISSUES');
249:      expect(metadata.data.phases.evaluation.remaining_tasks).toBeDefined();
290:      expect(metadata.data.phases.evaluation).toBeDefined();
291:      expect(metadata.data.phases.evaluation.decision).toBe('FAIL_PHASE_2');
292:      expect(metadata.data.phases.evaluation.failed_phase).toBe('design');
```

## Turn 390: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 391: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '60,90p' tests/integration/evaluation-phase-file-save.test.ts"`
**ステータス**: completed (exit_code=0)

```text
await fs.writeJson(metadataFile, {
      issue_number: '5',
      issue_title: 'Test Issue #5',
      repository: 'test/repo',
      branch_name: 'ai-workflow/issue-5',
      current_phase: 'evaluation',
      phases: {
        planning: { status: 'completed', started_at: new Date().toISOString() },
        requirements: { status: 'completed', started_at: new Date().toISOString() },
        design: { status: 'completed', started_at: new Date().toISOString() },
        test_scenario: { status: 'completed', started_at: new Date().toISOString() },
        implementation: { status: 'completed', started_at: new Date().toISOString() },
        test_implementation: { status: 'completed', started_at: new Date().toISOString() },
        testing: { status: 'completed', started_at: new Date().toISOString() },
        documentation: { status: 'completed', started_at: new Date().toISOString() },
        report: { status: 'completed', started_at: new Date().toISOString() },
        evaluation: { status: 'in_progress', started_at: new Date().toISOString() },
      },
    });

    metadata = new MetadataManager(metadataFile);
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
  });

  test('2-1: ファイルが存在する場合（正常系）', async () => {
    // Given: evaluation_report.md が存在する
    const outputDir = path.join(workflowDir, '10_evaluation', 'output');
```

## Turn 392: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 393: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 394: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 395: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/integration/finalize-command.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
83:    test_implementation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
155:        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 396: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 397: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '70,90p' tests/integration/finalize-command.test.ts"`
**ステータス**: completed (exit_code=0)

```text
test_code_strategy: null,
  },
  cost_tracking: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
  },
  phases: {
    planning: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    requirements: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    design: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_scenario: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    implementation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_implementation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    testing: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    documentation: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    report: { status: 'pending', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    evaluation: {
      status: 'pending',
      retry_count: 0,
      started_at: null,
```

## Turn 398: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 399: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 400: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 401: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '140,170p' tests/integration/finalize-command.test.ts"`
**ステータス**: completed (exit_code=0)

```text
base_commit: 'abc123def456',
      issue_title: 'feat(cli): Add finalize command',
      issue_url: 'https://github.com/owner/repo/issues/123',
      target_repository: {
        owner: 'owner',
        repo: 'repo',
        path: process.cwd(),
        github_name: 'owner/repo',
        remote_url: 'https://github.com/owner/repo.git',
      },
      phases: {
        planning: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'completed', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
```

## Turn 402: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 403: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 404: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 405: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,120p' tests/unit/jenkins/skip-phases.test.ts"`
**ステータス**: completed (exit_code=0)

```text
/**
 * Jenkins All Phases ジョブに追加された SKIP_PHASES 連携の存在と後方互換性を
 * 静的に検証するユニットテスト。Groovy を直接実行せず、ファイル内容を
 * テキストとして確認することで、誤削除や意図しない変更を早期検知する。
 */

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const dslPath = path.resolve(
  repoRoot,
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
);
const jenkinsfilePath = path.resolve(
  repoRoot,
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
);

describe('Jenkins Job DSL: SKIP_PHASES パラメータ', () => {
  test('stringParam が DRY_RUN の直後かつ SKIP_REVIEW より前に定義されている', () => {
    // Jenkins パラメータの並び順が崩れると UI の分かりやすさが損なわれるため順序を固定で確認
    const content = fs.readFileSync(dslPath, 'utf8');

    const dryRunIndex = content.indexOf("booleanParam('DRY_RUN'");
    const skipPhasesIndex = content.indexOf("stringParam('SKIP_PHASES'");
    const skipReviewIndex = content.indexOf("booleanParam('SKIP_REVIEW'");

    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(skipPhasesIndex).toBeGreaterThan(-1);
    expect(skipReviewIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeLessThan(skipPhasesIndex);
    expect(skipPhasesIndex).toBeLessThan(skipReviewIndex);
  });

  test('ヘルプテキストに全フェーズ名が列挙され trim() で整形されている', () => {
    // 有効フェーズの一覧が消えると利用者が入力値を判断できないため内容を検証
    const content = fs.readFileSync(dslPath, 'utf8');

    expect(content).toMatch(/stringParam\('SKIP_PHASES',\s*''/);
    expect(content).toContain(".stripIndent().trim()");

    const expectedPhases = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    expectedPhases.forEach((phase) => {
      expect(content).toContain(phase);
    });
  });
});

describe('Jenkinsfile (all-phases): skipPhasesOption の組み込み', () => {
  test('Validate Parameters ステージで SKIP_PHASES がログ出力される', () => {
    // パラメータが UI で何が渡ったかを把握するためのログが残っていることを確認
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toContain("echo \"Skip Phases: ${params.SKIP_PHASES ?: '(none)'}\"");
  });

  test('skipPhasesOption が trim() と三項演算子で安全に生成される', () => {
    // 空白のみの入力で --skip-phases が渡らないことを保証するため、生成式を固定文字列で検証
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toContain(
      "def skipPhasesOption = params.SKIP_PHASES?.trim() ? \"--skip-phases ${params.SKIP_PHASES.trim()}\" : ''",
    );
  });

  test('Execute All Phases ステージの sh コマンドに skipPhasesOption が渡される', () => {
    // Jenkinsfile で変数を定義してもコマンドに渡していなければ無効なので、埋め込みを確認
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toMatch(/node dist\/index\.js execute[\s\S]*\n\s+\$\{skipPhasesOption}/);
  });
});
```

## Turn 406: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 407: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 408: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 409: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '1,80p' tests/unit/phases/evaluation-phase-helpers.test.ts"`
**ステータス**: completed (exit_code=0)

```text
import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { EvaluationPhase } from '../../../src/phases/evaluation.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';

const TEST_ROOT = path.join(process.cwd(), 'tests', 'temp', '[REDACTED_TOKEN]');
const WORKFLOW_DIR = path.join(TEST_ROOT, '.ai-workflow', 'issue-7');
const METADATA_PATH = path.join(WORKFLOW_DIR, 'metadata.json');
const TARGET_REPO_PATH = path.join(TEST_ROOT, 'repo');

class TestGithubClient {}

describe('EvaluationPhase helper behaviors', () => {
  let metadataManager: MetadataManager;
  let evaluationPhase: EvaluationPhase;

  beforeEach(async () => {
    await fs.remove(TEST_ROOT);
    await fs.ensureDir(WORKFLOW_DIR);
    await fs.ensureDir(TARGET_REPO_PATH);

    const metadata = {
      version: '0.2.0',
      issue_number: '7',
      issue_title: 'Helper Coverage',
      issue_url: 'https://example.com/issues/7',
      workflow_dir: WORKFLOW_DIR,
      repository: 'owner/repo',
      branch_name: 'ai-workflow/issue-7',
      target_repository: {
        repo: 'repo',
        github_name: 'owner/repo',
        path: TARGET_REPO_PATH,
      },
      language: 'ja',
      phases: {
        planning: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        requirements: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        design: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        test_scenario: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        implementation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        test_implementation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        testing: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        documentation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        report: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        evaluation: { status: 'in_progress', started_at: '', completed_at: '', retry_count: 0 },
      },
      design_decisions: {},
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
    };

    await fs.writeJSON(METADATA_PATH, metadata, { spaces: 2 });
    metadataManager = new MetadataManager(METADATA_PATH);

    evaluationPhase = new EvaluationPhase({
      workingDir: TEST_ROOT,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient: new TestGithubClient() as any,
      skipDependencyCheck: true,
      ignoreDependencies: true,
    });
  });

  afterAll(async () => {
    await fs.remove(TEST_ROOT);
  });

  test('エージェントログから評価セクションを抽出できる', () => {
    const log = [
      '# 評価レポート',
      '内容',
      'DECISION: PASS',
      '## 詳細',
      '- item',
    ].join('\n');

    const result = (evaluationPhase as any).[REDACTED_TOKEN](log);
```

## Turn 410: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 411: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 412: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 413: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n tests/unit/prompts/issue-207-prompt-simplification.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
55:      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'ja', 'execute.txt');
71:      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'ja', 'execute.txt');
204:        '{[REDACTED_TOKEN]}',
289:      { phase: 'Phase 5', dir: 'test_implementation' },
463:        'test_implementation',
484:        'test_implementation',
```

## Turn 414: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 415: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "phases" -n tests/integration/rollback-workflow.test.ts | head'`
**ステータス**: completed (exit_code=0)

```text
38:    phases: {
210:      expect(reloadedManager.data.phases.implementation.status).toBe('in_progress');
211:      expect(reloadedManager.data.phases.implementation.current_step).toBe('revise');
212:      expect(reloadedManager.data.phases.implementation.completed_at).toBeNull();
215:      expect(reloadedManager.data.phases.implementation.rollback_context).toBeDefined();
217:        reloadedManager.data.phases.implementation.rollback_context?.reason
221:      expect(reloadedManager.data.phases.test_implementation.status).toBe('pending');
222:      expect(reloadedManager.data.phases.testing.status).toBe('pending');
249:        reloadedManager.data.phases.implementation.rollback_context?.reason
254:        reloadedManager.data.phases.implementation.rollback_context?.review_result
```

## Turn 416: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 417: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '30,60p' tests/integration/rollback-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
*/
  const [REDACTED_TOKEN] = (issueNumber: string) => ({
    issue_number: issueNumber,
    issue_url: `https://__GITHUB_URL_6__/issues/${issueNumber}`,
    issue_title: 'Test Issue for Rollback',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_phase: 'testing',
    phases: {
      planning: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      requirements: {
        status: 'completed',
        completed_steps: ['execute', 'review'],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        review_result: null,
        retry_count: 0,
        rollback_context: null,
      },
      design: {
        status: 'completed',
```

## Turn 418: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 419: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -n "test_implementation" -n -C 2 tests/integration/rollback-workflow.test.ts'`
**ステータス**: completed (exit_code=0)

```text
87-        rollback_context: null,
88-      },
89:      test_implementation: {
90-        status: 'completed',
91-        completed_steps: ['execute', 'review'],
--
219-
220-      // 3. 後続フェーズがリセットされている
221:      expect(reloadedManager.data.phases.test_implementation.status).toBe('pending');
222-      expect(reloadedManager.data.phases.testing.status).toBe('pending');
223-    });
--
351-        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
352-        implementation: { status: 'in_progress', completed_steps: ['execute'], current_step: 'review', started_at: new Date().toISOString(), completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
353:        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
354-        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
355-        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
--
463-        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
464-        implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
465:        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
466-        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
467-        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 420: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 421: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 422: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 423: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 424: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 425: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '346,360p' tests/integration/rollback-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
// ディレクトリ作成
    await fs.ensureDir(workflowDir);

    // 初期メタデータを作成
    const initialMetadata = {
      issue_number: '90',
      issue_url: 'https://github.com/owner/repo/issues/90',
      issue_title: 'Test Issue',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_phase: 'implementation',
      phases: {
        planning: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
```

## Turn 426: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '360,380p' tests/integration/rollback-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'in_progress', completed_steps: ['execute'], current_step: 'review', started_at: new Date().toISOString(), completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };
    await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });

    metadataManager = new MetadataManager(metadataPath);
  });
```

## Turn 427: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 428: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 429: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 430: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '450,470p' tests/integration/rollback-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
let workflowDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    // 実際の一時ディレクトリを作成
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), '[REDACTED_TOKEN]-'));
    workflowDir = path.join(testDir, '.ai-workflow', 'issue-90');
    metadataPath = path.join(workflowDir, 'metadata.json');

    // ディレクトリ作成
    await fs.ensureDir(workflowDir);

    // 初期メタデータを作成（rollback_context、rollback_historyが存在しない古い形式）
    const initialMetadata = {
      issue_number: '90',
      issue_url: 'https://github.com/owner/repo/issues/90',
      issue_title: 'Test Issue',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_phase: 'planning',
```

## Turn 431: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "sed -n '470,500p' tests/integration/rollback-workflow.test.ts"`
**ステータス**: completed (exit_code=0)

```text
current_phase: 'planning',
      phases: {
        planning: { status: 'in_progress', completed_steps: [], current_step: 'execute', started_at: new Date().toISOString(), completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        requirements: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        design: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_scenario: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        test_implementation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        testing: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        documentation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        report: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
        evaluation: { status: 'pending', completed_steps: [], current_step: null, started_at: null, completed_at: null, review_result: null, retry_count: 0, rollback_context: null },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      // rollback_history フィールドは意図的に省略（古い形式）
    };
    await fs.writeJson(metadataPath, initialMetadata, { spaces: 2 });

    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(async () => {
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
  });
```

## Turn 432: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 433: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 434: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 435: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = 'tests';
const files = [];
(function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir, entry.name);
    if(entry.isDirectory()) walk(full); else files.push(full);
  }
})(root);
const suspects = [];
for(const file of files){
  const text = fs.readFileSync(file,'utf8');
  if(text.includes('test_implementation') && "'!text.includes('"'test_preparation')){
    suspects.push(file);
  }
}
console.log(suspects.join('\\n'));
NODE"`
**ステータス**: completed (exit_code=0)

```text
tests/integration/followup-issue-llm.test.ts
tests/integration/phase-template-refactoring.test.ts
tests/integration/preset-workflow.test.ts
tests/unit/commands/execute/options-parser.test.ts
tests/unit/git/file-selector.test.ts
tests/unit/github/issue-ai-generator.test.ts
tests/unit/github/issue-client-followup.test.ts
tests/unit/github/issue-client-llm.test.ts
tests/unit/metadata-manager.test.ts
tests/unit/prompts/issue-207-prompt-simplification.test.ts
tests/unit/prompts/prompt-simplification.test.ts
```

## Turn 436: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 437: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 438: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc "cat <<'EOF' > /tmp/ai-workflow-repos-196-2db81b66/ai-workflow-agent/.ai-workflow/issue-692/05_test_implementation/output/test-implementation.md
# テスト実装完了レポート

## テストファイル一覧

| ファイル | テスト数 | カバー対象 |
|---------|---------|-----------|
| "'`tests/unit/phases/test-preparation.test.ts` | 7 | [REDACTED_TOKEN] の execute/review/revise と例外系 |
| `tests/unit/prompts/test-preparation-prompts.test.ts` | 5 | test_preparation プロンプトの存在・テンプレート変数・言語指示 |
| `tests/unit/phase-dependencies.test.ts` | 6 | test_preparation 依存関係/プリセット説明の追加検証 |
| `tests/unit/core/model-optimizer.test.ts` | 3 | test_preparation のモデルマッピング |
| `tests/unit/phases/base-phase-fallback.test.ts` | 2 | test_preparation のログ抽出ヘッダー判定 |

## 既存テストの更新概要
- フェーズ番号シフト（`06`→`07` 以降）に伴う期待値更新
- フェーズ一覧への `test_preparation` 追加（依存関係/メタデータ/プリセット/チェックリスト）
- スキップ・ロールバック・クリーンアップ系テストの期待値更新

## テストカバレッジ

- ユニットテスト: 23件（追加分）
- 統合テスト: 0件（追加分なし、期待値更新のみ）
- BDDテスト: 0件
- カバレッジ率: 算出不可（未計測）

## テスト実行状況
- 未実行（このフェーズではテスト実行を行っていません）
EOF
'`
**ステータス**: completed (exit_code=0)

## Turn 439: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 440: ツール実行

**種別**: コマンド実行
**コマンド**: `/bin/bash -lc 'grep -R "test_implementation.*test_preparation" -n tests | head'`
**ステータス**: completed (exit_code=0)

```text
tests/integration/cleanup-command.test.ts:430:    for (const phaseName of ['[REDACTED_TOKEN]', '06_test_preparation', '07_testing', '08_documentation', '09_report']) {
tests/integration/preset-execution.test.ts:79:    expect(phases).toEqual(['planning', 'test_implementation', 'test_preparation', 'testing']);
tests/integration/skip-phases.test.ts:116:    const skipTargets: PhaseName[] = ['test_scenario', 'test_implementation', 'test_preparation', 'testing'];
tests/unit/commands/execute.test.ts:164:      expect(result).toEqual(['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']);
tests/unit/commands/execute/agent-setup.test.ts:829:      'implementation', 'test_implementation', 'test_preparation', 'testing',
tests/unit/commands/execute/agent-setup.test.ts:896:      'implementation', 'test_implementation', 'test_preparation', 'testing',
tests/unit/commands/execute/workflow-executor.test.ts:129:              'implementation', 'test_implementation', 'test_preparation', 'testing',
tests/unit/phase-dependencies.test.ts:63:    expect(PHASE_PRESETS['implementation']).toEqual(['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']);
tests/unit/phase-dependencies.test.ts:66:    expect(PHASE_PRESETS['testing']).toEqual(['planning', 'test_implementation', 'test_preparation', 'testing']);
```

## Turn 441: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 442: ツール実行

**種別**: reasoning
**ステータス**: completed

## Turn 443: ツール実行

**種別**: agent_message
**ステータス**: completed

## Turn 444: 実行完了

**ステータス**: completed
**所要時間**: 1428914ms
**ターン数**: N/A

---

**経過時間**: 1428914ms
**開始**: 2026/2/17 7:57:06
**終了**: 2026/2/17 8:20:55