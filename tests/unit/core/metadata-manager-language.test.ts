import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { DEFAULT_LANGUAGE } from '../../../src/types.js';

let templateData: Record<string, any>;

beforeAll(() => {
  const templatePath = path.join(process.cwd(), 'metadata.json.template');
  templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
});

function writeMetadata(tempDir: string, language?: string): string {
  const metadataPath = path.join(tempDir, 'metadata.json');
  const data = JSON.parse(JSON.stringify(templateData));

  data.issue_number = '571';
  data.issue_url = 'https://example.com/issues/571';
  data.issue_title = 'Language switching test';
  if (language !== undefined) {
    data.language = language;
  }

  fs.ensureDirSync(path.dirname(metadataPath));
  fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2), 'utf-8');
  return metadataPath;
}

describe('MetadataManager.getLanguage (Issue #571)', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.removeSync(tempDir);
    }
  });

  it('returns ja when metadata.language is ja', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-lang-ja-'));
    const metadataPath = writeMetadata(tempDir, 'ja');
    const manager = new MetadataManager(metadataPath);

    expect(manager.getLanguage()).toBe('ja');
  });

  it('returns en when metadata.language is en', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-lang-en-'));
    const metadataPath = writeMetadata(tempDir, 'en');
    const manager = new MetadataManager(metadataPath);

    expect(manager.getLanguage()).toBe('en');
  });

  it('falls back to DEFAULT_LANGUAGE when language is missing', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-lang-default-'));
    const metadataPath = writeMetadata(tempDir);
    const manager = new MetadataManager(metadataPath);

    expect(manager.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('rejects unsupported language codes and returns DEFAULT_LANGUAGE', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-lang-invalid-'));
    const metadataPath = writeMetadata(tempDir, 'fr');
    const manager = new MetadataManager(metadataPath);

    expect(manager.getLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
