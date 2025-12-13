import { jest } from '@jest/globals';

const defaultFn = <T>(value: T) => jest.fn<() => T>().mockReturnValue(value);

export const config = {
  getGitHubToken: defaultFn('test-token'),
  getGitHubRepository: defaultFn('owner/repo'),
  getHomeDir: defaultFn('/home/test'),
  getReposRoot: defaultFn(null),
  getLogLevel: defaultFn('info'),
  getLogNoColor: defaultFn(false),
  getOpenAiApiKey: defaultFn('test-openai-api-key'),
  getClaudeCodeApiKey: defaultFn('test-claude-api-key'),
  getClaudeOAuthToken: defaultFn('test-claude-oauth'),
  getClaudeCodeToken: defaultFn('test-claude-token'),
  getClaudeDangerouslySkipPermissions: defaultFn(false),
  getFollowupLlmMode: defaultFn(null),
  getFollowupLlmModel: defaultFn(null),
  getFollowupLlmTimeoutMs: defaultFn(null),
  getFollowupLlmMaxRetries: defaultFn(null),
  getFollowupLlmAppendMetadata: defaultFn(null),
  getFollowupLlmTemperature: defaultFn(null),
  getFollowupLlmMaxOutputTokens: defaultFn(null),
  getFollowupLlmMaxTasks: defaultFn(null),
  isCI: defaultFn(false),
};

export const Config = jest.fn().mockImplementation(() => config);
