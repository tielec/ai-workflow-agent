/**
 * validate-credentials コマンドハンドラ
 *
 * 認証情報の有効性をチェックし、テキストまたはJSON形式で結果を出力します。
 *
 * @module validate-credentials-command
 */

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { CredentialValidator } from '../core/credential-validator.js';
import type {
  CheckCategory,
  RawValidateCredentialsOptions,
  ValidateCredentialsOptions,
  ValidationResult,
} from '../types/validation.js';

const SUPPORTED_CATEGORIES: Array<CheckCategory | 'all'> = [
  'all',
  'git',
  'github',
  'codex',
  'claude',
  'openai',
  'anthropic',
];

const CATEGORY_LABELS: Record<CheckCategory, string> = {
  git: 'Git Configuration',
  github: 'GitHub Authentication',
  codex: 'Codex Agent Authentication',
  claude: 'Claude Agent Authentication',
  openai: 'OpenAI API',
  anthropic: 'Anthropic API',
};

const STATUS_ICONS: Record<string, string> = {
  passed: '✓',
  failed: '✗',
  warning: '⚠',
  skipped: '-',
};

/**
 * validate-credentials コマンドのメインハンドラ
 *
 * @param rawOptions - CLIオプション（生の入力）
 * @throws オプションパースエラー、バリデーション実行エラー
 */
export async function handleValidateCredentialsCommand(
  rawOptions: RawValidateCredentialsOptions,
): Promise<void> {
  try {
    logger.info('Starting validate-credentials command...');
    const options = parseOptions(rawOptions);

    const validator = new CredentialValidator();
    const result = await validator.validate(options.check, options.verbose);

    if (options.output === 'json') {
      console.log(formatJsonOutput(result));
    } else {
      console.log(formatTextOutput(result, options.verbose));
    }

    const exitCode = determineExitCode(result, options.exitOnError);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }

    logger.info('validate-credentials command completed.');
  } catch (error) {
    logger.error(`validate-credentials command failed: ${getErrorMessage(error)}`);
    process.exitCode = 1;
    throw error;
  }
}

/**
 * CLIオプションをパース
 *
 * @param rawOptions - 生の CLI オプション
 * @returns パース済みオプション
 * @throws バリデーションエラー
 */
export function parseOptions(rawOptions: RawValidateCredentialsOptions): ValidateCredentialsOptions {
  const rawCheck = (rawOptions.check ?? 'all').toString().trim().toLowerCase();
  if (!SUPPORTED_CATEGORIES.includes(rawCheck as CheckCategory | 'all')) {
    throw new Error(
      `Invalid check category: ${rawCheck}. Supported: ${SUPPORTED_CATEGORIES.join(', ')}`,
    );
  }

  const rawOutput = (rawOptions.output ?? 'text').toString().trim().toLowerCase();
  if (!['text', 'json'].includes(rawOutput)) {
    throw new Error('Invalid output format. Use "text" or "json".');
  }

  return {
    check: rawCheck as CheckCategory | 'all',
    output: rawOutput as 'text' | 'json',
    verbose: Boolean(rawOptions.verbose),
    exitOnError: Boolean(rawOptions.exitOnError),
  };
}

/**
 * バリデーション結果をテキスト形式でフォーマット
 *
 * @param result - バリデーション結果
 * @param verbose - 詳細出力モード
 * @returns フォーマット済みテキスト
 */
export function formatTextOutput(result: ValidationResult, verbose: boolean): string {
  const lines: string[] = [];
  lines.push('==============================================');
  lines.push('AI Workflow Credentials Validation');
  lines.push('==============================================', '');

  const orderedCategories: CheckCategory[] = [
    'git',
    'github',
    'codex',
    'claude',
    'openai',
    'anthropic',
  ];

  for (const category of orderedCategories) {
    const categoryResult = result.results[category];
    if (!categoryResult) {
      continue;
    }

    lines.push(CATEGORY_LABELS[category]);
    for (const check of categoryResult.checks) {
      const icon = STATUS_ICONS[check.status] ?? '-';
      const details: string[] = [];
      if (check.value) {
        details.push(check.value);
      }
      if (check.message) {
        details.push(check.message);
      }
      const detailText = details.length > 0 ? `: ${details.join(' - ')}` : '';
      lines.push(`  ${icon} ${check.name}${detailText}`);
    }

    if (verbose) {
      lines.push(`  Status: ${categoryResult.status}`);
    }

    lines.push('');
  }

  lines.push('==============================================');
  lines.push(
    `Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings, ${result.summary.skipped} skipped`,
  );
  lines.push('==============================================');

  return lines.join('\n');
}

/**
 * バリデーション結果を JSON 形式でフォーマット
 *
 * @param result - バリデーション結果
 * @returns フォーマット済み JSON 文字列
 */
export function formatJsonOutput(result: ValidationResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Exit Code を決定
 *
 * @param result - バリデーション結果
 * @param exitOnError - --exit-on-error フラグ
 * @returns Exit Code (0 または 1)
 */
export function determineExitCode(result: ValidationResult, exitOnError: boolean): number {
  if (exitOnError && result.summary.failed > 0) {
    return 1;
  }
  return 0;
}
