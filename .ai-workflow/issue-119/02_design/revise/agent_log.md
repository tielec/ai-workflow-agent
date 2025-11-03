# Codex Agent 実行ログ

開始日時: 2025/11/3 3:03:05

---

## Turn 1: スレッド開始

**Thread ID**: `019a47ab-1625-78a0-bf33-dbcd28d0317e`

## Turn 2: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'cat .ai-workflow/issue-119/02_design/output/design.md'`
**ステータス**: failed (exit_code=1)

```text
cat: .ai-workflow/issue-119/02_design/output/design.md: No such file or directory
```

## Turn 3: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc ls`
**ステータス**: completed (exit_code=0)

```text
execute
output
review
revise
```

## Turn 4: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc ls`
**ステータス**: completed (exit_code=0)

```text
design.md
```

## Turn 5: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'cat design.md'`
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
- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
- `src/core/config.ts`: LLM 設定用ゲッターを実装。
- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`) を LLM 統合ケースで更新。

### 5.2 依存関係の変更
- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
- Jest モックは既存 `jest-mock-extended` や手動モックを活用。

### 5.3 マイグレ
... (truncated)
```

## Turn 6: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '1,200p' design.md"`
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
- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
- `src/core/config.ts`: LLM 設定用ゲッターを実装。
- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`) を LLM 統合ケースで更新。

### 5.2 依存関係の変更
- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
- Jest モックは既存 `jest-mock-extended` や手動モックを活用。

### 5.3 マイグレ
... (truncated)
```

## Turn 7: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '200,400p' design.md"`
**ステータス**: completed (exit_code=0)

```text
text: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
  durationMs: number;
}
```

- **OpenAIAdapter**
  - `openai.chat.completions.create()` を呼び出し、`response_format: { type: 'json_object' }` を指定。
  - `AbortController` で `timeoutMs` を強制。
  - HTTP 429/5xx 時は指数バックオフで再試行。最終的に失敗ならエラーをスロー。
- **AnthropicAdapter**
  - `@anthropic-ai/claude-agent-sdk` の `messages.create()` を利用。
  - `options.model` が無ければ `claude-3-sonnet-20240229` を使用。
  - 応答の `content` を結合し JSON テキストを取得。
- `provider: 'auto'` の場合は OpenAI キーが存在すれば OpenAIAdapter、それ以外は ClaudeAdapter を選択。

### 7.4 プロンプト生成とバリデーション

テンプレート例 (コード内定数として保持):

````markdown
あなたはソフトウェア開発プロジェクトのIssue作成アシスタントです。
以下のJSONを読み取り、フォローアップIssueを構築してください。

入力:
{{payload}}

要件:
1. タイトルは50〜80文字。対象コンポーネントや目的のキーワードを含めること。
2. 本文は以下の見出し順序とします。
   ## 背景
   ## 目的
   ## 実行内容
   ## 受け入れ基準
   ## 関連リソース
3. 実行内容には対象ファイル・手順・テスト方法を含めること。
4. JSON 形式で回答してください。

出力形式:
{
  "title": "...",
  "body": "..."
}
````

- `parseAndValidate` 検証ルール:
  - JSON パース失敗 → `IssueAIValidationError`。
  - タイトル文字数 (全角半角問わず) が 50 未満または 80 超過で失敗。
  - 本文に必須5セクションが順番に存在するか正規表現で確認。
  - `## 実行内容` 内に番号付きリスト (`^\d+\. `) があり、いずれかの行に `テスト`/`検証` を含むことを確認。
  - HTML/スクリプトタグを検出したら失敗。
  - 余分な末尾空行は `trimEnd()` で整理。

### 7.5 IssueClient 拡張

- コンストラクタに `IssueAIGenerator | null` を追加 (`new IssueClient(octokit, owner, repo, issueAIGenerator)`).
- 新規ヘルパー:
  - `private buildLegacyBody(...)`: 現行ロジックを抽出し、フォールバック時に再利用。
  - `private appendMetadata(body, metadata, options)`: `options.appendMetadata` が true の場合に以下を追加。
    ```
    ## 生成メタデータ
    - モデル: ${metadata.model} (${metadata.provider})
    - 所要時間: ${metadata.durationMs}ms / 再試行: ${metadata.retryCount}
    - トークン: in ${metadata.inputTokens ?? '-'} / out ${metadata.outputTokens ?? '-'}
    - 省略したタスク数: ${metadata.omittedTasks ?? 0}
    ```
  - `private async tryGenerateWithLLM(...)`: LLM が利用可能か判定し、失敗時は WARN ログで理由を記録して `null` を返す。
- `createIssueFromEvaluation` の流れ:
  1. `const aiResult = await this.tryGenerateWithLLM(...);`
  2. `const title = aiResult?.title ?? this.generateFollowUpTitle(...);`
  3. `const baseBody = aiResult?.body ?? this.buildLegacyBody(...);`
  4. `const body = aiResult ? this.appendMetadata(baseBody, aiResult.metadata, options) : baseBody;`
  5. 既存どおり Octokit で Issue を作成。
- ログ出力:
  - 成功 (`logger.debug`): `FOLLOWUP_LLM_SUCCESS { provider, model, durationMs, retryCount }`
  - フォールバック (`logger.warn`): `FOLLOWUP_LLM_FALLBACK { reason, fallback: 'legacy_template' }`
  - ログにはプロンプト本文を含めない。

### 7.6 GitHubClient / Phase 連携

- `GitHubClient` コンストラクタで `IssueAIGenerator` を生成し `IssueClient` に渡す。
- `createIssueFromEvaluation` の署名を `(..., issueContext?: IssueContext, options?: IssueGenerationOptions)` に拡張。`options` が無い場合は `config` から取得する。
- `EvaluationPhase`:
  ```ts
  const options = this.context.issueGenerationOptions ?? { enabled: false, provider: 'auto' };
  const result = await this.github.createIssueFromEvaluation(
    issueNumber,
    remainingTasks,
    relativeReportPath,
    issueContext,
    options,
  );
  ```
- `PhaseFactory` / `BasePhase` で `PhaseContext.issueGenerationOptions` を新たに受け渡す。

### 7.7 CLI / Config 拡張

- `ExecuteCommandOptions` に以下フィールドを追加:
  - `followupLlmMode?: 'auto' | 'openai' | 'claude' | 'off'`
  - `followupLlmModel?: string`
  - `followupLlmTimeout?: number`
  - `followupLlmMaxRetries?: number`
  - `followupLlmAppendMetadata?: boolean`
- `options-parser.ts` でバリデーション:
  - `off` → `enabled` false。
  - timeout/retries は正の整数 (0 許容)。
  - provider 指定が `openai` なのに OpenAI APIキー不在の場合は警告ログを出して `enabled=false`。
