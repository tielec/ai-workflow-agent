import { jest } from '@jest/globals';
import { Octokit } from '@octokit/rest';
import type { MockedFunction } from 'jest-mock';

type Method<T> = T extends (...args: any[]) => any ? T : never;

type IssuesApiMock = {
  get: MockedFunction<Method<Octokit['issues']['get']>>;
  listComments: MockedFunction<Method<Octokit['issues']['listComments']>>;
  createComment: MockedFunction<Method<Octokit['issues']['createComment']>>;
  updateComment: MockedFunction<Method<Octokit['issues']['updateComment']>>;
  update: MockedFunction<Method<Octokit['issues']['update']>>;
  create: MockedFunction<Method<Octokit['issues']['create']>>;
};

type PullsApiMock = {
  create: MockedFunction<Method<Octokit['pulls']['create']>>;
  list: MockedFunction<Method<Octokit['pulls']['list']>>;
  update: MockedFunction<Method<Octokit['pulls']['update']>>;
};

type SearchApiMock = {
  issuesAndPullRequests: MockedFunction<Method<Octokit['search']['issuesAndPullRequests']>>;
};

type ReposApiMock = {
  createOrUpdateFileContents: MockedFunction<Method<Octokit['repos']['createOrUpdateFileContents']>>;
};

export interface MockOctokitApis {
  issues?: Partial<IssuesApiMock>;
  pulls?: Partial<PullsApiMock>;
  search?: Partial<SearchApiMock>;
  repos?: Partial<ReposApiMock>;
}

export interface MockOctokit {
  client: Octokit;
  issues: IssuesApiMock;
  pulls: PullsApiMock;
  search: SearchApiMock;
  repos: ReposApiMock;
}

const createFunctionMock = <T extends (...args: any[]) => any>() =>
  jest.fn<T>() as unknown as MockedFunction<T>;

export function createMockOctokit(overrides?: MockOctokitApis): MockOctokit {
  const issues: IssuesApiMock = {
    get: createFunctionMock<Method<Octokit['issues']['get']>>(),
    listComments: createFunctionMock<Method<Octokit['issues']['listComments']>>(),
    createComment: createFunctionMock<Method<Octokit['issues']['createComment']>>(),
    updateComment: createFunctionMock<Method<Octokit['issues']['updateComment']>>(),
    update: createFunctionMock<Method<Octokit['issues']['update']>>(),
    create: createFunctionMock<Method<Octokit['issues']['create']>>(),
    ...overrides?.issues,
  };

  const pulls: PullsApiMock = {
    create: createFunctionMock<Method<Octokit['pulls']['create']>>(),
    list: createFunctionMock<Method<Octokit['pulls']['list']>>(),
    update: createFunctionMock<Method<Octokit['pulls']['update']>>(),
    ...overrides?.pulls,
  };

  const search: SearchApiMock = {
    issuesAndPullRequests: createFunctionMock<Method<Octokit['search']['issuesAndPullRequests']>>(),
    ...overrides?.search,
  };

  const repos: ReposApiMock = {
    createOrUpdateFileContents: createFunctionMock<
      Method<Octokit['repos']['createOrUpdateFileContents']>
    >(),
    ...overrides?.repos,
  };

  return {
    client: { issues, pulls, search, repos } as unknown as Octokit,
    issues,
    pulls,
    search,
    repos,
  };
}
