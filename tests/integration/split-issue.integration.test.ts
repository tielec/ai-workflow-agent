/**
 * インテグレーションテスト: split-issue コマンド
 *
 * テスト対象: src/commands/split-issue.ts
 * シナリオ出典: test-scenario.md の統合系 (TC-INT-S001〜010)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// モック関数
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

// モジュールモック
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
    debug: mockLoggerDebug,
  },
}));

const { handleSplitIssueCommand } = await import('../../src/commands/split-issue.js');

describe('split-issue command (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(process.cwd());
    mockLoadPrompt.mockReturnValue(
      '{"summary":"{ORIGINAL_TITLE}","issues":[],"metrics":{"completeness":90,"specificity":85}}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: '複雑なIssue',
      body: '## 概要\n大量の作業項目がある...',
      state: 'open',
      labels: ['enhancement'],
      url: 'https://github.com/owner/repo/issues/123',
    });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([
      '{"summary":"3つのサブタスクに分割","issues":[{"title":"型定義の作成","body":"## 概要\n型定義ファイルを作成する","labels":["enhancement"],"priority":"high","dependencies":[]},{"title":"コマンドハンドラの実装","body":"## 概要\nコマンドハンドラを実装する","labels":["enhancement"],"priority":"high","dependencies":[0]},{"title":"テストの作成","body":"## 概要\nテストを作成する","labels":["test"],"priority":"medium","dependencies":[0,1]}],"metrics":{"completeness":90,"specificity":85}}',
    ]);
    mockCodexExecute.mockResolvedValue([
      '{"summary":"Codex","issues":[{"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]}],"metrics":{"completeness":80,"specificity":70}}',
    ]);
    mockCreateMultipleIssues.mockResolvedValue({
      success: true,
      created: [],
      failed: [],
    });
    mockPostComment.mockResolvedValue({ id: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dry-run全体フローでプレビューが表示される (TC-INT-S001)', async () => {
    // 意図: dry-runフローの一連動作を確認する
    await handleSplitIssueCommand({ issue: '123' });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
    const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('SPLIT-ISSUE PREVIEW (dry-run)');
    expect(output).toContain('3つのサブタスクに分割');
    expect(output).toContain('型定義の作成');
    expect(output).toContain('コマンドハンドラの実装');
    expect(output).toContain('テストの作成');
    expect(output).toContain('Issue 1/3');
    expect(output).toContain('Issue 2/3');
    expect(output).toContain('Issue 3/3');
    expect(output).toContain('Completeness Score: 90/100');
    expect(output).toContain('Specificity Score:  85/100');
    expect(output).toContain('DEPENDENCY GRAPH');
    expect(output).toContain('--apply');
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it('メトリクス未出力時はデフォルトメトリクスが表示される (TC-INT-S002)', async () => {
    // 意図: メトリクスなしの場合のフォールバックを確認する
    mockClaudeExecute.mockResolvedValueOnce([
      '{"summary":"概要","issues":[{"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]}]}',
    ]);

    await handleSplitIssueCommand({ issue: '123' });

    const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Completeness Score:');
    expect(output).toContain('Specificity Score:');
  });

  it('applyフローでIssue作成とコメント投稿が行われる (TC-INT-S003)', async () => {
    // 意図: applyフローの一連動作を確認する
    mockCreateMultipleIssues.mockResolvedValueOnce({
      success: true,
      created: [
        { issueNumber: 201, issueUrl: 'https://github.com/owner/repo/issues/201', title: '型定義の作成' },
        { issueNumber: 202, issueUrl: 'https://github.com/owner/repo/issues/202', title: 'コマンドハンドラの実装' },
        { issueNumber: 203, issueUrl: 'https://github.com/owner/repo/issues/203', title: 'テストの作成' },
      ],
      failed: [],
    });

    await handleSplitIssueCommand({ issue: '123', apply: true });

    expect(mockCreateMultipleIssues).toHaveBeenCalledTimes(1);
    expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#201'));
    expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#202'));
    expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#203'));
  });

  it('apply時に部分的失敗があってもコメント投稿される (TC-INT-S004)', async () => {
    // 意図: 部分的失敗でも成功分でコメント投稿されることを確認する
    mockCreateMultipleIssues.mockResolvedValueOnce({
      success: false,
      created: [
        { issueNumber: 301, issueUrl: '...', title: 'Task 1' },
        { issueNumber: 303, issueUrl: '...', title: 'Task 3' },
      ],
      failed: [{ index: 1, title: 'Task 2', error: 'API rate limit exceeded' }],
    });

    await handleSplitIssueCommand({ issue: '123', apply: true });

    expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#301'));
    expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#303'));
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('Claude失敗時にCodexへフォールバックする (TC-INT-S005)', async () => {
    // 意図: エージェントフォールバック動作を確認する
    mockClaudeExecute.mockRejectedValueOnce(new Error('Claude down'));
    mockCodexExecute.mockResolvedValueOnce([
      '{"summary":"概要","issues":[{"title":"Fallback","body":"Body","labels":[],"priority":"high","dependencies":[]}]}',
    ]);

    await handleSplitIssueCommand({ issue: '123' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalledTimes(1);
  });

  it('全エージェント失敗時はエラー (TC-INT-S006)', async () => {
    // 意図: 全エージェント失敗時の例外を確認する
    mockClaudeExecute.mockRejectedValueOnce(new Error('fail'));
    mockCodexExecute.mockRejectedValueOnce(new Error('fail'));

    await expect(handleSplitIssueCommand({ issue: '123' })).rejects.toThrow('All agents failed');
  });

  it('パース失敗時はエラー (TC-INT-S007)', async () => {
    // 意図: 無効出力時にパースエラーとなることを確認する
    mockClaudeExecute.mockResolvedValueOnce(['これはJSONではありません']);

    await expect(handleSplitIssueCommand({ issue: '123' })).rejects.toThrow('Failed to parse');
  });

  it('英語言語指定で英語プロンプトが使用される (TC-INT-S008)', async () => {
    // 意図: language=enでPromptLoaderが英語指定されることを確認する
    await handleSplitIssueCommand({ issue: '123', language: 'en' });

    expect(mockLoadPrompt).toHaveBeenCalledWith('split-issue', 'split-issue', 'en');
  });

  it('エージェント認証情報不足でエラー (TC-INT-S009)', async () => {
    // 意図: 認証情報不足時に例外が発生することを確認する
    mockSetupAgentClients.mockReturnValue({ codexClient: null, claudeClient: null });

    await expect(handleSplitIssueCommand({ issue: '123' })).rejects.toThrow(
      'No valid agent configuration available',
    );
  });

  it('max-splitsによる切り詰めが反映される (TC-INT-S010)', async () => {
    // 意図: maxSplits制限がプレビュー表示に反映されることを確認する
    mockClaudeExecute.mockResolvedValueOnce([
      `{"summary":"概要","issues":[
        {"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]},
        {"title":"Issue 2","body":"Body 2","labels":[],"priority":"medium","dependencies":[]},
        {"title":"Issue 3","body":"Body 3","labels":[],"priority":"low","dependencies":[]},
        {"title":"Issue 4","body":"Body 4","labels":[],"priority":"low","dependencies":[]},
        {"title":"Issue 5","body":"Body 5","labels":[],"priority":"low","dependencies":[]}
      ]}`,
    ]);

    await handleSplitIssueCommand({ issue: '123', maxSplits: '3' });

    const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Issue 1/3');
    expect(output).toContain('Issue 2/3');
    expect(output).toContain('Issue 3/3');
    expect(output).not.toContain('Issue 4/5');
    expect(output).not.toContain('Issue 5/5');
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Split issues exceed max-splits'));
  });
});