- `config.ts` で環境変数ゲッターを追加 (`FOLLOWUP_LLM_MODE`, `FOLLOWUP_LLM_MODEL`, `FOLLOWUP_LLM_TIMEOUT_MS`, `FOLLOWUP_LLM_MAX_RETRIES`, `FOLLOWUP_LLM_APPEND_METADATA`)。
- CLI 例:  
  `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode auto --followup-llm-model claude-3-sonnet-20240229`.

### 7.8 ロギング・モニタリング

- LLM 成功時は DEBUG ログ、再試行数 > 0 の場合は WARN と INFO の両方に出力して追跡可能にする。
- フォールバック発生時は WARN ログを構造化文字列 (JSON 互換) で出力。`event=FOLLOWUP_LLM_FALLBACK`, `fall
... (truncated)
```

## Turn 8: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '400,600p' design.md"`
**ステータス**: completed (exit_code=0)

## Turn 9: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '120,220p' design.md"`
**ステータス**: completed (exit_code=0)

```text
- `src/types.ts`
  - `src/types/commands.ts`
  - `src/core/config.ts`
  - `tests/unit/github/issue-client.test.ts`
  - `tests/unit/github/issue-client-followup.test.ts`
  - `tests/integration/github-client-facade.test.ts`
  - ドキュメント (`ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `.env.example`)
- **削除予定**: なし

---

## 7. 詳細設計

### 7.1 IssueGenerationOptions / IssueAIGenerationResult

```ts
export interface IssueGenerationOptions {
  enabled: boolean;
  provider: 'auto' | 'openai' | 'claude';
  model?: string;
  temperature?: number;          // default 0.2
  maxOutputTokens?: number;      // default 1500
  timeoutMs?: number;            // default 25000
  maxRetries?: number;           // default 3
  maxTasks?: number;             // default 5
  appendMetadata?: boolean;      // default false
}

export interface IssueAIGenerationResult {
  title: string;
  body: string;
  metadata: {
    provider: 'openai' | 'claude';
    model: string;
    durationMs: number;
    retryCount: number;
    inputTokens?: number;
    outputTokens?: number;
    omittedTasks?: number;
  };
}
```

- `config` でデフォルトを構築し、CLI/環境変数で上書き可能にする。
- `PhaseContext` に `issueGenerationOptions` を追加し、省略時は `{ enabled: false, provider: 'auto' }` を適用。

### 7.2 IssueAIGenerator クラス (新規)

- コンストラクタ: `(providers: Record<'openai' | 'claude', LlmProviderAdapter>, secretMasker = new SecretMasker())`。
- 補助的なエラー型:
  - `IssueAIUnavailableError` (credentials 不足など)
  - `IssueAIValidationError` (出力検証失敗)
- 公開メソッド:
  - `isAvailable(options: IssueGenerationOptions): boolean`  
    - `options.enabled` が true かつ選択された provider（`auto` の場合は利用可能なもの）が `hasCredentials()` を満たす。
  - `generate(tasks, context, issueNumber, options): Promise<IssueAIGenerationResult>`  
    1. `sanitizePayload(tasks, context, options.maxTasks ?? 5)`  
       - `RemainingTask` を優先度順 (High→Medium→Low) に並べ、上位 `maxTasks` を採用。超過分は `omittedTasks` としてメタに記録。  
       - 各文字列フィールドは 512 文字にトリム。`targetFiles` は 10 件、`steps` / `acceptanceCriteria` は各 8 件まで。  
       - `SecretMasker.maskObject` で既知のシークレット値・トークン・メールアドレスを `[REDACTED_x]` に置換。
    2. `buildPrompt(issueNumber, sanitizedPayload, context, options)`  
       - JSON 文字列化し、テンプレートへ埋め込む。
    3. `invokeProvider(prompt, options)`  
       - 選択された provider の `complete()` を呼び出す。  
       - レート制限時は指数バックオフ (2000ms, 4000ms, 8000ms) とし、回数は `options.maxRetries`。
    4. `parseAndValidate(responseText)`  
       - JSON パース → タイトル長 50〜80 文字 → 必須セクションを順番に確認 → `実行内容` セクションが番号付きリスト (`1.` 形式) とテスト手順 (`テスト` or `検証`) を含むか検証 → HTML タグを禁止。  
       - 失敗時は `IssueAIValidationError`。
    5. 成功時に metadata (provider, model, duration, retryCount, input/output tokens, omittedTasks) 付きで返却。

### 7.3 LlmProviderAdapter

```ts
interface LlmProviderAdapter {
  name: 'openai' | 'claude';
  hasCredentials(): boolean;
  complete(prompt: string, options: IssueGenerationOptions): Promise<LlmProviderResponse>;
}

interface LlmProviderResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
  durationMs: number;
}
```

- **OpenAIAdapter**
  - `openai.chat.completions.create()` を呼び出し、`response_format: { type: 'json_object' }` を指定。
  - `AbortController` で `timeoutMs` を強制。
  - HTTP 429/5xx 時は指数バックオフで再試行。最終的に失敗ならエラーをスロー。
- **AnthropicAdapter**
  - `@anthropic-ai/claude-agent-sdk` の `messages.create()` を利用。
  - `options.model` が無ければ `claude-3-sonnet-20240229` を使用。
  - 応答の `content` を結合し JSON テキストを取得。
- `provider: 'auto'` の場合は OpenAI キーが存在すれば OpenAIAdapter、それ以外は ClaudeAdapter を選択。

### 7.4 プロンプト生成とバリデーション

テンプレート例 (コード内定数として保持):
```

## Turn 10: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '90,140p' design.md"`
**ステータス**: completed (exit_code=0)

```text
- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
- `src/core/config.ts`: LLM 設定用ゲッターを実装。
- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`) を LLM 統合ケースで更新。

### 5.2 依存関係の変更
- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
- Jest モックは既存 `jest-mock-extended` や手動モックを活用。

### 5.3 マイグレーション要否
- データマイグレーションは不要。
- `.env.example` が存在する場合は Follow-up LLM 用環境変数を追加。
- `ARCHITECTURE.md`, `CLAUDE.md`, `README.md` を更新して設定手順とフォールバック説明を追記。

---

## 6. 変更・追加ファイルリスト

- **新規作成**
  - `src/core/github/issue-ai-generator.ts`
  - `tests/unit/github/issue-ai-generator.test.ts`
  - `tests/integration/followup-issue-llm.test.ts` (Octokit モック中心)
