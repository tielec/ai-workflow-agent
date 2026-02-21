# AI Workflow Agent - Codebase Exploration Summary

## Project Overview

**Project**: ai-workflow-agent  
**Type**: TypeScript-based AI workflow automation toolkit  
**Package**: ESM (ES2020 modules)  
**Testing Framework**: Jest 30.2.0 with ts-jest  

---

## 1. Project Configuration

### Package.json Test Scripts
```bash
npm test                 # Run all tests (unit + integration)
npm run test:unit       # Run only unit tests (tests/unit)
npm run test:integration # Run integration tests (tests/integration)
npm run test:coverage   # Run tests with coverage reports
```

**Key Dependencies:**
- Jest 30.2.0 with @jest/globals
- ts-jest 29.4.5 for TypeScript transformation
- jest-mock-extended 4.0.0 for advanced mocking
- TypeScript 5.9.3 (strict mode enabled)

### Jest Configuration (jest.config.cjs)
- **Preset**: ts-jest/presets/default-esm
- **Test Environment**: node
- **Module Extensions**: ts, tsx, js, jsx, json, node
- **ESM Modules**: Uses `jest.unstable_mockModule()` for ESM mocking
- **Setup Files**: tests/setup-env.ts
- **Transform Ignore Patterns**: chalk, strip-ansi, ansi-regex, #ansi-styles
- **Module Name Mapper**: Maps .js imports to .ts files for testing

### TypeScript Configuration
- **Target**: ES2021
- **Module**: ES2020
- **Strict Mode**: Enabled
- **Skip Lib Check**: true
- **Force Consistent Casing**: true

---

## 2. Test Setup and Patterns

### Test Environment Setup (tests/setup-env.ts)
```typescript
// Git configuration for integration tests
process.env.GIT_AUTHOR_NAME ??= 'AI Workflow Bot'
process.env.GIT_AUTHOR_EMAIL ??= 'ai-workflow@example.com'
process.env.AI_WORKFLOW_LANGUAGE = 'ja' // Default language
```

### ESM Mocking Pattern (Used in rewrite-issue.test.ts)
```typescript
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// Define mock functions at module scope
const mockGetIssueInfo = jest.fn();

// Mock ESM modules BEFORE importing the tested module
await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
  },
}));

// Import tested module AFTER mocking dependencies
const { handleRewriteIssueCommand } = await import('../../../src/commands/rewrite-issue.js');

describe('Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock return values
    mockGetIssueInfo.mockReturnValue({ /* ... */ });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
```

### Mock Setup Patterns
- **jest.fn()**: Create spy functions
- **jest.spyOn()**: Spy on existing methods (e.g., logger.warn)
- **mockReturnValue()**: Set return values
- **mockResolvedValue()**: For async/Promise returns
- **mockRejectedValue()**: For error scenarios
- **mockImplementation()**: For custom implementations
- **toHaveBeenCalledWith()**: Assert call arguments
- **toHaveBeenCalledTimes()**: Assert call count

### Test Structure Pattern
```typescript
describe('Feature/Module Name', () => {
  // Setup
  beforeEach(() => {
    jest.clearAllMocks();
    // Initialize test data
  });

  // Cleanup
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Grouped test cases
  describe('Normal Cases', () => {
    it('should do something (TC-ID-001)', async () => {
      // Given: Setup test conditions
      const input = /* ... */;
      
      // When: Execute the code
      const result = await functionUnderTest(input);
      
      // Then: Assert expected behavior
      expect(result).toBe(expectedValue);
      expect(mockFunction).toHaveBeenCalledWith(expectedArg);
    });
  });

  describe('Error Cases', () => {
    it('should throw when invalid', async () => {
      await expect(functionUnderTest(invalid)).rejects.toThrow('error message');
    });
  });

  describe('Edge Cases / Boundary Values', () => {
    it('handles boundary case (TC-ID-002)', async () => {
      // Test edge cases like empty strings, null, maximum values, etc.
    });
  });
});
```

---

## 3. Existing Test Files Structure

