import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { config } from '../../../src/core/config.js';
import { PROMPT_LANGUAGE_INSTRUCTIONS } from '../../../src/prompts/prompt-language-instructions.js';
import { DEFAULT_LANGUAGE } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';

describe('PromptLoader', () => {
  const promptsRoot = path.join(process.cwd(), 'src', 'prompts');
  const templatesRoot = path.join(process.cwd(), 'src', 'templates');
  let originalEnv: NodeJS.ProcessEnv;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // Verify explicit language selection loads the corresponding localized prompt
  it('loads the Japanese prompt when language is explicitly set to ja', () => {
    const prompt = PromptLoader.loadPrompt('auto-issue', 'detect-bugs', 'ja');

    expect(prompt).toContain('あなたはコードレビューの専門家です');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Verify config-driven language resolution falls back to environment defaults
  it('uses config.getLanguage when language is omitted', () => {
    jest.spyOn(config, 'getLanguage').mockReturnValue('en');

    const prompt = PromptLoader.loadPrompt('auto-issue', 'detect-bugs');

    expect(prompt).toContain('You are a code review expert');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Ensure missing primary prompt triggers warning and error escalation
  it('logs a warning and throws when both primary and fallback prompts are missing', () => {
    expect(() =>
      PromptLoader.resolvePromptPath('validation', 'does-not-exist', 'en'),
    ).toThrow(/fallback also not found/);
    expect(warnSpy).toHaveBeenCalled();
  });

  // Validate template loading switches language based on the provided locale
  it('loads templates based on language', () => {
    const jaTemplate = PromptLoader.loadTemplate('pr_body_template.md', 'ja');
    const enTemplate = PromptLoader.loadTemplate('pr_body_template.md', 'en');

    expect(jaTemplate).toContain('AI Workflow自動生成PR');
    expect(enTemplate).toContain('AI Workflow Auto-generated PR');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Ensure template resolution warns and throws when neither primary nor fallback exists
  it('logs a warning and throws when both primary and fallback templates are missing', () => {
    expect(() =>
      PromptLoader.resolveTemplatePath('missing-template.md', DEFAULT_LANGUAGE),
    ).toThrow(/fallback also not found/);
    expect(warnSpy).toHaveBeenCalled();
  });

  // Confirm language-specific prompts are selected for pr-comment workflows
  it('loads pr-comment analyze prompt in English when AI_WORKFLOW_LANGUAGE=en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';

    const prompt = PromptLoader.loadPrompt('pr-comment', 'analyze');

    expect(prompt).toContain('PR Review Comments — Analyze Phase');
    expect(prompt).not.toContain('PRレビューコメント');
  });

  // Confirm rollback prompts honor environment language without fallback
  it('loads rollback auto-analyze prompt from the English path when AI_WORKFLOW_LANGUAGE=en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';

    const resolvedPath = PromptLoader.resolvePromptPath(
      'rollback',
      'auto-analyze',
      config.getLanguage(),
    );
    const prompt = PromptLoader.loadPrompt('rollback', 'auto-analyze');

    expect(resolvedPath).toContain(path.join('rollback', 'en', 'auto-analyze.txt'));
    expect(prompt).toContain('Rollback Auto Analysis Prompt');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Validate fallback to default language with warning when primary prompt is missing
  it('falls back to the default language and logs a warning when primary prompt is absent', () => {
    const resolvedPath = PromptLoader.resolvePromptPath(
      'auto-issue',
      'detect-bugs',
      'zz' as any,
    );
    const prompt = fs.readFileSync(resolvedPath, 'utf-8');

    expect(resolvedPath).toContain(path.join('auto-issue', DEFAULT_LANGUAGE, 'detect-bugs.txt'));
    expect(prompt).toContain('あなたはコードレビューの専門家です');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Prompt not found for language 'zz'"),
    );
  });

  it('ensures English prompts include the standardized language instruction', () => {
    const prompt = PromptLoader.loadPrompt('planning', 'execute', 'en');
    const lines = prompt.split(/\r?\n/).filter((line) => line.trim() !== '');

    expect(lines).toContain(PROMPT_LANGUAGE_INSTRUCTIONS.en);
  });

  it('ensures Japanese prompts include the standardized language instruction', () => {
    const prompt = PromptLoader.loadPrompt('planning', 'execute', 'ja');
    const lines = prompt.split(/\r?\n/).filter((line) => line.trim() !== '');

    expect(lines).toContain(PROMPT_LANGUAGE_INSTRUCTIONS.ja);
  });
});
