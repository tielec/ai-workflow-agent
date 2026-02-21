# AI Workflow Agent - Codebase Exploration Summary

## Overview

This document provides a comprehensive analysis of the AI Workflow Agent codebase, focusing on the test structure, implementation patterns, and key modules for Issue #721.

**Last Updated**: 2026-02-21
**Repository**: /tmp/ai-workflow-repos-32-b229df2d/ai-workflow-agent
**Scope**: Focus on execute command, options parsing, workflow execution, and test patterns

---

## 1. Directory Structure

### Test Directory Layout

```
tests/
├── helpers/
│   └── mock-octokit.ts                    # Mock Octokit client
├── integration/                           # 71 integration tests
│   ├── auto-issue-workflow.test.ts
│   ├── cleanup-command.test.ts
│   ├── phase-template-refactoring.test.ts
│   ├── pr-comment-analyze-execute.test.ts
│   ├── skip-phases.test.ts
│   └── ... (68 more tests)
├── runtime/                               # 1 runtime test
│   └── auto-close-issue-runtime.test.ts
├── unit/                                  # 150+ unit tests
│   ├── commands/
│   │   ├── execute/
│   │   │   ├── agent-setup.test.ts        # **KEY: execute command setup**
│   │   │   ├── options-parser.test.ts     # **KEY: options parsing**
│   │   │   └── workflow-executor.test.ts  # **KEY: phase execution**
│   │   ├── execute.test.ts
│   │   ├── init.test.ts
│   │   ├── finalize.test.ts
│   │   └── ... (19 more command tests)
│   ├── core/
│   │   ├── config.test.ts                 # **KEY: config singleton**
│   │   ├── logger.test.ts
│   │   ├── metadata-manager.test.ts
│   │   └── ... (33 more core tests)
│   ├── utils/
│   │   ├── logger.test.ts
│   │   ├── error-utils.test.ts            # **KEY: error handling**
│   │   └── ... (3 more util tests)
│   ├── pr-comment/                        # 11 PR comment tests
│   ├── phases/                            # 13 phase tests
│   ├── git/                               # 6 git tests
│   ├── github/                            # 10 GitHub tests
│   └── ... (additional test directories)
├── setup-env.ts                           # Jest setup
└── run-tests.sh                           # Test runner

Total Unit Tests: 150+
Total Integration Tests: 71+
Total Tests: 220+
```

---

## 2. Source File Structure

### Execute Command Implementation

```
src/commands/
├── execute.ts                             # **KEY: Main execute command handler**
└── execute/
    ├── workflow-executor.ts               # **KEY: Phase execution logic**
    ├── options-parser.ts                  # **KEY: CLI option parsing**
    └── agent-setup.ts                     # Agent credential resolution

src/core/
├── config.ts                              # **KEY: Configuration singleton**
├── git-manager.ts
├── github-client.ts
├── metadata-manager.ts
├── logger.ts
└── ... (additional core modules)

src/utils/
├── logger.ts
├── error-utils.ts                         # **KEY: Error handling utilities**
└── ... (additional utilities)

src/types/
├── commands.ts                            # **KEY: Type definitions for commands**
└── ... (additional type definitions)
```

---

## 3. Key Type Definitions

### From `/src/types/commands.ts`

#### ExecuteCommandOptions
```typescript
export interface ExecuteCommandOptions {
  issue: string;                            // Issue number (required)
  phase?: string;                           // Phase name or "all"
  preset?: string;                          // Preset name (mutually exclusive with phase)
  agent?: 'auto' | 'codex' | 'claude';     // Agent mode
  skipDependencyCheck?: boolean;            // Skip dependency validation
  ignoreDependencies?: boolean;             // Ignore dependency warnings
  skipPhases?: string;                      // Comma-separated phases to skip
  forceReset?: boolean;                     // Reset metadata
  cleanupOnComplete?: boolean;              // Delete metadata after completion
  cleanupOnCompleteForce?: boolean;         // Force cleanup without prompt
  language?: string;                        // Workflow language (ja | en)
  // ... 10+ additional fields for LLM, models, git, documents
}
```

