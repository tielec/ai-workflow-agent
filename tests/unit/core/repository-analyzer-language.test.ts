import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import { logger } from '../../../src/utils/logger.js';

describe('RepositoryAnalyzer language-aware prompts', () => {
  let codexClient: jest.Mocked<CodexAgentClient>;
  let claudeClient: jest.Mocked<ClaudeAgentClient>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    codexClient = {
      executeTask: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CodexAgentClient>;
    claudeClient = {
      executeTask: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ClaudeAgentClient>;
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('uses English prompt when AI_WORKFLOW_LANGUAGE is en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);

    await analyzer.analyze('/tmp/repo', 'codex');

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('You are a code review expert'),
      }),
    );
  });

  it('uses Japanese prompt when AI_WORKFLOW_LANGUAGE is ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const analyzer = new RepositoryAnalyzer(codexClient, claudeClient);

    await analyzer.analyze('/tmp/repo', 'codex');

    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('あなたはコードレビューの専門家です'),
      }),
    );
  });
});
