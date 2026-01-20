import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../../utils/logger.js';
import { config } from '../../../core/config.js';

let gitConfigured = false; // Git設定済みフラグ

export async function commitIfNeeded(repoRoot: string, message: string): Promise<void> {
  const git = simpleGit(repoRoot);
  const status = await git.status();
  if (status.files.length === 0) {
    return;
  }

  // Git設定（初回のみ）
  if (!gitConfigured) {
    const gitUserName =
      (typeof config.getGitCommitUserName === 'function' && config.getGitCommitUserName()) ||
      process.env.GIT_COMMIT_USER_NAME ||
      process.env.GIT_AUTHOR_NAME ||
      'AI Workflow Bot';
    const gitUserEmail =
      (typeof config.getGitCommitUserEmail === 'function' && config.getGitCommitUserEmail()) ||
      process.env.GIT_COMMIT_USER_EMAIL ||
      process.env.GIT_AUTHOR_EMAIL ||
      'ai-workflow@example.com';

    logger.debug(`Configuring Git user: ${gitUserName} <${gitUserEmail}>`);
    await git.addConfig('user.name', gitUserName);
    await git.addConfig('user.email', gitUserEmail);
    gitConfigured = true;
  }

  await git.add(status.files.map((f) => f.path));
  await git.commit(message);
  logger.info('Changes committed. (Push not executed)');
}
