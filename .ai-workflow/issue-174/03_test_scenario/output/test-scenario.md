# テストシナリオ - Issue #174

**Issue番号**: #174
**タイトル**: FOLLOW-UP Issue生成をエージェントベースに拡張する
**作成日**: 2025-01-30
**バージョン**: 1.0

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略

**UNIT_INTEGRATION** (Phase 2で決定)

### テスト対象の範囲

1. **Unitテスト**:
   - `IssueAgentGenerator` クラスの各メソッド
   - `IssueClient` クラスの新規メソッド（`generateFollowUpWithAgent`, `tryGenerateWithAgent`）
   - CLIオプションパーサー（`--followup-llm-mode agent`）

2. **Integrationテスト**:
   - `EvaluationPhase` → `IssueClient` → `IssueAgentGenerator` → エージェント実行のエンドツーエンドフロー
   - フォールバック機構（エージェント失敗時に `IssueAIGenerator` へフォールバック）
   - GitHub API モックを使用したIssue作成の統合テスト

### テストの目的

- エージェントベースFOLLOW-UP Issue生成機能の正常動作を検証
- フォールバック機構の信頼性を確認（エージェント失敗時も必ずIssue作成が成功）
- 既存のLLM APIベース生成機能との互換性を保証
- 品質ゲート（必須5セクション、フォールバック成功、CLIオプション動作）の達成

---

## 2. Unitテストシナリオ

### 2.1 IssueAgentGenerator クラス

#### 2.1.1 `generate()` メソッド - 正常系（Codexエージェント成功）

**テストケース名**: `IssueAgentGenerator_generate_正常系_Codex成功`

- **目的**: Codexエージェントが正常に実行され、Issue本文が生成されることを検証
- **前提条件**:
  - `CodexAgentClient` モックが正常に動作
  - プロンプトテンプレート（`generate-followup-issue.txt`）が存在
  - 出力ファイルパスが有効
- **入力**:
  ```typescript
  context: FollowUpContext = {
    remainingTasks: [
      {
        task: 'ユニットテスト追加',
        phase: 'testing',
        targetFiles: ['src/core/github/issue-agent-generator.ts'],
        steps: ['テストファイル作成', 'モック作成', 'アサーション追加'],
        priority: 'high',
        estimatedHours: 2,
        acceptanceCriteria: ['すべてのテストが成功する']
      }
    ],
    issueContext: {
      summary: 'Issue #123 の残タスク',
      blockerStatus: 'すべてのブロッカーは解決済み',
      deferredReason: 'タスク優先度の判断により後回し'
    },
    issueNumber: 123,
    evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md'
  }
  agent: 'codex'
  ```
- **期待結果**:
  - `success: true`
  - `title`: `[FOLLOW-UP] #123: ユニットテスト追加`
  - `body`: 5つの必須セクション（背景、目的、実行内容、受け入れ基準、参考情報）を含むMarkdown
  - 各セクションが最低文字数を満たす（背景100、目的100、実行内容200、受け入れ基準100、参考情報50）
- **テストデータ**: 上記 `context`
- **モック**:
  - `CodexAgentClient.executeTask()`: 成功を返し、出力ファイルに有効なMarkdownを書き込む

---

#### 2.1.2 `generate()` メソッド - 正常系（Claudeエージェント成功）

**テストケース名**: `IssueAgentGenerator_generate_正常系_Claude成功`

- **目的**: Claudeエージェントが正常に実行され、Issue本文が生成されることを検証
- **前提条件**:
  - `ClaudeAgentClient` モックが正常に動作
  - プロンプトテンプレートが存在
- **入力**: 上記2.1.1と同じ `context`、`agent: 'claude'`
- **期待結果**: 上記2.1.1と同じ
- **モック**:
  - `ClaudeAgentClient.executeTask()`: 成功を返し、出力ファイルに有効なMarkdownを書き込む

---

#### 2.1.3 `generate()` メソッド - 正常系（autoモード、Codex優先）

**テストケース名**: `IssueAgentGenerator_generate_正常系_auto_Codex優先`

- **目的**: `agent: 'auto'` 指定時、Codexが優先されることを検証
- **前提条件**:
  - `CodexAgentClient` と `ClaudeAgentClient` の両方が利用可能
- **入力**: 上記2.1.1と同じ `context`、`agent: 'auto'`
- **期待結果**:
  - Codexエージェントが実行される
  - Issue本文が正常に生成される
- **検証項目**:
  - `CodexAgentClient.executeTask()` が1回呼ばれる
  - `ClaudeAgentClient.executeTask()` は呼ばれない

---

#### 2.1.4 `generate()` メソッド - 異常系（プロンプトテンプレート不在）

**テストケース名**: `IssueAgentGenerator_generate_異常系_プロンプト不在`

- **目的**: プロンプトテンプレートが存在しない場合、エラーが返されることを検証
- **前提条件**:
  - プロンプトテンプレートファイル（`generate-followup-issue.txt`）が存在しない
- **入力**: 上記2.1.1と同じ `context`、`agent: 'codex'`
- **期待結果**:
  - `success: false`
  - `error`: `Prompt template not found: ...` を含む

---

#### 2.1.5 `generate()` メソッド - 異常系（エージェント実行失敗）

