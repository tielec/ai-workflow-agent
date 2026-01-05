import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { WorkflowState } from '../../../src/core/workflow-state.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';

describe('MetadataManager - 言語設定 (Issue #526)', () => {
  let tempDir: string;
  let metadataPath: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), 'tmp', 'metadata-language', Date.now().toString());
    fs.ensureDirSync(tempDir);
    metadataPath = path.join(tempDir, 'metadata.json');
    WorkflowState.createNew(metadataPath, '526', 'https://example.com/issues/526', 'Language Test');
  });

  afterEach(() => {
    fs.removeSync(tempDir);
    jest.restoreAllMocks();
  });

  test('setLanguage で ja を保存できる', () => {
    // Given
    const manager = new MetadataManager(metadataPath);

    // When
    manager.setLanguage('ja');

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(saved.language).toBe('ja');
  });

  test('setLanguage で保存した値がメタデータに永続化される', () => {
    // Given
    const manager = new MetadataManager(metadataPath);

    // When
    manager.setLanguage('en');

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(saved.language).toBe('en');
  });

  test('既存の言語設定を上書き保存できる', () => {
    // Given
    const manager = new MetadataManager(metadataPath);
    manager.setLanguage('ja');

    // When
    manager.setLanguage('en');

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(saved.language).toBe('en');
  });

  test('language に ja が保存されていれば ja を返す', () => {
    // Given
    const manager = new MetadataManager(metadataPath);
    manager.setLanguage('ja');

    // When
    const result = manager.getLanguage();

    // Then
    expect(result).toBe('ja');
  });

  test('language に en が保存されていれば en を返す', () => {
    // Given
    const manager = new MetadataManager(metadataPath);
    manager.setLanguage('en');

    // When
    const result = manager.getLanguage();

    // Then
    expect(result).toBe('en');
  });

  test('language フィールドが欠落していてもデフォルト ja を返す', () => {
    // Given
    const withoutLanguage = fs.readJsonSync(metadataPath) as Record<string, unknown>;
    delete withoutLanguage.language;
    fs.writeJsonSync(metadataPath, withoutLanguage, { spaces: 2 });
    const manager = new MetadataManager(metadataPath);

    // When
    const result = manager.getLanguage();

    // Then
    expect(result).toBe(DEFAULT_LANGUAGE);
  });

  test('古いスキーマのメタデータでもデフォルト ja を返す', () => {
    // Given
    const legacy = fs.readJsonSync(metadataPath) as Record<string, unknown>;
    delete legacy.language;
    legacy.version = '0.1.0';
    legacy.workflow_version = '0.2.0';
    fs.writeJsonSync(metadataPath, legacy, { spaces: 2 });
    const manager = new MetadataManager(metadataPath);

    // When
    const result = manager.getLanguage();

    // Then
    expect(result).toBe(DEFAULT_LANGUAGE);
  });

  test('無効な言語が指定された場合は警告を出しデフォルトにフォールバックする', () => {
    // Given
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const manager = new MetadataManager(metadataPath);

    // When
    manager.setLanguage('fr' as SupportedLanguage);

    // Then
    expect(manager.getLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported language specified in setLanguage'),
    );
  });
});
