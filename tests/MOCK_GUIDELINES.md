# Jest モックガイドライン（ESM 互換）

## 推奨パターン
- `beforeAll` 内で `await jest.unstable_mockModule()` を用いて依存をモックする。
- モック設定後に `await import()` でテスト対象モジュールを動的インポートする。
- `__esModule: true` を必ず含め、default と named を両方定義する。
- `beforeEach` で `jest.resetAllMocks()` または `jest.clearAllMocks()` を行い、モックの戻り値を初期化する。
- クラスは `jest.fn().mockImplementation` でラップし、`jest.MockedClass` で結果を参照する。

```typescript
beforeAll(async () => {
  await jest.unstable_mockModule('external-lib', () => ({
    __esModule: true,
    default: { run: mockRun },
    run: mockRun,
  }));

  await jest.unstable_mockModule('../core/service.js', () => ({
    __esModule: true,
    Service: jest.fn().mockImplementation(() => ({ exec: mockExec })),
  }));

  subject = (await import('../commands/subject.js')).subject;
});

beforeEach(() => {
  jest.resetAllMocks();
  mockRun.mockResolvedValue(undefined);
  mockExec.mockResolvedValue({ success: true });
});
```

## アンチパターン
- 同期的な `jest.mock()` を ESM で使用する。
- モック設定前に静的インポートでモジュールを読み込む。
- `__esModule` を省略した manual mock を使用する。
- `jest.spyOn` を使って ES モジュールのデフォルトエクスポートを直接上書きする。

## チェックリスト
- [ ] すべてのモックが `jest.unstable_mockModule` で定義されている。
- [ ] `__esModule: true` を含め、default/named の両方を提供している。
- [ ] モック後にテスト対象を動的インポートしている。
- [ ] `beforeEach` でモック状態をリセットしている。
- [ ] クラスモックは `jest.MockedClass` で参照している。

## 参考
- `tests/unit/pr-comment/finalize-command.test.ts`（ESM 対応テンプレート）
- Jest ESM docs: https://jestjs.io/docs/ecmascript-modules
