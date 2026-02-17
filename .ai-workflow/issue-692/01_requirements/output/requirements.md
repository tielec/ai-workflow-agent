# 要件定義書: Issue #692 - test_preparation フェーズの追加

## 0. Planning Document の確認

Planning Document（`.ai-workflow/issue-692/00_planning/output/planning.md`）の分析結果を以下に要約する。

### 開発計画の全体像

- **実装戦略**: CREATE（新規フェーズクラスとプロンプトファイルの新規作成が中心）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（新規テスト作成 + 既存テスト拡張）
- **複雑度**: 中程度〜複雑（見積もり工数: 16〜24時間）
- **リスク評価**: 中（フェーズ番号変更による既存ワークフローへの影響が主なリスク）

### スコープ

- 新規 `TestPreparationPhase` クラスの実装
- 新規プロンプトファイル 6 ファイル（日本語/英語 x execute/review/revise）の作成
- 既存 7 ファイルの変更（`types.ts`, `execute.ts`, `phase-dependencies.ts`, `phase-factory.ts`, `base-phase.ts`, `agent-setup.ts`, `model-optimizer.ts`）
- フェーズ番号のシフト（testing〜evaluation が 06〜09 から 07〜10 に変更）
- ユニットテスト・統合テストの新規作成および既存テスト修正

### 技術選定

- 既存の `BasePhase` 抽象クラスを継承し、`TestImplementationPhase` のパターンをテンプレートとして流用
- エージェント優先順位は `codex-first`（コマンド実行が主作業のため）
- モデル設定は `testing` フェーズと同等

### リスク

1. フェーズ番号シフトによる既存ワークフロー破損（影響度: 高、確率: 低）
2. 既存テストの大量修正（影響度: 中、確率: 中）
3. プロンプト品質の不足（影響度: 中、確率: 中）
4. プリセット更新の漏れ（影響度: 低、確率: 中）
5. model-optimizer マッピング漏れ（影響度: 低、確率: 低）

### スケジュール

8 フェーズ構成（要件定義 → 設計 → テストシナリオ → 実装 → テストコード実装 → テスト実行 → ドキュメント → レポート）で 16〜24 時間。

---

## 1. 概要

### 背景

現在の AI Workflow Agent の `execute` コマンドは、10 フェーズのワークフロー（Planning → Evaluation）で構成されている。テスト実装（`test_implementation`）フェーズの後に直接テスト実行（`testing`）フェーズが実行されるが、Docker コンテナ内の実行環境が整っていないためにテストが失敗するケースが頻発している。

### 問題の詳細

Docker 環境のベースイメージは `Node.js 20-slim` であり、以下のツールのみがプリインストールされている：

- Node.js 20 + npm
- Git, curl, jq, unzip
- GitHub CLI (gh), AWS CLI v2, Pulumi CLI

Python, Go, Java, Rust, Ruby などの言語ランタイムは含まれておらず、対象リポジトリの開発言語に応じた環境構築が必要となる。具体的には以下の問題が報告されている：

1. **言語ランタイムの不一致**: Python のバージョンが対象リポジトリの要件と合致しない（例: Python 3.11 が必要だが 3.9 がインストールされている）
2. **依存パッケージの未解決**: `requirements.txt`, `package.json` 等の依存関係が解決されていない
3. **テストフレームワークの未セットアップ**: pytest, Jest, JUnit 等が利用可能でない
4. **環境変数・設定ファイルの未準備**: テスト実行に必要な設定が準備されていない

### 目的

`test_implementation` と `testing` の間に新規の `test_preparation` フェーズを挿入し、テスト実行前に環境を自動準備することで、テスト失敗率を削減し、ワークフロー全体の成功率を向上させる。

### ビジネス価値

- **ワークフロー成功率の向上**: テスト環境未準備による失敗を事前に防止
- **開発者体験の改善**: テスト実行前の手動環境構築が不要に
- **CI/CD パイプラインの安定化**: Jenkins 統合での Docker コンテナ内テスト実行の信頼性向上

