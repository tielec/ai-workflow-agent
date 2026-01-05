import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

// Virtual mocks for missing core/utils modules referenced by analyzer code
const loggerMock = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock(
  '../../../../src/core/utils/logger.js',
  () => {
    (globalThis as any).__ai_workflow_logger_override = loggerMock;
    return { logger: loggerMock };
  },
  {
    virtual: true,
  },
);
jest.mock(
  '../../../../src/core/utils/error-utils.js',
  () => ({
    getErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  }),
  { virtual: true },
);

import {
  extractJsonSegment,
  parseEnhancementProposals,
  readBugOutputFile,
  readEnhancementOutputFile,
  readRefactorOutputFile,
  tryParseEnhancementJson,
} from '../../../../src/core/analyzer/output-parser.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../../../src/core/analyzer/types.js';

beforeAll(() => {
  (globalThis as any).__ai_workflow_logger_override = loggerMock;
});

describe('output-parser: bug candidates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-parser-'));
  });

afterEach(() => {
  loggerMock.debug.mockClear();
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

afterAll(() => {
  delete (globalThis as any).__ai_workflow_logger_override;
});

  it('parses array, wrapper, and single-object formats', () => {
    const arrayPath = path.join(tempDir, 'bugs-array.json');
    const wrapperPath = path.join(tempDir, 'bugs-wrapper.json');
    const singlePath = path.join(tempDir, 'bugs-single.json');

    const base: BugCandidate = {
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

    fs.writeFileSync(arrayPath, JSON.stringify([base, { ...base, title: 'Another bug' }]));
    fs.writeFileSync(wrapperPath, JSON.stringify({ bugs: [base] }));
    fs.writeFileSync(singlePath, JSON.stringify(base));

    expect(readBugOutputFile(arrayPath)).toHaveLength(2);
    expect(readBugOutputFile(wrapperPath)).toHaveLength(1);
    expect(readBugOutputFile(singlePath)).toHaveLength(1);
  });

  it('returns empty array for missing, malformed, or invalid structures', () => {
    const invalidPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidPath, 'not-json');

    const wrongStructurePath = path.join(tempDir, 'wrong.json');
    fs.writeFileSync(wrongStructurePath, JSON.stringify({ data: [] }));

    expect(readBugOutputFile(path.join(tempDir, 'missing.json'))).toEqual([]);
    expect(readBugOutputFile(invalidPath)).toEqual([]);
    expect(readBugOutputFile(wrongStructurePath)).toEqual([]);
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe('output-parser: refactor candidates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-parser-'));
  });

  afterEach(() => {
    loggerMock.debug.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses array, wrapper, and single-object formats', () => {
    const arrayPath = path.join(tempDir, 'refactor-array.json');
    const wrapperPath = path.join(tempDir, 'refactor-wrapper.json');
    const singlePath = path.join(tempDir, 'refactor-single.json');

    const base: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description: 'File exceeds 1000 lines and mixes multiple responsibilities',
      suggestion: 'Extract path exclusion, output parsing, and validation into separate modules',
      priority: 'high',
      lineRange: { start: 1, end: 1200 },
    };

    fs.writeFileSync(arrayPath, JSON.stringify([base, { ...base, type: 'duplication' }]));
    fs.writeFileSync(wrapperPath, JSON.stringify({ candidates: [base] }));
    fs.writeFileSync(singlePath, JSON.stringify(base));

    expect(readRefactorOutputFile(arrayPath)).toHaveLength(2);
    expect(readRefactorOutputFile(wrapperPath)).toHaveLength(1);
    expect(readRefactorOutputFile(singlePath)).toHaveLength(1);
  });

  it('returns empty array for missing or malformed refactor output', () => {
    const invalidPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidPath, 'oops');

    expect(readRefactorOutputFile(path.join(tempDir, 'missing.json'))).toEqual([]);
    expect(readRefactorOutputFile(invalidPath)).toEqual([]);
  });
});

describe('output-parser: enhancement proposals', () => {
  let tempDir: string;
  const baseProposal: EnhancementProposal = {
    type: 'improvement',
    title: 'Add progress indicator for long-running analysis operations',
    description:
      'The repository analysis process can take several minutes for large codebases. Adding a progress indicator would improve user experience by providing feedback during the analysis.',
    rationale:
      'Users currently have no visibility into analysis progress, leading to uncertainty about whether the process is working correctly.',
    implementation_hints: [
      'Use ora library for spinner implementation',
      'Add progress callbacks to analyzer methods',
      'Display file count and percentage completion',
    ],
    expected_impact: 'medium',
    effort_estimate: 'small',
    related_files: ['src/core/repository-analyzer.ts', 'src/commands/auto-issue.ts'],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhancement-parser-'));
  });

  afterEach(() => {
    loggerMock.debug.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses array format, code blocks, and embedded objects', () => {
    const arrayPath = path.join(tempDir, 'enhancement-array.json');
    const codeBlockPath = path.join(tempDir, 'enhancement-codeblock.md');
    const objectPath = path.join(tempDir, 'enhancement-object.md');

    fs.writeFileSync(arrayPath, JSON.stringify([baseProposal]));
    fs.writeFileSync(
      codeBlockPath,
      `Some text\n\`\`\`json\n${JSON.stringify([baseProposal])}\n\`\`\`\n`,
    );
    fs.writeFileSync(
      objectPath,
      `Intro text { "type": "improvement", "title": "${baseProposal.title}", "description": "${baseProposal.description}", "rationale": "${baseProposal.rationale}", "implementation_hints": ["hint"], "expected_impact": "medium", "effort_estimate": "small", "related_files": ["file.ts"] } end text`,
    );

    expect(readEnhancementOutputFile(arrayPath)).toHaveLength(1);
    expect(readEnhancementOutputFile(codeBlockPath)).toHaveLength(1);
    expect(readEnhancementOutputFile(objectPath)).toHaveLength(1);
  });

  it('returns empty array when file is missing or content is invalid', () => {
    const invalidPath = path.join(tempDir, 'invalid.md');
    fs.writeFileSync(invalidPath, 'plain text without JSON');

    expect(readEnhancementOutputFile(path.join(tempDir, 'missing.md'))).toEqual([]);
    expect(readEnhancementOutputFile(invalidPath)).toEqual([]);
  });

  it('extracts JSON segments and parses leniently', () => {
    const textWithArray = 'prefix [ {"a":1}, {"b":2} ] suffix';
    const textWithObject = 'prefix { "hello": "world", "nested": { "x": 1 } } suffix';

    expect(extractJsonSegment(textWithArray, '[', ']')).toBe('[ {"a":1}, {"b":2} ]');
    expect(extractJsonSegment(textWithObject, '{', '}')).toContain('"nested"');
    expect(extractJsonSegment('no json here', '{', '}')).toBeNull();

    expect(tryParseEnhancementJson(JSON.stringify(baseProposal))).toEqual([baseProposal]);
    expect(parseEnhancementProposals(textWithArray)).toHaveLength(2);
  });
});
