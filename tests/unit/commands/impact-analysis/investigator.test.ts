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

  it('TC-INV-NEW-01: impact と recommendedActions を正しく正規化する', async () => {
    mockReadFileSync.mockReturnValue(
      findingsJson('INV-001', {
        impact: 'モデル別コスト集計が欠落する',
        recommendedActions: ['再保存条件を追加する', 'フォールバックを追加する'],
      }),
    );

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 新フィールドを含む findings JSON
    // When: Investigator を実行する
    // Then: 新旧フィールドが意図どおり正規化される
    expect(result.findings[0]).toMatchObject({
      investigationPointId: 'INV-001',
      patternName: 'DBスキーマ変更',
      description: 'INV-001 の発見事項',
      impact: 'モデル別コスト集計が欠落する',
      recommendedActions: ['再保存条件を追加する', 'フォールバックを追加する'],
      severity: 'warning',
    });
    expect(result.findings[0].evidence).toHaveLength(1);
  });

  it('TC-INV-NEW-02: 新フィールド未指定時は undefined にフォールバックする', async () => {
    mockReadFileSync.mockReturnValue(findingsJson('INV-001'));

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: impact / recommendedActions を含まない旧形式 JSON
    // When: Investigator を実行する
    // Then: 後方互換のため undefined へ正規化される
    expect(result.findings[0].impact).toBeUndefined();
    expect(result.findings[0].recommendedActions).toBeUndefined();
    expect(result.findings[0]).toMatchObject({
      investigationPointId: 'INV-001',
      severity: 'warning',
    });
  });

  it('TC-INV-NEW-03: 新フィールドが不正型なら undefined に正規化する', async () => {
    mockReadFileSync.mockReturnValue(
      findingsJson('INV-001', {
        impact: 123,
        recommendedActions: '単一の文字列',
      }),
    );

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 新フィールドが不正な型で出力される
    // When: Investigator を実行する
    // Then: 既存フィールドを保ったまま不正値だけを落とす
    expect(result.findings[0].impact).toBeUndefined();
    expect(result.findings[0].recommendedActions).toBeUndefined();
    expect(result.findings[0]).toMatchObject({
      investigationPointId: 'INV-001',
      patternName: 'DBスキーマ変更',
      severity: 'warning',
    });
  });

  it('TC-INV-NEW-04: 新フィールド追加後も既存フィールドのフォールバックは不変', async () => {
    mockReadFileSync.mockReturnValue(
      findingsJson('INV-001', {
        investigationPointId: '',
        evidence: 'not-an-array',
        severity: 'critical',
        impact: '影響の記述',
        recommendedActions: ['アクション1'],
      }),
    );

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 既存フィールドに欠損や不正値がある JSON
    // When: Investigator を実行する
    // Then: 従来のフォールバック動作は維持される
    expect(result.findings[0]).toMatchObject({
      investigationPointId: 'INV-001',
      severity: 'info',
      impact: '影響の記述',
      recommendedActions: ['アクション1'],
    });
    expect(result.findings[0].evidence).toEqual([]);
  });

  it('TC-INV-NEW-05: recommendedActions が空配列でも保持する', async () => {
    mockReadFileSync.mockReturnValue(
      findingsJson('INV-001', {
        impact: '',
        recommendedActions: [],
      }),
    );

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: impact が空文字で recommendedActions が空配列
    // When: Investigator を実行する
    // Then: 型が正しければ空値でもそのまま保持する
    expect(result.findings[0].impact).toBe('');
    expect(result.findings[0].recommendedActions).toEqual([]);
  });

  it('TC-INV-NEW-06: null の新フィールドは undefined に正規化する', async () => {
    mockReadFileSync.mockReturnValue(
      findingsJson('INV-001', {
        impact: null,
        recommendedActions: null,
      }),
    );

    const result = await executeInvestigator(
      createContext(),
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 新フィールドに null が含まれる
    // When: Investigator を実行する
    // Then: null は未指定と同様に undefined へ正規化される
    expect(result.findings[0].impact).toBeUndefined();
    expect(result.findings[0].recommendedActions).toBeUndefined();
  });

  it('TC-INV-SCALE01: 観点別上限超過時に logger.warn が呼ばれる', async () => {
    const context = createContext();
    context.guardrails.maxToolCallsPerPoint = 1;
    mockExecuteAgentForStage.mockResolvedValue(['rg src/a foo', 'grep bar baz']);

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    expect(result.completedPoints).toEqual(['INV-001']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '観点 INV-001 で観点別ツール呼び出し上限到達: 2/1回',
    );
  });

  it('TC-INV-SCALE02: maxToolCallsPerPoint 未設定時は観点別警告を出さない', async () => {
    const context = createContext();
    context.guardrails.maxToolCallsPerPoint = undefined;
    mockExecuteAgentForStage.mockResolvedValue(['rg src/a foo', 'grep bar baz']);

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    expect(result.completedPoints).toEqual(['INV-001']);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('TC-INV-SCALE03: 全体上限到達時は残り観点がスキップされる', async () => {
    const context = createContext();
    context.guardrails.maxToolCalls = 1;

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001'), createPoint('INV-002')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 1件目で全体ツール呼び出し上限に到達する
    // When: 複数観点で Investigator を実行する
    // Then: 後続観点はスキップされ未完了として記録される
    expect(result.guardrailsReached).toBe(true);
    expect(result.completedPoints).toEqual(['INV-001']);
    expect(result.incompletePoints).toEqual(['INV-002']);
  });

  it('TC-INV-SCALE04: 出力未生成パスでも観点別上限超過のログが出力される', async () => {
    const context = createContext();
    context.guardrails.maxToolCallsPerPoint = 1;
    mockExistsSync.mockReturnValue(false);
    mockExecuteAgentForStage.mockResolvedValue(['rg src/a foo', 'grep bar baz']);

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 出力ファイルが未生成で観点別上限だけを超過する
    // When: Investigator を実行する
    // Then: 未完了扱いと観点別上限警告の両方が残る
    expect(result.incompletePoints).toEqual(['INV-001']);
    expect(mockLoggerWarn).toHaveBeenCalledWith('Investigator出力未生成: INV-001');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '観点 INV-001 で観点別ツール呼び出し上限到達: 2/1回',
    );
  });

  it('TC-INV-SCALE05: 観点別上限以内の場合は警告ログが出力されない', async () => {
    const context = createContext();
    context.guardrails.maxToolCallsPerPoint = 100;
    mockExecuteAgentForStage.mockResolvedValue(['rg src/a foo', 'grep bar baz']);

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 観点別上限に十分な余裕がある
    // When: Investigator を実行する
    // Then: 観点は完了し上限超過警告は出ない
    expect(result.completedPoints).toEqual(['INV-001']);
    const warnCalls = mockLoggerWarn.mock.calls.map((call: unknown[]) => call[0]);
    const perPointWarns = warnCalls.filter(
      (message): message is string =>
        typeof message === 'string' && message.includes('観点別ツール呼び出し上限到達'),
    );
    expect(perPointWarns).toHaveLength(0);
  });

  it('TC-INV-SCALE06: 複数観点で各観点の上限超過が個別にチェックされる', async () => {
    const context = createContext();
    context.guardrails.maxToolCallsPerPoint = 1;
    context.guardrails.maxToolCalls = 200;
    mockExecuteAgentForStage.mockResolvedValue(['rg src/a foo', 'grep bar baz']);

    const result = await executeInvestigator(
      context,
      createScopeResult([createPoint('INV-001'), createPoint('INV-002')]),
      {} as any,
      null,
      Date.now(),
    );

    // Given: 複数観点がそれぞれ観点別上限を超過する
    // When: Investigator を実行する
    // Then: 各観点ごとに独立して警告が記録される
    expect(result.completedPoints).toEqual(['INV-001', 'INV-002']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '観点 INV-001 で観点別ツール呼び出し上限到達: 2/1回',
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '観点 INV-002 で観点別ツール呼び出し上限到達: 2/1回',
    );
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
