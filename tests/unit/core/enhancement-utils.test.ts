/**
 * ユニットテスト: Enhancement関連のユーティリティ機能
 *
 * テスト対象:
 * - src/core/issue-generator.ts - generateEnhancementTitle(), generateEnhancementLabels()
 * - src/core/repository-analyzer.ts - parseEnhancementProposals()
 * テストシナリオ: test-scenario.md の 2.2.x, 2.3.x, 2.4.x
 */

import { IssueGenerator } from '../../../src/core/issue-generator.js';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { EnhancementProposal } from '../../../src/types/auto-issue.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/utils/logger.js');
jest.mock('../../../src/core/config.js');
jest.mock('@octokit/rest');

describe('Enhancement Utilities', () => {
  let generator: IssueGenerator;
  let analyzer: RepositoryAnalyzer;

  beforeEach(() => {
    // モッククライアントの準備
    const mockCodexClient = null as any;
    const mockClaudeClient = null as any;
    const mockOctokit: any = {
      issues: {
        create: jest.fn<any>().mockResolvedValue({ data: { number: 1, html_url: 'http://test.com' } }),
      },
    };
    const mockRepoName = 'test/test'; // リポジトリ名は owner/repo 形式の文字列

    // IssueGenerator のコンストラクタには 4つの引数が必要
    generator = new IssueGenerator(mockCodexClient, mockClaudeClient, mockOctokit, mockRepoName);
    // RepositoryAnalyzer のコンストラクタには 2つの引数が必要
    analyzer = new RepositoryAnalyzer(mockCodexClient, mockClaudeClient);
  });

  /**
   * タイトル生成ロジックのテスト
   */
  describe('Title Generation', () => {
    /**
     * テストケース 2.3.1: generateEnhancementTitle_improvement
     */
    it('TC-2.3.1: should add [Enhancement] prefix for improvement type', () => {
      // Given: type が 'improvement' の提案
      const proposal: EnhancementProposal = {
        type: 'improvement',
        title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] ⚡ CLI UI の改善 - プログレスバーとカラフルな出力を追加する');
    });

    /**
     * テストケース 2.3.2: generateEnhancementTitle_integration
     */
    it('TC-2.3.2: should add [Integration] prefix for integration type', () => {
      // Given: type が 'integration' の提案
      const proposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] 🔗 Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能');
    });

    /**
     * テストケース 2.3.3: generateEnhancementTitle_automation
     */
    it('TC-2.3.3: should add [Automation] prefix for automation type', () => {
      // Given: type が 'automation' の提案
      const proposal: EnhancementProposal = {
        type: 'automation',
        title: '定期実行機能の追加 - cron スケジュールによる自動ワークフロー実行',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'medium',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] 🤖 定期実行機能の追加 - cron スケジュールによる自動ワークフロー実行');
    });

    /**
     * テストケース 2.3.4: generateEnhancementTitle_dx
     */
    it('TC-2.3.4: should add [DX] prefix for dx type', () => {
      // Given: type が 'dx' の提案
      const proposal: EnhancementProposal = {
        type: 'dx',
        title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'medium',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] ✨ 対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化');
    });

    /**
     * テストケース 2.3.5: generateEnhancementTitle_quality
     */
    it('TC-2.3.5: should add [Quality] prefix for quality type', () => {
      // Given: type が 'quality' の提案
      const proposal: EnhancementProposal = {
        type: 'quality',
        title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] 🛡️ セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する');
    });

    /**
     * テストケース 2.3.6: generateEnhancementTitle_ecosystem
     */
    it('TC-2.3.6: should add [Ecosystem] prefix for ecosystem type', () => {
      // Given: type が 'ecosystem' の提案
      const proposal: EnhancementProposal = {
        type: 'ecosystem',
        title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'large',
        related_files: ['file.ts'],
      };

      // When: タイトル生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: プレフィックスが付与される
      expect(title).toBe('[Enhancement] 🌐 プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構');
    });
  });

  /**
   * ラベル生成ロジックのテスト
   */
  describe('Label Generation', () => {
    /**
     * テストケース 2.4.1: generateEnhancementLabels_high_impact
     */
    it('TC-2.4.1: should include impact:high for high impact', () => {
      // Given: expected_impact が 'high' の提案
      const proposal: EnhancementProposal = {
        type: 'integration',
        title: 'Valid title',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: ラベル生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: 適切なラベルが含まれる
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('impact:high');
      expect(labels).toContain('effort:small');
      expect(labels).toContain('integration');
    });

    /**
     * テストケース 2.4.2: generateEnhancementLabels_medium_impact
     */
    it('TC-2.4.2: should include impact:medium for medium impact', () => {
      // Given: expected_impact が 'medium' の提案
      const proposal: EnhancementProposal = {
        type: 'automation',
        title: 'Valid title',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'medium',
        effort_estimate: 'medium',
        related_files: ['file.ts'],
      };

      // When: ラベル生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: 適切なラベルが含まれる
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('impact:medium');
      expect(labels).toContain('effort:medium');
      expect(labels).toContain('automation');
    });

    /**
     * テストケース 2.4.3: generateEnhancementLabels_low_impact
     */
    it('TC-2.4.3: should include impact:low for low impact', () => {
      // Given: expected_impact が 'low' の提案
      const proposal: EnhancementProposal = {
        type: 'improvement',
        title: 'Valid title',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'low',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: ラベル生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: 適切なラベルが含まれる
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('impact:low');
      expect(labels).toContain('effort:small');
      expect(labels).toContain('improvement');
    });

    /**
     * テストケース 2.4.4: generateEnhancementLabels_dx_type
     */
    it('TC-2.4.4: should include developer-experience label for dx type', () => {
      // Given: type が 'dx' の提案
      const proposal: EnhancementProposal = {
        type: 'dx',
        title: 'Valid title',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'medium',
        related_files: ['file.ts'],
      };

      // When: ラベル生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: developer-experience ラベルが含まれる
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('impact:high');
      expect(labels).toContain('effort:medium');
      expect(labels).toContain('developer-experience');
    });

    /**
     * テストケース 2.4.5: generateEnhancementLabels_quality_type
     */
    it('TC-2.4.5: should include quality-assurance label for quality type', () => {
      // Given: type が 'quality' の提案
      const proposal: EnhancementProposal = {
        type: 'quality',
        title: 'Valid title',
        description: 'Valid description with more than 100 characters to meet the requirement.',
        rationale: 'Valid rationale with more than 50 characters to meet requirement.',
        implementation_hints: ['hint'],
        expected_impact: 'high',
        effort_estimate: 'small',
        related_files: ['file.ts'],
      };

      // When: ラベル生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: quality ラベルが含まれる
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('impact:high');
      expect(labels).toContain('effort:small');
      expect(labels).toContain('quality');
    });

    /**
     * 追加テスト: effort_estimateラベル
     */
    it('should include effort labels', () => {
      const testCases: Array<{
        effort: EnhancementProposal['effort_estimate'];
        expectedLabel: string;
      }> = [
        { effort: 'small', expectedLabel: 'effort:small' },
        { effort: 'medium', expectedLabel: 'effort:medium' },
        { effort: 'large', expectedLabel: 'effort:large' },
      ];

      testCases.forEach(({ effort, expectedLabel }) => {
        // Given: 各effortの提案
        const proposal: EnhancementProposal = {
          type: 'integration',
          title: 'Valid title',
          description: 'Valid description with more than 100 characters to meet the requirement.',
          rationale: 'Valid rationale with more than 50 characters to meet requirement.',
          implementation_hints: ['hint'],
          expected_impact: 'medium',
          effort_estimate: effort,
          related_files: ['file.ts'],
        };

        // When: ラベル生成
        const labels = (generator as any).generateEnhancementLabels(proposal);

        // Then: effortラベルが含まれる
        expect(labels).toContain(expectedLabel);
      });
    });
  });

  /**
   * JSONパース処理のテスト
   */
  describe('JSON Parsing', () => {
    /**
     * テストケース 2.2.1: parseEnhancementProposals_正常系_配列
     */
    it('TC-2.2.1: should parse valid JSON array', () => {
      // Given: 有効なJSON配列
      const jsonString = `[
        {
          "type": "integration",
          "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
          "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
          "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
          "implementation_hints": ["Slack Incoming Webhook を使用"],
          "expected_impact": "medium",
          "effort_estimate": "small",
          "related_files": ["src/phases/evaluation.ts"]
        }
      ]`;

      // When: パース実行
      const result = (analyzer as any).parseEnhancementProposals(jsonString);

      // Then: 配列が返される
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('integration');
    });

    /**
     * テストケース 2.2.2: parseEnhancementProposals_正常系_単一オブジェクト
     */
    it('TC-2.2.2: should convert single object to array', () => {
      // Given: 単一のJSONオブジェクト
      const jsonString = `{
        "type": "integration",
        "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
        "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
        "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
        "implementation_hints": ["Slack Incoming Webhook を使用"],
        "expected_impact": "medium",
        "effort_estimate": "small",
        "related_files": ["src/phases/evaluation.ts"]
      }`;

      // When: パース実行
      const result = (analyzer as any).parseEnhancementProposals(jsonString);

      // Then: 配列に変換される
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('integration');
    });

    /**
     * テストケース 2.2.3: parseEnhancementProposals_異常系_不正JSON_寛容パーサー成功
     */
    it('TC-2.2.3: should use lenient parser for malformed JSON', () => {
      // Given: 不正なJSON（前後にテキストあり）
      const jsonString = `エージェントからの前置きテキスト...

ここから提案を開始します：

[
  {
    "type": "integration",
    "title": "Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能",
    "description": "AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。",
    "rationale": "チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止する。",
    "implementation_hints": ["Slack Incoming Webhook を使用"],
    "expected_impact": "medium",
    "effort_estimate": "small",
    "related_files": ["src/phases/evaluation.ts"]
  }
]

以上の提案を参考にしてください。`;

      // When: パース実行
      const result = (analyzer as any).parseEnhancementProposals(jsonString);

      // Then: 寛容なパーサーで抽出される
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('integration');
    });

    /**
     * テストケース 2.2.4: parseEnhancementProposals_異常系_完全に不正JSON
     */
    it('TC-2.2.4: should return empty array for completely invalid JSON', () => {
      // Given: 完全に不正なテキスト
      const jsonString = 'これは完全に不正なテキストで、JSON配列も含まれていません。';

      // When: パース実行
      const result = (analyzer as any).parseEnhancementProposals(jsonString);

      // Then: 空配列が返される
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});
