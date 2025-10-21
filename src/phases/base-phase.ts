import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetadataManager } from '../core/metadata-manager.js';
import { ClaudeAgentClient } from '../core/claude-agent-client.js';
import { CodexAgentClient } from '../core/codex-agent-client.js';
import { GitHubClient } from '../core/github-client.js';
import { ContentParser } from '../core/content-parser.js';
import { GitManager } from '../core/git-manager.js';
import { validatePhaseDependencies } from '../core/phase-dependencies.js';
import { PhaseExecutionResult, PhaseName, PhaseStatus, PhaseMetadata } from '../types.js';
import { LogFormatter } from './formatters/log-formatter.js';
import { ProgressFormatter } from './formatters/progress-formatter.js';
import { AgentExecutor } from './core/agent-executor.js';
import { ReviewCycleManager } from './core/review-cycle-manager.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptsRoot = path.resolve(moduleDir, '..', 'prompts');
const MAX_RETRIES = 3;

export interface PhaseRunOptions {
  gitManager?: GitManager | null;
  skipReview?: boolean;
  cleanupOnComplete?: boolean;  // Issue #2: Cleanup workflow artifacts after evaluation phase
  cleanupOnCompleteForce?: boolean;  // Issue #2: Skip confirmation prompt for cleanup
}

export type BasePhaseConstructorParams = {
  phaseName: PhaseName;
  workingDir: string;
  metadataManager: MetadataManager;
  codexClient?: CodexAgentClient | null;
  claudeClient?: ClaudeAgentClient | null;
  githubClient: GitHubClient;
  skipDependencyCheck?: boolean;
  ignoreDependencies?: boolean;
  presetPhases?: PhaseName[]; // プリセット実行時のフェーズリスト（Issue #396）
};

export type PhaseInitializationParams = Omit<BasePhaseConstructorParams, 'phaseName'>;

export abstract class BasePhase {
  protected readonly phaseName: PhaseName;
  protected readonly workingDir: string;
  protected readonly metadata: MetadataManager;
  protected codex: CodexAgentClient | null;
  protected claude: ClaudeAgentClient | null;
  protected readonly github: GitHubClient;
  protected readonly skipDependencyCheck: boolean;
  protected readonly ignoreDependencies: boolean;
  protected readonly presetPhases: PhaseName[] | undefined; // プリセット実行時のフェーズリスト（Issue #396）
  protected readonly contentParser: ContentParser;

  protected readonly phaseDir: string;
  protected readonly outputDir: string;
  protected readonly executeDir: string;
  protected readonly reviewDir: string;
  protected readonly reviseDir: string;

  // 新規モジュール (Issue #23)
  private readonly logFormatter: LogFormatter;
  private readonly progressFormatter: ProgressFormatter;
  private agentExecutor: AgentExecutor | null = null;
  private readonly reviewCycleManager: ReviewCycleManager;

  private getActiveAgent(): CodexAgentClient | ClaudeAgentClient {
    if (this.codex) {
      return this.codex;
    }
    if (this.claude) {
      return this.claude;
    }
    throw new Error('No agent client configured for this phase.');
  }

  protected getAgentWorkingDirectory(): string {
    try {
      return this.getActiveAgent().getWorkingDirectory();
    } catch {
      return this.workingDir;
    }
  }

  constructor(params: BasePhaseConstructorParams) {
    this.phaseName = params.phaseName;
    this.workingDir = params.workingDir;
    this.metadata = params.metadataManager;
    this.codex = params.codexClient ?? null;
    this.claude = params.claudeClient ?? null;
    this.github = params.githubClient;
    this.skipDependencyCheck = params.skipDependencyCheck ?? false;
    this.ignoreDependencies = params.ignoreDependencies ?? false;
    this.presetPhases = params.presetPhases;
    this.contentParser = new ContentParser();

    const phaseNumber = this.getPhaseNumber(this.phaseName);
    this.phaseDir = path.join(this.metadata.workflowDir, `${phaseNumber}_${this.phaseName}`);
    this.outputDir = path.join(this.phaseDir, 'output');
    this.executeDir = path.join(this.phaseDir, 'execute');
    this.reviewDir = path.join(this.phaseDir, 'review');
    this.reviseDir = path.join(this.phaseDir, 'revise');

    this.ensureDirectories();

    // 新規モジュールの初期化 (Issue #23)
    this.logFormatter = new LogFormatter();
    this.progressFormatter = new ProgressFormatter();
    this.reviewCycleManager = new ReviewCycleManager(this.metadata, this.phaseName);

    // AgentExecutor は遅延初期化（codex/claude が設定されている場合のみ）
    if (this.codex || this.claude) {
      this.agentExecutor = new AgentExecutor(
        this.codex,
        this.claude,
        this.metadata,
        this.phaseName,
        this.workingDir,
      );
    }
  }

