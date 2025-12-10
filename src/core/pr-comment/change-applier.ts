import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { FileChange, ChangeApplyResult } from '../../types/pr-comment.js';

/**
 * 機密ファイルパターン（変更禁止）
 */
const EXCLUDED_PATTERNS = [
  '.env',
  '.env.*',
  'credentials.json',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.git/**',
  'node_modules/**',
  '.npmrc',
  '.yarnrc',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
];

/**
 * コード変更適用エンジン
 */
export class CodeChangeApplier {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = path.resolve(repoPath);
  }

  /**
   * 変更を適用
   */
  public async apply(changes: FileChange[], dryRun = false): Promise<ChangeApplyResult> {
    const appliedFiles: string[] = [];
    const skippedFiles: Array<{ path: string; reason: string }> = [];

    for (const change of changes) {
      const validation = this.validateFilePath(change.path);
      if (!validation.valid) {
        skippedFiles.push({ path: change.path, reason: validation.reason ?? 'Invalid path' });
        continue;
      }

      if (this.isExcludedFile(change.path)) {
        skippedFiles.push({ path: change.path, reason: 'Excluded file (security)' });
        continue;
      }

      if (dryRun) {
        logger.info(`[DRY-RUN] Would ${change.change_type}: ${change.path}`);
        appliedFiles.push(change.path);
        continue;
      }

      try {
        await this.applyChange(change);
        appliedFiles.push(change.path);
        logger.info(`Applied ${change.change_type}: ${change.path}`);
      } catch (error) {
        return {
          success: false,
          applied_files: appliedFiles,
          skipped_files: skippedFiles,
          error: `Failed to apply change to ${change.path}: ${getErrorMessage(error)}`,
        };
      }
    }

    return {
      success: true,
      applied_files: appliedFiles,
      skipped_files: skippedFiles,
    };
  }

  private async applyChange(change: FileChange): Promise<void> {
    const fullPath = path.join(this.repoPath, change.path);

    switch (change.change_type) {
      case 'create':
        await this.createFile(fullPath, change.content ?? '');
        break;
      case 'modify':
        await this.modifyFile(fullPath, change);
        break;
      case 'delete':
        await this.deleteFile(fullPath);
        break;
      default:
        throw new Error(`Unknown change type: ${change.change_type}`);
    }
  }

  private async createFile(fullPath: string, content: string): Promise<void> {
    const dir = path.dirname(fullPath);
    await fs.ensureDir(dir);
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  private async modifyFile(fullPath: string, change: FileChange): Promise<void> {
    if (change.content !== undefined) {
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, change.content, 'utf-8');
      return;
    }

    if (change.diff) {
      throw new Error('Diff-based modification not yet implemented');
    }

    throw new Error('Either content or diff is required for modify');
  }

  private async deleteFile(fullPath: string): Promise<void> {
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }

  /**
   * ファイルパスを検証（パストラバーサル防止）
   */
  public validateFilePath(targetPath: string): { valid: boolean; reason?: string } {
    if (path.isAbsolute(targetPath)) {
      return { valid: false, reason: 'Absolute paths are not allowed' };
    }

    if (targetPath.includes('..')) {
      return { valid: false, reason: 'Path traversal detected' };
    }

    const resolved = path.resolve(this.repoPath, targetPath);
    if (!resolved.startsWith(this.repoPath)) {
      return { valid: false, reason: 'Path is outside repository' };
    }

    return { valid: true };
  }

  /**
   * 機密ファイルかどうかを判定
   */
  public isExcludedFile(targetPath: string): boolean {
    const normalizedPath = targetPath.replace(/\\/g, '/');

    for (const pattern of EXCLUDED_PATTERNS) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * グロブパターンマッチング（簡易版）
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    if (filePath === pattern) {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*') +
          '$',
      );
      return regex.test(filePath);
    }

    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return filePath.startsWith(prefix);
    }

    return false;
  }
}
