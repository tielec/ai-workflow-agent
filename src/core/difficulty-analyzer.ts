import { logger } from '../utils/logger.js';
import { ClaudeAgentClient, resolveClaudeModel } from './claude-agent-client.js';
import { CodexAgentClient, resolveCodexModel } from './codex-agent-client.js';
import {
  DifficultyAnalysisResult,
  DifficultyGrade,
  DifficultyLevel,
  IssueDifficultyAssessment,
  SupportedLanguage,
} from '../types.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { PromptLoader } from './prompt-loader.js';

export interface DifficultyAnalyzerInput {
  title: string;
  body: string;
  labels: string[];
}

export interface DifficultyAnalyzerOptions {
  claudeClient?: ClaudeAgentClient | null;
  codexClient?: CodexAgentClient | null;
  workingDir: string;
}

const CONFIDENCE_THRESHOLD = 0.5;

function isDifficultyLevel(level: unknown): level is DifficultyLevel {
  return level === 'simple' || level === 'moderate' || level === 'complex';
}

function isDifficultyGrade(grade: unknown): grade is DifficultyGrade {
  return grade === 'A' || grade === 'B' || grade === 'C' || grade === 'D' || grade === 'E';
}

const GRADE_LABEL_MAP: Record<DifficultyGrade, IssueDifficultyAssessment['label']> = {
  A: 'trivial',
  B: 'simple',
  C: 'moderate',
  D: 'complex',
  E: 'critical',
};

export function mapGradeToLevel(grade: DifficultyGrade): DifficultyLevel {
  if (grade === 'A' || grade === 'B') {
    return 'simple';
  }
  if (grade === 'C') {
    return 'moderate';
  }
  return 'complex';
}

export function mapLevelToGrade(level: DifficultyLevel): DifficultyGrade {
  if (level === 'simple') {
    return 'B';
  }
  if (level === 'moderate') {
    return 'C';
  }
  return 'D';
}

function buildFallbackResult(): DifficultyAnalysisResult {
  return {
    level: 'complex',
    confidence: 0,
    factors: {
      estimated_file_changes: 0,
      scope: 'cross_cutting',
      requires_tests: true,
      requires_architecture_change: true,
      complexity_score: 1,
    },
    analyzed_at: new Date().toISOString(),
    analyzer_agent: 'codex',
    analyzer_model: 'fallback',
  };
}

function normalizeResult(
  raw: Partial<DifficultyAnalysisResult>,
  agent: DifficultyAnalysisResult['analyzer_agent'],
  model: string,
): DifficultyAnalysisResult | null {
  if (!isDifficultyLevel(raw.level) || typeof raw.confidence !== 'number') {
    return null;
  }

  const confidence = Math.max(0, Math.min(1, raw.confidence));
  const normalized: DifficultyAnalysisResult = {
    level: raw.level,
    confidence,
    factors: {
      estimated_file_changes: raw.factors?.estimated_file_changes ?? 0,
      scope: raw.factors?.scope ?? 'cross_cutting',
      requires_tests: raw.factors?.requires_tests ?? true,
      requires_architecture_change: raw.factors?.requires_architecture_change ?? false,
      complexity_score: raw.factors?.complexity_score ?? confidence,
    },
    analyzed_at: raw.analyzed_at ?? new Date().toISOString(),
    analyzer_agent: agent,
    analyzer_model: model,
  };

  if (normalized.confidence < CONFIDENCE_THRESHOLD && normalized.level !== 'complex') {
    logger.warn(
      `Low confidence (${normalized.confidence}) detected for level=${normalized.level}. Escalating to complex.`,
    );
    normalized.level = 'complex';
  }

  return normalized;
}

function buildGradeFallbackResult(): IssueDifficultyAssessment {
  return {
    grade: 'D',
    label: 'complex',
    bug_risk: {
      expected_bugs: 3,
      probability: 50,
      risk_score: 1.5,
    },
    rationale: 'Difficulty analysis failed. Defaulting to grade D (complex).',
    assessed_by: 'codex',
    assessed_at: new Date().toISOString(),
  };
}

