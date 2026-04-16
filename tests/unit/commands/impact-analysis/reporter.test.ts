/**
 * ユニットテスト: impact-analysis Reporterステージ
 *
 * テスト対象: src/commands/impact-analysis/reporter.ts
 * テストシナリオ: test-scenario.md の Reporter 関連ケース一式
 */

import { jest } from '@jest/globals';
import type {
  InvestigationResult,
  PipelineContext,
} from '../../../../src/commands/impact-analysis/types.js';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockLoadPrompt = jest.fn();
const mockExecuteAgentForStage = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();

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
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const reporterModule = await import('../../../../src/commands/impact-analysis/reporter.js');
const { executeReporter } = reporterModule;

function createContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
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
      diff: 'diff content',
      truncated: false,
      filesChanged: 1,
    },
    playbook: 'playbook',
    guardrails: { maxTokens: 100000, timeoutSeconds: 300, maxToolCalls: 30 },
    guardrailsState: { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 0, reached: false },
    logDir: '/tmp/logs',
    ...overrides,
  };
}

const baseResult: InvestigationResult = {
  findings: [],
  completedPoints: [],
  incompletePoints: [],
  guardrailsReached: false,
  reasoning: 'ok',
  toolCallCount: 0,
  tokenUsage: 0,
};

const templateWithOutputPath = `# Reporter
DIFF:{diff}
FINDINGS:{findings}
GUARDRAILS:{guardrails_reached}
DETAILS:{guardrails_details}
COMPLETED:{completed_points}
INCOMPLETE:{incomplete_points}
OUTPUT:{output_file_path}`;

const sampleReportJa = `# 影響範囲調査レポート

## サマリー
- 発見事項: 1件

## 免責
判断は開発者が行ってください。`;

const sampleReportEn = `# Impact Analysis Report

## Summary
- Findings: 1

## Disclaimer
Decision-making is left to the developer.`;

function createFinding(patternName: string, investigationPointId = `INV-${patternName}`) {
  return {
    investigationPointId,
    patternName,
    description: `${patternName} の検出`,
    evidence: [],
    severity: 'warning' as const,
  };
}

