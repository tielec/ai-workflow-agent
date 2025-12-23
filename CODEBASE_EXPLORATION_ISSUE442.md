# AI Workflow Agent - Comprehensive Codebase Exploration

## Project Overview

**Repository**: AI Workflow Agent (TypeScript-based)
**Purpose**: Automated issue workflow orchestration with Codex and Claude dual-agent support
**Language**: TypeScript
**Key Features**:
- 10-phase workflow automation (planning → evaluation)
- Dual-agent system (Codex + Claude with fallback support)
- PR comment auto-response capability
- Multi-repository support
- GitHub & Jenkins integration
- Persistent workflow state management

---

## Overall Project Structure

```
ai-workflow-agent/
├── src/
│   ├── core/                      # Core business logic (agents, GitHub, Git, metadata)
│   │   ├── codex-agent-client.ts  # Codex agent implementation
│   │   ├── claude-agent-client.ts # Claude agent implementation
│   │   ├── github-client.ts       # GitHub API facade
│   │   ├── pr-comment/            # PR comment analysis & execution
│   │   │   ├── comment-analyzer.ts    # Review comment analysis engine
│   │   │   ├── change-applier.ts      # Code change application logic
│   │   │   └── metadata-manager.ts    # PR comment metadata persistence
│   │   ├── helpers/
│   │   │   └── log-formatter.ts       # Agent log formatting helper (for shorter logs)
│   │   ├── metadata-manager.ts    # Workflow state persistence
│   │   └── ...others (config, git, GitHub, etc.)
│   ├── commands/                  # CLI command handlers
│   │   ├── execute.ts             # Main phase execution command
│   │   ├── init.ts                # Workflow initialization
│   │   ├── pr-comment/            # PR comment subcommands
│   │   │   ├── init.ts
│   │   │   ├── analyze.ts         # Uses LogFormatter for agent log persistence
│   │   │   ├── execute.ts         # Uses LogFormatter for agent log persistence
│   │   │   └── finalize.ts
│   │   └── ...others (review, rollback, cleanup, finalize)
│   ├── phases/                    # 10-phase implementations
│   │   ├── base-phase.ts
│   │   ├── core/
│   │   │   └── agent-executor.ts  # Agent execution with logging via LogFormatter
│   │   ├── formatters/
│   │   │   └── log-formatter.ts   # PRIMARY LOG FORMATTER CLASS (main logging)
│   │   └── ...phase implementations (planning, requirements, design, etc.)
│   ├── prompts/                   # Phase-specific prompt templates
│   ├── templates/                 # PR body templates
│   ├── types/                     # TypeScript type definitions
│   └── utils/                     # Logger, error handling
├── tests/
│   ├── unit/
│   │   ├── pr-comment/            # PR comment tests
│   │   │   ├── comment-analyzer.test.ts
│   │   │   └── execute-command.test.ts
│   │   └── ...other unit tests
│   └── integration/
│       ├── pr-comment-*.test.ts   # PR comment integration tests
│       └── ...other integration tests
├── CLAUDE.md                      # Development guide
├── ARCHITECTURE.md                # Architecture documentation
└── README.md                      # Project README

```

---

## 1. Core Files and Purposes

### Documentation Files

| File | Purpose |
|------|---------|
| `/README.md` | Quick start guide, CLI usage, features (82KB) |
| `/CLAUDE.md` | Development guidance for Claude Code, build commands, CLI options (82KB) |
| `/ARCHITECTURE.md` | Detailed architecture, module descriptions, control flows (76KB) |

### Key Core Modules

**Agent Clients**
- `src/core/codex-agent-client.ts`: Codex model client with fallback support
- `src/core/claude-agent-client.ts`: Claude Code (Agent SDK) client

**GitHub Integration**
- `src/core/github-client.ts`: Centralized GitHub API facade
- `src/core/github/`: Sub-modules for issues, PRs, comments, reviews

**Metadata & State**
- `src/core/metadata-manager.ts`: Workflow state persistence (JSON-based)
- `src/core/pr-comment/metadata-manager.ts`: PR comment metadata tracking

**Configuration**
- `src/core/config.ts`: Environment variable management, defaults
- `src/core/path-utils.ts`: Repository path resolution

---

## 2. PR-Comment Command Implementation Details

### Architecture Overview

The `pr-comment` feature supports a 4-step workflow:

```
pr-comment init   → Collect unresolved comments from PR
                 ↓
pr-comment analyze → AI analyzes comments, generates response plan (response-plan.json)
                 ↓
pr-comment execute → Apply code changes, post replies based on plan
                 ↓
pr-comment finalize → Mark threads as resolved, cleanup
```

### File Locations and Purposes

#### Command Files