#### PhaseContext
```typescript
export type PhaseContext = {
  workingDir: string;
  metadataManager: MetadataManager;
  codexClient: CodexAgentClient | null;
  claudeClient: ClaudeAgentClient | null;
  githubClient: GitHubClient;
  skipDependencyCheck: boolean;
  ignoreDependencies: boolean;
  skipPhases?: PhaseName[];
  presetPhases?: PhaseName[];               // Added for preset execution
  issueGenerationOptions?: IssueGenerationOptions;
  modelOptimizer?: ModelOptimizer | null;
  modelOverrides?: ModelOverrides;
  squashOnComplete?: boolean;
  issueNumber?: number;
  issueInfo?: { title?: string; body?: string };
  language?: SupportedLanguage;
}
```

#### ExecutionSummary
```typescript
export type ExecutionSummary = {
  success: boolean;
  failedPhase?: PhaseName;
  error?: string;
  results: PhaseResultMap;                 // Record<PhaseName, PhaseExecutionResult>
}
```

---

## 4. Key Implementation Files

### 4.1 workflow-executor.ts

**Location**: `/src/commands/execute/workflow-executor.ts`

**Key Functions**:

#### executePhasesSequential()
```typescript
export async function executePhasesSequential(
  phases: PhaseName[],
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary>
```

**Behavior**:
- Executes specified phases in order
- Skips phases in `context.skipPhases`
- Returns immediately on first phase failure
- Handles squash-on-complete for evaluation phase
- Returns `ExecutionSummary` with results

**Key Constants**:
```typescript
const PHASE_ORDER: PhaseName[] = [
  'planning', 'requirements', 'design', 'test_scenario',
  'implementation', 'test_implementation', 'testing',
  'documentation', 'report', 'evaluation',
];
```

#### executePhasesFrom()
```typescript
export async function executePhasesFrom(
  startPhase: PhaseName,
  context: PhaseContext,
  gitManager: GitManager,
  cleanupOnComplete?: boolean,
  cleanupOnCompleteForce?: boolean,
): Promise<ExecutionSummary>
```

**Behavior**:
- Finds start phase in PHASE_ORDER
- Delegates to executePhasesSequential() with remaining phases
- Used for resume functionality

---

### 4.2 options-parser.ts

**Location**: `/src/commands/execute/options-parser.ts`

**Key Interfaces**:

#### ParsedExecuteOptions
```typescript
export interface ParsedExecuteOptions {
  issueNumber: string;                  // Normalized to string
  phaseOption: string;                  // Defaults to 'all'
  presetOption: string | undefined;
  agentMode: 'auto' | 'codex' | 'claude';
  skipDependencyCheck: boolean;
  ignoreDependencies: boolean;
  skipPhases?: PhaseName[];             // Parsed from CSV string
  forceReset: boolean;
  cleanupOnComplete: boolean;
  cleanupOnCompleteForce: boolean;
  followupLlmMode?: 'auto' | 'openai' | 'claude' | 'agent' | 'off';
  followupLlmModel?: string;
  followupLlmTimeout?: number;
  followupLlmMaxRetries?: number;
  followupLlmAppendMetadata?: boolean;
  squashOnComplete: boolean;
  claudeModel?: string;
  codexModel?: string;
  language?: SupportedLanguage;
}
```

#### ValidationResult
```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

**Key Functions**:

#### parseExecuteOptions(options: ExecuteCommandOptions): ParsedExecuteOptions
- Normalizes phase option to lowercase
- Validates agent mode (auto, codex, claude)
- Parses skipPhases comma-separated string to array
- Applies default values
- Validates language option

**Validation Rules** (from `validateExecuteOptions()`):
1. `--issue` is required
2. `--preset` and `--phase` are mutually exclusive
3. `--skip-dependency-check` and `--ignore-dependencies` are mutually exclusive
4. `--preset` and `--skip-phases` cannot be used together
5. `--followup-llm-mode` must be one of: auto, openai, claude, agent, off
6. `--followup-llm-timeout` must be non-negative number
7. `--followup-llm-max-retries` must be non-negative integer
8. Language must be in SUPPORTED_LANGUAGES

**skipPhases Parsing**:
```typescript
function parseSkipPhasesOption(value: string | undefined): PhaseName[] | undefined
```
- Parses comma-separated phase names
- Validates against VALID_PHASE_NAMES
- Prevents skipping 'planning' (all phases depend on it)
- Returns undefined if value is null/empty

---

### 4.3 execute.ts

**Location**: `/src/commands/execute.ts`

**Main Handler**: `handleExecuteCommand(options: ExecuteCommandOptions): Promise<void>`

**Execution Flow**:
1. Validate options with `validateExecuteOptions()`
2. Parse options with `parseExecuteOptions()`
3. Find workflow metadata
4. Load metadata and resolve language
5. Resolve agent credentials
6. Setup agent clients (Codex/Claude)
7. Create PhaseContext
8. Execute phases:
   - If preset: execute specific preset phases
   - If "all": resume from last phase or start fresh
   - Otherwise: execute single phase

**Key Integration Points**:
- Calls `validateExecuteOptions()` from options-parser
- Calls `parseExecuteOptions()` from options-parser
- Calls `resolveAgentCredentials()` from agent-setup
- Calls `setupAgentClients()` from agent-setup
- Calls `executePhasesSequential()` from workflow-executor
- Calls `executePhasesFrom()` from workflow-executor

---

### 4.4 config.ts

**Location**: `/src/core/config.ts`

**Key Interface**: IConfig (26+ methods)

**Config Class Implementation**: Singleton pattern with 26+ getter methods

**Core Methods** (sample):

```typescript
export class Config implements IConfig {
  // GitHub
  getGitHubToken(): string                  // Throws if not set (required)
  getGitHubRepository(): string | null      // Returns owner/repo

