import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { PromptLoader } from '../../../src/core/prompt-loader.js';

describe('pr-comment analyze prompt language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Verify Japanese prompt is selected for pr-comment analyze when language is ja
  it('loads Japanese analyze prompt when AI_WORKFLOW_LANGUAGE=ja', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';

    const prompt = PromptLoader.loadPrompt('pr-comment', 'analyze');

    expect(prompt).toContain('PRレビューコメント — 分析フェーズ');
  });

  // Verify English prompt is selected for pr-comment analyze when language is en
  it('loads English analyze prompt when AI_WORKFLOW_LANGUAGE=en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';

    const prompt = PromptLoader.loadPrompt('pr-comment', 'analyze');

    expect(prompt).toContain('PR Review Comments — Analyze Phase');
  });
});
