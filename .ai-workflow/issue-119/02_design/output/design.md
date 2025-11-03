# 詳細設計書 - Issue #119 フォローアップIssue生成品質の改善（LLM活用）

**Issue番号**: #119  
**タイトル**: フォローアップIssue生成品質の改善（LLM活用）  
**バージョン**: 1.0 (Draft)

---

## 1. アーキテクチャ設計

### 1.1 システム全体図

```
Evaluation Phase (PhaseRunner)
        │ RemainingTask[], IssueContext, Report Path
        ▼
GitHubClient.createIssueFromEvaluation(issueNumber, tasks, report, context, options)
        │
        ▼
IssueClient (LLM-aware)
   ├─ tryGenerateWithLLM(...)
   │     │ sanitized prompt payload
   │     ▼
   │  IssueAIGenerator
   │     ├─ buildPrompt()
   │     ├─ invokeProvider(OpenAI | Anthropic)
   │     └─ validateAndNormalize()
   │            │
   │            └─ JSON(title, body)
   └─ fallbackToLegacyBuilders()  ← LLM disabled/エラー時
        │
        ▼
Octokit.issues.create(...)  → GitHub Issue
```

### 1.2 コンポーネント責務と関係

| コンポーネント | 役割 | 入出力・備考 |
| --- | --- | --- |
| `EvaluationPhase` | Phase 9 実装。残タスク発見時に Issue 作成を依頼 | `GitHubClient.createIssueFromEvaluation` 呼び出し |
| `GitHubClient` | GitHub 操作ファサード | `IssueClient` へ委譲しつつ LLM オプションを引き渡す |
| `IssueClient` | フォローアップ Issue 生成の中心 | 既存組版ロジックを保持しつつ、LLM 優先フローとフォールバック制御を担当 |
| `IssueAIGenerator` (**新規**) | プロンプト生成・LLM呼び出し・レスポンス検証を集約 | OpenAI / Claude どちらにも対応するアダプタを組み込み |
| `OpenAILLMAdapter` / `ClaudeLLMAdapter` (**新規サブモジュール**) | 各プロバイダの API 呼び出しを抽象化 | 公式 SDK (`openai`, `@anthropic-ai/sdk`) を利用 |
| `SecretMasker` （既存） | プロンプトへの機密情報流出防止 | IssueAIGenerator 内で再利用 |
| `Octokit` | GitHub REST API クライアント | 最終的な Issue 作成を実行 |

### 1.3 データフロー

1. Evaluation Phase が `RemainingTask[]`, `IssueContext`, `evaluationReportPath` を構築し、`IssueGenerationOptions` を併せて `GitHubClient` に渡す。
2. `GitHubClient` はパラメータを `IssueClient.createIssueFromEvaluation` に委譲。
3. `IssueClient` は LLM が有効 (`options.enabled === true`) かつ `IssueAIGenerator` が利用可能な場合、`tryGenerateWithLLM()` を呼び出す。
4. `IssueAIGenerator` は以下を順に処理:
   - `sanitizeContext()` でタスクを最大5件に絞り、各フィールドを 512 文字にトリムしつつ、`SecretMasker` で機密値を除去。
   - `buildPrompt()` で要件定義書記載のテンプレートを埋め込み、モデルへ渡す JSON 指示を生成。
   - `invokeProvider()` で OpenAI もしくは Claude API を呼び出し、指数バックオフ付きリトライを適用。
   - `validateResponse()` で JSON 形式・必須セクション・タイトル長(50-80文字)を検証。
5. LLM 生成に成功した場合、`IssueClient` は生成タイトル/本文を採用し、Octokit へ送信。失敗や無効時は既存 `generateFollowUpTitle` / `formatTaskDetails` と同等のフォールバックを使用。
6. 成否情報は LOGGER に WARN/INFO で記録され、呼び出し元へ `IssueCreationResult` として返却される。

### 1.4 プロンプト・レスポンス設計

