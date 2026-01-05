import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../metadata-manager.js';
import { SupportedLanguage } from '../../types.js';

/**
 * 言語別テキストマッピング（Issue #587）
 */
const REVIEW_TEXT: Record<
  SupportedLanguage,
  {
    reviewResult: string;
    phase: string;
    decision: string;
    feedback: string;
    suggestions: string;
    footer: string;
    phaseNames: Record<string, string>;
  }
> = {
  ja: {
    reviewResult: 'レビュー結果',
    phase: 'フェーズ',
    decision: '判定',
    feedback: 'フィードバック',
    suggestions: '改善提案',
    footer: 'AI駆動開発自動化ワークフロー - クリティカルシンキングレビュー',
    phaseNames: {
      requirements: '要件定義',
      design: '設計',
      test_scenario: 'テストシナリオ',
      implementation: '実装',
      testing: 'テスト',
      documentation: 'ドキュメント',
    },
  },
  en: {
    reviewResult: 'Review Result',
    phase: 'Phase',
    decision: 'Decision',
    feedback: 'Feedback',
    suggestions: 'Suggestions',
    footer: 'AI-driven development automation workflow - Critical thinking review',
    phaseNames: {
      requirements: 'Requirements',
      design: 'Design',
      test_scenario: 'Test Scenario',
      implementation: 'Implementation',
      testing: 'Testing',
      documentation: 'Documentation',
    },
  },
};

/**
 * ReviewClient handles review result posting operations with GitHub API.
 * Responsibilities:
 * - Review result comment posting (postReviewResult)
 */
export class ReviewClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Posts a formatted review result comment to an issue.
   * Supports PASS, PASS_WITH_SUGGESTIONS, and FAIL results with suggestions.
   */
  public async postReviewResult(
    issueNumber: number,
    phase: string,
    result: string,
    feedback: string,
    suggestions: string[],
    metadata: MetadataManager,
  ) {
    const emojiMap: Record<string, string> = {
      PASS: '✅',
      PASS_WITH_SUGGESTIONS: '⚠️',
      FAIL: '❌',
    };

    // 言語取得（Issue #587）
    const language = metadata.getLanguage() || 'ja';
    const text = REVIEW_TEXT[language];

    const emoji = emojiMap[result] ?? '📝';
    const phaseLabel = text.phaseNames[phase] ?? phase;

    let body = `## ${emoji} ${text.reviewResult} - ${phaseLabel}${text.phase}\n\n`;
    body += `**${text.decision}**: ${result}\n\n`;

    if (feedback) {
      body += `### ${text.feedback}\n\n${feedback}\n\n`;
    }

    if (suggestions.length) {
      body += `### ${text.suggestions}\n\n`;
      suggestions.forEach((item, index) => {
        body += `${index + 1}. ${item}\n`;
      });
      body += '\n';
    }

    body += '---\n';
    body += `*${text.footer}*`;

    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });

    return data;
  }
}
