import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IssueGenerator } from '../../../src/core/issue-generator.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type { BugCandidate } from '../../../src/types/auto-issue.js';
import { logger } from '../../../src/utils/logger.js';

describe('IssueGenerator language-aware prompts', () => {
  let codexClient: jest.Mocked<CodexAgentClient>;
  let claudeClient: jest.Mocked<ClaudeAgentClient>;
  let octokit: any;
  let originalEnv: NodeJS.ProcessEnv;

  const candidate: BugCandidate = {
    title: 'Test bug',
    file: 'src/index.ts',
    line: 10,
    severity: 'high',
    description: 'Potential null reference',
    suggestedFix: 'Add null check',
    category: 'bug',
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    codexClient = {
      executeTask: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CodexAgentClient>;
    claudeClient = {
      executeTask: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ClaudeAgentClient>;
    octokit = {
      issues: {
        create: jest.fn(),
      },
    };
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('uses English prompt when AI_WORKFLOW_LANGUAGE is en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const generator = new IssueGenerator(codexClient, claudeClient, octokit, 'owner/repo');

    await generator.generate(candidate, 'codex', true);

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Generate a GitHub Issue body'),
      }),
    );
  });

  it('uses Japanese prompt when AI_WORKFLOW_LANGUAGE is ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const generator = new IssueGenerator(codexClient, claudeClient, octokit, 'owner/repo');

    await generator.generate(candidate, 'codex', true);

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('GitHub Issue本文を生成してください'),
      }),
    );
  });
});
