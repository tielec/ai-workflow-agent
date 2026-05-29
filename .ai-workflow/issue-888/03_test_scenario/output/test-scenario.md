# テストシナリオ: Issue #888

## PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略: UNIT_INTEGRATION

Planning Document および設計書（Phase 2）で決定された **UNIT_INTEGRATION** 戦略に基づき、ユニットテストと統合テストの2種別でテストシナリオを設計する。

### テスト戦略の判断根拠

| 項目 | 判断内容 |
|------|---------|
| **ユニットテスト** | 個別関数（`collectPhaseOutputs`, `getDiffForPrompt`, `extractDiffFileSummary`, `buildPromptContext`, `validateRequiredSections`, `executeAgentTask`, `generateAiRewrittenPrBody`）の単体テストが必要 |
| **統合テスト** | `--ai-rewrite` フラグ有効時のエンドツーエンドフロー（エージェントモック使用 → PR更新 → フォールバック）の検証が必要 |
| **BDDテスト** | 不要（CLI コマンドの機能テストで十分であり、エンドユーザー向けUIは存在しない） |

### テストコード戦略: BOTH_TEST

| 戦略 | 対象 |
|------|------|
| **EXTEND_TEST** | 既存 `tests/unit/commands/finalize.test.ts` に `--ai-rewrite` 関連テストケースを追加 |
| **EXTEND_TEST** | 既存 `tests/integration/finalize-command.test.ts` に `--ai-rewrite` 統合テストを追加 |
| **CREATE_TEST** | 新規 `tests/unit/commands/finalize-ai-rewrite.test.ts` を作成し、AIリライト固有ロジックを体系的にテスト |

### テスト対象の範囲

#### 新規追加関数（`finalize.ts`）

| 関数名 | 責務 | テスト種別 |
|--------|------|-----------|
| `collectPhaseOutputs()` | フェーズ成果物の収集 | Unit |
| `getDiffForPrompt()` | diff取得・トランケーション | Unit |
| `extractDiffFileSummary()` | diffからファイルサマリー抽出 | Unit |
| `buildPromptContext()` | AIプロンプトの構築 | Unit |
| `validateRequiredSections()` | 必須セクション検証 | Unit |
| `executeAgentTask()` | エージェント実行（フォールバック付き） | Unit |
| `generateAiRewrittenPrBody()` | AIリライトメイン処理 | Unit + Integration |

#### 拡張対象関数（`finalize.ts`）

| 関数名 | 変更内容 | テスト種別 |
|--------|---------|-----------|
| `handleFinalizeCommand()` | `collectPhaseOutputs()` 呼び出し追加、`collectedOutputs` の引き渡し | Integration |
| `executeStep4And5()` | `--ai-rewrite` 分岐ロジック追加 | Unit + Integration |
| `previewFinalize()` | `--ai-rewrite` 表示追加 | Unit |

#### CLIオプション（`main.ts`）

| オプション | テスト種別 |
|-----------|-----------|
| `--ai-rewrite` | Unit（バリデーション）+ Integration（フロー） |
| `--agent <mode>` | Unit（バリデーション）+ Integration（フロー） |

#### 型定義・設定（`prompt-loader.ts`）

| 変更 | テスト種別 |
|------|-----------|
| `PromptCategory` に `'finalize'` 追加 | Unit（プロンプト読み込み確認） |

### テストの目的

1. **機能正確性**: 各関数が仕様通りに動作することを保証する
2. **フォールバック安全性**: AI生成失敗時に既存の `generateFinalPrBody()` 出力に確実にフォールバックすることを保証する
3. **既存機能の回帰防止**: `--ai-rewrite` 未指定時に既存動作が100%保持されることを保証する
4. **エッジケース対応**: 大規模diff、成果物不在、エージェント認証エラー等の異常系が適切に処理されることを保証する

---

## 2. ユニットテストシナリオ

### 2.1 `collectPhaseOutputs()` — フェーズ成果物収集

#### UC-AR-01: collectPhaseOutputs_正常系_全成果物存在

- **目的**: すべてのフェーズ成果物ファイルが存在する場合に、正しく収集されることを検証
- **前提条件**: `.ai-workflow/issue-123/` 配下に7つの成果物ファイルがすべて存在する
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - `outputs` に7つのエントリが含まれる（キー: `planning`, `requirements`, `design`, `test_scenario`, `implementation`, `test_result`, `documentation`）
  - `collectedCount` が `7`
  - `totalCount` が `7`
  - 各エントリの値がファイル内容と一致する
- **テストデータ**:
  - 各成果物ファイルに短いMarkdownテキスト（例: `# Planning\nTest content`）を配置

#### UC-AR-02: collectPhaseOutputs_正常系_一部成果物不在

- **目的**: 一部のフェーズ成果物ファイルが不在の場合にスキップし、フォールバックテキストが設定されることを検証
- **前提条件**: `planning.md` と `design.md` のみ存在、他は不在
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - `collectedCount` が `2`
  - `totalCount` が `7`
  - 不在ファイルに対応するエントリの値が `'（このフェーズの成果物は利用できません）'`
  - 存在するファイルのエントリ値がファイル内容と一致する
- **テストデータ**:
  - `planning.md`: `# Planning\nTest planning content`
  - `design.md`: `# Design\nTest design content`

#### UC-AR-03: collectPhaseOutputs_正常系_全成果物不在

- **目的**: すべてのフェーズ成果物が不在の場合でもエラーなく完了し、全エントリにフォールバックテキストが設定されることを検証
- **前提条件**: `.ai-workflow/issue-123/` ディレクトリは存在するが、成果物ファイルは1つも存在しない
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - `collectedCount` が `0`
  - `totalCount` が `7`
  - すべてのエントリの値が `'（このフェーズの成果物は利用できません）'`

#### UC-AR-04: collectPhaseOutputs_正常系_トランケーション

- **目的**: 10,000文字を超える成果物ファイルが正しくトランケーションされることを検証（FR-004）
- **前提条件**: `planning.md` が15,000文字のコンテンツを含む
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - `outputs.planning` の長さが 10,000文字 + `'\n\n... (以降省略)'` の文字数
  - 先頭10,000文字が元のコンテンツと一致する
  - 末尾に `'... (以降省略)'` が含まれる
- **テストデータ**:
  - `planning.md`: `'A'.repeat(15000)` （15,000文字の文字列）

#### UC-AR-05: collectPhaseOutputs_異常系_ファイル読み込みエラー

