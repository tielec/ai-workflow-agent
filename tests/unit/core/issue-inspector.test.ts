/**
 * Unit tests for IssueInspector class
 *
 * Tests Issue検品ロジック、エージェント出力パース、安全フィルタ機能
 */

import { jest } from '@jest/globals';
import { IssueInspector } from '../../../src/core/issue-inspector.js';
import type { Issue, InspectionOptions } from '../../../src/types/auto-close-issue.js';
import type { IssueClient } from '../../../src/core/github/issue-client.js';

describe('IssueInspector', () => {
  // モックエージェント
  const mockAgentExecutor = {
    executeTask: jest.fn(),
  };

  // モックIssueClient
  const mockIssueClient = {
    getIssue: jest.fn(),
    getIssueCommentsDict: jest.fn(),
    getIssues: jest.fn(),
    postComment: jest.fn(),
    closeIssue: jest.fn(),
    addLabels: jest.fn(),
  } as unknown as IssueClient;

  let inspector: IssueInspector;

  beforeEach(() => {
    jest.clearAllMocks();
    inspector = new IssueInspector(mockAgentExecutor as any, mockIssueClient, 'owner', 'repo');
  });

  describe('parseInspectionResult (via inspectIssue)', () => {
    const testIssue: Issue = {
      number: 123,
      title: '[FOLLOW-UP] Add logging',
      body: 'Issue body',
      labels: [{ name: 'enhancement' }],
      created_at: '2024-11-01T00:00:00Z',
      updated_at: '2024-12-01T00:00:00Z',
      state: 'open',
    };

    const inspectionOptions: InspectionOptions = {
      confidenceThreshold: 0.7,
      excludeLabels: ['do-not-close', 'pinned'],
      agent: 'auto',
    };

    beforeEach(() => {
      // モックIssue詳細情報を返す
      mockIssueClient.getIssue = jest.fn().mockResolvedValue({
        number: 123,
        title: '[FOLLOW-UP] Add logging',
        body: 'Issue body',
        labels: [{ name: 'enhancement' }],
        created_at: '2024-11-01T00:00:00Z',
        updated_at: '2024-12-01T00:00:00Z',
        state: 'open',
      });

      mockIssueClient.getIssueCommentsDict = jest.fn().mockResolvedValue([
        {
          id: 1,
          user: 'user1',
          created_at: '2024-11-05T00:00:00Z',
          body: 'Comment 1',
        },
      ]);
    });

    describe('TS-UNIT-014: 正常なJSON出力のパース（正常系）', () => {
      it('should parse valid JSON output correctly', async () => {
        // Given: エージェントが仕様通りのJSON文字列を出力
        const validJSON = {
          issue_number: 123,
          recommendation: 'close',
          confidence: 0.85,
          reasoning: '元Issueクローズ済み、ログ機能実装済み',
          close_comment: 'このIssueは対応完了のためクローズします。',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(validJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: 正しくパースされた結果が返される
        expect(result).not.toBeNull();
        expect(result?.issue_number).toBe(123);
        expect(result?.recommendation).toBe('close');
        expect(result?.confidence).toBe(0.85);
        expect(result?.reasoning).toBe('元Issueクローズ済み、ログ機能実装済み');
        expect(result?.close_comment).toBe('このIssueは対応完了のためクローズします。');
        expect(result?.suggested_actions).toEqual([]);
      });
    });

    describe('TS-UNIT-015: 必須フィールド欠落（異常系）', () => {
      it('should return null when required field "recommendation" is missing', async () => {
        // Given: 必須フィールド（recommendation）が欠落したJSON文字列
        const invalidJSON = {
          issue_number: 123,
          confidence: 0.85,
          reasoning: '理由',
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(invalidJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（パースエラー）
        expect(result).toBeNull();
      });

      it('should return null when required field "confidence" is missing', async () => {
        // Given: 必須フィールド（confidence）が欠落したJSON文字列
        const invalidJSON = {
          issue_number: 123,
          recommendation: 'close',
          reasoning: '理由',
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(invalidJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（パースエラー）
        expect(result).toBeNull();
      });
    });

    describe('TS-UNIT-016: 不正なJSON形式（異常系）', () => {
      it('should return null when JSON is invalid', async () => {
        // Given: 不正なJSON文字列
        const invalidJSON = '{ "issue_number": 123, invalid json }';

        mockAgentExecutor.executeTask.mockResolvedValue([invalidJSON]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（パースエラー）
        expect(result).toBeNull();
      });
    });

    describe('TS-UNIT-017: recommendationの値検証（異常系）', () => {
      it('should return null when recommendation has invalid value', async () => {
        // Given: recommendationが無効な値（delete）
        const invalidJSON = {
          issue_number: 123,
          recommendation: 'delete',
          confidence: 0.85,
          reasoning: '理由',
          close_comment: '',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(invalidJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（バリデーションエラー）
        expect(result).toBeNull();
      });
    });

    describe('TS-UNIT-018: confidence範囲外の値（異常系）', () => {
      it('should return null when confidence is out of range (> 1.0)', async () => {
        // Given: confidenceが範囲外（1.5）
        const invalidJSON = {
          issue_number: 123,
          recommendation: 'close',
          confidence: 1.5,
          reasoning: '理由',
          close_comment: '',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(invalidJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（バリデーションエラー）
        expect(result).toBeNull();
      });

      it('should return null when confidence is out of range (< 0.0)', async () => {
        // Given: confidenceが範囲外（-0.1）
        const invalidJSON = {
          issue_number: 123,
          recommendation: 'close',
          confidence: -0.1,
          reasoning: '理由',
          close_comment: '',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(invalidJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(testIssue, inspectionOptions);

        // Then: nullが返される（バリデーションエラー）
        expect(result).toBeNull();
      });
    });
  });

  describe('Safety Filters', () => {
    const baseIssue: Issue = {
      number: 1,
      title: 'Test Issue',
      body: 'Issue body',
      labels: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-12-01T00:00:00Z',
      state: 'open',
    };

    const baseOptions: InspectionOptions = {
      confidenceThreshold: 0.7,
      excludeLabels: ['do-not-close', 'pinned'],
      agent: 'auto',
    };

    beforeEach(() => {
      mockIssueClient.getIssue = jest.fn().mockResolvedValue(baseIssue);
      mockIssueClient.getIssueCommentsDict = jest.fn().mockResolvedValue([]);
    });

    describe('TS-UNIT-019: 除外ラベルチェック（正常系）', () => {
      it('should skip issue with excluded label "do-not-close"', async () => {
        // Given: Issueが除外ラベル（do-not-close）を持つ
        const issueWithExcludeLabel: Issue = {
          ...baseIssue,
          labels: [{ name: 'do-not-close' }, { name: 'bug' }],
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueWithExcludeLabel, baseOptions);

        // Then: nullが返される（スキップ）
        expect(result).toBeNull();
        expect(mockAgentExecutor.executeTask).not.toHaveBeenCalled();
      });

      it('should skip issue with excluded label "pinned"', async () => {
        // Given: Issueが除外ラベル（pinned）を持つ
        const issueWithExcludeLabel: Issue = {
          ...baseIssue,
          labels: [{ name: 'pinned' }],
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueWithExcludeLabel, baseOptions);

        // Then: nullが返される（スキップ）
        expect(result).toBeNull();
        expect(mockAgentExecutor.executeTask).not.toHaveBeenCalled();
      });
    });

    describe('TS-UNIT-020: 除外ラベルなし（正常系）', () => {
      it('should process issue without excluded labels', async () => {
        // Given: Issueが除外ラベルを持たない
        const issueWithoutExcludeLabel: Issue = {
          ...baseIssue,
          labels: [{ name: 'bug' }, { name: 'enhancement' }],
        };

        const validJSON = {
          issue_number: 1,
          recommendation: 'close',
          confidence: 0.85,
          reasoning: '理由',
          close_comment: 'コメント',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(validJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueWithoutExcludeLabel, baseOptions);

        // Then: 検品が実行される（nullでない）
        expect(result).not.toBeNull();
        expect(mockAgentExecutor.executeTask).toHaveBeenCalled();
      });
    });

    describe('TS-UNIT-021: 最近更新除外チェック（正常系）', () => {
      it('should skip issue updated within 7 days', async () => {
        // Given: 最終更新が2日前のIssue
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const recentlyUpdatedIssue: Issue = {
          ...baseIssue,
          updated_at: twoDaysAgo.toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(recentlyUpdatedIssue, baseOptions);

        // Then: nullが返される（スキップ）
        expect(result).toBeNull();
        expect(mockAgentExecutor.executeTask).not.toHaveBeenCalled();
      });
    });

    describe('TS-UNIT-022: 最近更新除外境界値（境界値）', () => {
      it('should skip issue updated exactly 7 days ago', async () => {
        // Given: 最終更新がちょうど7日前のIssue
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const boundaryIssue: Issue = {
          ...baseIssue,
          updated_at: sevenDaysAgo.toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(boundaryIssue, baseOptions);

        // Then: nullが返される（7日以内として除外）
        expect(result).toBeNull();
        expect(mockAgentExecutor.executeTask).not.toHaveBeenCalled();
      });

      it('should process issue updated 8 days ago', async () => {
        // Given: 最終更新が8日前のIssue
        const now = new Date();
        const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

        const oldIssue: Issue = {
          ...baseIssue,
          updated_at: eightDaysAgo.toISOString(),
        };

        const validJSON = {
          issue_number: 1,
          recommendation: 'close',
          confidence: 0.85,
          reasoning: '理由',
          close_comment: 'コメント',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(validJSON)]);

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(oldIssue, baseOptions);

        // Then: 検品が実行される（8日以上前なのでOK）
        expect(result).not.toBeNull();
        expect(mockAgentExecutor.executeTask).toHaveBeenCalled();
      });
    });

    describe('TS-UNIT-023: confidence閾値チェック（正常系）', () => {
      it('should skip issue when confidence is below threshold', async () => {
        // Given: confidence=0.65、閾値=0.7
        const lowConfidenceJSON = {
          issue_number: 1,
          recommendation: 'close',
          confidence: 0.65,
          reasoning: '理由',
          close_comment: 'コメント',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(lowConfidenceJSON)]);

        const issueEightDaysAgo: Issue = {
          ...baseIssue,
          updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueEightDaysAgo, baseOptions);

        // Then: nullが返される（confidence閾値未満）
        expect(result).toBeNull();
      });
    });

    describe('TS-UNIT-024: confidence閾値境界値（境界値）', () => {
      it('should process issue when confidence equals threshold', async () => {
        // Given: confidence=0.7、閾値=0.7（境界値）
        const exactThresholdJSON = {
          issue_number: 1,
          recommendation: 'close',
          confidence: 0.7,
          reasoning: '理由',
          close_comment: 'コメント',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(exactThresholdJSON)]);

        const issueEightDaysAgo: Issue = {
          ...baseIssue,
          updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueEightDaysAgo, baseOptions);

        // Then: 検品結果が返される（閾値ちょうどなのでOK）
        expect(result).not.toBeNull();
        expect(result?.confidence).toBe(0.7);
      });
    });

    describe('TS-UNIT-025: recommendation="needs_discussion"チェック（正常系）', () => {
      it('should skip issue when recommendation is "needs_discussion"', async () => {
        // Given: recommendation="needs_discussion"
        const needsDiscussionJSON = {
          issue_number: 1,
          recommendation: 'needs_discussion',
          confidence: 0.85,
          reasoning: '判断が難しい',
          close_comment: '',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(needsDiscussionJSON)]);

        const issueEightDaysAgo: Issue = {
          ...baseIssue,
          updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueEightDaysAgo, baseOptions);

        // Then: nullが返される（needs_discussionはクローズ対象外）
        expect(result).toBeNull();
      });
    });

    describe('TS-UNIT-026: recommendation="keep"チェック（正常系）', () => {
      it('should skip issue when recommendation is "keep"', async () => {
        // Given: recommendation="keep"
        const keepJSON = {
          issue_number: 1,
          recommendation: 'keep',
          confidence: 0.85,
          reasoning: '継続が必要',
          close_comment: '',
          suggested_actions: [],
        };

        mockAgentExecutor.executeTask.mockResolvedValue([JSON.stringify(keepJSON)]);

        const issueEightDaysAgo: Issue = {
          ...baseIssue,
          updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // When: Issue検品を実行
        const result = await inspector.inspectIssue(issueEightDaysAgo, baseOptions);

        // Then: nullが返される（keepはクローズ対象外）
        expect(result).toBeNull();
      });
    });
  });
});
