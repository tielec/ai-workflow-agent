# テストシナリオ: Logger抽象化の導入

**Issue番号**: #50
**プロジェクト**: AI Workflow Agent
**作成日**: 2025-01-20
**複雑度**: 中程度
**見積もり工数**: 16~20時間

---

## 0. Planning Document & Requirements & Design の確認

Planning Phase（Phase 0）、Requirements Phase（Phase 1）、Design Phase（Phase 2）で策定された開発計画を確認しました：

### 実装戦略: CREATE
- 新規ファイル `src/core/logger.ts` を作成（ILogger、ConsoleLogger、LogLevel）
- 既存コードへの影響は置き換えのみ（EXTENDではなくCREATE）
- アーキテクチャ変更ではなく、新規抽象化層の追加

### テスト戦略: UNIT_ONLY
- Loggerクラスは外部依存がなく、ユニットテストのみで十分
- 統合テストは不要（既存のログ出力を置き換えるだけ）
- BDDテストも不要（インフラストラクチャ層の機能）

### テストコード戦略: CREATE_TEST
- 新規テストファイル `tests/unit/core/logger.test.ts` を作成
- 既存テストは修正不要（console.logのモックを置き換える程度）

### リスク評価: 中
- 影響範囲が大きい（40ファイル、329箇所）が、各変更は機械的で単純
- 既存機能への影響は最小限（ロギング出力のみ）
- テストコードへの影響は許容範囲（本番コードを優先）

---

## 1. テスト戦略サマリー

### 選択されたテスト戦略
**UNIT_ONLY**

**判断根拠**（Design Documentセクション3より引用）:
1. **外部依存の欠如**: Loggerクラスは `console.log/error/warn` のみに依存（Node.js標準API）
2. **統合テスト不要**: 既存のログ出力を置き換えるだけ（新規機能追加ではない）
3. **BDDテスト不要**: ユーザーストーリーが存在しない（インフラストラクチャ層の機能）
4. **ユニットテストで十分なカバレッジ**: LogLevelフィルタリング、構造化ログ、エラーロギング、環境変数読み込みがすべてユニットテストで検証可能

### テスト対象の範囲

**テスト対象ファイル**: `src/core/logger.ts`

**テスト対象コンポーネント**:
1. `LogLevel` (enum)
2. `ILogger` (interface)
3. `ConsoleLogger` (class)
4. `logger` (singleton instance)

**テスト観点**:
- LogLevelフィルタリング（各レベルでの出力検証）
- 構造化ログのサポート（context パラメータの出力検証）
- エラーロギング（Error オブジェクトのスタックトレース出力検証）
- 環境変数読み込み（LOG_LEVEL のパース検証）
- 循環参照の処理（formatContext のエラーハンドリング）

### テストの目的

1. **機能検証**: Loggerクラスが設計書通りの機能を提供することを検証
2. **品質保証**: 要件定義書の受け入れ基準（AC-01 ~ AC-07）を満たすことを検証
3. **回帰防止**: 将来的な変更で既存機能が壊れないことを保証
4. **ドキュメント化**: テストケースが仕様書として機能する

---

## 2. Unitテストシナリオ

### 2.1 LogLevel Enum のテスト

#### テストケース 2.1.1: LogLevel_値が正しく定義されている

- **目的**: LogLevel enumの各値が設計書通りの数値であることを検証
- **前提条件**: なし
- **入力**: なし
- **期待結果**:
  - `LogLevel.DEBUG === 0`
  - `LogLevel.INFO === 1`
  - `LogLevel.WARN === 2`
  - `LogLevel.ERROR === 3`
- **テストデータ**: なし

```typescript
describe('LogLevel', () => {
  it('should have correct numeric values', () => {
    expect(LogLevel.DEBUG).toBe(0);
    expect(LogLevel.INFO).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.ERROR).toBe(3);
  });
});
```

---

### 2.2 ConsoleLogger.parseLogLevelFromEnv() のテスト

#### テストケース 2.2.1: parseLogLevelFromEnv_DEBUG設定時

- **目的**: 環境変数 `LOG_LEVEL=DEBUG` が正しくパースされることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'DEBUG'`
- **入力**: なし（環境変数から自動読み込み）
- **期待結果**: `LogLevel.DEBUG` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'DEBUG'`

```typescript
it('should parse LOG_LEVEL=DEBUG correctly', () => {
  process.env.LOG_LEVEL = 'DEBUG';
  const logger = new ConsoleLogger();
  // minLevel が DEBUG であることを間接的に検証（debug()が出力される）
  const spy = jest.spyOn(console, 'log').mockImplementation();
  logger.debug('test');
  expect(spy).toHaveBeenCalledWith('[DEBUG] test');
  spy.mockRestore();
});
```

#### テストケース 2.2.2: parseLogLevelFromEnv_INFO設定時

