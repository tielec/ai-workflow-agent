# テストシナリオ

**Issue**: #1 - [REFACTOR] 大規模ファイルのリファクタリング計画
**作成日**: 2025-01-20
**プロジェクト**: AI Workflow Agent (TypeScript)

---

## 0. Planning Document、Requirements Document、Design Documentの確認

本テストシナリオは、以下のドキュメントに基づいて作成されています:

- **Planning Document**: `.ai-workflow/issue-1/00_planning/output/planning.md`
  - 実装戦略: **REFACTOR** (既存機能の保持、構造改善)
  - テスト戦略: **UNIT_INTEGRATION** (ユニットテスト + 統合テスト)
  - テストコード戦略: **BOTH_TEST** (既存テストの修正 + 新規テスト作成)

- **Requirements Document**: `.ai-workflow/issue-1/01_requirements/output/requirements.md`
  - 機能要件: FR-1〜FR-6
  - 非機能要件: NFR-1〜NFR-4
  - 受け入れ基準: ファイルサイズ削減、後方互換性維持、テストカバレッジ維持

- **Design Document**: `.ai-workflow/issue-1/02_design/output/design.md`
  - 詳細設計: Phase 1〜4の新ファイル構造、クラス設計
  - ファサードパターンによる後方互換性維持戦略

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略

**UNIT_INTEGRATION** (ユニットテスト + 統合テスト)

### 1.2 テスト対象の範囲

#### Phase 1: main.ts のリファクタリング (最優先)
- 新規作成ファイル:
  - `src/commands/init-command.ts`
  - `src/commands/execute-command.ts`
  - `src/commands/review-command.ts`
  - `src/commands/preset-command.ts`
  - `src/utils/branch-validator.ts`
  - `src/utils/repo-resolver.ts`
- 修正ファイル: `src/main.ts` (1309行 → 200行以下)

#### Phase 2: base-phase.ts のリファクタリング (最優先)
- 新規作成ファイル:
  - `src/phases/base/agent-executor.ts`
  - `src/phases/base/review-cycle-manager.ts`
  - `src/phases/base/progress-formatter.ts`
  - `src/phases/base/agent-log-formatter.ts`
- 修正ファイル: `src/phases/base-phase.ts` (1419行 → 300行以下)

#### Phase 3: github-client.ts のリファクタリング (高優先)
- 新規作成ファイル:
  - `src/core/github/issue-client.ts`
  - `src/core/github/pr-client.ts`
  - `src/core/github/comment-client.ts`
- 修正ファイル: `src/core/github-client.ts` (ファサード化)

#### Phase 4: git-manager.ts のリファクタリング (中優先)
- 新規作成ファイル:
  - `src/core/git/commit-manager.ts`
  - `src/core/git/branch-manager.ts`
  - `src/core/git/remote-manager.ts`
- 修正ファイル: `src/core/git-manager.ts` (ファサード化)

### 1.3 テストの目的

