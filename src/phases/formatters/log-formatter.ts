/**
 * LogFormatter - エージェントログのフォーマット変換を担当
 *
 * Codex/Claude の生ログを Markdown 形式に変換するモジュール。
 * - Codex: JSON イベントストリームを解析し、ターンごとの内訳を生成
 * - Claude: JSON メッセージを解析し、ツール使用と結果を含む Markdown を生成
 * - 4000文字を超える出力は切り詰め（truncate）
 */

import { DEFAULT_LANGUAGE, SupportedLanguage } from '../../types.js';

interface LogFormatterMessages {
  claudeAgentLog: string;
  generatedAt: string;
  systemInit: string;
  sessionId: string;
  model: string;
  permissionMode: string;
  availableTools: string;
  unknown: string;
  aiResponse: string;
  toolUse: string;
  tool: string;
  parameters: string;
  executionComplete: string;
  status: string;
  elapsed: string;
  turns: string;
  totalElapsed: string;
  started: string;
  finished: string;
  error: string;

  codexAgentLog: string;
  startedAt: string;
  threadStart: string;
  toolExecution: string;
  type: string;
  command: string;

  commandExecution: string;
  toolType: string;
}

const LOG_FORMATTER_TEXT: Record<SupportedLanguage, LogFormatterMessages> = {
  ja: {
    claudeAgentLog: 'Claude Agent 実行ログ',
    generatedAt: '生成日時',
    systemInit: 'システム初期化',
    sessionId: 'セッションID',
    model: 'モデル',
    permissionMode: '権限モード',
    availableTools: '利用可能ツール',
    unknown: '不明',
    aiResponse: 'AI応答',
    toolUse: 'ツール使用',
    tool: 'ツール',
    parameters: 'パラメータ',
    executionComplete: '実行完了',
    status: 'ステータス',
    elapsed: '所要時間',
    turns: 'ターン数',
    totalElapsed: '経過時間',
    started: '開始',
    finished: '終了',
    error: 'エラー',
    codexAgentLog: 'Codex Agent 実行ログ',
    startedAt: '開始日時',
    threadStart: 'スレッド開始',
    toolExecution: 'ツール実行',
    type: '種別',
    command: 'コマンド',
    commandExecution: 'コマンド実行',
    toolType: 'ツール',
  },
  en: {
    claudeAgentLog: 'Claude Agent Execution Log',
    generatedAt: 'Generated At',
    systemInit: 'System Initialization',
    sessionId: 'Session ID',
    model: 'Model',
    permissionMode: 'Permission Mode',
    availableTools: 'Available Tools',
    unknown: 'Unknown',
    aiResponse: 'AI Response',
    toolUse: 'Tool Use',
    tool: 'Tool',
    parameters: 'Parameters',
    executionComplete: 'Execution Complete',
    status: 'Status',
    elapsed: 'Elapsed',
    turns: 'Turns',
    totalElapsed: 'Total Elapsed',
    started: 'Started',
    finished: 'Finished',
    error: 'Error',
    codexAgentLog: 'Codex Agent Execution Log',
    startedAt: 'Started At',
    threadStart: 'Thread Started',
    toolExecution: 'Tool Execution',
    type: 'Type',
    command: 'Command',
    commandExecution: 'Command Execution',
    toolType: 'Tool',
  },
};

export class LogFormatter {
  private readonly language: SupportedLanguage;
  private readonly messages: LogFormatterMessages;
  private readonly locale: 'ja-JP' | 'en-US';

  /**
   * @param language - 出力言語（既定: ja）
   */
  constructor(language: SupportedLanguage = DEFAULT_LANGUAGE) {
    const selectedLanguage = Object.prototype.hasOwnProperty.call(LOG_FORMATTER_TEXT, language)
      ? language
      : DEFAULT_LANGUAGE;
    this.language = selectedLanguage;
    this.messages = LOG_FORMATTER_TEXT[selectedLanguage];
    this.locale = selectedLanguage === 'ja' ? 'ja-JP' : 'en-US';
  }

