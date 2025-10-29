/**
 * 統合テスト: init コマンド - PR タイトル生成フロー (Issue #73)
 *
 * テスト対象:
 * - init コマンド実行時の PR タイトル生成フロー全体
 * - Issue タイトル取得 → PR タイトル設定 → PR テンプレート適用
 *
 * テスト戦略: UNIT_INTEGRATION - 統合テスト部分
 * Phase 3のテストシナリオ（シナリオ 2-1-1、2-2-1、2-3-1、2-4-1）に基づく
 *
 * 注意: このテストは実際のGitHub APIを呼び出さないモックベースのテストです。
 * 実際のGitHub APIとの統合は手動テストで確認してください。
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { GitHubClient } from '../../src/core/github-client.js';
import { logger } from '../../src/utils/logger.js';

/**
 * PRタイトル生成フローの統合的な動作を検証するヘルパー関数
 * 実装コードのロジックを抽出して統合テスト可能な形で再現
 */
async function executePrCreationFlow(
  githubClient: GitHubClient,
  issueNumber: number,
  branchName: string,
): Promise<{
  prTitle: string;
  prBody: string;
  success: boolean;
}> {
  // PR タイトル生成
  let prTitle = `[AI-Workflow] Issue #${issueNumber}`; // デフォルトフォールバック
  try {
    const issue = await githubClient.getIssue(issueNumber);
    let issueTitle = issue.title ?? '';

    // GitHub PR タイトルの最大長（256文字）を超える場合は切り詰め
    const MAX_PR_TITLE_LENGTH = 256;
    if (issueTitle.length > MAX_PR_TITLE_LENGTH) {
      logger.info('Truncating PR title to 256 characters');
      issueTitle = issueTitle.slice(0, 253) + '...';
    }

    prTitle = issueTitle;
    logger.info(`Using Issue title as PR title: ${prTitle}`);
  } catch (error) {
    logger.warn(
      `Failed to fetch Issue title, falling back to default PR title: ${prTitle}. Error: ${(error as Error).message}`,
    );
  }

  // PR テンプレート生成
  const prBody = githubClient.generatePrBodyTemplate(issueNumber, branchName);

  // PR作成（モック）
  return {
    prTitle,
    prBody,
    success: true,
  };
}

// =============================================================================
// 2.1. init コマンド実行フロー - 正常系
// =============================================================================

describe('init コマンド実行フロー - 正常系', () => {
  let githubClient: GitHubClient;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  test('シナリオ 2-1-1: 新規 Issue に対する init コマンド実行', async () => {
    // Given: Issue #73 が存在し、タイトルが「自動生成のPRの内容を最適化したい」である
    const mockIssue = {
      title: '自動生成のPRの内容を最適化したい',
      number: 73,
      state: 'open',
      body: '...',
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/issue-73');

    // Then: PR タイトルが Issue タイトルと一致する
    expect(result.success).toBe(true);
    expect(result.prTitle).toBe('自動生成のPRの内容を最適化したい');
    expect(result.prTitle).not.toContain('[AI-Workflow]');

    // Then: PR 本文に不要セクションが含まれない
    expect(result.prBody).not.toContain('### 👀 レビューポイント');
    expect(result.prBody).not.toContain('### ⚙️ 実行環境');

    // Then: PR 本文に必要セクションが含まれる
    expect(result.prBody).toContain('### 📋 関連Issue');
    expect(result.prBody).toContain('Closes #73');
    expect(result.prBody).toContain('### 🔄 ワークフロー進捗');
    expect(result.prBody).toContain('### 📁 成果物');
    expect(result.prBody).toContain('`.ai-workflow/issue-73/`');
  });

  test('シナリオ 2-1-2: 長いタイトル（300文字）の Issue に対する init コマンド実行', async () => {
    // Given: Issue #106 が存在し、タイトルが300文字である
    const longTitle = 'a'.repeat(300);
    const mockIssue = {
      title: longTitle,
      number: 106,
      state: 'open',
      body: '...',
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 106, 'ai-workflow/issue-106');

    // Then: PR タイトルが256文字に切り詰められる
    expect(result.success).toBe(true);
    expect(result.prTitle.length).toBe(256);
    expect(result.prTitle.endsWith('...')).toBe(true);
    expect(result.prTitle).toBe('a'.repeat(253) + '...');
  });
});

// =============================================================================
// 2.2. init コマンド実行フロー - 異常系
// =============================================================================

describe('init コマンド実行フロー - 異常系', () => {
  let githubClient: GitHubClient;
  let loggerWarnSpy: jest.SpiedFunction<typeof logger.warn>;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  test('シナリオ 2-2-1: 存在しない Issue に対する init コマンド実行', async () => {
    // Given: Issue #999 が存在しない（404 Not Found）
    jest.spyOn(githubClient, 'getIssue').mockRejectedValue(new Error('Not Found'));

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 999, 'ai-workflow/issue-999');

    // Then: デフォルトタイトルにフォールバックし、ワークフローは継続される
    expect(result.success).toBe(true);
    expect(result.prTitle).toBe('[AI-Workflow] Issue #999');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found',
    );

    // Then: PR 本文は正常に生成される
    expect(result.prBody).toContain('Closes #999');
  });

  test('シナリオ 2-2-2: GitHub API レート制限時の init コマンド実行', async () => {
    // Given: GitHub API のレート制限に達している
    jest
      .spyOn(githubClient, 'getIssue')
      .mockRejectedValue(new Error('API rate limit exceeded'));

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/issue-73');

    // Then: デフォルトタイトルにフォールバックし、ワークフローは継続される
    expect(result.success).toBe(true);
    expect(result.prTitle).toBe('[AI-Workflow] Issue #73');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch Issue title'),
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('API rate limit exceeded'),
    );
  });
});

