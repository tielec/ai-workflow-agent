import fs from 'fs-extra';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import simpleGit, {
  BranchSummary,
  PushResult,
  SimpleGit,
  StatusResult,
} from 'simple-git';
import { minimatch } from 'minimatch';
import { MetadataManager } from './metadata-manager.js';
import { PhaseName, StepName } from '../types.js';

interface CommitResult {
  success: boolean;
  commit_hash: string | null;
  files_committed: string[];
  error?: string | null;
}

interface PushSummary {
  success: boolean;
  retries: number;
  error?: string;
}

interface BranchResult {
  success: boolean;
  branch_name: string;
  error?: string | null;
}

interface StatusSummary {
  branch: string;
  is_dirty: boolean;
  untracked_files: string[];
  modified_files: string[];
}

export class GitManager {
  private readonly repoPath: string;
  private readonly metadata: MetadataManager;
  private readonly config: Record<string, unknown>;
  private readonly git: SimpleGit;

  constructor(
    repoPath: string,
    metadataManager: MetadataManager,
    config: Record<string, unknown> = {},
  ) {
    this.repoPath = repoPath;
    this.metadata = metadataManager;
    this.config = config;
    this.git = simpleGit({ baseDir: repoPath });

    // Fire and forget setup of credentials (best-effort).
    this.setupGithubCredentials().catch((error) => {
      console.warn(`[WARN] Failed to set up GitHub credentials: ${(error as Error).message}`);
    });
  }

