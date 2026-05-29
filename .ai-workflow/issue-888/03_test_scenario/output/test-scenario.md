# テストシナリオ: Issue #888

## PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装

---

## 0. 前フェーズ成果物の確認

### Planning Document の方針

Planning Document（`.ai-workflow/issue-888/00_planning/output/planning.md`）で策定された以下の方針を本テストシナリオに反映する。

- **実装戦略**: EXTEND（既存の `src/commands/finalize.ts` への機能拡張が中心）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋統合テストの組み合わせ）
- **テストコード戦略**: BOTH_TEST（既存テストファイルの拡充＋新規テストファイル作成）
- **複雑度**: 中程度（主要実装は完了済み、テスト拡充・ドキュメント更新が主な残作業）

### 要件定義書との整合性

要件定義書（`.ai-workflow/issue-888/01_requirements/output/requirements.md`）で定義されたFR-001〜FR-013の機能要件、NFR-001〜NFR-006の非機能要件、AC-001〜AC-012の受け入れ基準を本テストシナリオに反映している。

### 設計書との整合性

設計書（`.ai-workflow/issue-888/02_design/output/design.md`）で定義されたテスト設計（§10）の関数別テストケース一覧、モック戦略、テストファイル構成を基盤としている。

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION**（ユニットテスト＋統合テスト）

### 1.2 テスト対象の範囲

| カテゴリ | テスト対象 | テスト種別 |
|---|---|---|
| AIリライトヘルパー関数 | `collectPhaseOutputs()`, `getDiffForPrompt()`, `buildPromptContext()`, `validateRequiredSections()`, `executeAgentTask()`, `extractDiffFileSummary()` | ユニットテスト |
| AIリライトオーケストレーション | `generateAiRewrittenPrBody()` | ユニットテスト |
| ドライランモード | `previewFinalize()`（AIリライト表示） | ユニットテスト |
| エンドツーエンドフロー | `handleFinalizeCommand()` + `--ai-rewrite` 有効時の全体フロー | 統合テスト |
| 後方互換性 | `--ai-rewrite` 未指定時の従来動作維持 | 統合テスト |

### 1.3 テストの目的

1. AIリライト機能の各ヘルパー関数が仕様通りに動作することを検証する（正常系・異常系・境界値）
2. AIリライト機能の統合フロー（CLI → finalize → AIリライト → PR更新）が正しく連携することを検証する
3. `--ai-rewrite` 未指定時に従来の finalize 動作が100%維持されることを検証する（後方互換性: FR-009）
4. フォールバックチェーン（Claude → Codex → 従来PRボディ）が正しく機能することを検証する

### 1.4 テストファイル構成

| ファイル | 種別 | 作成方針 | テストケース数（推定） |
|---|---|---|---|
| `tests/unit/commands/finalize-ai-rewrite.test.ts` | ユニットテスト | **新規作成** | 29件 |
| `tests/unit/commands/finalize.test.ts` | ユニットテスト | **既存拡張** | +2件 |
| `tests/integration/finalize-command.test.ts` | 統合テスト | **既存拡張** | +3件 |
| **合計** | | | **34件** |

---

## 2. ユニットテストシナリオ

### 2.1 `collectPhaseOutputs()` — フェーズ成果物収集（FR-004）

#### UT-AR-001: collectPhaseOutputs_正常系_全フェーズ成果物が存在する場合

- **目的**: 7つのフェーズ成果物ファイルがすべて存在する場合に、全件読み込みが成功することを検証する
- **対応要件**: FR-004, AC-007
- **前提条件**:
  - `.ai-workflow/issue-<NUM>/` 配下に7つのフェーズ出力ファイルが存在する
  - 各ファイルは10,000文字以内の有効なMarkdownテキスト
- **入力**:
  - `metadataManager`: `workflowDir` が `.ai-workflow/issue-123/` を指す MetadataManager インスタンス
- **期待結果**:
  - `outputs` マップに7つのエントリが含まれる（`planning`, `requirements`, `design`, `test_scenario`, `implementation`, `test_result`, `documentation`）
  - `collectedCount` が `7` である
  - `totalCount` が `7` である
  - 各エントリの値がファイルの内容と一致する
- **テストデータ**:
  - 各フェーズのファイルに `# Phase: <phase_name>\nTest content for <phase_name>` を書き込む
- **モック**:
  - `fs.existsSync` → 全ファイルに対して `true` を返す
  - `fs.readFileSync` → 各ファイルの内容を返す

---

#### UT-AR-002: collectPhaseOutputs_正常系_一部フェーズ成果物が欠損している場合

- **目的**: 一部のフェーズ成果物ファイルが存在しない場合に、フォールバックテキストが設定されることを検証する
- **対応要件**: FR-004
- **前提条件**:
  - 7つのフェーズ出力ファイルのうち、`planning`, `design`, `implementation` の3つのみが存在する
  - 残りの4ファイルは存在しない
- **入力**:
  - `metadataManager`: 上記条件を満たすファイルシステム環境の MetadataManager
- **期待結果**:
  - `outputs` マップに7つのエントリが含まれる（欠損ファイルもエントリは存在する）
  - 存在するファイル（`planning`, `design`, `implementation`）のエントリ値がファイルの内容と一致する
  - 存在しないファイルのエントリ値が `'（このフェーズの成果物は利用できません）'` である
  - `collectedCount` が `3` である
  - `totalCount` が `7` である
- **モック**:
  - `fs.existsSync` → 3つのファイルに対して `true`、残り4つに対して `false` を返す
  - `fs.readFileSync` → 存在する3ファイルの内容を返す

---

#### UT-AR-003: collectPhaseOutputs_正常系_全フェーズ成果物が存在しない場合

- **目的**: すべてのフェーズ成果物ファイルが存在しない場合に、全件がフォールバックテキストになることを検証する
- **対応要件**: FR-004
- **前提条件**:
  - 7つのフェーズ出力ファイルがすべて存在しない
- **入力**:
  - `metadataManager`: ファイルが存在しないファイルシステム環境の MetadataManager
- **期待結果**:
  - `outputs` マップの全7エントリの値が `'（このフェーズの成果物は利用できません）'` である
  - `collectedCount` が `0` である
  - `totalCount` が `7` である
- **モック**:
  - `fs.existsSync` → 全ファイルに対して `false` を返す

---

#### UT-AR-004: collectPhaseOutputs_境界値_成果物が10,000文字を超える場合

- **目的**: フェーズ成果物の内容が `MAX_PHASE_OUTPUT_LENGTH`（10,000文字）を超える場合に、切り詰めと省略メッセージの付加が正しく行われることを検証する
- **対応要件**: FR-004, AC-010, NFR-003
- **前提条件**:
  - `planning` の成果物ファイルが15,000文字のテキスト
  - 他のファイルは5,000文字（通常サイズ）
