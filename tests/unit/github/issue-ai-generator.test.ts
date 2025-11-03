import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  IssueAIGenerator,
  IssueAIValidationError,
  type LlmProviderAdapter,
  type LlmProviderResponse,
} from '../../../src/core/github/issue-ai-generator.js';
import { SecretMasker } from '../../../src/core/secret-masker.js';
import type { IssueContext, IssueGenerationOptions, RemainingTask } from '../../../src/types.js';

type ProviderMock = jest.Mocked<LlmProviderAdapter>;

const SUCCESS_TITLE =
  'Stabilize core git module coverage with targeted automation rollout plan';
const SUCCESS_BODY = [
  '## 背景',
  'core/git モジュールのテスト不足によりリリース判断が遅延しています。',
  '',
  '## 目的',
  '- カバレッジを90%まで引き上げ、リグレッションリスクを低減します。',
  '',
  '## 実行内容',
  '1. 既存テストの不安定ケースを洗い出し、原因を切り分けて修正する。',
  '2. 新規ユニットテストを追加し、`npm run test -- core/git` を実行して検証する。',
  '3. テスト結果をCIに共有し、失敗時にはリトライと報告フローを整備する。',
  '',
  '## 受け入れ基準',
  '- テストカバレッジレポートで core/git が90%以上であること。',
  '- CI pipeline でテストと検証ステップがグリーンで完了すること。',
  '',
  '## 関連リソース',
  '- docs/testing.md',
].join('\n');

const BASE_TASK: RemainingTask = {
  task: 'core/gitカバレッジ向上',
  phase: 'test_implementation',
  priority: 'HIGH',
  priorityReason: 'リリース前に品質基準を満たす必要がある',
  targetFiles: ['src/core/git/index.ts', 'src/core/git/utils.ts'],
  steps: ['既存テストの重複を整理', 'core/git に Jest テストを追加', 'npm run test -- core/git'],
  acceptanceCriteria: ['テストカバレッジレポートでcore/gitが90%を超える'],
  dependencies: ['tests/setup'],
  estimatedHours: '6',
};

const DEFAULT_CONTEXT: IssueContext = {
  summary: 'Issue #119 の Evaluation フェーズで検知した残タスクの対応方針です。',
  blockerStatus: 'すべてのブロッカーは解消済み',
  deferredReason: '優先タスクの兼ね合いで後回しとなっていた',
};

function createProviderMock(name: 'openai' | 'claude'): ProviderMock {
  return {
    name,
    hasCredentials: jest.fn<() => boolean>().mockReturnValue(true),
    complete: jest.fn<(prompt: string, options: IssueGenerationOptions) => Promise<LlmProviderResponse>>(),
  };
}

function createGenerator(overrides?: {
  openai?: ProviderMock;
  claude?: ProviderMock;
  secretMasker?: SecretMasker;
}): {
  generator: IssueAIGenerator;
  openai: ProviderMock;
  claude: ProviderMock;
} {
  const openai = overrides?.openai ?? createProviderMock('openai');
  const claude = overrides?.claude ?? createProviderMock('claude');
  const secretMasker = overrides?.secretMasker ?? new SecretMasker();
  return {
    generator: new IssueAIGenerator({ openai, claude }, secretMasker),
    openai,
    claude,
  };
}

