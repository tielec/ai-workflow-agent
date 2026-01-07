/**
 * Unit tests for BasePhase.loadPrompt() language switching (Issue #573)
 *
 * Covers:
 * - Language-specific prompt selection (ja/en)
 * - Fallback to DEFAULT_LANGUAGE when prompt is missing
 * - Error when both language-specific and fallback prompts are missing
 * - Interaction with environment info injection and rollback context
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { BasePhase } from '../../../src/phases/base-phase.js';
import { config } from '../../../src/core/config.js';
import { logger } from '../../../src/utils/logger.js';
import { DEFAULT_LANGUAGE, type PhaseExecutionResult } from '../../../src/types.js';

const promptsRoot = path.resolve(process.cwd(), 'src', 'prompts');
const promptTypes: Array<'execute' | 'review' | 'revise'> = ['execute', 'review', 'revise'];

class TestPhase extends BasePhase {
  constructor(params: any) {
    super(params);
  }

  public loadPublicPrompt(promptType: 'execute' | 'review' | 'revise'): string {
    return (this as any).loadPrompt(promptType);
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true };
  }
}

describe('BasePhase.loadPrompt language switching', () => {
  let workingDir: string;
  let metadata: any;
  let github: any;
  let backups: Array<{ original: string; backup: string }>;
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let canInstallSpy: jest.SpyInstance;
  let phase: TestPhase;

  const buildPromptPath = (language: string, promptType: 'execute' | 'review' | 'revise'): string =>
    path.join(promptsRoot, 'planning', language, `${promptType}.txt`);

  const readPromptFile = (language: string, promptType: 'execute' | 'review' | 'revise'): string =>
    fs.readFileSync(buildPromptPath(language, promptType), 'utf-8');

  const moveAside = (filePath: string): void => {
    const backup = `${filePath}.bak-test-${Date.now()}`;
    fsExtra.moveSync(filePath, backup, { overwrite: true });
    backups.push({ original: filePath, backup });
  };

  const restoreBackups = (): void => {
    for (const { original, backup } of backups.reverse()) {
      if (fsExtra.existsSync(backup)) {
        fsExtra.moveSync(backup, original, { overwrite: true });
      }
    }
    backups = [];
  };

  beforeEach(() => {
    workingDir = fsExtra.mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-lang-switch-'));
    backups = [];

    metadata = {
      workflowDir: path.join(workingDir, '.ai-workflow', 'issue-573'),
      data: {
        issue_number: '573',
        target_repository: {
          path: workingDir,
          repo: path.basename(workingDir),
        },
      },
      updatePhaseStatus: jest.fn(),
      getLanguage: jest.fn().mockReturnValue(DEFAULT_LANGUAGE),
      getRollbackContext: jest.fn().mockReturnValue(null),
      addCompletedStep: jest.fn(),
      getCompletedSteps: jest.fn().mockReturnValue([]),
      updateCurrentStep: jest.fn(),
      save: jest.fn(),
    } as any;

    github = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
      createOrUpdateProgressComment: jest.fn(),
    };

    fsExtra.ensureDirSync(metadata.workflowDir);

    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    canInstallSpy = jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(false);

    phase = new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager: metadata,
      githubClient: github,
      skipDependencyCheck: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreBackups();
    if (fsExtra.existsSync(workingDir)) {
      fsExtra.removeSync(workingDir);
    }
  });

  it('loads prompts for the metadata language (ja)', () => {
    metadata.getLanguage.mockReturnValue('ja');
    const expected = readPromptFile('ja', 'execute');

    const result = phase.loadPublicPrompt('execute');

    expect(result).toBe(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('loads prompts for the metadata language (en)', () => {
    metadata.getLanguage.mockReturnValue('en');
    const expected = readPromptFile('en', 'review');

    const result = phase.loadPublicPrompt('review');

    expect(result).toBe(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the default language when the requested prompt is missing', () => {
    metadata.getLanguage.mockReturnValue('en');
    const enPath = buildPromptPath('en', 'execute');
    const expected = readPromptFile(DEFAULT_LANGUAGE, 'execute');
    moveAside(enPath);

    const result = phase.loadPublicPrompt('execute');

    expect(result).toBe(expected);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`falling back to '${DEFAULT_LANGUAGE}'`)
    );
  });

  it('throws an error when neither primary nor fallback prompts exist', () => {
    metadata.getLanguage.mockReturnValue('en');
    const enPath = buildPromptPath('en', 'execute');
    const jaPath = buildPromptPath('ja', 'execute');
    moveAside(enPath);
    moveAside(jaPath);

    expect(() => phase.loadPublicPrompt('execute')).toThrow(
      buildPromptPath(DEFAULT_LANGUAGE, 'execute')
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it('uses DEFAULT_LANGUAGE when metadata returns the default language', () => {
    metadata.getLanguage.mockReturnValue(DEFAULT_LANGUAGE);
    const expected = readPromptFile(DEFAULT_LANGUAGE, 'review');

    const result = phase.loadPublicPrompt('review');

    expect(result).toBe(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('injects environment info for execute prompts when package installation is allowed', () => {
    metadata.getLanguage.mockReturnValue('en');
    const expected = readPromptFile('en', 'execute');
    canInstallSpy.mockReturnValue(true);

    const result = phase.loadPublicPrompt('execute');

    expect(result).toContain('## 🛠️ 開発環境情報');
    expect(result).toContain(expected);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Environment info injected into execute prompt')
    );
  });

  it('prepends rollback context for revise prompts', () => {
    metadata.getLanguage.mockReturnValue(DEFAULT_LANGUAGE);
    metadata.getRollbackContext.mockReturnValue({
      from_phase: 'design',
      reason: 'レビュー結果に基づき差し戻し',
      review_result: 'design/review/review_result.md',
    });
    const expected = readPromptFile(DEFAULT_LANGUAGE, 'revise');

    const result = phase.loadPublicPrompt('revise');

    expect(result).toContain('# ⚠️ 差し戻し情報');
    expect(result).toContain('レビュー結果に基づき差し戻し');
    expect(result).toContain(expected);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rollback context injected into revise prompt')
    );
  });

  it('handles all prompt types across languages without leaking state between calls', () => {
    metadata.getLanguage.mockReturnValue('en');
    const expected = promptTypes.map((type) => readPromptFile('en', type));

    const results = promptTypes.map((type) => phase.loadPublicPrompt(type));

    expect(results).toEqual(expected);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
