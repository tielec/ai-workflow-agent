/**
 * インテグレーションテスト: split-issue コマンド
 *
 * テスト対象: src/commands/split-issue.ts
 * シナリオ出典: test-scenario.md の統合系 (TC-INT-001〜007)
 */
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const mockGetIssueInfo = jest.fn();
const mockCreateMultipleIssues = jest.fn();
const mockPostComment = jest.fn();
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

const { handleSplitIssueCommand } = await import('../../src/commands/split-issue.js');

const buildAgentResponse = (issues: Array<Record<string, unknown>>, metrics?: Record<string, unknown>) =>
  JSON.stringify({
    summary: '分割サマリ',
    issues,
    metrics,
  });

const buildIssues = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Issue ${index + 1}`,
    body: `## 概要\nBody ${index + 1}`,
    labels: ['enhancement'],
    priority: 'medium',
    relatedFeatures: [],
  }));

describe('split-issue integration tests', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    testRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'split-issue-int-'));
    await fs.ensureDir(path.join(testRepoDir, '.git'));

    jest.clearAllMocks();

    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);
    mockLoadPrompt.mockReturnValue(
      '{ORIGINAL_TITLE}\n{ORIGINAL_BODY}\n{REPOSITORY_CONTEXT}\n{OUTPUT_FILE_PATH}\n{MAX_SPLITS}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 321,
      title: 'Original Title',
      body: 'Original Body',
      url: 'https://example.com/issue/321',
    });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([buildAgentResponse(buildIssues(3), { completeness: 85, specificity: 70 })]);
    mockCodexExecute.mockResolvedValue([buildAgentResponse(buildIssues(3), { completeness: 85, specificity: 70 })]);
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        { success: true, issue_url: 'https://github.com/owner/repo/issues/201', issue_number: 201, error: null },
        { success: true, issue_url: 'https://github.com/owner/repo/issues/202', issue_number: 202, error: null },
        { success: true, issue_url: 'https://github.com/owner/repo/issues/203', issue_number: 203, error: null },
      ],
      successCount: 3,
      failureCount: 0,
    });
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
    await handleSplitIssueCommand({ issue: 321 });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(321);
    expect(mockClaudeExecute).toHaveBeenCalled();
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith('  SPLIT-ISSUE PREVIEW (dry-run)');
  });

  // 意図: applyフローでIssue作成とコメント投稿が行われることを確認する。
  it('applyフローでIssue作成とコメント投稿が行われる (TC-INT-002)', async () => {
    await handleSplitIssueCommand({ issue: 321, apply: true });

    expect(mockCreateMultipleIssues).toHaveBeenCalledTimes(1);
    const issuesArg = mockCreateMultipleIssues.mock.calls[0][0];
    expect(Array.isArray(issuesArg)).toBe(true);
    expect(issuesArg).toHaveLength(3);
    expect(mockPostComment).toHaveBeenCalledWith(
      321,
      expect.stringContaining('#201'),
    );
  });

  // 意図: 全エージェント失敗時にエラーが伝播することを確認する。
  it('全エージェント失敗時はエラーになる (TC-INT-003)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude fail'));
    mockCodexExecute.mockRejectedValueOnce(new Error('codex fail'));

    await expect(handleSplitIssueCommand({ issue: 321 })).rejects.toThrow(
      'All agents failed to generate split issues.',
    );

    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
  });

  // 意図: 部分失敗時でも成功分のみコメントされることを確認する。
  it('Issue作成の部分失敗時でも成功分のみコメントされる (TC-INT-004)', async () => {
    mockCreateMultipleIssues.mockResolvedValueOnce({
      results: [
        { success: true, issue_url: 'https://github.com/owner/repo/issues/201', issue_number: 201, error: null },
        { success: false, issue_url: null, issue_number: null, error: 'GitHub API error: 422' },
        { success: true, issue_url: 'https://github.com/owner/repo/issues/203', issue_number: 203, error: null },
      ],
      successCount: 2,
      failureCount: 1,
    });

    await handleSplitIssueCommand({ issue: 321, apply: true });

    expect(mockPostComment).toHaveBeenCalledWith(
      321,
      expect.stringContaining('#201'),
    );
    expect(mockPostComment).toHaveBeenCalledWith(
      321,
      expect.stringContaining('#203'),
    );
  });

  // 意図: maxSplits制限がフロー全体に適用されることを確認する。
  it('maxSplits制限がフロー全体で適用される (TC-INT-005)', async () => {
    mockClaudeExecute.mockResolvedValueOnce([
      buildAgentResponse(buildIssues(5), { completeness: 85, specificity: 70 }),
    ]);

    await handleSplitIssueCommand({ issue: 321, apply: true, maxSplits: '3' });

    const issuesArg = mockCreateMultipleIssues.mock.calls[0][0];
    expect(issuesArg).toHaveLength(3);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Split issues exceed max-splits (3). Truncating results.',
    );
  });

  // 意図: Claude失敗時にCodexへフォールバックすることを確認する。
  it('Claude失敗時にCodexへフォールバックする (TC-INT-006)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude fail'));
    mockCodexExecute.mockResolvedValueOnce([
      buildAgentResponse(buildIssues(2), { completeness: 70, specificity: 60 }),
    ]);

    await handleSplitIssueCommand({ issue: 321, agent: 'auto' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalled();
  });

  // 意図: エージェントが利用不可の場合にエラーになることを確認する。
  it('エージェントクライアントが両方nullの場合はエラー (TC-INT-007)', async () => {
    mockSetupAgentClients.mockReturnValueOnce({ codexClient: null, claudeClient: null });

    await expect(handleSplitIssueCommand({ issue: 321 })).rejects.toThrow(
      'No valid agent configuration available',
    );
  });
});
