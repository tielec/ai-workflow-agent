/**
 * Agent Log Formatter
 *
 * Codex/Claude Agentの実行ログをMarkdown形式にフォーマットする機能を提供します。
 * base-phase.tsから分離されたログフォーマット専用クラスです。
 */

/**
 * AgentLogFormatter クラス
 *
 * Agentの実行ログ（JSON形式のメッセージ配列）を読みやすいMarkdown形式に変換します。
 * Codex AgentとClaude Agentの両方に対応しています。
 */
export class AgentLogFormatter {
  /**
   * Agentログをフォーマット
   *
   * @param messages - Agent実行時のメッセージ配列
   * @param startTime - 実行開始時刻（ミリ秒）
   * @param endTime - 実行終了時刻（ミリ秒）
   * @param duration - 実行時間（ミリ秒）
   * @param error - エラー（存在する場合）
   * @param agentName - Agent名（'Codex Agent' または 'Claude Agent'）
   * @returns Markdown形式のログ文字列
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

      // Fallback: 単純なJSON表示
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
        // JSON解析エラーは無視
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

  /**
   * Codex Agentログをフォーマット（詳細版）
   *
   * JSON イベントストリーミング形式のCodex Agentログを解析し、
   * ターンごとの詳細情報を含むMarkdownを生成します。
   *
   * @param messages - Codex Agent実行時のメッセージ配列
   * @param startTime - 実行開始時刻（ミリ秒）
   * @param endTime - 実行終了時刻（ミリ秒）
   * @param duration - 実行時間（ミリ秒）
   * @param error - エラー（存在する場合）
   * @returns Markdown形式のログ文字列、または null（イベントが解析できない場合）
   */
  formatCodexAgentLog(
    messages: string[],
    startTime: number,
    endTime: number,
    duration: number,
    error: Error | null,
  ): string | null {
    const lines: string[] = [];
    lines.push('# Codex Agent 実行ログ\n');
    lines.push(`開始日時: ${new Date(startTime).toLocaleString('ja-JP')}\n`);
    lines.push('---\n');

    const pendingItems = new Map<string, { type: string; command?: string }>();
    let turnNumber = 1;
    let wroteContent = false;

    for (const rawMessage of messages) {
      const event = this.parseJson(rawMessage);
      if (!event) {
        continue;
      }

      const eventType = (this.getString(event, 'type') ?? '').toLowerCase();

      if (eventType === 'thread.started') {
        const threadId = this.getString(event, 'thread_id') ?? 'N/A';
        lines.push(`## Turn ${turnNumber++}: スレッド開始\n`);
        lines.push(`**Thread ID**: \`${threadId}\`\n`);
        wroteContent = true;
        continue;
      }

      if (eventType === 'turn.started' || eventType === 'turn.delta') {
        continue;
      }

      if (eventType === 'item.started') {
        const item = this.asRecord(event['item']);
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
        const item = this.asRecord(event['item']);
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

        lines.push(`## Turn ${turnNumber++}: ツール実行\n`);
        lines.push(`**種別**: ${this.describeItemType(itemType)}`);
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
        const status = this.getString(event, 'status') ?? 'completed';
        const eventDuration = this.getNumber(event, 'duration_ms') ?? duration;
        const turnCount =
          this.getNumber(event, 'turns') ?? this.getNumber(event, 'num_turns') ?? 'N/A';
        const info = this.getString(event, 'result') ?? this.getString(event, 'summary') ?? null;

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

  // ヘルパーメソッド

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

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

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

  private describeItemType(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized === 'command_execution') {
      return 'コマンド実行';
    }
    if (normalized === 'tool') {
      return 'ツール';
    }
    return value;
  }

  private truncate(value: string, limit = 4000): { text: string; truncated: boolean } {
    if (value.length <= limit) {
      return { text: value, truncated: false };
    }
    const sliced = value.slice(0, limit).replace(/\s+$/u, '');
    return { text: sliced, truncated: true };
  }
}
