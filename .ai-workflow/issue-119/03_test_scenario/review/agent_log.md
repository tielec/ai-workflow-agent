# Codex Agent 実行ログ

開始日時: 2025/11/3 3:12:58

---

## Turn 1: スレッド開始

**Thread ID**: `019a47b4-22b8-7632-94a5-8cec75558e1b`

## Turn 2: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'rg --files -g "*planning.md"'`
**ステータス**: failed (exit_code=127)

```text
bash: line 1: rg: command not found
```

## Turn 3: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'find . -name "planning.md"'`
**ステータス**: completed (exit_code=0)

```text
./.ai-workflow/issue-119/00_planning/output/planning.md
./.ai-workflow/issue-91/00_planning/output/planning.md
./.ai-workflow/issue-90/00_planning/output/planning.md
./.ai-workflow/issue-74/00_planning/output/planning.md
./.ai-workflow/issue-73/00_planning/output/planning.md
./.ai-workflow/issue-7/00_planning/output/planning.md
./.ai-workflow/issue-64/00_planning/output/planning.md
./.ai-workflow/issue-61/00_planning/output/planning.md
./.ai-workflow/issue-58/00_planning/output/planning.md
./.ai-workflow/issue-54/00_planning/output/planning.md
./.ai-workflow/issue-52/00_planning/output/planning.md
./.ai-workflow/issue-51/00_planning/output/planning.md
./.ai-workflow/issue-50/00_planning/output/planning.md
./.ai-workflow/issue-5/00_planning/output/planning.md
./.ai-workflow/issue-49/00_planning/output/planning.md
./.ai-workflow/issue-48/00_planning/output/planning.md
./.ai-workflow/issue-47/00_planning/output/planning.md
./.ai-workflow/issue-46/00_planning/output/planning.md
./.ai-workflow/issue-45/00_planning/output/planning.md
./.ai-workflow/issue-38/00_planning/output/planning.md
./.ai-workflow/issue-26/00_planning/output/planning.md
./.ai-workflow/issue-25/00_planning/output/planning.md
./.ai-workflow/issue-24/00_planning/output/planning.md
./.ai-workflow/issue-23/00_planning/output/planning.md
./.ai-workflow/issue-22/00_planning/output/planning.md
./.ai-workflow/issue-2/00_planning/output/planning.md
./.ai-workflow/issue-16/00_planning/output/planning.md
./.ai-workflow/issue-115/00_planning/output/planning.md
./.ai-workflow/issue-113/00_planning/output/planning.md
./.ai-workflow/issue-108/00_planning/output/planning.md
./.ai-workflow/issue-105/00_planning/output/planning.md
./.ai-workflow/issue-104/00_planning/output/planning.md
./.ai-workflow/issue-102/00_planning/output/planning.md
./.ai-workflow/issue-10/00_planning/output/planning.md
```

## Turn 4: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'cat ./.ai-workflow/issue-119/01_requirements/output/requirements.md'`
**ステータス**: completed (exit_code=0)

```text
# 要件定義書 - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

## 0. Planning Documentの確認
- `00_planning/output/planning.md` に基づき、既存 `issue-client.ts` の責務を維持しつつ新規 `issue-ai-generator.ts` でLLM連携を拡張する「EXTEND」戦略を採用する。
- テストはモック中心のユニットテストと実APIを使用する統合テストの両輪（UNIT_INTEGRATION/BOTH_TEST）で実施し、フォールバック経路を含めて網羅する。
- 主なリスクはLLM API失敗・品質ばらつき・機密情報漏洩であり、リトライ／フォールバック、プロンプト検証、フィルタリングで軽減する。
- 想定工数は22〜26時間で、要件定義・設計・実装・テスト・ドキュメント更新までを段階的に進める。

## 1. 概要
既存のフォローアップIssue自動生成機能は、タイトルが一般的すぎて検索性が低く、本文も箇条書きのみで具体的な作業内容が伝わらない。また、元IssueやPRの背景情報が十分に反映されず、残タスクの意義や優先度が不明瞭である。  
本要件はLLMを統合してタイトルと本文の生成品質を向上させ、技術的背景や実行手順を含む実務的に活用できるフォローアップIssueを自動生成することを目的とする。  
これにより、開発チームは手動でIssueを整形する手間を削減し、残タスクの理解・着手が迅速化され、ワークフロー全体のスループット向上と品質担保が期待できる。

### 1.1 現行フォローアップIssue生成フローとデータ連携（Task 1-1）
- **シーケンス概要**  
  1. Evaluation Phase完了時に `RemainingTask[]` と `IssueContext` が Phase Runner から `IssueClient.createIssueFromEvaluation()` へ渡される（`src/core/github/issue-client.ts:198`）。併せて評価レポートのファイルパスが付与される。  
  2. `createIssueFromEvaluation` 内で INFO ログを出力後、`generateFollowUpTitle` が呼び出され、最初の最大3件の残タスクを `extractKeywords` で分割・20文字以内に整形し、`[FOLLOW-UP] #<issueNumber>: <keywords>` 形式のタイトルを組み立てる（同:163行付近）。  
  3. 本文は `IssueContext` が存在する場合に `## 背景` セクションへ `summary` を記述し、`blockerStatus` `deferredReason` をサブセクションとして展開する。`IssueContext` がない場合は定型文にフォールバックする。  
  4. `RemainingTask` をループし、タスク番号ごとに `formatTaskDetails` が Markdown の見出し・対象ファイル一覧・作業手順・受け入れ基準・優先度・見積もり・依存タスクを整形し `## 残タスク詳細` 配下へ追加する（`src/core/github/issue-client.ts:210-274`）。  
  5. 末尾に `## 参考` セクションを追加し、元Issue番号と `evaluationReportPath` へのリンクを差し込んだうえで `---` によるフッタを付与する。  
  6. 完成したタイトル・本文を Octokit 経由で GitHub API `issues.create` に送信し、成功時は INFO、失敗時は `encodeWarning` 済みメッセージを ERROR ログに記録する。

- **データフロー整理**  
  | 入力ソース | 受け取り箇所 | 利用目的 |
  | --- | --- | --- |
  | `RemainingTask.task` | `formatTaskDetails` | `### Task n:` 見出しの文言として使用 |
  | `RemainingTask.targetFiles[]` | `formatTaskDetails` | `**対象ファイル**` セクションにコードパスを列挙 |
  | `RemainingTask.steps[]` | `formatTaskDetails` | 実行手順（番号付きリスト）として出力 |
  | `RemainingTask.acceptanceCriteria[]` | `formatTaskDetails` | `- [ ]` チェックボックス付き受け入れ基準を生成 |
  | `RemainingTask.priority` / `priorityReason` | `formatTaskDetails` | 優先度と根拠を1行にまとめて提示 |
  | `RemainingTask.estimatedHours` | `formatTaskDetails` | 作業見積もりを `**見積もり**` として併記 |
  | `RemainingTask.dependencies[]` | `formatTaskDetails` | 依存タスク一覧を箇条書きで記載 |
  | `IssueContext.summary` | 本文 `## 背景` | 元Issue・PRのサマリーを冒頭に表示 |
  | `IssueContext.blockerStatus` | 本文 `### 元 Issue のステータス` | ブロッカー解消状況を共有 |
  | `IssueContext.deferredReason` | 本文 `### なぜこれらのタスクが残ったか` | 残タスク発生の背景説明 |
  | `evaluationReportPath` | 本文 `## 参考` | 評価レポート位置をリンク/パスで提示 |

  `RemainingTask` と `IssueContext` は `src/types.ts:36-105` に定義されており、Evaluation Phaseからの構造体がそのまま文字列化される。今後のLLM統合ではこれらの値をプロンプト入力へ拡張するが、既存フォールバック経路との互換性を維持する。

## 2. 機能要件
Issue本文に「## TODO」節は存在しないため、概要および提案解決策から抽出した要件を整理する。

| ID | 要件 | 詳細 | 優先度 |
| --- | --- | --- | --- |
| FR-1 | LLMを用いたインテリジェントタイトル生成 | `generateIntelligentTitle` 関数で元Issue・PR・残タスクの文脈を入力に、50〜80文字の技術的に明確なタイトルを生成する。タイトルは主要コンポーネントや指標（例: 対象モジュール、目標値）を含み、既存の単語分割ロジックより情報密度が高いこと。 | 高 |
| FR-2 | 構造化されたタスク本文生成 | `generateTaskDescription` が背景、目的、実行内容（ステップ・対象ファイル・テスト方法）、受け入れ基準、関連リソースをMarkdownセクションとして出力する。本文内で1ステップずつ実行指示を明示し、テスト手順と完了条件を含める。 | 高 |
| FR-3 | フォールバック制御 | LLM呼び出し失敗・タイムアウト・無効化設定時には既存の `generateFollowUpTitle` / `formatTaskDetails` を自動で利用し、処理を中断させない。フォールバック発動状況は警告ログで記録する。 | 高 |
| FR-4 | 設定オプションの拡張 | `IssueGenerationOptions` 等を通じてLLM有効化フラグ、モデル選択、タイムアウト、最大リトライ回数を指定できるようにし、CLIや環境変数から設定可能にする。デフォルト値は後方互換を保つ。 | 中 |
| FR-5 | ログと品質監視 | LLM呼び出し成功時は入力トークン長・モデル名・生成時間をDEBUGログに出力し、失敗時は原因と再試行状況をWARNログに記録する。WARNログは `{ event_code, message, fallback_mode, retry_count }` を最低限含む構造化ペイロードとし、ログには機密情報を含めない。 | 中 |

