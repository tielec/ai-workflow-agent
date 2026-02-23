import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import type { SimpleGit } from 'simple-git';

const DEFAULT_USER_NAME = 'AI Workflow';
const DEFAULT_USER_EMAIL = 'ai-workflow@tielec.local';

/**
 * Ensure git config (user.name and user.email) are set.
 *
 * Extracted from CommitManager.ensureGitConfig() for reuse across commands.
 */
export async function ensureGitConfig(git: SimpleGit): Promise<void> {
  if (typeof git.listConfig !== 'function') {
    logger.warn('Git client does not support listConfig; using defaults.');
    await setDefaultGitConfig(git, DEFAULT_USER_NAME, DEFAULT_USER_EMAIL);
    return;
  }

  const gitConfig = await git.listConfig();
  const userNameFromConfig = gitConfig.all['user.name'] as string | undefined;
  const userEmailFromConfig = gitConfig.all['user.email'] as string | undefined;

  let userName: string =
    userNameFromConfig ||
    config.getGitCommitUserName() ||
    DEFAULT_USER_NAME;

  let userEmail: string =
    userEmailFromConfig ||
    config.getGitCommitUserEmail() ||
    DEFAULT_USER_EMAIL;

  if (userName.length < 1 || userName.length > 100) {
    logger.warn(
      `User name length is invalid (${userName.length} chars), using default`,
    );
    userName = DEFAULT_USER_NAME;
  }

  if (!userEmail.includes('@')) {
    logger.warn(
      `Invalid email format: ${userEmail}, using default`,
    );
    userEmail = DEFAULT_USER_EMAIL;
  }

  await setDefaultGitConfig(git, userName, userEmail);

  logger.info(
    `Git config ensured: user.name=${userName}, user.email=${userEmail}`,
  );
}

async function setDefaultGitConfig(
  git: SimpleGit,
  userName: string,
  userEmail: string,
): Promise<void> {
  if (typeof git.addConfig !== 'function') {
    logger.warn('Git client does not support addConfig; skipping git config setup.');
    return;
  }

  await git.addConfig('user.name', userName, false, 'local');
  await git.addConfig('user.email', userEmail, false, 'local');
}
