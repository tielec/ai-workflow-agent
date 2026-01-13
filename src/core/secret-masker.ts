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
 * SecretMasker - Comprehensive secret masking for workflow files and data structures
 *
 * This class prevents GitHub Secret Scanning from blocking pushes by:
 * - Replacing secret values from environment variables with redacted placeholders
 * - Applying generic pattern-based masking for potential secrets and tokens
 * - Preserving specific content like GitHub URLs and object keys using selective masking
 *
 * ## Masking Targets (What gets masked):
 * - Environment variable values (GITHUB_TOKEN, OPENAI_API_KEY, etc.)
 * - GitHub tokens (ghp_*, github_pat_* patterns)
 * - Email addresses
 * - Generic long token patterns (20+ character alphanumeric strings)
 * - Bearer tokens and token= parameters
 *
 * ## Masking Non-Targets (What is preserved):
 * - GitHub URLs (github.com/owner/repo format) - URLs are preserved while only masking long parts
 * - Object keys/property names (e.g., "implementation_strategy", "design_decisions")
 * - Short strings (< 20 characters) to avoid over-masking
 * - Content in ignored paths when using ignoredPaths parameter
 * - Placeholder tokens used internally (__GITHUB_URL_*, __REPO_PART_*, etc.)
 *
 * ## ignoredPaths Parameter Usage:
 * The ignoredPaths parameter in maskObject() allows selective preservation of specific object paths:
 * - Format: Array of dot-notation paths (e.g., ["issue_url", "pr_url", "design_decisions.*"])
 * - Supports wildcards with "*" for matching any property at that level
 * - Example: ignoredPaths: ["issue_url", "pr_url"] preserves issue_url and pr_url values
 * - Use case: Preserving GitHub URLs, design decisions, and other non-sensitive structured data
 *
 * @example
 * ```typescript
 * const masker = new SecretMasker();
 *
 * // Mask object while preserving specific paths
 * const masked = masker.maskObject(data, {
 *   ignoredPaths: ["issue_url", "pr_url", "design_decisions.*"]
 * });
 *
 * // Simple string masking
 * const maskedString = masker.maskString("Contains secret: ghp_abcd1234...");
 * ```
 */
export class SecretMasker {
  private readonly targetFilePatterns = [
    'agent_log_raw.txt',
    'agent_log.md',
    'prompt.txt',
    'metadata.json', // Issue #54: Scan metadata.json for tokens
  ];

  // Issue #622: Preserve repository info inside metadata.json
  private static readonly METADATA_IGNORED_PATHS = [
    'target_repository.owner',
    'target_repository.repo',
    'target_repository.remote_url',
    'target_repository.github_full_name',
    'target_repository.local_path',
    'issue_url',
    'pr_url',
  ];

