# AI Workflow Agent - Codebase Structure & Implementation Patterns

## 1. Project Overview

The **ai-workflow-agent** is a TypeScript-based automation toolkit that orchestrates GitHub Issue workflows with a 10-phase process (planning → evaluation). It supports dual-agent execution (Codex + Claude), multi-repository workflows, Jenkins integration, and persistent metadata management.

**Key Technologies:**
- TypeScript 5+
- Node.js 20+
- Commander.js for CLI routing
- simple-git for Git operations
- fs-extra for file operations
- Jest for testing

**Directory Structure:**
```
src/
├── commands/              # CLI command handlers
│   ├── init.ts            # Issue initialization
│   ├── execute.ts         # Phase execution orchestrator
│   ├── review.ts          # Phase review
│   ├── rollback.ts        # Rollback mechanism
│   ├── finalize.ts        # Workflow completion
│   ├── cleanup.ts         # Artifact cleanup
│   ├── pr-comment/        # PR comment auto-response feature
│   │   ├── init.ts        # Initialize PR comment metadata
│   │   ├── analyze.ts     # Analyze comments with agent
│   │   ├── execute.ts     # Execute comment resolutions
│   │   └── finalize.ts    # Resolve threads & cleanup
│   └── execute/           # Execution sub-commands
│       ├── options-parser.ts
│       ├── agent-setup.ts
│       └── workflow-executor.ts
├── core/                  # Core business logic
│   ├── metadata-manager.ts     # Workflow state persistence
│   ├── git/                    # Git operations
│   │   ├── branch-manager.ts
│   │   ├── commit-manager.ts
│   │   ├── squash-manager.ts   # Commit squashing (Issue #194)
│   │   ├── remote-manager.ts
│   │   └── file-selector.ts
│   ├── analyzer/               # Repository analysis modules (Issue #579)
│   │   ├── types.ts            # Shared analyzer types
│   │   ├── path-exclusion.ts   # Path filtering utilities
│   │   ├── output-parser.ts    # JSON output parsing
│   │   ├── candidate-validator.ts # Validation logic
│   │   ├── agent-executor.ts   # Agent execution service
│   │   └── index.ts            # Barrel exports
│   ├── repository-analyzer.ts  # Repository analysis facade (uses analyzer/)
│   ├── pr-comment/             # PR comment feature core
│   │   ├── metadata-manager.ts # Comment resolution tracking
│   │   ├── comment-analyzer.ts # Analysis engine
│   │   └── change-applier.ts   # Code change application
│   ├── github/                 # GitHub API clients
│   │   ├── comment-client.ts   # PR comment API
│   │   ├── issue-client.ts
│   │   └── pull-request-client.ts
│   ├── codex-agent-client.ts   # Codex agent wrapper
│   ├── claude-agent-client.ts  # Claude agent wrapper
│   ├── github-client.ts        # GitHub facade
│   ├── secret-masker.ts        # Secret detection & masking (Issue #488)
│   └── helpers/                # Utilities
│       ├── metadata-io.ts
│       ├── validation.ts
│       └── error-utils.ts
├── phases/                # 10-phase implementation
│   ├── planning.ts
│   ├── requirements.ts
│   ├── design.ts
│   ├── test-scenario.ts
│   ├── implementation.ts
│   ├── test-implementation.ts
│   ├── testing.ts
│   ├── documentation.ts
│   ├── report.ts
│   ├── evaluation.ts
│   └── base-phase.ts      # Abstract phase template
├── types/                 # TypeScript type definitions
│   ├── commands.ts        # CLI command option interfaces
│   ├── pr-comment.ts      # PR comment type definitions
│   └── auto-issue.ts
├── prompts/               # Agent prompt templates by phase/language (copied to dist/)
├── templates/             # PR body templates
├── main.ts                # CLI definition (Commander)
└── index.ts               # Bin entry point

tests/
├── unit/
│   └── pr-comment/        # PR comment feature tests
│       ├── metadata-manager.test.ts
│       ├── analyze-command.test.ts
│       ├── execute-command.test.ts
│       ├── finalize-command.test.ts
│       └── ...
└── integration/
    └── pr-comment-*.test.ts
```

