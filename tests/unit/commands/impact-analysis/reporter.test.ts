/**
 * ユニットテスト: impact-analysis Reporterステージ
 *
 * テスト対象: src/commands/impact-analysis/reporter.ts
 * テストシナリオ: test-scenario.md の TC-RPT-001 〜 TC-RPT-008
 */

import { jest } from '@jest/globals';
import type { PipelineContext, InvestigationResult } from '../../../../src/commands/impact-analysis/types.js';

const mockLoadPrompt = jest.fn();

await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

const { executeReporter } = await import('../../../../src/commands/impact-analysis/reporter.js');

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
      diff: 'diff',
      truncated: false,
      filesChanged: 1,
    },
    playbook: 'playbook',
    guardrails: { maxTokens: 100000, timeoutSeconds: 300, maxToolCalls: 30 },
    guardrailsState: { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 0, reached: false },
    logDir: '/tmp/logs',
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

describe('Reporter', () => {
  beforeEach(() => {
    mockLoadPrompt.mockReset();
    mockLoadPrompt.mockReturnValue('DIFF:{diff}\nFINDINGS:{findings}');
  });

  it('TC-RPT-001: 発見事項ありのレポート生成', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      findings: [
        {
          investigationPointId: 'INV-001',
          patternName: 'マイグレーション波及',
          description: 'users テーブルの email 参照',
          evidence: [{
            type: 'code_reference',
            filePath: 'src/services/UserService.ts',
            lineNumber: 42,
            content: 'SELECT email FROM users',
          }],
          severity: 'warning',
        },
      ],
      completedPoints: ['INV-001'],
    };

    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          markdown: '## 影響範囲調査\n- マイグレーション波及\n判断は開発者が行ってください',
        }),
      ]),
    } as any;

    const report = await executeReporter(context, investigationResult, codexClient, null);
    expect(report.markdown).toContain('影響範囲調査');
    expect(report.findingsCount).toBe(1);
    expect(report.patternsMatched).toContain('マイグレーション波及');
    expect(report.guardrailsReached).toBe(false);
  });

  it('TC-RPT-002: 発見事項なしのレポート生成', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        '該当する発見事項はありませんでした。\n判断は開発者が行ってください',
      ]),
    } as any;

    const report = await executeReporter(context, baseResult, codexClient, null);
    expect(report.findingsCount).toBe(0);
    expect(report.markdown).toContain('該当する発見事項はありませんでした');
  });

  it('TC-RPT-003: ガードレール到達時のレポート', async () => {
    const context = createContext();
    const investigationResult: InvestigationResult = {
      ...baseResult,
      guardrailsReached: true,
      guardrailDetails: 'ツール呼び出し上限到達: 30/30回',
      incompletePoints: ['INV-003'],
    };

    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        'ガードレール到達により調査途中で終了\n判断は開発者が行ってください',
      ]),
    } as any;

    const report = await executeReporter(context, investigationResult, codexClient, null);
    expect(report.guardrailsReached).toBe(true);
    expect(report.markdown).toContain('ガードレール');
  });

  it('TC-RPT-004: 注意書きが含まれる', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        '判断は開発者が行ってください',
      ]),
    } as any;

    const report = await executeReporter(context, baseResult, codexClient, null);
    expect(report.markdown).toContain('判断は開発者が行ってください');
  });

  it('TC-RPT-005/006: 具体性と透明性の文言が含まれる', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        'ファイル: src/services/UserService.ts\nパターン: マイグレーション波及\n判断は開発者が行ってください',
      ]),
    } as any;

    const report = await executeReporter(context, baseResult, codexClient, null);
    expect(report.markdown).toContain('src/services/UserService.ts');
    expect(report.markdown).toContain('マイグレーション波及');
  });

  it('TC-RPT-007: 判定的表現を含まない（注意書き除外）', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        '事実のみを記載します。\n判断は開発者が行ってください',
      ]),
    } as any;

    const report = await executeReporter(context, baseResult, codexClient, null);
    expect(report.markdown).not.toContain('危険です');
  });

  it('TC-RPT-008: エージェントエラーは上位に伝播する', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockRejectedValue(new Error('Reporter agent failed')),
    } as any;

    await expect(executeReporter(context, baseResult, codexClient, null)).rejects.toThrow('Reporter agent failed');
  });

  it('空のレポートはエラーになる', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(['  ']),
    } as any;

    await expect(executeReporter(context, baseResult, codexClient, null)).rejects.toThrow('空の出力');
  });
});
