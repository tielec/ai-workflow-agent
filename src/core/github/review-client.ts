import { Octokit } from '@octokit/rest';

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
  ) {
    const emojiMap: Record<string, string> = {
      PASS: '✅',
      PASS_WITH_SUGGESTIONS: '⚠️',
      FAIL: '❌',
    };

    const phaseNames: Record<string, string> = {
      requirements: '要件定義',
      design: '設計',
      test_scenario: 'テストシナリオ',
      implementation: '実装',
      testing: 'テスト',
      documentation: 'ドキュメント',
    };

    const emoji = emojiMap[result] ?? '📝';
    const phaseLabel = phaseNames[phase] ?? phase;

    let body = `## ${emoji} レビュー結果 - ${phaseLabel}フェーズ\n\n`;
    body += `**判定**: ${result}\n\n`;

    if (feedback) {
      body += `### フィードバック\n\n${feedback}\n\n`;
    }

    if (suggestions.length) {
      body += '### 改善提案\n\n';
      suggestions.forEach((item, index) => {
        body += `${index + 1}. ${item}\n`;
      });
      body += '\n';
    }

    body += '---\n';
    body += '*AI駆動開発自動化ワークフロー - クリティカルシンキングレビュー*';

    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });

    return data;
  }
}
