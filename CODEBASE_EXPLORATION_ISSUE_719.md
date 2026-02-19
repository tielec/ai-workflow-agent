# AI Workflow Agent - Codebase Exploration Summary

## 1. PROJECT STRUCTURE OVERVIEW

### Top-Level Organization
```
ai-workflow-agent/
├── src/                          # Main source code
│   ├── commands/                 # CLI command handlers
│   │   ├── pr-comment/          # PR comment automation commands
│   │   ├── execute/             # Workflow execution commands
│   │   ├── init.ts              # Initialize workflow
│   │   ├── finalize.ts          # Finalize workflow
│   │   └── auto-*.ts            # Auto-issue/auto-close commands
│   ├── core/                    # Core business logic (Facade Pattern)
│   │   ├── git/                 # Git operations (CommitManager, BranchManager, RemoteManager)
│   │   ├── github/              # GitHub API clients (IssueClient, PullRequestClient, CommentClient, ReviewClient)
│   │   ├── pr-comment/          # PR comment analysis and execution
│   │   ├── git-manager.ts       # Facade for git operations
│   │   ├── github-client.ts     # Facade for GitHub operations
│   │   ├── metadata-manager.ts  # Workflow state management
│   │   └── ...other managers
│   ├── types/                   # TypeScript type definitions
│   │   ├── pr-comment.ts        # PR comment types
│   │   ├── commands.ts          # Command interface types
│   │   └── ...other domain types
│   ├── utils/                   # Utility functions
│   │   ├── error-utils.ts       # Error handling utilities
│   │   ├── logger.ts            # Logging
│   │   └── ...other utilities
│   ├── phases/                  # Workflow phases (planning, design, implementation, etc.)
│   ├── prompts/                 # Prompt templates
│   └── index.ts                 # Entry point

├── tests/
│   ├── unit/                    # Unit tests
│   │   ├── git/                 # Git-related tests
│   │   ├── core/                # Core module tests
│   │   └── ...feature tests
│   ├── integration/             # Integration tests
│   ├── helpers/                 # Test utilities
│   ├── setup-env.ts             # Jest setup configuration
│   └── ...

├── package.json                 # Dependencies & scripts
├── jest.config.cjs              # Jest configuration (ESM + ts-jest)
├── tsconfig.json                # TypeScript configuration
└── ...config files
```

