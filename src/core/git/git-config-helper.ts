import type { SimpleGit } from 'simple-git';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import { getErrorMessage } from '../../utils/error-utils.js';

export const DEFAULT_GIT_USER_NAME = 'AI Workflow';
export const DEFAULT_GIT_USER_EMAIL = 'ai-workflow@tielec.local';

export async function ensureGitUserConfig(git: SimpleGit): Promise<void> {
  try {
    let userNameFromConfig: string | undefined;
    let userEmailFromConfig: string | undefined;

    try {
      const gitConfig = await git.listConfig();
      userNameFromConfig = gitConfig.all['user.name'] as string | undefined;
      userEmailFromConfig = gitConfig.all['user.email'] as string | undefined;
    } catch (error: unknown) {
      logger.warn(`Failed to read git config: ${getErrorMessage(error)}`);
    }

    let userName: string =
      userNameFromConfig ||
      config.getGitCommitUserName() ||
      DEFAULT_GIT_USER_NAME;

    let userEmail: string =
      userEmailFromConfig ||
      config.getGitCommitUserEmail() ||
      DEFAULT_GIT_USER_EMAIL;

    if (userName.length < 1 || userName.length > 100) {
      logger.warn(
        `User name length is invalid (${userName.length} chars), using default`,
      );
      userName = DEFAULT_GIT_USER_NAME;
    }

    if (!userEmail.includes('@')) {
      logger.warn(
        `Invalid email format: ${userEmail}, using default`,
      );
      userEmail = DEFAULT_GIT_USER_EMAIL;
    }

    await git.addConfig('user.name', userName, false, 'local');
    await git.addConfig('user.email', userEmail, false, 'local');

    logger.info(
      `Git config ensured: user.name=${userName}, user.email=${userEmail}`,
    );
  } catch (error: unknown) {
    logger.warn(`Failed to ensure git config: ${getErrorMessage(error)}`);
  }
}
