import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

type ValidatorSetupOptions = {
  codexClient?: { executeTask: jest.Mock } | null;
  claudeClient?: { executeTask: jest.Mock } | null;
  openAiResponse?: unknown;
  openAiImpl?: jest.Mock;
  apiKey?: string | null;
};

const DEFAULT_PROMPT = 'Validate: {{instruction}}';

async function createValidator(options: ValidatorSetupOptions = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  const createMock = options.openAiImpl ?? jest.fn();
  if (options.openAiResponse !== undefined) {
    createMock.mockResolvedValue(options.openAiResponse);
  }

  const mockConfig = {
    getOpenAiApiKey: jest.fn(() => (options.apiKey === undefined ? 'test-key' : options.apiKey)),
    getLanguage: jest.fn(() => {
      const envLang = process.env.AI_WORKFLOW_LANGUAGE?.toLowerCase().trim();
      return envLang === 'en' ? 'en' : 'ja';
    }),
    getCodexApiKey: jest.fn(() => null),
    getClaudeCodeToken: jest.fn(() => null),
  };

  const mockOpenAI = {
    chat: {
      completions: {
        create: createMock,
      },
    },
  };

  jest.unstable_mockModule('../../../src/utils/logger.js', () => ({ logger }));
  jest.unstable_mockModule('../../../src/core/config.js', () => ({ config: mockConfig }));
  jest.unstable_mockModule('../../../src/core/prompt-loader.js', () => ({
    PromptLoader: { loadPrompt: jest.fn(() => DEFAULT_PROMPT) },
  }));
  jest.unstable_mockModule('../../../src/core/helpers/codex-credentials.js', () => ({
    detectCodexCliAuth: jest.fn(() => ({ authFilePath: null })),
    isValidCodexApiKey: jest.fn(() => false),
  }));
  jest.unstable_mockModule('../../../src/core/claude-agent-client.js', () => ({
    ClaudeAgentClient: class {},
    resolveClaudeModel: jest.fn(() => 'claude-3-haiku'),
  }));
  jest.unstable_mockModule('../../../src/core/codex-agent-client.js', () => ({
    CodexAgentClient: class {},
    resolveCodexModel: jest.fn(() => 'gpt-mini'),
  }));
  jest.unstable_mockModule('openai', () => ({ default: jest.fn(() => mockOpenAI) }));

  const { InstructionValidator } = await import('../../../src/core/instruction-validator.js');

  const validator = new InstructionValidator('/tmp/repo', {
    codexClient: options.codexClient ?? null,
    claudeClient: options.claudeClient ?? null,
    openaiClient:
      options.apiKey === null ? null : options.openAiImpl || options.openAiResponse ? mockOpenAI : mockOpenAI,
  });

  return { validator, createMock, mockConfig };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('InstructionValidator (インスタンス版)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // LLMがコードブロック形式で安全判定を返すパスを確認する
  it('LLMのコードブロック応答を安全判定として処理する', async () => {
    const codeBlockResponse = {
      choices: [
        {
          message: {
            content: [
              '結果です。',
              '```json',
              JSON.stringify({
                isSafe: true,
                reason: '分析のみ',
                category: 'analysis',
                confidence: 'high',
              }),
              '```',
            ].join('\n'),
          },
        },
      ],
    };

    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiResponse: codeBlockResponse,
    });

    const result = await validator.validate('削除すべきファイルを検出してください');

    expect(result.isValid).toBe(true);
    expect(result.validationMethod).toBe('llm');
    expect(result.confidence).toBe('high');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  // LLMが危険判定を返した場合に結果がそのまま伝搬されることを確認する
  it('LLMが危険判定を返した場合に伝搬される', async () => {
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

    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiResponse: unsafeResponse,
    });

    const result = await validator.validate('このファイルを削除して');

    expect(result.isValid).toBe(false);
    expect(result.validationMethod).toBe('llm');
    expect(result.errorMessage).toContain('Unsafe instruction detected');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  // 同一指示の再検証でキャッシュが利用されLLM呼び出しが抑制されることを確認する
  it('同一指示の2回目はキャッシュヒットでLLM呼び出しを抑制する', async () => {
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

    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiResponse: llmResponse,
    });

    const first = await validator.validate('リファクタリング候補を洗い出してください');
    const second = await validator.validate('リファクタリング候補を洗い出してください');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  // TTL経過後にはキャッシュが失効し再度LLM検証が走ることを確認する
  it('TTL経過後はキャッシュを無効化して再検証する', async () => {
    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
    });

    const nowSpy = jest.spyOn(Date, 'now');
    let now = 0;
    nowSpy.mockImplementation(() => now);

    createMock
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ isSafe: true, reason: 'first', category: 'analysis', confidence: 'medium' }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ isSafe: true, reason: 'second', category: 'analysis', confidence: 'high' }) } },
        ],
      });

    const first = await validator.validate('コードを分析してください');

    now = ONE_HOUR_MS + 1;
    const second = await validator.validate('コードを分析してください');

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(first.reason).toBe('first');
    expect(second.reason).toBe('second');

    nowSpy.mockRestore();
  });

  // LRUキャッシュが最古アクセス要素を正しく削除することを確認する
  it('LRUポリシーで最古アクセスのキャッシュを削除する', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null });
    const ValidationCacheClass = (validator as any).cache.constructor;
    const nowSpy = jest.spyOn(Date, 'now');
    let now = 0;
    nowSpy.mockImplementation(() => now);

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
    nowSpy.mockRestore();
  });

  // 同一入力に対してハッシュ値が決定的であることを確認する
  it('同一入力に対してハッシュ値が安定する', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null });
    const ValidationCacheClass = (validator as any).cache.constructor;

    const hash1 = ValidationCacheClass.computeHash('same instruction');
    const hash2 = ValidationCacheClass.computeHash('same instruction');
    const different = ValidationCacheClass.computeHash('different instruction');

    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(different);
  });

  // LLMリトライで一時失敗から最終的に成功するシナリオを確認する
  it('LLMリトライ後に成功するケースを扱う', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiImpl: jest.fn(async () => {
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

    const resultPromise = validator.validate('パフォーマンスを分析してください');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(callCount).toBe(3);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.isValid).toBe(true);
    expect(result.validationMethod).toBe('llm');
  });

  // LLMが全て失敗したときにパターンマッチへフォールバックする挙動を確認する
  it('LLMが全失敗した場合パターンマッチへフォールバックする', async () => {
    jest.useFakeTimers();
    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiImpl: jest.fn(async () => {
        throw new Error('API unavailable');
      }),
    });

    const resultPromise = validator.validate('このファイルを削除してください');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.validationMethod).toBe('pattern');
    expect(result.isValid).toBe(true); // low信頼の警告後に続行
    expect(result.reason).toContain('low confidence');
  });

  // APIキーが未設定の場合LLMを呼ばずにパターンマッチのみ走ることを確認する
  it('APIキー未設定の場合はLLMを呼ばずパターンマッチのみ実行する', async () => {
    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      apiKey: null,
    });

    const result = await validator.validate('DELETE this File');

    expect(result.validationMethod).toBe('pattern');
    expect(createMock).not.toHaveBeenCalled();
  });

  // 空文字入力ではバリデーションエラーを送出することを確認する
  it('空文字入力は例外をスローする', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    await expect(validator.validate('   ')).rejects.toThrow('Instruction cannot be empty');
  });

  // 2000文字超の入力で警告ログが出るが結果は返却されることを確認する
  it('2000文字超は警告しつつ結果を返す', async () => {
    const longInstruction = 'a'.repeat(2500);
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });

    const result = await validator.validate(longInstruction);

    expect(logger.warn).toHaveBeenCalledWith(
      'Instruction exceeds 2000 characters, proceeding without truncation.',
    );
    expect(result.validationMethod).toBe('pattern');
  });

  // LLMが不正JSONを返した場合にリトライし最終的にパターンへフォールバックすることを確認する
  it('LLMが不正JSONを返した場合リトライし最終的にフォールバックする', async () => {
    jest.useFakeTimers();
    const { validator, createMock } = await createValidator({
      codexClient: null,
      claudeClient: null,
      openAiImpl: jest.fn(async () => ({
        choices: [{ message: { content: 'This is not valid JSON' } }],
      })),
    });

    const resultPromise = validator.validate('任意の指示');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.validationMethod).toBe('pattern');
  });

  // npm run build のような安全スクリプトが medium 信頼で通過することを確認する
  it('安全なCLIパターンはmedium信頼の安全判定になる', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    const result = (validator as any).validateWithPatterns('npm run build を実行してください');

    expect(result.isValid).toBe(true);
    expect(result.confidence).toBe('medium');
    expect(result.validationMethod).toBe('pattern');
  });

  // execute --phase all のCLI指示がSAFE_PATTERNSで検出されることを確認する
  it('execute --phase all を安全パターンとしてmedium信頼で扱う', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    const result = (validator as any).validateWithPatterns('execute --phase all を実行して');

    expect(result.isValid).toBe(true);
    expect(result.confidence).toBe('medium');
    expect(result.validationMethod).toBe('pattern');
  });

  // 危険パターン検出時に警告を出し低信頼で続行する挙動を確認する
  it('危険パターン検出時は警告後に低信頼で続行する', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    const result = await validator.validate('commit して push してください');

    expect(logger.warn).toHaveBeenCalled();
    expect(result.isValid).toBe(true);
    expect(result.validationMethod).toBe('pattern');
    expect(result.reason).toContain('low confidence');
  });

  // Codexエージェントが成功した場合フォールバックせず終了する挙動を確認する
  it('Codexエージェントが成功した場合はフォールバックしない', async () => {
    const codexExecute = jest.fn().mockResolvedValue([
      JSON.stringify({
        isSafe: true,
        reason: 'codex ok',
        category: 'analysis',
        confidence: 'high',
      }),
    ]);
    const { validator } = await createValidator({
      codexClient: { executeTask: codexExecute },
      claudeClient: null,
      apiKey: null,
    });

    const result = await validator.validate('安全な指示');

    expect(result.validationMethod).toBe('codex-agent');
    expect(codexExecute).toHaveBeenCalledTimes(1);
  });

  // Codexが失敗したときClaudeへフォールバックする経路を確認する
  it('Codex失敗時はClaudeへフォールバックする', async () => {
    const codexExecute = jest.fn().mockRejectedValue(new Error('codex down'));
    const claudeExecute = jest.fn().mockResolvedValue([
      '```json {"isSafe": true, "reason": "claude ok", "category": "analysis", "confidence": "medium"} ```',
    ]);

    const { validator } = await createValidator({
      codexClient: { executeTask: codexExecute },
      claudeClient: { executeTask: claudeExecute },
      apiKey: null,
    });

    const result = await validator.validate('分析してください');

    expect(result.validationMethod).toBe('claude-agent');
    expect(codexExecute).toHaveBeenCalledTimes(1);
    expect(claudeExecute).toHaveBeenCalledTimes(1);
  });

  // エージェントレスポンスのコードブロックJSONを正しくパースできることを確認する
  it('parseAgentResponseでコードブロック内JSONを抽出できる', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    const parsed = (validator as any).parseAgentResponse([
      '```json {"isSafe": false, "reason": "削除指示", "category": "execution", "confidence": "high"} ```',
    ]);

    expect(parsed.isSafe).toBe(false);
    expect(parsed.reason).toBe('削除指示');
    expect(parsed.confidence).toBe('high');
  });

  // ネストされたメッセージ構造でもJSONを抽出できることを確認する
  it('ネストされたメッセージ構造からJSONを抽出できる', async () => {
    const { validator } = await createValidator({ codexClient: null, claudeClient: null, apiKey: null });
    const nestedMessage = JSON.stringify({
      message: {
        content: [
          {
            type: 'text',
            text: '{"isSafe": true, "reason": "ok", "category": "analysis", "confidence": "medium"}',
          },
        ],
      },
    });

    const parsed = (validator as any).parseAgentResponse([nestedMessage]);

    expect(parsed.isSafe).toBe(true);
    expect(parsed.reason).toBe('ok');
  });
});
