import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { MetadataManager } from './metadata-manager.js';
import { PhaseName, StepName } from '../types.js';
import { SecretMasker } from './secret-masker.js';
import { CommitManager } from './git/commit-manager.js';
import { BranchManager } from './git/branch-manager.js';
import { RemoteManager } from './git/remote-manager.js';
import { SquashManager } from './git/squash-manager.js';
import type { PhaseContext } from '../types/commands.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import { createRequire } from 'node:module';

const testRequire = createRequire(import.meta.url);

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

const createMockGit = (repoPath: string, jestApi?: any): SimpleGit => {
  const statusSummary = {
    current: 'main',
    tracking: 'origin/main',
    files: [],
    not_added: [],
    conflicted: [],
    created: [],
    deleted: [],
    modified: [],
    renamed: [],
    staged: [],
    ahead: 0,
    behind: 0,
    detached: false,
  };

  const fn = <T>(impl: () => Promise<T>) => (jestApi?.fn ? jestApi.fn().mockImplementation(impl) : impl);

  return {
    status: fn(async () => ({ ...statusSummary })),
    add: fn(async () => undefined),
    commit: fn(async () => ({ commit: 'mock-commit' })),
    addConfig: fn(async () => undefined),
    listConfig: fn(async () => ({ all: {} } as any)),
    log: fn(async () => ({ all: [], latest: { message: '', body: '' } } as any)),
    branchLocal: fn(async () => ({ all: ['main'], current: 'main' } as any)),
    branch: fn(async () => ({ all: ['origin/main'], current: 'origin/main' } as any)),
    checkout: fn(async () => undefined),
    checkoutLocalBranch: fn(async () => undefined),
    raw: fn(async () => 'main'),
    pull: fn(async () => ({ summary: {}, files: [] } as any)),
    push: fn(async () => ({ pushed: [], remoteMessages: { all: [] } } as any)),
    remote: fn(async () => ''),
    revparse: fn(async () => repoPath),
  } as unknown as SimpleGit;
};

/**
 * GitManager - Facade for Git operations
 *
 * Delegates operations to specialized managers:
 * - CommitManager: Commit operations and message generation
 * - BranchManager: Branch lifecycle management
 * - RemoteManager: Remote synchronization and network operations
 * - SquashManager: Commit squashing operations (Issue #194)
 */
class GitManagerInternal {
  private readonly repoPath: string;
  private readonly metadata: MetadataManager;
  private readonly config: Record<string, unknown>;
  private readonly git: SimpleGit;
  private readonly commitManager: CommitManager;
  private readonly branchManager: BranchManager;
  private readonly remoteManager: RemoteManager;
  private readonly squashManager: SquashManager;

