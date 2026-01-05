import { jest } from '@jest/globals';

// Mock logger dependency (module path used inside analyzer modules is resolved virtually)
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

import {
  EXCLUDED_DIRECTORIES,
  EXCLUDED_FILE_PATTERNS,
  isExcludedDirectory,
  isExcludedFile,
  matchesWildcard,
} from '../../../../src/core/analyzer/path-exclusion.js';

beforeAll(() => {
  (globalThis as any).__ai_workflow_logger_override = loggerMock;
});

describe('path-exclusion: matchesWildcard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches exact names and simple wildcards', () => {
    expect(matchesWildcard('test.ts', 'test.ts')).toBe(true);
    expect(matchesWildcard('app.min.js', '*.min.js')).toBe(true);
    expect(matchesWildcard('api.generated.ts', '*.generated.*')).toBe(true);
    expect(matchesWildcard('user.pb.go', '*.pb.go')).toBe(true);
  });

  it('returns false when pattern does not match', () => {
    expect(matchesWildcard('test.ts', '*.min.js')).toBe(false);
    expect(matchesWildcard('notes.md', '*.ts')).toBe(false);
  });
});

describe('path-exclusion: isExcludedDirectory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('flags well-known excluded directories', () => {
    const excludedSamples = [
      'node_modules/lodash/index.js',
      'packages/foo/node_modules/bar/index.js',
      'dist/bundle.js',
      '.git/objects/ab/cdef',
      'vendor/github.com/lib/main.go',
      'src/__pycache__/module.pyc',
      'build/output.js',
      'coverage/lcov-report/index.html',
      '.next/static/chunks/main.js',
      '.nuxt/server/index.mjs',
    ];

    excludedSamples.forEach((sample) => {
      expect(isExcludedDirectory(sample)).toBe(true);
    });
  });

  it('ignores normal source paths', () => {
    expect(isExcludedDirectory('src/core/service.ts')).toBe(false);
    expect(isExcludedDirectory('lib/utils/file.ts')).toBe(false);
  });

  it('treats path traversal attempts as excluded and warns', () => {
    const malicious = '../../etc/passwd';
    expect(isExcludedDirectory(malicious)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('Potentially malicious path'),
    );
  });

  it('handles leading "./" without missing exclusions', () => {
    expect(isExcludedDirectory('./node_modules/lib/index.js')).toBe(true);
  });

  it('keeps exclusion constants intact', () => {
    expect(EXCLUDED_DIRECTORIES).toEqual(
      expect.arrayContaining(['node_modules/', 'vendor/', '.git/']),
    );
  });
});

describe('path-exclusion: isExcludedFile', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('excludes generated and bundled artifacts', () => {
    expect(isExcludedFile('assets/jquery.min.js')).toBe(true);
    expect(isExcludedFile('dist/main.bundle.js')).toBe(true);
    expect(isExcludedFile('src/api.generated.ts')).toBe(true);
    expect(isExcludedFile('pkg/user.pb.go')).toBe(true);
  });

  it('excludes lock files', () => {
    expect(isExcludedFile('package-lock.json')).toBe(true);
    expect(isExcludedFile('go.sum')).toBe(true);
    expect(isExcludedFile('yarn.lock')).toBe(true);
  });

  it('excludes common binary assets', () => {
    expect(isExcludedFile('assets/logo.png')).toBe(true);
    expect(isExcludedFile('bin/app.exe')).toBe(true);
    expect(isExcludedFile('docs/manual.pdf')).toBe(true);
  });

  it('does not exclude regular source files', () => {
    expect(isExcludedFile('src/core/service.ts')).toBe(false);
    expect(isExcludedFile('pkg/service/user.go')).toBe(false);
  });

  it('keeps file pattern constants intact', () => {
    expect(EXCLUDED_FILE_PATTERNS.lockFiles).toEqual(
      expect.arrayContaining(['package-lock.json', 'yarn.lock']),
    );
  });
});

afterAll(() => {
  delete (globalThis as any).__ai_workflow_logger_override;
});
