import fs from 'node:fs';
import { Octokit } from '@octokit/rest';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from './config.js';
import type {
  CategoryResult,
  CategoryStatus,
  CheckCategory,
  CheckStatus,
  Checker,
  ValidationCheck,
  ValidationResult,
  ValidationSummary,
} from '../types/validation.js';

const REQUIRED_GITHUB_SCOPES = ['repo'];
const DEFAULT_TIMEOUT_MS = 10_000;

const isBlank = (value: string | null | undefined): boolean => {
  return value === undefined || value === null || value.trim() === '';
};

const resolveCategoryStatus = (checks: ValidationCheck[]): CategoryStatus => {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed';
  }

  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }

  return 'passed';
};

/**
 * 認証情報バリデーションのメインクラス
 */
export class CredentialValidator {
  private readonly checkers: Map<CheckCategory, Checker>;
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
    this.checkers = new Map<CheckCategory, Checker>([
      ['git', new GitChecker()],
      ['github', new GitHubChecker(this.maskValue, this.timeoutMs)],
      ['codex', new CodexChecker(this.maskValue)],
      ['claude', new ClaudeChecker(this.maskValue)],
      ['openai', new OpenAIChecker(this.maskValue, this.timeoutMs)],
      ['anthropic', new AnthropicChecker(this.maskValue, this.timeoutMs)],
    ]);
  }

  /**
   * バリデーションを実行
   *
   * @param categories - チェックするカテゴリ（'all' の場合は全カテゴリ）
   * @param verbose - 詳細出力モード（現時点ではログ出力のみに影響）
   * @returns バリデーション結果
   */
  public async validate(
    categories: CheckCategory | 'all',
    verbose: boolean,
  ): Promise<ValidationResult> {
    const targets = categories === 'all' ? Array.from(this.checkers.keys()) : [categories];
    const results: ValidationResult['results'] = {};
    const categoryResults: CategoryResult[] = [];

    const tasks = targets.map(async (category) => {
      const checker = this.checkers.get(category);
      if (!checker) {
        throw new Error(`Unsupported category: ${category}`);
      }

      try {
        const result = await checker.check(verbose);
        results[category] = result;
        categoryResults.push(result);
      } catch (error) {
        logger.error(
          `Failed to validate category "${category}": ${getErrorMessage(error)}`,
        );
        const failedResult: CategoryResult = {
          status: 'failed',
          checks: [
            {
              name: 'Unexpected error',
              status: 'failed',
              message: getErrorMessage(error),
            },
          ],
        };
        results[category] = failedResult;
        categoryResults.push(failedResult);
      }
    });

    await Promise.all(tasks);

    return {
      timestamp: new Date().toISOString(),
      results,
      summary: this.buildSummary(categoryResults),
    };
  }

  /**
   * 値をマスキング
   * @param value - マスキング対象の値
   * @returns マスキング済みの値
   */
  private maskValue(value: string): string {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return '****';
    }

    if (trimmed.length <= 4) {
      return '****';
    }

    return `${trimmed.substring(0, 4)}****`;
  }

  /**
   * サマリーを構築
   */
  private buildSummary(results: CategoryResult[]): ValidationSummary {
    const summary: ValidationSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      skipped: 0,
    };

    for (const category of results) {
      for (const check of category.checks) {
        summary.total += 1;
        if (check.status === 'passed') {
          summary.passed += 1;
        } else if (check.status === 'failed') {
          summary.failed += 1;
        } else if (check.status === 'warning') {
          summary.warnings += 1;
        } else if (check.status === 'skipped') {
          summary.skipped += 1;
        }
      }
    }

    return summary;
  }
}

/**
 * Git 設定の検証
 */
class GitChecker implements Checker {
  readonly category: CheckCategory = 'git';
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const userName = process.env.GIT_COMMIT_USER_NAME ?? '';
    const userEmail = process.env.GIT_COMMIT_USER_EMAIL ?? '';

    if (isBlank(userName)) {
      checks.push({ name: 'GIT_COMMIT_USER_NAME', status: 'failed', message: 'Not set' });
    } else {
      checks.push({ name: 'GIT_COMMIT_USER_NAME', status: 'passed', value: userName.trim() });
    }