| File | Purpose | Key Features |
|------|---------|--------------|
| `src/commands/pr-comment/init.ts` | Initialize PR comment workflow | Collects unresolved comments, creates metadata |
| `src/commands/pr-comment/analyze.ts` | Analyze comments via AI agent | Calls agent, persists `response-plan.json`, saves agent log via LogFormatter |
| `src/commands/pr-comment/execute.ts` | Execute the response plan | Applies code changes, posts replies, persists agent log via LogFormatter |
| `src/commands/pr-comment/finalize.ts` | Mark resolution & cleanup | Resolves comment threads, archiving |

#### Core Processing Modules

| File | Purpose | Key Methods |
|------|---------|-------------|
| `src/core/pr-comment/comment-analyzer.ts` | Review comment analysis engine (LEGACY) | `analyze()`, `classifyComment()`, `buildPrompt()` |
| `src/core/pr-comment/change-applier.ts` | Code change application (patch application) | `apply()` |
| `src/core/pr-comment/metadata-manager.ts` | PR comment metadata (comments, plans, execution results) | `getPendingComments()`, `updateCommentStatus()`, `setResponsePlanPath()` |

### Comment Analyzer Deep Dive

**File**: `src/core/pr-comment/comment-analyzer.ts`

**Purpose**: Analyzes individual review comments to determine resolution strategy (code_change, reply, discussion, skip)

**Key Features**:
- Comment classification by keyword pattern matching
- Fallback to simple resolution when agent unavailable
- Handles both Codex and Claude agents
- Validates resolution types and confidence levels
- Converts low-confidence code_change to discussion

**Public Interface**:
```typescript
class ReviewCommentAnalyzer {
  constructor(promptsDir: string, outputDir: string);
  
  // Main analysis method
  analyze(
    commentMeta: CommentMetadata,
    context: AnalysisContext,
    agent: CodexAgentClient | ClaudeAgentClient | null
  ): Promise<AnalysisResult>;
  
  // Comment classification
  classifyComment(body: string): 'code_change' | 'question' | 'discussion';
}
```

