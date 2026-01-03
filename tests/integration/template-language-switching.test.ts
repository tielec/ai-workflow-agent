import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GitHubClient } from '../../src/core/github-client.js';
import { logger } from '../../src/utils/logger.js';

describe('Template language switching integration', () => {
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

  it('uses English templates when AI_WORKFLOW_LANGUAGE is en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const client = new GitHubClient('token', 'owner/repo', null, null);

    const body = client.generatePrBodyDetailed(42, 'feature/en', { summary: 'Summary' });

    expect(body).toContain('AI Workflow Auto-generated PR');
    expect(body).toContain('Related Issue');
    expect(body).toContain('#42');
  });

  it('uses Japanese templates when AI_WORKFLOW_LANGUAGE is ja', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const client = new GitHubClient('token', 'owner/repo', null, null);

    const body = client.generatePrBodyDetailed(99, 'feature/ja', { summary: '概要' });

    expect(body).toContain('AI Workflow自動生成PR');
    expect(body).toContain('関連Issue');
    expect(body).toContain('#99');
  });

});
