import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';

const originalEnv = {
  CODEX_API_KEY: process.env.CODEX_API_KEY,
  CODEX_MODEL: process.env.CODEX_MODEL,
  CODEX_AUTH_JSON: process.env.CODEX_AUTH_JSON,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
  CLAUDE_CODE_API_KEY: process.env.CLAUDE_CODE_API_KEY,
  CLAUDE_CODE_CREDENTIALS_PATH: process.env.CLAUDE_CODE_CREDENTIALS_PATH,
};

const codexClientInstance = {
  executeTask: jest.fn(),
} as unknown as jest.Mocked<CodexAgentClient>;
const claudeClientInstance = {
  executeTask: jest.fn(),
} as unknown as { executeTask: jest.Mock };

let CodexAgentClientMock: jest.Mock;
let loggerRef: typeof import('../../src/utils/logger.js')['logger'];
let detectCodexCliAuthMock: jest.Mock;
let isValidCodexApiKeyMock: jest.Mock;
let openAiCreateMock: jest.Mock;

function restoreEnv() {
  if (originalEnv.CODEX_API_KEY === undefined) {
    delete process.env.CODEX_API_KEY;
  } else {
    process.env.CODEX_API_KEY = originalEnv.CODEX_API_KEY;
  }

  if (originalEnv.CODEX_MODEL === undefined) {
    delete process.env.CODEX_MODEL;
  } else {
    process.env.CODEX_MODEL = originalEnv.CODEX_MODEL;
  }

  if (originalEnv.CODEX_AUTH_JSON === undefined) {
    delete process.env.CODEX_AUTH_JSON;
  } else {
    process.env.CODEX_AUTH_JSON = originalEnv.CODEX_AUTH_JSON;
  }

  if (originalEnv.OPENAI_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  }

  if (originalEnv.CLAUDE_CODE_OAUTH_TOKEN === undefined) {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  } else {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = originalEnv.CLAUDE_CODE_OAUTH_TOKEN;
  }

  if (originalEnv.CLAUDE_CODE_API_KEY === undefined) {
    delete process.env.CLAUDE_CODE_API_KEY;
  } else {
    process.env.CLAUDE_CODE_API_KEY = originalEnv.CLAUDE_CODE_API_KEY;
  }

  if (originalEnv.CLAUDE_CODE_CREDENTIALS_PATH === undefined) {
    delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
  } else {
    process.env.CLAUDE_CODE_CREDENTIALS_PATH = originalEnv.CLAUDE_CODE_CREDENTIALS_PATH;
  }
}

async function importContentParserWithMocks(options: { codexAuthPath?: string | null; codexApiKeyIsValid?: boolean } = {}) {
  const { codexAuthPath = null, codexApiKeyIsValid = true } = options;
  CodexAgentClientMock = jest.fn().mockImplementation(() => codexClientInstance);
  detectCodexCliAuthMock = jest.fn().mockReturnValue({
    candidates: codexAuthPath ? [codexAuthPath] : [],
    authFilePath: codexAuthPath,
  });
  isValidCodexApiKeyMock = jest.fn((apiKey: string | null | undefined) => {
    if (!codexApiKeyIsValid) {
      return false;
    }
    return typeof apiKey === 'string' && apiKey.trim().length >= 20;
  });

  await jest.unstable_mockModule('openai', async () => {
    openAiCreateMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"result":"PASS"}' } }],
    });
    class OpenAiMock {
      public chat = {
        completions: {
          create: openAiCreateMock,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_options?: unknown) {}
    }
    return {
      __esModule: true,
      OpenAI: OpenAiMock,
    };
  });

  await jest.unstable_mockModule('@anthropic-ai/sdk', async () => {
    class AnthropicMock {
      public messages = {
        create: jest.fn().mockResolvedValue({ content: [] }),
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_options?: unknown) {}
    }
    return {
      __esModule: true,
      default: AnthropicMock,
    };
  });

  await jest.unstable_mockModule('../../src/core/claude-agent-client.js', async () => {
    return {
      __esModule: true,
      ClaudeAgentClient: jest.fn().mockImplementation(() => ({
        executeTask: claudeClientInstance.executeTask,
      })),
    };
  });

  await jest.unstable_mockModule('../../src/core/codex-agent-client.js', async () => {
    const CODEX_MODEL_ALIASES = {
      max: 'gpt-5.2-codex',
      mini: 'gpt-5.1-codex-mini',
      '5.1': 'gpt-5.1',
      legacy: 'gpt-5-codex',
    };
    const DEFAULT_CODEX_MODEL = 'gpt-5.2-codex';

    const resolveCodexModel = (modelOrAlias: string | null | undefined) => {
      if (!modelOrAlias || !modelOrAlias.trim()) {
        return DEFAULT_CODEX_MODEL;
      }
      const normalized = modelOrAlias.toLowerCase().trim();
      if (CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES]) {
        return CODEX_MODEL_ALIASES[normalized as keyof typeof CODEX_MODEL_ALIASES];
      }
      return modelOrAlias;
    };

    return {
      __esModule: true,
      CODEX_MODEL_ALIASES,
      DEFAULT_CODEX_MODEL,
      resolveCodexModel,
      CodexAgentClient: CodexAgentClientMock,
    };
  });

  await jest.unstable_mockModule('../../src/core/helpers/codex-credentials.js', async () => {
    return {
      __esModule: true,
      CODEX_MIN_API_KEY_LENGTH: 20,
      detectCodexCliAuth: detectCodexCliAuthMock,
      isValidCodexApiKey: isValidCodexApiKeyMock,
      hasCodexCliAuth: jest.fn(() => codexAuthPath !== null),
    };
  });

  const [contentParserModule, codexModule] = await Promise.all([
    import('../../src/core/content-parser.js'),
    import('../../src/core/codex-agent-client.js'),
  ]);

  loggerRef = (await import('../../src/utils/logger.js')).logger;

  return {
    ContentParser: contentParserModule.ContentParser,
    DEFAULT_CODEX_MODEL: codexModule.DEFAULT_CODEX_MODEL as string,
  };
}