### 技術的価値

- **関心の分離**: テストコード実装（test_implementation）、テスト環境準備（test_preparation）、テスト実行（testing）の責務が明確に分離
- **拡張性**: 将来的に新しい言語やフレームワークのサポートを容易に追加可能
- **再利用性**: 環境準備のナレッジが `test-preparation.md` として成果物に記録され、後続のワークフローで参照可能

---

## 2. 機能要件

### FR-001: PhaseName 型の拡張（優先度: 高）

**説明**: `src/types.ts` の `PhaseName` 型ユニオンに `'test_preparation'` リテラル型を追加する。

**詳細**:
- `PhaseName` 型に `'test_preparation'` を `'test_implementation'` と `'testing'` の間に追加する
- `PhasesMetadata` 型は `PhaseName` を使用した Mapped Type であるため、`test_preparation` が自動的に含まれる（追加の型変更は不要）
- TypeScript のコンパイラが `PhaseName` を使用するすべての `Record<PhaseName, ...>` 型で `test_preparation` のエントリを要求するようになるため、漏れが静的に検出される

**検証条件**: `npm run lint`（TypeScript 型チェック）がエラーなく完了すること

---

### FR-002: PHASE_ORDER 配列の更新（優先度: 高）

**説明**: `src/commands/execute.ts` の `PHASE_ORDER` 配列に `'test_preparation'` を追加し、実行順序を確立する。

**詳細**:
- `'test_implementation'` の直後、`'testing'` の直前に `'test_preparation'` を挿入する
- 変更後のフェーズ順序:
  ```
  planning → requirements → design → test_scenario → implementation →
  test_implementation → test_preparation → testing → documentation → report → evaluation
  ```
- フェーズ総数が 10 から 11 に増加する

**検証条件**: `PHASE_ORDER.indexOf('test_preparation')` が `PHASE_ORDER.indexOf('test_implementation') + 1` と等しく、かつ `PHASE_ORDER.indexOf('testing') - 1` と等しいこと

---

### FR-003: フェーズ依存関係の定義（優先度: 高）

**説明**: `src/core/phase-dependencies.ts` の `PHASE_DEPENDENCIES` マップを更新し、`test_preparation` の依存関係を定義する。

**詳細**:
- `test_preparation: ['test_implementation']` を追加（test_preparation は test_implementation に依存）
- `testing` の依存関係を `['test_implementation']` から `['test_preparation']` に変更（testing は test_preparation に依存）
- 依存関係グラフに循環依存が発生しないことを保証する

**検証条件**:
- `PHASE_DEPENDENCIES['test_preparation']` が `['test_implementation']` と等しいこと
- `PHASE_DEPENDENCIES['testing']` が `['test_preparation']` と等しいこと
- `detectCircularDependencies()` が空配列を返すこと

---

### FR-004: フェーズプリセットの更新（優先度: 高）

**説明**: `src/core/phase-dependencies.ts` の `PHASE_PRESETS` および `PRESET_DESCRIPTIONS` を更新し、関連プリセットに `test_preparation` を含める。

**詳細**:
- `'implementation'` プリセットに `'test_preparation'` を追加:
  ```
  ['planning', 'implementation', 'test_implementation', 'test_preparation', 'testing', 'documentation', 'report']
  ```
- `'testing'` プリセットに `'test_preparation'` を追加:
  ```
  ['planning', 'test_implementation', 'test_preparation', 'testing']
  ```
- `PRESET_DESCRIPTIONS` の `'implementation'` および `'testing'` の説明文を更新し、`TestPreparation` の存在を反映する

**検証条件**:
- `PHASE_PRESETS['implementation']` に `'test_preparation'` が含まれること
- `PHASE_PRESETS['testing']` に `'test_preparation'` が含まれること
- `test_preparation` が `test_implementation` の後、`testing` の前に配置されていること

---

### FR-005: TestPreparationPhase クラスの実装（優先度: 高）

**説明**: `src/phases/test-preparation.ts` に `TestPreparationPhase` クラスを新規作成する。

