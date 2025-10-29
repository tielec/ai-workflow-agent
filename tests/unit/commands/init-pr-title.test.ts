/**
 * ユニットテスト: init コマンド - PR タイトル生成ロジック
 *
 * テスト対象:
 * - PR タイトル生成ロジック（Issue タイトル取得、エラーハンドリング、長いタイトル切り詰め）
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 * Phase 3のテストシナリオに基づく17個のテストケースを実装
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { GitHubClient } from '../../../src/core/github-client.js';
import { logger } from '../../../src/utils/logger.js';
import fs from 'fs-extra';

// =============================================================================
// PR タイトル生成ロジックのモック化
// =============================================================================

/**
 * PRタイトル生成ロジックを抽出した関数（テスト用）
 * 実装コードから抽出したロジックをテスト可能な形で再現
 */
async function generatePrTitle(
  githubClient: GitHubClient,
  issueNumber: number,
): Promise<string> {
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

  return prTitle;
}

// =============================================================================
// 1.1. PR タイトル生成ロジック - 正常系
// =============================================================================

describe('PR タイトル生成ロジック - 正常系', () => {
  let githubClient: GitHubClient;
  let loggerInfoSpy: jest.SpiedFunction<typeof logger.info>;

  beforeEach(() => {
    // GitHub トークンとリポジトリ名はダミー値を使用
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  test('テストケース 1-1-1: Issue タイトル取得成功時、PR タイトルが Issue タイトルと一致する', async () => {
    // Given: Issue #73 が存在し、タイトルが「自動生成のPRの内容を最適化したい」である
    const mockIssue = {
      title: '自動生成のPRの内容を最適化したい',
      number: 73,
      state: 'open',
      body: '...',
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 73);

    // Then: PR タイトルが Issue タイトルと一致する
    expect(prTitle).toBe('自動生成のPRの内容を最適化したい');
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      'Using Issue title as PR title: 自動生成のPRの内容を最適化したい',
    );
  });

  test('テストケース 1-1-2: プレフィックスが含まれない Issue タイトルの場合', async () => {
    // Given: Issue #51 が存在し、タイトルに[AI-Workflow]プレフィックスがない
    const mockIssue = {
      title: '機能追加: 環境変数アクセスを一元化する設定管理を追加',
      number: 51,
      state: 'open',
      body: '...',
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 51);

    // Then: PR タイトルに[AI-Workflow]プレフィックスは追加されない
    expect(prTitle).toBe('機能追加: 環境変数アクセスを一元化する設定管理を追加');
    expect(prTitle).not.toContain('[AI-Workflow]');
  });
});

// =============================================================================
// 1.2. エラーハンドリング - 異常系
// =============================================================================

describe('エラーハンドリング - 異常系', () => {
  let githubClient: GitHubClient;
  let loggerWarnSpy: jest.SpiedFunction<typeof logger.warn>;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  test('テストケース 1-2-1: Issue 取得失敗時（404 Not Found）、フォールバック動作', async () => {
    // Given: Issue #999 が存在しない（404 Not Found）
    jest.spyOn(githubClient, 'getIssue').mockRejectedValue(new Error('Not Found'));

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 999);

    // Then: デフォルトタイトルにフォールバックする
    expect(prTitle).toBe('[AI-Workflow] Issue #999');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found',
    );
  });

  test('テストケース 1-2-2: GitHub API レート制限エラー時（403 Rate Limit Exceeded）、フォールバック動作', async () => {
    // Given: GitHub API のレート制限に達している
    jest
      .spyOn(githubClient, 'getIssue')
      .mockRejectedValue(new Error('API rate limit exceeded'));

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 73);

    // Then: デフォルトタイトルにフォールバックする
    expect(prTitle).toBe('[AI-Workflow] Issue #73');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #73. Error: API rate limit exceeded',
    );
  });

  test('テストケース 1-2-3: ネットワークエラー時、フォールバック動作', async () => {
    // Given: ネットワークエラーが発生
    jest.spyOn(githubClient, 'getIssue').mockRejectedValue(new Error('Network error'));

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 73);

    // Then: デフォルトタイトルにフォールバックする
    expect(prTitle).toBe('[AI-Workflow] Issue #73');
    expect(loggerWarnSpy).toHaveBeenCalled();
  });
});

