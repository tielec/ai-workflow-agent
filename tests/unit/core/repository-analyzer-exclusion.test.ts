import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';

const loggerMock = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('../../../src/utils/logger.js', () => ({ __esModule: true, logger: loggerMock }));

describe('RepositoryAnalyzer - collectRepositoryCode integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-collect-'));
    loggerMock.debug.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it(
    'skips excluded directories and file patterns when collecting repository code (TC-RA-010 wiring)',
    async () => {
      const analyzer = new RepositoryAnalyzer(null, null);

    const includedTs = path.join(tempDir, 'src/index.ts');
    fs.mkdirSync(path.dirname(includedTs), { recursive: true });
    fs.writeFileSync(includedTs, 'console.log("keep me");', 'utf-8');

    const includedGo = path.join(tempDir, 'pkg/service/user.go');
    fs.mkdirSync(path.dirname(includedGo), { recursive: true });
    fs.writeFileSync(includedGo, 'package service\nfunc main() {}', 'utf-8');

    const excludedDirFile = path.join(tempDir, 'node_modules/lodash/index.js');
    fs.mkdirSync(path.dirname(excludedDirFile), { recursive: true });
    fs.writeFileSync(excludedDirFile, 'should be ignored', 'utf-8');

    const excludedByPattern = path.join(tempDir, 'assets/logo.png');
    fs.mkdirSync(path.dirname(excludedByPattern), { recursive: true });
    fs.writeFileSync(excludedByPattern, 'png-bytes', 'utf-8');

    const collected = await (analyzer as unknown as {
      collectRepositoryCode: (repoPath: string) => Promise<string>;
    }).collectRepositoryCode(tempDir);

    expect(collected).toMatch(/\/\/ File: src[/\\]index\.ts/);
    expect(collected).toContain('console.log("keep me");');
    expect(collected).toMatch(/\/\/ File: pkg[/\\]service[/\\]user\.go/);
    expect(collected).not.toContain('node_modules');
    expect(collected).not.toContain('logo.png');
    },
    20000
  );
});
