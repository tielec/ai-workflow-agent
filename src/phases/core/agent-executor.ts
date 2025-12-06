/**
 * AgentExecutor - エージェント実行ロジックを担当
 *
 * Codex/Claude エージェントの実行、フォールバック処理、利用量メトリクス抽出を担当するモジュール。
 * - プライマリエージェント（Codex または Claude）の実行
 * - 認証エラー時のフォールバック処理
 * - 空出力時のフォールバック処理
 * - 利用量メトリクスの抽出・記録
 */

import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { CodexAgentClient } from '../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { LogFormatter } from '../formatters/log-formatter.js';
import { PhaseName } from '../../types.js';

type UsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
};

export class AgentExecutor {
  private codex: CodexAgentClient | null;
  private claude: ClaudeAgentClient | null;
  private readonly logFormatter: LogFormatter;
  private readonly metadata: MetadataManager;
  private readonly phaseName: PhaseName;
  private readonly workingDir: string;
  private readonly getAgentWorkingDirectoryFn: (() => string) | null;
  private lastExecutionMetrics: UsageMetrics | null = null;

  /**
   * @param codex - Codex エージェントクライアント
   * @param claude - Claude エージェントクライアント
   * @param metadata - メタデータマネージャー
   * @param phaseName - フェーズ名
   * @param workingDir - 作業ディレクトリ（フォールバック用）
   * @param getAgentWorkingDirectoryFn - REPOS_ROOT対応の作業ディレクトリ取得関数（Issue #264）
   */
  constructor(
    codex: CodexAgentClient | null,
    claude: ClaudeAgentClient | null,
    metadata: MetadataManager,
    phaseName: PhaseName,
    workingDir: string,
    getAgentWorkingDirectoryFn?: () => string,
  ) {
    this.codex = codex;
    this.claude = claude;
    this.logFormatter = new LogFormatter();
    this.metadata = metadata;
    this.phaseName = phaseName;
    this.workingDir = workingDir;
    this.getAgentWorkingDirectoryFn = getAgentWorkingDirectoryFn ?? null;
  }