  // Agent
  getCodexApiKey(): string | null
  getClaudeCodeToken(): string | null       // OAUTH_TOKEN → API_KEY fallback
  getClaudeDangerouslySkipPermissions(): boolean

  // Models
  getClaudeModel(): string | null
  getCodexModel(): string | null

  // Git
  getGitCommitUserName(): string | null     // GIT_COMMIT_USER_NAME → GIT_AUTHOR_NAME
  getGitCommitUserEmail(): string | null    // GIT_COMMIT_USER_EMAIL → GIT_AUTHOR_EMAIL

  // Paths
  getHomeDir(): string                      // HOME → USERPROFILE (required)
  getReposRoot(): string | null
  getCodexCliPath(): string                 // Default: 'codex'

  // Logging
  getLogLevel(): string                     // Default: 'info'
  getLogNoColor(): boolean

  // Language
  getLanguage(): SupportedLanguage          // Default: 'ja'

  // Follow-up LLM (6 methods)
  getFollowupLlmMode(): 'auto' | 'openai' | 'claude' | 'agent' | 'off' | null
  getFollowupLlmModel(): string | null
  getFollowupLlmTimeoutMs(): number | null
  getFollowupLlmMaxRetries(): number | null
  getFollowupLlmAppendMetadata(): boolean | null
  // ... more

  // Environment
  isCI(): boolean                           // CI=true or JENKINS_HOME exists
  canAgentInstallPackages(): boolean        // AGENT_CAN_INSTALL_PACKAGES
}

