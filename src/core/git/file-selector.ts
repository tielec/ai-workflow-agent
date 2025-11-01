import { minimatch } from 'minimatch';
import type { SimpleGit } from 'simple-git';
import type { PhaseName } from '../../types.js';

/**
 * FileSelector - Specialized module for file selection and filtering
 *
 * Responsibilities:
 * - Detect changed files from git status
 * - Filter files by issue number
 * - Get phase-specific files (implementation, test_implementation, documentation)
 * - Scan directories by patterns
 * - Scan files by minimatch patterns
 */
export class FileSelector {
  private readonly git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * Get changed files from git status
   * Excludes files containing '@tmp'
   */
  public async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    const aggregated = new Set<string>();

    const collect = (paths: string[] | undefined) => {
      paths?.forEach((file) => {
        if (!file.includes('@tmp')) {
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

    status.files.forEach((file) => aggregated.add(file.path));

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
   */
  public filterPhaseFiles(files: string[], issueNumber: string): string[] {
    const targetPrefix = `.ai-workflow/issue-${issueNumber}/`;
    const result: string[] = [];

    for (const file of files) {
      if (file.includes('@tmp')) {
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
