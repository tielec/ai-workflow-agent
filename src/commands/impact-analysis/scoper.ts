import * as fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PromptLoader } from '../../core/prompt-loader.js';
import type { CodexAgentClient } from '../../core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../core/claude-agent-client.js';
import type { PipelineContext, ScopeResult, InvestigationPoint } from './types.js';
import { updateGuardrailsState } from './guardrails.js';

const DEFAULT_REASONING = '調査観点を抽出できませんでした。';

/**
 * Scoperステージ
 */
export async function executeScoper(
  context: PipelineContext,
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
): Promise<ScopeResult> {
  const outputPath = getScoperOutputPath(context.logDir);
  ensureDirectoryExists(path.dirname(outputPath));
  const prompt = buildScoperPrompt(context, outputPath);
  const agentResult = await executeAgentForStage(codexClient, claudeClient, prompt, {
    maxTurns: 3,
    preferLightweight: true,
  });

  const scopeResult = parseScopeResult(readScoperOutput(outputPath));

  if (context.options.customInstruction) {
    scopeResult.investigationPoints.push(
      createCustomInvestigationPoint(context.options.customInstruction),
    );
  }

  updateGuardrailsState(context.guardrailsState, agentResult);

  return scopeResult;
}

export async function executeAgentForStage(
  codexClient: CodexAgentClient | null,
  claudeClient: ClaudeAgentClient | null,
  prompt: string,
  options: { maxTurns?: number; preferLightweight?: boolean } = {},
): Promise<string[]> {
  const primaryClient = claudeClient ?? codexClient;
  const fallbackClient = claudeClient ? codexClient : null;

  if (!primaryClient) {
    throw new Error('利用可能なエージェントがありません');
  }

  try {
    return await primaryClient.executeTask({
      prompt,
      maxTurns: options.maxTurns ?? 5,
    });
  } catch (error) {
    logger.warn(`プライマリエージェント失敗: ${getErrorMessage(error)}`);
    if (fallbackClient) {
      logger.info('フォールバックエージェントで再試行...');
      return await fallbackClient.executeTask({
        prompt,
        maxTurns: options.maxTurns ?? 5,
      });
    }
    throw error;
  }
}

function buildScoperPrompt(context: PipelineContext, outputPath: string): string {
  const template = PromptLoader.loadPrompt(
    'impact-analysis',
    'scoper',
    context.options.language,
  );

  return template
    .replaceAll('{diff}', context.diff.diff)
    .replaceAll('{playbook}', context.playbook)
    .replaceAll('{custom_instruction}', context.options.customInstruction ?? 'なし')
    .replaceAll('{output_file_path}', outputPath);
}

function getScoperOutputPath(logDir: string): string {
  return path.join(logDir, 'scoper-result.json');
}

function ensureDirectoryExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readScoperOutput(outputPath: string): string {
  if (fs.existsSync(outputPath)) {
    const fileContent = fs.readFileSync(outputPath, 'utf-8').trim();
    logger.debug(`Scoper出力ファイルを読み込みました: ${outputPath}`);
    if (fileContent) {
      return fileContent;
    }
  }

  const message = `Scoper出力未生成: ${outputPath}`;
  logger.warn(message);
  throw new Error(message);
}

function parseScopeResult(rawText: string): ScopeResult {
  const candidates = [rawText];
  const extractedJson = extractJsonBlock(rawText);
  if (extractedJson && extractedJson !== rawText) {
    candidates.push(extractedJson);
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate) as Partial<ScopeResult>;
      return {
        investigationPoints: normalizeInvestigationPoints(parsed.investigationPoints),
        matchedPatterns: Array.isArray(parsed.matchedPatterns) ? parsed.matchedPatterns : [],
        skippedPatterns: Array.isArray(parsed.skippedPatterns) ? parsed.skippedPatterns : [],
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : rawText || DEFAULT_REASONING,
      };
    } catch (error) {
      logger.warn(`Scoper出力のJSONパースに失敗: ${getErrorMessage(error)}`);
    }
  }

  return {
    investigationPoints: [],
    matchedPatterns: [],
    skippedPatterns: [],
    reasoning: rawText || DEFAULT_REASONING,
  };
}

function normalizeInvestigationPoints(value: ScopeResult['investigationPoints'] | undefined): InvestigationPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point, index) => ({
      id: typeof point?.id === 'string' ? point.id : `INV-${String(index + 1).padStart(3, '0')}`,
      patternName: typeof point?.patternName === 'string' ? point.patternName : 'unknown',
      description: typeof point?.description === 'string' ? point.description : '',
      targetFiles: Array.isArray(point?.targetFiles) ? point.targetFiles : [],
      searchKeywords: Array.isArray(point?.searchKeywords) ? point.searchKeywords : [],
      instructions: typeof point?.instructions === 'string' ? point.instructions : '',
    }))
    .filter((point) => point.description || point.instructions || point.patternName !== 'unknown');
}

function createCustomInvestigationPoint(customInstruction: string): InvestigationPoint {
  return {
    id: 'INV-CUSTOM',
    patternName: 'custom-instruction',
    description: 'ユーザー指定の追加調査観点',
    targetFiles: [],
    searchKeywords: [],
    instructions: customInstruction.trim(),
  };
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
