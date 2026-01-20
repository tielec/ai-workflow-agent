import { promises as fsp } from 'node:fs';
import { logger } from '../../../utils/logger.js';
import { getErrorMessage } from '../../../utils/error-utils.js';
import type {
  CommentMetadata,
  ResponsePlan,
} from '../../../types/pr-comment.js';
import type { PRCommentMetadataManager } from '../../../core/pr-comment/metadata-manager.js';
import { handleParseError } from './error-handlers.js';
import { normalizeResponsePlan } from './response-normalizer.js';
import { parseResponsePlan } from './response-parser.js';

type ResolvePlanParams = {
  rawOutput: string;
  prNumber: number;
  outputFilePath: string;
  metadataManager: PRCommentMetadataManager;
  comments: CommentMetadata[];
  persistMetadata: boolean;
};

export async function resolveResponsePlan({
  rawOutput,
  prNumber,
  outputFilePath,
  metadataManager,
  comments,
  persistMetadata,
}: ResolvePlanParams): Promise<ResponsePlan> {
  const parseFromRawOutput = async (): Promise<ResponsePlan> => {
    try {
      return parseResponsePlan(rawOutput, prNumber);
    } catch (parseError) {
      const fallbackPlan = await handleParseError(
        parseError as Error,
        metadataManager,
        prNumber,
        comments,
        persistMetadata,
      );

      if (fallbackPlan) {
        return fallbackPlan;
      }

      throw new Error('Unexpected state: parse error handler did not exit or return fallback plan');
    }
  };

  let outputFileExists = false;
  try {
    await fsp.access(outputFilePath);
    outputFileExists = true;
  } catch {
    outputFileExists = false;
  }

  if (outputFileExists) {
    try {
      const fileContent = await fsp.readFile(outputFilePath, 'utf-8');
      const parsedPlan = JSON.parse(fileContent) as ResponsePlan;
      const missingPrNumber = parsedPlan.pr_number === undefined || parsedPlan.pr_number === null;
      const plan = normalizeResponsePlan(parsedPlan, prNumber);
      if (missingPrNumber) {
        await fsp.writeFile(outputFilePath, JSON.stringify(plan, null, 2), 'utf-8');
      }
      logger.info(`Reading response plan from file: ${outputFilePath}`);
      return plan;
    } catch (fileError) {
      logger.warn(`Failed to parse JSON from file: ${getErrorMessage(fileError)}`);
      logger.warn('Falling back to raw output parsing.');
      return parseFromRawOutput();
    }
  }

  logger.warn('Output file not found. Falling back to raw output parsing.');
  return parseFromRawOutput();
}
