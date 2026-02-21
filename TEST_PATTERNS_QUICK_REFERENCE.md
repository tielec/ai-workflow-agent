# Test Patterns Quick Reference Guide

This is a quick lookup guide for common testing patterns in the ai-workflow-agent codebase.

## ESM Module Mocking Template

```typescript
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// 1. Define all mock functions at module scope
const mockFunctionA = jest.fn();
const mockFunctionB = jest.fn();

// 2. Mock all dependencies BEFORE importing tested module
await jest.unstable_mockModule('../../../src/path/to/module-a.js', () => ({
  __esModule: true,
  ClassName: class {
    methodA = mockFunctionA;
  },
}));

await jest.unstable_mockModule('../../../src/path/to/module-b.js', () => ({
  __esModule: true,
  functionB: mockFunctionB,
}));

// 3. Import tested module AFTER all mocks are set up
const { testedFunction } = await import('../../../src/path/to/tested-module.js');

// 4. Define test suite
describe('Tested Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFunctionA.mockReturnValue(defaultValue);
    mockFunctionB.mockResolvedValue(defaultPromise);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 5. Write tests
  it('should do something (TC-ID-001)', async () => {
    // Given: Setup
    const input = { /* ... */ };
    
    // When: Execute
    const result = await testedFunction(input);
    
    // Then: Assert
    expect(result).toBe(expected);
    expect(mockFunctionA).toHaveBeenCalledWith(expectedArg);
  });
});
```

## Class Testing Template (Direct Instantiation)

```typescript
describe('ClassName', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Mock any static dependencies
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should initialize correctly (TC-CLASS-001)', () => {
    // Given
    const mockClient = { executeTask: jest.fn().mockResolvedValue([...]) };
    
    // When
    const instance = new ClassName({
      client: mockClient as any,
      otherOption: 'value',
    });
    
    // Then
    expect(instance).toBeDefined();
    expect(instance.property).toBe(expectedValue);
  });

  it('should execute primary logic (TC-CLASS-002)', async () => {
    // Given
    const mockClient = {
      executeTask: jest.fn(async () => [JSON.stringify({ /* response */ })]),
    };
    const instance = new ClassName({ client: mockClient as any, workingDir: process.cwd() });
    
    // When
    const result = await instance.analyze(input);
    
    // Then
    expect(result.level).toBe('moderate');
    expect(mockClient.executeTask).toHaveBeenCalledTimes(1);
  });

  it('should handle fallback scenario (TC-CLASS-003)', async () => {
    // Given: Primary fails, fallback succeeds
    const primaryClient = { executeTask: jest.fn().mockRejectedValue(new Error('fail')) };
    const fallbackClient = {
      executeTask: jest.fn().mockResolvedValue([JSON.stringify({ /* response */ })]),
    };
    const instance = new ClassName({
      primaryClient: primaryClient as any,
      fallbackClient: fallbackClient as any,
    });
    
    // When
    const result = await instance.analyze(input);
    
    // Then
    expect(fallbackClient.executeTask).toHaveBeenCalled();
    expect(result.fallbackUsed).toBe(true);
  });
});
```

## Utility Function Testing Template

```typescript
describe('Utility Module', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('functionName()', () => {
    describe('Normal Cases', () => {
      it('should handle valid input (TC-UTIL-001)', () => {
        // Given
        const input = 'valid';
        
        // When
        const result = utilityFunction(input);
        
        // Then
        expect(result).toBe(expected);
      });

      it('should handle different types (TC-UTIL-002)', () => {
        expect(utilityFunction(null)).toBe('null');
        expect(utilityFunction(undefined)).toBe('undefined');
        expect(utilityFunction(123)).toBe('123');
        expect(utilityFunction(true)).toBe('true');
      });
    });

    describe('Edge Cases', () => {
      it('should never throw (TC-UTIL-003)', () => {
        const inputs = [null, undefined, {}, [], Symbol('test'), BigInt(123)];
        
        inputs.forEach((input) => {
          expect(() => utilityFunction(input)).not.toThrow();
          expect(typeof utilityFunction(input)).toBe('string');
        });
      });

      it('should handle circular references', () => {
        const obj: any = { name: 'test' };
        obj.self = obj;
        
        expect(() => utilityFunction(obj)).not.toThrow();
        expect(typeof utilityFunction(obj)).toBe('string');
      });
    });
  });
});
```

## Async Function Testing Patterns

```typescript
// Test successful async execution
it('should resolve with value (TC-ASYNC-001)', async () => {
  const result = await asyncFunction(input);
  expect(result).toBe(expected);
});

// Test promise rejection
it('should reject with error (TC-ASYNC-002)', async () => {
  await expect(asyncFunction(invalid)).rejects.toThrow('error message');
});

// Setup async mock returns
mockFn.mockResolvedValue(resolvedValue);
mockFn.mockResolvedValueOnce(oneTimeValue);
mockFn.mockRejectedValue(new Error('failure'));
mockFn.mockRejectedValueOnce(new Error('one-time failure'));

// Test async with mixed success/failure
it('should fallback on error (TC-ASYNC-003)', async () => {
  mockPrimary.mockRejectedValueOnce(new Error('primary down'));
  mockFallback.mockResolvedValueOnce(fallbackResult);
  
  const result = await callWithFallback();
  
  expect(result).toBe(fallbackResult);
  expect(mockPrimary).toHaveBeenCalledTimes(1);
  expect(mockFallback).toHaveBeenCalledTimes(1);
});
```

