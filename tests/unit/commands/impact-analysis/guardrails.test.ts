/**
 * ユニットテスト: impact-analysis ガードレール
 *
 * テスト対象: src/commands/impact-analysis/guardrails.ts
 * テストシナリオ: test-scenario.md の TC-GR-001 〜 TC-GR-019
 */

import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  createDefaultGuardrailsConfig,
  createInitialGuardrailsState,
  checkGuardrails,
  checkPerPointToolCalls,
  updateGuardrailsState,
  updateElapsedSeconds,
} from '../../../../src/commands/impact-analysis/guardrails.js';

const baseConfig = {
  maxTokens: 100000,
  timeoutSeconds: 300,
  maxToolCalls: 100,
  maxToolCallsPerPoint: 40,
};

describe('guardrails', () => {
  describe('createDefaultGuardrailsConfig', () => {
    it('TC-GR-001: デフォルト設定値が仕様通りである', () => {
      const config = createDefaultGuardrailsConfig();
      expect(config).toEqual(baseConfig);
    });

    it('TC-GR-002: 呼び出しごとに新しいインスタンスを返す', () => {
      const configA = createDefaultGuardrailsConfig();
      const configB = createDefaultGuardrailsConfig();
      expect(configA).not.toBe(configB);
      expect(configA).toEqual(configB);
    });
  });

  describe('createInitialGuardrailsState', () => {
    it('TC-GR-003: 初期状態が正しい', () => {
      const state = createInitialGuardrailsState();
      expect(state).toEqual({
        tokenUsage: 0,
        elapsedSeconds: 0,
        toolCallCount: 0,
        reached: false,
      });
      expect(state.reachedType).toBeUndefined();
      expect(state.details).toBeUndefined();
    });
  });

  describe('checkGuardrails', () => {
    it('TC-GR-004: 制限内の場合はfalseを返す', () => {
      const state = { tokenUsage: 50000, elapsedSeconds: 100, toolCallCount: 15, reached: false };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(false);
      expect(state.reached).toBe(false);
    });

    it('TC-GR-005: トークン上限到達を検知する', () => {
      const state = { tokenUsage: 100000, elapsedSeconds: 100, toolCallCount: 15, reached: false };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(true);
      expect(state.reached).toBe(true);
      expect(state.reachedType).toBe('token');
      expect(state.details).toContain('トークン上限到達');
    });

    it('TC-GR-006: タイムアウト到達を検知する', () => {
      const state = { tokenUsage: 50000, elapsedSeconds: 300, toolCallCount: 15, reached: false };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(true);
      expect(state.reachedType).toBe('timeout');
      expect(state.details).toContain('タイムアウト');
    });

    it('TC-GR-007: ツール呼び出し上限到達を検知する', () => {
      const state = { tokenUsage: 50000, elapsedSeconds: 100, toolCallCount: 100, reached: false };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(true);
      expect(state.reachedType).toBe('tool_calls');
      expect(state.details).toContain('ツール呼び出し上限到達');
    });

    it('TC-GR-008: 既にreachedの場合はtrueを返す', () => {
      const state = { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 0, reached: true, reachedType: 'token' as const };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(true);
      expect(state.reachedType).toBe('token');
    });

    it('TC-GR-009: トークン上限の1つ手前はfalse', () => {
      const state = { tokenUsage: 99999, elapsedSeconds: 0, toolCallCount: 0, reached: false };
      expect(checkGuardrails(state, baseConfig)).toBe(false);
    });

    it('TC-GR-010: タイムアウト1秒手前はfalse', () => {
      const state = { tokenUsage: 0, elapsedSeconds: 299, toolCallCount: 0, reached: false };
      expect(checkGuardrails(state, baseConfig)).toBe(false);
    });

    it('TC-GR-011: ツール呼び出し上限1つ手前はfalse', () => {
      const state = { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 99, reached: false };
      expect(checkGuardrails(state, baseConfig)).toBe(false);
    });

    it('TC-GR-012: 同時到達時はトークン優先', () => {
      const state = { tokenUsage: 100000, elapsedSeconds: 300, toolCallCount: 100, reached: false };
      const result = checkGuardrails(state, baseConfig);
      expect(result).toBe(true);
      expect(state.reachedType).toBe('token');
    });
  });

  describe('updateGuardrailsState', () => {
    it('TC-GR-013: トークン使用量が加算される', () => {
      const state = { tokenUsage: 10000, elapsedSeconds: 0, toolCallCount: 0, reached: false };
      updateGuardrailsState(state, ['短いメッセージ', '少し長いメッセージの結果']);
      expect(state.tokenUsage).toBeGreaterThan(10000);
    });

    it('TC-GR-014: ツール呼び出し回数が加算される', () => {
      const state = { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 5, reached: false };
      updateGuardrailsState(state, ['rg src/ foo', 'grep -n bar', 'git log']);
      expect(state.toolCallCount).toBeGreaterThanOrEqual(6);
    });
  });

  describe('checkPerPointToolCalls', () => {
    it('TC-GR-015: デフォルト設定に maxToolCallsPerPoint が含まれる', () => {
      const config = createDefaultGuardrailsConfig();
      expect(config.maxToolCallsPerPoint).toBe(40);
    });

    it('TC-GR-016: maxToolCalls のデフォルト値が 100 である', () => {
      const config = createDefaultGuardrailsConfig();
      expect(config.maxToolCalls).toBe(100);
    });

    it('TC-GR-017: checkGuardrails は maxToolCallsPerPoint を考慮しない', () => {
      const config = {
        maxTokens: 100000,
        timeoutSeconds: 300,
        maxToolCalls: 100,
        maxToolCallsPerPoint: 5,
      };
      const state = { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 10, reached: false };

      const result = checkGuardrails(state, config);

      expect(result).toBe(false);
      expect(state.reached).toBe(false);
    });

    it('TC-GR-018: 観点別上限超過を検知する', () => {
      const result = checkPerPointToolCalls(41, baseConfig);
      expect(result).toEqual({
        reached: true,
        details: '観点別ツール呼び出し上限到達: 41/40回',
      });
    });

    it('TC-GR-019: maxToolCallsPerPoint 未設定時は未到達と判定する', () => {
      const config = { ...baseConfig, maxToolCallsPerPoint: undefined };
      const result = checkPerPointToolCalls(999, config);
      expect(result).toEqual({ reached: false });
    });
  });

  describe('updateElapsedSeconds', () => {
    it('経過秒が更新される', () => {
      const state = createInitialGuardrailsState();
      const startedAt = Date.now() - 2500;
      updateElapsedSeconds(state, startedAt);
      expect(state.elapsedSeconds).toBeGreaterThanOrEqual(2);
    });
  });
});
