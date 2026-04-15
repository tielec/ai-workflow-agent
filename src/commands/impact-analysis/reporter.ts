import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PromptLoader } from '../../core/prompt-loader.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type { PipelineContext, InvestigationResult, ImpactReport } from './types.js';
import { executeAgentForStage } from './scoper.js';

/**
 * Reporterステージ
 */
export async function executeReporter(
  context: PipelineContext,
  investigationResult: InvestigationResult,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
): Promise<ImpactReport> {
  const prompt = buildReporterPrompt(context, investigationResult);

  const agentResult = await executeAgentForStage(codexClient, claudeClient, prompt, {
    maxTurns: 3,
    preferLightweight: true,
  });

  const markdown = extractReportMarkdown(agentResult);
  validateReport(markdown);

  return {
    markdown,
    findingsCount: investigationResult.findings.length,
    patternsMatched: Array.from(new Set(investigationResult.findings.map((f) => f.patternName))),
    guardrailsReached: investigationResult.guardrailsReached,
  };
}

function buildReporterPrompt(
  context: PipelineContext,
  investigationResult: InvestigationResult,
): string {
  const template = PromptLoader.loadPrompt(
    'impact-analysis',
    'reporter',
    context.options.language,
  );

  return fillTemplate(template, {
    diff: context.diff.diff,
    findings: JSON.stringify(investigationResult.findings, null, 2),
    guardrails_reached: investigationResult.guardrailsReached ? 'true' : 'false',
    guardrails_details: investigationResult.guardrailDetails ?? 'なし',
    completed_points: investigationResult.completedPoints.join(', '),
    incomplete_points: investigationResult.incompletePoints.join(', '),
  });
}

function extractReportMarkdown(agentMessages: string[]): string {
  const rawText = agentMessages.join('\n').trim();
  const jsonText = extractJsonBlock(rawText);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { markdown?: string };
      if (typeof parsed.markdown === 'string' && parsed.markdown.trim()) {
        return parsed.markdown.trim();
      }
    } catch (error) {
      logger.warn(`Reporter出力のJSONパースに失敗: ${getErrorMessage(error)}`);
    }
  }

  return rawText;
}

function validateReport(markdown: string): void {
  if (!markdown || !markdown.trim()) {
    throw new Error('レポート生成に失敗しました: 空の出力が返されました');
  }

  if (!markdown.includes('判断は開発者が行ってください')) {
    logger.warn('レポートに「判断は開発者が行ってください」の注意書きが含まれていません');
  }
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
