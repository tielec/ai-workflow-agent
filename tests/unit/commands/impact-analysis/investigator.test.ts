/**
 * ユニットテスト: impact-analysis Investigatorステージ
 *
 * テスト対象: src/commands/impact-analysis/investigator.ts
 * テストシナリオ: test-scenario.md の TC-INV-001〜008, TC-INV-F01〜F03, S01, P01, D01, DEL01
 */

import { jest } from '@jest/globals';
import type {
  PipelineContext,
  ScopeResult,
  InvestigationPoint,
} from '../../../../src/commands/impact-analysis/types.js';
import {
  createDefaultGuardrailsConfig,
  createInitialGuardrailsState,
} from '../../../../src/commands/impact-analysis/guardrails.js';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockLoadPrompt = jest.fn();
const mockExecuteAgentForStage = jest.fn();
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

await jest.unstable_mockModule('../../../../src/commands/impact-analysis/scoper.js', () => ({
  __esModule: true,
  executeAgentForStage: mockExecuteAgentForStage,
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

const investigatorModule = await import('../../../../src/commands/impact-analysis/investigator.js');
const { executeInvestigator } = investigatorModule;

function createContext(): PipelineContext {
  return {
    options: {
      prNumber: 123,
      owner: 'owner',
      repo: 'repo',
      agent: 'auto',
      dryRun: false,
      language: 'ja',
    },
    diff: {
      diff: 'diff --git a/src/db/schema.prisma b/src/db/schema.prisma\n+ model User { email String }',
      truncated: false,
      filesChanged: 1,
    },
    playbook: 'playbook',
    guardrails: createDefaultGuardrailsConfig(),
    guardrailsState: createInitialGuardrailsState(),
    logDir: '/tmp/logs/pr-123',
  };
}

function createPoint(id: string, patternName = 'DBスキーマ変更'): InvestigationPoint {
  return {
    id,
    patternName,
    description: `${id} の影響調査`,
    targetFiles: ['src/db/schema.prisma'],
    searchKeywords: ['UserModel'],
    instructions: `${id} の利用箇所を調査する`,
  };
}

function createScopeResult(points: InvestigationPoint[]): ScopeResult {
  return {
    investigationPoints: points,
    matchedPatterns: points.map((point) => point.patternName),
    skippedPatterns: [],
    reasoning: 'ok',
  };
}

function findingsJson(pointId: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    findings: [
      {
        investigationPointId: pointId,
        patternName: 'DBスキーマ変更',
        description: `${pointId} の発見事項`,
        evidence: [
          {
            type: 'code_reference',
            filePath: 'src/services/UserService.ts',
            lineNumber: 42,
            content: 'SELECT email FROM users',
          },
        ],
        severity: 'warning',
        ...overrides,
      },
    ],
  });
}

describe('Investigator', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockLoadPrompt.mockReset();
    mockExecuteAgentForStage.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();

    mockLoadPrompt.mockReturnValue([
      'DIFF:{diff}',
      'POINT:{investigation_point}',
      'OUTPUT:{output_file_path}',
    ].join('\n'));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('INV-001')) {
        return findingsJson('INV-001');
      }
      if (path.includes('INV-002')) {
        return findingsJson('INV-002');
      }
      if (path.includes('INV-003')) {
        return findingsJson('INV-003');
      }
      return findingsJson('INV-000');
    });
    mockExecuteAgentForStage.mockResolvedValue(['rg src/services User', 'grep email src']);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-INV-001/F01: 出力ファイルから単一観点の findings を読み込む', async () => {
    const point = createPoint('INV-001');
    const result = await executeInvestigator(
      createContext(),
      createScopeResult([point]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 観点別出力ファイルに有効な JSON がある
    // When: Investigator を実行する
    // Then: ファイル由来の findings が返る
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      investigationPointId: 'INV-001',
      severity: 'warning',
    });
    expect(result.completedPoints).toEqual(['INV-001']);
    expect(result.incompletePoints).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/tmp/logs/pr-123/investigator-INV-001.json',
      'utf-8',
    );
  });

  it('TC-INV-002: 複数観点を順次処理する', async () => {
    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001'), createPoint('INV-002'), createPoint('INV-003')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 調査観点が複数ある
    // When: Investigator を実行する
    // Then: すべての観点を処理する
    expect(result.completedPoints).toEqual(['INV-001', 'INV-002', 'INV-003']);
    expect(mockExecuteAgentForStage).toHaveBeenCalledTimes(3);
  });

  it('TC-INV-003: ガードレール到達時は残り観点を未完了扱いにする', async () => {
    const context = createContext();
    context.guardrails.maxToolCalls = 1;

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001'), createPoint('INV-002')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 1件目の処理でガードレール上限に達する設定
    // When: Investigator を実行する
    // Then: 後続観点は incompletePoints に入る
    expect(result.guardrailsReached).toBe(true);
    expect(result.completedPoints).toEqual(['INV-001']);
    expect(result.incompletePoints).toEqual(['INV-002']);
  });

  it('TC-INV-004: Evidence にファイルパスと行番号を保持する', async () => {
    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: evidence を含む findings JSON
    // When: Investigator を実行する
    // Then: code_reference の情報が保持される
    expect(result.findings[0].evidence[0]).toMatchObject({
      filePath: 'src/services/UserService.ts',
      lineNumber: 42,
    });
  });

  it('TC-INV-005: 個別観点でエラーが起きても後続処理を継続する', async () => {
    mockExecuteAgentForStage
      .mockResolvedValueOnce(['rg first'])
      .mockRejectedValueOnce(new Error('Agent error'))
      .mockResolvedValueOnce(['rg third']);

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001'), createPoint('INV-002'), createPoint('INV-003')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 2件目だけエージェント実行が失敗する
    // When: Investigator を実行する
    // Then: 失敗観点だけ未完了となり処理は継続する
    expect(result.completedPoints).toEqual(['INV-001', 'INV-003']);
    expect(result.incompletePoints).toEqual(['INV-002']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('調査観点 INV-002 の調査中にエラー'),
    );
  });

  it('TC-INV-006: 調査観点が 0 件なら空結果を返す', async () => {
    const result = await executeInvestigator(
      createContext(),
      createScopeResult([]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 調査観点が空
    // When: Investigator を実行する
    // Then: findings も completedPoints も空のまま返る
    expect(result.findings).toEqual([]);
    expect(result.completedPoints).toEqual([]);
    expect(result.incompletePoints).toEqual([]);
    expect(mockExecuteAgentForStage).not.toHaveBeenCalled();
  });

  it('TC-INV-007/F02: ファイル未作成時はエージェント出力へフォールバックする', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecuteAgentForStage.mockResolvedValue([findingsJson('INV-001')]);

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 出力ファイルが存在しない
    // When: Investigator を実行する
    // Then: フォールバックせず未完了として記録し 1 行警告だけを出す
    expect(result.findings).toEqual([]);
    expect(result.completedPoints).toEqual([]);
    expect(result.incompletePoints).toEqual(['INV-001']);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith('Investigator出力未生成: INV-001');
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('JSONパースに失敗'),
    );
  });

  it('TC-INV-008: toolCallCount と tokenUsage を累計する', async () => {
    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001'), createPoint('INV-002')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 各観点の agentMessages にツール呼び出しが含まれる
    // When: Investigator を実行する
    // Then: 集計値が結果へ反映される
    expect(result.toolCallCount).toBeGreaterThanOrEqual(4);
    expect(result.tokenUsage).toBeGreaterThan(0);
  });

  it('TC-INV-F03: 空ファイル時も未完了として記録し 1 行 WARN のみを出す', async () => {
    mockReadFileSync.mockReturnValue('   ');
    mockExecuteAgentForStage.mockResolvedValue([findingsJson('INV-001')]);

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 出力ファイルは存在するが空
    // When: Investigator を実行する
    // Then: 空ファイルも未生成と同様に扱う
    expect(result.findings).toEqual([]);
    expect(result.completedPoints).toEqual([]);
    expect(result.incompletePoints).toEqual(['INV-001']);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith('Investigator出力未生成: INV-001');
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('JSONパースに失敗'),
    );
  });

  it('TC-INV-MULTI01: 一部観点の出力未生成時も残り観点の処理を継続する', async () => {
    mockExistsSync.mockImplementation((filePath: string) => !filePath.includes('INV-002'));
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('INV-001')) {
        return findingsJson('INV-001');
      }
      if (filePath.includes('INV-003')) {
        return findingsJson('INV-003');
      }
      return '';
    });

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001'), createPoint('INV-002'), createPoint('INV-003')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 2件目の出力ファイルだけが未生成
    // When: Investigator を実行する
    // Then: 失敗観点だけ未完了とし残りの観点は完了する
    expect(result.findings).toHaveLength(2);
    expect(result.completedPoints).toEqual(['INV-001', 'INV-003']);
    expect(result.incompletePoints).toEqual(['INV-002']);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith('Investigator出力未生成: INV-002');
  });

  it('TC-INV-MAX01: executeAgentForStage に maxTurns 30 を渡す', async () => {
    await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: Investigator 実行時のエージェント呼び出し
    // When: 単一観点で Investigator を実行する
    // Then: maxTurns は 30 に固定される
    expect(mockExecuteAgentForStage).toHaveBeenCalledWith(
      {} as any,
      null,
      expect.stringContaining('OUTPUT:/tmp/logs/pr-123/investigator-INV-001.json'),
      { maxTurns: 30, preferLightweight: false },
    );
  });

  it('TC-INV-S01: SDK 生 JSON があってもファイル内容を優先する', async () => {
    mockExecuteAgentForStage.mockResolvedValue([
      '{"type":"system","subtype":"init"}',
      '{"type":"result","subtype":"success"}',
    ]);

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: agentMessages に SDK 生 JSON が含まれる
    // When: 出力ファイルが正常に存在する状態で Investigator を実行する
    // Then: ファイル由来の findings のみが返る
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].investigationPointId).toBe('INV-001');
    expect(result.findings[0].description).toBe('INV-001 の発見事項');
  });

  it('TC-INV-P01/D01: 観点ごとに異なる出力ファイルパスを使いディレクトリを作成する', async () => {
    await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001'), createPoint('INV-002')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 複数の調査観点
    // When: Investigator を実行する
    // Then: 各 prompt に一意な output path が入り、mkdirSync が呼ばれる
    expect(mockExecuteAgentForStage).toHaveBeenNthCalledWith(
      1,
      {} as any,
      null,
      expect.stringContaining('OUTPUT:/tmp/logs/pr-123/investigator-INV-001.json'),
      { maxTurns: 30, preferLightweight: false },
    );
    expect(mockExecuteAgentForStage).toHaveBeenNthCalledWith(
      2,
      {} as any,
      null,
      expect.stringContaining('OUTPUT:/tmp/logs/pr-123/investigator-INV-002.json'),
      { maxTurns: 30, preferLightweight: false },
    );
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/logs/pr-123', { recursive: true });
  });

  it('TC-INV-DEL01: 内部ヘルパーは公開エクスポートされていない', () => {
    // Given: Investigator モジュールの公開 API
    // When: エクスポート一覧を確認する
    // Then: 内部ヘルパーは公開されていない
    expect(investigatorModule).not.toHaveProperty('extractJsonBlock');
    expect(investigatorModule).not.toHaveProperty('buildInvestigatorPrompt');
    expect(investigatorModule).not.toHaveProperty('readInvestigatorOutput');
  });
});
