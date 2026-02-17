import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MetadataManagerType = typeof import('../../../src/core/metadata-manager.js').MetadataManager;

const createPhase = () => ({
  status: 'pending',
  retry_count: 0,
  started_at: null,
  completed_at: null,
  review_result: null,
  output_files: [],
  current_step: null,
  completed_steps: [],
  rollback_context: null,
});

const createMockMetadata = () => {
  const phases: any = {
    planning: createPhase(),
    requirements: createPhase(),
    design: createPhase(),
    test_scenario: createPhase(),
    implementation: createPhase(),
    test_implementation: createPhase(),
    test_preparation: createPhase(),
    testing: createPhase(),
    documentation: createPhase(),
    report: createPhase(),
    evaluation: { ...createPhase(), decision: null, failed_phase: null, remaining_tasks: [], created_issue_url: null, abort_reason: null },
  };

  return {
    issue_number: '1',
    issue_url: 'https://example.com',
    issue_title: 'Test Issue',
    branch_name: 'ai-workflow/issue-1',
    repository: 'example/repo',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    phases,
    cost_tracking: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
  };
};

describe('MetadataManager - difficulty_analysis/model_config', () => {
  let MetadataManager: MetadataManagerType;
  let mockState: any;

  beforeEach(async () => {
    jest.resetModules();

    mockState = {
      data: createMockMetadata(),
      save: jest.fn(),
      migrate: jest.fn(),
      getPhaseStatus: jest.fn().mockReturnValue('pending'),
      setDesignDecision: jest.fn(),
      incrementRetryCount: jest.fn().mockReturnValue(0),
      updatePhaseStatus: jest.fn(),
    };

    jest.unstable_mockModule('../../../src/core/workflow-state.js', () => ({
      __esModule: true,
      WorkflowState: class {
        static load() {
          return mockState;
        }
      },
    }));

    jest.unstable_mockModule('../../../src/core/helpers/metadata-io.js', () => ({
      __esModule: true,
      formatTimestampForFilename: jest.fn(),
      backupMetadataFile: jest.fn().mockReturnValue('/tmp/backup.json'),
      removeWorkflowDirectory: jest.fn(),
    }));

    const module = await import('../../../src/core/metadata-manager.js');
    MetadataManager = module.MetadataManager;
  });

  it('saves and retrieves difficulty_analysis', () => {
    // Given
    const metadataManager = new MetadataManager('/tmp/.ai-workflow/issue-1/metadata.json');
    const analysis = {
      level: 'moderate' as const,
      confidence: 0.85,
      factors: {
        estimated_file_changes: 5,
        scope: 'single_module' as const,
        requires_tests: true,
        requires_architecture_change: false,
        complexity_score: 0.6,
      },
      analyzed_at: '2025-01-02T00:00:00Z',
      analyzer_agent: 'claude' as const,
      analyzer_model: 'sonnet',
    };

    // When
    metadataManager.setDifficultyAnalysis(analysis);

    // Then
    expect(metadataManager.getDifficultyAnalysis()).toEqual(analysis);
    expect(mockState.save).toHaveBeenCalled();
  });

  it('returns null when difficulty_analysis is not set', () => {
    // Given
    const metadataManager = new MetadataManager('/tmp/.ai-workflow/issue-1/metadata.json');
    mockState.data.difficulty_analysis = null;

    // When
    const result = metadataManager.getDifficultyAnalysis();

    // Then
    expect(result).toBeNull();
  });

  it('persists model_config updates', () => {
    // Given
    const metadataManager = new MetadataManager('/tmp/.ai-workflow/issue-1/metadata.json');
    const modelConfig = {
      implementation: {
        execute: { claudeModel: 'opus' as const, codexModel: 'max' as const },
        review: { claudeModel: 'sonnet' as const, codexModel: 'mini' as const },
        revise: { claudeModel: 'opus' as const, codexModel: 'max' as const },
      },
    };

    // When
    metadataManager.setModelConfig(modelConfig);

    // Then
    expect(metadataManager.getModelConfig()).toEqual(modelConfig);
    expect(mockState.save).toHaveBeenCalled();
  });

  it('returns null when model_config is missing (backward compatibility)', () => {
    // Given
    const metadataManager = new MetadataManager('/tmp/.ai-workflow/issue-1/metadata.json');
    delete mockState.data.model_config;

    // When
    const result = metadataManager.getModelConfig();

    // Then
    expect(result).toBeNull();
  });

  it('loads legacy metadata without difficulty/model config (TC-MM-005)', () => {
    // Given: legacy metadata without new fields
    delete (mockState.data as any).difficulty_analysis;
    delete (mockState.data as any).model_config;
    const metadataManager = new MetadataManager('/tmp/.ai-workflow/issue-1/metadata.json');

    // When
    const difficulty = metadataManager.getDifficultyAnalysis();
    const modelConfig = metadataManager.getModelConfig();

    // Then
    expect(difficulty).toBeNull();
    expect(modelConfig).toBeNull();
    expect(metadataManager.data.issue_number).toBe('1');
  });
});
