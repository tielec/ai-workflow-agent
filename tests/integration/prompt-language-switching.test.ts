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
import { resolveLanguage } from '../../src/core/language-resolver.js';
import { WorkflowState } from '../../src/core/workflow-state.js';
import { logger } from '../../src/utils/logger.js';
import { PROMPT_LANGUAGE_INSTRUCTIONS } from '../../src/prompts/prompt-language-instructions.js';
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
  'test_preparation',
  'testing',
  'documentation',
  'report',
  'evaluation',
];

const collectPromptFiles = (lang: 'en' | 'ja'): string[] => {
  const files: string[] = [];
  fs.readdirSync(promptsRoot).forEach((category) => {
    const langDir = path.join(promptsRoot, category, lang);
    if (!fs.existsSync(langDir) || !fs.statSync(langDir).isDirectory()) {
      return;
    }

    fs.readdirSync(langDir).forEach((file) => {
      if (file.endsWith('.txt')) {
        files.push(path.join(langDir, file));
      }
    });
  });
  return files;
};

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
  let originalEnv: NodeJS.ProcessEnv;

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
    const data = fs.readJsonSync(metadataPath);
    data.target_repository = {
      path: workingDir,
      repo: path.basename(workingDir),
    };
    fs.writeJsonSync(metadataPath, data, { spaces: 2 });
    metadataManager = new MetadataManager(metadataPath);
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
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
    process.env = originalEnv;
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
    expect(prompt).toContain(PROMPT_LANGUAGE_INSTRUCTIONS.ja);
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
    expect(prompt).toContain(PROMPT_LANGUAGE_INSTRUCTIONS.en);
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

  test('resolves CLI language override and uses it for prompt selection', () => {
    // Ensure CLI choice outranks env/metadata and is persisted for prompt loading
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    metadataManager.setLanguage('ja');
    const resolvedLanguage = resolveLanguage({ cliOption: 'en', metadataManager });
    metadataManager.setLanguage(resolvedLanguage);

    const phase = createPhase();
    const prompt = phase.readPrompt('review');
    const expected = fs.readFileSync(
      path.join(promptsRoot, 'planning', 'en', 'review.txt'),
      'utf-8'
    );

    expect(metadataManager.getLanguage()).toBe('en');
    expect(prompt).toBe(expected);
  });

  test('all prompts include the required language instruction near the top', () => {
    languages.forEach((lang) => {
      const files = collectPromptFiles(lang);
      expect(files.length).toBeGreaterThan(0);
      files.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const nonEmptyLines = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line !== '');
        const instruction = PROMPT_LANGUAGE_INSTRUCTIONS[lang];
        const instructionIndex = nonEmptyLines.indexOf(instruction);
        const firstLine = nonEmptyLines[0] ?? '';

        expect(instructionIndex).not.toBe(-1);
        if (firstLine.startsWith('#')) {
          expect(instructionIndex).toBe(1);
        } else {
          expect(instructionIndex).toBe(0);
        }
      });
    });
  });

  test('language instruction appears exactly once in each prompt file', () => {
    languages.forEach((lang) => {
      const files = collectPromptFiles(lang);
      files.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const instruction = PROMPT_LANGUAGE_INSTRUCTIONS[lang];
        const occurrences = content.split(instruction).length - 1;

        expect(occurrences).toBe(1);
      });
    });
  });

  test('prompt inventory matches expected counts by language', () => {
    expect(collectPromptFiles('en').length).toBe(48);
    expect(collectPromptFiles('ja').length).toBe(48);
  });

  test('auto-issue and utility prompts include language instructions', () => {
    const categoryFiles: Record<string, string[]> = {
      'auto-issue': [
        'detect-bugs',
        'detect-enhancements',
        'detect-refactoring',
        'generate-issue-body',
        'generate-enhancement-issue-body',
        'generate-refactor-issue-body',
      ],
      'pr-comment': ['analyze', 'execute'],
      rollback: ['auto-analyze'],
      difficulty: ['analyze'],
      followup: ['generate-followup-issue'],
      squash: ['generate-message'],
      content_parser: [
        'parse_review_result',
        'parse_evaluation_decision',
        'extract_design_decisions',
      ],
      validation: ['validate-instruction'],
      'auto-close': ['inspect-issue'],
      'rewrite-issue': ['rewrite-issue'],
    };

    languages.forEach((lang) => {
      const instruction = PROMPT_LANGUAGE_INSTRUCTIONS[lang];
      Object.entries(categoryFiles).forEach(([category, files]) => {
        files.forEach((file) => {
          const filePath = path.join(promptsRoot, category, lang, `${file}.txt`);
          expect(fs.existsSync(filePath)).toBe(true);
          const content = fs.readFileSync(filePath, 'utf-8');

          expect(content).toContain(instruction);
        });
      });
    });
  });
});