describe('Reporter', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockLoadPrompt.mockReset();
    mockExecuteAgentForStage.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerWarn.mockReset();

    mockLoadPrompt.mockReturnValue(templateWithOutputPath);
    mockExecuteAgentForStage.mockResolvedValue(['fallback markdown']);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(sampleReportJa);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-RPT-001: 発見事項ありのレポートを出力ファイルから読み込む', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      findings: [
        {
          investigationPointId: 'INV-001',
          patternName: 'マイグレーション波及',
          description: 'users テーブルの email 参照',
          evidence: [
            {
              type: 'code_reference',
              filePath: 'src/services/UserService.ts',
              lineNumber: 42,
              content: 'SELECT email FROM users',
            },
          ],
          severity: 'warning',
        },
      ],
      completedPoints: ['INV-001'],
    };

    const report = await executeReporter(context, investigationResult, null, null);

    // Given: レポートファイルが存在する
    // When: Reporter を実行する
    // Then: ファイル内容が ImpactReport に反映される
    expect(report.markdown).toBe(sampleReportJa);
    expect(report.findingsCount).toBe(1);
    expect(report.patternsMatched).toEqual(['マイグレーション波及']);
    expect(report.guardrailsReached).toBe(false);
    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/logs/report.md', 'utf-8');
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      'Reporter出力ファイルを読み込みました: /tmp/logs/report.md',
    );
  });

  it('TC-RPT-002: 発見事項なしでもレポートを返す', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue(`# 影響範囲調査レポート

## サマリー
- 発見事項: 0件

## 免責
判断は開発者が行ってください。`);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 発見事項が空
    // When: Reporter を実行する
    // Then: findingsCount は 0 のままレポートが返る
    expect(report.findingsCount).toBe(0);
    expect(report.patternsMatched).toEqual([]);
    expect(report.markdown).toContain('発見事項: 0件');
  });

  it('TC-RPT-003: ガードレール到達時の結果を保持する', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      guardrailsReached: true,
      guardrailDetails: 'ツール呼び出し上限到達: 30/30回',
      incompletePoints: ['INV-003'],
    };

    const report = await executeReporter(context, investigationResult, null, null);

    // Given: ガードレール到達済み
    // When: Reporter を実行する
    // Then: guardrailsReached がそのまま返る
    expect(report.guardrailsReached).toBe(true);
  });

  it('TC-RPT-004: 注意書きが含まれる日本語レポートを受け入れる', async () => {
    const context = createContext();

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 日本語の注意書きが含まれる
    // When: Reporter を実行する
    // Then: 警告なくレポートを返す
    expect(report.markdown).toContain('判断は開発者が行ってください');
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('TC-RPT-005/006: 具体性と透明性の文言が含まれる', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue(`## 根拠
ファイル: src/services/UserService.ts
パターン: マイグレーション波及
判断は開発者が行ってください`);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: ファイルパスとパターン名を含むレポート
    // When: Reporter を実行する
    // Then: 具体的な根拠情報が Markdown に残る
    expect(report.markdown).toContain('src/services/UserService.ts');
    expect(report.markdown).toContain('マイグレーション波及');
  });

  it('TC-RPT-007: 判定的表現を含まない事実ベースのレポートを受け入れる', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue(`## 事実
影響範囲を確認した結果を列挙します。
判断は開発者が行ってください`);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 判定的表現を含まない事実ベースのレポート
    // When: Reporter を実行する
    // Then: 断定表現を含めずにレポートを返す
    expect(report.markdown).toContain('影響範囲を確認した結果を列挙します。');
    expect(report.markdown).not.toContain('危険です');
  });

  it('TC-RPT-P02: プロンプトの全プレースホルダーを置換する', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      guardrailsReached: true,
      guardrailDetails: 'timeout',
      findings: [
        {
          investigationPointId: 'INV-002',
          patternName: 'マイグレーション波及',
          description: 'users テーブルの email 参照',
          evidence: [],
          severity: 'warning',
        },
      ],
      completedPoints: ['INV-001'],
      incompletePoints: ['INV-002'],
    };

    await executeReporter(context, investigationResult, null, null);

    const prompt = mockExecuteAgentForStage.mock.calls[0][2] as string;

    // Given: Reporter プロンプトテンプレート
    // When: executeReporter が内部でプロンプトを構築する
    // Then: すべてのプレースホルダーが具体値へ置換される
    expect(prompt).toContain('OUTPUT:/tmp/logs/report.md');
    expect(prompt).toContain('DIFF:diff content');
    expect(prompt).toContain('"patternName": "マイグレーション波及"');
    expect(prompt).toContain('GUARDRAILS:true');
    expect(prompt).toContain('DETAILS:timeout');
    expect(prompt).toContain('COMPLETED:INV-001');
    expect(prompt).toContain('INCOMPLETE:INV-002');
    expect(prompt).not.toContain('{diff}');
    expect(prompt).not.toContain('{findings}');
    expect(prompt).not.toContain('{guardrails_reached}');
    expect(prompt).not.toContain('{guardrails_details}');
    expect(prompt).not.toContain('{completed_points}');
    expect(prompt).not.toContain('{incomplete_points}');
    expect(prompt).not.toContain('{output_file_path}');
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true });
  });

  it('TC-RPT-P01: プロンプトに出力ファイルパスが含まれる', async () => {
    const context = createContext();

    await executeReporter(context, baseResult, null, null);

    const prompt = mockExecuteAgentForStage.mock.calls[0][2] as string;

    // Given: output_file_path プレースホルダーを含むテンプレート
    // When: Reporter がプロンプトを構築する
    // Then: 出力ファイルパスが埋め込まれ、リテラルは残らない
    expect(prompt).toContain('/tmp/logs/report.md');
    expect(prompt).not.toContain('{output_file_path}');
  });

  it('TC-RPT-P03: PromptLoader をコンテキストの言語で呼び出す', async () => {
    const contextJa = createContext();
    const contextEn = createContext({
      options: {
        ...createContext().options,
        language: 'en',
      },
    });
    mockReadFileSync.mockReturnValue(sampleReportEn);

    // Given: 日本語と英語の両コンテキスト
    // When: Reporter をそれぞれ実行する
    // Then: PromptLoader が各言語引数で呼ばれる
    await executeReporter(contextJa, baseResult, null, null);
    await executeReporter(contextEn, baseResult, null, null);

    expect(mockLoadPrompt).toHaveBeenNthCalledWith(1, 'impact-analysis', 'reporter', 'ja');
    expect(mockLoadPrompt).toHaveBeenNthCalledWith(2, 'impact-analysis', 'reporter', 'en');
  });

  it('TC-RPT-F02: 出力ファイルがない場合はエージェント出力へフォールバックする', async () => {
    const context = createContext();
    mockExistsSync.mockReturnValue(false);
    mockExecuteAgentForStage.mockResolvedValue([
      '# フォールバックレポート',
      '',
      '判断は開発者が行ってください',
    ]);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: レポートファイルが生成されない
    // When: Reporter を実行する
    // Then: エージェント出力テキストからレポートを返す
    expect(report.markdown).toBe('# フォールバックレポート\n\n判断は開発者が行ってください');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '出力ファイルが見つかりません。エージェント出力テキストからレポートを抽出します: /tmp/logs/report.md',
    );
  });

  it('TC-RPT-F03: 空ファイル時にエージェント出力からフォールバックする', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue('   \n  ');
    mockExecuteAgentForStage.mockResolvedValue(['# フォールバック内容', '判断は開発者が行ってください']);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 出力ファイルは存在するが内容が空白のみ
    // When: Reporter を実行する
    // Then: 警告を出しつつエージェント出力へフォールバックする
    expect(report.markdown).toBe('# フォールバック内容\n判断は開発者が行ってください');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'レポートファイルが空です。エージェント出力テキストからフォールバックします: /tmp/logs/report.md',
    );
  });

  it('TC-RPT-F05: 複数エージェントメッセージが結合されてフォールバックする', async () => {
    const context = createContext();
    mockExistsSync.mockReturnValue(false);
    mockExecuteAgentForStage.mockResolvedValue([
      'メッセージ1',
      'メッセージ2\n判断は開発者が行ってください',
    ]);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: ファイル未生成でエージェント出力が複数メッセージ
    // When: Reporter を実行する
    // Then: メッセージが改行結合された Markdown を返す
    expect(report.markdown).toContain('メッセージ1\nメッセージ2');
    expect(report.markdown).toContain('判断は開発者が行ってください');
  });

  it('TC-RPT-008: エージェントエラーは上位に伝播する', async () => {
    const context = createContext();
    mockExecuteAgentForStage.mockRejectedValue(new Error('Reporter agent failed'));

    // Given: エージェント実行が失敗する
    // When: Reporter を実行する
    // Then: 例外は握り潰されず上位へ伝播する
    await expect(executeReporter(context, baseResult, null, null)).rejects.toThrow(
      'Reporter agent failed',
    );
  });

  it('TC-RPT-F04: フォールバック出力も空ならエラーになる', async () => {
    const context = createContext();
    mockExistsSync.mockReturnValue(false);
    mockExecuteAgentForStage.mockResolvedValue([' ', '  ']);

    // Given: ファイルもフォールバックも空
    // When: Reporter を実行する
    // Then: 空出力エラーを送出する
    await expect(executeReporter(context, baseResult, null, null)).rejects.toThrow(
      '空の出力',
    );
  });

  it('TC-RPT-V04: 空文字列相当の Markdown はエラーになる', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue('   ');
    mockExecuteAgentForStage.mockResolvedValue([' ', '  ']);

    // Given: trim 後に空文字列になる出力ファイル
    // When: Reporter を実行する
    // Then: ファイル空警告後に空出力エラーを送出する
    await expect(executeReporter(context, baseResult, null, null)).rejects.toThrow('空の出力');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'レポートファイルが空です。エージェント出力テキストからフォールバックします: /tmp/logs/report.md',
    );
  });

  it('TC-RPT-V01: 英語レポートでは英語の注意書きを検証する', async () => {
    const context = createContext({
      options: {
        ...createContext().options,
        language: 'en',
      },
    });
    mockReadFileSync.mockReturnValue(sampleReportEn);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 英語モード
    // When: 英語の免責付きレポートを読む
    // Then: 不要な警告を出さない
    expect(report.markdown).toContain('Decision-making is left to the developer.');
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('TC-RPT-V03: 日本語の注意書きがあれば英語モードでも警告しない', async () => {
    const context = createContext({
      options: {
        ...createContext().options,
        language: 'en',
      },
    });
    mockReadFileSync.mockReturnValue('# Report\n\n判断は開発者が行ってください');

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 英語モードだが出力は日本語の注意書きを含む
    // When: Reporter を実行する
    // Then: 言語不一致でも注意書きが存在すれば警告しない
    expect(report.markdown).toContain('判断は開発者が行ってください');
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('TC-RPT-V02: 注意書きがない場合は警告のみを出す', async () => {
    const context = createContext();
    mockReadFileSync.mockReturnValue('# 影響範囲調査レポート\n\n注意書きなし');

    const report = await executeReporter(context, baseResult, null, null);

    // Given: 注意書きが欠けている
    // When: Reporter を実行する
    // Then: エラーにはせず警告のみ記録する
    expect(report.markdown).toContain('注意書きなし');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'レポートに注意書きが含まれていません: 判断は開発者が行ってください',
    );
  });

  it('TC-RPT-D01: 出力ファイルパスが正しく生成される', async () => {
    const context = createContext({ logDir: '/tmp/custom-logs' });

    await executeReporter(context, baseResult, null, null);

    // Given: 任意の logDir
    // When: Reporter を実行する
    // Then: report.md が連結されたパスで読み込みを試みる
    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/custom-logs/report.md', 'utf-8');
  });

  it('TC-RPT-D02: 出力先ディレクトリが事前に作成される', async () => {
    const context = createContext({ logDir: '/tmp/custom-logs' });

    await executeReporter(context, baseResult, null, null);

    // Given: 出力先ディレクトリが未作成でもよい状態
    // When: Reporter を実行する
    // Then: report.md の親ディレクトリを recursive で作成する
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/custom-logs', { recursive: true });
  });

  it('TC-RPT-A01: executeAgentForStage が正しいオプションで呼ばれる', async () => {
    const context = createContext();

    await executeReporter(context, baseResult, null, null);

    // Given: 通常の Reporter 実行
    // When: エージェント実行関数が呼ばれる
    // Then: maxTurns と preferLightweight のオプションが固定される
    expect(mockExecuteAgentForStage).toHaveBeenCalledWith(
      null,
      null,
      expect.any(String),
      { maxTurns: 3, preferLightweight: true },
    );
  });

  it('TC-RPT-C01: ImpactReport の構造が従来と同一である', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      findings: [createFinding('パターンA', 'INV-001'), createFinding('パターンB', 'INV-002')],
    };

    const report = await executeReporter(context, investigationResult, null, null);

    // Given: 複数パターンの発見事項を持つ調査結果
    // When: Reporter を実行する
    // Then: ImpactReport の主要4フィールドが互換な形で返る
    expect(report).toEqual({
      markdown: sampleReportJa,
      findingsCount: 2,
      patternsMatched: ['パターンA', 'パターンB'],
      guardrailsReached: false,
    });
  });

  it('TC-RPT-C02: patternsMatched の重複が排除される', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      findings: [
        createFinding('パターンA', 'INV-001'),
        createFinding('パターンA', 'INV-002'),
        createFinding('パターンB', 'INV-003'),
      ],
    };

    const report = await executeReporter(context, investigationResult, null, null);

    // Given: 同一 patternName を含む複数の発見事項
    // When: Reporter を実行する
    // Then: patternsMatched は一意なパターン名だけを返す
    expect(report.patternsMatched).toEqual(['パターンA', 'パターンB']);
  });

  it('TC-RPT-S01: ファイル読み込み方式により SDK 生 JSON がレポートに混入しない', async () => {
    const context = createContext();
    mockExecuteAgentForStage.mockResolvedValue([
      '{"type":"system","subtype":"init"}',
      '{"type":"result","result":"..."}',
    ]);

    const report = await executeReporter(context, baseResult, null, null);

    // Given: エージェント出力に SDK の生 JSON が含まれる
    // When: 出力ファイルが正常に読み込まれる
    // Then: レポートにはファイル由来の Markdown だけが残る
    expect(report.markdown).toBe(sampleReportJa);
    expect(report.markdown).not.toContain('"type":"system"');
    expect(report.markdown).not.toContain('"type":"result"');
  });

  it('TC-RPT-DEL01: 削除対象の内部ヘルパーは公開エクスポートされていない', () => {
    // Given: reporter モジュール
    // When: 公開エクスポート一覧を確認する
    // Then: 旧 JSON 抽出ヘルパーは露出していない
    expect(Object.keys(reporterModule)).toEqual(['executeReporter']);
    expect(reporterModule).not.toHaveProperty('extractReportMarkdown');
    expect(reporterModule).not.toHaveProperty('extractJsonBlock');
    expect(reporterModule).not.toHaveProperty('fillTemplate');
  });
});
