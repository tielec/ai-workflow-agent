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
 * Debug-only file patterns that should be excluded when LOG_LEVEL is not 'debug'.
 *
 * These files are only needed for debugging:
 * - agent_log_raw.txt: Raw agent logs (can be 100MB+, cause GitHub push failures)
 * - prompt.txt: Agent prompts (useful for debugging but not needed in production)
 */
const DEBUG_ONLY_PATTERNS: string[] = [
  'agent_log_raw.txt',
  'prompt.txt',
];

/**
 * Build artifact and cache file patterns that should NEVER be committed.
 *
 * These files are generated automatically and should not be version controlled:
 * - Python: __pycache__/, *.pyc, *.pyo, *.pyd
 * - Node.js: node_modules/ (already in .gitignore, but double-check)
 * - Build outputs: dist/, build/, out/, target/
 * - Cache: .pytest_cache/, .mypy_cache/, .cache/
 */
const BUILD_ARTIFACT_PATTERNS: string[] = [
  '__pycache__',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.pytest_cache',
  '.mypy_cache',
  '.cache',
  'node_modules',
  '.npm',
  '.yarn',
];

/**
 * Check if a file is a debug-only file that should be excluded when LOG_LEVEL is not 'debug'.
 *
 * Debug-only files (agent_log_raw.txt, prompt.txt) can be large and are only needed for debugging.
 * These files are excluded when LOG_LEVEL is 'info' or higher to reduce repository size.
 *
 * @param filePath - The file path to check
 * @returns true if the file should be excluded based on log level
 */
export function shouldExcludeDebugFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const logLevel = config.getLogLevel();

  // Only exclude when LOG_LEVEL is not 'debug'
  if (logLevel === 'debug') {
    return false;
  }

  // Check if file matches any debug-only pattern
  return DEBUG_ONLY_PATTERNS.some((pattern) =>
    normalizedPath.endsWith(`/${pattern}`) || normalizedPath === pattern
  );
}

/**
 * @deprecated Use shouldExcludeDebugFile instead
 * Kept for backward compatibility
 */
export function shouldExcludeRawLog(filePath: string): boolean {
  return shouldExcludeDebugFile(filePath);
}

/**
 * Check if a file is a build artifact or cache file that should be excluded.
 *
 * Build artifacts and cache files (__pycache__/, *.pyc, node_modules/, etc.) should never be committed.
 * These files are generated automatically and pollute the repository if included.
 *
 * @param filePath - The file path to check
 * @returns true if the file should be excluded as a build artifact
 */
export function isBuildArtifact(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  return BUILD_ARTIFACT_PATTERNS.some((pattern) => {
    // Check for directory patterns (e.g., __pycache__, node_modules)
    if (!pattern.includes('*')) {
      return (
        normalizedPath.includes(`/${pattern}/`) ||
        normalizedPath.endsWith(`/${pattern}`) ||
        normalizedPath.startsWith(`${pattern}/`)
      );
    }

    // Check for wildcard patterns (e.g., *.pyc, *.pyo)
    if (pattern.startsWith('*.')) {
      const extension = pattern.substring(1); // Remove '*'
      return normalizedPath.endsWith(extension);
    }

    return false;
  });
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
   * - Debug-only files (agent_log_raw.txt, prompt.txt) when LOG_LEVEL is not 'debug'
   * - Build artifacts and cache files (__pycache__/, *.pyc, node_modules/, etc.)
   */
  public async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    const aggregated = new Set<string>();

    const collect = (paths: string[] | undefined) => {
      paths?.forEach((file) => {
        // SECURITY & HYGIENE: Exclude @tmp, sensitive files, debug files, and build artifacts
        if (
          !file.includes('@tmp') &&
          !isSecuritySensitiveFile(file) &&
          !shouldExcludeDebugFile(file) &&
          !isBuildArtifact(file)
        ) {
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
      // SECURITY & HYGIENE: Exclude sensitive files, debug files, and build artifacts
      if (
        !isSecuritySensitiveFile(file.path) &&
        !shouldExcludeDebugFile(file.path) &&
        !isBuildArtifact(file.path)
      ) {
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
   * - Debug-only files (agent_log_raw.txt, prompt.txt) when LOG_LEVEL is not 'debug'
   * - Build artifacts and cache files (__pycache__/, *.pyc, node_modules/, etc.)
   */
  public filterPhaseFiles(files: string[], issueNumber: string): string[] {
    const targetPrefix = `.ai-workflow/issue-${issueNumber}/`;
    const result: string[] = [];

    for (const file of files) {
      // SECURITY & HYGIENE: Exclude @tmp, sensitive files, debug files, and build artifacts
      if (
        file.includes('@tmp') ||
        isSecuritySensitiveFile(file) ||
        shouldExcludeDebugFile(file) ||
        isBuildArtifact(file)
      ) {
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
   * Excludes:
   * - Files containing '@tmp'
   * - Build artifacts and cache files
   */
  private async scanDirectories(directories: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results: string[] = [];

    for (const dir of directories) {
      const prefix = `${dir}/`;
      changedFiles.forEach((file) => {
        if (file.startsWith(prefix) && !file.includes('@tmp') && !isBuildArtifact(file)) {
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
   * Excludes:
   * - Files containing '@tmp'
   * - Build artifacts and cache files
   */
  private async scanByPatterns(patterns: string[]): Promise<string[]> {
    const changedFiles = await this.getChangedFiles();
    const results = new Set<string>();

    changedFiles.forEach((file) => {
      if (file.includes('@tmp') || isBuildArtifact(file)) {
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
