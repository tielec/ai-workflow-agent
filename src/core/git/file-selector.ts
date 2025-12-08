import { minimatch } from 'minimatch';
import type { SimpleGit } from 'simple-git';
import type { PhaseName } from '../../types.js';
import { config } from '../config.js';

/**
 * Security-sensitive file patterns that should NEVER be committed.
 * These patterns are checked against file paths to prevent accidental credential leaks.
 */
const SECURITY_EXCLUDED_PATTERNS: string[] = [
  '.codex/auth.json',
  '.codex/',
  'auth.json',
  'credentials.json',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
];

/**
 * Check if a file path matches any security-sensitive pattern.
 * @param filePath - The file path to check
 * @returns true if the file should be excluded for security reasons
 */
export function isSecuritySensitiveFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SECURITY_EXCLUDED_PATTERNS.some((pattern) => {
    // Exact match or ends with pattern (for nested paths)
    return normalizedPath === pattern ||
      normalizedPath.endsWith(`/${pattern}`) ||
      normalizedPath.includes(`/${pattern.replace(/\/$/, '')}/`) ||
      normalizedPath.startsWith(pattern);
  });
}

/**
 * Check if a file is a raw agent log that should be excluded when LOG_LEVEL is not 'debug'.
 *
 * Raw agent logs (agent_log_raw.txt) can be very large (100MB+) and cause GitHub push failures.
 * These files are only needed for debugging, so we exclude them when LOG_LEVEL is 'info' or higher.
 *
 * @param filePath - The file path to check
 * @returns true if the file should be excluded based on log level
 */
export function shouldExcludeRawLog(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const logLevel = config.getLogLevel();

  // Only exclude when LOG_LEVEL is not 'debug'
  if (logLevel === 'debug') {
    return false;
  }

  // Check if file is agent_log_raw.txt
  return normalizedPath.endsWith('/agent_log_raw.txt') ||
    normalizedPath === 'agent_log_raw.txt';
}

/**
 * FileSelector - Specialized module for file selection and filtering
 *
 * Responsibilities:
 * - Detect changed files from git status
 * - Filter files by issue number
 * - Get phase-specific files (implementation, test_implementation, documentation)
 * - Scan directories by patterns
 * - Scan files by minimatch patterns
 * - SECURITY: Exclude sensitive credential files from all operations
 */
export class FileSelector {
  private readonly git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * Get changed files from git status
   * Excludes:
   * - Files containing '@tmp'
   * - Security-sensitive files (credentials, auth files, .env)
   * - Raw agent logs (agent_log_raw.txt) when LOG_LEVEL is not 'debug'
   */
  public async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    const aggregated = new Set<string>();

    const collect = (paths: string[] | undefined) => {
      paths?.forEach((file) => {
        // SECURITY: Exclude @tmp, sensitive credential files, and raw logs when not in debug mode
        if (!file.includes('@tmp') && !isSecuritySensitiveFile(file) && !shouldExcludeRawLog(file)) {
          aggregated.add(file);
        }
      });
    };

    collect(status.not_added);
    collect(status.created);
    collect(status.deleted);
    collect(status.modified);
    collect(status.renamed?.map((entry) => entry.to));
    collect(status.staged);

    status.files.forEach((file) => {
      // SECURITY: Exclude sensitive credential files and raw logs when not in debug mode
      if (!isSecuritySensitiveFile(file.path) && !shouldExcludeRawLog(file.path)) {
        aggregated.add(file.path);
      }
    });

    return Array.from(aggregated);
  }

  /**
   * Filter files by issue number
   * Includes:
   * - Files in .ai-workflow/issue-{issueNumber}/
   * - Files NOT in .ai-workflow/ (e.g., src/**, tests/**)
   * Excludes:
   * - Files containing '@tmp'
   * - Files in .ai-workflow/issue-{OTHER_NUMBER}/
   * - Security-sensitive files (credentials, auth files, .env)
   * - Raw agent logs (agent_log_raw.txt) when LOG_LEVEL is not 'debug'
   */
  public filterPhaseFiles(files: string[], issueNumber: string): string[] {
    const targetPrefix = `.ai-workflow/issue-${issueNumber}/`;
    const result: string[] = [];

    for (const file of files) {
      // SECURITY: Exclude @tmp, sensitive credential files, and raw logs when not in debug mode
      if (file.includes('@tmp') || isSecuritySensitiveFile(file) || shouldExcludeRawLog(file)) {
        continue;
      }

      if (file.startsWith(targetPrefix)) {
        result.push(file);
      } else if (file.startsWith('.ai-workflow/')) {
        continue;
      } else {
        result.push(file);
      }
    }

    return result;
  }

  /**
   * Get phase-specific files based on phase name
   * - implementation: scripts/, pulumi/, ansible/, jenkins/
   * - test_implementation: test files (*.test.ts, *.spec.js, etc.)
   * - documentation: markdown files (*.md, *.MD)
   * - other phases: empty array
   */
  public async getPhaseSpecificFiles(phaseName: PhaseName): Promise<string[]> {
    switch (phaseName) {
      case 'implementation':
        return this.scanDirectories(['scripts', 'pulumi', 'ansible', 'jenkins']);
      case 'test_implementation':
        return this.scanByPatterns([
          'test_*.py',
          '*_test.py',
          '*.test.js',
          '*.spec.js',
          '*.test.ts',
          '*.spec.ts',
          '*_test.go',
          'Test*.java',
          '*Test.java',
          'test_*.sh',
        ]);
      case 'documentation':
        return this.scanByPatterns(['*.md', '*.MD']);
      default:
        return [];
    }
  }

  /**
   * Scan specific directories for changed files
   * Excludes files containing '@tmp'
   */
  private async scanDirectories(directories: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results: string[] = [];

    for (const dir of directories) {
      const prefix = `${dir}/`;
      changedFiles.forEach((file) => {
        if (file.startsWith(prefix) && !file.includes('@tmp')) {
          results.push(file);
        }
      });
    }

    return results;
  }

  /**
   * Scan files by glob patterns using minimatch
   * Supports two matching modes:
   * - Direct match: minimatch(file, pattern)
   * - Recursive match: minimatch(file, `**\/${pattern}`)
   * Excludes files containing '@tmp'
   */
  private async scanByPatterns(patterns: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results = new Set<string>();

    changedFiles.forEach((file) => {
      if (file.includes('@tmp')) {
        return;
      }

      for (const pattern of patterns) {
        if (
          minimatch(file, pattern, { dot: true }) ||
          minimatch(file, `**/${pattern}`, { dot: true })
        ) {
          results.add(file);
          break;
        }
      }
    });

    return Array.from(results);
  }
}
