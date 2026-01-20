import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { CommentMetadata } from '../../../../src/types/pr-comment.js';
import type { PRCommentMetadataManager } from '../../../../src/core/pr-comment/metadata-manager.js';

const loadPromptMock = jest.fn();
const groupCommentsByThread = jest.fn();
const getAllThreadComments = jest.fn();
const formatThreadBlockWithFiles = jest.fn();
const formatCommentBlock = jest.fn();

const metadataManager = {
  getMetadata: jest.fn(),
} as unknown as jest.Mocked<PRCommentMetadataManager>;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('buildAnalyzePrompt', () => {
  async function importModule() {
    await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
      PromptLoader: { loadPrompt: loadPromptMock },
    }));
    await jest.unstable_mockModule('../../../../src/commands/pr-comment/analyze/comment-formatter.js', () => ({
      groupCommentsByThread,
      getAllThreadComments,
      formatThreadBlockWithFiles,
      formatCommentBlock,
    }));

    const module = await import('../../../../src/commands/pr-comment/analyze/prompt-builder.js');
    return module;
  }

  const comment: CommentMetadata = {
    comment: {
      id: 1,
      node_id: 'node-1',
      thread_id: 'thread-1',
      path: 'src/a.ts',
      line: 10,
      body: 'レビューお願いします',
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
  };

  it('テンプレート変数とコメントブロックを埋め込む (TC-UNIT-PB-001/002/003)', async () => {
    loadPromptMock.mockReturnValue('Prompt {pr_number} {pr_title} {repo_path} {all_comments} {output_file_path}');
    groupCommentsByThread.mockReturnValue(new Map([[comment.comment.thread_id!, [comment]]]));
    getAllThreadComments.mockReturnValue([]);
    formatThreadBlockWithFiles.mockResolvedValue('THREAD_BLOCK');
    metadataManager.getMetadata = jest.fn().mockResolvedValue({ pr: { title: 'Test PR' }, comments: {} } as any);

    const { buildAnalyzePrompt } = await importModule();

    const prompt = await buildAnalyzePrompt(123, '/repo', metadataManager, [comment], '/out/response-plan.json');

    expect(loadPromptMock).toHaveBeenCalled();
    expect(prompt).toContain('PR 123: Test PR');
    expect(prompt).toContain('Repo: /repo');
    expect(prompt).toContain('/out/response-plan.json');
    expect(prompt).toContain('THREAD_BLOCK');
  });

  it('スレッドがない場合はコメント単位で整形する (TC-UNIT-PB-004)', async () => {
    loadPromptMock.mockReturnValue('Prompt {all_comments}');
    groupCommentsByThread.mockReturnValue(new Map());
    formatCommentBlock.mockResolvedValue('COMMENT_BLOCK');
    metadataManager.getMetadata = jest.fn().mockResolvedValue({ pr: { title: 'Empty PR' }, comments: {} } as any);

    const { buildAnalyzePrompt } = await importModule();

    const prompt = await buildAnalyzePrompt(5, '/repo', metadataManager, [comment], '/tmp/out.json');

    expect(prompt).toContain('COMMENT_BLOCK');
    expect(formatThreadBlockWithFiles).not.toHaveBeenCalled();
  });
});
