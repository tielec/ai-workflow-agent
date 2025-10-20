/**
 * ユニットテスト: phase-dependencies.ts
 *
 * テスト対象:
 * - PHASE_PRESETS定義の正確性
 * - DEPRECATED_PRESETS後方互換性
 * - validatePhaseDependencies関数
 * - buildErrorMessage関数
 * - buildWarningMessage関数
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import {
  PHASE_PRESETS,
  DEPRECATED_PRESETS,
  PRESET_DESCRIPTIONS,
  PHASE_DEPENDENCIES,
  validatePhaseDependencies,
  DependencyValidationOptions,
} from '../../src/core/phase-dependencies.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { PhaseName } from '../../src/types.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'phase-dependencies-test');

describe('PHASE_PRESETS定義テスト', () => {
  test('1.1.1: 新規プリセット定義の正確性', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットを確認
    // Then: 正しいPhaseリストを持つ
    expect(PHASE_PRESETS['review-requirements']).toEqual(['planning', 'requirements']);
    expect(PHASE_PRESETS['review-design']).toEqual(['planning', 'requirements', 'design']);
    expect(PHASE_PRESETS['review-test-scenario']).toEqual(['planning', 'requirements', 'design', 'test_scenario']);
    expect(PHASE_PRESETS['quick-fix']).toEqual(['implementation', 'documentation', 'report']);
    expect(PHASE_PRESETS['implementation']).toEqual(['implementation', 'test_implementation', 'testing', 'documentation', 'report']);
    expect(PHASE_PRESETS['testing']).toEqual(['test_implementation', 'testing']);
    expect(PHASE_PRESETS['finalize']).toEqual(['documentation', 'report', 'evaluation']);
  });

  test('1.1.2: プリセット説明マップの存在確認', () => {
    // Given: PHASE_PRESETSの全キー
    // When: 各プリセット名に対する説明を確認
    // Then: 説明文字列が存在する
    for (const presetName of Object.keys(PHASE_PRESETS)) {
      expect(PRESET_DESCRIPTIONS[presetName]).toBeTruthy();
      expect(PRESET_DESCRIPTIONS[presetName].length > 0).toBeTruthy();
    }
  });
});

describe('後方互換性テスト', () => {
  test('1.2.1: DEPRECATED_PRESETSマップが正しく定義されている', () => {
    // Given: DEPRECATED_PRESETSが定義されている
    // When: エイリアスマップを確認
    // Then: 期待されるエイリアスが存在する
    expect(DEPRECATED_PRESETS['requirements-only']).toBe('review-requirements');
    expect(DEPRECATED_PRESETS['design-phase']).toBe('review-design');
    expect(DEPRECATED_PRESETS['implementation-phase']).toBe('implementation');
    expect(DEPRECATED_PRESETS['full-workflow']).toBe('--phase all');
  });
});

describe('依存関係チェックテスト', () => {
  let metadataManager: MetadataManager;
  let testMetadataPath: string;

  beforeAll(async () => {
    // テスト用ディレクトリとmetadata.jsonを作成
    await fs.ensureDir(TEST_DIR);
    testMetadataPath = path.join(TEST_DIR, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Test Issue',
      workflow_dir: TEST_DIR,
      phases: {},
      costs: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
  });

  test('1.4.1: 全依存関係が満たされている場合', () => {
    // Given: 全ての依存Phaseが完了している
    metadataManager.updatePhaseStatus('planning', 'completed');
    metadataManager.updatePhaseStatus('requirements', 'completed');
    metadataManager.updatePhaseStatus('design', 'completed');
    metadataManager.updatePhaseStatus('test_scenario', 'completed');

    // When: implementation Phaseの依存関係をチェック
    const result = validatePhaseDependencies('implementation', metadataManager);

    // Then: チェックが成功する
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
    expect(result.missing_files?.length || 0).toBe(0);
  });

  test('1.4.2: 依存関係が不足している場合', () => {
    // Given: 依存Phaseが未完了
    const freshMetadata = new MetadataManager(testMetadataPath);
    // metadataをリセット
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();
    freshMetadata.updatePhaseStatus('planning', 'pending');

    // When: implementation Phaseの依存関係をチェック
    const result = validatePhaseDependencies('implementation', freshMetadata);

    // Then: エラーが返される
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error?.includes('[ERROR] Phase "implementation" requires the following phases to be completed')).toBeTruthy();
    expect(result.error?.includes('NOT COMPLETED')).toBeTruthy();
    expect(result.missing_phases && result.missing_phases.length > 0).toBeTruthy();
  });

  test('1.4.3: ignoreViolationsオプション使用時', () => {
    // Given: 依存Phaseが未完了だが、ignoreViolations=true
    const freshMetadata = new MetadataManager(testMetadataPath);
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();

    const options: DependencyValidationOptions = {
      ignoreViolations: true,
    };

    // When: implementation Phaseの依存関係をチェック
    const result = validatePhaseDependencies('implementation', freshMetadata, options);

    // Then: 警告のみで継続
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
    expect(result.warning?.includes('[WARNING] Phase "implementation" has unmet dependencies')).toBeTruthy();
    expect(result.ignored).toBe(true);
    expect(result.missing_phases && result.missing_phases.length > 0).toBeTruthy();
  });

  test('1.4.5: skipCheckオプション使用時', () => {
    // Given: 全依存が未完了だが、skipCheck=true
    const freshMetadata = new MetadataManager(testMetadataPath);
    freshMetadata.data.phases = {} as any;
    freshMetadata.save();

    const options: DependencyValidationOptions = {
      skipCheck: true,
    };

    // When: implementation Phaseの依存関係をチェック
    const result = validatePhaseDependencies('implementation', freshMetadata, options);

    // Then: チェックがスキップされる
    expect(result.valid).toBe(true);
    expect(result.missing_phases?.length || 0).toBe(0);
    expect(result.missing_files?.length || 0).toBe(0);
  });
});

describe('PHASE_DEPENDENCIES定義の整合性', () => {
  test('全Phaseが定義されている', () => {
    // Given: 期待されるPhase名リスト
    const expectedPhases: PhaseName[] = [
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

    // When: PHASE_DEPENDENCIESのキーを確認
    const actualPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];

    // Then: 全てのPhaseが定義されている
    for (const phase of expectedPhases) {
      expect(actualPhases.includes(phase)).toBeTruthy();
    }
  });

  test('循環依存が存在しない', () => {
    // Given: PHASE_DEPENDENCIESが定義されている
    // When: 各Phaseの依存関係を確認
    // Then: 循環依存が存在しない

    const visited = new Set<PhaseName>();
    const stack: PhaseName[] = [];

    function dfs(phase: PhaseName): boolean {
      if (stack.includes(phase)) {
        // 循環依存を検出
        return true;
      }

      if (visited.has(phase)) {
        return false;
      }

      visited.add(phase);
      stack.push(phase);

      const deps = PHASE_DEPENDENCIES[phase] || [];
      for (const dep of deps) {
        if (dfs(dep)) {
          return true;
        }
      }

      stack.pop();
      return false;
    }

    for (const phase of Object.keys(PHASE_DEPENDENCIES) as PhaseName[]) {
      const hasCycle = dfs(phase);
      expect(hasCycle).toBe(false);
    }
  });
});

describe('プリセットとPhaseの整合性', () => {
  test('プリセットに含まれるPhaseが全て有効である', () => {
    // Given: PHASE_PRESETSが定義されている
    // When: 各プリセットのPhaseリストを確認
    // Then: 全てのPhase名がPHASE_DEPENDENCIESに定義されている

    const validPhases = Object.keys(PHASE_DEPENDENCIES) as PhaseName[];

    for (const [presetName, phases] of Object.entries(PHASE_PRESETS)) {
      for (const phase of phases) {
        expect(validPhases.includes(phase as PhaseName)).toBeTruthy();
      }
    }
  });
});
