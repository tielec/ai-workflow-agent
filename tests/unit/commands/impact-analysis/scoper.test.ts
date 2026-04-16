/**
 * ユニットテスト: impact-analysis Scoperステージ
 *
 * テスト対象: src/commands/impact-analysis/scoper.ts
 * テストシナリオ: test-scenario.md の TC-SCOPER-001〜007, TC-SCOPER-F01〜F03, S01, P01, D01, DEL01
 */

import { jest } from '@jest/globals';
import type { PipelineContext } from '../../../../src/commands/impact-analysis/types.js';
import {
  createDefaultGuardrailsConfig,
  createInitialGuardrailsState,
} from '../../../../src/commands/impact-analysis/guardrails.js';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockLoadPrompt = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

await jest.unstable_mockModule('node:fs', () => ({
  __esModule: true,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
}));

await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    debug: mockLoggerDebug,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

const scoperModule = await import('../../../../src/commands/impact-analysis/scoper.js');
const { executeScoper } = scoperModule;

function createContext(customInstruction?: string): PipelineContext {
  return {
    options: {
      prNumber: 123,
      owner: 'owner',
      repo: 'repo',
      agent: 'auto',
      dryRun: false,
      language: 'ja',
      customInstruction,
    },
    diff: {
      diff: 'diff --git a/src/db/schema.prisma b/src/db/schema.prisma\n+ model User { email String }',
      truncated: false,
      filesChanged: 1,
    },
    playbook: '## パターン名: DBスキーマ変更',
    guardrails: createDefaultGuardrailsConfig(),
    guardrailsState: createInitialGuardrailsState(),
    logDir: '/tmp/logs/pr-123',
  };
}

const validScopeResult = {
  investigationPoints: [
    {
      id: 'INV-001',
      patternName: 'DBスキーマ変更',
      description: 'schema.prisma 変更の影響調査',
      targetFiles: ['src/db/schema.prisma'],
      searchKeywords: ['UserModel'],
      instructions: 'schema.prisma の変更内容を確認する',
    },
  ],
  matchedPatterns: ['DBスキーマ変更'],
  skippedPatterns: [],
  reasoning: 'DBスキーマ変更の影響確認が必要',
};

const validScopeResultJson = JSON.stringify(validScopeResult);

const sdkStreamMessages = [
  '{"type":"system","subtype":"init","cwd":"/tmp/workspace","session_id":"abc"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"分析中"}]}}',
  '{"type":"result","subtype":"success","content":"完了"}',
];

