/**
 * ユニットテスト: auto-close-issue コマンドハンドラ
 *
 * テスト対象: src/commands/auto-close-issue.ts
 * テストシナリオ: test-scenario.md の TC-CLI-001 〜 TC-CLI-018 を中心にカバー
 */

import { jest } from '@jest/globals';
import readline from 'node:readline';

// モック関数の事前定義
const mockGetCandidates = jest.fn<any>();
const mockInspect = jest.fn<any>();
const mockFilterByConfidence = jest.fn<any>();
const mockCloseIssue = jest.fn<any>();
const mockResolveLocalRepoPath = jest.fn<any>();
const mockResolveAgentCredentials = jest.fn<any>();
const mockSetupAgentClients = jest.fn<any>();
const mockGetGitHubRepository = jest.fn<any>();
const mockGetHomeDir = jest.fn<any>();
const mockLoggerInfo = jest.fn<any>();
const mockLoggerWarn = jest.fn<any>();
const mockLoggerError = jest.fn<any>();

// ESM モジュールのモック
await jest.unstable_mockModule('../../../src/core/issue-inspector.js', () => ({
  __esModule: true,
  IssueInspector: jest.fn().mockImplementation(() => ({
    getCandidates: mockGetCandidates,
    inspect: mockInspect,
    filterByConfidence: mockFilterByConfidence,
    closeIssue: mockCloseIssue,
  })),
}));

await jest.unstable_mockModule('../../../src/core/github/issue-client.js', () => ({
  __esModule: true,
  IssueClient: jest.fn().mockImplementation(() => ({})),
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

await jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
    getReposRoot: jest.fn().mockReturnValue('/tmp/repos'),
  },
}));

await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: class {},
}));

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn(),
  },
}));

const { handleAutoCloseIssueCommand } = await import(
  '../../../src/commands/auto-close-issue.js'
);

