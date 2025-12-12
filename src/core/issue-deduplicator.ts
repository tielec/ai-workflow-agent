/**
 * IssueDeduplicator - 重複Issue検出機能
 *
 * コサイン類似度とLLM判定の2段階フィルタリングにより、
 * 既存Issueとの重複を検出します。
 *
 * @module issue-deduplicator
 */

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from './config.js';
import OpenAI from 'openai';
import type { BugCandidate } from '../types/auto-issue.js';

/**
 * 既存Issue情報（簡略版）
 */
export interface ExistingIssue {
  number: number;
  title: string;
  body: string;
}

/**
 * IssueDeduplicator クラス
 *
 * コサイン類似度による初期フィルタリングとLLM判定による最終判定の
 * 2段階フィルタリングにより、既存Issueとの重複を検出します。
 *
 * OPENAI_API_KEY が未設定の場合はコサイン類似度のみで判定します。
 */
export class IssueDeduplicator {
  private openaiClient: OpenAI | null;

  /**
   * コンストラクタ
   *
   * OPENAI_API_KEY が設定されている場合はLLM判定を有効化します。
   * 未設定の場合はコサイン類似度のみで判定します（警告ログを出力）。
   */
  constructor() {
    const apiKey = config.getOpenAiApiKey();
    if (apiKey) {
      this.openaiClient = new OpenAI({ apiKey });
      logger.debug('IssueDeduplicator initialized with LLM support (OpenAI API)');
    } else {
      this.openaiClient = null;
      logger.warn(
        'OPENAI_API_KEY is not set. Duplicate detection will use cosine similarity only (LLM validation disabled).',
      );
    }
  }

  /**
   * 重複Issueをフィルタリング
   *
   * @param candidates - バグ候補のリスト
   * @param existingIssues - 既存Issueのリスト
   * @param threshold - 類似度閾値（0.0〜1.0、デフォルト: 0.8）
   * @returns 重複を除外したバグ候補のリスト
   */
  public async filterDuplicates(
    candidates: BugCandidate[],
    existingIssues: ExistingIssue[],
    threshold = 0.8,
  ): Promise<BugCandidate[]> {
    logger.info(
      `Filtering duplicates: ${candidates.length} candidates, ${existingIssues.length} existing issues, threshold: ${threshold}`,
    );

    const filtered: BugCandidate[] = [];

    for (const candidate of candidates) {
      let isDuplicate = false;
      let maxSimilarity = 0;
      let duplicateIssue: ExistingIssue | null = null;

      // 第1段階: コサイン類似度でフィルタリング
      for (const issue of existingIssues) {
        const candidateText = `${candidate.title} ${candidate.description}`;
        const issueText = `${issue.title} ${issue.body}`;

        const similarity = this.calculateCosineSimilarity(candidateText, issueText);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }

        logger.debug(
          `Similarity with Issue #${issue.number}: ${similarity.toFixed(2)} (candidate: "${candidate.title}")`,
        );

        if (similarity >= threshold) {
          // 第2段階: LLM判定（LLM無効の場合はコサイン類似度のみで判定）
          if (this.openaiClient) {
            const llmResult = await this.checkDuplicateWithLLM(candidate, issue);
            if (llmResult) {
              logger.info(
                `Duplicate detected (LLM confirmed): "${candidate.title}" (similar to Issue #${issue.number}, similarity: ${similarity.toFixed(2)})`,
              );
              isDuplicate = true;
              duplicateIssue = issue;
              break;
            }
          } else {
            // LLM無効の場合: コサイン類似度のみで重複と判定
            logger.info(
              `Duplicate detected (cosine similarity only): "${candidate.title}" (similar to Issue #${issue.number}, similarity: ${similarity.toFixed(2)})`,
            );
            isDuplicate = true;
            duplicateIssue = issue;
            break;
          }
        }
      }

      if (!isDuplicate) {
        filtered.push(candidate);
        logger.debug(
          `Candidate "${candidate.title}" passed duplicate check (max similarity: ${maxSimilarity.toFixed(2)})`,
        );
      } else if (duplicateIssue) {
        logger.debug(
          `Candidate "${candidate.title}" filtered as duplicate of Issue #${duplicateIssue.number}`,
        );
      }
    }

    logger.info(
      `After deduplication: ${filtered.length} candidates (filtered ${candidates.length - filtered.length})`,
    );

    return filtered;
  }

  /**
   * コサイン類似度を計算
   *
   * TF-IDFベクトル化（簡易実装）を使用してコサイン類似度を計算します。
   *
   * @param text1 - テキスト1
   * @param text2 - テキスト2
   * @returns 類似度スコア（0.0〜1.0）
   */
  private calculateCosineSimilarity(text1: string, text2: string): number {
    // TF-IDFベクトル化（簡易実装）
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    // 空文字列チェック
    if (words1.length === 0 || words2.length === 0) {
      return 0.0;
    }

    const uniqueWords = new Set([...words1, ...words2]);
    const vector1: number[] = [];
    const vector2: number[] = [];

    for (const word of uniqueWords) {
      vector1.push(words1.filter((w) => w === word).length);
      vector2.push(words2.filter((w) => w === word).length);
    }

    // コサイン類似度計算
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));

    // ゼロ除算回避
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0.0;
    }

    const similarity = dotProduct / (magnitude1 * magnitude2);

    // 浮動小数点誤差を吸収し、理論上1.0になるケースを正規化
    if (Math.abs(similarity - 1.0) < 1e-12) {
      return 1.0;
    }

    return similarity;
  }

  /**
   * LLMで重複を判定
   *
   * OpenAI API（gpt-4o-mini）を使用して、意味的類似度の最終判定を行います。
   *
   * @param candidate - バグ候補
   * @param issue - 既存Issue
   * @returns 重複判定結果（true: 重複、false: 非重複）
   */
  private async checkDuplicateWithLLM(
    candidate: BugCandidate,
    issue: ExistingIssue,
  ): Promise<boolean> {
    // OpenAI クライアントが初期化されていない場合はフォールバック
    if (!this.openaiClient) {
      logger.debug('LLM check skipped: OpenAI client not initialized');
      return false;
    }

    const prompt = `
以下の2つのIssueは重複していますか？

Issue 1:
タイトル: ${candidate.title}
内容: ${candidate.description}

Issue 2:
タイトル: ${issue.title}
内容: ${issue.body}

回答: YES（重複） または NO（重複なし）のみで回答してください。
  `.trim();

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 10,
      });

      const answer = response.choices[0]?.message?.content?.trim().toUpperCase();
      const isDuplicate = answer?.includes('YES') ?? false;

      logger.debug(
        `LLM duplicate check: candidate "${candidate.title}" vs Issue #${issue.number} => ${answer} (${isDuplicate ? 'DUPLICATE' : 'NOT DUPLICATE'})`,
      );

      return isDuplicate;
    } catch (error) {
      logger.warn(
        `LLM duplicate check failed: ${getErrorMessage(error)}. Assuming non-duplicate (fallback).`,
      );
      // フォールバック: コサイン類似度のみで判定（LLM失敗時は非重複と判定）
      return false;
    }
  }
}