### 2.1 LLM API利用要件（Task 1-2）
- **モデル候補とトークン制限**  
  | モデルID | プロバイダ | 想定用途 | 最大入力トークン | 最大出力トークン | 備考 |
  | --- | --- | --- | --- | --- | --- |
  | `claude-3-sonnet-20240229` | Anthropic | デフォルト（高品質/安定） | 8,000 | 2,000 | コストと品質のバランスが良い。 |
  | `gpt-4o-2024-05-13` | OpenAI | 代替（マルチリンガル/ツール連携） | 8,192 | 2,048
... (truncated)
```

## Turn 5: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'cat ./.ai-workflow/issue-119/02_design/output/design.md'`
**ステータス**: completed (exit_code=0)

```text
# 詳細設計書 - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

**Issue番号**: #119  
**タイトル**: フォローアップIssue生成品質の改善（LLM活用）  
**バージョン**: 1.1 (Design)

---

## 1. アーキテクチャ設計

### 1.1 システム全体フロー

```
EvaluationPhase (Phase 9)
    │ RemainingTask[], IssueContext, evaluation report path, generation options
    ▼
GitHubClient.createIssueFromEvaluation(...)
    │ delegates
    ▼
IssueClient (LLM-aware)
    ├─ IssueAIGenerator.generate(...)
    │     └─ LLM Provider Adapter (OpenAI / Anthropic)
    └─ Legacy builders (generateFollowUpTitle + buildLegacyBody)
    ▼
Octokit.issues.create(...) → GitHub Issue
```

### 1.2 コンポーネント責務

| コンポーネント | 役割 | 主な入出力 |
| --- | --- | --- |
| `EvaluationPhase` | Phase 9 の処理。残タスク検出後に GitHubClient へフォローアップ生成を依頼 | 入力: Evaluation結果 / 出力: IssueGenerationOptions 付き呼び出し |
| `GitHubClient` | GitHub API ファサード。IssueClient へ委譲し設定を束ねる | 入力: issue番号, tasks, options / 出力: IssueCreationResult |
| `IssueClient` | フォローアップIssue生成の集約。LLM生成→フォールバック制御→Octokit呼び出し | 入力: tasks, context, options / 出力: タイトル・本文・ログ |
| `IssueAIGenerator` (新規) | LLMプロンプト生成、API呼び出し、レスポンス検証 | 入力: tasks, context, options / 出力: { title, body, metadata } |
| `LlmProviderAdapter` (OpenAI / Anthropic) | 各APIのラッパー。タイムアウト・再試行を実装 | 入出力: prompt, call options, completion JSON |
| `config` / CLI | 環境変数・CLIから LLM 設定を収集し PhaseContextへ渡す | 入出力: Follow-up LLM 設定値 |
| `SecretMasker` (既存) | 機密情報のマスキング | 入力: プロンプトPayload / 出力: SanitizedPayload |

### 1.3 データフロー

1. ユーザーが `ai-workflow execute ...` を実行し、CLI が Follow-up LLM オプションを解析 (デフォルトは無効)。
2. `commands/execute` が `PhaseContext.issueGenerationOptions` を組み立て、`PhaseFactory` 経由で `EvaluationPhase` へ受け渡す。
3. EvaluationPhase で残タスクが存在すると `GitHubClient.createIssueFromEvaluation(issueNumber, tasks, reportPath, context, options)` を呼び出す。
4. `GitHubClient` は `IssueAIGenerator` をコンストラクタインジェクション済みの `IssueClient` に委譲。
5. `IssueClient` が `options.enabled` と `IssueAIGenerator.isAvailable()` を確認し、利用可能なら `generate(tasks, context, options)` を試行。
6. `IssueAIGenerator` は payload をサニタイズ→プロンプト生成→LLM呼び出し→検証し、成功時にタイトル・本文を返却。
7. LLM 失敗または無効時、`IssueClient` は既存の `generateFollowUpTitle` と新設の `buildLegacyBody` でフォールバック本文を生成。
8. 生成結果と `## 参考` セクション (＋オプションで LLM metadata) を結合し、Octokit で Issue を作成。ログへ成否とメタ情報を出力。

### 1.4 主なシーケンスと失敗時動作

- LLM 成功: `IssueAIGenerator` → validated result → `IssueClient` が LLM 出力を採用 → `options.appendMetadata` が true の場合にメタデータ節を付加。
- LLM タイムアウト / レート制限: Providerアダプタが指数バックオフで再試行。全失敗で `IssueAIError` を返し IssueClient が WARN を記録しフォールバック。
- プロンプト検証失敗: `IssueAIGenerator` が `IssueAIValidationError` を送出し、同様にフォールバック。
- Octokit 失敗: 既存処理と同様に ERROR ログを出力し `IssueCreationResult` で失敗を返却。

---

## 2. 実装戦略判断: EXTEND

**判断根拠**:
- 既存 `IssueClient` / `GitHubClient` / CLI フローを維持したまま責務を拡張する必要があるため。
- フォールバックとして既存テンプレートを保持しつつ LLM 生成を追加する形で後方互換を守る。
- Planning Document の戦略 (新規モジュール追加 + 既存コード拡張) と整合。

---

## 3. テスト戦略判断: UNIT_INTEGRATION

**判断根拠**:
- プロンプト生成・レスポンス検証・リトライといったロジックはモック化が容易であり、ユニットテストで網羅できる。
- GitHub 連携や Phase からのオプション伝搬、フォールバック全体の動作は統合テストで確認する必要がある。

---

## 4. テストコード戦略判断: BOTH_TEST

**判断根拠**:
- 既存 `issue-client` テストに LLM 成功/失敗パスを追加する必要がある (既存テストの拡張)。
- `IssueAIGenerator` 用の専用ユニットテストが新規に必要となる (新規テスト作成)。

---

## 5. 影響範囲分析

### 5.1 既存コードへの影響
- `src/core/github/issue-client.ts`: 依存注入、LLM 分岐、本文生成をメソッド化、WARN/DEBUG ログ拡張。
- `src/core/github-client.ts`: `IssueAIGenerator` の初期化と委譲。`createIssueFromEvaluation` にオプションパラメータ追加。
- `src/core/phase-factory.ts`: `PhaseContext` へ追加した `issueGenerationOptions` を全 Phase に渡す初期化処理を拡張。
- `src/phases/base-phase.ts`: Phase インスタンスが `issueGenerationOptions` を受け取り `this.context` へ保持できるようにする。
- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
- `src/core/secret-masker.ts`: `maskObject` を追加してネストした残タスクオブジェクトを一括マスキングできるようにする。
- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
- `src/core/
... (truncated)
```

## Turn 6: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'cat ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md'`
**ステータス**: completed (exit_code=0)

```text
# テストシナリオ - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

## 1. テスト戦略サマリー
- **戦略**: UNIT_INTEGRATION（Phase 2確定）。ユニットテストで `IssueAIGenerator` / `IssueClient` / `SecretMasker` のロジックを網羅し、統合テストで CLI→Phase→GitHubClient の連携とフォールバック挙動を検証する。
- **テスト対象範囲**: 新規 `issue-ai-generator.ts`、拡張された `issue-client.ts`、`secret-masker` 拡張、CLI オプションと PhaseContext の連携、LLM プロバイダアダプタ。
- **テスト目的**: FR-1〜FR-5 に沿って LLM 生成タイトル/本文品質、フォールバック制御、設定オプション伝搬、ログ/メタデータ記録、セキュリティ（マスキング）を確認する。

## 2. Unitテストシナリオ

### テストケース名: issue_ai_generator_generate_success_正常系
- 目的: LLM プロバイダが有効な JSON を返却した際に、タイトル/本文/メタデータが採用されることを検証する（FR-1, FR-2, FR-5）。
- 前提条件: `IssueGenerationOptions.enabled=true`, provider は `openai`, API キーはモックで利用可能。プロバイダは1回で成功レスポンスを返す。
- 入力: 高優先度タスク1件、`IssueContext`（summary, blockerStatus, deferredReason）、`maxTasks=3`, `appendMetadata=true`。
- 期待結果: 50〜80文字のタイトルと5セクションを含む本文を返却。メタデータに provider/model/duration/retryCount=0 が設定され、`appendMetadata` 指定時に本文末尾へ追記される。
- テストデータ: `task_high_priority`（後述）、`context_with_blocker`、モックレスポンス `{ "title": "カバレッジ90%達成 - core/gitの単体テスト拡張", "body": "## 背景\n..." }`。

### テストケース名: issue_ai_generator_generate_retry_success_正常系
- 目的: プロバイダが一時的に失敗した場合でも最大リトライ内で成功することを検証する（FR-3, FR-5）。
- 前提条件: `maxRetries=3`, プロバイダモックが1回目に HTTP 429、2回目に成功レスポンスを返す。バックオフタイマはフェイクで制御。
- 入力: 中優先度タスク1件、`IssueContext` あり。
- 期待結果: `IssueAIGenerationResult.metadata.retryCount=1`、最終タイトル/本文は成功レスポンスを反映、WARN ログを出さず DEBUG ログのみで完了。
- テストデータ: `task_medium_priority`, 成功レスポンス JSON。

### テストケース名: issue_ai_generator_generate_invalid_json_異常系
- 目的: プロバイダが JSON 以外のテキストを返す場合に `IssueAIValidationError` を送出しフォールバック条件となることを検証する（FR-2, FR-3）。
- 前提条件: `enabled=true`、プロバイダモックが `"**markdown only**"` を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw され、呼び出し側でフォールバック処理に遷移できる。
- テストデータ: `task_low_priority`, ノイズレスポンス `"**markdown only**"`.

### テストケース名: issue_ai_generator_generate_missing_sections_異常系
- 目的: 本文に必須セクションが不足している場合に検証エラーが発生することを確認する（FR-2）。
- 前提条件: プロバイダが `## 実行内容` を欠いた本文を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw される。ログにバリデーション理由（missing sections）が WARN 出力される。
- テストデータ: `task_high_priority`, レスポンス JSON から `## 実行内容` を意図的に削除。

