import process from 'node:process';
import readline from 'node:readline';
import { logger } from '../../../utils/logger.js';
import { config } from '../../../core/config.js';
import type { PRCommentMetadataManager } from '../../../core/pr-comment/metadata-manager.js';
import type {
  AnalyzerErrorType,
  CommentMetadata,
  ResponsePlan,
} from '../../../types/pr-comment.js';
import { buildFallbackPlan } from './markdown-builder.js';

export async function promptUserConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function handleAgentError(
  errorMessage: string,
  errorType: AnalyzerErrorType,
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  logger.error(`Analyze phase failed: ${errorMessage}`);

  if (persistMetadata) {
    await metadataManager.setAnalyzerError(errorMessage, errorType);
  }

  if (config.isCI()) {
    logger.error('CI environment detected. Exiting with error.');
    process.exit(1);
  }

  logger.warn(`[WARNING] Analyze phase failed: ${errorMessage}`);
  logger.warn('');
  logger.warn('A fallback plan has been generated (all comments marked as "discussion").');
  logger.warn('This may result in inaccurate processing.');
  logger.warn('');

  const proceed = await promptUserConfirmation('Do you want to continue with the fallback plan?');

  if (!proceed) {
    logger.info('User cancelled workflow due to analyze failure.');
    process.exit(1);
  }

  logger.info('Continuing with fallback plan...');

  return buildFallbackPlan(prNumber, comments);
}

export async function handleEmptyOutputError(
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  return handleAgentError(
    'Agent returned empty output',
    'agent_empty_output',
    metadataManager,
    prNumber,
    comments,
    persistMetadata,
  );
}

export async function handleParseError(
  parseError: Error,
  metadataManager: PRCommentMetadataManager,
  prNumber: number,
  comments: CommentMetadata[],
  persistMetadata: boolean,
): Promise<ResponsePlan | null> {
  const errorMessage = `JSON parsing failed: ${parseError.message}`;
  return handleAgentError(
    errorMessage,
    'json_parse_error',
    metadataManager,
    prNumber,
    comments,
    persistMetadata,
  );
}
