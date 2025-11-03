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
- 期待結果: LLM 呼び出しが 0 回、Octokit へはレガシータイトル/本文が送信される。ログには LLM 無効化の INFO が出力される。
- テストデータ: `task_medium_priority`.

## 3. Integrationテストシナリオ

### シナリオ名: CLIからIssueClientへのLLMオプション伝搬
- 目的: CLI 引数・環境変数が PhaseContext を経由して `IssueGenerationOptions` に伝搬することを検証する（FR-4）。
- 前提条件: OpenAI/Claude APIキーはダミー、`FOLLOWUP_LLM_MODE=auto` を設定。Octokit と LLM プロバイダはモック。
- テスト手順:
  1. `ai-workflow execute --issue 119 --phase evaluation --followup-llm-mode claude --followup-llm-model claude-3-sonnet-20240229 --followup-llm-timeout 20000 --followup-llm-max-retries 2 --followup-llm-append-metadata` を `NODE_ENV=test` で実行。
  2. テストフックで `IssueClient.createIssueFromEvaluation` 呼び出し時の `options` をキャプチャ。
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