describe('ContentParser - Codexモデル選択', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    codexClientInstance.executeTask.mockReset();
    claudeClientInstance.executeTask.mockReset();
    process.env.CODEX_API_KEY = 'test-codex-api-key-1234567890';
    delete process.env.CODEX_MODEL;
    delete process.env.CODEX_AUTH_JSON;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_API_KEY;
    delete process.env.CLAUDE_CODE_CREDENTIALS_PATH;
  });

  afterEach(() => {
    restoreEnv();
    jest.restoreAllMocks();
  });

  test('CODEX_MODEL未設定時にデフォルトモデルを使用し、gpt-4oを回避する', async () => {
    const { ContentParser, DEFAULT_CODEX_MODEL } = await importContentParserWithMocks();
    const debugSpy = jest.spyOn(loggerRef, 'debug').mockImplementation(() => {});

    // Given: CODEX_MODEL未設定でCodex APIキーのみがある
    // When: ContentParserを初期化する
    // Then: デフォルトモデルで初期化され、gpt-4oが選択されない
    new ContentParser();

    expect(CodexAgentClientMock).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe(DEFAULT_CODEX_MODEL);
    expect(args?.model).not.toContain('gpt-4o');
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining(`ContentParser initialized with Codex model: ${DEFAULT_CODEX_MODEL}`),
    );
  });

  test('CODEX_MODELにフルIDを指定した場合、そのモデルで初期化される', async () => {
    process.env.CODEX_MODEL = 'gpt-5.1-codex-mini';
    const { ContentParser } = await importContentParserWithMocks();

    // Given: フルIDのモデル名を環境変数で指定
    // When: ContentParserを初期化する
    // Then: 指定したモデルでCodexクライアントが生成される
    new ContentParser();

    expect(CodexAgentClientMock).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe('gpt-5.1-codex-mini');
  });

  test('CODEX_MODELにエイリアスminiを指定した場合、gpt-5.1-codex-miniへ解決される', async () => {
    process.env.CODEX_MODEL = 'mini';
    const { ContentParser } = await importContentParserWithMocks();

    // Given: モデルエイリアスを環境変数で指定
    // When: ContentParserを初期化する
    // Then: エイリアスが正式なモデル名に解決される
    new ContentParser();

    expect(CodexAgentClientMock).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe('gpt-5.1-codex-mini');
  });

  test('CODEX_MODELに未知のモデル名を指定した場合、そのまま渡される', async () => {
    process.env.CODEX_MODEL = 'custom-codex-model-x';
    const { ContentParser } = await importContentParserWithMocks();

    // Given: 未知のモデル名を環境変数で指定
    // When: ContentParserを初期化する
    // Then: エイリアス解決をせず指定の文字列がそのままモデルとして渡される
    new ContentParser();

    expect(CodexAgentClientMock).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe('custom-codex-model-x');
  });

  test('Codex認証がある場合はcodex-agent経由でLLMを呼び出す', async () => {
    process.env.CODEX_MODEL = 'mini';
    const { ContentParser } = await importContentParserWithMocks();
    const parser = new ContentParser();

    codexClientInstance.executeTask.mockResolvedValueOnce([
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '## 品質ゲート評価\n判定: PASS' },
      }),
    ]);

    // Given: Codexモデルで初期化されたContentParser
    // When: callLlmを実行し、codex-agentの実行結果をモックする
    // Then: codex-agent経由で呼ばれ、戻り値のテキストがそのまま取得できる
    // @ts-expect-error プライベートメソッドをテスト用に直接呼び出す
    const content = await parser.callLlm('dummy prompt', 128);

    expect(codexClientInstance.executeTask).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe('gpt-5.1-codex-mini');
    expect(content).toContain('判定: PASS');
  });

  test('parseReviewResultがcodex-agent経由で実行され、gpt-4oエラーを回避する', async () => {
    const { ContentParser, DEFAULT_CODEX_MODEL } = await importContentParserWithMocks({
      codexAuthPath: '/home/node/.codex/auth.json',
    });
    const parser = new ContentParser();

    codexClientInstance.executeTask.mockResolvedValueOnce([
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"result":"PASS"}' },
      }),
    ]);

    // Given: Codex認証があり、レビュー出力をparseReviewResultで解析する
    const reviewMessages = [
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '## 品質ゲート評価\n判定: PASS' },
      }),
    ];

    // When: parseReviewResultを実行する
    const result = await parser.parseReviewResult(reviewMessages);

    // Then: codex-agentでLLMが呼ばれ、gpt-4oは選択されない
    expect(result.result).toBe('PASS');
    expect(CodexAgentClientMock).toHaveBeenCalledTimes(1);
    const args = CodexAgentClientMock.mock.calls[0]?.[0] as { model?: string };
    expect(args?.model).toBe(DEFAULT_CODEX_MODEL);
    expect(args?.model).not.toContain('gpt-4o');
    expect(codexClientInstance.executeTask).toHaveBeenCalledTimes(1);
    expect(openAiCreateMock).not.toHaveBeenCalled();
  });

  test('Codex認証がない場合はcodex-agentを初期化せずにフォールバックする', async () => {
    delete process.env.CODEX_API_KEY;
    delete process.env.CODEX_AUTH_JSON;
    process.env.OPENAI_API_KEY = 'dummy-openai-key';

    const { ContentParser } = await importContentParserWithMocks({
      codexAuthPath: null,
      codexApiKeyIsValid: false,
    });
    const parser = new ContentParser();

    codexClientInstance.executeTask.mockResolvedValueOnce([
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"result":"PASS"}' },
      }),
    ]);

    // Given: Codex関連の認証情報が存在しない
    const reviewMessages = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '## 品質ゲート評価\n判定: PASS' }] },
      }),
    ];

    // When: parseReviewResultを実行し、フォールバック経路で解析する
    const result = await parser.parseReviewResult(reviewMessages);

    // Then: codex-agentは初期化されず、OpenAI経路が使われる
    // @ts-expect-error プライベートフィールドを検証
    expect(parser.codexAgentClient).toBeNull();
    // @ts-expect-error プライベートメソッドを検証
    expect(parser.getEffectiveMode()).toBe('openai');
    expect(result.result).toBe('PASS');
    expect(openAiCreateMock).toHaveBeenCalledTimes(1);
    expect(codexClientInstance.executeTask).not.toHaveBeenCalled();
  });

  test('parseReviewResultでCodex失敗時にClaudeへフォールバックする', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'dummy-claude-token';
    const { ContentParser } = await importContentParserWithMocks({
      codexAuthPath: '/home/node/.codex/auth.json',
    });
    const parser = new ContentParser();

    codexClientInstance.executeTask.mockRejectedValueOnce(new Error('Codex failed'));
    claudeClientInstance.executeTask.mockResolvedValueOnce([
      JSON.stringify({ type: 'result', result: '{"result":"PASS"}' }),
    ]);

    const reviewMessages = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '## 品質ゲート評価\n判定: PASS' }] },
      }),
    ];

    // When: Codex失敗時にparseReviewResultを実行
    const result = await parser.parseReviewResult(reviewMessages);

    // Then: ClaudeフォールバックでPASSが解析される
    expect(result.result).toBe('PASS');
    expect(codexClientInstance.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClientInstance.executeTask).toHaveBeenCalledTimes(1);
  });

  test('parseReviewResultでCodex/Claude失敗時はRegexフォールバックが使われる', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'dummy-claude-token';
    const { ContentParser } = await importContentParserWithMocks({
      codexAuthPath: '/home/node/.codex/auth.json',
    });
    const parser = new ContentParser();

    codexClientInstance.executeTask.mockRejectedValueOnce(new Error('Codex failed'));
    claudeClientInstance.executeTask.mockRejectedValueOnce(new Error('Claude failed'));

    const reviewMessages = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '## 品質ゲート評価\n判定: FAIL' }] },
      }),
    ];

    // When: Codex/Claude両方が失敗
    const result = await parser.parseReviewResult(reviewMessages);

    // Then: RegexフォールバックでFAILが判定される
    expect(result.result).toBe('FAIL');
    expect(codexClientInstance.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClientInstance.executeTask).toHaveBeenCalledTimes(1);
  });
});
