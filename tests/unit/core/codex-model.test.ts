/**
 * Unit tests for Codex model resolution
 * Tests model alias resolution and default model behavior (Issue #302)
 */

import { describe, test, expect } from '@jest/globals';
import {
  CODEX_MODEL_ALIASES,
  DEFAULT_CODEX_MODEL,
  resolveCodexModel,
} from '../../../src/core/codex-agent-client.js';

// =============================================================================
// resolveCodexModel - デフォルトモデル動作
// =============================================================================

describe('resolveCodexModel', () => {
  describe('default model behavior', () => {
    test('returns DEFAULT_CODEX_MODEL when input is undefined', () => {
      // Given: undefined が入力される
      // When: resolveCodexModel(undefined) を呼び出す
      const result = resolveCodexModel(undefined);
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });

    test('returns DEFAULT_CODEX_MODEL when input is null', () => {
      // Given: null が入力される
      // When: resolveCodexModel(null) を呼び出す
      const result = resolveCodexModel(null);
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });

    test('returns DEFAULT_CODEX_MODEL when input is empty string', () => {
      // Given: 空文字列 '' が入力される
      // When: resolveCodexModel('') を呼び出す
      const result = resolveCodexModel('');
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });

    test('returns DEFAULT_CODEX_MODEL when input is whitespace only (spaces)', () => {
      // Given: 空白のみの文字列（スペース3つ）が入力される
      // When: resolveCodexModel('   ') を呼び出す
      const result = resolveCodexModel('   ');
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });

    test('returns DEFAULT_CODEX_MODEL when input is whitespace only (tab)', () => {
      // Given: 空白のみの文字列（タブ）が入力される
      // When: resolveCodexModel('\\t') を呼び出す
      const result = resolveCodexModel('\t');
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });

    test('returns DEFAULT_CODEX_MODEL when input is mixed whitespace', () => {
      // Given: 空白混在の文字列（スペース + タブ + スペース）が入力される
      // When: resolveCodexModel('  \\t  ') を呼び出す
      const result = resolveCodexModel('  \t  ');
      // Then: デフォルト値 'gpt-5.1-codex-max' が返される
      expect(result).toBe(DEFAULT_CODEX_MODEL);
    });
  });

  // =============================================================================
  // resolveCodexModel - エイリアス解決
  // =============================================================================

  describe('alias resolution', () => {
    test('resolves "max" alias to gpt-5.1-codex-max', () => {
      // Given: 'max' エイリアスが入力される
      // When: resolveCodexModel('max') を呼び出す
      const result = resolveCodexModel('max');
      // Then: 'gpt-5.1-codex-max' が返される
      expect(result).toBe('gpt-5.1-codex-max');
    });

    test('resolves "mini" alias to gpt-5.1-codex-mini', () => {
      // Given: 'mini' エイリアスが入力される
      // When: resolveCodexModel('mini') を呼び出す
      const result = resolveCodexModel('mini');
      // Then: 'gpt-5.1-codex-mini' が返される
      expect(result).toBe('gpt-5.1-codex-mini');
    });

    test('resolves "5.1" alias to gpt-5.1', () => {
      // Given: '5.1' エイリアスが入力される
      // When: resolveCodexModel('5.1') を呼び出す
      const result = resolveCodexModel('5.1');
      // Then: 'gpt-5.1' が返される
      expect(result).toBe('gpt-5.1');
    });

    test('resolves "legacy" alias to gpt-5-codex', () => {
      // Given: 'legacy' エイリアスが入力される（後方互換性）
      // When: resolveCodexModel('legacy') を呼び出す
      const result = resolveCodexModel('legacy');
      // Then: 'gpt-5-codex' が返される
      expect(result).toBe('gpt-5-codex');
    });

    test('resolves aliases case-insensitively (uppercase)', () => {
      // Given: 大文字のエイリアス 'MAX', 'MINI', 'LEGACY' が入力される
      // When: resolveCodexModel を呼び出す
      // Then: それぞれのフルモデルIDが返される（大文字小文字非区別）
      expect(resolveCodexModel('MAX')).toBe('gpt-5.1-codex-max');
      expect(resolveCodexModel('MINI')).toBe('gpt-5.1-codex-mini');
      expect(resolveCodexModel('LEGACY')).toBe('gpt-5-codex');
    });

    test('resolves aliases case-insensitively (mixed case)', () => {
      // Given: 混合ケースのエイリアス 'Max', 'Mini', 'Legacy' が入力される
      // When: resolveCodexModel を呼び出す
      // Then: それぞれのフルモデルIDが返される
      expect(resolveCodexModel('Max')).toBe('gpt-5.1-codex-max');
      expect(resolveCodexModel('Mini')).toBe('gpt-5.1-codex-mini');
      expect(resolveCodexModel('Legacy')).toBe('gpt-5-codex');
    });

    test('resolves aliases with various case combinations', () => {
      // Given: さまざまな大文字小文字の組み合わせ
      // When: resolveCodexModel を呼び出す
      // Then: 正しく解決される
      expect(resolveCodexModel('MaX')).toBe('gpt-5.1-codex-max');
      expect(resolveCodexModel('mINI')).toBe('gpt-5.1-codex-mini');
      expect(resolveCodexModel('LeGaCy')).toBe('gpt-5-codex');
    });

    test('trims leading whitespace from aliases', () => {
      // Given: 前に空白があるエイリアス '  max' が入力される
      // When: resolveCodexModel('  max') を呼び出す
      // Then: 'gpt-5.1-codex-max' が返される（空白がトリムされる）
      expect(resolveCodexModel('  max')).toBe('gpt-5.1-codex-max');
    });

    test('trims trailing whitespace from aliases', () => {
      // Given: 後ろに空白があるエイリアス 'mini  ' が入力される
      // When: resolveCodexModel('mini  ') を呼び出す
      // Then: 'gpt-5.1-codex-mini' が返される（空白がトリムされる）
      expect(resolveCodexModel('mini  ')).toBe('gpt-5.1-codex-mini');
    });

    test('trims both leading and trailing whitespace from aliases', () => {
      // Given: 前後に空白があるエイリアス '  max  ' が入力される
      // When: resolveCodexModel('  max  ') を呼び出す
      // Then: 'gpt-5.1-codex-max' が返される（空白がトリムされる）
      expect(resolveCodexModel('  max  ')).toBe('gpt-5.1-codex-max');
    });

    test('trims tab characters from aliases', () => {
      // Given: タブ文字を含むエイリアス '\\tmax\\t' が入力される
      // When: resolveCodexModel('\\tmax\\t') を呼び出す
      // Then: 'gpt-5.1-codex-max' が返される（タブがトリムされる）
      expect(resolveCodexModel('\tmax\t')).toBe('gpt-5.1-codex-max');
    });
  });

  // =============================================================================
  // resolveCodexModel - フルモデルID パススルー
  // =============================================================================

  describe('full model ID passthrough', () => {
    test('returns full model ID as-is when not an alias', () => {
      // Given: フルモデルID 'gpt-5.1-codex-max' が入力される
      const fullModelId = 'gpt-5.1-codex-max';
      // When: resolveCodexModel を呼び出す
      const result = resolveCodexModel(fullModelId);
      // Then: そのまま 'gpt-5.1-codex-max' が返される
      expect(result).toBe(fullModelId);
    });

    test('returns unknown model ID as-is (passthrough)', () => {
      // Given: 未知のモデルID 'gpt-6-codex-experimental' が入力される
      const unknownModelId = 'gpt-6-codex-experimental';
      // When: resolveCodexModel を呼び出す
      const result = resolveCodexModel(unknownModelId);
      // Then: そのまま 'gpt-6-codex-experimental' が返される
      expect(result).toBe(unknownModelId);
    });

    test('preserves exact casing for full model IDs', () => {
      // Given: 大文字小文字混在のフルモデルID 'GPT-5.1-Codex-Max' が入力される
      const modelId = 'GPT-5.1-Codex-Max';
      // When: resolveCodexModel を呼び出す
      const result = resolveCodexModel(modelId);
      // Then: そのまま 'GPT-5.1-Codex-Max' が返される（大文字小文字保持）
      expect(result).toBe(modelId);
    });

    test('returns gpt-5.1-codex-mini model ID as-is', () => {
      // Given: フルモデルID 'gpt-5.1-codex-mini' が入力される
      const modelId = 'gpt-5.1-codex-mini';
      // When: resolveCodexModel を呼び出す
      const result = resolveCodexModel(modelId);
      // Then: そのまま 'gpt-5.1-codex-mini' が返される
      expect(result).toBe(modelId);
    });

    test('returns custom model ID as-is', () => {
      // Given: カスタムモデルID 'custom-codex-model-12345' が入力される
      const customModelId = 'custom-codex-model-12345';
      // When: resolveCodexModel を呼び出す
      const result = resolveCodexModel(customModelId);
      // Then: そのまま 'custom-codex-model-12345' が返される
      expect(result).toBe(customModelId);
    });
  });
});

