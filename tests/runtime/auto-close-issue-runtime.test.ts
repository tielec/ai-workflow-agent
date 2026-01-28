import { jest } from '@jest/globals';

const loggerInfoMock = jest.fn();
const loggerErrorMock = jest.fn();
const closeIssueMock = jest.fn();
let handleAutoCloseIssueCommand: typeof import('../../src/commands/auto-close-issue.js').handleAutoCloseIssueCommand;
let IssueInspectorMock: jest.Mock;

const candidates = [{ number: 1, title: 'Sample issue' }];
const inspections = [
  { issueNumber: 1, recommendation: 'close', confidence: 0.9, reasoning: 'test' },
];

beforeAll(async () => {
  jest.resetModules();

  await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
    logger: {
      info: loggerInfoMock,
      error: loggerErrorMock,
      warn: jest.fn(),
      debug: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
    resolveLocalRepoPath: jest.fn().mockReturnValue(process.cwd()),
  }));

  await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
    setupAgentClients: jest.fn().mockReturnValue({ codexClient: {}, claudeClient: {} }),
    resolveAgentCredentials: jest.fn().mockReturnValue({ codexClient: {}, claudeClient: {} }),
  }));

  await jest.unstable_mockModule('../../src/core/github/issue-client.js', () => ({
    IssueClient: jest.fn(),
  }));

  await jest.unstable_mockModule('../../src/core/issue-inspector.js', () => {
    IssueInspectorMock = jest.fn().mockImplementation(() => ({
      getCandidates: jest.fn().mockResolvedValue(candidates),
      inspect: jest.fn().mockResolvedValue(inspections),
      filterByConfidence: jest.fn().mockReturnValue(inspections),
      closeIssue: closeIssueMock.mockResolvedValue({
        issueNumber: 1,
        title: 'Sample issue',
        success: true,
        action: 'closed',
        inspectionResult: inspections[0],
      }),
    }));
    return { IssueInspector: IssueInspectorMock };
  });

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
    config: {
      getGitHubRepository: jest.fn().mockReturnValue('owner/ai-workflow-agent'),
      getHomeDir: jest.fn().mockReturnValue(process.env.HOME ?? '/tmp'),
      getLogLevel: jest.fn().mockReturnValue('debug'),
      getLogNoColor: jest.fn().mockReturnValue(true),
      getReposRoot: jest.fn().mockReturnValue(null),
    },
  }));

  await jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({})),
  }));

  ({ handleAutoCloseIssueCommand } = await import('../../src/commands/auto-close-issue.js'));
});

describe('Runtime: auto-close-issue dry-run / error 動作確認 (Issue #652)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    closeIssueMock.mockClear();
    IssueInspectorMock.mockClear();
    process.env.GITHUB_TOKEN = 'dummy-token';
    process.env.GITHUB_REPOSITORY = 'owner/ai-workflow-agent';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
  });

  it('dry-run モードで closeIssue が dryRun=true で呼び出され、ドライラン通知が出力される', async () => {
    await expect(
      handleAutoCloseIssueCommand({
        category: 'followup',
        limit: 1,
        dryRun: true,
        confidenceThreshold: 0.8,
        daysThreshold: 30,
        excludeLabels: 'do-not-close',
      }),
    ).resolves.not.toThrow();

    const inspectorInstance = IssueInspectorMock.mock.results[0]?.value;
    expect(inspectorInstance.closeIssue).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1 }),
      expect.objectContaining({ recommendation: 'close' }),
      true,
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
  });

  it('必須トークン未設定の場合に即座にエラーを投げる', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(
      handleAutoCloseIssueCommand({
        category: 'stale',
        limit: 2,
        dryRun: true,
        confidenceThreshold: 0.5,
        daysThreshold: 60,
      }),
    ).rejects.toThrow('GITHUB_TOKEN is required');
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('auto-close-issue command failed'),
    );
  });
});
