import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { MetadataManager } from './metadata-manager.js';
import { PhaseName, PhaseStatus } from '../types.js';
import { buildErrorMessage, buildWarningMessage } from './helpers/dependency-messages.js';
import { getPhaseOutputFilePath } from './helpers/metadata-io.js';
import { getErrorMessage } from '../utils/error-utils.js';

export const PHASE_DEPENDENCIES: Record<PhaseName, PhaseName[]> = {
  planning: [],
  requirements: ['planning'],
  design: ['requirements'],
  test_scenario: ['requirements', 'design'],
  implementation: ['requirements', 'design', 'test_scenario'],
  test_implementation: ['implementation'],
  testing: ['test_implementation'],
  documentation: ['implementation'],
  report: ['requirements', 'design', 'implementation', 'testing', 'documentation'],
  evaluation: ['report'],
};

// 新規プリセット定義（Issue #396）
export const PHASE_PRESETS: Record<string, PhaseName[]> = {
  // === レビュー駆動パターン ===
  'review-requirements': ['planning', 'requirements'],
  'review-design': ['planning', 'requirements', 'design'],
  'review-test-scenario': ['planning', 'requirements', 'design', 'test_scenario'],

  // === 分析・設計パターン ===
  'analysis-design': ['planning', 'requirements', 'design'],

  // === 実装中心パターン ===
  'quick-fix': ['implementation', 'documentation', 'report'],
  'implementation': ['implementation', 'test_implementation', 'testing', 'documentation', 'report'],

  // === テスト中心パターン ===
  'full-test': ['test_scenario', 'test_implementation'],
  'testing': ['test_implementation', 'testing'],

  // === ドキュメント・レポートパターン ===
  'finalize': ['documentation', 'report', 'evaluation'],
};

// 後方互換性のための非推奨プリセット（6ヶ月後に削除予定）
export const DEPRECATED_PRESETS: Record<string, string> = {
  'requirements-only': 'review-requirements',
  'design-phase': 'review-design',
  'implementation-phase': 'implementation',
  'full-workflow': '--phase all',
};

// プリセット説明マップ
export const PRESET_DESCRIPTIONS: Record<string, string> = {
  'review-requirements': 'Planning + Requirements (要件定義レビュー用)',
  'review-design': 'Planning + Requirements + Design (設計レビュー用)',
  'review-test-scenario': 'Planning + Requirements + Design + TestScenario (テストシナリオレビュー用)',
  'analysis-design': 'Planning + Requirements + Design (分析と設計フェーズのみ実行)',
  'quick-fix': 'Implementation + Documentation + Report (軽微な修正用)',
  'implementation': 'Implementation + TestImplementation + Testing + Documentation + Report (通常の実装フロー)',
  'full-test': 'TestScenario + TestImplementation (テストシナリオとテストコード実装のみ実行)',
  'testing': 'TestImplementation + Testing (テスト追加用)',
  'finalize': 'Documentation + Report + Evaluation (最終化用)',
};

export interface DependencyValidationOptions {
  skipCheck?: boolean;
  ignoreViolations?: boolean;
  checkFileExistence?: boolean; // ファイル存在チェック（Issue #396）
  presetPhases?: PhaseName[]; // プリセット実行時のフェーズリスト（Issue #396）
}

export interface DependencyValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  ignored?: boolean;
  missing_phases?: PhaseName[];
  missing_files?: Array<{ phase: PhaseName; file: string }>; // ファイル不在情報（Issue #396）
}