### テストケース名: issue_ai_generator_sanitize_payload_boundary_境界値
- 目的: タスク数・文字数・配列要素数の上限とマスキング処理が正しく適用されることを検証する（FR-2, セキュリティ要件）。
- 前提条件: 6件のタスク（高3/中2/低1）、長文の `steps`・`targetFiles`、Bearer トークン/メールアドレスを含む説明を用意。
- 入力: `maxTasks=5`, `IssueContext` あり。
- 期待結果: 高→中→低の優先度順に5件へ切り詰められる。文字列512文字でトリム済み。`targetFiles` は10件に制限。シークレット文字列が `[REDACTED_]` へ置換される。
- テストデータ: `task_priority_set`, `context_with_secret`.

### テストケース名: secret_masker_mask_object_正常系
- 目的: `maskObject` がネスト/配列/循環参照を含むオブジェクトを破壊せずにマスキングすることを確認する（セキュリティ要件）。
- 前提条件: `ignoredPaths=['tasks.1.meta']` を指定。循環参照を含むテストオブジェクトを作成。
- 入力: API キー文字列、メールアドレス、Bearer トークンを含むオブジェクト。
- 期待結果: 元オブジェクトは不変。戻り値で対象文字列が `[REDACTED_*]` に置換され、`ignoredPaths` 指定フィールドは未マスク。
- テストデータ: `sanitization_fixture`.

### テストケース名: issue_client_create_issue_llm_success_正常系
- 目的: LLM 出力が成功した場合にタイトル/本文/メタデータが採用され、Octokit へ送信されることを検証する（FR-1〜FR-5）。
- 前提条件: `appendMetadata=true`、`IssueAIGenerator` モックが成功結果を返す、Octokit モックが `issues.create` 呼び出しを記録。
- 入力: タスク2件（高/中）、`IssueContext` あり。
- 期待結果: Octokit へ渡るタイトル/本文が LLM 結果とメタデータ追記を含む。WARN ログは発生しない。
- テストデータ: `task_high_priority`, `task_medium_priority`, `context_with_blocker`, LLM 成功レスポンス。

### テストケース名: issue_client_create_issue_llm_fallback_異常系
- 目的: LLM 失敗時に WARN ログと共に既存テンプレートへフォールバックすることを検証する（FR-3）。
- 前提条件: `IssueAIGenerator.generate` が `IssueAIValidationError` を throw。Octokit モックが呼び出される。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が出力され、Octokit へはレガシータイトル/本文が送信される。
- テストデータ: `task_low_priority`, 既存 `generateFollowUpTitle` で計算可能なキーワード。

### テストケース名: issue_client_create_issue_llm_disabled_境界値
- 目的: `IssueGenerationOptions.enabled=false` の場合に LLM を呼び出さず既存挙動を維持することを確認する（FR-4）。
- 前提条件: `enabled=false`, `appendMetadata=false`。`IssueAIGenerator` モックは呼ばれていないことを検証。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: LLM 呼び出しが 0 回、Octokit へはレガシータ
... (truncated)
```

## Turn 7: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '1,160p' ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
# テストシナリオ - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

## 1. テスト戦略サマリー
- **戦略**: UNIT_INTEGRATION（Phase 2確定）。ユニットテストで `IssueAIGenerator` / `IssueClient` / `SecretMasker` のロジックを網羅し、統合テストで CLI→Phase→GitHubClient の連携とフォールバック挙動を検証する。
- **テスト対象範囲**: 新規 `issue-ai-generator.ts`、拡張された `issue-client.ts`、`secret-masker` 拡張、CLI オプションと PhaseContext の連携、LLM プロバイダアダプタ。
- **テスト目的**: FR-1〜FR-5 に沿って LLM 生成タイトル/本文品質、フォールバック制御、設定オプション伝搬、ログ/メタデータ記録、セキュリティ（マスキング）を確認する。

## 2. Unitテストシナリオ

### テストケース名: issue_ai_generator_generate_success_正常系
- 目的: LLM プロバイダが有効な JSON を返却した際に、タイトル/本文/メタデータが採用されることを検証する（FR-1, FR-2, FR-5）。
- 前提条件: `IssueGenerationOptions.enabled=true`, provider は `openai`, API キーはモックで利用可能。プロバイダは1回で成功レスポンスを返す。
- 入力: 高優先度タスク1件、`IssueContext`（summary, blockerStatus, deferredReason）、`maxTasks=3`, `appendMetadata=true`。
- 期待結果: 50〜80文字のタイトルと5セクションを含む本文を返却。メタデータに provider/model/duration/retryCount=0 が設定され、`appendMetadata` 指定時に本文末尾へ追記される。
- テストデータ: `task_high_priority`（後述）、`context_with_blocker`、モックレスポンス `{ "title": "カバレッジ90%達成 - core/gitの単体テスト拡張", "body": "## 背景\n..." }`。

### テストケース名: issue_ai_generator_generate_retry_success_正常系
- 目的: プロバイダが一時的に失敗した場合でも最大リトライ内で成功することを検証する（FR-3, FR-5）。
- 前提条件: `maxRetries=3`, プロバイダモックが1回目に HTTP 429、2回目に成功レスポンスを返す。バックオフタイマはフェイクで制御。
- 入力: 中優先度タスク1件、`IssueContext` あり。
- 期待結果: `IssueAIGenerationResult.metadata.retryCount=1`、最終タイトル/本文は成功レスポンスを反映、WARN ログを出さず DEBUG ログのみで完了。
- テストデータ: `task_medium_priority`, 成功レスポンス JSON。

### テストケース名: issue_ai_generator_generate_invalid_json_異常系
- 目的: プロバイダが JSON 以外のテキストを返す場合に `IssueAIValidationError` を送出しフォールバック条件となることを検証する（FR-2, FR-3）。
- 前提条件: `enabled=true`、プロバイダモックが `"**markdown only**"` を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw され、呼び出し側でフォールバック処理に遷移できる。
- テストデータ: `task_low_priority`, ノイズレスポンス `"**markdown only**"`.

### テストケース名: issue_ai_generator_generate_missing_sections_異常系
- 目的: 本文に必須セクションが不足している場合に検証エラーが発生することを確認する（FR-2）。
- 前提条件: プロバイダが `## 実行内容` を欠いた本文を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw される。ログにバリデーション理由（missing sections）が WARN 出力される。
- テストデータ: `task_high_priority`, レスポンス JSON から `## 実行内容` を意図的に削除。

### テストケース名: issue_ai_generator_sanitize_payload_boundary_境界値
- 目的: タスク数・文字数・配列要素数の上限とマスキング処理が正しく適用されることを検証する（FR-2, セキュリティ要件）。
- 前提条件: 6件のタスク（高3/中2/低1）、長文の `steps`・`targetFiles`、Bearer トークン/メールアドレスを含む説明を用意。
- 入力: `maxTasks=5`, `IssueContext` あり。
- 期待結果: 高→中→低の優先度順に5件へ切り詰められる。文字列512文字でトリム済み。`targetFiles` は10件に制限。シークレット文字列が `[REDACTED_]` へ置換される。
- テストデータ: `task_priority_set`, `context_with_secret`.

### テストケース名: secret_masker_mask_object_正常系
- 目的: `maskObject` がネスト/配列/循環参照を含むオブジェクトを破壊せずにマスキングすることを確認する（セキュリティ要件）。
- 前提条件: `ignoredPaths=['tasks.1.meta']` を指定。循環参照を含むテストオブジェクトを作成。
- 入力: API キー文字列、メールアドレス、Bearer トークンを含むオブジェクト。
- 期待結果: 元オブジェクトは不変。戻り値で対象文字列が `[REDACTED_*]` に置換され、`ignoredPaths` 指定フィールドは未マスク。
- テストデータ: `sanitization_fixture`.

