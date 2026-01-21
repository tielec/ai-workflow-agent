import { describe, it, expect } from '@jest/globals';
import { buildFallbackPlan } from '../../../../src/commands/pr-comment/analyze/markdown-builder.js';
import type { CommentMetadata } from '../../../../src/types/pr-comment.js';

const buildComment = (id: number): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    thread_id: 'thread-1',
    path: 'src/file.ts',
    line: id,
    body: `body-${id}`,
    user: 'reviewer',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    diff_hunk: '@@',
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

describe('buildFallbackPlan', () => {
  it('フォールバックプランをコメント数分生成する (TC-UNIT-MB-006)', () => {
    const comments = [buildComment(1), buildComment(2)];

    const plan = buildFallbackPlan(123, comments);

    expect(plan.pr_number).toBe(123);
    expect(plan.analyzer_agent).toBe('fallback');
    expect(plan.comments).toHaveLength(2);
    expect(plan.comments.every((c) => c.type === 'discussion')).toBe(true);
    expect(plan.comments.every((c) => c.confidence === 'low')).toBe(true);
  });
});
