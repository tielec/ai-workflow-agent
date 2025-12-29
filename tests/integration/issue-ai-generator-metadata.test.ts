import { describe, expect, it, jest } from '@jest/globals';
import { IssueAIGenerator, type LlmProviderAdapter } from '../../src/core/github/issue-ai-generator.js';
import { SecretMasker } from '../../src/core/secret-masker.js';
import type { RemainingTask } from '../../src/types.js';

const createAdapter = (name: 'openai' | 'claude'): jest.Mocked<LlmProviderAdapter> => ({
  name,
  hasCredentials: jest.fn().mockReturnValue(true),
  complete: jest.fn(),
});

describe('Integration: IssueAIGenerator metadata masking (Issue #558)', () => {
  it('keeps metadata URLs and key names while masking secrets in the payload', () => {
    const openai = createAdapter('openai');
    const claude = createAdapter('claude');
    const generator = new IssueAIGenerator({ openai, claude }, new SecretMasker());

    const metadataPayload = {
      issue_url: 'https://github.com/tielec/ai-code-companion/issues/49',
      pr_url: 'https://github.com/tielec/ai-code-companion/pull/51',
      design_decisions: {
        implementation_strategy: null,
      },
      base_commit: 'a1b2c3d4e5f6789012345678901234567890abcd',
      secret_token: 'AKIAIOSFODNN7EXAMPLE1234567890',
    };

    const tasks: RemainingTask[] = [
      {
        task: JSON.stringify(metadataPayload),
        phase: 'test',
        priority: 'HIGH',
        priorityReason: 'metadata preservation',
        targetFiles: [],
        steps: [],
        acceptanceCriteria: [],
        dependencies: [],
      },
    ];

    const { payload } = (generator as unknown as {
      sanitizePayload: (
        tasks: RemainingTask[],
        context: unknown,
        issueNumber: number,
        maxTasks: number,
      ) => { payload: unknown; omittedTasks: number };
    }).sanitizePayload(tasks, undefined, 49, 5);

    const sanitizedPayload = payload as {
      issueNumber: number;
      tasks: Array<{ task: string }>;
    };
    const parsedMetadata = JSON.parse(sanitizedPayload.tasks[0].task);

    expect(parsedMetadata.issue_url).toContain('https://');
    expect(parsedMetadata.issue_url).toContain('/issues/49');
    expect(parsedMetadata.issue_url).toContain('__GITHUB_URL_');
    expect(parsedMetadata.issue_url).not.toContain('[REDACTED_TOKEN]');
    expect(parsedMetadata.pr_url).toContain('https://');
    expect(parsedMetadata.pr_url).toContain('/pull/51');
    expect(parsedMetadata.pr_url).not.toContain('[REDACTED_TOKEN]');
    expect(parsedMetadata.design_decisions).toBeTruthy();
    expect(Object.values(parsedMetadata.design_decisions)).toContain(null);
    expect(parsedMetadata.base_commit).toBe('[REDACTED_TOKEN]');
    expect(parsedMetadata.secret_token).toBe('[REDACTED_TOKEN]');
    expect(sanitizedPayload.issueNumber).toBe(49);
  });
});
