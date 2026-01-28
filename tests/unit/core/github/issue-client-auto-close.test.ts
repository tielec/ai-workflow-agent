/**
 * ユニットテスト: IssueClient (auto-close-issue 拡張部)
 *
 * テスト対象: src/core/github/issue-client.ts
 * テストシナリオ: test-scenario.md の TC-GH-001 〜 TC-GH-009 を中心にカバー
 */

import { jest } from '@jest/globals';
import { IssueClient } from '../../../../src/core/github/issue-client.js';
import { RequestError } from '@octokit/request-error';

const createOctokit = (overrides?: Partial<any>) => {
  const issues = {
    listForRepo: jest.fn(),
    createComment: jest.fn(),
    update: jest.fn(),
    addLabels: jest.fn(),
  };
  return {
    issues,
    paginate: jest.fn(),
    ...overrides,
  } as any;
};

describe('IssueClient#listOpenIssues', () => {
  it('オープンIssueを取得しPRを除外する (TC-GH-001)', async () => {
    const octokit = createOctokit();
    octokit.paginate.mockResolvedValue([
      { number: 1, title: 'issue', updated_at: '2024-01-01', created_at: '2024-01-01' },
      { number: 2, title: 'pr', pull_request: {}, updated_at: '2024-01-01' },
    ]);
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const issues = await client.listOpenIssues();

    expect(issues).toHaveLength(1);
    expect(octokit.paginate).toHaveBeenCalledWith(octokit.issues.listForRepo, {
      owner: 'owner',
      repo: 'repo',
      state: 'open',
      per_page: 100,
      labels: undefined,
      since: undefined,
    });
  });

  it('GitHub API エラーをそのまま投げる (TC-GH-003)', async () => {
    const request = { method: 'GET', url: 'https://api.github.com', headers: {} };
    const response = { status: 403, url: '', headers: {}, data: {} };
    const octokit = createOctokit();
    octokit.paginate.mockRejectedValue(new RequestError('rate limited', 403, { request, response }));
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    await expect(client.listOpenIssues()).rejects.toBeInstanceOf(RequestError);
  });

  it('100件超のページング結果をすべて返す (TC-GH-002)', async () => {
    const octokit = createOctokit();
    const issues = Array.from({ length: 150 }, (_v, i) => ({
      number: i + 1,
      title: `issue-${i + 1}`,
      updated_at: '2024-01-01',
      created_at: '2024-01-01',
    }));
    octokit.paginate.mockResolvedValue([...issues, { number: 999, pull_request: {} }]);
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.listOpenIssues();

    expect(result).toHaveLength(150);
    expect(octokit.paginate).toHaveBeenCalledWith(octokit.issues.listForRepo, {
      owner: 'owner',
      repo: 'repo',
      state: 'open',
      per_page: 100,
      labels: undefined,
      since: undefined,
    });
  });
});

describe('IssueClient#closeIssue', () => {
  it('コメント付きでクローズする (TC-GH-004)', async () => {
    const octokit = createOctokit();
    octokit.issues.createComment.mockResolvedValue({});
    octokit.issues.update.mockResolvedValue({});
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.closeIssue(100, 'クローズ理由');

    expect(result.success).toBe(true);
    expect(octokit.issues.createComment).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 100,
      body: 'クローズ理由',
    });
    expect(octokit.issues.update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 100,
      state: 'closed',
    });
  });

  it('コメントなしでクローズする (TC-GH-005)', async () => {
    const octokit = createOctokit();
    octokit.issues.update.mockResolvedValue({});
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    await client.closeIssue(101);

    expect(octokit.issues.createComment).not.toHaveBeenCalled();
    expect(octokit.issues.update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 101,
      state: 'closed',
    });
  });

  it('API エラー時は success:false を返す (TC-GH-006)', async () => {
    const octokit = createOctokit();
    octokit.issues.createComment.mockRejectedValue(new Error('failure'));
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.closeIssue(102, 'test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('failure');
  });
});

describe('IssueClient#addLabels', () => {
  it('単一ラベルを追加する (TC-GH-007)', async () => {
    const octokit = createOctokit();
    octokit.issues.addLabels.mockResolvedValue({});
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.addLabels(200, ['auto-closed']);

    expect(result.success).toBe(true);
    expect(octokit.issues.addLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 200,
      labels: ['auto-closed'],
    });
  });

  it('複数ラベルを追加する (TC-GH-008)', async () => {
    const octokit = createOctokit();
    octokit.issues.addLabels.mockResolvedValue({});
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.addLabels(200, ['auto-closed', 'verified']);

    expect(result.success).toBe(true);
    expect(octokit.issues.addLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 200,
      labels: ['auto-closed', 'verified'],
    });
  });

  it('API エラー時は success:false を返す (TC-GH-009)', async () => {
    const octokit = createOctokit();
    octokit.issues.addLabels.mockRejectedValue(new Error('rate limit'));
    const client = new IssueClient(octokit as any, 'owner', 'repo');

    const result = await client.addLabels(201, ['test']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('rate limit');
  });
});
