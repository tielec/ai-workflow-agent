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

| 要件ID | 対応箇所 |
| --- | --- |
| FR-1 | 7.4 プロンプト設計・タイトル検証、7.5 タイトル採用ロジック |
| FR-2 | 7.4 セクション検証、7.5 `buildLegacyBody` との比較で差異を吸収 |
| FR-3 | 7.5 `tryGenerateWithLLM` フォールバック制御 |
| FR-4 | 7.6 Phase 連携、7.7 CLI/Config 拡張 |
| FR-5 | 7.5 ログ出力設計、7.9 モニタリング |

### 7.12 ドキュメント更新

- `ARCHITECTURE.md`: Evaluation → GitHubClient → IssueAIGenerator → IssueClient のフロー図と説明を追加。
- `CLAUDE.md`: Follow-up LLM 設定方法、環境変数、フォールバック観察ポイントを追記。
- `README.md`: CLI オプションと `.env` 設定例、フォールバック時のトラブルシューティングを追加。

---

## 8. セキュリティ考慮事項

- `SecretMasker` と追加の簡易正規表現 (API キーフォーマット、メールアドレス) を `sanitizePayload` に適用し、機密情報送信を防止。
- LLM 応答に HTML/スクリプトタグが含まれる場合はバリデーションエラーとし、フォールバックへ切り替える。
- API キーは `config` ゲッター経由でのみ参照し、ログへ出力しない。
- プロンプト・レスポンスをファイルへ書き出さない。ログにはメタデータのみを残す。
- 再試行回数を `maxRetries` で制限し、無限ループやコスト過多を防止。

---

## 9. 非機能要件への対応

- **パフォーマンス**: `timeoutMs` と `maxRetries` で最悪ケースでも 25s × 3 = 75s 以内にフォールバック。タスク数・文字数の制限で入力サイズを抑制し、LLM 呼び出し平均 15s 以内を目指す。
- **スケーラビリティ**: Provider 抽象化でモデル追加が容易。`maxTasks` で大規模残タスクでも安定して処理。
- **保守性**: LLM ロジックを `IssueAIGenerator` に集約し、IssueClient と疎結合化。テストで回帰を検知しやすくする。
- **可用性**: LLM 失敗時でも既存テンプレートで確実に Issue を生成 (FR-3)。WARN ログで運用監視が容易。
- **コスト管理**: デフォルト無効 (`enabled=false`) で不要な API 呼び出しを防止。`appendMetadata` で生成コストを Issue 上に可視化可能。

---

## 10. 実装の順序

1. **型と設定の整備**: `IssueGenerationOptions`、`PhaseContext`、CLI/Config 拡張。既存コードをコンパイル可能に更新。
2. **IssueAIGenerator 実装**: プロンプトテンプレート、サニタイズ、Provider アダプタ、検証、専用エラーを実装。
3. **IssueClient / GitHubClient 更新**: 依存注入、LLM 分岐、フォールバックとログ処理を追加。
4. **Phase / CLI 連携**: EvaluationPhase がオプションを渡すよう調整し、実行時の設定反映を確認。
5. **テスト追加・更新**: 新規ユニットテスト、既存テスト更新、統合テストでオプション伝搬とフォールバックを検証。
6. **ドキュメント更新**: ARCHITECTURE / CLAUDE / README / `.env.example` を更新。
7. **検証**: `npm run test:unit`, `npm run test:integration` 実行。必要に応じ `FOLLOWUP_LLM_E2E=1` で手動統合テストを確認。

---

## 11. 品質ゲート確認

- 実装戦略 (EXTEND) の判断根拠を明記。
- テスト戦略 (UNIT_INTEGRATION) の判断根拠を明記。
- 既存コードへの影響と依存関係を分析。
- 変更・追加ファイルを列挙。
- 詳細設計と要件トレーサビリティを提示し実装可能性を保証。
