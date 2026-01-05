import { jest } from '@jest/globals';

// Virtual mocks for core/utils imports referenced by analyzer modules
const loggerMock = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../../../src/core/utils/logger.js', () => ({ logger: loggerMock }), {
  virtual: true,
});
jest.mock(
  '../../../../src/core/utils/error-utils.js',
  () => ({
    getErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  }),
  { virtual: true },
);

import {
  executeAgentWithFallback,
  injectCustomInstruction,
} from '../../../../src/core/analyzer/agent-executor.js';

describe('agent-executor: agent selection and fallback', () => {
  const promptTemplate = [
    'Repo: {repository_path}',
    'Output: {output_file_path}',
    '{creative_mode}',
    '{custom_instruction}',
  ].join('\n');
  const repoPath = '/repo/path';
  const outputFilePath = '/tmp/out.json';

  const createClients = () => {
    const codexExecute = jest.fn().mockResolvedValue(undefined);
    const claudeExecute = jest.fn().mockResolvedValue(undefined);
    const codexClient = { executeTask: codexExecute };
    const claudeClient = { executeTask: claudeExecute };
    return { codexClient, claudeClient, codexExecute, claudeExecute };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses Codex when explicitly requested and available', async () => {
    const { codexClient, claudeClient, codexExecute, claudeExecute } = createClients();

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'codex',
    );

    expect(codexExecute).toHaveBeenCalledTimes(1);
    expect(claudeExecute).not.toHaveBeenCalled();
    expect(codexExecute).toHaveBeenCalledWith({
      prompt: expect.stringContaining(repoPath),
    });
  });

  it('uses Claude when explicitly requested and available', async () => {
    const { codexClient, claudeClient, codexExecute, claudeExecute } = createClients();

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'claude',
    );

    expect(claudeExecute).toHaveBeenCalledTimes(1);
    expect(codexExecute).not.toHaveBeenCalled();
  });

  it('prefers Codex in auto mode and falls back to Claude on failure', async () => {
    const { codexClient, claudeClient, codexExecute, claudeExecute } = createClients();
    codexExecute.mockRejectedValueOnce(new Error('codex failed'));

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'auto',
    );

    expect(codexExecute).toHaveBeenCalledTimes(1);
    expect(claudeExecute).toHaveBeenCalledTimes(1);
  });

  it('uses Claude directly when Codex is unavailable in auto mode', async () => {
    const { claudeClient, claudeExecute } = createClients();

    await executeAgentWithFallback(
      { codexClient: null, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'auto',
    );

    expect(claudeExecute).toHaveBeenCalledTimes(1);
  });

  it('throws when requested agent is unavailable', async () => {
    await expect(
      executeAgentWithFallback(
        { codexClient: null, claudeClient: null },
        promptTemplate,
        outputFilePath,
        repoPath,
        'auto',
      ),
    ).rejects.toThrow('Claude agent is not available.');

    const { claudeClient } = createClients();
    await expect(
      executeAgentWithFallback(
        { codexClient: null, claudeClient },
        promptTemplate,
        outputFilePath,
        repoPath,
        'codex',
      ),
    ).rejects.toThrow('Codex agent is not available.');

    const { codexClient } = createClients();
    await expect(
      executeAgentWithFallback(
        { codexClient, claudeClient: null },
        promptTemplate,
        outputFilePath,
        repoPath,
        'claude',
      ),
    ).rejects.toThrow('Claude agent is not available.');
  });

  it('propagates errors when Codex is forced and fails', async () => {
    const { codexClient, claudeClient, codexExecute } = createClients();
    codexExecute.mockRejectedValueOnce(new Error('forced failure'));

    await expect(
      executeAgentWithFallback(
        { codexClient, claudeClient },
        promptTemplate,
        outputFilePath,
        repoPath,
        'codex',
      ),
    ).rejects.toThrow('forced failure');
  });

  it('injects creative mode flags when provided', async () => {
    const { codexClient, claudeClient, codexExecute } = createClients();

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'codex',
      { creativeMode: true },
    );
    expect(codexExecute).toHaveBeenCalledWith({
      prompt: expect.stringContaining('creative_mode=enabled'),
    });

    jest.clearAllMocks();

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'codex',
      { creativeMode: false },
    );
    expect(codexExecute).toHaveBeenCalledWith({
      prompt: expect.stringContaining('creative_mode=disabled'),
    });

    jest.clearAllMocks();

    await executeAgentWithFallback(
      { codexClient, claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      'codex',
    );
    expect(codexExecute).toHaveBeenCalledWith({
      prompt: expect.stringContaining('{creative_mode}'),
    });
  });
});

describe('agent-executor: injectCustomInstruction', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('injects instructions when placeholder exists', () => {
    const prompt = 'Intro\n{custom_instruction}\nBody';
    const injected = injectCustomInstruction(prompt, 'Focus on security vulnerabilities');
    expect(injected).toContain('Focus on security vulnerabilities');
    expect(injected).toContain('最優先');
  });

  it('removes placeholder when instruction is missing', () => {
    const prompt = 'Intro\n{custom_instruction}\nBody';
    expect(injectCustomInstruction(prompt)).toBe('Intro\n\nBody');
    expect(injectCustomInstruction(prompt, '')).toBe('Intro\n\nBody');
  });

  it('keeps prompt unchanged when placeholder is absent', () => {
    const prompt = 'No placeholder here';
    expect(injectCustomInstruction(prompt, 'ignored')).toBe(prompt);
  });
});
