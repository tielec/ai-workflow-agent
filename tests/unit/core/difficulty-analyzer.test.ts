import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DifficultyAnalyzer } from '../../../src/core/difficulty-analyzer.js';
import { logger } from '../../../src/utils/logger.js';

const baseInput = {
  title: 'Sample Issue',
  body: 'Example body for difficulty analysis.',
  labels: ['backend', 'enhancement'],
};

describe('DifficultyAnalyzer', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  it('returns moderate difficulty with normalized factors (TC-DA-002)', async () => {
    // Given: Claude succeeds with a moderate response
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'moderate',
          confidence: 0.74,
          factors: {
            estimated_file_changes: 6,
            scope: 'single_module',
            requires_tests: true,
            requires_architecture_change: false,
            complexity_score: 0.55,
          },
          analyzed_at: '2025-01-02T00:00:00Z',
        }),
      ]),
    };
    const codexClient = { executeTask: jest.fn(async () => []) };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('moderate');
    expect(result.analyzer_agent).toBe('claude');
    expect(result.factors.requires_tests).toBe(true);
    expect(result.factors.scope).toBe('single_module');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(codexClient.executeTask).not.toHaveBeenCalled();
  });

  it('returns complex difficulty with high confidence (TC-DA-003)', async () => {
    // Given: Claude returns a complex response with architecture change
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'complex',
          confidence: 0.88,
          factors: {
            estimated_file_changes: 15,
            scope: 'cross_cutting',
            requires_tests: true,
            requires_architecture_change: true,
            complexity_score: 0.82,
          },
          analyzed_at: '2025-01-03T00:00:00Z',
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.analyzer_model).toBe('sonnet');
    expect(result.factors.requires_architecture_change).toBe(true);
    expect(result.factors.estimated_file_changes).toBeGreaterThanOrEqual(11);
    expect(result.confidence).toBeCloseTo(0.88, 2);
  });

  it('returns normalized result from primary Claude response', async () => {
    // Given: Claude succeeds with valid JSON
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'simple',
          confidence: 0.92,
          factors: {
            estimated_file_changes: 2,
            scope: 'single_file',
            requires_tests: false,
            requires_architecture_change: false,
            complexity_score: 0.1,
          },
          analyzed_at: '2025-01-01T00:00:00Z',
        }),
      ]),
    };
    const codexClient = { executeTask: jest.fn(async () => []) };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('simple');
    expect(result.analyzer_agent).toBe('claude');
    expect(result.analyzer_model).toBe('sonnet');
    expect(result.factors.scope).toBe('single_file');
    expect(result.confidence).toBeCloseTo(0.92, 2);
    expect(codexClient.executeTask).not.toHaveBeenCalled();
  });

  it('falls back to Codex when Claude analysis fails', async () => {
    // Given: Claude throws, Codex succeeds
    const claudeClient = {
      executeTask: jest.fn(async () => {
        throw new Error('Claude unavailable');
      }),
    };
    const codexClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'moderate',
          confidence: 0.75,
          factors: { estimated_file_changes: 5, scope: 'single_module', requires_tests: true, requires_architecture_change: false, complexity_score: 0.6 },
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('moderate');
    expect(result.analyzer_agent).toBe('codex');
    expect(result.analyzer_model).toBe('mini');
  });

  it('returns default complex result when both agents fail', async () => {
    // Given: both agents reject
    const claudeClient = {
      executeTask: jest.fn(async () => {
        throw new Error('Primary down');
      }),
    };
    const codexClient = {
      executeTask: jest.fn(async () => {
        throw new Error('Fallback down');
      }),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.confidence).toBe(0);
    expect(result.analyzer_agent).toBe('codex');
    expect(result.analyzer_model).toBe('fallback');
  });

  it('escalates low confidence results to complex', async () => {
    // Given: low confidence simple result
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'simple',
          confidence: 0.3,
          factors: { estimated_file_changes: 1, scope: 'single_file', requires_tests: false, requires_architecture_change: false, complexity_score: 0.3 },
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.analyzer_agent).toBe('claude');
    expect(result.analyzer_model).toBe('sonnet');
    expect(result.confidence).toBeCloseTo(0.3);
  });

  it('parses JSON from fallback candidate when primary returns invalid payload', async () => {
    // Given: primary returns non-JSON, fallback contains embedded JSON text
    const claudeClient = {
      executeTask: jest.fn(async () => ['This is not JSON']),
    };
    const codexClient = {
      executeTask: jest.fn(async () => [
        'Some text before { "level": "complex", "confidence": 0.8, "factors": { "estimated_file_changes": 12, "scope": "cross_cutting", "requires_tests": true, "requires_architecture_change": true, "complexity_score": 0.9 } } and after',
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.analyzer_agent).toBe('codex');
    expect(result.analyzer_model).toBe('mini');
    expect(result.factors.requires_architecture_change).toBe(true);
  });

  it('falls back when primary returns invalid JSON payload (TC-DA-006)', async () => {
    // Given: primary returns an invalid JSON string, fallback succeeds
    const claudeClient = {
      executeTask: jest.fn(async () => ['This is not valid JSON']),
    };
    const codexClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'moderate',
          confidence: 0.65,
          factors: { estimated_file_changes: 4, scope: 'single_module', requires_tests: true, requires_architecture_change: false, complexity_score: 0.5 },
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: codexClient as any,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('moderate');
    expect(result.analyzer_agent).toBe('codex');
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
  });

  it('defaults to complex when required fields are missing (TC-DA-007)', async () => {
    // Given: level is missing from JSON response
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          confidence: 0.8,
          factors: { estimated_file_changes: 5 },
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.analyzer_agent).toBe('codex');
    expect(result.analyzer_model).toBe('fallback');
  });

  it('keeps the level when confidence is exactly 0.5 (TC-DA-010)', async () => {
    // Given: boundary confidence value
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'moderate',
          confidence: 0.5,
          factors: {},
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('moderate');
    expect(result.confidence).toBe(0.5);
  });

  it('escalates confidence below threshold to complex (TC-DA-011)', async () => {
    // Given: confidence slightly below threshold
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'simple',
          confidence: 0.49,
          factors: {},
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.confidence).toBeCloseTo(0.49);
  });

  it('falls back to default when an unknown level is returned (TC-DA-009)', async () => {
    // Given: primary returns an unsupported level value
    const claudeClient = {
      executeTask: jest.fn(async () => [
        JSON.stringify({
          level: 'unknown_level',
          confidence: 0.9,
          factors: {},
        }),
      ]),
    };
    const analyzer = new DifficultyAnalyzer({
      claudeClient: claudeClient as any,
      codexClient: null,
      workingDir: process.cwd(),
    });

    // When
    const result = await analyzer.analyze(baseInput);

    // Then
    expect(result.level).toBe('complex');
    expect(result.analyzer_agent).toBe('codex');
    expect(result.analyzer_model).toBe('fallback');
  });
});