### テストケース名: issue_client_create_issue_llm_success_正常系
- 目的: LLM 出力が成功した場合にタイトル/本文/メタデータが採用され、Octokit へ送信されることを検証する（FR-1〜FR-5）。
- 前提条件: `appendMetadata=true`、`IssueAIGenerator` モックが成功結果を返す、Octokit モックが `issues.create` 呼び出しを記録。
- 入力: タスク2件（高/中）、`IssueContext` あり。
- 期待結果: Octokit へ渡るタイトル/本文が LLM 結果とメタデータ追記を含む。WARN ログは発生しない。
- テストデータ: `task_high_priority`, `task_medium_priority`, `context_with_blocker`, LLM 成功レスポンス。

### テストケース名: issue_client_create_issue_llm_fallback_異常系
- 目的: LLM 失敗時に WARN ログと共に既存テンプレートへフォールバックすることを検証する（FR-3）。
- 前提条件: `IssueAIGenerator.generate` が `IssueAIValidationError` を throw。Octokit モックが呼び出される。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が出力され、Octokit へはレガシータイトル/本文が送信される。
- テストデータ: `task_low_priority`, 既存 `generateFollowUpTitle` で計算可能なキーワード。

### テストケース名: issue_client_create_issue_llm_disabled_境界値
- 目的: `IssueGenerationOptions.enabled=false` の場合に LLM を呼び出さず既存挙動を維持することを確認する（FR-4）。
- 前提条件: `enabled=false`, `appendMetadata=false`。`IssueAIGenerator` モックは呼ばれていないことを検証。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: LLM 呼び出しが 0 回、Octokit へはレガシータ
... (truncated)
```

## Turn 8: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '160,320p' ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

## Turn 9: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '1,80p' ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
# テストシナリオ - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

## 1. テスト戦略サマリー
- **戦略**: UNIT_INTEGRATION（Phase 2確定）。ユニットテストで `IssueAIGenerator` / `IssueClient` / `SecretMasker` のロジックを網羅し、統合テストで CLI→Phase→GitHubClient の連携とフォールバック挙動を検証する。
- **テスト対象範囲**: 新規 `issue-ai-generator.ts`、拡張された `issue-client.ts`、`secret-masker` 拡張、CLI オプションと PhaseContext の連携、LLM プロバイダアダプタ。
- **テスト目的**: FR-1〜FR-5 に沿って LLM 生成タイトル/本文品質、フォールバック制御、設定オプション伝搬、ログ/メタデータ記録、セキュリティ（マスキング）を確認する。

## 2. Unitテストシナリオ

### テストケース名: issue_ai_generator_generate_success_正常系
- 目的: LLM プロバイダが有効な JSON を返却した際に、タイトル/本文/メタデータが採用されることを検証する（FR-1, FR-2, FR-5）。
- 前提条件: `IssueGenerationOptions.enabled=true`, provider は `openai`, API キーはモックで利用可能。プロバイダは1回で成功レスポンスを返す。
- 入力: 高優先度タスク1件、`IssueContext`（summary, blockerStatus, deferredReason）、`maxTasks=3`, `appendMetadata=true`。
- 期待結果: 50〜80文字のタイトルと5セクションを含む本文を返却。メタデータに provider/model/duration/retryCount=0 が設定され、`appendMetadata` 指定時に本文末尾へ追記される。
- テストデータ: `task_high_priority`（後述）、`context_with_blocker`、モックレスポンス `{ "title": "カバレッジ90%達成 - core/gitの単体テスト拡張", "body": "## 背景\n..." }`。

### テストケース名: issue_ai_generator_generate_retry_success_正常系
- 目的: プロバイダが一時的に失敗した場合でも最大リトライ内で成功することを検証する（FR-3, FR-5）。
- 前提条件: `maxRetries=3`, プロバイダモックが1回目に HTTP 429、2回目に成功レスポンスを返す。バックオフタイマはフェイクで制御。
- 入力: 中優先度タスク1件、`IssueContext` あり。
- 期待結果: `IssueAIGenerationResult.metadata.retryCount=1`、最終タイトル/本文は成功レスポンスを反映、WARN ログを出さず DEBUG ログのみで完了。
- テストデータ: `task_medium_priority`, 成功レスポンス JSON。

### テストケース名: issue_ai_generator_generate_invalid_json_異常系
- 目的: プロバイダが JSON 以外のテキストを返す場合に `IssueAIValidationError` を送出しフォールバック条件となることを検証する（FR-2, FR-3）。
- 前提条件: `enabled=true`、プロバイダモックが `"**markdown only**"` を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw され、呼び出し側でフォールバック処理に遷移できる。
- テストデータ: `task_low_priority`, ノイズレスポンス `"**markdown only**"`.

### テストケース名: issue_ai_generator_generate_missing_sections_異常系
- 目的: 本文に必須セクションが不足している場合に検証エラーが発生することを確認する（FR-2）。
- 前提条件: プロバイダが `## 実行内容` を欠いた本文を返す。
- 入力: タスク1件、`IssueContext` 任意。
- 期待結果: `IssueAIValidationError` が throw される。ログにバリデーション理由（missing sections）が WARN 出力される。
- テストデータ: `task_high_priority`, レスポンス JSON から `## 実行内容` を意図的に削除。

### テストケース名: issue_ai_generator_sanitize_payload_boundary_境界値
- 目的: タスク数・文字数・配列要素数の上限とマスキング処理が正しく適用されることを検証する（FR-2, セキュリティ要件）。
- 前提条件: 6件のタスク（高3/中2/低1）、長文の `steps`・`targetFiles`、Bearer トークン/メールアドレスを含む説明を用意。
- 入力: `maxTasks=5`, `IssueContext` あり。
- 期待結果: 高→中→低の優先度順に5件へ切り詰められる。文字列512文字でトリム済み。`targetFiles` は10件に制限。シークレット文字列が `[REDACTED_]` へ置換される。
- テストデータ: `task_priority_set`, `context_with_secret`.

### テストケース名: secret_masker_mask_object_正常系
- 目的: `maskObject` がネスト/配列/循環参照を含むオブジェクトを破壊せずにマスキングすることを確認する（セキュリティ要件）。
- 前提条件: `ignoredPaths=['tasks.1.meta']` を指定。循環参照を含むテストオブジェクトを作成。
- 入力: API キー文字列、メールアドレス、Bearer トークンを含むオブジェクト。
- 期待結果: 元オブジェクトは不変。戻り値で対象文字列が `[REDACTED_*]` に置換され、`ignoredPaths` 指定フィールドは未マスク。
- テストデータ: `sanitization_fixture`.

### テストケース名: issue_client_create_issue_llm_success_正常系
- 目的: LLM 出力が成功した場合にタイトル/本文/メタデータが採用され、Octokit へ送信されることを検証する（FR-1〜FR-5）。
- 前提条件: `appendMetadata=true`、`IssueAIGenerator` モックが成功結果を返す、Octokit モックが `issues.create` 呼び出しを記録。
- 入力: タスク2件（高/中）、`IssueContext` あり。
- 期待結果: Octokit へ渡るタイトル/本文が LLM 結果とメタデータ追記を含む。WARN ログは発生しない。
- テストデータ: `task_high_priority`, `task_medium_priority`, `context_with_blocker`, LLM 成功レスポンス。

### テストケース名: issue_client_create_issue_llm_fallback_異常系
- 目的: LLM 失敗時に WARN ログと共に既存テンプレートへフォールバックすることを検証する（FR-3）。
- 前提条件: `IssueAIGenerator.generate` が `IssueAIValidationError` を throw。Octokit モックが呼び出される。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が出力され、Octokit へはレガシータイトル/本文が送信される。
- テストデータ: `task_low_priority`, 既存 `generateFollowUpTitle` で計算可能なキーワード。

### テストケース名: issue_client_create_issue_llm_disabled_境界値
- 目的: `IssueGenerationOptions.enabled=false` の場合に LLM を呼び出さず既存挙動を維持することを確認する（FR-4）。
- 前提条件: `enabled=false`, `appendMetadata=false`。`IssueAIGenerator` モックは呼ばれていないことを検証。
- 入力: タスク1件、`IssueContext` あり。
- 期待結果: LLM 呼び出しが 0 回、Octokit へはレガシータ
... (truncated)
```

## Turn 10: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '81,160p' ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md"`
**ステータス**: completed (exit_code=0)

