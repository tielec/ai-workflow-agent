import * as fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import { glob } from 'glob';
import { getErrorMessage } from '../utils/error-utils.js';

export interface Secret {
  name: string;
  value: string;
}

export interface MaskingResult {
  filesProcessed: number;
  secretsMasked: number;
  errors: string[];
}

/**
 * SecretMasker - Masks secrets in workflow files before Git commit
 *
 * This class prevents GitHub Secret Scanning from blocking pushes by
 * replacing secret values from environment variables with redacted placeholders.
 */
export class SecretMasker {
  private readonly targetFilePatterns = [
    'agent_log_raw.txt',
    'agent_log.md',
    'prompt.txt',
    'metadata.json', // Issue #54: Scan metadata.json for tokens
  ];

  private readonly envVarNames = [
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
  ];

  /**
   * Get list of secrets from environment variables
   */
  public getSecretList(): Secret[] {
    const secrets: Secret[] = [];

    for (const name of this.envVarNames) {
      const value = process.env[name];
      if (value && value.length > 10) {
        secrets.push({ name, value });
      }
    }

    return secrets;
  }

  /**
   * 任意のオブジェクトをマスキングしつつディープコピーする
   */
  public maskObject<T>(input: T, options?: { ignoredPaths?: string[] }): T {
    const replacementMap = new Map<string, string>();
    for (const secret of this.getSecretList()) {
      replacementMap.set(secret.value, `[REDACTED_${secret.name}]`);
    }

    const ignoredPatterns = (options?.ignoredPaths ?? []).map((pattern) => pattern.split('.'));
    const visited = new WeakMap<object, unknown>();

    const applyMasking = (value: string): string => {
      let masked = value;
      for (const [secretValue, replacement] of replacementMap) {
        if (secretValue) {
          masked = masked.split(secretValue).join(replacement);
        }
      }
      return this.maskString(masked);
    };

    const matchesPattern = (path: string[], pattern: string[]): boolean => {
      if (pattern.length > path.length) {
        return false;
      }
      for (let i = 0; i < pattern.length; i++) {
        const token = pattern[i];
        if (token === '*') {
          continue;
        }
        if (token !== path[i]) {
          return false;
        }
      }
      return true;
    };

    const isIgnoredPath = (path: string[]): boolean =>
      ignoredPatterns.some((pattern) => matchesPattern(path, pattern));

    const cloneAndMask = (value: unknown, path: string[]): unknown => {
      if (typeof value === 'string') {
        return applyMasking(value);
      }

      if (!value || typeof value !== 'object') {
        return value;
      }

      if (visited.has(value as object)) {
        return visited.get(value as object);
      }

      if (Array.isArray(value)) {
        const result: unknown[] = [];
        visited.set(value, result);
        value.forEach((item, index) => {
          const childPath = [...path, String(index)];
          result.push(isIgnoredPath(childPath) ? item : cloneAndMask(item, childPath));
        });
        return result;
      }

      if (!this.isPlainObject(value)) {
        return value;
      }

      const result: Record<string, unknown> = {};
      visited.set(value as object, result);

      for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
        const childPath = [...path, key];
        result[key] = isIgnoredPath(childPath) ? entryValue : cloneAndMask(entryValue, childPath);
      }

      return result;
    };

