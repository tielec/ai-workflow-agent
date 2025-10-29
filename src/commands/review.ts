import path from 'node:path';
import { logger } from '../utils/logger.js';
import process from 'node:process';
import fs from 'fs-extra';

import { WorkflowState } from '../core/workflow-state.js';
import { getRepoRoot } from '../core/repository-utils.js';
import type { PhaseName } from '../types.js';

/**
 * フェーズレビューコマンドハンドラ
 * @param options - CLI オプション
 */
export async function handleReviewCommand(options: any): Promise<void> {
  const repoRoot = await getRepoRoot();
  const metadataPath = path.join(
    repoRoot,
    '.ai-workflow',
    `issue-${options.issue}`,
    'metadata.json',
  );

  if (!fs.existsSync(metadataPath)) {
    logger.error('Error: Workflow not found.');
    process.exit(1);
  }

  const metadata = WorkflowState.load(metadataPath);
  const phaseName = options.phase as PhaseName;
  if (!metadata.data.phases[phaseName]) {
    logger.error(`Error: Unknown phase "${phaseName}".`);
    process.exit(1);
  }

  logger.info(`Phase ${phaseName} status: ${metadata.getPhaseStatus(phaseName)}`);
}