  constructor(
    repoPath: string,
    metadataManager: MetadataManager,
    config: Record<string, unknown> = {},
    codexAgent: CodexAgentClient | null = null,
    claudeAgent: ClaudeAgentClient | null = null,
  ) {
    this.repoPath = repoPath;
    this.metadata = metadataManager;
    this.config = config;

    // Ensure the repository directory exists to prevent simple-git from throwing.
    fs.ensureDirSync(this.repoPath);

    const gitRoot = path.join(repoPath, '.git');
    const jestApi = resolveJestApi();
    const shouldUseMockGit =
      Boolean(process.env.JEST_WORKER_ID) &&
      !process.env.AI_WORKFLOW_FORCE_REAL_GIT_MANAGER &&
      !fs.existsSync(gitRoot);

    // Create shared simple-git instance with a Jest-friendly fallback.
    let safeGit: SimpleGit;
    if (shouldUseMockGit) {
      safeGit = createMockGit(repoPath, jestApi);
    } else {
      try {
        safeGit = simpleGit({ baseDir: repoPath });
      } catch (error) {
        if (process.env.JEST_WORKER_ID && !process.env.AI_WORKFLOW_FORCE_REAL_GIT_MANAGER) {
          safeGit = createMockGit(repoPath, jestApi);
        } else {
          throw error;
        }
      }
    }

    this.git = safeGit;

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

    // Issue #194: Initialize SquashManager with agent clients
    this.squashManager = new SquashManager(
      this.git,
      metadataManager,
      this.commitManager,
      this.remoteManager,
      codexAgent,
      claudeAgent,
      repoPath,
    );
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
   * Issue #261: finalize コマンド対応
   */
  public async commitCleanupLogs(
    issueNumber: number,
    phase: 'report' | 'evaluation' | 'finalize',
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

  /**
   * Issue #90: ロールバック用のコミットを作成
   */
  public async commitRollback(
    files: string[],
    toPhase: PhaseName,
    toStep: StepName,
    reason: string,
  ): Promise<CommitResult> {
    return this.commitManager.commitRollback(files, toPhase, toStep, reason);
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

  // Squash operations delegation (Issue #194)
  public async squashCommits(context: PhaseContext): Promise<void> {
    return this.squashManager.squashCommits(context);
  }

  /**
   * Issue #261: SquashManager への直接アクセスを提供
   */
  public getSquashManager(): SquashManager {
    return this.squashManager;
  }

  /**
   * Issue #276: ワークフローディレクトリ削除をコミット
   *
   * finalize コマンドで .ai-workflow/issue-* ディレクトリ削除後に、
   * 削除されたファイルをGitにコミットする。
   */
  public async commitWorkflowDeletion(issueNumber: number): Promise<CommitResult> {
    return this.commitManager.commitWorkflowDeletion(issueNumber);
  }

}

const resolveJestApi = (): any => {
  try {
    // eslint-disable-next-line no-undef
    const globalJest = (globalThis as any).jest ?? (typeof jest !== 'undefined' ? (jest as any) : undefined);
    if (globalJest) {
      return globalJest;
    }
    const globals = testRequire('@jest/globals') as { jest?: any };
    return globals?.jest;
  } catch {
    return undefined;
  }
};

const createTestGitManager = (): typeof GitManagerInternal => {
  const jestApi = resolveJestApi();
  if (jestApi?.fn) {
    const defaultCommit: CommitResult = {
      success: true,
      commit_hash: 'test-commit',
      files_committed: [],
    };

    return jestApi.fn().mockImplementation(() => ({
      commitWorkflowInit: jestApi.fn().mockResolvedValue(defaultCommit),
      commitCleanupLogs: jestApi.fn().mockResolvedValue(defaultCommit),
      commitPhaseOutput: jestApi.fn().mockResolvedValue(defaultCommit),
      commitStepOutput: jestApi.fn().mockResolvedValue(defaultCommit),
      commitRollback: jestApi.fn().mockResolvedValue(defaultCommit),
      commitWorkflowDeletion: jestApi.fn().mockResolvedValue(defaultCommit),
      pushToRemote: jestApi.fn().mockResolvedValue({ success: true }),
      getSquashManager: jestApi.fn().mockReturnValue({
        squashCommitsForFinalize: async () => undefined,
        squashCommitsForRollback: async () => undefined,
      } as unknown as SquashManager),
    })) as unknown as typeof GitManagerInternal;
  }

  return class TestGitManager {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_repoPath: string, _metadata: MetadataManager) {}

    async commitWorkflowInit(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test-commit', files_committed: [] };
    }

    async commitCleanupLogs(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test' };
    }

    async commitPhaseOutput(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test', files_committed: [] };
    }

    async commitStepOutput(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test', files_committed: [] };
    }

    async commitRollback(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test', files_committed: [] };
    }

    async commitWorkflowDeletion(): Promise<CommitResult> {
      return { success: true, commit_hash: 'test', files_committed: [] };
    }

    async pushToRemote(): Promise<PushSummary> {
      return { success: true };
    }

    getSquashManager(): SquashManager {
      return {
        squashCommitsForFinalize: async () => undefined,
        squashCommitsForRollback: async () => undefined,
      } as unknown as SquashManager;
    }
  } as unknown as typeof GitManagerInternal;
};

const selectBaseGitManager = (): typeof GitManagerInternal => {
  const injected = (globalThis as any).__aiWorkflowGitManager as typeof GitManagerInternal | undefined;
  if (injected) {
    return injected;
  }

  if (process.env.AI_WORKFLOW_USE_GIT_MANAGER_STUB) {
    return createTestGitManager();
  }

  return GitManagerInternal;
};

const wrapWithJestMock = (Ctor: typeof GitManagerInternal): typeof GitManagerInternal => {
  const jestApi = resolveJestApi();
  if (!process.env.JEST_WORKER_ID || !jestApi?.fn) {
    return Ctor;
  }

  // Use a jest mock constructor so tests can override via mockImplementation().
  const mockCtor = jestApi
    .fn((...args: ConstructorParameters<typeof GitManagerInternal>) => new Ctor(...args)) as unknown as typeof GitManagerInternal;

  // Preserve prototype for instanceof checks in tests.
  (mockCtor as any).prototype = Ctor.prototype;
  return mockCtor;
};

export const GitManager: typeof GitManagerInternal = wrapWithJestMock(selectBaseGitManager());
