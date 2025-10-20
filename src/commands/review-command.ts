import path from 'node:path';
import process from 'node:process';
import fs from 'fs-extra';

import { WorkflowState } from '../core/workflow-state.js';
import { PhaseName } from '../types.js';
import { getRepoRoot } from '../utils/repo-resolver.js';

/**
 * review コマンドのハンドラ
 *
 * 指定されたフェーズの状態を確認します。
 *
 * @param options - Commander から渡されるオプション
 * @throws エラー時は process.exit(1) で終了
 */
export async function handleReviewCommand(options: any): Promise<void> {
  const repoRoot = await getRepoRoot();
  const metadataPath = path.join(repoRoot, '.ai-workflow', `issue-${options.issue}`, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    console.error('Error: Workflow not found.');
    process.exit(1);
  }

  const metadata = WorkflowState.load(metadataPath);
  const phaseName = options.phase as PhaseName;
  if (!metadata.data.phases[phaseName]) {
    console.error(`Error: Unknown phase "${phaseName}".`);
    process.exit(1);
  }

  console.info(`[OK] Phase ${phaseName} status: ${metadata.getPhaseStatus(phaseName)}`);
}
