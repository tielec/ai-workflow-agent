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

    // Step 2: Resolve conflicts (agent call if needed)
    const resolver = new ConflictResolver(repoRoot);
    const resolutions = await resolver.resolve(plan, {
      agent: options.agent ?? 'auto',
      language: options.language === 'en' ? 'en' : 'ja',
    });

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
    try {
      await git.raw(['merge', '--no-commit', '--no-ff', `origin/${baseBranch}`]);
      mergeStarted = true;
      logger.info('Merge completed without conflicts.');
    } catch (mergeError: unknown) {
      const mergeStatus = await git.status();
      if (mergeStatus.conflicted && mergeStatus.conflicted.length > 0) {
        mergeStarted = true;
        logger.info(`Merge conflicts detected (${mergeStatus.conflicted.length} files). Applying resolutions.`);
      } else {
        throw new Error(`Merge failed unexpectedly: ${getErrorMessage(mergeError)}`);
      }
    }

    // Step 5: Apply resolved content
    const applier = new CodeChangeApplier(repoRoot);
    const changes = resolutions.map((r) => ({
      path: r.filePath,
      change_type: 'modify' as const,
      content: r.resolvedContent,
    }));

    const applyResult = await applier.apply(changes, options.dryRun ?? false);
    if (!applyResult.success) {
      if (mergeStarted) {
        try { await git.raw(['merge', '--abort']); } catch { /* ignore */ }
      }
      throw new Error(applyResult.error ?? 'Failed to apply resolved changes');
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
    const commitStatus = await git.status();
    if (commitStatus.files.length > 0) {
      await git.commit(`[resolve-conflict] Resolve merge conflicts for PR #${prInfo.prNumber}`);
      logger.info(`Created merge commit for PR #${prInfo.prNumber}`);
    } else {
      logger.info('No file changes to commit.');
    }

    // Step 7: Save artifacts and update metadata
    const outputDir = path.join(repoRoot, '.ai-workflow', `conflict-${prInfo.prNumber}`);
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