**詳細**:
- `BasePhase` クラスを継承する
- コンストラクタで `phaseName: 'test_preparation'` を設定する
- 以下の 3 つの抽象メソッドを実装する:

#### FR-005-A: execute() メソッド

**責務**: テスト実行環境の自動準備

1. **言語ランタイムのインストール**: 対象リポジトリの開発言語（Python, Go, Java, Rust, Ruby 等）を検出し、適切なバージョンをインストール
2. **依存パッケージのインストール**: `requirements.txt`, `package.json`, `go.mod`, `Gemfile`, `pom.xml` 等のマニフェストファイルを検出し、依存関係を解決
3. **テストフレームワークのセットアップ**: pytest, Jest, JUnit, RSpec 等のテストランナーが利用可能であることを確認
4. **環境検証**: テストが実行可能な状態であることを検証（例: `python --version`, `npm test --help` 等の簡易実行）

**入力コンテキスト**:
- `test_implementation` フェーズの成果物 (`test-implementation.md`) — 何のテストを実行するかの情報
- `implementation` フェーズの成果物 (`implementation.md`) — どの言語・フレームワークを使っているかの情報
- Planning Document — 全体的な実装計画の参照

**出力成果物**: `test-preparation.md`（`output/` ディレクトリに保存）

**エージェント実行オプション**:
- `maxTurns: 80`（コマンド実行を伴うため、十分なターン数を確保）
- `enableFallback: true`（フォールバック機構を有効化）

#### FR-005-B: review() メソッド

**責務**: テスト環境準備の完了検証

- `test-preparation.md` の存在確認
- レビュープロンプトを使用してエージェントに環境準備の検証を依頼
- レビュー結果の解析（PASS/FAIL）と GitHub Issue への投稿

#### FR-005-C: revise() メソッド

**責務**: レビューフィードバックに基づく環境準備の修正

- レビューで検出された問題に基づいてエージェントに再準備を依頼
- `test-preparation.md` の更新確認

**検証条件**:
- `TestPreparationPhase` のインスタンスが正常に生成できること
- `phaseName` が `'test_preparation'` であること
- `execute()` 実行後に `test-preparation.md` が生成されること
- `review()` がレビュー結果を返すこと
- `revise()` が `test-preparation.md` を更新すること

---

### FR-006: フェーズファクトリの更新（優先度: 高）

**説明**: `src/core/phase-factory.ts` の `createPhaseInstance()` に `test_preparation` の分岐を追加する。

**詳細**:
- `TestPreparationPhase` を `src/phases/test-preparation.ts` からインポートする
- `switch` 文に `case 'test_preparation'` を追加し、`new TestPreparationPhase(baseParams)` を返す

**検証条件**: `createPhaseInstance('test_preparation', context)` が `TestPreparationPhase` のインスタンスを返すこと

---

### FR-007: フェーズ番号マッピングの更新（優先度: 高）

**説明**: `src/phases/base-phase.ts` の `getPhaseNumber()` プライベートメソッドのマッピングを更新する。

**詳細**:
- `test_preparation: '06'` を追加する
- 以降のフェーズ番号をシフトする:
  - `testing: '06'` → `'07'`
  - `documentation: '07'` → `'08'`
  - `report: '08'` → `'09'`
  - `evaluation: '09'` → `'10'`

**後方互換性の考慮**:
- `getPhaseNumber()` は新規ワークフローのディレクトリ作成時にのみ使用される
- 既存の `.ai-workflow/issue-7`, `issue-10`, `issue-105` サンプルディレクトリは旧番号体系のまま保持される
- 既に完了した既存ワークフローのディレクトリ名には影響しない

**検証条件**:
- `getPhaseNumber('test_preparation')` が `'06'` を返すこと
- `getPhaseNumber('testing')` が `'07'` を返すこと
- `getPhaseNumber('evaluation')` が `'10'` を返すこと

---

### FR-008: エージェント優先順位の設定（優先度: 中）

**説明**: `src/commands/execute/agent-setup.ts` の `PHASE_AGENT_PRIORITY` マップに `test_preparation` のエントリを追加する。