### Key Directories
- **src/commands/pr-comment/**: PR comment automation (init, analyze, execute, finalize)
- **src/core/git/**: Specialized Git managers (CommitManager, BranchManager, RemoteManager, SquashManager)
- **src/core/github/**: GitHub API clients (IssueClient, PullRequestClient, CommentClient, ReviewClient)
- **src/core/pr-comment/**: PR comment analysis and application logic
- **src/types/**: Domain-specific type definitions
- **tests/**: Comprehensive test suite with unit and integration tests

---

## 2. TEST STRUCTURE & FRAMEWORK

### Test Framework Setup
- **Framework**: Jest 30.2.0 with TypeScript support (ts-jest)
- **Testing Library**: @jest/globals (v30.2.0)
- **Mocking**: jest-mock-extended (v4.0.0)
- **Node Version**: ESM modules with Node.js experimental VM modules

### Test Configuration (jest.config.cjs)
```javascript
{
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  // Handles ESM + TypeScript transformation
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }]
  }
}
```

### Test Scripts (package.json)
```bash
npm test                    # Run all tests with experimental VM modules
npm run test:unit          # Run only unit tests
npm run test:integration   # Run only integration tests
npm run test:coverage      # Generate coverage reports
```

### Setup-Env (tests/setup-env.ts)
- Configures Git identity for integration tests
- Sets default language (Japanese)
- Handles global Git configuration (user.name, user.email)

### Test Organization
1. **Unit Tests**: Located in `tests/unit/`
   - Test individual modules in isolation
   - Use jest.mock() for dependencies
   - Example: `tests/unit/git/commit-manager.test.ts`

2. **Integration Tests**: Located in `tests/integration/`
   - Test workflow across multiple components
   - Use ESM mocking with jest.unstable_mockModule()
   - Example: `tests/integration/pr-comment-workflow.test.ts`

3. **Test Helpers**: Located in `tests/helpers/`
   - Mock generators (e.g., createMockOctokit)
   - Reusable test utilities

---

## 3. TEST PATTERNS & CONVENTIONS

### Unit Test Pattern (Example: CommitManager)
```typescript
describe('CommitManager - Message Generation', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;

  beforeEach(() => {
    // Setup mocks
    mockGit = { status: jest.fn(), commit: jest.fn() } as any;
    mockMetadata = { data: { issue_number: '25' }, getData: jest.fn() } as any;
    
    // Instantiate service under test
    commitManager = new CommitManager(mockGit, mockMetadata, mockSecretMasker, '/test/repo');
  });

  test('createCommitMessage_正常系_Phase完了時のメッセージ生成', () => {
    // Given: Setup initial state
    const phaseName = 'requirements';
    const status = 'completed';
    const reviewResult = 'PASS';

    // When: Execute function
    const message = commitManager.createCommitMessage(phaseName, status, reviewResult);

    // Then: Assert results
    expect(message).toContain('Phase 2 (requirements)');
    expect(message).toContain('Issue: #25');
  });
});
```

### Integration Test Pattern (ESM with jest.unstable_mockModule)
```typescript
jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  GitHubClient: jest.fn().mockImplementation(() => githubClientMock),
}));

// Dynamic imports after mock setup
const { handlePRCommentAnalyzeCommand } = await import('../../src/commands/pr-comment/analyze.js');

describe('Integration: pr-comment workflow', () => {
  beforeEach(async () => {
    // Reset all mocks before each test
    jest.resetAllMocks();
    // Reconfigure mock implementations
  });

  it('should analyze PR comments', async () => {
    // Setup: Configure mock return values
    metadataManagerMock.exists.mockResolvedValue(true);
    
    // Execute: Call integration function
    await handlePRCommentAnalyzeCommand(options);
    
    // Verify: Assert behavior
    expect(metadataManagerMock.load).toHaveBeenCalled();
  });
});
```

### Assertion Patterns
- **Equality**: `expect(result).toBe(true)` / `expect(result).toEqual({ ... })`
- **Truthiness**: `expect(result).toBeTruthy()` / `expect(result).toBeFalsy()`
- **Containment**: `expect(array).toContain(item)` / `expect(string).toContain(substring)`
- **Type checks**: `expect(result).toBeDefined()` / `expect(result).toBeNull()`
- **Mock verification**: `expect(mock).toHaveBeenCalled()` / `expect(mock).toHaveBeenCalledWith(...)`

### Naming Convention (Japanese + English Mix)
- Test names use Japanese: `commitPhaseOutput_正常系_変更ファイルあり`
- Format: `<functionName>_<scenario>_<expected_result>`
- Scenarios: `正常系` (normal), `異常系` (error), `境界値` (edge case), `統合` (integration)

---

## 4. EXISTING PR-COMMENT COMMAND PATTERN

### File Structure
```
src/commands/pr-comment/
├── init.ts                 # Initialize PR comment workflow
├── analyze.ts              # Analyze PR comments and generate response plan
├── execute.ts              # Execute response plan (apply changes, post replies)
├── finalize.ts             # Finalize workflow (resolve threads, cleanup)
└── analyze/
    ├── index.ts            # Analysis orchestration
    ├── analyze-runner.ts   # Comment analysis engine
    ├── comment-fetcher.ts  # Fetch comments from GitHub
    ├── comment-formatter.ts # Format comments for processing
    ├── error-handlers.ts   # Error handling utilities
    ├── git-operations.ts   # Git commit operations
    └── agent-utils.ts      # Agent interaction utilities
```

### Command Interface Pattern (from src/commands/pr-comment/analyze.ts)
```typescript
// Exported handler function signature
export async function handlePRCommentAnalyzeCommand(options: PRCommentAnalyzeOptions): Promise<void>

interface PRCommentAnalyzeOptions {
  pr?: string;              // PR number
  prUrl?: string;           // Full PR URL
  commentIds?: string;      // Comma-separated comment IDs to analyze
  dryRun?: boolean;         // Don't write files
  agent?: 'auto' | 'codex' | 'claude';  // Agent preference
}
```

### Workflow Steps
1. **init**: Create metadata structure, initialize state
2. **analyze**: Fetch comments, analyze with AI, generate response plan
3. **execute**: Apply code changes, post replies, update metadata
4. **finalize**: Resolve review threads, cleanup temporary files

### Core Dependencies
- GitHubClient: GitHub API access (comments, PRs, issues)
- PRCommentMetadataManager: State management for PR comments
- ReviewCommentAnalyzer: AI-powered comment analysis
- CodeChangeApplier: Safe application of file changes
- SimpleGit: Git operations

---

## 5. TYPE STRUCTURE

### Main Types File (src/types.ts)
```typescript
export type PhaseName = 'planning' | 'requirements' | 'design' | 'implementation' | ...;
export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type StepName = 'execute' | 'review' | 'revise';
export type DifficultyLevel = 'simple' | 'moderate' | 'complex';
export type SupportedLanguage = 'ja' | 'en';

export interface WorkflowMetadata { ... }
export interface PhaseMetadata { ... }
export interface DesignDecisions { ... }
export interface RemainingTask { ... }
```

### PR-Comment Types (src/types/pr-comment.ts)
```typescript
export type CommentResolutionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
export type ResolutionType = 'code_change' | 'reply' | 'discussion' | 'skip';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type FileChangeType = 'modify' | 'create' | 'delete';

export interface FileChange {
  path: string;
  change_type: FileChangeType;
  content?: string;
  diff?: string;
  start_line?: number;
  end_line?: number;
}

export interface ReviewComment {
  id: number;
  node_id: string;
  thread_id?: string;
  path: string;
  line?: number | null;
  body: string;
  user: string;
  created_at: string;
  updated_at: string;
}

export interface CommentMetadata {
  comment: ReviewComment;
  status: CommentResolutionStatus;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  resolution: CommentResolution | null;
  reply_comment_id: number | null;
  error: string | null;
}

export interface ResponsePlan {
  pr_number: number;
  analyzed_at: string;
  analyzer_agent: string;
  comments: ResponsePlanComment[];
}

export interface ExecutionResult {
  pr_number: number;
  executed_at: string;
  source_plan: string;
  comments: ExecutionResultComment[];
}
```

### Other Type Files
- **src/types/commands.ts**: Command-specific types and interfaces
- **src/types/auto-issue.ts**: Auto-issue generation types
- **src/types/validation.ts**: Input validation types

---

## 6. ERROR UTILITIES (src/utils/error-utils.ts)

### Main Functions
```typescript
/**
 * Extract error message from unknown type safely
 * - Error object: returns error.message
 * - String: returns as-is
 * - null/undefined: returns literal string
 * - Other types: converts with String()
 */
