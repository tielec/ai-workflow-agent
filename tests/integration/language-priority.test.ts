import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../../src/types.js';

describe('言語設定の優先順位と永続化 (Integration, Issue #526)', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = path.join(process.cwd(), 'tmp', 'language-priority', Date.now().toString());
    fs.ensureDirSync(tempDir);
    metadataPath = path.join(tempDir, 'metadata.json');
    WorkflowState.createNew(metadataPath, '526', 'https://example.com/issues/526', 'Language Option');
    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.removeSync(tempDir);
  });

  test('CLI オプションが環境変数とメタデータより優先される', () => {
    // Given
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    metadataManager.setLanguage('ja');

    // When
    const result = resolveLanguage({ cliOption: 'en', metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('環境変数がメタデータより優先される', () => {
    // Given
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    metadataManager.setLanguage('ja');

    // When
    const result = resolveLanguage({ metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('環境変数が未設定の場合はメタデータが使われる', () => {
    // Given
    delete process.env.AI_WORKFLOW_LANGUAGE;
    metadataManager.setLanguage('en');

    // When
    const result = resolveLanguage({ metadataManager });

    // Then
    expect(result).toBe('en');
  });

  test('CLI・環境変数・メタデータすべて未設定ならデフォルトにフォールバックする', () => {
    // Given
    delete process.env.AI_WORKFLOW_LANGUAGE;

    // When
    const result = resolveLanguage({});

    // Then
    expect(result).toBe(DEFAULT_LANGUAGE);
  });

  test('setLanguage で保存した値は再読込後も保持される', () => {
    // Given
    metadataManager.setLanguage('en');

    // When
    const reloaded = new MetadataManager(metadataPath);
    const savedLanguage = (fs.readJsonSync(metadataPath) as { language?: SupportedLanguage }).language;

    // Then
    expect(savedLanguage).toBe('en');
    expect(reloaded.getLanguage()).toBe('en');
  });

  test('language フィールドが無い古いメタデータでもデフォルト ja を返す', () => {
    // Given
    const legacy = fs.readJsonSync(metadataPath) as Record<string, unknown>;
    delete legacy.language;
    fs.writeJsonSync(metadataPath, legacy, { spaces: 2 });
    const reloaded = new MetadataManager(metadataPath);

    // When
    const language = reloaded.getLanguage();

    // Then
    expect(language).toBe(DEFAULT_LANGUAGE);
  });
});