- **目的**: ファイル読み込み時にエラーが発生した場合に、エラーメッセージのフォールバックテキストが設定され、他のファイルの収集に影響しないことを検証
- **前提条件**: `planning.md` のパーミッションが読み取り不可に設定されている（モックで再現）
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - 読み込みエラーが発生したファイルのエントリ値が `'（このフェーズの成果物の読み込みに失敗しました）'`
  - `logger.warn()` がエラーメッセージ付きで呼び出される
  - 他の成果物ファイルの収集は正常に完了する

#### UC-AR-06: collectPhaseOutputs_境界値_ちょうど10000文字

- **目的**: 10,000文字ちょうどの成果物がトランケーションされないことを検証
- **前提条件**: `planning.md` がちょうど10,000文字のコンテンツを含む
- **入力**:
  - `metadataManager`: workflowDir が `.ai-workflow/issue-123` を指す
  - `issueNumber`: `123`
- **期待結果**:
  - `outputs.planning` の長さがちょうど10,000文字
  - `'... (以降省略)'` が含まれない

---

### 2.2 `getDiffForPrompt()` — diff取得・トランケーション

#### UC-AR-07: getDiffForPrompt_正常系_通常サイズdiff

- **目的**: 50,000文字以下かつ300ファイル以下のdiffがそのまま返されることを検証（FR-003）
- **前提条件**: `PullRequestClient.getPullRequestDiff()` が通常サイズのdiffを返す（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `{ diff: 'diff content...', truncated: false, filesChanged: 10 }` を返す）
  - `prNumber`: `456`
- **期待結果**:
  - `content` が `'diff content...'` と一致
  - `wasTruncated` が `false`
  - `filesChanged` が `10`

#### UC-AR-08: getDiffForPrompt_正常系_大規模diff_文字数超過

- **目的**: 50,000文字を超えるdiffがトランケーションされ、ファイル変更サマリーのみ返されることを検証
- **前提条件**: `PullRequestClient.getPullRequestDiff()` が60,000文字のdiffを返す（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `{ diff: largeDiffText, truncated: false, filesChanged: 50 }` を返す）
  - `prNumber`: `456`
- **期待結果**:
  - `wasTruncated` が `true`
  - `content` に `'サマリーのみ提供'` が含まれる
  - `content` に `'60,000 文字'` が含まれる
  - `filesChanged` が `50`
- **テストデータ**:
  - `largeDiffText`: `'diff --git a/file1.ts b/file1.ts\n+line1\n'.repeat(...)` で60,000文字以上のdiff

#### UC-AR-09: getDiffForPrompt_正常系_大規模diff_ファイル数超過

- **目的**: 300ファイルを超えるdiffがトランケーションされることを検証
- **前提条件**: `PullRequestClient.getPullRequestDiff()` がfilesChanged > 300のdiffを返す（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `{ diff: 'some diff', truncated: true, filesChanged: 350 }` を返す）
  - `prNumber`: `456`
- **期待結果**:
  - `wasTruncated` が `true`
  - `content` に `'350 ファイル'` が含まれる
  - `content` に `'300ファイル超'` が含まれる

#### UC-AR-10: getDiffForPrompt_異常系_diff取得失敗

- **目的**: diff取得がエラーを返した場合にフォールバックコンテンツが返されることを検証
- **前提条件**: `PullRequestClient.getPullRequestDiff()` が例外をスローする（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `new Error('API rate limit exceeded')` をスロー）
  - `prNumber`: `456`
- **期待結果**:
  - `content` に `'diff情報の取得に失敗しました'` が含まれる
  - `wasTruncated` が `false`
  - `filesChanged` が `0`
  - `logger.warn()` がエラーメッセージ付きで呼び出される

#### UC-AR-11: getDiffForPrompt_境界値_ちょうど50000文字

- **目的**: 50,000文字ちょうどのdiffがトランケーションされないことを検証
- **前提条件**: `PullRequestClient.getPullRequestDiff()` がちょうど50,000文字のdiffを返す（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `{ diff: exactDiff, truncated: false, filesChanged: 100 }` を返す）
  - `prNumber`: `456`
- **期待結果**:
  - `wasTruncated` が `false`
  - `content` が元のdiffテキストと一致

#### UC-AR-12: getDiffForPrompt_境界値_ちょうど300ファイル

- **目的**: ちょうど300ファイルのdiffがトランケーションされないことを検証
- **前提条件**: `PullRequestClient.getPullRequestDiff()` がfilesChanged=300を返す（モック）
- **入力**:
  - `prClient`: モック（`getPullRequestDiff()` が `{ diff: 'short diff', truncated: false, filesChanged: 300 }` を返す）
  - `prNumber`: `456`
- **期待結果**:
  - `wasTruncated` が `false`（300は閾値以下なのでトランケーションされない）

---

### 2.3 `extractDiffFileSummary()` — diffファイルサマリー抽出

#### UC-AR-13: extractDiffFileSummary_正常系_複数ファイル

- **目的**: 複数ファイルのdiffからファイル変更サマリーが正しく抽出されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  ```
  diff --git a/src/main.ts b/src/main.ts
  --- a/src/main.ts
  +++ b/src/main.ts
  +new line 1
  +new line 2
  -old line 1
  diff --git a/src/utils.ts b/src/utils.ts
  --- a/src/utils.ts
  +++ b/src/utils.ts
  +added line
  ```
- **期待結果**:
  - 出力に `'### 変更ファイル一覧（2 ファイル）'` が含まれる
  - `'- src/main.ts: +2 -1'` が含まれる
  - `'- src/utils.ts: +1 -0'` が含まれる

#### UC-AR-14: extractDiffFileSummary_正常系_単一ファイル

- **目的**: 単一ファイルのdiffからサマリーが正しく抽出されることを検証
- **前提条件**: なし
- **入力**:
  ```
  diff --git a/README.md b/README.md
  --- a/README.md
  +++ b/README.md
  +new content
  ```
- **期待結果**:
  - `'### 変更ファイル一覧（1 ファイル）'` が含まれる
  - `'- README.md: +1 -0'` が含まれる

#### UC-AR-15: extractDiffFileSummary_境界値_空diff

- **目的**: 空のdiffテキストが入力された場合にエラーなく空のサマリーが返されることを検証
- **前提条件**: なし
- **入力**: 空文字列 `''`
- **期待結果**:
  - `'### 変更ファイル一覧（0 ファイル）'` が含まれる

---

### 2.4 `buildPromptContext()` — プロンプト構築

#### UC-AR-16: buildPromptContext_正常系_全変数置換