### tests/unit/core/difficulty-analyzer.test.ts
**Purpose**: Test the DifficultyAnalyzer class  
**Pattern**: Direct class instantiation with mock clients  
**Key Patterns**:
- Mocks claudeClient and codexClient as objects with executeTask() method
- Tests fallback behavior: Claude → Codex → Default
- Validates JSON parsing, error handling, confidence thresholds
- Tests include:
  - Normal cases: Valid JSON responses
  - Error cases: Invalid JSON, missing fields, client failures
  - Edge cases: Confidence boundaries, unknown levels, low confidence escalation
  - Language detection: Japanese vs English prompts

**Example from TC-DA-002**:
```typescript
it('returns moderate difficulty with normalized factors (TC-DA-002)', async () => {
  const claudeClient = {
    executeTask: jest.fn(async () => [
      JSON.stringify({
        level: 'moderate',
        confidence: 0.74,
        factors: { /* ... */ },
      }),
    ]),
  };
  const analyzer = new DifficultyAnalyzer({
    claudeClient: claudeClient as any,
    codexClient: codexClient as any,
    workingDir: process.cwd(),
  });

  const result = await analyzer.analyze(baseInput);

  expect(result.level).toBe('moderate');
  expect(result.analyzer_agent).toBe('claude');
});
```

### tests/unit/commands/rewrite-issue.test.ts
**Purpose**: Test rewrite-issue command handler  
**Pattern**: Complete ESM module mocking with jest.unstable_mockModule()  
**Key Patterns**:
- Extensive mocking of external dependencies (GitHub, PromptLoader, agents)
- Tests both dry-run (preview) and apply modes
- Validates custom instruction handling
- Tests option parsing and validation
- Tests error handling and fallback chains

**Notable Test Categories**:
- TC-UNIT-001 to TC-UNIT-032: Basic functionality tests
- TC-CI-001 to TC-CI-017: Custom instruction feature tests
- TC-INT-004 to TC-INT-012: Integration scenarios

**Example from TC-CI-001**:
```typescript
it('custom instruction specified includes additional instructions in prompt (TC-CI-001)', async () => {
  await handleRewriteIssueCommand({
    issue: '42',
    customInstruction: 'Focus on security',
  });

  const callArgs = mockClaudeExecute.mock.calls[0][0];
  expect(callArgs.prompt).toContain('Additional Instructions');
  expect(callArgs.prompt).toContain('Focus on security');
  expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
});
```

### tests/unit/utils/error-utils.test.ts
**Purpose**: Test error handling utilities  
**Pattern**: Direct function calls with various input types  
**Key Patterns**:
- Tests all branches: Error objects, strings, numbers, null, undefined, objects, Symbols
- Tests "never throw guarantee" - no function should throw
- Uses afterEach for mock restoration
- Organized by function (getErrorMessage, getErrorStack, isError)

**Test Coverage**:
- Normal cases: All supported types
- Boundary cases: Empty strings, null, undefined, zero, Infinity, NaN
- Edge cases: Circular references, custom toString(), Symbol
- Integration: Real try-catch scenarios with different thrown types

### tests/unit/utils/logger.test.ts
**Purpose**: Test logger module  
**Pattern**: Console spy mocking with environment variable manipulation  
**Key Patterns**:
```typescript
beforeEach(() => {
  originalEnv = { ...process.env };
  chalk.level = 3; // Force TrueColor for consistent testing
  consoleLogSpy = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(consoleLogSpy);
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});
```

**Test Scopes**:
- Log Level Control: debug/info/warn/error filtering
- Coloring: ANSI codes with LOG_NO_COLOR support
- Timestamp: YYYY-MM-DD HH:mm:ss format
- Message Formatting: Strings, objects, multiple arguments
- Output Destination: console.log vs console.error
- Edge Cases: Empty strings, null, undefined, circular references

---

## 4. Source Code Structure

### Type Definitions (src/types.ts)

