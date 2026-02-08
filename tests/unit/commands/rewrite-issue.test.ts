/**
 * ユニットテスト: rewrite-issue コマンド
 *
 * テスト対象: src/commands/rewrite-issue.ts
 * シナリオ出典: test-scenario.md のユニット系 (TC-UNIT-001〜032)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// モック関数定義
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

// ESMモジュールのモック
await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    updateIssue = mockUpdateIssue;
  },
}));

await jest.unstable_mockModule('../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    collectRepositoryCode: jest.fn().mockResolvedValue('code block'),
  })),
}));

await jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
  },
}));

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

const { handleRewriteIssueCommand } = await import('../../../src/commands/rewrite-issue.js');

describe('rewrite-issue command (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue('/tmp/repo');
    mockLoadPrompt.mockReturnValue(
      '{"title":"{ORIGINAL_TITLE}-new","body":"{ORIGINAL_BODY}\\nCTX:{REPOSITORY_CONTEXT}"}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: 'Old Title',
      body: 'Old Body',
      url: 'https://example.com/issue/123',
    });
    mockUpdateIssue.mockResolvedValue({ success: true, error: null });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { execute: mockCodexExecute },
      claudeClient: { execute: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue(
      '{"title":"New Title","body":"## 概要\\n新しい本文","metrics":{"completeness":80,"specificity":70}}',
    );
    mockCodexExecute.mockResolvedValue(
      '{"title":"Codex Title","body":"Codex Body","metrics":{"completeness":70,"specificity":60}}',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('デフォルトオプションでdry-runプレビューとデフォルトメトリクス計算が行われる (TC-UNIT-001/015/021)', async () => {
    mockClaudeExecute.mockResolvedValueOnce('{"title":"New","body":"## 概要\\n本文"}'); // metricsなし

    await handleRewriteIssueCommand({ issue: '123' });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
    expect(mockUpdateIssue).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith('  REWRITE-ISSUE PREVIEW (dry-run)');
    const metricsLog = mockLoggerInfo.mock.calls
      .map((c) => c[0])
      .find((m) => typeof m === 'string' && m.includes('Completeness Score'));
    expect(metricsLog).toMatch(/Completeness Score: \d+\/100/);
  });

  it('apply指定時にupdateIssueが呼ばれる (TC-INT-004 相当)', async () => {
    await handleRewriteIssueCommand({ issue: 456, apply: true, agent: 'codex' });

    expect(mockUpdateIssue).toHaveBeenCalledWith(456, {
      title: 'Codex Title',
      body: 'Codex Body',
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully updated issue #456');
  });

  it('無効なIssue番号でバリデーションエラー (TC-UNIT-004/005/006/007)', async () => {
    await expect(handleRewriteIssueCommand({})).rejects.toThrow('--issue option is required.');
    await expect(handleRewriteIssueCommand({ issue: 'abc' })).rejects.toThrow(
      'Invalid issue number: "abc"',
    );
    await expect(handleRewriteIssueCommand({ issue: -1 })).rejects.toThrow(
      'Invalid issue number: "-1"',
    );
    await expect(handleRewriteIssueCommand({ issue: 0 })).rejects.toThrow(
      'Invalid issue number: "0"',
    );
  });

  it('無効なlanguage/agentでエラー (TC-UNIT-008/009)', async () => {
    await expect(handleRewriteIssueCommand({ issue: 1, language: 'fr' as any })).rejects.toThrow(
      'Invalid language: "fr". Allowed values: ja, en',
    );
    await expect(handleRewriteIssueCommand({ issue: 1, agent: 'gpt4' as any })).rejects.toThrow(
      'Invalid agent: "gpt4". Allowed values: auto, codex, claude',
    );
  });

  it('GITHUB_REPOSITORY未設定でエラー (TC-UNIT-012)', async () => {
    mockGetGitHubRepository.mockReturnValueOnce(undefined);
    await expect(handleRewriteIssueCommand({ issue: 10 })).rejects.toThrow(
      'GITHUB_REPOSITORY environment variable is required.',
    );
  });

  it('Claude失敗時にCodexへフォールバックする (TC-INT-006)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude down'));
    mockCodexExecute.mockResolvedValueOnce(
      '{"title":"Codex Fallback","body":"Codex Body Fallback"}',
    );

    await handleRewriteIssueCommand({ issue: 77, agent: 'auto' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalledTimes(1);
    expect(mockUpdateIssue).not.toHaveBeenCalled();
  });

  it('すべてのエージェントが失敗すると例外 (TC-INT-007)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('c fail'));
    mockCodexExecute.mockRejectedValueOnce(new Error('x fail'));

    await expect(handleRewriteIssueCommand({ issue: 88 })).rejects.toThrow(
      'All agents failed to generate rewritten issue content.',
    );
  });

  it('リポジトリコンテキスト取得に失敗してもフォールバックで継続 (TC-INT-012)', async () => {
    mockResolveLocalRepoPath.mockReturnValue('/path/does/not/exist');

    await handleRewriteIssueCommand({ issue: 5 });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get repository context'),
    );
  });
});