  /**
   * エージェントを使用してタスクを実行
   *
   * @param prompt - プロンプト文字列
   * @param options - 実行オプション（maxTurns、verbose、logDir）
   * @returns エージェントが生成したメッセージ配列
   */
  async executeWithAgent(
    prompt: string,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string },
  ): Promise<string[]> {
    const primaryAgent = this.codex ?? this.claude;
    if (!primaryAgent) {
      throw new Error('No agent client configured for this phase.');
    }

    const primaryName = this.codex && primaryAgent === this.codex ? 'Codex Agent' : 'Claude Agent';
    logger.info(`Using ${primaryName} for phase ${this.phaseName}`);

    let primaryResult: { messages: string[]; authFailed: boolean } | null = null;

    try {
      primaryResult = await this.runAgentTask(primaryAgent, primaryName, prompt, options);
    } catch (error) {
      // Codex 失敗時の Claude へのフォールバック
      if (primaryAgent === this.codex && this.claude) {
        const err = error as NodeJS.ErrnoException & { code?: string };
        const message = err?.message ?? String(error);
        const binaryPath = this.codex?.getBinaryPath?.();

        if (err?.code === 'CODEX_CLI_NOT_FOUND') {
          logger.warn(
            `Codex CLI not found at ${binaryPath ?? 'codex'}: ${message}`,
          );
        } else {
          logger.warn(`Codex agent failed: ${message}`);
        }

        logger.warn('Falling back to Claude Code agent.');
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

    // 認証失敗時のフォールバック
    if (finalResult.authFailed && primaryAgent === this.codex && this.claude) {
      logger.warn('Codex authentication failed. Falling back to Claude Code agent.');
      this.codex = null;
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    // 空出力時のフォールバック
    if (finalResult.messages.length === 0 && this.claude && primaryAgent === this.codex) {
      logger.warn('Codex agent produced no output. Trying Claude Code agent as fallback.');
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    return finalResult.messages;
  }

  /**
   * 最後に実行したエージェントの利用量メトリクスを取得
   *
   * @returns 利用量メトリクス（存在する場合）
   */
  getLastExecutionMetrics(): UsageMetrics | null {
    return this.lastExecutionMetrics;
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * エージェントタスクを実行
   *
   * @param agent - エージェントクライアント
   * @param agentName - エージェント名
   * @param prompt - プロンプト文字列
   * @param options - 実行オプション
   * @returns メッセージ配列と認証失敗フラグ
   */
  private async runAgentTask(
    agent: CodexAgentClient | ClaudeAgentClient,
    agentName: string,
    prompt: string,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string },
  ): Promise<{ messages: string[]; authFailed: boolean }> {
    const logDir = options?.logDir ?? path.join(this.metadata.workflowDir, `${this.getPhaseNumber(this.phaseName)}_${this.phaseName}`, 'execute');
    const promptFile = path.join(logDir, 'prompt.txt');
    const rawLogFile = path.join(logDir, 'agent_log_raw.txt');
    const agentLogFile = path.join(logDir, 'agent_log.md');

    // ディレクトリ確保
    fs.ensureDirSync(logDir);

    // プロンプトファイルの保存
    fs.writeFileSync(promptFile, prompt, 'utf-8');
    logger.info(`Prompt saved to: ${promptFile}`);
    logger.info(`Running ${agentName} for phase ${this.phaseName}`);

    const startTime = Date.now();
    let messages: string[] = [];
    let error: Error | null = null;

    // Issue #264: REPOS_ROOT対応の作業ディレクトリを使用
    // getAgentWorkingDirectoryFn が設定されている場合はそちらを優先
    const agentWorkingDir = this.getAgentWorkingDirectoryFn?.() ?? this.workingDir;
    logger.debug(`Agent working directory: ${agentWorkingDir}`);

    try {
      messages = await agent.executeTask({
        prompt,
        maxTurns: options?.maxTurns ?? 50,
        workingDirectory: agentWorkingDir,
        verbose: options?.verbose,
      });
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 生ログの保存
    fs.writeFileSync(rawLogFile, messages.join('\n'), 'utf-8');
    logger.info(`Raw log saved to: ${rawLogFile}`);

    if (agentName === 'Codex Agent') {
      logger.debug('Codex agent emitted messages:');
      messages.slice(0, 10).forEach((line, index) => {
        logger.debug(`[Codex][${index}] ${line}`);
      });
    }

    // フォーマット済みログの保存
    const agentLogContent = this.logFormatter.formatAgentLog(
      messages,
      startTime,
      endTime,
      duration,
      error,
      agentName,
    );
    fs.writeFileSync(agentLogFile, agentLogContent, 'utf-8');
    logger.info(`Agent log saved to: ${agentLogFile}`);

    if (error) {
      throw error;
    }

    // 利用量メトリクスの抽出・記録
    const usage = this.extractUsageMetrics(messages);
    this.recordUsageMetrics(usage);

    // 認証失敗検出
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

  /**
   * 利用量メトリクスを抽出
   *
   * @param messages - エージェントが生成したメッセージ配列
   * @returns 利用量メトリクス（存在しない場合は null）
   */
  private extractUsageMetrics(messages: string[]): UsageMetrics | null {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCostUsd = 0;
    let found = false;

    for (const raw of messages) {
      try {
        // JSON パース
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
        // JSON パース失敗時は正規表現でフォールバック
        const inputMatch =
          raw.match(/"input_tokens"\s*:\s*(\d+)/) ?? raw.match(/'input_tokens':\s*(\d+)/) ?? raw.match(/Input tokens:\s*(\d+)/i);
        const outputMatch =
          raw.match(/"output_tokens"\s*:\s*(\d+)/) ?? raw.match(/'output_tokens':\s*(\d+)/) ?? raw.match(/Output tokens:\s*(\d+)/i);
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

  /**
   * 利用量メトリクスを記録
   *
   * @param metrics - 利用量メトリクス
   */
  private recordUsageMetrics(metrics: UsageMetrics | null) {
    this.lastExecutionMetrics = metrics;
    if (!metrics) {
      return;
    }

    if (metrics.inputTokens > 0 || metrics.outputTokens > 0 || metrics.totalCostUsd > 0) {
      this.metadata.addCost(metrics.inputTokens, metrics.outputTokens, metrics.totalCostUsd);
    }
  }

  /**
   * フェーズ番号を取得
   *
   * @param phase - フェーズ名
   * @returns フェーズ番号（文字列）
   */
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
}