// =============================================================================
// 1.3. タイトル切り詰め - 境界値テスト
// =============================================================================

describe('タイトル切り詰め - 境界値テスト', () => {
  let githubClient: GitHubClient;
  let loggerInfoSpy: jest.SpiedFunction<typeof logger.info>;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  test('テストケース 1-3-1: 短いタイトル（256文字未満）は切り詰めない', async () => {
    // Given: 50文字のタイトル
    const mockIssue = {
      title: '短いタイトル（50文字）',
      number: 100,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 100);

    // Then: 切り詰めずにそのまま使用される
    expect(prTitle).toBe('短いタイトル（50文字）');
    expect(loggerInfoSpy).not.toHaveBeenCalledWith('Truncating PR title to 256 characters');
  });

  test('テストケース 1-3-2: ちょうど256文字のタイトルは切り詰めない', async () => {
    // Given: ちょうど256文字のタイトル
    const mockIssue = {
      title: 'a'.repeat(256),
      number: 101,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 101);

    // Then: 切り詰めずにそのまま使用される
    expect(prTitle).toBe('a'.repeat(256));
    expect(prTitle.length).toBe(256);
    expect(loggerInfoSpy).not.toHaveBeenCalledWith('Truncating PR title to 256 characters');
  });

  test('テストケース 1-3-3: 257文字のタイトルは切り詰められる', async () => {
    // Given: 257文字のタイトル
    const mockIssue = {
      title: 'a'.repeat(257),
      number: 102,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 102);

    // Then: 256文字（253文字 + "..."）に切り詰められる
    expect(prTitle).toBe('a'.repeat(253) + '...');
    expect(prTitle.length).toBe(256);
    expect(prTitle.endsWith('...')).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Truncating PR title to 256 characters');
  });

  test('テストケース 1-3-4: 300文字のタイトルは切り詰められる', async () => {
    // Given: 300文字のタイトル
    const mockIssue = {
      title: 'a'.repeat(300),
      number: 103,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 103);

    // Then: 256文字に切り詰められる
    expect(prTitle.length).toBe(256);
    expect(prTitle.endsWith('...')).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Truncating PR title to 256 characters');
  });
});

// =============================================================================
// 1.4. 特殊文字を含むタイトル - セキュリティテスト
// =============================================================================

