/**
 * Log Formatter
 *
 * エージェントログのフォーマット処理を提供するヘルパーモジュール
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CodexEvent } from './agent-event-parser.js';

/**
 * ログ引数の最大長（切り詰め用）
 */
export const MAX_LOG_PARAM_LENGTH = 500;

/**
 * Codexログをフォーマット
 *
 * @param eventType - イベントタイプ
 * @param payload - CodexEventオブジェクト
 * @returns フォーマット済みログ文字列
 */
export function formatCodexLog(eventType: string, payload: CodexEvent): string {
  const logs: string[] = [];

  switch (eventType) {
    case 'assistant':
    case 'assistant_message': {
      const content = payload.message?.content ?? [];
      for (const block of content) {
        const blockType = block.type;
        if (blockType === 'text') {
          const text = typeof block.text === 'string' ? block.text.trim() : '';
          if (text) {
            logs.push(`[CODEX THINKING] ${text}`);
          }
        } else if (blockType === 'tool_use') {
          const name = typeof block.name === 'string' ? block.name : 'unknown';
          logs.push(`[CODEX ACTION] Using tool: ${name}`);
          if (block.input && typeof block.input === 'object') {
            const rawInput = JSON.stringify(block.input);
            const truncated = truncateInput(rawInput, MAX_LOG_PARAM_LENGTH);
            logs.push(`[CODEX ACTION] Parameters: ${truncated}`);
          }
        }
      }
      break;
    }
    case 'result':
    case 'session_result': {
      const status = payload.status ?? payload.subtype ?? 'success';
      const turns = payload.turns ?? payload.message?.content?.length ?? 'N/A';
      const duration = payload.duration_ms ?? 'N/A';
      logs.push(`[CODEX RESULT] status=${status}, turns=${turns}, duration_ms=${duration}`);
      if (payload.result && typeof payload.result === 'string' && payload.result.trim()) {
        logs.push(`[CODEX RESULT] ${payload.result.trim()}`);
      }
      break;
    }
    case 'system': {
      const subtype = payload.subtype ?? 'system';
      logs.push(`[CODEX SYSTEM] ${subtype}`);
      break;
    }
    case 'item.started': {
      const item = payload.item as Record<string, unknown> | undefined;
      if (item) {
        const itemType = item.type ?? 'unknown';
        if (itemType === 'command_execution') {
          const command = typeof item.command === 'string' ? item.command : '';
          const shortCommand = command.length > 100 ? `${command.slice(0, 100)}...` : command;
          logs.push(`[CODEX EXEC] Starting: ${shortCommand}`);
        } else if (itemType === 'todo_list') {
          const items = item.items as Array<{ text?: string; completed?: boolean }> | undefined;
          if (items && items.length > 0) {
            logs.push(`[CODEX TODO] Planning ${items.length} task(s):`);
            items.slice(0, 5).forEach((task, i) => {
              const text = typeof task.text === 'string' ? task.text : '';
              const shortText = text.length > 80 ? `${text.slice(0, 80)}...` : text;
              logs.push(`  ${i + 1}. ${shortText}`);
            });
            if (items.length > 5) {
              logs.push(`  ... and ${items.length - 5} more`);
            }
          }
        } else {
          logs.push(`[CODEX] Starting ${itemType}`);
        }
      }
      break;
    }
    case 'item.completed': {
      const item = payload.item as Record<string, unknown> | undefined;
      if (item) {
        const itemType = item.type ?? 'unknown';
        if (itemType === 'command_execution') {
          const exitCode = item.exit_code;
          const command = typeof item.command === 'string' ? item.command : '';
          const shortCommand = command.length > 80 ? `${command.slice(0, 80)}...` : command;
          const status = exitCode === 0 ? '✓' : exitCode !== null ? `✗ (exit=${exitCode})` : '?';
          logs.push(`[CODEX EXEC] Completed ${status}: ${shortCommand}`);
        } else if (itemType === 'reasoning') {
          const text = typeof item.text === 'string' ? item.text : '';
          const shortText = text.length > 100 ? `${text.slice(0, 100)}...` : text;
          logs.push(`[CODEX REASONING] ${shortText}`);
        } else if (itemType === 'todo_list') {
          // todo_list completed は特に出力しない（started で表示済み）
        } else {
          logs.push(`[CODEX] Completed ${itemType}`);
        }
      }
      break;
    }
    default: {
      // 未知のイベントタイプは簡潔に表示
      const eventType = payload.type ?? 'unknown';
      logs.push(`[CODEX EVENT] type=${eventType}`);
    }
  }

  return logs.join('\n');
}