export function getErrorMessage(error: unknown): string

/**
 * Extract stack trace from Error objects only
 * - Returns error.stack if available
 * - Returns undefined for non-Error types
 */
export function getErrorStack(error: unknown): string | undefined

/**
 * Type guard for narrowing unknown to Error type
 * Enables TypeScript type narrowing in catch blocks
 */
export function isError(error: unknown): error is Error
```

### Usage Pattern
```typescript
try {
  await someOperation();
} catch (error) {
  const message = getErrorMessage(error);  // Always returns string
  logger.error(`Operation failed: ${message}`);
}
```

---

## 7. CORE MODULES INTERFACES

### GitManager (src/core/git-manager.ts)
**Facade for Git operations with specialized managers**

```typescript
export class GitManager {
  // Delegated to CommitManager
  async commitPhaseOutput(phaseName: PhaseName, status: 'completed'|'failed', reviewResult?: string)
  async commitStepOutput(phaseName: PhaseName, phaseNumber: number, step: StepName, issueNumber: number, workingDir: string)
  async commitWorkflowInit(issueNumber: number, branchName: string)
  async commitCleanupLogs(issueNumber: number, phase: 'report'|'evaluation'|'finalize')
  createCommitMessage(phaseName: PhaseName, status: 'completed'|'failed', reviewResult?: string): string

  // Delegated to BranchManager
  async createBranch(branchName: string, baseBranch?: string)
  async branchExists(branchName: string, checkRemote?: boolean): boolean
  async getCurrentBranch(): string
  async switchBranch(branchName: string)

  // Delegated to RemoteManager
  async pushToRemote(maxRetries?: number, retryDelay?: number): Promise<PushSummary>
  async pullLatest(branchName?: string)

  // Delegated to SquashManager
  async squashCommits(context: PhaseContext)

  // Common operations
  async getStatus(): Promise<StatusSummary>
}
```

### RemoteManager (src/core/git/remote-manager.ts)
**Specialized manager for remote push/pull operations**

```typescript
export class RemoteManager {
  // Push with retry logic and non-fast-forward handling
  async pushToRemote(maxRetries?: number, retryDelay?: number): Promise<PushSummary>

  // Force push with --force-with-lease (for squash operations)
  async forcePushToRemote(maxRetries?: number, retryDelay?: number): Promise<PushSummary>

  // Pull with explicit merge strategy
  async pullLatest(branchName?: string)

