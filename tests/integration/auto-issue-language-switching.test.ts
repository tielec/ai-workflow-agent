import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import { IssueGenerator } from '../../src/core/issue-generator.js';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import type { BugCandidate } from '../../src/types/auto-issue.js';
import { logger } from '../../src/utils/logger.js';

describe('Auto-issue language switching integration', () => {
  let codexClient: jest.Mocked<CodexAgentClient>;
  let claudeClient: jest.Mocked<ClaudeAgentClient>;
  let octokit: any;
  let originalEnv: NodeJS.ProcessEnv;
  let warnSpy: jest.SpyInstance;

  const candidate: BugCandidate = {
    title: 'Integration bug',
    file: 'src/index.ts',
    line: 5,
    severity: 'medium',
    description: 'Test description',
    suggestedFix: 'Test fix',
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
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('propagates English language setting to repository analyzer and issue generator', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);
    const generator = new IssueGenerator(codexClient, claudeClient, octokit, 'owner/repo');

    await analyzer.analyze('/tmp/repo', 'codex');
    await generator.generate(candidate, 'codex', true);

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('You are a code review expert'),
      }),
    );
    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Generate a GitHub Issue body'),
      }),
    );
  });

  it('propagates Japanese language setting to repository analyzer and issue generator', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);
    const generator = new IssueGenerator(codexClient, claudeClient, octokit, 'owner/repo');

    await analyzer.analyze('/tmp/repo', 'codex');
    await generator.generate(candidate, 'codex', true);

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('あなたはコードレビューの専門家です'),
      }),
    );
    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('GitHub Issue本文を生成してください'),
      }),
    );
  });
});
