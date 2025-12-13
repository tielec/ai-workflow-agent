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
  const mockConfig = { getOpenAiApiKey: jest.fn(() => 'test-key') };

  jest.unstable_mockModule('../../src/core/config.js', () => ({
    config: mockConfig,
  }));
  jest.unstable_mockModule('../../src/utils/logger.js', () => ({
    logger,
  }));
  jest.unstable_mockModule('openai', () => ({
    default: jest.fn(() => ({
      chat: {
        completions: {
          create: createMock,
        },
      },
    })),
  }));

  const module = await import('../../src/core/instruction-validator.js');

  return { InstructionValidator: module.InstructionValidator, createMock };
}

describe('InstructionValidator cache integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('uses cache for repeated instructions to avoid duplicate LLM calls', async () => {
    // 同一指示の繰り返し検証でキャッシュがヒットし、LLM 呼び出しが1回に抑制されることを確認
    const { InstructionValidator, createMock } = await loadValidator();
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

    const first = await InstructionValidator.validate('同じ指示');
    const second = await InstructionValidator.validate('同じ指示');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Instruction validation cache hit'),
    );
    expect(second).toEqual(first);
  });

  it('calls LLM separately when instructions differ', async () => {
    // 異なる指示ではキャッシュがミスとなり、それぞれ別の LLM 呼び出しが行われることを確認
    const { InstructionValidator, createMock } = await loadValidator();
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

    const first = await InstructionValidator.validate('指示A');
    const second = await InstructionValidator.validate('指示B');

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(first.reason).toBe('指示A');
    expect(second.reason).toBe('指示B');
  });
});