**テストケース名**: `IssueAgentGenerator_generate_異常系_エージェント失敗`

- **目的**: エージェント実行が失敗した場合、autoモードならフォールバック、codex/claudeモードならエラーが返されることを検証
- **前提条件**:
  - `CodexAgentClient.executeTask()` がエラーをスローする
- **入力**: 上記2.1.1と同じ `context`
  - **ケース1**: `agent: 'codex'` → エラーを返す
  - **ケース2**: `agent: 'auto'` → Claudeへフォールバック
- **期待結果**:
  - **ケース1**: `success: false`, `error: 'Codex failed: ...'`
  - **ケース2**: Claudeエージェントが実行され、Issue本文が生成される
- **モック**:
  - `CodexAgentClient.executeTask()`: エラーをスロー
  - `ClaudeAgentClient.executeTask()`: 正常動作（ケース2のみ）

---

#### 2.1.6 `generate()` メソッド - 異常系（出力ファイル不在）

**テストケース名**: `IssueAgentGenerator_generate_異常系_出力ファイル不在`

- **目的**: エージェント実行は成功したが出力ファイルが生成されなかった場合、フォールバック本文が使用されることを検証
- **前提条件**:
  - エージェント実行は成功
  - 出力ファイルが存在しない
- **入力**: 上記2.1.1と同じ `context`、`agent: 'codex'`
- **期待結果**:
  - `success: true`
  - `body`: フォールバック本文（`createFallbackBody()` の出力）
  - WARNING ログが記録される（`Output file not found: ... Using fallback template.`）
- **検証項目**:
  - `readOutputFile()` がフォールバック本文を返す

---

#### 2.1.7 `generate()` メソッド - 異常系（出力ファイルが空）

**テストケース名**: `IssueAgentGenerator_generate_異常系_出力ファイル空`

- **目的**: 出力ファイルが存在するが内容が空の場合、フォールバック本文が使用されることを検証
- **前提条件**:
  - エージェント実行は成功
  - 出力ファイルが存在するが、内容が空文字列
- **入力**: 上記2.1.1と同じ `context`、`agent: 'codex'`
- **期待結果**:
  - `success: true`
  - `body`: フォールバック本文
  - WARNING ログが記録される（`Output file is empty. Using fallback template.`）

---

#### 2.1.8 `generate()` メソッド - 異常系（必須セクション欠落）

**テストケース名**: `IssueAgentGenerator_generate_異常系_必須セクション欠落`

- **目的**: 出力ファイルに必須セクション（背景、目的、実行内容、受け入れ基準、参考情報）が含まれていない場合、フォールバック本文が使用されることを検証
- **前提条件**:
  - 出力ファイルが存在するが、必須セクションの一部が欠けている
- **入力**: 上記2.1.1と同じ `context`、`agent: 'codex'`
- **期待結果**:
  - `success: true`
  - `body`: フォールバック本文
  - WARNING ログが記録される（`Output file does not contain required sections. Using fallback template.`）
- **テストデータ**:
  - 出力ファイル内容: `## 背景\nテスト\n## 目的\nテスト`（残り3セクション欠落）

---

#### 2.1.9 `buildPrompt()` メソッド - 正常系

**テストケース名**: `IssueAgentGenerator_buildPrompt_正常系`

- **目的**: プロンプトテンプレート内の変数が正しく置換されることを検証
- **前提条件**: プロンプトテンプレートが存在
- **入力**:
  ```typescript
  template: '残タスク: {remaining_tasks_json}\nコンテキスト: {issue_context_json}\nレポート: {evaluation_report_path}\n出力先: {output_file_path}\nIssue番号: {issue_number}'
  context: （上記2.1.1と同じ）
  outputFilePath: '/tmp/followup-issue-12345-abc.md'
  ```
- **期待結果**:
  - `{remaining_tasks_json}` → JSON.stringify(context.remainingTasks, null, 2)
  - `{issue_context_json}` → JSON.stringify(context.issueContext, null, 2)
  - `{evaluation_report_path}` → `@.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md`
  - `{output_file_path}` → `/tmp/followup-issue-12345-abc.md`
  - `{issue_number}` → `123`

---

#### 2.1.10 `isValidIssueContent()` メソッド - 正常系

**テストケース名**: `IssueAgentGenerator_isValidIssueContent_正常系`

- **目的**: 必須セクションがすべて含まれ、最小文字数を満たすコンテンツがtrueを返すことを検証
- **入力**:
  ```markdown
  ## 背景
  （100文字以上のテキスト）

  ## 目的
  （100文字以上のテキスト）

  ## 実行内容
  （200文字以上のテキスト）

  ## 受け入れ基準
  （100文字以上のテキスト）

  ## 参考情報
  - 元Issue: #123
  ```
- **期待結果**: `true`

---

#### 2.1.11 `isValidIssueContent()` メソッド - 異常系（セクション欠落）

**テストケース名**: `IssueAgentGenerator_isValidIssueContent_異常系_セクション欠落`

- **目的**: 必須セクションが1つでも欠けている場合、falseを返すことを検証
- **入力**:
  ```markdown
  ## 背景
  テキスト

  ## 目的
  テキスト

  ## 実行内容
  テキスト
  ```
  （受け入れ基準、参考情報が欠落）
- **期待結果**: `false`

