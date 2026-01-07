# Issue #603 Codebase Exploration Summary

## Issue Overview
**Issue #603:** Execute step creating files in wrong directory

This issue concerns incorrect working directory handling during the Execute step, which may cause files to be created in wrong locations (e.g., in the workspace instead of the target repository directory).

---

## Project Structure Overview

### Root Directory Structure
```
ai-workflow-agent/
├── Dockerfile                     # Node 20-based Codex image
├── package.json                   # CLI entry point (bin: ai-workflow)
├── src/
│   ├── commands/                  # CLI command handlers (init, execute, review, etc.)
│   ├── core/                      # Core utilities and agents
│   ├── phases/                    # Phase implementations (planning → evaluation)
│   ├── prompts/                   # Phase/command-specific prompts (multilingual)
│   ├── templates/                 # PR templates
│   ├── types.ts                   # TypeScript type definitions
│   ├── main.ts                    # CLI definition
│   └── index.ts                   # Entry point
├── tests/                         # Unit and integration tests
├── dist/                          # Compiled JavaScript output
└── [Documentation files: README.md, ARCHITECTURE.md, CLAUDE.md, etc.]
```

---

## Key Files for Issue #603

### 1. **Agent Executor** (`src/phases/core/agent-executor.ts`)
**Responsibility:** Execute Codex/Claude agents with proper working directory handling

**Key Features:**
- Lines 27-68: Constructor - stores working directory and optional `getAgentWorkingDirectoryFn`
- Lines 89-183: `executeWithAgent()` - Main execution method with fallback support
- Lines 207-307: `runAgentTask()` - Handles agent task execution
- **Line 254:** Passes `workingDirectory` to agent's `executeTask()` method
- **Line 232:** Uses `getAgentWorkingDirectoryFn?.() ?? this.workingDir` for working directory resolution

**Critical Code (Line 230-234):**
```typescript
// Issue #264: REPOS_ROOT対応の作業ディレクトリを使用
// getAgentWorkingDirectoryFn が設定されている場合はそちらを優先
const agentWorkingDir = this.getAgentWorkingDirectoryFn?.() ?? this.workingDir;
logger.debug(`Agent working directory: ${agentWorkingDir}`);
```

### 2. **Step Executor** (`src/phases/lifecycle/step-executor.ts`)
**Responsibility:** Manages step execution (execute/review/revise) and Git operations

**Key Features:**
- Lines 70-107: `executeStep()` - Executes the execute step
- Lines 124-177: `reviewStep()` - Executes the review step
- Lines 199-218: `reviseStep()` - Delegates to ReviewCycleManager
- Lines 231-269: `commitAndPushStep()` - Git commit & push after each step

**Note:** This module does NOT directly handle working directory - it delegates to BasePhase.

### 3. **Base Phase** (`src/phases/base-phase.ts`)
**Responsibility:** Base class for all 10 phases with working directory management

**Critical Methods:**
- **Lines 105-123:** `getAgentWorkingDirectory()`
  - Checks REPOS_ROOT environment variable first
  - Falls back to agent's getWorkingDirectory() method
  - Final fallback to this.workingDir
  
- **Lines 158-184:** `resolveWorkflowBaseDir()`
  - Resolves workflow directory considering REPOS_ROOT
  - Priority: REPOS_ROOT + repoName > metadata.workflowDir

- **Lines 223-234:** Constructor initialization
  - Creates AgentExecutor with `getAgentWorkingDirectory` function reference
  - Passes working directory resolver function to AgentExecutor

**Key Code (Lines 225-234):**
```typescript
if (this.codex || this.claude) {
  const agentPriority = PHASE_AGENT_PRIORITY[this.phaseName];
  this.agentExecutor = new AgentExecutor(
    this.codex,
    this.claude,
    this.metadata,
    this.phaseName,
    this.workingDir,
    () => this.getAgentWorkingDirectory(),  // DYNAMIC RESOLVER!
    agentPriority,
  );
}
```

### 4. **Requirements Phase** (`src/phases/requirements.ts`)
**Responsibility:** Concrete implementation for requirements phase

**Note:** Inherits from BasePhase, uses standard executePhaseTemplate() pattern (lines 26-32)

