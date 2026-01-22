/**
 * ユニットテスト: IssueInspector
 *
 * テスト対象: src/core/issue-inspector.ts
 * テストシナリオ: test-scenario.md の TC-INS-001 〜 TC-INS-019 を中心にカバー
 */

import fs from 'node:fs';
import os from 'node:os';
import { jest } from '@jest/globals';
import { IssueInspector } from '../../../src/core/issue-inspector.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import type { IssueInfo } from '../../../src/core/github/issue-client.js';
import type { InspectionResult } from '../../../src/types/auto-close-issue.js';
import { logger } from '../../../src/utils/logger.js';

describe('IssueInspector#getCandidates', () => {
  const listOpenIssues = jest.fn<() => Promise<IssueInfo[]>>();
  const getIssueInfo = jest.fn();
  const getIssueComments = jest.fn();
  const issueClient = {
    listOpenIssues,
    getIssueInfo,
    getIssueComments,
  } as any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-10-01T00:00:00Z'));
    listOpenIssues.mockReset();
    getIssueInfo.mockReset();
    getIssueComments.mockReset();
    getIssueComments.mockResolvedValue([]);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const createIssue = (overrides: Partial<IssueInfo>): IssueInfo => ({
    number: overrides.number ?? 1,
    title: overrides.title ?? '[FOLLOW-UP] default',
    body: overrides.body ?? '',
    state: overrides.state ?? 'open',
    labels: overrides.labels ?? [],
    url: overrides.url ?? 'https://example.com',
    created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2024-01-10T00:00:00Z',
  });

  /**
   * TC-INS-001: followupカテゴリ
   */
  it('FOLLOW-UP タイトルのみ取得する', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({ number: 1, title: '[FOLLOW-UP] #99 残タスク', updated_at: '2024-08-01' }),
      createIssue({ number: 2, title: '通常Issue', updated_at: '2024-07-01' }),
    ]);
    getIssueInfo.mockResolvedValue(
      createIssue({ number: 99, title: '親Issue', state: 'closed' }),
    );

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('followup', {
      daysThreshold: 90,
      excludeLabels: [],
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].parentIssue?.number).toBe(99);
  });

  /**
   * TC-INS-002: staleカテゴリ
   */
  it('stale カテゴリで更新が古いIssueのみ返す', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({ number: 1, title: '古い', updated_at: '2024-03-01' }),
      createIssue({ number: 2, title: '新しい', updated_at: '2024-09-25' }),
    ]);

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('stale', {
      daysThreshold: 90,
      excludeLabels: [],
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });

  /**
   * TC-INS-003: oldカテゴリ
   */
  it('old カテゴリで作成が古いIssueのみ返す', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({ number: 1, created_at: '2024-01-01', updated_at: '2024-09-01' }),
      createIssue({ number: 2, created_at: '2024-06-01', updated_at: '2024-07-01' }),
    ]);

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('old', {
      daysThreshold: 90,
      excludeLabels: [],
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });

  /**
   * TC-INS-004: allカテゴリ
   */
  it('all カテゴリではオープンIssueをそのまま返す', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({ number: 1, title: '通常Issue', updated_at: '2024-08-01' }),
      createIssue({ number: 2, title: '[FOLLOW-UP] 追加テスト', updated_at: '2024-09-01' }),
    ]);

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('all', {
      daysThreshold: 90,
      excludeLabels: [],
      limit: 10,
    });

    const numbers = result.map((item) => item.number);
    expect(numbers).toEqual([1, 2]);
  });

  /**
   * TC-INS-005/006/007: 除外ラベル、最近更新、limit
   */
  it('除外ラベル・最近更新・limitを考慮する', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({
        number: 1,
        title: '[FOLLOW-UP] 古い',
        labels: ['do-not-close'],
        updated_at: '2024-06-01',
      }),
      createIssue({
        number: 2,
        title: '[FOLLOW-UP] 最近更新',
        updated_at: '2024-09-28',
      }),
      createIssue({
        number: 3,
        title: '[FOLLOW-UP] 対象1',
        updated_at: '2024-06-01',
      }),
      createIssue({
        number: 4,
        title: '[FOLLOW-UP] 対象2',
        updated_at: '2024-06-01',
      }),
    ]);

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('followup', {
      daysThreshold: 90,
      excludeLabels: ['do-not-close', 'pinned'],
      limit: 2,
    });

    const numbers = result.map((item) => item.number);
    expect(numbers).toEqual([3, 4]);
  });

  /**
   * TC-INS-005: allカテゴリでも除外ラベルを尊重する
   */
  it('all カテゴリで除外ラベルを除去する', async () => {
    listOpenIssues.mockResolvedValue([
      createIssue({
        number: 10,
        title: '通常IssueA',
        labels: ['do-not-close'],
        updated_at: '2024-06-01',
      }),
      createIssue({
        number: 11,
        title: '通常IssueB',
        labels: ['pinned'],
        updated_at: '2024-06-01',
      }),
      createIssue({
        number: 12,
        title: '通常IssueC',
        labels: [],
        updated_at: '2024-06-01',
      }),
    ]);

    const inspector = new IssueInspector(null, null, issueClient);
    const result = await inspector.getCandidates('all', {
      daysThreshold: 90,
      excludeLabels: ['do-not-close', 'pinned'],
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(12);
  });
});

