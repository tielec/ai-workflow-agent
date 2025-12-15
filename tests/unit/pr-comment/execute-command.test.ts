import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../../src/utils/logger.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';
import type { PRCommentExecuteOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));
const resolveRepoPathFromPrUrlMock = jest.fn(() => '/repo');
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const simpleGitAddConfigMock = jest.fn();
const simpleGitPushMock = jest.fn();
const codeChangeApplyMock = jest.fn();
const githubReplyMock = jest.fn();

let handlePRCommentExecuteCommand: (options: PRCommentExecuteOptions) => Promise<void>;
let pendingComments: CommentMetadata[] = [];
let currentMetadataManager: any;
let processExitSpy: jest.SpyInstance;
let responsePlan: any;

const buildComment = (
  id: number,
  type: 'code_change' | 'reply' | 'discussion' | 'skip' = 'reply',
  body = 'Please address this',
): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    path: type === 'code_change' ? 'src/a.ts' : undefined,
    line: 10,
    body,
    user: 'reviewer',
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
});

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      currentMetadataManager = {
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue({ pr: { branch: 'feature/mock-branch' } }),
        getPendingComments: jest.fn(async () => pendingComments),
        getSummary: jest.fn().mockResolvedValue({
          by_status: { completed: 0, skipped: 0, failed: 0 },
        }),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        setReplyCommentId: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        incrementRetryCount: jest.fn().mockResolvedValue(0),
        updateCostTracking: jest.fn().mockResolvedValue(undefined),
      };
      return currentMetadataManager;
    }),
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: codeChangeApplyMock,
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
      getRepositoryInfo: () => ({ repositoryName: 'owner/repo' }),
    })),
  }));

  await jest.unstable_mockModule('../../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      getGitCommitUserName: jest.fn(() => 'Test User'),
      getGitCommitUserEmail: jest.fn(() => 'test@example.com'),
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
      addConfig: simpleGitAddConfigMock,
      push: simpleGitPushMock,
    })),
  }));

  const module = await import('../../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = module.handlePRCommentExecuteCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'code_change'), buildComment(101, 'reply')];
  currentMetadataManager = null;
  codeChangeApplyMock.mockReset();
  githubReplyMock.mockReset();
  githubReplyMock.mockResolvedValue({ id: 9999 });

  getRepoRootMock.mockResolvedValue('/repo');
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: 'src/a.ts' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  simpleGitAddConfigMock.mockResolvedValue(undefined);
  simpleGitPushMock.mockResolvedValue(undefined);
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit(1)');
  }) as any);

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

  jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fs, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.endsWith(path.join('output', 'response-plan.json'))) {
      return JSON.stringify(responsePlan ?? {});
    }
    return 'file content';
  });

  responsePlan = {
    pr_number: 123,
    comments: [],
  };
});

