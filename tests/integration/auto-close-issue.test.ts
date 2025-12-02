/**
 * Integration tests for auto-close-issue command
 *
 * Tests GitHub API連携、エージェント統合、エンドツーエンドフロー
 */

import { Octokit } from '@octokit/rest';
import { IssueClient } from '../../src/core/github/issue-client.js';
import { IssueInspector } from '../../src/core/issue-inspector.js';
import type { Issue, InspectionOptions } from '../../src/types/auto-close-issue.js';

// Octokitのモック
jest.mock('@octokit/rest');

describe('auto-close-issue integration tests', () => {
  let mockOctokit: jest.Mocked<Octokit>;
  let issueClient: IssueClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Octokitモックの設定
    mockOctokit = {
      rest: {
        issues: {
          get: jest.fn(),
          listComments: jest.fn(),
          list: jest.fn(),
          update: jest.fn(),
          createComment: jest.fn(),
          addLabels: jest.fn(),
        },
      },
    } as any;

    issueClient = new IssueClient(mockOctokit, 'owner', 'repo');
  });

  describe('TS-INT-001: Issue一覧取得', () => {
    it('should fetch open issues from GitHub API', async () => {
      // Given: GitHub APIクライアントが初期化されている
      const mockIssues = [
        {
          number: 1,
          title: '[FOLLOW-UP] Add logging',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: 'Bug: Login failure',
          body: 'Issue body',
          labels: [{ name: 'bug' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-11-05T00:00:00Z',
          state: 'open',
        },
      ];

      mockOctokit.rest.issues.list.mockResolvedValue({
        data: mockIssues,
      } as any);

      // When: Issue一覧を取得
      const issues = await issueClient.getIssues(100);

      // Then: Issue配列が返される
      expect(issues).toHaveLength(2);
      expect(issues[0].number).toBe(1);
      expect(issues[0].title).toBe('[FOLLOW-UP] Add logging');
      expect(issues[1].number).toBe(2);

      // GitHub APIの呼び出しを確認
      expect(mockOctokit.rest.issues.list).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'open',
        per_page: 100,
      });
    });
  });

  describe('TS-INT-002: Issue詳細情報取得（コメント履歴含む）', () => {
    it('should fetch issue details with comment history', async () => {
      // Given: GitHub APIクライアントが初期化されている
      const mockIssue = {
        number: 123,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      };

      const mockComments = [
        {
          id: 1,
          user: { login: 'user1' },
          created_at: '2024-11-05T00:00:00Z',
          body: 'Comment 1',
        },
        {
          id: 2,
          user: { login: 'user2' },
          created_at: '2024-11-10T00:00:00Z',
          body: 'Comment 2',
        },
      ];

      mockOctokit.rest.issues.get.mockResolvedValue({
        data: mockIssue,
      } as any);

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: mockComments,
      } as any);

      // When: Issue詳細情報を取得
      const issue = await issueClient.getIssue(123);
      const comments = await issueClient.getIssueCommentsDict(123);

      // Then: Issue詳細とコメント配列が返される
      expect(issue.number).toBe(123);
      expect(comments).toHaveLength(2);
      expect(comments[0].user).toBe('user1');
      expect(comments[1].user).toBe('user2');

      // GitHub API呼び出しを確認
      expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
      });

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
      });
    });
  });

  describe('TS-INT-003: Issueクローズ処理', () => {
    it('should close issue via GitHub API', async () => {
      // Given: GitHub APIクライアントが初期化されている
      mockOctokit.rest.issues.update.mockResolvedValue({
        data: {
          number: 123,
          state: 'closed',
        },
      } as any);

      // When: Issueをクローズ
      await issueClient.closeIssue(123);

      // Then: GitHub APIのPATCH呼び出しが実行される
      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
        state: 'closed',
      });
    });
  });

  describe('TS-INT-004: コメント投稿処理', () => {
    it('should post comment via GitHub API', async () => {
      // Given: GitHub APIクライアントが初期化されている
      const commentBody = 'このIssueは対応完了のためクローズします。';

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: {
          id: 456,
          body: commentBody,
        },
      } as any);

      // When: コメントを投稿
      await issueClient.postComment(123, commentBody);

      // Then: GitHub APIのPOST呼び出しが実行される
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
        body: commentBody,
      });
    });
  });

  describe('TS-INT-005: ラベル付与処理', () => {
    it('should add labels via GitHub API', async () => {
      // Given: GitHub APIクライアントが初期化されている
      mockOctokit.rest.issues.addLabels.mockResolvedValue({
        data: [],
      } as any);

      // When: ラベルを付与
      await issueClient.addLabels(123, ['auto-closed']);

      // Then: GitHub APIのPOST呼び出しが実行される
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
        labels: ['auto-closed'],
      });
    });
  });

  describe('TS-INT-006: GitHub APIエラーハンドリング（認証エラー）', () => {
    it('should handle 401 authentication error', async () => {
      // Given: GitHub APIが401エラーを返す
      mockOctokit.rest.issues.list.mockRejectedValue({
        status: 401,
        message: 'Bad credentials',
      });

      // When: Issue一覧取得を試みる
      // Then: エラーがスローされる
      await expect(issueClient.getIssues(100)).rejects.toThrow();
    });
  });

  describe('TS-INT-007: GitHub APIエラーハンドリング（レート制限）', () => {
    it('should handle 403 rate limit error', async () => {
      // Given: GitHub APIが403エラー（レート制限）を返す
      mockOctokit.rest.issues.list.mockRejectedValue({
        status: 403,
        message: 'API rate limit exceeded',
      });

      // When: Issue一覧取得を試みる
      // Then: エラーがスローされる
      await expect(issueClient.getIssues(100)).rejects.toThrow();
    });
  });

  describe('TS-INT-008: Codexエージェント実行（正常系）', () => {
    it('should execute agent and return JSON output', async () => {
      // Given: Codex AgentExecutorが初期化されている
      const mockAgentExecutor = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            issue_number: 123,
            recommendation: 'close',
            confidence: 0.85,
            reasoning: '元Issueクローズ済み、ログ機能実装済み',
            close_comment: 'このIssueは対応完了のためクローズします。',
            suggested_actions: [],
          }),
        ]),
      };

      mockOctokit.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: '[FOLLOW-UP] Add logging',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
      } as any);

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const inspector = new IssueInspector(mockAgentExecutor as any, issueClient, 'owner', 'repo');

      const testIssue: Issue = {
        number: 123,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        state: 'open',
      };

      const options: InspectionOptions = {
        confidenceThreshold: 0.7,
        excludeLabels: ['do-not-close', 'pinned'],
        agent: 'codex',
      };

      // When: エージェント検品を実行
      const result = await inspector.inspectIssue(testIssue, options);

      // Then: JSON形式の検品結果が返される
      expect(result).not.toBeNull();
      expect(result?.recommendation).toBe('close');
      expect(result?.confidence).toBe(0.85);
      expect(mockAgentExecutor.executeTask).toHaveBeenCalled();
    });
  });

  describe('TS-INT-011: エージェント実行失敗時のスキップ動作', () => {
    it('should skip issue when agent execution fails', async () => {
      // Given: エージェント実行がタイムアウトエラー
      const mockAgentExecutor = {
        executeTask: jest.fn().mockRejectedValue(new Error('Agent execution timeout')),
      };

      mockOctokit.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: '[FOLLOW-UP] Add logging',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
      } as any);

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const inspector = new IssueInspector(mockAgentExecutor as any, issueClient, 'owner', 'repo');

      const testIssue: Issue = {
        number: 123,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        state: 'open',
      };

      const options: InspectionOptions = {
        confidenceThreshold: 0.7,
        excludeLabels: ['do-not-close', 'pinned'],
        agent: 'auto',
      };

      // When: エージェント検品を実行
      const result = await inspector.inspectIssue(testIssue, options);

      // Then: nullが返される（スキップ）
      expect(result).toBeNull();
    });
  });

  describe('TS-INT-012: エージェントJSON parseエラー時のスキップ動作', () => {
    it('should skip issue when agent output is invalid JSON', async () => {
      // Given: エージェントが不正なJSON出力を返す
      const mockAgentExecutor = {
        executeTask: jest.fn().mockResolvedValue(['{ invalid json output }']),
      };

      mockOctokit.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: '[FOLLOW-UP] Add logging',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
      } as any);

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const inspector = new IssueInspector(mockAgentExecutor as any, issueClient, 'owner', 'repo');

      const testIssue: Issue = {
        number: 123,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        state: 'open',
      };

      const options: InspectionOptions = {
        confidenceThreshold: 0.7,
        excludeLabels: ['do-not-close', 'pinned'],
        agent: 'auto',
      };

      // When: エージェント検品を実行
      const result = await inspector.inspectIssue(testIssue, options);

      // Then: nullが返される（JSON parseエラーでスキップ）
      expect(result).toBeNull();
    });
  });

  describe('TS-INT-013: エンドツーエンドの検品フロー（正常系）', () => {
    it('should process issues through complete inspection flow', async () => {
      // Given: 3件のオープンIssueが存在する
      const mockIssues = [
        {
          number: 1,
          title: '[FOLLOW-UP] Add logging',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
        {
          number: 2,
          title: '[FOLLOW-UP] Refactor API',
          body: 'Issue body',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
        {
          number: 3,
          title: '[FOLLOW-UP] Update docs',
          body: 'Issue body',
          labels: [{ name: 'documentation' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          state: 'open',
        },
      ];

      mockOctokit.rest.issues.list.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.rest.issues.get.mockResolvedValue({
        data: mockIssues[0],
      } as any);

      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      // When: Issue一覧を取得
      const issues = await issueClient.getIssues(100);

      // Then: 3件全てが返される
      expect(issues).toHaveLength(3);
      expect(issues[0].number).toBe(1);
      expect(issues[1].number).toBe(2);
      expect(issues[2].number).toBe(3);
    });
  });

  describe('TS-INT-014: エンドツーエンドの検品フロー（複数Issue処理）', () => {
    it('should close multiple issues with proper API calls', async () => {
      // Given: 5件のオープンIssueが存在する
      const mockIssues = Array.from({ length: 5 }, (_, i) => ({
        number: i + 1,
        title: `[FOLLOW-UP] Issue ${i + 1}`,
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        state: 'open',
      }));

      mockOctokit.rest.issues.list.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.rest.issues.update.mockResolvedValue({
        data: { state: 'closed' },
      } as any);

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 456 },
      } as any);

      mockOctokit.rest.issues.addLabels.mockResolvedValue({
        data: [],
      } as any);

      // When: 5件のIssueをクローズ
      for (const issue of mockIssues) {
        await issueClient.closeIssue(issue.number);
        await issueClient.postComment(issue.number, 'このIssueは対応完了のためクローズします。');
        await issueClient.addLabels(issue.number, ['auto-closed']);
      }

      // Then: 各API呼び出しが5回実行される
      expect(mockOctokit.rest.issues.update).toHaveBeenCalledTimes(5);
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(5);
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledTimes(5);
    });
  });

  describe('TS-INT-015: dry-runモード有効時（デフォルト）', () => {
    it('should not close issues in dry-run mode', async () => {
      // Given: dry-runモードが有効
      const mockIssue = {
        number: 1,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        state: 'open',
      };

      mockOctokit.rest.issues.list.mockResolvedValue({
        data: [mockIssue],
      } as any);

      // When: Issue一覧を取得（dry-runモードでは実際のクローズAPIは呼ばない）
      const issues = await issueClient.getIssues(100);

      // Then: Issue一覧は取得されるが、closeIssue/postComment/addLabelsは呼ばれない
      expect(issues).toHaveLength(1);
      expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
    });
  });

  describe('TS-INT-016: dry-runモード無効時', () => {
    it('should actually close issues when dry-run is disabled', async () => {
      // Given: dry-runモードが無効
      mockOctokit.rest.issues.update.mockResolvedValue({
        data: { number: 1, state: 'closed' },
      } as any);

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 456 },
      } as any);

      mockOctokit.rest.issues.addLabels.mockResolvedValue({
        data: [],
      } as any);

      // When: Issueをクローズ
      await issueClient.closeIssue(1);
      await issueClient.postComment(1, 'このIssueは対応完了のためクローズします。');
      await issueClient.addLabels(1, ['auto-closed']);

      // Then: 全てのAPI呼び出しが実行される
      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        state: 'closed',
      });
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'このIssueは対応完了のためクローズします。',
      });
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        labels: ['auto-closed'],
      });
    });
  });
});
