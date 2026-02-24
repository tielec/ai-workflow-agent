/**
 * インテグレーションテスト: create-sub-issue コマンド
 *
 * テスト対象: src/commands/create-sub-issue.ts
 * シナリオ出典: test-scenario.md の統合系 (TC-INT-001〜)
 */
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const mockGetIssueInfo = jest.fn();
const mockCreateMultipleIssues = jest.fn();
const mockPostComment = jest.fn();
const mockAddSubIssue = jest.fn();
const mockUpdateIssue = jest.fn();
const mockGetIssue = jest.fn();
const mockLoadPrompt = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockResolveLocalRepoPath = jest.fn();
const mockGetGitHubRepository = jest.fn();
const mockGetHomeDir = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockClaudeExecute = jest.fn();
const mockCodexExecute = jest.fn();

await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    createMultipleIssues = mockCreateMultipleIssues;
    postComment = mockPostComment;
    addSubIssue = mockAddSubIssue;
    updateIssue = mockUpdateIssue;
    getIssue = mockGetIssue;
  },
}));

await jest.unstable_mockModule('../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    collectRepositoryCode: jest.fn().mockResolvedValue('code block'),
  })),
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
  },
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

const { handleCreateSubIssueCommand } = await import('../../src/commands/create-sub-issue.js');

describe('create-sub-issue integration tests', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    testRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-sub-issue-int-'));
    await fs.ensureDir(path.join(testRepoDir, '.git'));

    jest.clearAllMocks();

    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);
    mockLoadPrompt.mockReturnValue(
      [
        '{PARENT_ISSUE_TITLE}',
        '{PARENT_ISSUE_BODY}',
        '{DESCRIPTION}',
        '{ISSUE_TYPE}',
        '{REPOSITORY_CONTEXT}',
        '{OUTPUT_FILE_PATH}',
        '{CUSTOM_INSTRUCTION}',
      ].join('\n'),
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 321,
      title: 'Parent Title',
      body: 'Parent Body',
      url: 'https://example.com/issue/321',
    });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([
      '{"title":"Sub Title","body":"Sub Body","labels":["bug"],"metrics":{"completeness":80,"specificity":70}}',
    ]);
    mockCodexExecute.mockResolvedValue([
      '{"title":"Sub Title","body":"Sub Body","labels":["bug"],"metrics":{"completeness":80,"specificity":70}}',
    ]);
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        {
          success: true,
          issue_url: 'https://example.com/issue/200',
          issue_number: 200,
          error: null,
        },
      ],
      successCount: 1,
      failureCount: 0,
    });
    mockGetIssue.mockResolvedValue({ id: 9001 });
    mockAddSubIssue.mockResolvedValue({ success: true, error: null });
    mockPostComment.mockResolvedValue({});
  });

  afterEach(async () => {
    if (testRepoDir) {
      await fs.remove(testRepoDir);
    }
    jest.clearAllMocks();
  });

  // 意図: dry-runフローでGitHubへの書き込みが発生しないことを確認する。
  it('dry-runフローでプレビューが表示され、GitHub操作が行われない (TC-INT-001)', async () => {
    await handleCreateSubIssueCommand({
      parentIssue: 321,
      description: 'dry-runテスト',
    });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(321);
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('[Dry-Run] Sub-Issue Preview'),
    );
  });

  // 意図: applyフローでIssue作成とSub-Issue紐づけが行われることを確認する。
  it('applyフローでIssue作成とSub-Issue紐づけが行われる (TC-INT-002)', async () => {
    await handleCreateSubIssueCommand({
      parentIssue: 321,
      description: 'applyテスト',
      apply: true,
    });

    expect(mockCreateMultipleIssues).toHaveBeenCalledTimes(1);
    expect(mockAddSubIssue).toHaveBeenCalledWith(321, 9001);
    expect(mockPostComment).toHaveBeenCalledWith(
      321,
      expect.stringContaining('Sub-issue #200 created'),
    );
  });

  // 意図: 全エージェント失敗時にエラーが伝播することを確認する。
  it('全エージェント失敗時はエラーになる (TC-INT-003)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude fail'));
    mockCodexExecute.mockRejectedValueOnce(new Error('codex fail'));

    await expect(
      handleCreateSubIssueCommand({ parentIssue: 321, description: 'fail' }),
    ).rejects.toThrow('Failed to generate sub-issue content with all available agents');

    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
  });
});
