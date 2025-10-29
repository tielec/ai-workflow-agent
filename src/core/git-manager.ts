import simpleGit, { SimpleGit } from 'simple-git';
import { logger } from '../utils/logger.js';
import { MetadataManager } from './metadata-manager.js';
import { PhaseName, StepName } from '../types.js';
import { SecretMasker } from './secret-masker.js';
import { CommitManager } from './git/commit-manager.js';
import { BranchManager } from './git/branch-manager.js';
import { RemoteManager } from './git/remote-manager.js';

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

/**
 * GitManager - Facade for Git operations
 *
 * Delegates operations to specialized managers:
 * - CommitManager: Commit operations and message generation
 * - BranchManager: Branch lifecycle management
 * - RemoteManager: Remote synchronization and network operations
 */
export class GitManager {
  private readonly repoPath: string;
  private readonly metadata: MetadataManager;
  private readonly config: Record<string, unknown>;
  private readonly git: SimpleGit;
  private readonly commitManager: CommitManager;
  private readonly branchManager: BranchManager;
  private readonly remoteManager: RemoteManager;

  constructor(
    repoPath: string,
    metadataManager: MetadataManager,
    config: Record<string, unknown> = {},
  ) {
    this.repoPath = repoPath;
    this.metadata = metadataManager;
    this.config = config;

    // Create shared simple-git instance
    this.git = simpleGit({ baseDir: repoPath });

    // Initialize specialized managers with dependency injection
    const secretMasker = new SecretMasker();
    this.commitManager = new CommitManager(
      this.git,
      metadataManager,
      secretMasker,
      repoPath,
    );
    this.branchManager = new BranchManager(this.git);
    this.remoteManager = new RemoteManager(this.git, metadataManager);
  }

  // Commit operations delegation
  public async commitPhaseOutput(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): Promise<CommitResult> {
    return this.commitManager.commitPhaseOutput(phaseName, status, reviewResult);
  }

  public async pushToRemote(
    maxRetries = 3,
    retryDelay = 2000,
  ): Promise<PushSummary> {
    return this.remoteManager.pushToRemote(maxRetries, retryDelay);
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
    return this.commitManager.commitStepOutput(
      phaseName,
      phaseNumber,
      step,
      issueNumber,
      workingDir,
    );
  }

  /**
   * Issue #16: ワークフロー初期化用のコミットを作成
   */
  public async commitWorkflowInit(
    issueNumber: number,
    branchName: string,
  ): Promise<CommitResult> {
    return this.commitManager.commitWorkflowInit(issueNumber, branchName);
  }

  /**
   * Issue #16: ログクリーンアップ用のコミットを作成
   */
  public async commitCleanupLogs(
    issueNumber: number,
    phase: 'report' | 'evaluation',
  ): Promise<CommitResult> {
    return this.commitManager.commitCleanupLogs(issueNumber, phase);
  }

  public createCommitMessage(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): string {
    return this.commitManager.createCommitMessage(phaseName, status, reviewResult);
  }

  // Common operations (implemented in facade)
  public async getStatus(): Promise<StatusSummary> {
    const status = await this.git.status();
    return {
      branch: status.current ?? 'HEAD',
      is_dirty: status.files.length > 0,
      untracked_files: status.not_added,
      modified_files: status.modified,
    };
  }

  // Branch operations delegation
  public async createBranch(
    branchName: string,
    baseBranch?: string,
  ): Promise<BranchResult> {
    return this.branchManager.createBranch(branchName, baseBranch);
  }

  public async branchExists(
    branchName: string,
    checkRemote = true,
  ): Promise<boolean> {
    return this.branchManager.branchExists(branchName, checkRemote);
  }

  public async getCurrentBranch(): Promise<string> {
    return this.branchManager.getCurrentBranch();
  }

  public async switchBranch(branchName: string): Promise<BranchResult> {
    return this.branchManager.switchBranch(branchName);
  }

  // Remote operations delegation
  public async pullLatest(
    branchName?: string,
  ): Promise<{ success: boolean; error?: string | null }> {
    return this.remoteManager.pullLatest(branchName);
  }

}
