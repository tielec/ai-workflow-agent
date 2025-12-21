import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import { ReviewCommentAnalyzer } from '../../../src/core/pr-comment/comment-analyzer.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';

describe('ReviewCommentAnalyzer', () => {
  const promptsDir = '/repo/src/prompts';
  const outputDir = '/repo/.ai-workflow/pr-1/analysis';
  const commentMeta: CommentMetadata = {
    comment: {
      id: 100,
      node_id: 'N100',
      path: 'src/core/config.ts',
      line: 10,
      body: 'Please fix this typo',
      user: 'alice',
      created_at: '2025-01-20T00:00:00Z',
      updated_at: '2025-01-20T00:00:00Z',
      diff_hunk: '@@ -1,1 +1,1 @@',
    },
    status: 'pending',
    started_at: null,
    completed_at: null,
    retry_count: 0,
    resolution: null,
    reply_comment_id: null,
    resolved_at: null,
    error: null,
  };

  let analyzer: ReviewCommentAnalyzer;
  let readFileSpy: jest.SpiedFunction<typeof fs.readFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'));

    jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    readFileSpy = jest.spyOn(fs, 'readFile');

    analyzer = new ReviewCommentAnalyzer(promptsDir, outputDir);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('classifies comments by keyword patterns', () => {
    expect(analyzer.classifyComment('Fix this bug')).toBe('code_change');
    expect(analyzer.classifyComment('WHY is this needed?')).toBe('question');
    expect(analyzer.classifyComment('Looks good for future refactor')).toBe('discussion');
  });

  it('builds prompt by replacing placeholders and embedding provided content', async () => {
    const template = [
      'ID:{comment_id}',
      'BODY:{comment_body}',
      'FILE:{file_content}',
      'DESC:{pr_description}',
      'OUTPUT:{output_file_path}',
    ].join('\n');
    readFileSpy.mockResolvedValueOnce(template);

    const prompt = await (analyzer as any).buildPrompt(
      commentMeta,
      { repoPath: '/repo', fileContent: '// test content', prDescription: 'PR body' },
      '/tmp/out.json',
    );

    expect(readFileSpy).toHaveBeenCalledWith(
      path.join(promptsDir, 'pr-comment', 'analyze.txt'),
      'utf-8',
    );
    expect(prompt).toContain('ID:100');
    expect(prompt).toContain('BODY:Please fix this typo');
    expect(prompt).toContain('FILE:// test content');
    expect(prompt).toContain('DESC:PR body');
    expect(prompt).toContain('OUTPUT:/tmp/out.json');
  });

  it('falls back to placeholder text when target file is missing', async () => {
    const template = '{file_content}';
    readFileSpy.mockImplementation(async (target: unknown) =>
      String(target).endsWith('analyze.txt') ? template : Promise.reject(new Error('ENOENT')),
    );

    const prompt = await (analyzer as any).buildPrompt(
      { ...commentMeta, comment: { ...commentMeta.comment, path: 'missing.ts' } },
      { repoPath: '/repo' },
      '/tmp/out.json',
    );

    expect(prompt).toContain('(File not found)');
  });

  it('parses code-block JSON and converts low confidence code_change to discussion', async () => {
    const agentOutput = [
      '```json',
      JSON.stringify({
        type: 'code_change',
        confidence: 'low',
        changes: [{ path: 'src/a.ts', change_type: 'modify', content: 'test' }],
        reply: 'Handled.',
      }),
      '```',
    ].join('\n');
    readFileSpy.mockResolvedValue(agentOutput);

    const result = await (analyzer as any).parseResult('/tmp/out.json');

    expect(result.type).toBe('discussion');
    expect(result.changes).toBeUndefined();
    expect(result.reply).toBe('Handled.');
  });

  it('throws when resolution type is invalid', async () => {
    readFileSpy.mockResolvedValue('{ "type": "unknown", "confidence": "high", "reply": "ok" }');

    await expect((analyzer as any).parseResult('/tmp/out.json')).rejects.toThrow(
      'Invalid resolution type',
    );
  });
});
