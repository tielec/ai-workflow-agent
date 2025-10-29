import { join } from 'node:path';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import { minimatch } from 'minimatch';
import { getErrorMessage } from '../../utils/error-utils.js';
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
 * CommitManager - Specialized manager for Git commit operations
 *
 * Responsibilities:
 * - Commit creation (phase output, step output, workflow init, cleanup logs)
 * - Commit message generation
 * - File operation helpers (changed files, filtering, scanning)
 * - Git configuration management
 * - SecretMasker integration
 */
export class CommitManager {
  private readonly git: SimpleGit;
  private readonly metadata: MetadataManager;
  private readonly secretMasker: SecretMasker;
  private readonly repoPath: string;

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

    const changedFiles = await this.getChangedFiles();
    logger.debug(`Git status detected ${changedFiles.length} changed files`);
    if (changedFiles.length > 0) {
      logger.debug(`Changed files: ${changedFiles.slice(0, 5).join(', ')}${changedFiles.length > 5 ? '...' : ''}`);
    }

    const targetFiles = new Set(
      this.filterPhaseFiles(changedFiles, issueNumber),
    );

    const phaseSpecific = await this.getPhaseSpecificFiles(phaseName);
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

    // Issue #12: Mask secrets before commit
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
    const message = this.buildStepCommitMessage(
      phaseName,
      phaseNumber,
      step,
      issueNumber,
    );

    const changedFiles = await this.getChangedFiles();
    const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

    if (targetFiles.length === 0) {
      logger.warn(`No files to commit for step: ${step}`);
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // Issue #12: Mask secrets before commit
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

    await this.git.add(targetFiles);
    await this.ensureGitConfig();

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
    // 1. Get changed files
    const changedFiles = await this.getChangedFiles();
    const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

    // 2. No files to commit
    if (targetFiles.length === 0) {
      logger.warn('No files to commit for initialization');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // Issue #54: Mask secrets in metadata.json before commit (Defense in Depth - Layer 2)
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

    // 3. Stage files
    await this.git.add(targetFiles);

    // 4. Ensure git config
    await this.ensureGitConfig();

    // 5. Generate commit message
    const message = this.createInitCommitMessage(issueNumber, branchName);

    // 6. Create commit
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
    // 1. Get changed files
    const changedFiles = await this.getChangedFiles();
    const targetFiles = this.filterPhaseFiles(changedFiles, issueNumber.toString());

    // 2. No files to commit
    if (targetFiles.length === 0) {
      logger.warn('No files to commit for cleanup');
      return {
        success: true,
        commit_hash: null,
        files_committed: [],
      };
    }

    // 3. Stage files
    await this.git.add(targetFiles);

    // 4. Ensure git config
    await this.ensureGitConfig();

    // 5. Generate commit message
    const message = this.createCleanupCommitMessage(issueNumber, phase);

    // 6. Create commit
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
   */
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

  /**
   * Issue #10: Build step commit message
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

  /**
   * Issue #16: Create initialization commit message
   */
  private createInitCommitMessage(
    issueNumber: number,
    branchName: string,
  ): string {
    return [
      `[ai-workflow] Initialize workflow for issue #${issueNumber}`,
      '',
      `Issue: #${issueNumber}`,
      `Action: Create workflow metadata and directory structure`,
      `Branch: ${branchName}`,
      '',
      'Auto-generated by AI Workflow',
    ].join('\n');
  }

  /**
   * Issue #16: Create cleanup commit message
   */
  private createCleanupCommitMessage(
    issueNumber: number,
    phase: 'report' | 'evaluation',
  ): string {
    // Calculate correct phase number
    const phaseNumber = phase === 'report' ? 8 : 9;

    return [
      `[ai-workflow] Clean up workflow execution logs`,
      '',
      `Issue: #${issueNumber}`,
      `Phase: ${phaseNumber} (${phase})`,
      `Action: Remove agent execution logs (execute/review/revise directories)`,
      `Preserved: metadata.json, output/*.md`,
      '',
      'Auto-generated by AI Workflow',
    ].join('\n');
  }

  /**
   * Get changed files from git status
   */
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

  /**
   * Filter files by issue number
   */
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

  /**
   * Get phase-specific files based on phase name
   */
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

  /**
   * Scan specific directories for changed files
   */
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

  /**
   * Scan files by glob patterns
   */
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
}