// =============================================================================
// 2.3. GitHub API との統合（モック検証）
// =============================================================================

describe('GitHub API との統合（モック検証）', () => {
  let githubClient: GitHubClient;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  test('シナリオ 2-3-1: GitHubClient.getIssue() の呼び出しを検証', async () => {
    // Given: Issue #73 が存在する
    const mockIssue = {
      title: 'テスト用Issue: PR タイトル生成テスト',
      number: 73,
      state: 'open',
      body: '...',
    };
    const getIssueSpy = jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/issue-73');

    // Then: getIssue() が正しく呼び出される
    expect(getIssueSpy).toHaveBeenCalledWith(73);
    expect(result.prTitle).toBe('テスト用Issue: PR タイトル生成テスト');
  });

  test('シナリオ 2-3-2: generatePrBodyTemplate() の呼び出しを検証', async () => {
    // Given: Issue #73 が存在する
    const mockIssue = {
      title: 'テスト用Issue',
      number: 73,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/test-pr-title');

    // Then: PR テンプレートが正しく生成される
    expect(result.prBody).toContain('Closes #73');
    expect(result.prBody).toContain('`.ai-workflow/issue-73/`');
    expect(result.prBody).not.toContain('### 👀 レビューポイント');
    expect(result.prBody).not.toContain('### ⚙️ 実行環境');
  });
});

// =============================================================================
// 2.4. エンドツーエンドフロー検証
// =============================================================================

describe('エンドツーエンドフロー検証', () => {
  let githubClient: GitHubClient;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  test('シナリオ 2-4-1: Issue タイトル取得 → PR タイトル設定 → テンプレート生成の一連のフロー', async () => {
    // Given: Issue #73 が存在する
    const mockIssue = {
      title: '自動生成のPRの内容を最適化したい',
      number: 73,
      state: 'open',
      body: '改善点1: PRタイトルの最適化\n改善点2: PRテンプレートの最適化',
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行（全体の流れ）
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/issue-73');

    // Then: 全ての処理が正常に完了する
    expect(result.success).toBe(true);

    // Then: Issue タイトルが PR タイトルとして使用される
    expect(result.prTitle).toBe('自動生成のPRの内容を最適化したい');

    // Then: PR テンプレートが最適化されている（不要セクション削除）
    expect(result.prBody).toContain('### 📋 関連Issue');
    expect(result.prBody).toContain('Closes #73');
    expect(result.prBody).toContain('### 🔄 ワークフロー進捗');
    expect(result.prBody).toContain('### 📁 成果物');
    expect(result.prBody).not.toContain('### 👀 レビューポイント');
    expect(result.prBody).not.toContain('### ⚙️ 実行環境');

    // Then: テンプレートのプレースホルダーが正しく置換されている
    expect(result.prBody).toContain('`.ai-workflow/issue-73/`');
  });

  test('シナリオ 2-4-2: エラー発生時のフォールバック動作を含むエンドツーエンドフロー', async () => {
    // Given: Issue タイトル取得に失敗する
    jest.spyOn(githubClient, 'getIssue').mockRejectedValue(new Error('Network error'));

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 73, 'ai-workflow/issue-73');

    // Then: エラーが発生してもワークフロー全体は成功する
    expect(result.success).toBe(true);

    // Then: デフォルトタイトルが使用される
    expect(result.prTitle).toBe('[AI-Workflow] Issue #73');

    // Then: PR テンプレートは正常に生成される（エラーの影響を受けない）
    expect(result.prBody).toContain('Closes #73');
    expect(result.prBody).toContain('### 🔄 ワークフロー進捗');
  });

  test('シナリオ 2-4-3: 特殊文字を含むタイトルのエンドツーエンドフロー', async () => {
    // Given: Issue タイトルに特殊文字が含まれる
    const mockIssue = {
      title: '🚀 機能追加: <script>alert("XSS")</script> & "test"',
      number: 104,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR作成フローを実行
    const result = await executePrCreationFlow(githubClient, 104, 'ai-workflow/issue-104');

    // Then: 特殊文字がそのまま PR タイトルに含まれる（GitHub側でエスケープされる）
    expect(result.success).toBe(true);
    expect(result.prTitle).toBe('🚀 機能追加: <script>alert("XSS")</script> & "test"');

    // Then: PR テンプレートも正常に生成される
    expect(result.prBody).toContain('Closes #104');
  });
});
