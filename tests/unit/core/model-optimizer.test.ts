import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ModelOptimizer, DEFAULT_DIFFICULTY_MODEL_MAPPING } from '../../../src/core/model-optimizer.js';
import { logger } from '../../../src/utils/logger.js';

describe('ModelOptimizer', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  describe('default mapping', () => {
    it('returns lightweight models for simple execute step (TC-MO-001)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('planning', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns lightweight models for simple review step (TC-MO-002)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('implementation', 'review');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns lightweight models for simple test_preparation execute (TC-MO-018)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('test_preparation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns high quality models for moderate planning execute (TC-MO-003)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('planning', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for moderate test_preparation execute (TC-MO-019)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('test_preparation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for moderate revise steps in code phases (TC-MO-004)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('implementation', 'revise');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for complex test_preparation execute (TC-MO-020)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('test_preparation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns lightweight models for moderate documentation execute (TC-MO-005)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('documentation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('returns high quality models for complex execute steps (TC-MO-006)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('implementation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('returns high quality models for complex revise steps (TC-MO-007)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('testing', 'revise');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });

    it('falls back to complex mapping for unknown difficulty', () => {
      // Given
      const optimizer = new ModelOptimizer('unknown' as any);

      // When
      const result = optimizer.resolveModel('design', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });
  });

  describe('review lightweight rule', () => {
    it('forces lightweight models for all phases at simple/moderate/complex (TC-MO-008/009/010)', () => {
      // Given
      const phases = ['planning', 'implementation', 'evaluation'] as const;
      const levels: Array<'simple' | 'moderate' | 'complex'> = ['simple', 'moderate', 'complex'];

      // Then
      for (const level of levels) {
        const optimizer = new ModelOptimizer(level);
        for (const phase of phases) {
          const result = optimizer.resolveModel(phase, 'review');
          expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
        }
      }
    });

    it('forces lightweight models even when overrides are provided (TC-MO-011)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('implementation', 'review', {
        claudeModel: 'opus',
        codexModel: 'max',
      });

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });
  });

  describe('overrides and metadata config', () => {
    it('applies CLI/environment overrides for execute step (TC-MO-012)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('implementation', 'execute', {
        claudeModel: 'sonnet',
        codexModel: 'mini',
      });

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('prefers model_config over defaults when provided (TC-MO-013)', () => {
      // Given
      const modelConfig = {
        implementation: {
          execute: { claudeModel: 'sonnet' as const, codexModel: 'mini' as const },
          review: { claudeModel: 'sonnet' as const, codexModel: 'mini' as const },
          revise: { claudeModel: 'sonnet' as const, codexModel: 'mini' as const },
        },
      };
      const optimizer = new ModelOptimizer('moderate', modelConfig);

      // When
      const result = optimizer.resolveModel('implementation', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('uses defaults when model_config is null (TC-MO-014)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple', null);

      // When
      const result = optimizer.resolveModel('planning', 'execute');

      // Then
      expect(result).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });

    it('ignores invalid overrides and keeps base config (TC-MO-017)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('implementation', 'execute', {
        claudeModel: 'invalid-model',
        codexModel: 'invalid-model',
      });

      // Then
      expect(result).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    });
  });

  describe('model name normalization', () => {
    it('normalizes Claude opus alias (TC-MO-015)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('planning', 'execute', { claudeModel: 'claude-opus' });

      // Then
      expect(result.claudeModel).toBe('opus');
    });

    it('normalizes Claude model aliases case-insensitively (TC-MO-016)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const result = optimizer.resolveModel('planning', 'execute', { claudeModel: 'SONNET' });

      // Then
      expect(result.claudeModel).toBe('sonnet');
      expect(result.codexModel).toBe('mini');
    });

    it('normalizes Codex model aliases case-insensitively', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const result = optimizer.resolveModel('implementation', 'execute', { codexModel: 'codex-max' });

      // Then
      expect(result.codexModel).toBe('max');
      expect(result.claudeModel).toBe('opus');
    });

    it('normalizes Codex mini alias (TC-MO-019)', () => {
      // Given
      const optimizer = new ModelOptimizer('moderate');

      // When
      const result = optimizer.resolveModel('requirements', 'execute', { codexModel: 'MINI' });

      // Then
      expect(result.codexModel).toBe('mini');
    });
  });

  describe('generateModelConfig', () => {
    it('clones the default mapping for the selected difficulty (TC-MO-020)', () => {
      // Given
      const optimizer = new ModelOptimizer('simple');

      // When
      const generated = optimizer.generateModelConfig();

      // Then
      expect(generated).toEqual(DEFAULT_DIFFICULTY_MODEL_MAPPING.simple);

      // Mutating the generated config should not affect defaults
      generated.planning!.execute.claudeModel = 'opus';
      expect(DEFAULT_DIFFICULTY_MODEL_MAPPING.simple.planning.execute.claudeModel).toBe('sonnet');
    });

    it('generates complex mapping with high-quality execute/revise (TC-MO-021)', () => {
      // Given
      const optimizer = new ModelOptimizer('complex');

      // When
      const generated = optimizer.generateModelConfig();

      // Then
      expect(generated.implementation.execute).toEqual({ claudeModel: 'opus', codexModel: 'max' });
      expect(generated.testing.revise).toEqual({ claudeModel: 'opus', codexModel: 'max' });
      expect(generated.report.review).toEqual({ claudeModel: 'sonnet', codexModel: 'mini' });
    });
  });
});