describe('特殊文字を含むタイトル - セキュリティテスト', () => {
  let githubClient: GitHubClient;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  test('テストケース 1-4-1: 特殊文字（<, >, &, "）を含むタイトル', async () => {
    // Given: 特殊文字を含むタイトル
    const mockIssue = {
      title: '機能追加: <script>alert(\'XSS\')</script> & "test"',
      number: 104,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 104);

    // Then: 特殊文字がそのまま含まれる（GitHub側でエスケープされる）
    expect(prTitle).toBe('機能追加: <script>alert(\'XSS\')</script> & "test"');
  });

  test('テストケース 1-4-2: 絵文字を含むタイトル', async () => {
    // Given: 絵文字を含むタイトル
    const mockIssue = {
      title: '🚀 機能追加: AI Workflow最適化',
      number: 105,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    const prTitle = await generatePrTitle(githubClient, 105);

    // Then: 絵文字がそのまま含まれる
    expect(prTitle).toBe('🚀 機能追加: AI Workflow最適化');
  });
});

// =============================================================================
// 1.5. デバッグログ出力 - ログテスト
// =============================================================================

describe('デバッグログ出力 - ログテスト', () => {
  let githubClient: GitHubClient;
  let loggerInfoSpy: jest.SpiedFunction<typeof logger.info>;
  let loggerWarnSpy: jest.SpiedFunction<typeof logger.warn>;

  beforeEach(() => {
    githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');
    loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  test('テストケース 1-5-1: Issue タイトル取得成功時、情報ログが出力される', async () => {
    // Given: Issue #73 が存在する
    const mockIssue = {
      title: '自動生成のPRの内容を最適化したい',
      number: 73,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    await generatePrTitle(githubClient, 73);

    // Then: info レベルのログが出力される
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      'Using Issue title as PR title: 自動生成のPRの内容を最適化したい',
    );
  });

  test('テストケース 1-5-2: Issue タイトル取得失敗時、警告ログが出力される', async () => {
    // Given: Issue #999 が存在しない
    jest.spyOn(githubClient, 'getIssue').mockRejectedValue(new Error('Not Found'));

    // When: PR タイトルを生成
    await generatePrTitle(githubClient, 999);

    // Then: warn レベルのログが出力される
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch Issue title, falling back to default PR title: [AI-Workflow] Issue #999. Error: Not Found',
    );
  });

  test('テストケース 1-5-3: 長いタイトル切り詰め時、情報ログが出力される', async () => {
    // Given: 300文字のタイトル
    const mockIssue = {
      title: 'a'.repeat(300),
      number: 100,
    };
    jest.spyOn(githubClient, 'getIssue').mockResolvedValue(mockIssue as any);

    // When: PR タイトルを生成
    await generatePrTitle(githubClient, 100);

    // Then: 切り詰めログと使用ログの両方が出力される
    expect(loggerInfoSpy).toHaveBeenCalledWith('Truncating PR title to 256 characters');
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Issue title as PR title:'),
    );
  });
});

// =============================================================================
// 1.6. PR テンプレート最適化 - テンプレートテスト
// =============================================================================

describe('PR テンプレート最適化 - テンプレートテスト', () => {
  test('テストケース 1-6-1: pr_body_template.md から不要セクションが削除されている', () => {
    // Given: テンプレートファイルを読み込む
    const templatePath = 'src/templates/pr_body_template.md';
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // Then: 不要セクションが存在しない
    expect(templateContent).not.toContain('### 👀 レビューポイント');
    expect(templateContent).not.toContain('### ⚙️ 実行環境');

    // Then: 必要セクションが存在する
    expect(templateContent).toContain('### 📋 関連Issue');
    expect(templateContent).toContain('### 🔄 ワークフロー進捗');
    expect(templateContent).toContain('### 📁 成果物');
  });

  test('テストケース 1-6-2: pr_body_detailed_template.md から不要セクションが削除されている', () => {
    // Given: テンプレートファイルを読み込む
    const templatePath = 'src/templates/pr_body_detailed_template.md';
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // Then: 不要セクションが存在しない
    expect(templateContent).not.toContain('### 👀 レビューポイント');
    expect(templateContent).not.toContain('### ⚙️ 実行環境');

    // Then: 必要セクションが存在する
    expect(templateContent).toContain('### 📋 関連Issue');
    expect(templateContent).toContain('### 📝 変更サマリー');
  });

  test('テストケース 1-6-3: generatePrBodyTemplate() メソッドが正しくテンプレートを読み込む', () => {
    // Given: GitHub クライアントを初期化
    const githubClient = new GitHubClient('dummy_token', 'tielec/ai-workflow-agent');

    // When: テンプレートを生成
    const prBody = githubClient.generatePrBodyTemplate(73, 'ai-workflow/issue-73');

    // Then: プレースホルダーが正しく置換される
    expect(prBody).toContain('Closes #73');
    expect(prBody).toContain('`.ai-workflow/issue-73/`');

    // Then: 不要セクションが含まれていない
    expect(prBody).not.toContain('### 👀 レビューポイント');
    expect(prBody).not.toContain('### ⚙️ 実行環境');
  });
});
