export type MockableFunction<T extends (...args: any[]) => any> = ((
  ...args: Parameters<T>
) => ReturnType<T>) & {
  mockReturnValue: (value: ReturnType<T>) => void;
  mockImplementation: (impl: T) => void;
  mockReset: () => void;
  mockResolvedValue?: (value: Awaited<ReturnType<T>>) => void;
  mockRejectedValue?: (error: any) => void;
  mockName?: (name: string) => void;
  getMockName?: () => string;
  _mockName?: string;
  mock?: {
    calls: Parameters<T>[];
    instances: any[];
    contexts: any[];
    results: Array<{ type: 'return' | 'throw'; value: any }>;
  };
  _isMockFunction?: boolean;
  __override?: T | null;
};

export const createMockableFunction = <T extends (...args: any[]) => any>(
  impl: T,
): MockableFunction<T> => {
  const maybeJest = (globalThis as any).jest;
  if (maybeJest?.fn) {
    const mockFn = maybeJest.fn(impl) as MockableFunction<T>;
    const original = {
      mockReturnValue: mockFn.mockReturnValue.bind(mockFn),
      mockImplementation: mockFn.mockImplementation.bind(mockFn),
      mockReset: mockFn.mockReset.bind(mockFn),
      mockResolvedValue: mockFn.mockResolvedValue?.bind(mockFn),
      mockRejectedValue: mockFn.mockRejectedValue?.bind(mockFn),
    };

    mockFn.mockReturnValue = (value: ReturnType<T>) => {
      original.mockReturnValue(value);
    };
    mockFn.mockImplementation = (implFn: T) => {
      original.mockImplementation(implFn);
    };
    mockFn.mockReset = () => {
      original.mockReset();
    };
    mockFn.mockResolvedValue = (value: Awaited<ReturnType<T>>) => {
      original.mockResolvedValue?.(value);
    };
    mockFn.mockRejectedValue = (error: any) => {
      original.mockRejectedValue?.(error);
    };
    return mockFn;
  }

  const fn = (function (this: any, ...args: Parameters<T>) {
    fn.mock?.calls.push(args);
    fn.mock?.instances.push(this);
    fn.mock?.contexts.push(this);

    const override = fn.__override;

    try {
      const result = override ? override.apply(this, args) : impl.apply(this, args);
      fn.mock?.results.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      fn.mock?.results.push({ type: 'throw', value: error });
      throw error;
    }
  }) as MockableFunction<T>;

  fn._isMockFunction = true;
  fn.mock = { calls: [], instances: [], contexts: [], results: [] };
  fn.__override = null;
  fn.mockName = (name: string) => {
    fn._mockName = name;
  };
  fn.getMockName = () => fn._mockName ?? 'mockableFunction';
  fn.mockReturnValue = (value: ReturnType<T>) => {
    fn.__override = (() => value) as unknown as T;
  };
  fn.mockImplementation = (implFn: T) => {
    fn.__override = implFn;
  };
  fn.mockReset = () => {
    fn.__override = null;
    fn.mock = { calls: [], instances: [], contexts: [], results: [] };
    fn._mockName = undefined;
  };
  fn.mockResolvedValue = (value: Awaited<ReturnType<T>>) => {
    fn.__override = (() => Promise.resolve(value)) as unknown as T;
  };
  fn.mockRejectedValue = (error: any) => {
    fn.__override = (() => Promise.reject(error)) as unknown as T;
  };

  return fn;
};
