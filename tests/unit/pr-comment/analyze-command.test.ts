import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../../src/utils/logger.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';
import type { PRCommentAnalyzeOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const resolveAgentCredentialsMock = jest.fn();
const setupAgentClientsMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();

let handlePRCommentAnalyzeCommand: (options: PRCommentAnalyzeOptions) => Promise<void>;
let pendingComments: CommentMetadata[] = [];
let currentMetadataManager: any;
let agentExecuteTaskMock: jest.Mock;
let prTitle = 'Mock PR Title';
let processExitSpy: jest.SpyInstance;
let metadataExists = true;

const buildComment = (id: number, body: string, file = 'src/a.ts'): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    path: file,
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
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      currentMetadataManager = {
        exists: jest.fn().mockImplementation(async () => metadataExists),
        load: jest.fn().mockResolvedValue(undefined),
        getPendingComments: jest.fn(async () => pendingComments),
        getMetadata: jest.fn().mockResolvedValue({ pr: { title: prTitle } }),
        setAnalyzeCompletedAt: jest.fn().mockResolvedValue(undefined),
        setResponsePlanPath: jest.fn().mockResolvedValue(undefined),
      };
      return currentMetadataManager;
    }),
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

  const module = await import('../../../src/commands/pr-comment/analyze.js');
  handlePRCommentAnalyzeCommand = module.handlePRCommentAnalyzeCommand;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'Please fix this part'), buildComment(101, 'Add tests')];
  prTitle = 'Mock PR Title';
  currentMetadataManager = null;
  metadataExists = true;
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

  agentExecuteTaskMock = jest.fn();
  setupAgentClientsMock.mockReturnValue({
    codexClient: { executeTask: agentExecuteTaskMock },
    claudeClient: null,
  });

  getRepoRootMock.mockResolvedValue('/repo');
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/output/response-plan.md' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

  jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fs, 'readFile').mockImplementation(async (filePath: fs.PathLike) => {
    const file = String(filePath);
    if (file.includes(path.join('prompts', 'pr-comment', 'analyze.txt'))) {
      return 'PR {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}';
    }
    return 'console.log("example")';
  });
});

describe('handlePRCommentAnalyzeCommand', () => {
  it('writes response-plan and updates metadata when agent returns plan', async () => {
    // Given valid metadata and pending comments, when agent returns a full plan, then artifacts and metadata are written
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        analyzed_at: '2025-01-21T00:00:00Z',
        comments: [
          {
            comment_id: '100',
            type: 'code_change',
            confidence: 'low',
            rationale: 'Needs a fix',
            proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'update code' }],
            reply_message: 'Will address',
          },
        ],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    expect(agentExecuteTaskMock).toHaveBeenCalledTimes(1);
    const promptArg = agentExecuteTaskMock.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain('Comment #100');
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'response-plan.md'),
      expect.stringContaining('Comment #100'),
      'utf-8',
    );
    const writtenMarkdown = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    )?.[1] as string;
    expect(writtenMarkdown).toContain('Type: discussion (confidence: low)');
    expect(currentMetadataManager.setAnalyzeCompletedAt).toHaveBeenCalledWith('2025-01-21T00:00:00Z');
    expect(currentMetadataManager.setResponsePlanPath).toHaveBeenCalledWith(
      path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'response-plan.md'),
    );
    expect(simpleGitCommitMock).toHaveBeenCalledWith('[ai-workflow] PR Comment: Analyze completed');
  });

  it('skips file writes and metadata updates in dry-run mode', async () => {
    // Given dry-run, when analyze completes, then no files or metadata changes happen
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Noted' }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: true });

    expect(fs.writeFile).not.toHaveBeenCalledWith(
      path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'response-plan.md'),
      expect.anything(),
      'utf-8',
    );
    expect(currentMetadataManager?.setAnalyzeCompletedAt).not.toHaveBeenCalled();
    expect(simpleGitCommitMock).not.toHaveBeenCalled();
  });

  it('filters comments when commentIds option is provided', async () => {
    // Given commentIds filter, when analyze runs, then only filtered comments are sent to the agent
    agentExecuteTaskMock.mockResolvedValue([
      [
        '```json',
        JSON.stringify({
          pr_number: 123,
          comments: [
            { comment_id: '101', type: 'reply', confidence: 'high', reply_message: 'Done' },
          ],
        }),
        '```',
      ].join('\n'),
    ]);

    await handlePRCommentAnalyzeCommand({ pr: '123', commentIds: '101', agent: 'auto' });

    const promptArg = agentExecuteTaskMock.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain('Comment #101');
    expect(promptArg).not.toContain('Comment #100');
    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Comment #101');
    expect(markdownCall?.[1]).not.toContain('Comment #100');
  });

  it('exits with error when metadata file is missing', async () => {
    // Given metadata does not exist, when analyze runs, then the command logs error and exits without artifacts
    metadataExists = false;
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123' })).rejects.toThrow('exit called');
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith("Metadata not found. Run 'pr-comment init' first.");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('does not write partial artifacts when agent execution fails', async () => {
    // Given agent throws, when analyze runs, then the process exits and no files are written
    agentExecuteTaskMock.mockRejectedValue(new Error('API timeout'));
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123' })).rejects.toThrow('exit called');
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze PR comments'));
    expect(
      (fs.writeFile as jest.Mock).mock.calls.some((call) => String(call[0]).endsWith('response-plan.md')),
    ).toBe(false);
    expect(currentMetadataManager.setAnalyzeCompletedAt).not.toHaveBeenCalled();
  });

  it('exits on parse error when agent returns malformed JSON', async () => {
    // Given malformed agent output, when parse fails, then analyze exits without creating response-plan
    agentExecuteTaskMock.mockResolvedValue(['```json\n{ invalid\n```']);

    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123' })).rejects.toThrow('exit called');
    expect(fs.writeFile).not.toHaveBeenCalledWith(expect.stringContaining('response-plan.md'), expect.anything(), 'utf-8');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('embeds placeholders in analyze prompt including file fallback text', async () => {
    // Given template placeholders and missing file content, when prompt is built, then values and fallback text are injected
    const missingComment = buildComment(102, 'Missing file', 'missing.ts');
    pendingComments = [missingComment];
    (fs.readFile as jest.Mock).mockImplementation(async (filePath: fs.PathLike) => {
      const file = String(filePath);
      if (file.includes('missing.ts')) {
        throw new Error('file missing');
      }
      if (file.includes(path.join('prompts', 'pr-comment', 'analyze.txt'))) {
        return 'PR {pr_number}: {pr_title}\nRepo: {repo_path}\n{all_comments}\nOutput: {output_file_path}';
      }
      return 'console.log("example")';
    });
    agentExecuteTaskMock.mockResolvedValue([
      [
        '```json',
        JSON.stringify({ pr_number: 123, comments: [{ comment_id: '102', type: 'discussion', reply_message: 'N/A' }] }),
        '```',
      ].join('\n'),
    ]);

    await handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' });

    const promptArg = agentExecuteTaskMock.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain('PR 123: Mock PR Title');
    expect(promptArg).toContain('Repo: /repo');
    expect(promptArg).toContain('/repo/.ai-workflow/pr-123/analyze/response-plan.json');
    expect(promptArg).toContain('(File not found)');
    expect(logger.error).toHaveBeenCalledTimes(0);
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('exits early when there are no pending comments to analyze', async () => {
    // Given zero pending comments, when analyze runs, then it logs and returns without invoking the agent
    pendingComments = [];

    await handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' });

    expect(agentExecuteTaskMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('No pending comments to analyze.');
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });
});