  /**
   * エージェントログを Markdown 形式に変換
   *
   * @param messages - エージェントが生成したメッセージ配列
   * @param startTime - 開始時刻（ミリ秒）
   * @param endTime - 終了時刻（ミリ秒）
   * @param duration - 実行時間（ミリ秒）
   * @param error - エラー（存在する場合）
   * @param agentName - エージェント名（'Codex Agent' | 'Claude Agent'）
   * @returns Markdown 形式のログ
   */
  formatAgentLog(
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

      // Codex ログのパース失敗時のフォールバック
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

    // Claude Agent のログフォーマット
    const lines: string[] = [];
    lines.push(`# ${this.messages.claudeAgentLog}\n`);
    lines.push(`${this.messages.generatedAt}: ${new Date(startTime).toLocaleString(this.locale)}\n`);
    lines.push('---\n');

    let turnNumber = 1;
    for (const rawMessage of messages) {
      try {
        const message = this.parseJson(rawMessage);
        if (!message) {
          continue;
        }

        const messageRecord = this.asRecord(message);
        if (!messageRecord) {
          continue;
        }

        const messageType = this.getString(messageRecord, 'type');

        if (messageType === 'system') {
          const subtype = this.getString(messageRecord, 'subtype');
          if (subtype === 'init') {
            lines.push(`## Turn ${turnNumber++}: ${this.messages.systemInit}\n`);
            lines.push(
              `**${this.messages.sessionId}**: \`${this.getString(messageRecord, 'session_id') || 'N/A'}\``,
            );
            lines.push(`**${this.messages.model}**: ${this.getString(messageRecord, 'model') || 'N/A'}`);
            lines.push(
              `**${this.messages.permissionMode}**: ${this.getString(messageRecord, 'permissionMode') || 'N/A'}`,
            );

            const tools = messageRecord.tools;
            const toolsStr = Array.isArray(tools) ? tools.join(', ') : this.messages.unknown;
            lines.push(`**${this.messages.availableTools}**: ${toolsStr}\n`);
          }
        } else if (messageType === 'assistant') {
          const messageObj = this.asRecord(messageRecord.message);
          const content = messageObj ? messageObj.content : null;
          const contentArray = Array.isArray(content) ? content : [];

          for (const block of contentArray) {
            const blockRecord = this.asRecord(block);
            if (!blockRecord) {
              continue;
            }

            const blockType = this.getString(blockRecord, 'type');

            if (blockType === 'text') {
              const text = this.getString(blockRecord, 'text');
              if (text) {
                lines.push(`## Turn ${turnNumber++}: ${this.messages.aiResponse}\n`);
                lines.push(`${text}\n`);
              }
            } else if (blockType === 'tool_use') {
              lines.push(`## Turn ${turnNumber++}: ${this.messages.toolUse}\n`);
              lines.push(`**${this.messages.tool}**: \`${this.getString(blockRecord, 'name') || 'N/A'}\`\n`);

              const input = this.asRecord(blockRecord.input);
              if (input) {
                lines.push(`**${this.messages.parameters}**:`);
                for (const [key, value] of Object.entries(input)) {
                  const valueStr = typeof value === 'string' && value.length > 100
                    ? `${value.substring(0, 100)}...`
                    : String(value);
                  lines.push(`- \`${key}\`: \`${valueStr}\``);
                }
                lines.push('');
              }
            }
          }
        } else if (messageType === 'result') {
          lines.push(`## Turn ${turnNumber++}: ${this.messages.executionComplete}\n`);
          lines.push(`**${this.messages.status}**: ${this.getString(messageRecord, 'subtype') || 'success'}`);
          lines.push(`**${this.messages.elapsed}**: ${this.getNumber(messageRecord, 'duration_ms') || duration}ms`);
          lines.push(`**${this.messages.turns}**: ${this.getNumber(messageRecord, 'num_turns') || 'N/A'}`);

          const result = this.getString(messageRecord, 'result');
          if (result) {
            lines.push(`\n${result}\n`);
          }
        }
      } catch {
        // JSON パース失敗時はスキップ
        continue;
      }
    }

    lines.push('\n---\n');
    lines.push(`**${this.messages.totalElapsed}**: ${duration}ms`);
    lines.push(`**${this.messages.started}**: ${new Date(startTime).toLocaleString(this.locale)}`);
    lines.push(`**${this.messages.finished}**: ${new Date(endTime).toLocaleString(this.locale)}`);
    if (error) {
      lines.push(`\n**${this.messages.error}**: ${error.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Codex エージェントログを Markdown 形式に変換
   *
   * @param messages - JSON イベントストリーム
   * @param startTime - 開始時刻（ミリ秒）
   * @param endTime - 終了時刻（ミリ秒）
   * @param duration - 実行時間（ミリ秒）
   * @param error - エラー（存在する場合）
   * @returns Markdown 形式のログ、またはパース失敗時は null
   */
  formatCodexAgentLog(
    messages: string[],
    startTime: number,
    endTime: number,
    duration: number,
    error: Error | null,
  ): string | null {
    const lines: string[] = [];
    lines.push(`# ${this.messages.codexAgentLog}\n`);
    lines.push(`${this.messages.startedAt}: ${new Date(startTime).toLocaleString(this.locale)}\n`);
    lines.push('---\n');

    const pendingItems = new Map<string, { type: string; command?: string }>();
    let turnNumber = 1;
    let wroteContent = false;

    for (const rawMessage of messages) {
      const event = this.parseJson(rawMessage);
      if (!event) {
        continue;
      }

      const eventRecord = this.asRecord(event);
      if (!eventRecord) {
        continue;
      }

      const eventType = (this.getString(eventRecord, 'type') ?? '').toLowerCase();

      if (eventType === 'thread.started') {
        const threadId = this.getString(eventRecord, 'thread_id') ?? 'N/A';
        lines.push(`## Turn ${turnNumber++}: ${this.messages.threadStart}\n`);
        lines.push(`**Thread ID**: \`${threadId}\`\n`);
        wroteContent = true;
        continue;
      }

      if (eventType === 'turn.started' || eventType === 'turn.delta') {
        continue;
      }

      if (eventType === 'item.started') {
        const item = this.asRecord(eventRecord['item']);
        if (item) {
          const itemId = this.getString(item, 'id');
          if (itemId) {
            pendingItems.set(itemId, {
              type: (this.getString(item, 'type') ?? 'command_execution').toLowerCase(),
              command: this.getString(item, 'command') ?? undefined,
            });
          }
        }
        continue;
      }

      if (eventType === 'item.completed') {
        const item = this.asRecord(eventRecord['item']);
        if (!item) {
          continue;
        }

        const itemId = this.getString(item, 'id') ?? `item_${turnNumber}`;
        const info = pendingItems.get(itemId);
        const itemType = info?.type ?? (this.getString(item, 'type') ?? 'command_execution');
        const command = info?.command ?? this.getString(item, 'command');
        const status = this.getString(item, 'status') ?? 'completed';
        const exitCode = this.getNumber(item, 'exit_code');
        const aggregatedOutput = this.getString(item, 'aggregated_output');
        const truncatedOutput = aggregatedOutput ? this.truncate(aggregatedOutput, 4000) : null;

        lines.push(`## Turn ${turnNumber++}: ${this.messages.toolExecution}\n`);
        lines.push(`**${this.messages.type}**: ${this.describeItemType(itemType)}`);
        if (command) {
          lines.push(`**${this.messages.command}**: \`${command}\``);
        }
        lines.push(
          `**${this.messages.status}**: ${status}${exitCode !== null ? ` (exit_code=${exitCode})` : ''}`,
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
        const status = this.getString(eventRecord, 'status') ?? 'completed';
        const eventDuration = this.getNumber(eventRecord, 'duration_ms') ?? duration;
        const turnCount =
          this.getNumber(eventRecord, 'turns') ?? this.getNumber(eventRecord, 'num_turns') ?? 'N/A';
        const info = this.getString(eventRecord, 'result') ?? this.getString(eventRecord, 'summary') ?? null;

        lines.push(`## Turn ${turnNumber++}: ${this.messages.executionComplete}\n`);
        lines.push(`**${this.messages.status}**: ${status}`);
        lines.push(`**${this.messages.elapsed}**: ${eventDuration}ms`);
        lines.push(`**${this.messages.turns}**: ${turnCount}`);
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
    lines.push(`**${this.messages.totalElapsed}**: ${duration}ms`);
    lines.push(`**${this.messages.started}**: ${new Date(startTime).toLocaleString(this.locale)}`);
    lines.push(`**${this.messages.finished}**: ${new Date(endTime).toLocaleString(this.locale)}`);
    if (error) {
      lines.push(`\n**${this.messages.error}**: ${error.message}`);
    }

    return lines.join('\n');
  }

  // ========================================
  // プライベートヘルパーメソッド
  // ========================================

  /**
   * JSON パース（エラーハンドリング付き）
   */
  private parseJson(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * オブジェクト型アサーション
   */
  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  /**
   * 文字列取得
   */
  private getString(source: Record<string, unknown> | null, key: string): string | null {
    if (!source) {
      return null;
    }
    const candidate = source[key];
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  /**
   * 数値取得
   */
  private getNumber(source: Record<string, unknown> | null, key: string): number | null {
    if (!source) {
      return null;
    }
    const candidate = source[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    return null;
  }

  /**
   * アイテム種別の変換
   */
  private describeItemType(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized === 'command_execution') {
      return this.messages.commandExecution;
    }
    if (normalized === 'tool') {
      return this.messages.toolType;
    }
    return value;
  }

  /**
   * 文字列切り詰め
   */
  private truncate(value: string, limit = 4000): { text: string; truncated: boolean } {
    if (value.length <= limit) {
      return { text: value, truncated: false };
    }
    const sliced = value.slice(0, limit).replace(/\s+$/u, '');
    return { text: sliced, truncated: true };
  }
}
