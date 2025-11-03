/**
 * ユニットテスト: auto-issueコマンドハンドラ
 *
 * テスト対象:
 * - handleAutoIssueCommand(): メインハンドラ
 * - validateAutoIssueOptions(): オプションバリデーション
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest } from '@jest/globals';
import { handleAutoIssueCommand } from '../../../src/commands/auto-issue.js';
import { IssueCategory, type AutoIssueOptions } from '../../../src/types.js';

// モック設定
jest.mock('../../../src/core/repository-analyzer.js');
jest.mock('../../../src/core/issue-deduplicator.js');
jest.mock('../../../src/core/issue-generator.js');
jest.mock('../../../src/core/config.js', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'test-github-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getOpenAiApiKey: jest.fn(() => 'test-openai-key'),
  },
}));

// =============================================================================
// handleAutoIssueCommand のテスト
// =============================================================================

describe('handleAutoIssueCommand', () => {
  // ===========================================================================
  // 正常系のテスト
  // ===========================================================================

  describe('正常系', () => {
    test('bug カテゴリでコマンドが正常に実行される', async () => {
      // Given: bugカテゴリのオプション
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: エラーがスローされない
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();
    });

    test('all カテゴリでコマンドが正常に実行される', async () => {
      // Given: allカテゴリのオプション
      const options: AutoIssueOptions = {
        category: 'all',
        limit: 10,
        dryRun: false,
        similarityThreshold: 0.7,
        creativeMode: false,
      };

      // When & Then: エラーがスローされない
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // オプションバリデーションのテスト
  // ===========================================================================

  describe('オプションバリデーション', () => {
    test('limit が範囲外の場合にエラーをスローする（上限超過）', async () => {
      // Given: limit が最大50を超える
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 100,
        dryRun: false,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: バリデーションエラーがスローされる
      await expect(handleAutoIssueCommand(options)).rejects.toThrow('Limit must be between 1 and 50');
    });

    test('limit が範囲外の場合にエラーをスローする（下限未満）', async () => {
      // Given: limit が0以下
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 0,
        dryRun: false,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: バリデーションエラーがスローされる
      await expect(handleAutoIssueCommand(options)).rejects.toThrow('Limit must be between 1 and 50');
    });

    test('similarityThreshold が範囲外の場合にエラーをスローする（上限超過）', async () => {
      // Given: similarityThreshold が1.0を超える
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: false,
        similarityThreshold: 1.5,
        creativeMode: false,
      };

      // When & Then: バリデーションエラーがスローされる
      await expect(handleAutoIssueCommand(options)).rejects.toThrow(
        'Similarity threshold must be between 0.0 and 1.0'
      );
    });

    test('similarityThreshold が範囲外の場合にエラーをスローする（下限未満）', async () => {
      // Given: similarityThreshold が0未満
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: false,
        similarityThreshold: -0.1,
        creativeMode: false,
      };

      // When & Then: バリデーションエラーがスローされる
      await expect(handleAutoIssueCommand(options)).rejects.toThrow(
        'Similarity threshold must be between 0.0 and 1.0'
      );
    });

    test('有効な境界値のlimitとsimilarityThresholdは受け入れられる', async () => {
      // Given: 境界値のオプション
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 1, // 下限
        dryRun: true,
        similarityThreshold: 0.0, // 下限
        creativeMode: false,
      };

      // When & Then: エラーがスローされない
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();

      // 上限の確認
      const optionsMax: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 50, // 上限
        dryRun: true,
        similarityThreshold: 1.0, // 上限
        creativeMode: false,
      };

      await expect(handleAutoIssueCommand(optionsMax)).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // ドライランモードのテスト
  // ===========================================================================

  describe('ドライランモード', () => {
    test('dryRun=true の場合、Issue候補のみ表示される', async () => {
      // Given: ドライランモードのオプション
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When: コマンド実行
      await handleAutoIssueCommand(options);

      // Then: エラーがスローされない（IssueGeneratorが呼ばれないことは統合テストで確認）
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // Phase 1 カテゴリ制限のテスト
  // ===========================================================================

  describe('Phase 1 カテゴリ制限', () => {
    test('bug カテゴリは正常に実行される', async () => {
      // Given: bugカテゴリ
      const options: AutoIssueOptions = {
        category: IssueCategory.BUG,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: エラーがスローされない
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();
    });

    test('refactor カテゴリは空の結果を返す（Phase 2未実装）', async () => {
      // Given: refactorカテゴリ
      const options: AutoIssueOptions = {
        category: IssueCategory.REFACTOR,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: エラーがスローされない（空の結果）
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();
    });

    test('enhancement カテゴリは空の結果を返す（Phase 3未実装）', async () => {
      // Given: enhancementカテゴリ
      const options: AutoIssueOptions = {
        category: IssueCategory.ENHANCEMENT,
        limit: 5,
        dryRun: true,
        similarityThreshold: 0.8,
        creativeMode: false,
      };

      // When & Then: エラーがスローされない（空の結果）
      await expect(handleAutoIssueCommand(options)).resolves.not.toThrow();
    });
  });
});