### 5. **Claude Agent Client** (`src/core/claude-agent-client.ts`)
**Responsibility:** Claude Code SDK integration with working directory resolution

**Critical Features:**
- Lines 77-79: `getWorkingDirectory()` - Returns stored working directory
- Lines 81-96: `executeTask()` - Main execution with working directory handling
  - **Lines 89-97:** Issue #507 fix - If working directory doesn't exist, resolve it
  - Calls `resolveWorkingDirectory()` function for fallback resolution

**Critical Code (Lines 85-97):**
```typescript
const cwdExists = fs.existsSync(cwd);
logger.debug(`[ClaudeAgent] Original working directory: ${cwd}`);
logger.debug(`[ClaudeAgent] Directory exists: ${cwdExists}`);

// Issue #507: 作業ディレクトリが存在しない場合のフォールバック処理を改善
if (!cwdExists) {
  logger.warn(`Working directory does not exist: ${cwd}`);
  const resolvedCwd = await resolveWorkingDirectory(cwd);
  logger.info(`Resolved working directory: ${resolvedCwd}`);
  logger.debug(`[ClaudeAgent] Resolved directory exists: ${fs.existsSync(resolvedCwd)}`);
  return this.executeTask({ ...options, workingDirectory: resolvedCwd });
}
```

### 6. **Working Directory Resolver** (`src/core/helpers/working-directory-resolver.ts`)
**Responsibility:** Resolve working directory for agents in multi-repository environments

**Key Functions:**
- **Lines 20-80:** `resolveWorkingDirectory()`
  - Step 1: Load metadata and check `target_repository.path`
  - Step 2: Try REPOS_ROOT environment variable
  - Step 3: Fall back to process.cwd()

**Resolution Priority:**
1. **metadata.target_repository.path** (highest priority)
2. **REPOS_ROOT + inferred repo name** (fallback)
3. **process.cwd()** (final fallback)

**Critical Code (Lines 42-46):**
```typescript
if (metadata.target_repository?.path && fs.existsSync(metadata.target_repository.path)) {
  logger.info(`Using target_repository.path from metadata: ${metadata.target_repository.path}`);
  validateReposRootConsistency(metadata.target_repository.path, originalPath);
  return metadata.target_repository.path;
}
```

### 7. **Context Builder** (`src/phases/context/context-builder.ts`)
**Responsibility:** Build file references for agent context

**Key Features:**
- **Lines 117-130:** `getAgentFileReference()`
  - Computes relative path from agent working directory to file
  - Returns @filepath format for agent reference
  - Returns null if path goes up (..) or is absolute

**Note:** Uses `getAgentWorkingDirectoryFn()` to get current working directory

### 8. **Config** (`src/core/config.ts`)
**Responsibility:** Centralized environment variable access

**Key Method:**
- **Lines 328-330:** `getReposRoot()`
  - Returns REPOS_ROOT environment variable or null

**Use:** REPOS_ROOT is optional environment variable for multi-repository setups

---

## Current Working Directory Handling Logic

### Flow Diagram

```
Phase.execute()
    ↓
BasePhase.executeWithAgent()
    ↓
AgentExecutor.executeWithAgent()
    ↓
AgentExecutor.runAgentTask()
    ├─ agentWorkingDir = getAgentWorkingDirectoryFn?.() ?? this.workingDir
    │                    (Line 232 in agent-executor.ts)
    ↓
agent.executeTask({ workingDirectory: agentWorkingDir, ... })
    ├─ Codex: Uses workingDirectory directly
    └─ Claude: Validates existence, resolves if not found
        ├─ If !fs.existsSync(cwd):
        │   └─ resolveWorkingDirectory() → metadata.target_repository.path
        └─ Executes Claude Agent SDK with resolved cwd
```

### Working Directory Resolution in BasePhase

**getAgentWorkingDirectory() method (Lines 105-123):**
```
1. Check REPOS_ROOT + metadata.target_repository.repo
   └─ If exists: return that path
2. Try agent.getWorkingDirectory()
   └─ If available: return that
3. Fall back to this.workingDir
   └─ Final fallback
```

### Phase Directory Resolution

