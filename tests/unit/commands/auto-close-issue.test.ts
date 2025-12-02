/**
 * ユニットテスト: auto-close-issue コマンドハンドラ
 *
 * テスト対象: src/commands/auto-close-issue.ts
 * テストシナリオ: test-scenario.md の TS-UNIT-001 〜 TS-UNIT-029
 */

import {
  handleAutoCloseIssueCommand,
  filterByCategory,
} from '../../../src/commands/auto-close-issue.js';
import type {
  AutoCloseIssueOptions,
  Issue,
  IssueCategory,
} from '../../../src/types/auto-close-issue.js';
import { IssueInspector } from '../../../src/core/issue-inspector.js';
import { IssueClient } from '../../../src/core/github/issue-client.js';
import { jest } from '@jest/globals';

// モック関数の事前定義
const mockInspectIssue = jest.fn<any>();
const mockGetIssues = jest.fn<any>();
const mockCloseIssue = jest.fn<any>();
const mockPostComment = jest.fn<any>();
const mockAddLabels = jest.fn<any>();

// モック設定
jest.mock('../../../src/core/issue-inspector.js', () => ({
  IssueInspector: jest.fn().mockImplementation(() => ({
    inspectIssue: mockInspectIssue,
  })),
}));

jest.mock('../../../src/core/github/issue-client.js', () => ({
  IssueClient: jest.fn().mockImplementation(() => ({
    getIssues: mockGetIssues,
    closeIssue: mockCloseIssue,
    postComment: mockPostComment,
    addLabels: mockAddLabels,
  })),
}));

jest.mock('../../../src/commands/execute/agent-setup.js');
jest.mock('../../../src/core/config.js');
jest.mock('../../../src/utils/logger.js');
jest.mock('@octokit/rest');