- **目的**: すべてのテンプレート変数が正しく置換されることを検証（FR-005、PC-004）
- **前提条件**: `PromptLoader.loadPrompt()` と `PromptLoader.loadTemplate()` がモックされている
- **入力**:
  - `issueNumber`: `888`
  - `issueTitle`: `'テスト機能の追加'`
  - `diffContext`: `{ content: 'diff text', wasTruncated: false, filesChanged: 5 }`
  - `phaseOutputs`: `{ outputs: { planning: 'plan content', design: 'design content' }, collectedCount: 2, totalCount: 7 }`
  - `language`: `'ja'`
- **期待結果**:
  - 返却文字列に `'888'` が含まれる（`{issue_number}` 置換）
  - 返却文字列に `'テスト機能の追加'` が含まれる（`{issue_title}` 置換）
  - 返却文字列に `'diff text'` が含まれる（`{diff_content}` 置換）
  - 返却文字列に `'plan content'` が含まれる（`{phase_outputs}` 置換）
  - `{issue_number}`, `{issue_title}`, `{diff_content}`, `{phase_outputs}`, `{template_structure}` のプレースホルダーが残っていない
- **テストデータ**:
  - プロンプトテンプレート: `'Issue #{issue_number}: {issue_title}\nDiff: {diff_content}\nOutputs: {phase_outputs}\nTemplate: {template_structure}'`
  - ボディテンプレート: `'## Template Structure'`

#### UC-AR-17: buildPromptContext_正常系_英語言語

- **目的**: 英語言語指定時に英語のプロンプト・テンプレートが読み込まれることを検証（FR-010）
- **前提条件**: `PromptLoader.loadPrompt()` と `PromptLoader.loadTemplate()` がモックされている
- **入力**:
  - `language`: `'en'`
  - 他パラメータは `UC-AR-16` と同様
- **期待結果**:
  - `PromptLoader.loadPrompt()` が `('finalize', 'rewrite_pr_body', 'en')` で呼び出される
  - `PromptLoader.loadTemplate()` が `('pr_body_finalize_template.md', 'en')` で呼び出される

#### UC-AR-18: buildPromptContext_正常系_replaceAll使用確認

- **目的**: テンプレート変数置換が `replaceAll()` を使用していることを検証（PC-004: ReDoS防止）
- **前提条件**: プロンプトテンプレートに同一変数が複数回出現する
- **入力**:
  - プロンプトテンプレート: `'#{issue_number} - #{issue_number}'`
  - `issueNumber`: `888`
- **期待結果**:
  - 返却文字列に `'#888 - #888'` が含まれる（両方の `{issue_number}` が置換される）

---

### 2.5 `validateRequiredSections()` — 必須セクション検証

#### UC-AR-19: validateRequiredSections_正常系_日本語_全セクション

- **目的**: 日本語の全必須セクションが含まれている場合にtrueが返されることを検証
- **前提条件**: なし（純粋関数）
- **入力**:
  - `body`: `'## 変更概要\n概要テキスト\n## 主要な変更点\n変更テキスト'`
  - `language`: `'ja'`
- **期待結果**: `true`

#### UC-AR-20: validateRequiredSections_正常系_英語_全セクション

- **目的**: 英語の全必須セクションが含まれている場合にtrueが返されることを検証
- **前提条件**: なし
- **入力**:
  - `body`: `'## Summary\nSummary text\n## Key Changes\nChanges text'`
  - `language`: `'en'`
- **期待結果**: `true`

#### UC-AR-21: validateRequiredSections_正常系_一部セクションのみ

- **目的**: 必須セクションの少なくとも1つが含まれていればtrueが返されることを検証（設計書7.2.8: `foundCount >= 1`）
- **前提条件**: なし
- **入力**:
  - `body`: `'## 変更概要\n概要テキスト\nその他のコンテンツ'`
  - `language`: `'ja'`
- **期待結果**: `true`

#### UC-AR-22: validateRequiredSections_異常系_セクションなし

- **目的**: 必須セクションが1つも含まれていない場合にfalseが返されることを検証
- **前提条件**: なし
- **入力**:
  - `body`: `'## その他のセクション\nランダムなテキスト'`
  - `language`: `'ja'`
- **期待結果**: `false`

#### UC-AR-23: validateRequiredSections_異常系_空文字列

- **目的**: 空文字列が入力された場合にfalseが返されることを検証
- **前提条件**: なし
- **入力**:
  - `body`: `''`
  - `language`: `'ja'`
- **期待結果**: `false`

---

### 2.6 `executeAgentTask()` — エージェント実行

#### UC-AR-24: executeAgentTask_正常系_Claude成功

- **目的**: Claudeエージェントが正常にメッセージを返した場合にそのメッセージが返されることを検証
- **前提条件**: `claudeClient` と `codexClient` がモックされている
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: モック（`executeTask()` が `['## 変更概要\n...']` を返す）
  - `codexClient`: モック
- **期待結果**:
  - 戻り値が `['## 変更概要\n...']`
  - `claudeClient.executeTask()` が1回呼び出される
  - `codexClient.executeTask()` が呼び出されない

#### UC-AR-25: executeAgentTask_正常系_ClaudeからCodexへフォールバック

- **目的**: Claudeが失敗した場合にCodexにフォールバックし、Codexの出力が返されることを検証（FR-008）
- **前提条件**: `claudeClient` が例外をスローし、`codexClient` は正常に動作する
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: モック（`executeTask()` が `new Error('Claude auth error')` をスロー）
  - `codexClient`: モック（`executeTask()` が `['## Summary\n...']` を返す）
- **期待結果**:
  - 戻り値が `['## Summary\n...']`
  - `logger.warn()` がClaude失敗メッセージ付きで呼び出される
  - `codexClient.executeTask()` が1回呼び出される

#### UC-AR-26: executeAgentTask_正常系_Claude空結果からCodexへフォールバック

- **目的**: Claudeが空の結果を返した場合にCodexにフォールバックすることを検証
- **前提条件**: `claudeClient` が空配列を返す
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: モック（`executeTask()` が `[]` を返す）
  - `codexClient`: モック（`executeTask()` が `['Generated content']` を返す）
- **期待結果**:
  - 戻り値が `['Generated content']`
  - `logger.warn()` が空結果メッセージ付きで呼び出される

#### UC-AR-27: executeAgentTask_異常系_両エージェント失敗

- **目的**: ClaudeとCodexの両方が失敗した場合にエラーがスローされることを検証
- **前提条件**: 両エージェントが例外をスローする
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: モック（`executeTask()` が `new Error('Claude error')` をスロー）
  - `codexClient`: モック（`executeTask()` が `new Error('Codex error')` をスロー）