**DifficultyLevel Type**:
```typescript
export type DifficultyLevel = 'simple' | 'moderate' | 'complex';

export interface DifficultyAnalysisResult {
  level: DifficultyLevel;
  confidence: number; // 0.0 to 1.0
  factors: {
    estimated_file_changes: number;
    scope: 'single_file' | 'single_module' | 'multiple_modules' | 'cross_cutting';
    requires_tests: boolean;
    requires_architecture_change: boolean;
    complexity_score: number;
  };
  analyzed_at: string; // ISO 8601
  analyzer_agent: 'claude' | 'codex';
  analyzer_model: string;
}
```

**SupportedLanguage**:
```typescript
export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ja';
```

### Type Definitions (src/types/rewrite-issue.ts)

```typescript
export interface RewriteIssueOptions {
  issueNumber: number;
  language: SupportedLanguage;
  agent: 'auto' | 'codex' | 'claude';
  apply: boolean;
  customInstruction?: string;
}

export interface RewriteAgentResponse {
  newTitle: string;
  newBody: string;
  metrics?: RewriteMetrics;
}

export interface RewriteMetrics {
  completenessScore: number;   // 0-100
  specificityScore: number;    // 0-100
}

export interface RewriteIssueResult {
  success: boolean;
  originalTitle: string;
  originalBody: string;
  newTitle: string;
  newBody: string;
  metrics: RewriteMetrics;
  diff: string;
  error?: string;
}
```

### DifficultyAnalyzer Class (src/core/difficulty-analyzer.ts)

**Constructor**:
```typescript
export class DifficultyAnalyzer {
  constructor(options: DifficultyAnalyzerOptions) {
    this.claudeClient = options.claudeClient ?? null;
    this.codexClient = options.codexClient ?? null;
    this.workingDir = options.workingDir;
  }
}
```

**Public Methods**:
- `analyze(input: DifficultyAnalyzerInput): Promise<DifficultyAnalysisResult>`
  - Primary Claude execution
  - Fallback to Codex if Claude fails
  - Falls back to complex difficulty if all agents fail
  - Escalates low confidence results to complex

**Private Methods**:
- `buildPrompt(input: DifficultyAnalyzerInput): string`
  - Builds prompt from PromptLoader
  - Replaces {{title}}, {{body}}, {{labels}} placeholders

- `runClient(agent, client, modelAlias, prompt): Promise<Result | null>`
  - Executes client.executeTask() with proper error handling
  - Returns null on failure to enable fallback

- `extractResult(messages, agent, model): Result | null`
  - Parses JSON from agent responses
  - Tries direct parsing, then searches for JSON objects in text
  - Normalizes and validates results

- `normalizeResult(raw, agent, model): Result | null`
  - Validates confidence is 0-1
  - Escalates to complex if confidence < 0.5 (CONFIDENCE_THRESHOLD)
  - Returns null if invalid level/confidence

- `tryParseCandidate(candidate): Partial<Result> | null`
  - Attempts direct JSON.parse()
  - Extracts JSON objects from text using regex

- `extractTextBlocks(payload): string[]`
  - Extracts text content from message.content array

- `isDifficultyResult(obj): boolean`
  - Type guard: checks for level (string) and confidence (number)

- `safeParse<T>(value): T | null`
  - Safe JSON parsing with try-catch, returns null on error

### handleRewriteIssueCommand Function (src/commands/rewrite-issue.ts)

**Main Flow**:
1. Parse CLI options
2. Validate environment (GITHUB_REPOSITORY)
3. Initialize GitHub client
4. Fetch issue information
5. Resolve repository path
6. Setup agent clients
7. Get repository context
8. Execute rewrite with agent
9. Generate unified diff
10. Show preview or apply changes

**Key Functions**:
- `parseOptions(rawOptions)`: Parses and validates CLI options
- `validateEnvironment()`: Checks GITHUB_REPOSITORY variable
- `getRepositoryContext(analyzer, repoPath)`: Collects repo info
- `executeRewriteWithAgent(...)`: Runs agent execution with fallback
- `readOutputFile(...)`: Reads JSON output file from agent
- `parseAgentResponseText(...)`: Parses text response as fallback
- `buildResponseFromParsed(...)`: Normalizes parsed JSON to response
- `extractJsonObject(text)`: Extracts JSON from text (brace tracking)
- `generateUnifiedDiff(...)`: Creates unified diff format
- `calculateDefaultMetrics(body)`: Computes metrics from body structure
- `displayDiffPreview(result)`: Shows colored diff in terminal

