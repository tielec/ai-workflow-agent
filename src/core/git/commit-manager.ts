import { join } from 'node:path';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { FileSelector } from './file-selector.js';
import { CommitMessageBuilder } from './commit-message-builder.js';
import type { SimpleGit } from 'simple-git';
import type { MetadataManager } from '../metadata-manager.js';
import type { SecretMasker } from '../secret-masker.js';
import type { PhaseName, StepName } from '../../types.js';

interface CommitResult {
  success: boolean;
  commit_hash: string | null;
  files_committed: string[];
  error?: string | null;
}

/**
 * CommitManager - Specialized manager for Git commit operations (Refactored)
 *
 * Responsibilities:
 * - Commit orchestration (delegating to FileSelector and CommitMessageBuilder)
 * - SecretMasker integration
 * - Git configuration management
 */
export class CommitManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;
  private readonly secretMasker: SecretMasker;
  private readonly repoPath: string;

  // Specialized modules
  private readonly fileSelector: FileSelector;
  private readonly messageBuilder: CommitMessageBuilder;

  constructor(
    git: SimpleGit,
    metadataManager: MetadataManager,
    secretMasker: SecretMasker,
    repoPath: string,
  ) {
    this.git = git;
    this.metadata = metadataManager;
    this.secretMasker = secretMasker;
    this.repoPath = repoPath;

    // Initialize specialized modules
    this.fileSelector = new FileSelector(git);
    this.messageBuilder = new CommitMessageBuilder(metadataManager);
  }

  /**
   * Commit phase output files
   */
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

    // 1. File selection (delegated to FileSelector)
    const changedFiles = await this.fileSelector.getChangedFiles();
    logger.debug(`Git status detected ${changedFiles.length} changed files`);
    if (changedFiles.length > 0) {
      logger.debug(`Changed files: ${changedFiles.slice(0, 5).join(', ')}${changedFiles.length > 5 ? '...' : ''}`);
    }

    const targetFiles = new Set(
      this.fileSelector.filterPhaseFiles(changedFiles, issueNumber),
    );

    const phaseSpecific = await this.fileSelector.getPhaseSpecificFiles(phaseName);
    phaseSpecific.forEach((file) => targetFiles.add(file));

    logger.debug(`Target files for commit: ${targetFiles.size} files`);
    if (targetFiles.size > 0) {
      logger.debug(`Files to commit: ${Array.from(targetFiles).slice(0, 5).join(', ')}${targetFiles.size > 5 ? '...' : ''}`);
    }

    if (targetFiles.size === 0) {
      logger.warn('No files to commit. This may indicate that files were not staged correctly.');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    const filesToCommit = Array.from(targetFiles);

    // 2. Secret masking
    const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
    try {
      const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
      if (maskingResult.filesProcessed > 0) {
        logger.info(
          `Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
        );
      }
      if (maskingResult.errors.length > 0) {
        logger.warn(
          `Secret masking encountered ${maskingResult.errors.length} error(s)`,
        );
      }
    } catch (error) {
      logger.error(`Secret masking failed: ${getErrorMessage(error)}`);
      // Continue with commit (don't block)
    }

    // 3. Git staging
    await this.git.add(filesToCommit);
    await this.ensureGitConfig();

    // 4. Commit message generation (delegated to CommitMessageBuilder)
    const commitMessage = this.messageBuilder.createCommitMessage(
      phaseName,
      status,
      reviewResult,
    );

    // 5. Commit execution
    try {
      const commitResponse = await this.git.commit(commitMessage, filesToCommit, {
        '--no-verify': null,
      });

      logger.debug(`Commit created: ${commitResponse.commit ?? 'unknown'}`);
      logger.debug(`Commit summary: ${commitResponse.summary?.changes ?? 0} changes, ${commitResponse.summary?.insertions ?? 0} insertions, ${commitResponse.summary?.deletions ?? 0} deletions`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: filesToCommit,
      };
    } catch (error) {
      logger.error(`Git commit failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: filesToCommit,
        error: `Git commit failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Issue #10: Commit step output files
   */
  public async commitStepOutput(
    phaseName: PhaseName,
    phaseNumber: number,
    step: StepName,
    issueNumber: number,
    workingDir: string,
  ): Promise<CommitResult> {
    // 1. File selection (delegated to FileSelector)
    const changedFiles = await this.fileSelector.getChangedFiles();
    const targetFiles = this.fileSelector.filterPhaseFiles(changedFiles, issueNumber.toString());

    if (targetFiles.length === 0) {
      logger.warn(`No files to commit for step: ${step}`);
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // 2. Secret masking
    const workflowDir = join(workingDir, '.ai-workflow', `issue-${issueNumber}`);
    try {
      const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
      if (maskingResult.filesProcessed > 0) {
        logger.info(
          `Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
        );
      }
      if (maskingResult.errors.length > 0) {
        logger.warn(
          `Secret masking encountered ${maskingResult.errors.length} error(s)`,
        );
      }
    } catch (error) {
      logger.error(`Secret masking failed: ${getErrorMessage(error)}`);
      // Continue with commit (don't block)
    }

    // 3. Git staging
    await this.git.add(targetFiles);
    await this.ensureGitConfig();

    // 4. Commit message generation (delegated to CommitMessageBuilder)
    const message = this.messageBuilder.buildStepCommitMessage(
      phaseName,
      phaseNumber,
      step,
      issueNumber,
    );

    // 5. Commit execution
    try {
      const commitResponse = await this.git.commit(message, targetFiles, {
        '--no-verify': null,
      });

      logger.info(`Step commit created: ${commitResponse.commit ?? 'unknown'}`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: targetFiles,
      };
    } catch (error) {
      logger.error(`Step commit failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: targetFiles,
        error: `Step commit failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Issue #16: Commit workflow initialization files
   */
  public async commitWorkflowInit(
    issueNumber: number,
    branchName: string,
  ): Promise<CommitResult> {
    // 1. File selection (delegated to FileSelector)
    const changedFiles = await this.fileSelector.getChangedFiles();
    const targetFiles = this.fileSelector.filterPhaseFiles(changedFiles, issueNumber.toString());

    // 2. No files to commit
    if (targetFiles.length === 0) {
      logger.warn('No files to commit for initialization');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // 3. Secret masking (Issue #54: Defense in Depth - Layer 2)
    const workflowDir = join(this.repoPath, '.ai-workflow', `issue-${issueNumber}`);
    try {
      const maskingResult = await this.secretMasker.maskSecretsInWorkflowDir(workflowDir);
      if (maskingResult.filesProcessed > 0) {
        logger.info(
          `Masked ${maskingResult.secretsMasked} secret(s) in ${maskingResult.filesProcessed} file(s)`,
        );
      }
      if (maskingResult.errors.length > 0) {
        logger.error(
          `Secret masking encountered ${maskingResult.errors.length} error(s)`,
        );
        throw new Error('Cannot commit metadata.json with unmasked secrets');
      }
    } catch (error) {
      logger.error(`Secret masking failed: ${getErrorMessage(error)}`);
      throw new Error('Cannot commit metadata.json with unmasked secrets');
    }

    // 4. Git staging
    await this.git.add(targetFiles);
    await this.ensureGitConfig();

    // 5. Commit message generation (delegated to CommitMessageBuilder)
    const message = this.messageBuilder.createInitCommitMessage(issueNumber, branchName);

    // 6. Commit execution
    try {
      const commitResponse = await this.git.commit(message, targetFiles, {
        '--no-verify': null,
      });

      logger.info(`Initialization commit created: ${commitResponse.commit ?? 'unknown'}`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: targetFiles,
      };
    } catch (error) {
      logger.error(`Initialization commit failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: targetFiles,
        error: `Initialization commit failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Issue #16: Commit log cleanup files
   */
  public async commitCleanupLogs(
    issueNumber: number,
    phase: 'report' | 'evaluation',
  ): Promise<CommitResult> {
    // 1. File selection (delegated to FileSelector)
    const changedFiles = await this.fileSelector.getChangedFiles();
    const targetFiles = this.fileSelector.filterPhaseFiles(changedFiles, issueNumber.toString());

    // 2. No files to commit
    if (targetFiles.length === 0) {
      logger.warn('No files to commit for cleanup');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // 3. Git staging
    await this.git.add(targetFiles);
    await this.ensureGitConfig();

    // 4. Commit message generation (delegated to CommitMessageBuilder)
    const message = this.messageBuilder.createCleanupCommitMessage(issueNumber, phase);

    // 5. Commit execution
    try {
      const commitResponse = await this.git.commit(message, targetFiles, {
        '--no-verify': null,
      });

      logger.info(`Cleanup commit created: ${commitResponse.commit ?? 'unknown'}`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: targetFiles,
      };
    } catch (error) {
      logger.error(`Cleanup commit failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: targetFiles,
        error: `Cleanup commit failed: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Create commit message for phase completion
   * (Public API for backward compatibility with git-manager.ts)
   */
  public createCommitMessage(
    phaseName: PhaseName,
    status: 'completed' | 'failed',
    reviewResult?: string,
  ): string {
    return this.messageBuilder.createCommitMessage(phaseName, status, reviewResult);
  }

  /**
   * Ensure git config (user.name and user.email)
   */
  private async ensureGitConfig(): Promise<void> {
    const gitConfig = await this.git.listConfig();
    const userNameFromConfig = gitConfig.all['user.name'] as string | undefined;
    const userEmailFromConfig = gitConfig.all['user.email'] as string | undefined;

    let userName: string =
      userNameFromConfig ||
      config.getGitCommitUserName() ||
      'AI Workflow';

    let userEmail: string =
      userEmailFromConfig ||
      config.getGitCommitUserEmail() ||
      'ai-workflow@tielec.local';

    if (userName.length < 1 || userName.length > 100) {
      logger.warn(
        `User name length is invalid (${userName.length} chars), using default`,
      );
      userName = 'AI Workflow';
    }

    if (!userEmail.includes('@')) {
      logger.warn(
        `Invalid email format: ${userEmail}, using default`,
      );
      userEmail = 'ai-workflow@tielec.local';
    }

    await this.git.addConfig('user.name', userName, false, 'local');
    await this.git.addConfig('user.email', userEmail, false, 'local');

    logger.info(
      `Git config ensured: user.name=${userName}, user.email=${userEmail}`,
    );
  }

  /**
   * Issue #90: ロールバック用のコミットを作成
   */
  public async commitRollback(
    files: string[],
    toPhase: PhaseName,
    toStep: StepName,
    reason: string,
  ): Promise<CommitResult> {
    if (files.length === 0) {
      logger.warn('No files to commit for rollback.');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    await this.ensureGitConfig();

    // コミットメッセージ生成
    const commitMessage = `[ai-workflow] Rollback to ${toPhase} (step: ${toStep})

差し戻し理由:
${reason.slice(0, 200)}${reason.length > 200 ? '...' : ''}`;

    try {
      await this.git.add(files);
      const commitResponse = await this.git.commit(commitMessage, files, {
        '--no-verify': null,
      });

      logger.debug(`Rollback commit created: ${commitResponse.commit ?? 'unknown'}`);

      return {
        success: true,
        commit_hash: commitResponse.commit ?? null,
        files_committed: files,
      };
    } catch (error) {
      logger.error(`Git commit failed for rollback: ${getErrorMessage(error)}`);
      return {
        success: false,
        commit_hash: null,
        files_committed: files,
        error: getErrorMessage(error),
      };
    }
  }
}
