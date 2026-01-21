import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { ResponsePlan, ResponsePlanComment } from '../../../../src/types/pr-comment.js';

const warnMock = jest.fn();

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('response-normalizer', () => {
  async function importModule() {
    await jest.unstable_mockModule('../../../../src/utils/logger.js', () => ({
      logger: { warn: warnMock },
    }));

    return import('../../../../src/commands/pr-comment/analyze/response-normalizer.js');
  }

  it('code_changeでproposed_changesが空なら警告する (TC-UNIT-RN-009)', async () => {
    const { validateProposedChanges } = await importModule();
    const comment: ResponsePlanComment = {
      comment_id: '1',
      type: 'code_change',
      confidence: 'high',
      proposed_changes: [],
      reply_message: 'fix',
    } as any;

    validateProposedChanges(comment);

    expect(warnMock).toHaveBeenCalled();
  });

  it('replyタイプでは警告しない (TC-UNIT-RN-010)', async () => {
    const { validateProposedChanges } = await importModule();
    const comment: ResponsePlanComment = {
      comment_id: '2',
      type: 'reply',
      reply_message: 'ok',
      proposed_changes: [],
    } as any;

    validateProposedChanges(comment);

    expect(warnMock).not.toHaveBeenCalled();
  });

  it('デフォルト値を補完する (TC-UNIT-RN-011/012)', async () => {
    const { applyPlanDefaults } = await importModule();
    const plan: ResponsePlan = { pr_number: 123, comments: [] } as ResponsePlan;

    const result = applyPlanDefaults(plan, { agent: 'claude' } as any);

    expect(result.analyzed_at).toBeDefined();
    expect(result.analyzer_agent).toBe('claude');
  });
});
