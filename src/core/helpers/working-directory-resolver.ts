import fs from 'fs-extra';
import * as path from 'node:path';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import { findWorkflowMetadata } from '../repository-utils.js';
import type { WorkflowMetadata } from '../../types.js';
import { getErrorMessage } from '../../utils/error-utils.js';

/**
 * Issue #507: 作業ディレクトリを解決する（メタデータから target_repository.path を優先）
 *
 * フォールバック順序:
 * 1. メタデータの target_repository.path（最優先）
 * 2. REPOS_ROOT 環境変数 + リポジトリ名
 * 3. process.cwd()（最終手段）
 *
 * @param originalPath - 元の作業ディレクトリパス
 * @returns 解決された作業ディレクトリパス
 */
export async function resolveWorkingDirectory(originalPath: string): Promise<string> {
  try {
    // パスから Issue 番号を抽出（例: /path/to/.ai-workflow/issue-123/... → "123"）
    const issueMatch = originalPath.match(/\.ai-workflow[/\\]issue-(\d+)/);
    if (!issueMatch) {
      logger.warn(`Could not extract issue number from path: ${originalPath}`);
      return fallbackToProcessCwd(originalPath);
    }

    const issueNumber = issueMatch[1];
    logger.info(`Attempting to resolve working directory for Issue #${issueNumber}`);
    logger.debug(`[Resolver] Step 1: Checking metadata for Issue #${issueNumber}`);

    // 1. メタデータから target_repository.path を取得
    try {
      const { repoRoot, metadataPath } = await findWorkflowMetadata(issueNumber);
      logger.debug(`[Resolver] Metadata lookup repoRoot: ${repoRoot ?? 'undefined'}`);
      logger.info(`Found metadata at: ${metadataPath}`);

      const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
      const metadata: WorkflowMetadata = JSON.parse(metadataContent);

      if (metadata.target_repository?.path && fs.existsSync(metadata.target_repository.path)) {
        logger.info(`Using target_repository.path from metadata: ${metadata.target_repository.path}`);
        validateReposRootConsistency(metadata.target_repository.path, originalPath);
        return metadata.target_repository.path;
      }

      logger.warn(`target_repository.path not found or does not exist in metadata`);
    } catch (error) {
      logger.warn(`Failed to load metadata for Issue #${issueNumber}: ${getErrorMessage(error)}`);
    }

    // 2. REPOS_ROOT 環境変数を試行
    const reposRoot = config.getReposRoot();
    logger.debug(`[Resolver] Step 2: Checking REPOS_ROOT: ${reposRoot ?? 'undefined'}`);
    if (reposRoot) {
      // 元のパスからリポジトリ名を推測
      const repoNameMatch = originalPath.match(/([^/\\]+)[/\\]\.ai-workflow/);
      if (repoNameMatch) {
        const repoName = repoNameMatch[1];
        const fallbackPath = path.join(reposRoot, repoName);

        if (fs.existsSync(fallbackPath)) {
          logger.info(`Using REPOS_ROOT fallback: ${fallbackPath}`);
          validateReposRootConsistency(fallbackPath, originalPath);
          return fallbackPath;
        }

        logger.warn(`REPOS_ROOT fallback path does not exist: ${fallbackPath}`);
      }
    }

    // 3. 最終手段: process.cwd()
    logger.debug('[Resolver] Step 3: Falling back to process.cwd()');
    return fallbackToProcessCwd(originalPath);
  } catch (error) {
    logger.error(`Unexpected error in resolveWorkingDirectory: ${getErrorMessage(error)}`);
    return fallbackToProcessCwd(originalPath);
  }
}

/**
 * process.cwd() にフォールバック（最終手段）
 */
function fallbackToProcessCwd(originalPath: string): string {
  const cwd = process.cwd();
  logger.warn(`Falling back to process.cwd(): ${cwd}`);
  logger.warn(
    `Original path was: ${originalPath}. ` +
      'This may cause file path mismatches in multi-repository environments. ' +
      'Ensure REPOS_ROOT is set correctly or run init command first.',
  );
  return cwd;
}

/**
 * REPOS_ROOT と解決結果の整合性を検証し、ずれがあれば警告を出力する
 */
function validateReposRootConsistency(resolvedPath: string, originalPath: string): void {
  const reposRoot = config.getReposRoot();
  if (!reposRoot) {
    return;
  }

  if (!resolvedPath.startsWith(reposRoot)) {
    logger.warn(
      `[Issue #592 Warning] Resolved path (${resolvedPath}) is outside REPOS_ROOT (${reposRoot}). ` +
        `Original path: ${originalPath}. ` +
        'This may indicate a path masking issue.',
    );
  }
}
