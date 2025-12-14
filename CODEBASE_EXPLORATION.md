# AI Workflow Agent - Codebase Exploration Summary

## 1. Directory Structure Overview

### Top-Level Organization
```
/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/
├── src/                          # TypeScript source code
│   ├── index.ts                  # CLI entry point
│   ├── main.ts                   # Commander CLI routing
│   ├── types.ts                  # Global type definitions
│   ├── commands/                 # CLI command handlers
│   │   ├── pr-comment/           # PR comment automation (Issue #383, #427)
│   │   │   ├── init.ts           # Initialize PR comment workflow
│   │   │   ├── analyze.ts        # ANALYZE PHASE - Main file under review
│   │   │   ├── execute.ts        # Execute response plan
│   │   │   └── finalize.ts       # Complete PR comment workflow
│   │   ├── execute/              # Phase execution orchestration
│   │   ├── init.ts               # Workflow initialization
│   │   ├── review.ts             # Phase review
│   │   ├── rollback.ts           # Rollback handling (Issue #90, #271)
│   │   ├── cleanup.ts            # Cleanup workflow artifacts
│   │   └── finalize.ts           # Finalize workflow
│   ├── core/                     # Core business logic
│   │   ├── pr-comment/           # PR comment feature implementation
│   │   │   ├── metadata-manager.ts    # Comment metadata persistence
│   │   │   ├── comment-analyzer.ts    # Comment analysis engine
│   │   │   └── change-applier.ts      # Code change application
│   │   ├── github/               # GitHub API operations
│   │   ├── git/                  # Git operations
│   │   ├── helpers/              # Utility helpers
│   │   ├── logger.ts             # Logging system
│   │   ├── config.ts             # Environment configuration
│   │   ├── codex-agent-client.ts # Codex agent integration
│   │   ├── claude-agent-client.ts # Claude agent integration
│   │   └── ...
│   ├── phases/                   # Workflow phase implementations
│   │   ├── base-phase.ts         # Base class for all phases
│   │   ├── core/                 # Phase execution engines
│   │   │   ├── agent-executor.ts # Agent task execution
│   │   │   └── review-cycle-manager.ts
│   │   ├── lifecycle/            # Phase lifecycle management
│   │   ├── formatters/           # Output formatting
│   │   └── cleanup/              # Cleanup logic
│   ├── prompts/                  # LLM prompt templates (100% auto-synced to dist/)
│   │   ├── pr-comment/
│   │   │   └── analyze.txt       # Analyze phase prompt template
│   │   ├── difficulty/
│   │   ├── rollback/
│   │   └── ...
│   ├── types/                    # TypeScript type definitions
│   │   ├── pr-comment.ts         # PR comment types (Issue #383, #427)
│   │   ├── commands.ts           # Command types
│   │   └── ...
│   └── utils/                    # Utility functions
│       ├── logger.ts             # Logger export
│       ├── error-utils.ts        # Error handling
│       └── ...
├── tests/                        # Test suites
│   ├── unit/
│   │   ├── pr-comment/
│   │   │   ├── analyze-command.test.ts
│   │   │   └── comment-analyzer.test.ts
│   │   └── ...
│   └── integration/
│       ├── pr-comment-workflow.test.ts
│       ├── pr-comment-analyze-execute.test.ts
│       └── jenkins/pr-comment-jobs.test.ts
├── CLAUDE.md                     # Development guidelines
├── ARCHITECTURE.md               # Architecture documentation
├── README.md                     # Project documentation
├── package.json
├── tsconfig.json
└── jest.config.cjs
```

---

## 2. Current `parseResponsePlan` Implementation

### Location
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/src/commands/pr-comment/analyze.ts`  
**Lines**: 362-439

### Function Signature
```typescript
function parseResponsePlan(rawOutput: string, prNumber: number): ResponsePlan
```

### Current Parsing Strategies (3 Fallback Strategies)

#### **Strategy 1: Markdown Code Block (Primary)**
- **Pattern**: `/```json\s*([\s\S]*?)```/`
- **Purpose**: Extract JSON from markdown code blocks
- **Example**: 
```json
```json
{
  "pr_number": 123,
  "comments": [...]
}
```
```

#### **Strategy 2: JSON Lines Format (Codex Event Stream)**
- **Location**: Lines 386-415
- **Purpose**: Parse agent event stream output (last complete JSON with "comments" field)
- **Method**: 
  - Split output by newlines
  - Iterate backwards
  - Find first valid JSON with `comments` array property
- **Debug logging**: `logger.debug('Strategy 1: Searching for JSON in event stream...')`
- **Fallback when**: Code block extraction fails

#### **Strategy 3: Plain JSON Search**
- **Location**: Lines 417-433
- **Pattern**: `/\{[\s\S]*"comments"[\s\S]*\}/`
- **Purpose**: Find JSON object containing "comments" field anywhere in output
- **Fallback when**: Strategies 1 and 2 fail

### Error Handling Flow
```
rawOutput from agent
    ↓