  public async commitPhaseOutput(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): Promise<CommitResult> {
    const issueNumber = this.metadata.data.issue_number;
    if (!issueNumber) {
      return {
        success: false,
        commit_hash: null,
        files_committed: [],
        error: 'Issue number not found in metadata',
      };
    }

    const changedFiles = await this.getChangedFiles();
    console.info(`[DEBUG] Git status detected ${changedFiles.length} changed files`);
    if (changedFiles.length > 0) {
      console.info(`[DEBUG] Changed files: ${changedFiles.slice(0, 5).join(', ')}${changedFiles.length > 5 ? '...' : ''}`);
    }

    const targetFiles = new Set(
      this.filterPhaseFiles(changedFiles, issueNumber),
    );

    const phaseSpecific = await this.getPhaseSpecificFiles(phaseName);
    phaseSpecific.forEach((file) => targetFiles.add(file));

    console.info(`[DEBUG] Target files for commit: ${targetFiles.size} files`);
    if (targetFiles.size > 0) {
      console.info(`[DEBUG] Files to commit: ${Array.from(targetFiles).slice(0, 5).join(', ')}${targetFiles.size > 5 ? '...' : ''}`);
    }

    if (targetFiles.size === 0) {
      console.warn('[WARNING] No files to commit. This may indicate that files were not staged correctly.');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    const filesToCommit = Array.from(targetFiles);
    await this.git.add(filesToCommit);
    await this.ensureGitConfig();

    const commitMessage = this.createCommitMessage(
      phaseName,
      status,
      reviewResult,
    );

    try {
      const commitResponse = await this.git.commit(commitMessage, filesToCommit, {
        '--no-verify': null,
      });

      console.info(`[DEBUG] Commit created: ${commitResponse.commit ?? 'unknown'}`);
      console.info(`[DEBUG] Commit summary: ${commitResponse.summary?.changes ?? 0} changes, ${commitResponse.summary?.insertions ?? 0} insertions, ${commitResponse.summary?.deletions ?? 0} deletions`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: filesToCommit,
      };
    } catch (error) {
      console.error(`[ERROR] Git commit failed: ${(error as Error).message}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: filesToCommit,
        error: `Git commit failed: ${(error as Error).message}`,
      };
    }
  }

  public async pushToRemote(
    maxRetries = 3,
    retryDelay = 2000,
  ): Promise<PushSummary> {
    let retries = 0;
    const status = await this.git.status();
    const branchName =
      status.current ?? this.metadata.data.branch_name ?? null;
    const needsUpstream = !status.tracking;

    console.info(`[DEBUG] Push to remote: branch=${branchName}, needsUpstream=${needsUpstream}, ahead=${status.ahead}, behind=${status.behind}`);

    while (retries <= maxRetries) {
      try {
        if (!branchName) {
          throw new Error('Unable to determine current branch name');
        }

        if (needsUpstream && retries === 0) {
          console.info(`[DEBUG] Setting upstream and pushing to origin/${branchName}`);
          const pushResult = await this.git.raw(['push', '--set-upstream', 'origin', branchName]);
          console.info(`[DEBUG] Push --set-upstream result: ${pushResult}`);
          return { success: true, retries };
        }

        console.info(`[DEBUG] Pushing to origin/${branchName}...`);
        const result = (await this.git.push(
          'origin',
          branchName,
        )) as PushResult;

        console.info(`[DEBUG] Push result: pushed=${result.pushed?.length ?? 0}, remoteMessages=${JSON.stringify(result.remoteMessages ?? {})}`);

        if (result.pushed?.length || result.remoteMessages?.all?.length) {
          console.info('[DEBUG] Push completed successfully with changes');
          return { success: true, retries };
        }

        console.warn('[WARNING] Push completed but no changes were pushed. This may indicate nothing to push.');
        return { success: true, retries };
      } catch (error) {
        console.error(`[ERROR] Push failed: ${(error as Error).message}`);

        if (!branchName) {
          return {
            success: false,
            retries,
            error: `Unable to determine branch name for push: ${(error as Error).message}`,
          };
        }

        const errorMessage = (error as Error).message.toLowerCase();

        // non-fast-forwardエラーの場合、pullしてから再試行
        if ((errorMessage.includes('rejected') || errorMessage.includes('non-fast-forward')) && retries === 0) {
          console.warn('[WARNING] Push rejected (non-fast-forward). Pulling remote changes...');
          const pullResult = await this.pullLatest(branchName);
          if (!pullResult.success) {
            console.error(`[ERROR] Failed to pull: ${pullResult.error}`);
            return {
              success: false,
              retries,
              error: `Failed to pull remote changes: ${pullResult.error}`,
            };
          }
          console.info('[INFO] Pull successful. Retrying push...');
          retries += 1;
          continue; // 再度pushを試行
        }

        if (!this.isRetriableError(error) || retries === maxRetries) {
          console.error(`[ERROR] Push failed permanently: ${(error as Error).message}`);
          return {
            success: false,
            retries,
            error: (error as Error).message,
          };
        }

        console.warn(`[WARNING] Retriable error, retrying (${retries + 1}/${maxRetries})...`);
        retries += 1;
        await delay(retryDelay);
      }
    }

    return { success: false, retries: maxRetries, error: 'Unknown push failure' };
  }

  /**
   * Issue #10: ステップ単位のGitコミットを実行
   */
  public async commitStepOutput(
    phaseName: PhaseName,
    phaseNumber: number,
    step: StepName,
    issueNumber: number,
    workingDir: string,
  ): Promise<CommitResult> {
    const message = this.buildStepCommitMessage(
      phaseName,
      phaseNumber,
      step,
      issueNumber,
    );

    const changedFiles = await this.getChangedFiles();
    const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

    if (targetFiles.length === 0) {
      console.warn(`[WARNING] No files to commit for step: ${step}`);
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    await this.git.add(targetFiles);
    await this.ensureGitConfig();

    try {
      const commitResponse = await this.git.commit(message, targetFiles, {
        '--no-verify': null,
      });

      console.info(`[INFO] Step commit created: ${commitResponse.commit ?? 'unknown'}`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: targetFiles,
      };
    } catch (error) {
      console.error(`[ERROR] Step commit failed: ${(error as Error).message}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: targetFiles,
        error: `Step commit failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Issue #10: ステップ用のコミットメッセージを生成
   */
  private buildStepCommitMessage(
    phaseName: string,
    phaseNumber: number,
    step: string,
    issueNumber: number,
  ): string {
    return [
      `[ai-workflow] Phase ${phaseNumber} (${phaseName}) - ${step} completed`,
      '',
      `Issue: #${issueNumber}`,
      `Phase: ${phaseNumber} (${phaseName})`,
      `Step: ${step}`,
      `Status: completed`,
      '',
      'Auto-generated by AI Workflow',
    ].join('\n');
  }

  public createCommitMessage(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): string {
    const phaseOrder: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    const phaseNumber = phaseOrder.indexOf(phaseName) + 1;
    const issueNumber = this.metadata.data.issue_number;
    const review = reviewResult ?? 'N/A';

    return [
      `[ai-workflow] Phase ${phaseNumber} (${phaseName}) - ${status}`,
      '',
      `Issue: #${issueNumber}`,
      `Phase: ${phaseNumber} (${phaseName})`,
      `Status: ${status}`,
      `Review: ${review}`,
      '',
      'Auto-generated by AI Workflow',
    ].join('\n');
  }

  public async getStatus(): Promise<StatusSummary> {
    const status = await this.git.status();
    return {
      branch: status.current ?? 'HEAD',
      is_dirty: status.files.length > 0,
      untracked_files: status.not_added,
      modified_files: status.modified,
    };
  }

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

  public async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      return result.trim();
    } catch {
      return 'HEAD';
    }
  }

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

