import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { ensureGitConfig } from '../../core/git/git-config-helper.js';
import { ConflictMetadataManager } from '../../core/conflict/metadata-manager.js';
import { parsePullRequestUrl, resolveRepoPathFromPrUrl } from '../../core/repository-utils.js';
import { ConflictResolver } from '../../core/git/conflict-resolver.js';
import { CodeChangeApplier } from '../../core/pr-comment/change-applier.js';
import type { ResolveConflictExecuteOptions } from '../../types/commands.js';
import type { ConflictResolutionPlan, ConflictResolution } from '../../types/conflict.js';

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

function buildResolutionResultMarkdown(resolutions: ConflictResolution[], jsonPath: string): string {
  return [
    '# 解消結果',
    '',
    `- 対象ファイル数: ${resolutions.length}`,
    '',
    `- JSON: ${jsonPath}`,
    '',
    '```json',
    JSON.stringify(resolutions, null, 2),
    '```',
    '',
  ].join('\n');
}

async function loadResolutionPlan(planPath: string): Promise<ConflictResolutionPlan> {
  const content = await fsp.readFile(planPath, 'utf-8');
  const json = extractJsonObject(content) ?? content;
  return JSON.parse(json) as ConflictResolutionPlan;
}

export async function handleResolveConflictExecuteCommand(options: ResolveConflictExecuteOptions): Promise<void> {
  try {
    const prInfo = parsePullRequestUrl(options.prUrl);
    const repoRoot = resolveRepoPathFromPrUrl(options.prUrl);
    const metadataManager = new ConflictMetadataManager(repoRoot, prInfo.prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'resolve-conflict init' first.");
      process.exit(1);
    }

    const metadata = await metadataManager.getMetadata();
    if (!metadata.resolutionPlanPath) {
      throw new Error('Resolution plan not found. Run analyze first.');
    }

    const plan = await loadResolutionPlan(metadata.resolutionPlanPath);

    const resolver = new ConflictResolver(repoRoot);
    const resolutions = await resolver.resolve(plan, {
      agent: options.agent ?? 'auto',
      language: options.language === 'en' ? 'en' : 'ja',
    });

    const applier = new CodeChangeApplier(repoRoot);
    const changes = resolutions.map((resolution) => ({
      path: resolution.filePath,
      change_type: 'modify' as const,
      content: resolution.resolvedContent,
    }));

    const applyResult = await applier.apply(changes, options.dryRun ?? false);
    if (!applyResult.success) {
      throw new Error(applyResult.error ?? 'Failed to apply resolved changes');
    }

    if (options.dryRun) {
      logger.info('[DRY-RUN] Changes preview completed. No files were modified.');
      return;
    }

    const outputDir = path.join(repoRoot, '.ai-workflow', `conflict-${prInfo.prNumber}`);
    await fsp.mkdir(outputDir, { recursive: true });

    const resultJsonPath = path.join(outputDir, 'resolution-result.json');
    const resultMdPath = path.join(outputDir, 'resolution-result.md');

    await fsp.writeFile(resultJsonPath, JSON.stringify(resolutions, null, 2), 'utf-8');
    await fsp.writeFile(resultMdPath, buildResolutionResultMarkdown(resolutions, resultJsonPath), 'utf-8');

    const git = simpleGit(repoRoot);
    await ensureGitConfig(git);
    await git.add(resolutions.map((resolution) => resolution.filePath));
    const status = await git.status();
    if (status.files.length > 0) {
      await git.commit(`[resolve-conflict] Resolve conflicts for PR #${prInfo.prNumber}`);
    } else {
      logger.info('No file changes to commit.');
    }

    await metadataManager.setResolutionResult(resultMdPath);
    await metadataManager.updateStatus('executed');

    try {
      const workflowDir = path.join('.ai-workflow', `conflict-${prInfo.prNumber}`);
      await git.add(path.join(workflowDir, '*'));
      await git.commit(`resolve-conflict: execute artifacts for PR #${prInfo.prNumber}`);
      logger.info(`Committed execute artifacts for PR #${prInfo.prNumber}`);
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit execute artifacts: ${getErrorMessage(commitError)}`);
    }

    logger.info(`Execute completed. Result saved to: ${resultMdPath}`);
  } catch (error) {
    logger.error(`Failed to execute conflict resolution: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
