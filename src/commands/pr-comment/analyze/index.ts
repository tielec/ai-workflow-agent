export * from './comment-fetcher.js';
export * from './comment-formatter.js';
export * from './prompt-builder.js';
export * from './response-parser.js';
export * from './response-normalizer.js';
export * from './error-handlers.js';
export * from './markdown-builder.js';
export * from './git-operations.js';
export * from './analyze-runner.js';
export * from './agent-utils.js';
export * from './response-plan-loader.js';

import {
  fetchLatestUnresolvedComments,
  refreshComments,
} from './comment-fetcher.js';
import {
  formatThreadBlock,
  getAllThreadComments,
  groupCommentsByThread,
} from './comment-formatter.js';
import {
  findAllJsonObjectBoundaries,
  parseResponsePlan,
} from './response-parser.js';
import {
  isValidResponsePlanCandidate,
  normalizePlanComment,
  validateProposedChanges,
} from './response-normalizer.js';
import { buildResponsePlanMarkdown } from './markdown-builder.js';

export const __testables = {
  parseResponsePlan,
  findAllJsonObjectBoundaries,
  isValidResponsePlanCandidate,
  normalizePlanComment,
  validateProposedChanges,
  buildResponsePlanMarkdown,
  refreshComments,
  fetchLatestUnresolvedComments,
  groupCommentsByThread,
  getAllThreadComments,
  formatThreadBlock,
};
