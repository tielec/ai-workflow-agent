import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../../src/utils/logger.js';
import type { CommentMetadata } from '../../src/types/pr-comment.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const resolveAgentCredentialsMock = jest.fn();
const setupAgentClientsMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const agentExecuteTaskMock = jest.fn();
const githubReplyMock = jest.fn();
const codeChangeApplyMock = jest.fn();
const analyzerAnalyzeMock = jest.fn();

let handlePRCommentAnalyzeCommand: typeof import('../../src/commands/pr-comment/analyze.js')['handlePRCommentAnalyzeCommand'];
let handlePRCommentExecuteCommand: typeof import('../../src/commands/pr-comment/execute.js')['handlePRCommentExecuteCommand'];
let tmpDir: string;
let metadataStore: {
  setAnalyzeCompletedAt?: jest.Mock;
  setResponsePlanPath?: jest.Mock;
  setExecuteCompletedAt?: jest.Mock;
  setExecutionResultPath?: jest.Mock;
  updateCommentStatus?: jest.Mock;
};
let pendingComments: CommentMetadata[] = [];
let responsePlanData: any;
let metadataManagerInstance: any;
let metadataManagerInstances: any[] = [];

const buildComment = (id: number, type: 'code_change' | 'reply'): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    path: type === 'code_change' ? 'src/a.ts' : undefined,
    line: 5,
    body: type === 'code_change' ? 'Fix the bug' : 'Explain the reason',
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
  await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: jest.fn((url: string) => ({
      owner: 'owner',
      repo: 'repo',
      prNumber: Number.parseInt(url.match(/(\\d+)/)?.[1] ?? '0', 10),
      repositoryName: 'owner/repo',
    })),
    resolveRepoPathFromPrUrl: jest.fn(() => '/repo'),
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      metadataManagerInstance = {
        setAnalyzeCompletedAt: jest.fn().mockResolvedValue(undefined),
        setResponsePlanPath: jest.fn().mockResolvedValue(undefined),
        setAnalyzeError: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        setReplyCommentId: jest.fn().mockResolvedValue(undefined),
        updateCostTracking: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue({ pr: { title: 'Integration PR', branch: 'feature/mock' } }),
        getPendingComments: jest.fn(async () => pendingComments),
        getMetadata: jest.fn().mockResolvedValue({ pr: { title: 'Integration PR', branch: 'feature/mock' } }),
        getSummary: jest.fn().mockResolvedValue({ by_status: { completed: 1, skipped: 0, failed: 0 } }),
      };
      metadataStore = metadataManagerInstance;
      metadataManagerInstances.push(metadataManagerInstance);
      return metadataManagerInstance as any;
    }),
  }));

  await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
    __esModule: true,
    resolveAgentCredentials: resolveAgentCredentialsMock,
    setupAgentClients: setupAgentClientsMock,
  }));

  await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      getRepositoryInfo: jest.fn(() => ({
        owner: 'owner',
        repo: 'repo',
        repositoryName: 'owner/repo',
      })),
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
    })),
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: codeChangeApplyMock,
    })),
  }));
  await jest.unstable_mockModule('../../src/core/pr-comment/comment-analyzer.js', () => ({
    __esModule: true,
    ReviewCommentAnalyzer: jest.fn().mockImplementation(() => ({
      analyze: analyzerAnalyzeMock,
    })),
  }));

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
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

  const analyzeModule = await import('../../src/commands/pr-comment/analyze.js');
  handlePRCommentAnalyzeCommand = analyzeModule.handlePRCommentAnalyzeCommand;
  const executeModule = await import('../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = executeModule.handlePRCommentExecuteCommand;
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'code_change'), buildComment(101, 'reply')];
  metadataStore = {};
  metadataManagerInstance = undefined;
  metadataManagerInstances = [];
  responsePlanData = {
    pr_number: 123,
    analyzed_at: '2025-01-21T00:00:00Z',
    comments: [
      {
        comment_id: '100',
        type: 'code_change',
        confidence: 'high',
        rationale: 'Bug fix',
        proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'export const x = 2;' }],
        reply_message: 'Fixed',
      },
      {
        comment_id: '101',
        type: 'reply',
        confidence: 'high',
        rationale: 'Explanation',
        reply_message: 'Explained',
      },
    ],
  };

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-comment-int-'));
  getRepoRootMock.mockResolvedValue(tmpDir);

  await fs.ensureDir(path.join(tmpDir, 'src', 'prompts', 'pr-comment'));
  await fs.writeFile(
    path.join(tmpDir, 'src', 'prompts', 'pr-comment', 'analyze.txt'),
    'Analyze {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}',
  );
  await fs.writeFile(
    path.join(tmpDir, 'src', 'prompts', 'pr-comment', 'execute.txt'),
    'Execute {pr_number}\nPlan:{response_plan}\nOutput:{output_file_path}',
  );
  await fs.ensureDir(path.join(tmpDir, 'src'));
  await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;');

  agentExecuteTaskMock.mockReset();
  githubReplyMock.mockReset();
  codeChangeApplyMock.mockReset();
  analyzerAnalyzeMock.mockReset();
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/output/response-plan.md' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  setupAgentClientsMock.mockReturnValue({ codexClient: { executeTask: agentExecuteTaskMock }, claudeClient: null });

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  const analyzeResponse = [
    '```json',
    JSON.stringify(responsePlanData),
    '```',
  ].join('\n');

  const executeResponse = [
    '```json',
    JSON.stringify({
      pr_number: 123,
      comments: [
        { comment_id: '100', status: 'completed', actions: ['Applied change'] },
        { comment_id: '101', status: 'completed', actions: ['Replied'], reply_comment_id: 321 },
      ],
    }),
    '```',
  ].join('\n');

  agentExecuteTaskMock.mockResolvedValueOnce([analyzeResponse]).mockResolvedValueOnce([executeResponse]);
  codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });
  githubReplyMock.mockResolvedValue({ id: 321 });
  analyzerAnalyzeMock
    .mockResolvedValueOnce({
      success: true,
      resolution: {
        type: 'code_change',
        confidence: 'high',
        changes: [{ path: 'src/a.ts', change_type: 'modify', content: 'export const x = 2;' }],
        reply: 'Fixed',
      },
    })
    .mockResolvedValueOnce({
      success: true,
      resolution: { type: 'reply', confidence: 'high', reply: 'Explained', changes: [] },
    });
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('Analyze → Execute integration flow', () => {
  it('generates response-plan then execution-result with a single agent call per phase', async () => {
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });

    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(1);
    expect(codeChangeApplyMock).toHaveBeenCalledWith(
      [
        {
          path: 'src/a.ts',
          change_type: 'modify',
          content: 'export const x = 2;',
        },
      ],
      false,
    );
    expect(githubReplyMock).toHaveBeenCalledTimes(2);
    expect(metadataManagerInstances[0].setAnalyzeCompletedAt).toHaveBeenCalled();
    expect(metadataManagerInstances[1].updateCommentStatus).toHaveBeenCalledWith(
      '100',
      'completed',
      expect.objectContaining({ type: 'code_change' }),
    );
    expect(metadataManagerInstances[1].updateCommentStatus).toHaveBeenCalledWith(
      '101',
      'completed',
      expect.objectContaining({ type: 'reply' }),
    );
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('writes fallback plan and exits with code 1 when agent output is empty', async () => {
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValue(['']);
    (process.exit as jest.Mock).mockImplementation(() => {
      throw new Error('process.exit: 1');
    });

    await expect(
      handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' }),
    ).rejects.toThrow('process.exit: 1');

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    const markdown = await fs.readFile(planPath, 'utf-8');
    expect(markdown).toContain('Analyzer Agent: fallback');
    expect(metadataManagerInstances[0].setAnalyzeError).toHaveBeenCalledWith(
      'Fallback plan used due to parsing failure or empty agent output',
    );
    expect(simpleGitCommitMock).toHaveBeenCalledWith('[ai-workflow] PR Comment: Analyze completed (fallback)');
  });

  it('halts workflow when analyze output cannot be parsed, blocking execute stage', async () => {
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValue(['{ invalid json']);
    (process.exit as jest.Mock).mockImplementation(() => {
      throw new Error('process.exit: 1');
    });

    await expect(
      handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' }),
    ).rejects.toThrow('process.exit: 1');

    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(1);
    expect(metadataManagerInstances.length).toBe(1);
    expect(codeChangeApplyMock).not.toHaveBeenCalled();
  });

  it('parses JSON Lines output without fallback and keeps analyzer_agent', async () => {
    const jsonLines = [
      '{"type":"event","data":"start"}',
      '{"type":"event","data":"processing"}',
      JSON.stringify(responsePlanData),
    ].join('\n');
    const executeResponse = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [
          { comment_id: '100', status: 'completed', actions: ['Applied change'] },
          { comment_id: '101', status: 'completed', actions: ['Replied'], reply_comment_id: 321 },
        ],
      }),
      '```',
    ].join('\n');

    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce([jsonLines]).mockResolvedValueOnce([executeResponse]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    const markdown = await fs.readFile(planPath, 'utf-8');
    expect(markdown).toContain('Analyzer Agent: auto');
    expect(markdown).toContain('Comment #100');
    expect(metadataManagerInstances[0].setAnalyzeError).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });
    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(1);
    expect(analyzerAnalyzeMock).toHaveBeenCalledTimes(2);
  });
});