**Constants**:
```typescript
const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_RESET = '\x1b[0m';
const MAX_CUSTOM_INSTRUCTION_LENGTH = 500;
```

### Utility Files (src/utils/)

#### error-utils.ts
**Functions**:
- `getErrorMessage(error: unknown): string`
  - Error → error.message
  - String → as-is
  - null → "null"
  - undefined → "undefined"
  - Other → String(error)
  - Never throws

- `getErrorStack(error: unknown): string | undefined`
  - Returns error.stack for Error objects only
  - Returns undefined for non-Error
  - Never throws

- `isError(error: unknown): error is Error`
  - Type guard: instanceof Error check
  - Never throws

**Custom Error**:
```typescript
export class ConflictError extends Error {
  public readonly conflictFiles?: string[];
  constructor(message: string, conflictFiles?: string[]) {
    super(message);
    this.name = 'ConflictError';
    this.conflictFiles = conflictFiles;
  }
}
```

#### logger.ts
**Type Definition**:
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

**Functions**:
- `getCurrentLogLevel(): LogLevel`
  - Reads LOG_LEVEL env var
  - Defaults to 'info'

- `isColorDisabled(): boolean`
  - Checks LOG_NO_COLOR env var (supports 'true', '1')

- `getTimestamp(): string`
  - Returns ISO 8601 formatted timestamp (YYYY-MM-DD HH:mm:ss)

