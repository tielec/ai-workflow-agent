import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import { promises as fsp, type PathLike } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { logger } from '../../../src/utils/logger.js';
import { LogFormatter } from '../../../src/phases/formatters/log-formatter.js';
import type { CommentMetadata, ResponsePlanComment } from '../../../src/types/pr-comment.js';
import type { PRCommentAnalyzeOptions } from '../../../src/types/commands.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const resolveAgentCredentialsMock = jest.fn();
const setupAgentClientsMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const configIsCIMock = jest.fn(() => false);
const findWorkflowMetadataMock = jest.fn();
const getUnresolvedPRReviewCommentsMock = jest.fn();
const getPRReviewCommentsMock = jest.fn();
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));
const resolveRepoPathFromPrUrlMock = jest.fn(() => '/repo');

let handlePRCommentAnalyzeCommand: (options: PRCommentAnalyzeOptions) => Promise<void>;
let persistAgentLog: (
  context: {
    messages: string[];
    startTime: number;
    endTime: number;
    duration: number;
    agentName: string;
    error: Error | null;
  },
  analyzeDir: string,
  options: PRCommentAnalyzeOptions,
  logFormatter: LogFormatter,
) => Promise<void>;
let pendingComments: CommentMetadata[] = [];
let currentMetadataManager: any;
let agentExecuteTaskMock: jest.Mock;
let prTitle = 'Mock PR Title';
let processExitSpy: jest.SpyInstance;
let metadataExists = true;
const analyzeOutputPath = path.join('/repo', '.ai-workflow', 'pr-123', 'output', 'response-plan.json');
let outputFileExists = false;
let refreshComments: (prNumber: number, repositoryName: string, metadataManager: any) => Promise<void>;
let fetchLatestUnresolvedComments: (
  githubClient: any,
  prNumber: number,
) => Promise<import('../../../src/types/pr-comment.js').ReviewComment[]>;
let normalizePlanComment: (comment: ResponsePlanComment) => ResponsePlanComment;
let validatePlanProposedChanges: (comment: ResponsePlanComment) => void;

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

const buildMetadata = () => ({
  pr: { title: prTitle, number: 123 },
  comments: Object.fromEntries(pendingComments.map((c) => [String(c.comment.id), c])),
});

beforeAll(async () => {
  await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: resolveRepoPathFromPrUrlMock,
    findWorkflowMetadata: findWorkflowMetadataMock,
  }));

  await jest.unstable_mockModule('../../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      currentMetadataManager = {
        exists: jest.fn().mockImplementation(async () => metadataExists),
        load: jest.fn().mockResolvedValue(undefined),
        getPendingComments: jest.fn(async () => pendingComments),
        getMetadata: jest.fn().mockImplementation(async () => buildMetadata()),
        addComments: jest.fn().mockResolvedValue(0),
        setAnalyzeCompletedAt: jest.fn().mockResolvedValue(undefined),
        setResponsePlanPath: jest.fn().mockResolvedValue(undefined),
        setAnalyzerAgent: jest.fn().mockResolvedValue(undefined),
        setAnalyzerError: jest.fn().mockResolvedValue(undefined),
        clearAnalyzerError: jest.fn().mockResolvedValue(undefined),
      };
      return currentMetadataManager;
    }),
  }));

  await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      getRepositoryInfo: () => ({ repositoryName: 'owner/repo' }),
      commentClient: {
        getUnresolvedPRReviewComments: getUnresolvedPRReviewCommentsMock,
        getPRReviewComments: getPRReviewCommentsMock,
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

  const module = await import('../../../src/commands/pr-comment/analyze.js');
  handlePRCommentAnalyzeCommand = module.handlePRCommentAnalyzeCommand;
  persistAgentLog = module.__testables.persistAgentLog;
  refreshComments = module.__testables.refreshComments;
  fetchLatestUnresolvedComments = module.__testables.fetchLatestUnresolvedComments;
  normalizePlanComment = module.__testables.normalizePlanComment;
  validatePlanProposedChanges = module.__testables.validateProposedChanges;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'Please fix this part'), buildComment(101, 'Add tests')];
  prTitle = 'Mock PR Title';
  currentMetadataManager = null;
  metadataExists = true;
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  configIsCIMock.mockReturnValue(false);
  outputFileExists = false;
  getUnresolvedPRReviewCommentsMock.mockResolvedValue([]);
  getPRReviewCommentsMock.mockResolvedValue([]);

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
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);

  jest.spyOn(fsp, 'mkdir').mockResolvedValue(undefined as any);
  jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  jest.spyOn(fsp, 'writeFile').mockImplementation(fs.writeFile as any);
  jest.spyOn(fsp, 'access').mockImplementation(async (filePath: PathLike) => {
    const file = String(filePath);
    if (file === analyzeOutputPath && outputFileExists) {
      return undefined as any;
    }
    throw Object.assign(new Error('not found'), { code: 'ENOENT' });
  });
  jest.spyOn(fsp, 'readFile').mockImplementation(async (filePath: PathLike) => {
    const file = String(filePath);
    if (file.includes(path.join('prompts', 'pr-comment', 'analyze.txt'))) {
      return 'PR {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}';
    }
    if (file === analyzeOutputPath && outputFileExists) {
      return JSON.stringify({
        analyzer_agent: 'codex',
        comments: [
          { comment_id: '100', type: 'code_change', confidence: 'low', reply_message: 'From file' },
        ],
      });
    }
    if (file.includes('missing.ts')) {
      throw new Error('file missing');
    }
    return 'console.log("example")';
  });
});