- **入力**:
  - `metadataManager`: 上記条件を満たすファイルシステム環境の MetadataManager
- **期待結果**:
  - `planning` エントリの値が先頭10,000文字 + `'\n\n... (以降省略)'` である
  - `planning` エントリの値の長さが `10,000 + '\n\n... (以降省略)'.length` である
  - 他のファイルのエントリ値は元の内容（5,000文字）のまま
  - `collectedCount` は存在するファイル数
- **テストデータ**:
  - `'A'.repeat(15_000)` （15,000文字の文字列）
- **モック**:
  - `fs.readFileSync` → `planning` に対して15,000文字のテキストを返す

---

#### UT-AR-005: collectPhaseOutputs_異常系_ファイル読み込みエラー

- **目的**: ファイルの読み込み中にエラーが発生した場合に、エラーフォールバックテキストが設定され、警告ログが出力されることを検証する
- **対応要件**: FR-004
- **前提条件**:
  - `design` の成果物ファイルは存在するが、読み込み時に権限エラーが発生する
- **入力**:
  - `metadataManager`: 上記条件を満たすファイルシステム環境の MetadataManager
- **期待結果**:
  - `design` エントリの値が `'（このフェーズの成果物の読み込みに失敗しました）'` である
  - `logger.warn` が `"Failed to read phase output 'design': ..."` メッセージで呼び出される
  - エラーが上位に伝播しない（関数は正常に完了する）
  - 他の正常なファイルは問題なく読み込まれる
- **モック**:
  - `fs.existsSync` → `design` に対して `true` を返す
  - `fs.readFileSync` → `design` に対して `Error('EACCES: permission denied')` をスロー

---

### 2.2 `getDiffForPrompt()` — diff取得・トランケーション（FR-003）

#### UT-AR-006: getDiffForPrompt_正常系_小規模diff

- **目的**: diff文字数が50,000文字未満かつ変更ファイル数が300以下の場合に、diff全文が返却されることを検証する
- **対応要件**: FR-003
- **前提条件**:
  - PRのdiffが5,000文字、変更ファイル数が10ファイル
- **入力**:
  - `prClient`: `getPullRequestDiff` がモック化された PullRequestClient
  - `prNumber`: `456`
- **期待結果**:
  - `content` がdiff全文と一致する
  - `wasTruncated` が `false` である
  - `filesChanged` が `10` である
- **テストデータ**:
  ```
  diff --git a/src/foo.ts b/src/foo.ts
  +const x = 1;
  diff --git a/src/bar.ts b/src/bar.ts
  -const old = true;
  +const new_val = false;
  ```
- **モック**:
  - `prClient.getPullRequestDiff` → `{ diff: '<5,000文字のdiff>', truncated: false, filesChanged: 10 }` を返す

---

#### UT-AR-007: getDiffForPrompt_境界値_大規模diff（50,000文字超）

- **目的**: diff文字数が50,000文字を超える場合に、ファイルサマリーのみが返却され、`wasTruncated` が `true` になることを検証する
- **対応要件**: FR-003, AC-006, NFR-003
- **前提条件**:
  - PRのdiffが60,000文字、変更ファイル数が50ファイル
- **入力**:
  - `prClient`: 大規模diffを返すモック化された PullRequestClient
  - `prNumber`: `456`
- **期待結果**:
  - `content` にトランケーション注記（`diffが大規模（60,000 文字）なためサマリーのみ提供しています。`）が含まれる
  - `content` に `### 変更ファイル一覧` セクションが含まれる
  - `wasTruncated` が `true` である
  - `filesChanged` が `50` である
- **テストデータ**:
  - `'A'.repeat(60_000)` を含むdiffテキスト（`diff --git` ヘッダー付き）
- **モック**:
  - `prClient.getPullRequestDiff` → `{ diff: '<60,000文字のdiff>', truncated: false, filesChanged: 50 }` を返す

---

#### UT-AR-008: getDiffForPrompt_境界値_大規模diff（300ファイル超）

- **目的**: 変更ファイル数が300を超える場合に、ファイルサマリーのみが返却され、`wasTruncated` が `true` になることを検証する
- **対応要件**: FR-003, AC-006, NFR-003
- **前提条件**:
  - PRのdiffが10,000文字、変更ファイル数が350ファイル
- **入力**:
  - `prClient`: 300ファイル超の結果を返すモック化された PullRequestClient
  - `prNumber`: `456`
- **期待結果**:
  - `content` にトランケーション注記（`このPRは 350 ファイルを変更しています（300ファイル超）。`）が含まれる
  - `wasTruncated` が `true` である
  - `filesChanged` が `350` である
- **モック**:
  - `prClient.getPullRequestDiff` → `{ diff: '<10,000文字のdiff>', truncated: true, filesChanged: 350 }` を返す

---

#### UT-AR-009: getDiffForPrompt_異常系_GitHub APIエラー

- **目的**: diff取得時にGitHub APIエラーが発生した場合に、フォールバックDiffContextが返却されることを検証する
- **対応要件**: FR-003
- **前提条件**:
  - GitHub APIが500エラーを返す
- **入力**:
  - `prClient`: `getPullRequestDiff` がエラーをスローするモック
  - `prNumber`: `456`
- **期待結果**:
  - `content` が `'（diff情報の取得に失敗しました。フェーズ成果物のみでPRボディを生成します。）'` である
  - `wasTruncated` が `false` である
  - `filesChanged` が `0` である
  - `logger.warn` が `"Failed to get PR diff: ..."` メッセージで呼び出される
  - エラーが上位に伝播しない
- **モック**:
  - `prClient.getPullRequestDiff` → `Error('GitHub API error: 500 Internal Server Error')` をスロー

---

#### UT-AR-010: extractDiffFileSummary_正常系_パース正確性

- **目的**: `extractDiffFileSummary()` がdiffテキストからファイル名と追加/削除行数を正確にパースすることを検証する
- **対応要件**: FR-003
- **前提条件**:
  - 3ファイルの変更を含む標準的なgit diffテキスト
- **入力**:
  ```
  diff --git a/src/foo.ts b/src/foo.ts
  --- a/src/foo.ts
  +++ b/src/foo.ts
  +line1
  +line2
  -removed1
  diff --git a/src/bar.ts b/src/bar.ts
  --- a/src/bar.ts
  +++ b/src/bar.ts
  +added
  diff --git a/README.md b/README.md
  --- a/README.md
  +++ b/README.md
  -old line
  -old line2
  +new line
  ```