function normalizeGradeResult(
  raw: Partial<{
    grade: unknown;
    label: unknown;
    bug_risk: { expected_bugs?: unknown; probability?: unknown; risk_score?: unknown } | null;
    rationale: unknown;
    confidence?: unknown;
  }>,
  agent: IssueDifficultyAssessment['assessed_by'],
): IssueDifficultyAssessment | null {
  if (!isDifficultyGrade(raw.grade)) {
    return null;
  }

  const confidence = typeof raw.confidence === 'number' ? raw.confidence : null;
  const normalizedConfidence =
    confidence === null ? null : Math.max(0, Math.min(1, confidence));

  let grade = raw.grade;
  let label = isGradeLabel(raw.label) ? raw.label : GRADE_LABEL_MAP[grade];

  if (normalizedConfidence !== null && normalizedConfidence < CONFIDENCE_THRESHOLD) {
    if (grade !== 'D' && grade !== 'E') {
      logger.warn(
        `Low confidence (${normalizedConfidence}) detected for grade=${grade}. Escalating to D.`,
      );
      grade = 'D';
      label = GRADE_LABEL_MAP[grade];
    }
  }

  const bugRisk = raw.bug_risk && typeof raw.bug_risk === 'object' ? raw.bug_risk : {};
  const expectedRaw = typeof bugRisk.expected_bugs === 'number' ? bugRisk.expected_bugs : 0;
  const probabilityRaw = typeof bugRisk.probability === 'number' ? bugRisk.probability : 0;
  const expected = Math.max(0, Math.round(expectedRaw));
  const probability = Math.max(0, Math.min(100, probabilityRaw));
  const riskScore = (expected * probability) / 100;

  const rationale = typeof raw.rationale === 'string' ? raw.rationale : '';

  return {
    grade,
    label,
    bug_risk: {
      expected_bugs: expected,
      probability,
      risk_score: riskScore,
    },
    rationale,
    assessed_by: agent,
    assessed_at: new Date().toISOString(),
  };
}

function isGradeLabel(value: unknown): value is IssueDifficultyAssessment['label'] {
  return (
    value === 'trivial' ||
    value === 'simple' ||
    value === 'moderate' ||
    value === 'complex' ||
    value === 'critical'
  );
}

export class DifficultyAnalyzer {
  private readonly claudeClient: ClaudeAgentClient | null;
  private readonly codexClient: CodexAgentClient | null;
  private readonly workingDir: string;

  constructor(options: DifficultyAnalyzerOptions) {
    this.claudeClient = options.claudeClient ?? null;
    this.codexClient = options.codexClient ?? null;
    this.workingDir = options.workingDir;
  }

  async analyze(input: DifficultyAnalyzerInput): Promise<DifficultyAnalysisResult> {
    const prompt = this.buildPrompt(input);

    // Claude (Sonnet) primary
    if (this.claudeClient) {
      const claudeResult = await this.runClient('claude', this.claudeClient, 'sonnet', prompt);
      if (claudeResult) {
        return claudeResult;
      }
    } else {
      logger.warn('Claude client unavailable. Skipping primary difficulty analysis.');
    }

    // Codex (Mini) fallback
    if (this.codexClient) {
      const codexResult = await this.runClient('codex', this.codexClient, 'mini', prompt);
      if (codexResult) {
        return codexResult;
      }
    } else {
      logger.warn('Codex client unavailable. Skipping fallback difficulty analysis.');
    }

    logger.warn('Difficulty analysis failed. Falling back to default (complex).');
    return buildFallbackResult();
  }

