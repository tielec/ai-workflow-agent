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

type UsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptsRoot = path.resolve(moduleDir, '..', 'prompts');
const MAX_RETRIES = 3;

export interface PhaseRunOptions {
  gitManager?: GitManager | null;
  skipReview?: boolean;
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
  protected lastExecutionMetrics: UsageMetrics | null = null;

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

    let currentOutputFile: string | null = null;

    try {
      console.info(`[INFO] Phase ${this.phaseName}: Starting execute...`);
      const executeResult = await this.execute();
      if (!executeResult.success) {
        console.error(`[ERROR] Phase ${this.phaseName}: Execute failed: ${executeResult.error ?? 'Unknown error'}`);
        await this.handleFailure(executeResult.error ?? 'Unknown execute error');
        return false;
      }
      console.info(`[INFO] Phase ${this.phaseName}: Execute completed successfully`);

      currentOutputFile = executeResult.output ?? null;

      let reviewResult: PhaseExecutionResult | null = null;
      if (!options.skipReview && (await this.shouldRunReview())) {
        console.info(`[INFO] Phase ${this.phaseName}: Starting review cycle (max retries: ${MAX_RETRIES})...`);
        const reviewOutcome = await this.performReviewCycle(currentOutputFile, MAX_RETRIES);
        if (!reviewOutcome.success) {
          console.error(`[ERROR] Phase ${this.phaseName}: Review cycle failed: ${reviewOutcome.error ?? 'Unknown error'}`);
          await this.handleFailure(reviewOutcome.error ?? 'Review failed');
          return false;
        }
        console.info(`[INFO] Phase ${this.phaseName}: Review cycle completed successfully`);
        reviewResult = reviewOutcome.reviewResult;
        currentOutputFile = reviewOutcome.outputFile ?? currentOutputFile;
      } else {
        console.info(`[INFO] Phase ${this.phaseName}: Skipping review (skipReview=${options.skipReview})`);
      }

      this.updatePhaseStatus('completed', {
        reviewResult: reviewResult?.output ?? null,
        outputFile: currentOutputFile ?? undefined,
      });
      await this.postProgress('completed', `${this.phaseName} フェーズが完了しました。`);

      if (gitManager) {
        await this.autoCommitAndPush(gitManager, reviewResult?.output ?? null);
      }

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
  ) {
    const primaryAgent = this.codex ?? this.claude;
    if (!primaryAgent) {
      throw new Error('No agent client configured for this phase.');
    }

    const primaryName = this.codex && primaryAgent === this.codex ? 'Codex Agent' : 'Claude Agent';
    console.info(`[INFO] Using ${primaryName} for phase ${this.phaseName}`);

    let primaryResult: { messages: string[]; authFailed: boolean } | null = null;

    try {
      primaryResult = await this.runAgentTask(primaryAgent, primaryName, prompt, options);
    } catch (error) {
      if (primaryAgent === this.codex && this.claude) {
        const err = error as NodeJS.ErrnoException & { code?: string };
        const message = err?.message ?? String(error);
        const binaryPath = this.codex?.getBinaryPath?.();

        if (err?.code === 'CODEX_CLI_NOT_FOUND') {
          console.warn(
            `[WARNING] Codex CLI not found at ${binaryPath ?? 'codex'}: ${message}`,
          );
        } else {
          console.warn(`[WARNING] Codex agent failed: ${message}`);
        }

        console.warn('[WARNING] Falling back to Claude Code agent.');
        this.codex = null;
        const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
        return fallbackResult.messages;
      }
      throw error;
    }

    if (!primaryResult) {
      throw new Error('Codex agent returned no result.');
    }

    const finalResult = primaryResult;

    if (finalResult.authFailed && primaryAgent === this.codex && this.claude) {
      console.warn('[WARNING] Codex authentication failed. Falling back to Claude Code agent.');
      this.codex = null;
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    if (finalResult.messages.length === 0 && this.claude && primaryAgent === this.codex) {
      console.warn('[WARNING] Codex agent produced no output. Trying Claude Code agent as fallback.');
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    return finalResult.messages;
  }

  private async runAgentTask(
    agent: CodexAgentClient | ClaudeAgentClient,
    agentName: string,
    prompt: string,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string },
  ): Promise<{ messages: string[]; authFailed: boolean }> {
    const logDir = options?.logDir ?? this.executeDir;
    const promptFile = path.join(logDir, 'prompt.txt');
    const rawLogFile = path.join(logDir, 'agent_log_raw.txt');
    const agentLogFile = path.join(logDir, 'agent_log.md');

    fs.writeFileSync(promptFile, prompt, 'utf-8');
    console.info(`[INFO] Prompt saved to: ${promptFile}`);
    console.info(`[INFO] Running ${agentName} for phase ${this.phaseName}`);

    const startTime = Date.now();
    let messages: string[] = [];
    let error: Error | null = null;

    try {
      messages = await agent.executeTask({
        prompt,
        maxTurns: options?.maxTurns ?? 50,
        workingDirectory: this.workingDir,
        verbose: options?.verbose,
      });
    } catch (e) {
      error = e as Error;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    fs.writeFileSync(rawLogFile, messages.join('\n'), 'utf-8');
    console.info(`[INFO] Raw log saved to: ${rawLogFile}`);

    if (agentName === 'Codex Agent') {
      console.info('[DEBUG] Codex agent emitted messages:');
      messages.slice(0, 10).forEach((line, index) => {
        console.info(`[DEBUG][Codex][${index}] ${line}`);
      });
    }

    const agentLogContent = this.formatAgentLog(messages, startTime, endTime, duration, error, agentName);
    fs.writeFileSync(agentLogFile, agentLogContent, 'utf-8');
    console.info(`[INFO] Agent log saved to: ${agentLogFile}`);

    if (error) {
      throw error;
    }

    const usage = this.extractUsageMetrics(messages);
    this.recordUsageMetrics(usage);

    const authFailed = messages.some((line) => {
      const normalized = line.toLowerCase();
      return (
        normalized.includes('invalid bearer token') ||
        normalized.includes('authentication_error') ||
        normalized.includes('please run /login')
      );
    });

    return { messages, authFailed };
  }

  private formatAgentLog(
    messages: string[],
    startTime: number,
    endTime: number,
    duration: number,
    error: Error | null,
    agentName: string,
  ): string {
    if (agentName === 'Codex Agent') {
      const codexLog = this.formatCodexAgentLog(messages, startTime, endTime, duration, error);
      if (codexLog) {
        return codexLog;
      }

      return [
        '# Codex Agent Execution Log',
        '',
        '```json',
        ...messages,
        '```',
        '',
        '---',
        `**Elapsed**: ${duration}ms`,
        `**Started**: ${new Date(startTime).toISOString()}`,
        `**Finished**: ${new Date(endTime).toISOString()}`,
        error ? `**Error**: ${error.message}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const lines: string[] = [];
    lines.push('# Claude Agent 実行ログ\n');
    lines.push(`生成日時: ${new Date(startTime).toLocaleString('ja-JP')}\n`);
    lines.push('---\n');

    let turnNumber = 1;
    for (const rawMessage of messages) {
      try {
        const message = JSON.parse(rawMessage);

        if (message.type === 'system' && message.subtype === 'init') {
          lines.push(`## Turn ${turnNumber++}: システム初期化\n`);
          lines.push(`**セッションID**: \`${message.session_id || 'N/A'}\``);
          lines.push(`**モデル**: ${message.model || 'N/A'}`);
          lines.push(`**権限モード**: ${message.permissionMode || 'N/A'}`);
          const tools = Array.isArray(message.tools) ? message.tools.join(', ') : '不明';
          lines.push(`**利用可能ツール**: ${tools}\n`);
        } else if (message.type === 'assistant') {
          const content = message.message?.content || [];
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              lines.push(`## Turn ${turnNumber++}: AI応答\n`);
              lines.push(`${block.text}\n`);
            } else if (block.type === 'tool_use') {
              lines.push(`## Turn ${turnNumber++}: ツール使用\n`);
              lines.push(`**ツール**: \`${block.name}\`\n`);
              if (block.input) {
                lines.push('**パラメータ**:');
                for (const [key, value] of Object.entries(block.input)) {
                  const valueStr = typeof value === 'string' && value.length > 100
                    ? `${value.substring(0, 100)}...`
                    : String(value);
                  lines.push(`- \`${key}\`: \`${valueStr}\``);
                }
                lines.push('');
              }
            }
          }
        } else if (message.type === 'result') {
          lines.push(`## Turn ${turnNumber++}: 実行完了\n`);
          lines.push(`**ステータス**: ${message.subtype || 'success'}`);
          lines.push(`**所要時間**: ${message.duration_ms || duration}ms`);
          lines.push(`**ターン数**: ${message.num_turns || 'N/A'}`);
          if (message.result) {
            lines.push(`\n${message.result}\n`);
          }
        }
      } catch {
        continue;
      }
    }

