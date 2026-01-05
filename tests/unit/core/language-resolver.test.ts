import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { resolveLanguage } from '../../../src/core/language-resolver.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../../../src/types.js';

describe('resolveLanguage (Issue #526)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('CLI オプションが最優先される', () => {
    // Given
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const metadataManager = {
      getLanguage: () => 'ja' as SupportedLanguage,
    } as any;

    // When
    const result = resolveLanguage({ cliOption: 'en', metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('環境変数がメタデータより優先される', () => {
    // Given
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const metadataManager = {
      getLanguage: () => 'ja' as SupportedLanguage,
    } as any;

    // When
    const result = resolveLanguage({ metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('メタデータが存在する場合にフォールバックとして使用される', () => {
    // Given
    delete process.env.AI_WORKFLOW_LANGUAGE;
    const metadataManager = {
      getLanguage: () => 'en' as SupportedLanguage,
    } as any;

    // When
    const result = resolveLanguage({ metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('全て未設定の場合はデフォルト言語を返す', () => {
    // Given
    delete process.env.AI_WORKFLOW_LANGUAGE;

    // When
    const result = resolveLanguage({});

    // Then
    expect(result).toBe(DEFAULT_LANGUAGE);
  });
});
