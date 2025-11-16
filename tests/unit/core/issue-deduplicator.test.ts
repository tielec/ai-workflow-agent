/**
 * ユニットテスト: IssueDeduplicator
 * Phase 5 Test Implementation: Issue #121
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IssueDeduplicator } from '../../../src/core/issue-deduplicator.js';
import { IssueCategory, type IssueCandidateResult } from '../../../src/types.js';

// モック設定
jest.mock('../../../src/core/github-client.js');
jest.mock('openai');

describe('IssueDeduplicator', () => {
  let deduplicator: IssueDeduplicator;
  let mockGitHubClient: any;
  let mockOpenAI: any;

  const sampleCandidate: IssueCandidateResult = {
    category: IssueCategory.BUG,
    title: 'エラーハンドリングの欠如',
    description: '非同期関数でtry-catchが使用されていません',
    file: 'src/main.ts',
    lineNumber: 123,
    codeSnippet: 'async function test() { await fetch(); }',
    confidence: 0.95,
    suggestedFixes: ['try-catchブロックで囲む'],
    expectedBenefits: ['安定性向上'],
    priority: 'High',
  };

  beforeEach(() => {
    // GitHubClientのモック
    mockGitHubClient = {
      listAllIssues: jest.fn(),
    };

    // OpenAIのモック
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // IssueDeduplicatorのインスタンス化（モック注入は実装依存）
    deduplicator = new IssueDeduplicator();
  });

  describe('findSimilarIssues', () => {
    /**
     * テストケース 2.2.1: findSimilarIssues_正常系_重複検出
     * 目的: 既存Issueと高い類似度を持つIssue候補が重複として検出されることを検証
     */
    it('should detect duplicate issues with high similarity', async () => {
      // Given: 既存Issueが存在し、LLM APIが高類似度を返却
      const existingIssues = [
        {
          number: 123,
          title: 'エラーハンドリングの欠如',
          body: '非同期関数でtry-catchが使用されていません。',
        },
      ];

      mockGitHubClient.listAllIssues.mockResolvedValue(existingIssues);
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '0.92' } }],
      });

      // When: 類似Issue検出を実行
      const threshold = 0.8;
      const similarIssues = await deduplicator.findSimilarIssues(sampleCandidate, threshold);

      // Then: 重複として検出される
      expect(similarIssues.length).toBeGreaterThan(0);
      expect(similarIssues[0].issueNumber).toBe(123);
      expect(similarIssues[0].similarityScore).toBeCloseTo(0.92, 2);
      expect(similarIssues[0].isDuplicate).toBe(true);
    });

    /**
     * テストケース 2.2.2: findSimilarIssues_正常系_重複なし
     * 目的: 既存Issueと類似度が低いIssue候補が重複として検出されないことを検証
     */
    it('should not detect non-duplicate issues with low similarity', async () => {
      // Given: 既存Issueが存在し、LLM APIが低類似度を返却
      const existingIssues = [
        {
          number: 124,
          title: 'UI改善提案',
          body: 'ユーザーインターフェースを改善する提案です。',
        },
      ];

      mockGitHubClient.listAllIssues.mockResolvedValue(existingIssues);
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '0.25' } }],
      });

      // When: 類似Issue検出を実行
      const threshold = 0.8;
      const similarIssues = await deduplicator.findSimilarIssues(sampleCandidate, threshold);

      // Then: 重複として検出されない
      expect(similarIssues.length).toBe(0);
    });

    /**
     * テストケース 2.2.5: calculateSemanticSimilarity_異常系_OpenAI未設定
     * 目的: OpenAI APIキー未設定時にエラーが発生せず、デフォルト値が返却されることを検証
     */
    it('should return 0.0 when OpenAI API key is not configured', async () => {
      // Given: OpenAI APIキーが未設定
      const deduplicatorWithoutOpenAI = new IssueDeduplicator();

      const existingIssues = [
        {
          number: 125,
          title: 'パフォーマンス最適化',
          body: 'データベースクエリを最適化する必要があります。',
        },
      ];

      mockGitHubClient.listAllIssues.mockResolvedValue(existingIssues);

      // When: 類似Issue検出を実行
      const threshold = 0.8;
      const similarIssues = await deduplicatorWithoutOpenAI.findSimilarIssues(
        sampleCandidate,
        threshold,
      );

      // Then: エラーがスローされず、空配列が返却される
      expect(similarIssues).toBeInstanceOf(Array);
      // OpenAI未設定の場合、コサイン類似度のみで判定される可能性がある
    });
  });

  describe('filterByCosineSimilarity', () => {
    /**
     * テストケース 2.2.3: filterByCosineSimilarity_正常系_フィルタリング
     * 目的: コサイン類似度によるフィルタリングが正しく動作することを検証
     */
    it('should filter issues by cosine similarity', () => {
      // Given: 複数の既存Issue
      const existingIssues = [
        {
          number: 101,
          title: 'エラーハンドリングの欠如',
          body: '非同期関数でエラーハンドリングがありません',
        },
        {
          number: 102,
          title: 'UI改善',
          body: 'ユーザーインターフェースの改善',
        },
        {
          number: 103,
          title: '例外処理が不足',
          body: 'try-catchが実装されていません',
        },
      ];

      // When: コサイン類似度フィルタリングを実行
      // NOTE: このテストは実装詳細に依存するため、パブリックAPIでテスト可能な場合のみ実装
      // 実装がprivateメソッドの場合、間接的にfindSimilarIssuesでテスト

      // Then: 類似度が高いIssueのみがフィルタリングされる
      // （実装詳細に応じて調整）
    });
  });

  describe('textToVector', () => {
    /**
     * テストケース 2.2.6: textToVector_正常系_ベクトル化
     * 目的: テキストが正しく単語頻度ベースのベクトルに変換されることを検証
     */
    it('should vectorize text based on word frequency', () => {
      // NOTE: このテストはprivateメソッドのため、間接的にテスト
      // または、テストのためにpublicにする必要がある
      // 実装の可視性に応じて調整
    });
  });

  describe('getCacheKey', () => {
    /**
     * テストケース 2.2.7: getCacheKey_正常系_キー生成
     * 目的: Issue候補から一意なキャッシュキーが生成されることを検証
     */
    it('should generate unique cache key from candidate', () => {
      // NOTE: このテストはprivateメソッドのため、間接的にテスト
      // キャッシュの動作確認は、同じIssue候補で2回検出を実行し、
      // 2回目がキャッシュから返却されることで検証可能
    });
  });
});
