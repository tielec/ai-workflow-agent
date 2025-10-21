/**
 * ユニットテスト: list-presets コマンドモジュール
 *
 * テスト対象:
 * - listPresets(): プリセット一覧表示
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 *
 * 注意: listPresets()はconsole出力とprocess.exit(0)を行うため、
 * 統合テストでの動作確認が主となります。ここでは、プリセット定義が
 * 正しく存在することを確認します。
 */

import { describe, test, expect } from '@jest/globals';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
} from '../../../src/core/phase-dependencies.js';

// =============================================================================
// プリセット一覧表示機能のテスト
// =============================================================================

describe('listPresets機能のテスト', () => {
  describe('プリセット定義の確認', () => {
    test('PHASE_PRESETSが定義されており、複数のプリセットが存在する', () => {
      // Given: PHASE_PRESETSが定義されている
      // When: プリセット一覧を確認
      const presetList = Object.keys(PHASE_PRESETS);

      // Then: 複数のプリセットが存在する
      expect(presetList.length).toBeGreaterThan(0);
    });

    test('DEPRECATED_PRESETSが定義されており、非推奨プリセットが存在する', () => {
      // Given: DEPRECATED_PRESETSが定義されている
      // When: 非推奨プリセット一覧を確認
      const deprecatedList = Object.keys(DEPRECATED_PRESETS);

      // Then: 非推奨プリセットが存在する
      expect(deprecatedList.length).toBeGreaterThan(0);
    });

    test('全てのプリセットに説明が存在する', () => {
      // Given: PHASE_PRESETSが定義されている
      // When: 各プリセットの説明を確認
      for (const presetName of Object.keys(PHASE_PRESETS)) {
        // Then: 全てのプリセットに説明が存在する
        expect(PRESET_DESCRIPTIONS[presetName]).toBeTruthy();
        expect(PRESET_DESCRIPTIONS[presetName]).not.toBe('');
      }
    });

    test('全てのプリセットにフェーズリストが存在する', () => {
      // Given: PHASE_PRESETSが定義されている
      // When: 各プリセットのフェーズリストを確認
      for (const [presetName, phases] of Object.entries(PHASE_PRESETS)) {
        // Then: 全てのプリセットにフェーズリストが存在する
        expect(phases).toBeTruthy();
        expect(Array.isArray(phases)).toBe(true);
        expect(phases.length).toBeGreaterThan(0);
      }
    });

    test('全ての非推奨プリセットに移行先が存在する', () => {
      // Given: DEPRECATED_PRESETSが定義されている
      // When: 各非推奨プリセットの移行先を確認
      for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
        // Then: 全ての非推奨プリセットに移行先が存在する
        expect(newName).toBeTruthy();
        expect(newName).not.toBe('');
      }
    });
  });

  describe('プリセット一覧生成ロジックの確認', () => {
    test('プリセット一覧が正しく生成される', () => {
      // Given: PHASE_PRESETSとPRESET_DESCRIPTIONSが定義されている
      // When: プリセット一覧を生成
      const presetList: string[] = [];
      for (const [name, phases] of Object.entries(PHASE_PRESETS)) {
        const description = PRESET_DESCRIPTIONS[name] || '';
        const phaseList = phases.join(' → ');
        presetList.push(`${name}: ${description} (${phaseList})`);
      }

      // Then: プリセット一覧が正しく生成される
      expect(presetList.length).toBeGreaterThan(0);

      // 各プリセット一覧項目に説明とフェーズリストが含まれている
      for (const item of presetList) {
        expect(item).toContain(':');
        expect(item).toContain('→');
        expect(item).toContain('(');
        expect(item).toContain(')');
      }
    });

    test('非推奨プリセット一覧が正しく生成される', () => {
      // Given: DEPRECATED_PRESETSが定義されている
      // When: 非推奨プリセット一覧を生成
      const deprecatedList: string[] = [];
      for (const [oldName, newName] of Object.entries(DEPRECATED_PRESETS)) {
        deprecatedList.push(`${oldName} → ${newName}`);
      }

      // Then: 非推奨プリセット一覧が正しく生成される
      expect(deprecatedList.length).toBeGreaterThan(0);

      // 各非推奨プリセット一覧項目に移行先が含まれている
      for (const item of deprecatedList) {
        expect(item).toContain('→');
      }
    });
  });

  describe('主要プリセットの存在確認', () => {
    test('quick-fixプリセットが存在する', () => {
      // Given: PHASE_PRESETS
      // When: quick-fixプリセットを確認
      // Then: 存在する
      expect(PHASE_PRESETS['quick-fix']).toBeTruthy();
      expect(PRESET_DESCRIPTIONS['quick-fix']).toBeTruthy();
    });

    test('review-requirementsプリセットが存在する', () => {
      // Given: PHASE_PRESETS
      // When: review-requirementsプリセットを確認
      // Then: 存在する
      expect(PHASE_PRESETS['review-requirements']).toBeTruthy();
      expect(PRESET_DESCRIPTIONS['review-requirements']).toBeTruthy();
    });

    test('implementationプリセットが存在する', () => {
      // Given: PHASE_PRESETS
      // When: implementationプリセットを確認
      // Then: 存在する
      expect(PHASE_PRESETS['implementation']).toBeTruthy();
      expect(PRESET_DESCRIPTIONS['implementation']).toBeTruthy();
    });

    test('analysis-designプリセットが存在する', () => {
      // Given: PHASE_PRESETS
      // When: analysis-designプリセットを確認
      // Then: 存在する
      expect(PHASE_PRESETS['analysis-design']).toBeTruthy();
      expect(PRESET_DESCRIPTIONS['analysis-design']).toBeTruthy();
    });

    test('full-testプリセットが存在する', () => {
      // Given: PHASE_PRESETS
      // When: full-testプリセットを確認
      // Then: 存在する
      expect(PHASE_PRESETS['full-test']).toBeTruthy();
      expect(PRESET_DESCRIPTIONS['full-test']).toBeTruthy();
    });
  });

  describe('非推奨プリセットの存在確認', () => {
    test('requirements-onlyが非推奨プリセットとして存在する', () => {
      // Given: DEPRECATED_PRESETS
      // When: requirements-onlyを確認
      // Then: 存在し、review-requirementsに移行される
      expect(DEPRECATED_PRESETS['requirements-only']).toBe('review-requirements');
    });

    test('design-phaseが非推奨プリセットとして存在する', () => {
      // Given: DEPRECATED_PRESETS
      // When: design-phaseを確認
      // Then: 存在し、review-designに移行される
      expect(DEPRECATED_PRESETS['design-phase']).toBe('review-design');
    });

    test('implementation-phaseが非推奨プリセットとして存在する', () => {
      // Given: DEPRECATED_PRESETS
      // When: implementation-phaseを確認
      // Then: 存在し、implementationに移行される
      expect(DEPRECATED_PRESETS['implementation-phase']).toBe('implementation');
    });
  });
});
