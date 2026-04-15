/**
 * ユニットテスト: impact-analysis ガードレール
 *
 * テスト対象: src/commands/impact-analysis/guardrails.ts
 * テストシナリオ: test-scenario.md の TC-GR-001 〜 TC-GR-014
 */

import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  createDefaultGuardrailsConfig,
  createInitialGuardrailsState,
  checkGuardrails,
  updateGuardrailsState,
  updateElapsedSeconds,
} from '../../../../src/commands/impact-analysis/guardrails.js';

const baseConfig = {
  maxTokens: 100000,
  timeoutSeconds: 300,
  maxToolCalls: 30,
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
      const state = { tokenUsage: 50000, elapsedSeconds: 100, toolCallCount: 30, reached: false };
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
      const state = { tokenUsage: 0, elapsedSeconds: 0, toolCallCount: 29, reached: false };
      expect(checkGuardrails(state, baseConfig)).toBe(false);
    });

    it('TC-GR-012: 同時到達時はトークン優先', () => {
      const state = { tokenUsage: 100000, elapsedSeconds: 300, toolCallCount: 30, reached: false };
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

  describe('updateElapsedSeconds', () => {
    it('経過秒が更新される', () => {
      const state = createInitialGuardrailsState();
      const startedAt = Date.now() - 2500;
      updateElapsedSeconds(state, startedAt);
      expect(state.elapsedSeconds).toBeGreaterThanOrEqual(2);
    });
  });
});