export const validatePhaseDependencies = (
  phaseName: PhaseName,
  metadataManager: MetadataManager,
  options: DependencyValidationOptions = {},
): DependencyValidationResult => {
  const { skipCheck = false, ignoreViolations = false, checkFileExistence = false, presetPhases } = options;

  if (!(phaseName in PHASE_DEPENDENCIES)) {
    throw new Error(`Invalid phase name: ${phaseName}`);
  }

  if (skipCheck) {
    return { valid: true, missing_files: [] };
  }

  const required = PHASE_DEPENDENCIES[phaseName] ?? [];
  if (required.length === 0) {
    return { valid: true, missing_files: [] };
  }

  // プリセット実行時は、プリセットに含まれるフェーズのみを依存関係としてチェック
  const filteredRequired = presetPhases
    ? required.filter(dep => presetPhases.includes(dep))
    : required;

  if (filteredRequired.length === 0) {
    return { valid: true, missing_files: [] };
  }

  const missing: PhaseName[] = [];
  const missingFiles: Array<{ phase: PhaseName; file: string }> = [];

  // 各依存Phaseをチェック
  for (const depPhase of filteredRequired) {
    let status: PhaseStatus;
    try {
      status = metadataManager.getPhaseStatus(depPhase);
    } catch {
      missing.push(depPhase);
      continue;
    }

    if (status !== 'completed') {
      missing.push(depPhase);
      continue;
    }

    // ファイル存在チェック（オプション）
    if (checkFileExistence) {
      const expectedFile = getPhaseOutputFilePath(depPhase, metadataManager.workflowDir);
      if (expectedFile && !fs.existsSync(expectedFile)) {
        missingFiles.push({ phase: depPhase, file: expectedFile });
      }
    }
  }

  // チェック結果の判定
  const hasViolations = missing.length > 0 || missingFiles.length > 0;

  if (!hasViolations) {
    return { valid: true, missing_files: [] };
  }

  // ignoreViolationsの場合は警告のみ
  if (ignoreViolations) {
    const warningMessage = buildWarningMessage(phaseName, missing, missingFiles);
    return {
      valid: true,
      warning: warningMessage,
      ignored: true,
      missing_phases: missing,
      missing_files: missingFiles,
    };
  }

  // エラーメッセージを構築
  const errorMessage = buildErrorMessage(phaseName, missing, missingFiles);
  return {
    valid: false,
    error: errorMessage,
    missing_phases: missing,
    missing_files: missingFiles,
  };
};


export const detectCircularDependencies = (): PhaseName[][] => {
  const visited = new Set<PhaseName>();
  const stack: PhaseName[] = [];
  const cycles: PhaseName[][] = [];

  const dfs = (phase: PhaseName) => {
    visited.add(phase);
    stack.push(phase);

    for (const dependency of PHASE_DEPENDENCIES[phase] ?? []) {
      if (!visited.has(dependency)) {
        dfs(dependency);
      } else if (stack.includes(dependency)) {
        const cycleStart = stack.indexOf(dependency);
        cycles.push([...stack.slice(cycleStart), dependency]);
      }
    }

    stack.pop();
  };

  (Object.keys(PHASE_DEPENDENCIES) as PhaseName[]).forEach((phase) => {
    if (!visited.has(phase)) {
      dfs(phase);
    }
  });

  return cycles;
};

export interface ExternalDocumentValidation {
  valid: boolean;
  absolute_path?: string;
  error?: string;
}

export const validateExternalDocument = (
  filePath: string,
  repoRoot?: string,
): ExternalDocumentValidation => {
  try {
    const { resolve: resolvePath } = require('node:path');
    const absolutePath = resolvePath(filePath);

    if (!fs.existsSync(absolutePath)) {
      return { valid: false, error: `File not found: ${filePath}` };
    }

    const extension = absolutePath.split('.').pop()?.toLowerCase();
    if (!extension || !['md', 'txt'].includes(extension)) {
      return {
        valid: false,
        error: `Invalid file format: .${extension ?? 'unknown'}. Only .md and .txt are allowed`,
      };
    }

    const stats = fs.statSync(absolutePath);
    if (stats.size > 10 * 1024 * 1024) {
      return {
        valid: false,
        error: `File size exceeds 10MB limit (actual: ${(stats.size / (1024 * 1024)).toFixed(1)}MB)`,
      };
    }

    if (repoRoot) {
      const normalizedRoot = resolvePath(repoRoot);
      if (!resolvePath(absolutePath).startsWith(normalizedRoot)) {
        return {
          valid: false,
          error: 'File must be within the repository',
        };
      }
    }

    return {
      valid: true,
      absolute_path: absolutePath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return { valid: false, error: `Permission denied: ${filePath}` };
    }
    return { valid: false, error: `Unexpected error: ${getErrorMessage(error)}` };
  }
};