- プロンプトは Markdown ではなく JSON 指示テキストを生成し、LLM に `{ "title": "...", "body": "..." }` 形式で応答させる。
- 本文は `## 背景`, `## 目的`, `## 実行内容`, `## 受け入れ基準`, `## 関連リソース` の順序を必須とし、`validateResponse()` でセクション存在を確認。
- タイトルは 50〜80 文字制約。検証時に不足/超過があればフォールバック。
- レスポンスは Markdown のみ許容。HTML タグやコードフェンス内の命令文は検出して除外。

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:
- 既存 `IssueClient` に LLM 優先の分岐を追加し、既存タイトル/本文組版ロジックを変更せずにフォールバックとして残すため。
- `GitHubClient`, `EvaluationPhase`, CLI オプションなど既存フローとの統合が必要で、新規モジュール追加に加えて既存コードの拡張が中心となるため。
- 既存テストスイート (`issue-client` ユニット/インテグレーション) を拡張し互換性を担保する計画であり、大規模なリファクタではないため。

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:
- LLM プロンプト生成・レスポンス検証・リトライ制御など純粋ロジックはモックで十分かつユニットテストで網羅可能。
- `IssueClient` との統合作用（LLM成功/失敗・フォールバック・Octokit呼び出し）は依存注入を用いたインテグレーションテストで回帰防止が必要。
- 実 API 呼び出しはオプトイン統合テスト（環境変数によるスキップ制御）で品質確認する計画のため、ユニットとインテグレーション双方が不可欠。

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:
- 既存 `tests/unit/github/issue-client(-followup).test.ts` に LLM フォールバックの追加ケースを組み込む必要がある（既存拡張）。
- `IssueAIGenerator` 専用のユニットテストファイルを新規作成し、プロンプト/バリデーション/リトライ挙動を検証する必要がある（新規作成）。

---

## 5. 影響範囲分析

- **コード**: `src/core/github/issue-client.ts`, `src/core/github-client.ts`, `src/phases/evaluation.ts`, `src/commands/execute.ts`, `src/commands/execute/options-parser.ts`, `src/types.ts`, `src/types/commands.ts` が主対象。  
- **新規モジュール**: `src/core/github/issue-ai-generator.ts`（およびサブアダプタ/ユーティリティ）、`src/prompts/follow_up_issue/*.md`。  
- **依存関係**: Anthropic 公式 SDK (`@anthropic-ai/sdk`) を追加予定。既存 `openai` は再利用。  
- **設定**: `.env` / 環境変数に LLM 有効化フラグ・モデル指定・タイムアウト設定を追加。`config.ts` にゲッターを実装。  
- **ドキュメント**: `ARCHITECTURE.md`, `CLAUDE.md`, `README.md` の LLM セクションを更新。  
- **テスト**: ユニット・インテグレーションテストの拡張、新規 `tests/integration/followup-issue-llm.test.ts` を追加。  
- **マイグレーション要否**: 既存 Issue には影響なし。新しい環境変数はデフォルトで無効 (`enabled = false`) とし、設定が無い場合は従来どおり動作。

---

## 6. 変更・追加ファイルリスト

- **新規作成**
  - `src/core/github/issue-ai-generator.ts`
  - `src/core/github/llm/base-llm-adapter.ts`
  - `src/core/github/llm/openai-adapter.ts`
  - `src/core/github/llm/anthropic-adapter.ts`
  - `src/prompts/follow_up_issue/title_prompt.md`
  - `src/prompts/follow_up_issue/body_prompt.md`
  - `tests/unit/github/issue-ai-generator.test.ts`
  - `tests/integration/followup-issue-llm.test.ts`
- **既存修正**
  - `src/core/github/issue-client.ts`
  - `src/core/github-client.ts`
  - `src/phases/evaluation.ts`
  - `src/commands/execute.ts`
  - `src/commands/execute/options-parser.ts`
  - `src/types.ts`
  - `src/types/commands.ts`
  - `src/core/config.ts`
  - 既存テスト: `tests/unit/github/issue-client.test.ts`, `tests/unit/github/issue-client-followup.test.ts`
- **ドキュメント**
  - `ARCHITECTURE.md`
  - `CLAUDE.md`
  - `README.md`（環境変数と使い方）
- **削除**: なし

---

## 7. 詳細設計

### 7.1 IssueAIGenerator モジュール（新規）

