/**
 * Agent Event Parser
 *
 * Codex/Claude共通のイベントパースロジックを提供するヘルパーモジュール
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Codexイベントの型定義
 */
export type CodexEvent = {
  type?: string;
  subtype?: string | null;
  message?: {
    role?: string;
    content?: Array<Record<string, unknown>>;
  };
  result?: string | null;
  status?: string | null;
  turns?: number;
  duration_ms?: number;
  [key: string]: unknown;
};

/**
 * Claudeイベントの型定義（SDKMessageのエイリアス）
 */
export type ClaudeEvent = SDKMessage;

/**
 * CodexのJSONイベント文字列をパース
 *
 * @param raw - 生のJSONイベント文字列
 * @returns パース済みのCodexEventオブジェクト、またはパース失敗時はnull
 */
export function parseCodexEvent(raw: string): CodexEvent | null {
  try {
    return JSON.parse(raw) as CodexEvent;
  } catch {
    return null;
  }
}

/**
 * Claude SDKメッセージをパース
 *
 * @param message - Claude Agent SDKメッセージ
 * @returns 構造化されたClaudeEventオブジェクト
 */
export function parseClaudeEvent(message: SDKMessage): ClaudeEvent | null {
  // 現状はSDKメッセージをそのまま返す（将来的な拡張のためのラッパー）
  return message;
}

/**
 * Codexイベントのタイプを判定
 *
 * @param payload - CodexEventオブジェクト
 * @returns イベントタイプ文字列 ('assistant', 'result', 'system', 'unknown')
 */
export function determineCodexEventType(payload: CodexEvent): string {
  return payload.type ?? payload.message?.role ?? 'unknown';
}

/**
 * ClaudeイベントのタイプをHuman: 判定
 *
 * @param message - SDKメッセージ
 * @returns メッセージタイプ文字列
 */
export function determineClaudeEventType(message: SDKMessage): string {
  return message.type;
}
