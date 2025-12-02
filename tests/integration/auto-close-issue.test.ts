/**
 * インテグレーションテスト: auto-close-issue コマンド
 *
 * テスト対象: src/commands/auto-close-issue.ts、src/core/issue-inspector.ts との統合
 * テストシナリオ: test-scenario.md の TS-INT-001 〜 TS-INT-026
 */

import { handleAutoCloseIssueCommand } from '../../src/commands/auto-close-issue.js';
import { IssueInspector } from '../../src/core/issue-inspector.js';
import { IssueClient } from '../../src/core/github/issue-client.js';
import { jest } from '@jest/globals';

// モック関数の事前定義
const mockGetIssues = jest.fn<any>();
const mockGetIssue = jest.fn<any>();
const mockGetIssueCommentsDict = jest.fn<any>();
const mockCloseIssue = jest.fn<any>();
const mockPostComment = jest.fn<any>();
const mockAddLabels = jest.fn<any>();
const mockExecuteTask = jest.fn<any>();

// モック設定
jest.mock('../../src/core/github/issue-client.js', () => ({
  IssueClient: jest.fn().mockImplementation(() => ({
    getIssues: mockGetIssues,
    getIssue: mockGetIssue,
    getIssueCommentsDict: mockGetIssueCommentsDict,
    closeIssue: mockCloseIssue,
    postComment: mockPostComment,
    addLabels: mockAddLabels,
  })),
}));

jest.mock('../../src/commands/execute/agent-setup.js');
jest.mock('../../src/core/config.js');
jest.mock('../../src/utils/logger.js');
jest.mock('@octokit/rest');

