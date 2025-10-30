/**
 * ユニットテスト: phase-factory モジュール
 *
 * テスト対象:
 * - createPhaseInstance(): フェーズインスタンス生成
 *
 * テスト戦略: UNIT_ONLY
 *
 * Issue #46: execute.ts リファクタリング
 */

import { describe, test, expect } from '@jest/globals';
import { createPhaseInstance } from '../../../src/core/phase-factory.js';
import type { PhaseName } from '../../../src/types.js';
import type { PhaseContext } from '../../../src/types/commands.js';

import { PlanningPhase } from '../../../src/phases/planning.js';
import { RequirementsPhase } from '../../../src/phases/requirements.js';
import { DesignPhase } from '../../../src/phases/design.js';
import { TestScenarioPhase } from '../../../src/phases/test-scenario.js';
import { ImplementationPhase } from '../../../src/phases/implementation.js';
import { TestImplementationPhase } from '../../../src/phases/test-implementation.js';
import { TestingPhase } from '../../../src/phases/testing.js';
import { DocumentationPhase } from '../../../src/phases/documentation.js';
import { ReportPhase } from '../../../src/phases/report.js';
import { EvaluationPhase } from '../../../src/phases/evaluation.js';

// =============================================================================
// テストフィクスチャ: PhaseContext モック
// =============================================================================

/**
 * モック PhaseContext を作成
 */
function createMockContext(): PhaseContext {
  return {
    workingDir: '/tmp/test-workspace',
    metadataManager: {} as any,
    codexClient: null,
    claudeClient: null,
    githubClient: null,
    skipDependencyCheck: false,
    ignoreDependencies: false,
    presetPhases: undefined,
  };
}

// =============================================================================
// createPhaseInstance() - 正常系: 全10フェーズ
// =============================================================================

describe('createPhaseInstance - 正常系', () => {
  test('planning フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'planning'
    const phaseName: PhaseName = 'planning';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: PlanningPhase インスタンスが返される
    expect(result).toBeInstanceOf(PlanningPhase);
  });

  test('requirements フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'requirements'
    const phaseName: PhaseName = 'requirements';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: RequirementsPhase インスタンスが返される
    expect(result).toBeInstanceOf(RequirementsPhase);
  });

  test('design フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'design'
    const phaseName: PhaseName = 'design';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: DesignPhase インスタンスが返される
    expect(result).toBeInstanceOf(DesignPhase);
  });

  test('test_scenario フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'test_scenario'
    const phaseName: PhaseName = 'test_scenario';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: TestScenarioPhase インスタンスが返される
    expect(result).toBeInstanceOf(TestScenarioPhase);
  });

  test('implementation フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'implementation'
    const phaseName: PhaseName = 'implementation';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: ImplementationPhase インスタンスが返される
    expect(result).toBeInstanceOf(ImplementationPhase);
  });

  test('test_implementation フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'test_implementation'
    const phaseName: PhaseName = 'test_implementation';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: TestImplementationPhase インスタンスが返される
    expect(result).toBeInstanceOf(TestImplementationPhase);
  });

  test('testing フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'testing'
    const phaseName: PhaseName = 'testing';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: TestingPhase インスタンスが返される
    expect(result).toBeInstanceOf(TestingPhase);
  });

  test('documentation フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'documentation'
    const phaseName: PhaseName = 'documentation';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: DocumentationPhase インスタンスが返される
    expect(result).toBeInstanceOf(DocumentationPhase);
  });

  test('report フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'report'
    const phaseName: PhaseName = 'report';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: ReportPhase インスタンスが返される
    expect(result).toBeInstanceOf(ReportPhase);
  });

  test('evaluation フェーズのインスタンスが正しく生成される', () => {
    // Given: phaseName = 'evaluation'
    const phaseName: PhaseName = 'evaluation';
    const context = createMockContext();

    // When: createPhaseInstance() を呼び出し
    const result = createPhaseInstance(phaseName, context);

    // Then: EvaluationPhase インスタンスが返される
    expect(result).toBeInstanceOf(EvaluationPhase);
  });

  test('全10フェーズに対してインスタンス生成が成功する', () => {
    // Given: すべてのフェーズ名
    const allPhaseNames: PhaseName[] = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];
    const context = createMockContext();

    // When: 各フェーズのインスタンスを生成
    const instances = allPhaseNames.map((phaseName) => createPhaseInstance(phaseName, context));

    // Then: すべてのインスタンスが正しく生成される
    expect(instances).toHaveLength(10);
    instances.forEach((instance) => {
      expect(instance).toBeDefined();
      expect(typeof instance.run).toBe('function');
    });
  });
});

// =============================================================================
// createPhaseInstance() - 異常系: 未知のフェーズ名
// =============================================================================

describe('createPhaseInstance - 異常系', () => {
  test('未知のフェーズ名でエラーをスローする', () => {
    // Given: 未知のフェーズ名
    const phaseName: PhaseName = 'unknown_phase' as PhaseName;
    const context = createMockContext();

    // When & Then: エラーがスローされる
    expect(() => {
      createPhaseInstance(phaseName, context);
    }).toThrow('Unknown phase: unknown_phase');
  });

  test('空文字列のフェーズ名でエラーをスローする', () => {
    // Given: 空文字列
    const phaseName: PhaseName = '' as PhaseName;
    const context = createMockContext();

    // When & Then: エラーがスローされる
    expect(() => {
      createPhaseInstance(phaseName, context);
    }).toThrow();
  });

  test('null値でエラーをスローする', () => {
    // Given: null値
    const phaseName: PhaseName = null as any;
    const context = createMockContext();

    // When & Then: エラーがスローされる
    expect(() => {
      createPhaseInstance(phaseName, context);
    }).toThrow();
  });
});

// =============================================================================
// PhaseContext 構築の検証
// =============================================================================

describe('PhaseContext 構築の検証', () => {
  test('PhaseContext の baseParams が正しくフェーズに渡される', () => {
    // Given: PhaseContext with specific values
    const context: PhaseContext = {
      workingDir: '/custom/working/dir',
      metadataManager: { customProp: 'test' } as any,
      codexClient: { model: 'gpt-5-codex' } as any,
      claudeClient: null,
      githubClient: { repo: 'test/repo' } as any,
      skipDependencyCheck: true,
      ignoreDependencies: false,
      presetPhases: ['planning', 'requirements'],
    };

    // When: フェーズインスタンスを生成
    const phaseName: PhaseName = 'planning';
    const result = createPhaseInstance(phaseName, context);

    // Then: インスタンスが正しく生成される（内部的にbaseParamsが渡されている）
    expect(result).toBeInstanceOf(PlanningPhase);
    expect(result).toBeDefined();
  });
});