- **クラス構成**
  ```mermaid
  classDiagram
    class IssueAIGenerator {
      -options: IssueGenerationOptions
      -provider: LLMProviderAdapter
      -secretMasker: SecretMasker
      -clock: Clock
      +generateTitle(task: RemainingTask, ctx: IssueContext, meta: GenerationMeta): Promise<string>
      +generateDescription(task: RemainingTask, ctx: IssueContext, meta: GenerationMeta): Promise<string>
      +generateIssue(task: RemainingTask, ctx: IssueContext, meta: GenerationMeta): Promise<IssueAiResult>
    }
    class LLMProviderAdapter {
      <<interface>>
      +complete(prompt: string, opts: ProviderCallOptions): Promise<string>
    }
    IssueAIGenerator --> LLMProviderAdapter
  ```
- **主要責務**
  - `sanitizeContext(tasks, context)`：  
    - 最大5件の `RemainingTask` を対象。`task`, `steps`, `acceptanceCriteria`, `priorityReason`, `dependencies` は 512 文字にトリム。  
    - `targetFiles` は 10 件に制限。  
    - `SecretMasker` により既知のシークレット値を `[REDACTED_*]` に置換。  
  - `buildPrompt(payload)`：要件定義書のテンプレートを読み込み、`JSON.stringify` で安全に埋め込む。タイトルと本文を同時生成する複合リクエスト（FR-1, FR-2 対応）。
  - `invokeProvider(prompt)`：`options.maxRetries`（デフォルト3回）、指数バックオフ（1s, 2s, 4s）で再試行。`AbortController` による `timeoutMs` 制御。
  - `validateResponse(raw)`：  
    1. JSON 解析。  
    2. `title` 文字数チェック (50〜80)。  
    3. `body` に必須セクションが全て含まれるか正規表現で検証。  
    4. Markdown 以外のタグ検出 (`/<\w+>/`) で拒否。  
    5. 失敗時は `IssueAiValidationError` を throw。
  - 成功時は `{ title, body, metadata }` を返却。`metadata` には使用モデル・推定トークン数・処理時間等を格納し DEBUG ログで出力。

### 7.2 LLM Provider アダプタ

- **OpenAIAdapter**
  - 既存 `openai` パッケージを利用し `chat.completions.create()` を呼び出す。
  - デフォルトモデル: `options.model ?? 'gpt-4o-mini'`。
  - `response_format: { type: 'json_object' }` を指定し JSON を強制。
- **AnthropicAdapter**
  - 公式 SDK `@anthropic-ai/sdk` を追加。`messages.create()` を使用し JSON 出力を指示。
  - `model` は `options.model ?? 'claude-3-5-sonnet-latest'`。
  - プロンプトは `messages: [{ role: 'user', content: prompt }]` 形式。
- **Adapter 選択ロジック**
  - `IssueGenerationOptions.provider` が `claude`／`openai`／`auto` を選択。  
  - `auto` 時は OpenAI API キーが存在すれば優先、なければ Claude にフォールバック。  
  - API キー未設定・どちらも使用不可の場合は `IssueAIGenerator.isAvailable()` が `false` を返却し、IssueClient が即座にフォールバックする。

### 7.3 プロンプトテンプレート

- `src/prompts/follow_up_issue/title_prompt.md` / `body_prompt.md` を追加し、テンプレート文字列中に `{{original_issue_title}}` 等のプレースホルダを定義。
- IssueAIGenerator は `fs.readFileSync` (同期) で初期化時にロードし、ホットリロード不要。
- プロンプトには以下を明示:
  1. タイトル 50〜80文字。
  2. 本文の必須セクション。
  3. 各セクションの内容ガイドライン（目的は1文、実行内容は番号付きリストなど）。
  4. JSON 形式で回答すること。
- テンプレートは Markdown コメント (`<!-- -->`) でヒューマン向け説明を記載しつつ、モデルへの指示はプレーンテキストで記述。

### 7.4 IssueClient 拡張

- 依存注入: `constructor(octokit, owner, repo, aiGenerator?: IssueAIGenerator)` に変更。`GitHubClient` から `IssueAIGenerator` を渡す。
- `createIssueFromEvaluation` 署名を以下に拡張:
  ```ts
  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string,
    issueContext?: IssueContext,
    generationOptions?: IssueGenerationOptions,
  ): Promise<IssueCreationResult>
  ```
