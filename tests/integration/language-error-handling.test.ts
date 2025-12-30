import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command, Option } from 'commander';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../src/types.js';

describe('Issue #526: 言語オプションのエラーハンドリング (Integration)', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;
  let metadataPath: string;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    tempDir = path.join(os.tmpdir(), 'ai-workflow-language-errors', Date.now().toString());
    fs.ensureDirSync(tempDir);
    metadataPath = path.join(tempDir, 'metadata.json');
    WorkflowState.createNew(metadataPath, '526', 'https://example.com/issues/526', 'Language');
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    jest.restoreAllMocks();
    fs.removeSync(tempDir);
  });

  test('無効な CLI 言語値ではエラーが報告される', async () => {
    const program = new Command().exitOverride();
    program
      .command('execute')
      .addOption(
        new Option(
          '--language <lang>',
          `Workflow language (${SUPPORTED_LANGUAGES.join('|')})`,
        ).choices([...SUPPORTED_LANGUAGES]),
      );

    expect(() => program.parse(['execute', '--language', 'fr'], { from: 'user' })).toThrow(
      "--language <lang>' argument 'fr' is invalid",
    );
  });

  test('無効な環境変数値は警告してデフォルト ja にフォールバックする', () => {
    // Given
    process.env.AI_WORKFLOW_LANGUAGE = 'invalid';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new MetadataManager(metadataPath);

    // When
    const resolved = resolveLanguage({ metadataManager: manager });

    // Then
    expect(resolved).toBe(DEFAULT_LANGUAGE);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid AI_WORKFLOW_LANGUAGE value 'invalid'"),
    );
  });
});
