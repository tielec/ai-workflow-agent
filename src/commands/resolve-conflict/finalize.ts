import { promises as fsp } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { ensureGitConfig } from '../../core/git/git-config-helper.js';
import { GitHubClient } from '../../core/github-client.js';
import { ConflictMetadataManager } from '../../core/conflict/metadata-manager.js';
import { parsePullRequestUrl, resolveRepoPathFromPrUrl } from '../../core/repository-utils.js';
import type { ResolveConflictFinalizeOptions } from '../../types/commands.js';
import type { ConflictResolution, ResolutionStrategy } from '../../types/conflict.js';

/**
 * ResolutionStrategy の日本語表示名マッピング。
 * 新しい ResolutionStrategy 値が追加された場合、ここにエントリを追加する。
 */
const strategyLabels: Record<ResolutionStrategy, string> = {
  ours: 'ソースブランチの内容を採用',
  theirs: 'ターゲットブランチの内容を採用',
  both: '両方の内容を結合',
  'manual-merge': 'AIによる自動解消',
};

/**
 * PRコメント本文を生成する。
 *
 * resultSummary が ConflictResolution[] の JSON 文字列の場合は
 * Markdown テーブル形式のレポートに変換する。
 * JSON パースに失敗した場合は従来通り生テキストを表示する（フォールバック）。
 *
 * @param resultSummary - resolution-result.json の内容（文字列）または null
 * @returns Markdown 形式のコメント本文
 */
function buildCommentBody(resultSummary: string | null): string {
  const lines = ['## ✅ マージコンフリクト解消レポート', ''];

  if (!resultSummary) {
    lines.push('解消結果の詳細はローカルのレポートをご確認ください。');
  } else {
    try {
      const resolutions: ConflictResolution[] = JSON.parse(resultSummary);

      if (resolutions.length === 0) {
        lines.push('コンフリクトファイルはありませんでした。');
      } else {
        lines.push('### 解消結果サマリー', '');
        lines.push('| ファイル | 解消方法 | 備考 |');
        lines.push('|---------|---------|------|');
        for (const resolution of resolutions) {
          const label = strategyLabels[resolution.strategy] ?? resolution.strategy;
          lines.push(`| ${resolution.filePath} | ${label} | ${resolution.notes ?? '-'} |`);
        }

        lines.push('', '### 統計');
        lines.push(`- 解消ファイル数: ${resolutions.length}`);
        const counts: Record<string, number> = {};
        for (const resolution of resolutions) {
          const label = strategyLabels[resolution.strategy] ?? resolution.strategy;
          counts[label] = (counts[label] ?? 0) + 1;
        }
        const breakdown = Object.entries(counts)
          .map(([label, count]) => `${label}: ${count}`)
          .join(', ');
        lines.push(`- 解消方法内訳: ${breakdown}`);
      }
    } catch {
      lines.push(resultSummary);
    }
  }

  lines.push('', '---', '*AI Workflow resolve-conflict*');

  return lines.join('\n');
}

export async function handleResolveConflictFinalizeCommand(options: ResolveConflictFinalizeOptions): Promise<void> {
  try {
    const prInfo = parsePullRequestUrl(options.prUrl);
    const repoRoot = resolveRepoPathFromPrUrl(options.prUrl);
    const metadataManager = new ConflictMetadataManager(repoRoot, prInfo.prNumber);

    if (!(await metadataManager.exists())) {
      logger.error("Metadata not found. Run 'resolve-conflict init' first.");
      process.exit(1);
    }

    const metadata = await metadataManager.getMetadata();

    if (options.squash) {
      logger.info('Squash option requested. No additional squash action required for single-resolution commit.');
    }

    // Step 1: Read summary before cleanup deletes the file
    let summary: string | null = null;
    if (metadata.resolutionResultPath) {
      try {
        summary = await fsp.readFile(metadata.resolutionResultPath, 'utf-8');
      } catch (error) {
        logger.warn(`Failed to load resolution result: ${getErrorMessage(error)}`);
      }
    }

    // Step 2: Cleanup artifacts, commit, and push
    const git = simpleGit(repoRoot);
    await ensureGitConfig(git);

    const workflowPath = `.ai-workflow/conflict-${prInfo.prNumber}`;
    await metadataManager.cleanup();

    try {
      await git.raw(['add', '--all', workflowPath]);
      const status = await git.status();
      const stagedFiles = status.files.filter((f) => f.path.startsWith(workflowPath));
      if (stagedFiles.length > 0) {
        await git.commit(`resolve-conflict: cleanup artifacts for PR #${prInfo.prNumber}`);
        logger.info(`Committed cleanup of ${stagedFiles.length} artifact file(s).`);
      } else {
        logger.info('No artifact files to clean up.');
      }
    } catch (commitError: unknown) {
      logger.warn(`Failed to commit artifact cleanup: ${getErrorMessage(commitError)}`);
    }

    // Step 3: Push (includes both merge commit and cleanup commit)
    if (options.push) {
      const branchStatus = await git.status();
      const branchName = branchStatus.current ?? metadata.headBranch;
      if (!branchName) {
        throw new Error('Unable to determine branch name for push.');
      }
      await git.push('origin', branchName);
      logger.info(`Pushed resolved changes to origin/${branchName}`);
    }

    // Step 4: Post PR comment
    const githubClient = new GitHubClient(undefined, prInfo.repositoryName);
    await githubClient.postComment(prInfo.prNumber, buildCommentBody(summary));

    logger.info('Finalize completed. Metadata cleaned up.');
  } catch (error) {
    logger.error(`Failed to finalize resolve-conflict: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}
