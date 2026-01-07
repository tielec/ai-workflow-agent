import fs from 'fs-extra';
import * as path from 'node:path';
import { logger } from '../../utils/logger.js';
import { config } from '../config.js';
import { findWorkflowMetadata } from '../repository-utils.js';
import type { WorkflowMetadata } from '../../types.js';
import { getErrorMessage } from '../../utils/error-utils.js';

const MASKED_PATH_PATTERN = /\[REDACTED[^\]]*]/;

/**
 * Issue #507: 作業ディレクトリを解決する（メタデータから target_repository.path を優先）
 *
 * フォールバック順序:
 * 1. メタデータの target_repository.path（最優先）
 * 2. REPOS_ROOT 環境変数 + リポジトリ名
 * 解決できない場合は明示的にエラーを返し、process.cwd() へのフォールバックは行わない
 *
 * @param originalPath - 元の作業ディレクトリパス
 * @returns 解決された作業ディレクトリパス
 */
export async function resolveWorkingDirectory(originalPath: string): Promise<string> {
  const normalizedOriginal = path.resolve(originalPath);
  logger.debug(`[Resolver] Input path: ${normalizedOriginal}`);
  ensurePathIsNotMasked(normalizedOriginal);

  try {
    // パスから Issue 番号を抽出（例: /path/to/.ai-workflow/issue-123/... → "123"）
    const issueMatch = normalizedOriginal.match(/\.ai-workflow[/\\]issue-(\d+)/);
    if (!issueMatch) {
      throw new Error(
        `[Issue #603] Could not extract issue number from path: ${normalizedOriginal}. ` +
          'Ensure the path contains .ai-workflow/issue-<num> before invoking the agent.',
      );
    }

    const issueNumber = issueMatch[1];
    logger.info(`[Issue #603] Attempting to resolve working directory for Issue #${issueNumber}`);
    logger.debug(`[Resolver] Resolution priority: 1) metadata.target_repository.path, 2) REPOS_ROOT + repo name. process.cwd() fallback is DISABLED.`);
    logger.debug(`[Resolver] Step 1: Checking metadata for Issue #${issueNumber}`);

    // 1. メタデータから target_repository.path を取得
    try {
      const { repoRoot, metadataPath } = await findWorkflowMetadata(issueNumber);
      logger.debug(`[Resolver] Metadata lookup repoRoot: ${repoRoot ?? 'undefined'}`);
      logger.info(`Found metadata at: ${metadataPath}`);

      const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
      const metadata: WorkflowMetadata = JSON.parse(metadataContent);

      if (metadata.target_repository?.path) {
        logger.debug(`[Resolver] Found metadata.target_repository.path: ${metadata.target_repository.path}`);
        const candidate = validateWorkingDirectoryPath(
          metadata.target_repository.path,
          normalizedOriginal,
        );
        logger.info(`[Issue #603] Using target_repository.path from metadata: ${candidate}`);
        validateReposRootConsistency(candidate, normalizedOriginal);
        return candidate;
      }

      logger.warn('[Issue #603] target_repository.path not found or does not exist in metadata');
    } catch (error) {
      logger.warn(`Failed to load metadata for Issue #${issueNumber}: ${getErrorMessage(error)}`);
    }

    // 2. REPOS_ROOT 環境変数を試行
    const reposRoot = config.getReposRoot();
    logger.debug(`[Resolver] Step 2: Checking REPOS_ROOT: ${reposRoot ?? '(not set)'}`);
    if (reposRoot) {
      // 元のパスからリポジトリ名を推測
      const repoNameMatch = normalizedOriginal.match(/([^/\\]+)[/\\]\.ai-workflow/);
      if (repoNameMatch) {
        const repoName = repoNameMatch[1];
        logger.debug(`[Resolver] Extracted repository name from path: ${repoName}`);
        const fallbackPath = validateWorkingDirectoryPath(
          path.join(reposRoot, repoName),
          normalizedOriginal,
        );

        logger.info(`[Issue #603] Using REPOS_ROOT fallback: ${fallbackPath}`);
        validateReposRootConsistency(fallbackPath, normalizedOriginal);
        return fallbackPath;
      }
      logger.debug(`[Resolver] Could not extract repository name from path for REPOS_ROOT fallback`);
    }

    throw new Error(
      [
        '[Issue #603] Unable to resolve working directory.',
        `Original path: ${normalizedOriginal}`,
        `REPOS_ROOT: ${reposRoot ?? 'not set'}`,
        'Set metadata.target_repository.path to an existing repository path or configure REPOS_ROOT.',
      ].join(' '),
    );
  } catch (error) {
    logger.error(`Unexpected error in resolveWorkingDirectory: ${getErrorMessage(error)}`);
    throw error;
  }
}

export function validateWorkingDirectoryPath(resolvedPath: string, originalPath?: string): string {
  const normalized = path.resolve(resolvedPath);
  logger.debug(`[Resolver] Validating working directory: ${normalized}`);
  ensurePathIsNotMasked(normalized);

  if (!fs.existsSync(normalized)) {
    const errorParts = [
      '[Issue #603] Working directory does not exist.',
      `Expected: ${normalized}`,
      originalPath ? `Original: ${originalPath}` : '',
      'Ensure the target repository is cloned and the path is correct.',
      'This error prevents fallback to process.cwd() which would cause misplaced artifacts.',
    ];
    const errorMessage = errorParts.filter(Boolean).join(' ');
    logger.error(`[Resolver] Validation failed: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  logger.debug(`[Resolver] Working directory validated successfully: ${normalized}`);
  return normalized;
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

function ensurePathIsNotMasked(pathToCheck: string): void {
  if (MASKED_PATH_PATTERN.test(pathToCheck)) {
    const errorMessage =
      `[Issue #603] Working directory appears to be masked: ${pathToCheck}. ` +
      'This indicates SecretMasker replaced part of the path with [REDACTED_*]. ' +
      'Check SecretMasker configuration to ensure path protection is working correctly.';
    logger.error(`[Resolver] ${errorMessage}`);
    throw new Error(errorMessage);
  }
}