- **既存修正**
  - `src/core/github/issue-client.ts`
  - `src/core/github-client.ts`
  - `src/phases/evaluation.ts`
  - `src/commands/execute.ts`
  - `src/commands/execute/options-parser.ts`
  - `src/types.ts`
  - `src/types/commands.ts`
  - `src/core/config.ts`
  - `tests/unit/github/issue-client.test.ts`
  - `tests/unit/github/issue-client-followup.test.ts`
  - `tests/integration/github-client-facade.test.ts`
  - ドキュメント (`ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `.env.example`)
- **削除予定**: なし

---

## 7. 詳細設計

### 7.1 IssueGenerationOptions / IssueAIGenerationResult

```ts
export interface IssueGenerationOptions {
  enabled: boolean;
  provider: 'auto' | 'openai' | 'claude';
  model?: string;
  temperature?: number;          // default 0.2
```

## Turn 11: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'ls src/phases'`
**ステータス**: completed (exit_code=0)

```text
base-phase.ts
cleanup
context
core
design.ts
documentation.ts
evaluation.ts
formatters
implementation.ts
lifecycle
planning.ts
report.ts
requirements.ts
test-implementation.ts
test-scenario.ts
testing.ts
```

## Turn 12: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'ls src/phases/core'`
**ステータス**: completed (exit_code=0)

```text
agent-executor.ts
review-cycle-manager.ts
```

## Turn 13: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'rg "PhaseFactory" -n'`
**ステータス**: failed (exit_code=127)

```text
bash: line 1: rg: command not found
```

## Turn 14: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'grep -R "PhaseFactory" -n'`
**ステータス**: completed (exit_code=0)

```text
.ai-workflow/issue-119/02_design/revise/prompt.txt:40:**懸念点**: `PhaseContext` を拡張すると明記しているものの、`PhaseFactory` や `BasePhase` など伝搬に必要なファイルが変更リストに含まれていません（design.md:85, design.md:108）。
.ai-workflow/issue-119/02_design/revise/prompt.txt:72:   - 現状: `PhaseContext.issueGenerationOptions` を追加すると記載されていますが、`PhaseFactory` や `BasePhase` などで値を渡す作業が変更一覧に載っていません（design.md:85, design.md:108）。
.ai-workflow/issue-119/02_design/review/result.md:19:**懸念点**: `PhaseContext` を拡張すると明記しているものの、`PhaseFactory` や `BasePhase` など伝搬に必要なファイルが変更リストに含まれていません（design.md:85, design.md:108）。
.ai-workflow/issue-119/02_design/review/result.md:51:   - 現状: `PhaseContext.issueGenerationOptions` を追加すると記載されていますが、`PhaseFactory` や `BasePhase` などで値を渡す作業が変更一覧に載っていません（design.md:85, design.md:108）。
.ai-workflow/issue-119/02_design/review/agent_log.md:289:2. `commands/execute` が `PhaseContext.issueGenerationOptions` を組み立て、`PhaseFactory` 経由で `EvaluationPhase` へ受け渡す。
.ai-workflow/issue-119/02_design/review/agent_log.md:400:2. `commands/execute` が `PhaseContext.issueGenerationOptions` を組み立て、`PhaseFactory` 経由で `EvaluationPhase` へ受け渡す。
.ai-workflow/issue-119/02_design/review/agent_log_raw.txt:14:{"type":"item.completed","item":{"id":"item_5","type":"command_execution","command":"bash -lc 'cat .ai-workflow/issue-119/02_design/output/design.md'","aggregated_output":"# 詳細設計書 - Issue #119 フォローアップIssue生成品質の改善（LLM活用）\n\n**Issue番号**: #119  \n**タイトル**: フォローアップIssue生成品質の改善（LLM活用）  \n**バージョン**: 1.1 (Design)\n\n---\n\n## 1. アーキテクチャ設計\n\n### 1.1 システム全体フロー\n\n```\nEvaluationPhase (Phase 9)\n    │ RemainingTask[], IssueContext, evaluation report path, generation options\n    ▼\nGitHubClient.createIssueFromEvaluation(...)\n    │ delegates\n    ▼\nIssueClient (LLM-aware)\n    ├─ IssueAIGenerator.generate(...)\n    │     └─ LLM Provider Adapter (OpenAI / Anthropic)\n    └─ Legacy builders (generateFollowUpTitle + buildLegacyBody)\n    ▼\nOctokit.issues.create(...) → GitHub Issue\n```\n\n### 1.2 コンポーネント責務\n\n| コンポーネント | 役割 | 主な入出力 |\n| --- | --- | --- |\n| `EvaluationPhase` | Phase 9 の処理。残タスク検出後に GitHubClient へフォローアップ生成を依頼 | 入力: Evaluation結果 / 出力: IssueGenerationOptions 付き呼び出し |\n| `GitHubClient` | GitHub API ファサード。IssueClient へ委譲し設定を束ねる | 入力: issue番号, tasks, options / 出力: IssueCreationResult |\n| `IssueClient` | フォローアップIssue生成の集約。LLM生成→フォールバック制御→Octokit呼び出し | 入力: tasks, context, options / 出力: タイトル・本文・ログ |\n| `IssueAIGenerator` (新規) | LLMプロンプト生成、API呼び出し、レスポンス検証 | 入力: tasks, context, options / 出力: { title, body, metadata } |\n| `LlmProviderAdapter` (OpenAI / Anthropic) | 各APIのラッパー。タイムアウト・再試行を実装 | 入出力: prompt, call options, completion JSON |\n| `config` / CLI | 環境変数・CLIから LLM 設定を収集し PhaseContextへ渡す | 入出力: Follow-up LLM 設定値 |\n| `SecretMasker` (既存) | 機密情報のマスキング | 入力: プロンプトPayload / 出力: SanitizedPayload |\n\n### 1.3 データフロー\n\n1. ユーザーが `ai-workflow execute ...` を実行し、CLI が Follow-up LLM オプションを解析 (デフォルトは無効)。\n2. `commands/execute` が `PhaseContext.issueGenerationOptions` を組み立て、`PhaseFactory` 経由で `EvaluationPhase` へ受け渡す。\n3. EvaluationPhase で残タスクが存在すると `GitHubClient.createIssueFromEvaluation(issueNumber, tasks, reportPath, context, options)` を呼び出す。\n4. `GitHubClient` は `IssueAIGenerator` をコンストラクタインジェクション済みの `IssueClient` に委譲。\n5. `IssueClient` が `options.enabled` と `IssueAIGenerator.isAvailable()` を確認し、利用可能なら `generate(tasks, context, options)` を試行。\n6. `IssueAIGenerator` は payload をサニタイズ→プロンプト生成→LLM呼び出し→検証し、成功時にタイトル・本文を返却。\n7. LLM 失敗または無効時、`IssueClient` は既存の `generateFollowUpTitle` と新設の `buildLegacyBody` でフォールバック本文を生成。\n8. 生成結果と `## 参考` セクション (＋オプションで LLM metadata) を結合し、Octokit で Issue を作成。ログへ成否とメタ情報を出力。\n\n### 1.4 主なシーケンスと失敗時動作\n\n- LLM 成功: `IssueAIGenerator` → validated result → `IssueClient` が LLM 出力を採用 → `options.appendMetadata` が true の場合にメタデータ節を付加。\n- LLM タイムアウト / レート制限: Providerアダプタが指数バックオフで再試行。全失敗で `IssueAIError` を返し IssueClient が WARN を記録しフォールバック。\n- プロンプト検証失敗: `IssueAIGenerator` が `IssueAIValidationError` を送出し、同様にフォールバック。\n- Octokit 失敗: 既存処理と同様に ERROR ログを出力し `IssueCreationResult` で失敗を返却。\n\n---\n\n#
... (truncated)
```

## Turn 15: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "find src -name '*phase-factory*'"`
**ステータス**: completed (exit_code=0)

```text
src/core/phase-factory.ts
```

## Turn 16: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '220,360p' design.md"`
**ステータス**: completed (exit_code=0)

```text
テンプレート例 (コード内定数として保持):

````markdown
あなたはソフトウェア開発プロジェクトのIssue作成アシスタントです。
以下のJSONを読み取り、フォローアップIssueを構築してください。

入力:
{{payload}}

要件:
1. タイトルは50〜80文字。対象コンポーネントや目的のキーワードを含めること。
2. 本文は以下の見出し順序とします。
   ## 背景
   ## 目的
   ## 実行内容
   ## 受け入れ基準
   ## 関連リソース
3. 実行内容には対象ファイル・手順・テスト方法を含めること。
4. JSON 形式で回答してください。

出力形式:
{
  "title": "...",
  "body": "..."
}
````

- `parseAndValidate` 検証ルール:
  - JSON パース失敗 → `IssueAIValidationError`。
  - タイトル文字数 (全角半角問わず) が 50 未満または 80 超過で失敗。
  - 本文に必須5セクションが順番に存在するか正規表現で確認。
  - `## 実行内容` 内に番号付きリスト (`^\d+\. `) があり、いずれかの行に `テスト`/`検証` を含むことを確認。
  - HTML/スクリプトタグを検出したら失敗。
  - 余分な末尾空行は `trimEnd()` で整理。

### 7.5 IssueClient 拡張

- コンストラクタに `IssueAIGenerator | null` を追加 (`new IssueClient(octokit, owner, repo, issueAIGenerator)`).
- 新規ヘルパー:
  - `private buildLegacyBody(...)`: 現行ロジックを抽出し、フォールバック時に再利用。
  - `private appendMetadata(body, metadata, options)`: `options.appendMetadata` が true の場合に以下を追加。
    ```
    ## 生成メタデータ
    - モデル: ${metadata.model} (${metadata.provider})
    - 所要時間: ${metadata.durationMs}ms / 再試行: ${metadata.retryCount}
    - トークン: in ${metadata.inputTokens ?? '-'} / out ${metadata.outputTokens ?? '-'}
    - 省略したタスク数: ${metadata.omittedTasks ?? 0}
    ```
  - `private async tryGenerateWithLLM(...)`: LLM が利用可能か判定し、失敗時は WARN ログで理由を記録して `null` を返す。
- `createIssueFromEvaluation` の流れ:
  1. `const aiResult = await this.tryGenerateWithLLM(...);`
  2. `const title = aiResult?.title ?? this.generateFollowUpTitle(...);`
  3. `const baseBody = aiResult?.body ?? this.buildLegacyBody(...);`
  4. `const body = aiResult ? this.appendMetadata(baseBody, aiResult.metadata, options) : baseBody;`
  5. 既存どおり Octokit で Issue を作成。
- ログ出力:
  - 成功 (`logger.debug`): `FOLLOWUP_LLM_SUCCESS { provider, model, durationMs, retryCount }`
  - フォールバック (`logger.warn`): `FOLLOWUP_LLM_FALLBACK { reason, fallback: 'legacy_template' }`
  - ログにはプロンプト本文を含めない。

### 7.6 GitHubClient / Phase 連携

- `GitHubClient` コンストラクタで `IssueAIGenerator` を生成し `IssueClient` に渡す。
- `createIssueFromEvaluation` の署名を `(..., issueContext?: IssueContext, options?: IssueGenerationOptions)` に拡張。`options` が無い場合は `config` から取得する。
- `EvaluationPhase`:
  ```ts
  const options = this.context.issueGenerationOptions ?? { enabled: false, provider: 'auto' };
  const result = await this.github.createIssueFromEvaluation(
    issueNumber,
    remainingTasks,
    relativeReportPath,
    issueContext,
    options,
  );
  ```
- `PhaseFactory` / `BasePhase` で `PhaseContext.issueGenerationOptions` を新たに受け渡す。

### 7.7 CLI / Config 拡張

- `ExecuteCommandOptions` に以下フィールドを追加:
  - `followupLlmMode?: 'auto' | 'openai' | 'claude' | 'off'`
  - `followupLlmModel?: string`
  - `followupLlmTimeout?: number`
  - `followupLlmMaxRetries?: number`
  - `followupLlmAppendMetadata?: boolean`
- `options-parser.ts` でバリデーション:
  - `off` → `enabled` false。
  - timeout/retries は正の整数 (0 許容)。
  - provider 指定が `openai` なのに OpenAI APIキー不在の場合は警告ログを出して `enabled=false`。
- `config.ts` で環境変数ゲッターを追加 (`FOLLOWUP_LLM_MODE`, `FOLLOWUP_LLM_MODEL`, `FOLLOWUP_LLM_TIMEOUT_MS`, `FOLLOWUP_LLM_MAX_RETRIES`, `FOLLOWUP_LLM_APPEND_METADATA`)。
- CLI 例:  
  `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode auto --followup-llm-model claude-3-sonnet-20240229`.

### 7.8 ロギング・モニタリング

- LLM 成功時は DEBUG ログ、再試行数 > 0 の場合は WARN と INFO の両方に出力して追跡可能にする。
- フォールバック発生時は WARN ログを構造化文字列 (JSON 互換) で出力。`event=FOLLOWUP_LLM_FALLBACK`, `fallback_mode=legacy_template`, `reason=...`。
- `IssueAIGenerator.generate` 内で `performance.now()` を使い処理時間を計測。
- ログには機密情報やプロンプト全文を含めない。

### 7.9 テスト設計詳細

| レイヤ | テストケース | 目的 |
| --- | --- | --- |
| Unit (`issue-ai-generator.test.ts`) | タスク数制限・文字列トリム・ターゲットファイル上限を検証 | サニタイズ仕様の担保 |
|  | JSON 以外の応答で `IssueAIValidationError` を投げる | バリデーション |
|  | 必須セクション欠落、タイトル長不正、HTMLタグ混入で失敗する | FR-1/FR-2 |
|  | 1回目失敗→2回目成功のリトライ時に最終成功 | リトライ制御 |
|  | `SecretMasker` により API キーがプロンプトに残らない | セキュリティ |
| Unit (`issue-client.test.ts`) | LLM 成功時に Octokit へ LLM 出力が渡る | フロー検証 |
|  | 例外発生時に WARN ログとフォールバックタイトル/本文が使用される | FR-3 |
| In
... (truncated)
```

## Turn 17: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'ls src/core'`
**ステータス**: completed (exit_code=0)

```text
claude-agent-client.ts
codex-agent-client.ts
config.ts
content-parser.ts
git
git-manager.ts
github
github-client.ts
helpers
logger.ts
metadata-manager.ts
path-utils.ts
phase-dependencies.ts
phase-factory.ts
repository-utils.ts
secret-masker.ts
workflow-state.ts
```

## Turn 18: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc 'grep -R "secret-masker" -n tests'`
**ステータス**: completed (exit_code=0)

```text
tests/unit/secret-masker.test.ts:2: * ユニットテスト: secret-masker.ts
tests/unit/secret-masker.test.ts:14:import { SecretMasker } from '../../src/core/secret-masker.js';
tests/unit/secret-masker.test.ts:18:const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'secret-masker-test');
tests/unit/git/commit-manager.test.ts:11:import { SecretMasker } from '../../../src/core/secret-masker';
tests/integration/init-token-sanitization.test.ts:18:import { SecretMasker } from '../../src/core/secret-masker.js';
```

## Turn 19: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '1,200p' src/core/secret-masker.ts"`
**ステータス**: completed (exit_code=0)

```text
import * as fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import { glob } from 'glob';
import { getErrorMessage } from '../utils/error-utils.js';

export interface Secret {
  name: string;
  value: string;
}

export interface MaskingResult {
  filesProcessed: number;
  secretsMasked: number;
  errors: string[];
}

/**
 * SecretMasker - Masks secrets in workflow files before Git commit
 *
 * This class prevents GitHub Secret Scanning from blocking pushes by
 * replacing secret values from environment variables with redacted placeholders.
 */
export class SecretMasker {
  private readonly targetFilePatterns = [
    'agent_log_raw.txt',
    'agent_log.md',
    'prompt.txt',
    'metadata.json', // Issue #54: Scan metadata.json for tokens
  ];

  private readonly envVarNames = [
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
  ];

  /**
   * Get list of secrets from environment variables
   */
  public getSecretList(): Secret[] {
    const secrets: Secret[] = [];

    for (const name of this.envVarNames) {
      const value = process.env[name];
      if (value && value.length > 10) {
        secrets.push({ name, value });
      }
    }

    return secrets;
  }

  /**
   * Mask secrets in all files within workflow directory
   *
   * @param workflowDir - Path to .ai-workflow/issue-{number}/ directory
   * @returns MaskingResult with statistics
   */
  public async maskSecretsInWorkflowDir(
    workflowDir: string,
  ): Promise<MaskingResult> {
    const secrets = this.getSecretList();

    if (secrets.length === 0) {
      logger.info('No secrets found in environment variables');
      return {
        filesProcessed: 0,
        secretsMasked: 0,
        errors: [],
      };
    }

    logger.info(`Found ${secrets.length} secret(s) in environment variables`);

    // Find all target files in workflow directory
    const files = await this.findTargetFiles(workflowDir);

    if (files.length === 0) {
      logger.info('No files found to scan for secrets');
      return {
        filesProcessed: 0,
        secretsMasked: 0,
        errors: [],
      };
    }

    logger.info(`Scanning ${files.length} file(s) for secrets`);

    let filesProcessed = 0;
    let totalSecretsMasked = 0;
    const errors: string[] = [];

    // Process each file
    for (const filePath of files) {
      try {
        const result = await this.maskSecretsInFile(filePath, secrets);
        if (result.masked) {
          filesProcessed++;
          totalSecretsMasked += result.count;
          logger.info(
            `Masked ${result.count} secret(s) in ${path.basename(filePath)}`,
          );
        }
      } catch (error) {
        const errorMsg = `Failed to process ${filePath}: ${getErrorMessage(error)}`;
        logger.error(`${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return {
      filesProcessed,
      secretsMasked: totalSecretsMasked,
      errors,
    };
  }

  /**
   * Find all target files in workflow directory
   */
  private async findTargetFiles(workflowDir: string): Promise<string[]> {
    const files: string[] = [];

    for (const pattern of this.targetFilePatterns) {
      const globPattern = path.join(workflowDir, '**', pattern);
      try {
        const matches = await glob(globPattern, {
          nodir: true,
          absolute: true,
          windowsPathsNoEscape: true,
        });
        files.push(...matches);
      } catch (error) {
        logger.warn(
          `Failed to glob pattern ${globPattern}: ${getErrorMessage(error)}`,
        );
      }
    }

    return files;
  }

  /**
   * Mask secrets in a single file
   */
  private async maskSecretsInFile(
    filePath: string,
    secrets: Secret[],
  ): Promise<{ masked: boolean; count: number }> {
    let content = await fs.readFile(filePath, 'utf-8');
    let maskedCount = 0
... (truncated)
```

## Turn 20: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '70,120p' design.md"`
**ステータス**: completed (exit_code=0)

```text
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
- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
- `src/core/config.ts`: LLM 設定用ゲッターを実装。
- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`) を LLM 統合ケースで更新。

### 5.2 依存関係の変更
- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
- Jest モックは既存 `jest-mock-extended` や手動モックを活用。

### 5.3 マイグレーション要否
- データマイグレーションは不要。
- `.env.example` が存在する場合は Follow-up LLM 用環境変数を追加。
- `ARCHITECTURE.md`, `CLAUDE.md`, `README.md` を更新して設定手順とフォールバック説明を追記。

---

## 6. 変更・追加ファイルリスト

- **新規作成**
  - `src/core/github/issue-ai-generator.ts`
  - `tests/unit/github/issue-ai-generator.test.ts`
  - `tests/integration/followup-issue-llm.test.ts` (Octokit モック中心)
- **既存修正**
  - `src/core/github/issue-client.ts`
  - `src/core/github-client.ts`
  - `src/phases/evaluation.ts`
  - `src/commands/execute.ts`
  - `src/commands/execute/options-parser.ts`
  - `src/types.ts`
```

## Turn 21: ツール実行

**種別**: file_change
**ステータス**: completed

## Turn 22: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "grep -n \"7\\.8\" design.md"`
**ステータス**: completed (exit_code=0)

```text
320:### 7.8 SecretMasker 拡張
```

## Turn 23: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "grep -n \"7\\.12\" design.md"`
**ステータス**: completed (exit_code=0)

```text
369:### 7.12 ドキュメント更新
```

## Turn 24: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '300,360p' design.md"`
**ステータス**: completed (exit_code=0)

```text
);
  ```
- `PhaseFactory` / `BasePhase` で `PhaseContext.issueGenerationOptions` を新たに受け渡す。

### 7.7 CLI / Config 拡張

- `ExecuteCommandOptions` に以下フィールドを追加:
  - `followupLlmMode?: 'auto' | 'openai' | 'claude' | 'off'`
  - `followupLlmModel?: string`
  - `followupLlmTimeout?: number`
  - `followupLlmMaxRetries?: number`
  - `followupLlmAppendMetadata?: boolean`
- `options-parser.ts` でバリデーション:
  - `off` → `enabled` false。
  - timeout/retries は正の整数 (0 許容)。
  - provider 指定が `openai` なのに OpenAI APIキー不在の場合は警告ログを出して `enabled=false`。
- `config.ts` で環境変数ゲッターを追加 (`FOLLOWUP_LLM_MODE`, `FOLLOWUP_LLM_MODEL`, `FOLLOWUP_LLM_TIMEOUT_MS`, `FOLLOWUP_LLM_MAX_RETRIES`, `FOLLOWUP_LLM_APPEND_METADATA`)。
- CLI 例:  
  `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode auto --followup-llm-model claude-3-sonnet-20240229`.

### 7.8 SecretMasker 拡張

- 新規メソッド `maskObject<T>(input: T, options?: { ignoredPaths?: string[] }): T` を追加し、入力オブジェクトを破壊せずに深いコピーを返す。`ignoredPaths` は `['tasks.*.metadata']` のようなドット表記で除外を指定できる。
- 処理フロー:
  1. `getSecretList()` で環境変数ベースのシークレットを取得し、`[REDACTED_${name}]` への置換テーブルを構築。
  2. 追加で以下のパターンを検出する正規表現を用意し、ヒットした文字列は `[REDACTED_PATTERN]` に置換する。  
     - 長さ 20 文字以上の英数字+`-_` 混在トークン (`/[A-Za-z0-9_-]{20,}/g`)  
     - メールアドレス (`/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g`)  
     - `Bearer <token>` / `token=` 形式 (`/(Bearer|token=)[\w\-.]+/gi`)
  3. 走査は DFS で実装し、`WeakSet` で循環参照を検出して二度処理しない。配列は同じく再帰し、プリミティブ以外は `Object.prototype.toString` で plain object のみを対象にする。
  4. 文字列に対しては上記パターンとシークレット値を順次 `replaceAll` し、オブジェクト／配列はフィールド単位で再帰結果を集約する。
- 戻り値は元の構造を維持した `sanitized` コピー。元のオブジェクトは変更せず、`undefined` や関数はそのまま返す。
- `IssueAIGenerator.sanitizePayload` はこの `maskObject` の戻り値に対して文字数トリムやタスク数制限を適用し、マスキングと整形の責務を分離する。
- 追加するユニットテストでは、ネストしたオブジェクトと配列、循環参照、`ignoredPaths` 指定時の除外、メールアドレス置換が期待通り動くことを確認する。

### 7.9 ロギング・モニタリング

- LLM 成功時は DEBUG ログ、再試行数 > 0 の場合は WARN と INFO の両方に出力して追跡可能にする。
- フォールバック発生時は WARN ログを構造化文字列 (JSON 互換) で出力。`event=FOLLOWUP_LLM_FALLBACK`, `fallback_mode=legacy_template`, `reason=...`。
- `IssueAIGenerator.generate` 内で `performance.now()` を使い処理時間を計測。
- ログには機密情報やプロンプト全文を含めない。

### 7.10 テスト設計詳細

| レイヤ | テストケース | 目的 |
| --- | --- | --- |
| Unit (`issue-ai-generator.test.ts`) | タスク数制限・文字列トリム・ターゲットファイル上限を検証 | サニタイズ仕様の担保 |
|  | JSON 以外の応答で `IssueAIValidationError` を投げる | バリデーション |
|  | 必須セクション欠落、タイトル長不正、HTMLタグ混入で失敗する | FR-1/FR-2 |
|  | 1回目失敗→2回目成功のリトライ時に最終成功 | リトライ制御 |
|  | `SecretMasker` により API キーがプロンプトに残らない | セキュリティ |
| Unit (`secret-masker.test.ts`) | `maskObject` がネスト構造・配列・循環参照を安全にマスキングする | サニタイズ機構の信頼性 |
|  | `ignoredPaths` 指定時に該当フィールドをスキップしつつ他をマスクする | 柔軟な除外設定 |
| Unit (`issue-client.test.ts`) | LLM 成功時に Octokit へ LLM 出力が渡る | フロー検証 |
|  | 例外発生時に WARN ログとフォールバックタイトル/本文が使用される | FR-3 |
| Integration (`followup-issue-llm.test.ts`) | CLI -> PhaseContext -> GitHubClient -> IssueClient のオプション伝搬 | 設定連携 |
|  | LLM が無効化されている場合に既存挙動が維持される | 後方互換 |
|  | `FOLLOWUP_LLM_E2E=1` 時のみ実APIを使い、成功時タイトル/本文が要件を満たすか検証 (失敗時はテストをスキップ) | 実API検証 |

### 7.11 要件トレーサビリティ
```

## Turn 25: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '80,120p' design.md"`
**ステータス**: completed (exit_code=0)

```text
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
- `src/core/config.ts`: LLM 設定用ゲッターを実装。
- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`, `tests/unit/secret-masker.test.ts`) を LLM 統合ケースとシークレットマスキング強化に合わせて更新。

### 5.2 依存関係の変更
- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
- Jest モックは既存 `jest-mock-extended` や手動モックを活用。

### 5.3 マイグレーション要否
- データマイグレーションは不要。
- `.env.example` が存在する場合は Follow-up LLM 用環境変数を追加。
- `ARCHITECTURE.md`, `CLAUDE.md`, `README.md` を更新して設定手順とフォールバック説明を追記。

---

## 6. 変更・追加ファイルリスト

- **新規作成**
  - `src/core/github/issue-ai-generator.ts`
  - `tests/unit/github/issue-ai-generator.test.ts`
  - `tests/integration/followup-issue-llm.test.ts` (Octokit モック中心)
- **既存修正**
  - `src/core/github/issue-client.ts`
  - `src/core/github-client.ts`
  - `src/core/phase-factory.ts`
```

## Turn 26: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "sed -n '120,160p' design.md"`
**ステータス**: completed (exit_code=0)

```text
- `src/core/phase-factory.ts`
  - `src/phases/base-phase.ts`
  - `src/phases/evaluation.ts`
  - `src/core/secret-masker.ts`
  - `src/commands/execute.ts`
  - `src/commands/execute/options-parser.ts`
  - `src/types.ts`
  - `src/types/commands.ts`
  - `src/core/config.ts`
  - `tests/unit/github/issue-client.test.ts`
  - `tests/unit/github/issue-client-followup.test.ts`
  - `tests/unit/secret-masker.test.ts`
  - `tests/integration/github-client-facade.test.ts`
  - ドキュメント (`ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `.env.example`)
