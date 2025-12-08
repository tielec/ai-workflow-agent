/**
 * ユニットテスト: auto-issue-output ヘルパー
 *
 * テスト対象: src/commands/auto-issue-output.ts
 * テストシナリオ: test-scenario.md の buildAutoIssueJsonPayload / writeAutoIssueOutputFile 関連
 */

import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildAutoIssueJsonPayload,
  writeAutoIssueOutputFile,
} from '../../../src/commands/auto-issue-output.js';

jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('auto-issue-output helpers', () => {
  describe('buildAutoIssueJsonPayload', () => {
    /**
     * TC-OUT-001: buildAutoIssueJsonPayload_summary集計
     *
     * 目的: success/failed/skipped/dry-runを正しく集計し issues 配列に反映することを確認
     */
    it('should aggregate summary counts from issue results', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'bug' as const,
        dryRun: false,
      };

      const results = [
        {
          success: true,
          issueNumber: 10,
          issueUrl: 'https://github.com/owner/repo/issues/10',
          title: 'Bug fix 1',
        },
        {
          success: false,
          error: 'rate limit exceeded',
          title: 'Bug fix 2',
        },
        {
          success: true,
          skippedReason: 'dry-run mode',
          title: 'Bug fix 3',
        },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.summary).toEqual({
        total: 3,
        success: 1,
        failed: 1,
        skipped: 1,
      });
      expect(payload.issues[0]).toEqual(
        expect.objectContaining({
          issueNumber: 10,
          issueUrl: 'https://github.com/owner/repo/issues/10',
          success: true,
        }),
      );
      expect(payload.issues[1]).toEqual(
        expect.objectContaining({
          success: false,
          error: 'rate limit exceeded',
        }),
      );
      expect(payload.issues[2]).toEqual(
        expect.objectContaining({
          skippedReason: 'dry-run mode',
          success: true,
        }),
      );
    });

    /**
     * TC-OUT-002: buildAutoIssueJsonPayload_title未設定時のデフォルト値
     *
     * 目的: result.title が undefined の場合に 'Unknown title' がセットされることを確認
     */
    it('should use "Unknown title" when result title is missing', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'bug' as const,
        dryRun: false,
      };

      const results = [
        {
          success: true,
          issueNumber: 99,
          issueUrl: 'https://github.com/owner/repo/issues/99',
          // title intentionally omitted
        },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.issues[0].title).toBe('Unknown title');
    });

    /**
     * TC-OUT-003: buildAutoIssueJsonPayload_空の結果配列
     *
     * 目的: 空の結果配列が正しく処理されることを確認
     */
    it('should handle empty results array correctly', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'enhancement' as const,
        dryRun: true,
      };

      const results: any[] = [];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.summary).toEqual({
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
      });
      expect(payload.issues).toEqual([]);
      expect(payload.execution).toEqual(execution);
    });

    /**
     * TC-OUT-004: buildAutoIssueJsonPayload_全失敗ケース
     *
     * 目的: 全ての結果が失敗の場合の集計が正しいことを確認
     */
    it('should correctly count all failures', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'bug' as const,
        dryRun: false,
      };

      const results = [
        { success: false, error: 'API error 1', title: 'Failed 1' },
        { success: false, error: 'API error 2', title: 'Failed 2' },
        { success: false, error: 'API error 3', title: 'Failed 3' },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.summary).toEqual({
        total: 3,
        success: 0,
        failed: 3,
        skipped: 0,
      });
    });

    /**
     * TC-OUT-005: buildAutoIssueJsonPayload_全スキップケース(dry-run)
     *
     * 目的: dry-run で全てスキップされた場合の集計が正しいことを確認
     */
    it('should correctly count all skipped (dry-run)', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'refactor' as const,
        dryRun: true,
      };

      const results = [
        { success: true, skippedReason: 'dry-run mode', title: 'Skipped 1' },
        { success: true, skippedReason: 'dry-run mode', title: 'Skipped 2' },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.summary).toEqual({
        total: 2,
        success: 0,
        failed: 0,
        skipped: 2,
      });
    });

    /**
     * TC-OUT-006: buildAutoIssueJsonPayload_execution情報の保持
     *
     * 目的: execution情報がそのまま出力に含まれることを確認
     */
    it('should preserve execution info in output', () => {
      const execution = {
        timestamp: '2024-06-15T12:30:45.123Z',
        repository: 'tielec/ai-workflow-agent',
        category: 'enhancement' as const,
        dryRun: false,
      };

      const results = [
        {
          success: true,
          issueNumber: 451,
          issueUrl: 'https://github.com/tielec/ai-workflow-agent/issues/451',
          title: 'Enhancement proposal',
        },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      expect(payload.execution).toEqual(execution);
      expect(payload.execution.timestamp).toBe('2024-06-15T12:30:45.123Z');
      expect(payload.execution.repository).toBe('tielec/ai-workflow-agent');
    });

    /**
     * TC-OUT-007: buildAutoIssueJsonPayload_issueEntryのオプショナルフィールド
     *
     * 目的: issueNumber/issueUrl/error/skippedReason がオプショナルで正しく処理されることを確認
     */
    it('should handle optional fields in issue entries', () => {
      const execution = {
        timestamp: '2024-01-01T00:00:00.000Z',
        repository: 'owner/repo',
        category: 'bug' as const,
        dryRun: false,
      };

      const results = [
        {
          success: true,
          issueNumber: 100,
          issueUrl: 'https://github.com/owner/repo/issues/100',
          title: 'Success with URL',
        },
        {
          success: true,
          skippedReason: 'dry-run mode',
          title: 'Dry-run entry',
          // issueNumber/issueUrl intentionally omitted
        },
        {
          success: false,
          error: 'Connection timeout',
          title: 'Failed entry',
          // issueNumber/issueUrl intentionally omitted
        },
      ];

      const payload = buildAutoIssueJsonPayload({ execution, results });

      // Success entry has issueNumber and issueUrl
      expect(payload.issues[0].issueNumber).toBe(100);
      expect(payload.issues[0].issueUrl).toBe('https://github.com/owner/repo/issues/100');
      expect(payload.issues[0].error).toBeUndefined();
      expect(payload.issues[0].skippedReason).toBeUndefined();

      // Dry-run entry has skippedReason but no issueNumber/issueUrl
      expect(payload.issues[1].issueNumber).toBeUndefined();
      expect(payload.issues[1].issueUrl).toBeUndefined();
      expect(payload.issues[1].skippedReason).toBe('dry-run mode');
      expect(payload.issues[1].error).toBeUndefined();

      // Failed entry has error but no issueNumber/issueUrl/skippedReason
      expect(payload.issues[2].issueNumber).toBeUndefined();
      expect(payload.issues[2].issueUrl).toBeUndefined();
      expect(payload.issues[2].error).toBe('Connection timeout');
      expect(payload.issues[2].skippedReason).toBeUndefined();
    });
  });

  describe('writeAutoIssueOutputFile', () => {
    /**
     * TC-WRITE-001: writeAutoIssueOutputFile_正常系_ディレクトリ作成とJSON書き込み
     *
     * 目的: 未作成ディレクトリを mkdir({recursive:true}) で生成し、
     *       JSON文字列をUTF-8で書き出すことを確認
     */
    it('should ensure directories exist and write canonical JSON', async () => {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-issue-output-'));
      const targetPath = path.join(tempBase, 'nested', 'results.json');
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as const,
          dryRun: false,
        },
        summary: { total: 1, success: 1, failed: 0, skipped: 0 },
        issues: [
          {
            success: true,
            title: 'Bug fix',
            issueNumber: 42,
            issueUrl: 'https://github.com/owner/repo/issues/42',
          },
        ],
      };

      try {
        await writeAutoIssueOutputFile(targetPath, payload);
        const written = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
        expect(written).toEqual(payload);
      } finally {
        await fs.rm(tempBase, { recursive: true, force: true });
      }
    });

    /**
     * TC-WRITE-002: writeAutoIssueOutputFile_異常系_書き込み失敗
     *
     * 目的: 書き込みエラーを検知し、例外を上位に伝播させることで
     *       CLIを失敗扱いにできるか確認
     */
    it('should surface friendly errors when write operation fails', async () => {
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as const,
          dryRun: false,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      };

      await expect(
        writeAutoIssueOutputFile('/root/protected/results.json', payload),
      ).rejects.toThrow(/Failed to write auto-issue output file/);
    });

    /**
     * TC-WRITE-003: writeAutoIssueOutputFile_正常系_JSONフォーマット確認
     *
     * 目的: 2スペースインデントと末尾改行でJSONが書き出されることを確認
     */
    it('should write JSON with 2-space indentation and trailing newline', async () => {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-issue-output-format-'));
      const targetPath = path.join(tempBase, 'formatted.json');
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as const,
          dryRun: false,
        },
        summary: { total: 1, success: 1, failed: 0, skipped: 0 },
        issues: [{ success: true, title: 'Test' }],
      };

      try {
        await writeAutoIssueOutputFile(targetPath, payload);
        const rawContent = await fs.readFile(targetPath, 'utf-8');

        // 末尾改行を確認
        expect(rawContent.endsWith('\n')).toBe(true);

        // 2スペースインデントを確認
        expect(rawContent).toContain('  "execution":');
        expect(rawContent).toContain('  "summary":');
        expect(rawContent).toContain('  "issues":');
      } finally {
        await fs.rm(tempBase, { recursive: true, force: true });
      }
    });

    /**
     * TC-WRITE-004: writeAutoIssueOutputFile_正常系_深いネストディレクトリ
     *
     * 目的: 複数レベルのネストディレクトリが正しく作成されることを確認
     */
    it('should create deeply nested directories', async () => {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-issue-deep-'));
      const targetPath = path.join(tempBase, 'level1', 'level2', 'level3', 'results.json');
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as const,
          dryRun: false,
        },
        summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        issues: [],
      };

      try {
        await writeAutoIssueOutputFile(targetPath, payload);

        // ファイルが存在することを確認
        const stat = await fs.stat(targetPath);
        expect(stat.isFile()).toBe(true);

        // 内容が正しいことを確認
        const written = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
        expect(written).toEqual(payload);
      } finally {
        await fs.rm(tempBase, { recursive: true, force: true });
      }
    });

    /**
     * TC-WRITE-005: writeAutoIssueOutputFile_正常系_既存ディレクトリ上書き
     *
     * 目的: 既存ディレクトリがある場合でもエラーなく書き込めることを確認
     */
    it('should write to existing directory without error', async () => {
      const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-issue-existing-'));
      const targetPath = path.join(tempBase, 'results.json');
      const payload = {
        execution: {
          timestamp: '2024-01-01T00:00:00.000Z',
          repository: 'owner/repo',
          category: 'bug' as const,
          dryRun: false,
        },
        summary: { total: 1, success: 1, failed: 0, skipped: 0 },
        issues: [{ success: true, title: 'Test' }],
      };

      try {
        // 1回目の書き込み
        await writeAutoIssueOutputFile(targetPath, payload);

        // 2回目の書き込み（上書き）
        const updatedPayload = {
          ...payload,
          summary: { total: 2, success: 2, failed: 0, skipped: 0 },
        };
        await writeAutoIssueOutputFile(targetPath, updatedPayload);

        // 上書きされた内容を確認
        const written = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
        expect(written.summary.total).toBe(2);
      } finally {
        await fs.rm(tempBase, { recursive: true, force: true });
      }
    });
  });
});
