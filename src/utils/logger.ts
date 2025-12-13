import chalk from 'chalk';
import { config } from '../core/config.js';

/**
 * ログレベル定義
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * ログレベルの数値マッピング（優先度順）
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 現在のログレベルを取得
 * @returns 現在のログレベル（デフォルト: info）
 */
function getCurrentLogLevel(): LogLevel {
  const envLevel = config.getLogLevel().toLowerCase() as LogLevel;
  return envLevel in LOG_LEVELS ? envLevel : 'info';
}

/**
 * カラーリング無効化判定
 * @returns カラーリングが無効化されているかどうか
 */
function isColorDisabled(): boolean {
  return config.getLogNoColor();
}

/**
 * タイムスタンプを生成
 * @returns YYYY-MM-DD HH:mm:ss 形式のタイムスタンプ
 */
const getTimestamp = (): string => {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
};

/**
 * ログメッセージをフォーマット
 * @param level - ログレベル
 * @param args - ログメッセージ引数
 * @returns フォーマット済みメッセージ
 */
function formatMessage(level: LogLevel, ...args: unknown[]): string {
  const levelStr = level.toUpperCase().padEnd(5, ' ');
  const message = args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          // 循環参照などでJSON.stringifyが失敗した場合
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  // デフォルトでタイムスタンプを含める。必要に応じて AI_WORKFLOW_LOG_TIMESTAMP=0 で無効化。
  const includeTimestamp = process.env.AI_WORKFLOW_LOG_TIMESTAMP !== '0';
  const prefix = includeTimestamp ? `${getTimestamp()} [${levelStr}]` : `[${levelStr}]`;

  return `${prefix} ${message}`;
}

/**
 * カラーリングを適用
 * @param level - ログレベル
 * @param message - メッセージ
 * @returns カラーリング適用済みメッセージ
 */
function applyColor(level: LogLevel, message: string): string {
  if (isColorDisabled()) {
    return message;
  }

  switch (level) {
    case 'debug':
      return chalk.gray(message);
    case 'info':
      return chalk.blue(message);
    case 'warn':
      return chalk.yellow(message);
    case 'error':
      return chalk.red(message);
    default:
      return message;
  }
}

/**
 * ログ出力の実装
 * @param level - ログレベル
 * @param args - ログメッセージ引数
 */
function log(level: LogLevel, ...args: unknown[]): void {
  const currentLevel = getCurrentLogLevel();

  // ログレベルチェック
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const message = formatMessage(level, ...args);
  const coloredMessage = applyColor(level, message);

  if (level === 'error') {
    console.error(coloredMessage);
    return;
  }

  if (level === 'warn') {
    console.warn(coloredMessage);
    console.log(coloredMessage);
    return;
  }

  if (level === 'info') {
    console.info(coloredMessage);
    console.log(coloredMessage);
    return;
  }

  // debug
  console.debug(coloredMessage);
  console.log(coloredMessage);
}

/**
 * Loggerオブジェクト
 * 統一されたロギングインターフェースを提供
 */
export const logger = {
  /**
   * デバッグレベルのログを出力
   * @param args - ログメッセージ引数
   */
  debug: (...args: unknown[]) => log('debug', ...args),

  /**
   * 情報レベルのログを出力
   * @param args - ログメッセージ引数
   */
  info: (...args: unknown[]) => log('info', ...args),

  /**
   * 警告レベルのログを出力
   * @param args - ログメッセージ引数
   */
  warn: (...args: unknown[]) => log('warn', ...args),

  /**
   * エラーレベルのログを出力
   * @param args - ログメッセージ引数
   */
  error: (...args: unknown[]) => log('error', ...args),
};
