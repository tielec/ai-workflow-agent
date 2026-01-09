import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { PRCommentMetadataManager } from '../../../src/core/pr-comment/metadata-manager.js';
import type { CommentResolution, CommentResolutionMetadata } from '../../../src/types/pr-comment.js';
import { logger } from '../../../src/utils/logger.js';

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
  let mkdirSpy: jest.SpiedFunction<typeof fsp.mkdir>;
  let writeFileSpy: jest.SpiedFunction<typeof fsp.writeFile>;
  let accessSpy: jest.SpiedFunction<typeof fsp.access>;
  let removeSpy: jest.SpiedFunction<typeof fsp.rm>;
  let readFileSpy: jest.SpiedFunction<typeof fsp.readFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'));

    mkdirSpy = jest.spyOn(fsp, 'mkdir').mockResolvedValue(undefined as any);
    writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);
    accessSpy = jest.spyOn(fsp, 'access').mockResolvedValue(undefined as any);
    removeSpy = jest.spyOn(fsp, 'rm').mockResolvedValue(undefined as any);
    readFileSpy = jest.spyOn(fsp, 'readFile');

    manager = new PRCommentMetadataManager(repoPath, prNumber);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes metadata with pending comments and summary', async () => {
    await manager.initialize(prInfo, repoInfo, comments, 456);

    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(metadataPath), { recursive: true });
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

  describe('getPendingComments with reply_comment_id', () => {
    it('excludes comments with reply_comment_id from pending list', async () => {
      const metadata = buildBaseMetadata();
      metadata.comments['100'].status = 'pending';
      metadata.comments['100'].reply_comment_id = 200;
      metadata.comments['101'].status = 'pending';
      metadata.comments['101'].reply_comment_id = null;
      (manager as any).metadata = metadata;

      const pending = await manager.getPendingComments();

      expect(pending.map((c) => c.comment.id)).toEqual([101]);
    });

    it('returns empty array when all pending comments have replies', async () => {
      const metadata = buildBaseMetadata();
      metadata.comments['100'].status = 'pending';
      metadata.comments['100'].reply_comment_id = 200;
      metadata.comments['101'].status = 'pending';
      metadata.comments['101'].reply_comment_id = 201;
      (manager as any).metadata = metadata;

      const pending = await manager.getPendingComments();

      expect(pending).toEqual([]);
    });

    it('correctly filters mixed status and reply_comment_id combinations', async () => {
      const metadata = buildBaseMetadata();

      metadata.comments['100'].status = 'pending';
      metadata.comments['100'].reply_comment_id = 200;

      metadata.comments['101'].status = 'pending';
      metadata.comments['101'].reply_comment_id = null;

      metadata.comments['102'] = {
        ...metadata.comments['100'],
        comment: { ...metadata.comments['100'].comment, id: 102 },
        status: 'in_progress',
        reply_comment_id: null,
      };

      metadata.comments['103'] = {
        ...metadata.comments['100'],
        comment: { ...metadata.comments['100'].comment, id: 103 },
        status: 'completed',
        reply_comment_id: null,
      };

      metadata.comments['104'] = {
        ...metadata.comments['100'],
        comment: { ...metadata.comments['100'].comment, id: 104 },
        status: 'in_progress',
        reply_comment_id: 300,
      };

      (manager as any).metadata = metadata;

      const pending = await manager.getPendingComments();

      expect(pending.map((c) => c.comment.id).sort()).toEqual([101, 102]);
    });

    it('treats legacy metadata without reply_comment_id as unreplied', async () => {
      const metadata = buildBaseMetadata();
      metadata.comments['100'].status = 'pending';
      delete (metadata.comments['100'] as any).reply_comment_id;
      (manager as any).metadata = metadata;

      const pending = await manager.getPendingComments();

      expect(pending.map((c) => c.comment.id)).toContain(100);
    });
  });

  describe('addComments', () => {
    it('adds new comments with pending status and recalculates summary', async () => {
      const metadata = buildBaseMetadata();
      (manager as any).metadata = metadata;
      const saveSpy = jest.spyOn(manager as any, 'save');
      const newComment = {
        id: 200,
        node_id: 'N200',
        path: 'src/new.ts',
        line: 5,
        body: 'New feedback',
        user: 'carol',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T00:00:00Z',
        diff_hunk: '',
      };

      const added = await manager.addComments([newComment as any]);

      const stored = (manager as any).metadata as CommentResolutionMetadata;
      expect(added).toBe(1);
      expect(saveSpy).toHaveBeenCalled();
      expect(stored.comments['200'].status).toBe('pending');
      expect(stored.comments['200'].comment.pr_number).toBe(prNumber);
      expect(stored.summary.total).toBe(3);
      expect(stored.summary.by_status.pending).toBe(3);
    });

    it('skips duplicates by ID and only saves when new entries exist', async () => {
      const metadata = buildBaseMetadata();
      (manager as any).metadata = metadata;
      const saveSpy = jest.spyOn(manager as any, 'save');
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
      const duplicate = { ...comments[0] };
      const fresh = { ...comments[0], id: 300, node_id: 'N300', body: 'Another' };

      const added = await manager.addComments([duplicate as any, fresh as any]);

      const stored = (manager as any).metadata as CommentResolutionMetadata;
      expect(added).toBe(1);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledWith('Comment 100 already exists, skipping.');
      expect(stored.comments['300'].status).toBe('pending');
      expect(stored.summary.total).toBe(3);
    });

    it('does not call save when all comments are duplicates or input is empty', async () => {
      const metadata = buildBaseMetadata();
      (manager as any).metadata = metadata;
      const saveSpy = jest.spyOn(manager as any, 'save');

      const duplicateCount = await manager.addComments([comments[0] as any, comments[1] as any]);
      const emptyCount = await manager.addComments([]);

      expect(duplicateCount).toBe(0);
      expect(emptyCount).toBe(0);
      expect(saveSpy).not.toHaveBeenCalled();
      expect((manager as any).metadata.summary.total).toBe(2);
    });

    it('ensures metadata is loaded before processing', async () => {
      const base = buildBaseMetadata();
      jest.spyOn(manager as any, 'load').mockImplementation(async () => {
        (manager as any).metadata = base;
        return base;
      });
      (manager as any).metadata = null;

      await manager.addComments([{ ...comments[0], id: 400 } as any]);

      expect((manager as any).metadata?.comments['400']).toBeDefined();
    });
  });

  it('checks existence of metadata file', async () => {
    accessSpy.mockResolvedValueOnce(undefined as any);

    const exists = await manager.exists();

    expect(accessSpy).toHaveBeenCalledWith(metadataPath);
    expect(exists).toBe(true);
  });

  it('returns false when metadata file does not exist', async () => {
    accessSpy.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const exists = await manager.exists();

    expect(accessSpy).toHaveBeenCalledWith(metadataPath);
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

    expect(removeSpy).toHaveBeenCalledWith(path.dirname(metadataPath), { recursive: true, force: true });
  });

  it('records analyzer error details and sets fallback agent when none is set', async () => {
    // Given metadata without analyzer agent, when error is recorded, then error fields and fallback agent are saved
    (manager as any).metadata = buildBaseMetadata();

    await manager.setAnalyzerError('API timeout after 60s', 'agent_execution_error');

    const metadata = (manager as any).metadata as CommentResolutionMetadata;
    expect(metadata.analyzer_error).toBe('API timeout after 60s');
    expect(metadata.analyzer_error_type).toBe('agent_execution_error');
    expect(metadata.analyzer_agent).toBe('fallback');
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('returns stored analyzer error info via getAnalyzerError', async () => {
    // Given analyzer error data is stored, when retrieved, then the same values are returned
    const metadata = buildBaseMetadata();
    metadata.analyzer_error = 'JSON parsing failed';
    metadata.analyzer_error_type = 'json_parse_error';
    (manager as any).metadata = metadata;

    const result = await manager.getAnalyzerError();

    expect(result).toEqual({
      error: 'JSON parsing failed',
      errorType: 'json_parse_error',
    });
  });

  it('returns undefined analyzer error info for legacy metadata without fields', async () => {
    // Given legacy metadata lacking analyzer fields, when retrieving error, then undefined values are returned
    (manager as any).metadata = buildBaseMetadata();
    delete (manager as any).metadata.analyzer_error;
    delete (manager as any).metadata.analyzer_error_type;

    const result = await manager.getAnalyzerError();

    expect(result).toEqual({ error: undefined, errorType: undefined });
  });

  it('clears analyzer error fields', async () => {
    // Given analyzer error data exists, when cleared, then fields become null and are persisted
    const metadata = buildBaseMetadata();
    metadata.analyzer_error = 'Agent returned empty output';
    metadata.analyzer_error_type = 'agent_empty_output';
    (manager as any).metadata = metadata;

    await manager.clearAnalyzerError();

    const updated = (manager as any).metadata as CommentResolutionMetadata;
    expect(updated.analyzer_error).toBeNull();
    expect(updated.analyzer_error_type).toBeNull();
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('records base_commit when metadata is initialized', async () => {
    await manager.initialize(prInfo, repoInfo, comments, 456);
    const baseCommit = 'abc123def456789012345678901234567890abcd';

    await manager.setBaseCommit(baseCommit);

    const saved = JSON.parse(writeFileSpy.mock.calls[1][1] as string);
    expect(saved.base_commit).toBe(baseCommit);
    expect((manager as any).metadata.base_commit).toBe(baseCommit);
  });

  it('throws when setBaseCommit is called before initialization', async () => {
    const freshManager = new PRCommentMetadataManager(repoPath, prNumber);

    await expect(freshManager.setBaseCommit('abc123def456789012345678901234567890abcd')).rejects.toThrow(
      'Metadata not initialized. Call initialize() first.',
    );
  });

  it('returns base_commit when present and undefined when missing', async () => {
    await manager.initialize(prInfo, repoInfo, comments, 456);
    expect(manager.getBaseCommit()).toBeUndefined();

    const baseCommit = 'abc123def456789012345678901234567890abcd';
    await manager.setBaseCommit(baseCommit);

    expect(manager.getBaseCommit()).toBe(baseCommit);
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
    };
  }
});