describe('auto-close-issue command handler', () => {
  const baseCandidate = {
    number: 100,
    title: '[FOLLOW-UP] テスト',
    body: 'body',
    labels: [] as string[],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
    url: 'https://example.com/issue/100',
  };

  const inspection = {
    issueNumber: 100,
    recommendation: 'close' as const,
    confidence: 0.9,
    reasoning: 'ready to close',
  };

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';

    mockGetCandidates.mockResolvedValue([baseCandidate]);
    mockInspect.mockResolvedValue([inspection]);
    mockFilterByConfidence.mockImplementation((results: any) => results);
    mockCloseIssue.mockImplementation(
      async (issue: any, result: any, dryRun: boolean) => ({
        issueNumber: issue.number,
        title: issue.title,
        success: true,
        action: dryRun ? 'previewed' : 'closed',
        inspectionResult: result,
      }),
    );

    mockResolveLocalRepoPath.mockReturnValue('/tmp/repos/ai-workflow-agent');
    mockResolveAgentCredentials.mockReturnValue({
      codexApiKey: 'codex-key',
      claudeCredentialsPath: '/path/to/claude',
    });
    mockSetupAgentClients.mockReturnValue({
      codexClient: {},
      claudeClient: {},
    });
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');

    mockLoggerInfo.mockClear();
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  /**
   * TC-CLI-001: parseOptions_正常系_デフォルト値適用
   */
  it('デフォルトオプションが適用される', async () => {
    await handleAutoCloseIssueCommand({});

    expect(mockGetCandidates).toHaveBeenCalledWith('followup', {
      daysThreshold: 90,
      excludeLabels: ['do-not-close', 'pinned'],
      limit: 10,
    });
    expect(mockInspect).toHaveBeenCalledWith(expect.any(Array), 'auto');
  });

  /**
   * TC-CLI-004/005: limit の下限・非数チェック
   */
  it('limit が 0 以下や非数ならバリデーションエラー', async () => {
    await expect(handleAutoCloseIssueCommand({ limit: '0' })).rejects.toThrow(
      'limit must be between 1 and 50',
    );
    await expect(handleAutoCloseIssueCommand({ limit: 'abc' })).rejects.toThrow(
      'limit must be a valid number',
    );
  });

  /**
   * TC-CLI-002: parseOptions_正常系_すべてのオプション指定
   */
  it('すべてのオプションをパースできる', async () => {
    const rlMock = {
      question: (_q: string, cb: (answer: string) => void) => cb('y'),
      close: jest.fn(),
    } as any;
    jest.spyOn(readline, 'createInterface').mockReturnValue(rlMock);

    await handleAutoCloseIssueCommand({
      category: 'stale',
      limit: '20',
      dryRun: false,
      confidenceThreshold: '0.8',
      daysThreshold: '60',
      requireApproval: true,
      excludeLabels: 'critical,urgent',
      agent: 'claude',
    });

    expect(mockGetCandidates).toHaveBeenCalledWith('stale', {
      daysThreshold: 60,
      excludeLabels: ['critical', 'urgent'],
      limit: 20,
    });
    expect(mockInspect).toHaveBeenCalledWith(expect.any(Array), 'claude');
  });

  /**
   * TC-CLI-003/004/005/006/007/008: 異常系入力のバリデーション
   */
  it('limit が51以上の場合はエラー', async () => {
    await expect(handleAutoCloseIssueCommand({ limit: '51' })).rejects.toThrow(
      'limit must be between 1 and 50',
    );
  });

  /**
   * TC-CLI-006: limit 下限境界値
   */
  it('limit の下限境界値1は受け入れられる', async () => {
    await handleAutoCloseIssueCommand({ limit: '1' });

    expect(mockGetCandidates).toHaveBeenCalledWith('followup', {
      daysThreshold: 90,
      excludeLabels: ['do-not-close', 'pinned'],
      limit: 1,
    });
  });

  it('confidenceThreshold が1.0超過の場合はエラー', async () => {
    await expect(
      handleAutoCloseIssueCommand({ confidenceThreshold: '1.5' }),
    ).rejects.toThrow('confidence-threshold must be between 0.0 and 1.0');
  });

  /**
   * TC-CLI-009/010/011: confidenceThreshold の下限・非数・境界値
   */
  it('confidenceThreshold が 0 未満や非数ならバリデーションエラー', async () => {
    await expect(
      handleAutoCloseIssueCommand({ confidenceThreshold: '-0.1' }),
    ).rejects.toThrow('confidence-threshold must be between 0.0 and 1.0');
    await expect(
      handleAutoCloseIssueCommand({ confidenceThreshold: 'not-a-number' }),
    ).rejects.toThrow('confidence-threshold must be a valid number');
  });

  it('confidenceThreshold の境界値 0.0 と 1.0 は受け入れられる', async () => {
    await handleAutoCloseIssueCommand({ confidenceThreshold: '0.0' });
    await handleAutoCloseIssueCommand({ confidenceThreshold: '1.0' });

    expect(mockInspect).toHaveBeenLastCalledWith(expect.any(Array), 'auto');
  });

  it('不正なカテゴリの場合はエラー', async () => {
    await expect(handleAutoCloseIssueCommand({ category: 'invalid' })).rejects.toThrow(
      'category must be one of: followup, stale, old, all',
    );
  });

  /**
   * TC-CLI-012/013: 必須環境変数未設定
   */
  it('GITHUB_TOKEN 未設定でエラーになる', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(
      'GITHUB_TOKEN is required',
    );
  });

  it('GITHUB_REPOSITORY 未設定でエラーになる', async () => {
    delete process.env.GITHUB_REPOSITORY;
    mockGetGitHubRepository.mockReturnValue(undefined);

    await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(
      'GITHUB_REPOSITORY is required',
    );
  });

  /**
   * TC-CLI-014: エージェント未設定
   */
  it('エージェントがどちらも利用不可ならエラー', async () => {
    mockSetupAgentClients.mockReturnValue({ codexClient: null, claudeClient: null });

    await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(
      'No agent available. Please configure CODEX_API_KEY or CLAUDE_CODE_CREDENTIALS_PATH',
    );
  });

  /**
   * TC-CLI-015: dry-run モードの動作
   */
  it('dry-run モードではクローズ処理がプレビューになる', async () => {
    await handleAutoCloseIssueCommand({ category: 'followup', dryRun: true });

    expect(mockCloseIssue).toHaveBeenCalledWith(baseCandidate, inspection, true);
    expect(mockLoggerInfo).toHaveBeenCalledWith('Dry-run mode: no issues were closed.');
  });

  /**
   * TC-CLI-016: reportResults_正常系_成功結果表示
   */
  it('成功ケースのサマリーを出力する', async () => {
    const candidateB = { ...baseCandidate, number: 101, title: '別Issue' };
    mockGetCandidates.mockResolvedValue([baseCandidate, candidateB]);
    mockInspect.mockResolvedValue([
      inspection,
      { ...inspection, issueNumber: 101, confidence: 0.95 },
    ]);
    mockFilterByConfidence.mockImplementation((results: any) => results);
    mockCloseIssue
      .mockImplementationOnce(async () => ({
        issueNumber: 100,
        title: baseCandidate.title,
        success: true,
        action: 'closed',
        inspectionResult: inspection,
      }))
      .mockImplementationOnce(async () => ({
        issueNumber: 101,
        title: candidateB.title,
        success: true,
        action: 'closed',
        inspectionResult: { ...inspection, issueNumber: 101 },
      }));

    await handleAutoCloseIssueCommand({ dryRun: false });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('Summary: inspected=2'),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('closed=2'));
  });

  /**
   * TC-CLI-017: reportResults_正常系_部分的成功
   */
  it('部分成功の場合のサマリーを出力する', async () => {
    const candidateB = { ...baseCandidate, number: 101, title: '部分失敗' };
    const candidateC = { ...baseCandidate, number: 102, title: 'スキップ' };
    mockGetCandidates.mockResolvedValue([baseCandidate, candidateB, candidateC]);
    mockInspect.mockResolvedValue([
      inspection,
      { ...inspection, issueNumber: 101 },
      { ...inspection, issueNumber: 102 },
    ]);
    mockFilterByConfidence.mockImplementation((results: any) => results);

    mockCloseIssue
      .mockImplementationOnce(async () => ({
        issueNumber: 100,
        title: baseCandidate.title,
        success: true,
        action: 'closed',
        inspectionResult: inspection,
      }))
      .mockImplementationOnce(async () => ({
        issueNumber: 101,
        title: candidateB.title,
        success: false,
        action: 'error',
        error: 'API error',
        inspectionResult: { ...inspection, issueNumber: 101 },
      }))
      .mockImplementationOnce(async () => ({
        issueNumber: 102,
        title: candidateC.title,
        success: true,
        action: 'skipped',
        skipReason: 'low_confidence',
        inspectionResult: { ...inspection, issueNumber: 102 },
      }));

    await handleAutoCloseIssueCommand({ dryRun: false });

    const summaryCall = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summaryCall?.[0]).toContain('closed=1');
    expect(summaryCall?.[0]).toContain('skipped=1');
    expect(summaryCall?.[0]).toContain('errors=1');
  });

  /**
   * TC-CLI-018: reportResults_正常系_dry-run結果表示
   */
  it('dry-run のサマリーを出力する', async () => {
    await handleAutoCloseIssueCommand({ dryRun: true });

    const summaryCall = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summaryCall?.[0]).toContain('dryRun=true');
    expect(mockLoggerInfo).toHaveBeenCalledWith('Dry-run mode: no issues were closed.');
  });
});
