import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ModelOptimizer } from '../../src/core/model-optimizer.js';

const mockFs = {
  ensureDirSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(''),
  lstatSync: jest.fn(() => ({ isSymbolicLink: () => false })),
};

jest.unstable_mockModule('fs-extra', () => ({
  __esModule: true,
  default: mockFs,
  ...mockFs,
}));

const agentExecutorInstances: any[] = [];
jest.unstable_mockModule('../../src/phases/core/agent-executor.js', () => ({
  __esModule: true,
  AgentExecutor: class {
    updateModelConfig = jest.fn();
    constructor() {
      agentExecutorInstances.push(this);
    }
  },
}));

jest.unstable_mockModule('../../src/phases/context/context-builder.js', () => ({
  __esModule: true,
  ContextBuilder: class {},
}));

jest.unstable_mockModule('../../src/phases/cleanup/artifact-cleaner.js', () => ({
  __esModule: true,
  ArtifactCleaner: class {},
}));

jest.unstable_mockModule('../../src/phases/lifecycle/step-executor.js', () => ({
  __esModule: true,
  StepExecutor: class {},
}));

let BasePhaseCtor: any;

beforeAll(async () => {
  const { BasePhase } = await import('../../src/phases/base-phase.js');

  class TestPhase extends BasePhase {
    constructor(params: any) {
      super(params);
    }
    protected async execute() {
      return { success: true };
    }
    protected async review() {
      return { success: true };
    }
  }

  BasePhaseCtor = TestPhase;
});

const createMetadata = (overrides: Partial<any> = {}) => ({
  data: {
    issue_number: '200',
    target_repository: { repo: 'repo', path: '/tmp/repo' },
    ...overrides,
  },
  getCompletedSteps: jest.fn().mockReturnValue([]),
  addCompletedStep: jest.fn(),
  updateCurrentStep: jest.fn(),
  getRollbackContext: jest.fn(),
  clearRollbackContext: jest.fn(),
  incrementRetryCount: jest.fn().mockReturnValue(0),
  updatePhaseStatus: jest.fn(),
});