- **削除予定**: なし

---

## 7. 詳細設計

### 7.1 IssueGenerationOptions / IssueAIGenerationResult

```ts
export interface IssueGenerationOptions {
  enabled: boolean;
  provider: 'auto' | 'openai' | 'claude';
  model?: string;
  temperature?: number;          // default 0.2
  maxOutputTokens?: number;      // default 1500
  timeoutMs?: number;            // default 25000
  maxRetries?: number;           // default 3
  maxTasks?: number;             // default 5
  appendMetadata?: boolean;      // default false
}

export interface IssueAIGenerationResult {
  title: string;
  body: string;
  metadata: {
    provider: 'openai' | 'claude';
    model: string;
```

## Turn 27: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba design.md | sed -n '90,200p'"`
**ステータス**: completed (exit_code=0)

```text
90	- `src/core/phase-factory.ts`: `PhaseContext` へ追加した `issueGenerationOptions` を全 Phase に渡す初期化処理を拡張。
    91	- `src/phases/base-phase.ts`: Phase インスタンスが `issueGenerationOptions` を受け取り `this.context` へ保持できるようにする。
    92	- `src/phases/evaluation.ts`: `GitHubClient.createIssueFromEvaluation` 呼び出しに LLM オプションを渡す。
    93	- `src/core/secret-masker.ts`: `maskObject` を追加してネストした残タスクオブジェクトを一括マスキングできるようにする。
    94	- `src/commands/execute.ts` / `src/commands/execute/options-parser.ts`: CLI オプション解析に Follow-up LLM 設定を追加し `PhaseContext` へ渡す。
    95	- `src/types.ts`: `IssueGenerationOptions` や LLM 結果の型を追加。
    96	- `src/types/commands.ts`: `PhaseContext` に `issueGenerationOptions` プロパティを追加。
    97	- `src/core/config.ts`: LLM 設定用ゲッターを実装。
    98	- 既存テスト (`tests/unit/github/issue-client*.ts`, `tests/integration/github-client-facade.test.ts`, `tests/unit/secret-masker.test.ts`) を LLM 統合ケースとシークレットマスキング強化に合わせて更新。
    99	
   100	### 5.2 依存関係の変更
   101	- 追加パッケージは想定なし。既存 `openai`, `@anthropic-ai/claude-agent-sdk` を再利用。
   102	- Jest モックは既存 `jest-mock-extended` や手動モックを活用。
   103	
   104	### 5.3 マイグレーション要否
   105	- データマイグレーションは不要。
   106	- `.env.example` が存在する場合は Follow-up LLM 用環境変数を追加。
   107	- `ARCHITECTURE.md`, `CLAUDE.md`, `README.md` を更新して設定手順とフォールバック説明を追記。
   108	
   109	---
   110	
   111	## 6. 変更・追加ファイルリスト
   112	
   113	- **新規作成**
   114	  - `src/core/github/issue-ai-generator.ts`
   115	  - `tests/unit/github/issue-ai-generator.test.ts`
   116	  - `tests/integration/followup-issue-llm.test.ts` (Octokit モック中心)
   117	- **既存修正**
   118	  - `src/core/github/issue-client.ts`
   119	  - `src/core/github-client.ts`
   120	  - `src/core/phase-factory.ts`
   121	  - `src/phases/base-phase.ts`
   122	  - `src/phases/evaluation.ts`
   123	  - `src/core/secret-masker.ts`
   124	  - `src/commands/execute.ts`
   125	  - `src/commands/execute/options-parser.ts`
   126	  - `src/types.ts`
   127	  - `src/types/commands.ts`
   128	  - `src/core/config.ts`
   129	  - `tests/unit/github/issue-client.test.ts`
   130	  - `tests/unit/github/issue-client-followup.test.ts`
   131	  - `tests/unit/secret-masker.test.ts`
   132	  - `tests/integration/github-client-facade.test.ts`
   133	  - ドキュメント (`ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `.env.example`)
   134	- **削除予定**: なし
   135	
   136	---
   137	
   138	## 7. 詳細設計
   139	
   140	### 7.1 IssueGenerationOptions / IssueAIGenerationResult
   141	
   142	```ts
   143	export interface IssueGenerationOptions {
   144	  enabled: boolean;
   145	  provider: 'auto' | 'openai' | 'claude';
   146	  model?: string;
   147	  temperature?: number;          // default 0.2
   148	  maxOutputTokens?: number;      // default 1500
   149	  timeoutMs?: number;            // default 25000
   150	  maxRetries?: number;           // default 3
   151	  maxTasks?: number;             // default 5
   152	  appendMetadata?: boolean;      // default false
   153	}
   154	
   155	export interface IssueAIGenerationResult {
   156	  title: string;
   157	  body: string;
   158	  metadata: {
   159	    provider: 'openai' | 'claude';
   160	    model: string;
   161	    durationMs: number;
   162	    retryCount: number;
   163	    inputTokens?: number;
   164	    outputTokens?: number;
   165	    omittedTasks?: number;
   166	  };
   167	}
   168	```
   169	
   170	- `config` でデフォルトを構築し、CLI/環境変数で上書き可能にする。
   171	- `PhaseContext` に `issueGenerationOptions` を追加し、省略時は `{ enabled: false, provider: 'auto' }` を適用。
   172	
   173	### 7.2 IssueAIGenerator クラス (新規)
   174	
   175	- コンストラクタ: `(providers: Record<'openai' | 'claude', LlmProviderAdapter>, secretMasker = new SecretMasker())`。
   176	- 補助的なエラー型:
   177	  - `IssueAIUnavailableError` (credentials 不足など)
   178	  - `IssueAIValidationError` (出力検証失敗)
   179	- 公開メソッド:
   180	  - `isAvailable(options: IssueGenerationOptions): boolean`  
   181	    - `options.enabled` が true かつ選択された provider（`auto` の場合は利用可能なもの）が `hasCredentials()` を満たす。
   182	  - `generate(tasks, context, issueNumber, options): Promi
... (truncated)
```

