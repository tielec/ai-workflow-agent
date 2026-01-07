import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { config } from '../../core/config.js';
import { getErrorMessage } from '../../utils/error-utils.js';

export interface ArtifactValidationResult {
  valid: boolean;
  expectedPath: string;
  actualPath?: string;
  relocated: boolean;
  error?: string;
}

export interface ArtifactValidatorOptions {
  relocateOnMismatch?: boolean;
  allowedRoots?: string[];
}

export class ArtifactValidator {
  private readonly relocateOnMismatch: boolean;
  private readonly allowedRoots: string[];

  constructor(options?: ArtifactValidatorOptions) {
    this.relocateOnMismatch =
      options?.relocateOnMismatch ?? config.getArtifactRelocateOnMismatch();
    this.allowedRoots = (options?.allowedRoots ?? []).map((root) => path.resolve(root));
  }

  validateArtifact(
    expectedPath: string,
    fallbackDirs: string[],
    filename?: string
  ): ArtifactValidationResult {
    const normalizedExpected = path.resolve(expectedPath);
    const normalizedFallbacks = this.normalizeFallbackDirs(fallbackDirs);
    const allowedRoots = this.buildAllowedRoots(normalizedExpected, normalizedFallbacks);

    if (fs.existsSync(normalizedExpected)) {
      return {
        valid: true,
        expectedPath: normalizedExpected,
        actualPath: normalizedExpected,
        relocated: false,
      };
    }

    const candidate = this.findFallbackArtifact(
      normalizedExpected,
      normalizedFallbacks,
      allowedRoots,
      filename
    );

    if (!candidate) {
      return {
        valid: false,
        expectedPath: normalizedExpected,
        relocated: false,
        error: 'Output file not found at expected path or fallback locations.',
      };
    }

    if (!this.relocateOnMismatch) {
      return {
        valid: false,
        expectedPath: normalizedExpected,
        actualPath: candidate,
        relocated: false,
        error: `Artifact found at wrong location. Expected: ${normalizedExpected}. Actual: ${candidate}`,
      };
    }

    try {
      fs.ensureDirSync(path.dirname(normalizedExpected));
      fs.copyFileSync(candidate, normalizedExpected);
      fs.removeSync(candidate);
      logger.warn(
        `[Issue #603] Artifact relocated from ${candidate} to ${normalizedExpected}. ` +
          'Update working directory configuration to avoid relocation.',
      );
      return {
        valid: true,
        expectedPath: normalizedExpected,
        actualPath: candidate,
        relocated: true,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        valid: false,
        expectedPath: normalizedExpected,
        actualPath: candidate,
        relocated: false,
        error: `Failed to relocate artifact: ${message}`,
      };
    }
  }

  private normalizeFallbackDirs(dirs: string[]): string[] {
    const unique = new Set<string>();
    for (const dir of dirs) {
      if (!dir) {
        continue;
      }
      const normalized = path.resolve(dir);
      if (fs.existsSync(normalized)) {
        unique.add(normalized);
      }
    }
    return Array.from(unique);
  }

  private buildAllowedRoots(expectedPath: string, fallbackDirs: string[]): string[] {
    const roots = new Set<string>(this.allowedRoots);
    const repoRoot = this.extractRepoRoot(expectedPath);
    if (repoRoot) {
      roots.add(repoRoot);
    }
    roots.add(path.dirname(expectedPath));
    fallbackDirs.forEach((dir) => roots.add(dir));
    return Array.from(roots).map((root) => path.resolve(root));
  }

  private findFallbackArtifact(
    expectedPath: string,
    fallbackDirs: string[],
    allowedRoots: string[],
    filename?: string
  ): string | null {
    const workflowRelative = this.extractWorkflowRelativePath(expectedPath, filename);

    for (const dir of fallbackDirs) {
      const candidate = path.join(dir, workflowRelative);
      if (!this.isWithinAllowedRoots(candidate, allowedRoots)) {
        logger.warn(`[Issue #603] Skipping candidate outside allowed roots: ${candidate}`);
        continue;
      }

      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    }

    return null;
  }

  private extractWorkflowRelativePath(expectedPath: string, filename?: string): string {
    const marker = `${path.sep}.ai-workflow${path.sep}`;
    const markerIndex = expectedPath.indexOf(marker);
    if (markerIndex !== -1) {
      const suffix = expectedPath.slice(markerIndex + marker.length);
      return path.join('.ai-workflow', suffix);
    }
    return filename ?? path.basename(expectedPath);
  }

  private extractRepoRoot(expectedPath: string): string | null {
    const marker = `${path.sep}.ai-workflow${path.sep}`;
    const markerIndex = expectedPath.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }
    return path.resolve(expectedPath.slice(0, markerIndex));
  }

  private isWithinAllowedRoots(targetPath: string, allowedRoots: string[]): boolean {
    const normalized = path.resolve(targetPath);
    return allowedRoots.some(
      (root) => normalized === root || normalized.startsWith(`${root}${path.sep}`),
    );
  }
}
