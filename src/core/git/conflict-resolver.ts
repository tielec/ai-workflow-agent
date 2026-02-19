import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { PromptLoader } from '../prompt-loader.js';
import { hasConflictMarkers } from './conflict-parser.js';
import type { MergeContext, ConflictResolutionPlan, ConflictResolution, ResolutionStrategy } from '../../types/conflict.js';
import { sanitizeForJson } from '../../utils/encoding-utils.js';
import { setupAgent } from '../../commands/pr-comment/analyze/agent-utils.js';
import { CodexAgentClient } from '../codex-agent-client.js';
import { ClaudeAgentClient } from '../claude-agent-client.js';

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

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  public async createResolutionPlan(
    context: MergeContext,
    options: { agent: 'auto' | 'codex' | 'claude'; language?: 'ja' | 'en'; prNumber: number; baseBranch: string; headBranch: string; outputFilePath?: string },
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

    const rawOutput = await this.executeAgent(agent, prompt);
    const json = extractJsonObject(rawOutput);

    if (!json) {
      throw new Error('Failed to extract JSON from agent output.');
    }

    const parsed = JSON.parse(json) as Partial<ConflictResolutionPlan>;
    const resolutions = (parsed.resolutions ?? []).map((resolution) => {
      const conflict = filteredConflicts.find((block) => block.filePath === resolution.filePath);
      const fallbackContent = conflict
        ? `${conflict.oursContent}\n${conflict.theirsContent}`.trim()
        : '';
      return normalizeResolution(resolution as ConflictResolution, fallbackContent);
    });

    return {
      prNumber: options.prNumber,
      baseBranch: options.baseBranch,
      headBranch: options.headBranch,
      generatedAt: new Date().toISOString(),
      resolutions,
      skippedFiles: Array.from(new Set([...(parsed.skippedFiles ?? []), ...skippedFiles])),
      warnings: Array.from(new Set([...(parsed.warnings ?? []), ...warnings])),
    };
  }

  public async resolve(
    plan: ConflictResolutionPlan,
    options: { agent: 'auto' | 'codex' | 'claude'; language?: 'ja' | 'en' },
  ): Promise<ConflictResolution[]> {
    const resolved: ConflictResolution[] = [];
    const agent = await setupAgent(options.agent, this.repoRoot);

    for (const item of plan.resolutions) {
      if (item.strategy === 'manual-merge' || item.strategy === 'both') {
        if (!item.resolvedContent || item.resolvedContent.trim().length === 0) {
          if (!agent) {
            throw new Error(`No agent available to resolve ${item.filePath}`);
          }
          const content = await this.executeAgent(agent, this.buildResolvePrompt(item, options.language));
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

    return template
      .replaceAll('{merge_context_json}', contextJson)
      .replaceAll('{output_file_path}', params.outputFilePath);
  }

  private buildResolvePrompt(resolution: ConflictResolution, language?: 'ja' | 'en'): string {
    const template = PromptLoader.loadPrompt('conflict', 'resolve', language);
    return template
      .replaceAll('{file_path}', resolution.filePath)
      .replaceAll('{strategy}', resolution.strategy)
      .replaceAll('{current_content}', resolution.resolvedContent ?? '');
  }

  private async executeAgent(agent: CodexAgentClient | ClaudeAgentClient, prompt: string): Promise<string> {
    const messages = await agent.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
      workingDirectory: this.repoRoot,
    });

    return sanitizeForJson(messages.join('\n'));
  }
}
