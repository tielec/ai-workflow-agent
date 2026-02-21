/**
 * ユニットテスト: create-sub-issue コマンド
 *
 * テスト対象: src/commands/create-sub-issue.ts
 * シナリオ出典: test-scenario.md のユニット/統合系 (TC-CSI-001〜)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'node:fs';
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

await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
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

const { handleCreateSubIssueCommand } = await import(
  '../../../src/commands/create-sub-issue.js'
);

describe('create-sub-issue command (unit)', () => {
  let testRepoDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-sub-issue-'));

    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);
    mockLoadPrompt.mockReturnValue(
      [
        'PARENT:{PARENT_ISSUE_TITLE}',
        'BODY:{PARENT_ISSUE_BODY}',
        'DESC:{DESCRIPTION}',
        'TYPE:{ISSUE_TYPE}',
        'CTX:{REPOSITORY_CONTEXT}',
        'OUTPUT_FILE_PATH={OUTPUT_FILE_PATH}',
        'CUSTOM:{CUSTOM_INSTRUCTION}',
      ].join('\n'),
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: 'Parent Title',
      body: 'Parent Body',
      url: 'https://example.com/issue/123',
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
      '{"title":"Codex Sub","body":"Codex Body","labels":["task"],"metrics":{"completeness":70,"specificity":60}}',
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (testRepoDir) {
      fs.rmSync(testRepoDir, { recursive: true, force: true });
    }
  });

  // 意図: デフォルトのdry-run動作でプレビューのみ表示されることを確認する。
  it('デフォルトはdry-runでプレビューが表示され、Issue作成は行われない (TC-CSI-001)', async () => {
    await handleCreateSubIssueCommand({
      parentIssue: '123',
      description: 'ログイン画面でバリデーションエラーが表示されない',
    });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
    expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
    expect(mockAddSubIssue).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('[Dry-Run] Sub-Issue Preview'),
    );
    const metricsLog = mockLoggerInfo.mock.calls
      .map((c) => c[0])
      .find((message) => typeof message === 'string' && message.includes('Completeness'));
    expect(metricsLog).toContain('Completeness: 80/100');
  });

  // 意図: apply指定時にIssue作成・紐づけ・コメント投稿が行われることを確認する。
  it('apply指定時にIssue作成とSub-Issue紐づけが実行される (TC-CSI-002/INT)', async () => {
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

    await handleCreateSubIssueCommand({
      parentIssue: 456,
      description: 'エラーハンドリングのリファクタリング',
      apply: true,
      labels: 'priority:high,refactoring',
    });

    expect(mockCreateMultipleIssues).toHaveBeenCalledWith([
      {
        title: 'Sub Title',
        body: 'Sub Body',
        labels: expect.arrayContaining(['bug', 'priority:high', 'refactoring']),
      },
    ]);
    expect(mockAddSubIssue).toHaveBeenCalledWith(456, 9001);
    expect(mockPostComment).toHaveBeenCalledWith(
      456,
      expect.stringContaining('Sub-issue #200 created'),
    );
    expect(mockUpdateIssue).not.toHaveBeenCalled();
  });

  // 意図: Sub-Issue API失敗時に本文更新フォールバックが実行されることを確認する。
  it('Sub-Issue API失敗時に子Issue本文へ親Issue参照を追記する (TC-CSI-012)', async () => {
    mockCreateMultipleIssues.mockResolvedValue({
      results: [
        {
          success: true,
          issue_url: 'https://example.com/issue/300',
          issue_number: 300,
          error: null,
        },
      ],
      successCount: 1,
      failureCount: 0,
    });
    mockGetIssue.mockResolvedValue({ id: 777 });
    mockAddSubIssue.mockResolvedValue({ success: false, error: 'Not supported' });
    mockPostComment.mockResolvedValue({});

    await handleCreateSubIssueCommand({
      parentIssue: 500,
      description: 'サブIssue作成',
      apply: true,
    });

    expect(mockUpdateIssue).toHaveBeenCalledWith(
      300,
      expect.objectContaining({
        body: expect.stringContaining('> Parent issue: #500'),
      }),
    );
  });

  // 意図: 出力ファイルのJSONを優先的に読み取ることを確認する。
  it('エージェント出力ファイルが存在する場合はファイル内容を採用する (TC-CSI-018)', async () => {
    mockClaudeExecute.mockImplementation(async ({ prompt }: { prompt: string }) => {
      const match = prompt.match(/OUTPUT_FILE_PATH=([^\n]+)/);
      if (match) {
        const outputPath = match[1].trim();
        fs.writeFileSync(
          outputPath,
          JSON.stringify({
            title: 'File Title',
            body: 'File Body',
            labels: ['bug'],
            metrics: { completeness: 90, specificity: 85 },
          }),
          'utf-8',
        );
      }
      return ['ignored'];
    });

    await handleCreateSubIssueCommand({
      parentIssue: '321',
      description: 'ファイル出力テスト',
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Title: File Title'));
  });

  // 意図: Claude失敗時にCodexへフォールバックすることを確認する。
  it('Claude失敗時にCodexへフォールバックする (TC-CSI-017)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude down'));
    mockCodexExecute.mockResolvedValueOnce([
      '{"title":"Codex Fallback","body":"Codex Body","labels":["task"]}',
    ]);

    await handleCreateSubIssueCommand({ parentIssue: 77, description: 'フォールバック確認' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalledTimes(1);
  });

  // 意図: 必須オプション不足時にバリデーションエラーとなることを確認する。
  it('parent-issue未指定でエラー (TC-CSI-006)', async () => {
    await expect(
      handleCreateSubIssueCommand({ description: 'テスト' }),
    ).rejects.toThrow('--parent-issue option is required');
  });

  // 意図: 無効なオプション値でバリデーションエラーとなることを確認する。
  it('無効なオプション値でエラー (TC-CSI-007/009/010/013)', async () => {
    await expect(
      handleCreateSubIssueCommand({ parentIssue: 'abc', description: 'x' }),
    ).rejects.toThrow('Invalid parent issue number: abc');
    await expect(
      handleCreateSubIssueCommand({ parentIssue: 1, description: 'x', type: 'invalid' }),
    ).rejects.toThrow('Invalid type: invalid. Must be bug, task, or enhancement');
    await expect(
      handleCreateSubIssueCommand({ parentIssue: 1, description: 'x', language: 'fr' as any }),
    ).rejects.toThrow('Invalid language: fr. Must be ja or en');
    await expect(
      handleCreateSubIssueCommand({ parentIssue: 1, description: 'x', agent: 'gpt' as any }),
    ).rejects.toThrow('Invalid agent mode: gpt. Must be auto, codex, or claude');
  });

  // 意図: applyとdry-runの同時指定が禁止されていることを確認する。
  it('applyとdry-run同時指定でエラー (TC-CSI-011)', async () => {
    await expect(
      handleCreateSubIssueCommand({
        parentIssue: 1,
        description: 'x',
        apply: true,
        dryRun: true,
      }),
    ).rejects.toThrow('Cannot specify both --apply and --dry-run');
  });

  // 意図: GITHUB_REPOSITORY未設定でエラーとなることを確認する。
  it('GITHUB_REPOSITORY未設定でエラー (TC-CSI-014)', async () => {
    mockGetGitHubRepository.mockReturnValueOnce(undefined);
    await expect(
      handleCreateSubIssueCommand({ parentIssue: 10, description: 'x' }),
    ).rejects.toThrow('GITHUB_REPOSITORY is not set or invalid format. Expected: owner/repo');
  });

  // 意図: custom-instructionが上限超過の場合にエラーとなることを確認する。
  it('custom-instruction上限超過でエラー (TC-CSI-015)', async () => {
    await expect(
      handleCreateSubIssueCommand({
        parentIssue: 10,
        description: 'x',
        customInstruction: 'a'.repeat(501),
      }),
    ).rejects.toThrow('Custom instruction must be 500 characters or less');
  });
});