- **期待結果**:
  - 出力に `### 変更ファイル一覧（3 ファイル）` ヘッダーが含まれる
  - `- src/foo.ts: +2 -1` が含まれる
  - `- src/bar.ts: +1 -0` が含まれる
  - `- README.md: +1 -2` が含まれる

---

### 2.3 `buildPromptContext()` — プロンプトコンテキスト構築（FR-005）

#### UT-AR-011: buildPromptContext_正常系_全プレースホルダー置換

- **目的**: 5つのプレースホルダー（`{issue_number}`, `{issue_title}`, `{diff_content}`, `{phase_outputs}`, `{template_structure}`）がすべて正しく置換されることを検証する
- **対応要件**: FR-005, NFR-002
- **前提条件**:
  - `PromptLoader.loadPrompt` がプレースホルダーを含むプロンプトテンプレートを返す
  - `PromptLoader.loadTemplate` がPRボディテンプレートを返す
- **入力**:
  - `issueNumber`: `888`
  - `issueTitle`: `'⚡ PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装'`
  - `diffContext`: `{ content: 'diff --git a/foo.ts...', wasTruncated: false, filesChanged: 5 }`
  - `phaseOutputs`: `{ outputs: { planning: '# Planning\nContent...', design: '# Design\nContent...' }, collectedCount: 2, totalCount: 7 }`
  - `language`: `'ja'`
- **期待結果**:
  - 返却されたプロンプト文字列に `{issue_number}` が含まれず、`888` が含まれる
  - 返却されたプロンプト文字列に `{issue_title}` が含まれず、Issue タイトルが含まれる
  - 返却されたプロンプト文字列に `{diff_content}` が含まれず、diff テキストが含まれる
  - 返却されたプロンプト文字列に `{phase_outputs}` が含まれず、フェーズ成果物テキストが含まれる
  - 返却されたプロンプト文字列に `{template_structure}` が含まれず、テンプレート構造が含まれる
  - `replaceAll()` が使用されている（ReDoS防止: NFR-002）
- **モック**:
  - `PromptLoader.loadPrompt('finalize', 'rewrite_pr_body', 'ja')` → `'Issue #{issue_number}: {issue_title}\nDiff:\n{diff_content}\nOutputs:\n{phase_outputs}\nTemplate:\n{template_structure}'` を返す
  - `PromptLoader.loadTemplate('pr_body_finalize_template.md', 'ja')` → `'## 変更概要\n{summary}'` を返す

---

#### UT-AR-012: buildPromptContext_正常系_フェーズ成果物の結合テキスト

- **目的**: フェーズ成果物が `'### <phase>\n\n<content>'` 形式で `---` 区切りで結合されることを検証する
- **対応要件**: FR-005
- **前提条件**:
  - 複数のフェーズ成果物が CollectedPhaseOutputs に含まれる
- **入力**:
  - `phaseOutputs`: `{ outputs: { planning: 'Planning content', requirements: 'Requirements content', design: 'Design content' }, collectedCount: 3, totalCount: 7 }`
- **期待結果**:
  - プロンプト内のフェーズ成果物セクションに `### planning\n\nPlanning content` が含まれる
  - プロンプト内のフェーズ成果物セクションに `### requirements\n\nRequirements content` が含まれる
  - 各フェーズ成果物が `\n\n---\n\n` で区切られている
- **モック**:
  - `PromptLoader.loadPrompt` → `'{phase_outputs}'` を返す（プレースホルダーのみ）

---

#### UT-AR-013: buildPromptContext_正常系_言語別テンプレート読み込み

- **目的**: `language` パラメータに応じて対応する言語のプロンプトとテンプレートが読み込まれることを検証する
- **対応要件**: FR-005, NFR-004, AC-008
- **前提条件**:
  - 日本語・英語のプロンプト/テンプレートが両方存在する
- **入力（テスト1: 日本語）**:
  - `language`: `'ja'`
- **入力（テスト2: 英語）**:
  - `language`: `'en'`
- **期待結果（日本語）**:
  - `PromptLoader.loadPrompt` が `('finalize', 'rewrite_pr_body', 'ja')` で呼び出される
  - `PromptLoader.loadTemplate` が `('pr_body_finalize_template.md', 'ja')` で呼び出される
- **期待結果（英語）**:
  - `PromptLoader.loadPrompt` が `('finalize', 'rewrite_pr_body', 'en')` で呼び出される
  - `PromptLoader.loadTemplate` が `('pr_body_finalize_template.md', 'en')` で呼び出される
- **モック**:
  - `PromptLoader.loadPrompt` → 言語に応じたテンプレートを返す
  - `PromptLoader.loadTemplate` → 言語に応じたテンプレートを返す

---

### 2.4 `validateRequiredSections()` — 必須セクション検証（FR-008）

#### UT-AR-014: validateRequiredSections_正常系_日本語_変更概要を含む

- **目的**: 日本語PRボディに `変更概要` セクションが含まれる場合に `true` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## 変更概要\n\nこのPRは認証機能を追加します。\n\n## テスト結果'`
  - `language`: `'ja'`
- **期待結果**: `true`

---

#### UT-AR-015: validateRequiredSections_正常系_日本語_主要な変更点を含む

- **目的**: 日本語PRボディに `主要な変更点` セクションが含まれる場合に `true` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## 主要な変更点\n\n- ファイルA の更新\n- ファイルB の追加'`
  - `language`: `'ja'`
- **期待結果**: `true`

---

#### UT-AR-016: validateRequiredSections_異常系_日本語_必須セクション不在

- **目的**: 日本語PRボディに必須セクション（`変更概要`、`主要な変更点`）がいずれも含まれない場合に `false` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## テスト結果\n\nすべてのテストが通過しました。\n\n## 影響範囲\nなし'`
  - `language`: `'ja'`
- **期待結果**: `false`

---

#### UT-AR-017: validateRequiredSections_正常系_英語_Summaryを含む

- **目的**: 英語PRボディに `Summary` セクションが含まれる場合に `true` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## Summary\n\nThis PR adds authentication feature.\n\n## Test Results'`
  - `language`: `'en'`
- **期待結果**: `true`

---

#### UT-AR-018: validateRequiredSections_正常系_英語_Key Changesを含む

- **目的**: 英語PRボディに `Key Changes` セクションが含まれる場合に `true` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## Key Changes\n\n- Updated file A\n- Added file B'`
  - `language`: `'en'`
- **期待結果**: `true`

---

#### UT-AR-019: validateRequiredSections_異常系_英語_必須セクション不在

- **目的**: 英語PRボディに必須セクション（`Summary`、`Key Changes`）がいずれも含まれない場合に `false` が返されることを検証する
- **対応要件**: FR-008, AC-005
- **入力**:
  - `body`: `'## Test Results\n\nAll tests passed.\n\n## Impact\nNone'`
  - `language`: `'en'`