  async analyzeWithGrade(
    input: DifficultyAnalyzerInput,
    language?: SupportedLanguage,
  ): Promise<IssueDifficultyAssessment> {
    const prompt = this.buildGradePrompt(input, language);

    // Claude (Sonnet) primary
    if (this.claudeClient) {
      const claudeResult = await this.runGradeClient('claude', this.claudeClient, 'sonnet', prompt);
      if (claudeResult) {
        return claudeResult;
      }
    } else {
      logger.warn('Claude client unavailable. Skipping primary grade analysis.');
    }

    // Codex (Mini) fallback
    if (this.codexClient) {
      const codexResult = await this.runGradeClient('codex', this.codexClient, 'mini', prompt);
      if (codexResult) {
        return codexResult;
      }
    } else {
      logger.warn('Codex client unavailable. Skipping fallback grade analysis.');
    }

    logger.warn('Grade analysis failed. Falling back to default (grade D).');
    return buildGradeFallbackResult();
  }

  private buildPrompt(input: DifficultyAnalyzerInput): string {
    const template = PromptLoader.loadPrompt('difficulty', 'analyze');
    const labels = input.labels.length ? input.labels.join(', ') : '(none)';

    return template
      .replaceAll('{{title}}', input.title || '(no title)')
      .replaceAll('{{body}}', input.body || '(no body)')
      .replaceAll('{{labels}}', labels);
  }

  private buildGradePrompt(input: DifficultyAnalyzerInput, language?: SupportedLanguage): string {
    const template = PromptLoader.loadPrompt('difficulty', 'analyze-grade', language);
    const labels = input.labels.length ? input.labels.join(', ') : '(none)';

    return template
      .replaceAll('{{title}}', input.title || '(no title)')
      .replaceAll('{{body}}', input.body || '(no body)')
      .replaceAll('{{labels}}', labels);
  }