**詳細**:
- `test_preparation: 'codex-first'` を追加する
- 理由: テスト環境の構築は `apt-get install`, `pip install`, `npm install` 等の具体的なコマンド実行が主な作業であり、Codex エージェントが得意とする領域

**検証条件**: `PHASE_AGENT_PRIORITY['test_preparation']` が `'codex-first'` と等しいこと

---

### FR-009: モデル最適化マッピングの更新（優先度: 中）

**説明**: `src/core/model-optimizer.ts` の全難易度レベル（simple/moderate/complex）のマッピングに `test_preparation` を追加する。

**詳細**:
- `simple`: `testing` と同等の設定（全ステップ LIGHTWEIGHT_MODEL_CONFIG）
- `moderate`: `testing` と同等の設定（execute=HIGH_QUALITY, review=LIGHTWEIGHT, revise=HIGH_QUALITY）
- `complex`: `testing` と同等の設定（execute=HIGH_QUALITY, review=LIGHTWEIGHT, revise=HIGH_QUALITY）

**検証条件**: `DEFAULT_DIFFICULTY_MODEL_MAPPING` の全難易度レベルで `test_preparation` のエントリが存在すること

---

### FR-010: プロンプトファイルの作成（優先度: 高）

**説明**: `src/prompts/test_preparation/` ディレクトリに日本語・英語の execute/review/revise プロンプトファイルを作成する。

**詳細**:

#### FR-010-A: execute プロンプト（ja/en）

以下のタスクを指示する内容:
1. リポジトリの言語・フレームワークの自動検出（`package.json`, `requirements.txt`, `go.mod`, `pom.xml`, `Gemfile` 等の存在チェック）
2. 必要な言語ランタイムのインストール（`apt-get`, `pip`, `npm install` 等）
3. テスト関連の依存パッケージのインストール
4. テスト実行可能性の簡易検証（`python --version`, `npm test --help` 等）
5. 準備結果を `test-preparation.md` に記録

テンプレート変数:
- `{planning_document_path}`: Planning Document への参照
- `{test_implementation_context}`: テスト実装コンテキスト
- `{implementation_context}`: 実装コンテキスト
- `{issue_number}`: Issue 番号

#### FR-010-B: review プロンプト（ja/en）

環境準備の完了判定基準を指示する内容:
- 言語ランタイムが正しくインストールされているか
- 依存パッケージが解決されているか
- テストフレームワークが利用可能か
- `test-preparation.md` が適切な内容で記録されているか

#### FR-010-C: revise プロンプト（ja/en）

レビューフィードバックに基づく修正を指示する内容:
- レビューで検出された問題の修正
- 追加の依存パッケージのインストール
- `test-preparation.md` の更新

**検証条件**:
- 以下の 6 ファイルが存在すること:
  - `src/prompts/test_preparation/ja/execute.txt`
  - `src/prompts/test_preparation/ja/review.txt`
  - `src/prompts/test_preparation/ja/revise.txt`
  - `src/prompts/test_preparation/en/execute.txt`
  - `src/prompts/test_preparation/en/review.txt`
  - `src/prompts/test_preparation/en/revise.txt`
- 各プロンプトに言語別の明示的な出力指示が含まれていること（CLAUDE.md の規約に準拠）

---

### FR-011: ログ抽出パターンの追加（優先度: 低）

**説明**: `src/phases/base-phase.ts` の `extractContentFromLog()` 内の `headerPatterns` に `test_preparation` のパターンを追加する。

**詳細**:
- `test_preparation: /^#+ (テスト準備|Test Preparation|環境準備|Environment Setup)/im` を追加する
- フォールバック機構（`enableFallback: true`）が有効な場合に、エージェントログから成果物を抽出するために使用される

**検証条件**: `extractContentFromLog()` が `test_preparation` パターンに一致するログから正しくコンテンツを抽出できること

---

## 3. 非機能要件

### NFR-001: パフォーマンス要件