    if (isBlank(userEmail)) {
      checks.push({ name: 'GIT_COMMIT_USER_EMAIL', status: 'failed', message: 'Not set' });
      checks.push({
        name: 'Email Format',
        status: 'skipped',
        message: 'Skipped (email not set)',
      });
    } else {
      const trimmedEmail = userEmail.trim();
      checks.push({ name: 'GIT_COMMIT_USER_EMAIL', status: 'passed', value: trimmedEmail });
      const isValidEmail = this.emailRegex.test(trimmedEmail);
      checks.push({
        name: 'Email Format',
        status: isValidEmail ? 'passed' : 'failed',
        message: isValidEmail ? 'Valid email format' : 'Invalid email format',
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}

/**
 * GitHub 認証の検証
 */
class GitHubChecker implements Checker {
  readonly category: CheckCategory = 'github';
  private readonly maskValue: (value: string) => string;
  private readonly timeoutMs: number;

  constructor(maskValue: (value: string) => string, timeoutMs: number) {
    this.maskValue = maskValue;
    this.timeoutMs = timeoutMs;
  }

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const token = process.env.GITHUB_TOKEN ?? '';

    if (isBlank(token)) {
      checks.push({ name: 'GITHUB_TOKEN', status: 'failed', message: 'Not set' });
      checks.push({
        name: 'GitHub API',
        status: 'skipped',
        message: 'Skipped (token not set)',
      });
      checks.push({
        name: 'Token Scopes',
        status: 'skipped',
        message: 'Skipped (token not set)',
      });
      checks.push({
        name: 'Rate Limit',
        status: 'skipped',
        message: 'Skipped (token not set)',
      });
      return { status: 'failed', checks };
    }

    const trimmedToken = token.trim();
    checks.push({ name: 'GITHUB_TOKEN', status: 'passed', value: this.maskValue(trimmedToken) });

    const octokit = new Octokit({ auth: trimmedToken, request: { timeout: this.timeoutMs } });
    const tokenScopeCheck: ValidationCheck = {
      name: 'Token Scopes',
      status: 'skipped',
      message: 'Skipped (not evaluated)',
    };

    try {
      const authResponse = await octokit.rest.users.getAuthenticated();
      const login = authResponse?.data?.login;
      checks.push({
        name: 'GitHub API',
        status: 'passed',
        message: login ? `Authenticated as ${login}` : 'Authenticated',
      });

      const scopeHeader =
        authResponse?.headers?.['x-oauth-scopes'] ??
        authResponse?.headers?.['X-OAuth-Scopes'];
      const scopes =
        typeof scopeHeader === 'string'
          ? scopeHeader
              .split(',')
              .map((scope) => scope.trim())
              .filter((scope) => scope.length > 0)
          : [];
      const missingScopes = REQUIRED_GITHUB_SCOPES.filter(
        (required) => !scopes.some((scope) => scope.toLowerCase() === required),
      );
      const hasMissing = missingScopes.length > 0;
      tokenScopeCheck.name = 'Token Scopes';
      tokenScopeCheck.status = hasMissing ? 'warning' : 'passed';
      tokenScopeCheck.value = scopes.length > 0 ? scopes.join(', ') : undefined;
      tokenScopeCheck.message =
        scopes.length === 0
          ? 'Scopes not returned by API'
          : hasMissing
          ? `Missing scopes: ${missingScopes.join(', ')}`
          : 'Required scopes are present';
      checks.push(tokenScopeCheck);
    } catch (error) {
      const message = getErrorMessage(error);
      checks.push({
        name: 'GitHub API',
        status: 'failed',
        message: `Authentication failed: ${message}`,
      });
      checks.push({
        name: 'Token Scopes',
        status: 'skipped',
        message: 'Skipped (authentication failed)',
      });
      checks.push({
        name: 'Rate Limit',
        status: 'skipped',
        message: 'Skipped (authentication failed)',
      });

      return { status: resolveCategoryStatus(checks), checks };
    }

    try {
      const rateLimit = await octokit.rest.rateLimit.get();
      const remaining = rateLimit?.data?.rate?.remaining;
      const limit = rateLimit?.data?.rate?.limit;
      const status: CheckStatus =
        typeof remaining === 'number' && typeof limit === 'number' && remaining <= limit * 0.1
          ? 'warning'
          : 'passed';
      const message =
        typeof remaining === 'number' && typeof limit === 'number'
          ? `${remaining}/${limit} remaining`
          : 'Rate limit information unavailable';
      checks.push({ name: 'Rate Limit', status, message });
      if (status === 'warning' && tokenScopeCheck.status === 'passed') {
        tokenScopeCheck.status = 'warning';
        tokenScopeCheck.message = tokenScopeCheck.message
          ? `${tokenScopeCheck.message} (rate limit near exhaustion)`
          : 'Rate limit near exhaustion';
      }
    } catch (error) {
      checks.push({
        name: 'Rate Limit',
        status: 'warning',
        message: `Failed to fetch rate limit: ${getErrorMessage(error)}`,
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}

/**
 * Codex 認証の検証
 */
class CodexChecker implements Checker {
  readonly category: CheckCategory = 'codex';
  private readonly maskValue: (value: string) => string;

  constructor(maskValue: (value: string) => string) {
    this.maskValue = maskValue;
  }

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const apiKey = config.getCodexApiKey()?.trim() ?? process.env.CODEX_API_KEY?.trim() ?? '';
    const authFilePath = process.env.CODEX_AUTH_JSON?.trim() ?? '';

    const hasAuthPath = !isBlank(authFilePath);
    const hasApiKey = !isBlank(apiKey);

    if (!hasAuthPath && !hasApiKey) {
      checks.push({
        name: 'Codex Authentication',
        status: 'failed',
        message: 'Neither CODEX_AUTH_JSON nor CODEX_API_KEY is set',
      });
      return { status: 'failed', checks };
    }

    if (hasAuthPath) {
      checks.push({
        name: 'CODEX_AUTH_JSON',
        status: 'passed',
        value: authFilePath,
      });
      const fileExists = fs.existsSync(authFilePath);
      checks.push({
        name: 'File Exists',
        status: fileExists ? 'passed' : 'failed',
        message: fileExists ? 'Auth file found' : 'Auth file not found',
      });

      if (!fileExists) {
        checks.push({
          name: 'JSON Format',
          status: 'skipped',
          message: 'Skipped (auth file not found)',
        });
        checks.push({
          name: 'Codex API',
          status: 'skipped',
          message: 'Skipped (auth file not found)',
        });
        return {
          status: resolveCategoryStatus(checks),
          checks,
        };
      }

      try {
        const rawContent = fs.readFileSync(authFilePath, 'utf-8');
        JSON.parse(rawContent);
        checks.push({ name: 'JSON Format', status: 'passed', message: 'Valid JSON format' });
      } catch (error) {
        checks.push({
          name: 'JSON Format',
          status: 'failed',
          message: `Invalid JSON format: ${getErrorMessage(error)}`,
        });
        checks.push({
          name: 'Codex API',
          status: 'skipped',
          message: 'Skipped (invalid auth file)',
        });
        return {
          status: resolveCategoryStatus(checks),
          checks,
        };
      }
    } else {
      checks.push({
        name: 'CODEX_AUTH_JSON',
        status: 'skipped',
        message: 'Not set (using CODEX_API_KEY)',
      });
      checks.push({
        name: 'File Exists',
        status: 'skipped',
        message: 'Skipped (auth file not provided)',
      });
      checks.push({
        name: 'JSON Format',
        status: 'skipped',
        message: 'Skipped (auth file not provided)',
      });
    }

    if (hasApiKey) {
      checks.push({ name: 'CODEX_API_KEY', status: 'passed', value: this.maskValue(apiKey) });
    } else {
      checks.push({
        name: 'CODEX_API_KEY',
        status: 'skipped',
        message: 'Not set (using auth file)',
      });
    }

    checks.push({
      name: 'Codex API',
      status: 'passed',
      message: 'Credentials detected (connectivity check skipped)',
    });

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}

/**
 * Claude 認証の検証
 */
class ClaudeChecker implements Checker {
  readonly category: CheckCategory = 'claude';
  private readonly maskValue: (value: string) => string;

  constructor(maskValue: (value: string) => string) {
    this.maskValue = maskValue;
  }

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const oauthToken = config.getClaudeOAuthToken()?.trim() ?? process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ?? '';
    const apiKey = config.getClaudeCodeApiKey()?.trim() ?? process.env.CLAUDE_CODE_API_KEY?.trim() ?? '';

    if (isBlank(oauthToken) && isBlank(apiKey)) {
      checks.push({
        name: 'Claude Authentication',
        status: 'failed',
        message: 'Neither CLAUDE_CODE_OAUTH_TOKEN nor CLAUDE_CODE_API_KEY is set',
      });
      return { status: 'failed', checks };
    }

    if (!isBlank(oauthToken)) {
      checks.push({
        name: 'CLAUDE_CODE_OAUTH_TOKEN',
        status: 'passed',
        value: this.maskValue(oauthToken),
      });
    } else {
      checks.push({
        name: 'CLAUDE_CODE_OAUTH_TOKEN',
        status: 'skipped',
        message: 'Not set (using API key)',
      });
    }

    if (!isBlank(apiKey)) {
      checks.push({
        name: 'CLAUDE_CODE_API_KEY',
        status: 'passed',
        value: this.maskValue(apiKey),
      });
    } else {
      checks.push({
        name: 'CLAUDE_CODE_API_KEY',
        status: 'skipped',
        message: 'Not set (using OAuth token)',
      });
    }

    checks.push({
      name: 'Claude API',
      status: 'passed',
      message: 'Credentials detected (connectivity check skipped)',
    });

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}

/**
 * OpenAI API キーの検証
 */
class OpenAIChecker implements Checker {
  readonly category: CheckCategory = 'openai';
  private readonly maskValue: (value: string) => string;
  private readonly timeoutMs: number;

  constructor(maskValue: (value: string) => string, timeoutMs: number) {
    this.maskValue = maskValue;
    this.timeoutMs = timeoutMs;
  }

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const apiKey = config.getOpenAiApiKey()?.trim() ?? process.env.OPENAI_API_KEY?.trim() ?? '';

    if (isBlank(apiKey)) {
      checks.push({
        name: 'OPENAI_API_KEY',
        status: 'failed',
        message: 'Not configured (optional for follow-up issue generation)',
      });
      checks.push({
        name: 'OpenAI API',
        status: 'skipped',
        message: 'Skipped (key not configured)',
      });
      return { status: resolveCategoryStatus(checks), checks };
    }

    checks.push({ name: 'OPENAI_API_KEY', status: 'passed', value: this.maskValue(apiKey) });

    try {
      const client = new OpenAI({ apiKey, timeout: this.timeoutMs });
      await client.models.list();
      checks.push({ name: 'OpenAI API', status: 'passed', message: 'Valid key' });
    } catch (error) {
      checks.push({
        name: 'OpenAI API',
        status: 'failed',
        message: `API validation failed: ${getErrorMessage(error)}`,
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}

/**
 * Anthropic API キーの検証
 */
class AnthropicChecker implements Checker {
  readonly category: CheckCategory = 'anthropic';
  private readonly maskValue: (value: string) => string;
  private readonly timeoutMs: number;

  constructor(maskValue: (value: string) => string, timeoutMs: number) {
    this.maskValue = maskValue;
    this.timeoutMs = timeoutMs;
  }

  async check(): Promise<CategoryResult> {
    const checks: ValidationCheck[] = [];
    const apiKey =
      config.getAnthropicApiKey()?.trim() ?? process.env.ANTHROPIC_API_KEY?.trim() ?? '';

    if (isBlank(apiKey)) {
      checks.push({
        name: 'ANTHROPIC_API_KEY',
        status: 'failed',
        message: 'Not configured (optional for follow-up issue generation)',
      });
      checks.push({
        name: 'Anthropic API',
        status: 'skipped',
        message: 'Skipped (key not configured)',
      });
      return { status: resolveCategoryStatus(checks), checks };
    }

    checks.push({
      name: 'ANTHROPIC_API_KEY',
      status: 'passed',
      value: this.maskValue(apiKey),
    });

    try {
      const client = new Anthropic({ apiKey, maxRetries: 0, timeout: this.timeoutMs });
      // models.list() は軽量な検証用エンドポイントとして利用
      if (typeof client.models?.list === 'function') {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        await client.models.list();
      } else {
        await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        });
      }
      checks.push({ name: 'Anthropic API', status: 'passed', message: 'Valid key' });
    } catch (error) {
      checks.push({
        name: 'Anthropic API',
        status: 'failed',
        message: `API validation failed: ${getErrorMessage(error)}`,
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }
}