/**
 * Claudeログをフォーマット
 *
 * @param message - SDKメッセージ
 * @returns フォーマット済みログ文字列
 */
export function formatClaudeLog(message: SDKMessage): string {
  const logs: string[] = [];

  switch (message.type) {
    case 'assistant': {
      const assistantMessage = message as unknown as { message?: { content?: Array<Record<string, unknown>> } };
      const contents = assistantMessage.message?.content ?? [];
      for (const block of contents) {
        if (block.type === 'text') {
          const text = typeof block.text === 'string' ? block.text.trim() : '';
          if (text) {
            logs.push(`[AGENT THINKING] ${text}`);
          }
        } else if (block.type === 'tool_use') {
          const name = typeof block.name === 'string' ? block.name : 'unknown';
          logs.push(`[AGENT ACTION] Using tool: ${name}`);
          if (block.input && typeof block.input === 'object') {
            const raw = JSON.stringify(block.input);
            const truncated = truncateInput(raw, MAX_LOG_PARAM_LENGTH);
            logs.push(`[AGENT ACTION] Parameters: ${truncated}`);
          }
        }
      }
      break;
    }
    case 'result': {
      const resultMessage = message as {
        subtype?: string;
        num_turns?: number;
        duration_ms?: number;
        result?: string;
      };
      logs.push(
        `[AGENT RESULT] status=${resultMessage.subtype ?? 'success'}, turns=${resultMessage.num_turns ?? 'N/A'}, duration_ms=${resultMessage.duration_ms ?? 'N/A'}`,
      );
      if (typeof resultMessage.result === 'string' && resultMessage.result.trim().length > 0) {
        logs.push(`[AGENT RESULT] ${resultMessage.result}`);
      }
      break;
    }
    case 'system': {
      const systemMessage = message as { subtype?: string };
      const subtype = systemMessage.subtype ?? 'system';
      logs.push(`[AGENT SYSTEM] ${subtype}`);
      break;
    }
    case 'stream_event': {
      const streamMessage = message as {
        event?: {
          type?: string;
          delta?: {
            type?: string;
            delta?: {
              content?: Array<{
                type?: string;
                partial_input_json?: string;
                text_delta?: string;
              }>;
            };
          };
        };
      };

      const event = streamMessage.event;
      if (!event || event.type !== 'message_delta') {
        break;
      }

      const delta = event.delta;
      if (!delta || delta.type !== 'message_delta') {
        break;
      }

      for (const block of delta.delta?.content ?? []) {
        if (block.type === 'input_json_delta' && block.partial_input_json) {
          const raw = block.partial_input_json;
          const truncated = truncateInput(raw, MAX_LOG_PARAM_LENGTH);
          logs.push(`[AGENT ACTION] Partial parameters: ${truncated}`);
        } else if (block.type === 'text_delta' && block.text_delta?.trim()) {
          logs.push(`[AGENT THINKING] ${block.text_delta.trim()}`);
        }
      }
      break;
    }
    default:
      break;
  }

  return logs.join('\n');
}

/**
 * 入力文字列を切り詰め
 *
 * @param input - 入力文字列
 * @param maxLength - 最大長（デフォルト: MAX_LOG_PARAM_LENGTH）
 * @returns 切り詰められた文字列（必要に応じて '…' を追加）
 */
export function truncateInput(input: string, maxLength: number = MAX_LOG_PARAM_LENGTH): string {
  if (input.length > maxLength) {
    return `${input.slice(0, maxLength)}…`;
  }
  return input;
}