- **エージェント実行ターン数**: `test_preparation` フェーズの execute ステップは `maxTurns: 80` を設定する（コマンド実行が複数回必要なため、`test_implementation` や `testing` と同等のターン数を確保）
- **全体ワークフロー実行時間**: `test_preparation` フェーズの追加により全体のワークフロー実行時間が増加するが、テスト環境未準備による `testing` フェーズの失敗 → リトライサイクルが削減されるため、トータルでは時間短縮が期待される
- **フォールバック処理**: `enableFallback: true` を設定し、成果物ファイルが生成されなかった場合のリカバリを可能にする

### NFR-002: 信頼性要件

- **後方互換性**: 既存の `.ai-workflow/issue-*` ディレクトリ構造は変更しない。新しいフェーズ番号体系は新規 `init` 以降のワークフローにのみ適用される
- **フォールバック機構**: エージェントが `test-preparation.md` を生成しなかった場合、ログからの自動抽出または `revise()` メソッドによるリカバリを試みる
- **依存関係検証**: `validatePhaseDependencies()` が `test_preparation` のチェックを正しく実行し、前提フェーズ（`test_implementation`）の完了を要求する

### NFR-003: 保守性・拡張性要件

- **コーディング規約の遵守**: CLAUDE.md に定義された以下の規約を厳守する:
  - 統一ロギング規約: `logger` モジュール（`src/utils/logger.ts`）を使用し、`console.log` 等の直接使用を禁止
  - 環境変数アクセス規約: `Config` クラス（`src/core/config.ts`）を使用し、`process.env` の直接アクセスを禁止
  - エラーハンドリング規約: `getErrorMessage()`, `getErrorStack()`, `isError()` を使用し、`as Error` 型アサーションを禁止
- **既存パターンへの準拠**: `TestImplementationPhase`（`src/phases/test-implementation.ts`）の実装パターンをテンプレートとして使用し、コードの一貫性を保つ
- **TypeScript 型安全性**: `PhaseName` 型の拡張により、`Record<PhaseName, ...>` を使用するすべてのマッピングで `test_preparation` エントリの漏れが静的に検出される

### NFR-004: テスタビリティ要件

- **ユニットテスト**: `TestPreparationPhase` クラスの各メソッド（execute/review/revise）に対する単体テストを作成する
- **統合テスト**: フェーズ順序、依存関係、プリセット、番号マッピングの整合性テストを作成・更新する
- **モッククリーンアップ**: `afterEach(() => jest.restoreAllMocks())` による適切なクリーンアップを実施する

### NFR-005: 多言語対応要件

- **日本語・英語プロンプト**: `src/prompts/test_preparation/ja/` と `src/prompts/test_preparation/en/` の両方にプロンプトファイルを配置する
- **言語フォールバック**: `PromptLoader` が `config.getLanguage()` を参照し、指定言語のプロンプトが存在しない場合はデフォルト言語（`ja`）にフォールバックする既存メカニズムに準拠する
- **言語別出力指示**: 各プロンプトに言語別の明示的な出力指示を含める

---

## 4. 制約事項

### 技術的制約

| 制約 | 詳細 |
|------|------|
| TypeScript バージョン | プロジェクトの既存 TypeScript 設定に準拠（strict モード） |
| Node.js バージョン | Node.js 20 以上が必要 |
| 既存アーキテクチャとの整合性 | `BasePhase` クラスの継承パターンに準拠する。独自のライフサイクル実装は不可 |
| フェーズ番号形式 | 2 桁の数字文字列（`'00'`〜`'10'`）。`05b` のような非標準形式は不可 |
| `Record<PhaseName, ...>` の完全性 | TypeScript コンパイラが `PhaseName` の全メンバーに対するエントリを要求するため、`model-optimizer.ts`, `agent-setup.ts` 等のすべてのマッピングで `test_preparation` のエントリが必須 |
| プロンプトファイル配置 | `src/prompts/{phase_name}/{lang}/{step}.txt` の命名規則に準拠 |

### リソース制約