---

#### 2.1.12 `isValidIssueContent()` メソッド - 異常系（最小文字数未満）

**テストケース名**: `IssueAgentGenerator_isValidIssueContent_異常系_文字数不足`

- **目的**: コンテンツの文字数が100文字未満の場合、falseを返すことを検証
- **入力**: `## 背景\n短い\n## 目的\n短い`（合計30文字）
- **期待結果**: `false`

---

#### 2.1.13 `createFallbackBody()` メソッド - 正常系

**テストケース名**: `IssueAgentGenerator_createFallbackBody_正常系`

- **目的**: フォールバック本文が5つの必須セクションを含むことを検証
- **入力**: 上記2.1.1と同じ `context`
- **期待結果**:
  - `## 背景` セクションが含まれる
  - `## 目的` セクションが含まれる
  - `## 実行内容` セクションが含まれる（各タスクの詳細）
  - `## 受け入れ基準` セクションが含まれる
  - `## 参考情報` セクションが含まれる（元Issue、Evaluation Report）
  - フッターに「このIssueは自動生成されました（フォールバックテンプレート使用）」を含む

---

#### 2.1.14 `generateTitle()` メソッド - 正常系（キーワード抽出成功）

**テストケース名**: `IssueAgentGenerator_generateTitle_正常系_キーワード抽出`

- **目的**: 残タスクからキーワードを抽出し、適切なタイトルが生成されることを検証
- **入力**:
  ```typescript
  issueNumber: 123
  remainingTasks: [
    { task: 'ユニットテスト追加（issue-agent-generator）' },
    { task: 'インテグレーションテスト追加（エンドツーエンド）' },
    { task: 'ドキュメント更新（README）' }
  ]
  ```
- **期待結果**: `[FOLLOW-UP] #123: ユニットテスト追加・インテグレーションテスト追加・ドキュメント更新`
- **検証項目**:
  - タイトルが80文字以内
  - 最大3個のキーワードが含まれる
  - 括弧前までが抽出される

---

#### 2.1.15 `generateTitle()` メソッド - 正常系（タイトル長制限）

**テストケース名**: `IssueAgentGenerator_generateTitle_正常系_長さ制限`

- **目的**: タイトルが80文字を超える場合、省略されることを検証
- **入力**:
  ```typescript
  issueNumber: 123
  remainingTasks: [
    { task: '非常に長いタスク名で80文字を超える可能性がある場合のテスト（詳細説明部分）' },
    { task: '別の長いタスク名（追加説明）' }
  ]
  ```
- **期待結果**: タイトルが80文字で切り詰められ、末尾に `...` が付く

---

#### 2.1.16 `generateTitle()` メソッド - 異常系（キーワード抽出失敗）

**テストケース名**: `IssueAgentGenerator_generateTitle_異常系_キーワードなし`

- **目的**: キーワード抽出に失敗した場合、フォールバックタイトルが生成されることを検証
- **入力**:
  ```typescript
  issueNumber: 123
  remainingTasks: [
    { task: '' },
    { task: null }
  ]
  ```
- **期待結果**: `[FOLLOW-UP] Issue #123 - 残タスク`

---

#### 2.1.17 `cleanupOutputFile()` メソッド - 正常系

**テストケース名**: `IssueAgentGenerator_cleanupOutputFile_正常系`

- **目的**: 出力ファイルが正常に削除されることを検証
- **前提条件**: 出力ファイルが存在
- **入力**: `filePath: '/tmp/followup-issue-12345-abc.md'`
- **期待結果**:
  - ファイルが削除される
  - DEBUG ログが記録される（`Cleaned up output file: ...`）

---

#### 2.1.18 `cleanupOutputFile()` メソッド - 異常系（ファイル削除失敗）

**テストケース名**: `IssueAgentGenerator_cleanupOutputFile_異常系_削除失敗`

- **目的**: ファイル削除が失敗した場合、WARNINGログが記録されることを検証
- **前提条件**: ファイル削除時にエラーが発生
- **入力**: `filePath: '/tmp/readonly-file.md'`（読み取り専用）
- **期待結果**:
  - WARNING ログが記録される（`Failed to cleanup output file: ...`）
  - 例外はスローされない

---

### 2.2 IssueClient クラス

#### 2.2.1 `generateFollowUpWithAgent()` メソッド - 正常系

**テストケース名**: `IssueClient_generateFollowUpWithAgent_正常系`

- **目的**: エージェント生成が正常に呼び出され、結果が返されることを検証
- **前提条件**:
  - `IssueAgentGenerator` がコンストラクタ注入されている
- **入力**:
  ```typescript
  context: （上記2.1.1と同じ）
  agent: 'auto'
  ```
- **期待結果**:
  - `IssueAgentGenerator.generate()` が呼び出される
  - 生成結果（`GeneratedIssue`）が返される
- **モック**:
  - `IssueAgentGenerator.generate()`: `{ success: true, title: '...', body: '...' }` を返す

---

#### 2.2.2 `generateFollowUpWithAgent()` メソッド - 異常系（Generator未設定）

**テストケース名**: `IssueClient_generateFollowUpWithAgent_異常系_Generator未設定`

- **目的**: `IssueAgentGenerator` が設定されていない場合、エラーがスローされることを検証
- **前提条件**:
  - `IssueAgentGenerator` がコンストラクタ注入されていない