---

## 2. Key File Descriptions

### 2.1 CLI Definition (`src/main.ts`)

**Pattern**: Command router using Commander.js

```typescript
// Line 1-28: Program initialization
const program = new Command();
program.name('ai-workflow-v2').version('0.1.0');

// Commands:
// - init: Initialize workflow from GitHub Issue URL
// - execute: Run specific phase or preset
// - review: Display phase review status
// - rollback: Manual/auto rollback to earlier phase
// - pr-comment: Auto-respond to PR review comments
// - finalize: Cleanup & squash commits on completion
```

**Design Pattern:**
- Thin router layer (delegates to handler functions)
- Options parsed by Commander.js
- Centralized error handling via `reportFatalError()`
- No business logic in main.ts

### 2.2 Type Definitions (`src/types/commands.ts` & `src/types/pr-comment.ts`)

**PR Comment Types** (Issue #383):

```typescript
// Status workflow
type CommentResolutionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'

// Resolution types
type ResolutionType = 'code_change' | 'reply' | 'discussion' | 'skip'
type ConfidenceLevel = 'high' | 'medium' | 'low'

// Core interfaces
interface ReviewComment {
  id: number                    // REST API ID
  node_id: string              // GraphQL node ID
  thread_id?: string           // For resolving threads
  path: string                 // File path
  line?: number | null         // Line number
  body: string                 // Comment text
  user: string                 // Author
  diff_hunk?: string           // Code context
}

interface CommentResolution {
  type: ResolutionType
  confidence: ConfidenceLevel
  changes?: FileChange[]       // For code_change type
  reply: string               // Response text
}

interface CommentMetadata {
  comment: ReviewComment
  status: CommentResolutionStatus
  started_at: string | null
  completed_at: string | null
  retry_count: number
  resolution: CommentResolution | null
  reply_comment_id: number | null
  resolved_at: string | null   // After thread resolution
  error: string | null
}

interface CommentResolutionMetadata {
  version: string
  pr: PRInfo
  repository: RepositoryInfo
  comments: Record<string, CommentMetadata>
  summary: ResolutionSummary    // Auto-calculated
  cost_tracking: CostTracking   // Token tracking
  analyze_completed_at?: string | null
  execute_completed_at?: string | null
  response_plan_path?: string | null
  execution_result_path?: string | null
  analyzer_agent?: string | null    // 'codex', 'claude', or 'fallback'
  analyzer_error?: string | null
  analyzer_error_type?: AnalyzerErrorType
}
```

**Key Points:**
- Tracks both REST API IDs and GraphQL node IDs for compatibility
- Thread ID required for resolving GitHub review threads
- Cost tracking for token usage monitoring
- Analyzer error handling with fallback support

### 2.3 PR Comment Metadata Manager (`src/core/pr-comment/metadata-manager.ts`)

**Responsibility**: Persistent state management for PR comment resolution

**Key Methods:**

```typescript
class PRCommentMetadataManager {
  // Lifecycle
  async initialize(prInfo, repoInfo, comments, issueNumber?)
  async load(): Promise<CommentResolutionMetadata>
  async save(): Promise<void>
  async exists(): Promise<boolean>

  // Comment state tracking
  async updateCommentStatus(commentId, status, resolution?, error?)
  async incrementRetryCount(commentId): Promise<number>
  async setReplyCommentId(commentId, replyId)
  async setResolved(commentId)

  // Cost tracking
  async updateCostTracking(inputTokens, outputTokens, costUsd)

  // Query methods
  async getPendingComments(): CommentMetadata[]
  async getCompletedComments(): CommentMetadata[]
  async getSummary(): ResolutionSummary

  // Analysis metadata
  async setAnalyzeCompletedAt(timestamp)
  async setExecuteCompletedAt(timestamp)
  async setResponsePlanPath(planPath)
  async setExecutionResultPath(resultPath)
  async setAnalyzerAgent(agent)
  async setAnalyzerError(error, errorType)

  // Cleanup
  async cleanup(): Promise<void>
}
```

**Storage Location:**
```
.ai-workflow/pr-{prNumber}/
├── comment-resolution-metadata.json    # Main metadata file
├── analyze/
│   ├── prompt.txt                      # Agent prompt used
│   └── agent_log.md                    # Agent raw output
└── output/
    ├── response-plan.md                # Analysis plan (markdown)
    ├── response-plan.json              # Analysis plan (JSON)
    ├── execution-result.md             # Execution results (markdown)
    └── execution-result.json           # Execution results (JSON)
```

**Design Pattern:**
- Single source of truth for comment state
- Lazy loading (load on demand, cache in memory)
- Auto-calculated summaries (recalculated on each save)
- Fallback `analyzer_agent` set when error occurs

### 2.4 PR Comment Init Command (`src/commands/pr-comment/init.ts`)

**Responsibility**: Initialize PR comment resolution workflow

**Flow:**
```
1. resolvePrInfo() - Parse --pr-url, --pr, or --issue option
2. fetchPrInfo() - Get PR details from GitHub API
3. buildRepositoryInfo() - Resolve repo path
4. fetchReviewComments() - Get unresolved review comments
   - First try GraphQL (getUnresolvedPRReviewComments)
   - Fallback to REST API
   - Merge with pending reviews
5. metadataManager.initialize() - Create metadata file
6. Git commit & push - Save metadata to branch
```

**Key Features:**
- Supports three input methods:
  - `--pr-url https://github.com/owner/repo/pull/123`
  - `--pr 123` + GITHUB_REPOSITORY env
  - `--issue 123` (finds linked PR)
- Filters comments by ID if `--comment-ids` specified
- Handles GraphQL vs REST API differences
- Sanitizes Git URLs to remove embedded credentials

**Code Patterns:**
```typescript
// Resolution helper
async function resolvePrInfo(options): { repositoryName, prNumber }
async function fetchPrInfo(githubClient, prNumber): PRInfo
async function buildRepositoryInfo(githubClient, prUrl?): RepositoryInfo
async function fetchReviewComments(githubClient, prNumber, commentIds?): ReviewComment[]
function parseCommentIds(value?: string): Set<number>
function displaySummary(summary: ResolutionSummary)
```

### 2.5 PR Comment Analyze Command (`src/commands/pr-comment/analyze.ts`)

**Responsibility**: Analyze review comments using AI agent

**Flow:**
```
1. Load metadata created by init
2. Get pending comments (filter by --comment-ids if provided)
3. setupAgent() - Initialize Codex or Claude
4. buildAnalyzePrompt() - Create agent prompt
5. agent.executeTask() - Run analysis
6. parseResponsePlan() - Extract analysis results (multi-strategy parsing)
7. Save response-plan.md and response-plan.json
8. Update metadata with analyzer_agent and analyze_completed_at
9. Git commit (no push)
```

**Error Handling Strategy** (Critical feature):

```typescript
// Three fallback mechanisms:
if (!agent) {
  // 1. No agent available - generate fallback plan
  return buildFallbackPlan(prNumber, comments)
}

try {
  const rawOutput = await agent.executeTask({...})
} catch (agentError) {
  // 2. Agent execution failed - record error, offer fallback
  await metadataManager.setAnalyzerError(error, 'agent_execution_error')
  return buildFallbackPlan(...)
}

if (rawOutput.trim().length === 0) {
  // 3. Empty output - record error, offer fallback
  await metadataManager.setAnalyzerError(error, 'agent_empty_output')
  return buildFallbackPlan(...)
}

try {
  return parseResponsePlan(rawOutput, prNumber)
} catch (parseError) {
  // 4. JSON parse failed - record error, try fallback
  await metadataManager.setAnalyzerError(error, 'json_parse_error')
  return buildFallbackPlan(...)
}
```

**Response Plan Parsing** (Multi-strategy):

```typescript
// Strategy 1: Markdown code block
// Input: ```json {...}```
// Detection: /```json\s*([\s\S]*?)```/

// Strategy 2: JSON Lines
// Input: line1\nline2\n{"comments": [...]}
// Detection: Look for last valid JSON line

// Strategy 3: Plain JSON with boundaries
// Input: text before {"comments": [...]}} text after
// Detection: Find JSON object boundaries ({...})
```

### 2.6 PR Comment Execute Command (`src/commands/pr-comment/execute.ts`)

**Responsibility**: Apply comment resolutions and post replies

**Flow:**
```
1. Load metadata
2. Get pending comments
3. Load response-plan.json generated by analyze
4. For each pending comment (batched):
   a. Find matching entry in response-plan
   b. Apply code changes if type='code_change'
   c. Post reply comment to GitHub
   d. Update metadata status
5. Commit batch changes
6. Display execution summary
```

**Code Change Application:**

```typescript
class CodeChangeApplier {
  async apply(changes: FileChange[], dryRun = false): ChangeApplyResult
}

// Security checks:
// - Path traversal prevention (no '..')
// - Absolute path rejection
// - Excluded file patterns (.env, *.key, node_modules, .git, etc.)
// - Repository boundary validation
```

**Batch Processing** (Configurable via `--batch-size`):

```typescript
const batchSize = Number.parseInt(options.batchSize ?? '3', 10)
for (let i = 0; i < pendingComments.length; i += batchSize) {
  const batch = pendingComments.slice(i, i + batchSize)
  // Process batch...
  // Commit after each batch
}
```

### 2.7 PR Comment Finalize Command (`src/commands/pr-comment/finalize.ts`)

**Responsibility**: Mark comments as resolved and cleanup

**Flow:**
```
1. Load metadata
2. Get completed comments
3. For each completed comment:
   a. Resolve GitHub review thread (graphQL: resolveReviewThread)
   b. Update metadata resolved_at timestamp
   c. optionally cleanup metadata (--skip-cleanup to preserve)
4. Commit & push final changes
5. Cleanup metadata directory (if not --skip-cleanup)
```

**Key Feature**: Thread resolution uses GitHub GraphQL API

```typescript
// Requires thread_id from original comment metadata
await githubClient.commentClient.resolveReviewThread(threadId)
```

### 2.8 SquashManager (`src/core/git/squash-manager.ts`)

**Responsibility**: Squash commits after workflow completion (Issue #194)

**Design Pattern**: Facade pattern over Git operations

**Key Methods:**

```typescript
class SquashManager {
  // Main orchestration
  async squashCommits(context: PhaseContext): Promise<void>

  // Sub-operations
  private async getCommitsToSquash(baseCommit): string[]
  private async validateBranchProtection()
  private async generateCommitMessage(context): string
  private async executeSquash(baseCommit, message)

  // For finalize command
  async squashCommitsForFinalize(context: FinalizeContext): Promise<void>
}
```

**Commit Message Generation:**

```typescript
// 1. Load template from dist/prompts/squash/generate-message.txt
// 2. Fill template variables:
//    - {issue_number}
//    - {issue_title}
//    - {issue_body}
//    - {diff_stat}         (git diff --stat)
//    - {diff_shortstat}    (git diff --shortstat)
// 3. Execute agent with prompt
// 4. Validate against Conventional Commits pattern
// 5. Fallback if validation fails
```

**Validation Rules:**

```typescript
// Conventional Commits format: type(scope): message
// Pattern: /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/
// Max first line: 50 characters
// Must contain: "Fixes #" or "Closes #"
```

**Squash Execution:**

```typescript
// 1. git reset --soft <baseCommit>
// 2. git commit -m "<message>"
// 3. git push --force-with-lease
```

---

## 3. Implementation Patterns

### 3.1 Command Handler Pattern

All command handlers follow this structure:

```typescript
export async function handleXxxCommand(options: XxxOptions): Promise<void> {
  try {
    // 1. Validate inputs
    const resolved = await resolveInputs(options)

    // 2. Initialize dependencies
    const client = new SomeClient()
    const manager = new SomeManager()

    // 3. Execute business logic
    const result = await someLogic()

    // 4. Persist results
    await manager.save()

    // 5. Display summary
    logger.info(summary)
  } catch (error) {
    logger.error(`Failed: ${getErrorMessage(error)}`)
    process.exit(1)
  }
}
```

### 3.2 Repository Resolution Pattern

Multi-input resolution (used in init, finalize, rollback):

```typescript
function resolvePrInfo(options): { repositoryName, prNumber } {
  // Priority order:
  // 1. --pr-url (explicit URL)
  // 2. --pr (explicit number)
  // 3. --issue (linked PR lookup)
  // 4. Error if none provided
}
```

### 3.3 Error Handling & Fallback Pattern

Three-tier error handling (used in analyze, initialize):

```typescript
// Tier 1: Preferred path (agent execution)
try {
  return await preferredOperation()
} catch (error) {
  // Tier 2: Record error and offer fallback
  await manager.setError(error, errorType)
  return buildFallbackResult()
}

// Special case: CI environment
if (config.isCI()) {
  logger.error('CI detected, exiting with error')
  process.exit(1)
} else {
  // Interactive: prompt user
  const proceed = await promptUserConfirmation(...)
}
```

### 3.4 Metadata Manager Pattern

Lazy-load + in-memory cache pattern:

```typescript
class MetadataManager {
  private metadata: Metadata | null = null

  async load() {
    if (this.metadata) return this.metadata
    const content = await fs.readFile(this.path)
    this.metadata = JSON.parse(content)
    return this.metadata
  }

  async save() {
    // Always recalculate derived fields
    this.metadata.summary = this.calculateSummary()
    this.metadata.updated_at = new Date().toISOString()
    await fs.writeFile(this.path, JSON.stringify(...))
  }

  private async ensureLoaded() {
    if (!this.metadata) await this.load()
  }
}
```

### 3.5 Git Configuration Pattern

Deferred git configuration (avoid redundant configs):

```typescript
let gitConfigured = false

async function commitIfNeeded(repoRoot, message) {
  const git = simpleGit(repoRoot)

  // Only configure once per command
  if (!gitConfigured) {
    const gitUserName = config.getGitCommitUserName() || 'AI Workflow'
    const gitUserEmail = config.getGitCommitUserEmail() || 'ai-workflow@tielec.local'
    await git.addConfig('user.name', gitUserName)
    await git.addConfig('user.email', gitUserEmail)
    gitConfigured = true
  }

  await git.add(files)
  await git.commit(message)
  await git.push('origin', `HEAD:${targetBranch}`)
}
```

### 3.6 Test Pattern (Jest)

```typescript
describe('Feature', () => {
  let manager: SomeManager
  let spy: jest.SpiedFunction<typeof someFunc>

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'))

    spy = jest.spyOn(someModule, 'someFunc').mockResolvedValue(...)
    manager = new SomeManager(...)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should do something', async () => {
    await manager.someMethod()

    expect(spy).toHaveBeenCalledWith(expectedArgs)
    expect(manager.state).toEqual(expectedState)
  })
})
```

---

## 4. Key Design Decisions

### 4.1 PR Comment Feature Architecture

**Separation of Concerns:**
- `init.ts` - Metadata initialization & comment discovery
- `analyze.ts` - Agent-based analysis & response planning
- `execute.ts` - Response execution & code changes
- `finalize.ts` - Thread resolution & cleanup

**Metadata First Approach:**
- All state changes written to metadata immediately
- Enables resumption from any step
- Cost tracking for token usage monitoring
- Error tracking for debugging

### 4.2 Multi-Strategy JSON Parsing

**Why?** LLM outputs are unpredictable

1. **Markdown Code Block** - Preferred format
2. **JSON Lines** - Last valid JSON line detection
3. **Plain JSON** - Object boundary detection with nested brace tracking

**Fallback Chain:**
- Parsing error → Generate fallback plan
- Empty output → Generate fallback plan
- Agent error → Generate fallback plan
- No agent → Generate fallback plan

### 4.3 Batch Processing in Execute

**Why?** Reduces API rate limiting & improves stability

- Configurable batch size (default: 3)
- Commits after each batch
- Allows resumption at batch boundaries

### 4.4 Squash Validation

**Why?** Prevent accidental force-push to main

- Reject if current branch is main/master
- Use `--force-with-lease` (safer than `--force`)
- Record pre-squash commits for potential rollback

---

## 5. Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode
npm test -- --watch

# Specific test file
npm test -- pr-comment/metadata-manager.test.ts
```

**Test Files:**
- `tests/unit/pr-comment/metadata-manager.test.ts` - 302 lines
- `tests/unit/pr-comment/analyze-command.test.ts` - 22k+ chars
- `tests/unit/pr-comment/execute-command.test.ts` - 16k+ chars
- `tests/unit/pr-comment/finalize-command.test.ts` - 9k+ chars
- `tests/integration/pr-comment-workflow.test.ts`
- `tests/integration/pr-comment-analyze-execute.test.ts`

---

## 6. Build & Deployment

```bash
# Build (compile TS + copy prompts/templates)
npm run build

# Output structure:
dist/
├── src/             # Compiled JavaScript
├── prompts/         # Copied prompt templates
└── templates/       # Copied PR templates

# Watch mode
npm run dev
```

**Post-build Requirements:**
- Prompt templates in `dist/prompts/` (for SquashManager)
- Templates in `dist/templates/` (for PR body generation)

---

## 7. Key Configuration

**Environment Variables:**
```bash
GITHUB_TOKEN                           # Required for GitHub API
GITHUB_REPOSITORY                      # owner/repo format
CODEX_API_KEY                         # Codex agent
OPENAI_API_KEY                        # Fallback for Codex
CLAUDE_CODE_CREDENTIALS_PATH          # Claude agent credentials
GIT_COMMIT_USER_NAME                  # Git config (AI Workflow)
GIT_COMMIT_USER_EMAIL                 # Git config
LOG_LEVEL                             # debug|info|warn|error
LOG_NO_COLOR                          # For CI environments
REPOS_ROOT                            # Multi-repo parent directory
```

---

## 8. Debugging Tips

**Enable Debug Logging:**
```bash
export LOG_LEVEL=debug
node dist/index.js pr-comment init --pr-url https://...
```

**Check Agent Logs:**
- Init: Metadata created at `.ai-workflow/pr-{prNumber}/comment-resolution-metadata.json`
- Analyze: Agent log at `.ai-workflow/pr-{prNumber}/analyze/agent_log.md`
- Response plan: `.ai-workflow/pr-{prNumber}/output/response-plan.json`

**Dry-run First:**
```bash
node dist/index.js pr-comment execute --pr 123 --dry-run
node dist/index.js pr-comment finalize --pr 123 --dry-run
```

---

## 9. Common Implementation Scenarios

### Scenario 1: Handling Agent Failure
```typescript
// In analyze.ts
try {
  const result = await agent.executeTask({prompt, maxTurns: 1})
} catch (error) {
  // Record error for diagnostics
  await metadataManager.setAnalyzerError(
    getErrorMessage(error),
    'agent_execution_error'
  )
  
  // User prompt (non-CI) or exit (CI)
  if (config.isCI()) {
    process.exit(1)
  }
  
  const proceed = await promptUserConfirmation(...)
  if (!proceed) process.exit(1)
  
  // Return safe default
  return buildFallbackPlan(prNumber, comments)
}
```

### Scenario 2: Applying Code Changes
```typescript
// In execute.ts
const applier = new CodeChangeApplier(repoRoot)
const changes = resolution.changes ?? []
const applyResult = await applier.apply(changes, dryRun)

if (!applyResult.success) {
  await metadataManager.updateCommentStatus(
    commentId,
    'failed',
    resolution,
    applyResult.error ?? 'Failed to apply changes'
  )
  return
}

// Safe to post reply
const reply = await githubClient.commentClient.replyToPRReviewComment(...)
```

### Scenario 3: Thread Resolution
```typescript
// In finalize.ts
for (const comment of completedComments) {
  const threadId = comment.comment.thread_id
  if (!threadId) {
    logger.warn(`No thread_id for comment #${comment.comment.id}`)
    continue
  }

  await githubClient.commentClient.resolveReviewThread(threadId)
  await metadataManager.setResolved(String(comment.comment.id))
}
```

