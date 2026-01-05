import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { logger } from '../../../src/utils/logger.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../../src/types/auto-issue.js';

const stubPrompt = [
  'Repo: {repository_path}',
  'Output: {output_file_path}',
  '{creative_mode}',
  '{custom_instruction}',
].join('\n');

describe('RepositoryAnalyzer facade', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-facade-'));
    jest.spyOn(PromptLoader, 'loadPrompt').mockReturnValue(stubPrompt);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('processes bug candidates through agent execution, parsing, validation, and cleanup (TC-RA-001, TC-RA-010, TC-RA-011)', async () => {
    const outputPath = path.join(tempDir, 'bugs-output.json');
    const outputFactory = jest.fn(() => outputPath);

    const bugCandidate: BugCandidate = {
      title: 'Unhandled promise rejection in API service',
      file: 'src/services/api-service.ts',
      line: 42,
      severity: 'high',
      description:
        'The fetchData method does not properly handle promise rejections, which can crash the application during network failures.',
      suggestedFix:
        'Wrap the fetch call in a try-catch block and surface structured errors to callers to avoid unhandled rejections.',
      category: 'bug',
    };

    const codexClient = {
      executeTask: jest.fn(async () => {
        await fs.promises.writeFile(
          outputPath,
          JSON.stringify({ bugs: [bugCandidate] }, null, 2),
          'utf-8',
        );
      }),
    };
    const claudeClient = { executeTask: jest.fn() };

    const analyzer = new RepositoryAnalyzer(codexClient as any, claudeClient as any, {
      outputFileFactory: outputFactory,
    });

    const result = await analyzer.analyze('/repo/path', 'codex');

    expect(PromptLoader.loadPrompt).toHaveBeenCalledWith('auto-issue', 'detect-bugs');
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(result).toEqual([bugCandidate]);
    expect(outputFactory).toHaveBeenCalledWith('bugs');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('cleans up the bug output file even when agent execution fails (TC-RA-012)', async () => {
    const outputPath = path.join(tempDir, 'bugs-error.json');
    const outputFactory = jest.fn(() => outputPath);
    await fs.promises.writeFile(outputPath, '{"seed":true}', 'utf-8');

    const codexClient = { executeTask: jest.fn(async () => Promise.reject(new Error('agent failed'))) };

    const analyzer = new RepositoryAnalyzer(codexClient as any, null, {
      outputFileFactory: outputFactory,
    });

    await expect(analyzer.analyze('/repo/path', 'codex')).rejects.toThrow('agent failed');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('returns validated refactor candidates using real parsing and validation (TC-RA-002, TC-RA-010)', async () => {
    const outputFactory = jest.fn((prefix: string) => path.join(tempDir, `${prefix}-output.json`));
    const refactorCandidate: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description: 'File exceeds size guidelines and mixes multiple responsibilities.',
      suggestion: 'Extract analyzer helpers into dedicated modules.',
      priority: 'high',
      lineRange: { start: 1, end: 800 },
    };

    const codexClient = {
      executeTask: jest.fn(async () => {
        await fs.promises.writeFile(
          path.join(tempDir, 'refactor-output.json'),
          JSON.stringify([refactorCandidate], null, 2),
          'utf-8',
        );
      }),
    };
    const claudeClient = { executeTask: jest.fn() };

    const analyzer = new RepositoryAnalyzer(codexClient as any, claudeClient as any, {
      outputFileFactory: outputFactory,
    });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'auto', {
      customInstruction: 'Focus on oversized files',
    });

    expect(PromptLoader.loadPrompt).toHaveBeenCalledWith('auto-issue', 'detect-refactoring');
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(result).toEqual([refactorCandidate]);
    expect(fs.existsSync(path.join(tempDir, 'refactor-output.json'))).toBe(false);
  });

  it('filters enhancement proposals through validation (TC-RA-003, TC-RA-010)', async () => {
    const outputFactory = jest.fn((prefix: string) => path.join(tempDir, `${prefix}-output.json`));
    const validProposal: EnhancementProposal = {
      type: 'improvement',
      title: 'Add progress indicator for repository scans',
      description:
        'Long-running analyses leave users guessing about progress. Add a spinner with percentages to improve UX.',
      rationale:
        'Visibility helps users trust the tool during large scans and reduces false failure reports.',
      implementation_hints: ['Use ora for spinner', 'Report processed file counts'],
      expected_impact: 'medium',
      effort_estimate: 'small',
      related_files: ['src/core/repository-analyzer.ts'],
    };
    const invalidProposal: EnhancementProposal = {
      type: 'quality',
      title: 'Short',
      description: 'Too small to be valid',
      rationale: 'Also too small',
      implementation_hints: ['placeholder'],
      expected_impact: 'low',
      effort_estimate: 'small',
      related_files: ['src/index.ts'],
    };

    const claudeClient = {
      executeTask: jest.fn(async () => {
        await fs.promises.writeFile(
          path.join(tempDir, 'enhancements-output.json'),
          JSON.stringify([validProposal, invalidProposal], null, 2),
          'utf-8',
        );
      }),
    };

    const analyzer = new RepositoryAnalyzer(null, claudeClient as any, {
      outputFileFactory: outputFactory,
    });

    const result = await analyzer.analyzeForEnhancements('/repo/path', 'claude');

    expect(PromptLoader.loadPrompt).toHaveBeenCalledWith('auto-issue', 'detect-enhancements');
    expect(claudeClient.executeTask).toHaveBeenCalledTimes(1);
    expect(result).toEqual([validProposal]);
    expect(fs.existsSync(path.join(tempDir, 'enhancements-output.json'))).toBe(false);
  });
});