- **入力**: 上記2.2.1と同じ
- **期待結果**:
  - エラーがスローされる（`IssueAgentGenerator is not configured.`）

---

#### 2.2.3 `tryGenerateWithAgent()` メソッド - 正常系

**テストケース名**: `IssueClient_tryGenerateWithAgent_正常系`

- **目的**: エージェント生成が成功し、結果が返されることを検証
- **前提条件**:
  - `IssueAgentGenerator` が設定されている
- **入力**:
  ```typescript
  issueNumber: 123
  tasks: （上記2.1.1の remainingTasks）
  evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md'
  issueContext: （上記2.1.1の issueContext）
  ```
- **期待結果**:
  - `IssueAgentGenerator.generate()` が呼び出される
  - `success: true` の結果が返される
- **モック**:
  - `IssueAgentGenerator.generate()`: `{ success: true, title: '...', body: '...' }` を返す

---

#### 2.2.4 `tryGenerateWithAgent()` メソッド - 異常系（エージェント失敗）

**テストケース名**: `IssueClient_tryGenerateWithAgent_異常系_エージェント失敗`

- **目的**: エージェント生成が失敗した場合、失敗結果が返されることを検証
- **前提条件**:
  - `IssueAgentGenerator.generate()` がエラーをスロー
- **入力**: 上記2.2.3と同じ
- **期待結果**:
  - `success: false` の結果が返される
  - `error` フィールドにエラーメッセージが含まれる
  - ERROR ログが記録される（`Agent generation error: ...`）

---

#### 2.2.5 `createIssueFromEvaluation()` メソッド - 正常系（agentモード）

**テストケース名**: `IssueClient_createIssueFromEvaluation_正常系_agentモード`

- **目的**: `options.mode === 'agent'` の場合、エージェント生成が実行されることを検証
- **前提条件**:
  - `IssueAgentGenerator` が設定されている
- **入力**:
  ```typescript
  issueNumber: 123
  remainingTasks: （上記2.1.1と同じ）
  evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md'
  issueContext: （上記2.1.1と同じ）
  options: { enabled: true, mode: 'agent' }
  ```
- **期待結果**:
  - `tryGenerateWithAgent()` が呼び出される
  - GitHub API の `issues.create()` が呼び出される
  - `success: true` の結果が返される
  - `issue_url` と `issue_number` が含まれる
- **モック**:
  - `IssueAgentGenerator.generate()`: 成功結果を返す
  - `octokit.issues.create()`: `{ data: { number: 456, html_url: 'https://github.com/...' } }` を返す

---

#### 2.2.6 `createIssueFromEvaluation()` メソッド - 正常系（agentモード失敗時フォールバック）

**テストケース名**: `IssueClient_createIssueFromEvaluation_正常系_agentフォールバック`

- **目的**: `options.mode === 'agent'` でエージェント生成が失敗した場合、LLM生成へフォールバックすることを検証
- **前提条件**:
  - `IssueAgentGenerator.generate()` が失敗結果を返す
- **入力**: 上記2.2.5と同じ
- **期待結果**:
  - `tryGenerateWithAgent()` が呼び出される（失敗）
  - WARNING ログが記録される（`Agent generation failed: ... Falling back to LLM generation.`）
  - `tryGenerateWithLLM()` が呼び出される（既存機能）
  - GitHub Issue が作成される
- **モック**:
  - `IssueAgentGenerator.generate()`: `{ success: false, error: '...' }` を返す
  - `IssueAIGenerator.generate()`: 成功結果を返す

---

#### 2.2.7 `createIssueFromEvaluation()` メソッド - 正常系（openai/claudeモード）

**テストケース名**: `IssueClient_createIssueFromEvaluation_正常系_LLMモード`

- **目的**: `options.mode === 'openai'` または `'claude'` の場合、既存のLLM生成が実行されることを検証（互換性維持）
- **入力**:
  ```typescript
  issueNumber: 123
  remainingTasks: （上記2.1.1と同じ）
  evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md'
  issueContext: （上記2.1.1と同じ）
  options: { enabled: true, mode: 'openai' }
  ```
- **期待結果**:
  - `tryGenerateWithAgent()` は呼び出されない
  - `tryGenerateWithLLM()` が呼び出される
  - GitHub Issue が作成される
- **モック**:
  - `IssueAIGenerator.generate()`: 成功結果を返す

---

### 2.3 CLIオプションパーサー

#### 2.3.1 `parseExecuteOptions()` - 正常系（--followup-llm-mode agent）

**テストケース名**: `parseExecuteOptions_正常系_followup_llm_mode_agent`

- **目的**: `--followup-llm-mode agent` が正しく解析され、`IssueGenerationOptions` に反映されることを検証
- **入力**: `['--followup-llm-mode', 'agent']`
- **期待結果**:
  - `options.followupIssue.mode === 'agent'`

---

#### 2.3.2 `parseExecuteOptions()` - 正常系（既存モード互換性）

**テストケース名**: `parseExecuteOptions_正常系_既存モード互換性`

