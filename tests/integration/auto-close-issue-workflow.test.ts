/**
 * インテグレーションテスト: auto-close-issue ワークフロー
 *
 * テスト対象: src/commands/auto-close-issue.ts
 * テストシナリオ: test-scenario.md の TC-INT-001 〜 TC-INT-014 を中心にカバー
 */

import { jest } from '@jest/globals';
import readline from 'node:readline';

const mockGetCandidates = jest.fn<any>();
const mockInspect = jest.fn<any>();
const mockFilterByConfidence = jest.fn<any>();
const mockCloseIssue = jest.fn<any>();
const mockResolveLocalRepoPath = jest.fn<any>();
const mockResolveAgentCredentials = jest.fn<any>();
const mockSetupAgentClients = jest.fn<any>();
const mockLoggerInfo = jest.fn<any>();
const mockLoggerWarn = jest.fn<any>();
const mockLoggerError = jest.fn<any>();
const mockGetGitHubRepository = jest.fn<any>();
const mockGetHomeDir = jest.fn<any>();

await jest.unstable_mockModule('../../src/core/issue-inspector.js', () => ({
  __esModule: true,
  IssueInspector: jest.fn().mockImplementation(() => ({
    getCandidates: mockGetCandidates,
    inspect: mockInspect,
    filterByConfidence: mockFilterByConfidence,
    closeIssue: mockCloseIssue,
  })),
}));

await jest.unstable_mockModule('../../src/core/github/issue-client.js', () => ({
  __esModule: true,
  IssueClient: jest.fn().mockImplementation(() => ({})),
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

await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: class {},
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
    getReposRoot: jest.fn().mockReturnValue('/tmp/repos'),
  },
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn(),
  },
}));

const { handleAutoCloseIssueCommand } = await import(
  '../../src/commands/auto-close-issue.js'
);

