import { beforeAll, describe, expect, it, jest } from '@jest/globals';

// Prepare fs mock before importing BasePhase
const mockFs = {
  ensureDirSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(''),
  lstatSync: jest.fn(() => ({ isSymbolicLink: () => false })),
};

const agentExecutorInstances: any[] = [];

jest.unstable_mockModule('fs-extra', () => ({
  __esModule: true,
  default: mockFs,
  ...mockFs,
}));

jest.unstable_mockModule('../../../src/phases/core/agent-executor.js', () => ({
  __esModule: true,
  AgentExecutor: class {
    updateModelConfig = jest.fn();
    constructor() {
      agentExecutorInstances.push(this);
    }
  },
}));

jest.unstable_mockModule('../../../src/phases/context/context-builder.js', () => ({
  __esModule: true,
  ContextBuilder: class {
    constructor() {}
  },
}));

jest.unstable_mockModule('../../../src/phases/cleanup/artifact-cleaner.js', () => ({
  __esModule: true,
  ArtifactCleaner: class {
    constructor() {}
  },
}));

jest.unstable_mockModule('../../../src/phases/lifecycle/step-executor.js', () => ({
  __esModule: true,
  StepExecutor: class {},
}));

let BasePhaseCtor: any;

beforeAll(async () => {
  const { BasePhase } = await import('../../../src/phases/base-phase.js');

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

describe('BasePhase - model optimizer integration (TC-SE-001/002)', () => {
  it('applies resolved models to AgentExecutor for execute step', () => {
    // Given
    agentExecutorInstances.length = 0;
    const resolveModel = jest.fn().mockReturnValue({ claudeModel: 'opus', codexModel: 'max' });
    const modelOptimizer = { resolveModel } as any;
    const metadata = {
      data: { issue_number: '99', target_repository: { repo: 'repo', path: '/tmp/repo' } },
      getCompletedSteps: jest.fn().mockReturnValue([]),
      addCompletedStep: jest.fn(),
      updateCurrentStep: jest.fn(),
      getRollbackContext: jest.fn(),
      clearRollbackContext: jest.fn(),
      incrementRetryCount: jest.fn().mockReturnValue(0),
      updatePhaseStatus: jest.fn(),
    };
    const agentClient = { getWorkingDirectory: jest.fn().mockReturnValue('/tmp/repo') };
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: agentClient,
      claudeClient: null,
      modelOptimizer,
    });

    // When
    (phase as any).applyModelForStep('execute');

    // Then
    expect(resolveModel).toHaveBeenCalledWith('implementation', 'execute', undefined);
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'opus',
      codexModel: 'max',
    });
  });

  it('propagates overrides when resolving model', () => {
    // Given
    agentExecutorInstances.length = 0;
    const modelOptimizer = {
      resolveModel: jest.fn().mockReturnValue({ claudeModel: 'sonnet', codexModel: 'mini' }),
    } as any;
    const metadata = {
      data: { issue_number: '100', target_repository: { repo: 'repo', path: '/tmp/repo' } },
      getCompletedSteps: jest.fn().mockReturnValue([]),
      addCompletedStep: jest.fn(),
      updateCurrentStep: jest.fn(),
      getRollbackContext: jest.fn(),
      clearRollbackContext: jest.fn(),
      incrementRetryCount: jest.fn().mockReturnValue(0),
      updatePhaseStatus: jest.fn(),
    };
    const phase = new BasePhaseCtor({
      phaseName: 'planning',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer,
      modelOverrides: { claudeModel: 'SONNET', codexModel: 'MINI' },
    });

    // When
    (phase as any).applyModelForStep('review');

    // Then
    expect(modelOptimizer.resolveModel).toHaveBeenCalledWith(
      'planning',
      'review',
      { claudeModel: 'SONNET', codexModel: 'MINI' }
    );
    expect(agentExecutorInstances[0].updateModelConfig).toHaveBeenCalledWith({
      claudeModel: 'sonnet',
      codexModel: 'mini',
    });
  });

  it('uses default agent models when optimizer is absent (TC-SE-003)', () => {
    // Given: model optimizer is null to simulate legacy behavior
    agentExecutorInstances.length = 0;
    const metadata = {
      data: { issue_number: '101', target_repository: { repo: 'repo', path: '/tmp/repo' } },
      getCompletedSteps: jest.fn().mockReturnValue([]),
      addCompletedStep: jest.fn(),
      updateCurrentStep: jest.fn(),
      getRollbackContext: jest.fn(),
      clearRollbackContext: jest.fn(),
      incrementRetryCount: jest.fn().mockReturnValue(0),
      updatePhaseStatus: jest.fn(),
    };
    const phase = new BasePhaseCtor({
      phaseName: 'implementation',
      workingDir: '/tmp/repo',
      metadataManager: metadata,
      githubClient: {} as any,
      codexClient: { getWorkingDirectory: jest.fn() },
      claudeClient: null,
      modelOptimizer: null,
    });

    // When / Then: applyModelForStep should not throw and should leave agent executor on defaults
    expect(() => (phase as any).applyModelForStep('execute')).not.toThrow();
    expect(agentExecutorInstances[0].updateModelConfig).not.toHaveBeenCalled();
  });
});