- **期待結果**: `false`

---

### 2.5 `executeAgentTask()` — エージェント実行・フォールバック（FR-007）

#### UT-AR-020: executeAgentTask_正常系_Claude成功

- **目的**: Claudeエージェントが正常に応答を返す場合に、Claude の出力メッセージが返却されることを検証する
- **対応要件**: FR-007, AC-001
- **前提条件**:
  - ClaudeAgentClient が有効（非null）
  - CodexAgentClient が有効（非null）
- **入力**:
  - `prompt`: `'Generate PR body for issue #888'`
  - `claudeClient`: `executeTask` が `['## 変更概要\nAI生成内容']` を返すモック
  - `codexClient`: 有効なモック（呼び出されない想定）
- **期待結果**:
  - 返り値が `['## 変更概要\nAI生成内容']` である
  - `claudeClient.executeTask` が `{ prompt, maxTurns: 30 }` で呼び出される
  - `codexClient.executeTask` は呼び出されない
- **モック**:
  - `claudeClient.executeTask` → `['## 変更概要\nAI生成内容']` を返す

---

#### UT-AR-021: executeAgentTask_正常系_Claude失敗→Codex成功

- **目的**: Claudeエージェントが例外をスローし、Codexエージェントが正常に応答を返す場合に、Codex の出力メッセージが返却されることを検証する
- **対応要件**: FR-007, AC-003
- **前提条件**:
  - ClaudeAgentClient が有効だが実行失敗
  - CodexAgentClient が有効で実行成功
- **入力**:
  - `prompt`: `'Generate PR body for issue #888'`
  - `claudeClient`: `executeTask` がエラーをスローするモック
  - `codexClient`: `executeTask` が `['## Summary\nCodex-generated content']` を返すモック
- **期待結果**:
  - 返り値が `['## Summary\nCodex-generated content']` である
  - `logger.warn` が `"Claude agent failed: ... Trying Codex..."` メッセージで呼び出される
  - `codexClient.executeTask` が `{ prompt, maxTurns: 30 }` で呼び出される
- **モック**:
  - `claudeClient.executeTask` → `Error('API rate limit exceeded')` をスロー
  - `codexClient.executeTask` → `['## Summary\nCodex-generated content']` を返す

---

#### UT-AR-022: executeAgentTask_正常系_Claude空結果→Codex成功

- **目的**: Claudeエージェントが空の結果を返し、Codexエージェントが正常に応答を返す場合に、Codex の出力メッセージが返却されることを検証する
- **対応要件**: FR-007
- **前提条件**:
  - ClaudeAgentClient が有効だが空結果を返す
  - CodexAgentClient が有効で実行成功
- **入力**:
  - `prompt`: `'Generate PR body for issue #888'`
  - `claudeClient`: `executeTask` が `[]`（空配列）を返すモック
  - `codexClient`: `executeTask` が `['## 主要な変更点\n- 認証機能の追加']` を返すモック
- **期待結果**:
  - 返り値が `['## 主要な変更点\n- 認証機能の追加']` である
  - `logger.warn` が `"Claude agent returned empty result. Trying Codex..."` メッセージで呼び出される
  - `codexClient.executeTask` が呼び出される
- **モック**:
  - `claudeClient.executeTask` → `[]` を返す
  - `codexClient.executeTask` → `['## 主要な変更点\n- 認証機能の追加']` を返す

---

#### UT-AR-023: executeAgentTask_異常系_両方失敗

- **目的**: Claudeエージェントと Codexエージェントの両方が失敗した場合に、Errorがスローされることを検証する
- **対応要件**: FR-007, AC-003
- **前提条件**:
  - ClaudeAgentClient と CodexAgentClient の両方が有効だが実行失敗
- **入力**:
  - `prompt`: `'Generate PR body for issue #888'`
  - `claudeClient`: `executeTask` がエラーをスローするモック
  - `codexClient`: `executeTask` がエラーをスローするモック
- **期待結果**:
  - `Error('Both Claude and Codex agents failed to generate PR body')` がスローされる
  - `logger.warn` が Claude と Codex それぞれの失敗メッセージで呼び出される
- **モック**:
  - `claudeClient.executeTask` → `Error('Claude error')` をスロー
  - `codexClient.executeTask` → `Error('Codex error')` をスロー

---

#### UT-AR-024: executeAgentTask_異常系_両方null（クライアントなし）

- **目的**: ClaudeClient と CodexClient の両方が null の場合に、Errorがスローされることを検証する
- **対応要件**: FR-007
- **入力**:
  - `prompt`: `'Generate PR body for issue #888'`
  - `claudeClient`: `null`
  - `codexClient`: `null`
- **期待結果**:
  - `Error('Both Claude and Codex agents failed to generate PR body')` がスローされる

---

### 2.6 `generateAiRewrittenPrBody()` — 統合オーケストレーション

#### UT-AR-025: generateAiRewrittenPrBody_正常系_AI生成ボディ返却

- **目的**: AIリライトの全フローが正常に完了し、AI生成されたPRボディが返却されることを検証する
- **対応要件**: FR-001, FR-005, FR-007, FR-008, AC-001
- **前提条件**:
  - diff取得成功、プロンプト構築成功、エージェント実行成功、セクション検証成功
- **入力**:
  - `metadataManager`: 有効なメタデータ（`issue_title`, `language` 設定済み）
  - `options`: `{ issue: '888', aiRewrite: true, agent: 'auto' }`
  - `prNumber`: `456`
  - `prClient`: diff を返すモック
  - `collectedOutputs`: 正常なフェーズ成果物
  - `fallbackBody`: `'## 変更サマリー\n従来のPRボディ'`
- **期待結果**:
  - 返り値がAI生成されたPRボディ文字列である（`fallbackBody` ではない）
  - 返り値に必須セクション（`変更概要` or `主要な変更点`）が含まれる
  - `logger.info` が `"AI rewrite of PR body completed successfully."` で呼び出される
- **モック**:
  - `getDiffForPrompt` → 正常な DiffContext を返す
  - `buildPromptContext` → プロンプト文字列を返す
  - `resolveAgentCredentials` → 有効な認証情報を返す
  - `setupAgentClients` → 有効な claudeClient/codexClient を返す
  - `executeAgentTask` → `['## 変更概要\nAI生成内容\n\n## 主要な変更点\n- 変更1']` を返す
  - `validateRequiredSections` → `true` を返す

---

#### UT-AR-026: generateAiRewrittenPrBody_異常系_認証情報なし

