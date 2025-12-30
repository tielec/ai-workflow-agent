import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { BasePhase } from '../../../src/phases/base-phase.js';
import { DEFAULT_LANGUAGE } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';
import { config } from '../../../src/core/config.js';

class TestPhase extends BasePhase {
  public load(promptType: 'execute' | 'review' | 'revise'): string {
    return (this as any).loadPrompt(promptType);
  }

  protected async execute(): Promise<any> {
    return { success: true };
  }

  protected async review(): Promise<any> {
    return { success: true };
  }
}

function createMetadata(language: string, workflowDir: string) {
  return {
    data: { issue_number: '571' },
    workflowDir,
    getLanguage: jest.fn().mockReturnValue(language),
    getRollbackContext: jest.fn().mockReturnValue(null),
  };
}

function createGithubMock() {
  return {
    getIssueInfo: jest.fn(),
    postComment: jest.fn(),
    createOrUpdateProgressComment: jest.fn(),
  };
}

describe('BasePhase.loadPrompt language switching (Issue #571)', () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-phase-lang-'));
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (workingDir && fs.existsSync(workingDir)) {
      fs.removeSync(workingDir);
    }
  });

  it('loads English prompts when language is en', () => {
    const workflowDir = path.join(workingDir, '.ai-workflow', 'issue-571');
    const metadata = createMetadata('en', workflowDir);
    const phase = new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager: metadata as any,
      githubClient: createGithubMock(),
      skipDependencyCheck: true,
    });

    const prompt = phase.load('execute');
    expect(prompt).toContain('Project Planning Phase');
    expect(metadata.getLanguage).toHaveBeenCalled();
  });

  it('falls back to DEFAULT_LANGUAGE when the selected language prompt is missing', () => {
    const workflowDir = path.join(workingDir, '.ai-workflow', 'issue-571');
    const metadata = createMetadata('fr' as any, workflowDir);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const phase = new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager: metadata as any,
      githubClient: createGithubMock(),
      skipDependencyCheck: true,
    });

    const prompt = phase.load('execute');
    expect(prompt).toContain('プロジェクト計画フェーズ');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Prompt not found for language 'fr'`),
    );
    expect(metadata.getLanguage).toHaveBeenCalled();
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('uses DEFAULT_LANGUAGE when metadata returns DEFAULT_LANGUAGE explicitly', () => {
    const workflowDir = path.join(workingDir, '.ai-workflow', 'issue-571');
    const metadata = createMetadata(DEFAULT_LANGUAGE, workflowDir);
    const phase = new TestPhase({
      phaseName: 'planning',
      workingDir,
      metadataManager: metadata as any,
      githubClient: createGithubMock(),
      skipDependencyCheck: true,
    });

    const prompt = phase.load('execute');
    expect(prompt).toContain('プロジェクト計画フェーズ');
    expect(metadata.getLanguage).toHaveBeenCalled();
  });
});