- **期待結果**:
  - `Error('Both Claude and Codex agents failed to generate PR body')` がスローされる

#### UC-AR-28: executeAgentTask_正常系_Claudeのみ使用可能

- **目的**: `codexClient` が `null` の場合にClaudeのみで実行されることを検証
- **前提条件**: `codexClient` が `null`
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: モック（`executeTask()` が `['content']` を返す）
  - `codexClient`: `null`
- **期待結果**:
  - 戻り値が `['content']`

#### UC-AR-29: executeAgentTask_正常系_Codexのみ使用可能

- **目的**: `claudeClient` が `null` の場合にCodexのみで実行されることを検証
- **前提条件**: `claudeClient` が `null`
- **入力**:
  - `prompt`: `'Generate PR body...'`
  - `claudeClient`: `null`
  - `codexClient`: モック（`executeTask()` が `['content']` を返す）
- **期待結果**:
  - 戻り値が `['content']`

---

### 2.7 `generateAiRewrittenPrBody()` — AIリライトメイン処理

#### UC-AR-30: generateAiRewrittenPrBody_正常系_AI生成成功

- **目的**: AIエージェントが有効なPRボディを生成した場合にそのテキストが返されることを検証
- **前提条件**: すべての依存関数がモックされている（diff取得成功、プロンプト構築成功、エージェント実行成功、セクション検証成功）
- **入力**:
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `collectedOutputs`: 正常なフェーズ成果物
  - `fallbackBody`: `'Fallback content'`
- **期待結果**:
  - AI生成されたPRボディテキストが返される（フォールバックではない）
  - `logger.info('AI rewrite of PR body completed successfully.')` が呼び出される

#### UC-AR-31: generateAiRewrittenPrBody_異常系_エージェントエラー_フォールバック

- **目的**: エージェント実行がエラーをスローした場合にフォールバックボディが返されることを検証（FR-008）
- **前提条件**: `executeAgentTask()` がエラーをスローする（モック）
- **入力**:
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `fallbackBody`: `'Fallback content'`
- **期待結果**:
  - 戻り値が `'Fallback content'`
  - `logger.warn()` がエラーメッセージ付きで呼び出される

#### UC-AR-32: generateAiRewrittenPrBody_異常系_空出力_フォールバック

- **目的**: エージェントが空の出力を返した場合にフォールバックボディが返されることを検証
- **前提条件**: `executeAgentTask()` が空メッセージを返す（モック）
- **入力**:
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `fallbackBody`: `'Fallback content'`
- **期待結果**:
  - 戻り値が `'Fallback content'`
  - `logger.warn('AI agent returned empty output...')` が呼び出される

#### UC-AR-33: generateAiRewrittenPrBody_異常系_必須セクション欠落_フォールバック

- **目的**: AI生成されたPRボディに必須セクションが含まれていない場合にフォールバックボディが返されることを検証
- **前提条件**: `validateRequiredSections()` が `false` を返す（モック）
- **入力**:
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `fallbackBody`: `'Fallback content'`
- **期待結果**:
  - 戻り値が `'Fallback content'`
  - `logger.warn('AI-generated PR body missing required sections...')` が呼び出される

#### UC-AR-34: generateAiRewrittenPrBody_異常系_認証情報なし_フォールバック

- **目的**: エージェント認証情報が未設定の場合にフォールバックボディが返されることを検証（AC-012）
- **前提条件**: `setupAgentClients()` が `{ codexClient: null, claudeClient: null }` を返す（モック）
- **入力**:
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `fallbackBody`: `'Fallback content'`
- **期待結果**:
  - 戻り値が `'Fallback content'`
  - `logger.warn('No agent credentials available...')` が呼び出される

---

### 2.8 `executeStep4And5()` の拡張 — PR更新分岐

#### UC-AR-35: executeStep4And5_正常系_aiRewrite有効

- **目的**: `--ai-rewrite` が有効かつ `collectedOutputs` が渡された場合に `generateAiRewrittenPrBody()` が呼び出されることを検証
- **前提条件**: `generateAiRewrittenPrBody()` がモックされている
- **入力**:
  - `options`: `{ issue: '123', aiRewrite: true }`
  - `collectedOutputs`: 有効な `CollectedPhaseOutputs`
- **期待結果**:
  - `generateAiRewrittenPrBody()` が1回呼び出される
  - `prClient.updatePullRequest()` がAI生成ボディで呼び出される

#### UC-AR-36: executeStep4And5_正常系_aiRewrite無効

- **目的**: `--ai-rewrite` が無効の場合に従来の `generateFinalPrBody()` が使用されることを検証（FR-009）
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123' }`（`aiRewrite` 未指定）
  - `collectedOutputs`: `null`
- **期待結果**:
  - `generateFinalPrBody()` の出力がPR更新に使用される
  - `generateAiRewrittenPrBody()` が呼び出されない

#### UC-AR-37: executeStep4And5_正常系_aiRewrite有効_collectedOutputsがnull

- **目的**: `--ai-rewrite` が有効だが `collectedOutputs` が `null` の場合にフォールバックが使用されることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123', aiRewrite: true }`
  - `collectedOutputs`: `null`
- **期待結果**:
  - `generateFinalPrBody()` の出力がPR更新に使用される

---

### 2.9 `previewFinalize()` の拡張 — ドライランプレビュー

#### UC-AR-38: previewFinalize_正常系_aiRewrite有効表示_日本語

- **目的**: `--ai-rewrite` 有効時にプレビューに「AI リライトが有効」と表示されることを検証（FR-011）
- **前提条件**: `metadataManager.getLanguage()` が `'ja'` を返す
- **入力**:
  - `options`: `{ issue: '123', dryRun: true, aiRewrite: true, agent: 'auto' }`
- **期待結果**:
  - `logger.info()` が `'PR更新: AI リライトが有効（エージェント: auto）'` を含む文字列で呼び出される

#### UC-AR-39: previewFinalize_正常系_aiRewrite有効表示_英語

- **目的**: 英語環境で `--ai-rewrite` 有効時にプレビューに「AI rewrite enabled」と表示されることを検証
- **前提条件**: `metadataManager.getLanguage()` が `'en'` を返す
- **入力**:
  - `options`: `{ issue: '123', dryRun: true, aiRewrite: true, agent: 'claude' }`
- **期待結果**:
  - `logger.info()` が `'PR Update: AI rewrite enabled (agent: claude)'` を含む文字列で呼び出される

#### UC-AR-40: previewFinalize_正常系_aiRewrite無効_従来表示

