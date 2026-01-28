import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

async function loadValidator() {
  jest.resetModules();
  jest.clearAllMocks();

  const createMock = jest.fn();
  const mockConfig = {
    getOpenAiApiKey: jest.fn(() => 'test-key'),
    getCodexApiKey: jest.fn(() => null),
    getClaudeCodeToken: jest.fn(() => null),
    getLanguage: jest.fn(() => 'ja'),
  };

  jest.unstable_mockModule('../../src/core/config.js', () => ({
    config: mockConfig,
  }));
  jest.unstable_mockModule('../../src/utils/logger.js', () => ({
    logger,
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
    default: jest.fn(() => ({
      chat: { completions: { create: createMock } },
    })),
  }));

  const module = await import('../../src/core/instruction-validator.js');
  const validator = new module.InstructionValidator('/repo', { codexClient: null, claudeClient: null });

  return { validator, createMock };
}

describe('InstructionValidator cache integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('同一指示の繰り返しでLLM呼び出しを1回に抑制する', async () => {
    const { validator, createMock } = await loadValidator();
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: true,
              reason: 'キャッシュテスト',
              category: 'analysis',
              confidence: 'medium',
            }),
          },
        },
      ],
    });

    const first = await validator.validate('同じ指示');
    const second = await validator.validate('同じ指示');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Instruction validation cache hit'),
    );
    expect(second).toEqual(first);
  });

  it('異なる指示では別々にLLMを呼び出す', async () => {
    const { validator, createMock } = await loadValidator();
    createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                isSafe: true,
                reason: '指示A',
                category: 'analysis',
                confidence: 'high',
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                isSafe: true,
                reason: '指示B',
                category: 'analysis',
                confidence: 'high',
              }),
            },
          },
        ],
      });

    const first = await validator.validate('指示A');
    const second = await validator.validate('指示B');

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(first.reason).toBe('指示A');
    expect(second.reason).toBe('指示B');
  });
});
