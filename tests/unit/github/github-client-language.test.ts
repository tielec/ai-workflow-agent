import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { GitHubClient } from '../../../src/core/github-client.js';

describe('GitHubClient template language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses English template when AI_WORKFLOW_LANGUAGE is en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const client = new GitHubClient('token', 'owner/repo', null, null);

    const body = client.generatePrBodyTemplate(123, 'feature/en');

    expect(body).toContain('AI Workflow Auto-generated PR');
    expect(body).toContain('Related Issue');
  });

  it('uses Japanese template when AI_WORKFLOW_LANGUAGE is ja', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const client = new GitHubClient('token', 'owner/repo', null, null);

    const body = client.generatePrBodyTemplate(456, 'feature/ja');

    expect(body).toContain('AI Workflow自動生成PR');
    expect(body).toContain('関連Issue');
  });
});
