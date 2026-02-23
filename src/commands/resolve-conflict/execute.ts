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
import { hasConflictMarkers } from '../../core/git/conflict-parser.js';
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

/**
 * Mechanically resolve a file with conflict markers using the 'both' strategy.
 * Replaces each conflict block with both ours and theirs content concatenated.
 */
function resolveByBothStrategy(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      i++;
      const ours: string[] = [];
      while (i < lines.length && !lines[i].startsWith('|||||||') && !lines[i].startsWith('=======')) {
        ours.push(lines[i]);
        i++;
      }
      // Skip base section if present (diff3 format)
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        i++;
        while (i < lines.length && !lines[i].startsWith('=======')) {
          i++;
        }
      }
      if (i < lines.length && lines[i].startsWith('=======')) {
        i++;
      }
      const theirs: string[] = [];
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirs.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].startsWith('>>>>>>>')) {
        i++;
      }
      result.push(...ours, ...theirs);
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
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

    // Step 1: Load metadata and plan before branch switch
    const metadata = await metadataManager.getMetadata();
    if (!metadata.resolutionPlanPath) {
      throw new Error('Resolution plan not found. Run analyze first.');
    }

    const plan = await loadResolutionPlan(metadata.resolutionPlanPath);

    const baseBranch = metadata.baseBranch;
    const headBranch = metadata.headBranch;
    if (!baseBranch || !headBranch) {
      throw new Error('Base or head branch not found in metadata. Run analyze first.');
    }

    // Step 2: Prepare output directory and resolver
    const outputDir = path.join(repoRoot, '.ai-workflow', `conflict-${prInfo.prNumber}`);
    await fsp.mkdir(outputDir, { recursive: true });

    const language = options.language === 'en' ? 'en' as const : 'ja' as const;
    const resolver = new ConflictResolver(repoRoot, language);
    const resolutions: ConflictResolution[] = plan.resolutions.map((r) => ({ ...r }));

    // Step 3: Git setup and branch preparation
    const git = simpleGit(repoRoot);
    await ensureGitConfig(git);
    await git.fetch('origin', baseBranch);
    await git.fetch('origin', headBranch);

    const currentStatus = await git.status();
    const originalBranch = currentStatus.current ?? 'HEAD';

    const locals = await git.branchLocal();
    if (locals.all.includes(headBranch)) {
      await git.checkout(headBranch);
    } else {
      await git.checkoutBranch(headBranch, `origin/${headBranch}`);
    }

    // Step 4: Merge base branch (conflicts are expected)
    let mergeStarted = false;
    let mergeCommandError: unknown = null;
    try {
      await git.raw(['merge', '--no-commit', '--no-ff', `origin/${baseBranch}`]);
      mergeStarted = true;
    } catch (err: unknown) {
      mergeCommandError = err;
    }

    // Always check for unmerged files after merge (simple-git may not throw on conflicts)
    const mergeStatus = await git.status();
    const conflictedFiles = mergeStatus.conflicted ?? [];
    if (conflictedFiles.length > 0) {
      mergeStarted = true;
      logger.info(`Merge conflicts detected (${conflictedFiles.length} files): ${conflictedFiles.join(', ')}`);
    } else if (mergeCommandError) {
      throw new Error(`Merge failed unexpectedly: ${getErrorMessage(mergeCommandError)}`);
    } else {
      logger.info('Merge completed without conflicts.');
    }

    // Step 4.5: Mechanical resolution for ours/theirs/both
    for (const resolution of resolutions) {
      const filePath = resolution.filePath;
      if (resolution.strategy === 'ours') {
        await git.raw(['checkout', '--ours', '--', filePath]);
        logger.info(`Resolved ${filePath} with 'ours' strategy (mechanical)`);
      } else if (resolution.strategy === 'theirs') {
        await git.raw(['checkout', '--theirs', '--', filePath]);
        logger.info(`Resolved ${filePath} with 'theirs' strategy (mechanical)`);
      } else if (resolution.strategy === 'both') {
        const absPath = path.join(repoRoot, filePath);
        const content = await fsp.readFile(absPath, 'utf-8');
        const resolved = resolveByBothStrategy(content);
        if (hasConflictMarkers(resolved)) {
          throw new Error(`Failed to mechanically resolve ${filePath} with 'both' strategy: conflict markers remain`);
        }
        await fsp.writeFile(absPath, resolved, 'utf-8');
        logger.info(`Resolved ${filePath} with 'both' strategy (mechanical)`);
      }
    }

    // Update resolution objects with actual file content for artifacts
    for (const resolution of resolutions) {
      if (resolution.strategy === 'ours' || resolution.strategy === 'theirs' || resolution.strategy === 'both') {
        resolution.resolvedContent = await fsp.readFile(path.join(repoRoot, resolution.filePath), 'utf-8');
      }
    }

    // Step 5: Resolve manual-merge files via AI agent (using actual conflicted content)
    const manualMergeResolutions = resolutions.filter((r) => r.strategy === 'manual-merge');
    for (const resolution of manualMergeResolutions) {
      const absPath = path.join(repoRoot, resolution.filePath);
      const conflictedContent = await fsp.readFile(absPath, 'utf-8');
      try {
        const resolvedContent = await resolver.resolveFile(
          resolution.filePath,
          conflictedContent,
          resolution.notes,
          { agent: options.agent ?? 'auto', language, logDir: outputDir },
        );
        await fsp.writeFile(absPath, resolvedContent, 'utf-8');
        resolution.resolvedContent = resolvedContent;
        logger.info(`Resolved ${resolution.filePath} with 'manual-merge' strategy (agent)`);
      } catch (resolveError: unknown) {
        if (mergeStarted) {
          try { await git.raw(['merge', '--abort']); } catch { /* ignore */ }
        }
        throw new Error(`Failed to resolve ${resolution.filePath}: ${getErrorMessage(resolveError)}`);
      }
    }

    if (options.dryRun) {
      if (mergeStarted) {
        try { await git.raw(['merge', '--abort']); } catch { /* ignore */ }
      }
      await git.checkout(originalBranch);
      logger.info('[DRY-RUN] Changes preview completed. No files were modified.');
      return;
    }

    // Step 6: Create merge commit
    await git.add(resolutions.map((r) => r.filePath));

    // Check for remaining unmerged files not covered by the resolution plan
    const postAddStatus = await git.status();
    const remainingConflicted = postAddStatus.conflicted ?? [];
    if (remainingConflicted.length > 0) {
      if (mergeStarted) {
        try { await git.raw(['merge', '--abort']); } catch { /* ignore */ }
      }
      throw new Error(
        `Remaining unmerged files not in resolution plan: ${remainingConflicted.join(', ')}. Aborting merge to prevent committing conflict markers.`,
      );
    }

    const commitStatus = await git.status();
    if (commitStatus.files.length > 0) {
      await git.commit(`[resolve-conflict] Resolve merge conflicts for PR #${prInfo.prNumber}`);
      logger.info(`Created merge commit for PR #${prInfo.prNumber}`);
    } else {
      logger.info('No file changes to commit.');
    }

    // Step 7: Save artifacts and update metadata
    await fsp.mkdir(outputDir, { recursive: true });

    const resultJsonPath = path.join(outputDir, 'resolution-result.json');
    const resultMdPath = path.join(outputDir, 'resolution-result.md');

    await fsp.writeFile(resultJsonPath, JSON.stringify(resolutions, null, 2), 'utf-8');
    await fsp.writeFile(resultMdPath, buildResolutionResultMarkdown(resolutions, resultJsonPath), 'utf-8');

    await metadataManager.setResolutionResult(resultMdPath);
    await metadataManager.updateStatus('executed');

    try {
      const workflowDir = path.join('.ai-workflow', `conflict-${prInfo.prNumber}`);
      await git.add(path.join(workflowDir, '*'));
      await git.commit(`resolve-conflict: execute artifacts for PR #${prInfo.prNumber}`);
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit execute artifacts: ${getErrorMessage(commitError)}`);
    }

    logger.info(`Execute completed. Result saved to: ${resultMdPath}`);
  } catch (error) {
    logger.error(`Failed to execute conflict resolution: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