- `formatMessage(level, ...args): string`
  - Formats: [YYYY-MM-DD HH:mm:ss [LEVEL] message
  - Objects converted to JSON
  - Multiple args joined with space

- `applyColor(level, message): string`
  - Applies chalk coloring based on level
  - Respects LOG_NO_COLOR flag

- `log(level, ...args): void`
  - Checks log level before output
  - error → console.error
  - Other levels → console.log/warn/debug

**Logger Export**:
```typescript
export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
```

---

## 5. Testing Best Practices Observed

### 1. **Test Naming Convention**
- Format: `should <expected_behavior> (<TC-ID>)`
- Example: `should handle custom instruction with max length (TC-CI-007)`
- TC-ID maps to test scenario documents

### 2. **Given-When-Then Structure**
```typescript
it('description', () => {
  // Given: Setup test conditions
  const input = setupTestData();
  
  // When: Execute the code under test
  const result = functionUnderTest(input);
  
  // Then: Assert expected outcomes
  expect(result).toBe(expectedValue);
});
```

### 3. **Mock Isolation**
- Clear mocks in beforeEach
- Restore mocks in afterEach
- Default setup for all tests
- Override only when test-specific

### 4. **Error Testing**
```typescript
// Test expected errors
await expect(functionUnderTest(invalid)).rejects.toThrow('error message');

// Test error handling
mockFunction.mockRejectedValueOnce(new Error('failure'));
expect(() => functionUnderTest()).toThrow();
```

### 5. **Assertion Patterns**
```typescript
// Exact value matching
expect(result).toBe(expectedValue);

// Approximate matching
expect(result).toBeCloseTo(0.88, 2);

// Partial object matching
expect(callArgs).toEqual(expect.objectContaining({ key: 'value' }));

// Array and string matching
expect(array).toContain(item);
expect(string).toMatch(/pattern/);

// Call verification
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(3);
expect(mockFn).not.toHaveBeenCalled();
```

### 6. **Organized Test Grouping**
```typescript
describe('Feature Name', () => {
  describe('Normal Cases', () => { /* ... */ });
  describe('Error Cases', () => { /* ... */ });
  describe('Edge Cases', () => { /* ... */ });
  describe('Boundary Values', () => { /* ... */ });
  describe('Integration', () => { /* ... */ });
});
```

### 7. **Environment Setup**
- Save/restore process.env in beforeEach/afterEach
- Set up console spies before tests
- Configure test-specific settings (e.g., chalk.level = 3)

### 8. **Mock Function Patterns**
```typescript
// Setup mocks at module scope
const mockFn = jest.fn();

// Configure behavior per test
mockFn.mockReturnValue(value);
mockFn.mockResolvedValue(promise);
mockFn.mockRejectedValue(error);
mockFn.mockImplementation(callback);
mockFn.mockImplementationOnce(callback);

// Verify calls
expect(mockFn.mock.calls[0][0]).toBe(expectedArg);
expect(mockFn.mock.calls).toHaveLength(2);
```

---

## 6. Import Patterns

### ESM Module Imports (Production Code)
```typescript
import { logger } from '../utils/logger.js';
import { config } from '../core/config.js';
import type { DifficultyLevel } from '../types.js';
import { RepositoryAnalyzer } from '../core/repository-analyzer.js';
```

### ESM Module Imports (Test Code)
```typescript
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// Use dynamic imports after jest.unstable_mockModule() calls
const { handleRewriteIssueCommand } = await import('../../../src/commands/rewrite-issue.js');
```

---

## 7. Key Testing Insights

### Jest Configuration for ESM
- **Preset**: ts-jest/presets/default-esm
- **extensionsToTreatAsEsm**: ['.ts']
- **Module Name Mapper**: Maps .js to .ts for testing
- **Transform Ignore Patterns**: Excludes node_modules except specific ESM packages

### Module Mocking Strategy
1. Define mock functions at module scope
2. Use `jest.unstable_mockModule()` for ESM modules
3. Use `jest.fn()` for simple spy functions
4. Use `jest.spyOn()` for object method spying
5. Import tested module AFTER setting up all mocks

### Promise/Async Testing
```typescript
// Test async functions
await expect(asyncFunction()).resolves.toBe(value);
await expect(asyncFunction()).rejects.toThrow();

// Setup async mock returns
mockFn.mockResolvedValue(value);
mockFn.mockRejectedValue(error);
mockFn.mockResolvedValueOnce(value);
```

### Type Safety in Tests
- Use `as any` for mock objects when type strict
- Use generics with type parameters for test data
- Properly type mock functions and results

---

## 8. File Locations Quick Reference

| Purpose | Path |
|---------|------|
| Main types | `/src/types.ts` |
| Rewrite-issue types | `/src/types/rewrite-issue.ts` |
| DifficultyAnalyzer class | `/src/core/difficulty-analyzer.ts` |
| Rewrite-issue command | `/src/commands/rewrite-issue.ts` |
| Error utilities | `/src/utils/error-utils.ts` |
| Logger module | `/src/utils/logger.ts` |
| Difficulty analyzer tests | `/tests/unit/core/difficulty-analyzer.test.ts` |
| Rewrite-issue tests | `/tests/unit/commands/rewrite-issue.test.ts` |
| Error utilities tests | `/tests/unit/utils/error-utils.test.ts` |
| Logger tests | `/tests/unit/utils/logger.test.ts` |
| Jest config | `/jest.config.cjs` |
| Test setup | `/tests/setup-env.ts` |

---

## 9. Summary of Key Classes and Functions

### DifficultyAnalyzer
- **Type**: Class with private helper methods
- **Constructor Parameters**: claudeClient, codexClient, workingDir
- **Main Method**: analyze() → Promise<DifficultyAnalysisResult>
- **Behavior**: 
  - Claude → Codex → Default fallback chain
  - Validates and normalizes JSON responses
  - Escalates low confidence to complex

### handleRewriteIssueCommand
- **Type**: Main async function (exported)
- **Parameters**: RawRewriteIssueOptions
- **Behavior**:
  - Orchestrates entire rewrite workflow
  - Option parsing and validation
  - Agent execution with fallback
  - Diff generation and preview/apply
  - Comprehensive error handling

### Error Utilities
- **getErrorMessage()**: Safe extraction of error strings
- **getErrorStack()**: Safe extraction of stack traces
- **isError()**: Type guard for Error detection

### Logger
- **logger.debug|info|warn|error()**: Unified logging interface
- **Features**: Log levels, color support, timestamps
- **Environment Controls**: LOG_LEVEL, LOG_NO_COLOR

---

This comprehensive summary provides a complete understanding of the existing test patterns, source code structure, and best practices for creating new test files in this codebase.