- **目的**: `--ai-rewrite` 無効時にプレビューが従来通りの表示であることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123', dryRun: true }`（`aiRewrite` 未指定）
- **期待結果**:
  - `logger.info()` が `'Update PR body with final content'` を含む文字列で呼び出される
  - `'AI リライト'` / `'AI rewrite'` が表示されない

---

### 2.10 `handleFinalizeCommand()` の拡張 — 成果物収集タイミング

#### UC-AR-41: handleFinalizeCommand_正常系_aiRewrite有効時に成果物収集

- **目的**: `--ai-rewrite` が有効な場合にStep 2の前に `collectPhaseOutputs()` が呼び出されることを検証（TC-007）
- **前提条件**: `collectPhaseOutputs()` がモックされている
- **入力**:
  - `options`: `{ issue: '123', aiRewrite: true }`
- **期待結果**:
  - `collectPhaseOutputs()` が `executeStep2()` より前に呼び出される
  - 収集結果が `executeStep4And5()` に渡される

#### UC-AR-42: handleFinalizeCommand_正常系_aiRewrite無効時に成果物収集スキップ

- **目的**: `--ai-rewrite` が無効な場合に `collectPhaseOutputs()` が呼び出されないことを検証（FR-009）
- **前提条件**: `collectPhaseOutputs()` がモックされている
- **入力**:
  - `options`: `{ issue: '123' }`（`aiRewrite` 未指定）
- **期待結果**:
  - `collectPhaseOutputs()` が呼び出されない
  - `executeStep4And5()` に `null` が渡される

---

### 2.11 CLIオプション — バリデーション

#### UC-AR-43: FinalizeCommandOptions_正常系_aiRewriteプロパティ

- **目的**: `FinalizeCommandOptions` インターフェースに `aiRewrite` プロパティが存在し、オプショナルであることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123', aiRewrite: true }`
- **期待結果**:
  - TypeScript コンパイルエラーなし
  - `options.aiRewrite` が `true` と評価される

#### UC-AR-44: FinalizeCommandOptions_正常系_agentプロパティ

- **目的**: `FinalizeCommandOptions` インターフェースに `agent` プロパティが存在し、指定された値のみ受け付けることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123', aiRewrite: true, agent: 'claude' }`
- **期待結果**:
  - `options.agent` が `'claude'` と評価される
  - `'auto'`, `'codex'`, `'claude'` のいずれかの値が設定可能

#### UC-AR-45: FinalizeCommandOptions_正常系_デフォルト値

- **目的**: `aiRewrite` 未指定時に `undefined`（falsy）として扱われること、`agent` 未指定時にデフォルト `'auto'` が適用されることを検証
- **前提条件**: なし
- **入力**:
  - `options`: `{ issue: '123' }`
- **期待結果**:
  - `options.aiRewrite` が `undefined`
  - `options.agent` が `undefined`（コード内で `options.agent ?? 'auto'` としてデフォルト処理される）

---

### 2.12 `PromptCategory` 拡張

#### UC-AR-46: PromptCategory_正常系_finalize追加

- **目的**: `PromptCategory` 型に `'finalize'` が含まれ、`PromptLoader.loadPrompt('finalize', ...)` が正常に動作することを検証
- **前提条件**: `src/prompts/finalize/ja/rewrite_pr_body.txt` が存在する
- **入力**:
  - `category`: `'finalize'`
  - `name`: `'rewrite_pr_body'`
  - `language`: `'ja'`
- **期待結果**:
  - `PromptLoader.loadPrompt()` がプロンプトテキストを返す
  - TypeScript コンパイルエラーなし

---

### 2.13 既存テストの回帰確認

#### UC-AR-47: generateFinalPrBody_回帰_全フェーズ完了（既存UC-32の再確認）

- **目的**: `--ai-rewrite` 機能追加後も、既存の `generateFinalPrBody()` が変更なく動作することを確認する回帰テスト
- **前提条件**: 既存テスト `UC-32` と同一
- **入力**: 既存テスト `UC-32` と同一
- **期待結果**: 既存テスト `UC-32` と同一（PR本文に `'✅ planning: completed'` 等が含まれる）

#### UC-AR-48: generateFinalPrBody_回帰_一部フェーズ未完了（既存UC-33の再確認）

- **目的**: `--ai-rewrite` 機能追加後も、一部フェーズ未完了時の既存動作が保持されることを確認する回帰テスト
- **前提条件**: 既存テスト `UC-33` と同一
- **入力**: 既存テスト `UC-33` と同一
- **期待結果**: 既存テスト `UC-33` と同一

---

## 3. 統合テストシナリオ

### 3.1 `--ai-rewrite` フラグ有効時のエンドツーエンドフロー

#### IT-AR-01: 統合テスト_正常系_aiRewrite有効_dryRunモード

- **目的**: `--ai-rewrite` と `--dry-run` を同時に指定した場合に、プレビュー表示にAIリライト情報が含まれ、実際のAI呼び出しが行われないことを検証（AC-010）
- **前提条件**:
  - メタデータファイルが存在し、全フェーズ完了
  - `base_commit` がメタデータに存在
- **テスト手順**:
  1. `FinalizeCommandOptions` に `{ issue: '123', dryRun: true, aiRewrite: true, agent: 'auto' }` を設定
  2. `handleFinalizeCommand(options)` を実行
  3. ログ出力を検証
- **期待結果**:
  - コマンドがエラーなく完了する
  - プレビュー出力に `'AI リライトが有効'` が含まれる
  - エージェントクライアントの `executeTask()` が呼び出されない
  - PRが更新されない
- **確認項目**:
  - [x] `--dry-run` が優先される
  - [x] AI呼び出しが行われない
  - [x] プレビュー情報が正しい

#### IT-AR-02: 統合テスト_正常系_aiRewrite有効_エージェントモック使用

- **目的**: `--ai-rewrite` 有効時にフェーズ成果物収集 → diff取得 → プロンプト構築 → エージェント実行 → PR更新の一連のフローが正常に動作することを検証（AC-001）
- **前提条件**:
  - メタデータファイルが存在し、全フェーズ完了
  - `base_commit` がメタデータに存在
  - `simple-git`、`GitManager`、`ArtifactCleaner`、`GitHubClient` がモックされている
  - エージェントクライアント（`resolveAgentCredentials`, `setupAgentClients`）がモックされている
  - フェーズ成果物ファイルが存在する
