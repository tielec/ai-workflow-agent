import { GitHubClient } from './github-client.js';
import { config } from './config.js';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { IssueCandidateResult, IssueSimilarityResult } from '../types.js';
import cosineSimilarity from 'cosine-similarity';
import OpenAI from 'openai';

/**
 * 重複検出エンジン
 * 2段階判定方式: コサイン類似度 → LLM意味的判定
 */
export class IssueDeduplicator {
  private githubClient: GitHubClient;
  private openaiClient: OpenAI | null;
  private cache: Map<string, IssueSimilarityResult[]>;

  constructor() {
    const githubToken = config.getGitHubToken();
    const repository = config.getGitHubRepository();

    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable is not set');
    }

    this.githubClient = new GitHubClient(githubToken, repository);

    const openaiApiKey = config.getOpenAiApiKey();
    this.openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

    this.cache = new Map();
  }

  /**
   * 類似するIssueを検出
   * @param candidate - Issue候補
   * @param threshold - 類似度閾値（デフォルト: 0.8）
   * @returns 類似Issue一覧
   */
  public async findSimilarIssues(
    candidate: IssueCandidateResult,
    threshold = 0.8,
  ): Promise<IssueSimilarityResult[]> {
    // キャッシュチェック
    const cacheKey = this.getCacheKey(candidate);
    if (this.cache.has(cacheKey)) {
      logger.debug(`Cache hit for candidate: ${candidate.title}`);
      return this.cache.get(cacheKey)!;
    }

    logger.debug(`Checking for similar issues: ${candidate.title}`);

    // 1. 既存Issue一覧を取得
    const existingIssues = await this.githubClient.getIssueClient().listAllIssues();
    logger.debug(`Found ${existingIssues.length} existing issues.`);

    // 2. 第1段階: コサイン類似度でフィルタリング（高速）
    const cosineCandidates = this.filterByCosineSimilarity(candidate, existingIssues, 0.6);
    logger.debug(`After cosine similarity: ${cosineCandidates.length} candidates.`);

    if (cosineCandidates.length === 0) {
      this.cache.set(cacheKey, []);
      return [];
    }

    // 3. 第2段階: LLM意味的判定（精密）
    const similarIssues: IssueSimilarityResult[] = [];
    for (const existingIssue of cosineCandidates) {
      const semanticScore = await this.calculateSemanticSimilarity(candidate, existingIssue);
      if (semanticScore >= threshold) {
        similarIssues.push({
          issueNumber: existingIssue.number,
          issueTitle: existingIssue.title,
          similarityScore: semanticScore,
          isDuplicate: true,
        });
      }
    }

    // キャッシュ保存
    this.cache.set(cacheKey, similarIssues);
    return similarIssues;
  }

  /**
   * 第1段階: コサイン類似度フィルタリング
   */
  private filterByCosineSimilarity(
    candidate: IssueCandidateResult,
    existingIssues: Array<{ number: number; title: string; body: string }>,
    threshold: number,
  ): Array<{ number: number; title: string; body: string }> {
    const candidateVector = this.textToVector(candidate.title + ' ' + candidate.description);
    const results: Array<{ issue: { number: number; title: string; body: string }; score: number }> = [];

    for (const issue of existingIssues) {
      const issueVector = this.textToVector(issue.title + ' ' + issue.body);

      // cosineSimilarityは配列を返すので、最初の要素を取得
      const scoreArray = cosineSimilarity(candidateVector, issueVector);
      const score = Array.isArray(scoreArray) ? scoreArray[0] : scoreArray;

      if (score >= threshold) {
        results.push({ issue, score });
      }
    }

    // スコア降順でソート
    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.issue);
  }

  /**
   * 第2段階: LLM意味的類似度判定
   */
  private async calculateSemanticSimilarity(
    candidate: IssueCandidateResult,
    existingIssue: { number: number; title: string; body: string },
  ): Promise<number> {
    if (!this.openaiClient) {
      logger.warn('OpenAI API key not configured. Skipping semantic similarity check.');
      return 0.0;
    }

    try {
      const prompt = `
以下の2つのIssueは意味的に類似していますか？0.0〜1.0のスコアで類似度を判定してください。

Issue候補:
タイトル: ${candidate.title}
説明: ${candidate.description}

既存Issue #${existingIssue.number}:
タイトル: ${existingIssue.title}
説明: ${existingIssue.body.substring(0, 500)}...

判定基準:
- 0.9〜1.0: ほぼ同じ問題を指摘している（重複）
- 0.7〜0.9: 類似した問題だが、異なる側面を扱っている
- 0.5〜0.7: 関連はあるが、別の問題
- 0.0〜0.5: 無関係

出力形式: 数値のみ（例: 0.85）
`;

      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? '0.0';
      const score = parseFloat(content);

      if (isNaN(score)) {
        logger.warn(`Failed to parse LLM response: ${content}`);
        return 0.0;
      }

      logger.debug(`Semantic similarity (Issue #${existingIssue.number}): ${score}`);
      return score;
    } catch (error) {
      logger.error(`LLM semantic similarity failed: ${getErrorMessage(error)}`);
      return 0.0;
    }
  }

  /**
   * テキストをベクトル化（簡易実装: 単語頻度ベース）
   */
  private textToVector(text: string): number[] {
    const words = text.toLowerCase().match(/\w+/g) ?? [];
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }

    // 頻度の高い上位100単語をベクトル化
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    return topWords.map(([, freq]) => freq);
  }

  /**
   * キャッシュキー生成
   */
  private getCacheKey(candidate: IssueCandidateResult): string {
    return `${candidate.category}:${candidate.title}:${candidate.file}:${candidate.lineNumber}`;
  }
}
