/**
 * Migration Command (Issue #58, Task 3)
 *
 * Migrate workflow metadata to sanitize embedded Personal Access Tokens
 * in Git remote URLs.
 *
 * Usage:
 *   ai-workflow migrate --sanitize-tokens [--dry-run] [--issue <number>] [--repo <path>]
 */

import fs from 'fs-extra';
import path from 'node:path';
import { glob } from 'glob';
import { logger } from '../utils/logger.js';
import { sanitizeGitUrl } from '../utils/git-url-utils.js';
import type { MigrateOptions } from '../types/commands.js';

/**
 * Migration result summary
 */
export interface MigrationResult {
  processedCount: number;
  detectedCount: number;
  sanitizedCount: number;
  errorCount: number;
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

/**
 * Metadata file information
 */
interface MetadataFile {
  filePath: string;
  content: any;
  hasToken: boolean;
  originalUrl?: string;
  sanitizedUrl?: string;
}

/**
 * Handle migrate command
 */
export async function handleMigrateCommand(
  options: MigrateOptions
): Promise<void> {
  try {
    logger.info('Starting migration command...');

    if (options.sanitizeTokens) {
      const result = await sanitizeTokensInMetadata(options);
      printMigrationSummary(result, options.dryRun);
    } else {
      logger.error('No migration option specified. Use --sanitize-tokens.');
      process.exit(1);
    }

    logger.info('Migration completed successfully.');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Find all metadata files
 */
async function findAllMetadataFiles(
  options: MigrateOptions
): Promise<string[]> {
  const repoPath = options.repo || process.cwd();

  let pattern: string;
  if (options.issue) {
    pattern = `.ai-workflow/issue-${options.issue}/metadata.json`;
  } else {
    pattern = '.ai-workflow/issue-*/metadata.json';
  }

  const files = await glob(pattern, { cwd: repoPath, absolute: true });
  logger.info(`Found ${files.length} metadata files`);

  // Path traversal attack prevention: Validate paths with regex
  const safePathPattern = /\.ai-workflow[/\\]issue-\d+[/\\]metadata\.json$/;
  const validFiles = files.filter((file) => safePathPattern.test(file));

  if (validFiles.length !== files.length) {
    logger.warn(
      `Filtered out ${files.length - validFiles.length} invalid paths`
    );
  }

  return validFiles;
}

/**
 * Load metadata file and detect tokens
 */
async function loadMetadataFile(
  filePath: string
): Promise<MetadataFile | null> {
  try {
    // Symlink attack prevention
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
      logger.warn(`Skipping symbolic link: ${filePath}`);
      return null;
    }

    const content = await fs.readJSON(filePath);
    const remoteUrl = content?.target_repository?.remote_url;

    if (!remoteUrl) {
      logger.debug(`No remote_url found in ${filePath}`);
      return { filePath, content, hasToken: false };
    }

    // Detect HTTPS URLs with tokens
    const tokenPattern = /^https?:\/\/.+@.+$/;
    const hasToken = tokenPattern.test(remoteUrl);

    if (hasToken) {
      const sanitizedUrl = sanitizeGitUrl(remoteUrl);
      return {
        filePath,
        content,
        hasToken: true,
        originalUrl: remoteUrl,
        sanitizedUrl,
      };
    }

    return { filePath, content, hasToken: false };
  } catch (error) {
    logger.error(`Failed to load metadata file ${filePath}:`, error);
    return null;
  }
}

/**
 * Sanitize a metadata file
 */
async function sanitizeMetadataFile(
  metadata: MetadataFile,
  dryRun: boolean
): Promise<boolean> {
  if (!metadata.hasToken || !metadata.sanitizedUrl) {
    return false;
  }

  logger.info(`Token detected in ${metadata.filePath}`);
  logger.info(`  Original URL: ***`); // Mask token for security
  logger.info(`  Sanitized URL: ${metadata.sanitizedUrl}`);

  if (dryRun) {
    logger.info('  [DRY RUN] Skipping file write');
    return true;
  }

  try {
    // Create backup
    const backupPath = `${metadata.filePath}.bak`;
    await fs.copy(metadata.filePath, backupPath);
    logger.debug(`Backup created: ${backupPath}`);

    // Update metadata
    metadata.content.target_repository.remote_url = metadata.sanitizedUrl;

    // Save file
    await fs.writeJSON(metadata.filePath, metadata.content, { spaces: 2 });
    logger.info(`  Sanitized and saved: ${metadata.filePath}`);

    return true;
  } catch (error) {
    logger.error(`Failed to sanitize ${metadata.filePath}:`, error);
    return false;
  }
}

/**
 * Sanitize tokens in all metadata files
 */
async function sanitizeTokensInMetadata(
  options: MigrateOptions
): Promise<MigrationResult> {
  const result: MigrationResult = {
    processedCount: 0,
    detectedCount: 0,
    sanitizedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const files = await findAllMetadataFiles(options);

  for (const filePath of files) {
    result.processedCount++;

    const metadata = await loadMetadataFile(filePath);
    if (!metadata) {
      result.errorCount++;
      result.errors.push({
        filePath,
        error: 'Failed to load metadata file',
      });
      continue;
    }

    if (metadata.hasToken) {
      result.detectedCount++;

      const success = await sanitizeMetadataFile(metadata, options.dryRun);
      if (success) {
        result.sanitizedCount++;
      } else {
        result.errorCount++;
        result.errors.push({
          filePath,
          error: 'Failed to sanitize metadata file',
        });
      }
    }
  }

  return result;
}

/**
 * Print migration summary
 */
function printMigrationSummary(
  result: MigrationResult,
  dryRun: boolean
): void {
  logger.info('');
  logger.info('=== Migration Summary ===');

  if (dryRun) {
    logger.info('[DRY RUN MODE]');
  }

  logger.info(`Processed: ${result.processedCount} files`);
  logger.info(`Detected: ${result.detectedCount} files with tokens`);
  logger.info(`Sanitized: ${result.sanitizedCount} files`);
  logger.info(`Errors: ${result.errorCount} files`);

  if (result.errors.length > 0) {
    logger.info('');
    logger.info('Errors:');
    for (const error of result.errors) {
      logger.error(`  ${error.filePath}: ${error.error}`);
    }
  }
}