[Primary] Try markdown code block extraction
    ↓ (fails)
Log: "Failed to parse response plan"
Log: "Attempting alternative JSON extraction strategies..."
    ↓
[Strategy 1] Search JSON Lines backward for "comments" field
    ↓ (fails)
Log: "Strategy 1 failed: No valid JSON with 'comments' field found"
    ↓
[Strategy 2] Search for plain JSON pattern with "comments"
    ↓ (fails)
Log: "All parsing strategies failed. Using fallback plan."
    ↓
throw Error: "Failed to parse agent response: ..."
```

### Post-Parse Processing
```typescript
parsed.comments = (parsed.comments ?? []).map((c) => normalizePlanComment(c));
```

#### `normalizePlanComment` Function (Lines 441-467)
- **Input**: `ResponsePlanComment` (raw from agent)
- **Processing**:
  1. Normalize proposed changes array
  2. Convert comment_id to string
  3. Downgrade confidence low + code_change to discussion
  4. Apply default confidence/rationale
  5. Ensure proposed_changes is always array
- **Output**: Normalized `ResponsePlanComment`

---

## 3. Type Definitions

### Location
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/src/types/pr-comment.ts`

### Key Types for Analyze Phase

#### `ResponsePlan` (Lines 324-329)
```typescript
export interface ResponsePlan {
  pr_number: number;
  analyzed_at: string;              // ISO timestamp
  analyzer_agent: string;            // 'codex' | 'claude' | 'auto' | 'fallback'
  comments: ResponsePlanComment[];
}
```

#### `ResponsePlanComment` (Lines 311-322)
```typescript
export interface ResponsePlanComment {
  comment_id: string;
  file?: string;
  line?: number | null;
  author?: string;
  body?: string;
  type: ResolutionType;              // 'code_change' | 'reply' | 'discussion' | 'skip'
  confidence: ConfidenceLevel;       // 'high' | 'medium' | 'low'
  rationale?: string;
  proposed_changes?: ProposedChange[];
  reply_message: string;
}
```

#### `ProposedChange` (Lines 304-309)
```typescript
export interface ProposedChange {
  action: 'modify' | 'create' | 'delete';
  file: string;
  line_range?: string;               // e.g., "40-55"
  changes: string;                   // Concise description
}
```

#### `AnalyzerErrorType` (Lines 29-33)
```typescript
export type AnalyzerErrorType =
  | 'agent_execution_error'
  | 'agent_empty_output'
  | 'json_parse_error'
  | 'validation_error';
```

#### `CommentMetadata` (Lines 136-163)
- Tracks individual comment processing state
- Fields: status, started_at, completed_at, retry_count, resolution, reply_comment_id, resolved_at, error

#### `CommentResolutionMetadata` (Lines 247-295)
- Stores overall PR comment metadata
- Includes `analyzer_error`, `analyzer_error_type`, `analyze_completed_at`, `response_plan_path`

---

## 4. Analyze Phase Prompt Template

### Location
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/src/prompts/pr-comment/analyze.txt`

### Template Structure
```
# PRレビューコメント — 分析フェーズ

## 目標
- Classify each comment: code_change | reply | discussion | skip
- Provide confidence: high | medium | low
- For code_change: suggest minimal, safe changes
- Create reply messages

## 入力コンテキスト
- PR番号: {pr_number}
- PRタイトル: {pr_title}
- 対象リポジトリ: {repo_path}
- コメント（一括）: {all_comments}

## セキュリティ・安全ガードレール
- Never modify: .env, credentials.*, secrets.*, *.pem, *.key
- Relative paths only (no absolute paths or ..)
- Low confidence + code_change → downgrade to discussion
- Brief, professional, actionable replies

## 出力
```json
{
  "pr_number": 123,
  "analyzer_agent": "codex|claude|auto",
  "comments": [
    {
      "comment_id": "c001",
      "file": "src/app.ts",
      "line": 42,
      "author": "reviewer",
      "body": "...comment text...",
      "type": "code_change|reply|discussion|skip",
      "confidence": "high|medium|low",
      "rationale": "Reason for choice",
      "proposed_changes": [
        {
          "action": "modify|create|delete",
          "file": "src/app.ts",
          "line_range": "40-55",
          "changes": "Concise description"
        }
      ],
      "reply_message": "GitHub reply to post"
    }
  ]
}
```

### Placeholder Replacements (in buildAnalyzePrompt)
- `{pr_number}` → PR number from options
- `{pr_title}` → PR title from metadata
- `{repo_path}` → Repository root path
- `{all_comments}` → Formatted comment blocks

---

## 5. Existing Test Files

