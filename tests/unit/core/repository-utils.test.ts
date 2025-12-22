/**
 * ユニットテスト: repository-utils モジュール
 *
 * テスト対象:
 * - parseIssueUrl(): Issue URL解析
 * - parsePullRequestUrl(): PR URL解析
 * - resolveRepoPathFromPrUrl(): PR URLからローカルパス解決
 * - resolveLocalRepoPath(): ローカルリポジトリパス解決
 * - findWorkflowMetadata(): ワークフローメタデータ探索
 * - getRepoRoot(): リポジトリルート取得
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals';
import path from 'node:path';
import process from 'node:process';
import * as fs from 'node:fs';
import {
  parseIssueUrl,
  parsePullRequestUrl,
  resolveRepoPathFromPrUrl,
  resolveLocalRepoPath,
  findWorkflowMetadata,
  getRepoRoot,
} from '../../../src/core/repository-utils.js';
import { config } from '../../../src/core/config.js';
jest.mock('node:fs', () => ({
  __esModule: true,
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  lstatSync: jest.fn(),
}));

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
// parsePullRequestUrl() のテスト
// =============================================================================

describe('parsePullRequestUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('正常系: PR URL解析', () => {
    const validPrUrls = [
      {
        url: 'https://github.com/owner/repo/pull/123',
        expected: { owner: 'owner', repo: 'repo', prNumber: 123, repositoryName: 'owner/repo' },
      },
      {
        url: 'https://github.com/owner/repo/pull/456/',
        expected: { owner: 'owner', repo: 'repo', prNumber: 456, repositoryName: 'owner/repo' },
      },
      {
        url: 'github.com/owner/repo/pull/789',
        expected: { owner: 'owner', repo: 'repo', prNumber: 789, repositoryName: 'owner/repo' },
      },
      {
        url: 'https://github.com/my-org/my-repo/pull/100',
        expected: {
          owner: 'my-org',
          repo: 'my-repo',
          prNumber: 100,
          repositoryName: 'my-org/my-repo',
        },
      },
      {
        url: 'http://github.com/owner/repo/pull/101',
        expected: { owner: 'owner', repo: 'repo', prNumber: 101, repositoryName: 'owner/repo' },
      },
      {
        url: 'https://github.com/org_name/repo_name/pull/300',
        expected: {
          owner: 'org_name',
          repo: 'repo_name',
          prNumber: 300,
          repositoryName: 'org_name/repo_name',
        },
      },
    ];

    test.each(validPrUrls)('PR URLを正しく解析できる: %s', ({ url, expected }) => {
      // Given: Phase3の正常系PR URL
      const prUrl = url;

      // When: PR URLを解析
      const result = parsePullRequestUrl(prUrl);

      // Then: owner/repo/PR番号が期待通りに抽出される
      expect(result).toEqual(expected);
    });
  });

  describe('境界値: PR番号・リポジトリ名', () => {
    const boundaryPrUrls = [
      {
        url: 'https://github.com/owner/repo/pull/1',
        expected: { prNumber: 1 },
        description: 'PR番号最小値',
      },
      {
        url: 'https://github.com/owner/repo/pull/999999',
        expected: { prNumber: 999999 },
        description: 'PR番号大きい値',
      },
      {
        url: 'https://github.com/o/r/pull/1',
        expected: { owner: 'o', repo: 'r' },
        description: '1文字のオーナー名・リポジトリ名',
      },
    ];

    test.each(boundaryPrUrls)('境界値でも解析できる: %s', ({ url, expected }) => {
      // Given: 境界値となるPR URL
      const prUrl = url;

      // When: PR URLを解析
      const result = parsePullRequestUrl(prUrl);

      // Then: 指定項目が期待通りに抽出される
      expect(result).toMatchObject(expected);
      expect(result.repositoryName).toBeDefined();
    });
  });

  describe('異常系: 不正なURL', () => {
    const invalidPrUrls = [
      { url: '', description: '空文字列' },
      { url: 'https://github.com/owner/repo/issues/123', description: 'Issue URL' },
      { url: 'https://gitlab.com/owner/repo/pull/123', description: '別ドメイン' },
      { url: 'https://github.com/owner/repo/pull/', description: 'PR番号なし' },
      { url: 'https://github.com/owner/repo/pull/abc', description: 'PR番号が文字列' },
      { url: 'https://github.com/owner', description: '不完全なURL' },
      { url: 'not-a-url', description: '無効な形式' },
    ];

    test.each(invalidPrUrls)('不正URLはエラーになる: %s', ({ url }) => {
      // Given: Phase3で想定される不正PR URL
      const prUrl = url;

      // When & Then: 例外がスローされる
      expect(() => parsePullRequestUrl(prUrl)).toThrow(/Invalid GitHub Pull Request URL/);
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
// resolveRepoPathFromPrUrl() のテスト
// =============================================================================

describe('resolveRepoPathFromPrUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('REPOS_ROOTが設定されている場合は優先的に使用する', () => {
    // Given
    const repoName = 'my-app';
    const prUrl = `https://github.com/owner/${repoName}/pull/42`;
    jest.spyOn(config, 'getReposRoot').mockReturnValue('/repos');
    jest.spyOn(config, 'getHomeDir').mockReturnValue('/home/user');
    jest.spyOn(process, 'cwd').mockReturnValue('/workspace/ai-workflow-agent');

    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((targetPath: string) => {
      const normalized = path.resolve(targetPath);
      return (
        normalized === path.resolve('/repos/my-app') ||
        normalized === path.resolve('/repos/my-app/.git')
      );
    });

    // When
    const repoPath = resolveRepoPathFromPrUrl(prUrl);

    // Then
    expect(repoPath).toBe(path.resolve('/repos/my-app'));
    expect(existsSpy).toHaveBeenCalledWith(path.resolve('/repos/my-app'));
    expect(existsSpy).toHaveBeenCalledWith(path.resolve('/repos/my-app/.git'));
  });

  test('REPOS_ROOT未設定時はフォールバックパスを探索する', () => {
    // Given
    const repoName = 'fallback-repo';
    const prUrl = `https://github.com/owner/${repoName}/pull/1`;
    jest.spyOn(config, 'getReposRoot').mockReturnValue(null);
    jest.spyOn(config, 'getHomeDir').mockReturnValue('/home/tester');
    jest.spyOn(process, 'cwd').mockReturnValue('/workspace/ai-workflow-agent');

    jest.spyOn(fs, 'existsSync').mockImplementation((targetPath: string) => {
      const normalized = path.resolve(targetPath);
      return (
        normalized === path.resolve('/home/tester/TIELEC/development/fallback-repo') ||
        normalized === path.resolve('/home/tester/TIELEC/development/fallback-repo/.git')
      );
    });

    // When
    const repoPath = resolveRepoPathFromPrUrl(prUrl);

    // Then
    expect(repoPath).toBe(path.resolve('/home/tester/TIELEC/development/fallback-repo'));
  });

  test('すべての候補で見つからない場合はエラーを投げる', () => {
    // Given
    const prUrl = 'https://github.com/owner/missing-repo/pull/99';
    jest.spyOn(config, 'getReposRoot').mockReturnValue('/repos');
    jest.spyOn(config, 'getHomeDir').mockReturnValue('/home/tester');
    jest.spyOn(process, 'cwd').mockReturnValue('/workspace/ai-workflow-agent');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    // When & Then
    expect(() => resolveRepoPathFromPrUrl(prUrl)).toThrow(
      /Repository 'missing-repo' not found[\s\S]*REPOS_ROOT/,
    );
  });

  test('不正なPR URLの場合は入力検証エラーをそのまま返す', () => {
    // Given
    const invalidPrUrl = 'https://invalid-url';

    // When & Then
    expect(() => resolveRepoPathFromPrUrl(invalidPrUrl)).toThrow(
      /Invalid GitHub Pull Request URL/,
    );
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
