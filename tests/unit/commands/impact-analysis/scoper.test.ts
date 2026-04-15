/**
 * ユニットテスト: impact-analysis Scoperステージ
 *
 * テスト対象: src/commands/impact-analysis/scoper.ts
 * テストシナリオ: test-scenario.md の TC-SCOPER-001 〜 TC-SCOPER-007
 */

import { jest } from '@jest/globals';
import type { PipelineContext } from '../../../../src/commands/impact-analysis/types.js';
import { createInitialGuardrailsState, createDefaultGuardrailsConfig } from '../../../../src/commands/impact-analysis/guardrails.js';

const mockLoadPrompt = jest.fn();

await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

const { executeScoper } = await import('../../../../src/commands/impact-analysis/scoper.js');

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
      diff: 'diff --git a/db/migrations/20240101_add_column.sql b/db/migrations/20240101_add_column.sql',
      truncated: false,
      filesChanged: 2,
    },
    playbook: '## パターン名: マイグレーション波及',
    guardrails: createDefaultGuardrailsConfig(),
    guardrailsState: createInitialGuardrailsState(),
    logDir: '/tmp/logs',
  };
}

describe('Scoper', () => {
  beforeEach(() => {
    mockLoadPrompt.mockReset();
    mockLoadPrompt.mockReturnValue('DIFF:{diff}\nPLAYBOOK:{playbook}\nCUSTOM:{custom_instruction}');
  });

  it('TC-SCOPER-001: マイグレーションdiffでパターンマッチが生成される', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        '```json\n' +
          JSON.stringify({
            investigationPoints: [
              {
                id: 'INV-001',
                patternName: 'マイグレーション波及',
                description: 'users テーブル変更の影響',
                targetFiles: ['db/migrations/20240101_add_column.sql'],
                searchKeywords: ['users'],
                instructions: 'rg users',
              },
            ],
            matchedPatterns: ['マイグレーション波及'],
            skippedPatterns: [],
            reasoning: 'ok',
          }) +
          '\n```',
      ]),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    expect(result.investigationPoints.length).toBeGreaterThanOrEqual(1);
    expect(result.matchedPatterns).toContain('マイグレーション波及');
    expect(result.investigationPoints[0].patternName).toBe('マイグレーション波及');
    expect(result.investigationPoints[0].id).toMatch(/^INV-/);
  });

  it('TC-SCOPER-002: 複数パターンの結果が処理される', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          investigationPoints: [
            { id: 'INV-001', patternName: 'マイグレーション波及', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
            { id: 'INV-002', patternName: '依存パッケージ更新', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
          ],
          matchedPatterns: ['マイグレーション波及', '依存パッケージ更新'],
          skippedPatterns: [],
        }),
      ]),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    expect(result.investigationPoints.length).toBeGreaterThanOrEqual(2);
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-SCOPER-003: パターン未マッチでもエラーにならない', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          investigationPoints: [],
          matchedPatterns: [],
          skippedPatterns: ['マイグレーション波及'],
          reasoning: 'no match',
        }),
      ]),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    expect(result.investigationPoints).toEqual([]);
    expect(result.skippedPatterns).toContain('マイグレーション波及');
  });

  it('TC-SCOPER-004: custom-instructionが追加される', async () => {
    const context = createContext('table_aとtable_bは新旧テーブル');
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          investigationPoints: [
            { id: 'INV-001', patternName: 'マイグレーション波及', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
          ],
          matchedPatterns: ['マイグレーション波及'],
          skippedPatterns: [],
        }),
      ]),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    const lastPoint = result.investigationPoints[result.investigationPoints.length - 1];
    expect(lastPoint.patternName).toBe('custom-instruction');
    expect(lastPoint.instructions).toContain('table_aとtable_b');
  });

  it('TC-SCOPER-005: custom-instruction未指定の場合は追加されない', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          investigationPoints: [
            { id: 'INV-001', patternName: 'マイグレーション波及', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
          ],
          matchedPatterns: ['マイグレーション波及'],
          skippedPatterns: [],
        }),
      ]),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    expect(result.investigationPoints.some((p) => p.id === 'INV-CUSTOM')).toBe(false);
  });

  it('TC-SCOPER-006: エージェントエラーは上位に伝播する', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockRejectedValue(new Error('Agent timeout')),
    } as any;

    await expect(executeScoper(context, codexClient, null)).rejects.toThrow('Agent timeout');
  });

  it('TC-SCOPER-007: ガードレール状態が更新される', async () => {
    const context = createContext();
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(['rg src/ foo']),
    } as any;

    const result = await executeScoper(context, codexClient, null);
    expect(result).toBeDefined();
    expect(context.guardrailsState.tokenUsage).toBeGreaterThan(0);
  });
});
