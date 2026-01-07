import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkingDirectory, validateWorkingDirectoryPath } from '../../../src/core/helpers/working-directory-resolver.js';

const baseEnv = { ...process.env };
const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  process.env = { ...baseEnv };
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wd-resolver-'));
});

afterEach(async () => {
  process.env = baseEnv;
  jest.restoreAllMocks();
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }
  if (tempRoot && (await fs.pathExists(tempRoot))) {
    await fs.remove(tempRoot);
  }
});

describe('Working directory validation (Issue #603)', () => {
  test('TC-U-603-001: validateWorkingDirectoryPath succeeds when path exists', async () => {
    const repoPath = path.join(tempRoot, 'sd-platform-development');
    await fs.ensureDir(path.join(repoPath, '.git'));

    const validated = validateWorkingDirectoryPath(repoPath);

    expect(validated).toBe(path.resolve(repoPath));
  });

  test('TC-U-603-002: validateWorkingDirectoryPath throws on missing directory', () => {
    const missing = path.join(tempRoot, 'non-existent-repo');

    expect(() => validateWorkingDirectoryPath(missing)).toThrow(
      /\[Issue #603\] Working directory does not exist/,
    );
  });

  test('TC-U-603-003: masked path is rejected before execution', () => {
    const maskedPath = path.join(tempRoot, '[REDACTED_TOKEN]');

    expect(() => validateWorkingDirectoryPath(maskedPath)).toThrow(
      /\[Issue #603\] Working directory appears to be masked/,
    );
  });

  test('TC-U-603-004: resolveWorkingDirectory prefers metadata target_repository.path', async () => {
    process.env.REPOS_ROOT = tempRoot;
    const repoPath = path.join(tempRoot, 'sd-platform-development');
    const metadataDir = path.join(repoPath, '.ai-workflow', 'issue-236');
    await fs.ensureDir(path.join(repoPath, '.git'));
    await fs.ensureDir(metadataDir);
    await fs.writeJson(path.join(metadataDir, 'metadata.json'), {
      target_repository: {
        path: repoPath,
      },
    });

    const resolved = await resolveWorkingDirectory(path.join(metadataDir, 'execute'));

    expect(resolved).toBe(path.resolve(repoPath));
  });

  test('TC-U-603-005: REPOS_ROOT fallback is used when metadata path is missing', async () => {
    process.env.REPOS_ROOT = tempRoot;
    const repoName = 'sd-platform-development';
    const repoPath = path.join(tempRoot, repoName);
    const metadataDir = path.join(repoPath, '.ai-workflow', 'issue-236');
    await fs.ensureDir(path.join(repoPath, '.git'));
    await fs.ensureDir(metadataDir);
    await fs.writeJson(path.join(metadataDir, 'metadata.json'), {
      target_repository: {
        repo: repoName,
      },
    });

    const resolved = await resolveWorkingDirectory(path.join(metadataDir, 'execute'));

    expect(resolved).toBe(path.resolve(repoPath));
  });

  test('TC-U-603-006: process.cwd() fallback is blocked when paths cannot be resolved', async () => {
    const workspaceRoot = path.join(tempRoot, 'workspace');
    await fs.ensureDir(workspaceRoot);
    process.chdir(workspaceRoot);
    delete process.env.REPOS_ROOT;

    const repoPath = path.join(tempRoot, 'sd-platform-development');
    const metadataDir = path.join(repoPath, '.ai-workflow', 'issue-603');
    await fs.ensureDir(path.join(repoPath, '.git'));
    await fs.ensureDir(metadataDir);
    await fs.writeJson(path.join(metadataDir, 'metadata.json'), {
      target_repository: {},
    });

    await expect(resolveWorkingDirectory(path.join(metadataDir, 'execute'))).rejects.toThrow(
      /\[Issue #603\] Unable to resolve working directory/,
    );
  });
});
