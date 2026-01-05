import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GitHubClient } from '../../../src/core/github-client.js';
import { logger } from '../../../src/utils/logger.js';

const pullsGetMock = jest.fn();

function createClientWithMockedOctokit(): GitHubClient {
  const client = new GitHubClient('token', 'owner/repo');
  (client as any).octokit = {
    pulls: {
      get: pullsGetMock,
    },
  };
  return client;
}

describe('GitHubClient.getPullRequestBody()', () => {
  // Covers new facade helper that fetches PR bodies safely.
  beforeEach(() => {
    pullsGetMock.mockReset();
    jest.restoreAllMocks();
  });

  it('returns the PR body when present', async () => {
    pullsGetMock.mockResolvedValue({ data: { body: 'PR body content' } });
    const client = createClientWithMockedOctokit();

    const body = await client.getPullRequestBody(42);

    expect(pullsGetMock).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
    });
    expect(body).toBe('PR body content');
  });

  it('returns an empty string when the PR body is null', async () => {
    pullsGetMock.mockResolvedValue({ data: { body: null } });
    const client = createClientWithMockedOctokit();

    const body = await client.getPullRequestBody(7);

    expect(body).toBe('');
  });

  it('propagates errors when fetching the PR body fails', async () => {
    pullsGetMock.mockRejectedValue(new Error('Unauthorized'));
    const client = createClientWithMockedOctokit();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);

    await expect(client.getPullRequestBody(99)).rejects.toThrow('Unauthorized');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get pull request body: Unauthorized')
    );
  });
});
