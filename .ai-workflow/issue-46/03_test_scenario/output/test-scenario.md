# テストシナリオ書: Issue #46

**作成日**: 2025-01-20
**Issue番号**: #46
**Issue タイトル**: リファクタリング: execute.ts を小さなモジュールに分解（683行）
**対象リポジトリ**: tielec/ai-workflow-agent

---

## 0. Planning Document & Requirements & Design の確認

### Planning Document の概要

Planning Document（`.ai-workflow/issue-46/00_planning/output/planning.md`）で策定された開発計画を踏まえ、以下の方針でテストシナリオを策定します：

- **実装戦略**: REFACTOR（既存機能を保持しつつ、複数のモジュールに分割）
- **テスト戦略**: UNIT_ONLY（既存の統合テストを回帰テストとして活用し、新規ユニットテストを追加）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張 + 新規テスト作成）
- **見積もり工数**: 24~32時間（3~4営業日相当）
- **リスク評価**: 中（非破壊的リファクタリング、既存テストでカバーされているが、インポート文修正時の誤りが混入しやすい）

### Requirements の概要

要件定義書（`.ai-workflow/issue-46/01_requirements/output/requirements.md`）では以下の機能要件が定義されています：

- **FR-1**: モジュール分割（4つのモジュール + ファサード）
- **FR-2**: options-parser モジュール（CLIオプション解析とバリデーション）
- **FR-3**: agent-setup モジュール（エージェント初期化と認証情報解決）
- **FR-4**: workflow-executor モジュール（ワークフロー実行ロジック）
- **FR-5**: phase-factory モジュール（フェーズインスタンス生成）
- **FR-6**: ファサードパターンによる後方互換性維持
- **FR-7**: インポート文の整理

### Design の概要

詳細設計書（`.ai-workflow/issue-46/02_design/output/design.md`）で定義されたモジュール構造に基づいて、各モジュールのユニットテストシナリオを策定します。

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略（Phase 2から引用）

**UNIT_ONLY**

### テスト対象の範囲

本リファクタリングでは、以下の4つの新規モジュールと既存のファサード実装に対するユニットテストを作成します：

1. **options-parser モジュール** (`src/commands/execute/options-parser.ts`)
2. **agent-setup モジュール** (`src/commands/execute/agent-setup.ts`)
3. **workflow-executor モジュール** (`src/commands/execute/workflow-executor.ts`)
4. **phase-factory モジュール** (`src/core/phase-factory.ts`)
5. **execute.ts ファサード実装** (`src/commands/execute.ts`)

### テストの目的

1. **モジュール分割の検証**: 各モジュールが単一の責務を持ち、独立してテスト可能であることを検証
2. **後方互換性の検証**: ファサードパターンにより、既存の公開API（`handleExecuteCommand`, `executePhasesSequential`, `createPhaseInstance` 等）が変更なく動作することを検証
3. **エラーハンドリングの検証**: 各モジュールが異常系で適切なエラーメッセージを返すことを検証
4. **既存機能の保持**: リファクタリング前後で機能が100%保持されていることを検証

### 既存テストとの関係

- **既存の統合テスト**: `preset-execution.test.ts`, `multi-repo-workflow.test.ts` 等は回帰テストとして活用（変更不要）
- **既存のユニットテスト**: `tests/unit/commands/execute.test.ts` を拡張（既存テストは維持）
- **新規ユニットテスト**: 各新規モジュールに対応するテストファイルを作成

---

## 2. Unitテストシナリオ

### 2.1 options-parser モジュール

**テストファイル**: `tests/unit/commands/execute/options-parser.test.ts`

#### 2.1.1 parseExecuteOptions() - 正常系

**テストケース名**: `parseExecuteOptions_正常系_標準オプション`

