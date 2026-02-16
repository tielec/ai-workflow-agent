import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type {
  AutoCloseIssueExecutionInfo,
  AutoCloseIssueIssueEntry,
  AutoCloseIssueJsonOutput,
  AutoCloseIssueSummary,
  CloseIssueResult,
} from '../types/auto-close-issue.js';

interface BuildPayloadParams {
  execution: AutoCloseIssueExecutionInfo;
  results: CloseIssueResult[];
}

/**
 * auto-close-issueコマンドの結果からJSONペイロードを構築
 */
export function buildAutoCloseIssueJsonPayload({
  execution,
  results,
}: BuildPayloadParams): AutoCloseIssueJsonOutput {
  const issues: AutoCloseIssueIssueEntry[] = results.map((result) => {
    const entry: AutoCloseIssueIssueEntry = {
      issueNumber: result.issueNumber,
      title: result.title,
      action: result.action,
    };

    if (result.skipReason) {
      entry.skipReason = result.skipReason;
    }
    if (result.error) {
      entry.error = result.error;
    }
    if (result.inspectionResult) {
      entry.inspection = {
        recommendation: result.inspectionResult.recommendation,
        confidence: result.inspectionResult.confidence,
        reasoning: result.inspectionResult.reasoning,
      };
    }

    return entry;
  });

  const summary: AutoCloseIssueSummary = {
    totalInspected: results.length,
    recommendedClose: results.filter(
      (r) => r.inspectionResult?.recommendation === 'close',
    ).length,
    actualClosed: results.filter((r) => r.action === 'closed').length,
    skipped: results.filter(
      (r) => r.action === 'skipped' || r.action === 'user_rejected',
    ).length,
    errors: results.filter((r) => r.action === 'error').length,
  };

  return {
    execution,
    summary,
    issues,
  };
}

/**
 * JSONペイロードをファイルへ書き出し
 */
export async function writeAutoCloseIssueOutputFile(
  filePath: string,
  payload: AutoCloseIssueJsonOutput,
): Promise<void> {
  const directory = path.dirname(filePath);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, serialized, 'utf-8');
    logger.info(`Wrote auto-close-issue results to ${filePath}`);
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(`Failed to write auto-close-issue results to ${filePath}: ${message}`);
    throw new Error(`Failed to write auto-close-issue output file (${filePath}): ${message}`);
  }
}
