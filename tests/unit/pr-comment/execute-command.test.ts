import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../../src/utils/logger.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';
import type { PRCommentExecuteOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const resolveAgentCredentialsMock = jest.fn();
const setupAgentClientsMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const agentExecuteTaskMock = jest.fn();
const reviewAnalyzerMock = jest.fn();
const codeChangeApplyMock = jest.fn();
const githubReplyMock = jest.fn();

let handlePRCommentExecuteCommand: (options: PRCommentExecuteOptions) => Promise<void>;
let pendingComments: CommentMetadata[] = [];
let currentMetadataManager: any;
let planContent = '';
let processExitSpy: jest.SpyInstance;

const buildComment = (id: number, body: string, type: 'code_change' | 'reply' = 'reply'): CommentMetadata => ({
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
    parsePullRequestUrl: jest.fn((url: string) => ({
      owner: 'owner',
      repo: 'repo',
      prNumber: Number.parseInt(url.split('/').pop() ?? '0', 10) || 0,
      repositoryName: 'owner/repo',
    })),
    resolveRepoPathFromPrUrl: jest.fn(() => '/repo'),
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      currentMetadataManager = {
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue({ pr: { branch: 'feature/test' } }),
        getPendingComments: jest.fn(async () => pendingComments),
        getSummary: jest.fn().mockResolvedValue({
          by_status: { completed: 1, skipped: 0, failed: 0 },
        }),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        setReplyCommentId: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        metadataPath: '/repo/.ai-workflow/pr-123/metadata.json',
        workflowDir: '/repo/.ai-workflow/pr-123',
        metadata: { pr: { branch: 'feature/test' } },
      };
      return currentMetadataManager;
    }),
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/comment-analyzer.js', () => ({
    __esModule: true,
    ReviewCommentAnalyzer: jest.fn().mockImplementation(() => ({
      analyze: reviewAnalyzerMock,
    })),
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
      getRepositoryInfo: () => ({ repositoryName: 'owner/repo' }),
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
    })),
  }));

  await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
    __esModule: true,
    resolveAgentCredentials: resolveAgentCredentialsMock,
    setupAgentClients: setupAgentClientsMock,
  }));

  await jest.unstable_mockModule('../../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      getGitCommitUserName: jest.fn(() => 'AI Workflow Bot'),
      getGitCommitUserEmail: jest.fn(() => 'ai-workflow@example.com'),
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
      addConfig: jest.fn().mockResolvedValue(undefined),
      push: jest.fn().mockResolvedValue(undefined),
    })),
  }));

  const module = await import('../../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = module.handlePRCommentExecuteCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'Fix logic', 'code_change'), buildComment(101, 'Explain more', 'reply')];
  currentMetadataManager = null;
  agentExecuteTaskMock.mockReset();
  reviewAnalyzerMock.mockReset();
  codeChangeApplyMock.mockReset();
  githubReplyMock.mockReset();
  githubReplyMock.mockResolvedValue({ id: 9999 });

  setupAgentClientsMock.mockReturnValue({
    codexClient: { executeTask: agentExecuteTaskMock },
    claudeClient: null,
  });

  getRepoRootMock.mockResolvedValue('/repo');
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/output/execution-result.md' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit(1)');
  }) as any);

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

  jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fs, 'pathExists').mockImplementation(async () => true);
  jest.spyOn(fs, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.includes(path.join('prompts', 'pr-comment', 'execute.txt'))) {
      return 'Execute {pr_number}\nPlan: {response_plan}\nOutput: {output_file_path}';
    }
    if (file.endsWith('response-plan.md')) {
      return planContent;
    }
    return 'file content';
  });
});

