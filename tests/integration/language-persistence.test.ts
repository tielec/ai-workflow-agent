import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../../src/types.js';

describe('Issue #526: 言語設定のメタデータ永続化 (Integration)', () => {
  let tempDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = path.join(os.tmpdir(), 'ai-workflow-language-persistence', Date.now().toString());
    fs.ensureDirSync(tempDir);
    metadataPath = path.join(tempDir, 'metadata.json');
    WorkflowState.createNew(metadataPath, '526', 'https://example.com/issues/526', 'Language');
    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.removeSync(tempDir);
  });

  test('init 相当の保存処理で CLI 指定の言語を永続化できる', () => {
    // Given
    const cliLanguage: SupportedLanguage = 'en';

    // When
    metadataManager.setLanguage(cliLanguage);

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(saved.language).toBe('en');
  });

  test('既存のメタデータを CLI 指定で上書きできる', () => {
    // Given
    metadataManager.setLanguage('ja');
    const cliLanguage: SupportedLanguage = 'en';

    // When
    metadataManager.setLanguage(cliLanguage);

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(saved.language).toBe('en');
  });

  test('環境変数で解決された言語でメタデータを更新できる', () => {
    // Given
    metadataManager.setLanguage('ja');
    process.env.AI_WORKFLOW_LANGUAGE = 'en';

    // When
    const resolved = resolveLanguage({ metadataManager });
    metadataManager.setLanguage(resolved);

    // Then
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };
    expect(resolved).toBe('en');
    expect(saved.language).toBe('en');
  });

  test('言語指定が無い場合は既存メタデータの値を維持する', () => {
    // Given
    metadataManager.setLanguage('en');
    delete process.env.AI_WORKFLOW_LANGUAGE;

    // When
    const resolved = resolveLanguage({ metadataManager });
    const saved = fs.readJsonSync(metadataPath) as { language?: SupportedLanguage };

    // Then
    expect(resolved).toBe('en');
    expect(saved.language).toBe('en');
  });

  test('環境変数もメタデータも無い場合はデフォルト ja を使用する', () => {
    // Given
    delete process.env.AI_WORKFLOW_LANGUAGE;
    const metadata = fs.readJsonSync(metadataPath) as Record<string, unknown>;
    delete metadata.language;
    fs.writeJsonSync(metadataPath, metadata, { spaces: 2 });
    const manager = new MetadataManager(metadataPath);

    // When
    const resolved = resolveLanguage({ metadataManager: manager });

    // Then
    expect(resolved).toBe(DEFAULT_LANGUAGE);
  });
});
