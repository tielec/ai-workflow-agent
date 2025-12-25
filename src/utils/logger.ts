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
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * ログメッセージをフォーマット
 * @param level - ログレベル
 * @param args - ログメッセージ引数
 * @returns フォーマット済みメッセージ
 */
function formatMessage(level: LogLevel, ...args: unknown[]): string {
  const levelLabel = level === 'warn' ? 'WARNING' : level.toUpperCase();
  const paddedLabel = levelLabel.padEnd(5, ' ');
  const prefix = `${getTimestamp()} [${paddedLabel}]`;
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

  return message.length > 0 ? `${prefix} ${message}` : `${prefix} `;
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

  // 出力先の選択
  const consoleMethod =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : level === 'info'
      ? console.info
      : console.debug;

  consoleMethod.call(console, coloredMessage);
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
