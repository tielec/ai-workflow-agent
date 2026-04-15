/**
 * ユニットテスト: impact-analysis Investigatorステージ
 *
 * テスト対象: src/commands/impact-analysis/investigator.ts
 * テストシナリオ: test-scenario.md の TC-INV-001 〜 TC-INV-008
 */

import { jest } from '@jest/globals';
import type { PipelineContext, ScopeResult } from '../../../../src/commands/impact-analysis/types.js';
import { createDefaultGuardrailsConfig, createInitialGuardrailsState } from '../../../../src/commands/impact-analysis/guardrails.js';

const mockLoadPrompt = jest.fn();

await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

const { executeInvestigator } = await import('../../../../src/commands/impact-analysis/investigator.js');

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
      diff: 'diff --git a/db/migrations/001.sql b/db/migrations/001.sql',
      truncated: false,
      filesChanged: 1,
    },
    playbook: 'playbook',
    guardrails: createDefaultGuardrailsConfig(),
    guardrailsState: createInitialGuardrailsState(),
    logDir: '/tmp/logs',
  };
}

function createScopeResult(points: ScopeResult['investigationPoints']): ScopeResult {
  return {
    investigationPoints: points,
    matchedPatterns: points.map((p) => p.patternName),
    skippedPatterns: [],
    reasoning: 'ok',
  };
}

describe('Investigator', () => {
  beforeEach(() => {
    mockLoadPrompt.mockReset();
    mockLoadPrompt.mockReturnValue('DIFF:{diff}\nPOINT:{investigation_point}');
  });

  it('TC-INV-001: 単一観点で証拠を発見する', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      {
        id: 'INV-001',
        patternName: 'マイグレーション波及',
        description: 'users テーブルへの影響',
        targetFiles: ['db/migrations/001.sql'],
        searchKeywords: ['users', 'email'],
        instructions: 'rg users',
      },
    ]);

    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          findings: [
            {
              investigationPointId: 'INV-001',
              patternName: 'マイグレーション波及',
              description: 'users テーブル参照が残存',
              evidence: [{
                type: 'code_reference',
                filePath: 'src/services/UserService.ts',
                lineNumber: 42,
                content: 'SELECT email FROM users',
              }],
              severity: 'warning',
            },
          ],
        }),
      ]),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.completedPoints).toContain('INV-001');
    expect(result.incompletePoints).toEqual([]);
    expect(result.guardrailsReached).toBe(false);
  });

  it('TC-INV-002: 複数観点を順次処理する', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-002', patternName: 'B', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-003', patternName: 'C', description: 'c', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const codexClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })]),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.completedPoints.length).toBe(3);
    expect(codexClient.executeTask).toHaveBeenCalledTimes(3);
  });

  it('TC-INV-003: ガードレール到達で調査中断', async () => {
    const context = createContext();
    context.guardrails.maxToolCalls = 1;

    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-002', patternName: 'B', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const codexClient = {
      executeTask: jest.fn().mockResolvedValue(['rg src/ foo']),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.guardrailsReached).toBe(true);
    expect(result.incompletePoints.length).toBeGreaterThanOrEqual(1);
    expect(result.completedPoints.length).toBeLessThan(scopeResult.investigationPoints.length);
  });

  it('TC-INV-004: Evidenceにファイルパスと行番号を含む', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([
        JSON.stringify({
          findings: [
            {
              investigationPointId: 'INV-001',
              patternName: 'A',
              description: 'desc',
              evidence: [{
                type: 'code_reference',
                filePath: 'src/services/UserService.ts',
                lineNumber: 10,
                content: 'SELECT * FROM users',
              }],
              severity: 'info',
            },
          ],
        }),
      ]),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    const evidence = result.findings[0].evidence[0];
    expect(evidence.filePath).toBeTruthy();
    expect(evidence.lineNumber).toBeDefined();
  });

  it('TC-INV-005: 個別観点のエラーでも継続する', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-002', patternName: 'B', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-003', patternName: 'C', description: 'c', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const codexClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockRejectedValueOnce(new Error('Agent error'))
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })]),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.completedPoints).toEqual(['INV-001', 'INV-003']);
    expect(result.incompletePoints).toEqual(['INV-002']);
  });

  it('TC-INV-006: 調査観点が0件の場合は空結果', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([]);

    const codexClient = {
      executeTask: jest.fn(),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.findings).toEqual([]);
    expect(result.completedPoints).toEqual([]);
    expect(result.guardrailsReached).toBe(false);
  });

  it('TC-INV-007: フォールバックエージェントが使用される', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const claudeClient = {
      executeTask: jest.fn().mockRejectedValue(new Error('Primary failed')),
    } as any;
    const codexClient = {
      executeTask: jest.fn().mockResolvedValue([JSON.stringify({ findings: [] })]),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, claudeClient, Date.now());
    expect(result.completedPoints).toContain('INV-001');
    expect(codexClient.executeTask).toHaveBeenCalled();
  });

  it('TC-INV-008: toolCallCountとtokenUsageが累計される', async () => {
    const context = createContext();
    const scopeResult = createScopeResult([
      { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
      { id: 'INV-002', patternName: 'B', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
    ]);

    const codexClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce(['rg src/ foo'])
        .mockResolvedValueOnce(['grep -n bar']),
    } as any;

    const result = await executeInvestigator(context, scopeResult, codexClient, null, Date.now());
    expect(result.toolCallCount).toBeGreaterThanOrEqual(2);
    expect(result.tokenUsage).toBeGreaterThan(0);
  });
});
