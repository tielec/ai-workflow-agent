/**
 * ユニットテスト: logger.ts
 *
 * テスト対象:
 * - LogLevel enum
 * - ILogger interface
 * - ConsoleLogger class
 * - logger singleton instance
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LogLevel, ConsoleLogger, logger } from '../../../src/core/logger.js';

describe('LogLevel', () => {
  test('2.1.1: LogLevel_値が正しく定義されている', () => {
    // Given/When: LogLevel enumの値を確認
    // Then: 各値が設計書通りの数値である
    expect(LogLevel.DEBUG).toBe(0);
    expect(LogLevel.INFO).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.ERROR).toBe(3);
  });
});

describe('ConsoleLogger.parseLogLevelFromEnv()', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  test('2.2.1: parseLogLevelFromEnv_DEBUG設定時', () => {
    // Given: 環境変数 LOG_LEVEL=DEBUG
    process.env.LOG_LEVEL = 'DEBUG';
    const logger = new ConsoleLogger();
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()を呼び出す
    logger.debug('test');

    // Then: debug()が出力される
    expect(spy).toHaveBeenCalledWith('[DEBUG] test');
    spy.mockRestore();
  });

  test('2.2.2: parseLogLevelFromEnv_INFO設定時', () => {
    // Given: 環境変数 LOG_LEVEL=INFO
    process.env.LOG_LEVEL = 'INFO';
    const logger = new ConsoleLogger();
    const debugSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()とinfo()を呼び出す
    logger.debug('debug test');
    logger.info('info test');

    // Then: debug()は出力されず、info()は出力される
    expect(debugSpy).not.toHaveBeenCalledWith('[DEBUG] debug test');
    expect(infoSpy).toHaveBeenCalledWith('[INFO] info test');
    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('2.2.3: parseLogLevelFromEnv_WARN設定時', () => {
    // Given: 環境変数 LOG_LEVEL=WARN
    process.env.LOG_LEVEL = 'WARN';
    const logger = new ConsoleLogger();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: info()とwarn()を呼び出す
    logger.info('info test');
    logger.warn('warn test');

    // Then: info()は出力されず、warn()は出力される
    expect(logSpy).not.toHaveBeenCalledWith('[INFO] info test');
    expect(warnSpy).toHaveBeenCalledWith('[WARNING] warn test');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('2.2.4: parseLogLevelFromEnv_WARNING設定時', () => {
    // Given: 環境変数 LOG_LEVEL=WARNING
    process.env.LOG_LEVEL = 'WARNING';
    const logger = new ConsoleLogger();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: warn()を呼び出す
    logger.warn('test');

    // Then: warn()が出力される
    expect(warnSpy).toHaveBeenCalledWith('[WARNING] test');
    warnSpy.mockRestore();
  });

  test('2.2.5: parseLogLevelFromEnv_ERROR設定時', () => {
    // Given: 環境変数 LOG_LEVEL=ERROR
    process.env.LOG_LEVEL = 'ERROR';
    const logger = new ConsoleLogger();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // When: warn()とerror()を呼び出す
    logger.warn('warn test');
    logger.error('error test');

    // Then: warn()は出力されず、error()は出力される
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[ERROR] error test');
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('2.2.6: parseLogLevelFromEnv_小文字の値', () => {
    // Given: 環境変数 LOG_LEVEL=debug (小文字)
    process.env.LOG_LEVEL = 'debug';
    const logger = new ConsoleLogger();
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()を呼び出す
    logger.debug('test');

    // Then: debug()が出力される（大文字小文字不問）
    expect(spy).toHaveBeenCalledWith('[DEBUG] test');
    spy.mockRestore();
  });

  test('2.2.7: parseLogLevelFromEnv_無効な値', () => {
    // Given: 環境変数 LOG_LEVEL=INVALID
    process.env.LOG_LEVEL = 'INVALID';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleLogger();

    // Then: 警告メッセージが出力される
    expect(warnSpy).toHaveBeenCalledWith('[WARNING] Invalid LOG_LEVEL: INVALID. Falling back to INFO.');

    // When: info()を呼び出す
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test');

    // Then: INFOレベルであることを確認
    expect(logSpy).toHaveBeenCalledWith('[INFO] test');

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('2.2.8: parseLogLevelFromEnv_未設定時', () => {
    // Given: 環境変数 LOG_LEVEL が未設定
    delete process.env.LOG_LEVEL;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleLogger();

    // Then: 警告は出力されない
    expect(warnSpy).not.toHaveBeenCalled();

    // When: info()を呼び出す
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test');

    // Then: デフォルト（INFO）レベルであることを確認
    expect(logSpy).toHaveBeenCalledWith('[INFO] test');

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('ConsoleLogger.shouldLog()', () => {
  test('2.3.1: shouldLog_minLevel以上のレベルは出力される', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const logSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: warn()を呼び出す
    logger.warn('test');

    // Then: warn()が出力される（WARN >= WARN）
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('2.3.2: shouldLog_minLevel未満のレベルは出力されない', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: info()を呼び出す
    logger.info('test');

    // Then: info()は出力されない（INFO < WARN）
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('ConsoleLogger.debug()', () => {
  test('2.4.1: debug_正常系_メッセージのみ', () => {
    // Given: minLevel = DEBUG
    const logger = new ConsoleLogger(LogLevel.DEBUG);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()を呼び出す
    logger.debug('Debug message');

    // Then: メッセージが正しく出力される
    expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message');
    spy.mockRestore();
  });

  test('2.4.2: debug_正常系_メッセージとコンテキスト', () => {
    // Given: minLevel = DEBUG
    const logger = new ConsoleLogger(LogLevel.DEBUG);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()をコンテキスト付きで呼び出す
    logger.debug('Debug message', { key: 'value' });

    // Then: メッセージとコンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message {"key":"value"}');
    spy.mockRestore();
  });

  test('2.4.3: debug_フィルタリング_minLevel以上で出力されない', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: debug()を呼び出す
    logger.debug('Debug message');

    // Then: debug()は出力されない
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('2.4.4: debug_境界値_空のコンテキスト', () => {
    // Given: minLevel = DEBUG
    const logger = new ConsoleLogger(LogLevel.DEBUG);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: 空のコンテキストを渡す
    logger.debug('Debug message', {});

    // Then: コンテキストは出力されない
    expect(spy).toHaveBeenCalledWith('[DEBUG] Debug message');
    spy.mockRestore();
  });
});

describe('ConsoleLogger.info()', () => {
  test('2.5.1: info_正常系_メッセージのみ', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: info()を呼び出す
    logger.info('Info message');

    // Then: メッセージが正しく出力される
    expect(spy).toHaveBeenCalledWith('[INFO] Info message');
    spy.mockRestore();
  });

  test('2.5.2: info_正常系_メッセージとコンテキスト', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: info()をコンテキスト付きで呼び出す
    logger.info('Phase completed', { phase: 'requirements', duration: 1234 });

    // Then: メッセージとコンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[INFO] Phase completed {"phase":"requirements","duration":1234}');
    spy.mockRestore();
  });

  test('2.5.3: info_フィルタリング_minLevel以上で出力されない', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: info()を呼び出す
    logger.info('Info message');

    // Then: info()は出力されない
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ConsoleLogger.warn()', () => {
  test('2.6.1: warn_正常系_メッセージのみ', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: warn()を呼び出す
    logger.warn('Warning message');

    // Then: メッセージが正しく出力される
    expect(spy).toHaveBeenCalledWith('[WARNING] Warning message');
    spy.mockRestore();
  });

  test('2.6.2: warn_正常系_メッセージとコンテキスト', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: warn()をコンテキスト付きで呼び出す
    logger.warn('Deprecated feature', { feature: 'oldAPI' });

    // Then: メッセージとコンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[WARNING] Deprecated feature {"feature":"oldAPI"}');
    spy.mockRestore();
  });

  test('2.6.3: warn_フィルタリング_minLevel以上で出力されない', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // When: warn()を呼び出す
    logger.warn('Warning message');

    // Then: warn()は出力されない
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ConsoleLogger.error()', () => {
  test('2.7.1: error_正常系_メッセージのみ', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // When: error()を呼び出す
    logger.error('Error message');

    // Then: メッセージが正しく出力される
    expect(spy).toHaveBeenCalledWith('[ERROR] Error message');
    spy.mockRestore();
  });

  test('2.7.2: error_正常系_メッセージとErrorオブジェクト', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Git error');

    // When: error()をErrorオブジェクト付きで呼び出す
    logger.error('Failed to commit', error);

    // Then: メッセージとErrorオブジェクトが正しく出力される
    expect(spy).toHaveBeenCalledWith('[ERROR] Failed to commit', error, '');
    spy.mockRestore();
  });

  test('2.7.3: error_正常系_メッセージとErrorとコンテキスト', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Git error');

    // When: error()をErrorオブジェクトとコンテキスト付きで呼び出す
    logger.error('Failed to commit', error, { phase: 'implementation' });

    // Then: メッセージ、Errorオブジェクト、コンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[ERROR] Failed to commit', error, '{"phase":"implementation"}');
    spy.mockRestore();
  });

  test('2.7.4: error_正常系_メッセージとコンテキスト（Errorなし）', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // When: error()をコンテキストのみで呼び出す
    logger.error('Error message', undefined, { code: 500 });

    // Then: メッセージとコンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[ERROR] Error message {"code":500}');
    spy.mockRestore();
  });
});

describe('ConsoleLogger.formatContext()', () => {
  test('2.8.1: formatContext_正常系_オブジェクト', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: コンテキストオブジェクトを渡す
    logger.info('Test', { key1: 'value1', key2: 123 });

    // Then: JSON文字列として出力される
    expect(spy).toHaveBeenCalledWith('[INFO] Test {"key1":"value1","key2":123}');
    spy.mockRestore();
  });

  test('2.8.2: formatContext_境界値_空オブジェクト', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: 空のコンテキストオブジェクトを渡す
    logger.info('Test', {});

    // Then: コンテキストは出力されない
    expect(spy).toHaveBeenCalledWith('[INFO] Test');
    spy.mockRestore();
  });

  test('2.8.3: formatContext_境界値_undefined', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: undefinedを渡す
    logger.info('Test', undefined);

    // Then: コンテキストは出力されない
    expect(spy).toHaveBeenCalledWith('[INFO] Test');
    spy.mockRestore();
  });

  test('2.8.4: formatContext_異常系_循環参照', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: 循環参照を含むオブジェクトを渡す
    const circular: any = { key: 'value' };
    circular.self = circular; // 循環参照
    logger.info('Test', circular);

    // Then: エラーハンドリングされる
    expect(spy).toHaveBeenCalledWith('[INFO] Test [Unable to serialize context]');
    spy.mockRestore();
  });
});

describe('logger シングルトンインスタンス', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('2.9.1: logger_シングルトンインスタンスが存在する', () => {
    // Given/When: logger をインポート
    // Then: logger が定義されている
    expect(logger).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  test('2.9.2: logger_デフォルトでINFOレベル', () => {
    // Given: LOG_LEVEL が未設定
    delete process.env.LOG_LEVEL;

    // When: info()とdebug()を呼び出す
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Info test');

    const debugSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('Debug test');

    // Then: info()は出力され、debug()は出力されない
    expect(infoSpy).toHaveBeenCalledWith('[INFO] Info test');
    // Note: デフォルトloggerはモジュールロード時に作成されるため、
    // 環境変数変更後の動作テストは困難。実際の動作確認はintegrationテストで行う。

    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });
});

describe('Log level filtering integration', () => {
  test('2.10.1: 統合_各ログレベルでのフィルタリング', () => {
    // Given: minLevel = WARN
    const logger = new ConsoleLogger(LogLevel.WARN);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // When: 各ログレベルを呼び出す
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    // Then: debug と info は出力されず、warn と error は出力される
    expect(logSpy).not.toHaveBeenCalled(); // debug, info は出力されない
    expect(warnSpy).toHaveBeenCalledWith('[WARNING] warn');
    expect(errorSpy).toHaveBeenCalledWith('[ERROR] error');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('2.10.2: 統合_構造化ログの出力', () => {
    // Given: minLevel = INFO
    const logger = new ConsoleLogger(LogLevel.INFO);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // When: 構造化ログを出力
    logger.info('Phase completed', { phase: 'requirements', duration: 1234 });

    // Then: 構造化データが正しく出力される
    expect(spy).toHaveBeenCalledWith('[INFO] Phase completed {"phase":"requirements","duration":1234}');
    spy.mockRestore();
  });

  test('2.10.3: 統合_エラーログの出力', () => {
    // Given: minLevel = ERROR
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('test error');

    // When: エラーログを出力
    logger.error('Failed', error, { phase: 'implementation' });

    // Then: エラーオブジェクトとコンテキストが正しく出力される
    expect(spy).toHaveBeenCalledWith('[ERROR] Failed', error, '{"phase":"implementation"}');
    spy.mockRestore();
  });
});