describe('handlePRCommentExecuteCommand - planned flow', () => {
  it('applies response plan, writes execution result, and updates metadata', async () => {
    // Given response-plan exists, when execute runs, then code changes and replies are applied and metadata updated
    const responsePlan = {
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
          proposed_changes: [],
          reply_message: 'Explained',
        },
      ],
    };
    planContent = `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlan)}\n\`\`\``;

    const executionOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [
          { comment_id: '100', status: 'completed', actions: ['Changed code'] },
          { comment_id: '101', status: 'completed', actions: ['Posted reply'], reply_comment_id: 4444 },
        ],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([executionOutput]);
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(1);
    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [
        {
          path: 'src/a.ts',
          change_type: 'modify',
          content: 'new code',
        },
      ],
      false,
    );
    expect(githubReplyMock).toHaveBeenCalledTimes(2);
    expect(currentMetadataManager.setExecuteCompletedAt).toHaveBeenCalled();
    expect(currentMetadataManager.setExecutionResultPath).toHaveBeenCalledWith(
      path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'execution-result.md'),
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      expect.objectContaining({ type: 'code_change' }),
      undefined,
    );
    const mdCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('execution-result.md'),
    );
    expect(mdCall?.[1]).toContain('Execution Result');
    expect(simpleGitCommitMock).toHaveBeenCalledWith('[ai-workflow] PR Comment: Execute completed');
  });

  it('builds execute prompt with embedded plan JSON and paths', async () => {
    // Given a plan, when execute constructs prompt, then it includes repo path, plan JSON, and output path
    const responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '201',
          type: 'reply',
          confidence: 'high',
          proposed_changes: [],
          reply_message: 'Acknowledged',
        },
      ],
    };
    planContent = `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlan)}\n\`\`\``;
    (fs.readFile as jest.Mock).mockImplementation(async (filePath: fs.PathLike) => {
      const file = String(filePath);
      if (file.includes(path.join('prompts', 'pr-comment', 'execute.txt'))) {
        return 'Execute {pr_number} at {repo_path}\nPlan: {response_plan}\nOutput: {output_file_path}';
      }
      if (file.endsWith('response-plan.md')) {
        return planContent;
      }
      return 'file content';
    });
    const executionOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [{ comment_id: '201', status: 'completed', actions: ['Posted reply'], reply_comment_id: 8080 }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([executionOutput]);

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    const promptArg = agentExecuteTaskMock.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain('Execute 123');
    expect(promptArg).toContain('/repo');
    expect(promptArg).toContain('"comment_id": "201"');
    expect(promptArg).toContain('/repo/.ai-workflow/pr-123/execute/execution-result.json');
  });

  it('writes failure output and stops when response-plan content is malformed', async () => {
    // Given response-plan.md is malformed, when execute runs, then it exits without invoking legacy flow
    planContent = 'not-json-plan';
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentExecuteCommand({ pr: '123' })).rejects.toThrow('exit called');
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(reviewAnalyzerMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to execute'));
  });

  it('parses mixed execution statuses into markdown summary', async () => {
    // Given agent returns completed, skipped, and failed statuses, when execute runs, then markdown reflects counts
    const responsePlan = {
      pr_number: 123,
      comments: [
        { comment_id: '100', type: 'reply', confidence: 'high', proposed_changes: [], reply_message: 'done' },
        { comment_id: '101', type: 'discussion', confidence: 'medium', proposed_changes: [], reply_message: 'skip' },
        { comment_id: '102', type: 'code_change', confidence: 'high', proposed_changes: [], reply_message: 'fail' },
      ],
    };
    planContent = `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlan)}\n\`\`\``;
    const executionOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [
          { comment_id: '100', status: 'completed', actions: ['Posted reply'] },
          { comment_id: '101', status: 'skipped', actions: ['Discuss later'] },
          { comment_id: '102', status: 'failed', error: 'File not found' },
        ],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([executionOutput]);

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    const mdCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('execution-result.md'),
    );
    expect(mdCall?.[1]).toContain('| Completed | 1 |');
    expect(mdCall?.[1]).toContain('| Skipped | 1 |');
    expect(mdCall?.[1]).toContain('| Failed | 1 |');
  });

  it('runs planned flow in dry-run mode without writing artifacts', async () => {
    // Given a plan and execution output, when dry-run is enabled, then no files or metadata are written
    const responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'new code' }],
          reply_message: 'Updated',
        },
      ],
    };
    planContent = `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlan)}\n\`\`\``;

    const executionOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [{ comment_id: '100', status: 'completed', actions: ['Changed code'] }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([executionOutput]);
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: true });

    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [
        { path: 'src/a.ts', change_type: 'modify', content: 'new code' },
      ],
      true,
    );
    expect(githubReplyMock).not.toHaveBeenCalled();
    expect(currentMetadataManager.setExecuteCompletedAt).not.toHaveBeenCalled();
    expect(currentMetadataManager.setExecutionResultPath).not.toHaveBeenCalled();
    expect(
      (fs.writeFile as jest.Mock).mock.calls.some((call) => String(call[0]).endsWith('execution-result.md')),
    ).toBe(false);
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
  });

  it('continues processing other comments when a code change application fails', async () => {
    // Given multiple code_change comments, when one apply call fails, then execution continues and summary records failure
    const responsePlan = {
      pr_number: 123,
      comments: [
        {
          comment_id: '100',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'change A' }],
          reply_message: 'Done A',
        },
        {
          comment_id: '101',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/b.ts', changes: 'change B' }],
          reply_message: 'Done B',
        },
        {
          comment_id: '102',
          type: 'code_change',
          confidence: 'high',
          proposed_changes: [{ action: 'modify', file: 'src/c.ts', changes: 'change C' }],
          reply_message: 'Done C',
        },
      ],
    };
    planContent = `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlan)}\n\`\`\``;
    const executionOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [
          { comment_id: '100', actions: ['Changed code'] },
          { comment_id: '101', actions: ['Changed code'] },
          { comment_id: '102', actions: ['Changed code'] },
        ],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([executionOutput]);
    codeChangeApplyMock
      .mockResolvedValueOnce({ success: true, applied_files: ['src/a.ts'], skipped_files: [] })
      .mockResolvedValueOnce({ success: false, error: 'File missing', applied_files: [], skipped_files: [] })
      .mockResolvedValueOnce({ success: true, applied_files: ['src/c.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false });

    expect(codeChangeApplyMock).toHaveBeenCalledTimes(3);
    expect(githubReplyMock).toHaveBeenCalledTimes(2);
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      expect.objectContaining({ type: 'code_change' }),
      undefined,
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '101',
      'failed',
      expect.objectContaining({ type: 'code_change' }),
      'File missing',
    );
    expect(currentMetadataManager.updateCommentStatus).toHaveBeenCalledWith(
      '102',
      'completed',
      expect.objectContaining({ type: 'code_change' }),
      undefined,
    );
    const mdCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('execution-result.md'),
    );
    expect(mdCall?.[1]).toContain('| Completed | 2 |');
    expect(mdCall?.[1]).toContain('| Failed | 1 |');
    expect(mdCall?.[1]).toContain('Comment #101 (code_change)');
    expect(mdCall?.[1]).toContain('File missing');
  });
});

describe('handlePRCommentExecuteCommand - fallback flow', () => {
  it('falls back to legacy flow when response-plan.md is missing', async () => {
    // Given response-plan.md does not exist, when execute runs, then legacy analyzer path is used
    (fs.pathExists as jest.Mock).mockResolvedValueOnce(false);
    pendingComments = [buildComment(200, 'Legacy flow comment', 'code_change'), buildComment(201, 'Reply', 'reply')];

    reviewAnalyzerMock
      .mockResolvedValueOnce({
        success: true,
        resolution: {
          type: 'code_change',
          confidence: 'high',
          reply: 'Handled',
          changes: [{ path: 'src/a.ts', change_type: 'modify', content: 'updated' }],
        },
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        success: true,
        resolution: { type: 'reply', confidence: 'high', reply: 'Acknowledged' },
        inputTokens: 5,
        outputTokens: 2,
      });
    codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: true });

    expect(logger.warn).toHaveBeenCalledWith(
      "Run 'pr-comment analyze' first for optimized processing. Falling back to legacy flow.",
    );
    expect(reviewAnalyzerMock).toHaveBeenCalledTimes(2);
    expect(codeChangeApplyMock).toHaveBeenCalledTimes(1);
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
  });
});
