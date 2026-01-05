import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

type SetupOptions = {
  apiKey?: string | null;
  createImpl?: jest.Mock;
  openAiResponse?: unknown;
};

async function setupValidator(options: SetupOptions = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  const apiKey = options.apiKey !== undefined ? options.apiKey : 'test-key';
  const createMock = options.createImpl ?? jest.fn();
  if (options.openAiResponse !== undefined) {
    createMock.mockResolvedValue(options.openAiResponse);
  }

  const mockConfig = {
    getOpenAiApiKey: jest.fn(() => apiKey),
    getLanguage: jest.fn(() => {
      const envLang = process.env.AI_WORKFLOW_LANGUAGE?.toLowerCase().trim();
      return envLang === 'en' ? 'en' : 'ja';
    }),
  };

  jest.unstable_mockModule('../../../src/core/config.js', () => ({
    config: mockConfig,
  }));
  jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
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

  const { InstructionValidator } = await import('../../../src/core/instruction-validator.js');

  return { InstructionValidator, createMock, mockConfig };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('InstructionValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('validates safe analysis instructions via LLM code block response', async () => {
    // LLM が Markdown のコードブロック内で JSON を返すケースを安全判定として処理できることを確認
    const codeBlockResponse = {
      choices: [
        {
          message: {
            content: [
              '判定結果は以下の通りです。',
              '```json',
              JSON.stringify({
                isSafe: true,
                reason: '分析のみの指示です',
                category: 'analysis',
                confidence: 'high',
              }),
              '```',
            ].join('\n'),
          },
        },
      ],
    };

    const { InstructionValidator, createMock } = await setupValidator({
      openAiResponse: codeBlockResponse,
    });

    const result = await InstructionValidator.validate('削除すべきファイルを検出してください');

    expect(result.isValid).toBe(true);
    expect(result.category).toBe('analysis');
    expect(result.validationMethod).toBe('llm');
    expect(result.confidence).toBe('high');
    expect(result.validatedAt).toBeDefined();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('propagates unsafe decisions returned by the LLM response', async () => {
    // LLM が危険判定を返した場合に isValid=false とエラーメッセージが伝搬されることを確認
    const unsafeResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: false,
              reason: '削除指示です',
              category: 'execution',
              confidence: 'high',
            }),
          },
        },
      ],
    };

    const { InstructionValidator, createMock } = await setupValidator({
      openAiResponse: unsafeResponse,
    });

    const result = await InstructionValidator.validate('このファイルを削除して');

    expect(result.isValid).toBe(false);
    expect(result.validationMethod).toBe('llm');
    expect(result.errorMessage).toContain('Unsafe instruction detected');
    expect(result.category).toBe('execution');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('uses cache to avoid duplicate LLM calls', async () => {
    // 同一指示の2回目以降はキャッシュがヒットし、LLM 呼び出しが抑制されることを確認
    const llmResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: true,
              reason: '繰り返し検証',
              category: 'analysis',
              confidence: 'medium',
            }),
          },
        },
      ],
    };
    const { InstructionValidator, createMock } = await setupValidator({
      openAiResponse: llmResponse,
    });

    const first = await InstructionValidator.validate('リファクタリング候補を洗い出してください');
    const second = await InstructionValidator.validate('リファクタリング候補を洗い出してください');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('expires cached entries after TTL and revalidates', async () => {
    // TTL 経過後はキャッシュが無効化され、LLM が再度呼ばれることを確認
    const { InstructionValidator, createMock } = await setupValidator();
    const nowSpy = jest.spyOn(Date, 'now');
    let now = 0;
    nowSpy.mockImplementation(() => now);

    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: true,
              reason: 'initial run',
              category: 'analysis',
              confidence: 'medium',
            }),
          },
        },
      ],
    });

    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isSafe: true,
              reason: 'after ttl',
              category: 'analysis',
              confidence: 'high',
            }),
          },
        },
      ],
    });

    const first = await InstructionValidator.validate('コードを分析してください');

    now = ONE_HOUR_MS + 1;
    const second = await InstructionValidator.validate('コードを分析してください');

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(second.reason).toEqual('after ttl');

    nowSpy.mockRestore();
  });

  it('evicts least recently used cache entries when max size is exceeded', async () => {
    // LRU に基づいて最も古いアクセスのエントリが削除されることを確認
    const { InstructionValidator } = await setupValidator();
    const ValidationCacheClass = (InstructionValidator as any).cache.constructor;
    const dateSpy = jest.spyOn(Date, 'now');
    let now = 0;
    dateSpy.mockImplementation(() => now);

    const cache = new ValidationCacheClass(ONE_HOUR_MS, 2);
    const createResult = (reason: string) => ({
      isValid: true,
      confidence: 'medium',
      reason,
      category: 'analysis',
      validationMethod: 'llm',
      validatedAt: new Date().toISOString(),
    });

    cache.set('first', createResult('first'));
    now = 1;
    cache.set('second', createResult('second'));
    now = 2;
    cache.get('first');
    now = 3;
    cache.set('third', createResult('third'));

    expect(cache.get('first')).not.toBeNull();
    expect(cache.get('second')).toBeNull();
    expect(cache.get('third')).not.toBeNull();

    dateSpy.mockRestore();
  });

  it('computes stable hashes for identical instructions', async () => {
    // 同一入力に対してハッシュ値が安定していることを確認
    const { InstructionValidator } = await setupValidator();
    const ValidationCacheClass = (InstructionValidator as any).cache.constructor;
    const hash1 = ValidationCacheClass.computeHash('same instruction');
    const hash2 = ValidationCacheClass.computeHash('same instruction');
    const different = ValidationCacheClass.computeHash('different instruction');

    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(different);
  });

  it('retries LLM failures before succeeding', async () => {
    // LLM タイムアウトを最大リトライ回数までリトライし、成功時に結果を返すことを確認
    jest.useFakeTimers();
    let callCount = 0;
    const { InstructionValidator, createMock } = await setupValidator({
      createImpl: jest.fn(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Request timed out');
        }
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isSafe: true,
                  reason: '成功',
                  category: 'analysis',
                  confidence: 'high',
                }),
              },
            },
          ],
        };
      }),
    });

    const resultPromise = InstructionValidator.validate('パフォーマンスを分析してください');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(callCount).toBe(3);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.isValid).toBe(true);
    expect(result.validationMethod).toBe('llm');
  });

  it('falls back to pattern matching when LLM retries all fail', async () => {
    // LLM が全リトライ失敗した場合にパターンマッチへフォールバックすることを確認
    jest.useFakeTimers();
    const { InstructionValidator, createMock } = await setupValidator({
      createImpl: jest.fn(async () => {
        throw new Error('API unavailable');
      }),
    });

    const resultPromise = InstructionValidator.validate('このファイルを削除してください');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.isValid).toBe(false);
    expect(result.validationMethod).toBe('pattern');
    expect(result.detectedPattern).toBe('削除指示');
  });

  it('skips LLM validation when API key is missing', async () => {
    // API Key 未設定時は LLM を呼ばずにパターンマッチで検証することを確認
    const { InstructionValidator, createMock } = await setupValidator({ apiKey: null });

    const result = await InstructionValidator.validate('DELETE this File');

    expect(result.isValid).toBe(false);
    expect(result.validationMethod).toBe('pattern');
    expect(result.detectedPattern).toBe('削除指示');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws on empty instruction input', async () => {
    // 空文字（空白のみ含む）入力は例外として扱われることを確認
    const { InstructionValidator } = await setupValidator({ apiKey: null });

    await expect(InstructionValidator.validate('   ')).rejects.toThrow('Instruction cannot be empty');
  });

  it('warns for very long instructions but still returns a result', async () => {
    // 2000 文字超の入力で警告ログを出しつつ検証結果を返すことを確認
    const longInstruction = 'a'.repeat(2500);
    const { InstructionValidator } = await setupValidator({ apiKey: null });

    const result = await InstructionValidator.validate(longInstruction);

    expect(logger.warn).toHaveBeenCalledWith(
      'Instruction exceeds 2000 characters, proceeding without truncation.',
    );
    expect(result.isValid).toBe(true);
    expect(result.validationMethod).toBe('pattern');
  });

  it('retries invalid JSON responses and falls back after failures', async () => {
    // LLM が毎回不正な JSON を返した場合にリトライ後フォールバックすることを確認
    jest.useFakeTimers();
    const invalidResponse = { choices: [{ message: { content: 'This is not valid JSON' } }] };
    const { InstructionValidator, createMock } = await setupValidator({
      createImpl: jest.fn(async () => invalidResponse),
    });

    const resultPromise = InstructionValidator.validate('任意の指示');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM validation attempt 1/3 failed'),
    );
    expect(result.validationMethod).toBe('pattern');
  });

  describe('validateWithPatterns', () => {
    it('detects git operation instructions', async () => {
      // Git 操作を示す指示は危険パターンとして検出されることを確認
      const { InstructionValidator } = await setupValidator({ apiKey: null });
      const result = (InstructionValidator as any).validateWithPatterns('commit して push してください');

      expect(result.isValid).toBe(false);
      expect(result.detectedPattern).toBe('Git操作');
      expect(result.validationMethod).toBe('pattern');
    });

    it('treats benign instructions as analysis when no pattern matches', async () => {
      // 危険パターンに一致しない場合は低信頼で安全とみなされることを確認
      const { InstructionValidator } = await setupValidator({ apiKey: null });
      const result = (InstructionValidator as any).validateWithPatterns('コードの品質を確認してください');

      expect(result.isValid).toBe(true);
      expect(result.category).toBe('analysis');
      expect(result.validationMethod).toBe('pattern');
    });

    it('matches uppercase delete commands', async () => {
      // 大文字を含む DELETE 指示でも削除パターンとして検出できることを確認
      const { InstructionValidator } = await setupValidator({ apiKey: null });
      const result = (InstructionValidator as any).validateWithPatterns('DELETE this File now');

      expect(result.detectedPattern).toBe('削除指示');
      expect(result.isValid).toBe(false);
    });
  });

  describe('parseResponse', () => {
    it('parses plain JSON responses', async () => {
      // 純粋な JSON 文字列を正しく構造化データにパースできることを確認
      const { InstructionValidator } = await setupValidator();
      const parsed = (InstructionValidator as any).parseResponse(
        JSON.stringify({
          isSafe: true,
          reason: '分析指示です',
          category: 'analysis',
          confidence: 'high',
        }),
      );

      expect(parsed).toEqual({
        isSafe: true,
        reason: '分析指示です',
        category: 'analysis',
        confidence: 'high',
      });
    });

    it('extracts JSON inside markdown code blocks', async () => {
      // Markdown のコードブロック内にある JSON を抽出してパースできることを確認
      const { InstructionValidator } = await setupValidator();
      const markdown = [
        '判定結果は以下の通りです：',
        '```json',
        '{"isSafe": false, "reason": "削除指示です", "category": "execution", "confidence": "high"}',
        '```',
        '以上です。',
      ].join('\n');

      const parsed = (InstructionValidator as any).parseResponse(markdown);

      expect(parsed).toEqual({
        isSafe: false,
        reason: '削除指示です',
        category: 'execution',
        confidence: 'high',
      });
    });

    it('finds embedded JSON within text', async () => {
      // テキスト中に埋め込まれた JSON を検出しパースできることを確認
      const { InstructionValidator } = await setupValidator();
      const parsed = (InstructionValidator as any).parseResponse(
        '結果: {"isSafe": true, "reason": "安全", "category": "analysis", "confidence": "medium"} です。',
      );

      expect(parsed).toEqual({
        isSafe: true,
        reason: '安全',
        category: 'analysis',
        confidence: 'medium',
      });
    });

    it('validates required fields and throws on missing isSafe', async () => {
      // 必須フィールド isSafe が欠落した JSON はバリデーションエラーになることを確認
      const { InstructionValidator } = await setupValidator();
      expect(() =>
        (InstructionValidator as any).validateAndParse(
          '{"reason": "テスト", "category": "analysis", "confidence": "high"}',
        ),
      ).toThrow('Missing or invalid field: isSafe');
    });

    it('rejects invalid category values', async () => {
      // category が許容値以外の場合にエラーを投げることを確認
      const { InstructionValidator } = await setupValidator();
      expect(() =>
        (InstructionValidator as any).validateAndParse(
          '{"isSafe": true, "reason": "テスト", "category": "invalid", "confidence": "high"}',
        ),
      ).toThrow('Invalid category value');
    });

    it('rejects invalid confidence values', async () => {
      // confidence が許容値以外の場合にエラーを投げることを確認
      const { InstructionValidator } = await setupValidator();
      expect(() =>
        (InstructionValidator as any).validateAndParse(
          '{"isSafe": true, "reason": "テスト", "category": "analysis", "confidence": "very_high"}',
        ),
      ).toThrow('Invalid confidence value');
    });
  });
});

describe('InstructionValidator prompt language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('builds Japanese validation prompt when AI_WORKFLOW_LANGUAGE=ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const { PromptLoader } = await import('../../../src/core/prompt-loader.js');
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');
    const { InstructionValidator } = await import('../../../src/core/instruction-validator.js');

    const prompt = (InstructionValidator as any).buildPrompt('削除して');

    expect(pathSpy).toHaveBeenCalledWith('validation', 'validate-instruction', 'ja');
    expect(prompt).toContain('セキュリティ検証エージェント');
  });

  it('builds English validation prompt when AI_WORKFLOW_LANGUAGE=en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const { PromptLoader } = await import('../../../src/core/prompt-loader.js');
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');
    const { InstructionValidator } = await import('../../../src/core/instruction-validator.js');

    const prompt = (InstructionValidator as any).buildPrompt('delete this file');

    expect(pathSpy).toHaveBeenCalledWith('validation', 'validate-instruction', 'en');
    expect(prompt).toContain('security validation agent');
  });
});
