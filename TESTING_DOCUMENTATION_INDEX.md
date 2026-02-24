# Testing Documentation Index

This document serves as an index to all testing-related documentation for the ai-workflow-agent project.

## Documentation Files

### 1. CODEBASE_EXPLORATION_SUMMARY.md
**Size**: 20KB | **Lines**: 683  
**Purpose**: Comprehensive exploration of the entire codebase structure

**Contains**:
- Project overview and configuration (Jest, TypeScript, package.json)
- Test setup patterns (ESM mocking, beforeEach/afterEach structure)
- Detailed analysis of existing test files:
  - tests/unit/core/difficulty-analyzer.test.ts
  - tests/unit/commands/rewrite-issue.test.ts
  - tests/unit/utils/error-utils.test.ts
  - tests/unit/utils/logger.test.ts
- Complete source code structure:
  - Type definitions (DifficultyLevel, SupportedLanguage)
  - DifficultyAnalyzer class (all methods)
  - handleRewriteIssueCommand function
  - Utility functions (error-utils, logger)
- Testing best practices observed in the codebase
- Import patterns (ESM and test-specific)
- Jest configuration details
- File locations quick reference
- Summary of key classes and functions

**Use When**:
- You need to understand the entire test architecture
- You're learning how to structure new test files
- You need details on existing implementations
- You want to understand type definitions

**Location**: `/CODEBASE_EXPLORATION_SUMMARY.md`

### 2. TEST_PATTERNS_QUICK_REFERENCE.md
**Size**: 12KB | **Lines**: 446  
**Purpose**: Quick lookup guide for common testing patterns

**Contains**:
- ESM module mocking template (step-by-step)
- Class testing template (direct instantiation)
- Utility function testing template
- Async function testing patterns
- Mock configuration patterns
- Assertion patterns (comprehensive reference)
- Environment variable testing
- Console/Logger spy testing
- Boundary value testing
- Test Case ID (TC-ID) mapping
- Common imports for tests
- Running tests commands

**Use When**:
- You need to quickly look up how to mock something
- You're writing a new test and want assertion examples
- You need to understand mock configuration options
- You want to see template code to copy/paste

**Location**: `/TEST_PATTERNS_QUICK_REFERENCE.md`

### 3. Additional Reference Documentation
- **CODEBASE_SUMMARY.md**: High-level project structure and architecture
- **CODEBASE_EXPLORATION.md**: Original codebase exploration notes
- **CODEBASE_EXPLORATION_ISSUE427.md**: Issue #427-specific exploration
- **CODEBASE_EXPLORATION_ISSUE_603.md**: Issue #603-specific exploration
- **CODEBASE_EXPLORATION_ISSUE_719.md**: Issue #719-specific exploration

## Quick Start Guide

### Step 1: Understand the Architecture
Start with **CODEBASE_EXPLORATION_SUMMARY.md** Section 1-3:
1. Read "Project Configuration" to understand Jest setup
2. Read "Test Setup and Patterns" for ESM mocking basics
3. Read "Existing Test Files Structure" to see real examples

### Step 2: Learn Testing Patterns
Use **TEST_PATTERNS_QUICK_REFERENCE.md**:
1. Find the template matching your code type (ESM, class, utility)
2. Copy the template
3. Customize for your needs
4. Use the assertion patterns section for expect() calls

