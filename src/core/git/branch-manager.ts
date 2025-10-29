import type { SimpleGit } from 'simple-git';
import { logger } from '../utils/logger.js';

interface BranchResult {
  success: boolean;
  branch_name: string;
  error?: string | null;
}

/**
 * BranchManager - Specialized manager for Git branch operations
 *
 * Responsibilities:
 * - Branch creation
 * - Branch existence checking (local and remote)
 * - Get current branch
 * - Branch switching
 */
export class BranchManager {
  private readonly git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * Create a new branch
   */
  public async createBranch(
    branchName: string,
    baseBranch?: string,
  ): Promise<BranchResult> {
    if (await this.branchExists(branchName)) {
      const message = `Branch ${branchName} already exists`;
      console.warn(message);
      return {
        success: false,
        branch_name: branchName,
        error: message,
      };
    }

    try {
      if (baseBranch) {
        await this.git.checkout(baseBranch);
      }

      await this.git.checkoutLocalBranch(branchName);
      return {
        success: true,
        branch_name: branchName,
      };
    } catch (error) {
      return {
        success: false,
        branch_name: branchName,
        error: `Git command failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check if a branch exists (local or remote)
   */
  public async branchExists(
    branchName: string,
    checkRemote = true,
  ): Promise<boolean> {
    try {
      const localBranches = await this.git.branchLocal();
      if (localBranches.all.includes(branchName)) {
        return true;
      }

      if (checkRemote) {
        const remoteBranches = await this.git.branch([
          '--remotes',
          `origin/${branchName}`,
        ]);
        return remoteBranches.all.some((ref) => ref.endsWith(branchName));
      }
    } catch (error) {
      console.warn(`[WARN] Failed to check branch existence: ${(error as Error).message}`);
    }

    return false;
  }

  /**
   * Get current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      return result.trim();
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Switch to a different branch
   */
  public async switchBranch(branchName: string): Promise<BranchResult> {
    try {
      await this.git.checkout(branchName);
      return {
        success: true,
        branch_name: branchName,
      };
    } catch (error) {
      return {
        success: false,
        branch_name: branchName,
        error: `Git command failed: ${(error as Error).message}`,
      };
    }
  }
}