  public async pullLatest(
    branchName?: string,
  ): Promise<{ success: boolean; error?: string | null }> {
    try {
      const targetBranch = branchName ?? (await this.getCurrentBranch());
      // divergent branchesに対応するため、明示的にmerge戦略を指定
      await this.git.raw(['pull', '--no-rebase', 'origin', targetBranch]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message ?? 'Unknown git pull error',
      };
    }
  }

  private async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    const aggregated = new Set<string>();

    const collect = (paths: string[] | undefined) => {
      paths?.forEach((file) => {
        if (!file.includes('@tmp')) {
          aggregated.add(file);
        }
      });
    };

    collect(status.not_added);
    collect(status.created);
    collect(status.deleted);
    collect(status.modified);
    collect(status.renamed?.map((entry) => entry.to));
    collect(status.staged);

    status.files.forEach((file) => aggregated.add(file.path));

    return Array.from(aggregated);
  }

  private filterPhaseFiles(files: string[], issueNumber: string): string[] {
    const targetPrefix = `.ai-workflow/issue-${issueNumber}/`;
    const result: string[] = [];

    for (const file of files) {
      if (file.includes('@tmp')) {
        continue;
      }

      if (file.startsWith(targetPrefix)) {
        result.push(file);
      } else if (file.startsWith('.ai-workflow/')) {
        continue;
      } else {
        result.push(file);
      }
    }

    return result;
  }

  private async getPhaseSpecificFiles(phaseName: PhaseName): Promise<string[]> {
    switch (phaseName) {
      case 'implementation':
        return this.scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins']);
      case 'test_implementation':
        return this.scanByPatterns([
          'test_*.py',
          '*_test.py',
          '*.test.js',
          '*.spec.js',
          '*.test.ts',
          '*.spec.ts',
          '*_test.go',
          'Test*.java',
          '*Test.java',
          'test_*.sh',
        ]);
      case 'documentation':
        return this.scanByPatterns(['*.md', '*.MD']);
      default:
        return [];
    }
  }

  private async scanDirectories(directories: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results: string[] = [];

    for (const dir of directories) {
      const prefix = `${dir}/`;
      changedFiles.forEach((file) => {
        if (file.startsWith(prefix) && !file.includes('@tmp')) {
          results.push(file);
        }
      });
    }

    return results;
  }

  private async scanByPatterns(patterns: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results = new Set<string>();

    changedFiles.forEach((file) => {
      if (file.includes('@tmp')) {
        return;
      }

      for (const pattern of patterns) {
        if (
          minimatch(file, pattern, { dot: true }) ||
          minimatch(file, `**/${pattern}`, { dot: true })
        ) {
          results.add(file);
          break;
        }
      }
    });

    return Array.from(results);
  }

  private async ensureGitConfig(): Promise<void> {
    const gitConfig = await this.git.listConfig();
    let userName = gitConfig.all['user.name'] as string | undefined;
    let userEmail = gitConfig.all['user.email'] as string | undefined;

    userName =
      userName ||
      process.env.GIT_COMMIT_USER_NAME ||
      process.env.GIT_AUTHOR_NAME ||
      'AI Workflow';

    userEmail =
      userEmail ||
      process.env.GIT_COMMIT_USER_EMAIL ||
      process.env.GIT_AUTHOR_EMAIL ||
      'ai-workflow@tielec.local';

    if (userName.length < 1 || userName.length > 100) {
      console.warn(
        `[WARN] User name length is invalid (${userName.length} chars), using default`,
      );
      userName = 'AI Workflow';
    }

    if (!userEmail.includes('@')) {
      console.warn(
        `[WARN] Invalid email format: ${userEmail}, using default`,
      );
      userEmail = 'ai-workflow@tielec.local';
    }

    await this.git.addConfig('user.name', userName, false, 'local');
    await this.git.addConfig('user.email', userEmail, false, 'local');

    console.info(
      `[INFO] Git config ensured: user.name=${userName}, user.email=${userEmail}`,
    );
  }

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

  private async setupGithubCredentials(): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
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
        console.info(
          `[INFO] Git remote URL is not HTTPS, skipping token configuration: ${currentUrl}`,
        );
        return;
      }

      const path = currentUrl.replace('https://github.com/', '');
      const newUrl = `https://${githubToken}@github.com/${path}`;

      await this.git.remote(['set-url', 'origin', newUrl]);
      console.info('[INFO] Git remote URL configured with GitHub token authentication');
    } catch (error) {
      console.warn(
        `[WARNING] Failed to setup GitHub credentials: ${(error as Error).message}`,
      );
    }
  }
}
