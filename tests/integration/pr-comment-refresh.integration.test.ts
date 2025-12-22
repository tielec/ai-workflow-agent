import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { PRCommentMetadataManager } from '../../src/core/pr-comment/metadata-manager.js';
import type { ReviewComment } from '../../src/types/pr-comment.js';
import { logger } from '../../src/utils/logger.js';

let refreshComments: typeof import('../../src/commands/pr-comment/analyze.js').__testables.refreshComments;

const graphqlThreads: any[] = [];
const restComments: any[] = [];
let tmpDir: string;

const prInfo = {
  number: 123,
  url: 'https://github.com/owner/repo/pull/123',
  title: 'Integration PR',
  branch: 'feature/add-refresh',
  base_branch: 'main',
  state: 'open' as const,
};

const repoInfo = {
  owner: 'owner',
  repo: 'repo',
  path: '',
  remote_url: 'https://github.com/owner/repo.git',
};

beforeAll(async () => {
  await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        getUnresolvedPRReviewComments: jest.fn(async () => graphqlThreads),
        getPRReviewComments: jest.fn(async () => restComments),
      },
    })),
  }));

  const analyzeModule = await import('../../src/commands/pr-comment/analyze.js');
  refreshComments = analyzeModule.__testables.refreshComments;
});

beforeEach(async () => {
  graphqlThreads.length = 0;
  restComments.length = 0;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-comment-refresh-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('pr-comment refresh integration', () => {
  it('detects and persists comments added after init', async () => {
    const metadataManager = new PRCommentMetadataManager(tmpDir, prInfo.number);
    const initialComments: ReviewComment[] = [
      {
        id: 100,
        node_id: 'node-100',
        path: 'src/app.ts',
        line: 5,
        body: 'Initial comment',
        user: 'alice',
        created_at: '2025-01-21T00:00:00Z',
        updated_at: '2025-01-21T00:00:00Z',
        diff_hunk: '@@ -1,1 +1,1 @@',
      },
    ];
    await metadataManager.initialize({ ...prInfo, state: 'open' }, { ...repoInfo, path: tmpDir }, initialComments);
    graphqlThreads.push({
      id: 'thread-1',
      comments: {
        nodes: [
          { id: 'node-100', databaseId: 100, body: 'Initial comment', author: { login: 'alice' } },
          {
            id: 'node-200',
            databaseId: 200,
            body: 'New after init',
            path: 'src/app.ts',
            line: 10,
            startLine: 8,
            author: { login: 'bob' },
            createdAt: '2025-01-22T00:00:00Z',
            updatedAt: '2025-01-22T00:00:00Z',
          },
        ],
      },
    });
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);

    await refreshComments(prInfo.number, `${repoInfo.owner}/${repoInfo.repo}`, metadataManager);
    const metadata = await metadataManager.getMetadata();

    expect(Object.keys(metadata.comments)).toContain('200');
    expect(metadata.comments['200'].status).toBe('pending');
    expect(metadata.summary.total).toBe(2);
    expect(metadata.summary.by_status.pending).toBe(2);
    expect(infoSpy).toHaveBeenCalledWith('Found 1 new comment(s). Adding to metadata...');
  });

  it('falls back to REST API when GraphQL returns no unresolved threads', async () => {
    const metadataManager = new PRCommentMetadataManager(tmpDir, prInfo.number);
    await metadataManager.initialize({ ...prInfo, state: 'open' }, { ...repoInfo, path: tmpDir }, []);
    restComments.push({
      id: 300,
      node_id: 'node-300',
      path: 'src/rest.ts',
      line: 12,
      start_line: 10,
      body: 'From REST API',
      user: { login: 'rest-user' },
      created_at: '2025-01-22T01:00:00Z',
      updated_at: '2025-01-22T01:00:00Z',
      diff_hunk: '@@ -1,1 +1,1 @@',
    });
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);

    await refreshComments(prInfo.number, `${repoInfo.owner}/${repoInfo.repo}`, metadataManager);
    const metadata = await metadataManager.getMetadata();

    expect(Object.keys(metadata.comments)).toContain('300');
    expect(metadata.comments['300'].comment.user).toBe('rest-user');
    expect(metadata.summary.total).toBe(1);
    expect(debugSpy).toHaveBeenCalledWith('No unresolved threads from GraphQL, falling back to REST API');
  });
});