// =============================================================================
// CODEX_MODEL_ALIASES
// =============================================================================

describe('CODEX_MODEL_ALIASES', () => {
  test('contains expected aliases', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // Then: 期待されるエイリアスが定義されている
    expect(CODEX_MODEL_ALIASES).toHaveProperty('max');
    expect(CODEX_MODEL_ALIASES).toHaveProperty('mini');
    expect(CODEX_MODEL_ALIASES).toHaveProperty(['5.1']);
    expect(CODEX_MODEL_ALIASES).toHaveProperty('legacy');
  });

  test('max alias maps to gpt-5.1-codex-max', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // When: 'max' キーを参照する
    // Then: 'gpt-5.1-codex-max' が設定されている
    expect(CODEX_MODEL_ALIASES.max).toBe('gpt-5.1-codex-max');
  });

  test('mini alias maps to gpt-5.1-codex-mini', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // When: 'mini' キーを参照する
    // Then: 'gpt-5.1-codex-mini' が設定されている
    expect(CODEX_MODEL_ALIASES.mini).toBe('gpt-5.1-codex-mini');
  });

  test('5.1 alias maps to gpt-5.1', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // When: '5.1' キーを参照する
    // Then: 'gpt-5.1' が設定されている
    expect(CODEX_MODEL_ALIASES['5.1']).toBe('gpt-5.1');
  });

  test('legacy alias maps to gpt-5-codex', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // When: 'legacy' キーを参照する
    // Then: 'gpt-5-codex' が設定されている（後方互換性）
    expect(CODEX_MODEL_ALIASES.legacy).toBe('gpt-5-codex');
  });

  test('contains exactly 4 aliases', () => {
    // Given: CODEX_MODEL_ALIASES 定数
    // When: キー数を確認
    // Then: 4つのエイリアスが定義されている
    expect(Object.keys(CODEX_MODEL_ALIASES).length).toBe(4);
  });
});

// =============================================================================
// DEFAULT_CODEX_MODEL
// =============================================================================

describe('DEFAULT_CODEX_MODEL', () => {
  test('is set to gpt-5.1-codex-max', () => {
    // Given: DEFAULT_CODEX_MODEL 定数
    // When: 値を参照する
    // Then: 'gpt-5.1-codex-max' が設定されている
    expect(DEFAULT_CODEX_MODEL).toBe('gpt-5.1-codex-max');
  });

  test('matches the value of max alias', () => {
    // Given: DEFAULT_CODEX_MODEL と CODEX_MODEL_ALIASES
    // When: 比較する
    // Then: デフォルト値が 'max' エイリアスと一致する
    expect(DEFAULT_CODEX_MODEL).toBe(CODEX_MODEL_ALIASES.max);
  });
});
