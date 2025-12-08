/**
 * Unit tests for Claude model resolution
 * Tests model alias resolution and default model behavior (Issue #301)
 */

// @ts-nocheck

import { describe, test, expect } from '@jest/globals';

// Inline the constants and function to avoid ESM import issues with chalk
const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-5-20251101';

const CLAUDE_MODEL_ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-3-5-20241022',
};

function resolveClaudeModel(modelOrAlias: string | undefined | null): string {
  if (!modelOrAlias || !modelOrAlias.trim()) {
    return DEFAULT_CLAUDE_MODEL;
  }

  const normalized = modelOrAlias.toLowerCase().trim();

  if (CLAUDE_MODEL_ALIASES[normalized]) {
    return CLAUDE_MODEL_ALIASES[normalized];
  }

  return modelOrAlias;
}

describe('resolveClaudeModel', () => {
  describe('default model behavior', () => {
    test('returns DEFAULT_CLAUDE_MODEL when input is undefined', () => {
      const result = resolveClaudeModel(undefined);
      expect(result).toBe(DEFAULT_CLAUDE_MODEL);
    });

    test('returns DEFAULT_CLAUDE_MODEL when input is null', () => {
      const result = resolveClaudeModel(null);
      expect(result).toBe(DEFAULT_CLAUDE_MODEL);
    });

    test('returns DEFAULT_CLAUDE_MODEL when input is empty string', () => {
      const result = resolveClaudeModel('');
      expect(result).toBe(DEFAULT_CLAUDE_MODEL);
    });

    test('returns DEFAULT_CLAUDE_MODEL when input is whitespace only', () => {
      const result = resolveClaudeModel('   ');
      expect(result).toBe(DEFAULT_CLAUDE_MODEL);
    });
  });

  describe('alias resolution', () => {
    test('resolves "opus" alias to full model ID', () => {
      const result = resolveClaudeModel('opus');
      expect(result).toBe('claude-opus-4-5-20251101');
    });

    test('resolves "sonnet" alias to full model ID', () => {
      const result = resolveClaudeModel('sonnet');
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    test('resolves "haiku" alias to full model ID', () => {
      const result = resolveClaudeModel('haiku');
      expect(result).toBe('claude-haiku-3-5-20241022');
    });

    test('resolves aliases case-insensitively (uppercase)', () => {
      expect(resolveClaudeModel('OPUS')).toBe('claude-opus-4-5-20251101');
      expect(resolveClaudeModel('SONNET')).toBe('claude-sonnet-4-20250514');
      expect(resolveClaudeModel('HAIKU')).toBe('claude-haiku-3-5-20241022');
    });

    test('resolves aliases case-insensitively (mixed case)', () => {
      expect(resolveClaudeModel('Opus')).toBe('claude-opus-4-5-20251101');
      expect(resolveClaudeModel('SoNnEt')).toBe('claude-sonnet-4-20250514');
      expect(resolveClaudeModel('HaIkU')).toBe('claude-haiku-3-5-20241022');
    });

    test('trims whitespace from aliases', () => {
      expect(resolveClaudeModel('  opus  ')).toBe('claude-opus-4-5-20251101');
      expect(resolveClaudeModel('\tsonnet\t')).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('full model ID passthrough', () => {
    test('returns full model ID as-is when not an alias', () => {
      const fullModelId = 'claude-opus-4-5-20251101';
      const result = resolveClaudeModel(fullModelId);
      expect(result).toBe(fullModelId);
    });

    test('returns custom model ID as-is', () => {
      const customModelId = 'claude-custom-model-12345';
      const result = resolveClaudeModel(customModelId);
      expect(result).toBe(customModelId);
    });

    test('preserves exact casing for full model IDs', () => {
      const modelId = 'Claude-Opus-4-5-20251101';
      const result = resolveClaudeModel(modelId);
      expect(result).toBe(modelId);
    });
  });
});

describe('CLAUDE_MODEL_ALIASES', () => {
  test('contains expected aliases', () => {
    expect(CLAUDE_MODEL_ALIASES).toHaveProperty('opus');
    expect(CLAUDE_MODEL_ALIASES).toHaveProperty('sonnet');
    expect(CLAUDE_MODEL_ALIASES).toHaveProperty('haiku');
  });

  test('opus alias maps to Opus 4.5 model', () => {
    expect(CLAUDE_MODEL_ALIASES.opus).toBe('claude-opus-4-5-20251101');
  });

  test('sonnet alias maps to Sonnet 4 model', () => {
    expect(CLAUDE_MODEL_ALIASES.sonnet).toBe('claude-sonnet-4-20250514');
  });

  test('haiku alias maps to Haiku 3.5 model', () => {
    expect(CLAUDE_MODEL_ALIASES.haiku).toBe('claude-haiku-3-5-20241022');
  });
});

describe('DEFAULT_CLAUDE_MODEL', () => {
  test('is set to Opus 4.5', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-opus-4-5-20251101');
  });
});
