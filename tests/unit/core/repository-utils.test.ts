/**
 * ユニットテスト: repository-utils モジュール
 *
 * テスト対象:
 * - parseIssueUrl(): Issue URL解析
 * - resolveLocalRepoPath(): ローカルリポジトリパス解決
 * - findWorkflowMetadata(): ワークフローメタデータ探索
 * - getRepoRoot(): リポジトリルート取得
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect } from '@jest/globals';
import {
  parseIssueUrl,
  resolveLocalRepoPath,
  findWorkflowMetadata,
  getRepoRoot,
} from '../../../src/core/repository-utils.js';

// =============================================================================
// parseIssueUrl() のテスト
// =============================================================================

describe('parseIssueUrl', () => {
  describe('正常系: 標準的なGitHub Issue URL', () => {
    test('標準的なIssue URLを正しく解析できる', () => {
      // Given: 標準的なGitHub Issue URL
      const issueUrl = 'https://github.com/tielec/ai-workflow-agent/issues/22';

      // When: Issue URLを解析
      const result = parseIssueUrl(issueUrl);

      // Then: 正しくリポジトリ情報が抽出される
      expect(result.owner).toBe('tielec');
      expect(result.repo).toBe('ai-workflow-agent');
      expect(result.issueNumber).toBe(22);
      expect(result.repositoryName).toBe('tielec/ai-workflow-agent');
    });

    test('HTTPSなしのURLでも正しく解析できる', () => {
      // Given: https:// プロトコルなしのURL
      const issueUrl = 'github.com/tielec/ai-workflow-agent/issues/123';

      // When: Issue URLを解析
      const result = parseIssueUrl(issueUrl);

      // Then: 正しくリポジトリ情報が抽出される
      expect(result.owner).toBe('tielec');
      expect(result.repo).toBe('ai-workflow-agent');
      expect(result.issueNumber).toBe(123);
      expect(result.repositoryName).toBe('tielec/ai-workflow-agent');
    });

    test('末尾スラッシュ付きURLを正しく解析できる', () => {
      // Given: 末尾にスラッシュが付いたURL
      const issueUrl = 'https://github.com/tielec/ai-workflow-agent/issues/456/';

      // When: Issue URLを解析
      const result = parseIssueUrl(issueUrl);

      // Then: 正しくリポジトリ情報が抽出される
      expect(result.owner).toBe('tielec');
      expect(result.repo).toBe('ai-workflow-agent');
      expect(result.issueNumber).toBe(456);
      expect(result.repositoryName).toBe('tielec/ai-workflow-agent');
    });
  });

  describe('境界値テスト', () => {
    test('Issue番号が1（最小値）でも正しく解析できる', () => {
      // Given: Issue番号が最小値（1）のURL
      const issueUrl = 'https://github.com/tielec/ai-workflow-agent/issues/1';

      // When: Issue URLを解析
      const result = parseIssueUrl(issueUrl);

      // Then: 正しくIssue番号が抽出される
      expect(result.issueNumber).toBe(1);
    });

    test('Issue番号が大きい値でも正しく解析できる', () => {
      // Given: Issue番号が大きい値のURL
      const issueUrl = 'https://github.com/tielec/ai-workflow-agent/issues/999999';

      // When: Issue URLを解析
      const result = parseIssueUrl(issueUrl);

      // Then: 正しくIssue番号が抽出される
      expect(result.issueNumber).toBe(999999);
    });
  });

  describe('異常系: 不正なURL', () => {
    test('不正なURLでエラーがスローされる', () => {
      // Given: 不正なURL
      const issueUrl = 'https://example.com/invalid';

      // When & Then: エラーがスローされる
      expect(() => {
        parseIssueUrl(issueUrl);
      }).toThrow(/Invalid GitHub Issue URL/);
    });

    test('Issue番号が含まれないURLでエラーがスローされる', () => {
      // Given: Issue番号が含まれないURL
      const issueUrl = 'https://github.com/tielec/ai-workflow-agent';

      // When & Then: エラーがスローされる
      expect(() => {
        parseIssueUrl(issueUrl);
      }).toThrow(/Invalid GitHub Issue URL/);
    });

    test('空文字列でエラーがスローされる', () => {
      // Given: 空文字列
      const issueUrl = '';

      // When & Then: エラーがスローされる
      expect(() => {
        parseIssueUrl(issueUrl);
      }).toThrow(/Invalid GitHub Issue URL/);
    });

    test('GitLabのURLでエラーがスローされる', () => {
      // Given: GitLabのURL
      const issueUrl = 'https://gitlab.com/user/repo/issues/123';

      // When & Then: エラーがスローされる
      expect(() => {
        parseIssueUrl(issueUrl);
      }).toThrow(/Invalid GitHub Issue URL/);
    });
  });
});

// =============================================================================
// resolveLocalRepoPath() のテスト
// =============================================================================

describe('resolveLocalRepoPath', () => {
  describe('異常系: リポジトリ不在', () => {
    test('存在しないリポジトリ名でエラーがスローされる', () => {
      // Given: 存在しないリポジトリ名
      const repoName = 'non-existent-repo-12345';

      // When & Then: エラーがスローされる
      expect(() => {
        resolveLocalRepoPath(repoName);
      }).toThrow(/Repository.*not found/);
    });

    test('エラーメッセージにREPOS_ROOT設定の提案が含まれる', () => {
      // Given: 存在しないリポジトリ名
      const repoName = 'non-existent-repo-12345';

      // When & Then: エラーメッセージにREPOS_ROOT設定の提案が含まれる
      expect(() => {
        resolveLocalRepoPath(repoName);
      }).toThrow(/REPOS_ROOT/);
    });
  });
});

// =============================================================================
// findWorkflowMetadata() のテスト
// =============================================================================

describe('findWorkflowMetadata', () => {
  describe('異常系: メタデータ不在', () => {
    test('存在しないIssue番号でエラーがスローされる', async () => {
      // Given: 存在しないIssue番号
      const issueNumber = '999999';

      // When & Then: エラーがスローされる
      await expect(async () => {
        await findWorkflowMetadata(issueNumber);
      }).rejects.toThrow(/Workflow not found/);
    });
  });
});

// =============================================================================
// getRepoRoot() のテスト
// =============================================================================

describe('getRepoRoot', () => {
  describe('正常系: Gitリポジトリ内', () => {
    test('Gitリポジトリのルートパスが取得できる', async () => {
      // Given: カレントディレクトリがGitリポジトリ内

      // When: リポジトリルートパスを取得
      const result = await getRepoRoot();

      // Then: リポジトリルートパス（絶対パス）が返される
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 統合的な動作確認（パラメトリックテスト）
// =============================================================================

describe('parseIssueUrl - パラメトリックテスト', () => {
  const validTestCases = [
    {
      url: 'https://github.com/owner1/repo1/issues/1',
      expected: { owner: 'owner1', repo: 'repo1', issueNumber: 1 },
    },
    {
      url: 'https://github.com/owner2/repo2/issues/999',
      expected: { owner: 'owner2', repo: 'repo2', issueNumber: 999 },
    },
    {
      url: 'github.com/owner3/repo3/issues/123',
      expected: { owner: 'owner3', repo: 'repo3', issueNumber: 123 },
    },
  ];

  test.each(validTestCases)(
    '有効なURL $url を正しく解析できる',
    ({ url, expected }) => {
      // When: Issue URLを解析
      const result = parseIssueUrl(url);

      // Then: 期待通りの結果が返される
      expect(result.owner).toBe(expected.owner);
      expect(result.repo).toBe(expected.repo);
      expect(result.issueNumber).toBe(expected.issueNumber);
      expect(result.repositoryName).toBe(`${expected.owner}/${expected.repo}`);
    }
  );

  const invalidTestCases = [
    'https://example.com/invalid',
    'https://github.com/user/issues/123',
    'https://github.com/user/repo/issues/',
    '',
    'not-a-url',
  ];

  test.each(invalidTestCases)('不正なURL "%s" でエラーがスローされる', (url) => {
    // When & Then: エラーがスローされる
    expect(() => {
      parseIssueUrl(url);
    }).toThrow(/Invalid GitHub Issue URL/);
  });
});