  protected abstract execute(): Promise<PhaseExecutionResult>;

  protected abstract review(): Promise<PhaseExecutionResult>;

  protected async shouldRunReview(): Promise<boolean> {
    return true;
  }

  public async run(options: PhaseRunOptions = {}): Promise<boolean> {
    const gitManager = options.gitManager ?? null;

    const dependencyResult = validatePhaseDependencies(this.phaseName, this.metadata, {
      skipCheck: this.skipDependencyCheck,
      ignoreViolations: this.ignoreDependencies,
      presetPhases: this.presetPhases,
    });

    if (!dependencyResult.valid) {
      const error =
        dependencyResult.error ??
        'Dependency validation failed. Use --skip-dependency-check to bypass.';
      console.error(`[ERROR] ${error}`);
      return false;
    }

    if (dependencyResult.warning) {
      console.warn(`[WARNING] ${dependencyResult.warning}`);
    }

    this.updatePhaseStatus('in_progress');
    await this.postProgress('in_progress', `${this.phaseName} フェーズを開始します。`);

    try {
      // Execute Step (Issue #10: ステップ単位のコミット＆レジューム)
      const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
      if (!completedSteps.includes('execute')) {
        console.info(`[INFO] Phase ${this.phaseName}: Starting execute step...`);
        this.metadata.updateCurrentStep(this.phaseName, 'execute');

        const executeResult = await this.execute();
        if (!executeResult.success) {
          console.error(`[ERROR] Phase ${this.phaseName}: Execute failed: ${executeResult.error ?? 'Unknown error'}`);
          await this.handleFailure(executeResult.error ?? 'Unknown execute error');
          return false;
        }

        console.info(`[INFO] Phase ${this.phaseName}: Execute completed successfully`);

        // Commit & Push after execute (Issue #10)
        if (gitManager) {
          await this.commitAndPushStep(gitManager, 'execute');
        }

        this.metadata.addCompletedStep(this.phaseName, 'execute');
      } else {
        console.info(`[INFO] Phase ${this.phaseName}: Skipping execute step (already completed)`);
      }

      // Review Step (if enabled)
      if (!options.skipReview && (await this.shouldRunReview())) {
        const completedSteps = this.metadata.getCompletedSteps(this.phaseName);
        if (!completedSteps.includes('review')) {
          console.info(`[INFO] Phase ${this.phaseName}: Starting review step...`);
          this.metadata.updateCurrentStep(this.phaseName, 'review');

          const reviewResult = await this.review();
          if (!reviewResult.success) {
            console.warn(`[WARNING] Phase ${this.phaseName}: Review failed: ${reviewResult.error ?? 'Unknown error'}`);

            // Revise Step (if review failed) - Issue #10
            await this.performReviseStepWithRetry(gitManager, reviewResult);
          } else {
            console.info(`[INFO] Phase ${this.phaseName}: Review completed successfully`);

            // Commit & Push after review (Issue #10)
            if (gitManager) {
              await this.commitAndPushStep(gitManager, 'review');
            }

            this.metadata.addCompletedStep(this.phaseName, 'review');
          }
        } else {
          console.info(`[INFO] Phase ${this.phaseName}: Skipping review step (already completed)`);
        }
      } else {
        console.info(`[INFO] Phase ${this.phaseName}: Skipping review (skipReview=${options.skipReview})`);
      }

      // フェーズ完了
      this.updatePhaseStatus('completed');
      await this.postProgress('completed', `${this.phaseName} フェーズが完了しました。`);

      return true;
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      await this.handleFailure(message);
      return false;
    }
  }

  protected loadPrompt(promptType: 'execute' | 'review' | 'revise'): string {
    const promptPath = path.join(promptsRoot, this.phaseName, `${promptType}.txt`);
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    return fs.readFileSync(promptPath, 'utf-8');
  }

