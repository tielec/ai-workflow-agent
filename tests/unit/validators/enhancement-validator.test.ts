/**
 * ユニットテスト: EnhancementProposal バリデーション
 *
 * テスト対象: src/core/repository-analyzer.ts - validateEnhancementProposal()
 * テストシナリオ: test-scenario.md の 2.1.1 〜 2.1.8
 */

import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { EnhancementProposal } from '../../../src/types/auto-issue.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/utils/logger.js');
jest.mock('../../../src/core/config.js');

describe('EnhancementProposal Validation', () => {
  let analyzer: RepositoryAnalyzer;

  beforeEach(() => {
    // RepositoryAnalyzer のコンストラクタには codexClient と claudeClient が必要
    // テストでは null を渡す（バリデーション機能はクライアントを使用しないため）
    analyzer = new RepositoryAnalyzer(null as any, null as any);
  });

  /**
   * テストケース 2.1.1: validateEnhancementProposal_正常系
   *
   * 目的: 有効な EnhancementProposal がバリデーションを通過することを検証
   */
  describe('TC-2.1.1: validateEnhancementProposal - valid proposal', () => {
    it('should accept valid EnhancementProposal', () => {
      // Given: 有効な提案
      const validProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack通知機能の追加 - ワークフロー完了時に自動通知を送信する機能', // 50-100文字 (89文字)
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: [
          'Slack Incoming Webhook を使用',
          'EvaluationPhase.run() 完了後に通知処理を追加',
        ],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts', 'src/core/notification-manager.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(validProposal);

      // Then: バリデーションが成功する
      expect(result).toBe(true);
    });
  });

  /**
   * テストケース 2.1.2: validateEnhancementProposal_異常系_title不足
   *
   * 目的: title が 10文字未満の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.2: validateEnhancementProposal - title too short', () => {
    it('should reject proposal with title less than 10 characters', () => {
      // Given: titleが10文字未満の提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack', // 10文字未満
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.3: validateEnhancementProposal_異常系_title超過
   *
   * 目的: title が 200文字を超える場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.3: validateEnhancementProposal - title too long', () => {
    it('should reject proposal with title exceeding 200 characters', () => {
      // Given: titleが200文字を超える提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title:
          'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能で、この機能はチームメンバー全員に対してリアルタイムで通知を送信する高度な機能です。さらにこの機能は複数のチャネルへの同時通知、メンション機能、カスタマイズ可能なメッセージテンプレート、そしてエラー発生時の即座のアラート機能も含まれています。', // 200文字超過
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。',
        rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.4: validateEnhancementProposal_異常系_description不足
   *
   * 目的: description が 100文字未満の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.4: validateEnhancementProposal - description too short', () => {
    it('should reject proposal with description less than 100 characters', () => {
      // Given: descriptionが100文字未満の提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description: 'Slack 通知機能を追加する。', // 100文字未満
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.5: validateEnhancementProposal_異常系_rationale不足
   *
   * 目的: rationale が 50文字未満の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.5: validateEnhancementProposal - rationale too short', () => {
    it('should reject proposal with rationale less than 50 characters', () => {
      // Given: rationaleが50文字未満の提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale: 'チーム連携を改善する。', // 50文字未満
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.6: validateEnhancementProposal_異常系_implementation_hints空
   *
   * 目的: implementation_hints が空配列の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.6: validateEnhancementProposal - empty implementation_hints', () => {
    it('should reject proposal with empty implementation_hints array', () => {
      // Given: implementation_hintsが空配列の提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: [], // 空配列
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.7: validateEnhancementProposal_異常系_related_files空
   *
   * 目的: related_files が空配列の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.7: validateEnhancementProposal - empty related_files', () => {
    it('should reject proposal with empty related_files array', () => {
      // Given: related_filesが空配列の提案
      const invalidProposal: EnhancementProposal = {
        type: 'integration',
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: [], // 空配列
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * テストケース 2.1.8: validateEnhancementProposal_異常系_type無効
   *
   * 目的: type が無効な値の場合、バリデーションが失敗することを検証
   */
  describe('TC-2.1.8: validateEnhancementProposal - invalid type', () => {
    it('should reject proposal with invalid type', () => {
      // Given: typeが無効な提案
      const invalidProposal: any = {
        type: 'invalid_type', // 無効なtype
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description:
          'AI Workflow Agent のワークフロー完了時（Phase 9: Evaluation 完了）に、Slack チャンネルへ自動通知を送信する機能。Issue タイトル、PR リンク、実行時間、コスト情報をリッチメッセージで表示する。',
        rationale:
          'チームメンバーがワークフロー完了をリアルタイムで把握でき、レビュー依頼の見落としを防止。非同期コミュニケーションの効率化により、開発速度が向上する。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/phases/evaluation.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(invalidProposal);

      // Then: バリデーションが失敗する
      expect(result).toBe(false);
    });
  });

  /**
   * 追加テスト: 全タイプのバリデーション
   */
  describe('Additional: All valid types should be accepted', () => {
    const validTypes: Array<EnhancementProposal['type']> = [
      'improvement',
      'integration',
      'automation',
      'dx',
      'quality',
      'ecosystem',
    ];

    test.each(validTypes)('should accept type: %s', (type) => {
      // Given: 有効なtypeを持つ提案
      const proposal: EnhancementProposal = {
        type,
        title: 'Valid proposal title that meets the minimum length requirement',
        description:
          'This is a valid description that meets the minimum length requirement of 100 characters for the EnhancementProposal type.',
        rationale:
          'This is a valid rationale that meets the minimum length requirement of 50 characters.',
        implementation_hints: ['Implementation hint 1', 'Implementation hint 2'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/test/file1.ts', 'src/test/file2.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(proposal);

      // Then: バリデーションが成功する
      expect(result).toBe(true);
    });
  });

  /**
   * 追加テスト: expected_impactのバリデーション
   */
  describe('Additional: expected_impact validation', () => {
    const validImpacts: Array<EnhancementProposal['expected_impact']> = ['low', 'medium', 'high'];

    test.each(validImpacts)('should accept expected_impact: %s', (impact) => {
      // Given: 有効なexpected_impactを持つ提案
      const proposal: EnhancementProposal = {
        type: 'integration',
        title: 'Valid proposal title that meets the minimum length requirement',
        description:
          'This is a valid description that meets the minimum length requirement of 100 characters for the EnhancementProposal type.',
        rationale:
          'This is a valid rationale that meets the minimum length requirement of 50 characters.',
        implementation_hints: ['Implementation hint 1'],
        expected_impact: impact,
        effort_estimate: 'small',
        related_files: ['src/test/file.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(proposal);

      // Then: バリデーションが成功する
      expect(result).toBe(true);
    });
  });

  /**
   * 追加テスト: effort_estimateのバリデーション
   */
  describe('Additional: effort_estimate validation', () => {
    const validEfforts: Array<EnhancementProposal['effort_estimate']> = [
      'small',
      'medium',
      'large',
    ];

    test.each(validEfforts)('should accept effort_estimate: %s', (effort) => {
      // Given: 有効なeffort_estimateを持つ提案
      const proposal: EnhancementProposal = {
        type: 'integration',
        title: 'Valid proposal title that meets the minimum length requirement',
        description:
          'This is a valid description that meets the minimum length requirement of 100 characters for the EnhancementProposal type.',
        rationale:
          'This is a valid rationale that meets the minimum length requirement of 50 characters.',
        implementation_hints: ['Implementation hint 1'],
        expected_impact: 'medium',
        effort_estimate: effort,
        related_files: ['src/test/file.ts'],
      };

      // When: バリデーションを実行
      const result = (analyzer as any).validateEnhancementProposal(proposal);

      // Then: バリデーションが成功する
      expect(result).toBe(true);
    });
  });
});