### Test File Locations

#### Unit Tests
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/tests/unit/pr-comment/analyze-command.test.ts`
- **Lines**: ~437 test cases
- **Focus**: Handler logic, JSON parsing, error handling, fallback flows
- **Key Test Cases**:
  - Valid plan generation with agent output
  - Dry-run mode (no file writes)
  - Comment filtering by commentIds
  - Missing metadata handling
  - Agent execution failures
  - Parse errors with multiple formats
  - Prompt template placeholders
  - Empty pending comments
  - CI environment error handling
  - User confirmation prompts (local environment)
  - Fallback plan generation

#### Integration Tests
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/tests/integration/pr-comment-analyze-execute.test.ts`
- **Lines**: ~283
- **Focus**: Analyze → Execute workflow integration
- **Key Test Cases**:
  - Full analyze/execute pipeline with agent call per phase
  - Analyze failure in CI environment
  - Response plan file existence validation

**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/tests/integration/pr-comment-workflow.test.ts`
- Full PR comment workflow (init → analyze → execute → finalize)

#### Comment Analyzer Tests
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/tests/unit/pr-comment/comment-analyzer.test.ts`
- Tests for `ReviewCommentAnalyzer.analyze()`

---

## 6. Coding Conventions & Patterns

### From CLAUDE.md and ARCHITECTURE.md

#### 1. **Import/Export Style**
- **ESM only** (no CommonJS): `import`, `export`
- Absolute imports with `@/` alias:
```typescript
import { logger } from '@/utils/logger.js';
import { config } from '@/core/config.js';
```

#### 2. **Logging Pattern**
```typescript
import { logger } from '@/utils/logger.js';

logger.debug('Detailed info for developers');
logger.info('Normal operation messages');
logger.warn('Warning conditions');
logger.error('Error messages');
```

**Features**:
- Color-coded output (chalk integration)
- Timestamp auto-added (except in tests)
- Log level control via `LOG_LEVEL` env var
- Output formatting with prefixes like `[DEBUG]`, `[INFO]`, `[WARNING]`, `[ERROR]`

#### 3. **Error Handling**
```typescript
import { getErrorMessage } from '@/utils/error-utils.js';

try {
  // ...
} catch (error) {
  logger.error(`Failed to parse: ${getErrorMessage(error)}`);
}
```

**Key Points**:
- Use `getErrorMessage()` instead of `as Error`
- Handles unknown types safely (string, number, null, undefined)
- Never throws when extracting message

#### 4. **Type Safety**
- Strict TypeScript: `"strict": true` in tsconfig.json
- Interfaces for all public APIs
- Generic constraints where appropriate
- Avoid `any` type

#### 5. **Error Handling with Agent Operations**
- **3-level fallback pattern**:
  1. Try primary parsing strategy
  2. Log debug details at each step
  3. Try alternative strategies with error messages
  4. Fallback to safe default if all fail
- Used in: `parseResponsePlan`, `parseRollbackDecision`

#### 6. **CI vs Local Environment Handling**
```typescript
if (config.isCI()) {
  logger.error('CI environment detected. Exiting with error.');
  process.exit(1);
}

// Local: prompt user
const proceed = await promptUserConfirmation('Continue with fallback?');
```

#### 7. **Metadata Persistence**
- All metadata changes via `metadataManager` instance methods
- Atomic operations with `.save()` calls
- Include timestamps for all completion tracking
- Track error states with `analyzer_error`, `analyzer_error_type`

#### 8. **Git Operations**
```typescript
const git = simpleGit(repoRoot);
const status = await git.status();
await git.add(status.files.map((f) => f.path));
await git.commit(message);
```

#### 9. **Testing Patterns**
```typescript
beforeAll(async () => {
  await jest.unstable_mockModule('./module.js', () => ({
    __esModule: true,
    namedExport: jest.fn(),
  }));
  const { importedName } = await import('./module.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});
```

**Key Points**:
- `unstable_mockModule()` for ESM mocking
- `jest.fn()` with `.mockResolvedValue()`, `.mockRejectedValue()`
- Mock file I/O (`fs.readFile`, `fs.writeFile`, `fs.pathExists`)
- Spy on logger methods to avoid cluttering test output
- Avoid real file I/O in unit tests

---

## 7. Logger Usage Patterns

### Logger Instance
**File**: `/tmp/ai-workflow-repos-82-b2868f4e/ai-workflow-agent/src/utils/logger.ts`

### API
```typescript
export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
```

