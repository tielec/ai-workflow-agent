import { describe, expect, test } from '@jest/globals';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../../src/types.js';

describe('言語型定義と定数 (Issue #526)', () => {
  test('SUPPORTED_LANGUAGES が ja/en を許可する', () => {
    // When
    const languages = [...SUPPORTED_LANGUAGES];

    // Then
    expect(languages).toEqual(['ja', 'en']);
    expect(languages).toHaveLength(2);
  });

  test('DEFAULT_LANGUAGE が ja に設定されている', () => {
    // When / Then
    expect(DEFAULT_LANGUAGE).toBe('ja');
  });

  test('SupportedLanguage 型が ja/en のみを許可する', () => {
    // Given
    const accept = (_lang: SupportedLanguage) => _lang;

    // When / Then
    expect(accept('ja')).toBe('ja');
    expect(accept('en')).toBe('en');
    // @ts-expect-error - サポート外の言語はコンパイルエラーとする
    accept('fr');
  });
});
