import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SquashManager } from '../../../src/core/git/squash-manager.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';

const createManager = () =>
  new SquashManager({} as any, {} as any, {} as any, {} as any, null, null, process.cwd());

describe('SquashManager prompt language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('loads Japanese squash prompt when AI_WORKFLOW_LANGUAGE=ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');

    const prompt = await (createManager() as any).loadPromptTemplate();

    expect(pathSpy).toHaveBeenCalledWith('squash', 'generate-message', 'ja');
    expect(prompt).toContain('コミットメッセージを生成するエキスパート');
  });

  it('loads English squash prompt when AI_WORKFLOW_LANGUAGE=en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');

    const prompt = await (createManager() as any).loadPromptTemplate();

    expect(pathSpy).toHaveBeenCalledWith('squash', 'generate-message', 'en');
    expect(prompt).toContain('expert in writing Conventional Commits');
  });
});
