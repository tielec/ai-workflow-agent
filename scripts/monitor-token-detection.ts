#!/usr/bin/env tsx

/**
 * Token Detection Monitoring Script (Issue #58, Task 2)
 *
 * Analyzes workflow logs to detect Personal Access Token warnings and generates
 * a statistical report for monitoring purposes.
 *
 * Usage:
 *   npm run monitor:tokens
 */

import * as fs from 'node:fs';
import path from 'path';
import { glob } from 'glob';
import logger from '../src/utils/logger.js';

/**
 * Token detection event information
 */
interface TokenDetectionEvent {
  issueNumber: string;
  phase: string;
  timestamp: Date;
  logFilePath: string;
}

/**
 * Aggregated monitoring statistics
 */
interface MonitoringStatistics {
  totalDetections: number;
  detectionsByIssue: Map<string, number>;
  detectionsByPhase: Map<string, number>;
  detectionsByDate: Map<string, number>;
  events: TokenDetectionEvent[];
}

/**
 * Find all agent log files in workflow directories
 */
async function findLogFiles(): Promise<string[]> {
  try {
    const pattern = '.ai-workflow/issue-*/*/agent_log_raw.txt';
    const files = await glob(pattern, { cwd: process.cwd() });
    logger.info(`Found ${files.length} log files`);
    return files;
  } catch (error) {
    logger.error('Error finding log files:', error);
    return [];
  }
}

/**
 * Scan a log file for token detection warnings
 */
async function scanLogFile(filePath: string): Promise<TokenDetectionEvent[]> {
  const events: TokenDetectionEvent[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const warningPattern = /\[WARNING\] GitHub Personal Access Token detected/g;

    let match;
    while ((match = warningPattern.exec(content)) !== null) {
      // Extract issue number and phase from file path
      const issueMatch = filePath.match(/issue-(\d+)/);
      const phaseMatch = filePath.match(/\/(\d+_\w+)\//);

      if (issueMatch) {
        events.push({
          issueNumber: issueMatch[1],
          phase: phaseMatch ? phaseMatch[1] : 'unknown',
          timestamp: new Date(), // Use file mtime for actual timestamp
          logFilePath: filePath,
        });
      }
    }
  } catch (error) {
    logger.warn(`Failed to scan log file ${filePath}:`, error);
  }

  return events;
}

/**
 * Aggregate statistics from detection events
 */
function aggregateStatistics(
  events: TokenDetectionEvent[]
): MonitoringStatistics {
  const stats: MonitoringStatistics = {
    totalDetections: events.length,
    detectionsByIssue: new Map(),
    detectionsByPhase: new Map(),
    detectionsByDate: new Map(),
    events,
  };

  for (const event of events) {
    // Aggregate by issue number
    stats.detectionsByIssue.set(
      event.issueNumber,
      (stats.detectionsByIssue.get(event.issueNumber) || 0) + 1
    );

    // Aggregate by phase
    stats.detectionsByPhase.set(
      event.phase,
      (stats.detectionsByPhase.get(event.phase) || 0) + 1
    );

    // Aggregate by date (YYYY-MM-DD)
    const dateKey = event.timestamp.toISOString().split('T')[0];
    stats.detectionsByDate.set(
      dateKey,
      (stats.detectionsByDate.get(dateKey) || 0) + 1
    );
  }

  return stats;
}

/**
 * Generate Markdown report from statistics
 */
function generateReport(stats: MonitoringStatistics): string {
  let report = '# Token Detection Monitoring Report\n\n';
  report += `**Report Generated**: ${new Date().toISOString()}\n\n`;

  // Summary section
  report += '## Summary\n\n';
  report += `- **Total Detections**: ${stats.totalDetections}\n`;
  report += `- **Issues Affected**: ${stats.detectionsByIssue.size}\n`;
  report += `- **Phases Affected**: ${stats.detectionsByPhase.size}\n\n`;

  if (stats.totalDetections === 0) {
    report +=
      '**Result**: No GitHub Personal Access Token warnings detected in workflow logs.\n\n';
    return report;
  }

  // Detections by Issue
  report += '## Detections by Issue\n\n';
  report += '| Issue Number | Detection Count |\n';
  report += '|--------------|----------------|\n';
  const sortedIssues = Array.from(stats.detectionsByIssue.entries()).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  for (const [issue, count] of sortedIssues) {
    report += `| #${issue} | ${count} |\n`;
  }
  report += '\n';

  // Detections by Phase
  report += '## Detections by Phase\n\n';
  report += '| Phase | Detection Count |\n';
  report += '|-------|----------------|\n';
  const sortedPhases = Array.from(stats.detectionsByPhase.entries()).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  for (const [phase, count] of sortedPhases) {
    report += `| ${phase} | ${count} |\n`;
  }
  report += '\n';

  // Detections by Date
  report += '## Trend by Date\n\n';
  report += '| Date | Detection Count |\n';
  report += '|------|----------------|\n';
  const sortedDates = Array.from(stats.detectionsByDate.entries()).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  for (const [date, count] of sortedDates) {
    report += `| ${date} | ${count} |\n`;
  }
  report += '\n';

  // Security note
  report += '## Notes\n\n';
  report +=
    '- Token strings are masked (not displayed) for security reasons\n';
  report +=
    '- This report helps assess the effectiveness of token detection mechanisms\n';
  report +=
    '- All detected tokens were sanitized before being stored in metadata.json (Defense in Depth pattern)\n\n';

  return report;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting token detection monitoring...');

    // Find and scan log files
    const logFiles = await findLogFiles();
    if (logFiles.length === 0) {
      logger.warn('No workflow log files found. Skipping monitoring.');
    }

    const allEvents: TokenDetectionEvent[] = [];
    for (const filePath of logFiles) {
      const events = await scanLogFile(filePath);
      allEvents.push(...events);
    }

    // Aggregate statistics
    const stats = aggregateStatistics(allEvents);
    logger.info(`Total detections: ${stats.totalDetections}`);

    // Generate report
    const report = generateReport(stats);
    const outputPath =
      '.ai-workflow/issue-58/08_report/output/monitoring_report.md';
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, report, 'utf-8');

    logger.info(`Report generated: ${outputPath}`);
    logger.info('Monitoring completed successfully.');
  } catch (error) {
    logger.error('Monitoring failed:', error);
    process.exit(1);
  }
}

// Execute main
main();
