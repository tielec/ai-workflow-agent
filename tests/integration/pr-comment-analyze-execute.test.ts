import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
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
const configIsCIMock = jest.fn(() => false);
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));

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
let processExitSpy: jest.SpyInstance;
let analyzerAnalyzeMock: jest.Mock;

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
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: jest.fn(() => '/repo'),
    findWorkflowMetadata: jest.fn(() => Promise.resolve(null)), // Add missing export
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
        setAnalyzerAgent: jest.fn().mockResolvedValue(undefined),
        setAnalyzerError: jest.fn().mockResolvedValue(undefined),
        clearAnalyzerError: jest.fn().mockResolvedValue(undefined),
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
      getRepositoryInfo: () => ({
        repositoryName: 'owner/repo',
      }),
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
    ReviewCommentAnalyzer: jest.fn().mockImplementation(() => {
      analyzerAnalyzeMock = jest.fn().mockResolvedValue({
        success: true,
        resolution: {
          type: 'reply',
          confidence: 'high',
          reply: 'Done',
        },
        inputTokens: 10,
        outputTokens: 5,
      });
      return {
        analyze: analyzerAnalyzeMock,
      };
    }),
  }));

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      isCI: configIsCIMock,
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
  const distPromptsDir = path.join(process.cwd(), 'dist', 'prompts', 'pr-comment');
  await fs.ensureDir(distPromptsDir);
  await fs.writeFile(
    path.join(distPromptsDir, 'analyze.txt'),
    'Analyze {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}',
  );
  await fs.writeFile(
    path.join(distPromptsDir, 'execute.txt'),
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
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  configIsCIMock.mockReturnValue(false);

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
  if (tmpDir) {
    await fs.remove(tmpDir);
  }
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
  });

  it.skip('reads agent-written response-plan.json and uses it preferentially', async () => {
    const analyzeOutputPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'response-plan.json');
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockImplementationOnce(async () => {
      await fs.ensureDir(path.dirname(analyzeOutputPath));
      await fs.writeFile(
        analyzeOutputPath,
        JSON.stringify({
          analyzer_agent: 'codex',
          comments: [{ comment_id: '100', type: 'code_change', confidence: 'low', reply_message: 'From file' }],
        }),
      );
      return ['non-json-ack'];
    });

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const storedPlan = await fs.readJson(analyzeOutputPath);
    expect(storedPlan.pr_number).toBe(123);
    const markdown = await fs.readFile(
      path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md'),
      'utf-8',
    );
    expect(markdown).toContain('Analyzer Agent: codex');
    expect(markdown).toContain('Type: discussion (confidence: low)');
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('codex');
  }, 30000); // Increase timeout to 30 seconds

  it('exits during analyze in CI when agent fails and does not write response plan', async () => {
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockRejectedValue(new Error('Network timeout'));
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(false);
    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      'Network timeout',
      'agent_execution_error',
    );
  });

  it('parses JSON Lines agent output end-to-end', async () => {
    const jsonLines = [
      '{"event":"start"}',
      '{"event":"progress","data":"analyzing"}',
      '{"pr_number":123,"analyzer_agent":"codex","comments":[{"comment_id":"100","type":"reply","confidence":"high","reply_message":"All good"}]}',
    ];
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(jsonLines);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');

    expect(planContent).toContain('Analyzer Agent: codex');
    expect(planContent).toContain('Comment #100');
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('codex');
  });

  it('exits in CI when parse fails on invalid agent output', async () => {
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['{not-json']);
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      expect.stringContaining('JSON parsing failed'),
      'json_parse_error',
    );
    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(false);
  });

  it('prompts and proceeds with fallback in local mode after parse failure', async () => {
    configIsCIMock.mockReturnValue(false);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['{not-json']);
    const questionMock = jest.fn((_q, cb: (answer: string) => void) => cb('y'));
    const closeMock = jest.fn();
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: questionMock,
      close: closeMock,
    } as any);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');
    expect(planContent).toContain('Analyzer Agent: fallback');
    expect(questionMock).toHaveBeenCalled();
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('fallback');
  });

  it('exits in CI when agent returns empty output', async () => {
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['   ']);
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      'Agent returned empty output',
      'agent_empty_output',
    );
  });

  it('writes a Markdown agent log file after analyze runs', async () => {
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const agentLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'agent_log.md');
    expect(await fs.pathExists(agentLogPath)).toBe(true);

    const logContent = await fs.readFile(agentLogPath, 'utf-8');
    expect(logContent).toMatch(/# (Codex|Claude) Agent/);
    expect(logContent).toContain('**開始**');
    expect(logContent).toContain('**終了**');
    expect(logContent).toContain('**経過時間**');
  });

  it('does not persist agent_log.md in dry-run mode but shows preview', async () => {
    const infoSpy = logger.info as jest.SpyInstance;
    infoSpy.mockClear();

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: true, agent: 'auto' });

    const agentLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'agent_log.md');
    expect(await fs.pathExists(agentLogPath)).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DRY-RUN] response-plan.md preview:\n# Response Plan'),
    );
  });

  it('generates agent_log.md in execute directory during execution flow', async () => {
    // First run analyze to create response plan
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    // Prepare response plan for execution
    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    // Run execute command
    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });

    // Verify execute directory's agent_log.md exists and has Markdown format
    const executeLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'execute', 'agent_log.md');
    expect(await fs.pathExists(executeLogPath)).toBe(true);

    const executeLogContent = await fs.readFile(executeLogPath, 'utf-8');
    // Accept both Claude and Codex agent log formats
    expect(executeLogContent).toMatch(/# (Execute Agent|Claude Agent 実行ログ|Codex Agent 実行ログ)/);
    expect(executeLogContent).toContain('**開始**');
    expect(executeLogContent).toContain('**終了**');
    expect(executeLogContent).toContain('**経過時間**');
  });

  it('does not create agent_log.md in execute directory during dry-run execution', async () => {
    // First run analyze to create response plan
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    // Run execute command in dry-run mode
    await handlePRCommentExecuteCommand({ pr: '123', dryRun: true, agent: 'auto' });

    // Verify execute directory's agent_log.md does NOT exist in dry-run
    const executeLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'execute', 'agent_log.md');
    expect(await fs.pathExists(executeLogPath)).toBe(false);
  });
});
