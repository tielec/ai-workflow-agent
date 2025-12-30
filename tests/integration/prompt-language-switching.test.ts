/**
 * Integration tests for language-based prompt loading (Issue #573)
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { BasePhase } from '../../src/phases/base-phase.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { config } from '../../src/core/config.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { logger } from '../../src/utils/logger.js';
import { DEFAULT_LANGUAGE, type PhaseExecutionResult, type PhaseName } from '../../src/types.js';

const promptsRoot = path.join(process.cwd(), 'src', 'prompts');
const languages: Array<'ja' | 'en'> = ['ja', 'en'];
const promptTypes: Array<'execute' | 'review' | 'revise'> = ['execute', 'review', 'revise'];
const allPhases: PhaseName[] = [
  'planning',
  'requirements',
  'design',
  'test_scenario',
  'implementation',
  'test_implementation',
  'testing',
  'documentation',
  'report',
  'evaluation',
];

class TestPhase extends BasePhase {
  constructor(params: any) {
    super(params);
  }

  public readPrompt(promptType: 'execute' | 'review' | 'revise'): string {
    return (this as any).loadPrompt(promptType);
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true };
  }
}

describe('Prompt language switching integration', () => {
  let tempRoot: string;
  let workingDir: string;
  let metadataPath: string;
  let metadataManager: MetadataManager;
  let github: any;
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let canInstallSpy: jest.SpyInstance;

  const createPhase = (): TestPhase =>
    new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager,
      githubClient: github,
      skipDependencyCheck: true,
    });

  const createMetadata = (): void => {
    WorkflowState.createNew(metadataPath, '573', 'https://example.com/issues/573', 'Prompt test');
    metadataManager = new MetadataManager(metadataPath);
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-prompt-lang-'));
    workingDir = path.join(tempRoot, 'workspace');
    metadataPath = path.join(workingDir, '.ai-workflow', 'issue-573', 'metadata.json');
    github = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
      createOrUpdateProgressComment: jest.fn(),
    };

    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    canInstallSpy = jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(false);
    createMetadata();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(tempRoot)) {
      fs.removeSync(tempRoot);
    }
  });

  test('loads Japanese prompts when metadata language is ja', () => {
    metadataManager.setLanguage('ja');
    const phase = createPhase();

    const prompt = phase.readPrompt('execute');
    const expected = fs.readFileSync(
      path.join(promptsRoot, 'planning', 'ja', 'execute.txt'),
      'utf-8'
    );

    expect(prompt).toBe(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('loads English prompts when metadata language is en', () => {
    metadataManager.setLanguage('en');
    const phase = createPhase();

    const prompt = phase.readPrompt('review');
    const expected = fs.readFileSync(
      path.join(promptsRoot, 'planning', 'en', 'review.txt'),
      'utf-8'
    );

    expect(prompt).toBe(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('applies updated language settings without recreating the phase', () => {
    metadataManager.setLanguage('ja');
    const phase = createPhase();

    const jaPrompt = phase.readPrompt('execute');
    metadataManager.setLanguage('en');
    const enPrompt = phase.readPrompt('execute');

    const expectedJa = fs.readFileSync(
      path.join(promptsRoot, 'planning', 'ja', 'execute.txt'),
      'utf-8'
    );
    const expectedEn = fs.readFileSync(
      path.join(promptsRoot, 'planning', 'en', 'execute.txt'),
      'utf-8'
    );

    expect(jaPrompt).toBe(expectedJa);
    expect(enPrompt).toBe(expectedEn);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('falls back to the default language when metadata has no language field', () => {
    const data = fs.readJsonSync(metadataPath);
    delete data.language;
    fs.writeJsonSync(metadataPath, data, { spaces: 2 });
    metadataManager = new MetadataManager(metadataPath);

    const phase = createPhase();
    const prompt = phase.readPrompt('execute');
    const expected = fs.readFileSync(
      path.join(promptsRoot, 'planning', DEFAULT_LANGUAGE, 'execute.txt'),
      'utf-8'
    );

    expect(prompt).toBe(expected);
    expect(metadataManager.getLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('all phases have language-specific prompts for execute/review/revise', () => {
    allPhases.forEach((phaseName) => {
      languages.forEach((lang) => {
        promptTypes.forEach((type) => {
          const filePath = path.join(promptsRoot, phaseName, lang, `${type}.txt`);
          expect(fs.existsSync(filePath)).toBe(true);
        });
      });
    });
  });
});
