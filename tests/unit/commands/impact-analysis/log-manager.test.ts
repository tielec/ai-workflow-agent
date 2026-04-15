/**
 * ユニットテスト: impact-analysis LogManager
 *
 * テスト対象: src/commands/impact-analysis/log-manager.ts
 * テストシナリオ: test-scenario.md の TC-LOG-001 〜 TC-LOG-007
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from '@jest/globals';
import { LogManager } from '../../../../src/commands/impact-analysis/log-manager.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'impact-analysis-logs-'));
}

describe('LogManager', () => {
  it('TC-LOG-001: 初期化時にログディレクトリが作成される', () => {
    const baseDir = createTempDir();
    const logDir = path.join(baseDir, 'pr-123');
    new LogManager(logDir);
    expect(fs.existsSync(logDir)).toBe(true);
  });

  it('TC-LOG-002: Scoperのreasoningが保存される', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const content = '## Scoper判断根拠\n\nマイグレーションパターンがマッチ';
    manager.saveScoperReasoning(content);

    const saved = fs.readFileSync(path.join(logDir, 'scoper-reasoning.md'), 'utf-8');
    expect(saved).toBe(content);
  });

  it('TC-LOG-003: Investigatorログが保存される', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const content = '## Investigator実行ログ\n\nripgrep実行: 5件ヒット';
    manager.saveInvestigatorLog(content);

    expect(fs.existsSync(path.join(logDir, 'investigator-log.md'))).toBe(true);
  });

  it('TC-LOG-004: Reporter出力が保存される', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const content = '## 影響範囲調査レポート\n\n...';
    manager.saveReporterOutput(content);

    expect(fs.existsSync(path.join(logDir, 'reporter-output.md'))).toBe(true);
  });

  it('TC-LOG-005: パイプラインサマリーが保存される', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const summary = {
      prNumber: 123,
      findingsCount: 3,
      patternsMatched: ['マイグレーション波及', '共有リソース変更'],
      guardrailsReached: false,
      tokenUsage: 45000,
      toolCallCount: 15,
      dryRun: false,
    };

    manager.savePipelineSummary(summary);
    const saved = fs.readFileSync(path.join(logDir, 'pipeline-summary.json'), 'utf-8');
    expect(JSON.parse(saved)).toEqual(summary);
  });

  it('TC-LOG-006: dry-runレポートが保存され、パスが返る', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const report = '## Dry-run レポート\n\n...';
    const filePath = manager.saveDryRunReport(report);

    expect(filePath).toContain('report-dry-run.md');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(report);
  });

  it('TC-LOG-007: フォールバックレポートが保存される', () => {
    const logDir = createTempDir();
    const manager = new LogManager(logDir);
    const report = '## フォールバック レポート\n\n...';
    const filePath = manager.saveReportFallback(report);

    expect(filePath).toContain('report-fallback.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