| 制約 | 詳細 |
|------|------|
| 見積もり工数 | 16〜24 時間（Planning Document より） |
| テストカバレッジ | 既存の全テスト（`npm run validate`）がパスすること |

### ポリシー制約

| 制約 | 詳細 |
|------|------|
| ロギング規約 | `console.log` 等の直接使用を禁止。統一 logger モジュールを使用 |
| 環境変数アクセス規約 | `process.env` への直接アクセスを禁止。Config クラスを使用 |
| エラーハンドリング規約 | `as Error` 型アサーションを禁止。`getErrorMessage()` 等のユーティリティを使用 |
| ReDoS 防止規約 | 動的正規表現の代わりに `String.prototype.replaceAll()` を使用 |
| セキュリティ | Git URL に埋め込まれた PAT の自動除去機構に影響しないこと |

---

## 5. 前提条件

### システム環境

| 前提条件 | 詳細 |
|---------|------|
| Docker 環境 | ベースイメージ `Node.js 20-slim` 上で実行される。`AGENT_CAN_INSTALL_PACKAGES=true` が設定されており、エージェントが追加パッケージをインストール可能 |
| `buildEnvironmentInfoSection()` | `base-phase.ts` L367-378 で定義された環境情報セクションが、execute プロンプトに自動注入される。Python, Go, Java, Rust, Ruby のインストール方法が記載されている |
| Node.js 20 + npm | プリインストール済み。テスト準備フェーズでの Node.js プロジェクトの依存解決は `npm install` で対応可能 |

### 依存コンポーネント

| コンポーネント | バージョン/状態 | 依存内容 |
|-------------|---------------|---------|
| `BasePhase` | 現行（`src/phases/base-phase.ts`, 1077 行） | 継承元クラス。`executePhaseTemplate()`, `loadPrompt()`, `buildOptionalContext()` 等のメソッドを使用 |
| `ContentParser` | 現行（`src/core/content-parser.ts`） | `review()` メソッドでレビュー結果の解析に使用 |
| `ContextBuilder` | 現行（`src/phases/context/context-builder.ts`） | `getPlanningDocumentReference()`, `buildOptionalContext()` の委譲先 |
| `AgentExecutor` | 現行（`src/phases/core/agent-executor.ts`） | エージェント実行ロジック |
| `PhaseRunner` | 現行（`src/phases/lifecycle/phase-runner.ts`） | フェーズライフサイクル管理 |
| `StepExecutor` | 現行（`src/phases/lifecycle/step-executor.ts`） | ステップ実行ロジック |
| `ModelOptimizer` | 現行（`src/core/model-optimizer.ts`） | モデル自動選択 |
| `GitHubClient` | 現行（`src/core/github-client.ts`） | レビュー結果の GitHub Issue 投稿 |

### 外部システム連携

| システム | 連携内容 |
|---------|---------|
| GitHub API | レビュー結果の Issue コメント投稿、進捗表示 |
| Codex Agent | テスト環境構築のコマンド実行（優先エージェント） |
| Claude Agent | Codex 失敗時のフォールバックエージェント |

---

## 6. 受け入れ基準

### AC-001: PhaseName 型の拡張

**Given**: TypeScript のソースコードがビルドされる場合
**When**: `npm run lint` を実行する
**Then**: コンパイルエラーが発生しないこと。かつ、`PhaseName` 型に `'test_preparation'` が含まれていること

---

### AC-002: フェーズ実行順序

**Given**: `PHASE_ORDER` 配列が定義されている場合
**When**: `--phase all` で全フェーズを実行する
**Then**: `test_preparation` が `test_implementation` の直後、`testing` の直前に実行されること。フェーズ総数が 11 であること

---

### AC-003: フェーズ依存関係の検証

**Given**: `PHASE_DEPENDENCIES` が定義されている場合
**When**: `test_preparation` フェーズを実行しようとする
**Then**: `test_implementation` が `completed` 状態でない場合、依存関係エラーが発生すること（`--skip-dependency-check` が指定されていない限り）

---

### AC-004: testing フェーズの依存関係変更