  // Setup GitHub credentials (best-effort)
  private async setupGithubCredentials()

  // Classify retriable vs non-retriable errors
  private isRetriableError(error: unknown): boolean
}
```

### PullRequestClient (src/core/github/pull-request-client.ts)
**GitHub API client for PR operations**

```typescript
export class PullRequestClient {
  // Create PR (with draft support)
  async createPullRequest(title: string, body: string, head: string, base?: string, draft?: boolean)

  // Check for existing PR
  async checkExistingPr(head: string, base?: string): Promise<PullRequestSummary | null>

  // Update PR body
  async updatePullRequest(prNumber: number, body: string)

  // Close PR with optional reason comment
  async closePullRequest(prNumber: number, reason?: string)

  // Mark PR as ready for review (GraphQL with fallback)
  async markPRReady(prNumber: number)

  // Update PR base branch
  async updateBaseBranch(prNumber: number, baseBranch: string)

  // Lookup PR by issue number in body
  async getPullRequestNumber(issueNumber: number): Promise<number | null>
}
```

### GitHubClient (src/core/github-client.ts)
**Facade for all GitHub operations with specialized clients**

```typescript
export class GitHubClient {
  // Issue operations (delegated to IssueClient)
  async getIssue(issueNumber: number)
  async postComment(issueNumber: number, body: string)
  async closeIssueWithReason(issueNumber: number, reason: string)
  async createIssueFromEvaluation(issueNumber: number, remainingTasks: RemainingTask[], evaluationReportPath: string)

  // PR operations (delegated to PullRequestClient)
  async createPullRequest(title: string, body: string, head: string, base?: string, draft?: boolean)
  async checkExistingPr(head: string, base?: string): Promise<PullRequestSummary | null>
  async updatePullRequest(prNumber: number, body: string)
  async closePullRequest(prNumber: number, reason?: string)

  // Comment operations (delegated to CommentClient)
  async postWorkflowProgress(issueNumber: number, phase: string, status: string, metadata: MetadataManager)
  async createOrUpdateProgressComment(issueNumber: number, content: string)

  // Review operations (delegated to ReviewClient)
  async postReviewResult(issueNumber: number, phase: string, result: string, feedback: string, suggestions: string[])

  // PR information access
  async getPullRequestBody(prNumber: number): string
  async getPullRequestInfo(prNumber: number): PRInfo
  getRepositoryInfo(): { owner: string; repo: string; repositoryName: string }

  // Utility methods
  generatePrBodyTemplate(issueNumber: number, branchName: string): string
  extractPhaseOutputs(issueNumber: number, phaseOutputs: Record<string, string>)
}
```

### ChangeApplier (src/core/pr-comment/change-applier.ts)
**Safe application of file changes from AI suggestions**

```typescript
export class CodeChangeApplier {
  // Apply changes with security validation
  async apply(changes: FileChange[], dryRun?: boolean): Promise<ChangeApplyResult>

  // Validate file path (prevent path traversal)
  validateFilePath(targetPath: string): { valid: boolean; reason?: string }

  // Check against excluded patterns (secrets, sensitive files)
  isExcludedFile(targetPath: string): boolean