describe('auto-close-issue integration tests', () => {
  beforeEach(async () => {
    // モック関数のクリア
    mockGetIssues.mockClear();
    mockGetIssue.mockClear();
    mockGetIssueCommentsDict.mockClear();
    mockCloseIssue.mockClear();
    mockPostComment.mockClear();
    mockAddLabels.mockClear();
    mockExecuteTask.mockClear();

    // デフォルトの動作設定
    mockGetIssues.mockResolvedValue([]);
    mockGetIssue.mockResolvedValue({
      number: 1,
      title: 'Test',
      body: 'Test',
      labels: [],
      created_at: '2024-12-01T00:00:00Z',
      updated_at: '2024-12-10T00:00:00Z',
      state: 'open',
    });
    mockGetIssueCommentsDict.mockResolvedValue([]);

    // config のモック
    const config = require('../../src/core/config.js');
    config.config = {
      getGitHubToken: jest.fn().mockReturnValue('test-token'),
      getGitHubRepository: jest.fn().mockReturnValue('owner/repo'),
      getHomeDir: jest.fn().mockReturnValue('/home/test'),
    };

    // agent-setup のモック
    const agentSetup = require('../../src/commands/execute/agent-setup.js');
    agentSetup.resolveAgentCredentials = jest.fn().mockReturnValue({
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: '/path/to/claude',
    });
    agentSetup.setupAgentClients = jest.fn().mockReturnValue({
      codexClient: { executeTask: mockExecuteTask },
      claudeClient: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TS-INT-001: Issue一覧取得
   *
   * 目的: GitHub APIを使用してオープンIssue一覧が正しく取得できることを検証
   */
  describe('TS-INT-001: Get issues list', () => {
    it('should fetch open issues from GitHub API', async () => {
      // Given: GitHub API がオープンIssueを返す
      mockGetIssues.mockResolvedValue([
        {
          number: 1,
          title: '[FOLLOW-UP] Test Issue 1',
          body: 'Test body 1',
          labels: [{ name: 'enhancement' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: '[FOLLOW-UP] Test Issue 2',
          body: 'Test body 2',
          labels: [{ name: 'bug' }],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-11-05T00:00:00Z',
          state: 'open',
        },
      ]);

      // When: handleAutoCloseIssueCommand を実行
      await handleAutoCloseIssueCommand({ dryRun: true });

      // Then: getIssues が呼び出される
      expect(mockGetIssues).toHaveBeenCalledWith(100);
    });
  });

  /**
   * TS-INT-002: Issue詳細情報取得（コメント履歴含む）
   *
   * 目的: GitHub APIを使用してIssue詳細情報とコメント履歴が正しく取得できることを検証
   */
  describe('TS-INT-002: Get issue details with comments', () => {
    it('should fetch issue details including comments', async () => {
      // Given: GitHub API がIssue詳細とコメントを返す
      mockGetIssues.mockResolvedValue([
        {
          number: 123,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 123,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([
        {
          id: 1,
          user: 'user1',
          created_at: '2024-11-05T00:00:00Z',
          body: 'Comment 1',
        },
        {
          id: 2,
          user: 'user2',
          created_at: '2024-11-10T00:00:00Z',
          body: 'Comment 2',
        },
      ]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 123,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'Test comment',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を実行
      await handleAutoCloseIssueCommand({ dryRun: true });

      // Then: getIssue と getIssueCommentsDict が呼び出される
      expect(mockGetIssue).toHaveBeenCalledWith(123);
      expect(mockGetIssueCommentsDict).toHaveBeenCalledWith(123);
    });
  });

  /**
   * TS-INT-003: Issueクローズ処理
   *
   * 目的: GitHub APIを使用してIssueが正しくクローズされることを検証
   */
  describe('TS-INT-003: Close issue', () => {
    it('should close issue via GitHub API', async () => {
      // Given: GitHub API がオープンIssueを返す
      mockGetIssues.mockResolvedValue([
        {
          number: 123,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 123,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 123,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'Test close comment',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を dry-run=false で実行
      await handleAutoCloseIssueCommand({ dryRun: false });

      // Then: closeIssue が呼び出される
      expect(mockCloseIssue).toHaveBeenCalledWith(123);
    });
  });

  /**
   * TS-INT-004: コメント投稿処理
   *
   * 目的: GitHub APIを使用してコメントが正しく投稿されることを検証
   */
  describe('TS-INT-004: Post comment', () => {
    it('should post comment via GitHub API', async () => {
      // Given: GitHub API がオープンIssueを返す
      mockGetIssues.mockResolvedValue([
        {
          number: 123,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 123,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 123,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'このIssueは対応完了のためクローズします。',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を dry-run=false で実行
      await handleAutoCloseIssueCommand({ dryRun: false });

      // Then: postComment が呼び出される
      expect(mockPostComment).toHaveBeenCalledWith(123, 'このIssueは対応完了のためクローズします。');
    });
  });

  /**
   * TS-INT-005: ラベル付与処理
   *
   * 目的: GitHub APIを使用してラベルが正しく付与されることを検証
   */
  describe('TS-INT-005: Add labels', () => {
    it('should add labels via GitHub API', async () => {
      // Given: GitHub API がオープンIssueを返す
      mockGetIssues.mockResolvedValue([
        {
          number: 123,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 123,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 123,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'Test comment',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を dry-run=false で実行
      await handleAutoCloseIssueCommand({ dryRun: false });

      // Then: addLabels が呼び出される
      expect(mockAddLabels).toHaveBeenCalledWith(123, ['auto-closed']);
    });
  });

  /**
   * TS-INT-013: エンドツーエンドの検品フロー（正常系）
   *
   * 目的: Issue一覧取得 → カテゴリフィルタ → エージェント検品 → クローズ判定の
   *       全フローが正常に動作することを検証
   */
  describe('TS-INT-013: End-to-end inspection flow', () => {
    it('should execute complete workflow successfully', async () => {
      // Given: 3件のオープンIssue
      mockGetIssues.mockResolvedValue([
        {
          number: 1,
          title: '[FOLLOW-UP] Issue 1',
          body: 'Test body 1',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: '[FOLLOW-UP] Issue 2',
          body: 'Test body 2',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 3,
          title: '[FOLLOW-UP] Issue 3',
          body: 'Test body 3',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 1,
        title: '[FOLLOW-UP] Issue 1',
        body: 'Test body 1',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントの応答をモック
      // Issue #1: close, confidence 0.85
      // Issue #2: keep, confidence 0.80
      // Issue #3: close, confidence 0.65
      mockExecuteTask
        .mockResolvedValueOnce([
          JSON.stringify({
            issue_number: 1,
            recommendation: 'close',
            confidence: 0.85,
            reasoning: 'Test reasoning 1',
            close_comment: 'Test comment 1',
            suggested_actions: [],
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            issue_number: 2,
            recommendation: 'keep',
            confidence: 0.80,
            reasoning: 'Test reasoning 2',
            close_comment: '',
            suggested_actions: [],
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            issue_number: 3,
            recommendation: 'close',
            confidence: 0.65,
            reasoning: 'Test reasoning 3',
            close_comment: 'Test comment 3',
            suggested_actions: [],
          }),
        ]);

      // When: handleAutoCloseIssueCommand を実行（confidence閾値0.7）
      await handleAutoCloseIssueCommand({
        category: 'followup',
        confidenceThreshold: '0.7',
        dryRun: true,
      });

      // Then: Issue #1のみがクローズ候補として処理される
      // （Issue #2は keep、Issue #3は confidence < 0.7）
      expect(mockGetIssues).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * TS-INT-015: dry-runモード有効時（デフォルト）
   *
   * 目的: dry-runモード有効時、実際にはクローズされないことを検証
   */
  describe('TS-INT-015: Dry-run mode enabled', () => {
    it('should not close issues in dry-run mode', async () => {
      // Given: 1件のオープンIssue
      mockGetIssues.mockResolvedValue([
        {
          number: 1,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 1,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 1,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'Test comment',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を dry-run=true で実行
      await handleAutoCloseIssueCommand({ dryRun: true });

      // Then: closeIssue, postComment, addLabels が呼び出されない
      expect(mockCloseIssue).not.toHaveBeenCalled();
      expect(mockPostComment).not.toHaveBeenCalled();
      expect(mockAddLabels).not.toHaveBeenCalled();
    });
  });

  /**
   * TS-INT-016: dry-runモード無効時
   *
   * 目的: dry-runモード無効時、実際にクローズされることを検証
   */
  describe('TS-INT-016: Dry-run mode disabled', () => {
    it('should close issues when dry-run is disabled', async () => {
      // Given: 1件のオープンIssue
      mockGetIssues.mockResolvedValue([
        {
          number: 1,
          title: '[FOLLOW-UP] Test Issue',
          body: 'Test body',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ]);

      mockGetIssue.mockResolvedValue({
        number: 1,
        title: '[FOLLOW-UP] Test Issue',
        body: 'Test body',
        labels: [],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockGetIssueCommentsDict.mockResolvedValue([]);

      // エージェントがclose推奨を返すようモック設定
      const validJSON = JSON.stringify({
        issue_number: 1,
        recommendation: 'close',
        confidence: 0.85,
        reasoning: 'Test reasoning',
        close_comment: 'Test close comment',
        suggested_actions: [],
      });
      mockExecuteTask.mockResolvedValue([validJSON]);

      // When: handleAutoCloseIssueCommand を dry-run=false で実行
      await handleAutoCloseIssueCommand({ dryRun: false });

      // Then: closeIssue, postComment, addLabels が呼び出される
      expect(mockPostComment).toHaveBeenCalledWith(1, 'Test close comment');
      expect(mockAddLabels).toHaveBeenCalledWith(1, ['auto-closed']);
      expect(mockCloseIssue).toHaveBeenCalledWith(1);
    });
  });

  /**
   * TS-INT-022: 環境変数未設定エラー（GITHUB_TOKEN）
   *
   * 目的: GITHUB_TOKEN環境変数が未設定の場合、適切なエラーメッセージが表示されることを検証
   */
  describe('TS-INT-022: GITHUB_TOKEN not set', () => {
    it('should throw error when GITHUB_TOKEN is not set', async () => {
      // Given: GITHUB_TOKEN が未設定
      const config = require('../../src/core/config.js');
      config.config.getGitHubToken.mockImplementation(() => {
        throw new Error('GITHUB_TOKEN environment variable is required.');
      });

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(/GITHUB_TOKEN/);
    });
  });

  /**
   * TS-INT-023: 環境変数未設定エラー（GITHUB_REPOSITORY）
   *
   * 目的: GITHUB_REPOSITORY環境変数が未設定の場合、適切なエラーメッセージが表示されることを検証
   */
  describe('TS-INT-023: GITHUB_REPOSITORY not set', () => {
    it('should throw error when GITHUB_REPOSITORY is not set', async () => {
      // Given: GITHUB_REPOSITORY が未設定
      const config = require('../../src/core/config.js');
      config.config.getGitHubRepository.mockReturnValue(null);

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(
        /GITHUB_REPOSITORY environment variable is required/,
      );
    });
  });

  /**
   * TS-INT-024: エージェントAPIキー未設定エラー
   *
   * 目的: エージェントAPIキーが全て未設定の場合、適切なエラーメッセージが表示されることを検証
   */
  describe('TS-INT-024: Agent API key not set', () => {
    it('should throw error when no agent credentials are set', async () => {
      // Given: エージェントが両方とも null
      const agentSetup = require('../../src/commands/execute/agent-setup.js');
      agentSetup.setupAgentClients.mockReturnValue({
        codexClient: null,
        claudeClient: null,
      });

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({})).rejects.toThrow(
        /No agent credentials found/,
      );
    });
  });

  /**
   * TS-INT-025: CLIオプションバリデーションエラー
   *
   * 目的: 無効なCLIオプション指定時、適切なエラーメッセージが表示されることを検証
   */
  describe('TS-INT-025: CLI option validation error', () => {
    it('should throw error for invalid limit option', async () => {
      // Given: 無効な limit オプション
      const invalidLimit = '100';

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({ limit: invalidLimit })).rejects.toThrow(
        /--limit must be between 1 and 50/,
      );
    });
  });
});