**Given**: `PHASE_DEPENDENCIES` が更新されている場合
**When**: `testing` フェーズを実行しようとする
**Then**: `test_preparation` が `completed` 状態でない場合、依存関係エラーが発生すること（旧依存の `test_implementation` ではなく、`test_preparation` に依存すること）

---

### AC-005: フェーズプリセットの更新

**Given**: `PHASE_PRESETS` が更新されている場合
**When**: `--preset implementation` でプリセット実行する
**Then**: `test_preparation` が実行対象フェーズに含まれ、`test_implementation` の後、`testing` の前に実行されること

---

### AC-006: TestPreparationPhase のインスタンス生成

**Given**: `createPhaseInstance()` に `'test_preparation'` が渡された場合
**When**: インスタンスが生成される
**Then**: `TestPreparationPhase` のインスタンスが返され、`phaseName` が `'test_preparation'` であること

---

### AC-007: test-preparation.md の生成

**Given**: `test_implementation` フェーズが完了している場合
**When**: `test_preparation` フェーズの `execute()` メソッドが実行される
**Then**: `output/test-preparation.md` ファイルが生成されること。環境準備の結果が記録されていること

---

### AC-008: フェーズ番号マッピング

**Given**: `getPhaseNumber()` メソッドが呼び出される場合
**When**: `test_preparation` が引数として渡される
**Then**: `'06'` が返されること。`testing` に対しては `'07'`、`evaluation` に対しては `'10'` が返されること

---

### AC-009: エージェント優先順位

**Given**: `--agent auto` モードで実行される場合
**When**: `test_preparation` フェーズが実行される
**Then**: Codex エージェントが優先的に使用されること（`codex-first`）

---

### AC-010: モデル最適化マッピング

**Given**: auto-model-selection が有効な場合
**When**: `test_preparation` フェーズの各ステップ（execute/review/revise）が実行される
**Then**: 難易度に応じた適切なモデルが選択されること（simple: 全ステップ lightweight、moderate/complex: execute/revise は high-quality、review は lightweight）

---

### AC-011: プロンプトファイルの存在と言語対応

**Given**: `test_preparation` フェーズが実行される場合
**When**: `loadPrompt('execute')` が呼び出される
**Then**: 指定された言語（`ja` または `en`）に対応するプロンプトファイルが読み込まれること。指定言語のファイルが存在しない場合はデフォルト言語（`ja`）にフォールバックすること

---

### AC-012: 循環依存の不在

**Given**: `PHASE_DEPENDENCIES` が更新された場合
**When**: `detectCircularDependencies()` を実行する
**Then**: 空配列が返されること（循環依存が存在しないこと）

---

### AC-013: npm run validate の成功

**Given**: すべての変更が完了した場合
**When**: `npm run validate` を実行する
**Then**: lint（TypeScript 型チェック）、テスト（unit + integration）、ビルドがすべて成功すること

---

### AC-014: 後方互換性

**Given**: 既存のサンプルワークフロー（`.ai-workflow/issue-7`, `issue-10`, `issue-105`）が存在する場合
**When**: ビルドとテストが実行される
**Then**: 既存ワークフローのディレクトリ構造が変更されず、旧フェーズ番号体系のまま保持されること

---

## 7. スコープ外

### 明確にスコープ外とする事項

| 項目 | 理由 |
|------|------|
| Dockerfile へのランタイムプリインストール | Issue 本文で「任意」と記載されており、本 Issue の必須スコープではない。`test_preparation` フェーズのエージェントが動的にインストールする方針 |
| 既存サンプルワークフローのディレクトリ名変更 | 既存の `.ai-workflow/issue-7`, `issue-10`, `issue-105` は旧番号体系のまま保持する。リファレンス用のサンプルであり、変更は不要 |
| 既存ワークフローのマイグレーションツール | 旧番号体系から新番号体系への自動変換ツールは作成しない。新規 `init` 以降のワークフローのみが新番号体系を使用する |
| `test_preparation` 用の BDD テスト | エンドユーザー向け UI の変更はなく、CLI の動作は既存のフレームワーク内で完結するため、BDD テストは不要 |
| `base-phase.ts` の `isValidOutputContent()` への `test_preparation` キーワード追加 | フォールバック機構のバリデーションで使用されるキーワードリストへの追加は、初期リリース後の改善事項として扱う |
| `full-test` プリセットへの `test_preparation` 追加 | `full-test` プリセットは `['planning', 'test_scenario', 'test_implementation']` であり、`testing` を含まないため `test_preparation` の追加は不要 |