**Usage Context**:
- **LEGACY/DEPRECATED**: This class is no longer used in `pr-comment analyze` (Issue #444)
- The `analyze` command now builds prompts directly and calls agents without using this class
- The `execute` command reads pre-built response plans (response-plan.json) instead

### Log Persistence in PR-Comment Commands

#### analyze.ts - Agent Log Persistence

```typescript
async function persistAgentLog(
  context: AgentLogContext,
  analyzeDir: string,
  options: PRCommentAnalyzeOptions,
  logFormatter: LogFormatter
): Promise<void>
```

- Calls `logFormatter.formatAgentLog()` to convert raw messages to Markdown
- Saves to: `.ai-workflow/pr-{prNumber}/analyze/agent_log.md`
- Skips persistence in dry-run mode

#### execute.ts - Agent Log Persistence

```typescript
async function persistExecuteLog(context: ExecuteLogContext)
```

- Similar pattern to analyze
- Saves to: `.ai-workflow/pr-{prNumber}/execute/agent_log.md`
- Uses simple system messages (not actual agent messages)

---

## 3. Logging Implementation

### Two LogFormatter Classes

There are TWO separate log formatting classes (potential confusion point):

#### 1. `src/core/helpers/log-formatter.ts` (HELPER)
- **Purpose**: Simple log formatting utilities for agent messages
- **Functions** (NOT classes):
  - `formatCodexLog(eventType, payload)` - Format individual Codex events
  - `formatClaudeLog(message)` - Format individual Claude messages
  - `truncateInput(input, maxLength)` - Utility for truncating long inputs
- **Usage**: Lower-level, event-by-event formatting
- **Max Length**: 500 characters per parameter (MAX_LOG_PARAM_LENGTH)

#### 2. `src/phases/formatters/log-formatter.ts` (PRIMARY)
- **Purpose**: Full Markdown-formatted agent execution logs
- **Class**: `LogFormatter`
- **Key Method**:
  ```typescript
  formatAgentLog(
    messages: string[],
    startTime: number,
    endTime: number,
    duration: number,
    error: Error | null,
    agentName: string
  ): string
  ```
- **Features**:
  - Converts JSON event streams to structured Markdown
  - Handles Codex JSON event streams with turn-by-turn breakdowns
  - Handles Claude SDK messages with tool use tracking
  - Truncates large outputs (4000 character limit)
  - Includes timing, status, and error information
- **Output Format**: Markdown with sections for each turn/event
- **Usage Locations**:
  - `src/phases/core/agent-executor.ts` - Primary workflow execution
  - `src/commands/pr-comment/analyze.ts` - PR comment analysis
  - `src/commands/pr-comment/execute.ts` - PR comment execution

### How Logging Works in Execute Flow

1. **Agent Execution** (agent-executor.ts):
   - Creates `LogFormatter` instance
   - Calls `agent.executeTask()` → returns raw message array
   - Saves raw log: `agent_log_raw.txt`
   - Formats via `logFormatter.formatAgentLog()` → Markdown
   - Saves formatted log: `agent_log.md`

2. **PR-Comment Analyze** (analyze.ts):
   - Builds prompt with comments and context
   - Calls agent via `setupAgent()`
   - Uses `logFormatter.formatAgentLog()` to format output
   - Saves to: `.ai-workflow/pr-{prNumber}/analyze/agent_log.md`

3. **PR-Comment Execute** (execute.ts):
   - Processes comments from `response-plan.json`
   - Generates simple system messages during execution
   - Uses `logFormatter.formatAgentLog()` with system-only messages
   - Saves to: `.ai-workflow/pr-{prNumber}/execute/agent_log.md`

---

## 4. Existing Test Files for Comment-Analyzer

### Test File Location
`tests/unit/pr-comment/comment-analyzer.test.ts`

### Test Coverage

| Test Case | Purpose |
|-----------|---------|
| `classifies comments by keyword patterns` | Validates pattern-based classification |
| `builds prompt by replacing placeholders` | Verifies prompt template replacement |
| `falls back to placeholder text when file missing` | Tests graceful degradation |
| `parses code-block JSON and converts low confidence` | Validates JSON parsing and type conversion |
| `throws when resolution type is invalid` | Error handling validation |

### Testing Patterns Used

**Jest + TypeScript**:
- `describe()` / `it()` - Test organization
- `beforeEach()` / `afterEach()` - Setup/teardown
- `jest.spyOn()` - Mock file system functions
- `jest.restoreAllMocks()` - Mock cleanup
- Fake timers: `jest.useFakeTimers()`

**Mocking Strategy**:
- Mock `fs` module (readFile, writeFile, ensureDir)
- Create sample `CommentMetadata` fixtures
- Mock prompt template files

### Execute Command Test File
`tests/unit/pr-comment/execute-command.test.ts`

**Key Test Scenarios**:
- Response plan flow (apply changes, post replies)
- Mixed action types (create/modify/delete)
- Missing response plan error handling
- Malformed JSON error handling
- Code changes in batches and commits per batch
- Different resolution types (code_change, reply, discussion, skip)
- **Agent log persistence** (verify Markdown format in agent_log.md)
- Dry-run mode (no metadata updates, no GitHub posts)

---

## 5. Phase Implementation & Logging Integration

### AgentExecutor (src/phases/core/agent-executor.ts)

**Purpose**: Execute agents for workflow phases with logging

**Key Features**:
- Dual-agent support (Codex/Claude) with priority-based selection
- Agent fallback on auth failure or empty output
- Logs saved to: `.ai-workflow/issue-{N}/XX_{phase}/execute/agent_log.md`
- Uses `LogFormatter` class for formatting
- Saves both raw and formatted logs

**Log Paths**:
```
.ai-workflow/
└── issue-{N}/
    └── XX_{phase}/
        └── execute/
            ├── prompt.txt         # Unmodified prompt
            ├── agent_log_raw.txt  # Raw JSON messages
            └── agent_log.md       # Formatted Markdown (via LogFormatter)
```

### Workflow Phase Execution

Each of the 10 phases follows this pattern:
1. Build context and prompt
2. Create `AgentExecutor` instance
3. Call `executor.executeWithAgent(prompt)`
4. LogFormatter automatically saves agent logs
5. Parse and validate output
6. Update metadata with results

---

## 6. Key Type Definitions

### PR-Comment Types (src/types/pr-comment.ts)

```typescript
interface CommentMetadata {
  comment: ReviewComment;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  resolution: CommentResolution | null;
  reply_comment_id: number | null;
  resolved_at: string | null;
  error: string | null;
}

interface ResponsePlan {
  pr_number: number;
  analyzed_at: string;
  analyzer_agent: 'auto' | 'codex' | 'claude' | 'fallback';
  comments: ResponsePlanComment[];
}

interface CommentResolution {
  type: 'code_change' | 'reply' | 'discussion' | 'skip';
  confidence: 'high' | 'medium' | 'low';
  changes?: FileChange[];
  reply: string;
  skip_reason?: string;
  analysis_notes?: string;
}
```

---

## 7. Command Line Usage

### PR-Comment Commands

```bash
# Initialize metadata from PR
ai-workflow pr-comment init --pr {number}

# Analyze comments and generate response plan
ai-workflow pr-comment analyze --pr {number}

# Execute the response plan
ai-workflow pr-comment execute --pr {number}

# Mark threads as resolved and finalize
ai-workflow pr-comment finalize --pr {number}
```

### Environment Variables
- `CODEX_API_KEY`: Codex authentication
- `CLAUDE_CODE_CREDENTIALS_PATH`: Claude Code credentials
- `GITHUB_TOKEN`: GitHub API token
- `GITHUB_REPOSITORY`: Target repository (owner/repo)
- `LOG_LEVEL`: debug|info|warn|error (default: info)
- `LOG_NO_COLOR`: true to disable colors (for CI)

---

## 8. Integration Points

### Between Commands

1. **init** → **analyze**:
   - init creates `.ai-workflow/pr-{N}/metadata.json`
   - analyze reads metadata, processes comments, creates `response-plan.json`

2. **analyze** → **execute**:
   - analyze creates `response-plan.json`
   - execute reads plan, applies changes, posts replies

3. **execute** → **finalize**:
   - execute updates comment statuses in metadata
   - finalize reads final state, marks threads resolved

### With Main Workflow

- PR-comment workflow is independent from phase workflow
- Shares GitHub client, config, and logging infrastructure
- Can run alongside or after main workflow

---

## 9. Build & Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript → JavaScript (dist/)
npm run build

# Watch mode for development
npm run dev

# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Coverage report
npm run test:coverage
```

---

## 10. Key Design Patterns

### 1. Metadata Persistence Pattern
- All state saved to JSON files (`.ai-workflow/.../*.json`)
- MetadataManager provides abstraction over raw JSON
- Enables workflow resumption after failures

### 2. Agent Client Pattern
- Two agent types: Codex and Claude
- Common interface: `executeTask(options)`
- Returns string array of JSON messages
- LogFormatter handles format differences

### 3. Fallback Pattern
- Agent execution tries primary (based on priority)
- Falls back to secondary on auth failure/empty output
- No exceptions thrown, graceful degradation

### 4. Log Formatting Pattern
- Raw agent messages → JSON events
- LogFormatter converts to structured Markdown
- Separate files for debugging (raw) and review (formatted)

### 5. Batch Processing Pattern
- PR-comment execute processes in batches
- Commits after each batch
- Reduces risk of conflicts in multi-comment scenarios

---

## 11. Important Notes for Development

### LogFormatter Usage
- **Primary location**: `src/phases/formatters/log-formatter.ts`
- Used by: AgentExecutor, pr-comment analyze/execute, main phases
- NOT currently used by ReviewCommentAnalyzer (which is mostly unused)

### ReviewCommentAnalyzer Status
- **LEGACY**: Minimal active use in codebase
- Replaced in pr-comment analyze by direct agent calls
- Replaced in pr-comment execute by response-plan.json reading
- Still has tests but likely future deprecation candidate

### Response Plan Format
- Intermediate artifact created by analyze
- Consumed entirely by execute
- JSON format with array of comments + metadata
- Should be considered ephemeral (rebuilding after analyze is safe)

### Logging Levels
- `debug`: Detailed execution trace, unused variables, performance
- `info`: Operation milestones, file saves, key decisions
- `warn`: Recoverable errors, fallbacks, potential issues
- `error`: Fatal errors, exit conditions

---

## 12. Common Development Tasks

### Adding New Test for PR-Comment
1. Create file in `tests/unit/pr-comment/` or `tests/integration/pr-comment/`
2. Import and mock dependencies (see execute-command.test.ts for patterns)
3. Use `beforeAll` for async module imports, `beforeEach` for setup
4. Test both success and failure paths
5. Verify log output expectations

### Debugging Agent Execution
1. Check `.ai-workflow/issue-{N}/XX_{phase}/execute/agent_log.md`
2. For raw output: check `agent_log_raw.txt`
3. Enable `LOG_LEVEL=debug` for verbose logging
4. Check `prompt.txt` for actual prompt sent to agent

### Debugging PR-Comment
1. Check `.ai-workflow/pr-{N}/analyze/agent_log.md` after analyze
2. Check `.ai-workflow/pr-{N}/output/response-plan.json` for plan details
3. Check `.ai-workflow/pr-{N}/execute/agent_log.md` after execute
4. Use `--dryRun` flag to preview without side effects

---

## Summary of Key File Paths

| Component | File Path |
|-----------|-----------|
| LogFormatter (Primary) | `src/phases/formatters/log-formatter.ts` |
| log-formatter helpers | `src/core/helpers/log-formatter.ts` |
| ReviewCommentAnalyzer | `src/core/pr-comment/comment-analyzer.ts` |
| PR-Comment Commands | `src/commands/pr-comment/{init,analyze,execute,finalize}.ts` |
| PR-Comment Tests | `tests/unit/pr-comment/` and `tests/integration/pr-comment-*.test.ts` |
| AgentExecutor | `src/phases/core/agent-executor.ts` |
| Documentation | `README.md`, `CLAUDE.md`, `ARCHITECTURE.md` |