describe('auto-close-issue command handler', () => {
  beforeEach(async () => {
    // モック関数のクリア
    mockInspectIssue.mockClear();
    mockGetIssues.mockClear();
    mockCloseIssue.mockClear();
    mockPostComment.mockClear();
    mockAddLabels.mockClear();

    // デフォルトの動作設定
    mockGetIssues.mockResolvedValue([]);
    mockInspectIssue.mockResolvedValue(null);

    // config のモック
    const config = require('../../../src/core/config.js');
    config.config = {
      getGitHubToken: jest.fn().mockReturnValue('test-token'),
      getGitHubRepository: jest.fn().mockReturnValue('owner/repo'),
      getHomeDir: jest.fn().mockReturnValue('/home/test'),
    };

    // agent-setup のモック
    const agentSetup = require('../../../src/commands/execute/agent-setup.js');
    agentSetup.resolveAgentCredentials = jest.fn().mockReturnValue({
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: '/path/to/claude',
    });
    agentSetup.setupAgentClients = jest.fn().mockReturnValue({
      codexClient: {},
      claudeClient: {},
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TS-UNIT-001: デフォルト値の適用（正常系）
   *
   * 目的: CLIオプションが未指定の場合、適切なデフォルト値が設定されることを検証
   */
  describe('TS-UNIT-001: Default values application', () => {
    it('should apply default values when options are not specified', async () => {
      // Given: 空のオプション
      mockGetIssues.mockResolvedValue([]);

      // When: handleAutoCloseIssueCommand を実行
      await handleAutoCloseIssueCommand({});

      // Then: デフォルト値が適用される
      // getIssues が呼び出されることを確認（コマンドが実行されたことの証明）
      expect(mockGetIssues).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TS-UNIT-002: 全オプション指定（正常系）
   *
   * 目的: 全てのCLIオプションが正しくパースされることを検証
   */
  describe('TS-UNIT-002: All options specified', () => {
    it('should parse all options correctly', async () => {
      // Given: 全てのオプション指定
      const rawOptions = {
        category: 'stale',
        limit: '20',
        dryRun: false,
        confidenceThreshold: '0.8',
        daysThreshold: '120',
        requireApproval: false,
        excludeLabels: 'wontfix,duplicate',
        agent: 'codex' as const,
      };

      mockGetIssues.mockResolvedValue([]);

      // When: handleAutoCloseIssueCommand を実行
      await handleAutoCloseIssueCommand(rawOptions);

      // Then: オプションが正しくパースされる（エラーがスローされない）
      expect(mockGetIssues).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TS-UNIT-003: カテゴリオプションのバリデーション（境界値）
   *
   * 目的: categoryオプションが有効な値のみ受け付けることを検証
   */
  describe('TS-UNIT-003: Category option validation', () => {
    it('should accept valid category values', async () => {
      // Given: 有効な category 値
      const validCategories = ['followup', 'stale', 'old', 'all'];

      for (const category of validCategories) {
        mockGetIssues.mockClear();
        mockGetIssues.mockResolvedValue([]);

        // When: 各 category で実行
        await handleAutoCloseIssueCommand({ category });

        // Then: エラーがスローされない
        expect(mockGetIssues).toHaveBeenCalledTimes(1);
      }
    });

    it('should throw error for invalid category', async () => {
      // Given: 無効な category
      const invalidCategory = 'invalid';

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({ category: invalidCategory })).rejects.toThrow();
    });
  });

  /**
   * TS-UNIT-004: limit範囲外チェック（異常系）
   *
   * 目的: limitが範囲外（1-50）の場合、エラーがスローされることを検証
   */
  describe('TS-UNIT-004: Limit out of range check', () => {
    it('should throw error when limit is out of range', async () => {
      // Given: 範囲外の limit
      const outOfRangeLimits = ['0', '51', '-5'];

      for (const limit of outOfRangeLimits) {
        // When & Then: エラーがスローされる
        await expect(handleAutoCloseIssueCommand({ limit })).rejects.toThrow(/--limit must be between 1 and 50/);
      }
    });
  });

  /**
   * TS-UNIT-005: limit境界値チェック（境界値）
   *
   * 目的: limitの境界値（1, 50）が正常に受け付けられることを検証
   */
  describe('TS-UNIT-005: Limit boundary values', () => {
    it('should accept boundary values for limit', async () => {
      // Given: 境界値の limit
      const boundaryLimits = ['1', '50'];

      for (const limit of boundaryLimits) {
        mockGetIssues.mockClear();
        mockGetIssues.mockResolvedValue([]);

        // When: 境界値で実行
        await handleAutoCloseIssueCommand({ limit });

        // Then: エラーがスローされない
        expect(mockGetIssues).toHaveBeenCalledTimes(1);
      }
    });
  });

  /**
   * TS-UNIT-006: confidenceThreshold範囲外チェック（異常系）
   *
   * 目的: confidenceThresholdが範囲外（0.0-1.0）の場合、エラーがスローされることを検証
   */
  describe('TS-UNIT-006: ConfidenceThreshold out of range check', () => {
    it('should throw error when confidenceThreshold is out of range', async () => {
      // Given: 範囲外の confidenceThreshold
      const outOfRangeThresholds = ['-0.1', '1.1'];

      for (const threshold of outOfRangeThresholds) {
        // When & Then: エラーがスローされる
        await expect(
          handleAutoCloseIssueCommand({ confidenceThreshold: threshold }),
        ).rejects.toThrow(/--confidence-threshold must be between 0.0 and 1.0/);
      }
    });
  });

  /**
   * TS-UNIT-007: confidenceThreshold境界値チェック（境界値）
   *
   * 目的: confidenceThresholdの境界値（0.0, 1.0）が正常に受け付けられることを検証
   */
  describe('TS-UNIT-007: ConfidenceThreshold boundary values', () => {
    it('should accept boundary values for confidenceThreshold', async () => {
      // Given: 境界値の confidenceThreshold
      const boundaryThresholds = ['0.0', '1.0'];

      for (const threshold of boundaryThresholds) {
        mockGetIssues.mockClear();
        mockGetIssues.mockResolvedValue([]);

        // When: 境界値で実行
        await handleAutoCloseIssueCommand({ confidenceThreshold: threshold });

        // Then: エラーがスローされない
        expect(mockGetIssues).toHaveBeenCalledTimes(1);
      }
    });
  });

  /**
   * TS-UNIT-008: daysThreshold負の値チェック（異常系）
   *
   * 目的: daysThresholdが負の値の場合、エラーがスローされることを検証
   */
  describe('TS-UNIT-008: DaysThreshold negative value check', () => {
    it('should throw error when daysThreshold is negative', async () => {
      // Given: 負の値の daysThreshold
      const negativeDays = '-10';

      // When & Then: エラーがスローされる
      await expect(handleAutoCloseIssueCommand({ daysThreshold: negativeDays })).rejects.toThrow(
        /--days-threshold must be a positive integer/,
      );
    });
  });

  /**
   * TS-UNIT-009: followupカテゴリフィルタ（正常系）
   *
   * 目的: followupカテゴリで、タイトルが `[FOLLOW-UP]` で始まるIssueのみが抽出されることを検証
   */
  describe('TS-UNIT-009: Followup category filter', () => {
    it('should filter issues starting with [FOLLOW-UP]', () => {
      // Given: 複数のIssue
      const issues: Issue[] = [
        {
          number: 1,
          title: '[FOLLOW-UP] Add logging',
          body: '',
          labels: [],
          created_at: '2024-12-01T00:00:00Z',
          updated_at: '2024-12-10T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: 'Bug: Login failure',
          body: '',
          labels: [],
          created_at: '2024-11-01T00:00:00Z',
          updated_at: '2024-11-05T00:00:00Z',
          state: 'open',
        },
        {
          number: 3,
          title: '[FOLLOW-UP] Refactor API',
          body: '',
          labels: [],
          created_at: '2024-12-15T00:00:00Z',
          updated_at: '2024-12-20T00:00:00Z',
          state: 'open',
        },
      ];

      // When: followup フィルタを適用
      const filtered = filterByCategory(issues, 'followup', 90);

      // Then: FOLLOW-UP で始まる Issue のみが返される
      expect(filtered).toHaveLength(2);
      expect(filtered[0].number).toBe(1);
      expect(filtered[1].number).toBe(3);
    });
  });

  /**
   * TS-UNIT-010: staleカテゴリフィルタ（正常系）
   *
   * 目的: staleカテゴリで、最終更新から90日以上経過したIssueのみが抽出されることを検証
   */
  describe('TS-UNIT-010: Stale category filter', () => {
    it('should filter issues not updated for 90+ days', () => {
      // Given: 複数のIssue（現在日時を2025-01-30と仮定）
      const now = new Date('2025-01-30T00:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation((() => now) as any);

      const issues: Issue[] = [
        {
          number: 1,
          title: 'Issue 1',
          body: '',
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-10-01T00:00:00Z', // 121日前更新
          state: 'open',
        },
        {
          number: 2,
          title: 'Issue 2',
          body: '',
          labels: [],
          created_at: '2024-05-01T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z', // 10日前更新
          state: 'open',
        },
        {
          number: 3,
          title: 'Issue 3',
          body: '',
          labels: [],
          created_at: '2024-03-01T00:00:00Z',
          updated_at: '2024-09-01T00:00:00Z', // 151日前更新
          state: 'open',
        },
      ];

      // When: stale フィルタを適用
      const filtered = filterByCategory(issues, 'stale', 90);

      // Then: 90日以上経過した Issue のみが返される
      expect(filtered).toHaveLength(2);
      expect(filtered[0].number).toBe(1);
      expect(filtered[1].number).toBe(3);

      // モックをリストア
      jest.restoreAllMocks();
    });
  });

  /**
   * TS-UNIT-011: staleカテゴリフィルタ境界値（境界値）
   *
   * 目的: staleカテゴリで、最終更新がちょうど90日前のIssueが抽出されることを検証
   */
  describe('TS-UNIT-011: Stale category filter boundary value', () => {
    it('should include issues updated exactly 90 days ago', () => {
      // Given: 現在日時を2025-01-30と仮定
      const now = new Date('2025-01-30T00:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation((() => now) as any);

      const issues: Issue[] = [
        {
          number: 1,
          title: 'Issue 1',
          body: '',
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-11-01T00:00:00Z', // ちょうど90日前
          state: 'open',
        },
        {
          number: 2,
          title: 'Issue 2',
          body: '',
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-11-02T00:00:00Z', // 89日前
          state: 'open',
        },
      ];

      // When: stale フィルタを適用
      const filtered = filterByCategory(issues, 'stale', 90);

      // Then: 90日以上経過した Issue のみが返される
      expect(filtered).toHaveLength(1);
      expect(filtered[0].number).toBe(1);

      // モックをリストア
      jest.restoreAllMocks();
    });
  });

  /**
   * TS-UNIT-012: oldカテゴリフィルタ（正常系）
   *
   * 目的: oldカテゴリで、作成から180日以上経過したIssueのみが抽出されることを検証
   */
  describe('TS-UNIT-012: Old category filter', () => {
    it('should filter issues created 180+ days ago', () => {
      // Given: 複数のIssue（現在日時を2025-01-30と仮定）
      const now = new Date('2025-01-30T00:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation((() => now) as any);

      const issues: Issue[] = [
        {
          number: 1,
          title: 'Issue 1',
          body: '',
          labels: [],
          created_at: '2024-01-01T00:00:00Z', // 394日前作成
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: 'Issue 2',
          body: '',
          labels: [],
          created_at: '2024-09-01T00:00:00Z', // 151日前作成
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 3,
          title: 'Issue 3',
          body: '',
          labels: [],
          created_at: '2024-06-01T00:00:00Z', // 243日前作成
          updated_at: '2024-12-01T00:00:00Z',
          state: 'open',
        },
      ];

      // When: old フィルタを適用（daysThreshold=90 → old判定は180日）
      const filtered = filterByCategory(issues, 'old', 90);

      // Then: 180日以上経過した Issue のみが返される
      expect(filtered).toHaveLength(2);
      expect(filtered[0].number).toBe(1);
      expect(filtered[1].number).toBe(3);

      // モックをリストア
      jest.restoreAllMocks();
    });
  });

  /**
   * TS-UNIT-013: allカテゴリフィルタ（正常系）
   *
   * 目的: allカテゴリで、全てのIssueが抽出されることを検証
   */
  describe('TS-UNIT-013: All category filter', () => {
    it('should return all issues without filtering', () => {
      // Given: 複数のIssue
      const issues: Issue[] = [
        {
          number: 1,
          title: '[FOLLOW-UP] Issue 1',
          body: '',
          labels: [],
          created_at: '2024-12-01T00:00:00Z',
          updated_at: '2025-01-20T00:00:00Z',
          state: 'open',
        },
        {
          number: 2,
          title: 'Bug: Issue 2',
          body: '',
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-05-01T00:00:00Z',
          state: 'open',
        },
        {
          number: 3,
          title: 'Feature: Issue 3',
          body: '',
          labels: [],
          created_at: '2024-08-01T00:00:00Z',
          updated_at: '2025-01-25T00:00:00Z',
          state: 'open',
        },
      ];

      // When: all フィルタを適用
      const filtered = filterByCategory(issues, 'all', 90);

      // Then: 全ての Issue が返される
      expect(filtered).toHaveLength(3);
      expect(filtered[0].number).toBe(1);
      expect(filtered[1].number).toBe(2);
      expect(filtered[2].number).toBe(3);
    });
  });
});
