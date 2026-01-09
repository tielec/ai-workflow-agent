import { describe, it, expect } from '@jest/globals';
import { __testables } from '../../../src/commands/pr-comment/analyze.js';
import type { CommentMetadata, CommentResolutionMetadata } from '../../../src/types/pr-comment.js';

const { groupCommentsByThread, getAllThreadComments, formatThreadBlock } = __testables;

const buildComment = (override: Partial<CommentMetadata['comment']> = {}): CommentMetadata => ({
  comment: {
    id: 1,
    node_id: 'node-1',
    thread_id: 'thread-default',
    path: 'src/a.ts',
    line: 10,
    body: '本文',
    user: 'reviewer',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    diff_hunk: '@@ -1,1 +1,1 @@',
    ...override,
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

const buildMetadata = (comments: CommentMetadata[]): CommentResolutionMetadata =>
  ({
    comments: Object.fromEntries(comments.map((c) => [String(c.comment.id), c])),
  } as unknown as CommentResolutionMetadata);

describe('groupCommentsByThread', () => {
  // Given: thread_id付き/なしのコメントが混在する
  // When: groupCommentsByThreadでスレッド単位にまとめる
  // Then: スレッドIDまたはunknown-ID単位でグループ化される
  it('thread_idでコメントをグループ化する', () => {
    const threadA1 = buildComment({ id: 100, thread_id: 'thread-a' });
    const threadA2 = buildComment({ id: 101, thread_id: 'thread-a' });
    const threadB = buildComment({ id: 200, thread_id: 'thread-b' });

    const grouped = groupCommentsByThread([threadA1, threadA2, threadB]);

    expect(grouped.size).toBe(2);
    expect(grouped.get('thread-a')?.map((c) => c.comment.id)).toEqual([100, 101]);
    expect(grouped.get('thread-b')?.[0].comment.id).toBe(200);
  });

  it('thread_idがないコメントはunknown-{id}で扱う', () => {
    const unknownA = buildComment({ id: 300, thread_id: undefined });
    const unknownB = buildComment({ id: 301, thread_id: undefined });

    const grouped = groupCommentsByThread([unknownA, unknownB]);

    expect(grouped.size).toBe(2);
    expect(grouped.get('unknown-300')?.[0].comment.id).toBe(300);
    expect(grouped.get('unknown-301')?.[0].comment.id).toBe(301);
  });
});

describe('getAllThreadComments', () => {
  // Given: 同一スレッドのコメントが逆順に混在する
  // When: getAllThreadCommentsでスレッドコメントを取得する
  // Then: created_at昇順に整列した配列が返る
  it('スレッド内の全コメントを時系列順で返す', () => {
    const olderUser = buildComment({
      id: 10,
      thread_id: 'thread-sort',
      created_at: '2025-01-20T00:00:00Z',
      user: 'user-a',
    });
    const middleAi = {
      ...buildComment({
        id: 11,
        thread_id: 'thread-sort',
        created_at: '2025-01-20T00:05:00Z',
        user: 'ai-bot',
      }),
      reply_comment_id: 11,
    };
    const newerUser = buildComment({
      id: 12,
      thread_id: 'thread-sort',
      created_at: '2025-01-20T00:10:00Z',
      user: 'user-b',
    });

    const metadata = buildMetadata([newerUser, middleAi, olderUser]);
    const sorted = getAllThreadComments(metadata, 'thread-sort');

    expect(sorted.map((c) => c.comment.id)).toEqual([10, 11, 12]);
  });
});

describe('formatThreadBlock', () => {
  // Given: ユーザーとAI返信を含むスレッド
  // When: formatThreadBlockでMarkdownに整形する
  // Then: ラベル付けやファイル/行欠損の扱いを含めて期待フォーマットになる
  it('ユーザーコメントとAI返信のラベルを付けてフォーマットする', () => {
    const userComment = buildComment({
      id: 1,
      thread_id: 'thread-format',
      body: 'ユーザーコメント',
      path: '',
      line: null,
    });
    const aiReply: CommentMetadata = {
      ...buildComment({
        id: 2,
        thread_id: 'thread-format',
        body: 'AIの提案',
      }),
      reply_comment_id: 2,
    };

    const block = formatThreadBlock('thread-format', [userComment, aiReply], '/repo');

    expect(block).toContain('### Thread #thread-format');
    expect(block).toContain('Comment #1 [User Comment]');
    expect(block).toContain('Comment #2 [AI Reply]');
    expect(block).toContain('File: N/A');
    expect(block).toContain('Line: N/A');
  });

  it('コメントが空でもスレッドヘッダーを返す', () => {
    const block = formatThreadBlock('empty-thread', [], '/repo');

    expect(block.trim()).toBe('### Thread #empty-thread');
  });
});