## Mock Configuration Patterns

```typescript
// Mock return value
mockFn.mockReturnValue(simpleValue);

// Mock async return (Promise)
mockFn.mockResolvedValue(resolvedValue);

// Mock error throw
mockFn.mockRejectedValue(new Error('message'));

// Custom implementation
mockFn.mockImplementation((arg) => {
  if (arg === 'special') return 'special-result';
  return 'normal-result';
});

// One-time overrides
mockFn.mockReturnValueOnce('first-call-value');
mockFn.mockResolvedValueOnce(firstCallPromise);
mockFn.mockRejectedValueOnce(new Error('first-call-error'));

// Clear and restore
jest.clearAllMocks();        // Clear call history, keep implementation
jest.resetAllMocks();        // Clear everything
jest.restoreAllMocks();      // Restore to original implementation
```

## Assertion Patterns

```typescript
// Value assertions
expect(result).toBe(exactValue);              // Exact match (===)
expect(result).toEqual(objectValue);          // Deep equality
expect(result).toStrictEqual(strictValue);    // Strict deep equality

// Type assertions
expect(typeof result).toBe('string');
expect(result).toBeInstanceOf(ClassName);
expect(Array.isArray(result)).toBe(true);

// Numeric assertions
expect(result).toBeCloseTo(0.88, 2);          // Within 2 decimal places
expect(result).toBeGreaterThan(10);
expect(result).toBeLessThanOrEqual(100);

// String/Array assertions
expect(string).toMatch(/pattern/);
expect(string).toContain('substring');
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Call assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(3);
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).not.toHaveBeenCalled();

// Partial object matching
expect(result).toEqual(expect.objectContaining({
  key1: 'value1',
  // other keys can be anything
}));

// Error assertions
expect(() => functionThatThrows()).toThrow();
expect(() => functionThatThrows()).toThrow('error message');
await expect(asyncFn()).rejects.toThrow('error');
```

## Environment Variable Testing

```typescript
describe('Environment-dependent code', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should use default when variable not set (TC-ENV-001)', () => {
    delete process.env.MY_VARIABLE;
    
    const result = getConfig();
    
    expect(result.value).toBe(defaultValue);
  });

  it('should use value when variable is set (TC-ENV-002)', () => {
    process.env.MY_VARIABLE = 'custom-value';
    
    const result = getConfig();
    
    expect(result.value).toBe('custom-value');
  });

  it('should fall back when invalid value is set (TC-ENV-003)', () => {
    process.env.LOG_LEVEL = 'invalid';
    
    const level = getCurrentLogLevel();
    
    expect(level).toBe('info'); // default fallback
  });
});
```

## Console/Logger Spy Testing

```typescript
describe('Logging output', () => {
  let consoleLogSpy: jest.Mock;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(consoleLogSpy);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log to console (TC-LOG-001)', () => {
    logger.info('test message');
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'));
  });

  it('should use console.error for errors (TC-LOG-002)', () => {
    logger.error('error message');
    
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should format output correctly (TC-LOG-003)', () => {
    process.env.LOG_NO_COLOR = 'true';
    
    logger.info('formatted');
    
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
```

## Boundary Value Testing

```typescript
describe('Boundary values', () => {
  it('should handle minimum valid value (TC-BOUND-001)', () => {
    const result = processValue(1);
    expect(result.isValid).toBe(true);
  });

  it('should handle maximum valid value (TC-BOUND-002)', () => {
    const result = processValue(500);
    expect(result.isValid).toBe(true);
  });

  it('should reject below minimum (TC-BOUND-003)', () => {
    expect(() => processValue(0)).toThrow('too small');
  });

  it('should reject above maximum (TC-BOUND-004)', () => {
    expect(() => processValue(501)).toThrow('too large');
  });

  it('should handle exactly at boundaries (TC-BOUND-005)', () => {
    // Exact minimum
    expect(() => processValue(1)).not.toThrow();
    // Exact maximum
    expect(() => processValue(500)).not.toThrow();
  });
});
```

## Test Case ID (TC-ID) Mapping

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

## Common Imports for Tests

```typescript
// Always import from @jest/globals in tests
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// For utility testing
import { getErrorMessage, isError, getErrorStack } from '../../../src/utils/error-utils.js';
import { logger } from '../../../src/utils/logger.js';

// For class testing
import { DifficultyAnalyzer } from '../../../src/core/difficulty-analyzer.js';

// For external dependency mocking
import chalk from 'chalk'; // When testing coloring behavior
```

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run specific test file
npm run test:unit -- tests/unit/core/difficulty-analyzer.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch

# Run with verbose output
npm test -- --verbose
```

This quick reference covers the most common patterns used in the ai-workflow-agent test suite.