describe('persistAgentLog', () => {
  const baseDir = path.join('/repo', '.ai-workflow', 'pr-123', 'analyze');
  const context = {
    messages: ['assistant: line 1', 'assistant: line 2'],
    startTime: 1700000000000,
    endTime: 1700000001000,
    duration: 1000,
    agentName: 'Codex Agent',
    error: null,
  };

  it('writes the formatted log when not in dry-run', async () => {
    const logFormatter = new LogFormatter();
    const writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);

    await persistAgentLog(context, baseDir, { dryRun: false }, logFormatter);

    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent_log.md'),
      expect.stringContaining('# Codex Agent'),
      'utf-8',
    );

    writeFileSpy.mockRestore();
  });

  it('skips writing when dry-run is true', async () => {
    const logFormatter = new LogFormatter();
    const writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);

    await persistAgentLog(context, baseDir, { dryRun: true }, logFormatter);

    expect(writeFileSpy).not.toHaveBeenCalled();
    writeFileSpy.mockRestore();
  });

  it('falls back to raw output when LogFormatter throws', async () => {
    const formatSpy = jest.spyOn(LogFormatter.prototype, 'formatAgentLog').mockImplementation(() => {
      throw new Error('format fail');
    });
    const logFormatter = new LogFormatter();
    const writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    const fallbackContext = {
      ...context,
      messages: ['assistant: fallback message'],
      error: new Error('format fail'),
    };

    await persistAgentLog(fallbackContext, baseDir, { dryRun: false }, logFormatter);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LogFormatter failed: format fail'),
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent_log.md'),
      'assistant: fallback message',
      'utf-8',
    );
    formatSpy.mockRestore();
    writeFileSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('refreshComments', () => {
  it('excludes AI reply comments based on reply_comment_id and adds only user comments', async () => {
    // AI返信(101)を除外し、新規ユーザーコメント(104)のみ追加されることを検証
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    const metadata = {
      comments: {
        100: {
          comment: { id: 100 },
          status: 'completed',
          reply_comment_id: 101,
          started_at: null,
          completed_at: null,
          retry_count: 0,
          resolution: null,
          resolved_at: null,
          error: null,
        },
      },
    };
    const metadataManager = {
      getMetadata: jest.fn().mockResolvedValue(metadata),
      addComments: jest.fn().mockResolvedValue(1),
    };
    getUnresolvedPRReviewCommentsMock.mockResolvedValue([
      {
        id: 'thread-1',
        comments: {
          nodes: [
            { id: 'node-100', databaseId: 100, body: 'Original', author: { login: 'alice' } },
            { id: 'node-101', databaseId: 101, body: 'AI reply', author: { login: 'alice' } },
            { id: 'node-104', databaseId: 104, body: 'New user comment', author: { login: 'bob' } },
          ],
        },
      },
    ]);

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 104, body: 'New user comment' }),
    ]);
    expect(debugSpy).toHaveBeenCalledWith('Excluded 1 AI reply comment(s)');
  });

  it('excludes multiple AI replies and logs the total count', async () => {
    // 複数のAI返信(101,103)を除外し、ログ件数も正しく出力されることを検証
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    const metadata = {
      comments: {
        100: {
          comment: { id: 100 },
          status: 'completed',
          reply_comment_id: 101,
        },
        102: {
          comment: { id: 102 },
          status: 'completed',
          reply_comment_id: 103,
        },
      },
    };
    const metadataManager = {
      getMetadata: jest.fn().mockResolvedValue(metadata),
      addComments: jest.fn().mockResolvedValue(1),
    };
    getUnresolvedPRReviewCommentsMock.mockResolvedValue([
      {
        id: 'thread-1',
        comments: {
          nodes: [
            { id: 'node-100', databaseId: 100, body: 'Existing', author: { login: 'alice' } },
            { id: 'node-101', databaseId: 101, body: 'AI reply 1', author: { login: 'alice' } },
          ],
        },
      },
      {
        id: 'thread-2',
        comments: {
          nodes: [
            { id: 'node-102', databaseId: 102, body: 'Existing 2', author: { login: 'bob' } },
            { id: 'node-103', databaseId: 103, body: 'AI reply 2', author: { login: 'bob' } },
            { id: 'node-200', databaseId: 200, body: 'New user comment', author: { login: 'carol' } },
          ],
        },
      },
    ]);

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 200, body: 'New user comment' }),
    ]);
    expect(debugSpy).toHaveBeenCalledWith('Excluded 2 AI reply comment(s)');
  });

  it('adds only new comments from the latest fetch', async () => {
    const metadata = {
      comments: {
        100: {
          comment: { id: 100 },
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
    };
    const metadataManager = {
      getMetadata: jest.fn().mockResolvedValue(metadata),
      addComments: jest.fn().mockResolvedValue(1),
    };
    getUnresolvedPRReviewCommentsMock.mockResolvedValue([
      {
        id: 'thread-1',
        comments: {
          nodes: [
            {
              id: 'node-100',
              databaseId: 100,
              body: 'Old',
              author: { login: 'alice' },
            },
            {
              id: 'node-200',
              databaseId: 200,
              body: 'New',
              author: { login: 'bob' },
            },
          ],
        },
      },
    ]);

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 200, body: 'New' }),
    ]);
  });

  it('handles null or undefined reply_comment_id without excluding new comments', async () => {
    // reply_comment_id が null/undefined の既存コメントがあっても新規コメント(200)が正しく追加されることを確認
    const metadata = {
      comments: {
        100: {
          comment: { id: 100 },
          status: 'pending',
          reply_comment_id: null,
        },
        102: {
          comment: { id: 102 },
          status: 'pending',
          // reply_comment_id is intentionally undefined
        },
      },
    };
    const metadataManager = {
      getMetadata: jest.fn().mockResolvedValue(metadata),
      addComments: jest.fn().mockResolvedValue(1),
    };
    getUnresolvedPRReviewCommentsMock.mockResolvedValue([
      {
        id: 'thread-1',
        comments: {
          nodes: [
            { id: 'node-100', databaseId: 100, body: 'Existing', author: { login: 'alice' } },
            { id: 'node-102', databaseId: 102, body: 'Existing 2', author: { login: 'bob' } },
            { id: 'node-200', databaseId: 200, body: 'Fresh comment', author: { login: 'carol' } },
          ],
        },
      },
    ]);

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 200, body: 'Fresh comment' }),
    ]);
  });

  it('logs debug and skips add when no new comments are found', async () => {
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    const metadata = {
      comments: {
        100: { comment: { id: 100 }, status: 'pending' },
      },
    };
    const metadataManager = {
      getMetadata: jest.fn().mockResolvedValue(metadata),
      addComments: jest.fn(),
    };
    getUnresolvedPRReviewCommentsMock.mockResolvedValue([
      {
        id: 'thread-1',
        comments: { nodes: [{ id: 'node-100', databaseId: 100, body: 'Existing', author: { login: 'alice' } }] },
      },
    ]);

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith('No new comments found.');
  });

  it('warns and continues when fetch fails', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    const metadataManager = {
      getMetadata: jest.fn(),
      addComments: jest.fn(),
    };
    getUnresolvedPRReviewCommentsMock.mockRejectedValue(new Error('Network down'));

    await refreshComments(123, 'owner/repo', metadataManager as any);

    expect(metadataManager.addComments).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch latest comments: Network down'),
    );
    expect(warnSpy).toHaveBeenCalledWith('Proceeding with existing metadata.');
  });
});

