import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs-extra';
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
    // Use expect.stringContaining to handle both Unix and Windows path formats
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('src'),
      'export {}',
      'utf-8',
    );
    // Verify the path ends with the expected relative path
    const callPath = writeFileSpy.mock.calls[0][0] as string;
    expect(callPath.endsWith(path.join('src', 'config.ts'))).toBe(true);
  });

  it('modifyFile_diffベース変更_unified diff形式が正しく適用される', async () => {
    // Given: 元ファイル内容と unified diff
    jest.spyOn(fs, 'readFile').mockResolvedValue(
      'const a = 1;\nconst b = 2;\nconst c = 3;\n',
    );
    const change = {
      path: 'src/example.ts',
      change_type: 'modify' as const,
      diff: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,3 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n const c = 3;\n',
    };

    // When: diff ベース変更を適用
    const result = await applier.apply([change], false);

    // Then: diff が適用された内容が書き込まれる
    expect(result.success).toBe(true);
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('src'),
      'const a = 1;\nconst b = 3;\nconst c = 3;\n',
      'utf-8',
    );
  });

  it('modifyFile_contentもdiffもない_エラーが返る', async () => {
    // Given: content/diff がない変更
    const change = { path: 'src/example.ts', change_type: 'modify' as const };

    // When: apply を実行
    const result = await applier.apply([change], false);

    // Then: エラーが返る
    expect(result.success).toBe(false);
    expect(result.error).toContain('Either content or diff is required for modify');
  });
});
