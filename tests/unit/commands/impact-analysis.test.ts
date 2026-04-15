/**
 * ユニットテスト: impact-analysis コマンドハンドラ
 *
 * テスト対象: src/commands/impact-analysis.ts
 * テストシナリオ: test-scenario.md の TC-CLI-001〜TC-CLI-011, TC-MAIN-001〜TC-MAIN-008
 */

import { jest } from '@jest/globals';
import type { ImpactAnalysisOptions } from '../../../src/types/impact-analysis.js';

const mockResolveLocalRepoPath = jest.fn();
const mockParsePullRequestUrl = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockLoadPrompt = jest.fn();
const mockExecuteScoper = jest.fn();
const mockExecuteInvestigator = jest.fn();
const mockExecuteReporter = jest.fn();
const mockGitHubGetPullRequestDiff = jest.fn();
const mockGitHubPostPRComment = jest.fn();
const mockGitHubConstructor = jest.fn();
const mockLogManagerCtor = jest.fn();
const mockSaveScoperReasoning = jest.fn();
const mockSaveInvestigatorLog = jest.fn();
const mockSaveReporterOutput = jest.fn();
const mockSavePipelineSummary = jest.fn();
const mockSaveDryRunReport = jest.fn();
const mockSaveReportFallback = jest.fn();

await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
  parsePullRequestUrl: mockParsePullRequestUrl,
}));

await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../../src/commands/impact-analysis/scoper.js', () => ({
  __esModule: true,
  executeScoper: mockExecuteScoper,
}));

await jest.unstable_mockModule('../../../src/commands/impact-analysis/investigator.js', () => ({
  __esModule: true,
  executeInvestigator: mockExecuteInvestigator,
}));

await jest.unstable_mockModule('../../../src/commands/impact-analysis/reporter.js', () => ({
  __esModule: true,
  executeReporter: mockExecuteReporter,
}));

await jest.unstable_mockModule('../../../src/commands/impact-analysis/log-manager.js', () => ({
  __esModule: true,
  LogManager: class {
    logDir: string;
    constructor(logDir: string) {
      this.logDir = logDir;
      mockLogManagerCtor(logDir);
    }
    saveScoperReasoning(reasoning: string) {
      mockSaveScoperReasoning(reasoning);
    }
    saveInvestigatorLog(log: string) {
      mockSaveInvestigatorLog(log);
    }
    saveReporterOutput(report: string) {
      mockSaveReporterOutput(report);
    }
    savePipelineSummary(summary: Record<string, unknown>) {
      mockSavePipelineSummary(summary);
    }
    saveDryRunReport(report: string) {
      mockSaveDryRunReport(report);
      return '/tmp/logs/report-dry-run.md';
    }
    saveReportFallback(report: string) {
      mockSaveReportFallback(report);
      return '/tmp/logs/report-fallback.md';
    }
  },
}));

await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor(token?: string, repo?: string) {
      mockGitHubConstructor(token, repo);
    }
    getPullRequestDiff(prNumber: number) {
      return mockGitHubGetPullRequestDiff(prNumber);
    }
    postPRComment(prNumber: number, body: string) {
      return mockGitHubPostPRComment(prNumber, body);
    }
  },
}));

const { handleImpactAnalysisCommand, parseOptions } = await import('../../../src/commands/impact-analysis.js');
const { config } = await import('../../../src/core/config.js');
const { logger } = await import('../../../src/utils/logger.js');