- **目的**: エージェント認証情報が一切設定されていない場合に、フォールバックPRボディが返却されることを検証する
- **対応要件**: FR-009, AC-004
- **前提条件**:
  - `setupAgentClients` が両方のクライアントを null で返す
- **入力**:
  - `fallbackBody`: `'## 変更サマリー\n従来のPRボディ'`
- **期待結果**:
  - 返り値が `fallbackBody` と一致する
  - `logger.warn` が `"No agent credentials available. Falling back to default PR body."` で呼び出される
- **モック**:
  - `setupAgentClients` → `{ claudeClient: null, codexClient: null }` を返す

---

#### UT-AR-027: generateAiRewrittenPrBody_異常系_エージェント両方失敗

- **目的**: Claude と Codex の両方が失敗した場合に、フォールバックPRボディが返却されることを検証する
- **対応要件**: FR-009, AC-003
- **前提条件**:
  - `executeAgentTask` がエラーをスローする
- **入力**:
  - `fallbackBody`: `'## 変更サマリー\n従来のPRボディ'`
- **期待結果**:
  - 返り値が `fallbackBody` と一致する
  - `logger.warn` が `"AI rewrite failed: ... Falling back to default PR body."` で呼び出される
- **モック**:
  - `executeAgentTask` → `Error('Both Claude and Codex agents failed')` をスロー

---

#### UT-AR-028: generateAiRewrittenPrBody_異常系_必須セクション検証失敗

- **目的**: AI生成されたPRボディが必須セクション検証に失敗した場合に、フォールバックPRボディが返却されることを検証する
- **対応要件**: FR-008, FR-009, AC-005
- **前提条件**:
  - エージェントは応答を返すが、必須セクションが含まれていない
- **入力**:
  - `fallbackBody`: `'## 変更サマリー\n従来のPRボディ'`
- **期待結果**:
  - 返り値が `fallbackBody` と一致する
  - `logger.warn` が `"AI-generated PR body missing required sections. Falling back to default PR body."` で呼び出される
- **モック**:
  - `executeAgentTask` → `['これは必須セクションを含まないテキストです。']` を返す
  - `validateRequiredSections` → `false` を返す

---

#### UT-AR-029: generateAiRewrittenPrBody_異常系_空出力

- **目的**: AIエージェントが空の出力を返した場合に、フォールバックPRボディが返却されることを検証する
- **対応要件**: FR-009
- **前提条件**:
  - エージェントは空文字列のメッセージを返す
- **入力**:
  - `fallbackBody`: `'## 変更サマリー\n従来のPRボディ'`
- **期待結果**:
  - 返り値が `fallbackBody` と一致する
  - `logger.warn` が `"AI agent returned empty output. Falling back to default PR body."` で呼び出される
- **モック**:
  - `executeAgentTask` → `['', '  ']` を返す（結合後にtrimすると空文字列になる）

---

### 2.7 ドライランモード — `previewFinalize()` AIリライト表示（FR-011）

※ 以下のテストケースは既存の `tests/unit/commands/finalize.test.ts` に追加する。

#### UT-AR-030: previewFinalize_正常系_AIリライト有効時の日本語表示

- **目的**: `--ai-rewrite --dry-run` 指定時に、日本語のAIリライト有効メッセージがプレビューに表示されることを検証する
- **対応要件**: FR-011, AC-009
- **前提条件**:
  - メタデータの言語設定が `ja`
- **入力**:
  - `options`: `{ issue: '123', dryRun: true, aiRewrite: true, agent: 'auto' }`
- **期待結果**:
  - `logger.info` が `'  4. PR更新: AI リライトが有効（エージェント: auto）'` で呼び出される
  - 実際のAIリライト処理は実行されない
  - PR本文は更新されない

---

#### UT-AR-031: previewFinalize_正常系_AIリライト有効時の英語表示

- **目的**: `--ai-rewrite --dry-run --agent claude` 指定時に、英語のAIリライト有効メッセージがプレビューに表示されることを検証する
- **対応要件**: FR-011, AC-009
- **前提条件**:
  - メタデータの言語設定が `en`
- **入力**:
  - `options`: `{ issue: '123', dryRun: true, aiRewrite: true, agent: 'claude' }`
- **期待結果**:
  - `logger.info` が `'  4. PR Update: AI rewrite enabled (agent: claude)'` で呼び出される
  - 実際のAIリライト処理は実行されない

---

## 3. 統合テストシナリオ

※ 以下のテストケースは既存の `tests/integration/finalize-command.test.ts` に追加する。

### 3.1 AIリライトフロー — 正常系

#### IT-AR-001: AIリライト統合テスト_正常系_全フロー

- **目的**: `--ai-rewrite` 有効時にAIリライトフローが正常に実行され、AI生成されたPRボディでPRが更新されることを検証する
- **対応要件**: FR-001, FR-003, FR-004, FR-005, FR-007, FR-008, AC-001
- **シナリオ名**: handleFinalizeCommand + AI Rewrite 全フロー
- **前提条件**:
  - ワークフローが初期化済み（メタデータに `base_commit`, `pr_number`, `target_repository` が設定済み）
  - `.ai-workflow/issue-<NUM>/` 配下にフェーズ成果物ファイルが存在する
  - エージェント認証情報が設定済み（モック）
  - GitHub API がモック化されている
- **テスト手順**:
  1. テスト用メタデータファイルを作成する（`base_commit`, `pr_number`, `target_repository` 含む）
  2. テスト用フェーズ成果物ファイルを作成する（最低限 `planning.md`, `design.md`）
  3. 以下のオプションで `handleFinalizeCommand` を呼び出す:
     ```
     { issue: '888', aiRewrite: true, agent: 'auto', skipSquash: true, baseBranch: 'main' }
     ```
  4. 各ステップの実行を検証する
- **期待結果**:
  - `collectPhaseOutputs()` がStep 2（`.ai-workflow/` 削除）の**前**に呼び出される（AC-007）
  - `getDiffForPrompt()` が呼び出される
  - `buildPromptContext()` が呼び出される
  - `executeAgentTask()` が呼び出される
  - `validateRequiredSections()` が呼び出される
  - `prClient.updatePullRequest()` がAI生成されたPRボディで呼び出される
  - `prClient.markPRReady()` が呼び出される
  - finalize コマンド全体が正常完了する
- **確認項目**:
  - [x] フェーズ成果物の事前収集タイミングが正しい（Step 2の前）
  - [x] AIリライトフローの全ステップが順次実行される
  - [x] PRがAI生成されたコンテンツで更新される
  - [x] PRがドラフトから ready に変更される
