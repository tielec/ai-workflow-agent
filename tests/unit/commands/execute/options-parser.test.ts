/**
 * ユニットテスト: options-parser モジュール
 *
 * テスト対象:
 * - parseExecuteOptions(): ExecuteCommandOptions の正規化
 * - validateExecuteOptions(): 相互排他オプションの検証
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect } from '@jest/globals';
import {
  parseExecuteOptions,
  validateExecuteOptions,
  type ParsedExecuteOptions,
  type ValidationResult,
} from '../../../../src/commands/execute/options-parser.js';
import type { ExecuteCommandOptions } from '../../../../src/types/commands.js';

// =============================================================================
// parseExecuteOptions() - 正常系
// =============================================================================

describe('parseExecuteOptions - 正常系', () => {
  test('標準オプション: issue と phase が正しく解析される', () => {
    // Given: 標準オプション
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: 正しく正規化される
    expect(result.issueNumber).toBe('46');
    expect(result.phaseOption).toBe('planning');
    expect(result.presetOption).toBeUndefined();
    expect(result.agentMode).toBe('auto');
    expect(result.skipDependencyCheck).toBe(false);
    expect(result.ignoreDependencies).toBe(false);
    expect(result.forceReset).toBe(false);
    expect(result.cleanupOnComplete).toBe(false);
    expect(result.cleanupOnCompleteForce).toBe(false);
  });

  test('プリセットオプション: preset が正しく解析される', () => {
    // Given: プリセットオプション
    const options: ExecuteCommandOptions = {
      issue: '46',
      preset: 'review-requirements',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: 正しく正規化される
    expect(result.issueNumber).toBe('46');
    expect(result.phaseOption).toBe('all'); // デフォルト値
    expect(result.presetOption).toBe('review-requirements');
    expect(result.agentMode).toBe('auto');
  });

  test('エージェントモード指定: codex モードが正しく設定される', () => {
    // Given: エージェントモード = 'codex'
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'implementation',
      agent: 'codex',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: agentMode が 'codex' に設定される
    expect(result.agentMode).toBe('codex');
  });

  test('エージェントモード指定: claude モードが正しく設定される', () => {
    // Given: エージェントモード = 'claude'
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'implementation',
      agent: 'claude',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: agentMode が 'claude' に設定される
    expect(result.agentMode).toBe('claude');
  });

  test('エージェントモード指定: auto モードがデフォルト値として設定される', () => {
    // Given: エージェントモード未指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'implementation',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: agentMode が 'auto' に設定される（デフォルト）
    expect(result.agentMode).toBe('auto');
  });

  test('エージェントモード指定: 無効な値は auto にフォールバック', () => {
    // Given: エージェントモード = 'invalid'
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'implementation',
      agent: 'invalid' as any,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: agentMode が 'auto' にフォールバック
    expect(result.agentMode).toBe('auto');
  });

  test('forceReset フラグ: true が正しく設定される', () => {
    // Given: forceReset = true
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'all',
      forceReset: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: forceReset が true に設定される
    expect(result.forceReset).toBe(true);
  });

  test('skipDependencyCheck フラグ: true が正しく設定される', () => {
    // Given: skipDependencyCheck = true
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      skipDependencyCheck: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: skipDependencyCheck が true に設定される
    expect(result.skipDependencyCheck).toBe(true);
  });

  test('ignoreDependencies フラグ: true が正しく設定される', () => {
    // Given: ignoreDependencies = true
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      ignoreDependencies: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: ignoreDependencies が true に設定される
    expect(result.ignoreDependencies).toBe(true);
  });

  test('cleanupOnComplete フラグ: true が正しく設定される', () => {
    // Given: cleanupOnComplete = true
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'all',
      cleanupOnComplete: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: cleanupOnComplete が true に設定される
    expect(result.cleanupOnComplete).toBe(true);
  });

  test('cleanupOnCompleteForce フラグ: true が正しく設定される', () => {
    // Given: cleanupOnCompleteForce = true
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'all',
      cleanupOnCompleteForce: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: cleanupOnCompleteForce が true に設定される
    expect(result.cleanupOnCompleteForce).toBe(true);
  });

  test('複数フラグ: すべてのフラグが正しく解析される', () => {
    // Given: 複数フラグ指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'all',
      agent: 'codex',
      skipDependencyCheck: true,
      forceReset: true,
      cleanupOnComplete: true,
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: すべてのフラグが正しく設定される
    expect(result.issueNumber).toBe('46');
    expect(result.phaseOption).toBe('all');
    expect(result.agentMode).toBe('codex');
    expect(result.skipDependencyCheck).toBe(true);
    expect(result.forceReset).toBe(true);
    expect(result.cleanupOnComplete).toBe(true);
  });
});

// =============================================================================
// validateExecuteOptions() - 正常系
// =============================================================================

describe('validateExecuteOptions - 正常系', () => {
  test('標準オプション: 検証が成功する', () => {
    // Given: 正常なオプション
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証成功
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('プリセットオプション: 検証が成功する', () => {
    // Given: プリセット指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      preset: 'review-requirements',
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証成功
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('skipDependencyCheck のみ: 検証が成功する', () => {
    // Given: skipDependencyCheck のみ指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      skipDependencyCheck: true,
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証成功
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('ignoreDependencies のみ: 検証が成功する', () => {
    // Given: ignoreDependencies のみ指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      ignoreDependencies: true,
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証成功
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// =============================================================================
// validateExecuteOptions() - 異常系
// =============================================================================

describe('validateExecuteOptions - 異常系', () => {
  test('相互排他オプション: preset と phase が同時指定された場合にエラー', () => {
    // Given: preset と phase を同時指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      preset: 'review-requirements',
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証失敗
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Options '--preset' and '--phase' are mutually exclusive.");
  });

  test('相互排他オプション: skipDependencyCheck と ignoreDependencies が同時指定された場合にエラー', () => {
    // Given: skipDependencyCheck と ignoreDependencies を同時指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      skipDependencyCheck: true,
      ignoreDependencies: true,
    };

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証失敗
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive.",
    );
  });

  test('必須オプション不足: issue が指定されていない場合にエラー', () => {
    // Given: issue が未指定
    const options: ExecuteCommandOptions = {
      phase: 'planning',
    } as any;

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証失敗
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Option '--issue' is required.");
  });

  test('複数エラー: 複数の検証エラーが同時に発生する', () => {
    // Given: 複数の検証エラー
    const options: ExecuteCommandOptions = {
      // issue 未指定
      phase: 'planning',
      preset: 'review-requirements', // preset と phase 同時指定
      skipDependencyCheck: true,
      ignoreDependencies: true, // skipDependencyCheck と ignoreDependencies 同時指定
    } as any;

    // When: オプションを検証
    const result: ValidationResult = validateExecuteOptions(options);

    // Then: 検証失敗（複数エラー）
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain("Option '--issue' is required.");
    expect(result.errors).toContain("Options '--preset' and '--phase' are mutually exclusive.");
    expect(result.errors).toContain(
      "Options '--skip-dependency-check' and '--ignore-dependencies' are mutually exclusive.",
    );
  });
});

// =============================================================================
// エッジケース
// =============================================================================

describe('parseExecuteOptions - エッジケース', () => {
  test('phase が大文字混在の場合、小文字に正規化される', () => {
    // Given: phase = 'PLANNING'
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'PLANNING',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: 小文字に正規化される
    expect(result.phaseOption).toBe('planning');
  });

  test('agent が大文字混在の場合、小文字に正規化される', () => {
    // Given: agent = 'CODEX'
    const options: ExecuteCommandOptions = {
      issue: '46',
      phase: 'planning',
      agent: 'codex',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: 小文字に正規化される
    expect(result.agentMode).toBe('codex');
  });

  test('issue が数値の場合、文字列に変換される', () => {
    // Given: issue = 46 (数値)
    const options: ExecuteCommandOptions = {
      issue: 46 as any,
      phase: 'planning',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: 文字列に変換される
    expect(result.issueNumber).toBe('46');
  });

  test('phase が未指定の場合、デフォルト値 "all" が設定される', () => {
    // Given: phase 未指定
    const options: ExecuteCommandOptions = {
      issue: '46',
      preset: 'review-requirements',
    };

    // When: オプションを解析
    const result: ParsedExecuteOptions = parseExecuteOptions(options);

    // Then: デフォルト値 'all' が設定される
    expect(result.phaseOption).toBe('all');
  });
});