describe('IssueAIGenerator.generate - success and retry flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issue_ai_generator_generate_success_正常系', async () => {
    const { generator, openai } = createGenerator();
    openai.complete.mockResolvedValue({
      text: JSON.stringify({ title: SUCCESS_TITLE, body: SUCCESS_BODY }),
      model: 'gpt-4o-mini',
      inputTokens: 512,
      outputTokens: 768,
      retryCount: 0,
      durationMs: 1200,
    });

    const options: IssueGenerationOptions = {
      enabled: true,
      provider: 'openai',
      appendMetadata: true,
      maxTasks: 5,
      maxRetries: 2,
      timeoutMs: 15000,
      temperature: 0.2,
    };

    const result = await generator.generate([BASE_TASK], DEFAULT_CONTEXT, 119, options);

    expect(result.title).toBe(SUCCESS_TITLE);
    expect(result.body).toBe(SUCCESS_BODY.trimEnd());
    expect(result.metadata.provider).toBe('openai');
    expect(result.metadata.model).toBe('gpt-4o-mini');
    expect(result.metadata.retryCount).toBe(0);
    expect(result.metadata.inputTokens).toBe(512);
    expect(result.metadata.outputTokens).toBe(768);
    expect(result.metadata.omittedTasks).toBe(0);
    expect(openai.complete).toHaveBeenCalledTimes(1);
    const prompt = openai.complete.mock.calls[0][0];
    expect(prompt).toContain('"issueNumber": 119');
    expect(prompt).toContain('core/git');
  });

  it('issue_ai_generator_generate_retry_success_正常系', async () => {
    const { generator, openai } = createGenerator();
    const delaySpy = jest.spyOn(generator as unknown as { delay: (ms: number) => Promise<void> }, 'delay');
    delaySpy.mockResolvedValue();

    openai.complete
      .mockRejectedValueOnce(new Error('HTTP 429: rate limit'))
      .mockResolvedValueOnce({
        text: JSON.stringify({ title: SUCCESS_TITLE, body: SUCCESS_BODY }),
        model: 'gpt-4o-mini',
        inputTokens: 400,
        outputTokens: 650,
        retryCount: 0,
        durationMs: 900,
      });

    const options: IssueGenerationOptions = {
      enabled: true,
      provider: 'openai',
      maxRetries: 3,
      maxTasks: 3,
    };

    const result = await generator.generate([BASE_TASK], DEFAULT_CONTEXT, 42, options);

    expect(result.metadata.retryCount).toBe(1);
    expect(openai.complete).toHaveBeenCalledTimes(2);
    expect(delaySpy).toHaveBeenCalled();
  });

  it('issue_ai_generator_generate_invalid_json_異常系', async () => {
    const { generator, openai } = createGenerator();
    openai.complete.mockResolvedValue({
      text: '**markdown only**',
      model: 'gpt-4o-mini',
      retryCount: 0,
      durationMs: 400,
    });

    const options: IssueGenerationOptions = { enabled: true, provider: 'openai' };

    await expect(
      generator.generate([BASE_TASK], DEFAULT_CONTEXT, 77, options),
    ).rejects.toThrow(IssueAIValidationError);
  });

  it('issue_ai_generator_generate_missing_sections_異常系', async () => {
    const { generator, openai } = createGenerator();
    const invalidBody = [
      '## 背景',
      '概要のみを記述します。',
      '',
      '## 目的',
      'リグレッションリスクを下げる',
      '',
      '## 受け入れ基準',
      '- CIが成功すること',
      '',
      '## 関連リソース',
      '- docs/overview.md',
    ].join('\n');

    openai.complete.mockResolvedValue({
      text: JSON.stringify({ title: SUCCESS_TITLE, body: invalidBody }),
      model: 'gpt-4o-mini',
      retryCount: 0,
      durationMs: 500,
    });

    const options: IssueGenerationOptions = { enabled: true, provider: 'openai' };

    await expect(
      generator.generate([BASE_TASK], DEFAULT_CONTEXT, 88, options),
    ).rejects.toThrow(new IssueAIValidationError('Missing section: ## 実行内容'));
  });

  it('issue_ai_generator_sanitize_payload_boundary_境界値', () => {
    const originalEnv = { ...process.env };
    process.env.OPENAI_API_KEY = 'sk-proj-verylongsecretvalue-1234567890abcd';
    const { generator } = createGenerator();

    const longText = 'x'.repeat(600);
    const longTaskMarker = '長文タスク-';
    const longTaskValue = `${longTaskMarker}${longText}`;
    const tasks: RemainingTask[] = [
      { ...BASE_TASK, task: '高優先タスクA', priority: 'HIGH' },
      { ...BASE_TASK, task: '高優先タスクB', priority: 'HIGH' },
      {
        ...BASE_TASK,
        task: '高優先タスクC',
        priority: 'HIGH',
        priorityReason: longText,
        targetFiles: Array.from({ length: 12 }, (_, i) => `src/file-${i}.ts`),
        steps: Array.from({ length: 10 }, (_, i) => `step ${i + 1}`),
        acceptanceCriteria: Array.from({ length: 9 }, (_, i) => `criteria ${i + 1}`),
        dependencies: Array.from({ length: 11 }, (_, i) => `dep-${i}`),
      },
      { ...BASE_TASK, task: longTaskValue, priority: 'MEDIUM' },
      { ...BASE_TASK, task: '中優先タスク', priority: 'MEDIUM' },
      {
        ...BASE_TASK,
        task: '低優先タスク',
        priority: 'LOW',
        priorityReason: 'Bearer sk-test-abc12345 を含まないようマスキングが必要',
      },
    ];

    const context: IssueContext = {
      summary: 'owner@example.com へ共有済み。token=XYZ987654321 を含むログは除去すること。',
      blockerStatus: 'すべて解消済み',
      deferredReason: 'Bearer sk-test-abc12345 を利用する環境準備が未完了',
    };

    const originalMaxTaskLength = Math.max(
      ...tasks.map((task) => Array.from(task.task).length),
    );
    const { payload, omittedTasks } = (generator as unknown as {
      sanitizePayload: (
        t: RemainingTask[],
        c: IssueContext | undefined,
        issueNumber: number,
        maxTasks: number,
      ) => { payload: unknown; omittedTasks: number };
    }).sanitizePayload(tasks, context, 321, 5);

    const sanitized = payload as {
      tasks: Array<{
        task: string;
        phase: string;
        priority: string;
        priorityReason?: string;
        targetFiles?: string[];
        steps?: string[];
        acceptanceCriteria?: string[];
        dependencies?: string[];
      }>;
      context: { summary: string; blockerStatus: string; deferredReason: string } | null;
    };

    expect(sanitized.tasks).toHaveLength(5);
    expect(omittedTasks).toBe(1);
    expect(sanitized.tasks[0].priority.toLowerCase()).toBe('high');
    expect(sanitized.tasks[0].targetFiles?.length).toBeLessThanOrEqual(10);
    expect(sanitized.tasks[0].steps?.length).toBeLessThanOrEqual(8);
    expect(sanitized.tasks[0].acceptanceCriteria?.length).toBeLessThanOrEqual(8);
    expect(sanitized.tasks[0].dependencies?.length).toBeLessThanOrEqual(10);
    expect(Array.from(sanitized.tasks[2].priorityReason ?? '').length).toBeLessThanOrEqual(512);
    const maxTaskLength = Math.max(...sanitized.tasks.map((task) => Array.from(task.task).length));
    expect(maxTaskLength).toBeLessThanOrEqual(512);
    expect(maxTaskLength).toBeLessThan(originalMaxTaskLength);
    expect(sanitized.context?.summary).not.toContain('owner@example.com');
    expect(sanitized.context?.summary).toContain('[REDACTED_EMAIL]');
    expect(sanitized.context?.deferredReason).toContain('Bearer [REDACTED_TOKEN]');

    process.env = originalEnv;
  });
});

describe('IssueAIGenerator availability checks', () => {
  let generator: IssueAIGenerator;
  let openai: ProviderMock;
  let claude: ProviderMock;

  beforeEach(() => {
    ({ generator, openai, claude } = createGenerator());
  });

  it('returns false when options.enabled is false', () => {
    expect(generator.isAvailable({ enabled: false, provider: 'auto' })).toBe(false);
  });

  it('returns true when auto mode and any provider has credentials', () => {
    claude.hasCredentials.mockReturnValue(false);
    openai.hasCredentials.mockReturnValue(true);
    expect(generator.isAvailable({ enabled: true, provider: 'auto' })).toBe(true);
  });

  it('returns false when requested provider lacks credentials', () => {
    openai.hasCredentials.mockReturnValue(false);
    expect(generator.isAvailable({ enabled: true, provider: 'openai' })).toBe(false);
  });
});
