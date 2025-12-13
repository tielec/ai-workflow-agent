/**
 * LogLevel - Defines the severity levels for logging
 * Lower numeric values indicate more detailed logging
 */
export enum LogLevel {
  DEBUG = 0, // Debug information for troubleshooting
  INFO = 1, // General informational messages
  WARN = 2, // Warning messages
  ERROR = 3, // Error messages
}

/**
 * ILogger - Logger interface for abstraction
 * Enables future implementations (FileLogger, CloudLogger, etc.)
 */
export interface ILogger {
  /**
   * Log a debug message
   * @param message - The log message
   * @param context - Optional structured context data
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an informational message
   * @param message - The log message
   * @param context - Optional structured context data
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a warning message
   * @param message - The log message
   * @param context - Optional structured context data
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an error message
   * @param message - The log message
   * @param error - Optional Error object with stack trace
   * @param context - Optional structured context data
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * ConsoleLogger - Implementation of ILogger using console methods
 * Supports log level filtering via LOG_LEVEL environment variable
 */
export class ConsoleLogger implements ILogger {
  private readonly minLevel: LogLevel;

  /**
   * Constructor
   * @param minLevel - Minimum log level to output (defaults to LOG_LEVEL env var or INFO)
   */
  constructor(minLevel?: LogLevel) {
    if (minLevel !== undefined) {
      this.minLevel = minLevel;
    } else {
      this.minLevel = this.parseLogLevelFromEnv();
    }
  }

  /**
   * Parse LOG_LEVEL environment variable
   * @returns LogLevel enum value
   */
  private parseLogLevelFromEnv(): LogLevel {
    const rawLevel = process.env.LOG_LEVEL ?? '';
    const levelStr = rawLevel.trim().toUpperCase();

    if (!levelStr) {
      return LogLevel.INFO;
    }

    switch (levelStr) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
      case 'WARNING':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        console.warn(
          `[WARNING] Invalid LOG_LEVEL: ${rawLevel}. Falling back to INFO.`,
        );
        return LogLevel.INFO;
    }
  }

  /**
   * Check if a log level should be output
   * @param level - The log level to check
   * @returns true if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  /**
   * Format context data as JSON string
   * @param context - Context object
   * @returns JSON string or empty string
   */
  private formatContext(context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return '';
    }
    try {
      return JSON.stringify(context);
    } catch (error) {
      // Handle circular references and other serialization errors
      return '[Unable to serialize context]';
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const contextStr = this.formatContext(context);
    console.log(`[DEBUG] ${message}${contextStr ? ' ' + contextStr : ''}`);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const contextStr = this.formatContext(context);
    console.log(`[INFO] ${message}${contextStr ? ' ' + contextStr : ''}`);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const contextStr = this.formatContext(context);
    console.warn(`[WARNING] ${message}${contextStr ? ' ' + contextStr : ''}`);
  }

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const contextStr = this.formatContext(context);
    if (error) {
      console.error(`[ERROR] ${message}`, error, contextStr || '');
    } else {
      console.error(`[ERROR] ${message}${contextStr ? ' ' + contextStr : ''}`);
    }
  }
}

/**
 * Default logger instance
 * Automatically reads LOG_LEVEL from environment variable
 */
export const logger: ILogger = new ConsoleLogger();