  // Internal operations
  private async applyChange(change: FileChange)
  private async createFile(fullPath: string, content: string)
  private async modifyFile(fullPath: string, change: FileChange)
  private async deleteFile(fullPath: string)
  private sanitizeContent(content: string, fullPath: string): string
}
```

---

## 8. CODING CONVENTIONS OBSERVED

### Error Handling
- Use `getErrorMessage(error)` for safe error extraction
- Always wrap unknown errors: `catch (error) { const msg = getErrorMessage(error); }`
- Log errors at appropriate levels (error, warn, debug)
- Return error objects in result types: `{ success: false, error: string }`

### Logging
- Use `logger.debug()` for detailed execution flow
- Use `logger.info()` for user-relevant progress
- Use `logger.warn()` for recoverable issues
- Use `logger.error()` for failures
- Avoid logging sensitive data (use `encodeWarning()` helper)

### Type Safety
- Export types from modules for external use
- Use `Partial<T>` for optional configuration overrides
- Define specific return types: `Promise<SpecificResult>` instead of `Promise<any>`
- Use discriminated unions for operation results

### Async/Await Patterns
- Always use async/await for clarity
- Use Promise.all() for parallel operations
- Handle timeouts with explicit delay functions: `import { setTimeout as delay } from 'node:timers/promises'`

### Module Organization
- **Facade Pattern**: High-level managers delegate to specialized managers
- **Dependency Injection**: Pass dependencies via constructor
- **Single Responsibility**: Each manager handles one domain

### Testing Patterns
- **Arrange-Act-Assert**: Given/When/Then comment structure
- **Mock Everything**: Use jest.mock() for all external dependencies
- **Isolation**: Each test is independent with beforeEach/afterEach
- **Real Files**: Use temp directories for file system operations in tests
- **Comprehensive Assertions**: Verify both success and error paths

### File & Directory Management
- Use `fs-extra` for enhanced file operations
- Create required parent directories automatically
- Handle both existing and non-existing files gracefully
- Use absolute paths where possible, resolve relative paths

---

## 9. CODING STYLE OBSERVATIONS

### TypeScript
- Strict null checks enabled (`strict: true`)
- Use type annotations explicitly
- Prefer `type` over `interface` for simple definitions
- Avoid `any` - use `unknown` with type guards

### Imports/Exports
- ESM modules: `import ... from '...js'` (note `.js` extension)
- Named exports for public APIs
- Re-export types for backward compatibility
- Use dynamic imports for ESM mocking in tests

### Comments & Documentation
- Use JSDoc for public APIs
- Include examples in documentation
- Japanese comments for business logic context
- Single-line comments for implementation details

---

## 10. TEST UTILITIES & HELPERS

### Mock Creation
```typescript
// createMockOctokit from tests/helpers/mock-octokit.ts
export function createMockOctokit(overrides?: MockOctokitApis): MockOctokit {
  // Returns fully-typed mock Octokit with issues, pulls, search, repos APIs
}
```

### Common Mock Patterns
```typescript
// Jest mock functions
const mockFn = jest.fn();
const mockFn = jest.fn().mockResolvedValue(value);
const mockFn = jest.fn().mockRejectedValue(error);
const mockFn = jest.fn().mockImplementation((args) => ({ ... }));

// Reset mocks
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.resetAllMocks());

// Verify calls
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(expected);
expect(mockFn).toHaveBeenCalledTimes(n);
```

### Test Environment Setup
- **Git Config**: Handled by tests/setup-env.ts
- **Temp Directories**: Use `path.join(os.tmpdir(), 'test-' + Date.now())`
- **Cleanup**: Use `afterEach()` with `fs.removeSync()`

---

## 11. PACKAGE.JSON DEPENDENCIES

### Testing Dependencies
```json
{
  "@jest/globals": "^30.2.0",
  "jest": "^30.2.0",
  "jest-mock-extended": "^4.0.0",
  "ts-jest": "^29.4.5",
  "@types/jest": "^30.0.0"
}
```

### Build/Dev Tools
```json
{
  "typescript": "^5.9.3",
  "tsx": "^4.11.0",
  "cross-env": "^10.1.0"
}
```

### Runtime Dependencies
```json
{
  "@anthropic-ai/sdk": "^0.71.0",
  "@octokit/rest": "^20.1.0",
  "simple-git": "^3.27.0",
  "fs-extra": "^11.2.0"
}
```

---

## 12. KEY INTERFACES FOR EXTENSION

### When Adding New Tests

1. **Use createMockOctokit()** for GitHub API mocking
2. **Follow Given/When/Then** pattern for clarity
3. **Mock at module boundaries** with jest.unstable_mockModule() for ESM
4. **Test both success and error** paths
5. **Use proper naming**: `<function>_<scenario>_<expected>`

### When Adding New Error Handling

1. **Use getErrorMessage()** to safely extract error text
2. **Classify errors** as retriable vs permanent
3. **Log with context** - include operation name and relevant data
4. **Return structured errors** in result objects

### When Adding New Git/GitHub Operations

1. **Use existing managers** (GitManager, GitHubClient)
2. **Delegate to specialized** managers where applicable
3. **Handle authentication** with config fallback
4. **Retry transient failures** with exponential backoff
5. **Sanitize sensitive data** in logs

---

## Summary of Key Design Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Facade** | GitManager, GitHubClient | Unified interface to specialized managers |
| **Dependency Injection** | Constructor params | Testability & flexibility |
| **Error Result Objects** | All managers | Safe error propagation |
| **Type Discrimination** | Union types + status | Runtime type safety |
| **Arranged-Act-Assert** | All tests | Clear test intent |
| **Mock Module ESM** | Integration tests | Jest compatibility with ESM |
| **Temp File Testing** | File-based tests | Real filesystem without pollution |

