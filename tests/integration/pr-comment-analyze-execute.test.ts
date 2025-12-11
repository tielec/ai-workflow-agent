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
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      metadataManagerInstance = {
        setAnalyzeCompletedAt: jest.fn().mockResolvedValue(undefined),
        setResponsePlanPath: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue(undefined),
        getPendingComments: jest.fn(async () => pendingComments),
        getMetadata: jest.fn().mockResolvedValue({ pr: { title: 'Integration PR' } }),
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

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
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
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/output/response-plan.md' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  setupAgentClientsMock.mockReturnValue({ codexClient: { executeTask: agentExecuteTaskMock }, claudeClient: null });

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit: ${code}`);
  }) as any);

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

    const resultPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'execution-result.md');
    expect(await fs.pathExists(resultPath)).toBe(true);
    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(2);
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
    expect(githubReplyMock).toHaveBeenCalled();
    expect(metadataManagerInstances[0].setAnalyzeCompletedAt).toHaveBeenCalled();
    expect(metadataManagerInstances[1].setExecuteCompletedAt).toHaveBeenCalled();
  });
});