export const config = new Config();         // Singleton instance
```

**Environment Variable Strategy**:
- Required variables: `getGitHubToken()`, `getHomeDir()` throw on missing
- Optional variables: Return null if not set
- Fallback chain: Some variables have priority order
  - `CLAUDE_CODE_OAUTH_TOKEN` → `CLAUDE_CODE_API_KEY`
  - `GIT_COMMIT_USER_NAME` → `GIT_AUTHOR_NAME`
  - `HOME` → `USERPROFILE`

---

### 4.5 error-utils.ts

**Location**: `/src/utils/error-utils.ts`

**Key Functions**:

```typescript
export function getErrorMessage(error: unknown): string
```
- Extracts error message safely
- Error object → error.message
- String → returns as-is
- null → "null", undefined → "undefined"
- Other → String(error)
- Never throws

```typescript
export function getErrorStack(error: unknown): string | undefined
```
- Returns error.stack if Error object
- Returns undefined otherwise
- Never throws

```typescript
export function isError(error: unknown): error is Error
```
- Type guard using instanceof Error

**Custom Errors**:
```typescript
export class ConflictError extends Error {
  conflictFiles?: string[];
  constructor(message: string, conflictFiles?: string[])
}
```

---

### 4.6 logger.ts

**Location**: `/src/utils/logger.ts`

**Key Export**: `logger` singleton object

```typescript
export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
```

**Features**:
- Configurable log level via LOG_LEVEL environment variable
- Color output via chalk (disabled with LOG_NO_COLOR=true)
- Timestamp prefix: YYYY-MM-DD HH:mm:ss
- Log level filtering (debug < info < warn < error)
- Object serialization with JSON.stringify fallback

---

## 5. Test Patterns & Conventions

### 5.1 Test Structure (Jest + ESM)

**Configuration**: `/jest.config.cjs`

```javascript
{
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  // ESM module transformation with ts-jest
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
    }]
  },
  // Chalk and ansi modules must be transformed
  transformIgnorePatterns: [
    '/node_modules/(?!(strip-ansi|ansi-regex|chalk|#ansi-styles)/)',
  ],
}
```

**Module Navigation**:
```typescript
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
```

---

### 5.2 Unit Test Patterns

#### Pattern 1: Given-When-Then Structure

```typescript
test('标准オプション: issue と phase が正しく解析される', () => {
  // Given: 標準オプション
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
  };

  // When: オプションを解析
  const result: ParsedExecuteOptions = parseExecuteOptions(options);

  // Then: 正しく正規化される
  expect(result.issueNumber).toBe('46');
  expect(result.phaseOption).toBe('planning');
  expect(result.agentMode).toBe('auto');
});
```

#### Pattern 2: Environment Variable Testing

```typescript
describe('Config - GitHub関連メソッド', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };  // Backup
  });

  afterEach(() => {
    process.env = originalEnv;          // Restore
  });

  test('GITHUB_TOKEN が設定されている場合', () => {
    // Given
    process.env.GITHUB_TOKEN = 'ghp_test_token_123';
    const testConfig = new Config();

    // When
    const result = testConfig.getGitHubToken();

    // Then
    expect(result).toBe('ghp_test_token_123');
  });
});
```

#### Pattern 3: Error Validation Testing

```typescript
test('相互排他オプション検証', () => {
  const options: ExecuteCommandOptions = {
    issue: '46',
    phase: 'planning',
    preset: 'review-requirements',  // Mutually exclusive
  };

  const result: ValidationResult = validateExecuteOptions(options);

  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Options '--preset' and '--phase' are mutually exclusive."
  );
});
```

#### Pattern 4: Mock Function Usage

```typescript
test('AI_WORKFLOW_LANGUAGE が無効値の場合', () => {
  process.env.AI_WORKFLOW_LANGUAGE = 'fr';
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const testConfig = new Config();

  const result = testConfig.getLanguage();

  expect(result).toBe('ja');  // Fallback
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("Invalid AI_WORKFLOW_LANGUAGE value 'fr'")
  );

  warnSpy.mockRestore();
});
```

---

### 5.3 ESM Mock Limitations

**Issue**: ESM mocking in Jest has significant limitations

```typescript
// ❌ Does NOT work in ESM:
jest.mock('../../../../src/commands/execute/workflow-executor.js')

// ❌ Does NOT work in ESM:
jest.spyOn() on ESM exports (read-only)

// ❌ Not using in this project:
jest.unstable_mockModule() (requires complex dynamic imports)

// ✅ Solution: Validation-only testing
// Test parseExecuteOptions, validateExecuteOptions
// Test config getters with environment variables
// Mock only primitive dependencies (env vars, Date, Math)
```

**Note from workflow-executor.test.ts**:
```typescript
/**
 * NOTE: ESM環境でのJest mocking の制限により、実際のフェーズ実行を必要としない
 * バリデーションテストのみを実施しています。フェーズ実行ロジックの詳細なテストは
 * 統合テストで実施されます。
 *
 * 削除されたテスト:
 * - フェーズ実行成功ケース (実際のフェーズ実行が必要)
 * - フェーズ実行失敗ケース (実際のフェーズ実行が必要)
 * - cleanupOnComplete フラグテスト (実際のフェーズ実行が必要)
 * これらは統合テストで十分にカバーされています。
 */
```

---

### 5.4 Mock Fixture Pattern

```typescript
// Test fixture functions for lightweight mock objects

function createMockContext(): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: {} as any,
    codexClient: null,
    claudeClient: null,
    githubClient: {} as any,
    skipDependencyCheck: false,
    ignoreDependencies: false,
  };
}

function createMockGitManager(): GitManager {
  return {} as GitManager;
}

// Usage in tests:
const context = createMockContext();
const gitManager = createMockGitManager();
```

---

## 6. Test Coverage Analysis

### 6.1 Unit Tests - Key Files

| File | Tests | Coverage | Strategy |
|------|-------|----------|----------|
| options-parser.test.ts | 50+ | Comprehensive | Validation, parsing, edge cases |
| config.test.ts | 100+ | Comprehensive | Environment variables, fallbacks |
| workflow-executor.test.ts | 3 | Limited | Validation only (ESM limitation) |
| error-utils.test.ts | 8+ | Comprehensive | All error types, edge cases |
| logger.test.ts | 10+ | Comprehensive | Log levels, colors, formats |

### 6.2 Unit Test Counts

```
commands/
├── execute/
│   ├── options-parser.test.ts: ~50 tests
│   ├── workflow-executor.test.ts: 3 tests (validation only)
│   └── agent-setup.test.ts: ~15 tests
├── execute.test.ts: ~10 tests
├── init.test.ts: ~15 tests
└── ... (19+ test files)

