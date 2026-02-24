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

function normalizeResolution(resolution: ConflictResolution): ConflictResolution {
  const strategy: ResolutionStrategy = resolution.strategy ?? 'manual-merge';

  // resolvedContent is always cleared here.
  // All strategies are resolved in the execute phase after the actual merge:
  //   ours/theirs: git checkout --ours/--theirs
  //   both: mechanical combination of conflict blocks
  //   manual-merge: agent resolves using the actual conflicted file content
  return {
    filePath: resolution.filePath,
    strategy,
    resolvedContent: '',
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

    const filteredContext = { ...context, conflictFiles: filteredConflicts };
    const contextFilePath = this.writeContextFile(filteredContext, options.logDir, options.outputFilePath);

    const prompt = this.buildAnalyzePrompt({
      context: filteredContext,
      language: options.language,
      outputFilePath: options.outputFilePath ?? '',
      contextFilePath,
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
    const outputFilePath = options.outputFilePath ? path.resolve(options.outputFilePath) : '';
    const planOutput = this.readOutputOrFallback(outputFilePath, rawOutput);

    const extractPlanMetadata = (output: string): Partial<ConflictResolutionPlan> | null => {
      const json = extractJsonObject(output);
      if (!json) {
        return null;
      }
      return JSON.parse(json) as Partial<ConflictResolutionPlan>;
    };

    let parsed = extractPlanMetadata(planOutput);
    let resolutions = this.parseAgentResolutions(planOutput, filteredConflicts);
    let didJsonRetry = false;

    if (resolutions === null) {
      logger.warn('Failed to extract JSON from agent output. Retrying with same prompt.');
      const retryRawOutput = await this.executeAgent(agent, prompt, options.logDir, 'analyze-retry-json');
      const retryPlanOutput = this.readOutputOrFallback(outputFilePath, retryRawOutput);
      const retryParsed = extractPlanMetadata(retryPlanOutput);
      const retryResolutions = this.parseAgentResolutions(retryPlanOutput, filteredConflicts, true) ?? [];

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
      const missingOutputFilePath = options.logDir
        ? path.resolve(path.join(options.logDir, 'analyze-retry-missing-output.json'))
        : '';
      const missingContext = { ...context, conflictFiles: missingConflicts };
      const missingContextFilePath = this.writeContextFile(missingContext, options.logDir, missingOutputFilePath, 'retry-missing');
      const retryPrompt = this.buildAnalyzePrompt({
        context: missingContext,
        language: options.language,
        outputFilePath: missingOutputFilePath,
        contextFilePath: missingContextFilePath,
      });

      const retryRawOutput = await this.executeAgent(agent, retryPrompt, options.logDir, 'analyze-retry-missing');
      const retryPlanOutput = this.readOutputOrFallback(missingOutputFilePath, retryRawOutput);
      const retryParsed = extractPlanMetadata(retryPlanOutput);
      const retryResolutions = this.parseAgentResolutions(retryPlanOutput, missingConflicts, true) ?? [];

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

  /**
   * Resolve a single file using AI agent.
   * Called after merge so the agent receives actual conflicted file content.
   */
  public async resolveFile(
    filePath: string,
    conflictedContent: string,
    notes: string | undefined,
    options: { agent: 'auto' | 'codex' | 'claude'; language?: 'ja' | 'en'; logDir?: string },
  ): Promise<string> {
    const agent = await setupAgent(options.agent, this.repoRoot);
    if (!agent) {
      throw new Error(`No agent available to resolve ${filePath}`);
    }

    const resolution: ConflictResolution = {
      filePath,
      strategy: 'manual-merge',
      resolvedContent: conflictedContent,
      notes,
    };

    const sanitizedPath = filePath.replace(/[/\\]/g, '_');
    const logLabel = `resolve-${sanitizedPath}`;
    const resolveOutputFilePath = options.logDir
      ? path.resolve(path.join(options.logDir, logLabel, 'resolved-output.txt'))
      : '';
    const rawContent = await this.executeAgent(
      agent,
      this.buildResolvePrompt(resolution, options.language, resolveOutputFilePath),
      options.logDir,
      logLabel,
    );
    const content = this.readOutputOrFallback(resolveOutputFilePath, rawContent);
    const resolved = content.trim();

    if (hasConflictMarkers(resolved)) {
      throw new Error(`Agent output still contains conflict markers for ${filePath}`);
    }

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

  private buildAnalyzePrompt(params: { context: MergeContext; language?: 'ja' | 'en'; outputFilePath: string; contextFilePath: string }): string {
    const template = PromptLoader.loadPrompt('conflict', 'analyze', params.language);
    const conflictFilePaths = [...new Set(params.context.conflictFiles.map((block) => block.filePath))];
    const conflictFileList = conflictFilePaths.map((filePath, index) => `${index + 1}. ${filePath}`).join('\n');

    let result = template
      .replaceAll('{conflict_file_list}', conflictFileList)
      .replaceAll('{conflict_file_count}', String(conflictFilePaths.length))
      .replaceAll('{merge_context_file_path}', params.contextFilePath)
      .replaceAll('{output_file_path}', params.outputFilePath);

    // base-phase.injectOutputPathInstruction() と同じパターン
    if (params.outputFilePath) {
      const outputInstruction = [
        '**IMPORTANT: Output File Path**',
        `- Write to this exact absolute path using the Write tool: \`${params.outputFilePath}\``,
        '- Do NOT use relative paths or `/workspace` prefixes. Use the absolute path above.',
      ].join('\n');

      const lines = result.split('\n');
      const headingIndex = lines.findIndex((line) => line.trim().startsWith('#'));
      if (headingIndex === -1) {
        result = [outputInstruction, '', result].join('\n');
      } else {
        result = [
          ...lines.slice(0, headingIndex + 1),
          '',
          outputInstruction,
          '',
          ...lines.slice(headingIndex + 1),
        ].join('\n');
      }
    }

    return result;
  }

  private writeContextFile(context: MergeContext, logDir?: string, outputFilePath?: string, suffix?: string): string {
    const filename = suffix ? `merge-context-${suffix}.json` : 'merge-context.json';
    const contextFilePath = logDir
      ? path.resolve(path.join(logDir, filename))
      : outputFilePath
        ? path.resolve(path.join(path.dirname(outputFilePath), filename))
        : '';

    if (contextFilePath) {
      const dir = path.dirname(contextFilePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(contextFilePath, JSON.stringify(context, null, 2), 'utf-8');
      logger.info(`Merge context written to: ${contextFilePath}`);
    }

    return contextFilePath;
  }

  private readOutputOrFallback(outputFilePath: string, stdoutFallback: string): string {
    if (outputFilePath && fs.existsSync(outputFilePath)) {
      logger.info(`Reading agent output from file: ${outputFilePath}`);
      return fs.readFileSync(outputFilePath, 'utf-8');
    }
    logger.warn('Output file not found. Falling back to stdout parsing.');
    return stdoutFallback;
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
      return normalizeResolution(resolution as ConflictResolution);
    });
  }

  private buildResolvePrompt(resolution: ConflictResolution, language?: 'ja' | 'en', outputFilePath?: string): string {
    const template = PromptLoader.loadPrompt('conflict', 'resolve', language);
    let result = template
      .replaceAll('{file_path}', resolution.filePath)
      .replaceAll('{strategy}', resolution.strategy)
      .replaceAll('{notes}', resolution.notes ?? '')
      .replaceAll('{current_content}', resolution.resolvedContent ?? '')
      .replaceAll('{output_file_path}', outputFilePath ?? '');

    if (outputFilePath) {
      const outputInstruction = [
        '**IMPORTANT: Output File Path**',
        `- Write to this exact absolute path using the Write tool: \`${outputFilePath}\``,
        '- Do NOT use relative paths or `/workspace` prefixes. Use the absolute path above.',
      ].join('\n');

      const lines = result.split('\n');
      const headingIndex = lines.findIndex((line) => line.trim().startsWith('#'));
      if (headingIndex === -1) {
        result = [outputInstruction, '', result].join('\n');
      } else {
        result = [
          ...lines.slice(0, headingIndex + 1),
          '',
          outputInstruction,
          '',
          ...lines.slice(headingIndex + 1),
        ].join('\n');
      }
    }

    return result;
  }

  private async executeAgent(
    agent: CodexAgentClient | ClaudeAgentClient,
    prompt: string,
    logDir?: string,
    logLabel?: string,
  ): Promise<string> {
    const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
    const label = logLabel ?? 'unknown';
    logger.info(`Running ${agentName} for conflict resolution [${label}]`);

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
    const duration = endTime - startTime;

    logger.info(`${agentName} completed [${label}] in ${duration}ms (${messages.length} messages)`);

    // エージェント出力をコンソールに表示
    if (agent instanceof CodexAgentClient) {
      logger.debug(`${agentName} emitted messages:`);
      messages.slice(0, 10).forEach((line, index) => {
        logger.debug(`[Codex][${index}] ${line}`);
      });
    } else {
      logger.debug(`${agentName} emitted messages:`);
      messages.slice(0, 10).forEach((line, index) => {
        logger.debug(`[Claude][${index}] ${line}`);
      });
    }

    // ログファイル保存
    if (actualLogDir) {
      fs.writeFileSync(path.join(actualLogDir, 'agent_log_raw.txt'), messages.join('\n'), 'utf-8');
      logger.info(`Raw log saved to: ${path.join(actualLogDir, 'agent_log_raw.txt')}`);

      const formatted = this.logFormatter.formatAgentLog(
        messages, startTime, endTime, duration, null, agentName,
      );
      fs.writeFileSync(path.join(actualLogDir, 'agent_log.md'), formatted, 'utf-8');
      logger.info(`Agent log saved to: ${path.join(actualLogDir, 'agent_log.md')}`);
    }

    return sanitizeForJson(messages.join('\n'));
  }
}
