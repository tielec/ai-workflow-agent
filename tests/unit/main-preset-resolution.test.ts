/**
 * ユニットテスト: プリセット名解決機能
 *
 * テスト対象:
 * - resolvePresetName関数（後方互換性対応）
 * - listPresets関数（プリセット一覧表示）
 *
 * 注意: リファクタリング後、resolvePresetNameは src/commands/execute.ts に移動されました。
 */

import { describe, test, expect } from '@jest/globals';
import { resolvePresetName } from '../../src/commands/execute.js';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
} from '../../src/core/phase-dependencies.js';

describe('resolvePresetName関数テスト', () => {
  test('1.2.1: 現行プリセット名の解決（正常系）', () => {
    // Given: 現行プリセット名
    const presetName = 'quick-fix';

    // When: プリセット名を解決
    const result = resolvePresetName(presetName);

    // Then: 警告なしで解決される
    expect(result.resolvedName).toBe('quick-fix');
    expect(result.warning).toBe(undefined);
  });

  test('1.2.2: 非推奨プリセット名の解決（警告付き）', () => {
    // Given: 非推奨プリセット名
    const presetName = 'requirements-only';

    // When: プリセット名を解決
    const result = resolvePresetName(presetName);

    // Then: 新プリセット名に解決され、警告が表示される
    expect(result.resolvedName).toBe('review-requirements');
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('deprecated')).toBeTruthy();
    expect(result.warning?.includes('review-requirements')).toBeTruthy();
    expect(result.warning?.includes('6 months')).toBeTruthy();
  });

  test('1.2.2-2: 非推奨プリセット名（design-phase）の解決', () => {
    // Given: 非推奨プリセット名
    const presetName = 'design-phase';

    // When: プリセット名を解決
    const result = resolvePresetName(presetName);

    // Then: 新プリセット名に解決され、警告が表示される
    expect(result.resolvedName).toBe('review-design');
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('deprecated')).toBeTruthy();
  });

  test('1.2.2-3: 非推奨プリセット名（implementation-phase）の解決', () => {
    // Given: 非推奨プリセット名
    const presetName = 'implementation-phase';

    // When: プリセット名を解決
    const result = resolvePresetName(presetName);

    // Then: 新プリセット名に解決され、警告が表示される
    expect(result.resolvedName).toBe('implementation');
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('deprecated')).toBeTruthy();
  });

  test('1.2.3: full-workflowプリセットの特殊処理', () => {
    // Given: full-workflowプリセット名
    const presetName = 'full-workflow';

    // When: プリセット名を解決
    const result = resolvePresetName(presetName);

    // Then: 空文字列に解決され、--phase allへの移行メッセージが表示される
    expect(result.resolvedName).toBe('');
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('--phase all')).toBeTruthy();
    expect(result.warning?.includes('deprecated')).toBeTruthy();
  });

  test('1.2.4: 存在しないプリセット名のエラー', () => {
    // Given: 存在しないプリセット名
    const presetName = 'unknown-preset';

    // When/Then: エラーが投げられる
    expect(() => {
      resolvePresetName(presetName);
    }).toThrow(/Unknown preset/);
  });

  test('1.2.4-2: 空文字列プリセット名のエラー', () => {
    // Given: 空文字列
    const presetName = '';

    // When/Then: エラーが投げられる
    expect(() => {
      resolvePresetName(presetName);
    }).toThrow(/Unknown preset/);
  });
});

describe('プリセット一覧表示機能テスト', () => {
  test('1.6.1: listPresets関数のロジック検証', () => {
    // Given: PHASE_PRESETSとDEPRECATED_PRESETSが定義されている
    // When: プリセット一覧を生成
    const presetList: string[] = [];
    for (const [name, phases] of Object.entries(PHASE_PRESETS)) {
      const description = PRESET_DESCRIPTIONS[name] || '';
      const phaseList = phases.join(' → ');
      presetList.push(`${name}: ${description} (${phaseList})`);
    }

    const deprecatedList: string[] = [];
    for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
      deprecatedList.push(`${oldName} → ${newName}`);
    }

    // Then: プリセット一覧が正しく生成される
    expect(presetList.length > 0).toBeTruthy();
    expect(deprecatedList.length > 0).toBeTruthy();

    // 各プリセットに説明が含まれていることを確認
    for (const item of presetList) {
      expect(item.includes(':')).toBeTruthy();
      expect(item.includes('→')).toBeTruthy();
    }

    // 非推奨プリセットに移行先が含まれていることを確認
    for (const item of deprecatedList) {
      expect(item.includes('→')).toBeTruthy();
    }
  });

  test('全プリセットに説明が存在する', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットの説明を確認
    // Then: 全てのプリセットに説明が存在する
    for (const presetName of Object.keys(PHASE_PRESETS)) {
      expect(PRESET_DESCRIPTIONS[presetName]).toBeTruthy();
    }
  });
});

describe('プリセット名の境界値テスト', () => {
  test('全ての現行プリセット名が解決できる', () => {
    // Given: PHASE_PRESETSの全キー
    // When: 各プリセット名を解決
    // Then: 全て警告なしで解決される
    for (const presetName of Object.keys(PHASE_PRESETS)) {
      const result = resolvePresetName(presetName);
      expect(result.resolvedName).toBe(presetName);
      expect(result.warning).toBe(undefined);
    }
  });

  test('全ての非推奨プリセット名が解決できる', () => {
    // Given: DEPRECATED_PRESETSの全キー
    // When: 各非推奨プリセット名を解決
    // Then: 全て新プリセット名に解決され、警告が表示される
    for (const oldName of Object.keys(DEPRECATED_PRESETS)) {
      const result = resolvePresetName(oldName);

      if (oldName === 'full-workflow') {
        // 特殊ケース
        expect(result.resolvedName).toBe('');
        expect(result.warning).toBeTruthy();
        expect(result.warning?.includes('--phase all')).toBeTruthy();
      } else {
        // 通常ケース
        expect(result.resolvedName).toBeTruthy();
        expect(result.warning).toBeTruthy();
        expect(result.warning?.includes('deprecated')).toBeTruthy();
      }
    }
  });
});