    return cloneAndMask(input as unknown, []) as T;
  }

  /**
   * Apply generic secret patterns to mask potential secrets in a string.
   * GitHub token patterns are applied before generic token masking to preserve specificity.
   */
  private maskString(value: string): string {
    let masked = value;

    // Preserve GitHub repository names (owner/repo pattern) and their parts from being masked
    // First, handle GitHub URLs specifically (e.g., github.com/owner/repo or github.com/owner/repo.git)
    const githubUrlPattern = /github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:\.git)?/g;
    const repoMatches: Map<string, string> = new Map();
    const repoPartMatches: Map<string, string> = new Map();
    let repoIndex = 0;
    let partIndex = 0;

    // Extract GitHub URLs and preserve repo parts
    masked = masked.replace(githubUrlPattern, (match, owner, repo) => {
      const placeholder = `__GITHUB_URL_${repoIndex++}__`;
      repoMatches.set(placeholder, match);

      // Preserve individual parts (owner and repo names)
      if (owner.length >= 20) {
        const ownerPlaceholder = `__REPO_PART_${partIndex++}__`;
        repoPartMatches.set(ownerPlaceholder, owner);
      }
      if (repo.length >= 20) {
        const repoPlaceholder = `__REPO_PART_${partIndex++}__`;
        repoPartMatches.set(repoPlaceholder, repo);
      }

      return placeholder;
    });

    // Then, handle standalone owner/repo patterns (not part of URLs)
    const standaloneRepoPattern = /\b([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\b/g;
    masked = masked.replace(standaloneRepoPattern, (match, owner, repo) => {
      const placeholder = `__REPO_PLACEHOLDER_${repoIndex++}__`;
      repoMatches.set(placeholder, match);

      // Preserve individual parts (owner and repo names)
      if (owner.length >= 20) {
        const ownerPlaceholder = `__REPO_PART_${partIndex++}__`;
        repoPartMatches.set(ownerPlaceholder, owner);
      }
      if (repo.length >= 20) {
        const repoPlaceholder = `__REPO_PART_${partIndex++}__`;
        repoPartMatches.set(repoPlaceholder, repo);
      }

      return placeholder;
    });

    // Replace individual repo parts with placeholders
    for (const [placeholder, part] of repoPartMatches) {
      masked = masked.split(part).join(placeholder);
    }

    // Prefer GitHub token patterns first so they don't fall back to generic tokens
    masked = masked.replace(/\b(?:ghp_[\w-]{20,}|github_pat_[\w-]{20,})\b/gi, '[REDACTED_GITHUB_TOKEN]');
    masked = masked.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
    // Exclude REDACTED placeholders, ghp_/github_pat_ prefixes, REPO_PLACEHOLDER/REPO_PART, and Git commit hashes (40-char hex) from generic token masking
    masked = masked.replace(/\b(?!ghp_)(?!github_pat_)(?!REDACTED)(?!__REPO_(?:PLACEHOLDER|PART)_)(?![a-f0-9]{40}\b)[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]');
    masked = masked.replace(/(Bearer\s+)[\w\-.]+/gi, '$1[REDACTED_TOKEN]');
    masked = masked.replace(/(token=)[\w\-.]+/gi, '$1[REDACTED_TOKEN]');

    // Restore preserved repository parts first
    for (const [placeholder, original] of repoPartMatches) {
      masked = masked.split(placeholder).join(original);
    }

    // Then restore preserved repository names
    for (const [placeholder, original] of repoMatches) {
      masked = masked.split(placeholder).join(original);
    }

    return masked;
  }

  /**
   * Mask secrets in all files within workflow directory
   *
   * @param workflowDir - Path to .ai-workflow/issue-{number}/ directory
   * @returns MaskingResult with statistics
   */
  public async maskSecretsInWorkflowDir(
    workflowDir: string,
  ): Promise<MaskingResult> {
    const secrets = this.getSecretList();

    if (secrets.length === 0) {
      logger.info('No secrets found in environment variables');
      return {
        filesProcessed: 0,
        secretsMasked: 0,
        errors: [],
      };
    }

    logger.info(`Found ${secrets.length} secret(s) in environment variables`);

    // Find all target files in workflow directory
    const files = await this.findTargetFiles(workflowDir);

    if (files.length === 0) {
      logger.info('No files found to scan for secrets');
      return {
        filesProcessed: 0,
        secretsMasked: 0,
        errors: [],
      };
    }

    logger.info(`Scanning ${files.length} file(s) for secrets`);

    let filesProcessed = 0;
    let totalSecretsMasked = 0;
    const errors: string[] = [];

    // Process each file
    for (const filePath of files) {
      try {
        const result = await this.maskSecretsInFile(filePath, secrets);
        if (result.masked) {
          filesProcessed++;
          totalSecretsMasked += result.count;
          logger.info(
            `Masked ${result.count} secret(s) in ${path.basename(filePath)}`,
          );
        }
      } catch (error) {
        const errorMsg = `Failed to process ${filePath}: ${getErrorMessage(error)}`;
        logger.error(`${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return {
      filesProcessed,
      secretsMasked: totalSecretsMasked,
      errors,
    };
  }

  /**
   * Find all target files in workflow directory
   */
  private async findTargetFiles(workflowDir: string): Promise<string[]> {
    const files: string[] = [];

    for (const pattern of this.targetFilePatterns) {
      const globPattern = path.join(workflowDir, '**', pattern);
      try {
        const matches = await glob(globPattern, {
          nodir: true,
          absolute: true,
          windowsPathsNoEscape: true,
        });
        files.push(...matches);
      } catch (error) {
        logger.warn(
          `Failed to glob pattern ${globPattern}: ${getErrorMessage(error)}`,
        );
      }
    }

    return files;
  }

  /**
   * Mask secrets in a single file
   */
  private async maskSecretsInFile(
    filePath: string,
    secrets: Secret[],
  ): Promise<{ masked: boolean; count: number }> {
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;
    let maskedCount = 0;

    for (const secret of secrets) {
      const replacement = `[REDACTED_${secret.name}]`;
      const occurrences = this.countOccurrences(content, secret.value);

      if (occurrences > 0) {
        content = this.replaceAll(content, secret.value, replacement);
        maskedCount += occurrences;
      }
    }

    content = this.maskString(content);

    const modified = content !== originalContent;
    if (modified) {
      await fs.writeFile(filePath, content, 'utf-8');
    }

    return { masked: modified, count: maskedCount };
  }

  /**
   * Count occurrences of a substring in a string
   */
  private countOccurrences(text: string, searchString: string): number {
    let count = 0;
    let position = 0;

    while (true) {
      const index = text.indexOf(searchString, position);
      if (index === -1) break;
      count++;
      position = index + searchString.length;
    }

    return count;
  }

  /**
   * Replace all occurrences of a substring
   */
  private replaceAll(text: string, search: string, replace: string): string {
    return text.split(search).join(replace);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
}