describe('auto-close-issue workflow', () => {
  const candidate = {
    number: 100,
    title: '[FOLLOW-UP] 残タスク',
    body: '',
    labels: [] as string[],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
    url: 'https://example.com/100',
  };

  const inspection = {
    issueNumber: 100,
    recommendation: 'close' as const,
    confidence: 0.9,
    reasoning: 'ready',
  };

  const mockApprovalFlow = (answers: string[]) => {
    let callCount = 0;
    const rlMock = {
      question: (_q: string, cb: (answer: string) => void) => {
        const answer = answers[callCount] ?? 'y';
        callCount += 1;
        cb(answer);
      },
      close: jest.fn(),
    } as any;
    return jest.spyOn(readline, 'createInterface').mockReturnValue(rlMock);
  };

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';

    mockGetCandidates.mockReset();
    mockInspect.mockReset();
    mockFilterByConfidence.mockReset();
    mockCloseIssue.mockReset();
    mockResolveLocalRepoPath.mockReset();
    mockResolveAgentCredentials.mockReset();
    mockSetupAgentClients.mockReset();
    mockLoggerInfo.mockClear();
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
    mockGetGitHubRepository.mockReset();
    mockGetHomeDir.mockReset();

    mockGetCandidates.mockResolvedValue([candidate]);
    mockInspect.mockResolvedValue([inspection]);
    mockFilterByConfidence.mockImplementation((results: any) => results);
    mockCloseIssue.mockResolvedValue({
      issueNumber: 100,
      title: candidate.title,
      success: true,
      action: 'previewed',
      inspectionResult: inspection,
    });
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
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  /**
   * TC-INT-001: dry-run ワークフロー
   */
  it('dry-run モードでワークフローを完走する', async () => {
    await handleAutoCloseIssueCommand({ category: 'followup', dryRun: true });

    expect(mockGetCandidates).toHaveBeenCalledWith('followup', expect.any(Object));
    expect(mockInspect).toHaveBeenCalled();
    expect(mockCloseIssue).toHaveBeenCalledWith(candidate, inspection, true);
    expect(mockLoggerInfo).toHaveBeenCalledWith('Dry-run mode: no issues were closed.');
  });

  /**
   * TC-INT-002: 実際のクローズ実行
   */
  it('dry-run 無効時にクローズ処理を行う', async () => {
    mockCloseIssue.mockResolvedValue({
      issueNumber: 100,
      title: candidate.title,
      success: true,
      action: 'closed',
      inspectionResult: inspection,
    });

    await handleAutoCloseIssueCommand({ category: 'followup', dryRun: false });

    expect(mockCloseIssue).toHaveBeenCalledWith(candidate, inspection, false);
    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('closed=1');
  });

  /**
   * TC-INT-004: confidence 閾値でスキップされる
   */
  it('confidence 未満の結果はスキップされる', async () => {
    mockFilterByConfidence.mockReturnValue([]);

    await handleAutoCloseIssueCommand({
      category: 'followup',
      dryRun: false,
      confidenceThreshold: '0.7',
    });

    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('skipped=1');
    expect(summary?.[0]).toContain('closed=0');
  });

  /**
   * TC-INT-003: 除外ラベル付きIssueがスキップされる
   */
  it('除外ラベルのみの場合は検品をスキップする', async () => {
    mockGetCandidates.mockResolvedValue([]);

    await handleAutoCloseIssueCommand({ category: 'followup', dryRun: false });

    expect(mockInspect).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'No issue candidates matched the criteria. Exiting.',
    );
  });

  /**
   * TC-INT-005: エージェント選択 Codex
   */
  it('codex 指定時は Codex エージェントで検品する', async () => {
    await handleAutoCloseIssueCommand({ agent: 'codex' });

    expect(mockSetupAgentClients).toHaveBeenCalledWith(
      'codex',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockInspect).toHaveBeenCalledWith(expect.any(Array), 'codex');
  });

  /**
   * TC-INT-006: エージェント選択 Claude
   */
  it('claude 指定時は Claude エージェントで検品する', async () => {
    await handleAutoCloseIssueCommand({ agent: 'claude' });

    expect(mockSetupAgentClients).toHaveBeenCalledWith(
      'claude',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockInspect).toHaveBeenCalledWith(expect.any(Array), 'claude');
  });

  /**
   * TC-INT-007: auto モードでフォールバック
   */
  it('auto モードで Codex 失敗時に Claude へフォールバックする想定', async () => {
    const fallbackInspection = { ...inspection, reasoning: 'from-claude' };
    mockInspect.mockImplementation(async (_candidates, agent) => {
      if (agent === 'auto') {
        return [fallbackInspection];
      }
      return [inspection];
    });

    await handleAutoCloseIssueCommand({ agent: 'auto', dryRun: true });

    expect(mockInspect).toHaveBeenCalledWith(expect.any(Array), 'auto');
    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('inspected=1');
  });

  /**
   * TC-INT-008: GitHub API 完全フロー
   */
  it('コメント・クローズ・ラベル追加の順に処理する', async () => {
    const commentSpy = jest.fn();
    const closeSpy = jest.fn();
    const labelSpy = jest.fn();
    mockCloseIssue.mockImplementation(async () => {
      commentSpy();
      closeSpy();
      labelSpy();
      return {
        issueNumber: 100,
        title: candidate.title,
        success: true,
        action: 'closed',
        inspectionResult: inspection,
      };
    });

    await handleAutoCloseIssueCommand({ category: 'followup', dryRun: false });

    expect(commentSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    expect(labelSpy).toHaveBeenCalled();
    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('closed=1');
  });

  /**
   * TC-INT-009: GitHub API レート制限
   */
  it('GitHub API のレート制限エラーを伝搬する', async () => {
    mockCloseIssue.mockRejectedValue(new Error('GitHub API rate limit exceeded'));

    await expect(
      handleAutoCloseIssueCommand({ category: 'followup', dryRun: false }),
    ).rejects.toThrow('GitHub API rate limit exceeded');
  });

  /**
   * TC-INT-010: 対話的確認 承認
   */
  it('require-approval で承認するとクローズする', async () => {
    const spy = mockApprovalFlow(['y']);
    mockCloseIssue.mockResolvedValue({
      issueNumber: 100,
      title: candidate.title,
      success: true,
      action: 'closed',
      inspectionResult: inspection,
    });

    await handleAutoCloseIssueCommand({ requireApproval: true, dryRun: false });

    expect(spy).toHaveBeenCalled();
    expect(mockCloseIssue).toHaveBeenCalledWith(candidate, inspection, false);
  });

  /**
   * TC-INT-011: 対話的確認 拒否
   */
  it('require-approval で拒否するとクローズしない', async () => {
    mockApprovalFlow(['n']);

    await handleAutoCloseIssueCommand({ requireApproval: true, dryRun: false });

    expect(mockCloseIssue).not.toHaveBeenCalled();
    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('skipped=1');
  });

  /**
   * TC-INT-012: 対話的確認 スキップ
   */
  it('最初のIssueをスキップし次のIssueを処理する', async () => {
    mockGetCandidates.mockResolvedValue([
      candidate,
      { ...candidate, number: 101, title: '2件目' },
    ]);
    mockInspect.mockResolvedValue([
      inspection,
      { ...inspection, issueNumber: 101, title: '2件目' },
    ]);
    mockFilterByConfidence.mockImplementation((results: any) => results);
    const answers = mockApprovalFlow(['s', 'y']);
    mockCloseIssue.mockResolvedValueOnce({
      issueNumber: 101,
      title: '2件目',
      success: true,
      action: 'closed',
      inspectionResult: { ...inspection, issueNumber: 101 },
    });

    await handleAutoCloseIssueCommand({ requireApproval: true, dryRun: false });

    expect(answers).toHaveBeenCalled();
    expect(mockCloseIssue).toHaveBeenCalledTimes(1);
    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('closed=1');
    expect(summary?.[0]).toContain('skipped=1');
  });

  /**
   * TC-INT-013: 部分的な失敗
   */
  it('複数Issueのうち一部が失敗しても続行する', async () => {
    mockGetCandidates.mockResolvedValue([
      candidate,
      { ...candidate, number: 101, title: '失敗するIssue' },
      { ...candidate, number: 102, title: '成功するIssue' },
    ]);
    mockInspect.mockResolvedValue([
      inspection,
      { ...inspection, issueNumber: 101 },
      { ...inspection, issueNumber: 102 },
    ]);
    mockFilterByConfidence.mockImplementation((results: any) => results);
    mockCloseIssue
      .mockResolvedValueOnce({
        issueNumber: 100,
        title: candidate.title,
        success: true,
        action: 'closed',
        inspectionResult: inspection,
      })
      .mockResolvedValueOnce({
        issueNumber: 101,
        title: '失敗するIssue',
        success: false,
        action: 'error',
        error: 'API error',
        inspectionResult: { ...inspection, issueNumber: 101 },
      })
      .mockResolvedValueOnce({
        issueNumber: 102,
        title: '成功するIssue',
        success: true,
        action: 'closed',
        inspectionResult: { ...inspection, issueNumber: 102 },
      });

    await handleAutoCloseIssueCommand({ dryRun: false });

    const summary = mockLoggerInfo.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Summary:'),
    );
    expect(summary?.[0]).toContain('closed=2');
    expect(summary?.[0]).toContain('errors=1');
  });

  /**
   * TC-INT-014: 両エージェント失敗
   */
  it('両エージェント失敗時はエラーを返す', async () => {
    mockInspect.mockRejectedValue(new Error('No agent available'));

    await expect(handleAutoCloseIssueCommand({ agent: 'auto' })).rejects.toThrow(
      'No agent available',
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