describe('Scoper', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockLoadPrompt.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();

    mockLoadPrompt.mockReturnValue([
      'DIFF:{diff}',
      'PLAYBOOK:{playbook}',
      'CUSTOM:{custom_instruction}',
      'OUTPUT:{output_file_path}',
    ].join('\n'));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(validScopeResultJson);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-SCOPER-001/F01: 出力ファイルから単一調査観点を読み込む', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(sdkStreamMessages),
    } as any;

    const result = await executeScoper(context, codexClient, null);

    // Given: 出力ファイルに有効な JSON がある
    // When: Scoper を実行する
    // Then: ファイル由来の ScopeResult が返る
    expect(result.investigationPoints).toHaveLength(1);
    expect(result.investigationPoints[0].id).toBe('INV-001');
    expect(result.matchedPatterns).toEqual(['DBスキーマ変更']);
    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/logs/pr-123/scoper-result.json', 'utf-8');
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      'Scoper出力ファイルを読み込みました: /tmp/logs/pr-123/scoper-result.json',
    );
  });

  it('TC-SCOPER-002: 複数パターンの結果を処理できる', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        investigationPoints: [
          validScopeResult.investigationPoints[0],
          {
            id: 'INV-002',
            patternName: '依存更新',
            description: '依存更新の影響調査',
            targetFiles: ['package.json'],
            searchKeywords: ['chalk'],
            instructions: '依存の利用箇所を確認する',
          },
        ],
        matchedPatterns: ['DBスキーマ変更', '依存更新'],
        skippedPatterns: [],
        reasoning: '複数観点の確認が必要',
      }),
    );

    const result = await executeScoper(createContext(), { executeTask: jest.fn().mockResolvedValue(['ok']) } as any, null);

    // Given: 複数 investigationPoints を含むファイルがある
    // When: Scoper を実行する
    // Then: 複数観点がそのまま返る
    expect(result.investigationPoints).toHaveLength(2);
    expect(result.matchedPatterns).toEqual(['DBスキーマ変更', '依存更新']);
  });

  it('TC-SCOPER-003: 空の investigationPoints を正常に扱う', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        investigationPoints: [],
        matchedPatterns: [],
        skippedPatterns: [],
        reasoning: '該当なし',
      }),
    );

    const result = await executeScoper(createContext(), { executeTask: jest.fn().mockResolvedValue(['ok']) } as any, null);

    // Given: investigationPoints が空の JSON
    // When: Scoper を実行する
    // Then: 空配列のまま返る
    expect(result.investigationPoints).toEqual([]);
    expect(result.reasoning).toBe('該当なし');
  });

  it('TC-SCOPER-004: custom instruction を追加する', async () => {
    const result = await executeScoper(
      createContext('追加の調査指示'),
      { executeTask: jest.fn().mockResolvedValue(['ok']) } as any,
      null,
    );

    // Given: custom instruction が指定されている
    // When: Scoper を実行する
    // Then: custom investigation point が末尾に追加される
    expect(result.investigationPoints).toHaveLength(2);
    expect(result.investigationPoints[1]).toMatchObject({
      id: 'INV-CUSTOM',
      patternName: 'custom-instruction',
      instructions: '追加の調査指示',
    });
  });

  it('TC-SCOPER-005: custom instruction 未指定時は追加しない', async () => {
    const result = await executeScoper(
      createContext(),
      { executeTask: jest.fn().mockResolvedValue(['ok']) } as any,
      null,
    );

    // Given: custom instruction が未指定
    // When: Scoper を実行する
    // Then: ファイル由来の観点だけが返る
    expect(result.investigationPoints.some((point) => point.id === 'INV-CUSTOM')).toBe(false);
  });

  it('TC-SCOPER-006: エージェントエラーは呼び出し元へ伝播する', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockRejectedValue(new Error('Agent timeout')),
    } as any;

    // Given: エージェント実行が失敗する
    // When: Scoper を実行する
    // Then: エラーが上位へ伝播する
    await expect(executeScoper(context, codexClient, null)).rejects.toThrow('Agent timeout');
  });

  it('TC-SCOPER-007: ガードレール状態を更新する', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(['rg src/db schema', 'grep UserModel src']),
    } as any;

    const result = await executeScoper(context, codexClient, null);

    // Given: ツール呼び出しを含む agentMessages
    // When: Scoper を実行する
    // Then: tokenUsage と toolCallCount が更新される
    expect(result).toBeDefined();
    expect(context.guardrailsState.tokenUsage).toBeGreaterThan(0);
    expect(context.guardrailsState.toolCallCount).toBeGreaterThanOrEqual(2);
  });

  it('TC-SCOPER-F02: ファイル未作成時はエージェント出力へフォールバックする', async () => {
    mockExistsSync.mockReturnValue(false);
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([validScopeResultJson]),
    } as any;

    const result = await executeScoper(createContext(), codexClient, null);

    // Given: 出力ファイルが存在しない
    // When: Scoper を実行する
    // Then: agentMessages の JSON から結果を構築する
    expect(result.investigationPoints[0].id).toBe('INV-001');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Scoper出力ファイルが見つかりません。エージェント出力からフォールバックします: /tmp/logs/pr-123/scoper-result.json',
    );
  });

  it('TC-SCOPER-F03: 空ファイル時はエージェント出力へフォールバックする', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('   ');
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([validScopeResultJson]),
    } as any;

    const result = await executeScoper(createContext(), codexClient, null);

    // Given: 出力ファイルは存在するが空
    // When: Scoper を実行する
    // Then: 空ファイル警告後に agentMessages を使う
    expect(result.investigationPoints[0].id).toBe('INV-001');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Scoper出力ファイルが空です。エージェント出力からフォールバックします: /tmp/logs/pr-123/scoper-result.json',
    );
  });

  it('TC-SCOPER-S01: SDK 生 JSON があってもファイル内容を優先する', async () => {
    const result = await executeScoper(
      createContext(),
      { executeTask: jest.fn().mockResolvedValue(sdkStreamMessages) } as any,
      null,
    );

    // Given: agentMessages に SDK 生 JSON が含まれる
    // When: ファイルが正常に存在する状態で Scoper を実行する
    // Then: ファイル由来の調査観点のみを返す
    expect(result.investigationPoints).toHaveLength(1);
    expect(result.investigationPoints[0].id).toBe('INV-001');
    expect(result.reasoning).toBe('DBスキーマ変更の影響確認が必要');
  });

  it('TC-SCOPER-P01: プロンプトに出力ファイルパスを埋め込む', async () => {
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(['ok']),
    } as any;

    await executeScoper(createContext(), codexClient, null);

    // Given: 出力パス入りテンプレート
    // When: Scoper を実行する
    // Then: エージェントへ渡す prompt に絶対パスが含まれる
    expect(codexClient.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('OUTPUT:/tmp/logs/pr-123/scoper-result.json'),
        maxTurns: 3,
      }),
    );
  });

  it('TC-SCOPER-D01: 出力先ディレクトリを事前作成する', async () => {
    await executeScoper(
      createContext(),
      { executeTask: jest.fn().mockResolvedValue(['ok']) } as any,
      null,
    );

    // Given: logDir 配下へ結果を書き出す必要がある
    // When: Scoper を実行する
    // Then: ディレクトリが recursive で作成される
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/logs/pr-123', { recursive: true });
  });

  it('TC-SCOPER-DEL01: 内部ヘルパーは公開エクスポートされていない', () => {
    // Given: Scoper モジュールの公開 API
    // When: エクスポート一覧を確認する
    // Then: 内部ヘルパーは公開されていない
    expect(scoperModule).not.toHaveProperty('extractJsonBlock');
    expect(scoperModule).not.toHaveProperty('buildScoperPrompt');
    expect(scoperModule).not.toHaveProperty('readScoperOutput');
  });
});