- **目的**: 環境変数 `LOG_LEVEL=INFO` が正しくパースされることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'INFO'`
- **入力**: なし
- **期待結果**: `LogLevel.INFO` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'INFO'`

#### テストケース 2.2.3: parseLogLevelFromEnv_WARN設定時

- **目的**: 環境変数 `LOG_LEVEL=WARN` が正しくパースされることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'WARN'`
- **入力**: なし
- **期待結果**: `LogLevel.WARN` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'WARN'`

#### テストケース 2.2.4: parseLogLevelFromEnv_WARNING設定時

- **目的**: 環境変数 `LOG_LEVEL=WARNING` が `WARN` と同様に扱われることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'WARNING'`
- **入力**: なし
- **期待結果**: `LogLevel.WARN` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'WARNING'`

#### テストケース 2.2.5: parseLogLevelFromEnv_ERROR設定時

- **目的**: 環境変数 `LOG_LEVEL=ERROR` が正しくパースされることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'ERROR'`
- **入力**: なし
- **期待結果**: `LogLevel.ERROR` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'ERROR'`

#### テストケース 2.2.6: parseLogLevelFromEnv_小文字の値

- **目的**: 環境変数 `LOG_LEVEL=debug` が大文字小文字不問でパースされることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'debug'`
- **入力**: なし
- **期待結果**: `LogLevel.DEBUG` が返される
- **テストデータ**: `process.env.LOG_LEVEL = 'debug'`

#### テストケース 2.2.7: parseLogLevelFromEnv_無効な値

- **目的**: 環境変数 `LOG_LEVEL=INVALID` が無効な値の場合、デフォルト（INFO）にフォールバックすることを検証
- **前提条件**: `process.env.LOG_LEVEL = 'INVALID'`
- **入力**: なし
- **期待結果**:
  - `LogLevel.INFO` が返される
  - console.warn に `[WARNING] Invalid LOG_LEVEL: INVALID. Falling back to INFO.` が出力される
- **テストデータ**: `process.env.LOG_LEVEL = 'INVALID'`

```typescript
it('should fallback to INFO for invalid LOG_LEVEL and warn', () => {
  process.env.LOG_LEVEL = 'INVALID';
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  const logger = new ConsoleLogger();

  expect(warnSpy).toHaveBeenCalledWith('[WARNING] Invalid LOG_LEVEL: INVALID. Falling back to INFO.');

  // INFO レベルであることを検証
  const logSpy = jest.spyOn(console, 'log').mockImplementation();
  logger.info('test');
  expect(logSpy).toHaveBeenCalledWith('[INFO] test');

  warnSpy.mockRestore();
  logSpy.mockRestore();
});
```

#### テストケース 2.2.8: parseLogLevelFromEnv_未設定時

- **目的**: 環境変数 `LOG_LEVEL` が未設定の場合、デフォルト（INFO）になることを検証
- **前提条件**: `process.env.LOG_LEVEL = undefined`
- **入力**: なし
- **期待結果**:
  - `LogLevel.INFO` が返される
  - console.warn は呼ばれない（無効値ではないため）
- **テストデータ**: `process.env.LOG_LEVEL = undefined`

```typescript
it('should default to INFO when LOG_LEVEL is not set', () => {
  delete process.env.LOG_LEVEL;
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  const logger = new ConsoleLogger();

  expect(warnSpy).not.toHaveBeenCalled();

  // INFO レベルであることを検証
  const logSpy = jest.spyOn(console, 'log').mockImplementation();
  logger.info('test');
  expect(logSpy).toHaveBeenCalledWith('[INFO] test');

  warnSpy.mockRestore();
  logSpy.mockRestore();
});
```

---

### 2.3 ConsoleLogger.shouldLog() のテスト

#### テストケース 2.3.1: shouldLog_minLevel以上のレベルは出力される

- **目的**: minLevel 以上のログレベルが出力されることを検証
- **前提条件**: `minLevel = LogLevel.WARN`
- **入力**: `LogLevel.ERROR`
- **期待結果**: `true` が返される（ERROR >= WARN）
- **テストデータ**: なし

```typescript
it('should return true for levels >= minLevel', () => {
  const logger = new ConsoleLogger(LogLevel.WARN);
  const logSpy = jest.spyOn(console, 'warn').mockImplementation();
  logger.warn('test');
  expect(logSpy).toHaveBeenCalled();
  logSpy.mockRestore();
});
```

#### テストケース 2.3.2: shouldLog_minLevel未満のレベルは出力されない

- **目的**: minLevel 未満のログレベルが出力されないことを検証
- **前提条件**: `minLevel = LogLevel.WARN`
- **入力**: `LogLevel.INFO`
- **期待結果**: `false` が返される（INFO < WARN）
- **テストデータ**: なし

```typescript
it('should return false for levels < minLevel', () => {
  const logger = new ConsoleLogger(LogLevel.WARN);
  const logSpy = jest.spyOn(console, 'log').mockImplementation();
  logger.info('test');
  expect(logSpy).not.toHaveBeenCalled();
  logSpy.mockRestore();
});
```

---

### 2.4 ConsoleLogger.debug() のテスト

#### テストケース 2.4.1: debug_正常系_メッセージのみ

- **目的**: debug() がメッセージのみを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.DEBUG`
- **入力**: `message = 'Debug message'`
- **期待結果**: `console.log('[DEBUG] Debug message')` が呼ばれる
- **テストデータ**: `message = 'Debug message'`

