import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { ClaudeAgentClient, resolveClaudeModel } from './claude-agent-client.js';
import { CodexAgentClient, resolveCodexModel } from './codex-agent-client.js';
import { DifficultyAnalysisResult, DifficultyLevel } from '../types.js';
import { resolveProjectPath } from './path-utils.js';
import { getErrorMessage } from '../utils/error-utils.js';

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

const PROMPT_PATH = resolveProjectPath('src', 'prompts', 'difficulty', 'analyze.txt');
const CONFIDENCE_THRESHOLD = 0.5;

function isDifficultyLevel(level: unknown): level is DifficultyLevel {
  return level === 'simple' || level === 'moderate' || level === 'complex';
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

  private buildPrompt(input: DifficultyAnalyzerInput): string {
    if (!fs.existsSync(PROMPT_PATH)) {
      throw new Error(`Difficulty prompt not found: ${PROMPT_PATH}`);
    }
    const template = fs.readFileSync(PROMPT_PATH, 'utf-8');
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

        const messageContent = this.extractTextBlocks(parsed);
        textCandidates.push(...messageContent);
        if (typeof parsed.result === 'string') {
          textCandidates.push(parsed.result);
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

  private safeParse<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}