describe('handlePRCommentExecuteCommand - response plan flow', () => {
  it('applies response plan code changes and replies, updating metadata', async () => {
    // Given a valid response-plan.json with code_change and reply entries, execution should apply changes and reply
    responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'new code' }],
          reply_message: 'Updated',
        },
        {
          comment_id: '101',
          type: 'reply',
          confidence: 'high',
          reply_message: 'Acknowledged',
        },
      ],
    };
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });
    githubReplyMock.mockResolvedValue({ id: 4444 });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(fs.readFile).toHaveBeenCalledWith(
      path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'response-plan.json'),
      'utf-8',
    );
    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [{ path: 'src/a.ts', change_type: 'modify', content: 'new code' }],
      false,
    );
    expect(githubReplyMock).toHaveBeenCalledTimes(2);
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith('100', 'in_progress');
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      expect.objectContaining({ type: 'code_change', reply: 'Updated' }),
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '101',
      'completed',
      expect.objectContaining({ type: 'reply', reply: 'Acknowledged' }),
    );
    expect(currentMetadataManager.setReplyCommentId).toHaveBeenCalledWith('101', 4444);
    expect(simpleGitCommitMock).toHaveBeenCalled();
    expect(simpleGitPushMock).toHaveBeenCalledWith('origin', 'HEAD:feature/mock-branch');
  });

  it('translates create/delete proposed changes to FileChange payloads', async () => {
    // Given mixed create/modify/delete proposals, all actions should be forwarded to the applier with matching change types
    pendingComments = [buildComment(100, 'code_change')];
    responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'medium',
          proposed_changes: [
            { action: 'create', file: 'src/new.ts', changes: 'new content' },
            { action: 'modify', file: 'src/existing.ts', changes: 'patched content' },
            { action: 'delete', file: 'src/old.ts', changes: '// remove' },
          ],
          reply_message: 'Mixed changes applied',
        },
      ],
    };
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/new.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [
        { path: 'src/new.ts', change_type: 'create', content: 'new content' },
        { path: 'src/existing.ts', change_type: 'modify', content: 'patched content' },
        { path: 'src/old.ts', change_type: 'delete', content: '// remove' },
      ],
      false,
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      expect.objectContaining({ type: 'code_change' }),
    );
  });

  it('errors when response-plan.json is missing', async () => {
    // When the plan file is absent, the command should surface a clear error and avoid side effects
    (fs.readFile as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('no file'), { code: 'ENOENT' }));

    await expect(handlePRCommentExecuteCommand({ pr: '123' })).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith(
      'response-plan.json not found. Run "pr-comment analyze" first.',
    );
    expect(codeChangeApplyMock).not.toHaveBeenCalled();
    expect(githubReplyMock).not.toHaveBeenCalled();
  });

  it('errors when response-plan.json is malformed', async () => {
    // When the plan cannot be parsed, execution should fail early and skip applying changes
    (fs.readFile as jest.Mock).mockResolvedValueOnce('not-json');

    await expect(handlePRCommentExecuteCommand({ pr: '123' })).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse response-plan.json'));
    expect(codeChangeApplyMock).not.toHaveBeenCalled();
  });

  it('marks comment as failed when it is absent from response-plan', async () => {
    // If a pending comment is missing from the plan, it should be recorded as failed and no replies posted
    responsePlan = {
      pr_number: 123,
      comments: [],
    };
    pendingComments = [buildComment(999, 'reply')];

    await handlePRCommentExecuteCommand({ pr: '123' });

    expect(logger.warn).toHaveBeenCalledWith('Comment #999 not found in response-plan');
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '999',
      'failed',
      undefined,
      'Comment not found in response-plan',
    );
    expect(githubReplyMock).not.toHaveBeenCalled();
  });

  it('records failure when CodeChangeApplier returns an error', async () => {
    // If applying code changes fails, the comment should be marked failed with the propagated error
    responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'broken' }],
          reply_message: 'Will fail',
        },
      ],
    };
    codeChangeApplyMock.mockResolvedValue({ success: false, error: 'Patch failed', applied_files: [], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [{ path: 'src/a.ts', change_type: 'modify', content: 'broken' }],
      false,
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'failed',
      expect.objectContaining({ type: 'code_change' }),
      'Patch failed',
    );
    expect(githubReplyMock).not.toHaveBeenCalled();
  });

  it('runs in dry-run mode without updating metadata or posting replies', async () => {
    // Dry-run should apply changes without persisting metadata or replying on GitHub
    responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'dry content' }],
          reply_message: 'Dry',
        },
      ],
    };
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: true });

    expect(currentMetadataManager.updateCommentStatus).not.toHaveBeenCalled();
    expect(currentMetadataManager.setReplyCommentId).not.toHaveBeenCalled();
    expect(githubReplyMock).not.toHaveBeenCalled();
    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [{ path: 'src/a.ts', change_type: 'modify', content: 'dry content' }],
      true,
    );
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('[DRY RUN COMPLETE] No metadata changes were saved.');
  });

  it('processes comments in batches and commits per batch', async () => {
    // With batching enabled, commits and pushes should occur after each batch while all replies are posted
    responsePlan = {
      pr_number: 123,
      comments: [
        { comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Reply 1' },
        { comment_id: '101', type: 'reply', confidence: 'high', reply_message: 'Reply 2' },
        { comment_id: '102', type: 'reply', confidence: 'high', reply_message: 'Reply 3' },
      ],
    };
    pendingComments = [buildComment(100, 'reply'), buildComment(101, 'reply'), buildComment(102, 'reply')];
    simpleGitStatusMock
      .mockResolvedValueOnce({ files: [{ path: 'f1' }] })
      .mockResolvedValueOnce({ files: [{ path: 'f2' }] });
    githubReplyMock.mockResolvedValue({ id: 7777 });

    await handlePRCommentExecuteCommand({ pr: '123', batchSize: '2' });

    expect(githubReplyMock).toHaveBeenCalledTimes(3);
    expect(simpleGitCommitMock).toHaveBeenCalledTimes(2);
    expect(simpleGitPushMock).toHaveBeenCalledTimes(2);
  });

  it('completes discussion comments by replying without applying code changes', async () => {
    // Discussion-type comments should only post a reply and mark completion without invoking the applier
    pendingComments = [buildComment(200, 'discussion', 'Is this clear?')];
    responsePlan = {
      pr_number: 123,
      comments: [
        { comment_id: '200', type: 'discussion', confidence: 'medium', reply_message: 'Discussed' },
      ],
    };

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(codeChangeApplyMock).not.toHaveBeenCalled();
    expect(githubReplyMock).toHaveBeenCalledWith(123, 200, 'Discussed');
    expect(currentMetadataManager.setReplyCommentId).toHaveBeenCalledWith('200', 9999);
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '200',
      'completed',
      expect.objectContaining({ type: 'discussion', reply: 'Discussed' }),
    );
  });

  it('marks skip comments as skipped after replying', async () => {
    // Skip-type comments should post a reply and persist the skipped status
    pendingComments = [buildComment(300, 'skip', 'Please skip this')];
    responsePlan = {
      pr_number: 123,
      comments: [
        { comment_id: '300', type: 'skip', confidence: 'low', reply_message: 'Skipping per plan' },
      ],
    };

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(codeChangeApplyMock).not.toHaveBeenCalled();
    expect(githubReplyMock).toHaveBeenCalledWith(123, 300, 'Skipping per plan');
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '300',
      'skipped',
      expect.objectContaining({ type: 'skip', reply: 'Skipping per plan' }),
    );
  });
});

describe.skip('handlePRCommentExecuteCommand - fallback flow (LEGACY)', () => {
  it('legacy flow is no longer exercised', () => {
    // Legacy flow is intentionally skipped
    expect(true).toBe(true);
  });
});