describe('fetchLatestUnresolvedComments', () => {
  it('maps GraphQL response fields to ReviewComment', async () => {
    const mockClient = {
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 'thread-1',
            comments: {
              nodes: [
                {
                  id: 'node-100',
                  databaseId: 100,
                  body: 'Please fix',
                  path: 'src/file.ts',
                  line: 10,
                  startLine: 8,
                  author: { login: 'alice' },
                  createdAt: '2025-01-21T00:00:00Z',
                  updatedAt: '2025-01-21T00:01:00Z',
                },
              ],
            },
          },
        ]),
        getPRReviewComments: jest.fn(),
      },
    };

    const comments = await fetchLatestUnresolvedComments(mockClient as any, 123);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      id: 100,
      node_id: 'node-100',
      path: 'src/file.ts',
      line: 10,
      start_line: 8,
      body: 'Please fix',
      user: 'alice',
      pr_number: 123,
    });
  });

  it('skips comments without databaseId', async () => {
    const mockClient = {
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 'thread-1',
            comments: {
              nodes: [
                { id: 'node-100', databaseId: null, body: 'No id', author: { login: 'alice' } },
                { id: 'node-200', databaseId: 200, body: 'Valid', author: { login: 'bob' } },
              ],
            },
          },
        ]),
        getPRReviewComments: jest.fn(),
      },
    };

    const comments = await fetchLatestUnresolvedComments(mockClient as any, 123);

    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(200);
  });

  it('falls back to REST API when GraphQL returns no comments', async () => {
    const mockClient = {
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn().mockResolvedValue([]),
        getPRReviewComments: jest.fn().mockResolvedValue([
          {
            id: 300,
            node_id: 'node-300',
            path: 'src/rest.ts',
            line: 8,
            start_line: 3,
            body: 'REST comment',
            user: { login: 'rest-user' },
            created_at: '2025-01-21T00:00:00Z',
            updated_at: '2025-01-21T00:00:00Z',
          },
        ]),
      },
    };

    const comments = await fetchLatestUnresolvedComments(mockClient as any, 999);

    expect(mockClient.commentClient.getPRReviewComments).toHaveBeenCalledWith(999);
    expect(comments).toEqual([
      expect.objectContaining({
        id: 300,
        node_id: 'node-300',
        path: 'src/rest.ts',
        line: 8,
        start_line: 3,
        body: 'REST comment',
        user: 'rest-user',
        pr_number: 999,
      }),
    ]);
  });
});