```text
3. CLI 実行結果を検査。
- 期待結果: 受け取った `options` が CLI 指定値（provider=claude, timeout=20000, maxRetries=2, appendMetadata=true, enabled=true）となる。フェイルオーバーは発動しない。
- 確認項目: オプション値一致、ログに `FOLLOWUP_LLM_SUCCESS` が存在、Octokit 呼び出し成功。

### シナリオ名: LLM失敗時のフォールバック統合動作
- 目的: LLM 呼び出しがタイムアウトした場合に WARN ログと共にレガシーテンプレートへフォールバックする統合挙動を確認する（FR-3）。
- 前提条件: LLM プロバイダモックが 3 回タイムアウト例外を投げる。`maxRetries=3`。Octokit/IssueAIGenerator 以外は実装通り。
- テスト手順:
  1. `npm run test:integration -- followup-issue-llm` を実行し、タイムアウトをシミュレート。
  2. テスト内で WARN ログが出力されたかをアサート。
  3. Issue 本文がレガシーテンプレートで生成されたか確認。
- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が 1 件、Octokit へ送信された本文は `## 背景`・`## 残タスク詳細` を含む既存形式。テストは成功扱い。
- 確認項目: WARN ログ内容、フォールバック本文、リトライ回数=3。

### シナリオ名: 実APIエンドツーエンド検証（オプトイン）
- 目的: 実際の LLM API 呼び出しで生成品質とセクション構造が満たされることを確認する（FR-1, FR-2, FR-5）。
- 前提条件: `FOLLOWUP_LLM_E2E=1`, `ANTHROPIC_API_KEY` または `OPENAI_API_KEY` を設定。GitHub への書き込みはダミークライアントに差し替え（ネットワーク負荷を避ける）。
- テスト手順:
  1. `FOLLOWUP_LLM_E2E=1 npm run test:integration -- followup-issue-llm.e2e` を実行。
  2. テストは LLM からの応答を取得し、タイトル長と本文セクションを検証。
  3. 生成結果サンプルをスナップショットとして保存し、手動レビュー用に出力。
- 期待結果: 50〜80文字のタイトルと 5 セクションを含む本文が生成される。`実行内容` に番号付きリストと「テスト」の記述を含む。メタデータが `durationMs` と `input/outputTokens` を保持。
- 確認項目: タイトル文字数、各セクション存在、`appendMetadata` の有無、API呼び出し時間。

## 4. テストデータ
- `task_high_priority`:  
  ```
  {
    task: "core/gitカバレッジ向上",
    description: "core/git モジュールの単体テストを追加しカバレッジ90%を目指す。",
    targetFiles: ["src/core/git/index.ts", "src/core/git/utils.ts"],
    steps: ["既存テストの重複を整理", "core/git に Jest テストを追加", "npm run test -- core/git"],
    acceptanceCriteria: ["テストカバレッジレポートでcore/gitが90%を超える"],
    priority: "HIGH",
    priorityReason: "リリース前に品質基準を満たす必要がある",
    estimatedHours: 6
  }
  ```
- `task_medium_priority`: 中優先度でステップ/ファイルが複数のタスク（`priority: "MEDIUM"`、`steps` 3件）。
- `task_low_priority`: 低優先度で受け入れ基準が2件のタスク。
- `task_priority_set`: 高3件・中2件・低1件を含む配列。1件に512文字超の説明と11件の `targetFiles` を設定。
- `context_with_blocker`: `summary`, `blockerStatus`, `deferredReason` を含む IssueContext。`deferredReason` に「Bearer sk-test-abc12345 を含まないようマスキングが必要」と記述。
- `context_with_secret`: `summary` にメールアドレス `owner@example.com` とアクセストークン `token=XYZ987654321` を含め、マスキングを検証。
- `sanitization_fixture`: シークレット文字列、メールアドレス、Bearer トークン、循環参照を含むオブジェクト。
- LLM モックレスポンス: 成功パターン JSON（タイトル70文字、本文5セクション）、検証失敗パターン（`## 実行内容` 欠落）、非 JSON 文字列パターン。

## 5. テスト環境要件
- Node.js 20.x / TypeScript 5.x、Jest ベースのテストランナー（`npm run test:unit`, `npm run test:integration`）。`ts-jest` もしくは `esbuild-jest` に対応。
- LLM モック用に `nock` またはプロバイダアダプタの手動スタブを使用。タイマー制御には `jest.useFakeTimers()` を利用。
- Octokit を呼び出す統合テストでは `@octokit/rest` をモックし、GitHub への実呼び出しを防止。
- Optional 実APIテスト実行時のみネットワークアクセスと API キー（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`）を設定。CI では `FOLLOWUP_LLM_E2E` を未設定としてスキップ。
- ログ検証のため `pino` などのロガーをテストダブルへ差し替え、WARN/DEBUG 出力をアサート可能にする。
- テストデータは `fixtures/followup_llm/` 配下に JSON/TypeScript で管理し、共通ユーティリティでロードする。
```

## Turn 11: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'grep -n "Phase 3" -n ./.ai-workflow/issue-119/00_planning/output/planning.md'`
**ステータス**: completed (exit_code=0)

```text
53:### Phase 3: テストシナリオ (見積もり: 2~3h)
96:    P2 --> P3[Phase 3 テストシナリオ]
136:#### Phase 3: テストシナリオ
```

## Turn 12: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '136,220p' ./.ai-workflow/issue-119/00_planning/output/planning.md"`
**ステータス**: completed (exit_code=0)

```text
#### Phase 3: テストシナリオ
- [ ] 成功/失敗/フォールバックを網羅したテストケースが定義されている
- [ ] 実API統合テストの前提条件とスキップ条件が明記されている

#### Phase 4: 実装
- [ ] LLM統合コードがFeature flagで制御できる
- [ ] フォールバック経路が手動テストで確認されている

#### Phase 5: テストコード実装
- [ ] ユニットテストでプロンプト構造とフォールバックを検証できている
- [ ] 統合テストが環境変数制御で安全に実行できる

#### Phase 6: テスト実行
- [ ] すべてのユニットテスト/統合テストが緑である
- [ ] 生成結果サンプルが受け入れ基準を満たしている

#### Phase 7: ドキュメント
- [ ] LLM統合の手順・設定・注意点が主要ドキュメントに記載されている
- [ ] フォールバック時の対応手順が共有されている

#### Phase 8: レポート
- [ ] 実装差分とテスト結果がレポートに整理されている
- [ ] 残課題と次の改善提案が記載されている
```

## Turn 13: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '136,150p' ./.ai-workflow/issue-119/00_planning/output/planning.md | cat -vet"`
**ステータス**: completed (exit_code=0)

```text
#### Phase 3: M-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^BM-7M-cM-^CM-^JM-cM-^CM-*M-cM-^BM-*$
- [ ] M-fM-^HM-^PM-eM-^JM-^_/M-eM-$M-1M-fM-^UM-^W/M-cM-^CM-^UM-cM-^BM-)M-cM-^CM-<M-cM-^CM-+M-cM-^CM-^PM-cM-^CM-^CM-cM-^BM-/M-cM-^BM-^RM-gM-6M-2M-gM->M-^EM-cM-^AM-^WM-cM-^AM-^_M-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^BM-1M-cM-^CM-<M-cM-^BM-9M-cM-^AM-^LM-eM-.M-^ZM-gM->M-)M-cM-^AM-^UM-cM-^BM-^LM-cM-^AM-&M-cM-^AM-^DM-cM-^BM-^K$
- [ ] M-eM-.M-^_APIM-gM-5M-1M-eM-^PM-^HM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^AM-.M-eM-^IM-^MM-fM-^OM-^PM-fM-^]M-!M-dM-;M-6M-cM-^AM-(M-cM-^BM-9M-cM-^BM--M-cM-^CM-^CM-cM-^CM-^WM-fM-^]M-!M-dM-;M-6M-cM-^AM-^LM-fM-^XM-^NM-hM-(M-^XM-cM-^AM-^UM-cM-^BM-^LM-cM-^AM-&M-cM-^AM-^DM-cM-^BM-^K$
$
#### Phase 4: M-eM-.M-^_M-hM-#M-^E$
- [ ] LLMM-gM-5M-1M-eM-^PM-^HM-cM-^BM-3M-cM-^CM-<M-cM-^CM-^IM-cM-^AM-^LFeature flagM-cM-^AM-'M-eM-^HM-6M-eM->M-!M-cM-^AM-'M-cM-^AM-^MM-cM-^BM-^K$
- [ ] M-cM-^CM-^UM-cM-^BM-)M-cM-^CM-<M-cM-^CM-+M-cM-^CM-^PM-cM-^CM-^CM-cM-^BM-/M-gM-5M-^LM-hM-7M-/M-cM-^AM-^LM-fM-^IM-^KM-eM-^KM-^UM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^AM-'M-gM-"M-:M-hM-*M-^MM-cM-^AM-^UM-cM-^BM-^LM-cM-^AM-&M-cM-^AM-^DM-cM-^BM-^K$
$
#### Phase 5: M-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^BM-3M-cM-^CM-<M-cM-^CM-^IM-eM-.M-^_M-hM-#M-^E$
- [ ] M-cM-^CM-&M-cM-^CM-^KM-cM-^CM-^CM-cM-^CM-^HM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^AM-'M-cM-^CM-^WM-cM-^CM--M-cM-^CM-3M-cM-^CM-^WM-cM-^CM-^HM-fM-'M-^KM-iM-^@M- M-cM-^AM-(M-cM-^CM-^UM-cM-^BM-)M-cM-^CM-<M-cM-^CM-+M-cM-^CM-^PM-cM-^CM-^CM-cM-^BM-/M-cM-^BM-^RM-fM-$M-^\M-hM-(M-<M-cM-^AM-'M-cM-^AM-^MM-cM-^AM-&M-cM-^AM-^DM-cM-^BM-^K$
- [ ] M-gM-5M-1M-eM-^PM-^HM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^AM-^LM-gM-^RM-0M-eM-"M-^CM-eM-$M-^IM-fM-^UM-0M-eM-^HM-6M-eM->M-!M-cM-^AM-'M-eM-.M-^IM-eM-^EM-(M-cM-^AM-+M-eM-.M-^_M-hM-!M-^LM-cM-^AM-'M-cM-^AM-^MM-cM-^BM-^K$
$
#### Phase 6: M-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-eM-.M-^_M-hM-!M-^L$
- [ ] M-cM-^AM-^YM-cM-^AM-9M-cM-^AM-&M-cM-^AM-.M-cM-^CM-&M-cM-^CM-^KM-cM-^CM-^CM-cM-^CM-^HM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^H/M-gM-5M-1M-eM-^PM-^HM-cM-^CM-^FM-cM-^BM-9M-cM-^CM-^HM-cM-^AM-^LM-gM-7M-^QM-cM-^AM-'M-cM-^AM-^BM-cM-^BM-^K$
- [ ] M-gM-^TM-^_M-fM-^HM-^PM-gM-5M-^PM-fM-^^M-^\M-cM-^BM-5M-cM-^CM-3M-cM-^CM-^WM-cM-^CM-+M-cM-^AM-^LM-eM-^OM-^WM-cM-^AM-^QM-eM-^EM-%M-cM-^BM-^LM-eM-^_M-:M-fM-:M-^VM-cM-^BM-^RM-fM-:M-^@M-cM-^AM-^_M-cM-^AM-^WM-cM-^AM-&M-cM-^AM-^DM-cM-^BM-^K$
```

