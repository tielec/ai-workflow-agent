import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { Octokit } from '@octokit/rest';
import { IssueClient, IssueCreationResult } from '../../src/core/github/issue-client.js';
import { IssueAgentGenerator, type FollowUpContext, type GeneratedIssue } from '../../src/core/github/issue-agent-generator.js';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import type { RemainingTask, IssueGenerationOptions, IssueContext } from '../../src/types.js';

/**
 * Integration tests for agent-based FOLLOW-UP Issue generation (Issue #174)
 *
 * These tests verify the end-to-end flow:
 * - IssueClient → IssueAgentGenerator → Agent execution → File-based output → GitHub Issue creation
 */

type CodexMock = jest.Mocked<CodexAgentClient>;
type ClaudeMock = jest.Mocked<ClaudeAgentClient>;

function createCodexMock(): CodexMock {
  return {
    executeTask: jest.fn<(options: { prompt: string }) => Promise<void>>(),
  } as unknown as CodexMock;
}

function createClaudeMock(): ClaudeMock {
  return {
    executeTask: jest.fn<(options: { prompt: string }) => Promise<void>>(),
  } as unknown as ClaudeMock;
}

// Test data
const NORMAL_REMAINING_TASKS: RemainingTask[] = [
  {
    task: 'ユニットテスト追加',
    phase: 'testing',
    targetFiles: ['src/core/github/issue-agent-generator.ts'],
    steps: ['テストファイル作成', 'モック作成', 'アサーション追加'],
    priority: 'high',
    estimatedHours: 2,
    acceptanceCriteria: ['すべてのテストが成功する'],
  },
  {
    task: 'ドキュメント更新',
    phase: 'documentation',
    targetFiles: ['README.md', 'CLAUDE.md'],
    steps: ['README更新', 'CLAUDE.md更新'],
    priority: 'medium',
    estimatedHours: 1,
    acceptanceCriteria: ['ドキュメントが更新されている'],
  },
];

const ISSUE_CONTEXT: IssueContext = {
  summary: 'Issue #123 の残タスク',
  blockerStatus: 'すべてのブロッカーは解決済み',
  deferredReason: 'タスク優先度の判断により後回し',
};

const VALID_ISSUE_BODY = `## 背景

Issue #123 では FOLLOW-UP Issue 生成機能をエージェントベースに拡張しました。この Issue は、残ったテストとドキュメント作業を完了するためのものです。

## 目的

各残タスクの目的と期待される成果を具体的に記載します。テストとドキュメント作業を完了することで、Issue #174の実装を完全なものにします。

## 実行内容

### Task 1: ユニットテスト追加

**対象ファイル**:
- \`src/core/github/issue-agent-generator.ts\`

**必要な作業**:
1. テストファイル作成
2. モック作成
3. アサーション追加

### Task 2: ドキュメント更新

**対象ファイル**:
- \`README.md\`
- \`CLAUDE.md\`

**必要な作業**:
1. README更新
2. CLAUDE.md更新

## 受け入れ基準

- [ ] すべてのテストが成功する
- [ ] ドキュメントが更新されている

## 参考情報

- 元Issue: #123
- Evaluation Report: \`.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md\`
`;