- 本文生成ロジック:
  ```ts
  let aiResult: IssueAiResult | null = null;
  if (generationOptions?.enabled && this.aiGenerator?.isAvailable()) {
    aiResult = await this.tryGenerateWithLLM(...).catch((error) => {
      logger.warn(`LLM generation failed: ${encodeWarning(getErrorMessage(error))}`);
      return null;
    });
  }
  const title = aiResult?.title ?? this.generateFollowUpTitle(...);
  const body = aiResult?.body ?? this.buildLegacyBody(...);
  ```
- `tryGenerateWithLLM` 内で:
  - すべての `RemainingTask` を `IssueAIGenerator.generateIssue` に渡し、レスポンスを適用。
  - 生成内容に必須セクションが欠落している場合は LLM 失敗扱いとし、WARN ログに詳細（セクション欠如、タイトル長超過など）を出力。
  - 成功時は `## LLM生成メタデータ` を本文末尾（`## 参考` 手前）に追加し、モデル名・生成時刻を記録（要件 FR-5 のログ補助。ユーザーが不要な場合は `options.appendMetadata` で制御）。

### 7.5 GitHubClient / CLI / Phase 連携

- `GitHubClient` コンストラクタで `IssueAIGenerator` を初期化。`config.ts` から取得した LLM 設定を渡す。
- `createIssueFromEvaluation` 引数に `generationOptions` を追加。Phase 側で動的に変更したい場合に備える。
- `ExecuteCommandOptions` / `ParsedExecuteOptions` に以下オプション追加:
  - `followupLlmMode` (`'auto' | 'openai' | 'claude' | 'off'`, デフォルト `'off'`)
  - `followupLlmModel?: string`
  - `followupLlmTimeout?: number`
  - `followupLlmRetries?: number`
- CLI サンプル: `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode auto`.
- `PhaseContext` に `issueGenerationOptions` を追加。`PhaseFactory` と各 Phase のコンストラクタに影響が出ないよう、`BasePhase` にプロパティを追加する。
- `EvaluationPhase` では `this.context.issueGenerationOptions` を取得し、`this.github.createIssueFromEvaluation(..., options)` を呼び出す。

### 7.6 型・設定拡張

- `src/types.ts` に `IssueGenerationOptions` を追加:
  ```ts
  export interface IssueGenerationOptions {
    enabled: boolean;
    provider: 'auto' | 'openai' | 'claude';
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
    maxTasks?: number; // プロンプトへ含める残タスク数（デフォルト5）
    appendMetadata?: boolean; // 本文末尾にAIメタデータを追記するか
  }
  ```
- `config.ts` へ以下ゲッター追加:
  - `getFollowupLlmMode()`, `getFollowupLlmModel()`, `getFollowupLlmTimeoutMs()`, `getFollowupLlmRetries()`, `getFollowupLlmEnabled()`.
- 環境変数命名例:
  - `FOLLOWUP_LLM_MODE` (`off` / `auto` / `openai` / `claude`)
  - `FOLLOWUP_LLM_MODEL`
  - `FOLLOWUP_LLM_TIMEOUT_MS`
  - `FOLLOWUP_LLM_MAX_RETRIES`
  - `FOLLOWUP_LLM_APPEND_METADATA`

### 7.7 テスト設計詳細

- **ユニットテスト (`tests/unit/github/issue-ai-generator.test.ts`)**
  1. `buildPrompt()` がタスク5件超過時に切り詰めること。
  2. API 応答が JSON 以外の場合に `ValidationError` を throw。
  3. 必須セクション欠落時に失敗すること。
  4. タイトル長が 50 未満/80 超過で失敗すること。
  5. リトライ設定が機能し、2回目で成功した場合に成功として返ること（モックで制御）。
  6. シークレット値が `[REDACTED_*]` に置換されること。
- **既存ユニットテスト拡張**
  - `issue-client.followup` テストに LLM 成功シナリオを追加（モック `IssueAIGenerator` を注入）。
  - LLM 例外時に WARN ログが発生し、既存フォールバックが使われることを検証。