describe('normalizePlanComment (__testables)', () => {
  it('confidenceがlowで承認なしの場合はdiscussionへダウングレードする', () => {
    const normalized = normalizePlanComment({
      comment_id: '123',
      type: 'code_change',
      confidence: 'low',
      rationale: 'needs work',
      proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'refactor' }],
      reply_message: 'will do',
      user_approved: false,
    });

    expect(normalized.type).toBe('discussion');
  });

  it('ユーザー承認済みならconfidenceがlowでもcode_changeを維持する', () => {
    const normalized = normalizePlanComment({
      comment_id: '124',
      type: 'code_change',
      confidence: 'low',
      rationale: 'approved',
      proposed_changes: [{ action: 'modify', file: 'src/b.ts', changes: 'update' }],
      reply_message: 'thanks',
      user_approved: true,
    });

    expect(normalized.type).toBe('code_change');
  });
});

describe('validateProposedChanges (__testables)', () => {
  it('code_changeでproposed_changesが空なら警告を出す', () => {
    const warnSpy = logger.warn as jest.SpyInstance;
    validatePlanProposedChanges({
      comment_id: '200',
      type: 'code_change',
      confidence: 'high',
      rationale: 'no changes',
      proposed_changes: [],
      reply_message: 'ok',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("has type 'code_change' but no proposed_changes"),
    );
  });

  it('code_changeで変更があれば警告しない', () => {
    const warnSpy = logger.warn as jest.SpyInstance;
    validatePlanProposedChanges({
      comment_id: '201',
      type: 'code_change',
      confidence: 'high',
      rationale: 'changes ready',
      proposed_changes: [{ action: 'modify', file: 'src/c.ts', changes: 'add test' }],
      reply_message: 'done',
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('handlePRCommentAnalyzeCommand', () => {
  it('generates agent_log.md with Markdown format when analyze completes successfully', async () => {
    // Given valid agent output, when analyze runs, then agent_log.md is written in Markdown format
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        analyzed_at: '2025-01-21T00:00:00Z',
        comments: [
          { comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Test response' },
        ],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    // Verify agent_log.md is written with Markdown content
    const agentLogWrite = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('agent_log.md'),
    );
    expect(agentLogWrite).toBeTruthy();
    expect(agentLogWrite[1]).toContain('# Claude Agent'); // Should contain Markdown header
    expect(agentLogWrite[1]).toContain('**開始**'); // Should contain start time metadata
    expect(agentLogWrite[1]).toContain('**終了**'); // Should contain end time metadata
    expect(agentLogWrite[1]).toContain('**経過時間**'); // Should contain duration
  });

  it('does not create agent_log.md in dry-run mode', async () => {
    // Given dry-run mode, when analyze runs, then agent_log.md should not be written to disk
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Dry run test' }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: true, agent: 'auto' });

    // Verify agent_log.md is NOT written in dry-run mode
    const agentLogWrite = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('agent_log.md'),
    );
    expect(agentLogWrite).toBeFalsy();
  });

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
  });

  it('prefers file output when response-plan.json is present and normalizes missing fields', async () => {
    // Given the agent writes a file, when analyze runs, then the file content is used instead of raw output
    outputFileExists = true;
    agentExecuteTaskMock.mockResolvedValue(['non-json-output']);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Analyzer Agent: codex');
    expect(markdownCall?.[1]).toContain('Type: discussion (confidence: low)'); // normalized from code_change + low
    expect(logger.info).toHaveBeenCalledWith(`Reading response plan from file: ${analyzeOutputPath}`);
    expect(currentMetadataManager.setAnalyzerAgent).toHaveBeenCalledWith('codex');
  });

  it('falls back to raw output parsing when output file is missing', async () => {
    // Given no response-plan.json, when analyze runs, then raw output is parsed and a warning is logged
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        analyzer_agent: 'claude',
        comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Done' }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    expect(logger.warn).toHaveBeenCalledWith('Output file not found. Falling back to raw output parsing.');
    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Analyzer Agent: claude');
    expect(markdownCall?.[1]).toContain('Comment #100');
  });

  it('logs warning and uses raw output when file JSON is invalid', async () => {
    // Given an unreadable response-plan.json, when parse fails, then fallback raw parsing is used
    outputFileExists = true;
    (fsp.readFile as jest.Mock).mockImplementation(async (filePath: PathLike) => {
      const file = String(filePath);
      if (file.includes(path.join('prompts', 'pr-comment', 'analyze.txt'))) {
        return 'PR {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}';
      }
      if (file === analyzeOutputPath) {
        return '{ invalid json }';
      }
      return 'console.log("example")';
    });
    const agentOutput = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        analyzer_agent: 'auto',
        comments: [{ comment_id: '101', type: 'reply', confidence: 'medium', reply_message: 'Raw' }],
      }),
      '```',
    ].join('\n');
    agentExecuteTaskMock.mockResolvedValue([agentOutput]);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse JSON from file'));
    expect(logger.warn).toHaveBeenCalledWith('Falling back to raw output parsing.');
    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Comment #101');
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
    configIsCIMock.mockReturnValue(true);
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
    configIsCIMock.mockReturnValue(true);
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
    (fsp.readFile as jest.Mock).mockImplementation(async (filePath: PathLike) => {
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
    expect(promptArg).toContain(analyzeOutputPath); // Use platform-specific path from line 49
    expect(promptArg).toContain('(File not found)');
    expect(logger.error).toHaveBeenCalledTimes(1);
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

  it('exits in CI when agent execution fails and records analyzer error', async () => {
    // Given CI environment and agent failure, when analyze runs, then it records error and exits without artifacts
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockRejectedValue(new Error('API timeout'));
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);
    const promptSpy = jest.spyOn(readline, 'createInterface');

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' })).rejects.toThrow('exit called');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith('API timeout', 'agent_execution_error');
    expect(promptSpy).not.toHaveBeenCalled();
    expect(
      (fs.writeFile as jest.Mock).mock.calls.some((call) => String(call[0]).endsWith('response-plan.md')),
    ).toBe(false);
  });

  it('prompts locally when agent fails and exits when user declines', async () => {
    // Given local environment and agent failure, when user declines fallback, then process exits
    agentExecuteTaskMock.mockRejectedValue(new Error('Authentication failed'));
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_, callback) => callback('n'),
      close: jest.fn(),
    } as any);
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' })).rejects.toThrow('exit called');

    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith(
      'Authentication failed',
      'agent_execution_error',
    );
    expect(logger.info).toHaveBeenCalledWith('User cancelled workflow due to analyze failure.');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('continues with fallback when user accepts after agent failure locally', async () => {
    // Given local environment and user accepts fallback, when agent fails, then fallback response-plan is written
    agentExecuteTaskMock.mockRejectedValue(new Error('Rate limit exceeded'));
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_, callback) => callback('y'),
      close: jest.fn(),
    } as any);

    await handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' });

    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Analyzer Agent: fallback');
    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith(
      'Rate limit exceeded',
      'agent_execution_error',
    );
    expect(currentMetadataManager.setAnalyzerAgent).toHaveBeenCalledWith('fallback');
  });

  it('exits in CI when agent returns empty output', async () => {
    // Given CI environment and empty output, when analyze runs, then it exits with agent_empty_output error
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockResolvedValue(['']);
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' })).rejects.toThrow('exit called');

    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith(
      'Agent returned empty output',
      'agent_empty_output',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('prompts locally on parse error and continues when user accepts fallback', async () => {
    // Given malformed output locally, when user accepts, then fallback plan is used and saved
    agentExecuteTaskMock.mockResolvedValue(['```json\n{ invalid\n```']);
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_, callback) => callback('y'),
      close: jest.fn(),
    } as any);

    await handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' });

    const markdownCall = (fs.writeFile as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith('response-plan.md'),
    );
    expect(markdownCall?.[1]).toContain('Analyzer Agent: fallback');
    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith(
      expect.stringContaining('JSON parsing failed'),
      'json_parse_error',
    );
  });

  it('treats empty prompt input as decline', async () => {
    // Given user presses Enter on confirmation, when agent fails, then workflow exits
    agentExecuteTaskMock.mockRejectedValue(new Error('Network error'));
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: (_, callback) => callback(''),
      close: jest.fn(),
    } as any);
    processExitSpy.mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', agent: 'auto' })).rejects.toThrow('exit called');

    expect(currentMetadataManager.setAnalyzerError).toHaveBeenCalledWith(
      'Network error',
      'agent_execution_error',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
