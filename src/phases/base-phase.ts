import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetadataManager } from '../core/metadata-manager.js';
import { ClaudeAgentClient } from '../core/claude-agent-client.js';
import { CodexAgentClient } from '../core/codex-agent-client.js';
import { GitHubClient } from '../core/github-client.js';
import { ContentParser } from '../core/content-parser.js';
import { config } from '../core/config.js';
import {
  PhaseExecutionResult,
  PhaseName,
  PhaseStatus,
  PhaseMetadata,
  type IssueGenerationOptions,
} from '../types.js';
import { LogFormatter } from './formatters/log-formatter.js';
import { ProgressFormatter } from './formatters/progress-formatter.js';
import { AgentExecutor } from './core/agent-executor.js';
import { ReviewCycleManager } from './core/review-cycle-manager.js';
import { ContextBuilder } from './context/context-builder.js';
import { ArtifactCleaner } from './cleanup/artifact-cleaner.js';
import { StepExecutor } from './lifecycle/step-executor.js';
import { PhaseRunner } from './lifecycle/phase-runner.js';
import { getErrorMessage } from '../utils/error-utils.js';

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
  issueGenerationOptions?: IssueGenerationOptions; // Issue #119: Optional for backward compatibility
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
  protected readonly issueGenerationOptions: IssueGenerationOptions;

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
    this.issueGenerationOptions = params.issueGenerationOptions
      ? { ...params.issueGenerationOptions }
      : { enabled: false, provider: 'auto' };

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

    let prompt = fs.readFileSync(promptPath, 'utf-8');

    // Issue #177: 環境情報の注入（execute ステップのみ、パッケージインストール可能時）
    if (promptType === 'execute' && config.canAgentInstallPackages()) {
      const environmentInfo = this.buildEnvironmentInfoSection();
      prompt = environmentInfo + '\n\n' + prompt;

      logger.info(`Environment info injected into execute prompt for phase ${this.phaseName}`);
    }

    // Issue #90: 差し戻しコンテキストがある場合、プロンプトの先頭に追加
    // revise ステップのみに差し戻し情報を注入
    if (promptType === 'revise') {
      const rollbackContext = this.metadata.getRollbackContext(this.phaseName);
      if (rollbackContext) {
        const rollbackSection = this.buildRollbackPromptSection(rollbackContext);
        prompt = rollbackSection + '\n\n' + prompt;

        logger.info(`Rollback context injected into revise prompt for phase ${this.phaseName}`);
      }
    }

    return prompt;
  }

  /**
   * Issue #177: 環境情報セクションのMarkdownを生成
   * @returns 環境情報セクションのMarkdown文字列
   * @private
   */
  private buildEnvironmentInfoSection(): string {
    return `## 🛠️ 開発環境情報

このDocker環境では、以下のプログラミング言語をインストール可能です：

- **Python**: \`apt-get update && apt-get install -y python3 python3-pip\`
- **Go**: \`apt-get update && apt-get install -y golang-go\`
- **Java**: \`apt-get update && apt-get install -y default-jdk\`
- **Rust**: \`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y\`
- **Ruby**: \`apt-get update && apt-get install -y ruby ruby-dev\`

テスト実行や品質チェックに必要な言語環境は、自由にインストールしてください。`;
  }

  /**
   * Issue #90: 差し戻し情報をMarkdown形式で生成
   * @param context - 差し戻しコンテキスト
   * @returns Markdown形式の差し戻し情報
   */
  protected buildRollbackPromptSection(
    context: import('../types/commands.js').RollbackContext,
  ): string {
    const sections: string[] = [];

    // ヘッダー
    sections.push('# ⚠️ 差し戻し情報');
    sections.push('');

    // 差し戻し元フェーズ
    const fromPhaseText = context.from_phase
      ? `Phase ${context.from_phase}`
      : '不明なフェーズ';
    sections.push(`**このフェーズは ${fromPhaseText} から差し戻されました。**`);
    sections.push('');

    // 差し戻しの理由
    sections.push('## 差し戻しの理由:');
    sections.push(context.reason);
    sections.push('');

    // 詳細情報（存在する場合）
    if (context.details) {
      sections.push('## 詳細情報:');

      if (context.details.blocker_count !== undefined) {
        sections.push(`- ブロッカー数: ${context.details.blocker_count}`);
      }

      if (context.details.suggestion_count !== undefined) {
        sections.push(`- 改善提案数: ${context.details.suggestion_count}`);
      }

      if (context.details.affected_tests && context.details.affected_tests.length > 0) {
        sections.push(`- 影響を受けるテスト: ${context.details.affected_tests.join(', ')}`);
      }

      sections.push('');
    }

    // 参照すべきドキュメント
    if (context.review_result) {
      sections.push('## 参照すべきドキュメント:');
      sections.push(`- ${context.review_result}`);
      sections.push('');
    }

    // 区切り線
    sections.push('---');
    sections.push('');

    return sections.join('\n');
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
   * Issue #113: フォールバック機構を追加
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
   *   - enableFallback: フォールバック機構を有効化（NEW、デフォルト: false）
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
   *   }, {
   *     maxTurns: 30,
   *     enableFallback: true  // NEW: フォールバック機構を有効化
   *   });
   * }
   * ```
   */
  protected async executePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string; enableFallback?: boolean }
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
      logDir: options?.logDir ?? this.executeDir,  // デフォルトはexecuteDir
    };
    await this.executeWithAgent(prompt, agentOptions);

    // 4. 出力ファイルの存在確認
    const outputFilePath = path.join(this.outputDir, phaseOutputFile);
    if (!fs.existsSync(outputFilePath)) {
      // NEW: フォールバック機構が有効な場合
      if (options?.enableFallback === true) {
        logger.warn(`Phase ${this.phaseName}: Output file not found: ${outputFilePath}`);
        logger.info(`Phase ${this.phaseName}: Attempting fallback mechanism`);

        const fallbackResult = await this.handleMissingOutputFile(
          phaseOutputFile,
          agentOptions.logDir
        );

        return fallbackResult;
      }

      // 既存の動作（フォールバック無効時）
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


  /**
   * ファイルが作成されなかった場合のフォールバック処理（Issue #113）
   *
   * 1. エージェントログから成果物内容を抽出して保存
   * 2. 抽出失敗時は revise() メソッドを使用
   *
   * Evaluation Phaseの handleMissingEvaluationFile() を汎用化した実装
   *
   * @param phaseOutputFile - 出力ファイル名（例: 'planning.md', 'requirements.md'）
   * @param logDir - エージェントログディレクトリ（通常は this.executeDir）
   * @returns PhaseExecutionResult
   */
  protected async handleMissingOutputFile(
    phaseOutputFile: string,
    logDir: string
  ): Promise<PhaseExecutionResult> {
    const outputFilePath = path.join(this.outputDir, phaseOutputFile);

    // Step 1: エージェントログから成果物内容を抽出
    const agentLogPath = path.join(logDir, 'agent_log.md');

    if (!fs.existsSync(agentLogPath)) {
      logger.error(`Phase ${this.phaseName}: Agent log not found: ${agentLogPath}`);

      // ログが存在しない場合はエラー（revise しても意味がない）
      return {
        success: false,
        output: null,
        error: [
          `${phaseOutputFile} が見つかりません: ${outputFilePath}`,
          `エージェントログも見つかりません: ${agentLogPath}`,
          `エージェントが正常に実行されなかった可能性があります。`,
        ].join('\n'),
      };
    }

    try {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');

      // ログから成果物内容を抽出
      const extractedContent = this.extractContentFromLog(agentLog, this.phaseName);

      if (extractedContent && this.isValidOutputContent(extractedContent, this.phaseName)) {
        // 抽出した内容が妥当な場合、ファイルとして保存
        logger.info(
          `Phase ${this.phaseName}: Extracted valid content from agent log (${extractedContent.length} chars)`
        );
        fs.writeFileSync(outputFilePath, extractedContent, 'utf-8');
        logger.info(`Phase ${this.phaseName}: Saved extracted content to: ${outputFilePath}`);

        return { success: true, output: outputFilePath };
      }

      // Step 2: 内容が不十分な場合、revise() で再実行
      logger.warn(`Phase ${this.phaseName}: Extracted content is insufficient or invalid.`);
      logger.info(`Phase ${this.phaseName}: Attempting revise step to create ${phaseOutputFile}`);

      const feedback = [
        `${phaseOutputFile} が見つかりません: ${outputFilePath}`,
        `エージェントが Write ツールを呼び出していない可能性があります。`,
        `前回のログから成果物内容を抽出するか、新たに作成してファイルを保存してください。`,
      ].join('\n');

      // revise() メソッドを使用（BasePhase のパターンに従う）
      const reviseFunction = this.getReviseFunction();
      if (!reviseFunction) {
        return {
          success: false,
          output: null,
          error: `Phase ${this.phaseName}: revise() メソッドが実装されていません。`,
        };
      }

      const reviseResult = await reviseFunction(feedback);

      return reviseResult;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Phase ${this.phaseName}: Error during fallback processing: ${message}`);
      return {
        success: false,
        output: null,
        error: `フォールバック処理中にエラーが発生しました: ${message}`,
      };
    }
  }

  /**
   * エージェントログから成果物内容を抽出（Issue #113）
   *
   * Evaluation Phaseの extractEvaluationFromLog() を汎用化した実装
   *
   * @param agentLog - エージェントログ（agent_log.md の内容）
   * @param phaseName - フェーズ名（抽出パターンの選択に使用）
   * @returns 抽出した成果物内容（抽出失敗時は null）
   */
  protected extractContentFromLog(agentLog: string, phaseName: PhaseName): string | null {
    // フェーズごとのヘッダーパターン
    const headerPatterns: Record<PhaseName, RegExp> = {
      planning: /^#+ (プロジェクト計画書|Project Planning|計画書|Planning)/im,
      requirements: /^#+ (要件定義書|Requirements Document|要件定義|Requirements)/im,
      design: /^#+ (詳細設計書|Design Document|設計書|Design)/im,
      test_scenario: /^#+ (テストシナリオ|Test Scenario|テスト設計|Test Design)/im,
      implementation: /^#+ (実装ログ|Implementation Log|実装|Implementation)/im,
      report: /^#+ (プロジェクトレポート|Project Report|レポート|Report)/im,
      // 以下は対象外（フォールバック機構を導入しないフェーズ）
      test_implementation: /^#+ (テスト実装|Test Implementation)/im,
      testing: /^#+ (テスト実行結果|Test Result)/im,
      documentation: /^#+ (ドキュメント更新ログ|Documentation Update Log)/im,
      evaluation: /^#+ (評価レポート|Evaluation Report)/im,
    };

    const pattern = headerPatterns[phaseName];
    if (!pattern) {
      logger.warn(`Phase ${phaseName}: No extraction pattern defined`);
      return null;
    }

    // パターン1: ヘッダーから始まるセクションを探す
    const match = agentLog.match(pattern);

    if (match && match.index !== undefined) {
      // ヘッダー以降のコンテンツを抽出
      const content = agentLog.substring(match.index).trim();

      // 最低限の構造チェック：Markdownセクション（##）が含まれているか
      if (content.includes('##')) {
        return content;
      }
    }

    // パターン2: 大きなMarkdownブロックを探す（ヘッダーが見つからない場合）
    const lines = agentLog.split('\n');
    let startIndex = -1;
    let sectionCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Markdownセクションヘッダーを探す
      if (/^##+ /.test(line)) {
        if (startIndex === -1) {
          startIndex = i;
        }
        sectionCount++;
      }
    }

    // 複数のセクションヘッダーがある場合、それ以降を抽出
    if (sectionCount >= 2 && startIndex !== -1) {
      const extracted = lines.slice(startIndex).join('\n').trim();
      return extracted;
    }

    return null;
  }

  /**
   * 抽出した成果物内容が妥当かチェック（Issue #113）
   *
   * Evaluation Phaseの isValidEvaluationContent() を汎用化した実装
   *
   * @param content - 抽出した成果物内容
   * @param phaseName - フェーズ名（検証ルールの選択に使用）
   * @returns 妥当な場合は true、そうでない場合は false
   */
  protected isValidOutputContent(content: string, phaseName: PhaseName): boolean {
    // 最低限の要件：
    // 1. 100文字以上（極端に短いものは除外）
    // 2. Markdownセクションヘッダー（## または ###）が複数ある

    if (content.length < 100) {
      logger.debug(`Phase ${phaseName}: Content too short: ${content.length} chars`);
      return false;
    }

    // セクションヘッダーのカウント
    const sectionCount = (content.match(/^##+ /gm) || []).length;
    if (sectionCount < 2) {
      logger.debug(`Phase ${phaseName}: Insufficient sections: ${sectionCount}`);
      return false;
    }

    // フェーズ固有のキーワードチェック（オプション）
    const requiredKeywords: Partial<Record<PhaseName, string[]>> = {
      planning: ['実装戦略', 'テスト戦略', 'タスク分割'],
      requirements: ['機能要件', '受け入れ基準', 'スコープ'],
      design: ['アーキテクチャ', '実装戦略', 'テスト戦略'],
      test_scenario: ['テストケース', 'テストシナリオ'],
      implementation: ['実装', 'コード'],
      report: ['プロジェクトレポート', 'サマリー'],
    };

    const keywords = requiredKeywords[phaseName];
    if (keywords) {
      const missingKeywords = keywords.filter((keyword) => !content.includes(keyword));
      if (missingKeywords.length === keywords.length) {
        // すべてのキーワードが欠落している場合は無効
        logger.debug(`Phase ${phaseName}: Missing all required keywords: ${keywords.join(', ')}`);
        return false;
      }
    }

    return true;
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
