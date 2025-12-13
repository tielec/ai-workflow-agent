import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { createRequire } from 'node:module';
import type {
  AutoIssueExecutionInfo,
  AutoIssueIssueEntry,
  AutoIssueJsonOutput,
  IssueCreationResult,
} from '../types/auto-issue.js';

const testRequire = createRequire(import.meta.url);

const resolveJestApi = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalJest = (globalThis as any).jest;
  if (globalJest?.fn) {
    return globalJest;
  }

  try {
    const globals = testRequire('@jest/globals') as { jest?: any };
    return globals?.jest;
  } catch {
    return undefined;
  }
};

interface BuildPayloadParams {
  execution: AutoIssueExecutionInfo;
  results: IssueCreationResult[];
}

/**
 * auto-issueコマンドの結果からJSONペイロードを構築
 */
const buildAutoIssueJsonPayloadImpl = ({
  execution,
  results,
}: BuildPayloadParams): AutoIssueJsonOutput => {
  const issues: AutoIssueIssueEntry[] = results.map((result) => ({
    success: result.success,
    title: result.title ?? 'Unknown title',
    issueNumber: result.issueNumber,
    issueUrl: result.issueUrl,
    error: result.error,
    skippedReason: result.skippedReason,
  }));

  const summary = {
    total: results.length,
    success: results.filter((r) => r.success && !r.skippedReason).length,
    failed: results.filter((r) => !r.success).length,
    skipped: results.filter((r) => Boolean(r.skippedReason)).length,
  };

  return {
    execution,
    summary,
    issues,
  };
};

/**
 * JSONペイロードをファイルへ書き出し
 */
const writeAutoIssueOutputFileImpl = async (
  filePath: string,
  payload: AutoIssueJsonOutput,
): Promise<void> => {
  const directory = path.dirname(filePath);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, serialized, 'utf-8');
    logger.info(`Wrote auto-issue results to ${filePath}`);
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(`Failed to write auto-issue results to ${filePath}: ${message}`);
    throw new Error(`Failed to write auto-issue output file (${filePath}): ${message}`);
  }
};

const jestApi = resolveJestApi();
export const buildAutoIssueJsonPayload: typeof buildAutoIssueJsonPayloadImpl =
  jestApi?.fn ? jestApi.fn(buildAutoIssueJsonPayloadImpl) : buildAutoIssueJsonPayloadImpl;

export const writeAutoIssueOutputFile: typeof writeAutoIssueOutputFileImpl =
  jestApi?.fn ? jestApi.fn(writeAutoIssueOutputFileImpl) : writeAutoIssueOutputFileImpl;
