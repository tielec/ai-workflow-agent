import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { IssueClient } from '../../../src/core/github/issue-client.js';
import { IssueAIValidationError } from '../../../src/core/github/issue-ai-generator.js';
import type { IssueContext, IssueGenerationOptions, RemainingTask } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';

type OctokitMock = {
  issues: {
    create: jest.Mock;
  };
};

const BASE_TASK: RemainingTask = {
  task: 'core/gitカバレッジ向上',
  phase: 'test_implementation',
  priority: 'HIGH',
  targetFiles: ['src/core/git/index.ts'],
  steps: ['npm run test -- core/git'],
  acceptanceCriteria: ['core/git カバレッジが 90% を超える'],
};

const ISSUE_CONTEXT: IssueContext = {
  summary: 'Issue #119 の Evaluation で検知した残タスク。',
  blockerStatus: 'ブロッカーは解消済み',
  deferredReason: '優先順位が低いため後回し',
};

function createOctokitMock(): OctokitMock {
  return {
    issues: {
      create: jest.fn(async () => ({
        data: {
          number: 902,
          html_url: 'https://github.com/tielec/ai-workflow/issues/902',
        },
      })),
    },
  };
}

describe('IssueClient LLM follow-up integration', () => {
  let octokit: OctokitMock;
  let issueClient: IssueClient;
  let warnSpy: jest.SpiedFunction<typeof logger.warn>;

  beforeEach(() => {
    jest.clearAllMocks();
    octokit = createOctokitMock();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('issue_client_create_issue_llm_success_正常系', async () => {
    const aiResult = {
      title: 'Stabilize core git coverage with dedicated regression hardening plan',
      body: [
        '## 背景',
        'テスト不足によりリグレッションが発生しています。',
        '',
        '## 目的',
        '- テストカバレッジを 90% まで引き上げる。',
        '',
        '## 実行内容',
        '1. 既存テストを見直し、重複を削除して効率化する。',
        '2. `npm run test -- core/git` を実行し、結果を検証する。',
        '3. CI で失敗しないことを確認し、レポートを共有する。',
        '',
        '## 受け入れ基準',
        '- テストカバレッジレポートで core/git が 90% 以上であること。',
        '',
        '## 関連リソース',
        '- docs/testing.md',
      ].join('\n'),
      metadata: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: 1200,
        retryCount: 0,
        inputTokens: 420,
        outputTokens: 680,
        omittedTasks: 0,
      },
    };

    const issueAIGenerator = {
      isAvailable: jest.fn(() => true),
      generate: jest.fn(async () => aiResult),
    };

    issueClient = new IssueClient(octokit as any, 'tielec', 'ai-workflow', issueAIGenerator as any);

    const options: IssueGenerationOptions = {
      enabled: true,
      provider: 'openai',
      appendMetadata: true,
    };

    const result = await issueClient.createIssueFromEvaluation(
      119,
      [BASE_TASK],
      '03_test_implementation/output/evaluation.md',
      ISSUE_CONTEXT,
      options,
    );

    expect(result.success).toBe(true);
    expect(issueAIGenerator.generate).toHaveBeenCalledTimes(1);
    expect(octokit.issues.create).toHaveBeenCalledTimes(1);
    const [payload] = octokit.issues.create.mock.calls[0] as [{ title: string; body: string }];
    expect(payload.title).toBe(aiResult.title);
    expect(payload.body).toContain('## 生成メタデータ');
    expect(payload.body).toContain('モデル: gpt-4o-mini (openai)');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('issue_client_create_issue_llm_fallback_異常系', async () => {
    const issueAIGenerator = {
      isAvailable: jest.fn(() => true),
      generate: jest.fn(async () => {
        throw new IssueAIValidationError('Missing section: ## 実行内容');
      }),
    };

    const warnLog: Array<Parameters<typeof logger.warn>> = [];
    warnSpy.mockImplementation((...args: Parameters<typeof logger.warn>) => {
      warnLog.push(args);
    });

    issueClient = new IssueClient(octokit as any, 'tielec', 'ai-workflow', issueAIGenerator as any);

    const result = await issueClient.createIssueFromEvaluation(
      119,
      [BASE_TASK],
      'evaluation/report.md',
      ISSUE_CONTEXT,
      { enabled: true, provider: 'openai' },
    );

    expect(result.success).toBe(true);
    expect(issueAIGenerator.generate).toHaveBeenCalledTimes(1);
    expect(octokit.issues.create).toHaveBeenCalledTimes(1);
    const [fallbackPayload] = octokit.issues.create.mock.calls[0] as [{ body: string }];
    const body = fallbackPayload.body;
    expect(body).toContain('## 残タスク詳細');
    expect(body).toMatch(/## (参考|関連リソース)/);
    expect(
      warnLog.some((args) => args[0] === 'FOLLOWUP_LLM_FALLBACK'),
    ).toBe(true);
  });

  it('issue_client_create_issue_llm_disabled_境界値', async () => {
    const issueAIGenerator = {
      isAvailable: jest.fn(() => false),
      generate: jest.fn(),
    };

    issueClient = new IssueClient(octokit as any, 'tielec', 'ai-workflow', issueAIGenerator as any);

    const result = await issueClient.createIssueFromEvaluation(
      119,
      [BASE_TASK],
      'evaluation/report.md',
      ISSUE_CONTEXT,
      { enabled: false, provider: 'auto', appendMetadata: false },
    );

    expect(result.success).toBe(true);
    expect(issueAIGenerator.generate).not.toHaveBeenCalled();
    expect(octokit.issues.create).toHaveBeenCalledTimes(1);
    const [legacyPayload] = octokit.issues.create.mock.calls[0] as [{ body: string }];
    const body = legacyPayload.body;
    expect(body).toContain('## 残タスク詳細');
    expect(body).not.toContain('## 生成メタデータ');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
