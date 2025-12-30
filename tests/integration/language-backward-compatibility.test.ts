import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { DEFAULT_LANGUAGE } from '../../src/types.js';

describe('Issue #526: 言語設定の後方互換性 (Integration)', () => {
  let tempDir: string;
  let metadataPath: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'ai-workflow-language-compat', Date.now().toString());
    fs.ensureDirSync(tempDir);
    metadataPath = path.join(tempDir, 'metadata.json');
    WorkflowState.createNew(metadataPath, '526', 'https://example.com/issues/526', 'Language');
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  test('language フィールドが無いメタデータでもデフォルト ja を返す', () => {
    // Given
    const legacyMetadata = fs.readJsonSync(metadataPath) as Record<string, unknown>;
    delete legacyMetadata.language;
    legacyMetadata.version = '0.1.0';
    legacyMetadata.workflow_version = '0.2.0';
    fs.writeJsonSync(metadataPath, legacyMetadata, { spaces: 2 });
    const manager = new MetadataManager(metadataPath);

    // When
    const language = manager.getLanguage();

    // Then
    expect(language).toBe(DEFAULT_LANGUAGE);
  });

  test('環境変数も CLI も未設定の場合はデフォルト ja が使用される', () => {
    // Given
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
