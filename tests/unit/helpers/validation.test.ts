import {
  validatePhaseName,
  validateStepName,
  validateIssueNumber,
} from '../../../src/core/helpers/validation.js';

describe('validation', () => {
  describe('validatePhaseName', () => {
    // REQ-008: バリデーション処理の分離
    it('正常系: 有効なフェーズ名に対してtrueを返す', () => {
      // Given: 有効なフェーズ名のリスト（アンダースコア形式、プレフィックスなし）
      const validPhases = [
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'test_preparation',
        'testing',
        'documentation',
        'report',
        'evaluation',
      ];

      // When/Then: 各フェーズ名でvalidatePhaseName関数を呼び出す
      validPhases.forEach((phase) => {
        expect(validatePhaseName(phase)).toBe(true);
      });
    });

    it('異常系: 無効なフェーズ名に対してfalseを返す', () => {
      // Given: 無効なフェーズ名のリスト
      const invalidPhases = ['invalid', 'foo', ''];

      // When/Then: 各フェーズ名でvalidatePhaseName関数を呼び出す
      invalidPhases.forEach((phase) => {
        expect(validatePhaseName(phase)).toBe(false);
      });
    });
  });

  describe('validateStepName', () => {
    it('正常系: 有効なステップ名に対してtrueを返す', () => {
      // Given: 有効なステップ名のリスト
      const validSteps = ['execute', 'review', 'revise'];

      // When/Then: 各ステップ名でvalidateStepName関数を呼び出す
      validSteps.forEach((step) => {
        expect(validateStepName(step)).toBe(true);
      });
    });

    it('異常系: 無効なステップ名に対してfalseを返す', () => {
      // Given: 無効なステップ名のリスト
      const invalidSteps = ['invalid', 'foo', ''];

      // When/Then: 各ステップ名でvalidateStepName関数を呼び出す
      invalidSteps.forEach((step) => {
        expect(validateStepName(step)).toBe(false);
      });
    });
  });

  describe('validateIssueNumber', () => {
    it('正常系: 有効な数値に対してtrueを返す', () => {
      // Given: 1以上の整数のリスト
      const validNumbers = [1, 26, 1000];

      // When/Then: 各数値でvalidateIssueNumber関数を呼び出す
      validNumbers.forEach((num) => {
        expect(validateIssueNumber(num)).toBe(true);
      });
    });

    it('正常系: 有効な文字列に対してtrueを返す', () => {
      // Given: '1'以上の整数文字列のリスト
      const validStrings = ['1', '26', '1000'];

      // When/Then: 各文字列でvalidateIssueNumber関数を呼び出す
      validStrings.forEach((str) => {
        expect(validateIssueNumber(str)).toBe(true);
      });
    });

    it('異常系: 0以下の数値に対してfalseを返す', () => {
      // Given: 0以下の数値のリスト
      const invalidNumbers = [0, -1, -100];

      // When/Then: 各数値でvalidateIssueNumber関数を呼び出す
      invalidNumbers.forEach((num) => {
        expect(validateIssueNumber(num)).toBe(false);
      });
    });

    it('異常系: 不正な文字列に対してfalseを返す', () => {
      // Given: 不正な文字列のリスト
      const invalidStrings = ['abc', '', '0'];

      // When/Then: 各文字列でvalidateIssueNumber関数を呼び出す
      invalidStrings.forEach((str) => {
        expect(validateIssueNumber(str)).toBe(false);
      });
    });
  });
});