- **モック**:
  - `simple-git`: `revparse` → `'head-before-cleanup'` を返す
  - `GitManager`: `commitWorkflowDeletion`, `pushToRemote`, `getSquashManager` → 成功を返す
  - `ArtifactCleaner`: `cleanupWorkflowArtifacts` → 成功を返す
  - `GitHubClient`: `getPullRequestClient` → diff取得、PR更新、ドラフト解除のモック
  - `agent-setup`: `resolveAgentCredentials` → 有効な認証情報、`setupAgentClients` → 有効なクライアント
  - `ClaudeAgentClient.executeTask` → `['## 変更概要\nAI生成内容\n\n## 主要な変更点\n- 変更1']` を返す

---

### 3.2 後方互換性 — 従来動作維持

#### IT-AR-002: AIリライト統合テスト_後方互換性_従来動作維持

- **目的**: `--ai-rewrite` が未指定の場合に、従来の `generateFinalPrBody()` によるPRボディが使用されることを検証する
- **対応要件**: FR-009, AC-002
- **シナリオ名**: handleFinalizeCommand + 従来動作
- **前提条件**:
  - ワークフローが初期化済み
  - `--ai-rewrite` オプションが未指定
- **テスト手順**:
  1. テスト用メタデータファイルを作成する
  2. 以下のオプションで `handleFinalizeCommand` を呼び出す:
     ```
     { issue: '123', skipSquash: true, baseBranch: 'main' }
     ```
     （`aiRewrite` は未指定 = `undefined`）
  3. PR更新内容を検証する
- **期待結果**:
  - `collectPhaseOutputs()` が呼び出されない
  - `generateAiRewrittenPrBody()` が呼び出されない
  - `prClient.updatePullRequest()` が従来の `generateFinalPrBody()` 出力で呼び出される
  - PRボディにフェーズステータス（`✅`/`⏳`）、テスト結果、クリーンアップ状況が含まれる
  - AIエージェントは一切呼び出されない
- **確認項目**:
  - [x] AIリライト関連の関数が呼び出されない
  - [x] 従来のPRボディが生成される
  - [x] 既存テストケースがリグレッションなく通過する

---

### 3.3 フォールバック — エージェント失敗時

#### IT-AR-003: AIリライト統合テスト_フォールバック_エージェント失敗時

- **目的**: `--ai-rewrite` 指定時にAIエージェントが失敗した場合、従来のPRボディにフォールバックし、finalize コマンド全体が正常完了することを検証する
- **対応要件**: FR-009, AC-003
- **シナリオ名**: handleFinalizeCommand + AI Rewrite フォールバック
- **前提条件**:
  - ワークフローが初期化済み
  - エージェント認証情報は設定済みだが、エージェント実行が失敗する
- **テスト手順**:
  1. テスト用メタデータファイルとフェーズ成果物ファイルを作成する
  2. エージェントクライアントのモックを失敗するように設定する
  3. 以下のオプションで `handleFinalizeCommand` を呼び出す:
     ```
     { issue: '888', aiRewrite: true, agent: 'auto', skipSquash: true, baseBranch: 'main' }
     ```
  4. フォールバック動作を検証する
- **期待結果**:
  - `collectPhaseOutputs()` が呼び出される（成果物収集は試行される）
  - `generateAiRewrittenPrBody()` が呼び出されるが、フォールバックパスに入る
  - `prClient.updatePullRequest()` が従来の `generateFinalPrBody()` 出力で呼び出される
  - `logger.warn` が `"AI rewrite failed: ..."` メッセージで呼び出される
  - finalize コマンド全体が正常完了する（エラー終了しない）
- **確認項目**:
  - [x] AIリライト失敗がfinalize全体をブロックしない
  - [x] 従来のPRボディでPRが更新される
  - [x] 警告ログが出力される
  - [x] PRがドラフトから ready に変更される
- **モック**:
  - `ClaudeAgentClient.executeTask` → `Error('Agent execution failed')` をスロー
  - `CodexAgentClient.executeTask` → `Error('Codex also failed')` をスロー

---

## 4. テストデータ

### 4.1 メタデータテストデータ

```json
{
  "issue_number": "888",
  "issue_title": "⚡ PR Finalize後のPRボディをレビュアー向けに全面リライトする機能の実装",
  "issue_url": "https://github.com/tielec/ai-workflow-agent/issues/888",
  "base_commit": "abc123def456",
  "pr_number": 456,
  "target_repository": {
    "owner": "tielec",
    "repo": "ai-workflow-agent",
    "path": "/workspace",
    "github_name": "tielec/ai-workflow-agent",
    "remote_url": "https://github.com/tielec/ai-workflow-agent.git"
  },
  "current_phase": "evaluation",
  "phases": {
    "planning": { "status": "completed" },
    "requirements": { "status": "completed" },
    "design": { "status": "completed" },
    "test_scenario": { "status": "completed" },
    "implementation": { "status": "completed" },
    "test_implementation": { "status": "completed" },
    "testing": { "status": "completed" },
    "documentation": { "status": "completed" },
    "report": { "status": "completed" },
    "evaluation": { "status": "completed" }
  }
}
```

### 4.2 フェーズ成果物テストデータ

| フェーズ | ファイルパス | テストデータ |
|---|---|---|
| planning | `00_planning/output/planning.md` | `'# Planning\n\n## 概要\n\nテスト用Planning成果物'` |
| requirements | `01_requirements/output/requirements.md` | `'# Requirements\n\n## FR-001\n\nテスト用Requirements成果物'` |
| design | `02_design/output/design.md` | `'# Design\n\n## アーキテクチャ\n\nテスト用Design成果物'` |
| test_scenario | `03_test_scenario/output/test-scenario.md` | `'# Test Scenario\n\n## テストケース\n\nテスト用TestScenario成果物'` |
| implementation | `04_implementation/output/implementation.md` | `'# Implementation\n\n## 実装内容\n\nテスト用Implementation成果物'` |
| test_result | `06_testing/output/test-result.md` | `'# Test Result\n\n## 結果サマリー\n\n全件通過'` |
| documentation | `07_documentation/output/documentation-update-log.md` | `'# Documentation\n\n## 更新内容\n\nCLI_REFERENCE.md更新'` |

### 4.3 Diff テストデータ

#### 小規模diff（UT-AR-006用）

```
diff --git a/src/commands/finalize.ts b/src/commands/finalize.ts
--- a/src/commands/finalize.ts
+++ b/src/commands/finalize.ts
@@ -100,6 +100,10 @@ export interface FinalizeCommandOptions {
+  aiRewrite?: boolean;
+  agent?: 'auto' | 'codex' | 'claude';
diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -506,6 +506,8 @@ program
+  .option('--ai-rewrite', 'Rewrite PR body using AI agent', false)
+  .option('--agent <mode>', 'Agent mode (auto|codex|claude)', 'auto')
```

#### 大規模diff（UT-AR-007用）

