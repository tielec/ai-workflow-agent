import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../src/core/config.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { DEFAULT_WORKFLOW_LANGUAGE, type WorkflowLanguage } from '../../src/types.js';

describe('Integration: language setting flow (Issue #489)', () => {
  let tempDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;
  let originalEnv: NodeJS.ProcessEnv;

  const resolveLanguage = (cliLanguage?: WorkflowLanguage) => {
    const envLanguage = config.getWorkflowLanguage();
    const metadataLanguage = metadataManager.getLanguage();
    return cliLanguage ?? envLanguage ?? metadataLanguage ?? DEFAULT_WORKFLOW_LANGUAGE;
  };

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'language-setting-'));
    const workflowDir = path.join(tempDir, '.ai-workflow', 'issue-489');
    metadataPath = path.join(workflowDir, 'metadata.json');

    await WorkflowState.createNew(
      metadataPath,
      '489',
      'https://example.com/issues/489',
      'Language setting integration test',
    );

    metadataManager = new MetadataManager(metadataPath);
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('persists a CLI-provided language into metadata and reloads it', () => {
    metadataManager.setLanguage('en');

    const reloaded = new MetadataManager(metadataPath);

    expect(reloaded.getLanguage()).toBe('en');
  });

  it('prioritizes CLI language over environment and metadata values', () => {
    metadataManager.setLanguage('ja');
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';

    const resolved = resolveLanguage('en');

    expect(resolved).toBe('en');
  });

  it('uses environment language when CLI is absent and metadata differs', () => {
    metadataManager.setLanguage('ja');
    process.env.AI_WORKFLOW_LANGUAGE = 'EN';

    const resolved = resolveLanguage();

    expect(resolved).toBe('en');
  });

  it('falls back to metadata when environment contains an invalid value', () => {
    metadataManager.setLanguage('en');
    process.env.AI_WORKFLOW_LANGUAGE = 'french';

    const resolved = resolveLanguage();

    expect(resolved).toBe('en');
  });

  it('defaults to ja when CLI, environment, and metadata are all missing', () => {
    metadataManager.data.language = null;
    delete process.env.AI_WORKFLOW_LANGUAGE;

    const resolved = resolveLanguage();

    expect(resolved).toBe(DEFAULT_WORKFLOW_LANGUAGE);
  });
});