### 将来的な拡張候補

| 項目 | 説明 |
|------|------|
| 言語検出ライブラリの導入 | 現在はマニフェストファイルの存在チェックで言語を検出するが、将来的には `linguist` 等のライブラリを使用して精度を向上 |
| 環境キャッシュ機構 | 同一リポジトリの複数 Issue で同じ環境準備を繰り返さないよう、Docker レイヤーキャッシュまたは環境スナップショットの導入 |
| `test_preparation` の成果物を `testing` で活用 | `test-preparation.md` に記録された環境情報を `testing` フェーズのプロンプトに自動注入し、テスト実行の精度を向上 |
| プリインストール済み環境の Dockerfile 提供 | よく使用される言語ランタイム（Python, Go, Java）をプリインストールした Docker イメージを提供し、`test_preparation` フェーズの実行時間を短縮 |

---

## 補足: 変更対象ファイル一覧

### 新規作成ファイル（7 ファイル）

| ファイルパス | 説明 |
|------------|------|
| `src/phases/test-preparation.ts` | `TestPreparationPhase` クラスの実装 |
| `src/prompts/test_preparation/ja/execute.txt` | テスト準備実行プロンプト（日本語） |
| `src/prompts/test_preparation/ja/review.txt` | テスト準備レビュープロンプト（日本語） |
| `src/prompts/test_preparation/ja/revise.txt` | テスト準備修正プロンプト（日本語） |
| `src/prompts/test_preparation/en/execute.txt` | テスト準備実行プロンプト（英語） |
| `src/prompts/test_preparation/en/review.txt` | テスト準備レビュープロンプト（英語） |
| `src/prompts/test_preparation/en/revise.txt` | テスト準備修正プロンプト（英語） |

### 既存ファイル変更（7 ファイル）

| ファイルパス | 変更概要 | 影響度 |
|------------|---------|--------|
| `src/types.ts` (L1-11) | `PhaseName` 型に `'test_preparation'` を追加 | 低 |
| `src/commands/execute.ts` (L36-47) | `PHASE_ORDER` 配列に `'test_preparation'` を挿入 | 低 |
| `src/core/phase-dependencies.ts` (L9-66) | `PHASE_DEPENDENCIES`, `PHASE_PRESETS`, `PRESET_DESCRIPTIONS` の更新 | 中 |
| `src/core/phase-factory.ts` (L1-69) | `TestPreparationPhase` の import と case 追加 | 低 |
| `src/phases/base-phase.ts` (L668-682) | `getPhaseNumber()` のマッピング更新（番号シフト含む） | **高** |
| `src/commands/execute/agent-setup.ts` (L48-59) | `PHASE_AGENT_PRIORITY` に `test_preparation` 追加 | 低 |
| `src/core/model-optimizer.ts` (L21-100) | 全難易度マッピング関数に `test_preparation` 追加 | 低 |

### 影響を受けるテストファイル

| テストファイル | 修正内容 |
|-------------|---------|
| `tests/unit/commands/execute.test.ts` | フェーズ順序テスト、プリセットテストの更新 |
| `tests/unit/phases/base-phase-*.test.ts` | フェーズ番号マッピングテストの更新 |
| `tests/integration/` 内の関連テスト | フェーズ数の変更（10→11）に伴うアサーション更新 |

### 新規作成テストファイル

| テストファイル | 内容 |
|-------------|------|
| `tests/unit/phases/test-preparation.test.ts` | `TestPreparationPhase` のユニットテスト |