    lines.push('\n---\n');
    lines.push(`**経過時間**: ${duration}ms`);
    lines.push(`**開始**: ${new Date(startTime).toISOString()}`);
    lines.push(`**終了**: ${new Date(endTime).toISOString()}`);
    if (error) {
      lines.push(`\n**エラー**: ${error.message}`);
    }

    return lines.join('\n');
  }

  private formatCodexAgentLog(
    messages: string[],
    startTime: number,
    endTime: number,
    duration: number,
    error: Error | null,
  ): string | null {
    const parseJson = (raw: string): Record<string, unknown> | null => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return null;
      }

      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    const asRecord = (value: unknown): Record<string, unknown> | null => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return null;
    };

    const getString = (source: Record<string, unknown> | null, key: string): string | null => {
      if (!source) {
        return null;
      }
      const candidate = source[key];
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return null;
    };

    const getNumber = (source: Record<string, unknown> | null, key: string): number | null => {
      if (!source) {
        return null;
      }
      const candidate = source[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      return null;
    };

    const describeItemType = (value: string): string => {
      const normalized = value.toLowerCase();
      if (normalized === 'command_execution') {
        return 'コマンド実行';
      }
      if (normalized === 'tool') {
        return 'ツール';
      }
      return value;
    };

    const truncate = (value: string, limit = 4000): { text: string; truncated: boolean } => {
      if (value.length <= limit) {
        return { text: value, truncated: false };
      }
      const sliced = value.slice(0, limit).replace(/\s+$/u, '');
      return { text: sliced, truncated: true };
    };

    const lines: string[] = [];
    lines.push('# Codex Agent 実行ログ\n');
    lines.push(`開始日時: ${new Date(startTime).toLocaleString('ja-JP')}\n`);
    lines.push('---\n');

    const pendingItems = new Map<string, { type: string; command?: string }>();
    let turnNumber = 1;
    let wroteContent = false;

    for (const rawMessage of messages) {
      const event = parseJson(rawMessage);
      if (!event) {
        continue;
      }

      const eventType = (getString(event, 'type') ?? '').toLowerCase();

      if (eventType === 'thread.started') {
        const threadId = getString(event, 'thread_id') ?? 'N/A';
        lines.push(`## Turn ${turnNumber++}: スレッド開始\n`);
        lines.push(`**Thread ID**: \`${threadId}\`\n`);
        wroteContent = true;
        continue;
      }

      if (eventType === 'turn.started' || eventType === 'turn.delta') {
        continue;
      }

      if (eventType === 'item.started') {
        const item = asRecord(event['item']);
        if (item) {
          const itemId = getString(item, 'id');
          if (itemId) {
            pendingItems.set(itemId, {
              type: (getString(item, 'type') ?? 'command_execution').toLowerCase(),
              command: getString(item, 'command') ?? undefined,
            });
          }
        }
        continue;
      }

      if (eventType === 'item.completed') {
        const item = asRecord(event['item']);
        if (!item) {
          continue;
        }

        const itemId = getString(item, 'id') ?? `item_${turnNumber}`;
        const info = pendingItems.get(itemId);
        const itemType = info?.type ?? (getString(item, 'type') ?? 'command_execution');
        const command = info?.command ?? getString(item, 'command');
        const status = getString(item, 'status') ?? 'completed';
        const exitCode = getNumber(item, 'exit_code');
        const aggregatedOutput = getString(item, 'aggregated_output');
        const truncatedOutput = aggregatedOutput ? truncate(aggregatedOutput, 4000) : null;

        lines.push(`## Turn ${turnNumber++}: ツール実行\n`);
        lines.push(`**種別**: ${describeItemType(itemType)}`);
        if (command) {
          lines.push(`**コマンド**: \`${command}\``);
        }
        lines.push(
          `**ステータス**: ${status}${exitCode !== null ? ` (exit_code=${exitCode})` : ''}`,
        );

        if (truncatedOutput) {
          lines.push('');
          lines.push('```text');
          lines.push(truncatedOutput.text);
          if (truncatedOutput.truncated) {
            lines.push('... (truncated)');
          }
          lines.push('```');
        }

        lines.push('');
        wroteContent = true;
        pendingItems.delete(itemId);
        continue;
      }

      if (eventType === 'response.completed' || eventType === 'turn.completed') {
        const status = getString(event, 'status') ?? 'completed';
        const eventDuration = getNumber(event, 'duration_ms') ?? duration;
        const turnCount =
          getNumber(event, 'turns') ?? getNumber(event, 'num_turns') ?? 'N/A';
        const info = getString(event, 'result') ?? getString(event, 'summary') ?? null;

        lines.push(`## Turn ${turnNumber++}: 実行完了\n`);
        lines.push(`**ステータス**: ${status}`);
        lines.push(`**所要時間**: ${eventDuration}ms`);
        lines.push(`**ターン数**: ${turnCount}`);
        if (info) {
          lines.push('');
          lines.push(info);
          lines.push('');
        }

        wroteContent = true;
      }
    }

    if (!wroteContent) {
      return null;
    }

    lines.push('\n---\n');
    lines.push(`**経過時間**: ${duration}ms`);
    lines.push(`**開始**: ${new Date(startTime).toISOString()}`);
    lines.push(`**終了**: ${new Date(endTime).toISOString()}`);
    if (error) {
      lines.push(`\n**エラー**: ${error.message}`);
    }

    return lines.join('\n');
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
    const statusEmoji: Record<string, string> = {
      pending: '⏸️',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
    };

    const phaseDefinitions: Array<{ key: PhaseName; number: string; label: string }> = [
      { key: 'planning', number: 'Phase 0', label: 'Planning' },
      { key: 'requirements', number: 'Phase 1', label: 'Requirements' },
      { key: 'design', number: 'Phase 2', label: 'Design' },
      { key: 'test_scenario', number: 'Phase 3', label: 'Test Scenario' },
      { key: 'implementation', number: 'Phase 4', label: 'Implementation' },
      { key: 'test_implementation', number: 'Phase 5', label: 'Test Implementation' },
      { key: 'testing', number: 'Phase 6', label: 'Testing' },
      { key: 'documentation', number: 'Phase 7', label: 'Documentation' },
      { key: 'report', number: 'Phase 8', label: 'Report' },
      { key: 'evaluation', number: 'Phase 9', label: 'Evaluation' },
    ];

    const phasesStatus = this.metadata.getAllPhasesStatus();
    phasesStatus[this.phaseName] = status;
    const parts: string[] = [];

    parts.push('## 🤖 AI Workflow - 進捗状況\n\n');
    parts.push('### 全体進捗\n\n');

    const completedDetails: Array<{
      number: string;
      label: string;
      data: PhaseMetadata | undefined;
    }> = [];
    let currentPhaseInfo:
      | {
          number: string;
          label: string;
          status: PhaseStatus;
          data: PhaseMetadata | undefined;
        }
      | null = null;

    for (const definition of phaseDefinitions) {
      const phaseStatus = phasesStatus[definition.key] ?? 'pending';
      const emoji = statusEmoji[phaseStatus] ?? '📝';
      const phaseData = this.metadata.data.phases[definition.key];

      let line = `- ${emoji} ${definition.number}: ${definition.label} - **${phaseStatus.toUpperCase()}**`;
      if (phaseStatus === 'completed' && phaseData?.completed_at) {
        line += ` (${phaseData.completed_at})`;
      } else if (phaseStatus === 'in_progress' && phaseData?.started_at) {
        line += ` (開始: ${phaseData.started_at})`;
      }

      parts.push(`${line}\n`);

      if (phaseStatus === 'completed') {
        completedDetails.push({
          number: definition.number,
          label: definition.label,
          data: phaseData,
        });
      }

      if (definition.key === this.phaseName) {
        currentPhaseInfo = {
          number: definition.number,
          label: definition.label,
          status: phaseStatus,
          data: phaseData,
        };
      }
    }

    if (currentPhaseInfo) {
      parts.push(
        `\n### 現在のフェーズ: ${currentPhaseInfo.number} (${currentPhaseInfo.label})\n\n`,
      );
      parts.push(`**ステータス**: ${currentPhaseInfo.status.toUpperCase()}\n`);

      const phaseData = currentPhaseInfo.data;
      if (phaseData?.started_at) {
        parts.push(`**開始時刻**: ${phaseData.started_at}\n`);
      }

      const retryCount = phaseData?.retry_count ?? 0;
      parts.push(`**試行回数**: ${retryCount + 1}/3\n`);

      if (details) {
        parts.push(`\n${details}\n`);
      }
    }

    if (completedDetails.length) {
      parts.push('\n<details>\n');
      parts.push('<summary>完了したフェーズの詳細</summary>\n\n');

      for (const info of completedDetails) {
        parts.push(`### ${info.number}: ${info.label}\n\n`);
        parts.push('**ステータス**: COMPLETED\n');

        const data = info.data;
        if (data?.review_result) {
          parts.push(`**レビュー結果**: ${data.review_result}\n`);
        }
        if (data?.completed_at) {
          parts.push(`**完了時刻**: ${data.completed_at}\n`);
        }

        parts.push('\n');
      }

      parts.push('</details>\n');
    }

    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const formattedNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    parts.push('\n---\n');
    parts.push(`*最終更新: ${formattedNow}*\n`);
    parts.push('*AI駆動開発自動化ワークフロー (Claude Agent SDK)*\n');

    return parts.join('');
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

  private async performReviewCycle(
    initialOutputFile: string | null,
    maxRetries: number,
  ): Promise<{
    success: boolean;
    reviewResult: PhaseExecutionResult | null;
    outputFile: string | null;
    error?: string;
  }> {
    let revisionAttempts = 0;
    let currentOutputFile = initialOutputFile;

    while (true) {
      console.info(`[INFO] Phase ${this.phaseName}: Starting review (attempt ${revisionAttempts + 1})...`);

      let reviewResult: PhaseExecutionResult;
      try {
        reviewResult = await this.review();
        console.info(`[INFO] Phase ${this.phaseName}: Review method completed. Success: ${reviewResult.success}`);
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        const stack = (error as Error).stack ?? '';
        console.error(`[ERROR] Phase ${this.phaseName}: Review method threw an exception: ${message}`);
        console.error(`[ERROR] Stack trace:\n${stack}`);
        return {
          success: false,
          reviewResult: null,
          outputFile: currentOutputFile,
          error: `Review threw an exception: ${message}`,
        };
      }

      if (reviewResult.success) {
        console.info(`[INFO] Phase ${this.phaseName}: Review passed with result: ${reviewResult.output ?? 'N/A'}`);
        return {
          success: true,
          reviewResult,
          outputFile: currentOutputFile,
        };
      }

      console.warn(`[WARNING] Phase ${this.phaseName}: Review failed: ${reviewResult.error ?? 'Unknown reason'}`);

      if (revisionAttempts >= maxRetries) {
        console.error(`[ERROR] Phase ${this.phaseName}: Max retries (${maxRetries}) reached. Review cycle failed.`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviewResult.error ?? 'Review failed.',
        };
      }

      const reviseFn = this.getReviseFunction();
      if (!reviseFn) {
        console.error(`[ERROR] Phase ${this.phaseName}: revise() method not implemented. Cannot retry.`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviewResult.error ?? 'Review failed and revise() is not implemented.',
        };
      }

      revisionAttempts += 1;

      let retryCount: number;
      try {
        retryCount = this.metadata.incrementRetryCount(this.phaseName);
      } catch (error) {
        console.error(`[ERROR] Phase ${this.phaseName}: Failed to increment retry count: ${(error as Error).message}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: (error as Error).message,
        };
      }

      console.info(`[INFO] Phase ${this.phaseName}: Starting revise (retry ${retryCount}/${maxRetries})...`);
      await this.postProgress(
        'in_progress',
        `レビュー不合格のため修正を実施します（${retryCount}/${maxRetries}回目）。`,
      );

      const feedback =
        reviewResult.error ?? 'レビューで不合格となりました。フィードバックをご確認ください。';

      let reviseResult: PhaseExecutionResult;
      try {
        reviseResult = await reviseFn(feedback);
        console.info(`[INFO] Phase ${this.phaseName}: Revise method completed. Success: ${reviseResult.success}`);
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        const stack = (error as Error).stack ?? '';
        console.error(`[ERROR] Phase ${this.phaseName}: Revise method threw an exception: ${message}`);
        console.error(`[ERROR] Stack trace:\n${stack}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: `Revise threw an exception: ${message}`,
        };
      }

      if (!reviseResult.success) {
        console.error(`[ERROR] Phase ${this.phaseName}: Revise failed: ${reviseResult.error ?? 'Unknown error'}`);
        return {
          success: false,
          reviewResult,
          outputFile: currentOutputFile,
          error: reviseResult.error ?? 'Revise failed.',
        };
      }

      console.info(`[INFO] Phase ${this.phaseName}: Revise completed successfully`);

      if (reviseResult.output) {
        currentOutputFile = reviseResult.output;
        console.info(`[INFO] Phase ${this.phaseName}: Updated output file: ${currentOutputFile}`);
      }
    }
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

  private extractUsageMetrics(messages: string[]): UsageMetrics | null {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCostUsd = 0;
    let found = false;

    for (const raw of messages) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const usage =
          (parsed.usage as Record<string, unknown> | undefined) ??
          ((parsed.result as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined);

        if (usage) {
          if (typeof usage.input_tokens === 'number') {
            inputTokens = usage.input_tokens;
            found = true;
          }
          if (typeof usage.output_tokens === 'number') {
            outputTokens = usage.output_tokens;
            found = true;
          }
        }

        const cost =
          (parsed.total_cost_usd as number | undefined) ??
          ((parsed.result as Record<string, unknown> | undefined)?.total_cost_usd as number | undefined);

        if (typeof cost === 'number') {
          totalCostUsd = cost;
          found = true;
        }
      } catch {
        const inputMatch =
          raw.match(/"input_tokens"\s*:\s*(\d+)/) ?? raw.match(/'input_tokens':\s*(\d+)/);
        const outputMatch =
          raw.match(/"output_tokens"\s*:\s*(\d+)/) ?? raw.match(/'output_tokens':\s*(\d+)/);
        const costMatch =
          raw.match(/"total_cost_usd"\s*:\s*([\d.]+)/) ?? raw.match(/total_cost_usd=([\d.]+)/);

        if (inputMatch) {
          inputTokens = Number.parseInt(inputMatch[1], 10);
          found = true;
        }
        if (outputMatch) {
          outputTokens = Number.parseInt(outputMatch[1], 10);
          found = true;
        }
        if (costMatch) {
          totalCostUsd = Number.parseFloat(costMatch[1]);
          found = true;
        }
      }
    }

    if (!found) {
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      totalCostUsd,
    };
  }

  private recordUsageMetrics(metrics: UsageMetrics | null) {
    this.lastExecutionMetrics = metrics;
    if (!metrics) {
      return;
    }

    if (metrics.inputTokens > 0 || metrics.outputTokens > 0 || metrics.totalCostUsd > 0) {
      this.metadata.addCost(metrics.inputTokens, metrics.outputTokens, metrics.totalCostUsd);
    }
  }
}