describe('impact-analysis command handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    config.getGitHubRepository = jest.fn().mockReturnValue('owner/repo');
    config.getHomeDir = jest.fn().mockReturnValue('/home/test');

    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
    logger.debug = jest.fn();

    mockResolveLocalRepoPath.mockReturnValue('/tmp/repo');
    mockParsePullRequestUrl.mockReturnValue({ owner: 'myorg', repo: 'myrepo', prNumber: 456 });
    mockResolveAgentCredentials.mockReturnValue({ codexApiKey: 'x', claudeCredentialsPath: '/tmp/claude' });
    mockSetupAgentClients.mockReturnValue({ codexClient: {}, claudeClient: {} });
    mockLoadPrompt.mockReturnValue('playbook');

    mockGitHubGetPullRequestDiff.mockResolvedValue({
      diff: 'diff',
      truncated: false,
      filesChanged: 1,
    });
    mockGitHubPostPRComment.mockResolvedValue({
      success: true,
      commentId: 1,
      commentUrl: 'https://example.com',
      error: null,
    });

    mockExecuteScoper.mockResolvedValue({
      investigationPoints: [{ id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' }],
      matchedPatterns: ['A'],
      skippedPatterns: [],
      reasoning: 'ok',
    });
    mockExecuteInvestigator.mockResolvedValue({
      findings: [],
      completedPoints: ['INV-001'],
      incompletePoints: [],
      guardrailsReached: false,
      reasoning: 'ok',
      toolCallCount: 1,
      tokenUsage: 10,
    });
    mockExecuteReporter.mockResolvedValue({
      markdown: 'report\n判断は開発者が行ってください',
      findingsCount: 0,
      patternsMatched: [],
      guardrailsReached: false,
    });
  });

  describe('parseOptions', () => {
    it('TC-CLI-001: --pr で解析される', () => {
      const options = parseOptions({ pr: '123' });
      expect(options.prNumber).toBe(123);
      expect(options.owner).toBe('owner');
      expect(options.repo).toBe('repo');
      expect(options.agent).toBe('auto');
      expect(options.dryRun).toBe(false);
      expect(options.language).toBe('ja');
    });

    it('TC-CLI-002: --pr-url で解析される', () => {
      const options = parseOptions({ prUrl: 'https://github.com/myorg/myrepo/pull/456' });
      expect(options.prNumber).toBe(456);
      expect(options.owner).toBe('myorg');
      expect(options.repo).toBe('myrepo');
    });

    it('TC-CLI-003: 全オプション指定を反映する', () => {
      const options = parseOptions({
        pr: '789',
        customInstruction: 'table_aとtable_bは新旧テーブル',
        agent: 'claude',
        dryRun: true,
        language: 'en',
      });
      expect(options.customInstruction).toBe('table_aとtable_bは新旧テーブル');
      expect(options.agent).toBe('claude');
      expect(options.dryRun).toBe(true);
      expect(options.language).toBe('en');
    });

    it('TC-CLI-004: PR指定がない場合はエラー', () => {
      expect(() => parseOptions({})).toThrow('--pr または --pr-url');
    });

    it('TC-CLI-005/006/007: 無効なPR番号はエラー', () => {
      expect(() => parseOptions({ pr: 'abc' })).toThrow('無効なPR番号');
      expect(() => parseOptions({ pr: '-1' })).toThrow('無効なPR番号');
      expect(() => parseOptions({ pr: '0' })).toThrow('無効なPR番号');
    });

    it('TC-CLI-008: GITHUB_REPOSITORY未設定でエラー', () => {
      config.getGitHubRepository = jest.fn().mockReturnValue(null);
      expect(() => parseOptions({ pr: '123' })).toThrow('GITHUB_REPOSITORY 環境変数が設定されていません');
    });

    it('TC-CLI-009: 無効なリポジトリ形式でエラー', () => {
      config.getGitHubRepository = jest.fn().mockReturnValue('invalidformat');
      expect(() => parseOptions({ pr: '123' })).toThrow('無効なリポジトリ名');
    });

    it('TC-CLI-010: 無効なエージェントモードでエラー', () => {
      expect(() => parseOptions({ pr: '123', agent: 'invalid' as ImpactAnalysisOptions['agent'] })).toThrow('無効なエージェントモード');
    });

    it('TC-CLI-011: 無効な言語指定でエラー', () => {
      expect(() => parseOptions({ pr: '123', language: 'fr' as ImpactAnalysisOptions['language'] })).toThrow('無効な言語');
    });
  });

  describe('handleImpactAnalysisCommand', () => {
    it('TC-MAIN-001: 基本フローで全ステージを実行する', async () => {
      await handleImpactAnalysisCommand({ pr: '123' });
      expect(mockGitHubGetPullRequestDiff).toHaveBeenCalledWith(123);
      expect(mockExecuteScoper).toHaveBeenCalled();
      expect(mockExecuteInvestigator).toHaveBeenCalled();
      expect(mockExecuteReporter).toHaveBeenCalled();
      expect(mockGitHubPostPRComment).toHaveBeenCalled();
    });

    it('TC-MAIN-002: dry-run ではPRコメントを投稿しない', async () => {
      await handleImpactAnalysisCommand({ pr: '123', dryRun: true });
      expect(mockGitHubPostPRComment).not.toHaveBeenCalled();
      expect(mockSaveDryRunReport).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Dry-run'));
    });

    it('TC-MAIN-003: 調査対象なしの場合はInvestigatorをスキップ', async () => {
      mockExecuteScoper.mockResolvedValue({
        investigationPoints: [],
        matchedPatterns: [],
        skippedPatterns: [],
        reasoning: 'none',
      });

      await handleImpactAnalysisCommand({ pr: '123' });
      expect(mockExecuteInvestigator).not.toHaveBeenCalled();
      expect(mockExecuteReporter).toHaveBeenCalled();
    });

    it('TC-MAIN-004: PRコメント投稿失敗時にフォールバック保存', async () => {
      mockGitHubPostPRComment.mockResolvedValue({ success: false, commentId: null, commentUrl: null, error: '認証エラー' });

      await handleImpactAnalysisCommand({ pr: '123' });
      expect(mockSaveReportFallback).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('TC-MAIN-005: diff取得エラーで中断する', async () => {
      mockGitHubGetPullRequestDiff.mockRejectedValue(new Error('PR #99999 が見つかりません'));

      await expect(handleImpactAnalysisCommand({ pr: '99999' })).rejects.toThrow('PR #99999 が見つかりません');
      expect(mockExecuteScoper).not.toHaveBeenCalled();
    });

    it('TC-MAIN-006: パイプラインサマリーが保存される', async () => {
      await handleImpactAnalysisCommand({ pr: '123' });
      expect(mockSavePipelineSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          prNumber: 123,
          findingsCount: 0,
          patternsMatched: [],
          guardrailsReached: false,
          tokenUsage: 10,
          toolCallCount: 1,
          dryRun: false,
        }),
      );
    });

    it('TC-MAIN-007: --pr-url で GitHubClient が指定リポジトリになる', async () => {
      await handleImpactAnalysisCommand({ prUrl: 'https://github.com/myorg/myrepo/pull/456' });
      expect(mockGitHubConstructor).toHaveBeenCalledWith(undefined, 'myorg/myrepo');
      expect(mockGitHubGetPullRequestDiff).toHaveBeenCalledWith(456);
    });

    it('TC-MAIN-008: エージェント優先順位が claude-first になる', async () => {
      await handleImpactAnalysisCommand({ pr: '123' });
      expect(mockSetupAgentClients).toHaveBeenCalledWith(
        'auto',
        '/tmp/repo',
        expect.any(Object),
        expect.objectContaining({ agentPriority: 'claude-first' }),
      );
    });
  });
});
