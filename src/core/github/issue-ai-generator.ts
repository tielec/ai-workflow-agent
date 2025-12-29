import OpenAI from 'openai';
import { IssueContext, IssueGenerationOptions, IssueAIGenerationResult, RemainingTask } from '../../types.js';
import { SecretMasker } from '../secret-masker.js';
import { getErrorMessage } from '../../utils/error-utils.js';

export interface LlmProviderResponse {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
  durationMs: number;
}

export interface LlmProviderAdapter {
  name: 'openai' | 'claude';
  hasCredentials(): boolean;
  complete(prompt: string, options: IssueGenerationOptions): Promise<LlmProviderResponse>;
}

export class IssueAIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssueAIUnavailableError';
  }
}

export class IssueAIValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssueAIValidationError';
  }
}

type SanitizedPayload = {
  issueNumber: number;
  tasks: Array<{
    task: string;
    phase: string;
    priority: string;
    priorityReason?: string;
    targetFiles?: string[];
    steps?: string[];
    acceptanceCriteria?: string[];
    dependencies?: string[];
    estimatedHours?: string;
  }>;
  context: IssueContext | null;
};

const PROMPT_TEMPLATE = `
あなたはソフトウェア開発プロジェクトのIssue作成アシスタントです。
以下のJSONを読み取り、フォローアップIssueを構築してください。

入力:
{{payload}}

要件:
1. タイトルは50〜80文字。対象コンポーネントや目的のキーワードを含めること。
2. 本文は以下の見出し順序とします。
   ## 背景
   ## 目的
   ## 実行内容
   ## 受け入れ基準
   ## 関連リソース
3. 実行内容には対象ファイル・手順・テスト方法を含めること。
4. JSON 形式で回答してください。

出力形式:
{
  "title": "...",
  "body": "..."
}
`.trim();

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export class IssueAIGenerator {
  private readonly providers: Record<'openai' | 'claude', LlmProviderAdapter>;
  private readonly secretMasker: SecretMasker;

  constructor(
    providers: Record<'openai' | 'claude', LlmProviderAdapter>,
    secretMasker: SecretMasker = new SecretMasker(),
  ) {
    this.providers = providers;
    this.secretMasker = secretMasker;
  }

  public isAvailable(options: IssueGenerationOptions): boolean {
    if (!options.enabled) {
      return false;
    }

    // Issue #174: 'agent' provider is handled by IssueAgentGenerator, not this class
    if (options.provider === 'agent') {
      return false;
    }

    if (options.provider === 'auto') {
      return (
        this.providers.openai.hasCredentials() || this.providers.claude.hasCredentials()
      );
    }

    return this.providers[options.provider]?.hasCredentials() ?? false;
  }

  public async generate(
    tasks: RemainingTask[],
    context: IssueContext | undefined,
    issueNumber: number,
    options: IssueGenerationOptions,
  ): Promise<IssueAIGenerationResult> {
    if (!options.enabled) {
      throw new IssueAIUnavailableError('LLM generation is disabled.');
    }

    const maxTasks = options.maxTasks ?? 5;
    const { payload, omittedTasks } = this.sanitizePayload(tasks, context, issueNumber, maxTasks);
    const prompt = this.buildPrompt(payload);

    const adapter = this.pickProvider(options);
    const response = await this.executeWithRetries(adapter, prompt, options);
    const parsed = this.parseAndValidate(response.text);

    return {
      title: parsed.title,
      body: parsed.body,
      metadata: {
        provider: adapter.name,
        model: response.model,
        durationMs: response.durationMs,
        retryCount: response.retryCount,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        omittedTasks,
      },
    };
  }

  private pickProvider(options: IssueGenerationOptions): LlmProviderAdapter {
    // Issue #174: 'agent' provider should never reach this method
    if (options.provider === 'agent') {
      throw new IssueAIUnavailableError(
        'Agent provider is not supported by IssueAIGenerator. Use IssueAgentGenerator instead.',
      );
    }

    if (options.provider === 'auto') {
      if (this.providers.openai.hasCredentials()) {
        return this.providers.openai;
      }
      if (this.providers.claude.hasCredentials()) {
        return this.providers.claude;
      }
      throw new IssueAIUnavailableError('No available LLM provider for auto mode.');
    }

    const adapter = this.providers[options.provider];
    if (!adapter || !adapter.hasCredentials()) {
      throw new IssueAIUnavailableError(
        `Requested provider "${options.provider}" is not available.`,
      );
    }
    return adapter;
  }

  private async executeWithRetries(
    adapter: LlmProviderAdapter,
    prompt: string,
    options: IssueGenerationOptions,
  ): Promise<LlmProviderResponse> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = 2000;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await adapter.complete(prompt, options);
        response.retryCount = attempt;
        return response;
      } catch (error) {
        lastError = error;
        if (
          error instanceof IssueAIUnavailableError ||
          error instanceof IssueAIValidationError ||
          attempt === maxRetries
        ) {
          throw error;
        }
        const delayMs = baseDelay * 2 ** attempt;
        await this.delay(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('LLM request failed.');
  }

  /**
   * Sanitizes and prepares task payload for LLM processing with selective masking
   *
   * This method processes tasks and context data for LLM consumption while preserving
   * important metadata through the ignoredPaths mechanism in SecretMasker.
   *
   * ## Preserved Content (ignoredPaths configuration):
   * - `issue_url`: GitHub issue URLs to maintain link functionality
   * - `pr_url`: Pull request URLs for proper reference tracking
   * - `target_repository.remote_url`: Repository URLs for context clarity
   * - `target_repository.github_name`: Repository identification
   * - `design_decisions.*`: All design decision metadata for context preservation
   *
   * @param tasks - Array of remaining tasks to be processed
   * @param context - Optional issue context with summary and status information
   * @param issueNumber - The issue number for reference
   * @param maxTasks - Maximum number of tasks to include (sorted by priority)
   * @returns Sanitized payload with preserved metadata and count of omitted tasks
   */
  private sanitizePayload(
    tasks: RemainingTask[],
    context: IssueContext | undefined,
    issueNumber: number,
    maxTasks: number,
  ): { payload: SanitizedPayload; omittedTasks: number } {
    const sorted = [...tasks].sort((a, b) => {
      const priA = PRIORITY_ORDER[String(a.priority ?? '').toLowerCase()] ?? 1;
      const priB = PRIORITY_ORDER[String(b.priority ?? '').toLowerCase()] ?? 1;
      if (priA !== priB) {
        return priA - priB;
      }
      return 0;
    });

    const selected = sorted.slice(0, Math.max(1, maxTasks));
    const omittedTasks = Math.max(0, tasks.length - selected.length);

    const sanitizedTasks = selected.map((task) => ({
      task: this.truncate(task.task),
      phase: this.truncate(task.phase),
      priority: this.truncate(task.priority),
      priorityReason: task.priorityReason ? this.truncate(task.priorityReason) : undefined,
      targetFiles: this.sanitizeStringArray(task.targetFiles, 10),
      steps: this.sanitizeStringArray(task.steps, 8),
      acceptanceCriteria: this.sanitizeStringArray(task.acceptanceCriteria, 8),
      dependencies: this.sanitizeStringArray(task.dependencies, 10),
      estimatedHours: task.estimatedHours ? this.truncate(task.estimatedHours) : undefined,
    }));

    const sanitizedContext = context
      ? {
          summary: this.truncate(context.summary),
          blockerStatus: this.truncate(context.blockerStatus),
          deferredReason: this.truncate(context.deferredReason),
        }
      : null;

    const payload: SanitizedPayload = this.secretMasker.maskObject(
      {
        issueNumber,
        tasks: sanitizedTasks,
        context: sanitizedContext,
      },
      {
        ignoredPaths: [
          'issue_url',
          'pr_url',
          'target_repository.remote_url',
          'target_repository.github_name',
          'design_decisions.*',
        ],
      },
    );

    return { payload, omittedTasks };
  }

  private buildPrompt(payload: SanitizedPayload): string {
    const json = JSON.stringify(payload, null, 2);
    return PROMPT_TEMPLATE.replace('{{payload}}', json);
  }

  private parseAndValidate(responseText: string): { title: string; body: string } {
    const trimmed = responseText.trim();
    const normalized = this.stripCodeFence(trimmed);
    let parsed: unknown;

    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new IssueAIValidationError('LLM response is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new IssueAIValidationError('LLM response must be a JSON object.');
    }

    const record = parsed as Record<string, unknown>;
    const title = this.ensureString(record.title, 'title').trim();
    const body = this.ensureString(record.body, 'body').trim();

    const titleLength = Array.from(title).length;
    if (titleLength < 50 || titleLength > 80) {
      throw new IssueAIValidationError('Title must be between 50 and 80 characters.');
    }

    this.validateBodyStructure(body);

    return { title, body: body.trimEnd() };
  }

  private validateBodyStructure(body: string): void {
    const sections = ['## 背景', '## 目的', '## 実行内容', '## 受け入れ基準', '## 関連リソース'];
    let lastIndex = -1;

    for (const section of sections) {
      const index = body.indexOf(section);
      if (index === -1) {
        throw new IssueAIValidationError(`Missing section: ${section}`);
      }
      if (index <= lastIndex) {
        throw new IssueAIValidationError('Sections are out of the required order.');
      }
      lastIndex = index;
    }

    const executionSection = this.extractSection(body, '## 実行内容');
    if (!/\d+\.\s+.+/m.test(executionSection)) {
      throw new IssueAIValidationError('Execution section must include a numbered list.');
    }
    if (!/(テスト|検証)/.test(executionSection)) {
      throw new IssueAIValidationError('Execution section must reference テスト or 検証.');
    }

    if (/<\/?[a-z][\s\S]*?>/i.test(body)) {
      throw new IssueAIValidationError('HTML tags are not allowed in the generated body.');
    }
  }

  private extractSection(body: string, heading: string): string {
    const index = body.indexOf(heading);
    if (index === -1) {
      return '';
    }
    const rest = body.slice(index + heading.length);
    const nextHeading = rest.search(/\n##\s/);
    if (nextHeading === -1) {
      return rest.trim();
    }
    return rest.slice(0, nextHeading).trim();
  }

  private stripCodeFence(content: string): string {
    if (!content.startsWith('```')) {
      return content;
    }
    const withoutFence = content
      .replace(/^```[a-zA-Z0-9]*\s*/, '')
      .replace(/\s*```$/, '');
    return withoutFence.trim();
  }

  private sanitizeStringArray(values: string[] | undefined, limit: number): string[] | undefined {
    if (!values || !values.length) {
      return undefined;
    }
    return values.slice(0, limit).map((value) => this.truncate(value));
  }

  private truncate(value: string | undefined, length = 512): string {
    if (!value) {
      return '';
    }
    if (Array.from(value).length <= length) {
      return value;
    }
    return Array.from(value).slice(0, length).join('');
  }

  private ensureString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new IssueAIValidationError(`Field "${field}" must be a non-empty string.`);
    }
    return value;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export class OpenAIAdapter implements LlmProviderAdapter {
  public readonly name = 'openai';
  private readonly client: OpenAI | null;

  constructor(apiKey: string | null) {
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  public hasCredentials(): boolean {
    return this.client !== null;
  }

  public async complete(
    prompt: string,
    options: IssueGenerationOptions,
  ): Promise<LlmProviderResponse> {
    if (!this.client) {
      throw new IssueAIUnavailableError('OPENAI_API_KEY is not configured.');
    }

    const controller =
      typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? new AbortController() : null;
    let timeout: NodeJS.Timeout | null = null;

    try {
      if (controller) {
        timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      }

      const start = Date.now();
      const response = await this.client.chat.completions.create(
        {
          model: options.model ?? 'gpt-4o-mini',
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxOutputTokens ?? 1500,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an assistant that generates Japanese GitHub issues and must respond in JSON format.',
            },
            { role: 'user', content: prompt },
          ],
        },
        controller ? { signal: controller.signal } : undefined,
      );

      const text = response.choices[0]?.message?.content ?? '';

      return {
        text,
        model: response.model ?? options.model ?? 'gpt-4o-mini',
        inputTokens: response.usage?.prompt_tokens ?? undefined,
        outputTokens: response.usage?.completion_tokens ?? undefined,
        retryCount: 0,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error(getErrorMessage(error));
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class AnthropicAdapter implements LlmProviderAdapter {
  public readonly name = 'claude';
  private readonly apiKey: string | null;

  constructor(apiKey: string | null) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
  }

  public hasCredentials(): boolean {
    return !!this.apiKey;
  }

  public async complete(
    prompt: string,
    options: IssueGenerationOptions,
  ): Promise<LlmProviderResponse> {
    if (!this.apiKey) {
      throw new IssueAIUnavailableError('ANTHROPIC_API_KEY is not configured.');
    }

    const controller =
      typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? new AbortController() : null;
    let timeout: NodeJS.Timeout | null = null;

    try {
      if (controller) {
        timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      }

      const start = Date.now();
      const response = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model ?? 'claude-3-sonnet-20240229',
          max_tokens: options.maxOutputTokens ?? 1500,
          temperature: options.temperature ?? 0.2,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const error = new Error(
          `Anthropic API error: ${response.status} ${response.statusText} ${errorBody}`,
        );
        throw error;
      }

      const json = (await response.json()) as {
        content?: Array<{ text?: string }>;
        model?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text =
        Array.isArray(json.content) && json.content.length
          ? json.content.map((item) => item?.text ?? '').join('').trim()
          : '';

      return {
        text,
        model: json.model ?? options.model ?? 'claude-3-sonnet-20240229',
        inputTokens: json.usage?.input_tokens,
        outputTokens: json.usage?.output_tokens,
        retryCount: 0,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error(getErrorMessage(error));
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
