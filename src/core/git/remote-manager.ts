import { setTimeout as delay } from 'node:timers/promises';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import type { SimpleGit, PushResult } from 'simple-git';
import type { MetadataManager } from '../metadata-manager.js';

interface PushSummary {
  success: boolean;
  retries: number;
  error?: string;
}

/**
 * RemoteManager - Specialized manager for Git remote operations
 *
 * Responsibilities:
 * - Push to remote with retry logic
 * - Pull from remote
 * - GitHub credentials setup
 * - Retry error classification
 */
export class RemoteManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;

  constructor(git: SimpleGit, metadataManager: MetadataManager) {
    this.git = git;
    this.metadata = metadataManager;

    // Fire and forget setup of credentials (best-effort)
    this.setupGithubCredentials().catch((error) => {
      logger.warn(`Failed to set up GitHub credentials: ${(error as Error).message}`);
    });
  }

  /**
   * Push to remote with retry logic
   */
  public async pushToRemote(
    maxRetries = 3,
    retryDelay = 2000,
  ): Promise<PushSummary> {
    let retries = 0;
    const status = await this.git.status();
    const branchName =
      status.current ?? this.metadata.data.branch_name ?? null;
    const needsUpstream = !status.tracking;

    logger.debug(`Push to remote: branch=${branchName}, needsUpstream=${needsUpstream}, ahead=${status.ahead}, behind=${status.behind}`);

    while (retries <= maxRetries) {
      try {
        if (!branchName) {
          throw new Error('Unable to determine current branch name');
        }

        if (needsUpstream && retries === 0) {
          logger.debug(`Setting upstream and pushing to origin/${branchName}`);
          const pushResult = await this.git.raw(['push', '--set-upstream', 'origin', branchName]);
          logger.debug(`Push --set-upstream result: ${pushResult}`);
          return { success: true, retries };
        }

        logger.debug(`Pushing to origin/${branchName}...`);
        const result = (await this.git.push(
          'origin',
          branchName,
        )) as PushResult;

        logger.debug(`Push result: pushed=${result.pushed?.length ?? 0}, remoteMessages=${JSON.stringify(result.remoteMessages ?? {})}`);

        if (result.pushed?.length || result.remoteMessages?.all?.length) {
          logger.debug('Push completed successfully with changes');
          return { success: true, retries };
        }

        logger.warn('Push completed but no changes were pushed. This may indicate nothing to push.');
        return { success: true, retries };
      } catch (error) {
        logger.error(`Push failed: ${(error as Error).message}`);

        if (!branchName) {
          return {
            success: false,
            retries,
            error: `Unable to determine branch name for push: ${(error as Error).message}`,
          };
        }

        const errorMessage = (error as Error).message.toLowerCase();

        // non-fast-forward error: pull and retry
        if ((errorMessage.includes('rejected') || errorMessage.includes('non-fast-forward')) && retries === 0) {
          logger.warn('Push rejected (non-fast-forward). Pulling remote changes...');
          const pullResult = await this.pullLatest(branchName);
          if (!pullResult.success) {
            logger.error(`Failed to pull: ${pullResult.error}`);
            return {
              success: false,
              retries,
              error: `Failed to pull remote changes: ${pullResult.error}`,
            };
          }
          logger.info('Pull successful. Retrying push...');
          retries += 1;
          continue; // Retry push
        }

        if (!this.isRetriableError(error) || retries === maxRetries) {
          logger.error(`Push failed permanently: ${(error as Error).message}`);
          return {
            success: false,
            retries,
            error: (error as Error).message,
          };
        }

        logger.warn(`Retriable error, retrying (${retries + 1}/${maxRetries})...`);
        retries += 1;
        await delay(retryDelay);
      }
    }

    return { success: false, retries: maxRetries, error: 'Unknown push failure' };
  }

  /**
   * Pull latest changes from remote
   */
  public async pullLatest(
    branchName?: string,
  ): Promise<{ success: boolean; error?: string | null }> {
    try {
      const targetBranch = branchName ?? (await this.getCurrentBranch());
      // Use explicit merge strategy for divergent branches
      await this.git.raw(['pull', '--no-rebase', 'origin', targetBranch]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message ?? 'Unknown git pull error',
      };
    }
  }

  /**
   * Get current branch name
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      return result.trim();
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Determine if error is retriable
   */
  private isRetriableError(error: unknown): boolean {
    const message = (error as Error).message.toLowerCase();

    const nonRetriableKeywords = [
      'permission denied',
      'authentication failed',
      'could not read from remote repository',
      'does not appear to be a git repository',
      'fatal: unable to access',
    ];

    if (nonRetriableKeywords.some((keyword) => message.includes(keyword))) {
      return false;
    }

    const retriableKeywords = [
      'timeout',
      'connection refused',
      'network is unreachable',
      'temporary failure',
    ];

    if (retriableKeywords.some((keyword) => message.includes(keyword))) {
      return true;
    }

    return true;
  }

  /**
   * Setup GitHub credentials (best-effort)
   */
  private async setupGithubCredentials(): Promise<void> {
    let githubToken: string;
    try {
      githubToken = config.getGitHubToken();
    } catch {
      return;
    }

    try {
      const remoteResult = await this.git.remote(['get-url', 'origin']);
      const currentUrl =
        typeof remoteResult === 'string'
          ? remoteResult.trim()
          : Array.isArray(remoteResult)
            ? remoteResult.join('').trim()
            : String(remoteResult ?? '').trim();

      if (!currentUrl.startsWith('https://github.com/')) {
        logger.info(
          `Git remote URL is not HTTPS, skipping token configuration: ${currentUrl}`,
        );
        return;
      }

      const path = currentUrl.replace('https://github.com/', '');
      const newUrl = `https://${githubToken}@github.com/${path}`;

      await this.git.remote(['set-url', 'origin', newUrl]);
      logger.info('Git remote URL configured with GitHub token authentication');
    } catch (error) {
      logger.warn(
        `Failed to setup GitHub credentials: ${(error as Error).message}`,
      );
    }
  }
}
