import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Octokit } from '@octokit/rest';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from './config.js';
import { CodexAgentClient } from './codex-agent-client.js';
import { ClaudeAgentClient } from './claude-agent-client.js';
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
      checks.push({
        name: 'Token Scopes',
        status: hasMissing ? 'warning' : 'passed',
        value: scopes.length > 0 ? scopes.join(', ') : undefined,
        message:
          scopes.length === 0
            ? 'Scopes not returned by API'
            : hasMissing
            ? `Missing scopes: ${missingScopes.join(', ')}`
            : 'Required scopes are present',
      });
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

    // execute コマンドと同じ動作: $HOME/.codex/auth.json ファイルを検証
    const homeDir = process.env.HOME || os.homedir();
    const authFilePath = path.join(homeDir, '.codex', 'auth.json');

    const hasAuthFile = fs.existsSync(authFilePath);
    const hasApiKey = !isBlank(apiKey);

    if (!hasAuthFile && !hasApiKey) {
      checks.push({
        name: 'Codex Authentication',
        status: 'failed',
        message: 'Neither ~/.codex/auth.json nor CODEX_API_KEY is set',
      });
      return { status: 'failed', checks };
    }

    // auth.json ファイルの検証
    if (hasAuthFile) {
      checks.push({
        name: 'Codex Auth File',
        status: 'passed',
        value: authFilePath
      });
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
      }
    } else {
      checks.push({
        name: 'Codex Auth File',
        status: 'skipped',
        message: 'Not found (using CODEX_API_KEY)',
      });
      checks.push({
        name: 'JSON Format',
        status: 'skipped',
        message: 'Skipped (auth file not found)',
      });
    }

    // CODEX_API_KEY の検証
    if (hasApiKey) {
      checks.push({ name: 'CODEX_API_KEY', status: 'passed', value: this.maskValue(apiKey) });
    } else {
      checks.push({
        name: 'CODEX_API_KEY',
        status: 'skipped',
        message: 'Not set (using auth file)',
      });
    }

    // Codex CLI 疎通チェック（軽量プロンプト実行）
    if (hasAuthFile || hasApiKey) {
      const codexCheckResult = await this.testCodexConnectivity();
      checks.push(codexCheckResult);
    } else {
      checks.push({
        name: 'Codex API',
        status: 'skipped',
        message: 'Skipped (no credentials)',
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }

  /**
   * Codex CLI 疎通テスト（軽量プロンプト実行）
   * 既存の CodexAgentClient を再利用
   */
  private async testCodexConnectivity(): Promise<ValidationCheck> {
    try {
      const codexClient = new CodexAgentClient();

      // 30秒タイムアウトで軽量プロンプトを実行（Docker環境での初回起動を考慮）
      await Promise.race([
        codexClient.executeTask({
          prompt: 'ping',
          maxTurns: 1,
          verbose: true, // Jenkins環境でのデバッグのためログを有効化
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 30 seconds')), 30000)
        ),
      ]);

      return {
        name: 'Codex API',
        status: 'passed',
        message: 'Codex agent responded successfully',
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      return {
        name: 'Codex API',
        status: 'failed',
        message: `Codex agent check failed: ${errorMsg.substring(0, 100)}`,
      };
    }
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

    // Claude Code エージェント疎通チェック（軽量プロンプト実行）
    if (!isBlank(oauthToken) || !isBlank(apiKey)) {
      const claudeCheckResult = await this.testClaudeConnectivity(oauthToken, apiKey);
      checks.push(claudeCheckResult);
    } else {
      checks.push({
        name: 'Claude API',
        status: 'skipped',
        message: 'Skipped (no credentials)',
      });
    }

    return {
      status: resolveCategoryStatus(checks),
      checks,
    };
  }

  /**
   * Claude Code 疎通テスト（軽量プロンプト実行）
   * 既存の ClaudeAgentClient を再利用
   */
  private async testClaudeConnectivity(
    oauthToken: string,
    apiKey: string,
  ): Promise<ValidationCheck> {
    try {
      const claudeClient = new ClaudeAgentClient();

      // 30秒タイムアウトで軽量プロンプトを実行（Docker環境での初回起動を考慮）
      await Promise.race([
        claudeClient.executeTask({
          prompt: 'ping',
          maxTurns: 1,
          verbose: true, // Jenkins環境でのデバッグのためログを有効化
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 30 seconds')), 30000)
        ),
      ]);

      return {
        name: 'Claude API',
        status: 'passed',
        message: 'Claude agent responded successfully',
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      return {
        name: 'Claude API',
        status: 'failed',
        message: `Claude agent check failed: ${errorMsg.substring(0, 100)}`,
      };
    }
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
        status: 'skipped',
        message: 'Not configured (optional for follow-up issue generation)',
      });
      checks.push({
        name: 'OpenAI API',
        status: 'skipped',
        message: 'Skipped (key not configured)',
      });
      return { status: 'passed', checks };
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
        status: 'skipped',
        message: 'Not configured (optional for follow-up issue generation)',
      });
      checks.push({
        name: 'Anthropic API',
        status: 'skipped',
        message: 'Skipped (key not configured)',
      });
      return { status: 'passed', checks };
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
