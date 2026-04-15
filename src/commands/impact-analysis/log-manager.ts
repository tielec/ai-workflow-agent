import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';

/**
 * ステージ間ログマネージャー
 */
export class LogManager {
  private readonly logDir: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  saveScoperReasoning(reasoning: string): void {
    this.writeFile('scoper-reasoning.md', reasoning);
  }

  saveInvestigatorLog(log: string): void {
    this.writeFile('investigator-log.md', log);
  }

  saveReporterOutput(report: string): void {
    this.writeFile('reporter-output.md', report);
  }

  savePipelineSummary(summary: Record<string, unknown>): void {
    this.writeFile('pipeline-summary.json', JSON.stringify(summary, null, 2));
  }

  saveDryRunReport(report: string): string {
    const filePath = path.join(this.logDir, 'report-dry-run.md');
    this.writeFile('report-dry-run.md', report);
    return filePath;
  }

  saveReportFallback(report: string): string {
    const filePath = path.join(this.logDir, 'report-fallback.md');
    this.writeFile('report-fallback.md', report);
    return filePath;
  }

  private writeFile(filename: string, content: string): void {
    const filePath = path.join(this.logDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.debug(`ログ保存: ${filePath}`);
  }
}