describe('Integration: auto model selection flow', () => {
  it('applies generated model_config during execute/review (TC-INT-001)', () => {
    // Given: init generated complex model_config
    agentExecutorInstances.length = 0;
    const optimizer = new ModelOptimizer('complex');
    const modelConfig = optimizer.generateModelConfig();
    const metadata = createMetadata({
      model_config: modelConfig,
      difficulty_analysis: { level: 'complex' },
    });
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('complex', modelConfig),
    });

    // When
    (phase as any).applyModelForStep('execute');
    (phase as any).applyModelForStep('review');

    // Then: execute uses high-quality, review uses lightweight
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'opus',
      codexModel: 'max',
    });
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('prioritizes CLI overrides over metadata for execute step (TC-INT-003)', () => {
    // Given
    agentExecutorInstances.length = 0;
    const modelConfig = new ModelOptimizer('complex').generateModelConfig();
    const metadata = createMetadata({ model_config: modelConfig });
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('complex', modelConfig),
      modelOverrides: { claudeModel: 'sonnet', codexModel: 'mini' },
    });

    // When
    (phase as any).applyModelForStep('execute');

    // Then: overrides are applied
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('falls back to default agent models when auto selection is disabled (TC-INT-002)', () => {
    // Given: metadata has no difficulty/model_config and optimizer is not provided
    agentExecutorInstances.length = 0;
    const metadata = createMetadata();
    const phase = new BasePhaseCtor({
      phaseName: 'planning',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: null,
    });

    // When / Then: model update is skipped and defaults are used by the agent
    expect(() => (phase as any).applyModelForStep('execute')).not.toThrow();
    expect(agentExecutorInstances[0].updateModelConfig).not.toHaveBeenCalled();
  });

  it('prefers environment overrides over metadata config (TC-INT-004)', () => {
    // Given: metadata contains complex config but env overrides are present
    agentExecutorInstances.length = 0;
    const modelConfig = new ModelOptimizer('complex').generateModelConfig();
    const metadata = createMetadata({ model_config: modelConfig });
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('complex', modelConfig),
      modelOverrides: { claudeModel: 'CLAUDE_SONNET', codexModel: 'CODEX_MINI' },
    });

    // When
    (phase as any).applyModelForStep('execute');

    // Then: overrides (simulating env) take precedence
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('handles legacy metadata without model_config (TC-INT-005)', () => {
    // Given: legacy metadata missing difficulty/model_config fields
    agentExecutorInstances.length = 0;
    const legacyMetadata = createMetadata();
    delete (legacyMetadata.data as any).difficulty_analysis;
    delete (legacyMetadata.data as any).model_config;
    const phase = new BasePhaseCtor({
      phaseName: 'planning',
      workingDir: '/tmp/repo',
      metadataManager: legacyMetadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: null,
    });

    // When / Then: workflow proceeds with default agent behavior
    expect(() => (phase as any).applyModelForStep('execute')).not.toThrow();
    expect(agentExecutorInstances[0].updateModelConfig).not.toHaveBeenCalled();
    expect(legacyMetadata.data.target_repository.path).toBe('/tmp/repo');
  });

  it('honors CLI model flags without auto model selection (TC-INT-006)', () => {
    // Given: overrides are provided even though metadata lacks model_config
    agentExecutorInstances.length = 0;
    const metadata = createMetadata();
    const optimizer = new ModelOptimizer('complex');
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: optimizer,
      modelOverrides: { claudeModel: 'sonnet', codexModel: 'mini' },
    });

    // When
    (phase as any).applyModelForStep('execute');

    // Then: CLI-style overrides are applied
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('applies lightweight models for simple difficulty across phases (TC-INT-007)', () => {
    // Given: simple difficulty generated config
    agentExecutorInstances.length = 0;
    const optimizer = new ModelOptimizer('simple');
    const modelConfig = optimizer.generateModelConfig();
    const metadata = createMetadata({
      model_config: modelConfig,
      difficulty_analysis: { level: 'simple' },
    });

    const planningPhase = new BasePhaseCtor({
      phaseName: 'planning',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('simple', modelConfig),
    });

    const testingPhase = new BasePhaseCtor({
      phaseName: 'testing',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('simple', modelConfig),
    });

    // When: apply models across steps/phases
    (planningPhase as any).applyModelForStep('execute');
    (testingPhase as any).applyModelForStep('revise');
    (planningPhase as any).applyModelForStep('review');

    // Then: all steps use lightweight models
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
    expect(agentExecutorInstances[1].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('uses complex mapping while keeping review lightweight (TC-INT-008)', () => {
    // Given: complex difficulty model config
    agentExecutorInstances.length = 0;
    const optimizer = new ModelOptimizer('complex');
    const modelConfig = optimizer.generateModelConfig();
    const metadata = createMetadata({
      model_config: modelConfig,
      difficulty_analysis: { level: 'complex' },
    });
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: new ModelOptimizer('complex', modelConfig),
    });

    // When
    (phase as any).applyModelForStep('execute');
    (phase as any).applyModelForStep('revise');
    (phase as any).applyModelForStep('review');

    // Then: execute/revise use high-quality, review stays lightweight
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenNthCalledWith(1, {
      claudeModel: 'opus',
      codexModel: 'max',
    });
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenNthCalledWith(2, {
      claudeModel: 'opus',
      codexModel: 'max',
    });
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenNthCalledWith(3, {
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('continues execution with defaults after analysis failure (TC-INT-009)', () => {
    // Given: no analysis/model config available due to earlier failure
    agentExecutorInstances.length = 0;
    const metadata = createMetadata({ difficulty_analysis: null, model_config: null });
    const phase = new BasePhaseCtor({
      phaseName: 'planning',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: null,
    });

    // When / Then: workflow step proceeds without throwing
    expect(() => (phase as any).applyModelForStep('execute')).not.toThrow();
    expect(agentExecutorInstances[0].updateModelConfig).not.toHaveBeenCalled();
  });
});
