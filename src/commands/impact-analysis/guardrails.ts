import type { GuardrailsConfig, GuardrailsState } from './types.js';

/**
 * ガードレール設定のデフォルト値
 */
export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  maxTokens: 100_000,
  timeoutSeconds: 300,
  maxToolCalls: 30,
};

/**
 * デフォルトのガードレール設定を生成する。
 */
export function createDefaultGuardrailsConfig(): GuardrailsConfig {
  return { ...DEFAULT_GUARDRAILS };
}

/**
 * 初期状態のガードレール状態を生成する。
 */
export function createInitialGuardrailsState(): GuardrailsState {
  return {
    tokenUsage: 0,
    elapsedSeconds: 0,
    toolCallCount: 0,
    reached: false,
  };
}

/**
 * ガードレール到達チェック。
 */
export function checkGuardrails(state: GuardrailsState, config: GuardrailsConfig): boolean {
  if (state.reached) {
    return true;
  }

  if (state.tokenUsage >= config.maxTokens) {
    state.reached = true;
    state.reachedType = 'token';
    state.details = `トークン上限到達: ${state.tokenUsage}/${config.maxTokens}`;
    return true;
  }

  if (state.elapsedSeconds >= config.timeoutSeconds) {
    state.reached = true;
    state.reachedType = 'timeout';
    state.details = `タイムアウト: ${state.elapsedSeconds}秒/${config.timeoutSeconds}秒`;
    return true;
  }

  if (state.toolCallCount >= config.maxToolCalls) {
    state.reached = true;
    state.reachedType = 'tool_calls';
    state.details = `ツール呼び出し上限到達: ${state.toolCallCount}/${config.maxToolCalls}回`;
    return true;
  }

  return false;
}

/**
 * エージェント実行結果からガードレール状態を更新する。
 */
export function updateGuardrailsState(state: GuardrailsState, agentMessages: string[]): void {
  const estimatedTokens = estimateTokenUsage(agentMessages);
  state.tokenUsage += estimatedTokens;

  const toolCalls = estimateToolCallCount(agentMessages);
  state.toolCallCount += toolCalls;
}

/**
 * 経過時間を更新する。
 */
export function updateElapsedSeconds(state: GuardrailsState, startedAt: number): void {
  const elapsedMs = Date.now() - startedAt;
  state.elapsedSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
}

function estimateTokenUsage(agentMessages: string[]): number {
  const totalChars = agentMessages.reduce((sum, message) => sum + message.length, 0);
  if (totalChars <= 0) {
    return 0;
  }
  return Math.ceil(totalChars / 4);
}

function estimateToolCallCount(agentMessages: string[]): number {
  const patterns = [
    /\brg\b/g,
    /\bgrep\b/g,
    /\bcat\b/g,
    /\bsed\b/g,
    /\bawk\b/g,
    /\bgit\s+log\b/g,
    /\bgit\s+blame\b/g,
  ];

  let count = 0;
  for (const message of agentMessages) {
    for (const pattern of patterns) {
      const matches = message.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
  }

  return count;
}
