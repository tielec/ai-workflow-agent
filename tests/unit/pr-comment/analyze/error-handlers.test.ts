import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import type { ResponsePlan } from '../../../../src/types/pr-comment.js';
import type { PRCommentMetadataManager } from '../../../../src/core/pr-comment/metadata-manager.js';

const buildFallbackPlan = jest.fn().mockReturnValue({
  pr_number: 1,
  analyzed_at: '2025-01-01T00:00:00Z',
  analyzer_agent: 'fallback',
  comments: [],
} as ResponsePlan);
const isCIMock = jest.fn();

const metadataManager = {
  setAnalyzerError: jest.fn(),
} as unknown as jest.Mocked<PRCommentMetadataManager>;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleAgentError', () => {
  const comments = [];

async function importModule() {
  await jest.unstable_mockModule('../../../../src/commands/pr-comment/analyze/markdown-builder.js', () => ({
    buildFallbackPlan,
  }));
  await jest.unstable_mockModule('../../../../src/core/config.js', () => ({
    config: {
      isCI: isCIMock,
      getLogLevel: jest.fn().mockReturnValue('info'),
      getLogNoColor: jest.fn().mockReturnValue(true),
    },
  }));
  await jest.unstable_mockModule('node:readline', () => {
    const createInterface = () => ({
      question: (_q: string, cb: (answer: string) => void) => cb(userAnswer),
      close: jest.fn(),
    });
    return {
      default: { createInterface },
      createInterface,
    };
  });

  return import('../../../../src/commands/pr-comment/analyze/error-handlers.js');
}

let userAnswer = 'y';

it('CI環境ではprocess.exit(1)を呼ぶ (TC-UNIT-EH-001)', async () => {
  const exitMock = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);
  isCIMock.mockReturnValue(true);
  userAnswer = 'y';

  await expect(
    (await importModule()).handleAgentError(
      'Agent failed',
      'agent_execution_error',
      metadataManager,
      1,
      comments as any,
      true,
    ),
  ).rejects.toThrow('exit:1');

  expect(metadataManager.setAnalyzerError).toHaveBeenCalledWith('Agent failed', 'agent_execution_error');
  expect(buildFallbackPlan).not.toHaveBeenCalled();
  exitMock.mockRestore();
});

it('ローカル環境でフォールバックプランを返す (TC-UNIT-EH-002)', async () => {
  const exitMock = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  isCIMock.mockReturnValue(false);
  userAnswer = 'y';

  const plan = await (await importModule()).handleAgentError(
    'Agent failed',
    'agent_execution_error',
    metadataManager,
    99,
    comments as any,
      true,
    );

    expect(plan).toMatchObject({ analyzer_agent: 'fallback', pr_number: 1 });
    expect(buildFallbackPlan).toHaveBeenCalledWith(99, comments);
    expect(metadataManager.setAnalyzerError).toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });

it('ユーザーがキャンセルした場合はprocess.exit(1)を呼ぶ (TC-UNIT-EH-003)', async () => {
  const exitMock = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);
  isCIMock.mockReturnValue(false);
  userAnswer = 'n';

  await expect(
    (await importModule()).handleAgentError(
      'Agent failed',
      'agent_execution_error',
      metadataManager,
      3,
      comments as any,
      true,
    ),
  ).rejects.toThrow('exit:1');

  expect(buildFallbackPlan).not.toHaveBeenCalled();
  expect(metadataManager.setAnalyzerError).toHaveBeenCalled();
  exitMock.mockRestore();
  });
});
