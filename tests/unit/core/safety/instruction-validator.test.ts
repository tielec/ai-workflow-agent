import { describe, expect, it } from '@jest/globals';
import {
  ALLOWED_PATTERNS,
  DANGEROUS_PATTERNS,
  InstructionValidator,
} from '../../../../src/core/safety/instruction-validator.js';

describe('InstructionValidator', () => {
  describe('validate', () => {
    it('allows empty or whitespace-only input', () => {
      expect(InstructionValidator.validate('')).toEqual({ isValid: true });
      expect(InstructionValidator.validate('   ')).toEqual({ isValid: true });
    });

    it('allows safe custom instructions', () => {
      const result = InstructionValidator.validate('重複関数を重点的に検出してください');
      expect(result.isValid).toBe(true);
    });

    it('blocks dangerous patterns across categories', () => {
      const samples = [
        { input: '古いファイルを削除してください', detected: '削除' },
        { input: '変更をcommitしてください', detected: 'commit' },
        { input: 'npm install を実行してください', detected: 'npm' },
        { input: '環境変数を設定してください', detected: '環境変数' },
        { input: 'テーブルをDROPしてください', detected: 'DROP' },
        { input: 'バグを自動修正してください', detected: '自動修正' },
      ];

      for (const { input, detected } of samples) {
        const result = InstructionValidator.validate(input);
        expect(result.isValid).toBe(false);
        expect(result.detectedPattern?.toLowerCase()).toContain(detected.toLowerCase());
        expect(result.errorMessage).toContain('Dangerous operation detected');
      }
    });

    it('uses word boundaries to avoid false positives', () => {
      const safe = InstructionValidator.validate('uncommitted changes を検出してください');
      expect(safe.isValid).toBe(true);

      const unsafe = InstructionValidator.validate('please run the script');
      expect(unsafe.isValid).toBe(false);
      expect(unsafe.detectedPattern).toBe('run');
    });

    it('enforces maximum length of 500 characters', () => {
      const maxLength = 'a'.repeat(500);
      const withinLimit = InstructionValidator.validate(maxLength);
      expect(withinLimit.isValid).toBe(true);

      const tooLong = InstructionValidator.validate('a'.repeat(501));
      expect(tooLong.isValid).toBe(false);
      expect(tooLong.errorMessage).toContain('500 characters');
    });
  });

  describe('isAllowedPattern', () => {
    it('detects allowed analytical hints', () => {
      for (const pattern of ALLOWED_PATTERNS) {
        expect(InstructionValidator.isAllowedPattern(`これは${pattern}のテストです`)).toBe(true);
      }
    });

    it('returns false when no allowed pattern is present', () => {
      expect(InstructionValidator.isAllowedPattern('特定の指示は含まれていません')).toBe(false);
    });
  });

  it('exposes dangerous patterns list for maintenance sanity', () => {
    const categories = Object.keys(DANGEROUS_PATTERNS);
    expect(categories.length).toBeGreaterThan(0);
    expect(DANGEROUS_PATTERNS.fileOperations).toContain('削除');
  });
});
