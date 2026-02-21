import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { GitHubClient } from '../../core/github-client.js';
import { ConflictMetadataManager } from '../../core/conflict/metadata-manager.js';
import { parsePullRequestUrl, resolveRepoPathFromPrUrl } from '../../core/repository-utils.js';
import { parseConflictMarkers } from '../../core/git/conflict-parser.js';
import { MergeContextCollector } from '../../core/git/merge-context-collector.js';
import { ConflictResolver } from '../../core/git/conflict-resolver.js';
import { ensureGitUserConfig } from '../../core/git/git-config-helper.js';
import type { ResolveConflictAnalyzeOptions } from '../../types/commands.js';
import type { ConflictBlock, ConflictResolutionPlan } from '../../types/conflict.js';

function buildResolutionPlanMarkdown(plan: ConflictResolutionPlan, jsonPath: string): string {
  return [
    '# 解消計画',
    '',
    `- PR: #${plan.prNumber}`,
    `- base: ${plan.baseBranch}`,
    `- head: ${plan.headBranch}`,
    `- generated: ${plan.generatedAt}`,
    '',
    `- JSON: ${jsonPath}`,
    '',
    '```json',
    JSON.stringify(plan, null, 2),
    '```',
    '',
  ].join('\n');
}

export async function handleResolveConflictAnalyzeCommand(options: ResolveConflictAnalyzeOptions): Promise<void> {
  let repoRoot = '';
  let prNumber = 0;

  try {
    const prInfo = parsePullRequestUrl(options.prUrl);
    prNumber = prInfo.prNumber;
    repoRoot = resolveRepoPathFromPrUrl(options.prUrl);

    const metadataManager = new ConflictMetadataManager(repoRoot, prNumber);
    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'resolve-conflict init' first.");
      process.exit(1);
    }

    const metadata = await metadataManager.getMetadata();
    const githubClient = new GitHubClient(undefined, prInfo.repositoryName);

    const pr = await githubClient.getPullRequestInfo(prNumber);
    const baseBranch = metadata.baseBranch ?? pr.base;
    const headBranch = metadata.headBranch ?? pr.head;

    if (!baseBranch || !headBranch) {
      throw new Error('Base or head branch could not be determined.');
    }

    const repoGit = simpleGit(repoRoot);
    await repoGit.fetch('origin', baseBranch);
    await repoGit.fetch('origin', headBranch);
    const status = await repoGit.status();
    const nonWorkflowFiles = status.files.filter((file) => !file.path.startsWith('.ai-workflow/'));
    if (nonWorkflowFiles.length > 0) {
      throw new Error('Working tree is not clean. Please commit or stash changes before analyze.');
    }

    await ensureGitUserConfig(repoGit);

    const currentBranch = status.current ?? 'HEAD';
    let switched = false;

    if (currentBranch !== baseBranch && currentBranch !== `origin/${baseBranch}`) {
      const locals = await repoGit.branchLocal();
      if (locals.all.includes(baseBranch)) {
        await repoGit.checkout(baseBranch);
      } else {
        await repoGit.checkoutBranch(baseBranch, `origin/${baseBranch}`);
      }
      switched = true;
    }

    let conflictFiles: string[] = [];
    let conflictBlocks: ConflictBlock[] = [];

    try {
      const localBranches = await repoGit.branchLocal();
      const mergeTarget = localBranches.all.includes(headBranch) ? headBranch : `origin/${headBranch}`;
      await repoGit.raw(['merge', '--no-commit', '--no-ff', mergeTarget]);

      const mergeStatus = await repoGit.status();
      conflictFiles = mergeStatus.conflicted ?? [];

      if (conflictFiles.length === 0) {
        logger.info('No conflicts detected.');
        await repoGit.raw(['merge', '--abort']);
        await metadataManager.updateStatus('analyzed', {
          conflictFiles: [],
          baseBranch,
          headBranch,
        });
        return;
      }

      for (const filePath of conflictFiles) {
        const content = await fsp.readFile(path.join(repoRoot, filePath), 'utf-8');
        try {
          const blocks = parseConflictMarkers(content, filePath);
          conflictBlocks = conflictBlocks.concat(blocks);
        } catch (parseError) {
          logger.warn(`Failed to parse conflict markers for ${filePath}: ${getErrorMessage(parseError)}`);
        }
      }
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`merge --no-commit failed: ${message}`);
      try {
        await repoGit.raw(['merge', '--abort']);
      } catch (abortError) {
        logger.warn(`merge --abort failed: ${getErrorMessage(abortError)}`);
      }
      throw error;
    } finally {
      try {
        await repoGit.raw(['merge', '--abort']);
      } catch {
        // ignore
      }
      if (switched && currentBranch !== 'HEAD') {
        await repoGit.checkout(currentBranch);
      }
    }

    if (conflictBlocks.length === 0) {
      logger.warn('Conflict markers could not be parsed. Manual resolution may be required.');
    }

    const collector = new MergeContextCollector(repoRoot, githubClient);
    const context = await collector.collect(baseBranch, headBranch, prNumber, conflictBlocks);

    const outputDir = path.join(repoRoot, '.ai-workflow', `conflict-${prNumber}`);
    await fsp.mkdir(outputDir, { recursive: true });

    const planJsonPath = path.join(outputDir, 'resolution-plan.json');
    const planMdPath = path.join(outputDir, 'resolution-plan.md');

    const resolver = new ConflictResolver(repoRoot);
    const plan = await resolver.createResolutionPlan(context, {
      agent: options.agent ?? 'auto',
      language: options.language === 'en' ? 'en' : 'ja',
      prNumber,
      baseBranch,
      headBranch,
      outputFilePath: planJsonPath,
    });

    await fsp.writeFile(planJsonPath, JSON.stringify(plan, null, 2), 'utf-8');
    await fsp.writeFile(planMdPath, buildResolutionPlanMarkdown(plan, planJsonPath), 'utf-8');

    await metadataManager.setResolutionPlan(planMdPath);
    await metadataManager.updateStatus('analyzed', {
      conflictFiles: conflictFiles,
      baseBranch,
      headBranch,
    });

    try {
      const workflowDir = path.relative(repoRoot, path.join(repoRoot, '.ai-workflow', `conflict-${prNumber}`));
      await repoGit.add(path.join(workflowDir, '*'));
      await repoGit.commit(`resolve-conflict: analyze completed for PR #${prNumber}`);
      logger.info(`Committed analyze artifacts for PR #${prNumber}`);
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit analyze artifacts: ${getErrorMessage(commitError)}`);
    }

    logger.info(`Analysis completed. Plan saved to: ${planMdPath}`);
  } catch (error) {
    logger.error(`Failed to analyze conflicts: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
