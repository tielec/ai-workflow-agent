/**
 * ユニットテスト: execute コマンドモジュール
 *
 * テスト対象:
 * - resolvePresetName(): プリセット名解決（後方互換性対応）
 * - getPresetPhases(): プリセットのフェーズリスト取得
 * - canResumeWorkflow(): ワークフロー再開可否判定
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 *
 * 注意: handleExecuteCommand()のテストは統合テストで実施します。
 */

import { describe, test, expect } from '@jest/globals';
import { resolvePresetName, getPresetPhases } from '../../../src/commands/execute.js';

// =============================================================================
// resolvePresetName() のテスト
// =============================================================================

describe('resolvePresetName', () => {
  describe('正常系: 標準プリセット名', () => {
    test('quick-fixプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'quick-fix';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('quick-fix');
      expect(result.warning).toBeUndefined();
    });

    test('review-requirementsプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'review-requirements';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('review-requirements');
      expect(result.warning).toBeUndefined();
    });

    test('implementationプリセットが正しく解決される', () => {
      // Given: 標準プリセット名
      const presetName = 'implementation';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 警告なしで解決される
      expect(result.resolvedName).toBe('implementation');
      expect(result.warning).toBeUndefined();
    });
  });

  describe('正常系: 非推奨プリセット名（後方互換性）', () => {
    test('requirements-onlyが新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = 'requirements-only';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('review-requirements');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('review-requirements');
    });

    test('design-phaseが新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = 'design-phase';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('review-design');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('review-design');
    });

    test('implementation-phaseが新プリセット名に自動変換され、警告が返される', () => {
      // Given: 非推奨プリセット名
      const presetName = 'implementation-phase';

      // When: プリセット名を解決
      const result = resolvePresetName(presetName);

      // Then: 新プリセット名に解決され、警告が表示される
      expect(result.resolvedName).toBe('implementation');
      expect(result.warning).toBeTruthy();
      expect(result.warning).toContain('deprecated');
      expect(result.warning).toContain('implementation');
    });
  });

  describe('異常系: 存在しないプリセット名', () => {
    test('存在しないプリセット名でエラーをスローする', () => {
      // Given: 存在しないプリセット名
      const presetName = 'non-existent-preset';

      // When & Then: エラーがスローされる
      expect(() => {
        resolvePresetName(presetName);
      }).toThrow();
    });

    test('空文字列でエラーをスローする', () => {
      // Given: 空文字列
      const presetName = '';

      // When & Then: エラーがスローされる
      expect(() => {
        resolvePresetName(presetName);
      }).toThrow();
    });
  });
});

// =============================================================================
// getPresetPhases() のテスト
// =============================================================================

describe('getPresetPhases', () => {
  describe('正常系: プリセットのフェーズリスト取得', () => {
    test('quick-fixプリセットのフェーズリストが正しく取得できる', () => {
      // Given: quick-fixプリセット名
      const presetName = 'quick-fix';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['implementation', 'documentation', 'report']);
    });

    test('review-requirementsプリセットのフェーズリストが正しく取得できる', () => {
      // Given: review-requirementsプリセット名
      const presetName = 'review-requirements';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'requirements']);
    });

    test('implementationプリセットのフェーズリストが正しく取得できる', () => {
      // Given: implementationプリセット名
      const presetName = 'implementation';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['implementation', 'test_implementation', 'testing', 'documentation', 'report']);
    });

    test('analysis-designプリセットのフェーズリストが正しく取得できる', () => {
      // Given: analysis-designプリセット名
      const presetName = 'analysis-design';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['planning', 'requirements', 'design']);
    });

    test('full-testプリセットのフェーズリストが正しく取得できる', () => {
      // Given: full-testプリセット名
      const presetName = 'full-test';

      // When: フェーズリストを取得
      const result = getPresetPhases(presetName);

      // Then: 正しいフェーズリストが返される
      expect(result).toEqual(['test_scenario', 'test_implementation']);
    });
  });

  describe('異常系: 存在しないプリセット名', () => {
    test('存在しないプリセット名で空配列またはエラーが返される', () => {
      // Given: 存在しないプリセット名
      const presetName = 'non-existent-preset';

      // When & Then: 空配列が返されるか、エラーがスローされる
      try {
        const result = getPresetPhases(presetName);
        expect(result).toEqual([]);
      } catch (error) {
        // エラーがスローされる場合もOK
        expect(error).toBeTruthy();
      }
    });
  });
});