**resolveWorkflowBaseDir() method (Lines 158-184):**
```
1. Check REPOS_ROOT is set AND repoName available
   ├─ If yes: use REPOS_ROOT/repoName/.ai-workflow/issue-{NUM}
   └─ If no: proceed to fallback
2. Use metadata.workflowDir
   └─ If available: return that
3. Fall back to process.cwd()/.ai-workflow/issue-{NUM}
```

---

## File Creation Process

### Where Files Get Created

**Output Files:**
- **Location:** `{phaseDir}/output/`
- **Resolved by:** `BasePhase` constructor (line 207)
  - `this.outputDir = path.join(this.phaseDir, 'output')`

**Workflow Files:**
- **Location:** `.ai-workflow/issue-{NUMBER}/{PHASE_NUMBER}_{PHASE_NAME}/`
- **Base directory:** Resolved by `resolveWorkflowBaseDir()`

### Potential Issue Points

1. **Timing of working directory resolution**
   - Agent working directory resolved at execution time
   - Workflow base directory resolved at phase construction time
   - Mismatch could occur if directories change between phases

2. **Multi-repository environment**
   - REPOS_ROOT must be set correctly
   - metadata.target_repository.path must be accurate
   - Claude Agent's resolveWorkingDirectory() needs to succeed

3. **Relative path calculations**
   - ContextBuilder uses getAgentWorkingDirectory() as base
   - If working directory changes, relative paths become invalid

---

## SecretMasker Implementation

### Purpose
Prevents GitHub Secret Scanning from blocking pushes by masking sensitive values

### Key Features (Lines 60-535 in secret-masker.ts)

**maskObject() Method (Lines 123-245):**
- Applies two-step masking process
- Step 1: Pattern/path protection (maskString())
- Step 2: Environment variable replacement
- **Critical Issue #595 Fix:** Processing order ensures paths aren't corrupted

**maskString() Method (Lines 292-381):**
- Protects Unix path components (20+ chars)
- Protects GitHub URLs
- Masks tokens, emails, generic secrets
- Supports ignoredPaths parameter to preserve specific content

**Critical Code (Lines 163-185):**
```typescript
const applyMasking = (value: string): string => {
  // Step 1: Path protection must execute FIRST
  let masked = this.maskString(value);
  
  // Step 2: Environment variable replacement (safe now)
  for (const [secretValue, replacement] of replacementMap) {
    if (secretValue) {
      masked = masked.split(secretValue).join(replacement);
    }
  }
  return masked;
};
```

### Masking Targets vs. Preservation

**What Gets Masked:**
- GitHub tokens (ghp_*, github_pat_*)
- Email addresses
- Long tokens (20+ characters)
- Bearer tokens, token= parameters

**What Is Preserved:**
- GitHub URLs (github.com/owner/repo)
- Unix paths (via protection placeholders)
- Object keys with preserved paths

---

## Existing Tests

### Test Files Related to Working Directory

1. **tests/unit/phases/core/agent-executor.test.ts**
   - Tests AgentExecutor initialization and execution
   - Tests agent priority (codex-first vs claude-first)
   - Tests fallback mechanisms

2. **tests/unit/phases/lifecycle/step-executor.test.ts**
   - Tests executeStep(), reviewStep(), reviseStep()
   - Tests completed_steps management
   - Tests Git commit & push operations
   - **Note:** Uses mock metadata with target_repository.path

