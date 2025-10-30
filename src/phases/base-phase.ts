import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetadataManager } from '../core/metadata-manager.js';
import { ClaudeAgentClient } from '../core/claude-agent-client.js';
import { CodexAgentClient } from '../core/codex-agent-client.js';
import { GitHubClient } from '../core/github-client.js';
import { ContentParser } from '../core/content-parser.js';
import { PhaseExecutionResult, PhaseName, PhaseStatus, PhaseMetadata } from '../types.js';
import { LogFormatter } from './formatters/log-formatter.js';
import { ProgressFormatter } from './formatters/progress-formatter.js';
import { AgentExecutor } from './core/agent-executor.js';
import { ReviewCycleManager } from './core/review-cycle-manager.js';
import { ContextBuilder } from './context/context-builder.js';
import { ArtifactCleaner } from './cleanup/artifact-cleaner.js';
import { StepExecutor } from './lifecycle/step-executor.js';
import { PhaseRunner } from './lifecycle/phase-runner.js';

// PhaseRunOptions を BasePhase から export（Issue #49）
export interface PhaseRunOptions {
  gitManager?: import('../core/git-manager.js').GitManager | null;
  skipReview?: boolean;
  cleanupOnComplete?: boolean;  // Issue #2: Cleanup workflow artifacts after evaluation phase
  cleanupOnCompleteForce?: boolean;  // Issue #2: Skip confirmation prompt for cleanup
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptsRoot = path.resolve(moduleDir, '..', 'prompts');
const MAX_RETRIES = 3;

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

  // 新規モジュール (Issue #49)
  private readonly contextBuilder: ContextBuilder;
  private readonly artifactCleaner: ArtifactCleaner;
  private stepExecutor: StepExecutor | null = null;
  private phaseRunner: PhaseRunner | null = null;

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

    // 新規モジュールの初期化 (Issue #49)
    this.contextBuilder = new ContextBuilder(
      this.metadata,
      this.workingDir,
      () => this.getAgentWorkingDirectory()
    );
    this.artifactCleaner = new ArtifactCleaner(this.metadata);

    // StepExecutor と PhaseRunner は遅延初期化（execute/review/revise メソッドが必要なため）
  }

  protected abstract execute(): Promise<PhaseExecutionResult>;

  protected abstract review(): Promise<PhaseExecutionResult>;

  protected async shouldRunReview(): Promise<boolean> {
    return true;
  }

  public async run(options: PhaseRunOptions = {}): Promise<boolean> {
    // StepExecutor と PhaseRunner の遅延初期化（Issue #49）
    if (!this.stepExecutor) {
      this.stepExecutor = new StepExecutor(
        this.phaseName,
        this.metadata,
        this.reviewCycleManager,
        async () => this.execute(),
        async () => this.review(),
        async () => this.shouldRunReview()
      );
    }

    if (!this.phaseRunner) {
      this.phaseRunner = new PhaseRunner(
        this.phaseName,
        this.metadata,
        this.github,
        this.stepExecutor,
        this.skipDependencyCheck,
        this.ignoreDependencies,
        this.presetPhases,
        this.getReviseFunction()
      );
    }

    // PhaseRunner に委譲（Issue #49）
    return this.phaseRunner.run(options);
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

  /**
   * フェーズ実行の共通パターンをテンプレート化したメソッド（Issue #47）
   *
   * @template T - プロンプトテンプレート変数のマップ型（Record<string, string> を継承）
   * @param phaseOutputFile - 出力ファイル名（例: 'requirements.md', 'design.md'）
   * @param templateVariables - プロンプトテンプレートの変数マップ
   *   - キー: プロンプト内の変数名（例: 'planning_document_path', 'issue_info'）
   *   - 値: 置換後の文字列
   * @param options - エージェント実行オプション
   *   - maxTurns: エージェントの最大ターン数（デフォルト: 30）
   *   - verbose: 詳細ログ出力フラグ（オプション、将来拡張用）
   *   - logDir: ログディレクトリパス（オプション、将来拡張用）
   * @returns PhaseExecutionResult - 実行結果
   *   - success: true の場合、output にファイルパスが格納される
   *   - success: false の場合、error にエラーメッセージが格納される
   *
   * @example
   * ```typescript
   * protected async execute(): Promise<PhaseExecutionResult> {
   *   const issueInfo = await this.getIssueInfo();
   *   return this.executePhaseTemplate('requirements.md', {
   *     planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
   *     issue_info: this.formatIssueInfo(issueInfo),
   *     issue_number: String(issueInfo.number)
   *   });
   * }
   * ```
   */
  protected async executePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
  ): Promise<PhaseExecutionResult> {
    // 1. プロンプトテンプレートを読み込む
    let prompt = this.loadPrompt('execute');

    // 2. テンプレート変数を置換
    for (const [key, value] of Object.entries(templateVariables)) {
      const placeholder = `{${key}}`;
      prompt = prompt.replace(placeholder, value);
    }

    // 3. エージェントを実行
    const agentOptions = {
      maxTurns: options?.maxTurns ?? 30,
      verbose: options?.verbose,
      logDir: options?.logDir,
    };
    await this.executeWithAgent(prompt, agentOptions);

    // 4. 出力ファイルの存在確認
    const outputFilePath = path.join(this.outputDir, phaseOutputFile);
    if (!fs.existsSync(outputFilePath)) {
      return {
        success: false,
        error: `${phaseOutputFile} が見つかりません: ${outputFilePath}`,
      };
    }

    // 5. 成功を返す
    return {
      success: true,
      output: outputFilePath,
    };
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
    // ContextBuilder に委譲（Issue #49）
    // Note: この private メソッドは ContextBuilder 内にコピーされているため、
    // ここでは直接 ContextBuilder の private メソッドを呼び出すことはできない。
    // そのため、従来の実装を保持する。
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
      logger.warn(`Output file not found for phase ${targetPhase}: ${filePath}`);
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
    // ContextBuilder に委譲（Issue #49）
    return this.contextBuilder.getPlanningDocumentReference(issueNumber);
  }

  protected getAgentFileReference(filePath: string): string | null {
    // ContextBuilder に委譲（Issue #49）
    return this.contextBuilder.getAgentFileReference(filePath);
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
    // ContextBuilder に委譲（Issue #49）
    return this.contextBuilder.buildOptionalContext(
      phaseName,
      filename,
      fallbackMessage,
      issueNumberOverride
    );
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
    // ArtifactCleaner に委譲（Issue #49）
    await this.artifactCleaner.cleanupWorkflowArtifacts(force);
  }

  /**
   * ワークフローログをクリーンアップ（Issue #2）
   *
   * Report Phase 完了後に実行され、phases 00-08 の execute/review/revise ディレクトリを削除します。
   * metadata.json と output/*.md は保持されます。
   */
  protected async cleanupWorkflowLogs(): Promise<void> {
    // ArtifactCleaner に委譲（Issue #49）
    await this.artifactCleaner.cleanupWorkflowLogs();
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
}
