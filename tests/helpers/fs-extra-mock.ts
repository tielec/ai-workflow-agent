import { jest } from '@jest/globals';

export type FsExtraMock = ReturnType<typeof createFsExtraMock>;

export const createFsExtraMock = () => {
  const mockFs: Record<string, unknown> = {
    existsSync: jest.fn(),
    pathExistsSync: jest.fn(),
    ensureDirSync: jest.fn(),
    mkdirSync: jest.fn(),
    mkdirpSync: jest.fn(),
    ensureDir: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    readJsonSync: jest.fn(),
    writeJsonSync: jest.fn(),
    readJSON: jest.fn(),
    writeJSON: jest.fn(),
    statSync: jest.fn(),
    lstatSync: jest.fn(),
    readdirSync: jest.fn(),
    removeSync: jest.fn(),
    copyFileSync: jest.fn(),
    remove: jest.fn(),
    copy: jest.fn(),
    lstat: jest.fn(),
  };

  const target = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const actual = jest.requireActual<typeof import('fs-extra')>('fs-extra');
      // 未定義のメソッドは実装にフォールバックするようプロトタイプを設定
      const merged = Object.assign(Object.create(actual), mockFs);
      return merged as Record<string, unknown>;
    } catch {
      return { ...mockFs } as Record<string, unknown>;
    }
  })();

  // メイン実装側で getFsExtra() を経由して利用するため、グローバルに掲示
  (globalThis as any).__aiWorkflowFsExtra = target;

  return {
    __esModule: true,
    ...target,
    default: target,
  };
};