  private async runClient(
    agent: DifficultyAnalysisResult['analyzer_agent'],
    client: ClaudeAgentClient | CodexAgentClient,
    modelAlias: string,
    prompt: string,
  ): Promise<DifficultyAnalysisResult | null> {
    try {
      const resolvedModel =
        agent === 'claude' ? resolveClaudeModel(modelAlias) : resolveCodexModel(modelAlias);

      const messages = await client.executeTask({
        prompt,
        maxTurns: 5,
        workingDirectory: this.workingDir,
        verbose: true,
        model: resolvedModel,
      });

      const parsed = this.extractResult(messages, agent, modelAlias);
      if (parsed) {
        return parsed;
      }

      logger.warn(`Difficulty analysis JSON not found in ${agent} response. Continuing fallback.`);
      return null;
    } catch (error) {
      logger.warn(`Difficulty analysis via ${agent} failed: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async runGradeClient(
    agent: IssueDifficultyAssessment['assessed_by'],
    client: ClaudeAgentClient | CodexAgentClient,
    modelAlias: string,
    prompt: string,
  ): Promise<IssueDifficultyAssessment | null> {
    try {
      const resolvedModel =
        agent === 'claude' ? resolveClaudeModel(modelAlias) : resolveCodexModel(modelAlias);

      const messages = await client.executeTask({
        prompt,
        maxTurns: 5,
        workingDirectory: this.workingDir,
        verbose: true,
        model: resolvedModel,
      });

      const parsed = this.extractGradeResult(messages, agent, modelAlias);
      if (parsed) {
        return parsed;
      }

      logger.warn(`Grade analysis JSON not found in ${agent} response. Continuing fallback.`);
      return null;
    } catch (error) {
      logger.warn(`Grade analysis via ${agent} failed: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private extractResult(
    messages: string[],
    agent: DifficultyAnalysisResult['analyzer_agent'],
    model: string,
  ): DifficultyAnalysisResult | null {
    const textCandidates: string[] = [];

    for (const raw of messages) {
      const parsed = this.safeParse(raw);
      if (parsed && typeof parsed === 'object') {
        if (this.isDifficultyResult(parsed)) {
          const normalized = normalizeResult(parsed, agent, model);
          if (normalized) {
            return normalized;
          }
        }

        // TypeScript: parsed は object 型なので Record<string, unknown> にキャスト
        const record = parsed as Record<string, unknown>;
        const messageContent = this.extractTextBlocks(record);
        textCandidates.push(...messageContent);
        if (typeof record.result === 'string') {
          textCandidates.push(record.result);
        }
      } else {
        textCandidates.push(raw);
      }
    }

    for (const candidate of textCandidates) {
      const jsonResult = this.tryParseCandidate(candidate);
      if (jsonResult) {
        const normalized = normalizeResult(jsonResult, agent, model);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  private extractGradeResult(
    messages: string[],
    agent: IssueDifficultyAssessment['assessed_by'],
    model: string,
  ): IssueDifficultyAssessment | null {
    const textCandidates: string[] = [];

    for (const raw of messages) {
      const parsed = this.safeParse(raw);
      if (parsed && typeof parsed === 'object') {
    if (this.isGradeResult(parsed)) {
          const normalized = normalizeGradeResult(parsed as Record<string, unknown>, agent);
          if (normalized) {
            return normalized;
          }
        }

        const record = parsed as Record<string, unknown>;
        const messageContent = this.extractTextBlocks(record);
        textCandidates.push(...messageContent);
        if (typeof record.result === 'string') {
          textCandidates.push(record.result);
        }
      } else {
        textCandidates.push(raw);
      }
    }

    for (const candidate of textCandidates) {
      const jsonResult = this.tryParseGradeCandidate(candidate);
      if (jsonResult) {
        const normalized = normalizeGradeResult(jsonResult, agent);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  private tryParseCandidate(candidate: string): Partial<DifficultyAnalysisResult> | null {
    const direct = this.safeParse(candidate);
    if (direct && typeof direct === 'object') {
      return direct as Partial<DifficultyAnalysisResult>;
    }

    const matches = candidate.match(/\{[\s\S]*\}/g);
    if (matches) {
      for (const match of matches) {
        const parsed = this.safeParse(match);
        if (parsed && typeof parsed === 'object') {
          return parsed as Partial<DifficultyAnalysisResult>;
        }
      }
    }

    return null;
  }

  private tryParseGradeCandidate(
    candidate: string,
  ): Partial<{
    grade: unknown;
    label: unknown;
    bug_risk: { expected_bugs?: unknown; probability?: unknown; risk_score?: unknown } | null;
    rationale: unknown;
    confidence?: unknown;
  }> | null {
    const direct = this.safeParse(candidate);
    if (direct && typeof direct === 'object') {
      return direct as Partial<{
        grade: unknown;
        label: unknown;
        bug_risk: { expected_bugs?: unknown; probability?: unknown; risk_score?: unknown } | null;
        rationale: unknown;
        confidence?: unknown;
      }>;
    }

    const matches = candidate.match(/\{[\s\S]*\}/g);
    if (matches) {
      for (const match of matches) {
        const parsed = this.safeParse(match);
        if (parsed && typeof parsed === 'object') {
          return parsed as Partial<{
            grade: unknown;
            label: unknown;
            bug_risk: { expected_bugs?: unknown; probability?: unknown; risk_score?: unknown } | null;
            rationale: unknown;
            confidence?: unknown;
          }>;
        }
      }
    }

    return null;
  }

  private extractTextBlocks(payload: Record<string, unknown>): string[] {
    const texts: string[] = [];
    const message = payload.message;
    if (message && typeof message === 'object') {
      const content = (message as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object') {
            const type = (block as { type?: unknown }).type;
            const text = (block as { text?: unknown }).text;
            if (type === 'text' && typeof text === 'string') {
              texts.push(text);
            }
          }
        }
      }
    }
    return texts;
  }

  private isDifficultyResult(obj: unknown): obj is Partial<DifficultyAnalysisResult> {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    const record = obj as Record<string, unknown>;
    return typeof record.level === 'string' && typeof record.confidence === 'number';
  }

  private isGradeResult(obj: unknown): obj is Record<string, unknown> {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    const record = obj as Record<string, unknown>;
    return typeof record.grade === 'string';
  }

  private safeParse<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}