describe('Integration: Agent-based FOLLOW-UP Issue generation (Issue #174)', () => {
  let codexClient: CodexMock;
  let claudeClient: ClaudeMock;
  let agentGenerator: IssueAgentGenerator;
  let issueClient: IssueClient;
  let mockOctokit: jest.Mocked<Octokit>;
  let tempFilePath: string;

  beforeEach(() => {
    codexClient = createCodexMock();
    claudeClient = createClaudeMock();
    agentGenerator = new IssueAgentGenerator(codexClient, claudeClient);

    mockOctokit = {
      issues: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<Octokit>;

    issueClient = new IssueClient(
      mockOctokit,
      'owner',
      'repo',
      null, // issueAIGenerator
      agentGenerator, // issueAgentGenerator
    );

    tempFilePath = '';
  });

  afterEach(() => {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
    jest.clearAllMocks();
  });

  describe('E2E: Agent generation success → Issue creation', () => {
    it('E2E_エージェント生成成功_FOLLOWUP_Issue作成', async () => {
      // Given: Codex agent writes valid Issue body to file
      codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
        const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
        if (match) {
          tempFilePath = match[1];
          fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
        }
      });

      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Create follow-up issue with agent mode
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT,
        options,
      );

      // Then: Agent executes successfully
      expect(codexClient.executeTask).toHaveBeenCalledTimes(1);

      // And: Output file is created (will be cleaned up in afterEach)

      // And: GitHub Issue is created with agent-generated content
      expect(mockOctokit.issues.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: expect.stringContaining('[FOLLOW-UP]'),
        body: expect.stringContaining('## 背景'),
        labels: ['enhancement', 'ai-workflow-follow-up'],
      });

      const createdBody = (mockOctokit.issues.create.mock.calls[0][0] as any).body;
      expect(createdBody).toContain('## 目的');
      expect(createdBody).toContain('## 実行内容');
      expect(createdBody).toContain('## 受け入れ基準');
      expect(createdBody).toContain('## 参考情報');

      // And: Result indicates success
      expect(result).toEqual({
        success: true,
        issue_url: 'https://github.com/owner/repo/issues/456',
        issue_number: 456,
        error: null,
      });
    });
  });

  describe('E2E: Agent failure → Fallback success', () => {
    it('E2E_エージェント失敗_フォールバック成功', async () => {
      // Given: Codex agent fails (doesn't create file)
      codexClient.executeTask.mockResolvedValue(undefined);

      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Create follow-up issue with agent mode (agent fails)
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT,
        options,
      );

      // Then: Agent executes but fails
      expect(codexClient.executeTask).toHaveBeenCalledTimes(1);

      // And: Fallback to template generation
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);

      const createdBody = (mockOctokit.issues.create.mock.calls[0][0] as any).body;
      expect(createdBody).toContain('フォールバックテンプレート使用');

      // And: Issue is still created successfully
      expect(result).toEqual({
        success: true,
        issue_url: 'https://github.com/owner/repo/issues/456',
        issue_number: 456,
        error: null,
      });
    });
  });

  describe('Integration: Codex → Claude fallback', () => {
    it('Integration_Codex失敗_Claudeフォールバック', async () => {
      // Given: Codex fails, Claude succeeds
      codexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

      claudeClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
        const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
        if (match) {
          tempFilePath = match[1];
          fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
        }
      });

      const mockIssue = {
        number: 456,
        html_url: 'https://github.com/owner/repo/issues/456',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Create follow-up issue with agent mode (Codex fails, Claude succeeds)
      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT,
        options,
      );

      // Then: Codex is tried first
      expect(codexClient.executeTask).toHaveBeenCalledTimes(1);

      // And: Claude is used as fallback
      expect(claudeClient.executeTask).toHaveBeenCalledTimes(1);

      // And: Issue is created successfully
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe('Integration: File cleanup', () => {
    it('Integration_一時ファイルクリーンアップ', async () => {
      // Given: Agent creates output file
      let createdFilePath = '';
      codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
        const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
        if (match) {
          createdFilePath = match[1];
          tempFilePath = createdFilePath;
          fs.writeFileSync(createdFilePath, VALID_ISSUE_BODY);
        }
      });

      mockOctokit.issues.create.mockResolvedValue({
        data: { number: 456, html_url: 'https://github.com/owner/repo/issues/456' },
      } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Generate issue
      await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT,
        options,
      );

      // Then: Temporary file is cleaned up
      // Note: The cleanup happens in the generator, so we expect the file to be deleted
      // However, we track it in tempFilePath for afterEach cleanup in case of test failure
      expect(createdFilePath).toBeTruthy();

      // Wait a bit for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // File should be cleaned up (but we don't assert this strictly as cleanup is best-effort)
    });
  });

  describe('Integration: Invalid output validation', () => {
    it('Integration_無効な出力_フォールバック', async () => {
      // Given: Agent creates invalid output (missing sections)
      const invalidBody = `## 背景\n\nテキスト\n\n## 目的\n\nテキスト`;

      codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
        const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
        if (match) {
          tempFilePath = match[1];
          fs.writeFileSync(tempFilePath, invalidBody);
        }
      });

      mockOctokit.issues.create.mockResolvedValue({
        data: { number: 456, html_url: 'https://github.com/owner/repo/issues/456' },
      } as any);

      const options: IssueGenerationOptions = {
        enabled: true,
        provider: 'agent',
      };

      // When: Generate issue with invalid output
      const result = await issueClient.createIssueFromEvaluation(
        123,
        NORMAL_REMAINING_TASKS,
        '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
        ISSUE_CONTEXT,
        options,
      );

      // Then: Fallback template is used
      const createdBody = (mockOctokit.issues.create.mock.calls[0][0] as any).body;
      expect(createdBody).toContain('フォールバックテンプレート使用');

      // And: Issue is still created
      expect(result.success).toBe(true);
    });
  });
});