- **目的**: ExecuteCommandOptions を正規化し、デフォルト値を補完することを検証
- **前提条件**: ExecuteCommandOptions が正常に渡される
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ParsedExecuteOptions = {
    issueNumber: '46',
    phaseOption: 'planning',
    presetOption: undefined,
    agentMode: 'auto',
    skipDependencyCheck: false,
    ignoreDependencies: false,
    forceReset: false,
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `parseExecuteOptions_正常系_プリセットオプション`

- **目的**: プリセットオプション指定時に正しく正規化されることを検証
- **前提条件**: ExecuteCommandOptions にプリセットが指定されている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    preset: 'review-requirements',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ParsedExecuteOptions = {
    issueNumber: '46',
    phaseOption: 'all',
    presetOption: 'review-requirements',
    agentMode: 'auto',
    skipDependencyCheck: false,
    ignoreDependencies: false,
    forceReset: false,
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `parseExecuteOptions_正常系_エージェントモード指定`

- **目的**: エージェントモード（codex/claude/auto）が正しく設定されることを検証
- **前提条件**: ExecuteCommandOptions にエージェントモードが指定されている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'implementation',
    agent: 'codex',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ParsedExecuteOptions = {
    issueNumber: '46',
    phaseOption: 'implementation',
    presetOption: undefined,
    agentMode: 'codex',
    skipDependencyCheck: false,
    ignoreDependencies: false,
    forceReset: false,
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `parseExecuteOptions_正常系_forceResetフラグ`

- **目的**: forceReset フラグが正しく設定されることを検証
- **前提条件**: ExecuteCommandOptions に forceReset が指定されている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'all',
    forceReset: true,
  };
  ```
- **期待結果**:
  ```typescript
  const result: ParsedExecuteOptions = {
    issueNumber: '46',
    phaseOption: 'all',
    presetOption: undefined,
    agentMode: 'auto',
    skipDependencyCheck: false,
    ignoreDependencies: false,
    forceReset: true,
    cleanupOnComplete: false,
    cleanupOnCompleteForce: false,
  };
  ```
- **テストデータ**: 上記 options

---

#### 2.1.2 validateExecuteOptions() - 正常系

**テストケース名**: `validateExecuteOptions_正常系_標準オプション`

- **目的**: 正常なオプションが検証を通過することを検証
- **前提条件**: ExecuteCommandOptions が正常に渡される
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ValidationResult = {
    valid: true,
    errors: [],
  };
  ```
- **テストデータ**: 上記 options

---

#### 2.1.3 validateExecuteOptions() - 異常系

**テストケース名**: `validateExecuteOptions_異常系_相互排他オプション_presetとphase`

- **目的**: --preset と --phase が同時指定された場合にエラーを返すことを検証
- **前提条件**: ExecuteCommandOptions に preset と phase が同時指定されている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
    preset: 'review-requirements',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ValidationResult = {
    valid: false,
    errors: ["Options '--preset' and '--phase' are mutually exclusive."],
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `validateExecuteOptions_異常系_相互排他オプション_skipDependencyCheckとignoreDependencies`

- **目的**: --skip-dependency-check と --ignore-dependencies が同時指定された場合にエラーを返すことを検証
- **前提条件**: ExecuteCommandOptions に skipDependencyCheck と ignoreDependencies が同時指定されている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
    skipDependencyCheck: true,
    ignoreDependencies: true,
  };
  ```
- **期待結果**:
  ```typescript
  const result: ValidationResult = {
    valid: false,
    errors: ["Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive."],
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `validateExecuteOptions_異常系_必須オプション不足`

- **目的**: 必須オプション（--issue）が不足している場合にエラーを返すことを検証
- **前提条件**: ExecuteCommandOptions に issue が指定されていない
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    phase: 'planning',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ValidationResult = {
    valid: false,
    errors: ["Option '--issue' is required."],
  };
  ```
- **テストデータ**: 上記 options

---

**テストケース名**: `validateExecuteOptions_異常系_phaseとpresetが両方未指定`

- **目的**: --phase と --preset が両方未指定の場合にエラーを返すことを検証
- **前提条件**: ExecuteCommandOptions に phase と preset が指定されていない
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
  };
  ```
- **期待結果**:
  ```typescript
  const result: ValidationResult = {
    valid: false,
    errors: ["Either '--phase' or '--preset' must be specified."],
  };
  ```
- **テストデータ**: 上記 options

---

### 2.2 agent-setup モジュール

**テストファイル**: `tests/unit/commands/execute/agent-setup.test.ts`

#### 2.2.1 resolveAgentCredentials() - 正常系

**テストケース名**: `resolveAgentCredentials_正常系_CODEX_API_KEY存在`

- **目的**: CODEX_API_KEY 環境変数が存在する場合に正しく解決されることを検証
- **前提条件**: CODEX_API_KEY 環境変数が設定されている
- **入力**:
  ```typescript
  process.env.CODEX_API_KEY = 'test-codex-key';
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: 'test-codex-key',
    claudeCredentialsPath: null,
  };
  ```
- **テストデータ**: 上記環境変数、homeDir、repoRoot
- **モック**: `config.getCodexApiKey()` が 'test-codex-key' を返す

---

**テストケース名**: `resolveAgentCredentials_正常系_OPENAI_API_KEYフォールバック`

- **目的**: CODEX_API_KEY が存在しない場合、OPENAI_API_KEY にフォールバックすることを検証
- **前提条件**: CODEX_API_KEY 環境変数が未設定、OPENAI_API_KEY が設定されている
- **入力**:
  ```typescript
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: 'test-openai-key',
    claudeCredentialsPath: null,
  };
  ```
- **テストデータ**: 上記環境変数、homeDir、repoRoot
- **モック**: `config.getCodexApiKey()` が 'test-openai-key' を返す

---

**テストケース名**: `resolveAgentCredentials_正常系_CLAUDE_CODE_CREDENTIALS_PATH環境変数`

- **目的**: CLAUDE_CODE_CREDENTIALS_PATH 環境変数が存在する場合に正しく解決されることを検証
- **前提条件**: CLAUDE_CODE_CREDENTIALS_PATH 環境変数が設定されている
- **入力**:
  ```typescript
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  const claudeCredentialsPath = '/custom/path/credentials.json';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: null,
    claudeCredentialsPath: '/custom/path/credentials.json',
  };
  ```
- **テストデータ**: 上記 homeDir、repoRoot、claudeCredentialsPath
- **モック**:
  - `config.getClaudeCredentialsPath()` が '/custom/path/credentials.json' を返す
  - `fs.existsSync('/custom/path/credentials.json')` が true を返す

---

**テストケース名**: `resolveAgentCredentials_正常系_ホームディレクトリフォールバック`

- **目的**: CLAUDE_CODE_CREDENTIALS_PATH が存在しない場合、~/.claude-code/credentials.json にフォールバックすることを検証
- **前提条件**: CLAUDE_CODE_CREDENTIALS_PATH 環境変数が未設定、~/.claude-code/credentials.json が存在
- **入力**:
  ```typescript
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: null,
    claudeCredentialsPath: '/home/user/.claude-code/credentials.json',
  };
  ```
- **テストデータ**: 上記 homeDir、repoRoot
- **モック**:
  - `config.getClaudeCredentialsPath()` が null を返す
  - `fs.existsSync('/home/user/.claude-code/credentials.json')` が true を返す

---

**テストケース名**: `resolveAgentCredentials_正常系_リポジトリルートフォールバック`

- **目的**: ~/.claude-code/credentials.json が存在しない場合、<repo>/.claude-code/credentials.json にフォールバックすることを検証
- **前提条件**: 上記2つが存在しない、<repo>/.claude-code/credentials.json が存在
- **入力**:
  ```typescript
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: null,
    claudeCredentialsPath: '/workspace/repo/.claude-code/credentials.json',
  };
  ```
- **テストデータ**: 上記 homeDir、repoRoot
- **モック**:
  - `config.getClaudeCredentialsPath()` が null を返す
  - `fs.existsSync('/home/user/.claude-code/credentials.json')` が false を返す
  - `fs.existsSync('/workspace/repo/.claude-code/credentials.json')` が true を返す

---

#### 2.2.2 resolveAgentCredentials() - 異常系

**テストケース名**: `resolveAgentCredentials_異常系_認証情報なし`

- **目的**: Codex API キーも Claude 認証情報も存在しない場合に null を返すことを検証
- **前提条件**: すべての認証情報が存在しない
- **入力**:
  ```typescript
  const homeDir = '/home/user';
  const repoRoot = '/workspace/repo';
  ```
- **期待結果**:
  ```typescript
  const result: CredentialsResult = {
    codexApiKey: null,
    claudeCredentialsPath: null,
  };
  ```
- **テストデータ**: 上記 homeDir、repoRoot
- **モック**:
  - `config.getCodexApiKey()` が null を返す
  - `config.getClaudeCredentialsPath()` が null を返す
  - すべての `fs.existsSync()` が false を返す

---

#### 2.2.3 setupAgentClients() - 正常系

**テストケース名**: `setupAgentClients_正常系_codexモード`

- **目的**: codex モード時に CodexAgentClient のみ初期化されることを検証
- **前提条件**: agentMode が 'codex'、Codex API キーが存在
- **入力**:
  ```typescript
  const agentMode = 'codex';
  const workingDir = '/workspace/repo';
  const codexApiKey = 'test-codex-key';
  const claudeCredentialsPath = null;
  ```
- **期待結果**:
  ```typescript
  const result: AgentSetupResult = {
    codexClient: CodexAgentClient instance,
    claudeClient: null,
  };
  ```
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath
- **モック**: `CodexAgentClient` コンストラクタ

---

**テストケース名**: `setupAgentClients_正常系_claudeモード`

- **目的**: claude モード時に ClaudeAgentClient のみ初期化されることを検証
- **前提条件**: agentMode が 'claude'、Claude 認証情報が存在
- **入力**:
  ```typescript
  const agentMode = 'claude';
  const workingDir = '/workspace/repo';
  const codexApiKey = null;
  const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';
  ```
- **期待結果**:
  ```typescript
  const result: AgentSetupResult = {
    codexClient: null,
    claudeClient: ClaudeAgentClient instance,
  };
  ```
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath
- **モック**: `ClaudeAgentClient` コンストラクタ

---

**テストケース名**: `setupAgentClients_正常系_autoモード_Codex優先`

- **目的**: auto モード時、Codex API キーが存在する場合に Codex が優先されることを検証
- **前提条件**: agentMode が 'auto'、Codex API キーと Claude 認証情報が両方存在
- **入力**:
  ```typescript
  const agentMode = 'auto';
  const workingDir = '/workspace/repo';
  const codexApiKey = 'test-codex-key';
  const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';
  ```
- **期待結果**:
  ```typescript
  const result: AgentSetupResult = {
    codexClient: CodexAgentClient instance,
    claudeClient: ClaudeAgentClient instance,
  };
  ```
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath
- **モック**: `CodexAgentClient` と `ClaudeAgentClient` コンストラクタ

---

**テストケース名**: `setupAgentClients_正常系_autoモード_Claudeフォールバック`

- **目的**: auto モード時、Codex API キーが存在しない場合に Claude にフォールバックすることを検証
- **前提条件**: agentMode が 'auto'、Codex API キーが存在しない、Claude 認証情報が存在
- **入力**:
  ```typescript
  const agentMode = 'auto';
  const workingDir = '/workspace/repo';
  const codexApiKey = null;
  const claudeCredentialsPath = '/home/user/.claude-code/credentials.json';
  ```
- **期待結果**:
  ```typescript
  const result: AgentSetupResult = {
    codexClient: null,
    claudeClient: ClaudeAgentClient instance,
  };
  ```
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath
- **モック**: `ClaudeAgentClient` コンストラクタ

---

#### 2.2.4 setupAgentClients() - 異常系

**テストケース名**: `setupAgentClients_異常系_codexモードで認証情報なし`

- **目的**: codex モード時に Codex API キーが存在しない場合にエラーをスローすることを検証
- **前提条件**: agentMode が 'codex'、Codex API キーが存在しない
- **入力**:
  ```typescript
  const agentMode = 'codex';
  const workingDir = '/workspace/repo';
  const codexApiKey = null;
  const claudeCredentialsPath = null;
  ```
- **期待結果**: `Error: Agent mode "codex" requires CODEX_API_KEY or OPENAI_API_KEY to be set with a valid Codex API key.` がスローされる
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath

---

**テストケース名**: `setupAgentClients_異常系_claudeモードで認証情報なし`

- **目的**: claude モード時に Claude 認証情報が存在しない場合にエラーをスローすることを検証
- **前提条件**: agentMode が 'claude'、Claude 認証情報が存在しない
- **入力**:
  ```typescript
  const agentMode = 'claude';
  const workingDir = '/workspace/repo';
  const codexApiKey = null;
  const claudeCredentialsPath = null;
  ```
- **期待結果**: `Error: Agent mode "claude" requires Claude Code credentials.json to be available.` がスローされる
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath

---

**テストケース名**: `setupAgentClients_異常系_autoモードで認証情報なし`

- **目的**: auto モード時に両方の認証情報が存在しない場合に両方 null を返すことを検証
- **前提条件**: agentMode が 'auto'、両方の認証情報が存在しない
- **入力**:
  ```typescript
  const agentMode = 'auto';
  const workingDir = '/workspace/repo';
  const codexApiKey = null;
  const claudeCredentialsPath = null;
  ```
- **期待結果**:
  ```typescript
  const result: AgentSetupResult = {
    codexClient: null,
    claudeClient: null,
  };
  ```
- **テストデータ**: 上記 agentMode、workingDir、codexApiKey、claudeCredentialsPath

---

### 2.3 workflow-executor モジュール

**テストファイル**: `tests/unit/commands/execute/workflow-executor.test.ts`

#### 2.3.1 executePhasesSequential() - 正常系

**テストケース名**: `executePhasesSequential_正常系_単一フェーズ実行成功`

- **目的**: 単一フェーズが正常に実行され、ExecutionSummary が success: true を返すことを検証
- **前提条件**: フェーズリストに1つのフェーズが指定されている
- **入力**:
  ```typescript
  const phases: PhaseName[] = ['planning'];
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: true,
    results: {
      planning: { success: true },
    },
  };
  ```
- **テストデータ**: 上記 phases、context、gitManager
- **モック**:
  - `createPhaseInstance()` が PlanningPhase インスタンスを返す
  - `phaseInstance.run()` が true を返す

---

**テストケース名**: `executePhasesSequential_正常系_複数フェーズ順次実行成功`

- **目的**: 複数フェーズが順次実行され、ExecutionSummary が success: true を返すことを検証
- **前提条件**: フェーズリストに複数のフェーズが指定されている
- **入力**:
  ```typescript
  const phases: PhaseName[] = ['planning', 'requirements', 'design'];
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: true,
    results: {
      planning: { success: true },
      requirements: { success: true },
      design: { success: true },
    },
  };
  ```
- **テストデータ**: 上記 phases、context、gitManager
- **モック**:
  - `createPhaseInstance()` が各フェーズのインスタンスを返す
  - 各 `phaseInstance.run()` が true を返す

---

#### 2.3.2 executePhasesSequential() - 異常系

**テストケース名**: `executePhasesSequential_異常系_フェーズ実行失敗`

- **目的**: フェーズ実行が失敗した場合、ExecutionSummary が success: false を返すことを検証
- **前提条件**: フェーズリストに複数のフェーズが指定されている、途中のフェーズが失敗
- **入力**:
  ```typescript
  const phases: PhaseName[] = ['planning', 'requirements', 'design'];
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: false,
    failedPhase: 'requirements',
    error: 'Phase requirements failed.',
    results: {
      planning: { success: true },
      requirements: { success: false },
    },
  };
  ```
- **テストデータ**: 上記 phases、context、gitManager
- **モック**:
  - `createPhaseInstance()` が各フェーズのインスタンスを返す
  - `phaseInstance.run()` が planning で true、requirements で false を返す

---

**テストケース名**: `executePhasesSequential_異常系_フェーズ実行中に例外スロー`

- **目的**: フェーズ実行中に例外がスローされた場合、ExecutionSummary が success: false を返すことを検証
- **前提条件**: フェーズリストに複数のフェーズが指定されている、途中のフェーズで例外
- **入力**:
  ```typescript
  const phases: PhaseName[] = ['planning', 'requirements', 'design'];
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: false,
    failedPhase: 'requirements',
    error: 'Test error message',
    results: {
      planning: { success: true },
      requirements: { success: false, error: 'Test error message' },
    },
  };
  ```
- **テストデータ**: 上記 phases、context、gitManager
- **モック**:
  - `createPhaseInstance()` が各フェーズのインスタンスを返す
  - `phaseInstance.run()` が planning で true、requirements で例外スロー

---

#### 2.3.3 executePhasesFrom() - 正常系

**テストケース名**: `executePhasesFrom_正常系_特定フェーズから実行`

- **目的**: 特定フェーズから開始して、残りのフェーズが順次実行されることを検証
- **前提条件**: startPhase が PHASE_ORDER に存在する
- **入力**:
  ```typescript
  const startPhase: PhaseName = 'requirements';
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: true,
    results: {
      requirements: { success: true },
      design: { success: true },
      test_scenario: { success: true },
      // ... 残りのフェーズ
    },
  };
  ```
- **テストデータ**: 上記 startPhase、context、gitManager
- **モック**:
  - `executePhasesSequential()` が呼び出される（内部委譲の検証）

---

#### 2.3.4 executePhasesFrom() - 異常系

**テストケース名**: `executePhasesFrom_異常系_未知のフェーズ名`

- **目的**: 未知のフェーズ名が指定された場合、ExecutionSummary が success: false を返すことを検証
- **前提条件**: startPhase が PHASE_ORDER に存在しない
- **入力**:
  ```typescript
  const startPhase: PhaseName = 'unknown_phase' as PhaseName;
  const context: PhaseContext = { /* モックコンテキスト */ };
  const gitManager: GitManager = { /* モックGitManager */ };
  ```
- **期待結果**:
  ```typescript
  const result: ExecutionSummary = {
    success: false,
    failedPhase: 'unknown_phase',
    error: 'Unknown phase: unknown_phase',
    results: {} as PhaseResultMap,
  };
  ```
- **テストデータ**: 上記 startPhase、context、gitManager

---

### 2.4 phase-factory モジュール

**テストファイル**: `tests/unit/core/phase-factory.test.ts`

#### 2.4.1 createPhaseInstance() - 正常系

**テストケース名**: `createPhaseInstance_正常系_planningフェーズ`

- **目的**: 'planning' フェーズ名から PlanningPhase インスタンスが生成されることを検証
- **前提条件**: phaseName が 'planning'
- **入力**:
  ```typescript
  const phaseName: PhaseName = 'planning';
  const context: PhaseContext = { /* モックコンテキスト */ };
  ```
- **期待結果**: PlanningPhase インスタンスが返される
- **テストデータ**: 上記 phaseName、context
- **検証項目**:
  - 返されたインスタンスが PlanningPhase のインスタンスであること
  - コンストラクタに baseParams が渡されていること

---

**テストケース名**: `createPhaseInstance_正常系_全10フェーズ`

- **目的**: 10フェーズすべてで対応するインスタンスが生成されることを検証
- **前提条件**: phaseName が PHASE_ORDER のいずれか
- **入力**:
  ```typescript
  const phaseNames: PhaseName[] = [
    'planning', 'requirements', 'design', 'test_scenario',
    'implementation', 'test_implementation', 'testing',
    'documentation', 'report', 'evaluation'
  ];
  const context: PhaseContext = { /* モックコンテキスト */ };
  ```
- **期待結果**: 各フェーズ名に対応するフェーズインスタンスが返される
- **テストデータ**: 上記 phaseNames、context
- **検証項目**:
  - 各フェーズ名に対して正しいクラスのインスタンスが返されること
  - すべてのインスタンスが BasePhase を継承していること

---

#### 2.4.2 createPhaseInstance() - 異常系

**テストケース名**: `createPhaseInstance_異常系_未知のフェーズ名`

- **目的**: 未知のフェーズ名が指定された場合にエラーをスローすることを検証
- **前提条件**: phaseName が PHASE_ORDER に存在しない
- **入力**:
  ```typescript
  const phaseName: PhaseName = 'unknown_phase' as PhaseName;
  const context: PhaseContext = { /* モックコンテキスト */ };
  ```
- **期待結果**: `Error: Unknown phase: unknown_phase` がスローされる
- **テストデータ**: 上記 phaseName、context

---

### 2.5 execute.ts ファサード実装

**テストファイル**: `tests/unit/commands/execute.test.ts`（既存テスト拡張）

#### 2.5.1 既存公開関数の再エクスポート検証

**テストケース名**: `execute_ファサード_executePhasesSequential再エクスポート`

- **目的**: executePhasesSequential が workflow-executor から正しく再エクスポートされていることを検証
- **前提条件**: execute.ts が workflow-executor をインポートしている
- **入力**:
  ```typescript
  import { executePhasesSequential } from './execute.js';
  ```
- **期待結果**: executePhasesSequential が関数として利用可能
- **テストデータ**: なし
- **検証項目**: typeof executePhasesSequential === 'function'

---

**テストケース名**: `execute_ファサード_executePhasesFrom再エクスポート`

- **目的**: executePhasesFrom が workflow-executor から正しく再エクスポートされていることを検証
- **前提条件**: execute.ts が workflow-executor をインポートしている
- **入力**:
  ```typescript
  import { executePhasesFrom } from './execute.js';
  ```
- **期待結果**: executePhasesFrom が関数として利用可能
- **テストデータ**: なし
- **検証項目**: typeof executePhasesFrom === 'function'

---

**テストケース名**: `execute_ファサード_createPhaseInstance再エクスポート`

- **目的**: createPhaseInstance が phase-factory から正しく再エクスポートされていることを検証
- **前提条件**: execute.ts が phase-factory をインポートしている
- **入力**:
  ```typescript
  import { createPhaseInstance } from './execute.js';
  ```
- **期待結果**: createPhaseInstance が関数として利用可能
- **テストデータ**: なし
- **検証項目**: typeof createPhaseInstance === 'function'

---

**テストケース名**: `execute_ファサード_resolvePresetName保持`

- **目的**: resolvePresetName がファサード内で保持されていることを検証
- **前提条件**: execute.ts に resolvePresetName が定義されている
- **入力**:
  ```typescript
  import { resolvePresetName } from './execute.js';
  ```
- **期待結果**: resolvePresetName が関数として利用可能
- **テストデータ**: なし
- **検証項目**: typeof resolvePresetName === 'function'

---

**テストケース名**: `execute_ファサード_getPresetPhases保持`

- **目的**: getPresetPhases がファサード内で保持されていることを検証
- **前提条件**: execute.ts に getPresetPhases が定義されている
- **入力**:
  ```typescript
  import { getPresetPhases } from './execute.js';
  ```
- **期待結果**: getPresetPhases が関数として利用可能
- **テストデータ**: なし
- **検証項目**: typeof getPresetPhases === 'function'

---

#### 2.5.2 handleExecuteCommand() の簡素化検証

**テストケース名**: `handleExecuteCommand_簡素化_options-parser委譲`

- **目的**: handleExecuteCommand が options-parser の validateExecuteOptions と parseExecuteOptions に委譲することを検証
- **前提条件**: handleExecuteCommand が options-parser をインポートしている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };
  ```
- **期待結果**: validateExecuteOptions と parseExecuteOptions が呼び出される
- **テストデータ**: 上記 options
- **モック**:
  - `validateExecuteOptions()` のスパイ
  - `parseExecuteOptions()` のスパイ

---

**テストケース名**: `handleExecuteCommand_簡素化_agent-setup委譲`

- **目的**: handleExecuteCommand が agent-setup の resolveAgentCredentials と setupAgentClients に委譲することを検証
- **前提条件**: handleExecuteCommand が agent-setup をインポートしている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };
  ```
- **期待結果**: resolveAgentCredentials と setupAgentClients が呼び出される
- **テストデータ**: 上記 options
- **モック**:
  - `resolveAgentCredentials()` のスパイ
  - `setupAgentClients()` のスパイ

---

**テストケース名**: `handleExecuteCommand_簡素化_workflow-executor委譲`

- **目的**: handleExecuteCommand が workflow-executor の executePhasesSequential に委譲することを検証
- **前提条件**: handleExecuteCommand が workflow-executor をインポートしている
- **入力**:
  ```typescript
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };
  ```
- **期待結果**: executePhasesSequential が呼び出される
- **テストデータ**: 上記 options
- **モック**:
  - `executePhasesSequential()` のスパイ

---

---

## 3. テストデータ

### 3.1 共通テストデータ

#### ExecuteCommandOptions テストデータ

```typescript
// 正常系: 標準オプション
const validOptions: ExecuteCommandOptions = {
  issue: '46',
  phase: 'planning',
};

// 正常系: プリセットオプション
const validPresetOptions: ExecuteCommandOptions = {
  issue: '46',
  preset: 'review-requirements',
};

// 正常系: forceReset フラグ
const validForceResetOptions: ExecuteCommandOptions = {
  issue: '46',
  phase: 'all',
  forceReset: true,
};

// 異常系: 相互排他オプション
const invalidMutuallyExclusiveOptions: ExecuteCommandOptions = {
  issue: '46',
  phase: 'planning',
  preset: 'review-requirements',
};

// 異常系: 必須オプション不足
const invalidMissingIssueOptions: ExecuteCommandOptions = {
  phase: 'planning',
};

// 異常系: skipDependencyCheck と ignoreDependencies 同時指定
const invalidDependencyOptions: ExecuteCommandOptions = {
  issue: '46',
  phase: 'planning',
  skipDependencyCheck: true,
  ignoreDependencies: true,
};
```

#### PhaseContext テストデータ

```typescript
const mockContext: PhaseContext = {
  workingDir: '/workspace/repo',
  metadataManager: mockMetadataManager,
  codexClient: mockCodexClient,
  claudeClient: mockClaudeClient,
  githubClient: mockGitHubClient,
  skipDependencyCheck: false,
  ignoreDependencies: false,
};
```

### 3.2 モジュール別テストデータ

#### options-parser

- **正常データ**: 上記 validOptions、validPresetOptions、validForceResetOptions
- **異常データ**: invalidMutuallyExclusiveOptions、invalidMissingIssueOptions、invalidDependencyOptions

#### agent-setup

```typescript
// Codex API キー（正常）
const validCodexApiKey = 'sk-test-codex-1234567890abcdef';

// Claude 認証情報パス（正常）
const validClaudeCredentialsPath = '/home/user/.claude-code/credentials.json';

// 認証情報なし（異常）
const noCredentials = {
  codexApiKey: null,
  claudeCredentialsPath: null,
};
```

#### workflow-executor

```typescript
// フェーズリスト（正常）
const validSinglePhase: PhaseName[] = ['planning'];
const validMultiplePhases: PhaseName[] = ['planning', 'requirements', 'design'];

// フェーズリスト（異常）
const invalidPhase: PhaseName[] = ['unknown_phase' as PhaseName];
```

#### phase-factory

```typescript
// すべてのフェーズ名（正常）
const allPhaseNames: PhaseName[] = [
  'planning',
  'requirements',
  'design',
  'test_scenario',
  'implementation',
  'test_implementation',
  'testing',
  'documentation',
  'report',
  'evaluation',
];

// 未知のフェーズ名（異常）
const unknownPhaseName: PhaseName = 'unknown_phase' as PhaseName;
```

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

- **ローカル開発環境**: Node.js 20以上、npm 10以上
- **CI/CD環境**: Jenkins パイプライン（既存の統合テストと同じ環境）

### 4.2 必要な外部サービス・データベース

- **外部サービス**: なし（すべてモック/スタブで対応）
- **データベース**: なし

### 4.3 モック/スタブの必要性

本リファクタリングでは、以下の外部依存をモック/スタブで対応します：

#### モック対象

1. **MetadataManager**: メタデータ読み込み・保存をモック
2. **GitManager**: Git 操作（ブランチ切り替え、pull/push）をモック
3. **CodexAgentClient**: Codex API 呼び出しをモック
4. **ClaudeAgentClient**: Claude API 呼び出しをモック
5. **GitHubClient**: GitHub API 呼び出し（Issue コメント投稿等）をモック
6. **fs-extra**: ファイルシステム操作（fs.existsSync 等）をモック
7. **config**: 環境変数アクセス（getCodexApiKey 等）をモック
8. **BasePhase**: 各フェーズクラスのコンストラクタと run() メソッドをモック

#### モック戦略

- **Vitest の vi.mock()** を使用してモジュールレベルでモック
- **Sinon.js の stub()** を使用して関数レベルでスタブ
- **テストダブル**: 各モジュールの独立性を担保するため、外部依存をすべてモックで置き換え

---

## 5. 品質ゲート（Phase 3）

本テストシナリオは、以下の品質ゲートを満たすことを確認済みです：

- [x] **Phase 2の戦略に沿ったテストシナリオである**
  - テスト戦略: UNIT_ONLY（既存の統合テストは回帰テストとして活用）
  - 4つの新規モジュールと既存のファサード実装に対するユニットテストシナリオを策定

- [x] **主要な正常系がカバーされている**
  - options-parser: 標準オプション、プリセットオプション、エージェントモード指定、forceReset フラグ
  - agent-setup: Codex/Claude/auto モードの初期化、認証情報のフォールバック処理
  - workflow-executor: 単一フェーズ実行、複数フェーズ順次実行、特定フェーズからの実行
  - phase-factory: 10フェーズすべてのインスタンス生成
  - execute.ts ファサード: 既存公開関数の再エクスポート、各モジュールへの委譲

- [x] **主要な異常系がカバーされている**
  - options-parser: 相互排他オプション、必須オプション不足
  - agent-setup: 認証情報なし、無効なAPI Key
  - workflow-executor: フェーズ実行失敗、未知のフェーズ名、例外スロー
  - phase-factory: 未知のフェーズ名

- [x] **期待結果が明確である**
  - すべてのテストケースで具体的な入力・出力・期待結果を記載
  - 検証項目を明確に定義

---

## 6. 成功基準（再掲）

このテストシナリオは、以下の条件をすべて満たす場合に成功とみなされます：

1. **構造改善の検証**: execute.ts が683行から約150行に削減され、循環的複雑度が低下していることをテストで確認できる
2. **単一責任の原則の検証**: 各モジュールが明確な責務を持ち、独立してテスト可能であることを検証
3. **後方互換性の検証**: ファサードパターンにより、既存の公開API（`handleExecuteCommand`, `executePhasesSequential`, `createPhaseInstance` 等）が変更なく動作することを検証
4. **テスト成功**: すべてのユニットテストと統合テスト（既存）が成功する
5. **テストカバレッジ**: 90%以上のカバレッジを維持する
6. **回帰テストの成功**: 既存の統合テスト（`preset-execution.test.ts`, `multi-repo-workflow.test.ts`）が変更なしで動作する

---

## 7. 参考情報

### 類似のリファクタリング事例のテスト戦略

本プロジェクトでは、過去に以下のリファクタリングを実施しており、同様のテスト戦略を適用します：

#### Issue #24: GitHubClient のリファクタリング（v0.3.1）

- **テスト戦略**: UNIT_ONLY
- **テスト内容**: 4つの専門クライアント（IssueClient, PullRequestClient, CommentClient, ReviewClient）のユニットテスト
- **後方互換性**: 既存の統合テストを回帰テストとして活用
- **教訓**: ファサードパターン適用時は、既存の公開APIのテストを保持し、新規モジュールに対する独立したユニットテストを追加

#### Issue #25: GitManager のリファクタリング（v0.3.1）

- **テスト戦略**: UNIT_ONLY
- **テスト内容**: 3つの専門マネージャー（CommitManager, BranchManager, RemoteManager）のユニットテスト
- **後方互換性**: 既存の統合テストを回帰テストとして活用
- **教訓**: Git 操作のモック戦略を確立（simple-git のモック）

### テストフレームワーク

- **ユニットテスト**: Vitest（既存のテストフレームワーク）
- **モック**: Vitest の vi.mock() と Sinon.js の stub()
- **アサーション**: Vitest の expect() API

### 関連ドキュメント

- **CLAUDE.md**: プロジェクト全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想
- **Issue #24**: GitHubClient のリファクタリング（参考事例）
- **Issue #25**: GitManager のリファクタリング（参考事例）

---

**計画書作成日**: 2025-01-20
**想定完了日**: Phase 0〜8 を通じて 24〜32時間（3〜4営業日相当）
