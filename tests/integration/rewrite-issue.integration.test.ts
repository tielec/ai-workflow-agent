/**
 * インテグレーションテスト: rewrite-issue コマンド
 *
 * テスト対象: src/commands/rewrite-issue.ts
 * シナリオ出典: test-scenario.md の統合系 (TC-INT-001〜010)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// モック関数
const mockGetIssueInfo = jest.fn();
const mockUpdateIssue = jest.fn();
const mockLoadPrompt = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockResolveLocalRepoPath = jest.fn();
const mockGetGitHubRepository = jest.fn();
const mockGetHomeDir = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockClaudeExecute = jest.fn();
const mockCodexExecute = jest.fn();

// モジュールモック
await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    updateIssue = mockUpdateIssue;
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
    collectRepositoryCode: jest.fn().mockResolvedValue('ctx'),
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
  },
}));

const { handleRewriteIssueCommand } = await import('../../src/commands/rewrite-issue.js');

describe('rewrite-issue command (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue('/tmp/repo');
    mockLoadPrompt.mockReturnValue(
      '{"title":"{ORIGINAL_TITLE}-updated","body":"{ORIGINAL_BODY}\\n{REPOSITORY_CONTEXT}"}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 321,
      title: 'Old',
      body: 'Line 1\nLine 2',
      url: 'https://example.com/issue/321',
    });
    mockUpdateIssue.mockResolvedValue({ success: true, error: null });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { execute: mockCodexExecute },
      claudeClient: { execute: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue(
      '{"title":"New Title","body":"Line 1\\nModified Line 2\\nLine 3","metrics":{"completeness":90,"specificity":80}}',
    );
    mockCodexExecute.mockResolvedValue(
      '{"title":"Codex","body":"Codex Body","metrics":{"completeness":80,"specificity":70}}',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dry-runフローで差分とメトリクスが出力され、GitHub更新は行われない (TC-INT-001)', async () => {
    await handleRewriteIssueCommand({ issue: 321 });

    expect(mockUpdateIssue).not.toHaveBeenCalled();
    const diffLog = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
    expect(diffLog).toContain('=== Title ===');
    expect(diffLog).toContain('- Old');
    expect(diffLog).toContain('+ New Title');
    expect(diffLog).toContain('Completeness Score: 90/100');
    expect(diffLog).toContain('Specificity Score:  80/100');
  });

  it('apply指定でGitHub Issueが更新される (TC-INT-004)', async () => {
    await handleRewriteIssueCommand({ issue: 321, apply: true });

    expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
    expect(mockUpdateIssue).toHaveBeenCalledWith(321, {
      title: 'New Title',
      body: 'Line 1\nModified Line 2\nLine 3',
    });
  });

  it('エージェント認証情報が不足すると例外をスロー (TC-INT-010)', async () => {
    mockSetupAgentClients.mockReturnValue({ codexClient: null, claudeClient: null });

    await expect(handleRewriteIssueCommand({ issue: 55 })).rejects.toThrow(
      'No valid agent configuration available',
    );
  });
});