- **目的**: `--followup-llm-mode openai/claude/off` が従来通り動作することを検証
- **入力**:
  - ケース1: `['--followup-llm-mode', 'openai']` → `mode: 'openai'`
  - ケース2: `['--followup-llm-mode', 'claude']` → `mode: 'claude'`
  - ケース3: `['--followup-llm-mode', 'off']` → `mode: 'off'`
- **期待結果**: 各ケースで適切な `mode` が設定される

---

#### 2.3.3 `parseExecuteOptions()` - 異常系（不正なモード値）

**テストケース名**: `parseExecuteOptions_異常系_不正なモード値`

- **目的**: 不正な `--followup-llm-mode` 値が指定された場合、エラーまたはデフォルト値が使用されることを検証
- **入力**: `['--followup-llm-mode', 'invalid']`
- **期待結果**: エラーメッセージまたはデフォルト値（`'off'`）

---

## 3. Integrationテストシナリオ

### 3.1 エンドツーエンドフロー（エージェント生成成功）

**シナリオ名**: `E2E_エージェント生成成功_FOLLOWUP_Issue作成`

- **目的**: Evaluation Phase から GitHub Issue 作成までのエンドツーエンドフローが正常に動作することを検証
- **前提条件**:
  - Codexエージェントが利用可能
  - GitHub API モックが設定されている
  - Evaluation Reportが存在
  - 残タスクが検出されている
- **テスト手順**:
  1. `EvaluationPhase.handlePassWithIssues()` を呼び出し
  2. `--followup-llm-mode agent` オプションを渡す
  3. Evaluation Reportに残タスク情報を含める
- **期待結果**:
  - `IssueClient.createIssueFromEvaluation()` が呼び出される
  - `IssueAgentGenerator.generate()` が呼び出される
  - Codexエージェントが実行される
  - 出力ファイルが生成される
  - 出力ファイルが読み込まれる
  - 出力ファイルがクリーンアップされる
  - GitHub API の `issues.create()` が呼び出される
  - GitHub Issue が作成される（モック）
  - INFO ログが記録される（`Follow-up issue created: #456 - ...`）
- **確認項目**:
  - [ ] エージェント実行が成功
  - [ ] 出力ファイルが一時ディレクトリに生成
  - [ ] 出力ファイルに5つの必須セクションが含まれる
  - [ ] 出力ファイルがクリーンアップされる
  - [ ] GitHub Issue本文に5つの必須セクションが含まれる
  - [ ] Issue番号が返される

---

### 3.2 エンドツーエンドフロー（フォールバック成功）

**シナリオ名**: `E2E_エージェント失敗_フォールバック成功`

- **目的**: エージェント生成が失敗した場合、LLM生成へフォールバックしてIssue作成が成功することを検証
- **前提条件**:
  - Codexエージェントが失敗する（ファイル生成失敗）
  - `IssueAIGenerator` が利用可能
  - GitHub API モックが設定されている
- **テスト手順**:
  1. Codexエージェントに出力ファイルを生成させない（モック設定）
  2. `EvaluationPhase.handlePassWithIssues()` を呼び出し
  3. `--followup-llm-mode agent` オプションを渡す
- **期待結果**:
  - `IssueAgentGenerator.generate()` が呼び出される（失敗）
  - WARNING ログが記録される（`Output file not found: ... Using fallback template.`）
  - フォールバック本文が生成される
  - GitHub API の `issues.create()` が呼び出される
  - GitHub Issue が作成される
- **確認項目**:
  - [ ] エージェント実行が失敗
  - [ ] フォールバックが発生
  - [ ] フォールバック本文が5つの必須セクションを含む
  - [ ] GitHub Issue が作成される
  - [ ] Issue作成は成功（`success: true`）

---

### 3.3 Codex → Claude フォールバック

**シナリオ名**: `Integration_Codex失敗_Claudeフォールバック`

- **目的**: `agent: 'auto'` 指定時、Codex失敗後にClaudeへフォールバックすることを検証
- **前提条件**:
  - Codexエージェントが失敗する
  - Claudeエージェントが利用可能
- **テスト手順**:
  1. Codexエージェントに失敗させる（モック設定）
  2. Claudeエージェントに成功させる（モック設定）
  3. `IssueAgentGenerator.generate(context, 'auto')` を呼び出し
- **期待結果**:
  - Codexエージェントが実行される（失敗）
  - WARNING ログが記録される（`Codex failed, falling back to Claude.`）
  - Claudeエージェントが実行される（成功）
  - Issue本文が生成される
- **確認項目**:
  - [ ] Codexが1回呼ばれる
  - [ ] Claudeが1回呼ばれる
  - [ ] 最終的にIssue本文が生成される

---

### 3.4 GitHub API統合テスト（Issue作成）

**シナリオ名**: `Integration_GitHub_Issue作成`

- **目的**: エージェント生成後、GitHub APIを使用してIssueが正常に作成されることを検証
- **前提条件**:
  - GitHub API モックが設定されている
  - エージェント生成が成功
- **テスト手順**:
  1. `IssueClient.createIssueFromEvaluation()` を呼び出し
  2. `options.mode = 'agent'` を指定
  3. GitHub API モックが `issues.create()` を受け取る
- **期待結果**:
  - `octokit.issues.create()` が以下のパラメータで呼び出される:
    - `owner`: リポジトリオーナー
    - `repo`: リポジトリ名
    - `title`: 生成されたタイトル
    - `body`: 生成された本文
    - `labels`: `['enhancement', 'ai-workflow-follow-up']`
  - Issue作成結果が返される（`issue_url`, `issue_number`）
