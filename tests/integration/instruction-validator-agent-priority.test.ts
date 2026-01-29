import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

async function createValidator({
  codexExecute,
  claudeExecute,
  openAiResponse,
}: {
  codexExecute?: jest.Mock;
  claudeExecute?: jest.Mock;
  openAiResponse?: unknown;
}) {
  jest.resetModules();
  jest.clearAllMocks();

  const createMock = jest.fn();
  if (openAiResponse !== undefined) {
    createMock.mockResolvedValue(openAiResponse);
  }

  jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
  jest.unstable_mockModule('../../src/core/config.js', () => ({
    config: {
      getOpenAiApiKey: jest.fn(() => (openAiResponse ? 'key' : null)),
      getCodexApiKey: jest.fn(() => null),
      getClaudeCodeToken: jest.fn(() => null),
      getLanguage: jest.fn(() => 'ja'),
    },
  }));
  jest.unstable_mockModule('../../src/core/prompt-loader.js', () => ({
    PromptLoader: { loadPrompt: jest.fn(() => 'Validate: {{instruction}}') },
  }));
  jest.unstable_mockModule('../../src/core/helpers/codex-credentials.js', () => ({
    detectCodexCliAuth: jest.fn(() => ({ authFilePath: null })),
    isValidCodexApiKey: jest.fn(() => false),
  }));
  jest.unstable_mockModule('../../src/core/claude-agent-client.js', () => ({
    ClaudeAgentClient: class {},
    resolveClaudeModel: jest.fn(() => 'claude-3-haiku'),
  }));
  jest.unstable_mockModule('../../src/core/codex-agent-client.js', () => ({
    CodexAgentClient: class {},
    resolveCodexModel: jest.fn(() => 'gpt-mini'),
  }));
  jest.unstable_mockModule('openai', () => ({
    default: jest.fn(() => ({ chat: { completions: { create: createMock } } })),
  }));

  const { InstructionValidator } = await import('../../src/core/instruction-validator.js');
  const validator = new InstructionValidator('/repo', {
    codexClient: codexExecute ? { executeTask: codexExecute } : null,
    claudeClient: claudeExecute ? { executeTask: claudeExecute } : null,
    openaiClient: openAiResponse ? ({ chat: { completions: { create: createMock } } } as any) : null,
  });

  return { validator, createMock };
}

describe('Integration: InstructionValidator エージェント優先順', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Codexが成功した場合はclaude/openaiを呼ばない', async () => {
    const codexExecute = jest
      .fn()
      .mockResolvedValue([
        '{"isSafe": true, "reason": "codex ok", "category": "analysis", "confidence": "high"}',
      ]);

    const { validator } = await createValidator({ codexExecute });
    const result = await validator.validate('安全な指示');

    expect(result.validationMethod).toBe('codex-agent');
    expect(codexExecute).toHaveBeenCalledTimes(1);
  });

  it('Codex/Claude失敗時にOpenAIへフォールバックする', async () => {
    const codexExecute = jest.fn().mockRejectedValue(new Error('codex down'));
    const claudeExecute = jest.fn().mockRejectedValue(new Error('claude down'));
    const openAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: true,
              reason: 'openai ok',
              category: 'analysis',
              confidence: 'medium',
            }),
          },
        },
      ],
    };

    const { validator, createMock } = await createValidator({
      codexExecute,
      claudeExecute,
      openAiResponse,
    });

    const result = await validator.validate('安全な指示');

    expect(codexExecute).toHaveBeenCalledTimes(1);
    expect(claudeExecute).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.validationMethod).toBe('llm');
    expect(result.reason).toBe('openai ok');
  });
});
