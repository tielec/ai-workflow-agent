/**
 * インテグレーションテスト: プリセット実行
 *
 * テスト対象:
 * - 各プリセットのPhaseリスト取得
 * - プリセット実行フローの検証
 * - 後方互換性の検証
 *
 * 注意: 実際のAgent実行は行わず、プリセット定義とPhase選択ロジックをテストします。
 * 完全なE2Eテストは手動実行が必要です。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PHASE_DEPENDENCIES,
} from '../../src/core/phase-dependencies.js';
import { PhaseName } from '../../src/types.js';

/**
 * プリセット名からPhaseリストを取得する関数（main.tsのgetPresetPhasesと同等）
 */
function getPresetPhases(presetName: string): PhaseName[] {
  const phases = PHASE_PRESETS[presetName];
  if (!phases) {
    throw new Error(
      `Invalid preset: '${presetName}'. Available presets: ${Object.keys(PHASE_PRESETS).join(', ')}`
    );
  }
  return phases as PhaseName[];
}

describe('プリセット実行の統合テスト', () => {
  it('2.1.1: quick-fixプリセットのPhase構成', () => {
    // Given: quick-fixプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('quick-fix');

    // Then: 期待されるPhaseリストが返される
    assert.deepEqual(phases, ['implementation', 'documentation', 'report']);
    assert.equal(phases.length, 3);
  });

  it('2.1.2: review-requirementsプリセットのPhase構成', () => {
    // Given: review-requirementsプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('review-requirements');

    // Then: 期待されるPhaseリストが返される
    assert.deepEqual(phases, ['planning', 'requirements']);
    assert.equal(phases.length, 2);
  });

  it('2.1.3: implementationプリセットのPhase構成', () => {
    // Given: implementationプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('implementation');

    // Then: 期待されるPhaseリストが返される（5つのPhase）
    assert.deepEqual(phases, [
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
    ]);
    assert.equal(phases.length, 5);
  });

  it('2.1.4: testingプリセットのPhase構成', () => {
    // Given: testingプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('testing');

    // Then: 期待されるPhaseリストが返される
    assert.deepEqual(phases, ['test_implementation', 'testing']);
    assert.equal(phases.length, 2);
  });

  it('2.1.5: finalizeプリセットのPhase構成', () => {
    // Given: finalizeプリセットが定義されている
    // When: プリセットのPhaseリストを取得
    const phases = getPresetPhases('finalize');

    // Then: 期待されるPhaseリストが返される
    assert.deepEqual(phases, ['documentation', 'report', 'evaluation']);
    assert.equal(phases.length, 3);
  });

  it('存在しないプリセット名でエラーが投げられる', () => {
    // Given: 存在しないプリセット名
    const invalidPresetName = 'non-existent-preset';

    // When/Then: エラーが投げられる
    assert.throws(() => {
      getPresetPhases(invalidPresetName);
    }, /Invalid preset/);
  });
});

describe('後方互換性の統合テスト', () => {
  it('2.4.1: 非推奨プリセット名（requirements-only）が新プリセット名に解決される', () => {
    // Given: 非推奨プリセット名
    const oldPresetName = 'requirements-only';

    // When: 新プリセット名を取得
    const newPresetName = DEPRECATED_PRESETS[oldPresetName];

    // Then: 正しい新プリセット名に解決される
    assert.equal(newPresetName, 'review-requirements');

    // さらに新プリセット名のPhaseリストが取得できる
    const phases = getPresetPhases(newPresetName);
    assert.deepEqual(phases, ['planning', 'requirements']);
  });

  it('2.4.2: full-workflowプリセットが--phase allに解決される', () => {
    // Given: full-workflowプリセット名
    const oldPresetName = 'full-workflow';

    // When: 新プリセット名を取得
    const newPresetName = DEPRECATED_PRESETS[oldPresetName];

    // Then: --phase allに解決される
    assert.equal(newPresetName, '--phase all');
  });
});

describe('プリセットの依存関係整合性', () => {
  it('各プリセットのPhaseが有効な依存関係を持つ', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのPhaseリストを確認
    // Then: 全てのPhaseがPHASE_DEPENDENCIESに定義されている

    const validPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];

    for (const [presetName, phases] of Object.entries(PHASE_PRESETS)) {
      for (const phase of phases) {
        assert.ok(
          validPhases.includes(phase as PhaseName),
          `プリセット "${presetName}" に無効なPhase "${phase}" が含まれています`
        );
      }
    }
  });

  it('プリセット内のPhaseの順序が依存関係に違反していない', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのPhaseの順序を確認
    // Then: 依存関係の順序が正しい

    for (const [presetName, phases] of Object.entries(PHASE_PRESETS)) {
      const completedPhases = new Set<PhaseName>();

      for (const phase of phases as PhaseName[]) {
        const dependencies = PHASE_DEPENDENCIES[phase] || [];

        // このPhaseの依存関係が全て既に処理されているか確認
        for (const dep of dependencies) {
          // プリセットに含まれている依存Phaseは、このPhaseより前に処理されているべき
          if ((phases as PhaseName[]).includes(dep)) {
            assert.ok(
              completedPhases.has(dep),
              `プリセット "${presetName}" でPhase "${phase}" の依存Phase "${dep}" がまだ処理されていません`
            );
          }
        }

        completedPhases.add(phase);
      }
    }
  });
});

describe('全プリセットの網羅性テスト', () => {
  it('全てのプリセットが定義されている', () => {
    // Given: 期待される7個のプリセット
    const expectedPresets = [
      'review-requirements',
      'review-design',
      'review-test-scenario',
      'quick-fix',
      'implementation',
      'testing',
      'finalize',
    ];

    // When: PHASE_PRESETSのキーを確認
    const actualPresets = Object.keys(PHASE_PRESETS);

    // Then: 全てのプリセットが定義されている
    assert.equal(actualPresets.length, expectedPresets.length);
    for (const preset of expectedPresets) {
      assert.ok(
        actualPresets.includes(preset),
        `プリセット "${preset}" が定義されていません`
      );
    }
  });

  it('非推奨プリセットが4個定義されている', () => {
    // Given: 期待される4個の非推奨プリセット
    const expectedDeprecated = [
      'requirements-only',
      'design-phase',
      'implementation-phase',
      'full-workflow',
    ];

    // When: DEPRECATED_PRESETSのキーを確認
    const actualDeprecated = Object.keys(DEPRECATED_PRESETS);

    // Then: 全ての非推奨プリセットが定義されている
    assert.equal(actualDeprecated.length, expectedDeprecated.length);
    for (const preset of expectedDeprecated) {
      assert.ok(
        actualDeprecated.includes(preset),
        `非推奨プリセット "${preset}" が定義されていません`
      );
    }
  });
});
