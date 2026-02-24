import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  DifficultyAnalyzer,
  mapGradeToLevel,
  mapLevelToGrade,
} from '../../../src/core/difficulty-analyzer.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { logger } from '../../../src/utils/logger.js';

const baseInput = {
  title: 'Sample Issue',
  body: 'Example body for difficulty analysis.',
  labels: ['backend', 'enhancement'],
};

describe('DifficultyAnalyzer', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
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

  // Ensure Japanese prompt is chosen when AI_WORKFLOW_LANGUAGE=ja
  it('builds Japanese difficulty prompt when environment language is ja', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const analyzer = new DifficultyAnalyzer({
      claudeClient: null,
      codexClient: null,
      workingDir: process.cwd(),
    });

    const prompt = (analyzer as any).buildPrompt(baseInput);

    expect(prompt).toContain('GitHub Issue の難易度を分析するエキスパート');
  });

  // Ensure English prompt is chosen when AI_WORKFLOW_LANGUAGE=en
  it('builds English difficulty prompt when environment language is en', () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const analyzer = new DifficultyAnalyzer({
      claudeClient: null,
      codexClient: null,
      workingDir: process.cwd(),
    });

    const prompt = (analyzer as any).buildPrompt(baseInput);

    expect(prompt).toContain('expert at estimating GitHub Issue difficulty');
  });

  describe('analyzeWithGrade', () => {
    it('returns normalized grade result from Claude', async () => {
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'B',
            label: 'simple',
            bug_risk: {
              expected_bugs: 2,
              probability: 40,
              risk_score: 999,
            },
            rationale: 'Looks straightforward.',
            confidence: 0.88,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      expect(result.grade).toBe('B');
      expect(result.label).toBe('simple');
      expect(result.bug_risk.expected_bugs).toBe(2);
      expect(result.bug_risk.probability).toBe(40);
      expect(result.bug_risk.risk_score).toBeCloseTo(0.8, 2);
      expect(result.assessed_by).toBe('claude');
    });

    it('escalates low confidence grades to D', async () => {
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'B',
            bug_risk: {
              expected_bugs: 1,
              probability: 20,
            },
            rationale: 'Low confidence case.',
            confidence: 0.3,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      expect(result.grade).toBe('D');
      expect(result.label).toBe('complex');
      expect(result.assessed_by).toBe('claude');
    });

    it('falls back to Codex when Claude analysis fails', async () => {
      const claudeClient = {
        executeTask: jest.fn(async () => {
          throw new Error('Claude down');
        }),
      };
      const codexClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'A',
            label: 'trivial',
            bug_risk: {
              expected_bugs: 0,
              probability: 5,
            },
            rationale: 'Tiny change.',
            confidence: 0.7,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: codexClient as any,
        workingDir: process.cwd(),
      });

      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      expect(result.grade).toBe('A');
      expect(result.label).toBe('trivial');
      expect(result.assessed_by).toBe('codex');
    });

    it('returns default grade when both agents fail', async () => {
      const claudeClient = {
        executeTask: jest.fn(async () => {
          throw new Error('Claude down');
        }),
      };
      const codexClient = {
        executeTask: jest.fn(async () => {
          throw new Error('Codex down');
        }),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: codexClient as any,
        workingDir: process.cwd(),
      });

      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      expect(result.grade).toBe('D');
      expect(result.label).toBe('complex');
      expect(result.assessed_by).toBe('codex');
    });

    it('グレードAのlabelがtrivialにマッピングされる (TC-DA-G002)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'A',
            bug_risk: { expected_bugs: 0, probability: 5 },
            rationale: 'Tiny change.',
            confidence: 0.9,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('A');
      expect(result.label).toBe('trivial');
    });

    it('グレードBのlabelがsimpleにマッピングされる (TC-DA-G003)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'B',
            bug_risk: { expected_bugs: 1, probability: 20 },
            rationale: 'Small change.',
            confidence: 0.9,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('B');
      expect(result.label).toBe('simple');
    });

    it('グレードCのlabelがmoderateにマッピングされる (TC-DA-G001)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'C',
            bug_risk: { expected_bugs: 2, probability: 35 },
            rationale: 'Moderate change.',
            confidence: 0.8,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('C');
      expect(result.label).toBe('moderate');
      expect(result.bug_risk.risk_score).toBeCloseTo(0.7, 2);
    });

    it('グレードDのlabelがcomplexにマッピングされる (TC-DA-G004)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'D',
            bug_risk: { expected_bugs: 3, probability: 50 },
            rationale: 'Large change.',
            confidence: 0.9,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('D');
      expect(result.label).toBe('complex');
    });

    it('グレードEのlabelがcriticalにマッピングされる (TC-DA-G005)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'E',
            bug_risk: { expected_bugs: 8, probability: 80 },
            rationale: 'Critical change.',
            confidence: 0.9,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('E');
      expect(result.label).toBe('critical');
    });

    it('不正グレードはデフォルト値にフォールバックされる (TC-DA-G008)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'X',
            bug_risk: { expected_bugs: 2, probability: 50 },
            rationale: 'Invalid grade.',
            confidence: 0.7,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.grade).toBe('D');
      expect(result.label).toBe('complex');
    });

    it('probabilityが負数の場合は0にクランプされる (TC-DA-G009)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'C',
            bug_risk: { expected_bugs: 2, probability: -10 },
            rationale: 'Negative probability.',
            confidence: 0.8,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.bug_risk.probability).toBe(0);
      expect(result.bug_risk.risk_score).toBe(0);
    });

    it('probabilityが100超の場合は100にクランプされる (TC-DA-G010)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'C',
            bug_risk: { expected_bugs: 2, probability: 150 },
            rationale: 'Over probability.',
            confidence: 0.8,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.bug_risk.probability).toBe(100);
      expect(result.bug_risk.risk_score).toBe(2);
    });

    it('expected_bugsが負数の場合は0に正規化される (TC-DA-G011)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'C',
            bug_risk: { expected_bugs: -3, probability: 50 },
            rationale: 'Negative expected bugs.',
            confidence: 0.8,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.bug_risk.expected_bugs).toBe(0);
      expect(result.bug_risk.risk_score).toBe(0);
    });

    it('risk_scoreがexpected_bugs * probability / 100で再計算される (TC-DA-G012)', async () => {
      // Given
      const claudeClient = {
        executeTask: jest.fn(async () => [
          JSON.stringify({
            grade: 'C',
            bug_risk: { expected_bugs: 5, probability: 40, risk_score: 999 },
            rationale: 'Risk score should be recalculated.',
            confidence: 0.8,
          }),
        ]),
      };
      const analyzer = new DifficultyAnalyzer({
        claudeClient: claudeClient as any,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const result = await analyzer.analyzeWithGrade(baseInput, 'en');

      // Then
      expect(result.bug_risk.risk_score).toBe(2);
    });
  });

  describe('grade prompt loading', () => {
    it('日本語プロンプトがロードされる (TC-DA-G013)', () => {
      // Given
      const loadPromptSpy = jest
        .spyOn(PromptLoader, 'loadPrompt')
        .mockReturnValue('Title: {{title}}\\nBody: {{body}}\\nLabels: {{labels}}');
      const analyzer = new DifficultyAnalyzer({
        claudeClient: null,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const prompt = (analyzer as any).buildGradePrompt(baseInput, 'ja');

      // Then
      expect(loadPromptSpy).toHaveBeenCalledWith('difficulty', 'analyze-grade', 'ja');
      expect(prompt).toContain('Title: Sample Issue');
      expect(prompt).toContain('Body: Example body for difficulty analysis.');
      expect(prompt).toContain('Labels: backend, enhancement');
    });

    it('英語プロンプトがロードされる (TC-DA-G014)', () => {
      // Given
      const loadPromptSpy = jest
        .spyOn(PromptLoader, 'loadPrompt')
        .mockReturnValue('Title: {{title}}\\nBody: {{body}}\\nLabels: {{labels}}');
      const analyzer = new DifficultyAnalyzer({
        claudeClient: null,
        codexClient: null,
        workingDir: process.cwd(),
      });

      // When
      const prompt = (analyzer as any).buildGradePrompt(baseInput, 'en');

      // Then
      expect(loadPromptSpy).toHaveBeenCalledWith('difficulty', 'analyze-grade', 'en');
      expect(prompt).toContain('Title: Sample Issue');
      expect(prompt).toContain('Body: Example body for difficulty analysis.');
      expect(prompt).toContain('Labels: backend, enhancement');
    });
  });

  describe('mapGradeToLevel', () => {
    it('グレードAはsimpleにマッピングされる (TC-DA-MAP-001)', () => {
      // Given/When/Then
      expect(mapGradeToLevel('A')).toBe('simple');
    });

    it('グレードBはsimpleにマッピングされる (TC-DA-MAP-002)', () => {
      // Given/When/Then
      expect(mapGradeToLevel('B')).toBe('simple');
    });

    it('グレードCはmoderateにマッピングされる (TC-DA-MAP-003)', () => {
      // Given/When/Then
      expect(mapGradeToLevel('C')).toBe('moderate');
    });

    it('グレードDはcomplexにマッピングされる (TC-DA-MAP-004)', () => {
      // Given/When/Then
      expect(mapGradeToLevel('D')).toBe('complex');
    });

    it('グレードEはcomplexにマッピングされる (TC-DA-MAP-005)', () => {
      // Given/When/Then
      expect(mapGradeToLevel('E')).toBe('complex');
    });
  });

  describe('mapLevelToGrade', () => {
    it('simpleはグレードBにマッピングされる (TC-DA-MAP-006)', () => {
      // Given/When/Then
      expect(mapLevelToGrade('simple')).toBe('B');
    });

    it('moderateはグレードCにマッピングされる (TC-DA-MAP-007)', () => {
      // Given/When/Then
      expect(mapLevelToGrade('moderate')).toBe('C');
    });

    it('complexはグレードDにマッピングされる (TC-DA-MAP-008)', () => {
      // Given/When/Then
      expect(mapLevelToGrade('complex')).toBe('D');
    });
  });
});