3. **tests/integration/** directories
   - Contains integration tests for complete workflows
   - Tests multi-phase execution

---

## Environment Variables

### Critical for Working Directory

| Variable | Purpose | Type | Example |
|----------|---------|------|---------|
| `REPOS_ROOT` | Parent directory of repositories (multi-repo) | Optional | `/tmp/repos` |
| `GITHUB_REPOSITORY` | Repository identifier | Required | `owner/repo` |
| `CI` | CI environment flag | Optional | `true` |
| `JENKINS_HOME` | Jenkins detection | Optional | `/var/jenkins` |

### Other Important Variables

| Variable | Purpose | Type |
|----------|---------|------|
| `GITHUB_TOKEN` | GitHub authentication | Required |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code authentication | Optional |
| `CODEX_API_KEY` | Codex authentication | Optional |
| `LOG_LEVEL` | Logging verbosity | Optional |

---

## Documentation Files

### Key Documentation

1. **README.md** (85+ KB)
   - Project overview and features
   - Quick start guide
   - CLI options documentation
   - Prerequisites and setup

2. **ARCHITECTURE.md** (83+ KB)
   - Detailed architecture overview
   - Module interaction diagrams
   - Control flow explanations
   - Phase workflow details

3. **CLAUDE.md** (86+ KB)
   - Comprehensive developer guide
   - Code structure explanation
   - Issue numbering system
   - Development patterns

4. **TROUBLESHOOTING.md** (78+ KB)
   - Common issues and solutions
   - Debugging guides
   - Multi-repository setup

5. **CHANGELOG.md** (53+ KB)
   - Version history
   - Feature additions and bug fixes
   - Related issues

---

## Issue #603 Related Issues

### Previous Related Issues

| Issue | Title | Status | Notes |
|-------|-------|--------|-------|
| #264 | REPOS_ROOT support | Closed | Working directory resolution introduced |
| #274 | Workflow directory resolution | Closed | Dynamic path resolution with REPOS_ROOT |
| #507 | Working directory validation | Closed | Claude Agent directory existence check |
| #595 | Path masking issue | Closed | SecretMasker path protection fix |

---

## Key Code Patterns

### Pattern 1: Working Directory Getter Pattern
```typescript
// In BasePhase constructor:
this.agentExecutor = new AgentExecutor(
  ...,
  this.workingDir,
  () => this.getAgentWorkingDirectory(),  // Dynamic resolver!
  ...
);

// In AgentExecutor:
const agentWorkingDir = this.getAgentWorkingDirectoryFn?.() ?? this.workingDir;
```

**Why:** Defers working directory resolution until execution time (dynamic resolution)

### Pattern 2: Fallback Chain
```typescript
// In resolveWorkingDirectory():
1. Try metadata.target_repository.path
2. Try REPOS_ROOT + inferred repo name
3. Fall back to process.cwd()
```

**Why:** Handles multi-repository environments with graceful degradation

### Pattern 3: Validation Logging
```typescript
logger.debug(`[ClaudeAgent] Original working directory: ${cwd}`);
logger.debug(`[ClaudeAgent] Directory exists: ${cwdExists}`);
if (!cwdExists) {
  logger.warn(`Working directory does not exist: ${cwd}`);
  const resolvedCwd = await resolveWorkingDirectory(cwd);
  logger.info(`Resolved working directory: ${resolvedCwd}`);
}
```

**Why:** Provides visibility into directory resolution process

---

## Summary of Key Findings

### Strengths
1. **Dynamic working directory resolution** - Uses function references to defer resolution
2. **Multiple fallback layers** - Handles various deployment scenarios
3. **Metadata-based tracking** - target_repository.path stored and used
4. **Comprehensive logging** - Good visibility into directory decisions
5. **Multi-repository support** - REPOS_ROOT environment variable support

### Potential Issue Points (Related to #603)

1. **Working directory mismatch between phases**
   - Each phase calls getAgentWorkingDirectory()
   - If REPOS_ROOT or metadata changes, paths could diverge

2. **Metadata accuracy**
   - target_repository.path must be accurate and consistent
   - Incorrect metadata could cause files in wrong location

3. **REPOS_ROOT environment variable**
   - If set inconsistently, could cause path resolution issues
   - Must be set before workflow execution

4. **Claude Agent directory validation**
   - If resolveWorkingDirectory() fails, falls back to process.cwd()
   - Could hide underlying path issues

5. **Relative path calculations**
   - ContextBuilder uses getAgentWorkingDirectory()
   - File references assume consistent working directory

---

## Recommendations for Investigation

1. **Check metadata.target_repository.path**
   - Verify it matches actual repository location
   - Ensure it's consistent across all phases

2. **Review REPOS_ROOT usage**
   - Verify environment variable is set correctly
   - Check if it changes between phase executions

3. **Add working directory logging**
   - Log actual working directory used by each phase
   - Compare with expected directory

4. **Check file creation paths**
   - Verify files are created in expected output directories
   - Check for files created outside .ai-workflow directory

5. **Review multi-repository scenarios**
   - Test with REPOS_ROOT set and unset
   - Test with different repository structures