- **テスト手順**:
  1. フェーズ成果物ファイルを `.ai-workflow/issue-123/` 配下に作成
  2. `PullRequestClient.getPullRequestDiff()` モックを設定（通常サイズdiff返却）
  3. エージェントモックを設定（有効なPRボディを返却）
  4. `FinalizeCommandOptions` に `{ issue: '123', aiRewrite: true }` を設定
  5. `handleFinalizeCommand(options)` を実行
  6. `prClient.updatePullRequest()` の呼び出し引数を検証
- **期待結果**:
  - `collectPhaseOutputs()` が Step 2 実行前に呼び出される
  - エージェントの `executeTask()` が1回呼び出される
  - `prClient.updatePullRequest()` がAI生成されたPRボディで呼び出される
  - `prClient.markPRReady()` が呼び出される
  - コマンドが正常に完了する
- **確認項目**:
  - [x] 成果物収集タイミングが正しい（Step 2前）
  - [x] エージェントに適切なプロンプトが渡される
  - [x] PR更新にAI生成ボディが使用される
  - [x] ドラフト解除が実行される

#### IT-AR-03: 統合テスト_正常系_aiRewrite有効_エージェント失敗_フォールバック

- **目的**: AIエージェントが失敗した場合に従来の `generateFinalPrBody()` 出力でPRが正常に更新されることを検証（AC-004）
- **前提条件**:
  - IT-AR-02 と同様だが、エージェントモックがエラーをスローするよう設定
- **テスト手順**:
  1. エージェントモックを設定（`executeTask()` がエラーをスロー）
  2. `FinalizeCommandOptions` に `{ issue: '123', aiRewrite: true }` を設定
  3. `handleFinalizeCommand(options)` を実行
  4. `prClient.updatePullRequest()` の呼び出し引数を検証
- **期待結果**:
  - コマンドが正常に完了する（全体プロセスは失敗しない）
  - `prClient.updatePullRequest()` が従来の `generateFinalPrBody()` 出力で呼び出される
  - `logger.warn()` がフォールバック理由付きで呼び出される
  - `prClient.markPRReady()` が正常に呼び出される
- **確認項目**:
  - [x] finalizeプロセス全体が中断しない
  - [x] フォールバックPRボディが使用される
  - [x] 警告ログが出力される

#### IT-AR-04: 統合テスト_正常系_aiRewrite無効_既存動作保持

- **目的**: `--ai-rewrite` 未指定時に既存の finalize フローが100%保持されることを検証（AC-002、FR-009）
- **前提条件**:
  - IT-AR-02 と同様だが、`aiRewrite` オプションなし
- **テスト手順**:
  1. `FinalizeCommandOptions` に `{ issue: '123' }` を設定（`aiRewrite` 未指定）
  2. `handleFinalizeCommand(options)` を実行
  3. 動作を検証
- **期待結果**:
  - `collectPhaseOutputs()` が呼び出されない
  - エージェントクライアントが初期化されない
  - `prClient.updatePullRequest()` が従来の `generateFinalPrBody()` 出力で呼び出される
  - 既存テスト（IT-01〜IT-04）と同等の動作
- **確認項目**:
  - [x] 成果物収集が行われない
  - [x] エージェントが呼び出されない
  - [x] 従来のPRボディが使用される

### 3.2 オプション組み合わせテスト

#### IT-AR-05: 統合テスト_正常系_skipPrUpdate_と_aiRewrite同時指定

- **目的**: `--skip-pr-update` と `--ai-rewrite` を同時に指定した場合に、PR更新がスキップされAIリライトも実行されないことを検証（AC-011）
- **前提条件**:
  - メタデータファイルが存在
- **テスト手順**:
  1. `FinalizeCommandOptions` に `{ issue: '123', skipPrUpdate: true, aiRewrite: true, dryRun: true }` を設定
  2. `handleFinalizeCommand(options)` を実行
- **期待結果**:
  - コマンドが正常に完了する
  - `prClient.updatePullRequest()` が呼び出されない
  - エージェントの `executeTask()` が呼び出されない
  - プレビュー表示に `'[SKIPPED] PR update'` が含まれる

#### IT-AR-06: 統合テスト_正常系_agentモード指定_claude

- **目的**: `--agent claude` 指定時にClaudeエージェントが優先的に使用されることを検証（FR-002）
- **前提条件**:
  - エージェントモックが設定されている
- **テスト手順**:
  1. `FinalizeCommandOptions` に `{ issue: '123', aiRewrite: true, agent: 'claude', dryRun: true }` を設定
  2. `handleFinalizeCommand(options)` を実行
  3. プレビュー出力を検証
- **期待結果**:
  - プレビュー表示に `'エージェント: claude'` が含まれる

#### IT-AR-07: 統合テスト_正常系_agentモード指定_codex

- **目的**: `--agent codex` 指定時にCodexエージェントが使用されることを検証
- **前提条件**:
  - エージェントモックが設定されている
- **テスト手順**:
  1. `FinalizeCommandOptions` に `{ issue: '123', aiRewrite: true, agent: 'codex', dryRun: true }` を設定
  2. `handleFinalizeCommand(options)` を実行
- **期待結果**:
  - プレビュー表示に `'エージェント: codex'` が含まれる

---

## 4. エッジケース一覧

以下のエッジケースは上記ユニットテスト・統合テストのシナリオ内でカバーされているが、特に注意が必要なケースとして明示的に列挙する。

### 4.1 データ関連エッジケース

| ID | エッジケース | カバーするテスト | 優先度 |
|----|------------|----------------|--------|
| EC-01 | diff が空（変更ファイルなし） | UC-AR-15（extractDiffFileSummary空diff） | 中 |
| EC-02 | すべてのフェーズ成果物が不在 | UC-AR-03 | 高 |
| EC-03 | diff が 300 ファイル超（truncated=true） | UC-AR-09 | 高 |
| EC-04 | diff がちょうど 50,000 文字 | UC-AR-11 | 中 |
| EC-05 | diff がちょうど 300 ファイル | UC-AR-12 | 中 |
| EC-06 | 成果物ファイルがちょうど 10,000 文字 | UC-AR-06 | 中 |
| EC-07 | 成果物ファイルが 10,000 文字超 | UC-AR-04 | 高 |
| EC-08 | AI生成PRボディが空文字列 | UC-AR-32 | 高 |
| EC-09 | AI生成PRボディに必須セクションが1つもない | UC-AR-22, UC-AR-33 | 高 |

### 4.2 認証・接続関連エッジケース

| ID | エッジケース | カバーするテスト | 優先度 |
|----|------------|----------------|--------|
| EC-10 | エージェント認証情報が未設定 | UC-AR-34 | 高 |
| EC-11 | Claudeのみ認証エラー → Codexフォールバック | UC-AR-25 | 高 |
| EC-12 | Claude・Codex両方認証エラー | UC-AR-27 | 高 |
| EC-13 | diff取得時のGitHub APIエラー | UC-AR-10 | 高 |