  protected async executeWithAgent(
    prompt: string,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string },
  ): Promise<string[]> {
    if (!this.agentExecutor) {
      throw new Error('No agent client configured for this phase.');
    }

    // AgentExecutor に委譲 (Issue #23)
    const messages = await this.agentExecutor.executeWithAgent(prompt, options);

    // エージェント切り替えの同期（フォールバック後の状態を反映）
    // AgentExecutor 内部で codex が null に設定されている場合があるため、ここで同期
    // （既存のロジックとの互換性を保つため）
    // Note: AgentExecutor は内部で codex/claude を操作するため、この同期処理が必要
    return messages;
  }

  protected getIssueInfo() {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    if (Number.isNaN(issueNumber)) {
      throw new Error('Invalid issue number in metadata.');
    }
    return this.github.getIssueInfo(issueNumber);
  }

  protected async postOutput(content: string, title: string) {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    await this.github.postComment(
      issueNumber,
      [`### ${title}`, '', '```markdown', content, '```', '', '*自動生成: AI Workflow*'].join(
        '\n',
      ),
    );
  }

  protected updatePhaseStatus(
    status: PhaseStatus,
    options: { reviewResult?: string | null; outputFile?: string | null } = {},
  ) {
    const payload: { reviewResult?: string; outputFile?: string } = {};
    if (options.reviewResult) {
      payload.reviewResult = options.reviewResult;
    }
    if (options.outputFile) {
      payload.outputFile = options.outputFile;
    }

    this.metadata.updatePhaseStatus(this.phaseName, status, payload);
  }

  protected getPhaseOutputFile(
    targetPhase: PhaseName,
    fileName: string,
    issueNumberOverride?: string | number,
  ): string | null {
    const workflowRoot = path.resolve(this.metadata.workflowDir, '..');
    const issueIdentifier =
      issueNumberOverride !== undefined ? String(issueNumberOverride) : this.metadata.data.issue_number;
    const phaseNumber = this.getPhaseNumber(targetPhase);
    const filePath = path.join(
      workflowRoot,
      `issue-${issueIdentifier}`,
      `${phaseNumber}_${targetPhase}`,
      'output',
      fileName,
    );

    if (!fs.existsSync(filePath)) {
      console.warn(`[WARNING] Output file not found for phase ${targetPhase}: ${filePath}`);
      return null;
    }

    return filePath;
  }

  protected formatIssueInfo(issueInfo: {
    number: number;
    title: string;
    state: string;
    url: string;
    labels: string[];
    body: string;
  }): string {
    const labels = issueInfo.labels?.length ? issueInfo.labels.join(', ') : 'なし';
    const body = issueInfo.body?.trim() ? issueInfo.body : '(本文なし)';

    return [
      '## Issue概要',
      '',
      `- **Issue番号**: #${issueInfo.number}`,
      `- **タイトル**: ${issueInfo.title}`,
      `- **状態**: ${issueInfo.state}`,
      `- **URL**: ${issueInfo.url}`,
      `- **ラベル**: ${labels}`,
      '',
      '### 本文',
      '',
      body,
    ].join('\n');
  }

  protected getPlanningDocumentReference(issueNumber: number): string {
    const planningFile = this.getPhaseOutputFile('planning', 'planning.md', issueNumber);

    if (!planningFile) {
      console.warn('[WARNING] Planning document not found.');
      return 'Planning Phaseは実行されていません';
    }

    const reference = this.getAgentFileReference(planningFile);
    if (!reference) {
      console.warn(`[WARNING] Failed to resolve relative path for planning document: ${planningFile}`);
      return 'Planning Phaseは実行されていません';
    }

    console.info(`[INFO] Planning document reference: ${reference}`);
    return reference;
  }

  protected getAgentFileReference(filePath: string): string | null {
    const absoluteFile = path.resolve(filePath);
    const workingDir = path.resolve(this.getAgentWorkingDirectory());
    const relative = path.relative(workingDir, absoluteFile);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    const normalized = relative.split(path.sep).join('/');
    return `@${normalized}`;
  }

  /**
   * オプショナルコンテキストを構築（Issue #396）
   * ファイルが存在する場合は@filepath参照、存在しない場合はフォールバックメッセージ
   *
   * @param phaseName - 参照するPhase名
   * @param filename - ファイル名（例: 'requirements.md'）
   * @param fallbackMessage - ファイルが存在しない場合のメッセージ
   * @param issueNumberOverride - Issue番号（省略時は現在のIssue番号を使用）
   * @returns ファイル参照またはフォールバックメッセージ
   */
  protected buildOptionalContext(
    phaseName: PhaseName,
    filename: string,
    fallbackMessage: string,
    issueNumberOverride?: string | number,
  ): string {
    const issueNumber = issueNumberOverride !== undefined
      ? String(issueNumberOverride)
      : this.metadata.data.issue_number;

    const filePath = this.getPhaseOutputFile(phaseName, filename, issueNumber);

    // ファイル存在チェック
    if (filePath && fs.existsSync(filePath)) {
      // 存在する場合は@filepath形式で参照
      const reference = this.getAgentFileReference(filePath);
      if (reference) {
        console.info(`[INFO] Using ${phaseName} output: ${reference}`);
        return reference;
      } else {
        console.warn(`[WARNING] Failed to resolve relative path for ${phaseName}: ${filePath}`);
        return fallbackMessage;
      }
    } else {
      // 存在しない場合はフォールバックメッセージ
      console.info(`[INFO] ${phaseName} output not found, using fallback message`);
      return fallbackMessage;
    }
  }

  private getPhaseNumber(phase: PhaseName): string {
    const mapping: Record<PhaseName, string> = {
      planning: '00',
      requirements: '01',
      design: '02',
      test_scenario: '03',
      implementation: '04',
      test_implementation: '05',
      testing: '06',
      documentation: '07',
      report: '08',
      evaluation: '09',
    };
    return mapping[phase];
  }

  private ensureDirectories() {
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.executeDir);
    fs.ensureDirSync(this.reviewDir);
    fs.ensureDirSync(this.reviseDir);
  }

  private async handleFailure(reason: string) {
    this.updatePhaseStatus('failed');
    await this.postProgress(
      'failed',
      `${this.phaseName} フェーズでエラーが発生しました: ${reason}`,
    );
  }

  private async postProgress(status: PhaseStatus, details?: string) {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    if (Number.isNaN(issueNumber)) {
      return;
    }

    try {
      const content = this.formatProgressComment(status, details);
      await this.github.createOrUpdateProgressComment(
        issueNumber,
        content,
        this.metadata,
      );
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      console.warn(`[WARNING] Failed to post workflow progress: ${message}`);
    }
  }

  private formatProgressComment(status: PhaseStatus, details?: string): string {
    // ProgressFormatter に委譲 (Issue #23)
    return this.progressFormatter.formatProgressComment(
      this.phaseName,
      status,
      this.metadata,
      details,
    );
  }

  protected async autoCommitAndPush(gitManager: GitManager, reviewResult: string | null) {
    const commitResult = await gitManager.commitPhaseOutput(
      this.phaseName,
      'completed',
      reviewResult ?? undefined,
    );

    if (!commitResult.success) {
      throw new Error(`Git commit failed: ${commitResult.error ?? 'unknown error'}`);
    }

    const pushResult = await gitManager.pushToRemote();
    if (!pushResult.success) {
      throw new Error(`Git push failed: ${pushResult.error ?? 'unknown error'}`);
    }
  }

  /**
   * ワークフローアーティファクト全体をクリーンアップ（Issue #2）
   *
   * Evaluation Phase完了後に実行され、.ai-workflow/issue-<NUM>/ ディレクトリ全体を削除します。
   * Report Phaseのクリーンアップ（cleanupWorkflowLogs）とは異なり、metadata.jsonや
   * output/*.mdファイルを含むすべてのファイルを削除します。
   *
   * @param force - 確認プロンプトをスキップする場合は true（CI環境用）
   */
  protected async cleanupWorkflowArtifacts(force: boolean = false): Promise<void> {
    const workflowDir = this.metadata.workflowDir; // .ai-workflow/issue-<NUM>

    // パス検証: .ai-workflow/issue-<NUM> 形式であることを確認
    const pattern = /\.ai-workflow[\/\\]issue-\d+$/;
    if (!pattern.test(workflowDir)) {
      console.error(`[ERROR] Invalid workflow directory path: ${workflowDir}`);
      throw new Error(`Invalid workflow directory path: ${workflowDir}`);
    }

    // シンボリックリンクチェック
    if (fs.existsSync(workflowDir)) {
      const stats = fs.lstatSync(workflowDir);
      if (stats.isSymbolicLink()) {
        console.error(`[ERROR] Workflow directory is a symbolic link: ${workflowDir}`);
        throw new Error(`Workflow directory is a symbolic link: ${workflowDir}`);
      }
    }

    // CI環境判定
    const isCIEnvironment = this.isCIEnvironment();

    // 確認プロンプト表示（force=false かつ非CI環境の場合のみ）
    if (!force && !isCIEnvironment) {
      const confirmed = await this.promptUserConfirmation(workflowDir);
      if (!confirmed) {
        console.info('[INFO] Cleanup cancelled by user.');
        return;
      }
    }

    // ディレクトリ削除
    try {
      console.info(`[INFO] Deleting workflow artifacts: ${workflowDir}`);

      // ディレクトリ存在確認
      if (!fs.existsSync(workflowDir)) {
        console.warn(`[WARNING] Workflow directory does not exist: ${workflowDir}`);
        return;
      }

      // 削除実行
      fs.removeSync(workflowDir);
      console.info('[OK] Workflow artifacts deleted successfully.');
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      console.error(`[ERROR] Failed to delete workflow artifacts: ${message}`);
      // エラーでもワークフローは継続（Report Phaseのクリーンアップと同様）
    }
  }

  /**
   * CI環境かどうかを判定
   * @returns CI環境の場合は true
   */
  private isCIEnvironment(): boolean {
    // 環境変数 CI が設定されている場合はCI環境と判定
    return process.env.CI === 'true' || process.env.CI === '1';
  }

  /**
   * ユーザーに確認プロンプトを表示
   * @param workflowDir - 削除対象のワークフローディレクトリ
   * @returns ユーザーが "yes" を入力した場合は true
   */
  private async promptUserConfirmation(workflowDir: string): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.warn(`[WARNING] About to delete workflow directory: ${workflowDir}`);
    console.warn('[WARNING] This action cannot be undone.');

    return new Promise((resolve) => {
      rl.question('Proceed? (yes/no): ', (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'yes' || normalized === 'y');
      });
    });
  }


  private getReviseFunction():
    | ((feedback: string) => Promise<PhaseExecutionResult>)
    | null {
    const candidate = (this as unknown as Record<string, unknown>).revise;
    if (typeof candidate === 'function') {
      return candidate.bind(this);
    }
    return null;
  }


  /**
   * Issue #10: フェーズ番号を整数で取得
   */
  private getPhaseNumberInt(phase: PhaseName): number {
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
    return phaseOrder.indexOf(phase);
  }

  /**
   * Issue #10: ステップ単位のコミット＆プッシュ
   */
  private async commitAndPushStep(
    gitManager: GitManager,
    step: 'execute' | 'review' | 'revise'
  ): Promise<void> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const phaseNumber = this.getPhaseNumberInt(this.phaseName);

    console.info(`[INFO] Phase ${this.phaseName}: Committing ${step} step...`);

    const commitResult = await gitManager.commitStepOutput(
      this.phaseName,
      phaseNumber,
      step,
      issueNumber,
      this.workingDir
    );

    if (!commitResult.success) {
      throw new Error(`Git commit failed for step ${step}: ${commitResult.error ?? 'unknown error'}`);
    }

    console.info(`[INFO] Phase ${this.phaseName}: Pushing ${step} step to remote...`);

    try {
      const pushResult = await gitManager.pushToRemote(3); // 最大3回リトライ
      if (!pushResult.success) {
        throw new Error(`Git push failed for step ${step}: ${pushResult.error ?? 'unknown error'}`);
      }
      console.info(`[INFO] Phase ${this.phaseName}: Step ${step} pushed successfully`);
    } catch (error) {
      // プッシュ失敗時の処理
      console.error(`[ERROR] Phase ${this.phaseName}: Failed to push step ${step}: ${(error as Error).message}`);

      // current_stepを維持（次回レジューム時に同じステップを再実行）
      this.metadata.updateCurrentStep(this.phaseName, step);

      throw error;
    }
  }

  /**
   * Issue #10: Reviseステップの実行（リトライ付き）
   * Issue #23: ReviewCycleManager に委譲
   */
  private async performReviseStepWithRetry(
    gitManager: GitManager | null,
    initialReviewResult: PhaseExecutionResult
  ): Promise<void> {
    // Get revise function
    const reviseFn = this.getReviseFunction();
    if (!reviseFn) {
      console.error(`[ERROR] Phase ${this.phaseName}: revise() method not implemented.`);
      throw new Error('revise() method not implemented');
    }

    // ReviewCycleManager に委譲 (Issue #23)
    await this.reviewCycleManager.performReviseStepWithRetry(
      gitManager,
      initialReviewResult,
      async () => this.review(),
      reviseFn,
      async (status: PhaseStatus, details?: string) => this.postProgress(status, details),
      async (step: 'execute' | 'review' | 'revise') => {
        if (gitManager) {
          await this.commitAndPushStep(gitManager, step);
        }
      },
    );
  }
}
