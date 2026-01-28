/**
 * InstructionValidator - カスタム指示の安全性を検証するクラス
 *
 * エージェント優先順: codex-agent → claude-agent → openai-api → pattern
 *
 * このモジュールは、DifficultyAnalyzer および ContentParser のパターンに準拠し、
 * エージェント優先のフォールバックチェーンを実装しています。
 *
 * @module instruction-validator
 */

import crypto from 'node:crypto';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type {
  LLMValidationResponse,
  ValidationCacheEntry,
  ValidationResult,
} from '../types/auto-issue.js';
import { PromptLoader } from './prompt-loader.js';
import { ClaudeAgentClient, resolveClaudeModel } from './claude-agent-client.js';
import { CodexAgentClient, resolveCodexModel } from './codex-agent-client.js';
import { detectCodexCliAuth, isValidCodexApiKey } from './helpers/codex-credentials.js';

// ===============================
// 定数定義
// ===============================

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const MODEL = 'gpt-4o-mini';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 1000;

// ===============================
// ValidationCache クラス
// ===============================

/**
 * 検証結果のキャッシュ管理クラス
 *
 * - TTL: 1時間
 * - 最大エントリ数: 1000
 * - LRU方式で古いエントリを削除
 */
class ValidationCache {
  private readonly cache: Map<string, ValidationCacheEntry> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = CACHE_TTL_MS, maxEntries = MAX_CACHE_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): ValidationResult | null {
    this.evictExpired();
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.result;
  }

  set(key: string, result: ValidationResult): void {
    this.evictExpired();

    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, { result, timestamp: now, lastAccessed: now });
  }

  static computeHash(instruction: string): string {
    return crypto.createHash('sha256').update(instruction).digest('hex');
  }

  private evictExpired(): void {
    if (this.cache.size === 0) {
      return;
    }
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// ===============================
// InstructionValidatorOptions インターフェース
// ===============================

/**
 * InstructionValidator のコンストラクタオプション
 */
export interface InstructionValidatorOptions {
  /** 作業ディレクトリのパス */
  workingDir: string;

  /** Codex Agent クライアント（オプション、テスト用） */
  codexClient?: CodexAgentClient | null;

  /** Claude Agent クライアント（オプション、テスト用） */
  claudeClient?: ClaudeAgentClient | null;

  /** OpenAI クライアント（オプション、テスト用） */
  openaiClient?: OpenAI | null;
}

// ===============================
// InstructionValidator クラス
// ===============================

/**
 * カスタム指示の安全性を検証するクラス
 *
 * エージェント優先順: codex-agent → claude-agent → openai-api → pattern
 *
 * DifficultyAnalyzer および ContentParser と同様のパターンで実装。
 */
export class InstructionValidator {
  // ===============================
  // プロパティ
  // ===============================

  /** 検証結果のキャッシュ */
  private readonly cache: ValidationCache;

  /** Codex Agent クライアント（オプショナル） */
  private readonly codexClient: CodexAgentClient | null;

  /** Claude Agent クライアント（オプショナル） */
  private readonly claudeClient: ClaudeAgentClient | null;

  /** OpenAI クライアント（オプショナル） */
  private readonly openaiClient: OpenAI | null;

  /** 作業ディレクトリ */
  private readonly workingDir: string;

  // ===============================
  // コンストラクタ
  // ===============================

  /**
   * InstructionValidator のインスタンスを作成
   *
   * @param workingDir - 作業ディレクトリのパス
   * @param options - オプション設定（テスト用にクライアントを注入可能）
   */
  constructor(workingDir: string, options?: Partial<InstructionValidatorOptions>) {
    this.workingDir = workingDir;
    this.cache = new ValidationCache();

    // クライアントの初期化（オプションで注入されていればそれを使用）
    this.codexClient = options?.codexClient !== undefined ? options.codexClient : this.initCodexAgent();
    this.claudeClient = options?.claudeClient !== undefined ? options.claudeClient : this.initClaudeAgent();
    this.openaiClient = options?.openaiClient !== undefined ? options.openaiClient : this.initOpenAI();

    // 利用可能なクライアントをログ出力
    this.logAvailableClients();
  }

  // ===============================
  // パブリックメソッド
  // ===============================

  /**
   * カスタム指示の安全性を検証
   *
   * 以下の優先順でフォールバックしながら検証を実行:
   * 1. Codex Agent (mini)
   * 2. Claude Agent (haiku)
   * 3. OpenAI API (gpt-4o-mini)
   * 4. パターンマッチング（最終手段）
   *
   * @param instruction - 検証対象のカスタム指示文字列
   * @returns 検証結果
   * @throws 空の指示が渡された場合
   */
  public async validate(instruction: string): Promise<ValidationResult> {
    const trimmed = instruction.trim();
    if (!trimmed) {
      throw new Error('Instruction cannot be empty');
    }

    if (trimmed.length > 2000) {
      logger.warn('Instruction exceeds 2000 characters, proceeding without truncation.');
    }

    // キャッシュチェック
    const hash = ValidationCache.computeHash(trimmed);
    const cached = this.cache.get(hash);
    if (cached) {
      logger.debug(`Instruction validation cache hit: ${hash.substring(0, 8)}...`);
      return cached;
    }

    let result: ValidationResult;

    // 1. Codex Agent（mini）
    if (this.codexClient) {
      try {
        result = await this.validateWithAgent(this.codexClient, 'codex', 'mini', trimmed);
        this.cache.set(hash, result);
        return result;
      } catch (error) {
        logger.warn(`Codex validation failed: ${getErrorMessage(error)}`);
      }
    }

    // 2. Claude Agent（haiku）
    if (this.claudeClient) {
      try {
        result = await this.validateWithAgent(this.claudeClient, 'claude', 'haiku', trimmed);
        this.cache.set(hash, result);
        return result;
      } catch (error) {
        logger.warn(`Claude validation failed: ${getErrorMessage(error)}`);
      }
    }

    // 3. OpenAI API
    if (this.openaiClient) {
      try {
        result = await this.validateWithLLM(trimmed);
        logger.info(
          `Instruction validated via LLM: isValid=${result.isValid}, confidence=${result.confidence}`,
        );
        this.cache.set(hash, result);
        return result;
      } catch (error) {
        logger.warn(`OpenAI validation failed: ${getErrorMessage(error)}`);
      }
    }

    // 4. 最終手段：パターンマッチング
    logger.warn('No LLM available for instruction validation. Using pattern matching (low confidence).');
    result = this.validateWithPatterns(trimmed);

    // パターンマッチング結果が isValid=false でも、confidence='low' なら警告のみで続行
    if (!result.isValid && result.confidence === 'low') {
      logger.warn(`Pattern matching detected potentially unsafe instruction: ${result.reason}`);
      logger.warn('Consider setting CODEX_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or OPENAI_API_KEY for more accurate validation.');

      // 警告のみで続行
      result = {
        ...result,
        isValid: true,
        reason: `Pattern matching detected potential issue (${result.detectedPattern}), but continuing due to low confidence.`,
      };
    }

    this.cache.set(hash, result);
    return result;
  }

  // ===============================
  // プライベートメソッド - クライアント初期化
  // ===============================

  /**
   * Codex Agent クライアントを初期化
   *
   * @returns 初期化されたクライアント、または null（認証情報なし/初期化失敗時）
   */
  private initCodexAgent(): CodexAgentClient | null {
    const codexApiKey = config.getCodexApiKey();
    const { authFilePath: codexAuthFile } = detectCodexCliAuth();
    const hasCodexCredentials = isValidCodexApiKey(codexApiKey) || codexAuthFile !== null;

    if (!hasCodexCredentials) {
      logger.debug('Codex credentials not found. Skipping Codex agent initialization.');
      return null;
    }

    try {
      const codexModel = resolveCodexModel('mini');
      return new CodexAgentClient({ model: codexModel });
    } catch (error) {
      logger.warn(`Failed to initialize Codex client: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Claude Agent クライアントを初期化
   *
   * @returns 初期化されたクライアント、または null（認証情報なし/初期化失敗時）
   */
  private initClaudeAgent(): ClaudeAgentClient | null {
    const claudeToken = config.getClaudeCodeToken();
    if (!claudeToken) {
      logger.debug('Claude token not found. Skipping Claude agent initialization.');
      return null;
    }

    try {
      return new ClaudeAgentClient();
    } catch (error) {
      logger.warn(`Failed to initialize Claude client: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * OpenAI クライアントを初期化
   *
   * @returns 初期化されたクライアント、または null（APIキーなし）
   */
  private initOpenAI(): OpenAI | null {
    const apiKey = config.getOpenAiApiKey();
    if (!apiKey) {
      logger.debug('OpenAI API key not found. Skipping OpenAI client initialization.');
      return null;
    }

    return new OpenAI({ apiKey });
  }

  /**
   * 利用可能なクライアントをログ出力
   */
  private logAvailableClients(): void {
    const available: string[] = [];
    if (this.codexClient) available.push('Codex Agent');
    if (this.claudeClient) available.push('Claude Agent');
    if (this.openaiClient) available.push('OpenAI API');

    if (available.length === 0) {
      logger.warn('No LLM clients available. Instruction validation will use pattern matching only.');
    } else {
      logger.info(`Available validation clients: ${available.join(', ')}`);
    }
  }

  // ===============================
  // プライベートメソッド - 検証ロジック
  // ===============================

  /**
   * エージェント経由でカスタム指示を検証
   *
   * @param client - エージェントクライアント
   * @param agentType - エージェントタイプ（'codex' または 'claude'）
   * @param modelAlias - モデルエイリアス（'mini' または 'haiku'）
   * @param instruction - 検証対象の指示文字列
   * @returns 検証結果
   */
  private async validateWithAgent(
    client: CodexAgentClient | ClaudeAgentClient,
    agentType: 'codex' | 'claude',
    modelAlias: string,
    instruction: string,
  ): Promise<ValidationResult> {
    const prompt = this.buildPrompt(instruction);
    const resolvedModel =
      agentType === 'claude' ? resolveClaudeModel(modelAlias) : resolveCodexModel(modelAlias);

    logger.debug(`Validating instruction via ${agentType} agent (model: ${resolvedModel})`);

    const messages = await client.executeTask({
      prompt,
      maxTurns: 3,
      workingDirectory: this.workingDir,
      verbose: false,
      model: resolvedModel,
    });

    // エージェント応答をパース
    const parsed = this.parseAgentResponse(messages);

    logger.info(
      `Instruction validated via ${agentType} agent: isValid=${parsed.isSafe}, confidence=${parsed.confidence}`,
    );

    return {
      isValid: parsed.isSafe,
      confidence: parsed.confidence,
      reason: parsed.reason,
      category: parsed.category,
      errorMessage: parsed.isSafe ? undefined : `Unsafe instruction detected: ${parsed.reason}`,
      validationMethod: agentType === 'codex' ? 'codex-agent' : 'claude-agent',
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * OpenAI API 経由で検証を実行（既存ロジック）
   */
  private async validateWithLLM(instruction: string): Promise<ValidationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const prompt = this.buildPrompt(instruction);
        const response = await this.callOpenAI(prompt);
        const parsed = this.parseResponse(response);

        return {
          isValid: parsed.isSafe,
          confidence: parsed.confidence,
          reason: parsed.reason,
          category: parsed.category,
          errorMessage: parsed.isSafe ? undefined : `Unsafe instruction detected: ${parsed.reason}`,
          validationMethod: 'llm',
          validatedAt: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          `LLM validation attempt ${attempt}/${MAX_RETRIES} failed: ${getErrorMessage(error)}`,
        );

        if (attempt < MAX_RETRIES) {
          await this.sleep(attempt);
        }
      }
    }

    throw lastError ?? new Error('LLM validation failed after all retries');
  }

  /**
   * パターンマッチングでカスタム指示を検証
   *
   * LLM/エージェントが利用不可の場合の最終手段。
   * Issue #654 対応として SAFE_PATTERNS を追加し、誤検出を低減。
   *
   * @param instruction - 検証対象の指示文字列
   * @returns 検証結果（confidence は 'low' または 'medium'）
   */
  private validateWithPatterns(instruction: string): ValidationResult {
    // 安全なパターン（CLI コマンド等）を先にチェック
    const SAFE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /execute\s+--phase/i, label: 'CLIコマンド: execute --phase' },
      { pattern: /run\s+--/i, label: 'CLIコマンド: run --option' },
      { pattern: /npm\s+run/i, label: 'npm scripts' },
      { pattern: /node\s+dist\/index\.js/i, label: 'Node.js実行コマンド' },
      { pattern: /yarn\s+(run|build|test)/i, label: 'yarn scripts' },
      { pattern: /pnpm\s+(run|build|test)/i, label: 'pnpm scripts' },
    ];

    for (const { pattern, label } of SAFE_PATTERNS) {
      if (pattern.test(instruction)) {
        logger.debug(`Safe pattern matched: ${label}`);
        return {
          isValid: true,
          confidence: 'medium',
          reason: `CLI コマンドまたはスクリプト実行として認識: ${label}`,
          category: 'analysis',
          validationMethod: 'pattern',
          validatedAt: new Date().toISOString(),
        };
      }
    }

    // 危険なパターンをチェック（精度向上：単語境界を考慮）
    const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /削除して|delete\s+(?:this|the|these|all|every)/i, label: '削除指示' },
      { pattern: /修正して|変更して|fix\s+(?:this|the|it)\b/i, label: '変更指示' },
      { pattern: /コミット|プッシュ|\bcommit\b|\bpush\b/i, label: 'Git操作' },
      { pattern: /実行して|execute\s+(?:this|the|it)\b|run\s+(?:this|the|it)\b/i, label: 'コマンド実行' },
      { pattern: /書き換え|上書き|overwrite|rewrite/i, label: 'ファイル書き換え' },
    ];

    for (const { pattern, label } of DANGEROUS_PATTERNS) {
      if (pattern.test(instruction)) {
        logger.info(`Pattern matching detected dangerous pattern: ${label}`);
        return {
          isValid: false,
          confidence: 'low',
          reason: `静的パターンマッチングで危険な指示を検出: ${label}`,
          category: 'execution',
          errorMessage: `Potentially unsafe instruction detected by pattern matching: ${label}`,
          detectedPattern: label,
          validationMethod: 'pattern',
          validatedAt: new Date().toISOString(),
        };
      }
    }

    return {
      isValid: true,
      confidence: 'low',
      reason: '静的パターンマッチングで危険なパターンは検出されませんでした（LLM検証はスキップ）',
      category: 'analysis',
      validationMethod: 'pattern',
      validatedAt: new Date().toISOString(),
    };
  }

  // ===============================
  // プライベートメソッド - ユーティリティ
  // ===============================

  /**
   * エージェント応答から検証結果をパース
   *
   * エージェントからの応答は複数のメッセージを含む可能性があるため、
   * 各メッセージから JSON を抽出して検証結果として解釈する。
   *
   * @param messages - エージェントからの応答メッセージ配列
   * @returns パース済みの検証応答
   * @throws JSON パースに失敗した場合
   */
  private parseAgentResponse(messages: string[]): LLMValidationResponse {
    const textCandidates: string[] = [];

    for (const raw of messages) {
      // JSON として直接パースを試行
      const parsed = this.safeParse<Record<string, unknown>>(raw);

      if (parsed && typeof parsed === 'object') {
        // 直接 LLMValidationResponse 形式の場合
        if (this.isValidationResponse(parsed)) {
          return this.normalizeResponse(parsed);
        }

        // メッセージ構造からテキストを抽出
        const extracted = this.extractTextFromMessage(parsed);
        textCandidates.push(...extracted);

        // result フィールドがある場合
        if (typeof parsed.result === 'string') {
          textCandidates.push(parsed.result);
        }
      } else {
        textCandidates.push(raw);
      }
    }

    // テキスト候補から JSON を抽出してパース
    for (const candidate of textCandidates) {
      const result = this.tryParseValidationResponse(candidate);
      if (result) {
        return result;
      }
    }

    throw new Error('Failed to parse agent response as validation result');
  }

  private safeParse<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private isValidationResponse(obj: Record<string, unknown>): boolean {
    return (
      typeof obj.isSafe === 'boolean' &&
      typeof obj.reason === 'string' &&
      (obj.category === 'analysis' || obj.category === 'execution') &&
      (obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low')
    );
  }

  private normalizeResponse(obj: Record<string, unknown>): LLMValidationResponse {
    return {
      isSafe: obj.isSafe as boolean,
      reason: obj.reason as string,
      category: obj.category as 'analysis' | 'execution',
      confidence: obj.confidence as 'high' | 'medium' | 'low',
    };
  }

  private extractTextFromMessage(payload: Record<string, unknown>): string[] {
    const texts: string[] = [];
    const message = payload.message as Record<string, unknown> | undefined;

    if (message && typeof message === 'object') {
      const content = message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object') {
            const blockObj = block as Record<string, unknown>;
            if (blockObj.type === 'text' && typeof blockObj.text === 'string') {
              texts.push(blockObj.text);
            }
          }
        }
      }
    }

    return texts;
  }

  private tryParseValidationResponse(candidate: string): LLMValidationResponse | null {
    // コードブロック内の JSON を抽出
    const codeBlockMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const parsed = this.safeParse<Record<string, unknown>>(codeBlockMatch[1].trim());
      if (parsed && this.isValidationResponse(parsed)) {
        return this.normalizeResponse(parsed);
      }
    }

    // 直接 JSON としてパース
    const direct = this.safeParse<Record<string, unknown>>(candidate.trim());
    if (direct && this.isValidationResponse(direct)) {
      return this.normalizeResponse(direct);
    }

    // 埋め込み JSON を検索
    const jsonMatches = candidate.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        const parsed = this.safeParse<Record<string, unknown>>(match);
        if (parsed && this.isValidationResponse(parsed)) {
          return this.normalizeResponse(parsed);
        }
      }
    }

    return null;
  }

  private buildPrompt(instruction: string): string {
    const template = PromptLoader.loadPrompt('validation', 'validate-instruction');
    return template.replaceAll('{{instruction}}', instruction);
  }

  private parseResponse(response: string): LLMValidationResponse {
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const candidate = this.tryParse(codeBlockMatch[1]);
      if (candidate) {
        return candidate;
      }
    }

    const direct = this.tryParse(response);
    if (direct) {
      return direct;
    }

    const jsonMatches = response.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        const parsed = this.tryParse(match);
        if (parsed) {
          return parsed;
        }
      }
    }

    throw new Error('Failed to parse LLM response as JSON');
  }

  private tryParse(candidate: string): LLMValidationResponse | null {
    try {
      return this.validateAndParse(candidate.trim());
    } catch {
      return null;
    }
  }

  private validateAndParse(jsonStr: string): LLMValidationResponse {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('LLM response is not an object');
    }

    const record = parsed as Record<string, unknown>;
    const isSafe = record.isSafe;
    const reason = record.reason;
    const category = record.category;
    const confidence = record.confidence;

    if (typeof isSafe !== 'boolean') {
      throw new Error('Missing or invalid field: isSafe');
    }
    if (typeof reason !== 'string') {
      throw new Error('Missing or invalid field: reason');
    }
    if (category !== 'analysis' && category !== 'execution') {
      throw new Error('Invalid category value');
    }
    if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
      throw new Error('Invalid confidence value');
    }

    return {
      isSafe,
      reason,
      category,
      confidence,
    };
  }

  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client is not initialized.');
    }

    const completion = await this.openaiClient.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      { timeout: TIMEOUT_MS },
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM response is empty');
    }

    return content;
  }

  private async sleep(attempt: number): Promise<void> {
    const delayMs = Math.pow(2, attempt - 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