  private readonly envVarNames = [
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'API_KEY',
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
   * Applies comprehensive masking to any object while performing deep copy
   *
   * This method recursively processes all object properties, applying secret masking
   * while preserving object structure and respecting ignored paths.
   *
   * @param input - The input object to mask (any type)
   * @param options - Masking options
   * @param options.ignoredPaths - Array of dot-notation paths to preserve from masking
   *   - Format: ["path.to.property", "another.path.*"]
   *   - Wildcards: Use "*" to match any property at that level
   *   - Example: ["issue_url", "pr_url", "design_decisions.*"] preserves issue_url,
   *     pr_url values and all properties under design_decisions
   * @returns Deep copy of input with secrets masked, except for ignored paths
   *
   * @example
   * ```typescript
   * const data = {
   *   issue_url: "https://github.com/owner/repo/issues/123",
   *   token: "ghp_secrettoken123",
   *   design_decisions: { strategy: "refactor", approach: "gradual" }
   * };
   *
   * const masked = masker.maskObject(data, {
   *   ignoredPaths: ["issue_url", "design_decisions.*"]
   * });
   * // Result: issue_url and design_decisions are preserved, token is masked
   * ```
   */
  public maskObject<T>(input: T, options?: { ignoredPaths?: string[] }): T {
    const replacementMap = new Map<string, string>();
    for (const secret of this.getSecretList()) {
      replacementMap.set(secret.value, `[REDACTED_${secret.name}]`);
    }

    const ignoredPatterns = (options?.ignoredPaths ?? []).map((pattern) => pattern.split('.'));
    const visited = new WeakMap<object, unknown>();

    /**
     * Core masking function that applies two-step masking process to protect repository paths
     *
     * ## Issue #595 Fix - Critical Processing Order:
     * The processing order is crucial to prevent environment variable values containing
     * path substrings from corrupting repository paths. This function ensures path
     * protection occurs BEFORE environment variable replacement.
     *
     * ## Processing Steps:
     * 1. **Step 1 - Pattern/Path Protection**: Call `maskString()` to protect Unix paths,
     *    GitHub URLs, and apply pattern-based masking. This creates placeholders for
     *    long path components (20+ chars) to prevent substring matches.
     *
     * 2. **Step 2 - Environment Variable Replacement**: Replace environment variable
     *    values with redaction placeholders. Safe to execute after Step 1 because
     *    legitimate paths are now protected.
     *
     * ## Example of Issue #595:
     * Without proper order:
     * - Path: "/repos/sd-platform-development"
     * - GITHUB_TOKEN contains "development"
     * - Result: "/repos/sd-platform-[REDACTED_GITHUB_TOKEN]" (CORRUPTED)
     *
     * With correct order (this fix):
     * - Step 1 protects path components → "/repos/__PATH_COMPONENT_0__"
     * - Step 2 replaces env vars safely
     * - Result: "/repos/sd-platform-development" (PRESERVED)
     *
     * @param value - The string value to apply comprehensive masking to
     * @returns String with secrets properly masked while preserving legitimate paths
     */
    let loggedMaskingOrder = false;
    let processedCount = 0;

    const applyMasking = (value: string): string => {
      processedCount++;
      if (!loggedMaskingOrder) {
        logger.debug(
          '[Issue #603] SecretMasker: applying path protection before env substitution. ' +
          `Processing order: 1) path/URL protection via maskString(), 2) env var replacement (${replacementMap.size} secrets).`
        );
        loggedMaskingOrder = true;
      }
      // Issue #595: Path protection must execute FIRST
      // This ensures Unix path components are protected with placeholders
      // before environment variable replacement occurs.
      // Without this order, env var values containing path substrings
      // (e.g., "development" in GITHUB_TOKEN) would corrupt paths like
      // "/repos/sd-platform-development" → "/repos/sd-platform-[REDACTED_GITHUB_TOKEN]"

      // Step 1: Apply path protection and pattern masking via maskString()
      // This protects long path components (20+ chars) from being matched
      // by env var substrings
      let masked = this.maskString(value);

      // Step 2: Apply environment variable replacement
      // Now safe because paths have been processed and protected
      for (const [secretValue, replacement] of replacementMap) {
        if (secretValue) {
          masked = masked.split(secretValue).join(replacement);
        }
      }

      return masked;
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
   * Applies generic secret patterns to mask potential secrets in a string
   *
   * This method performs sophisticated string masking while preserving important content:
   * 1. Temporarily protects GitHub URLs using placeholders
   * 2. Masks known secret patterns (GitHub tokens, emails, generic tokens)
   * 3. Restores protected content after masking
   *
   * ## Masking Order and Logic:
   * 1. **Path Protection**: Unix path components (20+ chars) are temporarily replaced to avoid over-masking
   * 2. **URL Protection**: GitHub URLs are temporarily replaced with placeholders
   * 3. **Repository Protection**: Standalone owner/repo patterns are protected
   * 4. **Secret Masking**: Applies patterns for tokens, emails, and generic secrets
   * 5. **Restoration**: Protected content is restored to preserve legitimate URLs and paths
   *
   * ## Pattern Details:
   * - **GitHub Tokens**: `ghp_*`, `github_pat_*` patterns → `[REDACTED_GITHUB_TOKEN]`
   * - **Email Addresses**: Standard email format → `[REDACTED_EMAIL]`
   * - **Generic Tokens**: 20+ char alphanumeric (with exclusions) → `[REDACTED_TOKEN]`
   * - **Bearer Tokens**: `Bearer <token>` format → `Bearer [REDACTED_TOKEN]`
   * - **URL Tokens**: `token=<value>` format → `token=[REDACTED_TOKEN]`
   *
   * ## Exclusions to Prevent Over-masking:
   * - GitHub URL placeholders (`__GITHUB_URL_*__`)
   * - Repository placeholders (`__REPO_PLACEHOLDER_*__`, `__REPO_PART_*__`)
   * - Object key patterns (`property_name:` format)
   * - Short strings (< 20 characters)
   * - Already redacted content (`REDACTED`)
   *
   * ## Processing Order (Issue #595):
   * This method is called by `applyMasking()` as the FIRST step in the masking process
   * to protect repository paths before environment variable replacement. This prevents
   * corruption when env var values contain path substrings.
   *
   * @param value - The string to apply masking to
   * @returns String with secrets masked but important content preserved
   * @see {@link applyMasking} for the complete masking process flow
   *
   * @example
   * ```typescript
   * const input = "Visit https://github.com/owner/repo with token ghp_secret123";
   * const masked = masker.maskString(input);
   * // Result: "Visit https://github.com/owner/repo with token [REDACTED_GITHUB_TOKEN]"
   * ```
   */
  private maskString(value: string): string {
    let masked = value;

    // Issue #592/#603: Protect long path components from generic token masking
    // Support both Unix (/) and Windows (\) path separators
    const pathComponentMap = new Map<string, string>();
    let pathComponentIndex = 0;

    // Unix path pattern
    // Match path components followed by /, end of string, or non-path characters (quotes, etc.)
    const unixPathPattern = /\/([a-zA-Z0-9_.-]{20,})(?=\/|$|[^a-zA-Z0-9_.\/-])/g;
    masked = masked.replace(unixPathPattern, (match) => {
      const placeholder = `__PATH_COMPONENT_${pathComponentIndex++}__`;
      // スラッシュを残したままプレースホルダー化し、owner/repo の区切りを維持する
      const placeholderWithSlash = `/${placeholder}`;
      pathComponentMap.set(placeholderWithSlash, match);
      return placeholderWithSlash;
    });

    // Windows path pattern (Issue #603: Windows path support)
    // Match path components followed by \, end of string, or non-path characters (quotes, etc.)
    const windowsPathPattern = /\\([a-zA-Z0-9_.-]{20,})(?=\\|$|[^a-zA-Z0-9_.\\-])/g;
    masked = masked.replace(windowsPathPattern, (match) => {
      const placeholder = `__PATH_COMPONENT_${pathComponentIndex++}__`;
      // バックスラッシュを残したままプレースホルダー化
      const placeholderWithBackslash = `\\${placeholder}`;
      pathComponentMap.set(placeholderWithBackslash, match);
      return placeholderWithBackslash;
    });

    const urlMap = new Map<string, string>();
    const partMap = new Map<string, string>();
    let urlIndex = 0;
    let partIndex = 0;

    const maskLongPart = (segment: string): string => {
      if (segment.length < 20) {
        return segment;
      }
      const placeholder = `__REPO_PART_${partIndex++}__`;
      partMap.set(placeholder, segment);
      return placeholder;
    };

    // Match GitHub URLs with optional paths (issues, pull, etc.)
    const githubUrlPattern = /github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:\.git|\/(?:issues|pull)\/\d+)?/g;
    masked = masked.replace(githubUrlPattern, (match, owner, repo) => {
      const placeholder = `__GITHUB_URL_${urlIndex++}__`;
      let preservedMatch = match;
      preservedMatch = preservedMatch.replace(owner, maskLongPart(owner));
      preservedMatch = preservedMatch.replace(repo, maskLongPart(repo));
      urlMap.set(placeholder, preservedMatch);
      return placeholder;
    });

    const standaloneRepoPattern = /\b([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\b/g;
    masked = masked.replace(standaloneRepoPattern, (match, owner, repo) => {
      const placeholder = `__REPO_PLACEHOLDER_${urlIndex++}__`;
      let preservedMatch = match;
      preservedMatch = preservedMatch.replace(owner, maskLongPart(owner));
      preservedMatch = preservedMatch.replace(repo, maskLongPart(repo));
      urlMap.set(placeholder, preservedMatch);
      return placeholder;
    });

    // Issue #558: Protect JSON key names (e.g., "key": or key:) from being masked
    const keyMap = new Map<string, string>();
    let keyIndex = 0;
    // Match: word characters (20+ chars) followed by colon (with optional quotes and spaces)
    const jsonKeyPattern = /\b([a-zA-Z0-9_-]{20,})\s*:/g;
    masked = masked.replace(jsonKeyPattern, (match, key) => {
      const placeholder = `__JSON_KEY_${keyIndex++}__`;
      keyMap.set(placeholder, match);
      return placeholder;
    });

    masked = masked.replace(/\b(?:ghp_[\w-]{20,}|github_pat_[\w-]{20,})\b/gi, '[REDACTED_GITHUB_TOKEN]');
    masked = masked.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
    // Exclude REDACTED placeholders, ghp_/github_pat_ prefixes, REPO_PLACEHOLDER/REPO_PART/JSON_KEY, and Git commit hashes (40-char hex) from generic token masking
    masked = masked.replace(
      /\b(?!ghp_)(?!github_pat_)(?!REDACTED)(?!__(?:REPO_(?:PLACEHOLDER|PART)|JSON_KEY|PATH_COMPONENT)_)(?![a-f0-9]{40}\b)[A-Za-z0-9_-]{20,}\b/g,
      '[REDACTED_TOKEN]',
    );
    masked = masked.replace(/(Bearer\s+)[\w\-.]+/gi, '$1[REDACTED_TOKEN]');
    masked = masked.replace(/(token=)[\w\-.]+/gi, '$1[REDACTED_TOKEN]');

    // Restore JSON key names first (before repository restoration)
    for (const [placeholder, original] of keyMap) {
      masked = masked.split(placeholder).join(original);
    }

    for (const [placeholder, original] of urlMap) {
      masked = masked.split(placeholder).join(original);
    }

    for (const [placeholder, original] of partMap) {
      masked = masked.split(placeholder).join(original);
    }

    for (const [placeholder, original] of pathComponentMap) {
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
        if (path.basename(filePath) === 'metadata.json') {
          const result = await this.maskMetadataFile(filePath);
          filesProcessed += result.filesProcessed;
          totalSecretsMasked += result.secretsMasked;
          errors.push(...result.errors);

          if (result.errors.length === 0) {
            logger.info(
              `[Issue #622] Processed metadata.json with repository info preserved (masked ${result.secretsMasked} secret(s))`,
            );
          }
          continue;
        }

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
   * Mask secrets in metadata.json while preserving repository information
   *
   * Issue #622: Prevent target_repository.repo from being masked as a generic token.
   * Uses maskObject() with ignoredPaths to selectively preserve public repository fields.
   */
  public async maskMetadataFile(metadataPath: string): Promise<MaskingResult> {
    const errors: string[] = [];

    try {
      const originalContent = await fs.readFile(metadataPath, 'utf-8');
      let parsedContent: unknown;

      try {
        parsedContent = JSON.parse(originalContent);
      } catch (error) {
        const errorMsg = `Failed to parse metadata.json at ${metadataPath}: ${getErrorMessage(error)}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
        return {
          filesProcessed: 0,
          secretsMasked: 0,
          errors,
        };
      }

      const maskedObject = this.maskObject(parsedContent, {
        ignoredPaths: SecretMasker.METADATA_IGNORED_PATHS,
      });
      const maskedContent = JSON.stringify(maskedObject, null, 2);
      const secretsMasked = this.countMaskedSecretsInContent(
        originalContent,
        maskedContent,
      );

      if (maskedContent !== originalContent) {
        await fs.writeFile(metadataPath, maskedContent, 'utf-8');
        return {
          filesProcessed: 1,
          secretsMasked,
          errors,
        };
      }

      return {
        filesProcessed: 0,
        secretsMasked,
        errors,
      };
    } catch (error) {
      const errorMsg = `Failed to process metadata.json at ${metadataPath}: ${getErrorMessage(error)}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      return {
        filesProcessed: 0,
        secretsMasked: 0,
        errors,
      };
    }
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
   *
   * Issue #603: Fixed processing order to match Issue #595 fix in maskObject().
   * CRITICAL: Path protection (maskString) must execute BEFORE environment variable replacement
   * to prevent corruption of repository paths when env var values contain path substrings.
   *
   * Processing order:
   * 1. Count environment variable occurrences in original content (for accurate statistics)
   * 2. Replace known pattern tokens (GitHub, email) with their specific [REDACTED_*] tokens
   * 3. Protect remaining environment variable values with temporary placeholders
   * 4. Apply path protection and pattern masking via maskString() (protects long path components)
   * 5. Replace placeholders with [REDACTED_*] tokens (preserves env var names)
   */
  private async maskSecretsInFile(
    filePath: string,
    secrets: Secret[],
  ): Promise<{ masked: boolean; count: number }> {
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;
    let maskedCount = 0;

    // Issue #603: Step 1 - Count environment variable occurrences in original content
    // This ensures accurate statistics even when maskString() masks some env var values
    for (const secret of secrets) {
      const occurrences = this.countOccurrences(originalContent, secret.value);
      if (occurrences > 0) {
        maskedCount += occurrences;
      }
    }

    // Issue #603: Step 2 - Replace known pattern tokens FIRST
    // This ensures maskString() can detect and preserve these patterns
    // Known patterns: GitHub tokens (ghp_*, github_pat_*), OpenAI tokens (sk-*, sk-proj-*), emails
    const githubTokenPattern = /^(ghp_[\w-]+|github_pat_[\w-]+)$/i;
    const openaiTokenPattern = /^sk(-proj)?-[\w-]+$/i;
    const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    for (const secret of secrets) {
      if (!secret.value) continue;

      // Check if the secret value matches known patterns
      if (
        githubTokenPattern.test(secret.value) ||
        openaiTokenPattern.test(secret.value) ||
        emailPattern.test(secret.value)
      ) {
        // Replace immediately with [REDACTED_*] so maskString() can detect the pattern
        const replacement = `[REDACTED_${secret.name}]`;
        content = this.replaceAll(content, secret.value, replacement);
      }
    }

    // Issue #603: Step 3 - Protect remaining environment variable values with temporary placeholders
    // This prevents maskString() from masking them with generic [REDACTED_TOKEN]
    const envVarPlaceholders = new Map<string, string>();
    for (const secret of secrets) {
      if (!secret.value) continue;

      // Skip if already replaced in Step 2
      if (
        githubTokenPattern.test(secret.value) ||
        openaiTokenPattern.test(secret.value) ||
        emailPattern.test(secret.value)
      ) {
        continue;
      }

      // Replace with placeholder
      const placeholder = `__ENV_VAR_${secret.name}_${Math.random().toString(36).substring(2, 10)}__`;
      envVarPlaceholders.set(placeholder, secret.name);
      content = this.replaceAll(content, secret.value, placeholder);
    }

    // Issue #603: Step 4 - Apply path protection and pattern masking
    // This protects long path components (20+ chars) from being matched by env var substrings
    // Environment variable values are already protected by placeholders or specific [REDACTED_*]
    content = this.maskString(content);

    // Issue #603: Step 5 - Replace placeholders with [REDACTED_*] tokens
    // This preserves environment variable names in the redacted output
    for (const [placeholder, envVarName] of envVarPlaceholders) {
      const replacement = `[REDACTED_${envVarName}]`;
      content = this.replaceAll(content, placeholder, replacement);
    }

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

  /**
   * Count masked secrets by comparing original and masked content
   */
  private countMaskedSecretsInContent(original: string, masked: string): number {
    let maskedCount = 0;

    for (const secret of this.getSecretList()) {
      if (!secret.value) continue;

      const originalOccurrences = this.countOccurrences(
        original,
        secret.value,
      );
      if (originalOccurrences === 0) continue;

      const maskedOccurrences = this.countOccurrences(masked, secret.value);
      const diff = originalOccurrences - maskedOccurrences;
      if (diff > 0) {
        maskedCount += diff;
      }
    }

    return maskedCount;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
}
