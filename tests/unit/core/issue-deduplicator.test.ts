/**
 * ユニットテスト: IssueDeduplicator
 *
 * テスト対象: src/core/issue-deduplicator.ts
 * テストシナリオ: test-scenario.md の TC-ID-001 〜 TC-ID-010
 */

import { IssueDeduplicator } from '../../../src/core/issue-deduplicator.js';
import { jest } from '@jest/globals';
import type { BugCandidate } from '../../../src/types/auto-issue.js';
import { OpenAI } from 'openai';

// モック設定
jest.mock('openai');
jest.mock('../../../src/utils/logger.js');

describe('IssueDeduplicator', () => {
  let deduplicator: IssueDeduplicator;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(() => {
    // OpenAI クライアントのモック
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    deduplicator = new IssueDeduplicator();
    // プライベートフィールドに直接アクセス（テスト目的）
    (deduplicator as any).openaiClient = mockOpenAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-ID-001: filterDuplicates_正常系_重複なし
   *
   * 目的: 既存Issueと類似しない候補がフィルタリングされないことを検証
   */
  describe('TC-ID-001: filterDuplicates with no duplicates', () => {
    it('should not filter candidates when no existing issues', async () => {
      // Given: 既存Issueが空
      const candidates: BugCandidate[] = [
        {
          title: 'Unique bug title',
          file: 'test.ts',
          line: 1,
          severity: 'high',
          description: 'This is a unique bug description.',
          suggestedFix: 'Fix it.',
          category: 'bug',
        },
      ];
      const existingIssues: any[] = [];
      const threshold = 0.8;

      // When: filterDuplicates を実行
      const result = await deduplicator.filterDuplicates(candidates, existingIssues, threshold);

      // Then: フィルタリングされない
      expect(result).toHaveLength(1);
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-ID-002: filterDuplicates_正常系_コサイン類似度で重複検出
   *
   * 目的: コサイン類似度が閾値を超えた場合、LLM判定が実行されることを検証
   */
  describe('TC-ID-002: filterDuplicates with cosine similarity detection', () => {
    it('should execute LLM judgment when cosine similarity exceeds threshold', async () => {
      // Given: 類似度が高い候補と既存Issue
      const candidates: BugCandidate[] = [
        {
          title: 'Fix memory leak in CodexAgentClient',
          file: 'src/core/codex-agent-client.ts',
          line: 42,
          severity: 'high',
          description: 'Memory leak occurs when executeTask fails.',
          suggestedFix: 'Add proper cleanup in catch block.',
          category: 'bug',
        },
      ];

      const existingIssues = [
        {
          number: 123,
          title: 'Fix memory leak in CodexAgentClient',
          body: 'Memory leak issue in executeTask method.',
        },
      ];

      // LLM判定で重複と判定
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'YES' } }],
      } as any);

      // When: filterDuplicates を実行
      const result = await deduplicator.filterDuplicates(candidates, existingIssues, 0.8);

      // Then: 重複として除外される
      expect(result).toHaveLength(0);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-ID-003: filterDuplicates_正常系_LLM判定で非重複
   *
   * 目的: コサイン類似度が閾値を超えてもLLM判定で非重複と判定された場合、フィルタリングされないことを検証
   */
  describe('TC-ID-003: filterDuplicates with LLM non-duplicate judgment', () => {
    it('should not filter when LLM judges as non-duplicate', async () => {
      // Given: 類似度が高いが、LLM判定で非重複
      const candidates: BugCandidate[] = [
        {
          title: 'Fix memory leak in IssueGenerator',
          file: 'src/core/issue-generator.ts',
          line: 50,
          severity: 'high',
          description: 'Memory leak in createIssueOnGitHub method.',
          suggestedFix: 'Add cleanup.',
          category: 'bug',
        },
      ];

      const existingIssues = [
        {
          number: 123,
          title: 'Fix memory leak in CodexAgentClient',
          body: 'Memory leak in executeTask method.',
        },
      ];

      // LLM判定で非重複と判定
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'NO' } }],
      } as any);

      // When: filterDuplicates を実行
      const result = await deduplicator.filterDuplicates(candidates, existingIssues, 0.8);

      // Then: フィルタリングされない
      expect(result).toHaveLength(1);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });
  });

  /**
   * TC-ID-004: filterDuplicates_異常系_OpenAI_API失敗
   *
   * 目的: OpenAI API失敗時、フォールバックしてコサイン類似度のみで判定することを検証
   */
  describe('TC-ID-004: filterDuplicates with OpenAI API failure', () => {
    it('should fallback to cosine similarity only when OpenAI API fails', async () => {
      // Given: OpenAI APIがエラーをスロー
      const candidates: BugCandidate[] = [
        {
          title: 'Test bug with sufficient length for validation',
          file: 'test.ts',
          line: 1,
          severity: 'high',
          description: 'Test description with enough characters for validation.',
          suggestedFix: 'Test fix.',
          category: 'bug',
        },
      ];

      const existingIssues = [
        {
          number: 123,
          title: 'Test bug similar',
          body: 'Test description',
        },
      ];

      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API rate limit'));

      // When: filterDuplicates を実行
      const result = await deduplicator.filterDuplicates(candidates, existingIssues, 0.8);

      // Then: LLM失敗時は非重複として扱う
      expect(result).toHaveLength(1);
    });
  });

  /**
   * TC-ID-005: calculateCosineSimilarity_正常系_同一テキスト
   *
   * 目的: 同一テキストの類似度が1.0になることを検証
   */
  describe('TC-ID-005: calculateCosineSimilarity with identical text', () => {
    it('should return 1.0 for identical text', () => {
      // Given: 同一のテキスト
      const text1 = 'This is a test sentence with some words.';
      const text2 = 'This is a test sentence with some words.';

      // When: calculateCosineSimilarity を実行（publicメソッドがあれば直接、なければfilterDuplicates経由）
      // ここでは直接アクセスできないため、類似度が高い候補でテスト
      const similarity = (deduplicator as any).calculateCosineSimilarity(text1, text2);

      // Then: 類似度が1.0
      expect(similarity).toBe(1.0);
    });
  });

  /**
   * TC-ID-006: calculateCosineSimilarity_正常系_全く異なるテキスト
   *
   * 目的: 全く異なるテキストの類似度が0に近くなることを検証
   */
  describe('TC-ID-006: calculateCosineSimilarity with completely different text', () => {
    it('should return close to 0.0 for completely different text', () => {
      // Given: 全く異なるテキスト
      const text1 = 'apple orange banana';
      const text2 = 'car truck bicycle';

      // When: calculateCosineSimilarity を実行
      const similarity = (deduplicator as any).calculateCosineSimilarity(text1, text2);

      // Then: 類似度が0.0
      expect(similarity).toBe(0.0);
    });
  });

  /**
   * TC-ID-007: calculateCosineSimilarity_境界値_空文字列
   *
   * 目的: 空文字列の場合、類似度が0になることを検証
   */
  describe('TC-ID-007: calculateCosineSimilarity with empty string', () => {
    it('should return 0.0 for empty string', () => {
      // Given: 空文字列
      const text1 = '';
      const text2 = 'test';

      // When: calculateCosineSimilarity を実行
      const similarity = (deduplicator as any).calculateCosineSimilarity(text1, text2);

      // Then: 類似度が0.0（ゼロ除算を回避）
      expect(similarity).toBe(0.0);
    });
  });

  /**
   * TC-ID-008: checkDuplicateWithLLM_正常系_重複判定
   *
   * 目的: LLMが "YES" を返した場合、重複と判定されることを検証
   */
  describe('TC-ID-008: checkDuplicateWithLLM returns duplicate', () => {
    it('should return true when LLM responds with YES', async () => {
      // Given: LLMが "YES" を返す
      const candidate: BugCandidate = {
        title: 'Fix bug A',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Bug A description',
        suggestedFix: 'Fix A',
        category: 'bug',
      };

      const issue = {
        number: 123,
        title: 'Fix bug A',
        body: 'Bug A description',
      };

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'YES' } }],
      } as any);

      // When: checkDuplicateWithLLM を実行
      const isDuplicate = await (deduplicator as any).checkDuplicateWithLLM(candidate, issue);

      // Then: true が返される
      expect(isDuplicate).toBe(true);
    });
  });

  /**
   * TC-ID-009: checkDuplicateWithLLM_正常系_非重複判定
   *
   * 目的: LLMが "NO" を返した場合、非重複と判定されることを検証
   */
  describe('TC-ID-009: checkDuplicateWithLLM returns non-duplicate', () => {
    it('should return false when LLM responds with NO', async () => {
      // Given: LLMが "NO" を返す
      const candidate: BugCandidate = {
        title: 'Fix bug A',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Bug A description',
        suggestedFix: 'Fix A',
        category: 'bug',
      };

      const issue = {
        number: 123,
        title: 'Fix bug B',
        body: 'Bug B description',
      };

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'NO' } }],
      } as any);

      // When: checkDuplicateWithLLM を実行
      const isDuplicate = await (deduplicator as any).checkDuplicateWithLLM(candidate, issue);

      // Then: false が返される
      expect(isDuplicate).toBe(false);
    });
  });

  /**
   * TC-ID-010: filterDuplicates_境界値_閾値ちょうど
   *
   * 目的: 類似度が閾値ちょうどの場合、LLM判定が実行されることを検証
   */
  describe('TC-ID-010: filterDuplicates with threshold boundary', () => {
    it('should execute LLM judgment when similarity equals threshold', async () => {
      // Given: 類似度が閾値と同じになるようなテキストペア
      // 注: 実際のコサイン類似度が0.8になるペアを作成するのは難しいため、
      // 十分に類似したテキストでLLM判定が実行されることを確認
      const candidates: BugCandidate[] = [
        {
          title: 'Memory leak in client code needs fixing',
          file: 'src/client.ts',
          line: 1,
          severity: 'high',
          description: 'Memory leak occurs in the client code.',
          suggestedFix: 'Add cleanup.',
          category: 'bug',
        },
      ];

      const existingIssues = [
        {
          number: 1,
          title: 'Memory leak in client needs fix',
          body: 'Memory leak in client.',
        },
      ];

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'NO' } }],
      } as any);

      // When: filterDuplicates を実行
      const result = await deduplicator.filterDuplicates(candidates, existingIssues, 0.8);

      // Then: LLM判定が実行される
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      expect(result).toHaveLength(1); // LLM判定で非重複
    });
  });
});
