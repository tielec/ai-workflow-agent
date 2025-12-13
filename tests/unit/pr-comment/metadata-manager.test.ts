import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { PRCommentMetadataManager } from '../../../src/core/pr-comment/metadata-manager.js';
import type { CommentResolution, CommentResolutionMetadata } from '../../../src/types/pr-comment.js';

describe('PRCommentMetadataManager', () => {
  const repoPath = '/repo';
  const prNumber = 123;
  const metadataPath = path.join(
    repoPath,
    '.ai-workflow',
    `pr-${prNumber}`,
    'comment-resolution-metadata.json',
  );

  const prInfo = {
    number: prNumber,
    url: 'https://github.com/owner/repo/pull/123',
    title: 'Add PR comment handler',
    branch: 'feature/pr-comment',
    base_branch: 'main',
    state: 'open' as const,
  };

  const repoInfo = {
    owner: 'owner',
    repo: 'repo',
    path: repoPath,
    remote_url: 'https://github.com/owner/repo.git',
  };

  const comments = [
    {
      id: 100,
      node_id: 'N100',
      path: 'src/core/config.ts',
      line: 10,
      body: 'Fix typo',
      user: 'alice',
      created_at: '2025-01-20T00:00:00Z',
      updated_at: '2025-01-20T00:00:00Z',
      diff_hunk: '@@ -1,1 +1,1 @@',
    },
    {
      id: 101,
      node_id: 'N101',
      path: 'src/core/git.ts',
      line: 20,
      body: 'Why this approach?',
      user: 'bob',
      created_at: '2025-01-20T00:01:00Z',
      updated_at: '2025-01-20T00:01:00Z',
      diff_hunk: '@@ -2,1 +2,1 @@',
    },
  ];

  let manager: PRCommentMetadataManager;
  let ensureDirSpy: jest.SpiedFunction<typeof fs.ensureDir>;
  let writeFileSpy: jest.SpiedFunction<typeof fs.writeFile>;
  let pathExistsSpy: jest.SpiedFunction<typeof fs.pathExists>;
  let removeSpy: jest.SpiedFunction<typeof fs.remove>;
  let readFileSpy: jest.SpiedFunction<typeof fs.readFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'));

    ensureDirSpy = jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    pathExistsSpy = jest.spyOn(fs, 'pathExists').mockResolvedValue(true as any);
    removeSpy = jest.spyOn(fs, 'remove').mockResolvedValue(undefined);
    readFileSpy = jest.spyOn(fs, 'readFile');

    manager = new PRCommentMetadataManager(repoPath, prNumber);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes metadata with pending comments and summary', async () => {
    await manager.initialize(prInfo, repoInfo, comments, 456);

    expect(ensureDirSpy).toHaveBeenCalledWith(path.dirname(metadataPath));
    const saved = JSON.parse(writeFileSpy.mock.calls[0][1] as string);
    expect(saved.pr.number).toBe(prNumber);
    expect(saved.issue_number).toBe(456);
    expect(Object.keys(saved.comments)).toHaveLength(2);
    expect(saved.comments['100'].status).toBe('pending');
    expect(saved.summary.total).toBe(2);
    expect(saved.summary.by_status.pending).toBe(2);
  });

  it('loads existing metadata from disk', async () => {
    const persisted: CommentResolutionMetadata = buildBaseMetadata();
    readFileSpy.mockResolvedValue(JSON.stringify(persisted));

    const loaded = await manager.load();

    expect(readFileSpy).toHaveBeenCalledWith(metadataPath, 'utf-8');
    expect(loaded.pr.title).toBe('Add PR comment handler');
    expect(loaded.comments['100'].status).toBe('pending');
  });

  it('updates status and resolution while recalculating summary', async () => {
    (manager as any).metadata = buildBaseMetadata();
    const resolution: CommentResolution = {
      type: 'reply',
      confidence: 'high',
      reply: 'Thanks, fixed.',
    };

    await manager.updateCommentStatus('100', 'completed', resolution);

    const metadata = (manager as any).metadata as CommentResolutionMetadata;
    expect(metadata.comments['100'].status).toBe('completed');
    expect(metadata.comments['100'].completed_at).toBe('2025-01-20T12:00:00.000Z');
    expect(metadata.comments['100'].resolution).toEqual(resolution);
    expect(metadata.summary.by_status.completed).toBe(1);
    expect(metadata.summary.by_type.reply).toBe(1);
  });

  it('increments retry count and returns updated value', async () => {
    const metadata = buildBaseMetadata();
    metadata.comments['100'].retry_count = 1;
    (manager as any).metadata = metadata;

    const count = await manager.incrementRetryCount('100');

    expect(count).toBe(2);
    expect((manager as any).metadata.comments['100'].retry_count).toBe(2);
  });

  it('returns pending and in-progress comments together', async () => {
    const metadata = buildBaseMetadata();
    metadata.comments['100'].status = 'pending';
    metadata.comments['101'].status = 'in_progress';
    (manager as any).metadata = metadata;

    const pending = await manager.getPendingComments();

    expect(pending.map((c) => c.comment.id)).toEqual([100, 101]);
  });

  it('checks existence of metadata file', async () => {
    pathExistsSpy.mockResolvedValueOnce(true as any);

    const exists = await manager.exists();

    expect(pathExistsSpy).toHaveBeenCalledWith(metadataPath);
    expect(exists).toBe(true);
  });

  it('returns false when metadata file does not exist', async () => {
    pathExistsSpy.mockResolvedValueOnce(false as any);

    const exists = await manager.exists();

    expect(pathExistsSpy).toHaveBeenCalledWith(metadataPath);
    expect(exists).toBe(false);
  });

  it('accumulates cost tracking across multiple updates', async () => {
    (manager as any).metadata = buildBaseMetadata();

    await manager.updateCostTracking(1000, 500, 0.05);
    await manager.updateCostTracking(200, 100, 0.01);

    const metadata = (manager as any).metadata as CommentResolutionMetadata;
    expect(metadata.cost_tracking.total_input_tokens).toBe(1200);
    expect(metadata.cost_tracking.total_output_tokens).toBe(600);
    expect(metadata.cost_tracking.total_cost_usd).toBeCloseTo(0.06);
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('sets resolved_at timestamp when marking as resolved', async () => {
    (manager as any).metadata = buildBaseMetadata();

    await manager.setResolved('100');

    const metadata = (manager as any).metadata as CommentResolutionMetadata;
    expect(metadata.comments['100'].resolved_at).toBe('2025-01-20T12:00:00.000Z');
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('removes metadata directory during cleanup', async () => {
    await manager.cleanup();

    expect(removeSpy).toHaveBeenCalledWith(path.dirname(metadataPath));
  });

  it('records analyze errors and clears them when requested', async () => {
    (manager as any).metadata = buildBaseMetadata();

    await manager.setAnalyzeError('Fallback plan used due to parsing failure');

    expect((manager as any).metadata.analyze_error).toBe('Fallback plan used due to parsing failure');
    expect(writeFileSpy).toHaveBeenCalled();

    await manager.clearAnalyzeError();

    expect((manager as any).metadata.analyze_error).toBeNull();
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
  });

  function buildBaseMetadata(): CommentResolutionMetadata {
    return {
      version: '1.0.0',
      pr: prInfo,
      repository: repoInfo,
      comments: {
        '100': {
          comment: comments[0],
          status: 'pending',
          started_at: null,
          completed_at: null,
          retry_count: 0,
          resolution: null,
          reply_comment_id: null,
          resolved_at: null,
          error: null,
        },
        '101': {
          comment: comments[1],
          status: 'pending',
          started_at: null,
          completed_at: null,
          retry_count: 0,
          resolution: null,
          reply_comment_id: null,
          resolved_at: null,
          error: null,
        },
      },
      summary: {
        total: 2,
        by_status: {
          pending: 2,
          in_progress: 0,
          completed: 0,
          skipped: 0,
          failed: 0,
        },
        by_type: {
          code_change: 0,
          reply: 0,
          discussion: 0,
          skip: 0,
        },
      },
      cost_tracking: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
      created_at: '2025-01-20T12:00:00.000Z',
      updated_at: '2025-01-20T12:00:00.000Z',
      analyze_completed_at: null,
      analyze_error: null,
      execute_completed_at: null,
      response_plan_path: null,
      execution_result_path: null,
    };
  }
});
