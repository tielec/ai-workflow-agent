import * as fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { PromptLoader } from '../../core/prompt-loader.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type { PipelineContext, InvestigationResult, ImpactReport } from './types.js';
import { executeAgentForStage } from './scoper.js';

const REPORTER_MAX_TURNS = 10;
const REPORTER_ALLOWED_TOOLS = ['Write'];

/**
 * Reporterステージ
 */
export async function executeReporter(
  context: PipelineContext,
  investigationResult: InvestigationResult,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
): Promise<ImpactReport> {
  const outputPath = getReportOutputPath(context.logDir);
  ensureDirectoryExists(path.dirname(outputPath));
  const prompt = buildReporterPrompt(context, investigationResult, outputPath);

  await executeAgentForStage(codexClient, claudeClient, prompt, {
    maxTurns: REPORTER_MAX_TURNS,
    preferLightweight: true,
    allowedTools: REPORTER_ALLOWED_TOOLS,
  });

  const markdown = readReportOutput(outputPath);
  validateReport(markdown, context.options.language);

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
  outputPath: string,
): string {
  const template = PromptLoader.loadPrompt(
    'impact-analysis',
    'reporter',
    context.options.language,
  );

  return template
    .replaceAll('{diff}', context.diff.diff)
    .replaceAll('{findings}', JSON.stringify(investigationResult.findings, null, 2))
    .replaceAll('{guardrails_reached}', investigationResult.guardrailsReached ? 'true' : 'false')
    .replaceAll(
      '{guardrails_details}',
      investigationResult.guardrailDetails ?? (context.options.language === 'en' ? 'none' : 'なし'),
    )
    .replaceAll('{completed_points}', investigationResult.completedPoints.join(', '))
    .replaceAll('{incomplete_points}', investigationResult.incompletePoints.join(', '))
    .replaceAll('{output_file_path}', outputPath);
}

function getReportOutputPath(logDir: string): string {
  return path.join(logDir, 'report.md');
}

function ensureDirectoryExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readReportOutput(outputPath: string): string {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`レポート出力ファイルが見つかりません: ${outputPath}`);
  }

  const markdown = fs.readFileSync(outputPath, 'utf-8').trim();
  if (!markdown) {
    throw new Error(`レポートファイルが空です: ${outputPath}`);
  }

  logger.debug(`Reporter出力ファイルを読み込みました: ${outputPath}`);
  return markdown;
}

function validateReport(markdown: string, language: 'ja' | 'en'): void {
  if (!markdown || !markdown.trim()) {
    throw new Error('レポート生成に失敗しました: 空の出力が返されました');
  }

  const primaryDisclaimer =
    language === 'en'
      ? 'Decision-making is left to the developer.'
      : '判断は開発者が行ってください';
  const alternateDisclaimer =
    language === 'en'
      ? '判断は開発者が行ってください'
      : 'Decision-making is left to the developer.';

  if (!markdown.includes(primaryDisclaimer) && !markdown.includes(alternateDisclaimer)) {
    logger.warn(`レポートに注意書きが含まれていません: ${primaryDisclaimer}`);
  }
}