## Turn 28: ツール実行

**種別**: コマンド実行
**コマンド**: `bash -lc "nl -ba design.md | sed -n '300,360p'"`
**ステータス**: completed (exit_code=0)

```text
300	  );
   301	  ```
   302	- `PhaseFactory` / `BasePhase` で `PhaseContext.issueGenerationOptions` を新たに受け渡す。
   303	
   304	### 7.7 CLI / Config 拡張
   305	
   306	- `ExecuteCommandOptions` に以下フィールドを追加:
   307	  - `followupLlmMode?: 'auto' | 'openai' | 'claude' | 'off'`
   308	  - `followupLlmModel?: string`
   309	  - `followupLlmTimeout?: number`
   310	  - `followupLlmMaxRetries?: number`
   311	  - `followupLlmAppendMetadata?: boolean`
   312	- `options-parser.ts` でバリデーション:
   313	  - `off` → `enabled` false。
   314	  - timeout/retries は正の整数 (0 許容)。
   315	  - provider 指定が `openai` なのに OpenAI APIキー不在の場合は警告ログを出して `enabled=false`。
   316	- `config.ts` で環境変数ゲッターを追加 (`FOLLOWUP_LLM_MODE`, `FOLLOWUP_LLM_MODEL`, `FOLLOWUP_LLM_TIMEOUT_MS`, `FOLLOWUP_LLM_MAX_RETRIES`, `FOLLOWUP_LLM_APPEND_METADATA`)。
   317	- CLI 例:  
   318	  `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode auto --followup-llm-model claude-3-sonnet-20240229`.
   319	
   320	### 7.8 SecretMasker 拡張
   321	
   322	- 新規メソッド `maskObject<T>(input: T, options?: { ignoredPaths?: string[] }): T` を追加し、入力オブジェクトを破壊せずに深いコピーを返す。`ignoredPaths` は `['tasks.*.metadata']` のようなドット表記で除外を指定できる。
   323	- 処理フロー:
   324	  1. `getSecretList()` で環境変数ベースのシークレットを取得し、`[REDACTED_${name}]` への置換テーブルを構築。
   325	  2. 追加で以下のパターンを検出する正規表現を用意し、ヒットした文字列は `[REDACTED_PATTERN]` に置換する。  
   326	     - 長さ 20 文字以上の英数字+`-_` 混在トークン (`/[A-Za-z0-9_-]{20,}/g`)  
   327	     - メールアドレス (`/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g`)  
   328	     - `Bearer <token>` / `token=` 形式 (`/(Bearer|token=)[\w\-.]+/gi`)
   329	  3. 走査は DFS で実装し、`WeakSet` で循環参照を検出して二度処理しない。配列は同じく再帰し、プリミティブ以外は `Object.prototype.toString` で plain object のみを対象にする。
   330	  4. 文字列に対しては上記パターンとシークレット値を順次 `replaceAll` し、オブジェクト／配列はフィールド単位で再帰結果を集約する。
   331	- 戻り値は元の構造を維持した `sanitized` コピー。元のオブジェクトは変更せず、`undefined` や関数はそのまま返す。
   332	- `IssueAIGenerator.sanitizePayload` はこの `maskObject` の戻り値に対して文字数トリムやタスク数制限を適用し、マスキングと整形の責務を分離する。
   333	- 追加するユニットテストでは、ネストしたオブジェクトと配列、循環参照、`ignoredPaths` 指定時の除外、メールアドレス置換が期待通り動くことを確認する。
   334	
   335	### 7.9 ロギング・モニタリング
   336	
   337	- LLM 成功時は DEBUG ログ、再試行数 > 0 の場合は WARN と INFO の両方に出力して追跡可能にする。
   338	- フォールバック発生時は WARN ログを構造化文字列 (JSON 互換) で出力。`event=FOLLOWUP_LLM_FALLBACK`, `fallback_mode=legacy_template`, `reason=...`。
   339	- `IssueAIGenerator.generate` 内で `performance.now()` を使い処理時間を計測。
   340	- ログには機密情報やプロンプト全文を含めない。
   341	
   342	### 7.10 テスト設計詳細
   343	
   344	| レイヤ | テストケース | 目的 |
   345	| --- | --- | --- |
   346	| Unit (`issue-ai-generator.test.ts`) | タスク数制限・文字列トリム・ターゲットファイル上限を検証 | サニタイズ仕様の担保 |
   347	|  | JSON 以外の応答で `IssueAIValidationError` を投げる | バリデーション |
   348	|  | 必須セクション欠落、タイトル長不正、HTMLタグ混入で失敗する | FR-1/FR-2 |
   349	|  | 1回目失敗→2回目成功のリトライ時に最終成功 | リトライ制御 |
   350	|  | `SecretMasker` により API キーがプロンプトに残らない | セキュリティ |
   351	| Unit (`secret-masker.test.ts`) | `maskObject` がネスト構造・配列・循環参照を安全にマスキングする | サニタイズ機構の信頼性 |
   352	|  | `ignoredPaths` 指定時に該当フィールドをスキップしつつ他をマスクする | 柔軟な除外設定 |
   353	| Unit (`issue-client.test.ts`) | LLM 成功時に Octokit へ LLM 出力が渡る | フロー検証 |
   354	|  | 例外発生時に WARN ログとフォールバックタイトル/本文が使用される | FR-3 |
   355	| Integration (`followup-issue-llm.test.ts`) | CLI -> PhaseContext -> GitHubClient -> IssueClient のオプション伝搬 | 設定連携 |
   356	|  | LLM が無効化されている場合に既存挙動が維持される | 後方互換 |
   357	|  | `FOLLOWUP_LLM_E2E=1` 時のみ実APIを使い、成功時タイトル/本文が要件を満たすか検証 (失敗時はテストをスキップ) | 実API検証 |
   358	
   359	### 7.11 要件トレーサビリティ
   360
```

## Turn 29: ツール実行

**種別**: agent_message
**ステータス**: completed

## Turn 30: ツール実行

**種別**: todo_list
**ステータス**: completed

## Turn 31: 実行完了

**ステータス**: completed
**所要時間**: 246102ms
**ターン数**: N/A

---

**経過時間**: 246102ms
**開始**: 2025-11-03T03:03:05.935Z
**終了**: 2025-11-03T03:07:12.037Z