### Step 3: Deep Dive into Specific Topics
Go back to **CODEBASE_EXPLORATION_SUMMARY.md** for details:
- Section 4: Source code structure (for understanding what you're testing)
- Section 5: Testing best practices (for quality guidelines)
- Section 6: Import patterns (for correct ESM imports)
- Section 7: Key testing insights (for Jest configuration details)

### Step 4: Implement Your Tests
Follow these key principles:
1. **Structure**: Organize with describe/it blocks grouped by scenario
2. **Setup**: Use beforeEach/afterEach for test isolation
3. **Naming**: Use pattern "should <expected> (TC-ID-XXX)"
4. **Assertions**: Use patterns from quick reference guide
5. **Mocking**: Follow ESM template for module imports

## Test File Organization

```
tests/
├── unit/
│   ├── core/
│   │   └── difficulty-analyzer.test.ts     (Class testing)
│   ├── commands/
│   │   └── rewrite-issue.test.ts          (ESM module mocking)
│   └── utils/
│       ├── error-utils.test.ts            (Utility function testing)
│       └── logger.test.ts                 (Logger/spy testing)
├── integration/
│   └── [various integration tests]
├── runtime/
│   └── [runtime-specific tests]
└── setup-env.ts                            (Jest setup file)
```

## Key Testing Patterns by Type

### For Classes (like DifficultyAnalyzer)
Use template from **TEST_PATTERNS_QUICK_REFERENCE.md** - "Class Testing Template"
- Instantiate directly with mock dependencies
- Test public methods
- Mock internal dependencies
- Example: tests/unit/core/difficulty-analyzer.test.ts

### For Functions with ESM Dependencies (like handleRewriteIssueCommand)
Use template from **TEST_PATTERNS_QUICK_REFERENCE.md** - "ESM Module Mocking Template"
- Mock all dependencies BEFORE importing
- Use jest.unstable_mockModule() for ESM
- Configure default mock returns
- Example: tests/unit/commands/rewrite-issue.test.ts

### For Utility Functions (like getErrorMessage)
Use template from **TEST_PATTERNS_QUICK_REFERENCE.md** - "Utility Function Testing Template"
- Test multiple input types
- Test "never throw" guarantee
- Organized by scenario (Normal, Edge, Boundary)
- Example: tests/unit/utils/error-utils.test.ts

### For Logger/Console Output
Use template from **TEST_PATTERNS_QUICK_REFERENCE.md** - "Console/Logger Spy Testing"
- Spy on console methods
- Verify output format
- Test environment variable behavior
- Example: tests/unit/utils/logger.test.ts

## Mock Configuration Quick Reference

From **TEST_PATTERNS_QUICK_REFERENCE.md** - "Mock Configuration Patterns":

```typescript
// Simple value
mockFn.mockReturnValue(value);

// Promise/async
mockFn.mockResolvedValue(value);
mockFn.mockRejectedValue(error);

// Custom logic
mockFn.mockImplementation((arg) => { /* custom */ });

// One-time only
mockFn.mockReturnValueOnce(value);
mockFn.mockResolvedValueOnce(value);

// Cleanup
jest.clearAllMocks();
jest.restoreAllMocks();
```

## Assertion Quick Reference

From **TEST_PATTERNS_QUICK_REFERENCE.md** - "Assertion Patterns":

```typescript
// Value matching
expect(result).toBe(value);           // Exact
expect(result).toEqual(value);        // Deep equality
expect(result).toBeCloseTo(0.88, 2);  // Within precision

// String/Array
expect(string).toContain('text');
expect(array).toHaveLength(3);

// Calls
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg);
expect(mockFn).toHaveBeenCalledTimes(3);

// Errors
expect(() => fn()).toThrow();
await expect(asyncFn()).rejects.toThrow();
```

## Environment Variables for Testing

From **CODEBASE_EXPLORATION_SUMMARY.md** - Section 2:

```bash
# Setup in jest config or tests/setup-env.ts
process.env.GIT_AUTHOR_NAME = 'AI Workflow Bot'
process.env.AI_WORKFLOW_LANGUAGE = 'ja'
process.env.LOG_LEVEL = 'debug'
process.env.LOG_NO_COLOR = 'true' or '1'
```

## Running Tests

From **TEST_PATTERNS_QUICK_REFERENCE.md** - "Running Tests":

```bash
npm test                           # All tests
npm run test:unit                 # Unit tests only
npm run test:unit -- <pattern>    # Specific test
npm run test:coverage             # With coverage report
npm test -- --watch              # Watch mode
npm test -- --verbose            # Verbose output
```

## Common Test Case ID Prefixes

From **TEST_PATTERNS_QUICK_REFERENCE.md** - "Test Case ID (TC-ID) Mapping":

- **TC-UNIT-XXX**: Unit tests for basic functionality
- **TC-INT-XXX**: Integration tests
- **TC-CI-XXX**: Custom instruction feature tests
- **TC-DA-XXX**: Difficulty analyzer tests
- **TC-CLASS-XXX**: Class instantiation and method tests
- **TC-UTIL-XXX**: Utility function tests
- **TC-ENV-XXX**: Environment-dependent tests
- **TC-LOG-XXX**: Logging/output tests
- **TC-BOUND-XXX**: Boundary value tests
- **TC-ASYNC-XXX**: Async/Promise tests

## Troubleshooting

### ESM Module Mocking Issues
- Ensure jest.unstable_mockModule() is called BEFORE importing the tested module
- All .js extensions must be included in mock paths
- All dependencies must be mocked or they'll fail at import time

### Console Output Testing
- Save and restore process.env in beforeEach/afterEach
- Use jest.spyOn() for console methods
- Set chalk.level = 3 for consistent color testing

### Async Test Failures
- Always use async/await with async tests
- Use .rejects for async error testing
- Set up mock resolved values with mockResolvedValue()

### Type Errors in Tests
- Use `as any` for mock objects when TypeScript is strict
- Import types from @jest/globals not jest
- Use generics for test data typing

## Best Practices Summary

From **CODEBASE_EXPLORATION_SUMMARY.md** - Section 5:

1. **Test Naming**: "should <behavior> (TC-ID)"
2. **Structure**: Given-When-Then pattern
3. **Isolation**: Clear/restore mocks in beforeEach/afterEach
4. **Grouping**: Organize by scenario (Normal, Error, Edge)
5. **Defaults**: Setup common mocks before overriding in tests
6. **Coverage**: Test happy path, error cases, boundaries, and edge cases

## Finding Examples

To find examples of specific patterns in the codebase:

```
Tests for classes:
  → /tests/unit/core/difficulty-analyzer.test.ts

Tests for ESM functions:
  → /tests/unit/commands/rewrite-issue.test.ts

Tests for utilities:
  → /tests/unit/utils/error-utils.test.ts
  → /tests/unit/utils/logger.test.ts
```

## Contributing New Tests

When adding new test files:

1. Create file at appropriate path: `/tests/[unit|integration|runtime]/{module-path}.test.ts`
2. Choose appropriate template from TEST_PATTERNS_QUICK_REFERENCE.md
3. Follow naming conventions and Given-When-Then structure
4. Add TC-ID comments based on test scenario
5. Ensure mocks are isolated (clear in beforeEach, restore in afterEach)
6. Run tests to verify: `npm run test:unit -- tests/path/to/test.test.ts`

## Additional Resources

- Jest Documentation: https://jestjs.io/docs/getting-started
- Jest API: https://jestjs.io/docs/api
- ts-jest: https://github.com/kulshekhar/ts-jest
- ESM Testing: https://jestjs.io/docs/ecmascript-modules

---

Last Updated: 2026-02-20

For detailed information on any topic, refer to the specific documentation files listed above.