- **確認項目**:
  - [ ] GitHub API が正しいパラメータで呼び出される
  - [ ] Issue URLが返される
  - [ ] Issue番号が返される

---

### 3.5 プロンプトテンプレート読み込み

**シナリオ名**: `Integration_プロンプトテンプレート読み込み`

- **目的**: ビルド後、プロンプトテンプレートが正しいパスから読み込まれることを検証
- **前提条件**:
  - `npm run build` が実行済み
  - `dist/prompts/followup/generate-followup-issue.txt` が存在
- **テスト手順**:
  1. ビルド済みコード（`dist/` ディレクトリ）から `IssueAgentGenerator` をインポート
  2. `generate()` メソッドを呼び出し
  3. プロンプトテンプレートが読み込まれることを確認
- **期待結果**:
  - プロンプトテンプレートが `dist/prompts/followup/generate-followup-issue.txt` から読み込まれる
  - テンプレート内容が変数置換される
  - エラーが発生しない
- **確認項目**:
  - [ ] `dist/prompts/followup/generate-followup-issue.txt` が存在
  - [ ] テンプレートファイルが正常に読み込まれる
  - [ ] 変数プレースホルダーが置換される

---

### 3.6 一時ファイルクリーンアップ

**シナリオ名**: `Integration_一時ファイルクリーンアップ`

- **目的**: エージェント実行後、一時ファイルが確実にクリーンアップされることを検証
- **前提条件**:
  - エージェント生成が成功
  - 一時ファイルが `/tmp/` に生成される
- **テスト手順**:
  1. `IssueAgentGenerator.generate()` を呼び出し
  2. エージェント実行により一時ファイルが生成される
  3. メソッド完了後、一時ファイルの存在を確認
- **期待結果**:
  - エージェント実行中は一時ファイルが存在
  - メソッド完了後、一時ファイルが削除されている
  - DEBUG ログが記録される（`Cleaned up output file: ...`）
- **確認項目**:
  - [ ] 一時ファイルが生成される
  - [ ] 一時ファイルが削除される
  - [ ] ファイルシステムに残留しない

---

### 3.7 Evaluation Phase統合テスト

**シナリオ名**: `Integration_EvaluationPhase_agentモード`

- **目的**: Evaluation Phaseから `--followup-llm-mode agent` オプションが正しく伝播されることを検証
- **前提条件**:
  - Evaluation Phaseが実行可能
  - 残タスクが存在
- **テスト手順**:
  1. `EvaluationPhase.handlePassWithIssues()` を呼び出し
  2. `followupIssueOptions.mode = 'agent'` を設定
  3. `IssueClient.createIssueFromEvaluation()` が呼び出されることを確認
- **期待結果**:
  - `IssueClient.createIssueFromEvaluation()` が `options.mode = 'agent'` で呼び出される
  - エージェント生成が実行される
  - FOLLOW-UP Issue が作成される
- **確認項目**:
  - [ ] `handlePassWithIssues()` が正しいオプションを渡す
  - [ ] `IssueClient` がエージェントモードを認識する
  - [ ] エージェント生成が実行される

---

## 4. テストデータ

### 4.1 残タスクデータ（正常系）

```typescript
const normalRemainingTasks: RemainingTask[] = [
  {
    task: 'ユニットテスト追加',
    phase: 'testing',
    targetFiles: [
      'src/core/github/issue-agent-generator.ts',
      'tests/unit/core/github/issue-agent-generator.test.ts'
    ],
    steps: [
      'テストファイル作成',
      'モック作成（CodexAgentClient, ClaudeAgentClient）',
      'プロンプト生成テスト追加',
      'ファイル読み込みテスト追加',
      'エラーハンドリングテスト追加'
    ],
    priority: 'high',
    estimatedHours: 2,
    acceptanceCriteria: [
      'すべてのユニットテストが成功する',
      'テストカバレッジが80%以上である'
    ]
  },
  {
    task: 'インテグレーションテスト追加',
    phase: 'testing',
    targetFiles: [
      'tests/integration/followup-issue-agent.test.ts'
    ],
    steps: [
      'エンドツーエンドテスト作成',
      'フォールバック機構テスト追加',
      'GitHub APIモック設定'
    ],
    priority: 'medium',
    estimatedHours: 1.5,
    acceptanceCriteria: [
      'エンドツーエンドフローが成功する',
      'フォールバック時もIssue作成が成功する'
    ]
  },
  {
    task: 'ドキュメント更新',
    phase: 'documentation',
    targetFiles: [
      'README.md',
      'CLAUDE.md',
      'ARCHITECTURE.md'
    ],
    steps: [
      'README.mdに--followup-llm-mode agentオプション追加',
      'CLAUDE.mdにプロンプトテンプレート情報追加',
      'ARCHITECTURE.mdにIssueAgentGeneratorクラス説明追加'
    ],
    priority: 'low',
    estimatedHours: 1,
    acceptanceCriteria: [
      'すべてのドキュメントが更新されている',
      'agentモードの使用例が含まれている'
    ]
  }
];
```

### 4.2 Issueコンテキストデータ

