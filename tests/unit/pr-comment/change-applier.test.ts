import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import { CodeChangeApplier } from '../../../src/core/pr-comment/change-applier.js';

describe('CodeChangeApplier', () => {
  const repoPath = '/repo';
  let applier: CodeChangeApplier;
  let writeFileSpy: jest.SpiedFunction<typeof fs.writeFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'pathExists').mockResolvedValue(false as any);
    jest.spyOn(fs, 'remove').mockResolvedValue(undefined);

    applier = new CodeChangeApplier(repoPath);
  });

  it('rejects absolute and traversal paths', () => {
    expect(applier.validateFilePath('/etc/passwd').valid).toBe(false);
    expect(applier.validateFilePath('../secret.txt').valid).toBe(false);
  });

  it('skips excluded files while keeping success true', async () => {
    const result = await applier.apply(
      [
        {
          path: '.env',
          change_type: 'modify',
          content: 'SECRET=1',
        },
      ],
      false,
    );

    expect(result.success).toBe(true);
    expect(result.skipped_files).toEqual([{ path: '.env', reason: 'Excluded file (security)' }]);
    expect(result.applied_files).toHaveLength(0);
  });

  it('writes modified content to target path', async () => {
    const change = { path: 'src/config.ts', change_type: 'modify' as const, content: 'export {}' };

    const result = await applier.apply([change], false);

    expect(result.success).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(repoPath, 'src/config.ts'),
      'export {}',
      'utf-8',
    );
  });

  it('returns failure when diff-only modification is requested', async () => {
    const result = await applier.apply(
      [{ path: 'src/app.ts', change_type: 'modify', diff: '@@ -1 +1 @@' }],
      false,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Diff-based modification not yet implemented');
  });
});