core/
├── config.test.ts: 100+ tests
├── logger.test.ts: 10+ tests
├── metadata-manager.test.ts: 15+ tests
└── ... (33+ test files)

utils/
├── logger.test.ts: 10+ tests
├── error-utils.test.ts: 8+ tests
└── ... (3+ test files)

Total Unit Tests: 150+
```

---

## 7. Key Testing Conventions

### 7.1 Test Naming

```typescript
// ✅ Descriptive test names
test('標準オプション: issue と phase が正しく解析される', () => {...})
test('相互排他オプション: preset と phase が同時指定された場合にエラー', () => {...})
test('無効なフェーズ名はエラーになる', () => {...})

// ✅ Numeric test IDs (for traceability)
test('2.1.1: getGitHubToken_正常系_トークンが設定されている場合', () => {...})

// ✅ Given-When-Then comments
// Given: <setup>
// When: <action>
// Then: <assertion>
```

### 7.2 Assertion Patterns

```typescript
// ✅ Exact match
expect(result).toBe('value')
expect(result.length).toBe(5)

// ✅ Type checking
expect(result).toEqual([...])
expect(typeof config.getGitHubToken).toBe('function')

// ✅ Error messages
expect(result.errors).toContain(message)
expect(() => func()).toThrow('expected error')

// ✅ Mock verification
expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('text'))
```

---

## 8. Integration Points & Dependencies

### 8.1 Call Chain: execute.ts → other modules

```
handleExecuteCommand()
├── validateExecuteOptions()              [options-parser.ts]
├── parseExecuteOptions()                 [options-parser.ts]
├── findWorkflowMetadata()                [repository-utils.ts]
├── MetadataManager()                     [metadata-manager.ts]
├── resolveLanguage()                     [language-resolver.ts]
├── resolveAgentCredentials()             [agent-setup.ts]
├── setupAgentClients()                   [agent-setup.ts]
├── GitHubClient()                        [github-client.ts]
├── GitManager()                          [git-manager.ts]
├── getPresetPhases()                     [execute.ts]
├── executePhasesSequential()             [workflow-executor.ts]
│   ├── createPhaseInstance()             [phase-factory.ts]
│   ├── phaseInstance.run()               [base-phase.ts]
│   └── gitManager.squashCommits()        [git-manager.ts]
└── executePhasesFrom()                   [workflow-executor.ts]
```

### 8.2 External Dependencies (in tests)

```typescript
// ✅ Used and importable
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ✅ Environment variable access (process.env)
process.env.GITHUB_TOKEN = 'token'
delete process.env.GITHUB_TOKEN

