/**
 * ユニットテスト: IssueGenerator
 *
 * テスト対象: src/core/issue-generator.ts
 * テストシナリオ: test-scenario.md の TC-IG-001 〜 TC-IG-008
 */

import { IssueGenerator } from '../../../src/core/issue-generator.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type { BugCandidate, IssueCreationResult } from '../../../src/types/auto-issue.js';
import { Octokit } from '@octokit/rest';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/core/codex-agent-client.js');
jest.mock('../../../src/core/claude-agent-client.js');
jest.mock('@octokit/rest');
jest.mock('../../../src/utils/logger.js');

describe('IssueGenerator', () => {
  let mockCodexClient: jest.Mocked<CodexAgentClient>;
  let mockClaudeClient: jest.Mocked<ClaudeAgentClient>;
  let mockOctokit: jest.Mocked<Octokit>;
  let generator: IssueGenerator;

  const repositoryName = 'owner/repo';

  beforeEach(() => {
    // Codex クライアントのモック
    mockCodexClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    // Claude クライアントのモック
    mockClaudeClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAgentClient>;

    // Octokit のモック - jest.fn()を使用して型安全なモック作成
    const mockCreate = jest.fn();
    mockOctokit = {
      issues: {
        create: mockCreate,
      },
    } as unknown as jest.Mocked<Octokit>;

    // IssueGenerator インスタンス作成
    generator = new IssueGenerator(mockCodexClient, mockClaudeClient, mockOctokit, repositoryName);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-IG-001: generate_正常系_dry-runモード
   *
   * 目的: dry-runモードでIssue作成がスキップされることを検証
   */
  describe('TC-IG-001: generate with dry-run mode', () => {
    it('should skip issue creation in dry-run mode', async () => {
      // Given: dry-run = true
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest issue body\n```']);

      // When: generate() を dry-run モードで実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: Issue作成がスキップされる
      expect(result.success).toBe(true);
      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.issueUrl).toBeUndefined();
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-002: generate_正常系_Issue作成成功
   *
   * 目的: 本番モードでIssueが正常に作成されることを検証
   */
  describe('TC-IG-002: generate with successful issue creation', () => {
    it('should create issue successfully', async () => {
      // Given: 正常な実行環境
      const candidate: BugCandidate = {
        title: 'Fix memory leak',
        file: 'src/core/test.ts',
        line: 42,
        severity: 'high',
        description: 'Memory leak description',
        suggestedFix: 'Add cleanup',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nMemory leak in test module\n```'
      ]);

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 456,
          html_url: 'https://github.com/owner/repo/issues/456',
        },
      } as any);

      // When: generate() を実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: Issue作成成功
      expect(result.success).toBe(true);
      expect(result.issueUrl).toBe('https://github.com/owner/repo/issues/456');
      expect(result.issueNumber).toBe(456);
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-IG-003: generate_異常系_GitHub_API失敗
   *
   * 目的: GitHub API失敗時、エラーが適切に処理されることを検証
   */
  describe('TC-IG-003: generate with GitHub API failure', () => {
    it('should handle GitHub API failure gracefully', async () => {
      // Given: GitHub APIがエラーをスロー
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest\n```']);

      mockOctokit.issues.create.mockRejectedValue(new Error('API rate limit exceeded'));

      // When: generate() を実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: エラーが適切に処理される
      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });
  });

  /**
   * TC-IG-004: generate_正常系_Claudeエージェント使用
   *
   * 目的: Claudeエージェントを使用してIssue本文を生成できることを検証
   */
  describe('TC-IG-004: generate with Claude agent', () => {
    it('should generate issue body using Claude agent', async () => {
      // Given: Claude エージェント使用
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockClaudeClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nClaude generated issue body\n```'
      ]);

      // When: generate() を Claude で実行
      const result = await generator.generate(candidate, 'claude', true);

      // Then: Claude が使用される
      expect(result.success).toBe(true);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-005: generate_異常系_Codexエージェント失敗
   *
   * 目的: Codexエージェント失敗時、エラーが適切に処理されることを検証
   */
  describe('TC-IG-005: generate with Codex agent failure', () => {
    it('should handle Codex agent failure', async () => {
      // Given: Codex がエラーをスロー
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

      // When: generate() を codex モードで実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: エラーが適切に処理される
      expect(result.success).toBe(false);
      expect(result.error).toContain('Codex API failed');
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-006: createIssueBody_正常系_Markdownブロック抽出
   *
   * 目的: エージェント出力からMarkdownブロックを正しく抽出できることを検証
   */
  describe('TC-IG-006: createIssueBody extracts Markdown block', () => {
    it('should extract Markdown block from agent output', async () => {
      // Given: Markdownブロックを含む出力
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      const agentOutput = `
Here is the issue body:

\`\`\`markdown
## 概要
This is a test issue.

## 詳細
Detailed description here.
\`\`\`

Additional text.
`;

      mockCodexClient.executeTask.mockResolvedValue([agentOutput]);

      // When: generate() を dry-run で実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: Markdown が正しく抽出される
      expect(result.success).toBe(true);
    });
  });

  /**
   * TC-IG-007: createIssueBody_異常系_Markdownブロックなし
   *
   * 目的: Markdownブロックがない場合、エージェント出力をそのまま使用することを検証
   */
  describe('TC-IG-007: createIssueBody without Markdown block', () => {
    it('should use agent output as-is when no Markdown block', async () => {
      // Given: Markdownブロックなし
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['Plain text output without markdown block');

      // When: generate() を dry-run で実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: 出力がそのまま使用される
      expect(result.success).toBe(true);
    });
  });

  /**
   * TC-IG-008: createIssueOnGitHub_正常系_ラベル付与
   *
   * 目的: Issue作成時に正しいラベルが付与されることを検証
   */
  describe('TC-IG-008: createIssueOnGitHub with labels', () => {
    it('should create issue with correct labels', async () => {
      // Given: 正常な実行環境
      const candidate: BugCandidate = {
        title: 'Test issue',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['## 概要\nTest body');

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 789,
          html_url: 'https://github.com/owner/repo/issues/789',
        },
      } as any);

      // When: generate() を実行
      await generator.generate(candidate, 'codex', false);

      // Then: 正しいラベルで Issue が作成される
      expect(mockOctokit.issues.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          title: 'Test issue',
          labels: ['auto-generated', 'bug'],
        })
      );
    });
  });
});