1. **後方互換性の確認**: リファクタリング後も既存機能が正常に動作することを保証
2. **ファイルサイズ削減の確認**: 各ファイルが目標行数以下に削減されていることを確認
3. **新規クラスの動作確認**: 分割後の各クラスが正しく動作することを確認
4. **統合機能の保証**: 既存ワークフロー (Issue #2, #10, #16, #396) が影響を受けないことを確認
5. **テストカバレッジの維持**: リファクタリング前後でカバレッジが80%以上を維持することを確認

---

## 2. Phase 1: main.ts リファクタリング - ユニットテストシナリオ

### 2.1 src/utils/branch-validator.ts

#### TS-P1-U001: validateBranchName_正常系_有効なブランチ名

**目的**: 有効なブランチ名が正しく検証されることを確認

**前提条件**: なし

**入力**:
```typescript
branchName = "feature/issue-123"
```

**期待結果**:
```typescript
{
  valid: true
}
```

**テストデータ**:
- `"feature/issue-123"`
- `"bugfix/fix-typo"`
- `"hotfix/critical-bug"`
- `"issue-456"`
- `"develop"`

---

#### TS-P1-U002: validateBranchName_異常系_空文字列

**目的**: 空文字列が不正として検出されることを確認

**前提条件**: なし

**入力**:
```typescript
branchName = ""
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot be empty"
}
```

---

#### TS-P1-U003: validateBranchName_異常系_不正文字を含む

**目的**: 不正文字 (~, ^, :, ?, *, [, \, 空白, @{) が検出されることを確認

**前提条件**: なし

**入力**:
```typescript
branchName = "feature/issue~123"
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name contains invalid characters: ~"
}
```

**テストデータ**:
- `"feature/issue~123"` → 不正文字: ~
- `"feature/issue^123"` → 不正文字: ^
- `"feature/issue:123"` → 不正文字: :
- `"feature/issue?123"` → 不正文字: ?
- `"feature/issue*123"` → 不正文字: *
- `"feature/issue[123]"` → 不正文字: [
- `"feature/issue 123"` → 不正文字: 空白
- `"feature/issue@{123}"` → 不正文字: @{

---

#### TS-P1-U004: validateBranchName_異常系_連続ドット

**目的**: 連続ドット (..) が検出されることを確認

**前提条件**: なし

**入力**:
```typescript
branchName = "feature/issue..123"
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot contain consecutive dots (..)"
}
```

---

#### TS-P1-U005: validateBranchName_異常系_ドットで終わる

**目的**: ドットで終わるブランチ名が不正として検出されることを確認

**前提条件**: なし

**入力**:
```typescript
branchName = "feature/issue-123."
```

**期待結果**:
```typescript
{
  valid: false,
  error: "Branch name cannot end with a dot"
}
```

---

#### TS-P1-U006: resolveBranchName_正常系_カスタムブランチ指定

**目的**: カスタムブランチ名が優先されることを確認

**前提条件**: なし

**入力**:
```typescript
customBranch = "feature/custom-branch"
issueNumber = 123
```

**期待結果**:
```typescript
"feature/custom-branch"
```

---

#### TS-P1-U007: resolveBranchName_正常系_デフォルトブランチ名

**目的**: カスタムブランチ未指定時にデフォルトブランチ名が生成されることを確認

**前提条件**: なし

**入力**:
```typescript
customBranch = undefined
issueNumber = 123
```

**期待結果**:
```typescript
"ai-workflow/issue-123"
```

---

### 2.2 src/utils/repo-resolver.ts

#### TS-P1-U008: parseIssueUrl_正常系_標準形式

**目的**: 標準的なGitHub Issue URLが正しくパースされることを確認

**前提条件**: なし

**入力**:
```typescript
issueUrl = "https://github.com/tielec/ai-workflow-agent/issues/123"
```

**期待結果**:
```typescript
{
  owner: "tielec",
  repo: "ai-workflow-agent",
  issueNumber: 123,
  repositoryName: "tielec/ai-workflow-agent"
}
```

**テストデータ**:
- `"https://github.com/owner/repo/issues/1"`
- `"https://github.com/org-name/repo-name/issues/999"`
- `"https://github.com/user_123/repo_456/issues/42"`

---

#### TS-P1-U009: parseIssueUrl_異常系_不正なURL形式

**目的**: 不正なURL形式がエラーとして検出されることを確認

**前提条件**: なし

**入力**:
```typescript
issueUrl = "https://invalid-url.com/issues/123"
```

**期待結果**:
```typescript
throw new Error("Invalid GitHub Issue URL format")
```

**テストデータ**:
- `"https://gitlab.com/owner/repo/issues/123"` (GitLabのURL)
- `"https://github.com/owner"` (IssueのURLではない)
- `"not-a-url"` (URL形式ではない)

---

#### TS-P1-U010: resolveLocalRepoPath_正常系_リポジトリ名からパス解決

**目的**: リポジトリ名から正しいローカルパスが解決されることを確認

**前提条件**:
- 環境変数 `GITHUB_WORKSPACE` が設定されている、または
- カレントディレクトリがGitリポジトリ内

**入力**:
```typescript
repoName = "tielec/ai-workflow-agent"
```

**期待結果**:
```typescript
"/path/to/workspace/ai-workflow-agent"
```

---

#### TS-P1-U011: findWorkflowMetadata_正常系_メタデータファイル発見

**目的**: Issue番号からワークフローメタデータファイルが発見されることを確認

**前提条件**:
- `.ai-workflow/issue-123/metadata.json` が存在する

**入力**:
```typescript
issueNumber = "123"
```

**期待結果**:
```typescript
{
  repoRoot: "/path/to/repo",
  metadataPath: "/path/to/repo/.ai-workflow/issue-123/metadata.json"
}
```

---

#### TS-P1-U012: findWorkflowMetadata_異常系_メタデータファイル未発見

**目的**: メタデータファイルが存在しない場合にエラーが発生することを確認

**前提条件**:
- `.ai-workflow/issue-999/metadata.json` が存在しない

**入力**:
```typescript
issueNumber = "999"
```

**期待結果**:
```typescript
throw new Error("Workflow metadata not found for issue 999")
```

---

### 2.3 src/commands/preset-command.ts

#### TS-P1-U013: listPresets_正常系_プリセット一覧表示

**目的**: 利用可能なプリセット一覧が正しく表示されることを確認

**前提条件**:
- `PHASE_PRESETS` に複数のプリセットが定義されている

**入力**: なし

**期待結果**:
- コンソールにプリセット一覧が出力される
- 各プリセットの説明が表示される
- 非推奨プリセットには警告が表示される

**検証ポイント**:
- `console.log` が呼ばれること
- プリセット名、説明、フェーズ一覧が含まれること

---

#### TS-P1-U014: resolvePresetName_正常系_有効なプリセット名

**目的**: 有効なプリセット名が正しく解決されることを確認

**前提条件**: なし

**入力**:
```typescript
presetName = "full"
```

**期待結果**:
```typescript
{
  resolvedName: "full"
}
```

---

#### TS-P1-U015: resolvePresetName_正常系_非推奨プリセット名

**目的**: 非推奨プリセット名が新しい名前に変換され、警告が返されることを確認

**前提条件**:
- `DEPRECATED_PRESETS` に `"old-name" → "new-name"` のマッピングが定義されている

**入力**:
```typescript
presetName = "old-name"
```

**期待結果**:
```typescript
{
  resolvedName: "new-name",
  warning: "Preset 'old-name' is deprecated. Using 'new-name' instead."
}
```

---

#### TS-P1-U016: getPresetPhases_正常系_プリセットのフェーズ取得

**目的**: プリセット名から正しいフェーズリストが取得されることを確認

**前提条件**: なし

**入力**:
```typescript
presetName = "full"
```

**期待結果**:
```typescript
[
  "planning",
  "requirements",
  "design",
  "test_scenario",
  "implementation",
  "test_implementation",
  "testing",
  "documentation",
  "report",
  "evaluation"
]
```

---

#### TS-P1-U017: getPresetPhases_異常系_不正なプリセット名

**目的**: 不正なプリセット名がエラーとして検出されることを確認

**前提条件**: なし

**入力**:
```typescript
presetName = "invalid-preset"
```

**期待結果**:
```typescript
throw new Error("Unknown preset: invalid-preset")
```

---

### 2.4 src/commands/init-command.ts

#### TS-P1-U018: handleInitCommand_正常系_初期化成功

**目的**: ワークフロー初期化が正常に完了することを確認

**前提条件**:
- GitHub Tokenが設定されている
- ローカルリポジトリが存在する
- Issue URLが有効

**入力**:
```typescript
issueUrl = "https://github.com/tielec/ai-workflow-agent/issues/123"
customBranch = undefined
```

**期待結果**:
- メタデータファイル (`.ai-workflow/issue-123/metadata.json`) が作成される
- ブランチ `ai-workflow/issue-123` が作成される
- 初回コミットが実行される
- リモートにプッシュされる
- PRが作成される (ドラフトPR)
- コンソールに成功メッセージが出力される

**検証ポイント**:
- `MetadataManager.createMetadata` が呼ばれること
- `GitManager.createBranch` が呼ばれること
- `GitManager.commitWorkflowInit` が呼ばれること
- `GitManager.pushToRemote` が呼ばれること
- `GitHubClient.createPullRequest` が呼ばれること

---

#### TS-P1-U019: handleInitCommand_正常系_カスタムブランチ指定

**目的**: カスタムブランチ名が正しく使用されることを確認

**前提条件**:
- GitHub Tokenが設定されている
- ローカルリポジトリが存在する

**入力**:
```typescript
issueUrl = "https://github.com/tielec/ai-workflow-agent/issues/123"
customBranch = "feature/custom-branch"
```

**期待結果**:
- ブランチ `feature/custom-branch` が作成される
- メタデータに `branchName: "feature/custom-branch"` が記録される

---

#### TS-P1-U020: handleInitCommand_異常系_不正なブランチ名

**目的**: 不正なカスタムブランチ名がエラーとして検出されることを確認

**前提条件**: なし

**入力**:
```typescript
issueUrl = "https://github.com/tielec/ai-workflow-agent/issues/123"
customBranch = "feature/issue~123"
```

**期待結果**:
```typescript
throw new Error("Invalid branch name: ...")
process.exit(1)
```

---

#### TS-P1-U021: handleInitCommand_異常系_GitHub Token未設定

**目的**: GitHub Token未設定時にエラーが発生することを確認

**前提条件**:
- 環境変数 `GITHUB_TOKEN` が未設定

**入力**:
```typescript
issueUrl = "https://github.com/tielec/ai-workflow-agent/issues/123"
```

**期待結果**:
```typescript
throw new Error("GITHUB_TOKEN environment variable is not set")
process.exit(1)
```

---

### 2.5 src/commands/execute-command.ts

#### TS-P1-U022: handleExecuteCommand_正常系_全フェーズ実行

**目的**: 全フェーズが順次実行されることを確認

**前提条件**:
- ワークフローが初期化済み (metadata.json が存在)
- GitHub Token、Agent認証情報が設定されている

**入力**:
```typescript
options = {
  issue: "123",
  phase: "all"
}
```

**期待結果**:
- 全10フェーズ (planning 〜 evaluation) が順次実行される
- 各フェーズの実行結果がコンソールに出力される
- ExecutionSummary が返される

**検証ポイント**:
- `executePhasesSequential` が呼ばれること
- 各フェーズインスタンスが `createPhaseInstance` で作成されること
- 各フェーズの `run()` メソッドが呼ばれること

---

#### TS-P1-U023: handleExecuteCommand_正常系_単一フェーズ実行

**目的**: 指定したフェーズのみが実行されることを確認

**前提条件**:
- ワークフローが初期化済み

**入力**:
```typescript
options = {
  issue: "123",
  phase: "planning"
}
```

**期待結果**:
- planningフェーズのみが実行される
- 他のフェーズは実行されない

---

#### TS-P1-U024: createPhaseInstance_正常系_フェーズインスタンス生成

**目的**: 各フェーズ名から正しいフェーズインスタンスが生成されることを確認

**前提条件**: なし

**入力**:
```typescript
phaseName = "planning"
context = { /* PhaseContext */ }
```

**期待結果**:
```typescript
// PlanningPhaseインスタンスが返される
instance instanceof PlanningPhase === true
```

**テストデータ** (全10フェーズ):
- `"planning"` → `PlanningPhase`
- `"requirements"` → `RequirementsPhase`
- `"design"` → `DesignPhase`
- `"test_scenario"` → `TestScenarioPhase`
- `"implementation"` → `ImplementationPhase`
- `"test_implementation"` → `TestImplementationPhase`
- `"testing"` → `TestingPhase`
- `"documentation"` → `DocumentationPhase`
- `"report"` → `ReportPhase`
- `"evaluation"` → `EvaluationPhase`

---

#### TS-P1-U025: executePhasesSequential_正常系_依存関係チェック

**目的**: フェーズの依存関係が正しくチェックされることを確認

**前提条件**:
- planningフェーズが未完了

**入力**:
```typescript
phases = ["requirements"] // planningの後続フェーズ
```

**期待結果**:
```typescript
throw new Error("Phase 'planning' must be completed before 'requirements'")
```

---

#### TS-P1-U026: reportExecutionSummary_正常系_実行サマリー出力

**目的**: 実行サマリーが正しくコンソール出力されることを確認

**前提条件**: なし

**入力**:
```typescript
summary = {
  totalPhases: 3,
  successfulPhases: 2,
  failedPhases: 1,
  phases: [
    { name: "planning", status: "completed", duration: 120 },
    { name: "requirements", status: "completed", duration: 180 },
    { name: "design", status: "failed", duration: 60, error: "Agent failed" }
  ]
}
```

**期待結果**:
- コンソールにサマリーが出力される
- 成功/失敗フェーズ数が表示される
- 各フェーズの実行時間が表示される
- 失敗フェーズのエラーメッセージが表示される

---

### 2.6 src/main.ts

#### TS-P1-U027: runCli_正常系_CLIルーティング

**目的**: CLIコマンドが正しくルーティングされることを確認

**前提条件**: なし

**入力**:
```typescript
process.argv = ["node", "main.js", "init", "--issue-url", "https://github.com/owner/repo/issues/1"]
```

**期待結果**:
- `handleInitCommand` が呼ばれること
- 引数が正しく渡されること

**テストデータ**:
- `["node", "main.js", "init", "--issue-url", "URL"]` → `handleInitCommand`
- `["node", "main.js", "execute", "--issue", "123", "--phase", "all"]` → `handleExecuteCommand`
- `["node", "main.js", "review", "--issue", "123", "--phase", "planning"]` → `handleReviewCommand`
- `["node", "main.js", "list-presets"]` → `listPresets`

---

#### TS-P1-U028: reportFatalError_正常系_エラー処理

**目的**: エラーが正しく処理され、プロセスが終了することを確認

**前提条件**: なし

**入力**:
```typescript
error = new Error("Test error message")
```

**期待結果**:
- `console.error` が呼ばれること
- `process.exit(1)` が呼ばれること
- エラーメッセージが出力されること

---

## 3. Phase 2: base-phase.ts リファクタリング - ユニットテストシナリオ

### 3.1 src/phases/base/agent-executor.ts

#### TS-P2-U001: executeWithAgent_正常系_Codex実行成功

**目的**: CodexエージェントでAgent実行が成功することを確認

**前提条件**:
- CodexAgentClientが利用可能
- Codex API Keyが設定されている

**入力**:
```typescript
prompt = "Generate planning document for Issue #123"
options = { maxTurns: 10, verbose: false }
```

**期待結果**:
```typescript
// Codexからのメッセージ配列が返される
messages = [
  "Planning document generated successfully",
  "Output saved to: .ai-workflow/issue-123/00_planning/output/planning.md"
]
```

**検証ポイント**:
- `runAgentTask` がCodexで呼ばれること
- Claudeにフォールバックしないこと

---

#### TS-P2-U002: executeWithAgent_正常系_Codex失敗時Claudeフォールバック

**目的**: Codex失敗時にClaudeにフォールバックすることを確認

**前提条件**:
- CodexAgentClientが認証エラーを返す
- ClaudeAgentClientが利用可能

**入力**:
```typescript
prompt = "Generate planning document"
options = { maxTurns: 10 }
```

**期待結果**:
- Codexが認証エラーで失敗
- Claudeで再実行される
- Claudeからのメッセージが返される

**検証ポイント**:
- `runAgentTask` がCodexで1回、Claudeで1回呼ばれること
- フォールバック警告メッセージがログ出力されること

---

#### TS-P2-U003: executeWithAgent_異常系_両Agent失敗

**目的**: Codex、Claude両方失敗時にエラーが発生することを確認

**前提条件**:
- CodexAgentClientが失敗
- ClaudeAgentClientが失敗

**入力**:
```typescript
prompt = "Generate planning document"
```

**期待結果**:
```typescript
throw new Error("Both Codex and Claude agents failed")
```

---

#### TS-P2-U004: runAgentTask_正常系_Agent実行とログ保存

**目的**: Agent実行とログ保存が正しく行われることを確認

**前提条件**:
- AgentClientが正常に動作

**入力**:
```typescript
agent = codexClient
agentName = "Codex"
prompt = "Test prompt"
options = { verbose: true, logDir: "/path/to/logs" }
```

**期待結果**:
- Agentが実行される
- ログファイルが保存される (`agent-log.md`)
- メッセージ配列が返される
- `authFailed: false`

**検証ポイント**:
- `agent.executeTask` が呼ばれること
- `fs.writeFile` でログが保存されること
- `AgentLogFormatter.formatAgentLog` が呼ばれること

---

#### TS-P2-U005: extractUsageMetrics_正常系_使用量メトリクス抽出

**目的**: Agentメッセージから使用量メトリクスが抽出されることを確認

**前提条件**: なし

**入力**:
```typescript
messages = [
  "Task completed",
  JSON.stringify({
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500
    }
  })
]
```

**期待結果**:
```typescript
{
  input_tokens: 1000,
  output_tokens: 500,
  total_tokens: 1500
}
```

---

#### TS-P2-U006: extractUsageMetrics_正常系_メトリクスなし

**目的**: メトリクスが含まれないメッセージでnullが返されることを確認

**前提条件**: なし

**入力**:
```typescript
messages = ["Task completed", "No usage metrics"]
```

**期待結果**:
```typescript
null
```

---

### 3.2 src/phases/base/review-cycle-manager.ts

#### TS-P2-U007: performReviewCycle_正常系_レビュー合格

**目的**: レビューが1回で合格することを確認

**前提条件**:
- `basePhase.review()` が合格結果を返す

**入力**:
```typescript
initialOutputFile = ".ai-workflow/issue-123/00_planning/output/planning.md"
maxRetries = 3
```

**期待結果**:
```typescript
{
  success: true,
  reviewResult: { success: true, approved: true, ... },
  outputFile: ".ai-workflow/issue-123/00_planning/output/planning.md"
}
```

**検証ポイント**:
- `basePhase.review()` が1回だけ呼ばれること
- `performReviseStepWithRetry` が呼ばれないこと

---

#### TS-P2-U008: performReviewCycle_正常系_修正1回で合格

**目的**: 修正ステップ1回でレビュー合格することを確認

**前提条件**:
- 1回目のレビューが不合格
- reviseステップで修正
- 2回目のレビューが合格

**入力**:
```typescript
initialOutputFile = "planning.md"
maxRetries = 3
```

**期待結果**:
```typescript
{
  success: true,
  reviewResult: { success: true, approved: true, ... },
  outputFile: "planning.md" // 修正後のファイル
}
```

**検証ポイント**:
- `basePhase.review()` が2回呼ばれること
- `performReviseStepWithRetry` が1回呼ばれること
- `basePhase.revise()` が1回呼ばれること

---

#### TS-P2-U009: performReviewCycle_異常系_最大リトライ超過

**目的**: 最大リトライ回数を超えた場合にエラーが返されることを確認

**前提条件**:
- レビューが常に不合格
- maxRetries = 3

**入力**:
```typescript
initialOutputFile = "planning.md"
maxRetries = 3
```

**期待結果**:
```typescript
{
  success: false,
  reviewResult: { success: false, approved: false, ... },
  outputFile: "planning.md",
  error: "Maximum retry attempts (3) exceeded"
}
```

**検証ポイント**:
- `performReviseStepWithRetry` が3回呼ばれること
- `basePhase.review()` が4回呼ばれること (初回 + 3回の修正後)

---

#### TS-P2-U010: performReviseStepWithRetry_正常系_修正成功

**目的**: 修正ステップが正常に実行されることを確認

**前提条件**:
- `basePhase.revise()` が成功結果を返す
- GitManagerが利用可能

**入力**:
```typescript
gitManager = mockGitManager
initialReviewResult = {
  success: false,
  approved: false,
  feedback: "Fix typo in section 2",
  suggestions: ["Check spelling", "Review grammar"]
}
```

**期待結果**:
- `metadata.updateCurrentStep("revise")` が呼ばれる
- `basePhase.revise(feedback)` が呼ばれる
- `gitManager.commitAndPushStep("revise")` が呼ばれる
- `metadata.addCompletedStep("revise")` が呼ばれる

---

### 3.3 src/phases/base/progress-formatter.ts

#### TS-P2-U011: formatProgressComment_正常系_in_progress状態

**目的**: 進行中状態のコメントが正しくフォーマットされることを確認

**前提条件**:
- メタデータに複数フェーズの状態が記録されている

**入力**:
```typescript
status = "in_progress"
details = "Planning phase is running..."
```

**期待結果**:
```markdown
## 🚀 AI Workflow Progress

**Current Phase**: planning (in_progress)

### Phase Status
- ✅ planning: in_progress
- ⏳ requirements: pending
- ⏳ design: pending
...

**Details**: Planning phase is running...
```

---

#### TS-P2-U012: formatProgressComment_正常系_completed状態

**目的**: 完了状態のコメントが正しくフォーマットされることを確認

**前提条件**:
- planningフェーズが完了

**入力**:
```typescript
status = "completed"
details = "Planning phase completed successfully"
```

**期待結果**:
```markdown
## 🚀 AI Workflow Progress

**Current Phase**: planning (completed)

### Phase Status
- ✅ planning: completed
- ⏳ requirements: pending
...

**Details**: Planning phase completed successfully
```

---

#### TS-P2-U013: formatProgressComment_正常系_failed状態

**目的**: 失敗状態のコメントが正しくフォーマットされることを確認

**前提条件**:
- planningフェーズが失敗

**入力**:
```typescript
status = "failed"
details = "Agent execution failed: timeout"
```

**期待結果**:
```markdown
## 🚀 AI Workflow Progress

**Current Phase**: planning (failed)

### Phase Status
- ❌ planning: failed
- ⏳ requirements: pending
...

**Details**: Agent execution failed: timeout
```

---

### 3.4 src/phases/base/agent-log-formatter.ts

#### TS-P2-U014: formatAgentLog_正常系_Claude形式

**目的**: Claude Agentのログが正しくフォーマットされることを確認

**前提条件**: なし

**入力**:
```typescript
messages = [
  "Task started",
  "Processing...",
  "Task completed"
]
startTime = 1705737600000
endTime = 1705737720000
duration = 120000 // 2分
error = null
agentName = "Claude"
```

**期待結果**:
```markdown
# Agent Execution Log (Claude)

**Start Time**: 2025-01-20 12:00:00
**End Time**: 2025-01-20 12:02:00
**Duration**: 2m 0s
**Status**: Success

## Messages

1. Task started
2. Processing...
3. Task completed
```

---

#### TS-P2-U015: formatAgentLog_正常系_エラー時

**目的**: エラー発生時のログが正しくフォーマットされることを確認

**前提条件**: なし

**入力**:
```typescript
messages = ["Task started", "Error occurred"]
startTime = 1705737600000
endTime = 1705737660000
duration = 60000
error = new Error("API timeout")
agentName = "Codex"
```

**期待結果**:
```markdown
# Agent Execution Log (Codex)

**Start Time**: 2025-01-20 12:00:00
**End Time**: 2025-01-20 12:01:00
**Duration**: 1m 0s
**Status**: Failed

**Error**: API timeout

## Messages

1. Task started
2. Error occurred
```

---

#### TS-P2-U016: formatCodexAgentLog_正常系_詳細ログ

**目的**: Codex Agentの詳細ログが正しくフォーマットされることを確認

**前提条件**: なし

**入力**:
```typescript
messages = [
  JSON.stringify({
    type: "tool_use",
    name: "Read",
    input: { file_path: "/path/to/file.md" }
  }),
  JSON.stringify({
    type: "tool_result",
    content: "File content here..."
  }),
  "Task completed successfully"
]
startTime = 1705737600000
endTime = 1705737720000
duration = 120000
error = null
```

**期待結果**:
- 各ツール使用が個別にフォーマットされる
- ツールの入力・出力が表示される
- 使用量メトリクス (tokens) が表示される (存在する場合)

---

#### TS-P2-U017: truncate_正常系_長文切り詰め

**目的**: 長文が指定文字数で切り詰められることを確認

**前提条件**: なし

**入力**:
```typescript
value = "A".repeat(1000)
limit = 100
```

**期待結果**:
```typescript
{
  text: "A".repeat(100) + "... (truncated)",
  truncated: true
}
```

---

### 3.5 src/phases/base/base-phase.ts

#### TS-P2-U018: run_正常系_フェーズ実行完了

**目的**: フェーズが正常に実行されることを確認

**前提条件**:
- 依存フェーズが完了済み
- execute/review が成功を返す

**入力**:
```typescript
options = { skipReview: false, gitManager: mockGitManager }
```

**期待結果**:
```typescript
true // 成功
```

**検証ポイント**:
- `updatePhaseStatus("in_progress")` が呼ばれる
- `execute()` が呼ばれる
- `performReviewCycle()` が呼ばれる (skipReview=false の場合)
- `updatePhaseStatus("completed")` が呼ばれる
- GitManagerでコミット・プッシュが実行される

---

#### TS-P2-U019: run_正常系_レビュースキップ

**目的**: レビューがスキップされることを確認

**前提条件**: なし

**入力**:
```typescript
options = { skipReview: true }
```

**期待結果**:
```typescript
true
```

**検証ポイント**:
- `execute()` が呼ばれる
- `performReviewCycle()` が呼ばれない
- `updatePhaseStatus("completed")` が呼ばれる

---

#### TS-P2-U020: run_異常系_依存フェーズ未完了

**目的**: 依存フェーズ未完了時にエラーが発生することを確認

**前提条件**:
- planningフェーズが未完了
- requirementsフェーズを実行しようとする

**入力**:
```typescript
options = {}
```

**期待結果**:
```typescript
false // 失敗
// エラーメッセージ: "Phase 'planning' must be completed before 'requirements'"
```

**検証ポイント**:
- `validatePhaseDependencies` が失敗を返す
- `execute()` が呼ばれない

---

#### TS-P2-U021: shouldRunReview_正常系_レビュー必要

**目的**: レビューが必要なフェーズでtrueが返されることを確認

**前提条件**: なし

**入力**: なし (planning, requirements, design等のフェーズ)

**期待結果**:
```typescript
true
```

---

#### TS-P2-U022: shouldRunReview_正常系_レビュー不要

**目的**: レビュー不要なフェーズでfalseが返されることを確認

**前提条件**: なし

**入力**: なし (testing, evaluationフェーズ等)

**期待結果**:
```typescript
false
```

---

## 4. Phase 3 & 4: github-client.ts / git-manager.ts - ユニットテストシナリオ (オプション)

Phase 3 (github-client.ts) および Phase 4 (git-manager.ts) のユニットテストは、**ファサードパターン**により既存インターフェースが維持されるため、**既存テストの修正のみ**で対応可能です。

新規クラス (IssueClient, PRClient, CommitManager等) のユニットテストは、**実装フェーズで必要に応じて作成**します。

---

## 5. 統合テストシナリオ

### 5.1 既存ワークフロー統合テスト

#### TS-INT-001: マルチリポジトリ対応の動作確認 (Issue #396)

**目的**: リファクタリング後もマルチリポジトリ対応が正常に動作することを確認

**前提条件**:
- 複数のリポジトリが存在
- 各リポジトリに `.ai-workflow/issue-N/metadata.json` が存在

**テスト手順**:
1. リポジトリA で `ai-workflow init --issue-url <URL_A>` を実行
2. リポジトリB で `ai-workflow init --issue-url <URL_B>` を実行
3. リポジトリA で `ai-workflow execute --issue <NUM_A> --phase planning` を実行
4. リポジトリB で `ai-workflow execute --issue <NUM_B> --phase planning` を実行
5. 各リポジトリのメタデータファイルを確認

**期待結果**:
- 各リポジトリで独立したワークフローが実行される
- リポジトリAの変更がリポジトリBに影響しない
- 各メタデータファイルが正しく更新される

**確認項目**:
- [ ] リポジトリAのメタデータに `repositoryName: "owner/repo-a"` が記録される
- [ ] リポジトリBのメタデータに `repositoryName: "owner/repo-b"` が記録される
- [ ] 各リポジトリで独立したブランチが作成される
- [ ] 各リポジトリで独立したPRが作成される

**関連テストファイル**: `tests/integration/multi-repo-workflow.test.ts`

---

#### TS-INT-002: ステップ単位のコミット機能の動作確認 (Issue #10)

**目的**: リファクタリング後もステップ単位のコミット機能が正常に動作することを確認

**前提条件**:
- ワークフローが初期化済み
- Gitリポジトリが正常

**テスト手順**:
1. `ai-workflow execute --issue 123 --phase planning` を実行
2. Gitログを確認し、以下のコミットが存在することを確認:
   - `[AI Workflow] Phase planning - execute step completed (Issue #123)`
   - `[AI Workflow] Phase planning - review step completed (Issue #123)`
3. 各コミットに正しいファイルが含まれることを確認

**期待結果**:
- executeステップ完了後にコミットが作成される
- reviewステップ完了後にコミットが作成される (レビュー実施時)
- reviseステップ完了後にコミットが作成される (修正実施時)
- 各コミットメッセージが統一フォーマットに従う

**確認項目**:
- [ ] `git log` に各ステップのコミットが記録される
- [ ] executeステップのコミットに `00_planning/output/planning.md` が含まれる
- [ ] reviewステップのコミットに `00_planning/review/review-result.md` が含まれる
- [ ] コミットメッセージが `[AI Workflow] Phase <name> - <step> step completed (Issue #<num>)` 形式

**関連テストファイル**: `tests/integration/step-commit-push.test.ts`

---

#### TS-INT-003: ステップ単位のレジューム機能の動作確認 (Issue #10)

**目的**: リファクタリング後もステップ単位のレジューム機能が正常に動作することを確認

**前提条件**:
- ワークフローが初期化済み
- planningフェーズのexecuteステップが完了済み (reviewステップは未完了)

**テスト手順**:
1. メタデータを確認: `completedSteps` に `["execute"]` が記録されていることを確認
2. `ai-workflow execute --issue 123 --phase planning` を再実行
3. ログを確認

**期待結果**:
- executeステップがスキップされる
- reviewステップから実行が再開される
- メタデータが正しく更新される

**確認項目**:
- [ ] executeステップが再実行されない (ログに "Skipping execute step (already completed)" が出力される)
- [ ] reviewステップが実行される
- [ ] メタデータの `completedSteps` に `["execute", "review"]` が記録される

**関連テストファイル**: `tests/integration/step-resume.test.ts`

---

#### TS-INT-004: ワークフロークリーンアップ機能の動作確認 (Issue #2)

**目的**: リファクタリング後もワークフロークリーンアップ機能が正常に動作することを確認

**前提条件**:
- reportフェーズが完了
- `.ai-workflow/issue-123/` ディレクトリに複数のログファイルが存在

**テスト手順**:
1. reportフェーズを実行
2. `.ai-workflow/issue-123/` ディレクトリの内容を確認

**期待結果**:
- Agent実行ログ (`agent-log.md`) が削除される
- 各フェーズの出力ファイルは保持される
- メタデータファイルは保持される

**確認項目**:
- [ ] `**/agent-log.md` が削除される
- [ ] `00_planning/output/planning.md` が保持される
- [ ] `metadata.json` が保持される
- [ ] Gitコミット履歴に `[AI Workflow] Clean up logs after report phase (Issue #123)` が記録される

**関連テストファイル**: `tests/integration/workflow-init-cleanup.test.ts`

---

#### TS-INT-005: カスタムブランチ対応の動作確認 (v0.2.0)

**目的**: リファクタリング後もカスタムブランチ対応が正常に動作することを確認

**前提条件**: なし

**テスト手順**:
1. `ai-workflow init --issue-url <URL> --branch feature/custom-branch` を実行
2. Gitブランチを確認
3. メタデータを確認

**期待結果**:
- ブランチ `feature/custom-branch` が作成される
- メタデータに `branchName: "feature/custom-branch"` が記録される
- PRが `feature/custom-branch` → `main` で作成される

**確認項目**:
- [ ] `git branch` に `feature/custom-branch` が存在する
- [ ] メタデータの `branchName` が `"feature/custom-branch"`
- [ ] PRのhead branchが `feature/custom-branch`

**関連テストファイル**: `tests/integration/custom-branch-workflow.test.ts`

---

#### TS-INT-006: プリセット実行の動作確認

**目的**: リファクタリング後もプリセット実行が正常に動作することを確認

**前提条件**:
- ワークフローが初期化済み

**テスト手順**:
1. `ai-workflow execute --issue 123 --preset full` を実行
2. 実行されるフェーズを確認

**期待結果**:
- 全10フェーズ (planning 〜 evaluation) が順次実行される
- 各フェーズが正常に完了する

**確認項目**:
- [ ] planning 〜 evaluation の10フェーズすべてが実行される
- [ ] 各フェーズのメタデータに `status: "completed"` が記録される
- [ ] 各フェーズの出力ファイルが生成される

**関連テストファイル**: `tests/integration/preset-execution.test.ts`

---

### 5.2 リファクタリング後の統合テスト

#### TS-INT-007: エンドツーエンドワークフロー実行

**目的**: リファクタリング後のエンドツーエンドワークフローが正常に動作することを確認

**前提条件**:
- GitHub Tokenが設定されている
- Agent認証情報が設定されている
- ローカルリポジトリが存在する

**テスト手順**:
1. `ai-workflow init --issue-url https://github.com/owner/repo/issues/1` を実行
2. `ai-workflow execute --issue 1 --preset full` を実行
3. 全フェーズの完了を待つ
4. 各フェーズの出力ファイル、メタデータ、Gitコミット、PRを確認

**期待結果**:
- 全フェーズが正常に完了
- 各フェーズの出力ファイルが生成される
- メタデータが正しく更新される
- Gitコミット履歴が正しく記録される
- PRがドラフトから Ready for review に変更される

**確認項目**:
- [ ] 全10フェーズが `status: "completed"`
- [ ] 各フェーズの出力ファイルが存在する
- [ ] メタデータに全フェーズの情報が記録される
- [ ] Gitログに各フェーズのコミットが記録される
- [ ] PRが作成され、ドラフト解除される

---

#### TS-INT-008: ファイルサイズ削減の確認

**目的**: リファクタリング後に各ファイルが目標行数以下に削減されていることを確認

**前提条件**:
- リファクタリングが完了している

**テスト手順**:
1. 各ファイルの行数を測定
   ```bash
   wc -l src/main.ts
   wc -l src/phases/base-phase.ts
   wc -l src/core/github-client.ts
   wc -l src/core/git-manager.ts
   ```
2. 各ファイルサイズを目標値と比較

**期待結果**:
- main.ts: 200行以下 (削減率: 84%以上)
- base-phase.ts: 300行以下 (削減率: 79%以上)
- github-client.ts (ファサード): 200行以下
- git-manager.ts (ファサード): 200行以下

**確認項目**:
- [ ] `wc -l src/main.ts` の結果が 200行以下
- [ ] `wc -l src/phases/base-phase.ts` の結果が 300行以下
- [ ] `wc -l src/core/github-client.ts` の結果が 200行以下
- [ ] `wc -l src/core/git-manager.ts` の結果が 200行以下

---

#### TS-INT-009: テストカバレッジの維持確認

**目的**: リファクタリング後もテストカバレッジが80%以上を維持していることを確認

**前提条件**:
- すべてのテストが実装されている

**テスト手順**:
1. `npm run test:coverage` を実行
2. カバレッジレポートを確認

**期待結果**:
- 全体のカバレッジが80%以上
- 主要モジュール (main.ts, base-phase.ts, github-client.ts, git-manager.ts) のカバレッジが80%以上

**確認項目**:
- [ ] Statements: 80%以上
- [ ] Branches: 80%以上
- [ ] Functions: 80%以上
- [ ] Lines: 80%以上

---

#### TS-INT-010: ビルド成果物の維持確認

**目的**: リファクタリング後もビルド成果物が正しく生成されることを確認

**前提条件**: なし

**テスト手順**:
1. `npm run build` を実行
2. `dist/` ディレクトリの内容を確認
3. `node dist/index.js --help` を実行
4. Docker環境でビルド・実行を確認

**期待結果**:
- ビルドが成功する
- `dist/` ディレクトリに必要なファイルがすべて存在する
- CLIが正常に動作する
- Docker環境でワークフローが実行できる

**確認項目**:
- [ ] `npm run build` が成功する
- [ ] `dist/prompts/` にプロンプトテンプレートがコピーされる
- [ ] `dist/templates/` にMarkdownテンプレートがコピーされる
- [ ] `dist/index.js` が実行可能である
- [ ] `node dist/index.js --help` がCLIヘルプを表示する
- [ ] Docker環境で `ai-workflow init` が実行できる

---

## 6. テストデータ

### 6.1 ブランチ名テストデータ

**有効なブランチ名**:
- `"feature/issue-123"`
- `"bugfix/fix-typo"`
- `"hotfix/critical-bug"`
- `"issue-456"`
- `"develop"`
- `"main"`
- `"feature/add-new-feature"`

**不正なブランチ名**:
- `""` (空文字列)
- `"feature/issue~123"` (不正文字: ~)
- `"feature/issue^123"` (不正文字: ^)
- `"feature/issue:123"` (不正文字: :)
- `"feature/issue?123"` (不正文字: ?)
- `"feature/issue*123"` (不正文字: *)
- `"feature/issue[123]"` (不正文字: [)
- `"feature/issue 123"` (空白)
- `"feature/issue@{123}"` (不正文字: @{)
- `"feature/issue..123"` (連続ドット)
- `"feature/issue-123."` (ドットで終わる)
- `"/feature"` (スラッシュで開始)
- `"feature/"` (スラッシュで終了)

### 6.2 Issue URL テストデータ

**有効なIssue URL**:
- `"https://github.com/tielec/ai-workflow-agent/issues/123"`
- `"https://github.com/owner/repo/issues/1"`
- `"https://github.com/org-name/repo-name/issues/999"`
- `"https://github.com/user_123/repo_456/issues/42"`

**不正なIssue URL**:
- `"https://gitlab.com/owner/repo/issues/123"` (GitLabのURL)
- `"https://github.com/owner"` (IssueのURLではない)
- `"not-a-url"` (URL形式ではない)
- `"https://github.com/owner/repo/pull/123"` (Pull RequestのURL)
- `"https://github.com/owner/repo/issues/abc"` (Issue番号が数値ではない)

### 6.3 Agent実行テストデータ

**Codex Agent メッセージ**:
```json
[
  {
    "type": "tool_use",
    "name": "Read",
    "input": {
      "file_path": "/path/to/file.md"
    }
  },
  {
    "type": "tool_result",
    "content": "File content here..."
  },
  {
    "type": "text",
    "content": "Task completed successfully"
  }
]
```

**Claude Agent メッセージ**:
```json
[
  "Task started",
  "Processing requirements...",
  "Generating document...",
  "Task completed"
]
```

**使用量メトリクス**:
```json
{
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500,
    "total_tokens": 1500
  }
}
```

### 6.4 メタデータテストデータ

**初期メタデータ** (init完了後):
```json
{
  "issueNumber": 123,
  "branchName": "ai-workflow/issue-123",
  "repositoryName": "tielec/ai-workflow-agent",
  "phases": {
    "planning": {
      "status": "pending",
      "completedSteps": []
    },
    "requirements": {
      "status": "pending",
      "completedSteps": []
    }
  }
}
```

**フェーズ完了後のメタデータ**:
```json
{
  "issueNumber": 123,
  "branchName": "ai-workflow/issue-123",
  "repositoryName": "tielec/ai-workflow-agent",
  "phases": {
    "planning": {
      "status": "completed",
      "completedSteps": ["execute", "review"],
      "startedAt": "2025-01-20T12:00:00Z",
      "completedAt": "2025-01-20T12:05:00Z"
    },
    "requirements": {
      "status": "pending",
      "completedSteps": []
    }
  }
}
```

### 6.5 Gitコミットメッセージテストデータ

**executeステップ**:
```
[AI Workflow] Phase planning - execute step completed (Issue #123)
```

**reviewステップ**:
```
[AI Workflow] Phase planning - review step completed (Issue #123)
```

**reviseステップ**:
```
[AI Workflow] Phase planning - revise step completed (Issue #123)
```

**ワークフロー初期化**:
```
[AI Workflow] Initialize workflow for Issue #123
```

**ログクリーンアップ**:
```
[AI Workflow] Clean up logs after report phase (Issue #123)
```

---

## 7. テスト環境要件

### 7.1 ローカル開発環境

**必須環境**:
- Node.js 20以上
- npm 10以上
- Git 2.x以上
- TypeScript 5.6

**環境変数**:
- `GITHUB_TOKEN`: GitHub Personal Access Token (repo権限)
- `CODEX_API_KEY` または `OPENAI_API_KEY`: Codex API Key (オプション)
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude認証情報ファイルパス (オプション)
- `GITHUB_WORKSPACE`: リポジトリルートパス (CI環境で自動設定)

### 7.2 CI/CD環境

**必須**:
- GitHub Actions環境
- Node.js 20ランタイム
- Gitコマンドが利用可能

**Secret設定**:
- `GITHUB_TOKEN`: GitHub Actions の自動生成トークン
- `CODEX_API_KEY`: Codex API Key (統合テストで使用)
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude認証情報 (統合テストで使用)

### 7.3 モック/スタブの必要性

**ユニットテスト**:
- `GitHubClient` のモック: Octokit API呼び出しをモック
- `GitManager` のモック: Git操作 (commit, push) をモック
- `CodexAgentClient` のモック: Codex API呼び出しをモック
- `ClaudeAgentClient` のモック: Claude Agent SDK呼び出しをモック
- `MetadataManager` のモック: メタデータファイル読み書きをモック

**統合テスト**:
- 実際のGitリポジトリを使用 (テスト用のローカルリポジトリ)
- GitHub APIは実際に呼び出す (テスト用のリポジトリ・Issue)
- Agent APIは実際に呼び出す (実際のCodex/Claude)

---

## 8. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

**確認**:
- テスト戦略: **UNIT_INTEGRATION** (ユニットテスト + 統合テスト)
- セクション2〜3: ユニットテストシナリオ (Phase 1, 2)
- セクション5: 統合テストシナリオ (既存ワークフロー + リファクタリング後)
- BDDシナリオは含まれていない (戦略に含まれないため)

### ✅ 主要な正常系がカバーされている

**確認**:
- ブランチバリデーション: 有効なブランチ名の検証 (TS-P1-U001)
- Issue URLパース: 標準形式のパース (TS-P1-U008)
- ワークフロー初期化: 初期化成功 (TS-P1-U018)
- フェーズ実行: 全フェーズ実行 (TS-P1-U022)
- Agent実行: Codex実行成功 (TS-P2-U001)
- レビューサイクル: レビュー合格 (TS-P2-U007)
- マルチリポジトリ対応: 複数リポジトリでの動作 (TS-INT-001)
- ステップ単位コミット: コミット機能 (TS-INT-002)
- エンドツーエンド: 全ワークフロー実行 (TS-INT-007)

### ✅ 主要な異常系がカバーされている

**確認**:
- ブランチバリデーション: 空文字列、不正文字、連続ドット、ドットで終わる (TS-P1-U002〜U005)
- Issue URLパース: 不正なURL形式 (TS-P1-U009)
- メタデータ検索: メタデータファイル未発見 (TS-P1-U012)
- プリセット解決: 不正なプリセット名 (TS-P1-U017)
- ワークフロー初期化: 不正なブランチ名、Token未設定 (TS-P1-U020, U021)
- Agent実行: 両Agent失敗 (TS-P2-U003)
- レビューサイクル: 最大リトライ超過 (TS-P2-U009)
- フェーズ実行: 依存フェーズ未完了 (TS-P2-U020)

### ✅ 期待結果が明確である

**確認**:
- すべてのテストケースに「期待結果」セクションが記載されている
- 期待結果は具体的な値、エラーメッセージ、動作を記述
- 検証ポイントがチェックリスト形式で明記されている
- テストデータが具体的に記載されている

---

## 9. テスト実施計画

### 9.1 実施順序

**Phase 1完了後**:
1. TS-P1-U001〜U028: Phase 1のユニットテスト実行
2. 既存テスト (7ファイル) のimport文修正後、再実行
3. ビルド＆動作確認

**Phase 2完了後**:
1. TS-P2-U001〜U022: Phase 2のユニットテスト実行
2. 既存テスト (4ファイル) のimport文修正後、再実行
3. ビルド＆動作確認

**Phase 3完了後**:
1. 既存テストの再実行 (ファサードパターンにより既存インターフェース維持)
2. ビルド＆動作確認

**Phase 4完了後**:
1. 既存テスト (1ファイル) のimport文修正後、再実行
2. ビルド＆動作確認

**全Phase完了後**:
1. TS-INT-001〜TS-INT-010: 統合テスト実行
2. テストカバレッジ測定 (`npm run test:coverage`)
3. ファイルサイズ削減の確認
4. ビルド成果物の確認

### 9.2 テスト実行コマンド

**ユニットテスト**:
```bash
npm run test:unit
```

**統合テスト**:
```bash
npm run test:integration
```

**全テスト**:
```bash
npm test
```

**カバレッジ測定**:
```bash
npm run test:coverage
```

**ファイルサイズ測定**:
```bash
wc -l src/main.ts src/phases/base-phase.ts src/core/github-client.ts src/core/git-manager.ts
```

---

## 10. 次のステップ

本テストシナリオ (Phase 3) 完了後、以下を実施してください:

1. **テストシナリオレビュー**: 品質ゲート (4つの必須要件) が満たされていることを確認
2. **Implementation Phase (Phase 4)**: 本テストシナリオに基づいて実装を実施
   - 推奨実装順序 (Design Documentセクション10.1) に従う
   - 各ファイル実装完了後、該当するユニットテストを実行
   - ビルド＆テスト実行で後方互換性を確認
3. **Test Implementation Phase (Phase 5)**: 新規テストコードを実装
   - Phase 1の新規テスト (4ファイル)
   - Phase 2の新規テスト (4ファイル)
   - 既存テストのimport文修正 (18ファイル)
4. **Testing Phase (Phase 6)**: 全テスト実行とカバレッジ確認
   - ユニットテスト実行
   - 統合テスト実行
   - カバレッジ測定 (80%以上を確認)

---

**テストシナリオ承認日**: 2025-01-20
**次回レビュー日**: Implementation Phase完了後
**承認者**: AI Workflow Agent (Phase 3: Test Scenario)