describe('IssueInspector#inspect', () => {
  const listOpenIssues = jest.fn();
  const issueClient = {
    listOpenIssues,
    getIssueInfo: jest.fn(),
    getIssueComments: jest.fn().mockResolvedValue([]),
  } as any;
  const writeFromPrompt = (prompt: string, payload: any) => {
    const match = prompt.match(/OUTPUT:(.+)$/m);
    const filePath = match?.[1].trim();
    if (!filePath) {
      throw new Error('output path not found in prompt');
    }
    fs.writeFileSync(filePath, JSON.stringify(payload));
  };

  const createInspector = (codexImpl?: any, claudeImpl?: any) =>
    new IssueInspector(
      codexImpl ? { executeTask: codexImpl } as any : null,
      claudeImpl ? { executeTask: claudeImpl } as any : null,
      issueClient,
    );

  const candidate = {
    number: 100,
    title: '[FOLLOW-UP] テスト',
    body: 'body',
    labels: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
    url: 'https://example.com/issue/100',
  };

  beforeEach(() => {
    jest.spyOn(PromptLoader, 'loadPrompt').mockReturnValue('OUTPUT:{output_file_path}');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  /**
   * TC-INS-008/009/010: エージェント結果のパース
   */
  it('エージェントの close/keep/needs_discussion をパースできる', async () => {
    const payloads: InspectionResult[] = [
      {
        issueNumber: 100,
        recommendation: 'close',
        confidence: 0.9,
        reasoning: 'ready',
        closeComment: 'comment',
      },
      {
        issueNumber: 100,
        recommendation: 'keep',
        confidence: 0.6,
        reasoning: 'keep it',
      },
      {
        issueNumber: 100,
        recommendation: 'needs_discussion',
        confidence: 0.5,
        reasoning: 'needs discussion',
      },
    ];
    const inspector = createInspector(async ({ prompt }: any) => {
      writeFromPrompt(prompt, payloads);
    });

    const results = await inspector.inspect([candidate], 'codex');

    expect(results).toHaveLength(1);
    expect(results[0].recommendation).toBe('close');
    expect(results[0].confidence).toBe(0.9);
  });

  /**
   * TC-INS-011: JSON解析エラー
   */
  it('不正JSONは結果に含めない', async () => {
    const inspector = createInspector(async ({ prompt }: any) => {
      const match = prompt.match(/OUTPUT:(.+)$/m);
      const filePath = match?.[1].trim();
      if (filePath) {
        fs.writeFileSync(filePath, '{invalid json');
      }
    });

    const results = await inspector.inspect([candidate], 'codex');
    expect(results).toHaveLength(0);
  });

  /**
   * TC-INS-012/013: フォールバック動作
   */
  it('Codexが失敗した場合はClaudeにフォールバックする', async () => {
    const inspector = createInspector(
      async () => {
        throw new Error('codex error');
      },
      async ({ prompt }: any) => {
        writeFromPrompt(prompt, {
          issueNumber: 100,
          recommendation: 'close',
          confidence: 0.8,
          reasoning: 'fallback',
        });
      },
    );

    const results = await inspector.inspect([candidate], 'auto');

    expect(results).toHaveLength(1);
    expect(results[0].reasoning).toBe('fallback');
  });

  it('両方失敗した場合は結果ゼロ件', async () => {
    const inspector = createInspector(
      async () => {
        throw new Error('codex timeout');
      },
      async () => {
        throw new Error('claude timeout');
      },
    );

    const results = await inspector.inspect([candidate], 'auto');
    expect(results).toHaveLength(0);
  });
});

describe('IssueInspector#filterByConfidence', () => {
  const inspector = new IssueInspector(null, null, {} as any);

  /**
   * TC-INS-014/015/016: confidence フィルタ
   */
  it('閾値未満の close を除外し、境界値と keep は残す', () => {
    const results: InspectionResult[] = [
      { issueNumber: 1, recommendation: 'close', confidence: 0.6, reasoning: '' },
      { issueNumber: 2, recommendation: 'close', confidence: 0.7, reasoning: '' },
      { issueNumber: 3, recommendation: 'keep', confidence: 0.2, reasoning: '' },
      {
        issueNumber: 4,
        recommendation: 'needs_discussion',
        confidence: 0.1,
        reasoning: '',
      },
    ];

    const filtered = inspector.filterByConfidence(results, 0.7);
    const numbers = filtered.map((r) => r.issueNumber);

    expect(numbers).toEqual([2, 3, 4]);
  });
});

describe('IssueInspector#closeIssue', () => {
  const closeIssueMock = jest.fn();
  const addLabelsMock = jest.fn();
  const issueClient = {
    closeIssue: closeIssueMock,
    addLabels: addLabelsMock,
  } as any;
  const inspector = new IssueInspector(null, null, issueClient);
  const candidate = {
    number: 200,
    title: 'クローズ候補',
    body: '',
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    url: '',
  };
  const inspection: InspectionResult = {
    issueNumber: 200,
    recommendation: 'close',
    confidence: 0.9,
    reasoning: 'ready',
  };

  beforeEach(() => {
    closeIssueMock.mockReset();
    addLabelsMock.mockReset();
  });

  /**
   * TC-INS-017: 実行モード
   */
  it('実行モードでコメントとラベル付与を行う', async () => {
    closeIssueMock.mockResolvedValue({ success: true });
    addLabelsMock.mockResolvedValue({ success: true });

    const result = await inspector.closeIssue(candidate, inspection, false);

    expect(closeIssueMock).toHaveBeenCalledWith(
      candidate.number,
      expect.stringContaining('このIssueは自動検品の結果、クローズされました。'),
    );
    expect(addLabelsMock).toHaveBeenCalledWith(candidate.number, ['auto-closed']);
    expect(result.action).toBe('closed');
  });

  /**
   * TC-INS-018: dry-run
   */
  it('dry-run では実際のAPIを呼ばない', async () => {
    const result = await inspector.closeIssue(candidate, inspection, true);

    expect(closeIssueMock).not.toHaveBeenCalled();
    expect(addLabelsMock).not.toHaveBeenCalled();
    expect(result.action).toBe('previewed');
  });

  /**
   * TC-INS-019: GitHub APIエラー
   */
  it('クローズAPIが失敗した場合はエラー結果を返す', async () => {
    closeIssueMock.mockResolvedValue({ success: false, error: 'API error' });

    const result = await inspector.closeIssue(candidate, inspection, false);

    expect(result.success).toBe(false);
    expect(result.action).toBe('error');
    expect(result.error).toBe('API error');
  });
});