## Turn 14: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "python - <<'PY'
from pathlib import Path
p = Path('.ai-workflow/issue-119/00_planning/output/planning.md')
text = p.read_text(encoding='utf-8')
import reprlib
start = text.index('#### Phase 3')
print(repr(text[start:start+200]))
PY"`
**ステータス**: failed (exit_code=127)

```text
bash: line 1: python: command not found
```

## Turn 15: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "python3 - <<'PY'
from pathlib import Path
p = Path('.ai-workflow/issue-119/00_planning/output/planning.md')
text = p.read_text(encoding='utf-8')
start = text.index('#### Phase 3')
print(repr(text[start:start+200]))
PY"`
**ステータス**: failed (exit_code=127)

```text
bash: line 1: python3: command not found
```

## Turn 16: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "node - <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('.ai-workflow/issue-119/00_planning/output/planning.md', 'utf8');
const start = text.indexOf('#### Phase 3');
console.log(JSON.stringify(text.slice(start, start + 200)));
NODE"`
**ステータス**: completed (exit_code=0)

```text
"#### Phase 3: テストシナリオ\n- [ ] 成功/失敗/フォールバックを網羅したテストケースが定義されている\n- [ ] 実API統合テストの前提条件とスキップ条件が明記されている\n\n#### Phase 4: 実装\n- [ ] LLM統合コードがFeature flagで制御できる\n- [ ] フォールバック経路が手動テストで確認されている\n\n#### Phase 5: テストコード"
```

## Turn 17: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "LC_ALL=C sed -n '136,140p' ./.ai-workflow/issue-119/00_planning/output/planning.md | od -c"`
**ステータス**: completed (exit_code=0)

```text
0000000   #   #   #   #       P   h   a   s   e       3   :     343 203
0000020 206 343 202 271 343 203 210 343 202 267 343 203 212 343 203 252
0000040 343 202 252  \n   -       [       ]     346 210 220 345 212 237
0000060   / 345 244 261 346 225 227   / 343 203 225 343 202 251 343 203
0000100 274 343 203 253 343 203 220 343 203 203 343 202 257 343 202 222
0000120 347 266 262 347 276 205 343 201 227 343 201 237 343 203 206 343
0000140 202 271 343 203 210 343 202 261 343 203 274 343 202 271 343 201
0000160 214 345 256 232 347 276 251 343 201 225 343 202 214 343 201 246
0000200 343 201 204 343 202 213  \n   -       [       ]     345 256 237
0000220   A   P   I 347 265 261 345 220 210 343 203 206 343 202 271 343
0000240 203 210 343 201 256 345 211 215 346 217 220 346 235 241 344 273
0000260 266 343 201 250 343 202 271 343 202 255 343 203 203 343 203 227
0000300 346 235 241 344 273 266 343 201 214 346 230 216 350 250 230 343
0000320 201 225 343 202 214 343 201 246 343 201 204 343 202 213  \n  \n
0000340   #   #   #   #       P   h   a   s   e       4   :     345 256
0000360 237 350 243 205  \n
0000365
```

## Turn 18: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 19: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'grep -n "FR-" ./.ai-workflow/issue-119/01_requirements/output/requirements.md'`
**ステータス**: completed (exit_code=0)

```text
45:| FR-1 | LLMを用いたインテリジェントタイトル生成 | `generateIntelligentTitle` 関数で元Issue・PR・残タスクの文脈を入力に、50〜80文字の技術的に明確なタイトルを生成する。タイトルは主要コンポーネントや指標（例: 対象モジュール、目標値）を含み、既存の単語分割ロジックより情報密度が高いこと。 | 高 |
46:| FR-2 | 構造化されたタスク本文生成 | `generateTaskDescription` が背景、目的、実行内容（ステップ・対象ファイル・テスト方法）、受け入れ基準、関連リソースをMarkdownセクションとして出力する。本文内で1ステップずつ実行指示を明示し、テスト手順と完了条件を含める。 | 高 |
47:| FR-3 | フォールバック制御 | LLM呼び出し失敗・タイムアウト・無効化設定時には既存の `generateFollowUpTitle` / `formatTaskDetails` を自動で利用し、処理を中断させない。フォールバック発動状況は警告ログで記録する。 | 高 |
48:| FR-4 | 設定オプションの拡張 | `IssueGenerationOptions` 等を通じてLLM有効化フラグ、モデル選択、タイムアウト、最大リトライ回数を指定できるようにし、CLIや環境変数から設定可能にする。デフォルト値は後方互換を保つ。 | 中 |
49:| FR-5 | ログと品質監視 | LLM呼び出し成功時は入力トークン長・モデル名・生成時間をDEBUGログに出力し、失敗時は原因と再試行状況をWARNログに記録する。WARNログは `{ event_code, message, fallback_mode, retry_count }` を最低限含む構造化ペイロードとし、ログには機密情報を含めない。 | 中 |
100:- FR-1  
104:- FR-2  
108:- FR-3  
112:- FR-4  
116:- FR-5
```

## Turn 20: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md | sed -n '1,120p'"`
**ステータス**: completed (exit_code=0)