### 4.3 オプション組み合わせエッジケース

| ID | エッジケース | カバーするテスト | 優先度 |
|----|------------|----------------|--------|
| EC-14 | `--dry-run` と `--ai-rewrite` 同時指定 | IT-AR-01 | 高 |
| EC-15 | `--skip-pr-update` と `--ai-rewrite` 同時指定 | IT-AR-05 | 高 |
| EC-16 | `--ai-rewrite` のみ指定（`--agent` 未指定、デフォルト auto） | UC-AR-45 | 中 |

---

## 5. テストデータ

### 5.1 メタデータテストデータ

```typescript
// テスト用メタデータ（全フェーズ完了）
const testMetadata = {
  issue_number: '123',
  issue_title: 'feat: Add AI rewrite for finalize PR body',
  issue_url: 'https://github.com/owner/repo/issues/123',
  base_commit: 'abc123def456',
  target_repository: {
    owner: 'owner',
    repo: 'repo',
    path: process.cwd(),
    github_name: 'owner/repo',
    remote_url: 'https://github.com/owner/repo.git',
  },
  phases: {
    planning: { status: 'completed', /* ... */ },
    requirements: { status: 'completed', /* ... */ },
    design: { status: 'completed', /* ... */ },
    test_scenario: { status: 'completed', /* ... */ },
    implementation: { status: 'completed', /* ... */ },
    test_implementation: { status: 'completed', /* ... */ },
    testing: { status: 'completed', /* ... */ },
    documentation: { status: 'completed', /* ... */ },
    report: { status: 'completed', /* ... */ },
    evaluation: { status: 'completed', /* ... */ },
  },
  // 他のフィールドは既存テストと同一
};
```

### 5.2 フェーズ成果物テストデータ

```typescript
// テスト用フェーズ成果物
const testPhaseOutputFiles = {
  'planning.md': '# Planning\n\n## 実装戦略: EXTEND\n\n計画概要テキスト',
  'requirements.md': '# Requirements\n\n## FR-001: AI Rewrite\n\n要件テキスト',
  'design.md': '# Design\n\n## アーキテクチャ\n\n設計テキスト',
  'test-scenario.md': '# Test Scenario\n\n## テストケース\n\nシナリオテキスト',
  'implementation.md': '# Implementation\n\n## 変更ファイル\n\n実装テキスト',
  'test-result.md': '# Test Results\n\n## Summary\n\n全テストパス',
  'documentation-update-log.md': '# Documentation\n\n## 更新内容\n\nドキュメントテキスト',
};

// トランケーション用: 15,000文字の成果物
const largePhasOutput = 'A'.repeat(15000);
```

### 5.3 diff テストデータ

```typescript
// 通常サイズdiff
const normalDiff = `diff --git a/src/commands/finalize.ts b/src/commands/finalize.ts
--- a/src/commands/finalize.ts
+++ b/src/commands/finalize.ts
@@ -78,6 +78,9 @@ export interface FinalizeCommandOptions {
+  aiRewrite?: boolean;
+  agent?: 'auto' | 'codex' | 'claude';
+}
-old line
diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
+  .option('--ai-rewrite', 'Rewrite PR body using AI', false)
`;

// 大規模diff（50,000文字超）
const largeDiff = generateLargeDiff(60000); // 60,000文字のdiff生成ヘルパー

// DiffResult モックデータ
const normalDiffResult = { diff: normalDiff, truncated: false, filesChanged: 2 };
const largeDiffResult = { diff: largeDiff, truncated: false, filesChanged: 50 };
const truncatedDiffResult = { diff: 'truncated...', truncated: true, filesChanged: 350 };
```

### 5.4 AI生成PRボディテストデータ

```typescript
// 有効なAI生成PRボディ（日本語）
const validAiGeneratedBody_ja = `## 変更概要

PR Finalize後のPRボディをAIがリライトする機能を追加しました。

Closes #888

## 変更の背景・目的

レビュアー向けに最適化されたPRボディを自動生成するため。

## 主要な変更点

- \`src/commands/finalize.ts\`: AIリライトロジックを追加
- \`src/main.ts\`: --ai-rewrite CLIオプションを追加

## レビュー時の注目ポイント

- フォールバック処理の安全性
- diffトランケーション閾値の妥当性

## テスト結果サマリー

全テストパス（Unit: 48/48, Integration: 7/7）

## 影響範囲

finalize コマンドのみ。既存動作に影響なし。
`;

// 有効なAI生成PRボディ（英語）
const validAiGeneratedBody_en = `## Summary of Changes

Added AI rewrite functionality for finalize PR body.

Closes #888

## Background & Purpose

Auto-generate reviewer-optimized PR body.

## Key Changes

- \`src/commands/finalize.ts\`: Added AI rewrite logic
- \`src/main.ts\`: Added --ai-rewrite CLI option

## Review Focus Points

- Fallback safety
- Diff truncation threshold

## Test Results Summary

All tests passed (Unit: 48/48, Integration: 7/7)

## Impact Scope

finalize command only. No impact on existing behavior.
`;

// 必須セクション欠落の不正PRボディ
const invalidAiGeneratedBody = `## ランダムなヘッダー

これはAIが生成した内容ですが、必須セクションが含まれていません。

## もう一つのヘッダー

追加のテキスト。
`;

// 空のAI出力
const emptyAiOutput: string[] = [];
```

### 5.5 エージェントモックデータ

```typescript
// 成功するClaudeエージェントモック
const successClaudeClient = {
  executeTask: jest.fn().mockResolvedValue([validAiGeneratedBody_ja]),
};

// 失敗するClaudeエージェントモック
const failingClaudeClient = {
  executeTask: jest.fn().mockRejectedValue(new Error('Claude auth error')),
};

// 空結果を返すClaudeエージェントモック
const emptyClaudeClient = {
  executeTask: jest.fn().mockResolvedValue([]),
};

// 成功するCodexエージェントモック
const successCodexClient = {
  executeTask: jest.fn().mockResolvedValue([validAiGeneratedBody_ja]),
};