```typescript
const issueContextNormal: IssueContext = {
  summary: 'Issue #123 では FOLLOW-UP Issue 生成機能をエージェントベースに拡張しました。この Issue は、残ったテストとドキュメント作業を完了するためのものです。',
  blockerStatus: 'すべてのブロッカーは解決済み',
  deferredReason: '実装が優先されたため、テストとドキュメント作業を後回しにしました'
};
```

### 4.3 プロンプトテンプレートサンプル

```markdown
あなたはソフトウェア開発プロジェクトの FOLLOW-UP Issue 作成アシスタントです。
以下の情報から、詳細かつ実行可能な FOLLOW-UP Issue 本文を生成してください。

# 入力情報

## 残タスク

{remaining_tasks_json}

## Issue コンテキスト

{issue_context_json}

## Evaluation Report

Evaluation Report のパス: {evaluation_report_path}

# Issue 本文フォーマット

以下の5つのセクションを含むMarkdown形式で生成してください：

## 背景
（元Issueの概要と、なぜ残タスクが発生したかを1〜2段落で説明してください。最低100文字。）

## 目的
（各残タスクの目的と期待される成果を具体的に記載してください。最低100文字。）

## 実行内容
（各タスクについて、対象ファイル、具体的な実装手順、テスト方法、注意事項を含めてください。最低200文字。）

## 受け入れ基準
（各タスクの完了判断基準を記載してください。最低100文字。）

## 参考情報
（元Issue、Evaluation Report、関連ドキュメントへのリンクを記載してください。最低50文字。）

# 出力フォーマット

生成したIssue本文は **必ず指定されたファイルに書き出してください**。

**出力先**: `{output_file_path}`
```

### 4.4 フォールバック本文サンプル

```markdown
## 背景

Issue #123 では FOLLOW-UP Issue 生成機能をエージェントベースに拡張しました。この Issue は、残ったテストとドキュメント作業を完了するためのものです。

### 元 Issue のステータス

すべてのブロッカーは解決済み

### なぜこれらのタスクが残ったか

実装が優先されたため、テストとドキュメント作業を後回しにしました

## 目的

Issue #123 で特定された残タスクを完了し、プロジェクトを最終化する。

## 実行内容

### Task 1: ユニットテスト追加

**対象ファイル**:
- `src/core/github/issue-agent-generator.ts`
- `tests/unit/core/github/issue-agent-generator.test.ts`

**必要な作業**:
1. テストファイル作成
2. モック作成（CodexAgentClient, ClaudeAgentClient）
3. プロンプト生成テスト追加
4. ファイル読み込みテスト追加
5. エラーハンドリングテスト追加

**優先度**: high
**見積もり**: 2

---

### Task 2: インテグレーションテスト追加
...

## 受け入れ基準

- [ ] すべてのユニットテストが成功する
- [ ] テストカバレッジが80%以上である
- [ ] エンドツーエンドフローが成功する
- [ ] フォールバック時もIssue作成が成功する

## 参考情報

- 元Issue: #123
- Evaluation Report: `.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md`

---
*このIssueは自動生成されました（フォールバックテンプレート使用）*
```

### 4.5 異常系テストデータ

#### 4.5.1 空の残タスク

```typescript
const emptyRemainingTasks: RemainingTask[] = [];
```

#### 4.5.2 不正な残タスク

```typescript
const invalidRemainingTasks: RemainingTask[] = [
  {
    task: '',
    phase: null,
    targetFiles: [],
    steps: [],
    priority: null,
    estimatedHours: null,
    acceptanceCriteria: []
  }
];
```

#### 4.5.3 必須セクション欠落のIssue本文

```markdown
## 背景

テキスト

## 目的

テキスト
```
（実行内容、受け入れ基準、参考情報が欠落）

---

## 5. テスト環境要件

### 5.1 ローカル環境

- **Node.js**: 20以上
- **TypeScript**: 5.x
- **パッケージマネージャー**: npm
- **テストフレームワーク**: Jest（既存）
- **モック/スタブ**:
  - `CodexAgentClient` のモック
  - `ClaudeAgentClient` のモック
  - `octokit` (GitHub API) のモック
  - `fs-extra` のスパイ（ファイル操作検証用）

### 5.2 必要な外部サービス

#### 5.2.1 Unitテスト

- **エージェント**: モックを使用（実際のAPI呼び出しなし）
- **GitHub API**: モックを使用（実際のAPI呼び出しなし）
- **ファイルシステム**: 実際のファイルシステム（一時ディレクトリ使用）

#### 5.2.2 Integrationテスト

- **エージェント**: モックを使用（一部のテストで実際のCodex/Claude APIを使用する場合は環境変数が必要）
  - `CODEX_API_KEY` または `OPENAI_API_KEY`（Codex使用時）
  - `CLAUDE_CODE_CREDENTIALS_PATH`（Claude使用時）
- **GitHub API**: モックを使用
- **ファイルシステム**: 実際のファイルシステム

### 5.3 モック/スタブの必要性

#### 5.3.1 必須モック

1. **CodexAgentClient**:
   - `executeTask()` メソッド
   - 成功時の動作: 出力ファイルに有効なMarkdownを書き込む
   - 失敗時の動作: エラーをスロー