```text
1	# テストシナリオ - Issue #119 フォローアップIssue生成品質の改善（LLM活用）
     2	
     3	## 1. テスト戦略サマリー
     4	- **戦略**: UNIT_INTEGRATION（Phase 2確定）。ユニットテストで `IssueAIGenerator` / `IssueClient` / `SecretMasker` のロジックを網羅し、統合テストで CLI→Phase→GitHubClient の連携とフォールバック挙動を検証する。
     5	- **テスト対象範囲**: 新規 `issue-ai-generator.ts`、拡張された `issue-client.ts`、`secret-masker` 拡張、CLI オプションと PhaseContext の連携、LLM プロバイダアダプタ。
     6	- **テスト目的**: FR-1〜FR-5 に沿って LLM 生成タイトル/本文品質、フォールバック制御、設定オプション伝搬、ログ/メタデータ記録、セキュリティ（マスキング）を確認する。
     7	
     8	## 2. Unitテストシナリオ
     9	
    10	### テストケース名: issue_ai_generator_generate_success_正常系
    11	- 目的: LLM プロバイダが有効な JSON を返却した際に、タイトル/本文/メタデータが採用されることを検証する（FR-1, FR-2, FR-5）。
    12	- 前提条件: `IssueGenerationOptions.enabled=true`, provider は `openai`, API キーはモックで利用可能。プロバイダは1回で成功レスポンスを返す。
    13	- 入力: 高優先度タスク1件、`IssueContext`（summary, blockerStatus, deferredReason）、`maxTasks=3`, `appendMetadata=true`。
    14	- 期待結果: 50〜80文字のタイトルと5セクションを含む本文を返却。メタデータに provider/model/duration/retryCount=0 が設定され、`appendMetadata` 指定時に本文末尾へ追記される。
    15	- テストデータ: `task_high_priority`（後述）、`context_with_blocker`、モックレスポンス `{ "title": "カバレッジ90%達成 - core/gitの単体テスト拡張", "body": "## 背景\n..." }`。
    16	
    17	### テストケース名: issue_ai_generator_generate_retry_success_正常系
    18	- 目的: プロバイダが一時的に失敗した場合でも最大リトライ内で成功することを検証する（FR-3, FR-5）。
    19	- 前提条件: `maxRetries=3`, プロバイダモックが1回目に HTTP 429、2回目に成功レスポンスを返す。バックオフタイマはフェイクで制御。
    20	- 入力: 中優先度タスク1件、`IssueContext` あり。
    21	- 期待結果: `IssueAIGenerationResult.metadata.retryCount=1`、最終タイトル/本文は成功レスポンスを反映、WARN ログを出さず DEBUG ログのみで完了。
    22	- テストデータ: `task_medium_priority`, 成功レスポンス JSON。
    23	
    24	### テストケース名: issue_ai_generator_generate_invalid_json_異常系
    25	- 目的: プロバイダが JSON 以外のテキストを返す場合に `IssueAIValidationError` を送出しフォールバック条件となることを検証する（FR-2, FR-3）。
    26	- 前提条件: `enabled=true`、プロバイダモックが `"**markdown only**"` を返す。
    27	- 入力: タスク1件、`IssueContext` 任意。
    28	- 期待結果: `IssueAIValidationError` が throw され、呼び出し側でフォールバック処理に遷移できる。
    29	- テストデータ: `task_low_priority`, ノイズレスポンス `"**markdown only**"`.
    30	
    31	### テストケース名: issue_ai_generator_generate_missing_sections_異常系
    32	- 目的: 本文に必須セクションが不足している場合に検証エラーが発生することを確認する（FR-2）。
    33	- 前提条件: プロバイダが `## 実行内容` を欠いた本文を返す。
    34	- 入力: タスク1件、`IssueContext` 任意。
    35	- 期待結果: `IssueAIValidationError` が throw される。ログにバリデーション理由（missing sections）が WARN 出力される。
    36	- テストデータ: `task_high_priority`, レスポンス JSON から `## 実行内容` を意図的に削除。
    37	
    38	### テストケース名: issue_ai_generator_sanitize_payload_boundary_境界値
    39	- 目的: タスク数・文字数・配列要素数の上限とマスキング処理が正しく適用されることを検証する（FR-2, セキュリティ要件）。
    40	- 前提条件: 6件のタスク（高3/中2/低1）、長文の `steps`・`targetFiles`、Bearer トークン/メールアドレスを含む説明を用意。
    41	- 入力: `maxTasks=5`, `IssueContext` あり。
    42	- 期待結果: 高→中→低の優先度順に5件へ切り詰められる。文字列512文字でトリム済み。`targetFiles` は10件に制限。シークレット文字列が `[REDACTED_]` へ置換される。
    43	- テストデータ: `task_priority_set`, `context_with_secret`.
    44	
    45	### テストケース名: secret_masker_mask_object_正常系
    46	- 目的: `maskObject` がネスト/配列/循環参照を含むオブジェクトを破壊せずにマスキングすることを確認する（セキュリティ要件）。
    47	- 前提条件: `ignoredPaths=['tasks.1.meta']` を指定。循環参照を含むテストオブジェクトを作成。
    48	- 入力: API キー文字列、メールアドレス、Bearer トークンを含むオブジェクト。
    49	- 期待結果: 元オブジェクトは不変。戻り値で対象文字列が `[REDACTED_*]` に置換され、`ignoredPaths` 指定フィールドは未マスク。
    50	- テストデータ: `sanitization_fixture`.
    51	
    52	### テストケース名: issue_client_create_issue_llm_success_正常系
    53	- 目的: LLM 出力が成功した場合にタイトル/本文/メタデータが採用され、Octokit へ送信されることを検証する（FR-1〜FR-5）。
    54	- 前提条件: `appendMetadata=true`、`IssueAIGenerator` モックが成功結果を返す、Octokit モックが `issues.create` 呼び出しを記録。
    55	- 入力: タスク2件（高/中）、`IssueContext` あり。
    56	- 期待結果: Octokit へ渡るタイトル/本文が LLM 結果とメタデータ追記を含む。WARN ログは発生しない。
    57	- テストデータ: `task_high_priority`, `task_medium_priority`, `context_with_blocker`, LLM 成功レスポンス。
    58	
    59	### テストケース名: issue_client_create_issue_llm_fallback_異常系
    60	- 目的: LLM 失敗時に WARN ログと共に既存テンプレートへフォールバックすることを検証する（FR-3）。
    61	- 前提条件: `IssueAIGenerator.generate` が `IssueAIValidationError` を throw。Octokit モックが呼び出される。
    62	- 入力: タスク1件、`IssueContext` あり。
    63	- 期待
... (truncated)
```

## Turn 21: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md | sed -n '120,200p'"`
**ステータス**: completed (exit_code=0)

```text
120	- `task_low_priority`: 低優先度で受け入れ基準が2件のタスク。
   121	- `task_priority_set`: 高3件・中2件・低1件を含む配列。1件に512文字超の説明と11件の `targetFiles` を設定。
   122	- `context_with_blocker`: `summary`, `blockerStatus`, `deferredReason` を含む IssueContext。`deferredReason` に「Bearer sk-test-abc12345 を含まないようマスキングが必要」と記述。
   123	- `context_with_secret`: `summary` にメールアドレス `owner@example.com` とアクセストークン `token=XYZ987654321` を含め、マスキングを検証。
   124	- `sanitization_fixture`: シークレット文字列、メールアドレス、Bearer トークン、循環参照を含むオブジェクト。
   125	- LLM モックレスポンス: 成功パターン JSON（タイトル70文字、本文5セクション）、検証失敗パターン（`## 実行内容` 欠落）、非 JSON 文字列パターン。
   126	
   127	## 5. テスト環境要件
   128	- Node.js 20.x / TypeScript 5.x、Jest ベースのテストランナー（`npm run test:unit`, `npm run test:integration`）。`ts-jest` もしくは `esbuild-jest` に対応。
   129	- LLM モック用に `nock` またはプロバイダアダプタの手動スタブを使用。タイマー制御には `jest.useFakeTimers()` を利用。
   130	- Octokit を呼び出す統合テストでは `@octokit/rest` をモックし、GitHub への実呼び出しを防止。
   131	- Optional 実APIテスト実行時のみネットワークアクセスと API キー（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`）を設定。CI では `FOLLOWUP_LLM_E2E` を未設定としてスキップ。
   132	- ログ検証のため `pino` などのロガーをテストダブルへ差し替え、WARN/DEBUG 出力をアサート可能にする。
   133	- テストデータは `fixtures/followup_llm/` 配下に JSON/TypeScript で管理し、共通ユーティリティでロードする。
```

## Turn 22: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md | sed -n '80,130p'"`
**ステータス**: completed (exit_code=0)

