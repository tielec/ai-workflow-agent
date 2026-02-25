/**
 * ユニットテスト: split-issue-output ヘルパー
 *
 * テスト対象: src/commands/split-issue-output.ts
 * テストシナリオ: test-scenario.md の TC-SPLIT-OUT-001〜008 / TC-SPLIT-WRITE-001〜005
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { logger } = await import('../../../src/utils/logger.js');
const { buildSplitIssueJsonPayload, writeSplitIssueOutputFile } = await import(
  '../../../src/commands/split-issue-output.js'
);

describe('split-issue-output helpers', () => {
  describe('buildSplitIssueJsonPayload', () => {
    const baseDryRunExecution = {
      timestamp: '2025-01-15T10:30:00.000Z',
      repository: 'tielec/ai-workflow-agent',
      issueNumber: 790,
      language: 'ja',
      apply: false,
      dryRun: true,
      maxSplits: 10,
    };

    const baseApplyExecution = {
      timestamp: '2025-01-15T10:30:00.000Z',
      repository: 'tielec/ai-workflow-agent',
      issueNumber: 790,
      language: 'ja',
      apply: true,
      dryRun: false,
      maxSplits: 10,
    };

    // TC-SPLIT-OUT-001
    it('dry-runモードで基本的なペイロードを構築する', () => {
      const result = {
        success: true,
        originalTitle: 'テストIssueタイトル',
        originalBody: 'テストIssue本文',
        splitSummary: 'Issue #790を3つの機能Issueに分割しました。',
        splitIssues: [
          {
            title: '子Issue A',
            body: '## 概要\n子Issue Aの本文',
            labels: ['enhancement'],
            priority: 'high',
            relatedFeatures: [],
          },
          {
            title: '子Issue B',
            body: '## 概要\n子Issue Bの本文',
            labels: ['bug'],
            priority: 'medium',
            relatedFeatures: ['子Issue A'],
          },
          {
            title: '子Issue C',
            body: '## 概要\n子Issue Cの本文',
            labels: ['enhancement', 'jenkins'],
            priority: 'low',
            relatedFeatures: ['子Issue A'],
          },
        ],
        metrics: { completenessScore: 85, specificityScore: 70 },
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseDryRunExecution, result });

      expect(payload.execution).toEqual(baseDryRunExecution);
      expect(payload.summary.originalTitle).toBe('テストIssueタイトル');
      expect(payload.summary.splitSummary).toBe('Issue #790を3つの機能Issueに分割しました。');
      expect(payload.summary.totalSplitIssues).toBe(3);
      expect(payload.summary.createdCount).toBe(0);
      expect(payload.summary.failedCount).toBe(0);
      expect(payload.issues).toHaveLength(3);
      payload.issues.forEach((issue, index) => {
        expect(issue.title).toBe(result.splitIssues[index].title);
        expect(issue.body).toBe(result.splitIssues[index].body);
        expect(issue.labels).toEqual(result.splitIssues[index].labels);
        expect(issue.priority).toBe(result.splitIssues[index].priority);
        expect(issue.relatedFeatures).toEqual(result.splitIssues[index].relatedFeatures);
        expect(issue.issueNumber).toBeUndefined();
        expect(issue.issueUrl).toBeUndefined();
      });
      expect(payload.metrics.completenessScore).toBe(85);
      expect(payload.metrics.specificityScore).toBe(70);
    });

    // TC-SPLIT-OUT-002
    it('applyモードでcreatedIssueUrlsをマッピングする', () => {
      const result = {
        success: true,
        originalTitle: 'テストIssueタイトル',
        originalBody: 'テストIssue本文',
        splitSummary: '分割完了',
        splitIssues: [
          { title: '子Issue A', body: '本文A', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
          { title: '子Issue B', body: '本文B', labels: ['bug'], priority: 'low', relatedFeatures: ['子Issue A'] },
        ],
        metrics: { completenessScore: 90, specificityScore: 80 },
        createdIssueUrls: [
          'https://github.com/tielec/ai-workflow-agent/issues/791',
          'https://github.com/tielec/ai-workflow-agent/issues/792',
        ],
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseApplyExecution, result });

      expect(payload.execution.apply).toBe(true);
      expect(payload.execution.dryRun).toBe(false);
      expect(payload.summary.totalSplitIssues).toBe(2);
      expect(payload.summary.createdCount).toBe(2);
      expect(payload.summary.failedCount).toBe(0);
      expect(payload.issues[0].issueNumber).toBe(791);
      expect(payload.issues[0].issueUrl).toBe('https://github.com/tielec/ai-workflow-agent/issues/791');
      expect(payload.issues[1].issueNumber).toBe(792);
      expect(payload.issues[1].issueUrl).toBe('https://github.com/tielec/ai-workflow-agent/issues/792');
    });

    // TC-SPLIT-OUT-003
    it('空の分割結果を処理する', () => {
      const result = {
        success: true,
        originalTitle: 'Empty split',
        originalBody: 'Body',
        splitSummary: '分割結果なし',
        splitIssues: [],
        metrics: { completenessScore: 0, specificityScore: 0 },
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseDryRunExecution, result });

      expect(payload.issues).toEqual([]);
      expect(payload.summary.totalSplitIssues).toBe(0);
      expect(payload.summary.createdCount).toBe(0);
      expect(payload.summary.failedCount).toBe(0);
      expect(payload.execution).toEqual(baseDryRunExecution);
    });

    // TC-SPLIT-OUT-004
    it('部分的な作成成功時にcreatedCountとfailedCountが正しい', () => {
      const result = {
        success: true,
        originalTitle: '部分成功テスト',
        originalBody: 'Body',
        splitSummary: '分割完了',
        splitIssues: [
          { title: 'Issue 1', body: 'Body 1', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
          { title: 'Issue 2', body: 'Body 2', labels: ['bug'], priority: 'medium', relatedFeatures: [] },
          { title: 'Issue 3', body: 'Body 3', labels: ['enhancement'], priority: 'low', relatedFeatures: [] },
        ],
        metrics: { completenessScore: 75, specificityScore: 60 },
        createdIssueUrls: ['https://github.com/owner/repo/issues/101'],
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseApplyExecution, result });

      expect(payload.summary.totalSplitIssues).toBe(3);
      expect(payload.summary.createdCount).toBe(1);
      expect(payload.summary.failedCount).toBe(2);
      expect(payload.issues[0].issueNumber).toBe(101);
      expect(payload.issues[0].issueUrl).toBe('https://github.com/owner/repo/issues/101');
      expect(payload.issues[1].issueNumber).toBeUndefined();
      expect(payload.issues[1].issueUrl).toBeUndefined();
      expect(payload.issues[2].issueNumber).toBeUndefined();
      expect(payload.issues[2].issueUrl).toBeUndefined();
    });

    // TC-SPLIT-OUT-005
    it('execution情報をそのまま保持する', () => {
      const execution = {
        timestamp: '2025-06-15T12:30:45.123Z',
        repository: 'my-org/my-repo',
        issueNumber: 42,
        language: 'en',
        apply: true,
        dryRun: false,
        maxSplits: 5,
      };

      const result = {
        success: true,
        originalTitle: 'Test',
        originalBody: 'Body',
        splitSummary: 'Summary',
        splitIssues: [
          { title: 'Issue A', body: 'Body', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
        ],
        metrics: { completenessScore: 50, specificityScore: 50 },
        createdIssueUrls: ['https://github.com/my-org/my-repo/issues/43'],
      };

      const payload = buildSplitIssueJsonPayload({ execution, result });

      expect(payload.execution).toEqual(execution);
    });

    // TC-SPLIT-OUT-006
    it('metricsセクションが保持される', () => {
      const result = {
        success: true,
        originalTitle: 'Metrics test',
        originalBody: 'Body',
        splitSummary: 'Summary',
        splitIssues: [
          { title: 'Issue', body: 'Body', labels: [], priority: 'high', relatedFeatures: [] },
        ],
        metrics: { completenessScore: 100, specificityScore: 0 },
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseDryRunExecution, result });

      expect(payload.metrics.completenessScore).toBe(100);
      expect(payload.metrics.specificityScore).toBe(0);
    });

    // TC-SPLIT-OUT-007
    it('apply時にcreatedIssueUrlsが未定義なら全件失敗扱い', () => {
      const result = {
        success: true,
        originalTitle: 'No URLs',
        originalBody: 'Body',
        splitSummary: 'Summary',
        splitIssues: [
          { title: 'Issue 1', body: 'Body', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
          { title: 'Issue 2', body: 'Body', labels: ['enhancement'], priority: 'medium', relatedFeatures: [] },
        ],
        metrics: { completenessScore: 50, specificityScore: 50 },
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseApplyExecution, result });

      expect(payload.summary.createdCount).toBe(0);
      expect(payload.summary.failedCount).toBe(2);
      expect(payload.issues[0].issueNumber).toBeUndefined();
      expect(payload.issues[0].issueUrl).toBeUndefined();
      expect(payload.issues[1].issueNumber).toBeUndefined();
      expect(payload.issues[1].issueUrl).toBeUndefined();
    });

    // TC-SPLIT-OUT-008
    it('relatedFeaturesとlabelsが正しくマッピングされる', () => {
      const result = {
        success: true,
        originalTitle: 'Related test',
        originalBody: 'Body',
        splitSummary: 'Summary',
        splitIssues: [
          {
            title: 'Feature A',
            body: 'Body A',
            labels: ['enhancement', 'frontend', 'priority-high'],
            priority: 'high',
            relatedFeatures: ['Feature B', 'Feature C'],
          },
        ],
        metrics: { completenessScore: 80, specificityScore: 60 },
      };

      const payload = buildSplitIssueJsonPayload({ execution: baseDryRunExecution, result });

      expect(payload.issues[0].labels).toEqual(['enhancement', 'frontend', 'priority-high']);
      expect(payload.issues[0].relatedFeatures).toEqual(['Feature B', 'Feature C']);
    });
  });

  describe('writeSplitIssueOutputFile', () => {
    let tempBase: string;

    beforeEach(async () => {
      tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'split-issue-output-'));
      mockLoggerInfo.mockClear();
      mockLoggerError.mockClear();
    });

    afterEach(async () => {
      if (tempBase) {
        await fs.rm(tempBase, { recursive: true, force: true });
      }
    });

    const minimalPayload = {
      execution: {
        timestamp: '2025-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        issueNumber: 1,
        language: 'ja',
        apply: false,
        dryRun: true,
        maxSplits: 10,
      },
      summary: {
        originalTitle: 'Test',
        splitSummary: 'Summary',
        totalSplitIssues: 1,
        createdCount: 0,
        failedCount: 0,
      },
      issues: [
        { title: 'Issue A', body: 'Body', labels: ['enhancement'], priority: 'high', relatedFeatures: [] },
      ],
      metrics: { completenessScore: 85, specificityScore: 70 },
    };

    // TC-SPLIT-WRITE-001
    it('ディレクトリを作成してJSONを書き込む', async () => {
      const filePath = path.join(tempBase, 'nested', 'results.json');

      await writeSplitIssueOutputFile(filePath, minimalPayload);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(minimalPayload);
      expect(logger.info).toHaveBeenCalledWith(`Wrote split-issue results to ${filePath}`);
    });

    // TC-SPLIT-WRITE-002
    it('書き込み失敗時にエラーをスローする', async () => {
      if (os.platform() === 'win32') {
        return;
      }
      const filePath = '/root/protected/results.json';

      await expect(writeSplitIssueOutputFile(filePath, minimalPayload)).rejects.toThrow(
        'Failed to write split-issue output file',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write split-issue results to'),
      );
    });

    // TC-SPLIT-WRITE-003
    it('JSONを2スペースインデントと改行付きで出力する', async () => {
      const filePath = path.join(tempBase, 'formatted.json');

      await writeSplitIssueOutputFile(filePath, minimalPayload);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.endsWith('\n')).toBe(true);
      expect(content).toContain('  "execution":');
      expect(content).toContain('  "summary":');
      expect(content).toContain('  "issues":');
      expect(content).toContain('  "metrics":');
      expect(JSON.parse(content)).toEqual(minimalPayload);
    });

    // TC-SPLIT-WRITE-004
    it('深いネストディレクトリでも作成できる', async () => {
      const filePath = path.join(tempBase, 'level1', 'level2', 'level3', 'results.json');

      await writeSplitIssueOutputFile(filePath, minimalPayload);

      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(minimalPayload);
    });

    // TC-SPLIT-WRITE-005
    it('既存ファイルを上書きできる', async () => {
      const filePath = path.join(tempBase, 'results.json');
      const payload1 = {
        ...minimalPayload,
        summary: {
          ...minimalPayload.summary,
          totalSplitIssues: 1,
        },
      };
      const payload2 = {
        ...minimalPayload,
        summary: {
          ...minimalPayload.summary,
          totalSplitIssues: 3,
        },
      };

      await writeSplitIssueOutputFile(filePath, payload1);
      const content1 = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content1).summary.totalSplitIssues).toBe(1);

      await writeSplitIssueOutputFile(filePath, payload2);
      const content2 = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content2).summary.totalSplitIssues).toBe(3);
    });
  });
});
