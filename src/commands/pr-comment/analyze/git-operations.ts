import simpleGit from 'simple-git';
import { logger } from '../../../utils/logger.js';
import { ensureGitConfig } from '../../../core/git/git-config-helper.js';

let gitConfigured = false; // Git設定済みフラグ

export async function commitIfNeeded(repoRoot: string, message: string): Promise<void> {
  const git = simpleGit(repoRoot);
  const status = await git.status();
  if (status.files.length === 0) {
    return;
  }

  // Git設定（初回のみ）
  if (!gitConfigured) {
    await ensureGitConfig(git);
    gitConfigured = true;
  }

  await git.add(status.files.map((f) => f.path));
  await git.commit(message);
  logger.info('Changes committed. (Push not executed)');
}