```text
80	  2. テストフックで `IssueClient.createIssueFromEvaluation` 呼び出し時の `options` をキャプチャ。
    81	  3. CLI 実行結果を検査。
    82	- 期待結果: 受け取った `options` が CLI 指定値（provider=claude, timeout=20000, maxRetries=2, appendMetadata=true, enabled=true）となる。フェイルオーバーは発動しない。
    83	- 確認項目: オプション値一致、ログに `FOLLOWUP_LLM_SUCCESS` が存在、Octokit 呼び出し成功。
    84	
    85	### シナリオ名: LLM失敗時のフォールバック統合動作
    86	- 目的: LLM 呼び出しがタイムアウトした場合に WARN ログと共にレガシーテンプレートへフォールバックする統合挙動を確認する（FR-3）。
    87	- 前提条件: LLM プロバイダモックが 3 回タイムアウト例外を投げる。`maxRetries=3`。Octokit/IssueAIGenerator 以外は実装通り。
    88	- テスト手順:
    89	  1. `npm run test:integration -- followup-issue-llm` を実行し、タイムアウトをシミュレート。
    90	  2. テスト内で WARN ログが出力されたかをアサート。
    91	  3. Issue 本文がレガシーテンプレートで生成されたか確認。
    92	- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が 1 件、Octokit へ送信された本文は `## 背景`・`## 残タスク詳細` を含む既存形式。テストは成功扱い。
    93	- 確認項目: WARN ログ内容、フォールバック本文、リトライ回数=3。
    94	
    95	### シナリオ名: 実APIエンドツーエンド検証（オプトイン）
    96	- 目的: 実際の LLM API 呼び出しで生成品質とセクション構造が満たされることを確認する（FR-1, FR-2, FR-5）。
    97	- 前提条件: `FOLLOWUP_LLM_E2E=1`, `ANTHROPIC_API_KEY` または `OPENAI_API_KEY` を設定。GitHub への書き込みはダミークライアントに差し替え（ネットワーク負荷を避ける）。
    98	- テスト手順:
    99	  1. `FOLLOWUP_LLM_E2E=1 npm run test:integration -- followup-issue-llm.e2e` を実行。
   100	  2. テストは LLM からの応答を取得し、タイトル長と本文セクションを検証。
   101	  3. 生成結果サンプルをスナップショットとして保存し、手動レビュー用に出力。
   102	- 期待結果: 50〜80文字のタイトルと 5 セクションを含む本文が生成される。`実行内容` に番号付きリストと「テスト」の記述を含む。メタデータが `durationMs` と `input/outputTokens` を保持。
   103	- 確認項目: タイトル文字数、各セクション存在、`appendMetadata` の有無、API呼び出し時間。
   104	
   105	## 4. テストデータ
   106	- `task_high_priority`:  
   107	  ```
   108	  {
   109	    task: "core/gitカバレッジ向上",
   110	    description: "core/git モジュールの単体テストを追加しカバレッジ90%を目指す。",
   111	    targetFiles: ["src/core/git/index.ts", "src/core/git/utils.ts"],
   112	    steps: ["既存テストの重複を整理", "core/git に Jest テストを追加", "npm run test -- core/git"],
   113	    acceptanceCriteria: ["テストカバレッジレポートでcore/gitが90%を超える"],
   114	    priority: "HIGH",
   115	    priorityReason: "リリース前に品質基準を満たす必要がある",
   116	    estimatedHours: 6
   117	  }
   118	  ```
   119	- `task_medium_priority`: 中優先度でステップ/ファイルが複数のタスク（`priority: "MEDIUM"`、`steps` 3件）。
   120	- `task_low_priority`: 低優先度で受け入れ基準が2件のタスク。
   121	- `task_priority_set`: 高3件・中2件・低1件を含む配列。1件に512文字超の説明と11件の `targetFiles` を設定。
   122	- `context_with_blocker`: `summary`, `blockerStatus`, `deferredReason` を含む IssueContext。`deferredReason` に「Bearer sk-test-abc12345 を含まないようマスキングが必要」と記述。
   123	- `context_with_secret`: `summary` にメールアドレス `owner@example.com` とアクセストークン `token=XYZ987654321` を含め、マスキングを検証。
   124	- `sanitization_fixture`: シークレット文字列、メールアドレス、Bearer トークン、循環参照を含むオブジェクト。
   125	- LLM モックレスポンス: 成功パターン JSON（タイトル70文字、本文5セクション）、検証失敗パターン（`## 実行内容` 欠落）、非 JSON 文字列パターン。
   126	
   127	## 5. テスト環境要件
   128	- Node.js 20.x / TypeScript 5.x、Jest ベースのテストランナー（`npm run test:unit`, `npm run test:integration`）。`ts-jest` もしくは `esbuild-jest` に対応。
   129	- LLM モック用に `nock` またはプロバイダアダプタの手動スタブを使用。タイマー制御には `jest.useFakeTimers()` を利用。
   130	- Octokit を呼び出す統合テストでは `@octokit/rest` をモックし、GitHub への実呼び出しを防止。
```

## Turn 23: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba ./.ai-workflow/issue-119/03_test_scenario/output/test-scenario.md | sed -n '40,90p'"`
**ステータス**: completed (exit_code=0)

```text
40	- 前提条件: 6件のタスク（高3/中2/低1）、長文の `steps`・`targetFiles`、Bearer トークン/メールアドレスを含む説明を用意。
    41	- 入力: `maxTasks=5`, `IssueContext` あり。
    42	- 期待結果: 高→中→低の優先度順に5件へ切り詰められる。文字列512文字でトリム済み。`targetFiles` は10件に制限。シークレット文字列が `[REDACTED_]` へ置換される。
    43	- テストデータ: `task_priority_set`, `context_with_secret`.
    44	
    45	### テストケース名: secret_masker_mask_object_正常系
    46	- 目的: `maskObject` がネスト/配列/循環参照を含むオブジェクトを破壊せずにマスキングすることを確認する（セキュリティ要件）。
    47	- 前提条件: `ignoredPaths=['tasks.1.meta']` を指定。循環参照を含むテストオブジェクトを作成。
    48	- 入力: API キー文字列、メールアドレス、Bearer トークンを含むオブジェクト。
    49	- 期待結果: 元オブジェクトは不変。戻り値で対象文字列が `[REDACTED_*]` に置換され、`ignoredPaths` 指定フィールドは未マスク。
    50	- テストデータ: `sanitization_fixture`.
    51	
    52	### テストケース名: issue_client_create_issue_llm_success_正常系
    53	- 目的: LLM 出力が成功した場合にタイトル/本文/メタデータが採用され、Octokit へ送信されることを検証する（FR-1〜FR-5）。
    54	- 前提条件: `appendMetadata=true`、`IssueAIGenerator` モックが成功結果を返す、Octokit モックが `issues.create` 呼び出しを記録。
    55	- 入力: タスク2件（高/中）、`IssueContext` あり。
    56	- 期待結果: Octokit へ渡るタイトル/本文が LLM 結果とメタデータ追記を含む。WARN ログは発生しない。
    57	- テストデータ: `task_high_priority`, `task_medium_priority`, `context_with_blocker`, LLM 成功レスポンス。
    58	
    59	### テストケース名: issue_client_create_issue_llm_fallback_異常系
    60	- 目的: LLM 失敗時に WARN ログと共に既存テンプレートへフォールバックすることを検証する（FR-3）。
    61	- 前提条件: `IssueAIGenerator.generate` が `IssueAIValidationError` を throw。Octokit モックが呼び出される。
    62	- 入力: タスク1件、`IssueContext` あり。
    63	- 期待結果: WARN ログ `FOLLOWUP_LLM_FALLBACK` が出力され、Octokit へはレガシータイトル/本文が送信される。
    64	- テストデータ: `task_low_priority`, 既存 `generateFollowUpTitle` で計算可能なキーワード。
    65	
    66	### テストケース名: issue_client_create_issue_llm_disabled_境界値
    67	- 目的: `IssueGenerationOptions.enabled=false` の場合に LLM を呼び出さず既存挙動を維持することを確認する（FR-4）。
    68	- 前提条件: `enabled=false`, `appendMetadata=false`。`IssueAIGenerator` モックは呼ばれていないことを検証。
    69	- 入力: タスク1件、`IssueContext` あり。
    70	- 期待結果: LLM 呼び出しが 0 回、Octokit へはレガシータイトル/本文が送信される。ログには LLM 無効化の INFO が出力される。
    71	- テストデータ: `task_medium_priority`.
    72	
    73	## 3. Integrationテストシナリオ
    74	
    75	### シナリオ名: CLIからIssueClientへのLLMオプション伝搬
    76	- 目的: CLI 引数・環境変数が PhaseContext を経由して `IssueGenerationOptions` に伝搬することを検証する（FR-4）。
    77	- 前提条件: OpenAI/Claude APIキーはダミー、`FOLLOWUP_LLM_MODE=auto` を設定。Octokit と LLM プロバイダはモック。
    78	- テスト手順:
    79	  1. `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode claude --followup-llm-model claude-3-sonnet-20240229 --followup-llm-timeout 20000 --followup-llm-max-retries 2 --followup-llm-append-metadata` を `NODE_ENV=test` で実行。
    80	  2. テストフックで `IssueClient.createIssueFromEvaluation` 呼び出し時の `options` をキャプチャ。
    81	  3. CLI 実行結果を検査。
    82	- 期待結果: 受け取った `options` が CLI 指定値（provider=claude, timeout=20000, maxRetries=2, appendMetadata=true, enabled=true）となる。フェイルオーバーは発動しない。
    83	- 確認項目: オプション値一致、ログに `FOLLOWUP_LLM_SUCCESS` が存在、Octokit 呼び出し成功。
    84	
    85	### シナリオ名: LLM失敗時のフォールバック統合動作
    86	- 目的: LLM 呼び出しがタイムアウトした場合に WARN ログと共にレガシーテンプレートへフォールバックする統合挙動を確認する（FR-3）。
    87	- 前提条件: LLM プロバイダモックが 3 回タイムアウト例外を投げる。`maxRetries=3`。Octokit/IssueAIGenerator 以外は実装通り。
    88	- テスト手順:
    89	  1. `npm run test:integration -- followup-issue-llm` を実行し、タイムアウトをシミュレート。
    90	  2. テスト内で WARN ログが出力されたかをアサート。
```

## Turn 24: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'grep -n "REDACT" -n ./.ai-workflow/issue-119/02_design/output/design.md'`
**ステータス**: completed (exit_code=0)

```text
186:       - `SecretMasker.maskObject` で既知のシークレット値・トークン・メールアドレスを `[REDACTED_x]` に置換。
324:  1. `getSecretList()` で環境変数ベースのシークレットを取得し、`[REDACTED_${name}]` への置換テーブルを構築。
325:  2. 追加で以下のパターンを検出する正規表現を用意し、ヒットした文字列は `[REDACTED_PATTERN]` に置換する。
```

## Turn 25: ツール実行

**種別**: agent_message
**ステータス**: completed

## Turn 26: 実行完了

**ステータス**: completed
**所要時間**: 226401ms
**ターン数**: N/A

---

**経過時間**: 226401ms
**開始**: 2025-11-03T03:12:58.984Z
**終了**: 2025-11-03T03:16:45.385Z