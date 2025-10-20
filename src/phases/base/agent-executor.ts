/**
 * Agent Executor
 *
 * Codex/Claude Agentの実行ロジックを提供します。
 * base-phase.tsから分離されたAgent実行専用クラスです。
 */

import fs from 'fs-extra';
import path from 'node:path';
import { CodexAgentClient } from '../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import { AgentLogFormatter } from './agent-log-formatter.js';
import { PhaseName } from '../../types.js';

type UsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
};

/**
 * AgentExecutor クラス
 *
 * Agent（Codex または Claude）の実行、ログ保存、使用量メトリクス抽出を担当します。
 */
export class AgentExecutor {
  private logFormatter: AgentLogFormatter;

  constructor(
    private codex: CodexAgentClient | null,
    private claude: ClaudeAgentClient | null,
    private workingDir: string,
    private phaseName: PhaseName,
  ) {
    this.logFormatter = new AgentLogFormatter();
  }

  /**
   * Agentでタスクを実行
   *
   * プライマリAgent（Codex）で実行し、失敗時は自動的にClaudeにフォールバックします。
   *
   * @param prompt - Agent に渡すプロンプト
   * @param options - 実行オプション
   * @returns Agentからのメッセージ配列
   * @throws Agent実行エラー
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

    // 認証エラー時のフォールバック
    if (finalResult.authFailed && primaryAgent === this.codex && this.claude) {
      console.warn('[WARNING] Codex authentication failed. Falling back to Claude Code agent.');
      this.codex = null;
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    // 空出力時のフォールバック
    if (finalResult.messages.length === 0 && this.claude && primaryAgent === this.codex) {
      console.warn('[WARNING] Codex agent produced no output. Trying Claude Code agent as fallback.');
      const fallbackResult = await this.runAgentTask(this.claude, 'Claude Agent', prompt, options);
      return fallbackResult.messages;
    }

    return finalResult.messages;
  }

  /**
   * Agent タスクを実行（内部メソッド）
   *
   * @param agent - Agent クライアント
   * @param agentName - Agent 名
   * @param prompt - プロンプト
   * @param options - 実行オプション
   * @returns メッセージ配列と認証失敗フラグ
   */
  private async runAgentTask(
    agent: CodexAgentClient | ClaudeAgentClient,
    agentName: string,
    prompt: string,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string },
  ): Promise<{ messages: string[]; authFailed: boolean }> {
    const logDir = options?.logDir ?? path.join(this.workingDir, '.ai-workflow', 'logs');
    fs.ensureDirSync(logDir);

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

    const agentLogContent = this.logFormatter.formatAgentLog(
      messages,
      startTime,
      endTime,
      duration,
      error,
      agentName,
    );
    fs.writeFileSync(agentLogFile, agentLogContent, 'utf-8');
    console.info(`[INFO] Agent log saved to: ${agentLogFile}`);

    if (error) {
      throw error;
    }

    // 認証エラーの検出
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
   * 使用量メトリクスを抽出
   *
   * Agentメッセージ配列からトークン使用量とコスト情報を抽出します。
   *
   * @param messages - Agentメッセージ配列
   * @returns 使用量メトリクス、または null（メトリクスが見つからない場合）
   */
  extractUsageMetrics(messages: string[]): UsageMetrics | null {
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
        // JSON解析失敗時は正規表現で抽出を試みる
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
}