- `'A'.repeat(60_000)` を含む diff テキスト（複数の `diff --git` ヘッダー付き）

#### 300ファイル超diff（UT-AR-008用）

- 350個の `diff --git` ヘッダーを含むdiffテキスト

### 4.4 AI生成PRボディ テストデータ

#### 正常系（日本語）

```markdown
## 変更概要

このPRは、`finalize` コマンドに `--ai-rewrite` オプションを追加し、AIエージェントによるPRボディリライト機能を実装します。

Closes #888

## 変更の背景・目的

レビュアーが必要とする情報（変更理由・変更点・テスト結果）を自動生成し、レビュー品質を向上させる。

## 主要な変更点

- `src/commands/finalize.ts`: AIリライトロジックの追加
- `src/main.ts`: CLI オプション `--ai-rewrite`, `--agent` の登録
- `src/templates/{ja,en}/pr_body_finalize_template.md`: テンプレート作成
- `src/prompts/finalize/{ja,en}/rewrite_pr_body.txt`: プロンプト作成

## レビュー時の注目ポイント

- `executeAgentTask()` のフォールバックチェーン実装
- `buildPromptContext()` での ReDoS防止（replaceAll使用）
- フェーズ成果物の事前収集タイミング（Step 2の前）

## テスト結果サマリー

- ユニットテスト: 29件 全件通過
- 統合テスト: 3件 全件通過

## 影響範囲

- `finalize` コマンドのみ。`--ai-rewrite` 未指定時は従来動作を完全保持。
```

#### 正常系（英語）

```markdown
## Summary of Changes

This PR adds the `--ai-rewrite` option to the `finalize` command, enabling AI agent-powered PR body rewriting.

Closes #888

## Background & Purpose

Auto-generate reviewer-focused information to improve review quality.

## Key Changes

- `src/commands/finalize.ts`: Added AI rewrite logic
- `src/main.ts`: Registered `--ai-rewrite`, `--agent` CLI options

## Review Focus Points

- Fallback chain implementation in `executeAgentTask()`
- ReDoS prevention in `buildPromptContext()`

## Test Results Summary

- Unit tests: 29 passed
- Integration tests: 3 passed

## Impact Scope

- Only `finalize` command. Backward compatible when `--ai-rewrite` is not specified.
```

#### 異常系（必須セクション不在）

```markdown
## テスト結果

すべてのテストが通過しました。

## 影響範囲

影響なし。
```

---

## 5. テスト環境要件

### 5.1 実行環境

| 要件 | 仕様 |
|---|---|
| ランタイム | Node.js 20以上 |
| テストフレームワーク | Jest（`@jest/globals` からのインポート） |
| テスト実行コマンド（ユニット） | `npm run test:unit` |
| テスト実行コマンド（統合） | `npm run test:integration` |
| 統合検証コマンド | `npm run validate`（lint + test + build） |

### 5.2 外部サービス・依存のモック化

| 外部依存 | モック方法 | 対象テスト |
|---|---|---|
| GitHub API（PullRequestClient） | `jest.mock` でモジュール単位モック | UT-AR-006〜009, IT-AR-001〜003 |
| Claude エージェント（ClaudeAgentClient） | `jest.fn()` で executeTask をモック | UT-AR-020〜025, IT-AR-001, IT-AR-003 |
| Codex エージェント（CodexAgentClient） | `jest.fn()` で executeTask をモック | UT-AR-020〜024, IT-AR-001, IT-AR-003 |
| エージェント認証（agent-setup） | `jest.mock` でモジュール単位モック | UT-AR-025〜029, IT-AR-001〜003 |
| PromptLoader | `jest.mock` でモジュール単位モック | UT-AR-011〜013 |
| ファイルシステム（fs） | `jest.spyOn` / `jest.mock` | UT-AR-001〜005 |
| simple-git | `jest.mock` でモジュール単位モック | IT-AR-001〜003 |
| GitManager | `jest.mock` でモジュール単位モック | IT-AR-001〜003 |
| ArtifactCleaner | `jest.mock` でモジュール単位モック | IT-AR-001〜003 |
| config | `jest.mock` でモジュール単位モック | UT-AR-025〜029 |

### 5.3 モック戦略のサンプルコード

```typescript
// エージェントクライアントのモック
const mockClaudeClient = {
  executeTask: jest.fn().mockResolvedValue(['## 変更概要\nAI生成内容\n\n## 主要な変更点\n- 変更1']),
};

const mockCodexClient = {
  executeTask: jest.fn().mockResolvedValue(['## Summary\nCodex generated content\n\n## Key Changes\n- Change 1']),
};

// agent-setup のモック
jest.mock('../../src/commands/execute/agent-setup.js', () => ({
  resolveAgentCredentials: jest.fn().mockReturnValue({
    codexApiKey: 'mock-codex-key',
    claudeToken: 'mock-claude-token',
    codexCredentialsPath: null,
  }),
  setupAgentClients: jest.fn().mockReturnValue({
    claudeClient: mockClaudeClient,
    codexClient: mockCodexClient,
  }),
}));

// PromptLoader のモック
jest.mock('../../src/core/prompt-loader.js', () => ({
  PromptLoader: {
    loadPrompt: jest.fn().mockReturnValue(
      'あなたはコードレビューの専門家です。\nIssue #{issue_number}: {issue_title}\nDiff:\n{diff_content}\nOutputs:\n{phase_outputs}\nTemplate:\n{template_structure}'
    ),
    loadTemplate: jest.fn().mockReturnValue(
      '## 変更概要\n{summary}\n\n## 主要な変更点\n{key_changes}'
    ),
  },
}));

// config のモック
jest.mock('../../src/core/config.js', () => ({
  config: {
    getHomeDir: jest.fn().mockReturnValue('/home/test'),
    getLanguage: jest.fn().mockReturnValue('ja'),
    getGitHubToken: jest.fn().mockReturnValue('mock-github-token'),
  },
}));

// PullRequestClient の diff モック
const mockPrClient = {
  getPullRequestDiff: jest.fn().mockResolvedValue({
    diff: 'diff --git a/src/foo.ts b/src/foo.ts\n+const x = 1;',
    truncated: false,
    filesChanged: 5,
  }),
  updatePullRequest: jest.fn().mockResolvedValue({ success: true }),
  markPRReady: jest.fn().mockResolvedValue({ success: true }),
  updateBaseBranch: jest.fn().mockResolvedValue({ success: true }),
  getPullRequestNumber: jest.fn().mockResolvedValue(456),
};
```

---

## 6. テストケースと要件のトレーサビリティ

### 6.1 機能要件 → テストケース対応表