- **インテグレーションテスト (`tests/integration/followup-issue-llm.test.ts`)**
  - Octokit モック + `IssueAIGenerator` フェイクを用意し、`createIssueFromEvaluation` が最終的に Octokit へ期待値を渡すことを確認。
  - 実 API 呼び出しテストは `process.env.FOLLOWUP_LLM_E2E === '1'` の時のみ実行。APIキー未設定時は `it.skip`。

### 7.8 ドキュメント更新

- `ARCHITECTURE.md`: Evaluation Phase → GitHubClient → IssueAIGenerator フロー図と説明を追加。
- `CLAUDE.md`: 新しい環境変数、Claude モデル選択、フォールバック挙動を追記。
- `README.md`: CLI オプション、設定例（`.env` テンプレート抜粋）、Troubleshooting（LLM失敗時のログの読み方）を追加。

### 7.9 要件トレーサビリティ

| 要件ID | 設計対応箇所 |
| --- | --- |
| FR-1 (タイトル 50-80文字) | 7.1 `validateResponse` で文字数検証、7.4 で LLM タイトル採用 |
| FR-2 (本文セクション) | 7.1 `buildPrompt` / `validateResponse` と 7.4 本文構築 |
| FR-3 (フォールバック) | 7.4 `tryGenerateWithLLM` → `buildLegacyBody` |
| FR-4 (設定反映) | 7.5 CLI/Phase 連携、7.6 `IssueGenerationOptions` |
| FR-5 (ログ) | 7.1 メタデータ記録、7.4 WARN/DEBUG ログ設計 |

---

## 8. セキュリティ考慮事項

- プロンプト前処理で `SecretMasker` により環境変数シークレットを除去。ユーザー提供データ内のメール/トークン形式を正規表現で追加検査。
- LLM 応答に URL やコマンドが含まれる場合はそのまま Issue へ反映するが、HTML/スクリプトタグは拒否。
- ログには API 応答本文を含めず、`encodeWarning` でエラー文字列をエンコード。APIキーは `config` ゲッター経由のみ取得し、再出力しない。
- 送信データには評価レポート本文等機密情報を含めない。ファイルパスは `evaluationReportPath` のみで内容は送信しない。
- レート制限超過時は再試行後にフォールバックし、無限ループ防止のため maxRetries を強制適用。

---

## 9. 非機能要件への対応

- **パフォーマンス**: タイムアウト (`timeoutMs`, デフォルト 30,000ms) と最大再試行 3 回で最悪 90 秒以内にフォールバック。タスク数制限・文字数トリムでプロンプトサイズを制御。
- **スケーラビリティ**: `IssueGenerationOptions.maxTasks` でプロンプト長を制御し、大規模残タスクでも安定。今後プロンプトテンプレート差し替えやモデル追加を `IssueAIGenerator` 内で閉じる設計。
- **保守性**: Provider アダプタを分離しテスト可能に。設定値は `config` 経由で集中管理し、ドキュメント更新でオンボーディングを容易にする。
- **可用性**: LLM 失敗時でも既存ロジックで必ず Issue 作成できる（FR-3）。WARN ログで原因を追跡可能。

---

## 10. 実装の順序

1. **型・設定整備**: `IssueGenerationOptions` 追加、`config.ts` ゲッター、CLI オプション解析/PhaseContext 拡張を実装。
2. **IssueAIGenerator 実装**: プロンプトテンプレート追加、Provider アダプタとサニタイズ・バリデーションロジックを開発。
3. **IssueClient / GitHubClient 拡張**: 依存注入、LLM 優先フロー、フォールバック実装、ログ整備。
4. **Phase/Evaluation 更新**: `IssueGenerationOptions` を渡すように修正。
5. **テスト実装**: 新規/既存テストを追加・更新。API キーが無い環境でも全テストが通るようモック設計。
6. **ドキュメント更新**: README / ARCHITECTURE / CLAUDE を更新し、利用手順と環境変数を明記。
7. **検証**: `npm run test:unit`, `npm run test:integration` を実行。必要に応じて `FOLLOWUP_LLM_E2E=1` で手動統合テストを実施。

---

本設計は以下の品質ゲートを満たしています:
- 実装戦略・テスト戦略・テストコード戦略の根拠を明記
- 既存コードへの影響範囲を分析
- 変更ファイルをリストアップ
- 実装手順と要件トレーサビリティを提示し、実装可能な設計を提供
