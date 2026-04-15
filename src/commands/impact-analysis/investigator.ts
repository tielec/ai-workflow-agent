import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PromptLoader } from '../../core/prompt-loader.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type {
  PipelineContext,
  ScopeResult,
  InvestigationResult,
  InvestigationPoint,
  Finding,
} from './types.js';
import { checkGuardrails, updateGuardrailsState, updateElapsedSeconds } from './guardrails.js';
import { executeAgentForStage } from './scoper.js';

const DEFAULT_REASONING = '調査結果を構造化できませんでした。';

/**
 * Investigatorステージ
 */
export async function executeInvestigator(
  context: PipelineContext,
  scopeResult: ScopeResult,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  startedAt: number,
): Promise<InvestigationResult> {
  const findings: Finding[] = [];
  const completedPoints: string[] = [];
  const incompletePoints: string[] = [];
  let totalToolCalls = 0;
  let totalTokenUsage = 0;

  for (const point of scopeResult.investigationPoints) {
    updateElapsedSeconds(context.guardrailsState, startedAt);
    if (checkGuardrails(context.guardrailsState, context.guardrails)) {
      incompletePoints.push(point.id);
      continue;
    }

    const prompt = buildInvestigatorPrompt(context, point);
    const beforeTokens = context.guardrailsState.tokenUsage;
    const beforeToolCalls = context.guardrailsState.toolCallCount;

    try {
      const agentResult = await executeAgentForStage(codexClient, claudeClient, prompt, {
        maxTurns: 10,
        preferLightweight: false,
      });

      const pointFindings = parseInvestigatorResult(agentResult, point);
      findings.push(...pointFindings);
      completedPoints.push(point.id);

      updateGuardrailsState(context.guardrailsState, agentResult);
      checkGuardrails(context.guardrailsState, context.guardrails);
      totalTokenUsage += context.guardrailsState.tokenUsage - beforeTokens;
      totalToolCalls += context.guardrailsState.toolCallCount - beforeToolCalls;
    } catch (error) {
      logger.warn(`調査観点 ${point.id} の調査中にエラー: ${getErrorMessage(error)}`);
      incompletePoints.push(point.id);
    }
  }

  return {
    findings,
    completedPoints,
    incompletePoints,
    guardrailsReached: context.guardrailsState.reached,
    guardrailDetails: context.guardrailsState.details,
    reasoning: buildInvestigatorReasoning(findings, completedPoints, incompletePoints),
    toolCallCount: totalToolCalls,
    tokenUsage: totalTokenUsage,
  };
}

function buildInvestigatorPrompt(context: PipelineContext, point: InvestigationPoint): string {
  const template = PromptLoader.loadPrompt(
    'impact-analysis',
    'investigator',
    context.options.language,
  );

  return fillTemplate(template, {
    diff: context.diff.diff,
    playbook: context.playbook,
    investigation_point: JSON.stringify(point, null, 2),
  });
}

function parseInvestigatorResult(agentMessages: string[], point: InvestigationPoint): Finding[] {
  const rawText = agentMessages.join('\n');
  const jsonText = extractJsonBlock(rawText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { findings?: Finding[] };
      if (Array.isArray(parsed.findings)) {
        return normalizeFindings(parsed.findings, point);
      }
    } catch (error) {
      logger.warn(`Investigator出力のJSONパースに失敗: ${getErrorMessage(error)}`);
    }
  }

  if (rawText.trim()) {
    return [
      {
        investigationPointId: point.id,
        patternName: point.patternName,
        description: rawText.trim(),
        evidence: [],
        severity: 'info',
      },
    ];
  }

  return [];
}

function normalizeFindings(findings: Finding[], point: InvestigationPoint): Finding[] {
  return findings.map((finding) => ({
    investigationPointId: finding.investigationPointId || point.id,
    patternName: finding.patternName || point.patternName,
    description: finding.description || '',
    evidence: Array.isArray(finding.evidence) ? finding.evidence : [],
    severity: finding.severity === 'warning' ? 'warning' : 'info',
  }));
}

function buildInvestigatorReasoning(
  findings: Finding[],
  completedPoints: string[],
  incompletePoints: string[],
): string {
  if (findings.length === 0 && completedPoints.length === 0 && incompletePoints.length === 0) {
    return DEFAULT_REASONING;
  }

  return [
    `調査完了: ${completedPoints.length}件`,
    `調査未完了: ${incompletePoints.length}件`,
    `発見事項: ${findings.length}件`,
  ].join('\n');
}

function extractJsonBlock(text: string): string | null {
  const fencedStart = text.indexOf('```json');
  if (fencedStart !== -1) {
    const fencedBodyStart = text.indexOf('\n', fencedStart);
    const fencedEnd = text.indexOf('```', fencedBodyStart + 1);
    if (fencedBodyStart !== -1 && fencedEnd !== -1) {
      return text.slice(fencedBodyStart + 1, fencedEnd).trim();
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
