import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IssueAIGenerator, type LlmProviderAdapter } from '../../src/core/github/issue-ai-generator.js';
import { IssueClient } from '../../src/core/github/issue-client.js';
import type { IssueContext, IssueGenerationOptions, RemainingTask } from '../../src/types.js';
import { logger } from '../../src/utils/logger.js';

const BASE_TASK: RemainingTask = {
  task: 'core/gitカバレッジ向上',
  phase: 'test_implementation',
  priority: 'HIGH',
  targetFiles: ['src/core/git/index.ts', 'src/core/git/utils.ts'],
  steps: ['既存テストの重複を整理', 'core/git に Jest テストを追加', 'npm run test -- core/git'],
  acceptanceCriteria: ['テストカバレッジレポートでcore/gitが90%を超える'],
};

const ISSUE_CONTEXT: IssueContext = {
  summary: 'Issue #119 の Evaluation フェーズで検知した残タスクの対応方針です。',
  blockerStatus: 'ブロッカーは解消済み',
  deferredReason: '優先度調整のため後回し',
};

const SUCCESS_BODY = [
  '## 背景',
  'テスト不足によりリグレッションが発生しています。',
  '',
  '## 目的',
  '- core/git モジュールの安定性を向上させる。',
  '',
  '## 実行内容',
  '1. 既存テストを整理し、重複ケースを除去する。',
  '2. `npm run test -- core/git` を実行し検証結果を収集する。',
  '3. CI での自動実行を設定し、失敗時の通知を追加する。',
  '',
  '## 受け入れ基準',
  '- core/git カバレッジが 90%以上に達する。',
  '- CI パイプラインがエラーなしで完了する。',
  '',
  '## 関連リソース',
  '- docs/testing.md',
].join('\n');

const SUCCESS_TITLE = 'Strengthen core git coverage with targeted automation rollout plan';

describe('Integration: IssueClient with IssueAIGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies LLM output and appends metadata when generation succeeds', async () => {
    const openaiAdapter: LlmProviderAdapter = {
      name: 'openai',
      hasCredentials: () => true,
      complete: async () => ({
        text: JSON.stringify({ title: SUCCESS_TITLE, body: SUCCESS_BODY }),
        model: 'gpt-4o-mini',
        retryCount: 0,
        durationMs: 420,
        inputTokens: 512,
        outputTokens: 768,
      }),
    };

    const claudeAdapter: LlmProviderAdapter = {
      name: 'claude',
      hasCredentials: () => false,
      complete: async () => ({
        text: '',
        model: 'claude-3-sonnet-20240229',
        retryCount: 0,
        durationMs: 0,
      }),
    };

    const generator = new IssueAIGenerator({ openai: openaiAdapter, claude: claudeAdapter });
    const issuesCreate = jest.fn(async () => ({
      data: { number: 912, html_url: 'https://example.com/issues/912' },
    }));
    const octokit = { issues: { create: issuesCreate } };
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const client = new IssueClient(octokit as any, 'tielec', 'ai-workflow', generator);

    const options: IssueGenerationOptions = {
      enabled: true,
      provider: 'openai',
      appendMetadata: true,
      maxTasks: 5,
    };

    const result = await client.createIssueFromEvaluation(
      119,
      [BASE_TASK],
      'evaluation/report.md',
      ISSUE_CONTEXT,
      options,
    );

    expect(result.success).toBe(true);
    expect(issuesCreate).toHaveBeenCalledTimes(1);
    const [payload] = issuesCreate.mock.calls[0] as unknown[];
    const body = (payload as { body: string; title: string }).body;
    expect(body).toContain('## 生成メタデータ');
    expect(body).toContain('モデル: gpt-4o-mini (openai)');
    expect(body).toContain('## 関連リソース');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('falls back to legacy template when LLM generation fails', async () => {
    let openaiCallCount = 0;
    const openaiAdapter: LlmProviderAdapter = {
      name: 'openai',
      hasCredentials: () => true,
      complete: async () => {
        openaiCallCount += 1;
        throw new Error('fetch timeout');
      },
    };

    const claudeAdapter: LlmProviderAdapter = {
      name: 'claude',
      hasCredentials: () => false,
      complete: async () => {
        throw new Error('unexpected claude call');
      },
    };

    const generator = new IssueAIGenerator({ openai: openaiAdapter, claude: claudeAdapter });
    jest
      .spyOn(generator as unknown as { delay: (ms: number) => Promise<void> }, 'delay')
      .mockResolvedValue();

    const issuesCreate = jest.fn(async () => ({
      data: { number: 1300, html_url: 'https://example.com/issues/1300' },
    }));
    const octokit = { issues: { create: issuesCreate } };
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const client = new IssueClient(octokit as any, 'tielec', 'ai-workflow', generator);

    const result = await client.createIssueFromEvaluation(
      119,
      [BASE_TASK],
      'evaluation/report.md',
      ISSUE_CONTEXT,
      { enabled: true, provider: 'openai', maxRetries: 3 },
    );

    expect(result.success).toBe(true);
    expect(openaiCallCount).toBe(4);
    expect(issuesCreate).toHaveBeenCalledTimes(1);
    const [payload] = issuesCreate.mock.calls[0] as unknown[];
    const fallbackBody = (payload as { body: string }).body;
    expect(fallbackBody).toContain('## 残タスク詳細');
    expect(fallbackBody).toMatch(/## (参考|関連リソース)/);
    expect(warnSpy).toHaveBeenCalledWith(
      'FOLLOWUP_LLM_FALLBACK',
      expect.objectContaining({ fallback: 'legacy_template' }),
    );

    warnSpy.mockRestore();
  });
});
