/**
 * ユニットテスト: split-issue コマンド
 *
 * テスト対象: src/commands/split-issue.ts
 * シナリオ出典: test-scenario.md のユニット系 (TC-UNIT-001〜)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'node:fs';
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

await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    createMultipleIssues = mockCreateMultipleIssues;
    postComment = mockPostComment;
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
    debug: mockLoggerDebug,
  },
}));

const { handleSplitIssueCommand } = await import('../../../src/commands/split-issue.js');

const buildAgentResponse = (issues: Array<Record<string, unknown>>, metrics?: Record<string, unknown>) =>
  JSON.stringify({
    summary: '分割サマリ',
    issues,
    metrics,
  });

const baseIssues = [
  {
    title: 'Issue A',
    body: '## 概要\nBody A',
    labels: ['enhancement'],
    priority: 'high',
    relatedFeatures: [],
  },
  {
    title: 'Issue B',
    body: '## 概要\nBody B',
    labels: ['bug'],
    priority: 'low',
    relatedFeatures: ['Issue A'],
  },
];

const baseMetrics = { completeness: 80, specificity: 70 };

describe('split-issue command (unit)', () => {
  let testRepoDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-issue-unit-'));

    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);
    mockLoadPrompt.mockReturnValue(
      '{ORIGINAL_TITLE}\n{ORIGINAL_BODY}\n{REPOSITORY_CONTEXT}\n{OUTPUT_FILE_PATH}\n{MAX_SPLITS}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: 'Original Title',
      body: 'Original Body',
      url: 'https://example.com/issue/123',
    });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([buildAgentResponse(baseIssues, baseMetrics)]);
    mockCodexExecute.mockResolvedValue([buildAgentResponse(baseIssues, baseMetrics)]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (testRepoDir) {
      fs.rmSync(testRepoDir, { recursive: true, force: true });
    }
  });

  // 意図: デフォルトのdry-run動作でプレビューのみ表示されることを確認する。
  it('デフォルトはdry-runプレビューを表示し、Issue作成は行わない (TC-UNIT-001/002)', async () => {
    await handleSplitIssueCommand({ issue: '123' });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith('  SPLIT-ISSUE PREVIEW (dry-run)');
    const metricsLog = mockLoggerInfo.mock.calls
      .map((c) => c[0])
      .find((message) => typeof message === 'string' && message.includes('Completeness'));
    expect(metricsLog).toContain('Completeness: 80/100');
  });

  // 意図: apply指定時にIssue作成とコメント投稿が実行されることを確認する。
  it('apply指定時に複数Issue作成とコメント投稿が行われる (TC-UNIT-027/028)', async () => {
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        {
          success: true,
          issue_url: 'https://example.com/issue/101',
          issue_number: 101,
          error: null,
        },
        {
          success: false,
          issue_url: null,
          issue_number: null,
          error: 'fail',
        },
      ],
      successCount: 1,
      failureCount: 1,
    });
    mockPostComment.mockResolvedValue({});

    await handleSplitIssueCommand({ issue: 456, apply: true, agent: 'codex' });

    expect(mockCreateMultipleIssues).toHaveBeenCalledTimes(1);
    expect(mockPostComment).toHaveBeenCalledWith(
      456,
      expect.stringContaining('## Issue分割完了'),
    );
    expect(mockPostComment).toHaveBeenCalledWith(
      456,
      expect.stringContaining('#101'),
    );
  });

  // 意図: コメント投稿失敗時も全体処理が失敗しないことを確認する。
  it('コメント投稿失敗時も処理が継続する (TC-UNIT-032)', async () => {
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        {
          success: true,
          issue_url: 'https://example.com/issue/201',
          issue_number: 201,
          error: null,
        },
      ],
      successCount: 1,
      failureCount: 0,
    });
    mockPostComment.mockRejectedValue(new Error('comment failed'));

    await expect(handleSplitIssueCommand({ issue: 10, apply: true })).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to post split summary comment'),
    );
  });

  // 意図: 全Issue作成失敗時にコメント投稿がスキップされることを確認する。
  it('全Issue作成失敗時はコメント投稿しない (TC-UNIT-031)', async () => {
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        { success: false, issue_url: null, issue_number: null, error: 'fail' },
        { success: false, issue_url: null, issue_number: null, error: 'fail' },
      ],
      successCount: 0,
      failureCount: 2,
    });

    await handleSplitIssueCommand({ issue: 999, apply: true });

    expect(mockPostComment).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'No issues were created successfully. Skipping comment posting.',
    );
  });

  // 意図: dry-runとapplyの同時指定がエラーになることを確認する。
  it('dry-runとapplyを同時指定した場合はエラー (TC-UNIT-004)', async () => {
    await expect(
      handleSplitIssueCommand({ issue: 1, apply: true, dryRun: true }),
    ).rejects.toThrow('Cannot specify both --apply and --dry-run.');
  });

  // 意図: Issue番号のバリデーションが正しく機能することを確認する。
  it('無効なIssue番号でバリデーションエラー (TC-UNIT-004/005/006/007)', async () => {
    await expect(handleSplitIssueCommand({})).rejects.toThrow('--issue option is required');
    await expect(handleSplitIssueCommand({ issue: 'abc' })).rejects.toThrow(
      'Invalid issue number: abc',
    );
    await expect(handleSplitIssueCommand({ issue: -1 })).rejects.toThrow(
      'Invalid issue number: -1',
    );
    await expect(handleSplitIssueCommand({ issue: 0 })).rejects.toThrow(
      'Invalid issue number: 0',
    );
  });

  // 意図: max-splitsの範囲・形式バリデーションを確認する。
  it('無効なmax-splitsはバリデーションエラー (TC-UNIT-008/009/010)', async () => {
    await expect(handleSplitIssueCommand({ issue: 1, maxSplits: 0 })).rejects.toThrow(
      'Invalid max-splits: 0. Must be integer between 1 and 20',
    );
    await expect(handleSplitIssueCommand({ issue: 1, maxSplits: 21 })).rejects.toThrow(
      'Invalid max-splits: 21. Must be integer between 1 and 20',
    );
    await expect(handleSplitIssueCommand({ issue: 1, maxSplits: 'abc' })).rejects.toThrow(
      'Invalid max-splits: abc. Must be integer between 1 and 20',
    );
  });

  // 意図: languageとagentの許可値バリデーションを確認する。
  it('無効なlanguage/agentでエラー (TC-UNIT-011/012)', async () => {
    await expect(handleSplitIssueCommand({ issue: 1, language: 'fr' as any })).rejects.toThrow(
      'Invalid language: fr. Allowed: ja, en',
    );
    await expect(handleSplitIssueCommand({ issue: 1, agent: 'gpt4' as any })).rejects.toThrow(
      'Invalid agent mode: gpt4. Allowed: auto, codex, claude',
    );
  });

  // 意図: GITHUB_REPOSITORY未設定時にエラーになることを確認する。
  it('GITHUB_REPOSITORY未設定でエラー (TC-UNIT-013)', async () => {
    mockGetGitHubRepository.mockReturnValueOnce(undefined);
    await expect(handleSplitIssueCommand({ issue: 10 })).rejects.toThrow(
      'GITHUB_REPOSITORY environment variable is required.',
    );
  });

  // 意図: GITHUB_REPOSITORY形式不正時にエラーになることを確認する。
  it('GITHUB_REPOSITORY形式不正でエラー (TC-UNIT-014)', async () => {
    mockGetGitHubRepository.mockReturnValueOnce('invalid-format');
    await expect(handleSplitIssueCommand({ issue: 10 })).rejects.toThrow(
      'Invalid GITHUB_REPOSITORY format: invalid-format',
    );
  });

  // 意図: エージェント出力ファイルがある場合に優先的に読み込むことを確認する。
  it('出力ファイルJSONを優先してパースする (TC-UNIT-015)', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456);
    const outputDir = path.join(testRepoDir, '.ai-workflow', 'tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'split-issue-123456.json');
    fs.writeFileSync(outputPath, buildAgentResponse(baseIssues, baseMetrics), 'utf-8');

    await handleSplitIssueCommand({ issue: 321 });

    expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully parsed agent response from output file.');
    nowSpy.mockRestore();
  });

  // 意図: Markdownコードブロック内のJSONを抽出してパースできることを確認する。
  it('Markdownコードブロック内のJSONをパースできる (TC-UNIT-016)', async () => {
    mockClaudeExecute.mockResolvedValueOnce([
      '以下が分割結果です:\n```json\n{"summary":"Markdown","issues":[{"title":"機能A","body":"本文","labels":["enhancement"],"priority":"high","relatedFeatures":[]}]}\n```',
    ]);

    await handleSplitIssueCommand({ issue: 2 });

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Issue #1: 機能A'));
  });

  // 意図: metrics未提供時にデフォルト計算が使われることを確認する。
  it('metricsなしの場合はデフォルト計算を使う (TC-UNIT-017)', async () => {
    mockClaudeExecute.mockResolvedValueOnce([
      JSON.stringify({
        summary: 'metricsなし',
        issues: [
          {
            title: '機能X',
            body: '## 概要\n- [ ] task\n`src/x.ts`',
            labels: ['enhancement'],
            priority: 'medium',
            relatedFeatures: [],
          },
        ],
      }),
    ]);

    await handleSplitIssueCommand({ issue: 50 });

    expect(
      mockLoggerInfo.mock.calls.some((call) => String(call[0]).includes('Completeness:')),
    ).toBe(true);
  });

  // 意図: 不正JSON時にフォールバックして空結果になることを確認する。
  it('不正JSONはフォールバックし空結果になる (TC-UNIT-018/019)', async () => {
    mockClaudeExecute.mockResolvedValueOnce(['This is not JSON at all']);

    await handleSplitIssueCommand({ issue: 3 });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to parse agent response in any format: using empty split result.',
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith('Split count: 0');
  });

  // 意図: 空タイトルのIssueを除外し、labels/priorityにデフォルトが入ることを確認する。
  it('空タイトルのIssueはスキップし、labels/priorityはデフォルトになる (TC-UNIT-020/023)', async () => {
    mockClaudeExecute.mockResolvedValueOnce([
      JSON.stringify({
        summary: 'タイトル空',
        issues: [
          { title: '', body: 'skip', labels: [], priority: 'low', relatedFeatures: [] },
          { title: '有効Issue', body: '本文', labels: [], priority: '', relatedFeatures: [] },
        ],
      }),
    ]);

    await handleSplitIssueCommand({ issue: 4 });

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Issue #1: 有効Issue'));
    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Labels: enhancement'));
    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Priority: medium'));
  });

  // 意図: maxSplits超過時の切り詰めと警告ログを確認する。
  it('maxSplits超過時は切り詰め警告が出る (TC-UNIT-021)', async () => {
    mockClaudeExecute.mockResolvedValueOnce([
      buildAgentResponse(
        [
          { title: 'Issue 1', body: 'Body 1', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
          { title: 'Issue 2', body: 'Body 2', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
        ],
        baseMetrics,
      ),
    ]);

    await handleSplitIssueCommand({ issue: 7, maxSplits: 1, apply: true });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Split issues exceed max-splits (1). Truncating results.',
    );
    expect(mockCreateMultipleIssues).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Issue 1' }),
    ]);
  });

  // 意図: Claude失敗時にCodexへフォールバックすることを確認する。
  it('Claude失敗時にCodexへフォールバックする (TC-UNIT-034)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude down'));
    mockCodexExecute.mockResolvedValueOnce([buildAgentResponse(baseIssues, baseMetrics)]);

    await handleSplitIssueCommand({ issue: 77, agent: 'auto' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalledTimes(1);
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
  });

  // 意図: どちらのエージェントも使えない場合にエラーになることを確認する。
  it('両エージェント不在の場合はエラー (TC-UNIT-036)', async () => {
    mockSetupAgentClients.mockReturnValueOnce({ codexClient: null, claudeClient: null });

    await expect(handleSplitIssueCommand({ issue: 88 })).rejects.toThrow(
      'No valid agent configuration available',
    );
  });

  // 意図: リポジトリパス解決失敗時にCWDへフォールバックすることを確認する。
  it('リポジトリパス解決失敗時はCWDにフォールバックする (TC-UNIT-037)', async () => {
    mockResolveLocalRepoPath.mockImplementationOnce(() => {
      throw new Error('not found');
    });

    await handleSplitIssueCommand({ issue: 9 });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve repository path, fallback to CWD'),
    );
  });
});
