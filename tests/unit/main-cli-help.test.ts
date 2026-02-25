/**
 * ユニットテスト: CLI ヘルプ出力
 *
 * テスト対象: src/main.ts の commander 定義
 * シナリオ出典: test-scenario.md の CLI ヘルプ出力検証
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import process from 'node:process';
import { runCli } from '../../src/main.js';

describe('CLI help output', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
  });

  it('rewrite-issue の --help に --base-branch が表示される', async () => {
    let output = '';
    process.argv = ['node', 'script', 'rewrite-issue', '--help'];
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit;
    process.stdout.write = ((chunk: any) => {
      output += chunk?.toString?.() ?? String(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await runCli();
    } catch (error) {
      // --help は process.exit を呼ぶ想定
      expect(String(error)).toContain('process.exit');
    }

    expect(output).toContain('rewrite-issue');
    expect(output).toContain('--base-branch');
  });

  it('auto-issue の --help に --base-branch が表示される', async () => {
    let output = '';
    process.argv = ['node', 'script', 'auto-issue', '--help'];
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit;
    process.stdout.write = ((chunk: any) => {
      output += chunk?.toString?.() ?? String(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await runCli();
    } catch (error) {
      expect(String(error)).toContain('process.exit');
    }

    expect(output).toContain('auto-issue');
    expect(output).toContain('--base-branch');
  });
});
