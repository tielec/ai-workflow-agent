import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const logMock = jest.fn();
const simpleGitMock = jest.fn(() => ({
  log: logMock,
}));

let MergeContextCollector: typeof import('../../../../src/core/git/merge-context-collector.js').MergeContextCollector;

beforeAll(async () => {
  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: simpleGitMock,
  }));

  ({ MergeContextCollector } = await import('../../../../src/core/git/merge-context-collector.js'));
});

describe('MergeContextCollector', () => {
  let repoRoot: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'merge-context-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('正常系_全文脈情報が正しく収集される', async () => {
    // Given: PR本文とログが取得できる
    const githubClient = {
      getPullRequestBody: jest
        .fn()
        .mockResolvedValue('Fixes #42\nrelated to #100 and closes #200'),
    };

    logMock
      .mockResolvedValueOnce({ all: [
        { hash: 'abc123', message: 'fix: update config', date: '2024-01-01' },
      ] })
      .mockResolvedValueOnce({ all: [
        { hash: 'def456', message: 'feat: add validation', date: '2024-01-02' },
      ] });

    const filePath = path.join(repoRoot, 'src/example.ts');
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(
      filePath,
      ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'].join('\n'),
      'utf-8',
    );

    const conflictFiles = [
      { filePath: 'src/example.ts', startLine: 3, endLine: 4, oursContent: 'A', theirsContent: 'B' },
    ];

    const collector = new MergeContextCollector(repoRoot, githubClient as any);

    // When: collect 実行
    const context = await collector.collect('main', 'feature/add-login', 42, conflictFiles);

    // Then: ログ/PR/スニペットが収集される
    expect(context.conflictFiles).toEqual(conflictFiles);
    expect(context.oursLog).toHaveLength(1);
    expect(context.theirsLog).toHaveLength(1);
    expect(context.prDescription).toContain('Fixes #42');
    expect(context.relatedIssues).toEqual(['#42', '#100', '#200']);
    expect(context.contextSnippets).toHaveLength(1);
    expect(context.contextSnippets[0].filePath).toBe('src/example.ts');
  });

  it('PR本文取得失敗_空文字が設定される', async () => {
    // Given: PR本文の取得が失敗
    const githubClient = {
      getPullRequestBody: jest.fn().mockRejectedValue(new Error('API error')),
    };

    logMock.mockResolvedValue({ all: [] });

    const collector = new MergeContextCollector(repoRoot, githubClient as any);

    // When: collect 実行
    const context = await collector.collect('main', 'feature', 1, []);

    // Then: PR本文は空、関連Issueも空
    expect(context.prDescription).toBe('');
    expect(context.relatedIssues).toEqual([]);
  });

  it('ログ取得件数_上限が設定される', async () => {
    // Given: logLimit を指定
    const githubClient = {
      getPullRequestBody: jest.fn().mockResolvedValue(''),
    };

    logMock.mockResolvedValue({ all: [] });

    const collector = new MergeContextCollector(repoRoot, githubClient as any, 5);

    // When: collect 実行
    await collector.collect('main', 'feature', 10, []);

    // Then: -n が指定される
    expect(logMock).toHaveBeenCalledWith(['main', '-n', '5']);
    expect(logMock).toHaveBeenCalledWith(['feature', '-n', '5']);
  });
});
