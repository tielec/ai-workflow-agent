/**
 * 統合テスト: auto-issueエンドツーエンドフロー
 *
 * テスト対象:
 * - auto-issue --category bug --limit 5 --dry-run の完全実行
 * - リポジトリ探索 → 重複検出 → Issue生成の統合フロー
 *
 * テスト戦略: UNIT_INTEGRATION - 統合部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { handleAutoIssueCommand } from '../../src/commands/auto-issue.js';
import { IssueCategory, type AutoIssueOptions } from '../../src/types.js';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import { IssueDeduplicator } from '../../src/core/issue-deduplicator.js';
import { IssueGenerator } from '../../src/core/issue-generator.js';

// モック設定
jest.mock('../../src/core/repository-analyzer.js');
jest.mock('../../src/core/issue-deduplicator.js');
jest.mock('../../src/core/issue-generator.js');
jest.mock('../../src/core/config.js', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'test-github-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getOpenAiApiKey: jest.fn(() => 'test-openai-key'),
  },
}));

// =============================================================================
// エンドツーエンドフローのテスト
// =============================================================================

describe('auto-issue エンドツーエンドフロー', () => {
  let mockRepositoryAnalyzer: jest.Mocked<RepositoryAnalyzer>;
  let mockIssueDeduplicator: jest.Mocked<IssueDeduplicator>;
  let mockIssueGenerator: jest.Mocked<IssueGenerator>;

  beforeEach(() => {
    // RepositoryAnalyzerのモック
    mockRepositoryAnalyzer = {
      analyzeForBugs: jest.fn(async () => [
        {
          category: IssueCategory.BUG,
          title: 'Issue 1',
          description: 'Description 1',
          file: 'file1.ts',
          lineNumber: 10,
          codeSnippet: 'code',
          confidence: 0.95,
          suggestedFixes: ['fix1'],
          expectedBenefits: ['benefit1'],
          priority: 'High',
        },
        {
          category: IssueCategory.BUG,
          title: 'Issue 2',
          description: 'Description 2',
          file: 'file2.ts',
          lineNumber: 20,
          codeSnippet: 'code',
          confidence: 0.85,
          suggestedFixes: ['fix2'],
          expectedBenefits: ['benefit2'],
          priority: 'Medium',
        },
      ]),
      analyzeForRefactoring: jest.fn(async () => []),
      analyzeForEnhancements: jest.fn(async () => []),
    } as unknown as jest.Mocked<RepositoryAnalyzer>;

    (RepositoryAnalyzer as jest.MockedClass<typeof RepositoryAnalyzer>).mockImplementation(
      () => mockRepositoryAnalyzer
    );

    // IssueDuplicatorのモック
    mockIssueDeduplicator = {
      findSimilarIssues: jest.fn(async () => []),
    } as unknown as jest.Mocked<IssueDeduplicator>;

    (IssueDeduplicator as jest.MockedClass<typeof IssueDeduplicator>).mockImplementation(
      () => mockIssueDeduplicator
    );

    // IssueGeneratorのモック
    mockIssueGenerator = {
      generateIssues: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<IssueGenerator>;

    (IssueGenerator as jest.MockedClass<typeof IssueGenerator>).mockImplementation(() => mockIssueGenerator);
  });

  // ===========================================================================
  // 完全実行フローのテスト
  // ===========================================================================

  describe('完全実行フロー', () => {
    test('auto-issue --category bug --dry-run が正常に実行される', async () => {
      // Given: ドライランオプション
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: RepositoryAnalyzerが呼ばれる
      expect(mockRepositoryAnalyzer.analyzeForBugs).toHaveBeenCalled();

      // IssueDuplicatorが各候補に対して呼ばれる
      expect(mockIssueDeduplicator.findSimilarIssues).toHaveBeenCalledTimes(2);

      // ドライランのため、IssueGeneratorは呼ばれない
      expect(mockIssueGenerator.generateIssues).not.toHaveBeenCalled();
    });

    test('auto-issue --category bug（実Issue作成）が正常に実行される', async () => {
      // Given: 実Issue作成オプション
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 3,
        dryRun: false,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: RepositoryAnalyzerが呼ばれる
      expect(mockRepositoryAnalyzer.analyzeForBugs).toHaveBeenCalled();

      // IssueDuplicatorが呼ばれる
      expect(mockIssueDeduplicator.findSimilarIssues).toHaveBeenCalled();

      // IssueGeneratorが呼ばれ、Issueが作成される
      expect(mockIssueGenerator.generateIssues).toHaveBeenCalled();
    });

    test('重複Issueがスキップされる', async () => {
      // Given: 重複Issueが存在
      mockIssueDeduplicator.findSimilarIssues = jest.fn(async (candidate) => {
        if (candidate.title === 'Issue 1') {
          // Issue 1は重複
          return [
            {
              issueNumber: 999,
              issueTitle: 'Existing Issue',
              similarityScore: 0.9,
              isDuplicate: true,
            },
          ];
        }
        return [];
      });

      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: false,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: IssueGeneratorは重複を除いた1件のみ作成
      expect(mockIssueGenerator.generateIssues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Issue 2',
          }),
        ])
      );

      // Issue 1は除外される
      const calls = (mockIssueGenerator.generateIssues as jest.Mock).mock.calls[0][0];
      expect(calls.find((c: { title: string }) => c.title === 'Issue 1')).toBeUndefined();
    });

    test('limit オプションで上限が適用される', async () => {
      // Given: 10件のIssue候補
      mockRepositoryAnalyzer.analyzeForBugs = jest.fn(async () =>
        Array.from({ length: 10 }, (_, i) => ({
          category: IssueCategory.BUG,
          title: `Issue ${i + 1}`,
          description: `Description ${i + 1}`,
          file: `file${i + 1}.ts`,
          lineNumber: 10,
          codeSnippet: 'code',
          confidence: 0.95,
          suggestedFixes: ['fix'],
          expectedBenefits: ['benefit'],
          priority: 'Medium',
        }))
      );

      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 3,
        dryRun: false,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: 最大3件のIssueのみ作成される
      expect(mockIssueGenerator.generateIssues).toHaveBeenCalledWith(expect.arrayOfSize(3));
    });
  });

  // ===========================================================================
  // allカテゴリのテスト
  // ===========================================================================

  describe('allカテゴリ', () => {
    test('all カテゴリでbug解析のみ実行される（Phase 1）', async () => {
      // Given: allカテゴリ
      const options: AutoIssueOptions = {
        category: 'all',
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: analyzeForBugs のみ呼ばれる
      expect(mockRepositoryAnalyzer.analyzeForBugs).toHaveBeenCalled();

      // Phase 2/3未実装のため、他のメソッドは呼ばれない or 空配列を返す
      // （実装では呼ばれない or 呼ばれても空配列を返す）
    });
  });
});
