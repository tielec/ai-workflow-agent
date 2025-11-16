import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { RepositoryAnalyzer } from '../core/repository-analyzer.js';
import { IssueDeduplicator } from '../core/issue-deduplicator.js';
import { IssueGenerator } from '../core/issue-generator.js';
import type { AutoIssueOptions, IssueCategory, IssueCandidateResult } from '../types.js';

/**
 * auto-issueコマンドハンドラ
 * @param options - CLIオプション
 */
export async function handleAutoIssueCommand(options: AutoIssueOptions): Promise<void> {
  try {
    // 1. オプション解析・バリデーション
    validateAutoIssueOptions(options);
    logger.info('Starting auto-issue process...');
    logger.info(`Category: ${options.category}`);
    logger.info(`Limit: ${options.limit}`);
    logger.info(`Dry-run: ${options.dryRun}`);
    logger.info(`Similarity threshold: ${options.similarityThreshold}`);

    // 2. リポジトリ探索
    const analyzer = new RepositoryAnalyzer();
    const candidates = await analyzeByCategoryPhase1(analyzer, options.category);
    logger.info(`Found ${candidates.length} issue candidates.`);

    // 3. 重複検出
    const deduplicator = new IssueDeduplicator();
    const uniqueCandidates = await filterDuplicates(
      deduplicator,
      candidates,
      options.similarityThreshold,
    );
    logger.info(`After deduplication: ${uniqueCandidates.length} unique candidates.`);

    // 4. 上限適用
    const limitedCandidates = uniqueCandidates.slice(0, options.limit);

    // 5. Issue生成（またはドライラン表示）
    const generator = new IssueGenerator();
    if (options.dryRun) {
      displayDryRunResults(limitedCandidates);
    } else {
      await generator.generateIssues(limitedCandidates);
      logger.info(`Successfully created ${limitedCandidates.length} issues.`);
    }

    // 6. サマリー表示
    displaySummary(candidates.length, uniqueCandidates.length, limitedCandidates.length);
  } catch (error) {
    logger.error(`Auto-issue command failed: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * オプションバリデーション
 */
function validateAutoIssueOptions(options: AutoIssueOptions): void {
  if (options.limit < 1 || options.limit > 50) {
    throw new Error('Limit must be between 1 and 50.');
  }
  if (options.similarityThreshold < 0 || options.similarityThreshold > 1) {
    throw new Error('Similarity threshold must be between 0.0 and 1.0.');
  }
  // Phase 3でcreativeModeのバリデーション追加
}

/**
 * Phase 1: バグ検出のみ
 * Phase 2/3: 他のカテゴリを追加
 */
async function analyzeByCategoryPhase1(
  analyzer: RepositoryAnalyzer,
  category: IssueCategory | 'all',
): Promise<IssueCandidateResult[]> {
  const results: IssueCandidateResult[] = [];

  if (category === 'bug' || category === 'all') {
    const bugCandidates = await analyzer.analyzeForBugs();
    results.push(...bugCandidates);
  }

  // Phase 2で追加
  // if (category === 'refactor' || category === 'all') {
  //   const refactorCandidates = await analyzer.analyzeForRefactoring();
  //   results.push(...refactorCandidates);
  // }

  // Phase 3で追加
  // if (category === 'enhancement' || category === 'all') {
  //   const enhancementCandidates = await analyzer.analyzeForEnhancements();
  //   results.push(...enhancementCandidates);
  // }

  return results;
}

/**
 * 重複検出フィルタリング
 */
async function filterDuplicates(
  deduplicator: IssueDeduplicator,
  candidates: IssueCandidateResult[],
  threshold: number,
): Promise<IssueCandidateResult[]> {
  const uniqueCandidates: IssueCandidateResult[] = [];

  for (const candidate of candidates) {
    const similarIssues = await deduplicator.findSimilarIssues(candidate, threshold);
    if (similarIssues.length === 0) {
      uniqueCandidates.push(candidate);
    } else {
      logger.info(
        `Skipping duplicate candidate: "${candidate.title}" (similar to Issue #${similarIssues[0].issueNumber})`,
      );
    }
  }

  return uniqueCandidates;
}

/**
 * ドライラン結果表示
 */
function displayDryRunResults(candidates: IssueCandidateResult[]): void {
  logger.info('');
  logger.info('='.repeat(80));
  logger.info('[Dry Run] The following issues would be created:');
  logger.info('='.repeat(80));

  candidates.forEach((candidate, index) => {
    logger.info('');
    logger.info(`Issue #${index + 1}: ${candidate.title} (${candidate.category})`);
    logger.info(`  Priority: ${candidate.priority}`);
    logger.info(`  File: ${candidate.file}:${candidate.lineNumber}`);
    logger.info(`  Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
    logger.info(`  Description: ${candidate.description.substring(0, 100)}...`);
  });

  logger.info('');
  logger.info('='.repeat(80));
}

/**
 * サマリー表示
 */
function displaySummary(
  totalCandidates: number,
  uniqueCandidates: number,
  createdIssues: number,
): void {
  logger.info('');
  logger.info('='.repeat(80));
  logger.info('Summary');
  logger.info('='.repeat(80));
  logger.info(`- Total candidates: ${totalCandidates}`);
  logger.info(`- Duplicate skipped: ${totalCandidates - uniqueCandidates}`);
  logger.info(`- Issues created: ${createdIssues}`);
  logger.info('='.repeat(80));
}
