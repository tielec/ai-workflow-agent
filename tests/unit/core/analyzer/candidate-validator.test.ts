import { jest } from '@jest/globals';

// Virtual mocks for analyzer dependencies under src/core/utils/*
const loggerMock = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../../../src/core/utils/logger.js', () => ({ logger: loggerMock }), {
  virtual: true,
});

import {
  validateAnalysisResult,
  validateBugCandidate,
  validateEnhancementProposal,
  validateRefactorCandidate,
} from '../../../../src/core/analyzer/candidate-validator.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../../../src/core/analyzer/types.js';

describe('candidate-validator: bug candidates', () => {
  const baseBug: BugCandidate = {
    title: 'Unhandled promise rejection in API service',
    file: 'src/services/api-service.ts',
    line: 42,
    severity: 'high',
    description:
      'The fetchData method does not properly handle promise rejections, which could lead to unhandled exceptions and application crashes in production.',
    suggestedFix:
      'Wrap the fetch call in a try-catch block and implement proper error handling with user-friendly error messages.',
    category: 'bug',
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid candidates and boundary title lengths', () => {
    expect(validateBugCandidate(baseBug)).toBe(true);
    expect(
      validateBugCandidate({
        ...baseBug,
        title: 'ABCDEFGHIJ',
      }),
    ).toBe(true);
    expect(
      validateBugCandidate({
        ...baseBug,
        title: 'A'.repeat(100),
      }),
    ).toBe(true);
  });

  it('rejects missing, malformed, or excluded fields', () => {
    expect(validateBugCandidate(null as unknown as BugCandidate)).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        title: 'Too short',
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        title: 'A'.repeat(101),
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        file: 'node_modules/lodash/index.js',
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        file: 'assets/jquery.min.js',
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        line: 0,
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        severity: 'critical' as unknown as BugCandidate['severity'],
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        description: 'too short description',
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        suggestedFix: 'short fix',
      }),
    ).toBe(false);
    expect(
      validateBugCandidate({
        ...baseBug,
        category: 'refactor' as unknown as BugCandidate['category'],
      }),
    ).toBe(false);
  });
});

describe('candidate-validator: refactor candidates', () => {
  const baseRefactor: RefactorCandidate = {
    type: 'large-file',
    filePath: 'src/core/repository-analyzer.ts',
    description: 'File exceeds 1000 lines and mixes multiple responsibilities',
    suggestion: 'Extract path exclusion, output parsing, and validation into separate modules',
    priority: 'high',
    lineRange: { start: 1, end: 1200 },
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid candidates across supported types', () => {
    const validTypes: RefactorCandidate['type'][] = [
      'large-file',
      'large-function',
      'high-complexity',
      'duplication',
      'unused-code',
      'missing-docs',
    ];
    validTypes.forEach((type) => {
      expect(validateRefactorCandidate({ ...baseRefactor, type })).toBe(true);
    });
    expect(validateRefactorCandidate({ ...baseRefactor, lineRange: undefined })).toBe(true);
  });

  it('rejects invalid structures and values', () => {
    expect(validateRefactorCandidate(null as unknown as RefactorCandidate)).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        type: 'unknown-type' as RefactorCandidate['type'],
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        filePath: 'node_modules/lib/index.js',
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        filePath: 'assets/jquery.min.js',
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        lineRange: { start: 10, end: 5 },
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        lineRange: { start: -1, end: 5 },
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        lineRange: { start: 1 } as unknown as RefactorCandidate['lineRange'],
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        description: 'too short description',
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        suggestion: 'too short suggestion',
      }),
    ).toBe(false);
    expect(
      validateRefactorCandidate({
        ...baseRefactor,
        priority: 'critical' as RefactorCandidate['priority'],
      }),
    ).toBe(false);
  });
});

describe('candidate-validator: enhancement proposals', () => {
  const baseEnhancement: EnhancementProposal = {
    type: 'improvement',
    title: 'Add progress indicator for long-running analysis operations',
    description:
      'The repository analysis process can take several minutes for large codebases. Adding a progress indicator would improve user experience by providing feedback during the analysis.',
    rationale:
      'Users currently have no visibility into analysis progress, leading to uncertainty about whether the process is working correctly.',
    implementation_hints: ['Use ora', 'Add progress callbacks'],
    expected_impact: 'medium',
    effort_estimate: 'small',
    related_files: ['src/core/repository-analyzer.ts'],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid proposals and all supported types', () => {
    const validTypes: EnhancementProposal['type'][] = [
      'improvement',
      'integration',
      'automation',
      'dx',
      'quality',
      'ecosystem',
    ];
    validTypes.forEach((type) => {
      expect(validateEnhancementProposal({ ...baseEnhancement, type })).toBe(true);
    });
  });

  it('rejects missing fields and invalid values', () => {
    expect(validateEnhancementProposal(null as unknown as EnhancementProposal)).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        type: 'unknown' as EnhancementProposal['type'],
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        title: 'Too short',
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        title: 'A'.repeat(201),
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        description: 'short'.repeat(10),
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        rationale: 'short rationale',
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        implementation_hints: [],
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        expected_impact: 'huge' as EnhancementProposal['expected_impact'],
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        effort_estimate: 'tiny' as EnhancementProposal['effort_estimate'],
      }),
    ).toBe(false);
    expect(
      validateEnhancementProposal({
        ...baseEnhancement,
        related_files: [],
      }),
    ).toBe(false);
  });
});

describe('candidate-validator: validateAnalysisResult', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('filters invalid bug candidates', () => {
    const candidates: BugCandidate[] = [
      {
        title: 'Valid bug candidate title',
        file: 'src/app.ts',
        line: 5,
        severity: 'medium',
        description: 'A'.repeat(55),
        suggestedFix: 'B'.repeat(25),
        category: 'bug',
      },
      {
        title: 'Too short',
        file: 'src/app.ts',
        line: 5,
        severity: 'medium',
        description: 'A'.repeat(55),
        suggestedFix: 'B'.repeat(25),
        category: 'bug',
      },
    ];

    expect(validateAnalysisResult(candidates, 'bug')).toHaveLength(1);
  });

  it('filters invalid refactor candidates', () => {
    const candidates: RefactorCandidate[] = [
      {
        type: 'large-file',
        filePath: 'src/app.ts',
        description: 'A'.repeat(25),
        suggestion: 'B'.repeat(25),
        priority: 'high',
      },
      {
        type: 'unknown-type' as RefactorCandidate['type'],
        filePath: 'src/app.ts',
        description: 'A'.repeat(25),
        suggestion: 'B'.repeat(25),
        priority: 'high',
      },
    ];

    expect(validateAnalysisResult(candidates, 'refactor')).toHaveLength(1);
  });
});
