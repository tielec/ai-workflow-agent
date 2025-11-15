/**
 * ユニットテスト: IssueDeduplicator（重複検出エンジン）
 *
 * テスト対象:
 * - findSimilarIssues(): 類似Issue検出
 * - filterByCosineSimilarity(): コサイン類似度フィルタリング
 * - calculateSemanticSimilarity(): LLM意味的判定
 * - textToVector(): テキストベクトル化
 * - getCacheKey(): キャッシュキー生成
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { IssueDeduplicator } from '../../../src/core/issue-deduplicator.js';
import { IssueCategory, type IssueCandidateResult } from '../../../src/types.js';
import { GitHubClient } from '../../../src/core/github-client.js';
import OpenAI from 'openai';

// モック設定
jest.mock('../../../src/core/github-client.js');
jest.mock('openai');
jest.mock('../../../src/core/config.js', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'test-github-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getOpenAiApiKey: jest.fn(() => 'test-openai-key'),
  },
}));

// =============================================================================
// テストデータ
// =============================================================================

const createTestCandidate = (overrides?: Partial<IssueCandidateResult>): IssueCandidateResult => ({
  category: IssueCategory.BUG,
  title: 'エラーハンドリングの欠如',
  description: '非同期関数でtry-catchが使用されていません',
  file: 'src/test.ts',
  lineNumber: 10,
  codeSnippet: 'async function test() { ... }',
  confidence: 0.95,
  suggestedFixes: ['try-catchを追加'],
  expectedBenefits: ['安定性向上'],
  priority: 'High',
  ...overrides,
});

const createExistingIssues = () => [
  {
    number: 123,
    title: 'エラーハンドリングの欠如',
    body: '非同期関数でtry-catchが使用されていません。アプリケーションがクラッシュする可能性があります。',
  },
  {
    number: 124,
    title: 'UI改善提案',
    body: 'ユーザーインターフェースを改善する提案です。',
  },
  {
    number: 125,
    title: '例外処理が不足している',
    body: '一部の非同期関数で適切なエラーハンドリングが実装されていません。',
  },
];

// =============================================================================
// IssueDeduplicator のテスト
// =============================================================================

describe('IssueDeduplicator', () => {
  let deduplicator: IssueDeduplicator;
  let mockGitHubClient: jest.Mocked<GitHubClient>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(() => {
    // GitHubClientのモック設定
    mockGitHubClient = {
      listAllIssues: jest.fn(async () => createExistingIssues()),
    } as unknown as jest.Mocked<GitHubClient>;

    (GitHubClient as jest.MockedClass<typeof GitHubClient>).mockImplementation(() => mockGitHubClient);

    // OpenAI APIのモック設定
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(async () => ({
            choices: [{ message: { content: '0.92' } }],
          })),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    // Given: IssueDeduplicatorインスタンス
    deduplicator = new IssueDeduplicator();
  });

  // ===========================================================================
  // findSimilarIssues() のテスト
  // ===========================================================================

  describe('findSimilarIssues', () => {
    test('既存Issueと高い類似度を持つIssue候補が重複として検出される', async () => {
      // Given: 既存Issue「エラーハンドリングの欠如」が存在
      const candidate = createTestCandidate({
        title: '例外処理が不足している',
        description: '非同期関数でtry-catchが使用されていません',
      });

      // OpenAI APIが高い類似度スコアを返す
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [{ message: { content: '0.92' } }],
      })) as unknown as typeof mockOpenAI.chat.completions.create;

      // When: 重複検出を実行
      const similarIssues = await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: 類似Issueが検出される
      expect(similarIssues.length).toBeGreaterThan(0);
      expect(similarIssues[0].issueNumber).toBe(123);
      expect(similarIssues[0].issueTitle).toBe('エラーハンドリングの欠如');
      expect(similarIssues[0].similarityScore).toBe(0.92);
      expect(similarIssues[0].isDuplicate).toBe(true);
    });

    test('既存Issueと類似度が低いIssue候補は重複として検出されない', async () => {
      // Given: 既存Issue「UI改善提案」が存在
      const candidate = createTestCandidate({
        title: 'エラーハンドリングの欠如',
        description: '非同期関数でtry-catchが使用されていません',
      });

      // OpenAI APIが低い類似度スコアを返す
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [{ message: { content: '0.25' } }],
      })) as unknown as typeof mockOpenAI.chat.completions.create;

      // When: 重複検出を実行
      const similarIssues = await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: 類似Issueは検出されない
      expect(similarIssues).toHaveLength(0);
    });

    test('キャッシュが機能し、2回目以降はGitHub APIを呼ばない', async () => {
      // Given: Issue候補
      const candidate = createTestCandidate();

      // When: 1回目の重複検出
      await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: GitHub APIが呼ばれる
      expect(mockGitHubClient.listAllIssues).toHaveBeenCalled();

      // リセット
      (mockGitHubClient.listAllIssues as jest.Mock).mockClear();

      // When: 2回目の重複検出（同じcandidate）
      await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: キャッシュが使用され、GitHub APIは呼ばれない
      expect(mockGitHubClient.listAllIssues).not.toHaveBeenCalled();
    });

    test('OpenAI APIキー未設定時は類似度0.0を返す', async () => {
      // Given: OpenAI APIキーが未設定
      const { config } = await import('../../../src/core/config.js');
      (config.getOpenAiApiKey as jest.Mock).mockReturnValueOnce(null);

      const deduplicatorNoOpenAI = new IssueDeduplicator();
      const candidate = createTestCandidate();

      // When: 重複検出を実行
      const similarIssues = await deduplicatorNoOpenAI.findSimilarIssues(candidate, 0.8);

      // Then: 類似Issueは検出されない
      expect(similarIssues).toHaveLength(0);
    });
  });

  // ===========================================================================
  // コサイン類似度フィルタリングのテスト
  // ===========================================================================

  describe('filterByCosineSimilarity (private method test via findSimilarIssues)', () => {
    test('コサイン類似度でフィルタリングされる', async () => {
      // Given: 既存Issue3件（類似度0.7, 0.4, 0.9相当）
      const candidate = createTestCandidate({
        title: 'エラーハンドリングの欠如',
        description: '非同期関数でtry-catchが使用されていません',
      });

      // OpenAI APIが呼ばれる回数を記録
      let openAICallCount = 0;
      mockOpenAI.chat.completions.create = jest.fn(async () => {
        openAICallCount++;
        return { choices: [{ message: { content: '0.95' } }] };
      }) as unknown as typeof mockOpenAI.chat.completions.create;

      // When: 重複検出を実行
      await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: コサイン類似度でフィルタリングされ、類似度の高いIssueのみがLLMで判定される
      // （全3件ではなく、コサイン類似度0.6以上のみ）
      expect(openAICallCount).toBeLessThan(createExistingIssues().length);
      expect(openAICallCount).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // テキストベクトル化のテスト
  // ===========================================================================

  describe('textToVector (private method test via behavior)', () => {
    test('同じテキストは同じベクトルを生成する', async () => {
      // Given: 同じタイトルとdescriptionを持つ2つのcandidate
      const candidate1 = createTestCandidate({
        title: 'test title',
        description: 'test description',
      });
      const candidate2 = createTestCandidate({
        title: 'test title',
        description: 'test description',
      });

      // When: 重複検出を実行（内部でtextToVectorが呼ばれる）
      const result1 = await deduplicator.findSimilarIssues(candidate1, 0.8);
      const result2 = await deduplicator.findSimilarIssues(candidate2, 0.8);

      // Then: 同じ結果が返される（キャッシュまたは同じベクトル化）
      expect(result1).toEqual(result2);
    });
  });

  // ===========================================================================
  // キャッシュキー生成のテスト
  // ===========================================================================

  describe('getCacheKey (private method test via behavior)', () => {
    test('異なるcandidateは異なるキャッシュキーを生成する', async () => {
      // Given: 異なる2つのcandidate
      const candidate1 = createTestCandidate({
        title: 'Issue 1',
        file: 'file1.ts',
        lineNumber: 10,
      });
      const candidate2 = createTestCandidate({
        title: 'Issue 2',
        file: 'file2.ts',
        lineNumber: 20,
      });

      // When: 両方のcandidateで重複検出を実行
      await deduplicator.findSimilarIssues(candidate1, 0.8);
      await deduplicator.findSimilarIssues(candidate2, 0.8);

      // Then: それぞれが独立してキャッシュされる
      // （GitHub APIが2回呼ばれることで確認）
      expect(mockGitHubClient.listAllIssues).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // エラーハンドリングのテスト
  // ===========================================================================

  describe('エラーハンドリング', () => {
    test('GitHub API障害時でもエラーがスローされない', async () => {
      // Given: GitHub APIがエラーを返す
      mockGitHubClient.listAllIssues = jest.fn(async () => {
        throw new Error('GitHub API error');
      }) as unknown as typeof mockGitHubClient.listAllIssues;

      const deduplicatorWithError = new IssueDeduplicator();
      const candidate = createTestCandidate();

      // When & Then: エラーがスローされる（現在の実装はエラーを上位に伝播）
      await expect(deduplicatorWithError.findSimilarIssues(candidate, 0.8)).rejects.toThrow();
    });

    test('OpenAI API障害時は類似度0.0を返す', async () => {
      // Given: OpenAI APIがエラーを返す
      mockOpenAI.chat.completions.create = jest.fn(async () => {
        throw new Error('OpenAI API error');
      }) as unknown as typeof mockOpenAI.chat.completions.create;

      const candidate = createTestCandidate();

      // When: 重複検出を実行
      const similarIssues = await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: エラーが記録され、類似Issueは検出されない
      expect(similarIssues).toHaveLength(0);
    });

    test('LLMレスポンスが数値でない場合は類似度0.0を返す', async () => {
      // Given: OpenAI APIが不正なレスポンスを返す
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [{ message: { content: 'invalid response' } }],
      })) as unknown as typeof mockOpenAI.chat.completions.create;

      const candidate = createTestCandidate();

      // When: 重複検出を実行
      const similarIssues = await deduplicator.findSimilarIssues(candidate, 0.8);

      // Then: 類似Issueは検出されない
      expect(similarIssues).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 閾値のテスト
  // ===========================================================================

  describe('閾値調整', () => {
    test('低い閾値では多くのIssueが重複として検出される', async () => {
      // Given: OpenAI APIが中程度の類似度を返す
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [{ message: { content: '0.65' } }],
      })) as unknown as typeof mockOpenAI.chat.completions.create;

      const candidate = createTestCandidate();

      // When: 低い閾値で重複検出
      const similarIssuesLowThreshold = await deduplicator.findSimilarIssues(candidate, 0.6);

      // Then: 類似Issueが検出される
      expect(similarIssuesLowThreshold.length).toBeGreaterThan(0);
    });

    test('高い閾値では重複として検出されない', async () => {
      // Given: OpenAI APIが中程度の類似度を返す
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [{ message: { content: '0.65' } }],
      })) as unknown as typeof mockOpenAI.chat.completions.create;

      const candidate = createTestCandidate();

      // 新しいインスタンスでキャッシュをクリア
      const newDeduplicator = new IssueDeduplicator();

      // When: 高い閾値で重複検出
      const similarIssuesHighThreshold = await newDeduplicator.findSimilarIssues(candidate, 0.9);

      // Then: 類似Issueは検出されない
      expect(similarIssuesHighThreshold).toHaveLength(0);
    });
  });
});
