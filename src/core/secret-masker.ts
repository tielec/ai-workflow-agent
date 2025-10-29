import * as fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import { glob } from 'glob';

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
        const errorMsg = `Failed to process ${filePath}: ${(error as Error).message}`;
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
          `Failed to glob pattern ${globPattern}: ${(error as Error).message}`,
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
    let maskedCount = 0;
    let modified = false;

    for (const secret of secrets) {
      const replacement = `[REDACTED_${secret.name}]`;
      const occurrences = this.countOccurrences(content, secret.value);

      if (occurrences > 0) {
        content = this.replaceAll(content, secret.value, replacement);
        maskedCount += occurrences;
        modified = true;
      }
    }

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
}