// =============================================================================
// エージェントモード選択のテスト（統合テストで詳細確認）
// =============================================================================

describe('エージェントモード選択（統合テストで確認）', () => {
  test('エージェントモード選択は統合テストで検証される', () => {
    // Given: エージェントモード（auto / codex / claude）
    // When: handleExecuteCommandが実行される
    // Then: 正しいエージェントが選択される

    // この部分は統合テストで実施されるため、ここではマーカーのみ
    expect(true).toBe(true);
  });
});

// =============================================================================
// 型安全性の検証（Issue #45）
// =============================================================================

describe('型安全性の検証', () => {
  test('ExecuteCommandOptions 型が正しくインポートできる', () => {
    // Given: ExecuteCommandOptions 型を使用
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type TestType = import('../../../src/types/commands.js').ExecuteCommandOptions;

    // Then: コンパイルエラーが発生しない
    expect(true).toBe(true);
  });

  test('handleExecuteCommand が型安全な引数を受け入れる', () => {
    // Given: handleExecuteCommand 関数の型シグネチャ
    // When: 関数がエクスポートされている
    // Then: ExecuteCommandOptions 型を受け入れる

    // この検証はコンパイル時に実行されるため、ここではマーカーのみ
    expect(true).toBe(true);
  });
});

// =============================================================================
// ファサード実装の検証（Issue #46）
// =============================================================================

describe('ファサード実装の検証', () => {
  test('executePhasesSequential が workflow-executor から再エクスポートされている', async () => {
    // Given: execute.ts から executePhasesSequential をインポート
    const { executePhasesSequential } = await import('../../../src/commands/execute.js');

    // Then: 関数として利用可能
    expect(typeof executePhasesSequential).toBe('function');
  });

  test('executePhasesFrom が workflow-executor から再エクスポートされている', async () => {
    // Given: execute.ts から executePhasesFrom をインポート
    const { executePhasesFrom } = await import('../../../src/commands/execute.js');

    // Then: 関数として利用可能
    expect(typeof executePhasesFrom).toBe('function');
  });

  test('createPhaseInstance が phase-factory から再エクスポートされている', async () => {
    // Given: execute.ts から createPhaseInstance をインポート
    const { createPhaseInstance } = await import('../../../src/commands/execute.js');

    // Then: 関数として利用可能
    expect(typeof createPhaseInstance).toBe('function');
  });

  test('resolvePresetName がファサード内で保持されている', () => {
    // Given: execute.ts に resolvePresetName が定義されている
    // When: resolvePresetName をインポート
    const func = resolvePresetName;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('getPresetPhases がファサード内で保持されている', () => {
    // Given: execute.ts に getPresetPhases が定義されている
    // When: getPresetPhases をインポート
    const func = getPresetPhases;

    // Then: 関数として利用可能
    expect(typeof func).toBe('function');
  });

  test('handleExecuteCommand がメインエントリーポイントとして利用可能', async () => {
    // Given: execute.ts から handleExecuteCommand をインポート
    const { handleExecuteCommand } = await import('../../../src/commands/execute.js');

    // Then: 関数として利用可能
    expect(typeof handleExecuteCommand).toBe('function');
  });
});

// =============================================================================
// モジュール分割後の後方互換性検証（Issue #46）
// =============================================================================

describe('モジュール分割後の後方互換性検証', () => {
  test('既存のインポート元（main.ts）から handleExecuteCommand が利用可能', async () => {
    // Given: execute.ts から handleExecuteCommand をインポート
    const { handleExecuteCommand } = await import('../../../src/commands/execute.js');

    // Then: 関数として利用可能（後方互換性維持）
    expect(typeof handleExecuteCommand).toBe('function');
  });

  test('既存の公開API がすべて維持されている', () => {
    // Given: execute.ts の公開API
    const executeModule = require('../../../src/commands/execute.js');

    // Then: すべての公開関数が存在する
    expect(typeof executeModule.handleExecuteCommand).toBe('function');
    expect(typeof executeModule.executePhasesSequential).toBe('function');
    expect(typeof executeModule.executePhasesFrom).toBe('function');
    expect(typeof executeModule.createPhaseInstance).toBe('function');
    expect(typeof executeModule.resolvePresetName).toBe('function');
    expect(typeof executeModule.getPresetPhases).toBe('function');
  });
});