### Usage Examples from analyze.ts
```typescript
logger.debug('Attempting to parse response plan (${jsonString.length} chars)');
logger.debug(`Failed to parse response plan: ${getErrorMessage(error)}`);
logger.debug(`Raw output preview (first 500 chars): ${rawOutput.substring(0, 500)}`);
logger.warn('Attempting alternative JSON extraction strategies...');
logger.debug('Strategy 1: Searching for JSON in event stream...');
logger.debug(`Found valid response plan JSON at line ${i + 1}`);
logger.debug('Strategy 1 failed: No valid JSON with "comments" field found in lines');
logger.error(`Failed to analyze PR comments: ${getErrorMessage(error)}`);
logger.info(`Agent log saved to: ${logPath}`);
logger.warn(`[WARNING] Analyze phase failed: ${errorMessage}`);
logger.info('User cancelled workflow due to analyze failure.');
logger.info('Continuing with fallback plan...');
```

### Control
- **Environment variable**: `LOG_LEVEL` (debug, info, warn, error)
- **Default**: info
- **No color**: `LOG_NO_COLOR=1`

---

## 8. Key File Dependencies for analyze.ts

### Imports
```typescript
import fs from 'fs-extra';                    // File I/O
import path from 'node:path';                 // Path utilities
import process from 'node:process';           // Process exit control
import readline from 'node:readline';         // User prompts
import simpleGit from 'simple-git';          // Git operations

import { logger } from '../../utils/logger.js';                           // Logging
import { getErrorMessage } from '../../utils/error-utils.js';           // Error extraction
import { PRCommentMetadataManager } from '../../core/pr-comment/metadata-manager.js';
import { GitHubClient } from '../../core/github-client.js';
import { config } from '../../core/config.js';                          // Config management
import { resolveAgentCredentials, setupAgentClients } from '../execute/agent-setup.js';
import {
  getRepoRoot,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
} from '../../core/repository-utils.js';

import type { PRCommentAnalyzeOptions } from '../../types/commands.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type {
  CommentMetadata,
  ProposedChange,
  ResponsePlan,
  ResponsePlanComment,
  AnalyzerErrorType,
} from '../../types/pr-comment.js';
```

### Exported for Testing
```typescript
export const __testables = {
  parseResponsePlan,
  buildResponsePlanMarkdown,
};
```

---

## 9. Test Execution Patterns

### Test Infrastructure
- **Framework**: Jest
- **Mode**: ESM (with `unstable_mockModule`)
- **Run tests**:
  ```bash
  npm test                    # All tests
  npm run test:unit          # Unit tests only
  npm run test:integration   # Integration tests only
  npm run test:coverage      # With coverage report
  ```

### Mocking Patterns Used
1. **Mock module imports**: `jest.unstable_mockModule()`
2. **Mock functions**: `jest.fn()` with `.mockResolvedValue()`, `.mockRejectedValue()`
3. **Mock file I/O**: Mock `fs.readFile()`, `fs.writeFile()`, `fs.pathExists()`
4. **Spy on logger**: Suppress output during tests
5. **Spy on process.exit()**: Prevent actual exit, throw Error instead
6. **Mock readline**: Simulate user input
7. **Mock Git operations**: Mock simpleGit methods

### Test Organization
```typescript
describe('Unit Test Suite', () => {
  beforeAll(async () => {
    // ESM module imports with mocks
  });

  beforeEach(() => {
    // Reset mocks, clear pending comments, restore spies
  });

  it('test case description', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

---

## 10. Summary of Parse Strategies

| Strategy | Pattern | Use Case | Fallback Level |
|----------|---------|----------|-----------------|
| **Primary (Markdown Code Block)** | `/```json\s*([\s\S]*?)```/` | Standard LLM output | Initial attempt |
| **Strategy 1 (JSON Lines)** | Line-by-line backward search for JSON with "comments" field | Codex event stream output | First fallback |
| **Strategy 2 (Plain JSON)** | `/\{[\s\S]*"comments"[\s\S]*\}/` | Minimal formatting cases | Second fallback |
| **Fallback Plan** | Hard-coded safe default (all comments → discussion) | All strategies fail | Emergency fallback |

---

## 11. Additional Context

### Issue #427 - PR Comment Analyze Enhancement
- **Feature**: Robust JSON parsing for agent responses
- **Status**: Code implemented, tests written
- **Files Modified**: 
  - `src/commands/pr-comment/analyze.ts` (parseResponsePlan function)
  - `src/types/pr-comment.ts` (ResponsePlan, ResponsePlanComment types)
  - Tests: Unit and integration test coverage

### Related Issues
- **#383**: Initial PR comment feature
- **#407**: PR URL multi-repository support
- **#428**: Analyze phase error handling (in progress)

---

## 12. Build & Development

### Build Process
```bash
npm run build  # TypeScript → dist/, copy prompts/templates
npm run dev    # Watch mode
```

### Prompt Auto-Sync
- All prompts in `src/prompts/` are automatically copied to `dist/prompts/` during build
- Build script: `scripts/copy-static-assets.mjs`
- Load at runtime from `dist/prompts/pr-comment/analyze.txt`