2. **ClaudeAgentClient**:
   - `executeTask()` メソッド
   - 成功時の動作: 出力ファイルに有効なMarkdownを書き込む
   - 失敗時の動作: エラーをスロー

3. **GitHub API (octokit)**:
   - `issues.create()` メソッド
   - 成功時の動作: `{ data: { number: 456, html_url: '...' } }` を返す

#### 5.3.2 オプショナルスパイ

1. **fs-extra**:
   - `existsSync()`: ファイル存在確認の検証
   - `readFileSync()`: ファイル読み込みの検証
   - `removeSync()`: ファイル削除の検証

2. **logger**:
   - `info()`, `warn()`, `error()`, `debug()`: ログ記録の検証

### 5.4 CI/CD環境

- **GitHub Actions**: 既存のCI/CDパイプラインを使用
- **テスト実行コマンド**:
  - `npm run test:unit`: Unitテスト実行
  - `npm run test:integration`: Integrationテスト実行
- **環境変数**:
  - `GITHUB_TOKEN`: GitHub API認証（モック使用時は不要）
  - `CODEX_API_KEY`: Codexエージェント認証（モック使用時は不要）
  - `CLAUDE_CODE_CREDENTIALS_PATH`: Claudeエージェント認証（モック使用時は不要）

---

## 6. 受け入れ基準（テストシナリオ全体）

### AC-1: Phase 2の戦略に沿ったテストシナリオである

- [x] **UNIT_INTEGRATION** 戦略に基づいている
- [x] Unitテストシナリオが定義されている（セクション2）
- [x] Integrationテストシナリオが定義されている（セクション3）
- [x] BDDシナリオは含まれていない（戦略外）

### AC-2: 主要な正常系がカバーされている

- [x] エージェント生成成功（Codex、Claude、auto）
- [x] プロンプト変数置換
- [x] 出力ファイル読み込み
- [x] Issue本文検証（必須5セクション）
- [x] フォールバック本文生成
- [x] Issueタイトル生成
- [x] GitHub Issue作成
- [x] CLIオプション解析
- [x] エンドツーエンドフロー

### AC-3: 主要な異常系がカバーされている

- [x] プロンプトテンプレート不在
- [x] エージェント実行失敗
- [x] 出力ファイル不在
- [x] 出力ファイルが空
- [x] 必須セクション欠落
- [x] コンテンツ最小文字数未満
- [x] フォールバック機構（エージェント失敗時にLLM生成へ）
- [x] IssueAgentGenerator未設定
- [x] 不正なCLIオプション値

### AC-4: 期待結果が明確である

- [x] 各テストケースに「期待結果」が記載されている
- [x] アサーション可能な具体的な値が示されている
- [x] 検証項目がチェックリスト形式で明記されている

---

## 7. テスト実行順序

### 7.1 Unitテスト（Phase 5）

1. `IssueAgentGenerator` クラスのテスト（セクション2.1）
   - メソッド単位で順次実行
   - 正常系 → 異常系の順
2. `IssueClient` クラスのテスト（セクション2.2）
   - 新規メソッドのテスト
   - 既存メソッド拡張のテスト
3. CLIオプションパーサーのテスト（セクション2.3）

### 7.2 Integrationテスト（Phase 5）

1. プロンプトテンプレート読み込み（セクション3.5）
2. エンドツーエンドフロー（セクション3.1）
3. フォールバック機構（セクション3.2、3.3）
4. GitHub API統合（セクション3.4）
5. 一時ファイルクリーンアップ（セクション3.6）
6. Evaluation Phase統合（セクション3.7）

### 7.3 リグレッションテスト（Phase 6）

- 既存のすべてのテストケースを実行
- 既存のLLM APIベース生成機能が破壊されていないことを確認

---

## 8. テストカバレッジ目標

### 8.1 Unitテストカバレッジ

- **目標**: 80%以上
- **対象ファイル**:
  - `src/core/github/issue-agent-generator.ts`
  - `src/core/github/issue-client.ts`（新規メソッドのみ）
  - `src/commands/execute.ts`（CLIオプションパーサー拡張部分）

### 8.2 Integrationテストカバレッジ

- **目標**: 主要フローをすべてカバー
- **対象フロー**:
  - エージェント生成 → GitHub Issue作成
  - フォールバック（エージェント失敗 → LLM生成）
  - Codex → Claude フォールバック
  - Evaluation Phase → IssueClient → エージェント実行

---

## 9. 品質ゲート（Phase 3）

### Phase 3完了の品質ゲート

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - ✅ UNIT_INTEGRATION戦略に基づいて作成
- [x] **主要な正常系がカバーされている**
  - ✅ セクション2、3で正常系シナリオを網羅
- [x] **主要な異常系がカバーされている**
  - ✅ セクション2、3で異常系シナリオを網羅
- [x] **期待結果が明確である**
  - ✅ 各テストケースに具体的な期待結果を記載

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|-----------|------|----------|--------|
| 1.0 | 2025-01-30 | 初版作成 | AI Workflow |

---

## 承認

| 役割 | 氏名 | 承認日 | 署名 |
|------|------|--------|------|
| プロダクトオーナー | - | - | - |
| テックリード | - | - | - |
| QAリード | - | - | - |

---

**次フェーズ**: Phase 4 - Implementation（実装）