| 機能要件 | 対応テストケース | テスト種別 |
|---|---|---|
| FR-001: `--ai-rewrite` オプション | UT-AR-030, UT-AR-031, IT-AR-001, IT-AR-002 | UT + IT |
| FR-002: `--agent` オプション | UT-AR-030, UT-AR-031 | UT |
| FR-003: diff取得・トランケーション | UT-AR-006, UT-AR-007, UT-AR-008, UT-AR-009, UT-AR-010 | UT |
| FR-004: フェーズ成果物収集 | UT-AR-001, UT-AR-002, UT-AR-003, UT-AR-004, UT-AR-005 | UT |
| FR-005: プロンプトコンテキスト構築 | UT-AR-011, UT-AR-012, UT-AR-013 | UT |
| FR-006: PRボディテンプレート | UT-AR-013 | UT |
| FR-007: エージェント実行・フォールバック | UT-AR-020, UT-AR-021, UT-AR-022, UT-AR-023, UT-AR-024 | UT |
| FR-008: 必須セクション検証 | UT-AR-014, UT-AR-015, UT-AR-016, UT-AR-017, UT-AR-018, UT-AR-019 | UT |
| FR-009: 後方互換性 | UT-AR-026, UT-AR-027, UT-AR-028, UT-AR-029, IT-AR-002, IT-AR-003 | UT + IT |
| FR-010: ユニットテスト追加 | 本テストシナリオ全体 | UT + IT |
| FR-011: ドライラン表示 | UT-AR-030, UT-AR-031 | UT |
| FR-012: ドキュメント更新 | （手動検証） | 手動 |
| FR-013: Jenkinsパラメータ | （Jenkins環境検証） | 手動 |

### 6.2 受け入れ基準 → テストケース対応表

| 受け入れ基準 | 対応テストケース | カバレッジ |
|---|---|---|
| AC-001: AI生成PRボディの出力 | UT-AR-025, IT-AR-001 | ✅ カバー済み |
| AC-002: 従来動作維持 | IT-AR-002 | ✅ カバー済み |
| AC-003: AI生成失敗時のフォールバック | UT-AR-023, UT-AR-027, IT-AR-003 | ✅ カバー済み |
| AC-004: 認証情報未設定時のフォールバック | UT-AR-026 | ✅ カバー済み |
| AC-005: 必須セクション検証失敗時のフォールバック | UT-AR-016, UT-AR-019, UT-AR-028 | ✅ カバー済み |
| AC-006: 大規模diff時のトランケーション | UT-AR-007, UT-AR-008 | ✅ カバー済み |
| AC-007: フェーズ成果物の事前収集 | UT-AR-001, IT-AR-001 | ✅ カバー済み |
| AC-008: 日英テンプレート適用 | UT-AR-013 | ✅ カバー済み |
| AC-009: ドライランモード表示 | UT-AR-030, UT-AR-031 | ✅ カバー済み |
| AC-010: フェーズ成果物の切り詰め | UT-AR-004 | ✅ カバー済み |
| AC-011: CLI_REFERENCE.md更新 | （手動検証） | 📝 手動 |
| AC-012: 全テストの通過 | `npm run validate` | ✅ 自動検証 |

### 6.3 非機能要件 → テストケース対応表

| 非機能要件 | 対応テストケース | 検証方法 |
|---|---|---|
| NFR-001: パフォーマンス（maxTurns: 30） | UT-AR-020, UT-AR-021 | モック引数の `maxTurns` 値を検証 |
| NFR-002: ReDoS防止（replaceAll使用） | UT-AR-011 | プレースホルダー置換が `replaceAll` で行われることをコードレビューで確認 |
| NFR-003: トークン制限（diff: 50,000文字、成果物: 10,000文字） | UT-AR-004, UT-AR-007, UT-AR-008 | 閾値超過時の切り詰め動作を検証 |
| NFR-004: 多言語対応（ja/en） | UT-AR-013, UT-AR-014〜019, UT-AR-030, UT-AR-031 | 言語別の動作を検証 |
| NFR-005: 可用性・信頼性（フォールバック） | UT-AR-026〜029, IT-AR-003 | 各フォールバックパスを検証 |
| NFR-006: 保守性（コーディング規約準拠） | 全テスト | logger, config, getErrorMessage の使用をモック呼び出しで確認 |

---

## 7. テスト実行計画

### 7.1 実行順序

```
Phase 1: ユニットテスト実装 → 実行 → 修正
  ├─ Step 1: finalize-ai-rewrite.test.ts の新規作成（UT-AR-001〜029: 29件）
  ├─ Step 2: finalize.test.ts への追加（UT-AR-030〜031: 2件）
  └─ Step 3: npm run test:unit で全ユニットテスト実行

Phase 2: 統合テスト実装 → 実行 → 修正
  ├─ Step 4: finalize-command.test.ts への追加（IT-AR-001〜003: 3件）
  └─ Step 5: npm run test:integration で全統合テスト実行

Phase 3: 統合検証
  └─ Step 6: npm run validate（lint + test:unit + test:integration + build）
```

### 7.2 テスト完了基準

| 基準 | 条件 |
|---|---|
| ユニットテスト通過率 | 100%（全31件通過） |
| 統合テスト通過率 | 100%（全3件通過） |
| `npm run validate` | 全ステップ通過 |
| リグレッション | 既存テスト（finalize.test.ts: 12件、finalize-command.test.ts: 4件）に失敗がないこと |
| ビルド成果物 | `dist/` にプロンプト・テンプレートがコピーされていること |

---

## 8. 品質ゲートチェックリスト

- [x] **Phase 2の戦略に沿ったテストシナリオである**: UNIT_INTEGRATION 戦略に基づき、ユニットテスト（31件）と統合テスト（3件）の両方を策定。BDDテストは不要と判断（CLIツールのため）。
- [x] **主要な正常系がカバーされている**: AI生成成功（UT-AR-025, IT-AR-001）、全フェーズ成果物収集（UT-AR-001）、小規模diff処理（UT-AR-006）、プロンプト構築（UT-AR-011）、セクション検証通過（UT-AR-014, 015, 017, 018）、ドライラン表示（UT-AR-030, 031）
- [x] **主要な異常系がカバーされている**: エージェント両方失敗（UT-AR-023, UT-AR-027, IT-AR-003）、認証情報なし（UT-AR-026）、必須セクション不在（UT-AR-016, 019, UT-AR-028）、空出力（UT-AR-029）、ファイル読み込みエラー（UT-AR-005）、GitHub APIエラー（UT-AR-009）
- [x] **期待結果が明確である**: 各テストケースに返り値、モック呼び出し引数、ログ出力内容を具体的に記載。曖昧な表現（「正しく動作する」等）を排除し、検証可能な形式で記述。