```typescript
it('should log debug message without context', () => {
  const logger = new ConsoleLogger(LogLevel.DEBUG);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.debug('Debug message');

  expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message');
  spy.mockRestore();
});
```

#### テストケース 2.4.2: debug_正常系_メッセージとコンテキスト

- **目的**: debug() がメッセージとコンテキストを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.DEBUG`
- **入力**: `message = 'Debug message'`, `context = { key: 'value' }`
- **期待結果**: `console.log('[DEBUG] Debug message {"key":"value"}')` が呼ばれる
- **テストデータ**: `message = 'Debug message'`, `context = { key: 'value' }`

```typescript
it('should log debug message with context', () => {
  const logger = new ConsoleLogger(LogLevel.DEBUG);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.debug('Debug message', { key: 'value' });

  expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message {"key":"value"}');
  spy.mockRestore();
});
```

#### テストケース 2.4.3: debug_フィルタリング_minLevel以上で出力されない

- **目的**: minLevel が INFO の場合、debug() が出力されないことを検証
- **前提条件**: `minLevel = LogLevel.INFO`
- **入力**: `message = 'Debug message'`
- **期待結果**: `console.log` が呼ばれない
- **テストデータ**: `message = 'Debug message'`

```typescript
it('should not log debug when minLevel is INFO', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.debug('Debug message');

  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
```

#### テストケース 2.4.4: debug_境界値_空のコンテキスト

- **目的**: context が空オブジェクトの場合、コンテキストが出力されないことを検証
- **前提条件**: `minLevel = LogLevel.DEBUG`
- **入力**: `message = 'Debug message'`, `context = {}`
- **期待結果**: `console.log('[DEBUG] Debug message')` が呼ばれる（空のコンテキストは出力されない）
- **テストデータ**: `message = 'Debug message'`, `context = {}`

```typescript
it('should not log empty context', () => {
  const logger = new ConsoleLogger(LogLevel.DEBUG);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.debug('Debug message', {});

  expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message');
  spy.mockRestore();
});
```

---

### 2.5 ConsoleLogger.info() のテスト

#### テストケース 2.5.1: info_正常系_メッセージのみ

- **目的**: info() がメッセージのみを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.INFO`
- **入力**: `message = 'Info message'`
- **期待結果**: `console.log('[INFO] Info message')` が呼ばれる
- **テストデータ**: `message = 'Info message'`

```typescript
it('should log info message without context', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Info message');

  expect(spy).toHaveBeenCalledWith('[INFO] Info message');
  spy.mockRestore();
});
```

#### テストケース 2.5.2: info_正常系_メッセージとコンテキスト

- **目的**: info() がメッセージとコンテキストを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.INFO`
- **入力**: `message = 'Phase completed'`, `context = { phase: 'requirements', duration: 1234 }`
- **期待結果**: `console.log('[INFO] Phase completed {"phase":"requirements","duration":1234}')` が呼ばれる
- **テストデータ**: `message = 'Phase completed'`, `context = { phase: 'requirements', duration: 1234 }`

```typescript
it('should log info message with context', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Phase completed', { phase: 'requirements', duration: 1234 });

  expect(spy).toHaveBeenCalledWith('[INFO] Phase completed {"phase":"requirements","duration":1234}');
  spy.mockRestore();
});
```

#### テストケース 2.5.3: info_フィルタリング_minLevel以上で出力されない

- **目的**: minLevel が WARN の場合、info() が出力されないことを検証
- **前提条件**: `minLevel = LogLevel.WARN`
- **入力**: `message = 'Info message'`
- **期待結果**: `console.log` が呼ばれない
- **テストデータ**: `message = 'Info message'`

```typescript
it('should not log info when minLevel is WARN', () => {
  const logger = new ConsoleLogger(LogLevel.WARN);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Info message');

  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
```

---

### 2.6 ConsoleLogger.warn() のテスト

#### テストケース 2.6.1: warn_正常系_メッセージのみ

- **目的**: warn() がメッセージのみを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.WARN`
- **入力**: `message = 'Warning message'`
- **期待結果**: `console.warn('[WARNING] Warning message')` が呼ばれる
- **テストデータ**: `message = 'Warning message'`

```typescript
it('should log warning message without context', () => {
  const logger = new ConsoleLogger(LogLevel.WARN);
  const spy = jest.spyOn(console, 'warn').mockImplementation();

  logger.warn('Warning message');

  expect(spy).toHaveBeenCalledWith('[WARNING] Warning message');
  spy.mockRestore();
});
```

#### テストケース 2.6.2: warn_正常系_メッセージとコンテキスト

- **目的**: warn() がメッセージとコンテキストを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.WARN`
- **入力**: `message = 'Deprecated feature'`, `context = { feature: 'oldAPI' }`
- **期待結果**: `console.warn('[WARNING] Deprecated feature {"feature":"oldAPI"}')` が呼ばれる
- **テストデータ**: `message = 'Deprecated feature'`, `context = { feature: 'oldAPI' }`

```typescript
it('should log warning message with context', () => {
  const logger = new ConsoleLogger(LogLevel.WARN);
  const spy = jest.spyOn(console, 'warn').mockImplementation();

  logger.warn('Deprecated feature', { feature: 'oldAPI' });

  expect(spy).toHaveBeenCalledWith('[WARNING] Deprecated feature {"feature":"oldAPI"}');
  spy.mockRestore();
});
```

#### テストケース 2.6.3: warn_フィルタリング_minLevel以上で出力されない

- **目的**: minLevel が ERROR の場合、warn() が出力されないことを検証
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Warning message'`
- **期待結果**: `console.warn` が呼ばれない
- **テストデータ**: `message = 'Warning message'`

```typescript
it('should not log warning when minLevel is ERROR', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'warn').mockImplementation();

  logger.warn('Warning message');

  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
```

---

### 2.7 ConsoleLogger.error() のテスト

#### テストケース 2.7.1: error_正常系_メッセージのみ

- **目的**: error() がメッセージのみを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Error message'`
- **期待結果**: `console.error('[ERROR] Error message')` が呼ばれる
- **テストデータ**: `message = 'Error message'`

```typescript
it('should log error message without error object or context', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'error').mockImplementation();

  logger.error('Error message');

  expect(spy).toHaveBeenCalledWith('[ERROR] Error message');
  spy.mockRestore();
});
```

#### テストケース 2.7.2: error_正常系_メッセージとErrorオブジェクト

- **目的**: error() がメッセージとErrorオブジェクトを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Failed to commit'`, `error = new Error('Git error')`
- **期待結果**: `console.error('[ERROR] Failed to commit', error, '')` が呼ばれる
- **テストデータ**: `message = 'Failed to commit'`, `error = new Error('Git error')`

```typescript
it('should log error message with error object', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'error').mockImplementation();
  const error = new Error('Git error');

  logger.error('Failed to commit', error);

  expect(spy).toHaveBeenCalledWith('[ERROR] Failed to commit', error, '');
  spy.mockRestore();
});
```

#### テストケース 2.7.3: error_正常系_メッセージとErrorとコンテキスト

- **目的**: error() がメッセージ、Errorオブジェクト、コンテキストを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Failed to commit'`, `error = new Error('Git error')`, `context = { phase: 'implementation' }`
- **期待結果**: `console.error('[ERROR] Failed to commit', error, '{"phase":"implementation"}')` が呼ばれる
- **テストデータ**: `message = 'Failed to commit'`, `error = new Error('Git error')`, `context = { phase: 'implementation' }`

```typescript
it('should log error message with error object and context', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'error').mockImplementation();
  const error = new Error('Git error');

  logger.error('Failed to commit', error, { phase: 'implementation' });

  expect(spy).toHaveBeenCalledWith('[ERROR] Failed to commit', error, '{"phase":"implementation"}');
  spy.mockRestore();
});
```

#### テストケース 2.7.4: error_正常系_メッセージとコンテキスト（Errorなし）

- **目的**: error() がメッセージとコンテキストのみを正しく出力することを検証
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Error message'`, `error = undefined`, `context = { code: 500 }`
- **期待結果**: `console.error('[ERROR] Error message {"code":500}')` が呼ばれる
- **テストデータ**: `message = 'Error message'`, `error = undefined`, `context = { code: 500 }`

```typescript
it('should log error message with context but without error object', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'error').mockImplementation();

  logger.error('Error message', undefined, { code: 500 });

  expect(spy).toHaveBeenCalledWith('[ERROR] Error message {"code":500}');
  spy.mockRestore();
});
```

#### テストケース 2.7.5: error_フィルタリング_minLevelがERRORより大きい場合は存在しない

- **注**: ERROR は最高レベルのため、フィルタリングされるケースは存在しない
- このテストケースはスキップ

---

### 2.8 ConsoleLogger.formatContext() のテスト

#### テストケース 2.8.1: formatContext_正常系_オブジェクト

- **目的**: formatContext() が通常のオブジェクトを正しくJSON文字列に変換することを検証
- **前提条件**: なし
- **入力**: `context = { key1: 'value1', key2: 123 }`
- **期待結果**: `'{"key1":"value1","key2":123}'` が返される
- **テストデータ**: `context = { key1: 'value1', key2: 123 }`

```typescript
// formatContext() は private メソッドのため、公開メソッド経由で間接的にテスト
it('should format context as JSON string', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Test', { key1: 'value1', key2: 123 });

  expect(spy).toHaveBeenCalledWith('[INFO] Test {"key1":"value1","key2":123}');
  spy.mockRestore();
});
```

#### テストケース 2.8.2: formatContext_境界値_空オブジェクト

- **目的**: formatContext() が空オブジェクトの場合、空文字列を返すことを検証
- **前提条件**: なし
- **入力**: `context = {}`
- **期待結果**: `''` が返される
- **テストデータ**: `context = {}`

```typescript
it('should return empty string for empty context', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Test', {});

  expect(spy).toHaveBeenCalledWith('[INFO] Test');
  spy.mockRestore();
});
```

#### テストケース 2.8.3: formatContext_境界値_undefined

- **目的**: formatContext() が undefined の場合、空文字列を返すことを検証
- **前提条件**: なし
- **入力**: `context = undefined`
- **期待結果**: `''` が返される
- **テストデータ**: `context = undefined`

```typescript
it('should return empty string for undefined context', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Test', undefined);

  expect(spy).toHaveBeenCalledWith('[INFO] Test');
  spy.mockRestore();
});
```

#### テストケース 2.8.4: formatContext_異常系_循環参照

- **目的**: formatContext() が循環参照を含むオブジェクトの場合、エラーハンドリングされることを検証
- **前提条件**: なし
- **入力**: `context = { self: context }` (循環参照)
- **期待結果**: `'[Unable to serialize context]'` が返される
- **テストデータ**: 循環参照を含むオブジェクト

```typescript
it('should handle circular reference gracefully', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  const circular: any = { key: 'value' };
  circular.self = circular; // 循環参照

  logger.info('Test', circular);

  expect(spy).toHaveBeenCalledWith('[INFO] Test [Unable to serialize context]');
  spy.mockRestore();
});
```

---

### 2.9 logger シングルトンインスタンスのテスト

#### テストケース 2.9.1: logger_シングルトンインスタンスが存在する

- **目的**: `logger` シングルトンインスタンスがエクスポートされていることを検証
- **前提条件**: なし
- **入力**: なし
- **期待結果**: `logger` が ILogger インターフェースを実装している
- **テストデータ**: なし

```typescript
it('should export logger singleton instance', () => {
  expect(logger).toBeDefined();
  expect(logger.debug).toBeDefined();
  expect(logger.info).toBeDefined();
  expect(logger.warn).toBeDefined();
  expect(logger.error).toBeDefined();
});
```

#### テストケース 2.9.2: logger_デフォルトでINFOレベル

- **目的**: `logger` シングルトンインスタンスがデフォルトで INFO レベルであることを検証
- **前提条件**: `process.env.LOG_LEVEL` が未設定
- **入力**: なし
- **期待結果**:
  - `logger.info()` が出力される
  - `logger.debug()` が出力されない
- **テストデータ**: なし

```typescript
it('should default to INFO level when LOG_LEVEL is not set', () => {
  delete process.env.LOG_LEVEL;

  // 新しいモジュールインスタンスを読み込む必要があるため、
  // テストセットアップで環境変数をクリアしておく

  const infoSpy = jest.spyOn(console, 'log').mockImplementation();
  const debugSpy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Info test');
  logger.debug('Debug test');

  expect(infoSpy).toHaveBeenCalledWith('[INFO] Info test');
  expect(debugSpy).not.toHaveBeenCalledWith('[DEBUG] Debug test');

  infoSpy.mockRestore();
  debugSpy.mockRestore();
});
```

---

### 2.10 統合シナリオテスト（Unitテストの範囲内）

#### テストケース 2.10.1: 統合_各ログレベルでのフィルタリング

- **目的**: 各ログレベル設定時に、正しくフィルタリングされることを検証（要件AC-02）
- **前提条件**: なし
- **入力**: `LOG_LEVEL = WARN`
- **期待結果**:
  - `debug()` と `info()` は出力されない
  - `warn()` と `error()` は出力される
- **テストデータ**: `LOG_LEVEL = WARN`

```typescript
describe('Log level filtering integration', () => {
  it('should filter logs based on LOG_LEVEL=WARN', () => {
    const logger = new ConsoleLogger(LogLevel.WARN);
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(logSpy).not.toHaveBeenCalled(); // debug, info は出力されない
    expect(warnSpy).toHaveBeenCalledWith('[WARNING] warn');
    expect(errorSpy).toHaveBeenCalledWith('[ERROR] error');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
```

#### テストケース 2.10.2: 統合_構造化ログの出力

- **目的**: 構造化ログが正しく出力されることを検証（要件AC-03）
- **前提条件**: `minLevel = LogLevel.INFO`
- **入力**: `message = 'Phase completed'`, `context = { phase: 'requirements', duration: 1234 }`
- **期待結果**: `[INFO] Phase completed {"phase":"requirements","duration":1234}` が出力される
- **テストデータ**: `message = 'Phase completed'`, `context = { phase: 'requirements', duration: 1234 }`

```typescript
it('should log structured log with context', () => {
  const logger = new ConsoleLogger(LogLevel.INFO);
  const spy = jest.spyOn(console, 'log').mockImplementation();

  logger.info('Phase completed', { phase: 'requirements', duration: 1234 });

  expect(spy).toHaveBeenCalledWith('[INFO] Phase completed {"phase":"requirements","duration":1234}');
  spy.mockRestore();
});
```

#### テストケース 2.10.3: 統合_エラーログの出力

- **目的**: エラーログが正しく出力されることを検証（要件AC-03）
- **前提条件**: `minLevel = LogLevel.ERROR`
- **入力**: `message = 'Failed'`, `error = new Error('test error')`, `context = { phase: 'implementation' }`
- **期待結果**:
  - `[ERROR] Failed` が出力される
  - Error オブジェクトのスタックトレースが出力される
  - JSON 形式のコンテキスト `{"phase":"implementation"}` が出力される
- **テストデータ**: `message = 'Failed'`, `error = new Error('test error')`, `context = { phase: 'implementation' }`

```typescript
it('should log error with stack trace and context', () => {
  const logger = new ConsoleLogger(LogLevel.ERROR);
  const spy = jest.spyOn(console, 'error').mockImplementation();
  const error = new Error('test error');

  logger.error('Failed', error, { phase: 'implementation' });

  expect(spy).toHaveBeenCalledWith('[ERROR] Failed', error, '{"phase":"implementation"}');
  spy.mockRestore();
});
```

---

## 3. テストデータ

### 3.1 正常データ

**環境変数**:
- `LOG_LEVEL = 'DEBUG'`
- `LOG_LEVEL = 'INFO'`
- `LOG_LEVEL = 'WARN'`
- `LOG_LEVEL = 'WARNING'`
- `LOG_LEVEL = 'ERROR'`

**ログメッセージ**:
- `'Starting workflow...'`
- `'Phase completed'`
- `'Deprecated feature'`
- `'Failed to commit'`

**コンテキスト**:
- `{ phase: 'requirements', duration: 1234 }`
- `{ feature: 'oldAPI' }`
- `{ phase: 'implementation' }`
- `{ key1: 'value1', key2: 123 }`

**Errorオブジェクト**:
- `new Error('Git error')`
- `new Error('test error')`

### 3.2 異常データ

**環境変数**:
- `LOG_LEVEL = 'INVALID'`
- `LOG_LEVEL = undefined`

**コンテキスト**:
- 循環参照を含むオブジェクト: `{ self: circular }`

### 3.3 境界値データ

**コンテキスト**:
- 空オブジェクト: `{}`
- undefined: `undefined`

**ログメッセージ**:
- 空文字列: `''`（想定外だが、テスト対象）
- 非常に長い文字列: `'a'.repeat(10000)`（想定外だが、パフォーマンステスト用）

---

## 4. テスト環境要件

### 4.1 必要なテスト環境

- **ローカル開発環境**: Node.js 20 以上、npm 10 以上
- **CI/CD環境**: GitHub Actions（既存のCI/CD設定を使用）

### 4.2 必要な外部サービス・データベース

**なし**

- Loggerクラスは外部依存がない（Node.js標準APIのみ使用）
- データベース接続不要
- 外部APIコール不要

### 4.3 モック/スタブの必要性

**必要なモック**:

1. **console.log のモック**
   - `jest.spyOn(console, 'log').mockImplementation()`
   - 目的: ログ出力を検証するため

2. **console.warn のモック**
   - `jest.spyOn(console, 'warn').mockImplementation()`
   - 目的: 警告ログ出力を検証するため

3. **console.error のモック**
   - `jest.spyOn(console, 'error').mockImplementation()`
   - 目的: エラーログ出力を検証するため

4. **process.env.LOG_LEVEL のモック**
   - テストケースごとに `process.env.LOG_LEVEL` を設定・クリア
   - 目的: 環境変数読み込みをテストするため

**モック作成方法**:

```typescript
beforeEach(() => {
  // 環境変数をクリア
  delete process.env.LOG_LEVEL;

  // console のスパイをクリア
  jest.restoreAllMocks();
});

afterEach(() => {
  // テスト終了後にモックを復元
  jest.restoreAllMocks();
});
```

### 4.4 テスト実行コマンド

```bash
# ユニットテスト実行
npm run test:unit

# カバレッジレポート生成
npm run test:unit -- --coverage

# 特定のテストファイルのみ実行
npm run test:unit tests/unit/core/logger.test.ts

# ウォッチモード（開発中）
npm run test:unit -- --watch
```

### 4.5 カバレッジ目標

**要件**: カバレッジ 80% 以上（Requirements Document FR-06-5）

**対象ファイル**: `src/core/logger.ts`

**カバレッジ指標**:
- **Statements**: 80% 以上
- **Branches**: 80% 以上
- **Functions**: 100%（全メソッドをテスト）
- **Lines**: 80% 以上

---

## 5. 品質ゲート確認

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **テスト戦略**: UNIT_ONLY
- **該当セクション**: セクション2「Unitテストシナリオ」
- **確認事項**:
  - ユニットテストシナリオのみを作成（統合テスト、BDDテストは作成していない）
  - Design Document セクション3「テスト戦略判断」の判断根拠に沿っている
  - 外部依存がない機能のため、ユニットテストのみで十分

### ✅ 主要な正常系がカバーされている

**カバーされている正常系**:

1. **LogLevel enum の値定義**（テストケース 2.1.1）
2. **環境変数のパース**（テストケース 2.2.1 ~ 2.2.6）
3. **各ログメソッドの正常出力**:
   - debug（テストケース 2.4.1, 2.4.2）
   - info（テストケース 2.5.1, 2.5.2）
   - warn（テストケース 2.6.1, 2.6.2）
   - error（テストケース 2.7.1, 2.7.2, 2.7.3, 2.7.4）
4. **構造化ログの出力**（テストケース 2.10.2）
5. **logger シングルトンインスタンス**（テストケース 2.9.1, 2.9.2）

**要件との対応**:
- FR-01: Logger抽象化の実装 → テストケース 2.1.1, 2.9.1
- FR-02: ログレベルフィルタリング → テストケース 2.2.x, 2.3.x, 2.10.1
- FR-03: 構造化ログのサポート → テストケース 2.4.2, 2.5.2, 2.6.2, 2.7.3, 2.8.1, 2.10.2
- FR-05: ログフォーマットの統一 → 全テストケース（各メソッドで `[DEBUG]`, `[INFO]`, `[WARNING]`, `[ERROR]` を検証）

### ✅ 主要な異常系がカバーされている

**カバーされている異常系**:

1. **無効な環境変数**（テストケース 2.2.7）
   - `LOG_LEVEL=INVALID` の場合、デフォルト（INFO）にフォールバック
   - console.warn で警告メッセージ出力

2. **環境変数未設定**（テストケース 2.2.8）
   - `LOG_LEVEL` が未設定の場合、デフォルト（INFO）になる

3. **循環参照の処理**（テストケース 2.8.4）
   - context に循環参照が含まれる場合、`[Unable to serialize context]` を返す

4. **ログレベルフィルタリング**（テストケース 2.4.3, 2.5.3, 2.6.3）
   - minLevel 未満のログが出力されないことを検証

**リスクとの対応**:
- リスク「console呼び出しの置き換え漏れ」→ テストで既存フォーマット維持を検証
- リスク「既存機能への影響」→ テストで後方互換性を検証
- リスク「パフォーマンス低下」→ shouldLog() による早期リターンを検証
- リスク「テストコードへの影響」→ logger シングルトンのテスト（既存テストとの互換性）

### ✅ 期待結果が明確である

**期待結果の明確性**:

- すべてのテストケースで「期待結果」セクションを記載
- 具体的な出力内容を記載（例: `console.log('[INFO] Info message')`）
- モック呼び出し検証の具体的なアサーション記載
- Given-When-Then 形式ではないが、テストケース形式で明確に記述

**例**:
```typescript
// テストケース 2.5.1 より
expect(spy).toHaveBeenCalledWith('[INFO] Info message');
```

**検証可能性**:
- すべての期待結果は Jest のアサーションで検証可能
- console のモックを使用して出力内容を検証可能
- カバレッジレポートで網羅性を確認可能

---

## 6. トレーサビリティマトリクス

| 要件定義書 | テストシナリオ |
|----------|--------------|
| **FR-01: Logger抽象化の実装** | |
| FR-01-1: LogLevel 列挙型を定義 | テストケース 2.1.1 |
| FR-01-2: ILogger インターフェースを定義 | テストケース 2.9.1（間接的） |
| FR-01-3: ConsoleLogger クラスを実装 | テストケース 2.4.x ~ 2.7.x |
| FR-01-4: シングルトンインスタンス logger をエクスポート | テストケース 2.9.1, 2.9.2 |
| **FR-02: ログレベルフィルタリング** | |
| FR-02-1: 環境変数 LOG_LEVEL を読み込む | テストケース 2.2.1 ~ 2.2.8 |
| FR-02-2: LOG_LEVEL 以下のレベルのログのみを出力 | テストケース 2.3.1, 2.3.2, 2.10.1 |
| FR-02-3: 無効な LOG_LEVEL 値の場合、WARNING を出力してフォールバック | テストケース 2.2.7 |
| **FR-03: 構造化ログのサポート** | |
| FR-03-1: context パラメータを受け取る | テストケース 2.4.2, 2.5.2, 2.6.2 |
| FR-03-2: error と context パラメータを受け取る | テストケース 2.7.2, 2.7.3, 2.7.4 |
| FR-03-3: コンテキスト情報を JSON 形式で出力 | テストケース 2.8.1, 2.10.2 |
| FR-03-4: Error オブジェクトはスタックトレースを含めて出力 | テストケース 2.7.2, 2.7.3, 2.10.3 |
| **FR-05: ログフォーマットの統一** | |
| FR-05-1: debug メソッドは `[DEBUG]` プレフィックス | テストケース 2.4.1, 2.4.2 |
| FR-05-2: info メソッドは `[INFO]` プレフィックス | テストケース 2.5.1, 2.5.2 |
| FR-05-3: warn メソッドは `[WARNING]` プレフィックス | テストケース 2.6.1, 2.6.2 |
| FR-05-4: error メソッドは `[ERROR]` プレフィックス | テストケース 2.7.1 ~ 2.7.4 |
| **受け入れ基準** | |
| AC-01: Logger抽象化の実装 | テストケース 2.1.1, 2.9.1 |
| AC-02: ログレベルフィルタリング | テストケース 2.2.x, 2.3.x, 2.10.1 |
| AC-03: 構造化ログのサポート | テストケース 2.10.2, 2.10.3 |
| AC-05: ユニットテストの実装 | すべてのテストケース |
| **非機能要件** | |
| NFR-01-1: オーバーヘッド 1ms 未満 | テストケース 2.3.1（shouldLog による早期リターン） |
| NFR-01-2: LogLevel フィルタリングで不要なログ生成を抑制 | テストケース 2.4.3, 2.5.3, 2.6.3 |
| NFR-01-3: 循環参照を適切に処理 | テストケース 2.8.4 |
| NFR-03-2: 無効な LOG_LEVEL 値でも正常動作 | テストケース 2.2.7, 2.2.8 |
| NFR-05-3: カバレッジ 80% 以上 | セクション 4.5（カバレッジ目標） |

---

## 7. テスト実装の推奨順序

Phase 5（Test Code Implementation）でテストコードを実装する際の推奨順序：

### Step 1: テスト環境セットアップ（0.5時間）

1. `tests/unit/core/logger.test.ts` ファイル作成
2. Jest セットアップ（beforeEach, afterEach でモッククリア）
3. import 文の追加

```typescript
import { LogLevel, ILogger, ConsoleLogger, logger } from '@/core/logger';

describe('Logger', () => {
  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // テストケースをここに追加
});
```

### Step 2: 基本機能のテスト（0.5時間）

1. LogLevel enum のテスト（テストケース 2.1.1）
2. logger シングルトンのテスト（テストケース 2.9.1, 2.9.2）

### Step 3: 環境変数パースのテスト（0.5時間）

1. 正常系のテスト（テストケース 2.2.1 ~ 2.2.6）
2. 異常系のテスト（テストケース 2.2.7, 2.2.8）

### Step 4: 各ログメソッドのテスト（0.5時間）

1. debug() のテスト（テストケース 2.4.1 ~ 2.4.4）
2. info() のテスト（テストケース 2.5.1 ~ 2.5.3）
3. warn() のテスト（テストケース 2.6.1 ~ 2.6.3）
4. error() のテスト（テストケース 2.7.1 ~ 2.7.4）

### Step 5: formatContext() のテスト（0.25時間）

1. 正常系のテスト（テストケース 2.8.1）
2. 境界値のテスト（テストケース 2.8.2, 2.8.3）
3. 異常系のテスト（テストケース 2.8.4）

### Step 6: 統合シナリオのテスト（0.25時間）

1. ログレベルフィルタリング統合テスト（テストケース 2.10.1）
2. 構造化ログ統合テスト（テストケース 2.10.2）
3. エラーログ統合テスト（テストケース 2.10.3）

### Step 7: カバレッジ確認と修正（0.5時間）

1. `npm run test:unit -- --coverage` 実行
2. カバレッジレポート確認（80% 以上）
3. 不足しているテストケースを追加

**合計見積もり**: 2時間（Planning Document と一致）

---

## 8. 参照ドキュメント

- **Planning Document**: `.ai-workflow/issue-50/00_planning/output/planning.md`
- **Requirements Document**: `.ai-workflow/issue-50/01_requirements/output/requirements.md`
- **Design Document**: `.ai-workflow/issue-50/02_design/output/design.md`
- **GitHub Issue**: https://github.com/tielec/ai-workflow-agent/issues/50
- **CLAUDE.md**: プロジェクトの全体方針とコーディングガイドライン
- **ARCHITECTURE.md**: アーキテクチャ設計思想

---

**作成者**: AI Workflow Agent (Phase 3: Test Scenario)
**レビュー状態**: Pending
**次フェーズ**: Phase 4 (Implementation)
