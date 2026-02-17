import { logger } from '../utils/logger.js';
import {
  DifficultyLevel,
  ModelConfigByPhase,
  PhaseModelConfig,
  PhaseName,
  StepModelConfig,
  StepName,
} from '../types.js';

const HIGH_QUALITY_MODEL_CONFIG: StepModelConfig = {
  claudeModel: 'opus',
  codexModel: 'max',
};

const LIGHTWEIGHT_MODEL_CONFIG: StepModelConfig = {
  claudeModel: 'sonnet',
  codexModel: 'mini',
};

function createSimpleMapping(): Record<PhaseName, PhaseModelConfig> {
  const config: PhaseModelConfig = {
    execute: LIGHTWEIGHT_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: LIGHTWEIGHT_MODEL_CONFIG,
  };

  return {
    planning: config,
    requirements: config,
    design: config,
    test_scenario: config,
    implementation: config,
    test_implementation: config,
    test_preparation: config,
    testing: config,
    documentation: config,
    report: config,
    evaluation: config,
  };
}

function createModerateMapping(): Record<PhaseName, PhaseModelConfig> {
  const strategyPhaseConfig: PhaseModelConfig = {
    execute: HIGH_QUALITY_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: LIGHTWEIGHT_MODEL_CONFIG,
  };

  const codePhaseConfig: PhaseModelConfig = {
    execute: HIGH_QUALITY_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: HIGH_QUALITY_MODEL_CONFIG,
  };

  const docPhaseConfig: PhaseModelConfig = {
    execute: LIGHTWEIGHT_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: LIGHTWEIGHT_MODEL_CONFIG,
  };

  const evalPhaseConfig: PhaseModelConfig = {
    execute: HIGH_QUALITY_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: LIGHTWEIGHT_MODEL_CONFIG,
  };

  return {
    planning: strategyPhaseConfig,
    requirements: strategyPhaseConfig,
    design: strategyPhaseConfig,
    test_scenario: strategyPhaseConfig,
    implementation: codePhaseConfig,
    test_implementation: codePhaseConfig,
    test_preparation: codePhaseConfig,
    testing: codePhaseConfig,
    documentation: docPhaseConfig,
    report: docPhaseConfig,
    evaluation: evalPhaseConfig,
  };
}

function createComplexMapping(): Record<PhaseName, PhaseModelConfig> {
  const complexConfig: PhaseModelConfig = {
    execute: HIGH_QUALITY_MODEL_CONFIG,
    review: LIGHTWEIGHT_MODEL_CONFIG,
    revise: HIGH_QUALITY_MODEL_CONFIG,
  };

  return {
    planning: complexConfig,
    requirements: complexConfig,
    design: complexConfig,
    test_scenario: complexConfig,
    implementation: complexConfig,
    test_implementation: complexConfig,
    test_preparation: complexConfig,
    testing: complexConfig,
    documentation: complexConfig,
    report: complexConfig,
    evaluation: complexConfig,
  };
}

export const DEFAULT_DIFFICULTY_MODEL_MAPPING: Record<
  DifficultyLevel,
  Record<PhaseName, PhaseModelConfig>
> = {
  simple: createSimpleMapping(),
  moderate: createModerateMapping(),
  complex: createComplexMapping(),
};

/**
 * モデル解決オーバーライド
 */
export interface ModelOverrides {
  /** CLI/ENV から指定された Claude モデル */
  claudeModel?: string;
  /** CLI/ENV から指定された Codex モデル */
  codexModel?: string;
}

function sanitizeDifficultyLevel(level: DifficultyLevel | string | undefined | null): DifficultyLevel {
  if (level === 'simple' || level === 'moderate' || level === 'complex') {
    return level;
  }
  logger.warn(`Unknown difficulty level "${level}". Falling back to complex.`);
  return 'complex';
}

export class ModelOptimizer {
  private readonly difficultyLevel: DifficultyLevel;
  private readonly modelConfig: ModelConfigByPhase | null;

  constructor(difficultyLevel: DifficultyLevel | string, modelConfig?: ModelConfigByPhase | null) {
    this.difficultyLevel = sanitizeDifficultyLevel(difficultyLevel);
    this.modelConfig = modelConfig ?? null;
  }

  resolveModel(
    phase: PhaseName,
    step: StepName,
    overrides?: ModelOverrides
  ): StepModelConfig {
    if (step === 'review') {
      if (overrides?.claudeModel || overrides?.codexModel) {
        logger.debug(`Overrides provided for review step in ${phase}, but review uses lightweight models.`);
      }
      return LIGHTWEIGHT_MODEL_CONFIG;
    }

    const baseConfig = this.getBaseModelConfig(phase, step);
    return this.applyOverrides(baseConfig, overrides);
  }

  generateModelConfig(): ModelConfigByPhase {
    const source = DEFAULT_DIFFICULTY_MODEL_MAPPING[this.difficultyLevel];
    const clone: ModelConfigByPhase = {};

    for (const [phase, config] of Object.entries(source) as [PhaseName, PhaseModelConfig][]) {
      clone[phase] = {
        execute: { ...config.execute },
        review: { ...config.review },
        revise: { ...config.revise },
      };
    }

    return clone;
  }

  private getBaseModelConfig(phase: PhaseName, step: StepName): StepModelConfig {
    if (this.modelConfig?.[phase]?.[step]) {
      return this.modelConfig[phase][step];
    }
    return DEFAULT_DIFFICULTY_MODEL_MAPPING[this.difficultyLevel][phase][step];
  }

  private applyOverrides(
    base: StepModelConfig,
    overrides?: ModelOverrides
  ): StepModelConfig {
    if (!overrides) return base;

    const claude = this.normalizeClaudeModel(overrides.claudeModel);
    const codex = this.normalizeCodexModel(overrides.codexModel);

    return {
      claudeModel: claude ?? base.claudeModel,
      codexModel: codex ?? base.codexModel,
    };
  }

  private normalizeClaudeModel(model?: string): 'opus' | 'sonnet' | null {
    if (!model) return null;
    const lower = model.toLowerCase();
    if (lower.includes('opus')) return 'opus';
    if (lower.includes('sonnet')) return 'sonnet';
    logger.warn(`Unknown Claude model override "${model}". Ignoring override.`);
    return null;
  }

  private normalizeCodexModel(model?: string): 'max' | 'mini' | null {
    if (!model) return null;
    const lower = model.toLowerCase();
    if (lower.includes('max')) return 'max';
    if (lower.includes('mini')) return 'mini';
    logger.warn(`Unknown Codex model override "${model}". Ignoring override.`);
    return null;
  }
}

/**
 * 後方互換用のデフォルト Optimizer（auto-model-selection 無効時に使用）
 */
export function createDefaultModelOptimizer(): ModelOptimizer {
  return new ModelOptimizer('complex');
}
