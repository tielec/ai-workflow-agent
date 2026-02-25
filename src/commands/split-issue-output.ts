import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type {
  SplitIssueExecutionInfo,
  SplitIssueEntry,
  SplitIssueJsonOutput,
  SplitIssueResult,
} from '../types/split-issue.js';

interface BuildSplitIssuePayloadParams {
  execution: SplitIssueExecutionInfo;
  result: SplitIssueResult;
}

/**
 * split-issueコマンドの結果からJSONペイロードを構築
 */
export function buildSplitIssueJsonPayload({
  execution,
  result,
}: BuildSplitIssuePayloadParams): SplitIssueJsonOutput {
  const totalSplitIssues = result.splitIssues.length;
  const createdCount = execution.apply ? (result.createdIssueUrls?.length ?? 0) : 0;
  const failedCount = execution.apply ? Math.max(totalSplitIssues - createdCount, 0) : 0;
  const createdIssueUrls = execution.apply ? result.createdIssueUrls ?? [] : [];

  const issues: SplitIssueEntry[] = result.splitIssues.map((issue, index) => {
    const entry: SplitIssueEntry = {
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
      priority: issue.priority,
      relatedFeatures: issue.relatedFeatures,
    };

    const issueUrl = createdIssueUrls[index];
    if (issueUrl) {
      const issueNumber = parseInt(issueUrl.split('/').pop() ?? '', 10);
      if (Number.isFinite(issueNumber)) {
        entry.issueNumber = issueNumber;
      }
      entry.issueUrl = issueUrl;
    }

    return entry;
  });

  return {
    execution,
    summary: {
      originalTitle: result.originalTitle,
      splitSummary: result.splitSummary,
      totalSplitIssues,
      createdCount,
      failedCount,
    },
    issues,
    metrics: {
      completenessScore: result.metrics.completenessScore,
      specificityScore: result.metrics.specificityScore,
    },
  };
}

/**
 * JSONペイロードをファイルへ書き出し
 */
export async function writeSplitIssueOutputFile(
  filePath: string,
  payload: SplitIssueJsonOutput,
): Promise<void> {
  const directory = path.dirname(filePath);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, serialized, 'utf-8');
    logger.info(`Wrote split-issue results to ${filePath}`);
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(`Failed to write split-issue results to ${filePath}: ${message}`);
    throw new Error(`Failed to write split-issue output file (${filePath}): ${message}`);
  }
}