// ✅ Mock console methods
jest.spyOn(console, 'warn').mockImplementation(() => {})
```

---

## 9. Key Implementation Insights

### 9.1 Workflow Execution Flow

```
Phase 0: Planning
├─ Phase 1: Requirements
├─ Phase 2: Design
├─ Phase 3: Test Scenario
├─ Phase 4: Implementation
├─ Phase 5: Test Implementation
├─ Phase 6: Testing
├─ Phase 7: Documentation
├─ Phase 8: Report
└─ Phase 9: Evaluation (squash commit if flag set)
```

**Resume Logic**: If interrupted, resume from last incomplete phase (not skipped, not completed)

**Skip Logic**: Phases in `skipPhases` array are skipped but marked as "skipped" (not failed)

### 9.2 Option Parsing Strategy

1. **CLI Input** → ExecuteCommandOptions interface
2. **Normalization** → Lowercase conversion, type coercion
3. **Parsing** → String splitting, enumeration validation
4. **Validation** → Mutual exclusivity checks, range validation
5. **Result** → ParsedExecuteOptions interface

### 9.3 Environment Configuration Pattern

1. **Config class** provides centralized getters
2. **Fallback chain**: Primary env var → Secondary env var
3. **Type coercion**: String → Number, Boolean as needed
4. **Default values**: Apply if env var not set
5. **Error handling**: Throw for required vars, null for optional

---

## 10. Files by Category

### Core Execution

| File | Purpose | Status |
|------|---------|--------|
| /src/commands/execute.ts | Main command handler | Well-implemented |
| /src/commands/execute/workflow-executor.ts | Phase execution orchestration | Well-implemented |
| /src/commands/execute/options-parser.ts | CLI option normalization | Well-implemented |
| /src/commands/execute/agent-setup.ts | Agent credential resolution | Well-implemented |

### Type Definitions

| File | Exports | Location |
|------|---------|----------|
| /src/types/commands.ts | ExecuteCommandOptions, PhaseContext, ExecutionSummary | Core types |

### Configuration & Utilities

| File | Purpose | Test Coverage |
|------|---------|---|
| /src/core/config.ts | Config singleton | 100+ unit tests |
| /src/utils/error-utils.ts | Error message extraction | 8+ tests |
| /src/utils/logger.ts | Logging interface | 10+ tests |

### Tests

| File | Test Count | Pattern |
|------|-----------|---------|
| /tests/unit/commands/execute/options-parser.test.ts | 50+ | Validation, parsing |
| /tests/unit/commands/execute/workflow-executor.test.ts | 3 | Validation only |
| /tests/unit/core/config.test.ts | 100+ | Environment variables |

---

## 11. Critical Patterns for Future Development

### 11.1 Adding New Tests for Issue #721

**Option A: Extend options-parser.test.ts**
- Add tests for new CLI options
- Follow Given-When-Then pattern
- Test validation rules (mutual exclusivity)
- Test parsing of string values

**Option B: Add integration test**
- Test full execute flow with new options
- Mock git/github interactions
- Verify PhaseContext construction
- Verify phase execution call

**Option C: Update config.test.ts**
- Add environment variable tests for new config options
- Use beforeEach/afterEach for env restoration
- Test fallback chains if applicable

### 11.2 Mock Pattern for Phase Execution

```typescript
// Current limitation: Cannot mock phase execution in ESM
// Solution: Use fixture functions for mock context/gitManager

function createMockContext(): PhaseContext { /* ... */ }
function createMockGitManager(): GitManager { /* ... */ }

// Alternative: Use integration tests for actual phase execution
// Location: tests/integration/execute-*.test.ts
```

### 11.3 Environment Variable Testing

```typescript
// Always backup and restore process.env
beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

// Set variables in test
process.env.NEW_VAR = 'value';

// Or delete them
delete process.env.OPTIONAL_VAR;
```

---

## 12. Summary Table

| Aspect | Details |
|--------|---------|
| **Total Unit Tests** | 150+ |
| **Total Integration Tests** | 71+ |
| **Test Framework** | Jest with ts-jest ESM preset |
| **Main Focus** | options-parser, config, workflow-executor |
| **Key Limitation** | ESM mocking prevents unit testing phase execution |
| **Workaround** | Validation tests for parser/config, integration tests for execution |
| **Test Pattern** | Given-When-Then with environment variable management |
| **Type System** | TypeScript with strict interfaces |
| **Mock Strategy** | Fixture functions + environment variable manipulation |
| **Error Handling** | Safe extraction via getErrorMessage() |
| **Logging** | Centralized logger singleton with configurable level |

---

## 13. References

### Key Files for Study
1. `/src/commands/execute/options-parser.ts` - Option parsing logic
2. `/src/commands/execute/workflow-executor.ts` - Phase execution orchestration
3. `/src/core/config.ts` - Configuration management
4. `/tests/unit/commands/execute/options-parser.test.ts` - Test patterns
5. `/tests/unit/core/config.test.ts` - Environment variable testing patterns

### Environment Variables (Key Selection)
- `GITHUB_TOKEN` - Required, GitHub authentication
- `GITHUB_REPOSITORY` - Repository name (owner/repo)
- `CODEX_API_KEY` - Codex agent credentials
- `CLAUDE_CODE_OAUTH_TOKEN` → `CLAUDE_CODE_API_KEY` - Claude agent
- `GIT_COMMIT_USER_NAME` → `GIT_AUTHOR_NAME` - Git identity
- `HOME` → `USERPROFILE` - Home directory
- `LOG_LEVEL` - Logging level (default: info)
- `AI_WORKFLOW_LANGUAGE` - Workflow language (default: ja)
- `AGENT_CAN_INSTALL_PACKAGES` - Package installation permission

---

**End of Document**