// 失敗するCodexエージェントモック
const failingCodexClient = {
  executeTask: jest.fn().mockRejectedValue(new Error('Codex error')),
};
```

---

## 6. テスト環境要件

### 6.1 テスト環境

| 環境 | 要件 |
|------|------|
| **ランタイム** | Node.js 20以上 |
| **テストフレームワーク** | Jest（既存の `jest.config.ts` に従う） |
| **TypeScript** | プロジェクトの `tsconfig.json` に従うバージョン |
| **ファイルシステム** | テスト用一時ディレクトリの作成・削除が可能 |

### 6.2 モック/スタブの必要性

| 対象 | モック方法 | 理由 |
|------|-----------|------|
| `simple-git` | `jest.mock('simple-git')` | Gitコマンドの実行を避ける |
| `GitManager` | `jest.mock('../../src/core/git-manager.js')` | ファイル削除・コミット・プッシュを避ける |
| `ArtifactCleaner` | `jest.mock('../../src/phases/cleanup/artifact-cleaner.js')` | 実際のファイル削除を避ける |
| `GitHubClient` / `PullRequestClient` | `jest.mock('../../src/core/github-client.js')` | GitHub API呼び出しを避ける |
| `agent-setup.ts` | `jest.mock('../../src/commands/execute/agent-setup.js')` | エージェント認証・初期化を避ける |
| `PromptLoader` | `jest.mock('../../src/core/prompt-loader.js')` | 実プロンプトファイルへの依存を避ける |
| `config` | `jest.mock('../../src/core/config.js')` | 環境変数への依存を避ける |
| `logger` | `jest.mock('../../src/utils/logger.js')` | ログ出力のキャプチャ・検証 |
| `fs` | `jest.spyOn(fs, 'readFileSync')` 等 | ファイルI/Oの制御（一部テストケース） |
| `MetadataManager` | 実インスタンス（テスト用JSONファイル作成） | 既存テストパターンに従う |

### 6.3 テストファイル構成

```
tests/
├── unit/
│   └── commands/
│       ├── finalize.test.ts               ← 既存（拡張: UC-AR-43〜48 追加）
│       └── finalize-ai-rewrite.test.ts    ← 新規（UC-AR-01〜42）
└── integration/
    └── finalize-command.test.ts           ← 既存（拡張: IT-AR-01〜07 追加）
```

### 6.4 テスト実行コマンド

```bash
# ユニットテストのみ
npm run test:unit -- --testPathPattern="finalize"

# 新規AIリライトテストのみ
npm run test:unit -- --testPathPattern="finalize-ai-rewrite"

# 統合テストのみ
npm run test:integration -- --testPathPattern="finalize-command"

# 全テスト
npm run test:unit && npm run test:integration

# バリデーション（lint + test + build）
npm run validate
```

---

## 7. 要件トレーサビリティマトリクス

### 7.1 機能要件 → テストケースマッピング

| 要件ID | 要件名 | テストケース |
|--------|--------|------------|
| FR-001 | `--ai-rewrite` CLIオプション | UC-AR-43, UC-AR-45, IT-AR-02, IT-AR-04 |
| FR-002 | `--agent` CLIオプション | UC-AR-44, IT-AR-06, IT-AR-07 |
| FR-003 | diff情報の取得 | UC-AR-07〜12 |
| FR-004 | フェーズ成果物の収集 | UC-AR-01〜06 |
| FR-005 | AIプロンプトの構築と実行 | UC-AR-16〜18, UC-AR-24〜29, UC-AR-30 |
| FR-006 | PRボディテンプレートの作成 | UC-AR-16（テンプレート読み込み検証） |
| FR-007 | AIプロンプトファイルの作成 | UC-AR-46 |
| FR-008 | AI生成失敗時のフォールバック | UC-AR-25〜27, UC-AR-31〜34, IT-AR-03 |
| FR-009 | 未指定時の既存動作保持 | UC-AR-36, UC-AR-42, UC-AR-47〜48, IT-AR-04 |
| FR-010 | 多言語対応 | UC-AR-17, UC-AR-19〜20, UC-AR-38〜39 |
| FR-011 | dry-runモード対応 | UC-AR-38〜40, IT-AR-01 |

### 7.2 受け入れ基準 → テストケースマッピング

| 受け入れ基準 | テストケース |
|-------------|------------|
| AC-001: `--ai-rewrite` 基本動作 | UC-AR-30, IT-AR-02 |
| AC-002: `--ai-rewrite` 未指定時の既存動作 | UC-AR-36, UC-AR-42, UC-AR-47〜48, IT-AR-04 |
| AC-003: AI生成PRボディの必須セクション | UC-AR-19〜23 |
| AC-004: AI生成失敗時のフォールバック | UC-AR-31〜34, IT-AR-03 |
| AC-005: 大規模diffのトランケーション | UC-AR-08〜09, UC-AR-11〜12 |
| AC-006: フェーズ成果物の部分欠落 | UC-AR-02 |
| AC-007: 全フェーズ成果物が不在 | UC-AR-03 |
| AC-008: 日本語テンプレート・プロンプト | UC-AR-16, UC-AR-19, UC-AR-38 |
| AC-009: 英語テンプレート・プロンプト | UC-AR-17, UC-AR-20, UC-AR-39 |
| AC-010: `--dry-run` との組み合わせ | UC-AR-38〜40, IT-AR-01 |
| AC-011: `--skip-pr-update` との組み合わせ | IT-AR-05 |
| AC-012: エージェント認証情報未設定時 | UC-AR-34 |
| AC-013: ビルド・デプロイの正常性 | （ビルド検証は `npm run validate` で実施） |
| AC-014: 既存テストの回帰なし | UC-AR-47〜48, IT-AR-04 |

---

## 8. 品質ゲートチェックリスト（Phase 3: テストシナリオ）

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に基づき、ユニットテスト（48ケース）と統合テスト（7ケース）を設計済み。BOTH_TEST 戦略に基づき、既存テスト拡張と新規テスト作成の両方を計画済み
- [x] **主要な正常系がカバーされている**: 全11件の機能要件（FR-001〜FR-011）に対応するテストケースが存在する。AIリライト成功フロー（UC-AR-30, IT-AR-02）、diff取得正常系（UC-AR-07）、成果物収集正常系（UC-AR-01）、プロンプト構築正常系（UC-AR-16）、エージェント実行正常系（UC-AR-24）をカバー
- [x] **主要な異常系がカバーされている**: フォールバックチェーン全体（UC-AR-31〜34）、エージェント失敗（UC-AR-25〜27）、diff取得失敗（UC-AR-10）、成果物不在（UC-AR-02〜03）、認証エラー（UC-AR-34）、必須セクション欠落（UC-AR-33）をカバー
- [x] **期待結果が明確である**: 全テストケースに具体的な期待結果（戻り値、関数呼び出し、ログ出力）を記載済み。曖昧な表現（「正しく動作する」等）は使用していない
