import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  formatCommentBlock,
  formatThreadBlockWithFiles,
} from '../../../../src/commands/pr-comment/analyze/comment-formatter.js';
import type { CommentMetadata } from '../../../../src/types/pr-comment.js';

const buildComment = (id: number, overrides: Partial<CommentMetadata['comment']> = {}): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    thread_id: 'thread-x',
    path: overrides.path ?? 'sample.txt',
    line: overrides.line ?? null,
    body: overrides.body ?? `body-${id}`,
    user: overrides.user ?? 'user',
    created_at: overrides.created_at ?? '2025-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
    diff_hunk: overrides.diff_hunk ?? '@@',
    ...overrides,
  },
  status: 'pending',
  started_at: null,
  completed_at: null,
  retry_count: 0,
  resolution: null,
  reply_comment_id: null,
  resolved_at: null,
  error: null,
});

describe('formatCommentBlock / formatThreadBlockWithFiles', () => {
  it('存在するファイルの内容を含めて整形する (TC-UNIT-CF-009)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'formatter-'));
    const filePath = path.join(dir, 'sample.txt');
    writeFileSync(filePath, 'file-content');

    const meta = buildComment(1, { path: 'sample.txt' });
    const block = await formatCommentBlock(meta, dir);

    expect(block).toContain('file-content');
    expect(block).toContain('Line: N/A');
  });

  it('ファイル不存在時はフォールバック文言を出力する (TC-UNIT-CF-010)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'formatter-'));
    const meta = buildComment(2, { path: 'missing.txt' });

    const block = await formatCommentBlock(meta, dir);

    expect(block).toContain('(File not found)');
  });

  it('AI返信とユーザーコメントのラベルを付与する (TC-UNIT-CF-011)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'formatter-'));
    const userComment = buildComment(1);
    const aiReply: CommentMetadata = { ...buildComment(2), reply_comment_id: 2 };

    const block = await formatThreadBlockWithFiles('thread-x', [userComment, aiReply], dir);

    expect(block).toContain('Comment #1 [User Comment]');
    expect(block).toContain('Comment #2 [AI Reply]');
  });
});
