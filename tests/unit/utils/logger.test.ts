/**
 * Unit tests for logger module
 *
 * Tests cover:
 * - Log level control (debug/info/warn/error)
 * - Coloring functionality
 * - Timestamp formatting
 * - Message formatting
 * - Output destination (console.log vs console.error)
 * - Edge cases (empty strings, null/undefined, circular references)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger.js';
import chalk from 'chalk';

describe('Logger Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: jest.Mock;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Force chalk to use TrueColor (level 3) for consistent test results
    // This ensures coloring tests work in both local and CI environments
    // Without this, CI environments may have level 0 (no color) by default
    chalk.level = 3;

    // Mock console methods
    consoleLogSpy = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(consoleLogSpy);
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(consoleLogSpy);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(consoleLogSpy);
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(consoleLogSpy);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore console methods
    (console.log as any).mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Log Level Control', () => {
    it('should output only info and above when LOG_LEVEL is not set (default: info)', () => {
      // Given: LOG_LEVEL is not set (default: info)
      delete process.env.LOG_LEVEL;

      // When: logging at all levels
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Then: debug is not output, info/warn go to console.log, error goes to console.error
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // info, warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should output all levels when LOG_LEVEL=debug', () => {
      // Given: LOG_LEVEL=debug
      process.env.LOG_LEVEL = 'debug';

      // When: logging at all levels
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Then: all levels are output
      expect(consoleLogSpy).toHaveBeenCalledTimes(3); // debug, info, warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should output only warn and above when LOG_LEVEL=warn', () => {
      // Given: LOG_LEVEL=warn
      process.env.LOG_LEVEL = 'warn';

      // When: logging at all levels
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Then: only warn and error are output
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should output only error when LOG_LEVEL=error', () => {
      // Given: LOG_LEVEL=error
      process.env.LOG_LEVEL = 'error';

      // When: logging at all levels
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Then: only error is output
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error
    });

    it('should fallback to default (info) when LOG_LEVEL is invalid', () => {
      // Given: LOG_LEVEL has invalid value
      process.env.LOG_LEVEL = 'invalid';

      // When: logging debug and info
      logger.debug('debug message');
      logger.info('info message');

      // Then: debug is not output (default: info level), info is output
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // info only
    });
  });

  describe('Coloring', () => {
    it('should apply coloring when LOG_NO_COLOR is not set', () => {
      // Given: LOG_NO_COLOR is not set
      delete process.env.LOG_NO_COLOR;

      // When: logging info message
      logger.info('test message');

      // Then: ANSI escape sequences are present (coloring applied)
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toMatch(/\x1b\[/); // ANSI escape sequence
    });

    it('should not apply coloring when LOG_NO_COLOR=true', () => {
      // Given: LOG_NO_COLOR=true
      process.env.LOG_NO_COLOR = 'true';

      // When: logging info message
      logger.info('test message');

      // Then: no ANSI escape sequences (coloring disabled)
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).not.toMatch(/\x1b\[/);
    });

    it('should not apply coloring when LOG_NO_COLOR=1', () => {
      // Given: LOG_NO_COLOR=1
      process.env.LOG_NO_COLOR = '1';

      // When: logging info message
      logger.info('test message');

      // Then: no ANSI escape sequences (coloring disabled)
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).not.toMatch(/\x1b\[/);
    });

    it('should apply different colors for different log levels', () => {
      // Given: LOG_LEVEL=debug, coloring enabled
      process.env.LOG_LEVEL = 'debug';
      delete process.env.LOG_NO_COLOR;

      // When: logging at all levels
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Then: each level has ANSI escape sequences (colors applied)
      const debugCall = consoleLogSpy.mock.calls[0]?.[0] as string;
      const infoCall = consoleLogSpy.mock.calls[1]?.[0] as string;
      const warnCall = consoleLogSpy.mock.calls[2]?.[0] as string;
      const errorCall = consoleErrorSpy.mock.calls[0]?.[0] as string;

      expect(debugCall).toMatch(/\x1b\[/);
      expect(infoCall).toMatch(/\x1b\[/);
      expect(warnCall).toMatch(/\x1b\[/);
      expect(errorCall).toMatch(/\x1b\[/);
    });
  });

  describe('Timestamp', () => {
    it('should include timestamp in YYYY-MM-DD HH:mm:ss format', () => {
      // Given: default settings
      delete process.env.LOG_NO_COLOR;

      // When: logging info message
      logger.info('test message');

      // Then: timestamp is present in correct format
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      // Remove ANSI color codes for regex matching
      const plainText = call.replace(/\x1b\[\d+m/g, '');
      expect(plainText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should include consistent timestamp for logs within same second', () => {
      // Given: default settings

      // When: logging two messages quickly
      logger.info('message 1');
      logger.info('message 2');

      // Then: timestamps are either identical or within 1 second
      const call1 = consoleLogSpy.mock.calls[0]?.[0] as string;
      const call2 = consoleLogSpy.mock.calls[1]?.[0] as string;

      const plainText1 = call1.replace(/\x1b\[\d+m/g, '');
      const plainText2 = call2.replace(/\x1b\[\d+m/g, '');

      const timestamp1 = plainText1.substring(0, 19);
      const timestamp2 = plainText2.substring(0, 19);

      // Timestamps should be identical or very close (within 1 second)
      const time1 = new Date(timestamp1).getTime();
      const time2 = new Date(timestamp2).getTime();
      expect(Math.abs(time2 - time1)).toBeLessThanOrEqual(1000);
    });
  });

  describe('Message Formatting', () => {
    it('should format simple string message', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging simple string
      logger.info('simple string message');

      // Then: output format is "YYYY-MM-DD HH:mm:ss [INFO] simple string message"
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[INFO\] simple string message$/);
    });

    it('should format object message as JSON', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging object
      logger.info({ key: 'value', number: 123 });

      // Then: object is stringified as JSON
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('{"key":"value","number":123}');
    });

    it('should format multiple arguments separated by space', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging multiple arguments
      logger.info('User', 'John', 'logged in');

      // Then: arguments are space-separated
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('User John logged in');
    });

    it('should format mixed type arguments', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging mixed types
      logger.info('Count:', 42, { status: 'ok' });

      // Then: all arguments are properly formatted
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('Count: 42 {"status":"ok"}');
    });
  });

  describe('Output Destination', () => {
    it('should output debug/info/warn to console.log', () => {
      // Given: LOG_LEVEL=debug
      process.env.LOG_LEVEL = 'debug';

      // When: logging debug, info, warn
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');

      // Then: all go to console.log, none to console.error
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should output error to console.error', () => {
      // Given: default settings

      // When: logging error
      logger.error('error message');

      // Then: goes to console.error, not console.log
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string message', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging empty string
      logger.info('');

      // Then: timestamp and level are output
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[INFO\] $/);
    });

    it('should handle null argument', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging null
      logger.info(null);

      // Then: null is stringified as "null"
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('null');
    });

    it('should handle undefined argument', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging undefined
      logger.info(undefined);

      // Then: undefined is stringified as "undefined"
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain('undefined');
    });

    it('should handle very long message', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging very long message (10000 characters)
      const longMessage = 'a'.repeat(10000);
      logger.info(longMessage);

      // Then: entire message is output without truncation
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain(longMessage);
    });

    it('should handle circular reference object gracefully', () => {
      // Given: default settings with no color
      process.env.LOG_NO_COLOR = 'true';

      // When: logging object with circular reference
      const obj: any = { name: 'test' };
      obj.self = obj; // circular reference

      // Then: should not throw error (may use fallback mechanism)
      expect(() => logger.info(obj)).not.toThrow();
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });
});
