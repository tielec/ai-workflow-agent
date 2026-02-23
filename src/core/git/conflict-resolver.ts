import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PromptLoader } from '../prompt-loader.js';
import { hasConflictMarkers } from './conflict-parser.js';
import type {
  MergeContext,
  ConflictResolutionPlan,
  ConflictResolution,
  ResolutionStrategy,
  ConflictBlock,
} from '../../types/conflict.js';
import { sanitizeForJson } from '../../utils/encoding-utils.js';
import { setupAgent } from '../../commands/pr-comment/analyze/agent-utils.js';
import { CodexAgentClient } from '../codex-agent-client.js';
import { ClaudeAgentClient } from '../claude-agent-client.js';
import { LogFormatter } from '../../phases/formatters/log-formatter.js';

const EXCLUDED_PATTERNS = [
  '.env',
  '.env.*',
  'credentials.json',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.git/**',
  'node_modules/**',
  '.npmrc',
  '.yarnrc',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
];

function matchPattern(filePath: string, pattern: string): boolean {
  if (filePath === pattern) {
    return true;
  }

  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*') +
        '$',
    );
    return regex.test(filePath);
  }

  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return filePath.startsWith(prefix);
  }

  return false;
}

function isExcludedFile(targetPath: string): boolean {
  const normalizedPath = targetPath.replace(/\\/g, '/');
  for (const pattern of EXCLUDED_PATTERNS) {
    if (matchPattern(normalizedPath, pattern)) {
      return true;
    }
  }
  return false;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function normalizeResolution(resolution: ConflictResolution, fallbackContent: string): ConflictResolution {
  const strategy: ResolutionStrategy = resolution.strategy ?? 'manual-merge';
  const resolvedContent = resolution.resolvedContent?.trim().length
    ? resolution.resolvedContent
    : fallbackContent;
  return {
    filePath: resolution.filePath,
    strategy,
    resolvedContent,
    notes: resolution.notes,
  };
}

export class ConflictResolver {
  private readonly repoRoot: string;
  private readonly logFormatter: LogFormatter;

  constructor(repoRoot: string, language?: 'ja' | 'en') {
    this.repoRoot = repoRoot;
    this.logFormatter = new LogFormatter(language ?? 'ja');
  }

  public async createResolutionPlan(
    context: MergeContext,
    options: { agent: 'auto' | 'codex' | 'claude'; language?: 'ja' | 'en'; prNumber: number; baseBranch: string; headBranch: string; outputFilePath?: string; logDir?: string },
  ): Promise<ConflictResolutionPlan> {
    const skippedFiles: string[] = [];
    const warnings: string[] = [];

    const filteredConflicts = context.conflictFiles.filter((block) => {
      if (isExcludedFile(block.filePath)) {
        skippedFiles.push(block.filePath);
        warnings.push(`${block.filePath} は機密ファイルのため自動解消をスキップしました。`);
        return false;
      }
      return true;
    });

    const prompt = this.buildAnalyzePrompt({
      context: { ...context, conflictFiles: filteredConflicts },
      language: options.language,
      outputFilePath: options.outputFilePath ?? '',
    });

    const agent = await setupAgent(options.agent, this.repoRoot);
    if (!agent) {
      logger.warn('No agent client available. Using fallback resolution plan.');
      const fallbackResolutions = filteredConflicts.map((block) => ({
        filePath: block.filePath,
        strategy: 'manual-merge' as const,
        resolvedContent: `${block.oursContent}\n${block.theirsContent}`.trim(),
        notes: 'AI unavailable: fallback plan generated.',
      }));

      return {
        prNumber: options.prNumber,
        baseBranch: options.baseBranch,
        headBranch: options.headBranch,
        generatedAt: new Date().toISOString(),
        resolutions: fallbackResolutions,
        skippedFiles,
        warnings,
      };
    }

    const rawOutput = await this.executeAgent(agent, prompt, options.logDir, 'analyze');
    const extractPlanMetadata = (output: string): Partial<ConflictResolutionPlan> | null => {
      const json = extractJsonObject(output);
      if (!json) {
        return null;
      }
      return JSON.parse(json) as Partial<ConflictResolutionPlan>;
    };

    let parsed = extractPlanMetadata(rawOutput);
    let resolutions = this.parseAgentResolutions(rawOutput, filteredConflicts);
    let didJsonRetry = false;

    if (resolutions === null) {
      logger.warn('Failed to extract JSON from agent output. Retrying with same prompt.');
      const retryOutput = await this.executeAgent(agent, prompt, options.logDir, 'analyze-retry-json');
      const retryParsed = extractPlanMetadata(retryOutput);
      const retryResolutions = this.parseAgentResolutions(retryOutput, filteredConflicts, true) ?? [];

      if (retryResolutions.length === 0) {
        throw new Error('Failed to extract JSON from agent output after retry.');
      }

      didJsonRetry = true;
      parsed = retryParsed;
      resolutions = retryResolutions;
    }

    // Validate all conflict files have resolutions
    const conflictFilePaths = [...new Set(filteredConflicts.map((block) => block.filePath))];
    const resolvedPaths = new Set(resolutions.map((r) => r.filePath));
    let missingFiles = conflictFilePaths.filter((fp) => !resolvedPaths.has(fp));

    const aggregatedSkippedFiles = new Set([...(parsed?.skippedFiles ?? []), ...skippedFiles]);
    const aggregatedWarnings = new Set([...(parsed?.warnings ?? []), ...warnings]);

    if (missingFiles.length > 0) {
      logger.warn(
        `Resolution plan is incomplete: ${missingFiles.length} conflicted files have no resolution: ${missingFiles.join(', ')}. Retrying for missing files.`,
      );

      const missingConflicts = filteredConflicts.filter((block) => missingFiles.includes(block.filePath));
      const retryPrompt = this.buildAnalyzePrompt({
        context: { ...context, conflictFiles: missingConflicts },
        language: options.language,
        outputFilePath: options.outputFilePath ?? '',
      });

      const retryOutput = await this.executeAgent(agent, retryPrompt, options.logDir, 'analyze-retry-missing');
      const retryParsed = extractPlanMetadata(retryOutput);
      const retryResolutions = this.parseAgentResolutions(retryOutput, missingConflicts, true) ?? [];

      if (retryParsed?.skippedFiles) {
        for (const skipped of retryParsed.skippedFiles) {
          aggregatedSkippedFiles.add(skipped);
        }
      }
      if (retryParsed?.warnings) {
        for (const warning of retryParsed.warnings) {
          aggregatedWarnings.add(warning);
        }
      }

      if (retryResolutions.length > 0) {
        resolutions = [...resolutions, ...retryResolutions];
      }

      const resolvedAfterRetry = new Set(resolutions.map((r) => r.filePath));
      missingFiles = conflictFilePaths.filter((fp) => !resolvedAfterRetry.has(fp));

      if (missingFiles.length > 0) {
        throw new Error(
          `Resolution plan is incomplete after retry: ${missingFiles.length} conflicted files have no resolution: ${missingFiles.join(', ')}`,
        );
      }
    }

    return {
      prNumber: options.prNumber,
      baseBranch: options.baseBranch,
      headBranch: options.headBranch,
      generatedAt: new Date().toISOString(),
      resolutions,
      skippedFiles: Array.from(aggregatedSkippedFiles),
      warnings: Array.from(aggregatedWarnings),
    };
  }

  public async resolve(
    plan: ConflictResolutionPlan,
    options: { agent: 'auto' | 'codex' | 'claude'; language?: 'ja' | 'en'; logDir?: string },
  ): Promise<ConflictResolution[]> {
    const resolved: ConflictResolution[] = [];
    const agent = await setupAgent(options.agent, this.repoRoot);

    for (const item of plan.resolutions) {
      if (item.strategy === 'manual-merge' || item.strategy === 'both') {
        if (!item.resolvedContent || item.resolvedContent.trim().length === 0) {
          if (!agent) {
            throw new Error(`No agent available to resolve ${item.filePath}`);
          }
          const sanitizedPath = item.filePath.replace(/[/\\]/g, '_');
          const content = await this.executeAgent(
            agent,
            this.buildResolvePrompt(item, options.language),
            options.logDir,
            `resolve-${sanitizedPath}`,
          );
          resolved.push({
            ...item,
            resolvedContent: content.trim(),
          });
          continue;
        }
      }

      resolved.push(item);
    }

    this.validateResolution(resolved);
    return resolved;
  }

  public validateResolution(resolutions: ConflictResolution[]): void {
    const invalidFiles: string[] = [];

    for (const resolution of resolutions) {
      if (hasConflictMarkers(resolution.resolvedContent)) {
        invalidFiles.push(resolution.filePath);
      }
    }

    if (invalidFiles.length > 0) {
      throw new Error(`Conflict markers remain in resolved files: ${invalidFiles.join(', ')}`);
    }
  }

  private buildAnalyzePrompt(params: { context: MergeContext; language?: 'ja' | 'en'; outputFilePath: string }): string {
    const template = PromptLoader.loadPrompt('conflict', 'analyze', params.language);
    const contextJson = JSON.stringify(params.context, null, 2);
    const conflictFilePaths = [...new Set(params.context.conflictFiles.map((block) => block.filePath))];
    const conflictFileList = conflictFilePaths.map((filePath, index) => `${index + 1}. ${filePath}`).join('\n');

    return template
      .replaceAll('{conflict_file_list}', conflictFileList)
      .replaceAll('{conflict_file_count}', String(conflictFilePaths.length))
      .replaceAll('{merge_context_json}', contextJson)
      .replaceAll('{output_file_path}', params.outputFilePath);
  }

  private parseAgentResolutions(
    rawOutput: string,
    filteredConflicts: ConflictBlock[],
    isRetry = false,
  ): ConflictResolution[] | null {
    const json = extractJsonObject(rawOutput);

    // NOTE: On retry we return an empty list instead of null to avoid repeated retries on parse failure.
    if (!json) {
      return isRetry ? [] : null;
    }

    const parsed = JSON.parse(json) as Partial<ConflictResolutionPlan>;
    return (parsed.resolutions ?? []).map((resolution) => {
      const conflict = filteredConflicts.find((block) => block.filePath === resolution.filePath);
      const fallbackContent = conflict
        ? `${conflict.oursContent}\n${conflict.theirsContent}`.trim()
        : '';
      return normalizeResolution(resolution as ConflictResolution, fallbackContent);
    });
  }

  private buildResolvePrompt(resolution: ConflictResolution, language?: 'ja' | 'en'): string {
    const template = PromptLoader.loadPrompt('conflict', 'resolve', language);
    return template
      .replaceAll('{file_path}', resolution.filePath)
      .replaceAll('{strategy}', resolution.strategy)
      .replaceAll('{current_content}', resolution.resolvedContent ?? '');
  }

  private async executeAgent(
    agent: CodexAgentClient | ClaudeAgentClient,
    prompt: string,
    logDir?: string,
    logLabel?: string,
  ): Promise<string> {
    const actualLogDir = logDir && logLabel ? path.join(logDir, logLabel) : null;
    if (actualLogDir) {
      fs.mkdirSync(actualLogDir, { recursive: true });
      fs.writeFileSync(path.join(actualLogDir, 'prompt.txt'), prompt, 'utf-8');
      logger.info(`Prompt saved to: ${path.join(actualLogDir, 'prompt.txt')}`);
    }

    const startTime = Date.now();
    const messages = await agent.executeTask({
      prompt,
      maxTurns: 10,
      verbose: false,
      workingDirectory: this.repoRoot,
    });
    const endTime = Date.now();

    if (actualLogDir) {
      fs.writeFileSync(path.join(actualLogDir, 'agent_log_raw.txt'), messages.join('\n'), 'utf-8');
      logger.info(`Raw log saved to: ${path.join(actualLogDir, 'agent_log_raw.txt')}`);

      const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
      const formatted = this.logFormatter.formatAgentLog(
        messages, startTime, endTime, endTime - startTime, null, agentName,
      );
      fs.writeFileSync(path.join(actualLogDir, 'agent_log.md'), formatted, 'utf-8');
      logger.info(`Agent log saved to: ${path.join(actualLogDir, 'agent_log.md')}`);
    }

    return sanitizeForJson(messages.join('\n'));
  }
}
