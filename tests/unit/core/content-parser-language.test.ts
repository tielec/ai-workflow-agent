import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ContentParser } from '../../../src/core/content-parser.js';
import { logger } from '../../../src/utils/logger.js';

describe('ContentParser language-aware prompt loading', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // Ensure Japanese prompt is loaded when environment language is ja
  it('loads Japanese extract_design_decisions prompt when AI_WORKFLOW_LANGUAGE=ja', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const parser = new ContentParser({ mode: 'openai', apiKey: 'dummy' });

    const prompt = (parser as any).loadPrompt('extract_design_decisions');

    expect(prompt).toContain('戦略判断を抽出してください');
  });

  // Ensure English prompt is loaded when environment language is en
  it('loads English extract_design_decisions prompt when AI_WORKFLOW_LANGUAGE=en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const parser = new ContentParser({ mode: 'openai', apiKey: 'dummy' });

    const prompt = (parser as any).loadPrompt('extract_design_decisions');

    expect(prompt).toContain('Extract strategy decisions');
  });
});
