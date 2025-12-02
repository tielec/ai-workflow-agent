import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Octokit } from '@octokit/rest';
import { IssueClient, IssueCreationResult } from '../../../src/core/github/issue-client.js';
import { IssueAgentGenerator, type GeneratedIssue, type FollowUpContext } from '../../../src/core/github/issue-agent-generator.js';
import type { RemainingTask, IssueGenerationOptions, IssueContext } from '../../../src/types.js';

describe('IssueClient - Agent-based FOLLOW-UP Issue generation (Issue #174)', () => {
  let issueClient: IssueClient;
  let mockOctokit: jest.Mocked<Octokit>;
  let mockAgentGenerator: jest.Mocked<IssueAgentGenerator>;

  const NORMAL_REMAINING_TASKS: RemainingTask[] = [
    {
      task: 'ユニットテスト追加',
      phase: 'testing',
      targetFiles: ['src/core/github/issue-agent-generator.ts'],
      steps: ['テストファイル作成', 'モック作成', 'アサーション追加'],
      priority: 'high',
      estimatedHours: '2',
      acceptanceCriteria: ['すべてのテストが成功する'],
    },
  ];

  const ISSUE_CONTEXT_NORMAL: IssueContext = {
    summary: 'Issue #123 の残タスク',
    blockerStatus: 'すべてのブロッカーは解決済み',
    deferredReason: 'タスク優先度の判断により後回し',
  };

  beforeEach(() => {
    // Create mock Octokit instance
    const createFn = jest.fn() as jest.MockedFunction<any>;
    mockOctokit = {
      issues: {
        create: createFn,
      },
    } as unknown as jest.Mocked<Octokit>;

    // Create mock IssueAgentGenerator
    mockAgentGenerator = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<IssueAgentGenerator>;

    // Create IssueClient with agent generator
    issueClient = new IssueClient(
      mockOctokit,
      'owner',
      'repo',
      null, // issueAIGenerator
      mockAgentGenerator, // issueAgentGenerator
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createIssueFromEvaluation - agent mode', () => {
    it('IssueClient_createIssueFromEvaluation_正常系_agentモード', async () => {
      // Given: Agent generation succeeds
      const mockGeneratedIssue: GeneratedIssue = {
        success: true,
        title: '[FOLLOW-UP] #123: ユニットテスト追加',
        body: '## 背景\n\nIssue本文\n\n## 目的\n\n詳細\n\n## 実行内容\n\nタスク\n\n## 受け入れ基準\n\n基準\n\n## 参考情報\n\n情報',
      };

      mockAgentGenerator.generate.mockResolvedValue(mockGeneratedIssue);

      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Create issue with agent mode
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Agent generator is called
      expect(mockAgentGenerator.generate).toHaveBeenCalledTimes(1);
      const generatedContext = mockAgentGenerator.generate.mock.calls[0][0];
      expect(generatedContext.issueNumber).toBe(123);
      expect(generatedContext.remainingTasks).toEqual(NORMAL_REMAINING_TASKS);
      expect(generatedContext.issueContext).toEqual(ISSUE_CONTEXT_NORMAL);

      // And: GitHub Issue is created with agent-generated content
      expect(mockOctokit.issues.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: '[FOLLOW-UP] #123: ユニットテスト追加',
        body: expect.stringContaining('## 背景'),
        labels: ['enhancement', 'ai-workflow-follow-up'],
      });

      // And: Result indicates success
      expect(result).toEqual({
        success: true,
        issue_url: 'https://github.com/owner/repo/issues/456',
        issue_number: 456,
        error: null,
      });
    });

    it('IssueClient_createIssueFromEvaluation_正常系_agentフォールバック', async () => {
      // Given: Agent generation fails
      const mockGeneratedIssue: GeneratedIssue = {
        success: false,
        title: '',
        body: '',
        error: 'Codex API failed',
      };

      mockAgentGenerator.generate.mockResolvedValue(mockGeneratedIssue);

      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Create issue with agent mode (agent fails, should fallback)
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Agent generator is called
      expect(mockAgentGenerator.generate).toHaveBeenCalledTimes(1);

      // And: GitHub Issue is still created (fallback to template)
      expect(mockOctokit.issues.create).toHaveBeenCalled();

      // And: Result indicates success (fallback succeeded)
      expect(result.success).toBe(true);
    });

    it('IssueClient_createIssueFromEvaluation_正常系_LLMモード', async () => {
      // Given: LLM mode is specified (not agent)
      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'openai',
      };

      // When: Create issue with openai mode
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Agent generator is NOT called
      expect(mockAgentGenerator.generate).not.toHaveBeenCalled();

      // And: GitHub Issue is created with template
      expect(mockOctokit.issues.create).toHaveBeenCalled();

      // And: Result indicates success
      expect(result.success).toBe(true);
    });
  });

  describe('tryGenerateWithAgent', () => {
    it('IssueClient_tryGenerateWithAgent_正常系', async () => {
      // Given: Agent generator is configured
      const mockGeneratedIssue: GeneratedIssue = {
        success: true,
        title: '[FOLLOW-UP] #123: テスト追加',
        body: '## 背景\n\n詳細\n\n## 目的\n\n目的\n\n## 実行内容\n\nタスク\n\n## 受け入れ基準\n\n基準\n\n## 参考情報\n\n情報',
      };

      mockAgentGenerator.generate.mockResolvedValue(mockGeneratedIssue);

      // When: tryGenerateWithAgent is called (via createIssueFromEvaluation)
      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({
        data: { number: 456, html_url: 'https://github.com/owner/repo/issues/456' },
      } as any);

      const result = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Agent generator is called
      expect(mockAgentGenerator.generate).toHaveBeenCalledTimes(1);

      // And: Result is successful
      expect(result.success).toBe(true);
    });

    it('IssueClient_tryGenerateWithAgent_異常系_エージェント失敗', async () => {
      // Given: Agent generator fails
      const mockGeneratedIssue: GeneratedIssue = {
        success: false,
        title: '',
        body: '',
        error: 'Agent execution failed',
      };

      mockAgentGenerator.generate.mockResolvedValue(mockGeneratedIssue);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({
        data: { number: 456, html_url: 'https://github.com/owner/repo/issues/456' },
      } as any);

      // When: tryGenerateWithAgent is called
      const result = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Agent generator is called
      expect(mockAgentGenerator.generate).toHaveBeenCalledTimes(1);

      // And: Fallback succeeds, issue is created
      expect(mockOctokit.issues.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('Agent generator not configured', () => {
    it('IssueClient_tryGenerateWithAgent_異常系_Generator未設定', async () => {
      // Given: IssueClient without agent generator
      const issueClientWithoutAgent = new IssueClient(
        mockOctokit,
        'owner',
        'repo',
        null, // issueAIGenerator
        null, // issueAgentGenerator (not configured)
      );

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // @ts-expect-error - Mock setup requires any type
      (mockOctokit.issues.create as unknown as jest.Mock).mockResolvedValue({
        data: { number: 456, html_url: 'https://github.com/owner/repo/issues/456' },
      } as any);

      // When: Create issue with agent mode but agent generator not configured
      const result = await issueClientWithoutAgent.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT_NORMAL,
        options,
      );

      // Then: Fallback to template generation
      expect(mockOctokit.issues.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
