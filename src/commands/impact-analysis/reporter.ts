import * as fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
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
  const outputPath = getReportOutputPath(context.logDir);
  ensureDirectoryExists(path.dirname(outputPath));
  const prompt = buildReporterPrompt(context, investigationResult, outputPath);

  const agentResult = await executeAgentForStage(codexClient, claudeClient, prompt, {
    maxTurns: 3,
    preferLightweight: true,
  });

  const markdown = readReportOutput(outputPath, agentResult);
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

function readReportOutput(outputPath: string, agentMessages: string[]): string {
  if (fs.existsSync(outputPath)) {
    const markdown = fs.readFileSync(outputPath, 'utf-8').trim();
    logger.debug(`Reporter出力ファイルを読み込みました: ${outputPath}`);
    if (markdown) {
      return markdown;
    }
    logger.warn(`レポートファイルが空です。エージェント出力テキストからフォールバックします: ${outputPath}`);
  }
  if (!fs.existsSync(outputPath)) {
    logger.warn(
      `出力ファイルが見つかりません。エージェント出力テキストからレポートを抽出します: ${outputPath}`,
    );
  }
  const fallbackMarkdown = agentMessages.join('\n').trim();
  if (fallbackMarkdown) {
    return fallbackMarkdown;
  }

  throw new Error('レポート生成に失敗しました: 空の出力が返されました');
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
