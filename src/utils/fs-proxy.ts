import { createRequire } from 'node:module';
type FsExtraModule = typeof import('fs-extra');

const require = createRequire(import.meta.url);

const loadFsExtra = (): FsExtraModule => require('fs-extra') as FsExtraModule;

const resolveJestApi = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalJest = (globalThis as any).jest;
  if (globalJest) {
    return globalJest;
  }

  try {
    const globals = require('@jest/globals') as { jest?: any };
    return globals?.jest;
  } catch {
    return undefined;
  }
};

const resolveJestMockFs = (): FsExtraModule | null => {
  const jestApi = resolveJestApi();
  if (!jestApi || typeof jestApi.requireMock !== 'function') {
    return null;
  }

  try {
    return jestApi.requireMock('fs-extra') as FsExtraModule;
  } catch {
    return null;
  }
};

// fs-extra の現在の実装を解決する
const resolveFs = (): FsExtraModule => {
  const injected = (globalThis as any).__aiWorkflowFsExtra as FsExtraModule | undefined;
  if (injected) {
    return injected;
  }

  const fsExtra = loadFsExtra();
  const jestApi = resolveJestApi();

  if (jestApi?.isMockFunction) {
    const probe =
      (fsExtra as any).writeFileSync ??
      (fsExtra as any).writeFile ??
      (fsExtra as any).readFile ??
      (fsExtra as any).readFileSync;

    if (probe && jestApi.isMockFunction(probe)) {
      return fsExtra;
    }
  }

  return fsExtra;
};

// 遅延評価できるプロキシを用意し、モック差し替え後も参照が切り替わるようにする
const fsProxy: FsExtraModule = new Proxy(
  {} as FsExtraModule,
  {
    get(_target, prop: string | symbol, receiver) {
      const fs = resolveFs() as any;
      return Reflect.get(fs, prop, receiver);
    },
    set(_target, prop: string | symbol, value: unknown) {
      const fs = resolveFs() as any;
      try {
        return Reflect.set(fs, prop, value);
      } catch {
        (globalThis as any).__aiWorkflowFsExtra = {
          ...(fs as FsExtraModule),
          [prop]: value,
        } as FsExtraModule;
        return true;
      }
    },
    has(_target, prop: string | symbol) {
      return prop in resolveFs();
    },
  },
) as FsExtraModule;

// グローバルに注入されたモック（createFsExtraMockが設定）を優先する
export const getFsExtra = (): FsExtraModule => fsProxy;

// テスト用の明示的な差し替えAPI
export const setFsExtra = (fsLike: FsExtraModule | null | undefined): void => {
  (globalThis as any).__aiWorkflowFsExtra = fsLike ?? undefined;
};

export default fsProxy;
