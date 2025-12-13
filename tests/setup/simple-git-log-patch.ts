import simpleGit from 'simple-git';
import { jest } from '@jest/globals';
import { createRequire } from 'node:module';
import path from 'node:path';

(globalThis as any).jest = jest;

// Ensure auto-issue output module can be spied/mocked in ESM tests
jest.mock('../../src/commands/auto-issue-output.js', () => {
  const actual = jest.requireActual('../../src/commands/auto-issue-output.js');
  return {
    ...actual,
    writeAutoIssueOutputFile: jest.fn(actual.writeAutoIssueOutputFile),
  };
});

// Provide CommonJS-style require in ESM test environment for legacy compatibility checks.
if (typeof (globalThis as any).require !== 'function') {
  const jestApi = jest ?? (globalThis as any).jest;
  const fallbackBase = typeof __filename !== 'undefined'
    ? __filename
    : path.join(process.cwd(), 'tests', 'setup', 'simple-git-log-patch.ts');
  const fallbackRequire = createRequire(fallbackBase);

  const mapSpecifier = (specifier: string) => specifier.replace(/\.js$/, '');
  const resolveSpecifier = (specifier: string) => {
    if (!specifier.startsWith('.')) {
      return specifier;
    }
    const stripped = specifier.replace(/^(\.\/|(\.\.\/)+)/, '');
    return path.join(process.cwd(), stripped);
  };

  (globalThis as any).require = (specifier: string) => {
    if (specifier.includes('/commands/execute')) {
      const cached = (globalThis as any).__aiWorkflowExecuteModule;
      if (cached) {
        return cached;
      }
    }

    const mapped = resolveSpecifier(mapSpecifier(specifier));
    if (jestApi?.requireActual) {
      try {
        return jestApi.requireMock ? jestApi.requireMock(mapped) : jestApi.requireActual(mapped);
      } catch {
        // ignore and fall back
      }
    }
    return fallbackRequire(mapped);
  };
}

// simple-git はログ結果の body を message に含めないため、
// テスト検証用に message に body を連結するパッチを当てる。
const tempGit = simpleGit();
const gitProto = Object.getPrototypeOf(tempGit);
const originalLog = gitProto.log;

gitProto.log = async function patchedLog(...args: unknown[]) {
  const result = await originalLog.apply(this, args as any);

  if (result && typeof result === 'object') {
    if (Array.isArray((result as any).all)) {
      (result as any).all = (result as any).all.map((entry: any) => ({
        ...entry,
        message: [entry.message, entry.body].filter(Boolean).join('\n').trim(),
      }));
    }

    if ((result as any).latest) {
      const latest = (result as any).latest;
      (result as any).latest = {
        ...latest,
        message: [latest.message, latest.body].filter(Boolean).join('\n').trim(),
      };
    }
  }

  return result;
};

export {};
