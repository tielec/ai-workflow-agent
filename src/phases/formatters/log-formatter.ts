/**
 * LogFormatter - エージェントログのフォーマット変換を担当
 *
 * Codex/Claude の生ログを Markdown 形式に変換するモジュール。
 * - Codex: JSON イベントストリームを解析し、ターンごとの内訳を生成
 * - Claude: JSON メッセージを解析し、ツール使用と結果を含む Markdown を生成
 * - 4000文字を超える出力は切り詰め（truncate）
 */

export class LogFormatter {
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
    lines.push('# Claude Agent 実行ログ\n');
    lines.push(`生成日時: ${new Date(startTime).toLocaleString('ja-JP')}\n`);
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
            lines.push(`## Turn ${turnNumber++}: システム初期化\n`);
            lines.push(`**セッションID**: \`${this.getString(messageRecord, 'session_id') || 'N/A'}\``);
            lines.push(`**モデル**: ${this.getString(messageRecord, 'model') || 'N/A'}`);
            lines.push(`**権限モード**: ${this.getString(messageRecord, 'permissionMode') || 'N/A'}`);

            const tools = messageRecord.tools;
            const toolsStr = Array.isArray(tools) ? tools.join(', ') : '不明';
            lines.push(`**利用可能ツール**: ${toolsStr}\n`);
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
                lines.push(`## Turn ${turnNumber++}: AI応答\n`);
                lines.push(`${text}\n`);
              }
            } else if (blockType === 'tool_use') {
              lines.push(`## Turn ${turnNumber++}: ツール使用\n`);
              lines.push(`**ツール**: \`${this.getString(blockRecord, 'name') || 'N/A'}\`\n`);

              const input = this.asRecord(blockRecord.input);
              if (input) {
                lines.push('**パラメータ**:');
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
          lines.push(`## Turn ${turnNumber++}: 実行完了\n`);
          lines.push(`**ステータス**: ${this.getString(messageRecord, 'subtype') || 'success'}`);
          lines.push(`**所要時間**: ${this.getNumber(messageRecord, 'duration_ms') || duration}ms`);
          lines.push(`**ターン数**: ${this.getNumber(messageRecord, 'num_turns') || 'N/A'}`);

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
    lines.push(`**経過時間**: ${duration}ms`);
    lines.push(`**開始**: ${new Date(startTime).toISOString()}`);
    lines.push(`**終了**: ${new Date(endTime).toISOString()}`);
    if (error) {
      lines.push(`\n**エラー**: ${error.message}`);
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

      const eventRecord = this.asRecord(event);
      if (!eventRecord) {
        continue;
      }

      const eventType = (this.getString(eventRecord, 'type') ?? '').toLowerCase();

      if (eventType === 'thread.started') {
        const threadId = this.getString(eventRecord, 'thread_id') ?? 'N/A';
        lines.push(`## Turn ${turnNumber++}: スレッド開始\n`);
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
        const status = this.getString(eventRecord, 'status') ?? 'completed';
        const eventDuration = this.getNumber(eventRecord, 'duration_ms') ?? duration;
        const turnCount =
          this.getNumber(eventRecord, 'turns') ?? this.getNumber(eventRecord, 'num_turns') ?? 'N/A';
        const info = this.getString(eventRecord, 'result') ?? this.getString(eventRecord, 'summary') ?? null;

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
   * アイテム種別の日本語変換
   */
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
