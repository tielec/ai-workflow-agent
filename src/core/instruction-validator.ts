import * as fs from 'node:fs';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { config } from './config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { resolveProjectPath } from './path-utils.js';
import type {
  LLMValidationResponse,
  ValidationCacheEntry,
  ValidationResult,
} from '../types/auto-issue.js';

const PROMPT_PATH = resolveProjectPath('src', 'prompts', 'validation', 'validate-instruction.txt');
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const MODEL = 'gpt-4o-mini';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 1000;

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

export class InstructionValidator {
  private static readonly cache = new ValidationCache();
  private static readonly openAiClient: OpenAI | null = (() => {
    const apiKey = config.getOpenAiApiKey();
    if (!apiKey) {
      logger.warn('OPENAI_API_KEY is not configured. Instruction validation will use pattern fallback.');
      return null;
    }
    return new OpenAI({ apiKey });
  })();

  /**
   * カスタム指示の安全性を検証
   * @param instruction 検証対象のカスタム指示文字列
   * @returns 検証結果
   */
  public static async validate(instruction: string): Promise<ValidationResult> {
    const trimmed = instruction.trim();
    if (!trimmed) {
      throw new Error('Instruction cannot be empty');
    }

    if (trimmed.length > 2000) {
      logger.warn('Instruction exceeds 2000 characters, proceeding without truncation.');
    }

    const hash = ValidationCache.computeHash(trimmed);
    const cached = InstructionValidator.cache.get(hash);
    if (cached) {
      logger.debug(`Instruction validation cache hit: ${hash.substring(0, 8)}...`);
      return cached;
    }

    let result: ValidationResult;
    if (!InstructionValidator.openAiClient) {
      logger.warn('Skipping LLM validation because OpenAI client is not initialized.');
      result = InstructionValidator.validateWithPatterns(trimmed);
    } else {
      try {
        result = await InstructionValidator.validateWithLLM(trimmed);
        logger.info(
          `Instruction validated via LLM: isValid=${result.isValid}, confidence=${result.confidence}`,
        );
      } catch (error) {
        logger.warn(
          `LLM validation failed, falling back to pattern matching: ${getErrorMessage(error)}`,
        );
        result = InstructionValidator.validateWithPatterns(trimmed);
      }
    }

    InstructionValidator.cache.set(hash, result);
    return result;
  }

  private static async validateWithLLM(instruction: string): Promise<ValidationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const prompt = InstructionValidator.buildPrompt(instruction);
        const response = await InstructionValidator.callOpenAI(prompt);
        const parsed = InstructionValidator.parseResponse(response);

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
          await InstructionValidator.sleep(attempt);
        }
      }
    }

    throw lastError ?? new Error('LLM validation failed after all retries');
  }

  private static validateWithPatterns(instruction: string): ValidationResult {
    const DANGEROUS_PATTERNS = [
      { pattern: /削除して|delete\s+(?:this|the|these)/i, label: '削除指示' },
      { pattern: /修正して|変更して|fix\s+(?:this|the)/i, label: '変更指示' },
      { pattern: /コミット|プッシュ|commit|push/i, label: 'Git操作' },
      { pattern: /実行して|execute|run\s+(?:this|the)/i, label: 'コマンド実行' },
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

  private static buildPrompt(instruction: string): string {
    if (!fs.existsSync(PROMPT_PATH)) {
      throw new Error(`Instruction validation prompt not found: ${PROMPT_PATH}`);
    }
    const template = fs.readFileSync(PROMPT_PATH, 'utf-8');
    return template.replaceAll('{{instruction}}', instruction);
  }

  private static parseResponse(response: string): LLMValidationResponse {
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const candidate = InstructionValidator.tryParse(codeBlockMatch[1]);
      if (candidate) {
        return candidate;
      }
    }

    const direct = InstructionValidator.tryParse(response);
    if (direct) {
      return direct;
    }

    const jsonMatches = response.match(/\{[\s\S]*?\}/g);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        const parsed = InstructionValidator.tryParse(match);
        if (parsed) {
          return parsed;
        }
      }
    }

    throw new Error('Failed to parse LLM response as JSON');
  }

  private static tryParse(candidate: string): LLMValidationResponse | null {
    try {
      return InstructionValidator.validateAndParse(candidate.trim());
    } catch {
      return null;
    }
  }

  private static validateAndParse(jsonStr: string): LLMValidationResponse {
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

  private static async callOpenAI(prompt: string): Promise<string> {
    if (!InstructionValidator.openAiClient) {
      throw new Error('OpenAI client is not initialized.');
    }

    const completion = await InstructionValidator.openAiClient.chat.completions.create(
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

  private static async sleep(attempt: number): Promise<void> {
    const delayMs = Math.pow(2, attempt - 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
